'use client'
import { useStore } from '@/lib/store'
import { nextStop, release, travelTo } from '@/lib/rig'
import { click } from '@/lib/audio'
import type { StopId } from '@/lib/world'

const ITEMS: { label: string; stop: StopId }[] = [
  { label: 'About', stop: 'about' },
  { label: 'Work', stop: 'work' },
  { label: 'Contact', stop: 'contact' },
]

/** §12.7 — always present after the gate, on every device. This is what passes the ten-second test. */
export function Nav() {
  const mode = useStore((s) => s.mode)
  const lock = useStore((s) => s.lock)
  if (mode === 'loading') return null
  const go = (fn: () => void) => () => { click(); fn() }
  const item = 'pointer-events-auto rounded-full px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-white/55 transition-colors hover:text-white sm:px-4 sm:text-xs'
  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-40 flex flex-col items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
      {/* Type, not a button: the Latin counterpart to the katakana on the far wall. */}
      <p className="text-[11px] font-bold uppercase tracking-[0.28em] md:absolute md:left-5 md:top-[max(0.75rem,env(safe-area-inset-top))] md:flex md:h-10 md:items-center">
        <span className="text-magenta">Jacinto</span>&nbsp;<span className="text-cyan">Design</span>
      </p>
      <nav aria-label="Destinations" className="flex h-10 items-center rounded-full border border-white/10 bg-black/55 px-1 backdrop-blur-md">
        {ITEMS.map((it) => (
          <button key={it.stop} type="button" className={`${item} ${lock?.stop === it.stop ? '!text-white' : ''}`} onClick={go(() => travelTo(it.stop))}>
            {it.label}
          </button>
        ))}
        <span aria-hidden className="mx-1 h-4 w-px bg-white/15" />
        <button type="button" className={`${item} !text-warm`} onClick={go(nextStop)}>
          Next stop
        </button>
      </nav>
      {mode === 'locked' && (
        <button type="button" onClick={go(release)} className="anim-pop pointer-events-auto rounded-full border border-white/10 bg-black/55 px-4 py-1.5 text-[10px] uppercase tracking-[0.16em] text-white/70 backdrop-blur-md hover:text-white">
          Return to freeroam
        </button>
      )}
    </header>
  )
}
