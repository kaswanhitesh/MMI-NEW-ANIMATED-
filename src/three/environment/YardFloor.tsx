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
import { Euler, Matrix4, Quaternion, Vector3, type InstancedMesh } from 'three'
import type { Vec3 } from '../assets/types'
import type { YardEnvironmentConfig } from './types'

export interface YardFloorProps {
  environment: YardEnvironmentConfig
  /** Y of the floor plane (m). */
  groundY: number
  /** Centre of the contact-shadow plane (its y is ignored). Defaults to the origin. */
  shadowCentre?: Vec3
}

/** Across-lane width of one marking stripe (m). */
const STRIPE_WIDTH = 0.12
/** Markings float this far above the floor so they are not z-fought by it. */
const MARKING_LIFT = 0.004
/** Contact shadows sit just above the floor and below the markings. */
const CONTACT_SHADOW_LIFT = 0.002
const CONTACT_SHADOW_RESOLUTION = 512

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

function LaneMarkings({ markings, groundY }: { markings: YardEnvironmentConfig['markings']; groundY: number }) {
  const ref = useRef<InstancedMesh>(null)
  const invalidate = useThree((state) => state.invalidate)
  const centres = useMemo(() => computeStripeCentres(markings, groundY + MARKING_LIFT), [markings, groundY])

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

export function YardFloor({ environment, groundY, shadowCentre = ORIGIN }: YardFloorProps) {
  const { floor, markings, contactShadow } = environment

  return (
    <group name="yard-floor">
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, groundY, 0]} receiveShadow>
        <planeGeometry args={[floor.size, floor.size]} />
        {/* Not tone-mapped on purpose: the fogged horizon must land on exactly the clear colour, which tone mapping would darken. */}
        <meshStandardMaterial
          color={floor.color}
          roughness={floor.roughness}
          metalness={floor.metalness}
          envMapIntensity={floor.envMapIntensity}
          toneMapped={false}
        />
      </mesh>
      <LaneMarkings markings={markings} groundY={groundY} />
      {/* scale={1}: drei multiplies width/height by `scale` (default 10); the config values are metres already. */}
      <ContactShadows
        scale={1}
        position={[shadowCentre[0], groundY + CONTACT_SHADOW_LIFT, shadowCentre[2]]}
        opacity={contactShadow.opacity}
        blur={contactShadow.blur}
        width={contactShadow.width}
        height={contactShadow.height}
        far={contactShadow.far}
        resolution={CONTACT_SHADOW_RESOLUTION}
        frames={Infinity}
      />
    </group>
  )
}
