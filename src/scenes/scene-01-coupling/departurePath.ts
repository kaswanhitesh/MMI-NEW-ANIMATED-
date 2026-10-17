/**
 * The DEPARTURE PATH of Scene 01 and the pose resolver that drives both
 * vehicles from it. Pure — no React, no three.js.
 *
 * Path (XZ plane, metres, arc length `s` from the puller's coupling position):
 *   1. straight ahead (the nose points −X) for `straightOut`;
 *   2. a left U-turn of radius `turnRadius` (the vehicle swings towards +Z,
 *      i.e. towards the camera) through 180°;
 *   3. straight on, now heading +X, for `straightIn`.
 * Negative `s` extends segment 1 backwards; this is how the trailer's rear
 * reference point is placed while the combination is still partly at rest.
 *
 * Yaw convention: the vehicles' local forward is −X; a yaw of θ about Y turns
 * that to (−cos θ, 0, sin θ), so θ = 0 faces −X and θ = π faces +X.
 *
 * Tracking: the puller's origin rides the path; its fifth wheel sits
 * `hitchOffset` behind it along its heading. The trailer is pinned to the
 * fifth wheel at its kingpin, and its heading is the line from a rear
 * reference point — a point `trackingLength` further back ALONG THE PATH, the
 * way a steered modular trailer follows its tractor — to the kingpin. The two
 * bodies therefore stay coupled through the turn with a realistic
 * articulation angle and no interpenetration.
 */
import type { Vec3 } from '../../three/assets/types'
import { clipPolygon, crossingRange, worldToSlot } from '../../three/environment/slotSpace'
import type { EnvironmentSlotConfig } from '../../three/environment/types'
import type { Scene01Config } from './config'

type SlotPlacement = Pick<EnvironmentSlotConfig, 'position' | 'rotationY'>
import type { CouplingPose, CouplingRig } from './rig'

export interface PathPoint {
  x: number
  z: number
  /** Heading (yaw about Y, radians). */
  yaw: number
}

export interface DeparturePath {
  totalLength: number
  /** Puller origin after travelling `s` metres from the start (negative `s` extends the first straight backwards). */
  at(s: number, out: PathPoint): PathPoint
}

export function createDeparturePath(start: Vec3, cfg: Scene01Config['departure']): DeparturePath {
  const x0 = start[0]
  const z0 = start[2]
  const S1 = cfg.straightOut
  const R = cfg.turnRadius
  const arcLength = Math.PI * R
  const cx = x0 - S1
  const cz = z0 + R
  const totalLength = S1 + arcLength + cfg.straightIn
  return {
    totalLength,
    at(s, out) {
      if (s <= S1) {
        out.x = x0 - s
        out.z = z0
        out.yaw = 0
      } else if (s <= S1 + arcLength) {
        const phi = (s - S1) / R
        out.x = cx - R * Math.sin(phi)
        out.z = cz - R * Math.cos(phi)
        out.yaw = phi
      } else {
        out.x = cx + (s - S1 - arcLength)
        out.z = z0 + 2 * R
        out.yaw = Math.PI
      }
      return out
    },
  }
}

export interface TrailerTracking {
  /** Distance (m) from the puller's origin back to its fifth wheel (the manifest coupling anchor × scene scale). */
  hitchOffset: number
  /** Distance (m) from the trailer's origin forward to its kingpin (−manifest coupling anchor × scene scale). */
  kingpinOffset: number
  /** Distance (m) from the kingpin back to the trailer's rear reference point (axle-group centre). */
  trackingLength: number
}

const _p: PathPoint = { x: 0, z: 0, yaw: 0 }
const _a: PathPoint = { x: 0, z: 0, yaw: 0 }

/**
 * Writes the vehicles' world transforms for the rig's current state into
 * `pose`. Before the departure (distance ≤ 0) the rig positions pass through
 * unchanged, so the approach choreography is untouched. The city journey's
 * travel is added to the departure distance: the final straight continues.
 */
export function resolveCouplingPose(rig: CouplingRig, path: DeparturePath, tracking: TrailerTracking, pose: CouplingPose): void {
  // The city journey simply drives on along the path's final straight (it continues beyond its nominal end).
  const s = rig.departure.distance + rig.city.travel
  const { puller, trailer } = pose
  if (!(s > 0)) {
    puller.x = rig.puller.x
    puller.y = rig.puller.y
    puller.z = rig.puller.z
    puller.yaw = 0
    trailer.x = rig.trailer.x
    trailer.y = rig.trailer.y
    trailer.z = rig.trailer.z
    trailer.yaw = 0
    return
  }

  path.at(s, _p)
  puller.x = _p.x
  puller.y = rig.puller.y
  puller.z = _p.z
  puller.yaw = _p.yaw

  // Fifth wheel: `hitchOffset` behind the puller along its heading (local +X → world (cos θ, −sin θ)).
  const hx = _p.x + tracking.hitchOffset * Math.cos(_p.yaw)
  const hz = _p.z - tracking.hitchOffset * Math.sin(_p.yaw)

  // Rear reference point further back along the path; the trailer points from it to the kingpin.
  path.at(s - tracking.hitchOffset - tracking.trackingLength, _a)
  let dx = hx - _a.x
  let dz = hz - _a.z
  const length = Math.hypot(dx, dz) || 1
  dx /= length
  dz /= length
  // The trailer's local −X (its front) maps to (−cos ψ, sin ψ); solve for ψ.
  const psi = Math.atan2(dz, -dx)

  trailer.x = hx + tracking.kingpinOffset * Math.cos(psi)
  trailer.y = rig.trailer.y
  trailer.z = hz - tracking.kingpinOffset * Math.sin(psi)
  trailer.yaw = psi
}

