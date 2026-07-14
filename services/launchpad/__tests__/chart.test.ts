import { describe, it, expect } from 'vitest'
import {
    aggregateCandlesticks,
    aggregatePricePoints,
    aggregateV3Candlesticks,
    buildContinuousSeries,
    buildCreatorMarkers,
    computeDailyMetrics,
    computeFeeBreakdown,
    extractCreatorTrades,
    sanitizeCandles,
    tokenNativeCandles,
    ratioCandles,
    SAFE_CANDLE_VALUE_MAX,
} from '@/services/launchpad/chart'
import type { V3SwapEvent } from '@/services/launchpad/chart'
import type { CandlestickData } from '@/types/chart'

const NATIVE = (n: number) => BigInt(n) * 10n ** 18n
const TOKENS = (n: number) => BigInt(n) * 10n ** 18n

const makeEvent = (
    timestamp: number,
    isBuy: boolean,
    amountIn: bigint,
    amountOut: bigint,
    reserveIn: bigint,
    reserveOut: bigint
) => ({
    timestamp,
    isBuy,
    amountIn,
    amountOut,
    reserveIn,
    reserveOut,
})

describe('aggregateCandlesticks', () => {
    it('returns empty array for empty events', () => {
        expect(aggregateCandlesticks([], '1h')).toEqual([])
    })

    it('creates correct candlestick from single event', () => {
        const events = [makeEvent(1000, true, NATIVE(10), TOKENS(100), NATIVE(100), TOKENS(900))]
        const candles = aggregateCandlesticks(events, '1h', 'price')
        expect(candles).toHaveLength(1)
        const candle = candles[0]!
        expect(candle.time).toBe(0)
        expect(candle.open).toBeGreaterThan(0)
        expect(candle.close).toBeGreaterThan(0)
        expect(candle.volume).toBeGreaterThan(0)
    })

    it('uses pre-swap price as candle open for first trade in bucket', () => {
        // Buy: post-swap native=110, tokens=800
        // Pre-swap: native=100, tokens=900 → open = 3500/900 ≈ 3.889
        // Post-swap price = 3510/800 ≈ 4.388
        const events = [makeEvent(1000, true, NATIVE(10), TOKENS(100), NATIVE(110), TOKENS(800))]
        const candles = aggregateCandlesticks(events, '1h', 'price')
        expect(candles).toHaveLength(1)
        const candle = candles[0]!
        expect(candle.open).toBeCloseTo(3500 / 900, 4)
        expect(candle.close).toBeCloseTo(3510 / 800, 4)
    })

    it('open equals previous candle close (no gaps)', () => {
        // Trade 1 at t=100: buy → post-swap native=110, tokens=800
        const event1 = makeEvent(100, true, NATIVE(10), TOKENS(100), NATIVE(110), TOKENS(800))

        // Trade 2 at t=3700 (next hour): sell
        // Pre-swap for this trade: native=110, tokens=800 (resting state from event1)
        // So candle2.open = (110+3400)/800 = candle1.close
        const event2 = makeEvent(3700, false, TOKENS(50), NATIVE(5), TOKENS(850), NATIVE(105))

        const candles = aggregateCandlesticks([event1, event2], '1h', 'price')
        expect(candles.length).toBeGreaterThanOrEqual(2)
        expect(candles[1]!.open).toBeCloseTo(candles[0]!.close, 6)
    })

    it('open equals previous candle close for sell-then-buy', () => {
        // Trade 1 at t=100: sell → post-swap native=95, tokens=850
        const event1 = makeEvent(100, false, TOKENS(50), NATIVE(5), TOKENS(850), NATIVE(95))

        // Trade 2 at t=3700 (next hour): buy
        // Pre-swap: native=95, tokens=850 (resting state)
        const event2 = makeEvent(3700, true, NATIVE(10), TOKENS(100), NATIVE(105), TOKENS(750))

        const candles = aggregateCandlesticks([event1, event2], '1h', 'price')
        expect(candles.length).toBeGreaterThanOrEqual(2)
        expect(candles[1]!.open).toBeCloseTo(candles[0]!.close, 6)
    })

    it('aggregates events in same time bucket', () => {
        const events = [
            makeEvent(100, true, NATIVE(10), TOKENS(100), NATIVE(110), TOKENS(800)),
            makeEvent(200, true, NATIVE(20), TOKENS(50), NATIVE(130), TOKENS(750)),
        ]
        const candles = aggregateCandlesticks(events, '1h', 'price')
        expect(candles).toHaveLength(1)
        expect(candles[0]!.volume).toBeGreaterThan(0)
        // Close should be the post-swap price of the second event
        // nativeReserve=130, tokenReserve=750 → (130+3400)/750 ≈ 4.7067
        expect(candles[0]!.close).toBeCloseTo(3530 / 750, 4)
    })

    it('creates separate candles for different time buckets', () => {
        const events = [
            makeEvent(100, true, NATIVE(10), TOKENS(100), NATIVE(110), TOKENS(800)),
            makeEvent(3700, true, NATIVE(10), TOKENS(100), NATIVE(120), TOKENS(700)),
        ]
        const candles = aggregateCandlesticks(events, '1h')
        expect(candles).toHaveLength(2)
    })

    it('forward-fills missing time buckets between trades', () => {
        const events = [
            makeEvent(100, true, NATIVE(10), TOKENS(100), NATIVE(110), TOKENS(800)),
            makeEvent(7200 + 100, true, NATIVE(10), TOKENS(50), NATIVE(120), TOKENS(750)),
        ]
        const candles = aggregateCandlesticks(events, '1h')
        expect(candles).toHaveLength(3)
    })

    it('forward-filled candles use prev close for continuity', () => {
        const events = [
            makeEvent(100, true, NATIVE(10), TOKENS(100), NATIVE(110), TOKENS(800)),
            makeEvent(7200 + 100, true, NATIVE(10), TOKENS(50), NATIVE(120), TOKENS(750)),
        ]
        const candles = aggregateCandlesticks(events, '1h')
        expect(candles[1]!.open).toBe(candles[0]!.close)
        expect(candles[1]!.high).toBe(candles[0]!.close)
        expect(candles[1]!.low).toBe(candles[0]!.close)
        expect(candles[1]!.close).toBe(candles[0]!.close)
        expect(candles[1]!.volume).toBe(0)
    })

    it('works with different timeframes', () => {
        const events = [makeEvent(100, true, NATIVE(10), TOKENS(100), NATIVE(110), TOKENS(800))]
        const candles1m = aggregateCandlesticks(events, '1m')
        const candles1d = aggregateCandlesticks(events, '1d')
        expect(candles1m[0]!.time).toBe(60)
        expect(candles1d[0]!.time).toBe(0)
    })

    it('candle high/low include open price', () => {
        // Buy: pre-swap price < post-swap price (buy pushes price up)
        const events = [makeEvent(1000, true, NATIVE(10), TOKENS(100), NATIVE(110), TOKENS(800))]
        const candles = aggregateCandlesticks(events, '1h', 'price')
        const candle = candles[0]!
        expect(candle.high).toBe(Math.max(candle.open, candle.close))
        expect(candle.low).toBe(Math.min(candle.open, candle.close))
    })
})

