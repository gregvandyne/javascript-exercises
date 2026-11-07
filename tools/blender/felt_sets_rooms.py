"""Indoor sets for the Story Builder kit (felt_sets.py imports these into SETS): a classroom, a bedroom, a kitchen, a
library, a doctor's room, a party room, a theatre stage and a bakery.

A room is a paper-wallpapered back wall with a window that shows the time of day outside (sky, sun or moon and
stars), a felt floor, and furniture; at dusk and night the lamps come on (a glow plus a warm light).
"""
import math

import feltkit as K
import felt_props as P

F = K.felt
prim = K.prim
box = P.box
WALL_Y = 6.0


def _sky_window(x, z, w, h, tod, rng, name='window', curtains='#e9a9b7', frame='#f4f1ea'):
    """A window in the back wall: the time of day outside, a felt frame with a cross bar, felt curtains."""
    sky = K.mesh_obj(f'{name}_sky', [(-w / 2, 0, -h / 2), (w / 2, 0, -h / 2), (w / 2, 0, h / 2), (-w / 2, 0, h / 2)], [(0, 1, 2, 3)], K.sky_material(tod['top'], tod['bottom']))
    sky.location = (x, WALL_Y - 0.02, z)
    if tod['stars'] > 0:
        b = P.Batch(f'{name}_stars')
        for _ in range(int(14 * tod['stars'])):
            b.add('sphere', (x + rng.uniform(-w / 2 + 0.1, w / 2 - 0.1), WALL_Y - 0.04, z + rng.uniform(-h / 2 + 0.1, h / 2 - 0.1)), (0.03, 0.01, 0.03), mat=K.glow('#fff6d8', 3.0), segs=6)
        b.done()
    if tod['moon']:
        prim('cyl', f'{name}_moon', (x + w * 0.22, WALL_Y - 0.05, z + h * 0.2), (0.22, 0.22, 0.02), (math.pi / 2, 0, 0), mat=F('#fff1c2', emit=1.6, emit_color='#ffe7a3'), segs=24)
    elif tod['stars'] == 0:
        prim('cyl', f'{name}_sun', (x - w * 0.22, WALL_Y - 0.05, z + h * 0.22), (0.24, 0.24, 0.02), (math.pi / 2, 0, 0), mat=F('#ffd25e', emit=1.5, emit_color='#ffcf4d'), segs=24)
        K.cloud(f'{name}_cloud', x + w * 0.1, z - h * 0.1, WALL_Y - 0.06, w * 0.5, h * 0.2, rng, ('#ffffff', '#e8f1fb'), glow_k=0.6)
    fr = F(frame)
    b = P.Batch(f'{name}_frame')
    for sx in (-1, 1):
        b.add('cube', (x + sx * w / 2, WALL_Y - 0.08, z), (0.07, 0.07, h / 2 + 0.07), mat=fr)
    for sz in (-1, 1):
        b.add('cube', (x, WALL_Y - 0.08, z + sz * h / 2), (w / 2 + 0.07, 0.07, 0.07), mat=fr)
    b.add('cube', (x, WALL_Y - 0.08, z), (0.035, 0.05, h / 2), mat=fr)
    b.add('cube', (x, WALL_Y - 0.08, z), (w / 2, 0.05, 0.035), mat=fr)
    b.add('cube', (x, WALL_Y - 0.2, z - h / 2 - 0.08), (w / 2 + 0.2, 0.2, 0.05), mat=fr)
    b.done()
    if curtains:
        for sx in (-1, 1):
            c = K.outline_obj(f'{name}_curtain', [(0, 0), (0.55, 0), (0.45, -h * 0.55), (0.6, -h - 0.25), (0, -h - 0.25)], 0.06, F(curtains), bevel=0.02)
            c.location = (x + sx * (w / 2 + 0.1), WALL_Y - 0.25, z + h / 2 + 0.2)
            c.scale.x = -sx
    # daylight through the window
    if tod['stars'] == 0:
        l = K.bpy.data.lights.new(f'{name}_light', 'AREA')
        l.energy = 500
        l.size = max(w, h)
        l.color = (1.0, 0.96, 0.88)
        lo = K.bpy.data.objects.new(f'{name}_light', l)
        K.link(lo)
        lo.location = (x, WALL_Y - 0.5, z)
        lo.rotation_euler = (-math.pi / 2, 0, 0)


