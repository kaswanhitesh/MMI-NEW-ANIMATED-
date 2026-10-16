/**
 * TEMPORARY development placeholder for the puller truck — see
 * PLACEHOLDER_NOTICE in ./placeholderMaterials.
 *
 * A stand-in silhouette with a heavy-haul puller / ballast-tractor read, built
 * from boxes and cylinders so Scene 01 can be developed and tested before the
 * final GLB arrives. It is NOT a representation of any real vehicle.
 *
 * Every dimension is derived from `entry.footprint` (length along X, width
 * along Z, height along Y). The fifth-wheel / coupling plate is centred on
 * `entry.anchors.coupling` with its TOP face at the anchor height, so the
 * layout maths in src/scenes/scene-01-coupling/layout.ts stays true. Local
 * origin = footprint centre at ground level (tyre contact at y = 0); nose at
 * −X, coupling plate at +X.
 *
 * Draw calls: 20 single meshes + 1 instanced tyre mesh + 1 instanced rim mesh.
 */
import { useMemo } from 'react'
import type { ModelManifestEntry, Vec3 } from '../assets/types'
import { PLACEHOLDER_MATERIALS as MAT } from './placeholderMaterials'
import { Block, Tube } from './placeholderPrimitives'
import { PlaceholderRims, PlaceholderWheels } from './PlaceholderWheels'

/* Nominal placeholder dimensions (metres), chosen for a believable silhouette only. */
const TYRE_RADIUS = 0.55
const TYRE_WIDTH = 0.4
/** Clearance between the two tyres of a twin wheel. */
const TWIN_GAP = 0.06
/** Fifth-wheel / coupling plate footprint and thickness. */
const PLATE_SIZE = 1.4
const PLATE_THICKNESS = 0.15
const RAIL_HEIGHT = 0.3
const RAIL_WIDTH = 0.14
const STACK_RADIUS = 0.1
const TANK_RADIUS = 0.3

/** Mirror factors along Z for parts that exist on both sides of the vehicle. */
const SIDES = [-1, 1] as const

interface PullerDimensions {
  nose: number
  rear: number
  halfWidth: number
  height: number
  /** Anchor (coupling plate centre / top) in local metres. */
  anchor: Vec3
  /** Top of the chassis rails. */
  railTop: number
  /** Lateral offset of each chassis rail centreline. */
  railZ: number
  /** Underside of the cab and ballast body — just above the tyre tops. */
  bodyFloor: number
  cabFront: number
  cabRear: number
  cabTop: number
  cabHalfWidth: number
  ballastFront: number
  ballastRear: number
  ballastTop: number
  /** Longitudinal centre of the rear (drive) bogie. */
  driveCentre: number
  /** Axle x positions: two steer axles then two drive axles. */
  axleXs: readonly number[]
  /** Lateral centre of the outer tyres. */
  outerZ: number
  /** Fuel tank centre x and length. */
  tankCentreX: number
  tankLength: number
  /** Tyre centres for the instanced wheel set. */
  tyres: readonly Vec3[]
}

/** Derives every placeholder dimension from the manifest footprint and coupling anchor. */
function derivePullerDimensions(entry: ModelManifestEntry): PullerDimensions {
  const { length, width, height } = entry.footprint
  const anchor = entry.anchors.coupling
  const nose = -length / 2
  const rear = length / 2
  const halfWidth = width / 2

  // Running gear: two steer axles behind the bumper, a twin-wheel drive bogie under the coupling plate.
  const steerFront = nose + 0.13 * length
  const steerRear = steerFront + 1.5
  const driveCentre = Math.min(anchor[0] - 0.8, rear - 1.3)
  const driveFront = driveCentre - 0.7
  const driveRear = driveCentre + 0.7
  const axleXs = [steerFront, steerRear, driveFront, driveRear]
  const outerZ = halfWidth - TYRE_WIDTH / 2
  const innerZ = outerZ - TYRE_WIDTH - TWIN_GAP
  const tyres: Vec3[] = []
  for (const x of [steerFront, steerRear]) {
    for (const side of SIDES) tyres.push([x, TYRE_RADIUS, side * outerZ])
  }
  for (const x of [driveFront, driveRear]) {
    for (const side of SIDES) tyres.push([x, TYRE_RADIUS, side * outerZ], [x, TYRE_RADIUS, side * innerZ])
  }

  // Chassis and bodies.
  const railTop = TYRE_RADIUS + 0.45
  const railZ = Math.min(0.55, halfWidth - 0.5)
  const bodyFloor = railTop + 0.12
  const cabFront = nose + 0.05
  const cabRear = cabFront + Math.min(3.2, Math.max(2, 0.26 * length))
  const cabTop = height - 0.12
  const cabHalfWidth = halfWidth - 0.2
  const ballastFront = cabRear + 0.45
  const ballastRear = anchor[0] - PLATE_SIZE / 2 - 0.6
  const ballastTop = 0.62 * height

  // Side-mounted tanks fill the free span between the steer and drive wheels.
  const spanStart = steerRear + TYRE_RADIUS
  const spanEnd = driveFront - TYRE_RADIUS
  const tankLength = Math.min(3, Math.max(1.2, spanEnd - spanStart - 0.9))
  const tankCentreX = (spanStart + spanEnd) / 2

  return {
    nose,
    rear,
    halfWidth,
    height,
    anchor,
    railTop,
    railZ,
    bodyFloor,
    cabFront,
    cabRear,
    cabTop,
    cabHalfWidth,
    ballastFront,
    ballastRear,
    ballastTop,
    driveCentre,
    axleXs,
    outerZ,
    tankCentreX,
    tankLength,
    tyres,
  }
}