describe('aggregatePricePoints', () => {
    const pt = (timestamp: number, price: number) => ({ timestamp, price })

    it('returns empty array for empty points', () => {
        expect(aggregatePricePoints([], '1h')).toEqual([])
    })

    it('builds one zero-volume candle from a single point', () => {
        const candles = aggregatePricePoints([pt(100, 1.5)], '1h')
        expect(candles).toHaveLength(1)
        expect(candles[0]).toMatchObject({
            time: 0,
            open: 1.5,
            high: 1.5,
            low: 1.5,
            close: 1.5,
            volume: 0,
        })
    })

    it('uses first point as open, last as close, extremes for high/low in a bucket', () => {
        const candles = aggregatePricePoints([pt(100, 1), pt(200, 2), pt(300, 0.5)], '1h')
        expect(candles).toHaveLength(1)
        expect(candles[0]).toMatchObject({ open: 1, high: 2, low: 0.5, close: 0.5 })
    })

    it('buckets points by timeframe (sparse — no gap fill here)', () => {
        // A missing bucket between is NOT filled; that is buildContinuousSeries' job.
        const candles = aggregatePricePoints([pt(100, 1), pt(7300, 5)], '1h')
        expect(candles.map((c) => c.time)).toEqual([0, 7200])
        expect(candles[0]!.close).toBe(1)
        expect(candles[1]!.open).toBe(5)
    })

    it('skips non-positive prices', () => {
        const candles = aggregatePricePoints([pt(100, 0), pt(200, -1), pt(300, 2)], '1h')
        expect(candles).toHaveLength(1)
        expect(candles[0]).toMatchObject({ open: 2, close: 2 })
    })
})

