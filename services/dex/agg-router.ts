import { encodeAbiParameters, type Address, type Hex } from 'viem'
import type { RouteQuote } from '@/types/routing'
import {
    ProtocolType,
    getV2Config,
    getV3Config,
    isNativeToken,
    resolveSwapPath,
    shouldSkipUnwrap,
} from '@coshi190/junoswap-sdk'

export interface Hop {
    factory: Address
    swapData: Hex
}

export interface Leg {
    amountIn: bigint
    hops: Hop[]
}

export interface AggregateParams {
    tokenIn: Address
    tokenOut: Address
    amountIn: bigint
    minAmountOut: bigint
    recipient: Address
    deadline: bigint
    unwrapOut: boolean
    referrer: Address
}

export function encodeHopSwapData(tokenOut: Address, fee?: number): Hex {
    if (fee === undefined) {
        return encodeAbiParameters([{ type: 'address' }], [tokenOut])
    }
    return encodeAbiParameters([{ type: 'address' }, { type: 'uint24' }], [tokenOut, fee])
}

export function routeToHops(routeQuote: RouteQuote, chainId: number): Hop[] {
    const { route, dexId, protocolType } = routeQuote
    const isV3 = protocolType === ProtocolType.V3

    const config = isV3 ? getV3Config(chainId, dexId) : getV2Config(chainId, dexId)
    if (!config?.factory) {
        throw new Error(`no ${protocolType} factory for ${dexId} on chain ${chainId}`)
    }

    const wnative = isV3 ? undefined : getV2Config(chainId, dexId)?.wnative
    const path = resolveSwapPath(route.path, chainId, wnative)
    if (path.length < 2) throw new Error('route path needs at least two tokens')

    const hopCount = path.length - 1
    if (isV3 && route.fees?.length !== hopCount) {
        throw new Error(`v3 route needs ${hopCount} fee tiers, got ${route.fees?.length ?? 0}`)
    }

    return Array.from({ length: hopCount }, (_, i) => {
        const tokenOut = path[i + 1]!
        if (tokenOut.toLowerCase() === path[i]!.toLowerCase()) {
            throw new Error(`hop ${i} resolves to the same token`)
        }
        return {
            factory: config.factory,
            swapData: encodeHopSwapData(tokenOut, isV3 ? route.fees![i] : undefined),
        }
    })
}

export interface ResolvedHop {
    dexId: string
    protocol: ProtocolType
    factory: Address
    tokenIn: Address
    tokenOut: Address
    fee?: number
}

export function legToHops(hops: ResolvedHop[]): Hop[] {
    if (hops.length === 0) throw new Error('leg has no hops')
    return hops.map((h, i) => {
        if (h.tokenIn.toLowerCase() === h.tokenOut.toLowerCase()) {
            throw new Error(`hop ${i} resolves to the same token`)
        }
        const isV3 = h.protocol === ProtocolType.V3
        if (isV3 && h.fee === undefined) throw new Error(`v3 hop ${i} missing fee`)
        return {
            factory: h.factory,
            swapData: encodeHopSwapData(h.tokenOut, isV3 ? h.fee : undefined),
        }
    })
}

export function buildLegs(allocations: Leg[], amountIn: bigint): Leg[] {
    if (allocations.length === 0) throw new Error('no legs')

    const sum = allocations.reduce((acc, leg) => acc + leg.amountIn, 0n)
    if (sum !== amountIn) throw new Error(`legs sum to ${sum}, expected ${amountIn}`)
    if (allocations.some((leg) => leg.hops.length === 0)) throw new Error('leg has no hops')

    return allocations
}

interface BuildAggregateParamsInput {
    tokenIn: Address
    tokenOut: Address
    amountIn: bigint
    minAmountOut: bigint
    recipient: Address
    deadline: number
    referrer: Address
    chainId: number
}

export function buildAggregateParams({
    tokenIn,
    tokenOut,
    amountIn,
    minAmountOut,
    recipient,
    deadline,
    referrer,
    chainId,
}: BuildAggregateParamsInput): AggregateParams {
    return {
        tokenIn,
        tokenOut,
        amountIn,
        minAmountOut,
        recipient,
        deadline: BigInt(deadline),
        unwrapOut: isNativeToken(tokenOut) && !shouldSkipUnwrap(chainId),
        referrer,
    }
}
