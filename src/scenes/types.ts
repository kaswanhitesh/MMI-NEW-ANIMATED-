/**
 * SCENE REGISTRY CONTRACTS
 * ========================
 * Every cinematic scene on the site is an independent module that plugs into
 * the registry (`src/scenes/registry.ts`). The site shell renders only scenes
 * whose status is `implemented`; planned scenes are listed for navigation /
 * roadmap purposes but their code is never imported or executed.
 *
 * SCENE LIFECYCLE
 * ---------------
 *  1. Registration — a `SceneDefinition` in the registry with a lazy `load()`.
 *  2. Mount        — `SceneHost` lazy-loads the module and renders its `Section`
 *                    inside a fixed-size shell (no layout shift while loading).
 *  3. Assets       — the Section mounts a `SceneCanvas`; model components resolve
 *                    GLBs through the asset layer with Suspense and fall back to
 *                    placeholders on error. `preload()` may warm caches earlier.
 *  4. Animation    — the Section builds ONE GSAP timeline bound to a pinned
 *                    ScrollTrigger (inside `gsap.matchMedia` so reduced-motion
 *                    users get a static alternative).
 *  5. Cleanup      — on unmount the Section reverts its GSAP context (kills the
 *                    ScrollTrigger + tweens) and the canvas disposes GPU resources.
 *
 * Adding Scene 02+ means: create `src/scenes/scene-02-.../` with its own
 * config.ts, Section and timeline, export a `SceneModule` as default, and flip
 * the registry entry to `status: 'implemented'` with a `load()`.
 */
import type { ComponentType } from 'react'
import type { ModelId } from '../three/assets/types'

export type SceneId =
  | 'scene-01-coupling'
  | 'scene-02-odc-loading'
  | 'scene-03-heavy-lift'
  | 'scene-04-manlift'
  | 'scene-05-multimodal'

export type SceneStatus = 'implemented' | 'planned'

export interface SceneSectionProps {
  /** The registry id, so a Section can be reused / introspected. */
  sceneId: SceneId
  /** Zero-based position in the page, for ids / anchors. */
  index: number
}

/** The runtime module an implemented scene exports as its default export. */
export interface SceneModule {
  id: SceneId
  /** The pinned scroll section. Owns its canvas, overlay copy, timeline and cleanup. */
  Section: ComponentType<SceneSectionProps>
  /** Models the scene depends on — used for preloading and asset status reporting. */
  models: readonly ModelId[]
  /** Optional: warm asset caches before the section scrolls into view. Must be safe to call multiple times. */
  preload?: () => void
}

export interface SceneDefinition {
  id: SceneId
  /** Display order on the page (ascending). */
  order: number
  title: string
  /** One-sentence description used by navigation / roadmap UI. */
  summary: string
  status: SceneStatus
  /** Lazy module loader. Present only for implemented scenes; never invoked for planned ones. */
  load?: () => Promise<{ default: SceneModule }>
}
