'use client'
import { Suspense, useEffect, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { CART, EMISSIVE, MATERIALS, PALETTE, PROPS as P, STORE_LABELS } from '@/lib/world'
import { BARRIER, BINS, CART_X, CONES, CRATES, type Shade, KERB_TOP as K, POLES, SCOOTERS, STANDPIPES, STEAM_VENTS, VENDING, propBoxes, wallX } from '@/lib/props'
import { addBoxes } from '@/lib/collision'
import { foldParts, prepareModel } from '@/lib/carModels'
import { FaceBuilder, MeshBuilder, faceInward, tokenColor, type BoxInst } from '@/lib/geo'
import { buildAtlas, toTexture } from '@/lib/textures/canvas'
import { productCell } from '@/lib/textures/shops'
import { deg } from '@/lib/math'
import { paintPool } from '@/lib/textures/painted'
import { FLOOR_PLANE, Instanced, noRaycast } from '../Instanced'
import { mats } from '../materials'

/** §2.2 / §3.7 — the yatai: a barrow with a pair of wheels at one end and two legs at the other. */
function buildCart(matte: MeshBuilder, metal: MeshBuilder) {
  // Nothing here shares a plane with anything else: every board that sits on another
  // stands a centimetre or two proud of it. Coplanar faces are what flickers.
  const [len, depth] = P.cart.size
  const z = P.cart.z
  const front = CART_X.front // the footprint's front face
  const deckFront = front + 0.11 // the counter sits back under the overhanging canopy
  const deckBack = front + depth - 0.11
  const cx = (deckFront + deckBack) / 2
  const dW = deckBack - deckFront
  const top = K + 1.0
  const bodyLen = len - 0.2

  // The bar: a carcass, timber battens down its front and ends, a worktop with a raised lip.
  matte.box(dW, 0.56, bodyLen, cx, K + 0.7, z, 'lantern') // a yatai is painted, and this one is red
  for (let i = 0; i <= 10; i++) matte.box(0.02, 0.56, 0.035, deckFront - 0.005, K + 0.7, z - bodyLen / 2 + 0.04 + (i * (bodyLen - 0.08)) / 10, 'crateKraft')
  for (const e of [-1, 1]) for (let i = 0; i < 4; i++) matte.box(0.035, 0.56, 0.02, deckFront + 0.1 + i * 0.19, K + 0.7, z + e * (bodyLen / 2 + 0.005), 'crateKraft')
  // A skirt rail under the battens ties them together at the foot.
  matte.box(0.03, 0.04, bodyLen + 0.03, deckFront - 0.008, K + 0.4, z, 'crateTimber')
  matte.box(dW + 0.16, 0.04, len - 0.1, cx, top, z, 'crateKraft')
  matte.box(0.025, 0.03, len - 0.16, deckFront - 0.05, top + 0.035, z, 'crateTimber')
  // The lightbox the sign band sits in.
  matte.box(0.03, CART.signBand.size[1] + 0.05, CART.signBand.size[0] + 0.05, deckFront - CART.signBand.proud + 0.015, CART.signBand.y, z, 'void')

  // Undercarriage: chassis rails, a pair of timber wheels on one end, two legs on the other, and the shafts it is pushed by.
  const t = CART.wheelTrack / 2
  const wz = z + len / 2 - 0.4, lz = z - len / 2 + 0.3
  for (const e of [-1, 1]) {
    metal.box(0.05, 0.05, len - 0.3, cx + e * t, K + 0.4, z, 'metalDark')
    metal.cyl(0.24, 0.24, 0.05, cx + e * t, K + 0.24, wz, 'void', 0, 0, Math.PI / 2, 18)
    metal.cyl(0.19, 0.19, 0.07, cx + e * t, K + 0.24, wz, 'crateTimber', 0, 0, Math.PI / 2, 12)
    metal.cyl(0.06, 0.06, 0.12, cx + e * t, K + 0.24, wz, 'metalDark', 0, 0, Math.PI / 2, 8)
    // Spokes, proud of the wheel's face on the side that shows.
    for (let k = 0; k < 4; k++) metal.box(0.012, 0.36, 0.03, cx + e * (t + 0.04), K + 0.24, wz, 'crateKraft', 0, (k * Math.PI) / 4)
    metal.box(0.05, 0.4, 0.05, cx + e * t, K + 0.2, lz, 'metalDark')
    metal.box(0.12, 0.015, 0.12, cx + e * t, K + 0.008, lz, 'metalDark')
    metal.beam(0.022, cx + e * t, K + 0.78, z - len / 2 + 0.2, cx + e * t, K + 0.9, z - len / 2 - 0.42, 'crateTimber')
  }
  metal.beam(0.02, cx - t, K + 0.24, wz, cx + t, K + 0.24, wz, 'metalDark')
  metal.beam(0.015, cx - t, K + 0.3, lz, cx + t, K + 0.3, lz, 'metalDark')
  metal.beam(0.022, cx - t - 0.06, K + 0.9, z - len / 2 - 0.42, cx + t + 0.06, K + 0.9, z - len / 2 - 0.42, 'crateTimber')
  // What rides under the bar: a gas bottle with its hose, and a water bucket.
  metal.cyl(0.11, 0.11, 0.3, cx + 0.1, K + 0.2, z + 0.15, 'concrete', 0, 0, 0, 12)
  metal.cyl(0.04, 0.06, 0.05, cx + 0.1, K + 0.375, z + 0.15, 'metalDark', 0, 0, 0, 8)
  metal.cyl(0.12, 0.1, 0.2, cx - 0.12, K + 0.1, z - 0.3, 'metalDark', 0, 0, 0, 12)

  // Posts with knee braces, the canopy, its rafters and lamp housings, and fascia boards standing proud of its edges.
  const canopyY = CART.canopyPanels.y + 0.02
  const canopyTop = K + P.cart.size[2]
  for (const ex of [deckFront + 0.03, deckBack - 0.03]) for (const ez of [-1, 1]) {
    const pz = z + ez * (len / 2 - 0.13)
    metal.box(0.05, canopyY - top - 0.02, 0.05, ex, (top + 0.02 + canopyY) / 2, pz, 'metalDark')
    metal.box(0.1, 0.012, 0.1, ex, top + 0.026, pz, 'metalDark')
    metal.beam(0.012, ex, canopyY - 0.3, pz, ex, canopyY - 0.03, pz - ez * 0.28, 'metalDark')
  }
  matte.box(depth, canopyTop - canopyY, len, front + depth / 2, (canopyTop + canopyY) / 2, z, 'lantern')
  matte.box(depth + 0.06, 0.02, len + 0.06, front + depth / 2, canopyTop + 0.01, z, 'metalDark') // a tin cap, overhanging
  const P5 = CART.canopyPanels
  for (let i = 0; i < P5.count; i++) {
    const pz = z + (i - (P5.count - 1) / 2) * P5.pitch
    metal.box(P5.size[0] + 0.04, 0.02, P5.size[1] + 0.04, front + depth / 2, canopyY - 0.01, pz, 'metalDark')
    if (i) metal.box(depth - 0.1, 0.035, 0.03, front + depth / 2, canopyY - 0.018, pz - P5.pitch / 2, 'crateTimber') // rafters run between the lamps
  }
  matte.box(0.03, 0.18, len + 0.04, front - 0.005, canopyY + 0.05, z, 'crateTimber')
  for (const e of [-1, 1]) matte.box(depth, 0.18, 0.03, front + depth / 2, canopyY + 0.05, z + e * (len / 2 + 0.005), 'crateTimber')
  // Noren at the canopy's ends only — the middle is open where the customer stands.
  const [nw, nh] = CART.noren.size
  for (const off of [-0.92, -0.68, 0.68, 0.92]) matte.box(0.012, nh, nw, front - 0.005, canopyY - 0.045 - nh / 2, z + off, 'lantern')

  // The back board: a shelf of bottles and stacked bowls, and three timber menu tags.
  matte.box(0.04, 0.72, bodyLen, deckBack, top + 0.38, z, 'crateTimber')
  matte.box(0.14, 0.025, bodyLen - 0.3, deckBack - 0.09, top + 0.6, z, 'crateKraft')
  for (let i = 0; i < 5; i++) {
    metal.cyl(0.032, 0.035, 0.2, deckBack - 0.09, top + 0.713, z + 0.2 + i * 0.1, i % 2 ? 'concrete' : 'metalDark', 0, 0, 0, 8)
    metal.cyl(0.014, 0.02, 0.07, deckBack - 0.09, top + 0.848, z + 0.2 + i * 0.1, i % 2 ? 'concrete' : 'metalDark', 0, 0, 0, 6)
  }
  for (let j = 0; j < 3; j++) for (let s2 = 0; s2 < 4; s2++) matte.cyl(0.07, 0.045, 0.034, deckBack - 0.09, top + 0.63 + s2 * 0.022, z - 0.62 + j * 0.2, 'concrete')
  for (let i = 0; i < 3; i++) matte.box(0.02, 0.24, 0.11, deckBack - 0.035, top + 0.3, z - 0.42 + i * 0.2, 'crateKraft')

  // On the worktop: the stock pot with its lid and ladle, an urn, bowls, cups, chopsticks, sauces, a board and a knife.
  metal.cyl(0.17, 0.17, 0.26, cx + 0.1, top + 0.15, z + 0.58, 'metalDark', 0, 0, 0, 16)
  metal.cyl(0.175, 0.175, 0.015, cx + 0.1, top + 0.288, z + 0.58, 'concrete', 0, 0, 0, 16)
  metal.cyl(0.02, 0.025, 0.03, cx + 0.1, top + 0.31, z + 0.58, 'void', 0, 0, 0, 6)
  metal.beam(0.008, cx + 0.02, top + 0.29, z + 0.5, cx - 0.14, top + 0.44, z + 0.4, 'metalDark')
  metal.cyl(0.1, 0.11, 0.26, cx + 0.14, top + 0.15, z + 0.2, 'metalDark')
  metal.cyl(0.03, 0.03, 0.05, cx + 0.14, top + 0.3, z + 0.2, 'metalDark')
  for (const [bx, bz] of [[-0.14, -0.1], [-0.1, 0.12]]) matte.cyl(0.085, 0.05, 0.055, cx + bx, top + 0.048, z + bz, 'concrete')
  for (const [bx, bz] of [[0.1, -0.35], [0.16, -0.22]]) matte.cyl(0.035, 0.03, 0.08, cx + bx, top + 0.06, z + bz, 'concrete', 0, 0, 0, 8)
  matte.cyl(0.045, 0.04, 0.12, cx - 0.2, top + 0.08, z - 0.6, 'crateKraft', 0, 0, 0, 8)
  for (let i = 0; i < 4; i++) matte.box(0.008, 0.16, 0.008, cx - 0.2 + (i - 1.5) * 0.014, top + 0.17, z - 0.6 + (i % 2) * 0.012, 'crateTimber', 0, 0, (i - 1.5) * 0.08)
  for (let i = 0; i < 3; i++) {
    matte.cyl(0.02, 0.022, 0.1, cx - 0.2, top + 0.07, z - 0.42 + i * 0.06, i === 1 ? 'lantern' : 'crateTimber', 0, 0, 0, 8)
    matte.cyl(0.008, 0.012, 0.035, cx - 0.2, top + 0.137, z - 0.42 + i * 0.06, 'void', 0, 0, 0, 6)
  }
  // A second, smaller pot with its lid and two handles — plain steel, nothing wrapped round it — and a kettle;
  // a rail of ladles and a cloth under the canopy.
  metal.cyl(0.12, 0.12, 0.17, cx - 0.13, top + 0.105, z + 0.78, 'metalDark', 0, 0, 0, 18)
  metal.cyl(0.125, 0.125, 0.012, cx - 0.13, top + 0.196, z + 0.78, 'concrete', 0, 0, 0, 18)
  metal.cyl(0.018, 0.022, 0.025, cx - 0.13, top + 0.214, z + 0.78, 'void', 0, 0, 0, 6)
  for (const e of [-1, 1]) metal.box(0.03, 0.012, 0.05, cx - 0.13, top + 0.16, z + 0.78 + e * 0.14, 'metalDark')
  metal.cyl(0.07, 0.09, 0.12, cx - 0.14, top + 0.08, z + 0.36, 'concrete', 0, 0, 0, 12)
  metal.cyl(0.02, 0.02, 0.02, cx - 0.14, top + 0.15, z + 0.36, 'void', 0, 0, 0, 6)
  metal.beam(0.012, cx - 0.2, top + 0.1, z + 0.36, cx - 0.3, top + 0.15, z + 0.36, 'concrete', 5)
  metal.beam(0.008, deckBack - 0.2, canopyY - 0.12, z - 0.7, deckBack - 0.2, canopyY - 0.12, z + 0.1, 'metalDark', 5)
  for (let i = 0; i < 4; i++) {
    metal.box(0.008, 0.24, 0.008, deckBack - 0.2, canopyY - 0.25, z - 0.62 + i * 0.16, 'metalDark')
    metal.cyl(0.035, 0.02, 0.03, deckBack - 0.2, canopyY - 0.38, z - 0.62 + i * 0.16, 'metalDark', 0, 0, 0, 8)
  }
  matte.box(0.01, 0.26, 0.2, deckBack - 0.2, canopyY - 0.26, z + 0.02, 'concrete')
  // A stovepipe up through the canopy with a cap on it, and a rolled tarp lashed along the roof.
  metal.cyl(0.045, 0.045, 0.55, cx + 0.1, canopyTop + 0.2, z + 0.58, 'metalDark', 0, 0, 0, 10)
  metal.cyl(0.08, 0.03, 0.05, cx + 0.1, canopyTop + 0.5, z + 0.58, 'metalDark', 0, 0, 0, 10)
  matte.cyl(0.07, 0.07, len - 0.5, front + 0.16, canopyTop + 0.09, z - 0.1, 'shutter', Math.PI / 2, 0, 0, 10)
  for (const e of [-1, 1]) matte.cyl(0.075, 0.075, 0.02, front + 0.16, canopyTop + 0.09, z - 0.1 + e * (len / 2 - 0.5), 'crateKraft', Math.PI / 2, 0, 0, 10)
  // A foot rail along the front, drawers in the leg end, and the permit plate every stall carries.
  metal.beam(0.014, deckFront - 0.06, K + 0.22, z - bodyLen / 2 + 0.1, deckFront - 0.06, K + 0.22, z + bodyLen / 2 - 0.1, 'metalDark', 6)
  for (const e of [-1, 1]) metal.beam(0.01, deckFront - 0.06, K + 0.22, z + e * (bodyLen / 2 - 0.1), deckFront + 0.02, K + 0.44, z + e * (bodyLen / 2 - 0.1), 'metalDark', 5)
  for (let i = 0; i < 2; i++) {
    matte.box(dW - 0.2, 0.18, 0.02, cx, K + 0.56 + i * 0.22, z - bodyLen / 2 - 0.015, 'crateTimber')
    matte.cyl(0.014, 0.014, 0.03, cx, K + 0.56 + i * 0.22, z - bodyLen / 2 - 0.035, 'metalDark', Math.PI / 2, 0, 0, 8)
  }
  matte.box(0.008, 0.07, 0.12, deckFront - 0.02, K + 0.5, z + bodyLen / 2 - 0.16, 'signWhite')
  matte.box(0.2, 0.02, 0.3, cx + 0.12, top + 0.03, z - 0.72, 'crateTimber')
  metal.box(0.025, 0.004, 0.2, cx + 0.14, top + 0.044, z - 0.7, 'concrete', 0.3)
}

function Scooters() {
  const gltf = useGLTF(P.scooter.file, false)
  const built = useMemo(() => {
    const model = prepareModel(gltf.scene.clone(true), P.scooter.length, 0)
    // The model's five materials collapse onto §4: paint (with the chrome), tyres, frame — and the lens.
    const by = (names: string[]) => foldParts(model.parts.filter((p) => names.includes(p.name)))
    const lean = deg(P.scooter.leanDeg)
    const items: BoxInst[] = SCOOTERS.map((s) => ({ x: wallX(s.side, model.size.width + 0.1), y: K, z: s.z, sx: 1, sy: 1, sz: 1, ry: Math.PI / 2 + s.yaw, rx: (Math.cos(s.yaw) > 0 ? 1 : -1) * s.side * -lean }))
    return {
      items,
      parts: [
        { geometry: by(['Material.001', 'Material.005']), material: new THREE.MeshStandardMaterial({ color: PALETTE.scooterPaint, ...MATERIALS.paintedMetal }) },
        { geometry: by(['Material.002']), material: new THREE.MeshStandardMaterial({ color: PALETTE.void, ...MATERIALS.facade }) },
        { geometry: by(['Material.003']), material: new THREE.MeshStandardMaterial({ color: PALETTE.metalDark, ...MATERIALS.paintedMetal }) },
        { geometry: by(['Material.004']), material: new THREE.MeshBasicMaterial({ color: tokenColor('signWhite', EMISSIVE.scooterHeadlamp) }) },
      ],
    }
  }, [gltf])
  return (
    <>
      {built.parts.map((p, i) => (
        <Instanced key={i} items={built.items} geometry={p.geometry}><primitive object={p.material} attach="material" /></Instanced>
      ))}
    </>
  )
}
useGLTF.preload(P.scooter.file, false)

/** §3.7 — the band you walk through. Carries nothing; drawn by material, not by object. */
export function Props() {
  const m = mats()
  const built = useMemo(() => {
    const matte = new MeshBuilder(), metal = new MeshBuilder(), crate = new MeshBuilder()
    const decals: BoxInst[] = []
    const decal = (x: number, z: number, w: number, d: number, baseY: number) =>
      decals.push({ x, y: baseY + MATERIALS.contactDecal.lift, z, sx: w * MATERIALS.contactDecal.footprintScale, sy: 1, sz: d * MATERIALS.contactDecal.footprintScale })

    // Dead vending machines — unlit, and legible by albedo alone. A cabinet with a recessed display of
    // sample cans, a control column, a delivery bin and a kick plate; nothing on them shares a plane.
    const [vl, vd, vh] = P.vending.size
    const canArt = buildAtlas(STORE_LABELS.drinks.map((word, i) => productCell(word, PALETTE[(['neonCyan', 'sodium', 'lantern', 'phoneGreen', 'neonPink'] as const)[i % 5]])))
    const canLabels = new FaceBuilder()
    const CANS: Shade[] = ['scooterPaint', 'crateTimber', 'lantern', 'rain', 'crateKraft', 'concrete', 'sodiumDeep']
    VENDING.forEach((v, n) => {
      const x = wallX(v.side, vd), s = v.side
      /** World x of a point `p` metres proud of the cabinet's front face (negative: recessed). */
      const fx = (p: number) => x - s * (vd / 2 + p)
      const R = 0.09 // how deep the display is set back
      matte.box(vd - R, vh, vl, x + (s * R) / 2, K + vh / 2, v.z, 'metalDark')
      // The front frame: header, base, two stiles and the control column.
      const y0 = 0.62, y1 = vh - 0.2, col = 0.24, stile = 0.06
      const frame = (h: number, w: number, y: number, dz: number, c: Shade = 'shutter') => matte.box(R, h, w, fx(-R / 2), K + y, v.z + dz, c)
      frame(vh - y1, vl, (vh + y1) / 2, 0)
      frame(y0, vl, y0 / 2, 0)
      frame(y1 - y0, stile, (y0 + y1) / 2, -(vl / 2 - stile / 2))
      frame(y1 - y0, col, (y0 + y1) / 2, vl / 2 - col / 2)
      // The display: four shelves of sample cans, each over a strip of selection buttons.
      const dw = vl - stile - col, dc = -(vl / 2) + stile + dw / 2
      for (let r = 0; r < 4; r++) {
        const y = y0 + 0.04 + r * ((y1 - y0 - 0.06) / 4)
        matte.box(R - 0.02, 0.016, dw, fx(-R / 2 - 0.01), K + y, v.z + dc, 'shutter')
        matte.box(0.012, 0.035, dw, fx(-0.012), K + y - 0.022, v.z + dc, 'void')
        for (let c = 0; c < 6; c++) {
          const cz = v.z + dc - dw / 2 + (c + 0.5) * (dw / 6)
          matte.cyl(0.036, 0.036, 0.13, fx(-0.05), K + y + 0.073, cz, CANS[(r * 3 + c * 2 + n) % CANS.length], 0, 0, 0, 10)
          // Its label goes round it, the word turned to the street.
          canLabels.band(fx(-0.05), K + y + 0.07, cz, 0.039, 0.085, faceInward(s), canArt.rects[(r + c * 3 + n) % canArt.rects.length], STORE_LABELS.wrap, 6)
          matte.cyl(0.028, 0.036, 0.012, fx(-0.05), K + y + 0.144, cz, 'concrete', 0, 0, 0, 10)
          matte.box(0.008, 0.016, 0.03, fx(-0.002), K + y - 0.022, cz, 'concrete')
        }
      }
      // The control column: coin slot, selection keys, note acceptor, coin return, lock.
      const cz = v.z + vl / 2 - col / 2
      matte.box(0.012, 0.11, 0.09, fx(0.006), K + 1.3, cz, 'concrete')
      matte.box(0.008, 0.035, 0.008, fx(0.014), K + 1.31, cz, 'void')
      for (let i = 0; i < 3; i++) matte.box(0.014, 0.03, 0.045, fx(0.007), K + 1.48 + i * 0.05, cz, 'scooterPaint')
      matte.box(0.014, 0.022, 0.1, fx(0.007), K + 1.14, cz, 'void')
      matte.box(0.03, 0.07, 0.08, fx(0.015), K + 0.98, cz, 'void')
      matte.cyl(0.018, 0.018, 0.012, fx(0.006), K + 0.78, cz, 'concrete', 0, 0, Math.PI / 2, 8)
      // The delivery bin with its flap, a blank placard on the header, the kick plate, feet and a vent on top.
      matte.box(0.014, 0.24, dw, fx(0.007), K + 0.34, v.z + dc, 'void')
      matte.box(0.02, 0.17, dw - 0.06, fx(0.026), K + 0.36, v.z + dc, 'metalDark', 0, 0, s * 0.12)
      matte.box(0.012, 0.1, vl - 0.3, fx(0.006), K + vh - 0.1, v.z, 'concrete')
      matte.box(0.012, 0.07, vl - 0.08, fx(0.006), K + 0.06, v.z, 'void')
      for (const ex of [-1, 1]) for (const ez of [-1, 1]) matte.box(0.07, 0.03, 0.07, x + ex * (vd / 2 - 0.08), K + 0.006, v.z + ez * (vl / 2 - 0.08), 'void')
      matte.box(vd - 0.3, 0.025, vl - 0.3, x, K + vh + 0.0125, v.z, 'void')
      decal(x, v.z, vd, vl, K)
    })
    buildCart(matte, metal)
    decal(CART_X.centre, P.cart.z, P.cart.size[1], P.cart.size[0], K)

    const [cl, cd, ch] = P.crate.size
    for (const c of CRATES) {
      const x = wallX(c.side, 0.5)
      for (let i = 0; i < c.n; i++) crate.box(cd, ch, cl, x + ((i * 37) % 5 - 2) * 0.008, K + ch * (i + 0.5), c.z, P.crate.shades[(c.shade + i) % 4], c.turn * (i % 2 ? -1 : 1) + (i * 0.07))
      decal(x, c.z, cd, cl, K)
    }
    for (const c of CONES) {
      matte.box(P.cone.foot, 0.03, P.cone.foot, c.x, 0.015, c.z, 'void')
      matte.cyl(P.cone.topR, P.cone.baseR, P.cone.height, c.x, 0.03 + P.cone.height / 2, c.z, 'sodiumDeep', 0, 0, 0, 12)
      matte.cyl(0.09, 0.112, 0.1, c.x, 0.34, c.z, 'signWhite', 0, 0, 0, 12)
      decal(c.x, c.z, P.cone.foot, P.cone.foot, 0)
    }
    const B = P.barrier
    matte.box(0.03, B.board[1], B.board[0], BARRIER.x, (B.y[0] + B.y[1]) / 2, BARRIER.z, 'signWhite')
    for (let i = 0; i < 3; i++) matte.box(0.034, B.board[1], 0.16, BARRIER.x, (B.y[0] + B.y[1]) / 2, BARRIER.z - 0.4 + i * 0.4, 'sodiumDeep')
    const splay = Math.tan(deg(B.splayDeg)) * B.y[1]
    for (const e of [-1, 1]) for (const f of [-1, 1]) metal.beam(0.018, BARRIER.x, B.y[1], BARRIER.z + e * 0.5, BARRIER.x + f * splay, 0, BARRIER.z + e * 0.5, 'metalDark')
    decal(BARRIER.x, BARRIER.z, 0.3, B.board[0], 0)

    // Rubbish points: a ribbed galvanised bin with a domed lid and handles, a plastic bin with its lid
    // ajar, tied bags and flattened cardboard. Everything rests on the kerb top — nothing is sunk into it.
    for (const b of BINS) {
      const x = wallX(b.side, 0.64), B = P.bin
      const rb = B.r * B.taper // narrower at the foot
      metal.cyl(B.r, rb, B.height, x, K + B.height / 2, b.z, 'concrete', 0, 0, 0, 20)
      // The side is plain sheet: no hoops, ribs or rings round it.
      // The lid: a skirt, a shallow dome, and a strap handle.
      metal.cyl(B.lidR, B.lidR, 0.03, x, K + B.height + 0.015, b.z, 'metalDark', 0, 0, 0, 20)
      metal.cyl(B.lidR * 0.45, B.lidR - 0.01, 0.055, x, K + B.height + 0.057, b.z, 'concrete', 0, 0, 0, 20)
      for (const e of [-1, 1]) metal.box(0.012, 0.045, 0.012, x, K + B.height + 0.105, b.z + e * 0.05, 'metalDark')
      metal.box(0.014, 0.012, 0.115, x, K + B.height + 0.13, b.z, 'metalDark')
      for (const e of [-1, 1]) metal.box(0.09, 0.012, 0.02, x, K + B.height * 0.7, b.z + e * (B.r + 0.014), 'metalDark')
      // A square plastic bin beside it, lid shut.
      const pz = b.z + 0.52
      matte.box(0.4, 0.56, 0.36, x + b.side * 0.02, K + 0.28, pz, 'scooterPaint')
      matte.box(0.42, 0.03, 0.38, x + b.side * 0.02, K + 0.575, pz, 'metalDark')
      // Bags: tied at the neck, lumpy with what is in them, slumped where they were dropped.
      matte.bag(0.24, x - b.side * 0.05, K, b.z - 0.55, 'rain', 1.3 + b.z)
      matte.bag(0.2, x + b.side * 0.08, K, b.z - 0.92, 'void', 4.1 + b.z, -0.12 * b.side)
      matte.bag(0.17, x - b.side * 0.3, K, b.z - 0.9, 'concrete', 2.6 + b.z, 0.1 * b.side)
      matte.bag(0.19, x - b.side * 0.28, K, b.z + 0.92, 'rain', 5.7 + b.z)
      // Flattened boxes leaning on the wall behind.
      for (let i = 0; i < 2; i++) matte.box(0.03, 0.62 - i * 0.1, 0.5, wallX(b.side, 0.06) + b.side * 0.03 - b.side * i * 0.045, K + (0.62 - i * 0.1) / 2 + 0.012, b.z - 0.62 + i * 0.07, i ? 'crateTimber' : 'crateKraft', 0, 0, b.side * 0.1)
      decal(x, b.z - 0.1, 0.8, 2.3, K)
    }
    const SP = P.standpipe
    for (const s of STANDPIPES) {
      const x = s.side * SP.x
      metal.cyl(SP.r, SP.r, s.top - SP.baseY, x, (s.top + SP.baseY) / 2, s.z, 'metalDark', 0, 0, 0, 8)
      for (const cy of [0.9, s.top - 0.5]) metal.box(0.16, 0.04, 0.15, x + s.side * 0.03, cy, s.z, 'metalDark')
    }
    for (const p of POLES) {
      const x = p.side * P.pole.x
      matte.cyl(P.pole.r * 0.85, P.pole.r, P.pole.height, x, P.pole.height / 2, p.z, 'concrete', 0, 0, 0, 12)
      for (const y of P.pole.crossarms) metal.box(0.09, 0.09, 1.7, x, y, p.z, 'metalDark')
      decal(x, p.z, 0.3, 0.3, K)
    }
    // The mouth guardrail: a visible reason for a stop that already happens. Rails, not a panel.
    const G = P.guardrail
    for (let i = 0; i < G.posts; i++) metal.box(G.post, G.height, G.post, G.x[0] + ((G.x[1] - G.x[0]) * i) / (G.posts - 1), G.height / 2, G.z, 'metalDark')
    for (const y of G.rails) metal.beam(0.028, G.x[0], y, G.z, G.x[1], y, G.z, 'metalDark')
    for (const v of STEAM_VENTS) {
      matte.box(0.62, 0.012, 0.42, v.x, 0.012, v.z, 'void')
      for (let i = 0; i < 6; i++) metal.box(0.6, 0.014, 0.022, v.x, 0.02, v.z - 0.18 + i * 0.072, 'metalDark')
    }
    const pool = paintPool()
    return {
      matte: matte.build(), metal: metal.build(), crate: crate.build(), decals,
      canLabels: canLabels.build(1),
      canLabelMat: new THREE.MeshStandardMaterial({ map: toTexture(canArt.canvas), roughness: MATERIALS.shutter.roughness, metalness: 0 }),
      decalMat: new THREE.MeshBasicMaterial({ color: MATERIALS.contactDecal.color, map: pool, transparent: true, opacity: MATERIALS.contactDecal.opacity, depthWrite: false }),
    }
  }, [])

  useEffect(() => addBoxes(propBoxes()), [])

  return (
    <>
      <mesh geometry={built.matte} material={m.matte} raycast={noRaycast} />
      <mesh geometry={built.metal} material={m.metal} raycast={noRaycast} />
      <mesh geometry={built.crate} material={m.crate} raycast={noRaycast} />
      <mesh geometry={built.canLabels} material={built.canLabelMat} raycast={noRaycast} />
      <Instanced items={built.decals} geometry={FLOOR_PLANE} renderOrder={2}><primitive object={built.decalMat} attach="material" /></Instanced>
      <Suspense fallback={null}><Scooters /></Suspense>
    </>
  )
}
