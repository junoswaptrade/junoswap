import { formatEther, parseEther, decodeEventLog } from 'viem'
import type { Address, Log } from 'viem'
import { BONDING_CURVE_JUNOSWAP_ABI } from '@/lib/abis/bonding-curve-junoswap'
import { resolveLaunchpadLogo } from '@/lib/logo'
import type { LaunchToken } from '@/types/launchpad'

export interface RawLaunchTokenItem {
    tokenAddr: string
    creator: string
    name: string
    symbol: string
    logo: string
    description: string
    link1: string
    link2: string
    link3: string
    createdTime: number
    isGraduated: number
    graduatedAt: number | null
}

export function mapLaunchTokenItem(item: RawLaunchTokenItem, chainId: number): LaunchToken {
    return {
        address: item.tokenAddr as Address,
        name: item.name ?? '',
        symbol: item.symbol ?? '',
        logo: resolveLaunchpadLogo(item.logo),
        description: item.description ?? '',
        link1: item.link1 ?? '',
        link2: item.link2 ?? '',
        link3: item.link3 ?? '',
        creator: item.creator as Address,
        createdTime: item.createdTime,
        chainId,
        graduatedAt: item.graduatedAt ?? null,
        isGraduated: item.isGraduated === 1,
    }
}

export const PUMP_FEE_BPS = 100n // 1%

export const INITIAL_TOKEN_SUPPLY = 1000000000n * 10n ** 18n

export function calculateBuyOutput(
    nativeAmountIn: bigint,
    nativeReserve: bigint,
    tokenReserve: bigint,
    virtualAmount: bigint
): bigint {
    if (nativeAmountIn <= 0n || nativeReserve < 0n || tokenReserve <= 0n) return 0n
    const feeAmount = (nativeAmountIn * PUMP_FEE_BPS) / 10000n
    const amountInAfterFee = nativeAmountIn - feeAmount
    return getAmountOut(amountInAfterFee, virtualAmount + nativeReserve, tokenReserve)
}

export function calculateSellOutput(
    tokenAmountIn: bigint,
    nativeReserve: bigint,
    tokenReserve: bigint,
    virtualAmount: bigint
): bigint {
    if (tokenAmountIn <= 0n || tokenReserve <= 0n || nativeReserve <= 0n) return 0n
    const feeAmount = (tokenAmountIn * PUMP_FEE_BPS) / 10000n
    const amountInAfterFee = tokenAmountIn - feeAmount
    return getAmountOut(amountInAfterFee, tokenReserve, virtualAmount + nativeReserve)
}

function getAmountOut(inputAmount: bigint, inputReserve: bigint, outputReserve: bigint): bigint {
    if (inputReserve <= 0n || outputReserve <= 0n) return 0n
    const inputAmountWithFee = inputAmount * 99n
    const numerator = outputReserve * inputAmountWithFee
    const denominator = inputReserve * 100n + inputAmountWithFee
    return numerator / denominator
}

export function calculateGraduationTarget(tokenReserve: bigint, graduationAmount: bigint): bigint {
    const INITIAL_TOKEN = 1_000_000_000n * 10n ** 18n
    if (graduationAmount <= 0n) return 0n
    return (tokenReserve * graduationAmount) / INITIAL_TOKEN
}

export function calculateGraduationProgress(
    nativeReserve: bigint,
    tokenReserve: bigint,
    graduationAmount: bigint
): number {
    if (graduationAmount <= 0n || tokenReserve <= 0n) return 0
    const INITIAL_TOKEN = 1_000_000_000n * 10n ** 18n
    const progress = Number(
        (INITIAL_TOKEN * nativeReserve * 100n) / (tokenReserve * graduationAmount)
    )
    return Math.min(100, progress)
}

export function calculateExactGraduationReserve(
    virtualAmount: bigint,
    graduationAmount: bigint
): bigint {
    if (virtualAmount <= 0n || graduationAmount <= 0n) return graduationAmount

    const V = Number(formatEther(virtualAmount))
    const G = Number(formatEther(graduationAmount))
    const FEE_EXP = 0.99
    const target = G * Math.pow(V, FEE_EXP)

    let N = (-V + Math.sqrt(V * V + 4 * V * G)) / 2

    for (let i = 0; i < 20; i++) {
        const base = V + N
        const f = N * Math.pow(base, FEE_EXP) - target
        const fPrime = Math.pow(base, FEE_EXP) + N * FEE_EXP * Math.pow(base, FEE_EXP - 1)
        const step = f / fPrime
        N = Math.max(0, N - step)
        if (Math.abs(step) < 1e-9) break
    }

    return parseEther(N.toFixed(18))
}

export function calculateStableGraduationProgress(
    nativeReserve: bigint,
    exactTarget: bigint
): number {
    if (exactTarget <= 0n) return 0
    const progress = Number((nativeReserve * 100n) / exactTarget)
    return Math.min(100, progress)
}

export function calculateMinOutput(expectedOut: bigint, slippageBps: number): bigint {
    return (expectedOut * BigInt(10000 - slippageBps)) / 10000n
}

export function formatKub(weiValue: bigint): string {
    const formatted = formatEther(weiValue)
    const num = parseFloat(formatted)
    if (num === 0) return '0'
    if (num < 0.0001) return '<0.0001'
    if (num < 1) return num.toFixed(4)
    if (num < 1000) return num.toFixed(2)
    if (num < 1000000) return num.toFixed(2)
    return num.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

export function formatKubRounded(weiValue: bigint): string {
    const num = Math.round(parseFloat(formatEther(weiValue)))
    return num.toLocaleString('en-US')
}

export function formatTokenAmount(weiValue: bigint): string {
    const formatted = formatEther(weiValue)
    const num = parseFloat(formatted)
    if (num === 0) return '0'
    if (num < 0.0001) return '<0.0001'
    if (num < 1) return num.toFixed(4)
    if (num < 1000) return num.toFixed(2)
    if (num < 1000000) return `${(num / 1000).toFixed(2)}K`
    if (num < 1000000000) return `${(num / 1000000).toFixed(2)}M`
    return `${(num / 1000000000).toFixed(2)}B`
}

export function formatCompact(num: number, decimals = 1): string {
    if (num === 0) return '0'
    if (num < 0.01) return '<0.01'
    if (num < 1) return num.toFixed(2)
    if (num < 1000) return num.toFixed(0)
    if (num < 1000000) return `${(num / 1000).toFixed(decimals)}K`
    if (num < 1000000000) return `${(num / 1000000).toFixed(decimals)}M`
    return `${(num / 1000000000).toFixed(decimals)}B`
}

export function isReadyToGraduate(
    nativeReserve: bigint,
    tokenReserve: bigint,
    graduationAmount: bigint,
    isGraduated: boolean
): boolean {
    if (isGraduated || graduationAmount === 0n) return false
    const INITIAL_TOKEN = 1_000_000_000n * 10n ** 18n
    return tokenReserve * graduationAmount <= INITIAL_TOKEN * nativeReserve
}

export function parseTokenAddressFromLogs(
    logs: Log[],
    bondingCurveAddress?: Address
): Address | null {
    const expected = bondingCurveAddress?.toLowerCase()
    for (const log of logs) {
        if (expected && log.address.toLowerCase() !== expected) continue
        try {
            const decoded = decodeEventLog({
                abi: BONDING_CURVE_JUNOSWAP_ABI,
                data: log.data,
                topics: log.topics,
            })
            if (decoded.eventName === 'Creation') {
                return (decoded.args as { tokenAddr: Address }).tokenAddr
            }
        } catch {
            continue
        }
    }
    return null
}
