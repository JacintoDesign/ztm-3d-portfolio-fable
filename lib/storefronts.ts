import { DOORWAY_SURROUND, LAYOUT, NEON_SIGNS, SHOPS, SIGN_CLEAR_AIR, SIGNAGE, STOREFRONT, type Token } from './world'
import { seeded } from './math'

// §3.4 — layout is generated, not placed. Deterministic: same walls on every load.
export type Wall = 'west' | 'east'
export type Unit = {
  index: number
  wall: Wall
  /** +1 east, −1 west: the sign of the wall's x. */
  side: 1 | -1
  z: number
  width: number
  doorSide: 1 | -1
  doorwayZ: number
  apertureZ: number
  apertureWidth: number
  state: 'closed' | 'ajar' | 'open'
  /** §3.8 — the two units with a room behind the shutter. */
  shop?: 'konbini' | 'restaurant'
  awning: boolean
  signBox: null | { lit: false } | { lit: true; color: Token; string: string }
}
export type Joint = { wall: Wall; side: 1 | -1; z: number; width: number }

const S = STOREFRONT
const AJAR: number[] = [] // §3.8 — every half-shut shutter came down
// Never the west wall's southmost units: §2.1.1's locked pose stands under them looking at the board.
const AWNING = [1, 3, 8, 10, 12]
/** §4's ratio over the seven lit boxes → 4 / 2 / 1 / 0; the two tokens in a bucket alternate. */
const BOX_COLORS: Token[] = ['neonMagenta', 'sodium', 'neonPink', 'neonCyan', 'neonMagenta', 'lantern', 'neonPink']

function segmentsOf(wall: Wall): [number, number][] {
  const out: [number, number][] = []
  let from: number = LAYOUT.alley.z[0]
  for (const [a, b] of S.reserved[wall]) {
    out.push([from, a])
    from = b
  }
  out.push([from, LAYOUT.alley.z[1]])
  return out
}

function placeWall(wall: Wall, rand: () => number, startIndex: number) {
  const side = wall === 'east' ? 1 : -1
  const segs = segmentsOf(wall)
  const total = segs.reduce((s, [a, b]) => s + (b - a), 0)
  // Apportion the seven units across segments by length — largest remainder.
  const exact = segs.map(([a, b]) => ((b - a) / total) * S.perWall)
  const counts = exact.map(Math.floor)
  const order = exact.map((v, i) => [v - Math.floor(v), i] as const).sort((p, q) => q[0] - p[0])
  for (let k = 0; counts.reduce((s, c) => s + c, 0) < S.perWall; k++) counts[order[k % order.length][1]]++

  const units: Unit[] = []
  const joints: Joint[] = []
  let prev = 0
  let index = startIndex
  segs.forEach(([a, b], si) => {
    const n = counts[si]
    if (!n) return
    const gap = si === 0 ? S.serviceGap : 0 // one service gap per wall, in its first segment
    let remaining = b - a - gap - 0.12 * (n + 1)
    const widths: number[] = []
    for (let slot = 0; slot < n; slot++) {
      const left = n - slot
      // Aim at the fair share of what is left, not the largest that fits.
      const target = remaining / left
      const feasible = S.widths.filter((w) => w !== prev && remaining - w >= (left - 1) * S.widths[0])
      const pool = feasible.length ? feasible : [S.widths[0]]
      const ranked = [...pool].sort((p, q) => Math.abs(p - target) - Math.abs(q - target))
      const w = ranked.length > 1 && rand() < 0.5 && ranked[1] <= target + 0.7 ? ranked[1] : ranked[0]
      widths.push(w)
      remaining -= w
      prev = w
    }
    const slack = b - a - gap - widths.reduce((s, w) => s + w, 0)
    const joint = slack / (n + 1)
    const serviceAt = Math.min(2, n - 1)
    let z = a
    widths.forEach((width, i) => {
      const jw = joint + (gap && i === serviceAt ? gap : 0)
      joints.push({ wall, side, z: z + jw / 2, width: jw })
      z += jw
      const centre = z + width / 2
      const usable = width - 2 * S.pierWidth
      const doorSide = (index % 2 === 0 ? 1 : -1) as 1 | -1
      const apertureWidth = usable - DOORWAY_SURROUND - S.doorway.gap
      units.push({
        index, wall, side, z: centre, width, doorSide,
        doorwayZ: centre + doorSide * (usable / 2 - DOORWAY_SURROUND / 2),
        apertureZ: centre - doorSide * (usable / 2 - apertureWidth / 2),
        apertureWidth,
        state: index === SHOPS.konbini.unit || index === SHOPS.restaurant.unit ? 'open' : AJAR.includes(index) ? 'ajar' : 'closed',
        ...(index === SHOPS.konbini.unit ? { shop: 'konbini' as const } : index === SHOPS.restaurant.unit ? { shop: 'restaurant' as const } : null),
        awning: AWNING.includes(index),
        signBox: { lit: false },
      })
      index++
      z += width
    })
    joints.push({ wall, side, z: z + joint / 2, width: joint })
  })
  return { units, joints }
}

