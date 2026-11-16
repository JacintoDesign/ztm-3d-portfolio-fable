'use client'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { EMISSIVE, LAYOUT, MATERIALS, PALETTE, SHOPS, STOREFRONT as S, RESTAURANT_LABELS, SIGNAGE, STORE_LABELS, type Token } from '@/lib/world'
import { UNITS, offWall, type Unit } from '@/lib/storefronts'
import { addBoxes, addZones, type Box } from '@/lib/collision'
import { bake, type Block, type Lamp } from '@/lib/bake'
import { seeded } from '@/lib/math'
import { pick } from '@/lib/tier'
import { FaceBuilder, MeshBuilder, faceInward, quadsGeometry, tokenColor, type BoxInst, type Quad } from '@/lib/geo'
import { buildAtlas, toTexture, type Rect } from '@/lib/textures/canvas'
import { paintPool } from '@/lib/textures/painted'
import { magazineCell, norenCell, posterCell, priceCell, productCell, storeSignCell, tagCell, wordCell } from '@/lib/textures/shops'
import { FLOOR_PLANE, Instanced, noRaycast } from '../Instanced'
import { mats } from '../materials'

const Y0 = SHOPS.floorY // the shop floor: the plinth top
const H = S.aperture.y[1] - Y0 // floor to ceiling
const D = SHOPS.depth
const DOOR = SHOPS.door
const L = SHOPS.level
const LIGHT = SHOPS.light
const WALL = 0.04 // the room's lining
const PROUD = 0.02 // a painted face stands this far off what carries it — never millimetres
/** What is on the shelves, in §4's own tokens. */
const GOODS: Token[] = ['neonPink', 'neonCyan', 'sodium', 'phoneGreen', 'lantern', 'signWhite', 'vendGlow', 'neonBlue']
type LampSpec = readonly [Token, number, number]
const LIFT = 0.005 // a label stands this far off the packet it is stuck to
const WRAP_LIFT = 0.003 // and a wrapped one this far off its cylinder
type Face = 'street' | 'room' | '+a' | '-a'
/** The store's printed matter, as cells of one atlas. */
type Art = { products: Rect[]; drinks: Rect[]; prices: Rect[]; magazines: Rect[]; aisles: Rect[]; chillers: Rect[]; posters: Rect[]; till: Rect; hot: Rect; freezer: Rect }

/**
 * One room, in its own frame: `d` metres in from the wall face, `a` metres along
 * it from the aperture's centre, `y` metres above the shop floor. Everything
 * built through it is lit by the bake; `glow` is for the lamps themselves.
 */
