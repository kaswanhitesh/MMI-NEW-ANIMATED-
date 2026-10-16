/**
 * GltfModel — renders one manifest model from its GLB and applies the
 * manifest normalisation (scale, rotation, bounding-box fit, manual offset) so
 * the model obeys the scene convention: metres, upright, nose to −X, origin at
 * the footprint centre on the ground. It must be rendered inside <Suspense>
 * and a ModelErrorBoundary (ModelAsset does both): a missing or invalid file
 * throws through useLoader.
 *
 * The loaded GLTF belongs to React Three Fiber's loader cache, which is why
 * unmounting does not dispose it. Call `releaseModel` when a scene is done
 * with a model, and `preloadModel` to warm the cache ahead of time.
 */
import { useEffect, useMemo } from 'react'
import { useLoader } from '@react-three/fiber'
import type { Object3D } from 'three'
import { disposeObject3D } from './dispose'
import { computeNormalisationOffset, measureNormalisedBounds, prepareModelScene } from './normalise'
import type { ModelManifestEntry } from './types'
import { ValidatedGLTFLoader, configureModelLoader } from './ValidatedGLTFLoader'

/** Scene roots handed out by the loader cache, keyed by model path, so `releaseModel` can dispose them. */
const loadedScenes = new Map<string, Object3D>()

export interface GltfModelProps {
  entry: ModelManifestEntry
  /** Scene-level uniform scale multiplier (e.g. SCENE_01_CONFIG.models.scale). */
  sceneScale: number
  /** Called after commit once the scene root is on screen (and again if a different callback is supplied). */
  onLoaded?: () => void
}

export function GltfModel({ entry, sceneScale, onLoaded }: GltfModelProps) {
  const gltf = useLoader(ValidatedGLTFLoader, entry.path, configureModelLoader)
  const { normalisation } = entry

  const { scene, offset, rotation, scale } = useMemo(() => {
    const scene = gltf.scene
    loadedScenes.set(entry.path, scene)
    prepareModelScene(scene)
    const bounds = measureNormalisedBounds(scene, normalisation, sceneScale)
    const offset = computeNormalisationOffset(bounds, normalisation)
    const rotation: [number, number, number] = [normalisation.rotation[0], normalisation.rotation[1], normalisation.rotation[2]]
    return { scene, offset, rotation, scale: normalisation.scale * sceneScale }
  }, [gltf, entry.path, normalisation, sceneScale])

  useEffect(() => {
    onLoaded?.()
  }, [scene, onLoaded])

  return (
    <group position={offset}>
      <group rotation={rotation} scale={scale}>
        <primitive object={scene} />
      </group>
    </group>
  )
}

/**
 * Evicts a model from the loader cache and disposes its GPU resources if it
 * had been loaded. Safe to call for models that never loaded or already were
 * released. The next GltfModel for the same entry fetches the file again.
 */
export function releaseModel(entry: ModelManifestEntry): void {
  useLoader.clear(ValidatedGLTFLoader, entry.path)
  const scene = loadedScenes.get(entry.path)
  if (!scene) return
  loadedScenes.delete(entry.path)
  scene.removeFromParent()
  disposeObject3D(scene)
}

/**
 * Starts fetching a model into the loader cache as a side effect. Never
 * throws: a missing file only surfaces later, as the placeholder, when a
 * GltfModel for the entry mounts.
 */
export function preloadModel(entry: ModelManifestEntry): void {
  try {
    useLoader.preload(ValidatedGLTFLoader, entry.path, configureModelLoader)
  } catch (error) {
    if (import.meta.env.DEV) console.warn(`[assets] ${entry.label}: preload could not start.`, error)
  }
}
