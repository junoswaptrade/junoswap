import type { LaunchToken } from './launchpad'
import type { Token } from '@/types/token'

export type TokenType = 'static' | 'graduated' | 'bonding_curve'

export interface CreatedToken {
    token: LaunchToken
    marketCapNative: number
    creatorFeeNative: bigint
    creatorFeeClaimedNative: bigint
    creatorFeeToken: bigint
    creatorFeeClaimedToken: bigint
    tokenUsdPrice: number
}

export interface PortfolioToken {
    token: Token
    balance: bigint
    formattedBalance: string
    priceUsd: number | null
    valueUsd: number
    pnlUsd: number | null
    pnlPercent: number | null
    tokenType: TokenType
}

export interface PortfolioSummary {
    netWorth: number
    totalPnl: number | null
    totalPnlPercent: number | null
}

export interface ActivityLeg {
    tokenAddr: string
    symbol: string
    logo: string
    amount: string
    decimals: number
}

export interface ActivityEvent {
    id: string
    kind: 'trade' | 'transfer'
    tokenAddr: string
    tokenSymbol: string
    tokenName: string
    tokenLogo: string
    isBuy: boolean
    amountIn: string
    amountOut: string
    sell?: ActivityLeg
    buy?: ActivityLeg
    protocol?: string
    direction?: 'in' | 'out'
    counterparty?: string
    transferAmount?: string
    timestamp: number
    transactionHash: string
    sender: string
}
