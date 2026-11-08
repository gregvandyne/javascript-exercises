"""More felt animals for the Story Builder kit (the first four, mouse, fox, owl and bunny, are in feltkit.py), built
the same way: soft felt spheres and cones, bead eyes with a glint that blink, felt cheeks, and the same named parts
(`arm`, `leg`, `wing`, `ear`, `tail` empties, a `<name>_head` empty) so felt_actions.py can move them.

Most stand upright like the first four (a picture-book cast that faces the reader). The horse and the unicorn stand
on four legs, seen from the side (root['side_view']), so a child can ride them; the fish swims in the air or water.
Every builder is fn(name, color=None) -> (root, body, head); ANIMALS lists them (catalog.json lists the same names).
"""
import math

import feltkit as K

F = K.felt
prim = K.prim


def _base(name):
    root = K.empty(name)
    body = K.empty(f'{name}_body', (0, 0, 0), root)
    return root, body


def _arm(body, sx, x, z, mat, r=0.075, length=0.17, y=-0.08):
    arm = K.empty('arm', (sx * x, y, z), body)
    prim('sphere', 'paw', (0, 0, -length * 0.8), (r, r, length), mat=mat, parent=arm, segs=12)
    return arm


def _feet(body, mat, x=0.16, y=-0.13, r=(0.12, 0.18, 0.07)):
    for sx in (-1, 1):
        lg = K.empty('leg', (sx * x, 0, 0.12), body)
        lg['side'] = sx
        prim('sphere', 'foot', (0, y, -0.07), r, mat=mat, parent=lg, segs=12)


def dog(name, color='#d9a66b'):
    root, body = _base(name)
    fur, white, dark = F(color), F('#fbf1e4'), F('#6b4532')
    prim('sphere', 'd_body', (0, 0, 0.46), (0.36, 0.33, 0.44), mat=fur, parent=body)
    prim('sphere', 'd_belly', (0, -0.21, 0.42), (0.23, 0.14, 0.3), mat=white, parent=body)
    head = K.empty(f'{name}_head', (0, -0.03, 1.0), body)
    prim('sphere', 'd_head', (0, 0, 0), (0.36, 0.32, 0.31), mat=fur, parent=head)
    prim('sphere', 'd_patch', (0.15, -0.2, 0.1), (0.13, 0.08, 0.12), mat=dark, parent=head, segs=12)
    prim('sphere', 'd_snout', (0, -0.3, -0.08), (0.17, 0.13, 0.12), mat=white, parent=head)
    prim('sphere', 'd_nose', (0, -0.43, -0.03), (0.065, 0.05, 0.05), mat=K.glossy('#2a2226', 0.3), parent=head, segs=12)
    prim('sphere', 'd_tongue', (0.04, -0.38, -0.17), (0.05, 0.03, 0.05), mat=F('#f07a8a'), parent=head, segs=10)
    for sx in (-1, 1):
        ear = K.empty('ear', (sx * 0.3, 0.0, 0.16), head)
        prim('sphere', 'd_ear', (sx * 0.05, 0, -0.17), (0.1, 0.05, 0.22), (0, sx * 0.3, 0), mat=dark, parent=ear, segs=14)
        _arm(body, sx, 0.3, 0.6, fur)
    _feet(body, fur)
    K._eyes(head, 0, -0.27, 0.08, 0.055, 0.13, 0.4)
    K._cheeks(head, 0, -0.26, -0.07, 0.21)
    tail = K.empty('tail', (0, 0.3, 0.3), body)
    prim('sphere', 'd_tail', (0, 0.05, 0.12), (0.06, 0.06, 0.16), (-0.6, 0, 0), mat=fur, parent=tail, segs=10)
    prim('torus', 'collar', (0, 0, 0.82), (0.24, 0.22, 0.2), mat=F('#d9473f'), parent=body, segs=20, minor=0.15)
    prim('sphere', 'tag', (0, -0.24, 0.76), (0.04, 0.015, 0.04), mat=F('#f2c94c', sheen=0.4), parent=body, segs=8)
    K.anim(lambda t, f, tl=tail: setattr(tl.rotation_euler, 'z', math.sin(t * 9) * 0.5))
    root['height'] = 1.32
    return root, body, head


