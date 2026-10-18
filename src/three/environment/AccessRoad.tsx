/**
 * Procedural stand-in for the EXIT ROAD environment: the paved road that takes
 * the departing combination from the edge of the garage apron to the
 * highway's far carriageway. The outline is any closed polygon in slot-local
 * XZ; Scene 01 derives it from the vehicle's departure path (so the paving
 * always covers the trailer's swept path) and maps it into this slot.
 *
 * Opaque and permanent (it is part of the place, not a transition effect),
 * drawn as one flat shape with the shared asphalt grain, at the exit-road
 * layer height so it covers the apron edge and the highway's far verge and
 * shoulder where it crosses them (see roadSurface.ts).
 */
import { useEffect, useMemo } from 'react'
import { Shape, Vector2 } from 'three'
import { createGrainTexture, FLAT_EULER, GRAIN_TILE, LIFT, roadMaterial } from './roadSurface'
import type { XZ } from './slotSpace'

export interface AccessRoadProps {
  /** Closed outline in slot-local XZ (metres). */
  outline: readonly XZ[]
  /** Y of the ground plane, slot-local. */
  groundY: number
  color: string
  grain: number
}

export function AccessRoad({ outline, groundY, color, grain }: AccessRoadProps) {
  const texture = useMemo(() => {
    const t = createGrainTexture(grain)
    // Shape UVs are metres; one tile covers GRAIN_TILE metres.
    t.repeat.set(1 / GRAIN_TILE, 1 / GRAIN_TILE)
    return t
  }, [grain])
  const material = useMemo(() => roadMaterial(color, 0.95, texture), [color, texture])
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => () => texture.dispose(), [texture])

  const shape = useMemo(() => {
    if (outline.length < 3) return null
    // Shape space (x, y) maps to slot-local (x, −z) once the mesh is laid flat with a −90° X rotation.
    return new Shape(outline.map(([x, z]) => new Vector2(x, -z)))
  }, [outline])

  if (!shape) return null
  return (
    <mesh name="exit-road" position={[0, groundY + LIFT.exitRoad, 0]} rotation={FLAT_EULER} material={material} receiveShadow>
      <shapeGeometry args={[shape, 1]} />
    </mesh>
  )
}
