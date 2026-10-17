/**
 * Pure helpers for the TEMPORARY procedural pressure vessel (PressureVessel.tsx)
 * and its saddles (VesselSaddle.tsx). No React here.
 *
 * 1. MEASUREMENTS, in the PressureVesselConfig LOCAL frame (see ./types.ts): the
 *    vessel axis runs along X, x = 0 is the middle of the cylindrical shell,
 *    y = 0 is the lowest point of the SHELL (the axis is at y = diameter / 2),
 *    z = 0 is on the axis. The scene and the lifting rig use these (overall
 *    length, top, footprint, lug pin centres) without knowing how the vessel is
 *    drawn, so they stay valid when a GLB replaces the stand-in, as long as the
 *    GLB keeps the same frame.
 *
 * 2. GEOMETRY BUILDERS (three.js only), in an AXIS frame: the axis of revolution
 *    is the X axis through the origin and angles around it are measured from +Y
 *    towards +Z (0 = top, +π/2 = +Z side, π = bottom), the convention of the
 *    config's nozzle angles. Callers translate the result to the axis height.
 *
 * Fabrication details shared by both (bead size, wear-pad size, wall shown at
 * open ends, head straight flange) are the constants below.
 */
import { BufferGeometry, Float32BufferAttribute, LatheGeometry, Vector2, Vector3 } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Vec3 } from '../assets/types'
import type { PressureVesselConfig } from './types'

export const TAU = Math.PI * 2

/** Shell plate thickness, visible at the open ends of unfinished vessels (m). */
export const SHELL_WALL = 0.06
/** Weld bead cross-section: width on the surface, height proud of it, depth sunk below it (m). */
export const WELD_BEAD = { width: 0.04, proud: 0.025, sink: 0.004 } as const
/** Saddle wear pads: width along X, thickness proud of the shell, included angle centred on the bottom (rad). */
export const WEAR_PAD = { width: 0.4, proud: 0.012, sink: 0.004, arc: 2.2 } as const
/** Doubler plate under each lifting lug: margin beyond the lug base along X, half-width across (Z), thickness proud. */
export const LUG_DOUBLER = { margin: 0.08, halfWidth: 0.17, proud: 0.012, sink: 0.004 } as const
/** Longitudinal seams sit this far from the top, alternating +/− course by course (rad). */
export const LONG_SEAM_ANGLE = (25 * Math.PI) / 180

type Nozzle = PressureVesselConfig['nozzles'][number]

/* -------------------------------------------------------------------------- */
/* Measurements (vessel LOCAL frame)                                          */
/* -------------------------------------------------------------------------- */

/** Number of dished heads fitted at this stage (complete 2, oneHead 1, shell 0). */
export function headCount(config: PressureVesselConfig): number {
  return config.stage === 'complete' ? 2 : config.stage === 'oneHead' ? 1 : 0
}

/** True if a dished head closes the given end (−1 = −X end, +1 = +X end). `oneHead` fits the −X head only. */
export function hasHeadAt(config: PressureVesselConfig, side: -1 | 1): boolean {
  return config.stage === 'complete' || (config.stage === 'oneHead' && side === -1)
}

/** Depth of one dished head beyond the tangent line (m). */
export function headDepth(config: PressureVesselConfig): number {
  return config.diameter * config.headDepthRatio
}

/**
 * Straight flange of a dished head (m). It lies INSIDE the tangent-line length,
 * so the head-to-shell seam sits this far inboard of each tangent line.
 */
export function straightFlange(config: PressureVesselConfig): number {
  return Math.min(0.08, config.diameter * 0.02)
}

/** Overall length along X: the shell plus the heads fitted at this stage (m). */
export function overallLength(config: PressureVesselConfig): number {
  return config.shellLength + headCount(config) * headDepth(config)
}

/** Local y of the vessel axis (= diameter / 2). */
export function axisHeight(config: PressureVesselConfig): number {
  return config.diameter / 2
}

/** Local x of the head-to-shell seam at the given end (whether or not the head is fitted). */
export function headJointX(config: PressureVesselConfig, side: -1 | 1): number {
  return side * (config.shellLength / 2 - straightFlange(config))
}

