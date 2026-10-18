"""Headless export of the modular trailer from art/blender/mmi-tractor-detailed.blend.

    blender --background art/blender/mmi-tractor-detailed.blend --python tools/blender/export_trailer.py -- out.raw.glb

Removes the other scenes so the trailer scene is the context, puts the root empty at the origin, selects the
MMI_Trailer_Modular collection and exports it (+Y up, modifiers applied). Compress the result with gltf-transform
as described in public/models/README.md. The .blend is not saved.
"""
import bpy, os, sys
out = sys.argv[sys.argv.index('--') + 1]
sc = bpy.data.scenes['MMI_Trailer_Modular']
for s in list(bpy.data.scenes):
    if s is not sc: bpy.data.scenes.remove(s)
vl = bpy.context.view_layer
assert bpy.context.scene is sc, bpy.context.scene.name
T = bpy.data.collections['MMI_Trailer_Modular']
root = bpy.data.objects['MMI_Trailer_Modular_root']; root.location = (0, 0, 0); vl.update()
for ob in vl.objects: ob.select_set(False)
for ob in T.all_objects: ob.select_set(True)
print('[export] selected', len([o for o in vl.objects if o.select_get()]), 'objects; eye at', tuple(round(v, 3) for v in bpy.data.objects['trailer_towbar_eye'].matrix_world.translation))
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_cameras=False, export_lights=False,
                          export_extras=False, export_materials='EXPORT', export_texcoords=False, export_normals=True)
print('[export] wrote', out, os.path.getsize(out))
