/**
 * Public API of the asset loading layer. Scenes import from here only:
 * `ModelAsset` places a model, `preloadModel` / `releaseModel` manage the
 * loader cache, the status functions and hooks report which geometry is on
 * screen, and the manifest helpers resolve model entries.
 */
export { ModelAsset, type ModelAssetProps } from './ModelAsset'
export { preloadModel, releaseModel } from './modelCache'
export {
  getModelStatus,
  getModelStatuses,
  setModelStatus,
  subscribeModelStatus,
  useModelStatus,
  useModelStatuses,
} from './modelStatusStore'
export { getModelEntry, MODEL_BASE_PATH, MODEL_IDS, MODEL_MANIFEST } from './modelManifest'
export { ModelLoadError, ModelLoader, getModelLoadErrorMessage, type ModelLoadErrorCode, type ModelLoadResult } from './ValidatedGLTFLoader'
export type { ModelFootprint, ModelId, ModelManifestEntry, ModelNormalisation, ModelSource, ModelStatus, Vec3 } from './types'
