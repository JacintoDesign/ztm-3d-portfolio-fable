// Typed mirror of WORLD_BRIEF.md. Every atmospheric, material, light and scale
// value in the world is read from here; nothing is invented inline. Section
// numbers (§) refer to the brief.

const DEG = Math.PI / 180

export const WORLD = {
  title: '終電 / Last Train',
  name: 'Jacinto Design',
  vibe: "3am in Tokyo. You've just missed the last train. Neon reflections on wet pavement.",
} as const

// §4 — palette. sRGB hex; a hex here is an albedo, not a pixel.
export const PALETTE = {
  void: '#04060B',
  asphalt: '#0A0E15',
  asphaltWet: '#070A11',
  facade: '#1C2333',
  facadeWarm: '#251E2C',
  shutter: '#272F3F',
  concrete: '#2E3646',
  metalDark: '#353F51',
  scooterPaint: '#6E7789',
  crateKraft: '#4A3B2A',
  crateTimber: '#5C4630',
  neonMagenta: '#FF2E6A',
  neonPink: '#FF6FA5',
  neonCyan: '#3BD9FF',
  neonBlue: '#2A6BFF',
  sodium: '#FFA23D',
  sodiumDeep: '#FF7A1A',
  lantern: '#E8283F',
  vendGlow: '#FFD9A0',
  phoneGreen: '#2FE08A',
  signWhite: '#FFF0F5',
  rain: '#9FB4D6',
  fogColor: '#0A0F1A',
  uiInk: '#E8ECF4',
  uiDim: '#7C879B',
} as const
export type Token = keyof typeof PALETTE

// §3 — layout
const KERB_WIDTH = 0.2 + 1.0 + 0.1 // wallStandoff + deepest wall prop + 0.10
const KERB_INNER = 4.5 - KERB_WIDTH
const GUTTER_WIDTH = 0.22
export const LAYOUT = {
  alley: { x: [-4.5, 4.5] as const, z: [-23, 23] as const, length: 46, width: 9 },
  facadeHeight: { west: 14.0, east: 12.5 },
  facadeZ: { west: [-24, 25] as const, east: [-24, 24] as const }, // §3.1: west overruns 1.00 for the bend
  wallThickness: 1.0,
  endWallHeight: 14.0,
  ground: 70,
  kerb: { height: 0.12, width: KERB_WIDTH, innerEdgeX: KERB_INNER },
  gutter: { width: GUTTER_WIDTH, x: KERB_INNER - GUTTER_WIDTH / 2 - 0.07 },
  bounds: { x: [-3.6, 3.6] as const, z: [-21.0, 21.4] as const },
  playerRadius: 0.32,
  ends: { north: { z: -23 }, south: { z: 23, angleDeg: 20, returnLength: 6 } },
  wallStandoff: 0.2,
} as const

// §3.1 — the bend's face frame, derived once from LAYOUT.ends.south.
const a = LAYOUT.ends.south.angleDeg * DEG
const boxCx = LAYOUT.alley.x[0] + (LAYOUT.ends.south.returnLength / 2) * Math.cos(a)
const boxCz = LAYOUT.ends.south.z + LAYOUT.wallThickness / 2
const nX = -Math.sin(a)
const nZ = -Math.cos(a)
export const BEND = {
  yawDeg: LAYOUT.ends.south.angleDeg,
  boxCentre: { x: boxCx, z: boxCz },
  faceCentre: { x: boxCx + nX * (LAYOUT.wallThickness / 2), z: boxCz + nZ * (LAYOUT.wallThickness / 2) },
  along: { x: Math.cos(a), z: -Math.sin(a) },
  normal: { x: nX, z: nZ },
  visibleT: [-2.8175, 3.0] as const,
  /** World point at `t` metres along the face, `d` metres out along the inward normal. */
  point(t: number, d = 0) {
    return {
      x: this.faceCentre.x + this.along.x * t + this.normal.x * d,
      z: this.faceCentre.z + this.along.z * t + this.normal.z * d,
    }
  },
}

