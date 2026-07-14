import { formatEther } from 'viem'
import { describe, it, expect, vi } from 'vitest'
import {
    calculateBuyOutput,
    calculateSellOutput,
    calculateGraduationProgress,
    calculateExactGraduationReserve,
    calculateStableGraduationProgress,
    formatKub,
    formatKubRounded,
    formatTokenAmount,
    formatCompact,
    isReadyToGraduate,
} from '@/services/launchpad/launchpad'

vi.mock('@coshi190/junoswap-sdk', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    BONDING_CURVE_JUNOSWAP_ABI: [],
}))

describe('calculateBuyOutput', () => {
    it('returns 0n when nativeAmountIn is 0n', () => {
        expect(calculateBuyOutput(0n, 100n, 1000n, 500n)).toBe(0n)
    })

    it('returns 0n when tokenReserve is 0n', () => {
        expect(calculateBuyOutput(100n, 100n, 0n, 500n)).toBe(0n)
    })

    it('returns 0n for negative nativeAmountIn', () => {
        expect(calculateBuyOutput(-1n, 100n, 1000n, 500n)).toBe(0n)
    })

    it('calculates output with 1% fee applied', () => {
        // nativeAmountIn=10000n, nativeReserve=100000n, tokenReserve=800000n, virtualAmount=200000n
        // feeAmount = 10000 * 100 / 10000 = 100
        // amountAfterFee = 9900
        // inputReserve = 200000 + 100000 = 300000
        // output = getAmountOut(9900, 300000, 800000)
        const result = calculateBuyOutput(10000n, 100000n, 800000n, 200000n)
        expect(result).toBeGreaterThan(0n)
    })
})

describe('calculateSellOutput', () => {
    it('returns 0n when tokenAmountIn is 0n', () => {
        expect(calculateSellOutput(0n, 100n, 1000n, 500n)).toBe(0n)
    })

    it('returns 0n when tokenReserve is 0n', () => {
        expect(calculateSellOutput(100n, 100n, 0n, 500n)).toBe(0n)
    })

    it('returns 0n when nativeReserve is 0n', () => {
        expect(calculateSellOutput(100n, 0n, 1000n, 500n)).toBe(0n)
    })

    it('calculates output with 1% fee applied', () => {
        const result = calculateSellOutput(10000n, 100000n, 800000n, 200000n)
        expect(result).toBeGreaterThan(0n)
    })
})

describe('calculateGraduationProgress', () => {
    const INITIAL_TOKEN = 1_000_000_000n * 10n ** 18n

    it('returns 0 when graduation amount is 0', () => {
        expect(calculateGraduationProgress(100n, INITIAL_TOKEN, 0n)).toBe(0)
    })

    it('returns 0 when token reserve is 0', () => {
        expect(calculateGraduationProgress(100n, 0n, 4000n)).toBe(0)
    })

    it('calculates percentage correctly using ratio', () => {
        // 25% progress: nativeReserve = 1000, tokenReserve = INITIAL_TOKEN, graduationAmount = 4000
        // progress = (INITIAL_TOKEN * 1000 * 100) / (INITIAL_TOKEN * 4000) = 25
        expect(calculateGraduationProgress(1000n, INITIAL_TOKEN, 4000n)).toBe(25)
        expect(calculateGraduationProgress(2000n, INITIAL_TOKEN, 4000n)).toBe(50)
    })

    it('caps at 100', () => {
        expect(calculateGraduationProgress(8000n, INITIAL_TOKEN, 4000n)).toBe(100)
    })
})

