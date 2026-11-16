'use client'
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { writeInstances, type BoxInst } from '@/lib/geo'

// Shared geometry, created once at module scope and reused everywhere.
export const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1)
export const UNIT_CYL = new THREE.CylinderGeometry(1, 1, 1, 12)
export const UNIT_PLANE = new THREE.PlaneGeometry(1, 1)
/** A unit plane lying flat, facing up. */
export const FLOOR_PLANE = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)

/** The backdrop is never raycast against (§2.4). */
export const noRaycast = () => null

/** One InstancedMesh of scaled unit geometry, written once at mount. */
export function Instanced({ items, geometry = UNIT_BOX, children, renderOrder }: { items: BoxInst[]; geometry?: THREE.BufferGeometry; children: ReactNode; renderOrder?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    if (ref.current) writeInstances(ref.current, items)
  }, [items])
  if (!items.length) return null
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, items.length]} raycast={noRaycast} renderOrder={renderOrder}>
      {children}
    </instancedMesh>
  )
}
