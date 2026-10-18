/**
 * Fading helpers for environment geometry that has to appear gradually on the
 * scrubbed timeline (the garage fades in while the vehicles approach).
 *
 * `cloneMaterialsForFade` swaps every material under a group for a
 * transparent, depth-writing clone (one clone per distinct source material) so
 * shared materials elsewhere in the scene — e.g. the foreground vehicles'
 * placeholders, or a GLB cached by the loader — are never modified. Depth
 * writes stay on and the meshes get an explicit render order. A procedural
 * stand-in gives its parts their own front-to-back orders, so a half-faded
 * stand-in reads as one fading solid; a replacement model's meshes all share one
 * order, so while it is part-faded its inner surfaces can show through (it is
 * solid again once fully faded in).
 */
import { Material, Mesh, type Object3D } from 'three'

export interface FadeClones {
  clones: Material[]
  /**
   * Applies a fade (0–1) to every clone: each gets its source's own opacity × `fade`. With `restoreWhenOpaque`, a
   * fully faded-in object (fade 1) gets its authored transparency, depth writes, render order and shadow flags back,
   * so a replacement model's glazing stays translucent and its meshes cast and receive shadows as configured.
   */
  setOpacity: (fade: number) => void
  /** Puts the original materials back and disposes the clones (safe under StrictMode remounts). */
  restore: () => void
}

export interface CloneForFadeOptions {
  renderOrder: number
  /** Clear cast/receive shadow flags while the meshes are faded (a shadow would land at full strength before the object appears). */
  disableShadows?: boolean
  /** At fade 1, return to the authored material and mesh state (see `FadeClones.setOpacity`). */
  restoreWhenOpaque?: boolean
}

interface CloneRecord {
  clone: Material
  opacity: number
  transparent: boolean
  depthWrite: boolean
}

export function cloneMaterialsForFade(root: Object3D, { renderOrder, disableShadows = true, restoreWhenOpaque = false }: CloneForFadeOptions): FadeClones {
  const cloneOf = new Map<Material, CloneRecord>()
  const originals: Array<{ mesh: Mesh; material: Material | Material[]; renderOrder: number; castShadow: boolean; receiveShadow: boolean }> = []
  const fadeClone = (source: Material): Material => {
    let record = cloneOf.get(source)
    if (!record) {
      const clone = source.clone()
      record = { clone, opacity: source.opacity, transparent: source.transparent, depthWrite: source.depthWrite }
      clone.transparent = true
      clone.opacity = 0
      clone.depthWrite = true
      cloneOf.set(source, record)
    }
    return record.clone
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
  let opaqueState: boolean | null = null
  return {
    clones: Array.from(cloneOf.values(), (r) => r.clone),
    setOpacity: (fade) => {
      const opaque = restoreWhenOpaque && fade >= 1
      for (const r of cloneOf.values()) {
        r.clone.opacity = r.opacity * fade
        const transparent = opaque ? r.transparent : true
        // `transparent` selects a shader variant: recompile only when it actually flips.
        if (r.clone.transparent !== transparent) {
          r.clone.transparent = transparent
          r.clone.needsUpdate = true
        }
        r.clone.depthWrite = opaque ? r.depthWrite : true
      }
      if (opaque === opaqueState) return
      opaqueState = opaque
      for (const o of originals) {
        o.mesh.renderOrder = opaque ? o.renderOrder : renderOrder
        o.mesh.castShadow = opaque || !disableShadows ? o.castShadow : false
        o.mesh.receiveShadow = opaque || !disableShadows ? o.receiveShadow : false
      }
    },
    restore: () => {
      for (const o of originals) {
        o.mesh.material = o.material
        o.mesh.renderOrder = o.renderOrder
        o.mesh.castShadow = o.castShadow
        o.mesh.receiveShadow = o.receiveShadow
      }
      for (const r of cloneOf.values()) r.clone.dispose()
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
