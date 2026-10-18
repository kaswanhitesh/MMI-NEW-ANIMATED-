/**
 * GeminiFactory: TEMPORARY procedural stand-in for the Gemini Engi Fab
 * heavy-engineering hall (pressure-vessel fabrication) of Scene 01 and its
 * forecourt. It is the factory slot's placeholder (see EnvironmentSlot.tsx): a
 * detailed GLB authored in the same local frame replaces it through
 * `slot.model` without touching the scene. Static and opaque: no fades, no
 * animation, nothing read per frame.
 *
 * LOCAL FRAME (GeminiFactoryConfig, ./types): origin at floor level on the front
 * (door) wall line; −Z into the hall, +Z towards the road, X across the bays. The
 * structural grid comes from ./factoryLayout: columns centred on the column lines
 * × rows (z = 0 … −length); the front wall's OUTER face on z = 0 with the front
 * columns standing half proud of it as pilasters; the side and back walls on the
 * outer columns' outer faces; crane rails `runwayInset()` inside their column
 * lines with the rail TOP at `craneRunway.railHeight`; slab top at
 * FACTORY_SLAB_TOP (8 mm). Fixtures are placed at `position` and turned by `yaw`
 * about +Y; in a fixture's own frame the vessel / roll / rack axis is local X,
 * and the welding manipulator's boom reaches along local +Z (world direction
 * (sin yaw, 0, cos yaw)) from its column at the origin.
 *
 * Props: `config` only. Layout and materials are memoised on it; geometries are
 * shared; everything is disposed when the config changes or on unmount.
 *
 * Groups (each holds one InstancedMesh per material and shape):
 *  - factory:frame: columns with base plates and yellow base bands at every
 *    columnPositions() point.
 *  - factory:crane-runways: per crane bay, two flanged box girders on corbel
 *    brackets with knee braces, web stiffeners, rails and yellow end stops.
 *  - factory:roof: Pratt roof trusses at `trusses.spacing` spanning each bay,
 *    lattice truss-carrier girders on the column lines, purlins, the roof deck at
 *    the eaves, parapet and coping, a ridge skylight per bay (lighter, slightly
 *    emissive, also visible from inside) and high-bay luminaires on drop rods.
 *  - factory:walls: side and back walls (concrete plinth, ribbed cladding to
 *    `claddingHeight`, glazed clerestory with mullions and transoms up to the
 *    eaves, internal girts, back-wall wind posts); the front wall with every bay
 *    door opening cut out (steel reveals, internal lintel), a deep door head with
 *    a yellow and black hazard band, telescopic sliding leaves PARKED OPEN beside
 *    each opening just in front of the wall, and guard bollards. The openings are
 *    completely clear from the floor to `door.height`.
 *  - factory:floor: the concrete slab and painted markings (walkway lines along
 *    both sides of each bay and the optional `floor.loadingZone` outline), 6 mm proud.
 *  - factory:fixtures: turning rolls, column and boom welding manipulator, plate
 *    stacks on dunnage, dished-head racks and three-roll plate bending machines.
 *    No vessels (separate assets).
 *  - factory:forecourt: the yard apron (y = LIFT.apron), boundary wall with piers
 *    and coping, gate pillars with palisade sliding leaves parked open beside the
 *    opening (inside the wall), a guard booth, and the driveway across the verge
 *    (y = LIFT.exitRoad). The gate opening is completely clear.
 *
 * Draw calls: 31 InstancedMeshes (2 frame, 3 runways, 4 roof, 8 walls, 2 floor,
 * 7 fixtures, 5 forecourt + accent). Shadows: everything receives except the
 * emissive luminaires and skylights; only ground-level and small parts cast
 * (columns, door leaves and heads, framing, bollards, fixtures, the forecourt's
 * wall, gate and booth). The cladding, roof, trusses and runways do not cast:
 * the key light's ±26 m shadow frustum would otherwise end in a hard edge inside
 * the 120 m hall.
 */
import { useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Euler,
  LatheGeometry,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector2,
  Vector3,
  type BufferGeometry,
  type InstancedMesh,
  type MeshStandardMaterialParameters,
} from 'three'
import type { Vec3 } from '../assets/types'
import { LIFT } from '../environment/roadSurface'
import {
  CRANE_RAIL_HEIGHT,
  FACTORY_SLAB_TOP,
  FACTORY_WALL_THICKNESS,
  ROOF_DECK_THICKNESS,
  ROOF_PURLIN_HEIGHT,
  TURNING_ROLLS_VESSEL_BOTTOM,
  columnLines,
  columnRows,
  interiorBounds,
  roofTrussLevels,
  runwayInset,
  type ColumnLine,
  type FactoryRect,
} from './factoryLayout'
import type { FabricationFixture, GeminiFactoryConfig } from './types'

export interface GeminiFactoryProps {
  config: GeminiFactoryConfig
}

/* -------------------------------------------------------------------------- */
/* Mesh table                                                                 */
/* -------------------------------------------------------------------------- */

/** Unit shapes: a 1 m cube, a Ø1 m × 1 m cylinder along local Y, and a Ø1 m dished head (open rim at y = 0, apex towards +Y). */
type Shape = 'box' | 'cylinder' | 'head'

type MaterialKey =
  | 'column'
  | 'truss'
  | 'runway'
  | 'cladding'
  | 'rib'
  | 'glazing'
  | 'roof'
  | 'skylight'
  | 'door'
  | 'accent'
  | 'dark'
  | 'wall'
  | 'slab'
  | 'marking'
  | 'luminaire'
  | 'fixture'
  | 'fixtureAccent'
  | 'plate'
  | 'bright'
  | 'paving'

type GroupKey = 'frame' | 'walls' | 'roof' | 'crane-runways' | 'floor' | 'fixtures' | 'forecourt'

interface MeshSpec {
  group: GroupKey
  shape: Shape
  material: MaterialKey
  castShadow: boolean
}

/** Every InstancedMesh of the factory (one draw call each when non-empty). The key is the mesh name after `factory:`. */
const MESHES = {
  'frame:steel': { group: 'frame', shape: 'box', material: 'column', castShadow: true },
  'frame:bands': { group: 'frame', shape: 'box', material: 'accent', castShadow: true },
  'crane-runways:girders': { group: 'crane-runways', shape: 'box', material: 'runway', castShadow: false },
  'crane-runways:rails': { group: 'crane-runways', shape: 'box', material: 'dark', castShadow: false },
  'crane-runways:stops': { group: 'crane-runways', shape: 'box', material: 'accent', castShadow: false },
  'roof:structure': { group: 'roof', shape: 'box', material: 'truss', castShadow: false },
  'roof:deck': { group: 'roof', shape: 'box', material: 'roof', castShadow: false },
  'roof:skylights': { group: 'roof', shape: 'box', material: 'skylight', castShadow: false },
  'roof:luminaires': { group: 'roof', shape: 'box', material: 'luminaire', castShadow: false },
  'walls:cladding': { group: 'walls', shape: 'box', material: 'cladding', castShadow: false },
  'walls:ribs': { group: 'walls', shape: 'box', material: 'rib', castShadow: false },
  'walls:plinth': { group: 'walls', shape: 'box', material: 'wall', castShadow: false },
  'walls:glazing': { group: 'walls', shape: 'box', material: 'glazing', castShadow: false },
  'walls:framing': { group: 'walls', shape: 'box', material: 'column', castShadow: true },
  'walls:doors': { group: 'walls', shape: 'box', material: 'door', castShadow: true },
  'walls:accent': { group: 'walls', shape: 'box', material: 'accent', castShadow: true },
  'walls:hazard': { group: 'walls', shape: 'box', material: 'dark', castShadow: false },
  'floor:slab': { group: 'floor', shape: 'box', material: 'slab', castShadow: false },
  'floor:markings': { group: 'floor', shape: 'box', material: 'marking', castShadow: false },
  'fixtures:steel': { group: 'fixtures', shape: 'box', material: 'fixture', castShadow: true },
  'fixtures:round': { group: 'fixtures', shape: 'cylinder', material: 'fixture', castShadow: true },
  'fixtures:guards': { group: 'fixtures', shape: 'box', material: 'fixtureAccent', castShadow: true },
  'fixtures:plate': { group: 'fixtures', shape: 'box', material: 'plate', castShadow: true },
  'fixtures:heads': { group: 'fixtures', shape: 'head', material: 'plate', castShadow: true },
  'fixtures:tyres': { group: 'fixtures', shape: 'cylinder', material: 'dark', castShadow: true },
  'fixtures:bright': { group: 'fixtures', shape: 'cylinder', material: 'bright', castShadow: true },
  'forecourt:paving': { group: 'forecourt', shape: 'box', material: 'paving', castShadow: false },
  'forecourt:walls': { group: 'forecourt', shape: 'box', material: 'wall', castShadow: true },
  'forecourt:copings': { group: 'forecourt', shape: 'box', material: 'roof', castShadow: true },
  'forecourt:gates': { group: 'forecourt', shape: 'box', material: 'column', castShadow: true },
  'forecourt:glazing': { group: 'forecourt', shape: 'box', material: 'glazing', castShadow: true },
  'forecourt:accent': { group: 'forecourt', shape: 'box', material: 'accent', castShadow: true },
} as const satisfies Record<string, MeshSpec>

