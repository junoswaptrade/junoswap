import { create } from 'zustand'
import type { Token } from '@/types/token'
import { createJSONStorage, devtools, persist } from 'zustand/middleware'
interface CustomTokensStore {
    customTokens: Token[]
    addCustomToken: (token: Token) => void
    removeCustomToken: (token: Token) => void
}

const sameToken = (a: Token, b: Token) =>
    a.chainId === b.chainId && a.address.toLowerCase() === b.address.toLowerCase()

const safeStorage = createJSONStorage(() => {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
    return { getItem: () => null, setItem: () => {}, removeItem: () => {} }
})

export const useCustomTokensStore = create<CustomTokensStore>()(
    devtools(
        persist(
            (set, get) => ({
                customTokens: [],

                addCustomToken: (token) => {
                    if (get().customTokens.some((t) => sameToken(t, token))) return
                    set((state) => ({ customTokens: [...state.customTokens, token] }))
                },

                removeCustomToken: (token) => {
                    set((state) => ({
                        customTokens: state.customTokens.filter((t) => !sameToken(t, token)),
                    }))
                },
            }),
            { name: 'junoswap-custom-tokens', storage: safeStorage }
        ),
        { name: 'junoswap-custom-tokens' }
    )
)
