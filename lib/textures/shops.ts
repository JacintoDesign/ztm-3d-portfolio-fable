import { PALETTE, SIGNAGE, SHOPS, TYPE } from '../world'
import { drawTracked, fitText, type Cell } from './canvas'

// §3.8 — the only two painted faces left in the shops: the store's sign and the restaurant's noren.

/** The store's fascia: a white lightbox with two bands and `24H`. No real chain's livery. */
export function storeSignCell(): Cell {
  return {
    w: 1024, h: 128,
    paint(ctx, W, H) {
      // A dark panel with lit bands and lit type, like every other sign in this alley: the colour
      // lives in the strokes, so the sign reads without being a white slab.
      ctx.fillStyle = PALETTE.void
      ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = PALETTE.neonCyan
      ctx.fillRect(0, H * 0.1, W, H * 0.09)
      ctx.fillStyle = PALETTE.neonMagenta
      ctx.fillRect(0, H * 0.81, W, H * 0.09)
      const text = SIGNAGE[SHOPS.konbini.string]
      const px = H * 0.46
      ctx.font = `800 ${px}px ${TYPE.latin}`
      ctx.fillStyle = PALETTE.signWhite
      for (const cx of [W * 0.18, W * 0.5, W * 0.82]) drawTracked(ctx, text, cx, H * 0.52, px, 0.06)
      ctx.fillStyle = PALETTE.neonCyan
      for (const cx of [W * 0.34, W * 0.66]) ctx.fillRect(cx - H * 0.04, H * 0.42, H * 0.08, H * 0.2)
    },
  }
}

/** A short indigo noren, slit into panels, with the shop's own string across it. */
export function norenCell(text: string): Cell {
  return {
    w: 512, h: 48,
    paint(ctx, W, H) {
      ctx.fillStyle = PALETTE.neonBlue
      ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = 'rgba(4,6,11,0.55)'
      ctx.fillRect(0, 0, W, H)
      const n = SHOPS.noren.panels
      const chars = [...text]
      const px = fitText(ctx, 'あ', TYPE.japanese, 700, H * 0.66, (W / n) * 0.7)
      ctx.font = `700 ${px}px ${TYPE.japanese}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = PALETTE.signWhite
        const c = chars[i - Math.floor((n - chars.length) / 2)]
        if (c) ctx.fillText(c, (i + 0.5) * (W / n), H * 0.52)
        if (i) { ctx.fillStyle = PALETTE.void; ctx.fillRect((i * W) / n - 1.5, H * 0.12, 3, H) }
      }
    },
  }
}

// ── §3.8 — the store's printed matter ─────────────────────────────────────
const fits = (ctx: CanvasRenderingContext2D, text: string, weight: number, maxH: number, maxW: number) => {
  const face = /^[\x20-\x7E¥]+$/.test(text) ? TYPE.latin : TYPE.japanese
  const px = fitText(ctx, text, face, weight, maxH, maxW)
  ctx.font = `${weight} ${px}px ${face}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  return px
}

/** A product label: a colour band, the word, a barcode. */
export function productCell(word: string, color: string): Cell {
  return {
    w: 96, h: 112,
    paint(ctx, W, H) {
      ctx.fillStyle = PALETTE.signWhite
      ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = color
      ctx.fillRect(0, 0, W, H * 0.22)
      ctx.fillRect(0, H * 0.74, W, H * 0.05)
      ctx.fillStyle = PALETTE.void
      fits(ctx, word, 800, H * 0.36, W * 0.86)
      ctx.fillText(word, W / 2, H * 0.49)
      for (let i = 0; i < 12; i++) ctx.fillRect(W * 0.2 + i * W * 0.05, H * 0.84, W * (i % 3 ? 0.018 : 0.032), H * 0.11)
    },
  }
}
/** A shelf-edge price ticket. */
export function priceCell(text: string): Cell {
  return {
    w: 96, h: 40,
    paint(ctx, W, H) {
      ctx.fillStyle = PALETTE.vendGlow
      ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = PALETTE.lantern
      fits(ctx, text, 800, H * 0.7, W * 0.88)
      ctx.fillText(text, W / 2, H * 0.54)
    },
  }
}
/** A magazine cover: masthead, a block of picture, lines of small print. */
export function magazineCell(word: string, color: string): Cell {
  return {
    w: 96, h: 128,
    paint(ctx, W, H) {
      ctx.fillStyle = color
      ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = PALETTE.signWhite
      fits(ctx, word, 800, H * 0.24, W * 0.86)
      ctx.fillText(word, W / 2, H * 0.17)
      ctx.fillStyle = 'rgba(4,6,11,0.45)'
      ctx.fillRect(W * 0.1, H * 0.34, W * 0.8, H * 0.38)
      ctx.fillStyle = PALETTE.signWhite
      for (let i = 0; i < 3; i++) ctx.fillRect(W * 0.1, H * (0.78 + i * 0.06), W * (0.75 - i * 0.2), H * 0.025)
    },
  }
}
/** A word on a board: aisle signs, chiller headers, the till, the freezer. */
export function wordCell(word: string, ink: string, ground: string, w = 256, h = 64): Cell {
  return {
    w, h,
    paint(ctx, W, H) {
      ctx.fillStyle = ground
      ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = ink
      ctx.fillRect(0, H * 0.9, W, H * 0.1)
      fits(ctx, word, 800, H * 0.62, W * 0.84)
      ctx.fillText(word, W / 2, H * 0.47)
    },
  }
}
/** A poster: a burst of colour and one loud word, set vertically. */
export function posterCell(word: string, color: string): Cell {
  return {
    w: 128, h: 176,
    paint(ctx, W, H) {
      ctx.fillStyle = color
      ctx.fillRect(0, 0, W, H)
      ctx.strokeStyle = PALETTE.signWhite
      ctx.lineWidth = 4
      ctx.strokeRect(6, 6, W - 12, H - 12)
      const chars = [...word]
      const px = Math.min(W * 0.6, (H * 0.8) / chars.length)
      ctx.font = `800 ${px}px ${TYPE.japanese}`
      ctx.fillStyle = PALETTE.signWhite
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      chars.forEach((c, i) => ctx.fillText(c, W / 2, H / 2 + (i - (chars.length - 1) / 2) * px * 1.05))
    },
  }
}

/** A timber menu tag: one §11.4 string, brushed down it. */
export function tagCell(word: string): Cell {
  return {
    w: 48, h: 160,
    paint(ctx, W, H) {
      ctx.fillStyle = PALETTE.vendGlow
      ctx.fillRect(0, 0, W, H)
      const chars = [...word]
      const px = Math.min(W * 0.74, (H * 0.84) / chars.length)
      ctx.font = `700 ${px}px ${TYPE.japanese}`
      ctx.fillStyle = PALETTE.void
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      chars.forEach((c, i) => ctx.fillText(c, W / 2, H / 2 + (i - (chars.length - 1) / 2) * px * 1.06))
    },
  }
}
