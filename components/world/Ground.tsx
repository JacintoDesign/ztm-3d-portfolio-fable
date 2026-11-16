'use client'
import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { MeshReflectorMaterial } from '@react-three/drei'
import * as THREE from 'three'
import { BEND, GROUND_MAPS, LAYOUT, MATERIALS, PALETTE, REFLECTOR, STOREFRONT, STREET } from '@/lib/world'
import { pick, prefersReducedMotion } from '@/lib/tier'
import { yawToThree, deg } from '@/lib/math'
import { tokenColor, type BoxInst } from '@/lib/geo'
import { groundTextures } from '@/lib/textures/ground'
import { cloneRepeat, withRepeat } from '@/lib/textures/canvas'
import { worldGrained } from './materials'
import { Instanced, noRaycast } from './Instanced'

const [SX0, SX1] = REFLECTOR.strip.x
const [SZ0, SZ1] = REFLECTOR.strip.z
const STRIP_W = SX1 - SX0
const STRIP_L = SZ1 - SZ0
const TILE = GROUND_MAPS.ripple.tile

/** §6 — the ground is the picture: a base plane and one reflector strip, one reflection pass. */
export function Ground() {
  const tier = pick({ desktop: REFLECTOR.desktop, mobile: REFLECTOR.mobile })
  const reduced = prefersReducedMotion()
  const maps = useMemo(() => {
    const t = groundTextures()
    // The two surfaces agree on world tile size, not on repeat count.
    const stripNormal = withRepeat(t.ripple, [STRIP_W / TILE, STRIP_L / TILE])
    const baseNormal = cloneRepeat(t.ripple, [LAYOUT.ground / TILE, LAYOUT.ground / TILE])
    return { ...t, stripNormal, baseNormal, normalScale: new THREE.Vector2(GROUND_MAPS.ripple.normalScale, GROUND_MAPS.ripple.normalScale) }
  }, [])

  useFrame((_, delta) => {
    if (reduced) return
    const d = GROUND_MAPS.ripple.scroll * delta
    maps.stripNormal.offset.y += d
    maps.baseNormal.offset.y = maps.stripNormal.offset.y // same offset, no drift
  })

  const kerbs = useMemo<BoxInst[]>(() => {
    const k = LAYOUT.kerb
    const color = tokenColor('concrete')
    const [z0, z1] = [LAYOUT.facadeZ.east[0], LAYOUT.facadeZ.west[1]]
    const side = (s: number): BoxInst => ({ x: s * (LAYOUT.alley.x[1] - k.width / 2), y: k.height / 2, z: (z0 + z1) / 2, sx: k.width, sy: k.height, sz: z1 - z0, color })
    // The pavement turns the corner: the bend gets the same kerb and plinth, 2 mm low so the join never z-fights.
    const len = LAYOUT.ends.south.returnLength
    const ry = yawToThree(deg(BEND.yawDeg))
    const kc = BEND.point(0, k.width / 2)
    const pc = BEND.point(0, STOREFRONT.plinth.depth / 2)
    const sp = STREET.nearPavement, fp = STREET.farPavement
    return [
      side(1), side(-1),
      { x: kc.x, y: (k.height - 0.002) / 2, z: kc.z, sx: len, sy: k.height - 0.002, sz: k.width, ry, color },
      { x: pc.x, y: k.height + STOREFRONT.plinth.height / 2, z: pc.z, sx: len, sy: STOREFRONT.plinth.height, sz: STOREFRONT.plinth.depth, ry, color },
      // §3.6 — the cross street's pavements; the break in the near one is the alley mouth, a dropped kerb.
      ...sp.x.map(([a, b]): BoxInst => ({ x: (a + b) / 2, y: k.height / 2, z: (sp.z[0] + sp.z[1]) / 2, sx: b - a, sy: k.height, sz: sp.z[1] - sp.z[0], color })),
      { x: 0, y: k.height / 2, z: (fp.z[0] + fp.z[1]) / 2, sx: fp.x[1] - fp.x[0], sy: k.height, sz: fp.z[1] - fp.z[0], color },
    ]
  }, [])
  const kerbMat = useMemo(() => worldGrained('grain', MATERIALS.grain.worldTile.concrete, MATERIALS.grain.normalScale.concrete, MATERIALS.concrete), [])

  return (
    <>
      <mesh rotation-x={-Math.PI / 2} raycast={noRaycast}>
        <planeGeometry args={[LAYOUT.ground, LAYOUT.ground]} />
        <meshStandardMaterial color={PALETTE.asphalt} roughness={tier.roughness} metalness={0} normalMap={maps.baseNormal} normalScale={maps.normalScale} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[(SX0 + SX1) / 2, REFLECTOR.strip.y, (SZ0 + SZ1) / 2]} raycast={noRaycast}>
        <planeGeometry args={[STRIP_W, STRIP_L]} />
        <MeshReflectorMaterial
          color={PALETTE.asphaltWet}
          resolution={tier.resolution}
          blur={[tier.blur[0], tier.blur[1]]}
          mixBlur={tier.mixBlur}
          mixStrength={REFLECTOR.mixStrength}
          mixContrast={REFLECTOR.mixContrast}
          depthScale={REFLECTOR.depthScale}
          minDepthThreshold={REFLECTOR.minDepthThreshold}
          maxDepthThreshold={REFLECTOR.maxDepthThreshold}
          depthToBlurRatioBias={REFLECTOR.depthToBlurRatioBias}
          distortion={tier.distortion}
          distortionMap={maps.puddle}
          mirror={REFLECTOR.mirror}
          reflectorOffset={REFLECTOR.reflectorOffset}
          roughness={tier.roughness}
          metalness={REFLECTOR.metalness}
          roughnessMap={maps.puddle}
          normalMap={maps.stripNormal}
          normalScale={maps.normalScale}
        />
      </mesh>
      <Instanced items={kerbs}><primitive object={kerbMat} attach="material" /></Instanced>
    </>
  )
}
