import {
    fetchBondingCurveSwaps as sdkFetchBondingCurveSwaps,
    fetchV3Swaps as sdkFetchV3Swaps,
    fetchV2Swaps as sdkFetchV2Swaps,
    fetchAllReferralBindings as sdkFetchAllReferralBindings,
    fetchReferralBindings as sdkFetchReferralBindings,
    type SwapScanFilter,
    type V2Swap,
    type V3Swap,
} from '@coshi190/junoswap-sdk'
import { ponderClient, isPonderError } from '@/lib/ponder-client'
import { INTERMEDIARY_TOKENS } from '@/lib/routing-config'

function wrappedNativeFor(chainId: number): string | null {
    return INTERMEDIARY_TOKENS[chainId]?.wrappedNative.toLowerCase() ?? null
}

export interface ParsedSwap {
    tokenAddr: string
    sender: string
    isBuy: boolean
    amountIn: string
    amountOut: string
    timestamp: number
    protocol: string
}

export interface SwapFilter {
    sender?: string
    senderIn?: string[]
    since?: number
}

function toScanFilter(chainId: number, filter: SwapFilter): SwapScanFilter {
    return {
        chainId,
        sender: filter.sender,
        senders: filter.senderIn,
        since: filter.since && filter.since > 0 ? filter.since : undefined,
    }
}

const abs = (x: bigint) => (x < 0n ? -x : x)

export function parseV3Swap(e: V3Swap, wrappedNative: string): ParsedSwap | null {
    const token0 = e.token0Addr?.toLowerCase()
    const token1 = e.token1Addr?.toLowerCase()
    let nativeIsToken0: boolean
    if (token1 === wrappedNative) nativeIsToken0 = false
    else if (token0 === wrappedNative) nativeIsToken0 = true
    else return null
    const nativeAmt = BigInt(nativeIsToken0 ? e.amount0 : e.amount1)
    const tokenAmt = BigInt(nativeIsToken0 ? e.amount1 : e.amount0)
    const isBuy = tokenAmt < 0n // token leaves the pool => user receives it
    return {
        tokenAddr: e.tokenAddr.toLowerCase(),
        sender: e.txFrom,
        isBuy,
        amountIn: (isBuy ? abs(nativeAmt) : abs(tokenAmt)).toString(),
        amountOut: (isBuy ? abs(tokenAmt) : abs(nativeAmt)).toString(),
        timestamp: e.timestamp,
        protocol: e.protocol || 'junoswap',
    }
}

export function parseV2Swap(e: V2Swap, wrappedNative: string): ParsedSwap | null {
    const token0 = e.token0Addr.toLowerCase()
    const token1 = e.token1Addr.toLowerCase()
    let nativeIn: bigint, nativeOut: bigint, tokenIn: bigint, tokenOut: bigint
    let tokenAddr: string
    if (token0 === wrappedNative) {
        nativeIn = BigInt(e.amount0In)
        nativeOut = BigInt(e.amount0Out)
        tokenIn = BigInt(e.amount1In)
        tokenOut = BigInt(e.amount1Out)
        tokenAddr = token1
    } else if (token1 === wrappedNative) {
        nativeIn = BigInt(e.amount1In)
        nativeOut = BigInt(e.amount1Out)
        tokenIn = BigInt(e.amount0In)
        tokenOut = BigInt(e.amount0Out)
        tokenAddr = token0
    } else {
        return null
    }
    const isBuy = nativeIn > 0n // native flows into the pool => user buys token
    return {
        tokenAddr,
        sender: e.txFrom,
        isBuy,
        amountIn: (isBuy ? nativeIn : tokenIn).toString(),
        amountOut: (isBuy ? tokenOut : nativeOut).toString(),
        timestamp: e.timestamp,
        protocol: e.protocol || 'unknown',
    }
}

export async function fetchBondingCurveSwaps(
    chainId: number,
    filter: SwapFilter
): Promise<ParsedSwap[]> {
    try {
        const rows = await sdkFetchBondingCurveSwaps(ponderClient, toScanFilter(chainId, filter))
        return rows.map((e) => ({
            tokenAddr: e.tokenAddr.toLowerCase(),
            sender: e.sender,
            isBuy: e.isBuy === 1,
            amountIn: e.amountIn,
            amountOut: e.amountOut,
            timestamp: e.timestamp,
            protocol: 'junoswap',
        }))
    } catch (e) {
        if (isPonderError(e)) return []
        throw e
    }
}

export async function fetchV3Swaps(chainId: number, filter: SwapFilter): Promise<ParsedSwap[]> {
    const wn = wrappedNativeFor(chainId)
    if (!wn) return []
    try {
        const rows = await sdkFetchV3Swaps(ponderClient, toScanFilter(chainId, filter))
        const out: ParsedSwap[] = []
        for (const r of rows) {
            const p = parseV3Swap(r, wn)
            if (p) out.push(p)
        }
        return out
    } catch (e) {
        if (isPonderError(e)) return []
        throw e
    }
}

export async function fetchV2Swaps(chainId: number, filter: SwapFilter): Promise<ParsedSwap[]> {
    const wn = wrappedNativeFor(chainId)
    if (!wn) return []
    try {
        const rows = await sdkFetchV2Swaps(ponderClient, toScanFilter(chainId, filter))
        const out: ParsedSwap[] = []
        for (const r of rows) {
            const p = parseV2Swap(r, wn)
            if (p) out.push(p)
        }
        return out
    } catch (e) {
        if (isPonderError(e)) return []
        throw e
    }
}

export async function fetchAllReferralBindings(): Promise<Map<string, string[]>> {
    try {
        const rows = await sdkFetchAllReferralBindings(ponderClient)
        const map = new Map<string, string[]>()
        for (const r of rows) {
            const referrer = r.referrer.toLowerCase()
            const list = map.get(referrer) ?? []
            list.push(r.referee.toLowerCase())
            map.set(referrer, list)
        }
        return map
    } catch (e) {
        if (isPonderError(e)) return new Map()
        throw e
    }
}

export async function fetchReferralBindings(referrer: string): Promise<string[]> {
    try {
        const rows = await sdkFetchReferralBindings(ponderClient, {
            referrer: referrer.toLowerCase(),
        })
        return rows.map((r) => r.referee.toLowerCase())
    } catch (e) {
        if (isPonderError(e)) return []
        throw e
    }
}
