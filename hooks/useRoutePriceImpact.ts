'use client'

import { useMemo } from 'react'
import { useReadContract } from 'wagmi'
import type { Token } from '@/types/tokens'
import type { RouteQuote } from '@/types/routing'
import { getV2Config, getV3Config, ProtocolType } from '@/lib/dex-config'
import { UNISWAP_V3_QUOTER_V2_ABI } from '@/lib/abis/uniswap-v3-quoter'
import { UNISWAP_V2_ROUTER_ABI } from '@/lib/abis/uniswap-v2-router'
import { encodeV3Path } from '@/services/dex/uniswap-v3'
import { getSwapAddress, getWrapOperation } from '@/services/tokens'

interface UseRoutePriceImpactParams {
    route: RouteQuote | null
    tokenIn: Token | null
    tokenOut: Token | null
    amountIn: bigint
    enabled?: boolean
}

interface UseRoutePriceImpactResult {
    /** Percentage (e.g. 2.5 = 2.5%), or undefined when it can't be measured. */
    priceImpact: number | undefined
    isLoading: boolean
}

/** Reference trade = 1/1000th of the input, used to approximate the near-spot marginal price. */
const REFERENCE_DIVISOR = 1000n

/**
 * Price impact as a percentage: how much worse the full-trade rate is than the near-spot
 * reference rate. `priceImpact = 1 - (fullRate / spotRate)` where each rate = out/in.
 * Decimals cancel since both rates use the same token pair. Returns undefined when it can't
 * be measured, and clamps small favorable rounding to 0 (impact is never negative here).
 */
export function computePriceImpactPercent(
    fullAmountOut: bigint,
    amountIn: bigint,
    referenceAmountOut: bigint,
    referenceAmountIn: bigint
): number | undefined {
    if (referenceAmountOut <= 0n || referenceAmountIn <= 0n || amountIn <= 0n) return undefined
    const num = fullAmountOut * referenceAmountIn
    const den = amountIn * referenceAmountOut
    if (den === 0n) return undefined
    const ratioBps = Number((num * 10000n) / den)
    return Math.max(0, (10000 - ratioBps) / 100)
}

/**
 * Estimates price impact for a resolved route by re-quoting a tiny reference amount through
 * the same path/DEX and comparing the small-trade rate (near spot) to the full-trade rate:
 *   priceImpact = 1 - (fullRate / spotRate).
 * DEX-agnostic (works for V2/V3, single- and multi-hop) and costs one extra batched read for
 * the winning route only. Decimals cancel because both rates use the same token pair.
 */
export function useRoutePriceImpact({
    route,
    tokenIn,
    tokenOut,
    amountIn,
    enabled = true,
}: UseRoutePriceImpactParams): UseRoutePriceImpactResult {
    const chainId = tokenIn?.chainId ?? tokenOut?.chainId ?? 1
    const wrapOperation = useMemo(() => getWrapOperation(tokenIn, tokenOut), [tokenIn, tokenOut])
    const referenceAmountIn = amountIn / REFERENCE_DIVISOR

    const canMeasure =
        enabled && !!route && !wrapOperation && referenceAmountIn > 0n && amountIn > 0n

    const isV3 = canMeasure && route!.protocolType === ProtocolType.V3 && !!route!.route.fees
    const isV2 = canMeasure && route!.protocolType === ProtocolType.V2

    // Direct routes store raw addresses (native sentinel included); normalize to wrapped so the
    // reference quote resolves for native pairs too. Idempotent for already-normalized multi-hop paths.
    const normalizedPath = useMemo(
        () => route?.route.path.map((a) => getSwapAddress(a, chainId)) ?? [],
        [route, chainId]
    )

    const v3Config = isV3 ? getV3Config(chainId, route!.dexId) : undefined
    const v3Path = useMemo(() => {
        if (!isV3 || !route!.route.fees) return undefined
        return encodeV3Path(normalizedPath, route!.route.fees)
    }, [isV3, route, normalizedPath])

    const v3Ref = useReadContract({
        address: v3Config?.quoter,
        abi: UNISWAP_V3_QUOTER_V2_ABI,
        functionName: 'quoteExactInput',
        args: v3Path ? [v3Path, referenceAmountIn] : undefined,
        chainId,
        query: { enabled: !!v3Config?.quoter && !!v3Path, staleTime: 10_000 },
    }) as { data?: readonly [bigint, bigint[], number[], bigint]; isLoading: boolean }

    const v2Config = isV2 ? getV2Config(chainId, route!.dexId) : undefined
    const v2Ref = useReadContract({
        address: v2Config?.router,
        abi: UNISWAP_V2_ROUTER_ABI,
        functionName: 'getAmountsOut',
        args: isV2 ? [referenceAmountIn, normalizedPath] : undefined,
        chainId,
        query: { enabled: !!v2Config?.router && isV2, staleTime: 10_000 },
    }) as { data?: readonly bigint[]; isLoading: boolean }

    const priceImpact = useMemo(() => {
        if (!canMeasure || !route) return undefined
        let referenceAmountOut: bigint | undefined
        if (isV3 && v3Ref.data) {
            referenceAmountOut = v3Ref.data[0]
        } else if (isV2 && v2Ref.data) {
            const amounts = v2Ref.data
            referenceAmountOut = amounts[amounts.length - 1]
        }
        if (!referenceAmountOut) return undefined
        return computePriceImpactPercent(
            route.quote.amountOut,
            amountIn,
            referenceAmountOut,
            referenceAmountIn
        )
    }, [canMeasure, route, isV3, isV2, v3Ref.data, v2Ref.data, referenceAmountIn, amountIn])

    return {
        priceImpact,
        isLoading: (isV3 && v3Ref.isLoading) || (isV2 && v2Ref.isLoading),
    }
}
