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
  /** Vertical field of view (degrees). */
  fov: number
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

/** Vertical field of view (degrees) a framing uses at `aspect`. Pure. */
export function resolveFramingFov(spec: FramedCameraSpec, framing: CameraFraming, aspect: number): number {
  return resolveFraming(framing, aspect).fov ?? spec.fov
}

/**
 * Camera distance (m) from the framing target at which both `fitWidth` and
 * `fitHeight` fit the viewport for the framing's vertical fov at `aspect`,
 * clamped to `[minDistance, maxDistance]` (the framing's own `maxDistance`
 * wins over the spec's), unless the framing fixes its `distance`. Portrait
 * overrides apply. A non-finite or zero aspect is treated as 1.
 */
export function computeFramedCameraDistance(spec: FramedCameraSpec, framing: CameraFraming, aspect: number): number {
  const f = resolveFraming(framing, aspect)
  if (f.distance !== undefined) return f.distance
  const halfTan = Math.tan(((f.fov ?? spec.fov) * DEG2RAD) / 2)
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1
  const byWidth = f.fitWidth / 2 / (halfTan * safeAspect)
  const byHeight = f.fitHeight / 2 / halfTan
  return clamp(Math.max(byWidth, byHeight), spec.minDistance, f.maxDistance ?? spec.maxDistance)
}

/**
 * World-space camera position and look-at target for one framing at the given aspect ratio. With a
 * `screenOffset`, camera and target are panned together parallel to the image plane so that the framing's
 * target point lands at that normalised screen position (exact for points at the target's depth).
 */
export function computeFramedCameraPose(spec: FramedCameraSpec, framing: CameraFraming, aspect: number): FramedCameraPose {
  const f = resolveFraming(framing, aspect)
  const distance = computeFramedCameraDistance(spec, framing, aspect)
  const fov = f.fov ?? spec.fov
  const [dx, dy, dz] = f.direction
  const length = Math.hypot(dx, dy, dz) || 1
  const offset = f.targetOffset
  const target: Vec3 = [spec.target[0] + offset[0], spec.target[1] + offset[1], spec.target[2] + offset[2]]
  const position: Vec3 = [target[0] + (dx / length) * distance, target[1] + (dy / length) * distance, target[2] + (dz / length) * distance]
  if (f.screenOffset && (f.screenOffset[0] !== 0 || f.screenOffset[1] !== 0)) {
    const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1
    const halfTan = Math.tan((fov * DEG2RAD) / 2)
    // View basis: forward points from the camera to the target; right = forward × worldUp; up = right × forward.
    const fx = -dx / length
    const fy = -dy / length
    const fz = -dz / length
    let rx = -fz
    let rz = fx
    const rl = Math.hypot(rx, rz) || 1
    rx /= rl
    rz /= rl
    const ux = -rz * fy
    const uy = rz * fx - rx * fz
    const uz = rx * fy
    // Moving the camera by −s·(half extent) along right/up puts the old target at NDC s.
    const sx = f.screenOffset[0] * distance * halfTan * safeAspect
    const sy = f.screenOffset[1] * distance * halfTan
    const shiftX = -sx * rx - sy * ux
    const shiftY = -sy * uy
    const shiftZ = -sx * rz - sy * uz
    return {
      position: [position[0] + shiftX, position[1] + shiftY, position[2] + shiftZ],
      target: [target[0] + shiftX, target[1] + shiftY, target[2] + shiftZ],
      fov,
    }
  }
  return { position, target, fov }
}

function lerp3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

/** Ground-plane displacement (x, z) of the followed subject from its rest position. */
export type FollowDelta = readonly [dx: number, dz: number]

const NO_FOLLOW: FollowDelta = [0, 0]

/**
 * Interpolated pose for a stage value along the spec's framing sequence (clamped to the sequence), with the
 * framings' `follow` weights applied to the subject's displacement. Pure.
 */
export function resolveStagePose(spec: FramedCameraSpec, stage: number, aspect: number, follow: FollowDelta = NO_FOLLOW): FramedCameraPose {
  const poses = spec.sequence.map((name) => computeFramedCameraPose(spec, spec.framings[name], aspect))
  const weights = spec.sequence.map((name) => resolveFraming(spec.framings[name], aspect).follow ?? 0)
  return blendPoses(poses, weights, stage, follow)
}

