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
 *
 * A loaded model is never mutated: the slot works on a copy (optionally merged
 * to one mesh per material, `mergeByMaterial`) and can repeat it (`instances`,
 * e.g. a city block tiled along the road), the copies sharing geometry.
 */
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import { Box3, Box3Helper, Color, Group, Mesh, Vector3, type BufferGeometry, type Material, type Object3D } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { ModelErrorBoundary } from '../assets/ModelErrorBoundary'
import { ModelLoader, configureModelLoader, getModelLoadErrorMessage } from '../assets/ValidatedGLTFLoader'
import { clamp01, cloneMaterialsForFade, type FadeClones } from './fadeMaterials'
import type { Vec3 } from '../assets/types'
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

interface PreparedModel {
  /** A copy of the loaded scene (merged by material when asked). The loader's cached scene is never mutated. */
  root: Object3D
  /** Releases the geometries the merge created (clones of the cached scene share its geometries and release nothing). */
  dispose: () => void
}

/** Materials and vertex layout decide what can be merged into one draw call. */
function mergeKey(mesh: Mesh): string {
  const geometry = mesh.geometry
  const material = mesh.material as Material
  return `${material.uuid}|${Object.keys(geometry.attributes).sort().join(',')}|${geometry.index ? 'i' : 'n'}`
}

function prepareModel(scene: Object3D, mergeByMaterial: boolean): PreparedModel {
  if (!mergeByMaterial) return { root: scene.clone(true), dispose: () => {} }
  scene.updateMatrixWorld(true)
  const root = new Group()
  root.name = 'merged'
  const groups = new Map<string, { material: Material; parts: BufferGeometry[] }>()
  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return
    if (Array.isArray(object.material)) {
      // Multi-material meshes keep their groups: copied as they are.
      const copy = object.clone()
      copy.applyMatrix4(object.matrixWorld)
      root.add(copy)
      return
    }
    const key = mergeKey(object)
    const part = (object.geometry as BufferGeometry).clone().applyMatrix4(object.matrixWorld)
    const group = groups.get(key)
    if (group) group.parts.push(part)
    else groups.set(key, { material: object.material as Material, parts: [part] })
  })
  const created: BufferGeometry[] = []
  for (const { material, parts } of groups.values()) {
    const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts, false)
    if (merged) {
      if (parts.length > 1) for (const part of parts) part.dispose()
      created.push(merged)
      const mesh = new Mesh(merged, material)
      mesh.name = material.name || 'merged'
      root.add(mesh)
    } else {
      // Incompatible parts (should not happen with the key above): keep them separate.
      for (const part of parts) {
        created.push(part)
        root.add(new Mesh(part, material))
      }
    }
  }
  return { root, dispose: () => created.forEach((g) => g.dispose()) }
}

const SINGLE_INSTANCE: ReadonlyArray<{ position: Vec3; rotationY: number }> = [{ position: [0, 0, 0], rotationY: 0 }]

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
  const rootRef = useRef<Group>(null)
  const fadeRef = useRef<FadeClones | null>(null)
  const lastOpacity = useRef(Number.NaN)
  const invalidate = useThree((state) => state.invalidate)
  const wantsFade = getOpacity !== undefined
  const instances = model.instances ?? SINGLE_INSTANCE
  const merge = model.mergeByMaterial === true

  useEffect(() => {
    if (result.status === 'unavailable') warnOnce(name, result.error.message)
  }, [result, name])

  // One prepared copy, cloned (sharing geometry and materials) for every further instance.
  const prepared = useMemo(() => (scene ? prepareModel(scene, merge) : null), [scene, merge])
  const copies = useMemo(() => (prepared ? instances.map((_, i) => (i === 0 ? prepared.root : prepared.root.clone(true))) : []), [prepared, instances])
  useEffect(() => () => prepared?.dispose(), [prepared])

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root || !prepared) return
    root.traverse((object) => {
      if (!(object instanceof Mesh)) return
      object.castShadow = model.castShadow
      object.receiveShadow = model.receiveShadow
    })
    if (wantsFade) {
      fadeRef.current = cloneMaterialsForFade(root, { renderOrder: fadeRenderOrder, restoreWhenOpaque: true })
      lastOpacity.current = Number.NaN
    }
    invalidate()
    return () => {
      fadeRef.current?.restore()
      fadeRef.current = null
    }
  }, [prepared, copies, model.castShadow, model.receiveShadow, fadeRenderOrder, invalidate, wantsFade])

  useFrame(() => {
    const fade = fadeRef.current
    const root = rootRef.current
    if (!fade || !getOpacity || !root) return
    const opacity = clamp01(getOpacity())
    if (opacity === lastOpacity.current) return
    lastOpacity.current = opacity
    fade.setOpacity(opacity)
    root.visible = opacity > 0.001
  })

  if (!prepared) return <>{placeholder}</>
  return (
    <group ref={rootRef} name={`environment:${name}:model`}>
      {instances.map((instance, i) => (
        <group key={i} name={`environment:${name}:model:${i}`} position={instance.position} rotation={[0, instance.rotationY, 0]}>
          <group position={model.position} rotation={model.rotation} scale={model.scale}>
            <primitive object={copies[i]} />
          </group>
        </group>
      ))}
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
