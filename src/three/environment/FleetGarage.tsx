/**
 * Procedural heavy-haul FLEET GARAGE used as the cinematic backdrop of Scene 01:
 * a long steel-framed assembly hall with open service bays, concrete slab,
 * structural columns, roof trusses and ceiling luminaires seen through the
 * openings, inspection zones on the floor, and a few STATIONARY fleet units
 * parked inside (the scene's own placeholder puller / trailer components, plus
 * a small low-bed built here). Everything static is boxes drawn through one
 * InstancedMesh per material (about 20 draw calls); no textures, no network.
 *
 * Fading: `getOpacity()` is read every rendered frame and written to every
 * material of the building AND to transparent clones of the parked fleet's
 * materials (the placeholder components use shared opaque materials, which
 * are swapped for per-garage clones after mount so the foreground vehicles
 * are untouched). Materials keep depth writes and draw front to back with
 * explicit negative render orders, so a half-faded hall looks like a fading
 * solid rather than stacked translucent layers, it always draws before the
 * yard's own transparent overlays, and the opaque foreground vehicles occlude
 * it through the depth test. Nothing here casts shadows: a shadow would land
 * at full strength before the building had faded in.
 */
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { BoxGeometry, Color, Euler, Group, InstancedMesh, Material, Matrix4, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from 'three'
import type { ModelManifestEntry, Vec3 } from '../assets/types'
import { PlaceholderHydraulicAxleTrailer, PlaceholderPullerTruck, PlaceholderRims, PlaceholderWheels } from '../placeholders'
import type { FleetGarageConfig, GarageFleetUnit } from './types'

export interface FleetGarageProps {
  config: FleetGarageConfig
  /** Y of the ground plane the hall stands on. */
  groundY: number
  /** Manifest entries and scene scale for the parked placeholder units. */
  fleet: { puller: ModelManifestEntry; trailer: ModelManifestEntry; sceneScale: number }
  /** Read every frame; 0 = invisible, 1 = fully visible. Clamped. */
  getOpacity: () => number
}

interface BoxItem {
  position: Vec3
  size: Vec3
  /** Euler XYZ rotation in radians (optional). */
  rotation?: Vec3
}

type PartKey = keyof FleetGarageConfig['colors']

/**
 * Draw order, FRONT TO BACK (lower = earlier). With depth writes on, each pixel
 * keeps only the nearest part, so a half-faded hall never double-blends where
 * a column overlaps the wall behind it. All negative so the yard's default
 * transparent overlays draw after. The parked fleet uses FLEET_ORDER.
 */
const RENDER_ORDER: Readonly<Record<PartKey, number>> = {
  bollard: -14,
  frontColumn: -13,
  doorHead: -12,
  closedDoor: -12,
  bayLight: -12,
  cladding: -11,
  rib: -11.5,
  fascia: -11,
  fleetPaint: -10,
  fleetSteel: -10,
  interiorColumn: -9,
  sleeve: -9.5,
  truss: -8,
  luminaire: -8,
  accentLine: -7,
  zone: -7,
  pit: -7.2,
  slab: -6,
  girt: -5,
  backWall: -4,
}
const FLEET_ORDER = -10

const PART_KEYS = Object.keys(RENDER_ORDER) as PartKey[]

/* Scratch objects reused while writing instance matrices. */
const _matrix = new Matrix4()
const _position = new Vector3()
const _scale = new Vector3()
const _quat = new Quaternion()
const _euler = new Euler()

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value
}

/** Rotates a point (x, z) about the origin by `angle` radians around Y. */
function rotXZ(x: number, z: number, angle: number): [number, number] {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return [x * c + z * s, -x * s + z * c]
}

