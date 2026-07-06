export const PINATA_GATEWAY = 'https://cmswap.mypinata.cloud/ipfs'

// Route any IPFS logo reference through the dedicated Pinata gateway. Bare CIDs,
// ipfs:// URIs, and public */ipfs/<cid> gateway URLs are rewritten; local paths
// (/tokens/*) and non-IPFS external URLs pass through unchanged. Already-dedicated
// URLs contain /ipfs/ and re-emit identically, so this is idempotent.
export function resolveLaunchpadLogo(logo?: string | null): string {
    const url = logo?.trim()
    if (!url) return ''

    // ipfs://<cid>[/path] — tolerate an accidental ipfs:// + ipfs/ double prefix
    if (url.startsWith('ipfs://')) {
        return `${PINATA_GATEWAY}/${url.slice(7).replace(/^ipfs\//, '')}`
    }

    // any http(s) gateway URL that contains /ipfs/<cid>[/path]
    const marker = url.indexOf('/ipfs/')
    if (/^https?:\/\//i.test(url) && marker !== -1) {
        return `${PINATA_GATEWAY}/${url.slice(marker + 6)}`
    }

    // bare CIDv0 (Qm…) or CIDv1 (b…)
    if (/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[A-Za-z2-7]{58,})$/.test(url)) {
        return `${PINATA_GATEWAY}/${url}`
    }

    return url
}
