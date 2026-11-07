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


def fur_swatch(w, h, seed):
    """Short soft fur: rows of small curved tufts on a soft light ground (for the boars), not long straight strokes."""
    im = painted(w, h, (246, 244, 240), seed, 0, grad=0.15, blot=0.08); d = ImageDraw.Draw(im, 'RGBA'); rr = random.Random(seed)
    for _ in range(int(w * h / 40)):
        x, y, L = rr.random() * w, rr.random() * h, 3 + rr.random() * 4
        d.line([(x - L * 0.5, y + L * 0.3), (x, y - L * 0.4), (x + L * 0.5, y + L * 0.3)], fill=(190, 182, 172, 140), width=1)
    return im.filter(ImageFilter.GaussianBlur(0.5))


def foe_atlas():
    """The foes' atlas: the characters' one with fur in place of the hair strands."""
    A = char_atlas((70, 52, 36)); A.paste(fur_swatch(128, 64, 41), (0, 128)); return A


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
    if kind == 'stone':     # rounded stone blocks in soft mortar (castle walls and towers, the windmill)
        T = Image.new('RGB', (256, 256), (205, 205, 210)); d = ImageDraw.Draw(T); rr = random.Random(5)
        for row in range(8):
            y = row * 32; off = 0 if row % 2 else 24
            for col in range(-1, 6):
                x = col * 48 + off; c = 236 + rr.randint(-10, 8)
                d.rounded_rectangle((x + 3, y + 3, x + 45, y + 29), radius=9, fill=(c, c, c - 2), outline=(190, 190, 198), width=2)
        return T.filter(ImageFilter.GaussianBlur(0.8))
    if kind == 'planks':    # vertical boards with a soft gap (the barn)
        T = painted(256, 256, (246, 242, 238), 33, 40, dirn='v', grad=0.06, blot=0.07); d = ImageDraw.Draw(T)
        for x in range(0, 256, 32): d.line([(x, 0), (x, 256)], fill=(200, 196, 192), width=3)
        return T.filter(ImageFilter.GaussianBlur(0.6))
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


def build_villager():
    """The villagers' parts (phase 2): one rounded storybook body cut into the parts the game poses and tints per person,
    each in its pivot's own frame (Blender: front -Y, up Z; the game's three.js frame after export):
      legs, body (from the feet), arm (from the shoulder, hanging), head (from the neck: head, ears, nose, painted mouth
      and blush, all tinted by the skin), eyes (painted, never tinted), hair styles (short, bun, long, curls), beard,
      hats (straw, top, hood, helmet) and an apron. Tinted parts are white in the model: the game colours each person."""
    W, D = (1, 1, 1), hexc('#5C3A26'); P = {}
    def part(name):
        P[name] = Builder('villager_' + name); return P[name]
    b = part('legs')
    for s in (1, -1):
        b.add(btube((0.13 * s, 0, 0.62), (0.135 * s, 0, 0.16), 0.11, 0.085, 8, 3), W, 'cloth2', 0, 'cloth')
        b.add(smooth(bsphere((0.14 * s, -0.05, 0.1), (0.12, 0.17, 0.1))), tuple(c * 1.0 for c in (0.42, 0.34, 0.3)), 'boots', 0, 'boots', wonk=0.006)
    b = part('body')
    b.add(smooth(bsphere((0, 0, 0.88), (0.31, 0.25, 0.34), (14, 9))), W, 'cloth', 0, 'cloth', wonk=0.01)
    b.add(blathe([(0.29, 0.52), (0.35, 0.55), (0.33, 0.68), (0.27, 0.8)], 16), W, 'cloth', 0, 'cloth')
    b.add(blathe([(0.31, 0.7), (0.318, 0.715), (0.312, 0.78), (0.296, 0.79)], 16), tuple(c * 0.55 for c in W), 'belt', 0, 'boots')
    for s in (1, -1):
        b.add(smooth(bsphere((0.34 * s, 0, 1.12), (0.13, 0.13, 0.12))), W, 'cloth', 0, 'cloth')
    b = part('arm')   # pivot at the shoulder; the arm hangs down, a small round hand at the end
    b.add(btube((0, 0, -0.04), (0.01, -0.01, -0.44), 0.075, 0.055, 9, 3), W, 'skin', 0, 'skin')
    b.add(smooth(bsphere((0.01, -0.01, -0.5), (0.075, 0.07, 0.08))), W, 'skin', 0, 'skin')
    b = part('head')  # pivot at the neck
    b.add(smooth(bsphere((0, 0, 0.4), (0.42, 0.4, 0.4), (16, 10))), W, 'skin', 0, 'skin', wonk=0.004)
    for s in (1, -1):
        b.add(smooth(bsphere((0.41 * s, 0.02, 0.37), (0.06, 0.05, 0.085))), W, 'skin', 0, 'skin')
        b.add(decal((0.25 * s, -0.355, 0.27), 0.11, 0.07, 0.6 * s, 0.1), W, 'skin', 0, 'blush', 'decal')
    b.add(smooth(bsphere((0, -0.405, 0.32), (0.045, 0.035, 0.035))), tuple(c * 0.93 for c in W), 'skin', 0, 'skin')
    b.add(decal((0, -0.395, 0.21), 0.17, 0.11, 0, 0.3), W, 'skin', 0, 'mouth', 'decal')
    b = part('eyes')
    for s in (1, -1):
        b.add(decal((0.15 * s, -0.4, 0.4), 0.24, 0.29, 0.36 * s, 0.08), (1, 1, 1), 'eye', 0, 'eye', 'decal')
    b = part('hair_short')
    b.add(smooth(bsphere((0, 0.045, 0.47), (0.44, 0.42, 0.36), (14, 8))), W, 'hair', 0, 'hair', wonk=0.01)
    for x in np.linspace(-0.27, 0.27, 5):
        b.add(smooth(bsphere((x, -0.3 + abs(x) * 0.35, 0.66 - abs(x) * 0.35), (0.12, 0.085, 0.1), (9, 6), (0.35, 0, -x * 1.4))), W, 'hair', 0, 'hair')
    b = part('hair_bun')
    b.add(smooth(bsphere((0, 0.05, 0.48), (0.43, 0.41, 0.33), (18, 10))), W, 'hair', 0, 'hair', wonk=0.008)
    b.add(smooth(bsphere((0, 0.14, 0.84), (0.18, 0.17, 0.16), (12, 8))), W, 'hair', 0, 'hair')
    b = part('hair_long')
    b.add(smooth(bsphere((0, 0.05, 0.48), (0.44, 0.42, 0.34), (18, 10))), W, 'hair', 0, 'hair', wonk=0.01)
    b.add(smooth(bsphere((0, 0.2, 0.15), (0.4, 0.2, 0.42), (14, 8))), W, 'hair', 0, 'hair', wonk=0.012)
    b = part('hair_curls')
    for i in range(14):
        a = i / 14 * 2 * math.pi; r = 0.33 if i % 2 else 0.27; z = 0.62 + (i % 3) * 0.06
        b.add(smooth(bsphere((math.cos(a) * r, math.sin(a) * r + 0.05, z), (0.15, 0.15, 0.14), (7, 5))), W, 'hair', 0, 'hair')
    b.add(smooth(bsphere((0, 0.05, 0.5), (0.43, 0.41, 0.3), (16, 9))), W, 'hair', 0, 'hair')
    b = part('beard')
    b.add(smooth(bsphere((0, -0.27, 0.16), (0.3, 0.2, 0.2), (14, 8))), W, 'hair', 0, 'hair', wonk=0.01)
    for s in (1, -1):
        b.add(smooth(bsphere((0.34 * s, -0.12, 0.3), (0.1, 0.12, 0.17), (9, 6))), W, 'hair', 0, 'hair')
    b = part('hat_straw')
    b.add(smooth(blathe([(0.05, 0.75), (0.7, 0.74), (0.72, 0.76), (0.4, 0.8), (0.36, 1.02), (0.05, 1.04)], 18)), W, 'other', 0, 'hair')
    b.add(blathe([(0.37, 0.8), (0.39, 0.8), (0.38, 0.87), (0.36, 0.87)], 18), (0.9, 0.3, 0.3), 'other', 0, 'boots')
    b = part('hat_top')
    b.add(smooth(blathe([(0.05, 0.76), (0.55, 0.75), (0.56, 0.79), (0.33, 0.81), (0.32, 1.35), (0.05, 1.36)], 16)), W, 'other', 0, 'cloth')
    b.add(blathe([(0.335, 0.82), (0.345, 0.82), (0.34, 0.92), (0.33, 0.92)], 16), hexc('#FFD23F'), 'metal', 0, 'boots')
    b = part('hat_hood')
    b.add(smooth(bsphere((0, 0.08, 0.5), (0.5, 0.48, 0.46), (16, 10))), W, 'other', 0, 'cloth', wonk=0.012)
    b.add(smooth(bsphere((0, 0.42, 0.1), (0.42, 0.2, 0.3), (12, 8))), W, 'other', 0, 'cloth')
    b = part('helmet')
    b.add(smooth(bsphere((0, 0.02, 0.62), (0.47, 0.46, 0.33), (16, 9))), hexc('#DDE6EE'), 'metal', 0, 'white')
    b.add(blathe([(0.46, 0.55), (0.49, 0.56), (0.49, 0.6), (0.46, 0.61)], 16, (0, 0.02, 0)), hexc('#B4C3D1'), 'metal', 0, 'white')
    b.add(smooth(bsphere((0, 0.05, 0.98), (0.05, 0.22, 0.12))), hexc('#2F6FC8'), 'other', 0, 'white')
    b = part('apron')
    b.add(smooth(bsphere((0, -0.24, 0.74), (0.27, 0.08, 0.27), (12, 8))), W, 'other', 0, 'cloth')
    return P


