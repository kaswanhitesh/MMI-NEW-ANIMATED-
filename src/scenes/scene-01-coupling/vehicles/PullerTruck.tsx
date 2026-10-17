/**
 * The puller truck in Scene 01. A group whose position and yaw are copied from
 * the derived `pose.puller` every rendered frame (only when changed), containing the
 * manifest model placed through `ModelAsset` with the TEMPORARY placeholder
 * geometry as its fallback. This file and HydraulicAxleTrailer.tsx are the
 * only places that know which model id a vehicle uses.
 */
import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import type { Group } from 'three'
import { getModelEntry, ModelAsset } from '../../../three/assets'
import { PlaceholderPullerTruck } from '../../../three/placeholders'
import { SCENE_01_CONFIG, type Scene01Config } from '../config'
import type { AssemblyLayout } from '../layout'
import type { CouplingPose, VehiclePose } from '../rig'

export interface PullerTruckProps {
  /** Derived per-frame transform (position + yaw) the group copies; see departurePath.ts. */
  pose: CouplingPose
  layout: AssemblyLayout
  config?: Scene01Config
}

function syncPose(group: Group, target: VehiclePose): void {
  const { position } = group
  if (position.x !== target.x || position.y !== target.y || position.z !== target.z) position.set(target.x, target.y, target.z)
  if (group.rotation.y !== target.yaw) group.rotation.y = target.yaw
}

export function PullerTruck({ pose, layout, config = SCENE_01_CONFIG }: PullerTruckProps) {
  const ref = useRef<Group>(null)
  const invalidate = useThree((state) => state.invalidate)
  const id = config.models.puller
  const sceneScale = config.models.scale
  const entry = getModelEntry(id)

  // Layout positions are exposed on the group for inspection in three.js devtools; the live position comes from the rig.
  const userData = useMemo(
    () => ({ vehicle: 'puller', modelId: id, start: layout.pullerStart, final: layout.pullerFinal }),
    [id, layout],
  )

  useLayoutEffect(() => {
    const group = ref.current
    if (!group) return
    syncPose(group, pose.puller)
    invalidate()
  }, [pose, invalidate])

  useFrame(() => {
    const group = ref.current
    if (group) syncPose(group, pose.puller)
  })

  return (
    <group ref={ref} name="vehicle:puller" userData={userData}>
      <ModelAsset id={id} sceneScale={sceneScale} placeholder={<PlaceholderPullerTruck entry={entry} sceneScale={sceneScale} />} />
    </group>
  )
}
