import { deg } from './world'

/** §12.1 — this world's yaw 0 faces +Z; three's faces −Z. Convert once, where a camera or group is posed. */
export const yawToThree = (yaw: number) => yaw + Math.PI
export const forwardOf = (yaw: number) => ({ x: Math.sin(yaw), z: Math.cos(yaw) })
/** The visitor's right at a given yaw. */
export const rightOf = (yaw: number) => ({ x: -Math.cos(yaw), z: Math.sin(yaw) })
export const yawToward = (fx: number, fz: number, tx: number, tz: number) => Math.atan2(tx - fx, tz - fz)
/** §12.6 — a stop's pitch is where you have to look to see the object. */
export const pitchToward = (eyeY: number, targetY: number, standoff: number) => Math.atan((targetY - eyeY) / standoff)

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const wrapAngle = (a: number) => {
  let r = (a + Math.PI) % (Math.PI * 2)
  if (r < 0) r += Math.PI * 2
  return r - Math.PI
}
export { deg }

/** Deterministic generator — nothing in this world uses Math.random(). */
export function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
