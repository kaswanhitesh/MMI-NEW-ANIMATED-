/**
 * Procedural stand-in for the HIGHWAY environment: a straight two-way road
 * along its slot's local X axis, centred on local z = 0 — asphalt carriageway
 * with a subtle generated grain, dashed centre line, solid edge lines,
 * shoulders, verges, and street lights on the far verge (local −Z, the garage
 * side) outside the stretch in front of the garage. Flat planes plus a few
 * instanced meshes; no image assets.
 *
 * It is permanent world infrastructure: opaque, always present, never faded.
 * The exit road from the garage (a separate environment) joins its far side;
 * `farEdgeGap` breaks the far edge line across that junction mouth. Ground
 * layer heights are shared with the other environments (see roadSurface.ts).
 */
import { useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { BoxGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three'
import { createGrainTexture, FLAT_EULER, GRAIN_TILE, LIFT, roadMaterial } from './roadSurface'
import type { HighwayConfig } from './types'

export interface HighwayProps {
  config: HighwayConfig
  /** Y of the ground plane, slot-local. */
  groundY: number
  /** Slot-local X ranges of junction mouths of roads joining the far side: the far edge line breaks there and no street light stands in (or within 4 m of) them. */
  farEdgeGaps?: ReadonlyArray<readonly [number, number]>
}

const _matrix = new Matrix4()
const _position = new Vector3()
const _scale = new Vector3(1, 1, 1)
const FLAT = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2)
const _identity = new Quaternion()
const _boxScale = new Vector3()

/** Splits [−L/2, L/2] around the gaps into the spans that remain. */
function spansAround(length: number, gaps: ReadonlyArray<readonly [number, number]> = []): Array<[number, number]> {
  const a = -length / 2
  const b = length / 2
  const sorted = gaps.map(([g0, g1]) => (g0 < g1 ? [g0, g1] : [g1, g0]) as [number, number]).sort((p, q) => p[0] - q[0])
  const out: Array<[number, number]> = []
  let cursor = a
  for (const [g0, g1] of sorted) {
    if (g1 <= cursor || g0 >= b) continue
    if (g0 > cursor) out.push([cursor, g0])
    cursor = Math.max(cursor, g1)
  }
  if (cursor < b) out.push([cursor, b])
  return out
}

interface LightBox {
  position: [number, number, number]
  size: [number, number, number]
}

/** Clear distance (m) kept between a street light and a junction mouth on the far side. */
const JUNCTION_CLEARANCE = 4

/** Street-light boxes (poles, arms, lamp heads) along the far verge, skipping the excluded stretches and junctions. */
function buildStreetLights(config: HighwayConfig, groundY: number, junctions: ReadonlyArray<readonly [number, number]>): { poles: LightBox[]; lamps: LightBox[] } {
  const sl = config.streetLights
  const poles: LightBox[] = []
  const lamps: LightBox[] = []
  if (!sl.enabled || !(sl.spacing > 0)) return { poles, lamps }
  const carriageway = config.lanes * config.laneWidth
  // Centre of the far verge; the arm reaches back over the shoulder towards the road.
  const z = -(carriageway / 2 + config.shoulderWidth + config.vergeWidth / 2)
  const within = (x: number, [a, b]: readonly [number, number], margin: number) => x >= Math.min(a, b) - margin && x <= Math.max(a, b) + margin
  // No pole in an excluded stretch, nor in (or right beside) a road joining from the far side.
  const excluded = (x: number) => sl.exclude.some((r) => within(x, r, 0)) || junctions.some((r) => within(x, r, JUNCTION_CLEARANCE))
  const half = config.length / 2
  for (let x = Math.ceil(-half / sl.spacing) * sl.spacing; x <= half; x += sl.spacing) {
    if (excluded(x)) continue
    poles.push({ position: [x, groundY + sl.height / 2, z], size: [0.28, sl.height, 0.28] })
    poles.push({ position: [x, groundY + sl.height - 0.1, z + sl.armLength / 2], size: [0.16, 0.16, sl.armLength] })
    lamps.push({ position: [x, groundY + sl.height - 0.25, z + sl.armLength - 0.2], size: [0.36, 0.14, 0.7] })
  }
  return { poles, lamps }
}

function InstancedLightBoxes({ items, material, geometry, name }: { items: readonly LightBox[]; material: MeshStandardMaterial; geometry: BoxGeometry; name: string }) {
  const ref = useRef<InstancedMesh>(null)
  const invalidate = useThree((state) => state.invalidate)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    items.forEach(({ position, size }, index) => {
      _position.set(...position)
      _matrix.compose(_position, _identity, _boxScale.set(...size))
      mesh.setMatrixAt(index, _matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
    invalidate()
  }, [items, invalidate])
  if (items.length === 0) return null
  return <instancedMesh key={items.length} ref={ref} name={name} args={[geometry, material, items.length]} />
}

export function Highway({ config, groundY, farEdgeGaps }: HighwayProps) {
  const dashesRef = useRef<InstancedMesh>(null)
  const invalidate = useThree((state) => state.invalidate)
  const carriageway = config.lanes * config.laneWidth

  const grain = useMemo(() => {
    const texture = createGrainTexture(config.grain)
    texture.repeat.set(config.length / GRAIN_TILE, carriageway / GRAIN_TILE)
    return texture
  }, [config.grain, config.length, carriageway])

  const materials = useMemo(
    () => ({
      asphalt: roadMaterial(config.colors.asphalt, 0.95, grain),
      shoulder: roadMaterial(config.colors.shoulder, 0.98),
      verge: roadMaterial(config.colors.verge, 1),
      centreLine: roadMaterial(config.colors.centreLine, 0.7),
      edgeLine: roadMaterial(config.colors.edgeLine, 0.7),
      pole: new MeshStandardMaterial({ color: config.streetLights.color, roughness: 0.55, metalness: 0.5 }),
    }),
    [config.colors, config.streetLights.color, grain],
  )
  const boxGeometry = useMemo(() => new BoxGeometry(1, 1, 1), [])
  const lights = useMemo(() => buildStreetLights(config, groundY, farEdgeGaps ?? []), [config, groundY, farEdgeGaps])

  useEffect(() => () => {
    for (const material of Object.values(materials)) material.dispose()
  }, [materials])
  useEffect(() => () => grain.dispose(), [grain])
  useEffect(() => () => boxGeometry.dispose(), [boxGeometry])

  const layout = useMemo(() => {
    const halfCw = carriageway / 2
    const shoulderZ = halfCw + config.shoulderWidth / 2
    const vergeZ = halfCw + config.shoulderWidth + config.vergeWidth / 2
    const edgeZ = halfCw - config.markings.edgeLineInset
    const period = config.markings.dashLength + config.markings.dashGap
    const dashCount = Math.max(0, Math.floor(config.length / period))
    const dashX0 = -config.length / 2 + config.markings.dashLength / 2
    const full = spansAround(config.length)
    const farEdge = spansAround(config.length, farEdgeGaps)
    return { shoulderZ, vergeZ, edgeZ, period, dashCount, dashX0, full, farEdge }
  }, [config, carriageway, farEdgeGaps])

  useLayoutEffect(() => {
    const mesh = dashesRef.current
    if (!mesh) return
    for (let i = 0; i < layout.dashCount; i++) {
      _position.set(layout.dashX0 + i * layout.period, groundY + LIFT.paint, 0)
      _matrix.compose(_position, FLAT, _scale)
      mesh.setMatrixAt(i, _matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
    invalidate()
  }, [layout, groundY, invalidate])

  const { shoulderZ, vergeZ, edgeZ, dashCount, full, farEdge } = layout
  const { length, shoulderWidth, vergeWidth, markings } = config

  /** A flat strip along X between x0 and x1 at slot-local z, width w (along Z), at lift y. */
  const strip = (key: string, x0: number, x1: number, zc: number, w: number, lift: number, material: MeshStandardMaterial) => (
    <mesh key={key} name={`highway-${key}`} position={[(x0 + x1) / 2, groundY + lift, zc]} rotation={FLAT_EULER} material={material} receiveShadow>
      <planeGeometry args={[x1 - x0, w]} />
    </mesh>
  )

  return (
    <group name="highway">
      {strip('asphalt', -length / 2, length / 2, 0, carriageway, LIFT.road, materials.asphalt)}
      {full.map(([x0, x1], i) => strip(`near-shoulder-${i}`, x0, x1, shoulderZ, shoulderWidth, LIFT.road, materials.shoulder))}
      {full.map(([x0, x1], i) => strip(`near-verge-${i}`, x0, x1, vergeZ, vergeWidth, LIFT.road, materials.verge))}
      {full.map(([x0, x1], i) => strip(`near-edge-${i}`, x0, x1, edgeZ, markings.lineWidth, LIFT.paint, materials.edgeLine))}
      {/* Far side: shoulder and verge stay continuous (the exit road lies on top); only the edge line breaks at the junction. */}
      {full.map(([x0, x1], i) => strip(`far-shoulder-${i}`, x0, x1, -shoulderZ, shoulderWidth, LIFT.road, materials.shoulder))}
      {full.map(([x0, x1], i) => strip(`far-verge-${i}`, x0, x1, -vergeZ, vergeWidth, LIFT.road, materials.verge))}
      {farEdge.map(([x0, x1], i) => strip(`far-edge-${i}`, x0, x1, -edgeZ, markings.lineWidth, LIFT.paint, materials.edgeLine))}
      {dashCount > 0 && (
        <instancedMesh key={dashCount} ref={dashesRef} name="highway-centre-dashes" args={[undefined, undefined, dashCount]} material={materials.centreLine} receiveShadow>
          <planeGeometry args={[markings.dashLength, markings.lineWidth]} />
        </instancedMesh>
      )}
      <InstancedLightBoxes name="highway-street-light-poles" items={lights.poles} material={materials.pole} geometry={boxGeometry} />
      <InstancedLightBoxes name="highway-street-light-lamps" items={lights.lamps} material={materials.pole} geometry={boxGeometry} />
    </group>
  )
}
