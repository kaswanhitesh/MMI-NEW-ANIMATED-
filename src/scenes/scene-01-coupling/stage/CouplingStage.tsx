/**
 * Scene 01's R3F stage: background, fog, procedural environment lighting,
 * stage lights, yard floor, the fleet-garage and highway backdrops, the
 * responsive camera rig and the two vehicles. Rendered INSIDE a `SceneCanvas`
 * — it owns no canvas of its own. Every number comes from `SCENE_01_CONFIG`
 * (or the `config` prop) and the resolved `AssemblyLayout`; the vehicles read
 * the per-frame `CouplingPose`, which `PoseResolver` derives from the mutable
 * `CouplingRig` the scroll timeline tweens (approach positions, departure
 * distance, camera stage, fades).
 */
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type { Fog } from 'three'
import { getModelEntry } from '../../../three/assets'
import type { Vec3 } from '../../../three/assets/types'
import type { FramedCameraSpec } from '../../../three/camera/types'
import { useFramedCamera } from '../../../three/camera/useFramedCamera'
import { FleetGarage } from '../../../three/environment/FleetGarage'
import { Highway } from '../../../three/environment/Highway'
import { ProceduralEnvironment } from '../../../three/environment/ProceduralEnvironment'
import { StageLighting } from '../../../three/environment/StageLighting'
import { YardFloor } from '../../../three/environment/YardFloor'
import { SCENE_01_CONFIG, type Scene01Config } from '../config'
import { createDeparturePath, describeAccessRoad, resolveCouplingPose, type TrailerTracking } from '../departurePath'
import type { AssemblyLayout } from '../layout'
import type { CouplingPose, CouplingRig } from '../rig'
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
 * on portrait viewports or in the wide framings.
 */
function StageFog({ config, rig }: { config: Scene01Config; rig: CouplingRig }) {
  const size = useThree((state) => state.size)
  const scene = useThree((state) => state.scene)
  const invalidate = useThree((state) => state.invalidate)
  const perStage = useMemo(() => resolveFogDepthsPerStage(config, size.height > 0 ? size.width / size.height : 1), [config, size])
  const last = useRef({ near: NaN, far: NaN })

  useEffect(() => {
    last.current = { near: NaN, far: NaN }
    invalidate()
  }, [perStage, invalidate])

  // Priority −1.5: after the pose resolver, before the camera (both are cheap and order-independent anyway).
  useFrame(() => {
    const fog = scene.fog as Fog | null
    if (!fog || !('near' in fog)) return
    const { near, far } = blendFogDepths(perStage, rig.camera.stage)
    if (near === last.current.near && far === last.current.far) return
    last.current = { near, far }
    fog.near = near
    fog.far = far
  }, -1.5)

  const initial = perStage[0] ?? { near: config.environment.fog.near, far: config.environment.fog.far }
  return <fog attach="fog" args={[config.environment.backgroundColor, initial.near, initial.far]} />
}

function CameraRig({ spec, rig }: { spec: FramedCameraSpec; rig: CouplingRig }) {
  useFramedCamera(spec, () => rig.camera.stage)
  return null
}

/** Derives both vehicles' world transforms from the rig once per rendered frame, before anything reads them. */
function PoseResolver({ rig, pose, layout, config }: { rig: CouplingRig; pose: CouplingPose; layout: AssemblyLayout; config: Scene01Config }) {
  const path = useMemo(() => createDeparturePath(layout.pullerFinal, config.departure), [layout, config.departure])
  const tracking = useMemo<TrailerTracking>(() => {
    const scale = config.models.scale
    return {
      hitchOffset: getModelEntry(config.models.puller).anchors.coupling[0] * scale,
      kingpinOffset: -getModelEntry(config.models.trailer).anchors.coupling[0] * scale,
      trackingLength: config.departure.trailerTrackingLength,
    }
  }, [config])

  useFrame(() => {
    resolveCouplingPose(rig, path, tracking, pose)
  }, -2)
  return null
}

export function CouplingStage({ rig, pose, layout, config = SCENE_01_CONFIG }: CouplingStageProps) {
  const shadowCentre = useMemo<Vec3>(
    () => [
      (layout.pullerFinal[0] + layout.trailerFinal[0]) / 2,
      config.world.groundY,
      (layout.pullerFinal[2] + layout.trailerFinal[2]) / 2,
    ],
    [layout, config.world.groundY],
  )

  // The paved yard exit follows the departure path from behind the trailer to the highway's far carriageway edge.
  const access = useMemo(() => {
    const hw = config.environment.highway
    const trailer = getModelEntry(config.models.trailer)
    const rearX = layout.trailerFinal[0] + (trailer.footprint.length / 2) * config.models.scale + hw.access.rearMargin
    const joinZ = hw.centreZ - (hw.lanes * hw.laneWidth) / 2
    return describeAccessRoad(layout.pullerFinal, config.departure, hw.access.width, rearX, joinZ, hw.access.overlap)
  }, [config, layout])

  return (
    <>
      <color attach="background" args={[config.environment.backgroundColor]} />
      <StageFog config={config} rig={rig} />
      <ProceduralEnvironment intensity={config.lighting.environmentIntensity} />
      <StageLighting lighting={config.lighting} shadowCentre={shadowCentre} />
      <YardFloor
        environment={config.environment}
        groundY={config.world.groundY}
        shadowCentre={shadowCentre}
        getMarkingsOpacity={() => 1 - rig.highway.opacity}
      />
      {config.environment.garage.enabled && (
        <FleetGarage
          config={config.environment.garage}
          groundY={config.world.groundY}
          fleet={{ puller: getModelEntry(config.models.puller), trailer: getModelEntry(config.models.trailer), sceneScale: config.models.scale }}
          getOpacity={() => rig.garage.opacity}
        />
      )}
      {config.environment.highway.enabled && (
        <Highway config={config.environment.highway} groundY={config.world.groundY} getOpacity={() => rig.highway.opacity} access={access} />
      )}
      <PoseResolver rig={rig} pose={pose} layout={layout} config={config} />
      <CameraRig spec={config.camera} rig={rig} />
      <PullerTruck pose={pose} layout={layout} config={config} />
      <HydraulicAxleTrailer pose={pose} layout={layout} config={config} />
    </>
  )
}
