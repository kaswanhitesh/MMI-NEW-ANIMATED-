/**
 * ModelAsset — the ONLY component scenes use to place a manifest model.
 * It resolves the manifest entry, loads the GLB through GltfModel inside
 * Suspense + ModelErrorBoundary, keeps the model status store current and
 * shows the supplied TEMPORARY placeholder geometry while loading or whenever
 * the file is missing or invalid. A load failure never crashes the canvas; in
 * development it is reported once per model id with console.warn.
 */
import { Suspense, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { GltfModel } from './GltfModel'
import { ModelErrorBoundary } from './ModelErrorBoundary'
import { getModelEntry } from './modelManifest'
import { setModelStatus } from './modelStatusStore'
import type { ModelId } from './types'
import { getModelLoadErrorMessage } from './ValidatedGLTFLoader'

/** Model ids already reported in this session, so a failure is logged once even across remounts. */
const warnedModelIds = new Set<ModelId>()

export interface ModelAssetProps {
  id: ModelId
  /** Scene-level uniform scale multiplier (e.g. SCENE_01_CONFIG.models.scale). */
  sceneScale: number
  /** TEMPORARY placeholder geometry rendered while loading and when the GLB is unavailable. */
  placeholder: ReactNode
}

export function ModelAsset({ id, sceneScale, placeholder }: ModelAssetProps) {
  const entry = getModelEntry(id)

  // The id that already reached a terminal status ('gltf' / 'placeholder') in this instance.
  // Child effects and componentDidCatch run BEFORE this component's mount effect, so a cached
  // model (or a cached failure) would otherwise be overwritten with 'loading'.
  const settledFor = useRef<ModelId | null>(null)

  const handleLoaded = useCallback(() => {
    settledFor.current = id
    setModelStatus({ id, source: 'gltf' })
  }, [id])

  const handleError = useCallback(
    (error: unknown) => {
      const reason = getModelLoadErrorMessage(error)
      settledFor.current = id
      setModelStatus({ id, source: 'placeholder', reason })
      if (import.meta.env.DEV && !warnedModelIds.has(id)) {
        warnedModelIds.add(id)
        console.warn(`[assets] ${entry.label}: ${reason} — rendering TEMPORARY placeholder geometry.`)
      }
    },
    [id, entry.label],
  )

  useEffect(() => {
    if (settledFor.current !== id) setModelStatus({ id, source: 'loading' })
  }, [id])

  return (
    <ModelErrorBoundary modelId={id} fallback={placeholder} onError={handleError}>
      <Suspense fallback={placeholder}>
        <GltfModel entry={entry} sceneScale={sceneScale} onLoaded={handleLoaded} />
      </Suspense>
    </ModelErrorBoundary>
  )
}