describe('calculateExactGraduationReserve', () => {
    it('returns graduationAmount unchanged when virtualAmount is 0', () => {
        const graduationAmount = 4000n * 10n ** 18n
        expect(calculateExactGraduationReserve(0n, graduationAmount)).toBe(graduationAmount)
    })

    it('returns graduationAmount unchanged when graduationAmount is 0', () => {
        expect(calculateExactGraduationReserve(3400n * 10n ** 18n, 0n)).toBe(0n)
    })

    it('solves close to the analytically-derived production estimate (~2369.9 ether)', () => {
        const virtualAmount = 3400n * 10n ** 18n
        const graduationAmount = 4000n * 10n ** 18n
        const result = calculateExactGraduationReserve(virtualAmount, graduationAmount)
        const resultEther = Number(formatEther(result))
        expect(resultEther).toBeGreaterThan(2365)
        expect(resultEther).toBeLessThan(2375)
    })

    it('is always strictly below the nominal graduationAmount ceiling', () => {
        const virtualAmount = 3400n * 10n ** 18n
        const graduationAmount = 4000n * 10n ** 18n
        const result = calculateExactGraduationReserve(virtualAmount, graduationAmount)
        expect(result).toBeGreaterThan(0n)
        expect(result).toBeLessThan(graduationAmount)
    })
})

describe('calculateStableGraduationProgress', () => {
    it('returns 0 when exactTarget is 0', () => {
        expect(calculateStableGraduationProgress(1000n, 0n)).toBe(0)
    })

    it('computes percentage against a fixed (non-shrinking) target', () => {
        const exactTarget = 4000n * 10n ** 18n
        expect(calculateStableGraduationProgress(1000n * 10n ** 18n, exactTarget)).toBe(25)
        expect(calculateStableGraduationProgress(2000n * 10n ** 18n, exactTarget)).toBe(50)
    })

    it('caps at 100 even when nativeReserve exceeds the target', () => {
        const exactTarget = 4000n * 10n ** 18n
        expect(calculateStableGraduationProgress(8000n * 10n ** 18n, exactTarget)).toBe(100)
    })
})

describe('formatKub', () => {
    it('returns "0" for zero', () => {
        expect(formatKub(0n)).toBe('0')
    })

    it('returns "<0.0001" for very small values', () => {
        expect(formatKub(1n)).toBe('<0.0001')
    })

    it('formats values < 1 with 4 decimals', () => {
        expect(formatKub(5n * 10n ** 17n)).toBe('0.5000')
    })

    it('formats values < 1000 with 2 decimals', () => {
        expect(formatKub(5n * 10n ** 19n)).toBe('50.00')
    })

    it('formats thousands without suffix', () => {
        expect(formatKub(1500n * 10n ** 18n)).toBe('1500.00')
    })

    it('formats millions with commas', () => {
        expect(formatKub(1500000n * 10n ** 18n)).toBe('1,500,000')
    })
})

describe('formatKubRounded', () => {
    it('rounds to the nearest whole KUB', () => {
        // 2369.66 -> 2370, matching the production graduation-estimate figure
        expect(formatKubRounded(236966n * 10n ** 16n)).toBe('2,370')
    })

    it('rounds down when below the midpoint', () => {
        expect(formatKubRounded(236940n * 10n ** 16n)).toBe('2,369')
    })

    it('returns "0" for zero', () => {
        expect(formatKubRounded(0n)).toBe('0')
    })
})

describe('formatTokenAmount', () => {
    it('returns "0" for zero', () => {
        expect(formatTokenAmount(0n)).toBe('0')
    })

    it('uses B suffix for billions', () => {
        expect(formatTokenAmount(1500000000n * 10n ** 18n)).toBe('1.50B')
    })
})

describe('formatCompact', () => {
    it('returns "0" for zero', () => {
        expect(formatCompact(0)).toBe('0')
    })

    it('returns "<0.01" for very small', () => {
        expect(formatCompact(0.001)).toBe('<0.01')
    })

    it('formats values < 1 with 2 decimals', () => {
        expect(formatCompact(0.5)).toBe('0.50')
    })

    it('formats values < 1000 with 0 decimals', () => {
        expect(formatCompact(42)).toBe('42')
    })

    it('uses K suffix with one decimal', () => {
        expect(formatCompact(1500)).toBe('1.5K')
    })

    it('uses M suffix with one decimal', () => {
        expect(formatCompact(1500000)).toBe('1.5M')
    })

    it('uses B suffix with one decimal', () => {
        expect(formatCompact(1500000000)).toBe('1.5B')
    })
})