describe('sanitizeCandles', () => {
    const candle = (over: Partial<CandlestickData> = {}): CandlestickData => ({
        time: 0,
        open: 1,
        high: 1,
        low: 1,
        close: 1,
        volume: 0,
        ...over,
    })

    it('drops candles with out-of-range OHLC (boundary V3 sqrtPrice ~2^128)', () => {
        const good = candle({ time: 60 })
        const bad = candle({
            open: 3.402567868363881e38,
            high: 3.4e38,
            low: 3.4e38,
            close: 3.4e38,
        })
        expect(sanitizeCandles([bad, good])).toEqual([good])
    })

    it('drops non-finite values', () => {
        expect(sanitizeCandles([candle({ close: Infinity }), candle({ open: NaN })])).toEqual([])
    })

    it('zeroes an out-of-range volume but keeps the candle', () => {
        const result = sanitizeCandles([candle({ volume: 1e30 })])
        expect(result).toHaveLength(1)
        expect(result[0]!.volume).toBe(0)
    })

    it('keeps valid candles unchanged', () => {
        const c = candle({ open: 0.5, high: 0.7, low: 0.4, close: 0.6, volume: 123 })
        expect(sanitizeCandles([c])).toEqual([c])
    })

    // Regression: a token/native V3 swap at the price-boundary sqrtPrice produced a
    // ~2^128 (3.4e38) price that crashed lightweight-charts' setData.
    it('removes a boundary-sqrtPrice V3 candle so nothing unsafe reaches the chart', () => {
        const MAX_SQRT_RATIO = '1461446703485210103287273052203988822378723970341'
        const raw = aggregateV3Candlesticks(
            [
                {
                    timestamp: 100,
                    amount0: '1000',
                    amount1: '1000',
                    sqrtPriceX96: MAX_SQRT_RATIO,
                    tick: 0,
                },
            ],
            '1h',
            'price',
            true
        )
        expect(raw.some((c) => Math.abs(c.close) > SAFE_CANDLE_VALUE_MAX)).toBe(true)
        expect(sanitizeCandles(raw)).toEqual([])
    })
})

describe('buildContinuousSeries', () => {
    const c = (
        time: number,
        open: number,
        high: number,
        low: number,
        close: number
    ): CandlestickData => ({ time, open, high, low, close, volume: 0 })

    it('returns empty for empty input', () => {
        expect(buildContinuousSeries([], '1h')).toEqual([])
    })

    it('snaps each candle open to the previous close and expands high/low', () => {
        const input = [c(0, 10, 12, 9, 11), c(3600, 20, 22, 19, 21)]
        const out = buildContinuousSeries(input, '1h', 500, 3700)
        expect(out).toHaveLength(2)
        expect(out[0]).toMatchObject({ time: 0, open: 10, high: 12, low: 9, close: 11 })
        // opens at previous close (11); low pulled down to the carried-over open
        expect(out[1]).toMatchObject({ time: 3600, open: 11, high: 22, low: 11, close: 21 })
    })

    it('flat-fills missing buckets at the prior close (no time holes)', () => {
        const out = buildContinuousSeries([c(0, 1, 1, 1, 1), c(7200, 5, 5, 5, 5)], '1h', 500, 7300)
        expect(out.map((o) => o.time)).toEqual([0, 3600, 7200])
        expect(out[1]).toMatchObject({ time: 3600, open: 1, high: 1, low: 1, close: 1, volume: 0 })
        expect(out[2]!.open).toBe(1) // real candle connects to the filled gap's close
        expect(out[2]!.close).toBe(5)
    })

    it('caps to the most recent maxCandles buckets, connected to off-screen history', () => {
        const input = [c(0, 1, 1, 1, 1), c(3600, 2, 2, 2, 2), c(7200, 3, 3, 3, 3)]
        const out = buildContinuousSeries(input, '1h', 2, 7300)
        expect(out.map((o) => o.time)).toEqual([3600, 7200])
        expect(out[0]!.open).toBe(1) // connects to bucket 0's close (off-screen)
        expect(out[0]!.close).toBe(2)
    })

    it('extends flat from the last bucket to the current bucket', () => {
        const out = buildContinuousSeries([c(0, 4, 4, 4, 4)], '1h', 500, 10850)
        expect(out.map((o) => o.time)).toEqual([0, 3600, 7200, 10800])
        expect(out.every((o) => o.close === 4)).toBe(true)
    })
})

