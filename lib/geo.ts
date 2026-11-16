import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { PALETTE, type Token } from './world'
import type { Rect } from './textures/canvas'

const m = new THREE.Matrix4()
const q = new THREE.Quaternion()
const e = new THREE.Euler()
const p = new THREE.Vector3()
const s = new THREE.Vector3(1, 1, 1)
const col = new THREE.Color()
const UP = new THREE.Vector3(0, 1, 0)

export const tokenColor = (t: Token | string, gain = 1) =>
  new THREE.Color(t in PALETTE ? PALETTE[t as Token] : t).multiplyScalar(gain)

/**
 * Drawn by material, not by object: transforms and colours bake into the
 * vertices and each material family becomes one merged mesh. Built once at mount.
 */
export class MeshBuilder {
  private parts: THREE.BufferGeometry[] = []

  private add(g: THREE.BufferGeometry, x: number, y: number, z: number, color: Token | string, rx = 0, ry = 0, rz = 0, gain = 1) {
    e.set(rx, ry, rz, 'YXZ')
    m.compose(p.set(x, y, z), q.setFromEuler(e), s)
    g.applyMatrix4(m)
    col.set(color in PALETTE ? PALETTE[color as Token] : color).multiplyScalar(gain)
    const n = g.attributes.position.count
    const c = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3))
    this.parts.push(g)
    return this
  }
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: Token | string, ry = 0, rx = 0, rz = 0, gain = 1) {
    return this.add(new THREE.BoxGeometry(w, h, d), x, y, z, color, rx, ry, rz, gain)
  }
  /** A box diced into cells, for surfaces that baked light has to vary across. */
  slab(w: number, h: number, d: number, x: number, y: number, z: number, color: Token | string, gain = 1, cell = 0.22) {
    const n = (v: number) => Math.max(1, Math.round(v / cell))
    return this.add(new THREE.BoxGeometry(w, h, d, n(w), n(h), n(d)), x, y, z, color, 0, 0, 0, gain)
  }
  /** A ball, optionally squashed: `sy` scales its height. */
  ball(r: number, x: number, y: number, z: number, color: Token | string, sy = 1, gain = 1) {
    const g = new THREE.SphereGeometry(r, 10, 7)
    g.scale(1, sy, 1)
    return this.add(g, x, y, z, color, 0, 0, 0, gain)
  }
  /**
   * A tied rubbish bag standing on `y`: a sphere reshaped into a slumped pear — flat where it sits,
   * widest low down, lumpy from what is inside, drawn in to a gathered neck. Returns the height of the body.
   */
  bag(r: number, x: number, y: number, z: number, color: Token | string, seed: number, lean = 0) {
    const g = new THREE.SphereGeometry(r, 16, 12)
    const P = g.attributes.position
    const top = 1.36 * r
    for (let i = 0; i < P.count; i++) {
      const nx = P.getX(i) / r, ny = P.getY(i) / r, nz = P.getZ(i) / r
      const t = (ny + 1) / 2 // 0 at the foot, 1 at the neck
      const theta = Math.atan2(nz, nx)
      // Widest a third of the way up, pulled in hard over the last fifth.
      let m = 1.08 + 0.16 * Math.sin(Math.min(1, t * 1.6) * Math.PI) - 0.42 * t * t
      if (t > 0.8) m *= 1 - ((t - 0.8) / 0.2) * 0.8
      // Lumps: integer frequencies round the bag, so the seam closes.
      const lump = 1 + 0.11 * Math.sin(theta * 3 + seed) * Math.sin(t * 5 + seed * 1.7) + 0.06 * Math.sin(theta * 5 + seed * 2.3 + t * 3)
      // Creases running down from the neck, deepest at the top.
      const crease = 1 - 0.07 * t * (0.5 + 0.5 * Math.sin(theta * 9 + seed))
      const k = m * lump * crease
      const h = Math.max(0, (Math.max(ny, -0.82) + 0.82) / 1.82) * top // flat where it rests
      P.setXYZ(i, nx * r * k + lean * h, h, nz * r * k)
    }
    g.computeVertexNormals()
    this.add(g, x, y, z, color)
    // The neck, gathered and tied off.
    const nx2 = x + lean * top
    this.cyl(r * 0.09, r * 0.2, r * 0.26, nx2, y + top + r * 0.1, z, color, 0, 0, 0, 8)
    return this
  }
  /** A cylinder along Y unless rotated. */
  cyl(rTop: number, rBottom: number, h: number, x: number, y: number, z: number, color: Token | string, rx = 0, ry = 0, rz = 0, segments = 10, gain = 1) {
    return this.add(new THREE.CylinderGeometry(rTop, rBottom, h, segments), x, y, z, color, rx, ry, rz, gain)
  }
  /** A round bar between two points — cables, arms, rails. */
  beam(r: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, color: Token | string, segments = 6) {
    const len = Math.hypot(bx - ax, by - ay, bz - az)
    const g = new THREE.CylinderGeometry(r, r, len, segments)
    q.setFromUnitVectors(UP, p.set(bx - ax, by - ay, bz - az).normalize())
    m.compose(p.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), q, s)
    g.applyMatrix4(m)
    return this.add(g, 0, 0, 0, color)
  }
  get empty() { return this.parts.length === 0 }
  build() {
    const g = mergeGeometries(this.parts.map((part) => (part.index ? part.toNonIndexed() : part)), false)
    this.parts.forEach((part) => part.dispose())
    this.parts = []
    return g ?? new THREE.BufferGeometry()
  }
}