def room(tod, rng, wall='#f6e3c4', pattern='stripes', accent='#efd2a8', floor='wood', floor_col=('#c79a5b', '#b9884c'),
         window=(3.2, 2.8, 2.2, 2.0), lamp=True, skirting='#a27a45'):
    """The shell of a room. -> {'night': bool} (lamps on)."""
    lit = tod['stars'] > 0
    w = K.mesh_obj('wall', [(-16, 0, -1), (16, 0, -1), (16, 0, 9), (-16, 0, 9)], [(0, 1, 2, 3)], K.paper(wall, tooth=1.4))
    w.location.y = WALL_Y
    b = P.Batch('wallpaper')
    acc = K.paper(accent)
    if pattern == 'stripes':
        for k in range(-16, 17):
            b.add('cube', (k * 1.0, WALL_Y - 0.01, 4.0), (0.16, 0.005, 5.0), mat=acc)
    elif pattern == 'dots':
        for i in range(-14, 15):
            for j in range(0, 8):
                b.add('cyl', (i * 1.0 + (j % 2) * 0.5, WALL_Y - 0.01, j * 0.9 + 0.5), (0.1, 0.1, 0.005), (math.pi / 2, 0, 0), mat=acc, segs=10)
    elif pattern == 'stars':
        for i in range(-14, 15):
            for j in range(0, 8):
                b.add('cone', (i * 1.1 + (j % 2) * 0.55, WALL_Y - 0.01, j * 0.95 + 0.6), (1, 1, 0.005), (math.pi / 2, 0, 0.3 * j), mat=acc, segs=5, r1=0.12, r2=0.12)
    elif pattern == 'tiles':
        for i in range(-16, 17):
            for j in range(0, 10):
                b.add('cube', (i * 0.62 + (j % 2) * 0.31, WALL_Y - 0.01, j * 0.62 + 0.31), (0.29, 0.005, 0.29), mat=acc if (i + j) % 3 else K.paper(wall))
    b.add('cube', (0, WALL_Y - 0.04, 0.12), (16, 0.04, 0.12), mat=F(skirting))
    b.done()
    # floor
    fb = P.Batch('floor')
    if floor == 'wood':
        for k in range(-24, 25):
            fb.add('cube', (k * 0.6, 0, -0.05), (0.29, 7.5, 0.05), mat=F(floor_col[k % 2], fuzz=0.6, sheen=0.3))
    elif floor == 'tiles':
        for i in range(-14, 15):
            for j in range(-8, 7):
                fb.add('cube', (i * 1.0, j * 1.0 + 0.5, -0.05), (0.49, 0.49, 0.05), mat=F(floor_col[(i + j) % 2], fuzz=0.4, sheen=0.3))
    else:
        fb.add('cube', (0, -1, -0.05), (16, 7.5, 0.05), mat=F(floor_col[0], fuzz=1.2))
    fb.done()
    if window:
        _sky_window(*window, tod, rng)
    if lamp and lit:
        for sx in (-3.5, 3.5):
            prim('cyl', 'lamp_cord', (sx, 3.5, 6.2), (0.012, 0.012, 1.4), mat=F('#3a3346'), segs=4)
            prim('cone', 'lamp_shade', (sx, 3.5, 4.7), (1, 1, 0.22), mat=F('#f2c94c', emit=0.8, emit_color='#ffd27a'), segs=16, r1=0.42, r2=0.14)
            prim('sphere', 'lamp_bulb', (sx, 3.5, 4.5), (0.12, 0.12, 0.12), mat=K.glow('#fff1c2', 6.0), segs=10)
            l = K.bpy.data.lights.new('room_lamp', 'POINT')
            l.energy = 700
            l.color = (1.0, 0.82, 0.6)
            l.shadow_soft_size = 0.6
            lo = K.bpy.data.objects.new('room_lamp', l)
            K.link(lo)
            lo.location = (sx, 2.5, 4.2)
    else:
        l = K.bpy.data.lights.new('room_fill', 'AREA')
        l.energy = 900
        l.size = 10
        l.color = (1.0, 0.95, 0.88)
        lo = K.bpy.data.objects.new('room_fill', l)
        K.link(lo)
        lo.location = (0, -3, 7)
        lo.rotation_euler = (0.3, 0, 0)
    return {'night': tod['stars'] > 0.5, 'indoor': True}