type MeshId = keyof typeof MESHES
const MESH_IDS = Object.keys(MESHES) as MeshId[]
const GROUPS: readonly GroupKey[] = ['frame', 'crane-runways', 'roof', 'walls', 'floor', 'fixtures', 'forecourt']
/** Emissive parts neither cast nor receive shadows. */
const NO_RECEIVE: ReadonlySet<MaterialKey> = new Set<MaterialKey>(['luminaire', 'skylight'])

/* -------------------------------------------------------------------------- */
/* Dimensions                                                                 */
/* -------------------------------------------------------------------------- */

const T = FACTORY_WALL_THICKNESS
const SLAB = FACTORY_SLAB_TOP
const SIDES = [-1, 1] as const

// Walls.
const PLINTH_H = 1.2
const PLINTH_PROUD = 0.05
const RIB_PITCH = 1.0
const RIB_W = 0.07
const RIB_D = 0.06
const MULLION_PITCH = 3
const GLAZING_T = 0.06
const GIRT_LEVELS = [3.2, 6.4, 9.6] as const
const WIND_POST_PITCH = 6
// Front wall openings and doors.
const REVEAL = 0.12
const PARK_MARGIN = 0.15
const LEAF_T = 0.1
const LEAF_GAP = 0.05
const LEAF_OVERLAP = 0.1
const LEAF_STAGGER = 0.08
const LEAF_BOTTOM = 0.03
const HEAD_H = 1.1
const BAND_H = 0.42
const BAND_EDGE = 0.05
const STRIPE_W = 0.14
const STRIPE_PITCH = 0.55
// Roof.
const DECK_T = ROOF_DECK_THICKNESS
const PURLIN_H = ROOF_PURLIN_HEIGHT
const PURLIN_W = 0.18
const PURLIN_PITCH = 3
const COPING_H = 0.08
const TRUSS_PANEL = 3
const TOP_CHORD = 0.36
const BOTTOM_CHORD = 0.3
const WEB = 0.16
const SKYLIGHT_KERB = 0.35
const SKYLIGHT_TILT = 0.21
// Crane runways.
const FLANGE = 0.05
const FLANGE_OVERHANG = 0.12
const RAIL_W = 0.1
const STIFFENER_PITCH = 2.4
const CORBEL_H = 0.7
// Floor markings: painted 6 mm proud of the slab (and sunk 4 mm into it, so no face is coplanar).
const MARK_LIFT = 0.006
const WALKWAY_WIDTH = 1.5
// Fixtures.
const ROLL_WHEEL_R = 0.32
const ROLL_WHEEL_W = 0.26
/** Angle of each turning-roll wheel from the vessel's lowest point (the two wheels of a stand cradle ±35°). */
const ROLL_ANGLE = (35 * Math.PI) / 180
/** Dished head proportions for a Ø1 unit head: 2:1 semi-ellipsoidal dish depth, straight flange and wall thickness. */
const HEAD_DEPTH = 0.25
const HEAD_SKIRT = 0.05
const HEAD_WALL = 0.012
// Forecourt.
const BOUNDARY_T = 0.25
const PIER = 0.45
const PIER_PITCH = 6
const GATE_POST = 0.9
const GATE_LEAF_MAX = 10
const GATE_OVERLAP = 0.2
const GATE_LEAF_PITCH = 0.22
const PALE_PITCH = 0.2
/** Hazard stripes, polyurethane tyres and crane rails. */
const DARK_STEEL = '#1d2024'

/* -------------------------------------------------------------------------- */
/* Parts                                                                      */
/* -------------------------------------------------------------------------- */

type Quat = readonly [number, number, number, number]

/** One instance of a unit shape scaled to `s`, rotated by `q` (optional) about its centre `p`. */
interface Part {
  p: Vec3
  s: Vec3
  q?: Quat
}

type Layout = Record<MeshId, Part[]>
type Add = (id: MeshId, part: Part) => void

/* Scratch objects (module level, reused). */
const _matrix = new Matrix4()
const _position = new Vector3()
const _scale = new Vector3()
const _quat = new Quaternion()
const _qa = new Quaternion()
const _qb = new Quaternion()
const _va = new Vector3()
const _euler = new Euler()
const Y_UP = new Vector3(0, 1, 0)

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function quatEuler(x: number, y: number, z: number): Quat {
  _qa.setFromEuler(_euler.set(x, y, z))
  return [_qa.x, _qa.y, _qa.z, _qa.w]
}

/** Quarter turns that lay a unit cylinder's (or head's) Y axis along +X / along Z. */
const ALONG_X = quatEuler(0, 0, -Math.PI / 2)
const ALONG_Z = quatEuler(Math.PI / 2, 0, 0)
/** Hazard stripe leaning 45° (top towards +X). */
const STRIPE_TILT = quatEuler(0, 0, -Math.PI / 4)
/** Palisade pale tip: a small square turned 45° into a diamond. */
const DIAMOND = quatEuler(0, 0, Math.PI / 4)

/** Axis-aligned box from its extents (either order). */
function ext(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Part {
  return {
    p: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
    s: [Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)],
  }
}

/** Box of section w (local X) × d (local Z) whose length runs from a to b. */
function strut(a: Vec3, b: Vec3, w: number, d: number): Part {
  _va.set(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  const length = _va.length()
  if (length > 1e-9) _va.divideScalar(length)
  else _va.copy(Y_UP)
  _qa.setFromUnitVectors(Y_UP, _va)
  return { p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], s: [w, length, d], q: [_qa.x, _qa.y, _qa.z, _qa.w] }
}

/** Cylinder of diameter `dia` and length `len` centred on `c` with its axis along `axis`. */
function cyl(c: Vec3, dia: number, len: number, axis: 'x' | 'y' | 'z'): Part {
  return { p: c, s: [dia, len, dia], q: axis === 'x' ? ALONG_X : axis === 'z' ? ALONG_Z : undefined }
}

/** Splits [a, b] around the gaps into the spans that remain. */
function spansAround(a: number, b: number, gaps: ReadonlyArray<readonly [number, number]>): Array<[number, number]> {
  const sorted = gaps.map(([g0, g1]) => (g0 < g1 ? [g0, g1] : [g1, g0]) as [number, number]).sort((p, q) => p[0] - q[0])
  const out: Array<[number, number]> = []
  let cursor = a
  for (const [g0, g1] of sorted) {
    if (g1 <= cursor || g0 >= b) continue
    if (g0 > cursor) out.push([cursor, g0])
    cursor = Math.max(cursor, g1)
  }
  if (cursor < b) out.push([cursor, b])
  return out
}

/** Small deterministic PRNG (mulberry32), so the plate stacks are identical on every render. */
function createRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* -------------------------------------------------------------------------- */
/* Layout                                                                     */
/* -------------------------------------------------------------------------- */

interface Bay {
  name: string
  x0: number
  x1: number
  door: { x0: number; x1: number; height: number }
  hasCrane: boolean
}

interface Dims {
  H: number
  P: number
  half: number
  lines: ColumnLine[]
  rows: number[]
  bays: Bay[]
  inner: FactoryRect
  /** Outer faces of the side walls. */
  xo0: number
  xo1: number
  /** Back wall inner and outer faces. */
  zBackInner: number
  zBackOuter: number
  /** Top of the truss top chords (under the purlins) and bottom of the bottom chords. */
  trussTop: number
  trussBottom: number
}

