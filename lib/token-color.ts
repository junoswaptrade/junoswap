/**
 * Deterministic hue (0–359) from a token symbol, so logo-less tokens get a
 * stable per-token placeholder color. Cleaning mirrors TokenIcon's getInitials.
 */
export function tokenHue(symbol: string | null | undefined): number {
    const cleaned = (symbol ?? '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    let h = 0
    for (let i = 0; i < cleaned.length; i++) h = (h * 31 + cleaned.charCodeAt(i)) % 360
    return h
}
