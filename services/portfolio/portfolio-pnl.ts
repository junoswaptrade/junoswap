import { formatEther, formatUnits } from 'viem'

export interface PnlSwapEvent {
    tokenAddr: string
    isBuy: boolean
    amountIn: string
    amountOut: string
    timestamp: number
}

export interface TokenPnl {
    costBasisUsd: number
    totalInvestedUsd: number
    realizedUsd: number
    unrealizedUsd: number
    totalPnlUsd: number
    pnlPercent: number
}

export interface PortfolioPnlTotals {
    totalInvestedUsd: number
    realizedUsd: number
    unrealizedUsd: number
    totalPnlUsd: number
    totalPnlPercent: number
}

interface PortfolioPnlResult {
    perToken: Map<string, TokenPnl>
    totals: PortfolioPnlTotals
}

export function computePortfolioPnl(
    events: PnlSwapEvent[],
    balanceByToken: Map<string, number>,
    priceUsdByToken: Map<string, number | null>,
    priceAt: (timestamp: number) => number,
    decimalsByToken?: Map<string, number>
): PortfolioPnlResult {
    const eventsByToken = new Map<string, PnlSwapEvent[]>()
    for (const event of events) {
        const key = event.tokenAddr.toLowerCase()
        const list = eventsByToken.get(key)
        if (list) list.push(event)
        else eventsByToken.set(key, [event])
    }

    const perToken = new Map<string, TokenPnl>()
    const totals: PortfolioPnlTotals = {
        totalInvestedUsd: 0,
        realizedUsd: 0,
        unrealizedUsd: 0,
        totalPnlUsd: 0,
        totalPnlPercent: 0,
    }

    for (const [tokenAddr, tokenEvents] of eventsByToken) {
        const sorted = [...tokenEvents].sort((a, b) => a.timestamp - b.timestamp)
        const decimals = decimalsByToken?.get(tokenAddr) ?? 18

        let position = 0 // tokens held per accounting
        let costPoolUsd = 0 // USD-at-trade-time cost of the held position
        let realizedUsd = 0
        let totalInvestedUsd = 0

        for (const event of sorted) {
            const nativeUsd = priceAt(event.timestamp)
            if (event.isBuy) {
                const tokensIn = parseFloat(formatUnits(BigInt(event.amountOut), decimals))
                const nativePaid = parseFloat(formatEther(BigInt(event.amountIn)))
                const usdPaid = nativePaid * nativeUsd
                position += tokensIn
                costPoolUsd += usdPaid
                totalInvestedUsd += usdPaid
            } else {
                const tokensOut = parseFloat(formatUnits(BigInt(event.amountIn), decimals))
                const nativeRecv = parseFloat(formatEther(BigInt(event.amountOut)))
                const usdRecv = nativeRecv * nativeUsd
                const avgCost = position > 0 ? costPoolUsd / position : 0
                const soldFromPosition = Math.min(tokensOut, position)
                const costOfSold = avgCost * soldFromPosition
                realizedUsd += usdRecv - costOfSold
                costPoolUsd -= costOfSold
                position = Math.max(0, position - tokensOut)
            }
        }

        const currentBalance = balanceByToken.get(tokenAddr) ?? 0
        const currentPrice = priceUsdByToken.get(tokenAddr) ?? null
        const avgCost = position > 0 ? costPoolUsd / position : 0
        const costBasisUsd = avgCost * currentBalance
        const currentValueUsd = currentPrice !== null ? currentPrice * currentBalance : 0
        const unrealizedUsd = currentPrice !== null ? currentValueUsd - costBasisUsd : 0
        const totalPnlUsd = realizedUsd + unrealizedUsd
        const pnlPercent = totalInvestedUsd > 0 ? (totalPnlUsd / totalInvestedUsd) * 100 : 0

        perToken.set(tokenAddr, {
            costBasisUsd,
            totalInvestedUsd,
            realizedUsd,
            unrealizedUsd,
            totalPnlUsd,
            pnlPercent,
        })

        totals.totalInvestedUsd += totalInvestedUsd
        totals.realizedUsd += realizedUsd
        totals.unrealizedUsd += unrealizedUsd
        totals.totalPnlUsd += totalPnlUsd
    }

    totals.totalPnlPercent =
        totals.totalInvestedUsd > 0 ? (totals.totalPnlUsd / totals.totalInvestedUsd) * 100 : 0

    return { perToken, totals }
}

export interface LeaderboardSwapEvent extends PnlSwapEvent {
    sender: string
}

interface AddressTraderStats {
    pnlUsd: number
    pnlPercent: number
    volumeNative: number
    tradeCount: number
    buyCount: number
    sellCount: number
}

export function computeTraderStatsByAddress(
    events: LeaderboardSwapEvent[],
    balanceByAddress: Map<string, Map<string, number>>,
    priceUsdByToken: Map<string, number | null>,
    priceAt: (timestamp: number) => number,
    decimalsByToken?: Map<string, number>
): Map<string, AddressTraderStats> {
    const eventsByAddress = new Map<string, LeaderboardSwapEvent[]>()
    for (const event of events) {
        const key = event.sender.toLowerCase()
        const list = eventsByAddress.get(key)
        if (list) list.push(event)
        else eventsByAddress.set(key, [event])
    }

    const statsByAddress = new Map<string, AddressTraderStats>()

    for (const [address, addrEvents] of eventsByAddress) {
        let volumeNative = 0
        let buyCount = 0
        let sellCount = 0
        for (const event of addrEvents) {
            volumeNative += parseFloat(
                formatEther(BigInt(event.isBuy ? event.amountIn : event.amountOut))
            )
            if (event.isBuy) buyCount++
            else sellCount++
        }

        const { totals } = computePortfolioPnl(
            addrEvents,
            balanceByAddress.get(address) ?? new Map(),
            priceUsdByToken,
            priceAt,
            decimalsByToken
        )

        statsByAddress.set(address, {
            pnlUsd: totals.totalPnlUsd,
            pnlPercent: totals.totalPnlPercent,
            volumeNative,
            tradeCount: addrEvents.length,
            buyCount,
            sellCount,
        })
    }

    return statsByAddress
}
