"""Felt-and-paper sets for the Story Builder: every place a story can happen.

SETS: name -> fn(tod, rng, props) that builds the scenery for one time of day. `tod` is render_story's TIMES entry
(sky colours, stars, moon, light colours); `props` the scene's props (some sets add a prop of their own when asked).
A set may return a dict of stage hints: {'z0': floor height where the characters stand, 'water': True, ...}.
Every name is listed in server/stories/blender/catalog.json (a test checks both ways).

The look follows feltkit: felt on everything soft, paper for the backdrops and cut-outs, layers stacked like a
cardboard theatre, glows for lamps and windows. Everything that is far away stays simple (a few hundred faces).
"""
import math

import bpy

import feltkit as K
import felt_props as P

F = K.felt
prim = K.prim
box = P.box


def night_of(tod):
    return tod['stars'] > 0.5


def lit_of(tod):
    """Windows and lamps glow at dusk and at night."""
    return tod['stars'] > 0


# ---------------------------------------------------------------- shared pieces
def sky_layers(tod, rng, moon_at=(-6.5, 20, 7.2), clouds=True, many_stars=False, stars_hanging=True, props=()):
    K.backdrop(tod['top'], tod['bottom'])
    if tod['stars'] > 0:
        K.star_field(rng, count=int((420 if many_stars else 300) * tod['stars']))
    if tod['moon']:
        K.moon(moon_at[0], moon_at[2], moon_at[1])
    if clouds:
        night = tod['stars'] > 0
        cols = ('#eef2fd', '#c6d3f3', '#9fb3e3') if night else ('#ffffff', '#e8f1fb', '#cfe0f4')
        K.cloud('cloudA', moon_at[0] + 1.0, 4.4, 18.5, 9.0, 1.9, rng, cols, drift=0.05)
        K.cloud('cloudB', 9.5, 6.8, 19.0, 7.5, 1.4, rng, cols, drift=-0.04)
        K.cloud('cloudC', -11.5, 2.6, 16.0, 7.0, 1.3, rng, cols, drift=0.03)
        K.cloud('cloudD', 3.0, 9.5, 20.5, 6.0, 1.1, rng, cols, drift=0.02)
    if stars_hanging and tod['stars'] > 0:
        spots = [(-8.5, 5.2, 12), (-4.6, 7.3, 9), (-1.2, 4.6, 14), (2.2, 6.4, 10), (5.0, 8.2, 13), (8.8, 5.9, 11), (-11, 7.6, 15), (11.5, 8.0, 15)]
        for i, (x, z, y) in enumerate(spots):
            K.hanging_star(f'hstar{i}', x + rng.uniform(-0.4, 0.4), z + rng.uniform(-0.4, 0.4), y, rng.uniform(0.32, 0.5), 22, rng)
            if rng.random() < 0.45:  # a pair on one thread, like the reference
                K.hanging_star(f'hstar{i}b', x + rng.uniform(-0.1, 0.1), z + 0.9, y + 0.05, rng.uniform(0.25, 0.32), 22, rng)


def fireflies(rng, n=18):
    for i in range(n):
        ob = prim('sphere', f'fly{i}', (rng.uniform(-8, 8), rng.uniform(1, 8), rng.uniform(0.6, 3.5)), (0.05, 0.05, 0.05), mat=K.glow('#ffe58a', 8.0), segs=8)
        x0, z0, ph = ob.location.x, ob.location.z, rng.uniform(0, 6.28)
        K.anim(lambda t, f, o=ob, x0=x0, z0=z0, ph=ph: (setattr(o.location, 'x', x0 + math.sin(t * 0.5 + ph) * 0.6),
                                                       setattr(o.location, 'z', z0 + math.sin(t * 0.8 + ph * 2) * 0.3)))


def day_night(tod, day, night, dusk=None):
    """Pick a colour for the time of day."""
    if tod['stars'] > 0.5:
        return night
    if tod['stars'] > 0:
        return dusk or night
    return day


def lamp(name, loc, energy, color=(1, 0.8, 0.55), size=0.5):
    l = bpy.data.lights.new(name, 'POINT')
    l.energy = energy
    l.color = color
    l.shadow_soft_size = size
    lo = bpy.data.objects.new(name, l)
    K.link(lo)
    lo.location = loc
    return lo


