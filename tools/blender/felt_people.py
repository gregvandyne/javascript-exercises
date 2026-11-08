"""Felt people for the Story Builder kit: kids, grown-ups and grandparents in the felt-and-paper world, styled like
designer vinyl toys for 6-12 year olds: a big head (about a quarter of the height), chunky limbs, oversized
sneakers, glossy bean eyes with relaxed lids, clear felt brows, hair in big soft tufts, streetwear.

    root, body, head = person('kid0', 'kid', {'hair_color': 'blonde', 'hair': 'short', 'skin': 'fair',
                                             'shirt': 'blue', 'outfit': 'sports_kit', 'glasses': False, 'age': 'big'})

A look is optional: anything left out is picked from the character's seed (so the same `who` always looks the same).
The seed also picks the everyday clothes (hoodie, bomber, jersey...), the hair variant (spiky or quiff, braids or
locs...) and the idle attitude. Every name a story may use (hair colours, skin tones, hair styles, shirt colours,
outfits, ages) is listed in server/stories/blender/catalog.json and must have an entry here (a test checks both ways).

The rig is a few empties, so felt_actions.py can move people and animals the same way:
  root > body > torso (pivot at the hips) > head, arm_L / arm_R (pivot at the shoulder) > elbow > hand_*
              > leg_L / leg_R (pivot at the hip)
Faces have three mouths (smile, open, sad), two eyes (empties named `eye`, squashed to blink) and brows that
felt_actions sets for the mood (happy, sad, frustrated, determined).

Shapes are clean, closed felt pieces with clear silhouettes (they also read under an outline/comic material layer).
Primitive shapes share one unit mesh per kind (the colour is on the object), which keeps a scene quick to build.
"""
import math
import random

import bmesh
import bpy
from mathutils import Vector

import feltkit as K

HAIR_COLORS = {'blonde': '#efc75e', 'brown': '#7a4a2b', 'black': '#2b2427', 'red': '#c8562e', 'grey': '#b8b4ae', 'white': '#efebe4'}
# brows: a clearly darker felt than the hair (near-black for dark hair), so they read on every skin tone
BROWS = {'blonde': '#5a3a0e', 'brown': '#22130b', 'black': '#141012', 'red': '#5e200e', 'grey': '#4e4a46', 'white': '#6e6a66'}
# a respectful range of skin tones, light to deep
SKIN = {'light': '#f7dccb', 'fair': '#efc4a4', 'medium': '#d9a179', 'tan': '#c08758', 'brown': '#946040', 'deep': '#5f3b26'}
HAIR = ('short', 'long', 'curly', 'ponytail', 'bun', 'buzz', 'bald')
SHIRTS = {'red': '#d9473f', 'orange': '#ee8a33', 'yellow': '#f2c94c', 'green': '#4f9d5d', 'teal': '#2f9c9a', 'blue': '#3f74c9',
          'navy': '#2c3d72', 'purple': '#8459b8', 'pink': '#ec8db0', 'white': '#f4f1ea'}
OUTFITS = ('casual', 'dress', 'sports_kit', 'pyjamas', 'swimsuit', 'winter_coat', 'astronaut', 'pirate', 'knight',
           'princess', 'superhero', 'coach', 'teacher', 'doctor', 'chef', 'overalls')
AGES = ('small', 'big')
KINDS = ('kid', 'grownup', 'grandparent')
# outfits that let a person fly in a story (a cape, a space suit)
FLYING_OUTFITS = ('superhero', 'astronaut')

DENIM = '#3f5f94'
WHITE = '#f4f1ea'
INK = '#2b2b33'
ACCENTS = ['#2c3d72', '#d9473f', '#2f9c9a', '#2b2b33', '#ee8a33', '#8459b8', '#4f9d5d', '#e8b33d', '#ec8db0']
SNEAKERS = [('#f4f1ea', '#d9473f'), ('#2b2b33', '#f2c94c'), ('#3f74c9', '#f4f1ea'), ('#f4f1ea', '#2f9c9a'),
            ('#d9473f', '#f4f1ea'), ('#8459b8', '#f2c94c'), ('#f4f1ea', '#2b2b33'), ('#4f9d5d', '#f4f1ea')]
# how much the skin glows at night and dusk (a soft face fill: render_story sets it per scene)
FACE_FILL = 0.0
# contact sheets can pin the hair variant (0-1: spiky or quiff, braids, locs or loose...); None = from the seed
HAIR_VARIANT = None

# kind: leg (hip to sole), torso, half shoulder width, head radius, upper arm, forearm
PROPORTIONS = {
    'kid': (0.50, 0.42, 0.23, 0.215, 0.20, 0.19),
    'grownup': (0.74, 0.60, 0.29, 0.188, 0.28, 0.26),
    'grandparent': (0.66, 0.56, 0.285, 0.19, 0.26, 0.24),
}
SEGS = 16


def _lighter(h, k=0.35):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) for i in (0, 2, 4)]
    return '#' + ''.join(f'{int(v + (255 - v) * k):02x}' for v in c)


def _darker(h, k=0.25):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) for i in (0, 2, 4)]
    return '#' + ''.join(f'{int(v * (1 - k)):02x}' for v in c)


def _seed(text):
    return sum((i + 1) * ord(c) for i, c in enumerate(str(text)))


def resolve_look(kind, look, seed_text='x'):
    """Fill in a look: what the story gave, the rest picked from the seed (stable for the same `who`)."""
    look = dict(look or {})
    rng = random.Random(_seed(seed_text))
    out = {}
    out['skin'] = look.get('skin') if look.get('skin') in SKIN else rng.choice(list(SKIN))
    if kind == 'grandparent':
        default_hc = rng.choice(['grey', 'white'])
    else:
        default_hc = rng.choice(['blonde', 'brown', 'black', 'red', 'brown', 'black'])
    out['hair_color'] = look.get('hair_color') if look.get('hair_color') in HAIR_COLORS else default_hc
    hairs = ['short', 'long', 'curly', 'ponytail', 'bun', 'buzz'] if kind != 'grandparent' else ['short', 'bun', 'curly', 'bald']
    out['hair'] = look.get('hair') if look.get('hair') in HAIR else rng.choice(hairs)
    out['shirt'] = look.get('shirt') if look.get('shirt') in SHIRTS else rng.choice(list(SHIRTS))
    out['outfit'] = look.get('outfit') if look.get('outfit') in OUTFITS else 'casual'
    out['glasses'] = bool(look.get('glasses')) if 'glasses' in look else (kind == 'grandparent' and rng.random() < 0.6)
    out['age'] = look.get('age') if look.get('age') in AGES else 'big'
    return out


# ---------------------------------------------------------------- materials
def felt(col, fuzz=0.35, sheen=0.9, emit=0.0):
    return K.felt(col, fuzz=fuzz, sheen=sheen, emit=emit, emit_color=col if emit else None)


def skin_mat(col):
    return K.felt(col, fuzz=0.3, sheen=0.5, emit=FACE_FILL, emit_color=col if FACE_FILL else None)


# ---------------------------------------------------------------- shapes (shared unit meshes, colour on the object)
_UNIT = {}


def _torus_bm(bm, segs, minor, minor_segs=10):
    rings = []
    for i in range(segs):
        a = 2 * math.pi * i / segs
        ring = []
        for j in range(minor_segs):
            b = 2 * math.pi * j / minor_segs
            rr = 1 + minor * math.cos(b)
            ring.append(bm.verts.new((rr * math.cos(a), rr * math.sin(a), minor * math.sin(b))))
        rings.append(ring)
    for i in range(segs):
        A, B = rings[i], rings[(i + 1) % segs]
        for j in range(minor_segs):
            bm.faces.new((A[j], B[j], B[(j + 1) % minor_segs], A[(j + 1) % minor_segs]))


def _unit(kind, segs, r1=1.0, r2=0.0, minor=0.25):
    key = (kind, segs, round(r1, 4), round(r2, 4), round(minor, 4))
    name = 'u_' + '_'.join(str(k) for k in key)
    me = bpy.data.meshes.get(name)
    if me is not None:
        return me
    bm = bmesh.new()
    if kind == 'sphere':
        bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=max(6, segs // 2), radius=1)
    elif kind == 'cyl':
        bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=1, radius2=1, depth=2)
    elif kind == 'cone':
        bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r1, radius2=r2, depth=2)
    elif kind == 'cube':
        bmesh.ops.create_cube(bm, size=2)
    elif kind == 'torus':
        _torus_bm(bm, segs, minor)
    for f in bm.faces:
        f.smooth = kind in ('sphere', 'torus') or (kind in ('cyl', 'cone') and abs(f.normal.z) < 0.9)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(None)
    return me


def _obj(name, me, mat, parent, loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0)):
    ob = bpy.data.objects.new(name, me)
    K.link(ob)
    if mat is not None:
        if len(me.materials) == 0:
            me.materials.append(None)
        ob.material_slots[0].link = 'OBJECT'
        ob.material_slots[0].material = mat
    ob.parent = parent
    ob.location = loc
    ob.scale = scale
    ob.rotation_euler = rot
    return ob


def prim(kind, name, loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0), mat=None, parent=None, segs=SEGS, **kw):
    """Like feltkit.prim (same arguments), but every shape of a kind shares one mesh."""
    return _obj(name, _unit(kind, segs, kw.get('r1', 1.0), kw.get('r2', 0.0), kw.get('minor', 0.25)), mat, parent, loc, scale, rot)


