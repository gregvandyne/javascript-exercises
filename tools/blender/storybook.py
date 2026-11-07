"""Hero of Sunvale's storybook models (the breeze style, phase 1 slice): the hero, Granny Fern, a cottage, a tree, a
barrel and a fence, built in Blender (bpy, headless) from hand-shaped primitives, with small painted textures.

    python3 tools/blender/storybook.py --out DIR [--renders]

Writes, per asset, DIR/<name>.glb (the glTF export: meshes, textures, the armature and its clips) and DIR/<name>.json
(the same mesh in the compact form the game loads: quantised attributes, one bone per vertex, the clips sampled per
frame, the texture as a JPEG data URL); --renders adds DIR/turn_<name>.png, a turntable strip for review.
scripts/hos-breeze-pack.js turns the .json files into the game's data pack (public/vendor/data/hero-of-sunvale/...).

Style: our own storybook look (no one else's characters): chunky round shapes, a big round head (about a third of the
height) with large painted eyes, soft gradients and painted detail (cloth folds, wood grain, roof tiles, plaster), the
kit's hues. Every part keeps a vertex colour (its base colour) and a part id (vertex alpha) so the game can recolour the
hero's skin, hair and clothes; the texture carries the painted detail in light neutral tones and the eyes and mouth.
"""
import argparse
import base64
import io
import json
import math
import os
import random
import sys

import bpy  # noqa: I001 (bpy first: it provides bmesh and mathutils)
import bmesh
import numpy as np
from mathutils import Matrix, Quaternion, Vector
from PIL import Image, ImageDraw, ImageFilter

FPS = 24
PARTS = {'skin': 1, 'hair': 2, 'cloth': 3, 'cloth2': 4, 'boots': 5, 'belt': 6, 'eye': 7, 'mouth': 8, 'other': 9, 'roof': 10, 'wall': 11, 'wood': 12, 'leaf': 13, 'metal': 14, 'glass': 15}
rng = random.Random(7)