/** Local x of the course boundaries, from −shellLength/2 to +shellLength/2 inclusive (courses + 1 values). */
export function courseBoundariesX(config: PressureVesselConfig): number[] {
  const n = Math.max(1, Math.round(config.courses))
  const L = config.shellLength
  return Array.from({ length: n + 1 }, (_, i) => -L / 2 + (i * L) / n)
}

/** Local x of every circumferential seam present at this stage: course joints plus the fitted head joints, ascending. */
export function circumferentialSeamsX(config: PressureVesselConfig): number[] {
  const out = courseBoundariesX(config).slice(1, -1)
  if (hasHeadAt(config, -1)) out.push(headJointX(config, -1))
  if (hasHeadAt(config, 1)) out.push(headJointX(config, 1))
  return out.sort((a, b) => a - b)
}

/** Flange pair of a nozzle (weld-neck flange + blind flange), sized from the nozzle diameter and capped by its projection. */
export function nozzleFlange(nozzle: Nozzle): { radius: number; thickness: number; gap: number; blindThickness: number; stack: number } {
  const radius = nozzle.diameter * 0.65 + 0.06
  let thickness = 0.05 + 0.06 * nozzle.diameter
  let blindThickness = thickness * 0.8
  const gap = 0.006
  const maxStack = Math.max(0.6 * nozzle.projection, 0.03)
  const stack = thickness + gap + blindThickness
  if (stack > maxStack) {
    const k = (maxStack - gap) / (thickness + blindThickness)
    thickness *= k
    blindThickness *= k
  }
  return { radius, thickness, gap, blindThickness, stack: thickness + gap + blindThickness }
}

/** Half-length along X of a lifting lug's base (m). */
export function lugBaseHalfLength(config: PressureVesselConfig): number {
  return Math.max(config.lugs.height * 0.6, config.lugs.holeDiameter * 2)
}

/**
 * LOCAL centres of the lifting-lug pin holes (where the rig's shackles pin on):
 * on the top line of the shell, `lugs.height − lugs.holeDiameter` above it, at each
 * `lugs.x`. Empty unless the vessel is complete.
 */
export function lugPinPoints(config: PressureVesselConfig): Vec3[] {
  if (config.stage !== 'complete') return []
  const y = config.diameter + config.lugs.height - config.lugs.holeDiameter
  return config.lugs.x.map((x): Vec3 => [x, y, 0])
}

/** Distances along a nozzle's axis (from the vessel axis) of its blind-flange face and its flange's inner face. */
function nozzleReach(config: PressureVesselConfig, nozzle: Nozzle): [number, number] {
  const outer = config.diameter / 2 + nozzle.projection
  return [outer, outer - nozzleFlange(nozzle).stack]
}

/** Highest local y of the vessel: shell top and seams, lifting lugs and nozzle flanges (complete vessels). */
export function topY(config: PressureVesselConfig): number {
  const R = config.diameter / 2
  let top = config.diameter + (circumferentialSeamsX(config).length > 0 ? WELD_BEAD.proud : 0)
  if (config.stage !== 'complete') return top
  if (config.lugs.x.length > 0) top = Math.max(top, config.diameter + config.lugs.height)
  for (const nozzle of config.nozzles) {
    const lateral = nozzleFlange(nozzle).radius * Math.abs(Math.sin(nozzle.angle))
    for (const reach of nozzleReach(config, nozzle)) top = Math.max(top, R + reach * Math.cos(nozzle.angle) + lateral)
  }
  return top
}

/**
 * Plan extent in the LOCAL frame: X range including the fitted heads (and any
 * nozzle flange), and the half-width in Z including seams and the radial reach
 * of nozzles.
 */
export function footprint(config: PressureVesselConfig): { xMin: number; xMax: number; halfWidth: number } {
  const hd = headDepth(config)
  let xMin = -config.shellLength / 2 - (hasHeadAt(config, -1) ? hd : 0)
  let xMax = config.shellLength / 2 + (hasHeadAt(config, 1) ? hd : 0)
  let halfWidth = config.diameter / 2 + WELD_BEAD.proud
  if (config.stage === 'complete') {
    for (const nozzle of config.nozzles) {
      const flange = nozzleFlange(nozzle)
      const across = flange.radius * Math.abs(Math.cos(nozzle.angle))
      for (const reach of nozzleReach(config, nozzle)) halfWidth = Math.max(halfWidth, Math.abs(reach * Math.sin(nozzle.angle)) + across)
      xMin = Math.min(xMin, nozzle.x - flange.radius)
      xMax = Math.max(xMax, nozzle.x + flange.radius)
    }
  }
  return { xMin, xMax, halfWidth }
}

