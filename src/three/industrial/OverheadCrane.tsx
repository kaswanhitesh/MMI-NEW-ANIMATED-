/**
 * OverheadCrane: TEMPORARY procedural stand-in for the double-girder EOT
 * (electric overhead travelling) crane of the Gemini Engi Fab factory in
 * Scene 01. A detailed GLB can replace it later without touching the timeline,
 * because the scene only talks to it through `config` and `getPose()`.
 *
 * LOCAL FRAME (see OverheadCraneConfig in ./types): the runway runs along local
 * Z; the bridge spans local X from −span/2 to +span/2 (the rail centre lines);
 * y = 0 is the factory floor and the rail top is at `railHeight`. The factory
 * renders the runway girders and rails. This component renders the rest:
 *  - `crane:bridge`, moved to z = pose.bridgeZ: two end trucks running on the
 *    rails (wheel treads on y = railHeight, box just above them); two box
 *    girders sitting on the trucks (span − 0.3 m long, `girderGap` clear
 *    between them) with the trolley rails on top; a walkway with a
 *    safety-yellow handrail along the outer face of the +Z girder; long-travel
 *    drives, buffers and a control panel.
 *  - `crane:trolley`, a child of the bridge moved to x = pose.trolleyX: the
 *    crab frame spanning both girders (girderGap + 2·girderWidth along Z,
 *    trolley.length along X, about trolley.height tall above the trolley-rail
 *    top), the hoist drum along X, the hoist motor with brake and gearbox, a
 *    cabinet, the cross-travel drive and four wheels. `trolley.width` is not
 *    used, because the girders fix the crab's width.
 *  - `crane:hoist`: `ropeCount` falls from under the drum to the top of the
 *    hook block. They are one unit-length InstancedMesh stretched in Y every
 *    frame and never rebuilt. Inside it is `crane:hook`, moved to y =
 *    pose.hookY, holding the hook block, the crosshead and the forged hook.
 *    The `crane:hook` origin IS the hook point: the seat at the bottom of the
 *    hook's bowl where the top slings meet. The forging's underside hangs
 *    2 × its tube radius (about 0.18 m) lower, and the block's underside is
 *    0.9 m above the hook point.
 *
 * Props:
 *  - `config`: dimensions and colours. Layout, geometries and materials are
 *    memoised on it and disposed when it changes or the crane unmounts.
 *  - `getPose()`: read in a single useFrame every rendered frame. Nothing is
 *    written while the pose is unchanged. The scene invalidates the demand
 *    frameloop whenever its timeline moves.
 *
 * Draw calls: 11 (bridge 4, trolley 3, ropes, block, fittings, hook). Boxes
 * and cylinders use one InstancedMesh per material per moving group, and the
 * hook assembly uses merged geometry. The bridge, the trolley, the block and
 * the hook cast and receive shadows. The ropes do neither.
 */
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Euler,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
  type Group,
  type InstancedMesh,
  type Material,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Vec3 } from '../assets/types'
import type { CranePose, OverheadCraneConfig } from './types'

export interface OverheadCraneProps {
  config: OverheadCraneConfig
  /** Read every rendered frame: bridge Z, trolley X and hook-point Y, in the crane's local frame. */
  getPose: () => CranePose
}

/** One instance of a unit box (1 m cube) or unit cylinder (Ø1 m × 1 m along its local Y) scaled to `size`. */
interface Part {
  position: Vec3
  size: Vec3
  /** Euler XYZ rotation in radians (optional). */
  rotation?: Vec3
}

interface CraneLayout {
  bridgeSteel: Part[]
  bridgeHandrail: Part[]
  bridgeMachinery: Part[]
  bridgeRound: Part[]
  trolleyFrame: Part[]
  trolleyMachinery: Part[]
  trolleyRound: Part[]
  /** Rope (x, z) offsets from the hook's vertical line. */
  ropeOffsets: ReadonlyArray<readonly [number, number]>
  /** Crane-local Y where the ropes leave the underside of the drum. */
  ropeTopY: number
  /** Height above the hook point where the ropes enter the hook block. */
  ropeBottomY: number
}

