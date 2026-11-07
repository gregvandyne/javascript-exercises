"""The track scenery props for Sum Racer's pixel style, through the same Blender pixel pipeline as the racers.

    python3 tools/blender/pixel_props.py --out DIR [--only tree,palm] [--scale 6]

Each prop is a few solids with the pixel style's toon materials, rendered at its real size (no anti-aliasing), snapped
to the palette and outlined in Ink (pixel_racers.render). One PNG per prop and size: DIR/prop_<name>_<px>.png, the
number being the frame's height in native pixels. pixel_atlas.py stamps them into the track layers.
"""
import argparse
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import feltkit as K  # noqa: E402
import pixel_racers as PR  # noqa: E402

tok, flat = PR.tok, PR.flat


def cyl(name, loc, r, h, mat, rot=(0, 0, 0), segs=16):
    return K.prim('cyl', name, loc, (r, r, h / 2), rot, mat=mat, segs=segs)


def ball(name, loc, sc, mat, segs=20):
    return K.prim('sphere', name, loc, sc, mat=mat, segs=segs)


def cone(name, loc, r, h, mat, r2=0.0, segs=16):
    return K.prim('cone', name, loc, (1, 1, h / 2), mat=mat, segs=segs, r1=r, r2=r2)


def box(name, loc, sc, mat, rot=(0, 0, 0)):
    return K.prim('cube', name, loc, sc, rot, mat=mat)


# every builder puts the prop's base on z=0, centred on x=0, and returns its height in units
def tree():
    cyl('trunk', (0, 0, 0.35), 0.1, 0.7, tok('cocoa.base'))
    ball('crown', (0, 0, 1.0), (0.5, 0.45, 0.48), tok('mint.base'))
    ball('crown2', (-0.28, -0.05, 0.78), (0.3, 0.3, 0.28), tok('mint.base'))
    ball('crown3', (0.3, -0.05, 0.82), (0.32, 0.3, 0.3), tok('mint.base'))
    return 1.5


def pine(snow=False):
    cyl('trunk', (0, 0, 0.15), 0.08, 0.3, tok('cocoa.base'))
    for i, (z, r) in enumerate(((0.45, 0.42), (0.8, 0.33), (1.1, 0.24))):
        cone('tier', (0, 0, z), r, 0.5, tok('mint.shade'))
        if snow:
            cone('snow', (0, 0, z + 0.14), r * 0.62, 0.24, flat('snow.tint'))
    return 1.4


def palm():
    # a curved trunk of tapered segments leaning right, five leaves and two coconuts
    x, z = 0.0, 0.0
    for i in range(7):
        a = math.radians(4 + i * 3.5)
        seg = cyl('trunk', (x, 0, z + 0.11), 0.08 - i * 0.005, 0.24, tok('cocoa.light') if i % 2 else tok('cocoa.base'), rot=(0, a, 0))
        x += math.sin(a) * 0.22
        z += math.cos(a) * 0.22
    # leaves: long ellipsoids from the crown, arching out and drooping at the ends
    for dx, dz, dy in ((-1, -0.45, 0), (-0.75, 0.25, 0), (0.15, 1, 0), (0.8, 0.25, 0), (1, -0.5, 0), (-0.3, -0.2, -0.9), (0.4, -0.15, 0.9)):
        n = math.sqrt(dx * dx + dz * dz + dy * dy)
        dx, dz, dy = dx / n, dz / n, dy / n
        leaf = ball('leaf', (x + dx * 0.3, dy * 0.3, z + dz * 0.22), (0.34, 0.11, 0.08), tok('mint.base'))
        leaf.rotation_euler = (0, -math.atan2(dz, math.hypot(dx, dy)), math.atan2(dy, dx))
    for dx in (-0.06, 0.07):
        ball('nut', (x + dx, -0.1, z - 0.06), (0.07, 0.07, 0.07), tok('cocoa.shade'), segs=10)
    return 1.75


def cactus():
    cyl('stem', (0, 0, 0.5), 0.16, 1.0, tok('mint.base'))
    ball('top', (0, 0, 1.0), (0.16, 0.16, 0.12), tok('mint.base'))
    for sx, z, h in ((-1, 0.45, 0.35), (1, 0.6, 0.28)):
        cyl('armh', (sx * 0.22, 0, z), 0.08, 0.2, tok('mint.base'), rot=(0, math.pi / 2, 0))
        cyl('armv', (sx * 0.3, 0, z + h / 2), 0.08, h, tok('mint.base'))
        ball('armt', (sx * 0.3, 0, z + h), (0.08, 0.08, 0.07), tok('mint.base'))
    return 1.15