# ---------------------------------------------------------------- the first five sets
def set_lighthouse(tod, rng, props):
    sky_layers(tod, rng, moon_at=(-6.5, 20, 6.4), props=props)
    K.sea(14, 0.9, 70, rows=6)
    K.hills(17, 0.4, 70, 1.6, ['#2f4f8a', '#3a5c96'], 0.9, 'farhills', waves=2.5)
    K.rocks(4.9, 11.8, 0.2, 3.0, rng)
    K.lighthouse(4.9, 12.0, 0.35, h=2.9, beam=True)
    K.ground(-7.0, 0.0, 60, 10.0, '#c7a77a' if tod['stars'] == 0 else '#2f3b6a', rng, tufts=('#3f5f86', '#4a6b8f'), pebbles=('#5b6085', '#6b7095'))
    if 'boat' in props:
        K.boat(-6.0, 9.0, 0.35)
    return {'used': ['boat']}


def set_village(tod, rng, props):
    sky_layers(tod, rng, moon_at=(6.5, 20, 7.0), props=props)
    K.hills(16, 0.0, 80, 3.2, ['#2c4f80', '#35608c', '#3f6f96'] if tod['stars'] else ['#7fb27a', '#93c48a', '#a8d39b'], 0.3, 'farhills')
    lit = tod['stars'] > 0
    cols = [('#f3d9b1', '#b9473f'), ('#d8e4f0', '#3f6db9'), ('#f6e3a1', '#7a4f9a'), ('#f0c9b4', '#4f8a5b'), ('#e9d6f0', '#c25a6a')]
    for i, x in enumerate([-7.5, -4.2, -1.0, 2.6, 6.2]):
        w, r = cols[i % len(cols)]
        K.house(f'house{i}', x, 7.5 + (i % 2) * 1.6, 0.1, 1.5 + rng.uniform(-0.2, 0.3), 1.3 + rng.uniform(-0.2, 0.4), w, r, lit)
    for i in range(7):
        K.tree(f'tree{i}', rng.uniform(-12, 12), rng.uniform(9.5, 12), 0.3, rng.uniform(1.4, 2.4), rng.choice(['pine', 'round']), rng.choice(['#2f6b4f', '#3f7f5a', '#4d8c63']), rng)
    K.ground(-7.0, 0.0, 60, 14.0, '#2c4a44' if lit else '#7db86c', rng)
    if 'lantern' in props:
        K.lantern(-1.6, 0.6, 0.0)
    return {'used': ['lantern']}


def set_forest(tod, rng, props):
    sky_layers(tod, rng, moon_at=(-5.5, 20, 7.6), clouds=True, props=props)
    night = tod['stars'] > 0
    K.hills(17, 0.0, 80, 3.6, ['#2a4a70', '#30577c'] if night else ['#6aa673', '#7fb886'], 1.2, 'farhills')
    greens = ['#1f5a46', '#2b6b52', '#2f7a58', '#3c8a62'] if night else ['#3f8a55', '#4e9b60', '#5aa86a', '#2f7a4a']
    for layer, (y, n, hmin, hmax) in enumerate([(13, 14, 2.6, 3.6), (9.5, 11, 2.2, 3.2), (6.5, 7, 1.8, 2.8), (3.5, 4, 1.6, 2.4)]):
        for i in range(n):
            x = -14 + 28 * (i + rng.uniform(0.1, 0.9)) / n
            if layer == 3 and abs(x) < 3.2:
                continue
            K.tree(f'ft{layer}_{i}', x, y + rng.uniform(-0.6, 0.6), 0.1, rng.uniform(hmin, hmax), rng.choice(['pine', 'pine', 'round']), greens[(layer + i) % len(greens)], rng)
    K.ground(-7.0, 0.0, 60, 12.0, '#26402f' if night else '#6fa862', rng, tufts=('#2f6b4f', '#3c7a55'))
    if night or 'fireflies' in props:
        fireflies(rng)
    return {'used': ['fireflies']}


