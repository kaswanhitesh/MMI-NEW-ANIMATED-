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
  /** Procedural heavy-haul fleet garage behind the yard; its opacity is driven by the scene's animation rig. */
  garage: FleetGarageConfig
}

/** One stationary unit parked inside the garage. `x` is relative to the facade centre, `depth` is metres into the hall. */
export interface GarageFleetUnit {
  kind: 'puller' | 'trailer' | 'lowbed'
  x: number
  depth: number
  /** Yaw in radians. 0 = parallel to the facade (nose to −X); +π/2 = nose towards the camera. */
  rotationY: number
}

/** A floor zone inside the hall: `position` = [x from facade centre, 0, depth into the hall], `size` = [width, length]. */
export interface GarageZone {
  kind: 'inspection' | 'pit'
  position: Vec3
  size: readonly [number, number]
}

/**
 * A long steel-framed heavy-haul assembly hall built from boxes: open service
 * bays with rolled-door housings between structural columns, closed sectional
 * doors in the end bays, corrugated cladding above, concrete slab, interior
 * column rows, roof trusses, ceiling luminaires, inspection zones and a parked
 * fleet. All dimensions in metres. The facade's front plane is at
 * `position[2]`; the hall extends towards −Z; `position[1]` is ignored (it
 * stands on the scene's ground plane).
 */
export interface FleetGarageConfig {
  enabled: boolean
  /** Fraction (0–1) of the vehicles' approach phase at which the fade-in starts; it completes when they arrive. */
  fadeStartPortion: number
  position: Vec3
  width: number
  depth: number
  eavesHeight: number
  bays: { count: number; pitch: number; openingHeight: number; openBays: readonly number[] }
  columns: { size: number; interiorRows: readonly number[] }
  trusses: { spacing: number; topChordHeight: number; bottomChordHeight: number; diagonalPitch: number; purlinPitch: number }
  luminaires: { height: number; rowSpacing: number; spacing: number; length: number }
  /** Spacing of the vertical corrugation ribs on the facade cladding. */
  ribPitch: number
  zones: readonly GarageZone[]
  fleet: readonly GarageFleetUnit[]
  colors: {
    bollard: string
    frontColumn: string
    doorHead: string
    closedDoor: string
    bayLight: string
    cladding: string
    rib: string
    fascia: string
    fleetPaint: string
    fleetSteel: string
    interiorColumn: string
    sleeve: string
    truss: string
    luminaire: string
    accentLine: string
    zone: string
    pit: string
    slab: string
    girt: string
    backWall: string
  }
  lightIntensity: { bay: number; luminaire: number }
}
