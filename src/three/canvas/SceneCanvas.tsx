/**
 * The site's React Three Fiber canvas wrapper. It probes WebGL support first
 * and renders a DOM fallback when there is none, wraps the canvas in an error
 * boundary, configures the renderer from the scene's `rendering` config
 * (demand frameloop, pixel-ratio clamp per pointer type, PCF shadows, tone
 * mapping exposure) and handles WebGL context loss / restoration. The canvas
 * never receives pointer events: scrolling passes straight through it and no
 * raycasting happens anywhere in the scene.
 *
 * Demand frameloop: nothing renders unless something calls `invalidate()`.
 * The scroll timeline does so on every update; components that change the
 * scene imperatively must do the same.
 */
import { Canvas, useThree, type RootState } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react'
import { PCFShadowMap } from 'three'
import { CanvasErrorBoundary } from './CanvasErrorBoundary'
import { detectWebGLSupport } from './webgl'
import { WebGLFallback } from './WebGLFallback'
import type { RenderingConfig } from './types'

export interface SceneCanvasProps {
  children: ReactNode
  /** Renderer settings (a scene config's `rendering` block). */
  rendering: RenderingConfig
  camera: { fov: number; near: number; far: number }
  /** Renderer clear colour (the scene usually also sets `scene.background`). */
  backgroundColor: string
  toneMappingExposure: number
  /** Called once after the canvas has mounted and requested its first frame. */
  onReady?: () => void
  className?: string
}

/**
 * Initial camera position; `useFramedCamera` replaces it on the first frame.
 * It only matters for the instant before that frame, so it is a neutral
 * front-on view rather than a tuned composition.
 */
const INITIAL_CAMERA_POSITION: [number, number, number] = [0, 6, 40]

const CANVAS_STYLE: CSSProperties = { position: 'absolute', inset: 0, pointerEvents: 'none' }

/** Debounce canvas re-measurement on scroll (the section is pinned and scrolls constantly) but not on real resizes. */
const RESIZE_OPTIONS = { debounce: { scroll: 50, resize: 0 } }

const RENDERER_FAILED_REASON = 'The 3D renderer failed to start.'

/** three r186 removed PCFSoftShadowMap; PCF with a per-light `shadow.radius` is the soft option now. */
const SHADOW_MAP_SETTINGS = { type: PCFShadowMap }

function hasCoarsePointer(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(pointer: coarse)').matches
}

export function SceneCanvas({ children, rendering, camera, backgroundColor, toneMappingExposure, onReady, className }: SceneCanvasProps) {
  const support = detectWebGLSupport()
  const coarsePointer = useMemo(() => hasCoarsePointer(), [])

  const dpr = useMemo<[number, number]>(() => {
    const [min, max] = coarsePointer ? rendering.dprMobile : rendering.dprDesktop
    return [min, max]
  }, [coarsePointer, rendering])

  const gl = useMemo(
    () => ({
      antialias: rendering.antialias,
      powerPreference: rendering.powerPreference,
      alpha: false,
      toneMappingExposure,
    }),
    [rendering, toneMappingExposure],
  )

  const cameraProps = useMemo(
    () => ({ fov: camera.fov, near: camera.near, far: camera.far, position: INITIAL_CAMERA_POSITION }),
    [camera.fov, camera.near, camera.far],
  )

  const handleCreated = useCallback(
    (state: RootState) => {
      // Alpha 0 matters for off-screen render targets (drei's ContactShadows clears its shadow texture with
      // this colour): an opaque clear would turn the whole contact-shadow plane into a dark overlay. The
      // on-screen buffer is opaque (`alpha: false`), so the page still sees the solid background colour.
      state.gl.setClearColor(backgroundColor, 0)
    },
    [backgroundColor],
  )

  if (!support.supported) {
    return <WebGLFallback reason={support.reason} />
  }

  return (
    <CanvasErrorBoundary fallback={<WebGLFallback reason={RENDERER_FAILED_REASON} />}>
      <Canvas
        className={className}
        frameloop="demand"
        dpr={dpr}
        shadows={rendering.shadows ? SHADOW_MAP_SETTINGS : false}
        gl={gl}
        camera={cameraProps}
        resize={RESIZE_OPTIONS}
        onCreated={handleCreated}
        style={CANVAS_STYLE}
      >
        {children}
        <ContextLossGuard />
        <ReadySignal onReady={onReady} />
        {import.meta.env.DEV && <DevStateBridge />}
      </Canvas>
    </CanvasErrorBoundary>
  )
}

/**
 * Keeps the renderer recoverable when the browser drops the WebGL context
 * (tab backgrounded on mobile, GPU reset). Calling preventDefault on
 * `webglcontextlost` tells the browser we want the context back; a frame is
 * requested as soon as it is restored.
 */
function ContextLossGuard() {
  const gl = useThree((state) => state.gl)
  const invalidate = useThree((state) => state.invalidate)

  useEffect(() => {
    const element = gl.domElement
    const handleLost = (event: Event) => {
      event.preventDefault()
    }
    const handleRestored = () => {
      invalidate()
    }
    element.addEventListener('webglcontextlost', handleLost, false)
    element.addEventListener('webglcontextrestored', handleRestored, false)
    return () => {
      element.removeEventListener('webglcontextlost', handleLost, false)
      element.removeEventListener('webglcontextrestored', handleRestored, false)
    }
  }, [gl, invalidate])

  return null
}

declare global {
  interface Window {
    /** Development builds only: the R3F root state of the most recently mounted SceneCanvas, for console and test tooling. */
    __MMIPL_R3F__?: { getState: () => RootState; invalidate: () => void }
  }
}

/** Development-only: exposes the R3F store on `window` so tests and the console can inspect or tweak the live scene. */
function DevStateBridge() {
  const getState = useThree((state) => state.get)
  const invalidate = useThree((state) => state.invalidate)
  useEffect(() => {
    window.__MMIPL_R3F__ = { getState, invalidate }
    return () => {
      if (window.__MMIPL_R3F__?.getState === getState) delete window.__MMIPL_R3F__
    }
  }, [getState, invalidate])
  return null
}

/**
 * Requests the first frame once the canvas tree has mounted and reports
 * readiness exactly once, with the callback that was current at mount time
 * (readiness is a one-off event, so later callback identities are irrelevant).
 */
function ReadySignal({ onReady }: { onReady?: () => void }) {
  const invalidate = useThree((state) => state.invalidate)
  const onReadyAtMount = useRef(onReady)

  useEffect(() => {
    invalidate()
    onReadyAtMount.current?.()
  }, [invalidate])

  return null
}
