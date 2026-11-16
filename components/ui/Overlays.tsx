'use client'
import { useEffect, useRef } from 'react'
import type { Content } from '@/lib/content'
import { closeOverlay, useStore } from '@/lib/store'

const linkProps = (url: string) => (url.startsWith('mailto:') ? { href: url } : { href: url, target: '_blank', rel: 'noopener noreferrer' })
const eyebrow = 'text-[10px] uppercase tracking-[0.22em] text-dim'

function About({ about }: { about: Content['about'] }) {
  return (
    <>
      <p className={eyebrow}>{about.eyebrow}</p>
      <h2 id="overlay-title" className="mt-3 text-balance font-sans text-2xl font-semibold leading-tight text-ink sm:text-3xl">{about.heading}</h2>
      <p className="mt-3 text-xs leading-relaxed text-warm">{about.role}</p>
      <p className="mt-1 text-xs text-dim">{about.tagline} · {about.location}</p>
      <dl className="mt-6 grid grid-cols-3 gap-2">
        {about.stats.map((s) => (
          <div key={s.label} className="flex flex-col-reverse justify-end rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <dt className="mt-1 text-[10px] uppercase leading-snug tracking-[0.1em] text-dim">{s.label}</dt>
            <dd className="font-sans text-2xl font-semibold text-ink">{s.value}</dd>
          </div>
        ))}
      </dl>
      <ol className="mt-6 space-y-5">
        {about.panels.map((p) => (
          <li key={p.number} className="grid grid-cols-[2.25rem_1fr] gap-x-2">
            <span className="pt-0.5 text-[11px] text-magenta">{p.number}</span>
            <div>
              <h3 className="text-xs uppercase tracking-[0.16em] text-ink">{p.title}</h3>
              <p className="mt-1.5 font-sans text-sm leading-relaxed text-ink/75">{p.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-7 grid gap-3 sm:grid-cols-2">
        {about.courses.map((c) => (
          <a key={c.url} {...linkProps(c.url)} className="group rounded-xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:border-white/30">
            <p className={eyebrow}>{c.label}</p>
            <h3 className="mt-2 font-sans text-sm font-semibold leading-snug text-ink">{c.title}</h3>
            <p className="mt-2 font-sans text-xs leading-relaxed text-ink/65">{c.blurb}</p>
            <p className="mt-3 text-[11px] uppercase tracking-[0.14em] text-cyan group-hover:underline">{c.linkLabel} ↗</p>
          </a>
        ))}
      </div>
    </>
  )
}

function Contact({ contact }: { contact: Content['contact'] }) {
  return (
    <>
      <p className={eyebrow}>Contact · {contact.location}</p>
      <h2 id="overlay-title" className="mt-3 font-sans text-2xl font-semibold leading-tight text-ink sm:text-3xl">{contact.heading}</h2>
      <p className="mt-3 font-sans text-sm leading-relaxed text-ink/75">{contact.supporting}</p>
      <ul className="mt-6 divide-y divide-white/10 border-y border-white/10">
        {contact.channels.map((c) => (
          <li key={c.name}>
            <a {...linkProps(c.url)} className="group flex min-h-12 items-center justify-between gap-4 py-3 select-text">
              <span className="text-[11px] uppercase tracking-[0.16em] text-dim">{c.name}</span>
              <span className="truncate font-sans text-sm text-ink group-hover:text-cyan">{c.handle} <span aria-hidden className="text-dim">↗</span></span>
            </a>
          </li>
        ))}
      </ul>
    </>
  )
}

/**
 * §12.7 — a centred card that starts below the nav rather than covering it.
 * Honestly non-modal: the nav above stays live, so no aria-modal.
 */
export function Overlays({ content }: { content: Content }) {
  const overlay = useStore((s) => s.overlay)
  const card = useRef<HTMLDivElement>(null)
  useEffect(() => { if (overlay === 'about' || overlay === 'contact') card.current?.focus() }, [overlay])
  if (overlay !== 'about' && overlay !== 'contact') return null
  return (
    <div className="anim-pop fixed inset-0 z-30 flex items-start justify-center bg-void/70 px-3 pb-4 pt-[calc(max(0.75rem,env(safe-area-inset-top))+5.75rem)] backdrop-blur-[2px] md:pt-[calc(max(0.75rem,env(safe-area-inset-top))+3.5rem)]" onClick={closeOverlay}>
      <div
        ref={card}
        role="dialog"
        aria-labelledby="overlay-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="card-scroll relative max-h-full w-full max-w-2xl select-text overflow-y-auto rounded-2xl border border-white/10 bg-[#080b12]/95 p-5 shadow-2xl outline-none sm:p-8"
      >
        <button type="button" onClick={closeOverlay} aria-label="Close" className="absolute right-3 top-3 grid size-9 place-items-center rounded-full border border-white/10 text-sm text-white/70 hover:text-white">
          ✕
        </button>
        {overlay === 'about' ? <About about={content.about} /> : <Contact contact={content.contact} />}
      </div>
    </div>
  )
}
