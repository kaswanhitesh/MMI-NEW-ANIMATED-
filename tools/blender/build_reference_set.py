"""
Reference set: ballast tractor + 11-line modular trailer (drawbar) + pressure vessel,
modelled to the proportions of the side-view reference image (2000 px wide, ground at
py 680, scale K = 0.0125 m/px). Image left = −X (vehicle nose), image up = +Z.

    python tools/blender/build_reference_set.py <out_dir> [Anton-Regular.ttf]

Writes ballast-tractor / modular-trailer / pressure-vessel .raw.glb + .blend, and preview
renders (side view matching the reference, plus a three-quarter view).

No manufacturer marks: the reference's cab badge and trailer name plates are replaced
by MMIPL lettering, and the cab front is a generic cab-over face.
"""
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_vehicles as bv  # noqa: E402  (helpers: box, cyl, prism_x, text, join, wheel_mesh, place_instance, strut, pivot)

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
OUT_DIR = os.path.abspath(argv[0] if argv else 'out')
FONT_PATH = argv[1] if len(argv) > 1 else None
os.makedirs(OUT_DIR, exist_ok=True)

K = 0.0125          # metres per reference pixel
GROUND_PY = 680


def X(px):
    return px * K


def Z(py):
    return (GROUND_PY - py) * K


def P(px, py):
    return (X(px), Z(py))


# --------------------------------------------------------------------------- materials (≤ 5 per asset)

COLOURS = {
    # tractor
    'tr_yellow': ('#D2A21C', 0.0, 0.38),
    'tr_dark': ('#16181B', 0.1, 0.35),      # bumper, grille, glass, chassis, tyres, logo tile
    'tr_grey': ('#6E7177', 0.1, 0.55),      # ballast box
    'tr_steel': ('#B9BEC4', 0.9, 0.25),     # tank, rims, steps
    'tr_white': ('#EDEBE4', 0.0, 0.5),      # lettering, lamps
    # trailer
    'mt_red': ('#C3262B', 0.05, 0.42),
    'mt_dark': ('#1B1D20', 0.1, 0.6),
    'mt_steel': ('#A9AEB4', 0.85, 0.32),
    'mt_white': ('#EDEBE4', 0.0, 0.5),
    # vessel
    'pv_shell': ('#5C6066', 0.35, 0.5),
    'pv_trim': ('#3D4045', 0.5, 0.45),
    'pv_steel': ('#8F949A', 0.85, 0.35),
}


def materials():
    mats = {}
    for name, (hex_code, metallic, rough) in COLOURS.items():
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = bv.srgb(hex_code)
        b.inputs['Metallic'].default_value = metallic
        b.inputs['Roughness'].default_value = rough
        m.use_backface_culling = True
        mats[name] = m
    return mats


def use_collection(name):
    coll = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(coll)
    bpy.context.view_layer.active_layer_collection = bpy.context.view_layer.layer_collection.children[name]
    return coll


def both_sides_text(name, body, size, x, y_abs, z, mat, font):
    """Lettering on the −Y face (reference side) and mirrored-readable on the +Y face."""
    a = bv.text(name, body, size, (x, -y_abs, z), mat, font, 0.004, (math.pi / 2, 0, 0))
    b = bv.text(name, body, size, (x, y_abs, z), mat, font, 0.004, (math.pi / 2, 0, math.pi))
    return [a, b]


# =========================================================================== BALLAST TRACTOR (6x4, cab-over)

