'use client'

import { createConfig, EVM } from '@lifi/sdk'
import { getConnectorClient } from '@wagmi/core'
import { wagmiConfig } from './wagmi'

async function getWalletClient() {
    const client = await getConnectorClient(wagmiConfig)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- bridging wagmi/viem type mismatch with LI.FI SDK's bundled viem
    return client as any
}

createConfig({
    integrator: 'cmswap',
    routeOptions: {
        fee: 0.03, // 3% integrator fee — deducted from fromToken
    },
    providers: [
        EVM({
            getWalletClient,
        }),
    ],
})
