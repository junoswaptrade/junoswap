'use client'

import Link from 'next/link'
import { Sprout } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { TokenIcon } from '@/components/ui/token-icon'
import { formatAddress, formatTimeAgo } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { formatCompact } from '@/services/launchpad'
import type { LaunchToken } from '@/types/launchpad'
import { useNativeUsdPriceContext } from './native-usd-price-provider'
import { AthProgressBar } from './ath-progress-bar'

interface TokenCardProps {
    token: LaunchToken
    tokenName?: string
    tokenSymbol?: string
    marketCap?: string
    athMarketCap?: string
    isGraduated?: boolean
    priceChange1dPct?: number | null
}

export function TokenCard({
    token,
    tokenName,
    tokenSymbol,
    marketCap,
    athMarketCap,
    isGraduated,
    priceChange1dPct,
}: TokenCardProps) {
    const { nativeUsdPrice } = useNativeUsdPriceContext()
    const symbol = tokenSymbol || token.symbol || '???'
    const name = tokenName || token.name || ''
    const hasAth = !!athMarketCap && parseFloat(athMarketCap) > 0

    const formatMarketCap = (value: string) =>
        nativeUsdPrice !== null
            ? `$${formatCompact(parseFloat(value) * nativeUsdPrice, 2)}`
            : `${formatCompact(parseFloat(value), 2)} KUB`

    return (
        <Link
            href={`/launchpad/token/${token.address}?chain=${token.chainId}`}
            className="group relative block h-full"
        >
            <div className="absolute -inset-[1px] rounded-xl bg-gradient-to-r from-primary to-[#FF914D] opacity-0 blur-md transition-opacity duration-300 group-hover:opacity-40" />
            <Card className="relative h-full transition-all duration-300 hover:scale-[1.02] hover:-translate-y-1">
                <CardContent className="flex h-full items-center gap-3 p-3 sm:gap-4 sm:p-4">
                    <TokenIcon
                        src={token.logo}
                        symbol={symbol}
                        size="xl"
                        variant="square"
                        className="h-24 w-24 shrink-0 lg:h-[120px] lg:w-[120px]"
                    />

                    <div className="flex min-w-0 flex-1 flex-col self-stretch py-1">
                        <div className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-base font-semibold tracking-tight">
                                {symbol}
                            </span>
                            {priceChange1dPct != null && (
                                <span
                                    className={cn(
                                        'shrink-0 text-xs font-medium tabular-nums',
                                        priceChange1dPct >= 0 ? 'text-positive' : 'text-negative'
                                    )}
                                >
                                    {priceChange1dPct >= 0 ? '+' : ''}
                                    {priceChange1dPct.toFixed(2)}%
                                </span>
                            )}
                        </div>
                        {name && name !== symbol && (
                            <p className="truncate text-xs text-muted-foreground">{name}</p>
                        )}
                        <div className="mt-0.5 flex items-center justify-between gap-2">
                            <p className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                                <span className="truncate">{formatAddress(token.creator)}</span>
                                <Sprout className="h-3 w-3 shrink-0" />
                                <span className="shrink-0">
                                    {formatTimeAgo(token.createdTime).replace(' ago', '')}
                                </span>
                            </p>
                            {isGraduated && (
                                <span className="shrink-0 rounded-full border border-positive/25 bg-positive/10 px-2 py-0.5 text-[10px] font-medium text-positive">
                                    Graduated
                                </span>
                            )}
                        </div>

                        <div className="mt-auto pt-3">
                            <div className="flex items-baseline justify-between gap-2">
                                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                                    Mcap
                                </p>
                                {hasAth && (
                                    <p className="text-[11px] tabular-nums text-muted-foreground">
                                        ATH {formatMarketCap(athMarketCap)}
                                    </p>
                                )}
                            </div>
                            <p className="mt-0.5 text-lg font-semibold tabular-nums tracking-tight">
                                {marketCap ? formatMarketCap(marketCap) : '—'}
                            </p>
                            {hasAth && marketCap && (
                                <div className="mt-2">
                                    <AthProgressBar
                                        marketCap={parseFloat(marketCap)}
                                        athMarketCap={parseFloat(athMarketCap)}
                                        className="h-1"
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </Link>
    )
}
