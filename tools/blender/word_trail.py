"""Word Trail's felt-and-paper sprites (seed-games/word-trail.html): Bramble the hedgehog in four poses and the trail's
props, built from the felt kit's materials (tools/blender/feltkit.py: felt = sheen + fibre bump + mottling, paper =
tooth + fibres) and rendered as 2D sprites in soft warm daylight, plus two grey swatches (felt and paper) that the game
tiles and tints in CSS for its backgrounds, cards and buttons.

    python3 tools/blender/word_trail.py --out DIR [--only mascot_idle,chest_open,...]

Writes DIR/<name>.png (transparent, trimmed to the art). scripts/word-trail-art.js turns them into small WebP data URLs
in the game's data pack (public/vendor/data/word-trail/<version>/art.js).

Original designs only: Bramble is our own hedgehog (a round felt body, a coat of felt spikes, a mint scarf and a
little satchel); no one else's character.
"""
import argparse
import math
import os
import random
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh  # noqa: E402
import feltkit as K  # noqa: E402
from mathutils import Vector  # noqa: E402

# ---------------------------------------------------------------- palette (warm daylight meadow)
FUR = '#8a5a3c'        # the spiky coat
SPIKE = ('#7a4b31', '#94643f', '#6c4029')
FACE = '#f6dcc0'       # face, belly, paws
BLUSH = '#f29aa6'
SCARF = '#3fb68b'
SCARF2 = '#2f9a74'
BAG = '#e2a24a'
INK = '#2a1b22'


# ---------------------------------------------------------------- scene, light, camera
def scene_setup(px_w, px_h, samples=48):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    K.reset()
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE'
    sc.eevee.taa_render_samples = samples
    try:
        sc.eevee.use_shadows = True
        sc.eevee.use_raytracing = False
    except Exception:
        pass
    sc.render.resolution_x, sc.render.resolution_y = px_w, px_h
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    for vt in ('AgX', 'Filmic', 'Standard'):
        try:
            sc.view_settings.view_transform = vt
            break
        except Exception:
            continue
    try:
        sc.view_settings.look = 'AgX - Medium High Contrast'
    except Exception:
        pass
    sc.view_settings.exposure = -0.1
    w = bpy.data.worlds.new('world'); sc.world = w; w.use_nodes = True
    bg = w.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = K.hexcol('#f3e6d0')   # warm paper-coloured daylight bounce
    bg.inputs['Strength'].default_value = 1.0
    # the story kit's day rig: a big warm key from the upper left, a cool rim, a soft fill from the front
    for name, energy, col, size, loc, rot in (
            ('key', 1200, (1.0, 0.95, 0.85), 9, (-7, -9, 11), (50, 0, -35)),
            ('rim', 450, (0.85, 0.9, 1.0), 8, (6, 6, 8), (-40, 20, 0)),
            ('fill', 420, (1.0, 0.96, 0.92), 12, (4, -12, 3), (85, 0, 20))):
        L = bpy.data.lights.new(name, 'AREA'); L.energy = energy; L.color = col; L.size = size
        L.use_shadow = name == 'key'
        o = bpy.data.objects.new(name, L); K.link(o); o.location = loc
        o.rotation_euler = tuple(math.radians(a) for a in rot)
    return sc


def camera(target_z, scale, rx=84.0, rz=-10.0, dist=20.0):
    cam = bpy.data.cameras.new('cam'); cam.type = 'ORTHO'; cam.ortho_scale = scale
    co = bpy.data.objects.new('cam', cam); K.link(co); bpy.context.scene.camera = co
    a, t = math.radians(rz), math.radians(90 - rx)
    co.location = (math.sin(a) * dist * math.cos(t), -math.cos(a) * dist * math.cos(t), target_z + math.sin(t) * dist)
    co.rotation_euler = (math.radians(rx), 0, a)
    return co


def render(path):
    sc = bpy.context.scene
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


