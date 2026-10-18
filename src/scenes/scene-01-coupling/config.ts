/**
 * SCENE 01 — "Puller truck connects to hydraulic axle trailer"
 * =============================================================
 * CENTRAL CONFIGURATION. Every coordinate, timing and tuning value for the
 * scene lives here. Components and the GSAP timeline read from this object —
 * they must not hard-code their own numbers.
 *
 * Coordinate system (full description in docs/COORDINATE-SYSTEM.md):
 *   - metres, Y up, ground plane at `world.groundY`
 *   - X = longitudinal axis. Vehicle noses point to −X (screen left),
 *     couplings face +X. Puller enters from −X, trailer from +X.
 *   - Z = towards the camera.
 *
 * Final (connected) positions are DERIVED from `assembly.couplingPoint` and the
 * models' `coupling` anchors in the model manifest, so that the two anchors
 * meet exactly. If you need to override a final position by hand, set
 * `positions.pullerFinal` / `positions.trailerFinal` to an explicit Vec3 —
 * the layout resolver then uses that and emits a development warning if the
 * anchors no longer meet. See `layout.ts`.
 */
import type { ModelId, Vec3 } from '../../three/assets/types'
import type { CameraFraming, FramedCameraSpec } from '../../three/camera/types'
import type { RenderingConfig } from '../../three/canvas/types'
import type { BrandSignConfig, EnvironmentModelConfig, EnvironmentSlotConfig, StageLightingConfig, YardEnvironmentConfig } from '../../three/environment/types'
import type {
  GeminiFactoryConfig,
  IndustrialZoneConfig,
  LiftingRigConfig,
  OverheadCraneConfig,
  PressureVesselConfig,
  VesselSaddleConfig,
} from '../../three/industrial/types'

export type Scene01PhaseName =
  | 'initial'
  | 'approach'
  | 'couplingHold'
  | 'establish'
  | 'departure'
  | 'highwayHold'
  | 'city'
  | 'cityHold'
  | 'industrial'
  | 'factoryEntry'
  | 'parking'
  | 'craneApproach'
  | 'rigging'
  | 'lift'
  | 'transfer'
  | 'lowering'
  | 'release'
  | 'loadedHold'

/** Named camera framings, in the order the camera stage walks through them. */
export type Scene01CameraFraming = 'base' | 'heroHold' | 'wide' | 'highway' | 'city' | 'entry' | 'doorway' | 'loading' | 'lift'

/** A pressure vessel standing in a fabrication station (a separate, replaceable workpiece). */
export interface FabricationWorkpiece {
  name: string
  vessel: PressureVesselConfig
  /** Position of the vessel's local origin (shell middle, lowest point) in the workpieces slot's frame. */
  position: Vec3
  /** Yaw about Y (radians); 0 = vessel axis along the slot's X. */
  yaw: number
}

export interface PhaseWindow {
  /** Timeline progress (0–1) where the phase starts. */
  start: number
  /** Timeline progress (0–1) where the phase ends. Must equal the next phase's `start`. */
  end: number
}

