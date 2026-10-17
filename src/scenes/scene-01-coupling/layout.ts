/**
 * Resolves the concrete assembly layout (start and connected positions) for
 * Scene 01 from the central configuration and the model manifest.
 *
 * Pure functions — no React, no three.js — so they can be unit-tested and
 * reused by the timeline, the stage and development tooling.
 */
import { MODEL_MANIFEST } from '../../three/assets/modelManifest'
import type { ModelManifestEntry, Vec3 } from '../../three/assets/types'
import { SCENE_01_CONFIG, SCENE_01_PHASE_ORDER, type Scene01Config } from './config'

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
  if (!(dep.crossfadePortion > 0 && dep.crossfadePortion <= 1)) warnings.push('departure.crossfadePortion must be in (0, 1].')
  if (!(dep.cameraSettleStart >= 0 && dep.cameraSettleStart < 1)) warnings.push('departure.cameraSettleStart must be in [0, 1).')
  if (config.camera.sequence.length < 2) warnings.push('camera.sequence must list at least two framings.')

  // 6. Entrances must actually travel in the documented directions.
  if (layout.pullerStart[0] >= layout.pullerFinal[0]) warnings.push('pullerStart must be at −X of the puller final position (it enters from the left).')
  if (layout.trailerStart[0] <= layout.trailerFinal[0]) warnings.push('trailerStart must be at +X of the trailer final position (it enters from the right).')

  return warnings
}
