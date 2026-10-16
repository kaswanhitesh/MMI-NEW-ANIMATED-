/**
 * SCENE REGISTRY — the single list of cinematic scenes on the site.
 *
 * Only `implemented` scenes carry a `load()` and are rendered. Planned scenes
 * are documented here so the roadmap is visible in code, but nothing of theirs
 * is imported, bundled or executed. To add a scene, see the lifecycle notes in
 * ./types.ts.
 */
import type { SceneDefinition, SceneId } from './types'

export const SCENE_REGISTRY: readonly SceneDefinition[] = [
  {
    id: 'scene-01-coupling',
    order: 1,
    title: 'Heavy-haul assembly',
    summary: 'A puller truck reverses onto a hydraulic axle trailer to form a heavy-haul combination.',
    status: 'implemented',
    load: () => import('./scene-01-coupling'),
  },
  {
    id: 'scene-02-odc-loading',
    order: 2,
    title: 'Oversized cargo loading & ODC movement',
    summary: 'Over-dimensional cargo is loaded, secured and moved on a modular trailer.',
    status: 'planned',
  },
  {
    id: 'scene-03-heavy-lift',
    order: 3,
    title: 'Cranes & heavy lifting',
    summary: 'Crawler and mobile cranes execute a tandem heavy lift.',
    status: 'planned',
  },
  {
    id: 'scene-04-manlift',
    order: 4,
    title: 'Truck-mounted manlift operations',
    summary: 'Truck-mounted aerial work platforms deployed on site.',
    status: 'planned',
  },
  {
    id: 'scene-05-multimodal',
    order: 5,
    title: 'Project logistics & multimodal transportation',
    summary: 'Road, rail, river and ocean legs choreographed into one project movement.',
    status: 'planned',
  },
]

export function getImplementedScenes(): SceneDefinition[] {
  return SCENE_REGISTRY.filter((s): s is SceneDefinition & { load: NonNullable<SceneDefinition['load']> } => s.status === 'implemented' && !!s.load).sort(
    (a, b) => a.order - b.order,
  )
}

export function getSceneDefinition(id: SceneId): SceneDefinition | undefined {
  return SCENE_REGISTRY.find((s) => s.id === id)
}