interface HookGeometries {
  /** Side plates, core and sheave guard (block colour). */
  block: BufferGeometry
  /** Crosshead and sheave-axle boss (machinery colour). */
  fittings: BufferGeometry
  /** Bowl, tip, shank and collar (hook colour). */
  forging: BufferGeometry
}

type MaterialKey = 'steel' | 'accent' | 'machinery' | 'trolley' | 'rope' | 'block' | 'hook'

const SIDES = [-1, 1] as const
/** Quarter turns that lay a unit cylinder's Y axis along X / along Z. */
const ALONG_X: Vec3 = [0, 0, Math.PI / 2]
const ALONG_Z: Vec3 = [Math.PI / 2, 0, 0]

/** Girder ends stop this far inside each rail centre line, over the end-truck tops. */
const GIRDER_END_INSET = 0.15
/** Flange plate thickness of the box girders. */
const FLANGE = 0.04
/** Section height of the trolley rail on each girder's top flange. */
const TROLLEY_RAIL_HEIGHT = 0.09
/** The girder that carries the walkway: +1 = the +Z girder, −1 = the −Z girder. */
const WALKWAY_SIDE = 1
const WALKWAY_WIDTH = 0.8
const HANDRAIL_HEIGHT = 1.1
const HANDRAIL_POST_PITCH = 1.8
const WALKWAY_BRACKET_PITCH = 2.4
/** Clearance from the hook point (bowl seat) up to the underside of the hook-block body. */
const HOOK_BLOCK_GAP = 0.9
/** Crosshead (trunnion) under the block body that carries the hook nut. */
const CROSSHEAD_HEIGHT = 0.16
/** Thrust collar on top of the hook shank, just under the crosshead. */
const HOOK_COLLAR_HEIGHT = 0.12
/** Swept angle of the hook's bowl: from the shank junction at the top, round the back and the seat, up to the tip. */
const HOOK_ARC = Math.PI * 1.5
/** Ropes are kept at least this long, so an out-of-range pose never collapses the mesh to zero scale. */
const MIN_ROPE_LENGTH = 0.05
/** Half-spread of the rope falls along X, and across Z when they come in pairs. */
const ROPE_SPREAD_X = 0.25
const ROPE_SPREAD_Z = 0.15
/** Machinery (wheels, drives, drum, rails, fittings) is the bridge steel darkened towards this tone. */
const MACHINERY_TONE = new Color('#1c1f23')

/* Scratch objects reused while writing instance matrices. */
const _matrix = new Matrix4()
const _position = new Vector3()
const _scale = new Vector3()
const _quat = new Quaternion()
const _euler = new Euler()

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Rope falls around the hook's vertical line: pairs across Z for an even count of 4 or more, otherwise a single row along X. */
function ropeLayout(ropeCount: number): Array<readonly [number, number]> {
  const n = Math.max(0, Math.floor(ropeCount))
  if (n === 0) return []
  if (n === 1) return [[0, 0]]
  const paired = n >= 4 && n % 2 === 0
  const columns = paired ? n / 2 : n
  const out: Array<readonly [number, number]> = []
  for (let i = 0; i < columns; i++) {
    const x = columns === 1 ? 0 : -ROPE_SPREAD_X + (2 * ROPE_SPREAD_X * i) / (columns - 1)
    if (paired) out.push([x, -ROPE_SPREAD_Z], [x, ROPE_SPREAD_Z])
    else out.push([x, 0])
  }
  return out
}

