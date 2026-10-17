/**
 * Facility sign mounted on the garage's branding wall: a framed board on
 * stand-off brackets with the company name lettered on its face, and
 * gooseneck floodlights above it — the way a real industrial site sign is
 * fixed to cladding. It is an ATTACHMENT of the garage slot (slot-local
 * coordinates, facade plane at z = 0), so it moves with the garage and stays
 * when the procedural hall is replaced by a detailed model.
 *
 * The lettering is drawn once into a canvas texture from `config.text` — the
 * exact company name, no logo — in the site's own font stack, auto-fitted to
 * the board with even letter spacing (drawn glyph by glyph, which works in
 * every browser). It is redrawn once the document's fonts have loaded, so a
 * brand web font declared later is picked up. The board is lit by the scene
 * like the wall behind it and sits in the same fog, so it belongs to the
 * building rather than floating over it.
 *
 * Fading: `getOpacity()` (the garage's) is written to every material each
 * rendered frame; materials keep depth writes and draw before the garage.
 */
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { BoxGeometry, CanvasTexture, Color, Group, LinearMipmapLinearFilter, MeshStandardMaterial, SRGBColorSpace } from 'three'
import { clamp01 } from './fadeMaterials'
import type { BrandSignConfig } from './types'

export interface BrandSignProps {
  config: BrandSignConfig
  /** Y of the ground plane, slot-local. */
  groundY: number
  /** Read every frame; 0 = invisible, 1 = fully visible. Clamped. */
  getOpacity: () => number
}

/** Draws before the garage's own parts (which start at −14.5). */
const SIGN_ORDER = -16
/** Canvas width in pixels; the height follows the board's aspect ratio. */
const CANVAS_WIDTH = 2048

/** Resolves `var(--name)` against the document root; any other value is returned unchanged. */
function resolveFontFamily(family: string): string {
  const match = /^var\((--[\w-]+)\)$/.exec(family.trim())
  if (!match || typeof document === 'undefined') return family
  const value = getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim()
  return value || 'sans-serif'
}

/** Paints the sign face: background, inset border, centred tracked lettering and an accent rule. */
function paintFace(canvas: HTMLCanvasElement, config: BrandSignConfig): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width
  const h = canvas.height
  const { colors } = config
  ctx.fillStyle = colors.face
  ctx.fillRect(0, 0, w, h)
  // Inset border line.
  const inset = Math.round(h * 0.07)
  ctx.strokeStyle = colors.border
  ctx.lineWidth = Math.max(2, Math.round(h * 0.018))
  ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2)

  // Lettering: fit the tracked text to 88% of the width and 46% of the height.
  const family = resolveFontFamily(config.fontFamily)
  const text = config.text
  const glyphs = Array.from(text)
  const maxWidth = w * 0.88
  let size = h * 0.46
  const measure = (px: number): number => {
    ctx.font = `${config.fontWeight} ${px}px ${family}`
    const tracking = px * config.letterSpacing
    return glyphs.reduce((sum, g) => sum + ctx.measureText(g).width, 0) + tracking * Math.max(0, glyphs.length - 1)
  }
  let total = measure(size)
  if (total > maxWidth) {
    size *= maxWidth / total
    total = measure(size)
  }
  ctx.fillStyle = colors.text
  ctx.textBaseline = 'alphabetic'
  // Optical centring on the capital height (≈ 0.7 em for sans faces).
  const baseline = h * 0.47 + size * 0.35
  let x = (w - total) / 2
  const tracking = size * config.letterSpacing
  for (const g of glyphs) {
    ctx.fillText(g, x, baseline)
    x += ctx.measureText(g).width + tracking
  }
  // Accent rule under the lettering.
  const ruleWidth = total * 0.22
  const ruleHeight = Math.max(3, Math.round(h * 0.035))
  ctx.fillStyle = colors.accent
  ctx.fillRect((w - ruleWidth) / 2, baseline + size * 0.22, ruleWidth, ruleHeight)
}

