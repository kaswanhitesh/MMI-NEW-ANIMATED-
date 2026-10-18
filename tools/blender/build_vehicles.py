"""
Builds the Scene 01 vehicles — MMIPL puller truck and hydraulic modular trailer —
procedurally in Blender and exports raw GLBs for the gltf-transform pipeline.

Run headless (Blender 4.2+ / bpy 5.x):

    blender --background --python tools/blender/build_vehicles.py -- <out_dir> [font.ttf]
    # or, with the bpy module:  python tools/blender/build_vehicles.py <out_dir> [font.ttf]

Writes <out_dir>/puller-truck.raw.glb, hydraulic-axle-trailer.raw.glb and a .blend of each.
Then compress with scripts/optimize-models.sh (meshopt + instancing).

Conventions (docs/COORDINATE-SYSTEM.md): metres, nose to −X, origin at the footprint
centre on the ground. Blender is Z-up; the glTF exporter converts to Y-up, so
Blender (x, y, z) becomes glTF (x, z, −y). Lateral parts are mirrored, so the sign of y
does not matter for the scene.

Generic heavy-haul shapes only — no manufacturer's cab, grille or badge is reproduced.
"""
import math
import os
import sys

import bpy
from mathutils import Vector

# --------------------------------------------------------------------------- args

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
OUT_DIR = os.path.abspath(argv[0] if argv else 'out')
FONT_PATH = argv[1] if len(argv) > 1 else None
os.makedirs(OUT_DIR, exist_ok=True)

# --------------------------------------------------------------------------- brand palette (mmipl-brand)


def srgb(hex_code):
    """sRGB hex → linear RGBA for Principled BSDF base colour."""
    h = hex_code.lstrip('#')
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, 1.0)


PALETTE = {
    # name: (colour, metallic, roughness)
    'mm_amber': ('#F2B705', 0.0, 0.42),       # hero livery
    'mm_charcoal': ('#2B2F36', 0.15, 0.6),    # chassis, deck, tyres, logo tile
    'mm_steel': ('#8C9299', 0.85, 0.38),      # rims, stacks, fifth wheel, hydraulics
    'mm_glass': ('#121417', 0.0, 0.08),       # cab glazing
    'mm_offwhite': ('#EDEBE4', 0.0, 0.5),     # lettering, lamps
}


def make_materials():
    mats = {}
    for name, (hex_code, metallic, rough) in PALETTE.items():
        m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        m.use_nodes = True
        bsdf = m.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Base Color'].default_value = srgb(hex_code)
        bsdf.inputs['Metallic'].default_value = metallic
        bsdf.inputs['Roughness'].default_value = rough
        m.use_backface_culling = True  # exports doubleSided: false — every mesh here is closed
        mats[name] = m
    return mats


# --------------------------------------------------------------------------- scene helpers


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = 'METRIC'
    bpy.context.scene.unit_settings.scale_length = 1.0