def tv(x, y, z):
    """The game's (three.js, Y-up, front +z) coordinates in Blender's (Z-up, front -Y)."""
    return (x, -z, y)


def tsph(c, r, segs=(12, 8), rot=(0, 0, 0)):
    """A smooth ellipsoid at a game-space centre with game-space radii (rx, ry, rz)."""
    return smooth(bsphere(tv(*c), (r[0], r[2], r[1]), segs, rot))


def ttube(a, b, r0, r1, segs=8, rings=3, cap=True):
    return smooth(btube(tv(*a), tv(*b), r0, r1, segs, rings, cap))


def tlathe(profile, segs, at=(0, 0, 0), turn=None):
    """A surface of revolution about the game's up axis from [(r, y), ...], optionally turned (Blender Euler)."""
    bm = smooth(blathe(profile, segs))
    if turn: bmesh.ops.transform(bm, matrix=euler(turn), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(tv(*at)), verts=bm.verts)
    return bm


def build_foes():
    """The simple foes (phase 2, step 3), one mesh per rig part, each in its pivot's own frame (the game poses the parts and
    tints the bodies per foe, e.g. green or pink jelly, brown or snowy boars): the Blobble (a wobbly jelly drop with a shine,
    a stalk and a leaf), the Grumblin and Chief Bonkbelly (round little goblins: tunic, a big head with droopy pointy ears and
    a saucepan or cooking-pot helmet, a club arm, an arm or a barrel-lid shield, stubby legs), the Puffcap (a grumpy
    mushroom: a soft stem with feet, a big spotted cap) and the Bristleboar (a round body with a bristly mane, a head with
    ears, a snout with tusks, four stubby legs). Faces and eyes stay the game's own (placed on these same surfaces)."""
    P = {}; W = (1, 1, 1)

    def part(name):
        P[name] = Builder('foes_' + name); return P[name]
    # Blobble: the dome keeps the game's face surface (centre y 0.42, radii 0.6, 0.46, 0.6)
    b = part('blobble_0')
    bm = tsph((0, 0.42, 0), (0.6, 0.46, 0.6), (18, 12))
    for v in bm.verts:   # a jelly drop: a flatter, wider base and a little peak toward the stalk
        if v.co.z < 0.22: v.co.z = 0.22 - (0.22 - v.co.z) * 0.6; v.co.x *= 1.04; v.co.y *= 1.04
        if v.co.z > 0.72: v.co.z += (v.co.z - 0.72) * 0.45
    b.add(bm, W, 'cloth', 0, 'skin', wonk=0.012)
    b.add(tsph((0.2, 0.68, 0.3), (0.14, 0.09, 0.08)), (1, 1, 1), 'other', 0, 'white')   # the shine
    b.add(ttube((0, 0.8, 0), (0.02, 1.0, -0.02), 0.04, 0.03, 6, 2), hexc('#8A5A3C'), 'wood', 0, 'boots')
    b.add(tsph((0.14, 1.0, 0), (0.18, 0.04, 0.09), (10, 6), (0, -0.45, 0)), hexc('#1F9D63'), 'leaf', 0, 'cloth')
    # Grumblin and the chief: the body from the feet; arms from the shoulders (+-0.3, 0.72); legs from the hips (0, 0.3)
    Wt = W
    for name, pot in (('grumblin', False), ('chief', True)):
        b = part(name + '_0'); tunic = hexc('#C9713A') if not pot else hexc('#C8402F'); W = hexc('#8ED27A') if not pot else hexc('#6DB866')   # their own green skin (no tint)
        b.add(tsph((0, 0.56, 0), (0.31, 0.31, 0.27), (14, 9)), tunic, 'cloth2', 0, 'cloth', wonk=0.01)
        b.add(tlathe([(0.29, 0.42), (0.305, 0.43), (0.3, 0.48), (0.28, 0.49)], 14), hexc('#5C3A26'), 'belt', 0, 'boots')
        b.add(tsph((0, 0.98, 0.02), (0.3, 0.27, 0.28), (16, 10)), W, 'skin', 0, 'skin', wonk=0.006)
        for s_ in (1, -1):   # pointy, droopy ears
            b.add(ttube((0.24 * s_, 1.0, 0), (0.47 * s_, 1.06, -0.04), 0.08, 0.015, 7, 3), W, 'skin', 0, 'skin')
        if pot:
            b.add(tlathe([(0.0, 1.4), (0.32, 1.38), (0.34, 1.12), (0.37, 1.1), (0.37, 1.13), (0.0, 1.15)], 16), hexc('#5E5A50'), 'metal', 0, 'white')
            b.add(tsph((0, 1.44, 0), (0.07, 0.05, 0.07)), hexc('#8F8A7C'), 'metal', 0, 'white')
        else:
            b.add(tlathe([(0.0, 1.27), (0.28, 1.26), (0.3, 1.11), (0.32, 1.1), (0.32, 1.13), (0.0, 1.14)], 16), hexc('#C6C2B5'), 'metal', 0, 'white')
            b.add(ttube((0, 1.18, -0.28), (0, 1.17, -0.62), 0.04, 0.035, 6, 2), hexc('#5C3A26'), 'wood', 0, 'boots')   # the saucepan handle
        for arm in (1, 2):   # from the shoulder: a hanging arm and a round fist; arm 1 holds the club, the chief's arm 2 a shield
            b = part(f'{name}_{arm}')
            b.add(ttube((0, -0.02, 0), (0, -0.3, 0), 0.08, 0.065, 8, 3), W, 'skin', 0, 'skin')
            b.add(tsph((0, -0.36, 0), (0.095, 0.09, 0.095)), W, 'skin', 0, 'skin')
            if arm == 1:
                L = 0.95 if pot else 0.68
                b.add(ttube((0, -0.35, -0.05), (0, -0.33, L), 0.055 if pot else 0.04, 0.14 if pot else 0.1, 8, 4), hexc('#BF7A45'), 'wood', 0, 'boots')
            elif pot:
                b.add(tlathe([(0.0, -0.03), (0.34, -0.03), (0.36, 0.0), (0.34, 0.03), (0.0, 0.05)], 16, (-0.02, -0.3, 0.12), (math.pi / 2, 0, 0)), hexc('#BF957A'), 'wood', 0, 'boots')
        b = part(f'{name}_3')
        for s_ in (1, -1):
            b.add(ttube((0.12 * s_, -0.02, 0), (0.12 * s_, -0.24, 0), 0.085, 0.075, 8, 3), hexc('#5C3A26'), 'cloth2', 0, 'cloth')
            b.add(tsph((0.12 * s_, -0.3, 0.05), (0.1, 0.07, 0.14)), hexc('#2B2220'), 'boots', 0, 'boots')
    W = Wt
    # Puffcap: the stem from the ground, the cap from (0, 0.86)
    b = part('puffcap_0')
    b.add(tlathe([(0.0, 0.02), (0.3, 0.03), (0.31, 0.2), (0.28, 0.5), (0.25, 0.8), (0.2, 0.88), (0.0, 0.9)], 16), hexc('#FFEAD8'), 'cloth', 0, 'skin', wonk=0.01)
    for s_ in (1, -1): b.add(tsph((0.13 * s_, 0.06, 0.08), (0.13, 0.08, 0.17)), hexc('#8A5A3C'), 'boots', 0, 'boots')
    b = part('puffcap_1')
    b.add(tlathe([(0.0, -0.08), (0.5, -0.07), (0.63, 0.02), (0.6, 0.18), (0.45, 0.33), (0.2, 0.41), (0.0, 0.42)], 18), hexc('#9B6BE8'), 'cloth', 0, 'cloth', wonk=0.015)
    for i in range(7):   # soft round spots, raised a touch from the cap
        if i < 6:
            a = i / 6 * 2 * math.pi + 0.3; c = (math.cos(a) * 0.5, 0.25, math.sin(a) * 0.5)
        else:
            c = (0, 0.42, 0)
        b.add(tsph(c, (0.11, 0.05, 0.11), (8, 5)), hexc('#FFE27A'), 'other', 0, 'white')
    # Bristleboar: the body from the ground; the head and the snout from (0, 0.62, 0.55); legs from (0, 0.34, 0)
    b = part('boar_0')
    b.add(tsph((0, 0.62, -0.05), (0.47, 0.42, 0.72), (16, 10)), W, 'cloth', 0, 'hair', wonk=0.012)
    for i in range(7):   # a bristly mane: soft tufts along the back
        z = -0.5 + i * 0.16
        b.add(ttube((0, 0.95 - abs(i - 3) * 0.03, z), (0, 1.2 - abs(i - 3) * 0.04, z - 0.08), 0.08, 0.01, 6, 2), hexc('#5E5A50'), 'hair', 0, 'hair')
    b.add(ttube((0, 0.7, -0.74), (0, 0.55, -0.92), 0.04, 0.012, 6, 2), W, 'cloth', 0, 'hair')   # the tail
    b = part('boar_1')
    b.add(tsph((0, 0.04, 0.1), (0.31, 0.29, 0.31), (14, 9)), W, 'cloth', 0, 'hair', wonk=0.006)
    for s_ in (1, -1): b.add(ttube((0.18 * s_, 0.25, 0.0), (0.26 * s_, 0.42, -0.08), 0.08, 0.02, 6, 3), W, 'cloth', 0, 'hair')   # ears
    b = part('boar_2')
    b.add(tlathe([(0.0, 0.0), (0.15, 0.01), (0.16, 0.08), (0.15, 0.15), (0.0, 0.16)], 12, (0, -0.03, 0.26), (math.pi / 2, 0, 0)), hexc('#FF9C8F'), 'skin', 0, 'skin')
    for s_ in (1, -1):
        b.add(tsph((0.05 * s_, -0.02, 0.43), (0.03, 0.035, 0.02)), hexc('#5C3A26'), 'other', 0, 'boots')
        b.add(ttube((0.12 * s_, -0.08, 0.34), (0.16 * s_, 0.08, 0.46), 0.035, 0.008, 6, 3), hexc('#FFFDF2'), 'other', 0, 'white')   # tusks
    b = part('boar_3')
    for sx in (1, -1):
        for sz in (1, -1):
            b.add(ttube((0.24 * sx, -0.06, 0.38 * sz), (0.24 * sx, -0.44, 0.38 * sz), 0.085, 0.07, 8, 3), W, 'cloth', 0, 'hair')
            b.add(tsph((0.24 * sx, -0.48, 0.38 * sz + 0.02), (0.09, 0.05, 0.1)), hexc('#2B2220'), 'boots', 0, 'boots')
    return P


