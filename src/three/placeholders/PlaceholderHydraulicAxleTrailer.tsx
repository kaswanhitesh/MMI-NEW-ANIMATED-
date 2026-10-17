/**
 * TEMPORARY development placeholder for the hydraulic axle trailer — see
 * PLACEHOLDER_NOTICE in ./placeholderMaterials.
 *
 * A stand-in silhouette with a multi-axle hydraulic modular trailer read — low
 * flat deck, swan-neck gooseneck, eight axle lines of small twin wheels — built
 * from boxes and cylinders so Scene 01 can be developed and tested before the
 * final GLB arrives. It is NOT a representation of any real trailer.
 *
 * Every dimension is derived from `entry.footprint` (length along X, width
 * along Z, height along Y). The gooseneck's coupling pad sits exactly on
 * `entry.anchors.coupling` (pad underside at the anchor height), so the layout
 * maths in src/scenes/scene-01-coupling/layout.ts stays true. Local origin =
 * footprint centre at ground level (tyre contact at y = 0); gooseneck / front
 * connection at −X, deck tail at +X.
 *
 * Coupling clearance against the placeholder puller (anchors coincident, with
 * the current manifest values): the gooseneck tip stays 0.1 m behind the front
 * edge of the puller's coupling plate, nothing of the gooseneck descends below
 * the plate's top face, and the deck front starts about 2 m behind the
 * puller's rear end.
 *
 * Draw calls: 20 single meshes + 1 instanced tyre mesh + 1 instanced rim mesh.
 */
import { useMemo } from 'react'
import type { ModelManifestEntry, Vec3 } from '../assets/types'
import { PLACEHOLDER_MATERIALS as MAT } from './placeholderMaterials'
import { Bar, Block, Tube } from './placeholderPrimitives'
import { PlaceholderRims, PlaceholderWheels } from './PlaceholderWheels'

/* Nominal placeholder dimensions (metres), chosen for a believable silhouette only. */
const TYRE_RADIUS = 0.5
const TYRE_WIDTH = 0.3
/** Clearance between the two tyres of a twin wheel. */
const TWIN_GAP = 0.06
/** Outer tyre faces sit this far inside the side rails: a coplanar face would z-fight with the rail. */
const TYRE_INSET = 0.08
const AXLE_LINES = 8
const DECK_TOP = 1.2
const DECK_THICKNESS = 0.5
/** Round coupling pad under the gooseneck head; its underside is the coupling anchor. */
const PAD_RADIUS = 0.42
const PAD_THICKNESS = 0.06
/** Thickness of the sloping gooseneck member between head and deck. */
const NECK_THICKNESS = 0.44
const HYDRAULIC_RADIUS = 0.07

/** Mirror factors along Z for parts that exist on both sides of the trailer. */
const SIDES = [-1, 1] as const

interface SlopedBar {
  position: Vec3
  rotation: Vec3
  length: number
}

interface TrailerDimensions {
  front: number
  rear: number
  halfWidth: number
  /** Anchor (coupling pad underside centre) in local metres. */
  anchor: Vec3
  deckStart: number
  deckTop: number
  deckBottom: number
  deckHalfWidth: number
  headFront: number
  headRear: number
  headBottom: number
  headTop: number
  headHalfWidth: number
  /** Sloping member from the deck front up to the gooseneck head. */
  neck: SlopedBar
  axleXs: readonly number[]
  /** Lateral centre of the outer tyres. */
  outerZ: number
  /** x positions of the four hydraulic cylinder hints (between axle lines). */
  hydraulicXs: readonly number[]
  /** Tyre centres for the instanced wheel set. */
  tyres: readonly Vec3[]
}

/** Box of `thickness` whose end-face centres sit at (x0, y0) and (x1, y1) in the XY plane, rotated about Z. */
function slopedBar(x0: number, y0: number, x1: number, y1: number, z: number): SlopedBar {
  const dx = x1 - x0
  const dy = y1 - y0
  return {
    position: [(x0 + x1) / 2, (y0 + y1) / 2, z],
    rotation: [0, 0, Math.atan2(dy, dx)],
    length: Math.hypot(dx, dy),
  }
}

