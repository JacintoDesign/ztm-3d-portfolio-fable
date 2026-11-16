'use client'
import { useEffect, useState } from 'react'
import { GATE, AUDIO } from '@/lib/world'
import { openOverlay, setState, useStore } from '@/lib/store'
import { rig } from '@/lib/rig'
import { startBeds, unlock } from '@/lib/audio'
import { useReducedMotion } from '@/lib/hooks'

/**
 * §14.1 — the gate. Covers the download without narrating it: no progress bar.
 * The first screen of a portfolio says whose it is.
 */
export function Gate() {
  const mode = useStore((s) => s.mode)
  const ready = useStore((s) => s.ready)
  const reduced = useReducedMotion()
  const [timedOut, setTimedOut] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [gone, setGone] = useState(false)

  // The one screen that can trap someone: after 12 s the button enables anyway.
  useEffect(() => {
    const id = window.setTimeout(() => setTimedOut(true), GATE.timeoutMs)
    return () => window.clearTimeout(id)
  }, [])

  if (gone || (mode !== 'loading' && !leaving)) return null
  const enabled = ready || timedOut

  const enter = () => {
    // Four things in one gesture, in this order. The AudioContext is created synchronously, inside the click.
    unlock()
    startBeds()
    setState({ mode: 'play' })
    if (!reduced) rig.sweepStart = performance.now()
    let seen = false
    try { seen = localStorage.getItem(AUDIO.hintKey) === '1' } catch {}
    if (!seen) openOverlay('hint')
    if (reduced) return setGone(true) // §13 — removed rather than faded
    setLeaving(true)
    window.setTimeout(() => setGone(true), GATE.fadeOutMs)
  }

  const line = reduced ? '' : 'anim-rise'
  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-void px-6 text-center"
      style={{ opacity: leaving ? 0 : 1, transition: `opacity ${GATE.fadeOutMs}ms ease-out`, pointerEvents: leaving ? 'none' : 'auto' }}
    >
      <div className="flex flex-col items-center">
        <p className="flex flex-col text-[11px] uppercase tracking-[0.3em] text-dim sm:flex-row sm:gap-[1ch]">
          <span className={line}>{GATE.lines[0]}</span>
          <span className={`${line} mt-2 sm:mt-0`}>{GATE.lines[1]}</span>
        </p>
        <p className="mt-9 font-sans text-6xl font-semibold leading-[0.95] tracking-tight sm:text-8xl">
          <span className={`${line} block text-magenta [text-shadow:0_0_42px_rgb(255_46_106/0.55)]`}>{GATE.lines[2]}</span>
          <span className={`${line} block text-cyan [text-shadow:0_0_42px_rgb(59_217_255/0.45)]`}>{GATE.lines[3]}</span>
        </p>
        <button
          type="button"
          disabled={!enabled}
          onClick={enter}
          className={`${reduced ? '' : 'anim-fade'} mt-12 rounded-full border border-white/25 px-12 py-3.5 text-xs uppercase tracking-[0.34em] text-ink transition-[opacity,background-color,border-color] duration-300 hover:border-white/60 hover:bg-white/10 disabled:cursor-default disabled:opacity-30 disabled:hover:border-white/25 disabled:hover:bg-transparent`}
        >
          {GATE.lines[4]}
        </button>
      </div>
    </div>
  )
}
