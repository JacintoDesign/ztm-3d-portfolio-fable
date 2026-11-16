'use client'
import { useEffect, useRef } from 'react'
import { WALK } from '@/lib/world'
import { canControl, getState, useStore } from '@/lib/store'
import { rig } from '@/lib/rig'
import { useTier } from '@/lib/hooks'

const SIZE = WALK.stick.size
const REACH = SIZE / 2 - 22

/**
 * §12.3 — the on-screen stick. A sibling of the canvas, so a thumb here never
 * reaches the look listener. It writes the intent vector directly: a pointermove
 * at 120 Hz through React state would re-render faster than the world draws.
 */
export function TouchStick() {
  const tier = useTier()
  const live = useStore(canControl)
  const base = useRef<HTMLDivElement>(null)
  const knob = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = base.current
    if (!el) return
    let id = -1
    const set = (x: number, y: number) => {
      rig.stick.x = x
      rig.stick.y = y
      if (knob.current) knob.current.style.transform = `translate(${x * REACH}px, ${-y * REACH}px)`
    }
    const read = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      let x = (e.clientX - (r.left + r.width / 2)) / REACH
      let y = -(e.clientY - (r.top + r.height / 2)) / REACH
      const len = Math.hypot(x, y)
      if (len > 1) { x /= len; y /= len }
      // The dead zone is remapped so its edge is 0 and the ring edge is 1.
      const m = Math.min(1, len)
      const k = m <= WALK.stick.deadZone ? 0 : (m - WALK.stick.deadZone) / (1 - WALK.stick.deadZone) / (m || 1)
      set(x * k, y * k)
    }
    const down = (e: PointerEvent) => {
      if (id !== -1 || !canControl(getState())) return
      id = e.pointerId
      el.setPointerCapture(id)
      read(e)
    }
    const move = (e: PointerEvent) => { if (e.pointerId === id) read(e) }
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id) return
      id = -1
      set(0, 0)
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      set(0, 0)
    }
  }, [tier])

  useEffect(() => {
    if (!live) { rig.stick.x = 0; rig.stick.y = 0; if (knob.current) knob.current.style.transform = '' }
  }, [live])

  if (tier !== 'mobile') return null
  // Faded rather than unmounted while frozen: a control that is visible and does nothing is worse than one that is gone.
  return (
    <div
      ref={base}
      aria-hidden
      className="fixed z-20 grid touch-none place-items-center rounded-full border border-white/15 bg-black/35 backdrop-blur-sm transition-opacity duration-200"
      style={{
        width: SIZE, height: SIZE,
        left: `calc(${WALK.stick.inset}px + env(safe-area-inset-left))`,
        bottom: `calc(${WALK.stick.inset}px + env(safe-area-inset-bottom))`,
        opacity: live ? 1 : 0,
        pointerEvents: live ? 'auto' : 'none',
      }}
    >
      <div ref={knob} className="size-11 rounded-full border border-white/30 bg-white/20" />
    </div>
  )
}