/* -------------------------------------------------------------------------- */
/* Geometry builders (AXIS frame: revolution axis = X through the origin)     */
/* -------------------------------------------------------------------------- */

/**
 * A profile in the (radius, x) half-plane. Surfaces of revolution face to the
 * RIGHT of the direction of travel along the profile (with r drawn to the right
 * and x upwards): travelling +x at radius r faces outwards, travelling −x faces
 * the axis, travelling −r at constant x faces +X, travelling +r faces −X.
 */
export type Profile = ReadonlyArray<readonly [r: number, x: number]>

const _v = new Vector3()

/** Re-normalises a normal attribute (LatheGeometry leaves the last profile vertex's normal unnormalised). */
function normalizeNormals(geometry: BufferGeometry): void {
  const normal = geometry.getAttribute('normal')
  for (let i = 0; i < normal.count; i++) {
    _v.fromBufferAttribute(normal, i).normalize()
    normal.setXYZ(i, _v.x, _v.y, _v.z)
  }
  normal.needsUpdate = true
}

/**
 * Revolves `profile` about the X axis between angles `a0` and `a1` (0 = top,
 * +π/2 = +Z side). `fullSegments` is the radial resolution of a full turn; a
 * partial sweep gets a proportional share.
 */
export function revolveX(profile: Profile, a0 = 0, a1 = TAU, fullSegments = 72): BufferGeometry {
  const span = Math.min(Math.max(a1 - a0, 0), TAU)
  // Even, so a sweep centred on the top or bottom has a vertex exactly there (saddle contact, lowest point).
  const segments = 2 * Math.max(2, Math.ceil((fullSegments * span) / TAU / 2))
  const points = profile.map(([r, x]) => new Vector2(Math.max(r, 0), x))
  // LatheGeometry revolves about +Y with phi measured from +Z; rotating +Y onto +X maps phi = a − π/2 onto angle a.
  const geometry = new LatheGeometry(points, segments, a0 - Math.PI / 2, span)
  geometry.rotateZ(-Math.PI / 2)
  normalizeNormals(geometry)
  return geometry
}

