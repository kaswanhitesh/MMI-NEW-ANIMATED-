/**
 * Scene 01 timeline hook.
 *
 * Builds the ONE scroll-scrubbed GSAP timeline that drives the coupling rig —
 * puller / trailer positions, the departure and travel distances, the camera
 * framing stage, the garage fade-in, the daylight and the overlay opacities —
 * and binds it to a pinned ScrollTrigger on the scene section. Everything
 * happens inside a `gsap.matchMedia()` context keyed on `prefers-reduced-motion`,
 * so users who ask for reduced motion get the completed combination rendered
 * statically (no pin, no scrub, all copy visible) instead. The whole context is
 * reverted on unmount, which also kills the ScrollTrigger and its tweens.
 *
 * Timeline time == scroll progress: the total duration is pinned to exactly 1,
 * phase windows from the config are placed at absolute positions and exposed as
 * labels (one per phase in SCENE_01_PHASE_ORDER, then `end`). Both vehicles travel during `approach` on the same
 * window with the same ease while the garage fades in; after the coupling hold
 * and the establishing pull-out, ONE scalar (`rig.departure.distance`) drives
 * the U-turn off the apron onto the highway while the daylight replaces the
 * enclosed-yard atmosphere; in the city phase `rig.city.travel` continues the
 * drive while the camera travels with it; `rig.industrial.travel` carries it on
 * through the industrial area to the Gemini Engi Fab gate, `rig.parking.reverse`
 * reverses it into the factory, and the `rig.loading` stages run the heavy lift
 * that puts the vessel on its trailer. The garage, road, highway, city,
 * industrial area and factory are fixed in the world and never fade during the
 * journey: the camera following the vehicle is what moves them past. All
 * tuning numbers come from the scene config.
 */
import { invalidate } from '@react-three/fiber'
import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { gsap } from '../../animation/gsap'
import { createPinnedScrubTimeline, getPhaseAtProgress } from '../../animation/scrollTimeline'
import { FULL_MOTION_QUERY, REDUCED_MOTION_QUERY } from '../../animation/useReducedMotion'
import { SCENE_01_CONFIG, SCENE_01_PHASE_ORDER, type PhaseWindow, type Scene01CameraFraming, type Scene01Config, type Scene01PhaseName } from './config'
import type { AssemblyLayout } from './layout'
import { createDeparturePath, createJourneyGeometry } from './departurePath'
import { assignRig, createFinalRig, createInitialRig, type CouplingPose, type CouplingRig, type FinalRigState } from './rig'

export interface CouplingTimelineRefs {
  /** The pinned `<section>`: the ScrollTrigger's trigger and pin target. */
  section: RefObject<HTMLElement | null>
  /** Opening hero copy; its inline opacity follows `rig.overlay.heroOpacity`. */
  hero: RefObject<HTMLElement | null>
  /** Closing caption; its inline opacity follows `rig.overlay.captionOpacity`. */
  caption: RefObject<HTMLElement | null>
}

export interface UseCouplingTimelineOptions {
  refs: CouplingTimelineRefs
  /** The mutable rig the stage reads every frame. Mutated in place; its identity is preserved. */
  rig: CouplingRig
  layout: AssemblyLayout
  /** Defaults to `SCENE_01_CONFIG`. A new config identity rebuilds the timeline. */
  config?: Scene01Config
  /** Fired when the active phase changes, and once with the starting phase right after the timeline is built. */
  onPhaseChange?: (phase: Scene01PhaseName) => void
  /** Derived vehicle transforms, exposed on the development debug handle only. */
  pose?: CouplingPose
}

export type CouplingTimelineMode = 'scrub' | 'static'

export interface CouplingTimelineState {
  /** 'scrub' = scroll-driven timeline on a pinned section; 'static' = reduced-motion presentation without a timeline. */
  mode: CouplingTimelineMode
}

export interface CouplingPhaseLabel {
  name: Scene01PhaseName
  start: number
  end: number
}

/** Development-only handle exposed as `window.__MMIPL_SCENE01__` for manual testing from the browser console. */
export interface Scene01DebugHandle {
  rig: CouplingRig
  layout: AssemblyLayout
  pose?: CouplingPose
  /** The scrubbed timeline, or null in static mode. */
  timeline: gsap.core.Timeline | null
  /** The timeline's ScrollTrigger, or undefined in static mode. */
  scrollTrigger: gsap.core.Timeline['scrollTrigger']
  mode: CouplingTimelineMode
}

