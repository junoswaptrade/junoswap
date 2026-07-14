import type { Address } from 'viem'
import type { RouteQuote } from '@/types/routing'
import { ProtocolType, getV2Config, getV3Config, resolveSwapPath } from '@coshi190/junoswap-sdk'
import { legToHops, type Leg, type ResolvedHop } from './agg-router'
import type { SplitAllocation } from './split-routing'
import type { LegCandidate } from './cross-dex-routing'

export interface PlanLeg {
    amountIn: bigint
    hops: ResolvedHop[]
}

export interface AggregatorPlan {
    kind: 'split' | 'cross-dex'
    legs: PlanLeg[]
    predictedNetOut: bigint
}

function routeToResolvedHops(rq: RouteQuote, chainId: number): ResolvedHop[] {
    const isV3 = rq.protocolType === ProtocolType.V3
    const cfg = isV3 ? getV3Config(chainId, rq.dexId) : getV2Config(chainId, rq.dexId)
    if (!cfg?.factory) throw new Error(`no factory for ${rq.dexId} on chain ${chainId}`)
    const wnative = isV3 ? undefined : getV2Config(chainId, rq.dexId)?.wnative
    const path = resolveSwapPath(rq.route.path, chainId, wnative)

    const hops: ResolvedHop[] = []
    for (let i = 0; i < path.length - 1; i++) {
        hops.push({
            dexId: rq.dexId,
            protocol: rq.protocolType,
            factory: cfg.factory,
            tokenIn: path[i]!,
            tokenOut: path[i + 1]!,
            fee: isV3 ? rq.route.fees?.[i] : undefined,
        })
    }
    return hops
}

export function splitToPlan(allocation: SplitAllocation, chainId: number): AggregatorPlan {
    return {
        kind: 'split',
        predictedNetOut: allocation.predictedNetOut,
        legs: [
            {
                amountIn: allocation.amountInA,
                hops: routeToResolvedHops(allocation.routeA, chainId),
            },
            {
                amountIn: allocation.amountInB,
                hops: routeToResolvedHops(allocation.routeB, chainId),
            },
        ],
    }
}

export function crossDexToPlan(
    leg: LegCandidate,
    amountIn: bigint,
    aggFeeBps: number
): AggregatorPlan {
    return {
        kind: 'cross-dex',
        predictedNetOut: (leg.predictedOut * BigInt(10000 - aggFeeBps)) / 10000n,
        legs: [{ amountIn, hops: leg.hops }],
    }
}

export function bestPlan(
    a: AggregatorPlan | null,
    b: AggregatorPlan | null
): AggregatorPlan | null {
    if (!a) return b
    if (!b) return a
    return b.predictedNetOut > a.predictedNetOut ? b : a
}

export function planToLegs(plan: AggregatorPlan): Leg[] {
    return plan.legs.map((l) => ({ amountIn: l.amountIn, hops: legToHops(l.hops) }))
}

export interface PlanDisplayHop {
    dexId: string
    symbolIn: string
    symbolOut: string
}

export interface PlanDisplayLeg {
    percent: number
    hops: PlanDisplayHop[]
}

export function describePlan(
    plan: AggregatorPlan,
    symbolOf: (token: Address) => string
): PlanDisplayLeg[] {
    const total = plan.legs.reduce((sum, l) => sum + l.amountIn, 0n)
    return plan.legs.map((l) => ({
        percent: total === 0n ? 0 : Number((l.amountIn * 10000n) / total) / 100,
        hops: l.hops.map((h) => ({
            dexId: h.dexId,
            symbolIn: symbolOf(h.tokenIn),
            symbolOut: symbolOf(h.tokenOut),
        })),
    }))
}