def build_big():
    """The bigger foes (phase 2, step 4), each part in its pivot's own frame like the game's rigs:
    the Clank Knight (an empty suit of storybook armour, nobody inside: a round breastplate with a violet sash, round
    pauldrons, a bucket helm with a dark visor slit and a plume; a sword arm, a shield arm, two greaved legs; the game's
    glowing eyes sit in the visor), and Lord Snarlwick (a tall violet robe with a jagged hem and a high collar, a long pale
    head keeping the game's face surface, a long pointed nose, a huge curly moustache, a horned gold crown, two arms, a
    staff for the Gloom Gem). The Big Clank is the Clank scaled and tinted by the game."""
    P = {}

    def part(name):
        P[name] = Builder('big_' + name); return P[name]
    steel, steelD, steelL, violet, dark = hexc('#8A9BB2'), hexc('#4E5A6C'), hexc('#D4DEEA'), hexc('#9B6BE8'), hexc('#2B2220')
    b = part('clank_0')   # the body from the ground: breastplate, belt, pauldrons, helm
    b.add(tsph((0, 0.9, 0), (0.36, 0.36, 0.25), (14, 9)), steel, 'metal', 0, 'white', wonk=0.006)
    b.add(tsph((0, 0.97, 0.06), (0.29, 0.28, 0.2), (12, 8)), steelL, 'metal', 0, 'white')
    b.add(ttube((-0.2, 1.22, 0.24), (0.22, 0.6, 0.21), 0.05, 0.05, 6, 3), violet, 'cloth', 0, 'cloth')   # the sash
    b.add(tlathe([(0.33, 0.56), (0.36, 0.58), (0.36, 0.64), (0.33, 0.66)], 14), hexc('#C99A00'), 'metal', 0, 'white')   # a gold belt
    for s_ in (1, -1):
        b.add(tsph((0.38 * s_, 1.42, 0), (0.2, 0.15, 0.22), (10, 7)), steelL, 'metal', 0, 'white')
        b.add(tsph((0.38 * s_, 1.48, 0), (0.06, 0.04, 0.06), (6, 4)), hexc('#FFD23F'), 'metal', 0, 'white')   # gold rivets
    bm = tlathe([(0.0, 1.27), (0.24, 1.28), (0.26, 1.4), (0.25, 1.65), (0.22, 1.76), (0.0, 1.8)], 16)
    b.add(bm, steel, 'metal', 0, 'white', wonk=0.004)
    b.add(bbox_rounded((0.36, 0.06, 0.09), tv(0, 1.69, 0.235), 0.025, 2), dark, 'other', 0, 'boots')   # the visor slit
    b.add(ttube((0, 1.8, 0.05), (0, 2.02, -0.15), 0.07, 0.12, 8, 3), violet, 'cloth', 0, 'cloth')   # the plume
    b = part('clank_1')   # the sword arm, from the shoulder
    b.add(ttube((0, -0.05, 0), (0, -0.5, 0), 0.1, 0.09, 8, 3), steel, 'metal', 0, 'white')
    b.add(tsph((0, -0.58, 0), (0.12, 0.12, 0.12)), steelD, 'metal', 0, 'white')
    b.add(bbox_rounded((0.32, 0.08, 0.07), tv(0, -0.62, 0.04), 0.03, 2), steelD, 'metal', 0, 'white')
    blade = smooth(btube(tv(0, -0.59, 0.08), tv(0, -0.59, 1.0), 0.06, 0.04, 4, 3))
    for v in blade.verts: v.co.x *= 0.35   # a flat blade
    b.add(blade, steelL, 'metal', 0, 'white')
    b.add(ttube((0, -0.62, -0.02), (0, -0.62, -0.24), 0.035, 0.035, 6, 2), hexc('#5C3A26'), 'wood', 0, 'boots')
    b = part('clank_2')   # the shield arm: a round-cornered kite shield with the violet cross
    b.add(ttube((0, -0.05, 0), (0, -0.5, 0), 0.1, 0.09, 8, 3), steel, 'metal', 0, 'white')
    b.add(bbox_rounded((0.62, 0.08, 0.74), tv(-0.04, -0.86, 0.17), 0.12, 2), steelD, 'metal', 0, 'white')
    b.add(bbox_rounded((0.12, 0.02, 0.52), tv(-0.04, -0.82, 0.215), 0.03, 1), violet, 'cloth', 0, 'cloth')
    b.add(bbox_rounded((0.42, 0.02, 0.1), tv(-0.04, -0.66, 0.215), 0.03, 1), violet, 'cloth', 0, 'cloth')
    b = part('clank_3')   # legs from the hips
    for s_ in (1, -1):
        b.add(ttube((0.16 * s_, -0.04, 0), (0.16 * s_, -0.5, 0), 0.12, 0.1, 8, 3), steel, 'metal', 0, 'white')
        b.add(tsph((0.16 * s_, -0.58, 0.06), (0.13, 0.08, 0.19)), steelD, 'metal', 0, 'white')
    # Lord Snarlwick: a robe (body), a head (head space: the game's face surface, centre y 0.4, radii 0.34, 0.44, 0.34),
    # the crown (head space), and the arms (shoulders at +-0.42, 1.78); the right hand holds the staff
    robe, robe2, skin, gold, stache = hexc('#6C44C0'), hexc('#9B6BE8'), hexc('#ECE2FB'), hexc('#FFD23F'), hexc('#C6A9F3')
    b = part('snarl_body')
    bm = tlathe([(0.0, 0.0), (0.66, 0.0), (0.62, 0.3), (0.5, 0.8), (0.38, 1.3), (0.33, 1.6), (0.18, 1.85), (0.0, 1.9)], 16)
    for v in bm.verts:   # a jagged hem
        if v.co.z < 0.05 and math.hypot(v.co.x, v.co.y) > 0.3: a = math.atan2(v.co.y, v.co.x); v.co.z += 0.08 * (1 + math.sin(a * 8))
    b.add(bm, robe, 'cloth', 0, 'cloth', wonk=0.01)
    b.add(tsph((0, 1.05, 0.05), (0.36, 0.4, 0.26), (12, 8)), robe2, 'cloth', 0, 'cloth')
    b.add(tlathe([(0.37, 0.98), (0.385, 1.0), (0.38, 1.06), (0.36, 1.07)], 14, (0, 0, 0.05)), gold, 'metal', 0, 'white')
    for i in range(3): b.add(tsph((0, 1.25 + i * 0.16, 0.28), (0.045, 0.045, 0.03)), gold, 'metal', 0, 'white')
    for s_ in (1, -1):   # the high pointed collar
        b.add(ttube((0.22 * s_, 1.62, -0.02), (0.38 * s_, 2.15, -0.1), 0.12, 0.02, 6, 3), robe, 'cloth', 0, 'cloth')
    b.add(tsph((0, 0.95, -0.3), (0.56, 0.9, 0.12), (12, 8)), robe, 'cloth2', 0, 'cloth', wonk=0.015)   # the cape, behind
    b = part('snarl_head')
    b.add(tsph((0, 0.4, 0), (0.34, 0.44, 0.34), (16, 11)), skin, 'skin', 0, 'skin', wonk=0.004)
    b.add(ttube((0, 0.38, 0.28), (0, 0.3, 0.62), 0.075, 0.012, 8, 3), hexc('#DCCBEE'), 'skin', 0, 'skin')   # the long nose
    for s_ in (1, -1):
        b.add(tsph((0.33 * s_, 0.42, 0), (0.06, 0.12, 0.08)), skin, 'skin', 0, 'skin')
        # the huge curly moustache: a chain of soft lobes curling up at each end
        for k, (x, y, z, r) in enumerate([(0.08, 0.24, 0.32, 0.12), (0.2, 0.24, 0.3, 0.12), (0.33, 0.28, 0.26, 0.1), (0.43, 0.36, 0.22, 0.08), (0.46, 0.46, 0.2, 0.06), (0.42, 0.52, 0.19, 0.045)]):
            b.add(tsph((x * s_, y, z), (r * 1.15, r * 0.8, r * 0.9), (9, 6)), stache, 'hair', 0, 'hair')
    b = part('snarl_crown')
    b.add(tlathe([(0.28, 0.68), (0.31, 0.69), (0.31, 0.82), (0.28, 0.83)], 16), gold, 'metal', 0, 'white')
    for s_ in (1, -1):   # curly horns
        pts = [(0.26 * s_, 0.8, -0.02), (0.4 * s_, 0.98, -0.05), (0.52 * s_, 1.06, -0.1), (0.58 * s_, 1.0, -0.12)]
        for a_, c_ in zip(pts, pts[1:]): b.add(ttube(a_, c_, 0.07 - pts.index(a_) * 0.015, 0.055 - pts.index(a_) * 0.015, 7, 2), gold, 'metal', 0, 'white')
    for i in range(5):
        a = i / 5 * 2 * math.pi; b.add(tsph((math.cos(a) * 0.31, 0.76, math.sin(a) * 0.31), (0.04, 0.04, 0.04), (6, 4)), hexc('#C6A9F3'), 'other', 0, 'white')
    for side in ('L', 'R'):
        b = part('snarl_arm' + side)
        b.add(ttube((0, -0.05, 0), (0, -0.62, 0), 0.12, 0.11, 8, 3), robe2, 'cloth', 0, 'cloth')
        b.add(tlathe([(0.02, 0.0), (0.2, 0.0), (0.2, 0.06), (0.1, 0.25)], 10, (0, -0.86, 0)), robe2, 'cloth', 0, 'cloth')   # the flared cuff
        b.add(tsph((0, -0.84, 0), (0.1, 0.1, 0.1)), skin, 'skin', 0, 'skin')
        if side == 'R':
            b.add(ttube((0, -1.9, 0.12), (0, 0.5, 0.12), 0.05, 0.045, 7, 4, cap=False), hexc('#5C3A26'), 'wood', 0, 'boots')
            b.add(tlathe([(0.0, 0.42), (0.13, 0.5), (0.15, 0.6), (0.0, 0.66)], 10, (0, 0, 0.12)), hexc('#5C3A26'), 'wood', 0, 'boots')
            for i in range(3):
                a = i / 3 * 2 * math.pi; b.add(ttube((math.cos(a) * 0.1, 0.55, 0.12 + math.sin(a) * 0.1), (math.cos(a) * 0.13, 0.82, 0.12 + math.sin(a) * 0.13), 0.025, 0.012, 5, 2), gold, 'metal', 0, 'white')
    return P