// §12.1 — camera
export const CAMERA = {
  eyeHeight: 1.68,
  fov: { landscape: 62, portrait: 70 },
  near: 0.1,
  far: 90,
  spawn: { x: 0, z: -19.5, yawDeg: 0, pitchDeg: -4 },
} as const

// §12.2
export const LOOK = {
  sensitivity: { mouse: 0.0022, touch: 0.0032 },
  pitchClampDeg: 62,
  smoothing: 18,
  clickGuardPx: 6,
} as const

// §12.3
export const WALK = {
  speed: 2.6,
  acceleration: 12,
  damping: 10,
  bob: { amplitude: 0.022, frequency: 1.9 },
  stick: { size: 128, deadZone: 0.12, inset: 24 },
} as const

// §5
export const ATMOSPHERE = {
  fog: { color: PALETTE.fogColor, density: 0.03 },
  background: PALETTE.void,
  exposure: 1.05,
  env: {
    resolution: 128,
    fill: '#33445F',
    ceiling: { size: [12, 2] as const, position: [0, 11, 0] as const, color: PALETTE.void, intensity: 0.4 },
  },
} as const

// §6 — the reflector. mixStrength is derived from the gain, never authored.
const lumAsphaltWet = 0.00303
export const REFLECTOR = {
  strip: { x: [-6, 6] as const, z: [-26, 33] as const, y: 0.004 },
  gain: 1.35,
  mixStrength: Math.round(1.35 / lumAsphaltWet),
  mixContrast: 1.0,
  depthScale: 1.1,
  minDepthThreshold: 0.4,
  maxDepthThreshold: 1.25,
  depthToBlurRatioBias: 0.28,
  mirror: 0,
  reflectorOffset: 0,
  metalness: 0,
  desktop: { resolution: 1024, blur: [420, 100] as const, mixBlur: 4.0, distortion: 0.28, roughness: 0.18 },
  mobile: { resolution: 512, blur: [240, 60] as const, mixBlur: 4.5, distortion: 0.18, roughness: 0.22 },
} as const

// §6.2
export const GROUND_MAPS = {
  puddle: {
    wet: 0.06,
    dry: 0.55,
    coverage: 0.6,
    desktop: { size: [512, 2048] as const, blur: 14 },
    mobile: { size: [256, 1024] as const, blur: 7 },
    ellipses: [3, 6] as const,
    major: [0.8, 4.5] as const,
    flatWeight: 0.59,
    regions: {
      alley: { x: [-4.5, 4.5] as const, z: [-23, 23] as const },
      carriageway: { x: [0.9, 6.0] as const, z: [26.2, 31.6] as const },
    },
  },
  ripple: {
    size: { desktop: 512, mobile: 256 },
    normalScale: 0.15,
    tile: 1.5, // metres per tile — the strip's 12 m ÷ uvRepeat 8
    scroll: 0.012,
    dimples: 140,
    dimpleRadius: [6, 22] as const,
    slope: 1.1,
  },
} as const

// §8.1 — the emissive ladder. The single source; raised values as tabled.
export const BLOOM_KNEE = 0.9
export const EMISSIVE = {
  neonTube: 5.96,
  vehicleHeadlight: 4.64,
  scooterHeadlamp: 4.64 * 0.9,
  verticalSign: 4.2,
  mailboxFlag: 3.1,
  bioStationPanel: 2.44,
  tailLamp: 2.33,
  lantern: 2.77,
  apertureSurround: 0.85, // was 2.00: the frame out-shone the work it frames
  mailboxLabel: 1.89,
  banner: 1.78,
  lightboxSign: 1.56,
  spill: 1.34,
  titleSign: 1.23,
  stationPlate: 1.01,
  signBox: 0.85,
  boardFace: 0.7,
  window: 0.55,
  screenshot: 0.88, // just under the knee: as bright as a surface may be without blooming
  // §3.8 — the two open shops. Painted light: nothing here is a dynamic light.
  shopSign: 0.85, // = signBox: a storefront sign stays under the knee like the other fourteen
  shopLamp: 1.01, // = stationPlate: on the edge of the knee, deliberately
  shopInterior: 0.16, // painted faces inside a shop: a few times the wall outside, far under the knee
} as const

