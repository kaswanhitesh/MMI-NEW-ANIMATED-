/**
 * Scene 01's pinned section: the canvas with the coupling stage, the DOM
 * overlay (hero copy, closing caption, placeholder badge) and the scroll
 * timeline that drives both. The section resolves the assembly layout once,
 * creates the mutable rig the timeline tweens and the stage reads, validates
 * the config in development, and releases the loader cache for both models on
 * unmount. Class names are the contract with src/styles/scene.css.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { getModelEntry, releaseModel } from '../../three/assets'
import { SceneCanvas } from '../../three/canvas/SceneCanvas'
import { HeroCopy } from '../../site/hero/HeroCopy'
import { PlaceholderBadge } from '../../site/hero/PlaceholderBadge'
import { SceneCaption } from '../../site/hero/SceneCaption'
import type { SceneSectionProps } from '../types'
import { SCENE_01_CONFIG, type Scene01PhaseName } from './config'
import { resolveAssemblyLayout, validateScene01Config } from './layout'
import { createInitialRig, createPose } from './rig'
import { CouplingStage } from './stage/CouplingStage'
import { useCouplingTimeline } from './useCouplingTimeline'

const config = SCENE_01_CONFIG

/** Development-only config validation runs once per session, not once per mount (StrictMode mounts twice). */
let configValidated = false

export function CouplingScene({ sceneId, index }: SceneSectionProps) {
  const sectionRef = useRef<HTMLElement | null>(null)
  const heroRef = useRef<HTMLDivElement | null>(null)
  const captionRef = useRef<HTMLDivElement | null>(null)

  const [ready, setReady] = useState(false)
  const [phase, setPhase] = useState<Scene01PhaseName>('initial')

  const layout = useMemo(() => resolveAssemblyLayout(config), [])
  const rig = useMemo(() => createInitialRig(layout), [layout])
  const pose = useMemo(() => createPose(layout), [layout])

  useEffect(() => {
    if (!import.meta.env.DEV || configValidated) return
    configValidated = true
    for (const warning of validateScene01Config(config)) console.warn(`[scene-01] ${warning}`)
  }, [])

  // The loader cache is released when the section leaves the page so GPU memory does not outlive the scene.
  useEffect(
    () => () => {
      releaseModel(getModelEntry(config.models.puller))
      releaseModel(getModelEntry(config.models.trailer))
    },
    [],
  )

  const { mode } = useCouplingTimeline({
    refs: { section: sectionRef, hero: heroRef, caption: captionRef },
    rig,
    layout,
    config,
    onPhaseChange: setPhase,
    pose,
  })

  return (
    <section
      ref={sectionRef}
      className="scene-section"
      id={`scene-${index + 1}`}
      data-scene={sceneId}
      data-mode={mode}
      aria-label="Heavy-haul assembly animation"
    >
      <div className="scene-section__stage">
        <SceneCanvas
          rendering={config.rendering}
          camera={{ fov: config.camera.fov, near: config.camera.near, far: config.camera.far }}
          backgroundColor={config.environment.backgroundColor}
          toneMappingExposure={config.lighting.toneMappingExposure}
          onReady={() => setReady(true)}
        >
          <CouplingStage rig={rig} pose={pose} layout={layout} config={config} />
        </SceneCanvas>
        <div className={`scene-section__loading${ready ? ' is-hidden' : ''}`} aria-hidden={ready}>
          Preparing scene…
        </div>
      </div>
      <div className="scene-section__overlay">
        <HeroCopy ref={heroRef} />
        <SceneCaption ref={captionRef} />
        <div className="scene-section__status">
          {config.placeholders.showBadge && <PlaceholderBadge models={[config.models.puller, config.models.trailer]} />}
          {import.meta.env.DEV && <span className="scene-section__phase">{phase}</span>}
        </div>
      </div>
    </section>
  )
}
