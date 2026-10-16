/**
 * MODEL MANIFEST — single source of truth for 3D asset locations and normalisation.
 *
 * To add the real models, drop the GLB files at the paths below (relative to
 * `public/`) — nothing else in the application needs to change:
 *
 *   public/models/puller-truck.glb
 *   public/models/hydraulic-axle-trailer.glb
 *
 * Until a file exists (or if it fails to parse) the scene substitutes a clearly
 * labelled TEMPORARY placeholder built from procedural geometry. See
 * docs/MODEL-REPLACEMENT-CHECKLIST.md for the full hand-over procedure.
 *
 * The `normalisation` block is where you compensate for whatever scale, origin,
 * orientation and pivot the delivered model actually has. The animation
 * timeline never needs to change for that — only this file.
 */
import type { ModelId, ModelManifestEntry } from './types'

/** Base URL for model files. Honours Vite's `base` so sub-path deployments keep working. */
export const MODEL_BASE_PATH = `${import.meta.env.BASE_URL}models/`

export const MODEL_MANIFEST: Readonly<Record<ModelId, ModelManifestEntry>> = {
  'puller-truck': {
    id: 'puller-truck',
    label: 'Puller truck',
    path: `${MODEL_BASE_PATH}puller-truck.glb`,
    // Nominal envelope for placeholder sizing only — not a real vehicle specification.
    footprint: { length: 9.5, width: 2.9, height: 3.9 },
    normalisation: {
      scale: 1,
      rotation: [0, 0, 0],
      offset: [0, 0, 0],
      alignBottomToGround: true,
      centreFootprint: true,
    },
    anchors: {
      // Fifth-wheel / coupling plate, measured from the footprint centre. +X = rear of the puller.
      coupling: [4.0, 1.3, 0],
    },
  },
  'hydraulic-axle-trailer': {
    id: 'hydraulic-axle-trailer',
    label: 'Hydraulic axle trailer',
    path: `${MODEL_BASE_PATH}hydraulic-axle-trailer.glb`,
    // Nominal envelope for placeholder sizing only — not a real trailer specification.
    footprint: { length: 18, width: 3.0, height: 1.9 },
    normalisation: {
      scale: 1,
      rotation: [0, 0, 0],
      offset: [0, 0, 0],
      alignBottomToGround: true,
      centreFootprint: true,
    },
    anchors: {
      // Front connection point on the gooseneck, measured from the footprint centre. −X = front of the trailer.
      coupling: [-8.3, 1.3, 0],
    },
  },
}

export const MODEL_IDS = Object.keys(MODEL_MANIFEST) as ModelId[]

export function getModelEntry(id: ModelId): ModelManifestEntry {
  const entry = MODEL_MANIFEST[id]
  if (!entry) throw new Error(`Unknown model id "${id}". Register it in src/three/assets/modelManifest.ts.`)
  return entry
}