// §7 — lights. Candela for points, cd/m² for rect areas.
export const STREET_LIGHT_TRIM = 0.9
export const LIGHTS = {
  hemisphere: { sky: '#121A2B', ground: '#060A10', intensity: 0.7 },
  screen: { color: PALETTE.signWhite, intensity: 1.2 }, // #2, desktop only, sized from SHOWCASE.screen
  title: { color: PALETTE.neonMagenta, intensity: 40, standoff: 0.9, distance: 9, decay: 2 }, // #3
  cart: { color: PALETTE.vendGlow, intensity: 28, size: [2.0, 0.9] as const, position: [3.62, 1.94, 19.0] as const, mobilePoint: 26 }, // #4
  mailbox: { color: PALETTE.signWhite, intensity: 18, position: [-3.0, 1.55, 14.0] as const, distance: 6, decay: 1.45 }, // #5
  /** #6–#10: each sits on a §3.5 sign and takes its colour from it. */
  signs: [
    { id: 6, sign: 1, intensity: 150, distance: 18.0 },
    { id: 7, sign: 4, intensity: 130, distance: 16.5 },
    { id: 8, sign: 6, intensity: 95, distance: 15.0 },
    { id: 9, sign: 8, intensity: 115, distance: 13.5 },
    { id: 10, sign: 0, intensity: 80, distance: 12.0 },
  ],
  signDecay: 1.45,
  gate: { color: PALETTE.signWhite, intensity: 70, distance: 13.5, decay: 1.45, standoff: 1.0 }, // #11
  mobileHalved: [6, 7],
} as const

// §8
export const MATERIALS = {
  concrete: { roughness: 0.72, metalness: 0, envMapIntensity: 0.6 },
  facade: { roughness: 0.85, metalness: 0, envMapIntensity: 0.4 },
  shutter: { roughness: 0.55, metalness: 0.35 },
  paintedMetal: { roughness: 0.62, metalness: 0.55, envMapIntensity: 1.0 },
  boardCase: { roughness: 0.78, metalness: 0.12, envMapIntensity: 0.35 },
  glass: { roughness: 0.08, metalness: 0 },
  noren: { roughness: 0.92, metalness: 0 },
  paperLantern: { roughness: 0.9, metalness: 0 },
  screenshotTint: PALETTE.uiInk, // near-white: the image is shown almost as authored
  screenFallback: '#0E121A',
  grain: {
    size: { desktop: 384, mobile: 192 },
    repeat: { concrete: 3, facade: 2, awning: 4, crate: 1, metal: 2 },
    normalScale: { concrete: 0.3, facade: 0.18, awning: 0.35, crate: 0.5, metal: 0.35 },
    /** §3.4 — walls and kerbs are mapped in world metres, not stretched box UVs: metres per tile. */
    worldTile: { facade: 3.2, concrete: 1.6 },
  },
  contactDecal: { color: PALETTE.void, opacity: 0.55, footprintScale: 1.55, lift: 0.01 },
} as const

// §9 / §9.1
export const POST = {
  bloom: {
    threshold: 0.9,
    smoothing: 0.28,
    radius: 0.72,
    desktop: { intensity: 0.9, resolutionScale: 1 },
    mobile: { intensity: 0.8, resolutionScale: 0.5 },
  },
  vignette: { offset: 0.28, darkness: 0.85 },
  multisampling: { desktop: 4, mobile: 0 },
} as const