/** Lengths (m) used to locate the combination's ends for camera following. */
export interface CombinationLengths {
  pullerLength: number
  trailerLength: number
}

/**
 * Ground-plane centre of the combination (midpoint of the puller's nose and the trailer's tail), written into
 * `out`. The camera follows its displacement from the coupled rest position.
 */
export function combinationCentre(pose: CouplingPose, lengths: CombinationLengths, out: [number, number]): [number, number] {
  const { puller: p, trailer: t } = pose
  // Forward (local −X) of a vehicle with yaw θ is (−cos θ, sin θ); its nose is half a length along it, its tail half a length back.
  const noseX = p.x - (lengths.pullerLength / 2) * Math.cos(p.yaw)
  const noseZ = p.z + (lengths.pullerLength / 2) * Math.sin(p.yaw)
  const tailX = t.x + (lengths.trailerLength / 2) * Math.cos(t.yaw)
  const tailZ = t.z - (lengths.trailerLength / 2) * Math.sin(t.yaw)
  out[0] = (noseX + tailX) / 2
  out[1] = (noseZ + tailZ) / 2
  return out
}

/** Articulation angle (radians) between puller and trailer headings — handy for tests and tuning. */
export function articulationAngle(pose: CouplingPose): number {
  let d = pose.puller.yaw - pose.trailer.yaw
  while (d > Math.PI) d -= 2 * Math.PI
  while (d < -Math.PI) d += 2 * Math.PI
  return d
}

/** The exit road under the departure U-turn, clipped to run from the garage apron's kerb to the highway. */
export interface ExitRoadOutline {
  /** Closed polygon in WORLD XZ (metres); empty if the clips leave nothing. */
  outline: Array<[x: number, z: number]>
  /** Garage-local X range where the road crosses the apron kerb line (the kerb is broken there), or null. */
  kerbGap: [x0: number, x1: number] | null
  /** Highway-local X range where the road meets the far carriageway edge (its edge line is broken there), or null. */
  junction: [x0: number, x1: number] | null
}

/**
 * Paved band under the U-turn in WORLD XZ: the ring between radii
 * `turnRadius ± width / 2` around the turn centre, from the start of the turn
 * (φ = 0) to its end (φ = π), closed by radial caps. Pure.
 */
export function describeTurnBand(start: Vec3, cfg: Scene01Config['departure'], width: number, arcSegments = 64): Array<[number, number]> {
  const cx = start[0] - cfg.straightOut
  const cz = start[2] + cfg.turnRadius
  const rO = cfg.turnRadius + width / 2
  const rI = Math.max(0.5, cfg.turnRadius - width / 2)
  // Polar point on the turn: φ = 0 at the start of the turn, π at its end (see createDeparturePath).
  const polar = (r: number, phi: number): [number, number] => [cx - r * Math.sin(phi), cz - r * Math.cos(phi)]
  const outline: Array<[number, number]> = []
  for (let i = 0; i <= arcSegments; i++) outline.push(polar(rO, (Math.PI * i) / arcSegments))
  for (let i = arcSegments; i >= 0; i--) outline.push(polar(rI, (Math.PI * i) / arcSegments))
  return outline
}

/**
 * Describes the exit road the combination drives on from the garage apron to
 * the highway: the U-turn's paved band, clipped where it leaves the apron
 * (garage-local z ≥ apron front − overlap, so it tucks under the kerb line) and
 * where it meets the carriageway (highway-local z ≤ far edge + overlap). The
 * clips are evaluated in each slot's own frame, so moving or rotating the
 * garage or highway keeps the road joined to both. Pure.
 *
 * @param garage   the garage slot placement and its apron's front edge / kerb width (slot-local)
 * @param highway  the highway slot placement and its carriageway half-width
 */
export function describeExitRoad(
  start: Vec3,
  cfg: Scene01Config['departure'],
  width: number,
  overlap: number,
  garage: { slot: SlotPlacement; apronFront: number; kerbWidth: number },
  highway: { slot: SlotPlacement; carriagewayHalfWidth: number },
): ExitRoadOutline {
  const band = describeTurnBand(start, cfg, width)
  const offApron = clipPolygon(band, (p) => worldToSlot(garage.slot, p)[1] - (garage.apronFront - overlap))
  const outline = clipPolygon(offApron, (p) => -highway.carriagewayHalfWidth + overlap - worldToSlot(highway.slot, p)[1])
  if (outline.length < 3) return { outline: [], kerbGap: null, junction: null }
  // The road begins `overlap` inside the kerb line: break the kerb across the road's widest extent over that depth.
  const atFront = crossingRange(outline, garage.slot, garage.apronFront)
  const atBack = crossingRange(outline, garage.slot, garage.apronFront - Math.min(garage.kerbWidth, overlap) + 1e-4)
  const kerbGap: [number, number] | null =
    atFront || atBack ? [Math.min(atFront?.[0] ?? Infinity, atBack?.[0] ?? Infinity), Math.max(atFront?.[1] ?? -Infinity, atBack?.[1] ?? -Infinity)] : null
  const junction = crossingRange(outline, highway.slot, -highway.carriagewayHalfWidth)
  return { outline, kerbGap, junction }
}