function blendPoses(poses: readonly FramedCameraPose[], weights: readonly number[], stage: number, follow: FollowDelta): FramedCameraPose {
  const last = poses.length - 1
  const s = clamp(Number.isFinite(stage) ? stage : 0, 0, last)
  const i = Math.min(Math.floor(s), last - 1 < 0 ? 0 : last - 1)
  const t = s - i
  const a = poses[i]
  const b = poses[Math.min(i + 1, last)]
  const w = (weights[i] ?? 0) + ((weights[Math.min(i + 1, last)] ?? 0) - (weights[i] ?? 0)) * t
  const base = t <= 0 || a === b ? a : { position: lerp3(a.position, b.position, t), target: lerp3(a.target, b.target, t), fov: a.fov + (b.fov - a.fov) * t }
  if (w === 0 || (follow[0] === 0 && follow[1] === 0)) return base
  const dx = w * follow[0]
  const dz = w * follow[1]
  return {
    position: [base.position[0] + dx, base.position[1], base.position[2] + dz],
    target: [base.target[0] + dx, base.target[1], base.target[2] + dz],
    fov: base.fov,
  }
}

function isPerspective(camera: Camera): camera is PerspectiveCamera {
  return (camera as PerspectiveCamera).isPerspectiveCamera === true
}

interface FramedCameraCache {
  camera: Camera | null
  spec: FramedCameraSpec | null
  aspect: number
  stage: number
  followX: number
  followZ: number
  poses: FramedCameraPose[] | null
  weights: number[] | null
}

const _lookAt = new Vector3()

/**
 * Drives the default camera from `spec`, walking its framing sequence by the
 * value `getStage()` returns (clamped to 0 … sequence.length − 1). `getStage`
 * and `getFollow` are read every frame, so they may close over a mutable
 * animation rig. `getFollow` returns the followed subject's ground-plane
 * displacement from rest; framings with a `follow` weight track it.
 * Projection parameters are written only when they change: near / far from
 * the spec, the vertical fov from the blended framings (`framing.fov`, else
 * the spec's).
 */
export function useFramedCamera(spec: FramedCameraSpec, getStage: () => number, getFollow?: () => FollowDelta): void {
  const cache = useRef<FramedCameraCache>({ camera: null, spec: null, aspect: NaN, stage: NaN, followX: NaN, followZ: NaN, poses: null, weights: null })

  useFrame((state) => {
    const camera = state.camera
    const { width, height } = state.size
    const aspect = height > 0 ? width / height : 1
    const stage = getStage()
    const follow = getFollow ? getFollow() : NO_FOLLOW
    const c = cache.current

    if (isPerspective(camera) && (camera.near !== spec.near || camera.far !== spec.far)) {
      camera.near = spec.near
      camera.far = spec.far
      camera.updateProjectionMatrix()
    }

    if (c.camera !== camera || c.spec !== spec || c.aspect !== aspect) {
      c.camera = camera
      c.spec = spec
      c.aspect = aspect
      c.poses = spec.sequence.map((name) => computeFramedCameraPose(spec, spec.framings[name], aspect))
      c.weights = spec.sequence.map((name) => resolveFraming(spec.framings[name], aspect).follow ?? 0)
      c.stage = NaN
    }
    if ((c.stage === stage && c.followX === follow[0] && c.followZ === follow[1]) || !c.poses || !c.weights || c.poses.length === 0) return
    c.stage = stage
    c.followX = follow[0]
    c.followZ = follow[1]

    const pose = blendPoses(c.poses, c.weights, stage, follow)
    if (isPerspective(camera) && camera.fov !== pose.fov) {
      camera.fov = pose.fov
      camera.updateProjectionMatrix()
    }
    camera.position.set(pose.position[0], pose.position[1], pose.position[2])
    _lookAt.set(pose.target[0], pose.target[1], pose.target[2])
    camera.lookAt(_lookAt)
  }, -1)
}
