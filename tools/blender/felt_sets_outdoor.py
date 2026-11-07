"""Outdoor sets for the Story Builder kit (felt_sets.py imports these into SETS): parks, sports grounds, the beach,
the city, far-away and make-believe places. Each builds for any time of day (day / dusk / dawn / night) with the
shared sky (felt_sets.sky_layers) and colours picked per time with felt_sets.day_night.
"""
import math

import feltkit as K
import felt_props as P
import felt_sets as S

F = K.felt
prim = K.prim
box = P.box
dn = S.day_night


def _ground(tod, day, night, dusk=None, depth=14.0, rng=None, tufts=None):
    col = dn(tod, day, night, dusk)
    g = K.ground(-7.0, 0.0, 60, depth, col, None)
    if rng is not None and tufts:
        b = P.Batch('tufts')
        for i in range(30):
            x, y = rng.uniform(-8, 8), rng.uniform(-3, 6)
            if abs(x) < 3.5 and y < 1.6:
                continue
            c = F(rng.choice(tufts))
            for k in range(3):
                b.add('cone', (x + (k - 1) * 0.07, y, 0.12), (1, 1, 0.14 + 0.05 * (k % 2)), (0, (k - 1) * 0.35, 0), mat=c, segs=6, r1=0.05, r2=0.0)
        b.done()
    return g


def _trees(rng, spots, greens, kinds=('round', 'pine'), hmin=1.6, hmax=2.6, name='t'):
    for i, (x, y) in enumerate(spots):
        K.tree(f'{name}{i}', x, y, 0.0, rng.uniform(hmin, hmax), rng.choice(kinds), rng.choice(greens), rng)


def _fence(x0, x1, y, h=0.7, col='#f4f1ea', name='fence', pointed=True):
    b = P.Batch(name)
    n = int((x1 - x0) / 0.38)
    for k in range(n + 1):
        x = x0 + k * (x1 - x0) / n
        b.add('cube', (x, y, h / 2), (0.07, 0.03, h / 2), mat=F(col))
        if pointed:
            b.add('cone', (x, y, h + 0.07), (1, 0.43, 0.07), mat=F(col), segs=4, r1=0.1, r2=0.0)
    for z in (h * 0.3, h * 0.75):
        b.add('cube', ((x0 + x1) / 2, y + 0.04, z), ((x1 - x0) / 2, 0.025, 0.05), mat=F(col))
    return b.done()


def _buildings(rng, y, x0, x1, lit, name='bld', hmin=2.5, hmax=5.5, cols=('#e9b6a0', '#a9c6e0', '#f2d58a', '#b7d9b0', '#d7b9e6', '#f0c9b4')):
    b = P.Batch(name)
    win = K.glow('#ffd98a', 2.5) if lit else K.paper('#cfe6f5', emit=0.15)
    dark = F('#3c4565')
    x = x0
    while x < x1:
        w = rng.uniform(1.6, 2.6)
        h = rng.uniform(hmin, hmax)
        col = F(rng.choice(cols))
        b.add('cube', (x + w / 2, y, h / 2), (w / 2 - 0.05, 0.8, h / 2), mat=col)
        b.add('cube', (x + w / 2, y, h + 0.08), (w / 2 + 0.02, 0.85, 0.08), mat=F('#f4f1ea'))
        rows, cols_n = int(h / 0.8), max(1, int(w / 0.6))
        for r in range(rows):
            for c in range(cols_n):
                on = lit and rng.random() < 0.7
                b.add('cube', (x + (c + 0.5) * w / cols_n, y - 0.81, 0.6 + r * 0.8), (0.14, 0.01, 0.2), mat=win if (on or not lit) else dark)
        x += w
    return b.done()


# ---------------------------------------------------------------- parks and gardens
def set_playground(tod, rng, props):
    S.sky_layers(tod, rng, moon_at=(6.5, 20, 7.0), stars_hanging=False, props=props)
    K.hills(16, 0.0, 80, 2.8, dn(tod, ['#8cc77f', '#9fd28f'], ['#2c4f80', '#35608c']), 1.1, 'farhills')
    _ground(tod, '#7db86c', '#2c4a44', '#5f9a62', rng=rng, tufts=('#4f9d5d', '#3c7a55'))
    # rubber play mat
    prim('cyl', 'playmat', (0, 4.2, 0.01), (6.5, 2.6, 0.02), mat=F(dn(tod, '#e8a06a', '#7a5a5a')), segs=40)
    # slide: ladder up, platform, a red chute down
    sl = K.empty('slide', (-4.2, 4.6, 0))
    for sx in (-1, 1):
        prim('cyl', 'slide_post', (sx * 0.5, 0.5, 0.85), (0.05, 0.05, 0.85), mat=F('#3f74c9'), parent=sl, segs=8)
        prim('cyl', 'slide_post', (sx * 0.5, -0.5, 0.85), (0.05, 0.05, 0.85), mat=F('#3f74c9'), parent=sl, segs=8)
    box('slide_deck', (0, 0, 1.7), (1.1, 1.1, 0.08), F('#f2c94c'), sl, 0.03)
    box('slide_roof', (0, 0, 2.6), (1.2, 1.2, 0.08), F('#d9473f'), sl, 0.03)
    for sx in (-1, 1):
        prim('cyl', 'slide_roofpost', (sx * 0.5, 0, 2.15), (0.04, 0.04, 0.45), mat=F('#3f74c9'), parent=sl, segs=6)
    ch = box('slide_chute', (1.45, 0, 0.9), (2.2, 0.7, 0.08), F('#d9473f'), sl, 0.04)
    ch.rotation_euler.y = 0.72
    lad = P.ladder(1.7)
    lad.parent = sl
    lad.location = (-0.6, 0, 0)
    lad.rotation_euler.z = math.pi / 2
    # swings
    sw = K.empty('swings', (3.6, 4.8, 0))
    for sx in (-1.3, 1.3):
        for sy in (-0.4, 0.4):
            p = prim('cyl', 'swing_leg', (sx, sy, 1.15), (0.05, 0.05, 1.2), mat=F('#4f9d5d'), parent=sw, segs=8)
            p.rotation_euler.x = -sy * 0.35
    prim('cyl', 'swing_bar', (0, 0, 2.3), (0.05, 0.05, 1.35), (0, math.pi / 2, 0), mat=F('#4f9d5d'), parent=sw, segs=8)
    for k, sx in enumerate((-0.6, 0.6)):
        piv = K.empty('swing', (sx, 0, 2.3), sw)
        for dx in (-0.22, 0.22):
            prim('cyl', 'swing_rope', (dx, 0, -0.8), (0.012, 0.012, 0.8), mat=F('#c9ccd4'), parent=piv, segs=4)
        box('swing_seat', (0, 0, -1.6), (0.55, 0.25, 0.05), F(['#f2c94c', '#ec8db0'][k]), piv, 0.02)
        K.anim(lambda t, f, o=piv, k=k: setattr(o.rotation_euler, 'x', math.sin(t * 1.6 + k * 2) * 0.35))
    # seesaw and a sandpit
    box('seesaw', (0.5, 6.4, 0.42), (2.6, 0.25, 0.06), F('#ee8a33'), None, 0.03).rotation_euler.y = 0.15
    prim('cone', 'seesaw_pivot', (0.5, 6.4, 0.2), (1, 1, 0.2), mat=F('#3f74c9'), segs=4, r1=0.25, r2=0.05)
    box('sandpit', (-1.0, 3.4, 0.08), (2.0, 1.0, 0.16), F('#e3c48c', fuzz=1.3), None, 0.06)
    _trees(rng, [(-9, 8), (-7, 10), (8.5, 9), (10, 7.5), (6.5, 11)], dn(tod, ['#4e9b60', '#5aa86a'], ['#2b6b52', '#2f7a58']))
    return {'night': S.night_of(tod)}


def set_garden(tod, rng, props):
    S.sky_layers(tod, rng, moon_at=(-6.0, 20, 7.0), stars_hanging=False, props=props)
    K.hills(16, 0.0, 80, 2.6, dn(tod, ['#8cc77f', '#9fd28f'], ['#2c4f80', '#35608c']), 0.3, 'farhills')
    _ground(tod, '#7db86c', '#2c4a44', '#5f9a62')
    _fence(-12, 12, 6.6, 0.8, dn(tod, '#f4f1ea', '#b7c0d8'))
    # vegetable beds: rows of cabbages and carrot tops
    b = P.Batch('veg')
    for row, (y, kind) in enumerate(((3.0, 'cabbage'), (4.3, 'carrot'), (5.5, 'cabbage'))):
        for side in (-1, 1):
            b.add('cube', (side * 4.8, y, 0.1), (2.6, 0.45, 0.12), mat=F('#7a5236', fuzz=1.3))
            for k in range(7):
                x = side * 4.8 - 2.2 + k * 0.73
                if kind == 'cabbage':
                    b.add('sphere', (x, y, 0.32), (0.26, 0.24, 0.2), mat=F('#7fbf5a'), segs=12)
                    b.add('sphere', (x, y - 0.05, 0.38), (0.15, 0.14, 0.12), mat=F('#a8d878'), segs=10)
                else:
                    for j in range(3):
                        b.add('cone', (x + (j - 1) * 0.06, y, 0.38), (1, 1, 0.16), (0, (j - 1) * 0.4, 0), mat=F('#4f9d5d'), segs=5, r1=0.04, r2=0.0)
                    b.add('cone', (x, y - 0.12, 0.2), (1, 1, 0.04), (math.pi / 2, 0, 0), mat=F('#ee8a33'), segs=8, r1=0.06, r2=0.0)
    b.done()
    # sunflowers and a little shed
    for k, x in enumerate((-7.5, -6.8, 7.2, 8.0)):
        fl = P.flower(5.0, '#f2c94c', stem=0.42)
        fl.location = (x, 6.2, 0)
    shed = K.empty('shed', (0, 8.0, 0))
    box('shed_wall', (0, 0, 0.9), (2.2, 1.6, 1.8), F('#7fb2a8'), shed, 0.05)
    roof = K.outline_obj('shed_roof', [(-1.35, 1.8), (1.35, 1.8), (0, 2.6)], 1.8, F('#c25a4a'), bevel=0.04)
    roof.parent = shed
    roof.location = (0, -0.9, 0)
    box('shed_door', (0.3, -0.82, 0.7), (0.7, 0.04, 1.3), F('#5a7f78'), shed, 0.02)
    prim('cyl', 'watering_can', (2.0, 2.0, 0.2), (0.18, 0.18, 0.2), mat=F('#3f74c9'), segs=14)
    prim('cone', 'can_spout', (2.3, 2.0, 0.3), (1, 1, 0.18), (0, 1.1, 0), mat=F('#3f74c9'), segs=8, r1=0.05, r2=0.02)
    if S.night_of(tod):
        S.fireflies(rng, 10)
    return {'night': S.night_of(tod)}