def house(wall='cream.base', roof='coral.base'):
    box('wall', (0, 0, 0.32), (0.45, 0.3, 0.32), tok(wall))
    roofo = K.outline_obj('roof', [(-0.58, 0.6), (0, 1.02), (0.58, 0.6)], 0.7, tok(roof), y=-0.35)
    box('door', (0.18, -0.31, 0.2), (0.09, 0.01, 0.2), flat('cocoa.base'))
    box('win', (-0.2, -0.31, 0.38), (0.11, 0.01, 0.09), flat('sky.light'))
    return 1.05


def cabin():
    box('logs', (0, 0, 0.3), (0.5, 0.3, 0.3), tok('cocoa.base'))
    K.outline_obj('roof', [(-0.64, 0.55), (0, 0.98), (0.64, 0.55)], 0.72, tok('snow.light'), y=-0.36)
    box('win', (-0.22, -0.31, 0.34), (0.1, 0.01, 0.08), flat('spark.light'))
    box('door', (0.2, -0.31, 0.2), (0.09, 0.01, 0.2), flat('cocoa.shade'))
    return 1.0


def snowman():
    ball('base', (0, 0, 0.25), (0.26, 0.26, 0.25), tok('snow.light'))
    ball('mid', (0, 0, 0.62), (0.19, 0.19, 0.18), tok('snow.light'))
    ball('head', (0, 0, 0.9), (0.14, 0.14, 0.14), tok('snow.light'))
    cone('nose', (0, -0.18, 0.9), 0.035, 0.12, flat('peach.base'))
    box('hat', (0, 0, 1.05), (0.1, 0.1, 0.07), flat('ink'))
    for sx in (-1, 1):
        ball('eye', (sx * 0.05, -0.13, 0.94), (0.02, 0.02, 0.02), flat('ink'), segs=8)
    K.prim('torus', 'scarf', (0, 0, 0.77), (0.15, 0.15, 0.15), mat=tok('coral.base'), segs=16, minor=0.3)
    return 1.15


def rocket():
    cyl('body', (0, 0, 0.55), 0.17, 0.7, tok('snow.light'))
    cone('nose', (0, 0, 1.05), 0.17, 0.3, tok('coral.base'))
    for a in (0, 2.1, 4.2):
        f = K.outline_obj('fin', [(0.1, 0.18), (0.32, 0.0), (0.32, 0.12), (0.12, 0.42)], 0.04, tok('coral.base'), y=-0.02)
        f.rotation_euler.z = a
    cyl('window', (0, -0.16, 0.7), 0.07, 0.04, flat('sky.light'), rot=(math.pi / 2, 0, 0))
    return 1.25


def dome():
    box('base', (0, 0, 0.06), (0.55, 0.4, 0.06), tok('grape.shade'))
    ball('glass', (0, 0, 0.12), (0.46, 0.4, 0.46), tok('sky.light'))
    box('cut', (0, 0, -0.2), (0.6, 0.6, 0.3), flat('ink'))   # hidden under the base
    return 0.62


def mushroom():
    cyl('stem', (0, 0, 0.15), 0.08, 0.3, tok('cream.base'))
    ball('cap', (0, 0, 0.32), (0.26, 0.24, 0.16), tok('coral.base'))
    for x, z in ((-0.12, 0.38), (0.08, 0.42), (0.16, 0.33)):
        ball('spot', (x, -0.2, z), (0.04, 0.02, 0.035), flat('cream.base'), segs=8)
    return 0.5


def rock():
    r = K.prim('sphere', 'rock', (0, 0, 0.18), (0.36, 0.26, 0.24), mat=tok('stone.light'), segs=6)
    r.data.polygons.foreach_set('use_smooth', [False] * len(r.data.polygons))
    return 0.42


def sandcastle():
    box('keep', (0, 0, 0.3), (0.18, 0.18, 0.3), tok('peach.light'))
    for sx in (-1, 1):
        box('tower', (sx * 0.3, 0, 0.2), (0.12, 0.14, 0.2), tok('peach.light'))
    cyl('pole', (0, 0, 0.72), 0.015, 0.2, flat('ink'))
    K.outline_obj('pennant', [(0.0, 0.82), (0.16, 0.76), (0.0, 0.7)], 0.02, flat('coral.base'), y=-0.01)
    return 0.85


def umbrella():
    cyl('pole', (0, 0, 0.37), 0.045, 0.74, flat('stone.shade'))
    # the canopy: a cut-out half dome in four stripes, coral and cream, with a scalloped hem
    def slice_(xa, xb):
        top = [(xa + (xb - xa) * t / 6, 0.78 + 0.26 * math.sqrt(max(0.0, 1 - ((xa + (xb - xa) * t / 6) / 0.54) ** 2))) for t in range(7)]
        return top + [(xb, 0.74), ((xa + xb) / 2, 0.7), (xa, 0.74)]
    for i, (xa, xb) in enumerate(((-0.54, -0.27), (-0.27, 0.0), (0.0, 0.27), (0.27, 0.54))):
        K.outline_obj('canopy', slice_(xa, xb)[::-1], 0.04, tok('coral.base') if i % 2 == 0 else flat('cream.base'), y=-0.02)
    return 1.1


