/**
 * LiftingRig: TEMPORARY procedural stand-in for the below-the-hook rigging of
 * Scene 01's vessel lift. It draws two top slings from the crane hook to the
 * ends of a spreader beam, the spreader beam with its end padeye plates, and
 * the lower slings from the spreader down to the vessel's lugs, each ending in
 * a bow shackle. A detailed GLB can replace it later, because the scene only
 * talks to it through `config` and `getPose()`.
 *
 * FRAME: WORLD space. Mount it at the scene root with no parent transform.
 * Every point in the pose is a world position in metres.
 *
 * Props:
 *  - `config`: dimensions and colours. Geometries and materials are memoised
 *    on it and disposed when it changes or the rig unmounts.
 *  - `getPose()`: read in a single useFrame every rendered frame. Nothing is
 *    written while the pose is unchanged. The scene invalidates the demand
 *    frameloop whenever its timeline moves.
 *
 * Conventions:
 *  - Spreader axis: for yaw = pose.spreaderYaw the beam lies along
 *    (cos yaw, 0, −sin yaw), which is +X turned by `yaw` about +Y (three.js
 *    rotation.y). So yaw 0 points along world +X and yaw π/2 along world −Z.
 *    The beam (length × depth × width, depth vertical) is centred on
 *    pose.spreader.
 *  - Padeyes: an end plate at each end (centre ± length/2 along the axis) has
 *    a top and a bottom pin hole, SPREADER_PADEYE_HOLE_OFFSET above the top
 *    face and below the bottom face. Each TOP sling runs straight from
 *    pose.hook to a top hole at
 *    centre ± (length/2)·axis + (0, depth/2 + offset, 0).
 *    The scene should put each SlingPose.top on a bottom hole at
 *    centre ± (length/2)·axis − (0, depth/2 + offset, 0).
 *  - Lower slings: with slack 0, one straight cylinder from `top` to the
 *    shackle crown. With slack > 0, a quadratic Bézier drawn as
 *    `sling.segments` short cylinders. Its control point is pushed sideways,
 *    perpendicular to the spreader axis (+ for even sling indices, − for odd
 *    ones), by slack × 1.2, and down by slack × 0.25.
 *  - Shackles: the PIN centre is always at SlingPose.bottom, so when attached
 *    the pin sits in the lug's hole and the bow straddles the lug plate. The
 *    pin is horizontal and perpendicular to the spreader axis, matching lug
 *    plates that lie along the vessel axis, and the bow rises above it. The
 *    sling's eye sits in the bow's crown, so the lower sling is drawn to
 *    bottom + (0, crown, 0), where crown = shackle.size − bow tube radius
 *    (0.9 × size). The shape is the same whether the shackle is attached or
 *    free, so the moment of attachment never pops; a free shackle simply hangs
 *    just below its sling end.
 *  - Visibility: the whole rig is hidden (`visible = false`) while
 *    pose.visibility < 0.01. Otherwise it is shown fully opaque.
 *  - Up to 4 lower slings are drawn; any further ones are ignored.
 *
 * Draw calls: 3 (spreader, slings, shackles), all built once per config. Per
 * frame only matrices are written, using scratch vectors and quaternions, with
 * no allocations. The spreader casts and receives shadows, the shackles only
 * receive them, and the thin slings do neither.
 */
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { BoxGeometry, CylinderGeometry, Matrix4, MeshStandardMaterial, Quaternion, TorusGeometry, Vector3, type BufferGeometry, type Group, type InstancedMesh, type Mesh } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Vec3 } from '../assets/types'
import type { LiftingRigConfig, LiftingRigPose } from './types'

export interface LiftingRigProps {
  config: LiftingRigConfig
  /** Read every rendered frame: the rig state in WORLD space, from the scene's loading choreography. */
  getPose: () => LiftingRigPose
}

/** Distance (m) from the spreader's top face up to its top padeye holes, and from its bottom face down to its bottom holes. */
export const SPREADER_PADEYE_HOLE_OFFSET = 0.15