/** Lays out every static part of the bridge and the trolley in their own groups' frames. Pure. */
function layoutCrane(cfg: OverheadCraneConfig): CraneLayout {
  const { span, railHeight, bridge, trolley, hoist } = cfg
  const { girderDepth: gd, girderWidth: gw, girderGap: gg, endTruckLength: etl } = bridge
  const half = span / 2
  const gz = gg / 2 + gw / 2

  const bridgeSteel: Part[] = []
  const bridgeHandrail: Part[] = []
  const bridgeMachinery: Part[] = []
  const bridgeRound: Part[] = []

  // --- End trucks on the rails at x = ±span/2: wheel treads on the rail top, the box just above. ---
  const truckW = Math.max(0.6, gw * 1.1)
  const truckH = clamp(gd * 0.45, 0.6, 1.2)
  const wheelR = clamp(truckH * 0.4, 0.25, 0.45)
  const truckBottom = railHeight + wheelR * 0.45
  const truckTop = truckBottom + truckH
  const truckMid = (truckBottom + truckTop) / 2
  const wheelZ = Math.max(0.3, etl / 2 - wheelR - 0.45)
  const driveY = truckBottom + truckH * 0.45
  for (const sx of SIDES) {
    const x = sx * half
    bridgeSteel.push({ position: [x, truckMid, 0], size: [truckW, truckH, etl] })
    for (const sz of SIDES) {
      // End plate, wheel, axle boxes on both faces, and a buffer.
      bridgeSteel.push({ position: [x, truckMid, sz * (etl / 2 + 0.01)], size: [truckW + 0.06, truckH + 0.06, 0.04] })
      bridgeRound.push({ position: [x, railHeight + wheelR, sz * wheelZ], size: [2 * wheelR, 0.2, 2 * wheelR], rotation: ALONG_X })
      for (const face of SIDES) bridgeMachinery.push({ position: [x + face * (truckW / 2 + 0.04), railHeight + wheelR, sz * wheelZ], size: [0.08, 0.34, 0.42] })
      bridgeRound.push({ position: [x, truckMid, sz * (etl / 2 + 0.2)], size: [0.26, 0.34, 0.26], rotation: ALONG_Z })
    }
    // Long-travel drive on the inner face at the +Z wheel: gearbox and motor.
    const ix = x - sx * (truckW / 2 + 0.3)
    bridgeMachinery.push({ position: [ix, driveY, wheelZ], size: [0.6, 0.62, 0.55] })
    bridgeRound.push({ position: [ix, driveY, wheelZ - 0.7], size: [0.42, 0.8, 0.42], rotation: ALONG_Z })
  }

  // --- Box girders on the truck tops: web, flanges and one longitudinal stiffener; trolley rails and end stops on top. ---
  const girderLen = span - 2 * GIRDER_END_INSET
  const gBottom = truckTop
  const gTop = truckTop + gd
  for (const sz of SIDES) {
    const z = sz * gz
    bridgeSteel.push({ position: [0, gBottom + gd / 2, z], size: [girderLen, gd - 2 * FLANGE, gw] })
    bridgeSteel.push({ position: [0, gTop - FLANGE / 2, z], size: [girderLen, FLANGE, gw + 0.1] })
    bridgeSteel.push({ position: [0, gBottom + FLANGE / 2, z], size: [girderLen, FLANGE, gw + 0.1] })
    bridgeSteel.push({ position: [0, gBottom + gd * 0.62, z + sz * (gw / 2 + 0.012)], size: [girderLen - 0.4, 0.05, 0.024] })
    bridgeMachinery.push({ position: [0, gTop + TROLLEY_RAIL_HEIGHT / 2, z], size: [girderLen - 0.5, TROLLEY_RAIL_HEIGHT, 0.075] })
    for (const sx of SIDES) bridgeMachinery.push({ position: [sx * (girderLen / 2 - 0.45), gTop + 0.16, z], size: [0.22, 0.32, gw * 0.75] })
  }

  // --- Walkway on the outer face of one girder: deck, toe board, bearers with knee braces, handrail, control panel. ---
  const W = WALKWAY_SIDE
  const deckTop = gTop - 0.06
  const deckLen = girderLen - 0.6
  const zIn = W * (gz + gw / 2)
  const zOut = W * (gz + gw / 2 + WALKWAY_WIDTH)
  const zMid = (zIn + zOut) / 2
  const railZ = zOut - W * 0.04
  bridgeSteel.push({ position: [0, deckTop - 0.025, zMid], size: [deckLen, 0.05, WALKWAY_WIDTH] })
  bridgeSteel.push({ position: [0, deckTop + 0.075, zOut - W * 0.0125], size: [deckLen, 0.15, 0.025] })
  const braceRise = 0.62
  const braceRun = WALKWAY_WIDTH - 0.06
  const braceLen = Math.hypot(braceRun, braceRise)
  const braceTilt = W * Math.atan2(braceRun, braceRise)
  const brackets = Math.max(2, Math.round(deckLen / WALKWAY_BRACKET_PITCH) + 1)
  for (let i = 0; i < brackets; i++) {
    const x = -deckLen / 2 + 0.3 + (i * (deckLen - 0.6)) / (brackets - 1)
    bridgeSteel.push({ position: [x, deckTop - 0.11, zMid], size: [0.08, 0.12, WALKWAY_WIDTH] })
    bridgeSteel.push({ position: [x, deckTop - 0.17 - braceRise / 2, zIn + (W * braceRun) / 2], size: [0.07, braceLen, 0.07], rotation: [braceTilt, 0, 0] })
  }
  const posts = Math.max(2, Math.ceil(deckLen / HANDRAIL_POST_PITCH) + 1)
  for (let i = 0; i < posts; i++) {
    const x = -deckLen / 2 + 0.05 + (i * (deckLen - 0.1)) / (posts - 1)
    bridgeHandrail.push({ position: [x, deckTop + HANDRAIL_HEIGHT / 2, railZ], size: [0.05, HANDRAIL_HEIGHT, 0.05] })
  }
  bridgeHandrail.push({ position: [0, deckTop + HANDRAIL_HEIGHT, railZ], size: [deckLen, 0.05, 0.05] })
  bridgeHandrail.push({ position: [0, deckTop + HANDRAIL_HEIGHT / 2, railZ], size: [deckLen, 0.04, 0.04] })
  const endRailDepth = Math.abs(railZ - zIn)
  for (const sx of SIDES) {
    const x = sx * (deckLen / 2 - 0.025)
    bridgeHandrail.push({ position: [x, deckTop + HANDRAIL_HEIGHT / 2, zIn + W * 0.03], size: [0.05, HANDRAIL_HEIGHT, 0.05] })
    bridgeHandrail.push({ position: [x, deckTop + HANDRAIL_HEIGHT, (zIn + railZ) / 2], size: [0.05, 0.05, endRailDepth] })
    bridgeHandrail.push({ position: [x, deckTop + HANDRAIL_HEIGHT / 2, (zIn + railZ) / 2], size: [0.04, 0.04, endRailDepth] })
  }
  bridgeMachinery.push({ position: [deckLen / 2 - 2.4, deckTop + 0.8, zIn + W * 0.24], size: [1.4, 1.6, 0.4] })

  // --- Trolley (crab), in the trolley group's frame: same origin as the bridge, shifted by trolleyX. ---
  const trolleyFrame: Part[] = []
  const trolleyMachinery: Part[] = []
  const trolleyRound: Part[] = []
  const tl = trolley.length
  const railTop = gTop + TROLLEY_RAIL_HEIGHT
  const wheelT = clamp(trolley.height * 0.12, 0.15, 0.3)
  const frameBottom = railTop + wheelT * 0.5
  const frameDepth = clamp(trolley.height * 0.3, 0.35, 0.8)
  const frameTop = frameBottom + frameDepth
  /** Height left for the machinery on the frame, so the crab's top is about trolley.height above the rail top. */
  const machH = Math.max(0.4, trolley.height - frameDepth - wheelT * 0.5)
  /** Half-width (Z) of the opening between the deck plates through which the drum hangs and the ropes drop. */
  const open = Math.max(0.2, Math.min(0.7, gg / 2 - 0.2))
  const deckZ = (open + gg / 2) / 2
  const deckW = Math.max(0.05, gg / 2 - open)

  // Frame: side carriages over the girders, end beams between them, deck plates either side of the rope opening.
  for (const sz of SIDES) {
    trolleyFrame.push({ position: [0, frameBottom + frameDepth / 2, sz * gz], size: [tl, frameDepth, gw] })
    trolleyFrame.push({ position: [0, frameTop - 0.02, sz * deckZ], size: [tl - 0.8, 0.04, deckW] })
  }
  for (const sx of SIDES) trolleyFrame.push({ position: [sx * (tl / 2 - 0.2), frameBottom + frameDepth / 2, 0], size: [0.4, frameDepth, gg] })

  // Hoist drum along X over the opening, with flanges and pedestal plates.
  const drumR = clamp(machH * 0.36, 0.2, 0.7)
  const drumLen = clamp(tl * 0.42, 0.8, Math.max(0.8, tl - 2.3))
  const drumY = frameTop + drumR * 0.3
  trolleyRound.push({ position: [0, drumY, 0], size: [2 * drumR, drumLen, 2 * drumR], rotation: ALONG_X })
  const pedBottom = frameTop - frameDepth * 0.6
  const pedTop = drumY + drumR * 0.35
  for (const sx of SIDES) {
    trolleyRound.push({ position: [sx * (drumLen / 2 + 0.03), drumY, 0], size: [2 * drumR + 0.12, 0.06, 2 * drumR + 0.12], rotation: ALONG_X })
    trolleyFrame.push({ position: [sx * (drumLen / 2 + 0.14), (pedBottom + pedTop) / 2, 0], size: [0.14, pedTop - pedBottom, 2 * open + 0.1] })
  }

  // Hoist drive: gearbox at the +X end of the drum, motor (on a base) and brake alongside the drum on the +Z deck plate.
  const motorR = clamp(machH * 0.2, 0.12, 0.35)
  const gbX0 = drumLen / 2 + 0.24
  const gbX1 = Math.max(gbX0 + 0.3, tl / 2 - 0.45)
  const gbZ0 = -(open + 0.1)
  const gbZ1 = deckZ + motorR + 0.1
  const gbH = machH * 0.75
  trolleyMachinery.push({ position: [(gbX0 + gbX1) / 2, frameTop + gbH / 2, (gbZ0 + gbZ1) / 2], size: [gbX1 - gbX0, gbH, gbZ1 - gbZ0] })
  const motorLen = Math.min(1.2, gbX0 + drumLen / 2 - 0.2)
  const motorX = gbX0 - motorLen / 2
  const motorY = frameTop + 0.06 + motorR
  trolleyRound.push({ position: [motorX, motorY, deckZ], size: [2 * motorR, motorLen, 2 * motorR], rotation: ALONG_X })
  trolleyRound.push({ position: [gbX0 - motorLen - 0.15, motorY, deckZ], size: [1.7 * motorR, 0.3, 1.7 * motorR], rotation: ALONG_X })
  trolleyMachinery.push({ position: [motorX, frameTop + 0.05, deckZ], size: [motorLen * 0.8, 0.1, 1.6 * motorR] })

  // Electrical cabinet on the −Z deck plate; cross-travel drive on the −Z carriage.
  const cabH = machH * 0.65
  trolleyFrame.push({ position: [-0.3, frameTop + cabH / 2, -deckZ], size: [Math.min(1.6, tl - 1.4), cabH, Math.max(0.2, deckW - 0.14)] })
  trolleyMachinery.push({ position: [-(tl / 2 - 0.6), frameTop + 0.2, -gz], size: [0.5, 0.4, 0.45] })
  trolleyRound.push({ position: [-(tl / 2 - 1.2), frameTop + 0.17, -gz], size: [0.3, 0.7, 0.3], rotation: ALONG_X })

  // Wheels on the trolley rails (axles along Z) and buffers at the carriage ends.
  for (const sx of SIDES) {
    for (const sz of SIDES) {
      trolleyRound.push({ position: [sx * (tl / 2 - 0.55), railTop + wheelT, sz * gz], size: [2 * wheelT, 0.12, 2 * wheelT], rotation: ALONG_Z })
      trolleyRound.push({ position: [sx * (tl / 2 + 0.1), frameBottom + frameDepth / 2, sz * gz], size: [0.18, 0.2, 0.18], rotation: ALONG_X })
    }
  }

  return {
    bridgeSteel,
    bridgeHandrail,
    bridgeMachinery,
    bridgeRound,
    trolleyFrame,
    trolleyMachinery,
    trolleyRound,
    ropeOffsets: ropeLayout(hoist.ropeCount),
    ropeTopY: drumY - drumR * 0.3,
    ropeBottomY: HOOK_BLOCK_GAP + hoist.blockSize[1],
  }
}

