'use client'

import { useMemo } from 'react'
import { useReadContracts } from 'wagmi'
import type { Address } from 'viem'
import { getV3Config, UNISWAP_V3_FACTORY_ABI, UNISWAP_V3_POOL_ABI } from '@coshi190/junoswap-sdk'
import { INTERMEDIARY_TOKENS } from '@/lib/routing-config'
import { calculatePriceFromSqrtPrice, TOTAL_SUPPLY } from '@/services/launchpad/chart'

const GRADUATED_FEE_TIER = 10000
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

// Live on-chain market caps for graduated tokens, batched via multicall — keeps
// list-page mcaps in sync with the same slot0 source the chart/detail page use,
// instead of the indexer's periodically-updated snapshot.
export function useGraduatedMarketCaps(
    tokenAddresses: Address[],
    chainId: number
): Map<string, number> {
    const v3Config = getV3Config(chainId)
    const wrappedNative = INTERMEDIARY_TOKENS[chainId]?.wrappedNative

    const { data: poolAddressResults } = useReadContracts({
        contracts: tokenAddresses.map((addr) => ({
            address: v3Config?.factory as Address,
            abi: UNISWAP_V3_FACTORY_ABI,
            functionName: 'getPool' as const,
            args: [addr, wrappedNative as Address, GRADUATED_FEE_TIER] as const,
            chainId,
        })),
        query: { enabled: tokenAddresses.length > 0 && !!v3Config && !!wrappedNative },
    })

    const pools = useMemo(() => {
        if (!poolAddressResults) return []
        return tokenAddresses
            .map((addr, i) => ({
                tokenAddr: addr,
                poolAddress: poolAddressResults[i]?.result as Address | undefined,
            }))
            .filter(
                (p): p is { tokenAddr: Address; poolAddress: Address } =>
                    !!p.poolAddress && p.poolAddress.toLowerCase() !== ZERO_ADDRESS
            )
    }, [poolAddressResults, tokenAddresses])

    const { data: slot0Results } = useReadContracts({
        contracts: pools.map((p) => ({
            address: p.poolAddress,
            abi: UNISWAP_V3_POOL_ABI,
            functionName: 'slot0' as const,
            chainId,
        })),
        query: { enabled: pools.length > 0 },
    })

    return useMemo(() => {
        const result = new Map<string, number>()
        if (!slot0Results || !wrappedNative) return result

        pools.forEach((pool, i) => {
            const slot0 = slot0Results[i]?.result as
                | [bigint, number, number, number, number, number, boolean]
                | undefined
            if (!slot0) return
            const sqrtPriceX96 = slot0[0]
            if (!sqrtPriceX96 || sqrtPriceX96 <= 0n) return

            const tokenIsToken0 = pool.tokenAddr.toLowerCase() < wrappedNative.toLowerCase()
            const price = calculatePriceFromSqrtPrice(sqrtPriceX96, tokenIsToken0)
            if (price <= 0) return

            result.set(pool.tokenAddr.toLowerCase(), price * TOTAL_SUPPLY)
        })

        return result
    }, [slot0Results, pools, wrappedNative])
}
