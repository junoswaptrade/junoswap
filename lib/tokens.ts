import type { Token } from '@/types/tokens'
import type { Address } from 'viem'
import { kubTestnet, jbc, bitkub, worldchain, base, bsc, isNativeToken } from './wagmi'
import { resolveLaunchpadLogo } from './logo'
import tokenData from './tokens.json'

const KUSDT_ADDRESS = '0x7d984C24d2499D840eB3b7016077164e15E5faA6' as const

/**
 * Get the allowance function name for a token
 * Most tokens use 'allowance', but KUSDT uses 'allowances' (plural)
 */
export function getAllowanceFunctionName(tokenAddress: Address): 'allowance' | 'allowances' {
    return tokenAddress.toLowerCase() === KUSDT_ADDRESS.toLowerCase() ? 'allowances' : 'allowance'
}

// tokens.json is keyed by chain slug (not numeric id) so that lib/wagmi.ts stays the single
// source of truth for chain ids; the loader below maps each slug to its id and injects chainId.
const CHAIN_ID_BY_SLUG: Record<string, number> = {
    kubTestnet: kubTestnet.id,
    bitkub: bitkub.id,
    jbc: jbc.id,
    worldchain: worldchain.id,
    base: base.id,
    bsc: bsc.id,
}

type RawToken = Omit<Token, 'chainId' | 'address'> & { address: string }

export const TOKEN_LISTS: Record<number, Token[]> = Object.fromEntries(
    Object.entries(tokenData as Record<string, RawToken[]>).map(([slug, tokens]) => {
        const chainId = CHAIN_ID_BY_SLUG[slug]
        return [
            chainId,
            tokens.map((t) => ({
                ...t,
                chainId,
                address: t.address as Address,
                logo: resolveLaunchpadLogo(t.logo),
            })),
        ]
    })
)

export function getTokensForChain(chainId: number): Token[] {
    return TOKEN_LISTS[chainId] || []
}

const STABLECOIN_SYMBOLS: Record<number, string> = {
    [kubTestnet.id]: 'KUSDT',
    [bitkub.id]: 'KUSDT',
    [jbc.id]: 'JUSDT',
    [bsc.id]: 'USDT',
    [worldchain.id]: 'USDC',
    [base.id]: 'USDC',
}

export function getDefaultPairTokens(chainId: number): {
    stablecoin: Token | undefined
    nativeTokens: Token[]
} {
    const tokens = TOKEN_LISTS[chainId] ?? []
    const native = tokens.find((t) => isNativeToken(t.address as Address))
    const wrappedNative = tokens[1] // wrapped native is always at index 1
    const stableSymbol = STABLECOIN_SYMBOLS[chainId]
    const stablecoin = stableSymbol ? tokens.find((t) => t.symbol === stableSymbol) : undefined
    const nativeTokens = [native, wrappedNative].filter((t): t is Token => !!t)
    return { stablecoin, nativeTokens }
}

export function findTokenByAddress(chainId: number, address: string): Token | undefined {
    const tokens = TOKEN_LISTS[chainId] || []
    if (isNativeToken(address as Address)) {
        return tokens.find((t) => t.address === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee')
    }
    return tokens.find((t) => t.address.toLowerCase() === address.toLowerCase())
}
