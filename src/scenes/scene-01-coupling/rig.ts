/**
 * The ANIMATION RIG is a plain mutable object that the GSAP timeline tweens and
 * the React Three Fiber stage reads every frame. It is the only bridge between
 * the scroll-driven timeline (DOM world) and the 3D objects (canvas world).
 *
 * Why: GSAP tweens plain numbers very cheaply and ScrollTrigger scrubs them in
 * both directions; the stage then copies the numbers onto whichever Object3D is
 * currently mounted — placeholder or real GLB. Swapping a model therefore never
 * touches the timeline.
 *
 * Two layers: the RIG holds what the timeline tweens (positions during the
 * approach, the departure distance, camera stage, fades); the POSE is derived
 * from the rig every frame by `resolveCouplingPose` (departurePath.ts) and is
 * what the vehicle groups actually copy — during the departure the puller
 * follows the U-turn path and the trailer tracks it, so their world transforms
 * are a function of one scalar, the distance travelled (and, in the factory,
 * the distance reversed). The heavy lift's cargo, crane and rigging poses are
 * derived the same way from `loading` (see loading.ts).
 */
import type { Vec3 } from '../../three/assets/types'
import type { AssemblyLayout } from './layout'

export interface RigPosition {
  x: number
  y: number
  z: number
}

export interface CouplingRig {
  puller: RigPosition
  trailer: RigPosition
  camera: {
    /**
     * Position along the camera framing sequence (see config.camera.sequence):
     * 0 = base, 1 = coupling push-in, 2 = wide establishing shot, 3 = highway, 4 = city, 5 = factory entry,
     * 6 = doorway, 7 = loading, 8 = lift. Fractions blend.
     */
    stage: number
  }
  overlay: {
    /** Opacity of the opening hero copy (DOM). */
    heroOpacity: number
    /** Opacity of the closing caption (DOM). */
    captionOpacity: number
  }
  garage: {
    /** Opacity of the garage (and its wall sign): 0 while the vehicles enter, 1 once they are coupled — and it stays 1. */
    opacity: number
  }
  departure: {
    /** Distance (m) the puller has travelled along the departure path; 0 = still at its coupling position. */
    distance: number
  }
  atmosphere: {
    /** 0 = enclosed-yard atmosphere (dark backdrop, short fog); 1 = open daylight (sky, long haze, daylight ground). */
    daylight: number
    /** 0 = outdoors; 1 = inside the factory hall (the sun no longer reaches the subject: key light dimmed). */
    interior: number
  }
  city: {
    /** Metres travelled along the highway beyond the departure path's end (the camera follows). */
    travel: number
  }
  industrial: {
    /** Further metres along the highway through the industrial area, to the stop beyond the factory gate. */
    travel: number
  }
  parking: {
    /** Metres reversed from that stop along the parking path into bay A (0 = still on the highway). */
    reverse: number
  }
  /** Heavy-lift loading stages, each 0 → 1 in its own phase (see loading.ts for what each one moves). */
  loading: LoadingProgress
  /** Overall timeline progress 0–1, mirrored for diagnostics / badges. */
  progress: number
}

/** World transform of one vehicle group: position in metres and yaw (rotation about Y, radians). */
export interface VehiclePose {
  x: number
  y: number
  z: number
  yaw: number
}

/** Derived per-frame transforms the vehicle groups copy. */
export interface CouplingPose {
  puller: VehiclePose
  trailer: VehiclePose
}

/** Progress (0–1) of each heavy-lift loading stage, in timeline order. */
export interface LoadingProgress {
  /** Crane travels over the vessel and lowers the rigging to just above the lugs. */
  approach: number
  /** Rigging lowered onto the lugs (shackles pinned at `timing.attachContact`), then on into slack. */
  attach: number
  /** Slack taken up: slings taut. */
  tension: number
  /** Vessel lifted clear of its saddles. */
  lift: number
  /** Vessel carried sideways over the trailer deck. */
  transfer: number
  /** Vessel lowered onto the trailer saddles. */
  lower: number
  /** Slings slackened, shackles released, crane moved clear. */
  release: number
}

/** Values the completed (end-of-scene) rig needs that depend on the scene config. */
export interface FinalRigState {
  cameraStage: number
  departureDistance: number
  daylight: number
  cityTravel: number
  industrialTravel: number
  parkingReverse: number
  interior: number
  /** 1 = every loading stage complete (vessel on the trailer), 0 = none started. */
  loadingDone: 0 | 1
}

const loadingAt = (v: number): LoadingProgress => ({ approach: v, attach: v, tension: v, lift: v, transfer: v, lower: v, release: v })

function pos(v: Vec3): RigPosition {
  return { x: v[0], y: v[1], z: v[2] }
}

/** Rig in its opening state. */
export function createInitialRig(layout: AssemblyLayout): CouplingRig {
  return {
    puller: pos(layout.pullerStart),
    trailer: pos(layout.trailerStart),
    camera: { stage: 0 },
    overlay: { heroOpacity: 1, captionOpacity: 0 },
    garage: { opacity: 0 },
    departure: { distance: 0 },
    atmosphere: { daylight: 0, interior: 0 },
    city: { travel: 0 },
    industrial: { travel: 0 },
    parking: { reverse: 0 },
    loading: loadingAt(0),
    progress: 0,
  }
}

/** Rig in a held state (coupling hold, highway hold, city hold or loaded, see `FinalRigState`) — used for reduced-motion rendering and tests. */
export function createFinalRig(layout: AssemblyLayout, final: FinalRigState): CouplingRig {
  return {
    puller: pos(layout.pullerFinal),
    trailer: pos(layout.trailerFinal),
    camera: { stage: final.cameraStage },
    overlay: { heroOpacity: 0, captionOpacity: 0 },
    garage: { opacity: 1 },
    departure: { distance: final.departureDistance },
    atmosphere: { daylight: final.daylight, interior: final.interior },
    city: { travel: final.cityTravel },
    industrial: { travel: final.industrialTravel },
    parking: { reverse: final.parkingReverse },
    loading: loadingAt(final.loadingDone),
    progress: 1,
  }
}

/** Copies every value of `from` into `into` in place (keeps object identity for refs). */
export function assignRig(into: CouplingRig, from: CouplingRig): void {
  Object.assign(into.puller, from.puller)
  Object.assign(into.trailer, from.trailer)
  into.camera.stage = from.camera.stage
  into.overlay.heroOpacity = from.overlay.heroOpacity
  into.overlay.captionOpacity = from.overlay.captionOpacity
  into.garage.opacity = from.garage.opacity
  into.departure.distance = from.departure.distance
  into.atmosphere.daylight = from.atmosphere.daylight
  into.atmosphere.interior = from.atmosphere.interior
  into.city.travel = from.city.travel
  into.industrial.travel = from.industrial.travel
  into.parking.reverse = from.parking.reverse
  Object.assign(into.loading, from.loading)
  into.progress = from.progress
}

/** Pose object at the opening positions; `resolveCouplingPose` keeps it current. */
export function createPose(layout: AssemblyLayout): CouplingPose {
  return {
    puller: { x: layout.pullerStart[0], y: layout.pullerStart[1], z: layout.pullerStart[2], yaw: 0 },
    trailer: { x: layout.trailerStart[0], y: layout.trailerStart[1], z: layout.trailerStart[2], yaw: 0 },
  }
}