/**
 * TEMPORARY placeholder puller truck (see PLACEHOLDER_NOTICE). Renders a
 * `group` scaled by `sceneScale`, tagged `userData.placeholder = true`, whose
 * coupling plate top sits exactly at `entry.anchors.coupling`.
 */
export function PlaceholderPullerTruck({ entry, sceneScale }: { entry: ModelManifestEntry; sceneScale: number }) {
  const d = useMemo(() => derivePullerDimensions(entry), [entry])
  const [ax, ay, az] = d.anchor
  const plateBottom = ay - PLATE_THICKNESS
  const pedestalBottom = Math.min(d.railTop, plateBottom - 0.02)

  return (
    <group scale={sceneScale} userData={{ placeholder: true, modelId: entry.id }} name={`placeholder:${entry.id}`}>
      {/* Cab at the −X end, slightly narrower than the footprint, with a visor, grille and bumper giving the nose its read. */}
      <Block name="cab" x={[d.cabFront, d.cabRear]} y={[d.bodyFloor, d.cabTop]} z={[-d.cabHalfWidth, d.cabHalfWidth]} material={MAT.bodyPaint} />
      <Block
        name="cab-visor"
        x={[d.nose, d.nose + 0.45]}
        y={[d.height - 0.3, d.height - 0.02]}
        z={[-d.cabHalfWidth + 0.05, d.cabHalfWidth - 0.05]}
        material={MAT.accent}
      />
      <Block
        name="grille"
        x={[d.nose, d.nose + 0.08]}
        y={[d.bodyFloor + 0.1, d.bodyFloor + 1]}
        z={[-d.cabHalfWidth + 0.3, d.cabHalfWidth - 0.3]}
        material={MAT.steel}
      />
      <Block name="bumper" x={[d.nose, d.nose + 0.35]} y={[0.45, 0.95]} z={[-d.halfWidth + 0.1, d.halfWidth - 0.1]} material={MAT.steel} />

      {/* Chassis rail pair running the full length under the bodies. */}
      {SIDES.map((side) => (
        <Block
          key={side}
          x={[d.nose + 0.3, d.rear]}
          y={[d.railTop - RAIL_HEIGHT, d.railTop]}
          z={[side * d.railZ - RAIL_WIDTH / 2, side * d.railZ + RAIL_WIDTH / 2]}
          material={MAT.steel}
        />
      ))}

      {/* Exhaust stacks behind the cab, inboard of the steer wheels. */}
      {SIDES.map((side) => (
        <Tube
          key={side}
          radius={STACK_RADIUS}
          length={2.4}
          position={[d.cabRear + 0.22, TYRE_RADIUS * 2 + 1.2, side * (d.cabHalfWidth - 0.4)]}
          material={MAT.steel}
        />
      ))}

      {/* Ballast body with a narrower stack of weight slabs on top. */}
      <Block
        name="ballast-body"
        x={[d.ballastFront, d.ballastRear]}
        y={[d.bodyFloor, d.ballastTop]}
        z={[-d.halfWidth + 0.15, d.halfWidth - 0.15]}
        material={MAT.bodyPaint}
      />
      <Block
        name="ballast-slabs"
        x={[d.ballastFront + 0.35, d.ballastRear - 0.35]}
        y={[d.ballastTop, d.ballastTop + 0.32]}
        z={[-d.halfWidth + 0.45, d.halfWidth - 0.45]}
        material={MAT.steel}
      />

      {/* Side tanks between the steer and drive wheels (cylinder axis turned onto X). */}
      {SIDES.map((side) => (
        <Tube
          key={side}
          radius={TANK_RADIUS}
          length={d.tankLength}
          position={[d.tankCentreX, TANK_RADIUS + 0.32, side * (d.halfWidth - TANK_RADIUS - 0.03)]}
          rotation={[0, 0, Math.PI / 2]}
          material={MAT.steel}
        />
      ))}

      {/* Flat mudguards over the twin drive wheels. */}
      {SIDES.map((side) => (
        <Block
          key={side}
          x={[d.driveCentre - 1.5, Math.min(d.driveCentre + 1.5, d.rear - 0.05)]}
          y={[TYRE_RADIUS * 2 + 0.03, TYRE_RADIUS * 2 + 0.11]}
          z={side < 0 ? [-d.halfWidth, -0.75] : [0.75, d.halfWidth]}
          material={MAT.steel}
        />
      ))}

      {/* Fifth-wheel / coupling plate: centred on the anchor, top face at the anchor height, on a short pedestal. */}
      <Block
        name="coupling-plate"
        x={[ax - PLATE_SIZE / 2, ax + PLATE_SIZE / 2]}
        y={[plateBottom, ay]}
        z={[az - PLATE_SIZE / 2, az + PLATE_SIZE / 2]}
        material={MAT.steel}
      />
      <Block
        name="coupling-pedestal"
        x={[ax - 0.5, ax + 0.5]}
        y={[pedestalBottom, plateBottom]}
        z={[az - d.railZ - RAIL_WIDTH / 2, az + d.railZ + RAIL_WIDTH / 2]}
        material={MAT.steel}
      />

      {/* Axle beams, then every tyre in one instanced mesh and every rim in another. */}
      {d.axleXs.map((x) => (
        <Block key={x} x={[x - 0.09, x + 0.09]} y={[TYRE_RADIUS - 0.08, TYRE_RADIUS + 0.08]} z={[-d.outerZ, d.outerZ]} material={MAT.steel} />
      ))}
      <PlaceholderWheels positions={d.tyres} radius={TYRE_RADIUS} width={TYRE_WIDTH} />
      <PlaceholderRims positions={d.tyres} radius={TYRE_RADIUS * 0.58} width={TYRE_WIDTH + 0.04} />
    </group>
  )
}