def cat(name, color='#e8a05a'):
    root, body = _base(name)
    fur, white, stripe = F(color), F('#fbf1e4'), F('#c4733a')
    prim('sphere', 'c_body', (0, 0, 0.44), (0.32, 0.3, 0.44), mat=fur, parent=body)
    prim('sphere', 'c_belly', (0, -0.19, 0.4), (0.2, 0.13, 0.3), mat=white, parent=body)
    head = K.empty(f'{name}_head', (0, -0.02, 0.98), body)
    prim('sphere', 'c_head', (0, 0, 0), (0.36, 0.31, 0.29), mat=fur, parent=head)
    prim('sphere', 'c_muzzle', (0, -0.26, -0.09), (0.15, 0.09, 0.09), mat=white, parent=head, segs=14)
    prim('cone', 'c_nose', (0, -0.33, -0.03), (1, 1, 0.03), (math.pi, 0, 0), mat=F('#f07a8a'), parent=head, segs=3, r1=0.04, r2=0.0)
    for k in range(3):
        prim('cube', 'c_stripe', ((k - 1) * 0.08, -0.17, 0.2), (0.02, 0.05, 0.08), (0.6, 0, 0), mat=stripe, parent=head)
    for sx in (-1, 1):
        ear = K.empty('ear', (sx * 0.2, 0, 0.22), head)
        prim('cone', 'c_ear', (0, 0, 0.1), (1, 0.5, 0.12), mat=fur, parent=ear, segs=10, r1=0.13, r2=0.0)
        prim('cone', 'c_ear_in', (0, -0.03, 0.08), (1, 0.4, 0.08), mat=F('#f4a7b5'), parent=ear, segs=10, r1=0.08, r2=0.0)
        ear.rotation_euler.y = sx * -0.3
        for k in range(2):
            prim('cyl', 'whisker', (sx * 0.22, -0.3, -0.07 + k * 0.05), (0.006, 0.006, 0.13), (0, math.pi / 2 + sx * (0.15 - k * 0.3), 0), mat=F('#fbf1e4'), parent=head, segs=4)
        _arm(body, sx, 0.27, 0.58, fur, r=0.065)
    _feet(body, white, r=(0.1, 0.15, 0.06))
    K._eyes(head, 0, -0.26, 0.05, 0.055, 0.13, 1.9)
    K._cheeks(head, 0, -0.24, -0.08, 0.2)
    tail = K.empty('tail', (0.15, 0.25, 0.15), body)
    for k in range(8):
        a = k / 7
        prim('sphere', 'c_tail', (0.25 * math.sin(a * 2.5), 0.1 * a, 0.65 * a), (0.06, 0.06, 0.07), mat=fur if k < 6 else stripe, parent=tail, segs=10)
    root['height'] = 1.3
    return root, body, head


def bear(name, color='#9a6a45'):
    root, body = _base(name)
    fur, light = F(color), F('#e2c39a')
    prim('sphere', 'be_body', (0, 0, 0.5), (0.42, 0.38, 0.5), mat=fur, parent=body)
    prim('sphere', 'be_belly', (0, -0.25, 0.45), (0.27, 0.15, 0.32), mat=light, parent=body)
    head = K.empty(f'{name}_head', (0, -0.03, 1.1), body)
    prim('sphere', 'be_head', (0, 0, 0), (0.38, 0.34, 0.32), mat=fur, parent=head)
    prim('sphere', 'be_muzzle', (0, -0.29, -0.09), (0.16, 0.11, 0.11), mat=light, parent=head, segs=14)
    prim('sphere', 'be_nose', (0, -0.39, -0.04), (0.06, 0.04, 0.04), mat=K.glossy('#2a2226', 0.3), parent=head, segs=10)
    for sx in (-1, 1):
        ear = K.empty('ear', (sx * 0.28, 0, 0.24), head)
        prim('sphere', 'be_ear', (0, 0, 0), (0.11, 0.06, 0.11), mat=fur, parent=ear, segs=12)
        prim('sphere', 'be_ear_in', (0, -0.04, 0), (0.06, 0.03, 0.06), mat=light, parent=ear, segs=10)
        _arm(body, sx, 0.36, 0.7, fur, r=0.09, length=0.2)
    _feet(body, fur, x=0.19, r=(0.14, 0.2, 0.08))
    K._eyes(head, 0, -0.29, 0.07, 0.05, 0.14, 2.7)
    K._cheeks(head, 0, -0.27, -0.06, 0.24)
    root['height'] = 1.45
    return root, body, head


