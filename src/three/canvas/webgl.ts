/**
 * WebGL capability probe, run once before the React Three Fiber canvas mounts.
 * It tries to create a WebGL 2 context and then a WebGL 1 context on a
 * throwaway canvas, releases that context again and memoises the verdict so
 * repeated renders never allocate further contexts. Safe to call without a
 * DOM (server-side rendering reports "unsupported" without memoising, so the
 * browser probes for itself after hydration).
 */

export interface WebGLSupport {
  supported: boolean
  /** Short, human-readable explanation when `supported` is false. */
  reason?: string
}

let memoised: WebGLSupport | undefined

/** Returns whether a WebGL context can be created in this environment. Memoised in the browser. */
export function detectWebGLSupport(): WebGLSupport {
  if (memoised) return memoised
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { supported: false, reason: 'No browser environment is available.' }
  }
  memoised = probe()
  return memoised
}

function probe(): WebGLSupport {
  try {
    if (!('WebGLRenderingContext' in window)) {
      return { supported: false, reason: 'This browser does not implement WebGL.' }
    }
    const canvas = document.createElement('canvas')
    const attributes: WebGLContextAttributes = { failIfMajorPerformanceCaveat: false }
    const context = canvas.getContext('webgl2', attributes) ?? canvas.getContext('webgl', attributes)
    if (!context) {
      return {
        supported: false,
        reason: 'WebGL is disabled or not available on this device. Hardware acceleration may be switched off in the browser settings.',
      }
    }
    // Release the throwaway context so it does not count against the browser's live-context limit.
    context.getExtension('WEBGL_lose_context')?.loseContext()
    return { supported: true }
  } catch (error) {
    const detail = error instanceof Error && error.message ? `: ${error.message}` : '.'
    return { supported: false, reason: `WebGL could not be initialised${detail}` }
  }
}
