import { describe, it, expect } from 'vitest'
import type { Address } from 'viem'
import { computePriceImpactPercent } from '@/hooks/useRoutePriceImpact'
import { poolKey } from '@/hooks/useV3PoolDiscovery'

describe('computePriceImpactPercent', () => {
    it('is ~0 when the full-trade rate matches the reference rate', () => {
        // full: 1000 in -> 2000 out (rate 2); reference: 1 in -> 2 out (rate 2)
        expect(computePriceImpactPercent(2000n, 1000n, 2n, 1n)).toBeCloseTo(0)
    })

    it('reports the shortfall when the full trade gets a worse rate', () => {
        // reference rate 2.0; full trade only yields 1.9 per unit -> 5% impact
        // full: 1000 in -> 1900 out; reference: 1 in -> 2 out
        expect(computePriceImpactPercent(1900n, 1000n, 2n, 1n)).toBeCloseTo(5)
    })

    it('clamps favorable rounding to 0 rather than negative impact', () => {
        // full trade rate slightly better than reference -> not negative
        expect(computePriceImpactPercent(2100n, 1000n, 2n, 1n)).toBe(0)
    })

    it('returns undefined when the reference output is zero', () => {
        expect(computePriceImpactPercent(2000n, 1000n, 0n, 1n)).toBeUndefined()
    })

    it('returns undefined when amountIn is zero', () => {
        expect(computePriceImpactPercent(2000n, 0n, 2n, 1n)).toBeUndefined()
    })
})

describe('poolKey', () => {
    const F = '0xffff000000000000000000000000000000000000' as Address
    const A = '0xaaaa000000000000000000000000000000000000' as Address
    const B = '0xbbbb000000000000000000000000000000000000' as Address

    it('is order-independent for the token pair', () => {
        expect(poolKey(F, A, B, 3000)).toBe(poolKey(F, B, A, 3000))
    })

    it('distinguishes fee tiers and factories', () => {
        expect(poolKey(F, A, B, 3000)).not.toBe(poolKey(F, A, B, 500))
        const F2 = '0xeeee000000000000000000000000000000000000' as Address
        expect(poolKey(F, A, B, 3000)).not.toBe(poolKey(F2, A, B, 3000))
    })

    it('normalizes address casing', () => {
        expect(poolKey(F, A.toUpperCase() as Address, B, 3000)).toBe(poolKey(F, A, B, 3000))
    })
})
