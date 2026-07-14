'use client'

import { useMemo, useRef } from 'react'
import { useQueries } from '@tanstack/react-query'
import { formatUnits } from 'viem'
import { fetchBondingCurvePricesSince, fetchV3PricesSince } from '@coshi190/junoswap-sdk'
import { ponderClient, isPonderError } from '@/lib/ponder-client'
import { isLeaderboardSupportedChain } from '@/lib/leaderboard-utils'
import { isNativeToken } from '@/lib/wagmi'
import { INTERMEDIARY_TOKENS } from '@/lib/routing-config'
import { isStablecoin } from '@/hooks/useTokenPrices'
import { calculatePrice, calculatePriceFromSqrtPrice } from '@/services/launchpad/chart'
import {
    buildLedgerNetWorthSeries,
    type BalanceDelta,
    type LedgerToken,
    type PriceKind,
} from '@/services/portfolio/net-worth-ledger'
import {
    DAY_SECONDS,
    type NetWorthPoint,
    type PricePoint,
} from '@/services/portfolio/net-worth-history'
import type { UserSwapEvent } from '@/hooks/useUserSwapEvents'
import type { PortfolioToken, TokenType } from '@/types/portfolio'

const EMPTY_HISTORY: NetWorthPoint[] = []

async function fetchNativePricePoints(
    tokenAddr: string,
    chainId: number,
    tokenType: TokenType,
    since: number
): Promise<PricePoint[]> {
    try {
        if (tokenType === 'bonding_curve') {
            const rows = await fetchBondingCurvePricesSince(ponderClient, { tokenAddr, since })
            return rows.map((e) => ({
                timestamp: e.timestamp,
                price: calculatePrice({
                    timestamp: e.timestamp,
                    isBuy: e.isBuy === 1,
                    amountIn: 0n,
                    amountOut: 0n,
                    reserveIn: BigInt(e.reserveIn),
                    reserveOut: BigInt(e.reserveOut),
                }),
            }))
        }

        const rows = await fetchV3PricesSince(ponderClient, { tokenAddr, chainId, since })
        return rows.map((e) => ({
            timestamp: e.timestamp,
            price: calculatePriceFromSqrtPrice(BigInt(e.sqrtPriceX96), e.tokenIsToken0 === 1),
        }))
    } catch (e) {
        if (isPonderError(e)) return []
        throw e
    }
}

function classify(token: PortfolioToken['token'], chainId: number): PriceKind {
    if (isNativeToken(token.address)) return 'native'
    const wrapped = INTERMEDIARY_TOKENS[chainId]?.wrappedNative
    if (wrapped && token.address.toLowerCase() === wrapped.toLowerCase()) return 'native'
    if (isStablecoin(token)) return 'stable'
    return 'reconstructed'
}

interface UseNetWorthHistoryParams {
    address: `0x${string}` | undefined
    chainId: number
    portfolioTokens: PortfolioToken[]
    swapEvents: UserSwapEvent[] | undefined
    nativeUsdPoints: PricePoint[]
    nativeUsdPrice: number | null
    netWorthNow: number
    isInputLoading: boolean
}

