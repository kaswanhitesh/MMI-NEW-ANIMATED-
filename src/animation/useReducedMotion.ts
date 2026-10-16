/**
 * `prefers-reduced-motion` exposed as a React external store, plus the two
 * media-query strings the animation layer keys on. The constants are shared
 * with `gsap.matchMedia()` contexts so React and GSAP agree on exactly the
 * same conditions.
 */
import { useSyncExternalStore } from 'react'

/** The user has asked the OS / browser to reduce motion. */
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
/** The user has expressed no preference: full scroll-driven motion is acceptable. */
export const FULL_MOTION_QUERY = '(prefers-reduced-motion: no-preference)'

function canMatchMedia(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
}

function subscribe(onStoreChange: () => void): () => void {
  if (!canMatchMedia()) return () => undefined
  const mql = window.matchMedia(REDUCED_MOTION_QUERY)
  mql.addEventListener('change', onStoreChange)
  return () => mql.removeEventListener('change', onStoreChange)
}

/**
 * A fresh MediaQueryList is created per read on purpose: some browsers only
 * update a cached list's `matches` while dispatching its own change event.
 */
function getSnapshot(): boolean {
  return canMatchMedia() && window.matchMedia(REDUCED_MOTION_QUERY).matches
}

/** Server / pre-hydration value. Motion is opted out of later, never assumed. */
function getServerSnapshot(): boolean {
  return false
}

/** True while the user prefers reduced motion. Updates live when the preference changes. SSR-safe (false on the server). */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
