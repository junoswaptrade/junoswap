'use client'

import { cn } from '@/lib/utils'
import { formatCompact } from '@/services/launchpad'
import type { FeeBreakdown } from '@/services/chart'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { useNativeUsdPriceContext } from './native-usd-price-provider'
import { AthProgressBar } from './ath-progress-bar'

interface TokenStatsProps {
    marketCap: string
    symbol?: string
    isGraduated?: boolean
    athMarketCap?: string
    priceChange1dPct?: number | null
    feeBreakdown?: FeeBreakdown | null
    className?: string
}

export function TokenStats({
    marketCap,
    symbol,
    athMarketCap,
    priceChange1dPct,
    feeBreakdown,
    className,
}: TokenStatsProps) {
    const { nativeUsdPrice } = useNativeUsdPriceContext()
    const mcapNum = parseFloat(marketCap)
    const displayMcap = nativeUsdPrice !== null ? mcapNum * nativeUsdPrice : mcapNum
    const athNum = athMarketCap ? parseFloat(athMarketCap) : 0

    return (
        <div className={cn('flex items-center justify-between gap-6', className)}>
            <div className="shrink-0">
                <div className="flex items-center gap-2">
                    <div className="text-2xl font-bold tabular-nums tracking-tight md:text-3xl">
                        {nativeUsdPrice !== null
                            ? `$${formatCompact(displayMcap, 2)}`
                            : `${formatCompact(displayMcap, 2)} KUB`}
                    </div>
                    {priceChange1dPct != null && (
                        <span
                            className={cn(
                                'inline-flex items-center text-xs font-semibold tabular-nums',
                                priceChange1dPct >= 0 ? 'text-positive' : 'text-negative'
                            )}
                        >
                            {priceChange1dPct >= 0 ? '+' : ''}
                            {priceChange1dPct.toFixed(2)}%
                        </span>
                    )}
                </div>
                <div className="text-xs text-muted-foreground uppercase">
                    mcap
                    {feeBreakdown != null && feeBreakdown.totalNative > 0 && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span className="text-muted-foreground/60 tabular-nums">
                                    {' · revenue '}
                                    {nativeUsdPrice !== null
                                        ? `$${formatCompact(feeBreakdown.totalNative * nativeUsdPrice)}`
                                        : `${formatCompact(feeBreakdown.totalNative)} KUB`}
                                </span>
                            </TooltipTrigger>
                            <TooltipContent className="normal-case">
                                <div className="font-medium">Lifetime trading fee revenue (1%)</div>
                                <div className="mt-1 space-y-0.5 text-muted-foreground tabular-nums">
                                    {feeBreakdown.nativeFees > 0 && (
                                        <div>
                                            {formatCompact(feeBreakdown.nativeFees)} KUB from buys
                                        </div>
                                    )}
                                    {feeBreakdown.tokenFees > 0 && (
                                        <div>
                                            {formatCompact(feeBreakdown.tokenFees)}{' '}
                                            {symbol ?? 'tokens'} from sells
                                        </div>
                                    )}
                                </div>
                            </TooltipContent>
                        </Tooltip>
                    )}
                </div>
            </div>

            {athNum > 0 ? (
                <div className="w-1/3 space-y-1.5">
                    <AthProgressBar
                        marketCap={mcapNum}
                        athMarketCap={athNum}
                        className="h-2.5 bg-muted"
                    />
                    <div className="flex justify-end text-xs text-muted-foreground">
                        <span>
                            ATH{' '}
                            {nativeUsdPrice !== null
                                ? `$${formatCompact(athNum * nativeUsdPrice, 2)}`
                                : `${formatCompact(athNum, 2)} KUB`}
                        </span>
                    </div>
                </div>
            ) : null}
        </div>
    )
}