/** Flat convex polygon (fan-triangulated) facing `normal`; the winding is fixed to match it. */
export function fanGeometry(points: readonly Vector3[], normal: Vector3): BufferGeometry {
  const n = points.length
  const centre = new Vector3()
  for (const p of points) centre.add(p)
  centre.divideScalar(Math.max(n, 1))
  // Newell normal of the polygon decides the winding.
  const newell = new Vector3()
  const a = new Vector3()
  const b = new Vector3()
  for (let i = 0; i < n; i++) {
    a.subVectors(points[i], centre)
    b.subVectors(points[(i + 1) % n], centre)
    newell.add(a.clone().cross(b))
  }
  const ccw = newell.dot(normal) >= 0
  const positions: number[] = [centre.x, centre.y, centre.z]
  const normals: number[] = [normal.x, normal.y, normal.z]
  const uvs: number[] = [0.5, 0.5]
  for (const p of points) {
    positions.push(p.x, p.y, p.z)
    normals.push(normal.x, normal.y, normal.z)
    uvs.push(0, 0)
  }
  const indices: number[] = []
  for (let i = 0; i < n; i++) {
    const p = 1 + i
    const q = 1 + ((i + 1) % n)
    if (ccw) indices.push(0, p, q)
    else indices.push(0, q, p)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  return geometry
}

/** End cap closing a partial revolution of `profile` at angle `a`; `facing` +1 faces increasing angle, −1 decreasing. */
export function revolveCap(profile: Profile, a: number, facing: 1 | -1): BufferGeometry {
  const c = Math.cos(a)
  const s = Math.sin(a)
  const points = profile.map(([r, x]) => new Vector3(x, r * c, r * s))
  return fanGeometry(points, new Vector3(0, -s * facing, c * facing))
}

export interface SectorFaces {
  /** Outer curved surface (radius rOut). */
  outer?: boolean
  /** Inner curved surface (radius rIn), facing the axis. */
  inner?: boolean
  /** Flat face at x0, facing −X. */
  start?: boolean
  /** Flat face at x1, facing +X. */
  end?: boolean
  /** Radial end faces at a0 and a1 (only for partial sweeps). */
  caps?: boolean
}

/**
 * A curved plate: the solid between radii rIn and rOut, x0 and x1, angles a0 and
 * a1 (a full ring when the sweep is 2π). Returned as separate parts (crisp edges)
 * for the caller to merge; faces can be left out where another part covers them.
 */
export function annularSector(rIn: number, rOut: number, x0: number, x1: number, a0: number, a1: number, faces: SectorFaces = {}, fullSegments = 72): BufferGeometry[] {
  const { outer = true, inner = true, start = true, end = true, caps = true } = faces
  const parts: BufferGeometry[] = []
  if (outer) parts.push(revolveX([[rOut, x0], [rOut, x1]], a0, a1, fullSegments))
  if (inner) parts.push(revolveX([[rIn, x1], [rIn, x0]], a0, a1, fullSegments))
  if (start) parts.push(revolveX([[rIn, x0], [rOut, x0]], a0, a1, fullSegments))
  if (end) parts.push(revolveX([[rOut, x1], [rIn, x1]], a0, a1, fullSegments))
  if (caps && a1 - a0 < TAU - 1e-6) {
    const section: Profile = [[rIn, x0], [rOut, x0], [rOut, x1], [rIn, x1]]
    parts.push(revolveCap(section, a0, -1), revolveCap(section, a1, 1))
  }
  return parts
}

/**
 * The arcs of a full turn left free by `blocked` arcs (centre angle, half-span),
 * as [a0, a1] with a0 < a1 (angles may exceed 2π). One [0, 2π] arc if nothing is blocked.
 */
export function freeArcs(blocked: ReadonlyArray<{ centre: number; half: number }>): Array<[number, number]> {
  if (blocked.length === 0) return [[0, TAU]]
  if (blocked.some((b) => b.half >= Math.PI)) return []
  const spans = blocked
    .map(({ centre, half }): [number, number] => {
      const s = (((centre - half) % TAU) + TAU) % TAU
      return [s, s + 2 * half]
    })
    .sort((p, q) => p[0] - q[0])
  const merged: Array<[number, number]> = []
  for (const [s, e] of spans) {
    const last = merged[merged.length - 1]
    if (last && s <= last[1]) last[1] = Math.max(last[1], e)
    else merged.push([s, e])
  }
  // A span running past 2π may swallow the first ones.
  for (;;) {
    const last = merged[merged.length - 1]
    if (merged.length < 2 || last[1] < merged[0][0] + TAU) break
    merged.pop()
    merged[0] = [last[0] - TAU, Math.max(merged[0][1], last[1] - TAU)]
  }
  const out: Array<[number, number]> = []
  for (let i = 0; i < merged.length; i++) {
    const from = merged[i][1]
    const to = i + 1 < merged.length ? merged[i + 1][0] : merged[0][0] + TAU
    if (to - from > 1e-3) out.push([from, to])
  }
  return out
}

/**
 * Merges parts into one geometry and disposes the parts. Mixed indexed and
 * non-indexed parts (ExtrudeGeometry is non-indexed) are all de-indexed first.
 * Returns null for an empty list.
 */
export function mergeParts(parts: BufferGeometry[]): BufferGeometry | null {
  if (parts.length === 0) return null
  const mixed = parts.some((g) => g.index === null) && parts.some((g) => g.index !== null)
  const prepared = mixed ? parts.map((g) => (g.index ? g.toNonIndexed() : g)) : parts
  const merged: BufferGeometry | null = mergeGeometries(prepared, false)
  for (const g of new Set([...parts, ...prepared])) g.dispose()
  if (!merged) throw new Error('vesselGeometry.mergeParts: parts have incompatible attributes')
  merged.computeBoundingBox()
  merged.computeBoundingSphere()
  return merged
}