# ---------------------------------------------------------------- shapes
def arc_tube(name, center, radius, a0, a1, thick, mat, parent, segs=16, yaw=0.0):
    """A felt tube along an arc in the XZ plane (a smile, a happy closed eye, an eyebrow), facing -Y."""
    bm = bmesh.new(); rings = []
    for i in range(segs + 1):
        a = a0 + (a1 - a0) * i / segs
        c = Vector((math.cos(a) * radius, 0, math.sin(a) * radius))
        tng = Vector((-math.sin(a), 0, math.cos(a)))
        nrm = Vector((math.cos(a), 0, math.sin(a)))
        side = Vector((0, 1, 0))
        k = 0.55 + 0.45 * math.sin(math.pi * i / segs)   # tapered ends
        ring = []
        for j in range(8):
            b = j / 8 * 2 * math.pi
            ring.append(bm.verts.new(c + (nrm * math.cos(b) + side * math.sin(b)) * thick * k))
        rings.append(ring)
        _ = tng
    for r0, r1 in zip(rings, rings[1:]):
        for j in range(8):
            bm.faces.new([r0[j], r0[(j + 1) % 8], r1[(j + 1) % 8], r1[j]])
    bm.faces.new(rings[0][::-1]); bm.faces.new(rings[-1])
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); K.link(ob); ob.data.materials.append(mat); K.smooth(ob)
    ob.parent = parent; ob.location = center; ob.rotation_euler = (0, 0, yaw)
    return ob


def spikes(parent, center, radii, n, rng, front_cut=-0.15, length=0.2, r=0.075, zmin=-0.2):
    """Felt spikes on the back and sides of an ellipsoid (never on the face side, -Y), pointing outward and back."""
    golden = math.pi * (3 - math.sqrt(5))
    made = 0
    for i in range(n * 3):
        z = 1 - (i + 0.5) / (n * 3) * 2
        rr = math.sqrt(max(0.0, 1 - z * z)); th = golden * i
        d = Vector((math.cos(th) * rr, math.sin(th) * rr, z))
        if d.y < front_cut or d.z < zmin:
            continue
        p = Vector((center[0] + d.x * radii[0], center[1] + d.y * radii[1], center[2] + d.z * radii[2]))
        out = Vector((d.x / radii[0], d.y / radii[1], d.z / radii[2])).normalized()
        out = (out + Vector((0, 0.55, 0.15))).normalized()   # swept back, a little up
        L = length * rng.uniform(0.85, 1.15)
        tip = p + out * L * 0.5
        rot = Vector((0, 0, 1)).rotation_difference(out).to_euler()
        K.prim('cone', 'spike', tuple(tip), (1, 1, L * 0.5), tuple(rot), mat=K.felt(rng.choice(SPIKE), fuzz=0.8, sheen=0.25), parent=parent, segs=10, r1=r * rng.uniform(0.85, 1.1), r2=0.0)
        made += 1
        if made >= n:
            break


