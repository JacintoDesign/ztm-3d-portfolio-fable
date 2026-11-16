'use client'
import { Suspense, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { EMISSIVE, PALETTE, STREET as S, type Token } from '@/lib/world'
import { deg } from '@/lib/math'
import { prefersReducedMotion } from '@/lib/tier'
import { prepareModel } from '@/lib/carModels'
import { rig } from '@/lib/rig'
import { tokenColor, type BoxInst } from '@/lib/geo'
import { paintBeam, paintBrand, paintPool } from '@/lib/textures/painted'
import { boardFragment, boardVertex } from '@/shaders/boards'
import { FLOOR_PLANE, Instanced, UNIT_BOX, UNIT_PLANE, noRaycast } from '../Instanced'
import { mats } from '../materials'

const FB = S.farBuilding
/** §4's ratio over twenty → 11 / 6 / 2 / 1: twenty is where blue rounds in. */
const BOARD_COLORS: Token[] = ['neonMagenta', 'sodium', 'neonPink', 'neonMagenta', 'lantern', 'neonPink', 'neonCyan', 'neonMagenta', 'sodium', 'neonPink', 'neonMagenta', 'lantern', 'neonPink', 'neonBlue', 'neonMagenta', 'sodiumDeep', 'neonPink', 'neonCyan', 'neonMagenta', 'lantern']

// ── traffic ────────────────────────────────────────────────────────────────
// Six cars, three per lane, on a 240 m loop. Uneven gaps, equal speed within a
// lane: the wrap point is a gap like any other and no car ever laps another.
const CARS = S.lanes.flatMap((lane, li) => {
  let offset = 0
  return lane.gaps.map((gap, i) => {
    const car = { lane: li, model: (i + li) % S.vehicles.length, offset, color: S.glow.underColors[li * 3 + i] }
    offset += gap
    return car
  })
})
const carX = new Float32Array(CARS.length)
const mtx = new THREE.Matrix4()

function place(mesh: THREE.InstancedMesh | null, i: number, x: number, y: number, z: number, dir: number, sx = 1, sy = 1, sz = 1) {
  if (!mesh) return
  // Rotation is the lane's heading only, so the 3 × 3 block is written by hand.
  mtx.set(dir * sx, 0, 0, x, 0, sy, 0, y, 0, 0, dir * sz, z, 0, 0, 0, 1)
  mesh.setMatrixAt(i, mtx)
}

function Traffic() {
  const gltfs = useGLTF(S.vehicles.map((v) => v.file), false)
  const reduced = prefersReducedMotion()
  const models = useMemo(() => gltfs.map((g, i) => prepareModel(g.scene.clone(true), S.vehicles[i].length, deg(S.yawOffsetDeg))), [gltfs])
  const tex = useMemo(() => ({ pool: paintPool(), beam: paintBeam() }), [])
  const partRefs = useRef<(THREE.InstancedMesh | null)[][]>(models.map(() => []))
  const head = useRef<THREE.InstancedMesh>(null), tail = useRef<THREE.InstancedMesh>(null)
  const under = useRef<THREE.InstancedMesh>(null), beam = useRef<THREE.InstancedMesh>(null), smear = useRef<THREE.InstancedMesh>(null)

  useLayoutEffect(() => {
    CARS.forEach((c, i) => under.current?.setColorAt(i, tokenColor(c.color)))
    if (under.current?.instanceColor) under.current.instanceColor.needsUpdate = true
  }, [])

  useFrame((state) => {
    const t = reduced || rig.holdTraffic ? 0 : state.clock.elapsedTime
    const seen = [0, 0, 0]
    for (let i = 0; i < CARS.length; i++) {
      const c = CARS[i], lane = S.lanes[c.lane], m = models[c.model]
      // §13 — under reduced motion the traffic holds still, one car per lane inside the sightline.
      let x = lane.hold + lane.dir * (t * lane.speed - c.offset)
      x = ((((x + S.track / 2) % S.track) + S.track) % S.track) - S.track / 2
      carX[i] = x
      const n = seen[c.model]++
      const refs = partRefs.current[c.model]
      for (let p = 0; p < refs.length; p++) place(refs[p], n, x, 0, lane.z, lane.dir)
      const L = m.size.length / 2, W = m.size.width / 2 - 0.32, H = m.size.height
      const hs = S.lamps.head.size, ts = S.lamps.tail.size
      for (let k = 0; k < 2; k++) {
        const side = k ? 1 : -1
        place(head.current, i * 2 + k, x + lane.dir * (L + S.lamps.proud - hs[2] / 2), H * S.lamps.head.heightFrac, lane.z + side * W, lane.dir, hs[2], hs[1], hs[0])
        place(tail.current, i * 2 + k, x - lane.dir * (L + S.lamps.proud - ts[2] / 2), H * S.lamps.tail.heightFrac, lane.z + side * W, lane.dir, ts[2], ts[1], ts[0])
      }
      place(under.current, i, x, S.glow.under.y, lane.z, lane.dir, m.size.length * S.glow.under.lengthScale, 1, S.glow.under.width)
      place(beam.current, i, x + lane.dir * (L + S.glow.head.length / 2), S.glow.head.y, lane.z, lane.dir, S.glow.head.length, 1, S.glow.head.width)
      place(smear.current, i, x - lane.dir * (L + S.glow.tail.length / 2), S.glow.tail.y, lane.z, lane.dir, S.glow.tail.length, 1, S.glow.tail.width)
    }
    // Bounds are recomputed every frame: a correction, not an optimisation. Matrices written at x = 0 would cull a moving street.
    for (const refs of partRefs.current) for (const r of refs) if (r) { r.instanceMatrix.needsUpdate = true; r.computeBoundingSphere() }
    for (const r of [head.current, tail.current, under.current, beam.current, smear.current]) if (r) { r.instanceMatrix.needsUpdate = true; r.computeBoundingSphere() }
  })

  const glow = (map: THREE.Texture, opacity: number, color?: string) => (
    <meshBasicMaterial map={map} color={color ?? '#ffffff'} transparent opacity={opacity} depthWrite={false} />
  )
  return (
    <>
      {models.map((m, mi) =>
        m.parts.map((p, pi) => (
          <instancedMesh key={`${mi}-${pi}`} ref={(r) => { partRefs.current[mi][pi] = r }} args={[p.geometry, p.material, 2]} raycast={noRaycast} />
        )),
      )}
      {/* Alpha-blended, never additive: fog mixes toward fogColor before the blend. */}
      <instancedMesh ref={head} args={[UNIT_BOX, undefined, CARS.length * 2]} raycast={noRaycast}>
        <meshBasicMaterial color={tokenColor('signWhite', EMISSIVE.vehicleHeadlight)} />
      </instancedMesh>
      <instancedMesh ref={tail} args={[UNIT_BOX, undefined, CARS.length * 2]} raycast={noRaycast}>
        <meshBasicMaterial color={tokenColor('lantern', EMISSIVE.tailLamp)} />
      </instancedMesh>
      <instancedMesh ref={under} args={[FLOOR_PLANE, undefined, CARS.length]} raycast={noRaycast} renderOrder={3}>{glow(tex.pool, S.glow.under.opacity)}</instancedMesh>
      <instancedMesh ref={beam} args={[FLOOR_PLANE, undefined, CARS.length]} raycast={noRaycast} renderOrder={3}>{glow(tex.beam, S.glow.head.opacity, PALETTE.signWhite)}</instancedMesh>
      <instancedMesh ref={smear} args={[FLOOR_PLANE, undefined, CARS.length]} raycast={noRaycast} renderOrder={3}>{glow(tex.pool, S.glow.tail.opacity, PALETTE.lantern)}</instancedMesh>
    </>
  )
}

/** §3.6 — what the bend opens onto. Traffic is not company; nothing out here can be reached or clicked. */
export function CrossStreet() {
  const m = mats()
  const built = useMemo(() => {
    const boards: BoxInst[] = []
    const z = FB.z - FB.groundBandProud - S.boards.proud
    const stride = 2.7
    for (let i = 0, n = 0; n < S.boards.count; i++) {
      const x = -29 + i * stride
      if (Math.abs(x - S.brand.x) < S.brand.size[0] / 2 + 0.9) continue // the two boards the name replaced
      const [w, h] = S.boards.classes[n % 3]
      boards.push({ x, y: 0.5 + h / 2 + (n % 2) * 0.35, z, sx: w, sy: h, sz: 1, ry: Math.PI, color: tokenColor(BOARD_COLORS[n % BOARD_COLORS.length], S.boards.gain) })
      n++
    }
    const dashes: BoxInst[] = []
    const C = S.centreLine
    for (let x = FB.x[0]; x < FB.x[1]; x += C.dash + C.gap) dashes.push({ x: x + C.dash / 2, y: C.y, z: C.z, sx: C.dash, sy: 1, sz: C.width })
    // Per-board pattern, seed and size ride as instanced attributes on the boards' own plane.
    const boardGeo = UNIT_PLANE.clone()
    boardGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(Float32Array.from(boards, (_, i) => (i * 37) % 101), 1))
    boardGeo.setAttribute('aKind', new THREE.InstancedBufferAttribute(Float32Array.from(boards, (_, i) => (i * 3 + 1) % S.boards.kinds), 1))
    boardGeo.setAttribute('aSize', new THREE.InstancedBufferAttribute(Float32Array.from(boards.flatMap((b) => [b.sx, b.sy])), 2))
    const boardMat = new THREE.ShaderMaterial({
      vertexShader: boardVertex,
      fragmentShader: boardFragment,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uCell: { value: S.boards.cell }, uOff: { value: S.boards.off } }]),
    })
    return { boards, boardGeo, boardMat, dashes, brand: m.emissivePanel(paintBrand(), EMISSIVE.lightboxSign) }
  }, [m])
  // §13 — under reduced motion the signs hold one frame: lit, legible, still.
  const reduced = prefersReducedMotion()
  useFrame((state) => { if (!reduced) built.boardMat.uniforms.uTime.value = state.clock.elapsedTime })
  const B = S.brand
  return (
    <>
      <Instanced items={built.boards} geometry={built.boardGeo}><primitive object={built.boardMat} attach="material" /></Instanced>
      <Instanced items={built.dashes} geometry={FLOOR_PLANE}><meshBasicMaterial color={tokenColor('signWhite', S.centreLine.level)} /></Instanced>
      <mesh position={[B.x, B.y, FB.z - FB.groundBandProud - 0.06]} rotation-y={Math.PI} material={built.brand} raycast={noRaycast}>
        <planeGeometry args={[B.size[0], B.size[1]]} />
      </mesh>
      <mesh position={[B.x, B.y, FB.z - FB.groundBandProud - 0.03]} raycast={noRaycast}>
        <boxGeometry args={[B.size[0] + 0.12, B.size[1] + 0.12, 0.05]} />
        <meshStandardMaterial color={PALETTE.void} />
      </mesh>
      {/* The one thing §3.6 is allowed to be is late: the cars suspend alone. */}
      <Suspense fallback={null}><Traffic /></Suspense>
    </>
  )
}
S.vehicles.forEach((v) => useGLTF.preload(v.file, false))
