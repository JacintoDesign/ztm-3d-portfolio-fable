import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// Turning a glTF into something instanceable: bake the node transforms into the
// vertices, merge by material, normalise to a target length with the nose at
// +X, then *measure* rather than predict. None of this is a property of a car.
export type PreparedPart = { geometry: THREE.BufferGeometry; material: THREE.Material; name: string }
export type Prepared = { parts: PreparedPart[]; size: { length: number; width: number; height: number } }

export function prepareModel(scene: THREE.Object3D, targetLength: number, yawOffset: number): Prepared {
  scene.updateMatrixWorld(true)
  const groups = new Map<THREE.Material, THREE.BufferGeometry[]>()
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const src = mesh.geometry
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', src.attributes.position.clone())
    g.setAttribute('normal', (src.attributes.normal ?? src.attributes.position).clone())
    g.setAttribute('uv', src.attributes.uv ? src.attributes.uv.clone() : new THREE.BufferAttribute(new Float32Array(src.attributes.position.count * 2), 2))
    if (src.index) g.setIndex(src.index.clone())
    g.applyMatrix4(mesh.matrixWorld)
    const flat = g.index ? g.toNonIndexed() : g
    if (!src.attributes.normal) flat.computeVertexNormals()
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    if (!groups.has(material)) groups.set(material, [])
    groups.get(material)!.push(flat)
  })
  const parts: PreparedPart[] = []
  const box = new THREE.Box3()
  for (const [material, list] of groups) {
    const geometry = mergeGeometries(list, false)
    if (!geometry) continue
    geometry.rotateY(yawOffset)
    geometry.computeBoundingBox()
    box.union(geometry.boundingBox!)
    parts.push({ geometry, material, name: material.name })
  }
  // Nothing in a glTF says which axis is its length. If the long axis landed on Z the offset was
  // wrong for this model, so it is undone rather than compounded (a nose already on X stays there).
  if (box.max.z - box.min.z > box.max.x - box.min.x) {
    box.makeEmpty()
    for (const p of parts) {
      p.geometry.rotateY(-yawOffset || Math.PI / 2)
      p.geometry.computeBoundingBox()
      box.union(p.geometry.boundingBox!)
    }
  }
  const size = box.getSize(new THREE.Vector3())
  const centre = box.getCenter(new THREE.Vector3())
  const k = targetLength / size.x
  for (const p of parts) {
    p.geometry.translate(-centre.x, -box.min.y, -centre.z)
    p.geometry.scale(k, k, k)
    p.geometry.computeBoundingBox()
    p.geometry.computeBoundingSphere()
  }
  return { parts, size: { length: size.x * k, width: size.z * k, height: size.y * k } }
}

/** Fold parts that share a destination into one geometry. */
export function foldParts(parts: PreparedPart[]) {
  const g = mergeGeometries(parts.map((p) => p.geometry), false)
  return g ?? new THREE.BufferGeometry()
}
