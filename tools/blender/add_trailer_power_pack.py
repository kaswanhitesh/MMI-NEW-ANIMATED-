"""Adds the hydraulic power pack unit to the modular trailer (scene MMI_Trailer_Modular) and saves the .blend.

    blender --background art/blender/mmi-tractor-detailed.blend --python tools/blender/add_trailer_power_pack.py [-- render.png]

Grey cabinet on the left rear corner behind the end plate: gauge panel, control levers, lamp cluster on its
inner face, breather pipe, mounting brackets and three hoses to the frame. Re-runnable (replaces the object).
"""
import bpy, bmesh, math, sys, os
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
sc = bpy.data.scenes['MMI_Trailer_Modular']
T = bpy.data.collections['MMI_Trailer_Modular']
root = bpy.data.objects['MMI_Trailer_Modular_root']
M = {m.name: m for m in bpy.data.materials}
GREY = M.get('mmi_ppu_grey') or bpy.data.materials.new('mmi_ppu_grey')
if not GREY.use_nodes: GREY.use_nodes = True
b = next(n for n in GREY.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
b.inputs['Base Color'].default_value = (0.055, 0.06, 0.068, 1); b.inputs['Metallic'].default_value = 0.2; b.inputs['Roughness'].default_value = 0.55
GREY.use_backface_culling = True
RED, DK, CH, WF, RL, AL, BP = (M[k] for k in ('mmi_trailer_red', 'mmi_trailer_dark_steel', 'mmi_chrome', 'mmi_plate_white', 'mmi_lens_red', 'mmi_lens_amber', 'mmi_black_plastic'))
WHITE_LENS = M['mmi_lens_clear']

bm = bmesh.new(); mats = []
def mi(m):
    if m not in mats: mats.append(m)
    return mats.index(m)
def tag(faces, m):
    for f in faces: f.material_index = mi(m)
def box(x0, x1, y0, y1, z0, z1, m):
    x0, x1 = sorted((x0, x1)); y0, y1 = sorted((y0, y1)); z0, z1 = sorted((z0, z1))
    r = bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)) @ Matrix.Diagonal((x1 - x0, y1 - y0, z1 - z0, 1)))
    tag({f for v in r['verts'] for f in v.link_faces}, m)
def cyl(c, r, depth, axis, m, segs=16):
    a = Vector(axis).normalized(); q = Vector((0, 0, 1)).rotation_difference(a)
    mtx = Matrix.Translation(Vector(c)) @ q.to_matrix().to_4x4()
    res = bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r, radius2=r, depth=depth, matrix=mtx)
    tag({f for v in res['verts'] for f in v.link_faces}, m)
def tube(path, r, m, segs=8):
    P = [Vector(p) for p in path]; rings = []
    for i, p in enumerate(P):
        t = (P[min(i + 1, len(P) - 1)] - P[max(i - 1, 0)]).normalized()
        u = t.cross(Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))).normalized(); v = t.cross(u)
        rings.append([bm.verts.new(p + (u * math.cos(2 * math.pi * k / segs) + v * math.sin(2 * math.pi * k / segs)) * r) for k in range(segs)])
    fs = []
    for a, bb in zip(rings[:-1], rings[1:]):
        for k in range(segs):
            fs.append(bm.faces.new((a[k], a[(k + 1) % segs], bb[(k + 1) % segs], bb[k])))
    fs.append(bm.faces.new(rings[0][::-1])); fs.append(bm.faces.new(rings[-1])); tag(fs, m)

# ---- cabinet behind the end plate (deck coordinates: rear end plate face at x 18.42, deck top 1.20)
X0, X1 = 18.46, 18.98          # cabinet depth 0.52
Y0, Y1 = -1.48, -0.62          # left corner, 0.86 wide
Z0, Z1 = 0.34, 1.16
box(X0, X1, Y0, Y1, Z0, Z1, GREY)
box(X0 - 0.004, X1 + 0.004, Y0 - 0.004, Y1 + 0.004, Z1 - 0.05, Z1 + 0.004, RED)          # red cap rail
for xa, xb in ((X0 - 0.004, X0 + 0.03), (X1 - 0.03, X1 + 0.004)):                         # red corner posts (edges only)
    box(xa, xb, Y0 - 0.004, Y0 + 0.03, Z0 - 0.004, Z1, RED); box(xa, xb, Y1 - 0.03, Y1 + 0.004, Z0 - 0.004, Z1, RED)