def rug(x, y, rx, ry, cols, name='rug'):
    for k, c in enumerate(cols):
        s = 1 - k * 0.22
        prim('cyl', name, (x, y, 0.012 + k * 0.006), (rx * s, ry * s, 0.012), mat=F(c, fuzz=1.3), segs=40)


def bookshelf(x, y, w=2.0, h=2.6, rng=None, name='shelf', wood='#a27a45'):
    b = P.Batch(name)
    wd = F(wood)
    rows = max(2, int(h / 0.62))
    b.add('cube', (x, y + 0.2, h / 2), (w / 2, 0.02, h / 2), mat=F('#8a6538'))
    for sx in (-1, 1):
        b.add('cube', (x + sx * w / 2, y, h / 2), (0.05, 0.22, h / 2), mat=wd)
    cols = ['#d9473f', '#3f74c9', '#4f9d5d', '#f2c94c', '#8459b8', '#ee8a33', '#2f9c9a', '#ec8db0']
    for r in range(rows + 1):
        z = r * h / rows
        b.add('cube', (x, y, z), (w / 2, 0.22, 0.035), mat=wd)
        if r == rows:
            break
        xx = x - w / 2 + 0.1
        while xx < x + w / 2 - 0.12:
            bw = rng.uniform(0.07, 0.13) if rng else 0.1
            bh = (rng.uniform(0.33, 0.5) if rng else 0.42)
            tilt = (rng.uniform(-0.15, 0.15) if (rng and rng.random() < 0.15) else 0)
            b.add('cube', (xx + bw / 2, y - 0.02, z + 0.035 + bh / 2), (bw / 2 - 0.004, 0.17, bh / 2), (0, tilt, 0), mat=F(rng.choice(cols) if rng else cols[0]))
            xx += bw
    return b.done()


def desk(b, x, y, w=1.1, d=0.6, h=0.6, top='#d9a35a', legs='#3f74c9'):
    b.add('cube', (x, y, h), (w / 2, d / 2, 0.035), mat=F(top))
    for sx in (-1, 1):
        for sy in (-1, 1):
            b.add('cyl', (x + sx * (w / 2 - 0.06), y + sy * (d / 2 - 0.06), h / 2), (0.03, 0.03, h / 2), mat=F(legs), segs=8)


def chair(b, x, y, h=0.38, col='#3f74c9', seat='#d9a35a'):
    b.add('cube', (x, y, h), (0.22, 0.22, 0.03), mat=F(seat))
    b.add('cube', (x, y + 0.2, h + 0.28), (0.22, 0.03, 0.18), mat=F(seat))
    for sx in (-1, 1):
        for sy in (-1, 1):
            b.add('cyl', (x + sx * 0.18, y + sy * 0.18, h / 2), (0.02, 0.02, h / 2), mat=F(col), segs=6)


def clock(x, z, r=0.42):
    prim('cyl', 'clock', (x, WALL_Y - 0.05, z), (r, r, 0.04), (math.pi / 2, 0, 0), mat=F('#fbfbf6'), segs=32)
    prim('torus', 'clock_rim', (x, WALL_Y - 0.08, z), (r, r, r), (math.pi / 2, 0, 0), mat=F('#d9473f'), segs=32, minor=0.08)
    hand = K.empty('clock_hands', (x, WALL_Y - 0.1, z))
    prim('cube', 'clock_hand', (0, 0, r * 0.3), (0.02, 0.01, r * 0.32), mat=F('#2b2427'), parent=hand)
    prim('cube', 'clock_hand2', (r * 0.2, 0, 0), (r * 0.22, 0.01, 0.025), mat=F('#2b2427'), parent=hand)
    K.anim(lambda t, f: setattr(hand.rotation_euler, 'y', t * 0.25))