# ------------------------------------------------------------------------------------------------------------ textures
def soft_noise(w, h, scale, seed):
    """Low-frequency value noise in 0..1 (bilinear upsampled random grid): soft painted blotches."""
    r = np.random.RandomState(seed)
    g = r.rand(max(2, h // scale + 2), max(2, w // scale + 2))
    im = Image.fromarray((g * 255).astype('uint8')).resize((w, h), Image.BICUBIC)
    return np.asarray(im).astype('float32') / 255.0


def painted(w, h, base, seed, strokes=0, stroke_col=None, dirn='h', blot=0.08, grad=0.12):
    """A light neutral painted swatch: a soft top-to-bottom gradient, soft blotches and a few brush strokes."""
    a = np.zeros((h, w, 3), 'float32') + np.array(base, 'float32')
    y = np.linspace(1, -1, h)[:, None, None]
    a = a * (1 + grad * 0.5 * y)
    a = a * (1 + blot * (soft_noise(w, h, 24, seed)[:, :, None] - 0.5) * 2)
    im = Image.fromarray(np.clip(a, 0, 255).astype('uint8'))
    if strokes:
        d = ImageDraw.Draw(im, 'RGBA'); rr = random.Random(seed)
        for _ in range(strokes):
            x, yy = rr.random() * w, rr.random() * h; L = 10 + rr.random() * w * 0.35; c = stroke_col or tuple(int(v * 0.86) for v in base)
            if dirn == 'h':
                pts = [(x + t * L, yy + math.sin(t * 3 + x) * 3) for t in np.linspace(0, 1, 8)]
            else:
                pts = [(x + math.sin(t * 3 + yy) * 3, yy + t * L) for t in np.linspace(0, 1, 8)]
            d.line(pts, fill=c + (110,), width=rr.choice([1, 2, 2, 3]))
        im = im.filter(ImageFilter.GaussianBlur(0.7))
    return im


def eye_img(s, iris=(70, 45, 30)):
    """A large painted eye: white with a soft blue-grey shade at the top, a big iris with a darker rim, a pupil, two
    highlights and a thick upper lash line (drawn at 4x and scaled down for soft edges)."""
    S = s * 4; im = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.ellipse((S * 0.06, S * 0.04, S * 0.94, S * 0.96), fill=(255, 255, 255, 255))
    d.chord((S * 0.06, S * 0.04, S * 0.94, S * 0.96), 200, 340, fill=(214, 224, 244, 255))
    d.ellipse((S * 0.2, S * 0.2, S * 0.86, S * 0.94), fill=tuple(int(c * 0.55) for c in iris) + (255,))
    d.ellipse((S * 0.25, S * 0.25, S * 0.81, S * 0.89), fill=iris + (255,))
    d.ellipse((S * 0.38, S * 0.4, S * 0.68, S * 0.74), fill=(18, 14, 20, 255))
    d.ellipse((S * 0.48, S * 0.3, S * 0.7, S * 0.5), fill=(255, 255, 255, 255))
    d.ellipse((S * 0.32, S * 0.66, S * 0.42, S * 0.76), fill=(255, 255, 255, 230))
    d.arc((S * 0.04, S * 0.02, S * 0.96, S * 0.98), 190, 350, fill=(40, 26, 30, 255), width=int(S * 0.07))
    return im.resize((s, s), Image.LANCZOS)


def mouth_img(s, open_=False):
    S = s * 4; im = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    if open_:
        d.chord((S * 0.2, S * 0.1, S * 0.8, S * 0.8), 0, 180, fill=(120, 40, 40, 255)); d.chord((S * 0.32, S * 0.42, S * 0.68, S * 0.8), 0, 180, fill=(230, 110, 110, 255))
    d.arc((S * 0.15, S * -0.1, S * 0.85, S * 0.6), 25, 155, fill=(90, 40, 30, 255), width=int(S * 0.08))
    return im.resize((s, s), Image.LANCZOS)


def char_atlas(iris=(70, 45, 30)):
    """256 px: left half the neutral painted cloth/skin/hair detail (rows), top right the eye, below it the mouth and blush."""
    A = Image.new('RGB', (256, 256), (245, 245, 245))
    A.paste(painted(128, 64, (246, 246, 246), 1, 18, dirn='v', grad=0.2), (0, 0))      # cloth: soft folds (vertical strokes)
    A.paste(painted(128, 64, (250, 248, 246), 2, 0, grad=0.16, blot=0.05), (0, 64))   # skin: a soft gradient
    A.paste(painted(128, 64, (244, 244, 244), 3, 40, dirn='h', grad=0.25), (0, 128))  # hair: strands
    A.paste(painted(128, 64, (240, 240, 240), 4, 10, grad=0.3), (0, 192))             # boots, belt, other
    A.paste((255, 255, 255), (128, 128, 256, 256))
    e = eye_img(128, iris); A.paste(e, (128, 0), e)
    m = mouth_img(64); A.paste(m, (128, 128), m)
    bl = Image.new('RGBA', (64, 64), (0, 0, 0, 0)); ImageDraw.Draw(bl).ellipse((4, 14, 60, 50), fill=(255, 150, 160, 255)); bl = bl.filter(ImageFilter.GaussianBlur(5))
    A.paste(bl, (192, 128), bl)
    return A


REG = {'cloth': (0, 0, 0.5, 0.25), 'skin': (0, 0.25, 0.5, 0.5), 'hair': (0, 0.5, 0.5, 0.75), 'boots': (0, 0.75, 0.5, 1), 'eye': (0.5, 0, 1, 0.5),
       'mouth': (0.5, 0.5, 0.75, 0.75), 'blush': (0.75, 0.5, 1, 0.75), 'white': (0.55, 0.8, 0.95, 0.95)}


def prop_tex(kind):
    """512/256 px painted detail for the props (repeat-wrapped): plaster, roof tiles, wood grain, leaves, bark."""
    if kind == 'cottage':   # plaster (the walls mesh): clean, warm, a few soft trowel marks
        return painted(256, 256, (252, 250, 245), 11, 5, stroke_col=(236, 230, 220), grad=0.02, blot=0.035)
    if kind == 'roof':      # roof tiles: rows of soft scallops
        T = Image.new('RGB', (256, 256), (238, 238, 238)); d = ImageDraw.Draw(T)
        for row in range(-1, 12):
            y = row * 23
            for col in range(-1, 12):
                x = col * 26 + (13 if row % 2 else 0)
                d.chord((x, y - 6, x + 26, y + 26), 0, 180, fill=(250, 250, 250), outline=(168, 168, 176), width=3)
        return T.filter(ImageFilter.GaussianBlur(0.7))
    if kind == 'tree':
        A = Image.new('RGB', (256, 256), (240, 240, 240))
        L = painted(256, 160, (236, 244, 232), 21, 0, grad=0.55, blot=0.12)                 # leaves: lighter at the top
        d = ImageDraw.Draw(L, 'RGBA'); rr = random.Random(3)
        for _ in range(70):
            x, y, r = rr.random() * 256, rr.random() * 160, 8 + rr.random() * 12
            light = 1 - y / 160
            d.chord((x - r, y - r * 0.7, x + r, y + r * 0.7), 180, 360, fill=(255, 255, 255, int(40 + 70 * light)))
            d.arc((x - r, y - r * 0.7, x + r, y + r * 0.7), 200, 340, fill=(150, 170, 140, 70), width=2)
        A.paste(L.filter(ImageFilter.GaussianBlur(0.8)), (0, 0))
        A.paste(painted(256, 96, (240, 236, 232), 22, 30, dirn='v', grad=0.1), (0, 160))   # bark
        return A
    # wood (barrel, fence): grain
    A = painted(256, 256, (244, 240, 236), 31, 70, dirn='v', grad=0.08, blot=0.08)
    return A


# ------------------------------------------------------------------------------------------------------------ modelling
class Builder:
    """Collects parts into one bmesh with per-vertex colour, part id, bone index and UVs."""
    def __init__(self, name):
        self.name = name; self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new('UVMap'); self.col = self.bm.loops.layers.float_color.new('Col')
        self.bone = self.bm.verts.layers.int.new('bone'); self.parts = []

    def add(self, bm2, color, part, bone=0, region='cloth', proj='sphere', center=None, wonk=0.0, tile=None):
        """Merge bm2 (a temporary bmesh) in, with its colour, part id, bone and UV projection into region."""
        if wonk:
            for v in bm2.verts:   # a gentle hand-made wobble (low-frequency, so curves stay smooth)
                p = v.co; v.co += Vector((math.sin(p.z * 2.3 + p.y * 1.1), math.sin(p.x * 1.9 + p.z * 1.3), math.sin(p.y * 2.1 + p.x * 1.7))) * wonk
        c = center or sum((v.co for v in bm2.verts), Vector()) / max(1, len(bm2.verts))
        mn = Vector([min(v.co[i] for v in bm2.verts) for i in range(3)]); mx = Vector([max(v.co[i] for v in bm2.verts) for i in range(3)])
        u0, v0, u1, v1 = REG.get(region, REG['cloth']) if tile is None else (0, 0, 1, 1)
        vmap = {}
        for v in bm2.verts:
            nv = self.bm.verts.new(v.co); nv[self.bone] = bone; vmap[v] = nv
        self.bm.verts.ensure_lookup_table()
        rgba = (color[0], color[1], color[2], PARTS[part] / 16.0)
        for f in bm2.faces:
            try:
                nf = self.bm.faces.new([vmap[v] for v in f.verts])
            except ValueError:
                continue
            nf.smooth = f.smooth
            for l, l2 in zip(nf.loops, f.loops):
                p = l2.vert.co
                if tile is not None:   # box projection in world units (repeat-wrapped prop textures): tile = (scale, v offset, v span)
                    n = f.normal; s, vo, vs = tile
                    if abs(n.z) > max(abs(n.x), abs(n.y)): u, vv = p.x * s, p.y * s
                    elif abs(n.x) > abs(n.y): u, vv = p.y * s, p.z * s
                    else: u, vv = p.x * s, p.z * s
                    l[self.uv].uv = (u, vv if vs >= 1 else 0.2)   # vs 0: one row of the texture (the bark strip)
                elif proj == 'sphere':
                    d = p - c; u = 0.5 + math.atan2(d.x, -d.y) / (2 * math.pi); vv = (p.z - mn.z) / max(1e-6, mx.z - mn.z)
                    l[self.uv].uv = (u0 + (u1 - u0) * (0.04 + 0.92 * u), 1 - (v0 + (v1 - v0) * (0.04 + 0.92 * (1 - vv))))
                elif proj == 'decal':   # flat decal facing -Y (the front): x and z span the region
                    uu = (p.x - mn.x) / max(1e-6, mx.x - mn.x); vv = (p.z - mn.z) / max(1e-6, mx.z - mn.z)
                    l[self.uv].uv = (u0 + (u1 - u0) * uu, 1 - (v0 + (v1 - v0) * (1 - vv)))
                l[self.col] = rgba
        bm2.free()

    def mesh(self, mat):
        me = bpy.data.meshes.new(self.name); self.bm.normal_update(); self.bm.to_mesh(me); self.bm.free()
        me.materials.append(mat)
        for p in me.polygons: p.use_smooth = True
        ob = bpy.data.objects.new(self.name, me); bpy.context.scene.collection.objects.link(ob)
        return ob


def bsphere(loc, rad, segs=(14, 9), rot=(0, 0, 0)):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=segs[0], v_segments=segs[1], radius=1.0)
    bmesh.ops.transform(bm, matrix=Matrix.Translation(loc) @ euler(rot) @ Matrix.Diagonal((rad[0], rad[1], rad[2], 1)), verts=bm.verts)
    return bm


def euler(r):
    from mathutils import Euler
    return Euler(r).to_matrix().to_4x4()


def btube(p0, p1, r0, r1, segs=12, rings=4, cap=True):
    """A tapered tube from p0 to p1 with rounded ends (a capsule-ish limb)."""
    bm = bmesh.new(); p0, p1 = Vector(p0), Vector(p1); ax = (p1 - p0); L = ax.length; q = Vector((0, 0, 1)).rotation_difference(ax.normalized())
    rows = []
    prof = [(-0.5, 0.0), (-0.35, 0.7)] + [(t, 1.0) for t in np.linspace(-0.15, 1.15, rings)] + [(1.35, 0.7), (1.5, 0.0)] if cap else [(t, 1.0) for t in np.linspace(0, 1, rings)]
    for t, k in prof:
        tt = min(1, max(0, t)); r = (r0 + (r1 - r0) * tt) * k; z = t * L if 0 <= t <= 1 else (0 if t < 0 else L) + (t - (0 if t < 0 else 1)) * min(r0, r1) * 1.0
        ring = []
        for i in range(segs):
            a = i / segs * 2 * math.pi
            ring.append(bm.verts.new(q @ Vector((math.cos(a) * r, math.sin(a) * r, z)) + p0))
        rows.append(ring)
    for a, b in zip(rows, rows[1:]):
        for i in range(segs):
            bm.faces.new([a[i], a[(i + 1) % segs], b[(i + 1) % segs], b[i]])
    if not cap:
        bm.faces.new(rows[0][::-1]); bm.faces.new(rows[-1])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    return bm


def bbox_rounded(size, loc, bevel=0.08, segs=2, rot=(0, 0, 0)):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    bmesh.ops.bevel(bm, geom=bm.edges[:] + bm.verts[:], offset=bevel, segments=segs, affect='EDGES', profile=0.5)
    bmesh.ops.transform(bm, matrix=Matrix.Translation(loc) @ euler(rot), verts=bm.verts)
    return bm


def blathe(profile, segs=16, loc=(0, 0, 0), caps=True):
    """A surface of revolution about Z from [(r, z), ...] (closed with caps)."""
    bm = bmesh.new(); rows = []
    for r, z in profile:
        rows.append([bm.verts.new((math.cos(a) * r + loc[0], math.sin(a) * r + loc[1], z + loc[2])) for a in np.linspace(0, 2 * math.pi, segs, endpoint=False)])
    for a, b in zip(rows, rows[1:]):
        for i in range(segs):
            bm.faces.new([a[i], a[(i + 1) % segs], b[(i + 1) % segs], b[i]])
    if caps:
        bm.faces.new(rows[0][::-1]); bm.faces.new(rows[-1])
    else:   # a closed ring profile (a torus): join the last row back to the first
        for i in range(segs):
            bm.faces.new([rows[-1][i], rows[-1][(i + 1) % segs], rows[0][(i + 1) % segs], rows[0][i]])
    return bm


def decal(loc, w, h, normal_yaw=0.0, tilt=0.0):
    """A small elliptical decal (an eye, a mouth, blush) facing -Y, curved back a little to sit on a round head, rotated
    about Z by normal_yaw and about X by tilt. Elliptical, so no square corner of its texture ever shows."""
    bm = bmesh.new(); segs, rings = 18, 3
    c = bm.verts.new((0, 0, 0)); rows = []
    for k in range(1, rings + 1):
        t = k / rings
        rows.append([bm.verts.new((math.cos(a) * w / 2 * t, (t * t) * 0.18 * w, math.sin(a) * h / 2 * t)) for a in np.linspace(0, 2 * math.pi, segs, endpoint=False)])
    for i in range(segs):
        bm.faces.new([c, rows[0][(i + 1) % segs], rows[0][i]])
    for a, b in zip(rows, rows[1:]):
        for i in range(segs):
            bm.faces.new([a[i], a[(i + 1) % segs], b[(i + 1) % segs], b[i]])
    bmesh.ops.reverse_faces(bm, faces=bm.faces[:])   # face the viewer (-Y), not the head
    bmesh.ops.transform(bm, matrix=Matrix.Translation(loc) @ euler((tilt, 0, normal_yaw)), verts=bm.verts)
    for f in bm.faces: f.smooth = True
    return bm


def smooth(bm):
    for f in bm.faces: f.smooth = True
    return bm


def material(name, img):
    mat = bpy.data.materials.new(name); mat.use_nodes = True
    nt = mat.node_tree; bsdf = nt.nodes.get('Principled BSDF'); bsdf.inputs['Roughness'].default_value = 1.0
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img; tex.interpolation = 'Linear'
    vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1.0
    nt.links.new(tex.outputs['Color'], mix.inputs['A']); nt.links.new(vc.outputs['Color'], mix.inputs['B']); nt.links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
    return mat


def to_bimg(pil, name):
    pil = pil.convert('RGB'); w, h = pil.size
    img = bpy.data.images.new(name, w, h, alpha=False)
    px = (np.asarray(pil.transpose(Image.FLIP_TOP_BOTTOM)).astype('float32') / 255.0)
    img.pixels.foreach_set(np.concatenate([px, np.ones((h, w, 1), 'float32')], axis=2).ravel())
    img.pack(); img.file_format = 'JPEG'
    return img


def hexc(h):
    h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


# ------------------------------------------------------------------------------------------------------------ rigs
BONES_CHAR = [('root', None, (0, 0, 0), (0, 0, 0.3)), ('hips', 'root', (0, 0, 0.5), (0, 0, 0.7)), ('chest', 'hips', (0, 0, 0.7), (0, 0, 1.0)),
              ('head', 'chest', (0, 0, 1.0), (0, 0, 1.6)), ('arm.L', 'chest', (0.27, 0, 0.93), (0.33, 0, 0.6)), ('arm.R', 'chest', (-0.27, 0, 0.93), (-0.33, 0, 0.6)),
              ('leg.L', 'hips', (0.11, 0, 0.5), (0.11, 0, 0.1)), ('leg.R', 'hips', (-0.11, 0, 0.5), (-0.11, 0, 0.1))]


def armature(name, bones, scale=1.0):
    arm = bpy.data.armatures.new(name + '_rig'); ob = bpy.data.objects.new(name + '_rig', arm); bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob; bpy.ops.object.mode_set(mode='EDIT')
    eb = {}
    for n, par, h, t in bones:
        b = arm.edit_bones.new(n); b.head = Vector(h) * scale; b.tail = Vector(t) * scale
        if par: b.parent = eb[par]
        eb[n] = b
    bpy.ops.object.mode_set(mode='OBJECT')
    return ob


def bind(mesh_ob, rig, bone_names):
    """Rigid skinning: each vertex to its one bone (the int layer 'bone')."""
    me = mesh_ob.data; groups = [mesh_ob.vertex_groups.new(name=n) for n in bone_names]
    layer = me.attributes.get('bone')
    for v in me.vertices:
        groups[layer.data[v.index].value].add([v.index], 1.0, 'REPLACE')
    mod = mesh_ob.modifiers.new('rig', 'ARMATURE'); mod.object = rig; mesh_ob.parent = rig


def clip(rig, name, length, keys):
    """An action from keys: {bone: [(frame, (rx, ry, rz) degrees, (lx, ly, lz) or None), ...]}."""
    act = bpy.data.actions.new(name); rig.animation_data_create(); rig.animation_data.action = act
    for bn, ks in keys.items():
        pb = rig.pose.bones[bn]; pb.rotation_mode = 'XYZ'
        for f, r, loc in ks:
            pb.rotation_euler = [math.radians(a) for a in r]; pb.keyframe_insert('rotation_euler', frame=f)
            if loc is not None:
                pb.location = loc; pb.keyframe_insert('location', frame=f)
    act.use_fake_user = True
    try:
        act.frame_range = (0, length)
    except Exception:
        pass
    track = rig.animation_data.nla_tracks.new(); track.name = name; track.strips.new(name, 0, act)
    rig.animation_data.action = None
    for pb in rig.pose.bones:
        pb.rotation_euler = (0, 0, 0); pb.location = (0, 0, 0)
    return act, length


def cyc(frames, vals):
    return list(zip(frames, vals))


# ------------------------------------------------------------------------------------------------------------ assets
def build_hero():
    B = Builder('hero'); skin, hair, tun, tun2, boot, belt = hexc('#F5CBA7'), hexc('#5C3A26'), hexc('#4FA8F0'), hexc('#2F6FC8'), hexc('#8A5A3C'), hexc('#5C3A26')
    # legs and boots
    for s, bi in ((1, 6), (-1, 7)):
        B.add(btube((0.11 * s, 0, 0.52), (0.115 * s, 0.0, 0.17), 0.085, 0.07, 10, 4), tun2, 'cloth2', bi, 'cloth')
        B.add(smooth(bsphere((0.12 * s, -0.04, 0.1), (0.1, 0.15, 0.09))), boot, 'boots', bi, 'boots', wonk=0.006)
    # tunic: a rounded body and a short flared skirt, a belt
    B.add(smooth(bsphere((0, 0, 0.78), (0.25, 0.21, 0.27), (16, 10))), tun, 'cloth', 2, 'cloth', wonk=0.008)
    B.add(blathe([(0.24, 0.48), (0.29, 0.5), (0.27, 0.6), (0.22, 0.7)], 20), tun, 'cloth', 1, 'cloth')
    B.add(blathe([(0.255, 0.62), (0.262, 0.635), (0.258, 0.69), (0.243, 0.7)], 20), belt, 'belt', 1, 'boots')
    B.add(smooth(bsphere((0, -0.245, 0.66), (0.05, 0.02, 0.04))), hexc('#FFD23F'), 'other', 1, 'white')   # buckle
    # arms: a puffed sleeve, a tapered arm, a small round hand
    for s, bi in ((1, 4), (-1, 5)):
        B.add(smooth(bsphere((0.27 * s, 0, 0.9), (0.1, 0.1, 0.1))), tun, 'cloth', bi, 'cloth')
        B.add(btube((0.29 * s, 0, 0.86), (0.33 * s, -0.01, 0.62), 0.06, 0.045, 10, 3), skin, 'skin', bi, 'skin')
        B.add(smooth(bsphere((0.335 * s, -0.01, 0.57), (0.06, 0.055, 0.065))), skin, 'skin', bi, 'skin')
    # head: big and round (about a third of the height), ears, nose
    B.add(smooth(bsphere((0, 0, 1.3), (0.33, 0.31, 0.31), (22, 14))), skin, 'skin', 3, 'skin', wonk=0.004)
    for s in (1, -1):
        B.add(smooth(bsphere((0.32 * s, 0.02, 1.28), (0.05, 0.04, 0.07))), skin, 'skin', 3, 'skin')
    B.add(smooth(bsphere((0, -0.31, 1.25), (0.035, 0.03, 0.028))), tuple(c * 0.94 for c in skin), 'skin', 3, 'skin')
    # hair: a soft cap (back and top) with a fringe of locks and a tuft
    B.add(smooth(bsphere((0, 0.035, 1.36), (0.345, 0.325, 0.29), (20, 12))), hair, 'hair', 3, 'hair', wonk=0.01)
    for i, x in enumerate(np.linspace(-0.22, 0.22, 5)):
        B.add(smooth(bsphere((x, -0.235 + abs(x) * 0.35, 1.5 - abs(x) * 0.35), (0.1, 0.07, 0.085), (10, 6), (0.35, 0, -x * 1.6))), hair, 'hair', 3, 'hair')
    B.add(smooth(bsphere((0.04, 0.05, 1.66), (0.07, 0.06, 0.1), (10, 8), (0.3, 0.4, 0.2))), hair, 'hair', 3, 'hair')
    # face: painted eyes (decals), mouth, blush
    for s in (1, -1):
        B.add(decal((0.13 * s, -0.31, 1.29), 0.23, 0.28, 0.38 * s, 0.08), (1, 1, 1), 'eye', 3, 'eye', 'decal')
        B.add(decal((0.2 * s, -0.27, 1.2), 0.09, 0.06, 0.6 * s, 0.1), skin, 'skin', 3, 'blush', 'decal')
    B.add(decal((0, -0.305, 1.15), 0.16, 0.11, 0, 0.3), skin, 'skin', 3, 'mouth', 'decal')
    return B


def build_granny():
    B = Builder('granny'); skin, hair, dress, shawl, shoe = hexc('#E8B48A'), hexc('#DDE6EE'), hexc('#9B6BE8'), hexc('#FF9C8F'), hexc('#5C3A26')
    for s, bi in ((1, 6), (-1, 7)):
        B.add(smooth(bsphere((0.1 * s, -0.05, 0.06), (0.09, 0.13, 0.07))), shoe, 'boots', bi, 'boots')
    B.add(blathe([(0.05, 0.05), (0.31, 0.08), (0.33, 0.2), (0.3, 0.4), (0.25, 0.58), (0.2, 0.7), (0.05, 0.74)], 22), dress, 'cloth', 1, 'cloth', wonk=0.01)
    B.add(smooth(bsphere((0, 0, 0.74), (0.24, 0.2, 0.2), (16, 10))), dress, 'cloth', 2, 'cloth')
    B.add(blathe([(0.1, 0.86), (0.27, 0.82), (0.31, 0.74), (0.3, 0.64), (0.22, 0.6), (0.18, 0.66), (0.1, 0.7)], 22), shawl, 'cloth2', 2, 'cloth', wonk=0.012)   # shawl
    B.add(smooth(bsphere((0, -0.24, 0.62), (0.05, 0.03, 0.05))), hexc('#FFD23F'), 'other', 2, 'white')   # brooch
    for s, bi in ((1, 4), (-1, 5)):
        B.add(btube((0.25 * s, 0, 0.8), (0.29 * s, -0.04, 0.55), 0.06, 0.05, 10, 3), dress, 'cloth', bi, 'cloth')
        B.add(smooth(bsphere((0.29 * s, -0.05, 0.5), (0.055, 0.05, 0.06))), skin, 'skin', bi, 'skin')
    B.add(smooth(bsphere((0, 0, 1.12), (0.3, 0.29, 0.29), (22, 14))), skin, 'skin', 3, 'skin', wonk=0.004)
    B.add(smooth(bsphere((0, -0.29, 1.08), (0.04, 0.035, 0.032))), tuple(c * 0.93 for c in skin), 'skin', 3, 'skin')
    B.add(smooth(bsphere((0, 0.04, 1.2), (0.31, 0.29, 0.25), (20, 12))), hair, 'hair', 3, 'hair', wonk=0.008)
    B.add(smooth(bsphere((0, 0.12, 1.45), (0.15, 0.14, 0.13), (14, 10))), hair, 'hair', 3, 'hair')   # the bun
    B.add(blathe([(0.05, 1.37), (0.08, 1.38), (0.08, 1.4), (0.05, 1.41)], 12, (0, 0.05, 0)), hexc('#FF6B5B'), 'other', 3, 'white')   # ribbon
    for s in (1, -1):
        B.add(decal((0.115 * s, -0.29, 1.12), 0.15, 0.19, 0.36 * s, 0.08), (1, 1, 1), 'eye', 3, 'eye', 'decal')
        B.add(decal((0.19 * s, -0.25, 1.03), 0.08, 0.05, 0.6 * s, 0.1), skin, 'skin', 3, 'blush', 'decal')
        # glasses: a thin gold ring round each eye (a torus, so the eye shows through) and the bridge
        # (a pair that reads as glasses from every side: two thin rounded frames flush with the face, a bridge, and arms
        # running back to the ears)
        tor = smooth(blathe([(0.088, -0.006), (0.098, -0.006), (0.098, 0.006), (0.088, 0.006)], 18, caps=False))
        bmesh.ops.transform(tor, matrix=Matrix.Translation((0.115 * s, -0.297, 1.12)) @ euler((math.pi / 2 + 0.08, 0, 0.36 * s)) @ Matrix.Diagonal((1.08, 1, 0.92, 1)), verts=tor.verts)
        B.add(tor, hexc('#5C3A26'), 'metal', 3, 'white')
        B.add(btube((0.205 * s, -0.27, 1.14), (0.29 * s, -0.02, 1.15), 0.007, 0.007, 5, 2, cap=False), hexc('#5C3A26'), 'metal', 3, 'white')
    B.add(btube((-0.03, -0.317, 1.135), (0.03, -0.317, 1.135), 0.007, 0.007, 5, 2, cap=False), hexc('#5C3A26'), 'metal', 3, 'white')
    B.add(decal((0, -0.288, 0.99), 0.11, 0.07, 0, 0.25), skin, 'skin', 3, 'mouth', 'decal')
    return B


def build_cottage():
    """Unit cottage: walls 6 x 5 x 3.2 (x, y, z), the roof a soft thick slab with an overhang; two meshes: walls, roof."""
    W, D, H, RH = 6.0, 5.0, 3.2, 2.3
    walls = Builder('cottage_walls'); roof = Builder('cottage_roof')
    plaster, stone, wood, glass, door = (1.0, 1.0, 1.0), hexc('#C6C2B5'), hexc('#8A5A3C'), hexc('#93CBF6'), hexc('#BF6A3C')
    T = (0.5, 0.0, 1.0)   # tile: 0.5 per metre over the whole (repeat-wrapped) texture
    bm = bbox_rounded((W, D, H), (0, 0, H / 2), 0.22, 1)
    for v in bm.verts:   # a little storybook wonk: the top leans, the middle bulges
        v.co.x += 0.06 * (v.co.z / H) ** 2 * (1 if v.co.y > 0 else -0.5); v.co.x *= 1 + 0.02 * math.sin(v.co.z * 1.2); v.co.y *= 1 + 0.025 * math.sin(v.co.z * 1.4)
    walls.add(bm, plaster, 'wall', 0, tile=T)
    walls.add(bbox_rounded((W + 0.35, D + 0.35, 0.6), (0, 0, 0.1), 0.18, 1), stone, 'other', 0, tile=T, wonk=0.02)
    for sx in (-1, 1):   # chunky timber corners
        for sy in (-1, 1):
            walls.add(bbox_rounded((0.3, 0.3, H + 0.1), (sx * (W / 2 - 0.05), sy * (D / 2 - 0.05), H / 2 + 0.05), 0.1, 1), wood, 'wood', 0, tile=(1.0, 0.0, 1.0), wonk=0.015)
    walls.add(bbox_rounded((W + 0.2, 0.25, 0.25), (0, -D / 2 - 0.02, H - 0.1), 0.08, 1), wood, 'wood', 0, tile=(1.0, 0, 1.0), wonk=0.02)
    # door with a round top, step, windows with frames and flower boxes
    walls.add(bbox_rounded((1.15, 0.18, 2.0), (0, -D / 2 - 0.05, 1.0), 0.12, 3), door, 'wood', 0, tile=(1.0, 0, 1.0))
    walls.add(smooth(bsphere((0.32, -D / 2 - 0.16, 1.0), (0.06, 0.05, 0.06))), hexc('#FFD23F'), 'metal', 0, tile=T)
    walls.add(bbox_rounded((1.6, 0.8, 0.3), (0, -D / 2 - 0.35, 0.05), 0.12, 1), stone, 'other', 0, tile=T, wonk=0.02)
    for sx in (-1, 1):
        x = sx * 1.85
        walls.add(bbox_rounded((1.05, 0.14, 1.0), (x, -D / 2 - 0.03, 1.75), 0.1, 1), wood, 'wood', 0, tile=(1.0, 0, 1.0))
        walls.add(bbox_rounded((0.8, 0.1, 0.78), (x, -D / 2 - 0.08, 1.75), 0.06, 1), glass, 'glass', 0, tile=T)
        walls.add(bbox_rounded((1.15, 0.35, 0.25), (x, -D / 2 - 0.2, 1.17), 0.07, 1), wood, 'wood', 0, tile=(1.0, 0, 1.0))
        for i in range(4):
            walls.add(smooth(bsphere((x - 0.4 + i * 0.27, -D / 2 - 0.22, 1.36), (0.11, 0.1, 0.1), (6, 4))), hexc(['#FF6B5B', '#FFE27A', '#FF9C8F', '#C6A9F3'][i]), 'leaf', 0, tile=T)
    walls.add(bbox_rounded((0.8, 0.8, 2.0), (1.4, 0.7, H + RH * 0.55), 0.12, 2, (0, 0.06, 0)), stone, 'other', 0, tile=T, wonk=0.03)   # chimney
    walls.add(bbox_rounded((0.95, 0.95, 0.2), (1.44, 0.7, H + RH * 0.55 + 1.0), 0.07, 2, (0, 0.06, 0)), stone, 'other', 0, tile=T)
    # the roof: two thick soft slabs meeting at the ridge, with a sag and an overhang
    for s in (-1, 1):
        ang = math.atan2(RH, D / 2 + 0.6); L = math.hypot(RH, D / 2 + 0.7)
        bm = bbox_rounded((W + 1.2, L + 0.15, 0.32), (0, 0, 0), 0.14, 2)
        for v in bm.verts:
            v.co.z -= 0.12 * math.cos(v.co.x / (W + 1.2) * math.pi) ** 2 * (0.5 - 0.5 * math.cos(v.co.y / L * math.pi))   # a gentle sag
        bmesh.ops.transform(bm, matrix=Matrix.Translation((0, s * (L / 2) * math.cos(ang) - s * 0.05, H + RH - (L / 2) * math.sin(ang) + 0.12)) @ euler((-s * ang, 0, 0)), verts=bm.verts)
        roof.add(bm, (1, 1, 1), 'roof', 0, tile=(0.45, 0.0, 1.0), wonk=0.02)
    for sx in (-1, 1):   # gable ends: plaster triangles
        bm = bmesh.new(); vs = [bm.verts.new((sx * (W / 2 - 0.02), y, z)) for y, z in ((-D / 2, H - 0.05), (D / 2, H - 0.05), (0, H + RH - 0.1))]; bm.faces.new(vs if sx > 0 else vs[::-1])
        walls.add(bm, plaster, 'wall', 0, tile=T)
    walls.add(btube((-(W + 1.2) / 2, 0, H + RH + 0.18), ((W + 1.2) / 2, 0, H + RH + 0.18), 0.17, 0.17, 10, 3), (0.86, 0.86, 0.86), 'roof', 0, tile=(0.45, 0.0, 1.0))   # ridge
    return walls, roof


def build_tree():
    B = Builder('tree'); bark, leaf = hexc('#8A5A3C'), hexc('#7CC94A')
    # a curvy trunk: rings along a gentle S-curve, flared roots
    rows = []; bm = bmesh.new(); segs = 7
    for i in range(6):
        t = i / 5; z = t * 2.6; cx = 0.18 * math.sin(t * 3.0); cy = 0.08 * math.sin(t * 2.0 + 1); r = 0.34 * (1 - t * 0.55) + (0.18 * (1 - t) ** 6)
        rows.append([bm.verts.new((cx + math.cos(a) * r * (1 + 0.12 * math.sin(a * 3 + t * 4)), cy + math.sin(a) * r, z)) for a in np.linspace(0, 2 * math.pi, segs, endpoint=False)])
    for a, b in zip(rows, rows[1:]):
        for k in range(segs):
            bm.faces.new([a[k], a[(k + 1) % segs], b[(k + 1) % segs], b[k]])
    smooth(bm); B.add(bm, bark, 'wood', 0, tile=(0.9, 0.0, 0.0))
    for i in range(2):   # a couple of branches into the crown
        a = i * 2.6 + 0.4
        B.add(btube((0.15, 0, 2.0), (0.15 + math.cos(a) * 0.9, math.sin(a) * 0.9, 2.9), 0.1, 0.06, 4, 2, cap=False), bark, 'wood', 0, tile=(0.9, 0.0, 0.0))
    # the canopy: layered blobs, bigger and lower at the bottom; lighter tops come from the texture (v by height)
    blobs = [((0.1, 0, 3.4), (1.55, 1.45, 1.2)), ((0.85, 0.35, 3.0), (1.0, 0.95, 0.85)), ((-0.75, 0.3, 3.1), (1.05, 1.0, 0.9)), ((0.1, -0.75, 3.05), (0.95, 0.9, 0.85)),
             ((0.25, 0.1, 4.25), (1.05, 1.0, 0.9))]
    cb = Builder('tmp')
    for loc, rad in blobs:
        bm = smooth(bsphere(loc, rad, (8, 5)))
        for v in bm.verts:   # leaf clumps: a soft lumpy surface
            n = (v.co - Vector(loc)).normalized(); v.co += n * 0.07 * math.sin(n.x * 7 + n.y * 5) * math.sin(n.z * 6 + n.x * 3)
        z0, z1 = 2.0, 5.2
        for f in bm.faces: pass
        B.add(bm, leaf, 'leaf', 0, tile=(0.0, 0.0, 1.0))
    cb.bm.free()
    # canopy UVs: v by world height (lighter at the top of the leaf texture), u around
    uv = B.uv
    for f in B.bm.faces:
        for l in f.loops:
            if abs(l[B.col][3] - PARTS['leaf'] / 16.0) < 1e-4:
                p = l.vert.co; l[uv].uv = (0.5 + math.atan2(p.y, p.x) / (2 * math.pi) * 2, 1 - (0.02 + 0.6 * (1 - min(1, max(0, (p.z - 2.0) / 3.2)))))
    return B


def build_barrel():
    B = Builder('barrel'); wood, metal = hexc('#BF7A45'), hexc('#5E5A50')
    prof = [(0.36, 0.0), (0.42, 0.18), (0.46, 0.45), (0.47, 0.6), (0.46, 0.75), (0.42, 1.02), (0.36, 1.2)]
    B.add(smooth(blathe(prof, 12)), wood, 'wood', 0, tile=(1.6, 0.0, 1.0))
    for z, r in ((0.2, 0.43), (1.0, 0.43), (0.6, 0.478)):
        B.add(smooth(blathe([(r - 0.005, z - 0.045), (r + 0.025, z), (r - 0.005, z + 0.045)], 12, caps=False)), metal, 'metal', 0, tile=(2.0, 0, 1.0))
    B.add(blathe([(0.335, 1.18), (0.345, 1.215), (0.0, 1.215)], 12), tuple(c * 0.9 for c in wood), 'wood', 0, tile=(1.6, 0, 1.0))   # lid
    return B


def build_fence():
    """A post (unit height 1.4) and a rail pair (unit length 1 along x); the game stretches the rails per segment."""
    post = Builder('fence_post'); rail = Builder('fence_rail'); wood = hexc('#C89A62')
    bm = bbox_rounded((0.2, 0.2, 1.35), (0, 0, 0.62), 0.07, 1)
    for v in bm.verts:
        if v.co.z > 1.2: v.co.z += 0.08 * (1 - abs(v.co.x) * 5)   # a rounded, slightly pointed top
    post.add(bm, wood, 'wood', 0, tile=(1.4, 0, 1.0), wonk=0.012)
    for z in (0.5, 0.98):
        bm = bbox_rounded((1.0, 0.09, 0.14), (0.5, 0, z), 0.04, 1)
        for v in bm.verts: v.co.z += 0.035 * math.sin(v.co.x * math.pi) - 0.01   # a slight sag
        rail.add(bm, wood, 'wood', 0, tile=(1.4, 0, 1.0))
    return post, rail


# ------------------------------------------------------------------------------------------------------------ export
def compact(ob, rig=None, bone_names=None):
    """The mesh in the game's compact form: indexed triangles, quantised position (int16 over its bounds), normal (int8),
    uv (uint16 over [-4, 4]), colour + part (uint8 rgba), bone (uint8)."""
    dg = bpy.context.evaluated_depsgraph_get(); me = ob.data
    me.calc_loop_triangles()
    uvl = me.uv_layers.active.data; col = me.color_attributes.get('Col').data; bl = me.attributes.get('bone')
    verts, idx, key2i = [], [], {}
    for tri in me.loop_triangles:
        for li in tri.loops:
            l = me.loops[li]; vi = l.vertex_index; p = me.vertices[vi].co; n = l.normal if hasattr(l, 'normal') else me.vertices[vi].normal
            n = me.corner_normals[li].vector if hasattr(me, 'corner_normals') else n
            u = uvl[li].uv; c = col[li].color; b = bl.data[vi].value if bl else 0
            k = (vi, round(n.x, 3), round(n.y, 3), round(n.z, 3), round(u[0], 4), round(u[1], 4), tuple(round(x, 3) for x in c))
            if k not in key2i:
                key2i[k] = len(verts)
                # Blender Z-up -> three Y-up: (x, y, z) -> (x, z, -y)
                verts.append(((p.x, p.z, -p.y), (n.x, n.z, -n.y), (u[0], u[1]), c, b))
            idx.append(key2i[k])
    P = np.array([v[0] for v in verts], 'float32'); mn, mx = P.min(0), P.max(0); span = np.maximum(mx - mn, 1e-6)
    q = np.round((P - mn) / span * 65535 - 32768).astype('<i2')
    N = np.round(np.clip(np.array([v[1] for v in verts], 'float32'), -1, 1) * 127).astype('<i1')
    U = np.round(np.clip((np.array([v[2] for v in verts], 'float32') + 4) / 8, 0, 1) * 65535).astype('<u2')
    C = np.round(np.clip(np.array([v[3] for v in verts], 'float32'), 0, 1) * 255).astype('u1')
    Bn = np.array([v[4] for v in verts], 'u1')
    I = np.array(idx, '<u2' if len(verts) < 65536 else '<u4')
    b64 = lambda a: base64.b64encode(a.tobytes()).decode()
    return {'verts': len(verts), 'tris': len(idx) // 3, 'min': mn.round(5).tolist(), 'max': mx.round(5).tolist(), 'pos': b64(q), 'nrm': b64(N), 'uv': b64(U), 'col': b64(C), 'bone': b64(Bn), 'idx': b64(I)}


def conv_m(m):
    """Blender (Z-up) matrix -> three (Y-up)."""
    C = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, -1, 0, 0), (0, 0, 0, 1)))
    return C @ m @ C.inverted()