describe('tokenNativeCandles', () => {
    const Q96 = (2n ** 96n).toString() // sqrtPriceX96 for raw price 1
    const ev = (timestamp: number, sqrt: string): V3SwapEvent => ({
        timestamp,
        amount0: '1000000000000000000',
        amount1: '1000000000000000000',
        sqrtPriceX96: sqrt,
        tick: 0,
    })
    const TOKEN = '0x0000000000000000000000000000000000000001'
    const WN = '0xffffffffffffffffffffffffffffffffffffffff'

    it('rescales the raw V3 price by the token/native decimal difference', () => {
        const at18 = tokenNativeCandles([ev(100, Q96)], TOKEN, 18, WN, 18, '1h')
        const at6 = tokenNativeCandles([ev(100, Q96)], TOKEN, 6, WN, 18, '1h')
        // 18-dec token: raw price 1 stays 1; 6-dec token: scaled by 10^(6-18) = 1e-12.
        expect(at18[at18.length - 1]!.close).toBeCloseTo(1, 6)
        expect(at6[at6.length - 1]!.close).toBeGreaterThan(1e-13)
        expect(at6[at6.length - 1]!.close).toBeLessThan(1e-11)
    })
})

describe('computeFeeBreakdown', () => {
    it('returns zeros for no events', () => {
        expect(computeFeeBreakdown([])).toEqual({ nativeFees: 0, tokenFees: 0, totalNative: 0 })
    })

    it('attributes buy fees to native, sell fees to tokens, and combines both in KUB', () => {
        const events = [
            // buy: 100 KUB in
            makeEvent(100, true, NATIVE(100), TOKENS(1000), NATIVE(200), TOKENS(800)),
            // sell: 500 tokens in for 40 KUB out
            makeEvent(200, false, TOKENS(500), NATIVE(40), TOKENS(1300), NATIVE(160)),
        ]
        const { nativeFees, tokenFees, totalNative } = computeFeeBreakdown(events)
        expect(nativeFees).toBeCloseTo(1, 10) // 1% of 100 KUB
        expect(tokenFees).toBeCloseTo(5, 10) // 1% of 500 tokens
        // 1% of (100 KUB buy in + 40 KUB sell out)
        expect(totalNative).toBeCloseTo(1.4, 10)
    })
})

describe('computeDailyMetrics', () => {
    const c = (time: number, close: number, volume: number): CandlestickData => ({
        time,
        open: close,
        high: close,
        low: close,
        close,
        volume,
    })

    it('returns null for empty candles', () => {
        expect(computeDailyMetrics([], null)).toBeNull()
    })

    it('sums volume1d over the last 24h only', () => {
        const now = Math.floor(Date.now() / 1000)
        const candles = [c(now - 200_000, 1, 300), c(now - 100, 2, 50)]
        const metrics = computeDailyMetrics(candles, null)!
        expect(metrics.volume1d).toBe(50)
    })

    it('converts volume1d to USD when a native price is given', () => {
        const now = Math.floor(Date.now() / 1000)
        const candles = [c(now - 200_000, 1, 300), c(now - 100, 2, 50)]
        const metrics = computeDailyMetrics(candles, 2)!
        expect(metrics.volume1d).toBe(100)
    })
})

