/**
 * Instanced wheels for the TEMPORARY placeholder vehicles — see
 * PLACEHOLDER_NOTICE in ./placeholderMaterials.
 *
 * `PlaceholderWheels` draws every tyre of a vehicle with ONE InstancedMesh and
 * `PlaceholderRims` draws the matching hub discs with another, so even the
 * 32-wheel trailer spends two draw calls on its running gear. The cylinder
 * geometry keeps three.js's default Y axis; each instance matrix carries the
 * quarter turn that lays that axis along the requested axle direction.
 */
import { useLayoutEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { Euler, Matrix4, Quaternion, Vector3 } from 'three'
import type { InstancedMesh, Material } from 'three'
import type { Vec3 } from '../assets/types'
import { PLACEHOLDER_MATERIALS } from './placeholderMaterials'

/** Axle direction the wheels spin about. Only 'z' (axles across the vehicle) is implemented. */
export type WheelAxis = 'z'

export interface PlaceholderWheelsProps {
  /** Wheel centres in the vehicle's local metres; y = rolling radius puts the contact patch at y = 0. */
  positions: readonly Vec3[]
  /** Cylinder radius in metres. */
  radius: number
  /** Cylinder length (tyre width) in metres. */
  width: number
  /** Axle direction; defaults to 'z'. */
  axis?: WheelAxis
}

/** Rotation that maps the cylinder's Y axis onto each supported axle axis. */
const AXIS_ROTATION: Readonly<Record<WheelAxis, Quaternion>> = {
  z: new Quaternion().setFromEuler(new Euler(Math.PI / 2, 0, 0)),
}

const TYRE_SEGMENTS = 24
const RIM_SEGMENTS = 20

/* Scratch objects reused while writing instance matrices. */
const _matrix = new Matrix4()
const _position = new Vector3()
const _unitScale = new Vector3(1, 1, 1)

interface InstancedCylindersProps extends Required<PlaceholderWheelsProps> {
  material: Material
  segments: number
  name: string
}

/** One InstancedMesh of identical cylinders, one per position, shadow-casting and frustum-culled. */
function InstancedCylinders({ positions, radius, width, axis, material, segments, name }: InstancedCylindersProps) {
  const ref = useRef<InstancedMesh>(null)
  const invalidate = useThree((state) => state.invalidate)

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const rotation = AXIS_ROTATION[axis]
    positions.forEach(([x, y, z], index) => {
      _position.set(x, y, z)
      _matrix.compose(_position, rotation, _unitScale)
      mesh.setMatrixAt(index, _matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    // Bounds depend on both the instance matrices and the (possibly rebuilt) geometry.
    mesh.computeBoundingSphere()
    invalidate()
  }, [positions, axis, radius, width, invalidate])

  return (
    // Keyed on the instance count so a different wheel set remounts the mesh instead of resizing it.
    <instancedMesh key={positions.length} ref={ref} name={name} args={[undefined, undefined, positions.length]} material={material} castShadow receiveShadow>
      <cylinderGeometry args={[radius, radius, width, segments, 1]} />
    </instancedMesh>
  )
}

/** ONE InstancedMesh of tyres (rubber material) centred on `positions`. */
export function PlaceholderWheels({ positions, radius, width, axis = 'z' }: PlaceholderWheelsProps) {
  return (
    <InstancedCylinders
      positions={positions}
      radius={radius}
      width={width}
      axis={axis}
      material={PLACEHOLDER_MATERIALS.tyre}
      segments={TYRE_SEGMENTS}
      name="placeholder-tyres"
    />
  )
}

/**
 * ONE InstancedMesh of rim / hub discs sharing the tyres' `positions`. Pass a
 * radius smaller than the tyre's and a width a few centimetres larger so the
 * disc faces stand proud of the sidewalls.
 */
export function PlaceholderRims({ positions, radius, width, axis = 'z' }: PlaceholderWheelsProps) {
  return (
    <InstancedCylinders
      positions={positions}
      radius={radius}
      width={width}
      axis={axis}
      material={PLACEHOLDER_MATERIALS.rim}
      segments={RIM_SEGMENTS}
      name="placeholder-rims"
    />
  )
}
