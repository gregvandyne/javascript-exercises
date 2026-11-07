"""Sum Racer's racers as pixel sprites, through the style sheet's Blender pixel pipeline (tools/blender/styles.py).

    python3 tools/blender/pixel_racers.py --out DIR [--only fox,frog] [--scale 8]

One kart and the cast are built from simple solids with the pixel style's toon materials (flat kit colours, one hard
cel shade from a fixed light at the top-left, emission only so every colour is exactly a palette colour), rendered with
an orthographic camera at the sprite's real size with no anti-aliasing, then snapped to the pixel palette and given a
1 px Ink outline round the silhouette (styles.pixelate + the sprite edge from the style sheet's fox strip).

Writes to DIR, one RGBA PNG per frame at native size (pixel_atlas.py packs them):
  kart_<who>_<frame>.png      a racer in their kart, 64x56: frames idle, d0, d1, d2 (the wheels turn), cheer
  kart_empty_<hue>_<frame>.png   an empty kart (the player's own avatar sits in it at run time), and
  kart_front_<hue>_<frame>.png   the parts in front of the driver (drawn over the avatar)
  head_<who>.png              the driver's head and shoulders, 24x24, for the HUD and the edge bubbles
  meta.json                   where the number disc and the seat are (for the game's code)
--scale renders each sprite N times bigger too (DIR/big/), for checking by eye.
"""
import argparse
import json
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import feltkit as K  # noqa: E402
import styles as S  # noqa: E402

W, H = 64, 56          # a kart frame, native pixels
HEAD = 24              # a head portrait
PPU = 27.0             # native pixels per Blender unit (the kart is about 2.2 units long -> ~60 px)
GROUND = 3             # rows under the wheels (the shadow lives there)
# Sum Racer's palette: the style sheet's 32 colours plus the kit colours its cast and tracks need that the lighthouse
# scene never did (grape for Bolt, the galaxy and the dock; light mint for the frog and the jungle; light sky).
EXTRA = ['#C6A9F3', '#9B6BE8', '#6C44C0', '#3D2775', '#2B1F5C', '#9BDDB7', '#66C792', '#93CBF6']
PALETTE = list(S.STYLES['pixel']['palette']) + EXTRA

# who drives which kart (seed-games/sum-racer.html CONFIG: rivals and player 2)
CAST = {
    'fox': ('fox', 'sky'),
    'bunny': ('bunny', 'peach'),
    'robot': ('oomba', 'grape'),
    'dino': ('frog', 'mint'),
}
EMPTY_HUES = ['coral', 'sky', 'peach', 'grape', 'mint']
RAMPS = dict(S.RAMPS, grape=['#ECE2FB', '#C6A9F3', '#9B6BE8', '#6C44C0'])
S.RAMPS.update(RAMPS)


def tok(t):
    return S.toon(t)


def flat(t):
    return S.flat(t)


# ---------------------------------------------------------------- the kart
DISC = (0.42, -0.43, 0.36)   # the number disc on the kart's side