declare global {
  interface Window {
    /** Set by `useCouplingTimeline` in development builds only; removed on cleanup. */
    __MMIPL_SCENE01__?: Scene01DebugHandle
  }
}

/** The hold phase each reduced-motion frame shows. */
const STATIC_FRAME_PHASE: Readonly<Record<Scene01Config['reducedMotion']['frame'], Scene01PhaseName>> = {
  coupled: 'couplingHold',
  highway: 'highwayHold',
  city: 'cityHold',
  loaded: 'loadedHold',
}

/** The camera framing of each reduced-motion frame. */
const STATIC_FRAME_FRAMING: Readonly<Record<Scene01Config['reducedMotion']['frame'], Scene01CameraFraming>> = {
  coupled: 'heroHold',
  highway: 'highway',
  city: 'city',
  loaded: 'loading',
}

/** Fraction of the coupling-hold phase the camera push-in occupies (it settles before the phase ends). */
const HERO_DOLLY_PORTION = 0.75
/** Fraction of the heroHold phase that elapses before the closing caption starts fading in. */
const CAPTION_DELAY_PORTION = 0.15

/** Phase labels in timeline order, as absolute timeline times (0–1). Pure. */
export function getCouplingPhaseLabels(config: Scene01Config = SCENE_01_CONFIG): Array<CouplingPhaseLabel> {
  return SCENE_01_PHASE_ORDER.map((name) => {
    const { start, end } = config.phases[name]
    return { name, start, end }
  })
}

function len(w: PhaseWindow): number {
  return w.end - w.start
}

/** Writes an overlay opacity to an element; fully transparent elements are also hidden so they cannot be focused or read. */
function applyOverlayOpacity(el: HTMLElement | null, opacity: number): void {
  if (!el) return
  const clamped = Math.min(1, Math.max(0, opacity))
  el.style.opacity = String(clamped)
  el.style.visibility = clamped <= 0.001 ? 'hidden' : 'visible'
}

/** Removes the inline overrides so the stylesheet's defaults apply again. */
function clearOverlayOpacity(el: HTMLElement | null): void {
  if (!el) return
  el.style.opacity = ''
  el.style.visibility = ''
}

/** First-render guess at the mode so `data-mode` is right before the layout effect runs. The matchMedia context is the source of truth. */
function detectInitialMode(): CouplingTimelineMode {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'scrub'
  return window.matchMedia(FULL_MOTION_QUERY).matches ? 'scrub' : 'static'
}

/**
 * Adds every tween and label to an empty timeline. Positions are absolute
 * timeline times; with contiguous phases ending at 1 the result lasts exactly 1.
 */
