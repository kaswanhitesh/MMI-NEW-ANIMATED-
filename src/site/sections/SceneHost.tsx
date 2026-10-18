/**
 * Renders every implemented scene from the registry, in order, as a lazily
 * loaded pinned section. Scene code is split per module (`def.load()`), so
 * planned scenes cost nothing and a scene's three.js payload only downloads
 * when the site shell mounts it.
 *
 * A scene module's default export is a `SceneModule`, not a component, so the
 * loader is wrapped to hand `lazy()` the module's `Section`. The lazy
 * component for each scene id is created once at module level: recreating
 * `lazy()` on every render would remount the section (tearing down its canvas
 * and scroll timeline) each time the host re-rendered.
 *
 * While a scene's code is in flight, a skeleton with the scene section's exact
 * height (100svh, min 560px — see src/styles/scene.css) keeps the page from
 * shifting when the section arrives.
 */
import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react'
import { getImplementedScenes } from '../../scenes/registry'
import type { SceneDefinition, SceneId, SceneSectionProps } from '../../scenes/types'

type LazySection = LazyExoticComponent<ComponentType<SceneSectionProps>>

/** One lazy component per scene id for the lifetime of the page. */
const lazySections = new Map<SceneId, LazySection>()

function getLazySection(def: SceneDefinition): LazySection | null {
  const cached = lazySections.get(def.id)
  if (cached) return cached

  const load = def.load
  if (!load) return null

  const section: LazySection = lazy(async () => {
    const sceneModule = (await load()).default
    // Warm the asset caches as soon as the scene code is here; the section mounts a moment later and needs them.
    try {
      sceneModule.preload?.()
    } catch {
      // Preloading is an optimisation only; the section's own loaders report real failures.
    }
    return { default: sceneModule.Section }
  })
  lazySections.set(def.id, section)
  return section
}

export function SceneHost() {
  const scenes = getImplementedScenes()

  return (
    <>
      {scenes.map((def, index) => {
        const Section = getLazySection(def)
        if (!Section) return null
        return (
          <Suspense key={def.id} fallback={<div className="scene-skeleton" aria-busy="true" />}>
            <Section sceneId={def.id} index={index} />
          </Suspense>
        )
      })}
    </>
  )
}