def elephant(name, color='#9aa5c4'):
    root, body = _base(name)
    skin, pink = F(color), F('#f4a7b5')
    prim('sphere', 'el_body', (0, 0, 0.52), (0.44, 0.4, 0.52), mat=skin, parent=body)
    head = K.empty(f'{name}_head', (0, -0.04, 1.12), body)
    prim('sphere', 'el_head', (0, 0, 0), (0.4, 0.36, 0.34), mat=skin, parent=head)
    for sx in (-1, 1):
        ear = K.empty('ear', (sx * 0.36, 0.05, 0.02), head)
        prim('cyl', 'el_ear', (sx * 0.12, 0, 0), (0.3, 0.3, 0.03), (math.pi / 2, 0, 0), mat=skin, parent=ear, segs=24)
        prim('cyl', 'el_ear_in', (sx * 0.12, -0.03, 0), (0.21, 0.21, 0.02), (math.pi / 2, 0, 0), mat=pink, parent=ear, segs=24)
        _arm(body, sx, 0.38, 0.72, skin, r=0.1, length=0.2)
    trunk = K.empty('trunk', (0, -0.33, -0.08), head)
    for k in range(7):
        a = k / 6
        prim('sphere', 'el_trunk', (0, -0.08 * a - 0.02, -0.4 * a + 0.1 * a * a * 2), (0.09 - 0.025 * a, 0.09 - 0.025 * a, 0.08), mat=skin, parent=trunk, segs=12)
    K.anim(lambda t, f: setattr(trunk.rotation_euler, 'x', -0.2 + math.sin(t * 1.4) * 0.25))
    _feet(body, skin, x=0.2, r=(0.15, 0.17, 0.09))
    K._eyes(head, 0, -0.3, 0.1, 0.05, 0.15, 0.9)
    K._cheeks(head, 0, -0.28, -0.04, 0.24)
    tail = K.empty('tail', (0, 0.38, 0.45), body)
    prim('cyl', 'el_tail', (0, 0.05, -0.1), (0.025, 0.025, 0.14), (0.4, 0, 0), mat=skin, parent=tail, segs=6)
    root['height'] = 1.48
    return root, body, head


def lion(name, color='#f0b648'):
    root, body = _base(name)
    fur, mane, light = F(color), F('#c4703a', fuzz=1.4), F('#fbe3b0')
    prim('sphere', 'l_body', (0, 0, 0.46), (0.37, 0.34, 0.46), mat=fur, parent=body)
    prim('sphere', 'l_belly', (0, -0.22, 0.42), (0.23, 0.14, 0.3), mat=light, parent=body)
    head = K.empty(f'{name}_head', (0, -0.03, 1.02), body)
    for k in range(14):
        a = k * 2 * math.pi / 14
        prim('sphere', 'l_mane', (math.cos(a) * 0.36, 0.06, math.sin(a) * 0.34), (0.16, 0.12, 0.16), mat=mane, parent=head, segs=12)
    prim('sphere', 'l_head', (0, 0, 0), (0.33, 0.3, 0.29), mat=fur, parent=head)
    prim('sphere', 'l_muzzle', (0, -0.25, -0.09), (0.15, 0.1, 0.1), mat=light, parent=head, segs=14)
    prim('sphere', 'l_nose', (0, -0.34, -0.04), (0.06, 0.04, 0.04), mat=F('#9a4f3a'), parent=head, segs=10)
    for sx in (-1, 1):
        ear = K.empty('ear', (sx * 0.24, 0, 0.22), head)
        prim('sphere', 'l_ear', (0, -0.04, 0), (0.08, 0.05, 0.08), mat=fur, parent=ear, segs=10)
        _arm(body, sx, 0.31, 0.62, fur)
    _feet(body, fur)
    K._eyes(head, 0, -0.25, 0.06, 0.05, 0.13, 1.1)
    K._cheeks(head, 0, -0.24, -0.06, 0.2)
    tail = K.empty('tail', (0.1, 0.3, 0.25), body)
    prim('cyl', 'l_tail', (0.12, 0.05, 0.15), (0.03, 0.03, 0.22), (0, 0.6, 0), mat=fur, parent=tail, segs=6)
    prim('sphere', 'l_tuft', (0.25, 0.08, 0.33), (0.08, 0.08, 0.09), mat=mane, parent=tail, segs=10)
    root['height'] = 1.38
    return root, body, head