def kart(hue, front_only=False):
    """A go-kart facing +X, wheels on z=0. Returns (root, parts dict)."""
    root = K.empty(f'kart_{hue}')
    body_pts = [(-0.9, 0.16), (-0.94, 0.5), (-0.86, 0.6), (0.2, 0.58), (0.62, 0.5), (0.98, 0.34), (1.02, 0.22), (0.96, 0.16)]
    body = K.outline_obj('k_body', body_pts, 0.78, tok(f'{hue}.base'), y=-0.39)
    body.parent = root
    # a cream stripe and the shade band along the sill (both a little proud of the side)
    stripe = K.outline_obj('k_stripe', [(-0.92, 0.4), (0.7, 0.4), (0.82, 0.46), (-0.92, 0.47)], 0.8, flat('cream.base'), y=-0.4)
    stripe.parent = root
    sill = K.outline_obj('k_sill', [(-0.9, 0.16), (0.96, 0.16), (1.0, 0.24), (-0.92, 0.25)], 0.8, flat(f'{hue}.shade'), y=-0.4)
    sill.parent = root
    # the number disc (the game writes the racer's number on it)
    disc = K.prim('cyl', 'k_disc', DISC, (0.16, 0.16, 0.02), (math.pi / 2, 0, 0), mat=flat('cream.base'), parent=root, segs=24)
    K.prim('cyl', 'k_disc_rim', (DISC[0], DISC[1] + 0.02, DISC[2]), (0.22, 0.22, 0.02), (math.pi / 2, 0, 0), mat=flat('ink'), parent=root, segs=24)
    parts = {'body': body, 'disc': disc}
    if not front_only:
        # seat back and spoiler in the shade step
        seat = K.prim('cube', 'k_seat', (-0.42, 0.0, 0.78), (0.08, 0.3, 0.24), mat=tok(f'{hue}.shade'), parent=root)
        seat.rotation_euler.y = math.radians(-12)
        K.prim('cube', 'k_post', (-0.86, 0.0, 0.7), (0.04, 0.05, 0.12), mat=tok('stone.shade'), parent=root)
        K.prim('cube', 'k_wing', (-0.86, 0.0, 0.84), (0.16, 0.36, 0.04), mat=tok(f'{hue}.shade'), parent=root)
    # the steering wheel on its column
    col = K.prim('cyl', 'k_column', (0.26, -0.05, 0.72), (0.03, 0.03, 0.17), (0, math.radians(-38), 0), mat=flat('ink'), parent=root, segs=8)
    whl = K.prim('torus', 'k_steer', (0.16, -0.05, 0.86), (0.11, 0.11, 0.11), (0, math.radians(-60), 0), mat=flat('ink'), parent=root, segs=16, minor=0.3)
    parts.update(column=col, steer=whl)
    wheels = []
    for x, r in ((-0.58, 0.25), (0.66, 0.22)):
        for y in (-0.4, 0.4):
            w = K.empty('wheel', (x, y, r), root)
            K.prim('cyl', 'k_tyre', (0, 0, 0), (r, r, 0.12), (math.pi / 2, 0, 0), mat=flat('ink'), parent=w, segs=20)
            K.prim('cyl', 'k_hub', (0, -0.13 * (1 if y < 0 else -1), 0), (r * 0.5, r * 0.5, 0.03), (math.pi / 2, 0, 0), mat=flat('stone.light'), parent=w, segs=16)
            K.prim('cube', 'k_spoke', (0, -0.16 * (1 if y < 0 else -1), 0), (r * 0.46, 0.02, r * 0.1), mat=flat('stone.shade'), parent=w)
            wheels.append(w)
    parts['wheels'] = wheels
    return root, parts


# ---------------------------------------------------------------- the cast (kit species, chibi: big heads)
def _ring_eyes(head, y, z, gap, r, look=0.25):
    """The kit's ring eyes: a white disc with an Ink pupil (bigger than life: they must read at 3-4 px)."""
    for sx in (-1, 1):
        K.prim('sphere', 'eye_white', (sx * gap, y, z), (r, r * 0.5, r * 1.1), mat=flat('snow.tint'), parent=head, segs=16)
        K.prim('sphere', 'eye', (sx * gap + r * look, y - r * 0.35, z - r * 0.1), (r * 0.62, r * 0.4, r * 0.72), mat=flat('ink'), parent=head, segs=12)


def frog(name):
    root = K.empty(name)
    body = K.empty(f'{name}_body', (0, 0, 0), root)
    skin, belly = tok('mint.base'), tok('mint.tint')
    K.prim('sphere', 'g_body', (0, 0, 0.45), (0.36, 0.32, 0.4), mat=skin, parent=body)
    K.prim('sphere', 'g_belly', (0, -0.2, 0.42), (0.24, 0.15, 0.28), mat=belly, parent=body)
    head = K.empty(f'{name}_head', (0, -0.02, 0.98), body)
    K.prim('sphere', 'g_head', (0, 0, 0), (0.44, 0.34, 0.27), mat=skin, parent=head)
    for sx in (-1, 1):
        K.prim('sphere', 'g_eyebump', (sx * 0.2, -0.04, 0.22), (0.16, 0.15, 0.15), mat=skin, parent=head)
    _ring_eyes(head, -0.17, 0.25, 0.2, 0.11)
    K.prim('cube', 'g_mouth', (0, -0.33, -0.06), (0.16, 0.02, 0.014), mat=flat('mint.deep'), parent=head)
    for sx in (-1, 1):
        K.prim('sphere', 'cheek', (sx * 0.27, -0.27, -0.04), (0.06, 0.03, 0.04), mat=flat('coral.light'), parent=head, segs=10)
    # the scarf (CONFIG: wear scarf), sky blue: coral read as a big open mouth at this size
    K.prim('torus', 'g_scarf', (0, 0, 0.78), (0.33, 0.3, 0.3), mat=tok('sky.base'), parent=body, segs=20, minor=0.32)
    K.prim('cube', 'g_scarf_end', (0.12, -0.3, 0.66), (0.06, 0.03, 0.12), (0, 0.3, 0), mat=tok('sky.base'), parent=body)
    arms(body, skin)
    return root, body, head


