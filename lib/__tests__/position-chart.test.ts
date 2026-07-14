import { describe, it, expect } from 'vitest'
import {
    tickToPriceNumber,
    sqrtPriceX96ToPriceNumber,
    buildPoolPriceSeries,
    computeRangeChartDomain,
    buildLinePath,
    priceToY,
    RANGE_CHART_BUCKET_SEC,
    RANGE_CHART_WINDOW_SEC,
} from '@/lib/position-chart'
import type { PoolSwapPoint } from '@/lib/position-chart'
import { tickToPrice } from '@/lib/liquidity-helpers'

const Q96 = 2n ** 96n
const sqrtFor = (ratio: number) =>
    ((Q96 * BigInt(Math.round(Math.sqrt(ratio) * 1e9))) / 10n ** 9n).toString()

const NOW = 1_700_000_000
const BUCKET = RANGE_CHART_BUCKET_SEC
const WINDOW_START = NOW - RANGE_CHART_WINDOW_SEC

const point = (timestamp: number, ratio: number): PoolSwapPoint => ({
    timestamp,
    sqrtPriceX96: sqrtFor(ratio),
})

const build = (
    events: PoolSwapPoint[],
    anchor: PoolSwapPoint | null = null,
    extra: Partial<Parameters<typeof buildPoolPriceSeries>[0]> = {}
) =>
    buildPoolPriceSeries({
        events,
        anchor,
        decimals0: 18,
        decimals1: 18,
        nowSec: NOW,
        ...extra,
    })

describe('tickToPriceNumber', () => {
    it('returns decimal factor at tick 0', () => {
        expect(tickToPriceNumber(0, 18, 18)).toBe(1)
        expect(tickToPriceNumber(0, 18, 6)).toBeCloseTo(1e12)
    })

    it('agrees with tickToPrice from liquidity-helpers', () => {
        for (const tick of [-50000, -100, 100, 50000]) {
            const expected = parseFloat(tickToPrice(tick, 18, 18))
            const relError = Math.abs(tickToPriceNumber(tick, 18, 18) - expected) / expected
            expect(relError).toBeLessThan(1e-3)
        }
    })
})

describe('sqrtPriceX96ToPriceNumber', () => {
    it('converts sqrt = 2^96 to the decimal factor', () => {
        expect(sqrtPriceX96ToPriceNumber(Q96.toString(), 18, 18)).toBe(1)
        expect(sqrtPriceX96ToPriceNumber(Q96.toString(), 18, 6)).toBeCloseTo(1e12)
    })

    it('returns 0 for zero or malformed input', () => {
        expect(sqrtPriceX96ToPriceNumber('0', 18, 18)).toBe(0)
        expect(sqrtPriceX96ToPriceNumber('not-a-number', 18, 18)).toBe(0)
    })
})

