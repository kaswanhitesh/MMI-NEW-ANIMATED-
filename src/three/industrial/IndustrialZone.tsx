/**
 * IndustrialZone: TEMPORARY procedural stand-in for the industrial area along
 * the FAR side of the highway in Scene 01 (between the city and the Gemini Engi
 * Fab factory compound). A detailed GLB can replace it through its environment
 * slot without touching the scroll timeline: the scene only hands it `config`.
 *
 * LOCAL FRAME (see IndustrialZoneConfig in ./types): origin at floor level on
 * the highway's far verge line; local X along the road; local −Z away from the
 * road; Y up; metres. The verge strip (0 ≥ z ≥ −setback) stays clear except for
 * the access roads.
 *
 * A seeded walk along X (mulberry32, as in CityBackdrop.tsx) within `span`,
 * skipping each `exclude` range plus the minimum gap, places walled compounds
 * (`compound.width` / `depth` / `gap`). Each compound draws from its own seeded
 * stream, so changing what one compound contains never moves the others. Each has:
 *  - boundary walls on all four sides (precast panels between pilasters, under
 *    a concrete coping), the front wall's road face at z = −setback, with ONE
 *    heavy-vehicle gate opening (8–14 m) between two capped concrete piers; the
 *    palisade sliding leaf is parked open behind the wall on its ground track,
 *    with two safety-yellow bollards and a yellow stop line just inside;
 *  - a paved access road `accessRoadWidth` wide from the gate across the verge
 *    line (z = 0) and on by `roadReach` to the carriageway (plus a 5 cm tuck so
 *    the joint never cracks) at LIFT.exitRoad, continuing 4.5 m into the
 *    compound as wide as the gate; the whole walled area is a paved yard at
 *    LIFT.apron. `industrialZoneRoadMouths()` returns where these roads meet
 *    the road, so the highway can break its edge line and keep street lights
 *    out of them;
 *  - behind an open truck yard (14–22 m deep): a portal-frame shed (clad box,
 *    low-pitched gable roof of two sloped boxes over a gable prism, ridge along
 *    its longer side, gutters, ridge cap, frame lines, high-level glazing band,
 *    roller-shutter doors facing the road), usually a small office block with
 *    window bands, and beside them either a bunded group of 2–4 vertical storage
 *    tanks (`tankChance`: shallow domed tops, ring stiffeners, ladder, guard
 *    rail, header pipe), or a tall slender stack (`stackChance`: platform with a
 *    yellow handrail, ladder, breeching duct to the shed), and/or a second shed;
 *    sometimes a pipe rack (portal frames, pipes along X) spans the gap between
 *    the main shed and its neighbour. Building heights stay within
 *    `buildings.height`; only the stack rises above (2–2.7 × the maximum).
 *
 * Props: `config` only. The layout, the shared geometries and the materials are
 * memoised (layout on `config`, materials on `config.colors`) and disposed on
 * change and unmount. Opaque and static: matrices are written once in a layout
 * effect, which invalidates the demand frameloop; nothing runs per frame.
 *
 * Draw calls: 17 InstancedMeshes at most (roads 2, walls 4, buildings 11), one
 * per material per group, over five shared unit geometries (box, gable prism,
 * flat plane, cylinder, dome). Per-instance tones give each compound and part a
 * subtle variation. Nothing casts shadows (the key light's shadow frustum
 * follows the vehicles, so static building shadows would pop at its edge); the
 * ground layers (roads, yards) receive shadows like the highway does.
 */
import { useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  Matrix4,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  Vector3,
  type InstancedMesh,
} from 'three'
import type { Vec3 } from '../assets/types'
import { LIFT } from '../environment/roadSurface'
import type { IndustrialZoneConfig } from './types'

export interface IndustrialZoneProps {
  config: IndustrialZoneConfig
}

type Range = readonly [number, number]

/** One instance of a unit geometry. */
interface Instance {
  position: Vec3
  /** Scale of the unit geometry: a box's size; a cylinder's (radius, height, radius); a plane's (width, 1, depth). */
  scale: Vec3
  /** Euler XYZ rotation in radians (optional). */
  rotation?: Vec3
  /** Brightness multiplier written as the instance colour. */
  tone: number
}

type GeometryKey = 'box' | 'prism' | 'plane' | 'cylinder' | 'dome'
type MaterialKey = keyof IndustrialZoneConfig['colors'] | 'concrete' | 'paving' | 'steel' | 'glazing'
type GroupKey = 'roads' | 'walls' | 'buildings'

