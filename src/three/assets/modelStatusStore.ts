/**
 * Model status store — a minimal external store (no library) recording which
 * geometry is currently on screen for each model id: 'loading', the real
 * 'gltf', or the TEMPORARY 'placeholder' (with the reason it was substituted).
 * ModelAsset writes to it; UI such as the placeholder badge reads it through
 * the useSyncExternalStore hooks below.
 */
import { useSyncExternalStore } from 'react'
import type { ModelId, ModelStatus } from './types'

type Listener = () => void

const EMPTY: ReadonlyArray<ModelStatus> = Object.freeze([])
const statuses = new Map<ModelId, ModelStatus>()
const listeners = new Set<Listener>()
/** Stable array snapshot for useSyncExternalStore; replaced only when a status actually changes. */
let snapshot: ReadonlyArray<ModelStatus> = EMPTY

/** Records a model's status. Identical consecutive statuses are ignored, so callers may be chatty. */
export function setModelStatus(status: ModelStatus): void {
  const previous = statuses.get(status.id)
  if (previous && previous.source === status.source && previous.reason === status.reason) return

  const next: ModelStatus =
    status.reason === undefined
      ? { id: status.id, source: status.source }
      : { id: status.id, source: status.source, reason: status.reason }
  statuses.set(status.id, Object.freeze(next))
  snapshot = Object.freeze(Array.from(statuses.values()))

  for (const listener of Array.from(listeners)) listener()
}

/** Current status of one model, or undefined if nothing has reported it yet. */
export function getModelStatus(id: ModelId): ModelStatus | undefined {
  return statuses.get(id)
}

/** Every reported status, in first-reported order. The array identity only changes when a status changes. */
export function getModelStatuses(): ReadonlyArray<ModelStatus> {
  return snapshot
}

/** Subscribes to every change; returns the unsubscribe function. */
export function subscribeModelStatus(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** React hook: status of one model (undefined until it reports). */
export function useModelStatus(id: ModelId): ModelStatus | undefined {
  return useSyncExternalStore(subscribeModelStatus, () => statuses.get(id), () => statuses.get(id))
}

/** React hook: every reported status, as a stable array. */
export function useModelStatuses(): ReadonlyArray<ModelStatus> {
  return useSyncExternalStore(subscribeModelStatus, getModelStatuses, getModelStatuses)
}
