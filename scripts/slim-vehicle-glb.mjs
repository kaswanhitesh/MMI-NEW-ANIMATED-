// Turns a raw Blender export into the GLB served from public/models/, tuned for Scene 01's frame rate:
//   node scripts/slim-vehicle-glb.mjs <in.raw.glb> <out.glb> [--keep <regex>] [--simplify <regex>]
// 1. Materials lose their clearcoat / specular / anisotropy / emissive-strength extensions, so three.js uses
//    MeshStandardMaterial instead of the much heavier MeshPhysicalMaterial (emissive is capped at 1).
// 2. Static parts are baked into world space and joined per material: one draw call per material instead of
//    one per part. Nodes whose name matches --keep (moving parts: wheels, hitches, towbar, pendulum arms) stay
//    as they are, so they can still be animated.
// 3. Meshes of nodes matching --simplify are decimated (wheels, hoses, big box assemblies).
// 4. Meshes used 3+ times (wheels, pendulum arms) become EXT_mesh_gpu_instancing batches named <mesh>_x<count>;
//    the two hitch assemblies stay separate pivots. Then WebP textures, quantize + meshopt.
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, instance, joinPrimitives, meshopt, prune, quantize, simplifyPrimitive, textureCompress, transformPrimitive, weld } from '@gltf-transform/functions'
import sharp from 'sharp'
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'

const args = process.argv.slice(2)
const [input, output] = args
const opt = (flag, dflt) => { const i = args.indexOf(flag); return i >= 0 ? new RegExp(args[i + 1]) : dflt }
const KEEP = opt('--keep', /wheel|coupling|towbar|pendulum|_root$/)
const SIMPLIFY = opt('--simplify', /wheel|hose|module|power_pack|pillars|pendulum/)
const MAT_EXTS = new Set(['KHR_materials_clearcoat', 'KHR_materials_specular', 'KHR_materials_anisotropy', 'KHR_materials_emissive_strength', 'KHR_materials_ior', 'KHR_materials_sheen'])

await MeshoptDecoder.ready; await MeshoptEncoder.ready; await MeshoptSimplifier.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder })
const doc = await io.read(input)
const root = doc.getRoot()
const before = { draws: 0, tris: 0 }
const countDraws = () => { let d = 0, t = 0; for (const n of root.listNodes()) { const m = n.getMesh(); if (!m) continue; for (const p of m.listPrimitives()) { d++; t += p.getIndices().getCount() / 3 } } return { draws: d, tris: Math.round(t) } }
Object.assign(before, countDraws())

// 1. plain standard materials
for (const m of root.listMaterials()) {
  for (const e of m.listExtensions()) if (MAT_EXTS.has(e.extensionName)) e.dispose()
  const em = m.getEmissiveFactor(); if (em.some((v) => v > 1)) m.setEmissiveFactor(em.map((v) => Math.min(v, 1)))
}
for (const e of root.listExtensionsUsed()) if (MAT_EXTS.has(e.extensionName)) e.dispose()

// 3. targeted simplification (before joining, while the meshes are still per part)
const simplified = new Set()
for (const n of root.listNodes()) {
  const mesh = n.getMesh(); if (!mesh || !SIMPLIFY.test(n.getName()) || simplified.has(mesh)) continue
  simplified.add(mesh)
  for (const p of mesh.listPrimitives()) simplifyPrimitive(p, { simplifier: MeshoptSimplifier, ratio: 0.45, error: 0.004, lockBorder: true })
}

// 2. join the static parts per material, in world space, under one node
const scene = root.listScenes()[0]
const staticNodes = root.listNodes().filter((n) => n.getMesh() && !KEEP.test(n.getName()) && !n.listChildren().length)
const byMaterial = new Map()
for (const n of staticNodes) {
  const world = n.getWorldMatrix()
  for (const p of n.getMesh().listPrimitives()) {
    const clone = p.clone(); transformPrimitive(clone, world)
    const key = clone.getMaterial(); if (!byMaterial.has(key)) byMaterial.set(key, []); byMaterial.get(key).push(clone)
  }
}
const rootNode = scene.listChildren()[0]
const staticParent = doc.createNode(`${rootNode.getName().replace(/_root$/, '')}_static`); rootNode.addChild(staticParent)
for (const [mat, prims] of byMaterial) {
  const joined = prims.length > 1 ? joinPrimitives(prims) : prims[0]
  for (const p of prims) if (p !== joined) p.dispose()
  const mesh = doc.createMesh(`static_${mat.getName()}`).addPrimitive(joined)
  staticParent.addChild(doc.createNode(`static_${mat.getName()}`).setMesh(mesh))
}
for (const n of staticNodes) n.dispose()

// 4. instancing, cleanup, compression
await doc.transform(prune(), dedup(), weld(), instance({ min: 3 }), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024] }), quantize(), meshopt({ encoder: MeshoptEncoder, level: 'high' }))
for (const n of root.listNodes()) {
  const inst = n.getExtension('EXT_mesh_gpu_instancing')
  if (inst && !n.getName()) n.setName(`${n.getMesh().getName()}_x${inst.getAttribute('TRANSLATION').getCount()}`)
}
await io.write(output, doc)
const after = countDraws()
const fs = await import('node:fs')
console.log(JSON.stringify({ output, bytes: fs.statSync(output).size, before, after, instancedBatches: root.listNodes().filter((n) => n.getExtension('EXT_mesh_gpu_instancing')).length, materials: root.listMaterials().length, physicalExts: root.listExtensionsUsed().map((e) => e.extensionName).filter((x) => MAT_EXTS.has(x)) }))
