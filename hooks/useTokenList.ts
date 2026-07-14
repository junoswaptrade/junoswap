'use client'

import { useQuery } from '@tanstack/react-query'
import { isLaunchpadChain, fetchTokenList } from '@coshi190/junoswap-sdk'
import { useLaunchpadChainId } from '@/hooks/useLaunchpadChainId'
import { ponderClient } from '@/lib/ponder-client'
import { mapLaunchTokenItem } from '@/services/launchpad/launchpad'
import type { LaunchToken } from '@/types/launchpad'

const STALENESS_TOLERANCE = 3600 // 1 hour — hide badge if reference price is >1h before the 24h mark

interface SnapshotData {
    lastSwapAt: number
    marketCapNative: string
    athMarketCapNative: string
    lastPrice: string
    priceChange1dPct: number | null
}

interface UseTokenListResult {
    tokens: LaunchToken[]
    snapshotMap: Map<string, SnapshotData>
    isLoading: boolean
    refetch: () => void
}

export function useTokenList(): UseTokenListResult {
    const chainId = useLaunchpadChainId()
    const supported = isLaunchpadChain(chainId)

    const {
        data: result,
        isLoading,
        refetch,
    } = useQuery({
        queryKey: ['launchpad-token-list', chainId],
        queryFn: async () => {
            const data = await fetchTokenList(ponderClient, { chainId })
            const tokens = data.tokens.map((t): LaunchToken => mapLaunchTokenItem(t, chainId))
            const now = Math.floor(Date.now() / 1000)
            const cutoff = now - 86400
            const snapshotMap = new Map<string, SnapshotData>()
            for (const s of data.snapshots) {
                const changePct = s.priceChange1dPct ? parseFloat(s.priceChange1dPct) : null
                const isStale =
                    s.price1dAgoTimestamp == null ||
                    s.price1dAgoTimestamp < cutoff - STALENESS_TOLERANCE
                snapshotMap.set(s.tokenAddr.toLowerCase(), {
                    lastSwapAt: s.lastSwapAt ?? 0,
                    marketCapNative: s.marketCapNative ?? '0',
                    athMarketCapNative: s.athMarketCapNative ?? '0',
                    lastPrice: s.lastPrice ?? '0',
                    priceChange1dPct: isStale ? null : changePct,
                })
            }
            return { tokens, snapshotMap }
        },
        staleTime: 30_000,
        enabled: supported,
    })

    if (!supported) {
        return {
            tokens: [],
            snapshotMap: new Map<string, SnapshotData>(),
            isLoading: false,
            refetch: () => {},
        }
    }

    return {
        tokens: result?.tokens ?? [],
        snapshotMap: result?.snapshotMap ?? new Map<string, SnapshotData>(),
        isLoading,
        refetch,
    }
}
