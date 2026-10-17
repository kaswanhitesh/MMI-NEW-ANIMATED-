/**
 * Scene 01's R3F stage: background, fog, daylight sky, procedural environment
 * lighting, stage lights, yard floor, the four replaceable ENVIRONMENT SLOTS —
 * garage (with its wall sign), exit road, highway, city — the responsive
 * camera rig and the two vehicles. Rendered INSIDE a `SceneCanvas` — it owns
 * no canvas of its own. Every number comes from `SCENE_01_CONFIG` (or the
 * `config` prop) and the resolved `AssemblyLayout`; the vehicles read the
 * per-frame `CouplingPose`, which `PoseResolver` derives from the mutable
 * `CouplingRig` the scroll timeline tweens (approach positions, departure
 * distance, city travel, camera stage, garage fade-in, daylight).
 *
 * The environments are fixed in the world. Forward travel is the vehicle
 * actually driving and the camera following it, so the garage recedes behind
 * the combination with correct perspective and parallax instead of sliding.
 */
import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Color, type Fog } from 'three'
import { getModelEntry } from '../../../three/assets'
import type { Vec3 } from '../../../three/assets/types'
import type { FramedCameraSpec } from '../../../three/camera/types'
import { useFramedCamera } from '../../../three/camera/useFramedCamera'
import { AccessRoad } from '../../../three/environment/AccessRoad'
import { BrandSign } from '../../../three/environment/BrandSign'
import { CityBackdrop } from '../../../three/environment/CityBackdrop'
import { DaylightSky } from '../../../three/environment/DaylightSky'
import { EnvironmentSlot } from '../../../three/environment/EnvironmentSlot'
import { FleetGarage } from '../../../three/environment/FleetGarage'
import { Highway } from '../../../three/environment/Highway'
import { ProceduralEnvironment } from '../../../three/environment/ProceduralEnvironment'
import { worldToSlot } from '../../../three/environment/slotSpace'
import { StageLighting } from '../../../three/environment/StageLighting'
import { YardFloor } from '../../../three/environment/YardFloor'
import { SCENE_01_CONFIG, type Scene01Config } from '../config'
import { combinationCentre, createDeparturePath, describeExitRoad, resolveCouplingPose, type CombinationLengths, type TrailerTracking } from '../departurePath'
import type { AssemblyLayout } from '../layout'
import { createPose, type CouplingPose, type CouplingRig } from '../rig'
import { HydraulicAxleTrailer } from '../vehicles/HydraulicAxleTrailer'
import { PullerTruck } from '../vehicles/PullerTruck'
import { blendFogDepths, resolveFogDepthsPerStage } from './fogDepths'

export interface CouplingStageProps {
  rig: CouplingRig
  pose: CouplingPose
  layout: AssemblyLayout
  config?: Scene01Config
}

/**
 * Scene fog whose depths follow the responsive camera and the current camera
 * framing (see ./fogDepths.ts), so the subject never sits inside the fog band
 * on portrait viewports or in the wide framings. As the daylight comes up
 * (`rig.atmosphere.daylight`) it blends to the configured haze — lighter and
 * much longer — which is what reveals the city in the distance and gives the
 * skyline its atmospheric depth.
 */
function StageFog({ config, rig }: { config: Scene01Config; rig: CouplingRig }) {
  const size = useThree((state) => state.size)
  const scene = useThree((state) => state.scene)
  const invalidate = useThree((state) => state.invalidate)
  const perStage = useMemo(() => resolveFogDepthsPerStage(config, size.height > 0 ? size.width / size.height : 1), [config, size])
  const colors = useMemo(() => ({ base: new Color(config.environment.backgroundColor), haze: new Color(config.environment.atmosphere.haze.color) }), [config])
  const last = useRef({ near: NaN, far: NaN, haze: NaN })

  useEffect(() => {
    last.current = { near: NaN, far: NaN, haze: NaN }
    invalidate()
  }, [perStage, colors, invalidate])

  // Priority −1.5: after the pose resolver, before the camera (both are cheap and order-independent anyway).
  useFrame(() => {
    const fog = scene.fog as Fog | null
    if (!fog || !('near' in fog)) return
    const stage = blendFogDepths(perStage, rig.camera.stage)
    const haze = config.environment.atmosphere.haze
    const h = Math.min(1, Math.max(0, rig.atmosphere.daylight))
    const near = stage.near + (haze.near - stage.near) * h
    const far = stage.far + (haze.far - stage.far) * h
    if (near === last.current.near && far === last.current.far && h === last.current.haze) return
    last.current = { near, far, haze: h }
    fog.near = near
    fog.far = far
    fog.color.copy(colors.base).lerp(colors.haze, h)
  }, -1.5)

  const initial = perStage[0] ?? { near: config.environment.fog.near, far: config.environment.fog.far }
  return <fog attach="fog" args={[config.environment.backgroundColor, initial.near, initial.far]} />
}