# ---------------------------------------------------------------- Bramble the hedgehog
def bramble(pose):
    rng = random.Random(11)
    root = K.empty('bramble')
    body = K.empty('body', (0, 0, 0), root)
    fur, face = K.felt(FUR), K.felt(FACE)
    K.prim('sphere', 'b_body', (0, 0.04, 0.46), (0.42, 0.38, 0.44), mat=fur, parent=body, segs=32)
    K.prim('sphere', 'b_belly', (0, -0.2, 0.42), (0.28, 0.2, 0.32), mat=face, parent=body, segs=24)
    spikes(body, (0, 0.06, 0.5), (0.42, 0.38, 0.42), 46, rng, front_cut=-0.05, length=0.2, zmin=-0.35)
    # feet
    for sx in (-1, 1):
        K.prim('sphere', 'b_foot', (sx * 0.17, -0.16, 0.06), (0.12, 0.16, 0.07), mat=K.felt('#7a4b31'), parent=body, segs=16)
    # the scarf: a soft ring at the neck and a tail hanging at the front
    K.prim('torus', 'b_scarf', (0, -0.02, 0.8), (0.34, 0.32, 0.5), mat=K.felt(SCARF, sheen=0.7), parent=body, segs=40, minor=0.22)
    tail = K.outline_obj('b_scarftail', [(-0.07, 0.0), (0.08, 0.0), (0.1, -0.26), (0.03, -0.3), (-0.01, -0.24), (-0.06, -0.3), (-0.1, -0.25)], 0.05, K.felt(SCARF2, sheen=0.7), bevel=0.02)
    tail.parent = body; tail.location = (0.14, -0.36, 0.78); tail.rotation_euler = (0.25, 0, -0.18)
    # the satchel strap and bag (a reader's bag of word cards), on the left hip
    bag = K.prim('cube', 'b_bag', (-0.36, -0.17, 0.27), (0.13, 0.07, 0.11), (0, 0, 0.35), mat=K.felt(BAG), parent=body)
    bev = bag.modifiers.new('bev', 'BEVEL'); bev.width = 0.04; bev.segments = 3
    flap = K.prim('cube', 'b_flap', (-0.37, -0.25, 0.33), (0.135, 0.02, 0.06), (0.2, 0, 0.35), mat=K.felt('#c98a3a'), parent=body)
    bev = flap.modifiers.new('bev', 'BEVEL'); bev.width = 0.02; bev.segments = 2
    K.prim('sphere', 'b_button', (-0.35, -0.29, 0.31), (0.025, 0.015, 0.025), mat=K.glossy('#fff1c2', 0.3), parent=body, segs=10)

    # head: a big round head with a light face and a pointed snout
    head = K.empty('head', (0, -0.02, 1.12), body)
    K.prim('sphere', 'h_back', (0, 0.06, 0.0), (0.44, 0.4, 0.38), mat=fur, parent=head, segs=32)
    K.prim('sphere', 'h_face', (0, -0.16, -0.04), (0.37, 0.27, 0.31), mat=face, parent=head, segs=32)
    spikes(head, (0, 0.06, 0.04), (0.44, 0.4, 0.38), 40, rng, front_cut=0.02, length=0.22, zmin=-0.25)
    # a little tuft on top
    for k, (x, rz) in enumerate(((-0.06, 0.4), (0.02, 0.0), (0.09, -0.4))):
        K.prim('cone', 'tuft', (x, -0.08, 0.38), (1, 1, 0.08), (0.3, rz, 0), mat=K.felt(SPIKE[k % 3]), parent=head, segs=10, r1=0.05, r2=0)
    K.prim('cone', 'h_snout', (0, -0.42, -0.1), (1, 1, 0.12), (math.pi / 2 + 0.18, 0, 0), mat=face, parent=head, segs=20, r1=0.13, r2=0.05)
    K.prim('sphere', 'h_nose', (0, -0.55, -0.075), (0.06, 0.05, 0.05), mat=K.glossy('#2a1b22', 0.25), parent=head, segs=14)
    for sx in (-1, 1):
        ear = K.empty('ear', (sx * 0.27, -0.02, 0.27), head)
        K.prim('cyl', 'ear', (0, 0, 0), (0.09, 0.09, 0.03), (math.pi / 2, 0, 0), mat=face, parent=ear, segs=20)
        K.prim('cyl', 'ear_in', (0, -0.03, 0), (0.055, 0.055, 0.015), (math.pi / 2, 0, 0), mat=K.felt(BLUSH), parent=ear, segs=20)
        ear.rotation_euler.y = sx * -0.3
        if pose == 'sad':
            ear.rotation_euler.y = sx * -0.75
            ear.location.z = 0.22
    # face by pose
    ink = K.felt(INK, sheen=0.3)
    eye_z, eye_gap, eye_y = 0.05, 0.14, -0.4
    if pose == 'cheer':   # happy closed eyes (^ ^) and a big open smile
        for sx in (-1, 1):
            arc_tube('eye_happy', (sx * eye_gap, eye_y + 0.02, eye_z - 0.02), 0.05, 0.15 * math.pi, 0.85 * math.pi, 0.017, ink, head)
        mo = K.prim('sphere', 'mouth', (0, -0.44, -0.2), (0.075, 0.03, 0.06), mat=K.felt('#7a2a2c', sheen=0.2), parent=head, segs=16)
        K.prim('sphere', 'tongue', (0, -0.47, -0.235), (0.045, 0.02, 0.025), mat=K.felt('#f07c86'), parent=head, segs=12)
        _ = mo
    else:
        look_up = 0.025 if pose == 'think' else 0.0
        look_x = 0.015 if pose == 'think' else 0.0
        for sx in (-1, 1):
            r = 0.05
            K.prim('sphere', 'eye', (sx * eye_gap + look_x, eye_y, eye_z + look_up), (r, r * 0.7, r * 1.15), mat=K.glossy('#15131c'), parent=head, segs=16)
            K.prim('sphere', 'glint', (sx * eye_gap + look_x + 0.017, eye_y - 0.035, eye_z + look_up + 0.025), (0.016, 0.01, 0.016), mat=K.glow('#ffffff', 2.0), parent=head, segs=8)
        if pose == 'sad':   # kind, sympathetic brows (raised in the middle) and a small soft smile
            for sx in (-1, 1):
                arc_tube('brow', (sx * (eye_gap + 0.01), eye_y + 0.01, eye_z + 0.075), 0.07, (0.55 if sx < 0 else 0.15) * math.pi, (0.85 if sx < 0 else 0.45) * math.pi, 0.017, K.felt('#5a3422'), head)
            arc_tube('mouth', (0, -0.45, -0.13), 0.04, 1.25 * math.pi, 1.75 * math.pi, 0.013, ink, head)
        elif pose == 'think':
            arc_tube('brow', (-eye_gap, eye_y + 0.01, eye_z + 0.11), 0.06, 0.3 * math.pi, 0.7 * math.pi, 0.012, K.felt('#6c4029'), head)
            K.prim('sphere', 'mouth', (0.03, -0.45, -0.19), (0.028, 0.015, 0.024), mat=K.felt('#7a2a2c', sheen=0.2), parent=head, segs=12)
        else:
            arc_tube('mouth', (0, -0.45, -0.15), 0.06, 1.2 * math.pi, 1.8 * math.pi, 0.015, ink, head)
    for sx in (-1, 1):
        K.prim('sphere', 'cheek', (sx * 0.22, -0.38, -0.1), (0.06, 0.025, 0.045), mat=K.felt(BLUSH, sheen=0.5), parent=head, segs=12)

    # arms: little round paws on short felt arms (an empty at the shoulder, so a pose turns the whole arm)
    arms = []
    for sx in (-1, 1):
        a = K.empty('arm', (sx * 0.36, -0.06, 0.66), body)
        K.prim('sphere', 'arm', (0, 0, -0.13), (0.075, 0.075, 0.16), mat=fur, parent=a, segs=16)
        K.prim('sphere', 'paw', (0, -0.01, -0.27), (0.075, 0.07, 0.07), mat=face, parent=a, segs=16)
        arms.append(a)
    L, R = arms   # L is screen-left (x < 0)
    if pose == 'idle':
        L.rotation_euler.y, R.rotation_euler.y = 0.35, -0.35
        R.rotation_euler.x = 0.2
    elif pose == 'cheer':
        L.rotation_euler.y, R.rotation_euler.y = 2.55, -2.55
        body.location.z = 0.06
        head.rotation_euler.x = 0.12
    elif pose == 'think':   # one paw at the chin, head tilted, eyes up
        R.rotation_euler = (1.9, 0, 0.5); R.location = (0.25, -0.12, 0.66)
        L.rotation_euler.y = 0.3
        head.rotation_euler = (0.12, -0.18, 0.08)
    elif pose == 'sad':     # paws together in front, head down a little and tilted: "that's okay, let's try again"
        L.rotation_euler = (1.25, 0, -0.75); R.rotation_euler = (1.25, 0, 0.75)
        L.location.x, R.location.x = -0.3, 0.3
        head.rotation_euler = (-0.24, 0.2, 0.12)
    root.rotation_euler.z = math.radians(-12)
    return root