function deriveDims(cfg: GeminiFactoryConfig): Dims {
  const H = Math.max(4, cfg.eavesHeight)
  const half = cfg.columnSize / 2
  const inner = interiorBounds(cfg)
  const bays = cfg.bays
    .map((bay) => {
      const x0 = Math.min(bay.x0, bay.x1)
      const x1 = Math.max(bay.x0, bay.x1)
      const door = {
        x0: clamp(Math.min(bay.door.x0, bay.door.x1), x0 + half, x1 - half),
        x1: clamp(Math.max(bay.door.x0, bay.door.x1), x0 + half, x1 - half),
        height: clamp(bay.door.height, 1, H - HEAD_H - 0.3),
      }
      return { name: bay.name, x0, x1, door, hasCrane: bay.hasCrane }
    })
    .sort((a, b) => a.x0 - b.x0)
  const truss = roofTrussLevels(cfg)
  return {
    H,
    P: Math.max(0, cfg.parapetHeight),
    half,
    lines: columnLines(cfg),
    rows: columnRows(cfg),
    bays,
    inner,
    xo0: inner.x0 - T,
    xo1: inner.x1 + T,
    zBackInner: inner.z1,
    zBackOuter: inner.z1 - T,
    trussTop: truss.top,
    trussBottom: truss.bottom,
  }
}

/** Columns at every grid point: full height to the eaves, base plate and a yellow base band. */
function buildFrame(d: Dims, add: Add) {
  const { half, H } = d
  for (const { x } of d.lines) {
    for (const z of d.rows) {
      add('frame:steel', ext(x - half, x + half, 0, H, z - half, z + half))
      add('frame:steel', ext(x - half - 0.2, x + half + 0.2, 0, SLAB + 0.05, z - half - 0.2, z + half + 0.2))
      add('frame:bands', ext(x - half - 0.02, x + half + 0.02, SLAB + 0.05, SLAB + 0.65, z - half - 0.02, z + half + 0.02))
    }
  }
}

/** Runway girders on corbels along both column lines of every crane bay, with rails and end stops. */
function buildRunways(d: Dims, cfg: GeminiFactoryConfig, add: Add) {
  const { railHeight, girderDepth: gd, girderWidth: gw } = cfg.craneRunway
  const inset = runwayInset(cfg)
  const gTop = railHeight - CRANE_RAIL_HEIGHT
  const gBot = gTop - gd
  const z0 = -T
  const z1 = d.zBackInner
  const halfW = gw / 2
  for (const bay of d.bays) {
    if (!bay.hasCrane) continue
    for (const [lineX, dir] of [
      [bay.x0, 1],
      [bay.x1, -1],
    ] as const) {
      const rx = lineX + dir * inset
      // Web box, wide top and bottom flanges, rail, and stiffener plates down both faces.
      add('crane-runways:girders', ext(rx - halfW, rx + halfW, gBot + FLANGE, gTop - FLANGE, z1, z0))
      add('crane-runways:girders', ext(rx - halfW - FLANGE_OVERHANG, rx + halfW + FLANGE_OVERHANG, gTop - FLANGE, gTop, z1, z0))
      add('crane-runways:girders', ext(rx - halfW - FLANGE_OVERHANG, rx + halfW + FLANGE_OVERHANG, gBot, gBot + FLANGE, z1, z0))
      add('crane-runways:rails', ext(rx - RAIL_W / 2, rx + RAIL_W / 2, gTop, railHeight, z1 + 0.1, z0 - 0.1))
      for (let z = z0 - STIFFENER_PITCH / 2; z > z1; z -= STIFFENER_PITCH) {
        add('crane-runways:girders', ext(rx - halfW - 0.03, rx + halfW + 0.03, gBot + FLANGE, gTop - FLANGE, z - 0.015, z + 0.015))
      }
      for (const zs of [z0 - 0.45, z1 + 0.45]) add('crane-runways:stops', ext(rx - 0.22, rx + 0.22, railHeight - 0.05, railHeight + 0.45, zs - 0.2, zs + 0.2))
      // Corbel bracket and knee brace off every column of the line, kept inside the end walls.
      const faceX = lineX + dir * d.half
      const farX = rx + dir * (halfW + FLANGE_OVERHANG)
      for (const z of d.rows) {
        const zc = clamp(z, z1 + 0.3, z0 - 0.3)
        add('crane-runways:girders', ext(faceX, farX, gBot - CORBEL_H, gBot, zc - 0.28, zc + 0.28))
        add('crane-runways:girders', strut([faceX, gBot - CORBEL_H - 1.1, zc], [farX - dir * 0.1, gBot - CORBEL_H + 0.05, zc], 0.22, 0.4))
      }
    }
  }
}

/** Trusses, truss-carrier girders, purlins, deck, parapet, ridge skylights and luminaires. */
function buildRoof(d: Dims, cfg: GeminiFactoryConfig, add: Add) {
  const { H, P, xo0, xo1, zBackOuter, zBackInner, trussTop, trussBottom } = d
  const yT = trussTop - TOP_CHORD / 2
  const yB = trussBottom + BOTTOM_CHORD / 2

  // Deck inside the parapets, parapets on all four edges and a coping that overhangs them slightly.
  add('roof:deck', ext(xo0 + T, xo1 - T, H - DECK_T, H, zBackOuter + T, -T))
  if (P > COPING_H + 0.01) {
    const pTop = H + P - COPING_H
    const c = 0.04
    add('roof:deck', ext(xo0, xo1, H, pTop, -T, 0))
    add('roof:deck', ext(xo0, xo1, H, pTop, zBackOuter, zBackOuter + T))
    add('roof:deck', ext(xo0, xo0 + T, H, pTop, zBackOuter + T, -T))
    add('roof:deck', ext(xo1 - T, xo1, H, pTop, zBackOuter + T, -T))
    add('roof:deck', ext(xo0 - c, xo1 + c, pTop, H + P, -T - c, c))
    add('roof:deck', ext(xo0 - c, xo1 + c, pTop, H + P, zBackOuter - c, zBackOuter + T + c))
    add('roof:deck', ext(xo0 - c, xo0 + T + c, pTop, H + P, zBackOuter + T + c, -T - c))
    add('roof:deck', ext(xo1 - T - c, xo1 + c, pTop, H + P, zBackOuter + T + c, -T - c))
  }

  // Truss rows along Z (the end walls carry the ends).
  const spacing = cfg.trusses.spacing > 0.5 ? cfg.trusses.spacing : cfg.length
  const trussZs: number[] = []
  for (let k = 1; k * spacing < cfg.length - spacing * 0.25; k++) trussZs.push(-k * spacing)

  for (const bay of d.bays) {
    const width = bay.x1 - bay.x0
    const xc = (bay.x0 + bay.x1) / 2

    // Pratt trusses spanning the bay between the carrier girders: chords, posts and diagonals sloping down to mid-span.
    const xa = bay.x0 + 0.2
    const xb = bay.x1 - 0.2
    const panels = Math.max(4, 2 * Math.round((xb - xa) / (2 * TRUSS_PANEL)))
    const pw = (xb - xa) / panels
    for (const z of trussZs) {
      add('roof:structure', ext(xa, xb, trussTop - TOP_CHORD, trussTop, z - 0.18, z + 0.18))
      add('roof:structure', ext(xa, xb, trussBottom, trussBottom + BOTTOM_CHORD, z - 0.15, z + 0.15))
      for (let i = 0; i <= panels; i++) {
        const x = xa + i * pw
        add('roof:structure', ext(x - WEB / 2, x + WEB / 2, yB, yT, z - WEB / 2, z + WEB / 2))
        if (i === panels) continue
        const towardsMid = i < panels / 2
        add('roof:structure', strut([towardsMid ? x : x + pw, yT, z], [towardsMid ? x + pw : x, yB, z], WEB, WEB))
      }
    }

    // Ridge skylight: a lit strip through the deck (seen from inside), kerbs, end caps and two shallow glazed slopes.
    const skyW = clamp(0.12 * width, 2.4, 5)
    const sz0 = -T - 2.5
    const sz1 = zBackInner + 2.5
    if (sz0 - sz1 > 2) {
      const hw = skyW / 2 + 0.2
      const rise = hw * Math.tan(SKYLIGHT_TILT)
      const base = H + SKYLIGHT_KERB
      add('roof:skylights', ext(xc - skyW / 2, xc + skyW / 2, H - DECK_T - 0.03, H + 0.02, sz1, sz0))
      for (const s of SIDES) {
        add('roof:deck', ext(xc + s * (skyW / 2), xc + s * (skyW / 2 + 0.2), H, base, sz1 - 0.2, sz0 + 0.2))
        add('roof:skylights', {
          p: [xc + (s * hw) / 2, base + rise / 2 + 0.02, (sz0 + sz1) / 2],
          s: [hw / Math.cos(SKYLIGHT_TILT), 0.06, sz0 - sz1 + 0.4],
          q: quatEuler(0, 0, -s * SKYLIGHT_TILT),
        })
      }
      for (const [za, zb] of [
        [sz0, sz0 + 0.2],
        [sz1 - 0.2, sz1],
      ] as const) {
        add('roof:deck', ext(xc - hw, xc + hw, H, base, za, zb))
        add('roof:deck', ext(xc - hw / 2, xc + hw / 2, base, base + rise / 2, za, zb))
      }
    }

    // Purlins along Z on the top chords, clear of the skylight strip.
    const purlins = Math.max(2, Math.round(width / PURLIN_PITCH))
    for (let i = 0; i < purlins; i++) {
      const x = bay.x0 + ((i + 0.5) * width) / purlins
      if (Math.abs(x - xc) < skyW / 2 + 0.3) continue
      add('roof:structure', ext(x - PURLIN_W / 2, x + PURLIN_W / 2, trussTop, trussTop + PURLIN_H, zBackInner, -T))
    }

    // High-bay luminaires in rows along the bay, midway between trusses, hung from the deck on two rods.
    const lum = cfg.luminaires
    if (lum.spacing > 0.5) {
      const rows = Math.max(1, Math.round(width / 12))
      for (let j = 0; j < rows; j++) {
        const x = bay.x0 + ((j + 0.5) * width) / rows
        for (let z = -lum.spacing / 2; z > zBackInner + 1; z -= lum.spacing) {
          add('roof:luminaires', ext(x - 0.28, x + 0.28, lum.height - 0.09, lum.height + 0.09, z - 0.65, z + 0.65))
          for (const zr of [z - 0.45, z + 0.45]) add('roof:structure', ext(x - 0.015, x + 0.015, lum.height + 0.09, H - DECK_T, zr - 0.015, zr + 0.015))
        }
      }
    }
  }

  // Lattice truss-carrier girders along every column line (they carry the trusses that land between columns).
  const za = -T
  const zb = zBackInner
  const length = za - zb
  const panels = Math.max(2, Math.round(length / TRUSS_PANEL))
  const pl = length / panels
  for (const { x } of d.lines) {
    add('roof:structure', ext(x - 0.2, x + 0.2, trussTop - TOP_CHORD, trussTop, zb, za))
    add('roof:structure', ext(x - 0.17, x + 0.17, trussBottom, trussBottom + BOTTOM_CHORD, zb, za))
    for (let i = 0; i <= panels; i++) {
      const z = za - i * pl
      add('roof:structure', ext(x - WEB / 2, x + WEB / 2, yB, yT, z - WEB / 2, z + WEB / 2))
      if (i === panels) continue
      const down = i % 2 === 0
      add('roof:structure', strut([x, down ? yT : yB, z], [x, down ? yB : yT, z - pl], WEB, WEB))
    }
  }
}

