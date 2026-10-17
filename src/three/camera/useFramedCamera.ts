/**
 * Responsive camera framing. Given a `FramedCameraSpec` the hook derives, per
 * viewport aspect ratio, the distance at which both `fitWidth` metres of world
 * width and `fitHeight` metres of world height fit inside the vertical field
 * of view, then places the camera along each framing's direction at that
 * distance and points it at the framing's target. A continuous "stage" value
 * (`getStage()`, 0 … sequence.length − 1) walks through the spec's framing
 * sequence, interpolating between neighbours, so a scroll timeline can push
 * in, pull out and re-frame without cuts. The work runs in `useFrame` at
 * priority −1 (before every other frame callback) and is skipped while aspect,
 * stage and spec are unchanged. The pure helpers are exported for tests.
 */
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Vector3, type Camera, type PerspectiveCamera } from 'three'
import type { Vec3 } from '../assets/types'
import type { CameraFraming, FramedCameraSpec } from './types'

export interface FramedCameraPose {
  position: Vec3
  target: Vec3
}

const DEG2RAD = Math.PI / 180

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** The framing as it applies at `aspect`: portrait overrides merged in when aspect < 1. Pure. */
export function resolveFraming(framing: CameraFraming, aspect: number): CameraFraming {
  if (!(aspect < 1) || !framing.portrait) return framing
  return { ...framing, ...framing.portrait }
}

/**
 * Camera distance (m) from the framing target at which both `fitWidth` and
 * `fitHeight` fit the viewport for the spec's vertical fov at `aspect`,
 * clamped to `[minDistance, maxDistance]` (the framing's own `maxDistance`
 * wins over the spec's). Portrait overrides apply. A non-finite or zero
 * aspect is treated as 1.
 */
export function computeFramedCameraDistance(spec: FramedCameraSpec, framing: CameraFraming, aspect: number): number {
  const f = resolveFraming(framing, aspect)
  const halfTan = Math.tan((spec.fov * DEG2RAD) / 2)
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1
  const byWidth = f.fitWidth / 2 / (halfTan * safeAspect)
  const byHeight = f.fitHeight / 2 / halfTan
  return clamp(Math.max(byWidth, byHeight), spec.minDistance, f.maxDistance ?? spec.maxDistance)
}

/** World-space camera position and look-at target for one framing at the given aspect ratio. */
export function computeFramedCameraPose(spec: FramedCameraSpec, framing: CameraFraming, aspect: number): FramedCameraPose {
  const distance = computeFramedCameraDistance(spec, framing, aspect)
  const [dx, dy, dz] = framing.direction
  const length = Math.hypot(dx, dy, dz) || 1
  const offset = resolveFraming(framing, aspect).targetOffset
  const target: Vec3 = [spec.target[0] + offset[0], spec.target[1] + offset[1], spec.target[2] + offset[2]]
  const position: Vec3 = [target[0] + (dx / length) * distance, target[1] + (dy / length) * distance, target[2] + (dz / length) * distance]
  return { position, target }
}

function lerp3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

/** Interpolated pose for a stage value along the spec's framing sequence (clamped to the sequence). Pure. */
export function resolveStagePose(spec: FramedCameraSpec, stage: number, aspect: number): FramedCameraPose {
  const poses = spec.sequence.map((name) => computeFramedCameraPose(spec, spec.framings[name], aspect))
  return blendPoses(poses, stage)
}

function blendPoses(poses: readonly FramedCameraPose[], stage: number): FramedCameraPose {
  const last = poses.length - 1
  const s = clamp(Number.isFinite(stage) ? stage : 0, 0, last)
  const i = Math.min(Math.floor(s), last - 1 < 0 ? 0 : last - 1)
  const t = s - i
  const a = poses[i]
  const b = poses[Math.min(i + 1, last)]
  if (t <= 0 || a === b) return a
  return { position: lerp3(a.position, b.position, t), target: lerp3(a.target, b.target, t) }
}

function isPerspective(camera: Camera): camera is PerspectiveCamera {
  return (camera as PerspectiveCamera).isPerspectiveCamera === true
}

interface FramedCameraCache {
  camera: Camera | null
  spec: FramedCameraSpec | null
  aspect: number
  stage: number
  poses: FramedCameraPose[] | null
}

const _lookAt = new Vector3()

/**
 * Drives the default camera from `spec`, walking its framing sequence by the
 * value `getStage()` returns (clamped to 0 … sequence.length − 1). `getStage`
 * is read every frame, so it may close over a mutable animation rig.
 * Projection parameters (fov / near / far) are written only when they differ
 * from the spec.
 */
export function useFramedCamera(spec: FramedCameraSpec, getStage: () => number): void {
  const cache = useRef<FramedCameraCache>({ camera: null, spec: null, aspect: NaN, stage: NaN, poses: null })

  useFrame((state) => {
    const camera = state.camera
    const { width, height } = state.size
    const aspect = height > 0 ? width / height : 1
    const stage = getStage()
    const c = cache.current

    if (isPerspective(camera) && (camera.fov !== spec.fov || camera.near !== spec.near || camera.far !== spec.far)) {
      camera.fov = spec.fov
      camera.near = spec.near
      camera.far = spec.far
      camera.updateProjectionMatrix()
    }

    if (c.camera !== camera || c.spec !== spec || c.aspect !== aspect) {
      c.camera = camera
      c.spec = spec
      c.aspect = aspect
      c.poses = spec.sequence.map((name) => computeFramedCameraPose(spec, spec.framings[name], aspect))
      c.stage = NaN
    }
    if (c.stage === stage || !c.poses || c.poses.length === 0) return
    c.stage = stage

    const pose = blendPoses(c.poses, stage)
    camera.position.set(pose.position[0], pose.position[1], pose.position[2])
    _lookAt.set(pose.target[0], pose.target[1], pose.target[2])
    camera.lookAt(_lookAt)
  }, -1)
}