function populateTimeline(tl: gsap.core.Timeline, rig: CouplingRig, layout: AssemblyLayout, config: Scene01Config): void {
  const { phases, easing, overlay, departure } = config
  const A = phases.approach
  const CH = phases.couplingHold
  const ES = phases.establish
  const DP = phases.departure
  const path = createDeparturePath(layout.pullerFinal, departure)
  // Camera stage of a named framing (its index in camera.sequence; validateScene01Config checks the order).
  const stageOf = (name: Scene01CameraFraming): number => Math.max(0, config.camera.sequence.indexOf(name))

  // Mirrors progress onto the rig and pins the total duration to 1 (timeline time == scroll progress).
  tl.to(rig, { progress: 1, duration: 1, ease: 'none' }, 0)
  for (const name of SCENE_01_PHASE_ORDER) tl.addLabel(name, phases[name].start)
  tl.addLabel('end', 1)

  // Initial phase: nothing moves — the hold at the start is implicit.

  // Approach: the puller (from −X) and the trailer (from +X) travel over the SAME window with the SAME ease,
  // straight to their connected positions, so they move together and arrive together. No staging, no second move.
  tl.to(rig.puller, { x: layout.pullerFinal[0], duration: len(A), ease: easing.approach }, A.start)
  tl.to(rig.trailer, { x: layout.trailerFinal[0], duration: len(A), ease: easing.approach }, A.start)
  // The hero copy fades out early in the approach.
  tl.to(rig.overlay, { heroOpacity: 0, duration: len(A) * overlay.heroFadeOutPortion, ease: easing.overlay }, A.start)

  // Fleet garage: starts fading in part-way through the approach and is fully visible exactly when the vehicles
  // arrive, on the same scrubbed timeline, so scrolling back up fades it out with their retreat. It never fades out
  // on the way forward.
  const garage = config.environment.garage
  if (garage.enabled) {
    const fadeStart = A.start + len(A) * garage.fadeStartPortion
    tl.to(rig.garage, { opacity: 1, duration: Math.max(1e-4, A.end - fadeStart), ease: easing.garageFade }, fadeStart)
  }

  // Coupling hold: both vehicles stay put; a subtle camera push-in (stage 0 → 1), then the caption fades in.
  tl.to(rig.camera, { stage: stageOf('heroHold'), duration: len(CH) * HERO_DOLLY_PORTION, ease: easing.heroDolly }, CH.start)
  tl.to(
    rig.overlay,
    { captionOpacity: 1, duration: len(CH) * overlay.captionFadeInPortion, ease: easing.overlay },
    CH.start + len(CH) * CAPTION_DELAY_PORTION,
  )

  // Establishing shot: the camera pulls out to the wide framing (stage 1 → 2); the caption leaves with it.
  tl.to(rig.camera, { stage: stageOf('wide'), duration: len(ES), ease: easing.establish }, ES.start)
  tl.to(rig.overlay, { captionOpacity: 0, duration: len(ES) * overlay.captionFadeOutPortion, ease: easing.overlay }, ES.start)

  // Departure: ONE scalar — distance along the path — drives both vehicles (see departurePath.ts), with a slow
  // start and stop. The garage stays fully visible and fixed in the world; the camera follows the combination off the
  // apron and settles on the right-aligned highway composition (stage 2 → 3), so the garage recedes behind it. From
  // `revealStart` the daylight replaces the enclosed-yard atmosphere, completing as the vehicle arrives: the city
  // emerges from the haze through the garage's drive-through openings and beyond its end.
  tl.to(rig.departure, { distance: path.totalLength, duration: len(DP), ease: easing.departure }, DP.start)
  const revealStart = DP.start + len(DP) * departure.revealStart
  tl.to(rig.atmosphere, { daylight: 1, duration: Math.max(1e-4, DP.end - revealStart), ease: easing.daylight }, revealStart)
  const settleStart = DP.start + len(DP) * departure.cameraSettleStart
  tl.to(rig.camera, { stage: stageOf('highway'), duration: Math.max(1e-4, DP.end - settleStart), ease: easing.cameraSettle }, settleStart)

  // Highway hold: nothing moves.

  // City journey: the combination drives on along the highway (travel) and the camera re-frames to the bottom-left
  // city composition and travels with it (stage 3 → 4, follow 1): the garage slides away behind and the city passes
  // with true parallax. Everything is a function of scroll, so scrolling up restores the highway hold exactly.
  const CI = phases.city
  const { journey } = config
  tl.to(rig.city, { travel: journey.travel, duration: len(CI), ease: easing.cityTravel }, CI.start)
  tl.to(rig.camera, { stage: stageOf('city'), duration: Math.max(1e-4, len(CI) * journey.cameraPortion), ease: easing.cityCamera }, CI.start)

  // City hold: nothing moves.

  // Industrial area: the combination drives on along the same highway, past the industrial compounds, to a stop just
  // beyond the Gemini Engi Fab gate (the far end of the parking path). The world stays fixed; the camera keeps
  // travelling with it, then from `entryCameraStart` settles on the static entry shot of the factory front (stage
  // city → entry), so the factory is revealed by the drive itself, not by a fade.
  const IN = phases.industrial
  const journeyGeometry = createJourneyGeometry(layout.pullerFinal, config)
  tl.to(rig.industrial, { travel: journeyGeometry.industrialTravel, duration: len(IN), ease: easing.industrialTravel }, IN.start)
  const entryStart = IN.start + len(IN) * journey.entryCameraStart
  tl.to(rig.camera, { stage: stageOf('entry'), duration: Math.max(1e-4, IN.end - entryStart), ease: easing.entryCamera }, entryStart)

  // Factory entry and parking: ONE reverse along the parking path, rest to rest, across both phases — through the
  // gate, through bay A's door (trailer leading) and on to the parking position beside the vessel. The camera holds
  // the entry shot, then follows the combination in: to the doorway framing, then through the door onto the loading
  // composition, arriving as the combination stops.
  const FE = phases.factoryEntry
  const PK = phases.parking
  const { parking } = config
  const reverseSpan = PK.end - FE.start
  tl.to(rig.parking, { reverse: journeyGeometry.parking.totalLength, duration: reverseSpan, ease: easing.reverse }, FE.start)
  const doorwayStart = FE.start + reverseSpan * parking.doorwayCameraStart
  const interiorStart = FE.start + reverseSpan * parking.interiorCameraStart
  tl.to(rig.camera, { stage: stageOf('doorway'), duration: Math.max(1e-4, interiorStart - doorwayStart), ease: easing.interiorCamera }, doorwayStart)
  tl.to(rig.camera, { stage: stageOf('loading'), duration: Math.max(1e-4, PK.end - interiorStart), ease: easing.interiorCamera }, interiorStart)
  // Interior light: the sun leaves the key light while the camera passes through the door.
  const { interiorLight } = parking
  const lightFrom = FE.start + reverseSpan * interiorLight.from
  tl.to(rig.atmosphere, { interior: 1, duration: Math.max(1e-4, reverseSpan * (interiorLight.to - interiorLight.from)), ease: 'sine.inOut' }, lightFrom)

  // Heavy lift (see loading.ts for what each stage moves): one scalar per stage, each in its own phase, slow and
  // deliberate. As the crane approaches the camera pulls back to the `lift` framing (the crane and rigging in the top
  // of the frame above the combination); as the rigging is released it returns to the loading composition.
  const { loading } = rig
  const crane = easing.crane
  const RG = phases.rigging
  const attachSpan = len(RG) * config.loading.timing.riggingAttachPortion
  tl.to(rig.camera, { stage: stageOf('lift'), duration: len(phases.craneApproach), ease: easing.interiorCamera }, phases.craneApproach.start)
  tl.to(rig.camera, { stage: stageOf('loading'), duration: len(phases.release), ease: easing.interiorCamera }, phases.release.start)
  tl.to(loading, { approach: 1, duration: len(phases.craneApproach), ease: crane }, phases.craneApproach.start)
  tl.to(loading, { attach: 1, duration: attachSpan, ease: crane }, RG.start)
  tl.to(loading, { tension: 1, duration: Math.max(1e-4, len(RG) - attachSpan), ease: crane }, RG.start + attachSpan)
  tl.to(loading, { lift: 1, duration: len(phases.lift), ease: crane }, phases.lift.start)
  tl.to(loading, { transfer: 1, duration: len(phases.transfer), ease: crane }, phases.transfer.start)
  tl.to(loading, { lower: 1, duration: len(phases.lowering), ease: crane }, phases.lowering.start)
  tl.to(loading, { release: 1, duration: len(phases.release), ease: crane }, phases.release.start)

  // Loaded hold: nothing moves.
}

