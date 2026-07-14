'use client'

import { createContext, createElement, useContext, type ReactNode } from 'react'
import { useChainId } from 'wagmi'
import {
    BONDING_CURVE_JUNOSWAP_CHAIN_ID,
    getBondingCurveAddress,
    isLaunchpadChain,
} from '@coshi190/junoswap-sdk'
import type { Address } from 'viem'

const LaunchpadChainContext = createContext<number | undefined>(undefined)

export function LaunchpadChainProvider({
    chainId,
    children,
}: {
    chainId: number | undefined
    children: ReactNode
}) {
    return createElement(LaunchpadChainContext.Provider, { value: chainId }, children)
}

export function useLaunchpadChainId(): number {
    const override = useContext(LaunchpadChainContext)
    const chainId = useChainId()
    if (override !== undefined) return override
    return isLaunchpadChain(chainId) ? chainId : BONDING_CURVE_JUNOSWAP_CHAIN_ID
}

export function useLaunchpadContract(): { chainId: number; address: Address | undefined } {
    const chainId = useLaunchpadChainId()
    return { chainId, address: getBondingCurveAddress(chainId) }
}
