import type { Address } from 'viem'
import { INTERMEDIARY_TOKENS } from '@/lib/routing-config'
import { isNativeToken } from '@/lib/wagmi'

export type SwapPairKind =
    | 'native-stable'
    | 'token-native'
    | 'token-stable'
    | 'token-token'
    | 'unsupported'

export interface SwapPairClassification {
    kind: SwapPairKind
    baseAddr?: Address
    quoteAddr?: Address
}

export function classifySwapPair(
    chainId: number,
    tokenInAddr: Address | undefined,
    tokenOutAddr: Address | undefined
): SwapPairClassification {
    if (!tokenInAddr || !tokenOutAddr) return { kind: 'unsupported' }

    const cfg = INTERMEDIARY_TOKENS[chainId]
    if (!cfg) return { kind: 'unsupported' }

    const wrappedNative = cfg.wrappedNative.toLowerCase()
    const stables = new Set(cfg.stables.map((s) => s.toLowerCase()))

    const isNativeSide = (addr: Address) =>
        isNativeToken(addr) || addr.toLowerCase() === wrappedNative
    const isStableSide = (addr: Address) => stables.has(addr.toLowerCase())

    const inNative = isNativeSide(tokenInAddr)
    const outNative = isNativeSide(tokenOutAddr)

    if (inNative && outNative) return { kind: 'unsupported' }

    if (inNative || outNative) {
        const nativeAddr = inNative ? tokenInAddr : tokenOutAddr
        const otherAddr = inNative ? tokenOutAddr : tokenInAddr
        if (isStableSide(otherAddr)) {
            return { kind: 'native-stable', baseAddr: nativeAddr, quoteAddr: otherAddr }
        }
        return { kind: 'token-native', baseAddr: otherAddr, quoteAddr: nativeAddr }
    }

    const inStable = isStableSide(tokenInAddr)
    const outStable = isStableSide(tokenOutAddr)

    if (inStable && outStable) return { kind: 'unsupported' }

    if (inStable || outStable) {
        const stableAddr = inStable ? tokenInAddr : tokenOutAddr
        const tokenAddr = inStable ? tokenOutAddr : tokenInAddr
        return { kind: 'token-stable', baseAddr: tokenAddr, quoteAddr: stableAddr }
    }

    return { kind: 'token-token', baseAddr: tokenInAddr, quoteAddr: tokenOutAddr }
}
