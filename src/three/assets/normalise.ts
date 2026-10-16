/**
 * Pure geometry helpers that bring a loaded model into the scene convention
 * described in ./types.ts: 1 unit = 1 metre, upright, nose towards −X, local
 * origin at the footprint centre on the ground plane.
 *
 * Nothing here touches React or the renderer; the functions operate on plain
 * three.js objects so they can be exercised with synthetic meshes.
 */
import { Box3, Euler, Matrix4, Quaternion, Vector3 } from 'three'
import type { BufferAttribute, InstancedMesh, InterleavedBufferAttribute, Mesh, Object3D } from 'three'
import type { ModelNormalisation, Vec3 } from './types'

type PositionAttribute = BufferAttribute | InterleavedBufferAttribute

function isMesh(object: Object3D): object is Mesh {
  return (object as Mesh).isMesh === true
}

function isInstancedMesh(object: Object3D): object is InstancedMesh {
  return (object as InstancedMesh).isInstancedMesh === true
}

/** The geometry's vertex positions, or null when there is no CPU-side position attribute (e.g. a GLBufferAttribute). */
function positionsOf(mesh: Mesh): PositionAttribute | null {
  const attribute = mesh.geometry.getAttribute('position') as PositionAttribute | undefined
  if (!attribute || typeof attribute.getX !== 'function') return null
  return attribute
}

function expandByVertices(box: Box3, positions: PositionAttribute, matrix: Matrix4, point: Vector3): void {
  for (let i = 0, n = positions.count; i < n; i++) {
    point.fromBufferAttribute(positions, i).applyMatrix4(matrix)
    box.expandByPoint(point)
  }
}

/**
 * Exact axis-aligned bounds of `root` after the manifest rotation (Euler XYZ,
 * radians) and the uniform scale `normalisation.scale * sceneScale` have been
 * applied — i.e. the box the `<group rotation scale>` wrapper in GltfModel
 * will occupy, expressed in that wrapper's own space.
 *
 * `Box3.setFromObject` is deliberately not used: a rotated object's box must be
 * recomputed from its vertices, because transforming the eight corners of a
 * pre-computed box over-estimates the extent and would float the model above
 * the ground. Every vertex of every mesh (and every instance of an
 * InstancedMesh) is transformed instead. Skinned meshes are measured in their
 * bind pose; morph targets are ignored.
 *
 * Mesh transforms are taken relative to the root's PARENT space
 * (`root.matrix * inverse(root.matrixWorld) * mesh.matrixWorld`), so a root
 * that carries its own transform is measured exactly as it will be rendered.
 * For a GLTF scene root, whose local transform is the identity, this equals
 * `inverse(root.matrixWorld) * mesh.matrixWorld`.
 *
 * Returns an empty box (`isEmpty() === true`) when no vertex positions exist.
 */
export function measureNormalisedBounds(root: Object3D, normalisation: ModelNormalisation, sceneScale: number): Box3 {
  root.updateMatrixWorld(true)

  const box = new Box3()
  const [rx, ry, rz] = normalisation.rotation
  const scale = normalisation.scale * sceneScale
  const normalise = new Matrix4().compose(
    new Vector3(0, 0, 0),
    new Quaternion().setFromEuler(new Euler(rx, ry, rz, 'XYZ')),
    new Vector3(scale, scale, scale),
  )
  const rootWorldInverse = new Matrix4().copy(root.matrixWorld).invert()
  const relative = new Matrix4()
  const transform = new Matrix4()
  const instance = new Matrix4()
  const point = new Vector3()

  root.traverse((object) => {
    if (!isMesh(object)) return
    const positions = positionsOf(object)
    if (!positions) return

    relative.multiplyMatrices(rootWorldInverse, object.matrixWorld).premultiply(root.matrix)

    if (isInstancedMesh(object)) {
      for (let i = 0, n = object.count; i < n; i++) {
        object.getMatrixAt(i, instance)
        transform.multiplyMatrices(relative, instance).premultiply(normalise)
        expandByVertices(box, positions, transform, point)
      }
      return
    }

    transform.multiplyMatrices(normalise, relative)
    expandByVertices(box, positions, transform, point)
  })

  return box
}

/**
 * Translation (metres, world-aligned) applied OUTSIDE the rotation/scale group
 * so that, per the manifest flags, the measured box rests on y = 0
 * (`alignBottomToGround`) and is centred on x = 0 / z = 0 (`centreFootprint`),
 * plus the manual `normalisation.offset`. An empty box yields the manual
 * offset alone.
 */
export function computeNormalisationOffset(bounds: Box3, normalisation: ModelNormalisation): Vec3 {
  const [ox, oy, oz] = normalisation.offset
  if (bounds.isEmpty()) return [ox, oy, oz]

  const centreX = (bounds.min.x + bounds.max.x) / 2
  const centreZ = (bounds.min.z + bounds.max.z) / 2
  const x = normalisation.centreFootprint ? -centreX : 0
  const z = normalisation.centreFootprint ? -centreZ : 0
  const y = normalisation.alignBottomToGround ? -bounds.min.y : 0

  return [x + ox, y + oy, z + oz]
}

/**
 * One-time preparation of a loaded scene root for the stage: every mesh casts
 * and receives shadows and is frustum-culled. Idempotent; nothing else is
 * touched (materials, textures and names stay as exported).
 */
export function prepareModelScene(root: Object3D): void {
  root.traverse((object) => {
    if (!isMesh(object)) return
    object.castShadow = true
    object.receiveShadow = true
    object.frustumCulled = true
  })
}