/** Derives every placeholder dimension from the manifest footprint and coupling anchor. */
function deriveTrailerDimensions(entry: ModelManifestEntry): TrailerDimensions {
  const { length, width, height } = entry.footprint
  const anchor = entry.anchors.coupling
  const front = -length / 2
  const rear = length / 2
  const halfWidth = width / 2

  // Deck: low and flat from the gooseneck rear to the tail.
  const deckTop = Math.min(DECK_TOP, height - 0.2)
  const deckBottom = deckTop - DECK_THICKNESS
  const deckStart = Math.min(Math.max(anchor[0] + 2.8, front + 1.5), rear - 6)
  const deckHalfWidth = halfWidth - 0.2

  // Gooseneck: a head resting on the coupling pad, joined to the deck by a sloping neck.
  const headTop = Math.min(anchor[1] + 0.5, height - 0.05)
  const headBottom = anchor[1] + PAD_THICKNESS
  const headFront = Math.max(front + 0.1, anchor[0] - 0.6)
  const headRear = Math.min(anchor[0] + 1.4, deckStart - 1.2)
  const headHalfWidth = Math.min(0.85, halfWidth - 0.5)
  const neck = slopedBar(deckStart + 0.1, deckTop - 0.2, headRear - 0.2, (headBottom + headTop) / 2, anchor[2])

  // Running gear: evenly spaced axle lines under the deck, four tyres per line.
  const firstAxle = deckStart + 1.3
  const lastAxle = rear - 1.1
  const pitch = (lastAxle - firstAxle) / (AXLE_LINES - 1)
  const axleXs = Array.from({ length: AXLE_LINES }, (_, i) => firstAxle + i * pitch)
  const outerZ = halfWidth - TYRE_WIDTH / 2 - TYRE_INSET
  const innerZ = outerZ - TYRE_WIDTH - TWIN_GAP
  const tyres: Vec3[] = []
  for (const x of axleXs) {
    for (const side of SIDES) tyres.push([x, TYRE_RADIUS, side * outerZ], [x, TYRE_RADIUS, side * innerZ])
  }
  const hydraulicXs = [firstAxle + 1.5 * pitch, firstAxle + 5.5 * pitch]

  return {
    front,
    rear,
    halfWidth,
    anchor,
    deckStart,
    deckTop,
    deckBottom,
    deckHalfWidth,
    headFront,
    headRear,
    headBottom,
    headTop,
    headHalfWidth,
    neck,
    axleXs,
    outerZ,
    hydraulicXs,
    tyres,
  }
}

/**
 * TEMPORARY placeholder hydraulic axle trailer (see PLACEHOLDER_NOTICE).
 * Renders a `group` scaled by `sceneScale`, tagged `userData.placeholder = true`,
 * whose coupling pad underside sits exactly at `entry.anchors.coupling`.
 */
export function PlaceholderHydraulicAxleTrailer({ entry, sceneScale }: { entry: ModelManifestEntry; sceneScale: number }) {
  const d = useMemo(() => deriveTrailerDimensions(entry), [entry])
  const [ax, ay, az] = d.anchor

  return (
    <group scale={sceneScale} userData={{ placeholder: true, modelId: entry.id }} name={`placeholder:${entry.id}`}>
      {/* Deck with a steel side rail along each edge and a rear bumper bar. */}
      <Block name="deck" x={[d.deckStart, d.rear]} y={[d.deckBottom, d.deckTop]} z={[-d.deckHalfWidth, d.deckHalfWidth]} material={MAT.bodyPaint} />
      {SIDES.map((side) => (
        <Block
          key={side}
          x={[d.deckStart, d.rear]}
          y={[d.deckBottom - 0.08, d.deckTop + 0.02]}
          z={side < 0 ? [-d.halfWidth, -d.deckHalfWidth] : [d.deckHalfWidth, d.halfWidth]}
          material={MAT.steel}
        />
      ))}
      <Block name="rear-bumper" x={[d.rear - 0.25, d.rear]} y={[0.45, 0.67]} z={[-d.halfWidth + 0.15, d.halfWidth - 0.15]} material={MAT.steel} />

      {/* Gooseneck: hinge block at the deck front, sloping neck, head over the coupling, pad on the anchor. */}
      <Block
        name="gooseneck-hinge"
        x={[d.deckStart - 0.3, d.deckStart + 0.4]}
        y={[d.deckTop - 0.55, d.deckTop + 0.15]}
        z={[az - d.headHalfWidth - 0.1, az + d.headHalfWidth + 0.1]}
        material={MAT.steel}
      />
      <Bar
        name="gooseneck-neck"
        size={[d.neck.length, NECK_THICKNESS, d.headHalfWidth * 2]}
        position={d.neck.position}
        rotation={d.neck.rotation}
        material={MAT.bodyPaint}
      />
      <Block
        name="gooseneck-head"
        x={[d.headFront, d.headRear]}
        y={[d.headBottom, d.headTop]}
        z={[az - d.headHalfWidth, az + d.headHalfWidth]}
        material={MAT.bodyPaint}
      />
      <Tube name="coupling-pad" radius={PAD_RADIUS} length={PAD_THICKNESS} position={[ax, ay + PAD_THICKNESS / 2, az]} material={MAT.steel} />

      {/* One bogie beam per axle line, hydraulic cylinder hints between selected lines, then the instanced wheels. */}
      {d.axleXs.map((x) => (
        <Block key={x} x={[x - 0.3, x + 0.3]} y={[TYRE_RADIUS - 0.18, TYRE_RADIUS + 0.18]} z={[-d.outerZ, d.outerZ]} material={MAT.steel} />
      ))}
      {d.hydraulicXs.map((x) =>
        SIDES.map((side) => (
          <Tube
            key={`${x}:${side}`}
            radius={HYDRAULIC_RADIUS}
            length={0.5}
            position={[x, TYRE_RADIUS + 0.05, side * (d.halfWidth - 0.5)]}
            material={MAT.accent}
          />
        )),
      )}
      <PlaceholderWheels positions={d.tyres} radius={TYRE_RADIUS} width={TYRE_WIDTH} />
      <PlaceholderRims positions={d.tyres} radius={TYRE_RADIUS * 0.58} width={TYRE_WIDTH + 0.04} />
    </group>
  )
}