// §10
export const RAIN = {
  near: { count: { desktop: 1400, mobile: 700 }, box: [14, 12, 14] as const, pointSize: 0.06, opacity: { desktop: 0.35, mobile: 0.28 } },
  far: { count: { desktop: 2600, mobile: 1000 }, box: [30, 14, 46] as const, pointSize: 0.04, opacity: { desktop: 0.22, mobile: 0.18 } },
  fallSpeed: 9.0,
  windX: 0.6,
  aspect: 8, // the 8 × 64 streak
  reduced: { opacity: 0.22, countScale: 0.5 },
} as const

export const RIPPLES = {
  regions: [
    { x: [-3.2, 3.2] as const, z: [-23, 23] as const, count: { desktop: 48, mobile: 21 } },
    { x: [0.9, 6.0] as const, z: [26.2, 31.6] as const, count: { desktop: 12, mobile: 5 } },
  ],
  diameter: 0.85,
  interval: 1.1,
  life: 1.4,
  peakOpacity: 0.16,
  thickness: 0.16,
  wetThreshold: 0.2,
  minSeparation: 1.1,
  birthRamp: 0.05,
  sizeVariation: 0.25,
  wobble: 0.12,
  jitterLadder: [0.36, 0.26, 0.18, 0.1, 0.05] as const,
  y: 0.012,
} as const

export const STEAM = {
  vents: { desktop: 3, mobile: 2 },
  sprites: { desktop: 24, mobile: 12 },
  opacity: 0.08,
  rise: 0.35,
  reducedOpacity: 0.05,
} as const

// §11
export const TYPE = {
  latin: 'ui-monospace, "SF Mono", "JetBrains Mono", monospace',
  japanese: '"Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif',
  anisotropy: { desktop: 8, mobile: 4 },
  titleCapMax: 0.3,
  titleTracking: 0.1,
  stationPlateGlyph: 0.55,
} as const

// §11.3
export const FLICKER = {
  sequence: [1, 1, 0.2, 1, 0.05, 0.9, 1, 1, 1, 0.4, 1] as const,
  stepMs: 22,
  holdMs: 6500,
  offsets: { title: 0, sign3: 0.17, sign7: 0.53, banner9: 0.31, banner10: 0.68, banner11: 0.86 },
} as const

// §11.4 — the only strings permitted in the surroundings.
export const SIGNAGE = [
  '居酒屋', 'ラーメン', '営業中', 'カラオケ', '24H', '喫茶', '酒', '定食', '深夜', // 0–8 neon signs
  'お好み焼', 'コインランドリー', '自動販売機', // 9–11 banners
  '禁煙', // 12 unassigned
  '終電', // 13 station plate
  '焼鳥', 'すし', 'おでん', '立呑', '中華', 'スナック', '甘味', // 14–20 lit sign boxes
  '運転終了', // 21 gate notice
] as const
/** §11.4 / §3.8 — what is printed inside the 24h store. Shop-floor words only; never project-related. */
export const STORE_LABELS = {
  products: ['お茶', '水', 'コーヒー', '牛乳', 'パン', 'おにぎり', '弁当', '菓子', 'チョコ', 'ガム', 'カレー', 'みそ', 'ソース', 'せんべい', 'ジュース', 'ラーメン'],
  /** How much of a can or bottle its label wraps: a little over half, so the word faces the customer and the seam is behind. */
  wrap: 1.2 * Math.PI,
  /** The products a bottle may be: what goes on the chiller's shelves. */
  drinks: ['お茶', '水', 'コーヒー', '牛乳', 'ジュース'],
  aisles: ['菓子', '日用品'],
  chillers: ['お茶', '水', 'コーヒー', 'ジュース', 'ビール'],
  till: 'レジ',
  hot: '肉まん',
  freezer: 'アイス',
  magazines: ['雑誌', 'マンガ', '週刊', '旅'],
  posters: ['新発売', 'セール'],
  prices: ['¥98', '¥120', '¥158', '¥248'],
} as const
/** §3.8 — the restaurant's printed matter: what its bottles are, and §11.4's own strings on its menu tags. */
export const RESTAURANT_LABELS = {
  bottles: ['酒', 'ビール', '焼酎', '梅酒'],
  menu: [16, 7, 1, 6, 14], // おでん · 定食 · ラーメン · 酒 · 焼鳥
} as const
/** §2.4 / §3.6 — the one named exception: the studio's name, in katakana. */
export const BRAND_SIGN = { rows: ['ジャシント', 'デザイン'] as const, colors: [PALETTE.neonMagenta, PALETTE.neonCyan] as const }