/** Side and back walls (plinth, ribbed cladding, glazed clerestory), and the front wall with its doors. */
function buildWalls(d: Dims, cfg: GeminiFactoryConfig, add: Add) {
  const { H, xo0, xo1, zBackOuter, zBackInner } = d
  const ch = clamp(cfg.claddingHeight, PLINTH_H + 0.5, H)
  const glazed = H - ch > 0.3
  const girts = GIRT_LEVELS.filter((y) => y < ch - 0.4)
  const transoms: ReadonlyArray<readonly [number, number]> = [
    [ch - 0.05, ch + 0.15],
    [(ch + H) / 2 - 0.06, (ch + H) / 2 + 0.06],
    [H - 0.3, H],
  ]

  // --- Side walls, between the front and back walls. ---
  const za = -T
  const zb = zBackOuter + T
  for (const s of SIDES) {
    const xOut = s < 0 ? xo0 : xo1
    const xIn = xOut - s * T
    const wx0 = Math.min(xOut, xIn)
    const wx1 = Math.max(xOut, xIn)
    add('walls:plinth', ext(xOut + s * PLINTH_PROUD, xIn, 0, PLINTH_H, zb, za))
    add('walls:cladding', ext(wx0, wx1, PLINTH_H, ch, zb, za))
    for (let z = za - RIB_PITCH / 2; z > zb; z -= RIB_PITCH) {
      add('walls:ribs', ext(xOut + s * RIB_D, xOut - s * 0.01, PLINTH_H + 0.03, ch - 0.03, z - RIB_W / 2, z + RIB_W / 2))
    }
    for (const y of girts) add('walls:framing', ext(xIn, xIn - s * 0.15, y - 0.1, y + 0.1, zBackInner, -T))
    if (glazed) {
      const xm = (wx0 + wx1) / 2
      add('walls:glazing', ext(xm - GLAZING_T / 2, xm + GLAZING_T / 2, ch, H, zb, za))
      for (const [y0, y1] of transoms) add('walls:framing', ext(wx0 - 0.03, wx1 + 0.03, y0, y1, zb, za))
      for (let z = za - MULLION_PITCH; z > zb + 0.2; z -= MULLION_PITCH) add('walls:framing', ext(wx0 - 0.03, wx1 + 0.03, ch, H, z - 0.06, z + 0.06))
    }
  }

  // --- Back wall, full width (it owns the back corners). ---
  {
    const zo = zBackOuter
    const zi = zBackOuter + T
    const width = xo1 - xo0
    add('walls:plinth', ext(xo0 - PLINTH_PROUD, xo1 + PLINTH_PROUD, 0, PLINTH_H, zo - PLINTH_PROUD, zi))
    add('walls:cladding', ext(xo0, xo1, PLINTH_H, ch, zo, zi))
    for (let x = xo0 + RIB_PITCH / 2; x < xo1; x += RIB_PITCH) add('walls:ribs', ext(x - RIB_W / 2, x + RIB_W / 2, PLINTH_H + 0.03, ch - 0.03, zo - RIB_D, zo + 0.01))
    for (const y of girts) add('walls:framing', ext(xo0 + T, xo1 - T, y - 0.1, y + 0.1, zi, zi + 0.15))
    if (glazed) {
      const zm = (zo + zi) / 2
      add('walls:glazing', ext(xo0, xo1, ch, H, zm - GLAZING_T / 2, zm + GLAZING_T / 2))
      for (const [y0, y1] of transoms) add('walls:framing', ext(xo0 - 0.03, xo1 + 0.03, y0, y1, zo - 0.03, zi + 0.03))
      for (const x of [xo0, xo1 - T]) add('walls:framing', ext(x - 0.03, x + T + 0.03, ch, H, zo - 0.03, zi + 0.03))
      const n = Math.max(1, Math.round(width / MULLION_PITCH))
      for (let i = 1; i < n; i++) {
        const x = xo0 + (i * width) / n
        add('walls:framing', ext(x - 0.06, x + 0.06, ch, H, zo - 0.03, zi + 0.03))
      }
    }
    // Wind posts inside the back wall between the column lines.
    for (const bay of d.bays) {
      const m = Math.max(1, Math.round((bay.x1 - bay.x0) / WIND_POST_PITCH))
      for (let i = 1; i < m; i++) {
        const x = bay.x0 + (i * (bay.x1 - bay.x0)) / m
        add('walls:framing', ext(x - 0.22, x + 0.22, 0, H - DECK_T, zi, zi + 0.4))
      }
    }
  }

  // --- Front wall (outer face on z = 0) with the door openings cut out. ---
  const openings = d.bays.map((bay) => [bay.door.x0 - REVEAL, bay.door.x1 + REVEAL] as const)
  for (const [a, b] of spansAround(xo0, xo1, openings)) {
    add('walls:plinth', ext(a - (a <= xo0 + 1e-6 ? PLINTH_PROUD : 0), b + (b >= xo1 - 1e-6 ? PLINTH_PROUD : 0), 0, PLINTH_H, -T, PLINTH_PROUD))
    add('walls:cladding', ext(a, b, PLINTH_H, H, -T, 0))
  }
  for (let x = xo0 + RIB_PITCH / 2; x < xo1; x += RIB_PITCH) {
    const over = d.bays.find((bay) => x > bay.door.x0 - REVEAL - RIB_W && x < bay.door.x1 + REVEAL + RIB_W)
    const y0 = over ? over.door.height + 0.03 : PLINTH_H + 0.03
    add('walls:ribs', ext(x - RIB_W / 2, x + RIB_W / 2, y0, H - 0.03, -0.01, RIB_D))
  }
  for (const bay of d.bays) buildDoor(bay, d, add)
}

/**
 * One bay door: wall panel, reveals and internal lintel around the opening; telescopic leaves parked open on both
 * sides just in front of the wall (as many per side as fit before the next column); the door head housing their
 * track with a hazard band over the opening; and guard bollards. Nothing enters x ∈ [door.x0, door.x1] below
 * door.height.
 */
