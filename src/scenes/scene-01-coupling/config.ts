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

export type Scene01PhaseName = 'initial' | 'approach' | 'couplingHold' | 'establish' | 'departure' | 'highwayHold'

/** Named camera framings, in the order the camera stage walks through them. */
export type Scene01CameraFraming = 'base' | 'heroHold' | 'wide' | 'highway'

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
    /** When the user prefers reduced motion: skip scrubbing and show the completed combination statically. */
    showFinalState: boolean
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
    far: 420,
    target: [0.5, 1.4, 0],
    framings: {
      // Approach: both vehicles and the garage facade in frame.
      base: { direction: [0.34, 0.27, 1], fitWidth: 40, fitHeight: 11, targetOffset: [0, 0, 0] },
      // Coupling hold: a subtle push-in, never a cut.
      heroHold: { direction: [0.3, 0.22, 1], fitWidth: 34, fitHeight: 10, targetOffset: [0, 0.2, 0] },
      // Establishing shot: pulls out and re-centres over the turning area. During the departure it TRACKS the
      // combination (follow 0.8: the camera moves with 80% of its displacement, so the vehicle still visibly
      // travels across the frame) and the whole U-turn stays in frame on every aspect ratio.
      wide: {
        direction: [0.34, 0.27, 1],
        fitWidth: 62,
        fitHeight: 22,
        targetOffset: [-8, -0.2, 11],
        follow: 0.8,
        portrait: { fitWidth: 46, maxDistance: 210, targetOffset: [-6, -0.2, 13], follow: 1 },
      },
      // Final: the combination parked on the highway on the RIGHT, the left ~38% of the frame kept clear for
      // future content. Static (no follow) so the end composition is exactly this. On portrait screens the
      // combination is centred instead (it already fills most of the width there).
      highway: {
        direction: [0.3, 0.2, 1],
        fitWidth: 50,
        fitHeight: 16,
        targetOffset: [6.5, -0.2, 29.9],
        portrait: { fitWidth: 32, maxDistance: 210, targetOffset: [13, -0.2, 29.9] },
      },
    },
    sequence: ['base', 'heroHold', 'wide', 'highway'],
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

  lighting: {
    hemisphere: { skyColor: '#c9d3df', groundColor: '#2b2e33', intensity: 0.75 },
    key: {
      position: [14, 22, 12],
      color: '#fff3e2',
      intensity: 2.6,
      castShadow: true,
      shadowMapSize: 2048,
      shadowExtent: 44,
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
    floor: { size: 320, color: '#17191d', roughness: 0.94, metalness: 0.04, envMapIntensity: 0.35 },
    markings: { color: '#454b53', opacity: 0.6, laneHalfWidth: 2.4, length: 90, stripeLength: 2.4, stripeGap: 1.6 },
    contactShadow: { opacity: 0.55, blur: 2.2, width: 130, height: 72, far: 3, resolution: 1024 },
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
      length: 600,
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
  },

  scroll: {
    distanceVh: 6.4,
    scrub: 0.9,
    anticipatePin: 1,
    markers: false,
  },

  phases: {
    /** Opening composition: both vehicles wait outside the frame. */
    initial: { start: 0, end: 0.04 },
    /** Both vehicles travel towards the coupling point over the SAME window and arrive together. */
    approach: { start: 0.04, end: 0.4 },
    /** Coupled: subtle camera push-in and the caption reveal; the garage stays visible. */
    couplingHold: { start: 0.4, end: 0.48 },
    /** Wide establishing shot: the camera pulls out; nothing moves yet; the caption fades out. */
    establish: { start: 0.48, end: 0.57 },
    /** The combination drives off, U-turns towards the camera and settles on the highway; garage → highway crossfade. */
    departure: { start: 0.57, end: 0.92 },
    /** Final hold on the highway composition. */
    highwayHold: { start: 0.92, end: 1 },
  },

  easing: {
    approach: 'power2.inOut',
    heroDolly: 'power1.inOut',
    garageFade: 'power1.inOut',
    establish: 'power1.inOut',
    departure: 'power2.inOut',
    crossfade: 'power1.inOut',
    cameraSettle: 'power1.inOut',
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

  reducedMotion: { showFinalState: true },

  placeholders: { showBadge: true },
}

/** Ordered list of phase names, used to build timeline labels in a stable order. */
export const SCENE_01_PHASE_ORDER: readonly Scene01PhaseName[] = ['initial', 'approach', 'couplingHold', 'establish', 'departure', 'highwayHold']