export function BrandSign({ config, groundY, getOpacity }: BrandSignProps) {
  const groupRef = useRef<Group>(null)
  const last = useRef(Number.NaN)
  const invalidate = useThree((state) => state.invalidate)
  const anisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy())

  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = CANVAS_WIDTH
    canvas.height = Math.max(64, Math.round((CANVAS_WIDTH * config.height) / config.width))
    paintFace(canvas, config)
    const t = new CanvasTexture(canvas)
    t.colorSpace = SRGBColorSpace
    t.minFilter = LinearMipmapLinearFilter
    t.generateMipmaps = true
    t.anisotropy = Math.min(8, anisotropy)
    return t
  }, [config, anisotropy])

  // Repaint once web fonts are ready (no-op for the system stack, which is always available).
  useEffect(() => {
    let cancelled = false
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined
    fonts?.ready.then(() => {
      if (cancelled) return
      paintFace(texture.image as HTMLCanvasElement, config)
      texture.needsUpdate = true
      invalidate()
    })
    return () => {
      cancelled = true
    }
  }, [texture, config, invalidate])

  const materials = useMemo(() => {
    const make = (color: string, extra: Partial<MeshStandardMaterial> = {}) =>
      new MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.3, transparent: true, opacity: 0, depthWrite: true, ...extra })
    return {
      face: make('#ffffff', { map: texture, roughness: 0.6, metalness: 0.05 }),
      frame: make(config.colors.frame, { roughness: 0.45, metalness: 0.6 }),
      bracket: make(config.colors.bracket, { roughness: 0.5, metalness: 0.6 }),
      lamp: make(config.colors.lamp, { emissive: new Color(config.colors.lamp), emissiveIntensity: config.lamps.intensity, roughness: 0.4 }),
    }
  }, [texture, config.colors, config.lamps.intensity])
  const box = useMemo(() => new BoxGeometry(1, 1, 1), [])

  useEffect(() => () => texture.dispose(), [texture])
  useEffect(() => () => {
    for (const material of Object.values(materials)) material.dispose()
  }, [materials])
  useEffect(() => () => box.dispose(), [box])
  useEffect(() => {
    last.current = Number.NaN
  }, [materials])

  useFrame(() => {
    const opacity = clamp01(getOpacity())
    if (opacity === last.current) return
    last.current = opacity
    for (const material of Object.values(materials)) material.opacity = opacity
    if (groupRef.current) groupRef.current.visible = opacity > 0.001
  })

  const { width: w, height: h, depth: d, standoff, centre } = config
  const zBoard = standoff + d / 2
  const frameT = Math.min(0.14, h * 0.05)
  // Box faces: +x, −x, +y, −y, +z (front), −z. Only the front carries the lettering.
  const boardMaterials = [materials.frame, materials.frame, materials.frame, materials.frame, materials.face, materials.frame]
  const bracketXs = [-w * 0.38, -w * 0.13, w * 0.13, w * 0.38]
  const lampXs = Array.from({ length: Math.max(0, config.lamps.count) }, (_, i) => (config.lamps.count === 1 ? 0 : -w * 0.36 + (w * 0.72 * i) / (config.lamps.count - 1)))
  const armLength = 1.1

  return (
    <group ref={groupRef} name="brand-sign" position={[centre[0], groundY + centre[1], 0]} visible={false}>
      <mesh name="brand-sign-board" geometry={box} material={boardMaterials} position={[0, 0, zBoard]} scale={[w, h, d]} renderOrder={SIGN_ORDER} />
      {/* Slim outer frame proud of the face: top, bottom, left, right. */}
      <mesh geometry={box} material={materials.frame} position={[0, h / 2 + frameT / 2, zBoard]} scale={[w + frameT * 2, frameT, d + 0.04]} renderOrder={SIGN_ORDER} />
      <mesh geometry={box} material={materials.frame} position={[0, -h / 2 - frameT / 2, zBoard]} scale={[w + frameT * 2, frameT, d + 0.04]} renderOrder={SIGN_ORDER} />
      <mesh geometry={box} material={materials.frame} position={[-w / 2 - frameT / 2, 0, zBoard]} scale={[frameT, h, d + 0.04]} renderOrder={SIGN_ORDER} />
      <mesh geometry={box} material={materials.frame} position={[w / 2 + frameT / 2, 0, zBoard]} scale={[frameT, h, d + 0.04]} renderOrder={SIGN_ORDER} />
      {/* Stand-off brackets fixing the board to the wall, top and bottom. */}
      {bracketXs.flatMap((bx) =>
        [h / 2 - 0.25, -h / 2 + 0.25].map((by) => (
          <mesh key={`${bx}:${by}`} geometry={box} material={materials.bracket} position={[bx, by, standoff / 2]} scale={[0.16, 0.16, standoff]} renderOrder={SIGN_ORDER + 0.5} />
        )),
      )}
      {/* Gooseneck floodlights: a wall plate, an arm reaching out over the board, and a lamp head aimed down at it. */}
      {lampXs.map((lx) => (
        <group key={lx} position={[lx, h / 2 + frameT + 0.75, 0]}>
          <mesh geometry={box} material={materials.bracket} position={[0, 0, 0.04]} scale={[0.3, 0.3, 0.08]} renderOrder={SIGN_ORDER + 0.5} />
          <mesh geometry={box} material={materials.bracket} position={[0, 0, armLength / 2]} scale={[0.08, 0.08, armLength]} renderOrder={SIGN_ORDER + 0.5} />
          <mesh geometry={box} material={materials.lamp} position={[0, -0.08, armLength]} scale={[0.5, 0.14, 0.32]} rotation={[0.35, 0, 0]} renderOrder={SIGN_ORDER} />
        </group>
      ))}
    </group>
  )
}
