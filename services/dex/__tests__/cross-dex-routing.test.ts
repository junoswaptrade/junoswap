import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Address } from 'viem'
import { ProtocolType, poolKey } from '@coshi190/junoswap-sdk'

const WNATIVE = '0x67eBD850304c70d983B2d1b93ea79c7CD6c3F6b5' as Address
const KUSDT = '0x7d984C24d2499D840eB3b7016077164e15E5faA6' as Address
const UDON_FACTORY = '0x18c7a4CA020A0c648976208dF2e3AE1BAA32e8d1' as Address
const UDON_ROUTER = '0x7aA32A818cD3a6BcdF827f6a411B7adFF56e7A4A' as Address
const JUNO_FACTORY = '0x090C6E5fF29251B1eF9EC31605Bdd13351eA316C' as Address
const JUNO_QUOTER = '0xCB0c6E78519f6B4c1b9623e602E831dEf0f5ff7f' as Address

vi.mock('@coshi190/junoswap-sdk', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    ProtocolType: { V2: 'v2', V3: 'v3' },
    getDexsByProtocol: vi.fn((_chainId: number, protocol: string) =>
        protocol === 'v2' ? ['udonswap'] : ['junoswap']
    ),
    getV2Config: vi.fn(() => ({ factory: UDON_FACTORY, router: UDON_ROUTER })),
    getV3Config: vi.fn(() => ({
        factory: JUNO_FACTORY,
        quoter: JUNO_QUOTER,
        feeTiers: [500, 3000],
    })),
}))

const getModule = () => import('@/services/dex/cross-dex-routing')

describe('services/dex/cross-dex-routing', () => {
    beforeEach(() => vi.clearAllMocks())

    describe('candidateHopOptions', () => {
        it('lists one option per V2 DEX and one per V3 (DEX × fee tier)', async () => {
            const { candidateHopOptions } = await getModule()
            const opts = candidateHopOptions(WNATIVE, KUSDT, 96)
            expect(opts).toHaveLength(3) // udonswap V2 + junoswap V3 {500, 3000}
            expect(opts.filter((o) => o.protocol === ProtocolType.V2)).toHaveLength(1)
            expect(opts.filter((o) => o.protocol === ProtocolType.V3).map((o) => o.fee)).toEqual([
                500, 3000,
            ])
            expect(opts[0]!.quoteAddress).toBe(UDON_ROUTER)
        })

        it('returns nothing for a same-token hop', async () => {
            const { candidateHopOptions } = await getModule()
            expect(candidateHopOptions(WNATIVE, WNATIVE, 96)).toEqual([])
        })
    })

    describe('pickBestHopOption', () => {
        it('returns the highest-output option and skips failed quotes', async () => {
            const { candidateHopOptions, pickBestHopOption } = await getModule()
            const opts = candidateHopOptions(WNATIVE, KUSDT, 96)
            const best = pickBestHopOption(opts, [100n, null, 150n])
            expect(best?.output).toBe(150n)
            expect(best?.option.fee).toBe(3000)
        })

        it('returns null when nothing quoted', async () => {
            const { candidateHopOptions, pickBestHopOption } = await getModule()
            const opts = candidateHopOptions(WNATIVE, KUSDT, 96)
            expect(pickBestHopOption(opts, [null, 0n, null])).toBeNull()
        })
    })

    describe('buildCrossDexLeg', () => {
        it('chains two hops with per-hop factory, output, and dedup pool keys', async () => {
            const { candidateHopOptions, buildCrossDexLeg } = await getModule()
            const inToC = candidateHopOptions(WNATIVE, KUSDT, 96)
            const cToOut = candidateHopOptions(KUSDT, WNATIVE, 96)
            const hop1 = { option: inToC[0]!, output: 500n } // udonswap V2
            const hop2 = { option: cToOut[2]!, output: 480n } // junoswap V3 fee 3000

            const leg = buildCrossDexLeg(hop1, hop2)
            expect(leg.predictedOut).toBe(480n)
            expect(leg.hops.map((h) => h.dexId)).toEqual(['udonswap', 'junoswap'])
            expect(leg.hops.map((h) => h.factory)).toEqual([UDON_FACTORY, JUNO_FACTORY])
            expect(leg.hops[1]!.fee).toBe(3000)
            expect(leg.poolKeys).toEqual([
                poolKey(UDON_FACTORY, WNATIVE, KUSDT, 0),
                poolKey(JUNO_FACTORY, KUSDT, WNATIVE, 3000),
            ])
        })
    })
})
