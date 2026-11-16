'use client'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { DOORWAY_SURROUND, EMISSIVE, LAYOUT, MATERIALS, PALETTE, STOREFRONT as S } from '@/lib/world'
import { UNITS, offWall } from '@/lib/storefronts'
import { addBoxes, type Box } from '@/lib/collision'
import { faceInward, quadsGeometry, tokenColor, type BoxInst, type Quad } from '@/lib/geo'
import { buildAtlas, toTexture } from '@/lib/textures/canvas'
import { signBoxCell } from '@/lib/textures/painted'
import { Instanced, UNIT_CYL, noRaycast } from '../Instanced'
import { mats } from '../materials'

const K = LAYOUT.kerb.height
const BASE = K + S.plinth.height // every unit stands on the plinth, which stands on the kerb

/** §3.4 — fourteen shuttered storefronts, generated; boxes and cylinders, instanced by material. */
export function Storefronts() {
  const m = mats()
  const built = useMemo(() => {
    const c = { concrete: tokenColor('concrete'), facade: tokenColor('facade'), warm: tokenColor('facadeWarm'), metal: tokenColor('metalDark'), void: tokenColor('void'), shutter: tokenColor('shutter') }
    const boxes: BoxInst[] = [], slats: BoxInst[] = [], cyls: BoxInst[] = []
    const faces: Quad[] = [], spills: Quad[] = [], cells = []
    const solid: Box[] = []
    const P = S.frameProud
    for (const u of UNITS) {
      const s = u.side
      /** A box `d` deep standing on the wall, `w` along the alley. */
      const onWall = (z: number, y0: number, y1: number, w: number, d: number, color: THREE.Color, back = 0): BoxInst => ({ x: offWall(s, back + d / 2), y: (y0 + y1) / 2, z, sx: d, sy: y1 - y0, sz: w, color })
      const usable = u.width - 2 * S.pierWidth
      boxes.push(onWall(u.z, K, BASE, u.width, S.plinth.lip + P, c.concrete))
      for (const e of [-1, 1]) boxes.push(onWall(u.z + e * (u.width / 2 - S.pierWidth / 2), BASE, S.fasciaY[0], S.pierWidth, P, c.concrete))
      boxes.push(onWall(u.z, S.fasciaY[0], S.fasciaY[1], u.width, P, s === -1 ? c.warm : c.facade))
      // The doorway is placed by what it occupies — panel, both jambs, lintel — ending flush on the pier.
      const D = S.doorway
      const top = BASE + D.height
      boxes.push(onWall(u.doorwayZ, BASE, top, D.width, 0.02, c.void))
      for (const e of [-1, 1]) boxes.push(onWall(u.doorwayZ + e * (D.width / 2 + D.jamb / 2), BASE, top, D.jamb, D.proud, c.metal))
      boxes.push(onWall(u.doorwayZ, top, top + D.jamb, DOORWAY_SURROUND, D.proud, c.metal))
      boxes.push(onWall(u.doorwayZ, top + D.jamb, S.fasciaY[0], DOORWAY_SURROUND, 0.06, c.shutter))
      boxes.push(onWall(u.z + u.doorSide * (usable / 2 - DOORWAY_SURROUND - D.gap / 2), BASE, S.fasciaY[0], D.gap, P, c.concrete))
      // Shutter: slats at a constant 0.09 pitch, and the drum that grows with what is wound onto it.
      // Ajar leaves 0.62 under the curtain; open winds the whole of it onto the drum.
      const open = u.state === 'ajar' ? S.ajar.opening : u.state === 'open' ? S.aperture.y[1] - BASE : 0
      const n = Math.floor((S.aperture.y[1] - BASE - open) / S.slat.pitch)
      for (let i = 0; i < n; i++) {
        slats.push({ x: offWall(s, 0.02 + S.slat.depth / 2), y: BASE + open + (i + 0.5) * S.slat.pitch, z: u.apertureZ, sx: S.slat.depth, sy: S.slat.pitch * S.slat.heightFrac, sz: u.apertureWidth })
      }
      const r = Math.sqrt(S.roll.radius ** 2 + (open * S.slat.depth) / Math.PI)
      cyls.push({ x: offWall(s, r + 0.02), y: S.aperture.y[1] - r, z: u.apertureZ, sx: r, sy: u.apertureWidth, sz: r, rx: Math.PI / 2 })
      if (u.state === 'ajar') {
        boxes.push(onWall(u.apertureZ, BASE, BASE + open, u.apertureWidth, 0.012, c.void))
        spills.push({ x: offWall(s, 0.02), y: BASE + S.ajar.spill / 2, z: u.apertureZ, w: u.apertureWidth, h: S.ajar.spill, ry: faceInward(s) })
      }
      if (u.awning) {
        const A = S.awning
        boxes.push({ x: offWall(s, A.depth / 2), y: A.underside + A.thickness / 2 + 0.06, z: u.z, sx: A.depth, sy: A.thickness, sz: u.width - 0.1, rz: s * 0.1, color: c.shutter })
        cyls.push({ x: offWall(s, A.depth), y: A.underside + A.barRadius, z: u.z, sx: A.barRadius, sy: u.width - 0.06, sz: A.barRadius, rx: Math.PI / 2 })
      }
      if (u.signBox) {
        const B = S.signBox
        const lit = u.signBox.lit
        boxes.push(onWall(u.doorwayZ, B.baseY, B.baseY + B.size[1], B.size[0], B.proud, lit ? c.void : c.shutter, P))
        if (u.signBox.lit) {
          cells.push(signBoxCell(u.signBox.string, PALETTE[u.signBox.color]))
          faces.push({ x: offWall(s, P + B.proud + 0.003), y: B.baseY + B.size[1] / 2, z: u.doorwayZ, w: B.size[0] - 0.04, h: B.size[1] - 0.04, ry: faceInward(s) })
        }
      }
      const minX = Math.min(offWall(s, 0), offWall(s, D.proud)), maxX = Math.max(offWall(s, 0), offWall(s, D.proud))
      if (u.state === 'open') {
        // An open unit is solid either side of its aperture and not across it.
        solid.push({ minX, maxX, minZ: u.z - u.width / 2, maxZ: u.apertureZ - u.apertureWidth / 2 })
        solid.push({ minX, maxX, minZ: u.apertureZ + u.apertureWidth / 2, maxZ: u.z + u.width / 2 })
      } else solid.push({ minX, maxX, minZ: u.z - u.width / 2, maxZ: u.z + u.width / 2 })
    }
    const atlas = buildAtlas(cells)
    faces.forEach((f, i) => (f.rect = atlas.rects[i]))
    return {
      boxes, slats, cyls, solid,
      faces: quadsGeometry(faces),
      faceMat: m.emissivePanel(toTexture(atlas.canvas), EMISSIVE.signBox),
      spills: quadsGeometry(spills),
      spillMat: new THREE.MeshStandardMaterial({ color: PALETTE.void, emissive: PALETTE.sodium, emissiveIntensity: EMISSIVE.spill, roughness: MATERIALS.facade.roughness }),
    }
  }, [m])

  // Inert behind the clamp, and registered anyway: boxes go on as things are placed.
  useEffect(() => addBoxes(built.solid), [built])

  return (
    <>
      <Instanced items={built.boxes}><primitive object={m.facade} attach="material" /></Instanced>
      <Instanced items={built.slats}><primitive object={m.shutter} attach="material" /></Instanced>
      <Instanced items={built.cyls} geometry={UNIT_CYL}><meshStandardMaterial color={PALETTE.metalDark} {...MATERIALS.paintedMetal} /></Instanced>
      <mesh geometry={built.faces} material={built.faceMat} raycast={noRaycast} />
      <mesh geometry={built.spills} material={built.spillMat} raycast={noRaycast} />
    </>
  )
}