/** Merges same-material parts into one geometry and disposes the parts. */
function merge(parts: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(parts, false)
  for (const part of parts) part.dispose()
  if (!merged) throw new Error('[OverheadCrane] could not merge the hook geometry')
  return merged
}

/**
 * Hook block and hook in the `crane:hook` frame, where y = 0 is the hook point
 * (the seat of the bowl). The block body's underside is HOOK_BLOCK_GAP above it,
 * and the hook lies in the XY plane with its throat opening towards +X.
 */
function buildHookGeometries(hoist: OverheadCraneConfig['hoist']): HookGeometries {
  const [bx, by, bz] = hoist.blockSize
  const gap = HOOK_BLOCK_GAP
  const plate = Math.min(0.06, bz * 0.12)
  const guardR = bx / 2
  const block = merge([
    new BoxGeometry(bx, by, plate).translate(0, gap + by / 2, bz / 2 - plate / 2),
    new BoxGeometry(bx, by, plate).translate(0, gap + by / 2, -(bz / 2 - plate / 2)),
    new BoxGeometry(bx * 0.9, by * 0.92, bz - 2 * plate + 0.004).translate(0, gap + by / 2, 0),
    // Rounded sheave guard: the block reads as a domed casing, and the ropes disappear into it.
    new CylinderGeometry(guardR, guardR, bz - 0.02, 32, 1).rotateX(Math.PI / 2).translate(0, gap + by - guardR * 0.55, 0),
  ])

  const bossR = Math.min(0.11, bx * 0.1)
  const fittings = merge([
    new BoxGeometry(bx * 0.55, CROSSHEAD_HEIGHT, bz * 0.8).translate(0, gap - CROSSHEAD_HEIGHT / 2, 0),
    new CylinderGeometry(bossR, bossR, bz + 0.08, 20, 1).rotateX(Math.PI / 2).translate(0, gap + by * 0.42, 0),
  ])

  // Forged hook: a torus arc for the bowl (seat at y = 0), spheres closing the shank junction and the tip, shank and collar.
  const bowlR = clamp(bx * 0.22, 0.1, 0.3)
  const tube = bowlR * 0.38
  const bowlY = bowlR - tube
  const shankR = tube * 0.8
  const collarBottom = gap - CROSSHEAD_HEIGHT - HOOK_COLLAR_HEIGHT
  const shankBottom = bowlY + bowlR - tube * 0.3
  const shankTop = collarBottom + 0.02
  const tipAngle = Math.PI / 2 + HOOK_ARC
  const forging = merge([
    new TorusGeometry(bowlR, tube, 14, 48, HOOK_ARC).rotateZ(Math.PI / 2).translate(0, bowlY, 0),
    new SphereGeometry(tube * 1.04, 18, 12).translate(0, bowlY + bowlR, 0),
    new SphereGeometry(tube * 0.96, 18, 12).translate(bowlR * Math.cos(tipAngle), bowlY + bowlR * Math.sin(tipAngle), 0),
    new CylinderGeometry(shankR, shankR, shankTop - shankBottom, 18, 1, true).translate(0, (shankTop + shankBottom) / 2, 0),
    new CylinderGeometry(shankR * 1.7, shankR * 1.7, HOOK_COLLAR_HEIGHT, 24, 1).translate(0, collarBottom + HOOK_COLLAR_HEIGHT / 2, 0),
  ])

  return { block, fittings, forging }
}

