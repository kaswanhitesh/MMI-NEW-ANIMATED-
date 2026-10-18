/**
 * Loader-cache management for manifest models: warm the cache ahead of time
 * (`preloadModel`) and release GPU memory when a scene is done with a model
 * (`releaseModel`). Kept apart from `GltfModel` so that file only exports a
 * component (React fast refresh) and so scenes never import the loader directly.
 */
import { useLoader } from '@react-three/fiber'
import type { Object3D } from 'three'
import { disposeObject3D } from './dispose'
import type { ModelManifestEntry } from './types'
import { ModelLoader, configureModelLoader } from './ValidatedGLTFLoader'

/** Scene roots handed out by the loader cache, keyed by model path, so `releaseModel` can dispose them. */
const loadedScenes = new Map<string, Object3D>()

/** Called by GltfModel once a GLB has been prepared, so its GPU resources can be released later. */
export function registerLoadedScene(path: string, scene: Object3D): void {
  loadedScenes.set(path, scene)
}

/**
 * Evicts a model from the loader cache and disposes its GPU resources if it
 * had been loaded. Safe to call for models that never loaded or already were
 * released. The next GltfModel for the same entry fetches the file again.
 */
export function releaseModel(entry: ModelManifestEntry): void {
  useLoader.clear(ModelLoader, entry.path)
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
    useLoader.preload(ModelLoader, entry.path, configureModelLoader)
  } catch (error) {
    if (import.meta.env.DEV) console.warn(`[assets] ${entry.label}: preload could not start.`, error)
  }
}