def penguin(name, color='#2f3346'):
    root, body = _base(name)
    black, white, orange = F(color), F('#fbfbf6'), F('#ee8a33')
    prim('sphere', 'p_body', (0, 0, 0.5), (0.36, 0.33, 0.52), mat=black, parent=body)
    prim('sphere', 'p_belly', (0, -0.18, 0.45), (0.27, 0.18, 0.42), mat=white, parent=body)
    head = K.empty(f'{name}_head', (0, -0.02, 1.0), body)
    prim('sphere', 'p_head', (0, 0, 0), (0.3, 0.28, 0.27), mat=black, parent=head)
    prim('sphere', 'p_face', (0, -0.14, -0.02), (0.22, 0.16, 0.19), mat=white, parent=head, segs=16)
    prim('cone', 'p_beak', (0, -0.33, -0.05), (1, 1, 0.08), (math.pi / 2, 0, 0), mat=orange, parent=head, segs=10, r1=0.06, r2=0.0)
    for sx in (-1, 1):
        arm = K.empty('arm', (sx * 0.34, 0, 0.72), body)
        prim('sphere', 'p_flipper', (sx * 0.02, 0, -0.18), (0.06, 0.12, 0.24), mat=black, parent=arm, segs=12)
    _feet(body, orange, r=(0.1, 0.16, 0.04))
    K._eyes(head, 0, -0.27, 0.05, 0.045, 0.1, 0.5)
    K._cheeks(head, 0, -0.27, -0.06, 0.15)
    prim('torus', 'p_scarf', (0, 0, 0.85), (0.26, 0.24, 0.22), mat=F('#4fa8f0'), parent=body, segs=18, minor=0.18)
    root['height'] = 1.28
    return root, body, head


def dinosaur(name, color='#6fbf6a'):
    root, body = _base(name)
    skin, belly, plate = F(color), F('#e9e0a8'), F('#f2a14c')
    prim('sphere', 'dn_body', (0, 0.05, 0.52), (0.4, 0.4, 0.52), mat=skin, parent=body)
    prim('sphere', 'dn_belly', (0, -0.24, 0.45), (0.26, 0.16, 0.34), mat=belly, parent=body)
    head = K.empty(f'{name}_head', (0, -0.08, 1.12), body)
    prim('sphere', 'dn_head', (0, 0, 0), (0.34, 0.33, 0.3), mat=skin, parent=head)
    prim('sphere', 'dn_snout', (0, -0.3, -0.08), (0.27, 0.2, 0.17), mat=skin, parent=head)
    for sx in (-1, 1):
        prim('sphere', 'dn_nostril', (sx * 0.07, -0.47, -0.02), (0.02, 0.01, 0.015), mat=F('#3f7a42'), parent=head, segs=6)
        _arm(body, sx, 0.33, 0.7, skin, r=0.06, length=0.12)
    sm = K.outline_obj('dn_smile', [(-0.16, 0), (0, -0.07), (0.16, 0), (0, -0.035)], 0.02, F('#3f5a3a'), bevel=0.004)
    sm.parent = head
    sm.location = (0, -0.48, -0.13)
    for k in range(5):
        prim('cone', 'dn_plate', (0, 0.3 + k * 0.02, 1.2 - k * 0.22), (1, 0.4, 0.12), (-0.4 - k * 0.15, 0, 0), mat=plate, parent=body, segs=4, r1=0.11, r2=0.0)
    _feet(body, skin, x=0.2, r=(0.14, 0.2, 0.08))
    K._eyes(head, 0, -0.24, 0.12, 0.055, 0.15, 1.5)
    K._cheeks(head, 0, -0.38, -0.08, 0.2)
    tail = K.empty('tail', (0, 0.35, 0.3), body)
    for k in range(5):
        prim('sphere', 'dn_tail', (0.12 * k, 0.12 + 0.13 * k, -0.04 * k), (0.2 - k * 0.035, 0.2 - k * 0.035, 0.16 - k * 0.025), mat=skin, parent=tail, segs=12)
    root['height'] = 1.48
    return root, body, head


