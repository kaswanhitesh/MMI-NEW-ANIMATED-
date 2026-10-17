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
import type { FramedCameraSpec } from '../../three/camera/types'
import type { RenderingConfig } from '../../three/canvas/types'
import type { StageLightingConfig, YardEnvironmentConfig } from '../../three/environment/types'

export type Scene01PhaseName = 'initial' | 'approach' | 'couplingHold' | 'establish' | 'departure' | 'highwayHold' | 'city' | 'cityHold'

/** Named camera framings, in the order the camera stage walks through them. */
export type Scene01CameraFraming = 'base' | 'heroHold' | 'wide' | 'highway' | 'city'

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
   * `heroHold` (push-in while coupled), `wide` (establishing shot before departure), `highway` (final
   * right-aligned composition). The timeline tweens `rig.camera.stage` through them; nothing cuts.
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
    /** Fraction of the departure phase over which the garage fades out and the highway fades in. */
    crossfadePortion: number
    /** Fraction of the departure phase at which the camera starts settling from `wide` to `highway` (≈ the turn exit). */
    cameraSettleStart: number
  }
  /** The closing journey: the combination drives on along the highway into the city while the camera tracks it. */
  journey: {
    /** Metres travelled along the highway during the `city` phase (the camera follows, so the world passes by). */
    travel: number
    /** Fraction of the city phase over which the camera re-frames from `highway` to `city`. */
    cameraPortion: number
    /** Fraction of the city phase over which the city, sky and daylight haze fade in. */
    fadePortion: number
  }
  /** Stage lighting. Light positions are ABSOLUTE world positions in metres, not relative to the vehicles. */
  lighting: StageLightingConfig
  /** Background/fog colour, yard floor, markings and contact shadow. */
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
   * Both vehicles move during `approach` only, simultaneously, from their start positions to their connected positions.
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
    /** Ease of the garage → highway crossfade. */
    crossfade: string
    /** Ease of the final camera settle onto the highway composition. */
    cameraSettle: string
    /** Ease of the city / sky / haze fade-in. */
    cityFade: string
    /** Ease of the travel along the highway (gentle start from the highway hold, gentle stop into the final hold). */
    cityTravel: string
    /** Ease of the camera re-framing onto the bottom-left city composition. */
    cityCamera: string
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
     * Which completed composition: 'highway' (combination on the right, left clear) or 'city' (bottom-left).
     * 'highway' by default because reduced-motion users see the hero copy and caption, and the caption sits
     * bottom-left — exactly where the city composition puts the vehicle.
     */
    frame: 'highway' | 'city'
  }
  placeholders: {
    /** Show an on-screen badge whenever TEMPORARY placeholder geometry is standing in for a missing GLB. */
    showBadge: boolean
  }
}

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
    },
    sequence: ['base', 'heroHold', 'wide', 'highway', 'city'],
    minDistance: 20,
    maxDistance: 140,
  },

  departure: {
    straightOut: 8,
    turnRadius: 14,
    straightIn: 38,
    trailerTrackingLength: 10.55,
    crossfadePortion: 0.35,
    cameraSettleStart: 0.5,
  },

  journey: {
    travel: 180,
    cameraPortion: 0.45,
    fadePortion: 0.55,
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
    // Cinematic backdrop: the MMI fleet garage. Invisible while the vehicles enter, fades in from 40% of the
    // approach and is fully visible the moment they couple. The facade stands 26 m behind the coupling line.
    garage: {
      enabled: true,
      fadeStartPortion: 0.4,
      position: [0, 0, -26],
      width: 150,
      depth: 40,
      eavesHeight: 14.5,
      bays: { count: 7, pitch: 12.5, openingHeight: 12.3, openBays: [1, 2, 3, 4, 5] },
      columns: { size: 0.7, interiorRows: [13, 26] },
      trusses: { spacing: 6.25, topChordHeight: 13.8, bottomChordHeight: 11.6, diagonalPitch: 3.2, purlinPitch: 5 },
      luminaires: { height: 10.9, rowSpacing: 8, spacing: 6.25, length: 3.2 },
      ribPitch: 1.0,
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
        { kind: 'lowbed', x: 24, depth: 13, rotationY: 0 },
      ],
      colors: {
        bollard: '#d9a521',
        frontColumn: '#2b2f35',
        doorHead: '#4a4f56',
        closedDoor: '#50555c',
        bayLight: '#ffe3b8',
        cladding: '#3a3f45',
        rib: '#30343a',
        fascia: '#24282d',
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
    // The highway the combination departs onto: a two-way road along X in the foreground. Its centre line is
    // 1.9 m beyond the end of the departure path so the vehicle sits in the far (left-hand traffic) lane.
    highway: {
      enabled: true,
      centreZ: 29.9,
      length: 2600,
      lanes: 2,
      laneWidth: 3.75,
      shoulderWidth: 2,
      vergeWidth: 2.5,
      markings: { dashLength: 3, dashGap: 6, lineWidth: 0.15, edgeLineInset: 0.25 },
      colors: { asphalt: '#2a2c2f', shoulder: '#3a3b3c', verge: '#33363a', centreLine: '#cfd2d4', edgeLine: '#c9ccce' },
      grain: 0.6,
      // Paved yard exit under the departure path: 10.5 m wide (covers the trailer's swept path including its tail
      // swing, ~0.45 m beyond the path's outer offset at the end of the turn). Its straight runs along the former
      // garage frontage into the fog (to the road's end, at least 2 m behind the trailer) and it tucks 5 cm under
      // the carriageway at the junction.
      access: { width: 10.5, rearMargin: 2, runToRoadEnd: true, overlap: 0.05 },
    },
    // City edge for the closing journey, layered for depth: low industry 80–120 m behind the highway's far side,
    // mid-rise commercial blocks at 170–260 m, and a deep skyline band at 460–900 m that the daylight haze softens into
    // silhouettes. Street lights on the far verge give the strongest sense of passing. The viaduct is available
    // but off by default (it read as a heavy band across the frame).
    city: {
      enabled: true,
      seed: 20251,
      span: [-560, 760],
      skyline: { zRange: [-460, -900], width: [18, 44], depth: [18, 36], height: [30, 78], gap: [1, 9], landmarkChance: 0.12, landmarkHeight: [90, 128] },
      midrise: { zRange: [-170, -260], width: [24, 55], depth: [16, 28], height: [14, 38], gap: [6, 22] },
      industrial: { zRange: [-80, -120], width: [34, 80], depth: [18, 30], height: [6, 12], gap: [10, 34], stackChance: 0.3, stackHeight: [24, 38] },
      viaduct: { enabled: false, z: -44, deckHeight: 11, deckThickness: 1.6, deckWidth: 9, pierSpacing: 30, pierSize: 2.2 },
      streetLights: { enabled: true, z: 22.9, spacing: 36, height: 10, armLength: 2.6 },
      sky: { zenith: '#56616d', horizon: '#9aa3ac', radius: 1200 },
      fog: { color: '#959ea7', near: 200, far: 1150 },
      groundColor: '#2c2f33',
      colors: { glass: '#5f6b77', concrete: '#7b8086', steel: '#4b525a', industrial: '#4f545b', roof: '#3d4248', infrastructure: '#6c727a' },
    },
  },

  scroll: {
    distanceVh: 8.6,
    scrub: 0.9,
    anticipatePin: 1,
    markers: false,
  },

  phases: {
    /** Opening composition: both vehicles wait outside the frame. */
    initial: { start: 0, end: 0.03 },
    /** Both vehicles travel towards the coupling point over the SAME window and arrive together. */
    approach: { start: 0.03, end: 0.3 },
    /** Coupled: subtle camera push-in and the caption reveal; the garage stays visible. */
    couplingHold: { start: 0.3, end: 0.36 },
    /** Wide establishing shot: the camera pulls out; nothing moves yet; the caption fades out. */
    establish: { start: 0.36, end: 0.425 },
    /** The combination drives off, U-turns towards the camera and settles on the highway; garage → highway crossfade. */
    departure: { start: 0.425, end: 0.685 },
    /** Short hold on the highway composition (combination on the right). */
    highwayHold: { start: 0.685, end: 0.73 },
    /** The combination drives on into the city: camera re-frames bottom-left and travels with it; city fades in. */
    city: { start: 0.73, end: 0.93 },
    /** Final hold on the city composition (combination bottom-left, right side clear). */
    cityHold: { start: 0.93, end: 1 },
  },

  easing: {
    approach: 'power2.inOut',
    heroDolly: 'power1.inOut',
    garageFade: 'power1.inOut',
    establish: 'power1.inOut',
    departure: 'power2.inOut',
    crossfade: 'power1.inOut',
    cameraSettle: 'power1.inOut',
    cityFade: 'power1.inOut',
    cityTravel: 'power1.inOut',
    cityCamera: 'power1.inOut',
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

  reducedMotion: { showFinalState: true, frame: 'highway' },

  placeholders: { showBadge: true },
}

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
]
