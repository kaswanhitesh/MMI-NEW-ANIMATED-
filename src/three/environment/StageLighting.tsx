/**
 * Three-point stage lighting for the vehicle scenes, driven entirely by the
 * scene config's `lighting` block: a hemisphere light for ambient sky / ground
 * bounce, a shadow-casting key light whose orthographic shadow frustum is
 * centred on `shadowCentre` (±shadowExtent), and fill and rim directional
 * lights without shadows. Light positions are absolute world positions in
 * metres; the key light aims at `shadowCentre` through an explicit target
 * object that is mounted in the scene so its world matrix stays current.
 */
import { useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { Object3D, type DirectionalLight } from 'three'
import type { Vec3 } from '../assets/types'
import type { StageLightingConfig } from './types'

export interface StageLightingProps {
  lighting: StageLightingConfig
  /** World point (m) the key light aims at and its shadow frustum is centred on. */
  shadowCentre: Vec3
}

/** Hemisphere light height; only its orientation (straight down) matters, so the value is not tuned. */
const HEMISPHERE_HEIGHT = 50

/**
 * How far the shadow camera's near / far planes extend in front of and beyond
 * the shadow centre, as a multiple of `shadowExtent`, so vehicles standing
 * anywhere in the ±extent square are inside the depth range.
 */
const SHADOW_DEPTH_FACTOR = 1.5

export function StageLighting({ lighting, shadowCentre }: StageLightingProps) {
  const { hemisphere, key, fill, rim } = lighting
  const keyRef = useRef<DirectionalLight>(null)
  const target = useMemo(() => new Object3D(), [])
  const invalidate = useThree((state) => state.invalidate)

  useLayoutEffect(() => {
    const light = keyRef.current
    if (!light) return

    target.position.set(shadowCentre[0], shadowCentre[1], shadowCentre[2])
    target.updateMatrixWorld()

    const shadow = light.shadow
    const shadowCamera = shadow.camera
    const extent = key.shadowExtent
    const distance = Math.hypot(key.position[0] - shadowCentre[0], key.position[1] - shadowCentre[1], key.position[2] - shadowCentre[2])
    shadowCamera.left = -extent
    shadowCamera.right = extent
    shadowCamera.top = extent
    shadowCamera.bottom = -extent
    shadowCamera.near = Math.max(0.1, distance - extent * SHADOW_DEPTH_FACTOR)
    shadowCamera.far = distance + extent * SHADOW_DEPTH_FACTOR
    shadowCamera.updateProjectionMatrix()

    shadow.bias = key.shadowBias
    shadow.normalBias = key.shadowNormalBias
    shadow.radius = key.shadowRadius
    if (shadow.mapSize.x !== key.shadowMapSize || shadow.mapSize.y !== key.shadowMapSize) {
      shadow.mapSize.set(key.shadowMapSize, key.shadowMapSize)
      // A map allocated at the old size must be released so three.js re-creates it at the new one.
      if (shadow.map) {
        shadow.map.dispose()
        shadow.map = null
      }
    }
    shadow.needsUpdate = true
    invalidate()
  }, [key, shadowCentre, target, invalidate])

  return (
    <>
      <hemisphereLight args={[hemisphere.skyColor, hemisphere.groundColor, hemisphere.intensity]} position={[0, HEMISPHERE_HEIGHT, 0]} />
      <directionalLight
        ref={keyRef}
        name="key-light"
        position={key.position}
        color={key.color}
        intensity={key.intensity}
        castShadow={key.castShadow}
        target={target}
      />
      <primitive object={target} />
      <directionalLight name="fill-light" position={fill.position} color={fill.color} intensity={fill.intensity} />
      <directionalLight name="rim-light" position={rim.position} color={rim.color} intensity={rim.intensity} />
    </>
  )
}
