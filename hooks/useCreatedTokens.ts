'use client'

import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { isLaunchpadChain, fetchCreatedTokens, fetchCreatorSnapshots } from '@coshi190/junoswap-sdk'
import { useLaunchpadChainId } from '@/hooks/useLaunchpadChainId'
import { ponderClient } from '@/lib/ponder-client'
import { mapLaunchTokenItem } from '@/services/launchpad/launchpad'
import type { CreatedToken } from '@/types/portfolio'

interface UseCreatedTokensResult {
    createdTokens: CreatedToken[]
    isLoading: boolean
}

export function useCreatedTokens(address: Address | undefined): UseCreatedTokensResult {
    const chainId = useLaunchpadChainId()
    const supported = isLaunchpadChain(chainId)

    const { data, isLoading } = useQuery({
        queryKey: ['created-tokens', chainId, address?.toLowerCase()],
        queryFn: async (): Promise<CreatedToken[]> => {
            const creator = address!.toLowerCase()
            const items = await fetchCreatedTokens(ponderClient, { chainId, creator })
            if (items.length === 0) return []

            const snapshots = await fetchCreatorSnapshots(ponderClient, {
                chainId,
                tokenAddrs: items.map((t) => t.tokenAddr.toLowerCase()),
            })
            const snapshotMap = new Map(snapshots.map((s) => [s.tokenAddr.toLowerCase(), s]))

            return items.map((t): CreatedToken => {
                const token = mapLaunchTokenItem(t, chainId)
                const snap = snapshotMap.get(t.tokenAddr.toLowerCase())
                return {
                    token,
                    marketCapNative: parseFloat(snap?.marketCapNative ?? '0'),
                    creatorFeeNative: BigInt(snap?.creatorFeeNative ?? '0'),
                    creatorFeeClaimedNative: BigInt(snap?.creatorFeeClaimedNative ?? '0'),
                    creatorFeeToken: BigInt(snap?.creatorFeeToken ?? '0'),
                    creatorFeeClaimedToken: BigInt(snap?.creatorFeeClaimedToken ?? '0'),
                    tokenUsdPrice: parseFloat(snap?.lastPriceUsd ?? '0'),
                }
            })
        },
        staleTime: 30_000,
        enabled: supported && !!address,
    })

    return {
        createdTokens: data ?? [],
        isLoading: supported && !!address ? isLoading : false,
    }
}
