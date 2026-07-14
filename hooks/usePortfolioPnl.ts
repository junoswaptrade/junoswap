'use client'

import { useMemo } from 'react'
import {
    computePortfolioPnl,
    type TokenPnl,
    type PortfolioPnlTotals,
} from '@/services/portfolio/portfolio-pnl'
import type { UserSwapEvent } from '@/hooks/useUserSwapEvents'
import type { TokenHolding } from '@/hooks/useMultiBalances'

const EMPTY_TOTALS: PortfolioPnlTotals = {
    totalInvestedUsd: 0,
    realizedUsd: 0,
    unrealizedUsd: 0,
    totalPnlUsd: 0,
    totalPnlPercent: 0,
}

export function usePortfolioPnl(
    swapEvents: UserSwapEvent[] | undefined,
    holdings: Map<string, TokenHolding>,
    prices: Map<string, number | null>,
    priceAt: (timestamp: number) => number
) {
    const balanceByToken = useMemo(() => {
        const map = new Map<string, number>()
        for (const [key, holding] of holdings) {
            const balance = Number(holding.formattedBalance)
            if (balance > 0) map.set(key, balance)
        }
        return map
    }, [holdings])

    const decimalsByToken = useMemo(() => {
        const map = new Map<string, number>()
        for (const [key, holding] of holdings) {
            map.set(key, holding.token.decimals)
        }
        return map
    }, [holdings])

    return useMemo(() => {
        if (!swapEvents || swapEvents.length === 0) {
            return { pnlByToken: new Map<string, TokenPnl | null>(), totals: EMPTY_TOTALS }
        }

        const { perToken, totals } = computePortfolioPnl(
            swapEvents,
            balanceByToken,
            prices,
            priceAt,
            decimalsByToken
        )

        const pnlByToken = new Map<string, TokenPnl | null>()
        for (const key of holdings.keys()) {
            pnlByToken.set(key, perToken.get(key) ?? null)
        }

        return { pnlByToken, totals }
    }, [swapEvents, balanceByToken, decimalsByToken, prices, priceAt, holdings])
}
