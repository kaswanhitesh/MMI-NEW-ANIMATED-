/**
 * EnvironmentSlot — one named, replaceable environment (garage, road, highway,
 * city). It renders a group called `environment:<name>` at the slot's world
 * transform and puts inside it EITHER the procedural placeholder (default) OR,
 * when `slot.model` is set, a detailed GLB — falling back to the placeholder
 * while it loads and if the file is missing or invalid, exactly like the
 * vehicle models do. Attachments passed as children (e.g. the garage's wall
 * sign) stay in the slot whichever geometry represents it, so they keep their
 * place when the slot moves or the model is replaced.
 *
 * Nothing here knows about the scroll timeline or the vehicles: the scene
 * hands the slot a placeholder and, optionally, a fade (`getOpacity`) that is
 * applied to a loaded model's (cloned) materials. Replacing an environment is
 * therefore a config change (`slot.model`), never a rewrite of the rig.
 */
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import { Box3, Box3Helper, Color, Mesh, Vector3 } from 'three'
import { ModelErrorBoundary } from '../assets/ModelErrorBoundary'
import { ModelLoader, configureModelLoader, getModelLoadErrorMessage } from '../assets/ValidatedGLTFLoader'
import { clamp01, cloneMaterialsForFade, setMaterialsOpacity, type FadeClones } from './fadeMaterials'
import type { EnvironmentModelConfig, EnvironmentSlotConfig } from './types'

export interface EnvironmentSlotProps {
  /** Short identifier; the slot's group is named `environment:<name>`. */
  name: string
  slot: EnvironmentSlotConfig
  /** Procedural stand-in, authored in slot-local space. */
  placeholder: ReactNode
  /** Optional fade for a loaded replacement model (0 = hidden, 1 = solid). Placeholders manage their own fades. */
  getOpacity?: () => number
  /** Render order given to a faded replacement model (front-to-back ordering with other faded content). */
  fadeRenderOrder?: number
  /** Draw the reserved bounds as a wireframe (development aid). */
  showBounds?: boolean
  /** Attachments that belong to this environment whatever geometry represents it. Slot-local. */
  children?: ReactNode
}

/** Environment names already reported in this session, so a missing file is logged once. */
const warned = new Set<string>()

function warnOnce(name: string, reason: string): void {
  if (!import.meta.env.DEV || warned.has(name)) return
  warned.add(name)
  console.warn(`[environment] ${name}: ${reason} — rendering the procedural placeholder.`)
}

function EnvironmentModel({
  name,
  model,
  placeholder,
  getOpacity,
  fadeRenderOrder,
}: {
  name: string
  model: EnvironmentModelConfig
  placeholder: ReactNode
  getOpacity?: () => number
  fadeRenderOrder: number
}) {
  const result = useLoader(ModelLoader, model.url, configureModelLoader)
  const scene = result.status === 'loaded' ? result.gltf.scene : null
  const fadeRef = useRef<FadeClones | null>(null)
  const lastOpacity = useRef(Number.NaN)
  const invalidate = useThree((state) => state.invalidate)
  const wantsFade = getOpacity !== undefined

  useEffect(() => {
    if (result.status === 'unavailable') warnOnce(name, result.error.message)
  }, [result, name])

  useLayoutEffect(() => {
    if (!scene) return
    scene.traverse((object) => {
      if (!(object instanceof Mesh)) return
      object.castShadow = model.castShadow
      object.receiveShadow = model.receiveShadow
    })
    if (wantsFade) {
      fadeRef.current = cloneMaterialsForFade(scene, { renderOrder: fadeRenderOrder })
      lastOpacity.current = Number.NaN
    }
    invalidate()
    return () => {
      fadeRef.current?.restore()
      fadeRef.current = null
      // The scene belongs to the loader cache: leave it as it was found.
      scene.visible = true
    }
  }, [scene, model.castShadow, model.receiveShadow, fadeRenderOrder, invalidate, wantsFade])

  useFrame(() => {
    const fade = fadeRef.current
    if (!fade || !getOpacity || !scene) return
    const opacity = clamp01(getOpacity())
    if (opacity === lastOpacity.current) return
    lastOpacity.current = opacity
    setMaterialsOpacity(fade.clones, opacity)
    scene.visible = opacity > 0.001
  })

  if (!scene) return <>{placeholder}</>
  return (
    <group name={`environment:${name}:model`} position={model.position} rotation={model.rotation} scale={model.scale}>
      <primitive object={scene} />
    </group>
  )
}

function SlotBounds({ bounds }: { bounds: EnvironmentSlotConfig['bounds'] }) {
  const helper = useMemo(() => {
    const box = new Box3(new Vector3(...bounds.min), new Vector3(...bounds.max))
    return new Box3Helper(box, new Color('#ff9f1c'))
  }, [bounds])
  useEffect(() => () => helper.dispose(), [helper])
  return <primitive object={helper} />
}

export function EnvironmentSlot({ name, slot, placeholder, getOpacity, fadeRenderOrder = -10, showBounds = false, children }: EnvironmentSlotProps) {
  const handleError = useCallback((error: unknown) => warnOnce(name, getModelLoadErrorMessage(error)), [name])
  return (
    <group name={`environment:${name}`} position={slot.position} rotation={[0, slot.rotationY, 0]}>
      {slot.model ? (
        <ModelErrorBoundary modelId={`environment:${name}`} fallback={placeholder} onError={handleError} resetKey={slot.model.url}>
          <Suspense fallback={placeholder}>
            <EnvironmentModel name={name} model={slot.model} placeholder={placeholder} getOpacity={getOpacity} fadeRenderOrder={fadeRenderOrder} />
          </Suspense>
        </ModelErrorBoundary>
      ) : (
        placeholder
      )}
      {children}
      {showBounds && <SlotBounds bounds={slot.bounds} />}
    </group>
  )
}
