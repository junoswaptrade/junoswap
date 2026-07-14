'use client'

import { useMemo, useCallback, useState, useEffect } from 'react'
import {
    useWriteContract,
    useWaitForTransactionReceipt,
    useSimulateContract,
    useChainId,
    useReadContract,
} from 'wagmi'
import type { Address } from 'viem'
import type { IncentiveKey, PositionWithTokens } from '@/types/earn'
import {
    getV3Config,
    getV3StakerAddress,
    UNISWAP_V3_STAKER_ABI,
    NONFUNGIBLE_POSITION_MANAGER_ABI,
} from '@coshi190/junoswap-sdk'
import {
    encodeIncentiveKeyData,
    buildUnstakeAndWithdrawMulticall,
    buildUnstakeAndClaimMulticall,
} from '@/services/mining/staking'
const SAFE_TRANSFER_FROM_ABI = [
    {
        type: 'function',
        name: 'safeTransferFrom',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'from', type: 'address' },
            { name: 'to', type: 'address' },
            { name: 'tokenId', type: 'uint256' },
            { name: 'data', type: 'bytes' },
        ],
        outputs: [],
    },
] as const

export function useStakePosition(
    position: PositionWithTokens | null,
    incentiveKey: IncentiveKey | null,
    owner: Address | undefined
): {
    stake: () => void
    approveAndStake: () => void
    needsApproval: boolean
    isPreparing: boolean
    isExecuting: boolean
    isConfirming: boolean
    isSuccess: boolean
    error: Error | null
    hash: `0x${string}` | undefined
} {
    const chainId = useChainId()
    const dexConfig = getV3Config(chainId)
    const stakerAddress = getV3StakerAddress(chainId)
    const positionManager = dexConfig?.positionManager
    const isEnabled =
        !!position && !!incentiveKey && !!owner && !!stakerAddress && !!positionManager
    const { data: approvedAddress } = useReadContract({
        address: positionManager,
        abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
        functionName: 'getApproved',
        args: position ? [position.tokenId] : undefined,
        query: { enabled: !!position && !!positionManager },
    })
    const { data: isApprovedForAll } = useReadContract({
        address: positionManager,
        abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
        functionName: 'isApprovedForAll',
        args: owner && stakerAddress ? [owner, stakerAddress] : undefined,
        query: { enabled: !!owner && !!stakerAddress && !!positionManager },
    })
    const needsApproval =
        !isApprovedForAll && approvedAddress?.toLowerCase() !== stakerAddress?.toLowerCase()
    const [justApproved, setJustApproved] = useState(false)
    const stakeCallData = useMemo(() => {
        if (!position || !incentiveKey || !stakerAddress || !positionManager || !owner) {
            return null
        }
        const data = encodeIncentiveKeyData(incentiveKey)
        return {
            address: positionManager as Address,
            abi: SAFE_TRANSFER_FROM_ABI,
            functionName: 'safeTransferFrom' as const,
            args: [owner, stakerAddress, position.tokenId, data] as const,
        }
    }, [position, incentiveKey, stakerAddress, positionManager, owner])
    const {
        data: stakeSimulation,
        isLoading: isSimulating,
        error: simulationError,
    } = useSimulateContract({
        ...stakeCallData!,
        query: {
            enabled: isEnabled && !!stakeCallData && (!needsApproval || justApproved),
        },
    })
    const {
        writeContract,
        data: hash,
        isPending: isExecuting,
        error: writeError,
    } = useWriteContract()
    const {
        isLoading: isConfirming,
        isSuccess,
        error: receiptError,
    } = useWaitForTransactionReceipt({ hash })
    useEffect(() => {
        if (isSuccess && hash && needsApproval) {
            setJustApproved(true)
        }
    }, [isSuccess, hash, needsApproval])
    useEffect(() => {
        setJustApproved(false)
    }, [position?.tokenId, incentiveKey?.rewardToken, owner])
    useEffect(() => {
        if (isSuccess && hash && !needsApproval) {
            setJustApproved(false)
        }
    }, [isSuccess, hash, needsApproval])
    const stake = useCallback(() => {
        if (!stakeSimulation?.request) return
        writeContract(stakeSimulation.request)
    }, [stakeSimulation, writeContract])
    const approveAndStake = useCallback(() => {
        if (!positionManager || !stakerAddress || !position) return
        writeContract({
            address: positionManager,
            abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
            functionName: 'approve',
            args: [stakerAddress, position.tokenId],
        })
    }, [positionManager, stakerAddress, position, writeContract])
    return {
        stake,
        approveAndStake,
        needsApproval,
        isPreparing: isSimulating,
        isExecuting,
        isConfirming,
        isSuccess,
        error: writeError || receiptError || (simulationError as Error | null),
        hash,
    }
}

export function useUnstakePosition(
    tokenId: bigint | undefined,
    incentiveKey: IncentiveKey | null,
    recipient: Address | undefined,
    withdrawAfterUnstake: boolean = true
): {
    unstake: () => void
    isPreparing: boolean
    isExecuting: boolean
    isConfirming: boolean
    isSuccess: boolean
    error: Error | null
    hash: `0x${string}` | undefined
} {
    const chainId = useChainId()
    const stakerAddress = getV3StakerAddress(chainId)
    const isEnabled = tokenId !== undefined && !!incentiveKey && !!recipient && !!stakerAddress
    const multicallData = useMemo(() => {
        if (!isEnabled || !incentiveKey || !recipient || tokenId === undefined) {
            return null
        }
        if (withdrawAfterUnstake) {
            return buildUnstakeAndWithdrawMulticall(tokenId, incentiveKey, recipient)
        }
        return buildUnstakeAndClaimMulticall(tokenId, incentiveKey, recipient)
    }, [tokenId, incentiveKey, recipient, withdrawAfterUnstake, isEnabled])
    const {
        data: unstakeSimulation,
        isLoading: isSimulating,
        error: simulationError,
    } = useSimulateContract({
        address: stakerAddress!,
        abi: UNISWAP_V3_STAKER_ABI,
        functionName: 'multicall',
        args: multicallData ? [multicallData] : undefined,
        query: {
            enabled: isEnabled && !!multicallData,
        },
    })
    const {
        writeContract,
        data: hash,
        isPending: isExecuting,
        error: writeError,
    } = useWriteContract()
    const {
        isLoading: isConfirming,
        isSuccess,
        error: receiptError,
    } = useWaitForTransactionReceipt({ hash })
    const unstake = useCallback(() => {
        if (!unstakeSimulation?.request) return
        writeContract(unstakeSimulation.request)
    }, [unstakeSimulation, writeContract])
    return {
        unstake,
        isPreparing: isSimulating,
        isExecuting,
        isConfirming,
        isSuccess,
        error: writeError || receiptError || (simulationError as Error | null),
        hash,
    }
}