def dragon(name, color='#8a6ad9'):
    root, body = _base(name)
    skin, belly, horn = F(color), F('#f6d38a'), F('#fbf3e3')
    prim('sphere', 'dr_body', (0, 0, 0.48), (0.37, 0.34, 0.48), mat=skin, parent=body)
    prim('sphere', 'dr_belly', (0, -0.2, 0.44), (0.24, 0.16, 0.34), mat=belly, parent=body)
    for k in range(4):
        prim('cyl', 'dr_scale', (0, -0.33 - abs(k - 1.5) * 0.01, 0.25 + k * 0.13), (0.15 - abs(k - 1.5) * 0.02, 0.01, 0.01), (math.pi / 2, 0, 0), mat=F('#e8b85a'), parent=body, segs=12)
    head = K.empty(f'{name}_head', (0, -0.04, 1.04), body)
    prim('sphere', 'dr_head', (0, 0, 0), (0.33, 0.31, 0.29), mat=skin, parent=head)
    prim('sphere', 'dr_snout', (0, -0.27, -0.08), (0.2, 0.15, 0.13), mat=skin, parent=head, segs=16)
    for sx in (-1, 1):
        prim('sphere', 'dr_nostril', (sx * 0.06, -0.41, -0.03), (0.02, 0.01, 0.015), mat=F('#5a3a8a'), parent=head, segs=6)
        prim('cone', 'dr_horn', (sx * 0.15, 0.05, 0.3), (1, 1, 0.12), (0, sx * -0.3, 0), mat=horn, parent=head, segs=10, r1=0.05, r2=0.0)
        ear = K.empty('ear', (sx * 0.3, 0.05, 0.1), head)
        prim('cone', 'dr_ear', (sx * 0.06, 0, 0), (1, 0.4, 0.1), (0, sx * -1.2, 0), mat=skin, parent=ear, segs=6, r1=0.08, r2=0.0)
        wing = K.empty('wing', (sx * 0.25, 0.25, 0.85), body)
        w = K.outline_obj('dr_wing', [(0, 0), (sx * 0.35, 0.3), (sx * 0.62, 0.15), (sx * 0.55, -0.05), (sx * 0.42, 0.02), (sx * 0.35, -0.15), (sx * 0.2, -0.05)], 0.03, F('#c6a9f3'), bevel=0.01)
        w.parent = wing
        _arm(body, sx, 0.31, 0.62, skin, r=0.065)
    _feet(body, skin)
    K._eyes(head, 0, -0.25, 0.08, 0.055, 0.13, 2.3)
    K._cheeks(head, 0, -0.26, -0.06, 0.2)
    tail = K.empty('tail', (0, 0.3, 0.2), body)
    for k in range(5):
        prim('sphere', 'dr_tail', (0.1 * k, 0.1 + 0.1 * k, 0.02 * k), (0.12 - k * 0.018, 0.12 - k * 0.018, 0.1), mat=skin, parent=tail, segs=10)
    prim('cone', 'dr_tail_tip', (0.5, 0.55, 0.1), (1, 0.4, 0.1), (0, 1.0, 0), mat=F('#f2a14c'), parent=tail, segs=4, r1=0.1, r2=0.0)
    root['height'] = 1.38
    return root, body, head


