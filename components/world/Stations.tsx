'use client'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { CART, EMISSIVE, LIGHTS, LOOK, MAILBOX as M, MATERIALS, PROPS, STATIONS } from '@/lib/world'
import type { Channel } from '@/lib/content'
import { resolveTier } from '@/lib/tier'
import { getState, openOverlay, setState } from '@/lib/store'
import { registerStation } from '@/lib/stations'
import { CART_X } from '@/lib/props'
import { flap } from '@/lib/audio'
import { MeshBuilder, quadsGeometry, tokenColor, writeInstances, type BoxInst, type Quad } from '@/lib/geo'
import { buildAtlas, toTexture } from '@/lib/textures/canvas'
import { labelCell, warmPanelCell } from '@/lib/textures/painted'
import { Instanced, UNIT_BOX, noRaycast } from './Instanced'
import { mats } from './materials'

export function openChannel(c: Channel) {
  if (c.url.startsWith('mailto:')) window.location.href = c.url
  else window.open(c.url, '_blank', 'noopener,noreferrer')
}

/**
 * §2.2 and §2.3 — the food cart's lit faces and the mailbox bank. One box per
 * channel in CONTENT.md, generated: nothing here knows how many there are.
 */
export function Stations({ channels }: { channels: Channel[] }) {
  const m = mats()
  const desktop = resolveTier() === 'desktop'
  const bank = useRef<THREE.InstancedMesh>(null)

  const built = useMemo(() => {
    const n = channels.length
    const rows = Math.max(1, Math.ceil(n / M.columns))
    const plateX = M.wallX + M.plate.proud
    const boxX = plateX + M.box.depth / 2
    const faceX = plateX + M.box.depth
    const rowY = (r: number) => M.rowY[0] - r * M.pitch.row
    // Facing the bank you look along −X, so left-to-right runs from +z to −z.
    const at = (i: number) => ({ y: rowY(Math.floor(i / M.columns)), z: M.z + ((M.columns - 1) / 2 - (i % M.columns)) * M.pitch.column })

    const boxColor = tokenColor('metalDark'), plateColor = tokenColor('shutter'), boltColor = tokenColor('concrete')
    const items: BoxInst[] = channels.map((_, i) => ({ x: boxX, ...at(i), sx: M.box.depth, sy: M.box.h, sz: M.box.w, color: boxColor }))
    // The plate is sized from the grid: a dimension that must agree with a count cannot be a literal.
    const pw = (M.columns - 1) * M.pitch.column + M.box.w + 2 * M.plate.margin
    const ph = (rows - 1) * M.pitch.row + M.box.h + 2 * M.plate.margin
    const py = (rowY(0) + rowY(rows - 1)) / 2
    items.push({ x: M.wallX + M.plate.proud / 2, y: py, z: M.z, sx: M.plate.proud, sy: ph, sz: pw, color: plateColor })
    for (const ey of [-1, 1]) for (const ez of [-1, 1]) {
      items.push({ x: plateX + 0.006, y: py + ey * (ph / 2 - M.bolt.inset), z: M.z + ez * (pw / 2 - M.bolt.inset), sx: 0.012, sy: M.bolt.size * 0.72, sz: M.bolt.size * 0.72, rx: Math.PI / 4, color: boltColor })
    }

    const atlas = buildAtlas([...channels.map((c) => labelCell(c.name)), warmPanelCell(true), warmPanelCell(false)])
    const tex = toTexture(atlas.canvas)
    const doorY = (y: number) => y - M.box.h * 0.17 // the door sits low on the face, under the slot
    const labels: Quad[] = channels.map((_, i) => ({ x: faceX + M.label.proud, ...at(i), y: doorY(at(i).y), w: M.label.size[0], h: M.label.size[1], ry: Math.PI / 2, rect: atlas.rects[i] }))
    // What makes a box a letterbox: a rain cap, a hinged door with its hinges and lock, a hooded slot,
    // a card holder for the name, a signal flag on an arm — and post left sticking out of two of them.
    const deco = new MeshBuilder()
    const flags: BoxInst[] = []
    const h = M.box.h, w = M.box.w
    channels.forEach((_, i) => {
      const { y, z } = at(i)
      const dy = doorY(y), slotY = y + h * 0.3
      deco.box(M.box.depth + 0.03, 0.014, w + 0.03, boxX + 0.015, y + h / 2 + 0.007, z, 'metalDark')
      deco.box(M.door.proud, h * M.door.height, w - 0.07, faceX + M.door.proud / 2, dy, z, 'shutter')
      for (const e of [-1, 1]) deco.cyl(0.008, 0.008, 0.04, faceX + M.door.proud + 0.004, dy + e * 0.045, z + (w / 2 - 0.03), 'concrete', 0, 0, 0, 6)
      deco.cyl(0.012, 0.012, 0.01, faceX + 0.005, slotY, z - (w / 2 - 0.045), 'concrete', 0, 0, Math.PI / 2, 8) // the lock, beside the slot
      deco.box(0.006, M.label.size[1] + 0.024, M.label.size[0] + 0.024, faceX + M.door.proud + 0.003, dy, z, 'void')
      deco.box(0.008, M.slot.height, w * M.slot.width, faceX + 0.004, slotY, z, 'void')
      deco.box(0.04, 0.01, w * M.slot.width + 0.03, faceX + 0.02, slotY + M.slot.height / 2 + 0.008, z, 'metalDark', 0, 0, -0.25)
      if (i % 3 === 1) deco.box(0.1, 0.004, 0.2, faceX + 0.03, slotY, z + 0.02 - (i % 2) * 0.05, 'signWhite', 0, 0, -0.18)
      // The flag stands on an arm at the box's corner; its plate is what glows.
      const fz = z - w / 2 + 0.03
      deco.box(0.008, 0.075, 0.008, faceX - 0.05, y + h / 2 + 0.05, fz, 'metalDark')
      flags.push({ x: faceX - 0.022, y: y + h / 2 + 0.07, z: fz, sx: M.flag, sy: M.flag * 0.7, sz: 0.01, color: tokenColor(M.flagColors[i % M.flagColors.length], EMISSIVE.mailboxFlag) })
    })
    // Over the bank: a small pitched canopy on two brackets, with the strip lamp under it that lights the names.
    const topY = py + ph / 2, cd = M.box.depth + M.canopy.overhang
    deco.box(cd, 0.02, pw + 0.1, plateX + cd / 2 - 0.02, topY + M.canopy.rise + 0.03, M.z, 'metalDark', 0, 0, -0.14)
    for (const e of [-1, 1]) deco.beam(0.01, plateX, topY - 0.02, M.z + e * (pw / 2 - 0.1), plateX + cd * 0.7, topY + M.canopy.rise - 0.02, M.z + e * (pw / 2 - 0.1), 'metalDark', 5)
    flags.push({ x: plateX + M.box.depth * 0.6, y: topY + 0.012, z: M.z, sx: 0.025, sy: 0.016, sz: pw * 0.8, color: tokenColor('signWhite', EMISSIVE.mailboxLabel) })
    // And a parcel shelf under it, with something left on it.
    const botY = py - ph / 2
    deco.box(M.box.depth * 0.8, 0.02, pw * 0.7, plateX + M.box.depth * 0.4, botY - 0.06, M.z, 'metalDark')
    for (const e of [-1, 1]) deco.beam(0.008, plateX, botY - 0.18, M.z + e * pw * 0.3, plateX + M.box.depth * 0.7, botY - 0.07, M.z + e * pw * 0.3, 'metalDark', 5)
    deco.box(0.16, 0.1, 0.22, plateX + 0.12, botY, M.z + 0.2, 'crateKraft', 0.2)
    deco.box(0.2, 0.012, 0.14, plateX + 0.13, botY - 0.044, M.z - 0.25, 'signWhite', -0.3)

    // The cart's lit faces: the sign band on the bar and five panels under the canopy.
    const [, depth] = PROPS.cart.size
    const front = CART_X.front
    const band = atlas.rects[n], panel = atlas.rects[n + 1]
    const cart: Quad[] = [{ x: front + 0.11 - CART.signBand.proud - 0.02, y: CART.signBand.y, z: PROPS.cart.z, w: CART.signBand.size[0], h: CART.signBand.size[1], ry: -Math.PI / 2, rect: band }]
    for (let i = 0; i < CART.canopyPanels.count; i++) {
      cart.push({ x: front + depth / 2, y: CART.canopyPanels.y - 0.02, z: PROPS.cart.z + (i - (CART.canopyPanels.count - 1) / 2) * CART.canopyPanels.pitch, w: CART.canopyPanels.size[0], h: CART.canopyPanels.size[1], rx: Math.PI / 2, rect: panel })
    }
    return {
      items, flags, count: n, deco: deco.build(), boxColor, hoverColor: tokenColor('scooterPaint'),
      labels: quadsGeometry(labels), labelMat: m.emissivePanel(tex, EMISSIVE.mailboxLabel),
      cart: quadsGeometry(cart), cartMat: m.emissivePanel(tex, EMISSIVE.bioStationPanel),
      bankMat: new THREE.MeshStandardMaterial({ ...MATERIALS.paintedMetal }),
    }
  }, [channels, m])

  useLayoutEffect(() => {
    if (bank.current) writeInstances(bank.current, built.items)
  }, [built])

  useEffect(() => {
    const offCart = registerStation({ id: 'cart', x: STATIONS.cart.x, z: STATIONS.cart.z, radius: STATIONS.cart.radius, prompt: { desktop: 'E — About', mobile: 'Tap — About' }, open: () => openOverlay('about') })
    const offBank = registerStation({ id: 'mailbox', x: STATIONS.mailbox.x, z: STATIONS.mailbox.z, radius: STATIONS.mailbox.radius, prompt: { desktop: 'Click a Mailbox · E for Overlay', mobile: 'Tap to View All' }, open: () => { flap(); openOverlay('contact') } })
    return () => { offCart(); offBank() }
  }, [])

  // Every box opens its own channel. instanceId is the channel's index; anything after it is plate or bolt.
  const channelOf = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    const s = getState()
    if (s.mode !== 'play' && s.mode !== 'locked') return null
    if (e.distance > STATIONS.mailbox.radius + 2 || e.instanceId === undefined || e.instanceId >= built.count) return null
    return e.instanceId
  }
  // The box under the pointer lifts to the alley's one pale token, so the six read as six things to press.
  const lit = useRef<number | null>(null)
  const highlight = (i: number | null) => {
    const mesh = bank.current
    if (!mesh || lit.current === i) return
    if (lit.current !== null) mesh.setColorAt(lit.current, built.boxColor)
    if (i !== null) mesh.setColorAt(i, built.hoverColor)
    lit.current = i
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }
  const onMove = (e: ThreeEvent<PointerEvent>) => { const i = channelOf(e); highlight(i); setState({ hoverChannel: i }) }
  const onOut = () => { highlight(null); setState({ hoverChannel: null }) }
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > LOOK.clickGuardPx) return // a drag that ended here was a look, not a tap
    const i = channelOf(e)
    if (i === null) return
    e.stopPropagation()
    flap()
    openChannel(channels[i])
  }

  const L4 = LIGHTS.cart, L5 = LIGHTS.mailbox
  return (
    <>
      <instancedMesh ref={bank} args={[UNIT_BOX, built.bankMat, built.items.length]} onPointerMove={onMove} onPointerOut={onOut} onClick={onClick} />
      {/* The label plates stand between the pointer and the box it wants, so they opt out of the raycast. */}
      <mesh geometry={built.deco} material={m.metal} raycast={noRaycast} />
      <mesh geometry={built.labels} material={built.labelMat} raycast={noRaycast} />
      <Instanced items={built.flags}><meshBasicMaterial /></Instanced>
      <mesh geometry={built.cart} material={built.cartMat} raycast={noRaycast} />
      {/* §7 light 4 — the lit canopy, facing down. Mobile drops the type, not the light. */}
      {desktop ? (
        <rectAreaLight position={[...L4.position]} rotation-x={-Math.PI / 2} width={L4.size[1]} height={L4.size[0]} color={L4.color} intensity={L4.intensity} />
      ) : (
        <pointLight position={[...L4.position]} color={L4.color} intensity={L4.mobilePoint} />
      )}
      {/* §7 light 5 — off the bank face: a station in this world throws light. */}
      <pointLight position={[...L5.position]} color={L5.color} intensity={L5.intensity} distance={L5.distance} decay={L5.decay} />
    </>
  )
}
