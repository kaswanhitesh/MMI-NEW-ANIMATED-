/**
 * Contracts for the industrial environment and heavy-lift equipment of Scene 01's
 * closing sequence (industrial zone, Gemini Engi Fab factory, pressure vessels,
 * saddles, overhead crane and lifting rig). Every component built against these
 * types is a TEMPORARY procedural stand-in, authored in its own LOCAL frame and
 * placed by an environment slot (see ../environment/EnvironmentSlot.tsx), so a
 * detailed GLB can replace it without touching the scroll timeline.
 *
 * Units are metres, Y is up, angles are radians. Local frames are stated on each
 * type. Nothing here knows about the timeline: animated equipment receives a pose
 * every frame through a `getPose()` callback.
 */
import type { Vec3 } from '../assets/types'

/* -------------------------------------------------------------------------- */
/* Pressure vessels                                                           */
/* -------------------------------------------------------------------------- */

/**
 * A horizontal pressure vessel: a cylindrical shell of `courses` welded rings,
 * closed by semi-ellipsoidal heads, with nozzles, lifting lugs and saddle wear pads.
 *
 * LOCAL FRAME: the vessel axis runs along local X; x = 0 is the middle of the
 * cylindrical shell; y = 0 is the LOWEST point of the shell (so a vessel resting on
 * supports of height h is placed at y = h); z = 0 is on the axis. The axis is at
 * y = diameter / 2.
 */
export interface PressureVesselConfig {
  /** Tangent-line-to-tangent-line length of the cylindrical shell (m). */
  shellLength: number
  /** Outside diameter (m). */
  diameter: number
  /** Head depth as a fraction of the diameter (a 2:1 semi-ellipsoidal head is 0.25). */
  headDepthRatio: number
  /** Number of shell courses; circumferential weld seams sit between courses and at each head joint. */
  courses: number
  /**
   * Fabrication stage: `shell` = open-ended courses only (no heads, no nozzles, no lugs);
   * `oneHead` = head fitted at the −X end only; `complete` = both heads, nozzles and lugs.
   */
  stage: 'shell' | 'oneHead' | 'complete'
  /** Nozzles on the shell: axial position (m from the shell middle), angle around the axis (0 = top, +π/2 = +Z side), outside diameter, projection beyond the shell. */
  nozzles: ReadonlyArray<{ x: number; angle: number; diameter: number; projection: number }>
  /** Lifting lugs on top of the shell (complete vessels only): axial positions, plate height above the shell, plate thickness, pin-hole diameter. */
  lugs: { x: readonly number[]; height: number; thickness: number; holeDiameter: number }
  /** Axial positions (m from the shell middle) of the wear pads where saddles bear. */
  wearPads: readonly number[]
  colors: { shell: string; weld: string; lug: string; nozzle: string }
}

/**
 * A steel saddle (cradle) that supports a horizontal vessel.
 *
 * LOCAL FRAME: origin on the ground (or deck) under the saddle centre; local X is
 * along the vessel axis, local Z across it. The curved cradle top matches a vessel
 * of `vesselDiameter` whose lowest point is at y = `height`.
 */
export interface VesselSaddleConfig {
  /** Height of the vessel's lowest point above the saddle base (m). */
  height: number
  /** Width across the vessel axis (local Z) of the base plate (m). */
  width: number
  /** Thickness along the vessel axis (local X) (m). */
  thickness: number
  /** Included angle of the cradle contact (radians, e.g. 2.1 ≈ 120°). */
  wrapAngle: number
  vesselDiameter: number
  colors: { steel: string; pad: string }
}

/* -------------------------------------------------------------------------- */
/* Overhead crane and lifting rig                                             */
/* -------------------------------------------------------------------------- */

/**
 * A double-girder overhead travelling (EOT) crane.
 *
 * LOCAL FRAME: the runway runs along local Z; the bridge spans local X from
 * −span/2 to +span/2; y = 0 is the factory floor; the rails' top is at
 * `railHeight`. The factory renders the runway girders; this component renders the
 * bridge (two box girders, end trucks, walkway), the trolley (crab with hoist drum)
 * and the hoist (ropes + hook block), placed every frame from a `CranePose`.
 */
export interface OverheadCraneConfig {
  span: number
  railHeight: number
  bridge: { girderDepth: number; girderWidth: number; girderGap: number; endTruckLength: number; color: string; accentColor: string }
  trolley: { length: number; width: number; height: number; color: string }
  hoist: { ropeCount: number; ropeDiameter: number; ropeColor: string; blockSize: Vec3; blockColor: string; hookColor: string }
}

/** Crane state in the crane's LOCAL frame: bridge position along the runway, trolley position along the bridge, hook height. */
export interface CranePose {
  /** Local Z of the bridge centre line. */
  bridgeZ: number
  /** Local X of the trolley (and hook). */
  trolleyX: number
  /** Local Y of the hook's lowest point (where the top slings meet). */
  hookY: number
}

/**
 * Below-the-hook rigging: two top slings from the hook to the ends of a spreader
 * beam, and two vertical lower slings from the spreader ends down to the vessel's
 * lifting lugs, each ending in a shackle.
 */
export interface LiftingRigConfig {
  spreader: { length: number; depth: number; width: number; color: string }
  sling: { diameter: number; color: string; segments: number }
  shackle: { size: number; color: string }
}

