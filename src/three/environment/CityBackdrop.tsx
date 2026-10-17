/**
 * Procedural stand-in for the CITY environment of Scene 01: a seeded generator
 * lays out low industrial sheds with stacks, a band of mid-rise commercial
 * blocks and a distant skyline of towers (some taller landmark towers with
 * setback crowns) — boxes only, one InstancedMesh per material (5 draw calls),
 * no textures. Authored in its slot's local space; it stands entirely behind
 * the garage and the road from the camera's point of view.
 *
 * It is opaque and always present: nothing here fades. In the enclosed-yard
 * atmosphere the scene's short, dark fog swallows it completely; as the
 * daylight haze takes over (a much longer, lighter fog) it emerges in the
 * distance — through the garage's drive-through openings and beyond the
 * building's end — and the camera travelling with the vehicle reveals the rest
 * with true parallax (the far skyline drifts slowly, nearer blocks faster).
 */
import { useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { BoxGeometry, Color, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three'
import type { Vec3 } from '../assets/types'
import type { CityBuildingBand, CityConfig } from './types'

export interface CityBackdropProps {
  config: CityConfig
  /** Y of the ground plane, slot-local. */
  groundY: number
}

interface BoxItem {
  position: Vec3
  size: Vec3
  /** Brightness multiplier for this instance (subtle per-building tone variation). */
  tone: number
}

type PartKey = 'industrial' | 'roof' | 'concrete' | 'steel' | 'glass'
const PART_KEYS: readonly PartKey[] = ['industrial', 'roof', 'concrete', 'steel', 'glass']

const _matrix = new Matrix4()
const _position = new Vector3()
const _scale = new Vector3()
const _identity = new Quaternion()
const _tone = new Color()

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
    // A building that would overrun the span is left out (same draws, so the rest of the layout is unchanged): a
    // band clipped at the detailed city's end must not reach into the band continuing beyond it.
    if (x + w <= span[1]) place(x + w / 2, w)
    x += w + range(rand, band.gap)
  }
}

/** Lays out every box of the city from the config. Pure and deterministic. */
function buildCity(cfg: CityConfig, groundY: number): Record<PartKey, BoxItem[]> {
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
  walkBand(rand, sk.span ?? cfg.span, sk, (x, w) => {
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
  walkBand(rand, mr.span ?? cfg.span, mr, (x, w) => {
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
  walkBand(rand, ind.span ?? cfg.span, ind, (x, w) => {
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

  return parts
}

function createMaterials(cfg: CityConfig): Record<PartKey, MeshStandardMaterial> {
  // Tone-mapped like the garage and the vehicles, so the city never out-shines them; fog is applied after tone mapping,
  // so fully hazed buildings still land exactly on the haze colour at the horizon.
  const make = (color: string, roughness: number, metalness: number) => new MeshStandardMaterial({ color, roughness, metalness })
  const c = cfg.colors
  return {
    industrial: make(c.industrial, 0.85, 0.15),
    roof: make(c.roof, 0.9, 0.05),
    concrete: make(c.concrete, 0.88, 0.02),
    steel: make(c.steel, 0.6, 0.45),
    glass: make(c.glass, 0.35, 0.5),
  }
}

function InstancedBoxes({ items, material, geometry, name }: { items: readonly BoxItem[]; material: MeshStandardMaterial; geometry: BoxGeometry; name: string }) {
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
  return <instancedMesh key={items.length} ref={ref} name={name} args={[geometry, material, items.length]} />
}

export function CityBackdrop({ config, groundY, name = 'city' }: CityBackdropProps & { name?: string }) {
  const geometry = useMemo(() => new BoxGeometry(1, 1, 1), [])
  const materials = useMemo(() => createMaterials(config), [config])
  const parts = useMemo(() => buildCity(config, groundY), [config, groundY])

  useEffect(() => () => {
    for (const key of PART_KEYS) materials[key].dispose()
  }, [materials])
  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <group name={name}>
      {PART_KEYS.map((key) => (
        <InstancedBoxes key={key} name={`city-${key}`} items={parts[key]} material={materials[key]} geometry={geometry} />
      ))}
    </group>
  )
}
