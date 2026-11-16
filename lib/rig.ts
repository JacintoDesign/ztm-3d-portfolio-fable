import { BEND, CAMERA, SHOWCASE, STATIONS, TOUR, deg, type StopId } from './world'
import { pitchToward, yawToward, wrapAngle } from './math'
import { getState, releaseLock, setState } from './store'
import { prefersReducedMotion, resolveTier } from './tier'

// The camera rig: one mutable object the frame loops write and everything else
// reads directly. Nothing here passes through React state.
export type Pose = { x: number; z: number; yaw: number; pitch: number }
type Glide = { fx: number; fz: number; fyaw: number; fpitch: number; to: Pose; cx: number; cz: number; t: number; dur: number; linear: boolean }

export const rig = {
  x: CAMERA.spawn.x as number,
  z: CAMERA.spawn.z as number,
  yaw: deg(CAMERA.spawn.yawDeg),
  pitch: deg(CAMERA.spawn.pitchDeg),
  yawTarget: deg(CAMERA.spawn.yawDeg),
  pitchTarget: deg(CAMERA.spawn.pitchDeg),
  vx: 0,
  vz: 0,
  /** Fraction of full walking speed, for head bob and footsteps. */
  speed: 0,
  keys: { x: 0, y: 0 },
  stick: { x: 0, y: 0 },
  glide: null as Glide | null,
  /** performance.now() at which the entry sweep began; 0 when none. */
  sweepStart: 0,
  /** Bumped by any movement input, above the canControl gate. */
  moveTick: 0,
  /** Bumped when a glide finishes. */
  arriveTick: 0,
  /** Pixels the pointer travelled in the last look-drag — the click guard. */
  dragPx: 0,
  /** Height of the ground under the visitor, eased: road, pavement, or a shop floor. */
  floor: 0,
  /** Development aid: park the traffic at its §13 hold positions. */
  holdTraffic: false,
}

// §2.1.1 — the locked pose, authored in the board's own frame.
export const boardCentre = () => BEND.point(SHOWCASE.t)
function workPose(): Pose {
  // Orientation is live (§15.1): the same button stands a laptop closer than a phone held upright.
  const landscape = typeof window !== 'undefined' && window.innerWidth > window.innerHeight
  const { lateral } = SHOWCASE.lock
  const standoff = landscape ? SHOWCASE.lock.standoffLandscape : SHOWCASE.lock.standoff
  const p = BEND.point(SHOWCASE.t + lateral, standoff)
  const c = boardCentre()
  const dist = Math.hypot(c.x - p.x, c.z - p.z)
  // Pitch from the centre of the board's angular extent, not its geometric centre.
  const lo = Math.atan((SHOWCASE.titleSign.y[0] - CAMERA.eyeHeight) / dist)
  const hi = Math.atan((SHOWCASE.screen.y[1] + SHOWCASE.screen.bezel - CAMERA.eyeHeight) / dist)
  return { x: p.x, z: p.z, yaw: yawToward(p.x, p.z, c.x, c.z), pitch: (lo + hi) / 2 }
}

export function stopPose(id: StopId): Pose {
  switch (id) {
    case 'spawn':
      return { x: CAMERA.spawn.x, z: CAMERA.spawn.z, yaw: deg(CAMERA.spawn.yawDeg), pitch: deg(CAMERA.spawn.pitchDeg) }
    case 'about': {
      const s = STATIONS.cart
      return { x: s.stop.x, z: s.stop.z, yaw: deg(s.stop.yawDeg), pitch: pitchToward(CAMERA.eyeHeight, s.aimY, Math.abs(s.x - s.stop.x)) }
    }
    case 'work':
      return workPose()
    case 'contact': {
      const s = STATIONS.mailbox
      const at = s.stop[resolveTier()]
      return { x: at.x, z: at.z, yaw: deg(s.stop.yawDeg), pitch: pitchToward(CAMERA.eyeHeight, s.aimY, Math.abs(s.x - at.x)) }
    }
    case 'gate': {
      const s = STATIONS.gate
      return { x: s.stop.x, z: s.stop.z, yaw: deg(s.stop.yawDeg), pitch: pitchToward(CAMERA.eyeHeight, s.aimY, s.standoff) }
    }
  }
}

function setPose(p: Pose) {
  rig.x = p.x
  rig.z = p.z
  rig.yaw = rig.yawTarget = p.yaw
  rig.pitch = rig.pitchTarget = p.pitch
  rig.vx = rig.vz = 0
}

/**
 * The one camera primitive: a target pose, an ease and a release. §2.1.1's
 * locked view is its first consumer; §12.6's guided path is the same thing in
 * sequence. `walkUp` is a visitor pressing E — §13 moves that linearly rather
 * than jumping, because it starts from wherever they happen to be standing.
 */
export function travelTo(stop: StopId, walkUp = false) {
  const s = getState()
  if (s.mode === 'loading') return
  const to = stopPose(stop)
  const reduced = prefersReducedMotion()
  const dist = Math.hypot(to.x - rig.x, to.z - rig.z)
  setState({ mode: 'locked', overlay: null, lock: { stop, arrived: false }, tourIndex: TOUR.order.indexOf(stop), hoverChannel: null })

  if (reduced && !walkUp) {
    // §12.6 — jump, with a 180 ms fade through void.
    setState({ fade: true })
    window.setTimeout(() => {
      setPose(to)
      rig.glide = null
      rig.arriveTick++
      setState({ fade: false })
    }, TOUR.reducedFadeMs)
    return
  }
  const dur = walkUp ? Math.max(SHOWCASE.lock.easeMs / 1000, dist / TOUR.glideSpeed) : Math.max(TOUR.minLegSec, dist / TOUR.glideSpeed)
  // A quadratic through the alley centre, so a long leg never clips a wall.
  const long = dist > 8
  rig.glide = {
    fx: rig.x, fz: rig.z, fyaw: rig.yaw, fpitch: rig.pitch, to,
    cx: long ? 0 : (rig.x + to.x) / 2,
    cz: (rig.z + to.z) / 2,
    t: 0, dur, linear: reduced,
  }
  rig.vx = rig.vz = 0
}

/** Hand the heading back to the visitor exactly where the camera is looking. */
export function syncLookTargets() {
  rig.yaw = wrapAngle(rig.yaw)
  rig.yawTarget = rig.yaw
  rig.pitchTarget = rig.pitch
}

export function nextStop() {
  const i = (getState().tourIndex + 1) % TOUR.order.length
  travelTo(TOUR.order[i])
}

/** Release a held or travelling view: control goes back to the visitor, facing where they were left. */
export function release() {
  rig.glide = null
  syncLookTargets()
  releaseLock()
}
