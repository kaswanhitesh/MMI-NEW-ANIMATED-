/**
 * Responsive camera framing. Given a `FramedCameraSpec` the hook derives, per
 * viewport aspect ratio, the distance at which both `fitWidth` metres of world
 * width and `fitHeight` metres of world height fit inside the vertical field
 * of view, then places the camera along the framing's direction at that
 * distance and points it at the target. Two framings (`base` and `heroHold`)
 * are blended by the value `getBlend()` returns, so a scroll timeline can push
 * in without a cut. The work runs in `useFrame` at priority −1 (before every
 * other frame callback) and is skipped while aspect, blend and spec are
 * unchanged. The pure helpers are exported for tests.
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

/**
 * Camera distance (m) from the framing target at which both `fitWidth` and
 * `fitHeight` fit the viewport for the spec's vertical fov at `aspect`,
 * clamped to `[minDistance, maxDistance]`. A non-finite or zero aspect is
 * treated as 1.
 */
export function computeFramedCameraDistance(spec: FramedCameraSpec, framing: CameraFraming, aspect: number): number {
  const halfTan = Math.tan((spec.fov * DEG2RAD) / 2)
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1
  const byWidth = framing.fitWidth / 2 / (halfTan * safeAspect)
  const byHeight = framing.fitHeight / 2 / halfTan
  return clamp(Math.max(byWidth, byHeight), spec.minDistance, spec.maxDistance)
}

/** World-space camera position and look-at target for one framing at the given aspect ratio. */
export function computeFramedCameraPose(spec: FramedCameraSpec, framing: CameraFraming, aspect: number): FramedCameraPose {
  const distance = computeFramedCameraDistance(spec, framing, aspect)
  const [dx, dy, dz] = framing.direction
  const length = Math.hypot(dx, dy, dz) || 1
  const target: Vec3 = [
    spec.target[0] + framing.targetOffset[0],
    spec.target[1] + framing.targetOffset[1],
    spec.target[2] + framing.targetOffset[2],
  ]
  const position: Vec3 = [target[0] + (dx / length) * distance, target[1] + (dy / length) * distance, target[2] + (dz / length) * distance]
  return { position, target }
}

function isPerspective(camera: Camera): camera is PerspectiveCamera {
  return (camera as PerspectiveCamera).isPerspectiveCamera === true
}

interface FramedCameraCache {
  camera: Camera | null
  spec: FramedCameraSpec | null
  aspect: number
  blend: number
  base: FramedCameraPose | null
  hero: FramedCameraPose | null
}

const _lookAt = new Vector3()

/**
 * Drives the default camera from `spec`, blending `base` → `heroHold` by
 * `getBlend()` (clamped to 0–1). `getBlend` is read every frame, so it may
 * close over a mutable animation rig. Projection parameters (fov / near / far)
 * are written only when they differ from the spec.
 */
export function useFramedCamera(spec: FramedCameraSpec, getBlend: () => number): void {
  const cache = useRef<FramedCameraCache>({ camera: null, spec: null, aspect: NaN, blend: NaN, base: null, hero: null })

  useFrame((state) => {
    const camera = state.camera
    const { width, height } = state.size
    const aspect = height > 0 ? width / height : 1
    const blend = clamp(getBlend(), 0, 1)
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
      c.base = computeFramedCameraPose(spec, spec.base, aspect)
      c.hero = computeFramedCameraPose(spec, spec.heroHold, aspect)
      c.blend = NaN
    }
    if (c.blend === blend || !c.base || !c.hero) return
    c.blend = blend

    const { position: p0, target: t0 } = c.base
    const { position: p1, target: t1 } = c.hero
    camera.position.set(p0[0] + (p1[0] - p0[0]) * blend, p0[1] + (p1[1] - p0[1]) * blend, p0[2] + (p1[2] - p0[2]) * blend)
    _lookAt.set(t0[0] + (t1[0] - t0[0]) * blend, t0[1] + (t1[1] - t0[1]) * blend, t0[2] + (t1[2] - t0[2]) * blend)
    camera.lookAt(_lookAt)
  }, -1)
}