# ---------------------------------------------------------------- the rooms
def set_classroom(tod, rng, props):
    h = room(tod, rng, wall='#f3ead2', pattern='stripes', accent='#ebdfc0', floor='wood', window=(4.6, 2.9, 2.0, 1.8))
    # chalkboard with chalk doodles: a sum, a sun, a little house
    box('board_frame', (-1.2, WALL_Y - 0.06, 2.6), (4.2, 0.08, 2.0), F('#a27a45'), None, 0.04)
    box('board', (-1.2, WALL_Y - 0.11, 2.6), (3.9, 0.04, 1.75), F('#2f5a4a', fuzz=0.6), None, 0.01)
    chalk = K.paper('#f4f1ea', emit=0.3)
    root = K.empty('doodles', (0, WALL_Y - 0.15, 0))
    for k, n in enumerate((1, None, 1, None, 2)):
        if n is not None:
            P._digit(root, n, -2.6 + k * 0.45, 2.9, 0.4, chalk)
    prim('cube', 'plus', (-2.6 + 0.45, -0.06 + WALL_Y - 0.15, 2.9), (0.12, 0.01, 0.02), mat=chalk)
    prim('cube', 'plus2', (-2.6 + 0.45, -0.06 + WALL_Y - 0.15, 2.9), (0.02, 0.01, 0.12), mat=chalk)
    for dz in (0.05, -0.05):
        prim('cube', 'equals', (-2.6 + 1.35, -0.06 + WALL_Y - 0.15, 2.9 + dz), (0.12, 0.01, 0.02), mat=chalk)
    prim('torus', 'chalk_sun', (0.2, WALL_Y - 0.16, 3.0), (0.25, 0.25, 0.25), (math.pi / 2, 0, 0), mat=chalk, segs=20, minor=0.1)
    hs = K.outline_obj('chalk_house', [(-0.3, 0), (0.3, 0), (0.3, 0.35), (0, 0.6), (-0.3, 0.35)], 0.01, chalk)
    hs.location = (0.2, WALL_Y - 0.16, 2.0)
    box('chalk_tray', (-1.2, WALL_Y - 0.2, 1.68), (3.9, 0.15, 0.05), F('#a27a45'), None, 0.01)
    # alphabet bunting
    cols = ['#d9473f', '#f2c94c', '#3f74c9', '#4f9d5d', '#ec8db0']
    b = P.Batch('abc')
    for k in range(14):
        b.add('cone', (-6.5 + k * 1.0, WALL_Y - 0.1, 4.25), (1, 0.2, 0.3), (math.pi, 0, 0), mat=F(cols[k % 5]), segs=3, r1=0.32, r2=0.0)
    b.done()
    clock(3.1, 4.3)
    # desks and chairs, in rows behind the children
    b = P.Batch('desks')
    for row, y in enumerate((2.6, 4.2)):
        for x in (-4.6, -2.3, 2.3, 4.6):
            desk(b, x + (row * 0.3), y, legs=cols[(row * 2 + int(x)) % 5])
            chair(b, x + (row * 0.3), y + 0.55, col=cols[(row + int(x) + 2) % 5])
    b.done()
    bookshelf(6.6, WALL_Y - 0.35, 2.0, 1.6, rng)
    prim('sphere', 'globe', (6.6, WALL_Y - 0.35, 1.95), (0.28, 0.28, 0.28), mat=F('#4fa8f0'), segs=20)
    prim('sphere', 'globe_land', (6.55, WALL_Y - 0.6, 2.0), (0.14, 0.08, 0.16), mat=F('#66c792'), segs=10)
    return h