def rig_data(rig, clips):
    arm = rig.data; bones = []
    names = [b.name for b in arm.bones]
    for b in arm.bones:
        rel = (b.parent.matrix_local.inverted() @ b.matrix_local) if b.parent else b.matrix_local
        t, r, s = conv_m(rel).decompose()
        bones.append({'name': b.name, 'parent': names.index(b.parent.name) if b.parent else -1, 't': [round(x, 5) for x in t], 'r': [round(x, 5) for x in (r.x, r.y, r.z, r.w)]})
    out = {}
    sc = bpy.context.scene
    for act, length in clips:
        rig.animation_data.action = act
        tr = {b.name: {'t': [], 'r': []} for b in arm.bones}; times = []
        for f in range(0, int(length) + 1):
            sc.frame_set(f); times.append(round(f / FPS, 4))
            for b in arm.bones:
                pb = rig.pose.bones[b.name]
                rel = (b.parent.matrix_local.inverted() @ b.matrix_local) if b.parent else b.matrix_local
                t, r, s = conv_m(rel @ pb.matrix_basis).decompose()
                tr[b.name]['t'] += [round(x, 4) for x in t]; tr[b.name]['r'] += [round(x, 4) for x in (r.x, r.y, r.z, r.w)]
        tracks = []
        for i, b in enumerate(arm.bones):
            rs = tr[b.name]['r']; ts = tr[b.name]['t']
            if max(rs) - min(rs) > 1e-3:
                tracks.append({'bone': i, 'r': rs})
            if max(ts[1::3]) - min(ts[1::3]) > 1e-4 or max(ts[0::3]) - min(ts[0::3]) > 1e-4:
                tracks.append({'bone': i, 't': ts})
        out[act.name] = {'dur': round(length / FPS, 4), 'times': times, 'tracks': tracks}
        rig.animation_data.action = None
    return bones, out


