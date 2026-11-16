import * as THREE from 'three'
import { BRAND_SIGN, GATE_WALL, PALETTE, PROPS, SIGNAGE, STREET, TYPE, UPPER } from '../world'
import { pick } from '../tier'
import { seeded } from '../math'
import { drawTracked, fitText, makeCanvas, toTexture, type Cell } from './canvas'

const JP = TYPE.japanese
const LATIN = TYPE.latin
const isLatin = (s: string) => /^[\x20-\x7E]+$/.test(s)
const faceOf = (s: string) => (isLatin(s) ? LATIN : JP)

/** Lit strokes on a dark panel: the colour lives only where the tube is. */
function neonText(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, px: number, color: string, weight = 700) {
  ctx.font = `${weight} ${px}px ${faceOf(text)}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = color
  ctx.shadowBlur = px * 0.22
  ctx.fillStyle = color
  ctx.fillText(text, cx, cy)
  ctx.shadowBlur = 0
  ctx.globalAlpha = 0.55
  ctx.fillStyle = '#ffffff'
  ctx.fillText(text, cx, cy)
  ctx.globalAlpha = 1
}

/** §3.5 — a neon sign face. Vertical signs stack their characters. */
export function signCell(text: string, color: string, vertical: boolean): Cell {
  const [s, l] = pick({ desktop: [128, 512], mobile: [64, 256] })
  const chars = [...text]
  const w = vertical ? s : l
  const h = vertical ? Math.round((s * (chars.length * 0.34 + 0.22)) / 0.44) : s
  return {
    w, h,
    paint(ctx, W, H) {
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, W, H)
      if (vertical) {
        const step = (H * 0.92) / chars.length
        const px = Math.min(W * 0.7, step * 0.86)
        chars.forEach((c, i) => neonText(ctx, c, W / 2, H * 0.04 + step * (i + 0.5), px, color))
      } else {
        const px = fitText(ctx, text, faceOf(text), 700, H * 0.62, W * 0.88)
        neonText(ctx, text, W / 2, H / 2 + (isLatin(text) ? px * 0.06 : 0), px, color)
      }
    },
  }
}

/** §3.5 — a banner is backlit: its painted ground keeps a sixteenth of its own colour. */
export function bannerCell(text: string, color: string, groundFraction: number): Cell {
  const [w, h] = pick({ desktop: [512, 128], mobile: [256, 64] })
  return {
    w, h,
    paint(ctx, W, H) {
      ctx.fillStyle = color
      ctx.globalAlpha = groundFraction * 2.2 // sRGB canvas; lands near a sixteenth in linear
      ctx.fillRect(0, 0, W, H)
      ctx.globalAlpha = 1
      const px = fitText(ctx, text, JP, 700, H * 0.58, W * 0.86, 0.12)
      ctx.font = `700 ${px}px ${JP}`
      ctx.fillStyle = color
      drawTracked(ctx, text, W / 2, H / 2, px, 0.12)
    },
  }
}

/** §3.4 — a lightbox, not a poster: inset frame, a backlight brighter at the centre, grime along the foot. */
export function signBoxCell(text: string, color: string): Cell {
  const [w, h] = pick({ desktop: [256, 138], mobile: [128, 69] })
  return {
    w, h,
    paint(ctx, W, H) {
      const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.62)
      g.addColorStop(0, color)
      g.addColorStop(1, '#000')
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, W, H)
      ctx.globalAlpha = 0.85
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, H)
      ctx.globalAlpha = 1
      ctx.strokeStyle = 'rgba(0,0,0,0.75)'
      ctx.lineWidth = Math.max(2, W * 0.03)
      ctx.strokeRect(W * 0.03, H * 0.05, W * 0.94, H * 0.9)
      const px = fitText(ctx, text, JP, 800, H * 0.5, W * 0.78, 0.08)
      ctx.font = `800 ${px}px ${JP}`
      ctx.fillStyle = 'rgba(4,6,11,0.92)'
      drawTracked(ctx, text, W / 2, H / 2, px, 0.08)
      const grime = ctx.createLinearGradient(0, H * 0.7, 0, H)
      grime.addColorStop(0, 'rgba(0,0,0,0)')
      grime.addColorStop(1, 'rgba(0,0,0,0.55)')
      ctx.fillStyle = grime
      ctx.fillRect(0, H * 0.7, W, H * 0.3)
    },
  }
}

/** §3.1 — the 終電 plate: signWhite on void. */
export function plateCell(): Cell {
  return {
    w: 256, h: 136,
    paint(ctx, W, H) {
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, W, H)
      const text = SIGNAGE[GATE_WALL.plate.string]
      const px = H * (TYPE.stationPlateGlyph / GATE_WALL.plate.size[1])
      ctx.font = `700 ${px}px ${JP}`
      ctx.fillStyle = PALETTE.signWhite
      drawTracked(ctx, text, W / 2, H / 2, px, 0.06)
    },
  }
}

/** §3.1 — the closure notice: a shinkansen pictogram and 運転終了 on one canvas. */
export function noticeCell(): Cell {
  const [w, h] = pick(GATE_WALL.notice.canvas)
  return {
    w, h,
    paint(ctx, W, H) {
      ctx.fillStyle = '#0b0d12'
      ctx.fillRect(0, 0, W, H)
      ctx.strokeStyle = PALETTE.signWhite
      ctx.lineWidth = W * 0.008
      ctx.strokeRect(W * 0.03, H * 0.06, W * 0.94, H * 0.88)
      // The long nose curve is the whole identity of the thing.
      const y = H * 0.36, x0 = W * 0.14, x1 = W * 0.86, th = H * 0.2
      ctx.fillStyle = PALETTE.signWhite
      ctx.beginPath()
      ctx.moveTo(x0, y + th / 2)
      ctx.bezierCurveTo(x0 + W * 0.06, y + th * 0.3, x0 + W * 0.14, y - th * 0.48, x0 + W * 0.3, y - th / 2)
      ctx.lineTo(x1, y - th / 2)
      ctx.lineTo(x1, y + th / 2)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#0b0d12'
      ctx.beginPath() // cab window
      ctx.moveTo(x0 + W * 0.17, y - th * 0.12)
      ctx.lineTo(x0 + W * 0.25, y - th * 0.34)
      ctx.lineTo(x0 + W * 0.31, y - th * 0.34)
      ctx.lineTo(x0 + W * 0.31, y - th * 0.12)
      ctx.closePath()
      ctx.fill()
      for (let i = 0; i < 7; i++) ctx.fillRect(x0 + W * 0.36 + i * W * 0.05, y - th * 0.3, W * 0.032, th * 0.22)
      ctx.fillStyle = PALETTE.neonBlue
      ctx.fillRect(x0 + W * 0.1, y + th * 0.12, x1 - x0 - W * 0.1, th * 0.1)
      ctx.fillStyle = PALETTE.signWhite
      ctx.fillRect(x0 - W * 0.04, y + th / 2 + H * 0.03, x1 - x0 + W * 0.08, H * 0.012)
      const text = SIGNAGE[GATE_WALL.notice.string]
      const px = fitText(ctx, text, JP, 700, H * 0.24, W * 0.7, 0.14)
      ctx.font = `700 ${px}px ${JP}`
      drawTracked(ctx, text, W / 2, H * 0.74, px, 0.14)
    },
  }
}

/** §3.6 — the studio's name in katakana, two rows, two colours. */
export function paintBrand() {
  const [W, H] = pick(STREET.brand.canvas)
  const [canvas, ctx] = makeCanvas(W, H)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, H)
  BRAND_SIGN.rows.forEach((row, i) => {
    const px = fitText(ctx, row, JP, 800, H * 0.33, W * 0.88)
    neonText(ctx, row, W / 2, H * (0.28 + i * 0.44), px, BRAND_SIGN.colors[i], 800)
  })
  return toTexture(canvas)
}

/** §2.1 — the title sign: the project's name, 0.30 cap height at most, shrink-to-fit. */
export function paintTitle(canvas: HTMLCanvasElement, name: string, worldSize: readonly [number, number]) {
  const ctx = canvas.getContext('2d')!
  const W = canvas.width, H = canvas.height
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, H)
  const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.6)
  g.addColorStop(0, 'rgba(255,46,106,0.34)')
  g.addColorStop(1, 'rgba(255,46,106,0.08)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = 'rgba(255,240,245,0.5)'
  ctx.lineWidth = H * 0.03
  ctx.strokeRect(H * 0.07, H * 0.07, W - H * 0.14, H - H * 0.14)
  const text = name.toUpperCase()
  const capPx = (TYPE.titleCapMax / worldSize[1]) * H
  const px = fitText(ctx, text, LATIN, 700, capPx / 0.72, W * 0.84, TYPE.titleTracking)
  ctx.font = `700 ${px}px ${LATIN}`
  ctx.fillStyle = PALETTE.signWhite
  drawTracked(ctx, text, W / 2, H / 2 + px * 0.06, px, TYPE.titleTracking)
}

/** §2.3 — a mailbox label: the channel's name from CONTENT.md. */
export function labelCell(text: string): Cell {
  return {
    w: 256, h: 76,
    paint(ctx, W, H) {
      ctx.fillStyle = '#1a1410'
      ctx.fillRect(0, 0, W, H)
      const t = text.toUpperCase()
      const px = fitText(ctx, t, LATIN, 700, H * 0.5, W * 0.84, 0.12)
      ctx.font = `700 ${px}px ${LATIN}`
      ctx.fillStyle = PALETTE.vendGlow
      drawTracked(ctx, t, W / 2, H / 2 + px * 0.06, px, 0.12)
    },
  }
}
/** §2.2 — the cart's lit faces. A warm lightbox; no text beyond what the object already says. */
export function warmPanelCell(lines = false): Cell {
  return {
    w: 256, h: 76,
    paint(ctx, W, H) {
      const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.6)
      g.addColorStop(0, PALETTE.vendGlow)
      g.addColorStop(1, '#6b4a22')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, H)
      if (lines) {
        ctx.strokeStyle = 'rgba(40,22,8,0.8)'
        ctx.lineWidth = H * 0.05
        ctx.strokeRect(H * 0.1, H * 0.12, W - H * 0.2, H * 0.76)
        ctx.fillStyle = 'rgba(40,22,8,0.75)'
        for (let i = 0; i < 5; i++) ctx.fillRect(W * (0.2 + i * 0.14), H * 0.34, W * 0.05, H * 0.32)
      }
    },
  }
}

/** §3.3 — a window bay: the same pixels as `map` and `emissiveMap`. Three variants, by index. */
export function paintBay(variant: number) {
  const size = pick(UPPER.canvas)
  const [canvas, ctx] = makeCanvas(size, size)
  ctx.fillStyle = PALETTE.facade
  ctx.fillRect(0, 0, size, size)
  const rand = seeded(101 + variant * 17)
  const px = size / UPPER.bay.width, py = size / UPPER.bay.height
  const perFloor = Math.round(UPPER.bay.width / UPPER.windowPitch)
  const lit = new Set<number>()
  const want = Math.max(2, Math.round(perFloor * 3 * UPPER.litFraction))
  while (lit.size < want) lit.add(Math.floor(rand() * perFloor * 3))
  for (let f = 0; f < 3; f++) {
    for (let i = 0; i < perFloor; i++) {
      const cx = (i + 0.5) * UPPER.windowPitch * px
      const base = size - (f * UPPER.floorHeight + UPPER.sill) * py
      const w = UPPER.window[0] * px, h = UPPER.window[1] * py
      const on = lit.has(f * perFloor + i)
      ctx.fillStyle = on ? UPPER.litColor : UPPER.unlitColor
      ctx.fillRect(cx - w / 2, base - h, w, h)
      if (on) {
        // A blind part-drawn, and a darker sill of clutter: a lit room, not a sign.
        const blind = h * (0.2 + rand() * 0.5)
        ctx.fillStyle = 'rgba(4,6,11,0.55)'
        ctx.fillRect(cx - w / 2, base - h, w, blind)
        ctx.fillStyle = 'rgba(4,6,11,0.4)'
        ctx.fillRect(cx - w / 2, base - h * 0.14, w, h * 0.14)
      }
      ctx.fillStyle = PALETTE.void
      ctx.fillRect(cx - 1, base - h, 2, h) // mullion
    }
  }
  return toTexture(canvas)
}

/** §3.7 — the paper lantern: nine ribs, a seam, brightest at the waist. */
export function paintLantern() {
  const size = PROPS.lantern.canvas
  const [canvas, ctx] = makeCanvas(size, size)
  const g = ctx.createLinearGradient(0, 0, 0, size)
  g.addColorStop(0, '#5a0c16')
  g.addColorStop(0.5, PALETTE.lantern)
  g.addColorStop(1, '#5a0c16')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = 'rgba(20,2,5,0.7)'
  for (let i = 1; i <= PROPS.lantern.ribs; i++) ctx.fillRect(0, (i / (PROPS.lantern.ribs + 1)) * size - 2, size, 4)
  ctx.fillRect(size * 0.5 - 1.5, 0, 3, size)
  ctx.fillStyle = 'rgba(8,4,4,0.92)'
  ctx.fillRect(0, 0, size, size * 0.06)
  ctx.fillRect(0, size * 0.94, size, size * 0.06)
  return toTexture(canvas)
}

/** §3.7 — a dead vending machine's rack: real plastic albedos, map only, no emissive. */
export function paintRack() {
  const [W, H] = pick(PROPS.vending.canvas)
  const [canvas, ctx] = makeCanvas(W, H)
  ctx.fillStyle = '#8a8f99'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#b3554f'
  ctx.fillRect(0, 0, W, H * 0.1)
  const cans = ['#c9a36b', '#b8c4d2', '#c25b52', '#6f9aa8', '#d0c3a0']
  const rand = seeded(7)
  for (let r = 0; r < 4; r++) {
    const y = H * (0.14 + r * 0.155)
    ctx.fillStyle = '#5d626c'
    ctx.fillRect(W * 0.06, y, W * 0.88, H * 0.13)
    for (let c = 0; c < 5; c++) {
      ctx.fillStyle = cans[Math.floor(rand() * cans.length)]
      ctx.fillRect(W * (0.1 + c * 0.168), y + H * 0.012, W * 0.11, H * 0.088)
      ctx.fillStyle = '#d8d3c8'
      ctx.fillRect(W * (0.1 + c * 0.168), y + H * 0.106, W * 0.11, H * 0.014)
    }
  }
  ctx.fillStyle = '#3d4149'
  ctx.fillRect(W * 0.12, H * 0.8, W * 0.76, H * 0.12)
  ctx.fillStyle = '#6b7079'
  ctx.fillRect(W * 0.72, H * 0.68, W * 0.16, H * 0.07)
  return toTexture(canvas)
}

/** Painted alphas: a radial pool (underglow, tail smear, contact decals) and a forward beam. */
export function paintPool() {
  const s = pick({ desktop: 128, mobile: 64 })
  const [canvas, ctx] = makeCanvas(s, s)
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.45, 'rgba(255,255,255,0.5)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, s, s)
  return toTexture(canvas)
}
export function paintBeam() {
  const s = pick({ desktop: 128, mobile: 64 })
  const [canvas, ctx] = makeCanvas(s, s)
  const img = ctx.createImageData(s, s)
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const u = x / (s - 1), v = (y / (s - 1)) * 2 - 1
    const spread = 0.25 + u * 0.75
    const a = Math.max(0, 1 - (v / spread) ** 2) * Math.pow(1 - u, 1.4) * Math.min(1, u * 8)
    const i = (y * s + x) * 4
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255
    img.data[i + 3] = a * 255
  }
  ctx.putImageData(img, 0, 0)
  return toTexture(canvas)
}
/** §10 — the painted streak, 8 × 64. */
export function paintStreak() {
  const [canvas, ctx] = makeCanvas(8, 64)
  const g = ctx.createLinearGradient(0, 0, 0, 64)
  g.addColorStop(0, 'rgba(255,255,255,0)')
  g.addColorStop(0.7, 'rgba(255,255,255,0.9)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(2, 0, 4, 64)
  const t = new THREE.CanvasTexture(canvas)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
/** A soft round sprite for steam. */
export function paintPuff() {
  const [canvas, ctx] = makeCanvas(64, 64)
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(255,255,255,0.9)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  return toTexture(canvas)
}
