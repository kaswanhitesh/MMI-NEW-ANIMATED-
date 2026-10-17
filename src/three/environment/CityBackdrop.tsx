/**
 * Procedural CITY EDGE backdrop and daylight SKY for the closing journey of Scene 01.
 *
 * City: a seeded generator lays out a distant skyline of towers (some taller landmark towers with setback
 * crowns), a band of mid-rise commercial blocks, low industrial sheds with stacks, an elevated metro viaduct
 * and street lights along the highway's far verge — boxes only, one InstancedMesh per material (≈ 9 draw
 * calls), no textures. It stands entirely behind the road, so the vehicles always occlude it, and it uses the
 * scene fog, so distance haze gives it atmospheric depth. Forward travel is conveyed by the CAMERA moving past
 * it (true parallax: the far skyline drifts slowly, poles and markings pass quickly); nothing here moves.
 *
 * Sky: a large back-faced sphere with a vertical gradient (haze at the horizon, muted blue-grey above) that
 * follows the camera, drawn first and never fogged.
 *
 * Fading: `getOpacity()` is read every rendered frame and written to every material, so the scroll timeline
 * crossfades the city and sky in (and out again on scroll-up). Materials keep depth writes and draw front to
 * back with explicit negative render orders, ahead of the garage and the road; the sky draws before all.
 */
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { BackSide, BoxGeometry, Color, Float32BufferAttribute, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Quaternion, SphereGeometry, Vector3 } from 'three'
import type { Vec3 } from '../assets/types'
import type { CityBuildingBand, CityConfig } from './types'

export interface CityBackdropProps {
  config: CityConfig
  /** Y of the ground plane. */
  groundY: number
  /** Read every frame; 0 = invisible, 1 = fully visible. Clamped. */
  getOpacity: () => number
  /** X ranges where no street light may stand (e.g. where an access road joins the highway). */
  lightGaps?: ReadonlyArray<readonly [number, number]>
}

interface BoxItem {
  position: Vec3
  size: Vec3
  /** Brightness multiplier for this instance (subtle per-building tone variation). */
  tone: number
}

type PartKey = 'lamp' | 'pole' | 'viaduct' | 'industrial' | 'roof' | 'concrete' | 'steel' | 'glass'

/** Draw order, front to back (lower = earlier); all ahead of the garage (−14…) and the road (−3…). */
const RENDER_ORDER: Readonly<Record<PartKey, number>> = {
  lamp: -72,
  pole: -71,
  viaduct: -70,
  industrial: -68,
  roof: -67,
  concrete: -66,
  steel: -65,
  glass: -64,
}
const SKY_ORDER = -100
const PART_KEYS = Object.keys(RENDER_ORDER) as PartKey[]

const _matrix = new Matrix4()
const _position = new Vector3()
const _scale = new Vector3()
const _identity = new Quaternion()
const _tone = new Color()

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value
}

/** Small deterministic PRNG (mulberry32). */
function createRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const range = (rand: () => number, [a, b]: readonly [number, number]) => a + (b - a) * rand()

/** Walks along X placing buildings of a band; `place` receives (x centre, width) and returns nothing. */
function walkBand(rand: () => number, span: readonly [number, number], band: CityBuildingBand, place: (x: number, w: number) => void) {
  let x = span[0]
  while (x < span[1]) {
    const w = range(rand, band.width)
    place(x + w / 2, w)
    x += w + range(rand, band.gap)
  }
}

