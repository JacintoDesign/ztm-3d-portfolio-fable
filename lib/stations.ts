import { STATIONS, deg } from './world'
import { wrapAngle } from './math'

// §12.5 — the registry. Stations register on mount; one manager owns the key.
export type Station = {
  id: 'board' | 'cart' | 'mailbox'
  x: number
  z: number
  radius: number
  prompt: { desktop: string; mobile: string }
  open: () => void
}
const stations: Station[] = []

export function registerStation(s: Station) {
  stations.push(s)
  return () => {
    const i = stations.indexOf(s)
    if (i >= 0) stations.splice(i, 1)
  }
}
export const getStation = (id: string) => stations.find((s) => s.id === id) ?? null

const halfCone = deg(STATIONS.facingConeDeg) / 2

/** The nearest registered station in range that the visitor is facing. No fallback behind you. */
export function nearestFacing(x: number, z: number, yaw: number): Station | null {
  let best: Station | null = null
  let bestD = Infinity
  for (let i = 0; i < stations.length; i++) {
    const s = stations[i]
    const dx = s.x - x
    const dz = s.z - z
    const d = Math.hypot(dx, dz)
    if (d > s.radius || d >= bestD) continue
    if (d > 0.4 && Math.abs(wrapAngle(Math.atan2(dx, dz) - yaw)) > halfCone) continue
    best = s
    bestD = d
  }
  return best
}