def activate(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def finish(obj, mat, bevel=0.03, segments=2):
    """Assign material, add Bevel + Weighted Normal, apply everything."""
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    activate(obj)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    if bevel > 0:
        b = obj.modifiers.new('Bevel', 'BEVEL')
        b.width = bevel
        b.segments = segments
        b.limit_method = 'ANGLE'
        b.angle_limit = math.radians(35)
        b.harden_normals = True
        bpy.ops.object.modifier_apply(modifier=b.name)
    bpy.ops.object.shade_smooth()
    w = obj.modifiers.new('WeightedNormal', 'WEIGHTED_NORMAL')
    w.keep_sharp = True
    bpy.ops.object.modifier_apply(modifier=w.name)
    return obj


def box(name, x0, x1, y0, y1, z0, z1, mat, bevel=0.03, segments=2):
    """Axis-aligned box from min/max extents (Blender axes: x length, y width, z up)."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
    o = bpy.context.active_object
    o.name = name
    o.scale = (x1 - x0, y1 - y0, z1 - z0)
    return finish(o, mat, min(bevel, 0.45 * min(x1 - x0, y1 - y0, z1 - z0)), segments)


def cyl(name, loc, radius, depth, mat, axis='Z', verts=16, bevel=0.01, segments=1):
    rot = {'X': (0, math.pi / 2, 0), 'Y': (math.pi / 2, 0, 0), 'Z': (0, 0, 0)}[axis]
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    return finish(o, mat, bevel, segments)


def strut(name, p0, p1, radius, mat, verts=10):
    """Cylinder between two points (hydraulic rams, braces)."""
    a, b = Vector(p0), Vector(p1)
    d = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=d.length, location=(a + b) / 2)
    o = bpy.context.active_object
    o.name = name
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    return finish(o, mat, 0, 1)


def prism_x(name, profile_xz, y0, y1, mat, bevel=0.03):
    """Extrudes a convex XZ profile (list of (x, z), CCW seen from −Y) across y0..y1."""
    import bmesh
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    front = [bm.verts.new((x, y0, z)) for x, z in profile_xz]
    back = [bm.verts.new((x, y1, z)) for x, z in profile_xz]
    n = len(profile_xz)
    bm.faces.new(front[::-1])
    bm.faces.new(back)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front[i], front[j], back[j], back[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    return finish(o, mat, bevel)


def text(name, body, size, loc, mat, font=None, extrude=0.008, rot=(math.pi / 2, 0, 0), align='CENTER'):
    """Flat lettering converted to mesh. rot default stands it up facing −Y (the +Z side in glTF)."""
    curve = bpy.data.curves.new(name, 'FONT')
    curve.body = body
    curve.size = size
    curve.extrude = extrude
    curve.align_x = align
    curve.align_y = 'CENTER'
    curve.resolution_u = 3
    if font:
        curve.font = font
    o = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = rot
    activate(o)
    bpy.ops.object.convert(target='MESH')
    o = bpy.context.active_object
    o.data.materials.clear()
    o.data.materials.append(mat)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return o


def join(name, objs, origin=(0, 0, 0)):
    """Joins objects into one mesh named `name` with its origin (pivot) at `origin`."""
    objs = [o for o in objs if o is not None]
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    o.data.name = name
    bpy.context.scene.cursor.location = origin
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    bpy.context.scene.cursor.location = (0, 0, 0)
    return o


def pivot(name, geo, origin, parent):
    """Empty `name` at the hinge with the mesh as its child. Mesh quantization rewrites the
    MESH node's transform on export, so the pivot must live on a parent that has no mesh."""
    geo.name = geo.data.name = f'{name}_geo'  # free the name first, or Blender suffixes the empty '.001'
    e = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(e)
    e.location = origin
    e.parent = parent
    geo.parent = e
    geo.location = (0, 0, 0)  # join() put the mesh origin on the hinge
    return e


def wheel_mesh(name, radius, width, mats, twin_gap=0.0, rim_ratio=0.6, verts=24):
    """One wheel unit (single, or a twin pair when twin_gap > 0), axle along Y, centred at the origin."""
    parts = []
    offsets = [0.0] if twin_gap <= 0 else [-(width + twin_gap) / 2, (width + twin_gap) / 2]
    for i, oy in enumerate(offsets):
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=width, location=(0, oy, 0), rotation=(math.pi / 2, 0, 0))
        tyre = bpy.context.active_object
        finish(tyre, mats['mm_charcoal'], bevel=width * 0.28, segments=2)
        parts.append(tyre)
        # Rim face, only on the outer side(s) a viewer can see.
        if twin_gap <= 0 or i == 0 or i == len(offsets) - 1:
            side = -1 if (twin_gap <= 0 or i == 0) else 1
            for s in ([side] if twin_gap > 0 else [-1, 1]):
                bpy.ops.mesh.primitive_cylinder_add(vertices=verts // 2 + 4, radius=radius * rim_ratio, depth=0.04,
                                                    location=(0, oy + s * (width / 2 - 0.005), 0), rotation=(math.pi / 2, 0, 0))
                rim = bpy.context.active_object
                finish(rim, mats['mm_steel'], bevel=0.008, segments=1)
                parts.append(rim)
                bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=radius * 0.18, depth=0.08,
                                                    location=(0, oy + s * (width / 2 + 0.01), 0), rotation=(math.pi / 2, 0, 0))
                hub = bpy.context.active_object
                finish(hub, mats['mm_steel'], bevel=0.01, segments=1)
                parts.append(hub)
    return join(name, parts)


