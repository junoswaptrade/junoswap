import type { Address } from 'viem'
import type { DEXType } from '@/types/dex'
import { kubTestnet, jbc, bitkub, worldchain, base, bsc } from './wagmi'
import registryData from './dex-config.json'

export enum ProtocolType {
    V2 = 'v2',
    V3 = 'v3',
}

interface BaseProtocolConfig {
    protocolType: ProtocolType
    chainId: number
    enabled: boolean
}

interface V2Config extends BaseProtocolConfig {
    protocolType: ProtocolType.V2
    factory: Address
    router: Address
    wnative?: Address
}

interface V3Config extends BaseProtocolConfig {
    protocolType: ProtocolType.V3
    factory: Address
    quoter: Address
    swapRouter: Address
    positionManager?: Address
    staker?: Address // V3 Staker contract for LP mining
    feeTiers?: number[]
    defaultFeeTier?: number
}

type ProtocolConfig = V2Config | V3Config

interface DEXConfiguration {
    dexId: DEXType
    defaultProtocol: ProtocolType
    priority?: number
    protocols: Record<number, Partial<Record<ProtocolType, ProtocolConfig>>>
}

export const FEE_TIERS = {
    STABLE: 100, // 0.01%
    LOW: 500, // 0.05%
    MEDIUM: 3000, // 0.3% (standard)
    HIGH: 10000, // 1%
} as const

const CHAIN_ID_BY_SLUG: Record<string, number> = {
    kubTestnet: kubTestnet.id,
    jbc: jbc.id,
    bitkub: bitkub.id,
    worldchain: worldchain.id,
    base: base.id,
    bsc: bsc.id,
}

interface RawDex {
    defaultProtocol: string
    priority?: number
    protocols: Record<string, Record<string, Record<string, unknown>>>
}

const DEX_CONFIGS_REGISTRY = Object.fromEntries(
    Object.entries(registryData as Record<string, RawDex>).map(([dexId, dex]) => {
        const protocols: DEXConfiguration['protocols'] = {}
        for (const [slug, byProtocol] of Object.entries(dex.protocols)) {
            const chainId = CHAIN_ID_BY_SLUG[slug]
            if (chainId === undefined) continue
            const entry: Partial<Record<ProtocolType, ProtocolConfig>> = {}
            for (const [proto, cfg] of Object.entries(byProtocol)) {
                entry[proto as ProtocolType] = {
                    ...cfg,
                    protocolType: proto as ProtocolType,
                    chainId,
                } as ProtocolConfig
            }
            protocols[chainId] = entry
        }
        return [
            dexId,
            {
                dexId: dexId as DEXType,
                defaultProtocol: dex.defaultProtocol as ProtocolType,
                priority: dex.priority,
                protocols,
            },
        ]
    })
) as Record<DEXType, DEXConfiguration>

export function getV3Config(chainId: number, dexId?: DEXType): V3Config | undefined {
    const targetDex = dexId || 'junoswap'
    const dexConfig = DEX_CONFIGS_REGISTRY[targetDex]

    if (!dexConfig) {
        return undefined
    }

    const chainProtocols = dexConfig.protocols[chainId]
    if (!chainProtocols) {
        return undefined
    }

    const config = chainProtocols[ProtocolType.V3]
    return config?.protocolType === ProtocolType.V3 && config.enabled ? config : undefined
}

export function getV3StakerAddress(chainId: number, dexId?: DEXType): Address | undefined {
    const config = getV3Config(chainId, dexId)
    return config?.staker
}

export function getV2Config(chainId: number, dexId?: DEXType): V2Config | undefined {
    const targetDex = dexId || 'junoswap'
    const dexConfig = DEX_CONFIGS_REGISTRY[targetDex]

    if (!dexConfig) {
        return undefined
    }

    const chainProtocols = dexConfig.protocols[chainId]
    if (!chainProtocols) {
        return undefined
    }

    const config = chainProtocols[ProtocolType.V2]
    return config?.protocolType === ProtocolType.V2 && config.enabled ? config : undefined
}

export function getDexConfig(chainId: number, dexId?: DEXType): ProtocolConfig | undefined {
    const targetDex = dexId || 'junoswap'
    const dexConfig = DEX_CONFIGS_REGISTRY[targetDex]

    if (!dexConfig) {
        return undefined
    }

    const chainProtocols = dexConfig.protocols[chainId]
    if (!chainProtocols) {
        return undefined
    }

    return chainProtocols[dexConfig.defaultProtocol]
}

export function getDexsByProtocol(chainId: number, protocolType: ProtocolType): DEXType[] {
    return Object.entries(DEX_CONFIGS_REGISTRY)
        .filter(([_, dexConfig]) => {
            const chainProtocols = dexConfig.protocols[chainId]
            if (!chainProtocols) return false

            const protocol = chainProtocols[protocolType]
            return protocol?.enabled ?? false
        })
        .map(([dexId, _]) => dexId as DEXType)
        .sort((a, b) => {
            const priorityA = DEX_CONFIGS_REGISTRY[a]?.priority ?? 999
            const priorityB = DEX_CONFIGS_REGISTRY[b]?.priority ?? 999
            return priorityA - priorityB
        })
}

export function getSupportedDexs(chainId: number): DEXType[] {
    return Object.entries(DEX_CONFIGS_REGISTRY)
        .filter(([_, dexConfig]) => {
            const chainProtocols = dexConfig.protocols[chainId]
            if (!chainProtocols) return false

            return Object.values(chainProtocols).some((protocol) => protocol.enabled)
        })
        .map(([dexId, _]) => dexId as DEXType)
        .sort((a, b) => {
            const priorityA = DEX_CONFIGS_REGISTRY[a]?.priority ?? 999
            const priorityB = DEX_CONFIGS_REGISTRY[b]?.priority ?? 999
            return priorityA - priorityB
        })
}

export function isV2Config(config: ProtocolConfig): config is V2Config {
    return config.protocolType === ProtocolType.V2
}

export function isV3Config(config: ProtocolConfig): config is V3Config {
    return config.protocolType === ProtocolType.V3
}

export function getProtocolSpender(config: ProtocolConfig): Address | undefined {
    switch (config.protocolType) {
        case ProtocolType.V2:
            return config.router
        case ProtocolType.V3:
            return config.swapRouter
        default:
            return undefined
    }
}

export const DEFAULT_FEE_TIER = FEE_TIERS.MEDIUM

/**
 * pancakeswap on BSC, uniswap on Worldchain/Base (real Uniswap V3),
 * junoswap elsewhere (forked/custom deployments).
 */
export function getDefaultDexForChain(chainId: number): DEXType {
    if (chainId === bsc.id) return 'pancakeswap'
    if (chainId === worldchain.id || chainId === base.id) return 'uniswap'
    return 'junoswap'
}
