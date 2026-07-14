import { createPonderClient, fetchLaunchTokenOg } from '@coshi190/junoswap-sdk'
import { resolveLaunchpadLogo } from '@/lib/logo'
import { applyLaunchpadTokenOverride } from '@/lib/launchpad-token-config'

interface LaunchTokenMeta {
    address: string
    name: string
    symbol: string
    logo: string
    description: string
    isGraduated: boolean
    marketCapNative: number | null
    priceChange1dPct: number | null
    nativeUsdPrice: number | null
}

export async function fetchLaunchTokenMeta(address: string): Promise<LaunchTokenMeta | null> {
    const ponderUrl = process.env.NEXT_PUBLIC_PONDER_URL
    if (!ponderUrl) return null

    try {
        const client = createPonderClient(`${ponderUrl}/graphql`)
        const {
            token,
            snapshot,
            nativeUsdPrice: rawUsd,
        } = await fetchLaunchTokenOg(client, {
            tokenAddr: address.toLowerCase(),
        })
        if (!token) return null

        const meta = applyLaunchpadTokenOverride(token, token.chainId)

        const marketCap = parseFloat(snapshot?.marketCapNative ?? '')
        const nativeUsdPrice = parseFloat(rawUsd?.price ?? '')

        return {
            address,
            name: meta.name ?? '',
            symbol: meta.symbol ?? '',
            logo: resolveLaunchpadLogo(meta.logo),
            description: meta.description ?? '',
            isGraduated: meta.isGraduated === 1,
            marketCapNative: Number.isFinite(marketCap) && marketCap > 0 ? marketCap : null,
            priceChange1dPct: snapshot?.priceChange1dPct
                ? parseFloat(snapshot.priceChange1dPct)
                : null,
            nativeUsdPrice:
                Number.isFinite(nativeUsdPrice) && nativeUsdPrice > 0 ? nativeUsdPrice : null,
        }
    } catch {
        return null
    }
}