describe('isReadyToGraduate', () => {
    // Mirrors BondingCurveJunoswap.graduate's check:
    //   floor(token/native) <= floor(INITIALTOKEN / graduationAmount)
    // Cross-multiplied (no float) as:
    //   token * graduationAmount <= INITIAL_TOKEN * native
    // INITIALTOKEN is constant: 1B tokens × 1e18.
    const INITIAL_TOKEN = 1_000_000_000n * 10n ** 18n
    const ONE_ETHER = 10n ** 18n
    const CAP_150 = 150n * ONE_ETHER
    const CAP_200 = 200n * ONE_ETHER

    it('returns false when isGraduated is true', () => {
        // Even at reserves that would otherwise qualify, a graduated token is not "ready".
        expect(isReadyToGraduate(CAP_150, INITIAL_TOKEN, CAP_150, true)).toBe(false)
    })

    it('returns false when graduationAmount is 0n', () => {
        // Defensive: contract would panic (division by zero) in this state.
        expect(isReadyToGraduate(CAP_150, INITIAL_TOKEN, 0n, false)).toBe(false)
    })

    it('returns false when nativeReserve is 0 and tokenReserve is positive', () => {
        // Contract would panic (division by zero) — UI must say "not ready".
        expect(isReadyToGraduate(0n, INITIAL_TOKEN, CAP_150, false)).toBe(false)
    })

    it('returns true at the equilibrium point (nativeReserve == cap, tokenReserve == INITIAL_TOKEN)', () => {
        expect(isReadyToGraduate(CAP_150, INITIAL_TOKEN, CAP_150, false)).toBe(true)
    })

    it('returns false one wei below the cap on nativeReserve', () => {
        // UI is stricter than the contract at this boundary (the contract's floored
        // division would still allow, but we want the button disabled — better to
        // make the user buy one more wei than to revert).
        expect(isReadyToGraduate(CAP_150 - 1n, INITIAL_TOKEN, CAP_150, false)).toBe(false)
    })

    it('matches the contract for a non-150 cap (regression for the hardcoded-cap bug)', () => {
        // With a 200-ether cap and 200 KUB in reserves, the token is ready.
        expect(isReadyToGraduate(CAP_200, INITIAL_TOKEN, CAP_200, false)).toBe(true)

        // With a 200-ether cap and only 150 KUB in reserves, the token is NOT ready
        // (150/200 < 1, so the ratio token/native = 1B/150 is above 1B/200).
        // The old hardcoded cap of 150 ether would have said TRUE here — that was
        // the bug. This assertion would have failed pre-fix.
        expect(isReadyToGraduate(CAP_150, INITIAL_TOKEN, CAP_200, false)).toBe(false)
    })

    it('returns false when the contract would revert with "not reach graduation cap"', () => {
        // token/native = 1B/100 = 10M, threshold = floor(1B/150) = 6_666_666.
        // 10M > 6_666_666 → contract reverts. UI must agree.
        expect(isReadyToGraduate(100n * ONE_ETHER, INITIAL_TOKEN, CAP_150, false)).toBe(false)
    })

    it('returns true for the stuck-token scenario (past cap, contract sqrt-bug blocks init)', () => {
        // Real on-chain values from a token stuck at graduation because of the
        // Math.sqrt integer-division bug in BondingCurveJunoswap.initialize. The ratio
        // check passes (the rescue flow in useGraduate handles the init bug).
        // 4010 KUB / 461M tokens with 150-ether cap.
        const nativeReserve = 4009_500000000000000000n // 4009.5 KUB
        const tokenReserve = 461_366_962461691276297068760n // ~461M tokens
        expect(isReadyToGraduate(nativeReserve, tokenReserve, CAP_150, false)).toBe(true)
    })
})
