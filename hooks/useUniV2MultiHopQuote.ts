'use client'

import { useMemo } from 'react'
import { useReadContracts } from 'wagmi'
import type { Address } from 'viem'
import type { Token } from '@/types/tokens'
import type { RouteQuote, SwapRoute } from '@/types/routing'
import type { DEXType } from '@/types/dex'
import { getV2Config, getDexsByProtocol, ProtocolType } from '@/lib/dex-config'
import { getIntermediaryTokens, enumerateHopPaths, MAX_HOPS } from '@/lib/routing-config'
import { UNISWAP_V2_ROUTER_ABI } from '@/lib/abis/uniswap-v2-router'
import { buildMultiHopSwapPath } from '@/services/dex/uniswap-v2'
import { getWrapOperation } from '@/services/tokens'
import { findTokenByAddress } from '@/lib/tokens'

interface UseUniV2MultiHopQuoteParams {
    tokenIn: Token | null
    tokenOut: Token | null
    amountIn: bigint
    enabled?: boolean
    dexId?: DEXType
}

interface UseUniV2MultiHopQuoteResult {
    routes: RouteQuote[]
    bestRoute: RouteQuote | null
    isLoading: boolean
    isError: boolean
    error: Error | null
}

/** Hard cap on batched quote calls per keystroke, guarding against pathological fan-out. */
const MAX_QUOTE_QUERIES = 80

/** One V2 multi-hop path on a specific DEX (native→wrapped normalized per that DEX). */
interface Candidate {
    dexId: DEXType
    router: Address
    path: Address[]
    intermediaries: Address[] // raw connector addresses, for display/token lookup
}

export function useUniV2MultiHopQuote({
    tokenIn,
    tokenOut,
    amountIn,
    enabled = true,
    dexId,
}: UseUniV2MultiHopQuoteParams): UseUniV2MultiHopQuoteResult {
    const chainId = tokenIn?.chainId ?? tokenOut?.chainId ?? 1
    const wrapOperation = useMemo(() => getWrapOperation(tokenIn, tokenOut), [tokenIn, tokenOut])
    const targetDexIds = useMemo(
        () => (dexId ? [dexId] : getDexsByProtocol(chainId, ProtocolType.V2)),
        [dexId, chainId]
    )

    const isReadyForQuote = enabled && !!tokenIn && !!tokenOut && amountIn > 0n && !wrapOperation

    // Enumerate candidate paths across every V2 DEX × connector path (2- and 3-hop).
    const candidates = useMemo((): Candidate[] => {
        if (!isReadyForQuote || !tokenIn || !tokenOut) return []
        const connectors = getIntermediaryTokens(chainId)
        const rawPaths = enumerateHopPaths(
            tokenIn.address as Address,
            tokenOut.address as Address,
            connectors,
            MAX_HOPS
        )
        const result: Candidate[] = []
        for (const targetDexId of targetDexIds) {
            const cfg = getV2Config(chainId, targetDexId)
            if (!cfg?.router) continue
            for (const rawPath of rawPaths) {
                const path = buildMultiHopSwapPath(rawPath, chainId, cfg.wnative)
                // Drop paths that collapse after native→wrapped normalization.
                const collapsed = path.some(
                    (t, i) => i > 0 && t.toLowerCase() === path[i - 1]!.toLowerCase()
                )
                if (collapsed) continue
                result.push({
                    dexId: targetDexId,
                    router: cfg.router,
                    path,
                    intermediaries: rawPath.slice(1, -1),
                })
                if (result.length >= MAX_QUOTE_QUERIES) return result
            }
        }
        return result
    }, [isReadyForQuote, tokenIn, tokenOut, chainId, targetDexIds])

    const {
        data: quoteResults,
        isLoading,
        isError,
        error,
    } = useReadContracts({
        contracts: candidates.map((c) => ({
            address: c.router,
            abi: UNISWAP_V2_ROUTER_ABI,
            functionName: 'getAmountsOut' as const,
            args: [amountIn, c.path],
            chainId,
        })),
        query: {
            enabled: isReadyForQuote && candidates.length > 0,
            staleTime: 10_000,
        },
    })

    const routes = useMemo(() => {
        if (!quoteResults) return []
        const validRoutes: RouteQuote[] = []
        quoteResults.forEach((result, index) => {
            if (result.status !== 'success' || !result.result) return
            const candidate = candidates[index]
            if (!candidate) return
            const amounts = result.result as bigint[]
            const amountOut = amounts[amounts.length - 1]
            if (!amountOut || amountOut === 0n) return
            const intermediaryTokens = candidate.intermediaries
                .map((addr) => findTokenByAddress(chainId, addr))
                .filter((t): t is Token => !!t)
            const swapRoute: SwapRoute = {
                path: candidate.path,
                isMultiHop: true,
                intermediaryTokens,
            }
            validRoutes.push({
                route: swapRoute,
                quote: {
                    amountOut,
                    sqrtPriceX96After: 0n,
                    initializedTicksCrossed: 0,
                    gasEstimate: 200000n, // Estimated gas for V2 multi-hop
                },
                dexId: candidate.dexId,
                protocolType: ProtocolType.V2,
            })
        })
        return validRoutes.sort((a, b) => Number(b.quote.amountOut - a.quote.amountOut))
    }, [quoteResults, candidates, chainId])

    return {
        routes,
        bestRoute: routes[0] ?? null,
        isLoading,
        isError,
        error: error as Error | null,
    }
}
