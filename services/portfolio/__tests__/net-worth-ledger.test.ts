import { describe, it, expect } from 'vitest'
import {
    reconstructBalanceSteps,
    makeNativePriceAt,
    buildLedgerNetWorthSeries,
    type LedgerToken,
} from '../net-worth-ledger'

const NOW = 1_800_000_000
const DAY = 86_400
const WINDOW_START = NOW - DAY

describe('reconstructBalanceSteps', () => {
    it('walks trades backward to recover the balance at each moment', () => {
        // Ends holding 100. Bought 10 at t1, sold 4 at t2.
        const steps = reconstructBalanceSteps(100, [
            { timestamp: NOW - 4_000, delta: -4 },
            { timestamp: NOW - 8_000, delta: 10 },
        ])

        // start = 100 - (10 - 4) = 94; after buy = 104; after sell = 100
        expect(steps).toEqual([
            { fromTs: 0, balance: 94 },
            { fromTs: NOW - 8_000, balance: 104 },
            { fromTs: NOW - 4_000, balance: 100 },
        ])
    })

    it('recovers a zero starting balance for a position opened in-window', () => {
        // Holds 50 now, all from a single buy — before it, held nothing.
        const steps = reconstructBalanceSteps(50, [{ timestamp: NOW - 10_000, delta: 50 }])
        expect(steps[0]).toEqual({ fromTs: 0, balance: 0 })
        expect(steps[1]).toEqual({ fromTs: NOW - 10_000, balance: 50 })
    })
})

describe('makeNativePriceAt', () => {
    it('returns the last price at or before t, falling back to the first', () => {
        const at = makeNativePriceAt([
            { timestamp: 100, price: 1 },
            { timestamp: 200, price: 2 },
            { timestamp: 300, price: 3 },
        ])
        expect(at(50)).toBe(1) // before first
        expect(at(100)).toBe(1)
        expect(at(250)).toBe(2)
        expect(at(999)).toBe(3)
    })

    it('returns 0 for an empty series', () => {
        expect(makeNativePriceAt([])(123)).toBe(0)
    })
})

describe('buildLedgerNetWorthSeries', () => {
    const base = {
        nativeUsdPoints: [
            { timestamp: WINDOW_START, price: 1 },
            { timestamp: NOW - 1_000, price: 1 },
        ],
        nativeUsdNow: 1,
        windowStart: WINDOW_START,
        nowSec: NOW,
    }

    it('reflects a position opened mid-window rising after purchase', () => {
        // Bought 100 tokens halfway through the day; token native price doubles.
        const midpoint = NOW - DAY / 2
        const token: LedgerToken = {
            currentBalance: 100,
            deltas: [{ timestamp: midpoint, delta: 100 }],
            priceKind: 'reconstructed',
            nativePricePoints: [
                { timestamp: midpoint, price: 1 },
                { timestamp: NOW - 1_000, price: 2 },
            ],
            priceUsdNow: 2,
        }

        const series = buildLedgerNetWorthSeries({ ...base, tokens: [token], netWorthNow: 200 })

        // Before the buy, the token wasn't held → net worth 0 at window start.
        expect(series[0]).toEqual({ timestamp: WINDOW_START, value: 0 })
        // Right after the buy: 100 tokens × price 1 × KUB/USD 1 = 100.
        const atBuy = series.find((p) => p.timestamp === midpoint)
        expect(atBuy?.value).toBe(100)
        // Pinned to exact current net worth.
        expect(series[series.length - 1]).toEqual({ timestamp: NOW, value: 200 })
    })

    it('holds a stable position flat and tracks KUB/USD for a native position', () => {
        const stable: LedgerToken = {
            currentBalance: 500,
            deltas: [],
            priceKind: 'stable',
            nativePricePoints: [],
            priceUsdNow: 1,
        }
        const native: LedgerToken = {
            currentBalance: 10,
            deltas: [],
            priceKind: 'native',
            nativePricePoints: [],
            priceUsdNow: 2,
        }
        const series = buildLedgerNetWorthSeries({
            ...base,
            nativeUsdPoints: [
                { timestamp: WINDOW_START, price: 2 },
                { timestamp: NOW - DAY / 2, price: 3 },
            ],
            nativeUsdNow: 3,
            tokens: [stable, native],
            netWorthNow: 530,
        })

        // window start: 500 stable + 10 KUB × $2 = 520
        expect(series[0]).toEqual({ timestamp: WINDOW_START, value: 520 })
        // after KUB rises to $3: 500 + 10 × $3 = 530
        const mid = series.find((p) => p.timestamp === NOW - DAY / 2)
        expect(mid?.value).toBe(530)
    })

    it('KUB-scales a fallback token with no native price history', () => {
        const token: LedgerToken = {
            currentBalance: 4,
            deltas: [],
            priceKind: 'fallback',
            nativePricePoints: [],
            priceUsdNow: 25, // $100 total now
        }
        const series = buildLedgerNetWorthSeries({
            ...base,
            nativeUsdPoints: [
                { timestamp: WINDOW_START, price: 1 },
                { timestamp: NOW - DAY / 2, price: 2 },
            ],
            nativeUsdNow: 2,
            tokens: [token],
            netWorthNow: 100,
        })

        // window start KUB/USD 1 vs now 2 → value halves: 4 × 25 × 1/2 = 50
        expect(series[0]).toEqual({ timestamp: WINDOW_START, value: 50 })
    })

    it('reconstructed token with empty history degrades to the fallback formula', () => {
        const token: LedgerToken = {
            currentBalance: 2,
            deltas: [],
            priceKind: 'reconstructed',
            nativePricePoints: [],
            priceUsdNow: 10,
        }
        const series = buildLedgerNetWorthSeries({
            ...base,
            nativeUsdPoints: [
                { timestamp: WINDOW_START, price: 1 },
                { timestamp: NOW - 1_000, price: 1 },
            ],
            nativeUsdNow: 1,
            tokens: [token],
            netWorthNow: 20,
        })
        expect(series[0]).toEqual({ timestamp: WINDOW_START, value: 20 })
    })

    it('returns empty when net worth or KUB price is non-positive', () => {
        const token: LedgerToken = {
            currentBalance: 1,
            deltas: [],
            priceKind: 'native',
            nativePricePoints: [],
            priceUsdNow: 1,
        }
        expect(buildLedgerNetWorthSeries({ ...base, tokens: [token], netWorthNow: 0 })).toEqual([])
        expect(
            buildLedgerNetWorthSeries({ ...base, nativeUsdNow: 0, tokens: [token], netWorthNow: 5 })
        ).toEqual([])
    })

    it('bounds and orders a dense series, pinning the final point', () => {
        const nativeUsdPoints = Array.from({ length: 1_000 }, (_, i) => ({
            timestamp: WINDOW_START + 20 + i * 80,
            price: 2 + Math.sin(i / 50),
        }))
        const token: LedgerToken = {
            currentBalance: 10,
            deltas: [],
            priceKind: 'native',
            nativePricePoints: [],
            priceUsdNow: 20,
        }
        const series = buildLedgerNetWorthSeries({
            windowStart: WINDOW_START,
            nowSec: NOW,
            nativeUsdPoints,
            nativeUsdNow: 2,
            tokens: [token],
            netWorthNow: 20,
        })

        expect(series.length).toBeLessThanOrEqual(97)
        expect(series[series.length - 1]).toEqual({ timestamp: NOW, value: 20 })
        for (let i = 1; i < series.length; i++) {
            expect(series[i]!.timestamp).toBeGreaterThan(series[i - 1]!.timestamp)
        }
    })
})
