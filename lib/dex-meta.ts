interface DexMeta {
    id: string
    displayName: string
    logo?: string
}

export type DEXType = string

export const DEX_REGISTRY: Record<string, DexMeta> = {
    junoswap: {
        id: 'junoswap',
        displayName: 'Junoswap',
        logo: 'https://icons.llamao.fi/icons/protocols/junoswap.trade',
    },
    'junoswap-amm': {
        id: 'junoswap-amm',
        displayName: 'Junoswap AMM',
        logo: 'https://icons.llamao.fi/icons/protocols/junoswap.trade',
    },
    'junoswap-aggregator': {
        id: 'junoswap-aggregator',
        displayName: 'Junoswap Aggregator',
        logo: 'https://icons.llamao.fi/icons/protocols/junoswap.trade',
    },
    uniswap: { id: 'uniswap', displayName: 'Uniswap V3' },
    jibswap: {
        id: 'jibswap',
        displayName: 'Jibswap',
        logo: 'https://icons.llamao.fi/icons/protocols/jibswap',
    },
    udonswap: {
        id: 'udonswap',
        displayName: 'UdonSwap',
        logo: 'https://icons.llamao.fi/icons/protocols/udonswap',
    },
    ponder: {
        id: 'ponder',
        displayName: 'Ponder Finance',
        logo: 'https://icons.llamao.fi/icons/protocols/ponder-finance',
    },
    diamon: { id: 'diamon', displayName: 'Diamon Finance', logo: '/dex/diamon.png' },
    pancakeswap: { id: 'pancakeswap', displayName: 'PancakeSwap V3' },
    kublerx: {
        id: 'kublerx',
        displayName: 'Kublerx',
        logo: 'https://icons.llamao.fi/icons/protocols/kublerx',
    },
}

export function getProtocolMeta(id?: string | null): { label: string; logo?: string } {
    if (!id) return { label: 'Unknown' }
    const known = DEX_REGISTRY[id]
    if (known) return { label: known.displayName, logo: known.logo }
    return { label: id.charAt(0).toUpperCase() + id.slice(1) }
}
