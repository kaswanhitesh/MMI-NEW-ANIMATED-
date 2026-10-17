/**
 * Viewport- and framing-aware fog depths for Scene 01. Pure functions — no
 * React, no three.js — kept apart from the stage component so they can be
 * unit-tested and so the component file keeps fast refresh.
 *
 * The config's fog `near` / `far` are absolute camera depths tuned for the
 * opening framing on landscape viewports. Wider framings and narrow (portrait)
 * viewports put the camera much further back, and those fixed depths would
 * then fall in front of the subject and hide it. So, per framing, the near
 * plane is pushed out to at least the far edge of the framed subject and the
 * far plane keeps the configured band width; the stage then blends the depths
 * of neighbouring framings by the camera stage. Where the config is already
 * consistent the values pass through unchanged (to within a few centimetres).
 */
import type { CameraFraming, FramedCameraSpec } from '../../../three/camera/types'
import { computeFramedCameraDistance, resolveFraming } from '../../../three/camera/useFramedCamera'
import type { Scene01Config } from '../config'

export interface FogDepths {
  near: number
  far: number
}

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

/** Fog near / far (m, camera depth) for ONE framing at the given viewport aspect ratio. */
export function resolveFogDepthsForFraming(config: Scene01Config, framing: CameraFraming, aspect: number): FogDepths {
  const { fog } = config.environment
  const camera: FramedCameraSpec = config.camera
  const subjectFarDepth = computeFramedCameraDistance(camera, framing, aspect) + framedDepthHalfExtent(resolveFraming(framing, aspect))
  const near = Math.max(fog.near, subjectFarDepth)
  return { near, far: near + (fog.far - fog.near) }
}

/** Fog depths for every framing in the camera sequence, in sequence order. */
export function resolveFogDepthsPerStage(config: Scene01Config, aspect: number): FogDepths[] {
  return config.camera.sequence.map((name) => resolveFogDepthsForFraming(config, config.camera.framings[name], aspect))
}

/** Blends the per-stage depths for a fractional camera stage (clamped to the sequence). */
export function blendFogDepths(perStage: readonly FogDepths[], stage: number): FogDepths {
  const last = perStage.length - 1
  if (last < 0) return { near: 1, far: 2 }
  const s = Math.min(Math.max(Number.isFinite(stage) ? stage : 0, 0), last)
  const i = Math.min(Math.floor(s), Math.max(last - 1, 0))
  const t = s - i
  const a = perStage[i]
  const b = perStage[Math.min(i + 1, last)]
  return { near: a.near + (b.near - a.near) * t, far: a.far + (b.far - a.far) * t }
}

/** Convenience for tests: depths for the opening framing. */
export function resolveFogDepths(config: Scene01Config, aspect: number): FogDepths {
  return blendFogDepths(resolveFogDepthsPerStage(config, aspect), 0)
}