// §3.1 — the station gate
export const GATE_WALL = {
  shutter: { width: 9.0, height: 3.4 },
  roll: { y: 3.4 },
  notice: { size: [1.15, 0.72] as const, y: 2.1, proud: 0.04, string: 21, canvas: { desktop: [512, 256] as const, mobile: [256, 128] as const } },
  plate: { size: [1.62, 0.86] as const, thickness: 0.06, y: 4.2, string: 13 },
} as const

// §3.3 — upper facade
export const UPPER = {
  bandBase: 4.6,
  floorHeight: 2.85,
  bay: { width: 8.0, height: 8.55 },
  windowPitch: 1.6,
  window: [0.95, 1.35] as const,
  sill: 0.95,
  litFraction: 0.16,
  litColor: PALETTE.rain,
  unlitColor: PALETTE.void,
  panelOffset: 0.004,
  pier: { width: 0.65, depth: 0.12 },
  spandrel: { height: 1.5, depth: 0.09 },
  canvas: { desktop: 384, mobile: 256 },
} as const

// §3.4 — storefronts
export const STOREFRONT = {
  bandTop: 4.0,
  perWall: 7,
  widths: [3.6, 4.2, 4.8, 5.4, 6.2] as const,
  plinth: { height: 0.1, depth: 0.2, lip: 0.04 }, // `lip`: how far a unit's plinth stands in front of its frame
  pierWidth: 0.3,
  frameProud: 0.35,
  aperture: { y: [0.1, 2.55] as const, recess: 0.35 },
  slat: { pitch: 0.09, heightFrac: 0.9, depth: 0.035 },
  roll: { radius: 0.16 },
  ajar: { opening: 0.62, spill: 0.55, count: 0 }, // §3.8 — all three were closed; the state stays for the day one reopens
  doorway: { width: 0.9, height: 2.05, proud: 0.45, jamb: 0.12, gap: 0.15 },
  signBox: { size: [1.3, 0.7] as const, baseY: 2.85, proud: 0.14, lit: 7 },
  fasciaY: [2.55, 4.0] as const,
  awning: { count: 5, depth: 1.25, underside: 2.6, thickness: 0.07, barRadius: 0.05 },
  serviceGap: 1.8,
  reserved: { west: [[12.9, 15.1]] as const, east: [[5.1, 6.9]] as const },
  seed: 3,
} as const
// §3.8 — the two open units. Which unit, and how deep the room behind it goes.
export const SHOPS = {
  konbini: { unit: 9, string: 4 }, // §11.4 index 4, `24H`
  restaurant: { unit: 4 },
  depth: 2.8,
  glassOpacity: 0.22,
  sign: { height: 0.62, y: 3.02 },
  noren: { drop: 0.2, panels: 5 }, // short: an eye riding the kerb at 1.80 has to pass under its hem
  pool: { opacity: 0.1, reach: 2.6 },
  door: 1.1,
  /** How far the walkable zone keeps the eye off a room's walls. */
  margin: 0.35,
  floorY: 0.22, // kerb + plinth: the shop floor
  /** Painted levels: the fraction of its token an unlit interior surface is drawn at. */
  chillerDepth: 0.45,
  level: { label: 0.36, goods: 0.3, floor: 0.07, wall: 0.2, ceiling: 0.14, fixture: 0.16, warmWall: 0.07, frame: 0.8, steel: 0.9, pot: 1.3, timberFloor: 0.55, timberCeiling: 0.7, timber: 1.0, timberTop: 1.7 },
  pendantY: 1.36,
  /**
   * Baked light: computed once per vertex at mount, never a dynamic light. `power` is the
   * multiplier a surface facing the lamp at zero distance receives; `radius` is where it halves twice.
   */
  light: {
    wrap: 0.35, // half-Lambert: how far light creeps round an edge
    shadow: 0.3, // what is left of a lamp behind a fixture
    cell: 0.22, // floor, wall and ceiling are diced this fine so pools and shadows have somewhere to land
    store: { ambient: ['rain', 0.22], strip: ['signWhite', 0.8, 2.1], chiller: ['neonCyan', 1.1, 0.75], street: ['neonMagenta', 0.5, 2.4] },
    restaurant: { ambient: ['sodiumDeep', 0.16], pendant: ['vendGlow', 1.9, 1.5], kitchen: ['signWhite', 1.0, 1.3], street: ['neonMagenta', 0.45, 2.4] },
  },
} as const
export const DOORWAY_SURROUND = STOREFRONT.doorway.width + 2 * STOREFRONT.doorway.jamb
export const SIGN_CLEAR_AIR = 0.25