export type Quad = { x: number; y: number; z: number; w: number; h: number; ry?: number; rx?: number; rect?: Rect }

/** Many textured faces as one geometry, each sampling its own cell of an atlas. */
/** `level`, when given, adds a vertex colour at that grey so the faces can take a lighting bake. */
export function quadsGeometry(quads: Quad[], level?: number) {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = []
  const v = new THREE.Vector3(), n = new THREE.Vector3()
  quads.forEach((quad, i) => {
    e.set(quad.rx ?? 0, quad.ry ?? 0, 0, 'YXZ')
    q.setFromEuler(e)
    const r = quad.rect ?? { u0: 0, v0: 0, u1: 1, v1: 1 }
    const corners = [[-0.5, -0.5, r.u0, r.v0], [0.5, -0.5, r.u1, r.v0], [0.5, 0.5, r.u1, r.v1], [-0.5, 0.5, r.u0, r.v1]]
    n.set(0, 0, 1).applyQuaternion(q)
    for (const [cx, cy, u, vv] of corners) {
      v.set(cx * quad.w, cy * quad.h, 0).applyQuaternion(q)
      pos.push(v.x + quad.x, v.y + quad.y, v.z + quad.z)
      nor.push(n.x, n.y, n.z)
      uv.push(u, vv)
    }
    idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3)
  })
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  if (level !== undefined) g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.length).fill(level), 3))
  g.setIndex(idx)
  return g
}

/** Scaled unit boxes in one InstancedMesh: [x, y, z, sx, sy, sz, rotY?, colour?]. */
export type BoxInst = { x: number; y: number; z: number; sx: number; sy: number; sz: number; ry?: number; rx?: number; rz?: number; color?: THREE.Color }
export function writeInstances(mesh: THREE.InstancedMesh, items: BoxInst[]) {
  items.forEach((it, i) => {
    e.set(it.rx ?? 0, it.ry ?? 0, it.rz ?? 0, 'YXZ')
    m.compose(p.set(it.x, it.y, it.z), q.setFromEuler(e), s.set(it.sx, it.sy, it.sz))
    mesh.setMatrixAt(i, m)
    if (it.color) mesh.setColorAt(i, it.color)
  })
  s.set(1, 1, 1)
  mesh.count = items.length
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  mesh.computeBoundingSphere()
}

/** Yaw that turns a face (local +Z) to look into the alley from a side wall. */
export const faceInward = (side: 1 | -1) => (side === 1 ? -Math.PI / 2 : Math.PI / 2)

/**
 * Printed faces — flat tickets and bands wrapped round a cylinder — as one
 * geometry sampling one atlas, with a vertex colour so they can take a lighting bake.
 */
export class FaceBuilder {
  private pos: number[] = []
  private nor: number[] = []
  private uv: number[] = []
  private idx: number[] = []
  private v = new THREE.Vector3()
  private n = new THREE.Vector3()

  get empty() { return this.idx.length === 0 }
  quad(quad: Quad) {
    e.set(quad.rx ?? 0, quad.ry ?? 0, 0, 'YXZ')
    q.setFromEuler(e)
    const r = quad.rect ?? { u0: 0, v0: 0, u1: 1, v1: 1 }
    const base = this.pos.length / 3
    this.n.set(0, 0, 1).applyQuaternion(q)
    for (const [cx, cy, u, vv] of [[-0.5, -0.5, r.u0, r.v0], [0.5, -0.5, r.u1, r.v0], [0.5, 0.5, r.u1, r.v1], [-0.5, 0.5, r.u0, r.v1]]) {
      this.v.set(cx * quad.w, cy * quad.h, 0).applyQuaternion(q)
      this.pos.push(this.v.x + quad.x, this.v.y + quad.y, this.v.z + quad.z)
      this.nor.push(this.n.x, this.n.y, this.n.z)
      this.uv.push(u, vv)
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  /** A label wrapped round an upright cylinder at (x, z): `arc` radians of it, centred on the way `ry` faces. */
  band(x: number, y: number, z: number, radius: number, h: number, ry: number, rect: Rect, arc: number, segments = 8) {
    const base = this.pos.length / 3
    for (let i = 0; i <= segments; i++) {
      const t = i / segments
      const a = ry + (t - 0.5) * arc
      const nx = Math.sin(a), nz = Math.cos(a)
      const u = rect.u0 + (rect.u1 - rect.u0) * t
      for (const [dy, vv] of [[-h / 2, rect.v0], [h / 2, rect.v1]]) {
        this.pos.push(x + nx * radius, y + dy, z + nz * radius)
        this.nor.push(nx, 0, nz)
        this.uv.push(u, vv)
      }
      if (i < segments) {
        const k = base + i * 2
        this.idx.push(k, k + 2, k + 3, k, k + 3, k + 1)
      }
    }
  }
  build(level: number) {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(this.pos.length).fill(level), 3))
    g.setIndex(this.idx)
    return g
  }
}