def build_tractor(M, font):
    Y, D, G, S, W = (M[k] for k in ('tr_yellow', 'tr_dark', 'tr_grey', 'tr_steel', 'tr_white'))
    use_collection('ballast_tractor')
    body = []
    half = 1.25

    # Cab shell: vertical front, sloped windscreen, flat roof.
    cab = [P(10, 595), P(245, 595), P(245, 398), P(48, 398), P(14, 470)]
    body.append(bv.prism_x('cab', cab, -half, half, Y, 0.08))
    # Roof air deflector.
    spoiler = [P(150, 398), P(245, 398), P(245, 362), P(205, 362)]
    body.append(bv.prism_x('roof_deflector', spoiler, -1.12, 1.12, Y, 0.06))
    # Windscreen (glass slab proud of the sloped face).
    ws = [P(13, 474), P(18, 476), P(51, 402), P(46, 400)]
    body.append(bv.prism_x('windscreen', ws, -1.12, 1.12, D, 0.0))
    # Front face: dark grille panel, lamps, bumper, lower step.
    body.append(bv.box('grille', X(6), X(11), -0.85, 0.85, Z(588), Z(482), D, 0.02, 1))
    for y in (-0.98, 0.98):
        body.append(bv.box('headlamp', X(5), X(12), y - 0.22, y + 0.22, Z(585), Z(562), W, 0.02, 1))
    body.append(bv.box('bumper', X(0), X(32), -half - 0.02, half + 0.02, Z(642), Z(588), D, 0.05))
    body.append(bv.box('sun_visor', X(36), X(70), -1.18, 1.18, Z(405), Z(396), D, 0.01, 1))
    # Side glazing, door shut line.
    for sgn in (-1, 1):
        y0, y1 = sorted((sgn * half, sgn * (half + 0.012)))
        body.append(bv.box('side_window', X(108), X(178), y0, y1, Z(492), Z(418), D, 0.0, 1))
        body.append(bv.box('door_line', X(95), X(98), y0, y1, Z(590), Z(410), D, 0.0, 1))
        body.append(bv.box('door_line', X(232), X(235), y0, y1, Z(590), Z(410), D, 0.0, 1))
        # Mirror arm + head at the A-pillar.
        body.append(bv.box('mirror_arm', X(20), X(28), sgn * half - 0.03, sgn * (half + 0.28), Z(440), Z(434), D, 0.0, 1))
        body.append(bv.box('mirror', X(14), X(30), sgn * (half + 0.22) - 0.06, sgn * (half + 0.22) + 0.06, Z(505), Z(428), D, 0.02, 1))
    # Roof beacons and antennas.
    for px in (72, 128):
        body.append(bv.cyl('beacon', (X(px), 0.55, Z(386)), 0.08, 0.2, Y, 'Z', 12, 0.01))
    for px in (137, 152):
        body.append(bv.cyl('antenna', (X(px), -0.35, Z(370)), 0.012, 0.6, D, 'Z', 6, 0.0))
    # Cab rear / chassis.
    body.append(bv.box('cab_back', X(245), X(272), -1.0, 1.0, Z(592), Z(420), D, 0.02))
    for y in (-0.45, 0.45):
        body.append(bv.box('rail', X(30), X(502), y - 0.07, y + 0.07, Z(600), Z(558), D, 0.015))
    # Ballast box with MEGA / MOVE tile.
    body.append(bv.box('ballast_box', X(272), X(496), -1.2, 1.2, Z(560), Z(400), G, 0.05))
    body.append(bv.box('ballast_lid', X(268), X(500), -1.24, 1.24, Z(406), Z(398), G, 0.02, 1))
    for sgn in (-1, 1):
        y0, y1 = sorted((sgn * 1.2, sgn * 1.212))
        body.append(bv.box('logo_tile', X(305), X(447), y0, y1, Z(520), Z(428), D, 0.0, 1))
    body += both_sides_text('logo_mega', 'MEGA', 0.6, X(376), 1.217, Z(452), W, font)
    body += both_sides_text('logo_move', 'MOVE', 0.6, X(376), 1.217, Z(497), W, font)
    # Fuel tank, air tanks, mudguards.
    for y in (-0.95, 0.95):
        body.append(bv.cyl('fuel_tank', (X(266), y, Z(605)), X(22), X(76), S, 'X', 20, 0.03))
    for sgn in (-1, 1):
        y0, y1 = sorted((sgn * 0.85, sgn * 1.42))
        body.append(bv.box('mudguard', X(308), X(492), y0, y1, Z(588), Z(576), D, 0.015, 1))
    # Rear coupling jaw (drawbar hitch), pivot node.
    jaw = [bv.box('jaw', X(492), X(508), -0.25, 0.25, Z(612), Z(588), S, 0.01, 1),
           bv.cyl('jaw_pin', (X(500), 0, Z(600)), 0.05, 0.4, S, 'Z', 10, 0.0)]
    bv.pivot('coupling_jaw', bv.join('coupling_jaw', jaw, origin=(X(500), 0, Z(600))), (X(500), 0, Z(600)), None)
    # Coiled hydraulic hose (orange-red) from the box rear to the drawbar.
    for i in range(9):
        t = i / 8
        px, py = 497 + t * 92, 548 + t * 44
        bpy.ops.mesh.primitive_torus_add(major_radius=X(9), minor_radius=X(2.6), major_segments=12, minor_segments=6,
                                         location=(X(px), -0.3, Z(py)), rotation=(0, math.pi / 2, 0))
        tor = bpy.context.active_object
        bv.finish(tor, Y, 0, 1)
        body.append(tor)
    bv.join('tractor_body', body)

    # Wheels: one single (steer) and one twin (drive), instanced. r = 47 px.
    r = X(47)
    single = bv.wheel_mesh('tr_wheel_single', r, 0.36, {'mm_charcoal': D, 'mm_steel': S}, verts=28)
    twin = bv.wheel_mesh('tr_wheel_twin', r, 0.32, {'mm_charcoal': D, 'mm_steel': S}, twin_gap=0.04, verts=28)
    single.name, single.location = 'wheel_steer_L', (X(175), -1.05, r)
    bv.place_instance(single, 'wheel_steer_R', (X(175), 1.05, r))
    for i, px in enumerate((355, 445)):
        for side, y in (('L', -1.0), ('R', 1.0)):
            n = f'wheel_drive{i + 1}_{side}'
            if i == 0 and side == 'L':
                twin.name, twin.location = n, (X(px), y, r)
            else:
                bv.place_instance(twin, n, (X(px), y, r))
    bv.join('tractor_axles', [bv.cyl('axle', (X(px), 0, r), 0.08, 1.9, D, 'Y', 10) for px in (175, 355, 445)])


