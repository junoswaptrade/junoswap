'use client'

import { useChainId } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { fetchNativeUsdPrice } from '@coshi190/junoswap-sdk'
import { NATIVE_USD_STABLE } from '@/lib/routing-config'
import { ponderClient, isPonderError } from '@/lib/ponder-client'
import { INTERMEDIARY_TOKENS } from '@/lib/routing-config'

export function useNativeUsdPrice(chainId?: number) {
    const currentChainId = useChainId()
    const targetChainId = chainId ?? currentChainId

    const hasStablePool =
        !!NATIVE_USD_STABLE[targetChainId] ||
        (INTERMEDIARY_TOKENS[targetChainId]?.stables?.length ?? 0) > 0

    const { data, isLoading } = useQuery({
        queryKey: ['native-usd-price', targetChainId],
        queryFn: async () => {
            try {
                return await fetchNativeUsdPrice(ponderClient, { chainId: targetChainId })
            } catch (e) {
                if (isPonderError(e)) return null
                throw e
            }
        },
        staleTime: 30_000,
        refetchInterval: 30_000,
        enabled: hasStablePool,
    })

    return { nativeUsdPrice: data ?? null, isLoading }
}
