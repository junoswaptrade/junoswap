import { zeroAddress, type Address } from 'viem'

export const AGG_ROUTER_JUNOSWAP_BITKUB_ADDRESS =
    '0x869A40921A332e0D79300F91361A3DC77F2a0ebc' as const

const AGG_ROUTER_CHAIN_CONFIG: Record<number, { address: Address }> = {
    96: { address: AGG_ROUTER_JUNOSWAP_BITKUB_ADDRESS },
}

export function getAggRouterAddress(chainId: number): Address | undefined {
    const address = AGG_ROUTER_CHAIN_CONFIG[chainId]?.address
    return address && address !== zeroAddress ? address : undefined
}

export function isAggRouterChain(chainId: number): boolean {
    return getAggRouterAddress(chainId) !== undefined
}

const HOP = {
    name: 'hops',
    type: 'tuple[]',
    components: [
        { name: 'factory', type: 'address' },
        { name: 'swapData', type: 'bytes' },
    ],
} as const

export const AGG_ROUTER_JUNOSWAP_ABI = [
    {
        type: 'function',
        name: 'aggregate',
        stateMutability: 'payable',
        inputs: [
            {
                name: 'p',
                type: 'tuple',
                components: [
                    { name: 'tokenIn', type: 'address' },
                    { name: 'tokenOut', type: 'address' },
                    { name: 'amountIn', type: 'uint256' },
                    { name: 'minAmountOut', type: 'uint256' },
                    { name: 'recipient', type: 'address' },
                    { name: 'deadline', type: 'uint256' },
                    { name: 'unwrapOut', type: 'bool' },
                    { name: 'referrer', type: 'address' },
                ],
            },
            {
                name: 'legs',
                type: 'tuple[]',
                components: [{ name: 'amountIn', type: 'uint256' }, HOP],
            },
        ],
        outputs: [{ name: 'amountOut', type: 'uint256' }],
    },
    {
        type: 'function',
        name: 'feeBps',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'uint16' }],
    },
    {
        type: 'function',
        name: 'factoryFeeBps',
        stateMutability: 'view',
        inputs: [{ name: '', type: 'address' }],
        outputs: [{ name: '', type: 'uint16' }],
    },
    {
        type: 'function',
        name: 'factoryKind',
        stateMutability: 'view',
        inputs: [{ name: '', type: 'address' }],
        outputs: [{ name: '', type: 'uint8' }],
    },
    {
        type: 'event',
        name: 'Aggregated',
        inputs: [
            { name: 'sender', type: 'address', indexed: true },
            { name: 'tokenIn', type: 'address', indexed: true },
            { name: 'tokenOut', type: 'address', indexed: true },
            { name: 'amountIn', type: 'uint256', indexed: false },
            { name: 'amountOut', type: 'uint256', indexed: false },
            { name: 'fee', type: 'uint256', indexed: false },
            { name: 'legs', type: 'uint256', indexed: false },
            { name: 'referrer', type: 'address', indexed: false },
        ],
    },
] as const