// §3.5 — neon signs and the overhead layer
export const NEON_SIGNS = {
  count: 9,
  vertical: { width: 0.44, perChar: 0.34, padding: 0.22 },
  horizontal: { height: 0.52, perChar: 0.4, padding: 0.28 },
  thickness: 0.09,
  projection: [0.55, 0.72] as const,
  bracket: { size: 0.05, verticalOffset: 0.28 },
  mountY: [2.9, 5.2] as const,
  rim: 0.03,
  horizontalIndices: [1, 4, 7] as const,
  flicker: [3, 7] as const,
  /** §4's ratio over nine → 5 / 3 / 1 / 0, assigned by index. */
  colors: ['neonMagenta', 'neonPink', 'sodium', 'neonPink', 'neonMagenta', 'sodium', 'lantern', 'neonMagenta', 'neonCyan'] as const satisfies readonly Token[],
  z: [-20.65, 20.04] as const, // first and last; the stride between is even
  canvas: { desktop: [128, 512] as const, mobile: [64, 256] as const },
} as const

export const OVERHEAD = {
  spans: 34,
  y: [6.5, 9.0] as const,
  radius: 0.018,
  sag: [0.35, 0.9] as const,
  segments: 3,
  banner: { size: [3.2, 0.62] as const, drop: 0.5, strings: [9, 10, 11] as const, groundFraction: 1 / 16, z: [-11, 3.5, 12.5] as const },
} as const

// §3.6 — the cross street
export const STREET = {
  carriageway: { z: [26.2, 31.6] as const },
  lanes: [
    { z: 27.55, dir: 1, speed: 11.0, gaps: [72, 95, 73] as const, hold: 2.6 },
    { z: 30.25, dir: -1, speed: 9.0, gaps: [88, 66, 86] as const, hold: 3.4 },
  ],
  track: 240,
  nearPavement: { z: [24.6, 26.2] as const, x: [[-40, 1.2], [4.6, 40]] as const },
  farPavement: { z: [31.6, 32.9] as const, x: [-40, 40] as const },
  centreLine: { z: 28.9, dash: 2.0, gap: 3.0, width: 0.12, y: 0.024, level: 0.22 },
  farBuilding: { z: 32.8, thickness: 1.0, height: 14.0, x: [-40, 40] as const, groundBandProud: 0.1, bays: 10, panelLevel: 0.55 },
  // LED signs: a matrix of `cell`-metre dots, each board running one of five animated patterns.
  boards: { count: 20, classes: [[1.1, 2.6], [0.8, 1.6], [1.3, 3.2]] as const, proud: 0.02, gain: 1.25, maxGap: 2.9, cell: 0.14, off: 0.05, kinds: 5 },
  brand: { x: 3.7, size: [3.4, 1.6] as const, y: 2.6, canvas: { desktop: [512, 256] as const, mobile: [256, 128] as const } },
  vehicles: [
    { key: 'ae86', file: '/Toyota AE86 by IvOfficial - ZEFWmOPSgh.glb', length: 4.18 },
    { key: 'rx7', file: '/Mazda RX-7 by IvOfficial - SnIoWlh7S2.glb', length: 4.3 },
    { key: 'rangeRover', file: '/Range Rover by IvOfficial - 8zk4o6nALW.glb', length: 4.97 },
  ],
  yawOffsetDeg: 90,
  lamps: {
    head: { size: [0.26, 0.14, 0.2] as const, heightFrac: 0.45 },
    tail: { size: [0.22, 0.12, 0.16] as const, heightFrac: 0.5 },
    proud: 0.01,
  },
  glow: {
    under: { lengthScale: 1.45, width: 2.3, y: 0.018, opacity: 0.7 },
    head: { length: 6.2, width: 2.6, y: 0.016, opacity: 0.58 },
    tail: { length: 2.4, width: 2.0, y: 0.014, opacity: 0.38 },
    /** §4's ratio over six → 3 / 2 / 1 / 0 */
    underColors: ['neonMagenta', 'sodium', 'neonPink', 'neonCyan', 'lantern', 'neonMagenta'] as const satisfies readonly Token[],
  },
} as const