def oomba(name):
    """Bolt: the kit's Oomba (a round mint body, ring eyes, an antenna with the spark) with headphones."""
    root = K.empty(name)
    body = K.empty(f'{name}_body', (0, 0, 0), root)
    skin = tok('mint.base')
    K.prim('sphere', 'o_body', (0, 0, 0.62), (0.42, 0.36, 0.58), mat=skin, parent=body)
    K.prim('sphere', 'o_belly', (0, -0.24, 0.5), (0.26, 0.14, 0.3), mat=tok('mint.light'), parent=body)
    head = K.empty(f'{name}_head', (0, -0.02, 0.92), body)
    _ring_eyes(head, -0.27, 0.06, 0.15, 0.12)
    for sx in (-1, 1):
        K.prim('sphere', 'cheek', (sx * 0.27, -0.29, -0.1), (0.06, 0.03, 0.04), mat=flat('coral.light'), parent=head, segs=10)
    K.prim('cube', 'o_mouth', (0, -0.36, -0.12), (0.07, 0.02, 0.015), mat=flat('mint.deep'), parent=head)
    # antenna and spark
    K.prim('cyl', 'o_stalk', (0, 0, 0.42), (0.025, 0.025, 0.14), mat=flat('mint.deep'), parent=head, segs=8)
    spark = K.outline_obj('o_spark', K.star_pts(0.16, 0.06, 4), 0.06, flat('spark.base'), y=-0.03)
    spark.parent = head
    spark.location = (0, -0.03, 0.66)
    # headphones (CONFIG: wear headphones): a band over the top and two cups
    K.prim('torus', 'o_band', (0, 0.04, 0.0), (0.46, 0.46, 0.46), (math.pi / 2, 0, 0), mat=flat('stone.light'), parent=head, segs=24, minor=0.07)
    for sx in (-1, 1):
        K.prim('cyl', 'o_cup', (sx * 0.43, 0, 0.0), (0.12, 0.12, 0.06), (0, math.pi / 2, 0), mat=tok('coral.base'), parent=head, segs=16)
    arms(body, skin, z=0.62, x=0.38)
    return root, body, head


def arms(body, mat, z=0.62, x=0.3):
    out = []
    for sx in (-1, 1):
        arm = K.empty('arm', (sx * x, -0.12, z), body)
        K.prim('sphere', 'arm_s', (0, 0, -0.13), (0.08, 0.08, 0.16), mat=mat, parent=arm, segs=12)
        out.append(arm)
    return out


def character(kind, name):
    if kind == 'frog':
        return frog(name)
    if kind == 'oomba':
        return oomba(name)
    root, body, head = K.CHARACTERS[kind](name)
    return root, body, head


def chibi(body, head, kind):
    """Pixel sprites exaggerate: a bigger head (the kit's 2-2.3 heads tall) and bigger eyes, no tiny details."""
    if kind in ('fox', 'bunny'):
        head.scale = (1.3, 1.3, 1.3)
        for o in head.children:
            if o.name.startswith(('eye', 'glint')):
                o.scale *= 1.25
    if kind == 'fox':
        for o in [o for o in body.children_recursive if o.name.startswith('f_leg')]:
            o.hide_render = True
    for o in body.children_recursive:
        if o.name.startswith(('b_foot', 'f_leg', 'm_foot', 'b_tail')):
            o.hide_render = True


