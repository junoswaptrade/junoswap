'use client'

import { useMemo, useState } from 'react'
import { useTokenList } from '@/hooks/useTokenList'
import { useGraduatedMarketCaps } from '@/hooks/useGraduatedMarketCaps'
import { useLaunchpadChainId } from '@/hooks/useLaunchpadChainId'
import type { LaunchpadSortKey } from '@/types/launchpad'
import { TokenCard } from './token-card'
import { SortTabs } from './sort-tabs'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'

interface TokenListProps {
    searchQuery?: string
}

export function TokenList({ searchQuery = '' }: TokenListProps) {
    const { tokens, snapshotMap, isLoading } = useTokenList()
    const [sortKey, setSortKey] = useState<LaunchpadSortKey>('last-trade')
    const chainId = useLaunchpadChainId()

    const graduatedAddresses = useMemo(
        () => tokens.filter((t) => t.isGraduated).map((t) => t.address),
        [tokens]
    )
    const liveMarketCaps = useGraduatedMarketCaps(graduatedAddresses, chainId)

    const enrichedTokens = useMemo(() => {
        return tokens.map((token) => {
            const snapshot = snapshotMap.get(token.address.toLowerCase())
            const liveMarketCap = liveMarketCaps.get(token.address.toLowerCase())

            return {
                token,
                tokenName: token.name,
                tokenSymbol: token.symbol,
                isGraduated: !!token.isGraduated,
                marketCap:
                    liveMarketCap !== undefined ? String(liveMarketCap) : snapshot?.marketCapNative,
                athMarketCap: snapshot?.athMarketCapNative,
                priceChange1dPct: snapshot?.priceChange1dPct ?? undefined,
            }
        })
    }, [tokens, snapshotMap, liveMarketCaps])

    const filtered = useMemo(() => {
        if (!searchQuery.trim()) return enrichedTokens
        const q = searchQuery.toLowerCase().trim()
        return enrichedTokens.filter(({ token, tokenName, tokenSymbol }) => {
            const symbol = (tokenSymbol || token.symbol || '').toLowerCase()
            const name = (tokenName || token.name || '').toLowerCase()
            const addr = token.address.toLowerCase()
            const creator = token.creator.toLowerCase()
            return symbol.includes(q) || name.includes(q) || addr.includes(q) || creator.includes(q)
        })
    }, [enrichedTokens, searchQuery])

    const sorted = useMemo(() => {
        return [...filtered].sort((a, b) => {
            switch (sortKey) {
                case 'last-trade': {
                    const aLast = snapshotMap.get(a.token.address.toLowerCase())?.lastSwapAt ?? 0
                    const bLast = snapshotMap.get(b.token.address.toLowerCase())?.lastSwapAt ?? 0
                    if (bLast !== aLast) return bLast - aLast
                    return b.token.createdTime - a.token.createdTime
                }
                case 'market-cap': {
                    const aMc = parseFloat(a.marketCap ?? '0')
                    const bMc = parseFloat(b.marketCap ?? '0')
                    return bMc - aMc
                }
                case 'new':
                    return b.token.createdTime - a.token.createdTime
                case 'oldest':
                    return a.token.createdTime - b.token.createdTime
            }
        })
    }, [filtered, sortKey, snapshotMap])

    if (isLoading) {
        return <TokenListSkeleton />
    }

    if (tokens.length === 0) {
        return (
            <EmptyState
                title="No tokens yet"
                description="Be the first to create a token on the launchpad!"
            />
        )
    }

    if (filtered.length === 0) {
        return (
            <EmptyState
                title="No results"
                description={`No tokens matching "${searchQuery.trim()}"`}
            />
        )
    }

    return (
        <div>
            <div className="mb-4 flex items-center justify-between">
                <SortTabs value={sortKey} onChange={setSortKey} />
            </div>
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
                {sorted.map(
                    ({
                        token,
                        tokenName,
                        tokenSymbol,
                        isGraduated,
                        marketCap,
                        athMarketCap,
                        priceChange1dPct,
                    }) => {
                        return (
                            <TokenCard
                                key={token.address}
                                token={token}
                                tokenName={tokenName}
                                tokenSymbol={tokenSymbol}
                                marketCap={marketCap}
                                athMarketCap={athMarketCap}
                                isGraduated={isGraduated}
                                priceChange1dPct={priceChange1dPct}
                            />
                        )
                    }
                )}
            </div>
        </div>
    )
}

function TokenListSkeleton() {
    return (
        <div>
            <div className="mb-4 flex items-center justify-between">
                <div className="flex gap-2">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-8 w-20 rounded-full bg-muted animate-pulse" />
                    ))}
                </div>
            </div>
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                    <Card key={i}>
                        <CardContent className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
                            <div className="h-24 w-24 shrink-0 animate-pulse rounded-xl bg-muted lg:h-[120px] lg:w-[120px]" />
                            <div className="flex min-w-0 flex-1 flex-col self-stretch py-1">
                                <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                                <div className="mt-1.5 h-3 w-32 animate-pulse rounded bg-muted" />
                                <div className="mt-auto space-y-1.5 pt-3">
                                    <div className="h-3 w-20 animate-pulse rounded bg-muted" />
                                    <div className="h-5 w-24 animate-pulse rounded bg-muted" />
                                    <div className="h-1 w-full animate-pulse rounded-full bg-muted" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    )
}
