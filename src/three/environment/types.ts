/**
 * Scene-agnostic lighting and environment settings consumed by the engine's
 * environment components. Scene configs provide these blocks.
 *
 * ENVIRONMENT SLOTS
 * -----------------
 * Every large environment (garage, road, highway, city) lives in its own
 * named, replaceable SLOT: a group with a world transform, a reserved bounding
 * box, and an optional GLB that replaces the procedural placeholder. The
 * placeholder geometry of each environment is authored in its slot's LOCAL
 * space, so moving or rotating a slot moves everything that belongs to it
 * (the garage's wall sign included). See `EnvironmentSlot.tsx`.
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

/** A detailed GLB that replaces an environment's procedural placeholder. */
export interface EnvironmentModelConfig {
  /** Public URL of the GLB, e.g. `${MODEL_BASE_PATH}environment/garage.glb`. */
  url: string
  /** Uniform scale that brings the file to metres. */
  scale: number
  /** Placement of the model inside its slot (slot-local metres). */
  position: Vec3
  /** Euler XYZ rotation (radians) of the model inside its slot. */
  rotation: Vec3
  castShadow: boolean
  receiveShadow: boolean
  /**
   * Repeats the model: one copy per entry, placed in slot-local metres with a yaw about Y (e.g. a city block tiled
   * along the road). `position` / `rotation` / `scale` above apply inside every copy. Omitted = one copy at the slot
   * origin. Copies share geometry and materials.
   */
  instances?: ReadonlyArray<{ position: Vec3; rotationY: number }>
  /**
   * Bake the node transforms and merge every mesh that shares a material (and vertex layout) into ONE mesh when the
   * model loads: one draw call per material instead of one per node. Static scenery only — animation, per-node
   * visibility and multi-material meshes are not merged (the latter are kept as they are).
   */
  mergeByMaterial?: boolean
}

/**
 * Where an environment sits and how it can be replaced. `position` /
 * `rotationY` place the slot's local origin in the world; `bounds` is the
 * slot-local box reserved for the environment (a replacement model should fit
 * inside it; `showSlotBounds` draws it); `model` swaps the procedural
 * placeholder for a GLB without touching the vehicle rig or the timeline.
 */
export interface EnvironmentSlotConfig {
  position: Vec3
  /** Rotation about Y (radians). */
  rotationY: number
  bounds: { min: Vec3; max: Vec3 }
  /** null = render the procedural placeholder (no network request). */
  model: EnvironmentModelConfig | null
}

export interface YardEnvironmentConfig {
  /**
   * Scene background AND enclosed-yard fog colour. They must be one value: the
   * floor fades into the fog, and the fog must match what the renderer clears
   * to, or the floor's far edge shows as a line across the horizon.
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
  contactShadow: { opacity: number; blur: number; width: number; height: number; far: number; resolution: number }
  /** Debugging aid (any build, keep false in production): draw every environment slot's reserved bounds as a wireframe box. */
  showSlotBounds: boolean
  /** Open-air daylight (sky, haze, ground tone) the scene blends to as the vehicle leaves the yard. */
  atmosphere: AtmosphereConfig
  /** The MMI fleet garage: building, forecourt apron and wall sign. */
  garage: FleetGarageConfig
  /** Paved exit road from the garage apron to the highway (outline derived from the vehicle's departure path). */
  road: AccessRoadConfig
  /** Highway the combination departs onto. */
  highway: HighwayConfig
  /** City-edge backdrop beyond the garage for the closing journey. */
  city: CityConfig
}

/** Daylight the scene's fog, sky and ground blend to. Not a replaceable model: it is lighting. */
export interface AtmosphereConfig {
  /** Camera-centred gradient sky dome; it fades in with the daylight. */
  sky: { zenith: string; horizon: string; radius: number }
  /** Daylight haze the scene fog blends to (colour and camera depths in metres). */
  haze: { color: string; near: number; far: number }
  /** Colour the yard/ground blends to in daylight. */
  groundColor: string
}