# =========================================================================== MODULAR TRAILER (11 axle lines, drawbar)

AXLES_PX = [715 + i * 112.5 for i in range(11)]


def build_trailer(M, font):
    R, D, S, W = (M[k] for k in ('mt_red', 'mt_dark', 'mt_steel', 'mt_white'))
    use_collection('modular_trailer')
    deck = []
    half = 1.5
    x0, x1 = 598, 1988
    # Deck: dark top plate, red side beams, red lower frame.
    deck.append(bv.box('deck_top', X(x0), X(x1), -half, half, Z(574), Z(568), D, 0.01, 1))
    deck.append(bv.box('deck_core', X(x0 + 4), X(x1 - 4), -1.1, 1.1, Z(612), Z(574), R, 0.02))
    for sgn in (-1, 1):
        y0, y1 = sorted((sgn * 1.3, sgn * half))
        deck.append(bv.box('side_beam', X(x0), X(x1), y0, y1, Z(612), Z(572), R, 0.02))
        y0, y1 = sorted((sgn * 0.9, sgn * 1.25))
        deck.append(bv.box('lower_frame', X(x0 + 10), X(x1 - 10), y0, y1, Z(626), Z(610), R, 0.015))
        ys = sorted((sgn * half, sgn * (half + 0.012)))
        # Grey inspection panels and dark lashing pockets along the beam, one set per axle line.
        for ax in AXLES_PX:
            deck.append(bv.box('panel', X(ax - 30), X(ax - 4), *ys, Z(604), Z(582), S, 0.0, 1))
            deck.append(bv.box('pocket', X(ax + 14), X(ax + 26), *ys, Z(598), Z(586), D, 0.0, 1))
        # MMIPL name plates where the reference has the maker's plates.
        for px in (1052, 1496):
            deck.append(bv.box('name_plate', X(px), X(px + 80), *ys, Z(604), Z(588), W, 0.0, 1))
    for px in (1092, 1536):
        deck += both_sides_text('plate_text', 'MEGA MOVE INDIA', 0.13, X(px), half + 0.018, Z(596), D, font)
    # Rear end plate with round lamp disc.
    deck.append(bv.box('rear_plate', X(x1 - 6), X(x1 + 2), -half, half, Z(640), Z(570), R, 0.02))
    for y in (-1.05, 1.05):
        deck.append(bv.cyl('rear_disc', (X(x1 + 3), y, Z(612)), X(22), 0.06, S, 'X', 20, 0.01))
        deck.append(bv.cyl('rear_disc_core', (X(x1 + 6), y, Z(612)), X(9), 0.04, D, 'X', 12, 0.0))
    # Front head plate and hose coil.
    deck.append(bv.box('front_plate', X(x0 - 4), X(x0 + 6), -half, half, Z(630), Z(570), R, 0.02))
    bv.join('trailer_deck', deck)

    # Drawbar: pivot at the trailer front, reaches forward to the tractor's jaw (px 500).
    db = [bv.strut('drawbar_l', (X(600), -0.6, Z(604)), (X(505), -0.05, Z(600)), 0.06, S),
          bv.strut('drawbar_r', (X(600), 0.6, Z(604)), (X(505), 0.05, Z(600)), 0.06, S),
          bv.box('drawbar_eye', X(498), X(512), -0.1, 0.1, Z(606), Z(594), D, 0.01, 1)]
    bv.pivot('drawbar', bv.join('drawbar', db, origin=(X(600), 0, Z(604))), (X(600), 0, Z(604)), None)

    # Running gear: per axle line two bogies (L/R), each with two twin-wheel sets. r = 37 px.
    r = X(37)
    bogie_parts = [
        bv.box('bogie_block', -X(26), X(26), -0.4, 0.4, Z(645), Z(624), R, 0.02),
        bv.cyl('susp', (0, 0, Z(626)), 0.11, X(20), S, 'Z', 12),
        bv.box('axle_beam', -0.1, 0.1, -0.55, 0.55, r - 0.08, r + 0.08, D, 0.01, 1),
    ]
    bogie = bv.join('mt_bogie', bogie_parts)
    twin = bv.wheel_mesh('mt_wheel_twin', r, 0.2, {'mm_charcoal': D, 'mm_steel': S}, twin_gap=0.03, rim_ratio=0.62, verts=22)
    by, dy = 0.78, 0.43
    for i, ax in enumerate(AXLES_PX):
        for side, sgn in (('L', -1), ('R', 1)):
            n = f'bogie_{i + 1}_{side}'
            loc = (X(ax), sgn * by, 0)
            if i == 0 and side == 'L':
                bogie.name, bogie.location = n, loc
            else:
                bv.place_instance(bogie, n, loc)
            for pos, wy in (('in', sgn * (by - dy)), ('out', sgn * (by + dy))):
                n = f'wheel_{i + 1}_{side}_{pos}'
                if i == 0 and side == 'L' and pos == 'in':
                    twin.name, twin.location = n, (X(ax), wy, r)
                else:
                    bv.place_instance(twin, n, (X(ax), wy, r))


