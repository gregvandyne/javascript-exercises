"""Felt-and-paper props for the Story Builder kit.

PROPS: every prop a story may put in a scene -> (spot, builder). The spot says where render_story's stage puts it:
  ground  on the floor, beside or behind the characters      back   further back (vehicles, big things)
  sky     up in the sky                                      air    floating all around (confetti, butterflies)
  weather over the whole picture (rain, snow)                sea    on the water (the boat)
  top     strung across the top of the picture (bunting)
A builder is fn(x, y, z, rng, ctx) -> root object; ctx = {'night': bool, 'set': name}.
HOLD: the props a character can carry (`holds`) -> fn() -> root object, built around the hand at the origin.
Helpers the actions use (a book to read, a snack, a ladder, a bike, a bed, a ripple, balls) are plain functions.
Every name is listed in server/stories/blender/catalog.json (a test checks both ways).
"""
import math

import bmesh
import bpy

import feltkit as K

F = K.felt
prim = K.prim
GOLD = '#f2c24a'


class Batch:
    """Many simple felt shapes as ONE mesh (one object, one material slot per colour): much quicker to build than one
    object per shape (bpy.ops per primitive is slow) and lighter to render. For static set dressing and crowds.

        b = Batch('crowd'); b.add('sphere', (x, y, z), (rx, ry, rz), mat=F('#d9473f')); ob = b.done(parent)
    """

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.mats = []

    def add(self, kind, loc, scale, rot=(0, 0, 0), mat=None, segs=12, smooth=True, r1=1.0, r2=0.0):
        from mathutils import Euler, Matrix
        bm = self.bm
        if kind == 'sphere':
            g = bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=max(6, segs // 2), radius=1.0)
        elif kind == 'cyl':
            g = bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=1.0, radius2=1.0, depth=2.0)
        elif kind == 'cone':
            g = bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r1, radius2=r2, depth=2.0)
        else:
            g = bmesh.ops.create_cube(bm, size=2.0)
            smooth = False
        verts = g['verts']
        M = Matrix.LocRotScale(loc, Euler(rot), scale)
        bmesh.ops.transform(bm, matrix=M, verts=verts)
        if mat not in self.mats:
            self.mats.append(mat)
        mi = self.mats.index(mat)
        faces = {f for v in verts for f in v.link_faces}
        for f in faces:
            f.material_index = mi
            f.smooth = smooth
        return self

    def done(self, parent=None, loc=(0, 0, 0)):
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        ob = bpy.data.objects.new(self.name, me)
        K.link(ob)
        for m in self.mats:
            ob.data.materials.append(m)
        ob.location = loc
        if parent is not None:
            ob.parent = parent
        return ob


def _root(name, x=0.0, y=0.0, z=0.0):
    return K.empty(name, (x, y, z))


def _bevel(ob, w=0.03, segs=2):
    m = ob.modifiers.new('bevel', 'BEVEL')
    m.width = w
    m.segments = segs
    return ob


def box(name, loc, size, mat, parent, bevel=0.03, rot=(0, 0, 0)):
    """A felt box: size is the full (w, d, h); a small bevel so edges read soft."""
    ob = prim('cube', name, loc, (size[0] / 2, size[1] / 2, size[2] / 2), rot, mat=mat, parent=parent)
    if bevel:
        _bevel(ob, min(bevel, min(size) * 0.3))
    return ob


def _multi(ob, mats, pick):
    """Give a mesh several materials, face by face: pick(face_center) -> index."""
    for m in mats[1:]:
        ob.data.materials.append(m)
    for p in ob.data.polygons:
        p.material_index = pick(p.center)
    return ob


def _bob(ob, amp=0.05, speed=1.2, ph=0.0, axis='z'):
    base = getattr(ob.location, axis)
    K.anim(lambda t, f, o=ob: setattr(o.location, axis, base + math.sin(t * speed + ph) * amp))


# ---------------------------------------------------------------- balls
def soccer_ball(r=0.13, name='soccer_ball'):
    root = _root(name)
    prim('sphere', 'ball', (0, 0, 0), (r, r, r), mat=F('#f8f6f0', fuzz=0.6), parent=root, segs=20)
    # twelve felt patches on an icosahedron's corners
    g = (1 + 5 ** 0.5) / 2
    pts = [(-1, g, 0), (1, g, 0), (-1, -g, 0), (1, -g, 0), (0, -1, g), (0, 1, g), (0, -1, -g), (0, 1, -g), (g, 0, -1), (g, 0, 1), (-g, 0, -1), (-g, 0, 1)]
    dark = F('#2a2730', fuzz=0.6)
    for i, (a, b, c) in enumerate(pts):
        n = math.sqrt(a * a + b * b + c * c)
        d = (a / n, b / n, c / n)
        p = prim('cyl', 'patch', (d[0] * r * 0.96, d[1] * r * 0.96, d[2] * r * 0.96), (r * 0.33, r * 0.33, r * 0.06), mat=dark, parent=root, segs=5, smooth_it=False)
        p.rotation_mode = 'QUATERNION'
        p.rotation_quaternion = K.Vector((0, 0, 1)).rotation_difference(K.Vector(d))
    return root


def basketball(r=0.15, name='basketball'):
    root = _root(name)
    prim('sphere', 'ball', (0, 0, 0), (r, r, r), mat=F('#e8742f', fuzz=0.7), parent=root, segs=20)
    seam = F('#3a2620')
    for rot in ((0, 0, 0), (math.pi / 2, 0, 0), (0, math.pi / 2, 0)):
        prim('torus', 'seam', (0, 0, 0), (r * 1.0, r * 1.0, r * 1.0), rot, mat=seam, parent=root, segs=32, minor=0.025)
    return root


def baseball(r=0.08, name='baseball'):
    root = _root(name)
    prim('sphere', 'ball', (0, 0, 0), (r, r, r), mat=F('#f8f6f0', fuzz=0.6), parent=root, segs=16)
    for sx in (-1, 1):
        prim('torus', 'stitch', (sx * r * 0.45, 0, 0), (r * 0.8, r * 0.8, r * 0.8), (0, math.pi / 2, 0), mat=F('#d33f3f'), parent=root, segs=20, minor=0.05)
    return root


