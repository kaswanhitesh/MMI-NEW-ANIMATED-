/**
 * Resolves the concrete assembly layout (start and connected positions) for
 * Scene 01 from the central configuration and the model manifest.
 *
 * Pure functions — no React, no three.js — so they can be unit-tested and
 * reused by the timeline, the stage and development tooling.
 */
import { MODEL_MANIFEST } from '../../three/assets/modelManifest'
import type { ModelManifestEntry, Vec3 } from '../../three/assets/types'
import { worldToSlot } from '../../three/environment/slotSpace'
import { SCENE_01_CONFIG, SCENE_01_PHASE_ORDER, type Scene01Config } from './config'
import { describeExitRoad } from './departurePath'

export interface AssemblyLayout {
  couplingPoint: Vec3
  /** Opening position (outside the frame at −X). */
  pullerStart: Vec3
  /** Connected position, reached at the end of the approach phase. */
  pullerFinal: Vec3
  /** Opening position (outside the frame at +X). */
  trailerStart: Vec3
  /** Connected position, reached at the end of the approach phase together with the puller. */
  trailerFinal: Vec3
}

type Manifest = Readonly<Record<Scene01Config['models']['puller'] | Scene01Config['models']['trailer'], ModelManifestEntry>>

function scaled(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s]
}

/**
 * Final position = coupling point − (model's coupling anchor × scene scale),
 * with half the connected gap pushed to each side.
 */
export function deriveFinalPosition(
  entry: ModelManifestEntry,
  couplingPoint: Vec3,
  sceneScale: number,
  groundY: number,
  gapSign: -1 | 1,
  connectedGap: number,
): Vec3 {
  const anchor = scaled(entry.anchors.coupling, sceneScale)
  return [couplingPoint[0] - anchor[0] + (gapSign * connectedGap) / 2, groundY, couplingPoint[2] - anchor[2]]
}

export function resolveAssemblyLayout(config: Scene01Config = SCENE_01_CONFIG, manifest: Manifest = MODEL_MANIFEST): AssemblyLayout {
  const { assembly, positions, models, world } = config
  const puller = manifest[models.puller]
  const trailer = manifest[models.trailer]

  const pullerFinal =
    positions.pullerFinal ?? deriveFinalPosition(puller, assembly.couplingPoint, models.scale, world.groundY, -1, assembly.connectedGap)
  const trailerFinal =
    positions.trailerFinal ?? deriveFinalPosition(trailer, assembly.couplingPoint, models.scale, world.groundY, 1, assembly.connectedGap)

  return {
    couplingPoint: assembly.couplingPoint,
    pullerStart: [positions.pullerStart[0], world.groundY, positions.pullerStart[2]],
    pullerFinal,
    trailerStart: [positions.trailerStart[0], world.groundY, positions.trailerStart[2]],
    trailerFinal,
  }
}

/**
 * Returns human-readable warnings about inconsistent configuration. Empty array = consistent.
 * Called once in development by the scene section; never throws.
 */