CINDER_PAL = {'spell': {'body': '#7d55b8', 'belly': '#b9a3e0', 'horn': '#3f2a5e', 'wing': '#5b3d8a', 'claw': '#2b1d40'},
              'free': {'body': '#ff6a3d', 'belly': '#ffe3b0', 'horn': '#ffd27f', 'wing': '#ffb36b', 'claw': '#fff1d6'}}


def wing_fan(s_, P):
    """A dragon wing in the shoulder's frame (game space): a round arm bone out along x, three finger bones sweeping
    back, and a soft membrane between them with a scalloped trailing edge (both faces, so it shows from below too)."""
    B = Builder('tmp'); bones = []
    tip = (s_ * 4.4, -0.1, -0.2)
    bones.append(ttube((0, -0.12, -0.12), tip, 0.2, 0.09, 8, 4))
    fingers = []
    for f in range(3):
        root = (s_ * (1.5 + f * 1.45), -0.1, -0.12); L = 2.6 - f * 0.3; a = 0.15 + f * 0.12
        end = (root[0] + s_ * math.sin(a) * L * 0.35, -0.12, root[2] - L); fingers.append((root, end))
        bones.append(ttube(root, end, 0.08, 0.04, 6, 3))
    # the membrane: shoulder, along the arm, then each finger tip, with a sag between tips
    pts = [(s_ * 0.3, -0.12, -0.1)] + [fingers[0][0], fingers[0][1]]
    for f in range(1, 3):
        a, b = fingers[f - 1][1], fingers[f][1]; m = ((a[0] + b[0]) / 2, -0.12, (a[2] + b[2]) / 2 + 0.55)
        pts += [m, b]
    pts += [tip]
    mem = bmesh.new(); vs = [mem.verts.new(tv(*q)) for q in pts]; c = mem.verts.new(tv(s_ * 2.6, -0.1, -1.0))
    for i in range(len(vs)):
        j = (i + 1) % len(vs); f = mem.faces.new([c, vs[i], vs[j]] if s_ > 0 else [c, vs[j], vs[i]]); f.smooth = True
    back = mem.copy(); bmesh.ops.reverse_faces(back, faces=back.faces[:])
    for v in back.verts: v.co.z -= 0.012
    return bones, mem, back