def beach_ball(r=0.22, name='beach_ball'):
    root = _root(name)
    b = prim('sphere', 'ball', (0, 0, 0), (r, r, r), mat=F('#ffffff', fuzz=0.5), parent=root, segs=24)
    mats = [F('#ffffff', fuzz=0.5), F('#e5484d', fuzz=0.5), F('#f2c94c', fuzz=0.5), F('#3f74c9', fuzz=0.5)]
    _multi(b, mats, lambda c: (int((math.atan2(c.y, c.x) + math.pi) / (math.pi / 3)) % 6) % 2 * (1 + (int((math.atan2(c.y, c.x) + math.pi) / (math.pi / 3)) // 2) % 3) if abs(c.z) < r * 0.85 else 0)
    return root


BALLS = {'soccer_ball': soccer_ball, 'basketball': basketball, 'baseball': baseball, 'beach_ball': beach_ball}


def ball_for(set_name, props=()):
    for p in props:
        if p in BALLS:
            return p
    return {'basketball_court': 'basketball', 'baseball_field': 'baseball', 'beach': 'beach_ball', 'swimming_pool': 'beach_ball'}.get(set_name, 'soccer_ball')


# ---------------------------------------------------------------- things actions bring
def book_open(name='book'):
    root = _root(name)
    cover = F('#d9473f')
    page = K.paper('#fbf5e6')
    for sx in (-1, 1):
        box('book_cover', (sx * 0.11, 0, 0), (0.23, 0.02, 0.3), cover, root, 0.008, rot=(0.25, -sx * 0.18, 0))
        box('book_page', (sx * 0.1, -0.015, 0.0), (0.2, 0.02, 0.27), page, root, 0.005, rot=(0.25, -sx * 0.18, 0))
    flip = K.empty('book_flip', (0, -0.03, 0), root)
    box('book_leaf', (0.1, 0, 0), (0.2, 0.008, 0.26), page, flip, 0, rot=(0.25, 0, 0))
    root['flip'] = flip.name
    return root


def book_flip(book, t):
    flip = bpy.data.objects.get(book['flip'])
    if flip is not None:
        c = (t % 5.0) / 5.0
        flip.rotation_euler.z = 0 if c < 0.8 else math.pi * ((c - 0.8) / 0.2)


def snack(set_name=None, name='snack'):
    root = _root(name)
    if set_name in ('party_room', 'bakery'):
        # a cupcake
        prim('cone', 'cup', (0, 0, 0.04), (1, 1, 0.05), mat=F('#ec8db0'), parent=root, segs=12, r1=0.05, r2=0.07)
        prim('sphere', 'icing', (0, 0, 0.11), (0.075, 0.075, 0.06), mat=F('#fdf3f7'), parent=root, segs=12)
        prim('sphere', 'cherry', (0, 0, 0.17), (0.022, 0.022, 0.022), mat=K.glossy('#d33f3f'), parent=root, segs=8)
    elif set_name in ('beach', 'park', 'playground', 'zoo', 'city', 'swimming_pool'):
        prim('cone', 'cone', (0, 0, -0.02), (1, 1, 0.09), (math.pi, 0, 0), mat=F('#d9a35a'), parent=root, segs=12, r1=0.05, r2=0.0)
        prim('sphere', 'scoop', (0, 0, 0.08), (0.06, 0.06, 0.055), mat=F('#f4b6c8'), parent=root, segs=12)
    else:
        # an apple
        prim('sphere', 'apple', (0, 0, 0.03), (0.07, 0.07, 0.065), mat=F('#d33f3f', sheen=0.5), parent=root, segs=14)
        prim('cyl', 'stalk', (0, 0, 0.1), (0.007, 0.007, 0.025), mat=F('#6b4532'), parent=root, segs=6)
        prim('sphere', 'leaf', (0.025, 0, 0.11), (0.03, 0.01, 0.015), (0, -0.4, 0), mat=F('#4f9d5d'), parent=root, segs=8)
    return root


def ladder(h=1.9, name='ladder'):
    root = _root(name)
    wood = F('#b9844f')
    for sx in (-1, 1):
        prim('cyl', 'ladder_rail', (sx * 0.28, 0, h / 2), (0.035, 0.035, h / 2), mat=wood, parent=root, segs=8)
    for k in range(6):
        prim('cyl', 'ladder_rung', (0, 0, 0.25 + k * (h - 0.35) / 5), (0.025, 0.025, 0.28), (0, math.pi / 2, 0), mat=wood, parent=root, segs=8)
    return root


def ripple(r=0.55, name='ripple'):
    root = _root(name)
    prim('cyl', 'water', (0, 0, 0), (r, r * 0.55, 0.03), mat=F('#7fc1e8', sheen=0.8, fuzz=0.4), parent=root, segs=28)
    prim('torus', 'foam', (0, 0, 0.02), (r, r * 0.55, r * 0.55), mat=F('#f4fbff'), parent=root, segs=28, minor=0.06)
    K.anim(lambda t, f, o=root: setattr(o.rotation_euler, 'z', math.sin(t * 1.5) * 0.05))
    return root


def bike(scale=0.8, name='bike', color='#d9473f'):
    root = _root(name)
    s = scale
    fr = F(color)
    wr = 0.28 * s
    for sx in (-1, 1):
        w = K.empty('wheel', (sx * 0.42 * s, 0, wr), root)
        prim('torus', 'tyre', (0, 0, 0), (wr, wr, wr), (math.pi / 2, 0, 0), mat=F('#2b2b33'), parent=w, segs=28, minor=0.14)
        prim('cyl', 'hub', (0, 0, 0), (0.04 * s, 0.04 * s, 0.03), (math.pi / 2, 0, 0), mat=F('#c9ccd4'), parent=w, segs=10)
        for k in range(3):
            prim('cube', 'spoke', (0, 0, 0), (wr * 0.95, 0.006, 0.006), (0, k * math.pi / 3, 0), mat=F('#c9ccd4'), parent=w)
    seat_z = wr + 0.36 * s
    for a, b in (((-0.42, wr), (0.0, seat_z - 0.05)), ((0.0, seat_z - 0.05), (0.38, seat_z)), ((-0.42, wr), (0.1, wr + 0.05)), ((0.1, wr + 0.05), (0.38, seat_z)), ((0.42, wr), (0.36, seat_z + 0.12))):
        (ax, az), (bx, bz) = a, b
        ax, bx = ax * s, bx * s
        L = math.hypot(bx - ax, bz - az)
        prim('cyl', 'frame', ((ax + bx) / 2, 0, (az + bz) / 2), (0.022, 0.022, L / 2), (0, math.atan2(bx - ax, bz - az), 0), mat=fr, parent=root, segs=8)
    prim('sphere', 'seat', (0.0, 0, seat_z), (0.1 * s, 0.06, 0.03), mat=F('#3a3346'), parent=root, segs=10)
    prim('cyl', 'handlebar', (0.36 * s, 0, seat_z + 0.13), (0.02, 0.02, 0.14), (math.pi / 2, 0, 0), mat=F('#3a3346'), parent=root, segs=8)
    prim('sphere', 'basket', (0.48 * s, 0, seat_z), (0.09, 0.1, 0.07), mat=F('#d9a35a'), parent=root, segs=10)
    root['seat'] = seat_z
    return root


def bike_spin(b, a):
    for c in b.children:
        if c.name.startswith('wheel'):
            c.rotation_euler.y = a


def bed(length=1.5, name='bed', quilt=('#7fb2e5', '#f2c94c', '#ec8db0', '#9bd3a8')):
    root = _root(name)
    wood = F('#b9844f')
    L = length
    box('bed_frame', (0, 0, 0.18), (L, 0.8, 0.22), wood, root, 0.04)
    box('mattress', (0, 0, 0.36), (L - 0.06, 0.74, 0.16), F('#f6f1e6'), root, 0.05)
    hb = K.outline_obj('headboard', [(-0.45, 0), (0.45, 0), (0.45, 0.7), (0.3, 0.85), (-0.3, 0.85), (-0.45, 0.7)], 0.08, wood, bevel=0.03)
    hb.parent = root
    hb.location = (-L / 2 - 0.02, -0.04, 0.05)
    hb.rotation_euler.z = math.pi / 2
    hb.location = (-L / 2, 0.45, 0.05)
    prim('sphere', 'pillow', (-L / 2 + 0.22, 0.05, 0.5), (0.16, 0.28, 0.08), mat=F('#ffffff'), parent=root, segs=14)
    # a patchwork quilt, square by square, folded back at the top
    qx0, qx1 = -L / 2 + 0.72, L / 2 - 0.02
    n = 4
    for i in range(n):
        for j in range(2):
            col = quilt[(i + j) % len(quilt)]
            # the front of the quilt, tucked over whoever sleeps here, and its drop down the side of the bed
            box('quilt', (qx0 + (qx1 - qx0) * (i + 0.5) / n, -0.36, 0.7 - j * 0.3), ((qx1 - qx0) / n + 0.005, 0.05, 0.3), F(col), root, 0.012)
    box('quilt_top', ((qx0 + qx1) / 2, 0.02, 0.84), (qx1 - qx0, 0.76, 0.05), F(quilt[1]), root, 0.02)
    box('quilt_fold', (qx0 + 0.04, -0.02, 0.72), (0.1, 0.82, 0.32), F('#ffffff'), root, 0.03)
    return root


# ---------------------------------------------------------------- scene props
def p_boat(x, y, z, rng, ctx):
    return K.boat(-6.0, 9.0, 0.35)


def p_lantern(x, y, z, rng, ctx):
    return K.lantern(x, y, z)


def p_fireflies(x, y, z, rng, ctx):
    import felt_sets
    felt_sets.fireflies(rng)
    return None


def p_ball(kind):
    def b(x, y, z, rng, ctx):
        r = BALLS[kind]()
        r.location = (x, y, z + {'soccer_ball': 0.13, 'basketball': 0.15, 'baseball': 0.08, 'beach_ball': 0.22}[kind])
        return r
    return b


def trophy(scale=1.0, name='trophy'):
    root = _root(name)
    s = scale
    gold = F(GOLD, sheen=0.5)
    shine = K.glossy('#f7d774', 0.3)
    box('trophy_base', (0, 0, 0.06 * s), (0.26 * s, 0.26 * s, 0.12 * s), F('#5a3a2b'), root, 0.02)
    prim('cyl', 'trophy_stem', (0, 0, 0.18 * s), (0.04 * s, 0.04 * s, 0.07 * s), mat=gold, parent=root, segs=12)
    prim('cone', 'trophy_cup', (0, 0, 0.36 * s), (1, 1, 0.13 * s), mat=gold, parent=root, segs=20, r1=0.06 * s, r2=0.17 * s)
    prim('torus', 'trophy_rim', (0, 0, 0.49 * s), (0.17 * s, 0.17 * s, 0.17 * s), mat=shine, parent=root, segs=24, minor=0.1)
    for sx in (-1, 1):
        prim('torus', 'trophy_handle', (sx * 0.17 * s, 0, 0.38 * s), (0.07 * s, 0.07 * s, 0.07 * s), (math.pi / 2, 0, 0), mat=gold, parent=root, segs=14, minor=0.2)
    st = K.outline_obj('trophy_star', K.star_pts(0.06 * s, 0.028 * s), 0.02, F('#fff4c2', emit=0.6), bevel=0.005)
    st.parent = root
    st.location = (0, -0.15 * s, 0.36 * s)
    return root


def medal(scale=1.0, name='medal'):
    root = _root(name)
    s = scale
    for sx in (-1, 1):
        box('ribbon', (sx * 0.03 * s, 0, 0.1 * s), (0.04 * s, 0.01, 0.2 * s), F('#3f74c9' if sx < 0 else '#d9473f'), root, 0.004, rot=(0, -sx * 0.25, 0))
    prim('cyl', 'medal', (0, -0.01, -0.02 * s), (0.06 * s, 0.06 * s, 0.012), (math.pi / 2, 0, 0), mat=F(GOLD, sheen=0.5), parent=root, segs=18)
    st = K.outline_obj('medal_star', K.star_pts(0.035 * s, 0.016 * s), 0.01, F('#fff4c2', emit=0.4), bevel=0.003)
    st.parent = root
    st.location = (0, -0.03, -0.02 * s)
    return root


def p_trophy(x, y, z, rng, ctx):
    root = _root('trophy_stand', x, y, z)
    box('plinth', (0, 0, 0.25), (0.5, 0.5, 0.5), F('#3f74c9'), root, 0.04)
    t = trophy(1.2)
    t.parent = root
    t.location = (0, 0, 0.5)
    K.anim(lambda tt, f, o=t: setattr(o.rotation_euler, 'z', math.sin(tt * 0.6) * 0.3))
    return root


def p_medal(x, y, z, rng, ctx):
    root = _root('medal_cushion', x, y, z)
    prim('sphere', 'cushion', (0, 0, 0.12), (0.3, 0.22, 0.12), mat=F('#c2455a'), parent=root, segs=16)
    m = medal(1.4)
    m.parent = root
    m.location = (0, -0.05, 0.3)
    m.rotation_euler.x = -0.9
    return root


SEG = {0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcfgd'}


def _digit(parent, n, x, z, h, mat):
    w = h * 0.5
    segs = {'a': (0, h / 2, True), 'g': (0, 0, True), 'd': (0, -h / 2, True), 'b': (w / 2, h / 4, False), 'c': (w / 2, -h / 4, False), 'e': (-w / 2, -h / 4, False), 'f': (-w / 2, h / 4, False)}
    for s in SEG[n]:
        sx, sz, horiz = segs[s]
        prim('cube', 'seg', (x + sx, -0.12, z + sz), (w * 0.42 if horiz else h * 0.05, 0.02, h * 0.05 if horiz else h * 0.21), mat=mat, parent=parent)


def p_scoreboard(x, y, z, rng, ctx):
    if not ctx.get('indoor'):  # outdoors it stands well back, above the crowd, not in front of the story
        x, y = (-6.3 if x <= 0 else 6.3), y + 5.5
    root = _root('scoreboard', x, y, z)
    for sx in (-1, 1):
        prim('cyl', 'post', (sx * 1.1, 0.1, 1.0), (0.07, 0.07, 1.0), mat=F('#6b6f8a'), parent=root, segs=10)
    box('board', (0, 0, 2.35), (2.8, 0.18, 1.2), F('#24414a'), root, 0.06)
    box('board_rim', (0, 0.02, 2.35), (2.95, 0.16, 1.35), F('#f2c94c'), root, 0.06)
    lit = K.glow('#ffd76a', 3.0)
    home, away = rng.randint(1, 3), rng.randint(0, 2)
    _digit(root, home, -0.65, 2.3, 0.6, lit)
    _digit(root, away, 0.65, 2.3, 0.6, lit)
    prim('cube', 'dash', (0, -0.12, 2.3), (0.1, 0.02, 0.03), mat=lit, parent=root)
    for sx, col in ((-1, '#d9473f'), (1, '#3f74c9')):
        box('team_flag', (sx * 0.65, -0.05, 2.82), (0.6, 0.04, 0.16), F(col), root, 0.02)
    return root


def p_flags(x, y, z, rng, ctx):
    root = _root('bunting', 0, y, 0)
    cols = ['#d9473f', '#f2c94c', '#3f74c9', '#4f9d5d', '#ec8db0', '#ee8a33']
    pts = []
    for k in range(25):
        u = k / 24
        xx = -7 + 14 * u
        zz = 3.7 - 0.55 * math.sin(u * math.pi * 2) ** 2 - 0.15
        pts.append((xx, zz))
    for k in range(24):
        (ax, az), (bx, bz) = pts[k], pts[k + 1]
        L = math.hypot(bx - ax, bz - az)
        prim('cyl', 'string', ((ax + bx) / 2, 0, (az + bz) / 2), (0.01, 0.01, L / 2), (0, math.atan2(bx - ax, bz - az), 0), mat=K.paper('#f5ead0'), parent=root, segs=4, smooth_it=False)
        if k % 2 == 0:
            fl = K.outline_obj('pennant', [(-0.22, 0), (0.22, 0), (0, -0.42)], 0.02, F(cols[(k // 2) % len(cols)]), bevel=0.006)
            fl.parent = root
            fl.location = ((ax + bx) / 2, -0.02, (az + bz) / 2)
            ph = rng.uniform(0, 6)
            K.anim(lambda t, f, o=fl, ph=ph: setattr(o.rotation_euler, 'x', math.sin(t * 1.6 + ph) * 0.18))
    return root


def p_confetti(x, y, z, rng, ctx):
    root = _root('confetti')
    cols = ['#d9473f', '#f2c94c', '#3f74c9', '#4f9d5d', '#ec8db0', '#ffffff', '#8459b8']
    bits = []
    for k in range(70):
        b = prim('cube', 'confetti', (0, 0, 0), (0.04, 0.005, 0.025), mat=K.paper(cols[k % len(cols)], emit=0.15), parent=root)
        bits.append((b, rng.uniform(-5, 5), rng.uniform(-1.5, 4), rng.uniform(0, 4), rng.uniform(0.3, 0.6), rng.uniform(0, 6)))

    def go(t, f):
        for b, bx, by, bz, sp, ph in bits:
            zz = 4.2 - ((bz + t * sp) % 4.4)
            b.location = (bx + math.sin(t * 1.3 + ph) * 0.3, by, zz)
            b.rotation_euler = (t * 3 + ph, t * 2 + ph, ph)
    K.anim(go)
    return root


def p_books(x, y, z, rng, ctx):
    root = _root('books', x, y, z)
    cols = ['#d9473f', '#3f74c9', '#4f9d5d', '#f2c94c']
    zz = 0
    for k in range(4):
        h = rng.uniform(0.06, 0.09)
        box('book', (rng.uniform(-0.03, 0.03), 0, zz + h / 2), (0.42 - k * 0.04, 0.3, h), F(cols[k]), root, 0.015, rot=(0, 0, rng.uniform(-0.2, 0.2)))
        box('pages', (rng.uniform(-0.02, 0.02), -0.02, zz + h / 2), (0.38 - k * 0.04, 0.28, h * 0.7), K.paper('#fbf5e6'), root, 0.005)
        zz += h
    return root


def book_closed(name='book_held'):
    root = _root(name)
    box('book', (0, -0.02, 0.1), (0.24, 0.05, 0.3), F('#3f74c9'), root, 0.012)
    box('pages', (0.012, -0.02, 0.1), (0.22, 0.04, 0.28), K.paper('#fbf5e6'), root, 0.005)
    st = K.outline_obj('book_star', K.star_pts(0.05, 0.024), 0.01, F('#f2c94c'), bevel=0.003)
    st.parent = root
    st.location = (0, -0.05, 0.12)
    return root


def p_backpack(x, y, z, rng, ctx):
    root = _root('backpack', x, y, z)
    col = rng.choice(['#ee8a33', '#4f9d5d', '#8459b8', '#d9473f'])
    prim('sphere', 'pack', (0, 0, 0.3), (0.26, 0.17, 0.32), mat=F(col), parent=root, segs=16)
    box('pocket', (0, -0.16, 0.2), (0.32, 0.08, 0.2), F(col), root, 0.04)
    prim('torus', 'pack_handle', (0, 0, 0.62), (0.08, 0.08, 0.08), (0, math.pi / 2, 0), mat=F('#3a3346'), parent=root, segs=12, minor=0.2)
    return root


def teddy(scale=1.0, name='teddy'):
    root = _root(name)
    s = scale
    fur = F('#b9844f')
    light = F('#e9cfa8')
    prim('sphere', 'teddy_body', (0, 0, 0.17 * s), (0.15 * s, 0.13 * s, 0.17 * s), mat=fur, parent=root, segs=14)
    prim('sphere', 'teddy_belly', (0, -0.09 * s, 0.15 * s), (0.09 * s, 0.05 * s, 0.1 * s), mat=light, parent=root, segs=12)
    prim('sphere', 'teddy_head', (0, -0.01, 0.4 * s), (0.13 * s, 0.12 * s, 0.12 * s), mat=fur, parent=root, segs=14)
    prim('sphere', 'teddy_snout', (0, -0.11 * s, 0.38 * s), (0.05 * s, 0.035 * s, 0.04 * s), mat=light, parent=root, segs=10)
    prim('sphere', 'teddy_nose', (0, -0.145 * s, 0.395 * s), (0.018 * s, 0.012 * s, 0.014 * s), mat=K.glossy('#2a2226'), parent=root, segs=8)
    for sx in (-1, 1):
        prim('sphere', 'teddy_ear', (sx * 0.1 * s, 0, 0.5 * s), (0.045 * s, 0.03 * s, 0.045 * s), mat=fur, parent=root, segs=10)
        prim('sphere', 'teddy_eye', (sx * 0.045 * s, -0.11 * s, 0.43 * s), (0.016 * s, 0.01 * s, 0.018 * s), mat=K.glossy('#15131c'), parent=root, segs=8)
        prim('sphere', 'teddy_arm', (sx * 0.15 * s, -0.03, 0.2 * s), (0.05 * s, 0.05 * s, 0.09 * s), (0, sx * 0.4, 0), mat=fur, parent=root, segs=10)
        prim('sphere', 'teddy_leg', (sx * 0.08 * s, -0.08 * s, 0.04 * s), (0.06 * s, 0.08 * s, 0.05 * s), mat=fur, parent=root, segs=10)
    prim('sphere', 'teddy_bow', (0, -0.1 * s, 0.29 * s), (0.06 * s, 0.02 * s, 0.03 * s), mat=F('#d9473f'), parent=root, segs=8)
    return root


def p_teddy(x, y, z, rng, ctx):
    r = teddy(1.2)
    r.location = (x, y, z)
    return r


def p_blocks(x, y, z, rng, ctx):
    root = _root('blocks', x, y, z)
    cols = ['#d9473f', '#3f74c9', '#f2c94c', '#4f9d5d', '#ec8db0']
    spots = [(-0.2, 0, 0), (0.05, 0.02, 0), (0.3, -0.03, 0), (-0.08, 0.01, 1), (0.18, 0, 1), (0.05, 0.02, 2)]
    for k, (bx, by, lv) in enumerate(spots):
        box('block', (bx, by, 0.1 + lv * 0.2), (0.2, 0.2, 0.2), F(cols[k % len(cols)]), root, 0.03, rot=(0, 0, rng.uniform(-0.2, 0.2)))
    return root


def balloons(n=3, name='balloons', string=1.0):
    root = _root(name)
    cols = ['#d9473f', '#f2c94c', '#3f74c9', '#ec8db0', '#4f9d5d']
    for k in range(n):
        ang = (k - (n - 1) / 2) * 0.3
        top = (math.sin(ang) * string * 0.6, 0, string + abs(k - 1) * -0.06)
        piv = K.empty('balloon', (0, 0, 0), root)
        piv.rotation_euler.y = ang
        prim('cyl', 'balloon_string', (0, 0, string / 2), (0.006, 0.006, string / 2), mat=K.paper('#f5ead0'), parent=piv, segs=4, smooth_it=False)
        prim('sphere', 'balloon_skin', (0, 0, string + 0.2), (0.17, 0.16, 0.21), mat=F(cols[k % len(cols)], sheen=1.0, fuzz=0.5), parent=piv, segs=16)
        prim('cone', 'balloon_knot', (0, 0, string - 0.0), (1, 1, 0.03), mat=F(cols[k % len(cols)]), parent=piv, segs=8, r1=0.03, r2=0.0)
        K.anim(lambda t, f, o=piv, a=ang, k=k: setattr(o.rotation_euler, 'y', a + math.sin(t * 1.1 + k) * 0.08))
    return root


def p_balloons(x, y, z, rng, ctx):
    root = _root('balloon_weight', x, y, z)
    box('weight', (0, 0, 0.06), (0.14, 0.14, 0.12), F('#f2c94c'), root, 0.03)
    b = balloons(4, string=1.4)
    b.parent = root
    b.location = (0, 0, 0.12)
    return root


def present(scale=1.0, col='#3f74c9', rib='#f2c94c', name='present'):
    root = _root(name)
    s = scale
    box('gift', (0, 0, 0.15 * s), (0.3 * s, 0.3 * s, 0.3 * s), F(col), root, 0.02)
    box('ribbon', (0, 0, 0.15 * s), (0.31 * s, 0.07 * s, 0.31 * s), F(rib), root, 0.01)
    box('ribbon', (0, 0, 0.15 * s), (0.07 * s, 0.31 * s, 0.31 * s), F(rib), root, 0.01)
    for sx in (-1, 1):
        prim('sphere', 'bow', (sx * 0.05 * s, 0, 0.33 * s), (0.06 * s, 0.03 * s, 0.04 * s), (0, sx * 0.5, 0), mat=F(rib), parent=root, segs=10)
    return root


def p_presents(x, y, z, rng, ctx):
    root = _root('presents', x, y, z)
    for k, (dx, dy, sc, c, rb) in enumerate(((-0.25, 0, 1.2, '#3f74c9', '#f2c94c'), (0.18, 0.05, 1.0, '#d9473f', '#ffffff'), (-0.02, -0.15, 0.75, '#4f9d5d', '#ec8db0'))):
        p = present(sc, c, rb)
        p.parent = root
        p.location = (dx, dy, 0)
        p.rotation_euler.z = rng.uniform(-0.4, 0.4)
    return root


def _table(root, w=0.9, d=0.6, h=0.55, col='#b9844f', cloth=None):
    box('table_top', (0, 0, h), (w, d, 0.06), F(col), root, 0.02)
    for sx in (-1, 1):
        for sy in (-1, 1):
            prim('cyl', 'table_leg', (sx * (w / 2 - 0.08), sy * (d / 2 - 0.08), h / 2), (0.035, 0.035, h / 2), mat=F(col), parent=root, segs=8)
    if cloth:
        box('cloth', (0, 0, h + 0.035), (w + 0.04, d + 0.04, 0.02), F(cloth), root, 0.01)
    return h + 0.05


def p_cake(x, y, z, rng, ctx):
    root = _root('cake', x, y, z)
    top = _table(root, 0.8, 0.6, 0.55, cloth='#fdf3f7')
    prim('cyl', 'plate', (0, 0, top + 0.015), (0.32, 0.32, 0.015), mat=F('#ffffff'), parent=root, segs=24)
    prim('cyl', 'cake1', (0, 0, top + 0.13), (0.26, 0.26, 0.11), mat=F('#f4b6c8'), parent=root, segs=28)
    prim('torus', 'icing1', (0, 0, top + 0.24), (0.26, 0.26, 0.26), mat=F('#fdf3f7'), parent=root, segs=28, minor=0.12)
    prim('cyl', 'cake2', (0, 0, top + 0.32), (0.17, 0.17, 0.08), mat=F('#fbe28a'), parent=root, segs=24)
    prim('torus', 'icing2', (0, 0, top + 0.4), (0.17, 0.17, 0.17), mat=F('#fdf3f7'), parent=root, segs=24, minor=0.14)
    for k in range(4):
        a = k * math.pi / 2 + 0.4
        cx, cy = math.cos(a) * 0.09, math.sin(a) * 0.09
        prim('cyl', 'candle', (cx, cy, top + 0.47), (0.012, 0.012, 0.06), mat=F(['#3f74c9', '#4f9d5d', '#d9473f', '#f2c94c'][k]), parent=root, segs=6)
        fl = prim('sphere', 'flame', (cx, cy, top + 0.56), (0.016, 0.016, 0.03), mat=K.glow('#ffb84d', 6.0), parent=root, segs=8)
        K.anim(lambda t, f, o=fl, k=k: setattr(o.scale, 'z', 0.03 * (1 + math.sin(t * 13 + k * 2) * 0.2)))
    for k in range(10):
        a = k * 2 * math.pi / 10
        prim('sphere', 'sprinkle', (math.cos(a) * 0.255, math.sin(a) * 0.255, top + 0.15 + (k % 3) * 0.03), (0.012, 0.006, 0.006), mat=F(['#3f74c9', '#f2c94c', '#4f9d5d'][k % 3]), parent=root, segs=6)
    l = bpy.data.lights.new('candles', 'POINT')
    l.energy = 30 if ctx.get('night') else 6
    l.color = (1, 0.75, 0.45)
    lo = bpy.data.objects.new('candles', l)
    K.link(lo)
    lo.parent = root
    lo.location = (0, -0.3, top + 0.7)
    return root


def p_cookies(x, y, z, rng, ctx):
    root = _root('cookies', x, y, z)
    top = _table(root, 0.7, 0.5, 0.5)
    prim('cyl', 'plate', (0, 0, top + 0.015), (0.28, 0.28, 0.015), mat=F('#ffffff'), parent=root, segs=24)
    for k, (dx, dy, dz) in enumerate(((-0.1, 0, 0), (0.1, 0.03, 0), (0, -0.08, 0.035), (0.0, 0.08, 0.035))):
        prim('cyl', 'cookie', (dx, dy, top + 0.045 + dz), (0.09, 0.09, 0.018), (0.1, 0.05, 0), mat=F('#d9a35a'), parent=root, segs=16)
        for c in range(3):
            prim('sphere', 'chip', (dx + (c - 1) * 0.035, dy - 0.02 + (c % 2) * 0.04, top + 0.065 + dz), (0.014, 0.014, 0.008), mat=F('#5a3a2b'), parent=root, segs=6)
    prim('cyl', 'milk', (0.25, 0.1, top + 0.11), (0.06, 0.06, 0.1), mat=F('#fbfbf6'), parent=root, segs=12)
    return root


def p_fruit(x, y, z, rng, ctx):
    root = _root('fruit', x, y, z)
    top = _table(root, 0.7, 0.5, 0.5)
    prim('sphere', 'bowl', (0, 0, top + 0.06), (0.24, 0.24, 0.1), mat=F('#3f74c9'), parent=root, segs=20)
    for k, (dx, dy, col) in enumerate(((-0.1, 0, '#d33f3f'), (0.08, 0.02, '#ee8a33'), (0, -0.07, '#9bcf5b'), (0.02, 0.1, '#d33f3f'))):
        prim('sphere', 'fruit', (dx, dy, top + 0.17), (0.07, 0.07, 0.065), mat=F(col, sheen=0.5), parent=root, segs=12)
    prim('torus', 'banana', (0.0, 0.0, top + 0.22), (0.13, 0.08, 0.08), (0.3, 0.6, 0.4), mat=F('#f2d24c'), parent=root, segs=14, minor=0.25)
    return root


def ice_cream(name='ice_cream'):
    root = _root(name)
    prim('cone', 'cone', (0, 0, -0.03), (1, 1, 0.1), (math.pi, 0, 0), mat=F('#d9a35a'), parent=root, segs=12, r1=0.06, r2=0.0)
    for k, (col, z) in enumerate((('#f4b6c8', 0.09), ('#fbf3e3', 0.17))):
        prim('sphere', 'scoop', (0, 0, z), (0.07, 0.07, 0.065), mat=F(col), parent=root, segs=12)
    prim('sphere', 'cherry', (0, 0, 0.25), (0.02, 0.02, 0.02), mat=K.glossy('#d33f3f'), parent=root, segs=8)
    return root


def p_ice_cream(x, y, z, rng, ctx):
    root = _root('ice_cream_cart', x, y, z)
    box('cart', (0, 0, 0.5), (1.0, 0.55, 0.55), F('#fbf3e3'), root, 0.05)
    box('cart_stripe', (0, -0.28, 0.6), (1.02, 0.02, 0.12), F('#ec8db0'), root, 0.01)
    for sx in (-1, 1):
        prim('torus', 'cart_wheel', (sx * 0.35, -0.3, 0.2), (0.18, 0.18, 0.18), (math.pi / 2, 0, 0), mat=F('#3a3346'), parent=root, segs=18, minor=0.2)
    prim('cyl', 'cart_pole', (0, 0, 1.2), (0.02, 0.02, 0.5), mat=F('#c9ccd4'), parent=root, segs=6)
    _umbrella(root, (0, 0, 1.7), 0.7, ('#ec8db0', '#ffffff'))
    for k in range(3):
        ic = ice_cream()
        ic.parent = root
        ic.location = ((k - 1) * 0.25, -0.05, 0.85)
    return root


def p_picnic(x, y, z, rng, ctx):
    root = _root('picnic', x, y, z)
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=6, y_segments=4, size=0.5)
    me = bpy.data.meshes.new('blanket')
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new('blanket', me)
    K.link(ob)
    ob.parent = root
    ob.scale = (1.8, 1.3, 1)
    ob.location.z = 0.03
    ob.data.materials.append(F('#d9473f', fuzz=0.6))
    ob.data.materials.append(F('#fbf5e6', fuzz=0.6))
    for i, p in enumerate(ob.data.polygons):
        c = p.center
        p.material_index = (int((c.x + 0.5) * 5.999) + int((c.y + 0.5) * 3.999)) % 2
    m = ob.modifiers.new('felt', 'SOLIDIFY')
    m.thickness = 0.02
    bk = K.empty('basket', (0.45, 0.2, 0), root)
    box('basket_box', (0, 0, 0.13), (0.38, 0.26, 0.22), F('#c79a5b'), bk, 0.03)
    prim('torus', 'basket_handle', (0, 0, 0.25), (0.15, 0.15, 0.15), (math.pi / 2, 0, 0), mat=F('#a27a45'), parent=bk, segs=16, minor=0.1)
    for k, (dx, dy) in enumerate(((-0.4, -0.1), (-0.15, 0.15))):
        a = snack('meadow')
        a.parent = root
        a.location = (dx, dy, 0.08)
    prim('cyl', 'plate', (-0.05, -0.2, 0.05), (0.13, 0.13, 0.012), mat=F('#ffffff'), parent=root, segs=16)
    box('sandwich', (-0.05, -0.2, 0.09), (0.14, 0.1, 0.06), F('#e9cfa8'), root, 0.02)
    return root


def p_bed(x, y, z, rng, ctx):
    b = bed(1.6)
    b.location = (x, y + 0.6, z)
    return b


def flower(scale=1.0, col='#f29aa6', name='flower', stem=0.35):
    root = _root(name)
    s = scale
    prim('cyl', 'stem', (0, 0, stem * s / 2), (0.012 * s, 0.012 * s, stem * s / 2), mat=F('#4f9d5d'), parent=root, segs=6)
    prim('sphere', 'leaf', (0.04 * s, 0, stem * s * 0.4), (0.05 * s, 0.015, 0.025 * s), (0, -0.5, 0), mat=F('#4f9d5d'), parent=root, segs=8)
    head = K.empty('flower_head', (0, 0, stem * s), root)
    head.rotation_euler.x = math.pi / 2 - 0.25
    for k in range(5):
        a = k * 2 * math.pi / 5
        prim('sphere', 'petal', (math.cos(a) * 0.045 * s, math.sin(a) * 0.045 * s, 0), (0.04 * s, 0.04 * s, 0.012 * s), mat=F(col), parent=head, segs=10)
    prim('sphere', 'flower_mid', (0, 0, 0.012 * s), (0.028 * s, 0.028 * s, 0.015 * s), mat=F('#f2c94c'), parent=head, segs=8)
    return root


def p_flowers(x, y, z, rng, ctx):
    root = _root('flowers', x, y, z)
    cols = ['#f29aa6', '#fbe28a', '#ffffff', '#b8a4f0', '#ee8a33']
    for k in range(7):
        fl = flower(rng.uniform(1.1, 1.6), cols[k % len(cols)], stem=rng.uniform(0.25, 0.4))
        fl.parent = root
        fl.location = (rng.uniform(-0.6, 0.6), rng.uniform(-0.25, 0.3), 0)
        fl.rotation_euler.z = rng.uniform(-0.4, 0.4)
    return root


def butterfly(col, name='butterfly'):
    root = _root(name)
    prim('sphere', 'bfly_body', (0, 0, 0), (0.015, 0.015, 0.05), mat=F('#3a3346'), parent=root, segs=8)
    wings = []
    for sx in (-1, 1):
        w = K.empty('bfly_wing', (0, 0, 0), root)
        wing = K.outline_obj('bfly_w', [(0, 0.03), (sx * 0.09, 0.08), (sx * 0.1, 0.0), (sx * 0.07, -0.06), (0, -0.03)], 0.006, F(col, emit=0.1), bevel=0.003)
        wing.parent = w
        wings.append((w, sx))
    return root, wings


def p_butterflies(x, y, z, rng, ctx):
    root = _root('butterflies')
    cols = ['#f2c94c', '#ec8db0', '#7fb2e5', '#ee8a33', '#b8a4f0']
    for k in range(5):
        b, wings = butterfly(cols[k])
        b.parent = root
        bx, by, bz, ph = rng.uniform(-5, 5), rng.uniform(-0.5, 3), rng.uniform(0.6, 2.4), rng.uniform(0, 6)

        def go(t, f, b=b, wings=wings, bx=bx, by=by, bz=bz, ph=ph):
            b.location = (bx + math.sin(t * 0.5 + ph) * 1.2, by + math.cos(t * 0.4 + ph) * 0.4, bz + math.sin(t * 1.7 + ph) * 0.25)
            for w, sx in wings:
                w.rotation_euler.z = sx * (0.2 + abs(math.sin(t * 12 + ph)) * 1.1)
        K.anim(go)
    return root


def kite(scale=1.0, col='#d9473f', name='kite'):
    root = _root(name)
    s = scale
    k = K.outline_obj('kite_sail', [(0, 0.45 * s), (0.3 * s, 0.05 * s), (0, -0.45 * s), (-0.3 * s, 0.05 * s)], 0.02, F(col), bevel=0.006)
    k.parent = root
    for half in (1,):
        k2 = K.outline_obj('kite_half', [(0, 0.45 * s), (0.3 * s, 0.05 * s), (0, -0.45 * s)], 0.022, F('#f2c94c'), bevel=0.006)
        k2.parent = root
        k2.location.y = -0.005
    for k3 in range(4):
        bow = prim('sphere', 'kite_bow', (math.sin(k3 * 1.3) * 0.08 * s, -0.01, -0.55 * s - k3 * 0.18 * s), (0.05 * s, 0.01, 0.03 * s), mat=F(['#3f74c9', '#4f9d5d', '#ec8db0', '#f2c94c'][k3]), parent=root, segs=8)
    prim('cyl', 'kite_tail', (0, 0, -0.75 * s), (0.005, 0.005, 0.3 * s), mat=K.paper('#f5ead0'), parent=root, segs=4, smooth_it=False)
    return root


def p_kite(x, y, z, rng, ctx):
    root = _root('kite_fly', x, y + 1.5, 0)
    kt = kite(1.3)
    kt.parent = root
    kt.location = (0.8, 0, 3.6)
    L = math.hypot(0.8, 3.6)
    prim('cyl', 'kite_string', (0.4, 0, 1.8), (0.006, 0.006, L / 2), (0, math.atan2(0.8, 3.6), 0), mat=K.paper('#f5ead0'), parent=root, segs=4, smooth_it=False)
    K.anim(lambda t, f, o=kt: (setattr(o.rotation_euler, 'y', math.sin(t * 1.3) * 0.18), setattr(o.location, 'z', 3.6 + math.sin(t * 0.9) * 0.12)))
    return root


def p_bike(x, y, z, rng, ctx):
    b = bike(0.9, color=rng.choice(['#d9473f', '#3f74c9', '#2f9c9a', '#8459b8']))
    b.location = (x, y, z)
    b.rotation_euler.z = 0.3
    return b


def _wheel(parent, loc, r, col='#2b2b33'):
    w = prim('cyl', 'wheel', loc, (r, r, 0.08), (math.pi / 2, 0, 0), mat=F(col), parent=parent, segs=20)
    prim('cyl', 'hubcap', (loc[0], loc[1] - 0.085, loc[2]), (r * 0.45, r * 0.45, 0.01), (math.pi / 2, 0, 0), mat=F('#c9ccd4'), parent=parent, segs=14)
    return w


def p_car(x, y, z, rng, ctx):
    root = _root('car', x, y, z)
    col = rng.choice(['#d9473f', '#3f74c9', '#f2c94c', '#2f9c9a'])
    box('car_body', (0, 0, 0.45), (2.0, 0.95, 0.5), F(col), root, 0.15)
    box('car_cabin', (-0.1, 0, 0.85), (1.15, 0.85, 0.45), F(col), root, 0.15)
    win = K.glow('#ffd98a', 2.0) if ctx.get('night') else K.paper('#cfe6f5', emit=0.2)
    for sx in (-1, 1):
        box('car_window', (-0.1 + sx * 0.28, -0.43, 0.87), (0.45, 0.02, 0.3), win, root, 0.03)
    for sx in (-1, 1):
        _wheel(root, (sx * 0.62, -0.42, 0.22), 0.22)
    prim('sphere', 'headlight', (1.0, -0.3, 0.5), (0.03, 0.08, 0.06), mat=K.glow('#fff1c2', 3.0 if ctx.get('night') else 1.0), parent=root, segs=8)
    return root


def p_bus(x, y, z, rng, ctx):
    root = _root('bus', x, y, z)
    box('bus_body', (0, 0, 0.85), (3.6, 1.1, 1.3), F('#f2c94c'), root, 0.18)
    box('bus_stripe', (0, -0.56, 0.55), (3.62, 0.02, 0.1), F('#2b2b33'), root, 0.01)
    win = K.glow('#ffd98a', 2.0) if ctx.get('night') else K.paper('#cfe6f5', emit=0.2)
    for k in range(5):
        box('bus_window', (-1.35 + k * 0.62, -0.56, 1.15), (0.48, 0.02, 0.4), win, root, 0.04)
    for sx in (-1, 1):
        _wheel(root, (sx * 1.15, -0.5, 0.25), 0.26)
    return root


def p_tent(x, y, z, rng, ctx):
    root = _root('tent', x, y, z)
    t = K.outline_obj('tent_body', [(-1.0, 0), (1.0, 0), (0, 1.3)], 1.6, F('#ee8a33'), bevel=0.05)
    t.parent = root
    t.location.y = -0.8
    door = K.outline_obj('tent_door', [(-0.38, 0), (0.38, 0), (0, 0.9)], 0.02, K.glow('#ffcf70', 2.5) if ctx.get('night') else F('#9a4f1f'), bevel=0.01)
    door.parent = root
    door.location = (0, -0.83, 0.0)
    prim('cyl', 'tent_pole', (0, -0.82, 1.4), (0.025, 0.025, 0.15), mat=F('#6b4532'), parent=root, segs=6)
    return root


def p_campfire(x, y, z, rng, ctx):
    root = _root('campfire', x, y, z)
    for k in range(8):
        a = k * 2 * math.pi / 8
        prim('sphere', 'fire_stone', (math.cos(a) * 0.32, math.sin(a) * 0.32, 0.05), (0.09, 0.08, 0.06), mat=F('#7b7f99'), parent=root, segs=10)
    for k in range(3):
        prim('cyl', 'log', (0, 0, 0.08), (0.05, 0.05, 0.28), (math.pi / 2, 0, k * math.pi / 3), mat=F('#7a5236'), parent=root, segs=10)
    flames = []
    for k, (col, s, dx) in enumerate((('#ff8a3d', 1.0, 0), ('#ffb84d', 0.7, 0.05), ('#fff1a8', 0.45, -0.02))):
        fl = prim('cone', 'flame', (dx, -0.02 * k, 0.12 + 0.18 * s), (1, 1, 0.22 * s), mat=K.glow(col, 4.0 + k), parent=root, segs=10, r1=0.14 * s, r2=0.0)
        flames.append((fl, s, k))
    K.anim(lambda t, f: [setattr(fl.scale, 'z', 0.22 * s * (1 + math.sin(t * 9 + k * 2.1) * 0.15)) for fl, s, k in flames])
    l = bpy.data.lights.new('fire', 'POINT')
    l.energy = 140 if ctx.get('night') else 30
    l.color = (1, 0.6, 0.3)
    lo = bpy.data.objects.new('fire', l)
    K.link(lo)
    lo.parent = root
    lo.location = (0, -0.4, 0.5)
    K.anim(lambda t, f: setattr(l, 'energy', (140 if ctx.get('night') else 30) * (1 + math.sin(t * 11) * 0.08)))
    return root


def p_snowman(x, y, z, rng, ctx):
    root = _root('snowman', x, y, z)
    snow = F('#f8fbff', sheen=0.6)
    for k, (r, zz) in enumerate(((0.36, 0.3), (0.27, 0.82), (0.2, 1.22))):
        prim('sphere', 'snowball', (0, 0, zz), (r, r, r * 0.95), mat=snow, parent=root, segs=18)
    prim('cone', 'carrot', (0, -0.24, 1.22), (1, 1, 0.1), (math.pi / 2, 0, 0), mat=F('#ee8a33'), parent=root, segs=10, r1=0.035, r2=0.0)
    for sx in (-1, 1):
        prim('sphere', 'coal', (sx * 0.07, -0.18, 1.3), (0.025, 0.02, 0.025), mat=K.glossy('#2a2226'), parent=root, segs=8)
        prim('cyl', 'twig_arm', (sx * 0.4, 0, 0.92), (0.015, 0.015, 0.22), (0, sx * 1.0, 0), mat=F('#6b4532'), parent=root, segs=6)
    for k in range(3):
        prim('sphere', 'coal', (0, -0.27, 0.95 - k * 0.12), (0.025, 0.02, 0.025), mat=K.glossy('#2a2226'), parent=root, segs=8)
    prim('torus', 'snow_scarf', (0, 0, 1.03), (0.2, 0.2, 0.2), mat=F('#d9473f'), parent=root, segs=18, minor=0.25)
    prim('cyl', 'snow_hat_brim', (0, 0, 1.4), (0.2, 0.2, 0.02), mat=F('#2d2a33'), parent=root, segs=16)
    prim('cyl', 'snow_hat', (0, 0, 1.52), (0.13, 0.13, 0.12), mat=F('#2d2a33'), parent=root, segs=16)
    return root


def p_sandcastle(x, y, z, rng, ctx):
    root = _root('sandcastle', x, y, z)
    sand = F('#e3c48c', fuzz=1.3)
    box('castle_base', (0, 0, 0.18), (0.9, 0.5, 0.36), sand, root, 0.05)
    for sx in (-1, 1):
        prim('cyl', 'castle_tower', (sx * 0.38, 0, 0.35), (0.14, 0.14, 0.35), mat=sand, parent=root, segs=14)
        for k in range(5):
            a = k * 2 * math.pi / 5
            box('crenel', (sx * 0.38 + math.cos(a) * 0.11, math.sin(a) * 0.11, 0.74), (0.06, 0.06, 0.07), sand, root, 0.01)
    prim('cyl', 'flagpole', (0.38, 0, 0.92), (0.008, 0.008, 0.16), mat=F('#6b4532'), parent=root, segs=4)
    fl = K.outline_obj('castle_flag', [(0, 0), (0.15, -0.05), (0, -0.1)], 0.01, F('#d9473f'), bevel=0.003)
    fl.parent = root
    fl.location = (0.39, 0, 1.08)
    prim('cyl', 'bucket', (-0.6, -0.2, 0.1), (0.1, 0.1, 0.1), mat=F('#3f74c9'), parent=root, segs=12)
    return root


def _umbrella(parent, loc, r, cols):
    can = prim('cone', 'umbrella', loc, (1, 1, r * 0.35), mat=F(cols[0]), parent=parent, segs=16, r1=r, r2=0.02)
    if len(cols) > 1:
        _multi(can, [F(c) for c in cols], lambda c: int((math.atan2(c.y, c.x) + math.pi) / (2 * math.pi / 8)) % len(cols))
    return can


def umbrella_held(name='umbrella'):
    root = _root(name)
    prim('cyl', 'umbrella_pole', (0, 0, 0.35), (0.012, 0.012, 0.4), mat=F('#3a3346'), parent=root, segs=6)
    _umbrella(root, (0, 0, 0.8), 0.45, ('#3f74c9', '#f2c94c'))
    return root


def p_umbrella(x, y, z, rng, ctx):
    root = _root('beach_umbrella', x, y, z)
    prim('cyl', 'umbrella_pole', (0, 0, 0.9), (0.025, 0.025, 0.9), (0.12, 0, 0), mat=F('#f4f1ea'), parent=root, segs=8)
    can = _umbrella(root, (0, 0.2, 1.85), 1.0, ('#d9473f', '#ffffff'))
    can.rotation_euler.x = 0.12
    return root


def p_sun(x, y, z, rng, ctx):
    root = _root('sun', -7.0, 19.0, 7.2)
    prim('cyl', 'sun_disc', (0, 0, 0), (1.3, 1.3, 0.12), (math.pi / 2, 0, 0), mat=F('#ffd25e', emit=1.4, emit_color='#ffcf4d'), parent=root, segs=40)
    rays = K.empty('sun_rays', (0, 0.05, 0), root)
    for k in range(12):
        a = k * 2 * math.pi / 12
        ray = K.outline_obj('sun_ray', [(-0.22, 0), (0.22, 0), (0, 0.55)], 0.08, F('#ffb84d', emit=1.0, emit_color='#ffb84d'), bevel=0.02)
        ray.parent = rays
        ray.location = (math.cos(a) * 1.4, 0.05, math.sin(a) * 1.4)
        ray.rotation_euler.y = -(a - math.pi / 2)
    for sx in (-1, 1):
        prim('sphere', 'sun_eye', (sx * 0.4, -0.15, 0.2), (0.09, 0.04, 0.12), mat=K.glossy('#5a3a2b'), parent=root, segs=10)
        prim('sphere', 'sun_cheek', (sx * 0.65, -0.14, -0.15), (0.16, 0.04, 0.11), mat=F('#f79a6b', emit=0.6, emit_color='#f79a6b'), parent=root, segs=10)
    sm = K.outline_obj('sun_smile', [(-0.4, 0), (-0.2, -0.22), (0.2, -0.22), (0.4, 0), (0.2, -0.13), (-0.2, -0.13)], 0.04, F('#5a3a2b'), bevel=0.01)
    sm.parent = root
    sm.location = (0, -0.16, -0.18)
    K.anim(lambda t, f: setattr(rays.rotation_euler, 'y', t * 0.12))
    return root


def p_rainbow(x, y, z, rng, ctx):
    root = _root('rainbow', 2.0, 16.0, -0.5)
    cols = ['#e5484d', '#ee8a33', '#f2c94c', '#4f9d5d', '#3f74c9', '#8459b8']
    for k, col in enumerate(cols):
        r0, r1 = 7.0 - k * 0.55, 7.0 - (k + 1) * 0.55
        pts = [(math.cos(math.pi * i / 40) * r0, math.sin(math.pi * i / 40) * r0) for i in range(41)]
        pts += [(math.cos(math.pi * i / 40) * r1, math.sin(math.pi * i / 40) * r1) for i in range(40, -1, -1)]
        band = K.outline_obj('rainbow_band', pts, 0.12, F(col, emit=0.5, emit_color=col), bevel=0.02)
        band.parent = root
        band.location.y = k * 0.02
    return root


def _drops(name, n, rng, w, h, depth, mk, mat):
    """A sheet of falling things as one mesh (cheap): mk(x, z) -> (verts, faces) of one drop."""
    verts, faces = [], []
    for _ in range(n):
        x, z, y = rng.uniform(-w / 2, w / 2), rng.uniform(0, h), rng.uniform(-depth / 2, depth / 2)
        vs, fs = mk(x, y, z)
        b = len(verts)
        verts += vs
        faces += [tuple(i + b for i in f) for f in fs]
    return K.mesh_obj(name, verts, faces, mat)


def _weather(name, rng, mk, mat, speed, wobble=0.0, n=140):
    """Two sheets of drops, each with a copy stacked on top, falling and wrapping seamlessly."""
    root = _root(name)
    H = 6.0
    sheets = []
    for k in range(2):
        ob = _drops(f'{name}{k}', n // 2, rng, 14, H, 6, mk, mat)
        ob.parent = root
        twin = bpy.data.objects.new(f'{name}{k}b', ob.data)
        K.link(twin)
        twin.parent = root
        sheets.append((ob, twin, k))

    def go(t, f):
        for ob, twin, k in sheets:
            off = (t * speed * (1 + k * 0.15) + k * H / 2) % H
            x = math.sin(t * 0.7 + k * 2) * wobble
            ob.location = (x, 0.5 + k * 1.5, -0.5 - off)
            twin.location = (x, 0.5 + k * 1.5, -0.5 - off + H)
    K.anim(go)
    return root


def p_rain(x, y, z, rng, ctx):
    def mk(x, y, z):
        return [(x - 0.012, y, z), (x + 0.012, y, z), (x, y, z + 0.22)], [(0, 1, 2)]
    return _weather('rain', rng, mk, K.paper('#a9d4f2', emit=0.6), 6.0)


def p_snow(x, y, z, rng, ctx):
    def mk(x, y, z):
        r = rng.choice([0.03, 0.04, 0.05])
        vs = [(x, y, z)] + [(x + math.cos(a) * r, y, z + math.sin(a) * r) for a in [k * math.pi / 3 for k in range(6)]]
        return vs, [(0, 1 + k, 1 + (k + 1) % 6) for k in range(6)]
    return _weather('snowfall', rng, mk, K.paper('#ffffff', emit=0.7), 0.8, wobble=0.3)


def p_star(x, y, z, rng, ctx):
    s = K.hanging_star('bigstar', 1.6, 3.9, 5.0, 0.6, 22, rng)
    l = bpy.data.lights.new('bigstar', 'POINT')
    l.energy = 120
    l.color = (1, 0.85, 0.5)
    lo = bpy.data.objects.new('bigstar', l)
    K.link(lo)
    lo.location = (1.6, 4.0, 3.9)
    return s


def p_rocket(x, y, z, rng, ctx):
    root = _root('rocket', x, y, z)
    prim('cyl', 'rocket_body', (0, 0, 1.3), (0.42, 0.42, 0.9), mat=F('#f4f1ea'), parent=root, segs=24)
    prim('cone', 'rocket_nose', (0, 0, 2.55), (1, 1, 0.35), mat=F('#d9473f'), parent=root, segs=24, r1=0.42, r2=0.02)
    prim('cyl', 'rocket_band', (0, 0, 0.55), (0.43, 0.43, 0.08), mat=F('#d9473f'), parent=root, segs=24)
    prim('cyl', 'porthole', (0, -0.41, 1.75), (0.16, 0.16, 0.03), (math.pi / 2, 0, 0), mat=K.glow('#9fd8ff', 1.5), parent=root, segs=20)
    prim('torus', 'porthole_rim', (0, -0.42, 1.75), (0.17, 0.17, 0.17), (math.pi / 2, 0, 0), mat=F('#3f74c9'), parent=root, segs=20, minor=0.15)
    for k in range(3):
        a = k * 2 * math.pi / 3 + math.pi / 2
        fin = K.outline_obj('rocket_fin', [(0, 0), (0.45, 0), (0, 0.7)], 0.06, F('#3f74c9'), bevel=0.02)
        fin.parent = root
        fin.location = (math.cos(a) * 0.38, math.sin(a) * 0.38, 0.4)
        fin.rotation_euler.z = a
    for k in range(3):
        fl = prim('cone', 'rocket_flame', (0, 0, 0.28 - k * 0.05), (1, 1, 0.25), (math.pi, 0, 0), mat=K.glow(['#ffb84d', '#ff8a3d', '#fff1a8'][k], 4.0), parent=root, segs=10, r1=0.25 - k * 0.06, r2=0.0)
        K.anim(lambda t, f, o=fl, k=k: setattr(o.scale, 'z', 0.25 * (1 + math.sin(t * 15 + k) * 0.25)))
    return root


def p_plane(x, y, z, rng, ctx):
    root = _root('plane', -9, 13, 6.0)
    body = F('#f4f1ea')
    prim('sphere', 'plane_body', (0, 0, 0), (1.3, 0.3, 0.32), mat=body, parent=root, segs=20)
    wing = K.outline_obj('plane_wing', [(-0.3, 0), (0.4, 0), (0.0, 0.05), (-0.5, 0.05)], 1.8, F('#3f74c9'), bevel=0.02)
    wing.parent = root
    wing.location = (0, -0.9, -0.05)
    tail = K.outline_obj('plane_tail', [(-1.3, 0), (-0.9, 0), (-1.3, 0.5)], 0.05, F('#d9473f'), bevel=0.01)
    tail.parent = root
    for k in range(4):
        prim('sphere', 'plane_window', (0.6 - k * 0.3, -0.27, 0.08), (0.06, 0.03, 0.06), mat=K.glow('#ffd98a', 1.5) if ctx.get('night') else F('#7fb2e5'), parent=root, segs=8)
    K.anim(lambda t, f: setattr(root.location, 'x', -9 + t * 0.9))
    return root


def p_hot_air_balloon(x, y, z, rng, ctx):
    root = _root('hot_air_balloon', 5.5, 12.0, 4.5)
    env = prim('sphere', 'envelope', (0, 0, 1.2), (1.1, 1.1, 1.3), mat=F('#d9473f'), parent=root, segs=24)
    _multi(env, [F(c) for c in ('#d9473f', '#f2c94c', '#3f74c9', '#f2c94c')], lambda c: int((math.atan2(c.y, c.x) + math.pi) / (2 * math.pi / 12)) % 4)
    box('basket', (0, 0, -0.35), (0.6, 0.6, 0.45), F('#c79a5b'), root, 0.05)
    for sx in (-1, 1):
        for sy in (-1, 1):
            prim('cyl', 'rope', (sx * 0.27, sy * 0.27, 0.0), (0.01, 0.01, 0.3), mat=F('#6b4532'), parent=root, segs=4)
    _bob(root, 0.15, 0.6)
    return root


def p_tractor(x, y, z, rng, ctx):
    root = _root('tractor', x, y, z)
    red = F('#d9473f')
    box('tractor_body', (0.3, 0, 0.6), (1.2, 0.7, 0.55), red, root, 0.1)
    box('tractor_cab', (-0.35, 0, 1.05), (0.7, 0.75, 0.8), red, root, 0.08)
    box('tractor_roof', (-0.35, 0, 1.5), (0.85, 0.85, 0.08), F('#f4f1ea'), root, 0.03)
    box('tractor_win', (-0.35, -0.38, 1.1), (0.5, 0.02, 0.45), K.glow('#ffd98a', 2.0) if ctx.get('night') else K.paper('#cfe6f5', emit=0.2), root, 0.03)
    prim('cyl', 'exhaust', (0.6, 0, 1.05), (0.04, 0.04, 0.25), mat=F('#3a3346'), parent=root, segs=8)
    _wheel(root, (-0.4, -0.4, 0.45), 0.45)
    _wheel(root, (0.65, -0.4, 0.25), 0.25)
    return root


def guitar(scale=1.0, name='guitar'):
    root = _root(name)
    s = scale
    wood = F('#d9873a')
    prim('sphere', 'guitar_low', (0, 0, 0.15 * s), (0.2 * s, 0.07 * s, 0.18 * s), mat=wood, parent=root, segs=16)
    prim('sphere', 'guitar_up', (0, 0, 0.36 * s), (0.15 * s, 0.065 * s, 0.13 * s), mat=wood, parent=root, segs=16)
    prim('cyl', 'guitar_hole', (0, -0.065 * s, 0.24 * s), (0.05 * s, 0.05 * s, 0.01), (math.pi / 2, 0, 0), mat=F('#3a2620'), parent=root, segs=14)
    box('guitar_neck', (0, -0.02 * s, 0.62 * s), (0.06 * s, 0.03 * s, 0.4 * s), F('#6b4532'), root, 0.01)
    box('guitar_head', (0, -0.02 * s, 0.86 * s), (0.09 * s, 0.03 * s, 0.1 * s), F('#3a2620'), root, 0.01)
    return root


def p_guitar(x, y, z, rng, ctx):
    g = guitar(1.6)
    g.location = (x, y, z)
    g.rotation_euler = (0.25, 0.2, 0.2)
    return g


def p_drum(x, y, z, rng, ctx):
    root = _root('drum', x, y, z)
    prim('cyl', 'drum_body', (0, 0, 0.28), (0.32, 0.32, 0.22), mat=F('#d9473f'), parent=root, segs=24)
    prim('cyl', 'drum_skin', (0, 0, 0.5), (0.31, 0.31, 0.01), mat=F('#fbf5e6'), parent=root, segs=24)
    for zz in (0.08, 0.49):
        prim('torus', 'drum_rim', (0, 0, zz), (0.33, 0.33, 0.33), mat=F(GOLD), parent=root, segs=24, minor=0.06)
    for k in range(6):
        a = k * math.pi / 3
        prim('cyl', 'drum_cord', (math.cos(a) * 0.32, math.sin(a) * 0.32, 0.28), (0.008, 0.008, 0.21), (0, 0, 0), mat=F('#f4f1ea'), parent=root, segs=4)
    for sx in (-1, 1):
        prim('cyl', 'drumstick', (sx * 0.12, -0.05, 0.56), (0.012, 0.012, 0.2), (0, math.pi / 2 - 0.3, sx * 0.3), mat=F('#e9cfa8'), parent=root, segs=6)
    return root


def p_piano(x, y, z, rng, ctx):
    root = _root('piano', x, y, z)
    box('piano_body', (0, 0.15, 0.7), (1.5, 0.6, 1.4), F('#3a2a36'), root, 0.06)
    box('piano_keys', (0, -0.28, 0.75), (1.35, 0.32, 0.06), F('#fbfbf6'), root, 0.01)
    for k in range(9):
        if k % 7 in (2, 6):
            continue
        box('piano_black', (-0.6 + k * 0.15 + 0.075, -0.33, 0.8), (0.06, 0.18, 0.04), F('#1c1a20'), root, 0.005)
    box('piano_ledge', (0, -0.15, 1.05), (1.4, 0.15, 0.04), F('#3a2a36'), root, 0.01)
    box('music', (0, -0.12, 1.2), (0.4, 0.02, 0.28), K.paper('#fbf5e6'), root, 0.0, rot=(-0.2, 0, 0))
    box('piano_stool', (0, -0.8, 0.25), (0.6, 0.35, 0.08), F('#3a2a36'), root, 0.02)
    for sx in (-1, 1):
        prim('cyl', 'stool_leg', (sx * 0.22, -0.8, 0.12), (0.03, 0.03, 0.12), mat=F('#3a2a36'), parent=root, segs=6)
    return root


def p_treasure_chest(x, y, z, rng, ctx):
    root = _root('treasure_chest', x, y, z)
    wood = F('#9a6435')
    gold = F(GOLD, sheen=0.5)
    box('chest', (0, 0, 0.22), (0.8, 0.5, 0.44), wood, root, 0.04)
    for sx in (-1, 0, 1):
        box('chest_band', (sx * 0.3, 0, 0.22), (0.06, 0.52, 0.46), gold, root, 0.01)
    lid = K.empty('chest_lid', (0, 0.25, 0.44), root)
    lid.rotation_euler.x = -1.1
    prim('cyl', 'lid', (0, -0.25, 0), (0.25, 0.25, 0.4), (0, math.pi / 2, 0), mat=wood, parent=lid, segs=16)
    for k in range(9):
        prim('cyl', 'coin', (rng.uniform(-0.3, 0.3), rng.uniform(-0.15, 0.15), 0.45 + rng.uniform(0, 0.08)), (0.05, 0.05, 0.01), (rng.uniform(-0.5, 0.5), rng.uniform(-0.5, 0.5), 0), mat=K.glow('#ffd25e', 1.5), parent=root, segs=12)
    for k, c in enumerate(('#e2557a', '#66c792', '#4fa8f0')):
        prim('sphere', 'gem', (-0.2 + k * 0.2, -0.05, 0.5), (0.04, 0.04, 0.04), mat=K.glossy(c, 0.1), parent=root, segs=8)
    return root


def wand(name='wand'):
    root = _root(name)
    prim('cyl', 'wand_stick', (0, 0, 0.12), (0.012, 0.012, 0.16), mat=F('#3a3346'), parent=root, segs=6)
    st = K.outline_obj('wand_star', K.star_pts(0.07, 0.032), 0.02, F('#ffd75e', emit=2.0, emit_color='#ffcf4d'), bevel=0.005)
    st.parent = root
    st.location = (0, -0.01, 0.31)
    K.anim(lambda t, f: setattr(st.rotation_euler, 'y', math.sin(t * 3) * 0.3))
    return root


def p_wand(x, y, z, rng, ctx):
    root = _root('wand_cushion', x, y, z)
    prim('sphere', 'cushion', (0, 0, 0.1), (0.28, 0.2, 0.1), mat=F('#8459b8'), parent=root, segs=14)
    w = wand()
    w.parent = root
    w.location = (0, 0, 0.2)
    w.rotation_euler.y = 1.3
    return root


def p_telescope(x, y, z, rng, ctx):
    root = _root('telescope', x, y, z)
    for k in range(3):
        a = k * 2 * math.pi / 3
        prim('cyl', 'tripod', (math.cos(a) * 0.15, math.sin(a) * 0.15, 0.4), (0.018, 0.018, 0.42), (math.sin(a) * 0.35, -math.cos(a) * 0.35, 0), mat=F('#6b4532'), parent=root, segs=6)
    prim('cyl', 'scope', (0.1, 0, 0.95), (0.08, 0.08, 0.45), (0, 1.0, 0), mat=F('#3f74c9'), parent=root, segs=14)
    prim('cyl', 'scope_end', (0.42, 0, 1.17), (0.1, 0.1, 0.05), (0, 1.0, 0), mat=F(GOLD), parent=root, segs=14)
    return root


def p_flower(x, y, z, rng, ctx):
    fl = flower(3.0, '#f29aa6', stem=0.4)
    fl.location = (x, y, z)
    return fl


PROPS = {
    'boat': ('sea', p_boat), 'lantern': ('ground', p_lantern), 'fireflies': ('air', p_fireflies),
    'soccer_ball': ('ground', p_ball('soccer_ball')), 'basketball': ('ground', p_ball('basketball')),
    'baseball': ('ground', p_ball('baseball')), 'beach_ball': ('ground', p_ball('beach_ball')),
    'baseball_bat': ('ground', None), 'trophy': ('ground', p_trophy), 'medal': ('ground', p_medal),
    'scoreboard': ('back', p_scoreboard), 'flags': ('top', p_flags), 'confetti': ('air', p_confetti),
    'books': ('ground', p_books), 'backpack': ('ground', p_backpack), 'teddy': ('ground', p_teddy),
    'blocks': ('ground', p_blocks), 'balloons': ('ground', p_balloons), 'presents': ('ground', p_presents),
    'cake': ('ground', p_cake), 'cookies': ('ground', p_cookies), 'fruit': ('ground', p_fruit),
    'ice_cream': ('ground', p_ice_cream), 'picnic': ('ground', p_picnic), 'bed': ('back', p_bed),
    'flowers': ('ground', p_flowers), 'flower': ('ground', p_flower), 'butterflies': ('air', p_butterflies),
    'kite': ('ground', p_kite), 'bike': ('ground', p_bike), 'car': ('back', p_car), 'bus': ('back', p_bus),
    'tent': ('back', p_tent), 'campfire': ('ground', p_campfire), 'snowman': ('ground', p_snowman),
    'sandcastle': ('ground', p_sandcastle), 'umbrella': ('ground', p_umbrella), 'sun': ('sky', p_sun),
    'rainbow': ('sky', p_rainbow), 'rain': ('weather', p_rain), 'snow': ('weather', p_snow), 'star': ('sky', p_star),
    'rocket': ('back', p_rocket), 'plane': ('sky', p_plane), 'hot_air_balloon': ('sky', p_hot_air_balloon),
    'tractor': ('back', p_tractor), 'guitar': ('ground', p_guitar), 'drum': ('ground', p_drum),
    'piano': ('back', p_piano), 'treasure_chest': ('ground', p_treasure_chest), 'wand': ('ground', p_wand),
    'telescope': ('ground', p_telescope),
}


def baseball_bat(name='baseball_bat'):
    root = _root(name)
    prim('cone', 'bat', (0, 0, 0.3), (1, 1, 0.3), mat=F('#c99a5b'), parent=root, segs=12, r1=0.025, r2=0.055)
    prim('sphere', 'bat_end', (0, 0, 0.6), (0.055, 0.055, 0.03), mat=F('#c99a5b'), parent=root, segs=10)
    prim('cyl', 'bat_grip', (0, 0, 0.05), (0.028, 0.028, 0.06), mat=F('#3a3346'), parent=root, segs=8)
    return root


def p_baseball_bat(x, y, z, rng, ctx):
    b = baseball_bat()
    b.location = (x, y, z + 0.06)
    b.rotation_euler = (0, 1.45, 0.3)
    return b


PROPS['baseball_bat'] = ('ground', p_baseball_bat)


def _held(fn, loc=(0, 0, 0), rot=(0, 0, 0)):
    def make():
        ob = fn()
        ob.location = loc
        ob.rotation_euler = rot
        return ob
    return make


# what a character can carry; each is built at the hand (the origin) and parented to it by the stage
HOLD = {
    'soccer_ball': _held(lambda: soccer_ball(0.13), (0, -0.1, -0.05)),
    'basketball': _held(lambda: basketball(0.15), (0, -0.12, -0.05)),
    'baseball': _held(lambda: baseball(0.08), (0, -0.06, 0)),
    'beach_ball': _held(lambda: beach_ball(0.2), (0, -0.16, 0)),
    'baseball_bat': _held(baseball_bat, (0, -0.04, -0.05), (0.3, 0, 0)),
    'trophy': _held(lambda: trophy(0.6), (0, -0.08, -0.08)),
    'medal': _held(lambda: medal(1.0), (0, -0.05, -0.05)),
    'books': _held(book_closed, (0, -0.03, -0.12)),
    'teddy': _held(lambda: teddy(0.8), (0, -0.08, -0.15)),
    'balloons': _held(lambda: balloons(3, string=0.9), (0, -0.02, 0)),
    'presents': _held(lambda: present(0.7), (0, -0.12, -0.12)),
    'ice_cream': _held(ice_cream, (0, -0.04, 0.02)),
    'flower': _held(lambda: flower(1.2, '#f29aa6', stem=0.25), (0, -0.04, -0.05)),
    'kite': _held(lambda: kite(0.6), (0.2, 0.1, 1.2)),
    'umbrella': _held(umbrella_held, (0, -0.02, -0.15)),
    'wand': _held(wand, (0, -0.03, -0.05)),
    'guitar': _held(lambda: guitar(0.9), (-0.1, -0.12, -0.25), (0, -0.9, 0)),
    'lantern': _held(lambda: K.lantern(0, 0, 0), (0, -0.04, -0.42)),
    'cookies': _held(lambda: snack('bakery'), (0, -0.05, 0)),
}
