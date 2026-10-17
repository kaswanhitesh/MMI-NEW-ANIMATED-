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
 * are a function of one scalar, the distance travelled.
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
     * 0 = base, 1 = coupling push-in, 2 = wide establishing shot, 3 = highway, 4 = city. Fractions blend.
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
  }
  city: {
    /** Metres travelled along the highway beyond the departure path's end (the camera follows). */
    travel: number
  }
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

/** Values the completed (end-of-scene) rig needs that depend on the scene config. */
export interface FinalRigState {
  cameraStage: number
  departureDistance: number
  daylight: number
  cityTravel: number
}

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
    atmosphere: { daylight: 0 },
    city: { travel: 0 },
    progress: 0,
  }
}

/** Rig in a completed state (highway hold or city hold, see `FinalRigState`) — used for reduced-motion rendering and tests. */
export function createFinalRig(layout: AssemblyLayout, final: FinalRigState): CouplingRig {
  return {
    puller: pos(layout.pullerFinal),
    trailer: pos(layout.trailerFinal),
    camera: { stage: final.cameraStage },
    overlay: { heroOpacity: 0, captionOpacity: 0 },
    garage: { opacity: 1 },
    departure: { distance: final.departureDistance },
    atmosphere: { daylight: final.daylight },
    city: { travel: final.cityTravel },
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
  into.city.travel = from.city.travel
  into.progress = from.progress
}

/** Pose object at the opening positions; `resolveCouplingPose` keeps it current. */
export function createPose(layout: AssemblyLayout): CouplingPose {
  return {
    puller: { x: layout.pullerStart[0], y: layout.pullerStart[1], z: layout.pullerStart[2], yaw: 0 },
    trailer: { x: layout.trailerStart[0], y: layout.trailerStart[1], z: layout.trailerStart[2], yaw: 0 },
  }
}