def _quadruped(name, coat, mane_cols, horn=False, saddle=None):
    """A felt horse seen from the side (head towards +X), on four legs that walk."""
    root, body = _base(name)
    root['side_view'] = True
    fur = F(coat)
    prim('sphere', 'h_body', (0, 0, 0.92), (0.62, 0.3, 0.34), mat=fur, parent=body)
    for (x, sx) in ((0.42, 1), (-0.42, -1)):
        for side, y in ((1, -0.14), (-1, 0.14)):
            lg = K.empty('leg', (x, y, 0.75), body)
            lg['side'] = side * sx
            prim('sphere', 'h_leg', (0, 0, -0.33), (0.08, 0.08, 0.36), mat=fur, parent=lg, segs=12)
            prim('sphere', 'h_hoof', (0, 0, -0.7), (0.09, 0.1, 0.06), mat=F('#5a3a2b'), parent=lg, segs=10)
    neck = K.empty('h_neck', (0.5, 0, 1.1), body)
    prim('sphere', 'h_neckm', (0.08, 0, 0.18), (0.16, 0.16, 0.32), (0, 0.5, 0), mat=fur, parent=neck, segs=14)
    head = K.empty(f'{name}_head', (0.78, 0, 1.55), body)
    prim('sphere', 'h_head', (0, 0, 0), (0.24, 0.2, 0.22), mat=fur, parent=head)
    prim('sphere', 'h_muzzle', (0.2, 0, -0.1), (0.15, 0.14, 0.12), mat=F('#f4e3d0'), parent=head, segs=14)
    for sy in (-1, 1):
        prim('sphere', 'h_nostril', (0.33, sy * 0.06, -0.08), (0.02, 0.015, 0.02), mat=F('#6b4532'), parent=head, segs=6)
        ear = K.empty('ear', (-0.06, sy * 0.1, 0.2), head)
        prim('cone', 'h_ear', (0, 0, 0.07), (0.5, 1, 0.08), mat=fur, parent=ear, segs=8, r1=0.07, r2=0.0)
    # the camera sees the -Y side: eyes on both sides, the near one shows
    for sy in (-1, 1):
        e = prim('sphere', 'eye', (0.05, sy * 0.19, 0.06), (0.05, 0.035, 0.055), mat=K.glossy('#15131c'), parent=head, segs=12)
        prim('sphere', 'glint', (0.07, sy * 0.215, 0.08), (0.015, 0.01, 0.015), mat=K.glow('#ffffff', 2.0), parent=head, segs=6)
    prim('sphere', 'cheek', (0.12, -0.19, -0.06), (0.06, 0.02, 0.045), mat=F('#f29aa6', sheen=0.5), parent=head, segs=10)
    for k in range(7):
        prim('sphere', 'h_mane', (0.45 + k * 0.06 - (0.0 if k < 5 else 0.02), 0, 1.25 + k * 0.065), (0.09, 0.12, 0.1), mat=F(mane_cols[k % len(mane_cols)], fuzz=1.3), parent=body, segs=10)
    tail = K.empty('tail', (-0.6, 0, 1.0), body)
    for k in range(5):
        prim('sphere', 'h_tail', (-0.08 - k * 0.04, 0, -0.08 - k * 0.11), (0.08, 0.08, 0.12), mat=F(mane_cols[k % len(mane_cols)], fuzz=1.3), parent=tail, segs=10)
    if horn:
        hn = prim('cone', 'u_horn', (0.05, 0, 0.32), (1, 1, 0.16), (0, 0.35, 0), mat=F('#f6d38a', emit=0.5, emit_color='#ffe7a3', sheen=0.6), parent=head, segs=12, r1=0.045, r2=0.0)
    if saddle:
        prim('sphere', 'saddle', (-0.05, 0, 1.2), (0.26, 0.32, 0.06), mat=F(saddle), parent=body, segs=14)
    root['height'] = 1.8
    root['saddle'] = 1.2
    return root, body, head


def horse(name, color='#a8693f'):
    return _quadruped(name, color, ['#4a2f22', '#5a3a2b'], saddle='#d9473f')


def unicorn(name, color='#fbf6f2'):
    return _quadruped(name, color, ['#f2799a', '#f2c94c', '#66c792', '#4fa8f0', '#b17ad9'], horn=True, saddle='#b8a4f0')


