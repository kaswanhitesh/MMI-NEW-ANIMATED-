/**
 * Pure 2D (ground-plane) helpers for environment slots: converting between
 * world XZ and a slot's local XZ, clipping a polygon by a slot-local
 * half-plane, and measuring where a polygon crosses a slot-local line. Used to
 * map geometry the scene derives in WORLD space (e.g. the exit road, which
 * follows the vehicle's path) into the slot that renders it, so a slot can be
 * moved or rotated without the derived geometry drifting away from the path.
 *
 * Convention (three.js, rotation about +Y by θ): local (x, z) → world
 * (x cos θ + z sin θ, −x sin θ + z cos θ) + position.
 */
import type { EnvironmentSlotConfig } from './types'

export type XZ = readonly [x: number, z: number]

type SlotPlacement = Pick<EnvironmentSlotConfig, 'position' | 'rotationY'>

export function slotToWorld(slot: SlotPlacement, [x, z]: XZ): [number, number] {
  const c = Math.cos(slot.rotationY)
  const s = Math.sin(slot.rotationY)
  return [x * c + z * s + slot.position[0], -x * s + z * c + slot.position[2]]
}

export function worldToSlot(slot: SlotPlacement, [x, z]: XZ): [number, number] {
  const c = Math.cos(slot.rotationY)
  const s = Math.sin(slot.rotationY)
  const dx = x - slot.position[0]
  const dz = z - slot.position[2]
  return [dx * c - dz * s, dx * s + dz * c]
}

/**
 * Sutherland–Hodgman clip of a polygon (any winding) against the half-plane
 * where `signedDistance(p) >= 0`. `signedDistance` must be affine in p (true
 * for a slot-local line), so edge intersections are exact.
 */
export function clipPolygon(polygon: readonly XZ[], signedDistance: (p: XZ) => number): Array<[number, number]> {
  const out: Array<[number, number]> = []
  const n = polygon.length
  for (let i = 0; i < n; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % n]
    const da = signedDistance(a)
    const db = signedDistance(b)
    if (da >= 0) out.push([a[0], a[1]])
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da - db)
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    }
  }
  return out
}

/**
 * Slot-local X range where the polygon's edges cross the slot-local line
 * z = `lineZ`, or null if they never do. Used to break a kerb or an edge line
 * where a road crosses it.
 */
export function crossingRange(polygon: readonly XZ[], slot: SlotPlacement, lineZ: number): [number, number] | null {
  let lo = Infinity
  let hi = -Infinity
  const n = polygon.length
  for (let i = 0; i < n; i++) {
    const a = worldToSlot(slot, polygon[i])
    const b = worldToSlot(slot, polygon[(i + 1) % n])
    const da = a[1] - lineZ
    const db = b[1] - lineZ
    if (da === 0 && db === 0) {
      lo = Math.min(lo, a[0], b[0])
      hi = Math.max(hi, a[0], b[0])
    } else if ((da <= 0 && db >= 0) || (da >= 0 && db <= 0)) {
      const t = da / (da - db)
      const x = a[0] + (b[0] - a[0]) * t
      lo = Math.min(lo, x)
      hi = Math.max(hi, x)
    }
  }
  return lo <= hi ? [lo, hi] : null
}