# =========================================================================== PRESSURE VESSEL

def build_vessel(M):
    SH, T, S = (M[k] for k in ('pv_shell', 'pv_trim', 'pv_steel'))
    use_collection('pressure_vessel')
    parts = []
    cy_px, R_px = 338, 220
    cz, R = Z(cy_px), X(R_px)
    xa, xb = 740, 1812                    # cylindrical shell ends (head welds)
    head_l, head_r = X(150), X(125)       # head depths (left head is deeper in the reference)
    # Shell + two ellipsoidal heads.
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=R, depth=X(xb - xa), location=(X((xa + xb) / 2), 0, cz), rotation=(0, math.pi / 2, 0))
    parts.append(bv.finish(bpy.context.active_object, SH, 0, 1))
    for xc, depth, sgn in ((xa, head_l, -1), (xb, head_r, 1)):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=24, radius=R, location=(X(xc), 0, cz))
        s = bpy.context.active_object
        s.scale = (depth / R, 1, 1)
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='DESELECT')
        bpy.ops.object.mode_set(mode='OBJECT')
        for v in s.data.vertices:
            v.select = (v.co.x * sgn) < -1e-4   # delete the half inside the shell
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.delete(type='VERT')
        bpy.ops.object.mode_set(mode='OBJECT')
        parts.append(bv.finish(s, SH, 0, 1))
    # Girth stiffener rings and head weld rings.
    for px, w in ((745, 0.12), (830, 0.16), (1005, 0.16), (1275, 0.16), (1330, 0.16), (1465, 0.16), (1740, 0.16), (1772, 0.16), (1808, 0.12)):
        parts.append(bv.cyl('ring', (X(px), 0, cz), R + 0.05, w, T, 'X', 64, 0.01))
    # Bolted flange ring around the left head (the dotted ring in the reference).
    bpy.ops.mesh.primitive_torus_add(major_radius=R * 0.98, minor_radius=0.06, major_segments=64, minor_segments=8,
                                     location=(X(735), 0, cz), rotation=(0, math.pi / 2, 0))
    parts.append(bv.finish(bpy.context.active_object, T, 0, 1))
    # Longitudinal bands (lower stiffener and mid seam), both sides.
    for py, size in ((482, 0.14), (340, 0.05)):
        dz = (cy_px - py) * K
        lat = math.sqrt(max(R * R - dz * dz, 0)) + size * 0.3
        for sgn in (-1, 1):
            parts.append(bv.box('band', X(xa), X(xb), sgn * lat - size / 2, sgn * lat + size / 2, Z(py) - size / 2, Z(py) + size / 2, T, 0.01, 1))
    # Top pipe rail.
    parts.append(bv.cyl('top_rail', (X(1300), -0.45, cz + R + 0.12), 0.05, X(980), S, 'X', 10, 0.0))
    # Top nozzles: (px, height px, radius px).
    for px, h, rr in ((845, 40, 10), (1010, 26, 7), (1185, 22, 7), (1240, 46, 14), (1332, 30, 9), (1392, 24, 7), (1465, 28, 8), (1602, 22, 7), (1780, 40, 10)):
        top = cz + R
        parts.append(bv.cyl('nozzle', (X(px), 0, top + X(h) / 2 - 0.05), X(rr), X(h) + 0.1, S, 'Z', 16, 0.01))
        parts.append(bv.cyl('flange', (X(px), 0, top + X(h)), X(rr) * 1.8, 0.06, S, 'Z', 20, 0.01))
    # Side manway plate, both sides.
    for sgn in (-1, 1):
        dz = Z(175) - cz
        lat = math.sqrt(R * R - dz * dz)
        y0, y1 = sorted((sgn * (lat - 0.05), sgn * (lat + 0.08)))
        parts.append(bv.box('manway', X(1200), X(1278), y0, y1, Z(212), Z(140), T, 0.02))
    # Side flanged nozzles (px, py, radius px).
    for px, py, rr in ((780, 330, 30), (1640, 338, 30), (778, 185, 16)):
        dz = Z(py) - cz
        lat = math.sqrt(max(R * R - dz * dz, 0))
        for sgn in (-1, 1):
            parts.append(bv.cyl('side_nozzle', (X(px), sgn * (lat + 0.1), Z(py)), X(rr) * 0.6, 0.35, S, 'Y', 16, 0.01))
            parts.append(bv.cyl('side_flange', (X(px), sgn * (lat + 0.27), Z(py)), X(rr), 0.08, S, 'Y', 24, 0.01))
            parts.append(bv.cyl('side_blind', (X(px), sgn * (lat + 0.32), Z(py)), X(rr) * 0.45, 0.04, T, 'Y', 16, 0.0))
    # End nozzles on both heads.
    for px, py, ax_sgn, rr in ((594, 250, -1, 14), (590, 352, -1, 18), (1928, 332, 1, 16)):
        parts.append(bv.cyl('end_nozzle', (X(px) - ax_sgn * 0.15, 0, Z(py)), X(rr) * 0.6, 0.5, S, 'X', 16, 0.01))
        parts.append(bv.cyl('end_flange', (X(px) + ax_sgn * 0.08, 0, Z(py)), X(rr), 0.08, S, 'X', 24, 0.01))
    bv.join('vessel_shell', parts)

    # Saddles: base on the deck (py 572), wrap up to the lower band (py ~490).
    saddles = []
    for px in (840, 1326, 1772):
        prof = [P(px - 58, 572), P(px + 58, 572), P(px + 26, 492), P(px - 26, 492)]
        saddles.append(bv.prism_x('saddle_web', prof, -1.25, 1.25, T, 0.03))
        saddles.append(bv.box('saddle_base', X(px - 66), X(px + 66), -1.4, 1.4, Z(574), Z(564), S, 0.01, 1))
    bv.join('vessel_saddles', saddles)