def set_bedroom(tod, rng, props):
    h = room(tod, rng, wall='#dfe8f6', pattern='stars', accent='#f6e7a8', floor='wood', floor_col=('#d6b07c', '#c99f6a'), window=(-3.4, 2.8, 2.0, 2.0), lamp=False)
    bed = P.bed(2.0)
    bed.location = (2.8, 3.6, 0)
    rug(-0.3, 1.6, 2.4, 1.0, ('#9bc3e8', '#f6e7a8', '#ec8db0'))
    # a toy shelf, a night light, a star mobile
    b = P.Batch('toyshelf')
    for z in (0.5, 1.2):
        b.add('cube', (-6.0, WALL_Y - 0.3, z), (0.9, 0.22, 0.04), mat=F('#f4f1ea'))
    b.add('cube', (-6.0, WALL_Y - 0.3, 0.25), (0.9, 0.2, 0.25), mat=F('#ec8db0'))
    b.done()
    for k, c in enumerate(('#d9473f', '#4f9d5d', '#3f74c9')):
        box('toy_block', (-6.4 + k * 0.35, WALL_Y - 0.35, 0.65), (0.22, 0.22, 0.22), F(c), None, 0.03)
    t = P.teddy(1.0)
    t.location = (-5.8, WALL_Y - 0.35, 1.24)
    lit = tod['stars'] > 0
    box('nightstand', (5.0, 3.9, 0.3), (0.6, 0.5, 0.6), F('#f4f1ea'), None, 0.04)
    prim('sphere', 'nightlight', (5.0, 3.9, 0.82), (0.2, 0.2, 0.22), mat=K.glow('#ffd27a', 4.0) if lit else F('#f6e7a8'), segs=16)
    if lit:
        l = K.bpy.data.lights.new('nightlight', 'POINT')
        l.energy = 260
        l.color = (1.0, 0.8, 0.55)
        lo = K.bpy.data.objects.new('nightlight', l)
        K.link(lo)
        lo.location = (4.6, 3.2, 1.2)
    mob = K.empty('mobile', (-0.5, 3.0, 5.2))
    for k in range(5):
        a = k * 2 * math.pi / 5
        s = K.outline_obj('mobile_star', K.star_pts(0.18, 0.085), 0.04, F('#f2c94c', emit=0.6 if lit else 0.1, emit_color='#ffcf4d'), bevel=0.01)
        s.parent = mob
        s.location = (math.cos(a) * 0.6, math.sin(a) * 0.6, -0.9 - (k % 2) * 0.3)
    K.anim(lambda tt, f: setattr(mob.rotation_euler, 'z', tt * 0.2))
    if lit:
        l = K.bpy.data.lights.new('moonbeam', 'AREA')
        l.energy = 300
        l.size = 2
        l.color = (0.7, 0.78, 1.0)
        lo = K.bpy.data.objects.new('moonbeam', l)
        K.link(lo)
        lo.location = (-3.4, 5.4, 2.8)
        lo.rotation_euler = (-1.9, 0, 0)
    h['used'] = ['bed']
    h['bed'] = bed  # the stage takes it away when someone in the story sleeps in their own bed
    return h


def set_kitchen(tod, rng, props):
    h = room(tod, rng, wall='#fbf3e3', pattern='tiles', accent='#cfe6f0', floor='tiles', floor_col=('#f4f1ea', '#d9473f'), window=(0.0, 3.1, 2.0, 1.6))
    b = P.Batch('counters')
    for x in (-5.2, -3.6, 3.6, 5.2):
        b.add('cube', (x, WALL_Y - 0.55, 0.5), (0.78, 0.5, 0.5), mat=F('#7fb2a8'))
        b.add('cube', (x, WALL_Y - 0.55, 1.03), (0.8, 0.53, 0.04), mat=F('#f4f1ea'))
        b.add('sphere', (x, WALL_Y - 1.06, 0.8), (0.06, 0.03, 0.03), mat=F('#f2c94c'), segs=8)
        b.add('cube', (x, WALL_Y - 0.25, 3.0), (0.78, 0.25, 0.45), mat=F('#7fb2a8'))
    b.add('cube', (-1.8, WALL_Y - 0.55, 0.5), (0.6, 0.5, 0.5), mat=F('#e9e3d6'))
    b.add('cube', (-1.8, WALL_Y - 1.06, 0.55), (0.42, 0.01, 0.28), mat=F('#3a3346'))
    b.add('cube', (-1.8, WALL_Y - 0.55, 1.03), (0.62, 0.53, 0.04), mat=F('#3a3346'))
    for sx in (-0.25, 0.25):
        b.add('cyl', (-1.8 + sx, WALL_Y - 0.6, 1.08), (0.18, 0.18, 0.01), mat=F('#d9473f'), segs=16)
    b.add('cube', (6.9, WALL_Y - 0.6, 1.3), (0.6, 0.55, 1.3), mat=F('#f4f1ea'))
    b.add('cube', (6.9, WALL_Y - 1.16, 1.75), (0.58, 0.01, 0.02), mat=F('#c9ccd4'))
    b.add('cube', (6.4, WALL_Y - 1.18, 1.4), (0.02, 0.02, 0.3), mat=F('#c9ccd4'))
    b.done()
    pot = prim('cyl', 'pot', (-1.55, WALL_Y - 0.65, 1.25), (0.22, 0.22, 0.17), mat=F('#3f74c9'), segs=16)
    for k in range(3):
        puff = prim('sphere', 'steam', (-1.55, WALL_Y - 0.65, 1.6 + k * 0.3), (0.1, 0.08, 0.1), mat=K.paper('#ffffff', emit=0.4), segs=10)
        K.anim(lambda t, f, o=puff, k=k: (setattr(o.location, 'z', 1.5 + ((t * 0.3 + k / 3) % 1.0) * 1.0), setattr(o.scale, 'x', 0.1 + ((t * 0.3 + k / 3) % 1.0) * 0.1)))
    for k, (c, sx) in enumerate((('#d9473f', -5.5), ('#f2c94c', -5.0), ('#3f74c9', -4.4))):
        prim('torus', 'pan_hook', (sx, WALL_Y - 0.15, 2.3), (0.04, 0.04, 0.04), (math.pi / 2, 0, 0), mat=F('#3a3346'), segs=8)
        prim('cyl', 'pan', (sx, WALL_Y - 0.12, 2.0), (0.2, 0.2, 0.02), (math.pi / 2, 0, 0), mat=F(c), segs=18)
    # a table in the middle-back with a fruit bowl
    P.p_fruit(3.6, 3.0, 0, rng, {})
    b = P.Batch('kchairs')
    chair(b, 2.9, 3.6, col='#d9473f')
    chair(b, 4.3, 3.6, col='#4f9d5d')
    b.done()
    h['used'] = ['fruit']
    return h


