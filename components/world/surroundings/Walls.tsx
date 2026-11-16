'use client'
import { useMemo } from 'react'
import * as THREE from 'three'
import { BEND, EMISSIVE, GATE_WALL, LAYOUT, MATERIALS, PALETTE, STOREFRONT, STREET, UPPER } from '@/lib/world'
import { deg, yawToThree } from '@/lib/math'
import { UNITS } from '@/lib/storefronts'
import { faceInward, quadsGeometry, tokenColor, type BoxInst, type Quad } from '@/lib/geo'
import { buildAtlas, toTexture } from '@/lib/textures/canvas'
import { noticeCell, paintBay, plateCell } from '@/lib/textures/painted'
import { Instanced, UNIT_CYL, noRaycast } from '../Instanced'
import { mats } from '../materials'

const A = LAYOUT.alley
const T = LAYOUT.wallThickness
const FB = STREET.farBuilding

/** §3.3 — piers and spandrels standing proud of a bay panel: the recess is geometry. */
function bayFrame(out: BoxInst[], floors: number, place: (along: number, y: number, proud: number, w: number, h: number, d: number) => BoxInst) {
  const h = floors * UPPER.floorHeight
  const perFloor = Math.round(UPPER.bay.width / UPPER.windowPitch)
  for (let i = 0; i <= perFloor; i++) {
    const edge = i === 0 || i === perFloor
    const w = edge ? UPPER.pier.width / 2 : UPPER.pier.width
    const along = -UPPER.bay.width / 2 + i * UPPER.windowPitch + (i === 0 ? w / 2 : i === perFloor ? -w / 2 : 0)
    out.push(place(along, UPPER.bandBase + h / 2, UPPER.pier.depth / 2, w, h, UPPER.pier.depth))
  }
  const head = UPPER.sill + UPPER.window[1]
  for (let f = 0; f <= floors; f++) {
    const y0 = f === 0 ? 0 : (f - 1) * UPPER.floorHeight + head
    const y1 = f === floors ? h : f * UPPER.floorHeight + UPPER.sill
    out.push(place(0, UPPER.bandBase + (y0 + y1) / 2, UPPER.spandrel.depth / 2, UPPER.bay.width, y1 - y0, UPPER.spandrel.depth))
  }
}

