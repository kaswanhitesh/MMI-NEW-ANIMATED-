/**
 * HEAVY-LIFT LOADING choreography of Scene 01's closing sequence. Pure — no
 * React, no three.js. From the rig's loading stages (each 0 → 1, tweened by
 * the timeline in its own phase) it derives, every frame:
 *   - the CARGO pose: where the vessel's local frame sits in the world;
 *   - the overhead CRANE pose (crane-local bridge, trolley and hook);
 *   - the LIFTING RIG pose (hook, spreader beam and lower slings, world).
 *
 * The cargo is not parented to the trailer or to the crane. Its pose comes
 * from three configured places (resting on its ground saddles, lifted, set on
 * the parked trailer's deck), and the rigging is solved to hang from the
 * vessel's lug pins whenever it is attached. Everything is a function of the
 * stage scalars, so scrolling back replays the operation in reverse.
 *
 * Sequence (phase → stage scalar):
 *   craneApproach → approach   bridge and trolley travel from where the crane
 *                              stands to above the vessel; the hook lowers so
 *                              the shackles stop `approachClearance` above the lugs
 *   rigging       → attach     shackles lowered onto the lug pins (pinned at
 *                              `attachContact`), then on by `slack` (slings sag)
 *                 → tension    slack taken up, slings taut
 *   lift          → lift       vessel raised clear of every saddle horn
 *   transfer      → transfer   trolley carries it sideways over the deck
 *   lowering      → lower      vessel set down on the trailer saddles
 *   release       → release    slings slackened, shackles unpinned at
 *                              `releaseDetach`, hook raised (the shackles stay
 *                              on the lugs until their slings straighten, then
 *                              lift off), crane travels clear
 */
import type { Vec3 } from '../../three/assets/types'
import type { EnvironmentSlotConfig } from '../../three/environment/types'
import type { CranePose, LiftingRigConfig, PressureVesselConfig, SlingPose, VesselSaddleConfig } from '../../three/industrial/types'
import { SPREADER_PADEYE_HOLE_OFFSET } from '../../three/industrial/LiftingRig'
import { lugPinPoints } from '../../three/industrial/vesselGeometry'
import type { Scene01Config } from './config'
import type { LoadingProgress, VehiclePose } from './rig'

type MutableVec3 = [number, number, number]

/** The vessel's local frame in the world: origin under the shell middle at the vessel's LOWEST point, yaw about Y. */
export interface CargoPose {
  x: number
  /** World Y of the vessel's lowest point. */
  y: number
  z: number
  yaw: number
}

interface MutableSlingPose extends SlingPose {
  top: MutableVec3
  bottom: MutableVec3
}

export interface LoadingPose {
  cargo: CargoPose
  crane: CranePose
  rig: {
    hook: MutableVec3
    spreader: MutableVec3
    spreaderYaw: number
    lowerSlings: MutableSlingPose[]
    visibility: number
  }
}

/** Where the vessel rests, where it is carried at, and where it is set down — derived once from the config. */
export interface LoadingGeometry {
  yaw: number
  /** Vessel origin on its ground saddles (y = its lowest point). */
  rest: Vec3
  /** Vessel origin on the trailer saddles. */
  deck: Vec3
  /** Height of the vessel's lowest point while it is carried. */
  liftBottom: number
  /** Lug pin centres in the vessel frame. */
  pins: readonly Vec3[]
  /** Ground saddle centres (world) — they stand under the wear pads at the rest place. */
  groundSaddles: readonly Vec3[]
  /** Trailer saddle bases in the TRAILER's local frame (on the deck top; the trailer stands on the ground). */
  trailerSaddles: readonly Vec3[]
  /** Highest point of a saddle cradle above its base: the horn tips the vessel must clear when it is carried sideways. */
  hornHeight: { ground: number; trailer: number }
}

/**
 * Height of a saddle's horn tips above its base: the cradle is an arc of radius
 * D/2 (+12 mm pad) around the vessel's lowest point, spanning `wrapAngle`.
 */
export function saddleHornHeight(cfg: VesselSaddleConfig): number {
  const r = cfg.vesselDiameter / 2 + 0.012
  return cfg.height + r * (1 - Math.cos(cfg.wrapAngle / 2))
}

export interface LoadingInputs {
  loading: Scene01Config['loading']
  vessel: PressureVesselConfig
  supports: Scene01Config['industry']['supports']
  /** The parked trailer (end of the parking reverse). */
  trailer: Pick<VehiclePose, 'x' | 'z' | 'yaw'>
  /** World Y of the trailer's deck top. */
  deckTop: number
  groundY: number
}

