'use client'

import { useMemo } from 'react'
import { useReadContract, useReadContracts } from 'wagmi'
import type { Address } from 'viem'
import {
    ProtocolType,
    buildQuoteCall,
    AGG_ROUTER_JUNOSWAP_ABI,
    getAggRouterAddress,
    type ContractCall,
} from '@coshi190/junoswap-sdk'
import type { Token } from '@/types/token'
import type { RouteQuote } from '@/types/routing'
import {
    selectSplitCandidates,
    computeGridAmounts,
    pickBestSplit,
    type SplitAllocation,
} from '@/services/dex/split-routing'

const SPLIT_FRACTIONS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]

interface UseSplitRouteParams {
    tokenIn: Token | null
    tokenOut: Token | null
    amountIn: bigint
    allRoutes: RouteQuote[]
    enabled?: boolean
}

interface UseSplitRouteResult {
    allocation: SplitAllocation | null
    predictedNetOut: bigint | null
    bestSingleOut: bigint | null
    aggFeeBps: number
    isLoading: boolean
}

type QuoteContract = ContractCall & { chainId: number }

function buildQuoteContract(
    route: RouteQuote,
    amount: bigint,
    tokenIn: Token,
    tokenOut: Token,
    chainId: number
): QuoteContract | null {
    const fee = route.route.fees?.[0]
    if (route.protocolType === ProtocolType.V3 && fee == null) return null

    const call = buildQuoteCall({
        protocol: route.protocolType,
        chainId,
        dexId: route.dexId,
        tokenIn: tokenIn.address as Address,
        tokenOut: tokenOut.address as Address,
        amountIn: amount,
        fee,
    })
    return call ? { ...call, chainId } : null
}

function parseOut(
    route: RouteQuote,
    result: { status: 'success' | 'failure'; result?: unknown } | undefined
): bigint | null {
    if (!result || result.status !== 'success' || result.result == null) return null
    if (route.protocolType === ProtocolType.V3) {
        const out = (result.result as readonly bigint[])[0]
        return out != null && out > 0n ? out : null
    }
    const amounts = result.result as readonly bigint[]
    const out = amounts[amounts.length - 1]
    return out != null && out > 0n ? out : null
}

export function useSplitRoute({
    tokenIn,
    tokenOut,
    amountIn,
    allRoutes,
    enabled = true,
}: UseSplitRouteParams): UseSplitRouteResult {
    const chainId = tokenIn?.chainId ?? 0
    const router = chainId ? getAggRouterAddress(chainId) : undefined

    const candidates = useMemo(() => selectSplitCandidates(allRoutes), [allRoutes])

    const grid = useMemo(() => computeGridAmounts(amountIn, SPLIT_FRACTIONS), [amountIn])

    const isReady = enabled && !!tokenIn && !!tokenOut && !!router && !!candidates && amountIn > 0n

    const contracts = useMemo(() => {
        if (!isReady || !candidates || !tokenIn || !tokenOut) return []
        const [a, b] = candidates
        const forRoute = (route: RouteQuote, amounts: bigint[]) =>
            amounts.map((amt) => buildQuoteContract(route, amt, tokenIn, tokenOut, chainId))
        const all = [...forRoute(a, grid.amountsInA), ...forRoute(b, grid.amountsInB)]
        return all.every((c) => c !== null) ? (all as QuoteContract[]) : []
    }, [isReady, candidates, tokenIn, tokenOut, chainId, grid])

    const { data: quoteResults, isLoading: isQuotesLoading } = useReadContracts({
        contracts,
        query: { enabled: isReady && contracts.length > 0, staleTime: 10_000 },
    })

    const { data: feeBpsData } = useReadContract({
        address: router,
        abi: AGG_ROUTER_JUNOSWAP_ABI,
        functionName: 'feeBps',
        chainId,
        query: { enabled: !!router },
    })

    const aggFeeBps = Number(feeBpsData ?? 0)

    const result = useMemo((): UseSplitRouteResult => {
        const empty = {
            allocation: null,
            predictedNetOut: null,
            bestSingleOut: null,
            aggFeeBps,
            isLoading: isQuotesLoading,
        }
        if (!candidates || !quoteResults) return empty

        const n = grid.amountsInA.length
        const [a, b] = candidates
        const grossA = grid.amountsInA.map((_, i) => parseOut(a, quoteResults[i]))
        const grossB = grid.amountsInB.map((_, i) => parseOut(b, quoteResults[n + i]))
        const bestSingleOut = a.quote.amountOut

        const allocation = pickBestSplit({
            candidateA: a,
            candidateB: b,
            amountsInA: grid.amountsInA,
            amountsInB: grid.amountsInB,
            grossA,
            grossB,
            bestSingleOut,
            aggFeeBps,
        })

        return {
            allocation,
            predictedNetOut: allocation?.predictedNetOut ?? null,
            bestSingleOut,
            aggFeeBps,
            isLoading: isQuotesLoading,
        }
    }, [candidates, quoteResults, grid, aggFeeBps, isQuotesLoading])

    return result
}
