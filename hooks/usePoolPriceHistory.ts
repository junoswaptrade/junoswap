'use client'

import { useChainId } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { fetchPoolPriceHistory, fetchPoolPriceAnchor } from '@coshi190/junoswap-sdk'
import { ponderClient } from '@/lib/ponder-client'
import { RANGE_CHART_WINDOW_SEC } from '@/lib/position-chart'
import type { PoolSwapPoint } from '@/lib/position-chart'

export interface PoolPriceHistory {
    events: PoolSwapPoint[]
    anchor: PoolSwapPoint | null
    isLoading: boolean
}

export function usePoolPriceHistory(poolAddress: Address | undefined): PoolPriceHistory {
    const chainId = useChainId()

    const { data, isLoading } = useQuery({
        queryKey: ['pool-price-history', chainId, poolAddress?.toLowerCase()],
        queryFn: async () => {
            const pool = poolAddress!.toLowerCase()
            const since = Math.floor(Date.now() / 1000) - RANGE_CHART_WINDOW_SEC
            const [events, anchor] = await Promise.all([
                fetchPoolPriceHistory(ponderClient, {
                    poolAddress: pool,
                    chainId,
                    since,
                }).catch(() => [] as PoolSwapPoint[]),
                fetchPoolPriceAnchor(ponderClient, {
                    poolAddress: pool,
                    chainId,
                    before: since,
                }).catch(() => null),
            ])
            return { events, anchor }
        },
        enabled: !!poolAddress,
        staleTime: 30_000,
        refetchInterval: 30_000,
    })

    return {
        events: data?.events ?? [],
        anchor: data?.anchor ?? null,
        isLoading,
    }
}