function buildDoor(bay: Bay, d: Dims, add: Add) {
  const { door } = bay
  add('walls:cladding', ext(door.x0 - REVEAL, door.x1 + REVEAL, door.height, d.H, -T, 0))
  add('walls:framing', ext(door.x0 - REVEAL, door.x0, 0, door.height, -T, 0.03))
  add('walls:framing', ext(door.x1, door.x1 + REVEAL, 0, door.height, -T, 0.03))
  add('walls:framing', ext(door.x0 - 0.6, door.x1 + 0.6, door.height, door.height + 0.9, -T - 0.4, -T))

  const halfW = (door.x1 - door.x0) / 2
  if (halfW < 0.2) return
  const availL = door.x0 - (bay.x0 + d.half) - PARK_MARGIN
  const availR = bay.x1 - d.half - door.x1 - PARK_MARGIN
  const avail = Math.max(0.6, Math.min(availL, availR))
  const n = Math.max(1, Math.ceil(halfW / Math.max(0.3, avail - LEAF_OVERLAP) - 1e-9))
  const w = halfW / n + LEAF_OVERLAP
  const stagger = n > 1 ? Math.min(LEAF_STAGGER, Math.max(0, avail - w) / (n - 1)) : 0
  const stack = LEAF_GAP + n * (LEAF_T + LEAF_GAP)
  const leafTop = door.height + 0.3
  let xMin = door.x0
  let xMax = door.x1
  for (const side of SIDES) {
    const edge = side < 0 ? door.x0 : door.x1
    for (let k = 0; k < n; k++) {
      // k = 0 hangs against the wall; the front leaf (k = n − 1) is flush with the opening, the others step back.
      const offset = (n - 1 - k) * stagger
      const xa = side < 0 ? edge - w - offset : edge + offset
      const xb = xa + w
      xMin = Math.min(xMin, xa)
      xMax = Math.max(xMax, xb)
      const zc = LEAF_GAP + k * (LEAF_T + LEAF_GAP) + LEAF_T / 2
      const zf = zc + LEAF_T / 2
      add('walls:doors', ext(xa, xb, LEAF_BOTTOM, leafTop, zc - LEAF_T / 2, zf))
      add('walls:framing', ext(xa - 0.01, xa + 0.1, LEAF_BOTTOM - 0.005, leafTop, zc - LEAF_T / 2 - 0.012, zf + 0.012))
      add('walls:framing', ext(xb - 0.1, xb + 0.01, LEAF_BOTTOM - 0.005, leafTop, zc - LEAF_T / 2 - 0.012, zf + 0.012))
      if (k === n - 1) {
        for (let y = 1.4; y < door.height - 0.4; y += 1.6) add('walls:ribs', ext(xa + 0.1, xb - 0.1, y - 0.05, y + 0.05, zf - 0.005, zf + 0.025))
      }
    }
  }

  // Door head over the whole travel, deep enough to house the parked stack's track.
  const zf = stack + 0.15
  add('walls:framing', ext(xMin - 0.15, xMax + 0.15, door.height, door.height + HEAD_H, 0, zf))

  // Hazard band over the opening: yellow ground, dark edges and 45° stripes.
  const yb0 = door.height + 0.1
  const yb1 = yb0 + BAND_H
  add('walls:accent', ext(door.x0 + 0.01, door.x1 - 0.01, yb0 + 0.01, yb1 - 0.01, zf, zf + 0.02))
  add('walls:hazard', ext(door.x0, door.x1, yb0, yb0 + BAND_EDGE, zf, zf + 0.03))
  add('walls:hazard', ext(door.x0, door.x1, yb1 - BAND_EDGE, yb1, zf, zf + 0.03))
  add('walls:hazard', ext(door.x0, door.x0 + BAND_EDGE, yb0, yb1, zf, zf + 0.03))
  add('walls:hazard', ext(door.x1 - BAND_EDGE, door.x1, yb0, yb1, zf, zf + 0.03))
  const inner = BAND_H - 2 * BAND_EDGE + 0.04
  const stripeLength = inner * Math.SQRT2 - STRIPE_W
  const reach = inner / 2
  for (let x = door.x0 + BAND_EDGE + reach; x <= door.x1 - BAND_EDGE - reach; x += STRIPE_PITCH) {
    add('walls:hazard', { p: [x, (yb0 + yb1) / 2, zf + 0.0125], s: [STRIPE_W, stripeLength, 0.025], q: STRIPE_TILT })
  }

  // Guard bollards in front of the jambs.
  const zb = zf + 0.75
  for (const x of [door.x0 - 0.55, door.x1 + 0.55]) {
    add('walls:accent', ext(x - 0.15, x + 0.15, 0, 1.1, zb - 0.15, zb + 0.15))
    add('walls:hazard', ext(x - 0.16, x + 0.16, 0.78, 0.9, zb - 0.16, zb + 0.16))
  }
}

/** Slab over the whole interior (to the front face, under the door thresholds) and painted markings. */
function buildFloor(d: Dims, cfg: GeminiFactoryConfig, add: Add) {
  const { inner } = d
  add('floor:slab', ext(inner.x0, inner.x1, 0, SLAB, inner.z1, 0))
  const mw = Math.max(0.05, cfg.floor.markingWidth)
  const y0 = SLAB - 0.004
  const y1 = SLAB + MARK_LIFT
  const lineAlongZ = (x: number, za: number, zb: number) => add('floor:markings', ext(x - mw / 2, x + mw / 2, y0, y1, za, zb))
  const lineAlongX = (z: number, xa: number, xb: number) => add('floor:markings', ext(xa, xb, y0, y1, z - mw / 2, z + mw / 2))

  // Walkways along both sides of every bay, just inside the column lines.
  const za = inner.z0 - 1
  const zb = inner.z1 + 1
  const walkIn = d.half + 0.9
  for (const bay of d.bays) {
    for (const [edge, dir] of [
      [bay.x0, 1],
      [bay.x1, -1],
    ] as const) {
      for (const offset of [walkIn, walkIn + WALKWAY_WIDTH]) lineAlongZ(edge + dir * offset, za, zb)
    }
  }

  // Loading zone outline (only if its bay exists and the zone fits inside the hall).
  const zone = cfg.floor.loadingZone
  const zoneBay = zone && d.bays.find((bay) => bay.name === zone.bay)
  if (zone && zoneBay && zone.x0 > zoneBay.x0 && zone.x1 < zoneBay.x1 && zone.z0 < inner.z0 && zone.z1 > inner.z1) {
    lineAlongX(zone.z0, zone.x0 - mw / 2, zone.x1 + mw / 2)
    lineAlongX(zone.z1, zone.x0 - mw / 2, zone.x1 + mw / 2)
    lineAlongZ(zone.x0, zone.z0 - mw / 2, zone.z1 + mw / 2)
    lineAlongZ(zone.x1, zone.z0 - mw / 2, zone.z1 + mw / 2)
  }
}

/* -------------------------------------------------------------------------- */
/* Fixtures (each built in its own frame, then placed and yawed)              */
/* -------------------------------------------------------------------------- */

type Place = (id: MeshId, part: Part) => void
type FixtureOf<K extends FabricationFixture['kind']> = Extract<FabricationFixture, { kind: K }>

function fixturePlacer(fx: FabricationFixture, add: Add): Place {
  const [px, py, pz] = fx.position
  const c = Math.cos(fx.yaw)
  const s = Math.sin(fx.yaw)
  const yaw = new Quaternion().setFromAxisAngle(Y_UP, fx.yaw)
  return (id, part) => {
    const [x, y, z] = part.p
    _qa.copy(yaw)
    if (part.q) _qa.multiply(_qb.set(part.q[0], part.q[1], part.q[2], part.q[3]))
    add(id, { p: [px + x * c + z * s, py + y, pz - x * s + z * c], s: part.s, q: [_qa.x, _qa.y, _qa.z, _qa.w] })
  }
}

/**
 * Two roller stands at ±0.3·length along the vessel axis (local X), each a base frame with two polyurethane wheels
 * whose treads cradle a vessel of `vesselDiameter` with its lowest point at TURNING_ROLLS_VESSEL_BOTTOM; the −X stand
 * is the drive (gearbox, guarded coupling, motor).
 */