export function resolveLoadingGeometry({ loading, vessel, supports, trailer, deckTop, groundY }: LoadingInputs): LoadingGeometry {
  const { cargo } = loading
  const psi = trailer.yaw
  // Trailer-local +X (towards its tail) is world (cos ψ, −sin ψ); its left is (sin ψ, cos ψ).
  const ax = Math.cos(psi)
  const az = -Math.sin(psi)
  const lx = Math.sin(psi)
  const lz = Math.cos(psi)
  const deckX = trailer.x + cargo.deckOffset * ax
  const deckZ = trailer.z + cargo.deckOffset * az
  const restX = deckX + cargo.restLateral * lx
  const restZ = deckZ + cargo.restLateral * lz
  const restBottom = groundY + supports.ground.height
  const deckBottom = deckTop + supports.trailer.height
  const hornGround = groundY + saddleHornHeight(supports.ground)
  const hornTrailer = deckTop + saddleHornHeight(supports.trailer)
  return {
    yaw: psi,
    rest: [restX, restBottom, restZ],
    deck: [deckX, deckBottom, deckZ],
    liftBottom: Math.max(restBottom, deckBottom, hornGround, hornTrailer) + cargo.liftClearance,
    pins: lugPinPoints(vessel),
    groundSaddles: supports.offsets.map((o): Vec3 => [restX + o * ax, groundY, restZ + o * az]),
    trailerSaddles: supports.offsets.map((o): Vec3 => [cargo.deckOffset + o, deckTop - groundY, 0]),
    hornHeight: { ground: hornGround, trailer: hornTrailer },
  }
}

export function createLoadingPose(): LoadingPose {
  const sling = (): MutableSlingPose => ({ top: [0, 0, 0], bottom: [0, 0, 0], slack: 0, attached: false })
  return {
    cargo: { x: 0, y: 0, z: 0, yaw: 0 },
    crane: { bridgeZ: 0, trolleyX: 0, hookY: 0 },
    rig: { hook: [0, 0, 0], spreader: [0, 0, 0], spreaderYaw: 0, lowerSlings: [sling(), sling()], visibility: 1 },
  }
}