# =========================================================================== render + export

def render(name, cam_loc, target, lens=None, ortho=None, res=(2000, 760)):
    sc = bpy.context.scene
    cam = sc.camera
    cam.location = cam_loc
    if ortho:
        cam.data.type, cam.data.ortho_scale = 'ORTHO', ortho
    else:
        cam.data.type, cam.data.lens = 'PERSP', lens
    cam.rotation_euler = (Vector(target) - Vector(cam_loc)).to_track_quat('-Z', 'Y').to_euler()
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.filepath = os.path.join(OUT_DIR, f'{name}.png')
    bpy.ops.render.render(write_still=True)


def setup_render():
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 48
    sc.cycles.use_denoising = True
    w = bpy.data.worlds.new('w')
    sc.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes['Background']
    bg.inputs[0].default_value = (0.92, 0.92, 0.93, 1)
    bg.inputs[1].default_value = 1.0
    bpy.ops.mesh.primitive_plane_add(size=400, location=(X(1000), 0, 0))
    g = bpy.context.active_object
    g.name = 'preview_ground'
    gm = bpy.data.materials.new('ground')
    gm.use_nodes = True
    gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.8, 0.8, 0.8, 1)
    g.data.materials.append(gm)
    bpy.ops.object.light_add(type='SUN', rotation=(math.radians(40), 0, math.radians(-25)))
    bpy.context.active_object.data.energy = 3.0
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    sc.collection.objects.link(cam)
    sc.camera = cam
    return [g]


