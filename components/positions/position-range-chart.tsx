'use client'

import { useMemo, useRef, useState } from 'react'
import type { Address } from 'viem'
import { cn } from '@/lib/utils'
import { usePoolPriceHistory } from '@/hooks/usePoolPriceHistory'
import {
    buildPoolPriceSeries,
    computeRangeChartDomain,
    buildLinePath,
    priceToY,
    tickToPriceNumber,
} from '@/lib/position-chart'

const VIEW_W = 200
const VIEW_H = 56
const PLOT_W = 194

interface PositionRangeChartProps {
    poolAddress: Address
    tickLower: number
    tickUpper: number
    currentTick: number
    token0Decimals: number
    token1Decimals: number
    inRange: boolean
    isClosed: boolean
    isFullRange: boolean
    className?: string
}

export function PositionRangeChart({
    poolAddress,
    tickLower,
    tickUpper,
    currentTick,
    token0Decimals,
    token1Decimals,
    inRange,
    isClosed,
    isFullRange,
    className,
}: PositionRangeChartProps) {
    const { events, anchor, isLoading } = usePoolPriceHistory(poolAddress)
    const containerRef = useRef<HTMLDivElement>(null)
    const [hoverIndex, setHoverIndex] = useState<number | null>(null)

    const { series, linePath, bandTop, bandBottom, points } = useMemo(() => {
        const series = buildPoolPriceSeries({
            events,
            anchor,
            decimals0: token0Decimals,
            decimals1: token1Decimals,
            nowSec: Math.floor(Date.now() / 1000),
            fallbackTick: currentTick,
        })
        const priceLower = tickToPriceNumber(tickLower, token0Decimals, token1Decimals)
        const priceUpper = tickToPriceNumber(tickUpper, token0Decimals, token1Decimals)
        const domain = computeRangeChartDomain({
            prices: series.map((p) => p.price),
            ...(isFullRange ? {} : { priceLower, priceUpper }),
        })
        const linePath = buildLinePath(series, domain, PLOT_W, VIEW_H)
        const bandTop = isFullRange ? 0 : priceToY(priceUpper, domain, VIEW_H)
        const bandBottom = isFullRange ? VIEW_H : priceToY(priceLower, domain, VIEW_H)
        const n = series.length
        const points = series.map((p, i) => ({
            xPct: ((n > 1 ? (i / (n - 1)) * PLOT_W : PLOT_W) / VIEW_W) * 100,
            yPct: (priceToY(p.price, domain, VIEW_H) / VIEW_H) * 100,
            price: p.price,
            time: p.time,
        }))
        return { series, linePath, bandTop, bandBottom, points }
    }, [
        events,
        anchor,
        token0Decimals,
        token1Decimals,
        currentTick,
        tickLower,
        tickUpper,
        isFullRange,
    ])

    const dot = points[points.length - 1] ?? null
    const active = hoverIndex !== null ? (points[hoverIndex] ?? null) : null

    const handleMove = (clientX: number) => {
        const el = containerRef.current
        if (!el || points.length === 0) return
        const rect = el.getBoundingClientRect()
        if (rect.width === 0) return
        const frac = (clientX - rect.left) / rect.width
        const plotFrac = frac / (PLOT_W / VIEW_W)
        const idx = Math.round(Math.max(0, Math.min(1, plotFrac)) * (points.length - 1))
        setHoverIndex(Math.max(0, Math.min(points.length - 1, idx)))
    }

    if (isLoading && series.length === 0) {
        return <div className={cn('h-14 w-full animate-pulse rounded-md bg-muted', className)} />
    }
    if (series.length === 0) {
        return <div className={cn('h-14 w-full rounded-md bg-muted/50', className)} />
    }

    const first = series[0]!.price
    const lastPrice = series[series.length - 1]!.price
    const label = isFullRange
        ? `30d price, full range position, current ${formatAria(lastPrice)}`
        : `30d price from ${formatAria(first)} to ${formatAria(lastPrice)}, range ${formatAria(
              tickToPriceNumber(tickLower, token0Decimals, token1Decimals)
          )} to ${formatAria(tickToPriceNumber(tickUpper, token0Decimals, token1Decimals))}`

    return (
        <div
            ref={containerRef}
            className={cn(
                'relative h-14 w-full touch-none',
                series.length > 0 && 'cursor-crosshair',
                isClosed ? 'text-muted-foreground' : inRange ? 'text-positive' : 'text-negative',
                className
            )}
            onMouseMove={(e) => handleMove(e.clientX)}
            onMouseLeave={() => setHoverIndex(null)}
            onTouchStart={(e) => handleMove(e.touches[0]!.clientX)}
            onTouchMove={(e) => handleMove(e.touches[0]!.clientX)}
            onTouchEnd={() => setHoverIndex(null)}
        >
            <svg
                viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
                preserveAspectRatio="none"
                className="h-full w-full"
                role="img"
                aria-label={label}
            >
                <rect
                    x={0}
                    y={bandTop}
                    width={VIEW_W}
                    height={Math.max(0, bandBottom - bandTop)}
                    fill="currentColor"
                    fillOpacity={0.08}
                />
                {!isFullRange && (
                    <>
                        <line
                            x1={0}
                            x2={VIEW_W}
                            y1={bandTop}
                            y2={bandTop}
                            stroke="currentColor"
                            strokeOpacity={0.55}
                            strokeWidth={1}
                            strokeDasharray="3 3"
                            vectorEffect="non-scaling-stroke"
                        />
                        <line
                            x1={0}
                            x2={VIEW_W}
                            y1={bandBottom}
                            y2={bandBottom}
                            stroke="currentColor"
                            strokeOpacity={0.55}
                            strokeWidth={1}
                            strokeDasharray="3 3"
                            vectorEffect="non-scaling-stroke"
                        />
                    </>
                )}
                <path
                    d={linePath}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                />
            </svg>
            {dot && !active && (
                <div
                    className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current ring-2 ring-background"
                    style={{ left: `${dot.xPct}%`, top: `${dot.yPct}%` }}
                />
            )}
            {active && (
                <>
                    <div
                        className="pointer-events-none absolute inset-y-0 w-px bg-current opacity-40"
                        style={{ left: `${active.xPct}%` }}
                    />
                    <div
                        className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current ring-2 ring-background"
                        style={{ left: `${active.xPct}%`, top: `${active.yPct}%` }}
                    />
                    <div
                        className={cn(
                            'pointer-events-none absolute bottom-full z-10 mb-1 whitespace-nowrap rounded-md border bg-popover px-2 py-1 shadow-md',
                            active.xPct < 25
                                ? 'translate-x-0'
                                : active.xPct > 75
                                  ? '-translate-x-full'
                                  : '-translate-x-1/2'
                        )}
                        style={{ left: `${active.xPct}%` }}
                    >
                        <div className="font-mono text-[11px] font-medium leading-tight text-popover-foreground">
                            {formatPrice(active.price)}
                        </div>
                        <div className="text-[10px] leading-tight text-muted-foreground">
                            {formatDate(active.time)}
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}

function formatPrice(price: number): string {
    if (!Number.isFinite(price)) return '—'
    if (price !== 0 && (Math.abs(price) < 0.0001 || Math.abs(price) >= 1e9)) {
        return price.toExponential(2)
    }
    return price.toLocaleString('en-US', { maximumSignificantDigits: 6 })
}

function formatDate(timeSec: number): string {
    return new Date(timeSec * 1000).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    })
}

function formatAria(price: number): string {
    if (!Number.isFinite(price)) return '—'
    if (price !== 0 && (Math.abs(price) < 0.0001 || Math.abs(price) >= 1e9)) {
        return price.toExponential(2)
    }
    return price.toLocaleString('en-US', { maximumSignificantDigits: 4 })
}