/** A randomised band of buildings: positions and sizes are drawn from these ranges with a seeded generator. */
export interface CityBuildingBand {
  /** Slot-local Z range (m) of the band's building fronts; more negative = further from the road. */
  zRange: readonly [number, number]
  width: readonly [number, number]
  depth: readonly [number, number]
  height: readonly [number, number]
  /** Gap between neighbouring buildings along X (m). */
  gap: readonly [number, number]
  /** Slot-local X range of this band; the city's `span` when omitted (e.g. near bands that stop where an industrial area begins). */
  span?: readonly [number, number]
}

/**
 * Procedural city-edge stand-in seen beyond the garage and the highway: low
 * industrial sheds, a band of mid-rise blocks and a distant skyline of towers.
 * Boxes only, drawn through one InstancedMesh per material; a seeded generator
 * keeps it identical on every load. Opaque and always present: the scene's
 * fog hides it in the enclosed-yard atmosphere and the daylight haze reveals it.
 */
export interface CityConfig {
  enabled: boolean
  slot: EnvironmentSlotConfig
  seed: number
  /** Slot-local X range (m) the city covers: the whole travel plus the widest view. */
  span: readonly [number, number]
  /**
   * Slot-local X where the detailed city model (`slot.model`) ends, when it covers only part of `span`. The procedural
   * bands beyond it are always drawn (with or without the model, see `splitCity`), so the city never stops in mid-air;
   * the stand-in itself covers only the part the model replaces. Omitted = the model replaces the whole span.
   */
  modelEnd?: number
  skyline: CityBuildingBand & { landmarkChance: number; landmarkHeight: readonly [number, number] }
  midrise: CityBuildingBand
  industrial: CityBuildingBand & { stackChance: number; stackHeight: readonly [number, number] }
  colors: { glass: string; concrete: string; steel: string; industrial: string; roof: string }
}

/**
 * A straight two-way highway along its slot's local X axis, centred on local
 * z = 0: asphalt carriageway with a procedural grain, dashed centre line,
 * solid edge lines, shoulders, verges and street lights on the far verge.
 * Local −Z is the far side (towards the garage). All dimensions in metres.
 */
export interface HighwayConfig {
  enabled: boolean
  slot: EnvironmentSlotConfig
  /** Length along local X. */
  length: number
  lanes: number
  laneWidth: number
  shoulderWidth: number
  vergeWidth: number
  markings: { dashLength: number; dashGap: number; lineWidth: number; edgeLineInset: number }
  colors: { asphalt: string; shoulder: string; verge: string; centreLine: string; edgeLine: string }
  /** Strength of the procedural asphalt grain, 0 (flat colour) to 1. */
  grain: number
  /**
   * Street lights on the far verge, arms reaching over the shoulder. None stand inside the `exclude` ranges (local X):
   * e.g. the stretch in front of the garage, where a pole would stand between the camera and the vehicles, or a
   * site entrance a vehicle turns through.
   */
  streetLights: { enabled: boolean; spacing: number; height: number; armLength: number; exclude: ReadonlyArray<readonly [number, number]>; color: string }
}

/** Paved exit road between the garage apron and the highway's far carriageway edge. */
export interface AccessRoadConfig {
  enabled: boolean
  /** Its placeholder outline is derived in WORLD space from the departure path and mapped into this slot. */
  slot: EnvironmentSlotConfig
  /** Road width (m), centred on the puller's path; covers the trailer's swept path. */
  width: number
  /** Metres the road runs on past the apron kerb and into the carriageway at either end; it lies ON them (LIFT.exitRoad), hiding the joints. */
  overlap: number
  color: string
  /** Strength of the procedural asphalt grain, 0 (flat colour) to 1. */
  grain: number
}

/** One stationary unit parked inside the garage. `x` is slot-local, `depth` is metres into the hall. */
export interface GarageFleetUnit {
  kind: 'puller' | 'trailer' | 'lowbed'
  x: number
  depth: number
  /** Yaw in radians. 0 = parallel to the facade (nose to −X); +π/2 = nose towards the camera. */
  rotationY: number
}