/** Every InstancedMesh of the zone: its subgroup, mesh name, unit geometry and material. */
const PARTS = {
  yards: { group: 'roads', name: 'yards', geometry: 'plane', material: 'paving' },
  roads: { group: 'roads', name: 'access-roads', geometry: 'plane', material: 'road' },
  wallPanels: { group: 'walls', name: 'panels', geometry: 'box', material: 'wall' },
  wallCoping: { group: 'walls', name: 'coping-piers', geometry: 'box', material: 'concrete' },
  gates: { group: 'walls', name: 'gate-leaves', geometry: 'box', material: 'steel' },
  gateAccents: { group: 'walls', name: 'bollards-markings', geometry: 'box', material: 'accent' },
  cladding: { group: 'buildings', name: 'cladding', geometry: 'box', material: 'shed' },
  gables: { group: 'buildings', name: 'gables', geometry: 'prism', material: 'shed' },
  roofs: { group: 'buildings', name: 'roofs-doors', geometry: 'box', material: 'roof' },
  structure: { group: 'buildings', name: 'steelwork', geometry: 'box', material: 'steel' },
  glazing: { group: 'buildings', name: 'glazing', geometry: 'box', material: 'glazing' },
  handrails: { group: 'buildings', name: 'handrails-bollards', geometry: 'box', material: 'accent' },
  concrete: { group: 'buildings', name: 'concrete', geometry: 'box', material: 'concrete' },
  tanks: { group: 'buildings', name: 'tanks', geometry: 'cylinder', material: 'tank' },
  tankDomes: { group: 'buildings', name: 'tank-domes', geometry: 'dome', material: 'tank' },
  stacks: { group: 'buildings', name: 'stacks-pipes', geometry: 'cylinder', material: 'stack' },
  foundations: { group: 'buildings', name: 'tank-foundations', geometry: 'cylinder', material: 'concrete' },
} as const satisfies Record<string, { group: GroupKey; name: string; geometry: GeometryKey; material: MaterialKey }>

type PartKey = keyof typeof PARTS
const PART_KEYS = Object.keys(PARTS) as PartKey[]
const GROUP_KEYS: readonly GroupKey[] = ['roads', 'walls', 'buildings']

const DEG = Math.PI / 180

/** Boundary wall proportions (m). */
const WALL = { panel: 0.2, coping: 0.4, copingHeight: 0.1, post: 0.36, postDepth: 0.32, postPitch: 3.6, clearance: 0.01 } as const
/** Heavy-vehicle gate proportions (m). */
const GATE = {
  width: [8, 14],
  pier: 0.7,
  pierRise: 0.7,
  capOverhang: 0.08,
  leafOverlap: 0.6,
  leafSetback: 0.4,
  leafHeight: 2.5,
  paleSpacing: 0.18,
  innerRoad: 4.5,
} as const
/** How far the access road tucks past the carriageway edge (m). */
const ROAD_TUCK = 0.05
/** Open truck yard between the front wall and the buildings (m). */
const FRONT_YARD: Range = [14, 22]
/** Clearance between buildings and the boundary walls (m). */
const MARGIN = 4
/** Gap between the main shed and its neighbour (m). */
const BUILDING_GAP: Range = [7, 12]
const ROOF_PITCH: Range = [5 * DEG, 9 * DEG]
const PORTAL_PITCH = 6.5
const STOREY = 3.6
const PARAPET = 0.9
const GLAZING_COLOR = '#3b4652'
const CONCRETE_LIGHT = '#b5b6b2'

/* Scratch objects reused while writing instance matrices. */
const _matrix = new Matrix4()
const _position = new Vector3()
const _scale = new Vector3()
const _quat = new Quaternion()
const _euler = new Euler()
const _tone = new Color()

/** Small deterministic PRNG (mulberry32). */
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

const range = (rand: () => number, [a, b]: Range) => a + (b - a) * rand()
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Evenly spaced stations from `from` to `to`, about `pitch` apart, with or without the two ends. */
function stations(from: number, to: number, pitch: number, withFrom: boolean, withTo: boolean): number[] {
  const len = to - from
  if (!(len > 0)) return withFrom ? [from] : []
  const n = Math.max(1, Math.round(len / pitch))
  const out: number[] = []
  for (let i = withFrom ? 0 : 1; i <= (withTo ? n : n - 1); i++) out.push(from + (len * i) / n)
  return out
}

/** X ranges of the compounds: a seeded walk along `span` that never enters an `exclude` range (padded by the minimum gap). */
function layoutCompounds(cfg: IndustrialZoneConfig): Array<readonly [number, number]> {
  const rand = createRandom(cfg.seed)
  const { width, gap } = cfg.compound
  const minW = Math.min(width[0], width[1])
  const clear = Math.max(0, Math.min(gap[0], gap[1]))
  const s0 = Math.min(cfg.span[0], cfg.span[1])
  const s1 = Math.max(cfg.span[0], cfg.span[1])
  const exclude = cfg.exclude.map(([a, b]) => [Math.min(a, b) - clear, Math.max(a, b) + clear] as const)
  const out: Array<readonly [number, number]> = []
  if (!(minW > 1)) return out
  let x = s0
  for (let guard = 0; guard < 10000 && x + minW <= s1; guard++) {
    const blocked = exclude.find(([a, b]) => x >= a && x < b)
    if (blocked) {
      x = blocked[1]
      continue
    }
    const limit = exclude.reduce((m, [a]) => (a > x ? Math.min(m, a) : m), s1)
    let w = range(rand, width)
    if (x + w > limit) {
      if (limit - x < minW) {
        x = limit
        continue
      }
      w = limit - x
    }
    out.push([x, x + w])
    x += w + Math.max(0, range(rand, gap))
  }
  return out
}

