'use client'

import { useMemo } from 'react'
import type { Token } from '@/types/token'
import type { Address } from 'viem'
import { getTokensForChain } from '@/lib/tokens'
import { useGraduatedTokens } from '@/hooks/useGraduatedTokens'
import { useV3Tokens } from '@/hooks/useV3Tokens'
import { useCustomTokensStore } from '@/store/custom-tokens-store'

export function useChainTokens(chainId: number): { tokens: Token[]; isLoading: boolean } {
    const staticTokens = useMemo(() => getTokensForChain(chainId), [chainId])
    const { tokens: graduatedTokens, isLoading: isLoadingGraduated } = useGraduatedTokens(chainId)
    const customTokens = useCustomTokensStore((s) => s.customTokens)
    const { tokens: v3Rows, isLoading: isLoadingV3 } = useV3Tokens(chainId)

    const v3Tokens = useMemo(
        () =>
            v3Rows
                .filter((t) => t.symbol || t.name)
                .map(
                    (t): Token => ({
                        address: t.address as Address,
                        symbol: t.symbol || '???',
                        name: t.name || '',
                        decimals: t.decimals || 18,
                        chainId,
                    })
                ),
        [v3Rows, chainId]
    )

    const tokens = useMemo(() => {
        const seen = new Set<string>()
        const merged: Token[] = []

        const add = (token: Token) => {
            const key = token.address.toLowerCase()
            if (!seen.has(key)) {
                seen.add(key)
                merged.push(token)
            }
        }

        for (const t of staticTokens) add(t)
        for (const t of graduatedTokens) add(t)
        for (const t of v3Tokens) add(t)
        for (const t of customTokens) if (t.chainId === chainId) add(t)

        return merged
    }, [staticTokens, graduatedTokens, v3Tokens, customTokens, chainId])

    return { tokens, isLoading: isLoadingV3 || isLoadingGraduated }
}