export interface Scene01Config {
  id: 'scene-01-coupling'
  world: {
    /** Y coordinate of the common floor plane every vehicle is grounded on. */
    groundY: number
  }
  models: {
    puller: ModelId
    trailer: ModelId
    /** Scene-level uniform scale multiplier applied on top of each model's manifest normalisation. Keep at 1 unless the whole scene must be resized. */
    scale: number
  }
  assembly: {
    /** World-space point where the puller's coupling anchor and the trailer's coupling anchor meet. */
    couplingPoint: Vec3
    /** Longitudinal clearance (m) left between the two anchors in the connected state. 0 = anchors coincide. */
    connectedGap: number
    /** Warn in development when the anchors' heights differ by more than this (m) — a hint that model normalisation is off. */
    anchorHeightTolerance: number
  }
  positions: {
    /** Puller start (Phase A). Off-screen / at the left edge. */
    pullerStart: Vec3
    /** Trailer start (Phase A). Off-screen / at the right edge. */
    trailerStart: Vec3
    /** Explicit override for the puller's final position. `null` = derive from the coupling point (recommended). */
    pullerFinal: Vec3 | null
    /** Explicit override for the trailer's final position. `null` = derive from the coupling point (recommended). */
    trailerFinal: Vec3 | null
  }
  /**
   * Camera: `target` ≈ centre of the coupled combination. Framings in sequence order: `base` (approach),
   * `heroHold` (push-in while coupled), `wide` (establishing shot and departure), `highway` (right-aligned hold),
   * `city` (bottom-left journey). The timeline tweens `rig.camera.stage` through them; nothing cuts.
   */
  camera: FramedCameraSpec<Scene01CameraFraming>
  /** The departure manoeuvre the coupled combination performs after the establishing shot. */
  departure: {
    /** Metres driven straight ahead (−X) before the U-turn begins. */
    straightOut: number
    /** Radius (m) of the puller's path through the 180° left turn. Larger = broader, more heavy-haul. */
    turnRadius: number
    /** Metres driven after the turn (now heading +X) to the final highway position. */
    straightIn: number
    /** Distance (m) from the trailer's kingpin back to its rear reference point (axle-group centre), used for tracking. */
    trailerTrackingLength: number
    /**
     * Fraction of the departure phase at which the daylight starts to replace the enclosed-yard atmosphere (sky, haze,
     * ground tone); it completes as the combination arrives on the highway. The city emerges from the haze — through
     * the garage's drive-through openings and beyond the building's end — and nothing is crossfaded.
     */
    revealStart: number
    /** Fraction of the departure phase at which the camera starts settling from `wide` to `highway` (≈ the turn exit). */
    cameraSettleStart: number
  }
  /** The closing journey: the combination drives on along the highway into the city while the camera tracks it. */
  journey: {
    /** Metres travelled along the highway during the `city` phase (the camera follows, so the world passes by). */
    travel: number
    /** Fraction of the city phase over which the camera re-frames from `highway` to `city`. */
    cameraPortion: number
    /**
     * Fraction of the `industrial` phase at which the camera starts moving from the travelling `city` framing to the
     * static `entry` shot of the factory front (it arrives as the combination stops at the gate).
     */
    entryCameraStart: number
  }
  /**
   * The parking manoeuvre at Gemini Engi Fab, described as the path the combination would DRIVE OUT along from its
   * parked position: straight ahead out of bay A through its door (`bayStraight`), a left turn of `turnRadius` onto the
   * highway's far lane, then straight along the road (`roadStraight`). The combination drives along the highway to the
   * end of that path and REVERSES along it into the bay — the trailer leading through the door — so it finishes facing
   * the door, puller front towards the camera. The industrial travel distance is derived from this geometry.
   */
  parking: {
    /** World position of the parked puller's footprint centre. */
    pullerPosition: Vec3
    /** Parked puller yaw (radians; π/2 = facing +Z, towards the door and the road). */
    yaw: number
    bayStraight: number
    turnRadius: number
    /** Must be ≥ the puller's fifth-wheel offset + trailerTrackingLength so the trailer is straight when the reverse starts. */
    roadStraight: number
    /** Fraction of the combined entry + parking reverse at which the camera leaves the entry shot for the doorway. */
    doorwayCameraStart: number
    /** Fraction of it at which the camera leaves the doorway and moves through the door onto the loading composition. */
    interiorCameraStart: number
    /**
     * Inside the hall the sun is taken out of the key light (to `keyScale` of its intensity): the shadow frustum
     * follows the combination and cannot cover the whole roof, so a full-strength sun would light the hall floor
     * beyond it. The change happens while the camera passes through the door (`from` → `to`, fractions of the
     * entry + parking reverse), when the exterior is no longer in view.
     */
    interiorLight: { keyScale: number; from: number; to: number }
  }
  /**
   * Heavy-lift loading choreography (pure function of the rig, see loading.ts). Positions derive from the parked
   * trailer: the vessel's resting place is `restLateral` metres to the trailer's left, abreast of its loading position
   * `deckOffset` metres (trailer-local X) from the trailer centre. Heights derive from the saddles and the deck.
   */
  loading: {
    cargo: {
      /** Trailer-local X (m) of the vessel's middle on the deck: the deck's centre, behind the gooseneck. */
      deckOffset: number
      /** Metres from the deck position to the resting place, towards the trailer's left. */
      restLateral: number
      /** How far (m) the vessel's lowest point clears the highest saddle horn while it is carried sideways. */
      liftClearance: number
      /** Height (m) of the trailer's deck top above its ground contact. Placeholder trailer: 1.2; update with the final model. */
      trailerDeckTop: number
    }
    crane: {
      /** World Z of the bridge and world X of the trolley while the crane is parked, and the hook's parked height. */
      parkZ: number
      parkTrolleyX: number
      parkHookY: number
      /** Highest hook position the crane allows (the stand-in's hook block meets its drum above about rail height + 0.8 m). */
      maxHookY: number
      /** The sling shackles stop this far above the lugs at the end of the approach (m). */
      approachClearance: number
      /** Where the bridge goes once the rigging is released (world Z). */
      clearZ: number
    }
    rigging: {
      /** Length of each vertical lower sling, lug pin to the spreader's bottom padeye hole (m). */
      slingLength: number
      /** Height of the hook above the spreader beam's centre (m); with a 10 m beam, 5.5 puts the top slings at 45°. */
      topSlingRise: number
      /** How far the spreader is lowered past the contact point so the attached slings visibly go slack (m). */
      slack: number
    }
    /** Fractions within the phase scalars (see loading.ts). */
    timing: {
      /** Share of the `rigging` phase spent lowering onto the lugs (`attach`); the rest takes up the slack (`tension`). */
      riggingAttachPortion: number
      approachTravelEnd: number
      approachLowerStart: number
      attachContact: number
      releaseDetach: number
      releaseRiseStart: number
      releaseTravelStart: number
    }
  }
  /** Industrial area, factory, crane, cargo, saddles and fabrication workpieces: each an independent, replaceable slot. */
  industry: {
    zone: { enabled: boolean; slot: EnvironmentSlotConfig; config: IndustrialZoneConfig }
    factory: { enabled: boolean; slot: EnvironmentSlotConfig; building: GeminiFactoryConfig; sign: BrandSignConfig }
    /**
     * The overhead crane (slot frame = the crane's local frame: runway along Z, span along X, floor at y = 0) and its
     * lifting rig. A replacement crane model is animated through three nodes it must contain, named `bridge` ⊃
     * `trolley` ⊃ `hook` (each a child of the previous one): the scene sets bridge.position.z = bridge Z, trolley
     * .position.x = trolley X and hook.position.y = hook height, in the model's units. The lifting rig (spreader,
     * slings, shackles) stays procedural: its slings bend with slack.
     */
    crane: { enabled: boolean; slot: EnvironmentSlotConfig; crane: OverheadCraneConfig; rig: LiftingRigConfig }
    /** The cargo vessel. Its slot frame is the VESSEL's local frame and moves with the cargo pose. */
    cargo: { slot: EnvironmentSlotConfig; vessel: PressureVesselConfig }
    /** Saddles: ground saddles at the vessel's resting place and transport saddles on the trailer deck (they ride with the trailer). */
    supports: {
      ground: VesselSaddleConfig
      trailer: VesselSaddleConfig
      /** Saddle positions along the vessel axis (m from its middle): under the wear pads. */
      offsets: readonly number[]
      /** Optional GLBs that replace each saddle stand-in, authored in the saddle's local frame (see VesselSaddleConfig). */
      models: { ground: EnvironmentModelConfig | null; trailer: EnvironmentModelConfig | null }
    }
    workpieces: { enabled: boolean; slot: EnvironmentSlotConfig; items: readonly FabricationWorkpiece[] }
  }
  /** Stage lighting. Light positions are ABSOLUTE world positions in metres, not relative to the vehicles. */
  lighting: StageLightingConfig
  /** Background/fog, yard floor, markings, contact shadow, atmosphere and the replaceable environment slots. */
  environment: YardEnvironmentConfig
  scroll: {
    /** Pinned scroll distance as a multiple of the viewport height (3.2 = 320vh). */
    distanceVh: number
    /** ScrollTrigger scrub smoothing in seconds. 0 = hard-linked to scroll; ~0.8–1.2 feels cinematic. */
    scrub: number
    anticipatePin: number
    /** Development aid: draw ScrollTrigger start/end markers. */
    markers: boolean
  }
  /**
   * Timeline phase windows as fractions of the total pinned scroll. Must be contiguous, ascending, and end at 1.
   * Derived from PHASE_VH (each phase's scroll length in viewport heights) so adding a phase never changes the pace
   * of the others. Both vehicles move during `approach` only, simultaneously, to their connected positions.
   */
  phases: Readonly<Record<Scene01PhaseName, PhaseWindow>>
  easing: {
    /** Shared ease for both vehicles' travel — identical so they move and arrive together. */
    approach: string
    heroDolly: string
    /** Ease of the garage fade-in during the second part of the approach. */
    garageFade: string
    /** Ease of the camera pull-out to the establishing shot. */
    establish: string
    /** Ease of the departure travel (slow start, slow stop: heavy vehicle). */
    departure: string
    /** Ease of the daylight reveal (enclosed-yard atmosphere → open daylight haze and sky). */
    daylight: string
    /** Ease of the final camera settle onto the highway composition. */
    cameraSettle: string
    /** Ease of the travel along the highway (gentle start from the highway hold, gentle stop into the final hold). */
    cityTravel: string
    /** Ease of the camera re-framing onto the bottom-left city composition. */
    cityCamera: string
    /** Drive through the industrial area to the stop beyond the factory gate (gentle start, controlled stop). */
    industrialTravel: string
    /** Camera from the travelling shot to the factory-front entry shot. */
    entryCamera: string
    /** The reverse into bay A: one continuous move from rest to rest. */
    reverse: string
    /** Camera through the door into the loading composition. */
    interiorCamera: string
    /** Crane travel, rigging and every vessel move (slow, deliberate). */
    crane: string
    overlay: string
  }
  overlay: {
    /** Fraction of the approach phase over which the hero copy fades out. */
    heroFadeOutPortion: number
    /** Fraction of the couplingHold phase over which the closing caption fades in. */
    captionFadeInPortion: number
    /** Fraction of the establish phase over which the caption fades out again (the highway shot carries no copy). */
    captionFadeOutPortion: number
  }
  rendering: RenderingConfig
  reducedMotion: {
    /** When the user prefers reduced motion: skip scrubbing and show a completed composition statically. */
    showFinalState: boolean
    /**
     * Which composition: 'coupled' (the coupling hold in the garage), 'highway' (combination on the right, left
     * clear), 'city' (bottom-left) or 'loaded' (the vessel loaded on the trailer in the factory). Reduced-motion users
     * see the hero copy (top left) AND the caption (bottom left) at once, so 'coupled' by default: it is the shot the
     * caption was composed for, and its dark garage backdrop keeps the headline legible. The highway hold puts the
     * garage interior and its sign behind the headline; the city and loaded compositions put the vehicle under the
     * caption.
     */
    frame: 'coupled' | 'highway' | 'city' | 'loaded'
  }
  placeholders: {
    /** Show an on-screen badge whenever TEMPORARY placeholder geometry is standing in for a missing GLB. */
    showBadge: boolean
  }
}

