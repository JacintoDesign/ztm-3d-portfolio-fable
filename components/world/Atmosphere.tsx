'use client'
import { useMemo } from 'react'
import { Environment, Lightformer } from '@react-three/drei'
import { ATMOSPHERE, GATE_WALL, LAYOUT, LIGHTS, PALETTE, STREET_LIGHT_TRIM } from '@/lib/world'
import { resolveTier } from '@/lib/tier'
import { SIGNS, signCentre } from '@/lib/storefronts'

/** §5 and §7 — fog, the uniform fill the wet ground reflects, and the street's own lights. */
export function Atmosphere() {
  const mobile = resolveTier() === 'mobile'
  // §7.1 — each alley light takes its position and its colour from the sign it sits on.
  const signLights = useMemo(
    () =>
      LIGHTS.signs.map((l) => {
        const sign = SIGNS[l.sign]
        const c = signCentre(sign)
        const halved = mobile && (LIGHTS.mobileHalved as readonly number[]).includes(l.id)
        return { ...l, position: [c.x, c.y, c.z] as const, color: PALETTE[sign.color], intensity: l.intensity * STREET_LIGHT_TRIM * (halved ? 0.5 : 1) }
      }),
    [mobile],
  )
  const gateZ = LAYOUT.ends.north.z + GATE_WALL.plate.thickness + LIGHTS.gate.standoff
  return (
    <>
      <color attach="background" args={[ATMOSPHERE.background]} />
      <fogExp2 attach="fog" args={[ATMOSPHERE.fog.color, ATMOSPHERE.fog.density]} />
      <hemisphereLight args={[LIGHTS.hemisphere.sky, LIGHTS.hemisphere.ground, LIGHTS.hemisphere.intensity * STREET_LIGHT_TRIM]} />
      {signLights.map((l) => (
        <pointLight key={l.id} position={l.position} color={l.color} intensity={l.intensity} distance={l.distance} decay={LIGHTS.signDecay} />
      ))}
      <pointLight position={[0, GATE_WALL.plate.y, gateZ]} color={LIGHTS.gate.color} intensity={LIGHTS.gate.intensity * STREET_LIGHT_TRIM} distance={LIGHTS.gate.distance} decay={LIGHTS.gate.decay} />
      {/* Lightformers only — no HDRI. Baked once at mount. A uniform fill has no edge, so nothing in it can read as an object. */}
      <Environment resolution={ATMOSPHERE.env.resolution} frames={1} background={false}>
        <color attach="background" args={[ATMOSPHERE.env.fill]} />
        <Lightformer form="rect" scale={[ATMOSPHERE.env.ceiling.size[0], ATMOSPHERE.env.ceiling.size[1], 1]} position={[...ATMOSPHERE.env.ceiling.position]} rotation-x={Math.PI / 2} color={ATMOSPHERE.env.ceiling.color} intensity={ATMOSPHERE.env.ceiling.intensity} />
      </Environment>
    </>
  )
}
