/**
 * The closing sequence of Scene 01 on the stage: the industrial area along the
 * highway, the Gemini Engi Fab factory (with its sign), the vessels in its
 * fabrication stations, the overhead crane, the lifting rig, the cargo vessel
 * and its saddles. Each is a SEPARATE, replaceable component — an environment
 * slot (factory, industrial area, crane, workpieces, cargo) or a named group
 * (lifting rig, ground and trailer saddles) — so any of them can be swapped for
 * a detailed model without touching the others or the timeline.
 *
 * The animated parts read one per-frame `LoadingPose` that `LoadingResolver`
 * derives from `rig.loading` (see ../loading.ts). The cargo has its own slot
 * whose frame follows the cargo pose: it is never parented to the trailer or
 * the crane, so the vessel, the vehicle and the crane stay independent.
 */
import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useLayoutEffect, useMemo, useRef } from 'react'
import type { Group, Object3D } from 'three'
import { BrandSign } from '../../../three/environment/BrandSign'
import { EnvironmentSlot } from '../../../three/environment/EnvironmentSlot'
import type { EnvironmentModelConfig, EnvironmentSlotConfig } from '../../../three/environment/types'
import { GeminiFactory } from '../../../three/industrial/GeminiFactory'
import { IndustrialZone } from '../../../three/industrial/IndustrialZone'
import { LiftingRig } from '../../../three/industrial/LiftingRig'
import { OverheadCrane } from '../../../three/industrial/OverheadCrane'
import { PressureVessel } from '../../../three/industrial/PressureVessel'
import type { CranePose, VesselSaddleConfig } from '../../../three/industrial/types'
import { VesselSaddle } from '../../../three/industrial/VesselSaddle'
import type { Scene01Config } from '../config'
import type { FactoryLayout } from '../layout'
import { createLoadingPose, resolveLoadingPose, type CargoPose, type LoadingPose } from '../loading'
import type { CouplingPose, CouplingRig, VehiclePose } from '../rig'

export interface FactorySequenceProps {
  rig: CouplingRig
  pose: CouplingPose
  factory: FactoryLayout
  config: Scene01Config
}

/** Copies a pose onto a group only when it changed. */
function syncGroup(group: Group, x: number, y: number, z: number, yaw: number): void {
  const { position } = group
  if (position.x !== x || position.y !== y || position.z !== z) position.set(x, y, z)
  if (group.rotation.y !== yaw) group.rotation.y = yaw
}

/** Derives the cargo, crane and rigging poses from the rig once per rendered frame, before anything reads them. */
function LoadingResolver({ rig, factory, config, out }: { rig: CouplingRig; factory: FactoryLayout; config: Scene01Config; out: LoadingPose }) {
  const resolve = useCallback(
    () => resolveLoadingPose(rig.loading, factory.loading, config.loading, config.industry.crane.rig, config.industry.crane.slot, out),
    [rig, factory, config, out],
  )
  // Resolve on mount too (this layout effect runs before its later siblings'), so components that place themselves in a
  // layout effect read a valid pose.
  useLayoutEffect(resolve, [resolve])
  useFrame(resolve, -2)
  return null
}

/** The cargo vessel: its slot's frame follows the cargo pose (the vessel's local frame in the world). */
function Cargo({ config, getPose }: { config: Scene01Config['industry']['cargo']; getPose: () => CargoPose }) {
  const ref = useRef<Group>(null)
  const invalidate = useThree((state) => state.invalidate)
  const sync = useCallback(() => {
    const group = ref.current
    if (!group) return
    const p = getPose()
    syncGroup(group, p.x, p.y, p.z, p.yaw)
  }, [getPose])
  useLayoutEffect(() => {
    sync()
    invalidate()
  }, [sync, invalidate])
  useFrame(sync)
  return (
    <group ref={ref} name="cargo">
      <EnvironmentSlot name="cargo" slot={config.slot} placeholder={<PressureVessel config={config.vessel} />} />
    </group>
  )
}

/**
 * Drives a replacement crane model: finds its `bridge`, `trolley` and `hook` nodes (see config `industry.crane`) inside
 * the crane slot and places them from the crane pose every frame. Does nothing for the procedural crane, which places
 * its own parts (its groups are named `crane:*`).
 */
function CraneModelDriver({ model, getPose }: { model: EnvironmentModelConfig; getPose: () => CranePose }) {
  const ref = useRef<Group>(null)
  const nodes = useRef<{ bridge?: Object3D; trolley?: Object3D; hook?: Object3D; lookup: number }>({ lookup: 0 })
  useFrame(() => {
    const slot = ref.current?.parent
    if (!slot) return
    const cache = nodes.current
    // (Re)resolve the nodes when none are cached or the model they belong to was unmounted; while the model is still
    // loading, look again every 30 frames rather than searching the slot every frame.
    if (!cache.bridge || !isInside(cache.bridge, slot)) {
      if (cache.lookup-- > 0) return
      cache.lookup = 30
      cache.bridge = slot.getObjectByName('bridge')
      cache.trolley = cache.bridge?.getObjectByName('trolley')
      cache.hook = cache.trolley?.getObjectByName('hook')
      if (!cache.bridge) return
    }
    const p = getPose()
    const k = 1 / (model.scale || 1)
    cache.bridge.position.z = p.bridgeZ * k
    if (cache.trolley) cache.trolley.position.x = p.trolleyX * k
    if (cache.hook) cache.hook.position.y = p.hookY * k
  })
  return <group ref={ref} name="crane:model-driver" />
}