const clamp01 = (v: number) => (v <= 0 ? 0 : v >= 1 ? 1 : v)
/** 0 → 1 across [a, b] of `v`, eased in and out (zero velocity at both ends, so sub-steps join smoothly). */
const window01 = (v: number, a: number, b: number) => {
  const t = clamp01((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/**
 * Writes the pose of the cargo, crane and rigging for the stage values into `out`.
 * `craneSlot` places the crane's local frame (its bridge pose is crane-local).
 */
export function resolveLoadingPose(
  stages: LoadingProgress,
  geometry: LoadingGeometry,
  config: Scene01Config['loading'],
  rigConfig: LiftingRigConfig,
  craneSlot: Pick<EnvironmentSlotConfig, 'position' | 'rotationY'>,
  out: LoadingPose,
): void {
  const { crane, rigging, timing } = config
  const { rest, deck, liftBottom, pins, yaw } = geometry

  // 1. Cargo: lifted, carried sideways, lowered. Later stages override earlier ones (they run in sequence).
  let bottom = rest[1]
  let cx = rest[0]
  let cz = rest[2]
  if (stages.lift > 0) bottom = lerp(rest[1], liftBottom, stages.lift)
  if (stages.transfer > 0) {
    cx = lerp(rest[0], deck[0], stages.transfer)
    cz = lerp(rest[2], deck[2], stages.transfer)
  }
  if (stages.lower > 0) bottom = lerp(liftBottom, deck[1], stages.lower)
  const cargo = out.cargo
  cargo.x = cx
  cargo.y = bottom
  cargo.z = cz
  cargo.yaw = yaw

  // Lug pins in the world (rotation about Y by yaw: local (x, z) → (x cos + z sin, −x sin + z cos)).
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  const pinY = bottom + (pins[0]?.[1] ?? 0)
  const pinMidX = cx + averageLocal(pins, 0) * c + averageLocal(pins, 2) * s
  const pinMidZ = cz - averageLocal(pins, 0) * s + averageLocal(pins, 2) * c

  // 2. Spreader height relative to the TAUT position (slings straight, shackles on the pins). The lower slings hang
  // from the bottom padeye holes, `holeDrop` below the beam's centre.
  const holeDrop = rigConfig.spreader.depth / 2 + SPREADER_PADEYE_HOLE_OFFSET
  const tautSpreaderY = pinY + rigging.slingLength + holeDrop
  const approachSpreaderY = tautSpreaderY + crane.approachClearance
  const parkSpreaderY = crane.parkHookY - rigging.topSlingRise
  // Before the lift the vessel is on its ground saddles, so the approach height is fixed to the rest place.
  const restPinY = rest[1] + (pins[0]?.[1] ?? 0)
  const restApproachSpreaderY = restPinY + rigging.slingLength + holeDrop + crane.approachClearance

  let hookX: number
  let hookZ: number
  let spreaderY: number
  // Shackles: pinned to the lugs, resting on them (slings may sag), or hanging free.
  let pinned = false
  let resting = false

  if (stages.approach < 1) {
    // Travel from where the crane stands to above the vessel, then lower towards it.
    const travel = window01(stages.approach, 0, timing.approachTravelEnd)
    const lower = window01(stages.approach, timing.approachLowerStart, 1)
    hookX = lerp(crane.parkTrolleyX, pinMidX, travel)
    hookZ = lerp(crane.parkZ, pinMidZ, travel)
    spreaderY = lerp(parkSpreaderY, restApproachSpreaderY, lower)
  } else if (stages.tension < 1 && stages.lift <= 0) {
    hookX = pinMidX
    hookZ = pinMidZ
    // Lower onto the pins (contact at attachContact), on into slack, then take the slack up again.
    const down = window01(stages.attach, 0, timing.attachContact)
    const sag = window01(stages.attach, timing.attachContact, 1) * (1 - window01(stages.tension, 0, 1))
    spreaderY = lerp(approachSpreaderY, tautSpreaderY, down) - rigging.slack * sag
    pinned = stages.attach >= timing.attachContact
    resting = true
  } else if (stages.release <= 0) {
    // Lift, transfer, lower: the rig hangs taut from the vessel.
    hookX = pinMidX
    hookZ = pinMidZ
    spreaderY = tautSpreaderY
    pinned = true
    resting = true
  } else {
    // Release: slacken, unpin, raise until the shackles lift off, then travel clear.
    const sag = window01(stages.release, 0, timing.releaseDetach)
    const rise = window01(stages.release, timing.releaseRiseStart, timing.releaseTravelStart)
    const away = window01(stages.release, timing.releaseTravelStart, 1)
    hookX = pinMidX
    hookZ = lerp(pinMidZ, crane.clearZ, away)
    // Raised at least as high as it stood (relative to the lugs) before it was lowered on, so the shackles travel clear.
    const clearSpreaderY = Math.max(parkSpreaderY, tautSpreaderY + crane.approachClearance)
    spreaderY = lerp(tautSpreaderY - rigging.slack * sag, clearSpreaderY, rise)
    pinned = stages.release < timing.releaseDetach
    resting = away <= 0
  }

  const rig = out.rig
  rig.spreader[0] = hookX
  rig.spreader[1] = spreaderY
  rig.spreader[2] = hookZ
  rig.spreaderYaw = yaw
  rig.hook[0] = hookX
  rig.hook[1] = spreaderY + rigging.topSlingRise
  rig.hook[2] = hookZ
  rig.visibility = 1

  // Lower slings: from the bottom padeye hole above each lug down to its shackle.
  const slingTopY = spreaderY - holeDrop
  for (let i = 0; i < rig.lowerSlings.length; i++) {
    const sling = rig.lowerSlings[i]
    const pin = pins[i] ?? pins[0] ?? ([0, 0, 0] as Vec3)
    const along = pin[0] - averageLocal(pins, 0)
    // Beam axis (cos yaw, 0, −sin yaw): the sling hangs from the point above its lug.
    sling.top[0] = hookX + along * c
    sling.top[1] = slingTopY
    sling.top[2] = hookZ - along * s
    const freeY = slingTopY - rigging.slingLength
    sling.bottom[0] = sling.top[0]
    sling.bottom[2] = sling.top[2]
    if (resting && freeY < pinY) {
      // The shackle sits on its lug: the sling cannot hang lower, so it sags by the difference.
      sling.bottom[1] = pinY
      sling.slack = pinY - freeY
    } else {
      sling.bottom[1] = freeY
      sling.slack = 0
    }
    sling.attached = pinned
  }

  // 3. Crane: hook position in the crane slot's local frame.
  const dx = hookX - craneSlot.position[0]
  const dz = hookZ - craneSlot.position[2]
  const rc = Math.cos(craneSlot.rotationY)
  const rs = Math.sin(craneSlot.rotationY)
  out.crane.trolleyX = dx * rc - dz * rs
  out.crane.bridgeZ = dx * rs + dz * rc
  out.crane.hookY = rig.hook[1] - craneSlot.position[1]
}

function averageLocal(points: readonly Vec3[], axis: 0 | 2): number {
  if (points.length === 0) return 0
  let sum = 0
  for (const p of points) sum += p[axis]
  return sum / points.length
}
