/**
 * TEMPORARY procedural stand-in for a horizontal pressure vessel (Scene 01's
 * closing sequence). A detailed GLB authored in the same frame can replace it
 * through an environment slot without touching the timeline.
 *
 * LOCAL FRAME (PressureVesselConfig, ./types.ts): the axis runs along X at
 * y = diameter / 2; x = 0 is the middle of the cylindrical shell; y = 0 is the
 * lowest point of the SHELL (a vessel resting on supports of height h is placed
 * at y = h); z = 0 is on the axis. The saddle wear pads stand 12 mm proud below
 * y = 0 and sink into a VesselSaddle's cradle, which is built for exactly that.
 *
 * What it draws, by stage:
 *  - every stage: the shell (smooth cylinder) of `courses` courses with raised
 *    weld beads at each course joint and one longitudinal seam per course
 *    (staggered ±25° from the top), and the saddle wear pads (126° around the
 *    bottom, 0.4 m wide, 12 mm proud; circumferential beads stop short of them);
 *  - `shell`: the ends are open and show the 60 mm wall; the inside is real
 *    inward-facing geometry, so it reads without DoubleSide;
 *  - `oneHead`: a 2:1 semi-ellipsoidal dished head (LatheGeometry, with a short
 *    straight flange and its seam) closes the −X end; +X stays open;
 *  - `complete`: both heads, the nozzles (neck, weld-neck hub, flange and blind
 *    flange, fillet weld following the shell intersection) and the lifting lugs
 *    (shaped plates on doubler pads, with a real pin hole and cheek rings; the pin
 *    centre is exactly `lugPinPoints(config)`).
 * Helpers for its measurements live in ./vesselGeometry.ts.
 *
 * Props: `config`; `castShadow` / `receiveShadow` (default true) apply to the
 * shell, nozzles and lugs. Weld beads receive shadows but never cast them (they
 * are far below shadow-map resolution and would only add acne).
 *
 * Cost: one merged geometry per material, built once per config: shell (shell,
 * heads, wear pads, lug doublers), welds, nozzles, lugs. 4 draw calls when
 * complete, 2 for `shell` / `oneHead` (plus the shadow passes). Geometries and
 * materials are disposed on change and on unmount.
 */
import { useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo } from 'react'
import { CatmullRomCurve3, CylinderGeometry, ExtrudeGeometry, MeshStandardMaterial, Path, Shape, TubeGeometry, Vector3, type BufferGeometry } from 'three'
import type { PressureVesselConfig } from './types'
import {
  annularSector,
  circumferentialSeamsX,
  courseBoundariesX,
  freeArcs,
  hasHeadAt,
  headDepth,
  headJointX,
  LONG_SEAM_ANGLE,
  LUG_DOUBLER,
  lugBaseHalfLength,
  mergeParts,
  nozzleFlange,
  revolveCap,
  revolveX,
  SHELL_WALL,
  WEAR_PAD,
  WELD_BEAD,
  type Profile,
} from './vesselGeometry'

export interface PressureVesselProps {
  config: PressureVesselConfig
  castShadow?: boolean
  receiveShadow?: boolean
}

type PartKey = 'shell' | 'welds' | 'nozzles' | 'lugs'
const PART_KEYS: readonly PartKey[] = ['shell', 'welds', 'nozzles', 'lugs']
type VesselParts = Record<PartKey, BufferGeometry | null>

/** Radial resolution of a full turn: shell and heads, and the (slightly finer) weld beads around them. */
const SHELL_SEGMENTS = 72
const BEAD_SEGMENTS = 112
/** Profile steps along the quarter-ellipse of a dished head. */
const HEAD_STEPS = 32
/** Steps along the half-ellipse cross-section of a circumferential bead. */
const BEAD_STEPS = 8
/** Clearance (rad) left between a circumferential bead and a wear pad or lug doubler it would cross. */
const BEAD_CLEARANCE = 0.035

/* -------------------------------------------------------------------------- */
/* Shell and heads                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Profile of a dished head surface from the head-to-shell joint outwards: the
 * straight flange, then a quarter-ellipse (radius `rad`, depth `depth`) to the pole.
 */
function headProfile(rad: number, depth: number, joint: number, tangent: number, side: -1 | 1): Array<[number, number]> {
  const points: Array<[number, number]> = [
    [rad, joint],
    [rad, tangent],
  ]
  for (let i = 1; i <= HEAD_STEPS; i++) {
    const t = (i / HEAD_STEPS) * (Math.PI / 2)
    points.push([i === HEAD_STEPS ? 0 : rad * Math.cos(t), tangent + side * depth * Math.sin(t)])
  }
  return points
}

