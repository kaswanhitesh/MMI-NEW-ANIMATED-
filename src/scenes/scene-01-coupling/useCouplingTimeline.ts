/**
 * Scene 01 timeline hook.
 *
 * Builds the ONE scroll-scrubbed GSAP timeline that drives the coupling rig —
 * puller / trailer positions, the camera hero blend and the overlay opacities —
 * and binds it to a pinned ScrollTrigger on the scene section. Everything
 * happens inside a `gsap.matchMedia()` context keyed on `prefers-reduced-motion`,
 * so users who ask for reduced motion get the completed combination rendered
 * statically (no pin, no scrub, all copy visible) instead. The whole context is
 * reverted on unmount, which also kills the ScrollTrigger and its tweens.
 *
 * Timeline time == scroll progress: the total duration is pinned to exactly 1,
 * phase windows from the config are placed at absolute positions and exposed as
 * labels (`initial`, `approach`, `heroHold`, `end`). Both vehicles travel
 * during `approach` on the same window with the same ease, so they move
 * simultaneously and reach their connected positions together; nothing moves
 * afterwards. All tuning numbers come from the scene config.
 */
import { invalidate } from '@react-three/fiber'
import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { gsap } from '../../animation/gsap'
import { createPinnedScrubTimeline, getPhaseAtProgress } from '../../animation/scrollTimeline'
import { FULL_MOTION_QUERY, REDUCED_MOTION_QUERY } from '../../animation/useReducedMotion'
import { SCENE_01_CONFIG, SCENE_01_PHASE_ORDER, type PhaseWindow, type Scene01Config, type Scene01PhaseName } from './config'
import type { AssemblyLayout } from './layout'
import { assignRig, createFinalRig, createInitialRig, type CouplingRig } from './rig'

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

/** Fraction of the heroHold phase the camera push-in occupies (it settles before the phase ends). */
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
  const { phases, easing, overlay } = config
  const A = phases.approach
  const E = phases.heroHold

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

  // Warehouse backdrop: starts fading in part-way through the approach and is fully visible exactly when the
  // vehicles arrive, on the same scrubbed timeline, so scrolling back up fades it out with their retreat.
  const warehouse = config.environment.warehouse
  if (warehouse.enabled) {
    const fadeStart = A.start + len(A) * warehouse.fadeStartPortion
    tl.to(rig.warehouse, { opacity: 1, duration: Math.max(1e-4, A.end - fadeStart), ease: easing.warehouseFade }, fadeStart)
  }

  // Hero hold: both vehicles stay put; a subtle camera push-in, then the closing caption fades in.
  tl.to(rig.camera, { heroBlend: 1, duration: len(E) * HERO_DOLLY_PORTION, ease: easing.heroDolly }, E.start)
  tl.to(
    rig.overlay,
    { captionOpacity: 1, duration: len(E) * overlay.captionFadeInPortion, ease: easing.overlay },
    E.start + len(E) * CAPTION_DELAY_PORTION,
  )
}

/**
 * Drives the Scene 01 rig from scroll. Call once from the scene section; the
 * refs must be attached by the time layout effects run. Returns the active
 * presentation mode so the section can reflect it (e.g. `data-mode`).
 */
export function useCouplingTimeline(options: UseCouplingTimelineOptions): CouplingTimelineState {
  const { rig, layout, config = SCENE_01_CONFIG, onPhaseChange } = options
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
      const state = showFinal ? createFinalRig(layout) : createInitialRig(layout)
      // Reduced motion must never hide copy: both overlays are fully visible, and the rig mirrors that so diagnostics agree with the DOM.
      state.overlay.heroOpacity = 1
      state.overlay.captionOpacity = 1
      assignRig(rig, state)
      applyOverlayOpacity(hero.current, rig.overlay.heroOpacity)
      applyOverlayOpacity(caption.current, rig.overlay.captionOpacity)
      invalidate()
      notifyPhase(showFinal ? 'heroHold' : 'initial')
      publishDebugHandle({ rig, layout, timeline: null, scrollTrigger: undefined, mode: 'static' })
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
      publishDebugHandle({ rig, layout, timeline: tl, scrollTrigger: tl.scrollTrigger, mode: 'scrub' })
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
  }, [section, hero, caption, rig, layout, config])

  return { mode }
}