def fish(name, color='#f2a14c'):
    """A round felt fish that swims in the air (or the sea), side on, with a waving tail."""
    root, body = _base(name)
    root['side_view'] = True
    swim = K.empty('fish_float', (0, 0, 0.75), body)
    prim('sphere', 'fi_body', (0, 0, 0), (0.42, 0.18, 0.32), mat=F(color), parent=swim)
    prim('sphere', 'fi_belly', (0.05, 0, -0.12), (0.3, 0.16, 0.16), mat=F('#fbe3b0'), parent=swim, segs=16)
    for k in range(3):
        prim('cyl', 'fi_stripe', (-0.12 + k * 0.14, 0, 0), (0.035, 0.035, 0.29 - abs(k - 1) * 0.04), mat=F('#fbfbf6'), parent=swim, segs=8).scale = (0.035, 0.19, 0.3 - abs(k - 1) * 0.05)
    head = K.empty(f'{name}_head', (0.25, 0, 0.05), swim)
    for sy in (-1, 1):
        prim('sphere', 'eye', (0.04, sy * 0.15, 0.06), (0.05, 0.03, 0.06), mat=K.glossy('#15131c'), parent=head, segs=12)
        prim('sphere', 'glint', (0.06, sy * 0.175, 0.08), (0.015, 0.01, 0.015), mat=K.glow('#ffffff', 2.0), parent=head, segs=6)
    prim('sphere', 'cheek', (0.06, -0.15, -0.05), (0.05, 0.02, 0.04), mat=F('#f29aa6', sheen=0.5), parent=head, segs=10)
    tail = K.empty('tail', (-0.38, 0, 0), swim)
    tf = K.outline_obj('fi_tail', [(0, 0), (-0.3, 0.25), (-0.22, 0), (-0.3, -0.25)], 0.05, F(color), bevel=0.015)
    tf.parent = tail
    tf.location.y = -0.025
    fin = K.outline_obj('fi_fin', [(-0.15, 0.28), (0.12, 0.3), (-0.05, 0.45)], 0.04, F(color), bevel=0.01)
    fin.parent = swim
    fin.location.y = -0.02
    K.anim(lambda t, f: (setattr(tail.rotation_euler, 'z', math.sin(t * 6) * 0.4), setattr(swim.location, 'z', 0.75 + math.sin(t * 1.6) * 0.08)))
    root['height'] = 1.1
    return root, body, head


def turtle(name, color='#7fbf6a'):
    root, body = _base(name)
    skin, shell, rim = F(color), F('#6a8a3a'), F('#c4a85a')
    prim('sphere', 'tu_body', (0, 0.05, 0.42), (0.34, 0.3, 0.4), mat=skin, parent=body)
    prim('sphere', 'tu_plastron', (0, -0.2, 0.4), (0.25, 0.12, 0.32), mat=F('#f2dc8a'), parent=body, segs=16)
    prim('sphere', 'tu_shell', (0, 0.22, 0.48), (0.46, 0.3, 0.46), mat=shell, parent=body)
    prim('torus', 'tu_rim', (0, 0.22, 0.48), (0.46, 0.46, 0.46), (math.pi / 2, 0, 0), mat=rim, parent=body, segs=28, minor=0.08)
    for k, (x, z) in enumerate(((0, 0.75), (-0.22, 0.48), (0.22, 0.48), (0, 0.25))):
        prim('cyl', 'tu_hex', (x, 0.5, z), (0.1, 0.1, 0.02), (math.pi / 2, 0, 0), mat=F('#89a84a'), parent=body, segs=6)
    head = K.empty(f'{name}_head', (0, -0.05, 0.98), body)
    prim('sphere', 'tu_head', (0, 0, 0), (0.29, 0.27, 0.26), mat=skin, parent=head)
    for sx in (-1, 1):
        _arm(body, sx, 0.33, 0.6, skin, r=0.07)
    _feet(body, skin, r=(0.12, 0.16, 0.07))
    K._eyes(head, 0, -0.24, 0.06, 0.05, 0.12, 0.2)
    K._cheeks(head, 0, -0.23, -0.07, 0.18)
    root['height'] = 1.22
    return root, body, head