/** Lower slings drawn at most (the pose normally carries two). */
const MAX_LOWER_SLINGS = 4
/** Padeye end plate: height beyond each beam face, width along the beam axis, thickness across it; pin-boss radius. */
const PADEYE_HEIGHT = 0.28
const PADEYE_WIDTH = 0.3
const PADEYE_THICKNESS = 0.05
const PADEYE_BOSS_RADIUS = 0.075
/** Bézier control-point displacement per metre of slack: sideways (perpendicular to the spreader axis) and down. */
const SAG_SIDEWAYS = 1.2
const SAG_DOWN = 0.25
const SLACK_EPSILON = 1e-4
const HIDDEN_BELOW = 0.01
const SLING_RADIAL_SEGMENTS = 10
/** Pose values compared each frame: visible, hook xyz, spreader xyz, yaw, sling count, then 7 per sling (top, bottom, slack). */
const SIGNATURE_HEAD = 9
const SIGNATURE_PER_SLING = 7
const SIGNATURE_LENGTH = SIGNATURE_HEAD + MAX_LOWER_SLINGS * SIGNATURE_PER_SLING

const SIDES = [-1, 1] as const

/* Scratch objects reused every frame (no per-frame allocations). */
const UP = new Vector3(0, 1, 0)
const UNIT_SCALE = new Vector3(1, 1, 1)
const _matrix = new Matrix4()
const _quat = new Quaternion()
const _shackleQuat = new Quaternion()
const _scale = new Vector3()
const _dir = new Vector3()
const _mid = new Vector3()
const _axis = new Vector3()
const _perp = new Vector3()
const _hook = new Vector3()
const _centre = new Vector3()
const _top = new Vector3()
const _pin = new Vector3()
const _crown = new Vector3()
const _ctrl = new Vector3()
const _a = new Vector3()
const _b = new Vector3()

function setVec(target: Vector3, v: Vec3): Vector3 {
  return target.set(v[0], v[1], v[2])
}

/** Merges same-material parts into one geometry and disposes the parts. */
function merge(parts: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(parts, false)
  for (const part of parts) part.dispose()
  if (!merged) throw new Error('[LiftingRig] could not merge the rig geometry')
  return merged
}

/** Spreader beam in its own frame: axis along X, depth along Y, width along Z, centred on the origin. */
function buildSpreaderGeometry(spreader: LiftingRigConfig['spreader']): BufferGeometry {
  const { length: L, depth: D, width: W } = spreader
  const parts: BufferGeometry[] = [new BoxGeometry(L, D, W)]
  for (const sx of SIDES) {
    parts.push(new BoxGeometry(0.03, D + 0.04, W + 0.04).translate(sx * (L / 2 + 0.015), 0, 0))
    parts.push(new BoxGeometry(0.05, D + 0.03, W + 0.03).translate(sx * L * 0.25, 0, 0))
    // End padeye plate in the beam's vertical plane, reaching PADEYE_HEIGHT above and below the beam.
    parts.push(new BoxGeometry(PADEYE_WIDTH, D + 2 * PADEYE_HEIGHT, PADEYE_THICKNESS).translate((sx * L) / 2, 0, 0))
    for (const sy of SIDES) {
      parts.push(
        new CylinderGeometry(PADEYE_BOSS_RADIUS, PADEYE_BOSS_RADIUS, PADEYE_THICKNESS + 0.06, 16, 1)
          .rotateX(Math.PI / 2)
          .translate((sx * L) / 2, sy * (D / 2 + SPREADER_PADEYE_HOLE_OFFSET), 0),
      )
    }
  }
  return merge(parts)
}

/**
 * Bow shackle in its own frame: pin centre at the origin, pin along X, bow
 * rising along +Y in the XY plane. Returns the height of the crown (the bow
 * tube's centre line at the top), which is where the sling's eye bears.
 */
function buildShackleGeometry(size: number): { geometry: BufferGeometry; crown: number } {
  const tube = size * 0.09
  const bow = size * 0.24
  const legTop = Math.max(tube, size - bow - tube)
  const parts: BufferGeometry[] = [
    new TorusGeometry(bow, tube, 8, 20, Math.PI).translate(0, legTop, 0),
    new CylinderGeometry(tube * 0.8, tube * 0.8, 2 * bow + 5 * tube, 10, 1).rotateZ(Math.PI / 2),
    new CylinderGeometry(tube * 1.6, tube * 1.6, tube * 0.9, 12, 1).rotateZ(Math.PI / 2).translate(-(bow + tube * 2.3), 0, 0),
    new CylinderGeometry(tube * 1.4, tube * 1.4, tube * 1.1, 6, 1).rotateZ(Math.PI / 2).translate(bow + tube * 2.4, 0, 0),
  ]
  for (const sx of SIDES) {
    parts.push(new CylinderGeometry(tube, tube, legTop, 10, 1, true).translate(sx * bow, legTop / 2, 0))
    parts.push(new CylinderGeometry(tube * 1.45, tube * 1.45, tube * 2.1, 12, 1).rotateZ(Math.PI / 2).translate(sx * bow, 0, 0))
  }
  return { geometry: merge(parts), crown: legTop + bow }
}