# ---------------------------------------------------------------- render
def setup(w, h):
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE'
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = w, h, 100
    sc.render.film_transparent = True
    sc.render.filter_size = 0.0
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.eevee.taa_render_samples = 1
    sc.view_settings.view_transform = 'Standard'
    if sc.world is None:
        sc.world = bpy.data.worlds.new('w')
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    K.link(cam)
    cam.data.type = 'ORTHO'
    sc.camera = cam
    return sc, cam


def aim(cam, w, h, cx, cz, tilt=10):
    """An orthographic camera at PPU px per unit, looking along +Y, tilted down by `tilt` degrees, so (cx, cz) is the
    frame's centre."""
    cam.data.ortho_scale = max(w, h) / PPU
    t = math.radians(tilt)
    d = 12.0
    cam.location = (cx, -d * math.cos(t), cz + d * math.sin(t))
    cam.rotation_euler = (math.pi / 2 - t, 0, 0)
    # ortho_scale spans the larger side; shift so a non-square frame is centred
    cam.data.shift_x = cam.data.shift_y = 0.0


def snap_frame(path, outline=True):
    import numpy as np
    px = S.pixelate(S.read_png(path), PALETTE, 0.0, 1)
    if outline:
        a = px[..., 3] > 0.5
        ring = np.zeros_like(a)
        ring[1:, :] |= a[:-1, :]
        ring[:-1, :] |= a[1:, :]
        ring[:, 1:] |= a[:, :-1]
        ring[:, :-1] |= a[:, 1:]
        ring &= ~a
        px[ring, :3] = S._srgb_arr([S.INK])[0]
        px[ring, 3] = 1.0
    return px


def render(path, outline=True, big=None):
    sc = bpy.context.scene
    tmp = path + '.raw.png'
    sc.render.filepath = tmp
    bpy.ops.render.render(write_still=True)
    px = snap_frame(tmp, outline)
    os.remove(tmp)
    S.write_png(path, px)
    if big:
        import numpy as np
        S.write_png(os.path.join(os.path.dirname(path), 'big', os.path.basename(path)), np.repeat(np.repeat(px, big, 0), big, 1))
    return px


def fresh():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    K.reset()
    K.set_style('pixel')
    S.RAMPS.update(RAMPS)


def strip_lines():
    for o in bpy.data.objects:
        for m in [m for m in o.modifiers if m.name.startswith('ink')]:
            o.modifiers.remove(m)


def pose(frame, parts, body, head, kind):
    """idle: still; d0-d2: the wheels turn (a two-spoke hub repeats every 90 degrees), the driver leans in;
    cheer: arms up."""
    turn = {'idle': 0, 'd0': 0, 'd1': 30, 'd2': 60, 'cheer': 0}[frame]
    for w in parts['wheels']:
        w.rotation_euler.y = math.radians(turn)
    if body is None:
        return
    body.rotation_euler.y = math.radians(6 if frame.startswith('d') else 0)
    head.rotation_euler.x = math.radians({'d0': 0, 'd1': 3, 'd2': 0}.get(frame, 0))
    for a in (o for o in body.children if o.name.startswith('arm')):
        if 'z0' not in a:
            a['z0'] = a.location.z
        if frame == 'cheer':   # both arms up and out (a rotation about Y swings a hanging arm in the XZ plane)
            a.rotation_euler = (0, math.radians(155 if a.location.x < 0 else -155), 0)
            a.scale = (1.25, 1.25, 1.7)
            a.location.z = a['z0'] + 0.18
        else:   # hands forward on the wheel
            a.rotation_euler = (0, math.radians(-70), 0)
            a.scale = (1, 1, 1)
            a.location.z = a['z0']


DRIVER_AT = (-0.08, 0.0, 0.1)   # where the driver sits in the kart (their feet are inside the body)
DRIVER_SCALE = 0.95
DRIVER_TURN = 30               # degrees: they face the camera, turned a little towards the road ahead


