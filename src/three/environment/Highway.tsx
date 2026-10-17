/**
 * Procedural two-way highway running along X: asphalt carriageway with a
 * subtle generated grain texture, dashed centre line, solid edge lines, gravel
 * shoulders and verges, plus an optional paved ACCESS ROAD (any closed outline,
 * e.g. a yard exit that loops onto the highway) whose junction breaks the far
 * verge, shoulder and edge line. Flat planes and one shape; the dashes are a
 * single InstancedMesh; no image assets.
 *
 * Ground layers are separated by height so nothing coplanar can z-fight, and
 * the scene's yard floor pushes itself back with a polygon offset:
 *   floor 0 · yard markings 4 mm · highway surfaces 7 mm · access road 11 mm · paint 15 mm · contact shadows 20 mm.
 * The access road lies ON TOP of the far shoulder and verge, so where it crosses them it simply covers them
 * (a natural junction); it stops a few centimetres into the carriageway so that joint never cracks. Only
 * the far edge line is broken across the junction mouth. Everything lies below the contact-shadow plane, so vehicle
 * shadows fall onto the road; the meshes also receive the key-light shadow.
 *
 * `getOpacity()` is read every rendered frame and written to the materials,
 * so the scene's scroll timeline can crossfade the road in while the garage
 * fades out. Materials are not tone-mapped (like the yard floor), so the
 * configured colours sit correctly against it and fog to the background.
 */
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  DataTexture,
  Group,
  InstancedMesh,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  RepeatWrapping,
  RGBAFormat,
  Shape,
  SRGBColorSpace,
  Vector2,
  Vector3,
  type Texture,
} from 'three'
import type { HighwayConfig } from './types'

export interface HighwayAccessRoad {
  /** Closed outline in world XZ (metres). */
  outline: ReadonlyArray<readonly [number, number]>
  /** X range where it meets the far side of the highway; that stretch of the far edge line is omitted. */
  junction: readonly [number, number] | null
}

export interface HighwayProps {
  config: HighwayConfig
  /** Y of the ground plane the road lies on. */
  groundY: number
  /** Read every frame; 0 = invisible, 1 = fully visible. Clamped. */
  getOpacity: () => number
  /** Optional paved access road joining the highway's far side. */
  access?: HighwayAccessRoad
}

/** Heights above the ground plane (m); see the layer table above. */
const ROAD_LIFT = 0.007
const ACCESS_LIFT = 0.011
const PAINT_LIFT = 0.015
/** Grain texture size; one tile covers GRAIN_TILE metres. */
const GRAIN_SIZE = 128
const GRAIN_TILE = 7
/** Draw orders: after the garage (negative tens), before the yard's transparent overlays (0). */
const ORDER_SURFACE = -3
const ORDER_PAINT = -2

const _matrix = new Matrix4()
const _position = new Vector3()
const _scale = new Vector3(1, 1, 1)
const FLAT = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2)
const FLAT_EULER: [number, number, number] = [-Math.PI / 2, 0, 0]

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value
}

/** Deterministic grey grain texture (seeded LCG, so renders are reproducible). */
function createGrainTexture(strength: number): DataTexture {
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

function surfaceMaterial(color: string, roughness: number, map?: Texture): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, roughness, metalness: 0, map: map ?? null, transparent: true, opacity: 0, depthWrite: true, toneMapped: false })
}

/** Splits [−L/2, L/2] around an optional gap into the spans that remain. */
function spansAround(length: number, gap: readonly [number, number] | null): Array<[number, number]> {
  const a = -length / 2
  const b = length / 2
  if (!gap) return [[a, b]]
  const [g0, g1] = gap[0] < gap[1] ? gap : [gap[1], gap[0]]
  const out: Array<[number, number]> = []
  if (g0 > a) out.push([a, Math.min(g0, b)])
  if (g1 < b) out.push([Math.max(g1, a), b])
  return out
}