def tex_url(pil, q=82):
    buf = io.BytesIO(); pil.convert('RGB').save(buf, 'JPEG', quality=q, optimize=True)
    return 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode(), len(buf.getvalue())


def export_glb(path, objs):
    for o in bpy.context.scene.objects: o.select_set(False)
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_animations=True, export_image_format='JPEG',
                              export_vertex_color='ACTIVE', export_apply=False, export_animation_mode='NLA_TRACKS')


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


# ------------------------------------------------------------------------------------------------------------ renders
def toon_mat(img):
    """The review render's look (close to the game's breeze shader): the texture x vertex colour as the fill, a two-band
    toon ramp (Shader to RGB) graded warm in the light and blue-violet in the shade."""
    m = bpy.data.materials.new('toon_review'); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission'); dif = nt.nodes.new('ShaderNodeBsdfDiffuse')
    s2r = nt.nodes.new('ShaderNodeShaderToRGB'); ramp = nt.nodes.new('ShaderNodeValToRGB'); tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img
    vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
    m1 = nt.nodes.new('ShaderNodeMix'); m1.data_type = 'RGBA'; m1.blend_type = 'MULTIPLY'; m1.inputs['Factor'].default_value = 1
    m2 = nt.nodes.new('ShaderNodeMix'); m2.data_type = 'RGBA'; m2.blend_type = 'MULTIPLY'; m2.inputs['Factor'].default_value = 1
    r = ramp.color_ramp; r.interpolation = 'LINEAR'
    r.elements[0].position = 0.18; r.elements[0].color = (0.42, 0.45, 0.82, 1); r.elements[1].position = 0.24; r.elements[1].color = (1.06, 1.0, 0.86, 1)
    nt.links.new(dif.outputs[0], s2r.inputs[0]); nt.links.new(s2r.outputs['Color'], ramp.inputs['Fac'])
    nt.links.new(tex.outputs['Color'], m1.inputs['A']); nt.links.new(vc.outputs['Color'], m1.inputs['B'])
    nt.links.new(m1.outputs['Result'], m2.inputs['A']); nt.links.new(ramp.outputs['Color'], m2.inputs['B'])
    nt.links.new(m2.outputs['Result'], em.inputs['Color']); nt.links.new(em.outputs[0], out.inputs[0])
    return m


