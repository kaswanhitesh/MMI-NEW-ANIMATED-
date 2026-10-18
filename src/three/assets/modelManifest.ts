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
    // Measured from public/models/puller-truck.glb — the 6x4 ballast tractor built in art/blender/mmi-tractor-detailed.blend
    // (length nose to rear hitch; width over the mirrors; height to the roof deflector). Also sizes the placeholder.
    footprint: { length: 7.72, width: 3.36, height: 3.96 },
    normalisation: {
      scale: 1,
      rotation: [0, 0, 0],
      offset: [0, 0, 0],
      alignBottomToGround: true,
      centreFootprint: true,
    },
    anchors: {
      // Rear drawbar hitch pin (Rockinger-type 50 mm hitch, the `mmi_tractor_coupling_jaw` pivot node), after
      // normalisation (the GLB's bbox centre is x +0.21). The trailer's towing eye is brought onto this pin.
      coupling: [3.74, 0.8, 0],
      // Front hitch pin (the `mmi_tractor_front_coupling` pivot node).
      frontHitchPin: [-3.74, 0.5, 0],
    },
  },
  'hydraulic-axle-trailer': {
    id: 'hydraulic-axle-trailer',
    label: 'Hydraulic axle trailer',
    path: `${MODEL_BASE_PATH}hydraulic-axle-trailer.glb`,
    // Measured from public/models/hydraulic-axle-trailer.glb — two 6-line modular platform modules (1.5 m axle pitch,
    // 3.0 m wide, deck top 1.2 = loading.cargo.trailerDeckTop) with a 2.78 m A-frame towbar; length is eye to tail.
    // Built in art/blender/mmi-tractor-detailed.blend, scene MMI_Trailer_Modular.
    // Length is eye to the rear power pack; height to the power pack's breather pipe.
    footprint: { length: 22.43, width: 3.04, height: 1.47 },
    normalisation: {
      scale: 1,
      rotation: [0, 0, 0],
      offset: [0, 0, 0],
      alignBottomToGround: true,
      centreFootprint: true,
    },
    anchors: {
      // Towing eye centre at the tip of the A-frame towbar (`trailer_towbar` is the towbar's pivot node on the headboard),
      // after normalisation (the GLB's bbox centre is x +0.43 because the power pack hangs behind the end plate). The
      // deck and 12-line axle group are centred on x 0.94 (= loading.cargo.deckOffset), so eye → axles = 12.08 =
      // departure.trailerTrackingLength. −X = front of the trailer.
      coupling: [-11.14, 0.8, 0],
    },
  },
}

export const MODEL_IDS = Object.keys(MODEL_MANIFEST) as ModelId[]

export function getModelEntry(id: ModelId): ModelManifestEntry {
  const entry = MODEL_MANIFEST[id]
  if (!entry) throw new Error(`Unknown model id "${id}". Register it in src/three/assets/modelManifest.ts.`)
  return entry
}
