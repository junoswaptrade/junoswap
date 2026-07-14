'use client'

import { useMemo } from 'react'
import { useWaitForTransactionReceipt, useSimulateContract, useSendTransaction } from 'wagmi'
import { encodeFunctionData, type Address } from 'viem'
import { AGG_ROUTER_JUNOSWAP_ABI, getAggRouterAddress } from '@coshi190/junoswap-sdk'
import type { Token } from '@/types/token'
import type { SwapResult } from '@/types/swap'
import { buildAggregateParams, buildLegs, type Leg } from '@/services/dex/agg-router'
import { isNativeToken } from '@/lib/wagmi'
import { toastError } from '@/lib/toast'
import { useReferrer } from '@/hooks/useReferrer'
import { appendTrackingTag } from '@coshi190/junoswap-sdk'

interface UseAggRouterSwapExecutionParams {
    tokenIn: Token
    tokenOut: Token
    amountIn: bigint
    amountOutMinimum: bigint
    recipient: Address
    deadlineMinutes: number
    legs: Leg[] | null
    skipSimulation?: boolean
}

interface UseAggRouterSwapExecutionResult {
    swap: () => void
    canSwap: boolean
    result: SwapResult | null
    isPreparing: boolean
    isExecuting: boolean
    isConfirming: boolean
    isSuccess: boolean
    isError: boolean
    error: Error | null
    hash: Address | undefined
    simulationError: Error | null
    isWrapUnwrap: boolean
}

export function useAggRouterSwapExecution({
    tokenIn,
    tokenOut,
    amountIn,
    amountOutMinimum,
    recipient,
    deadlineMinutes,
    legs,
    skipSimulation = false,
}: UseAggRouterSwapExecutionParams): UseAggRouterSwapExecutionResult {
    const referrer = useReferrer()
    const chainId = tokenIn.chainId
    const router = getAggRouterAddress(chainId)
    const isNativeInput = isNativeToken(tokenIn.address as Address)

    const call = useMemo(() => {
        if (!legs || legs.length === 0) return null
        let checkedLegs: Leg[]
        try {
            checkedLegs = buildLegs(legs, amountIn)
        } catch {
            return null
        }

        const params = buildAggregateParams({
            tokenIn: tokenIn.address as Address,
            tokenOut: tokenOut.address as Address,
            amountIn,
            minAmountOut: amountOutMinimum,
            recipient,
            deadline: Math.floor(Date.now() / 1000) + deadlineMinutes * 60,
            referrer,
            chainId,
        })

        return {
            params,
            legs: checkedLegs,
            value: isNativeInput ? amountIn : undefined,
        }
    }, [
        legs,
        tokenIn,
        tokenOut,
        amountIn,
        amountOutMinimum,
        recipient,
        deadlineMinutes,
        referrer,
        chainId,
        isNativeInput,
    ])

    const {
        data: simulationData,
        isLoading: isPreparing,
        error: simulationError,
    } = useSimulateContract({
        address: router,
        abi: AGG_ROUTER_JUNOSWAP_ABI,
        functionName: 'aggregate',
        args: call ? [call.params, call.legs] : undefined,
        value: call?.value,
        chainId,
        query: { enabled: amountIn > 0n && !!router && !!call && !skipSimulation },
    })

    const {
        data: sendHash,
        sendTransaction,
        isPending: isExecuting,
        isError,
        error,
    } = useSendTransaction()
    const { isSuccess, isPending: isReceiptPending } = useWaitForTransactionReceipt({
        hash: sendHash,
    })

    const executeSwap = () => {
        if (!router) {
            toastError('Aggregation router not available on this chain')
            return
        }
        if (!call || !simulationData?.request) {
            toastError('Swap simulation failed. Please try again.')
            return
        }
        const data = appendTrackingTag(
            encodeFunctionData({
                abi: AGG_ROUTER_JUNOSWAP_ABI,
                functionName: 'aggregate',
                args: [call.params, call.legs],
            }),
            referrer
        )
        sendTransaction({ to: router, data, value: call.value, chainId })
    }

    return {
        swap: executeSwap,
        canSwap: !!simulationData?.request,
        result: null,
        isPreparing,
        isExecuting,
        isConfirming: !!sendHash && isReceiptPending,
        isSuccess,
        isError,
        error: error as Error | null,
        hash: sendHash,
        simulationError: simulationError as Error | null,
        isWrapUnwrap: false,
    }
}
