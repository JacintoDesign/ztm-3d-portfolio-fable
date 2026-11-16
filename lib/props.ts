import { CAMERA, LAYOUT, PROPS, STOREFRONT, type Token } from './world'
import { JOINTS, UNITS, SIGNS } from './storefronts'
import { boxAround, type Box } from './collision'

// §3.7 — where things stand. Positions are authored (a list this short is
// better read than generated); the standpipes alone come off §3.4's joints.
const K = LAYOUT.kerb.height
const back = PROPS.wallBackX
type Side = 1 | -1

export const VENDING: { side: Side; z: number }[] = [
  { side: 1, z: 6.0 }, // the slot §3.4 reserves on the east wall
  { side: -1, z: -9.4 },
  { side: 1, z: -17.2 },
  { side: -1, z: 7.4 },
]
export const SCOOTERS: { side: Side; z: number; yaw: number }[] = [
  { side: -1, z: -15.6, yaw: 0.06 },
  { side: 1, z: -1.2, yaw: Math.PI - 0.05 }, // clear of §3.8's store front
  { side: -1, z: 0.4, yaw: Math.PI + 0.08 }, // clear of §3.8's restaurant
  { side: 1, z: 12.6, yaw: -0.04 },
]
/** Stacks of 2–4, on a fixed authored run of the four shades. */
export const CRATES: { side: Side; z: number; n: number; shade: number; turn: number }[] = [
  { side: 1, z: -19.6, n: 3, shade: 0, turn: 0.1 },
  { side: -1, z: -18.0, n: 2, shade: 1, turn: -0.2 },
  { side: -1, z: -17.4, n: 4, shade: 2, turn: 0.05 },
  { side: 1, z: -9.0, n: 2, shade: 3, turn: 0.3 },
  { side: -1, z: -3.8, n: 3, shade: 1, turn: -0.08 },
  { side: 1, z: 1.4, n: 4, shade: 0, turn: 0.15 },
  { side: 1, z: 2.0, n: 2, shade: 2, turn: -0.25 },
  { side: -1, z: 10.6, n: 3, shade: 3, turn: 0.12 },
  { side: 1, z: 15.4, n: 2, shade: 1, turn: -0.1 },
]
// Cones stand where the thing being coned off is: the kerb, 0.05 clear of it.
const coneX = -(LAYOUT.kerb.innerEdgeX - 0.05 - PROPS.cone.foot / 2)
export const CONES = [{ x: coneX, z: -2.9 }, { x: coneX, z: -0.7 }]
export const BARRIER = { x: coneX, z: -1.8 }
export const BINS: { side: Side; z: number }[] = [{ side: 1, z: -11.6 }, { side: -1, z: 18.3 }]
export const POLES: { side: Side; z: number }[] = [{ side: -1, z: -12.4 }, { side: 1, z: 9.6 }]
export const STEAM_VENTS = [{ x: -2.6, z: -8.2 }, { x: 2.7, z: 4.4 }, { x: -2.4, z: 16.4 }]

const litSpans = UNITS.filter((u) => u.signBox?.lit).map((u) => ({ wall: u.wall, z: u.doorwayZ }))

/** Standpipes: §3.4's joints first, then unit edges, until the inventory's 22. */
export const STANDPIPES: { side: Side; z: number; top: number }[] = (() => {
  const anchors: { side: Side; z: number }[] = JOINTS.map((j) => ({ side: j.side, z: j.z }))
  for (const u of UNITS) {
    if (anchors.length >= PROPS.standpipe.count) break
    if (u.index % 3 === 0) anchors.push({ side: u.side, z: u.z - (u.doorSide * u.width) / 2 + u.doorSide * 0.12 })
  }
  // A mast never stands in front of a lit sign's face.
  const safe = anchors.filter((p) => !litSpans.some((s) => (s.wall === 'east' ? 1 : -1) === p.side && Math.abs(s.z - p.z) < STOREFRONT.signBox.size[0] / 2 + PROPS.mastSignClearance))
  return safe.slice(0, PROPS.standpipe.count).map((p, i) => ({ ...p, top: PROPS.standpipe.tops[i % 2] }))
})()

