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

export type Scene01PhaseName = 'initial' | 'approach' | 'heroHold'

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
   * Camera: `target` ≈ centre of the completed combination; `base` frames Phases A–D;
   * `heroHold` is blended in during the hero hold (a subtle push-in, never a cut).
   */
  camera: FramedCameraSpec
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
    overlay: string
  }
  overlay: {
    /** Fraction of the approach phase over which the hero copy fades out. */
    heroFadeOutPortion: number
    /** Fraction of the heroHold phase over which the closing caption fades in. */
    captionFadeInPortion: number
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
    far: 260,
    target: [0.5, 1.4, 0],
    base: {
      direction: [0.34, 0.27, 1],
      fitWidth: 40,
      fitHeight: 11,
      targetOffset: [0, 0, 0],
    },
    heroHold: {
      direction: [0.3, 0.22, 1],
      fitWidth: 34,
      fitHeight: 10,
      targetOffset: [0, 0.2, 0],
    },
    minDistance: 20,
    maxDistance: 140,
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
    floor: { size: 320, color: '#17191d', roughness: 0.94, metalness: 0.04, envMapIntensity: 0.35 },
    markings: { color: '#454b53', opacity: 0.6, laneHalfWidth: 2.4, length: 90, stripeLength: 2.4, stripeGap: 1.6 },
    contactShadow: { opacity: 0.55, blur: 2.2, width: 80, height: 14, far: 3 },
  },

  scroll: {
    distanceVh: 3.4,
    scrub: 0.9,
    anticipatePin: 1,
    markers: false,
  },

  phases: {
    /** Phase A — opening composition: both vehicles wait outside the frame. */
    initial: { start: 0, end: 0.06 },
    /** Phase B — both vehicles travel towards the coupling point over the SAME window and arrive together. */
    approach: { start: 0.06, end: 0.78 },
    /** Phase C — hero hold: nothing moves except a subtle camera push-in and the caption reveal. */
    heroHold: { start: 0.78, end: 1 },
  },

  easing: {
    approach: 'power2.inOut',
    heroDolly: 'power1.inOut',
    overlay: 'power1.out',
  },

  overlay: {
    heroFadeOutPortion: 0.3,
    captionFadeInPortion: 0.5,
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
export const SCENE_01_PHASE_ORDER: readonly Scene01PhaseName[] = ['initial', 'approach', 'heroHold']