export function validateScene01Config(config: Scene01Config = SCENE_01_CONFIG, manifest: Manifest = MODEL_MANIFEST): string[] {
  const warnings: string[] = []
  const layout = resolveAssemblyLayout(config, manifest)
  const puller = manifest[config.models.puller]
  const trailer = manifest[config.models.trailer]
  const s = config.models.scale

  // 1. Anchors must meet at the coupling point (longitudinally and laterally).
  const pullerAnchorWorld = layout.pullerFinal[0] + puller.anchors.coupling[0] * s
  const trailerAnchorWorld = layout.trailerFinal[0] + trailer.anchors.coupling[0] * s
  const gap = trailerAnchorWorld - pullerAnchorWorld
  if (Math.abs(gap - config.assembly.connectedGap) > 1e-6) {
    warnings.push(
      `Coupling anchors do not meet: longitudinal gap is ${gap.toFixed(3)} m but assembly.connectedGap is ${config.assembly.connectedGap} m. ` +
        'Check positions.pullerFinal / positions.trailerFinal overrides or the manifest anchors.',
    )
  }
  const lateral = layout.trailerFinal[2] + trailer.anchors.coupling[2] * s - (layout.pullerFinal[2] + puller.anchors.coupling[2] * s)
  if (Math.abs(lateral) > 1e-6) warnings.push(`Coupling anchors are laterally offset by ${lateral.toFixed(3)} m (Z).`)

  // 2. Anchor heights should roughly agree, otherwise the models' normalisation is probably wrong.
  const dy = Math.abs(puller.anchors.coupling[1] - trailer.anchors.coupling[1]) * s
  if (dy > config.assembly.anchorHeightTolerance) {
    warnings.push(`Coupling anchor heights differ by ${dy.toFixed(2)} m (tolerance ${config.assembly.anchorHeightTolerance} m).`)
  }

  // 3. Phases must be contiguous, ascending and span [0, 1].
  let cursor = 0
  for (const name of SCENE_01_PHASE_ORDER) {
    const w = config.phases[name]
    if (Math.abs(w.start - cursor) > 1e-9) warnings.push(`Phase "${name}" starts at ${w.start} but the previous phase ended at ${cursor}.`)
    if (w.end <= w.start) warnings.push(`Phase "${name}" must end after it starts.`)
    cursor = w.end
  }
  if (Math.abs(cursor - 1) > 1e-9) warnings.push(`Phases must end at 1 (last phase ends at ${cursor}).`)

  // 4. The garage fade must start inside the approach phase.
  const fadePortion = config.environment.garage.fadeStartPortion
  if (!(fadePortion >= 0 && fadePortion < 1)) warnings.push(`environment.garage.fadeStartPortion must be in [0, 1) (got ${fadePortion}).`)

  // 5. Departure geometry and timing must be sane.
  const dep = config.departure
  if (!(dep.straightOut >= 0 && dep.turnRadius > 0 && dep.straightIn >= 0)) warnings.push('departure distances must be ≥ 0 and the turn radius > 0.')
  if (!(dep.trailerTrackingLength > 0)) warnings.push('departure.trailerTrackingLength must be > 0.')
  if (!(dep.revealStart >= 0 && dep.revealStart < 1)) warnings.push('departure.revealStart must be in [0, 1).')
  if (!(dep.cameraSettleStart >= 0 && dep.cameraSettleStart < 1)) warnings.push('departure.cameraSettleStart must be in [0, 1).')
  if (config.camera.sequence.length < 2) warnings.push('camera.sequence must list at least two framings.')
  const j = config.journey
  if (!(j.travel >= 0)) warnings.push('journey.travel must be ≥ 0.')
  if (!(j.cameraPortion > 0 && j.cameraPortion <= 1)) warnings.push('journey.cameraPortion must be in (0, 1].')
  if (config.camera.sequence.indexOf('highway') < 0 || config.camera.sequence.indexOf('city') !== config.camera.sequence.indexOf('highway') + 1) warnings.push("camera.sequence must contain 'highway' followed by 'city' (the timeline tweens the stage 3 → 4).")
  // Level side views: a framing with a sideways direction component tilts every line along the travel axis.
  for (const name of config.camera.sequence) {
    if (Math.abs(config.camera.framings[name].direction[0]) > 1e-9) warnings.push(`camera.framings.${name}.direction[0] should be 0 for a level side view (lines along X would slant).`)
  }
  const skyRadius = config.environment.atmosphere.sky.radius
  if (config.camera.far <= skyRadius) warnings.push(`camera.far (${config.camera.far}) must exceed the sky radius (${skyRadius}).`)

  // 5b. Environment slots and the garage stand-in must be self-consistent.
  const env = config.environment
  for (const [name, slot] of [['garage', env.garage.slot], ['road', env.road.slot], ['highway', env.highway.slot], ['city', env.city.slot]] as const) {
    if (slot.bounds.min.some((v, i) => !(v < slot.bounds.max[i]))) warnings.push(`environment.${name}.slot.bounds: every min must be below its max.`)
  }
  const g = env.garage
  const bayEnd = g.bays.start + g.bays.count * g.bays.pitch
  if (!(g.building.left < g.bays.start && bayEnd <= g.building.right)) warnings.push('environment.garage: the bays must lie between building.left and building.right, with the branding wall to their left.')
  const sign = g.sign
  if (sign.enabled) {
    const half = sign.width / 2
    const bayColumnEdge = g.bays.start - g.columns.size / 2
    if (sign.centre[0] - half < g.building.left + 0.5 || sign.centre[0] + half > bayColumnEdge - 0.5) {
      warnings.push('environment.garage.sign must sit on the branding wall, clear of the building corner and the first bay column.')
    }
    if (sign.centre[1] - sign.height / 2 < 1.5 || sign.centre[1] + sign.height / 2 > g.building.eavesHeight - 1.2) {
      warnings.push('environment.garage.sign must sit between the plinth and the fascia band.')
    }
    if (sign.text.trim().length === 0) warnings.push('environment.garage.sign.text is empty.')
  }
  // The coupling must happen on the apron, and the exit road must actually connect the apron to the highway.
  if (g.enabled) {
    for (const [label, p] of [['pullerStart', layout.pullerStart], ['trailerStart', layout.trailerStart], ['pullerFinal', layout.pullerFinal], ['trailerFinal', layout.trailerFinal]] as const) {
      const [lx, lz] = worldToSlot(g.slot, [p[0], p[2]])
      if (lx < g.apron.left || lx > g.apron.right || lz < 0 || lz > g.apron.front) warnings.push(`${label} is not on the garage apron (garage-local x ${lx.toFixed(1)}, z ${lz.toFixed(1)}).`)
    }
  }
  if (env.road.enabled) {
    const hw = env.highway
    const exit = describeExitRoad(layout.pullerFinal, dep, env.road.width, env.road.overlap, { slot: g.slot, apronFront: g.apron.front, kerbWidth: g.apron.kerb.width }, { slot: hw.slot, carriagewayHalfWidth: (hw.lanes * hw.laneWidth) / 2 })
    if (exit.outline.length < 3 || !exit.kerbGap || !exit.junction) warnings.push('environment.road: the exit road does not connect the apron kerb to the highway — check the slots and departure geometry.')
  }

  // 6. Entrances must actually travel in the documented directions.
  if (layout.pullerStart[0] >= layout.pullerFinal[0]) warnings.push('pullerStart must be at −X of the puller final position (it enters from the left).')
  if (layout.trailerStart[0] <= layout.trailerFinal[0]) warnings.push('trailerStart must be at +X of the trailer final position (it enters from the right).')

  return warnings
}
