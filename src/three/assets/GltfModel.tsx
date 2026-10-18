/**
 * GltfModel — renders one manifest model from its GLB and applies the
 * manifest normalisation (scale, rotation, bounding-box fit, manual offset) so
 * the model obeys the scene convention: metres, upright, nose to −X, origin at
 * the footprint centre on the ground. It must be rendered inside <Suspense>
 * (ModelAsset does that). A missing or invalid file is an expected outcome:
 * the loader resolves it as `unavailable` and this component renders the
 * supplied TEMPORARY placeholder instead, reporting the reason through
 * `onUnavailable`. Only unexpected exceptions throw to the error boundary.
 *
 * The loaded GLTF belongs to React Three Fiber's loader cache, which is why
 * unmounting does not dispose it — see ./modelCache.ts.
 */
import { useLoader } from '@react-three/fiber'
import { useEffect, useMemo, type ReactNode } from 'react'
import { registerLoadedScene } from './modelCache'
import { computeNormalisationOffset, measureNormalisedBounds, prepareModelScene } from './normalise'
import type { ModelManifestEntry } from './types'
import { ModelLoader, configureModelLoader, type ModelLoadError } from './ValidatedGLTFLoader'

export interface GltfModelProps {
  entry: ModelManifestEntry
  /** Scene-level uniform scale multiplier (e.g. SCENE_01_CONFIG.models.scale). */
  sceneScale: number
  /** TEMPORARY placeholder geometry rendered when the GLB is unavailable. */
  placeholder: ReactNode
  /** Called after commit once the real model is on screen. */
  onLoaded?: () => void
  /** Called after commit when the file could not be used and the placeholder is showing. */
  onUnavailable?: (error: ModelLoadError) => void
}

export function GltfModel({ entry, sceneScale, placeholder, onLoaded, onUnavailable }: GltfModelProps) {
  const result = useLoader(ModelLoader, entry.path, configureModelLoader)
  const gltf = result.status === 'loaded' ? result.gltf : null
  const error = result.status === 'unavailable' ? result.error : null
  const { normalisation } = entry

  const prepared = useMemo(() => {
    if (!gltf) return null
    const scene = gltf.scene
    registerLoadedScene(entry.path, scene)
    prepareModelScene(scene)
    const bounds = measureNormalisedBounds(scene, normalisation, sceneScale)
    const offset = computeNormalisationOffset(bounds, normalisation)
    const rotation: [number, number, number] = [normalisation.rotation[0], normalisation.rotation[1], normalisation.rotation[2]]
    return { scene, offset, rotation, scale: normalisation.scale * sceneScale }
  }, [gltf, entry.path, normalisation, sceneScale])

  useEffect(() => {
    if (prepared) onLoaded?.()
  }, [prepared, onLoaded])

  useEffect(() => {
    if (error) onUnavailable?.(error)
  }, [error, onUnavailable])

  if (!prepared) return <>{placeholder}</>

  return (
    <group position={prepared.offset}>
      <group rotation={prepared.rotation} scale={prepared.scale}>
        <primitive object={prepared.scene} />
      </group>
    </group>
  )
}