def place_instance(src, name, loc, parent=None):
    """Linked duplicate (shared mesh data) — becomes one glTF mesh referenced by many nodes."""
    o = bpy.data.objects.new(name, src.data)
    bpy.context.collection.objects.link(o)
    o.location = loc
    if parent:
        o.parent = parent
    return o


def root_empty(name):
    e = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(e)
    return e


def export(name, root):
    for o in bpy.context.scene.objects:
        if o.parent is None and o is not root:
            o.parent = root
    path = os.path.join(OUT_DIR, f'{name}.raw.glb')
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=False,
        export_apply=True,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_materials='EXPORT',
        export_cameras=False,
        export_lights=False,
        export_extras=False,
    )
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT_DIR, f'{name}.blend'))
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in bpy.context.scene.objects if o.type == 'MESH')
    print(f'[build] {name}: {tris} triangles (instances counted) → {path}')


def load_font():
    if FONT_PATH and os.path.exists(FONT_PATH):
        return bpy.data.fonts.load(FONT_PATH)
    return None


# =========================================================================== PULLER TRUCK
# Envelope ≈ 9.5 × 2.9 × 3.9 m. x −4.75 (nose) … +4.75 (tail). Fifth-wheel top at (4.0, 0, 1.3).

PULLER_TYRE_R = 0.52
PULLER_TYRE_W = 0.36