// A lantern hangs clear of everything that shares its height on the wall: every sign box (lit or
// not — an unlit one is still a box 0.49 proud), every projecting sign, and every standpipe.
const boxSpans = UNITS.filter((u) => u.signBox).map((u) => ({ side: u.side, z: u.doorwayZ }))
const clear = (side: Side, z: number) => {
  const half = STOREFRONT.signBox.size[0] / 2 + 0.25 + PROPS.lantern.r
  const pipe = PROPS.lantern.r + PROPS.standpipe.r + 0.12
  let out = z
  for (let pass = 0; pass < 6; pass++) {
    for (const s of boxSpans) if (s.side === side && Math.abs(s.z - out) < half) out = s.z + half + 0.05
    for (const s of SIGNS) if (s.side === side && Math.abs(s.z - out) < 0.7) out = s.z + 0.75
    for (const s of STANDPIPES) if (s.side === side && Math.abs(s.z - out) < pipe) out = s.z + pipe + 0.03
  }
  return out
}
/** `base` is how far the thing a lantern is bolted to stands off the wall: a unit's fascia, or the bare wall in a joint. */
export const LANTERNS: { side: Side; z: number; base: number }[] = (
  [[-1, -21.4], [1, -18.6], [-1, -13.2], [1, -8.4], [-1, -5.6], [1, -1.2], [-1, 4.6], [1, 8.2], [-1, 12.2], [1, 16.6], [1, 21.2]] as [Side, number][]
).map(([side, z0]) => {
  const z = clear(side, z0)
  const onUnit = UNITS.some((u) => u.side === side && Math.abs(u.z - z) < u.width / 2 + 0.02)
  return { side, z, base: onUnit ? STOREFRONT.frameProud : 0 }
})

/** §2.2 — the cart stands off the wall by its own figure, clear of the doorway frames behind it. */
const cartDepth = PROPS.cart.size[1]
export const CART_X = { front: LAYOUT.alley.x[1] - PROPS.cart.standoff - cartDepth, centre: LAYOUT.alley.x[1] - PROPS.cart.standoff - cartDepth / 2 }
/** A small paper lantern hung off the cart's north end. */
export const CART_LANTERN = { x: CART_X.front + 0.12, y: 1.62, z: PROPS.cart.z - PROPS.cart.size[0] / 2 - 0.14 }

export const wallX = (side: Side, depth: number) => side * (back - depth / 2)
export const KERB_TOP = K

/** §12.4 — boxes on everything solid here. */
export function propBoxes(): Box[] {
  const out: Box[] = []
  const [vl, vd] = PROPS.vending.size
  for (const v of VENDING) out.push(boxAround(wallX(v.side, vd), v.z, vd, vl))
  // The cart, plus the shafts it is pushed by at its north end.
  out.push(boxAround(CART_X.centre, PROPS.cart.z - 0.22, PROPS.cart.size[1], PROPS.cart.size[0] + 0.44))
  for (const s of SCOOTERS) out.push(boxAround(wallX(s.side, 0.7), s.z, 0.7, PROPS.scooter.length))
  for (const c of CRATES) out.push(boxAround(wallX(c.side, 0.5), c.z, 0.5, 0.56))
  for (const c of CONES) out.push(boxAround(c.x, c.z, PROPS.cone.foot, PROPS.cone.foot))
  out.push(boxAround(BARRIER.x, BARRIER.z, 0.3, PROPS.barrier.board[0]))
  for (const b of BINS) out.push(boxAround(wallX(b.side, 0.64), b.z - 0.02, 0.8, 2.4))
  for (const p of POLES) out.push(boxAround(p.side * PROPS.pole.x, p.z, PROPS.pole.r * 2, PROPS.pole.r * 2))
  const g = PROPS.guardrail
  out.push({ minX: g.x[0], maxX: g.x[1], minZ: g.z - g.post / 2, maxZ: g.z + g.post / 2 })
  return out
}

export type Shade = Token
export const EYE = CAMERA.eyeHeight