box(X0 - 0.004, X1 + 0.004, Y0 - 0.004, Y1 + 0.004, Z0 - 0.004, Z0 + 0.04, RED)            # red sill
box(X1 + 0.004, X1 + 0.012, Y0 + 0.06, Y1 - 0.06, Z0 + 0.06, Z1 - 0.08, DK)                # recessed rear panel
for k in range(4):                                                                           # four gauges
    y = Y0 + 0.16 + k * 0.18
    cyl((X1 + 0.02, y, 1.02), 0.058, 0.02, (1, 0, 0), CH, 20)
    cyl((X1 + 0.031, y, 1.02), 0.046, 0.004, (1, 0, 0), WF, 20)
    cyl((X1 + 0.034, y, 1.02), 0.008, 0.004, (1, 0, 0), DK, 8)
for k in range(5):                                                                           # control levers
    y = Y0 + 0.13 + k * 0.15
    box(X1 + 0.012, X1 + 0.06, y - 0.025, y + 0.025, 0.56, 0.86, DK)
    tube([(X1 + 0.04, y, 0.80), (X1 + 0.16, y, 0.70), (X1 + 0.26, y, 0.56)], 0.009, CH, 8)
    cyl((X1 + 0.27, y, 0.545), 0.018, 0.04, (0.6, 0, -0.8), BP, 10)
box(X1 + 0.012, X1 + 0.03, Y0 + 0.10, Y1 - 0.10, 0.44, 0.50, RED)                          # lower red strip with couplings
for k in range(3): cyl((X1 + 0.04, Y0 + 0.22 + k * 0.21, 0.47), 0.02, 0.04, (1, 0, 0), CH, 10)
# lamp cluster on the inner face, looking rearward
box(X1 - 0.02, X1 + 0.03, Y1 + 0.004, Y1 + 0.12, 0.62, 1.08, BP)
for z0, z1, m in ((0.64, 0.76, WHITE_LENS), (0.78, 0.90, AL), (0.92, 1.06, RL)): box(X1 + 0.03, X1 + 0.036, Y1 + 0.014, Y1 + 0.11, z0, z1, m)
# breather / exhaust pipe and filler cap on top
tube([(X0 + 0.12, Y0 + 0.16, Z1), (X0 + 0.12, Y0 + 0.16, Z1 + 0.22), (X0 + 0.06, Y0 + 0.16, Z1 + 0.30)], 0.022, DK, 10)
cyl((X0 + 0.36, Y1 - 0.18, Z1 + 0.015), 0.05, 0.03, (0, 0, 1), DK, 14)
# mounting brackets to the end plate and hoses down to the frame
for z in (0.50, 1.04):
    box(18.42, X0 + 0.01, Y0 + 0.08, Y0 + 0.16, z - 0.04, z + 0.04, DK); box(18.42, X0 + 0.01, Y1 - 0.16, Y1 - 0.08, z - 0.04, z + 0.04, DK)
for k, y in enumerate((-1.30, -1.12, -0.94)):
    tube([(X1 + 0.03, y, 0.47), (X1 + 0.20, y, 0.43), (X1 + 0.18, y + 0.04, 0.28), (18.34, y + 0.10, 0.40), (18.44, y + 0.12, 0.84), (18.40, y + 0.12, 0.92)], 0.014, BP, 8)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
for e in bm.edges: e.smooth = not (len(e.link_faces) == 2 and e.calc_face_angle(0) > math.radians(30))
me = bpy.data.meshes.new('trailer_power_pack'); bm.to_mesh(me); bm.free()
for m in mats: me.materials.append(m)
me.shade_smooth()
old = bpy.data.objects.get('trailer_power_pack')
if old: bpy.data.objects.remove(old, do_unlink=True)
o = bpy.data.objects.new('trailer_power_pack', me); T.objects.link(o)
sc.view_layers[0].update()
o.parent = root; o.matrix_parent_inverse = Matrix.Identity(4); o.matrix_world = Matrix.Identity(4)   # built in deck/world coordinates
bv = o.modifiers.new('Bevel', 'BEVEL'); bv.width = 0.004; bv.segments = 2; bv.limit_method = 'ANGLE'; bv.angle_limit = math.radians(35); bv.use_clamp_overlap = True
wn = o.modifiers.new('WeightedNormal', 'WEIGHTED_NORMAL'); wn.keep_sharp = True
sc.view_layers[0].update()
print('[ppu] world bbox', [tuple(round(c, 3) for c in (o.matrix_world @ Vector(v))) for v in (o.bound_box[0], o.bound_box[6])])
bpy.ops.wm.save_mainfile()
print('[ppu] saved', bpy.data.filepath)
if argv:
    cam = bpy.data.objects['cam_rear']; cam.location = (24.5, -5.5, 2.6); cam.data.lens = 50
    cam.rotation_euler = (Vector((18.3, -0.7, 0.8)) - Vector(cam.location)).to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam; sc.render.resolution_x, sc.render.resolution_y = 1600, 1000; sc.render.resolution_percentage = 100
    sc.eevee.taa_render_samples = 64; sc.render.filepath = argv[0]
    bpy.ops.render.render(write_still=True, scene=sc.name); print('[ppu] rendered', argv[0])
