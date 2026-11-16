'use client'
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { PerspectiveCamera } from 'three'
import { CAMERA, GATE, LAYOUT, SHOPS, WALK, deg } from '@/lib/world'
import { easeOutCubic, yawToThree } from '@/lib/math'
import { prefersReducedMotion } from '@/lib/tier'
import { canControl, getState } from '@/lib/store'
import { resolve } from '@/lib/collision'
import { rig } from '@/lib/rig'
import { footstep } from '@/lib/audio'

const KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
}
const held = new Set<string>()
function refreshKeys() {
  let x = 0, y = 0
  for (const k of held) { x += KEYS[k][0]; y += KEYS[k][1] }
  // Normalised, so W+D is not 1.41× faster than W.
  const len = Math.hypot(x, y) || 1
  rig.keys.x = x / len
  rig.keys.y = y / len
}

/** §12.3 / §12.4 — walking: camera-relative, flattened to the ground, a capsule and a clamp. */
export function Player() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const reduced = prefersReducedMotion()
  const bob = useRef(0)

  useEffect(() => {
    camera.rotation.order = 'YXZ' // before any rotation value: yaw and pitch stay independent
    const down = (e: KeyboardEvent) => {
      if (!(e.code in KEYS) || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      // Bumped above the gate: movement input releases a locked view, and only the lock watches this.
      rig.moveTick++
      if (!canControl(getState())) return
      held.add(e.code)
      refreshKeys()
      e.preventDefault()
    }
    const up = (e: KeyboardEvent) => { if (held.delete(e.code)) refreshKeys() }
    // A keyup delivered to a hidden tab is never delivered at all.
    const clear = () => { held.clear(); refreshKeys() }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    document.addEventListener('visibilitychange', clear)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
      document.removeEventListener('visibilitychange', clear)
    }
  }, [camera])

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05)
    if (canControl(getState())) {
      // Two input paths, one intent vector: summed, then clamped to the unit disc.
      let ix = rig.keys.x + rig.stick.x, iy = rig.keys.y + rig.stick.y
      const len = Math.hypot(ix, iy)
      if (len > 1) { ix /= len; iy /= len }
      if (len > 0.001) {
        const fx = Math.sin(rig.yaw), fz = Math.cos(rig.yaw)
        const tx = (fx * iy - fz * ix) * WALK.speed, tz = (fz * iy + fx * ix) * WALK.speed
        // Accelerate toward the desired velocity vector, so turning redirects instead of adding.
        const dx = tx - rig.vx, dz = tz - rig.vz
        const d = Math.hypot(dx, dz), stepV = WALK.acceleration * dt
        if (d <= stepV) { rig.vx = tx; rig.vz = tz } else { rig.vx += (dx / d) * stepV; rig.vz += (dz / d) * stepV }
      } else {
        const k = Math.exp(-WALK.damping * dt) // damping only while there is no input
        rig.vx *= k
        rig.vz *= k
      }
      const p = resolve(rig.x, rig.z, rig.x + rig.vx * dt, rig.z + rig.vz * dt)
      rig.x = p.x
      rig.z = p.z
    } else if (held.size) {
      held.clear()
      refreshKeys()
      rig.vx = rig.vz = 0
    } else rig.vx = rig.vz = 0

    rig.speed = Math.hypot(rig.vx, rig.vz) / WALK.speed
    // The eye rides the ground: 0 on the road, the kerb's height on the pavement, the plinth's inside a shop.
    const ax = Math.abs(rig.x)
    const ground = ax > LAYOUT.alley.x[1] ? SHOPS.floorY : ax > LAYOUT.kerb.innerEdgeX ? LAYOUT.kerb.height : 0
    rig.floor += (ground - rig.floor) * (reduced ? 1 : 1 - Math.exp(-WALK.damping * dt))
    let y = CAMERA.eyeHeight + rig.floor, ox = 0, oz = 0
    if (!reduced) {
      const before = bob.current
      bob.current += WALK.bob.frequency * rig.speed * dt
      if (Math.floor(bob.current) !== Math.floor(before)) footstep()
      y += Math.sin(bob.current * Math.PI * 2) * WALK.bob.amplitude * rig.speed
      // §14.1 — the entry sweep: a small offset of its own, added where the head bob lands.
      if (rig.sweepStart) {
        const k = (performance.now() - rig.sweepStart) / GATE.sweep.ms
        if (k >= 1) rig.sweepStart = 0
        else {
          const e = 1 - easeOutCubic(k)
          const yaw = deg(CAMERA.spawn.yawDeg)
          y += GATE.sweep.up * e
          ox = -Math.sin(yaw) * GATE.sweep.back * e
          oz = -Math.cos(yaw) * GATE.sweep.back * e
        }
      }
    }
    camera.position.set(rig.x + ox, y, rig.z + oz)
    camera.rotation.set(rig.pitch, yawToThree(rig.yaw), 0)
    // §12.1 — the FOV split follows the device in the visitor's hands; orientation is live.
    const fov = state.size.width >= state.size.height ? CAMERA.fov.landscape : CAMERA.fov.portrait
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix() }
  })
  return null
}