def set_meadow(tod, rng, props):
    sky_layers(tod, rng, moon_at=(6.0, 20, 7.4), props=props)
    night = tod['stars'] > 0
    K.hills(15, 0.0, 80, 3.0, ['#4a5a92', '#55689c', '#6276a6'] if night else ['#8cc77f', '#9fd28f', '#b5dd9f'], 2.0, 'farhills', waves=2.2)
    K.tree('bigtree', 6.5, 5.0, 0.2, 3.6, 'round', '#3f7f5a' if night else '#5aa86a', rng)
    flower_cols = ['#f29aa6', '#fbe28a', '#ffffff', '#b8a4f0']
    for i in range(40):
        x, y = rng.uniform(-12, 12), rng.uniform(-0.8, 6)
        if abs(x) < 3.4 and y < 1.5:
            continue
        prim('cyl', f'flower{i}', (x, y, 0.06), (0.09, 0.09, 0.02), (math.pi / 2 - 0.3, 0, 0), mat=F(rng.choice(flower_cols)), segs=10)
    K.ground(-7.0, 0.0, 60, 14.0, '#3f5577' if night else '#7db86c', rng)
    if night:
        fireflies(rng, 10)
        return {'used': ['fireflies']}


def set_sky(tod, rng, props):
    sky_layers(tod, rng, moon_at=(5.5, 18, 6.5), many_stars=True, props=props)
    night = tod['stars'] > 0
    cols = ('#e6ecfb', '#c3d0f1', '#9bb0e0') if night else ('#ffffff', '#eef4fb', '#d6e4f4')
    K.cloud('standcloud', 0.0, -1.0, -0.6, 14.0, 1.3, rng, cols)
    K.cloud('midcloud1', -8.0, 1.0, 8.0, 8.0, 1.6, rng, cols, drift=0.04)
    K.cloud('midcloud2', 9.0, 2.0, 10.0, 7.0, 1.4, rng, cols, drift=-0.04)


# ---------------------------------------------------------------- sports
def crowd(name, x0, x1, y, z, rng, rows=3, step=0.55, row_dy=0.7, row_dz=0.45, night=False):
    """A felt crowd on a stand: little round heads over coloured shirts, each row one mesh, bobbing together."""
    skins = ['#f7dccb', '#efc4a4', '#d9a179', '#c08758', '#946040', '#5f3b26']
    shirts = ['#d9473f', '#3f74c9', '#f2c94c', '#4f9d5d', '#ffffff', '#ec8db0', '#ee8a33', '#8459b8']
    hairs = ['#efc75e', '#7a4a2b', '#2b2427', '#c8562e']
    for r in range(rows):
        row = K.empty(f'{name}_row{r}', (0, y + r * row_dy, z + r * row_dz))
        b = P.Batch(f'{name}_fans{r}')
        n = int((x1 - x0) / step)
        for i in range(n):
            x = x0 + (i + 0.5) * (x1 - x0) / n + rng.uniform(-0.08, 0.08)
            sc = rng.uniform(0.85, 1.05)
            shirt = F(rng.choice(shirts))
            b.add('sphere', (x, 0, 0.2 * sc), (0.2 * sc, 0.15, 0.22 * sc), mat=shirt, segs=10)
            b.add('sphere', (x, -0.02, 0.52 * sc), (0.14 * sc, 0.13, 0.14 * sc), mat=F(rng.choice(skins), fuzz=0.6), segs=10)
            b.add('sphere', (x, 0.03, 0.6 * sc), (0.145 * sc, 0.12, 0.09 * sc), mat=F(rng.choice(hairs)), segs=8)
            if rng.random() < 0.35:
                b.add('sphere', (x + 0.17, -0.02, 0.55 * sc), (0.05, 0.05, 0.17), (0, -0.4, 0), mat=shirt, segs=6)
        b.done(row)
        ph = rng.uniform(0, 6)
        z0 = row.location.z
        K.anim(lambda t, f, o=row, z0=z0, ph=ph: setattr(o.location, 'z', z0 + max(0.0, math.sin(t * 3.2 + ph)) * 0.06))


