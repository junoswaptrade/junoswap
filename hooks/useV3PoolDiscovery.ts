'use client'

import { useMemo } from 'react'
import { useReadContracts } from 'wagmi'
import type { Address } from 'viem'
import { UNISWAP_V3_FACTORY_ABI } from '@/lib/abis/uniswap-v3-factory'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

export interface PoolQuery {
    factory: Address
    tokenA: Address
    tokenB: Address
    fee: number
}

/** Order-independent key for a (factory, unordered pair, fee) pool. */
export function poolKey(factory: Address, a: Address, b: Address, fee: number): string {
    const [x, y] =
        a.toLowerCase() < b.toLowerCase()
            ? [a.toLowerCase(), b.toLowerCase()]
            : [b.toLowerCase(), a.toLowerCase()]
    return `${factory.toLowerCase()}:${x}:${y}:${fee}`
}

interface UseV3PoolDiscoveryParams {
    queries: PoolQuery[]
    chainId: number
    enabled?: boolean
}

interface UseV3PoolDiscoveryResult {
    /** True once discovery has resolved and the pool for these tokens/fee exists. */
    hasPool: (factory: Address, a: Address, b: Address, fee: number) => boolean
    existingPools: Set<string>
    isLoading: boolean
    isError: boolean
}

/**
 * Batches `factory.getPool` across many (factory, pair, fee) combinations in a single
 * multicall so multi-hop routing can prune fee-tier candidates to pools that actually
 * exist before spending expensive `quoteExactInput` calls on them. Results are keyed
 * order-independently and deduped, and cached long (`staleTime`) since pool existence
 * changes rarely. Callers must memoize `queries` — its reference identity gates the batch.
 */
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
                if (addr && addr.toLowerCase() !== ZERO_ADDRESS) {
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
