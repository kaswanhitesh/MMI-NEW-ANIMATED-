/**
 * Scene-agnostic lighting and environment settings consumed by
 * `StageLighting` and `YardFloor`. Scene configs provide these blocks.
 * All positions are ABSOLUTE world positions in metres.
 */
import type { Vec3 } from '../assets/types'

export interface StageLightingConfig {
  hemisphere: { skyColor: string; groundColor: string; intensity: number }
  key: {
    position: Vec3
    color: string
    intensity: number
    castShadow: boolean
    shadowMapSize: number
    /** Half-extent (m) of the orthographic shadow frustum around the assembly area. */
    shadowExtent: number
    shadowBias: number
    shadowNormalBias: number
    /** PCF sampling radius in shadow-map texels; softens the shadow edge (three r186 PCF uses a Vogel disk). */
    shadowRadius: number
  }
  fill: { position: Vec3; color: string; intensity: number }
  rim: { position: Vec3; color: string; intensity: number }
  /** Strength of the procedural image-based environment (RoomEnvironment). */
  environmentIntensity: number
  toneMappingExposure: number
}

export interface YardEnvironmentConfig {
  /**
   * Scene background AND fog colour. They must be one value: the floor fades
   * into the fog, and the fog must match what the renderer clears to, or the
   * floor's far edge shows as a line across the horizon.
   */
  backgroundColor: string
  /**
   * Fog camera depths (m) tuned for landscape viewports. On narrow viewports,
   * where the responsive camera backs off much further, the scene pushes the
   * band out so the vehicles never sit inside it (see Scene 01's stage/fogDepths.ts).
   */
  fog: { near: number; far: number }
  /** `envMapIntensity` limits how much the floor reflects the environment at grazing angles (keeps the far floor from brightening). */
  floor: { size: number; color: string; roughness: number; metalness: number; envMapIntensity: number }
  /** Subtle painted yard markings on the floor — restrained environmental detail. */
  markings: { color: string; opacity: number; laneHalfWidth: number; length: number; stripeLength: number; stripeGap: number }
  contactShadow: { opacity: number; blur: number; width: number; height: number; far: number }
  /** Procedural industrial warehouse behind the yard; its opacity is driven by the scene's animation rig. */
  warehouse: WarehouseConfig
}

/**
 * A large, restrained logistics warehouse facade built from boxes (precast
 * wall with panel seams and pilasters, raised loading dock with dock doors,
 * bumpers and strip lights, canopy, clerestory band, fascia, roof slab).
 * All dimensions in metres. The facade's front plane is at `position[2]` and
 * the building extends towards −Z; `position[1]` is ignored (it stands on the
 * scene's ground plane).
 */
export interface WarehouseConfig {
  enabled: boolean
  /** Fraction (0–1) of the vehicles' approach phase at which the fade-in starts; it completes when they arrive. */
  fadeStartPortion: number
  position: Vec3
  width: number
  height: number
  depth: number
  dock: { height: number; depth: number }
  bays: { count: number; pitch: number; doorWidth: number; doorHeight: number }
  canopy: { height: number; depth: number; thickness: number }
  /** Spacing of the vertical precast panel seams along the wall. */
  panelSeamPitch: number
  colors: {
    wall: string
    fascia: string
    plinth: string
    pilaster: string
    door: string
    frame: string
    seam: string
    bumper: string
    canopy: string
    roof: string
    clerestory: string
    lightStrip: string
  }
  /** Emissive strength of the strip lights above the dock doors (0 = off). */
  lightStripIntensity: number
}
