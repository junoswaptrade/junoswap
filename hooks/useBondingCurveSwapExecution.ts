'use client'

import { useMemo } from 'react'
import {
    useAccount,
    useReadContract,
    useSimulateContract,
    useWriteContract,
    usePublicClient,
} from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { zeroAddress, type Address } from 'viem'
import { BONDING_CURVE_JUNOSWAP_ABI } from '@/lib/abis/bonding-curve-junoswap'
import { ERC20_ABI } from '@/lib/abis/erc20'
import { getAllowanceFunctionName } from '@/lib/tokens'
import { useLaunchpadContract } from '@/hooks/useLaunchpadChainId'
import { calculateBuyOutput, calculateSellOutput, calculateMinOutput } from '@/services/launchpad'
import { useSwapStore } from '@/store/swap-store'

interface UseBondingCurveSwapExecutionParams {
    side: 'buy' | 'sell'
    tokenAddr: Address | null
    // nativeAmount when side==='buy', tokenAmount when side==='sell'
    amount: bigint
    nativeReserve: bigint
    tokenReserve: bigint
    virtualAmount: bigint
    enabled?: boolean
}

interface UseBondingCurveSwapExecutionResult {
    execute: () => void
    canExecute: boolean
    expectedOut: bigint
    // minTokenOut for buy, minNativeOut for sell
    minOut: bigint
    isPreparing: boolean
    isExecuting: boolean
    isConfirming: boolean
    isSuccess: boolean
    isError: boolean
    error: Error | null
    hash: Address | undefined
}

export function useBondingCurveSwapExecution({
    side,
    tokenAddr,
    amount,
    nativeReserve,
    tokenReserve,
    virtualAmount,
    enabled = true,
}: UseBondingCurveSwapExecutionParams): UseBondingCurveSwapExecutionResult {
    const isBuy = side === 'buy'
    const { settings } = useSwapStore()
    const slippageBps = Math.round(settings.slippage * 100)
    const { address } = useAccount()
    const { chainId, address: bondingCurveAddress } = useLaunchpadContract()
    const publicClient = usePublicClient({ chainId })

    // Gate the sell simulation on allowance so it re-runs after approval: the bonding curve's
    // sell() does a transferFrom that reverts in simulation while allowance is 0, and the
    // simulation's query key never changes on approval. Sharing this read's cache with
    // useTokenApproval means its post-approval refetch flips `enabled` and re-simulates.
    // Buys spend native value (no transferFrom), so the read is inert for them.
    const { data: allowance = 0n } = useReadContract({
        address: tokenAddr ?? undefined,
        abi: ERC20_ABI,
        functionName: tokenAddr ? getAllowanceFunctionName(tokenAddr) : 'allowance',
        args: [address ?? zeroAddress, bondingCurveAddress ?? zeroAddress],
        chainId,
        query: { enabled: !isBuy && !!tokenAddr && !!address && !!bondingCurveAddress },
    })

    const expectedOut = useMemo(
        () =>
            isBuy
                ? calculateBuyOutput(amount, nativeReserve, tokenReserve, virtualAmount)
                : calculateSellOutput(amount, nativeReserve, tokenReserve, virtualAmount),
        [isBuy, amount, nativeReserve, tokenReserve, virtualAmount]
    )

    const minOut = useMemo(
        () => calculateMinOutput(expectedOut, slippageBps),
        [expectedOut, slippageBps]
    )

    const { data: simulationData, isLoading: isPreparing } = useSimulateContract({
        address: bondingCurveAddress,
        abi: BONDING_CURVE_JUNOSWAP_ABI,
        functionName: isBuy ? 'buy' : 'sell',
        args: tokenAddr ? (isBuy ? [tokenAddr, minOut] : [tokenAddr, amount, minOut]) : undefined,
        value: isBuy ? amount : undefined,
        chainId,
        query: {
            enabled:
                !!tokenAddr &&
                !!bondingCurveAddress &&
                amount > 0n &&
                (isBuy || allowance >= amount) &&
                enabled,
        },
    })

    const {
        data: hash,
        writeContract,
        isPending: isExecuting,
        isError: isWriteError,
        error: writeError,
    } = useWriteContract()

    // Poll for receipt manually (more reliable than useWaitForTransactionReceipt on custom chains)
    const { data: receipt } = useQuery({
        queryKey: [`${side}-receipt`, hash],
        queryFn: async () => {
            if (!hash || !publicClient) return null
            return publicClient.getTransactionReceipt({ hash })
        },
        enabled: !!hash && !!publicClient,
        refetchInterval: (query) => {
            if (query.state.data) return false
            return 2000
        },
    })

    const isConfirming = !!hash && !receipt
    const isSuccess = !!receipt && receipt.status === 'success'
    const isError = isWriteError || (!!receipt && receipt.status === 'reverted')
    const error =
        writeError ||
        (isError && receipt?.status === 'reverted' ? new Error('Transaction reverted') : null)

    const canExecute = !!simulationData?.request

    const execute = () => {
        if (!simulationData?.request) return
        writeContract(simulationData.request)
    }

    return {
        execute,
        canExecute,
        expectedOut,
        minOut,
        isPreparing,
        isExecuting,
        isConfirming,
        isSuccess,
        isError,
        error: error as Error | null,
        hash,
    }
}
