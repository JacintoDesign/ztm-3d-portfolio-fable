'use client'
import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { HalfFloatType } from 'three'
import { POST } from '@/lib/world'
import { pick } from '@/lib/tier'

/**
 * §9.1 — Bloom → tone mapping → Vignette. The composer switches the renderer's
 * own tone mapping off, so the ACES pass puts §5 back; it goes after the bloom
 * so the emissive ladder is still HDR when bloom reads it. The mode is named
 * because the effect defaults to AgX.
 */
export function Effects() {
  const bloom = pick({ desktop: POST.bloom.desktop, mobile: POST.bloom.mobile })
  return (
    <EffectComposer multisampling={pick(POST.multisampling)} frameBufferType={HalfFloatType}>
      <Bloom intensity={bloom.intensity} luminanceThreshold={POST.bloom.threshold} luminanceSmoothing={POST.bloom.smoothing} mipmapBlur radius={POST.bloom.radius} resolutionScale={bloom.resolutionScale} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette offset={POST.vignette.offset} darkness={POST.vignette.darkness} />
    </EffectComposer>
  )
}
