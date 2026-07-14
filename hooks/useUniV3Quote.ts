'use client'

import { useMemo } from 'react'
import { usePublicClient } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { zeroAddress, type Address } from 'viem'
import {
    ProtocolType,
    discoverV3Pools,
    quoteV3Pools,
    resolveDexIds,
    wrapQuoteResult,
} from '@coshi190/junoswap-sdk'
import type { Token } from '@/types/token'
import type { DEXType } from '@/lib/dex-meta'
import type { QuoteResult } from '@/types/swap'
import { isSameToken, getSwapAddress, getWrapOperation } from '@/lib/tokens'

interface UseUniV3QuoteParams {
    tokenIn: Token | null
    tokenOut: Token | null
    amountIn: bigint
    enabled?: boolean
    dexId?: DEXType | DEXType[]
}

interface UseUniV3QuoteResult {
    quote: QuoteResult | null
    isLoading: boolean
    isError: boolean
    error: Error | null
    fee: number | null
    primaryDexId: DEXType | null
}

export function useUniV3Quote({
    tokenIn,
    tokenOut,
    amountIn,
    enabled = true,
    dexId,
}: UseUniV3QuoteParams): UseUniV3QuoteResult {
    const chainId = tokenIn?.chainId ?? tokenOut?.chainId ?? 1
    const client = usePublicClient({ chainId })

    const dexIds = useMemo(
        () => (tokenIn ? resolveDexIds(chainId, ProtocolType.V3, dexId) : []),
        [chainId, dexId, tokenIn]
    )
    const primaryDexId = dexIds[0] ?? null

    const wrapOperation = useMemo(() => getWrapOperation(tokenIn, tokenOut), [tokenIn, tokenOut])

    const tokenInAddress = tokenIn
        ? getSwapAddress(tokenIn.address as Address, chainId)
        : zeroAddress
    const tokenOutAddress = tokenOut
        ? getSwapAddress(tokenOut.address as Address, chainId)
        : zeroAddress

    const isReadyForQuote =
        enabled &&
        !!client &&
        !!tokenIn &&
        !!tokenOut &&
        amountIn > 0n &&
        dexIds.length > 0 &&
        tokenIn.chainId === tokenOut.chainId &&
        !isSameToken(tokenIn, tokenOut) &&
        !wrapOperation

    const poolQuery = useQuery({
        queryKey: ['v3-pools', chainId, dexIds, tokenInAddress, tokenOutAddress],
        queryFn: () =>
            discoverV3Pools(client!, {
                chainId,
                dexId: dexIds,
                tokenIn: tokenInAddress,
                tokenOut: tokenOutAddress,
            }),
        enabled: isReadyForQuote,
        staleTime: 60_000,
    })

    const bestPool = primaryDexId ? (poolQuery.data?.get(primaryDexId) ?? null) : null

    const quoteQuery = useQuery({
        queryKey: [
            'v3-quote',
            chainId,
            primaryDexId,
            bestPool?.pool,
            bestPool?.fee,
            amountIn.toString(),
        ],
        queryFn: () =>
            quoteV3Pools(
                client!,
                { chainId, tokenIn: tokenInAddress, tokenOut: tokenOutAddress, amountIn },
                new Map([[primaryDexId!, bestPool!]])
            ),
        enabled: isReadyForQuote && !!bestPool,
        staleTime: 10_000,
    })

    const outcome = primaryDexId ? (quoteQuery.data?.get(primaryDexId) ?? null) : null

    const quote: QuoteResult | null = useMemo(() => {
        if (wrapOperation && amountIn > 0n) return wrapQuoteResult(amountIn, wrapOperation)
        return outcome?.quote ?? null
    }, [wrapOperation, amountIn, outcome])

    const hasNoPool = !wrapOperation && !poolQuery.isLoading && !bestPool && !!tokenIn && !!tokenOut

    const quoteError = outcome?.error ?? (quoteQuery.error as Error | null)

    const error: Error | null = useMemo(() => {
        if (quoteError) return quoteError
        if (hasNoPool) return new Error(`No pool found for ${tokenIn!.symbol}/${tokenOut!.symbol}`)
        return null
    }, [quoteError, hasNoPool, tokenIn, tokenOut])

    return {
        quote,
        isLoading: wrapOperation ? false : quoteQuery.isLoading || poolQuery.isLoading,
        isError: !!quoteError || hasNoPool,
        error,
        fee: bestPool?.fee ?? null,
        primaryDexId,
    }
}