export function Highway({ config, groundY, getOpacity, access }: HighwayProps) {
  const groupRef = useRef<Group>(null)
  const dashesRef = useRef<InstancedMesh>(null)
  const lastOpacity = useRef(Number.NaN)
  const invalidate = useThree((state) => state.invalidate)

  const carriageway = config.lanes * config.laneWidth

  // One grain image, two samplers: the carriageway plane's UVs span its whole size, the access shape's UVs are metres.
  const textures = useMemo(() => {
    const road = createGrainTexture(config.grain)
    road.repeat.set(config.length / GRAIN_TILE, carriageway / GRAIN_TILE)
    const accessRoad = road.clone()
    accessRoad.repeat.set(1 / GRAIN_TILE, 1 / GRAIN_TILE)
    accessRoad.needsUpdate = true
    return { road, accessRoad }
  }, [config.grain, config.length, carriageway])

  const materials = useMemo(
    () => ({
      asphalt: surfaceMaterial(config.colors.asphalt, 0.95, textures.road),
      access: surfaceMaterial(config.colors.asphalt, 0.95, textures.accessRoad),
      shoulder: surfaceMaterial(config.colors.shoulder, 0.98),
      verge: surfaceMaterial(config.colors.verge, 1),
      centreLine: surfaceMaterial(config.colors.centreLine, 0.7),
      edgeLine: surfaceMaterial(config.colors.edgeLine, 0.7),
    }),
    [config.colors, textures],
  )

  useEffect(() => {
    return () => {
      for (const material of Object.values(materials)) material.dispose()
    }
  }, [materials])
  useEffect(
    () => () => {
      textures.road.dispose()
      textures.accessRoad.dispose()
    },
    [textures],
  )

  const accessShape = useMemo(() => {
    if (!access || access.outline.length < 3) return null
    // Shape space (x, y) maps to world (x, −z) once the mesh is laid flat with a −90° X rotation.
    return new Shape(access.outline.map(([x, z]) => new Vector2(x, -z)))
  }, [access])

  const layout = useMemo(() => {
    const z = config.centreZ
    const halfCw = carriageway / 2
    const shoulderZ = halfCw + config.shoulderWidth / 2
    const vergeZ = halfCw + config.shoulderWidth + config.vergeWidth / 2
    const edgeZ = halfCw - config.markings.edgeLineInset
    const period = config.markings.dashLength + config.markings.dashGap
    const dashCount = Math.max(0, Math.floor(config.length / period))
    const dashX0 = -config.length / 2 + config.markings.dashLength / 2
    const nearSpans = spansAround(config.length, null)
    const farSpans = spansAround(config.length, access?.junction ?? null)
    return { z, shoulderZ, vergeZ, edgeZ, period, dashCount, dashX0, nearSpans, farSpans }
  }, [config, carriageway, access])

  useLayoutEffect(() => {
    const mesh = dashesRef.current
    if (!mesh) return
    for (let i = 0; i < layout.dashCount; i++) {
      _position.set(layout.dashX0 + i * layout.period, groundY + PAINT_LIFT, layout.z)
      _matrix.compose(_position, FLAT, _scale)
      mesh.setMatrixAt(i, _matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
    invalidate()
  }, [layout, groundY, invalidate])

  useEffect(() => {
    lastOpacity.current = Number.NaN
  }, [materials])

  useFrame(() => {
    const opacity = clamp01(getOpacity())
    if (opacity === lastOpacity.current) return
    lastOpacity.current = opacity
    for (const material of Object.values(materials)) material.opacity = opacity
    if (groupRef.current) groupRef.current.visible = opacity > 0.001
  })

  const { z, shoulderZ, vergeZ, edgeZ, dashCount, nearSpans, farSpans } = layout
  const { length, shoulderWidth, vergeWidth, markings } = config

  /** A flat strip along X between x0 and x1 at world z, width w (along Z), at lift y. */
  const strip = (key: string, x0: number, x1: number, zc: number, w: number, lift: number, material: MeshStandardMaterial, order: number) => (
    <mesh key={key} position={[(x0 + x1) / 2, groundY + lift, zc]} rotation={FLAT_EULER} material={material} renderOrder={order} receiveShadow>
      <planeGeometry args={[x1 - x0, w]} />
    </mesh>
  )

  return (
    <group ref={groupRef} name="highway" visible={false}>
      {strip('asphalt', -length / 2, length / 2, z, carriageway, ROAD_LIFT, materials.asphalt, ORDER_SURFACE)}
      {/* Near side (towards the camera): continuous. Far side: broken where the access road joins. */}
      {nearSpans.map(([x0, x1], i) => strip(`near-shoulder-${i}`, x0, x1, z + shoulderZ, shoulderWidth, ROAD_LIFT, materials.shoulder, ORDER_SURFACE))}
      {nearSpans.map(([x0, x1], i) => strip(`near-verge-${i}`, x0, x1, z + vergeZ, vergeWidth, ROAD_LIFT, materials.verge, ORDER_SURFACE))}
      {nearSpans.map(([x0, x1], i) => strip(`near-edge-${i}`, x0, x1, z + edgeZ, markings.lineWidth, PAINT_LIFT, materials.edgeLine, ORDER_PAINT))}
      {nearSpans.map(([x0, x1], i) => strip(`far-shoulder-${i}`, x0, x1, z - shoulderZ, shoulderWidth, ROAD_LIFT, materials.shoulder, ORDER_SURFACE))}
      {nearSpans.map(([x0, x1], i) => strip(`far-verge-${i}`, x0, x1, z - vergeZ, vergeWidth, ROAD_LIFT, materials.verge, ORDER_SURFACE))}
      {farSpans.map(([x0, x1], i) => strip(`far-edge-${i}`, x0, x1, z - edgeZ, markings.lineWidth, PAINT_LIFT, materials.edgeLine, ORDER_PAINT))}
      {dashCount > 0 && (
        <instancedMesh key={dashCount} ref={dashesRef} name="highway-centre-dashes" args={[undefined, undefined, dashCount]} material={materials.centreLine} renderOrder={ORDER_PAINT} receiveShadow>
          <planeGeometry args={[markings.dashLength, markings.lineWidth]} />
        </instancedMesh>
      )}
      {accessShape && (
        <mesh name="highway-access-road" position={[0, groundY + ACCESS_LIFT, 0]} rotation={FLAT_EULER} material={materials.access} renderOrder={ORDER_SURFACE + 0.5} receiveShadow>
          <shapeGeometry args={[accessShape, 1]} />
        </mesh>
      )}
    </group>
  )
}
