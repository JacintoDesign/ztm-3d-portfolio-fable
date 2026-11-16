'use client'
import { useSyncExternalStore } from 'react'
import { AUDIO } from '@/lib/world'
import { closeOverlay, openOverlay, useStore } from '@/lib/store'
import { getMuted, setMuted, subscribeMuted } from '@/lib/audio'
import { usePortraitPhone, useTier } from '@/lib/hooks'

const ROWS = {
  desktop: [
    ['Look', 'Drag anywhere to look around.'],
    ['Move', 'WASD or the arrow keys to walk.'],
    ['Interact', 'Press E near a station.'],
    ['Tour', '"Next stop" in the nav glides you to every stop.'],
  ],
  mobile: [
    ['Look', 'Drag anywhere on screen to look around.'],
    ['Move', 'Use the on-screen stick, bottom left, to walk.'],
    ['Interact', 'Tap the prompt that appears near a station.'],
    ['Tour', '"Next stop" in the nav glides you to every stop for you.'],
  ],
} as const

/** §14.2 / §14.3 — the standing pair (help, mute) and the dismissible controls panel. */
export function ControlsHint() {
  const tier = useTier()
  const overlay = useStore((s) => s.overlay)
  const mode = useStore((s) => s.mode)
  const portraitPhone = usePortraitPhone()
  const muted = useSyncExternalStore(subscribeMuted, getMuted, () => false)
  const toggle = () => setMuted(!muted)
  const dismiss = () => {
    try { localStorage.setItem(AUDIO.hintKey, '1') } catch {}
    closeOverlay()
  }
  const btn = 'grid size-10 place-items-center rounded-full border border-white/10 bg-black/55 text-sm text-white/70 backdrop-blur-md hover:text-white'
  return (
    <>
      <div className={`fixed right-[max(0.75rem,env(safe-area-inset-right))] z-[65] flex gap-2 ${portraitPhone ? 'bottom-[max(0.75rem,env(safe-area-inset-bottom))]' : 'top-[max(0.75rem,env(safe-area-inset-top))]'}`}>
        {mode !== 'loading' && (
          <button type="button" aria-label="Controls" className={btn} onClick={() => (overlay === 'hint' ? dismiss() : openOverlay('hint'))}>?</button>
        )}
        <button type="button" aria-label={muted ? 'Unmute sound' : 'Mute sound'} aria-pressed={muted} className={btn} onClick={toggle}>
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z" />
            {muted ? <path d="M16 9.5l5 5m0-5l-5 5" /> : <path d="M16 9a4.5 4.5 0 010 6m2.5-8.5a8 8 0 010 11" />}
          </svg>
        </button>
      </div>
      {overlay === 'hint' && (
        <div className="anim-pop fixed inset-0 z-[62] grid place-items-center bg-void/60 px-4" onClick={dismiss}>
          <div role="dialog" aria-label="Controls" onClick={(e) => e.stopPropagation()} className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-[#080b12]/95 p-5 shadow-2xl">
            <button type="button" aria-label="Close" onClick={dismiss} className="absolute right-3 top-3 grid size-8 place-items-center rounded-full border border-white/10 text-xs text-white/70 hover:text-white">✕</button>
            <p className="text-[10px] uppercase tracking-[0.22em] text-dim">Controls</p>
            <dl className="mt-3">
              {ROWS[tier].map(([label, detail]) => (
                <div key={label} className="grid grid-cols-[5.5rem_1fr] gap-2 border-b border-white/10 py-3">
                  <dt className="text-[11px] uppercase tracking-[0.16em] text-warm">{label}</dt>
                  <dd className="font-sans text-sm leading-snug text-ink/80">{detail}</dd>
                </div>
              ))}
            </dl>
            <button type="button" onClick={dismiss} className="mt-4 w-full rounded-full bg-ink py-2.5 text-xs font-bold uppercase tracking-[0.2em] text-void hover:bg-white">Got it</button>
          </div>
        </div>
      )}
    </>
  )
}
