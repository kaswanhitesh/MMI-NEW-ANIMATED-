/**
 * Procedural industrial warehouse used as a cinematic backdrop. Everything is
 * boxes drawn through a handful of InstancedMeshes (one per material), so the
 * whole building costs ~14 draw calls and no texture or network request.
 *
 * Fading: `getOpacity()` is read every rendered frame and written to the
 * shared materials, so a scroll timeline can fade the building in and out by
 * tweening a single number on the scene rig. The materials are transparent
 * but KEEP depth writes, and the parts carry explicit negative render orders
 * from front to back: a nearer part is drawn first and the wall behind it is
 * then rejected by the depth test, so a half-faded building looks like a
 * fading solid rather than a stack of translucent layers. The negative orders
 * also keep it ahead of the yard's own transparent overlays (lane markings,
 * contact shadows), and the opaque vehicles in front occlude it through the
 * depth test. Nothing here casts shadows: a shadow would appear at full
 * strength before the building had faded in.
 */
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { BoxGeometry, Color, Group, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three'
import type { Vec3 } from '../assets/types'
import type { WarehouseConfig } from './types'

export interface WarehouseProps {
  config: WarehouseConfig
  /** Y of the ground plane the building stands on. */
  groundY: number
  /** Read every frame; 0 = invisible, 1 = fully visible. Clamped. */
  getOpacity: () => number
}

interface BoxItem {
  position: Vec3
  size: Vec3
}

type PartKey = keyof WarehouseConfig['colors']

/**
 * Draw order inside the building, FRONT TO BACK (lower = earlier). With depth
 * writes on, each pixel keeps only the nearest part, so a half-faded building
 * never double-blends where a door or pilaster overlaps the wall behind it.
 * All negative so the yard's default transparent overlays draw after.
 */
const RENDER_ORDER: Readonly<Record<PartKey, number>> = {
  canopy: -10,
  bumper: -9,
  frame: -9,
  lightStrip: -9,
  seam: -9,
  pilaster: -8,
  door: -8,
  fascia: -8,
  plinth: -7,
  clerestory: -7,
  roof: -7,
  wall: -6,
}

const PART_KEYS = Object.keys(RENDER_ORDER) as PartKey[]

/* Scratch objects reused while writing instance matrices. */
const _matrix = new Matrix4()
const _position = new Vector3()
const _scale = new Vector3()
const _identity = new Quaternion()

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value
}

/** Lays out every box of the building from the config. Pure. */
function buildWarehouseParts(cfg: WarehouseConfig, groundY: number): Record<PartKey, BoxItem[]> {
  const [x0, , z0] = cfg.position
  const y0 = groundY
  const { width: W, height: H, depth: D, dock, bays, canopy } = cfg
  const parts: Record<PartKey, BoxItem[]> = {
    wall: [],
    roof: [],
    plinth: [],
    clerestory: [],
    seam: [],
    pilaster: [],
    door: [],
    fascia: [],
    frame: [],
    bumper: [],
    lightStrip: [],
    canopy: [],
  }

  // Main volume, roof slab (slight overhang), top fascia band and the high clerestory band.
  parts.wall.push({ position: [x0, y0 + H / 2, z0 - D / 2], size: [W, H, D] })
  parts.roof.push({ position: [x0, y0 + H + 0.1, z0 - D / 2], size: [W + 0.4, 0.2, D + 0.4] })
  parts.fascia.push({ position: [x0, y0 + H - 0.6, z0 + 0.14], size: [W, 1.2, 0.28] })
  parts.clerestory.push({ position: [x0, y0 + H - 2.4, z0 + 0.03], size: [W - 1, 1.1, 0.06] })

  // Raised loading dock running the full width.
  parts.plinth.push({ position: [x0, y0 + dock.height / 2, z0 + dock.depth / 2], size: [W, dock.height, dock.depth] })

  // Precast panel seams across the whole wall (skipping where a pilaster will sit).
  const bayStart = x0 - (bays.count * bays.pitch) / 2
  const pilasterXs = new Set<number>()
  for (let i = 0; i <= bays.count; i++) pilasterXs.add(Math.round((bayStart + i * bays.pitch) * 100))
  for (let x = x0 - W / 2 + cfg.panelSeamPitch; x < x0 + W / 2 - 0.5; x += cfg.panelSeamPitch) {
    if (pilasterXs.has(Math.round(x * 100))) continue
    parts.seam.push({ position: [x, y0 + H / 2, z0 + 0.015], size: [0.05, H - 0.2, 0.03] })
  }

  // Pilasters framing the dock bays, proud of the wall.
  for (let i = 0; i <= bays.count; i++) {
    parts.pilaster.push({ position: [bayStart + i * bays.pitch, y0 + (H - 0.3) / 2, z0 + 0.2], size: [0.9, H - 0.3, 0.42] })
  }

  // One sectional dock door per bay with frame, panel seams, bumpers and a strip light above.
  const doorBottom = y0 + dock.height
  for (let i = 0; i < bays.count; i++) {
    const x = bayStart + (i + 0.5) * bays.pitch
    const { doorWidth: dw, doorHeight: dh } = bays
    parts.door.push({ position: [x, doorBottom + dh / 2, z0 + 0.08], size: [dw, dh, 0.1] })
    parts.frame.push({ position: [x, doorBottom + dh + 0.1, z0 + 0.14], size: [dw + 0.5, 0.22, 0.24] })
    parts.frame.push({ position: [x - (dw / 2 + 0.14), doorBottom + dh / 2, z0 + 0.14], size: [0.26, dh, 0.24] })
    parts.frame.push({ position: [x + (dw / 2 + 0.14), doorBottom + dh / 2, z0 + 0.14], size: [0.26, dh, 0.24] })
    for (let k = 1; k <= 3; k++) parts.seam.push({ position: [x, doorBottom + (dh * k) / 4, z0 + 0.145], size: [dw - 0.1, 0.05, 0.03] })
    for (const side of [-1, 1]) {
      parts.bumper.push({ position: [x + side * (dw / 2 - 0.35), y0 + dock.height - 0.55, z0 + dock.depth + 0.07], size: [0.35, 0.45, 0.14] })
    }
    parts.lightStrip.push({ position: [x, doorBottom + dh + 0.75, z0 + 0.18], size: [dw * 0.7, 0.12, 0.2] })
  }

  // Dock canopy over the bays, with a front lip.
  const canopyWidth = bays.count * bays.pitch + 2
  parts.canopy.push({ position: [x0, y0 + canopy.height, z0 + canopy.depth / 2], size: [canopyWidth, canopy.thickness, canopy.depth] })
  parts.canopy.push({ position: [x0, y0 + canopy.height - 0.25, z0 + canopy.depth - 0.1], size: [canopyWidth, 0.5, 0.2] })

  return parts
}

