import { describe, it, expect, vi, beforeEach } from 'vitest'
import { decodeAbiParameters, size, type Address } from 'viem'
import { ProtocolType } from '@coshi190/junoswap-sdk'
import type { RouteQuote } from '@/types/routing'
import type { LegCandidate } from '@/services/dex/cross-dex-routing'
import type { SplitAllocation } from '@/services/dex/split-routing'

const NATIVE = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' as Address
const WNATIVE = '0x67ebd850304c70d983b2d1b93ea79c7cd6c3f6b5' as Address
const KUSDT = '0x7d984C24d2499D840eB3b7016077164e15E5faA6' as Address
const CMM = '0x9B005000A10Ac871947D99001345b01C1cEf2790' as Address
const UDON_FACTORY = '0x18c7a4CA020A0c648976208dF2e3AE1BAA32e8d1' as Address
const JUNO_FACTORY = '0x090C6E5fF29251B1eF9EC31605Bdd13351eA316C' as Address

vi.mock('@coshi190/junoswap-sdk', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    ProtocolType: { V2: 'v2', V3: 'v3' },
    getV2Config: vi.fn((_c: number, dexId: string) =>
        dexId === 'udonswap' ? { factory: UDON_FACTORY } : undefined
    ),
    getV3Config: vi.fn((_c: number, dexId: string) =>
        dexId === 'junoswap' ? { factory: JUNO_FACTORY } : undefined
    ),
}))

const getModule = () => import('@/services/dex/agg-plan')

function directRoute(dexId: string, protocol: ProtocolType, fee?: number): RouteQuote {
    return {
        route: {
            path: [NATIVE, KUSDT],
            fees: fee ? [fee] : undefined,
            isMultiHop: false,
            intermediaryTokens: [],
        },
        quote: {
            amountOut: 0n,
            sqrtPriceX96After: 0n,
            initializedTicksCrossed: 0,
            gasEstimate: 0n,
        },
        dexId,
        protocolType: protocol,
    }
}

const splitAllocation: SplitAllocation = {
    routeA: directRoute('udonswap', ProtocolType.V2),
    routeB: directRoute('junoswap', ProtocolType.V3, 3000),
    amountInA: 80n,
    amountInB: 20n,
    predictedNetOut: 500n,
}

const crossLeg: LegCandidate = {
    hops: [
        {
            dexId: 'udonswap',
            protocol: ProtocolType.V2,
            factory: UDON_FACTORY,
            tokenIn: WNATIVE,
            tokenOut: KUSDT,
        },
        {
            dexId: 'junoswap',
            protocol: ProtocolType.V3,
            factory: JUNO_FACTORY,
            tokenIn: KUSDT,
            tokenOut: CMM,
            fee: 500,
        },
    ],
    predictedOut: 1000n,
    poolKeys: ['k1', 'k2'],
}

describe('services/dex/agg-plan', () => {
    beforeEach(() => vi.clearAllMocks())

    it('splitToPlan resolves each leg to a single-DEX hop with the native endpoint wrapped', async () => {
        const { splitToPlan } = await getModule()
        const plan = splitToPlan(splitAllocation, 96)
        expect(plan.kind).toBe('split')
        expect(plan.predictedNetOut).toBe(500n)
        expect(plan.legs.map((l) => l.amountIn)).toEqual([80n, 20n])
        expect(plan.legs[0]!.hops).toHaveLength(1)
        expect(plan.legs[0]!.hops[0]).toMatchObject({
            dexId: 'udonswap',
            tokenIn: WNATIVE,
            tokenOut: KUSDT,
        })
        expect(plan.legs[1]!.hops[0]).toMatchObject({ dexId: 'junoswap', fee: 3000 })
    })

    it('crossDexToPlan makes one multi-hop leg and applies the fee haircut', async () => {
        const { crossDexToPlan } = await getModule()
        const plan = crossDexToPlan(crossLeg, 100n, 100) // 1% fee
        expect(plan.kind).toBe('cross-dex')
        expect(plan.predictedNetOut).toBe(990n)
        expect(plan.legs).toHaveLength(1)
        expect(plan.legs[0]!.hops.map((h) => h.dexId)).toEqual(['udonswap', 'junoswap'])
    })

    it('bestPlan picks the higher net output', async () => {
        const { bestPlan, splitToPlan, crossDexToPlan } = await getModule()
        const split = splitToPlan(splitAllocation, 96) // 500
        const cross = crossDexToPlan(crossLeg, 100n, 0) // 1000
        expect(bestPlan(split, cross)).toBe(cross)
        expect(bestPlan(split, null)).toBe(split)
        expect(bestPlan(null, null)).toBeNull()
    })

    it('planToLegs encodes each hop with its own factory', async () => {
        const { planToLegs, crossDexToPlan } = await getModule()
        const legs = planToLegs(crossDexToPlan(crossLeg, 100n, 0))
        expect(legs).toHaveLength(1)
        expect(legs[0]!.hops.map((h) => h.factory)).toEqual([UDON_FACTORY, JUNO_FACTORY])
        expect(size(legs[0]!.hops[0]!.swapData)).toBe(32) // V2: address only
        expect(size(legs[0]!.hops[1]!.swapData)).toBe(64) // V3: address + fee
        expect(decodeAbiParameters([{ type: 'address' }], legs[0]!.hops[0]!.swapData)).toEqual([
            KUSDT,
        ])
    })

    it('describePlan reports per-leg share and per-hop DEX chain', async () => {
        const { describePlan, crossDexToPlan } = await getModule()
        const sym: Record<string, string> = { [WNATIVE]: 'KKUB', [KUSDT]: 'KUSDT', [CMM]: 'CMM' }
        const rows = describePlan(crossDexToPlan(crossLeg, 100n, 0), (a) => sym[a] ?? '?')
        expect(rows).toHaveLength(1)
        expect(rows[0]!.percent).toBe(100)
        expect(rows[0]!.hops).toEqual([
            { dexId: 'udonswap', symbolIn: 'KKUB', symbolOut: 'KUSDT' },
            { dexId: 'junoswap', symbolIn: 'KUSDT', symbolOut: 'CMM' },
        ])
    })
})
