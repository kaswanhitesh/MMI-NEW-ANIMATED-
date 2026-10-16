/**
 * Internal mesh primitives shared by the TEMPORARY placeholder vehicles — see
 * PLACEHOLDER_NOTICE in ./placeholderMaterials. Not part of the public barrel.
 *
 * One unit BoxGeometry and one unit CylinderGeometry are created at module
 * level; `Block`, `Bar` and `Tube` reuse them through per-mesh scaling, so a
 * whole placeholder vehicle costs two shared geometries plus its instanced
 * wheels. Like the shared materials they are never disposed: React Three Fiber
 * only disposes objects it created itself, and these arrive as props.
 * Every primitive casts and receives shadows.
 */
import { BoxGeometry, CylinderGeometry } from 'three'
import type { Material } from 'three'
import type { Vec3 } from '../assets/types'

/** Radial resolution of every cylindrical placeholder part — kept modest on purpose. */
const RADIAL_SEGMENTS = 24

const UNIT_BOX = new BoxGeometry(1, 1, 1)
const UNIT_CYLINDER = new CylinderGeometry(1, 1, 1, RADIAL_SEGMENTS, 1)

/** Closed interval along one axis, in the vehicle's local metres. */
type Span = readonly [from: number, to: number]

interface PrimitiveProps {
  material: Material
  /** Optional Object3D name for development diagnostics (`scene.getObjectByName`). */
  name?: string
}

/** Axis-aligned box filling the given x / y / z extents. */
export function Block({ x, y, z, material, name }: PrimitiveProps & { x: Span; y: Span; z: Span }) {
  return (
    <mesh
      name={name}
      geometry={UNIT_BOX}
      material={material}
      position={[(x[0] + x[1]) / 2, (y[0] + y[1]) / 2, (z[0] + z[1]) / 2]}
      scale={[x[1] - x[0], y[1] - y[0], z[1] - z[0]]}
      castShadow
      receiveShadow
    />
  )
}

/** Box of `size` = [x, y, z] metres centred on `position`, with an optional Euler XYZ `rotation` (radians). */
export function Bar({ size, position, rotation, material, name }: PrimitiveProps & { size: Vec3; position: Vec3; rotation?: Vec3 }) {
  return <mesh name={name} geometry={UNIT_BOX} material={material} position={position} rotation={rotation} scale={size} castShadow receiveShadow />
}

/** Closed cylinder of `radius` and `length` whose axis is local Y before `rotation` (Euler XYZ, radians) is applied. */
export function Tube({
  radius,
  length,
  position,
  rotation,
  material,
  name,
}: PrimitiveProps & { radius: number; length: number; position: Vec3; rotation?: Vec3 }) {
  return (
    <mesh
      name={name}
      geometry={UNIT_CYLINDER}
      material={material}
      position={position}
      rotation={rotation}
      scale={[radius, length, radius]}
      castShadow
      receiveShadow
    />
  )
}
