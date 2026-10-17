/**
 * Scene-agnostic camera framing description. A scene config provides a named
 * set of framings and the order a single "stage" value walks through them;
 * `useFramedCamera` derives the actual camera distance per viewport aspect
 * ratio so the composition survives phones and ultra-wides.
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
  /** Overrides the spec-wide `maxDistance` for this framing (e.g. a wide shot that may pull back further). */
  maxDistance?: number
  /**
   * Fixed camera distance (m) for this framing, ignoring the fit and the distance clamps — for a camera that must
   * pass a precise point on every aspect ratio (e.g. through a doorway). Omit to derive the distance from the fit.
   */
  distance?: number
  /**
   * Vertical field of view (degrees) for this framing; the spec's `fov` when omitted. Blends between neighbouring
   * framings with the stage, like position and target (a slow zoom, never a cut).
   */
  fov?: number
  /**
   * 0–1: how much this framing tracks a moving subject. The camera and its target are translated by
   * `follow × (subject − subjectAtRest)` in the ground plane, so at rest the framing is exactly as configured
   * and a moving subject stays in frame. Weights blend between neighbouring framings like everything else.
   */
  follow?: number
  /**
   * Where the framing's target should appear on screen, in normalised device coordinates (x: −1 left … 1 right,
   * y: −1 bottom … 1 top). The camera pans parallel to the image plane to put it there, so the composition holds
   * on every aspect ratio and distance without changing the viewing angle. Omit for a centred target.
   */
  screenOffset?: readonly [x: number, y: number]
  /**
   * Overrides applied on portrait viewports (aspect < 1). Use it to centre a composition that is right-aligned
   * on landscape screens, or to tighten / loosen the fit where the narrow width would otherwise dominate.
   */
  portrait?: Partial<Pick<CameraFraming, 'direction' | 'targetOffset' | 'fitWidth' | 'fitHeight' | 'maxDistance' | 'distance' | 'fov' | 'follow' | 'screenOffset'>>
}

export interface FramedCameraSpec<N extends string = string> {
  /** Vertical field of view in degrees. */
  fov: number
  near: number
  far: number
  /** Look-at target in world space. */
  target: Vec3
  /** Named framings. */
  framings: Readonly<Record<N, CameraFraming>>
  /**
   * Order of the framings along the camera "stage" axis: stage 0 shows `sequence[0]`, stage 1 shows `sequence[1]`, and
   * fractional stages interpolate position and target between neighbours. A scroll timeline tweens the stage.
   */
  sequence: readonly N[]
  /** Clamp on the derived camera distance (m). */
  minDistance: number
  maxDistance: number
}