def build_cinder(pal):
    """Cinder (phase 2, step 5): a chunky, friendly storybook dragon in the given palette, one mesh per part in its pivot's
    frame like the game's: a round body with a big soft belly, stubby legs with round toes and claws, soft spikes down the
    back; a curving neck with the Gloom Collar; a big round head (the game's eyes sit on it) with a round snout, cheek frills
    and curly horns; a jaw; two wings (arm, fingers, a scalloped membrane); a tapering tail in two segments with a spade."""
    P = {k: hexc(v) for k, v in CINDER_PAL[pal].items()}; parts = {}

    def part(n):
        parts[n] = Builder(f'cinder_{pal}_{n}'); return parts[n]
    b = part('body')
    b.add(tsph((0, 2.7, 0), (1.55, 1.45, 2.3), (18, 12)), P['body'], 'cloth', 0, 'skin', wonk=0.02)
    b.add(tsph((0, 2.25, 0.35), (1.25, 1.1, 1.95), (16, 10)), P['belly'], 'cloth2', 0, 'cloth', wonk=0.015)
    for i in range(6):   # soft rounded spikes down the back
        z = 1.5 - i * 0.7; y = 3.9 + math.sin(i / 5 * math.pi) * 0.25
        b.add(ttube((0, y, z), (0, y + 0.55, z - 0.25), 0.3, 0.05, 7, 3), P['horn'], 'other', 0, 'white')
    for x, z, r in ((0.95, 1.25, 0.46), (-0.95, 1.25, 0.46), (1.05, -1.25, 0.56), (-1.05, -1.25, 0.56)):
        b.add(ttube((x, 2.2, z), (x, 0.35, z), r * 1.15, r, 8, 3), P['body'], 'cloth', 0, 'skin')
        b.add(tsph((x, 0.3, z + 0.12), (r * 1.2, 0.34, r * 1.35), (10, 6)), P['body'], 'cloth', 0, 'skin')
        for c in (-1, 0, 1): b.add(tsph((x + c * r * 0.5, 0.18, z + r * 1.25), (0.1, 0.1, 0.16), (6, 4)), P['claw'], 'other', 0, 'white')
    b = part('neck')   # pivot (0, 3.3, 1.8)
    pts = [(0, -0.3, -0.05), (0, 0.5, 0.35), (0, 1.15, 0.85), (0, 1.75, 1.3)]
    for i, (a, c) in enumerate(zip(pts, pts[1:])): b.add(ttube(a, c, 0.78 - i * 0.1, 0.68 - i * 0.1, 10, 3), P['body'], 'cloth', 0, 'skin')
    for i in range(4): b.add(tsph((0, 0.2 + i * 0.42, 0.4 + i * 0.27), (0.48, 0.24, 0.3), (8, 5), (0.62, 0, 0)), P['belly'], 'cloth2', 0, 'cloth')
    tor = smooth(blathe([(0.74, -0.12), (0.98, -0.12), (0.98, 0.12), (0.74, 0.12)], 18, caps=False))
    bmesh.ops.transform(tor, matrix=Matrix.Translation(tv(0, 0.25, 0.18)) @ euler((0.62, 0, 0)), verts=tor.verts); b.add(tor, hexc('#3a2350'), 'metal', 0, 'white')
    b = part('head')   # pivot at the top of the neck; the head keeps the game's eye surface (centre (0, 0.25, 0.1))
    b.add(tsph((0, 0.25, 0.1), (0.95, 0.85, 1.05), (18, 12)), P['body'], 'cloth', 0, 'skin', wonk=0.01)
    b.add(tsph((0, 0.05, 0.95), (0.72, 0.5, 0.85), (14, 9)), P['body'], 'cloth', 0, 'skin')
    b.add(tsph((0, -0.12, 1.05), (0.58, 0.28, 0.75), (12, 8)), P['belly'], 'cloth2', 0, 'cloth')
    for s_ in (1, -1):
        b.add(tsph((s_ * 0.25, 0.2, 1.76), (0.07, 0.05, 0.04), (6, 4)), P['belly'], 'other', 0, 'white')
        hp = [(s_ * 0.42, 0.8, -0.25), (s_ * 0.6, 1.35, -0.55), (s_ * 0.55, 1.6, -0.95), (s_ * 0.38, 1.55, -1.15)]   # a curly horn
        for i, (a, c) in enumerate(zip(hp, hp[1:])): b.add(ttube(a, c, 0.17 - i * 0.045, 0.13 - i * 0.045, 8, 2), P['horn'], 'other', 0, 'white')
        for i in range(3): b.add(ttube((s_ * 0.85, 0.15 + i * 0.22, -0.15 - i * 0.12), (s_ * 1.25, 0.3 + i * 0.25, -0.35 - i * 0.12), 0.1, 0.02, 6, 2), P['wing'], 'other', 0, 'white')   # cheek frills
        b.add(bbox_rounded((0.3, 0.13, 0.08), tv(s_ * 0.34, 0.76, 0.84), 0.035, 2, (0, 0, s_ * 0.25)), hexc('#2b1d40'), 'hair', 0, 'boots')   # brows
    b = part('jaw')
    b.add(tsph((0, -0.06, 0.62), (0.62, 0.22, 0.78), (12, 7)), P['belly'], 'cloth2', 0, 'cloth')
    for s_ in (1, -1): b.add(ttube((s_ * 0.26, 0.0, 1.2), (s_ * 0.26, 0.2, 1.24), 0.05, 0.01, 5, 2), (1, 1, 1), 'other', 0, 'white')
    for side, s_ in (('wingL', -1), ('wingR', 1)):
        b = part(side); bones, mem, back = wing_fan(s_, P)
        for bm in bones: b.add(bm, P['horn'], 'other', 0, 'white')
        b.add(mem, P['wing'], 'cloth', 0, 'cloth'); b.add(back, P['wing'], 'cloth', 0, 'cloth')
    b = part('tail1')
    b.add(ttube((0, 0, 0.2), (0, -0.3, -2.8), 0.75, 0.42, 10, 4), P['body'], 'cloth', 0, 'skin')
    b.add(ttube((0, 0.55, -1.0), (0, 0.95, -1.35), 0.2, 0.04, 6, 2), P['horn'], 'other', 0, 'white')
    b = part('tail2')
    b.add(ttube((0, 0, 0.15), (0, 0, -2.5), 0.42, 0.15, 8, 4), P['body'], 'cloth', 0, 'skin')
    sp = tsph((0, 0, -2.75), (0.5, 0.12, 0.55), (10, 6))
    for v in sp.verts:   # a spade: pointed at the back
        if v.co.y > 2.75: v.co.y += (v.co.y - 2.75) * 0.9
    b.add(sp, P['horn'], 'other', 0, 'white')
    return parts