class Room {
  lit = new MeshBuilder()
  lamps: Lamp[] = []
  blocks: Block[] = []
  solid: Box[] = []
  labels = new FaceBuilder()
  /** Set on a room whose stock is labelled. */
  art: Art | null = null
  /** What this room's bottles may be labelled as. */
  drinks: Rect[] | null = null
  w: number
  out: number
  constructor(public u: Unit, public glow: MeshBuilder, public rand: () => number) {
    this.w = u.apertureWidth
    this.out = faceInward(u.side) // yaw of a face looking back out at the street
  }
  x = (d: number) => this.u.side * (LAYOUT.alley.x[1] + d)
  z = (a: number) => this.u.apertureZ + a
  box(sd: number, h: number, sa: number, d: number, y: number, a: number, color: Token, gain = 1, rx = 0, rz = 0) {
    this.lit.box(sd, h, sa, this.x(d), Y0 + y, this.z(a), color, 0, rx, rz, gain)
  }
  cyl(rTop: number, rBottom: number, h: number, d: number, y: number, a: number, color: Token, gain = 1, segments = 10, rz = 0) {
    this.lit.cyl(rTop, rBottom, h, this.x(d), Y0 + y, this.z(a), color, 0, 0, rz, segments, gain)
  }
  /** A lamp's own body: drawn at its rung, never shaded. */
  lampBody(sd: number, h: number, sa: number, d: number, y: number, a: number, color: Token, gain: number = EMISSIVE.shopLamp) {
    this.glow.box(sd, h, sa, this.x(d), Y0 + y, this.z(a), color, 0, 0, 0, gain)
  }
  lamp(d: number, y: number, a: number, [token, power, radius]: LampSpec) {
    const c = tokenColor(token, power)
    this.lamps.push({ x: this.x(d), y: Y0 + y, z: this.z(a), r: c.r, g: c.g, b: c.b, radius })
  }
  /** A printed face, lit by the same bake as whatever carries it. The caller places it clear of its carrier. */
  label(rect: Rect, d: number, y: number, a: number, w: number, h: number, face: Face) {
    this.labels.quad({ x: this.x(d), y: Y0 + y, z: this.z(a), w, h, ry: this.yawOf(face), rect })
  }
  /** A label wrapped round a can or a bottle standing at (d, a), its word turned toward `face`. */
  wrap(rect: Rect, d: number, y: number, a: number, radius: number, h: number, face: Face) {
    this.labels.band(this.x(d), Y0 + y, this.z(a), radius + WRAP_LIFT, h, this.yawOf(face), rect, STORE_LABELS.wrap)
  }
  private yawOf(face: Face) {
    return face === 'street' ? this.out : face === 'room' ? this.out + Math.PI : face === '+a' ? 0 : Math.PI
  }
  private any(list: Rect[]) { return list[Math.floor(this.rand() * list.length)] }
  /** A fixture: it casts a baked shadow and, unless it hangs, stops the visitor. */
  block(d0: number, d1: number, y0: number, y1: number, a0: number, a1: number, solid = true) {
    const x0 = Math.min(this.x(d0), this.x(d1)), x1 = Math.max(this.x(d0), this.x(d1))
    this.blocks.push([x0, Y0 + y0, this.z(a0), x1, Y0 + y1, this.z(a1)])
    if (solid) this.solid.push({ minX: x0, maxX: x1, minZ: this.z(a0), maxZ: this.z(a1) })
  }
  zone(d0: number, d1: number, a0: number, a1: number): Box {
    return { minX: Math.min(this.x(d0), this.x(d1)), maxX: Math.max(this.x(d0), this.x(d1)), minZ: this.z(a0), maxZ: this.z(a1) }
  }
  bottle(d: number, y: number, a: number, r: number, h: number, color: Token) {
    this.cyl(r, r, h, d, y + h / 2, a, color, L.goods, 8)
    this.cyl(r * 0.4, r * 0.55, h * 0.32, d, y + h * 1.16, a, color, L.goods, 6)
  }
  /** Bottles in a row on a shelf that runs along a wall. */
  bottles(a0: number, a1: number, y: number, d: number, tokens: readonly Token[], r = 0.04, h = 0.22) {
    for (let a = a0 + r; a < a1 - r; a += r * 2 + 0.02 + this.rand() * 0.03) {
      const br = r * (0.85 + this.rand() * 0.3), bh = h * (0.8 + this.rand() * 0.4)
      this.bottle(d, y, a, br, bh, tokens[Math.floor(this.rand() * tokens.length)])
      if (this.drinks) this.wrap(this.any(this.drinks), d, y + bh * 0.48, a, br, bh * 0.5, 'street')
    }
  }
  /** Packets and cans in a row; `alongWall` runs the row across the room instead of back into it. */
  stock(from: number, to: number, y: number, at: number, maxH: number, alongWall = false, face: 1 | -1 = 1) {
    for (let p = from; p < to - 0.08; ) {
      const w = 0.07 + this.rand() * 0.09, h = maxH * (0.45 + this.rand() * 0.5), deep = 0.11 + this.rand() * 0.04
      const color = GOODS[Math.floor(this.rand() * GOODS.length)]
      const d = alongWall ? at : p + w / 2, a = alongWall ? p + w / 2 : at
      const can = this.rand() < 0.3
      if (can) this.cyl(w / 2, w / 2, h, d, y + h / 2, a, color, L.goods, 8)
      else this.box(alongWall ? deep : w, h, alongWall ? w : deep, d, y + h / 2, a, color, L.goods)
      if (this.art) {
        // The label goes on the face the customer sees: the street for an end cap, the aisle otherwise.
        const rect = this.any(this.art.products), to: Face = alongWall ? 'street' : face > 0 ? '+a' : '-a'
        const half = deep / 2 + LIFT, lw = w * 0.84, lh = h * 0.62
        if (can) this.wrap(rect, d, y + h / 2, a, w / 2, lh, to) // a can's label goes round it
        else if (alongWall) this.label(rect, d - half, y + h / 2, a, lw, lh, 'street')
        else this.label(rect, d, y + h / 2, a + face * half, lw, lh, to)
      }
      p += w + 0.012
    }
  }
  /** Floor, ceiling and three walls, diced so the baked light has somewhere to fall. */
  shell(floor: [Token, number], ceiling: [Token, number], wall: [Token, number]) {
    // It starts a centimetre behind the wall face and lines the hole from inside, so none of its
    // faces shares a plane with the wall it stands in: coplanar faces are what flickers.
    const d0 = 0.01, len = D - d0, mid = (D + d0) / 2, c = LIGHT.cell
    this.lit.slab(len, 0.24, this.w, this.x(mid), Y0 - 0.12, this.z(0), floor[0], floor[1], c)
    this.lit.slab(len, 0.04, this.w, this.x(mid), Y0 + H, this.z(0), ceiling[0], ceiling[1], c)
    for (const e of [-1, 1]) this.lit.slab(len, H, WALL, this.x(mid), Y0 + H / 2, this.z(e * (this.w / 2 - WALL / 2)), wall[0], wall[1], c)
    this.lit.slab(0.04, H, this.w, this.x(D + 0.02), Y0 + H / 2, this.z(0), wall[0], wall[1], c)
  }
  finish(ambient: readonly [Token, number]) {
    return bake(this.lit.build(), this.lamps, tokenColor(ambient[0], ambient[1]), this.blocks, LIGHT.wrap, LIGHT.shadow)
  }
  finishLabels(ambient: readonly [Token, number]) {
    return bake(this.labels.build(L.label), this.lamps, tokenColor(ambient[0], ambient[1]), this.blocks, LIGHT.wrap, LIGHT.shadow)
  }
}

