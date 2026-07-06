'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

interface ScrollRevealOptions {
    threshold?: number
    rootMargin?: string
    triggerOnce?: boolean
}

interface ScrollRevealGroupOptions extends ScrollRevealOptions {
    staggerDelay?: number
}

function useReveal(
    { threshold = 0.15, rootMargin = '0px 0px -50px 0px', triggerOnce = true }: ScrollRevealOptions,
    onReveal?: (el: HTMLElement) => void
) {
    const ref = useRef<HTMLElement>(null)
    const [isVisible, setIsVisible] = useState(false)

    useEffect(() => {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            setIsVisible(true)
            return
        }
        const el = ref.current
        if (!el) return

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry) return
                if (entry.isIntersecting) {
                    onReveal?.(el)
                    setIsVisible(true)
                    if (triggerOnce) observer.unobserve(entry.target)
                } else if (!triggerOnce) {
                    setIsVisible(false)
                }
            },
            { threshold, rootMargin }
        )
        observer.observe(el)
        return () => observer.disconnect()
    }, [threshold, rootMargin, triggerOnce, onReveal])

    return { ref, isVisible }
}

export function useScrollReveal(options: ScrollRevealOptions = {}) {
    return useReveal(options)
}

export function useScrollRevealGroup(
    selector: string,
    { threshold = 0.1, staggerDelay = 80, ...options }: ScrollRevealGroupOptions = {}
) {
    const onReveal = useCallback(
        (el: HTMLElement) => {
            el.querySelectorAll<HTMLElement>(selector).forEach((child, index) => {
                child.style.setProperty('--stagger-index', String(index))
                child.style.setProperty('--stagger-step', `${staggerDelay}ms`)
            })
        },
        [selector, staggerDelay]
    )
    return useReveal({ threshold, ...options }, onReveal)
}