def build_buildings():
    """Buildings (phase 2, step 6), as the game places them (each mesh's origin where the game's own shell stood):
      barn: the red barn's shell, 14 x 7 x 10 (x, y, z in the game's local frame before its turn), with a flat walkable
        roof deck at 7.3, white trim, an X-braced door and loft windows, a cupola (white plaster, all tinted by nothing:
        coloured here); the shed, the hay and the haystack stay the game's
      mill: the windmill's tapered round tower (r 3.4 at the foot, 2.4 at 12.3 m) and its pointed red roof, a round door
      tower: a castle tower, radius 6.15 and 1 m tall (the game scales it to each tower's height), a stone band and a
        walk-on top; its merlons, windows, flag and stairs stay the game's
      wall: a 4 m stretch of castle wall, 1 m tall and 3 m thick (the game repeats and scales it along each wall)
    Stone parts take the stone-block texture, the barn the plank texture (the game picks by mesh)."""
    P = {}

    def part(n):
        P[n] = Builder('bld_' + n); return P[n]
    red, redD, white, stone, stoneD, roofR = hexc('#D9483B'), hexc('#8E2A22'), hexc('#FFFDF2'), hexc('#EEECE5'), hexc('#C6C2B5'), hexc('#E0533F')
    b = part('barn')
    bm = bbox_rounded((14, 10, 7), tv(0, 3.5, 0), 0.35, 2)
    for v in bm.verts: v.co.x *= 1 + 0.015 * math.sin(v.co.z * 0.9)   # a little storybook bow in the walls
    b.add(bm, red, 'wood', 0, tile=(0.5, 0.0, 1.0))
    b.add(bbox_rounded((14.7, 10.7, 0.35), tv(0, 7.15, 0), 0.15, 2), redD, 'wood', 0, tile=(0.5, 0.0, 1.0))   # the roof deck
    b.add(bbox_rounded((14.9, 10.9, 0.18), tv(0, 6.9, 0), 0.08, 1), white, 'other', 0, tile=(0.5, 0.0, 1.0))   # eaves trim
    for sx in (-1, 1):
        for sz in (-1, 1): b.add(bbox_rounded((0.4, 0.4, 7.0), tv(sx * 6.95, 3.5, sz * 4.95), 0.15, 1), white, 'other', 0, tile=(0.5, 0, 1.0))   # corner boards
    b.add(bbox_rounded((4.6, 0.25, 4.7), tv(0, 2.35, 5.05), 0.14, 2), redD, 'wood', 0, tile=(0.5, 0.0, 1.0))   # the door
    for s_ in (1, -1):
        b.add(ttube((-2.05 * s_, 0.25, 5.2), (2.05 * s_, 4.45, 5.2), 0.11, 0.11, 6, 2), white, 'other', 0, tile=(0.5, 0, 1.0))   # the X brace
        b.add(bbox_rounded((1.3, 0.2, 1.3), tv(s_ * 4.6, 5.3, 5.05), 0.1, 1), white, 'other', 0, tile=(0.5, 0, 1.0))
        b.add(bbox_rounded((1.0, 0.1, 1.0), tv(s_ * 4.6, 5.3, 5.12), 0.08, 1), hexc('#93CBF6'), 'glass', 0, tile=(0.5, 0, 1.0))
    b.add(bbox_rounded((4.9, 0.25, 0.3), tv(0, 4.75, 5.12), 0.1, 1), white, 'other', 0, tile=(0.5, 0, 1.0))
    b.add(bbox_rounded((2.2, 2.2, 1.6), tv(0, 8.1, 0), 0.15, 2), white, 'wall', 0, tile=(0.5, 0, 1.0))   # the cupola
    cup = smooth(blathe([(1.75, 0.0), (1.2, 0.6), (0.3, 1.45), (0.0, 1.55)], 4))
    bmesh.ops.transform(cup, matrix=Matrix.Translation(tv(0, 8.85, 0)) @ euler((0, 0, math.pi / 4)), verts=cup.verts); b.add(cup, redD, 'roof', 0, tile=(0.5, 0, 1.0))
    b = part('mill')
    b.add(tlathe([(0.0, 0.0), (3.45, 0.0), (3.25, 3.0), (2.85, 8.0), (2.45, 12.3), (0.0, 12.35)], 16), stone, 'other', 0, 'white', wonk=0.04)
    b.add(tlathe([(2.5, 12.2), (3.4, 12.15), (3.3, 12.6), (2.1, 14.4), (1.0, 15.6), (0.25, 16.2), (0.0, 16.25)], 16), roofR, 'roof', 0, 'white', wonk=0.03)
    b.add(bbox_rounded((1.4, 0.35, 2.3), tv(0, 1.15, 3.3), 0.25, 2), hexc('#8A5A3C'), 'wood', 0, 'white')
    for i in range(3):
        a = i * 2.1 + 0.6; r = 3.0 - i * 0.12
        b.add(bbox_rounded((0.8, 0.25, 1.0), tv(math.sin(a) * r, 3.5 + i * 3.2, math.cos(a) * r), 0.12, 1, (0, 0, -a)), hexc('#5C3A26'), 'glass', 0, 'white')
    b = part('tower')   # radius 6.15, 1 m tall: the game scales y to each tower
    b.add(tlathe([(0.0, 0.0), (6.3, 0.0), (6.2, 0.15), (6.1, 0.92), (6.25, 0.95), (6.25, 1.0), (0.0, 1.0)], 20), stone, 'other', 0, 'white')
    b = part('wall')    # a 4 m stretch: x from -2 to 2, y 0..1, z -1.5..1.5
    bm = bbox_rounded((4.0, 3.0, 1.0), tv(0, 0.5, 0), 0.18, 1)
    b.add(bm, stone, 'other', 0, 'white')
    return P


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
def lod(ob, ratio):
    """A lighter copy of a mesh for the distance (Blender's Decimate, collapse), as a compact mesh."""
    mod = ob.modifiers.new('lod', 'DECIMATE'); mod.ratio = ratio; mod.use_collapse_triangulate = True
    dg = bpy.context.evaluated_depsgraph_get(); me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg)); ob.modifiers.remove(mod)
    tmp = bpy.data.objects.new(ob.name + '_lod', me); out = compact(tmp); bpy.data.objects.remove(tmp); bpy.data.meshes.remove(me)
    return out


