'use client'

import { useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import type { Address } from 'viem'
import { normalizeReferrer, DEFAULT_REFERRER } from '@coshi190/junoswap-sdk'
import { useReferralStore } from '@/store/referral-store'

export function useReferrer(): Address {
    const searchParams = useSearchParams()
    const urlRef = searchParams.get('ref')
    const storedRef = useReferralStore((s) => s.referrer)
    const setReferrer = useReferralStore((s) => s.setReferrer)

    useEffect(() => {
        if (!urlRef) return
        const normalized = normalizeReferrer(urlRef)
        if (
            normalized !== DEFAULT_REFERRER &&
            normalized.toLowerCase() !== storedRef?.toLowerCase()
        ) {
            setReferrer(normalized)
        }
    }, [urlRef, storedRef, setReferrer])

    return useMemo(() => {
        const fromUrl = normalizeReferrer(urlRef)
        if (fromUrl !== DEFAULT_REFERRER) return fromUrl
        return normalizeReferrer(storedRef)
    }, [urlRef, storedRef])
}