# ---------------------------------------------------------------- props
def chest(open_):
    root = K.empty('chest')
    wood, band, gold = K.felt('#b5733f'), K.felt('#7a4b31'), K.felt('#ffcf4d', sheen=0.6)
    base = K.prim('cube', 'c_base', (0, 0, 0.32), (0.62, 0.42, 0.32), mat=wood, parent=root)
    m = base.modifiers.new('bev', 'BEVEL'); m.width = 0.08; m.segments = 4
    for x in (-0.38, 0.38):
        b = K.prim('cube', 'c_band', (x, -0.005, 0.32), (0.07, 0.43, 0.33), mat=band, parent=root)
        m = b.modifiers.new('bev', 'BEVEL'); m.width = 0.03; m.segments = 2
    lid = K.empty('lid', (0, 0.42, 0.64), root)
    top = K.prim('cube', 'c_lid', (0, -0.42, 0.12), (0.64, 0.44, 0.16), mat=wood, parent=lid)
    m = top.modifiers.new('bev', 'BEVEL'); m.width = 0.14; m.segments = 6
    for x in (-0.38, 0.38):
        b = K.prim('cube', 'c_lidband', (x, -0.425, 0.12), (0.07, 0.45, 0.17), mat=band, parent=lid)
        m = b.modifiers.new('bev', 'BEVEL'); m.width = 0.08; m.segments = 4
    K.prim('cube', 'c_lock', (0, -0.44, 0.52), (0.1, 0.03, 0.12), mat=gold, parent=root)
    K.prim('cyl', 'c_hole', (0, -0.475, 0.5), (0.025, 0.025, 0.01), (math.pi / 2, 0, 0), mat=K.felt('#5a3a2b'), parent=root, segs=12)
    if open_:
        lid.rotation_euler.x = math.radians(-105)
        # inside: a glow and felt stars and coins tumbling out
        K.prim('cube', 'c_glow', (0, 0, 0.6), (0.55, 0.36, 0.04), mat=K.glow('#ffe08a', 6.0), parent=root)
        rng = random.Random(4)
        for i in range(9):
            x, z = rng.uniform(-0.45, 0.45), 0.66 + rng.uniform(0, 0.18)
            K.prim('cyl', 'coin', (x, rng.uniform(-0.25, 0.2), z), (0.09, 0.09, 0.02), (rng.uniform(0.6, 1.4), rng.uniform(-0.5, 0.5), 0), mat=K.felt('#f2a200', sheen=0.15), parent=root, segs=18)
        for i, (x, z, s) in enumerate(((-0.25, 1.05, 0.16), (0.2, 1.2, 0.2), (0.45, 0.95, 0.12))):
            st = K.outline_obj('c_star', K.star_pts(s, s * 0.5), 0.05, K.felt('#f5b000', sheen=0.15), bevel=0.02)
            st.parent = root; st.location = (x, -0.2, z); st.rotation_euler = (0, 0.2 * (i - 1), 0)
        lt = bpy.data.lights.new('chestglow', 'POINT'); lt.energy = 60; lt.color = (1, 0.85, 0.5)
        lo = bpy.data.objects.new('chestglow', lt); K.link(lo); lo.parent = root; lo.location = (0, -0.4, 1.0)
    root.rotation_euler.z = math.radians(-14)
    return root


