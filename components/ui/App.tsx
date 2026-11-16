'use client'
import dynamic from 'next/dynamic'
import type { Content } from '@/lib/content'
import { useStore } from '@/lib/store'
import { TOUR } from '@/lib/world'
import { Gate } from './Gate'
import { Nav } from './Nav'
import { Overlays } from './Overlays'
import { ControlsHint } from './ControlsHint'
import { Interact } from './Interact'
import { ShowcaseControls } from './ShowcaseControls'
import { TouchStick } from './TouchStick'

// The Canvas never server-renders. Everything reachable only through this
// boundary lands in its own async chunk, which is the engine split.
const World = dynamic(() => import('../world/World'), { ssr: false })

function Fade() {
  const on = useStore((s) => s.fade)
  return <div aria-hidden className="pointer-events-none fixed inset-0 z-50 bg-void" style={{ opacity: on ? 1 : 0, transition: `opacity ${TOUR.reducedFadeMs}ms linear` }} />
}

// Development only: a handle for posing the camera from the console while checking the world against the brief.
if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
  void Promise.all([import('@/lib/rig'), import('@/lib/store'), import('@/lib/storefronts')]).then(([r, st, sf]) => Object.assign(window, { __world: { ...r, ...st, ...sf } }))
}

export function App({ content }: { content: Content }) {
  return (
    <main className="fixed inset-0 select-none overflow-hidden bg-void">
      <h1 className="sr-only">Jacinto Design — a walkable portfolio</h1>
      <World content={content} />
      <Interact content={content} />
      <TouchStick />
      <ShowcaseControls projects={content.projects} />
      <Overlays content={content} />
      <Nav />
      <Fade />
      <Gate />
      <ControlsHint />
    </main>
  )
}
