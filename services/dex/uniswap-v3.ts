import { encodeFunctionData, concat, pad, toHex, type Address, type Hex } from 'viem'
import type { SwapParams } from '@/types/swap'
import { DEFAULT_FEE_TIER } from '@/lib/dex-config'
import { getSwapAddress } from '@/services/tokens'
import { UNISWAP_V3_SWAP_ROUTER_ABI } from '@/lib/abis/uniswap-v3-swap-router'

const ADDRESS_THIS = '0x0000000000000000000000000000000000000002' as Address

export function buildQuoteParams(
    tokenIn: Address,
    tokenOut: Address,
    amountIn: bigint,
    fee: number = DEFAULT_FEE_TIER,
    chainId?: number
) {
    return {
        tokenIn: chainId ? getSwapAddress(tokenIn, chainId) : tokenIn,
        tokenOut: chainId ? getSwapAddress(tokenOut, chainId) : tokenOut,
        amountIn,
        fee,
        sqrtPriceLimitX96: 0n, // 0 = no limit
    }
}

export function buildSwapParams(
    params: SwapParams,
    fee: number = DEFAULT_FEE_TIER,
    chainId?: number
) {
    return {
        tokenIn: chainId ? getSwapAddress(params.tokenIn, chainId) : params.tokenIn,
        tokenOut: chainId ? getSwapAddress(params.tokenOut, chainId) : params.tokenOut,
        fee,
        recipient: params.recipient,
        amountIn: params.amountIn,
        amountOutMinimum: params.amountOutMinimum,
        sqrtPriceLimitX96: 0n, // 0 = no limit
    }
}

export function calculateMinOutput(amountOut: bigint, slippageBasisPoints: number): bigint {
    const slippageMultiplier = BigInt(10000 - slippageBasisPoints)
    return (amountOut * slippageMultiplier) / 10000n
}

function encodeExactInputSingle(params: {
    tokenIn: Address
    tokenOut: Address
    fee: number
    recipient: Address
    amountIn: bigint
    amountOutMinimum: bigint
    sqrtPriceLimitX96: bigint
}): Hex {
    return encodeFunctionData({
        abi: UNISWAP_V3_SWAP_ROUTER_ABI,
        functionName: 'exactInputSingle',
        args: [params],
    })
}

export function encodeUnwrapWETH9(amountMinimum: bigint, recipient: Address): Hex {
    return encodeFunctionData({
        abi: UNISWAP_V3_SWAP_ROUTER_ABI,
        functionName: 'unwrapWETH9',
        args: [amountMinimum, recipient],
    })
}

export function buildMulticallSwapToNative(
    params: SwapParams,
    fee: number,
    chainId: number
): Hex[] {
    const tokenIn = getSwapAddress(params.tokenIn, chainId)
    const tokenOut = getSwapAddress(params.tokenOut, chainId)

    const swapCall = encodeExactInputSingle({
        tokenIn,
        tokenOut,
        fee,
        recipient: ADDRESS_THIS,
        amountIn: params.amountIn,
        amountOutMinimum: params.amountOutMinimum,
        sqrtPriceLimitX96: 0n,
    })

    const unwrapCall = encodeUnwrapWETH9(params.amountOutMinimum, params.recipient)

    return [swapCall, unwrapCall]
}

export function encodeV3Path(tokens: Address[], fees: number[]): Hex {
    if (tokens.length < 2) throw new Error('Path must have at least 2 tokens')
    if (fees.length !== tokens.length - 1) throw new Error('Fees length must be tokens.length - 1')

    const parts: Hex[] = []

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i]
        if (!token) throw new Error(`Token at index ${i} is undefined`)

        parts.push(token.toLowerCase() as Hex)

        if (i < fees.length) {
            const fee = fees[i]
            if (fee === undefined) throw new Error(`Fee at index ${i} is undefined`)
            const feeHex = pad(toHex(fee), { size: 3 })
            parts.push(feeHex)
        }
    }

    return concat(parts)
}

export function buildMultiHopSwapParams(
    tokens: Address[],
    fees: number[],
    amountIn: bigint,
    amountOutMinimum: bigint,
    recipient: Address,
    chainId: number
) {
    const swapTokens = tokens.map((t) => getSwapAddress(t, chainId))
    return {
        path: encodeV3Path(swapTokens, fees),
        recipient,
        amountIn,
        amountOutMinimum,
    }
}

function encodeExactInput(params: {
    path: Hex
    recipient: Address
    amountIn: bigint
    amountOutMinimum: bigint
}): Hex {
    return encodeFunctionData({
        abi: UNISWAP_V3_SWAP_ROUTER_ABI,
        functionName: 'exactInput',
        args: [params],
    })
}

export function buildMulticallMultiHopSwapToNative(
    tokens: Address[],
    fees: number[],
    amountIn: bigint,
    amountOutMinimum: bigint,
    recipient: Address,
    chainId: number
): Hex[] {
    const swapTokens = tokens.map((t) => getSwapAddress(t, chainId))

    const swapCall = encodeExactInput({
        path: encodeV3Path(swapTokens, fees),
        recipient: ADDRESS_THIS,
        amountIn,
        amountOutMinimum,
    })

    const unwrapCall = encodeUnwrapWETH9(amountOutMinimum, recipient)

    return [swapCall, unwrapCall]
}
