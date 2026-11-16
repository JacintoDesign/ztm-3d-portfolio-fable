import { BUDGET } from './world'

export type Tier = 'desktop' | 'mobile'
let cached: Tier | null = null

/** §15.1 — mobile when the pointer is coarse or the viewport is ≤ 820 px. Resolved once, then frozen. */
export function resolveTier(): Tier {
  if (cached) return cached
  if (typeof window === 'undefined') return 'desktop'
  const coarse = window.matchMedia('(pointer: coarse)').matches
  cached = coarse || window.innerWidth <= BUDGET.tierWidth ? 'mobile' : 'desktop'
  return cached
}

export const pick = <D, M>(v: { desktop: D; mobile: M }): D | M => v[resolveTier()]

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