/** A unit-length rope hanging DOWN from its origin (y from 0 to −1), stretched per frame by the mesh's Y scale. */
function createRopeGeometry(diameter: number): CylinderGeometry {
  const r = Math.max(0.005, diameter / 2)
  return new CylinderGeometry(r, r, 1, 8, 1, true).translate(0, -0.5, 0)
}

function createMaterials(cfg: OverheadCraneConfig): Record<MaterialKey, MeshStandardMaterial> {
  const { bridge, trolley, hoist } = cfg
  const make = (color: Color | string, roughness: number, metalness: number) => new MeshStandardMaterial({ color, roughness, metalness })
  return {
    steel: make(bridge.color, 0.55, 0.45),
    accent: make(bridge.accentColor, 0.5, 0.15),
    machinery: make(new Color(bridge.color).lerp(MACHINERY_TONE, 0.6), 0.42, 0.6),
    trolley: make(trolley.color, 0.55, 0.4),
    rope: make(hoist.ropeColor, 0.4, 0.75),
    block: make(hoist.blockColor, 0.5, 0.3),
    hook: make(hoist.hookColor, 0.42, 0.3),
  }
}

/** One shadow-casting InstancedMesh of a unit geometry, one instance per part (static, written once per layout). */
function InstancedParts({ items, geometry, material, name }: { items: readonly Part[]; geometry: BufferGeometry; material: Material; name: string }) {
  const ref = useRef<InstancedMesh>(null)
  const invalidate = useThree((state) => state.invalidate)

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    items.forEach(({ position, size, rotation }, index) => {
      _position.set(position[0], position[1], position[2])
      _scale.set(size[0], size[1], size[2])
      if (rotation) _quat.setFromEuler(_euler.set(rotation[0], rotation[1], rotation[2]))
      else _quat.identity()
      _matrix.compose(_position, _quat, _scale)
      mesh.setMatrixAt(index, _matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
    invalidate()
  }, [items, geometry, material, invalidate])

  if (items.length === 0) return null
  return (
    // Keyed on the instance count so a different layout remounts the mesh instead of resizing it.
    <instancedMesh key={items.length} ref={ref} name={name} args={[geometry, material, items.length]} castShadow receiveShadow />
  )
}

export function OverheadCrane({ config, getPose }: OverheadCraneProps) {
  const bridgeRef = useRef<Group>(null)
  const trolleyRef = useRef<Group>(null)
  const hookRef = useRef<Group>(null)
  const ropesRef = useRef<InstancedMesh>(null)
  const last = useRef({ bridgeZ: Number.NaN, trolleyX: Number.NaN, hookY: Number.NaN })
  const invalidate = useThree((state) => state.invalidate)

  const unit = useMemo(() => ({ box: new BoxGeometry(1, 1, 1), cylinder: new CylinderGeometry(0.5, 0.5, 1, 24, 1) }), [])
  const layout = useMemo(() => layoutCrane(config), [config])
  const materials = useMemo(() => createMaterials(config), [config])
  const hook = useMemo(() => buildHookGeometries(config.hoist), [config])
  const ropeGeometry = useMemo(() => createRopeGeometry(config.hoist.ropeDiameter), [config])

  useEffect(
    () => () => {
      unit.box.dispose()
      unit.cylinder.dispose()
    },
    [unit],
  )
  useEffect(
    () => () => {
      for (const material of Object.values(materials)) material.dispose()
    },
    [materials],
  )
  useEffect(
    () => () => {
      hook.block.dispose()
      hook.fittings.dispose()
      hook.forging.dispose()
    },
    [hook],
  )
  useEffect(() => () => ropeGeometry.dispose(), [ropeGeometry])

  // Rope falls: each instance only offsets the unit rope in X/Z; the mesh itself is stretched every frame.
  // A new layout or rope mesh resets the cached pose, so the next frame re-applies it to the new objects.
  const ropeCount = layout.ropeOffsets.length
  useLayoutEffect(() => {
    const ropes = ropesRef.current
    if (ropes) {
      layout.ropeOffsets.forEach(([x, z], index) => {
        _matrix.makeTranslation(x, 0, z)
        ropes.setMatrixAt(index, _matrix)
      })
      ropes.instanceMatrix.needsUpdate = true
      ropes.computeBoundingSphere()
    }
    last.current = { bridgeZ: Number.NaN, trolleyX: Number.NaN, hookY: Number.NaN }
    invalidate()
  }, [layout, ropeGeometry, materials, invalidate])

  useFrame(() => {
    const pose = getPose()
    const prev = last.current
    if (pose.bridgeZ === prev.bridgeZ && pose.trolleyX === prev.trolleyX && pose.hookY === prev.hookY) return
    const bridge = bridgeRef.current
    const trolley = trolleyRef.current
    const hookGroup = hookRef.current
    if (!bridge || !trolley || !hookGroup) return
    prev.bridgeZ = pose.bridgeZ
    prev.trolleyX = pose.trolleyX
    prev.hookY = pose.hookY
    bridge.position.z = pose.bridgeZ
    trolley.position.x = pose.trolleyX
    hookGroup.position.y = pose.hookY
    const ropes = ropesRef.current
    if (ropes) {
      ropes.position.y = layout.ropeTopY
      ropes.scale.y = Math.max(MIN_ROPE_LENGTH, layout.ropeTopY - (pose.hookY + layout.ropeBottomY))
    }
  })

  return (
    <group name="crane">
      <group ref={bridgeRef} name="crane:bridge">
        <InstancedParts name="crane:bridge:girders" items={layout.bridgeSteel} geometry={unit.box} material={materials.steel} />
        <InstancedParts name="crane:bridge:handrail" items={layout.bridgeHandrail} geometry={unit.box} material={materials.accent} />
        <InstancedParts name="crane:bridge:drives" items={layout.bridgeMachinery} geometry={unit.box} material={materials.machinery} />
        <InstancedParts name="crane:bridge:wheels" items={layout.bridgeRound} geometry={unit.cylinder} material={materials.machinery} />
        <group ref={trolleyRef} name="crane:trolley">
          <InstancedParts name="crane:trolley:frame" items={layout.trolleyFrame} geometry={unit.box} material={materials.trolley} />
          <InstancedParts name="crane:trolley:machinery" items={layout.trolleyMachinery} geometry={unit.box} material={materials.machinery} />
          <InstancedParts name="crane:trolley:drum" items={layout.trolleyRound} geometry={unit.cylinder} material={materials.machinery} />
          <group name="crane:hoist">
            {ropeCount > 0 && <instancedMesh key={ropeCount} ref={ropesRef} name="crane:hoist:ropes" args={[ropeGeometry, materials.rope, ropeCount]} />}
            <group ref={hookRef} name="crane:hook">
              <mesh name="crane:hook:block" geometry={hook.block} material={materials.block} castShadow receiveShadow />
              <mesh name="crane:hook:fittings" geometry={hook.fittings} material={materials.machinery} castShadow receiveShadow />
              <mesh name="crane:hook:forging" geometry={hook.forging} material={materials.hook} castShadow receiveShadow />
            </group>
          </group>
        </group>
      </group>
    </group>
  )
}
