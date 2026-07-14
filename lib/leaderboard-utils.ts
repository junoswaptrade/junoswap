import { formatEther } from 'viem'
import { kubTestnet, bitkub, jbc } from '@/lib/wagmi'
import {
    fetchBondingCurveSwaps,
    fetchV3Swaps,
    fetchV2Swaps,
    type ParsedSwap,
} from '@/lib/swap-events'
import { isLaunchpadChain } from '@coshi190/junoswap-sdk'
import type { LeaderboardTimePeriod } from '@/types/leaderboard'

const LEADERBOARD_SUPPORTED_CHAINS = new Set<number>([kubTestnet.id, bitkub.id, jbc.id])

export function isLeaderboardSupportedChain(chainId: number): boolean {
    return LEADERBOARD_SUPPORTED_CHAINS.has(chainId)
}

export function computePoints(junoVolumeNative: number, externalVolumeNative: number): number {
    return Math.floor(junoVolumeNative / 50 + externalVolumeNative / 500)
}

export function computeReferralPoints(refereePoints: number[]): number {
    return Math.floor(refereePoints.reduce((sum, p) => sum + p, 0) * 0.1)
}

export interface TraderAgg {
    volumeNative: number
    points: number
    tradeCount: number
    buyCount: number
    sellCount: number
}

export function aggregatePointsByAddress(rows: SwapEventRow[]): Map<string, TraderAgg> {
    interface Acc {
        junoVolumeNative: number
        externalVolumeNative: number
        tradeCount: number
        buyCount: number
        sellCount: number
    }
    const acc = new Map<string, Acc>()
    for (const e of rows) {
        const sender = e.sender.toLowerCase()
        const isBuy = e.isBuy === 1
        const nativeAmount = safeFormatEther(isBuy ? e.amountIn : e.amountOut)
        let a = acc.get(sender)
        if (!a) {
            a = {
                junoVolumeNative: 0,
                externalVolumeNative: 0,
                tradeCount: 0,
                buyCount: 0,
                sellCount: 0,
            }
            acc.set(sender, a)
        }
        if (e.protocol === 'junoswap') a.junoVolumeNative += nativeAmount
        else a.externalVolumeNative += nativeAmount
        a.tradeCount++
        if (isBuy) a.buyCount++
        else a.sellCount++
    }
    const out = new Map<string, TraderAgg>()
    for (const [addr, a] of acc) {
        out.set(addr, {
            volumeNative: a.junoVolumeNative + a.externalVolumeNative,
            points: computePoints(a.junoVolumeNative, a.externalVolumeNative),
            tradeCount: a.tradeCount,
            buyCount: a.buyCount,
            sellCount: a.sellCount,
        })
    }
    return out
}

export function getTimeThreshold(period: LeaderboardTimePeriod): number {
    if (period === 'all') return 0
    const now = Math.floor(Date.now() / 1000)
    switch (period) {
        case '24h':
            return now - 86400
        case '7d':
            return now - 604800
        case '30d':
            return now - 2592000
    }
}

export interface SwapEventRow {
    tokenAddr: string
    sender: string
    isBuy: number
    amountIn: string
    amountOut: string
    timestamp: number
    protocol: string
}

function toRow(p: ParsedSwap): SwapEventRow {
    return {
        tokenAddr: p.tokenAddr,
        sender: p.sender,
        isBuy: p.isBuy ? 1 : 0,
        amountIn: p.amountIn,
        amountOut: p.amountOut,
        timestamp: p.timestamp,
        protocol: p.protocol,
    }
}

export async function fetchSwapEvents(
    chainId: number,
    sinceTimestamp: number
): Promise<SwapEventRow[]> {
    return (await fetchBondingCurveSwaps(chainId, { since: sinceTimestamp })).map(toRow)
}

export async function fetchV3SwapEvents(
    chainId: number,
    sinceTimestamp: number
): Promise<SwapEventRow[]> {
    return (await fetchV3Swaps(chainId, { since: sinceTimestamp })).map(toRow)
}

export async function fetchV2SwapEvents(
    chainId: number,
    sinceTimestamp: number
): Promise<SwapEventRow[]> {
    return (await fetchV2Swaps(chainId, { since: sinceTimestamp })).map(toRow)
}

export async function fetchSwapEventsForSenders(
    chainId: number,
    senders: string[]
): Promise<SwapEventRow[]> {
    if (senders.length === 0) return []
    const [bondingCurve, v3, v2] = await Promise.all([
        isLaunchpadChain(chainId)
            ? fetchBondingCurveSwaps(chainId, { senderIn: senders })
            : Promise.resolve([]),
        fetchV3Swaps(chainId, { senderIn: senders }),
        fetchV2Swaps(chainId, { senderIn: senders }),
    ])
    return [...bondingCurve, ...v3, ...v2].map(toRow)
}

function safeFormatEther(value: string): number {
    try {
        return parseFloat(formatEther(BigInt(value)))
    } catch {
        return 0
    }
}