/** Lays out every box of the city from the config. Pure and deterministic. */
function buildCity(cfg: CityConfig, groundY: number, lightGaps: ReadonlyArray<readonly [number, number]>): Record<PartKey, BoxItem[]> {
  const parts = Object.fromEntries(PART_KEYS.map((k) => [k, [] as BoxItem[]])) as Record<PartKey, BoxItem[]>
  const rand = createRandom(cfg.seed)
  const y0 = groundY
  let tone = 1
  const box = (key: PartKey, x: number, y: number, z: number, w: number, h: number, d: number) => parts[key].push({ position: [x, y, z], size: [w, h, d], tone })
  // Each building gets its own slight tone so a band of boxes never reads as one flat wall.
  const nextTone = () => {
    tone = 0.84 + rand() * 0.3
  }

  // Distant skyline: towers, some landmark towers with a setback crown and a slim mast.
  const sk = cfg.skyline
  walkBand(rand, cfg.span, sk, (x, w) => {
    const d = range(rand, sk.depth)
    const z = range(rand, sk.zRange) - d / 2
    nextTone()
    const landmark = rand() < sk.landmarkChance
    const h = landmark ? range(rand, sk.landmarkHeight) : range(rand, sk.height)
    const key: PartKey = rand() < 0.55 ? 'glass' : rand() < 0.6 ? 'concrete' : 'steel'
    box(key, x, y0 + h / 2, z, w, h, d)
    if (landmark) {
      const ch = h * 0.12
      box(key === 'glass' ? 'steel' : 'glass', x, y0 + h + ch / 2, z, w * 0.62, ch, d * 0.62)
      box('steel', x, y0 + h + ch + h * 0.05, z, 1.2, h * 0.1, 1.2)
    } else if (rand() < 0.4) {
      box('roof', x, y0 + h + 1.5, z, w * 0.4, 3, d * 0.4)
    }
  })

  // Mid-rise commercial blocks.
  const mr = cfg.midrise
  walkBand(rand, cfg.span, mr, (x, w) => {
    const d = range(rand, mr.depth)
    const z = range(rand, mr.zRange) - d / 2
    const h = range(rand, mr.height)
    nextTone()
    box(rand() < 0.5 ? 'concrete' : 'glass', x, y0 + h / 2, z, w, h, d)
    box('roof', x, y0 + h + 0.6, z, w * 0.96, 1.2, d * 0.96)
    // Floor slabs expressed on the road-facing facade: a quiet horizontal rhythm that reads as a real building.
    for (let fy = 3.6; fy < h - 1; fy += 3.6) box('roof', x, y0 + fy, z + d / 2 + 0.15, w + 0.2, 0.32, 0.3)
  })

  // Industrial sheds with occasional stacks.
  const ind = cfg.industrial
  walkBand(rand, cfg.span, ind, (x, w) => {
    const d = range(rand, ind.depth)
    const z = range(rand, ind.zRange) - d / 2
    const h = range(rand, ind.height)
    nextTone()
    box('industrial', x, y0 + h / 2, z, w, h, d)
    box('roof', x, y0 + h + 0.4, z, w + 0.6, 0.8, d + 0.6)
    // Road-facing facade: cladding seams every ~5 m and one or two dark loading doors, so it reads as a working shed.
    const front = z + d / 2
    for (let sx = x - w / 2 + 5; sx < x + w / 2 - 1; sx += 5) box('roof', sx, y0 + h / 2, front + 0.12, 0.28, h, 0.24)
    const doors = w > 50 ? 2 : 1
    for (let i = 0; i < doors; i++) {
      const dx = x + (doors === 1 ? 0 : (i - 0.5) * w * 0.45)
      const dh = Math.min(h * 0.62, 6)
      box('steel', dx, y0 + dh / 2, front + 0.08, 5, dh, 0.16)
    }
    if (rand() < ind.stackChance) {
      const sh = range(rand, ind.stackHeight)
      nextTone()
      box('steel', x + w * (rand() - 0.5) * 0.6, y0 + sh / 2, z - d * 0.25, 2.4, sh, 2.4)
    }
  })

  // Elevated metro viaduct running parallel to the highway.
  const v = cfg.viaduct
  tone = 1
  if (v.enabled) {
    const length = cfg.span[1] - cfg.span[0]
    const cx = (cfg.span[0] + cfg.span[1]) / 2
    box('viaduct', cx, y0 + v.deckHeight + v.deckThickness / 2, v.z, length, v.deckThickness, v.deckWidth)
    box('viaduct', cx, y0 + v.deckHeight + v.deckThickness + 0.6, v.z + v.deckWidth / 2 - 0.15, length, 1.2, 0.3)
    for (let x = cfg.span[0] + v.pierSpacing / 2; x < cfg.span[1]; x += v.pierSpacing) {
      box('viaduct', x, y0 + v.deckHeight / 2, v.z, v.pierSize, v.deckHeight, v.pierSize)
      box('viaduct', x, y0 + v.deckHeight - 0.5, v.z, v.deckWidth * 0.8, 1, v.pierSize * 1.4)
    }
  }

  // Street lights along the highway's far verge, arms reaching over the shoulder (towards +Z).
  const sl = cfg.streetLights
  tone = 1
  if (sl.enabled) {
    const blocked = (x: number) => lightGaps.some(([a, b]) => x >= Math.min(a, b) - 2 && x <= Math.max(a, b) + 2)
    for (let x = Math.ceil(cfg.span[0] / sl.spacing) * sl.spacing; x < cfg.span[1]; x += sl.spacing) {
      if (blocked(x)) continue
      box('pole', x, y0 + sl.height / 2, sl.z, 0.28, sl.height, 0.28)
      box('pole', x, y0 + sl.height - 0.1, sl.z + sl.armLength / 2, 0.16, 0.16, sl.armLength)
      box('lamp', x, y0 + sl.height - 0.25, sl.z + sl.armLength - 0.2, 0.36, 0.14, 0.7)
    }
  }
  return parts
}

