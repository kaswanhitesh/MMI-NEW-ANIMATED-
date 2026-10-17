/**
 * Viewport-aware fog depths for Scene 01. Pure functions — no React, no
 * three.js — kept apart from the stage component so they can be unit-tested
 * and so the component file keeps fast refresh.
 *
 * The config's fog `near` / `far` are absolute camera depths tuned for
 * landscape viewports. On narrow (portrait) viewports the responsive camera
 * backs off much further to keep the whole combination in frame, and those
 * fixed depths would then fall in front of the vehicles and hide them. The
 * near plane is therefore pushed out to at least the far edge of the framed
 * subject, and the far plane keeps the configured band width. Where the
 * config is already consistent the values pass through unchanged (to within a
 * few centimetres).
 */
import type { CameraFraming, FramedCameraSpec } from '../../../three/camera/types'
import { computeFramedCameraDistance } from '../../../three/camera/useFramedCamera'
import type { Scene01Config } from '../config'

/**
 * View-space depth (m) from the framing target to the far edge of the framed
 * box: half the fit width projected onto the view axis plus half the fit
 * height likewise.
 */
export function framedDepthHalfExtent(framing: CameraFraming): number {
  const [dx, dy, dz] = framing.direction
  const length = Math.hypot(dx, dy, dz) || 1
  return (framing.fitWidth / 2) * Math.abs(dx / length) + (framing.fitHeight / 2) * Math.abs(dy / length)
}

/** Fog near / far (m, camera depth) for the given viewport aspect ratio. */
export function resolveFogDepths(config: Scene01Config, aspect: number): { near: number; far: number } {
  const { fog } = config.environment
  const camera: FramedCameraSpec = config.camera
  const subjectFarDepth = Math.max(
    computeFramedCameraDistance(camera, camera.base, aspect) + framedDepthHalfExtent(camera.base),
    computeFramedCameraDistance(camera, camera.heroHold, aspect) + framedDepthHalfExtent(camera.heroHold),
  )
  const near = Math.max(fog.near, subjectFarDepth)
  return { near, far: near + (fog.far - fog.near) }
}
