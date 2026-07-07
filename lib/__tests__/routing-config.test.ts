import { describe, it, expect, vi } from 'vitest'
import type { Address } from 'viem'

vi.mock('@/lib/wagmi', () => ({
    kubTestnet: { id: 25925 },
    jbc: { id: 8899 },
    bitkub: { id: 96 },
    worldchain: { id: 480 },
    base: { id: 8453 },
    bsc: { id: 56 },
}))

const IN = '0x1111111111111111111111111111111111111111' as Address
const OUT = '0x2222222222222222222222222222222222222222' as Address
const C1 = '0xaaaa000000000000000000000000000000000001' as Address
const C2 = '0xaaaa000000000000000000000000000000000002' as Address
const C3 = '0xaaaa000000000000000000000000000000000003' as Address
const C4 = '0xaaaa000000000000000000000000000000000004' as Address

describe('enumerateHopPaths', () => {
    it('builds one 2-hop path per connector plus ordered connector pairs for 3-hop', async () => {
        const { enumerateHopPaths } = await import('@/lib/routing-config')
        const paths = enumerateHopPaths(IN, OUT, [C1, C2], 3)
        // 2-hop: [in,c1,out], [in,c2,out]; 3-hop: [in,c1,c2,out], [in,c2,c1,out]
        expect(paths).toEqual([
            [IN, C1, OUT],
            [IN, C2, OUT],
            [IN, C1, C2, OUT],
            [IN, C2, C1, OUT],
        ])
    })

    it('omits 3-hop paths when maxHops is 2', async () => {
        const { enumerateHopPaths } = await import('@/lib/routing-config')
        const paths = enumerateHopPaths(IN, OUT, [C1, C2], 2)
        expect(paths).toEqual([
            [IN, C1, OUT],
            [IN, C2, OUT],
        ])
    })

    it('drops connectors equal to either endpoint (case-insensitive)', async () => {
        const { enumerateHopPaths } = await import('@/lib/routing-config')
        const paths = enumerateHopPaths(IN, OUT, [IN.toUpperCase() as Address, C1, OUT], 3)
        // only C1 survives as a usable connector
        expect(paths).toEqual([[IN, C1, OUT]])
    })

    it('caps the quadratic 3-hop expansion to the top connectors', async () => {
        const { enumerateHopPaths, MAX_DEEP_CONNECTORS } = await import('@/lib/routing-config')
        const paths = enumerateHopPaths(IN, OUT, [C1, C2, C3, C4], 3)
        const threeHop = paths.filter((p) => p.length === 4)
        // all 4 connectors get a 2-hop path, but 3-hop only uses the top MAX_DEEP_CONNECTORS
        expect(paths.filter((p) => p.length === 3)).toHaveLength(4)
        expect(threeHop).toHaveLength(MAX_DEEP_CONNECTORS * (MAX_DEEP_CONNECTORS - 1))
        // never reuses the same connector twice in one path
        for (const p of threeHop) {
            expect(p[1]).not.toBe(p[2])
        }
    })
})