/**
 * Local X ranges where the compounds' access roads meet the road (one per gate), e.g. to break the highway's edge line
 * and keep street lights out of the junctions. Pure and deterministic (the same layout the component draws).
 */
export function industrialZoneRoadMouths(cfg: IndustrialZoneConfig): Array<[number, number]> {
  const mouths: Array<[number, number]> = []
  buildIndustrialZone(cfg, mouths)
  return mouths
}

/** Lays out every instance of the zone from the config (and, if given, collects the access-road mouths). Pure and deterministic; local frame. */
function buildIndustrialZone(cfg: IndustrialZoneConfig, mouths?: Array<[number, number]>): Record<PartKey, Instance[]> {
  const parts = Object.fromEntries(PART_KEYS.map((k) => [k, [] as Instance[]])) as Record<PartKey, Instance[]>
  let rand = createRandom(cfg.seed)

  const add = (key: PartKey, position: Vec3, scale: Vec3, tone: number, rotation?: Vec3) => {
    if (!(scale[0] > 0 && scale[1] > 0 && scale[2] > 0)) return
    parts[key].push(rotation ? { position, scale, rotation, tone } : { position, scale, tone })
  }
  /** Box of size (sx, sy, sz) with its BOTTOM at y, centred on (x, z). */
  const block = (key: PartKey, x: number, y: number, z: number, sx: number, sy: number, sz: number, tone = 1, rotation?: Vec3) =>
    add(key, [x, y + sy / 2, z], [sx, sy, sz], tone, rotation)
  /** Flat ground layer covering [xa, xb] × [za, zb] at height y. */
  const flat = (key: PartKey, xa: number, xb: number, za: number, zb: number, y: number, tone = 1) =>
    add(key, [(xa + xb) / 2, y, (za + zb) / 2], [Math.abs(xb - xa), 1, Math.abs(zb - za)], tone)
  /** Vertical cylinder with its BOTTOM at y. */
  const column = (key: PartKey, x: number, y: number, z: number, radius: number, height: number, tone = 1) =>
    add(key, [x, y + height / 2, z], [radius, height, radius], tone)
  /** Horizontal pipe along X from xa to xb, its axis at (y, z). */
  const pipeX = (xa: number, xb: number, y: number, z: number, radius: number, tone = 1) =>
    add('stacks', [(xa + xb) / 2, y, z], [radius, Math.abs(xb - xa), radius], tone, [0, 0, Math.PI / 2])
  /** Horizontal pipe along Z from za to zb, its axis at (x, y). */
  const pipeZ = (x: number, y: number, za: number, zb: number, radius: number, tone = 1) =>
    add('stacks', [x, y, (za + zb) / 2], [radius, Math.abs(zb - za), radius], tone, [Math.PI / 2, 0, 0])

  const { wallHeight: H, setback } = cfg.compound
  const hRange = cfg.buildings.height
  const hMin = Math.min(hRange[0], hRange[1])
  const hMax = Math.max(hRange[0], hRange[1])

  /** Straight wall run along X at z: panels over [a, b], coping over [ca, cb], pilasters at `posts`. */
  const wallX = (z: number, a: number, b: number, ca: number, cb: number, posts: readonly number[], tone: number) => {
    block('wallPanels', (a + b) / 2, 0, z, b - a, H, WALL.panel, tone)
    block('wallCoping', (ca + cb) / 2, H, z, cb - ca, WALL.copingHeight, WALL.coping, tone)
    for (const x of posts) block('wallPanels', x, 0, z, WALL.post, H, WALL.postDepth, tone * 0.94)
  }
  /** Straight wall run along Z at x (a < b are z values). */
  const wallZ = (x: number, a: number, b: number, ca: number, cb: number, posts: readonly number[], tone: number) => {
    block('wallPanels', x, 0, (a + b) / 2, WALL.panel, H, b - a, tone)
    block('wallCoping', x, H, (ca + cb) / 2, WALL.coping, WALL.copingHeight, cb - ca, tone)
    for (const z of posts) block('wallPanels', x, 0, z, WALL.postDepth, H, WALL.post, tone * 0.94)
  }

  /** Palisade sliding leaf over [xa, xb] at z, height h: rails, end stiles and spiked pales. */
  const gateLeaf = (xa: number, xb: number, z: number, h: number) => {
    const len = xb - xa
    const mid = (xa + xb) / 2
    const bottom = 0.12
    block('gates', mid, bottom, z, len, 0.16, 0.12)
    block('gates', mid, bottom + h * 0.42, z, len, 0.08, 0.08)
    block('gates', mid, h - 0.25, z, len, 0.1, 0.08)
    for (const x of [xa + 0.06, xb - 0.06]) block('gates', x, bottom, z, 0.12, h - bottom, 0.12)
    const n = Math.max(2, Math.round(len / GATE.paleSpacing))
    for (let i = 1; i < n; i++) block('gates', xa + (len * i) / n, bottom + 0.16, z, 0.04, h - bottom - 0.04, 0.04)
  }

  /** Portal-frame shed centred on (cx, cz), footprint sw × sd, ridge height h, doors facing the road. Returns its eaves height. */
  const shed = (cx: number, cz: number, sw: number, sd: number, h: number, tone: number): number => {
    const alongZ = sd >= sw // the ridge runs along the longer side
    const span = alongZ ? sw : sd
    const length = alongZ ? sd : sw
    const pitch = range(rand, ROOF_PITCH)
    const rise = (span / 2) * Math.tan(pitch)
    const eaves = Math.max(4.5, h - rise)
    const ov = 0.45
    const t = 0.22
    const front = cz + sd / 2

    block('concrete', cx, 0, cz, sw + 0.08, 1.0, sd + 0.08)
    block('cladding', cx, 0, cz, sw, eaves, sd, tone)
    add('gables', [cx, eaves, cz], [span, rise, length], tone, alongZ ? undefined : [0, Math.PI / 2, 0])

    // Two sloped roof boxes whose undersides lie on the gable slopes, overhanging eaves and gables; gutters; ridge cap.
    const half = span / 2 + ov
    const slope = half / Math.cos(pitch)
    const yMid = eaves + rise - (half / 2) * Math.tan(pitch) + (Math.cos(pitch) * t) / 2
    const roofLen = length + 2 * ov
    const gutterY = eaves - ov * Math.tan(pitch) - 0.28
    for (const s of [-1, 1] as const) {
      const off = s * (half / 2 + (Math.sin(pitch) * t) / 2)
      if (alongZ) {
        add('roofs', [cx + off, yMid, cz], [slope, t, roofLen], tone, [0, 0, -s * pitch])
        block('roofs', cx + s * half, gutterY, cz, 0.22, 0.28, roofLen, tone * 0.82)
      } else {
        add('roofs', [cx, yMid, cz + off], [roofLen, t, slope], tone, [s * pitch, 0, 0])
        block('roofs', cx, gutterY, cz + s * half, roofLen, 0.28, 0.22, tone * 0.82)
      }
    }
    if (alongZ) block('roofs', cx, eaves + rise + 0.04, cz, 0.7, 0.26, roofLen, tone * 0.9)
    else block('roofs', cx, eaves + rise + 0.04, cz, roofLen, 0.26, 0.7, tone * 0.9)

    // Portal frames expressed on the long walls (never across the road face) and a high-level glazing band.
    const bandY = eaves - 1.35
    if (alongZ) {
      for (const s of [-1, 1] as const) {
        block('glazing', cx + s * (sw / 2 + 0.025), bandY, cz, 0.05, 0.9, sd - 1.2, 1.15)
        for (const z of stations(cz - sd / 2 + 0.3, front - 0.3, PORTAL_PITCH, true, true)) {
          block('roofs', cx + s * (sw / 2 + 0.04), 1.0, z, 0.08, eaves - 1.0, 0.24, tone * 0.9)
        }
      }
    } else {
      block('glazing', cx, bandY, front + 0.025, sw - 1.2, 0.9, 0.05, 1.15)
      block('glazing', cx, bandY, cz - sd / 2 - 0.025, sw - 1.2, 0.9, 0.05, 1.15)
      for (const x of stations(cx - sw / 2 + 0.3, cx + sw / 2 - 0.3, PORTAL_PITCH, true, true)) {
        block('roofs', x, 1.0, cz - sd / 2 - 0.04, 0.24, eaves - 1.0, 0.08, tone * 0.9)
      }
    }

    // Roller-shutter doors on the road face: dark curtain, steel hood and guides, a yellow bollard each side.
    const doors = sw > 42 ? 2 : 1
    const dw = clamp(sw * 0.2, 5, 8)
    const dh = clamp(eaves - 2.4, 4, 7)
    for (let i = 0; i < doors; i++) {
      const dx = cx + (doors === 1 ? 0 : (i === 0 ? -1 : 1) * sw * 0.24)
      block('roofs', dx, 0, front + 0.06, dw, dh, 0.12, tone * 0.62)
      block('structure', dx, dh, front + 0.28, dw + 0.5, 0.65, 0.56)
      for (const s of [-1, 1] as const) {
        block('structure', dx + s * (dw / 2 + 0.11), 0, front + 0.11, 0.22, dh, 0.22)
        block('handrails', dx + s * (dw / 2 + 0.75), 0, front + 0.9, 0.22, 1.1, 0.22)
      }
    }
    return eaves
  }

  /** Office block centred on (cx, cz), ow × od, about h tall: concrete body, window band per storey, parapet, entrance canopy. */
  const office = (cx: number, cz: number, ow: number, od: number, h: number, entranceSide: number) => {
    const floors = Math.max(2, Math.floor((h - PARAPET) / STOREY))
    const top = floors * STOREY + PARAPET
    const front = cz + od / 2
    block('concrete', cx, 0, cz, ow, top, od, 1.12)
    for (let f = 0; f < floors; f++) {
      const y = f * STOREY + 0.95
      block('glazing', cx, y, front + 0.035, ow - 1.4, 1.45, 0.07)
      block('glazing', cx, y, cz - od / 2 - 0.035, ow - 1.4, 1.45, 0.07)
      for (const s of [-1, 1] as const) block('glazing', cx + s * (ow / 2 + 0.035), y, cz, 0.07, 1.45, od - 1.4)
    }
    block('roofs', cx, top, cz, ow + 0.16, 0.12, od + 0.16, 0.9)
    block('structure', cx + ow * 0.18, top + 0.12, cz - od * 0.12, Math.min(3.2, ow * 0.25), 1.5, Math.min(2.2, od * 0.3))
    const ex = cx + entranceSide * ow * 0.28
    block('glazing', ex, 0, front + 0.06, 2.4, 2.6, 0.12, 0.8)
    block('roofs', ex, 3.0, front + 1.1, 4.2, 0.22, 2.2, 0.9)
  }

  /** Vertical storage tank on (x, z): ring foundation, shell with ring stiffeners and top girder, shallow dome, ladder, guard rail. */
  const tank = (x: number, z: number, r: number, h: number, tone: number) => {
    const base = 0.35
    const top = base + h
    column('foundations', x, 0, z, r + 0.35, base)
    column('tanks', x, base, z, r, h, tone)
    const rings = Math.max(1, Math.round(h / 2.4))
    for (let i = 1; i < rings; i++) column('tanks', x, base + (i * h) / rings - 0.07, z, r + 0.05, 0.14, tone * 0.84)
    column('tanks', x, top - 0.24, z, r + 0.12, 0.22, tone * 0.84)
    add('tankDomes', [x, top, z], [r, r * 0.18, r], tone)
    block('structure', x, base, z + r + 0.22, 0.5, h + 1.0, 0.07)
    for (const s of [-1, 1] as const) block('handrails', x + s * 0.65, top, z + r - 0.05, 0.05, 1.05, 0.05)
    block('handrails', x, top + 1.0, z + r - 0.05, 1.35, 0.05, 0.05)
    block('handrails', x, top + 0.5, z + r - 0.05, 1.35, 0.05, 0.05)
  }

  /** Bunded group of 2–4 tanks at the back of [xa, xb] × [za, zb]. Returns its footprint, or null when nothing fits. */
  const tankGroup = (xa: number, xb: number, za: number, zb: number): { x0: number; x1: number; z1: number } | null => {
    const space = 2.6
    const want = 2 + Math.floor(rand() * 3)
    let diameter = range(rand, [5, 8.5])
    const height = clamp(range(rand, hRange) * 0.9, Math.min(6, hMax), hMax)
    let cols = Math.min(want, Math.floor((xb - xa) / (diameter + space)))
    if (cols < 1) {
      diameter = xb - xa - space
      cols = 1
    }
    if (diameter < 3.5) return null
    const pitch = diameter + space
    const rows = Math.min(Math.ceil(want / cols), Math.floor((zb - za) / pitch))
    if (rows < 1) return null
    const count = Math.min(want, rows * cols)
    const gw = cols * pitch
    const gd = rows * pitch
    const gx0 = (xa + xb) / 2 - gw / 2
    const r = diameter / 2
    const tone = 0.94 + rand() * 0.1

    // Bund wall around the group.
    const bt = 0.3
    const bh = 1.0
    block('concrete', gx0 + gw / 2, 0, za + bt / 2, gw, bh, bt)
    block('concrete', gx0 + gw / 2, 0, za + gd - bt / 2, gw, bh, bt)
    for (const x of [gx0 + bt / 2, gx0 + gw - bt / 2]) block('concrete', x, 0, za + gd / 2, bt, bh, gd - 2 * bt)

    for (let row = 0; row < rows; row++) {
      const inRow = Math.min(cols, count - row * cols)
      if (inRow <= 0) break
      const tz = za + (row + 0.5) * pitch
      for (let c = 0; c < inRow; c++) tank(gx0 + (c + 0.5) * pitch, tz, r, height, tone)
      // Header pipe along the row's road side, with a branch to each tank's bottom nozzle.
      const hz = tz + r + 0.75
      if (inRow > 1) pipeX(gx0 + 0.5 * pitch, gx0 + (inRow - 0.5) * pitch, 1.3, hz, 0.14, 0.9)
      for (let c = 0; c < inRow; c++) pipeZ(gx0 + (c + 0.5) * pitch + r * 0.45, 1.3, tz + r * 0.85, hz, 0.1, 0.9)
    }
    return { x0: gx0, x1: gx0 + gw, z1: za + gd }
  }

  /** Tall slender stack on (x, z): plinth, thickened base, ring hints, soot band, platform with handrail, ladder. */
  const stack = (x: number, z: number) => {
    const h = clamp(hMax * range(rand, [2, 2.7]), 24, 60)
    const r = range(rand, [0.8, 1.1])
    const base = 0.8
    block('concrete', x, 0, z, 2 * r + 1.8, base, 2 * r + 1.8)
    column('stacks', x, base, z, r * 1.22, 3.2, 0.94)
    column('stacks', x, base, z, r, h - base - 0.05, 1)
    column('stacks', x, h - 1.8, z, r + 0.04, 1.8, 0.55)
    for (const f of [0.3, 0.48, 0.84]) column('stacks', x, h * f, z, r + 0.05, 0.16, 0.82)
    const py = h * 0.66
    const R = r + 1.0
    column('stacks', x, py - 0.14, z, R + 0.05, 0.14, 0.78)
    const n = 12
    const chord = 2 * R * Math.sin(Math.PI / n) + 0.05
    const apothem = R * Math.cos(Math.PI / n)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      block('handrails', x + Math.cos(a) * R, py, z + Math.sin(a) * R, 0.05, 1.05, 0.05)
      const m = a + Math.PI / n
      const rot: Vec3 = [0, -m - Math.PI / 2, 0]
      const rx = x + Math.cos(m) * apothem
      const rz = z + Math.sin(m) * apothem
      block('handrails', rx, py + 1.0, rz, chord, 0.05, 0.05, 1, rot)
      block('handrails', rx, py + 0.5, rz, chord, 0.05, 0.05, 1, rot)
    }
    block('structure', x, base, z + r + 0.25, 0.45, h - base - 0.4, 0.06)
  }

  /** Pipe rack along X between a shed wall at xShed and a neighbour at xOther, centred on z; with drops at the tank end. */
  const pipeRack = (xShed: number, xOther: number, z: number, drop: boolean) => {
    const xa = Math.min(xShed, xOther)
    const xb = Math.max(xShed, xOther)
    const h = range(rand, [5, 6.5])
    const half = 2
    const beamTop = h + 0.32
    for (const x of stations(xa + 0.8, xb - 0.8, 6, true, true)) {
      for (const s of [-1, 1] as const) {
        block('concrete', x, 0, z + s * half, 0.6, 0.3, 0.6)
        block('structure', x, 0.3, z + s * half, 0.26, h - 0.3, 0.26)
      }
      block('structure', x, h, z, 0.3, 0.32, 2 * half + 0.4)
    }
    for (const s of [-1, 1] as const) block('structure', (xa + xb) / 2, h + 0.06, z + s * half, xb - xa, 0.2, 0.18)
    // Pipes on the beams; at the tank end they turn down outside the bund wall.
    const dropX = xOther + Math.sign(xShed - xOther) * 0.6
    const pipeEnd = drop ? dropX : xOther
    const radii = [0.3, 0.22, 0.16, 0.12].slice(0, rand() < 0.5 ? 3 : 4)
    let pz = z - half + 0.35
    for (const r of radii) {
      pz += r
      const tone = 0.8 + rand() * 0.35
      pipeX(xShed, pipeEnd, beamTop + r, pz, r, tone)
      if (drop) column('stacks', dropX, 1.2, pz, r, beamTop + r - 1.2, tone)
      pz += r + 0.28
    }
  }

  /** One walled compound over [x0, x1]. */
  const compound = (x0: number, x1: number) => {
    const w = x1 - x0
    const depth = Math.max(24, range(rand, cfg.compound.depth))
    const d = WALL.coping
    const zOuter = -setback - WALL.clearance // road face of the front wall's coping
    const zF = zOuter - d / 2 // front wall centre line
    const zInner = zOuter - d // yard face of the front wall
    const zB = -setback - depth + d / 2 // back wall centre line
    const xL = x0 + d / 2
    const xR = x1 - d / 2
    const wallTone = 0.95 + rand() * 0.1
    const tone = 0.9 + rand() * 0.16

    flat('yards', xL, xR, zB, zF, LIFT.apron, 0.94 + rand() * 0.1)

    // --- Gate opening [gx0, gx1] between two capped piers. ---
    const gw = Math.min(range(rand, GATE.width), w * 0.3)
    const gc = x0 + w * (0.25 + 0.5 * rand())
    const gx0 = gc - gw / 2
    const gx1 = gc + gw / 2
    const p = GATE.pier

    // --- Boundary walls: front (split by the gate), back and both sides. ---
    wallX(zF, xL - WALL.panel / 2, gx0 - p + 0.05, x0, gx0 - p, stations(xL, gx0 - p / 2, WALL.postPitch, true, false), wallTone)
    wallX(zF, gx1 + p - 0.05, xR + WALL.panel / 2, gx1 + p, x1, stations(gx1 + p / 2, xR, WALL.postPitch, false, true), wallTone)
    wallX(zB, xL - WALL.panel / 2, xR + WALL.panel / 2, x0, x1, stations(xL, xR, WALL.postPitch, true, true), wallTone)
    for (const x of [xL, xR]) wallZ(x, zB, zF, zB + d / 2, zF - d / 2, stations(zB, zF, WALL.postPitch, false, false), wallTone)

    const zPier = zOuter - GATE.capOverhang - p / 2
    const cap = p + 2 * GATE.capOverhang
    for (const px of [gx0 - p / 2, gx1 + p / 2]) {
      block('wallCoping', px, 0, zPier, p, H + GATE.pierRise, p, wallTone)
      block('wallCoping', px, H + GATE.pierRise, zPier, cap, 0.1, cap, wallTone * 0.94)
    }

    // --- Sliding leaf parked open behind the wall on the roomier side, on a track across the opening. ---
    const side = xR - (gx1 + p) >= gx0 - p - xL ? 1 : -1
    const leafLen = gw + GATE.leafOverlap
    const la = side > 0 ? gx1 - 0.3 : gx0 + 0.3 - leafLen
    const lb = la + leafLen
    const lz = zInner - GATE.leafSetback
    gateLeaf(la, lb, lz, Math.min(GATE.leafHeight, H + 0.1))
    const ta = Math.min(gx0 - 0.3, la)
    const tb = Math.max(gx1 + 0.3, lb)
    block('gates', (ta + tb) / 2, 0, lz, tb - ta, 0.05, 0.1)
    for (const bx of [gx0 + 0.5, gx1 - 0.5]) block('gateAccents', bx, 0, zInner - 1.0, 0.22, 1.1, 0.22)
    add('gateAccents', [gc, LIFT.paint, zInner - 3.0], [gw - 0.8, 0.004, 0.25], 1)

    // --- Access road from the gate to the verge line, and on into the yard as wide as the gate. ---
    const aw = cfg.accessRoadWidth
    if (aw > 0) {
      // On past the zone's road edge (local z = 0) by `roadReach`, onto the verge and shoulder up to the carriageway.
      flat('roads', gc - aw / 2, gc + aw / 2, zF, Math.max(0, cfg.roadReach) + ROAD_TUCK, LIFT.exitRoad)
      mouths?.push([gc - aw / 2, gc + aw / 2])
      flat('roads', gx0, gx1, zInner - GATE.innerRoad, zF + 0.1, LIFT.exitRoad)
    }

    // --- Buildings, behind the open truck yard. ---
    const fy = range(rand, FRONT_YARD)
    const bx0 = x0 + MARGIN
    const bx1 = x1 - MARGIN
    const bzF = zInner - fy
    const bzB = zB + d / 2 + MARGIN
    const BW = bx1 - bx0
    const BD = bzF - bzB
    if (BW < 24 || BD < 16) return

    // Main shed at the back, on one side; the rest of the width is the "strip" beside it.
    const mainLeft = rand() < 0.5
    const gap = range(rand, BUILDING_GAP)
    const sw = Math.min(BW, clamp(BW * range(rand, [0.45, 0.6]), 24, 64))
    const sd = Math.min(BD, clamp(BD * range(rand, [0.75, 1]), 16, 60))
    const shedX0 = mainLeft ? bx0 : bx1 - sw
    const eaves = shed(shedX0 + sw / 2, bzB + sd / 2, sw, sd, range(rand, hRange), tone)
    const nearX = mainLeft ? shedX0 + sw : shedX0 // the main shed's wall facing the strip
    const stripX0 = mainLeft ? nearX + gap : bx0
    const stripX1 = mainLeft ? bx1 : nearX - gap
    const rw = stripX1 - stripX0

    // Office block at the front of the strip, as close to the gate as it fits.
    let backLimit = bzF
    if (rand() < 0.8) {
      const od = range(rand, [9, 12])
      const oh = Math.min(hMax, hMin + rand() * 3)
      const ow = Math.min(range(rand, [14, 22]), rw)
      if (rw >= 10 && BD - od >= 10) {
        const ox = clamp(gc, stripX0 + ow / 2, stripX1 - ow / 2)
        office(ox, bzF - od / 2, ow, od, oh, ox < gc ? 1 : -1)
        backLimit = bzF - od - 6
      }
    }

    // Behind it: tanks, or a stack beside the shed, and/or a second shed.
    const bd = backLimit - bzB
    const roll = rand()
    let neighbour: { x0: number; x1: number; z1: number; tanks: boolean } | null = null
    let hasStack = false
    if (roll < cfg.buildings.tankChance) {
      if (rw >= 8 && bd >= 8) {
        const group = tankGroup(stripX0, stripX1, bzB, backLimit)
        if (group) neighbour = { ...group, tanks: true }
      }
    } else if (roll < cfg.buildings.tankChance + cfg.buildings.stackChance && gap >= 5) {
      hasStack = true
      const sx = mainLeft ? nearX + gap / 2 : nearX - gap / 2
      const sz = bzB + 2.6
      stack(sx, sz)
      pipeX(nearX, sx, Math.min(6, eaves - 1.2), sz, 0.45, 0.9)
    }
    if (!neighbour && rw >= 18 && bd >= 16 && rand() < 0.75) {
      const w2 = rw * range(rand, [0.8, 1])
      const d2 = bd * range(rand, [0.65, 1])
      const sx0 = mainLeft ? stripX1 - w2 : stripX0
      shed(sx0 + w2 / 2, bzB + d2 / 2, w2, d2, range(rand, hRange), tone * (0.94 + rand() * 0.08))
      neighbour = { x0: sx0, x1: sx0 + w2, z1: bzB + d2, tanks: false }
    }

    // Occasional pipe rack across the gap between the main shed and its neighbour.
    if (neighbour && !hasStack && rand() < (neighbour.tanks ? 0.65 : 0.35)) {
      const zTop = Math.min(bzB + sd, neighbour.z1)
      const xOther = mainLeft ? neighbour.x0 : neighbour.x1
      if (zTop - bzB >= 6 && Math.abs(xOther - nearX) >= 4) pipeRack(nearX, xOther, bzB + (zTop - bzB) / 2, neighbour.tanks)
    }
  }

  layoutCompounds(cfg).forEach(([x0, x1], index) => {
    rand = createRandom((cfg.seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0)
    compound(x0, x1)
  })
  return parts
}