/** §3.8 — the 24h store: glazed front, strip lights, gondolas with end caps, chillers, a counter, a freezer, magazines. */
function buildStore(room: Room, signs: Quad[], glass: Quad[], sign: Rect) {
  const { w, u } = room
  const T = LIGHT.store
  room.shell(['rain', L.floor], ['rain', L.ceiling], ['rain', L.wall])
  for (const e of [-1, 1]) room.box(D - 0.1, 0.08, 0.015, D / 2, 0.04, e * (w / 2 - WALL - 0.008), 'metalDark', L.frame)
  // Three ceiling troffers, each framed, each lighting the room from three points along its length.
  for (let i = 0; i < 3; i++) {
    const d = 0.55 + i * 0.85
    room.lampBody(0.22, 0.02, w * 0.8, d, H - 0.03, 0, 'signWhite')
    for (const e of [-1, 1]) room.box(0.03, 0.035, w * 0.8 + 0.06, d + e * 0.125, H - 0.035, 0, 'metalDark', L.frame)
    for (const a of [-w * 0.28, 0, w * 0.28]) room.lamp(d, H - 0.1, a, T.strip)
  }
  room.lamp(-0.8, 1.9, 0, T.street) // what the alley throws in through the doors

  // The back wall is a run of chillers: a carcass, five glazed bays, a light bar and five shelves of bottles in each.
  const CD = SHOPS.chillerDepth, inner = w - 2 * WALL, bays = 5, bw = inner / bays, front = D - CD
  const rows = pick({ desktop: 2, mobile: 1 })
  room.box(CD, 0.12, inner, D - CD / 2, 0.06, 0, 'metalDark', L.frame)
  room.box(CD, 0.16, inner, D - CD / 2, H - 0.1, 0, 'neonCyan', L.wall)
  for (let b = 0; b <= bays; b++) room.box(CD, H - 0.3, 0.05, D - CD / 2, 0.12 + (H - 0.3) / 2, -inner / 2 + b * bw, 'metalDark', L.frame)
  for (let b = 0; b < bays; b++) {
    const a0 = -inner / 2 + b * bw + 0.04, a1 = a0 + bw - 0.08, mid = (a0 + a1) / 2
    for (let k = 0; k < 5; k++) {
      const y = 0.16 + k * 0.38
      room.box(CD - 0.08, 0.02, bw - 0.06, D - CD / 2 + 0.02, y, mid, 'rain', L.wall)
      for (let r = 0; r < rows; r++) room.bottles(a0, a1, y + 0.01, front + 0.13 + r * 0.14, GOODS)
    }
    if (room.art) room.label(room.art.chillers[b % room.art.chillers.length], front - LIFT, H - 0.1, mid, bw - 0.14, 0.11, 'street')
    room.lampBody(0.03, 0.03, bw - 0.12, front + 0.05, H - 0.24, mid, 'neonCyan')
    room.lamp(front + 0.08, H - 0.4, mid, T.chiller)
    room.lamp(front + 0.08, 0.9, mid, T.chiller)
    glass.push({ x: room.x(front - 0.01), y: Y0 + 0.12 + (H - 0.3) / 2, z: room.z(mid), w: bw - 0.06, h: H - 0.3, ry: room.out })
    room.box(0.03, 0.34, 0.02, front - 0.03, 1.1, a1 - 0.03, 'metalDark', L.frame)
  }
  room.block(front, D, 0, H, -w / 2, w / 2)

  // Gondolas run back from the window; each has an end cap facing the door and a sign hung over it.
  ;[-w * 0.2, w * 0.14].forEach((a, i) => {
    room.box(1.7, 0.1, 0.42, 1.35, 0.05, a, 'metalDark', L.frame)
    room.box(1.7, 1.3, 0.03, 1.35, 0.65, a, 'rain', L.fixture)
    for (const d of [0.5, 2.2]) room.box(0.03, 1.3, 0.42, d, 0.65, a, 'rain', L.fixture)
    room.box(1.7, 0.025, 0.42, 1.35, 1.31, a, 'rain', L.wall)
    for (const e of [-1, 1]) for (let k = 0; k < 4; k++) {
      const y = 0.1 + k * 0.3
      room.box(1.64, 0.02, 0.19, 1.35, y, a + e * 0.11, 'rain', L.wall)
      room.box(1.64, 0.035, 0.012, 1.35, y - 0.006, a + e * 0.205, 'signWhite', L.wall) // the price rail
      room.stock(0.54, 2.17, y + 0.01, a + e * 0.11, 0.25, false, e as 1 | -1)
      if (room.art) for (let p = 0.64; p < 2.1; p += 0.24) room.label(room.art.prices[Math.floor(room.rand() * room.art.prices.length)], p, y - 0.006, a + e * (0.211 + LIFT), 0.075, 0.031, e > 0 ? '+a' : '-a')
    }
    for (let k = 0; k < 3; k++) {
      room.box(0.17, 0.02, 0.4, 0.4, 0.2 + k * 0.34, a, 'rain', L.wall)
      room.stock(a - 0.19, a + 0.19, 0.21 + k * 0.34, 0.4, 0.24, true)
    }
    // The aisle sign hangs across the gondola, facing the door, and says what the aisle is.
    room.box(0.02, 0.18, 0.62, 0.95, H - 0.45, a, i ? 'neonMagenta' : 'neonCyan', L.fixture)
    for (const e of [-1, 1]) room.box(0.008, 0.36, 0.008, 0.95, H - 0.18, a + e * 0.26, 'metalDark', L.frame)
    if (room.art) {
      room.label(room.art.aisles[i % room.art.aisles.length], 0.94 - LIFT, H - 0.45, a, 0.58, 0.15, 'street')
      room.label(room.art.aisles[i % room.art.aisles.length], 0.96 + LIFT, H - 0.45, a, 0.58, 0.15, 'room')
    }
    room.block(0.3, 2.2, 0, 1.33, a - 0.21, a + 0.21)
  })

  // The counter: a kick, a top, the till with its screen, a card reader, a warm case of buns, and the rack behind.
  const cz = w / 2 - 0.7
  room.box(1.16, 0.08, 0.46, 0.95, 0.04, cz, 'metalDark', L.frame)
  room.box(1.2, 0.82, 0.5, 0.95, 0.49, cz, 'rain', L.fixture)
  room.box(1.26, 0.04, 0.58, 0.95, 0.92, cz, 'signWhite', L.wall)
  room.box(0.26, 0.1, 0.3, 0.72, 0.99, cz + 0.02, 'metalDark', L.frame)
  room.box(0.02, 0.2, 0.26, 0.63, 1.15, cz + 0.02, 'metalDark', L.frame, 0, 0.2)
  room.lampBody(0.006, 0.15, 0.21, 0.615, 1.15, cz + 0.02, 'neonCyan', L.goods)
  room.box(0.08, 0.03, 0.12, 0.5, 0.955, cz - 0.16, 'void')
  room.box(0.36, 0.02, 0.4, 1.3, 0.95, cz, 'metalDark', L.frame)
  room.box(0.36, 0.02, 0.4, 1.3, 1.27, cz, 'metalDark', L.frame)
  for (const ed of [-1, 1]) for (const ea of [-1, 1]) room.box(0.015, 0.3, 0.015, 1.3 + ed * 0.17, 1.11, cz + ea * 0.19, 'metalDark', L.frame)
  for (let i = 0; i < 3; i++) room.cyl(0.045, 0.055, 0.05, 1.3, 0.99, cz - 0.11 + i * 0.11, 'vendGlow', L.goods, 8)
  room.lampBody(0.2, 0.012, 0.2, 1.3, 1.255, cz, 'sodium')
  for (let k = 0; k < 3; k++) {
    const y = 1.25 + k * 0.3
    room.box(1.3, 0.02, 0.14, 0.95, y, w / 2 - WALL - 0.07, 'rain', L.wall)
    room.stock(0.32, 1.58, y + 0.01, w / 2 - WALL - 0.07, 0.2, false, -1)
  }
  if (room.art) {
    // The till's own sign overhead, its name on the counter front, and a ticket on the warm case.
    room.box(0.02, 0.2, 0.5, 0.5, H - 0.42, cz, 'signWhite', L.wall)
    for (const e of [-1, 1]) room.box(0.008, 0.34, 0.008, 0.5, H - 0.16, cz + e * 0.2, 'metalDark', L.frame)
    room.label(room.art.till, 0.49 - LIFT, H - 0.42, cz, 0.46, 0.16, 'street')
    room.label(room.art.till, 0.51 + LIFT, H - 0.42, cz, 0.46, 0.16, 'room')
    room.label(room.art.till, 0.95, 0.52, cz - 0.25 - LIFT, 0.5, 0.15, '-a')
    room.box(0.2, 0.07, 0.012, 1.3, 1.325, cz - 0.2, 'signWhite', L.wall)
    room.label(room.art.hot, 1.3, 1.325, cz - 0.206 - LIFT, 0.18, 0.058, '-a')
  }
  room.block(0.35, 1.55, 0, 0.94, cz - 0.25, cz + 0.25)

  // A chest freezer along the far wall, and the magazine rack under the window.
  const fa = -w / 2 + WALL + 0.3
  room.box(0.95, 0.78, 0.55, 1.4, 0.39, fa, 'rain', L.fixture)
  room.box(0.97, 0.03, 0.57, 1.4, 0.8, fa, 'neonCyan', L.fixture)
  room.box(0.02, 0.036, 0.57, 1.4, 0.8, fa, 'metalDark', L.frame)
  room.block(0.92, 1.88, 0, 0.82, fa - 0.28, fa + 0.28)
  if (room.art) {
    room.label(room.art.freezer, 1.4, 0.45, fa + 0.275 + LIFT, 0.5, 0.15, '+a')
    room.label(room.art.freezer, 0.925 - LIFT, 0.45, fa, 0.4, 0.13, 'street')
    // Posters on the wall above it.
    room.art.posters.forEach((r, i) => room.label(r, 1.05 + i * 0.7, 1.55, -w / 2 + WALL + PROUD, 0.45, 0.62, '+a'))
  }
  const m0 = -w / 2 + 0.14, m1 = -DOOR / 2 - 0.22, mm = (m0 + m1) / 2
  room.box(0.03, 0.92, m1 - m0, 0.33, 0.48, mm, 'rain', L.fixture)
  for (let k = 0; k < 2; k++) {
    room.box(0.15, 0.02, m1 - m0, 0.25, 0.16 + k * 0.4, mm, 'rain', L.wall)
    for (let a = m0 + 0.12, n = 0; a < m1 - 0.1; a += 0.215, n++) {
      room.box(0.014, 0.27, 0.19, 0.27, 0.31 + k * 0.4, a, GOODS[Math.floor(room.rand() * GOODS.length)], L.goods)
      if (room.art) room.label(room.art.magazines[(n + k) % room.art.magazines.length], 0.263 - LIFT, 0.31 + k * 0.4, a, 0.19, 0.27, 'street')
    }
  }
  room.block(0.1, 0.38, 0, 0.95, m0, m1)
  // A mat inside the doors and a stack of baskets beside them.
  room.box(0.9, 0.012, DOOR - 0.1, 0.5, 0.006, 0, 'void')
  for (let i = 0; i < 4; i++) room.box(0.3, 0.05, 0.4, 0.2, 0.03 + i * 0.06, 1.02, 'lantern', L.goods)

  // Glazing: mullions and a transom; glass either side, and the doors standing open between the two middle mullions.
  for (const a of [-w / 2 + 0.03, -DOOR / 2, DOOR / 2, w / 2 - 0.03]) room.box(0.05, H, 0.05, 0.03, H / 2, a, 'metalDark', L.frame)
  room.box(0.05, 0.05, w, 0.03, 2.02, 0, 'metalDark', L.frame)
  const pane = w / 2 - DOOR / 2
  for (const e of [-1, 1]) glass.push({ x: room.x(0.03), y: Y0 + H / 2, z: room.z(e * (DOOR / 2 + pane / 2)), w: pane, h: H, ry: room.out })
  glass.push({ x: room.x(0.03), y: Y0 + 2.02 + (H - 2.02) / 2, z: room.z(0), w: DOOR, h: H - 2.02, ry: room.out })
  // The fascia sign spans the unit: the store's name is the building's, not the doorway's.
  const sw = u.width - 0.4
  room.glow.box(0.07, SHOPS.sign.height + 0.06, sw + 0.06, offWall(u.side, S.frameProud + 0.035), SHOPS.sign.y, u.z, 'void')
  signs.push({ x: offWall(u.side, S.frameProud + 0.07 + PROUD), y: SHOPS.sign.y, z: u.z, w: sw, h: SHOPS.sign.height, ry: room.out, rect: sign })

  const m = SHOPS.margin
  return [
    room.zone(-1.5, 0.7, -(DOOR / 2 - LAYOUT.playerRadius), DOOR / 2 - LAYOUT.playerRadius), // through the doors
    room.zone(m + 0.05, D - m, -w / 2 + m, w / 2 - m),
  ]
}

