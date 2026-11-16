'use client'
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { EMISSIVE, FLICKER, LIGHTS, MATERIALS, PALETTE, SHOWCASE as S, STATIONS, deg, BEND } from '@/lib/world'
import type { Project } from '@/lib/content'
import { yawToThree } from '@/lib/math'
import { pick, prefersReducedMotion, resolveTier } from '@/lib/tier'
import { getState, pageProject, setState } from '@/lib/store'
import { registerStation } from '@/lib/stations'
import { boardCentre, travelTo } from '@/lib/rig'
import { makeCanvas, toTexture } from '@/lib/textures/canvas'
import { paintTitle } from '@/lib/textures/painted'
import { MeshBuilder } from '@/lib/geo'
import { mats } from './materials'
import { noRaycast } from './Instanced'
import { flickerAt } from './surroundings/Signs'

const [W, H] = S.screen.size
const SCREEN_Y = (S.screen.y[0] + S.screen.y[1]) / 2
const TITLE_Y = (S.titleSign.y[0] + S.titleSign.y[1]) / 2
const T = S.transition

/** Downscale a screenshot at runtime to the tier's size. Failure resolves to null — quietly. */
function loadShot(src: string): Promise<THREE.Texture | null> {
  return new Promise((resolve) => {
    if (!src) return resolve(null)
    const img = new Image()
    img.onload = () => {
      const [w, h] = pick(S.image)
      const [canvas, ctx] = makeCanvas(w, h)
      ctx.drawImage(img, 0, 0, w, h)
      resolve(toTexture(canvas))
    }
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/**
 * §2.1 — the board on the bend. One renderer, one project at a time, everything
 * from CONTENT.md; nothing here knows how many projects there are or which.
 */
export function Showcase({ projects }: { projects: Project[] }) {
  const m = mats()
  const reduced = prefersReducedMotion()
  const desktop = resolveTier() === 'desktop'
  const centre = boardCentre()

  const built = useMemo(() => {
    const b = S.screen.bezel, d = S.screen.depth
    const frame = new MeshBuilder(), strip = new MeshBuilder()
    frame.box(W + 2 * b, H + 2 * b, d, 0, SCREEN_Y, d / 2, 'shutter')
    // The bezel is geometry — a frame the screen sits in — and the lit strip is a rung of its own.
    for (const e of [-1, 1]) {
      frame.box(W + 2 * b, b, 0.05, 0, SCREEN_Y + e * (H / 2 + b / 2), d + 0.025, 'metalDark')
      frame.box(b, H, 0.05, e * (W / 2 + b / 2), SCREEN_Y, d + 0.025, 'metalDark')
      const s = S.surroundStrip
      strip.box(W + 2 * b + 2 * s, s, 0.02, 0, SCREEN_Y + e * (H / 2 + b + s / 2), d - 0.01, 'signWhite')
      strip.box(s, H + 2 * b, 0.02, e * (W / 2 + b + s / 2), SCREEN_Y, d - 0.01, 'signWhite')
    }
    const [tw, th, td] = S.titleSign.size
    frame.box(tw + 0.08, th + 0.08, td, 0, TITLE_Y, td / 2, 'shutter')
    const [titleCanvas] = makeCanvas(1024, 256)
    const titleTex = toTexture(titleCanvas)
    return {
      frame: frame.build(), strip: strip.build(), titleCanvas, titleTex,
      // Built flat with no map: failure is the default, and a screenshot that loads replaces it.
      screenMat: new THREE.MeshStandardMaterial({ color: MATERIALS.screenFallback, emissive: '#000000', emissiveIntensity: EMISSIVE.screenshot, roughness: MATERIALS.boardCase.roughness, metalness: 0 }),
      stripMat: new THREE.MeshStandardMaterial({ color: PALETTE.void, emissive: PALETTE.signWhite, emissiveIntensity: EMISSIVE.apertureSurround }),
      titleMat: m.emissivePanel(titleTex, EMISSIVE.titleSign),
    }
  }, [m])

  // Three resident at a time — prev, current, next — whatever the project count.
  const resident = useRef(new Map<number, THREE.Texture | null>())
  const shown = useRef(-1)
  const phase = useRef({ target: -1, t: 0 })

  useEffect(() => {
    setState({ projectCount: projects.length, projectIndex: 0 })
    return registerStation({
      id: 'board', x: centre.x, z: centre.z, radius: STATIONS.board.radius,
      prompt: { desktop: 'E — View Projects', mobile: 'Tap — View Projects' },
      open: () => travelTo('work', true),
    })
  }, [projects.length, centre.x, centre.z])

  // §2.1 — automatic paging, stopped for the session by the first manual page. Off under reduced motion.
  useEffect(() => {
    if (reduced) return
    const id = window.setInterval(() => {
      const s = getState()
      if (s.autoAdvance && s.mode !== 'loading' && !document.hidden) pageProject(1, false)
    }, S.dwellMs)
    return () => window.clearInterval(id)
  }, [reduced])

  const ensure = (index: number) => {
    const n = projects.length
    if (!n) return
    const want = new Set([index, (index + 1) % n, (index - 1 + n) % n])
    for (const [k, tex] of resident.current) if (!want.has(k)) { tex?.dispose(); resident.current.delete(k) }
    for (const k of want) {
      if (resident.current.has(k)) continue
      resident.current.set(k, null)
      loadShot(projects[k].screenshot).then((tex) => {
        if (!resident.current.has(k)) return tex?.dispose()
        resident.current.set(k, tex)
        if (shown.current === k) apply(k)
      })
    }
  }
  const apply = (index: number) => {
    const tex = resident.current.get(index) ?? null
    const mat = built.screenMat
    mat.emissiveMap = tex
    mat.emissive.set(tex ? MATERIALS.screenshotTint : '#000000')
    mat.color.set(tex ? PALETTE.void : MATERIALS.screenFallback)
    mat.needsUpdate = true
    shown.current = index
    paintTitle(built.titleCanvas, projects[index]?.name ?? '', [S.titleSign.size[0], S.titleSign.size[1]])
    built.titleTex.needsUpdate = true
  }

  useFrame((state, delta) => {
    const want = getState().projectIndex
    const p = phase.current
    if (!projects.length) return
    if (want !== p.target) { p.target = want; p.t = shown.current < 0 || reduced ? T.outMs + T.holdMs : 0; ensure(want) }
    const before = p.t
    p.t += delta * 1000
    const swapAt = T.outMs + T.holdMs
    if (before <= swapAt && p.t > swapAt && shown.current !== p.target) apply(p.target)
    // Cut to black, hold, fade up. Reduced motion: a hard cut.
    let k = 1
    if (!reduced) {
      if (p.t < T.outMs) k = 1 - p.t / T.outMs
      else if (p.t < swapAt) k = 0
      else k = Math.min(1, (p.t - swapAt) / T.inMs)
    }
    built.screenMat.emissiveIntensity = EMISSIVE.screenshot * k
    const since = p.t - swapAt
    const strike = !reduced && since > 0 && since < FLICKER.sequence.length * FLICKER.stepMs ? FLICKER.sequence[Math.floor(since / FLICKER.stepMs)] : 1
    built.titleMat.emissiveIntensity = EMISSIVE.titleSign * strike * (reduced ? 1 : flickerAt(state.clock.elapsedTime * 1000, FLICKER.offsets.title))
  })

  const [tw, th, td] = S.titleSign.size
  return (
    <group position={[centre.x, 0, centre.z]} rotation-y={yawToThree(deg(BEND.yawDeg))}>
      <mesh geometry={built.frame} material={m.boardCase} raycast={noRaycast} />
      <mesh geometry={built.strip} material={built.stripMat} raycast={noRaycast} />
      <mesh position={[0, SCREEN_Y, S.screen.depth + 0.004]} material={built.screenMat} raycast={noRaycast}>
        <planeGeometry args={[W, H]} />
      </mesh>
      <mesh position={[0, TITLE_Y, td + 0.003]} material={built.titleMat} raycast={noRaycast}>
        <planeGeometry args={[tw, th]} />
      </mesh>
      {/* §7 light 2 — the screen itself, sized from it. Desktop only: the most expensive light type there is. */}
      {desktop && <rectAreaLight position={[0, SCREEN_Y, S.screen.depth + 0.05]} rotation-y={Math.PI} width={W} height={H} color={LIGHTS.screen.color} intensity={LIGHTS.screen.intensity} />}
      {/* §7 light 3 — the spill from the title lightbox, 0.90 m clear of it so it is not a hotspot. */}
      <pointLight position={[0, TITLE_Y, td + LIGHTS.title.standoff]} color={LIGHTS.title.color} intensity={LIGHTS.title.intensity} distance={LIGHTS.title.distance} decay={LIGHTS.title.decay} />
    </group>
  )
}
