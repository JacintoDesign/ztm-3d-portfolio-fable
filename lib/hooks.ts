'use client'
import { useSyncExternalStore } from 'react'
import { BUDGET } from './world'
import { resolveTier, type Tier } from './tier'

const none = () => () => {}
/** The frozen tier. The server renders the desktop copy; the client corrects on hydration. */
export const useTier = (): Tier => useSyncExternalStore(none, resolveTier, () => 'desktop')

function useMedia(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query)
      m.addEventListener('change', cb)
      return () => m.removeEventListener('change', cb)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}
export const useReducedMotion = () => useMedia('(prefers-reduced-motion: reduce)')
/** §14.3 — live viewport and orientation, not the frozen tier: overlay chrome follows a resize. */
export const usePortraitPhone = () => useMedia(`(max-width: ${BUDGET.tierWidth}px) and (orientation: portrait)`)