def set_campsite(tod, rng, props):
    S.sky_layers(tod, rng, moon_at=(5.5, 20, 7.4), props=props)
    night = tod['stars'] > 0
    K.hills(17, 0.0, 80, 3.4, ['#2a4a70', '#30577c'] if night else ['#6aa673', '#7fb886'], 1.2, 'farhills')
    greens = ['#1f5a46', '#2b6b52', '#2f7a58'] if night else ['#3f8a55', '#4e9b60', '#2f7a4a']
    _trees(rng, [(-11, 9), (-8.5, 11), (-6, 9.5), (6, 10), (8.5, 9), (11, 11), (-12, 6), (12, 6.5)], greens, ('pine',), 2.4, 3.4)
    _ground(tod, '#6fa862', '#26402f', '#4f7a52')
    P.p_tent(-3.6, 5.0, 0, rng, {'night': night})
    P.p_campfire(1.2, 2.6, 0, rng, {'night': night})
    for x, rot in ((-0.3, 0.3), (2.8, -0.4)):
        prim('cyl', 'log_seat', (x, 3.1, 0.18), (0.18, 0.18, 0.6), (0, math.pi / 2, rot), mat=F('#7a5236'), segs=12)
    if night:
        S.fireflies(rng, 12)
    return {'night': S.night_of(tod), 'used': ['tent', 'campfire', 'fireflies']}


def set_farm(tod, rng, props):
    S.sky_layers(tod, rng, moon_at=(6.5, 20, 7.0), stars_hanging=False, props=props)
    K.hills(16, 0.0, 80, 2.6, dn(tod, ['#b5d68a', '#c7e09a'], ['#2c4f80', '#35608c']), 0.8, 'farhills')
    _ground(tod, '#8cbf6a', '#2c4a44', '#6f9a5a')
    lit = tod['stars'] > 0
    # the red barn with white trim, a silo, hay bales and a fence
    barn = K.empty('barn', (-4.2, 8.0, 0))
    box('barn_wall', (0, 0, 1.3), (3.4, 2.4, 2.6), F('#c2453b'), barn, 0.06)
    roof = K.outline_obj('barn_roof', [(-1.9, 2.5), (-1.3, 3.6), (0, 4.1), (1.3, 3.6), (1.9, 2.5)], 2.6, F('#6b4a42'), bevel=0.05)
    roof.parent = barn
    roof.location = (0, -1.3, 0)
    box('barn_door', (0, -1.22, 0.85), (1.3, 0.05, 1.7), F('#f4f1ea'), barn, 0.02)
    for d in (1, -1):
        b = box('barn_cross', (0, -1.25, 0.85), (1.9, 0.04, 0.12), F('#c2453b'), barn, 0.01)
        b.rotation_euler.y = d * 0.9
    box('barn_loft', (0, -1.22, 2.4), (0.7, 0.05, 0.6), K.glow('#ffd98a', 2.0) if lit else F('#3c2a26'), barn, 0.02)
    prim('cyl', 'silo', (-1.5, 9.2, 1.8), (0.8, 0.8, 1.8), mat=F('#c9ccd4'), segs=24)
    prim('sphere', 'silo_top', (-1.5, 9.2, 3.6), (0.8, 0.8, 0.5), mat=F('#7b8bab'), segs=20)
    b = P.Batch('hay')
    for k, (x, y) in enumerate(((3.2, 5.0), (4.1, 5.4), (3.6, 5.6))):
        b.add('cyl', (x, y, 0.4 if k < 2 else 1.0), (0.42, 0.42, 0.5), (0, math.pi / 2, 0), mat=F('#e6c46a', fuzz=1.4), segs=18)
    b.done()
    _fence(-12, 12, 3.9, 0.75, dn(tod, '#d9b98a', '#8a7a6a'), pointed=False)
    # a few woolly sheep in the field
    for k, (x, y) in enumerate(((5.8, 8.0), (7.4, 9.0), (2.8, 9.5))):
        sh = K.empty('sheep', (x, y, 0))
        for j in range(6):
            prim('sphere', 'wool', (math.cos(j) * 0.22, math.sin(j) * 0.12, 0.55 + (j % 2) * 0.1), (0.24, 0.22, 0.22), mat=F('#f8f6f0', fuzz=1.6), parent=sh, segs=10)
        prim('sphere', 'sheep_head', (0.45, -0.05, 0.6), (0.14, 0.12, 0.15), mat=F('#3a3346'), parent=sh, segs=10)
        for lx in (-0.2, 0.2):
            prim('cyl', 'sheep_leg', (lx, 0, 0.18), (0.04, 0.04, 0.18), mat=F('#3a3346'), parent=sh, segs=6)
    return {'night': S.night_of(tod)}


def set_zoo(tod, rng, props):
    S.sky_layers(tod, rng, moon_at=(6.0, 20, 7.0), stars_hanging=False, props=props)
    K.hills(16, 0.0, 80, 2.8, dn(tod, ['#9fcf7f', '#b0da90'], ['#2c4f80', '#35608c']), 0.5, 'farhills')
    _ground(tod, '#d8c08a', '#4a4a5a', '#b39a72')
    _trees(rng, [(-9.5, 9), (-6, 10.5), (7, 10), (10, 8.5)], dn(tod, ['#4e9b60', '#5aa86a'], ['#2b6b52', '#2f7a58']), ('round',), 2.6, 3.4)
    # an enclosure: grass, a pond, rocks, a felt giraffe peeking over the railings and a zebra
    prim('cyl', 'enclosure', (0, 7.2, 0.02), (8.0, 2.4, 0.03), mat=F(dn(tod, '#8cc77f', '#2c4a44')), segs=40)
    prim('cyl', 'pond', (2.8, 7.5, 0.05), (1.5, 0.8, 0.03), mat=F('#6fb3e0', sheen=0.8), segs=28)
    rail = P.Batch('rail')
    for k in range(40):
        x = -8 + k * 0.4
        rail.add('cube', (x, 4.8, 0.45), (0.03, 0.03, 0.45), mat=F('#6b4532'))
    rail.add('cube', (0, 4.8, 0.9), (8.0, 0.05, 0.05), mat=F('#6b4532'))
    rail.add('cube', (0, 4.8, 0.45), (8.0, 0.04, 0.04), mat=F('#6b4532'))
    rail.done()
    gir = K.empty('giraffe', (-3.2, 7.4, 0))
    spot = F('#a8642f')
    for lx in (-0.35, 0.35):
        for ly in (-0.2, 0.2):
            prim('cyl', 'g_leg', (lx, ly, 0.6), (0.06, 0.06, 0.6), mat=F('#f2c46a'), parent=gir, segs=8)
    prim('sphere', 'g_body', (0, 0, 1.35), (0.6, 0.32, 0.38), mat=F('#f2c46a'), parent=gir, segs=16)
    neck = prim('cyl', 'g_neck', (0.45, 0, 2.2), (0.11, 0.11, 0.85), (0, 0.35, 0), mat=F('#f2c46a'), parent=gir, segs=12)
    prim('sphere', 'g_head', (0.78, -0.05, 3.0), (0.22, 0.16, 0.16), mat=F('#f2c46a'), parent=gir, segs=14)
    for sx in (-0.07, 0.07):
        prim('cyl', 'g_horn', (0.72 + sx, 0, 3.2), (0.02, 0.02, 0.08), mat=F('#a8642f'), parent=gir, segs=6)
        prim('sphere', 'g_eye', (0.86, -0.15, 3.05 + sx * 0.0), (0.03, 0.02, 0.03), mat=K.glossy('#15131c'), parent=gir, segs=6)
    for k in range(9):
        prim('sphere', 'g_spot', (rng.uniform(-0.45, 0.45), -0.31, 1.3 + rng.uniform(-0.2, 0.2)), (0.09, 0.02, 0.07), mat=spot, parent=gir, segs=8)
    K.anim(lambda t, f: setattr(gir.rotation_euler, 'y', math.sin(t * 0.8) * 0.03))
    zb = K.empty('zebra', (4.6, 6.8, 0))
    for lx in (-0.3, 0.3):
        prim('cyl', 'z_leg', (lx, 0, 0.3), (0.05, 0.05, 0.3), mat=F('#f8f6f0'), parent=zb, segs=6)
    prim('sphere', 'z_body', (0, 0, 0.75), (0.5, 0.25, 0.28), mat=F('#f8f6f0'), parent=zb, segs=16)
    for k in range(5):
        prim('cube', 'z_stripe', (-0.36 + k * 0.18, -0.24, 0.75), (0.03, 0.02, 0.24), mat=F('#2b2427'), parent=zb)
    prim('sphere', 'z_head', (0.6, -0.05, 1.05), (0.16, 0.12, 0.2), (0, 0.5, 0), mat=F('#f8f6f0'), parent=zb, segs=12)
    prim('cube', 'z_mane', (0.45, 0, 1.1), (0.15, 0.02, 0.05), (0, 0.6, 0), mat=F('#2b2427'), parent=zb)
    # a signpost
    prim('cyl', 'sign_post', (-6.0, 3.6, 0.8), (0.05, 0.05, 0.8), mat=F('#6b4532'), segs=6)
    for k, (c, rot) in enumerate((('#4f9d5d', 0.1), ('#ee8a33', -0.15))):
        sg = K.outline_obj('sign', [(0, 0), (0.8, 0), (1.0, 0.15), (0.8, 0.3), (0, 0.3)], 0.05, F(c), bevel=0.01)
        sg.location = (-6.0, 3.55, 1.25 + k * 0.35)
        sg.rotation_euler.y = rot
        sg.scale.x = 1 if k == 0 else -1
    return {'night': S.night_of(tod)}