describe('ratioCandles', () => {
    const c = (
        time: number,
        open: number,
        high: number,
        low: number,
        close: number
    ): CandlestickData => ({ time, open, high, low, close, volume: 0 })

    it('divides aligned OHLC using cross extremes (high=bH/qL, low=bL/qH)', () => {
        const out = ratioCandles([c(0, 10, 12, 8, 11)], [c(0, 2, 4, 1, 2)])
        expect(out).toHaveLength(1)
        expect(out[0]).toMatchObject({
            time: 0,
            open: 5, // 10/2
            high: 12, // baseHigh/quoteLow = 12/1
            low: 2, // baseLow/quoteHigh = 8/4
            close: 5.5, // 11/2
            volume: 0,
        })
    })

    it('inner-joins on time (skips buckets missing from quote)', () => {
        const out = ratioCandles([c(0, 1, 1, 1, 1), c(3600, 2, 2, 2, 2)], [c(3600, 2, 2, 2, 2)])
        expect(out.map((o) => o.time)).toEqual([3600])
        expect(out[0]!.close).toBe(1)
    })

    it('skips buckets with a non-positive quote value', () => {
        expect(ratioCandles([c(0, 1, 1, 1, 1)], [c(0, 0, 0, 0, 0)])).toEqual([])
    })
})

describe('extractCreatorTrades', () => {
    const CREATOR = '0xAbCd000000000000000000000000000000000001'
    const CREATOR_LOWER = CREATOR.toLowerCase()
    const OTHER = '0x1111111111111111111111111111111111111111'

    const bc = (
        timestamp: number,
        isBuy: boolean,
        sender?: string,
        amountIn = NATIVE(1),
        amountOut = TOKENS(2)
    ) => ({ timestamp, isBuy, sender, amountIn, amountOut })
    // amounts signed from the pool's view: negative token amount = user bought
    const v3 = (
        timestamp: number,
        amount0: string,
        amount1: string,
        txFrom?: string,
        tokenIsToken0: number = 1
    ) => ({ timestamp, amount0, amount1, txFrom, tokenIsToken0 })

    const sides = (trades: ReturnType<typeof extractCreatorTrades>) =>
        trades.map((t) => ({ timestamp: t.timestamp, isBuy: t.isBuy }))

    it('filters bonding-curve events by sender, case-insensitively', () => {
        const trades = extractCreatorTrades(
            [bc(100, true, CREATOR_LOWER), bc(200, false, OTHER), bc(300, false, CREATOR_LOWER)],
            [],
            CREATOR, // checksummed input vs lowercase indexer data
            null
        )
        expect(sides(trades)).toEqual([
            { timestamp: 100, isBuy: true },
            { timestamp: 300, isBuy: false },
        ])
    })

    it('derives native/token amounts from bonding-curve buy and sell sides', () => {
        const trades = extractCreatorTrades(
            [
                bc(100, true, CREATOR_LOWER, NATIVE(3), TOKENS(50)), // buy: native in, token out
                bc(200, false, CREATOR_LOWER, TOKENS(40), NATIVE(2)), // sell: token in, native out
            ],
            [],
            CREATOR,
            null
        )
        expect(trades).toEqual([
            { timestamp: 100, isBuy: true, nativeAmount: 3, tokenAmount: 50 },
            { timestamp: 200, isBuy: false, nativeAmount: 2, tokenAmount: 40 },
        ])
    })

    it('derives v3 amounts from the signed token/native legs', () => {
        const trades = extractCreatorTrades(
            [],
            [v3(200, '-5000000000000000000', '10000000000000000000', CREATOR_LOWER, 1)],
            CREATOR,
            100
        )
        expect(trades).toEqual([{ timestamp: 200, isBuy: true, nativeAmount: 10, tokenAmount: 5 }])
    })

    it('ignores events with a missing sender/txFrom', () => {
        expect(
            extractCreatorTrades([bc(100, true)], [v3(200, '-1', '2', undefined)], CREATOR, 150)
        ).toEqual([])
    })

    it('derives v3 isBuy from signed token amount when token is token0', () => {
        const trades = extractCreatorTrades(
            [],
            [v3(200, '-5', '10', CREATOR_LOWER, 1), v3(300, '5', '-10', CREATOR_LOWER, 1)],
            CREATOR,
            100
        )
        expect(sides(trades)).toEqual([
            { timestamp: 200, isBuy: true },
            { timestamp: 300, isBuy: false },
        ])
    })

    it('derives v3 isBuy from signed token amount when token is token1', () => {
        const trades = extractCreatorTrades(
            [],
            [v3(200, '10', '-5', CREATOR_LOWER, 0), v3(300, '-10', '5', CREATOR_LOWER, 0)],
            CREATOR,
            100
        )
        expect(sides(trades)).toEqual([
            { timestamp: 200, isBuy: true },
            { timestamp: 300, isBuy: false },
        ])
    })

    it('splits at graduation when v3 events exist', () => {
        const trades = extractCreatorTrades(
            [bc(100, true, CREATOR_LOWER), bc(500, true, CREATOR_LOWER)], // 500 >= graduatedAt → dropped
            [v3(400, '-1', '1', CREATOR_LOWER), v3(600, '-1', '1', CREATOR_LOWER)], // 400 < graduatedAt → dropped
            CREATOR,
            500
        )
        expect(sides(trades)).toEqual([
            { timestamp: 100, isBuy: true },
            { timestamp: 600, isBuy: true },
        ])
    })

    it('keeps all bonding-curve trades when not graduated or without v3 activity', () => {
        const events = [bc(100, true, CREATOR_LOWER), bc(900, false, CREATOR_LOWER)]
        expect(extractCreatorTrades(events, [], CREATOR, null)).toHaveLength(2)
        expect(extractCreatorTrades(events, [], CREATOR, 500)).toHaveLength(2)
    })

    it('sorts merged trades ascending by timestamp', () => {
        const trades = extractCreatorTrades(
            [bc(300, true, CREATOR_LOWER), bc(100, false, CREATOR_LOWER)],
            [v3(600, '-1', '1', CREATOR_LOWER), v3(500, '1', '-1', CREATOR_LOWER)],
            CREATOR,
            400
        )
        expect(trades.map((t) => t.timestamp)).toEqual([100, 300, 500, 600])
    })
})

