'use client'

import { SwapCard } from '@/components/swap/swap-card'
import { DexSelectCard } from '@/components/swap/dex-select-card'
import { SwapChartWrapper } from '@/components/swap/swap-chart-wrapper'
import { useSwapStore } from '@/store/swap-store'
import { Suspense, useState } from 'react'

export default function SwapPage() {
    return (
        <Suspense
            fallback={
                <div className="flex min-h-screen items-center justify-center">Loading...</div>
            }
        >
            <SwapContent />
        </Suspense>
    )
}

function SwapContent() {
    const [showChart, setShowChart] = useState(false)
    const tokenIn = useSwapStore((state) => state.tokenIn)
    const tokenOut = useSwapStore((state) => state.tokenOut)
    return (
        <div className="flex min-h-screen items-start justify-center p-4">
            <div className="flex w-full flex-col items-center gap-4 lg:flex-row lg:items-start lg:justify-center">
                {showChart && (
                    <div className="order-1 w-full max-w-md lg:max-w-[760px] lg:flex-1">
                        <SwapChartWrapper tokenIn={tokenIn} tokenOut={tokenOut} />
                    </div>
                )}
                <div className="order-2 w-full max-w-md lg:w-[448px] lg:flex-none">
                    <SwapCard showChart={showChart} onToggleChart={() => setShowChart((v) => !v)} />
                </div>
                <div className="order-3 w-full max-w-md lg:w-80 lg:flex-none">
                    <DexSelectCard />
                </div>
            </div>
        </div>
    )
}
