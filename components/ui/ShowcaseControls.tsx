'use client'
import { useEffect, useRef } from 'react'
import type { Project } from '@/lib/content'
import { pageProject, setProject, useStore } from '@/lib/store'
import { release } from '@/lib/rig'
import { click } from '@/lib/audio'
import { usePortraitPhone } from '@/lib/hooks'

/**
 * §2.1.2 — the controls are on the screen, not on the board: paging, N numbered
 * stops, and the door. Present only while the locked view is held, and only
 * once the camera has stopped. N is read from CONTENT.md, never hardcoded.
 */
export function ShowcaseControls({ projects }: { projects: Project[] }) {
  const lock = useStore((s) => s.lock)
  const mode = useStore((s) => s.mode)
  const index = useStore((s) => s.projectIndex)
  const portraitPhone = usePortraitPhone()
  const strip = useRef<HTMLDivElement>(null)
  const visible = mode === 'locked' && lock?.stop === 'work' && lock.arrived

  // Paging keeps the current stop inside the visible window of the strip.
  useEffect(() => {
    strip.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [index, visible])

  const p = projects[index]
  if (!visible || !p) return null
  const page = (d: number) => () => { click(); pageProject(d) }
  const pill = 'pointer-events-auto flex items-center rounded-full border border-white/10 bg-black/65 backdrop-blur-md'
  const action = 'grid h-9 place-items-center rounded-full px-4 text-xs uppercase leading-none tracking-[0.14em]'
  const arrow = 'grid size-9 shrink-0 place-items-center rounded-full text-lg text-white/70 hover:text-white'
  return (
    <section aria-label="Projects" className={`anim-pop pointer-events-none fixed inset-x-0 z-30 flex flex-col items-center gap-2 px-3 ${portraitPhone ? 'bottom-[calc(env(safe-area-inset-bottom)+4.25rem)]' : 'bottom-[max(1rem,env(safe-area-inset-bottom))]'}`}>
      <div className="pointer-events-auto w-full max-w-xl select-text rounded-2xl border border-white/10 bg-black/65 px-4 py-3 backdrop-blur-md">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-sans text-base font-semibold text-ink">{p.name}</h2>
          <p className="shrink-0 text-[10px] uppercase tracking-[0.12em] text-dim">{p.tags.join(' · ')}</p>
        </div>
        <p className="mt-1 font-sans text-[13px] leading-snug text-ink/75">{p.description}</p>
        <p className="mt-1.5 text-[10px] uppercase tracking-[0.1em] text-dim">{p.tech.join(' / ')}</p>
      </div>
      <div className="flex w-full flex-col items-center gap-2 sm:w-auto sm:flex-row">
        <div className={`${pill} max-w-full p-1`}>
          <button type="button" aria-label="Previous project" className={arrow} onClick={page(-1)}>‹</button>
          <div ref={strip} className="no-scrollbar flex gap-1 overflow-x-auto px-1">
            {projects.map((proj, i) => (
              <button
                key={proj.name}
                type="button"
                aria-label={`${proj.name}, project ${i + 1} of ${projects.length}`}
                aria-current={i === index}
                onClick={() => { click(); setProject(i) }}
                className={`grid size-8 shrink-0 place-items-center rounded-full text-[11px] ${i === index ? 'bg-ink text-void' : 'text-white/55 hover:text-white'}`}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <button type="button" aria-label="Next project" className={arrow} onClick={page(1)}>›</button>
        </div>
        <div className={`${pill} gap-1 p-1`}>
          {p.github && <a href={p.github} target="_blank" rel="noopener noreferrer" className={`${action} text-white/70 hover:text-white`}>GitHub</a>}
          {/* The door: the project's real deployment, in a new tab. */}
          {p.url && <a href={p.url} target="_blank" rel="noopener noreferrer" className={`${action} bg-ink font-bold text-void hover:bg-white`}>Open ↗</a>}
          <button type="button" aria-label="Close project view" className={arrow.replace('text-lg', 'text-sm')} onClick={() => { click(); release() }}>✕</button>
        </div>
      </div>
    </section>
  )
}