/** Unit triangular prism: base on y = 0 from x = −0.5 to 0.5, ridge line at (x = 0, y = 1), from z = −0.5 to 0.5. */
function createPrismGeometry(): BufferGeometry {
  const L = -0.5
  const R = 0.5
  const F = 0.5
  const B = -0.5
  // prettier-ignore
  const positions = [
    L, 0, F, R, 0, F, 0, 1, F, // gable +Z
    R, 0, B, L, 0, B, 0, 1, B, // gable −Z
    L, 0, B, L, 0, F, 0, 1, F, // slope −X
    L, 0, B, 0, 1, F, 0, 1, B,
    R, 0, F, R, 0, B, 0, 1, B, // slope +X
    R, 0, F, 0, 1, B, 0, 1, F,
    L, 0, F, L, 0, B, R, 0, B, // underside
    L, 0, F, R, 0, B, R, 0, F,
  ]
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals() // non-indexed: flat face normals
  return geometry
}

function createGeometries(): Record<GeometryKey, BufferGeometry> {
  const plane = new PlaneGeometry(1, 1)
  plane.rotateX(-Math.PI / 2) // lies in XZ, facing +Y
  return {
    box: new BoxGeometry(1, 1, 1),
    prism: createPrismGeometry(),
    plane,
    cylinder: new CylinderGeometry(1, 1, 1, 28, 1),
    dome: new SphereGeometry(1, 28, 6, 0, Math.PI * 2, 0, Math.PI / 2),
  }
}

