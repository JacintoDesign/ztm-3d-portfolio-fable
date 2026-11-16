import * as THREE from 'three'
import { GROUND_MAPS, LAYOUT, MATERIALS, REFLECTOR } from '../world'
import { pick } from '../tier'
import { seeded } from '../math'
import { heightToNormal, makeCanvas, toTexture } from './canvas'

const P = GROUND_MAPS.puddle
const [X0, X1] = REFLECTOR.strip.x
const [Z0, Z1] = REFLECTOR.strip.z

// One pair of helpers for world ↔ mask, so the painter and the sampler cannot disagree.
// The plane is rotated −90° about X, so canvas rows run with +z.
let dims = { w: 1, h: 1 }
const colOf = (x: number) => ((x - X0) / (X1 - X0)) * dims.w
const rowOf = (z: number) => ((z - Z0) / (Z1 - Z0)) * dims.h

/** Placement weight across the alley: a wet floor biased to the crown and the gutters. Bias, not concentration. */
function weight(x: number, z: number) {
  if (z > LAYOUT.alley.z[1] + 0.2) return P.flatWeight // past the bend the road runs the other way
  const ax = Math.abs(x)
  const g = (ax - LAYOUT.gutter.x) / 0.4
  let w = 0.38 + 0.4 * Math.exp(-((x / 1.5) ** 2)) + 0.3 * Math.exp(-g * g)
  if (ax > LAYOUT.alley.x[1]) w *= 0.3
  return w
}

let wetData: Uint8ClampedArray | null = null