/**
 * Drives the Scene 01 rig from scroll. Call once from the scene section; the
 * refs must be attached by the time layout effects run. Returns the active
 * presentation mode so the section can reflect it (e.g. `data-mode`).
 */
export function useCouplingTimeline(options: UseCouplingTimelineOptions): CouplingTimelineState {
  const { rig, layout, config = SCENE_01_CONFIG, onPhaseChange, pose } = options
  const { section, hero, caption } = options.refs

  const [mode, setMode] = useState<CouplingTimelineMode>(detectInitialMode)

  // Latest-callback ref: a new `onPhaseChange` identity must not tear down and rebuild the ScrollTrigger.
  const onPhaseChangeRef = useRef(onPhaseChange)
  useLayoutEffect(() => {
    onPhaseChangeRef.current = onPhaseChange
  }, [onPhaseChange])

  useLayoutEffect(() => {
    const notifyPhase = (phase: Scene01PhaseName): void => {
      onPhaseChangeRef.current?.(phase)
    }

    const publishDebugHandle = (handle: Scene01DebugHandle): void => {
      if (import.meta.env.DEV) window.__MMIPL_SCENE01__ = handle
    }

    const cleanupPresentation = (): void => {
      if (import.meta.env.DEV) delete window.__MMIPL_SCENE01__
      clearOverlayOpacity(hero.current)
      clearOverlayOpacity(caption.current)
    }

    /** Reduced-motion presentation: no timeline, no pin, no scroll listeners. Returns its cleanup. */
    const mountStatic = (): (() => void) => {
      setMode('static')
      const showFinal = config.reducedMotion.showFinalState
      // The static frame is the coupling hold, the highway hold, the city hold or the loaded vessel
      // (config.reducedMotion.frame).
      const frame = config.reducedMotion.frame
      const journeyGeometry = createJourneyGeometry(layout.pullerFinal, config)
      const loaded = frame === 'loaded'
      const coupled = frame === 'coupled'
      const finalState: FinalRigState = {
        cameraStage: config.camera.sequence.indexOf(STATIC_FRAME_FRAMING[frame]),
        departureDistance: coupled ? 0 : journeyGeometry.departure.totalLength,
        daylight: coupled ? 0 : 1,
        cityTravel: frame === 'city' || loaded ? config.journey.travel : 0,
        industrialTravel: loaded ? journeyGeometry.industrialTravel : 0,
        parkingReverse: loaded ? journeyGeometry.parking.totalLength : 0,
        interior: loaded ? 1 : 0,
        loadingDone: loaded ? 1 : 0,
      }
      const state = showFinal ? createFinalRig(layout, finalState) : createInitialRig(layout)
      // Reduced motion must never hide copy: both overlays are fully visible, and the rig mirrors that so diagnostics agree with the DOM.
      state.overlay.heroOpacity = 1
      state.overlay.captionOpacity = 1
      assignRig(rig, state)
      applyOverlayOpacity(hero.current, rig.overlay.heroOpacity)
      applyOverlayOpacity(caption.current, rig.overlay.captionOpacity)
      invalidate()
      notifyPhase(showFinal ? STATIC_FRAME_PHASE[frame] : 'initial')
      publishDebugHandle({ rig, layout, pose, timeline: null, scrollTrigger: undefined, mode: 'static' })
      return cleanupPresentation
    }

    /** Scroll-driven presentation: one pinned, scrubbed timeline. Returns its cleanup; gsap reverts the timeline itself. */
    const mountScrub = (trigger: HTMLElement): (() => void) => {
      setMode('scrub')
      assignRig(rig, createInitialRig(layout))

      let lastHero = Number.NaN
      let lastCaption = Number.NaN
      let lastPhase: Scene01PhaseName | null = null

      // Only touches the DOM when a value actually changed; most scrub frames move vehicles, not copy.
      const applyOverlay = (): void => {
        const { heroOpacity, captionOpacity } = rig.overlay
        if (heroOpacity !== lastHero) {
          lastHero = heroOpacity
          applyOverlayOpacity(hero.current, heroOpacity)
        }
        if (captionOpacity !== lastCaption) {
          lastCaption = captionOpacity
          applyOverlayOpacity(caption.current, captionOpacity)
        }
      }

      const syncPhase = (progress: number): void => {
        const phase = getPhaseAtProgress(config.phases, SCENE_01_PHASE_ORDER, progress)
        if (phase === lastPhase) return
        lastPhase = phase
        notifyPhase(phase)
      }

      const tl = createPinnedScrubTimeline({
        trigger,
        ...config.scroll,
        onUpdate: (progress) => {
          applyOverlay()
          invalidate()
          syncPhase(progress)
        },
        // After a refresh gsap re-renders the timeline at the current scroll position; make sure the overlay and canvas follow.
        onRefresh: () => {
          applyOverlay()
          invalidate()
          syncPhase(tl.progress())
        },
      })
      populateTimeline(tl, rig, layout, config)

      // Initial state before the first scroll event: overlay opacities, a canvas frame and the starting phase.
      applyOverlay()
      invalidate()
      syncPhase(tl.progress())

      if (import.meta.env.DEV && Math.abs(tl.duration() - 1) > 1e-6) {
        console.warn(`[scene-01] timeline duration is ${tl.duration()}, expected exactly 1 — check config.phases (see validateScene01Config).`)
      }
      publishDebugHandle({ rig, layout, pose, timeline: tl, scrollTrigger: tl.scrollTrigger, mode: 'scrub' })
      return cleanupPresentation
    }

    const mm = gsap.matchMedia()
    let matched = false

    mm.add({ full: FULL_MOTION_QUERY, reduced: REDUCED_MOTION_QUERY }, (ctx) => {
      matched = true
      const wantsScrub = ctx.conditions?.full === true
      const trigger = section.current
      if (wantsScrub && trigger) return mountScrub(trigger)
      if (wantsScrub && import.meta.env.DEV) {
        console.warn('[scene-01] refs.section is not attached; showing the static presentation instead of scrubbing.')
      }
      return mountStatic()
    })

    if (matched) {
      return () => {
        mm.revert()
      }
    }

    // Neither condition matched: this browser does not evaluate `prefers-reduced-motion` at all, so gsap never ran the
    // context function. Present statically; nothing created here was recorded by gsap, so it is cleaned up by hand.
    const cleanupFallback = mountStatic()
    return () => {
      cleanupFallback()
      mm.revert()
    }
  }, [section, hero, caption, rig, layout, config, pose])

  return { mode }
}
