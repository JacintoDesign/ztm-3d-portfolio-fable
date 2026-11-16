'use client'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { PALETTE, RAIN, RIPPLES as R, STEAM } from '@/lib/world'
import { STEAM_VENTS } from '@/lib/props'
import { pick, prefersReducedMotion } from '@/lib/tier'
import { seeded } from '@/lib/math'
import { rig } from '@/lib/rig'
import { groundTextures, puddleValueAt } from '@/lib/textures/ground'
import { paintPuff, paintStreak } from '@/lib/textures/painted'
import { rippleFragment, rippleVertex } from '@/shaders/ripple'
import { FLOOR_PLANE, UNIT_PLANE, noRaycast } from '../Instanced'

// §10.1 — the streak lies along its own velocity: atan(0.6 ÷ 9.0) off vertical.
const VLEN = Math.hypot(RAIN.windX, RAIN.fallSpeed)
const UPX = -RAIN.windX / VLEN
const UPY = RAIN.fallSpeed / VLEN

/** One rain layer: instanced quads, one shared yaw, matrices written by hand into a hoisted array. */
function RainLayer({ near }: { near: boolean }) {
  const L = near ? RAIN.near : RAIN.far
  const reduced = prefersReducedMotion()
  const count = Math.round(pick(L.count) * (reduced ? RAIN.reduced.countScale : 1))
  const opacity = reduced ? Math.min(RAIN.reduced.opacity, pick(L.opacity)) : pick(L.opacity)
  const ref = useRef<THREE.InstancedMesh>(null)
  const [bx, by, bz] = L.box
  // Area held at pointSize², aspect at 1 : 8.
  const width = L.pointSize / Math.sqrt(RAIN.aspect)
  const length = L.pointSize * Math.sqrt(RAIN.aspect)
  const pos = useMemo(() => {
    const rand = seeded(near ? 71 : 73)
    const p = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      p[i * 3] = (rand() - 0.5) * bx
      p[i * 3 + 1] = rand() * by
      p[i * 3 + 2] = (rand() - 0.5) * bz + (near ? rig.z : 0)
    }
    return p
  }, [count, near, bx, by, bz])
  const streak = useMemo(() => paintStreak(), [])

  useFrame((_, delta) => {
    const mesh = ref.current
    if (!mesh) return
    const dt = Math.min(delta, 0.05)
    const a = mesh.instanceMatrix.array as Float32Array
    const rx = -Math.cos(rig.yaw) * width, rz = Math.sin(rig.yaw) * width
    const cx = near ? rig.x : 0, cz = near ? rig.z : 0
    for (let i = 0; i < count; i++) {
      let x = pos[i * 3] + RAIN.windX * dt
      let y = pos[i * 3 + 1] - RAIN.fallSpeed * dt
      let z = pos[i * 3 + 2]
      // Recycling is per axis, not just downward, or the visitor walks out of their own rain.
      if (y < 0) y += by
      if (x - cx > bx / 2) x -= bx; else if (x - cx < -bx / 2) x += bx
      if (z - cz > bz / 2) z -= bz; else if (z - cz < -bz / 2) z += bz
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z
      const o = i * 16
      a[o] = rx; a[o + 1] = 0; a[o + 2] = rz; a[o + 3] = 0
      a[o + 4] = UPX * length; a[o + 5] = UPY * length; a[o + 6] = 0; a[o + 7] = 0
      a[o + 8] = 0; a[o + 9] = 0; a[o + 10] = 1; a[o + 11] = 0
      a[o + 12] = x; a[o + 13] = y; a[o + 14] = z; a[o + 15] = 1
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={ref} args={[UNIT_PLANE, undefined, count]} frustumCulled={false} raycast={noRaycast} renderOrder={5}>
      {/* Basic, alpha-blended, fogged, never additive. */}
      <meshBasicMaterial map={streak} color={PALETTE.rain} transparent opacity={opacity} depthWrite={false} side={THREE.DoubleSide} />
    </instancedMesh>
  )
}

/** §10.0 — rings land where §6.2 put the water: rejection-sampled against the painted mask itself. */
function Ripples() {
  const ref = useRef<THREE.InstancedMesh>(null)
  const emitters = useMemo(() => {
    groundTextures() // the mask must exist before it is read
    const rand = seeded(97)
    const out: { x: number; z: number; jitter: number }[] = []
    for (const region of R.regions) {
      const want = pick(region.count)
      const mine: typeof out = []
      for (let tries = 0; mine.length < want && tries < 6000; tries++) {
        const x = region.x[0] + rand() * (region.x[1] - region.x[0])
        const z = region.z[0] + rand() * (region.z[1] - region.z[0])
        if (puddleValueAt(x, z) > R.wetThreshold) continue
        if (mine.some((e) => Math.hypot(e.x - x, e.z - z) < R.minSeparation)) continue
        // Jitter is measured against this emitter's own puddle: the largest rung still wet on all eight probes.
        let jitter = 0
        for (const rung of R.jitterLadder) {
          let wet = true
          for (let k = 0; k < 8 && wet; k++) wet = puddleValueAt(x + Math.cos((k * Math.PI) / 4) * rung, z + Math.sin((k * Math.PI) / 4) * rung) <= R.wetThreshold
          if (wet) { jitter = rung; break }
        }
        mine.push({ x, z, jitter })
      }
      out.push(...mine)
    }
    return out
  }, [])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: rippleVertex,
        fragmentShader: rippleFragment,
        transparent: true,
        depthWrite: false,
        fog: true,
        uniforms: THREE.UniformsUtils.merge([
          THREE.UniformsLib.fog,
          {
            uTime: { value: 0 }, uInterval: { value: R.interval }, uLife: { value: R.life }, uPeak: { value: R.peakOpacity },
            uThickness: { value: R.thickness }, uRamp: { value: R.birthRamp }, uVariation: { value: R.sizeVariation }, uWobble: { value: R.wobble },
            uColor: { value: new THREE.Color(PALETTE.rain) },
          },
        ]),
      }),
    [],
  )
  const geometry = useMemo(() => {
    const g = FLOOR_PLANE.clone()
    const n = emitters.length
    const rand = seeded(131)
    const phase = new Float32Array(n), jitter = new Float32Array(n), seed = new Float32Array(n)
    emitters.forEach((e, i) => { phase[i] = rand(); jitter[i] = e.jitter / R.diameter; seed[i] = Math.floor(rand() * 512) })
    g.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1))
    g.setAttribute('aJitter', new THREE.InstancedBufferAttribute(jitter, 1))
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1))
    return g
  }, [emitters])

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const m = new THREE.Matrix4()
    emitters.forEach((e, i) => mesh.setMatrixAt(i, m.makeScale(R.diameter, 1, R.diameter).setPosition(e.x, R.y, e.z)))
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [emitters])

  // Uniforms update through the material, never through React state.
  useFrame((state) => { material.uniforms.uTime.value = state.clock.elapsedTime })

  return <instancedMesh ref={ref} args={[geometry, material, emitters.length]} raycast={noRaycast} renderOrder={4} />
}

