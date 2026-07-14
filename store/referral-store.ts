import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ReferralStore {
    referrer: string | null
    setReferrer: (ref: string) => void
}

export const useReferralStore = create<ReferralStore>()(
    persist(
        (set) => ({
            referrer: null,
            setReferrer: (referrer) => set({ referrer }),
        }),
        { name: 'junoswap-referral' }
    )
)