function isInside(object: Object3D, ancestor: Object3D): boolean {
  for (let p = object.parent; p; p = p.parent) if (p === ancestor) return true
  return false
}

/** One saddle: an environment slot (so a GLB can replace the stand-in) placed by its parent group. */
function Saddle({ name, config, model }: { name: string; config: VesselSaddleConfig; model: EnvironmentModelConfig | null }) {
  const slot = useMemo<EnvironmentSlotConfig>(() => {
    const half = config.vesselDiameter / 2 + 0.2
    return { position: [0, 0, 0], rotationY: 0, bounds: { min: [-config.thickness / 2, 0, -half], max: [config.thickness / 2, config.height + half, half] }, model }
  }, [config, model])
  return <EnvironmentSlot name={name} slot={slot} placeholder={<VesselSaddle config={config} />} />
}

/** Transport saddles on the trailer deck: they ride with the trailer (its per-frame pose), in trailer-local space. */
function TrailerSaddles({ pose, factory, config }: { pose: CouplingPose; factory: FactoryLayout; config: Scene01Config }) {
  const ref = useRef<Group>(null)
  const invalidate = useThree((state) => state.invalidate)
  const sync = useCallback(() => {
    const group = ref.current
    if (!group) return
    const t: VehiclePose = pose.trailer
    syncGroup(group, t.x, t.y, t.z, t.yaw)
  }, [pose])
  useLayoutEffect(() => {
    sync()
    invalidate()
  }, [sync, invalidate])
  useFrame(sync)
  return (
    <group ref={ref} name="supports:trailer">
      {factory.loading.trailerSaddles.map((p, i) => (
        <group key={p[0]} position={p}>
          <Saddle name={`saddle:trailer:${i}`} config={config.industry.supports.trailer} model={config.industry.supports.models.trailer} />
        </group>
      ))}
    </group>
  )
}

export function FactorySequence({ rig, pose, factory, config }: FactorySequenceProps) {
  const ind = config.industry
  const showBounds = config.environment.showSlotBounds
  const groundY = config.world.groundY
  /** Ground height in a slot's local space. */
  const localGround = (slot: { position: readonly [number, number, number] }) => groundY - slot.position[1]

  const loadingPose = useMemo(() => createLoadingPose(), [])
  const getCargoPose = useCallback(() => loadingPose.cargo, [loadingPose])
  const getCranePose = useCallback(() => loadingPose.crane, [loadingPose])
  const getRigPose = useCallback(() => loadingPose.rig, [loadingPose])
  const signOpacity = useCallback(() => 1, [])

  const { loading } = factory
  const workpieces = useMemo(
    () => (
      <group name="workpieces">
        {ind.workpieces.items.map((item) => (
          <group key={item.name} name={`workpiece:${item.name}`} position={item.position} rotation-y={item.yaw}>
            <PressureVessel config={item.vessel} />
          </group>
        ))}
      </group>
    ),
    [ind.workpieces.items],
  )

  return (
    <group name="factory-sequence">
      <LoadingResolver rig={rig} factory={factory} config={config} out={loadingPose} />

      {ind.zone.enabled && (
        <EnvironmentSlot name="industrial" slot={ind.zone.slot} showBounds={showBounds} placeholder={<IndustrialZone config={ind.zone.config} />} />
      )}
      {ind.factory.enabled && (
        <EnvironmentSlot name="factory" slot={ind.factory.slot} showBounds={showBounds} placeholder={<GeminiFactory config={ind.factory.building} />}>
          {ind.factory.sign.enabled && <BrandSign name="brand-sign:factory" config={ind.factory.sign} groundY={localGround(ind.factory.slot)} getOpacity={signOpacity} />}
        </EnvironmentSlot>
      )}
      {ind.workpieces.enabled && <EnvironmentSlot name="workpieces" slot={ind.workpieces.slot} showBounds={showBounds} placeholder={workpieces} />}
      {ind.crane.enabled && (
        <>
          <EnvironmentSlot name="crane" slot={ind.crane.slot} showBounds={showBounds} placeholder={<OverheadCrane config={ind.crane.crane} getPose={getCranePose} />}>
            {ind.crane.slot.model && <CraneModelDriver model={ind.crane.slot.model} getPose={getCranePose} />}
          </EnvironmentSlot>
          <LiftingRig config={ind.crane.rig} getPose={getRigPose} />
        </>
      )}

      {/* The vessel's ground saddles at its resting place, and the transport saddles riding on the trailer deck. */}
      <group name="supports:ground">
        {loading.groundSaddles.map((p, i) => (
          <group key={`${p[0]}:${p[2]}`} position={p} rotation-y={loading.yaw}>
            <Saddle name={`saddle:ground:${i}`} config={ind.supports.ground} model={ind.supports.models.ground} />
          </group>
        ))}
      </group>
      <TrailerSaddles pose={pose} factory={factory} config={config} />
      <Cargo config={ind.cargo} getPose={getCargoPose} />
    </group>
  )
}