function turningRolls(fx: FixtureOf<'turningRolls'>, place: Place) {
  const R = Math.max(0.3, fx.vesselDiameter / 2)
  const rw = ROLL_WHEEL_R
  const ww = ROLL_WHEEL_W
  const reach = R + rw
  const wz = reach * Math.sin(ROLL_ANGLE)
  const wy = TURNING_ROLLS_VESSEL_BOTTOM + R - reach * Math.cos(ROLL_ANGLE)
  const baseTop = clamp(wy - rw - 0.06, SLAB + 0.1, SLAB + 0.22)
  for (const [index, sx] of SIDES.entries()) {
    const xc = sx * fx.length * 0.3
    place('fixtures:steel', ext(xc - 0.5, xc + 0.5, SLAB, baseTop, -(wz + 0.62), wz + 0.62))
    for (const sz of SIDES) {
      const z = sz * wz
      place('fixtures:tyres', cyl([xc, wy, z], 2 * rw, ww, 'x'))
      place('fixtures:bright', cyl([xc, wy, z], rw * 1.1, ww + 0.04, 'x'))
      place('fixtures:bright', cyl([xc, wy, z], 0.12, ww + 0.42, 'x'))
      for (const side of SIDES) {
        // Yoke plates (cut back on the vessel side so they stay clear of the shell) and bearing blocks.
        const px = xc + side * (ww / 2 + 0.05)
        place('fixtures:steel', ext(px - 0.03, px + 0.03, baseTop, wy + 0.08, z - sz * rw * 0.55, z + sz * (rw + 0.1)))
        place('fixtures:steel', ext(xc + side * (ww / 2 + 0.08), xc + side * (ww / 2 + 0.24), wy - 0.12, wy + 0.12, z - 0.14, z + 0.14))
      }
    }
    if (index === 0) {
      const gx = xc + sx * (ww / 2 + 0.55)
      const gz0 = wz - 0.04
      const gz1 = wz + 0.48
      place('fixtures:bright', cyl([xc + sx * 0.4, wy, wz], 0.1, 0.16, 'x'))
      place('fixtures:steel', ext(gx - 0.22, gx + 0.22, SLAB, wy - 0.24, gz0, gz1))
      place('fixtures:steel', ext(gx - 0.22, gx + 0.22, wy - 0.24, wy + 0.26, gz0, gz1))
      place('fixtures:guards', ext(gx + sx * 0.22, gx + sx * 0.42, wy - 0.17, wy + 0.17, wz + 0.05, wz + 0.39))
      place('fixtures:round', cyl([gx + sx * 0.75, wy, wz + 0.22], 0.4, 0.66, 'x'))
      place('fixtures:steel', ext(gx + sx * 0.45, gx + sx * 1.05, SLAB, wy - 0.2, wz + 0.04, wz + 0.4))
    }
  }
}

/** Column and boom: carriage on rails along local X, column, boom along local +Z at boomHeight with head and wire drum. */
function weldingManipulator(fx: FixtureOf<'weldingManipulator'>, place: Place) {
  const colH = Math.max(fx.columnHeight, 2.5)
  const bH = clamp(fx.boomHeight, 1.6, colH - 0.7)
  const L = Math.max(1.5, fx.boomLength)
  const railTop = SLAB + 0.12
  for (const sz of SIDES) {
    const z = sz * 0.75
    place('fixtures:steel', ext(-4, 4, SLAB, railTop, z - 0.07, z + 0.07))
    for (const sx of SIDES) {
      place('fixtures:guards', ext(sx * 4 - 0.12, sx * 4 + 0.12, railTop, railTop + 0.22, z - 0.13, z + 0.13))
      place('fixtures:round', cyl([sx * 0.7, railTop + 0.15, z], 0.3, 0.12, 'z'))
    }
  }
  const cBot = railTop + 0.12
  const cTop = cBot + 0.55
  place('fixtures:steel', ext(-1, 1, cBot, cTop, -1, 1))
  place('fixtures:bright', cyl([0, cTop + 0.06, 0], 1.2, 0.12, 'y'))
  place('fixtures:steel', ext(-0.33, 0.33, cTop + 0.12, colH, -0.33, 0.33))
  place('fixtures:steel', ext(-0.42, 0.42, colH, colH + 0.1, -0.42, 0.42))
  place('fixtures:steel', ext(-0.95, -0.35, cTop, cTop + 1.3, -0.95, -0.65))
  // Boom saddle on the column, the boom, and its counterweight behind the column.
  place('fixtures:steel', ext(-0.55, 0.55, bH - 0.7, bH + 0.6, -0.55, 0.55))
  place('fixtures:steel', ext(-0.22, 0.22, bH - 0.25, bH + 0.25, -1.9, L))
  place('fixtures:plate', ext(-0.4, 0.4, bH - 0.45, bH + 0.42, -2.1, -1.25))
  // Wire drum on a stand on the boom near the tip.
  const dz = L - 1.3
  place('fixtures:steel', ext(-0.2, 0.2, bH + 0.25, bH + 0.58, dz - 0.06, dz + 0.06))
  place('fixtures:tyres', cyl([0, bH + 0.66, dz], 0.72, 0.3, 'x'))
  for (const sx of SIDES) place('fixtures:bright', cyl([sx * 0.165, bH + 0.66, dz], 0.84, 0.03, 'x'))
  // Welding head: cross slide, vertical slide, torch and flux hopper.
  place('fixtures:steel', ext(-0.25, 0.25, bH - 0.3, bH + 0.3, L - 0.05, L + 0.35))
  place('fixtures:steel', ext(-0.1, 0.1, bH - 1.5, bH - 0.3, L + 0.05, L + 0.25))
  place('fixtures:bright', cyl([0, bH - 1.72, L + 0.15], 0.08, 0.44, 'y'))
  place('fixtures:round', cyl([0.32, bH - 0.8, L + 0.15], 0.3, 0.45, 'y'))
  // Operator platform on the saddle with a guard rail.
  const deck = bH - 0.64
  const rail = deck + 1.0
  place('fixtures:steel', ext(-1.75, -0.55, deck - 0.06, deck, -0.6, 0.6))
  for (const [px, pz] of [
    [-1.72, -0.57],
    [-1.72, 0.57],
    [-0.6, -0.57],
    [-0.6, 0.57],
  ] as const) {
    place('fixtures:guards', ext(px - 0.025, px + 0.025, deck, rail, pz - 0.025, pz + 0.025))
  }
  for (const y of [rail, rail - 0.5]) {
    place('fixtures:guards', ext(-1.75, -1.69, y - 0.05, y, -0.6, 0.6))
    for (const pz of [-0.57, 0.57]) place('fixtures:guards', ext(-1.75, -0.55, y - 0.05, y, pz - 0.03, pz + 0.03))
  }
}

/** Stacked plates (`size` is the stack envelope over the dunnage: X × total plate height × Z) on three steel bearers. */
function plateStack(fx: FixtureOf<'plateStack'>, place: Place, seed: number) {
  const [sx, sy, sz] = fx.size
  const n = Math.max(1, Math.round(fx.plates))
  const rand = createRandom(seed)
  const dunnage = 0.16
  for (const f of [-0.38, 0, 0.38]) place('fixtures:steel', ext(f * sx - 0.11, f * sx + 0.11, SLAB, SLAB + dunnage, -(sz / 2 + 0.15), sz / 2 + 0.15))
  const t = sy / n
  for (let i = 0; i < n; i++) {
    const trim = rand() * 0.08
    place('fixtures:plate', {
      p: [(rand() - 0.5) * 0.12, SLAB + dunnage + (i + 0.5) * t, (rand() - 0.5) * 0.1],
      s: [sx - trim, t * 0.97, sz - trim * 0.6],
      q: quatEuler(0, (rand() - 0.5) * 0.02, 0),
    })
  }
}

/** Rack of `count` dished heads standing on edge (axis along local X) between guarded separator frames. */
function headRack(fx: FixtureOf<'headRack'>, place: Place) {
  const D = Math.max(0.5, fx.headDiameter)
  const R = D / 2
  const n = Math.max(1, Math.round(fx.count))
  const depth = (HEAD_DEPTH + HEAD_SKIRT) * D
  const pitch = depth + 0.55
  const L = n * pitch + 0.3
  const x0 = -L / 2
  const baseTop = SLAB + 0.4
  const postZ = R + 0.15
  const postTop = baseTop + 1.25 * R
  for (const sz of SIDES) place('fixtures:steel', ext(x0, -x0, SLAB, SLAB + 0.2, sz * 0.55 * R - 0.12, sz * 0.55 * R + 0.12))
  for (let i = 0; i <= n; i++) {
    const xb = x0 + 0.15 + i * pitch
    place('fixtures:steel', ext(xb - 0.1, xb + 0.1, SLAB + 0.2, baseTop, -(postZ + 0.1), postZ + 0.1))
    for (const sz of SIDES) place('fixtures:steel', ext(xb - 0.08, xb + 0.08, baseTop, postTop, sz * postZ - 0.08, sz * postZ + 0.08))
  }
  for (const sz of SIDES) {
    place('fixtures:guards', ext(x0 + 0.07, -x0 - 0.07, postTop - 0.08, postTop, sz * postZ - 0.05, sz * postZ + 0.05))
    place('fixtures:steel', ext(x0 + 0.07, -x0 - 0.07, baseTop + 0.6 * R - 0.04, baseTop + 0.6 * R + 0.04, sz * postZ - 0.04, sz * postZ + 0.04))
  }
  const chock = R * (1 - Math.sqrt(1 - 0.42 * 0.42))
  for (let i = 0; i < n; i++) {
    const rim = x0 + 0.15 + i * pitch + (pitch - depth) / 2
    place('fixtures:steel', ext(rim - 0.05, rim + depth * 0.85, SLAB + 0.2, baseTop, -0.6 * R, 0.6 * R))
    for (const sz of SIDES) place('fixtures:steel', ext(rim, rim + 0.3, baseTop, baseTop + chock, sz * 0.42 * R - 0.12, sz * 0.42 * R + 0.12))
    place('fixtures:heads', { p: [rim, baseTop + R + 0.01, 0], s: [D, D, D], q: ALONG_X })
  }
}