/** Half-elliptical cross-section of a circumferential weld bead centred on x = `x`, sitting on radius `R`. */
function beadProfile(R: number, x: number): Profile {
  const points: Array<[number, number]> = []
  const base = R - WELD_BEAD.sink
  const height = WELD_BEAD.proud + WELD_BEAD.sink
  for (let i = 0; i <= BEAD_STEPS; i++) {
    const t = -Math.PI / 2 + (i / BEAD_STEPS) * Math.PI
    points.push([base + height * Math.cos(t), x + (WELD_BEAD.width / 2) * Math.sin(t)])
  }
  return points
}

/** Straight weld bead along X (elliptical section) on the shell surface at angle `a` from the top. */
function longitudinalBead(R: number, x0: number, x1: number, a: number): BufferGeometry {
  const geometry = new CylinderGeometry(1, 1, x1 - x0, 10, 1, false)
  geometry.rotateZ(-Math.PI / 2)
  geometry.scale(1, WELD_BEAD.proud + WELD_BEAD.sink, WELD_BEAD.width / 2)
  geometry.translate((x0 + x1) / 2, R - WELD_BEAD.sink, 0)
  geometry.rotateX(a)
  return geometry
}

/* -------------------------------------------------------------------------- */
/* Nozzles and lugs                                                           */
/* -------------------------------------------------------------------------- */

/** Places a Y-axis part radially: centre `distance` from the axis, at angle `angle` from the top, at axial `x`. */
function radial(geometry: BufferGeometry, distance: number, angle: number, x: number): BufferGeometry {
  return geometry.translate(0, distance, 0).rotateX(angle).translate(x, 0, 0)
}

/** Fillet weld around a nozzle neck, following its (saddle-shaped) intersection with the shell. */
function nozzleFillet(R: number, x: number, angle: number, neckRadius: number): BufferGeometry {
  const n = new Vector3(0, Math.cos(angle), Math.sin(angle))
  const v = new Vector3(0, -Math.sin(angle), Math.cos(angle))
  const offset = neckRadius + 0.01
  const points: Vector3[] = []
  for (let i = 0; i < 48; i++) {
    const psi = (i / 48) * Math.PI * 2
    const across = offset * Math.sin(psi)
    const out = Math.sqrt(Math.max(R * R - across * across, 0)) + 0.01
    points.push(new Vector3(x + offset * Math.cos(psi), 0, 0).addScaledVector(v, across).addScaledVector(n, out))
  }
  return new TubeGeometry(new CatmullRomCurve3(points, true, 'centripetal'), 96, 0.022, 6, true)
}

/**
 * Lug plate outline in its own (u along X, v up from the shell top) plane: a
 * base embedded in the shell, flanks tangent to a rounded top of radius `outer`
 * around the pin centre (0, pinHeight), and the pin hole.
 */
function lugShape(halfBase: number, pinHeight: number, outer: number, hole: number, embed: number): Shape {
  const d = Math.hypot(halfBase, pinHeight)
  // Angle (from +u) of the right flank's tangent point on the rounded top.
  const alpha = d > outer * 1.02 ? Math.atan2(-pinHeight, halfBase) + Math.acos(outer / d) : 0
  const shape = new Shape()
  shape.moveTo(-halfBase, -embed)
  shape.lineTo(halfBase, -embed)
  shape.lineTo(halfBase, 0)
  shape.absarc(0, pinHeight, outer, alpha, Math.PI - alpha, false)
  shape.lineTo(-halfBase, 0)
  shape.closePath()
  const pin = new Path()
  pin.absarc(0, pinHeight, hole, 0, Math.PI * 2, true)
  shape.holes.push(pin)
  return shape
}

/* -------------------------------------------------------------------------- */
/* Assembly                                                                   */
/* -------------------------------------------------------------------------- */