/** A floor zone inside the hall: `position` = [slot-local x, 0, depth into the hall], `size` = [width, length]. */
export interface GarageZone {
  kind: 'inspection' | 'pit'
  position: Vec3
  size: readonly [number, number]
}

/**
 * The company sign mounted on the garage's branding wall: a framed board on
 * stand-off brackets, lettering drawn from `text`, and gooseneck lamps above.
 * Slot-local: `centre` is on the facade plane (z = 0); the board stands
 * `standoff` metres in front of it.
 */
export interface BrandSignConfig {
  enabled: boolean
  /** The exact company name. Rendered verbatim (no logo). */
  text: string
  /** [x along the facade, height above ground] of the board's centre, slot-local metres. */
  centre: readonly [x: number, y: number]
  width: number
  height: number
  /** Board thickness (m). */
  depth: number
  /** Gap between the wall and the back of the board (m). */
  standoff: number
  /** CSS font stack for the lettering; `var(--name)` reads a custom property from the document. */
  fontFamily: string
  fontWeight: number
  /** Extra space between letters, as a fraction of the letter height. */
  letterSpacing: number
  colors: { face: string; text: string; border: string; frame: string; bracket: string; accent: string; lamp: string }
  /** Gooseneck floodlights above the board. */
  lamps: { count: number; intensity: number }
  /**
   * How strongly the floodlights light the face (emissive strength of the lettered face, 0 = lit by the scene only).
   * Keeps the lettering legible in a dim yard or in fog without a real light source.
   */
  floodlight: number
}

/**
 * A bounded steel-framed heavy-haul hall built from boxes, in slot-local
 * metres: the facade's front plane is local z = 0, the hall extends to −Z, its
 * forecourt APRON to +Z. From `building.left` to `bays.start` the facade is a
 * clean, full-height BRANDING WALL; then `bays.count` open service bays with
 * rolled-door housings between structural columns; then a short pier to
 * `building.right`. End walls, a parapet roofline, drive-through openings in
 * the back wall (aligned with the front bays), interior column rows, roof
 * trusses, luminaires, inspection zones and a parked fleet complete it.
 */
export interface FleetGarageConfig {
  enabled: boolean
  slot: EnvironmentSlotConfig
  /** Fraction (0–1) of the vehicles' approach phase at which the fade-in starts; it completes when they arrive. */
  fadeStartPortion: number
  building: { left: number; right: number; depth: number; eavesHeight: number; parapetHeight: number }
  bays: {
    /** Slot-local X where the first bay begins (the branding wall ends here). */
    start: number
    count: number
    pitch: number
    openingHeight: number
    /** Drive-through openings in the back wall behind each bay (the city shows through them in daylight). */
    rear: { open: boolean; height: number }
  }
  columns: { size: number; interiorRows: readonly number[] }
  trusses: { spacing: number; topChordHeight: number; bottomChordHeight: number; diagonalPitch: number; purlinPitch: number }
  luminaires: { height: number; rowSpacing: number; spacing: number; length: number }
  /** Spacing of the vertical corrugation ribs on the clad facade and end walls. */
  ribPitch: number
  /** Horizontal panel joints on the branding wall (heights above ground, m). */
  brandWallJoints: readonly number[]
  /** Concrete forecourt in front of the facade, bounded by a kerb along its front edge. */
  apron: {
    /** Slot-local Z of the front edge (the kerb). */
    front: number
    left: number
    right: number
    color: string
    /** Apron colour in full daylight. */
    daylightColor: string
    kerb: { width: number; height: number; color: string }
  }
  sign: BrandSignConfig
  zones: readonly GarageZone[]
  fleet: readonly GarageFleetUnit[]
  colors: {
    bollard: string
    frontColumn: string
    doorHead: string
    bayLight: string
    cladding: string
    rib: string
    fascia: string
    brandWall: string
    plinth: string
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
