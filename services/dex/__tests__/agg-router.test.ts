import { describe, it, expect, vi, beforeEach } from 'vitest'
import { decodeAbiParameters, size, type Address } from 'viem'
import { ProtocolType } from '@coshi190/junoswap-sdk'
import type { RouteQuote } from '@/types/routing'

const NATIVE = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' as Address
const WNATIVE = '0x67eBD850304c70d983B2d1b93ea79c7CD6c3F6b5' as Address
const TOKEN_B = '0x7d984C24d2499D840eB3b7016077164e15E5faA6' as Address
const TOKEN_C = '0x9B005000A10Ac871947D99001345b01C1cEf2790' as Address
const V2_FACTORY = '0x18c7a4CA020A0c648976208dF2e3AE1BAA32e8d1' as Address
const V3_FACTORY = '0x090C6E5fF29251B1eF9EC31605Bdd13351eA316C' as Address
const RECIPIENT = '0x000000000000000000000000000000000000B0B0' as Address
const REFERRER = '0x000000000000000000000000000000000000CAFE' as Address

const SKIP_UNWRAP_CHAIN = 96
const UNWRAP_CHAIN = 8899

vi.mock('@coshi190/junoswap-sdk', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    ProtocolType: { V2: 'v2', V3: 'v3' },
    getV2Config: vi.fn((_chainId: number, dexId: string) =>
        dexId === 'udonswap' ? { factory: V2_FACTORY } : undefined
    ),
    getV3Config: vi.fn((_chainId: number, dexId: string) =>
        dexId === 'junoswap' ? { factory: V3_FACTORY } : undefined
    ),
}))

const getModule = () => import('@/services/dex/agg-router')

function v2Route(path: Address[]): RouteQuote {
    return {
        route: { path, isMultiHop: path.length > 2, intermediaryTokens: [] },
        quote: {
            amountOut: 1n,
            sqrtPriceX96After: 0n,
            initializedTicksCrossed: 0,
            gasEstimate: 0n,
        },
        dexId: 'udonswap',
        protocolType: ProtocolType.V2,
    }
}

function v3Route(path: Address[], fees: number[]): RouteQuote {
    return {
        route: { path, fees, isMultiHop: path.length > 2, intermediaryTokens: [] },
        quote: {
            amountOut: 1n,
            sqrtPriceX96After: 0n,
            initializedTicksCrossed: 0,
            gasEstimate: 0n,
        },
        dexId: 'junoswap',
        protocolType: ProtocolType.V3,
    }
}

