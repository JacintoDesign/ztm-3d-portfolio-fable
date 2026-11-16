'use client'
import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { EMISSIVE, FLICKER, LAYOUT, MATERIALS, NEON_SIGNS as N, OVERHEAD as O, PALETTE, PROPS, SIGNAGE } from '@/lib/world'
import { SIGNS, offWall, signCentre } from '@/lib/storefronts'
import { CART_LANTERN, LANTERNS } from '@/lib/props'
import { seeded } from '@/lib/math'
import { prefersReducedMotion } from '@/lib/tier'
import { MeshBuilder, quadsGeometry, type BoxInst, type Quad } from '@/lib/geo'
import { buildAtlas, toTexture } from '@/lib/textures/canvas'
import { bannerCell, paintLantern, signCell } from '@/lib/textures/painted'
import { Instanced, UNIT_CYL, noRaycast } from '../Instanced'
import { mats } from '../materials'

const PERIOD = FLICKER.sequence.length * FLICKER.stepMs + FLICKER.holdMs
/** §11.3 — a tube failing to strike: a fixed sequence, then a long steady hold. Never random. */
export function flickerAt(ms: number, offset: number) {
  const t = (ms + offset * PERIOD) % PERIOD
  const step = Math.floor(t / FLICKER.stepMs)
  return step < FLICKER.sequence.length ? FLICKER.sequence[step] : 1
}

