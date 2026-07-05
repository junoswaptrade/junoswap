export type DEXType = 'junoswap' | 'uniswap' | 'pancakeswap' | string

interface DEXMetadata {
    id: DEXType
    name: string
    displayName: string
    logo?: string
    description?: string
}

export const DEX_REGISTRY: Record<string, DEXMetadata> = {
    junoswap: {
        id: 'junoswap',
        name: 'junoswap',
        displayName: 'Junoswap',
        logo: 'https://icons.llamao.fi/icons/protocols/junoswap.trade',
        description: 'Uniswap v3-style CLAMM',
    },
    uniswap: {
        id: 'uniswap',
        name: 'uniswap',
        displayName: 'Uniswap V3',
        description: 'Uniswap v3-style CLAMM',
    },
    jibswap: {
        id: 'jibswap',
        name: 'jibswap',
        displayName: 'Jibswap',
        logo: 'https://icons.llamao.fi/icons/protocols/jibswap',
        description: 'Uniswap v2-style AMM',
    },
    udonswap: {
        id: 'udonswap',
        name: 'udonswap',
        displayName: 'UdonSwap',
        logo: 'https://icons.llamao.fi/icons/protocols/udonswap',
        description: 'Uniswap v2-style AMM',
    },
    ponder: {
        id: 'ponder',
        name: 'ponder',
        displayName: 'Ponder Finance',
        logo: 'https://icons.llamao.fi/icons/protocols/ponder-finance',
        description: 'Uniswap v2-style AMM',
    },
    diamon: {
        id: 'diamon',
        name: 'diamon',
        displayName: 'Diamon Finance',
        logo: '/dex/diamon.png',
        description: 'Uniswap v2-style AMM',
    },
    pancakeswap: {
        id: 'pancakeswap',
        name: 'pancakeswap',
        displayName: 'PancakeSwap V3',
        description: 'Uniswap v3-style CLAMM',
    },
    kublerx: {
        id: 'kublerx',
        name: 'kublerx',
        displayName: 'Kublerx',
        logo: 'https://icons.llamao.fi/icons/protocols/kublerx',
        description: 'Uniswap v3-style CLAMM',
    },
}

// Resolve a dexId to its display label + logo for badges (e.g. the Portfolio
// activity feed). Unknown/empty ids fall back to a title-cased label with no
// logo, so the badge still renders a monogram.
export function getProtocolMeta(id?: string | null): { label: string; logo?: string } {
    if (!id) return { label: 'Unknown' }
    const known = DEX_REGISTRY[id]
    if (known) return { label: known.displayName, logo: known.logo }
    return { label: id.charAt(0).toUpperCase() + id.slice(1) }
}