/**
 * Drives the camera along its framing sequence by `rig.camera.stage`. Framings with a `follow` weight track the
 * combination's centre: the camera receives its ground-plane displacement from the coupled rest position, derived
 * from the same per-frame pose the vehicles use, so it is as deterministic (and reversible) as the scroll.
 */
function CameraRig({
  spec,
  rig,
  pose,
  lengths,
  rest,
}: {
  spec: FramedCameraSpec
  rig: CouplingRig
  pose: CouplingPose
  lengths: CombinationLengths
  rest: readonly [number, number]
}) {
  const centre = useRef<[number, number]>([0, 0])
  const delta = useRef<[number, number]>([0, 0])
  useFramedCamera(
    spec,
    () => rig.camera.stage,
    () => {
      combinationCentre(pose, lengths, centre.current)
      delta.current[0] = centre.current[0] - rest[0]
      delta.current[1] = centre.current[1] - rest[1]
      return delta.current
    },
  )
  return null
}

/** Derives both vehicles' world transforms from the rig once per rendered frame, before anything reads them. */
function PoseResolver({ rig, pose, layout, config }: { rig: CouplingRig; pose: CouplingPose; layout: AssemblyLayout; config: Scene01Config }) {
  const path = useMemo(() => createDeparturePath(layout.pullerFinal, config.departure), [layout, config.departure])
  const tracking = useMemo<TrailerTracking>(() => {
    const hitchOffset = getModelEntry(config.models.puller).anchors.coupling[0] * config.models.scale
    return {
      hitchOffset,
      // Measured from the resolved rest layout rather than the anchors alone, so the first frame of the departure
      // reproduces the coupled rest pose exactly, whatever `assembly.connectedGap` or a final-position override says.
      kingpinOffset: layout.trailerFinal[0] - layout.pullerFinal[0] - hitchOffset,
      trackingLength: config.departure.trailerTrackingLength,
    }
  }, [config, layout])

  useFrame(() => {
    resolveCouplingPose(rig, path, tracking, pose)
  }, -2)
  return null
}

