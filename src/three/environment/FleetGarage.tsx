/**
 * Procedural stand-in for the GARAGE environment of Scene 01: a bounded,
 * steel-framed heavy-haul hall with its concrete forecourt, authored in its
 * slot's local space (facade front plane at z = 0, hall towards −Z, apron
 * towards +Z). It reads as a complete place rather than an open-ended
 * backdrop:
 *  - facade: a clean full-height BRANDING WALL on the left (the wall sign is a
 *    separate attachment, see BrandSign.tsx), open service bays with
 *    rolled-door housings between structural columns, and a short clad pier
 *    on the right; corner columns and a parapet roofline;
 *  - end walls and a back wall, the back wall with drive-through openings
 *    behind the bays (the city shows through them once the daylight haze
 *    replaces the enclosed-yard fog);
 *  - inside: slab, interior column rows, roof trusses, luminaires, inspection
 *    zones and a few STATIONARY fleet units (the scene's own placeholder
 *    components plus a small low-bed built here);
 *  - forecourt: an APRON slab bounded by a kerb along its front edge, broken
 *    where the exit road leaves (`kerbGaps`).
 * Everything static is boxes drawn through one InstancedMesh per material; no
 * textures, no network. It is deliberately simple: a detailed GLB is expected
 * to replace it through the slot (see EnvironmentSlot.tsx).
 *
 * Fading: `getOpacity()` is read every rendered frame and written to every
 * material AND to transparent clones of the parked fleet's materials (see
 * fadeMaterials.ts). Materials keep depth writes and draw front to back with
 * explicit negative render orders, so a half-faded hall looks like a fading
 * solid, it draws before the yard's transparent overlays, and the opaque
 * foreground vehicles occlude it through the depth test. Nothing here casts
 * shadows (a shadow would land at full strength before the building had faded
 * in); the apron receives the vehicles' shadows like the floor does.
 */
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { BoxGeometry, Color, Euler, Group, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three'
import type { ModelManifestEntry, Vec3 } from '../assets/types'
import { PlaceholderHydraulicAxleTrailer, PlaceholderPullerTruck, PlaceholderRims, PlaceholderWheels } from '../placeholders'
import { clamp01, cloneMaterialsForFade, setMaterialsOpacity, type FadeClones } from './fadeMaterials'
import { FLAT_EULER, LIFT } from './roadSurface'
import type { FleetGarageConfig, GarageFleetUnit } from './types'

export interface FleetGarageProps {
  config: FleetGarageConfig
  /** Y of the ground plane, slot-local. */
  groundY: number
  /** Manifest entries and scene scale for the parked placeholder units. */
  fleet: { puller: ModelManifestEntry; trailer: ModelManifestEntry; sceneScale: number }
  /** Read every frame; 0 = invisible, 1 = fully visible. Clamped. */
  getOpacity: () => number
  /** Read every frame (0–1): blends the apron towards its daylight colour. */
  getDaylight?: () => number
  /** Slot-local X ranges where the apron kerb is omitted (where the exit road leaves). */
  kerbGaps?: ReadonlyArray<readonly [number, number]>
}

interface BoxItem {
  position: Vec3
  size: Vec3
  /** Euler XYZ rotation in radians (optional). */
  rotation?: Vec3
}

type PartKey = keyof FleetGarageConfig['colors'] | 'kerb'

/**
 * Draw order, FRONT TO BACK (lower = earlier). With depth writes on, each pixel
 * keeps only the nearest part, so a half-faded hall never double-blends where
 * a column overlaps the wall behind it. All negative so the yard's default
 * transparent overlays draw after. The parked fleet uses FLEET_ORDER; the wall
 * sign (an attachment) draws before all of these.
 */
const RENDER_ORDER: Readonly<Record<PartKey, number>> = {
  kerb: -14.5,
  bollard: -14,
  frontColumn: -13,
  doorHead: -12,
  bayLight: -12,
  plinth: -11.8,
  rib: -11.5,
  brandWall: -11.2,
  cladding: -11,
  fascia: -11,
  fleetPaint: -10,
  fleetSteel: -10,
  sleeve: -9.5,
  interiorColumn: -9,
  truss: -8,
  luminaire: -8,
  pit: -7.2,
  accentLine: -7,
  zone: -7,
  slab: -6,
  girt: -5,
  backWall: -4,
}
const FLEET_ORDER = -10
/** The apron is a ground layer: after the building, before the yard markings and contact shadows (order 0). */
const APRON_ORDER = -3.5

const PART_KEYS = Object.keys(RENDER_ORDER) as PartKey[]

/* Scratch objects reused while writing instance matrices. */
const _matrix = new Matrix4()
const _position = new Vector3()
const _scale = new Vector3()
const _quat = new Quaternion()
const _euler = new Euler()

/** Rotates a point (x, z) about the origin by `angle` radians around Y. */
function rotXZ(x: number, z: number, angle: number): [number, number] {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return [x * c + z * s, -x * s + z * c]
}

/** Splits [a, b] around the gaps into the spans that remain. */
function spansAround(a: number, b: number, gaps: ReadonlyArray<readonly [number, number]>): Array<[number, number]> {
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

/** Lays out every static box of the hall and its forecourt from the config. Pure; slot-local. */
function buildGarageParts(cfg: FleetGarageConfig, groundY: number, kerbGaps: ReadonlyArray<readonly [number, number]>): Record<PartKey, BoxItem[]> {
  const parts = Object.fromEntries(PART_KEYS.map((k) => [k, [] as BoxItem[]])) as Record<PartKey, BoxItem[]>
  const y0 = groundY
  const { building, bays, columns, trusses, luminaires, apron } = cfg
  const { left, right, depth: D, eavesHeight: H, parapetHeight: P } = building
  const W = right - left
  const xMid = (left + right) / 2
  const zBack = -D
  const col = columns.size
  const bayEnd = bays.start + bays.count * bays.pitch
  const ow = bays.pitch - col - 0.6
  const bayCentre = (i: number) => bays.start + (i + 0.5) * bays.pitch

  // --- Roofline: roof slab, fascia band and a parapet on all four edges (a crisp boundary seen from above). ---
  parts.fascia.push({ position: [xMid, y0 + H + 0.15, -D / 2], size: [W + 0.6, 0.3, D + 0.6] })
  parts.fascia.push({ position: [xMid, y0 + H - 0.55, 0.15], size: [W + 0.6, 1.1, 0.3] })
  parts.fascia.push({ position: [xMid, y0 + H + P / 2, 0.15], size: [W + 0.6, P, 0.3] })
  parts.fascia.push({ position: [xMid, y0 + H + P / 2, zBack - 0.15], size: [W + 0.6, P, 0.3] })
  for (const x of [left - 0.15, right + 0.15]) parts.fascia.push({ position: [x, y0 + H + P / 2, -D / 2], size: [0.3, P, D + 0.6] })

  // --- Facade. Branding wall: clean, smooth, full height, with a concrete plinth and two quiet panel joints. ---
  if (bays.start - left > 0.5) {
    const bw = bays.start - left
    const bx = left + bw / 2
    parts.brandWall.push({ position: [bx, y0 + H / 2, -0.1], size: [bw, H, 0.2] })
    parts.plinth.push({ position: [bx, y0 + 0.6, 0.04], size: [bw, 1.2, 0.12] })
    for (const jy of cfg.brandWallJoints) parts.rib.push({ position: [bx, y0 + jy, 0.015], size: [bw - 0.4, 0.06, 0.03] })
  }
  // Clad band above the openings, and the clad pier to the right of the last bay.
  parts.cladding.push({ position: [(bays.start + bayEnd) / 2, y0 + (H + bays.openingHeight) / 2, -0.1], size: [bayEnd - bays.start, H - bays.openingHeight, 0.2] })
  const pier = right - bayEnd
  if (pier > 0.3) parts.cladding.push({ position: [bayEnd + pier / 2, y0 + H / 2, -0.1], size: [pier, H, 0.2] })
  // Vertical corrugation ribs on the clad parts of the facade only (the branding wall stays clean).
  for (let x = bays.start + 0.5; x < right - 0.2; x += cfg.ribPitch) {
    const bottom = x < bayEnd ? bays.openingHeight : 0
    parts.rib.push({ position: [x, y0 + (H + bottom) / 2, 0.03], size: [0.08, H - bottom - 0.2, 0.06] })
  }

  // --- End walls (outer faces carry ribs along Z) and the back wall with drive-through openings. ---
  for (const side of [-1, 1] as const) {
    const x = side < 0 ? left : right
    parts.cladding.push({ position: [x - side * 0.1, y0 + H / 2, -D / 2], size: [0.2, H, D] })
    for (let z = -0.6; z > zBack + 0.3; z -= cfg.ribPitch) parts.rib.push({ position: [x + side * 0.03, y0 + H / 2, z], size: [0.06, H - 0.2, 0.08] })
  }
  const rearSpans = bays.rear.open
    ? spansAround(
        left,
        right,
        Array.from({ length: bays.count }, (_, i) => [bayCentre(i) - ow / 2, bayCentre(i) + ow / 2] as const),
      )
    : [[left, right] as [number, number]]
  const rearHead = bays.rear.open ? bays.rear.height : 0
  for (const [a, b] of rearSpans) parts.backWall.push({ position: [(a + b) / 2, y0 + rearHead / 2, zBack + 0.1], size: [b - a, rearHead, 0.2] })
  if (bays.rear.open) {
    parts.backWall.push({ position: [xMid, y0 + (H + rearHead) / 2, zBack + 0.1], size: [W, H - rearHead, 0.2] })
  } else {
    parts.backWall.push({ position: [xMid, y0 + H / 2, zBack + 0.1], size: [W, H, 0.2] })
  }
  for (let y = Math.max(2, rearHead + 1.2); y < H - 1; y += 2.2) parts.girt.push({ position: [xMid, y0 + y, zBack + 0.26], size: [W - 0.4, 0.12, 0.12] })

  // --- Structure: front columns at every bay boundary plus the four corners; interior rows; yellow base sleeves. ---
  const corner = (x: number, z: number) => {
    parts.frontColumn.push({ position: [x, y0 + (H + 0.2) / 2, z], size: [col, H + 0.2, col] })
  }
  corner(left + col / 2, col / 2)
  corner(right - col / 2, col / 2)
  corner(left + col / 2, zBack + col / 2)
  corner(right - col / 2, zBack + col / 2)
  for (let i = 0; i <= bays.count; i++) {
    const x = bays.start + i * bays.pitch
    parts.frontColumn.push({ position: [x, y0 + (H + 0.2) / 2, col / 2], size: [col, H + 0.2, col] })
    parts.sleeve.push({ position: [x, y0 + 0.5, col / 2 + 0.02], size: [col + 0.16, 1.0, col + 0.16] })
    for (const d of columns.interiorRows) {
      parts.interiorColumn.push({ position: [x, y0 + (H - 0.4) / 2, -d], size: [col * 0.85, H - 0.4, col * 0.85] })
      parts.sleeve.push({ position: [x, y0 + 0.5, -d], size: [col * 0.85 + 0.16, 1.0, col * 0.85 + 0.16] })
    }
  }

  // --- Open service bays: rolled-door housing, threshold line, bollards and a bay light each. ---
  for (let i = 0; i < bays.count; i++) {
    const x = bayCentre(i)
    parts.doorHead.push({ position: [x, y0 + bays.openingHeight + 0.55, 0.45], size: [ow + 0.4, 1.1, 1.0] })
    parts.accentLine.push({ position: [x, y0 + 0.045, 0.4], size: [ow, 0.02, 0.15] })
    for (const side of [-1, 1]) parts.bollard.push({ position: [x + side * (ow / 2 + 0.1), y0 + 0.6, 1.0], size: [0.28, 1.2, 0.28] })
    parts.bayLight.push({ position: [x, y0 + H - 1.35, 0.2], size: [ow * 0.5, 0.14, 0.24] })
  }

  // --- Interior: slab, trusses, purlins and luminaires. ---
  parts.slab.push({ position: [xMid, y0 + 0.02, -D / 2], size: [W, 0.04, D] })
  const chordLen = D - 1
  const zMid = -D / 2 - 0.5
  const diagLen = Math.hypot(trusses.diagonalPitch, trusses.topChordHeight - trusses.bottomChordHeight)
  const diagAngle = Math.atan2(trusses.diagonalPitch, trusses.topChordHeight - trusses.bottomChordHeight)
  for (let x = left + trusses.spacing / 2; x < right; x += trusses.spacing) {
    parts.truss.push({ position: [x, y0 + trusses.topChordHeight, zMid], size: [0.5, 0.5, chordLen] })
    parts.truss.push({ position: [x, y0 + trusses.bottomChordHeight, zMid], size: [0.42, 0.42, chordLen] })
    let sign = 1
    for (let z = -1.5; z > zBack + 1.5 + trusses.diagonalPitch; z -= trusses.diagonalPitch) {
      parts.truss.push({
        position: [x, y0 + (trusses.topChordHeight + trusses.bottomChordHeight) / 2, z - trusses.diagonalPitch / 2],
        size: [0.22, diagLen, 0.22],
        rotation: [sign * diagAngle, 0, 0],
      })
      sign = -sign
    }
  }
  for (let z = -3; z > zBack + 1; z -= trusses.purlinPitch) parts.truss.push({ position: [xMid, y0 + trusses.topChordHeight + 0.25, z], size: [W - 1, 0.28, 0.28] })
  for (let z = -luminaires.rowSpacing / 2; z > zBack; z -= luminaires.rowSpacing) {
    for (let x = left + luminaires.spacing / 2; x < right; x += luminaires.spacing) {
      parts.luminaire.push({ position: [x, y0 + luminaires.height, z], size: [luminaires.length, 0.16, 0.55] })
    }
  }

  // --- Inspection / maintenance zones: darker rectangles with yellow outlines, and one service pit. ---
  for (const zone of cfg.zones) {
    const [zx, , zd] = zone.position
    const [zw, zl] = zone.size
    const zc: Vec3 = [zx, y0 + 0.045, -zd]
    if (zone.kind === 'pit') parts.pit.push({ position: zc, size: [zw, 0.03, zl] })
    else parts.zone.push({ position: zc, size: [zw, 0.02, zl] })
    const lw = 0.14
    parts.accentLine.push({ position: [zc[0], zc[1] + 0.012, zc[2] - zl / 2], size: [zw + lw, 0.015, lw] })
    parts.accentLine.push({ position: [zc[0], zc[1] + 0.012, zc[2] + zl / 2], size: [zw + lw, 0.015, lw] })
    parts.accentLine.push({ position: [zc[0] - zw / 2, zc[1] + 0.012, zc[2]], size: [lw, 0.015, zl] })
    parts.accentLine.push({ position: [zc[0] + zw / 2, zc[1] + 0.012, zc[2]], size: [lw, 0.015, zl] })
  }

  // --- Low-bed trailers (deck, gooseneck step, side rails, rear ramps); their wheels are React components. ---
  for (const unit of cfg.fleet) {
    if (unit.kind !== 'lowbed') continue
    const rot: Vec3 = [0, unit.rotationY, 0]
    const place = (lx: number, ly: number, lz: number, size: Vec3, key: 'fleetPaint' | 'fleetSteel') => {
      const [rx, rz] = rotXZ(lx, lz, unit.rotationY)
      parts[key].push({ position: [unit.x + rx, y0 + 0.04 + ly, -unit.depth + rz], size, rotation: rot })
    }
    place(1.0, 0.95, 0, [11.0, 0.55, 3.0], 'fleetPaint')
    place(-6.2, 1.45, 0, [3.4, 0.7, 1.6], 'fleetPaint')
    place(-4.6, 1.1, 0, [1.4, 0.6, 1.4], 'fleetSteel')
    place(1.0, 1.26, 1.45, [11.0, 0.12, 0.1], 'fleetSteel')
    place(1.0, 1.26, -1.45, [11.0, 0.12, 0.1], 'fleetSteel')
    place(7.6, 0.75, 0.9, [2.6, 0.12, 0.9], 'fleetSteel')
    place(7.6, 0.75, -0.9, [2.6, 0.12, 0.9], 'fleetSteel')
  }

  // --- Forecourt boundary: a kerb along the apron's front edge, broken where the exit road leaves. ---
  const { kerb } = apron
  for (const [a, b] of spansAround(apron.left, apron.right, kerbGaps)) {
    if (b - a < 0.05) continue
    parts.kerb.push({ position: [(a + b) / 2, y0 + kerb.height / 2, apron.front - kerb.width / 2], size: [b - a, kerb.height, kerb.width] })
  }

  return parts
}

function createMaterials(cfg: FleetGarageConfig): Record<PartKey, MeshStandardMaterial> {
  const make = (color: string, extra: Partial<MeshStandardMaterial> = {}) =>
    new MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.08, transparent: true, opacity: 0, depthWrite: true, ...extra })
  const c = cfg.colors
  const emissive = (color: string, intensity: number) => ({ emissive: new Color(color), emissiveIntensity: intensity, roughness: 0.4 })
  return {
    kerb: make(cfg.apron.kerb.color, { roughness: 0.9 }),
    bollard: make(c.bollard, { roughness: 0.6 }),
    frontColumn: make(c.frontColumn, { roughness: 0.45, metalness: 0.7 }),
    doorHead: make(c.doorHead, { roughness: 0.5, metalness: 0.5 }),
    bayLight: make(c.bayLight, emissive(c.bayLight, cfg.lightIntensity.bay)),
    plinth: make(c.plinth, { roughness: 0.92, metalness: 0.02 }),
    rib: make(c.rib),
    brandWall: make(c.brandWall, { roughness: 0.62, metalness: 0.25 }),
    cladding: make(c.cladding),
    fascia: make(c.fascia),
    fleetPaint: make(c.fleetPaint, { roughness: 0.55, metalness: 0.35 }),
    fleetSteel: make(c.fleetSteel, { roughness: 0.4, metalness: 0.8 }),
    sleeve: make(c.sleeve, { roughness: 0.6 }),
    interiorColumn: make(c.interiorColumn, { roughness: 0.45, metalness: 0.7 }),
    truss: make(c.truss, { roughness: 0.5, metalness: 0.6 }),
    luminaire: make(c.luminaire, emissive(c.luminaire, cfg.lightIntensity.luminaire)),
    pit: make(c.pit, { roughness: 0.95 }),
    accentLine: make(c.accentLine, { roughness: 0.7 }),
    zone: make(c.zone, { roughness: 0.92 }),
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
function LowBedWheels({ unit, groundY }: { unit: GarageFleetUnit; groundY: number }) {
  const positions = useMemo<Vec3[]>(() => {
    const out: Vec3[] = []
    for (const ax of [5.2, 6.7, 8.2]) for (const side of [-1.1, 1.1]) out.push([ax, 0.55, side])
    return out
  }, [])
  return (
    <group position={[unit.x, groundY + 0.04, -unit.depth]} rotation={[0, unit.rotationY, 0]}>
      <PlaceholderWheels positions={positions} radius={0.55} width={0.36} />
      <PlaceholderRims positions={positions} radius={0.32} width={0.4} />
    </group>
  )
}

/**
 * Parked fleet: the scene's own placeholder components, static, inside the hall.
 * After mount their shared opaque materials are swapped for transparent clones,
 * so the foreground vehicles keep their materials.
 */
function ParkedFleet({ config, groundY, fleet }: { config: FleetGarageConfig; groundY: number; fleet: FleetGarageProps['fleet'] }) {
  return (
    <group name="garage-fleet">
      {config.fleet.map((unit, index) => {
        const key = `${unit.kind}-${index}`
        if (unit.kind === 'lowbed') return <LowBedWheels key={key} unit={unit} groundY={groundY} />
        return (
          <group key={key} position={[unit.x, groundY + 0.04, -unit.depth]} rotation={[0, unit.rotationY, 0]} name={`garage-${unit.kind}`}>
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

const NO_GAPS: ReadonlyArray<readonly [number, number]> = []

export function FleetGarage({ config, groundY, fleet, getOpacity, getDaylight, kerbGaps = NO_GAPS }: FleetGarageProps) {
  const groupRef = useRef<Group>(null)
  const fleetRef = useRef<Group>(null)
  const fadeRef = useRef<FadeClones | null>(null)
  const last = useRef({ opacity: Number.NaN, daylight: Number.NaN })
  const invalidate = useThree((state) => state.invalidate)

  const geometry = useMemo(() => new BoxGeometry(1, 1, 1), [])
  const materials = useMemo(() => createMaterials(config), [config])
  const parts = useMemo(() => buildGarageParts(config, groundY, kerbGaps), [config, groundY, kerbGaps])
  const apronColors = useMemo(() => ({ base: new Color(config.apron.color), daylight: new Color(config.apron.daylightColor) }), [config.apron])
  const apronMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        color: config.apron.color,
        roughness: 0.94,
        metalness: 0.04,
        envMapIntensity: 0.35,
        toneMapped: false,
        transparent: true,
        opacity: 0,
        depthWrite: true,
      }),
    [config.apron.color],
  )

  useEffect(() => () => {
    for (const key of PART_KEYS) materials[key].dispose()
  }, [materials])
  useEffect(() => () => apronMaterial.dispose(), [apronMaterial])
  useEffect(() => () => geometry.dispose(), [geometry])

  // The parked fleet's shared materials are replaced by fade clones once its components have mounted.
  useLayoutEffect(() => {
    const group = fleetRef.current
    if (!group) return
    const fade = cloneMaterialsForFade(group, { renderOrder: FLEET_ORDER })
    fadeRef.current = fade
    last.current.opacity = Number.NaN
    invalidate()
    return () => {
      fade.restore()
      fadeRef.current = null
    }
  }, [config.fleet, fleet, invalidate])

  // Materials changed (new config): force the next frame to re-apply opacity and daylight.
  useEffect(() => {
    last.current = { opacity: Number.NaN, daylight: Number.NaN }
  }, [materials, apronMaterial])

  useFrame(() => {
    const opacity = clamp01(getOpacity())
    if (opacity !== last.current.opacity) {
      last.current.opacity = opacity
      for (const key of PART_KEYS) materials[key].opacity = opacity
      apronMaterial.opacity = opacity
      const fade = fadeRef.current
      if (fade) setMaterialsOpacity(fade.clones, opacity)
      if (groupRef.current) groupRef.current.visible = opacity > 0.001
    }
    const daylight = getDaylight ? clamp01(getDaylight()) : 0
    if (daylight !== last.current.daylight) {
      last.current.daylight = daylight
      apronMaterial.color.copy(apronColors.base).lerp(apronColors.daylight, daylight)
    }
  })

  const { apron } = config
  return (
    <group ref={groupRef} name="fleet-garage" visible={false}>
      {PART_KEYS.map((key) => (
        <InstancedBoxes key={key} name={`garage-${key}`} items={parts[key]} material={materials[key]} geometry={geometry} renderOrder={RENDER_ORDER[key]} />
      ))}
      <mesh
        name="garage-apron"
        position={[(apron.left + apron.right) / 2, groundY + LIFT.apron, apron.front / 2]}
        rotation={FLAT_EULER}
        material={apronMaterial}
        renderOrder={APRON_ORDER}
        receiveShadow
      >
        <planeGeometry args={[apron.right - apron.left, apron.front]} />
      </mesh>
      <group ref={fleetRef}>
        <ParkedFleet config={config} groundY={groundY} fleet={fleet} />
      </group>
    </group>
  )
}
