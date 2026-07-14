import { describe, it, expect } from 'vitest'
import { sanitizePricePoints } from '../net-worth-history'

describe('sanitizePricePoints', () => {
    it('drops corrupt prices but keeps real volatility', () => {
        const points = [
            { timestamp: 1, price: 0.74 },
            { timestamp: 2, price: 3.402567868363881e38 }, // float-max indexer glitch
            { timestamp: 3, price: 0.75 },
            { timestamp: 4, price: NaN },
            { timestamp: 5, price: 0 },
            { timestamp: 6, price: 3.24 }, // real ~4x spike
            { timestamp: 7, price: 0.72 },
        ]

        expect(sanitizePricePoints(points).map((p) => p.timestamp)).toEqual([1, 3, 6, 7])
    })

    it('returns empty for no usable points', () => {
        expect(sanitizePricePoints([{ price: Infinity }, { price: -1 }])).toEqual([])
    })
})