# ---------------------------------------------------------------- sports
def set_basketball_court(tod, rng, props):
    S.sky_layers(tod, rng, moon_at=(-6.5, 20, 7.6), stars_hanging=False, props=props)
    lit = tod['stars'] > 0
    _buildings(rng, 13.0, -16, 16, lit, 'court_city', 3.0, 6.5)
    court = dn(tod, '#d98a52', '#6a4a52', '#b8704a')
    box('court', (0, 3.0, -0.05), (24, 14, 0.1), F(court, fuzz=0.6), None, 0)
    box('court_key', (0, 7.4, 0.003), (3.2, 3.4, 0.01), F(dn(tod, '#3f74c9', '#2c3d72')), None, 0)
    chalk = F('#fbfbf6', emit=0.2 if lit else 0.0, emit_color='#ffffff')
    b = P.Batch('court_lines')
    S.line(b, (-11, 9.1), (11, 9.1), mat=chalk)
    S.line(b, (-1.6, 5.7), (1.6, 5.7), mat=chalk)
    S.line(b, (-1.6, 5.7), (-1.6, 9.1), mat=chalk)
    S.line(b, (1.6, 5.7), (1.6, 9.1), mat=chalk)
    S.arc(b, 0, 5.7, 1.6, math.pi, 2 * math.pi, mat=chalk)
    S.arc(b, 0, 8.6, 5.6, math.pi + 0.15, 2 * math.pi - 0.15, mat=chalk, n=36)
    S.line(b, (-11, -1.5), (11, -1.5), mat=chalk)
    S.arc(b, 0, -1.5, 1.8, 0, math.pi, mat=chalk)
    b.done()
    # the hoop: a pole, a backboard with a square, an orange ring and a felt net
    hp = K.empty('hoop', (0, 9.6, 0))
    prim('cyl', 'hoop_pole', (0, 0.4, 1.6), (0.1, 0.1, 1.6), mat=F('#3f74c9'), parent=hp, segs=10)
    box('backboard', (0, 0, 3.4), (1.9, 0.08, 1.2), F('#fbfbf6'), hp, 0.03)
    box('board_square', (0, -0.05, 3.25), (0.65, 0.02, 0.5), F('#d9473f'), hp, 0.01)
    prim('torus', 'ring', (0, -0.42, 3.0), (0.36, 0.36, 0.36), mat=F('#ee6a2f'), parent=hp, segs=24, minor=0.07)
    net = K.paper('#fbfbf6', emit=0.2)
    nb = P.Batch('hoop_net')
    for k in range(10):
        a = k * 2 * math.pi / 10
        nb.add('cyl', (math.cos(a) * 0.3, -0.42 + math.sin(a) * 0.3, 2.78), (0.012, 0.012, 0.24), (math.sin(a) * 0.25, -math.cos(a) * 0.25, 0), mat=net, segs=4, smooth=False)
    nb.done(hp)
    _fence_chain(-12, 12, 11.2, 2.4, lit)
    for sx in (-1, 1):
        S.floodlight(f'court_light{sx}', sx * 8.5, 11.6, 5.0, lit)
    return {'night': S.night_of(tod)}


def _fence_chain(x0, x1, y, h, lit):
    b = P.Batch('chain_fence')
    wire = K.paper('#9aa3b5', emit=0.05)
    n = int((x1 - x0) / 0.35)
    for k in range(n + 1):
        x = x0 + k * (x1 - x0) / n
        b.add('cyl', (x, y, h / 2), (0.01, 0.01, h / 2 * 1.4), (0, 0.6, 0), mat=wire, segs=3, smooth=False)
        b.add('cyl', (x, y, h / 2), (0.01, 0.01, h / 2 * 1.4), (0, -0.6, 0), mat=wire, segs=3, smooth=False)
    for k in range(int((x1 - x0) / 3) + 1):
        b.add('cyl', (x0 + k * 3, y, h / 2), (0.05, 0.05, h / 2), mat=F('#7b8bab'), segs=8)
    b.add('cyl', ((x0 + x1) / 2, y, h), (0.04, 0.04, (x1 - x0) / 2), (0, math.pi / 2, 0), mat=F('#7b8bab'), segs=8)
    return b.done()


def set_baseball_field(tod, rng, props):
    night = S.night_of(tod)
    S.sky_layers(tod, rng, moon_at=(7.5, 20, 8.0), stars_hanging=False, props=props)
    K.hills(18, 0.0, 80, 2.2, dn(tod, ['#86bf7a', '#9bcd8c'], ['#2c4f80', '#35608c']), 0.3, 'farhills')
    S.grass_stripes(-16, 16, -6, 12, 9, dn(tod, ('#5fae5a', '#6dbb63'), ('#2f5e46', '#356a4d'), ('#4f8f52', '#5a9c5a')))
    dirt = F(dn(tod, '#c98a5a', '#5a4048'), fuzz=1.3)
    # the infield diamond seen from behind home plate: home in front, second base at the back
    d = K.mesh_obj('diamond', [(0, -1.0, 0.004), (5.2, 3.6, 0.004), (0, 8.2, 0.004), (-5.2, 3.6, 0.004)], [(0, 1, 2, 3)], dirt)
    prim('cyl', 'mound', (0, 3.6, 0.04), (0.9, 0.9, 0.06), mat=dirt, segs=24)
    prim('cyl', 'mound_grass', (0, 3.6, 0.006), (2.4, 2.4, 0.01), mat=F(dn(tod, '#6dbb63', '#356a4d')), segs=32)
    base = F('#fbfbf6', emit=0.2 if night else 0.0, emit_color='#ffffff')
    for (x, y) in ((4.6, 3.6), (0, 7.6), (-4.6, 3.6)):
        box('base', (x, y, 0.04), (0.4, 0.4, 0.06), base, None, 0.02).rotation_euler.z = math.pi / 4
    K.outline_obj('home_plate', [(-0.25, 0), (0.25, 0), (0.25, 0.2), (0, 0.4), (-0.25, 0.2)], 0.03, base).rotation_euler.x = math.pi / 2
    b = P.Batch('foul_lines')
    S.line(b, (0, -0.6), (11, 10), mat=base)
    S.line(b, (0, -0.6), (-11, 10), mat=base)
    b.done()
    S.stand('bstandL', -13.5, -5.0, 12.4, rng, 3, color='#3c6a5a', night=night)
    S.stand('bstandR', 5.0, 13.5, 12.4, rng, 3, color='#3c6a5a', night=night)
    box('outfield_wall', (0, 11.6, 0.5), (28, 0.15, 1.0), F('#2f6b4f'), None, 0.04)
    P.p_scoreboard(0, 12.6, 0.6, rng, {})
    for sx in (-1, 1):
        S.floodlight(f'bflood{sx}', sx * 11.5, 13.2, 6.0, S.lit_of(tod))
    if night:
        S.lamp('field_glow', (0, 2, 6), 2200, (1.0, 0.97, 0.9), 4.0)
    return {'night': night, 'used': ['scoreboard']}


def set_swimming_pool(tod, rng, props):
    S.sky_layers(tod, rng, moon_at=(-6.5, 20, 7.6), stars_hanging=False, props=props)
    lit = tod['stars'] > 0
    K.hills(17, 0.0, 80, 2.6, dn(tod, ['#8cc77f', '#9fd28f'], ['#2c4f80', '#35608c']), 0.7, 'farhills')
    _trees(rng, [(-10, 11), (-7.5, 12.5), (9, 11.5), (11.5, 10)], dn(tod, ['#4e9b60', '#5aa86a'], ['#2b6b52', '#2f7a58']), ('round',), 2.4, 3.2)
    # deck tiles where the children stand, the pool behind with a tiled edge, lanes and gentle ripples
    box('deck', (0, 0.0, -0.05), (30, 6.0, 0.1), F(dn(tod, '#f1e6d2', '#7a7a8a'), fuzz=0.6), None, 0)
    tb = P.Batch('pool_edge')
    for k in range(-30, 31):
        tb.add('cube', (k * 0.45, 3.15, 0.03), (0.21, 0.15, 0.04), mat=F(('#ffffff', '#3f74c9')[k % 2]))
    tb.done()
    water = F(dn(tod, '#4fb0e6', '#24507e', '#3d8fc4'), sheen=1.0, fuzz=0.4, emit=0.15 if lit else 0.0, emit_color='#7fd0ff')
    rows = P.Batch('pool_water')
    for k in range(8):
        rows.add('cube', (0, 3.6 + k * 0.9, -0.08), (16, 0.46, 0.06), mat=water)
    rows.done()
    for k in range(4):
        lane = P.Batch(f'lane{k}')
        for j in range(-30, 31):
            lane.add('sphere', (j * 0.3, 4.6 + k * 1.6, 0.0), (0.12, 0.08, 0.08), mat=F(('#d9473f', '#ffffff', '#f2c94c')[j % 3]), segs=8)
        ob = lane.done()
        K.anim(lambda t, f, o=ob, k=k: setattr(o.location, 'z', math.sin(t * 1.2 + k) * 0.03))
    rip = P.Batch('ripples')
    for k in range(18):
        rip.add('cube', (rng.uniform(-7, 7), rng.uniform(3.8, 10), 0.0), (rng.uniform(0.2, 0.5), 0.03, 0.006), mat=K.paper('#e8f8ff', emit=0.4))
    ro = rip.done()
    K.anim(lambda t, f: setattr(ro.location, 'x', math.sin(t * 0.6) * 0.2))
    lad = K.empty('pool_ladder', (3.6, 3.3, 0))
    for sx in (-0.3, 0.3):
        prim('torus', 'ladder_rail', (sx, 0.15, 0.35), (0.3, 0.3, 0.3), (0, math.pi / 2, 0), mat=F('#c9ccd4'), parent=lad, segs=16, minor=0.1)
    # a diving board and two umbrellas
    box('diving_board', (-4.5, 3.6, 0.45), (0.5, 2.0, 0.06), F('#f4f1ea'), None, 0.02)
    box('diving_base', (-4.5, 2.6, 0.22), (0.5, 0.4, 0.45), F('#3f74c9'), None, 0.04)
    P.p_umbrella(-6.5, 1.8, 0, rng, {})
    if lit:
        S.lamp('pool_glow', (0, 6, 1.0), 600, (0.6, 0.85, 1.0), 3.0)
    return {'night': S.night_of(tod), 'water': True}