/** §3.5 / §3.7 — nine projecting neon signs, the overhead mat of cable, three banners, eleven paper lanterns. */
export function Signs() {
  const m = mats()
  const reduced = prefersReducedMotion()
  const built = useMemo(() => {
    const metal = new MeshBuilder(), tubes = new MeshBuilder(), panels = new MeshBuilder()
    const signAtlas = buildAtlas(SIGNS.map((s) => signCell(s.string, PALETTE[s.color], s.vertical)))
    const signTex = toTexture(signAtlas.canvas)
    const steady: Quad[] = []
    const flickering: { geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial; base: number; offset: number }[] = []
    const half = N.thickness / 2

    SIGNS.forEach((s, i) => {
      const c = signCentre(s)
      panels.box(s.width, s.height, N.thickness, c.x, c.y, c.z, 'void')
      const quads: Quad[] = [0, Math.PI].map((ry) => ({ x: c.x, y: c.y, z: c.z + (ry ? -1 : 1) * (half + 0.002), w: s.width - 0.03, h: s.height - 0.03, ry, rect: signAtlas.rects[i] }))
      if (s.flicker) {
        flickering.push({ geometry: quadsGeometry(quads), material: m.emissivePanel(signTex, EMISSIVE.verticalSign), base: EMISSIVE.verticalSign, offset: i === 3 ? FLICKER.offsets.sign3 : FLICKER.offsets.sign7 })
      } else steady.push(...quads)
      // The tube rim, 0.03 proud all round, at full colour.
      const r = N.rim, d = N.thickness + r
      for (const e of [-1, 1]) {
        tubes.box(s.width + 2 * r, r, d, c.x, c.y + e * (s.height / 2 + r / 2), c.z, PALETTE[s.color], 0, 0, 0, m.tubeGain)
        tubes.box(r, s.height, d, c.x + e * (s.width / 2 + r / 2), c.y, c.z, PALETTE[s.color], 0, 0, 0, m.tubeGain)
      }
      // Two brackets on a vertical sign, one on a horizontal: the load is different.
      const ys = s.vertical ? [c.y - N.bracket.verticalOffset, c.y + N.bracket.verticalOffset] : [c.y]
      for (const y of ys) metal.box(s.projection, N.bracket.size, N.bracket.size, offWall(s.side, s.projection / 2), y, c.z, 'metalDark')
    })

    // Overhead: spans wall to wall, most crossing at an angle, each three straight segments of a catenary.
    const rand = seeded(5)
    const [ax0, ax1] = LAYOUT.alley.x
    const span = (z0: number, z1: number, y0: number, y1: number, sag: number) => {
      let px: number = ax0, py = y0, pz = z0
      for (let k = 1; k <= O.segments; k++) {
        const t = k / O.segments
        const x = ax0 + (ax1 - ax0) * t, z = z0 + (z1 - z0) * t, y = y0 + (y1 - y0) * t - sag * 4 * t * (1 - t)
        metal.beam(O.radius, px, py, pz, x, y, z, 'metalDark', 5)
        px = x; py = y; pz = z
      }
    }
    const [az0, az1] = LAYOUT.alley.z
    for (let i = 0; i < O.spans - O.banner.z.length; i++) {
      const z = az0 + 1 + ((az1 - az0 - 2) * (i + rand() * 0.8)) / (O.spans - O.banner.z.length)
      const y = () => O.y[0] + rand() * (O.y[1] - O.y[0])
      span(z, z + (rand() - 0.5) * 7, y(), y(), O.sag[0] + rand() * (O.sag[1] - O.sag[0]))
    }
    // Three banner wires, each hanging a cloth 0.50 beneath it. Backlit: the ground keeps a sixteenth of its colour.
    const bannerColors = [PALETTE.lantern, PALETTE.neonPink, PALETTE.sodium]
    const bannerAtlas = buildAtlas(O.banner.strings.map((idx, i) => bannerCell(SIGNAGE[idx], bannerColors[i], O.banner.groundFraction)))
    const bannerTex = toTexture(bannerAtlas.canvas)
    const offsets = [FLICKER.offsets.banner9, FLICKER.offsets.banner10, FLICKER.offsets.banner11]
    O.banner.z.forEach((z, i) => {
      const wireY = O.y[0] + 0.5 + i * 0.25, sag = O.sag[0]
      span(z, z, wireY, wireY, sag)
      const [w, h] = O.banner.size
      const y = wireY - sag * 0.9 - O.banner.drop - h / 2
      for (const e of [-1, 1]) metal.beam(0.008, e * w * 0.45, y + h / 2, z, e * w * 0.45, wireY - sag * 0.75, z, 'metalDark', 4)
      const quads: Quad[] = [0, Math.PI].map((ry) => ({ x: 0, y, z: z + (ry ? -0.004 : 0.004), w, h, ry, rect: bannerAtlas.rects[i] }))
      flickering.push({ geometry: quadsGeometry(quads), material: m.emissivePanel(bannerTex, EMISSIVE.banner), base: EMISSIVE.banner, offset: offsets[i] })
    })

    // Lanterns: a painted paper shade on a bracket arm.
    const L = PROPS.lantern
    // Each is bolted to what is actually there — the fascia, or the bare wall in a joint — on a
    // plate, an arm and a hook, and the shade is capped top and bottom.
    const cap = (x: number, y: number, z: number) => {
      for (const e of [-1, 1]) metal.cyl(L.r * 0.62, L.r * 0.62, 0.035, x, y + e * (L.height / 2 + 0.012), z, 'void', 0, 0, 0, 12)
    }
    const shades: BoxInst[] = LANTERNS.map((l) => {
      const x = offWall(l.side, l.base + L.arm), y = L.armY - 0.1 - L.height / 2
      metal.box(0.02, 0.14, 0.09, offWall(l.side, l.base + 0.01), L.armY - 0.02, l.z, 'metalDark')
      metal.box(L.arm + 0.03, 0.03, 0.03, offWall(l.side, l.base + (L.arm + 0.03) / 2), L.armY, l.z, 'metalDark')
      metal.beam(0.008, offWall(l.side, l.base + 0.02), L.armY - 0.08, l.z, offWall(l.side, l.base + L.arm * 0.7), L.armY - 0.012, l.z, 'metalDark', 4)
      metal.box(0.012, 0.07, 0.012, x, L.armY - 0.045, l.z, 'metalDark')
      cap(x, y, l.z)
      return { x, y, z: l.z, sx: L.r, sy: L.height, sz: L.r }
    })
    // And one smaller, hung off the cart's canopy by a cord.
    const k = 0.7
    metal.box(0.008, 0.2, 0.008, CART_LANTERN.x, CART_LANTERN.y + (L.height * k) / 2 + 0.1, CART_LANTERN.z, 'void')
    for (const e of [-1, 1]) metal.cyl(L.r * k * 0.62, L.r * k * 0.62, 0.03, CART_LANTERN.x, CART_LANTERN.y + e * ((L.height * k) / 2 + 0.01), CART_LANTERN.z, 'void', 0, 0, 0, 12)
    shades.push({ x: CART_LANTERN.x, y: CART_LANTERN.y, z: CART_LANTERN.z, sx: L.r * k, sy: L.height * k, sz: L.r * k })
    const paper = paintLantern()
    return {
      metal: metal.build(), tubes: tubes.build(), panels: panels.build(),
      steady: quadsGeometry(steady), steadyMat: m.emissivePanel(signTex, EMISSIVE.verticalSign),
      flickering, shades,
      lanternMat: new THREE.MeshStandardMaterial({ ...MATERIALS.paperLantern, map: paper, emissiveMap: paper, emissive: '#ffffff', emissiveIntensity: EMISSIVE.lantern, side: THREE.DoubleSide }),
    }
  }, [m])

  useFrame((state) => {
    if (reduced) return // §13 — constant on
    const ms = state.clock.elapsedTime * 1000
    for (let i = 0; i < built.flickering.length; i++) {
      const f = built.flickering[i]
      f.material.emissiveIntensity = f.base * flickerAt(ms, f.offset)
    }
  })

  return (
    <>
      <mesh geometry={built.metal} material={m.metal} raycast={noRaycast} />
      <mesh geometry={built.panels} material={m.matte} raycast={noRaycast} />
      <mesh geometry={built.tubes} material={m.tube} raycast={noRaycast} />
      <mesh geometry={built.steady} material={built.steadyMat} raycast={noRaycast} />
      {built.flickering.map((f, i) => (
        <mesh key={i} geometry={f.geometry} material={f.material} raycast={noRaycast} />
      ))}
      <Instanced items={built.shades} geometry={UNIT_CYL}><primitive object={built.lanternMat} attach="material" /></Instanced>
    </>
  )
}