/** Lays out every static box of the hall from the config. Pure. */
function buildGarageParts(cfg: FleetGarageConfig, groundY: number): Record<PartKey, BoxItem[]> {
  const parts = Object.fromEntries(PART_KEYS.map((k) => [k, [] as BoxItem[]])) as Record<PartKey, BoxItem[]>
  const [x0, , z0] = cfg.position
  const y0 = groundY
  const { width: W, depth: D, eavesHeight: H, bays, columns, trusses, luminaires } = cfg
  const zBack = z0 - D
  const bayStart = x0 - (bays.count * bays.pitch) / 2
  const openSet = new Set(bays.openBays)
  const col = columns.size

  // Roof slab, fascia band and the upper cladding above the openings; full-height cladding beyond the bay run.
  parts.fascia.push({ position: [x0, y0 + H + 0.15, z0 - D / 2], size: [W + 0.6, 0.3, D + 0.6] })
  parts.fascia.push({ position: [x0, y0 + H - 0.55, z0 + 0.15], size: [W, 1.1, 0.3] })
  parts.cladding.push({ position: [x0, y0 + (H + bays.openingHeight) / 2, z0 - 0.1], size: [W, H - bays.openingHeight, 0.2] })
  const wing = (W - bays.count * bays.pitch) / 2
  if (wing > 0.5) {
    for (const side of [-1, 1]) {
      parts.cladding.push({ position: [x0 + side * (W / 2 - wing / 2), y0 + bays.openingHeight / 2, z0 - 0.1], size: [wing, bays.openingHeight, 0.2] })
    }
  }
  // Corrugation ribs over the facade cladding (one draw call).
  for (let x = x0 - W / 2 + 0.5; x < x0 + W / 2; x += cfg.ribPitch) {
    const inBays = x > bayStart && x < bayStart + bays.count * bays.pitch
    const bottom = inBays ? bays.openingHeight : 0
    parts.rib.push({ position: [x, y0 + (H + bottom) / 2, z0 + 0.03], size: [0.08, H - bottom - 0.2, 0.06] })
  }

  // Front columns at every bay boundary; interior rows of columns deeper in the hall; yellow base sleeves on all.
  for (let i = 0; i <= bays.count; i++) {
    const x = bayStart + i * bays.pitch
    parts.frontColumn.push({ position: [x, y0 + (H + 0.2) / 2, z0 + col / 2], size: [col, H + 0.2, col] })
    parts.sleeve.push({ position: [x, y0 + 0.5, z0 + col / 2 + 0.02], size: [col + 0.16, 1.0, col + 0.16] })
    for (const depth of columns.interiorRows) {
      parts.interiorColumn.push({ position: [x, y0 + (H - 0.4) / 2, z0 - depth], size: [col * 0.85, H - 0.4, col * 0.85] })
      parts.sleeve.push({ position: [x, y0 + 0.5, z0 - depth], size: [col * 0.85 + 0.16, 1.0, col * 0.85 + 0.16] })
    }
  }

  // Bays: open ones get a rolled-door housing, threshold line and bollards; closed ones a sectional door.
  for (let i = 0; i < bays.count; i++) {
    const x = bayStart + (i + 0.5) * bays.pitch
    const ow = bays.pitch - col - 0.6
    if (openSet.has(i)) {
      parts.doorHead.push({ position: [x, y0 + bays.openingHeight + 0.55, z0 + 0.45], size: [ow + 0.4, 1.1, 1.0] })
      parts.accentLine.push({ position: [x, y0 + 0.045, z0 + 0.4], size: [ow, 0.02, 0.15] })
      for (const side of [-1, 1]) {
        parts.bollard.push({ position: [x + side * (ow / 2 + 0.1), y0 + 0.6, z0 + 1.0], size: [0.28, 1.2, 0.28] })
      }
    } else {
      parts.closedDoor.push({ position: [x, y0 + bays.openingHeight / 2, z0 + 0.08], size: [ow, bays.openingHeight, 0.14] })
      for (let k = 1; k < 5; k++) parts.rib.push({ position: [x, y0 + (bays.openingHeight * k) / 5, z0 + 0.17], size: [ow - 0.2, 0.05, 0.03] })
    }
    parts.bayLight.push({ position: [x, y0 + H - 1.35, z0 + 0.2], size: [ow * 0.5, 0.14, 0.24] })
  }

  // Interior: concrete slab just above the yard floor, back wall with girts, trusses and luminaires.
  parts.slab.push({ position: [x0, y0 + 0.02, z0 - D / 2], size: [W, 0.04, D] })
  parts.backWall.push({ position: [x0, y0 + H / 2, zBack + 0.1], size: [W, H, 0.2] })
  for (let y = 2; y < H - 1; y += 2.2) parts.girt.push({ position: [x0, y0 + y, zBack + 0.26], size: [W - 0.4, 0.12, 0.12] })

  const chordLen = D - 1
  const zMid = z0 - D / 2 - 0.5
  const diagLen = Math.hypot(trusses.diagonalPitch, trusses.topChordHeight - trusses.bottomChordHeight)
  const diagAngle = Math.atan2(trusses.diagonalPitch, trusses.topChordHeight - trusses.bottomChordHeight)
  for (let x = x0 - W / 2 + trusses.spacing / 2; x < x0 + W / 2; x += trusses.spacing) {
    parts.truss.push({ position: [x, y0 + trusses.topChordHeight, zMid], size: [0.5, 0.5, chordLen] })
    parts.truss.push({ position: [x, y0 + trusses.bottomChordHeight, zMid], size: [0.42, 0.42, chordLen] })
    let sign = 1
    for (let z = z0 - 1.5; z > zBack + 1.5 + trusses.diagonalPitch; z -= trusses.diagonalPitch) {
      parts.truss.push({
        position: [x, y0 + (trusses.topChordHeight + trusses.bottomChordHeight) / 2, z - trusses.diagonalPitch / 2],
        size: [0.22, diagLen, 0.22],
        rotation: [sign * diagAngle, 0, 0],
      })
      sign = -sign
    }
  }
  for (let z = z0 - 3; z > zBack + 1; z -= trusses.purlinPitch) {
    parts.truss.push({ position: [x0, y0 + trusses.topChordHeight + 0.25, z], size: [W - 1, 0.28, 0.28] })
  }
  for (let z = z0 - luminaires.rowSpacing / 2; z > zBack; z -= luminaires.rowSpacing) {
    for (let x = x0 - W / 2 + luminaires.spacing / 2; x < x0 + W / 2; x += luminaires.spacing) {
      parts.luminaire.push({ position: [x, y0 + luminaires.height, z], size: [luminaires.length, 0.16, 0.55] })
    }
  }

  // Inspection / maintenance zones: darker rectangles with yellow outlines, and one service pit.
  for (const zone of cfg.zones) {
    const [zx, , zd] = zone.position
    const [zw, zl] = zone.size
    const zc: Vec3 = [x0 + zx, y0 + 0.045, z0 - zd]
    if (zone.kind === 'pit') {
      parts.pit.push({ position: zc, size: [zw, 0.03, zl] })
    } else {
      parts.zone.push({ position: zc, size: [zw, 0.02, zl] })
    }
    const lw = 0.14
    parts.accentLine.push({ position: [zc[0], zc[1] + 0.012, zc[2] - zl / 2], size: [zw + lw, 0.015, lw] })
    parts.accentLine.push({ position: [zc[0], zc[1] + 0.012, zc[2] + zl / 2], size: [zw + lw, 0.015, lw] })
    parts.accentLine.push({ position: [zc[0] - zw / 2, zc[1] + 0.012, zc[2]], size: [lw, 0.015, zl] })
    parts.accentLine.push({ position: [zc[0] + zw / 2, zc[1] + 0.012, zc[2]], size: [lw, 0.015, zl] })
  }

  // Low-bed trailers (deck, gooseneck step, side rails, rear ramps); their wheels are React components.
  for (const unit of cfg.fleet) {
    if (unit.kind !== 'lowbed') continue
    const ux = x0 + unit.x
    const uz = z0 - unit.depth
    const rot: Vec3 = [0, unit.rotationY, 0]
    const place = (lx: number, ly: number, lz: number, size: Vec3, key: 'fleetPaint' | 'fleetSteel') => {
      const [rx, rz] = rotXZ(lx, lz, unit.rotationY)
      parts[key].push({ position: [ux + rx, y0 + 0.04 + ly, uz + rz], size, rotation: rot })
    }
    place(1.0, 0.95, 0, [11.0, 0.55, 3.0], 'fleetPaint')
    place(-6.2, 1.45, 0, [3.4, 0.7, 1.6], 'fleetPaint')
    place(-4.6, 1.1, 0, [1.4, 0.6, 1.4], 'fleetSteel')
    place(1.0, 1.26, 1.45, [11.0, 0.12, 0.1], 'fleetSteel')
    place(1.0, 1.26, -1.45, [11.0, 0.12, 0.1], 'fleetSteel')
    place(7.6, 0.75, 0.9, [2.6, 0.12, 0.9], 'fleetSteel')
    place(7.6, 0.75, -0.9, [2.6, 0.12, 0.9], 'fleetSteel')
  }

  return parts
}