# ---------------------------------------------------------------- town
def set_city(tod, rng, props):
    S.sky_layers(tod, rng, moon_at=(6.5, 20, 7.6), stars_hanging=False, props=props)
    lit = tod['stars'] > 0
    _buildings(rng, 13.5, -18, 18, lit, 'far_city', 4.0, 8.0, ('#9fb0cc', '#b7a9cc', '#a9c0b8', '#c0aca0'))
    _buildings(rng, 8.5, -14, 14, lit, 'city', 2.6, 5.2)
    # pavement, road with a zebra crossing, street lamps, a traffic light, planters
    box('pavement', (0, 1.0, -0.05), (30, 6.0, 0.1), F(dn(tod, '#d6d0c4', '#5a5a6e'), fuzz=0.6), None, 0)
    box('kerb', (0, 4.0, 0.03), (30, 0.2, 0.08), F('#f4f1ea'), None, 0.02)
    box('road', (0, 5.8, -0.04), (30, 3.4, 0.08), F(dn(tod, '#5b5f73', '#2f3245'), fuzz=0.5), None, 0)
    cb = P.Batch('crossing')
    for k in range(7):
        cb.add('cube', (-1.5 + k * 0.5, 5.8, 0.005), (0.18, 1.5, 0.006), mat=F('#fbfbf6'))
    for k in range(-14, 15, 2):
        if abs(k) > 3:
            cb.add('cube', (k * 1.0, 5.8, 0.005), (0.4, 0.06, 0.006), mat=F('#f2c94c'))
    cb.done()
    for x in (-6.0, 6.0):
        prim('cyl', 'street_lamp', (x, 3.6, 1.6), (0.06, 0.06, 1.6), mat=F('#3a3346'), segs=8)
        prim('sphere', 'lamp_globe', (x, 3.6, 3.3), (0.25, 0.25, 0.25), mat=K.glow('#ffe7a3', 5.0) if lit else F('#f4f1ea'), segs=14)
        if lit:
            S.lamp('street', (x, 3.0, 3.0), 380, (1.0, 0.85, 0.6), 0.5)
    tl = K.empty('traffic_light', (3.2, 3.7, 0))
    prim('cyl', 'tl_pole', (0, 0, 1.1), (0.05, 0.05, 1.1), mat=F('#3a3346'), parent=tl, segs=8)
    box('tl_box', (0, 0, 2.5), (0.35, 0.3, 0.9), F('#3a3346'), tl, 0.04)
    lights = []
    for k, c in enumerate(('#ff5a4f', '#ffcf4d', '#66d47a')):
        lo = prim('sphere', 'tl_lamp', (0, -0.16, 2.8 - k * 0.28), (0.1, 0.05, 0.1), mat=K.glow(c, 4.0), parent=tl, segs=10)
        lights.append(lo)
    K.anim(lambda t, f: [setattr(o.scale, 'x', 0.1 if int(t / 3) % 3 == k else 0.04) for k, o in enumerate(lights)])
    for x in (-3.4, 8.0):
        box('planter', (x, 3.3, 0.25), (0.7, 0.5, 0.5), F('#c27a52'), None, 0.04)
        K.tree('planter_tree', x, 3.3, 0.45, 1.6, 'round', dn(tod, '#5aa86a', '#2f7a58'), rng)
    return {'night': S.night_of(tod)}


def set_train_station(tod, rng, props):
    S.sky_layers(tod, rng, moon_at=(-7.0, 20, 7.4), stars_hanging=False, props=props)
    lit = tod['stars'] > 0
    K.hills(17, 0.0, 80, 2.6, dn(tod, ['#8cc77f', '#9fd28f'], ['#2c4f80', '#35608c']), 0.4, 'farhills')
    box('platform', (0, 0.2, 0.0), (30, 7.0, 0.3), F(dn(tod, '#d6d0c4', '#5a5a6e'), fuzz=0.6), None, 0.02)
    box('platform_edge', (0, 3.6, 0.13), (30, 0.25, 0.06), F('#f2c94c'), None, 0.01)
    box('trackbed', (0, 5.4, -0.25), (30, 3.0, 0.2), F('#8a7f74', fuzz=1.4), None, 0)
    tb = P.Batch('tracks')
    for k in range(-30, 31):
        tb.add('cube', (k * 0.5, 5.4, -0.12), (0.12, 1.0, 0.04), mat=F('#7a5236'))
    for sy in (-0.6, 0.6):
        tb.add('cube', (0, 5.4 + sy, -0.05), (15, 0.04, 0.04), mat=F('#9aa3b5'))
    tb.done()
    # a felt train waiting at the platform: an engine and two carriages
    tr = K.empty('train', (2.0, 5.4, 0))
    cols = ['#d9473f', '#3f74c9', '#4f9d5d']
    win = K.glow('#ffd98a', 2.5) if lit else K.paper('#cfe6f5', emit=0.2)
    for k in range(3):
        x = 4.2 - k * 3.4
        box('carriage', (x, 0, 1.0), (3.2, 1.3, 1.5), F(cols[k]), tr, 0.18)
        box('carriage_roof', (x, 0, 1.82), (3.3, 1.35, 0.15), F('#3a3346'), tr, 0.06)
        for j in range(3 if k else 1):
            box('train_window', (x - 1.0 + j * 1.0 if k else x - 0.8, -0.66, 1.25), (0.6, 0.02, 0.5), win, tr, 0.04)
        for sx in (-1.0, 1.0):
            prim('cyl', 'train_wheel', (x + sx, -0.6, 0.18), (0.26, 0.26, 0.06), (math.pi / 2, 0, 0), mat=F('#2b2b33'), parent=tr, segs=16)
    prim('cyl', 'chimney', (5.0, 0, 2.2), (0.18, 0.18, 0.35), mat=F('#3a3346'), parent=tr, segs=12)
    for k in range(3):
        puff = prim('sphere', 'puff', (5.0, 0, 2.7), (0.2, 0.2, 0.2), mat=K.paper('#ffffff', emit=0.3), parent=tr, segs=10)
        K.anim(lambda t, f, o=puff, k=k: (setattr(o.location, 'z', 2.7 + ((t * 0.4 + k / 3) % 1.0) * 1.4), setattr(o.location, 'x', 5.0 - ((t * 0.4 + k / 3) % 1.0) * 0.8),
                                           setattr(o.scale, 'x', 0.18 + ((t * 0.4 + k / 3) % 1.0) * 0.25)))
    # the canopy over the platform, a clock and a bench
    for x in (-6.0, -2.0, 2.0, 6.0):
        prim('cyl', 'canopy_post', (x, 2.6, 1.6), (0.07, 0.07, 1.6), mat=F('#3f6b5a'), segs=8)
    box('canopy', (0, 2.2, 3.3), (16, 2.6, 0.12), F('#3f6b5a'), None, 0.05).rotation_euler.x = 0.08
    cb = P.Batch('canopy_trim')
    for k in range(-16, 17):
        cb.add('cone', (k * 0.5, 0.9, 3.1), (1, 0.2, 0.15), (math.pi, 0, 0), mat=F('#f4f1ea'), segs=3, r1=0.25, r2=0.0)
    cb.done()
    prim('cyl', 'station_clock', (0, 2.5, 2.7), (0.35, 0.35, 0.06), (math.pi / 2, 0, 0), mat=F('#fbfbf6'), segs=24)
    prim('torus', 'station_clock_rim', (0, 2.44, 2.7), (0.36, 0.36, 0.36), (math.pi / 2, 0, 0), mat=F('#2b2427'), segs=24, minor=0.1)
    box('bench', (-4.2, 2.8, 0.55), (1.6, 0.4, 0.06), F('#a27a45'), None, 0.02)
    box('bench_back', (-4.2, 3.0, 0.85), (1.6, 0.05, 0.35), F('#a27a45'), None, 0.02)
    if lit:
        for x in (-4.0, 4.0):
            prim('sphere', 'canopy_lamp', (x, 2.2, 3.05), (0.18, 0.18, 0.12), mat=K.glow('#ffe7a3', 5.0), segs=12)
            S.lamp('canopy_light', (x, 1.6, 2.8), 300, (1.0, 0.85, 0.6))
    return {'night': S.night_of(tod)}


