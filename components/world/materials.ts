'use client'
import * as THREE from 'three'
import { EMISSIVE, MATERIALS, PALETTE } from '@/lib/world'
import { groundTextures } from '@/lib/textures/ground'
import { cloneRepeat } from '@/lib/textures/canvas'

// Materials are created once and reused, never constructed in a render body.
function grained(cls: keyof typeof MATERIALS.grain.repeat, base: { roughness: number; metalness: number; envMapIntensity?: number }, extra: THREE.MeshStandardMaterialParameters = {}) {
  const t = groundTextures()
  const r = MATERIALS.grain.repeat[cls]
  const map = cloneRepeat(t.grain, [r, r])
  const normalMap = cloneRepeat(t.grainNormal, [r, r])
  const n = MATERIALS.grain.normalScale[cls]
  // One height field in `map` and `roughnessMap`: darker and glossier together, which is what damp is.
  return new THREE.MeshStandardMaterial({ ...base, map, roughnessMap: map, normalMap, normalScale: new THREE.Vector2(n, n), ...extra })
}

/**
 * Map a material in world metres instead of box UVs. Everything on these walls is a
 * unit box scaled per instance, so its own 0 → 1 UV stretches the texture by the
 * instance's aspect; projecting from world position along the face's dominant axis
 * gives every wall, pier and kerb the same texel size.
 */
export function applyWorldUv<M extends THREE.MeshStandardMaterial>(mat: M) {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <uv_vertex>',
      /* glsl */ `#include <uv_vertex>
      {
        vec4 wuvPos = vec4(position, 1.0);
        vec3 wuvN = normal;
        #ifdef USE_INSTANCING
          wuvPos = instanceMatrix * wuvPos;
          wuvN = mat3(instanceMatrix) * wuvN;
        #endif
        wuvPos = modelMatrix * wuvPos;
        wuvN = abs(normalize(mat3(modelMatrix) * wuvN));
        vec2 wuv = wuvN.y > 0.5 ? wuvPos.xz : (wuvN.x > wuvN.z ? wuvPos.zy : wuvPos.xy);
        #ifdef USE_MAP
          vMapUv = (mapTransform * vec3(wuv, 1.0)).xy;
        #endif
        #ifdef USE_ROUGHNESSMAP
          vRoughnessMapUv = (roughnessMapTransform * vec3(wuv, 1.0)).xy;
        #endif
        #ifdef USE_NORMALMAP
          vNormalMapUv = (normalMapTransform * vec3(wuv, 1.0)).xy;
        #endif
      }`,
    )
  }
  return mat
}
/** A grained material mapped in world metres: `tile` is metres per repeat. */
export function worldGrained(kind: 'wall' | 'grain', tile: number, normalScale: number, base: THREE.MeshStandardMaterialParameters) {
  const t = groundTextures()
  const r = 1 / tile
  const map = cloneRepeat(kind === 'wall' ? t.wall : t.grain, [r, r])
  const normalMap = cloneRepeat(kind === 'wall' ? t.wallNormal : t.grainNormal, [r, r])
  return applyWorldUv(new THREE.MeshStandardMaterial({ ...base, map, roughnessMap: map, normalMap, normalScale: new THREE.Vector2(normalScale, normalScale) }))
}

function build() {
  return {
    /** Facade boxes, fascias, piers, spandrels — white base, the §4 token arrives per instance. */
    facade: worldGrained('wall', MATERIALS.grain.worldTile.facade, MATERIALS.grain.normalScale.facade, MATERIALS.facade),
    /** §3.8 — painted light: unlit, vertex-coloured. A shop interior is lit by what is painted on it. */
    painted: new THREE.MeshBasicMaterial({ vertexColors: true }),
    /** Props that read as material rather than silhouette: crates. */
    crate: grained('crate', MATERIALS.concrete, { vertexColors: true }),
    shutter: new THREE.MeshStandardMaterial({ color: PALETTE.shutter, ...MATERIALS.shutter }),
    /** Painted metal, vertex-coloured: poles, brackets, railings, frames. */
    metal: new THREE.MeshStandardMaterial({ ...MATERIALS.paintedMetal, vertexColors: true }),
    /** Matte, vertex-coloured: everything else that is merged by material. */
    matte: new THREE.MeshStandardMaterial({ ...MATERIALS.facade, vertexColors: true }),
    boardCase: new THREE.MeshStandardMaterial({ color: PALETTE.shutter, ...MATERIALS.boardCase }),
    /** §8's neon tube: basic, colour at full, carried through vertex colours so many tubes are one call. */
    tube: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    /** An emissive panel takes void as its diffuse and carries its colour only in the emissive term. */
    emissivePanel: (map: THREE.Texture, intensity: number) =>
      new THREE.MeshStandardMaterial({ color: PALETTE.void, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: intensity, roughness: MATERIALS.paintedMetal.roughness, metalness: 0 }),
    tubeGain: EMISSIVE.neonTube,
  }
}
let cache: ReturnType<typeof build> | null = null
export const mats = () => (cache ??= build())