/** §3.8 — the restaurant: beams, a counter with stools under pendants, a kitchen with a hood, bottles, a two-top. */
function buildRestaurant(room: Room, quads: Quad[], noren: Rect, menu: Rect[]) {
  const { w, u } = room
  const T = LIGHT.restaurant
  room.shell(['crateTimber', L.timberFloor], ['crateKraft', L.timberCeiling], ['vendGlow', L.warmWall])
  for (const d of [0.45, 1.2, 1.95, 2.65]) room.box(0.1, 0.12, w - 2 * WALL, d, H - 0.08, 0, 'crateTimber', L.timber)
  // Timber wainscot with a cap rail on three walls, and a sill across the threshold.
  for (const e of [-1, 1]) {
    room.box(D - 0.1, 0.9, 0.03, D / 2, 0.45, e * (w / 2 - WALL - 0.015), 'crateTimber', L.timber)
    room.box(D - 0.1, 0.03, 0.05, D / 2, 0.915, e * (w / 2 - WALL - 0.03), 'crateKraft', L.timberTop)
  }
  room.box(0.03, 0.9, w - 2 * WALL - 0.06, D - 0.015, 0.45, 0, 'crateTimber', L.timber)
  room.box(0.12, 0.03, w, 0.06, 0.015, 0, 'crateTimber', L.timber)
  room.lamp(-0.8, 1.9, 0, T.street)

  // The counter runs back from the street: an overhanging top, a foot rail, four stools.
  const ca = -w * 0.12
  room.box(2.1, 0.98, 0.4, 1.25, 0.49, ca, 'crateTimber', L.timber)
  room.box(2.2, 0.05, 0.66, 1.25, 1.0, ca + 0.03, 'crateKraft', L.timberTop)
  room.box(2.0, 0.03, 0.03, 1.25, 0.2, ca + 0.3, 'metalDark', L.pot)
  for (let i = 0; i < 4; i++) {
    const d = 0.45 + i * 0.55, a = ca + 0.64
    room.cyl(0.16, 0.15, 0.06, d, 0.64, a, 'lantern', L.wall, 14)
    room.cyl(0.022, 0.022, 0.6, d, 0.31, a, 'metalDark', L.pot, 6)
    room.cyl(0.12, 0.12, 0.014, d, 0.24, a, 'metalDark', L.pot, 12)
    room.cyl(0.13, 0.14, 0.02, d, 0.01, a, 'metalDark', L.frame, 12)
    // Each place: a bowl, a pot of chopsticks, a sauce bottle.
    room.cyl(0.085, 0.05, 0.055, d, 1.055, ca + 0.18, 'signWhite', L.wall)
    room.cyl(0.03, 0.028, 0.09, d + 0.16, 1.07, ca + 0.26, 'crateKraft', L.timberTop, 8)
    room.bottle(d + 0.22, 1.025, ca + 0.26, 0.018, 0.09, 'lantern')
  }
  room.block(0.2, 2.3, 0, 1.03, ca - 0.2, ca + 0.36)
  room.block(0.3, 2.26, 0, 0.67, ca + 0.48, ca + 0.8)
  // The oden pan: square, in compartments, simmering under its own lamp.
  room.box(0.5, 0.12, 0.3, 1.5, 1.085, ca - 0.1, 'metalDark', L.pot)
  for (let i = 1; i < 3; i++) room.box(0.012, 0.125, 0.29, 1.25 + i * 0.167, 1.09, ca - 0.1, 'metalDark', L.steel)
  room.box(0.46, 0.01, 0.26, 1.5, 1.135, ca - 0.1, 'sodium', L.goods)
  // Three pendants: a cord, a shade, a bulb — and the bulb is what lights the counter.
  for (let i = 0; i < 3; i++) {
    const d = 0.55 + i * 0.7, y = SHOPS.pendantY
    room.box(0.008, H - y - 0.1, 0.008, d, (H + y + 0.1) / 2, ca + 0.03, 'void')
    room.cyl(0.03, 0.15, 0.12, d, y + 0.04, ca + 0.03, 'metalDark', L.frame, 12)
    room.glow.cyl(0.05, 0.04, 0.06, room.x(d), Y0 + y - 0.02, room.z(ca + 0.03), 'vendGlow', 0, 0, 0, 8, EMISSIVE.shopLamp)
    room.lamp(d, y - 0.08, ca + 0.03, T.pendant)
  }

  // The kitchen behind the counter: a steel bench with a pot and a kettle on it, a hood over it, ladles under the hood.
  const k0 = -w / 2 + WALL, k1 = ca - 0.3, ka = (k0 + k1) / 2, kl = k1 - k0
  room.box(0.55, 0.88, kl, D - 0.3, 0.44, ka, 'metalDark', L.steel)
  room.box(0.58, 0.03, kl, D - 0.3, 0.9, ka, 'metalDark', L.pot)
  room.cyl(0.15, 0.15, 0.22, D - 0.3, 1.03, ka - 0.3, 'metalDark', L.pot, 14)
  room.cyl(0.155, 0.155, 0.015, D - 0.3, 1.148, ka - 0.3, 'metalDark', L.steel, 14)
  room.cyl(0.02, 0.025, 0.03, D - 0.3, 1.17, ka - 0.3, 'void', 1, 6)
  room.cyl(0.07, 0.1, 0.14, D - 0.32, 0.985, ka + 0.12, 'metalDark', L.pot, 12)
  room.box(0.1, 0.02, 0.02, D - 0.42, 1.02, ka + 0.12, 'metalDark', L.pot, 0, 0.5)
  room.cyl(0.11, 0.11, 0.16, D - 0.3, 0.995, ka + 0.45, 'signWhite', L.fixture, 14)
  room.box(0.2, 0.02, 0.3, D - 0.42, 0.925, ka - 0.02, 'crateKraft', L.timberTop)
  room.box(0.6, 0.14, kl - 0.1, D - 0.32, 1.78, ka, 'metalDark', L.steel)
  room.box(0.3, H - 1.85, 0.4, D - 0.2, (H + 1.85) / 2, ka, 'metalDark', L.steel)
  room.lampBody(0.03, 0.03, kl * 0.55, D - 0.36, 1.69, ka, 'signWhite')
  room.lamp(D - 0.4, 1.6, ka, T.kitchen)
  for (let i = 0; i < 3; i++) {
    room.box(0.01, 0.28, 0.01, D - 0.6, 1.56, ka - 0.2 + i * 0.16, 'metalDark', L.pot)
    room.cyl(0.035, 0.02, 0.03, D - 0.6, 1.41, ka - 0.2 + i * 0.16, 'metalDark', L.pot, 8)
  }
  room.block(D - 0.6, D, 0, 0.92, k0, k1)
  room.block(D - 0.62, D, 1.71, H, k0 + 0.05, k1 - 0.05, false)
  // On the side wall, two shelves of stacked bowls.
  for (let k = 0; k < 2; k++) {
    const y = 1.28 + k * 0.4
    room.box(0.95, 0.025, 0.17, 1.45, y, k0 + 0.09, 'crateKraft', L.timberTop)
    for (let j = 0; j < 4; j++) {
      const n = 3 + ((j + k) % 3)
      for (let s = 0; s < n; s++) room.cyl(0.07, 0.045, 0.034, 1.1 + j * 0.23, y + 0.03 + s * 0.022, k0 + 0.09, 'signWhite', L.wall, 10)
    }
  }
  // Crates of empties by the kitchen's end of the counter.
  room.box(0.36, 0.3, 0.5, 0.36, 0.15, k0 + 0.3, 'crateKraft', L.timberTop)
  room.box(0.36, 0.3, 0.5, 0.37, 0.45, k0 + 0.31, 'crateTimber', L.timber)
  room.block(0.18, 0.55, 0, 0.6, k0 + 0.04, k0 + 0.56)

  // Across the back wall, right into the corner: two shelves of bottles, and a clock above them.
  const warm: Token[] = ['sodium', 'vendGlow', 'phoneGreen', 'sodiumDeep', 'signWhite']
  for (const y of [1.3, 1.74]) {
    room.box(0.16, 0.025, 2.25, D - 0.08, y, 0.875, 'crateKraft', L.timberTop)
    room.bottles(-0.22, 1.97, y + 0.013, D - 0.08, warm, 0.038, 0.24)
  }
  room.cyl(0.13, 0.13, 0.02, D - 0.012, 2.1, 0.875, 'signWhite', L.wall, 16, Math.PI / 2)

  // A two-top on the other side: four legs, two stools, and the menu on its nails above.
  const ta = w / 2 - 0.8, td = 1.2
  room.box(0.7, 0.04, 0.7, td, 0.72, ta, 'crateKraft', L.timberTop)
  for (const ed of [-1, 1]) for (const ea of [-1, 1]) room.box(0.04, 0.7, 0.04, td + ed * 0.3, 0.35, ta + ea * 0.3, 'crateTimber', L.timber)
  room.cyl(0.03, 0.028, 0.09, td - 0.1, 0.785, ta + 0.05, 'crateKraft', L.timberTop, 8)
  room.bottle(td + 0.02, 0.74, ta + 0.08, 0.018, 0.09, 'lantern')
  for (const e of [-1, 1]) {
    room.cyl(0.15, 0.14, 0.06, td + e * 0.62, 0.47, ta, 'lantern', L.wall, 14)
    room.cyl(0.022, 0.022, 0.44, td + e * 0.62, 0.22, ta, 'metalDark', L.pot, 6)
    room.cyl(0.12, 0.13, 0.02, td + e * 0.62, 0.01, ta, 'metalDark', L.frame, 12)
    room.block(td + e * 0.62 - 0.15, td + e * 0.62 + 0.15, 0, 0.5, ta - 0.15, ta + 0.15)
  }
  room.block(td - 0.35, td + 0.35, 0, 0.74, ta - 0.35, ta + 0.35)
  for (let i = 0; i < 5; i++) {
    room.box(0.15, 0.46 - (i % 2) * 0.05, 0.018, 0.6 + i * 0.26, 1.72, w / 2 - WALL - 0.012, 'vendGlow', L.wall, 0, ((i * 37) % 5 - 2) * 0.012)
    room.box(0.02, 0.02, 0.03, 0.6 + i * 0.26, 1.97, w / 2 - WALL - 0.015, 'metalDark', L.frame)
    if (menu[i]) room.label(menu[i], 0.6 + i * 0.26, 1.72, w / 2 - WALL - 0.021 - LIFT, 0.13, 0.4 - (i % 2) * 0.05, '-a')
  }
  // An umbrella stand just inside, with what the last customers forgot.
  const ua = w / 2 - WALL - 0.2
  room.cyl(0.11, 0.1, 0.42, 0.3, 0.21, ua, 'metalDark', L.frame, 12)
  ;(['neonBlue', 'lantern', 'void'] as Token[]).forEach((c, i) => room.box(0.022, 0.78, 0.022, 0.28 + i * 0.03, 0.46, ua - 0.03 + i * 0.03, c, L.goods, (i - 1) * 0.09, (i - 1) * 0.07))
  room.block(0.18, 0.42, 0, 0.45, ua - 0.12, ua + 0.12)

  // The noren hangs just inside the frame, under the wound shutter: five cloth panels, alternately a finger's width forward.
  const top = H - 0.46, n = SHOPS.noren.panels, nw = (w - 0.1) / n
  room.box(0.025, 0.025, w, -0.25, top + 0.012, 0, 'crateKraft', L.timber)
  for (let i = 0; i < n; i++) {
    const u0 = noren.u0 + ((noren.u1 - noren.u0) * i) / n, u1 = noren.u0 + ((noren.u1 - noren.u0) * (i + 1)) / n
    const k = u.side === 1 ? i : n - 1 - i // the strip faces the street from either wall: keep the reading order
    quads.push({ x: room.x(-0.25 - (i % 2) * 0.02), y: Y0 + top - SHOPS.noren.drop / 2, z: room.z(-(w - 0.1) / 2 + (k + 0.5) * nw), w: nw - 0.02, h: SHOPS.noren.drop, ry: room.out, rect: { ...noren, u0, u1 } })
  }
  const m = SHOPS.margin
  return [room.zone(-1.5, D - m, -w / 2 + m, w / 2 - m)] // the whole front is open
}