/** §3.1 / §3.3 — the two facades, both ends, the station gate, and the window bays. */
export function Walls() {
  const m = mats()
  const built = useMemo(() => {
    const facade = tokenColor('facade'), warm = tokenColor('facadeWarm'), shutterC = tokenColor('shutter')
    const boxes: BoxInst[] = []
    const [wz0, wz1] = LAYOUT.facadeZ.west, [ez0, ez1] = LAYOUT.facadeZ.east
    const hw = LAYOUT.facadeHeight.west, he = LAYOUT.facadeHeight.east
    const run = (from: number, to: number, piece: (centre: number, length: number) => BoxInst) => {
      const n = Math.ceil((to - from) / UPPER.bay.width)
      const len = (to - from) / n
      for (let i = 0; i < n; i++) boxes.push(piece(from + (i + 0.5) * len, len))
    }
    // §3.8 — a side wall is solid above the storefront band and, below it, everywhere except
    // behind an open unit's aperture: the hole is what lets a room stand behind the shutter.
    const band = STOREFRONT.bandTop, head = STOREFRONT.aperture.y[1]
    const side = (sx: number, z0: number, z1: number, h: number, color: THREE.Color) => {
      const x = sx * (A.x[1] + T / 2)
      boxes.push({ x, y: (band + h) / 2, z: (z0 + z1) / 2, sx: T, sy: h - band, sz: z1 - z0, color })
      const holes = UNITS.filter((u) => u.side === sx && u.state === 'open').sort((p, q) => p.z - q.z)
      let from = z0
      for (const u of holes) {
        const a = u.apertureZ - u.apertureWidth / 2, b = u.apertureZ + u.apertureWidth / 2
        boxes.push({ x, y: band / 2, z: (from + a) / 2, sx: T, sy: band, sz: a - from, color })
        boxes.push({ x, y: (head + band) / 2, z: (a + b) / 2, sx: T, sy: band - head, sz: b - a, color })
        from = b
      }
      boxes.push({ x, y: band / 2, z: (from + z1) / 2, sx: T, sy: band, sz: z1 - from, color })
    }
    side(-1, wz0, wz1, hw, warm)
    side(1, ez0, ez1, he, facade)
    boxes.push({ x: 0, y: LAYOUT.endWallHeight / 2, z: LAYOUT.ends.north.z - T / 2, sx: A.width + 2 * T, sy: LAYOUT.endWallHeight, sz: T, color: facade })
    boxes.push({ x: BEND.boxCentre.x, y: LAYOUT.endWallHeight / 2, z: BEND.boxCentre.z, sx: LAYOUT.ends.south.returnLength, sy: LAYOUT.endWallHeight, sz: T, ry: yawToThree(deg(BEND.yawDeg)), color: facade })
    // §3.6 — the far building closes the horizon.
    run(FB.x[0], FB.x[1], (x, len) => ({ x, y: FB.height / 2, z: FB.z + FB.thickness / 2, sx: len, sy: FB.height, sz: FB.thickness, color: facade }))
    run(FB.x[0], FB.x[1], (x, len) => ({ x, y: UPPER.bandBase / 2, z: FB.z - FB.groundBandProud / 2, sx: len, sy: UPPER.bandBase, sz: FB.groundBandProud, color: shutterC }))

    // Window bays: three variants cycling A B C, one texture set for every wall.
    const quads: Quad[][] = [[], [], []]
    const bayCount = Math.round((wz1 - 1 - wz0) / UPPER.bay.width)
    for (const side of [-1, 1] as const) {
      const floors = Math.floor(((side === -1 ? hw : he) - UPPER.bandBase) / UPPER.floorHeight)
      const h = floors * UPPER.floorHeight
      for (let b = 0; b < bayCount; b++) {
        const z = wz0 + (b + 0.5) * UPPER.bay.width
        quads[b % 3].push({ x: side * (A.x[1] - UPPER.panelOffset), y: UPPER.bandBase + h / 2, z, w: UPPER.bay.width, h, ry: faceInward(side), rect: { u0: 0, u1: 1, v0: 0, v1: floors / 3 } })
        bayFrame(boxes, floors, (along, y, proud, w, hh, d) => ({ x: side * (A.x[1] - proud), y, z: z + along, sx: d, sy: hh, sz: w, color: facade }))
      }
    }
    for (let b = 0; b < FB.bays; b++) {
      const x = FB.x[0] + (b + 0.5) * UPPER.bay.width
      quads[b % 3].push({ x, y: UPPER.bandBase + UPPER.bay.height / 2, z: FB.z - UPPER.panelOffset, w: UPPER.bay.width, h: UPPER.bay.height, ry: Math.PI })
    }
    const bays = quads.map((qs, i) => {
      const tex = paintBay(i)
      return { geometry: quadsGeometry(qs), material: new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: EMISSIVE.window, roughness: MATERIALS.facade.roughness, metalness: MATERIALS.facade.metalness }) }
    })

    // §3.1 — the gate: slats at §3.4's own pitch, the drum they wind onto, the plate and the notice.
    const S = STOREFRONT.slat
    const gz = LAYOUT.ends.north.z
    const count = Math.floor(GATE_WALL.shutter.height / S.pitch)
    const slats: BoxInst[] = Array.from({ length: count }, (_, i) => ({ x: 0, y: (i + 0.5) * S.pitch, z: gz + S.depth / 2 + 0.01, sx: GATE_WALL.shutter.width, sy: S.pitch * S.heightFrac, sz: S.depth }))
    const roll: BoxInst[] = [{ x: 0, y: GATE_WALL.roll.y, z: gz + STOREFRONT.roll.radius, sx: STOREFRONT.roll.radius, sy: GATE_WALL.shutter.width, sz: STOREFRONT.roll.radius, rz: Math.PI / 2 }]
    const atlas = buildAtlas([plateCell(), noticeCell()])
    const P = GATE_WALL.plate, N = GATE_WALL.notice
    const plateZ = gz + P.thickness
    const signs = quadsGeometry([
      { x: 0, y: P.y, z: plateZ + 0.002, w: P.size[0], h: P.size[1], rect: atlas.rects[0] },
      { x: 0, y: N.y, z: gz + S.depth + 0.01 + N.proud, w: N.size[0], h: N.size[1], rect: atlas.rects[1] },
    ])
    const plateBox: BoxInst[] = [
      { x: 0, y: P.y, z: gz + P.thickness / 2, sx: P.size[0] + 0.08, sy: P.size[1] + 0.08, sz: P.thickness, color: tokenColor('void') },
      { x: 0, y: N.y, z: gz + S.depth + 0.01 + N.proud / 2, sx: N.size[0] + 0.05, sy: N.size[1] + 0.05, sz: N.proud - 0.004, color: tokenColor('metalDark') },
    ]
    return { boxes: [...boxes, ...plateBox], bays, slats, roll, signs, signMat: m.emissivePanel(toTexture(atlas.canvas), EMISSIVE.stationPlate) }
  }, [m])

  return (
    <>
      <Instanced items={built.boxes}><primitive object={m.facade} attach="material" /></Instanced>
      {built.bays.map((b, i) => (
        <mesh key={i} geometry={b.geometry} material={b.material} raycast={noRaycast} />
      ))}
      <Instanced items={built.slats}><primitive object={m.shutter} attach="material" /></Instanced>
      <Instanced items={built.roll} geometry={UNIT_CYL}><meshStandardMaterial color={PALETTE.metalDark} {...MATERIALS.paintedMetal} /></Instanced>
      <mesh geometry={built.signs} material={built.signMat} raycast={noRaycast} />
    </>
  )
}