def signpost():
    root = K.empty('sign')
    wood = K.felt('#c89a62')
    K.prim('cyl', 's_post', (0, 0, 0.85), (0.07, 0.07, 0.85), mat=K.felt('#8a5a3c'), parent=root, segs=14)
    pts = [(-0.75, -0.24), (0.6, -0.24), (0.82, 0.0), (0.6, 0.24), (-0.75, 0.24)]
    b = K.outline_obj('s_board', pts, 0.08, wood, bevel=0.03)
    b.parent = root; b.location = (0.05, -0.12, 1.32)
    pts2 = [(0.75, -0.18), (-0.5, -0.18), (-0.68, 0.0), (-0.5, 0.18), (0.75, 0.18)]
    b2 = K.outline_obj('s_board2', pts2, 0.08, K.felt('#e8b878'), bevel=0.03)
    b2.parent = root; b2.location = (-0.05, -0.1, 0.9)
    for z in (1.32, 0.9):
        K.prim('sphere', 'nail', (0.0, -0.21, z), (0.03, 0.02, 0.03), mat=K.glossy('#5e5a50', 0.4), parent=root, segs=8)
    K.prim('sphere', 's_grass', (0, 0, 0.0), (0.3, 0.2, 0.08), mat=K.felt('#3f9a4f'), parent=root, segs=16)
    return root


