/**
 * TEMPORARY procedural stand-in for a fabricated steel saddle (cradle) that
 * supports a horizontal pressure vessel. A detailed GLB authored in the same
 * frame can replace it through an environment slot.
 *
 * LOCAL FRAME (VesselSaddleConfig, ./types.ts): origin on the ground (or deck)
 * under the saddle centre; X along the vessel axis, Z across it, Y up.
 *
 * Construction:
 *  - base plate, `thickness` (X) by `width` (Z), 35 mm thick, on y = 0;
 *  - a vertical web plate in the YZ plane whose top follows the cradle and whose
 *    flanks run from the base out to the horns;
 *  - three vertical stiffener ribs (XY plane) at the centre and towards the edges;
 *  - the curved cradle plate spanning `wrapAngle` around the bottom, with a
 *    wear-pad strip (`colors.pad`) inlaid flush along its middle and steel lips
 *    either side. Their common contact surface has radius vesselDiameter/2 + 12 mm
 *    and its innermost point is exactly at y = `height`, so a vessel of
 *    `vesselDiameter` placed with its lowest shell point at y = `height` rests on
 *    it; the vessel's own 12 mm wear pads sink into the cradle and stay hidden.
 *
 * Props: `config`; `receiveShadow` (default true); `castShadow` (default true,
 * optional extra). Cost: two merged meshes (steel, pad), i.e. 2 draw calls plus
 * the shadow passes. Geometries and materials are disposed on change and unmount.
 */
import { useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo } from 'react'
import { BoxGeometry, ExtrudeGeometry, MeshStandardMaterial, Shape, type BufferGeometry } from 'three'
import type { VesselSaddleConfig } from './types'
import { annularSector, mergeParts, WEAR_PAD } from './vesselGeometry'

export interface VesselSaddleProps {
  config: VesselSaddleConfig
  receiveShadow?: boolean
  castShadow?: boolean
}

type PartKey = 'steel' | 'pad'
const PART_KEYS: readonly PartKey[] = ['steel', 'pad']
type SaddleParts = Record<PartKey, BufferGeometry | null>

/** Plate thicknesses (m): wear-pad strip / lips, cradle plate, base plate, web, ribs. */
const LINER = 0.01
const CRADLE = 0.025
const BASE = 0.035
const WEB = 0.025
const RIB = 0.025
const SEGMENTS = 96

/** Builds the saddle in its LOCAL frame, merged per material. Pure. */
function buildSaddleParts(cfg: VesselSaddleConfig): SaddleParts {
  const T = cfg.thickness
  const W = cfg.width
  // Contact surface: radius D/2 + 12 mm (the vessel's wear-pad thickness), innermost point at y = height.
  const contact = cfg.vesselDiameter / 2 + WEAR_PAD.proud
  const cy = cfg.height + contact
  const plateIn = contact + LINER
  const plateOut = plateIn + CRADLE
  const half = Math.min(Math.max(cfg.wrapAngle / 2, 0.15), 1.4)
  const a0 = Math.PI - half
  const a1 = Math.PI + half
  const strip = Math.max(T - 0.1, T * 0.7)

  const steel: BufferGeometry[] = []
  const pad: BufferGeometry[] = []
  const lift = (parts: BufferGeometry[]) => parts.map((g) => g.translate(0, cy, 0))

  // --- Cradle: steel plate, steel lips at both X edges and the inlaid wear-pad strip (all built about the vessel axis). ---
  steel.push(...lift(annularSector(plateIn, plateOut, -T / 2, T / 2, a0, a1, { inner: false }, SEGMENTS)))
  steel.push(...lift(annularSector(contact, plateIn, -T / 2, -strip / 2, a0, a1, { outer: false, end: false }, SEGMENTS)))
  steel.push(...lift(annularSector(contact, plateIn, strip / 2, T / 2, a0, a1, { outer: false, start: false }, SEGMENTS)))
  pad.push(...lift(annularSector(contact, plateIn, -strip / 2, strip / 2, a0, a1, { outer: false, start: false, end: false }, SEGMENTS)))

  // --- Base plate. ---
  steel.push(new BoxGeometry(T, BASE, W).translate(0, BASE / 2, 0))

  // --- Web and ribs, from the base plate up into the cradle plate (their tops are buried half-way into it). ---
  const buried = plateOut - CRADLE / 2
  const bottom = BASE - 0.002
  const underside = (z: number) => cy - Math.sqrt(Math.max(buried * buried - z * z, 0))
  if (underside(0) - bottom > 0.03) {
    const baseHalf = W / 2 - 0.06
    const hornZ = buried * Math.sin(half)
    const hornY = cy - buried * Math.cos(half)
    const web = new Shape()
    web.moveTo(-baseHalf, bottom)
    web.lineTo(baseHalf, bottom)
    web.lineTo(hornZ, hornY)
    web.absarc(0, cy, buried, -Math.PI / 2 + half, -Math.PI / 2 - half, true)
    web.closePath()
    // Shape (u, v) = (z, y), extruded along the shape's normal, then turned so the extrusion runs along X.
    const webGeometry = new ExtrudeGeometry(web, { depth: WEB, bevelEnabled: false, curveSegments: 48 })
    steel.push(webGeometry.rotateY(-Math.PI / 2).translate(WEB / 2, 0, 0))

    const outerRib = 0.8 * Math.min(baseHalf, hornZ)
    for (const z of [-outerRib, 0, outerRib]) {
      const h = underside(z) - bottom
      if (h > 0.02) steel.push(new BoxGeometry(T - 0.04, h, RIB).translate(0, bottom + h / 2, z))
    }
  }

  return { steel: mergeParts(steel), pad: mergeParts(pad) }
}

function createSaddleMaterials(colors: VesselSaddleConfig['colors']): Record<PartKey, MeshStandardMaterial> {
  return {
    steel: new MeshStandardMaterial({ color: colors.steel, metalness: 0.5, roughness: 0.55 }),
    pad: new MeshStandardMaterial({ color: colors.pad, metalness: 0.2, roughness: 0.75 }),
  }
}

export function VesselSaddle({ config, receiveShadow = true, castShadow = true }: VesselSaddleProps) {
  const invalidate = useThree((state) => state.invalidate)
  const parts = useMemo(() => buildSaddleParts(config), [config])
  const { steel, pad } = config.colors
  const materials = useMemo(() => createSaddleMaterials({ steel, pad }), [steel, pad])

  useEffect(() => () => {
    for (const key of PART_KEYS) parts[key]?.dispose()
  }, [parts])
  useEffect(() => () => {
    for (const key of PART_KEYS) materials[key].dispose()
  }, [materials])
  // Demand frameloop: a rebuilt saddle must reach the screen even if nothing else is animating.
  useLayoutEffect(() => {
    invalidate()
  }, [parts, materials, invalidate])

  return (
    <group name="vessel-saddle">
      {PART_KEYS.map((key) => {
        const geometry = parts[key]
        if (!geometry) return null
        return <mesh key={key} name={`vessel-saddle:${key}`} geometry={geometry} material={materials[key]} castShadow={castShadow} receiveShadow={receiveShadow} />
      })}
    </group>
  )
}
