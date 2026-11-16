// §10.0 — rain rings on standing water. GLSL ES 1.00: no integer ops, a sin-free
// hash, and two generations alive per emitter so a ring fades out instead of popping.
export const rippleVertex = /* glsl */ `
attribute float aPhase;
attribute float aJitter;
attribute float aSeed;
varying vec2 vUv;
varying float vPhase;
varying float vJitter;
varying float vSeed;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vPhase = aPhase;
  vJitter = aJitter;
  vSeed = aSeed;
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`

export const rippleFragment = /* glsl */ `
uniform float uTime;
uniform float uInterval;
uniform float uLife;
uniform float uPeak;
uniform float uThickness;
uniform float uRamp;
uniform float uVariation;
uniform float uWobble;
uniform vec3 uColor;
varying vec2 vUv;
varying float vPhase;
varying float vJitter;
varying float vSeed;
#include <fog_pars_fragment>

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// One generation's ring. A dead generation returns 0.0 rather than discarding:
// with two in flight, a discard would kill the fragment the live ring draws into.
float ring(float gen, float t) {
  float age = (t - gen * uInterval) / uLife;
  if (age < 0.0 || age > 1.0) return 0.0;
  float g = mod(gen, 1024.0);
  float h1 = hash(vec2(g, vSeed));
  float h2 = hash(vec2(g + 17.0, vSeed));
  float h3 = hash(vec2(g + 41.0, vSeed));
  vec2 offset = (vec2(h1, h2) - 0.5) * 1.414 * vJitter;
  vec2 p = vUv - 0.5 - offset;
  // The jitter is paid out of the ring's reach, so a ring never leaves its own decal.
  float reach = (0.5 - length(offset)) / (1.0 + uVariation) * (1.0 + uVariation * (2.0 * h3 - 1.0));
  float theta = atan(p.y, p.x);
  float r = length(p) * (1.0 + uWobble * (0.6 * cos(2.0 * theta + h1 * 6.2832) + 0.4 * cos(3.0 * theta + h2 * 6.2832)));
  float radius = reach * age;
  float band = 1.0 - smoothstep(0.0, uThickness * radius + 0.004, abs(r - radius));
  float fade = smoothstep(0.0, uRamp, age) * (1.0 - age) * (1.0 - age);
  return band * fade;
}

void main() {
  float t = uTime + vPhase * uInterval;
  float k = floor(t / uInterval);
  float a = (ring(k, t) + ring(k - 1.0, t)) * uPeak;
  gl_FragColor = vec4(uColor, a);
  #include <fog_fragment>
}
`
