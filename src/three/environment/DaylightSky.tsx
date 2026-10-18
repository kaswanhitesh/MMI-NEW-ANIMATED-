/**
 * Open-air daylight SKY: a large back-faced sphere with a vertical gradient
 * (haze at the horizon, muted blue-grey overhead) that follows the camera, so
 * its horizon never shifts while the camera travels. Drawn first, never
 * fogged, depth writes off. `getDaylight()` (0–1) is its opacity: at 0 the
 * enclosed-yard backdrop colour shows; at 1 the scene sits under daylight.
 * Part of the atmosphere, not of any replaceable environment.
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { BackSide, Color, Float32BufferAttribute, MeshBasicMaterial, SphereGeometry, type Mesh } from 'three'
import { clamp01 } from './fadeMaterials'
import type { AtmosphereConfig } from './types'

export interface DaylightSkyProps {
  sky: AtmosphereConfig['sky']
  getDaylight: () => number
}

/** Drawn before everything else. */
const SKY_ORDER = -100

/** Vertical gradient sphere: horizon colour at and below the horizon, easing to the zenith colour overhead. */
function createSkyGeometry(cfg: AtmosphereConfig['sky']): SphereGeometry {
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

export function DaylightSky({ sky, getDaylight }: DaylightSkyProps) {
  const ref = useRef<Mesh>(null)
  const last = useRef(Number.NaN)
  const geometry = useMemo(() => createSkyGeometry(sky), [sky])
  const material = useMemo(
    () => new MeshBasicMaterial({ vertexColors: true, side: BackSide, fog: false, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
    [],
  )
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => {
    last.current = Number.NaN
  }, [geometry])

  useFrame((state) => {
    const mesh = ref.current
    if (!mesh) return
    mesh.position.copy(state.camera.position)
    const opacity = clamp01(getDaylight())
    if (opacity === last.current) return
    last.current = opacity
    material.opacity = opacity
    mesh.visible = opacity > 0.001
  })

  return <mesh ref={ref} name="daylight-sky" geometry={geometry} material={material} renderOrder={SKY_ORDER} frustumCulled={false} visible={false} />
}
