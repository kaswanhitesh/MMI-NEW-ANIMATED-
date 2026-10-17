/**
 * The hydraulic axle trailer in Scene 01. A group whose position is copied
 * from `rig.trailer` every rendered frame (only when it changed), containing
 * the manifest model placed through `ModelAsset` with the TEMPORARY
 * placeholder geometry as its fallback. This file and PullerTruck.tsx are the
 * only places that know which model id a vehicle uses.
 */
import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import type { Group } from 'three'
import { getModelEntry, ModelAsset } from '../../../three/assets'
import { PlaceholderHydraulicAxleTrailer } from '../../../three/placeholders'
import { SCENE_01_CONFIG, type Scene01Config } from '../config'
import type { AssemblyLayout } from '../layout'
import type { CouplingRig, RigPosition } from '../rig'

export interface HydraulicAxleTrailerProps {
  rig: CouplingRig
  layout: AssemblyLayout
  config?: Scene01Config
}

function syncPosition(group: Group, target: RigPosition): void {
  const { position } = group
  if (position.x !== target.x || position.y !== target.y || position.z !== target.z) position.set(target.x, target.y, target.z)
}

export function HydraulicAxleTrailer({ rig, layout, config = SCENE_01_CONFIG }: HydraulicAxleTrailerProps) {
  const ref = useRef<Group>(null)
  const invalidate = useThree((state) => state.invalidate)
  const id = config.models.trailer
  const sceneScale = config.models.scale
  const entry = getModelEntry(id)

  // Layout positions are exposed on the group for inspection in three.js devtools; the live position comes from the rig.
  const userData = useMemo(
    () => ({ vehicle: 'trailer', modelId: id, start: layout.trailerStart, staged: layout.trailerStaged, final: layout.trailerFinal }),
    [id, layout],
  )

  useLayoutEffect(() => {
    const group = ref.current
    if (!group) return
    syncPosition(group, rig.trailer)
    invalidate()
  }, [rig, invalidate])

  useFrame(() => {
    const group = ref.current
    if (group) syncPosition(group, rig.trailer)
  })

  return (
    <group ref={ref} name="vehicle:trailer" userData={userData}>
      <ModelAsset id={id} sceneScale={sceneScale} placeholder={<PlaceholderHydraulicAxleTrailer entry={entry} sceneScale={sceneScale} />} />
    </group>
  )
}