const STEAM_LIFE = 6
function Steam() {
  const reduced = prefersReducedMotion()
  const vents = STEAM_VENTS.slice(0, pick(STEAM.vents))
  const per = pick(STEAM.sprites)
  const count = vents.length * per
  const ref = useRef<THREE.InstancedMesh>(null)
  const puff = useMemo(() => paintPuff(), [])
  const seeds = useMemo(() => {
    const rand = seeded(151)
    return Float32Array.from({ length: count * 3 }, () => rand())
  }, [count])

  useFrame((state) => {
    const mesh = ref.current
    if (!mesh) return
    const a = mesh.instanceMatrix.array as Float32Array
    const t = reduced ? 0 : state.clock.elapsedTime // §13 — static
    const cos = -Math.cos(rig.yaw), sin = Math.sin(rig.yaw)
    for (let i = 0; i < count; i++) {
      const v = vents[Math.floor(i / per)]
      const age = (t / STEAM_LIFE + seeds[i * 3]) % 1
      const size = 0.35 + age * 1.3
      const o = i * 16
      a[o] = cos * size; a[o + 1] = 0; a[o + 2] = sin * size; a[o + 3] = 0
      a[o + 4] = 0; a[o + 5] = size; a[o + 6] = 0; a[o + 7] = 0
      a[o + 8] = 0; a[o + 9] = 0; a[o + 10] = 1; a[o + 11] = 0
      a[o + 12] = v.x + (seeds[i * 3 + 1] - 0.5) * (0.3 + age * 0.9)
      a[o + 13] = 0.1 + age * STEAM_LIFE * STEAM.rise
      a[o + 14] = v.z + (seeds[i * 3 + 2] - 0.5) * (0.3 + age * 0.9)
      a[o + 15] = 1
    }
    mesh.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={ref} args={[UNIT_PLANE, undefined, count]} frustumCulled={false} raycast={noRaycast} renderOrder={5}>
      <meshBasicMaterial map={puff} color={PALETTE.rain} transparent opacity={reduced ? STEAM.reducedOpacity : STEAM.opacity} depthWrite={false} side={THREE.DoubleSide} />
    </instancedMesh>
  )
}

/** §10 — rain that is thinning, not pouring; rings on the water; steam off the grates. */
export function Weather() {
  const reduced = prefersReducedMotion()
  return (
    <>
      <RainLayer near />
      <RainLayer near={false} />
      {/* §13 — the rings come off entirely: a frozen ring is a bullseye painted on the road. */}
      {!reduced && <Ripples />}
      <Steam />
    </>
  )
}
