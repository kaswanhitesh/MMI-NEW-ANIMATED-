/**
 * Scene 01 module entry — the default export the scene registry lazy-loads
 * (`import('./scene-01-coupling')`). It names the pinned Section, lists the
 * models the scene depends on and warms their loader cache on `preload()`.
 */
import type { SceneModule } from '../types'
import { getModelEntry, preloadModel } from '../../three/assets'
import { SCENE_01_CONFIG } from './config'
import { CouplingScene } from './CouplingScene'

const scene01Module: SceneModule = {
  id: 'scene-01-coupling',
  Section: CouplingScene,
  models: [SCENE_01_CONFIG.models.puller, SCENE_01_CONFIG.models.trailer],
  preload() {
    preloadModel(getModelEntry(SCENE_01_CONFIG.models.puller))
    preloadModel(getModelEntry(SCENE_01_CONFIG.models.trailer))
  },
}

export default scene01Module