def build_puller():
    reset_scene()
    mats = make_materials()
    font = load_font()
    A, C, S, G, W = (mats[k] for k in ('mm_amber', 'mm_charcoal', 'mm_steel', 'mm_glass', 'mm_offwhite'))
    root = root_empty('puller_truck')
    body = []

    # Chassis rails and cross-members.
    for y in (-0.48, 0.48):
        body.append(box('rail', -4.35, 4.72, y - 0.07, y + 0.07, 0.72, 1.04, C, 0.015))
    body.append(box('rear_xmember', 4.55, 4.75, -1.1, 1.1, 0.62, 1.0, C, 0.03))
    # Rear lamp bar on the tail cross-member.
    for y in (-0.95, 0.95):
        body.append(box('tail_lamp', 4.74, 4.78, y - 0.14, y + 0.14, 0.78, 0.9, W, 0.01, 1))

    # Heavy push bumper, nose at −4.75.
    body.append(box('bumper', -4.75, -4.45, -1.35, 1.35, 0.42, 0.98, C, 0.05))
    body.append(box('bumper_plate', -4.76, -4.70, -0.9, 0.9, 0.55, 0.85, S, 0.02, 1))

    # Bonnet (generic wedge, no maker's grille) and grille frame.
    hood = [(-4.5, 1.02), (-2.35, 1.02), (-2.35, 2.32), (-4.1, 2.18), (-4.5, 2.0)]
    body.append(prism_x('hood', hood, -0.98, 0.98, A, 0.06))
    body.append(box('grille', -4.53, -4.46, -0.78, 0.78, 1.15, 1.95, C, 0.02, 1))
    for z in (1.3, 1.5, 1.7):
        body.append(box('grille_bar', -4.56, -4.5, -0.7, 0.7, z - 0.03, z + 0.03, S, 0.01, 1))
    for y in (-1.05, 1.05):
        body.append(box('headlamp', -4.55, -4.42, y - 0.22, y + 0.22, 1.08, 1.26, W, 0.02, 1))
    # Front fenders over steer axle 1 (single wheels).
    for sgn in (-1, 1):
        f = [(-4.25, 0.98), (-2.45, 0.98), (-2.45, 1.18), (-2.8, 1.45), (-3.9, 1.45), (-4.25, 1.2)]
        y0, y1 = sorted((sgn * 0.98, sgn * 1.42))
        body.append(prism_x('fender', f, y0, y1, A, 0.04))

    # Cab: body, roof, glazing, sun visor, steps.
    cab = [(-2.4, 1.15), (-0.25, 1.15), (-0.25, 3.45), (-1.75, 3.45), (-2.4, 2.45)]
    body.append(prism_x('cab', cab, -1.25, 1.25, A, 0.07))
    body.append(box('roof_pod', -1.7, -0.35, -1.05, 1.05, 3.43, 3.62, A, 0.06))
    body.append(box('visor', -1.95, -1.65, -1.2, 1.2, 3.3, 3.42, C, 0.02, 1))
    for y in (-0.7, 0.0, 0.7):
        body.append(box('roof_lamp', -1.72, -1.62, y - 0.12, y + 0.12, 3.48, 3.58, W, 0.01, 1))
    # Windscreen on the sloped face (thin slab following the cab's front slope).
    ws = [(-2.42, 2.55), (-2.37, 2.5), (-1.79, 3.32), (-1.84, 3.37)]
    body.append(prism_x('windscreen', ws, -1.12, 1.12, G, 0.0))
    for sgn in (-1, 1):
        y0, y1 = sorted((sgn * 1.25, sgn * 1.27))
        body.append(box('side_window', -1.75, -0.65, y0, y1, 2.4, 3.2, G, 0.0, 1))
        body.append(box('door_line', -1.85, -0.55, y0, y1, 1.3, 1.32, C, 0.0, 1))
        # Mirror arm and head.
        body.append(box('mirror_arm', -2.35, -2.25, sgn * 1.25 - 0.03, sgn * 1.55 + 0.03, 2.75, 2.8, C, 0.01, 1))
        body.append(box('mirror', -2.38, -2.24, sgn * 1.5 - 0.08, sgn * 1.5 + 0.08, 2.35, 2.95, C, 0.02, 1))
        # Cab steps.
        y0, y1 = sorted((sgn * 1.0, sgn * 1.3))
        body.append(box('step', -2.0, -1.2, y0, y1, 0.78, 0.86, S, 0.01, 1))
        body.append(box('step', -2.0, -1.2, y0, y1, 1.02, 1.08, S, 0.01, 1))

    # MMIPL logo tile on each door: black tile, white MEGA / MOVE (mmipl-brand §6).
    for sgn in (-1, 1):
        y0, y1 = sorted((sgn * 1.25, sgn * 1.262))
        body.append(box('logo_tile', -1.7, -0.75, y0, y1, 1.55, 2.2, C, 0.0, 1))
        ty = sgn * 1.268
        rot = (math.pi / 2, 0, 0) if sgn < 0 else (math.pi / 2, 0, math.pi)
        for line, z in (('MEGA', 2.0), ('MOVE', 1.75)):
            body.append(text('logo_' + line, line, 0.26, (-1.225, ty, z), W, font, 0.004, rot))

    # Exhaust stacks and air intakes behind the cab.
    for y in (-1.08, 1.08):
        body.append(cyl('stack', (-0.08, y, 2.45), 0.09, 2.9, S, 'Z', 12))
        body.append(cyl('stack_heat_shield', (-0.08, y, 2.3), 0.12, 0.9, C, 'Z', 12))
        body.append(cyl('air_intake', (-0.42, y * 1.08, 2.6), 0.17, 1.3, C, 'Z', 14, 0.03))
    # Fuel tanks and battery box between the axle groups.
    for y in (-0.95, 0.95):
        body.append(cyl('fuel_tank', (0.75, y, 0.78), 0.32, 1.6, S, 'X', 16, 0.04))
    # Rear mudguards (outside the fifth-wheel plate, z ≤ 1.15).
    for sgn in (-1, 1):
        y0, y1 = sorted((sgn * 0.9, sgn * 1.45))
        body.append(box('mudguard', 2.15, 4.75, y0, y1, 1.08, 1.13, C, 0.015, 1))
    # Ballast / tool box behind the cab carries the second logo.
    body.append(box('ballast_box', -0.2, 1.55, -1.1, 1.1, 1.04, 1.95, C, 0.05))
    for sgn in (-1, 1):
        ty = sgn * 1.112
        rot = (math.pi / 2, 0, 0) if sgn < 0 else (math.pi / 2, 0, math.pi)
        body.append(text('ballast_mmipl', 'MEGA MOVE INDIA', 0.24, (0.68, ty, 1.5), W, font, 0.004, rot))
    # Amber stripe along the chassis side.
    for sgn in (-1, 1):
        y0, y1 = sorted((sgn * 0.55, sgn * 0.57))
        body.append(box('chassis_stripe', -2.3, 4.6, y0, y1, 0.86, 0.94, A, 0.0, 1))

    puller_body = join('puller_body', body)
    puller_body.parent = root

    # Fifth wheel: separate object, pivot at the coupling point (plate top centre).
    fw = [
        cyl('fw_plate', (4.0, 0, 1.22), 0.82, 0.16, S, 'Z', 24, 0.03),
        box('fw_mount', 3.35, 4.65, -0.62, 0.62, 1.03, 1.14, C, 0.02),
        box('fw_throat', 4.3, 4.74, -0.12, 0.12, 1.25, 1.31, C, 0.01, 1),
    ]
    pivot('fifth_wheel', join('fifth_wheel', fw, origin=(4.0, 0, 1.3)), (4.0, 0, 1.3), root)

    # Wheels: one single-wheel mesh (steer axles) and one twin-wheel mesh (drive tandem), linked.
    single = wheel_mesh('wheel_single', PULLER_TYRE_R, PULLER_TYRE_W, mats)
    twin = wheel_mesh('wheel_twin', PULLER_TYRE_R, PULLER_TYRE_W - 0.04, mats, twin_gap=0.04)
    single.location = (-3.45, -1.17, PULLER_TYRE_R)
    single.name = 'wheel_steer1_L'
    single.parent = root
    twin.location = (2.85, -1.06, PULLER_TYRE_R)
    twin.name = 'wheel_drive1_L'
    twin.parent = root
    for name, x in (('steer1', -3.45), ('steer2', -2.05)):
        for side, y in (('L', -1.17), ('R', 1.17)):
            n = f'wheel_{name}_{side}'
            if n != single.name:
                place_instance(single, n, (x, y, PULLER_TYRE_R), root)
    for name, x in (('drive1', 2.85), ('drive2', 4.2)):
        for side, y in (('L', -1.06), ('R', 1.06)):
            n = f'wheel_{name}_{side}'
            if n != twin.name:
                place_instance(twin, n, (x, y, PULLER_TYRE_R), root)
    # Axle beams.
    axles = [cyl('axle', (x, 0, PULLER_TYRE_R), 0.09, 2.0, C, 'Y', 10) for x in (-3.45, -2.05, 2.85, 4.2)]
    axle_obj = join('axles', axles)
    axle_obj.parent = root

    export('puller-truck', root)


