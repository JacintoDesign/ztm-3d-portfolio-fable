'use client'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import { ATMOSPHERE, BUDGET, CAMERA, LOOK } from '@/lib/world'
import type { Content } from '@/lib/content'
import { resolveTier } from '@/lib/tier'
import { getState, setState } from '@/lib/store'
import { release, rig } from '@/lib/rig'
import { Ground } from './Ground'
import { Atmosphere } from './Atmosphere'
import { Effects } from './Effects'
import { Surroundings } from './Surroundings'
import { Showcase } from './Showcase'
import { Stations } from './Stations'
import { Camera } from '../player/Camera'
import { Player } from '../player/Player'

THREE.ColorManagement.enabled = true
// A rectAreaLight contributes exactly zero, silently, until its LTC tables are uploaded.
RectAreaLightUniformsLib.init()

/** The single Canvas for the whole world. Loaded through next/dynamic with ssr: false; never server-rendered. */
export default function World({ content }: { content: Content }) {
  const desktop = resolveTier() === 'desktop'
  return (
    <Canvas
      className="!fixed inset-0"
      shadows={false}
      dpr={[1, BUDGET.dpr]}
      gl={{ antialias: desktop, powerPreference: 'high-performance', stencil: false, depth: true }}
      camera={{ fov: CAMERA.fov.landscape, near: CAMERA.near, far: CAMERA.far, position: [CAMERA.spawn.x, CAMERA.eyeHeight, CAMERA.spawn.z] }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = ATMOSPHERE.exposure
        // Ready is the first rendered frames: shader compilation is time on the GPU, not bytes.
        let frames = 0
        const tick = () => (++frames < 4 ? requestAnimationFrame(tick) : setState({ ready: true }))
        requestAnimationFrame(tick)
      }}
      // A tap on empty space releases a held view; a look-drag ending on nothing does not.
      onPointerMissed={() => {
        const s = getState()
        if (s.mode === 'locked' && s.lock?.arrived && rig.dragPx <= LOOK.clickGuardPx) release()
      }}
    >
      <Atmosphere />
      <Ground />
      <Surroundings />
      <Showcase projects={content.projects} />
      <Stations channels={content.contact.channels} />
      <Camera />
      <Player />
      <Effects />
    </Canvas>
  )
}