export function useNetWorthHistory(params: UseNetWorthHistoryParams): NetWorthPoint[] {
    const { address, chainId, portfolioTokens, swapEvents, nativeUsdPoints, nativeUsdPrice } =
        params

    const supported = isLeaderboardSupportedChain(chainId)

    const nowSec = useMemo(() => Math.floor(Date.now() / 60_000) * 60, [])
    const windowStart = nowSec - DAY_SECONDS

    const classified = useMemo(
        () =>
            portfolioTokens.map((t) => ({
                pt: t,
                kind: classify(t.token, chainId),
            })),
        [portfolioTokens, chainId]
    )

    const reconstructable = useMemo(
        () => classified.filter((c) => c.kind === 'reconstructed'),
        [classified]
    )

    const priceQueries = useQueries({
        queries: reconstructable.map((c) => ({
            queryKey: [
                'nw-native-price',
                chainId,
                c.pt.token.address.toLowerCase(),
                c.pt.tokenType,
                windowStart,
            ],
            queryFn: () =>
                fetchNativePricePoints(
                    c.pt.token.address.toLowerCase(),
                    chainId,
                    c.pt.tokenType,
                    windowStart
                ),
            enabled: supported,
            staleTime: 60_000,
        })),
    })

    const arePricesLoading = supported && priceQueries.some((q) => q.data === undefined)

    const nativePriceByToken = useMemo(() => {
        const map = new Map<string, PricePoint[]>()
        reconstructable.forEach((c, i) => {
            map.set(c.pt.token.address.toLowerCase(), priceQueries[i]?.data ?? [])
        })
        return map
    }, [reconstructable, priceQueries])

    const { deltasByToken, nativeDeltas } = useMemo(() => {
        const byToken = new Map<string, UserSwapEvent[]>()
        const nativeLeg: BalanceDelta[] = []
        for (const e of swapEvents ?? []) {
            if (e.timestamp < windowStart || e.timestamp >= nowSec) continue
            const key = e.tokenAddr.toLowerCase()
            const list = byToken.get(key) ?? []
            list.push(e)
            byToken.set(key, list)
            const native = parseFloat(formatUnits(BigInt(e.isBuy ? e.amountIn : e.amountOut), 18))
            nativeLeg.push({ timestamp: e.timestamp, delta: e.isBuy ? -native : native })
        }
        const decoded = new Map<string, BalanceDelta[]>()
        for (const c of classified) {
            const key = c.pt.token.address.toLowerCase()
            const raw = byToken.get(key)
            if (!raw) continue
            const decimals = c.pt.token.decimals
            decoded.set(
                key,
                raw.map((e) => {
                    const tokenRaw = e.isBuy ? e.amountOut : e.amountIn
                    const tokens = parseFloat(formatUnits(BigInt(tokenRaw), decimals))
                    return { timestamp: e.timestamp, delta: e.isBuy ? tokens : -tokens }
                })
            )
        }
        return { deltasByToken: decoded, nativeDeltas: nativeLeg }
    }, [swapEvents, classified, windowStart, nowSec])

    const nativeTargetKey = useMemo(() => {
        const nativeCoin = classified.find((c) => isNativeToken(c.pt.token.address))
        const target = nativeCoin ?? classified.find((c) => c.kind === 'native')
        return target?.pt.token.address.toLowerCase() ?? null
    }, [classified])

    const isSettling = params.isInputLoading || arePricesLoading

    const series = useMemo(() => {
        if (!address || !supported || nativeUsdPrice === null || isSettling) return null

        const tokens: LedgerToken[] = classified.map((c) => {
            const key = c.pt.token.address.toLowerCase()
            const deltas = deltasByToken.get(key) ?? []
            return {
                currentBalance: parseFloat(c.pt.formattedBalance) || 0,
                deltas: key === nativeTargetKey ? [...deltas, ...nativeDeltas] : deltas,
                priceKind: c.kind,
                nativePricePoints: nativePriceByToken.get(key) ?? [],
                priceUsdNow: c.pt.priceUsd ?? 0,
            }
        })

        return buildLedgerNetWorthSeries({
            tokens,
            nativeUsdPoints,
            nativeUsdNow: nativeUsdPrice,
            windowStart,
            nowSec,
            netWorthNow: params.netWorthNow,
        })
    }, [
        address,
        supported,
        nativeUsdPrice,
        isSettling,
        classified,
        deltasByToken,
        nativeDeltas,
        nativeTargetKey,
        nativePriceByToken,
        nativeUsdPoints,
        windowStart,
        nowSec,
        params.netWorthNow,
    ])

    const scope = `${chainId}:${address?.toLowerCase() ?? ''}`
    const cacheRef = useRef<{ scope: string; series: NetWorthPoint[] } | null>(null)
    if (cacheRef.current && cacheRef.current.scope !== scope) cacheRef.current = null
    if (series) cacheRef.current = { scope, series }

    return cacheRef.current?.series ?? EMPTY_HISTORY
}
