'use client'
import { useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { LOOK, deg } from '@/lib/world'
import { clamp, easeInOutCubic, wrapAngle } from '@/lib/math'
import { prefersReducedMotion } from '@/lib/tier'
import { canControl, getState, pageProject } from '@/lib/store'
import { rig } from '@/lib/rig'

const PITCH_MAX = deg(LOOK.pitchClampDeg)
const SWIPE_PX = 48

/**
 * §12.2 — drag-to-look, one model on desktop and touch. Pointer events on the
 * canvas, yaw and pitch on the rig, never PointerLockControls: Escape belongs
 * to the overlays. Also runs the pose primitive — target pose, ease, release —
 * that the locked view and the guided path share.
 */
export function Camera() {
  const gl = useThree((s) => s.gl)
  const reduced = prefersReducedMotion()

  useEffect(() => {
    const el = gl.domElement
    let id = -1, lastX = 0, lastY = 0, startX = 0
    const down = (e: PointerEvent) => {
      if (id !== -1) return
      id = e.pointerId
      lastX = startX = e.clientX
      lastY = e.clientY
      rig.dragPx = 0
      el.setPointerCapture(id)
    }
    const move = (e: PointerEvent) => {
      if (e.pointerId !== id) return
      const dx = e.clientX - lastX, dy = e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY
      rig.dragPx += Math.abs(dx) + Math.abs(dy)
      // Looking is gated exactly as movement is: a drag across an overlay must not spin the world behind it.
      if (!canControl(getState())) return
      const k = e.pointerType === 'touch' ? LOOK.sensitivity.touch : LOOK.sensitivity.mouse
      rig.yawTarget -= dx * k
      rig.pitchTarget = clamp(rig.pitchTarget - dy * k, -PITCH_MAX, PITCH_MAX)
    }
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id) return
      if (el.hasPointerCapture(id)) el.releasePointerCapture(id)
      id = -1
      // §2.1 — a horizontal swipe pages the board while its locked view is held.
      const s = getState()
      const travelled = e.clientX - startX
      if (s.mode === 'locked' && s.lock?.stop === 'work' && s.lock.arrived && Math.abs(travelled) > SWIPE_PX) pageProject(travelled < 0 ? 1 : -1)
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.style.touchAction = 'none'
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    }
  }, [gl])

  useFrame((_, delta) => {
    const g = rig.glide
    if (g) {
      g.t = Math.min(1, g.t + delta / g.dur)
      const e = g.linear ? g.t : easeInOutCubic(g.t)
      const a = (1 - e) * (1 - e), b = 2 * (1 - e) * e, c = e * e
      rig.x = a * g.fx + b * g.cx + c * g.to.x
      rig.z = a * g.fz + b * g.cz + c * g.to.z
      rig.yaw = g.fyaw + wrapAngle(g.to.yaw - g.fyaw) * e
      rig.pitch = g.fpitch + (g.to.pitch - g.fpitch) * e
      if (g.t >= 1) {
        rig.yaw = rig.yawTarget = g.to.yaw
        rig.pitch = rig.pitchTarget = g.to.pitch
        rig.glide = null
        rig.arriveTick++
      }
      return
    }
    if (!canControl(getState())) return
    // Framerate-independent smoothing; direct under reduced motion.
    const k = reduced ? 1 : 1 - Math.exp(-LOOK.smoothing * delta)
    rig.yaw += (rig.yawTarget - rig.yaw) * k
    rig.pitch += (rig.pitchTarget - rig.pitch) * k
  })
  return null
}
