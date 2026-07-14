'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { fetchBondingCurveHistory, fetchV3History } from '@coshi190/junoswap-sdk'
import { useLaunchpadChainId } from '@/hooks/useLaunchpadChainId'
import { INTERMEDIARY_TOKENS } from '@/lib/routing-config'
import { ponderClient } from '@/lib/ponder-client'
import {
    aggregateCandlesticks,
    aggregateV3Candlesticks,
    computeFeeBreakdown,
    extractCreatorTrades,
    stitchCandlesticks,
} from '@/services/launchpad/chart'
import type { V3SwapEvent } from '@/services/launchpad/chart'
import type { Timeframe, ChartMode } from '@/types/chart'

export const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d']

export function useTokenPriceHistory(
    tokenAddr: Address | undefined,
    isGraduated?: boolean,
    graduatedAt?: number | null,
    creatorAddress?: Address
) {
    const [timeframe, setTimeframe] = useState<Timeframe>('15m')
    const [chartMode, setChartMode] = useState<ChartMode>('mcap')
    const chainId = useLaunchpadChainId()
    const wrappedNative = INTERMEDIARY_TOKENS[chainId]?.wrappedNative

    const tokenIsToken0 = tokenAddr
        ? tokenAddr.toLowerCase() < (wrappedNative?.toLowerCase() ?? '')
        : false

    const {
        data: rawEvents,
        isLoading: isLoadingBc,
        refetch,
    } = useQuery({
        queryKey: ['token-price-history', tokenAddr?.toLowerCase()],
        queryFn: async () => {
            if (!tokenAddr) return []

            const items = await fetchBondingCurveHistory(ponderClient, {
                tokenAddr: tokenAddr.toLowerCase(),
            })

            return items.map((e) => ({
                timestamp: e.timestamp,
                isBuy: e.isBuy === 1,
                amountIn: BigInt(e.amountIn),
                amountOut: BigInt(e.amountOut),
                reserveIn: BigInt(e.reserveIn),
                reserveOut: BigInt(e.reserveOut),
                sender: e.sender,
            }))
        },
        enabled: !!tokenAddr,
        staleTime: 30_000,
        refetchInterval: 30_000,
    })

    const { data: rawV3Events, isLoading: isLoadingV3 } = useQuery({
        queryKey: ['token-v3-price-history', tokenAddr?.toLowerCase(), chainId],
        queryFn: async () => {
            if (!tokenAddr) return []

            try {
                const items = await fetchV3History(ponderClient, {
                    tokenAddr: tokenAddr.toLowerCase(),
                    chainId,
                })

                return items.map((e) => ({
                    timestamp: e.timestamp,
                    amount0: e.amount0,
                    amount1: e.amount1,
                    sqrtPriceX96: e.sqrtPriceX96,
                    tick: e.tick,
                    txFrom: e.txFrom,
                    tokenIsToken0: e.tokenIsToken0,
                }))
            } catch {
                return []
            }
        },
        enabled: !!tokenAddr && !!isGraduated,
        staleTime: 30_000,
        refetchInterval: 30_000,
    })

    const data = useMemo(() => {
        const bcCandles = aggregateCandlesticks(rawEvents ?? [], timeframe, chartMode)

        if (isGraduated) {
            const v3Candles = aggregateV3Candlesticks(
                (rawV3Events ?? []) as V3SwapEvent[],
                timeframe,
                chartMode,
                tokenIsToken0
            )
            return stitchCandlesticks(bcCandles, v3Candles, graduatedAt ?? null)
        }

        return bcCandles
    }, [rawEvents, rawV3Events, timeframe, chartMode, isGraduated, tokenIsToken0, graduatedAt])

    const feeBreakdown = useMemo(() => computeFeeBreakdown(rawEvents ?? []), [rawEvents])

    const creatorTrades = useMemo(
        () =>
            creatorAddress
                ? extractCreatorTrades(
                      rawEvents ?? [],
                      rawV3Events ?? [],
                      creatorAddress,
                      graduatedAt ?? null
                  )
                : [],
        [rawEvents, rawV3Events, creatorAddress, graduatedAt]
    )

    return {
        data,
        feeBreakdown,
        creatorTrades,
        isLoading: isLoadingBc || (isGraduated && isLoadingV3),
        timeframe,
        setTimeframe,
        chartMode,
        setChartMode,
        refetch,
    }
}