function createMaterials(cfg: LiftingRigConfig): { spreader: MeshStandardMaterial; sling: MeshStandardMaterial; shackle: MeshStandardMaterial } {
  return {
    spreader: new MeshStandardMaterial({ color: cfg.spreader.color, roughness: 0.55, metalness: 0.35 }),
    sling: new MeshStandardMaterial({ color: cfg.sling.color, roughness: 0.6, metalness: 0.3 }),
    shackle: new MeshStandardMaterial({ color: cfg.shackle.color, roughness: 0.45, metalness: 0.35 }),
  }
}

/** Writes instance `index` as a cylinder of `diameter` from `a` to `b`, lengthened by `overlap` to close joints on a curve. */
function writeCylinder(mesh: InstancedMesh, index: number, a: Vector3, b: Vector3, diameter: number, overlap: number): void {
  _dir.subVectors(b, a)
  const length = _dir.length()
  if (length < 1e-6) {
    _matrix.makeScale(0, 0, 0).setPosition(a)
  } else {
    _dir.divideScalar(length)
    _quat.setFromUnitVectors(UP, _dir)
    _mid.addVectors(a, b).multiplyScalar(0.5)
    _scale.set(diameter, length + overlap, diameter)
    _matrix.compose(_mid, _quat, _scale)
  }
  mesh.setMatrixAt(index, _matrix)
}

/** Quadratic Bézier point at `t` into `out` (which must not alias the control points). */
function bezier(p0: Vector3, p1: Vector3, p2: Vector3, t: number, out: Vector3): Vector3 {
  const u = 1 - t
  return out
    .copy(p0)
    .multiplyScalar(u * u)
    .addScaledVector(p1, 2 * u * t)
    .addScaledVector(p2, t * t)
}

function writeSignature(pose: LiftingRigPose, out: Float64Array): void {
  out[0] = pose.visibility >= HIDDEN_BELOW ? 1 : 0
  out[1] = pose.hook[0]
  out[2] = pose.hook[1]
  out[3] = pose.hook[2]
  out[4] = pose.spreader[0]
  out[5] = pose.spreader[1]
  out[6] = pose.spreader[2]
  out[7] = pose.spreaderYaw
  const count = Math.min(pose.lowerSlings.length, MAX_LOWER_SLINGS)
  out[8] = count
  for (let k = 0; k < MAX_LOWER_SLINGS; k++) {
    const o = SIGNATURE_HEAD + k * SIGNATURE_PER_SLING
    const sling = k < count ? pose.lowerSlings[k] : undefined
    if (!sling) {
      out.fill(0, o, o + SIGNATURE_PER_SLING)
      continue
    }
    out[o] = sling.top[0]
    out[o + 1] = sling.top[1]
    out[o + 2] = sling.top[2]
    out[o + 3] = sling.bottom[0]
    out[o + 4] = sling.bottom[1]
    out[o + 5] = sling.bottom[2]
    out[o + 6] = sling.slack
  }
}

function sameSignature(a: Float64Array, b: Float64Array): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