function createMaterials(cfg: FleetGarageConfig): Record<PartKey, MeshStandardMaterial> {
  const make = (color: string, extra: Partial<MeshStandardMaterial> = {}) =>
    new MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.08, transparent: true, opacity: 0, depthWrite: true, ...extra })
  const c = cfg.colors
  const emissive = (color: string, intensity: number) => ({ emissive: new Color(color), emissiveIntensity: intensity, roughness: 0.4 })
  return {
    bollard: make(c.bollard, { roughness: 0.6 }),
    frontColumn: make(c.frontColumn, { roughness: 0.45, metalness: 0.7 }),
    doorHead: make(c.doorHead, { roughness: 0.5, metalness: 0.5 }),
    closedDoor: make(c.closedDoor, { roughness: 0.6, metalness: 0.35 }),
    bayLight: make(c.bayLight, emissive(c.bayLight, cfg.lightIntensity.bay)),
    cladding: make(c.cladding),
    rib: make(c.rib),
    fascia: make(c.fascia),
    fleetPaint: make(c.fleetPaint, { roughness: 0.55, metalness: 0.35 }),
    fleetSteel: make(c.fleetSteel, { roughness: 0.4, metalness: 0.8 }),
    interiorColumn: make(c.interiorColumn, { roughness: 0.45, metalness: 0.7 }),
    sleeve: make(c.sleeve, { roughness: 0.6 }),
    truss: make(c.truss, { roughness: 0.5, metalness: 0.6 }),
    luminaire: make(c.luminaire, emissive(c.luminaire, cfg.lightIntensity.luminaire)),
    accentLine: make(c.accentLine, { roughness: 0.7 }),
    zone: make(c.zone, { roughness: 0.92 }),
    pit: make(c.pit, { roughness: 0.95 }),
    slab: make(c.slab, { roughness: 0.9 }),
    girt: make(c.girt, { roughness: 0.6, metalness: 0.5 }),
    backWall: make(c.backWall),
  }
}