/** Builds every part of the vessel in the AXIS frame, merges per material and lifts the result to the local frame. Pure. */
function buildVesselParts(config: PressureVesselConfig): VesselParts {
  const R = config.diameter / 2
  const L = config.shellLength
  const depth = Math.max(headDepth(config), 0.02)
  const wall = Math.min(SHELL_WALL, R * 0.2)
  const complete = config.stage === 'complete'
  const headMinus = hasHeadAt(config, -1)
  const headPlus = hasHeadAt(config, 1)
  const headAt = (side: -1 | 1) => (side === 1 ? headPlus : headMinus)
  // The cylinder runs between the head joints (a head's straight flange belongs to the head) or to the open ends.
  const xa = headMinus ? headJointX(config, -1) : -L / 2
  const xb = headPlus ? headJointX(config, 1) : L / 2

  const shell: BufferGeometry[] = []
  const welds: BufferGeometry[] = []
  const nozzles: BufferGeometry[] = []
  const lugs: BufferGeometry[] = []

  // --- Shell: outer surface; unfinished vessels also get the inner surface and the wall at each open end. ---
  shell.push(revolveX([[R, xa], [R, xb]], 0, Math.PI * 2, SHELL_SEGMENTS))
  if (!complete) {
    shell.push(revolveX([[R - wall, xb], [R - wall, xa]], 0, Math.PI * 2, SHELL_SEGMENTS))
    if (!headMinus) shell.push(revolveX([[R - wall, xa], [R, xa]], 0, Math.PI * 2, SHELL_SEGMENTS))
    if (!headPlus) shell.push(revolveX([[R, xb], [R - wall, xb]], 0, Math.PI * 2, SHELL_SEGMENTS))
  }

  // --- Dished heads (outer surface; inner surface too while an end is still open). ---
  for (const side of [-1, 1] as const) {
    if (!headAt(side)) continue
    const joint = headJointX(config, side)
    const tangent = (side * L) / 2
    const outer = headProfile(R, depth, joint, tangent, side)
    shell.push(revolveX(side === 1 ? outer : outer.reverse(), 0, Math.PI * 2, SHELL_SEGMENTS))
    if (!complete) {
      const inner = headProfile(R - wall, Math.max(depth - wall, 0.01), joint, tangent, side)
      shell.push(revolveX(side === 1 ? inner.reverse() : inner, 0, Math.PI * 2, SHELL_SEGMENTS))
    }
  }

  // --- Saddle wear pads: curved plates around the bottom. ---
  const padHalfArc = WEAR_PAD.arc / 2
  for (const x of config.wearPads) {
    shell.push(...annularSector(R - WEAR_PAD.sink, R + WEAR_PAD.proud, x - WEAR_PAD.width / 2, x + WEAR_PAD.width / 2, Math.PI - padHalfArc, Math.PI + padHalfArc, {}, SHELL_SEGMENTS))
  }

  // --- Lifting-lug doubler pads (complete only). ---
  const lugHalf = lugBaseHalfLength(config)
  const doublerHalfLength = lugHalf + LUG_DOUBLER.margin
  const doublerHalfArc = Math.max(LUG_DOUBLER.halfWidth, config.lugs.thickness * 2.5) / R
  const lugX = complete ? config.lugs.x : []
  for (const x of lugX) {
    shell.push(...annularSector(R - LUG_DOUBLER.sink, R + LUG_DOUBLER.proud, x - doublerHalfLength, x + doublerHalfLength, -doublerHalfArc, doublerHalfArc, {}, SHELL_SEGMENTS))
  }

  // --- Circumferential seams: course joints and head joints; beads stop short of the pads they would cross. ---
  for (const xs of circumferentialSeamsX(config)) {
    const blocked: Array<{ centre: number; half: number }> = []
    for (const xp of config.wearPads) {
      if (Math.abs(xs - xp) < WEAR_PAD.width / 2 + WELD_BEAD.width / 2 + 0.01) blocked.push({ centre: Math.PI, half: padHalfArc + BEAD_CLEARANCE })
    }
    for (const xl of lugX) {
      if (Math.abs(xs - xl) < doublerHalfLength + WELD_BEAD.width / 2 + 0.01) blocked.push({ centre: 0, half: doublerHalfArc + BEAD_CLEARANCE })
    }
    const profile = beadProfile(R, xs)
    for (const [a0, a1] of freeArcs(blocked)) {
      welds.push(revolveX(profile, a0, a1, BEAD_SEGMENTS))
      if (a1 - a0 < Math.PI * 2 - 1e-6) welds.push(revolveCap(profile, a0, -1), revolveCap(profile, a1, 1))
    }
  }

  // --- Longitudinal seams: one per course, alternating ±25° from the top; ends meet the circumferential beads. ---
  const bounds = courseBoundariesX(config)
  const courses = bounds.length - 1
  for (let i = 0; i < courses; i++) {
    const seamBefore = i > 0 || headMinus
    const seamAfter = i < courses - 1 || headPlus
    // Open ends: stop 3 mm short so the bead's cap never lies in the plane of the wall face.
    const lo = Math.max(bounds[i], xa) + (seamBefore ? 0.01 : 0.003)
    const hi = Math.min(bounds[i + 1], xb) - (seamAfter ? 0.01 : 0.003)
    if (hi - lo > 0.1) welds.push(longitudinalBead(R, lo, hi, (i % 2 === 0 ? 1 : -1) * LONG_SEAM_ANGLE))
  }

  if (complete) {
    // --- Nozzles: neck, weld-neck hub, flange and blind flange, with a fillet weld at the shell. ---
    for (const nozzle of config.nozzles) {
      const rn = Math.min(nozzle.diameter / 2, R * 0.8)
      const flange = nozzleFlange(nozzle)
      const outer = R + nozzle.projection
      const flangeBottom = outer - flange.stack
      const base = Math.sqrt(Math.max(R * R - rn * rn, 0)) - 0.03
      const hub = Math.min(0.1, Math.max(flangeBottom - R, 0) * 0.5)
      const { angle, x } = nozzle
      if (flangeBottom > base) nozzles.push(radial(new CylinderGeometry(rn, rn, flangeBottom - base, 40, 1, true), (base + flangeBottom) / 2, angle, x))
      if (hub > 0.01) nozzles.push(radial(new CylinderGeometry(rn + 0.03, rn, hub, 40, 1, true), flangeBottom - hub / 2, angle, x))
      nozzles.push(radial(new CylinderGeometry(flange.radius, flange.radius, flange.thickness, 48, 1, false), flangeBottom + flange.thickness / 2, angle, x))
      nozzles.push(radial(new CylinderGeometry(flange.radius, flange.radius, flange.blindThickness, 48, 1, false), outer - flange.blindThickness / 2, angle, x))
      welds.push(nozzleFillet(R, x, angle, rn))
    }

    // --- Lifting lugs: shaped plates in the XY plane with a pin hole and cheek rings, fillet-welded to the doubler. ---
    const { height, thickness, holeDiameter } = config.lugs
    const pinHeight = height - holeDiameter
    const holeRadius = holeDiameter / 2
    const cheekOuter = Math.min(holeRadius + 0.045, holeDiameter - 0.01)
    const doublerTop = R + LUG_DOUBLER.proud
    for (const x of lugX) {
      const plate = new ExtrudeGeometry(lugShape(lugHalf, pinHeight, holeDiameter, holeRadius, 0.03), { depth: thickness, bevelEnabled: false, curveSegments: 24 })
      lugs.push(plate.translate(x, R, -thickness / 2))
      if (cheekOuter > holeRadius + 0.015) {
        for (const side of [-1, 1] as const) {
          const z0 = side * (thickness / 2 - 0.002)
          const z1 = side * (thickness / 2 + 0.014)
          // Built about X, then turned so the ring's axis is the pin axis (Z).
          for (const part of annularSector(holeRadius + 0.004, cheekOuter, Math.min(z0, z1), Math.max(z0, z1), 0, Math.PI * 2, {}, 40)) {
            lugs.push(part.rotateY(-Math.PI / 2).translate(x, R + pinHeight, 0))
          }
        }
      }
      for (const side of [-1, 1] as const) {
        const bead = new CylinderGeometry(0.016, 0.016, 2 * lugHalf, 8, 1, false)
        welds.push(bead.rotateZ(-Math.PI / 2).translate(x, doublerTop + 0.002, side * (thickness / 2 + 0.002)))
      }
    }
  }

  const parts: VesselParts = { shell: mergeParts(shell), welds: mergeParts(welds), nozzles: mergeParts(nozzles), lugs: mergeParts(lugs) }
  for (const key of PART_KEYS) parts[key]?.translate(0, R, 0)
  return parts
}

