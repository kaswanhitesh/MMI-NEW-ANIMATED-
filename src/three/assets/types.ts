/**
 * Asset-layer contracts.
 *
 * These types describe the 3D model manifest: where each GLB lives, how it must
 * be normalised into the scene's coordinate system, and the named anchor points
 * the animation layer uses to align objects.
 *
 * COORDINATE SYSTEM (see docs/COORDINATE-SYSTEM.md)
 * ------------------------------------------------
 *  - Units: metres. 1 world unit = 1 metre.
 *  - Y is up. The ground plane is y = 0 (see `SCENE_01_CONFIG.world.groundY`).
 *  - X is the longitudinal (travel) axis of every vehicle.
 *  - VEHICLE NOSE POINTS TOWARDS −X (screen left). A vehicle's coupling /
 *    connection faces +X. The puller enters from −X (left) and reverses towards
 *    +X; the trailer enters from +X (right) with its front connection facing −X.
 *  - Z points towards the camera (positive Z = nearer the viewer).
 *  - Every model's local origin, AFTER normalisation, is the centre of its
 *    footprint at ground level: x = 0 and z = 0 at the footprint centre, y = 0
 *    at the lowest point (tyre contact patch).
 */

/** Immutable 3-component vector in metres (x, y, z). */
export type Vec3 = readonly [x: number, y: number, z: number]

/** Identifiers of every model the site knows about. Extend this union when a new model is added. */
export type ModelId = 'puller-truck' | 'hydraulic-axle-trailer'

/**
 * Describes how a raw GLB (whatever scale / orientation / pivot it was exported
 * with) is brought into the scene convention above. Applied in this order:
 *   1. `scale`   – uniform scale so that 1 unit = 1 metre.
 *   2. `rotation`– Euler XYZ (radians) so the nose faces −X and the model is upright.
 *   3. automatic bounding-box fit (`alignBottomToGround`, `centreFootprint`).
 *   4. `offset`  – final manual translation in metres for pivot corrections.
 */
export interface ModelNormalisation {
  scale: number
  rotation: Vec3
  offset: Vec3
  /** Measure the model after scale/rotation and shift it so its lowest point sits at y = 0. */
  alignBottomToGround: boolean
  /** Centre the measured bounding box on x = 0 / z = 0 so the local origin is the footprint centre. */
  centreFootprint: boolean
}

/** Expected real-world envelope of a model in metres. Length is along X, width along Z, height along Y. */
export interface ModelFootprint {
  length: number
  width: number
  height: number
}

export interface ModelManifestEntry {
  id: ModelId
  /** Human-readable label used by status overlays and development diagnostics. */
  label: string
  /** Public URL the GLB is fetched from. Files live in `public/models/`; see public/models/README.md. */
  path: string
  /**
   * Nominal envelope used to size the TEMPORARY placeholder geometry and for
   * development diagnostics. It is an approximation for layout purposes only
   * and is NOT a claim about the dimensions of any real vehicle or final model.
   */
  footprint: ModelFootprint
  normalisation: ModelNormalisation
  /**
   * Named anchor points in the model's normalised local space (metres).
   * `coupling` is mandatory for vehicles that take part in Scene 01: for the
   * puller it is the fifth-wheel / coupling plate; for the trailer it is the
   * front connection (gooseneck) point. The timeline aligns these anchors at
   * the configured coupling point.
   */
  anchors: Readonly<Record<'coupling', Vec3>> & Readonly<Record<string, Vec3>>
}

/** Which geometry is currently on screen for a given model. */
export type ModelSource = 'loading' | 'gltf' | 'placeholder'

export interface ModelStatus {
  id: ModelId
  source: ModelSource
  /** Populated when the GLB could not be used and the placeholder was substituted. */
  reason?: string
}
