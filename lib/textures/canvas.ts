import * as THREE from 'three'
import { TYPE } from '../world'
import { pick } from '../tier'

export function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d', { willReadFrequently: false })!] as const
}

/** §11.1 — sRGB, mipmapped, anisotropic. Painted once; never per frame. */
export function toTexture(canvas: HTMLCanvasElement, opts: { data?: boolean; repeat?: [number, number] } = {}) {
  const t = new THREE.CanvasTexture(canvas)
  t.colorSpace = opts.data ? THREE.NoColorSpace : THREE.SRGBColorSpace
  t.anisotropy = pick(TYPE.anisotropy)
  t.generateMipmaps = true
  t.minFilter = THREE.LinearMipmapLinearFilter
  if (opts.repeat) withRepeat(t, opts.repeat)
  return t
}
export function withRepeat(t: THREE.Texture, repeat: [number, number]) {
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeat[0], repeat[1])
  return t
}
/** A clone shares its Source: one GPU upload, many samplers. */
export function cloneRepeat(t: THREE.Texture, repeat: [number, number]) {
  const c = t.clone()
  withRepeat(c, repeat)
  c.needsUpdate = true
  return c
}

/** Sobel of a tiling height field → a normal-map canvas. `slope` is the map's own strength. */
export function heightToNormal(height: Float32Array, size: number, slope: number) {
  const [canvas, ctx] = makeCanvas(size, size)
  const img = ctx.createImageData(size, size)
  const at = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)
      const dy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)
      const nx = -dx * slope
      const ny = dy * slope
      const inv = 1 / Math.hypot(nx, ny, 1)
      const i = (y * size + x) * 4
      img.data[i] = (nx * inv * 0.5 + 0.5) * 255
      img.data[i + 1] = (ny * inv * 0.5 + 0.5) * 255
      img.data[i + 2] = (inv * 0.5 + 0.5) * 255
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

// ── atlas: many painted faces, one canvas, one material, one draw call ────
export type Rect = { u0: number; v0: number; u1: number; v1: number }
export type Cell = { w: number; h: number; paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void }

export function buildAtlas(cells: Cell[], maxWidth = 1024) {
  const pad = 2
  const place: { x: number; y: number }[] = []
  let x = 0, y = 0, rowH = 0, usedW = 0
  for (const c of cells) {
    if (x + c.w + pad > maxWidth && x > 0) { x = 0; y += rowH + pad; rowH = 0 }
    place.push({ x, y })
    x += c.w + pad
    rowH = Math.max(rowH, c.h)
    usedW = Math.max(usedW, x)
  }
  const pow2 = (v: number) => 2 ** Math.ceil(Math.log2(Math.max(2, v)))
  const W = pow2(usedW), H = pow2(y + rowH)
  const [canvas, ctx] = makeCanvas(W, H)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, H)
  const rects: Rect[] = cells.map((c, i) => {
    const p = place[i]
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.beginPath()
    ctx.rect(0, 0, c.w, c.h)
    ctx.clip()
    c.paint(ctx, c.w, c.h)
    ctx.restore()
    return { u0: p.x / W, u1: (p.x + c.w) / W, v0: 1 - (p.y + c.h) / H, v1: 1 - p.y / H }
  })
  return { canvas, rects }
}

/** Fit text to a box: to the height first, then shrink to the width. */
export function fitText(ctx: CanvasRenderingContext2D, text: string, face: string, weight: number, maxH: number, maxW: number, tracking = 0) {
  let px = maxH
  const measure = () => {
    ctx.font = `${weight} ${px}px ${face}`
    return ctx.measureText(text).width + tracking * px * Math.max(0, [...text].length - 1)
  }
  const w = measure()
  if (w > maxW) { px *= maxW / w; measure() }
  return px
}
export function drawTracked(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, px: number, tracking: number) {
  const chars = [...text]
  const widths = chars.map((c) => ctx.measureText(c).width)
  const total = widths.reduce((s, w) => s + w, 0) + tracking * px * (chars.length - 1)
  let x = cx - total / 2
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  chars.forEach((c, i) => { ctx.fillText(c, x, cy); x += widths[i] + tracking * px })
}