def turntable(path, objs, height, n=6, px=220):
    """A strip of n views round the model (EEVEE, the toon review look, one warm sun) for the review sheet."""
    sc = bpy.context.scene; sc.render.engine = 'BLENDER_EEVEE'
    for o in sc.objects:   # the rest pose (no clip playing; the clips are in the .glb already)
        if o.animation_data: o.animation_data_clear()
        if o.pose:
            for pb in o.pose.bones: pb.rotation_euler = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)
    sc.render.resolution_x = px; sc.render.resolution_y = int(px * 1.25); sc.render.film_transparent = True; sc.render.image_settings.file_format = 'PNG'
    sc.view_settings.view_transform = 'Standard'
    if sc.world is None: sc.world = bpy.data.worlds.new('w')
    for o in objs:
        img = o.data.materials[0].node_tree.nodes['Image Texture'].image if o.data.materials and o.data.materials[0].node_tree.nodes.get('Image Texture') else None
        o.data.materials[0] = toon_mat(img)
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 4; sc.collection.objects.link(sun)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = height * 1.35
    tiles = []
    for i in range(n):
        a = i / n * 2 * math.pi
        cam.location = (math.sin(a) * 30, -math.cos(a) * 30, height * 0.5 + 6)
        cam.rotation_euler = (math.radians(90 - math.degrees(math.atan2(6, 30))), 0, a)
        sun.rotation_euler = (math.radians(50), 0, a + math.radians(-40))   # the sun from the viewer's upper left, like the game's
        f = path + f'.{i}.png'; sc.render.filepath = f; bpy.ops.render.render(write_still=True)
        tiles.append(Image.open(f).convert('RGBA')); os.remove(f)
    strip = Image.new('RGBA', (px * n, int(px * 1.25)), (0, 0, 0, 0))
    for i, t in enumerate(tiles): strip.paste(t, (i * px, 0))
    strip.save(path)


