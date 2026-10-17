/**
 * Fading helpers for environment geometry that has to appear gradually on the
 * scrubbed timeline (the garage fades in while the vehicles approach).
 *
 * `cloneMaterialsForFade` swaps every material under a group for a
 * transparent, depth-writing clone (one clone per distinct source material) so
 * shared materials elsewhere in the scene — e.g. the foreground vehicles'
 * placeholders, or a GLB cached by the loader — are never modified. Depth
 * writes stay on and the meshes get an explicit render order, so a half-faded
 * object reads as a fading solid rather than stacked translucent layers.
 */
import { Material, Mesh, type Object3D } from 'three'

export interface FadeClones {
  clones: Material[]
  /** Puts the original materials back and disposes the clones (safe under StrictMode remounts). */
  restore: () => void
}

export interface CloneForFadeOptions {
  renderOrder: number
  /** Clear cast/receive shadow flags on the faded meshes (a shadow would land at full strength before the object appears). */
  disableShadows?: boolean
}

export function cloneMaterialsForFade(root: Object3D, { renderOrder, disableShadows = true }: CloneForFadeOptions): FadeClones {
  const cloneOf = new Map<Material, Material>()
  const originals: Array<{ mesh: Mesh; material: Material | Material[]; renderOrder: number; castShadow: boolean; receiveShadow: boolean }> = []
  const fadeClone = (source: Material): Material => {
    let clone = cloneOf.get(source)
    if (!clone) {
      clone = source.clone()
      clone.transparent = true
      clone.opacity = 0
      clone.depthWrite = true
      cloneOf.set(source, clone)
    }
    return clone
  }
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return
    const source = object.material as Material | Material[]
    originals.push({ mesh: object, material: source, renderOrder: object.renderOrder, castShadow: object.castShadow, receiveShadow: object.receiveShadow })
    object.material = Array.isArray(source) ? source.map(fadeClone) : fadeClone(source)
    object.renderOrder = renderOrder
    if (disableShadows) {
      object.castShadow = false
      object.receiveShadow = false
    }
  })
  return {
    clones: Array.from(cloneOf.values()),
    restore: () => {
      for (const o of originals) {
        o.mesh.material = o.material
        o.mesh.renderOrder = o.renderOrder
        o.mesh.castShadow = o.castShadow
        o.mesh.receiveShadow = o.receiveShadow
      }
      for (const clone of cloneOf.values()) clone.dispose()
    },
  }
}

/** Writes one opacity to every material in the list. */
export function setMaterialsOpacity(materials: Iterable<Material>, opacity: number): void {
  for (const material of materials) material.opacity = opacity
}

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : Number.isFinite(value) ? value : 0
}