def set_airport(tod, rng, props):
    S.sky_layers(tod, rng, moon_at=(-7.0, 20, 7.6), stars_hanging=False, props=props)
    lit = tod['stars'] > 0
    box('tarmac', (0, 4.0, -0.05), (40, 20, 0.1), F(dn(tod, '#9a9fae', '#3c4055'), fuzz=0.5), None, 0)
    rb = P.Batch('runway')
    for k in range(-10, 11):
        rb.add('cube', (k * 1.6, 7.4, 0.005), (0.5, 0.08, 0.006), mat=F('#fbfbf6', emit=0.3 if lit else 0.0, emit_color='#ffffff'))
    for k in range(-20, 21):
        rb.add('sphere', (k * 0.8, 9.0, 0.04), (0.06, 0.06, 0.04), mat=K.glow(('#66b8ff', '#ffcf4d')[k % 2], 3.0) if lit else F('#c9ccd4'), segs=6)
    rb.done()
    # a big felt plane parked behind, a control tower and the terminal, a windsock
    pl = K.empty('jet', (-1.0, 6.2, 0))
    prim('sphere', 'jet_body', (0, 0, 1.3), (3.6, 0.65, 0.7), mat=F('#f4f1ea'), parent=pl, segs=24)
    prim('cyl', 'jet_stripe', (0, -0.02, 1.15), (0.66, 0.66, 3.3), (0, math.pi / 2, 0), mat=F('#3f74c9'), parent=pl, segs=24).scale = (0.68, 0.69, 3.2)
    wing = K.outline_obj('jet_wing', [(-0.6, 0), (0.6, 0), (0.2, 0.06), (-1.2, 0.06)], 3.6, F('#c9ccd4'), bevel=0.03)
    wing.parent = pl
    wing.location = (0.2, -1.8, 1.05)
    fin = K.outline_obj('jet_fin', [(-3.6, 0), (-2.8, 0), (-3.7, 1.3)], 0.1, F('#d9473f'), bevel=0.02)
    fin.parent = pl
    fin.location = (0, 0, 1.6)
    for k in range(8):
        prim('sphere', 'jet_window', (2.2 - k * 0.55, -0.62, 1.45), (0.1, 0.03, 0.12), mat=K.glow('#ffd98a', 2.0) if lit else F('#7fb2e5'), parent=pl, segs=8)
    prim('sphere', 'jet_cockpit', (3.2, -0.38, 1.55), (0.3, 0.2, 0.14), mat=F('#3c4565'), parent=pl, segs=10)
    for sx in (-1.2, 1.4):
        prim('cyl', 'jet_wheel', (sx, -0.3, 0.25), (0.25, 0.25, 0.1), (math.pi / 2, 0, 0), mat=F('#2b2b33'), parent=pl, segs=14)
    tw = K.empty('tower', (7.5, 11.0, 0))
    prim('cyl', 'tower_shaft', (0, 0, 2.5), (0.45, 0.45, 2.5), mat=F('#e9e3d6'), parent=tw, segs=20)
    prim('cyl', 'tower_cab', (0, 0, 5.4), (1.0, 1.0, 0.45), mat=K.glow('#ffd98a', 2.0) if lit else F('#7fb2e5'), parent=tw, segs=20)
    prim('cone', 'tower_roof', (0, 0, 6.0), (1, 1, 0.2), mat=F('#3f74c9'), parent=tw, segs=20, r1=1.1, r2=0.3)
    _buildings(rng, 13.0, -14, 4, lit, 'terminal', 2.0, 2.6, ('#dfe8f0', '#e9e3d6'))
    prim('cyl', 'windsock_pole', (-6.5, 3.0, 1.0), (0.04, 0.04, 1.0), mat=F('#c9ccd4'), segs=6)
    sock = prim('cone', 'windsock', (-6.1, 3.0, 1.9), (1, 1, 0.4), (0, math.pi / 2, 0), mat=F('#ee8a33'), segs=12, r1=0.16, r2=0.09)
    K.anim(lambda t, f: setattr(sock.rotation_euler, 'z', math.sin(t * 1.3) * 0.2))
    return {'night': S.night_of(tod)}


# ---------------------------------------------------------------- water
def set_beach(tod, rng, props):
    S.sky_layers(tod, rng, moon_at=(-6.0, 20, 6.6), stars_hanging=False, props=props)
    K.sea(10.5, 0.4, 70, rows=6, colors=('#3a8fd0', '#4fa8e6', '#3584c4', '#5ab4ea', '#2c76b8') if tod['stars'] == 0 else ('#2b4fa8', '#3a63c4', '#2a4a9a', '#4c78d6', '#1f3d88'))
    # foam at the water's edge, the sand where the children stand
    fb = P.Batch('foam')
    for k in range(40):
        fb.add('sphere', (-15 + k * 0.78, 4.6 + rng.uniform(-0.1, 0.1), 0.0), (0.45, 0.2, 0.06), mat=F('#f8fbff', emit=0.2), segs=10)
    fo = fb.done()
    K.anim(lambda t, f: setattr(fo.location, 'y', math.sin(t * 0.8) * 0.18))
    sand = dn(tod, '#ecd3a0', '#6a6276', '#c9a882')
    box('beach', (0, -1.5, -0.08), (40, 12.6, 0.16), F(sand, fuzz=1.3), None, 0)
    sb = P.Batch('shells')
    for k in range(18):
        x, y = rng.uniform(-8, 8), rng.uniform(-2, 4)
        if abs(x) < 3.4 and y < 1.5:
            continue
        sb.add('sphere', (x, y, 0.03), (0.08, 0.06, 0.04), mat=F(rng.choice(['#f6c6c6', '#fbf3e3', '#f2c94c'])), segs=8)
    sb.add('cube', (6.0, 2.0, 0.05), (0.45, 0.35, 0.05), mat=F('#3f74c9'))
    sb.done()
    # palm trees
    for k, (x, y, lean) in enumerate(((-7.0, 3.4, 0.25), (8.0, 4.0, -0.3))):
        palm(f'palm{k}', x, y, 3.4, lean, dn(tod, '#4f9d5d', '#2b6b52'), rng)
    P.p_umbrella(-4.6, 2.2, 0, rng, {})
    return {'night': S.night_of(tod), 'water': True, 'used': ['umbrella']}


def palm(name, x, y, h, lean, green, rng):
    root = K.empty(name, (x, y, 0))
    b = P.Batch(f'{name}_trunk')
    for k in range(9):
        z = k * h / 9
        b.add('cyl', (math.sin(lean) * z * 0.6, 0, z + h / 18), (0.17 - k * 0.008, 0.17 - k * 0.008, h / 18 + 0.02), (0, lean * 0.6, 0), mat=F(('#a27a45', '#8a6538')[k % 2]), segs=10)
    b.done(root)
    top = K.empty(f'{name}_top', (math.sin(lean) * h * 0.6, 0, h), root)
    for k in range(7):
        a = k * 2 * math.pi / 7
        leaf = K.outline_obj(f'{name}_leaf', [(0, 0), (0.6, 0.18), (1.4, 0.1), (1.9, -0.25), (1.3, -0.05), (0.6, -0.08)], 0.04, F(green), bevel=0.01)
        leaf.parent = top
        leaf.rotation_euler = (0, 0.15, a)
    for k in range(3):
        prim('sphere', 'coconut', (0.1 * math.cos(k * 2), 0.1 * math.sin(k * 2), -0.1), (0.12, 0.12, 0.12), mat=F('#6b4532'), parent=top, segs=10)
    ph = rng.uniform(0, 6)
    K.anim(lambda t, f: setattr(top.rotation_euler, 'x', math.sin(t * 0.9 + ph) * 0.05))
    return root


def set_river(tod, rng, props):
    """A rainforest river: big leaves on both banks, the water flowing behind the children, lily pads, a log bridge."""
    S.sky_layers(tod, rng, moon_at=(-5.5, 20, 7.6), stars_hanging=False, props=props)
    night = tod['stars'] > 0
    greens = ['#1f5a46', '#2b6b52', '#2f7a58'] if night else ['#2f8a55', '#3f9b60', '#4aa86a', '#2f7a4a']
    K.hills(17, 0.0, 80, 4.0, ['#2a4a70', '#30577c'] if night else ['#4f9a63', '#62ab72'], 1.2, 'farhills')
    for k in range(9):
        palm(f'rpalm{k}', -13 + k * 3.3 + rng.uniform(-0.5, 0.5), 10.5 + rng.uniform(-1, 1), rng.uniform(2.8, 4.2), rng.uniform(-0.3, 0.3), rng.choice(greens), rng)
    waters = ('#3aa0b8', '#4fb4c8', '#2f8ea8', '#5ac0d0') if not night else ('#244e7e', '#2c5c8e', '#1f4472', '#336a9a')
    K.sea(7.8, 0.15, 70, rows=4, colors=waters, amp=0.08, bob=0.6)
    _ground(tod, '#5f9a52', '#24402f', '#4f7a4a', depth=11.0)
    lb = P.Batch('lily')
    for k in range(7):
        lb.add('cyl', (rng.uniform(-7, 7), rng.uniform(5.6, 7.0), 0.2), (0.35, 0.3, 0.02), mat=F('#4f9d5d'), segs=14)
    lb.done()
    for k in range(3):
        fl = P.flower(1.6, '#f6b6d0', stem=0.05)
        fl.location = (rng.uniform(-6, 6), rng.uniform(5.6, 6.8), 0.2)
    jungle_leaves(rng, greens, front=True)
    if night:
        S.fireflies(rng, 14)
    return {'night': S.night_of(tod), 'water': True}


def jungle_leaves(rng, greens, front=False, n=10):
    """Big cut-out jungle leaves at the sides of the picture, swaying."""
    for k in range(n):
        side = -1 if k % 2 == 0 else 1
        x = side * rng.uniform(4.8, 7.5)
        y = rng.uniform(1.0, 4.0) if front else rng.uniform(4, 8)
        s = rng.uniform(1.0, 1.8)
        pts = [(0, 0)] + [(math.sin(a * math.pi) * 0.45 * s, a * 1.6 * s) for a in [i / 10 for i in range(1, 10)]] + [(0, 1.7 * s)] + [(-math.sin(a * math.pi) * 0.45 * s, a * 1.6 * s) for a in [i / 10 for i in range(9, 0, -1)]]
        leaf = K.outline_obj('jleaf', pts, 0.04, F(rng.choice(greens)), bevel=0.01)
        leaf.location = (x, y, 0)
        leaf.rotation_euler = (0, side * rng.uniform(0.3, 0.8), 0)
        ph = rng.uniform(0, 6)
        r0 = leaf.rotation_euler.y
        K.anim(lambda t, f, o=leaf, ph=ph, r0=r0: setattr(o.rotation_euler, 'y', r0 + math.sin(t * 0.8 + ph) * 0.05))


