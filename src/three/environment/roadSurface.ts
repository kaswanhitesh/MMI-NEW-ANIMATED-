/**
 * Shared ground-layer conventions and the procedural asphalt grain used by the
 * road environments (highway, exit road).
 *
 * Ground layers are separated by height so nothing coplanar can z-fight; the
 * yard floor additionally pushes itself back with a polygon offset:
 *   floor 0 · garage apron 2 mm · yard markings 4 mm · highway surfaces 7 mm ·
 *   exit road 11 mm · road paint 15 mm · contact shadows 20 mm.
 * The exit road lies ON TOP of the apron edge and the highway's far verge and
 * shoulder, so where it crosses them it simply covers them, and it tucks a few
 * centimetres into the carriageway so that joint never cracks.
 */
import { DataTexture, LinearFilter, LinearMipmapLinearFilter, MeshStandardMaterial, RepeatWrapping, RGBAFormat, SRGBColorSpace, type Texture } from 'three'

export const LIFT = {
  apron: 0.002,
  markings: 0.004,
  road: 0.007,
  exitRoad: 0.011,
  paint: 0.015,
  contactShadow: 0.02,
} as const

/** Metres covered by one tile of the grain texture. */
export const GRAIN_TILE = 7
const GRAIN_SIZE = 128

/** Deterministic grey grain texture (seeded LCG, so renders are reproducible). */
export function createGrainTexture(strength: number): DataTexture {
  const size = GRAIN_SIZE
  const data = new Uint8Array(size * size * 4)
  let seed = 1234567
  const next = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
  for (let i = 0; i < size * size; i++) {
    const v = 1 + (next() - 0.5) * 0.5 * strength
    const g = Math.max(0, Math.min(255, Math.round(v * 200)))
    data[i * 4] = g
    data[i * 4 + 1] = g
    data[i * 4 + 2] = g
    data[i * 4 + 3] = 255
  }
  const texture = new DataTexture(data, size, size, RGBAFormat)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.colorSpace = SRGBColorSpace
  // Mipmapped, trilinear and anisotropic: point-sampled noise at grazing angles would shimmer while scrolling.
  texture.magFilter = LinearFilter
  texture.minFilter = LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.anisotropy = 8
  texture.needsUpdate = true
  return texture
}

/**
 * Opaque road-surface material. Not tone-mapped (like the yard floor), so the
 * configured colours sit correctly against it and fog cleanly to the background.
 */
export function roadMaterial(color: string, roughness: number, map?: Texture): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, roughness, metalness: 0, map: map ?? null, toneMapped: false })
}

/** Lays planes built in XY flat on the ground (XZ). */
export const FLAT_EULER: [number, number, number] = [-Math.PI / 2, 0, 0]