describe('buildPoolPriceSeries', () => {
    it('buckets to the chart interval with last event per bucket winning', () => {
        const bucketStart = Math.floor((NOW - 3600) / BUCKET) * BUCKET
        const series = build([point(bucketStart + 10, 2), point(bucketStart + 800, 3)])
        const bucketPoint = series.find((p) => p.time === bucketStart)
        expect(bucketPoint?.price).toBeCloseTo(3)
        expect(series.every((p) => p.time % BUCKET === 0)).toBe(true)
    })

    it('carries the last price forward through gaps to now', () => {
        const series = build([point(NOW - 6 * 3600, 5)])
        expect(series[series.length - 1]!.price).toBeCloseTo(5)
        expect(series[series.length - 1]!.time).toBe(Math.floor(NOW / BUCKET) * BUCKET)
    })

    it('fills opening buckets from the anchor until the first event', () => {
        const eventTime = NOW - 3600
        const series = build([point(eventTime, 4)], point(WINDOW_START - 100, 2))
        expect(series[0]!.price).toBeCloseTo(2)
        const eventBucket = Math.floor(eventTime / BUCKET) * BUCKET
        expect(series.find((p) => p.time === eventBucket)?.price).toBeCloseTo(4)
    })

    it('spans the full window even with a single recent event', () => {
        const series = build([point(NOW - 100, 4)])
        expect(series[0]!.time).toBe(Math.floor(WINDOW_START / BUCKET) * BUCKET)
        expect(series.length).toBe(RANGE_CHART_WINDOW_SEC / BUCKET + 1)
    })

    it('produces a flat line from the anchor when there are no events', () => {
        const series = build([], point(WINDOW_START - 5000, 7))
        expect(series.length).toBeGreaterThan(0)
        expect(series.every((p) => Math.abs(p.price - 7) < 1e-6)).toBe(true)
    })

    it('falls back to the current tick price when there is no data at all', () => {
        const series = build([], null, { fallbackTick: 0 })
        expect(series.length).toBeGreaterThan(0)
        expect(series.every((p) => p.price === 1)).toBe(true)
    })

    it('returns empty without events, anchor, or fallback tick', () => {
        expect(build([], null)).toEqual([])
    })

    it('ignores unusable rows', () => {
        const series = build(
            [{ timestamp: NOW - 3600, sqrtPriceX96: '0' }, point(NOW - 1800, 3)],
            null
        )
        expect(series.every((p) => Math.abs(p.price - 3) < 1e-6)).toBe(true)
    })
})

describe('computeRangeChartDomain', () => {
    it('uses the padded price extent when the band is inside it', () => {
        const domain = computeRangeChartDomain({
            prices: [1, 4],
            priceLower: 2,
            priceUpper: 3,
        })
        expect(domain.yMin).toBeCloseTo(1 - 3 * 0.12)
        expect(domain.yMax).toBeCloseTo(4 + 3 * 0.12)
    })

    it('clamps a band edge far beyond the price action', () => {
        const domain = computeRangeChartDomain({
            prices: [0.9, 1.1],
            priceLower: 0.8,
            priceUpper: 100,
        })
        expect(domain.yMax).toBeLessThan(5)
        expect(domain.yMin).toBeLessThanOrEqual(0.8)
    })

    it('includes the near band edge for an out-of-range position', () => {
        const domain = computeRangeChartDomain({
            prices: [5, 5.2],
            priceLower: 3,
            priceUpper: 4,
        })
        expect(domain.yMin).toBeLessThanOrEqual(4)
        expect(domain.yMax).toBeGreaterThanOrEqual(5.2)
    })

    it('expands a flat series into a non-degenerate domain', () => {
        const domain = computeRangeChartDomain({ prices: [2, 2, 2] })
        expect(domain.yMax).toBeGreaterThan(domain.yMin)
        expect(domain.yMin).toBeGreaterThanOrEqual(0)
    })

    it('never goes below zero', () => {
        const domain = computeRangeChartDomain({
            prices: [0.001, 0.002],
            priceLower: 0.0005,
            priceUpper: 0.003,
        })
        expect(domain.yMin).toBeGreaterThanOrEqual(0)
    })

    it('uses only the price extent for full range (no band args)', () => {
        const domain = computeRangeChartDomain({ prices: [1, 2] })
        expect(domain.yMin).toBeCloseTo(1 - 0.12)
        expect(domain.yMax).toBeCloseTo(2 + 0.12)
    })
})

describe('buildLinePath / priceToY', () => {
    const domain = { yMin: 0, yMax: 10 }

    it('inverts y so higher prices sit higher on the chart', () => {
        expect(priceToY(10, domain, 56)).toBe(0)
        expect(priceToY(0, domain, 56)).toBe(56)
        expect(priceToY(5, domain, 56)).toBe(28)
    })

    it('builds an exact path for two points', () => {
        const path = buildLinePath(
            [
                { time: 0, price: 0 },
                { time: 100, price: 10 },
            ],
            domain,
            200,
            56
        )
        expect(path).toBe('M0 56 L200 0')
    })

    it('returns empty for an empty series', () => {
        expect(buildLinePath([], domain, 200, 56)).toBe('')
    })
})