def set_underwater(tod, rng, props):
    night = tod['stars'] > 0.5
    K.backdrop('#0c2f5c' if night else '#1d6fa8', '#1f5a8a' if night else '#5ec4d8')
    # light rays from the surface
    for k in range(5):
        r = prim('cone', 'sunray', (-6 + k * 3.0, 9.0, 6.0), (1, 1, 5.0), (0.15, (k - 2) * 0.12, 0), mat=K.haze('#bff4ff', 0.25 if not night else 0.1, axis='beam', power=1.4, name='ray'), segs=24, r1=1.2, r2=0.25)
        r.visible_shadow = False
    sand = '#c9b58a' if not night else '#4a5a72'
    K.hills(14, 0.0, 80, 1.6, ['#2f6a8a', '#367a96'] if not night else ['#1c3a5e', '#22466e'], 1.3, 'reef_hills')
    box('seabed', (0, 0, -0.08), (40, 20, 0.16), F(sand, fuzz=1.3), None, 0)
    # seaweed that sways, coral, shells, a little shipwreck chest
    for k in range(14):
        x = rng.choice([-1, 1]) * rng.uniform(3.6, 9) if k < 8 else rng.uniform(-9, 9)
        y = rng.uniform(1.0, 8.0)
        h = rng.uniform(1.2, 2.6)
        pts = [(-0.08, 0)] + [(math.sin(i * 0.9) * 0.15 + 0.08, i * h / 8) for i in range(1, 9)] + [(math.sin(i * 0.9) * 0.15 - 0.08, i * h / 8) for i in range(8, 0, -1)]
        wd = K.outline_obj('seaweed', pts, 0.04, F(rng.choice(['#3f9b60', '#2f8a55', '#6fbf5a'])), bevel=0.01)
        wd.location = (x, y, 0)
        ph = rng.uniform(0, 6)
        K.anim(lambda t, f, o=wd, ph=ph: setattr(o.rotation_euler, 'y', math.sin(t * 0.9 + ph) * 0.12))
    cb = P.Batch('coral')
    for k in range(9):
        x, y = rng.uniform(-8, 8), rng.uniform(3, 8)
        col = F(rng.choice(['#f2799a', '#ee8a33', '#f2c94c', '#b17ad9']))
        for j in range(5):
            cb.add('cyl', (x + rng.uniform(-0.25, 0.25), y, 0.3 + j * 0.05), (0.06, 0.06, rng.uniform(0.25, 0.5)), (rng.uniform(-0.4, 0.4), rng.uniform(-0.4, 0.4), 0), mat=col, segs=8)
            cb.add('sphere', (x + rng.uniform(-0.3, 0.3), y, rng.uniform(0.5, 0.8)), (0.09, 0.09, 0.09), mat=col, segs=8)
    cb.done()
    # bubbles rising and little fish swimming by
    bubbles = []
    for k in range(16):
        bb = prim('sphere', 'bubble', (rng.uniform(-6, 6), rng.uniform(0, 6), 0), (0.07, 0.07, 0.07), mat=K.glossy('#dff8ff', 0.05), segs=10)
        bubbles.append((bb, bb.location.x, rng.uniform(0, 5), rng.uniform(0.4, 0.8)))
    K.anim(lambda t, f: [(setattr(b.location, 'z', (z0 + t * sp) % 5.0), setattr(b.location, 'x', x0 + math.sin(t * 2 + z0) * 0.1)) for b, x0, z0, sp in bubbles])
    for k in range(6):
        fish = small_fish(rng.choice(['#f2c94c', '#ee8a33', '#4fa8f0', '#ec8db0']))
        y, z, sp, ph = rng.uniform(3, 9), rng.uniform(1.2, 4.0), rng.uniform(0.4, 0.8), rng.uniform(0, 20)
        dirn = rng.choice([-1, 1])
        fish.rotation_euler.z = 0 if dirn > 0 else math.pi
        K.anim(lambda t, f, o=fish, y=y, z=z, sp=sp, ph=ph, d=dirn: setattr(o, 'location', (d * (((t * sp + ph) % 20) - 10), y, z + math.sin(t * 1.5 + ph) * 0.15)))
    if night:
        for k in range(4):
            jelly = prim('sphere', 'jelly', (rng.uniform(-6, 6), rng.uniform(3, 7), rng.uniform(2, 4)), (0.3, 0.3, 0.22), mat=F('#e8a8ff', emit=1.2, emit_color='#d88cff'), segs=14)
            z0 = jelly.location.z
            K.anim(lambda t, f, o=jelly, z0=z0, k=k: setattr(o.location, 'z', z0 + math.sin(t * 0.7 + k) * 0.3))
    S.lamp('sea_light', (0, -2, 6), 900 if not night else 400, (0.7, 0.92, 1.0), 6.0)
    return {'night': night, 'water': True}


def small_fish(col, name='fish_bg', s=1.0):
    root = K.empty(name)
    prim('sphere', 'fb_body', (0, 0, 0), (0.25 * s, 0.1 * s, 0.15 * s), mat=F(col), parent=root, segs=12)
    prim('cone', 'fb_tail', (-0.3 * s, 0, 0), (1, 0.3, 0.12 * s), (0, math.pi / 2, 0), mat=F(col), parent=root, segs=4, r1=0.14 * s, r2=0.0)
    prim('sphere', 'fb_eye', (0.14 * s, -0.08 * s, 0.04 * s), (0.03 * s, 0.02 * s, 0.03 * s), mat=K.glossy('#15131c'), parent=root, segs=6)
    return root


def set_pirate_ship(tod, rng, props):
    """On the deck of a felt pirate ship at sea: the children stand on the planks."""
    S.sky_layers(tod, rng, moon_at=(-7.0, 20, 7.4), stars_hanging=tod['stars'] > 0.5, props=props)
    K.sea(13, 0.5, 70, rows=6, colors=('#3a8fd0', '#4fa8e6', '#3584c4', '#5ab4ea', '#2c76b8') if tod['stars'] == 0 else ('#2b4fa8', '#3a63c4', '#2a4a9a', '#4c78d6', '#1f3d88'))
    ship = K.empty('ship', (0, 0, 0))
    db = P.Batch('deck')
    for k in range(-20, 21):
        db.add('cube', (k * 0.5, 2.0, -0.05), (0.24, 6.0, 0.05), mat=F(('#a8763f', '#9a6a36')[k % 2], sheen=0.3))
    # the rails behind and at the sides
    for k in range(-24, 25):
        db.add('cyl', (k * 0.4, 6.6, 0.45), (0.05, 0.05, 0.45), mat=F('#7a5236'), segs=6)
    db.add('cube', (0, 6.6, 0.95), (10, 0.12, 0.08), mat=F('#6b4532'))
    db.add('cube', (0, 6.9, -0.5), (12, 0.3, 0.6), mat=F('#5a3a2b'))
    db.done(ship)
    # the mast with sails, a flag with a star, the ship's wheel, barrels and a rope coil
    prim('cyl', 'mast', (1.5, 5.0, 4.0), (0.16, 0.16, 4.0), mat=F('#7a5236'), segs=12)
    for k, (z, w) in enumerate(((2.6, 2.6), (5.2, 2.0))):
        prim('cyl', 'yard', (1.5, 4.85, z + 1.0), (0.06, 0.06, w / 2 + 0.2), (0, math.pi / 2, 0), mat=F('#7a5236'), segs=8)
        sail = K.outline_obj('sail', [(-w / 2, 0), (w / 2, 0), (w / 2 + 0.15, 1.9 - k * 0.3), (-w / 2 - 0.15, 1.9 - k * 0.3)], 0.06, F('#fbf3e3'), bevel=0.02)
        sail.location = (1.5, 4.7, z - 0.95 + k * 0.3)
        K.anim(lambda t, f, o=sail, k=k: setattr(o.scale, 'y', 1 + math.sin(t * 1.2 + k) * 0.6))
    flag = K.outline_obj('pirate_flag', [(0, 0), (0.9, -0.05), (0.85, -0.6), (0, -0.55)], 0.03, F('#2d2a33'), bevel=0.01)
    flag.location = (1.6, 5.0, 8.4)
    st = K.outline_obj('flag_star', K.star_pts(0.18, 0.08), 0.02, F('#f2c94c'), bevel=0.005)
    st.location = (2.0, 4.97, 8.1)
    K.anim(lambda t, f: setattr(flag.rotation_euler, 'z', math.sin(t * 2) * 0.12))
    wheel = K.empty('ship_wheel', (-4.2, 4.6, 1.4))
    prim('torus', 'wheel_rim', (0, 0, 0), (0.55, 0.55, 0.55), (math.pi / 2, 0, 0), mat=F('#8a5a35'), parent=wheel, segs=24, minor=0.1)
    for k in range(8):
        prim('cyl', 'wheel_spoke', (0, 0, 0), (0.035, 0.035, 0.75), (math.pi / 2, 0, 0), mat=F('#8a5a35'), parent=wheel, segs=6).rotation_euler = (0, k * math.pi / 8, 0)
    prim('cyl', 'wheel_stand', (-4.2, 4.75, 0.7), (0.1, 0.1, 0.7), mat=F('#6b4532'), segs=8)
    K.anim(lambda t, f: setattr(wheel.rotation_euler, 'y', math.sin(t * 0.5) * 0.3))
    for k, (x, y) in enumerate(((5.2, 5.0), (5.9, 5.4), (5.5, 4.4))):
        prim('cyl', 'barrel', (x, y, 0.42), (0.32, 0.32, 0.42), mat=F('#a8763f'), segs=16)
        for z in (0.15, 0.7):
            prim('torus', 'barrel_hoop', (x, y, z), (0.33, 0.33, 0.33), mat=F('#3a3346'), segs=16, minor=0.07)
    prim('torus', 'rope_coil', (-2.2, 4.4, 0.06), (0.4, 0.4, 0.4), mat=F('#d9b98a'), segs=20, minor=0.3)
    K.anim(lambda t, f: (setattr(ship.rotation_euler, 'y', math.sin(t * 0.7) * 0.012), setattr(ship.location, 'z', math.sin(t * 0.9) * 0.03)))
    return {'night': S.night_of(tod)}


