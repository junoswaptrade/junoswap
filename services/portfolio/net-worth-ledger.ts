import {
    downsample,
    sanitizePricePoints,
    type NetWorthPoint,
    type PricePoint,
} from '@/services/portfolio/net-worth-history'

export interface BalanceDelta {
    timestamp: number
    delta: number
}

export interface BalanceStep {
    fromTs: number
    balance: number
}

export type PriceKind = 'stable' | 'native' | 'reconstructed' | 'fallback'

export interface LedgerToken {
    currentBalance: number
    deltas: BalanceDelta[]
    priceKind: PriceKind
    nativePricePoints: PricePoint[]
    priceUsdNow: number
}

export interface BuildLedgerParams {
    tokens: LedgerToken[]
    nativeUsdPoints: PricePoint[]
    nativeUsdNow: number
    windowStart: number
    nowSec: number
    netWorthNow: number
}

export function reconstructBalanceSteps(
    currentBalance: number,
    deltas: BalanceDelta[]
): BalanceStep[] {
    const sorted = [...deltas].sort((a, b) => a.timestamp - b.timestamp)
    const n = sorted.length

    let suffix = 0
    const balanceAfter = new Array<number>(n)
    for (let i = n - 1; i >= 0; i--) {
        balanceAfter[i] = currentBalance - suffix
        suffix += sorted[i]!.delta
    }
    const startBalance = currentBalance - suffix

    const steps: BalanceStep[] = [{ fromTs: 0, balance: startBalance }]
    for (let i = 0; i < n; i++) {
        steps.push({ fromTs: sorted[i]!.timestamp, balance: balanceAfter[i]! })
    }
    return steps
}

function makeStepAt(steps: readonly BalanceStep[]): (t: number) => number {
    if (steps.length === 0) return () => 0
    return (t: number) => {
        let lo = 0
        let hi = steps.length - 1
        let ans = steps[0]!.balance
        while (lo <= hi) {
            const mid = (lo + hi) >> 1
            if (steps[mid]!.fromTs <= t) {
                ans = steps[mid]!.balance
                lo = mid + 1
            } else {
                hi = mid - 1
            }
        }
        return ans
    }
}

export function makeNativePriceAt(points: readonly PricePoint[]): (t: number) => number {
    if (points.length === 0) return () => 0
    return (t: number) => {
        if (t < points[0]!.timestamp) return points[0]!.price
        let lo = 0
        let hi = points.length - 1
        let ans = points[0]!.price
        while (lo <= hi) {
            const mid = (lo + hi) >> 1
            if (points[mid]!.timestamp <= t) {
                ans = points[mid]!.price
                lo = mid + 1
            } else {
                hi = mid - 1
            }
        }
        return ans
    }
}

interface ResolvedToken {
    balanceAt: (t: number) => number
    valueUsdAt: (t: number, nativeUsd: number) => number
}

export function buildLedgerNetWorthSeries(params: BuildLedgerParams): NetWorthPoint[] {
    const { tokens, nativeUsdNow, windowStart, nowSec, netWorthNow } = params

    if (netWorthNow <= 0 || !nativeUsdNow || nativeUsdNow <= 0) return []

    const nativeUsdPoints = sanitizePricePoints(params.nativeUsdPoints)
    const nativeUsdAt = makeNativePriceAt(nativeUsdPoints)

    const gridTimes = new Set<number>([windowStart])
    for (const p of nativeUsdPoints) {
        if (p.timestamp > windowStart && p.timestamp < nowSec) gridTimes.add(p.timestamp)
    }

    const resolved: ResolvedToken[] = tokens.map((token) => {
        const steps = reconstructBalanceSteps(token.currentBalance, token.deltas)
        const balanceAt = makeStepAt(steps)
        for (const s of steps) {
            if (s.fromTs > windowStart && s.fromTs < nowSec) gridTimes.add(s.fromTs)
        }

        const nativePoints = sanitizePricePoints(token.nativePricePoints)
        const usable = token.priceKind === 'reconstructed' && nativePoints.length > 0
        const nativePriceAt = usable ? makeNativePriceAt(nativePoints) : null
        if (usable) {
            for (const p of nativePoints) {
                if (p.timestamp > windowStart && p.timestamp < nowSec) gridTimes.add(p.timestamp)
            }
        }

        const valueUsdAt = (t: number, nativeUsd: number): number => {
            const balance = balanceAt(t)
            if (balance === 0) return 0
            if (token.priceKind === 'stable') return balance
            if (token.priceKind === 'native') return balance * nativeUsd
            if (nativePriceAt) return balance * nativePriceAt(t) * nativeUsd
            return (balance * token.priceUsdNow * nativeUsd) / nativeUsdNow
        }

        return { balanceAt, valueUsdAt }
    })

    const sortedTimes = [...gridTimes].sort((a, b) => a - b)
    const series: NetWorthPoint[] = sortedTimes.map((t) => {
        const nativeUsd = nativeUsdAt(t)
        let value = 0
        for (const token of resolved) value += token.valueUsdAt(t, nativeUsd)
        return { timestamp: t, value }
    })

    const sampled = downsample(series, windowStart, nowSec)
    sampled.push({ timestamp: nowSec, value: netWorthNow })
    return sampled
}