/**
 * The final loading composition inside bay A (see camera.framings.loading): the `lift` framing is derived from it.
 * Direction = level camera 55° off the vehicle's axis, 10° above the horizontal; portrait: 22° / 16°.
 */
const LOADING_FRAMING = {
  direction: [-0.8192, 0.1763, 0.5736],
  fitWidth: 48,
  fitHeight: 16,
  targetOffset: [457.5, 2.1, -41],
  maxDistance: 39,
  screenOffset: [-0.4, 0.02],
  fov: 45,
  portrait: { direction: [-0.3746, 0.2867, 0.9272], fitWidth: 13, fitHeight: 40, targetOffset: [456.5, 2.6, -36], maxDistance: 40, fov: 50, screenOffset: [0, -0.1] },
} as const satisfies CameraFraming

/** Ordered list of phase names, used to build timeline labels in a stable order. */
export const SCENE_01_PHASE_ORDER: readonly Scene01PhaseName[] = [
  'initial',
  'approach',
  'couplingHold',
  'establish',
  'departure',
  'highwayHold',
  'city',
  'cityHold',
  'industrial',
  'factoryEntry',
  'parking',
  'craneApproach',
  'rigging',
  'lift',
  'transfer',
  'lowering',
  'release',
  'loadedHold',
]

/**
 * Scroll length of every phase in viewport heights. The phase windows (fractions of the pinned scroll) and the total
 * pinned distance are DERIVED from this table, so adding or lengthening a phase never changes another phase's pace.
 */
export const SCENE_01_PHASE_VH: Readonly<Record<Scene01PhaseName, number>> = {
  /** Opening composition: both vehicles wait outside the frame. */
  initial: 0.258,
  /** Both vehicles travel towards the coupling point over the SAME window and arrive together. */
  approach: 2.322,
  /** Coupled: subtle camera push-in and the caption reveal. */
  couplingHold: 0.516,
  /** Wide establishing shot: the camera pulls out; nothing moves yet; the caption fades out. */
  establish: 0.559,
  /**
   * The combination drives off the apron, U-turns towards the camera and settles on the highway. The garage stays,
   * fixed in the world, and recedes as the camera follows; daylight replaces the enclosed-yard atmosphere from
   * `departure.revealStart`, so the city emerges through and beyond the garage.
   */
  departure: 2.236,
  /** Short hold on the highway composition (combination on the right). */
  highwayHold: 0.387,
  /** The combination drives on: the camera re-frames bottom-left and travels with it, leaving the garage behind. */
  city: 1.72,
  /** Hold on the city composition (combination bottom-left, right side clear). */
  cityHold: 0.602,
  /** On through the industrial area to a stop beyond the Gemini Engi Fab gate; the camera settles on the factory front. */
  industrial: 2.9,
  /** Reverse through the gate and bay A's door (trailer leading); the camera follows to the doorway. */
  factoryEntry: 1.6,
  /** Reverse on into the loading position beside the vessel and stop; the camera settles on the loading composition. */
  parking: 1.4,
  /** The overhead crane travels over the vessel and lowers the spreader and slings. */
  craneApproach: 1.1,
  /** The shackles are pinned to the lifting lugs, then the slings are tensioned. */
  rigging: 1.1,
  /** The vessel is lifted clear of its saddles. */
  lift: 0.8,
  /** The trolley carries the suspended vessel sideways over the trailer deck. */
  transfer: 1.0,
  /** The vessel is lowered onto the trailer's saddles. */
  lowering: 1.0,
  /** The slings slacken, the shackles are released and the crane moves clear. */
  release: 0.8,
  /** Final loaded composition. */
  loadedHold: 0.7,
}

