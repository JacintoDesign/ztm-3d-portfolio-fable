import type * as THREE from 'three'

// Baked interior light. A room with no dynamic light to spend is lit here, once,
// at mount: every vertex's painted colour is multiplied by what its lamps would
// put on it — wrapped Lambert, a soft distance falloff, and a shadow where a
// fixture stands between the two. Nothing in this file runs per frame.
export type Lamp = { x: number; y: number; z: number; r: number; g: number; b: number; radius: number }
/** An occluder: min x, y, z then max x, y, z. */
export type Block = [number, number, number, number, number, number]

function hits(sx: number, sy: number, sz: number, dx: number, dy: number, dz: number, b: Block) {
  let t0 = 0, t1 = 1
  for (let axis = 0; axis < 3; axis++) {
    const s = axis === 0 ? sx : axis === 1 ? sy : sz
    const d = axis === 0 ? dx : axis === 1 ? dy : dz
    const lo = b[axis], hi = b[axis + 3]
    if (Math.abs(d) < 1e-6) {
      if (s < lo || s > hi) return false
      continue
    }
    let a = (lo - s) / d, c = (hi - s) / d
    if (a > c) { const t = a; a = c; c = t }
    if (a > t0) t0 = a
    if (c < t1) t1 = c
    if (t0 > t1) return false
  }
  return true
}

export function bake(geometry: THREE.BufferGeometry, lamps: Lamp[], ambient: { r: number; g: number; b: number }, blocks: Block[], wrap: number, shadow: number) {
  const P = geometry.attributes.position.array, N = geometry.attributes.normal.array
  const C = geometry.attributes.color.array as Float32Array
  const EPS = 0.03
  for (let i = 0; i < P.length; i += 3) {
    const nx = N[i], ny = N[i + 1], nz = N[i + 2]
    const sx = P[i] + nx * EPS, sy = P[i + 1] + ny * EPS, sz = P[i + 2] + nz * EPS
    let r = ambient.r, g = ambient.g, b = ambient.b
    for (let l = 0; l < lamps.length; l++) {
      const L = lamps[l]
      const dx = L.x - sx, dy = L.y - sy, dz = L.z - sz
      const d = Math.hypot(dx, dy, dz) || 1e-4
      const facing = ((nx * dx + ny * dy + nz * dz) / d + wrap) / (1 + wrap)
      if (facing <= 0) continue
      let k = facing / (1 + (d / L.radius) * (d / L.radius))
      if (k < 0.02) continue
      for (let o = 0; o < blocks.length; o++) {
        const B = blocks[o]
        // A vertex inside a fixture (stock on its shelves) is not shadowed by that fixture.
        if (sx > B[0] - EPS && sx < B[3] + EPS && sy > B[1] - EPS && sy < B[4] + EPS && sz > B[2] - EPS && sz < B[5] + EPS) continue
        if (hits(sx, sy, sz, dx, dy, dz, B)) { k *= shadow; break }
      }
      r += L.r * k
      g += L.g * k
      b += L.b * k
    }
    C[i] *= r
    C[i + 1] *= g
    C[i + 2] *= b
  }
  geometry.attributes.color.needsUpdate = true
  return geometry
}
