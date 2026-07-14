import type { Address } from 'viem'
import {
    ProtocolType,
    getV2Config,
    getV3Config,
    getDexsByProtocol,
    getFeeTiers,
    poolKey,
} from '@coshi190/junoswap-sdk'
import type { ResolvedHop } from './agg-router'

export interface HopOption {
    dexId: string
    protocol: ProtocolType
    factory: Address
    quoteAddress: Address
    tokenIn: Address
    tokenOut: Address
    fee?: number
}

export interface LegCandidate {
    hops: ResolvedHop[]
    predictedOut: bigint
    poolKeys: string[]
}

export function candidateHopOptions(
    tokenInW: Address,
    tokenOutW: Address,
    chainId: number
): HopOption[] {
    if (tokenInW.toLowerCase() === tokenOutW.toLowerCase()) return []
    const options: HopOption[] = []

    for (const dexId of getDexsByProtocol(chainId, ProtocolType.V2)) {
        const cfg = getV2Config(chainId, dexId)
        if (!cfg?.factory || !cfg.router) continue
        options.push({
            dexId,
            protocol: ProtocolType.V2,
            factory: cfg.factory,
            quoteAddress: cfg.router,
            tokenIn: tokenInW,
            tokenOut: tokenOutW,
        })
    }

    for (const dexId of getDexsByProtocol(chainId, ProtocolType.V3)) {
        const cfg = getV3Config(chainId, dexId)
        if (!cfg?.factory || !cfg.quoter) continue
        for (const fee of getFeeTiers(cfg)) {
            options.push({
                dexId,
                protocol: ProtocolType.V3,
                factory: cfg.factory,
                quoteAddress: cfg.quoter,
                tokenIn: tokenInW,
                tokenOut: tokenOutW,
                fee,
            })
        }
    }

    return options
}

export function pickBestHopOption(
    options: HopOption[],
    outputs: (bigint | null)[]
): { option: HopOption; output: bigint } | null {
    let best: { option: HopOption; output: bigint } | null = null
    for (let i = 0; i < options.length; i++) {
        const out = outputs[i]
        if (out == null || out <= 0n) continue
        if (!best || out > best.output) best = { option: options[i]!, output: out }
    }
    return best
}

function toResolvedHop(o: HopOption): ResolvedHop {
    return {
        dexId: o.dexId,
        protocol: o.protocol,
        factory: o.factory,
        tokenIn: o.tokenIn,
        tokenOut: o.tokenOut,
        fee: o.fee,
    }
}

function optionPoolKey(o: HopOption): string {
    return poolKey(o.factory, o.tokenIn, o.tokenOut, o.fee ?? 0)
}

export function buildCrossDexLeg(
    hop1: { option: HopOption; output: bigint },
    hop2: { option: HopOption; output: bigint }
): LegCandidate {
    return {
        hops: [toResolvedHop(hop1.option), toResolvedHop(hop2.option)],
        predictedOut: hop2.output,
        poolKeys: [optionPoolKey(hop1.option), optionPoolKey(hop2.option)],
    }
}
