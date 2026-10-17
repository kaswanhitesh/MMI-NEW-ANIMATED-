/**
 * The ANIMATION RIG is a plain mutable object that the GSAP timeline tweens and
 * the React Three Fiber stage reads every frame. It is the only bridge between
 * the scroll-driven timeline (DOM world) and the 3D objects (canvas world).
 *
 * Why: GSAP tweens plain numbers very cheaply and ScrollTrigger scrubs them in
 * both directions; the stage then copies the numbers onto whichever Object3D is
 * currently mounted — placeholder or real GLB. Swapping a model therefore never
 * touches the timeline.
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
    /** 0 = base framing, 1 = hero-hold framing. Blended by the stage. */
    heroBlend: number
  }
  overlay: {
    /** Opacity of the opening hero copy (DOM). */
    heroOpacity: number
    /** Opacity of the closing caption (DOM). */
    captionOpacity: number
  }
  /** Overall timeline progress 0–1, mirrored for diagnostics / badges. */
  progress: number
}

function pos(v: Vec3): RigPosition {
  return { x: v[0], y: v[1], z: v[2] }
}

/** Rig in its Phase A state. */
export function createInitialRig(layout: AssemblyLayout): CouplingRig {
  return {
    puller: pos(layout.pullerStart),
    trailer: pos(layout.trailerStart),
    camera: { heroBlend: 0 },
    overlay: { heroOpacity: 1, captionOpacity: 0 },
    progress: 0,
  }
}

/** Rig in its completed (hero hold) state — used for reduced-motion rendering and tests. */
export function createFinalRig(layout: AssemblyLayout): CouplingRig {
  return {
    puller: pos(layout.pullerFinal),
    trailer: pos(layout.trailerFinal),
    camera: { heroBlend: 1 },
    overlay: { heroOpacity: 0, captionOpacity: 1 },
    progress: 1,
  }
}

/** Copies every value of `from` into `into` in place (keeps object identity for refs). */
export function assignRig(into: CouplingRig, from: CouplingRig): void {
  Object.assign(into.puller, from.puller)
  Object.assign(into.trailer, from.trailer)
  into.camera.heroBlend = from.camera.heroBlend
  into.overlay.heroOpacity = from.overlay.heroOpacity
  into.overlay.captionOpacity = from.overlay.captionOpacity
  into.progress = from.progress
}
