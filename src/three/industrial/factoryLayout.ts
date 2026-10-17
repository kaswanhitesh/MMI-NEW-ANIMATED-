/**
 * Pure layout helpers for the Gemini Engi Fab factory stand-in (GeminiFactory.tsx).
 * No React and no three.js: plain numbers derived from a GeminiFactoryConfig, so
 * the scene (crane span, vessel placement, camera paths) can share the exact
 * structural grid the building is drawn from.
 *
 * LOCAL FRAME (see GeminiFactoryConfig in ./types): origin at floor level on the
 * front (door) wall line; local −Z runs into the hall, +Z towards the road; X
 * across the bays. Conventions fixed here:
 *  - column CENTRES sit on the grid: X on the column lines (bay edges), Z on rows
 *    from 0 to −length at `columnPitch` (the front row on the front wall line, the
 *    last row on −length);
 *  - the front wall's OUTER face is on z = 0 (the front columns stand half proud
 *    of it as pilasters); the side and back walls are fixed to the outer faces of
 *    the outer columns, `FACTORY_WALL_THICKNESS` thick;
 *  - crane rails sit on runway girders carried on corbels off the columns' inner
 *    faces, so each rail centre line is `runwayInset()` inside its column line and
 *    the rail TOP is at `craneRunway.railHeight` (the crane's wheel tread line).
 */
import type { GeminiFactoryConfig } from './types'

/** Thickness of the clad walls (m). */
export const FACTORY_WALL_THICKNESS = 0.25
/**
 * Top of the concrete floor slab inside the hall (local y). Below the scene's contact-shadow plane (20 mm, see
 * environment/roadSurface.ts LIFT) so the vehicles' contact shadows still show on the hall floor; the painted
 * markings sit 6 mm above it.
 */
export const FACTORY_SLAB_TOP = 0.008
/** Clear gap between a column's inner face and the side of its crane runway girder (bridged by the corbel). */
export const RUNWAY_COLUMN_GAP = 0.05
/** Section height of the crane rail on each runway girder: girder top = railHeight − CRANE_RAIL_HEIGHT. */
export const CRANE_RAIL_HEIGHT = 0.12
/** Height of the lowest point of a vessel cradled on turning rolls, above the fixture's origin (local y). */
export const TURNING_ROLLS_VESSEL_BOTTOM = 0.55

/** Positions closer than this (m) are the same grid line. */
const SAME_LINE = 1e-3

export interface ColumnLine {
  x: number
  /** `outer` = the side walls' lines (first bay x0, last bay x1); `inner` = shared bay boundaries. */
  line: 'outer' | 'inner'
}

export interface ColumnPosition extends ColumnLine {
  z: number
}

/** Axis-aligned rectangle in the factory's local XZ plane (x0 < x1, z1 < z0). */
export interface FactoryRect {
  x0: number
  x1: number
  z0: number
  z1: number
}

export interface CraneRunwayLine {
  /** Name of the bay the runway serves. */
  bay: string
  /** Rail centre lines (local X): the crane span is x1 − x0, its centre line (x0 + x1) / 2. */
  x0: number
  x1: number
  /** Rail top (local Y), where the crane's wheel treads run. */
  railHeight: number
}

/** Column lines across the bays, sorted by X; the first and last are `outer`. */
export function columnLines(config: GeminiFactoryConfig): ColumnLine[] {
  const xs: number[] = []
  for (const bay of config.bays) {
    for (const x of [bay.x0, bay.x1]) {
      if (!xs.some((v) => Math.abs(v - x) < SAME_LINE)) xs.push(x)
    }
  }
  xs.sort((a, b) => a - b)
  return xs.map((x, i) => ({ x, line: i === 0 || i === xs.length - 1 ? 'outer' : 'inner' }))
}

/** Column rows along Z: 0, −pitch, −2·pitch … and always the back row at −length (a row closer than a quarter pitch to it is dropped). */
export function columnRows(config: GeminiFactoryConfig): number[] {
  const length = Math.max(0, config.length)
  const pitch = config.columnPitch > SAME_LINE ? config.columnPitch : Math.max(length, 1)
  const rows: number[] = []
  for (let i = 0; i * pitch < length - pitch * 0.25; i++) rows.push(i === 0 ? 0 : -i * pitch)
  rows.push(length > 0 ? -length : 0)
  return rows
}

/** Every column centre in the factory's local frame (each column line × each row, front and back corners included). */
export function columnPositions(config: GeminiFactoryConfig): ColumnPosition[] {
  const rows = columnRows(config)
  const out: ColumnPosition[] = []
  for (const { x, line } of columnLines(config)) for (const z of rows) out.push({ x, z, line })
  return out
}

/** Inside faces of the walls: side walls at the outer columns' outer faces, front wall's inner face, back wall's inner face. */
export function interiorBounds(config: GeminiFactoryConfig): FactoryRect {
  const lines = columnLines(config)
  if (lines.length === 0) return { x0: 0, x1: 0, z0: 0, z1: 0 }
  const half = config.columnSize / 2
  return {
    x0: lines[0].x - half,
    x1: lines[lines.length - 1].x + half,
    z0: -FACTORY_WALL_THICKNESS,
    z1: -config.length - half,
  }
}

/** Outside faces of the walls (the building footprint; front pilasters, door heads and parked door leaves stand proud of z = 0). */
export function outerBounds(config: GeminiFactoryConfig): FactoryRect {
  const inner = interiorBounds(config)
  if (inner.x0 === inner.x1) return inner
  const t = FACTORY_WALL_THICKNESS
  return { x0: inner.x0 - t, x1: inner.x1 + t, z0: 0, z1: inner.z1 - t }
}

/** Distance from a column line to the rail centre line of the runway it carries. */
export function runwayInset(config: GeminiFactoryConfig): number {
  return config.columnSize / 2 + RUNWAY_COLUMN_GAP + config.craneRunway.girderWidth / 2
}

/** Crane runways of the bays with `hasCrane`: rail centre lines just inside the bay's two column lines. */
export function craneRunwayLines(config: GeminiFactoryConfig): CraneRunwayLine[] {
  const inset = runwayInset(config)
  return config.bays
    .filter((bay) => bay.hasCrane)
    .map((bay) => ({
      bay: bay.name,
      x0: Math.min(bay.x0, bay.x1) + inset,
      x1: Math.max(bay.x0, bay.x1) - inset,
      railHeight: config.craneRunway.railHeight,
    }))
}