# ---------------------------------------------------------------- far away and make-believe
def set_space(tod, rng, props):
    """On the felt moon: craters, the Earth and a ringed planet in a sky full of stars (always starry)."""
    K.backdrop('#0a0a2a', '#2a1f5c')
    K.star_field(rng, count=520, zmin=-2)
    for i, (x, z, y) in enumerate(((-8.5, 5.2, 12), (-3.6, 7.3, 9), (2.2, 6.4, 10), (8.8, 5.9, 11))):
        K.hanging_star(f'sstar{i}', x, z, y, rng.uniform(0.32, 0.5), 22, rng)
    earth = K.empty('earth', (-6.5, 20, 6.5))
    prim('cyl', 'earth_disc', (0, 0, 0), (2.0, 2.0, 0.12), (math.pi / 2, 0, 0), mat=F('#3f8ad9', emit=0.9, emit_color='#3f8ad9'), parent=earth, segs=48)
    for k in range(5):
        prim('sphere', 'continent', (rng.uniform(-1.2, 1.2), -0.14, rng.uniform(-1.2, 1.2)), (rng.uniform(0.3, 0.6), 0.04, rng.uniform(0.25, 0.5)), mat=F('#66c792', emit=0.8, emit_color='#66c792'), parent=earth, segs=12)
    prim('cyl', 'cloudband', (0.3, -0.16, 0.9), (0.9, 0.12, 0.02), (math.pi / 2, 0, 0), mat=F('#ffffff', emit=1.0, emit_color='#ffffff'), parent=earth, segs=16)
    pl = K.empty('ringed', (7.5, 19, 8.5))
    prim('sphere', 'planet', (0, 0, 0), (1.1, 1.1, 1.1), mat=F('#f2a65a', emit=0.7, emit_color='#f2a65a'), parent=pl, segs=24)
    prim('torus', 'planet_ring', (0, 0, 0), (1.9, 1.9, 1.9), (1.3, 0.25, 0), mat=F('#f6d8a8', emit=0.6, emit_color='#f6d8a8'), parent=pl, segs=40, minor=0.08)
    K.hills(16, 0.0, 80, 1.8, ['#8a87a8', '#9a97b6'], 0.8, 'moon_hills')
    box('moon_ground', (0, 0, -0.08), (40, 20, 0.16), F('#b8b4c8', fuzz=1.2), None, 0)
    cb = P.Batch('craters')
    for k in range(14):
        x, y = rng.uniform(-9, 9), rng.uniform(-2, 9)
        if abs(x) < 3.5 and y < 1.6:
            continue
        r = rng.uniform(0.3, 0.9)
        cb.add('cyl', (x, y, 0.02), (r, r * 0.6, 0.03), mat=F('#9893ad'), segs=20)
        cb.add('cyl', (x, y, 0.005), (r * 1.2, r * 0.75, 0.02), mat=F('#c8c4d6'), segs=20)
    cb.done()
    P.p_rocket(4.6, 5.2, 0, rng, {})
    flag = K.empty('moon_flag', (-3.8, 3.6, 0))
    prim('cyl', 'flagpole', (0, 0, 0.9), (0.025, 0.025, 0.9), mat=F('#c9ccd4'), parent=flag, segs=6)
    fl = K.outline_obj('flag', [(0, 0), (0.7, 0), (0.7, -0.45), (0, -0.45)], 0.02, F('#d9473f'), bevel=0.006)
    fl.parent = flag
    fl.location = (0.02, 0, 1.75)
    st = K.outline_obj('flag_star', K.star_pts(0.14, 0.06), 0.03, F('#f2c94c'), bevel=0.005)
    st.parent = flag
    st.location = (0.36, -0.01, 1.52)
    S.lamp('earthshine', (-3, -2, 6), 900, (0.75, 0.82, 1.0), 4.0)
    return {'night': True, 'used': ['rocket']}


def set_castle(tod, rng, props):
    S.sky_layers(tod, rng, moon_at=(-6.5, 20, 7.8), props=props)
    lit = tod['stars'] > 0
    K.hills(17, 0.0, 80, 3.0, dn(tod, ['#8cc77f', '#9fd28f'], ['#2c4f80', '#35608c']), 1.5, 'farhills')
    stone = F(dn(tod, '#d8cfc2', '#7d7f9a'), fuzz=1.0)
    roofc = F('#5a6fb8')
    c = K.empty('castle', (0, 9.0, 0))
    box('castle_wall', (0, 0, 1.6), (8.0, 1.2, 3.2), stone, c, 0.05)
    bb = P.Batch('battlements')
    for k in range(-9, 10):
        bb.add('cube', (k * 0.42, -0.3, 3.35), (0.15, 0.3, 0.18), mat=stone)
    for x in (-4.4, 4.4, -1.6, 1.6):
        tall = abs(x) > 2
        h = 5.4 if tall else 4.4
        bb.add('cyl', (x, -0.2, h / 2), (0.85 if tall else 0.6, 0.85 if tall else 0.6, h / 2), mat=stone, segs=24)
        bb.add('cone', (x, -0.2, h + 0.9), (1, 1, 0.9), mat=roofc, segs=24, r1=1.05 if tall else 0.78, r2=0.02)
        for j in range(3):
            bb.add('cube', (x, -1.05 if tall else -0.8, h * (0.45 + j * 0.15)), (0.12, 0.03, 0.2), mat=K.glow('#ffd98a', 2.5) if lit else F('#3c3a52'))
    bb.done(c)
    gate = K.outline_obj('gate', [(-0.9, 0)] + [(math.cos(a) * 0.9, 1.4 + math.sin(a) * 0.9) for a in [i * math.pi / 12 for i in range(0, 13)]][::-1] + [(0.9, 0)], 0.05, F('#6b4532'), bevel=0.02)
    gate.parent = c
    gate.location = (0, -0.62, 0)
    for x in (-4.4, 4.4, -1.6, 1.6):
        fl = K.outline_obj('pennant', [(0, 0), (0.7, -0.15), (0, -0.3)], 0.02, F(rng.choice(['#d9473f', '#f2c94c', '#4f9d5d'])), bevel=0.005)
        fl.parent = c
        fl.location = (x, -0.2, (5.4 if abs(x) > 2 else 4.4) + 2.1)
        prim('cyl', 'pennant_pole', (x, -0.2, (5.4 if abs(x) > 2 else 4.4) + 1.95), (0.02, 0.02, 0.25), mat=F('#6b4532'), parent=c, segs=4)
        K.anim(lambda t, f, o=fl, x=x: setattr(o.rotation_euler, 'z', math.sin(t * 2 + x) * 0.2))
    # a path to the gate, a moat bridge, bushes
    path = K.mesh_obj('path', [(-1.0, 0, 0.01), (1.0, 0, 0.01), (0.7, 8.4, 0.01), (-0.7, 8.4, 0.01)], [(0, 1, 2, 3)], F(dn(tod, '#d9c49a', '#5a5470'), fuzz=1.2))
    prim('cyl', 'moat', (0, 7.6, -0.02), (9.0, 0.7, 0.03), mat=F(dn(tod, '#5aa8d8', '#2b4fa8'), sheen=0.8), segs=40)
    box('bridge', (0, 7.6, 0.06), (1.6, 1.6, 0.08), F('#8a5a35'), None, 0.02)
    _ground(tod, '#7db86c', '#2c4a44', '#5f9a62')
    _trees(rng, [(-8.5, 7), (8.5, 7.5), (-11, 9), (11, 9.5)], dn(tod, ['#4e9b60', '#5aa86a'], ['#2b6b52', '#2f7a58']), ('round', 'pine'), 2.0, 3.0)
    return {'night': S.night_of(tod)}


def set_jungle(tod, rng, props):
    S.sky_layers(tod, rng, moon_at=(5.5, 20, 7.6), stars_hanging=False, props=props)
    night = tod['stars'] > 0
    greens = ['#1f5a46', '#2b6b52', '#2f7a58'] if night else ['#2f8a55', '#3f9b60', '#4aa86a', '#2f7a4a', '#5ab06a']
    K.hills(17, 0.0, 80, 4.2, ['#2a4a70', '#30577c'] if night else ['#3f8a55', '#4f9a63'], 1.2, 'farhills')
    for k in range(12):
        palm(f'jpalm{k}', -14 + k * 2.6 + rng.uniform(-0.5, 0.5), rng.uniform(7, 12), rng.uniform(3.0, 4.6), rng.uniform(-0.3, 0.3), rng.choice(greens), rng)
    _ground(tod, '#4f8a4a', '#1f3a2f', '#3f6a42')
    jungle_leaves(rng, greens, front=True, n=12)
    jungle_leaves(rng, greens, front=False, n=10)
    # vines hanging from the top, big tropical flowers
    for k in range(8):
        x = -7 + k * 2.0 + rng.uniform(-0.4, 0.4)
        L = rng.uniform(1.5, 3.0)
        v = K.empty('vine', (x, rng.uniform(2.5, 6), 6.2))
        vb = P.Batch('vine_leaves')
        vb.add('cyl', (0, 0, -L / 2), (0.025, 0.025, L / 2), mat=F('#3f7a42'), segs=5)
        for j in range(int(L / 0.3)):
            vb.add('sphere', ((j % 2 - 0.5) * 0.14, 0, -j * 0.3 - 0.1), (0.1, 0.03, 0.06), (0, (j % 2 - 0.5) * 1.2, 0), mat=F(rng.choice(greens)), segs=8)
        vb.done(v)
        ph = rng.uniform(0, 6)
        K.anim(lambda t, f, o=v, ph=ph: setattr(o.rotation_euler, 'y', math.sin(t * 0.7 + ph) * 0.06))
    for k in range(5):
        fl = P.flower(4.0, rng.choice(['#f2799a', '#ee8a33', '#f2c94c']), stem=0.25)
        fl.location = (rng.choice([-1, 1]) * rng.uniform(3.6, 6.5), rng.uniform(1.5, 4), 0)
    if night:
        S.fireflies(rng, 16)
    return {'night': S.night_of(tod)}


