'use client'
import { useEffect } from 'react'
import type { Content } from '@/lib/content'
import { closeOverlay, getState, openOverlay, pageProject, setState, useStore } from '@/lib/store'
import { getStation, nearestFacing } from '@/lib/stations'
import { release, rig } from '@/lib/rig'
import { resolveTier } from '@/lib/tier'
import { click } from '@/lib/audio'
import { STATIONS } from '@/lib/world'
import { useTier } from '@/lib/hooks'

/** May a station be opened right now? Walking, or parked at a stop that is not the board's own view. */
const canInteract = () => {
  const s = getState()
  return s.mode === 'play' || (s.mode === 'locked' && !!s.lock?.arrived && s.lock.stop !== 'work')
}
function openNearest() {
  if (!canInteract()) return
  const station = nearestFacing(rig.x, rig.z, rig.yaw)
  if (!station) return
  click()
  station.open()
}

/**
 * §12.5 — the one owner of the interact key and of Escape. Stations register;
 * this finds the nearest one the visitor is facing. It is also the bridge that
 * turns what the frame loop did (arrived, moved) into store changes, so the
 * frame loop itself never sets state.
 */
export function Interact({ content }: { content: Content }) {
  const tier = useTier()
  const near = useStore((s) => s.nearStation)
  const hover = useStore((s) => s.hoverChannel)
  const mode = useStore((s) => s.mode)
  const lock = useStore((s) => s.lock)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = getState()
      if (s.mode === 'loading') return
      if (e.key === 'Escape') {
        // Escape closes whatever is on top; nothing else may claim it.
        if (s.overlay) closeOverlay()
        else if (s.mode === 'locked') release()
        return
      }
      if (e.repeat || e.metaKey || e.ctrlKey) return
      if (e.code === 'KeyE') return openNearest()
      if (s.mode === 'locked' && s.lock?.stop === 'work' && s.lock.arrived) {
        if (e.key === 'ArrowLeft' || e.key === '[') pageProject(-1)
        if (e.key === 'ArrowRight' || e.key === ']') pageProject(1)
      }
    }
    window.addEventListener('keydown', onKey)

    let arrive = rig.arriveTick, move = rig.moveTick, raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const s = getState()
      if (rig.arriveTick !== arrive) {
        arrive = rig.arriveTick
        if (s.lock && !s.lock.arrived) {
          // Spawn is a turn, not a place to be held: control returns on arrival.
          if (s.lock.stop === 'spawn') release()
          else {
            setState({ lock: { ...s.lock, arrived: true } })
            // §12.7 — on a phone the bank's boxes are not hit targets you can get in front of, so the rows are.
            if (s.lock.stop === 'contact' && resolveTier() === 'mobile') openOverlay('contact')
          }
        }
      }
      if (rig.moveTick !== move) {
        move = rig.moveTick
        if (s.mode === 'locked') release() // the visitor always wins
      }
      const st = s.mode === 'play' || s.mode === 'locked' ? nearestFacing(rig.x, rig.z, rig.yaw) : null
      if ((st?.id ?? null) !== s.nearStation) setState({ nearStation: st?.id ?? null })
    }
    raf = requestAnimationFrame(loop)
    return () => {
      window.removeEventListener('keydown', onKey)
      cancelAnimationFrame(raf)
    }
  }, [])

  // The prompt shows when it has something to say — the test is the text, not the mode.
  let text = ''
  let pressable = false
  const travelling = mode === 'locked' && !lock?.arrived
  if ((mode === 'play' || mode === 'locked') && !travelling && lock?.stop !== 'work') {
    const channel = hover !== null ? content.contact.channels[hover] : null
    if (channel) text = `${channel.name} — ${channel.handle}` // the specific answer beats the general one
    else {
      const station = near ? getStation(near) : null
      if (station) { text = station.prompt[tier]; pressable = true }
    }
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[max(7.5rem,calc(env(safe-area-inset-bottom)+7.5rem))] z-20 flex justify-center px-4 sm:bottom-16">
      <button
        type="button"
        tabIndex={text && pressable ? 0 : -1}
        aria-hidden={!text}
        onClick={pressable ? openNearest : undefined}
        style={{ opacity: text ? 1 : 0, transition: `opacity ${STATIONS.promptFadeMs}ms ease-out` }}
        className={`rounded-full border border-white/15 bg-black/65 px-5 py-2.5 text-xs uppercase tracking-[0.14em] text-ink backdrop-blur-md ${text && pressable ? 'pointer-events-auto hover:border-white/40 hover:bg-black/80' : ''}`}
      >
        {text || '\u00a0'}
      </button>
    </div>
  )
}
