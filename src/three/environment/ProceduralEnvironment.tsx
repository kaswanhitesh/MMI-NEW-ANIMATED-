/**
 * Image-based lighting without any network request: three's RoomEnvironment
 * (a procedural studio box) is pre-filtered through a PMREMGenerator and set
 * as `scene.environment`, with `scene.environmentIntensity` driven by the
 * `intensity` prop. The render target and generator are released on unmount
 * and the scene's environment is reset to null.
 */
import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { PMREMGenerator } from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

export interface ProceduralEnvironmentProps {
  /** Strength of the environment lighting (`scene.environmentIntensity`). */
  intensity: number
}

/** Blur (radians) applied to the room before pre-filtering; the value the three.js examples use for RoomEnvironment. */
const ROOM_SIGMA = 0.04

export function ProceduralEnvironment({ intensity }: ProceduralEnvironmentProps) {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const invalidate = useThree((state) => state.invalidate)

  useEffect(() => {
    const generator = new PMREMGenerator(gl)
    const room = new RoomEnvironment()
    const renderTarget = generator.fromScene(room, ROOM_SIGMA)
    // The room's geometry and materials are baked into the target now; nothing else references them.
    room.dispose()

    scene.environment = renderTarget.texture
    invalidate()

    return () => {
      if (scene.environment === renderTarget.texture) scene.environment = null
      renderTarget.dispose()
      generator.dispose()
      invalidate()
    }
  }, [gl, scene, invalidate])

  useEffect(() => {
    scene.environmentIntensity = intensity
    invalidate()
  }, [scene, intensity, invalidate])

  return null
}