def build_racer(who, kind, hue, empty=False, front=False):
    fresh()
    sc, cam = setup(W, H)
    root, parts = kart(hue, front_only=front)
    body = head = None
    if not empty and not front:
        croot, body, head = character(kind, 'drv')
        croot.location = DRIVER_AT
        croot.scale = (DRIVER_SCALE,) * 3
        croot.rotation_euler.z = math.radians(DRIVER_TURN)
        chibi(body, head, kind)
    # the frame: wheels' bottom GROUND px above the frame's bottom edge
    span_z = H / PPU
    cz = span_z / 2 - GROUND / PPU
    aim(cam, W, H, 0.04, cz, tilt=8)
    S.finish({'width': W, 'height': H, 'style': 'pixel'}, {'time': 'day'})
    for o in [o for o in bpy.data.objects if o.name.startswith('contact_')]:
        bpy.data.objects.remove(o, do_unlink=True)
    sc.render.resolution_x, sc.render.resolution_y = W, H
    strip_lines()
    return parts, body, head, cam


def project(cam, co):
    from bpy_extras.object_utils import world_to_camera_view
    sc = bpy.context.scene
    v = world_to_camera_view(sc, cam, Vector(co))
    return round(v.x * sc.render.resolution_x, 1), round((1 - v.y) * sc.render.resolution_y, 1)


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--only', default='')
    ap.add_argument('--scale', type=int, default=0)
    a = ap.parse_args(argv)
    out = os.path.abspath(a.out)
    os.makedirs(out, exist_ok=True)
    if a.scale:
        os.makedirs(os.path.join(out, 'big'), exist_ok=True)
    only = set(filter(None, a.only.split(',')))
    meta = {'frame': [W, H], 'head': [HEAD, HEAD], 'palette': PALETTE, 'frames': ['idle', 'd0', 'd1', 'd2', 'cheer']}
    for who, (kind, hue) in CAST.items():
        if only and who not in only:
            continue
        parts, body, head, cam = build_racer(who, kind, hue)
        for fr in meta['frames']:
            pose(fr, parts, body, head, kind)
            bpy.context.view_layer.update()
            render(os.path.join(out, f'kart_{who}_{fr}.png'), big=a.scale or None)
        meta['disc'] = project(cam, DISC)
        meta['seat'] = project(cam, (DRIVER_AT[0], 0, DRIVER_AT[2] + 0.62))
        meta['ground'] = H - GROUND
        print(json.dumps({'racer': who}), flush=True)
    for hue in EMPTY_HUES:
        if only and hue not in only and 'empty' not in only:
            continue
        for front in (False, True):
            parts, body, head, cam = build_racer('empty', None, hue, empty=True, front=front)
            for fr in ('idle', 'd0', 'd1', 'd2'):
                pose(fr, parts, None, None, None)
                bpy.context.view_layer.update()
                render(os.path.join(out, f'kart_{"front" if front else "empty"}_{hue}_{fr}.png'), outline=not front, big=a.scale or None)
        print(json.dumps({'empty': hue}), flush=True)
    # head portraits: the driver alone, head and shoulders, facing the camera
    for who, (kind, hue) in CAST.items():
        if only and who not in only:
            continue
        fresh()
        sc, cam = setup(HEAD, HEAD)
        croot, body, head = character(kind, 'drv')
        chibi(body, head, kind)
        hz = head.matrix_world.translation.z
        S.finish({'width': HEAD, 'height': HEAD, 'style': 'pixel'}, {'time': 'day'})
        for o in [o for o in bpy.data.objects if o.name.startswith('contact_')]:
            bpy.data.objects.remove(o, do_unlink=True)
        sc.render.resolution_x = sc.render.resolution_y = HEAD
        strip_lines()
        bpy.context.view_layer.update()
        hz = head.matrix_world.translation.z
        cam.data.ortho_scale = 1.55 if kind != 'bunny' else 1.75
        cam.location = (0, -12, hz + (0.0 if kind != 'bunny' else 0.18))
        cam.rotation_euler = (math.pi / 2, 0, 0)
        render(os.path.join(out, f'head_{who}.png'), big=(a.scale * 2) or None)
    json.dump(meta, open(os.path.join(out, 'meta.json'), 'w'), indent=1)
    print(json.dumps({'done': out}), flush=True)


if __name__ == '__main__':
    main(sys.argv[1:])
