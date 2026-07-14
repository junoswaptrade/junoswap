'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchNativeUsdPriceSnapshots } from '@coshi190/junoswap-sdk'
import { ponderClient, isPonderError } from '@/lib/ponder-client'
import { isLeaderboardSupportedChain } from '@/lib/leaderboard-utils'
import { hasSettled } from '@/lib/query-status'
import { sanitizePricePoints } from '@/services/portfolio/net-worth-history'

export interface NativeUsdPricePoint {
    timestamp: number
    price: number
}

async function fetchAllSnapshots(chainId: number): Promise<NativeUsdPricePoint[]> {
    const rows = await fetchNativeUsdPriceSnapshots(ponderClient, { chainId })
    return sanitizePricePoints(
        rows.map((r) => ({ timestamp: r.timestamp, price: parseFloat(r.price) }))
    )
}

export function makePriceAt(
    points: NativeUsdPricePoint[],
    fallbackPrice: number | null
): (timestamp: number) => number {
    const fallback = fallbackPrice ?? 0
    if (points.length === 0) return () => fallback

    return (timestamp: number) => {
        if (timestamp < points[0]!.timestamp) return points[0]!.price
        let lo = 0
        let hi = points.length - 1
        let ans = 0
        while (lo <= hi) {
            const mid = (lo + hi) >> 1
            if (points[mid]!.timestamp <= timestamp) {
                ans = mid
                lo = mid + 1
            } else {
                hi = mid - 1
            }
        }
        return points[ans]!.price
    }
}

export function useNativeUsdPriceHistory(chainId: number, fallbackPrice: number | null) {
    const isSupportedChain = isLeaderboardSupportedChain(chainId)

    const { data, isLoading } = useQuery({
        queryKey: ['native-usd-price-history', chainId],
        queryFn: async (): Promise<NativeUsdPricePoint[]> => {
            try {
                return await fetchAllSnapshots(chainId)
            } catch (e) {
                if (isPonderError(e)) return []
                throw e
            }
        },
        enabled: isSupportedChain,
        staleTime: 5 * 60_000,
    })

    const points = useMemo(() => data ?? [], [data])
    const priceAt = useMemo(() => makePriceAt(points, fallbackPrice), [points, fallbackPrice])

    return { points, priceAt, isLoading, isSettled: hasSettled(isSupportedChain, data) }
}