function paintPuddles() {
  const t = pick({ desktop: P.desktop, mobile: P.mobile })
  const [W, H] = t.size
  dims = { w: W, h: H }
  const [canvas, ctx] = makeCanvas(W, H)
  const dry = Math.round(P.dry * 255)
  const wet = Math.round(P.wet * 255)
  ctx.fillStyle = `rgb(${dry},${dry},${dry})`
  ctx.fillRect(0, 0, W, H)
  ctx.globalCompositeOperation = 'darken' // union of soft blobs
  const sx = W / (X1 - X0)
  const sz = H / (Z1 - Z0)
  const soft = Math.min(0.45, (t.blur / sx) * 1.2) // the boundary blur, as a fraction of a ~1 m radius
  const rand = seeded(11)

  const blob = (cx: number, cz: number) => {
    const n = P.ellipses[0] + Math.floor(rand() * (P.ellipses[1] - P.ellipses[0] + 1))
    const major = P.major[0] + rand() * rand() * (P.major[1] - P.major[0])
    for (let i = 0; i < n; i++) {
      const a = major * (0.35 + rand() * 0.3)
      const b = a * (0.45 + rand() * 0.5)
      const ex = cx + (rand() - 0.5) * major * 0.6
      const ez = cz + (rand() - 0.5) * major * 0.9
      ctx.save()
      ctx.translate(colOf(ex), rowOf(ez))
      ctx.rotate(rand() * Math.PI)
      ctx.scale(b * sx, a * sz)
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
      const edge = Math.max(0.3, 1 - soft / Math.max(0.4, b))
      g.addColorStop(0, `rgb(${wet},${wet},${wet})`)
      g.addColorStop(edge, `rgb(${wet},${wet},${wet})`)
      g.addColorStop(1, `rgb(${dry},${dry},${dry})`)
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(0, 0, 1, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  }

  // Coverage is measured per region; an average over two regions describes neither.
  const [probe, pctx] = makeCanvas(W >> 3, H >> 3)
  const coverage = (r: { x: readonly [number, number]; z: readonly [number, number] }) => {
    pctx.drawImage(canvas, 0, 0, probe.width, probe.height)
    const c0 = Math.floor(colOf(r.x[0]) / 8), c1 = Math.ceil(colOf(r.x[1]) / 8)
    const r0 = Math.floor(rowOf(r.z[0]) / 8), r1 = Math.ceil(rowOf(r.z[1]) / 8)
    const d = pctx.getImageData(c0, r0, c1 - c0, r1 - r0).data
    let n = 0
    for (let i = 0; i < d.length; i += 4) if (d[i] < (wet + dry) / 2) n++
    return n / (d.length / 4)
  }
  const place = (r: { x: readonly [number, number]; z: readonly [number, number] }, count: number) => {
    for (let k = 0, tries = 0; k < count && tries < 4000; tries++) {
      const x = r.x[0] + rand() * (r.x[1] - r.x[0])
      const z = r.z[0] + rand() * (r.z[1] - r.z[0])
      if (rand() * 1.1 > weight(x, z)) continue
      blob(x, z)
      k++
    }
  }
  const alleyStrip = { x: [X0, X1] as const, z: [Z0, LAYOUT.alley.z[1]] as const }
  const street = { x: [X0, X1] as const, z: [LAYOUT.alley.z[1] + 1, Z1] as const }
  for (let pass = 0; pass < 60; pass++) {
    const a = coverage(P.regions.alley)
    const c = coverage(P.regions.carriageway)
    if (a >= P.coverage && c >= P.coverage) break
    if (a < P.coverage) place(alleyStrip, 6)
    if (c < P.coverage) place(street, 2)
  }
  ctx.globalCompositeOperation = 'source-over'

  const full = ctx.getImageData(0, 0, W, H).data
  wetData = new Uint8ClampedArray(W * H)
  for (let i = 0; i < W * H; i++) wetData[i] = full[i * 4]
  return canvas
}

/** §10.0 — the mask's second job: the painted canvas, read once, says where a ring may land. */
export function puddleValueAt(x: number, z: number) {
  if (!wetData || x < X0 || x > X1 || z < Z0 || z > Z1) return 1
  const c = Math.min(dims.w - 1, Math.floor(colOf(x)))
  const r = Math.min(dims.h - 1, Math.floor(rowOf(z)))
  return wetData[r * dims.w + c] / 255
}

function paintRipple() {
  const R = GROUND_MAPS.ripple
  const size = pick(R.size)
  const k = size / 512
  const h = new Float32Array(size * size)
  const rand = seeded(29)
  for (let d = 0; d < R.dimples; d++) {
    const cx = rand() * size, cy = rand() * size
    const r = (R.dimpleRadius[0] + rand() * (R.dimpleRadius[1] - R.dimpleRadius[0])) * k
    const amp = (0.4 + rand() * 0.6) * (rand() < 0.5 ? -1 : 1)
    const reach = Math.ceil(r * 2.2)
    for (let y = -reach; y <= reach; y++) {
      for (let x = -reach; x <= reach; x++) {
        const px = (Math.floor(cx + x) + size) % size, py = (Math.floor(cy + y) + size) % size
        h[py * size + px] += amp * Math.exp(-(x * x + y * y) / (r * r * 0.5)) * (r / (14 * k)) * 3
      }
    }
  }
  // One faint low-frequency wave so the eye does not find the grid.
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    h[y * size + x] += 0.6 * Math.sin((x / size) * Math.PI * 2) * Math.cos((y / size) * Math.PI * 4)
  }
  return heightToNormal(h, size, R.slope * 0.25)
}

/** Tileable value noise: a lattice of `period` cells, smoothly interpolated, wrapping at the edges. */
function tileNoise(size: number, period: number, seed: number) {
  const rand = seeded(seed)
  const lattice = Float32Array.from({ length: period * period }, () => rand())
  const out = new Float32Array(size * size)
  const smooth = (t: number) => t * t * (3 - 2 * t)
  for (let y = 0; y < size; y++) {
    const fy = (y / size) * period, y0 = Math.floor(fy), ty = smooth(fy - y0), y1 = (y0 + 1) % period
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * period, x0 = Math.floor(fx), tx = smooth(fx - x0), x1 = (x0 + 1) % period
      const a = lattice[y0 * period + x0], b = lattice[y0 * period + x1], c = lattice[y1 * period + x0], d = lattice[y1 * period + x1]
      out[y * size + x] = a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty
    }
  }
  return out
}
/** Several octaves of it, normalised to 0…1. */
function fbm(size: number, base: number, octaves: number, seed: number) {
  const out = new Float32Array(size * size)
  let amp = 1, total = 0
  for (let o = 0; o < octaves; o++) {
    const n = tileNoise(size, base << o, seed + o * 13)
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp
    total += amp
    amp *= 0.5
  }
  for (let i = 0; i < out.length; i++) out[i] /= total
  return out
}
function greyCanvas(size: number, value: (i: number) => number) {
  const [canvas, ctx] = makeCanvas(size, size)
  const img = ctx.createImageData(size, size)
  for (let i = 0; i < size * size; i++) {
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = Math.max(0, Math.min(1, value(i))) * 255
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

// White is the material as §4 and §8 authored it; everything below white is damp —
// darker in `map` and glossier in `roughnessMap`, from the same pixels.

/** Cast concrete for kerbs and plinths: cloudy mottling under a fine aggregate. No direction. */
function paintGrain() {
  const size = pick(MATERIALS.grain.size)
  const cloud = fbm(size, 3, 4, 47)
  const fine = fbm(size, 48, 2, 91)
  const height = new Float32Array(size * size)
  for (let i = 0; i < height.length; i++) height[i] = fine[i] * 0.5 + cloud[i] * 0.2
  return { albedo: greyCanvas(size, (i) => 1 - 0.16 * Math.max(0, cloud[i] - 0.35) / 0.65 - 0.05 * (1 - fine[i])), normal: heightToNormal(height, size, 1.0) }
}

/**
 * A rendered wall that has stood in the rain: broad uneven weathering, panel
 * joints, and stains running down from each joint. Mapped in world metres, so
 * a streak is a streak on every wall and nothing is stretched.
 */
function paintWall() {
  const size = pick(MATERIALS.grain.size)
  const cloud = fbm(size, 2, 5, 211)
  const fine = fbm(size, 64, 2, 223)
  const stain = new Float32Array(size * size)
  const groove = new Float32Array(size * size)
  const rand = seeded(229)
  const course = size / 2 // two panel courses per tile
  // Joints: a horizontal line per course, vertical ones staggered between courses.
  for (let c = 0; c < 2; c++) {
    const y0 = Math.round(c * course)
    for (let x = 0; x < size; x++) for (let t = 0; t < 2; t++) groove[((y0 + t) % size) * size + x] = 1
    const vx = Math.round(c === 0 ? size * 0.12 : size * 0.62)
    for (let y = y0; y < y0 + course; y++) for (let t = 0; t < 2; t++) groove[(y % size) * size + ((vx + t) % size)] = 1
    // Stains start at the joint and thin out on the way down.
    const drips = 7
    for (let d = 0; d < drips; d++) {
      const cx = rand() * size, w = 2 + rand() * rand() * size * 0.06, len = course * (0.25 + rand() * 0.7), strength = 0.1 + rand() * 0.22
      for (let dy = 0; dy < len; dy++) {
        const fade = (1 - dy / len) ** 1.5
        const wobble = Math.sin(dy * 0.05 + d) * 1.2
        for (let dx = -Math.ceil(w * 1.5); dx <= Math.ceil(w * 1.5); dx++) {
          const fall = Math.exp(-(dx * dx) / (w * w * 0.6))
          const i = ((y0 + 2 + dy) % size) * size + ((Math.round(cx + dx + wobble) + size * 4) % size)
          stain[i] = Math.max(stain[i], strength * fade * fall)
        }
      }
    }
  }
  const height = new Float32Array(size * size)
  for (let i = 0; i < height.length; i++) height[i] = fine[i] * 0.2 + cloud[i] * 0.2 - groove[i] * 0.6
  const albedo = greyCanvas(size, (i) => 1 - 0.13 * Math.max(0, cloud[i] - 0.3) / 0.7 - stain[i] * 0.4 * (0.6 + 0.4 * fine[i]) - groove[i] * 0.14 - 0.03 * (1 - fine[i]))
  return { albedo, normal: heightToNormal(height, size, 1.2) }
}

type T = THREE.CanvasTexture
let cache: { puddle: T; ripple: T; grain: T; grainNormal: T; wall: T; wallNormal: T } | null = null
export function groundTextures() {
  if (cache) return cache
  const puddle = toTexture(paintPuddles(), { data: true })
  puddle.anisotropy = 1
  const ripple = toTexture(paintRipple(), { data: true })
  const g = paintGrain()
  const w = paintWall()
  cache = { puddle, ripple, grain: toTexture(g.albedo), grainNormal: toTexture(g.normal, { data: true }), wall: toTexture(w.albedo), wallNormal: toTexture(w.normal, { data: true }) }
  return cache
}