def lantern():
    cyl('post', (0, 0, 0.45), 0.055, 0.9, flat('stone.shade'))
    ball('lamp', (0, 0, 0.98), (0.16, 0.16, 0.18), flat('spark.tint'))
    box('cap', (0, 0, 1.12), (0.1, 0.1, 0.03), flat('ink'))
    return 1.18


def flagpost():
    cyl('pole', (0, 0, 0.5), 0.025, 1.0, flat('stone.shade'))
    K.outline_obj('flag', [(0.02, 0.98), (0.42, 0.86), (0.02, 0.72)], 0.02, flat('coral.base'), y=-0.01)
    return 1.0


def boat():
    K.outline_obj('hull', [(-0.5, 0.12), (0.5, 0.12), (0.38, -0.05), (-0.38, -0.05)], 0.2, tok('cocoa.light'), y=-0.1)
    K.outline_obj('sail', [(-0.02, 0.18), (-0.02, 0.85), (0.36, 0.18)], 0.02, flat('cream.base'), y=-0.01)
    return 0.9


def crystal():
    for x, h, r in ((-0.1, 0.5, 0.1), (0.08, 0.36, 0.08)):
        c = cone('xtal', (x, 0, h / 2), r, h, tok('sky.light'), segs=5)
    return 0.5


PROPS = {
    # name: (builder, [frame heights in native px], view width:height)
    'tree': (tree, [30, 20]),
    'pine': (pine, [26, 18]),
    'pine_snow': (lambda: pine(True), [26, 18]),
    'palm': (palm, [36, 24, 10]),
    'cactus': (cactus, [24, 16]),
    'house_a': (lambda: house('cream.base', 'coral.base'), [26]),
    'house_b': (lambda: house('spark.tint', 'grape.base'), [26]),
    'house_c': (lambda: house('peach.light', 'sky.shade'), [26]),
    'house_d': (lambda: house('mint.light', 'coral.shade'), [26]),
    'cabin': (cabin, [24]),
    'snowman': (snowman, [18]),
    'rocket': (rocket, [26]),
    'dome': (dome, [16]),
    'mushroom': (mushroom, [10]),
    'rock': (rock, [9, 6]),
    'sandcastle': (sandcastle, [14]),
    'umbrella': (umbrella, [16]),
    'lantern': (lantern, [18]),
    'flag': (flagpost, [18]),
    'boat': (boat, [12, 7]),
    'crystal': (crystal, [9]),
}


def build(name, px, out, big):
    fn = PROPS[name][0]
    PR.fresh()
    sc, cam = PR.setup(8, 8)
    fn()
    # frame: px tall, as wide as needed (the prop's extent at the same scale), 1 px for the outline each side
    bpy.context.view_layer.update()
    xs = [v for o in bpy.data.objects if o.type == 'MESH' for v in (o.matrix_world @ Vector(b) for b in o.bound_box)]
    x0, x1 = min(v.x for v in xs), max(v.x for v in xs)
    z1 = max(v.z for v in xs)
    ppu = (px - 2) / max(z1, 0.01)
    w = int(math.ceil((x1 - x0) * ppu)) + 3
    w += w % 2
    sc.render.resolution_x, sc.render.resolution_y = w, px
    cam.data.ortho_scale = max(w, px) / ppu
    t = math.radians(8)
    cam.location = ((x0 + x1) / 2, -12 * math.cos(t), (px / 2 - 1) / ppu + 12 * math.sin(t))
    cam.rotation_euler = (math.pi / 2 - t, 0, 0)
    import styles as S
    S.finish({'width': w, 'height': px, 'style': 'pixel'}, {'time': 'day'})
    for o in [o for o in bpy.data.objects if o.name.startswith('contact_')]:
        bpy.data.objects.remove(o, do_unlink=True)
    sc.render.resolution_x, sc.render.resolution_y = w, px
    PR.strip_lines()
    PR.render(os.path.join(out, f'prop_{name}_{px}.png'), big=big)


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--only', default='')
    ap.add_argument('--scale', type=int, default=0)
    a = ap.parse_args(argv)
    out = os.path.abspath(a.out)
    os.makedirs(os.path.join(out, 'big') if a.scale else out, exist_ok=True)
    only = set(filter(None, a.only.split(',')))
    for name, (fn, sizes) in PROPS.items():
        if only and name not in only:
            continue
        for px in sizes:
            build(name, px, out, a.scale or None)
        print(name, sizes, flush=True)


if __name__ == '__main__':
    main(sys.argv[1:])
