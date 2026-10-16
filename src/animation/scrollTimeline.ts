/**
 * Scroll-driven timeline helpers shared by every cinematic scene: a factory
 * for a pinned, scrubbed GSAP timeline bound to a section element, and a pure
 * helper that maps timeline progress to a named phase.
 */
import { gsap } from './gsap'

export interface PinnedScrubOptions {
  /** The section element that is pinned while the timeline scrubs. Also the ScrollTrigger's trigger. */
  trigger: HTMLElement
  /** Pinned scroll distance as a multiple of the viewport height (3.2 = 320vh). Re-evaluated on every refresh. */
  distanceVh: number
  /** Scrub smoothing in seconds. 0 = hard-linked to the scroll position. */
  scrub: number
  /** ScrollTrigger `anticipatePin` — pins slightly early on fast scrolls to hide the pin frame. */
  anticipatePin: number
  /** Development aid: draw start/end markers. */
  markers: boolean
  /** Called on every timeline render with the timeline's progress (0–1). Runs in both scroll directions. */
  onUpdate?: (progress: number) => void
  /** Called after the ScrollTrigger recalculates its start/end positions (resize, fonts, refresh()). */
  onRefresh?: () => void
}

/**
 * Creates a timeline whose playhead is scrubbed by scrolling through `trigger`
 * while the element stays pinned. The timeline's own duration is whatever the
 * caller adds to it; scenes keep it at exactly 1 so timeline time == progress.
 *
 * `invalidateOnRefresh` makes the pinned distance and every tween's start
 * values re-resolve when the viewport changes.
 */
export function createPinnedScrubTimeline(opts: PinnedScrubOptions): gsap.core.Timeline {
  const { trigger, distanceVh, scrub, anticipatePin, markers, onUpdate, onRefresh } = opts
  return gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      trigger,
      start: 'top top',
      end: () => `+=${Math.round(window.innerHeight * distanceVh)}`,
      pin: true,
      pinSpacing: true,
      scrub,
      anticipatePin,
      invalidateOnRefresh: true,
      markers,
      onRefresh,
    },
    onUpdate: function (this: gsap.core.Timeline) {
      onUpdate?.(this.progress())
    },
  })
}

/**
 * Returns the phase that owns `progress`. Phases are expected to be contiguous
 * and ascending (as validated by the scene config); each owns the half-open
 * window [start, end), and the last phase additionally owns progress === 1.
 * Out-of-range or non-finite input clamps into [0, 1].
 */
export function getPhaseAtProgress<N extends string>(
  phases: Readonly<Record<N, { start: number; end: number }>>,
  order: readonly N[],
  progress: number,
): N {
  if (order.length === 0) throw new Error('getPhaseAtProgress: `order` must list at least one phase')
  const p = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0
  let current = order[0]
  for (const name of order) {
    if (p >= phases[name].start) current = name
    else break
  }
  return current
}
