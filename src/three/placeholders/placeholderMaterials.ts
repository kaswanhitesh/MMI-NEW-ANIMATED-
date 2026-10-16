/**
 * Shared materials for the TEMPORARY placeholder vehicles in src/three/placeholders.
 *
 * The five materials are created once at module level and are intentionally
 * never disposed: every placeholder mesh receives them through its `material`
 * prop, and React Three Fiber only disposes objects it instantiated itself, so
 * the same materials serve every placeholder for the lifetime of the page.
 * Palette is restrained and industrial — deep graphite paint, muted amber used
 * only for small accents, satin steel, near-black rubber and a mid-grey rim.
 */
import { MeshStandardMaterial } from 'three'

/**
 * Notice carried (in doc comments and development diagnostics) by every piece
 * of placeholder geometry. The placeholders exist only so the scene can be
 * developed and tested before the final models are delivered.
 */
export const PLACEHOLDER_NOTICE =
  'TEMPORARY development placeholder — not a representation of any real vehicle. Replace with the final GLB (see public/models/README.md).'

export const PLACEHOLDER_MATERIALS = Object.freeze({
  /** Deep graphite paint: cab, ballast body, trailer deck and gooseneck. */
  bodyPaint: new MeshStandardMaterial({ name: 'placeholder/body-paint', color: '#2f3338', roughness: 0.55, metalness: 0.35 }),
  /** Muted industrial amber, used sparingly: cab visor and hydraulic cylinder hints. */
  accent: new MeshStandardMaterial({ name: 'placeholder/accent', color: '#c8893a', roughness: 0.5, metalness: 0.2 }),
  /** Satin steel: chassis rails, coupling plate, side rails and fittings. */
  steel: new MeshStandardMaterial({ name: 'placeholder/steel', color: '#8d949c', roughness: 0.4, metalness: 0.8 }),
  /** Near-black rubber for every tyre. */
  tyre: new MeshStandardMaterial({ name: 'placeholder/tyre', color: '#141516', roughness: 0.95, metalness: 0 }),
  /** Mid-grey wheel rim / hub discs. */
  rim: new MeshStandardMaterial({ name: 'placeholder/rim', color: '#5b6168', roughness: 0.45, metalness: 0.7 }),
})

/** Keys of {@link PLACEHOLDER_MATERIALS}. */
export type PlaceholderMaterialName = keyof typeof PLACEHOLDER_MATERIALS
