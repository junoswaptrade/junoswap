'use client'

import { useMemo } from 'react'
import { useReadContracts } from 'wagmi'
import { zeroAddress, type Address } from 'viem'
import { UNISWAP_V3_FACTORY_ABI, poolKey } from '@coshi190/junoswap-sdk'

export interface PoolQuery {
    factory: Address
    tokenA: Address
    tokenB: Address
    fee: number
}

interface UseV3PoolDiscoveryParams {
    queries: PoolQuery[]
    chainId: number
    enabled?: boolean
}

interface UseV3PoolDiscoveryResult {
    hasPool: (factory: Address, a: Address, b: Address, fee: number) => boolean
    existingPools: Set<string>
    isLoading: boolean
    isError: boolean
}

export function useV3PoolDiscovery({
    queries,
    chainId,
    enabled = true,
}: UseV3PoolDiscoveryParams): UseV3PoolDiscoveryResult {
    const uniqueQueries = useMemo(() => {
        const seen = new Map<string, PoolQuery>()
        for (const q of queries) {
            seen.set(poolKey(q.factory, q.tokenA, q.tokenB, q.fee), q)
        }
        return [...seen.entries()] // [key, query][]
    }, [queries])

    const { data, isLoading, isError } = useReadContracts({
        contracts: uniqueQueries.map(([, q]) => ({
            address: q.factory,
            abi: UNISWAP_V3_FACTORY_ABI,
            functionName: 'getPool' as const,
            args: [q.tokenA, q.tokenB, q.fee],
            chainId,
        })),
        query: {
            enabled: enabled && uniqueQueries.length > 0,
            staleTime: 60_000,
        },
    })

    const existingPools = useMemo(() => {
        const set = new Set<string>()
        if (!data) return set
        data.forEach((res, i) => {
            if (res.status === 'success') {
                const addr = res.result as Address | undefined
                if (addr && addr.toLowerCase() !== zeroAddress) {
                    set.add(uniqueQueries[i]![0])
                }
            }
        })
        return set
    }, [data, uniqueQueries])

    const hasPool = useMemo(
        () => (factory: Address, a: Address, b: Address, fee: number) =>
            existingPools.has(poolKey(factory, a, b, fee)),
        [existingPools]
    )

    return useMemo(
        () => ({ hasPool, existingPools, isLoading, isError }),
        [hasPool, existingPools, isLoading, isError]
    )
}
