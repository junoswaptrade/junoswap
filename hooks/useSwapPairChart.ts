'use client'

import { useMemo, useState } from 'react'
import { useChainId } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { fetchNativeUsdPriceSnapshots, fetchV3History } from '@coshi190/junoswap-sdk'
import type { Token } from '@/types/token'
import type { Timeframe, CandlestickData } from '@/types/chart'
import { INTERMEDIARY_TOKENS } from '@/lib/routing-config'
import { isNativeToken } from '@/lib/wagmi'
import { ponderClient } from '@/lib/ponder-client'
import { classifySwapPair } from '@/lib/swap-chart'
import {
    aggregatePricePoints,
    sanitizeCandles,
    buildContinuousSeries,
    tokenNativeCandles,
    ratioCandles,
} from '@/services/launchpad/chart'
import type { V3SwapEvent } from '@/services/launchpad/chart'

const NATIVE_DECIMALS = 18

export interface SwapPairChart {
    candles: CandlestickData[]
    isLoading: boolean
    isUnsupported: boolean
    timeframe: Timeframe
    setTimeframe: (tf: Timeframe) => void
    baseSymbol: string
    quoteSymbol: string
    denom: 'usd' | 'native' | 'token'
}

function resolveToken(
    addr: Address | undefined,
    tokenIn: Token | null | undefined,
    tokenOut: Token | null | undefined
): Token | null {
    if (!addr) return null
    const a = addr.toLowerCase()
    for (const t of [tokenIn, tokenOut]) {
        if (t && t.address.toLowerCase() === a) return t
    }
    return null
}

function fetchV3Events(tokenAddr: string, chainId: number): Promise<V3SwapEvent[]> {
    return fetchV3History(ponderClient, {
        tokenAddr: tokenAddr.toLowerCase(),
        chainId,
    }).catch(() => [] as V3SwapEvent[])
}

export function useSwapPairChart(
    tokenIn: Token | null | undefined,
    tokenOut: Token | null | undefined
): SwapPairChart {
    const chainId = useChainId()
    const [timeframe, setTimeframe] = useState<Timeframe>('1d')
    const wrappedNative = INTERMEDIARY_TOKENS[chainId]?.wrappedNative

    const classification = useMemo(
        () => classifySwapPair(chainId, tokenIn?.address, tokenOut?.address),
        [chainId, tokenIn?.address, tokenOut?.address]
    )
    const { kind, baseAddr, quoteAddr } = classification

    const isNativeStable = kind === 'native-stable'
    const isRatioKind = kind === 'token-native' || kind === 'token-stable' || kind === 'token-token'
    const quoteIsNative =
        !!quoteAddr &&
        (isNativeToken(quoteAddr) || quoteAddr.toLowerCase() === wrappedNative?.toLowerCase())
    const quoteNeedsV3 = isRatioKind && !!quoteAddr && !quoteIsNative

    const baseToken = useMemo(
        () => resolveToken(baseAddr, tokenIn, tokenOut),
        [baseAddr, tokenIn, tokenOut]
    )
    const quoteToken = useMemo(
        () => resolveToken(quoteAddr, tokenIn, tokenOut),
        [quoteAddr, tokenIn, tokenOut]
    )

    const { data: snapshotRows, isLoading: loadingSnap } = useQuery({
        queryKey: ['swap-pair-native-usd', chainId],
        queryFn: () => fetchNativeUsdPriceSnapshots(ponderClient, { chainId }).catch(() => []),
        enabled: isNativeStable,
        staleTime: 30_000,
        refetchInterval: 30_000,
    })

    const { data: baseEvents, isLoading: loadingBase } = useQuery({
        queryKey: ['swap-pair-v3', baseAddr?.toLowerCase(), chainId],
        queryFn: () => fetchV3Events(baseAddr!, chainId),
        enabled: isRatioKind && !!baseAddr,
        staleTime: 30_000,
        refetchInterval: 30_000,
    })

    const { data: quoteEvents, isLoading: loadingQuote } = useQuery({
        queryKey: ['swap-pair-v3', quoteAddr?.toLowerCase(), chainId],
        queryFn: () => fetchV3Events(quoteAddr!, chainId),
        enabled: quoteNeedsV3,
        staleTime: 30_000,
        refetchInterval: 30_000,
    })

    const candles = useMemo(() => {
        if (isNativeStable) {
            const points = (snapshotRows ?? []).map((r) => ({
                timestamp: r.timestamp,
                price: parseFloat(r.price),
            }))
            return buildContinuousSeries(
                sanitizeCandles(aggregatePricePoints(points, timeframe)),
                timeframe
            )
        }
        if (isRatioKind && baseAddr && wrappedNative) {
            const npBase = tokenNativeCandles(
                baseEvents ?? [],
                baseAddr,
                baseToken?.decimals ?? 18,
                wrappedNative,
                NATIVE_DECIMALS,
                timeframe
            )
            if (quoteIsNative) return npBase
            if (!quoteAddr) return []
            const npQuote = tokenNativeCandles(
                quoteEvents ?? [],
                quoteAddr,
                quoteToken?.decimals ?? 18,
                wrappedNative,
                NATIVE_DECIMALS,
                timeframe
            )
            return buildContinuousSeries(sanitizeCandles(ratioCandles(npBase, npQuote)), timeframe)
        }
        return []
    }, [
        isNativeStable,
        isRatioKind,
        snapshotRows,
        baseEvents,
        quoteEvents,
        timeframe,
        baseAddr,
        quoteAddr,
        quoteIsNative,
        wrappedNative,
        baseToken,
        quoteToken,
    ])

    const denom: 'usd' | 'native' | 'token' =
        kind === 'native-stable' || kind === 'token-stable'
            ? 'usd'
            : kind === 'token-native'
              ? 'native'
              : 'token'

    const baseSymbol = baseToken?.symbol ?? ''
    const quoteSymbol = quoteToken?.symbol ?? (kind === 'native-stable' ? 'USD' : '')

    const isLoading =
        (isNativeStable && loadingSnap) ||
        (isRatioKind && (loadingBase || (quoteNeedsV3 && loadingQuote)))

    return {
        candles,
        isLoading,
        isUnsupported: kind === 'unsupported',
        timeframe,
        setTimeframe,
        baseSymbol,
        quoteSymbol,
        denom,
    }
}
