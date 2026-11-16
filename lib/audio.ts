import { AUDIO } from './world'

// §14.2 — synthesised, never sampled: no audio file ships. Three gain stages,
// three jobs: each bed's own level, the shared master, and a mute switch.
let ctx: AudioContext | null = null
let master: GainNode | null = null
let mute: GainNode | null = null
let noise: AudioBuffer | null = null
let started = false

export const readMuted = () => {
  try { return localStorage.getItem(AUDIO.muteKey) === '1' } catch { return false }
}

/** Must be called synchronously inside a real user gesture. */
export function unlock() {
  if (ctx) return
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  if (!AC) return
  ctx = new AC()
  mute = ctx.createGain()
  mute.gain.value = readMuted() ? 0 : 1
  mute.connect(ctx.destination)
  master = ctx.createGain()
  master.gain.value = AUDIO.master
  master.connect(mute)
  // White noise has no periodicity for a loop seam to expose.
  const len = Math.floor(ctx.sampleRate * AUDIO.beds.rain.bufferSec)
  noise = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = noise.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
}

export function startBeds() {
  if (!ctx || !master || !noise || started) return
  started = true
  const R = AUDIO.beds.rain
  const src = ctx.createBufferSource()
  src.buffer = noise
  src.loop = true
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = R.cutoff
  lp.Q.value = R.q
  // The wobble is on the filter's cutoff, not the gain: brightness drifts, loudness does not.
  const lfo = ctx.createOscillator()
  lfo.frequency.value = R.lfoHz
  const depth = ctx.createGain()
  depth.gain.value = R.lfoDepth
  lfo.connect(depth).connect(lp.frequency)
  const g = ctx.createGain()
  g.gain.value = R.gain
  src.connect(lp).connect(g).connect(master)
  src.start()
  lfo.start()

  // Low city hum: two detuned sines an octave under mains.
  const hum = ctx.createGain()
  hum.gain.value = AUDIO.beds.hum.gain
  hum.connect(master)
  for (const f of [55, 82.4]) {
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.value = f
    o.connect(hum)
    o.start()
  }
}

// The preference is its own tiny external store, read before the button ever shows a state.
let mutedCache: boolean | null = null
const mutedListeners = new Set<() => void>()
export const getMuted = () => (mutedCache ??= readMuted())
export const subscribeMuted = (cb: () => void) => { mutedListeners.add(cb); return () => { mutedListeners.delete(cb) } }

export function setMuted(m: boolean) {
  mutedCache = m
  mutedListeners.forEach((l) => l())
  try { localStorage.setItem(AUDIO.muteKey, m ? '1' : '0') } catch {}
  if (mute && ctx) mute.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.02)
}

function burst(gain: number, freq: number, q: number, dur: number) {
  if (!ctx || !master || !noise) return
  const src = ctx.createBufferSource()
  src.buffer = noise
  const f = ctx.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = freq
  f.Q.value = q
  const g = ctx.createGain()
  const t = ctx.currentTime
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(f).connect(g).connect(master)
  src.start(t, Math.random() * 4, dur + 0.02)
}
let step = 0
/** Footsteps on wet ground — a four-voice round-robin. */
export const footstep = () => burst(AUDIO.beds.footsteps.gain, [520, 640, 470, 590][step++ % 4], 0.9, 0.11)
/** Interact / open — one soft click. */
export const click = () => burst(AUDIO.beds.click.gain, 1800, 2.2, 0.05)
/** Mailbox flap. */
export const flap = () => burst(AUDIO.beds.flap.gain, 900, 1.4, 0.09)
