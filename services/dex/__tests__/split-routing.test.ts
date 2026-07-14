import { describe, it, expect } from 'vitest'
import type { Address } from 'viem'
import { ProtocolType } from '@coshi190/junoswap-sdk'
import type { RouteQuote } from '@/types/routing'
import {
    selectSplitCandidates,
    computeGridAmounts,
    pickBestSplit,
    splitClearsMargin,
    type SplitQuoteGrid,
} from '@/services/dex/split-routing'

const TOKEN_IN = '0x1111111111111111111111111111111111111111' as Address
const TOKEN_OUT = '0x2222222222222222222222222222222222222222' as Address

function route(dexId: string, amountOut: bigint, isMultiHop = false): RouteQuote {
    return {
        route: {
            path: isMultiHop
                ? [TOKEN_IN, '0x3333333333333333333333333333333333333333' as Address, TOKEN_OUT]
                : [TOKEN_IN, TOKEN_OUT],
            isMultiHop,
            intermediaryTokens: [],
        },
        quote: { amountOut, sqrtPriceX96After: 0n, initializedTicksCrossed: 0, gasEstimate: 0n },
        dexId,
        protocolType: ProtocolType.V2,
    }
}

describe('services/dex/split-routing', () => {
    describe('selectSplitCandidates', () => {
        it('returns the top two direct routes across distinct DEXes', () => {
            const picked = selectSplitCandidates([
                route('udonswap', 100n),
                route('junoswap', 120n),
                route('ponder', 90n),
            ])
            expect(picked?.map((r) => r.dexId)).toEqual(['junoswap', 'udonswap'])
        })

        it('keeps only the best route per DEX before ranking', () => {
            const picked = selectSplitCandidates([
                route('udonswap', 80n),
                route('udonswap', 110n),
                route('junoswap', 100n),
            ])
            expect(picked?.map((r) => r.dexId)).toEqual(['udonswap', 'junoswap'])
            expect(picked?.[0]!.quote.amountOut).toBe(110n)
        })

        it('ignores multi-hop routes', () => {
            expect(
                selectSplitCandidates([route('udonswap', 100n), route('junoswap', 120n, true)])
            ).toBeNull()
        })

        it('returns null when fewer than two DEXes qualify', () => {
            expect(selectSplitCandidates([route('udonswap', 100n)])).toBeNull()
        })
    })

    describe('computeGridAmounts', () => {
        it('produces exact legs that always sum to amountIn', () => {
            const amountIn = 1_000_000_000_000_000_001n // odd, to catch rounding
            const { amountsInA, amountsInB } = computeGridAmounts(amountIn, [0.1, 0.5, 0.9])
            amountsInA.forEach((a, i) => expect(a + amountsInB[i]!).toBe(amountIn))
            expect(amountsInA[1]).toBe(amountIn / 2n)
        })
    })

    describe('pickBestSplit', () => {
        const base = {
            candidateA: route('junoswap', 120n),
            candidateB: route('udonswap', 100n),
            aggFeeBps: 0,
        }

        it('picks the interior allocation that beats routing everything through one DEX', () => {
            // 50/50 yields 70+70=140, beating the best single route (120).
            const grid: SplitQuoteGrid = {
                ...base,
                amountsInA: [30n, 50n, 70n],
                amountsInB: [70n, 50n, 30n],
                grossA: [45n, 70n, 90n],
                grossB: [50n, 70n, 40n],
                bestSingleOut: 120n,
                aggFeeBps: 0,
            }
            const best = pickBestSplit(grid)
            expect(best?.predictedNetOut).toBe(140n)
            expect(best?.amountInA).toBe(50n)
            expect(best?.amountInB).toBe(50n)
        })

        it('returns null when one route dominates every split', () => {
            const grid: SplitQuoteGrid = {
                ...base,
                amountsInA: [30n, 50n, 70n],
                amountsInB: [70n, 50n, 30n],
                grossA: [30n, 55n, 80n],
                grossB: [55n, 50n, 30n],
                bestSingleOut: 120n, // 85, 105, 110 all fall short
                aggFeeBps: 0,
            }
            expect(pickBestSplit(grid)).toBeNull()
        })

        it('applies the aggregator fee haircut to the predicted output', () => {
            const grid: SplitQuoteGrid = {
                ...base,
                amountsInA: [50n],
                amountsInB: [50n],
                grossA: [5000n],
                grossB: [5000n],
                bestSingleOut: 9000n,
                aggFeeBps: 100, // 1% -> 10000 net
            }
            expect(pickBestSplit(grid)?.predictedNetOut).toBe(9900n)
        })

        it('skips grid points where a leg failed to quote', () => {
            const grid: SplitQuoteGrid = {
                ...base,
                amountsInA: [50n, 70n],
                amountsInB: [50n, 30n],
                grossA: [null, 90n],
                grossB: [70n, 40n],
                bestSingleOut: 120n,
                aggFeeBps: 0,
            }
            expect(pickBestSplit(grid)?.amountInA).toBe(70n)
        })
    })

    describe('splitClearsMargin', () => {
        // 50 bps margin: a plan must beat the baseline by strictly more than 0.5%.
        const marginBps = 50

        it('clears when the predicted output beats the baseline by more than the margin', () => {
            // 1010 vs 1000 is a 1.0% improvement — above the 0.5% margin.
            expect(splitClearsMargin(1010n, 1000n, marginBps)).toBe(true)
        })

        it('does not clear when the improvement is within the margin', () => {
            // 1004 vs 1000 is a 0.4% improvement — below the 0.5% margin.
            expect(splitClearsMargin(1004n, 1000n, marginBps)).toBe(false)
        })

        it('does not clear when the improvement equals the margin exactly (strictly greater)', () => {
            // 1005 vs 1000 is exactly the 0.5% threshold; the comparison is strict.
            expect(splitClearsMargin(1005n, 1000n, marginBps)).toBe(false)
        })

        it('returns false when there is no aggregator output', () => {
            expect(splitClearsMargin(null, 1000n, marginBps)).toBe(false)
        })

        it('clears by default when no single-DEX baseline exists (the only available route)', () => {
            expect(splitClearsMargin(1n, null, marginBps)).toBe(true)
        })

        it('returns false when neither output nor baseline exists', () => {
            expect(splitClearsMargin(null, null, marginBps)).toBe(false)
        })
    })
})
