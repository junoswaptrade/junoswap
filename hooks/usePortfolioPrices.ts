'use client'

import { useMemo } from 'react'
import type { Token } from '@/types/token'
import { useTokenPrices } from '@/hooks/useTokenPrices'
import type { TokenHolding } from '@/hooks/useMultiBalances'
import type { TokenType } from '@/types/portfolio'

export function usePortfolioPrices(
    holdings: Map<string, TokenHolding>,
    nativeUsdPrice: number | null,
    chainId: number,
    getTokenType: (token: Token) => TokenType
) {
    const heldTokens = useMemo(() => {
        const tokens: Token[] = []
        for (const [, holding] of holdings) {
            tokens.push(holding.token)
        }
        return tokens
    }, [holdings])

    const {
        prices: allPrices,
        isLoading,
        isSettled,
    } = useTokenPrices(heldTokens, chainId, nativeUsdPrice, getTokenType)

    const prices = useMemo(() => {
        const priceMap = new Map<string, number | null>()
        for (const [key] of holdings) {
            priceMap.set(key, allPrices.get(key) ?? null)
        }
        return priceMap
    }, [holdings, allPrices])

    return { prices, isLoading, isSettled }
}