def tree_round():
    root = K.empty('tree')
    K.prim('cyl', 't_trunk', (0, 0, 0.45), (0.12, 0.12, 0.45), mat=K.felt('#7a5236'), parent=root, segs=12)
    rng = random.Random(3)
    for i, (x, z, r, c) in enumerate(((0, 1.25, 0.62, '#3f9a4f'), (-0.42, 1.0, 0.42, '#348a45'), (0.43, 1.02, 0.44, '#4caa5a'), (0.05, 1.7, 0.38, '#5bb866'))):
        K.prim('sphere', 'crown', (x, rng.uniform(-0.05, 0.05), z), (r, r * 0.9, r * 0.92), mat=K.felt(c), parent=root, segs=28)
    for i in range(5):   # a few felt apples
        a = i * 1.3
        K.prim('sphere', 'apple', (math.cos(a) * 0.45, -0.45, 1.1 + math.sin(a) * 0.35), (0.06, 0.06, 0.06), mat=K.felt('#e8483c'), parent=root, segs=10)
    return root


def tree_pine():
    root = K.empty('pine')
    K.prim('cyl', 'p_trunk', (0, 0, 0.2), (0.1, 0.1, 0.2), mat=K.felt('#7a5236'), parent=root, segs=10)
    for i, c in enumerate(('#2f7a4c', '#3a8a56', '#479a62')):
        K.prim('cone', 'p_layer', (0, 0, 0.62 + i * 0.42), (1, 1, 0.42), mat=K.felt(c), parent=root, segs=24, r1=0.62 - i * 0.15, r2=0.03)
    return root


def bush():
    root = K.empty('bush')
    for x, z, r, c in ((-0.3, 0.25, 0.3, '#3f9a4f'), (0.1, 0.32, 0.36, '#4caa5a'), (0.42, 0.22, 0.26, '#348a45')):
        K.prim('sphere', 'bush', (x, 0, z), (r, r * 0.85, r * 0.85), mat=K.felt(c), parent=root, segs=24)
    for i, (x, z) in enumerate(((-0.3, 0.4), (0.0, 0.55), (0.25, 0.38), (0.45, 0.3), (-0.1, 0.2))):
        K.prim('sphere', 'berry', (x, -0.28, z), (0.05, 0.04, 0.05), mat=K.felt(('#f29aa6', '#fbe28a', '#ffffff')[i % 3]), parent=root, segs=10)
    return root


def flowers():
    root = K.empty('flowers')
    rng = random.Random(9)
    cols = ['#f29aa6', '#fbe28a', '#ffffff', '#b8a4f0', '#ff9c8f']
    for i in range(7):
        x = (i - 3) * 0.16 + rng.uniform(-0.04, 0.04); h = rng.uniform(0.18, 0.4)
        K.prim('cyl', 'stem', (x, 0, h / 2), (0.012, 0.012, h / 2), mat=K.felt('#3f8a4c'), parent=root, segs=6)
        c = rng.choice(cols)
        for k in range(5):
            a = k / 5 * 2 * math.pi
            K.prim('sphere', 'petal', (x + math.cos(a) * 0.045, -0.02, h + math.sin(a) * 0.045), (0.04, 0.012, 0.04), mat=K.felt(c), parent=root, segs=10)
        K.prim('sphere', 'mid', (x, -0.035, h), (0.025, 0.012, 0.025), mat=K.felt('#ffd23f'), parent=root, segs=8)
    for i in range(6):
        x = rng.uniform(-0.55, 0.55)
        K.prim('cone', 'blade', (x, 0.03, 0.08), (1, 1, 0.09), (0, rng.uniform(-0.3, 0.3), 0), mat=K.felt('#3f9a4f'), parent=root, segs=6, r1=0.03, r2=0)
    return root