def set_library(tod, rng, props):
    h = room(tod, rng, wall='#efe0c8', pattern='stripes', accent='#e6d3b4', floor='carpet', floor_col=('#b4584a',), window=(0.0, 3.4, 1.6, 1.6))
    for x in (-6.2, -3.9, 3.9, 6.2):
        bookshelf(x, WALL_Y - 0.3, 2.1, 3.6, rng, wood='#8a5a35')
    rug(0, 1.8, 2.6, 1.1, ('#3f74c9', '#f2c94c', '#3f74c9'))
    # a reading armchair and a lamp
    a = K.empty('armchair', (-1.9, 3.8, 0))
    chair_col = F('#4f9d5d')
    box('arm_seat', (0, 0, 0.35), (1.1, 0.8, 0.35), chair_col, a, 0.12)
    box('arm_back', (0, 0.35, 0.85), (1.1, 0.2, 0.9), chair_col, a, 0.1)
    for sx in (-1, 1):
        box('arm_rest', (sx * 0.55, 0, 0.6), (0.22, 0.8, 0.35), chair_col, a, 0.08)
    P.book_closed().location = (-1.8, 3.6, 0.72)
    lit = tod['stars'] > 0
    prim('cyl', 'floor_lamp', (1.6, 4.4, 0.9), (0.03, 0.03, 0.9), mat=F('#3a3346'), segs=6)
    prim('cone', 'floor_lamp_shade', (1.6, 4.4, 1.9), (1, 1, 0.2), mat=F('#f2c94c', emit=1.0 if lit else 0.0, emit_color='#ffd27a'), segs=16, r1=0.35, r2=0.18)
    return h


def set_hospital(tod, rng, props):
    h = room(tod, rng, wall='#e3f2ec', pattern='dots', accent='#cfe8de', floor='tiles', floor_col=('#f4f1ea', '#cfe0f0'), window=(-3.6, 3.0, 2.0, 1.8))
    # a doctor's bed with rails, a curtain on a rail, a cabinet with a heart, a height chart
    b = P.Batch('hosp')
    b.add('cube', (2.6, 3.6, 0.55), (1.0, 0.45, 0.08), mat=F('#f4f1ea'))
    b.add('cube', (2.6, 3.6, 0.68), (0.95, 0.42, 0.06), mat=F('#9bd3c8'))
    for sx in (-1, 1):
        b.add('cube', (2.6 + sx * 0.95, 3.6, 0.6), (0.04, 0.45, 0.35), mat=F('#c9ccd4'))
        for sy in (-1, 1):
            b.add('cyl', (2.6 + sx * 0.85, 3.6 + sy * 0.35, 0.27), (0.03, 0.03, 0.27), mat=F('#c9ccd4'), segs=6)
    b.add('sphere', (1.95, 3.6, 0.8), (0.2, 0.33, 0.08), mat=F('#ffffff'), segs=12)
    b.add('cyl', (0, WALL_Y - 1.4, 3.6), (0.02, 0.02, 6.0), (0, math.pi / 2, 0), mat=F('#c9ccd4'), segs=6)
    b.add('cube', (5.6, WALL_Y - 0.4, 0.8), (0.7, 0.35, 0.8), mat=F('#f4f1ea'))
    b.done()
    cur = K.outline_obj('curtain', [(0, 0), (1.6, 0), (1.7, -0.6), (1.5, -1.3), (1.75, -2.2), (1.6, -3.0), (0, -3.0)], 0.04, F('#9bc3e8'), bevel=0.015)
    cur.location = (4.9, WALL_Y - 1.42, 3.6)
    heart = K.outline_obj('heart', [(0, -0.3)] + [(math.sin(a) ** 3 * 0.3, (13 * math.cos(a) - 5 * math.cos(2 * a) - 2 * math.cos(3 * a) - math.cos(4 * a)) / 16 * 0.3) for a in [i * 2 * math.pi / 24 for i in range(1, 24)]], 0.03, F('#e5484d'), bevel=0.01)
    heart.location = (5.6, WALL_Y - 0.78, 1.0)
    chart = K.empty('height_chart', (-6.0, WALL_Y - 0.05, 0))
    for k in range(10):
        prim('cube', 'chart_band', (0, 0, 0.2 + k * 0.22), (0.25, 0.01, 0.11), mat=F(['#f2c94c', '#4f9d5d', '#3f74c9', '#ec8db0', '#ee8a33'][k % 5]), parent=chart)
    return h


