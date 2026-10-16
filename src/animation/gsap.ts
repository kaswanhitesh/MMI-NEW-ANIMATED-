/**
 * Single GSAP entry point for the site.
 *
 * Registers the ScrollTrigger plugin exactly once, applies the global
 * ScrollTrigger configuration and schedules a refresh once web fonts have
 * settled (a late font swap changes document height, which would otherwise
 * leave pinned sections with stale start/end positions).
 *
 * Every module that animates must import `gsap` / `ScrollTrigger` from HERE,
 * never from the package directly, so registration can never be skipped.
 */
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

/** Module flag: Vite may evaluate this module once per app, but HMR or test harnesses can re-import it. */
let registered = false

function registerOnce(): void {
  if (registered) return
  registered = true

  // Safe without a window: ScrollTrigger.register() defers DOM listeners until one exists.
  gsap.registerPlugin(ScrollTrigger)

  // Mobile browsers resize the viewport whenever the address bar collapses; refreshing every pinned
  // trigger on each of those events causes visible jumps mid-scroll, so only real resizes count.
  ScrollTrigger.config({ ignoreMobileResize: true })

  const fonts = typeof document !== 'undefined' ? document.fonts : undefined
  if (fonts && fonts.ready) {
    // `fonts.ready` never rejects per spec; the no-op rejection handler is belt and braces.
    fonts.ready.then(
      () => ScrollTrigger.refresh(),
      () => undefined,
    )
  }
}

registerOnce()

export { gsap, ScrollTrigger }