function createMaterials(cfg: CityConfig): Record<PartKey, MeshStandardMaterial> {
  const make = (color: string, roughness: number, metalness: number) =>
    new MeshStandardMaterial({ color, roughness, metalness, transparent: true, opacity: 0, depthWrite: true, toneMapped: false })
  const c = cfg.colors
  return {
    lamp: make(c.infrastructure, 0.5, 0.4),
    pole: make(c.infrastructure, 0.55, 0.5),
    viaduct: make(c.concrete, 0.9, 0.02),
    industrial: make(c.industrial, 0.85, 0.15),
    roof: make(c.roof, 0.9, 0.05),
    concrete: make(c.concrete, 0.88, 0.02),
    steel: make(c.steel, 0.6, 0.45),
    glass: make(c.glass, 0.35, 0.5),
  }
}

function InstancedBoxes({ items, material, geometry, renderOrder, name }: { items: readonly BoxItem[]; material: MeshStandardMaterial; geometry: BoxGeometry; renderOrder: number; name: string }) {
  const ref = useRef<InstancedMesh>(null)
  const invalidate = useThree((state) => state.invalidate)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    items.forEach(({ position, size, tone }, index) => {
      _position.set(position[0], position[1], position[2])
      _scale.set(size[0], size[1], size[2])
      _matrix.compose(_position, _identity, _scale)
      mesh.setMatrixAt(index, _matrix)
      mesh.setColorAt(index, _tone.setScalar(tone))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
    invalidate()
  }, [items, invalidate])
  if (items.length === 0) return null
  return <instancedMesh key={items.length} ref={ref} name={name} args={[geometry, material, items.length]} renderOrder={renderOrder} />
}

/** Vertical gradient sphere: horizon colour at and below the horizon, easing to the zenith colour overhead. */
function createSkyGeometry(cfg: CityConfig['sky']): SphereGeometry {
  const geometry = new SphereGeometry(cfg.radius, 48, 24)
  const horizon = new Color(cfg.horizon)
  const zenith = new Color(cfg.zenith)
  const position = geometry.getAttribute('position')
  const colors = new Float32Array(position.count * 3)
  const c = new Color()
  for (let i = 0; i < position.count; i++) {
    const t = Math.max(0, position.getY(i) / cfg.radius)
    c.copy(horizon).lerp(zenith, Math.pow(t, 0.55))
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  return geometry
}

export function CityBackdrop({ config, groundY, getOpacity, lightGaps = [] }: CityBackdropProps) {
  const groupRef = useRef<Group>(null)
  const skyRef = useRef<Mesh>(null)
  const lastOpacity = useRef(Number.NaN)

  const geometry = useMemo(() => new BoxGeometry(1, 1, 1), [])
  const materials = useMemo(() => createMaterials(config), [config])
  const parts = useMemo(() => buildCity(config, groundY, lightGaps), [config, groundY, lightGaps])
  const skyGeometry = useMemo(() => createSkyGeometry(config.sky), [config.sky])
  const skyMaterial = useMemo(
    () => new MeshBasicMaterial({ vertexColors: true, side: BackSide, fog: false, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
    [],
  )

  useEffect(() => () => {
    for (const key of PART_KEYS) materials[key].dispose()
  }, [materials])
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => skyGeometry.dispose(), [skyGeometry])
  useEffect(() => () => skyMaterial.dispose(), [skyMaterial])
  useEffect(() => {
    lastOpacity.current = Number.NaN
  }, [materials])

  useFrame((state) => {
    // The sky is centred on the camera so its horizon never shifts as the camera travels.
    if (skyRef.current) skyRef.current.position.copy(state.camera.position)
    const opacity = clamp01(getOpacity())
    if (opacity === lastOpacity.current) return
    lastOpacity.current = opacity
    for (const key of PART_KEYS) materials[key].opacity = opacity
    skyMaterial.opacity = opacity
    if (groupRef.current) groupRef.current.visible = opacity > 0.001
  })

  return (
    <group ref={groupRef} name="city" visible={false}>
      <mesh ref={skyRef} name="city-sky" geometry={skyGeometry} material={skyMaterial} renderOrder={SKY_ORDER} frustumCulled={false} />
      {PART_KEYS.map((key) => (
        <InstancedBoxes key={key} name={`city-${key}`} items={parts[key]} material={materials[key]} geometry={geometry} renderOrder={RENDER_ORDER[key]} />
      ))}
    </group>
  )
}