def compact(ob, rig=None, bone_names=None):
    """The mesh in the game's compact form: indexed triangles, quantised position (int16 over its bounds), normal (int8),
    uv (uint16 over [-4, 4]), colour + part (uint8 rgba), bone (uint8)."""
    me = ob.data
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
    # normals: octahedral, two signed bytes each (the pack stays small; the game decodes them)
    n3 = np.array([v[1] for v in verts], 'float32'); n3 /= np.maximum(np.abs(n3).sum(1, keepdims=True), 1e-6)
    ox, oy = n3[:, 0].copy(), n3[:, 1].copy(); neg = n3[:, 2] < 0
    ox[neg], oy[neg] = (1 - np.abs(n3[neg, 1])) * np.sign(n3[neg, 0] + 1e-9), (1 - np.abs(n3[neg, 0])) * np.sign(n3[neg, 1] + 1e-9)
    N = np.round(np.clip(np.stack([ox, oy], 1), -1, 1) * 127).astype('<i1')
    U = np.round(np.clip((np.array([v[2] for v in verts], 'float32') + 4) / 8, 0, 1) * 65535).astype('<u2')
    C = np.round(np.clip(np.array([v[3] for v in verts], 'float32'), 0, 1) * 255).astype('u1')
    Bn = np.array([v[4] for v in verts], 'u1')
    I = np.array(idx, '<u2' if len(verts) < 65536 else '<u4')
    b64 = lambda a: base64.b64encode(a.tobytes()).decode()
    out = {'verts': len(verts), 'tris': len(idx) // 3, 'min': mn.round(5).tolist(), 'max': mx.round(5).tolist(), 'pos': b64(q), 'nrm': b64(N), 'uv': b64(U), 'col': b64(C), 'idx': b64(I)}
    if Bn.any(): out['bone'] = b64(Bn)   # only skinned meshes carry bones (the pack stays small)
    return out


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
    sc.eevee.taa_render_samples = 8   # flat toon colours need few samples (the review renders are slow otherwise)
    sc.view_settings.view_transform = 'Standard'
    if sc.world is None: sc.world = bpy.data.worlds.new('w')
    for o in objs:
        img = o.data.materials[0].node_tree.nodes['Image Texture'].image if o.data.materials and o.data.materials[0].node_tree.nodes.get('Image Texture') else None
        if o.data.materials[0].name.startswith('toon_review'): continue
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
    bpy.data.objects.remove(sun); bpy.data.objects.remove(cam)


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
    url, nb = tex_url(atlas, 80); data['tex'] = url
    if renders:
        turntable(os.path.join(out, 'turn_' + name + '.png'), [ob], 1.75)
    return data


def make_villager(out, renders):
    """The villager parts as one asset (a mesh per part); the review turntable assembles two people from them."""
    P = build_villager(); tex = char_atlas((70, 52, 36)); mat = material('villager_mat', to_bimg(tex, 'villager_tex'))
    obs = {n: b.mesh(mat) for n, b in P.items()}
    export_glb(os.path.join(out, 'villager.glb'), list(obs.values()))
    # one light version of each part (decimated to about half: the villagers are seen at a few metres, never close up),
    # for the crowd, the named people and their lines alike; the start pack stays small
    data = {'name': 'villager', 'meshes': {n: (lod(o, 0.5) if n != 'eyes' and len(o.data.polygons) > 200 else compact(o)) for n, o in obs.items()}, 'tex': tex_url(tex, 80)[0]}
    if renders:   # two people: short hair and a straw hat; a bun and an apron (tints painted on for the review)
        def tint(o, c):
            col = o.data.color_attributes.get('Col')
            for d in col.data: d.color = (d.color[0] * c[0], d.color[1] * c[1], d.color[2] * c[2], d.color[3])
        show = []
        for k, (dx, hair, hat, shirt, pants, skin, hc) in enumerate([(-0.7, 'hair_short', 'hat_straw', hexc('#4FA8F0'), hexc('#8A5A3C'), hexc('#E8B48A'), hexc('#5C3A26')),
                                                                     (0.7, 'hair_bun', 'apron', hexc('#FF6B5B'), hexc('#2F6FC8'), hexc('#96603A'), hexc('#2B2220'))]):
            for n, loc, c in [('legs', (0, 0, 0), pants), ('body', (0, 0, 0), shirt), ('head', (0, 0, 1.22), skin), ('eyes', (0, 0, 1.22), (1, 1, 1)), (hair, (0, 0, 1.22), hc),
                              (hat, (0, 0, 1.22) if hat != 'apron' else (0, 0, 0), (1, 1, 1)), ('arm', (0.39, 0, 1.17), skin), ('arm', (-0.39, 0, 1.17), skin)]:
                o = obs[n].copy(); o.data = obs[n].data.copy(); bpy.context.scene.collection.objects.link(o); o.location = (loc[0] + dx, loc[1], loc[2]); tint(o, c); show.append(o)
        for o in obs.values(): o.hide_render = True
        turntable(os.path.join(out, 'turn_villager.png'), show, 2.4)
    return data


def make_foes(out, renders):
    P = build_foes(); tex = foe_atlas(); mat = material('foes_mat', to_bimg(tex, 'foes_tex'))
    obs = {n: b.mesh(mat) for n, b in P.items()}
    export_glb(os.path.join(out, 'foes.glb'), list(obs.values()))
    data = {'name': 'foes', 'meshes': {n: compact(o) for n, o in obs.items()}, 'tex': tex_url(tex, 80)[0]}
    for n, o in obs.items():
        if data['meshes'][n]['tris'] > 300: data['meshes'][n]['lod1'] = lod(o, 0.22)
    if renders:   # a turntable per foe, assembled at its pivots (game space -> Blender), in a typical tint
        PIV = {'blobble': [(0, 0, 0)], 'grumblin': [(0, 0, 0), (0.3, 0.72, 0), (-0.3, 0.72, 0), (0, 0.3, 0)], 'puffcap': [(0, 0, 0), (0, 0.86, 0)],
               'boar': [(0, 0, 0), (0, 0.62, 0.55), (0, 0.62, 0.55), (0, 0.34, 0)], 'chief': [(0, 0, 0), (0.3, 0.72, 0), (-0.3, 0.72, 0), (0, 0.3, 0)]}
        TINT = {'blobble': hexc('#7EE05A'), 'grumblin': (1, 1, 1), 'puffcap': (1, 1, 1), 'boar': hexc('#A8714A'), 'chief': (1, 1, 1)}
        for o in obs.values(): o.hide_render = True
        for fn, pv in PIV.items():
            show = []
            for i, p in enumerate(pv):
                src = obs[f'{fn}_{i}']; o = src.copy(); o.data = src.data.copy(); bpy.context.scene.collection.objects.link(o); o.hide_render = False
                o.location = Vector(tv(*p))
                if not (fn == 'boar' and i == 2):
                    for dd in o.data.color_attributes.get('Col').data: dd.color = (dd.color[0] * TINT[fn][0], dd.color[1] * TINT[fn][1], dd.color[2] * TINT[fn][2], dd.color[3])
                show.append(o)
            turntable(os.path.join(out, f'turn_{fn}.png'), show, 1.9 if fn != 'boar' else 1.6)
            for o in show: bpy.data.objects.remove(o)
    return data


def make_big(out, renders):
    P = build_big(); tex = char_atlas((70, 52, 36)); mat = material('big_mat', to_bimg(tex, 'big_tex'))
    obs = {n: b.mesh(mat) for n, b in P.items()}
    export_glb(os.path.join(out, 'big.glb'), list(obs.values()))
    data = {'name': 'big', 'meshes': {n: compact(o) for n, o in obs.items()}, 'tex': tex_url(tex, 80)[0]}
    for n, o in obs.items():
        if data['meshes'][n]['tris'] > 300: data['meshes'][n]['lod1'] = lod(o, 0.22)
    if renders:
        PIV = {'clank': [('clank_0', (0, 0, 0)), ('clank_1', (0.42, 1.36, 0)), ('clank_2', (-0.42, 1.36, 0)), ('clank_3', (0, 0.62, 0))],
               'snarlwick': [('snarl_body', (0, 0, 0)), ('snarl_head', (0, 1.9, 0)), ('snarl_crown', (0, 1.9, 0)), ('snarl_armL', (-0.42, 1.78, 0)), ('snarl_armR', (0.42, 1.78, 0))]}
        for o in obs.values(): o.hide_render = True
        for fn, pv in PIV.items():
            show = []
            for n, p in pv:
                o = obs[n].copy(); o.data = obs[n].data.copy(); bpy.context.scene.collection.objects.link(o); o.hide_render = False; o.location = Vector(tv(*p)); show.append(o)
            turntable(os.path.join(out, f'turn_{fn}.png'), show, 2.4 if fn == 'clank' else 3.2)
            for o in show: bpy.data.objects.remove(o)
    return data


def make_cinder(out, renders):
    """Cinder in both palettes (the same meshes): the spellbound one with a second colour set for the freed one."""
    tex = foe_atlas(); A = build_cinder('spell'); Bf = build_cinder('free')
    obA = {n: b.mesh(material('cinder_mat_a', to_bimg(tex, 'cinder_tex_a'))) for n, b in A.items()}
    obB = {n: b.mesh(material('cinder_mat_b', to_bimg(tex, 'cinder_tex_b'))) for n, b in Bf.items()}
    export_glb(os.path.join(out, 'cinder.glb'), list(obA.values()))
    meshes = {}
    for n in obA:
        ma, mb = compact(obA[n]), compact(obB[n])
        assert ma['verts'] == mb['verts'], n
        ma['col2'] = mb['col']   # the freed palette, vertex for vertex
        meshes[n] = ma
    data = {'name': 'cinder', 'meshes': meshes, 'tex': tex_url(tex, 80)[0]}
    if renders:
        PIV = {'body': (0, 0, 0), 'neck': (0, 3.3, 1.8), 'head': (0, 3.3 + 1.75, 1.8 + 1.35), 'jaw': (0, 3.3 + 1.75 - 0.05, 1.8 + 1.35 + 0.25), 'wingL': (-1.1, 3.6, 0.5), 'wingR': (1.1, 3.6, 0.5),
               'tail1': (0, 2.5, -2.0), 'tail2': (0, 2.5 - 0.32, -2.0 - 2.7)}
        for pal, obs in (('spell', obA), ('free', obB)):
            show = []
            for n, o in obs.items():
                o.location = Vector(tv(*PIV[n])); show.append(o)
            others = obB if pal == 'spell' else obA
            for o in others.values(): o.hide_render = True
            for o in obs.values(): o.hide_render = False
            turntable(os.path.join(out, f'turn_cinder_{pal}.png'), show, 8.5)
    return data


def make_buildings(out, renders):
    P = build_buildings(); stone = prop_tex('stone'); planks = prop_tex('planks')
    # box-projected UVs in world metres for the stone parts (the tower and wall are scaled by the game: their UVs follow)
    for n in ('mill', 'tower', 'wall'):
        B = P[n]
        for f in B.bm.faces:
            nrm = f.normal
            for l in f.loops:
                p = l.vert.co
                if n == 'tower':   # round: u around, v up (scaled to about 1 block per metre once the game stretches it)
                    u = (math.atan2(p.y, p.x) / (2 * math.pi) + 0.5) * 12; v = p.z * 4
                elif abs(nrm.z) > 0.7: u, v = p.x * 0.25, p.y * 0.25
                elif abs(nrm.x) > abs(nrm.y): u, v = p.y * 0.25, p.z * 0.25 * (1 if n == 'mill' else 4)
                else: u, v = p.x * 0.25, p.z * 0.25 * (1 if n == 'mill' else 4)
                l[B.uv].uv = (u, v)
    obs = {}
    for n, b in P.items(): obs[n] = b.mesh(material(f'bld_mat_{n}', to_bimg(planks if n == 'barn' else stone, f'bld_tex_{n}')))
    export_glb(os.path.join(out, 'buildings.glb'), list(obs.values()))
    data = {'name': 'buildings', 'meshes': {n: compact(o) for n, o in obs.items()}, 'tex': tex_url(stone, 78)[0]}
    data['meshes']['barn']['tex'] = tex_url(planks, 78)[0]
    for n in ('barn', 'mill'):
        if data['meshes'][n]['tris'] > 300: data['meshes'][n]['lod1'] = lod(obs[n], 0.22)
    if renders:
        for n, o in obs.items():
            for q in obs.values(): q.hide_render = q is not o
            turntable(os.path.join(out, f'turn_{n}.png'), [o], {'barn': 11, 'mill': 17, 'tower': 3, 'wall': 4}[n])
    return data


def make_prop(name, builders, tex, out, renders, height, texs=None):
    """texs: an optional texture per builder (the cottage's walls and roof); otherwise one texture for all."""
    texs = texs or [tex] * len(builders); obs = []
    for i, (b, t) in enumerate(zip(builders, texs)):
        obs.append(b.mesh(material(f'{name}_mat{i}', to_bimg(t, f'{name}_tex{i}'))))
    export_glb(os.path.join(out, name + '.glb'), obs)
    key = lambda o: o.name.replace(name + '_', '') if o.name != name else 'body'
    data = {'name': name, 'meshes': {key(o): compact(o) for o in obs}}
    for o in obs:   # a lighter level of detail for the distance (props drawn many times over)
        if data['meshes'][key(o)]['tris'] > 300: data['meshes'][key(o)]['lod1'] = lod(o, 0.22)
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
            ('fence', lambda: make_prop('fence', list(build_fence()), prop_tex('wood'), a.out, a.renders, 1.5)),
            ('villager', lambda: make_villager(a.out, a.renders)),
            ('foes', lambda: make_foes(a.out, a.renders)),
            ('big', lambda: make_big(a.out, a.renders)),
            ('cinder', lambda: make_cinder(a.out, a.renders)),
            ('buildings', lambda: make_buildings(a.out, a.renders))]
    for name, fn in jobs:
        if only and name not in only: continue
        reset(); d = fn()
        with open(os.path.join(a.out, name + '.json'), 'w') as f: json.dump(d, f, separators=(',', ':'))
        tris = sum(m['tris'] for m in d['meshes'].values())
        print(f'{name}: {tris} tris, glb {os.path.getsize(os.path.join(a.out, name + ".glb"))} B, json {os.path.getsize(os.path.join(a.out, name + ".json"))} B')


if __name__ == '__main__':
    main()
