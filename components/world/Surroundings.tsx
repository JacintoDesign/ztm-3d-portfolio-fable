'use client'
import { Walls } from './surroundings/Walls'
import { Storefronts } from './surroundings/Storefronts'
import { Signs } from './surroundings/Signs'
import { Shops } from './surroundings/Shops'
import { Props } from './surroundings/Props'
import { CrossStreet } from './surroundings/CrossStreet'
import { Weather } from './surroundings/Weather'

/** Scenery. Carries no content: no project names, nothing clickable, nothing raycast against. */
export function Surroundings() {
  return (
    <>
      <Walls />
      <Storefronts />
      <Shops />
      <Signs />
      <Props />
      <CrossStreet />
      <Weather />
    </>
  )
}
