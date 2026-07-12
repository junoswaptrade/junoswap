'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { formatEther } from 'viem'

import { useAllSwapEvents } from '@/hooks/useAllSwapEvents'
import { formatTokenAmount, formatCompact } from '@/services/launchpad'
import { formatAddress, cn, formatTimeAgo, formatFullDate } from '@/lib/utils'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { useLaunchpadChainId } from '@/hooks/useLaunchpadChainId'
import { getExplorerAddressUrl } from '@/lib/explorer'
import type { EnrichedSwapEvent } from '@/types/launchpad'

const ROTATE_INTERVAL_MS = 4000

function LiveBadge() {
    return (
        <div className="flex shrink-0 items-center gap-2">
            <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-positive opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-positive" />
            </span>
            <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Live
            </span>
        </div>
    )
}

function EventLine({ event, chainId }: { event: EnrichedSwapEvent; chainId: number }) {
    const valueKub = event.isBuy
        ? parseFloat(formatEther(event.amountIn))
        : parseFloat(formatEther(event.amountOut))

    const tokenAmount = event.isBuy
        ? parseFloat(formatEther(event.amountOut))
        : parseFloat(formatEther(event.amountIn))

    return (
        <Link
            href={`/launchpad/token/${event.tokenAddr}?chain=${chainId}`}
            className="notif-enter flex min-w-0 flex-1 items-center gap-2.5 text-xs"
        >
            <span className={cn('font-medium', event.isBuy ? 'text-positive' : 'text-negative')}>
                {event.isBuy ? 'Buy' : 'Sell'}
            </span>
            <span className="truncate">
                <span className="font-semibold text-foreground">{event.tokenSymbol || '???'}</span>
                <span className="ml-2 font-mono tabular-nums tracking-tight text-foreground/80">
                    {formatTokenAmount(BigInt(Math.round(tokenAmount * 1e18)))}
                </span>
                <span className="ml-2 text-muted-foreground">
                    for {formatCompact(valueKub)} KUB
                </span>
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-2.5">
                <span
                    className="hidden cursor-pointer font-mono text-muted-foreground transition-colors hover:text-foreground sm:inline"
                    onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        window.open(getExplorerAddressUrl(chainId, event.sender), '_blank')
                    }}
                >
                    {formatAddress(event.sender)}
                </span>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span className="cursor-default tabular-nums text-muted-foreground/70">
                            {formatTimeAgo(event.timestamp)}
                        </span>
                    </TooltipTrigger>
                    <TooltipContent>{formatFullDate(event.timestamp)}</TooltipContent>
                </Tooltip>
            </span>
        </Link>
    )
}

function SkeletonStrip() {
    return (
        <div className="flex flex-1 items-center gap-2.5">
            <div className="h-3 w-7 animate-pulse rounded bg-muted" />
            <div className="h-3 w-12 animate-pulse rounded bg-muted" />
            <div className="h-3 w-20 animate-pulse rounded bg-muted" />
            <div className="ml-auto h-3 w-16 animate-pulse rounded bg-muted" />
        </div>
    )
}

export function ActivityTicker() {
    const { data: events, isLoading } = useAllSwapEvents()
    const chainId = useLaunchpadChainId()
    const [index, setIndex] = useState(0)
    const hoverRef = useRef(false)

    useEffect(() => {
        if (events.length < 2) return
        const id = setInterval(() => {
            if (!hoverRef.current) setIndex((i) => i + 1)
        }, ROTATE_INTERVAL_MS)
        return () => clearInterval(id)
    }, [events.length])

    if (!isLoading && events.length === 0) return null

    const event = events.length > 0 ? events[index % events.length] : undefined

    return (
        <div
            className="flex h-10 min-w-0 items-center gap-3 overflow-hidden rounded-xl border border-border/50 bg-card/40 px-4"
            onMouseEnter={() => {
                hoverRef.current = true
            }}
            onMouseLeave={() => {
                hoverRef.current = false
            }}
        >
            <LiveBadge />
            <div className="h-3.5 w-px shrink-0 bg-border" />
            {!event ? (
                <SkeletonStrip />
            ) : (
                <EventLine
                    key={`${event.transactionHash}-${index}`}
                    event={event}
                    chainId={chainId}
                />
            )}
        </div>
    )
}
