/**
 * The transport-yard floor: one large shadow-receiving plane, two dashed lane
 * markings drawn with a single InstancedMesh of thin planes, and a drei
 * ContactShadows plane that grounds the vehicles with a soft blurred shadow.
 * Everything is sized and coloured from the scene config's `environment`
 * block; the component adds no grid helpers, glow or other decoration.
 */
import { ContactShadows } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, Euler, Group, Matrix4, Quaternion, Vector3, type InstancedMesh, type MeshBasicMaterial, type MeshStandardMaterial } from 'three'
import type { Vec3 } from '../assets/types'
import type { YardEnvironmentConfig } from './types'

export interface YardFloorProps {
  environment: YardEnvironmentConfig
  /** Y of the floor plane (m). */
  groundY: number
  /** Centre of the contact-shadow plane (its y is ignored). Defaults to the origin. */
  shadowCentre?: Vec3
  /** Read every frame; multiplies the lane markings' opacity (e.g. to fade the yard out). Defaults to 1. */
  getMarkingsOpacity?: () => number
  /** Read every frame: ground-plane offset (x, z, metres) of the contact-shadow plane, so it can follow moving vehicles. */
  getShadowOffset?: () => readonly [number, number]
  /** Optional colour the floor blends to; `getBlend` (0–1) is read every frame. */
  groundBlend?: { color: string; getBlend: () => number }
}

/** Across-lane width of one marking stripe (m). */
const STRIPE_WIDTH = 0.12
/** Markings float this far above the floor so they are not z-fought by it. */
const MARKING_LIFT = 0.004
/** Contact shadows sit above every ground layer (apron 2 mm … road paint 15 mm, see roadSurface.ts) so shadows fall on all of them. */
const CONTACT_SHADOW_LIFT = 0.02

const ORIGIN: Vec3 = [0, 0, 0]

/** Lays the stripe planes (built in XY) flat on the XZ floor with their length along X. */
const FLAT_ROTATION = new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, 0))

/* Scratch objects reused while writing instance matrices. */
const _matrix = new Matrix4()
const _position = new Vector3()
const _unitScale = new Vector3(1, 1, 1)

/** Stripe centres for two dashed lines at ±laneHalfWidth, running along X and centred on x = 0. */
function computeStripeCentres(markings: YardEnvironmentConfig['markings'], y: number): Vec3[] {
  const { length, stripeLength, stripeGap, laneHalfWidth } = markings
  const period = stripeLength + stripeGap
  if (!(period > 0) || !(stripeLength > 0) || !(length >= stripeLength)) return []
  const perLine = Math.floor((length - stripeLength) / period) + 1
  const firstCentre = -length / 2 + stripeLength / 2
  const centres: Vec3[] = []
  for (const z of [-laneHalfWidth, laneHalfWidth]) {
    for (let i = 0; i < perLine; i++) centres.push([firstCentre + i * period, y, z])
  }
  return centres
}

function LaneMarkings({
  markings,
  groundY,
  getOpacity,
}: {
  markings: YardEnvironmentConfig['markings']
  groundY: number
  getOpacity?: () => number
}) {
  const ref = useRef<InstancedMesh>(null)
  const materialRef = useRef<MeshBasicMaterial>(null)
  const lastFactor = useRef(Number.NaN)
  const invalidate = useThree((state) => state.invalidate)
  const centres = useMemo(() => computeStripeCentres(markings, groundY + MARKING_LIFT), [markings, groundY])

  // Demand frameloop: runs only when something invalidated; the markings follow the fade factor the scene provides.
  useFrame(() => {
    const material = materialRef.current
    if (!material) return
    const factor = getOpacity ? Math.min(1, Math.max(0, getOpacity())) : 1
    if (factor === lastFactor.current) return
    lastFactor.current = factor
    material.opacity = markings.opacity * factor
    if (ref.current) ref.current.visible = factor > 0.001
  })

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    centres.forEach(([x, y, z], index) => {
      _position.set(x, y, z)
      _matrix.compose(_position, FLAT_ROTATION, _unitScale)
      mesh.setMatrixAt(index, _matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
    invalidate()
  }, [centres, invalidate])

  if (centres.length === 0) return null

  return (
    // Keyed on the instance count so a different marking layout remounts the mesh instead of resizing it.
    <instancedMesh key={centres.length} ref={ref} name="yard-markings" args={[undefined, undefined, centres.length]}>
      <planeGeometry args={[markings.stripeLength, STRIPE_WIDTH]} />
      <meshBasicMaterial
        ref={materialRef}
        color={markings.color}
        transparent
        opacity={markings.opacity}
        depthWrite={false}
        toneMapped={false}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
      />
    </instancedMesh>
  )
}

export function YardFloor({ environment, groundY, shadowCentre = ORIGIN, getMarkingsOpacity, getShadowOffset, groundBlend }: YardFloorProps) {
  const { floor, markings, contactShadow } = environment
  const shadowGroupRef = useRef<Group>(null)
  const floorMaterialRef = useRef<MeshStandardMaterial>(null)
  const last = useRef({ ox: Number.NaN, oz: Number.NaN, blend: Number.NaN })
  const colors = useMemo(() => ({ base: new Color(floor.color), blend: new Color(groundBlend?.color ?? floor.color) }), [floor.color, groundBlend?.color])

  // Contact shadows follow travelling vehicles; the floor colour follows the scene's daylight blend.
  useFrame(() => {
    if (getShadowOffset && shadowGroupRef.current) {
      const [ox, oz] = getShadowOffset()
      if (ox !== last.current.ox || oz !== last.current.oz) {
        last.current.ox = ox
        last.current.oz = oz
        shadowGroupRef.current.position.x = ox
        shadowGroupRef.current.position.z = oz
      }
    }
    if (groundBlend && floorMaterialRef.current) {
      const t = Math.min(1, Math.max(0, groundBlend.getBlend()))
      if (t !== last.current.blend) {
        last.current.blend = t
        floorMaterialRef.current.color.copy(colors.base).lerp(colors.blend, t)
      }
    }
  })

  return (
    <group name="yard-floor">
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, groundY, 0]} receiveShadow>
        <planeGeometry args={[floor.size, floor.size]} />
        {/* Not tone-mapped on purpose: the fogged horizon must land on exactly the clear colour, which tone mapping would darken. */}
        <meshStandardMaterial
          ref={floorMaterialRef}
          color={floor.color}
          roughness={floor.roughness}
          metalness={floor.metalness}
          envMapIntensity={floor.envMapIntensity}
          toneMapped={false}
          polygonOffset
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
        />
      </mesh>
      <LaneMarkings markings={markings} groundY={groundY} getOpacity={getMarkingsOpacity} />
      {/* scale={1}: drei multiplies width/height by `scale` (default 10); the config values are metres already. */}
      <group ref={shadowGroupRef}>
      <ContactShadows
        scale={1}
        position={[shadowCentre[0], groundY + CONTACT_SHADOW_LIFT, shadowCentre[2]]}
        opacity={contactShadow.opacity}
        blur={contactShadow.blur}
        width={contactShadow.width}
        height={contactShadow.height}
        far={contactShadow.far}
        resolution={contactShadow.resolution}
        frames={Infinity}
      />
      </group>
    </group>
  )
}