def stone(color):
    """A trail stepping stone: a fat rounded felt disc seen from the front and above (the lesson buttons)."""
    root = K.empty('stone')
    d = K.prim('cyl', 'st', (0, 0, 0.12), (0.62, 0.55, 0.12), mat=K.felt(color, sheen=0.2), parent=root, segs=48)
    m = d.modifiers.new('bev', 'BEVEL'); m.width = 0.1; m.segments = 5
    # a stitched rim: little felt dashes round the top edge
    for i in range(28):
        a = i / 28 * 2 * math.pi
        K.prim('cube', 'stitch', (math.cos(a) * 0.5, math.sin(a) * 0.44, 0.245), (0.03, 0.008, 0.006), (0, 0, a + math.pi / 2), mat=K.felt('#fffaf0', sheen=0.3), parent=root)
    return root


def swatch(kind):
    """A flat grey swatch filling the frame (top down) for the game's CSS textures."""
    mat = K.felt('#d8d8d8', fuzz=1.4, sheen=0.6, scale=1.6) if kind == 'felt' else K.paper('#e6e6e6', tooth=1.6)
    K.mesh_obj('swatch', [(-4, -4, 0), (4, -4, 0), (4, 4, 0), (-4, 4, 0)], [(0, 1, 2, 3)], mat)


# ---------------------------------------------------------------- jobs
SPRITES = {
    # name: (builder, ortho scale, look-at height, px w, px h, camera tilt rx)
    'mascot_idle': (lambda: bramble('idle'), 2.25, 0.82, 520, 600, 84),
    'mascot_cheer': (lambda: bramble('cheer'), 2.25, 0.86, 520, 600, 84),
    'mascot_think': (lambda: bramble('think'), 2.25, 0.82, 520, 600, 84),
    'mascot_sad': (lambda: bramble('sad'), 2.25, 0.82, 520, 600, 84),
    'chest_closed': (lambda: chest(False), 1.9, 0.5, 480, 420, 74),
    'chest_open': (lambda: chest(True), 2.3, 0.62, 480, 480, 74),
    'sign': (signpost, 2.2, 0.9, 420, 480, 84),
    'tree': (tree_round, 2.8, 1.15, 420, 520, 84),
    'pine': (tree_pine, 2.4, 0.9, 360, 460, 84),
    'bush': (bush, 1.6, 0.3, 360, 240, 80),
    'flowers': (flowers, 1.5, 0.25, 360, 200, 82),
    'stone_grey': (lambda: stone('#b9b2a4'), 1.5, 0.12, 420, 300, 62),
    'stone_gold': (lambda: stone('#ffb627'), 1.5, 0.12, 420, 300, 62),
    'stone_mint': (lambda: stone('#4fbf7a'), 1.5, 0.12, 420, 300, 62),
    'stone_lilac': (lambda: stone('#9d84e6'), 1.5, 0.12, 420, 300, 62),
}


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--out', required=True); ap.add_argument('--only', default='')
    a = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
    os.makedirs(a.out, exist_ok=True); only = set(filter(None, a.only.split(',')))
    for name, (fn, scale, z, w, h, rx) in SPRITES.items():
        if only and name not in only:
            continue
        scene_setup(w, h)
        fn()
        camera(z, scale, rx=rx, rz=0.0)
        render(os.path.join(a.out, name + '.png'))
        print('rendered', name, flush=True)
    for kind in ('felt', 'paper'):
        if only and f'tex_{kind}' not in only:
            continue
        scene_setup(512, 512, samples=24)
        bpy.context.scene.render.film_transparent = False
        swatch(kind)
        cam = bpy.data.cameras.new('cam'); cam.type = 'ORTHO'; cam.ortho_scale = 4.0
        co = bpy.data.objects.new('cam', cam); K.link(co); bpy.context.scene.camera = co; co.location = (0, 0, 10)
        render(os.path.join(a.out, f'tex_{kind}.png'))
        print('rendered', f'tex_{kind}', flush=True)


if __name__ == '__main__':
    main()
