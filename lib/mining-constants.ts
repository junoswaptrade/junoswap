import type { Address } from 'viem'
import type { IncentiveKey } from '@/types/earn'

export const KNOWN_INCENTIVES: Record<number, IncentiveKey[]> = {
    25925: [
        {
            rewardToken: '0x23352915164527e0AB53Ca5519aec5188aa224A2' as Address,
            pool: '0x81182579f4271B910bF108913Be78F0D9C44AaBa' as Address,
            startTime: 1764152820,
            endTime: 1795688820,
            refundee: '0xCA811301C650C92fD45ed32A81C0B757C61595b6' as Address,
        },
    ],
    8899: [],
    96: [
        {
            rewardToken: '0xbB2d2523cF7737Bc9a1884aC2cC1C690Dd8f6D3e' as Address,
            pool: '0xcf0C912a4Efa1b12Eab70f3Ae701d6219103dF0F' as Address,
            startTime: 1765555920,
            endTime: 1766160720,
            refundee: '0x372719aF636C3a8f3819038b782f032436296993' as Address,
        },
    ],
}