/** Phase windows (fractions of the pinned scroll) from per-phase lengths. Contiguous by construction; ends exactly at 1. */
function derivePhaseWindows(vh: Readonly<Record<Scene01PhaseName, number>>, order: readonly Scene01PhaseName[]): Record<Scene01PhaseName, PhaseWindow> {
  const total = order.reduce((sum, name) => sum + vh[name], 0)
  const windows = {} as Record<Scene01PhaseName, PhaseWindow>
  let cursor = 0
  for (const name of order) {
    const end = cursor + vh[name]
    windows[name] = { start: cursor / total, end: end / total }
    cursor = end
  }
  windows[order[order.length - 1]].end = 1
  return windows
}

const PHASE_TOTAL_VH = SCENE_01_PHASE_ORDER.reduce((sum, name) => sum + SCENE_01_PHASE_VH[name], 0)

export const SCENE_01_CONFIG: Scene01Config = {
  id: 'scene-01-coupling',

  world: { groundY: 0 },

  models: { puller: 'puller-truck', trailer: 'hydraulic-axle-trailer', scale: 1 },

  assembly: {
    couplingPoint: [-4.0, 1.3, 0],
    connectedGap: 0,
    anchorHeightTolerance: 0.3,
  },

  positions: {
    pullerStart: [-31, 0, 0],
    trailerStart: [38, 0, 0],
    pullerFinal: null,
    trailerFinal: null,
  },

  camera: {
    fov: 30,
    near: 0.5,
    // Far enough for the daylight sky dome (radius 1200 m) that surrounds the camera in the city phase.
    far: 1500,
    target: [0.5, 1.4, 0],
    // LEVEL SIDE VIEWS: every framing looks straight along −Z (direction x = 0) with only a downward tilt, so
    // the camera has no yaw or roll relative to the vehicle's travel axis and every line parallel to X — chassis,
    // decks, road edges, garage frontage — projects perfectly horizontal. Composition is set by moving the
    // camera parallel to the image plane (targetOffset / screenOffset), never by turning it.
    framings: {
      // Approach: both vehicles and the garage frontage in frame.
      base: { direction: [0, 0.26, 1], fitWidth: 40, fitHeight: 11, targetOffset: [0, 0, 0] },
      // Coupling hold: a subtle push-in, never a cut.
      heroHold: { direction: [0, 0.21, 1], fitWidth: 34, fitHeight: 10, targetOffset: [0, 0.2, 0] },
      // Establishing shot: pulls out and re-centres over the turning area. During the departure it TRACKS the
      // combination (follow 0.8: the camera moves with 80% of its displacement, so the vehicle still visibly
      // travels across the frame) and the whole U-turn stays in frame on every aspect ratio.
      wide: {
        direction: [0, 0.27, 1],
        fitWidth: 62,
        fitHeight: 22,
        targetOffset: [-8, -0.2, 11],
        follow: 0.8,
        portrait: { fitWidth: 46, maxDistance: 210, targetOffset: [-6, -0.2, 13], follow: 1 },
      },
      // Highway hold: the combination parked on the highway on the RIGHT, the left ~38% of the frame clear.
      // Static (no follow). On portrait screens the combination is centred instead.
      highway: {
        direction: [0, 0.18, 1],
        fitWidth: 48,
        fitHeight: 16,
        targetOffset: [5.7, -0.2, 29.9],
        portrait: { fitWidth: 32, maxDistance: 210, targetOffset: [13, -0.2, 29.9] },
      },
      // City journey (final): the combination anchored in the lower third on the LEFT, the right ~44% of the frame
      // clear for future content. follow 1 = the camera travels with it, so the city passes behind. With follow 1
      // the target is the combination's centre: targetOffset compensates the difference between camera.target and
      // the combination's coupled rest centre (x 0.275, z 0), and screenOffset places that centre on screen.
      city: {
        direction: [0, 0.1, 1],
        fitWidth: 50,
        fitHeight: 18,
        targetOffset: [-0.225, 0.1, 0],
        follow: 1,
        screenOffset: [-0.39, -0.56],
        portrait: { fitWidth: 48, maxDistance: 250, screenOffset: [-0.38, -0.5] },
      },
      // Factory entry (level side view): static wide shot of the Gemini Engi Fab front — gate, forecourt and the open
      // bay doors — with the combination stopped on the highway beyond the gate, so the reverse into bay A reads clearly.
      entry: {
        direction: [0, 0.194, 1],
        fitWidth: 122,
        fitHeight: 32,
        targetOffset: [452, 2.6, 12],
        maxDistance: 220,
        portrait: { fitWidth: 62, maxDistance: 280, targetOffset: [469.5, 2.6, 12] },
      },
      // Doorway: the camera passes through bay A's open door on every aspect ratio (fixed distance), already turning
      // towards the parked vehicle and widening its lens. Not a side view.
      doorway: { direction: [-10, 8, 37], distance: 39.15, fitWidth: 1, fitHeight: 1, targetOffset: [455.5, 1.6, -30], fov: 40 },
      // Loading composition (final): inside bay A, level camera turned 55° off the vehicle's axis with a 45° lens: the
      // puller's front in three-quarter view on the LEFT, trailer and vessel beside and behind it, the right ~40% of
      // the frame clear (the open aisle in front of the truck). The camera stays inside bay A on every landscape aspect
      // (maxDistance), and portrait screens use a more head-on angle that stacks the combination in depth.
      loading: LOADING_FRAMING,
      // While the crane works (crane approach … release) the same view pulls back a few metres and drops the subject
      // lower in the frame, so the crane girders, the hook and the rigging are in the top quarter above it; the whole
      // combination and vessel stay in frame on the left with the right half clear.
      lift: {
        ...LOADING_FRAMING,
        fitHeight: 32,
        // 39 m keeps the camera inside bay A on 4:3-class screens, clear of the runway girders on the bay B/A column line.
        maxDistance: 39,
        screenOffset: [-0.4, -0.3],
        // Portrait: a lower camera (6° elevation) instead of a further one, so it stays under the trusses and inside the
        // door wall while the whole crane bridge fits above the combination.
        portrait: { ...LOADING_FRAMING.portrait, direction: [-0.3746, 0.1051, 0.9272], maxDistance: 38, screenOffset: [0, -0.3], fov: 55 },
      },
    },
    sequence: ['base', 'heroHold', 'wide', 'highway', 'city', 'entry', 'doorway', 'loading', 'lift'],
    minDistance: 20,
    maxDistance: 140,
  },

  departure: {
    straightOut: 8,
    turnRadius: 14,
    straightIn: 38,
    // Towing eye to the centre of the 12-line axle group (see the trailer's manifest entry).
    trailerTrackingLength: 12.08,
    revealStart: 0.3,
    cameraSettleStart: 0.5,
  },

  journey: {
    travel: 180,
    cameraPortion: 0.45,
    entryCameraStart: 0.55,
  },

  // Reverse into bay A of Gemini Engi Fab: the combination drives along the highway to 16 m past the end of a 90° arc,
  // stops, then reverses — trailer leading — through the gate and bay A's door, 40 m into the bay. The parked puller
  // faces the door (+Z). Industrial travel = from the end of the city journey to that stop (288 m).
  parking: {
    pullerPosition: [456, 0, -30],
    yaw: Math.PI / 2,
    bayStraight: 40,
    turnRadius: 18,
    roadStraight: 16,
    doorwayCameraStart: 0.42,
    interiorCameraStart: 0.78,
    interiorLight: { keyScale: 0.15, from: 0.7, to: 0.86 },
  },

  loading: {
    // Vessel middle over the deck centre (1.75 m behind the trailer centre); it rests on ground saddles 7 m to the
    // trailer's left (towards bay A's far wall), is lifted until it clears every saddle horn by 0.4 m, carried sideways
    // and set down. Its heights follow from the saddles (industry.supports) and the trailer's deck.
    // deckOffset 0.94 = the modular trailer's deck centre in its normalised frame (see the trailer's manifest entry).
    cargo: { deckOffset: 0.94, restLateral: 7, liftClearance: 0.4, trailerDeckTop: 1.2 },
    crane: { parkZ: -96, parkTrolleyX: 451, parkHookY: 17, maxHookY: 17.8, approachClearance: 1.5, clearZ: -62 },
    rigging: { slingLength: 3.2, topSlingRise: 5.5, slack: 0.45 },
    timing: { riggingAttachPortion: 0.6, approachTravelEnd: 0.72, approachLowerStart: 0.45, attachContact: 0.62, releaseDetach: 0.35, releaseRiseStart: 0.42, releaseTravelStart: 0.62 },
  },

  industry: {
    // Industrial area along the far side of the highway between the city and the factory (slot origin on the far
    // verge's outer edge, world z 21.65). The Gemini compound's stretch is excluded.
    zone: {
      enabled: true,
      slot: { position: [0, 0, 21.65], rotationY: 0, bounds: { min: [300, 0, -150], max: [1100, 45, 0] }, model: null },
      config: {
        seed: 7731,
        span: [300, 1100],
        exclude: [[380, 540]],
        compound: { width: [60, 110], depth: [55, 90], gap: [8, 20], wallHeight: 2.4, setback: 2.5 },
        buildings: { height: [8, 16], tankChance: 0.35, stackChance: 0.2 },
        accessRoadWidth: 12,
        // Across the far verge (2.5 m) and shoulder (2 m) to the carriageway edge.
        roadReach: 4.5,
        colors: { wall: '#5d6168', shed: '#6b7178', roof: '#464c53', tank: '#8a9097', stack: '#5a6067', road: '#2a2c2f', accent: '#c99a2e' },
      },
    },
    // Gemini Engi Fab: two bays (B fabrication, A heavy assembly and dispatch with the 40.3 m-span crane), doors facing the
    // road. Slot origin on the front wall line at bay B/A's shared column line (world x 430, z 6).
    factory: {
      enabled: true,
      slot: { position: [430, 0, 6], rotationY: 0, bounds: { min: [-46, 0, -121], max: [100, 28, 21] }, model: null },
      building: {
        length: 120,
        // 25.5 m eaves: the truss bottom chords (eaves − depth) stay 1.2 m above the crane's highest part (rail 17 m +
        // its 4.7 m bridge and crab); luminaires hang between the trusses above the crane.
        eavesHeight: 25.5,
        parapetHeight: 1.2,
        bays: [
          { name: 'B', x0: -36, x1: 0, door: { x0: -32, x1: -4, height: 16 }, hasCrane: true },
          { name: 'A', x0: 0, x1: 42, door: { x0: 6, x1: 36, height: 18 }, hasCrane: true },
        ],
        columnPitch: 12,
        columnSize: 0.9,
        craneRunway: { railHeight: 17, girderDepth: 1.6, girderWidth: 0.7 },
        trusses: { spacing: 8, depth: 2.6 },
        claddingHeight: 13,
        // The loading bay painted where the trailer parks (clear of the vessel's resting place to its left).
        floor: { color: '#55595e', markingColor: '#c9a33a', markingWidth: 0.15, loadingZone: { bay: 'A', x0: 20, x1: 30.5, z0: -28, z1: -62 } },
        luminaires: { height: 22.4, spacing: 8, color: '#e4ecf4', intensity: 1.6 },
        fixtures: [
          { kind: 'turningRolls', position: [22, 0, -88], yaw: Math.PI / 2, length: 12, vesselDiameter: 3.8 },
          { kind: 'weldingManipulator', position: [14, 0, -88], yaw: Math.PI / 2, boomLength: 7, columnHeight: 9, boomHeight: 6.5 },
          { kind: 'turningRolls', position: [-18, 0, -42], yaw: Math.PI / 2, length: 10, vesselDiameter: 3.6 },
          { kind: 'headRack', position: [-28, 0, -96], yaw: 0, headDiameter: 3.6, count: 3 },
          { kind: 'plateStack', position: [-10, 0, -22], yaw: 0, size: [6, 0.6, 3], plates: 8 },
          { kind: 'plateRoller', position: [-20, 0, -70], yaw: Math.PI / 2, width: 4 },
        ],
        forecourt: {
          wallZ: 13.5,
          x0: -46,
          x1: 100,
          wallHeight: 2.4,
          gate: { x0: 10, x1: 48, postHeight: 3.2 },
          driveway: { x0: 10, x1: 66, toZ: 20.25 },
          color: '#3a3d41',
        },
        colors: {
          column: '#4b5560',
          cladding: '#5b636b',
          claddingRib: '#4f575f',
          glazing: '#8fa3b3',
          roof: '#3b4148',
          truss: '#78838e',
          runway: '#545e69',
          door: '#666e76',
          accent: '#d2a32e',
          wall: '#62676d',
          fixture: '#4e5862',
          fixtureAccent: '#d2a32e',
        },
      },
      // Company sign above bay B's door (an attachment of the factory slot, like MMI's sign on the garage).
      sign: {
        enabled: true,
        text: 'GEMINI ENGI FAB',
        centre: [-18, 18.9],
        width: 17,
        height: 3,
        depth: 0.22,
        standoff: 0.3,
        fontFamily: 'var(--font-sans)',
        fontWeight: 700,
        letterSpacing: 0.08,
        colors: { face: '#1f2c38', text: '#eef1f3', border: '#3d4b58', frame: '#2a3139', bracket: '#3a4048', accent: '#d6a630', lamp: '#f2ead8' },
        lamps: { count: 3, intensity: 0.5 },
        floodlight: 0.25,
      },
    },
    // Overhead crane of bay A (slot origin on bay A's centre line 6 m inside the front wall, world x 451, z 0): runway along Z.
    crane: {
      enabled: true,
      slot: { position: [451, 0, 0], rotationY: 0, bounds: { min: [-21, 0, -120], max: [21, 22.5, 6] }, model: null },
      crane: {
        // Bay A's rail centre lines are 0.85 m inside its column lines (factoryLayout.runwayInset): 42 − 2 × 0.85.
        span: 40.3,
        railHeight: 17,
        bridge: { girderDepth: 2.0, girderWidth: 0.8, girderGap: 2.6, endTruckLength: 6, color: '#4c5560', accentColor: '#d6a630' },
        trolley: { length: 4.2, width: 4.0, height: 1.8, color: '#3f4852' },
        hoist: { ropeCount: 4, ropeDiameter: 0.045, ropeColor: '#2a2d31', blockSize: [1.1, 1.5, 0.7], blockColor: '#3a4048', hookColor: '#d6a630' },
      },
      rig: {
        spreader: { length: 10, depth: 0.7, width: 0.5, color: '#4a535d' },
        sling: { diameter: 0.07, color: '#b9b2a2', segments: 8 },
        shackle: { size: 0.25, color: '#c9a032' },
      },
    },
    // The cargo: a 16 m × 4.2 m pressure vessel (2:1 heads, five shell courses, top lifting lugs 10 m apart).
    cargo: {
      slot: { position: [0, 0, 0], rotationY: 0, bounds: { min: [-8.2, 0, -2.6], max: [8.2, 5.4, 2.6] }, model: null },
      vessel: {
        shellLength: 13.9,
        diameter: 4.2,
        headDepthRatio: 0.25,
        courses: 5,
        stage: 'complete',
        nozzles: [
          { x: -2, angle: 0, diameter: 0.6, projection: 0.5 },
          { x: 3, angle: 0, diameter: 0.9, projection: 0.6 },
          { x: 0.5, angle: -Math.PI / 2, diameter: 0.5, projection: 0.45 },
        ],
        lugs: { x: [-5, 5], height: 0.55, thickness: 0.06, holeDiameter: 0.12 },
        wearPads: [-4.25, 4.25],
        colors: { shell: '#7d8893', weld: '#a89f8f', lug: '#555c64', nozzle: '#68717a' },
      },
    },
    supports: {
      ground: { height: 1.2, width: 3.4, thickness: 0.5, wrapAngle: 2.1, vesselDiameter: 4.2, colors: { steel: '#4a5058', pad: '#2b2e32' } },
      trailer: { height: 0.5, width: 2.6, thickness: 0.4, wrapAngle: 2.0, vesselDiameter: 4.2, colors: { steel: '#4a5058', pad: '#2b2e32' } },
      offsets: [-4.25, 4.25],
      models: { ground: null, trailer: null },
    },
    // Vessels in the fabrication stations (factory frame): separate, replaceable workpieces.
    workpieces: {
      enabled: true,
      slot: { position: [430, 0, 6], rotationY: 0, bounds: { min: [-36, 0, -120], max: [42, 6, 0] }, model: null },
      items: [
        {
          name: 'bay-a-welding-station',
          vessel: { shellLength: 10, diameter: 3.8, headDepthRatio: 0.25, courses: 4, stage: 'oneHead', nozzles: [], lugs: { x: [], height: 0.5, thickness: 0.06, holeDiameter: 0.12 }, wearPads: [], colors: { shell: '#8b949c', weld: '#a69c8a', lug: '#555c64', nozzle: '#68717a' } },
          position: [22, 0.55, -88],
          yaw: Math.PI / 2,
        },
        {
          name: 'bay-b-shell-courses',
          vessel: { shellLength: 8, diameter: 3.6, headDepthRatio: 0.25, courses: 3, stage: 'shell', nozzles: [], lugs: { x: [], height: 0.5, thickness: 0.06, holeDiameter: 0.12 }, wearPads: [], colors: { shell: '#8b949c', weld: '#a69c8a', lug: '#555c64', nozzle: '#68717a' } },
          position: [-18, 0.55, -42],
          yaw: Math.PI / 2,
        },
      ],
    },
  },

  lighting: {
    hemisphere: { skyColor: '#c9d3df', groundColor: '#2b2e33', intensity: 0.75 },
    key: {
      position: [14, 22, 12],
      color: '#fff3e2',
      intensity: 2.6,
      castShadow: true,
      shadowMapSize: 2048,
      shadowExtent: 26,
      shadowBias: -0.0002,
      shadowNormalBias: 0.05,
      shadowRadius: 3,
    },
    fill: { position: [-18, 9, 6], color: '#b7c5d6', intensity: 0.7 },
    rim: { position: [-6, 12, -20], color: '#e6ecf2', intensity: 0.8 },
    environmentIntensity: 0.7,
    toneMappingExposure: 1.0,
  },

  environment: {
    backgroundColor: '#0e1013',
    fog: { near: 48, far: 130 },
    floor: { size: 2600, color: '#17191d', roughness: 0.94, metalness: 0.04, envMapIntensity: 0.35 },
    markings: { color: '#454b53', opacity: 0.6, laneHalfWidth: 2.4, length: 90, stripeLength: 2.4, stripeGap: 1.6 },
    contactShadow: { opacity: 0.55, blur: 2.2, width: 80, height: 40, far: 3, resolution: 1024 },
    showSlotBounds: false,

    // Open-air daylight the scene blends to while the combination leaves the yard (departure.revealStart → highway):
    // the enclosed-yard fog (dark, short) gives way to a long, light haze and a gradient sky, so the city emerges
    // from the distance. Lighting, not a replaceable environment.
    atmosphere: {
      sky: { zenith: '#56616d', horizon: '#9aa3ac', radius: 1200 },
      haze: { color: '#959ea7', near: 120, far: 1100 },
      groundColor: '#2c2f33',
    },

    // ENVIRONMENT SLOTS — each environment is an independent, replaceable group (see EnvironmentSlot.tsx). `slot`
    // places it in the world, reserves its bounds and may name a GLB that replaces the procedural stand-in, e.g.
    //   model: { url: `${import.meta.env.BASE_URL}models/environment/garage.glb`, scale: 1, position: [0, 0, 0],
    //            rotation: [0, 0, 0], castShadow: false, receiveShadow: true }
    // Everything else in each block describes the stand-in, in slot-local metres.

    // MMI fleet garage. Slot origin = centre line of the facade's front plane, 26 m behind the coupling line; the hall
    // extends to −Z and its forecourt apron to +Z. Fades in from 40% of the approach, then stays: it never fades out.
    garage: {
      enabled: true,
      slot: { position: [0, 0, -26], rotationY: 0, bounds: { min: [-90, 0, -42], max: [90, 17, 42] }, model: null },
      fadeStartPortion: 0.4,
      // Bounded building: branding wall from x −50 to the first bay at −29.25, five open bays, and a short pier to +35.
      // Its left corner is in frame in the establishing shot, and its right-hand end (with the city beyond it) comes
      // into view as the camera follows the departure.
      building: { left: -50, right: 35, depth: 40, eavesHeight: 14.5, parapetHeight: 1.0 },
      bays: { start: -29.25, count: 5, pitch: 12.5, openingHeight: 12.3, rear: { open: true, height: 9.5 } },
      columns: { size: 0.7, interiorRows: [13, 26] },
      trusses: { spacing: 6.25, topChordHeight: 13.8, bottomChordHeight: 11.6, diagonalPitch: 3.2, purlinPitch: 5 },
      luminaires: { height: 10.9, rowSpacing: 8, spacing: 6.25, length: 3.2 },
      ribPitch: 1.0,
      brandWallJoints: [6.0, 12.6],
      // Forecourt the vehicles couple on; its kerb (16 m in front of the coupling line) bounds the yard and is broken
      // only where the exit road leaves for the highway.
      apron: { front: 42, left: -90, right: 90, color: '#1b1e22', daylightColor: '#383b3f', kerb: { width: 0.3, height: 0.12, color: '#2f3338' } },
      // Company sign on the branding wall: 10.6 × 2.6 m, its face 9.2 m up, its right edge 2.4 m clear of the first bay
      // column. Sized and placed so that, with the level cameras, it is entirely in frame in the wide establishing shot
      // and through the U-turn on landscape screens, and in the highway hold from aspect ≈ 1.74 (typical desktop
      // browser windows); out of the opening and coupling shots except a corner on ultra-wide screens. On phones it is
      // in frame only briefly during the U-turn and too small to read.
      sign: {
        enabled: true,
        text: 'MEGA MOVE INDIA',
        centre: [-37.3, 9.2],
        width: 10.6,
        height: 2.6,
        depth: 0.22,
        standoff: 0.28,
        fontFamily: 'var(--font-sans)',
        fontWeight: 700,
        letterSpacing: 0.06,
        colors: { face: '#e3e5e7', text: '#1c2026', border: '#b9bdc2', frame: '#2a2e34', bracket: '#3a3f46', accent: '#d9a521', lamp: '#f2ead8' },
        lamps: { count: 3, intensity: 0.6 },
        floodlight: 0.55,
      },
      zones: [
        { kind: 'inspection', position: [-12.5, 0, 15], size: [9, 16] },
        { kind: 'inspection', position: [12.5, 0, 15], size: [9, 16] },
        { kind: 'pit', position: [0, 0, 19], size: [1.3, 14] },
      ],
      fleet: [
        // Yaw 0 = parallel to the facade (nose to −X); +π/2 = nose towards the camera.
        { kind: 'puller', x: 0, depth: 9.5, rotationY: Math.PI / 2 },
        { kind: 'trailer', x: -20, depth: 21, rotationY: 0 },
        { kind: 'puller', x: 14, depth: 25, rotationY: Math.PI },
        { kind: 'lowbed', x: 22, depth: 13, rotationY: 0 },
      ],
      colors: {
        bollard: '#d9a521',
        frontColumn: '#2b2f35',
        doorHead: '#4a4f56',
        bayLight: '#ffe3b8',
        cladding: '#3a3f45',
        rib: '#30343a',
        fascia: '#24282d',
        brandWall: '#4b5057',
        plinth: '#5d6166',
        fleetPaint: '#2f3338',
        fleetSteel: '#8d949c',
        interiorColumn: '#353a40',
        sleeve: '#d9a521',
        truss: '#9aa2ab',
        luminaire: '#dfe8f0',
        accentLine: '#d9a521',
        zone: '#4b4f55',
        pit: '#1b1e22',
        slab: '#575b60',
        girt: '#3f444a',
        backWall: '#2e3237',
      },
      lightIntensity: { bay: 1.0, luminaire: 1.8 },
    },

    // Exit road from the apron's kerb to the highway's far carriageway edge. Its stand-in outline is derived in WORLD
    // space from the departure path (10.5 m wide: covers the trailer's swept path including its tail swing), clipped
    // at the apron edge and the carriageway, then mapped into this slot — so the paving stays under the path wherever
    // the slot is placed.
    road: {
      enabled: true,
      slot: { position: [0, 0, 0], rotationY: 0, bounds: { min: [-40, 0, 14], max: [-10, 1, 28] }, model: null },
      width: 10.5,
      overlap: 0.05,
      color: '#2a2c2f',
      grain: 0.6,
    },

    // Two-way highway along X in the foreground. Slot origin = its centre line, 1.9 m beyond the end of the departure
    // path so the vehicle sits in the far (left-hand traffic) lane. Street lights stand on the far verge except in front
    // of the garage (local x −75…48), where a pole would stand between the camera and the coupling, and across the
    // Gemini Engi Fab entrance (425…510), which the combination reverses through.
    highway: {
      enabled: true,
      slot: { position: [0, 0, 29.9], rotationY: 0, bounds: { min: [-1300, 0, -9.5], max: [1300, 12, 9.5] }, model: null },
      length: 2600,
      lanes: 2,
      laneWidth: 3.75,
      shoulderWidth: 2,
      vergeWidth: 2.5,
      markings: { dashLength: 3, dashGap: 6, lineWidth: 0.15, edgeLineInset: 0.25 },
      colors: { asphalt: '#2a2c2f', shoulder: '#3a3b3c', verge: '#33363a', centreLine: '#cfd2d4', edgeLine: '#c9ccce' },
      grain: 0.6,
      streetLights: { enabled: true, spacing: 36, height: 10, armLength: 2.6, exclude: [[-75, 48], [425, 510]], color: '#6c727a' },
    },

    // City edge beyond the garage. Slot origin 95 m behind the coupling line (29 m behind the garage's back wall):
    // low industry at 0–40 m, mid-rise blocks at 75–165 m and a skyline at 365–805 m behind that (world z −95 … −936).
    // The span covers the widest view (32:9) over the whole journey. Opaque and always present; the enclosed-yard fog
    // hides it until the daylight haze takes over.
    city: {
      enabled: true,
      slot: { position: [0, 0, -95], rotationY: 0, bounds: { min: [-1200, 0, -845], max: [2400, 170, 0] }, model: null },
      seed: 20251,
      span: [-1200, 2400],
      skyline: { zRange: [-365, -805], width: [18, 44], depth: [18, 36], height: [30, 78], gap: [1, 9], landmarkChance: 0.12, landmarkHeight: [90, 128] },
      // The nearer bands stop where the industrial area begins (x 330); the skyline continues behind it.
      midrise: { zRange: [-75, -165], width: [24, 55], depth: [16, 28], height: [14, 38], gap: [6, 22], span: [-1200, 330] },
      industrial: { zRange: [0, -40], width: [34, 80], depth: [18, 30], height: [6, 12], gap: [10, 34], stackChance: 0.3, stackHeight: [24, 38], span: [-1200, 330] },
      colors: { glass: '#5f6b77', concrete: '#7b8086', steel: '#4b525a', industrial: '#4f545b', roof: '#3d4248' },
    },
  },

  scroll: {
    distanceVh: PHASE_TOTAL_VH,
    scrub: 0.9,
    anticipatePin: 1,
    markers: false,
  },

  phases: derivePhaseWindows(SCENE_01_PHASE_VH, SCENE_01_PHASE_ORDER),

  easing: {
    approach: 'power2.inOut',
    heroDolly: 'power1.inOut',
    garageFade: 'power1.inOut',
    establish: 'power1.inOut',
    departure: 'power2.inOut',
    daylight: 'power1.inOut',
    cameraSettle: 'power1.inOut',
    cityTravel: 'power1.inOut',
    cityCamera: 'power1.inOut',
    industrialTravel: 'power2.inOut',
    entryCamera: 'power1.inOut',
    reverse: 'power2.inOut',
    interiorCamera: 'power1.inOut',
    crane: 'power1.inOut',
    overlay: 'power1.out',
  },

  overlay: {
    heroFadeOutPortion: 0.3,
    captionFadeInPortion: 0.5,
    captionFadeOutPortion: 0.8,
  },

  rendering: {
    dprDesktop: [1, 2],
    dprMobile: [1, 1.5],
    shadows: true,
    antialias: true,
    powerPreference: 'high-performance',
  },

  reducedMotion: { showFinalState: true, frame: 'coupled' },

  placeholders: { showBadge: true },
}
