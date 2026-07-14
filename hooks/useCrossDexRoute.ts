'use client'

import { useMemo } from 'react'
import { useReadContracts } from 'wagmi'
import type { Address } from 'viem'
import { ProtocolType, buildQuoteCall, type ContractCall } from '@coshi190/junoswap-sdk'
import type { Token } from '@/types/token'
import { getIntermediaryTokens } from '@/lib/routing-config'
import { getSwapAddress } from '@/lib/tokens'
import {
    candidateHopOptions,
    pickBestHopOption,
    buildCrossDexLeg,
    type HopOption,
    type LegCandidate,
} from '@/services/dex/cross-dex-routing'

const MAX_CROSS_CONNECTORS = 3

interface UseCrossDexRouteParams {
    tokenIn: Token | null
    tokenOut: Token | null
    amountIn: bigint
    enabled?: boolean
}

interface UseCrossDexRouteResult {
    leg: LegCandidate | null
    predictedOut: bigint | null
    isLoading: boolean
}

type QuoteContract = ContractCall & { chainId: number }

function optionContract(o: HopOption, amount: bigint, chainId: number): QuoteContract {
    const call = buildQuoteCall({
        protocol: o.protocol,
        chainId,
        dexId: o.dexId,
        tokenIn: o.tokenIn,
        tokenOut: o.tokenOut,
        amountIn: amount,
        fee: o.fee,
    })
    if (!call) throw new Error(`No quote call for ${o.dexId} on chain ${chainId}`)
    return { ...call, chainId }
}

function parseOptionOut(
    o: HopOption,
    result: { status: 'success' | 'failure'; result?: unknown } | undefined
): bigint | null {
    if (!result || result.status !== 'success' || result.result == null) return null
    if (o.protocol === ProtocolType.V3) {
        const out = (result.result as readonly bigint[])[0]
        return out != null && out > 0n ? out : null
    }
    const amounts = result.result as readonly bigint[]
    const out = amounts[amounts.length - 1]
    return out != null && out > 0n ? out : null
}

export function useCrossDexRoute({
    tokenIn,
    tokenOut,
    amountIn,
    enabled = true,
}: UseCrossDexRouteParams): UseCrossDexRouteResult {
    const chainId = tokenIn?.chainId ?? 0
    const inW = tokenIn ? getSwapAddress(tokenIn.address as Address, chainId) : null
    const outW = tokenOut ? getSwapAddress(tokenOut.address as Address, chainId) : null
    const ready = enabled && !!inW && !!outW && amountIn > 0n

    const connectors = useMemo(() => {
        if (!chainId || !inW || !outW) return []
        const skip = new Set([inW.toLowerCase(), outW.toLowerCase()])
        const out: Address[] = []
        for (const c of getIntermediaryTokens(chainId)) {
            const l = c.toLowerCase()
            if (!skip.has(l)) {
                skip.add(l)
                out.push(c)
            }
        }
        return out.slice(0, MAX_CROSS_CONNECTORS)
    }, [chainId, inW, outW])

    const round1 = useMemo(() => {
        const contracts: QuoteContract[] = []
        const layout: { connector: Address; options: HopOption[]; start: number }[] = []
        if (!ready || !inW) return { contracts, layout }
        for (const c of connectors) {
            const options = candidateHopOptions(inW, c, chainId)
            layout.push({ connector: c, options, start: contracts.length })
            for (const o of options) contracts.push(optionContract(o, amountIn, chainId))
        }
        return { contracts, layout }
    }, [ready, inW, connectors, chainId, amountIn])

    const { data: r1data, isLoading: r1loading } = useReadContracts({
        contracts: round1.contracts,
        query: { enabled: ready && round1.contracts.length > 0, staleTime: 10_000 },
    })

    const hop1PerConnector = useMemo(() => {
        if (!r1data) return []
        const result: { connector: Address; option: HopOption; mid: bigint }[] = []
        for (const { connector, options, start } of round1.layout) {
            const outs = options.map((o, i) => parseOptionOut(o, r1data[start + i]))
            const best = pickBestHopOption(options, outs)
            if (best) result.push({ connector, option: best.option, mid: best.output })
        }
        return result
    }, [r1data, round1.layout])

    const round2 = useMemo(() => {
        const contracts: QuoteContract[] = []
        const layout: {
            hop1: { connector: Address; option: HopOption; mid: bigint }
            options: HopOption[]
            start: number
        }[] = []
        if (!ready || !outW) return { contracts, layout }
        for (const h of hop1PerConnector) {
            const options = candidateHopOptions(h.connector, outW, chainId)
            layout.push({ hop1: h, options, start: contracts.length })
            for (const o of options) contracts.push(optionContract(o, h.mid, chainId))
        }
        return { contracts, layout }
    }, [ready, outW, hop1PerConnector, chainId])

    const { data: r2data, isLoading: r2loading } = useReadContracts({
        contracts: round2.contracts,
        query: { enabled: ready && round2.contracts.length > 0, staleTime: 10_000 },
    })

    const leg = useMemo(() => {
        if (!r2data) return null
        let best: {
            mid: bigint
            hop1: HopOption
            hop2: { option: HopOption; output: bigint }
        } | null = null
        for (const { hop1, options, start } of round2.layout) {
            const outs = options.map((o, i) => parseOptionOut(o, r2data[start + i]))
            const bestOpt2 = pickBestHopOption(options, outs)
            if (!bestOpt2) continue
            if (!best || bestOpt2.output > best.hop2.output) {
                best = { mid: hop1.mid, hop1: hop1.option, hop2: bestOpt2 }
            }
        }
        if (!best) return null
        return buildCrossDexLeg({ option: best.hop1, output: best.mid }, best.hop2)
    }, [r2data, round2.layout])

    return { leg, predictedOut: leg?.predictedOut ?? null, isLoading: r1loading || r2loading }
}