def export_collection(coll_name, file_name):
    """Re-centres the collection on its footprint (ground at z 0) under a root node and exports it."""
    coll = bpy.data.collections[coll_name]
    objs = list(coll.all_objects)
    lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    for o in objs:
        if o.type != 'MESH':
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    centre = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, 0))
    root = bpy.data.objects.new(coll_name, None)
    coll.objects.link(root)
    for o in objs:
        if o.parent is None:
            o.location -= centre
            o.parent = root
    bpy.ops.object.select_all(action='DESELECT')
    for o in [root] + objs:
        o.select_set(True)
    path = os.path.join(OUT_DIR, f'{file_name}.raw.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
                              export_yup=True, export_cameras=False, export_lights=False)
    size = hi - lo
    print(f'[ref] {file_name}: size {size.x:.2f} x {size.y:.2f} x {size.z:.2f} m, footprint centre (image metres) {centre.x:.3f} → {path}')


def triangles(coll_name):
    return sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in bpy.data.collections[coll_name].all_objects if o.type == 'MESH')


if __name__ == '__main__':
    bpy.ops.wm.read_factory_settings(use_empty=True)
    font = bpy.data.fonts.load(FONT_PATH) if FONT_PATH and os.path.exists(FONT_PATH) else None
    M = materials()
    build_tractor(M, font)
    build_trailer(M, font)
    build_vessel(M)
    for c in ('ballast_tractor', 'modular_trailer', 'pressure_vessel'):
        print(f'[ref] {c}: {triangles(c)} triangles')
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT_DIR, 'reference-set.blend'))
    extra = setup_render()
    mid = (X(1000), 0, Z(400))
    render('ref_side', (X(1000), -60, Z(380)), (X(1000), 0, Z(380)), ortho=X(2050), res=(2000, 780))
    render('ref_threequarter', (X(-300), -24, 7.5), (X(1000), 0, 2.2), lens=35, res=(2000, 900))
    render('ref_tractor_close', (X(-150), -8.5, 3.2), (X(260), 0, 2.0), lens=35, res=(1600, 1000))
    for o in extra:
        bpy.data.objects.remove(o)
    export_collection('ballast_tractor', 'ballast-tractor')
    export_collection('modular_trailer', 'modular-trailer')
    export_collection('pressure_vessel', 'pressure-vessel')