describe('buildCreatorMarkers', () => {
    const HOUR = 3600

    const trade = (timestamp: number, isBuy: boolean, nativeAmount = 1, tokenAmount = 1) => ({
        timestamp,
        isBuy,
        nativeAmount,
        tokenAmount,
    })
    const sides = (points: ReturnType<typeof buildCreatorMarkers>) =>
        points.map((p) => ({ time: p.time, isBuy: p.isBuy }))

    it('returns empty for no trades', () => {
        expect(buildCreatorMarkers([], '1h', [0, HOUR])).toEqual([])
    })

    it('snaps trade timestamps to timeframe buckets', () => {
        const points = buildCreatorMarkers([trade(HOUR + 59, true)], '1h', [0, HOUR])
        expect(sides(points)).toEqual([{ time: HOUR, isBuy: true }])
    })

    it('collapses multiple trades in one bucket to one buy and one sell point, buy first', () => {
        const points = buildCreatorMarkers(
            [trade(10, false), trade(20, true), trade(30, true), trade(40, false), trade(50, true)],
            '1h',
            [0]
        )
        expect(sides(points)).toEqual([
            { time: 0, isBuy: true },
            { time: 0, isBuy: false },
        ])
    })

    it('sums same-side amounts in a bucket and keeps the latest trade time', () => {
        const points = buildCreatorMarkers(
            [trade(20, true, 3, 100), trade(50, true, 2, 40)],
            '1h',
            [0]
        )
        expect(points).toEqual([
            { time: 0, isBuy: true, nativeAmount: 5, tokenAmount: 140, timestamp: 50 },
        ])
    })

    it('drops trades whose bucket has no rendered candle', () => {
        const points = buildCreatorMarkers([trade(10, true), trade(HOUR + 10, true)], '1h', [HOUR])
        expect(sides(points)).toEqual([{ time: HOUR, isBuy: true }])
    })

    it('sorts output ascending across buckets', () => {
        const points = buildCreatorMarkers([trade(2 * HOUR + 5, false), trade(5, true)], '1h', [
            0,
            HOUR,
            2 * HOUR,
        ])
        expect(sides(points)).toEqual([
            { time: 0, isBuy: true },
            { time: 2 * HOUR, isBuy: false },
        ])
    })
})