def bird(name, color='#4fa8f0'):
    root, body = _base(name)
    fur, belly, beak = F(color), F('#fbe3b0'), F('#f2c94c')
    prim('sphere', 'bi_body', (0, 0, 0.42), (0.3, 0.28, 0.36), mat=fur, parent=body)
    prim('sphere', 'bi_belly', (0, -0.17, 0.36), (0.2, 0.14, 0.24), mat=belly, parent=body)
    head = K.empty(f'{name}_head', (0, -0.02, 0.86), body)
    prim('sphere', 'bi_head', (0, 0, 0), (0.25, 0.24, 0.23), mat=fur, parent=head)
    prim('cone', 'bi_beak', (0, -0.27, -0.03), (1, 1, 0.07), (math.pi / 2, 0, 0), mat=beak, parent=head, segs=10, r1=0.06, r2=0.0)
    prim('cone', 'bi_tuft', (0, 0.02, 0.25), (1, 0.5, 0.08), (0.3, 0, 0), mat=fur, parent=head, segs=8, r1=0.05, r2=0.0)
    for sx in (-1, 1):
        wing = K.empty('wing', (sx * 0.28, 0.02, 0.55), body)
        prim('sphere', 'bi_wing', (sx * 0.04, 0, -0.12), (0.09, 0.18, 0.24), mat=F('#2f7ad0'), parent=wing, segs=14)
    tail = K.empty('tail', (0, 0.25, 0.25), body)
    for k in range(3):
        prim('sphere', 'bi_tail', ((k - 1) * 0.06, 0.1, 0.0), (0.05, 0.14, 0.04), ((k - 1) * 0.3, 0, 0), mat=F('#2f7ad0'), parent=tail, segs=8)
    for sx in (-1, 1):
        lg = K.empty('leg', (sx * 0.1, 0, 0.1), body)
        lg['side'] = sx
        prim('cyl', 'bi_leg', (0, 0, -0.04), (0.02, 0.02, 0.06), mat=beak, parent=lg, segs=6)
        prim('sphere', 'bi_foot', (0, -0.05, -0.09), (0.05, 0.07, 0.02), mat=beak, parent=lg, segs=8)
    K._eyes(head, 0, -0.2, 0.05, 0.045, 0.1, 1.2)
    K._cheeks(head, 0, -0.2, -0.06, 0.15, 0.05)
    root['height'] = 1.05
    return root, body, head


def frog(name, color='#6fbf4a'):
    root, body = _base(name)
    skin, belly = F(color), F('#d8ec9a')
    prim('sphere', 'fr_body', (0, 0, 0.36), (0.38, 0.33, 0.36), mat=skin, parent=body)
    prim('sphere', 'fr_belly', (0, -0.2, 0.32), (0.26, 0.14, 0.24), mat=belly, parent=body)
    head = K.empty(f'{name}_head', (0, -0.04, 0.78), body)
    prim('sphere', 'fr_head', (0, 0, 0), (0.38, 0.32, 0.24), mat=skin, parent=head)
    sm = K.outline_obj('fr_smile', [(-0.24, 0), (0, -0.1), (0.24, 0), (0, -0.055)], 0.02, F('#3f6a2a'), bevel=0.004)
    sm.parent = head
    sm.location = (0, -0.3, -0.06)
    for sx in (-1, 1):
        prim('sphere', 'fr_eyebump', (sx * 0.18, -0.08, 0.2), (0.13, 0.13, 0.12), mat=skin, parent=head, segs=14)
        _arm(body, sx, 0.33, 0.5, skin, r=0.06, length=0.14)
    K._eyes(head, 0, -0.18, 0.22, 0.06, 0.18, 0.6)
    K._cheeks(head, 0, -0.27, -0.02, 0.24)
    for sx in (-1, 1):
        lg = K.empty('leg', (sx * 0.22, 0, 0.12), body)
        lg['side'] = sx
        prim('sphere', 'fr_thigh', (sx * 0.06, 0.02, 0.04), (0.12, 0.16, 0.1), mat=skin, parent=lg, segs=12)
        prim('sphere', 'fr_foot', (sx * 0.06, -0.14, -0.08), (0.12, 0.16, 0.035), mat=skin, parent=lg, segs=12)
    root['height'] = 1.04
    return root, body, head


ANIMALS = {'dog': dog, 'cat': cat, 'bear': bear, 'elephant': elephant, 'lion': lion, 'penguin': penguin,
           'dinosaur': dinosaur, 'dragon': dragon, 'unicorn': unicorn, 'horse': horse, 'fish': fish, 'turtle': turtle,
           'bird': bird, 'frog': frog}
SCALE = {'dog': 1.05, 'cat': 1.0, 'bear': 1.15, 'elephant': 1.2, 'lion': 1.1, 'penguin': 0.95, 'dinosaur': 1.2,
         'dragon': 1.1, 'unicorn': 1.0, 'horse': 1.0, 'fish': 1.0, 'turtle': 0.95, 'bird': 0.85, 'frog': 0.95}