describe('services/dex/agg-router', () => {
    beforeEach(() => vi.clearAllMocks())

    describe('encodeHopSwapData', () => {
        it('encodes a V2 hop as a lone address word', async () => {
            const { encodeHopSwapData } = await getModule()
            const data = encodeHopSwapData(TOKEN_B)

            expect(size(data)).toBe(32)
            expect(decodeAbiParameters([{ type: 'address' }], data)).toEqual([TOKEN_B])
        })

        it('encodes a V3 hop as address + fee tier', async () => {
            const { encodeHopSwapData } = await getModule()
            const data = encodeHopSwapData(TOKEN_B, 3000)

            expect(size(data)).toBe(64)
            expect(decodeAbiParameters([{ type: 'address' }, { type: 'uint24' }], data)).toEqual([
                TOKEN_B,
                3000,
            ])
        })
    })

    describe('routeToHops', () => {
        it('normalizes a native endpoint to the wrapped token', async () => {
            const { routeToHops } = await getModule()
            const [hop] = routeToHops(v2Route([TOKEN_B, NATIVE]), SKIP_UNWRAP_CHAIN)

            expect(hop!.factory).toBe(V2_FACTORY)
            expect(decodeAbiParameters([{ type: 'address' }], hop!.swapData)).toEqual([WNATIVE])
        })

        it('pairs each V3 hop with its own fee tier', async () => {
            const { routeToHops } = await getModule()
            const hops = routeToHops(v3Route([TOKEN_B, TOKEN_C, WNATIVE], [500, 3000]), 96)

            expect(hops.map((h) => h.factory)).toEqual([V3_FACTORY, V3_FACTORY])
            expect(
                hops.map((h) =>
                    decodeAbiParameters([{ type: 'address' }, { type: 'uint24' }], h.swapData)
                )
            ).toEqual([
                [TOKEN_C, 500],
                [WNATIVE, 3000],
            ])
        })

        it('rejects a V3 route whose fee tiers do not cover every hop', async () => {
            const { routeToHops } = await getModule()
            expect(() => routeToHops(v3Route([TOKEN_B, TOKEN_C, WNATIVE], [500]), 96)).toThrow(
                /needs 2 fee tiers/
            )
        })

        it('rejects a hop that collapses to the same token after normalization', async () => {
            const { routeToHops } = await getModule()
            expect(() => routeToHops(v2Route([NATIVE, WNATIVE]), 96)).toThrow(/same token/)
        })

        it('rejects a dex with no factory on the chain', async () => {
            const { routeToHops } = await getModule()
            const route = { ...v2Route([TOKEN_B, TOKEN_C]), dexId: 'ponder' }
            expect(() => routeToHops(route, 96)).toThrow(/no v2 factory for ponder/)
        })
    })

    describe('legToHops', () => {
        it('encodes each hop with its own factory (cross-DEX)', async () => {
            const { legToHops } = await getModule()
            const hops = legToHops([
                {
                    dexId: 'udonswap',
                    protocol: ProtocolType.V2,
                    factory: V2_FACTORY,
                    tokenIn: WNATIVE,
                    tokenOut: TOKEN_C,
                },
                {
                    dexId: 'junoswap',
                    protocol: ProtocolType.V3,
                    factory: V3_FACTORY,
                    tokenIn: TOKEN_C,
                    tokenOut: TOKEN_B,
                    fee: 3000,
                },
            ])
            expect(hops.map((h) => h.factory)).toEqual([V2_FACTORY, V3_FACTORY])
            expect(decodeAbiParameters([{ type: 'address' }], hops[0]!.swapData)).toEqual([TOKEN_C])
            expect(
                decodeAbiParameters([{ type: 'address' }, { type: 'uint24' }], hops[1]!.swapData)
            ).toEqual([TOKEN_B, 3000])
        })

        it('rejects a V3 hop with no fee', async () => {
            const { legToHops } = await getModule()
            expect(() =>
                legToHops([
                    {
                        dexId: 'junoswap',
                        protocol: ProtocolType.V3,
                        factory: V3_FACTORY,
                        tokenIn: WNATIVE,
                        tokenOut: TOKEN_B,
                    },
                ])
            ).toThrow(/missing fee/)
        })
    })

    describe('buildLegs', () => {
        const leg = (amountIn: bigint) => ({
            amountIn,
            hops: [{ factory: V2_FACTORY, swapData: '0x00' as const }],
        })

        it('accepts allocations that sum to amountIn', async () => {
            const { buildLegs } = await getModule()
            expect(buildLegs([leg(60n), leg(40n)], 100n)).toHaveLength(2)
        })

        it('rejects allocations that do not sum to amountIn', async () => {
            const { buildLegs } = await getModule()
            expect(() => buildLegs([leg(60n), leg(41n)], 100n)).toThrow(/sum to 101/)
        })

        it('rejects a leg with no hops', async () => {
            const { buildLegs } = await getModule()
            expect(() => buildLegs([{ amountIn: 100n, hops: [] }], 100n)).toThrow(/no hops/)
        })
    })

    describe('buildAggregateParams', () => {
        const base = {
            tokenIn: TOKEN_B,
            tokenOut: NATIVE,
            amountIn: 100n,
            minAmountOut: 90n,
            recipient: RECIPIENT,
            deadline: 1_800_000_000,
            referrer: REFERRER,
        }

        it('unwraps native output on chains without a KYC-gated wrapped native', async () => {
            const { buildAggregateParams } = await getModule()
            const params = buildAggregateParams({ ...base, chainId: UNWRAP_CHAIN })

            expect(params.unwrapOut).toBe(true)
            expect(params.deadline).toBe(1_800_000_000n)
        })

        it('delivers wrapped native on chains that skip unwrap', async () => {
            const { buildAggregateParams } = await getModule()
            expect(buildAggregateParams({ ...base, chainId: SKIP_UNWRAP_CHAIN }).unwrapOut).toBe(
                false
            )
        })

        it('never unwraps when the output is an ERC20', async () => {
            const { buildAggregateParams } = await getModule()
            const params = buildAggregateParams({
                ...base,
                tokenOut: TOKEN_C,
                chainId: UNWRAP_CHAIN,
            })
            expect(params.unwrapOut).toBe(false)
        })
    })
})
