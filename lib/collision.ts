import { LAYOUT } from './world'
import { clamp } from './math'

// §12.4 — axis-aligned boxes on everything solid, plus the hard clamp.
export type Box = { minX: number; maxX: number; minZ: number; maxZ: number }
const boxes: Box[] = []
/** §3.8 — rooms opening off the alley: the walkable area is the main clamp plus these. */
const zones: Box[] = []
export function addZones(list: Box[]) {
  zones.push(...list)
  return () => {
    for (const z of list) {
      const i = zones.indexOf(z)
      if (i >= 0) zones.splice(i, 1)
    }
  }
}

export function addBoxes(list: Box[]) {
  boxes.push(...list)
  return () => {
    for (const b of list) {
      const i = boxes.indexOf(b)
      if (i >= 0) boxes.splice(i, 1)
    }
  }
}
export const boxAround = (x: number, z: number, sx: number, sz: number): Box => ({ minX: x - sx / 2, maxX: x + sx / 2, minZ: z - sz / 2, maxZ: z + sz / 2 })

const out = { x: 0, z: 0 }
const R = LAYOUT.playerRadius

/** Resolve per axis (slide, don't stop), then clamp. Boxes leak at corners; the clamp cannot. */
export function resolve(prevX: number, prevZ: number, nextX: number, nextZ: number) {
  let x = nextX
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i]
    if (prevZ > b.minZ - R && prevZ < b.maxZ + R && x > b.minX - R && x < b.maxX + R) {
      x = prevX <= (b.minX + b.maxX) / 2 ? b.minX - R : b.maxX + R
    }
  }
  let z = nextZ
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i]
    if (x > b.minX - R && x < b.maxX + R && z > b.minZ - R && z < b.maxZ + R) {
      z = prevZ <= (b.minZ + b.maxZ) / 2 ? b.minZ - R : b.maxZ + R
    }
  }
  // The clamp is a union of rectangles: take whichever one holds the point, or the nearest edge of any.
  let bx = clamp(x, LAYOUT.bounds.x[0], LAYOUT.bounds.x[1])
  let bz = clamp(z, LAYOUT.bounds.z[0], LAYOUT.bounds.z[1])
  let best = (bx - x) * (bx - x) + (bz - z) * (bz - z)
  for (let i = 0; i < zones.length && best > 0; i++) {
    const r = zones[i]
    const cx = clamp(x, r.minX, r.maxX), cz = clamp(z, r.minZ, r.maxZ)
    const d = (cx - x) * (cx - x) + (cz - z) * (cz - z)
    if (d < best) { best = d; bx = cx; bz = cz }
  }
  out.x = bx
  out.z = bz
  return out
}
