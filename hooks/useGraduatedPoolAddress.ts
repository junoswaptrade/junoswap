'use client'

import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { fetchGraduatedPool } from '@coshi190/junoswap-sdk'
import { ponderClient } from '@/lib/ponder-client'

export function useGraduatedPoolAddress(
    tokenAddr: Address | undefined,
    wrappedNative: Address | undefined
) {
    return useQuery({
        queryKey: [
            'graduated-pool-address',
            tokenAddr?.toLowerCase(),
            wrappedNative?.toLowerCase(),
        ],
        queryFn: async () => {
            if (!tokenAddr || !wrappedNative) return undefined
            const address = await fetchGraduatedPool(ponderClient, {
                tokenAddr: tokenAddr.toLowerCase(),
                wrappedNative: wrappedNative.toLowerCase(),
            })
            return (address as Address | null) ?? undefined
        },
        enabled: !!tokenAddr && !!wrappedNative,
        staleTime: 60_000,
    })
}