/**
 * §3.8 — the two open units. Scenery, not content: nothing here is clickable or
 * raycast against. Both can be walked into. No dynamic light is spent: the rooms
 * are lit by a bake, computed once at mount, and drawn with an unlit material.
 */
export function Shops() {
  const m = mats()
  const built = useMemo(() => {
    const store = UNITS.find((u) => u.shop === 'konbini')
    const diner = UNITS.find((u) => u.shop === 'restaurant')
    const dinerText = diner?.signBox && diner.signBox.lit ? diner.signBox.string : ''
    const atlas = buildAtlas([storeSignCell(), norenCell(dinerText)])
    const [sign, noren] = atlas.rects
    const tex = toTexture(atlas.canvas)
    // One atlas for everything printed in the store: N designs, hundreds of labels, one draw call.
    const SL = STORE_LABELS
    const tint = (i: number) => PALETTE[GOODS[i % GOODS.length]]
    const cells = [
      ...SL.products.map((word, i) => productCell(word, tint(i))),
      ...SL.prices.map(priceCell),
      ...SL.magazines.map((word, i) => magazineCell(word, tint(i * 3 + 1))),
      ...SL.aisles.map((word) => wordCell(word, PALETTE.neonBlue, PALETTE.signWhite)),
      ...SL.chillers.map((word) => wordCell(word, PALETTE.signWhite, PALETTE.neonBlue)),
      ...SL.posters.map((word, i) => posterCell(word, i ? PALETTE.neonBlue : PALETTE.lantern)),
      wordCell(SL.till, PALETTE.lantern, PALETTE.signWhite), wordCell(SL.hot, PALETTE.lantern, PALETTE.vendGlow), wordCell(SL.freezer, PALETTE.neonBlue, PALETTE.signWhite),
      ...RESTAURANT_LABELS.bottles.map((word, i) => productCell(word, i % 2 ? PALETTE.sodium : PALETTE.lantern)),
      ...RESTAURANT_LABELS.menu.map((i) => tagCell(SIGNAGE[i])),
    ]
    const labelAtlas = buildAtlas(cells)
    let at = 0
    const take = (n: number) => labelAtlas.rects.slice(at, (at += n))
    const products = take(SL.products.length)
    const drinks = products.filter((_, i) => (SL.drinks as readonly string[]).includes(SL.products[i]))
    const art: Art = { products, drinks, prices: take(SL.prices.length), magazines: take(SL.magazines.length), aisles: take(SL.aisles.length), chillers: take(SL.chillers.length), posters: take(SL.posters.length), till: take(1)[0], hot: take(1)[0], freezer: take(1)[0] }
    const barBottles = take(RESTAURANT_LABELS.bottles.length), menuTags = take(RESTAURANT_LABELS.menu.length)
    const labelParts: THREE.BufferGeometry[] = []
    const glow = new MeshBuilder()
    const quads: Quad[] = [], signs: Quad[] = [], glass: Quad[] = [], pools: BoxInst[] = []
    const zones: Box[] = [], solid: Box[] = [], parts: THREE.BufferGeometry[] = []
    if (store) {
      const room = new Room(store, glow, seeded(311))
      room.art = art
      room.drinks = art.drinks
      zones.push(...buildStore(room, signs, glass, sign))
      solid.push(...room.solid)
      parts.push(room.finish(LIGHT.store.ambient))
      labelParts.push(room.finishLabels(LIGHT.store.ambient))
    }
    if (diner) {
      const room = new Room(diner, glow, seeded(419))
      room.drinks = barBottles
      zones.push(...buildRestaurant(room, quads, noren, menuTags))
      solid.push(...room.solid)
      parts.push(room.finish(LIGHT.restaurant.ambient))
      labelParts.push(room.finishLabels(LIGHT.restaurant.ambient))
    }
    if (!glow.empty) parts.push(glow.build())
    // What falls out of each doorway onto the pavement and the road: painted, not lit.
    const K = LAYOUT.kerb
    for (const [u, token] of [[store, 'signWhite'], [diner, 'vendGlow']] as const) {
      if (!u) continue
      const color = tokenColor(token)
      pools.push({ x: offWall(u.side, K.width / 2), y: K.height + 0.012, z: u.apertureZ, sx: K.width, sy: 1, sz: u.apertureWidth + 0.8, color })
      pools.push({ x: offWall(u.side, K.width + SHOPS.pool.reach / 2 - 0.3), y: 0.013, z: u.apertureZ, sx: SHOPS.pool.reach, sy: 1, sz: u.apertureWidth + 1.6, color })
    }
    return {
      zones, solid, pools,
      labels: (labelParts.length ? mergeGeometries(labelParts, false) : null) ?? new THREE.BufferGeometry(),
      labelMat: new THREE.MeshBasicMaterial({ map: toTexture(labelAtlas.canvas), vertexColors: true }),
      painted: (parts.length ? mergeGeometries(parts, false) : null) ?? new THREE.BufferGeometry(),
      quads: quadsGeometry(quads), quadMat: new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color().setScalar(EMISSIVE.shopInterior) }),
      signs: quadsGeometry(signs), signMat: new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color().setScalar(EMISSIVE.shopSign) }),
      glass: quadsGeometry(glass),
      glassMat: new THREE.MeshStandardMaterial({ color: PALETTE.rain, ...MATERIALS.glass, transparent: true, opacity: SHOPS.glassOpacity, depthWrite: false }),
      poolMat: new THREE.MeshBasicMaterial({ map: paintPool(), transparent: true, opacity: SHOPS.pool.opacity, depthWrite: false }),
    }
  }, [])

  useEffect(() => {
    const offZones = addZones(built.zones), offBoxes = addBoxes(built.solid)
    return () => { offZones(); offBoxes() }
  }, [built])

  return (
    <>
      <mesh geometry={built.painted} material={m.painted} raycast={noRaycast} />
      <mesh geometry={built.labels} material={built.labelMat} raycast={noRaycast} />
      <mesh geometry={built.quads} material={built.quadMat} raycast={noRaycast} />
      <mesh geometry={built.signs} material={built.signMat} raycast={noRaycast} />
      <mesh geometry={built.glass} material={built.glassMat} raycast={noRaycast} renderOrder={6} />
      <Instanced items={built.pools} geometry={FLOOR_PLANE} renderOrder={3}><primitive object={built.poolMat} attach="material" /></Instanced>
    </>
  )
}