def ball(name, loc, scale, mat, parent, rot=(0, 0, 0), segs=SEGS):
    if not isinstance(scale, (tuple, list)):
        scale = (scale, scale, scale)
    return prim('sphere', name, loc, scale, rot, mat=mat, parent=parent, segs=segs)


def _mesh(name, verts, faces, mat, parent, smooth=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        f.smooth = smooth
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    K.link(ob)
    if mat is not None:
        me.materials.append(mat)
    ob.parent = parent
    return ob


def lathe(name, prof, mat, parent, loc=(0, 0, 0), sx=1.0, sy=1.0, segs=SEGS, rot=(0, 0, 0)):
    """A surface of revolution around Z from a profile [(r, z)], top to bottom; r == 0 closes to a point."""
    verts, faces, rings = [], [], []
    for r, z in prof:
        if r <= 1e-6:
            verts.append((0, 0, z))
            rings.append([len(verts) - 1])
        else:
            ring = []
            for k in range(segs):
                a = 2 * math.pi * k / segs
                verts.append((r * math.cos(a) * sx, r * math.sin(a) * sy, z))
                ring.append(len(verts) - 1)
            rings.append(ring)
    for A, B in zip(rings, rings[1:]):
        if len(A) == 1 and len(B) == 1:
            continue
        if len(A) == 1:
            faces += [(A[0], B[(k + 1) % segs], B[k]) for k in range(segs)]
        elif len(B) == 1:
            faces += [(A[k], A[(k + 1) % segs], B[0]) for k in range(segs)]
        else:
            faces += [(A[k], A[(k + 1) % segs], B[(k + 1) % segs], B[k]) for k in range(segs)]
    ob = _mesh(name, verts, faces, mat, parent)
    ob.location = loc
    ob.rotation_euler = rot
    return ob


def capsule(name, length, r0, r1, mat, parent, loc=(0, 0, 0), sx=1.0, sy=1.0, rot=(0, 0, 0), n=3):
    """A tapered limb hanging from loc down -Z: radius r0 at the top, r1 at the bottom, round ends."""
    prof = [(r0 * math.sin(math.pi / 2 * i / n), r0 * 0.75 * math.cos(math.pi / 2 * i / n)) for i in range(n + 1)]
    prof += [(r1 * math.sin(math.pi / 2 + math.pi / 2 * i / n), -length + r1 * 0.75 * math.cos(math.pi / 2 + math.pi / 2 * i / n)) for i in range(n + 1)]
    return lathe(name, prof, mat, parent, loc, sx, sy, segs=12, rot=rot)


def cut(name, pts, depth, mat, parent, loc, rot=(0, 0, 0), bevel=0.004):
    o = K.outline_obj(name, pts, depth, mat, bevel=bevel)
    o.parent = parent
    o.location = loc
    o.rotation_euler = rot
    return o


def label(name, s, size, mat, parent, loc, rot=(math.pi / 2, 0, 0), depth=0.008):
    """Felt numbers and letters (a jersey number): a text object with Blender's built-in font."""
    cu = bpy.data.curves.new(name, 'FONT')
    cu.body = s
    cu.size = size
    cu.extrude = depth
    cu.align_x = 'CENTER'
    cu.align_y = 'CENTER'
    ob = bpy.data.objects.new(name, cu)
    K.link(ob)
    ob.data.materials.append(mat)
    ob.parent = parent
    ob.location = loc
    ob.rotation_euler = rot
    return ob


def _shell(name, r, keep, mat, parent, loc=(0, 0, 0), scale=(1, 1, 1), thick=0.035, segs=24):
    """A felt shell: a sphere of radius r with the vertices where keep(nx, ny, nz) is False cut away, given a felt
    thickness (solidify), so the cut edge reads as a hairline or a hat brim."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=segs // 2, radius=r)
    gone = [v for v in bm.verts if not keep(v.co.x / r, v.co.y / r, v.co.z / r)]
    bmesh.ops.delete(bm, geom=gone, context='VERTS')
    for f in bm.faces:
        f.smooth = True
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    K.link(ob)
    ob.data.materials.append(mat)
    ob.parent = parent
    ob.location = loc
    ob.scale = scale
    m = ob.modifiers.new('felt', 'SOLIDIFY')
    m.thickness = thick
    m.offset = 1.0
    return ob


def tuft(name, parent, mat, base, d, length, width, sweep=(0, 0, 0), flat=0.55, rings=7, segs=10, tip=0.18):
    """A big soft lock of felt hair: wide at the base (sunk in the hair mass), curving along `sweep`, a round tip.
    Built in head space: base point, start direction d, sweep (where the tip curls to)."""
    B, D, S = Vector(base), Vector(d).normalized(), Vector(sweep)
    n = B.normalized() if B.length > 1e-6 else Vector((0, 0, 1))
    verts, faces = [], []
    for i in range(rings + 1):
        t = i / rings
        P = B + D * length * t + S * length * t * t
        T = (D + S * 2 * t).normalized()
        # the broad side faces the camera (front to back is Y): a tuft never shows edge-on as a thin horn
        W = T.cross(Vector((0, 1, 0)))
        if W.length < 0.3:
            W = T.cross(n)
        if W.length < 1e-4:
            W = T.cross(Vector((1, 0, 0)))
        W.normalize()
        N = W.cross(T).normalized()
        w = width * ((1 - t) ** 0.85 * (1 - tip) + tip * math.sqrt(max(0.0, 1 - t * t))) * (1 + 0.25 * math.sin(math.pi * t))
        for k in range(segs):
            a = 2 * math.pi * k / segs
            q = P + W * (w * math.cos(a)) + N * (w * flat * math.sin(a))
            verts.append(tuple(q))
    tipv = B + D * length + S * length + (D + S * 2).normalized() * width * tip * 0.6
    verts.append(tuple(tipv))
    verts.append(tuple(B - D * width * 0.3))
    for i in range(rings):
        for k in range(segs):
            a, b = i * segs + k, i * segs + (k + 1) % segs
            faces.append((a, b, b + segs, a + segs))
    last = rings * segs
    faces += [(last + k, last + (k + 1) % segs, len(verts) - 2) for k in range(segs)]
    faces += [((k + 1) % segs, k, len(verts) - 1) for k in range(segs)]
    return _mesh(name, verts, faces, mat, parent)


def _cap(name, parent, r, hairline, mat, scale=(1, 1, 1), thick=0.03, top=None, az=56, rings=14):
    """A felt cap over the top of the head out to a smooth edge: hairline(a) -> the edge height (-1..1) at the angle
    a from the front of the face (0 front, pi/2 the side, pi the back); top: start below this height (the band
    under a hat)."""
    verts, faces = [], []
    cols = []
    for i in range(az):
        phi = 2 * math.pi * i / az
        x, y = math.cos(phi), math.sin(phi)
        a = math.acos(max(-1.0, min(1.0, -y)))
        zh = max(-0.95, min(0.95, hairline(a)))
        th1 = math.acos(zh)
        th0 = math.acos(top) if top is not None else 0.0
        col = []
        for j in range(rings + 1):
            th = th0 + (th1 - th0) * j / rings
            if top is None and j == 0:
                th = 0.0
            col.append(len(verts))
            verts.append((r * math.sin(th) * x, r * math.sin(th) * y, r * math.cos(th)))
        cols.append(col)
    for i in range(az):
        A, B = cols[i], cols[(i + 1) % az]
        for j in range(rings):
            faces.append((A[j], A[j + 1], B[j + 1], B[j]))
    ob = _mesh(name, verts, faces, mat, parent)
    if top is None:  # weld the pole
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
        bm.to_mesh(ob.data)
        bm.free()
    ob.scale = scale
    m = ob.modifiers.new('felt', 'SOLIDIFY')
    m.thickness = thick
    m.offset = 1.0
    return ob


def _smooth(e0, e1, x):
    u = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return u * u * (3 - 2 * u)


def _hairline(front, sides, back):
    """An edge height by the angle from the front: high and gently curved across the forehead, dropping at the
    temples to the sideburns (just in front of the ears), then to the nape at the back."""
    def h(a):
        z = front - 0.08 * (a / 0.8) ** 2
        z += (sides - z) * _smooth(0.75, 1.3, a)
        return z + (back - z) * _smooth(1.75, 2.6, a)
    return h


def _arc_pts(w, h, inner=0.45, n=10, flip=False):
    """A crescent (a smile) as an outline in the XZ plane, w wide and h deep."""
    lo = [(-w + 2 * w * i / n, -h * (1 - ((-w + 2 * w * i / n) / w) ** 2)) for i in range(n + 1)]
    hi = [(x, z * inner) for x, z in reversed(lo[1:-1])]
    pts = lo + hi
    if flip:
        pts = [(x, -z - h * 0.3) for x, z in pts]
    return pts


# ---------------------------------------------------------------- face
def _face(head, r, skin_hex, hair_color, rng):
    skin = skin_mat(skin_hex)
    ball('p_face', (0, 0, r * 0.03), (r, r * 0.95, r * 1.02), skin, head, segs=24)
    ball('p_jaw', (0, -r * 0.18, -r * 0.42), (r * 0.78, r * 0.72, r * 0.58), skin, head, segs=18)
    for sx in (-1, 1):
        ball('p_ear', (sx * r * 0.97, 0.0, -r * 0.08), (r * 0.13, r * 0.09, r * 0.2), skin, head, segs=10)
    ball('p_nose', (0, -r * 0.97, -r * 0.16), (r * 0.075, r * 0.05, r * 0.055), skin_mat(_darker(skin_hex, 0.07)), head, segs=10)
    # eyes: an empty `eye` each (felt_actions squashes it to blink or close), a glossy bean, a glint, a relaxed lid
    gap, ez, er = r * 0.38, r * 0.02, r * 0.19
    bean, glint, lid_skin = K.glossy('#141118', 0.12), K.glow('#ffffff', 2.5), skin
    eyes = []
    for sx in (-1, 1):
        e = K.empty('eye', (sx * gap, -r * 0.87, ez), head)
        eyes.append(e)
        ball('eye_bean', (0, 0, 0), (er * 0.74, er * 0.42, er), bean, e, segs=14)
        ball('eye_glint', (er * 0.26, -er * 0.36, er * 0.4), (er * 0.2, er * 0.08, er * 0.2), glint, e, segs=8)
        ball('eye_glint2', (-er * 0.2, -er * 0.38, -er * 0.4), (er * 0.09, er * 0.05, er * 0.09), glint, e, segs=6)
        # the lid covers the top of the bean, tilted down to the outside: relaxed, a bit cool
        _shell('eye_lid', er * 1.05, lambda x, y, z, sx=sx: z > 0.3 - 0.18 * x * sx and y < 0.35, lid_skin, e,
               scale=(0.82, 0.48, 1.0), thick=0.006, segs=14)
    seed = rng.uniform(0, 3)

    def blink(t, f, eyes=eyes):
        k = 0.1 if (t + seed) % 3.9 < 0.12 else 1.0
        for e in eyes:
            e.scale.z = k
    K.anim(blink)
    # brows: thick, arched felt shapes in a darker shade than the hair, just above the eyes; felt_actions moves them
    brow = felt(BROWS.get(hair_color, '#2b2427'), fuzz=0.25, sheen=0.4)
    bw, bt = r * 0.215, r * 0.11
    for sx in (-1, 1):
        # an arch, thicker at the inner end, tapering out (drawn for the right brow, mirrored for the left)
        pts = [(-bw, -bt * 0.2), (-bw * 0.3, bt * 0.18), (bw * 0.45, bt * 0.12), (bw, -bt * 0.55),
               (bw * 0.95, -bt * 0.15), (bw * 0.4, bt * 0.75), (-bw * 0.35, bt * 1.05), (-bw * 1.02, bt * 0.85)]
        if sx < 0:
            pts = [(-x, z) for x, z in reversed(pts)]
        b = cut('brow', pts, 0.026, brow, head, (sx * gap, -r * 0.9, ez + er + r * 0.1), rot=(0, 0, 0), bevel=0.005)
        b['side'] = sx
        b['rest_z'] = b.location.z
    # mouths: a lop-sided grin (attitude), an open laugh, a sad one
    mouth_col = felt('#6e2a36', fuzz=0.2)
    mz, w = -r * 0.44, r * 0.17
    grin = [(-w, w * 0.15), (-w * 0.3, -w * 0.32), (w * 0.4, -w * 0.38), (w * 1.05, w * 0.18), (w * 0.95, w * 0.26),
            (w * 0.35, -w * 0.1), (-w * 0.3, -w * 0.08), (-w * 0.92, w * 0.22)]
    cut('mouth_smile', grin, 0.02, mouth_col, head, (0, -r * 0.9, mz), rot=(0, -0.08, 0))
    sad = cut('mouth_sad', _arc_pts(w * 0.7, w * 0.4, flip=True), 0.02, mouth_col, head, (0, -r * 0.9, mz + r * 0.04))
    sad['rest'] = tuple(sad.scale)
    sad.scale = (0, 0, 0)
    op = ball('mouth_open', (0, -r * 0.82, mz - r * 0.05), (w * 0.8, r * 0.1, w * 0.7), mouth_col, head, segs=12)
    ball('mouth_open_teeth', (0, -0.35, 0.55), (0.75, 0.6, 0.3), felt('#fbf8f2'), op, segs=8)
    op['rest'] = tuple(op.scale)
    op.scale = (0, 0, 0)
    return skin


# ---------------------------------------------------------------- hair
def _mix(a, b, k):
    a, b = a.lstrip('#'), b.lstrip('#')
    return '#' + ''.join(f'{int(int(a[i:i + 2], 16) * (1 - k) + int(b[i:i + 2], 16) * k):02x}' for i in (0, 2, 4))


def _parted(head, r, mat, shade, side):
    """Locks combed from a side parting, over the crown and down the sides: the hair mass gets sculpted strands."""
    for k, (y, ln) in enumerate(((-0.5, 0.75), (-0.15, 0.85), (0.2, 0.85), (0.5, 0.75))):
        z = math.sqrt(max(0.05, 1 - y * y - 0.06))
        for sd, wd in ((-side, 0.42), (side, 0.36)):
            tuft('hair_lock', head, shade if (k + (sd > 0)) % 2 else mat, (side * 0.22 * r, y * r * 0.95, z * r * 0.98),
                 (sd * 0.95, y * 0.15, -0.1), r * ln * (1.0 if sd == -side else 0.75), r * wd, sweep=(0, y * 0.1, -0.45), flat=0.4, tip=0.4)


def _hair(head, r, style, hc, rng, kind, hat=None, skin_hex=None):
    """Hair as a felt mass that frames the face (bangs or a hairline, sideburns) with big soft tufts on it.
    hat: None, or what covers the top ('cap', 'beanie', 'helmet', 'hat'): then only what shows below it is made."""
    col = HAIR_COLORS[hc]
    mat = felt(col, fuzz=0.9)
    shade = felt(_darker(col, 0.14), fuzz=0.9)
    var = rng.random() if HAIR_VARIANT is None else HAIR_VARIANT
    if style == 'bald':
        _shell('hair', r * 1.04, lambda x, y, z: -0.42 < z < 0.18 and y > -0.45, mat, head, thick=0.04)
        if var < 0.5:  # a trim beard and moustache
            _shell('beard', r * 1.03, lambda x, y, z: y < 0.15 and z < -0.3 and not (abs(x) < 0.32 and -0.62 < z < -0.32), mat, head, thick=0.045)
            ball('moustache', (0, -r * 0.95, -r * 0.3), (r * 0.3, r * 0.08, r * 0.08), mat, head, rot=(0, 0, 0))
        return
    covered = hat in ('helmet', 'space')
    if covered:
        return
    # the hair mass: a felt cap out to a smooth hairline: across the forehead (lower for bangs), down to the
    # sideburns in front of the ears, low at the back. Under a hat only the band below the hat is made.
    bangs = style in ('long', 'ponytail', 'bun')
    cropped = style in ('short', 'buzz', 'curly')
    front = 0.47 if bangs else 0.5
    sides = -0.05 if cropped else -0.3
    back = -0.48 if style == 'long' else -0.32
    thick = 0.012 if style == 'buzz' else (0.024 if cropped else 0.032)
    base = felt(_mix(col, skin_hex or '#c08758', 0.45), fuzz=0.6) if style == 'buzz' else mat
    _cap('hair', head, r * 1.02, _hairline(front, sides, back), base, scale=(1.0, 1.0, 1.03), thick=thick,
         top=(0.45 if hat == 'cap_back' else 0.28) if hat else None)
    if hat == 'cap_back' and style in ('short', 'curly', 'buzz', 'long', 'ponytail'):
        # a backwards cap sits back on the head: a tuft of fringe pokes out of the front opening
        for k, x in enumerate((-0.32, 0.0, 0.32)):
            tuft('hair_fringe', head, shade if k == 1 else mat, (x * r, -r * 0.62, r * 0.7), (x * 0.4, -0.8, 0.5), r * 0.4, r * 0.3,
                 sweep=(x * 0.2, -0.1, -0.35), flat=0.6, tip=0.4)
    if bangs and not hat:
        _parted(head, r, mat, shade, rng.choice((-1, 1)))
    if style == 'buzz':
        if not hat:  # a fade: a full felt top over short sides
            _cap('hair_top', head, r * 1.03, _hairline(0.55, 0.42, 0.15), mat, thick=0.016)
            # a short textured crop on top, brushed forward
            for k, (u, v) in enumerate(((-0.35, -0.35), (0.05, -0.45), (0.4, -0.3), (-0.2, 0.1), (0.25, 0.05))):
                bz = math.sqrt(max(0.05, 1 - u * u - v * v))
                tuft('hair_tuft', head, shade if k % 2 else mat, Vector((u, v, bz)) * r, (u * 0.2, -0.7, 0.55), r * 0.42, r * 0.3,
                     sweep=(0, -0.2, -0.25), flat=0.45, tip=0.45)
        return
    if style == 'short':
        if hat:
            return
        if kind == 'grandparent':
            # a neat side part: three tufts combed across
            for k in range(3):
                tuft('hair_tuft', head, mat if k else shade, (-r * 0.35 + k * r * 0.1, -r * 0.4 + k * r * 0.35, r * 0.85),
                     (1, -0.1, 0.3), r * 0.75, r * 0.36, sweep=(0.1, 0, -0.35), flat=0.4)
            return
        side = rng.choice((-1, 1))
        if var < 0.55:
            # styled spikes: a few big soft tufts, wide at the base and overlapping, growing out of the hair mass
            # at the hairline and the crown, all swept up and forward and over to one side
            for k, (u, v, ln, wd) in enumerate(((-0.62, -0.5, 0.62, 0.42), (-0.22, -0.66, 0.74, 0.46), (0.22, -0.6, 0.72, 0.44),
                                                (0.6, -0.42, 0.6, 0.4), (-0.4, -0.05, 0.66, 0.46), (0.25, -0.12, 0.7, 0.46),
                                                (0.0, 0.38, 0.6, 0.46))):
                bx, by = u * side, v
                bz = math.sqrt(max(0.05, 1 - bx * bx - by * by))
                base = Vector((bx, by, bz)) * r * 0.9 + Vector((0, 0.06 * r, 0.14 * r if by < -0.4 else 0.0))
                d = (Vector((bx * 0.5, by * 0.4 - 0.1, 1.0))).normalized()
                tuft('hair_tuft', head, shade if k in (1, 5) else mat, base, d, r * ln, r * wd,
                     sweep=(0.42 * side, -0.25, -0.12), flat=0.72, tip=0.3)
        else:
            # a swept quiff: one big tuft brushed up off the forehead and curling back, the rest combed back
            for k, x in enumerate((-0.55, 0.0, 0.55)):
                tuft('hair_tuft', head, shade if k == 1 else mat, (x * r * 0.8, -r * 0.2, r * 0.95), (x * 0.25, 0.55, 0.6), r * 0.85, r * 0.5,
                     sweep=(0, 0.3, -0.5), flat=0.6, tip=0.35)
            for k, x in enumerate((-0.38, 0.05, 0.42)):
                # the quiff: a row of wide tufts brushed up off the forehead, rolling back (and a little to one side)
                tuft('hair_quiff', head, shade if k == 1 else mat, (x * r + r * 0.1 * side, -r * 0.62, r * 0.7), (0.12 * side, -0.25, 1),
                     r * (0.78 + 0.14 * (k == 1)), r * 0.46, sweep=(0.2 * side, 0.62, 0.22), flat=0.72, tip=0.4)
        return
    if style == 'curly':
        big = var < 0.45 and kind != 'grandparent' and not hat
        if hat:
            # curls peeking out under the hat at the sides and back
            for k in range(12):
                a = math.pi * (-0.15 + 1.3 * k / 11)
                ball('curl', (math.cos(a) * r * 1.0, math.sin(a) * r * 0.85 + r * 0.15, r * 0.12), r * 0.24, mat if k % 3 else shade, head, segs=10)
            return
        # golden-angle spiral of felt curls: a full round cloud (big), or piled on top over short sides (curly top)
        n = 34 if big else 24
        for k in range(n):
            a = k * 2.39996
            u = (k + 0.5) / n
            z = (1 - u * (1.4 if big else 0.85))
            rr = math.sqrt(max(0.0, 1 - z * z))
            x, y = math.cos(a) * rr, math.sin(a) * rr
            if y < -0.3 and z < (0.42 if big else 0.5):
                continue  # leave the face clear
            g = 1.18 if big else 1.05
            lift = r * (0.2 if big else 0.16) * max(0.0, z)
            ball('curl', (x * r * g, y * r * g, z * r * g + lift), r * rng.uniform(0.25, 0.31) * (1.2 if big else 1.0),
                 mat if k % 3 else shade, head, segs=10)
        # a row of curls along the hairline frames the face
        for k in range(5):
            x = -0.56 + 0.28 * k
            ball('curl', (x * r, -r * 0.8, r * (0.55 + 0.08 * (1 - abs(x)))), r * (0.25 if big else 0.22), shade if k % 2 else mat, head, segs=10)
        return
    if style == 'long':
        if var < 0.34 and kind != 'grandparent':
            # two braids over the shoulders
            for sx in (-1, 1):
                for k in range(6):
                    ball('braid', (sx * r * (0.85 - k * 0.03), r * 0.1 - k * r * 0.03, -r * (0.3 + k * 0.3)), r * (0.22 - k * 0.01),
                         mat if k % 2 else shade, head, segs=10)
                ball('braid_tie', (sx * r * 0.67, -r * 0.05, -r * 2.1), r * 0.12, felt('#e2557a'), head, segs=8)
        elif var < 0.67 and kind != 'grandparent':
            # locs: felt cords falling to the shoulders, tied back with a band
            for k in range(12):
                a = math.pi * (0.02 + 0.96 * k / 11)
                x, y = math.cos(a) * r * 0.98, math.sin(a) * r * 0.6 + r * 0.2
                capsule('hair_loc', r * rng.uniform(1.15, 1.45), r * 0.12, r * 0.1, mat if k % 2 else shade, head, (x, y, r * 0.15),
                        rot=(0.12 * math.sin(a), -0.18 * math.cos(a), 0))
        else:
            # long and loose: a fall down the back, side locks swinging out at the ends, bangs swept across
            ball('hair_back', (0, r * 0.45, -r * 0.6), (r * 0.98, r * 0.45, r * 1.0), mat, head)
            for sx in (-1, 1):
                tuft('hair_side', head, mat, (sx * r * 0.85, -r * 0.02, r * 0.3), (sx * 0.06, 0.1, -1), r * 1.4, r * 0.32,
                     sweep=(-sx * 0.05, 0.05, 0.05), flat=0.8, tip=0.65)
            if not hat:
                side = rng.choice((-1, 1))
                _fringe(head, r, mat, shade, side)
        return
    if style == 'ponytail':
        if not hat:
            side = rng.choice((-1, 1))
            _fringe(head, r, mat, shade, side)
        # a high ponytail that swings: big tufts on an empty at the crown
        pony = K.empty('ponytail', (0, r * 0.62, r * (0.85 if not hat else 0.4)), head)
        prim('torus', 'pony_tie', (0, 0, 0), (r * 0.17,) * 3, (1.2, 0, 0), mat=felt('#e2557a'), parent=pony, segs=12, minor=0.4)
        tuft('pony_tuft', pony, mat, (0, 0, 0), (0, 0.9, 0.35), r * 1.35, r * 0.34, sweep=(0, 0.1, -1.05), flat=0.6)
        tuft('pony_tuft', pony, shade, (0, 0.02, 0.02), (0.15, 0.85, 0.4), r * 1.2, r * 0.28, sweep=(0.15, 0.0, -0.95), flat=0.6)
        ph = rng.uniform(0, 6)
        pside = rng.choice((-1, 1))

        def swing(t, f, pony=pony, ph=ph):
            pony.rotation_euler = (math.sin(t * 2.6 + ph) * 0.1, pside * 0.7 + math.sin(t * 3.3 + ph) * 0.3, 0)
        K.anim(swing)
        return
    if style == 'bun':
        if hat:
            return
        if var < 0.4 and kind == 'kid':
            for sx in (-1, 1):  # space buns
                ball('bun', (sx * r * 0.62, r * 0.1, r * 1.0), r * 0.36, mat, head)
        else:
            ball('bun', (0, r * 0.15, r * 1.3), (r * 0.44, r * 0.42, r * 0.38), mat, head)
            prim('torus', 'bun_band', (0, r * 0.15, r * 1.02), (r * 0.25,) * 3, mat=felt('#2f9c9a'), parent=head, segs=12, minor=0.3)
        side = rng.choice((-1, 1))
        _fringe(head, r, mat, shade, side)


def _fringe(head, r, mat, shade, side):
    """A side-swept fringe: three soft overlapping tufts from the parting across the forehead."""
    for k, (x, ln, wd) in enumerate(((-0.42, 0.85, 0.42), (-0.12, 0.8, 0.4), (0.2, 0.62, 0.36))):
        tuft('hair_bangs', head, shade if k == 1 else mat, (x * side * r, -r * 0.55, r * 0.84), (side * 0.9, -0.42, -0.08), r * ln, r * wd * 0.9,
             sweep=(0, -0.08, -0.22), flat=0.7, tip=0.35)


def _glasses(head, r):
    frame = felt('#2b2730', fuzz=0.2)
    for sx in (-1, 1):
        prim('torus', 'glasses', (sx * r * 0.38, -r * 1.0, r * 0.02), (r * 0.25, r * 0.22, r * 0.22), (math.pi / 2, 0, 0), mat=frame, parent=head, segs=16, minor=0.14)
    prim('cyl', 'glasses_bridge', (0, -r * 1.02, r * 0.08), (0.008, 0.008, r * 0.1), (0, math.pi / 2, 0), mat=frame, parent=head, segs=6)


# ---------------------------------------------------------------- outfits
def _outfit(o, team, kind, rng):
    """-> what each part is made of: the top (a garment type and colours), the sleeves, the bottoms, the feet, the
    hat and the extras drawn after the body."""
    second = rng.choice([c for c in ACCENTS if c != team])
    d = dict(top='tee', top_col=team, inner=team, sleeves='short' if kind == 'kid' else 'long', bottom='jeans',
             bottom_col=DENIM, legs='pants', feet='sneakers', shoe=rng.choice(SNEAKERS), socks=WHITE, hat=None, acc=None,
             extras=[], second=second, number=str(rng.choice([3, 5, 7, 8, 9, 10, 11, 14, 23])), skirt=None)
    if o == 'casual':
        if kind == 'kid':
            top = rng.choice(['hoodie', 'bomber', 'jersey', 'overshirt', 'hoodie', 'tee'])
            d['bottom'] = rng.choice(['joggers', 'shorts', 'jeans', 'joggers', 'cargo'])
            d['acc'] = rng.choice(['cap_back', 'headphones', 'backpack', None, 'headphones', 'backpack'])
        elif kind == 'grownup':
            top = rng.choice(['bomber', 'denim', 'hoodie', 'overshirt', 'tee'])
            d['bottom'] = rng.choice(['jeans', 'chinos', 'joggers'])
            d['acc'] = rng.choice([None, 'headphones', None])
        else:
            top = rng.choice(['cardigan', 'vest', 'cardigan'])
            d['bottom'] = rng.choice(['chinos', 'chinos', 'jeans'])
            d['acc'] = rng.choice(['flatcap', None, None])
        d['top'] = top
        if top in ('bomber', 'overshirt', 'vest'):
            d.update(top_col=second, inner=team)
        elif top == 'denim':
            d.update(top_col='#4a6aa0', inner=team)
        elif top == 'cardigan':
            d.update(inner=WHITE if team != WHITE else '#cfe0f0')
        if top in ('tee', 'jersey') and kind != 'kid':
            d['sleeves'] = 'short'
        if top not in ('tee', 'jersey'):
            d['sleeves'] = 'long'
    elif o == 'dress':
        d.update(top='dress', legs='bare', skirt=team, sleeves='short', feet='sneakers', socks=None, acc=rng.choice([None, 'headphones', 'backpack']))
    elif o == 'sports_kit':
        d.update(top='jersey', bottom='shorts', bottom_col=WHITE if team != WHITE else '#2c3d72', socks=team, feet='cleats',
                 shoe=(INK, '#f2c94c'), sleeves='short', extras=['kit'])
    elif o == 'pyjamas':
        light = '#9cc3ea' if team in ('#3f74c9', '#2c3d72') else _lighter(team, 0.5)
        d.update(top='pj', top_col=light, bottom='pj', bottom_col=light, sleeves='long', feet='slippers', shoe=('#f0b7c8', '#ffffff'),
                 socks=None, extras=['dots'])
    elif o == 'swimsuit':
        d.update(top='rash', bottom='boardshorts', bottom_col=second, legs='bare', feet='bare', socks=None, sleeves='short')
    elif o == 'winter_coat':
        d.update(top='puffer', sleeves='long', bottom='jeans', feet='boots', shoe=('#6b4532', '#e8d7b5'), socks=None, hat='beanie',
                 extras=['scarf', 'mittens'])
    elif o == 'astronaut':
        d.update(top='space', top_col='#eef0f3', inner='#eef0f3', sleeves='long', bottom='suit', bottom_col='#eef0f3', feet='boots',
                 shoe=('#cfd5df', '#9aa3b5'), socks=None, hat='space', extras=['space'])
    elif o == 'pirate':
        d.update(top='pirate', top_col=WHITE, inner=team, sleeves='long', bottom='shorts' if kind == 'kid' else 'pants',
                 bottom_col='#3a3346', feet='boots', shoe=('#3a2a26', '#8a6a3a'), socks=None, hat='tricorn', extras=[])
    elif o == 'knight':
        d.update(top='armour', top_col='#aeb6c4', inner=team if team != WHITE else '#3f74c9', sleeves='long', bottom='pants',
                 bottom_col='#7d8597', feet='boots', shoe=('#5c6070', '#aeb6c4'), socks=None, hat='helmet', extras=[])
    elif o == 'princess':
        d.update(top='dress', legs='bare', skirt=team, sleeves='short', feet='flats', shoe=('#f2c94c', '#f2c94c'), socks=None, extras=['crown', 'gown'])
    elif o == 'superhero':
        d.update(top='hero', sleeves='long', bottom='suit', bottom_col=team, feet='boots',
                 shoe=('#f2c94c' if team != '#f2c94c' else '#d9473f', WHITE), socks=None, extras=['cape', 'chest_star', 'mask', 'belt'])
    elif o == 'coach':
        d.update(top='track', sleeves='long', bottom='joggers', bottom_col=_darker(team, 0.35), shoe=(WHITE, team), hat='cap', extras=['whistle'])
    elif o == 'teacher':
        d.update(top='cardigan', inner=WHITE, bottom='chinos', bottom_col='#5b4a6b', sleeves='long', extras=['lanyard'])
    elif o == 'doctor':
        d.update(top='scrubs', top_col=_lighter(team, 0.45), sleeves='short' if kind == 'kid' else 'long', bottom='pants',
                 bottom_col=_lighter(team, 0.45), extras=['labcoat', 'stethoscope'])
    elif o == 'chef':
        d.update(top='chef', top_col=WHITE, sleeves='long', bottom='pants', bottom_col='#3a3346', hat='chef', extras=['apron'])
    elif o == 'overalls':
        d.update(top='tee', sleeves='short', bottom='pants', bottom_col=DENIM, feet='boots', shoe=('#6b4532', '#e8d7b5'), socks=None,
                 extras=['bib'], acc=rng.choice([None, 'cap_back']))
    if d['acc'] in ('cap_back', 'flatcap') and not d['hat']:
        d['hat'] = d['acc']
    if d['acc'] in ('cap_back', 'flatcap'):
        d['acc'] = None
    return d


BOTTOM_COLS = {'jeans': DENIM, 'joggers': '#3a3a46', 'shorts': '#c9b48a', 'cargo': '#7a7a52', 'chinos': '#b59a6a', 'pants': '#3a3346',
               'boardshorts': '#2f9c9a', 'pj': '#9cc3ea', 'suit': '#eef0f3'}


# ---------------------------------------------------------------- the person
def person(name, kind='kid', look=None, seed_text=None):
    """A felt person -> (root, body, head). kind: kid | grownup | grandparent."""
    kind = kind if kind in PROPORTIONS else 'kid'
    seed_text = seed_text or name
    L = resolve_look(kind, look, seed_text)
    rng = random.Random(_seed(seed_text) * 7 + 3)
    leg, th, w, r, ua, fa = PROPORTIONS[kind]
    small = kind == 'kid' and L['age'] == 'small'
    if small:
        leg, th, w, ua, fa, r = leg * 0.84, th * 0.88, w * 0.92, ua * 0.86, fa * 0.86, r * 0.97
    lk = 1.0 if kind == 'kid' else 1.12
    team = SHIRTS[L['shirt']]
    skin_hex = SKIN[L['skin']]
    O = _outfit(L['outfit'], team, kind, rng)
    if O['bottom'] in BOTTOM_COLS and O['bottom_col'] == DENIM and O['bottom'] != 'jeans' and 'bib' not in O['extras']:
        O['bottom_col'] = BOTTOM_COLS[O['bottom']]
    if kind == 'grandparent' and O['bottom'] == 'chinos' and L['outfit'] == 'casual':
        O['bottom_col'] = '#6b6458'
    skin = skin_mat(skin_hex)
    root = K.empty(name)
    root['person'] = kind
    root['outfit'] = L['outfit']
    root['top'] = O['top']
    root['acc'] = O['acc'] or ''
    root['pose_seed'] = _seed(seed_text)
    hip_z = leg + 0.03
    root['hip'] = hip_z
    root['height'] = hip_z + th + r * 2.2
    body = K.empty(f'{name}_body', (0, 0, 0), root)
    torso = K.empty('torso', (0, 0, hip_z), body)
    torso['rest_x'] = -0.1 if kind == 'grandparent' else 0.0
    _torso(torso, O, th, w, kind)
    # neck and head
    prim('cyl', 'p_neck', (0, 0, th * 1.0), (r * 0.34, r * 0.31, r * 0.3), mat=skin, parent=torso, segs=12)
    head = K.empty(f'{name}_head', (0, -0.01, th + r * 1.06), torso)
    head['r'] = r
    _face(head, r, skin_hex, L['hair_color'], rng)
    hair = L['hair']
    _hair(head, r, hair, L['hair_color'], rng, kind, hat=O['hat'], skin_hex=skin_hex)
    if L['glasses']:
        _glasses(head, r)
    _hat(head, r, O, team, hair)
    # arms: shoulder pivot > upper arm, an elbow > forearm and a hand (`hand_*` holds things)
    sleeve = felt(O['top_col'])
    cuff = felt(_darker(O['top_col'], 0.2))
    long_sl = O['sleeves'] == 'long'
    ar0, ar1 = 0.078 * lk, 0.06 * lk
    hand_col = '#d9473f' if 'mittens' in O['extras'] else ('#eef0f3' if 'space' in O['extras'] else
                                                            (team if O['top'] == 'hero' else None))
    hmat = felt(hand_col) if hand_col else skin
    for sx, side in ((-1, 'L'), (1, 'R')):
        arm = K.empty(f'arm_{side}', (sx * w * 0.88, 0, th * 0.84), torso)
        arm['side'] = sx
        arm['len'] = ua + fa
        if long_sl:
            capsule('p_sleeve', ua, ar0 * 1.12, ar1 * 1.12, sleeve, arm)
        else:
            capsule('p_sleeve', ua * 0.5, ar0 * 1.22, ar0 * 1.12, sleeve, arm)
            capsule('p_arm', ua, ar0 * 0.85, ar1 * 0.88, skin, arm)
        elbow = K.empty('elbow', (0, 0, -ua), arm)
        elbow['side'] = sx
        elbow.rotation_euler.x = -0.2
        if long_sl:
            capsule('p_forearm', fa, ar1 * 1.1, ar1 * 0.98, sleeve, elbow)
            prim('torus', 'p_cuff', (0, 0, -fa + 0.012), (ar1 * 0.95,) * 3, mat=cuff, parent=elbow, segs=12, minor=0.35)
        else:
            capsule('p_forearm', fa, ar1 * 0.9, ar1 * 0.78, skin, elbow)
        h = K.empty(f'hand_{side}', (0, -0.01, -fa + 0.005), elbow)
        k = lk * 1.12
        ball('p_hand', (0, 0, -0.035 * k), (0.045 * k, 0.032 * k, 0.052 * k), hmat, h, segs=12)
        ball('p_fingers', (0, -0.006 * k, -0.078 * k), (0.041 * k, 0.028 * k, 0.032 * k), hmat, h, segs=10)
        ball('p_thumb', (-sx * 0.032 * k, -0.026 * k, -0.035 * k), (0.017 * k, 0.017 * k, 0.032 * k), hmat, h, rot=(0.3, sx * 0.4, 0), segs=8)
        arm.rotation_euler.y = -sx * 0.1
    # legs: hip pivot > the leg (trousers, shorts or bare), socks, shoes
    _legs(body, O, leg, hip_z, w, lk, skin, team, kind)
    _extras(name, O, L, torso, head, body, w, th, r, skin_hex, kind, team)
    return root, body, head


def _torso(torso, O, th, w, kind):
    dep = 0.66
    top, tcol = O['top'], O['top_col']
    tmat = felt(tcol)
    prof = [(0, th * 1.0), (w * 0.6, th * 0.98), (w * 0.98, th * 0.85), (w * 1.05, th * 0.6), (w * 1.0, th * 0.35),
            (w * 0.94, th * 0.15), (w * 0.9, th * 0.06), (w * 0.88, th * 0.04), (0, th * 0.04)]
    if top == 'puffer':
        prof = [(0, th * 1.02), (w * 0.7, th * 1.0), (w * 1.1, th * 0.86), (w * 1.16, th * 0.6), (w * 1.12, th * 0.3), (w * 1.06, th * 0.04), (0, th * 0.02)]
    lathe('p_chest', prof, tmat, torso, sy=dep)
    pants = felt(O['bottom_col'])
    lathe('p_hips', [(0, th * 0.12), (w * 0.86, th * 0.1), (w * 0.9, -0.02), (w * 0.84, -0.09), (0, -0.11)], pants, torso, sy=dep * 1.05)
    fy = -w * dep * 0.97  # the front of the chest
    if top in ('hoodie', 'bomber', 'track', 'puffer', 'pj', 'space'):
        prim('torus', 'p_hem', (0, 0, th * 0.08), (w * 0.9, w * 0.9 * dep, w * 0.7), mat=felt(_darker(tcol, 0.2) if top != 'bomber' else INK),
             parent=torso, segs=SEGS, minor=0.1)
    if top in ('bomber', 'denim', 'overshirt', 'track', 'cardigan', 'vest', 'puffer'):
        # an open (or zipped) front: the shirt underneath down the middle, a collar
        if top not in ('track', 'puffer'):
            cut('p_inner', [(-w * 0.3, th * 0.05), (w * 0.3, th * 0.05), (w * 0.22, th * 0.95), (-w * 0.22, th * 0.95)], 0.02, felt(O['inner']), torso, (0, fy, 0))
        else:
            cut('p_zip', [(-0.008, th * 0.08), (0.008, th * 0.08), (0.008, th * 0.95), (-0.008, th * 0.95)], 0.012, felt(WHITE), torso, (0, fy - 0.004, 0))
        if top in ('bomber', 'track', 'puffer'):
            prim('torus', 'p_collar', (0, 0, th * 0.97), (w * 0.5, w * 0.44, w * 0.32), mat=felt(INK if top == 'bomber' else tcol), parent=torso, segs=16, minor=0.24)
        if top == 'track':
            for sx in (-1, 1):
                cut('p_stripe', [(-0.014, 0), (0.014, 0), (0.014, th * 0.9), (-0.014, th * 0.9)], 0.012, felt(WHITE), torso,
                    (sx * w * 1.02, 0.0, th * 0.05), rot=(0, 0, math.pi / 2 * sx))
        if top in ('vest', 'puffer'):
            for k in range(3):
                prim('torus', 'p_quilt', (0, 0, th * (0.28 + 0.24 * k)), (w * (1.08 if top == 'puffer' else 1.0), w * dep * (1.1 if top == 'puffer' else 1.02), w),
                     mat=tmat, parent=torso, segs=SEGS, minor=0.05)
    elif top == 'hoodie':
        # the hood bunched behind the neck, a front pouch, drawstrings
        prim('torus', 'p_hood', (0, w * 0.2, th * 0.98), (w * 0.62, w * 0.55, w * 0.6), (0.35, 0, 0), mat=tmat, parent=torso, segs=SEGS, minor=0.38)
        cut('p_pouch', [(-w * 0.55, 0), (w * 0.55, 0), (w * 0.42, th * 0.26), (-w * 0.42, th * 0.26)], 0.02, felt(_darker(tcol, 0.12)), torso, (0, fy + 0.012, th * 0.14))
        for sx in (-1, 1):
            prim('cyl', 'p_string', (sx * w * 0.16, fy - 0.004, th * 0.8), (0.008, 0.008, th * 0.12), mat=felt(WHITE), parent=torso, segs=6)
    elif top == 'jersey':
        trim = felt(WHITE if tcol != WHITE else '#2c3d72')
        cut('p_vneck', [(-w * 0.3, th * 0.99), (w * 0.3, th * 0.99), (0, th * 0.78)], 0.012, trim, torso, (0, fy, 0))
        label('p_number', O['number'], th * 0.5, trim, torso, (0, -fy * 1.02, th * 0.55), rot=(math.pi / 2, 0, math.pi))
        label('p_number_f', O['number'], th * 0.2, trim, torso, (w * 0.42, fy - 0.002, th * 0.66))
        for sx in (-1, 1):
            cut('p_side', [(-0.016, 0), (0.016, 0), (0.016, th * 0.85), (-0.016, th * 0.85)], 0.012, trim, torso,
                (sx * w * 0.99, 0, th * 0.06), rot=(0, 0, math.pi / 2 * sx))
    elif top == 'tee':
        cut('p_print', K.star_pts(w * 0.3, w * 0.14), 0.012, felt(O['second']), torso, (0, fy - 0.002, th * 0.6))
    elif top == 'rash':
        cut('p_print', [(-w * 0.9, 0), (w * 0.9, 0), (w * 0.9, th * 0.08), (-w * 0.9, th * 0.08)], 0.012, felt(WHITE), torso, (0, fy, th * 0.55))
    elif top == 'dress':
        lathe('p_skirt', [(w * 0.85, th * 0.45), (w * 0.95, th * 0.2), (w * 1.35, -th * 0.35), (w * 1.38, -th * 0.42), (0, -th * 0.42)],
              felt(O['skirt']), torso, sy=0.8)
        prim('torus', 'p_waist', (0, 0, th * 0.42), (w * 0.92, w * 0.92 * dep, w), mat=felt(_darker(O['skirt'], 0.2)), parent=torso, segs=SEGS, minor=0.06)
    elif top == 'pirate':
        for k in range(3):
            prim('torus', 'p_stripe', (0, 0, th * (0.3 + k * 0.2)), (w * 1.01, w * dep * 1.02, w), mat=felt('#d9473f'), parent=torso, segs=SEGS, minor=0.035)
        for sx in (-1, 1):  # an open waistcoat
            cut('p_vest', [(0, th * 0.1), (w * 0.55, th * 0.1), (w * 0.55, th * 0.9), (w * 0.05, th * 0.95)], 0.02, felt('#3a2a26'), torso,
                (sx * w * 0.2 - (w * 0.55 if sx < 0 else 0), fy - 0.004, 0))
        prim('torus', 'p_sash', (0, 0, th * 0.1), (w * 0.95, w * dep, w), mat=felt(O['inner']), parent=torso, segs=SEGS, minor=0.07)
    elif top == 'armour':
        cut('p_tabard', [(-w * 0.62, -th * 0.15), (w * 0.62, -th * 0.15), (w * 0.62, th * 0.9), (-w * 0.62, th * 0.9)], 0.025, felt(O['inner']), torso, (0, fy - 0.004, 0))
        _star(torso, (0, fy - 0.03, th * 0.55), w * 0.32)
        for sx in (-1, 1):
            ball('p_pauldron', (sx * w * 0.95, 0, th * 0.85), (w * 0.38, w * 0.38, w * 0.26), felt('#c4cad6', sheen=0.3), torso)
    elif top == 'scrubs':
        cut('p_vneck', [(-w * 0.25, th * 0.99), (w * 0.25, th * 0.99), (0, th * 0.75)], 0.012, felt(_darker(tcol, 0.25)), torso, (0, fy, 0))
    elif top == 'chef':
        for k in range(2):
            for sx in (-1, 1):
                ball('p_button', (sx * w * 0.25, fy - 0.006, th * (0.45 + k * 0.22)), (0.022, 0.01, 0.022), felt('#3a3346'), torso, segs=8)
        prim('torus', 'p_collar', (0, 0, th * 0.97), (w * 0.48, w * 0.42, w * 0.3), mat=felt(WHITE), parent=torso, segs=16, minor=0.22)
    elif top == 'space':
        cut('p_panel', [(-w * 0.4, 0), (w * 0.4, 0), (w * 0.4, th * 0.32), (-w * 0.4, th * 0.32)], 0.02, felt('#5f7fb8'), torso, (0, fy - 0.004, th * 0.4))
        for k, c in enumerate(('#ff6b5b', '#f2c94c', '#66c792')):
            ball('p_light', ((k - 1) * w * 0.22, fy - 0.03, th * 0.56), (0.024, 0.012, 0.024), K.glow(c, 2.0), torso, segs=8)


def _legs(body, O, leg, hip_z, w, lk, skin, team, kind):
    lr0, lr1 = 0.115 * lk, 0.078 * lk
    pants = felt(O['bottom_col'])
    b = O['bottom']
    for sx, side in ((-1, 'L'), (1, 'R')):
        lg = K.empty(f'leg_{side}', (sx * w * 0.42, 0, hip_z), body)
        lg['side'] = sx
        lg['len'] = leg
        if O['legs'] == 'bare' and b not in ('boardshorts',):
            capsule('p_leg', leg - 0.05, lr0 * 0.82, lr1 * 0.82, skin, lg)
        elif b in ('shorts', 'cargo', 'boardshorts'):
            capsule('p_short', leg * (0.42 if b != 'boardshorts' else 0.5), lr0 * 1.25, lr0 * 1.15, pants, lg)
            capsule('p_leg', leg - 0.05, lr0 * 0.8, lr1 * 0.8, skin, lg)
            if b == 'cargo':
                ball('p_pocket', (sx * lr0 * 1.12, 0, -leg * 0.3), (0.02, 0.055, 0.055), felt(_darker(O['bottom_col'], 0.15)), lg, segs=8)
            if b == 'boardshorts':
                cut('p_stripe', [(-0.012, 0), (0.012, 0), (0.012, leg * 0.45), (-0.012, leg * 0.45)], 0.01, felt(WHITE), lg,
                    (sx * lr0 * 1.2, 0, -leg * 0.48), rot=(0, 0, math.pi / 2 * sx))
        else:
            capsule('p_leg', leg - (0.1 if b == 'joggers' else 0.06), lr0 * 1.1, lr1 * (1.08 if b == 'joggers' else 1.18), pants, lg)
            if b == 'joggers':
                prim('torus', 'p_cuff', (0, 0, -leg + 0.14), (lr1 * 1.0,) * 3, mat=felt(_darker(O['bottom_col'], 0.2)), parent=lg, segs=12, minor=0.35)
        if O['socks'] and O['legs'] != 'bare' and b in ('shorts', 'cargo'):
            capsule('p_sock', leg * 0.3, lr1 * 1.08, lr1 * 0.98, felt(O['socks']), lg, (0, 0, -leg * 0.64))
            if 'kit' in O['extras']:
                prim('torus', 'p_band', (0, 0, -leg * 0.68), (lr1 * 1.08,) * 3, mat=felt(WHITE), parent=lg, segs=12, minor=0.25)
        _shoe(lg, leg, O['feet'], O['shoe'], 1.45 * (1.08 if kind != 'kid' else 1.0), skin)


def _shoe(lg, leg, kind, colors, s, skin):
    upper, accent = colors
    foot = K.empty('foot', (0, -0.02, -leg), lg)
    if kind == 'bare':
        ball('p_foot', (0, -0.05 * s, 0.03 * s), (0.05 * s, 0.1 * s, 0.035 * s), skin, foot)
        return
    if kind == 'slippers':
        ball('p_shoe', (0, -0.04 * s, 0.04 * s), (0.065 * s, 0.12 * s, 0.045 * s), felt(upper, fuzz=1.5), foot)
        ball('p_pom', (0, -0.13 * s, 0.07 * s), (0.03 * s,) * 3, felt(accent, fuzz=1.5), foot, segs=8)
        return
    if kind == 'flats':
        ball('p_shoe', (0, -0.04 * s, 0.03 * s), (0.058 * s, 0.115 * s, 0.035 * s), K.glossy(upper, 0.3), foot)
        return
    sole_c = WHITE if upper != WHITE else '#3a3346'
    if kind in ('cleats', 'boots'):
        sole_c = INK if kind == 'cleats' else '#3a2a26'
    ball('p_sole', (0, -0.045 * s, 0.018 * s), (0.068 * s, 0.135 * s, 0.03 * s), felt(sole_c), foot)
    ball('p_shoe', (0, -0.04 * s, 0.05 * s), (0.064 * s, 0.125 * s, 0.05 * s), felt(upper), foot)
    if kind == 'boots':
        prim('cyl', 'p_boot', (0, 0.0, 0.12 * s), (0.064 * s, 0.064 * s, 0.075 * s), mat=felt(upper), parent=foot, segs=12)
        prim('torus', 'p_rim', (0, 0, 0.19 * s), (0.064 * s,) * 3, mat=felt(accent), parent=foot, segs=12, minor=0.25)
        return
    ball('p_toe', (0, -0.12 * s, 0.038 * s), (0.05 * s, 0.05 * s, 0.03 * s), felt(sole_c if kind != 'cleats' else accent), foot)
    for sx in (-1, 1):
        cut('p_flash', [(0.07 * s, 0.03 * s), (-0.06 * s, 0.07 * s), (-0.06 * s, 0.05 * s), (0.06 * s, 0.022 * s)], 0.006, felt(accent), foot,
            (sx * 0.066 * s, -0.04 * s, 0.0), rot=(0, 0, math.pi / 2))
    if kind == 'sneakers':
        # a high-top collar and laces
        prim('cyl', 'p_collar', (0, 0.0, 0.11 * s), (0.062 * s, 0.062 * s, 0.045 * s), mat=felt(upper), parent=foot, segs=12)
        prim('torus', 'p_rim', (0, 0, 0.155 * s), (0.06 * s,) * 3, mat=felt(accent), parent=foot, segs=12, minor=0.22)
        for k in range(3):
            ball('p_lace', (0, -0.06 * s - k * 0.025 * s, 0.098 * s - k * 0.012 * s), (0.03 * s, 0.006 * s, 0.006 * s), felt('#fbf8f2'), foot, segs=6)


def _hat(head, r, O, team, hair):
    hat = O['hat']
    if hat in ('cap', 'cap_back'):
        col = team if hat == 'cap' else O['second']
        cm = felt(col)
        back = hat == 'cap_back'
        # a forward cap comes down to the brow; a backwards one is pushed back off the forehead
        _shell('cap', r * 1.13, (lambda x, y, z: z > 0.3 - 0.24 * y) if back else (lambda x, y, z: z > 0.22 + 0.08 * y), cm, head, thick=0.03)
        prim('cyl', 'cap_peak', (0, r * 1.0 if back else -r * 0.98, r * (0.18 if back else 0.34)), (r * 0.5, r * 0.38, 0.014), (-0.45 if back else 0.22, 0, 0),
             mat=felt(_darker(col, 0.25)), parent=head, segs=16)
        ball('cap_button', (0, 0, r * 1.13), (0.024, 0.024, 0.016), cm, head, segs=8)
        if back:  # the strap opening at the front shows the hair
            prim('torus', 'cap_strap', (0, -r * 0.82, r * 0.62), (r * 0.26, r * 0.2, r * 0.22), (math.pi / 2 - 0.5, 0, 0), mat=felt(_darker(col, 0.25)), parent=head,
                 segs=14, minor=0.12)
        else:
            cut('cap_logo', K.star_pts(r * 0.14, r * 0.06), 0.01, felt(WHITE), head, (0, -r * 1.05, r * 0.62), rot=(-0.6, 0, 0))
    elif hat == 'flatcap':
        ball('flatcap', (0, -r * 0.12, r * 0.7), (r * 1.08, r * 1.12, r * 0.38), felt('#6b5a48'), head, rot=(0.25, 0, 0))
    elif hat == 'beanie':
        _shell('beanie', r * 1.14, lambda x, y, z: z > 0.3 - 0.2 * y, felt(team), head, thick=0.05)
        prim('torus', 'beanie_band', (0, r * 0.1, r * 0.38), (r * 1.08, r * 1.04, r * 0.6), (0.18, 0, 0), mat=felt(WHITE), parent=head, segs=24, minor=0.12)
        ball('pompom', (0, r * 0.15, r * 1.18), r * 0.26, felt(WHITE, fuzz=1.6), head, segs=12)
    elif hat == 'chef':
        prim('cyl', 'chef_band', (0, r * 0.05, r * 0.72), (r * 0.85, r * 0.85, r * 0.16), mat=felt(WHITE), parent=head, segs=20)
        ball('chef_puff', (0, r * 0.05, r * 1.15), (r * 0.98, r * 0.92, r * 0.5), felt(WHITE), head)
    elif hat == 'tricorn':
        h = K.empty('pirate_hat', (0, r * 0.05, r * 0.72), head)
        prim('cyl', 'hat_brim', (0, 0, 0), (r * 1.25, r * 0.95, 0.03), mat=felt('#2d2a33'), parent=h, segs=24)
        ball('hat_top', (0, 0, r * 0.08), (r * 0.85, r * 0.72, r * 0.45), felt('#2d2a33'), h)
        prim('torus', 'hat_band', (0, 0, r * 0.06), (r * 0.82, r * 0.7, r * 0.3), mat=felt('#f2c94c'), parent=h, segs=20, minor=0.08)
        _star(h, (0, -r * 0.72, r * 0.22), r * 0.16, '#fdf6e3')
    elif hat == 'helmet':
        _shell('helm', r * 1.14, lambda x, y, z: not (y < -0.1 and z < 0.55 and abs(x) < 0.78) and z > -0.4, felt('#c4cad6', sheen=0.3), head, thick=0.035)
        prim('cone', 'plume', (0, r * 0.2, r * 1.25), (1, 1, r * 0.25), (0.4, 0, 0), mat=felt('#d9473f'), parent=head, segs=10, r1=r * 0.15, r2=0.02)
    elif hat == 'space':
        prim('torus', 'helmet', (0, -r * 0.08, 0), (r * 1.18,) * 3, (math.pi / 2, 0, 0), mat=felt('#eef0f3', sheen=0.4), parent=head, segs=28, minor=0.16)
        ball('helmet_back', (0, r * 0.35, 0), (r * 1.2, r * 0.85, r * 1.2), felt('#eef0f3', sheen=0.4), head)
        prim('cyl', 'antenna', (r * 0.55, r * 0.2, r * 1.18), (0.012, 0.012, 0.12), mat=felt('#9aa3b5'), parent=head, segs=6)
        ball('antenna_tip', (r * 0.55, r * 0.2, r * 1.33), 0.035, K.glow('#ff6b5b', 3.0), head, segs=8)


def _star(parent, loc, size, col='#f2c94c'):
    s = K.outline_obj('badge', K.star_pts(size, size * 0.48), 0.02, felt(col, sheen=0.6), bevel=0.006)
    s.parent = parent
    s.location = loc
    return s


def _extras(name, O, L, torso, head, body, w, th, r, skin_hex, kind, team):
    dep = 0.66
    fy = -w * dep * 0.97
    acc = O['acc']
    if acc == 'headphones':
        hm = felt(O['second'])
        if kind == 'kid' and O['hat'] is None and (_seed(name) % 2):
            prim('torus', 'phones_band', (0, 0.0, th * 1.02), (w * 0.55, w * 0.5, w * 0.5), (0.3, 0, 0), mat=felt(INK), parent=torso, segs=16, minor=0.12)
            for sx in (-1, 1):
                prim('cyl', 'phones_cup', (sx * w * 0.45, -w * 0.25, th * 0.97), (0.065, 0.065, 0.03), (0.3, sx * 1.2, 0), mat=hm, parent=torso, segs=14)
        else:
            prim('torus', 'phones_band', (0, 0, r * 0.1), (r * 1.14,) * 3, (math.pi / 2, 0, 0), mat=felt(INK), parent=head, segs=20, minor=0.07)
            for sx in (-1, 1):
                prim('cyl', 'phones_cup', (sx * r * 1.06, 0, -r * 0.05), (r * 0.36, r * 0.36, r * 0.12), (0, math.pi / 2, 0), mat=hm, parent=head, segs=14)
    elif acc == 'backpack':
        bp = felt(O['second'])
        prim('cube', 'backpack', (0, w * dep + 0.07, th * 0.5), (w * 0.72, 0.07, th * 0.38), mat=bp, parent=torso)
        ball('backpack_pocket', (0, w * dep + 0.14, th * 0.35), (w * 0.5, 0.035, th * 0.16), felt(_darker(O['second'], 0.2)), torso)
        for sx in (-1, 1):
            cut('strap', [(-0.018, 0), (0.018, 0), (0.018, th * 0.8), (-0.018, th * 0.8)], 0.012, felt(INK), torso, (sx * w * 0.42, fy - 0.006, th * 0.15))
    for x in O['extras']:
        if x == 'dots':
            for dx, dz in ((-0.4, 0.75), (0.3, 0.55), (-0.15, 0.35), (0.45, 0.85), (0.05, 0.72)):
                ball('pj_dot', (dx * w, fy - 0.006 + abs(dx) * 0.06, dz * th), (0.028, 0.012, 0.028), felt('#ffffff'), torso, segs=8)
        elif x == 'scarf':
            prim('torus', 'scarf', (0, 0, th * 1.0), (w * 0.58, w * 0.52, w * 0.45), mat=felt('#e8b33d'), parent=torso, segs=18, minor=0.32)
            ball('scarf_end', (w * 0.25, fy - 0.02, th * 0.72), (0.065, 0.03, 0.16), felt('#e8b33d'), torso, rot=(0, 0.2, 0), segs=10)
        elif x == 'space':
            prim('cube', 'space_pack', (0, w * dep + 0.08, th * 0.5), (w * 0.72, 0.09, th * 0.45), mat=felt('#cfd5df'), parent=torso)
        elif x == 'crown':
            crown = K.empty('crown', (0, r * 0.05, r * 0.92), head)
            gold = felt('#f2c94c', sheen=0.4)
            prim('cyl', 'crown_band', (0, 0, 0), (r * 0.52, r * 0.52, r * 0.1), mat=gold, parent=crown, segs=20)
            for k in range(5):
                a = k * 2 * math.pi / 5 + math.pi / 2
                prim('cone', 'crown_pt', (math.cos(a) * r * 0.47, math.sin(a) * r * 0.47, r * 0.18), (1, 1, r * 0.1), mat=gold, parent=crown, segs=8, r1=r * 0.09, r2=0.0)
            ball('crown_gem', (0, -r * 0.52, 0), (0.03, 0.015, 0.03), K.glossy('#e2557a'), crown, segs=8)
        elif x == 'gown':
            lathe('gown', [(w * 1.4, -th * 0.4), (w * 1.75, -th * 0.95), (w * 1.78, -th * 1.02), (0, -th * 1.02)], felt(team), torso, sy=0.82)
            prim('torus', 'gown_hem', (0, 0, -th * 1.0), (w * 1.76, w * 1.45, w), mat=felt(_lighter(team, 0.5)), parent=torso, segs=24, minor=0.05)
        elif x == 'cape':
            cape = K.outline_obj('cape', [(-w * 1.0, 0), (w * 1.0, 0), (w * 1.5, -th * 1.55), (-w * 1.5, -th * 1.55)], 0.03,
                                 felt('#d9473f' if team != '#d9473f' else '#2c3d72'), bevel=0.01)
            cape.parent = torso
            cape.location = (0, w * dep + 0.02, th * 0.95)
            cape.rotation_euler.x = -0.12
            cape.name = 'cape'
        elif x == 'chest_star':
            _star(torso, (0, fy - 0.006, th * 0.6), w * 0.38)
        elif x == 'mask':
            m = felt('#d9473f' if team != '#d9473f' else '#2c3d72')
            _shell('mask', r * 1.02, lambda x, y, z: y < -0.2 and -0.12 < z < 0.32, m, head, thick=0.012)
        elif x == 'belt':
            prim('torus', 'belt', (0, 0, th * 0.12), (w * 0.92, w * dep * 0.95, w), mat=felt('#f2c94c'), parent=torso, segs=SEGS, minor=0.07)
        elif x == 'whistle':
            prim('torus', 'lanyard', (0, -w * 0.15, th * 0.8), (w * 0.5, w * 0.55, w * 0.55), (0.5, 0, 0), mat=felt(WHITE), parent=torso, segs=16, minor=0.05)
            prim('cyl', 'whistle', (0, fy - 0.03, th * 0.42), (0.03, 0.03, 0.045), (0, math.pi / 2, 0), mat=K.glossy('#c9ccd4', 0.3), parent=torso, segs=10)
        elif x == 'lanyard':
            prim('torus', 'lanyard', (0, -w * 0.15, th * 0.8), (w * 0.5, w * 0.55, w * 0.55), (0.5, 0, 0), mat=felt('#3f74c9'), parent=torso, segs=16, minor=0.05)
            cut('badge_card', [(-0.04, 0), (0.04, 0), (0.04, 0.06), (-0.04, 0.06)], 0.01, felt(WHITE), torso, (0, fy - 0.03, th * 0.35))
        elif x == 'labcoat':
            coat = felt(WHITE)
            for sx in (-1, 1):
                lathe('labcoat', [(w * 0.62, th * 0.95), (w * 0.72, th * 0.5), (w * 0.8, -th * 0.1), (w * 0.84, -th * 0.55), (0, -th * 0.55)], coat, torso,
                      loc=(sx * w * 0.45, 0, 0), sy=1.1)
        elif x == 'stethoscope':
            prim('torus', 'stetho', (0, -w * 0.12, th * 0.9), (w * 0.4, w * 0.5, w * 0.45), (0.25, 0, 0), mat=felt('#4a6a8a'), parent=torso, segs=18, minor=0.07)
            prim('cyl', 'stetho_disc', (w * 0.2, fy - 0.06, th * 0.45), (0.045, 0.045, 0.015), (math.pi / 2, 0, 0), mat=K.glossy('#c9ccd4', 0.3), parent=torso, segs=12)
        elif x == 'apron':
            cut('apron', [(-w * 0.65, -th * 0.35), (w * 0.65, -th * 0.35), (w * 0.6, th * 0.75), (-w * 0.6, th * 0.75)], 0.02, felt('#e9a9b7'), torso, (0, fy - 0.01, 0))
        elif x == 'bib':
            cut('bib', [(-w * 0.55, th * 0.05), (w * 0.55, th * 0.05), (w * 0.5, th * 0.7), (-w * 0.5, th * 0.7)], 0.02, felt(DENIM), torso, (0, fy - 0.006, 0))
            for sx in (-1, 1):
                cut('bib_strap', [(-0.02, 0), (0.02, 0), (0.02, th * 0.3), (-0.02, th * 0.3)], 0.012, felt(DENIM), torso, (sx * w * 0.4, fy - 0.006, th * 0.68))
                ball('bib_btn', (sx * w * 0.4, fy - 0.02, th * 0.72), (0.025, 0.012, 0.025), felt('#f2c94c'), torso, segs=8)


PEOPLE = {'kid': person, 'grownup': person, 'grandparent': person}