// §3.5 — the nine signs are resolved here because §3.4's sign boxes yield to them.
export type NeonSign = {
  index: number
  wall: Wall
  side: 1 | -1
  z: number
  vertical: boolean
  string: string
  color: Token
  width: number
  height: number
  /** Distance from the wall to the panel's inner edge. */
  projection: number
  baseY: number
  flicker: boolean
}
function buildSigns(): NeonSign[] {
  const N = NEON_SIGNS
  const stride = (N.z[1] - N.z[0]) / (N.count - 1)
  return Array.from({ length: N.count }, (_, i) => {
    const vertical = !(N.horizontalIndices as readonly number[]).includes(i)
    const string = SIGNAGE[i]
    const chars = [...string].length
    const wall: Wall = i % 2 === 0 ? 'west' : 'east'
    return {
      index: i, wall, side: wall === 'east' ? 1 : -1,
      z: N.z[0] + stride * i,
      vertical, string, color: N.colors[i],
      width: vertical ? N.vertical.width : chars * N.horizontal.perChar + N.horizontal.padding,
      height: vertical ? chars * N.vertical.perChar + N.vertical.padding : N.horizontal.height,
      projection: N.projection[0] + ((i * 7) % 5) / 4 * (N.projection[1] - N.projection[0]),
      baseY: N.mountY[0] + (((i * 5) % 9) / 8) * (vertical ? 0.9 : N.mountY[1] - N.mountY[0] - 0.6),
      flicker: (N.flicker as readonly number[]).includes(i),
    }
  })
}

function build() {
  const rand = seeded(S.seed)
  const west = placeWall('west', rand, 0)
  const east = placeWall('east', rand, S.perWall)
  const units = [...west.units, ...east.units]
  const joints = [...west.joints, ...east.joints]
  const signs = buildSigns()

  // A sign box is suppressed wherever a neon sign claims its span plus clear air —
  // resolved before the lit boxes are dealt, so the count survives the suppression.
  const half = S.signBox.size[0] / 2 + SIGN_CLEAR_AIR + NEON_SIGNS.thickness / 2
  for (const u of units) {
    if (signs.some((s) => s.wall === u.wall && Math.abs(s.z - u.doorwayZ) < half)) u.signBox = null
  }
  // The store carries its name on a full-width fascia sign, so its doorway box goes.
  for (const u of units) if (u.shop === 'konbini') u.signBox = null
  const candidates = units.filter((u) => u.signBox)
  const lit = candidates.filter((u) => u.state !== 'closed')
  const closed = candidates.filter((u) => u.state === 'closed')
  for (let k = 0; lit.length < S.signBox.lit && closed.length; k++) {
    lit.push(closed.splice(Math.floor((k * 3) % closed.length), 1)[0])
  }
  lit.sort((p, q) => p.index - q.index).forEach((u, i) => {
    u.signBox = { lit: true, color: BOX_COLORS[i % BOX_COLORS.length], string: SIGNAGE[14 + i] }
  })
  return { units, joints, signs }
}

export const { units: UNITS, joints: JOINTS, signs: SIGNS } = build()

/** World x of a point `proud` metres off a wall's inner face. */
export const offWall = (side: 1 | -1, proud: number) => side * (LAYOUT.alley.x[1] - proud)
/** Centre of a sign's panel in world space. */
export function signCentre(s: NeonSign) {
  return { x: offWall(s.side, s.projection + s.width / 2), y: s.baseY + s.height / 2, z: s.z }
}
