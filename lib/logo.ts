export const PINATA_GATEWAY = 'https://cmswap.mypinata.cloud/ipfs'

export function resolveLaunchpadLogo(logo?: string | null): string {
    const url = logo?.trim()
    if (!url) return ''

    if (url.startsWith('ipfs://')) {
        return `${PINATA_GATEWAY}/${url.slice(7).replace(/^ipfs\//, '')}`
    }

    const marker = url.indexOf('/ipfs/')
    if (/^https?:\/\//i.test(url) && marker !== -1) {
        return `${PINATA_GATEWAY}/${url.slice(marker + 6)}`
    }

    if (/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[A-Za-z2-7]{58,})$/.test(url)) {
        return `${PINATA_GATEWAY}/${url}`
    }

    return url
}