export function CouplingStage({ rig, pose, layout, config = SCENE_01_CONFIG }: CouplingStageProps) {
  const env = config.environment
  const groundY = config.world.groundY
  const shadowCentre = useMemo<Vec3>(
    () => [(layout.pullerFinal[0] + layout.trailerFinal[0]) / 2, groundY, (layout.pullerFinal[2] + layout.trailerFinal[2]) / 2],
    [layout, groundY],
  )

  // Exit road: the U-turn's paved band in WORLD space, clipped at the apron kerb (garage frame) and at the far
  // carriageway edge (highway frame), then mapped into the road slot. It also tells the garage where to break its
  // kerb and the highway where to break its far edge line.
  const exitRoad = useMemo(() => {
    const hw = env.highway
    return describeExitRoad(
      layout.pullerFinal,
      config.departure,
      env.road.width,
      env.road.overlap,
      { slot: env.garage.slot, apronFront: env.garage.apron.front, kerbWidth: env.garage.apron.kerb.width },
      { slot: hw.slot, carriagewayHalfWidth: (hw.lanes * hw.laneWidth) / 2 },
    )
  }, [env, layout, config.departure])
  const roadOutline = useMemo(() => exitRoad.outline.map((p) => worldToSlot(env.road.slot, p)), [exitRoad, env.road.slot])
  const kerbGaps = useMemo<ReadonlyArray<readonly [number, number]>>(
    () => (env.road.enabled && exitRoad.kerbGap ? [[exitRoad.kerbGap[0] - 0.1, exitRoad.kerbGap[1] + 0.1]] : []),
    [env.road.enabled, exitRoad],
  )
  const farEdgeGap = env.road.enabled ? exitRoad.junction : null

  // Stable identity: FleetGarage re-clones its fade materials whenever this object changes.
  const garageFleet = useMemo(
    () => ({ puller: getModelEntry(config.models.puller), trailer: getModelEntry(config.models.trailer), sceneScale: config.models.scale }),
    [config],
  )
  const getGarageOpacity = useCallback(() => rig.garage.opacity, [rig])
  const getDaylight = useCallback(() => rig.atmosphere.daylight, [rig])
  // The yard floor takes on a daylight ground tone together with the sky and haze.
  const groundBlend = useMemo(() => ({ color: env.atmosphere.groundColor, getBlend: getDaylight }), [env.atmosphere.groundColor, getDaylight])

  // Camera follow: the combination's centre while coupled at rest is the reference the wide framing tracks from.
  const lengths = useMemo<CombinationLengths>(
    () => ({
      pullerLength: getModelEntry(config.models.puller).footprint.length * config.models.scale,
      trailerLength: getModelEntry(config.models.trailer).footprint.length * config.models.scale,
    }),
    [config],
  )
  const rest = useMemo<readonly [number, number]>(() => {
    const atRest = createPose(layout)
    atRest.puller.x = layout.pullerFinal[0]
    atRest.puller.z = layout.pullerFinal[2]
    atRest.trailer.x = layout.trailerFinal[0]
    atRest.trailer.z = layout.trailerFinal[2]
    return combinationCentre(atRest, lengths, [0, 0])
  }, [layout, lengths])

  // Shadow systems track the combination's centre (both vehicles' midpoint during the approach, the coupled
  // combination afterwards) relative to the static shadow centre.
  const shadowScratch = useRef<[number, number]>([0, 0])
  const shadowOffset = useRef<[number, number]>([0, 0])
  const getShadowOffset = useMemo(
    () => () => {
      combinationCentre(pose, lengths, shadowScratch.current)
      shadowOffset.current[0] = shadowScratch.current[0] - rest[0]
      shadowOffset.current[1] = shadowScratch.current[1] - rest[1]
      return shadowOffset.current
    },
    [pose, lengths, rest],
  )

  /** Ground height in a slot's local space. */
  const localGround = (slot: { position: Vec3 }) => groundY - slot.position[1]

  return (
    <>
      <color attach="background" args={[env.backgroundColor]} />
      <StageFog config={config} rig={rig} />
      <DaylightSky sky={env.atmosphere.sky} getDaylight={getDaylight} />
      <ProceduralEnvironment intensity={config.lighting.environmentIntensity} />
      {/* Shadows (key-light frustum + contact-shadow plane) follow the combination's centre, so they stay compact and crisp. */}
      <StageLighting lighting={config.lighting} shadowCentre={shadowCentre} getShadowOffset={getShadowOffset} />
      <YardFloor environment={env} groundY={groundY} shadowCentre={shadowCentre} getShadowOffset={getShadowOffset} groundBlend={groundBlend} />

      {/* Environment slots: independent, replaceable, fixed in the world. */}
      {env.garage.enabled && (
        <EnvironmentSlot
          name="garage"
          slot={env.garage.slot}
          showBounds={env.showSlotBounds}
          getOpacity={getGarageOpacity}
          placeholder={
            <FleetGarage
              config={env.garage}
              groundY={localGround(env.garage.slot)}
              fleet={garageFleet}
              getOpacity={getGarageOpacity}
              getDaylight={getDaylight}
              kerbGaps={kerbGaps}
            />
          }
        >
          {env.garage.sign.enabled && <BrandSign config={env.garage.sign} groundY={localGround(env.garage.slot)} getOpacity={getGarageOpacity} />}
        </EnvironmentSlot>
      )}
      {env.road.enabled && (
        <EnvironmentSlot
          name="road"
          slot={env.road.slot}
          showBounds={env.showSlotBounds}
          placeholder={<AccessRoad outline={roadOutline} groundY={localGround(env.road.slot)} color={env.road.color} grain={env.road.grain} />}
        />
      )}
      {env.highway.enabled && (
        <EnvironmentSlot
          name="highway"
          slot={env.highway.slot}
          showBounds={env.showSlotBounds}
          placeholder={<Highway config={env.highway} groundY={localGround(env.highway.slot)} farEdgeGap={farEdgeGap} />}
        />
      )}
      {env.city.enabled && (
        <EnvironmentSlot
          name="city"
          slot={env.city.slot}
          showBounds={env.showSlotBounds}
          placeholder={<CityBackdrop config={env.city} groundY={localGround(env.city.slot)} />}
        />
      )}

      <PoseResolver rig={rig} pose={pose} layout={layout} config={config} />
      <CameraRig spec={config.camera} rig={rig} pose={pose} lengths={lengths} rest={rest} />
      <PullerTruck pose={pose} layout={layout} config={config} />
      <HydraulicAxleTrailer pose={pose} layout={layout} config={config} />
    </>
  )
}
