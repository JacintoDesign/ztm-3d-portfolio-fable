'use client'
import { useSyncExternalStore } from 'react'
import type { StopId } from './world'

// The mode machine. The world and the DOM are two layers joined by this one store.
export type Mode = 'loading' | 'play' | 'locked' | 'overlay'
export type OverlayId = 'about' | 'contact' | 'hint'
export type Lock = { stop: StopId; arrived: boolean }

export type State = {
  mode: Mode
  lock: Lock | null
  overlay: OverlayId | null
  projectIndex: number
  projectCount: number
  autoAdvance: boolean
  /** A mailbox channel under the pointer — the specific answer beats the general one. */
  hoverChannel: number | null
  /** Station the visitor is in range of and facing. */
  nearStation: string | null
  tourIndex: number
  ready: boolean
  fade: boolean
}

export const canControl = (s: State) => s.mode === 'play'

let state: State = {
  mode: 'loading',
  lock: null,
  overlay: null,
  projectIndex: 0,
  projectCount: 0,
  autoAdvance: true,
  hoverChannel: null,
  nearStation: null,
  tourIndex: 0,
  ready: false,
  fade: false,
}
const listeners = new Set<() => void>()

/** Direct read — for frame loops and event handlers. Never a subscription. */
export const getState = () => state
export function setState(patch: Partial<State>) {
  let changed = false
  for (const k in patch) {
    if (patch[k as keyof State] !== state[k as keyof State]) { changed = true; break }
  }
  if (!changed) return
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
const initial = state

export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(initial))
}

// ── actions ──────────────────────────────────────────────────────────────
export function openOverlay(id: OverlayId) {
  if (state.mode === 'loading') return
  setState({ overlay: id, mode: 'overlay', hoverChannel: null })
}
/** Closing restores a suspended locked view rather than dropping to free play. */
export function closeOverlay() {
  if (!state.overlay) return
  setState({ overlay: null, mode: state.lock ? 'locked' : 'play' })
}
export function releaseLock() {
  if (state.mode !== 'locked') return
  setState({ lock: null, mode: 'play', hoverChannel: null })
}
export function pageProject(delta: number, manual = true) {
  const n = state.projectCount
  if (!n) return
  setState({ projectIndex: (state.projectIndex + delta + n) % n, ...(manual ? { autoAdvance: false } : null) })
}
export function setProject(i: number) {
  setState({ projectIndex: i, autoAdvance: false })
}
