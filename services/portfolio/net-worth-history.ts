export interface NetWorthPoint {
    timestamp: number
    value: number
}

export interface PricePoint {
    timestamp: number
    price: number
}

export const DAY_SECONDS = 86_400
export const MAX_POINTS = 96

export function sanitizePricePoints<T extends { price: number }>(points: readonly T[]): T[] {
    const finite = points.filter((p) => Number.isFinite(p.price) && p.price > 0)
    if (finite.length === 0) return []
    const sorted = finite.map((p) => p.price).sort((a, b) => a - b)
    const median = sorted[sorted.length >> 1]!
    return finite.filter((p) => p.price <= median * 100 && p.price >= median / 100)
}

export function downsample(
    series: NetWorthPoint[],
    startSec: number,
    nowSec: number
): NetWorthPoint[] {
    if (series.length <= MAX_POINTS) return series

    const bucketSize = (nowSec - startSec) / MAX_POINTS
    const byBucket = new Map<number, NetWorthPoint>()
    for (const point of series) {
        const bucket = Math.floor((point.timestamp - startSec) / bucketSize)
        byBucket.set(bucket, point)
    }
    return [...byBucket.values()]
}
