'use client'

import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { fetchTokenBondingCurveSwaps, fetchTokenV3Swaps } from '@coshi190/junoswap-sdk'
import { ponderClient } from '@/lib/ponder-client'
import { useLaunchpadChainId } from '@/hooks/useLaunchpadChainId'
import type { SwapEventData } from '@/types/launchpad'

export type { SwapEventData }

interface SwapEventFilters {
    isBuy?: boolean // true = buys only, false = sells only, undefined = all
    sender?: string // lowercase hex address to filter by
}

function absBigInt(n: bigint): bigint {
    return n < 0n ? -n : n
}

function toIsBuy(isBuy: boolean | undefined): number | undefined {
    return isBuy === undefined ? undefined : isBuy ? 1 : 0
}

export function useTokenSwapEvents(
    tokenAddr: Address | undefined,
    page: number = 1,
    pageSize: number = 10,
    poolAddress?: Address,
    isGraduated?: boolean,
    filters?: SwapEventFilters
) {
    const chainId = useLaunchpadChainId()
    return useQuery({
        queryKey: [
            'token-swap-events',
            chainId,
            tokenAddr?.toLowerCase(),
            page,
            pageSize,
            poolAddress?.toLowerCase(),
            isGraduated,
            filters?.isBuy,
            filters?.sender?.toLowerCase(),
        ],
        queryFn: async (): Promise<{ data: SwapEventData[]; totalCount: number }> => {
            if (!tokenAddr) return { data: [], totalCount: 0 }

            const offset = (page - 1) * pageSize

            if (isGraduated) {
                const [bcResult, v3Result] = await Promise.all([
                    fetchTokenBondingCurveSwaps(ponderClient, {
                        tokenAddr: tokenAddr.toLowerCase(),
                        limit: 1000,
                        offset: 0,
                        isBuy: toIsBuy(filters?.isBuy),
                        sender: filters?.sender?.toLowerCase(),
                    }),
                    fetchTokenV3Swaps(ponderClient, {
                        tokenAddr: tokenAddr.toLowerCase(),
                        chainId,
                        limit: pageSize,
                        offset,
                        txFrom: filters?.sender?.toLowerCase(),
                    }),
                ])

                const bcItems = bcResult.items.map((e) => ({
                    blockNumber: BigInt(e.blockNumber),
                    timestamp: e.timestamp,
                    sender: e.sender as Address,
                    isBuy: e.isBuy === 1,
                    tokenAddr,
                    amountIn: BigInt(e.amountIn),
                    amountOut: BigInt(e.amountOut),
                    reserveIn: BigInt(e.reserveIn),
                    reserveOut: BigInt(e.reserveOut),
                    transactionHash: e.transactionHash as `0x${string}`,
                }))

                let v3Items = v3Result.items.map((e) => {
                    const amount0 = BigInt(e.amount0)
                    const amount1 = BigInt(e.amount1)

                    const tokenIsToken0 = e.tokenIsToken0 === 1
                    const tokenAmount = tokenIsToken0 ? amount0 : amount1
                    const nativeAmount = tokenIsToken0 ? amount1 : amount0

                    const isBuy = tokenAmount < 0n

                    return {
                        blockNumber: BigInt(e.blockNumber),
                        timestamp: e.timestamp,
                        sender: e.txFrom as Address, // actual signer, not the router
                        isBuy,
                        tokenAddr,
                        amountIn: absBigInt(isBuy ? nativeAmount : tokenAmount),
                        amountOut: absBigInt(isBuy ? tokenAmount : nativeAmount),
                        reserveIn: 0n,
                        reserveOut: 0n,
                        transactionHash: e.transactionHash as `0x${string}`,
                    }
                })

                if (filters?.isBuy !== undefined) {
                    v3Items = v3Items.filter((item) => item.isBuy === filters.isBuy)
                }

                const nv3 = v3Result.totalCount
                const bcStart = Math.max(0, offset - nv3)
                const bcNeeded = pageSize - v3Items.length
                const bcInWindow = bcNeeded > 0 ? bcItems.slice(bcStart, bcStart + bcNeeded) : []
                const data = [...v3Items, ...bcInWindow]
                const totalCount = nv3 + bcItems.length

                return { data, totalCount }
            }

            const result = await fetchTokenBondingCurveSwaps(ponderClient, {
                tokenAddr: tokenAddr.toLowerCase(),
                limit: pageSize,
                offset,
                isBuy: toIsBuy(filters?.isBuy),
                sender: filters?.sender?.toLowerCase(),
            })

            const data = result.items.map((e) => ({
                blockNumber: BigInt(e.blockNumber),
                timestamp: e.timestamp,
                sender: e.sender as Address,
                isBuy: e.isBuy === 1,
                tokenAddr: tokenAddr,
                amountIn: BigInt(e.amountIn),
                amountOut: BigInt(e.amountOut),
                reserveIn: BigInt(e.reserveIn),
                reserveOut: BigInt(e.reserveOut),
                transactionHash: e.transactionHash as `0x${string}`,
            }))

            return { data, totalCount: result.totalCount }
        },
        enabled: !!tokenAddr,
        staleTime: 30_000,
        refetchInterval: 30_000,
    })
}
