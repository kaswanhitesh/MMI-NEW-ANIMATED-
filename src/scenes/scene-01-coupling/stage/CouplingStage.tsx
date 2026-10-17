/**
 * Scene 01's R3F stage: background, fog, procedural environment lighting,
 * stage lights, yard floor, the responsive camera rig and the two vehicles.
 * Rendered INSIDE a `SceneCanvas` — it owns no canvas of its own. Every number
 * comes from `SCENE_01_CONFIG` (or the `config` prop) and the resolved
 * `AssemblyLayout`; the vehicles read their positions from the mutable
 * `CouplingRig` the scroll timeline tweens.
 */
import { useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import type { Vec3 } from '../../../three/assets/types'
import type { FramedCameraSpec } from '../../../three/camera/types'
import { useFramedCamera } from '../../../three/camera/useFramedCamera'
import { ProceduralEnvironment } from '../../../three/environment/ProceduralEnvironment'
import { StageLighting } from '../../../three/environment/StageLighting'
import { YardFloor } from '../../../three/environment/YardFloor'
import { SCENE_01_CONFIG, type Scene01Config } from '../config'
import type { AssemblyLayout } from '../layout'
import type { CouplingRig } from '../rig'
import { HydraulicAxleTrailer } from '../vehicles/HydraulicAxleTrailer'
import { PullerTruck } from '../vehicles/PullerTruck'
import { resolveFogDepths } from './fogDepths'

export interface CouplingStageProps {
  rig: CouplingRig
  layout: AssemblyLayout
  config?: Scene01Config
}

/**
 * Scene fog whose depths follow the responsive camera (see ./fogDepths.ts),
 * so the vehicles never sit inside the fog band on portrait viewports.
 */
function StageFog({ config }: { config: Scene01Config }) {
  const size = useThree((state) => state.size)
  const invalidate = useThree((state) => state.invalidate)
  const { near, far } = useMemo(() => resolveFogDepths(config, size.height > 0 ? size.width / size.height : 1), [config, size])

  useEffect(() => {
    invalidate()
  }, [near, far, invalidate])

  return <fog attach="fog" args={[config.environment.backgroundColor, near, far]} />
}

function CameraRig({ spec, rig }: { spec: FramedCameraSpec; rig: CouplingRig }) {
  useFramedCamera(spec, () => rig.camera.heroBlend)
  return null
}

export function CouplingStage({ rig, layout, config = SCENE_01_CONFIG }: CouplingStageProps) {
  const shadowCentre = useMemo<Vec3>(
    () => [
      (layout.pullerFinal[0] + layout.trailerFinal[0]) / 2,
      config.world.groundY,
      (layout.pullerFinal[2] + layout.trailerFinal[2]) / 2,
    ],
    [layout, config.world.groundY],
  )

  return (
    <>
      <color attach="background" args={[config.environment.backgroundColor]} />
      <StageFog config={config} />
      <ProceduralEnvironment intensity={config.lighting.environmentIntensity} />
      <StageLighting lighting={config.lighting} shadowCentre={shadowCentre} />
      <YardFloor environment={config.environment} groundY={config.world.groundY} shadowCentre={shadowCentre} />
      <CameraRig spec={config.camera} rig={rig} />
      <PullerTruck rig={rig} layout={layout} config={config} />
      <HydraulicAxleTrailer rig={rig} layout={layout} config={config} />
    </>
  )
}
