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
import { createDeparturePath, createJourneyGeometry, describeExitRoad, placeOnPath, type JourneyGeometry, type TrailerTracking } from './departurePath'
import { SPREADER_PADEYE_HOLE_OFFSET } from '../../three/industrial/LiftingRig'
import { resolveLoadingGeometry, saddleHornHeight, type LoadingGeometry } from './loading'
import { createPose, type CouplingPose } from './rig'

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

/** Trailer tracking distances for the path resolver (see departurePath.ts), measured from the resolved rest layout. */
export function resolveTrailerTracking(layout: AssemblyLayout, config: Scene01Config = SCENE_01_CONFIG, manifest: Manifest = MODEL_MANIFEST): TrailerTracking {
  const hitchOffset = manifest[config.models.puller].anchors.coupling[0] * config.models.scale
  return {
    hitchOffset,
    // From the rest layout rather than the anchors alone, so the first frame of the departure reproduces the coupled
    // rest pose exactly, whatever `assembly.connectedGap` or a final-position override says.
    kingpinOffset: layout.trailerFinal[0] - layout.pullerFinal[0] - hitchOffset,
    trackingLength: config.departure.trailerTrackingLength,
  }
}

/** Everything the factory sequence derives from the config: both paths, the parked combination and the loading geometry. */
export interface FactoryLayout {
  journey: JourneyGeometry
  tracking: TrailerTracking
  /** The combination at the end of the reverse (heights at ground level). */
  parked: CouplingPose
  loading: LoadingGeometry
}

export function resolveFactoryLayout(layout: AssemblyLayout, config: Scene01Config = SCENE_01_CONFIG, manifest: Manifest = MODEL_MANIFEST): FactoryLayout {
  const journey = createJourneyGeometry(layout.pullerFinal, config)
  const tracking = resolveTrailerTracking(layout, config, manifest)
  const parked = createPose(layout)
  parked.puller.y = config.world.groundY
  parked.trailer.y = config.world.groundY
  placeOnPath(journey.parking, 0, tracking, parked)
  const groundY = config.world.groundY
  const loading = resolveLoadingGeometry({
    loading: config.loading,
    vessel: config.industry.cargo.vessel,
    supports: config.industry.supports,
    trailer: parked.trailer,
    deckTop: groundY + config.loading.cargo.trailerDeckTop * config.models.scale,
    groundY,
  })
  return { journey, tracking, parked, loading }
}

/** Framings that are level SIDE views (the camera looks straight across the travel axis). */
const SIDE_VIEW_FRAMINGS = ['base', 'heroHold', 'wide', 'highway', 'city', 'entry'] as const

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
  // The timeline walks the stage through these framings in this order (it looks each one up by name).
  const order = ['base', 'heroHold', 'wide', 'highway', 'city', 'entry', 'doorway', 'loading', 'lift'] as const
  const indices = order.map((name) => config.camera.sequence.indexOf(name))
  if (indices.some((i, k) => i < 0 || (k > 0 && i !== indices[k - 1] + 1))) warnings.push(`camera.sequence must list ${order.join(', ')} consecutively in that order.`)
  // Level side views: a framing with a sideways direction component tilts every line along the travel axis. (The
  // doorway and loading framings are deliberate three-quarter views inside the factory; the camera still has no roll.)
  for (const name of SIDE_VIEW_FRAMINGS) {
    const framing = config.camera.framings[name]
    if (Math.abs(framing.direction[0]) > 1e-9 || Math.abs(framing.portrait?.direction?.[0] ?? 0) > 1e-9) {
      warnings.push(`camera.framings.${name}.direction[0] should be 0 for a level side view (lines along X would slant).`)
    }
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
  // The departure must end in the highway's far lane, heading along the road (the highway slot can be moved).
  if (env.highway.enabled) {
    const hw = env.highway
    const path = createDeparturePath(layout.pullerFinal, dep)
    const end = { x: 0, z: 0, yaw: 0 }
    path.at(path.totalLength, end)
    const [, lz] = worldToSlot(hw.slot, [end.x, end.z])
    const heading = Math.atan2(Math.sin(end.yaw - (Math.PI - hw.slot.rotationY)), Math.cos(end.yaw - (Math.PI - hw.slot.rotationY)))
    if (!(lz < 0 && lz > -hw.laneWidth) || Math.abs(heading) > 1e-3) {
      warnings.push(`The departure ends at highway-local z ${lz.toFixed(2)} (far lane is ${(-hw.laneWidth).toFixed(2)}…0) — move environment.highway.slot or adjust the departure.`)
    }
  }
  if (env.road.enabled) {
    const hw = env.highway
    const exit = describeExitRoad(layout.pullerFinal, dep, env.road.width, env.road.overlap, { slot: g.slot, apronFront: g.apron.front, kerbWidth: g.apron.kerb.width }, { slot: hw.slot, carriagewayHalfWidth: (hw.lanes * hw.laneWidth) / 2 })
    if (exit.outline.length < 3 || !exit.kerbGap || !exit.junction) warnings.push('environment.road: the exit road does not connect the apron kerb to the highway — check the slots and departure geometry.')
  }

  // 5c. The factory sequence: the reverse must start where the industrial travel ends, on the highway's far lane, with
  // the trailer straight behind the puller; the parked combination must stand inside bay A; the loading geometry
  // must fit the vessel, the saddles and the rigging.
  warnings.push(...validateFactorySequence(layout, config, manifest))

  // 6. Entrances must actually travel in the documented directions.
  if (layout.pullerStart[0] >= layout.pullerFinal[0]) warnings.push('pullerStart must be at −X of the puller final position (it enters from the left).')
  if (layout.trailerStart[0] <= layout.trailerFinal[0]) warnings.push('trailerStart must be at +X of the trailer final position (it enters from the right).')

  return warnings
}

