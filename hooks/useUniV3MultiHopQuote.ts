'use client'

import { useMemo } from 'react'
import { useReadContracts } from 'wagmi'
import type { Address } from 'viem'
import {
    getV3Config,
    getFeeTiers,
    getDexsByProtocol,
    buildQuoteCall,
    ProtocolType,
} from '@coshi190/junoswap-sdk'
import type { Token } from '@/types/token'
import type { DEXType } from '@/lib/dex-meta'
import type { RouteQuote, SwapRoute } from '@/types/routing'
import { getIntermediaryTokens, enumerateHopPaths, MAX_HOPS } from '@/lib/routing-config'
import { getSwapAddress, getWrapOperation, findTokenByAddress } from '@/lib/tokens'
import { useV3PoolDiscovery, type PoolQuery } from './useV3PoolDiscovery'

interface UseUniV3MultiHopQuoteParams {
    tokenIn: Token | null
    tokenOut: Token | null
    amountIn: bigint
    enabled?: boolean
    dexId?: DEXType
}

interface UseUniV3MultiHopQuoteResult {
    routes: RouteQuote[]
    bestRoute: RouteQuote | null
    isLoading: boolean
    isError: boolean
    error: Error | null
}

const MAX_QUOTE_QUERIES = 80

interface Candidate {
    dexId: DEXType
    factory: Address
    quoter: Address
    feeTiers: number[]
    tokens: Address[]
    intermediaries: Address[] // raw connector addresses, for display/token lookup
}

interface QuoteMeta {
    candidate: Candidate
    fees: number[]
}

function crossProduct(perLeg: number[][]): number[][] {
    return perLeg.reduce<number[][]>(
        (acc, fees) => acc.flatMap((combo) => fees.map((f) => [...combo, f])),
        [[]]
    )
}

export function useUniV3MultiHopQuote({
    tokenIn,
    tokenOut,
    amountIn,
    enabled = true,
    dexId,
}: UseUniV3MultiHopQuoteParams): UseUniV3MultiHopQuoteResult {
    const chainId = tokenIn?.chainId ?? tokenOut?.chainId ?? 1
    const wrapOperation = useMemo(() => getWrapOperation(tokenIn, tokenOut), [tokenIn, tokenOut])
    const targetDexIds = useMemo(
        () => (dexId ? [dexId] : getDexsByProtocol(chainId, ProtocolType.V3)),
        [dexId, chainId]
    )

    const isReadyForQuote = enabled && !!tokenIn && !!tokenOut && amountIn > 0n && !wrapOperation

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
            const cfg = getV3Config(chainId, targetDexId)
            if (!cfg?.factory || !cfg?.quoter) continue
            const feeTiers = getFeeTiers(cfg)
            for (const rawPath of rawPaths) {
                const tokens = rawPath.map((a) => getSwapAddress(a, chainId))
                const collapsed = tokens.some(
                    (t, i) => i > 0 && t.toLowerCase() === tokens[i - 1]!.toLowerCase()
                )
                if (collapsed) continue
                result.push({
                    dexId: targetDexId,
                    factory: cfg.factory,
                    quoter: cfg.quoter,
                    feeTiers,
                    tokens,
                    intermediaries: rawPath.slice(1, -1),
                })
            }
        }
        return result
    }, [isReadyForQuote, tokenIn, tokenOut, chainId, targetDexIds])

    const poolQueries = useMemo((): PoolQuery[] => {
        const queries: PoolQuery[] = []
        for (const c of candidates) {
            for (let i = 0; i < c.tokens.length - 1; i++) {
                for (const fee of c.feeTiers) {
                    queries.push({
                        factory: c.factory,
                        tokenA: c.tokens[i]!,
                        tokenB: c.tokens[i + 1]!,
                        fee,
                    })
                }
            }
        }
        return queries
    }, [candidates])

    const discovery = useV3PoolDiscovery({
        queries: poolQueries,
        chainId,
        enabled: isReadyForQuote && poolQueries.length > 0,
    })

    const quoteMetas = useMemo((): QuoteMeta[] => {
        if (discovery.isLoading) return []
        const metas: QuoteMeta[] = []
        for (const c of candidates) {
            const perLegFees: number[][] = []
            let dead = false
            for (let i = 0; i < c.tokens.length - 1; i++) {
                const fees = c.feeTiers.filter((fee) =>
                    discovery.hasPool(c.factory, c.tokens[i]!, c.tokens[i + 1]!, fee)
                )
                if (fees.length === 0) {
                    dead = true
                    break
                }
                perLegFees.push(fees)
            }
            if (dead) continue
            for (const fees of crossProduct(perLegFees)) {
                metas.push({ candidate: c, fees })
                if (metas.length >= MAX_QUOTE_QUERIES) return metas
            }
        }
        return metas
    }, [candidates, discovery])

    const {
        data: quoteResults,
        isLoading: isQuoteLoading,
        isError,
        error,
    } = useReadContracts({
        contracts: quoteMetas.map(({ candidate, fees }) => {
            const call = buildQuoteCall({
                protocol: ProtocolType.V3,
                chainId,
                dexId: candidate.dexId,
                tokenIn: candidate.tokens[0]!,
                tokenOut: candidate.tokens[candidate.tokens.length - 1]!,
                amountIn,
                path: candidate.tokens,
                fees,
            })
            if (!call) throw new Error(`No quote call for ${candidate.dexId} on chain ${chainId}`)
            return { ...call, chainId }
        }),
        query: {
            enabled: isReadyForQuote && quoteMetas.length > 0,
            staleTime: 10_000,
        },
    })

    const routes = useMemo(() => {
        if (!quoteResults) return []
        const validRoutes: RouteQuote[] = []
        quoteResults.forEach((result, index) => {
            if (result.status !== 'success' || !result.result) return
            const meta = quoteMetas[index]
            if (!meta) return
            const [amountOut, , , gasEstimate] = result.result as [
                bigint,
                bigint[],
                number[],
                bigint,
            ]
            if (!amountOut || amountOut === 0n) return
            const intermediaryTokens = meta.candidate.intermediaries
                .map((addr) => findTokenByAddress(chainId, addr))
                .filter((t): t is Token => !!t)
            const swapRoute: SwapRoute = {
                path: meta.candidate.tokens,
                fees: meta.fees,
                isMultiHop: true,
                intermediaryTokens,
            }
            validRoutes.push({
                route: swapRoute,
                quote: {
                    amountOut,
                    sqrtPriceX96After: 0n,
                    initializedTicksCrossed: 0,
                    gasEstimate,
                },
                dexId: meta.candidate.dexId,
                protocolType: ProtocolType.V3,
            })
        })
        return validRoutes.sort((a, b) => Number(b.quote.amountOut - a.quote.amountOut))
    }, [quoteResults, quoteMetas, chainId])

    const isLoading = isReadyForQuote && (discovery.isLoading || isQuoteLoading)

    return {
        routes,
        bestRoute: routes[0] ?? null,
        isLoading,
        isError,
        error: error as Error | null,
    }
}