function InstancedBoxes({
  items,
  material,
  geometry,
  renderOrder,
  name,
}: {
  items: readonly BoxItem[]
  material: MeshStandardMaterial
  geometry: BoxGeometry
  renderOrder: number
  name: string
}) {
  const ref = useRef<InstancedMesh>(null)
  const invalidate = useThree((state) => state.invalidate)

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    items.forEach(({ position, size, rotation }, index) => {
      _position.set(position[0], position[1], position[2])
      _scale.set(size[0], size[1], size[2])
      if (rotation) _quat.setFromEuler(_euler.set(rotation[0], rotation[1], rotation[2]))
      else _quat.identity()
      _matrix.compose(_position, _quat, _scale)
      mesh.setMatrixAt(index, _matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
    invalidate()
  }, [items, invalidate])

  if (items.length === 0) return null
  return (
    // Keyed on the instance count so a different layout remounts the mesh instead of resizing it.
    <instancedMesh key={items.length} ref={ref} name={name} args={[geometry, material, items.length]} renderOrder={renderOrder} />
  )
}

/** Wheels of a low-bed unit (its body is part of the instanced boxes). */
function LowBedWheels({ unit, origin }: { unit: GarageFleetUnit; origin: Vec3 }) {
  const positions = useMemo<Vec3[]>(() => {
    const out: Vec3[] = []
    for (const ax of [5.2, 6.7, 8.2]) for (const side of [-1.1, 1.1]) out.push([ax, 0.55, side])
    return out
  }, [])
  return (
    <group position={[origin[0] + unit.x, origin[1] + 0.04, origin[2] - unit.depth]} rotation={[0, unit.rotationY, 0]}>
      <PlaceholderWheels positions={positions} radius={0.55} width={0.36} />
      <PlaceholderRims positions={positions} radius={0.32} width={0.4} />
    </group>
  )
}

/**
 * Parked fleet: the scene's own placeholder components, static, inside the hall.
 * After mount their shared opaque materials are swapped for transparent clones
 * (see `useFleetFade`), so the foreground vehicles keep their materials.
 */
function ParkedFleet({ config, groundY, fleet }: { config: FleetGarageConfig; groundY: number; fleet: FleetGarageProps['fleet'] }) {
  const [x0, , z0] = config.position
  const origin: Vec3 = [x0, groundY, z0]
  return (
    <group name="garage-fleet">
      {config.fleet.map((unit, index) => {
        const key = `${unit.kind}-${index}`
        if (unit.kind === 'lowbed') return <LowBedWheels key={key} unit={unit} origin={origin} />
        const position: Vec3 = [x0 + unit.x, groundY + 0.04, z0 - unit.depth]
        return (
          <group key={key} position={position} rotation={[0, unit.rotationY, 0]} name={`garage-${unit.kind}`}>
            {unit.kind === 'puller' ? (
              <PlaceholderPullerTruck entry={fleet.puller} sceneScale={fleet.sceneScale} />
            ) : (
              <PlaceholderHydraulicAxleTrailer entry={fleet.trailer} sceneScale={fleet.sceneScale} />
            )}
          </group>
        )
      })}
    </group>
  )
}

interface FadeClones {
  clones: MeshStandardMaterial[]
  restore: () => void
}

/**
 * Swaps every material under `group` for a transparent, depth-writing clone
 * (one clone per distinct source material) and returns them for fading.
 * Restoring puts the originals back so StrictMode's second mount starts clean.
 */
function cloneMaterialsForFade(group: Group, renderOrder: number): FadeClones {
  const cloneOf = new Map<Material, MeshStandardMaterial>()
  const originals: Array<{ mesh: Mesh; material: Material | Material[] }> = []
  group.traverse((object) => {
    if (!(object instanceof Mesh)) return
    const source = object.material
    if (Array.isArray(source) || !(source instanceof MeshStandardMaterial)) return
    let clone = cloneOf.get(source)
    if (!clone) {
      clone = source.clone()
      clone.transparent = true
      clone.opacity = 0
      clone.depthWrite = true
      cloneOf.set(source, clone)
    }
    originals.push({ mesh: object, material: source })
    object.material = clone
    object.renderOrder = renderOrder
    object.castShadow = false
    object.receiveShadow = false
  })
  return {
    clones: Array.from(cloneOf.values()),
    restore: () => {
      for (const { mesh, material } of originals) mesh.material = material
      for (const clone of cloneOf.values()) clone.dispose()
    },
  }
}

export function FleetGarage({ config, groundY, fleet, getOpacity }: FleetGarageProps) {
  const groupRef = useRef<Group>(null)
  const fleetRef = useRef<Group>(null)
  const fadeRef = useRef<FadeClones | null>(null)
  const lastOpacity = useRef(Number.NaN)
  const invalidate = useThree((state) => state.invalidate)

  const geometry = useMemo(() => new BoxGeometry(1, 1, 1), [])
  const materials = useMemo(() => createMaterials(config), [config])
  const parts = useMemo(() => buildGarageParts(config, groundY), [config, groundY])

  useEffect(() => {
    return () => {
      for (const key of PART_KEYS) materials[key].dispose()
    }
  }, [materials])
  useEffect(() => () => geometry.dispose(), [geometry])

  // The parked fleet's shared materials are replaced by fade clones once its components have mounted.
  useLayoutEffect(() => {
    const group = fleetRef.current
    if (!group) return
    const fade = cloneMaterialsForFade(group, FLEET_ORDER)
    fadeRef.current = fade
    lastOpacity.current = Number.NaN
    invalidate()
    return () => {
      fade.restore()
      fadeRef.current = null
    }
  }, [config.fleet, fleet, invalidate])

  // Materials changed (new config): force the next frame to re-apply the opacity.
  useEffect(() => {
    lastOpacity.current = Number.NaN
  }, [materials])

  useFrame(() => {
    const opacity = clamp01(getOpacity())
    if (opacity === lastOpacity.current) return
    lastOpacity.current = opacity
    for (const key of PART_KEYS) materials[key].opacity = opacity
    const fade = fadeRef.current
    if (fade) for (const clone of fade.clones) clone.opacity = opacity
    if (groupRef.current) groupRef.current.visible = opacity > 0.001
  })

  return (
    <group ref={groupRef} name="fleet-garage" visible={false}>
      {PART_KEYS.map((key) => (
        <InstancedBoxes key={key} name={`garage-${key}`} items={parts[key]} material={materials[key]} geometry={geometry} renderOrder={RENDER_ORDER[key]} />
      ))}
      <group ref={fleetRef}>
        <ParkedFleet config={config} groundY={groundY} fleet={fleet} />
      </group>
    </group>
  )
}