function validateFactorySequence(layout: AssemblyLayout, config: Scene01Config, manifest: Manifest): string[] {
  const warnings: string[] = []
  const f = resolveFactoryLayout(layout, config, manifest)
  const { journey, tracking, parked, loading } = f
  const pk = config.parking
  if (!(pk.bayStraight > 0 && pk.turnRadius > 0)) warnings.push('parking.bayStraight and parking.turnRadius must be > 0.')
  if (pk.roadStraight < tracking.hitchOffset + tracking.trackingLength) {
    warnings.push(`parking.roadStraight (${pk.roadStraight} m) must be ≥ the fifth-wheel offset + trailer tracking length (${(tracking.hitchOffset + tracking.trackingLength).toFixed(2)} m) so the trailer is straight when the reverse begins.`)
  }
  if (Math.abs(journey.stop.z - journey.cityEnd.z) > 1e-6 || Math.abs(Math.cos(journey.stop.yaw - journey.cityEnd.yaw) - 1) > 1e-9) {
    warnings.push(`The parking path's far end (z ${journey.stop.z.toFixed(2)}) must lie on the highway lane the journey drives along (z ${journey.cityEnd.z.toFixed(2)}), heading the same way — adjust parking.pullerPosition or turnRadius.`)
  }
  if (!(journey.industrialTravel > 0)) warnings.push(`The factory stop lies behind the end of the city journey (industrial travel ${journey.industrialTravel.toFixed(1)} m) — move the factory further along the highway or shorten journey.travel.`)
  const { doorwayCameraStart: d, interiorCameraStart: i } = pk
  if (!(d >= 0 && d < i && i < 1)) warnings.push('parking camera fractions must satisfy 0 ≤ doorwayCameraStart < interiorCameraStart < 1.')
  const il = pk.interiorLight
  if (!(il.from >= 0 && il.from < il.to && il.to <= 1 && il.keyScale >= 0 && il.keyScale <= 1)) warnings.push('parking.interiorLight must satisfy 0 ≤ from < to ≤ 1 and keyScale in [0, 1].')
  if (!(config.journey.entryCameraStart >= 0 && config.journey.entryCameraStart < 1)) warnings.push('journey.entryCameraStart must be in [0, 1).')

  // The parked puller and trailer stand inside the factory's vehicle bay, clear of its walls.
  const fac = config.industry.factory
  if (fac.enabled) {
    const bay = fac.building.bays.find((b) => b.door.x1 - b.door.x0 > 0 && b.hasCrane && worldToSlot(fac.slot, [parked.puller.x, parked.puller.z])[0] > b.x0 && worldToSlot(fac.slot, [parked.puller.x, parked.puller.z])[0] < b.x1)
    if (!bay) warnings.push('The parked puller does not stand inside a crane bay of the factory.')
    for (const [label, v] of [['puller', parked.puller], ['trailer', parked.trailer]] as const) {
      const [lx, lz] = worldToSlot(fac.slot, [v.x, v.z])
      if (lz > -2 || lz < -fac.building.length + 2) warnings.push(`The parked ${label} is not inside the factory (factory-local z ${lz.toFixed(1)}).`)
      if (bay && (lx < bay.x0 + 3 || lx > bay.x1 - 3)) warnings.push(`The parked ${label} stands within 3 m of bay ${bay.name}'s column line (factory-local x ${lx.toFixed(1)}).`)
    }
    // The vessel's resting place too.
    const [rx] = worldToSlot(fac.slot, [loading.rest[0], loading.rest[2]])
    if (bay && (rx < bay.x0 + 3 || rx > bay.x1 - 3)) warnings.push(`The vessel's resting place is within 3 m of bay ${bay.name}'s column line (factory-local x ${rx.toFixed(1)}).`)
  }

  // Loading geometry.
  const vessel = config.industry.cargo.vessel
  const sup = config.industry.supports
  const ld = config.loading
  if (vessel.stage !== 'complete' || vessel.lugs.x.length !== 2) warnings.push('industry.cargo.vessel must be complete with exactly two lifting lugs (the rig has two lower slings).')
  const lugSpan = vessel.lugs.x.length === 2 ? Math.abs(vessel.lugs.x[1] - vessel.lugs.x[0]) : 0
  const spreader = config.industry.crane.rig.spreader.length
  if (Math.abs(spreader - lugSpan) > 0.05) warnings.push(`The spreader beam (${spreader} m) should match the lug spacing (${lugSpan} m) so the lower slings hang vertically.`)
  for (const cfg of [sup.ground, sup.trailer]) {
    if (Math.abs(cfg.vesselDiameter - vessel.diameter) > 1e-6) warnings.push('industry.supports: saddle vesselDiameter must equal the cargo vessel diameter.')
  }
  const deckStart = -manifest[config.models.trailer].footprint.length / 2
  const deckEnd = manifest[config.models.trailer].footprint.length / 2
  for (const t of loading.trailerSaddles) {
    if (t[0] - sup.trailer.thickness / 2 < deckStart || t[0] + sup.trailer.thickness / 2 > deckEnd) warnings.push(`A trailer saddle (trailer-local x ${t[0].toFixed(2)}) is off the trailer.`)
  }
  for (const o of sup.offsets) {
    if (!vessel.wearPads.some((w) => Math.abs(w - o) < 1e-6)) warnings.push(`Saddle offset ${o} has no matching wear pad on the vessel.`)
  }
  if (!(loading.liftBottom > Math.max(saddleHornHeight(sup.ground) + config.world.groundY, loading.hornHeight.trailer))) warnings.push('The lift height does not clear the saddle horns.')
  const t = ld.timing
  if (!(t.riggingAttachPortion > 0 && t.riggingAttachPortion < 1)) warnings.push('loading.timing.riggingAttachPortion must be in (0, 1).')
  if (!(t.approachLowerStart >= 0 && t.approachLowerStart < 1 && t.approachTravelEnd > 0 && t.approachTravelEnd <= 1)) warnings.push('loading.timing approach fractions must be in [0, 1].')
  if (!(t.attachContact > 0 && t.attachContact < 1)) warnings.push('loading.timing.attachContact must be in (0, 1).')
  if (!(t.releaseDetach > 0 && t.releaseDetach < t.releaseRiseStart && t.releaseRiseStart < t.releaseTravelStart && t.releaseTravelStart < 1)) {
    warnings.push('loading.timing must satisfy 0 < releaseDetach < releaseRiseStart < releaseTravelStart < 1.')
  }
  if (!(ld.rigging.slingLength > 0 && ld.rigging.topSlingRise > 0 && ld.rigging.slack >= 0)) warnings.push('loading.rigging lengths must be positive.')
  // The hook never has to rise above what the crane allows: parked, carrying the vessel, or clearing it after release.
  const pinY = loading.pins[0]?.[1] ?? 0
  const holeDrop = config.industry.crane.rig.spreader.depth / 2 + SPREADER_PADEYE_HOLE_OFFSET
  const hookOver = (bottom: number, extra: number) => bottom + pinY + ld.rigging.slingLength + holeDrop + extra + ld.rigging.topSlingRise
  const highest = Math.max(ld.crane.parkHookY, hookOver(loading.liftBottom, 0), hookOver(loading.rest[1], ld.crane.approachClearance), hookOver(loading.deck[1], ld.crane.approachClearance))
  if (highest > ld.crane.maxHookY + 1e-9) warnings.push(`The loading needs the hook at ${highest.toFixed(2)} m but loading.crane.maxHookY is ${ld.crane.maxHookY} m — shorten the slings or lower the lift.`)
  return warnings
}
