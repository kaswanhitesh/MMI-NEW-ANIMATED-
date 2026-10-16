/**
 * GPU resource disposal for a loaded model subtree: geometries, materials
 * (single or array) and the textures those materials reference. Used by
 * `releaseModel` once a scene no longer needs a cached GLB. three.js dispose
 * calls are idempotent, so running this twice on the same subtree is safe.
 */
import type { Material, Object3D, Texture } from 'three'

/** Texture-valued material properties that are released alongside the material. */
const TEXTURE_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap'] as const

interface Disposable {
  dispose(): void
}

/** Duck-typed view of Mesh / SkinnedMesh / InstancedMesh / Line / Points / Sprite — anything carrying geometry and material. */
interface RenderableLike extends Object3D {
  geometry?: Disposable
  material?: Material | Material[]
}

function isInstancedMeshLike(object: Object3D): boolean {
  return (object as { isInstancedMesh?: boolean }).isInstancedMesh === true
}

function isTexture(value: unknown): value is Texture {
  return typeof value === 'object' && value !== null && (value as Texture).isTexture === true
}

function isDisposable(value: unknown): value is Disposable {
  return typeof value === 'object' && value !== null && typeof (value as Disposable).dispose === 'function'
}

/**
 * Disposes every geometry, material and referenced texture under `root`
 * (inclusive). Shared resources are released once. The objects themselves are
 * left in the graph — detach the root separately if it is still mounted.
 */
export function disposeObject3D(root: Object3D): void {
  const geometries = new Set<Disposable>()
  const materials = new Set<Material>()

  root.traverse((object) => {
    const renderable = object as RenderableLike
    if (isDisposable(renderable.geometry)) geometries.add(renderable.geometry)

    const material = renderable.material
    if (Array.isArray(material)) material.forEach((m) => materials.add(m))
    else if (material) materials.add(material)

    // InstancedMesh.dispose() additionally releases its per-instance morph texture.
    if (isInstancedMeshLike(object)) object.dispose()
  })

  const textures = new Set<Texture>()
  materials.forEach((material) => {
    const slots = material as unknown as Record<string, unknown>
    for (const slot of TEXTURE_SLOTS) {
      const value = slots[slot]
      if (isTexture(value)) textures.add(value)
    }
  })

  geometries.forEach((geometry) => geometry.dispose())
  textures.forEach((texture) => texture.dispose())
  materials.forEach((material) => material.dispose())
}