function createMaterials(cfg: WarehouseConfig): Record<PartKey, MeshStandardMaterial> {
  const make = (color: string, extra: Partial<MeshStandardMaterial> = {}) =>
    new MeshStandardMaterial({ color, roughness: 0.86, metalness: 0.05, transparent: true, opacity: 0, depthWrite: true, ...extra })
  const c = cfg.colors
  return {
    wall: make(c.wall),
    roof: make(c.roof, { roughness: 0.95 }),
    plinth: make(c.plinth, { roughness: 0.92 }),
    clerestory: make(c.clerestory, { roughness: 0.35, metalness: 0.15 }),
    seam: make(c.seam),
    pilaster: make(c.pilaster),
    door: make(c.door, { roughness: 0.6, metalness: 0.3 }),
    fascia: make(c.fascia),
    frame: make(c.frame, { roughness: 0.5, metalness: 0.6 }),
    bumper: make(c.bumper, { roughness: 0.95 }),
    lightStrip: make(c.lightStrip, { emissive: new Color(c.lightStrip), emissiveIntensity: cfg.lightStripIntensity, roughness: 0.4 }),
    canopy: make(c.canopy, { roughness: 0.7, metalness: 0.35 }),
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
    items.forEach(({ position, size }, index) => {
      _position.set(position[0], position[1], position[2])
      _scale.set(size[0], size[1], size[2])
      _matrix.compose(_position, _identity, _scale)
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

export function Warehouse({ config, groundY, getOpacity }: WarehouseProps) {
  const groupRef = useRef<Group>(null)
  const lastOpacity = useRef(Number.NaN)

  const geometry = useMemo(() => new BoxGeometry(1, 1, 1), [])
  const materials = useMemo(() => createMaterials(config), [config])
  const parts = useMemo(() => buildWarehouseParts(config, groundY), [config, groundY])

  useEffect(() => {
    return () => {
      for (const key of PART_KEYS) materials[key].dispose()
    }
  }, [materials])
  useEffect(() => () => geometry.dispose(), [geometry])

  // Materials changed (new config): force the next frame to re-apply the opacity.
  useEffect(() => {
    lastOpacity.current = Number.NaN
  }, [materials])

  useFrame(() => {
    const opacity = clamp01(getOpacity())
    if (opacity === lastOpacity.current) return
    lastOpacity.current = opacity
    for (const key of PART_KEYS) materials[key].opacity = opacity
    if (groupRef.current) groupRef.current.visible = opacity > 0.001
  })

  return (
    <group ref={groupRef} name="warehouse" visible={false}>
      {PART_KEYS.map((key) => (
        <InstancedBoxes key={key} name={`warehouse-${key}`} items={parts[key]} material={materials[key]} geometry={geometry} renderOrder={RENDER_ORDER[key]} />
      ))}
    </group>
  )
}