/** Places the spreader and writes every sling and shackle instance from the pose. */
function placeRig(
  pose: LiftingRigPose,
  cfg: LiftingRigConfig,
  segments: number,
  crown: number,
  spreader: Mesh,
  slings: InstancedMesh,
  shackles: InstancedMesh,
): void {
  const { length, depth } = cfg.spreader
  const diameter = cfg.sling.diameter
  const yaw = pose.spreaderYaw
  const cos = Math.cos(yaw)
  const sin = Math.sin(yaw)
  _axis.set(cos, 0, -sin)
  _perp.set(sin, 0, cos)
  setVec(_centre, pose.spreader)
  setVec(_hook, pose.hook)
  spreader.position.copy(_centre)
  spreader.rotation.set(0, yaw, 0)

  // Top slings: hook to the top padeye holes at the two ends of the beam.
  let index = 0
  const holeY = depth / 2 + SPREADER_PADEYE_HOLE_OFFSET
  for (let side = -1; side <= 1; side += 2) {
    _a.copy(_centre).addScaledVector(_axis, (side * length) / 2)
    _a.y += holeY
    writeCylinder(slings, index++, _hook, _a, diameter, 0)
  }

  // Lower slings to the shackle crowns, and the shackles (pin on `bottom`, pin axis perpendicular to the spreader axis).
  _shackleQuat.setFromAxisAngle(UP, yaw - Math.PI / 2)
  const count = Math.min(pose.lowerSlings.length, MAX_LOWER_SLINGS)
  for (let k = 0; k < count; k++) {
    const sling = pose.lowerSlings[k]
    if (!sling) break
    setVec(_top, sling.top)
    setVec(_pin, sling.bottom)
    _crown.copy(_pin)
    _crown.y += crown
    if (!(sling.slack > SLACK_EPSILON)) {
      writeCylinder(slings, index++, _top, _crown, diameter, 0)
    } else {
      const side = k % 2 === 0 ? 1 : -1
      _ctrl
        .addVectors(_top, _crown)
        .multiplyScalar(0.5)
        .addScaledVector(_perp, side * sling.slack * SAG_SIDEWAYS)
      _ctrl.y -= sling.slack * SAG_DOWN
      _a.copy(_top)
      for (let j = 1; j <= segments; j++) {
        bezier(_top, _ctrl, _crown, j / segments, _b)
        writeCylinder(slings, index++, _a, _b, diameter, diameter * 0.5)
        _a.copy(_b)
      }
    }
    _matrix.compose(_pin, _shackleQuat, UNIT_SCALE)
    shackles.setMatrixAt(k, _matrix)
  }

  slings.count = index
  shackles.count = count
  slings.instanceMatrix.needsUpdate = true
  shackles.instanceMatrix.needsUpdate = true
  slings.computeBoundingSphere()
  shackles.computeBoundingSphere()
}

export function LiftingRig({ config, getPose }: LiftingRigProps) {
  const groupRef = useRef<Group>(null)
  const spreaderRef = useRef<Mesh>(null)
  const slingsRef = useRef<InstancedMesh>(null)
  const shacklesRef = useRef<InstancedMesh>(null)
  const invalidate = useThree((state) => state.invalidate)

  const segments = Math.max(1, Math.floor(config.sling.segments))
  /** Two top slings plus, per lower sling, one straight piece or `segments` curve pieces. */
  const slingCapacity = 2 + MAX_LOWER_SLINGS * segments

  const spreaderGeometry = useMemo(() => buildSpreaderGeometry(config.spreader), [config])
  const shackle = useMemo(() => buildShackleGeometry(config.shackle.size), [config])
  const slingGeometry = useMemo(() => new CylinderGeometry(0.5, 0.5, 1, SLING_RADIAL_SEGMENTS, 1), [])
  const materials = useMemo(() => createMaterials(config), [config])
  const signature = useMemo(() => ({ last: new Float64Array(SIGNATURE_LENGTH).fill(Number.NaN), next: new Float64Array(SIGNATURE_LENGTH) }), [])

  useEffect(() => () => spreaderGeometry.dispose(), [spreaderGeometry])
  useEffect(() => () => shackle.geometry.dispose(), [shackle])
  useEffect(() => () => slingGeometry.dispose(), [slingGeometry])
  useEffect(
    () => () => {
      materials.spreader.dispose()
      materials.sling.dispose()
      materials.shackle.dispose()
    },
    [materials],
  )

  // New config (geometry, materials, instance capacity): forget the cached pose so the next frame rewrites everything.
  useEffect(() => {
    signature.last.fill(Number.NaN)
    invalidate()
  }, [config, signature, invalidate])

  useFrame(() => {
    const group = groupRef.current
    const spreader = spreaderRef.current
    const slings = slingsRef.current
    const shackles = shacklesRef.current
    if (!group || !spreader || !slings || !shackles) return
    const pose = getPose()
    writeSignature(pose, signature.next)
    if (sameSignature(signature.last, signature.next)) return
    signature.last.set(signature.next)
    const visible = signature.next[0] === 1
    group.visible = visible
    if (visible) placeRig(pose, config, segments, shackle.crown, spreader, slings, shackles)
  })

  return (
    <group ref={groupRef} name="lifting-rig" visible={false}>
      <mesh ref={spreaderRef} name="rig:spreader" geometry={spreaderGeometry} material={materials.spreader} castShadow receiveShadow />
      <instancedMesh key={slingCapacity} ref={slingsRef} name="rig:slings" args={[slingGeometry, materials.sling, slingCapacity]} />
      <instancedMesh ref={shacklesRef} name="rig:shackles" args={[shackle.geometry, materials.shackle, MAX_LOWER_SLINGS]} receiveShadow />
    </group>
  )
}