# =========================================================================== HYDRAULIC MODULAR TRAILER
# Envelope ≈ 18 × 3.0 × 1.9 m. x −9 (gooseneck nose) … +9 (tail). Kingpin pad underside at (−8.3, 0, 1.3).
# Deck top 1.2 (= config loading.cargo.trailerDeckTop). Axle lines centred at x ≈ 2.25 so the
# kingpin → axle-group distance matches departure.trailerTrackingLength (10.55).

T_TYRE_R = 0.4
T_TYRE_W = 0.2
AXLE_LINES = 8
AXLE_X0 = -3.0
AXLE_PITCH = 1.5
DECK_FRONT = -5.75
DECK_REAR = 9.0
DECK_TOP = 1.2
DECK_BOTTOM = 0.78
KINGPIN = (-8.3, 0.0, 1.3)
GOOSENECK_HINGE = (-5.75, 0.0, 1.0)


def build_trailer():
    reset_scene()
    mats = make_materials()
    font = load_font()
    A, C, S, W = (mats[k] for k in ('mm_amber', 'mm_charcoal', 'mm_steel', 'mm_offwhite'))
    root = root_empty('hydraulic_axle_trailer')
    deck = []

    # Modular platform: top plate, side beams (amber-deep reads as amber at distance), module joints.
    deck.append(box('deck_plate', DECK_FRONT, DECK_REAR, -1.5, 1.5, DECK_TOP - 0.06, DECK_TOP, C, 0.02))
    deck.append(box('deck_spine', DECK_FRONT, DECK_REAR, -0.55, 0.55, DECK_BOTTOM, DECK_TOP - 0.05, C, 0.03))
    for sgn in (-1, 1):
        y0, y1 = sorted((sgn * 1.36, sgn * 1.5))
        deck.append(box('side_beam', DECK_FRONT, DECK_REAR, y0, y1, DECK_BOTTOM + 0.04, DECK_TOP - 0.05, A, 0.025))
        # Lashing points along the side beam.
        for i in range(12):
            x = DECK_FRONT + 0.6 + i * (DECK_REAR - DECK_FRONT - 1.2) / 11
            yo = sgn * 1.51
            deck.append(box('lashing', x - 0.06, x + 0.06, min(yo, yo + sgn * 0.03), max(yo, yo + sgn * 0.03), 0.96, 1.08, C, 0.0, 1))
        # Lettering on the side beam.
        ty = sgn * 1.505
        rot = (math.pi / 2, 0, 0) if sgn < 0 else (math.pi / 2, 0, math.pi)
        deck.append(text('deck_name', 'MEGA MOVE INDIA', 0.24, (1.6, ty, 0.955), C, font, 0.003, rot))
    # Module joints (three 6-line modules read as 2 + 3 + 3 axle lines).
    for x in (-0.75, 3.75):
        for sgn in (-1, 1):
            y0, y1 = sorted((sgn * 1.495, sgn * 1.515))
            deck.append(box('module_joint', x - 0.04, x + 0.04, y0, y1, DECK_BOTTOM + 0.04, DECK_TOP - 0.05, C, 0.0, 1))
    # Tail: rear beam and lamps.
    deck.append(box('tail_beam', DECK_REAR - 0.18, DECK_REAR, -1.5, 1.5, DECK_BOTTOM, DECK_TOP, C, 0.03))
    for y in (-1.15, -0.85, 0.85, 1.15):
        deck.append(box('tail_lamp', DECK_REAR, DECK_REAR + 0.03, y - 0.1, y + 0.1, 0.92, 1.04, W, 0.0, 1))
    # Power pack on the deck front (the gooseneck's hydraulic supply).
    deck.append(box('power_pack', DECK_FRONT + 0.15, DECK_FRONT + 1.15, -1.2, 1.2, DECK_TOP, DECK_TOP + 0.55, A, 0.05))
    deck.append(box('power_pack_grille', DECK_FRONT + 0.3, DECK_FRONT + 1.0, -1.205, -1.19, DECK_TOP + 0.12, DECK_TOP + 0.45, C, 0.0, 1))
    trailer_deck = join('trailer_deck', deck)
    trailer_deck.parent = root

    # Gooseneck: separate object, pivot on the hinge at the deck front.
    gn = []
    kx, _, kz = KINGPIN
    # Head (sits on the fifth wheel) — top at 1.85 to stay inside the 1.9 m envelope.
    gn.append(box('gn_head', -9.0, kx + 0.75, -0.9, 0.9, kz + 0.05, 1.85, A, 0.06))
    gn.append(cyl('kingpin_pad', (kx, 0, kz + 0.03), 0.42, 0.06, S, 'Z', 20, 0.01))
    gn.append(cyl('kingpin', (kx, 0, kz - 0.05), 0.08, 0.12, S, 'Z', 10, 0.0))
    # Neck: one sloping box girder from the head down to the hinge.
    prof = [(kx + 0.7, kz + 0.06), (GOOSENECK_HINGE[0] + 0.05, DECK_BOTTOM + 0.02),
            (GOOSENECK_HINGE[0] + 0.05, DECK_TOP - 0.05), (kx + 0.7, 1.85)]
    gn.append(prism_x('gn_girder', prof, -0.8, 0.8, A, 0.04))
    # Hydraulic gooseneck rams (deck front → head).
    for sgn in (-1, 1):
        gn.append(strut('gn_ram', (GOOSENECK_HINGE[0] + 0.1, sgn * 0.95, 1.12), (kx + 0.85, sgn * 0.82, 1.62), 0.07, S))
        gn.append(strut('gn_ram_body', (GOOSENECK_HINGE[0] + 0.1, sgn * 0.95, 1.12), (kx + 1.9, sgn * 0.9, 1.4), 0.1, C))
    # Hinge barrel.
    gn.append(cyl('gn_hinge', GOOSENECK_HINGE, 0.12, 1.6, S, 'Y', 12))
    # Logo tile on the head front face.
    gn.append(box('gn_logo_tile', -9.02, -9.0, -0.4, 0.4, 1.42, 1.78, C, 0.0, 1))
    for line, z in (('MEGA', 1.67), ('MOVE', 1.52)):
        gn.append(text('gn_logo_' + line, line, 0.13, (-9.025, 0, z), W, font, 0.003, (math.pi / 2, 0, -math.pi / 2)))
    pivot('gooseneck', join('gooseneck', gn, origin=GOOSENECK_HINGE), GOOSENECK_HINGE, root)

    # Running gear: per axle line two pendulum bogies (L / R), each with two twin-wheel sets.
    bogie_parts = [
        box('turntable', -0.32, 0.32, -0.32, 0.32, DECK_BOTTOM - 0.06, DECK_BOTTOM, S, 0.01, 1),
        cyl('susp_cyl', (0, 0, (T_TYRE_R + DECK_BOTTOM) / 2 + 0.02), 0.14, DECK_BOTTOM - T_TYRE_R - 0.04, S, 'Z', 12),
        box('pendulum', -0.16, 0.16, -0.45, 0.45, T_TYRE_R - 0.08, T_TYRE_R + 0.12, C, 0.02),
    ]
    bogie = join('bogie', bogie_parts)  # mesh name = instanced batch name after optimize
    twin = wheel_mesh('wheel_twin', T_TYRE_R, T_TYRE_W, mats, twin_gap=0.03, rim_ratio=0.55, verts=20)
    bogie_y, twin_dy = 0.85, 0.42
    for i in range(AXLE_LINES):
        x = AXLE_X0 + i * AXLE_PITCH
        for side, sgn in (('L', -1), ('R', 1)):
            by = sgn * bogie_y
            n = f'bogie_{i + 1}_{side}'
            if i == 0 and side == 'L':
                bogie.name = n
                bogie.location = (x, by, 0)
                bogie.parent = root
            else:
                place_instance(bogie, n, (x, by, 0), root)
            # in = towards the centre line, out = towards the side beam
            for pos, wy in (('in', by - sgn * twin_dy), ('out', by + sgn * twin_dy)):
                n = f'wheel_{i + 1}_{side}_{pos}'
                loc = (x, wy, T_TYRE_R)
                if i == 0 and side == 'L' and pos == 'in':
                    twin.name = n
                    twin.location = loc
                    twin.parent = root
                else:
                    place_instance(twin, n, loc, root)

    export('hydraulic-axle-trailer', root)


if __name__ == '__main__':
    build_puller()
    build_trailer()