def stand(name, x0, x1, y, rng, tiers=3, color='#5a6b93', night=False, people=True):
    w = x1 - x0
    for k in range(tiers):
        box(f'{name}_tier', ((x0 + x1) / 2, y + k * 0.7, 0.25 + k * 0.45), (w, 0.75, 0.5 + k * 0.9), F(color if k % 2 == 0 else '#6a7ba3'), None, 0.05)
    box(f'{name}_roof', ((x0 + x1) / 2, y + tiers * 0.7 - 0.2, 2.9), (w + 0.4, 2.4, 0.12), F('#e9e3d6'), None, 0.04, rot=(-0.12, 0, 0))
    for sx in (x0 + 0.1, x1 - 0.1):
        prim('cyl', f'{name}_post', (sx, y + tiers * 0.7 - 0.1, 1.5), (0.06, 0.06, 1.5), mat=F('#e9e3d6'), segs=8)
    if people:
        crowd(f'{name}_crowd', x0 + 0.2, x1 - 0.2, y - 0.1, 0.5, rng, rows=tiers, night=night)


def floodlight(name, x, y, h, night):
    prim('cyl', f'{name}_pole', (x, y, h / 2), (0.08, 0.08, h / 2), mat=F('#9aa3b5'), segs=8)
    box(f'{name}_head', (x, y - 0.1, h + 0.3), (1.0, 0.15, 0.6), F('#3a3346'), None, 0.04)
    for i in range(3):
        for j in range(2):
            prim('sphere', f'{name}_bulb', (x - 0.32 + i * 0.32, y - 0.2, h + 0.15 + j * 0.3), (0.12, 0.05, 0.12),
                 mat=K.glow('#fff6d8', 8.0) if night else F('#e9e3d6'), segs=10)
    if night:
        lamp(f'{name}_lamp', (x * 0.8, y - 2.5, h), 1600, (1.0, 0.96, 0.85), 2.0)


def goal(name, x, y, w=3.2, h=1.5, depth=1.0, rot=0.0, color='#ffffff'):
    root = K.empty(name, (x, y, 0))
    root.rotation_euler.z = rot
    post = F(color, sheen=0.3)
    for sx in (-1, 1):
        prim('cyl', f'{name}_post', (sx * w / 2, 0, h / 2), (0.06, 0.06, h / 2), mat=post, parent=root, segs=10)
        prim('cyl', f'{name}_back', (sx * w / 2, depth, h * 0.35), (0.03, 0.03, h * 0.35), mat=post, parent=root, segs=6)
    prim('cyl', f'{name}_bar', (0, 0, h), (0.06, 0.06, w / 2 + 0.06), (0, math.pi / 2, 0), mat=post, parent=root, segs=10)
    # the net: a grid of felt cords (a wireframe), back panel and a sloping roof
    net = K.paper('#f4f1ea', emit=0.15)
    b = P.Batch(f'{name}_net')
    for k in range(13):
        xx = -w / 2 + w * k / 12
        b.add('cyl', (xx, depth * 0.5, h * 0.5), (0.008, 0.008, math.hypot(h, depth) / 2), (math.atan2(depth, h), 0, 0), mat=net, segs=4, smooth=False)
    for k in range(6):
        zz = h * (k + 0.5) / 6
        yy = depth * (1 - zz / h) * 0.95 + 0.03
        b.add('cyl', (0, yy, zz), (0.008, 0.008, w / 2), (0, math.pi / 2, 0), mat=net, segs=4, smooth=False)
    b.done(root)
    return root


def grass_stripes(x0, x1, y0, y1, n, cols, z=0.0, name='stripes'):
    b = P.Batch(name)
    for k in range(n):
        ya = y0 + (y1 - y0) * k / n
        b.add('cube', ((x0 + x1) / 2, ya + (y1 - y0) / n / 2, z - 0.05), ((x1 - x0) / 2, (y1 - y0) / n / 2 + 0.005, 0.05), mat=F(cols[k % 2], fuzz=0.9, sheen=0.2))
    return b.done()


def line(b, a, c, z=0.005, w=0.07, mat=None):
    """A painted line on the ground, added to the batch b."""
    (ax, ay), (bx, by) = a, c
    L = math.hypot(bx - ax, by - ay)
    b.add('cube', ((ax + bx) / 2, (ay + by) / 2, z), (L / 2 + w / 2, w / 2, 0.006), (0, 0, math.atan2(by - ay, bx - ax)), mat=mat)