/** Three-roll plate bending machine: rolls of face `width` along local X between two housings, drive at +X, console at +Z. */
function plateRoller(fx: FixtureOf<'plateRoller'>, place: Place) {
  const W = Math.max(1, fx.width)
  const hx = W / 2 + 0.45
  const floor = SLAB + 0.25
  place('fixtures:steel', ext(-(hx + 0.6), hx + 2.45, SLAB, floor, -1.2, 1.2))
  for (const sx of SIDES) {
    place('fixtures:steel', ext(sx * hx - 0.4, sx * hx + 0.4, floor, floor + 2.1, -0.95, 0.95))
    place('fixtures:steel', ext(sx * hx - 0.45, sx * hx + 0.45, floor + 2.1, floor + 2.2, -0.5, 0.5))
    place('fixtures:round', cyl([sx * hx, floor + 2.5, 0], 0.36, 0.6, 'y'))
  }
  const yb = floor + 0.8
  for (const sz of SIDES) place('fixtures:bright', cyl([0, yb, sz * 0.42], 0.42, W + 0.9, 'x'))
  place('fixtures:bright', cyl([0, yb + 0.55, 0], 0.56, W + 0.9, 'x'))
  // Drive: gearbox, guarded coupling, motor on a foot.
  place('fixtures:steel', ext(hx + 0.45, hx + 1.25, floor, floor + 1.2, -0.55, 0.55))
  place('fixtures:guards', ext(hx + 1.25, hx + 1.45, floor + 0.15, floor + 0.75, -0.25, 0.25))
  place('fixtures:steel', ext(hx + 1.5, hx + 2.35, floor, floor + 0.18, -0.32, 0.32))
  place('fixtures:round', cyl([hx + 1.92, floor + 0.45, 0], 0.55, 0.9, 'x'))
  // Operator console on the +Z side, and a guard trip bar along the rolls.
  place('fixtures:steel', ext(-W / 2 + 0.2, -W / 2 + 0.5, SLAB, SLAB + 1.0, 1.7, 1.95))
  place('fixtures:steel', ext(-W / 2 + 0.05, -W / 2 + 0.65, SLAB + 1.0, SLAB + 1.3, 1.6, 2.0))
  place('fixtures:guards', ext(-W / 2, W / 2, SLAB + 0.9, SLAB + 0.95, 1.25, 1.3))
  for (const sx of SIDES) place('fixtures:guards', ext(sx * (W / 2) - 0.025, sx * (W / 2) + 0.025, SLAB, SLAB + 0.9, 1.25, 1.3))
}

function buildFixtures(cfg: GeminiFactoryConfig, add: Add) {
  cfg.fixtures.forEach((fx, index) => {
    const place = fixturePlacer(fx, add)
    switch (fx.kind) {
      case 'turningRolls':
        turningRolls(fx, place)
        break
      case 'weldingManipulator':
        weldingManipulator(fx, place)
        break
      case 'plateStack':
        plateStack(fx, place, 9173 + index * 7919)
        break
      case 'headRack':
        headRack(fx, place)
        break
      case 'plateRoller':
        plateRoller(fx, place)
        break
    }
  })
}

/* -------------------------------------------------------------------------- */
/* Forecourt                                                                  */
/* -------------------------------------------------------------------------- */

/** Yard apron, boundary wall with the gate (posts, palisade leaves parked open), guard booth and the driveway. */
function buildForecourt(cfg: GeminiFactoryConfig, add: Add) {
  const fc = cfg.forecourt
  const { wallZ, wallHeight } = fc
  const gate = { x0: Math.min(fc.gate.x0, fc.gate.x1), x1: Math.max(fc.gate.x0, fc.gate.x1), postHeight: fc.gate.postHeight }
  const dw = fc.driveway

  // Ground layers: thin slabs whose TOP faces sit exactly on the shared ground-layer heights.
  if (wallZ > 0) add('forecourt:paving', ext(fc.x0, fc.x1, 0, LIFT.apron, 0, wallZ))
  if (dw.toZ > wallZ) add('forecourt:paving', ext(dw.x0, dw.x1, LIFT.exitRoad - 0.002, LIFT.exitRoad, wallZ - 0.2, dw.toZ))

  // Boundary wall with coping and piers, broken by the gate opening.
  const copingY = wallHeight - COPING_H
  for (const [a, b] of spansAround(fc.x0, fc.x1, [[gate.x0, gate.x1]])) {
    add('forecourt:walls', ext(a, b, 0, copingY, wallZ - BOUNDARY_T / 2, wallZ + BOUNDARY_T / 2))
    add('forecourt:copings', ext(a, b, copingY, wallHeight, wallZ - BOUNDARY_T / 2 - 0.06, wallZ + BOUNDARY_T / 2 + 0.06))
    const steps = Math.max(1, Math.round((b - a) / PIER_PITCH))
    for (let i = 0; i <= steps; i++) {
      const x = clamp(a + (i * (b - a)) / steps, a + PIER / 2, b - PIER / 2)
      if (Math.abs(x - gate.x0) < GATE_POST + 0.6 || Math.abs(x - gate.x1) < GATE_POST + 0.6) continue
      add('forecourt:walls', ext(x - PIER / 2, x + PIER / 2, 0, wallHeight + 0.06, wallZ - PIER / 2, wallZ + PIER / 2))
      add('forecourt:copings', ext(x - PIER / 2 - 0.05, x + PIER / 2 + 0.05, wallHeight + 0.06, wallHeight + 0.14, wallZ - PIER / 2 - 0.05, wallZ + PIER / 2 + 0.05))
    }
  }

  // Gate pillars just outside the opening, capped, with a yellow band.
  const gp = GATE_POST / 2
  for (const x of [gate.x0 - gp, gate.x1 + gp]) {
    add('forecourt:walls', ext(x - gp, x + gp, 0, gate.postHeight, wallZ - gp, wallZ + gp))
    add('forecourt:copings', ext(x - gp - 0.06, x + gp + 0.06, gate.postHeight, gate.postHeight + 0.12, wallZ - gp - 0.06, wallZ + gp + 0.06))
    add('forecourt:accent', ext(x - gp - 0.01, x + gp + 0.01, 0.6, 0.9, wallZ - gp - 0.01, wallZ + gp + 0.01))
  }

  // Telescopic palisade leaves, parked open inside the wall beside the opening (never over it).
  const halfW = (gate.x1 - gate.x0) / 2
  const n = Math.max(1, Math.ceil(halfW / GATE_LEAF_MAX))
  const w = halfW / n + GATE_OVERLAP
  const leafTop = Math.max(wallHeight + 0.2, gate.postHeight - 0.45)
  const zBack = wallZ - gp - 0.12
  if (halfW > 0.2) {
    for (const side of SIDES) {
      const edge = side < 0 ? gate.x0 : gate.x1
      for (let k = 0; k < n; k++) {
        const zc = zBack - k * GATE_LEAF_PITCH - 0.06
        const offset = (n - 1 - k) * 0.25
        const xa = side < 0 ? edge - w - offset : edge + offset
        const xb = xa + w
        add('forecourt:gates', ext(xa, xb, 0.1, 0.24, zc - 0.06, zc + 0.06))
        add('forecourt:gates', ext(xa, xb, 1.15, 1.23, zc - 0.04, zc + 0.04))
        add('forecourt:gates', ext(xa, xb, leafTop - 0.42, leafTop - 0.34, zc - 0.04, zc + 0.04))
        for (const x of [xa, xb - 0.1]) add('forecourt:gates', ext(x, x + 0.1, 0.1, leafTop - 0.3, zc - 0.06, zc + 0.06))
        for (const f of [0.25, 0.75]) add('forecourt:gates', ext(xa + f * w - 0.16, xa + f * w + 0.16, 0, 0.1, zc - 0.09, zc + 0.09))
        for (let x = xa + 0.2; x < xb - 0.15; x += PALE_PITCH) {
          add('forecourt:gates', ext(x - 0.03, x + 0.03, 0.24, leafTop - 0.06, zc - 0.015, zc + 0.015))
          add('forecourt:gates', { p: [x, leafTop - 0.06, zc], s: [0.07, 0.07, 0.03], q: DIAMOND })
        }
      }
    }
  }

  // Guard booth beside the gate on the +X side, behind the parked leaves.
  const bx0 = gate.x1 + GATE_POST + 0.6
  const bx1 = bx0 + 3.2
  const bz1 = zBack - n * GATE_LEAF_PITCH - 0.5
  const bz0 = bz1 - 2.6
  if (bz0 > 0.5 && bx1 < fc.x1 - 0.5) {
    add('forecourt:walls', ext(bx0, bx1, 0, 2.7, bz0, bz1))
    add('forecourt:copings', ext(bx0 - 0.35, bx1 + 0.35, 2.7, 2.9, bz0 - 0.35, bz1 + 0.35))
    add('forecourt:glazing', ext(bx0 + 0.3, bx1 - 0.3, 1.05, 2.15, bz1, bz1 + 0.04))
    add('forecourt:glazing', ext(bx0 - 0.04, bx0, 1.05, 2.15, bz0 + 0.3, bz1 - 0.3))
    add('forecourt:glazing', ext(bx0 + 0.6, bx1 - 0.6, 1.05, 2.15, bz0 - 0.04, bz0))
    add('forecourt:gates', ext(bx1, bx1 + 0.04, 0, 2.15, bz0 + 0.5, bz0 + 1.45))
    for (const z of [bz1 - 0.3, bz0 + 0.3]) add('forecourt:accent', ext(bx0 - 0.69, bx0 - 0.41, 0, 1.0, z - 0.14, z + 0.14))
  }
}

