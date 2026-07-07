'use client'

import { cn } from '@/lib/utils'

interface AthProgressBarProps {
    marketCap: number
    athMarketCap: number
    className?: string
}

const SPARKS = [
    { x: 14, y: -9, size: 3, delay: 0, duration: 1.15 },
    { x: 10, y: -14, size: 2, delay: 0.35, duration: 0.95 },
    { x: 17, y: -2, size: 2.5, delay: 0.6, duration: 1.3 },
    { x: 8, y: 7, size: 2, delay: 0.9, duration: 1.05 },
    { x: 13, y: 10, size: 1.5, delay: 1.2, duration: 0.9 },
]

export function AthProgressBar({ marketCap, athMarketCap, className }: AthProgressBarProps) {
    const progress = Math.min((marketCap / athMarketCap) * 100, 100)
    const isAtAth = athMarketCap > 0 && marketCap >= athMarketCap * 0.999

    return (
        <div className="relative">
            <div
                className={cn(
                    'h-2 w-full overflow-hidden rounded-full bg-secondary transition-colors duration-300',
                    className,
                    isAtAth && 'bg-amber-500/15'
                )}
            >
                <div
                    className={cn(
                        'relative h-full overflow-hidden rounded-full transition-all duration-300',
                        isAtAth && 'animate-ath-glow'
                    )}
                    style={{
                        width: `${progress}%`,
                        background: isAtAth
                            ? 'linear-gradient(90deg, rgb(245 158 11 / 0.25), rgb(245 158 11) 60%, rgb(251 191 36) 85%, rgb(253 230 138))'
                            : 'linear-gradient(90deg, hsl(var(--positive) / 0.3), hsl(var(--positive)))',
                    }}
                >
                    {isAtAth && (
                        <>
                            <div className="animate-ath-shimmer absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-transparent via-white/50 to-transparent" />
                            <div className="animate-ath-flicker absolute inset-y-0 right-0 w-1/5 min-w-4 rounded-full bg-gradient-to-r from-transparent via-amber-300/60 to-amber-100" />
                            <div className="animate-ath-edge-jitter absolute inset-y-0 right-0 w-2 bg-gradient-to-r from-transparent to-white/90" />
                            <div className="animate-ath-ignite absolute inset-0 rounded-full bg-white" />
                        </>
                    )}
                </div>
            </div>
            {isAtAth && (
                <div className="pointer-events-none absolute inset-y-0 right-0" aria-hidden="true">
                    {SPARKS.map((spark) => (
                        <div
                            key={`${spark.x}-${spark.y}`}
                            className="animate-ath-spark absolute right-0 top-1/2 rounded-full"
                            style={
                                {
                                    width: spark.size,
                                    height: spark.size,
                                    marginTop: -spark.size / 2,
                                    boxShadow: '0 0 4px rgb(245 158 11)',
                                    animationDelay: `${spark.delay}s`,
                                    animationDuration: `${spark.duration}s`,
                                    '--spark-x': `${spark.x}px`,
                                    '--spark-y': `${spark.y}px`,
                                } as React.CSSProperties
                            }
                        />
                    ))}
                </div>
            )}
        </div>
    )
}