def set_party_room(tod, rng, props):
    h = room(tod, rng, wall='#fbe7ef', pattern='dots', accent='#f6c6d7', floor='wood', floor_col=('#e3c08c', '#d6b07c'), window=(-4.6, 2.9, 1.8, 1.8))
    P.p_flags(0, WALL_Y - 0.4, 0, rng, {})
    for x, y in ((-6.5, 4.6), (6.4, 4.4)):
        P.p_balloons(x, y, 0, rng, {})
    P.p_presents(5.2, 3.6, 0, rng, {})
    if 'cake' not in props:
        P.p_cake(-2.6, 3.8, 0, rng, {'night': tod['stars'] > 0.5})
    # paper streamers swaying from the top
    cols = ['#f2c94c', '#3f74c9', '#4f9d5d', '#d9473f']
    for k in range(9):
        s = prim('cube', 'streamer', (-6 + k * 1.5, WALL_Y - 0.5, 4.4), (0.06, 0.01, 0.7), mat=K.paper(cols[k % 4]), segs=4)
        K.anim(lambda t, f, o=s, k=k: setattr(o.rotation_euler, 'y', math.sin(t * 1.4 + k) * 0.12))
    h['used'] = ['flags', 'balloons', 'presents', 'cake']
    return h


def set_stage(tod, rng, props):
    """A felt theatre: the children stand on the stage, red curtains, spotlights, footlights, a painted backdrop."""
    lit = True
    K.backdrop('#20264f', '#4a3f7a', y=WALL_Y + 0.4)
    star_b = P.Batch('stage_stars')
    for k in range(18):
        star_b.add('cone', (rng.uniform(-6, 6), WALL_Y + 0.3, rng.uniform(2.2, 5.0)), (1, 1, 0.01), (math.pi / 2, 0, 0), mat=K.glow('#ffe58a', 1.5), segs=5, r1=0.12, r2=0.12)
    star_b.done()
    prim('cyl', 'stage_moon', (4.0, WALL_Y + 0.25, 4.0), (0.6, 0.6, 0.03), (math.pi / 2, 0, 0), mat=F('#fff1c2', emit=1.2, emit_color='#ffe7a3'), segs=28)
    K.hills(WALL_Y + 0.1, 0.0, 30, 1.6, ['#2f5a4a', '#3a6b52'], 0.6, 'stage_hills')
    # the stage floor and its front
    fb = P.Batch('stage_floor')
    for k in range(-14, 15):
        fb.add('cube', (k * 0.55, 2.0, -0.05), (0.27, 4.6, 0.05), mat=F(('#b9844f', '#a8763f')[k % 2], sheen=0.4))
    fb.add('cube', (0, -2.65, -0.6), (9, 0.05, 0.55), mat=F('#6b2f3a'))
    fb.add('cube', (0, -5, -1.2), (12, 2.5, 0.05), mat=F('#3a2a36'))
    fb.done()
    curtain = F('#b8323d', sheen=1.0)
    for sx in (-1, 1):
        for k in range(5):
            c = prim('cyl', 'curtain_fold', (sx * (5.0 + k * 0.45), 0.8, 3.0), (0.32, 0.18, 3.6), mat=curtain, segs=12)
        K.outline_obj('curtain_tie', [(0, 0), (0.5, 0.0), (0.5, 0.12), (0, 0.12)], 0.3, F('#f2c94c'), bevel=0.02).location = (sx * 5.6 - 0.25, 0.6, 1.6)
    for k in range(9):
        prim('sphere', 'valance', (-8 + k * 2.0, 0.6, 5.1), (1.15, 0.25, 0.6), mat=curtain, segs=14)
    fl_b = P.Batch('footlights')
    for k in range(9):
        fl_b.add('sphere', (-4 + k * 1.0, -2.5, 0.06), (0.12, 0.08, 0.08), mat=K.glow('#ffe7a3', 5.0), segs=10)
    fl_b.done()
    for sx, col in ((-1, '#ffe7c4'), (1, '#e7ecff')):
        beam = prim('cone', 'spot_beam', (sx * 2.2, -1.0, 3.6), (1, 1, 2.6), (0, 0, 0), mat=K.haze(col, 0.35, axis='beam', power=1.6, name='spotbeam'), segs=32, r1=1.4, r2=0.15)
        beam.rotation_euler = (0.35, sx * -0.45, 0)
        beam.visible_shadow = False
        l = K.bpy.data.lights.new('spot', 'SPOT')
        l.energy = 1400
        l.spot_size = 0.8
        l.color = (1.0, 0.92, 0.8)
        lo = K.bpy.data.objects.new('spot', l)
        K.link(lo)
        lo.location = (sx * 3.5, -3.0, 6.0)
        lo.rotation_euler = (0.55, sx * -0.4, 0)
    return {'night': True, 'indoor': True}