// §3.7 — props (sizes and rules; positions live in lib/props.ts)
export const PROPS = {
  // |x| of a wall prop's back face: 0.03 clear of the deepest thing on the wall — §3.4's doorway frame,
  // 0.45 proud. Placed against the wall plane instead, every prop stood inside a plinth and a frame.
  wallBackX: 4.5 - STOREFRONT.doorway.proud - 0.03,
  vending: { size: [1.12, 0.82, 1.94] as const, canvas: { desktop: [256, 512] as const, mobile: [128, 256] as const } },
  // 0.84 deep and 0.48 off the wall: §3.4's doorway frames stand 0.45 proud, and the cart must clear them.
  cart: { size: [2.1, 0.84, 2.1] as const, standoff: 0.48, z: 19.0 },
  scooter: { file: '/vespa.glb', length: 1.75, leanDeg: 8 },
  crate: { size: [0.52, 0.36, 0.31] as const, shades: ['crateKraft', 'crateTimber', 'concrete', 'metalDark'] as const satisfies readonly Token[] },
  cone: { baseR: 0.17, topR: 0.035, height: 0.56, foot: 0.36 },
  barrier: { board: [1.2, 0.2] as const, y: [0.56, 0.76] as const, splayDeg: 10 },
  bin: { r: 0.3, height: 0.74, lidR: 0.32, taper: 0.87 },
  standpipe: { r: 0.055, x: 4.09, baseY: 0.1, tops: [2.6, 4.0] as const, count: 22 },
  pole: { r: 0.11, height: 8.4, x: 3.72, crossarms: [6.4, 7.1] as const },
  lantern: { r: 0.135, height: 0.36, arm: 0.34, armY: 3.46, ribs: 9, canvas: 256, count: 11 },
  guardrail: { x: [0.9, 4.15] as const, z: 21.755, post: 0.07, posts: 5, rails: [0.84, 0.52] as const, height: 0.89 },
  mastSignClearance: 0.55,
} as const

// §2.1 — the showcase. Authored in the bend's own frame; never world coordinates.
const SCREEN_W = 4.4
export const SHOWCASE = {
  t: 0.7,
  screen: { size: [SCREEN_W, (SCREEN_W * 8.5) / 16] as const, depth: 0.16, bezel: 0.1, y: [3.05, 5.3875] as const },
  titleSign: { size: [2.6, 0.62, 0.14] as const, y: [2.2, 2.82] as const },
  surroundStrip: 0.05,
  dwellMs: 10000,
  transition: { outMs: 140, holdMs: 90, inMs: 260 },
  image: { desktop: [1024, 544] as const, mobile: [512, 272] as const },
  resident: 3,
  // §2.1.1 — the locked view
  // 7.00 is what a portrait frame needs to hold the board; a landscape frame is wider, so it stands closer.
  lock: { standoff: 7.0, standoffLandscape: 4.8, lateral: 0.55, easeMs: 600 },
} as const

