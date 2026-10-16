/**
 * Scene-agnostic camera framing description. A scene config provides one or
 * more of these; `useFramedCamera` derives the actual camera distance per
 * viewport aspect ratio so the composition survives phones and ultra-wides.
 */
import type { Vec3 } from '../assets/types'

export interface CameraFraming {
  /** Unit-less direction from the look-at target towards the camera; normalised at runtime. Encodes azimuth + elevation. */
  direction: Vec3
  /** Metres of world width (measured at the target depth) that must fit in the viewport. Distance is derived per aspect ratio. */
  fitWidth: number
  /** Metres of world height that must also fit (protects portrait viewports). */
  fitHeight: number
  /** Offset added to the scene's camera target for this framing. */
  targetOffset: Vec3
}

export interface FramedCameraSpec {
  /** Vertical field of view in degrees. */
  fov: number
  near: number
  far: number
  /** Look-at target in world space. */
  target: Vec3
  /** Framing used when `blend` = 0. */
  base: CameraFraming
  /** Framing used when `blend` = 1 (e.g. a hero push-in). */
  heroHold: CameraFraming
  /** Clamp on the derived camera distance (m). */
  minDistance: number
  maxDistance: number
}