/** One lower sling, in WORLD space. */
export interface SlingPose {
  /** Upper end (on the spreader beam). */
  top: Vec3
  /** Lower end: the shackle position (on the lug when attached, hanging free otherwise). */
  bottom: Vec3
  /** Metres of slack: 0 = taut and straight; > 0 = the sling sags by this much in the middle. */
  slack: number
  /** True once the shackle is pinned to the vessel's lug. */
  attached: boolean
}

/** Rig state in WORLD space, produced each frame by the scene's loading choreography. */
export interface LiftingRigPose {
  /** Hook point (where the top slings meet). */
  hook: Vec3
  /** Spreader beam centre and its yaw about Y (the beam lies along the vessel axis). */
  spreader: Vec3
  spreaderYaw: number
  lowerSlings: readonly SlingPose[]
  /** 0 = hidden (stowed), 1 = shown. The rig is hidden while the crane is parked. */
  visibility: number
}

/* -------------------------------------------------------------------------- */
/* Factory                                                                    */
/* -------------------------------------------------------------------------- */

/** A span of the factory along local X (one production bay). */
export interface FactoryBay {
  name: string
  /** Local X range of the bay between column centre lines. */
  x0: number
  x1: number
  /** Door in the front (local z = 0) gable wall: local X range and height. */
  door: { x0: number; x1: number; height: number }
  /** True if crane runway girders run along this bay's two column lines (at x0 and x1). */
  hasCrane: boolean
}

/** A fabrication fixture placed inside the factory (local frame of the factory). */
export type FabricationFixture =
  | { kind: 'turningRolls'; position: Vec3; yaw: number; length: number; vesselDiameter: number }
  | { kind: 'weldingManipulator'; position: Vec3; yaw: number; boomLength: number; columnHeight: number; boomHeight: number }
  | { kind: 'plateStack'; position: Vec3; yaw: number; size: Vec3; plates: number }
  | { kind: 'headRack'; position: Vec3; yaw: number; headDiameter: number; count: number }
  | { kind: 'plateRoller'; position: Vec3; yaw: number; width: number }

/**
 * The Gemini Engi Fab heavy-engineering factory: a two-bay steel-framed hall with
 * crane runways, high roof trusses, clad walls with a clerestory, open bay doors in
 * the front gable wall, a concrete slab with bay markings, high-bay luminaires,
 * fabrication fixtures, and its forecourt (yard apron, boundary wall with the heavy
 * vehicle entry gate, and the paved driveway across the highway verge).
 *
 * LOCAL FRAME: origin at floor level on the front (door) wall line; local −Z runs
 * into the factory, local +Z towards the road; local X across the bays. Bays and the
 * forecourt are given in this frame. Pressure vessels standing in the fabrication
 * stations are NOT part of this component (they are separate, replaceable assets).
 */
export interface GeminiFactoryConfig {
  /** Building length along −Z (m). */
  length: number
  eavesHeight: number
  parapetHeight: number
  bays: readonly FactoryBay[]
  /** Column pitch along Z on the outer walls and on the internal line(s). */
  columnPitch: number
  columnSize: number
  craneRunway: { railHeight: number; girderDepth: number; girderWidth: number }
  trusses: { spacing: number; depth: number }
  /** Clad wall band height above the floor before the clerestory glazing begins. */
  claddingHeight: number
  /**
   * Concrete slab and painted markings. `loadingZone` (optional) outlines a loading bay on the floor of bay `bay`
   * (local X range and Z range, z0 nearer the door).
   */
  floor: { color: string; markingColor: string; markingWidth: number; loadingZone?: { bay: string; x0: number; x1: number; z0: number; z1: number } }
  luminaires: { height: number; spacing: number; color: string; intensity: number }
  fixtures: readonly FabricationFixture[]
  /** Forecourt in front of the door wall (local +Z side). */
  forecourt: {
    /** Local Z of the boundary wall line (near the road). */
    wallZ: number
    x0: number
    x1: number
    wallHeight: number
    /** Heavy-vehicle entry gate: local X range of the opening in the boundary wall. */
    gate: { x0: number; x1: number; postHeight: number }
    /** Paved driveway from the gate across the highway verge: local X range and the local Z it reaches. */
    driveway: { x0: number; x1: number; toZ: number }
    color: string
  }
  colors: {
    column: string
    cladding: string
    claddingRib: string
    glazing: string
    roof: string
    truss: string
    runway: string
    door: string
    accent: string
    wall: string
    fixture: string
    fixtureAccent: string
  }
}

/* -------------------------------------------------------------------------- */
/* Industrial zone                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Industrial area along the far side of the highway between the city and the
 * factory compound: walled compounds with heavy-vehicle gates, sheds and workshops,
 * storage tanks, a few stacks, pipe racks and wide paved access roads.
 *
 * LOCAL FRAME: origin on the highway's far verge line at floor level; local X along
 * the road; local −Z away from the road. Generated from `seed` within `span`,
 * skipping `exclude` ranges (where another environment stands).
 */
export interface IndustrialZoneConfig {
  seed: number
  /** Local X range covered. */
  span: readonly [number, number]
  /** Local X ranges left empty (e.g. the factory compound). */
  exclude: ReadonlyArray<readonly [number, number]>
  compound: { width: readonly [number, number]; depth: readonly [number, number]; gap: readonly [number, number]; wallHeight: number; setback: number }
  buildings: { height: readonly [number, number]; tankChance: number; stackChance: number }
  accessRoadWidth: number
  /** Metres the access roads continue past the zone's road edge (local z = 0) towards +Z, to meet the carriageway. */
  roadReach: number
  colors: { wall: string; shed: string; roof: string; tank: string; stack: string; road: string; accent: string }
}