/** Lays out every part of the factory from the config. Pure and deterministic; factory-local. */
function buildFactory(cfg: GeminiFactoryConfig): Layout {
  const layout = Object.fromEntries(MESH_IDS.map((id) => [id, [] as Part[]])) as Layout
  const add: Add = (id, part) => {
    layout[id].push(part)
  }
  const d = deriveDims(cfg)
  if (d.lines.length >= 2 && cfg.length > 1) {
    buildFrame(d, add)
    buildRunways(d, cfg, add)
    buildRoof(d, cfg, add)
    buildWalls(d, cfg, add)
    buildFloor(d, cfg, add)
    buildFixtures(cfg, add)
  }
  buildForecourt(cfg, add)
  return layout
}

/* -------------------------------------------------------------------------- */
/* Geometries and materials                                                   */
/* -------------------------------------------------------------------------- */

/** Ø1 m dished head shell: straight flange from the open rim (y = 0), then a 2:1 semi-ellipsoidal dish to the apex (+Y). */
function createHeadGeometry(): LatheGeometry {
  const r = 0.5
  const steps = 14
  const points: Vector2[] = [new Vector2(r, 0), new Vector2(r, HEAD_SKIRT)]
  for (let i = 1; i <= steps; i++) {
    const a = (i / steps) * (Math.PI / 2)
    points.push(new Vector2(r * Math.cos(a), HEAD_SKIRT + HEAD_DEPTH * Math.sin(a)))
  }
  for (let i = steps; i >= 0; i--) {
    const a = (i / steps) * (Math.PI / 2)
    points.push(new Vector2((r - HEAD_WALL) * Math.cos(a), HEAD_SKIRT + (HEAD_DEPTH - HEAD_WALL) * Math.sin(a)))
  }
  points.push(new Vector2(r - HEAD_WALL, 0), new Vector2(r, 0))
  return new LatheGeometry(points, 40)
}

function createMaterials(cfg: GeminiFactoryConfig): Record<MaterialKey, MeshStandardMaterial> {
  const c = cfg.colors
  const make = (color: string | Color, roughness: number, metalness: number, extra: MeshStandardMaterialParameters = {}) =>
    new MeshStandardMaterial({ color, roughness, metalness, ...extra })
  const glow = (color: string | Color, intensity: number): MeshStandardMaterialParameters => ({ emissive: new Color(color), emissiveIntensity: intensity })
  const white = new Color('#ffffff')
  const dark = new Color(DARK_STEEL)
  const skylight = new Color(c.glazing).lerp(white, 0.35)
  return {
    column: make(c.column, 0.5, 0.55),
    truss: make(c.truss, 0.55, 0.5),
    runway: make(c.runway, 0.5, 0.55),
    cladding: make(c.cladding, 0.68, 0.3),
    rib: make(c.claddingRib, 0.62, 0.35),
    glazing: make(c.glazing, 0.18, 0.5, glow(c.glazing, 0.25)),
    roof: make(c.roof, 0.8, 0.2),
    skylight: make(skylight, 0.3, 0.2, glow(skylight, 0.45)),
    door: make(c.door, 0.6, 0.4),
    accent: make(c.accent, 0.55, 0.1),
    dark: make(dark, 0.75, 0.2),
    wall: make(c.wall, 0.92, 0.02),
    slab: make(cfg.floor.color, 0.86, 0.02),
    marking: make(cfg.floor.markingColor, 0.7, 0.02),
    luminaire: make(cfg.luminaires.color, 0.35, 0.1, glow(cfg.luminaires.color, cfg.luminaires.intensity)),
    fixture: make(c.fixture, 0.5, 0.5),
    fixtureAccent: make(c.fixtureAccent, 0.55, 0.1),
    plate: make(new Color(c.fixture).lerp(dark, 0.35), 0.65, 0.6),
    bright: make(new Color(c.truss).lerp(white, 0.25), 0.28, 0.85),
    paving: make(cfg.forecourt.color, 0.92, 0.03),
  }
}

/* -------------------------------------------------------------------------- */
/* Components                                                                 */
/* -------------------------------------------------------------------------- */

function InstancedParts({
  name,
  parts,
  geometry,
  material,
  castShadow,
  receiveShadow,
}: {
  name: string
  parts: readonly Part[]
  geometry: BufferGeometry
  material: MeshStandardMaterial
  castShadow: boolean
  receiveShadow: boolean
}) {
  const ref = useRef<InstancedMesh>(null)
  const invalidate = useThree((state) => state.invalidate)

  // Static instances, written once per layout outside the frame loop, so the demand frameloop is invalidated.
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    parts.forEach(({ p, s, q }, index) => {
      _position.set(p[0], p[1], p[2])
      _scale.set(s[0], s[1], s[2])
      if (q) _quat.set(q[0], q[1], q[2], q[3])
      else _quat.identity()
      _matrix.compose(_position, _quat, _scale)
      mesh.setMatrixAt(index, _matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingBox()
    mesh.computeBoundingSphere()
    invalidate()
  }, [parts, geometry, material, invalidate])

  if (parts.length === 0) return null
  return (
    // Keyed on the instance count so a different layout remounts the mesh instead of resizing it.
    <instancedMesh
      key={parts.length}
      ref={ref}
      name={name}
      args={[geometry, material, parts.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    />
  )
}

export function GeminiFactory({ config }: GeminiFactoryProps) {
  const geometries = useMemo<Record<Shape, BufferGeometry>>(
    () => ({ box: new BoxGeometry(1, 1, 1), cylinder: new CylinderGeometry(0.5, 0.5, 1, 24, 1), head: createHeadGeometry() }),
    [],
  )
  const materials = useMemo(() => createMaterials(config), [config])
  const layout = useMemo(() => buildFactory(config), [config])

  useEffect(
    () => () => {
      for (const geometry of Object.values(geometries)) geometry.dispose()
    },
    [geometries],
  )
  useEffect(
    () => () => {
      for (const material of Object.values(materials)) material.dispose()
    },
    [materials],
  )

  return (
    <group name="factory">
      {GROUPS.map((group) => (
        <group key={group} name={`factory:${group}`}>
          {MESH_IDS.filter((id) => MESHES[id].group === group).map((id) => {
            const spec: MeshSpec = MESHES[id]
            return (
              <InstancedParts
                key={id}
                name={`factory:${id}`}
                parts={layout[id]}
                geometry={geometries[spec.shape]}
                material={materials[spec.material]}
                castShadow={spec.castShadow}
                receiveShadow={!NO_RECEIVE.has(spec.material)}
              />
            )
          })}
        </group>
      ))}
    </group>
  )
}