def set_bakery(tod, rng, props):
    h = room(tod, rng, wall='#fbefe0', pattern='stripes', accent='#f6d6c8', floor='tiles', floor_col=('#f4f1ea', '#8a5a35'), window=(5.0, 3.0, 2.0, 1.8))
    # the counter with a glass-fronted case of cakes, shelves of bread, a chalk menu board
    b = P.Batch('bakery')
    b.add('cube', (-1.5, 3.4, 0.55), (3.0, 0.5, 0.55), mat=F('#c27a52'))
    b.add('cube', (-1.5, 3.4, 1.12), (3.05, 0.55, 0.04), mat=F('#f4f1ea'))
    b.add('cube', (-1.5, 3.1, 0.6), (2.9, 0.02, 0.4), mat=K.paper('#e9f4fb', emit=0.5 if tod['stars'] > 0 else 0.2))
    for k in range(6):
        x = -4.0 + k * 1.0
        b.add('cyl', (x, 3.3, 0.38), (0.25, 0.25, 0.1), mat=F(['#f4b6c8', '#fbe28a', '#c98a5a'][k % 3]), segs=16)
        b.add('torus', (x, 3.3, 0.48), (0.25, 0.25, 0.08), mat=F('#fdf3f7'), segs=16)
    for z in (1.8, 2.6, 3.4):
        b.add('cube', (-5.0, WALL_Y - 0.3, z), (1.3, 0.25, 0.04), mat=F('#a27a45'))
        for k in range(5):
            b.add('sphere', (-5.9 + k * 0.45, WALL_Y - 0.32, z + 0.13), (0.2, 0.12, 0.1), (0, 0, 0.3), mat=F('#d99a52', fuzz=1.2), segs=12)
    b.add('cube', (0.6, WALL_Y - 0.06, 3.0), (1.0, 0.04, 0.75), mat=F('#2f3b33'))
    b.add('cube', (0.6, WALL_Y - 0.03, 3.0), (1.08, 0.03, 0.83), mat=F('#a27a45'))
    b.done()
    chalk = K.paper('#f4f1ea', emit=0.3)
    for k in range(4):
        prim('cube', 'menu_line', (0.6, WALL_Y - 0.1, 3.45 - k * 0.3), (0.75 - (k % 2) * 0.2, 0.01, 0.025), mat=chalk)
    # a striped awning over the counter
    aw = P.Batch('awning')
    for k in range(10):
        aw.add('cube', (-4.1 + k * 0.6, 3.0, 2.6), (0.3, 0.5, 0.04), (0.35, 0, 0), mat=F(('#d9473f', '#ffffff')[k % 2]))
    aw.done()
    return h


ROOM_SETS = {'classroom': set_classroom, 'bedroom': set_bedroom, 'kitchen': set_kitchen, 'library': set_library,
             'hospital': set_hospital, 'party_room': set_party_room, 'stage': set_stage, 'bakery': set_bakery}