def set_snowy_mountain(tod, rng, props):
    S.sky_layers(tod, rng, moon_at=(6.0, 20, 8.0), stars_hanging=False, props=props)
    night = tod['stars'] > 0
    # peaks with snow caps
    for k, (x, h, y) in enumerate(((-9, 7.5, 17), (-3, 9.5, 18.5), (4, 8.0, 17.5), (10, 6.5, 16.5), (0, 5.5, 14))):
        rock = '#8f9ab8' if not night else '#4a5478'
        snow = '#f8fbff' if not night else '#c8d2ee'
        m = K.outline_obj('peak', [(-h * 0.8, 0), (h * 0.8, 0), (0, h)], 0.3, F(rock), bevel=0.05)
        m.location = (x, y, -0.5)
        cap = K.outline_obj('snowcap', [(-h * 0.3, h * 0.62), (-h * 0.15, h * 0.55), (0, h * 0.6), (h * 0.14, h * 0.53), (h * 0.3, h * 0.62), (0, h)], 0.32, F(snow, emit=0.1), bevel=0.04)
        cap.location = (x, y - 0.02, -0.5)
    K.hills(12, 0.0, 80, 2.0, ['#e6eefa', '#f4f8ff'] if not night else ['#7d8ab0', '#8f9ac0'], 0.8, 'snowhills')
    box('snow_ground', (0, 0, -0.08), (40, 20, 0.16), F('#f8fbff' if not night else '#9fb0d8', sheen=0.6, fuzz=1.3), None, 0)
    for i, (x, y) in enumerate(((-7.5, 7), (-5.5, 9.5), (6.5, 7.5), (8.5, 9.5), (-9.5, 5), (10, 5.5))):
        K.tree(f'snowpine{i}', x, y, 0, rng.uniform(2.0, 3.0), 'pine', '#2f6b4f' if not night else '#1f4a46', rng)
        prim('cone', 'pine_snow', (x, y, 2.2), (1, 1, 0.3), mat=F('#ffffff', emit=0.1), segs=16, r1=0.35, r2=0.02)
    # a little wooden cabin with a glowing window and a chimney puff
    cab = K.empty('cabin', (3.5, 6.0, 0))
    box('cabin_wall', (0, 0, 0.7), (2.0, 1.4, 1.4), F('#8a5a35'), cab, 0.05)
    roof = K.outline_obj('cabin_roof', [(-1.3, 1.35), (1.3, 1.35), (0, 2.2)], 1.6, F('#f8fbff'), bevel=0.05)
    roof.parent = cab
    roof.location = (0, -0.8, 0)
    box('cabin_win', (0.4, -0.72, 0.8), (0.45, 0.04, 0.4), K.glow('#ffd98a', 3.0) if night else F('#7fb2e5'), cab, 0.02)
    sled = K.empty('sled', (-3.6, 2.6, 0))
    box('sled_seat', (0, 0, 0.25), (1.0, 0.45, 0.06), F('#d9473f'), sled, 0.02)
    for sy in (-0.2, 0.2):
        prim('torus', 'runner', (0.45, sy, 0.15), (0.12, 0.12, 0.12), (math.pi / 2, 0, 0), mat=F('#c9ccd4'), parent=sled, segs=12, minor=0.2)
        box('runner_bar', (0, sy, 0.05), (1.0, 0.03, 0.03), F('#c9ccd4'), sled, 0)
    return {'night': S.night_of(tod)}


def set_desert(tod, rng, props):
    S.sky_layers(tod, rng, moon_at=(-6.0, 20, 7.6), stars_hanging=False, props=props)
    night = tod['stars'] > 0
    K.hills(17, 0.0, 80, 2.4, ['#e8b878', '#f0c88a'] if not night else ['#6a5478', '#7a6488'], 0.6, 'dunes', waves=1.6)
    K.hills(12, 0.0, 80, 1.2, ['#f2cf94', '#f6d8a4'] if not night else ['#7a6488', '#8a7498'], 2.2, 'dunes_near', waves=2.4)
    # a flat-topped mesa
    me = K.outline_obj('mesa', [(-3.0, 0), (3.2, 0), (2.4, 3.2), (-2.2, 3.2)], 1.0, F('#c8744a' if not night else '#5a4060'), bevel=0.08)
    me.location = (-7.5, 15.5, -0.3)
    box('desert_ground', (0, 0, -0.08), (40, 20, 0.16), F('#f2d29a' if not night else '#7a6a8a', fuzz=1.4), None, 0)
    for k, (x, y, h) in enumerate(((-5.2, 4.0, 1.8), (5.6, 5.0, 2.2), (8.5, 8.0, 1.6), (-8.0, 8.5, 2.0))):
        cactus(f'cactus{k}', x, y, h, '#5a9a5a' if not night else '#2f5a4a', rng)
    rb = P.Batch('desert_rocks')
    for k in range(8):
        x, y = rng.uniform(-9, 9), rng.uniform(2, 9)
        if abs(x) < 3.5 and y < 2:
            continue
        s = rng.uniform(0.2, 0.5)
        rb.add('sphere', (x, y, 0), (s, s * 0.8, s * 0.55), mat=F(rng.choice(['#c8945a', '#b47e4a'])), segs=12)
    rb.done()
    return {'night': S.night_of(tod)}


def cactus(name, x, y, h, col, rng):
    root = K.empty(name, (x, y, 0))
    c = F(col)
    prim('cyl', 'cactus_trunk', (0, 0, h / 2), (0.24, 0.24, h / 2), mat=c, parent=root, segs=14)
    prim('sphere', 'cactus_top', (0, 0, h), (0.24, 0.24, 0.2), mat=c, parent=root, segs=14)
    for sx in (-1, 1):
        zz = h * rng.uniform(0.35, 0.6)
        prim('cyl', 'cactus_arm', (sx * 0.38, 0, zz), (0.13, 0.13, 0.18), (0, math.pi / 2, 0), mat=c, parent=root, segs=10)
        prim('cyl', 'cactus_up', (sx * 0.52, 0, zz + 0.3), (0.13, 0.13, 0.32), mat=c, parent=root, segs=10)
        prim('sphere', 'cactus_up_top', (sx * 0.52, 0, zz + 0.62), (0.13, 0.13, 0.11), mat=c, parent=root, segs=10)
    prim('sphere', 'cactus_flower', (0.05, -0.15, h + 0.12), (0.08, 0.06, 0.06), mat=F('#f2799a'), parent=root, segs=8)
    return root


def set_dinosaur_valley(tod, rng, props):
    S.sky_layers(tod, rng, moon_at=(6.0, 20, 7.8), stars_hanging=False, props=props)
    night = tod['stars'] > 0
    # a friendly volcano with a glowing top and slow smoke puffs
    vol = K.outline_obj('volcano', [(-5.5, 0), (5.5, 0), (1.3, 5.2), (-1.3, 5.2)], 0.6, F('#7a5a6a' if not night else '#4a3a5a'), bevel=0.1)
    vol.location = (4.0, 17.5, -0.4)
    lava = K.outline_obj('lava', [(-1.3, 5.2), (1.3, 5.2), (0.9, 4.5), (0.4, 4.9), (0, 4.1), (-0.5, 4.8), (-0.9, 4.4)], 0.62, F('#ff8a3d', emit=2.0, emit_color='#ff7a2d'), bevel=0.05)
    lava.location = (4.0, 17.45, -0.4)
    for k in range(4):
        puff = prim('sphere', 'smoke', (4.0, 17.3, 5.3), (0.6, 0.3, 0.5), mat=K.paper('#c8c0d0' if not night else '#6a6080', emit=0.2), segs=12)
        K.anim(lambda t, f, o=puff, k=k: (setattr(o.location, 'z', 5.1 + ((t * 0.15 + k / 4) % 1.0) * 3.0), setattr(o.location, 'x', 4.0 + ((t * 0.15 + k / 4) % 1.0) * 1.5),
                                          setattr(o.scale, 'x', 0.5 + ((t * 0.15 + k / 4) % 1.0) * 0.6)))
    greens = ['#3f8a55', '#4f9a63', '#6aa673'] if not night else ['#1f5a46', '#2b6b52']
    K.hills(14, 0.0, 80, 3.0, ['#7fb886', '#93c48a'] if not night else ['#2a4a70', '#30577c'], 0.9, 'farhills')
    _ground(tod, '#8cbf6a', '#26402f', '#6f9a5a')
    for k in range(6):
        palm(f'dpalm{k}', rng.choice([-1, 1]) * rng.uniform(5.5, 11), rng.uniform(6, 11), rng.uniform(2.6, 4.0), rng.uniform(-0.3, 0.3), rng.choice(greens), rng)
    # ferns, big rocks, a nest of eggs
    for k in range(10):
        x = rng.choice([-1, 1]) * rng.uniform(3.8, 8)
        y = rng.uniform(1.5, 6)
        fern = K.empty('fern', (x, y, 0))
        for j in range(6):
            fr = K.outline_obj('frond', [(0, 0)] + [(0.08 * math.sin(i), i * 0.12) for i in range(1, 9)] + [(0, 1.1)] + [(-0.08 * math.sin(i), i * 0.12) for i in range(8, 0, -1)], 0.02, F(rng.choice(greens)), bevel=0.005)
            fr.parent = fern
            fr.rotation_euler = (0, -1.0 + j * 0.4, 0)
    nest = K.empty('nest', (-2.6, 3.4, 0))
    prim('torus', 'nest_ring', (0, 0, 0.12), (0.5, 0.5, 0.5), mat=F('#a27a45', fuzz=1.5), parent=nest, segs=20, minor=0.3)
    for k, (dx, dy) in enumerate(((-0.15, 0), (0.15, 0.05), (0, -0.15))):
        prim('sphere', 'egg', (dx, dy, 0.22), (0.13, 0.13, 0.17), mat=F(['#f6efdc', '#d8eef0', '#f6e0e8'][k]), parent=nest, segs=12)
    rb = P.Batch('dino_rocks')
    for k in range(5):
        x = rng.choice([-1, 1]) * rng.uniform(5, 9)
        s = rng.uniform(0.6, 1.2)
        rb.add('sphere', (x, rng.uniform(4, 8), 0), (s, s * 0.8, s * 0.6), mat=F('#8f8aa8'), segs=14)
    rb.done()
    return {'night': S.night_of(tod)}


OUTDOOR_SETS = {
    'playground': set_playground, 'garden': set_garden, 'campsite': set_campsite, 'farm': set_farm, 'zoo': set_zoo,
    'basketball_court': set_basketball_court, 'baseball_field': set_baseball_field, 'swimming_pool': set_swimming_pool,
    'city': set_city, 'train_station': set_train_station, 'airport': set_airport, 'beach': set_beach, 'river': set_river,
    'underwater': set_underwater, 'pirate_ship': set_pirate_ship, 'space': set_space, 'castle': set_castle,
    'jungle': set_jungle, 'snowy_mountain': set_snowy_mountain, 'desert': set_desert, 'dinosaur_valley': set_dinosaur_valley,
}