def arc(b, cx, cy, r, a0, a1, z=0.005, w=0.07, mat=None, n=24):
    pts = [(cx + math.cos(a0 + (a1 - a0) * i / n) * r, cy + math.sin(a0 + (a1 - a0) * i / n) * r) for i in range(n + 1)]
    for i in range(n):
        line(b, pts[i], pts[i + 1], z, w, mat)


def set_soccer_field(tod, rng, props):
    night = night_of(tod)
    sky_layers(tod, rng, moon_at=(-8.0, 20, 8.0), stars_hanging=False, props=props)
    K.hills(18, 0.0, 80, 2.4, day_night(tod, ['#86bf7a', '#9bcd8c'], ['#2c4f80', '#35608c']), 0.7, 'farhills')
    grass = day_night(tod, ('#5fae5a', '#6dbb63'), ('#2f5e46', '#356a4d'), ('#4f8f52', '#5a9c5a'))
    grass_stripes(-16, 16, -6, 12, 9, grass)
    chalk = F('#fbfbf6', fuzz=0.5, emit=0.25 if night else 0.0, emit_color='#ffffff')
    # the goal at the back, its penalty box and arc, the halfway line in front, a corner arc
    b = P.Batch('pitch_lines')
    line(b, (-14, 10.5), (14, 10.5), mat=chalk)
    line(b, (-3.6, 7.6), (3.6, 7.6), mat=chalk)
    line(b, (-3.6, 7.6), (-3.6, 10.5), mat=chalk)
    line(b, (3.6, 7.6), (3.6, 10.5), mat=chalk)
    line(b, (-2.2, 9.5), (2.2, 9.5), mat=chalk)
    arc(b, 0, 8.6, 1.6, math.pi + 0.9, 2 * math.pi - 0.9, mat=chalk)
    line(b, (-14, -1.5), (14, -1.5), mat=chalk)
    arc(b, 0, -1.5, 2.2, 0.0, math.pi, mat=chalk, n=28)
    b.add('cyl', (0, 8.6, 0.01), (0.09, 0.09, 0.01), mat=chalk, segs=12)
    b.done()
    goal('goal', 0, 10.5, 3.6, 1.7, 1.0)
    for sx in (-1, 1):
        prim('cyl', 'corner_flagpole', (sx * 9.5, 10.5, 0.45), (0.025, 0.025, 0.45), mat=F('#f4f1ea'), segs=6)
        fl = K.outline_obj('corner_flag', [(0, 0), (0.35, -0.12), (0, -0.25)], 0.015, F('#f2c94c'), bevel=0.004)
        fl.location = (sx * 9.5, 10.5, 0.9)
    # stands behind, full of fans; flood lights at the corners
    stand('standL', -13.5, -3.0, 12.6, rng, 3, night=night)
    stand('standR', 3.0, 13.5, 12.6, rng, 3, night=night)
    box('hoarding', (0, 11.8, 0.3), (28, 0.12, 0.6), F('#3f74c9'), None, 0.03)
    for k in range(7):
        box('hoarding_panel', (-12 + k * 4, 11.73, 0.3), (2.6, 0.02, 0.4), F(['#f2c94c', '#ffffff', '#d9473f'][k % 3]), None, 0.01)
    for sx in (-1, 1):
        floodlight(f'flood{sx}', sx * 11.5, 13.5, 6.0, lit_of(tod))
    if night:
        lamp('pitch_glow', (0, 2, 6), 2200, (1.0, 0.97, 0.9), 4.0)
    return {'floor': 'grass'}


SETS = {'lighthouse': set_lighthouse, 'village': set_village, 'forest': set_forest, 'meadow': set_meadow, 'sky': set_sky,
        'soccer_field': set_soccer_field}

# the rest live in their own files (they import the shared pieces above)
import felt_sets_outdoor  # noqa: E402
import felt_sets_rooms  # noqa: E402

SETS.update(felt_sets_rooms.ROOM_SETS)
SETS.update(felt_sets_outdoor.OUTDOOR_SETS)