// §2.2 — the food cart (geometry is §3.7's; this is the station dressing)
export const CART = {
  signBand: { size: [1.05, 0.3] as const, y: 0.72, proud: 0.05 }, // its box stands this far off the bar
  canopyPanels: { count: 5, size: [0.3, 0.34] as const, y: 1.98, pitch: 0.38 },
  noren: { count: 4, size: [0.2, 0.42] as const },
  wheelTrack: 0.58,
} as const

// §2.3 — the mailbox bank
export const MAILBOX = {
  wallX: -4.5,
  z: 14.0,
  plate: { margin: 0.16, proud: 0.04 },
  bolt: { size: 0.056, inset: 0.08 },
  box: { w: 0.44, depth: 0.3, h: 0.26 },
  columns: 3,
  pitch: { column: 0.62, row: 0.4 },
  rowY: [1.42, 1.02] as const, // top row first
  label: { size: [0.34, 0.1] as const, proud: 0.034 }, // off the box face: clear of the door and the card holder it sits in
  door: { height: 0.56, proud: 0.012 }, // the hinged front, as a fraction of the box's height
  slot: { width: 0.62, height: 0.024 },
  canopy: { overhang: 0.12, rise: 0.05 },
  flag: 0.05,
  flagColors: ['neonMagenta', 'neonCyan', 'neonBlue', 'signWhite', 'phoneGreen', 'sodium'] as const satisfies readonly Token[],
} as const

// §12.5 / §12.6 — stations and stops
export const STATIONS = {
  facingConeDeg: 150,
  board: { radius: 9.5 },
  cart: { x: 3.8, z: 19.0, radius: 4.0, stop: { x: 0.2, z: 19.0, yawDeg: 90 }, aimY: 1.2 },
  mailbox: { x: -4.2, z: 14.0, radius: 3.8, stop: { desktop: { x: -2.6, z: 14.0 }, mobile: { x: -0.8, z: 14.0 }, yawDeg: -90 }, aimY: 1.22 },
  gate: { stop: { x: 0, z: -20.0, yawDeg: 180 }, aimY: 2.1, standoff: 3.0 },
  promptFadeMs: 180,
} as const

export const TOUR = {
  order: ['spawn', 'about', 'work', 'contact', 'gate'] as const,
  glideSpeed: 5.0,
  minLegSec: 1.2,
  reducedFadeMs: 180,
} as const
export type StopId = (typeof TOUR.order)[number]

// §14
export const GATE = {
  lines: ["It's three AM.", "You've missed the last train.", 'Jacinto', 'Design', 'Enter'] as const,
  riseMs: 480,
  buttonFadeMs: 1000,
  fadeOutMs: 320,
  timeoutMs: 12000,
  sweep: { up: 0.9, back: 2.6, ms: 1600 },
} as const

const db = (v: number) => Math.pow(10, v / 20)
export const AUDIO = {
  master: db(-30),
  beds: {
    rain: { gain: db(-18), cutoff: 900, q: 0.6, lfoHz: 0.07, lfoDepth: 220, bufferSec: 6 },
    hum: { gain: db(-26) },
    train: { gain: db(-12), gapSec: [40, 90] as const },
    cart: { gain: db(-24), falloff: 6 },
    flap: { gain: db(-22) },
    footsteps: { gain: db(-20), hz: 1.9 },
    click: { gain: db(-16) },
  },
  muteKey: 'last-train:muted',
  hintKey: 'last-train:hint-seen',
} as const

// §15
export const BUDGET = {
  dpr: 1.5,
  tierWidth: 820,
} as const

export const deg = (d: number) => d * DEG
