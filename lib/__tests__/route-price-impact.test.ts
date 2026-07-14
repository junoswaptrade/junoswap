import { describe, it, expect } from 'vitest'
import { computePriceImpactPercent } from '@/hooks/useRoutePriceImpact'

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
