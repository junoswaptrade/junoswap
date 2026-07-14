'use client'

import { useMemo } from 'react'
import { useReadContract } from 'wagmi'
import { ProtocolType, buildQuoteCall } from '@coshi190/junoswap-sdk'
import type { Token } from '@/types/token'
import type { RouteQuote } from '@/types/routing'
import { getWrapOperation } from '@/lib/tokens'

interface UseRoutePriceImpactParams {
    route: RouteQuote | null
    tokenIn: Token | null
    tokenOut: Token | null
    amountIn: bigint
    enabled?: boolean
}

interface UseRoutePriceImpactResult {
    priceImpact: number | undefined
    isLoading: boolean
}

const REFERENCE_DIVISOR = 1000n

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

    const referenceCall = useMemo(() => {
        if (!isV3 && !isV2) return undefined
        const path = route!.route.path
        return buildQuoteCall({
            protocol: route!.protocolType,
            chainId,
            dexId: route!.dexId,
            tokenIn: path[0]!,
            tokenOut: path[path.length - 1]!,
            amountIn: referenceAmountIn,
            path,
            fees: route!.route.fees,
            fee: route!.route.fees?.[0],
        })
    }, [isV3, isV2, route, chainId, referenceAmountIn])

    const reference = useReadContract({
        address: referenceCall?.address,
        abi: referenceCall?.abi,
        functionName: referenceCall?.functionName,
        args: referenceCall?.args,
        chainId,
        query: { enabled: !!referenceCall, staleTime: 10_000 },
    }) as { data?: unknown; isLoading: boolean }

    const priceImpact = useMemo(() => {
        if (!canMeasure || !route || reference.data == null) return undefined

        // Both V3 quoter entry points lead with amountOut; V2's getAmountsOut ends with it.
        const referenceAmountOut = isV3
            ? (reference.data as readonly bigint[])[0]
            : (reference.data as readonly bigint[]).at(-1)

        if (!referenceAmountOut) return undefined
        return computePriceImpactPercent(
            route.quote.amountOut,
            amountIn,
            referenceAmountOut,
            referenceAmountIn
        )
    }, [canMeasure, route, isV3, reference.data, referenceAmountIn, amountIn])

    return {
        priceImpact,
        isLoading: (isV3 || isV2) && reference.isLoading,
    }
}
