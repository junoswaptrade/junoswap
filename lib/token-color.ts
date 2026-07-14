export function tokenHue(symbol: string | null | undefined): number {
    const cleaned = (symbol ?? '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    let h = 0
    for (let i = 0; i < cleaned.length; i++) h = (h * 31 + cleaned.charCodeAt(i)) % 360
    return h
}