function createVesselMaterials(colors: PressureVesselConfig['colors']): Record<PartKey, MeshStandardMaterial> {
  return {
    shell: new MeshStandardMaterial({ color: colors.shell, metalness: 0.55, roughness: 0.45 }),
    welds: new MeshStandardMaterial({ color: colors.weld, metalness: 0.35, roughness: 0.7 }),
    nozzles: new MeshStandardMaterial({ color: colors.nozzle, metalness: 0.55, roughness: 0.42 }),
    lugs: new MeshStandardMaterial({ color: colors.lug, metalness: 0.45, roughness: 0.55 }),
  }
}

export function PressureVessel({ config, castShadow = true, receiveShadow = true }: PressureVesselProps) {
  const invalidate = useThree((state) => state.invalidate)
  const parts = useMemo(() => buildVesselParts(config), [config])
  const { shell, weld, nozzle, lug } = config.colors
  const materials = useMemo(() => createVesselMaterials({ shell, weld, nozzle, lug }), [shell, weld, nozzle, lug])

  useEffect(() => () => {
    for (const key of PART_KEYS) parts[key]?.dispose()
  }, [parts])
  useEffect(() => () => {
    for (const key of PART_KEYS) materials[key].dispose()
  }, [materials])
  // Demand frameloop: a rebuilt vessel must reach the screen even if nothing else is animating.
  useLayoutEffect(() => {
    invalidate()
  }, [parts, materials, invalidate])

  return (
    <group name="pressure-vessel" userData={{ stage: config.stage }}>
      {PART_KEYS.map((key) => {
        const geometry = parts[key]
        if (!geometry) return null
        return (
          <mesh
            key={key}
            name={`pressure-vessel:${key}`}
            geometry={geometry}
            material={materials[key]}
            castShadow={key === 'welds' ? false : castShadow}
            receiveShadow={receiveShadow}
          />
        )
      })}
    </group>
  )
}
