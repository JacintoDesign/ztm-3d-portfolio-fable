// §3.6 — the far street's LED signs. Each board is a matrix of dots running one
// of five patterns; nothing on them is a string. GLSL ES 1.00-safe: a sin-free hash.
export const boardVertex = /* glsl */ `
attribute float aSeed;
attribute float aKind;
attribute vec2 aSize;
varying vec2 vUv;
varying vec2 vSize;
varying float vSeed;
varying float vKind;
varying vec3 vColor;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vSize = aSize;
  vSeed = aSeed;
  vKind = aKind;
  #ifdef USE_INSTANCING_COLOR
    vColor = instanceColor;
  #else
    vColor = vec3(1.0);
  #endif
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`

export const boardFragment = /* glsl */ `
uniform float uTime;
uniform float uCell;
uniform float uOff;
varying vec2 vUv;
varying vec2 vSize;
varying float vSeed;
varying float vKind;
varying vec3 vColor;
#include <fog_pars_fragment>

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 cells = floor(vSize / uCell);          // dots across and up
  vec2 g = vUv * cells;
  vec2 c = floor(g);
  float t = uTime;
  float on = 0.0;

  if (vKind < 0.5) {
    // Columns of glyph-like blocks falling at their own speeds: a vertical sign's worth of characters.
    float speed = 1.5 + 3.0 * hash(vec2(c.x, vSeed));
    float row = floor(g.y + t * speed);
    float glyph = floor(row / 5.0);
    on = step(0.42, hash(vec2(c.x + glyph * 7.0, row + vSeed))) * step(0.5, mod(row, 5.0)) * step(0.5, mod(c.x, 4.0));
  } else if (vKind < 1.5) {
    // A ticker: blocks of pseudo-type scrolling sideways through the middle rows.
    float col = floor(g.x + t * 5.0);
    float band = step(cells.y * 0.3, c.y) * step(c.y, cells.y * 0.7);
    on = band * step(0.45, hash(vec2(col, c.y + vSeed))) * step(0.5, mod(col, 5.0));
    on = max(on, step(c.y, 0.5) + step(cells.y - 1.5, c.y)); // steady rails top and bottom
  } else if (vKind < 2.5) {
    // Chevrons running up the board.
    float v = g.y + abs(g.x - cells.x * 0.5) - t * 6.0;
    on = step(0.55, fract(v / 6.0));
  } else if (vKind < 3.5) {
    // A column meter: each column rises and falls on its own slow beat.
    float beat = floor(t * 3.0), f = fract(t * 3.0);
    float h0 = hash(vec2(c.x + vSeed, beat)), h1 = hash(vec2(c.x + vSeed, beat + 1.0));
    on = step(vUv.y, 0.12 + 0.8 * mix(h0, h1, f * f * (3.0 - 2.0 * f)));
  } else {
    // A chase round the border, and a block in the middle that breathes.
    float edge = step(c.x, 0.5) + step(cells.x - 1.5, c.x) + step(c.y, 0.5) + step(cells.y - 1.5, c.y);
    float along = c.x + c.y;
    on = min(1.0, edge) * step(0.5, fract((along - t * 8.0) / 4.0));
    vec2 q = abs(vUv - 0.5);
    on = max(on, step(q.x, 0.28) * step(q.y, 0.3) * (0.55 + 0.45 * step(0.5, fract(t * 0.7 + vSeed))));
  }

  // Each cell is a round dot; when the dots fall under two pixels the matrix resolves to its average
  // instead of shimmering.
  float lit = smoothstep(0.48, 0.3, length(fract(g) - 0.5));
  float fine = clamp(max(fwidth(g.x), fwidth(g.y)) * 1.1, 0.0, 1.0);
  lit = mix(lit, 0.5, fine);
  gl_FragColor = vec4(vColor * (uOff + on * lit), 1.0);
  #include <fog_fragment>
}
`