# ------------------------------------------------------------------------------------------------------------ main
def make_char(name, builder, atlas, out, renders):
    img = to_bimg(atlas, name + '_tex'); mat = material(name + '_mat', img)
    ob = builder.mesh(mat); rig = armature(name, BONES_CHAR); bind(ob, rig, [b[0] for b in BONES_CHAR])
    clips = []
    sw = lambda a: [(0, (a, 0, 0), None), (6, (-a, 0, 0), None), (12, (a, 0, 0), None)]
    if name == 'hero':
        clips.append(clip(rig, 'idle', 48, {'chest': [(0, (0, 0, 0), None), (24, (3, 0, 0), None), (48, (0, 0, 0), None)], 'head': [(0, (0, 0, 2), None), (24, (-2, 0, -2), None), (48, (0, 0, 2), None)],
                                             'arm.L': [(0, (0, 0, 4), None), (24, (0, 0, 7), None), (48, (0, 0, 4), None)], 'arm.R': [(0, (0, 0, -4), None), (24, (0, 0, -7), None), (48, (0, 0, -4), None)],
                                             'hips': [(0, (0, 0, 0), (0, 0, 0)), (24, (0, 0, 0), (0, -0.015, 0)), (48, (0, 0, 0), (0, 0, 0))]}))
        for nm, n, a, lean in (('walk', 24, 32, 3), ('run', 14, 55, 12)):
            h = n // 2
            clips.append(clip(rig, nm, n, {'leg.L': [(0, (a, 0, 0), None), (h, (-a, 0, 0), None), (n, (a, 0, 0), None)], 'leg.R': [(0, (-a, 0, 0), None), (h, (a, 0, 0), None), (n, (-a, 0, 0), None)],
                                           'arm.L': [(0, (-a * 0.8, 0, 5), None), (h, (a * 0.8, 0, 5), None), (n, (-a * 0.8, 0, 5), None)], 'arm.R': [(0, (a * 0.8, 0, -5), None), (h, (-a * 0.8, 0, -5), None), (n, (a * 0.8, 0, -5), None)],
                                           'chest': [(0, (lean, 0, 0), None), (n, (lean, 0, 0), None)],
                                           'hips': [(0, (0, 0, 0), (0, 0, 0)), (n // 4, (0, 0, 0), (0, 0.04, 0)), (h, (0, 0, 0), (0, 0, 0)), (3 * n // 4, (0, 0, 0), (0, 0.04, 0)), (n, (0, 0, 0), (0, 0, 0))]}))
        clips.append(clip(rig, 'attack', 12, {'arm.R': [(0, (0, 0, -5), None), (3, (-150, 0, -10), None), (7, (60, 0, 5), None), (12, (0, 0, -5), None)],
                                              'chest': [(0, (0, 0, 0), None), (3, (-6, 0, -18), None), (7, (10, 0, 15), None), (12, (0, 0, 0), None)],
                                              'leg.L': [(0, (0, 0, 0), None), (7, (-20, 0, 0), None), (12, (0, 0, 0), None)]}))
    else:
        clips.append(clip(rig, 'idle', 60, {'chest': [(0, (0, 0, 0), None), (30, (2, 0, 0), None), (60, (0, 0, 0), None)], 'head': [(0, (0, 0, 3), None), (30, (2, 0, -1), None), (60, (0, 0, 3), None)],
                                             'arm.L': [(0, (0, 0, 6), None), (30, (0, 0, 8), None), (60, (0, 0, 6), None)], 'arm.R': [(0, (0, 0, -6), None), (30, (0, 0, -8), None), (60, (0, 0, -6), None)]}))
        clips.append(clip(rig, 'talk', 36, {'head': [(0, (0, 0, 0), None), (6, (8, 0, 4), None), (12, (-2, 0, -3), None), (18, (7, 0, 2), None), (24, (-1, 0, -4), None), (30, (6, 0, 3), None), (36, (0, 0, 0), None)],
                                             'arm.R': [(0, (0, 0, -6), None), (9, (-55, 0, -20), None), (18, (-35, 0, -10), None), (27, (-60, 0, -25), None), (36, (0, 0, -6), None)],
                                             'chest': [(0, (0, 0, 0), None), (12, (4, 0, 3), None), (24, (2, 0, -3), None), (36, (0, 0, 0), None)]}))
    export_glb(os.path.join(out, name + '.glb'), [rig, ob])
    bones, cl = rig_data(rig, clips)
    data = {'name': name, 'meshes': {'body': compact(ob)}, 'bones': bones, 'clips': cl}
    url, nb = tex_url(atlas, 86); data['tex'] = url
    if renders:
        turntable(os.path.join(out, 'turn_' + name + '.png'), [ob], 1.75)
    return data


def make_prop(name, builders, tex, out, renders, height, texs=None):
    """texs: an optional texture per builder (the cottage's walls and roof); otherwise one texture for all."""
    texs = texs or [tex] * len(builders); obs = []
    for i, (b, t) in enumerate(zip(builders, texs)):
        obs.append(b.mesh(material(f'{name}_mat{i}', to_bimg(t, f'{name}_tex{i}'))))
    export_glb(os.path.join(out, name + '.glb'), obs)
    data = {'name': name, 'meshes': {b_ob.name.replace(name + '_', '') if b_ob.name != name else 'body': compact(b_ob) for b_ob in obs}}
    url, nb = tex_url(texs[0], 80); data['tex'] = url
    for b_ob, t in zip(obs, texs):
        if t is not texs[0]: data['meshes'][b_ob.name.replace(name + '_', '')]['tex'] = tex_url(t, 80)[0]
    if renders:
        turntable(os.path.join(out, 'turn_' + name + '.png'), obs, height)
    return data


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--out', required=True); ap.add_argument('--renders', action='store_true'); ap.add_argument('--only', default='')
    a = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
    os.makedirs(a.out, exist_ok=True); only = set(filter(None, a.only.split(',')))
    jobs = [('hero', lambda: make_char('hero', build_hero(), char_atlas((80, 56, 34)), a.out, a.renders)),
            ('granny', lambda: make_char('granny', build_granny(), char_atlas((96, 120, 70)), a.out, a.renders)),
            ('cottage', lambda: make_prop('cottage', list(build_cottage()), prop_tex('cottage'), a.out, a.renders, 8.5, [prop_tex('cottage'), prop_tex('roof')])),
            ('tree', lambda: make_prop('tree', [build_tree()], prop_tex('tree'), a.out, a.renders, 5.6)),
            ('barrel', lambda: make_prop('barrel', [build_barrel()], prop_tex('wood'), a.out, a.renders, 1.3)),
            ('fence', lambda: make_prop('fence', list(build_fence()), prop_tex('wood'), a.out, a.renders, 1.5))]
    for name, fn in jobs:
        if only and name not in only: continue
        reset(); d = fn()
        with open(os.path.join(a.out, name + '.json'), 'w') as f: json.dump(d, f, separators=(',', ':'))
        tris = sum(m['tris'] for m in d['meshes'].values())
        print(f'{name}: {tris} tris, glb {os.path.getsize(os.path.join(a.out, name + ".glb"))} B, json {os.path.getsize(os.path.join(a.out, name + ".json"))} B')


if __name__ == '__main__':
    main()