function createMaterials(colors: IndustrialZoneConfig['colors']): Record<MaterialKey, MeshStandardMaterial> {
  const make = (color: Color | string, roughness: number, metalness: number) => new MeshStandardMaterial({ color, roughness, metalness })
  return {
    wall: make(colors.wall, 0.92, 0.02),
    concrete: make(new Color(colors.wall).lerp(new Color(CONCRETE_LIGHT), 0.42), 0.9, 0.02),
    paving: make(new Color(colors.road).lerp(new Color(colors.wall), 0.55), 0.95, 0),
    road: make(colors.road, 0.95, 0),
    shed: make(colors.shed, 0.68, 0.3),
    roof: make(colors.roof, 0.72, 0.3),
    steel: make(new Color(colors.stack).multiplyScalar(0.82), 0.55, 0.55),
    glazing: make(GLAZING_COLOR, 0.32, 0.4),
    accent: make(colors.accent, 0.6, 0.1),
    tank: make(colors.tank, 0.5, 0.35),
    stack: make(colors.stack, 0.6, 0.4),
  }
}

function Instances({
  name,
  items,
  geometry,
  material,
  receiveShadow,
}: {
  name: string
  items: readonly Instance[]
  geometry: BufferGeometry
  material: MeshStandardMaterial
  receiveShadow: boolean
}) {
  const ref = useRef<InstancedMesh>(null)
  const invalidate = useThree((state) => state.invalidate)

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    items.forEach(({ position, scale, rotation, tone }, index) => {
      _position.set(position[0], position[1], position[2])
      _scale.set(scale[0], scale[1], scale[2])
      if (rotation) _quat.setFromEuler(_euler.set(rotation[0], rotation[1], rotation[2]))
      else _quat.identity()
      _matrix.compose(_position, _quat, _scale)
      mesh.setMatrixAt(index, _matrix)
      mesh.setColorAt(index, _tone.setScalar(tone))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
    invalidate()
  }, [items, geometry, material, invalidate])

  if (items.length === 0) return null
  return (
    // Keyed on the instance count so a different layout remounts the mesh instead of resizing it.
    <instancedMesh key={items.length} ref={ref} name={name} args={[geometry, material, items.length]} receiveShadow={receiveShadow} />
  )
}

export function IndustrialZone({ config }: IndustrialZoneProps) {
  const geometries = useMemo(() => createGeometries(), [])
  const materials = useMemo(() => createMaterials(config.colors), [config.colors])
  const parts = useMemo(() => buildIndustrialZone(config), [config])

  useEffect(() => () => {
    for (const geometry of Object.values(geometries)) geometry.dispose()
  }, [geometries])
  useEffect(() => () => {
    for (const material of Object.values(materials)) material.dispose()
  }, [materials])

  return (
    <group name="industrial-zone">
      {GROUP_KEYS.map((group) => (
        <group key={group} name={`industrial-zone:${group}`}>
          {PART_KEYS.filter((key) => PARTS[key].group === group).map((key) => {
            const part = PARTS[key]
            return (
              <Instances
                key={key}
                name={`industrial-zone:${group}:${part.name}`}
                items={parts[key]}
                geometry={geometries[part.geometry]}
                material={materials[part.material]}
                receiveShadow={group === 'roads'}
              />
            )
          })}
        </group>
      ))}
    </group>
  )
}
