"""Felt people for the Story Builder kit: kids, grown-ups and grandparents, in the same felt-and-paper look as the
animals in feltkit.py (bead eyes with a glint that blink, felt cheeks, soft felt shapes, no hair simulation).

    root, body, head = person('kid0', 'kid', {'hair_color': 'blonde', 'hair': 'short', 'skin': 'fair',
                                             'shirt': 'blue', 'outfit': 'sports_kit', 'glasses': False, 'age': 'big'})

A look is optional: anything left out is picked from the character's seed (so the same `who` always looks the same).
Every name a story may use (hair colours, skin tones, hair styles, shirt colours, outfits, ages) is listed in
server/stories/blender/catalog.json and must have an entry here (a test checks both ways).

The rig is a few empties, so felt_actions.py can move people and animals the same way:
  root > body > torso (pivot at the hips) > head, arm_L / arm_R (pivot at the shoulder, child `hand_*` at the end)
              > leg_L / leg_R (pivot at the hip)
Faces have three mouths (smile, open, sad) and brows; felt_actions shows the one the action needs.
"""
import math
import random

import bmesh
import bpy

import feltkit as K

HAIR_COLORS = {'blonde': '#efc75e', 'brown': '#7a4a2b', 'black': '#2b2427', 'red': '#c8562e', 'grey': '#b8b4ae', 'white': '#efebe4'}
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

DENIM = '#4a6aa0'
WHITE = '#f6f3ec'
SHOE = '#4a3a36'


def _lighter(h, k=0.35):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) for i in (0, 2, 4)]
    return '#' + ''.join(f'{int(v + (255 - v) * k):02x}' for v in c)


def _darker(h, k=0.25):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) for i in (0, 2, 4)]
    return '#' + ''.join(f'{int(v * (1 - k)):02x}' for v in c)


def resolve_look(kind, look, seed_text='x'):
    """Fill in a look: what the story gave, the rest picked from the seed (stable for the same `who`)."""
    look = dict(look or {})
    rng = random.Random(sum((i + 1) * ord(c) for i, c in enumerate(str(seed_text))))
    out = {}
    out['skin'] = look.get('skin') if look.get('skin') in SKIN else rng.choice(list(SKIN))
    if kind == 'grandparent':
        default_hc = rng.choice(['grey', 'white'])
    else:
        default_hc = rng.choice(['blonde', 'brown', 'black', 'red', 'brown', 'black'])
    out['hair_color'] = look.get('hair_color') if look.get('hair_color') in HAIR_COLORS else default_hc
    hairs = ['short', 'long', 'curly', 'ponytail', 'bun'] if kind != 'grandparent' else ['short', 'bun', 'curly', 'bald']
    out['hair'] = look.get('hair') if look.get('hair') in HAIR else rng.choice(hairs)
    out['shirt'] = look.get('shirt') if look.get('shirt') in SHIRTS else rng.choice(list(SHIRTS))
    out['outfit'] = look.get('outfit') if look.get('outfit') in OUTFITS else 'casual'
    out['glasses'] = bool(look.get('glasses')) if 'glasses' in look else (kind == 'grandparent' and rng.random() < 0.6)
    out['age'] = look.get('age') if look.get('age') in AGES else 'big'
    return out


# ---------------------------------------------------------------- shapes
def _shell(name, r, keep, mat, parent, loc=(0, 0, 0), scale=(1, 1, 1), thick=0.035, segs=28):
    """A felt hair shell: a sphere of radius r with the vertices where keep(nx, ny, nz) is False cut away, given a
    felt thickness (solidify), so the cut edge reads as a hairline."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=segs // 2, radius=r)
    gone = [v for v in bm.verts if not keep(v.co.x / r, v.co.y / r, v.co.z / r)]
    bmesh.ops.delete(bm, geom=gone, context='VERTS')
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    K.link(ob)
    ob.data.materials.append(mat)
    K.smooth(ob)
    ob.parent = parent
    ob.location = loc
    ob.scale = scale
    m = ob.modifiers.new('felt', 'SOLIDIFY')
    m.thickness = thick
    m.offset = 1.0
    return ob


def _arc_pts(w, h, inner=0.45, n=10, flip=False):
    """A crescent (a smile) as an outline in the XZ plane, w wide and h deep."""
    lo = [(-w + 2 * w * i / n, -h * (1 - ((-w + 2 * w * i / n) / w) ** 2)) for i in range(n + 1)]
    hi = [(x, z * inner) for x, z in reversed(lo[1:-1])]
    pts = lo + hi
    if flip:
        pts = [(x, -z - h * 0.3) for x, z in pts]
    return pts


def _face(head, r, skin_hex, hair_hex, seed=0.0):
    skin = K.felt(skin_hex, fuzz=0.6, sheen=0.5)
    # face: a soft ball, a touch wider than deep
    K.prim('sphere', 'p_face', (0, 0, 0), (r, r * 0.94, r * 0.97), mat=skin, parent=head, segs=28)
    for sx in (-1, 1):
        K.prim('sphere', 'p_ear', (sx * r * 0.95, 0.02, -r * 0.05), (r * 0.17, r * 0.1, r * 0.22), mat=skin, parent=head, segs=12)
    K.prim('sphere', 'p_nose', (0, -r * 0.93, -r * 0.12), (r * 0.11, r * 0.08, r * 0.09), mat=K.felt(_darker(skin_hex, 0.08), fuzz=0.6), parent=head, segs=12)
    K._eyes(head, 0, -r * 0.84, r * 0.08, r * 0.15, r * 0.33, seed)
    K._cheeks(head, 0, -r * 0.84, -r * 0.2, r * 0.5, r * 0.2)
    mouth_col = K.felt('#7a2f3c', fuzz=0.4)
    sm = K.outline_obj('mouth_smile', _arc_pts(r * 0.24, r * 0.16), 0.03, mouth_col, bevel=0.006)
    sm.parent = head
    sm.location = (0, -r * 0.9, -r * 0.36)
    sad = K.outline_obj('mouth_sad', _arc_pts(r * 0.18, r * 0.1, flip=True), 0.03, mouth_col, bevel=0.006)
    sad.parent = head
    sad.location = (0, -r * 0.9, -r * 0.32)
    sad['rest'] = tuple(sad.scale)
    sad.scale = (0, 0, 0)
    op = K.prim('sphere', 'mouth_open', (0, -r * 0.86, -r * 0.4), (r * 0.17, r * 0.08, r * 0.14), mat=mouth_col, parent=head, segs=14)
    K.prim('sphere', 'mouth_open_tongue', (0, -0.012, -0.35), (0.7, 0.5, 0.45), mat=K.felt('#e7798a'), parent=op, segs=10)
    op['rest'] = tuple(op.scale)
    op.scale = (0, 0, 0)
    for sx in (-1, 1):
        b = K.outline_obj('brow', [(-r * 0.13, 0), (r * 0.13, 0), (r * 0.11, r * 0.05), (-r * 0.11, r * 0.05)], 0.02, K.felt(hair_hex), bevel=0.005)
        b.parent = head
        b.location = (sx * r * 0.33, -r * 0.88, r * 0.36)
        b['side'] = sx
    return skin


def _hair(head, r, style, col, rng):
    mat = K.felt(col, fuzz=1.2, sheen=1.0)
    face_cut = lambda x, y, z: not (y < -0.2 and z < 0.52 - 0.5 * x * x)
    if style == 'bald':
        # a ring of hair around the back and sides, the top bare
        _shell('hair', r * 1.05, lambda x, y, z: face_cut(x, y, z) and -0.45 < z < 0.25 and y > -0.55, mat, head, thick=0.05)
        return
    if style == 'buzz':
        _shell('hair', r * 1.02, lambda x, y, z: face_cut(x, y + 0.1, z - 0.12) and z > -0.3, mat, head, thick=0.018)
        return
    low = {'short': -0.45, 'long': -0.75, 'curly': -0.5, 'ponytail': -0.45, 'bun': -0.45}.get(style, -0.45)
    _shell('hair', r * 1.06, lambda x, y, z: face_cut(x, y, z) and z > low, mat, head, thick=0.04)
    # a soft fringe: three felt scallops across the hairline
    for i, sx in enumerate((-0.42, 0.0, 0.42)):
        K.prim('sphere', 'fringe', (sx * r, -r * 0.8, r * (0.52 - abs(sx) * 0.25)), (r * 0.3, r * 0.17, r * 0.18), (0.35, sx * 0.6, 0), mat=mat, parent=head, segs=14)
    if style == 'short':
        K.prim('cone', 'tuft', (r * 0.05, -r * 0.1, r * 1.06), (1, 1, r * 0.16), (0.3, 0.25, 0), mat=mat, parent=head, segs=10, r1=r * 0.12, r2=0.0)
    elif style == 'long':
        for sx in (-1, 1):
            K.prim('sphere', 'hair_side', (sx * r * 0.88, r * 0.08, -r * 0.55), (r * 0.26, r * 0.42, r * 0.62), mat=mat, parent=head, segs=16)
        K.prim('sphere', 'hair_back', (0, r * 0.45, -r * 0.55), (r * 0.82, r * 0.35, r * 0.75), mat=mat, parent=head, segs=18)
    elif style == 'curly':
        for k in range(26):
            a = rng.uniform(0, 2 * math.pi)
            z = rng.uniform(-0.45, 1.0)
            rr = math.sqrt(max(0.0, 1 - z * z))
            x, y = math.cos(a) * rr, math.sin(a) * rr
            if y < -0.25 and z < 0.5:
                continue
            K.prim('sphere', 'curl', (x * r * 1.08, y * r * 1.06, z * r * 1.06), [r * rng.uniform(0.2, 0.27)] * 3, mat=mat, parent=head, segs=10)
    elif style == 'ponytail':
        tail = K.empty('ponytail', (r * 0.3, r * 0.75, r * 0.45), head)
        K.prim('torus', 'pony_tie', (0, 0, 0), (r * 0.15, r * 0.15, r * 0.15), (0.9, 0.5, 0), mat=K.felt('#e2557a'), parent=tail, segs=14, minor=0.4)
        K.prim('sphere', 'pony', (r * 0.18, r * 0.12, -r * 0.42), (r * 0.22, r * 0.2, r * 0.55), (0.2, -0.45, 0), mat=mat, parent=tail, segs=14)
    elif style == 'bun':
        K.prim('sphere', 'bun', (0, r * 0.35, r * 0.95), (r * 0.36, r * 0.33, r * 0.3), mat=mat, parent=head, segs=16)


def _glasses(head, r):
    frame = K.felt('#3a3346', fuzz=0.3)
    for sx in (-1, 1):
        K.prim('torus', 'glasses', (sx * r * 0.33, -r * 0.93, r * 0.08), (r * 0.2, r * 0.2, r * 0.2), (math.pi / 2, 0, 0), mat=frame, parent=head, segs=20, minor=0.14)
    K.prim('cyl', 'glasses_bridge', (0, -r * 0.97, r * 0.1), (0.008, 0.008, r * 0.11), (0, math.pi / 2, 0), mat=frame, parent=head, segs=6)


# ---------------------------------------------------------------- outfits
def _outfit(o, shirt_hex, kind):
    """-> what each part is made of. `extras` are drawn after the body (hats, capes, coats, badges)."""
    team = shirt_hex
    d = dict(shirt=shirt_hex, pants=DENIM, sleeves='short', legs='pants', shoes=SHOE, socks=None, skirt=None, extras=[])
    if kind != 'kid':
        d['sleeves'] = 'long'
    if o == 'dress':
        d.update(pants=shirt_hex, legs='bare', skirt=shirt_hex, shoes='#c74b62')
    elif o == 'sports_kit':
        d.update(pants=WHITE if team not in ('#f4f1ea',) else '#2c3d72', legs='shorts', socks=team, shoes='#2b2b33', sleeves='short', extras=['stripe'])
    elif o == 'pyjamas':
        d.update(shirt='#9cc3ea' if team in ('#3f74c9', '#2c3d72') else _lighter(team, 0.5), pants=None, sleeves='long', shoes='#f0b7c8', extras=['dots'])
        d['pants'] = d['shirt']
    elif o == 'swimsuit':
        d.update(pants=team, legs='shorts', shoes=None, sleeves='short', extras=['swim'])
    elif o == 'winter_coat':
        d.update(shirt=team, sleeves='long', pants='#3c4a6b', shoes='#6b4532', extras=['coat', 'scarf', 'beanie', 'mittens'])
    elif o == 'astronaut':
        d.update(shirt='#eef0f3', pants='#eef0f3', sleeves='long', shoes='#9aa3b5', extras=['space'])
    elif o == 'pirate':
        d.update(shirt=WHITE, pants='#3a3346', legs='shorts' if kind == 'kid' else 'pants', sleeves='long', shoes='#3a2a26', extras=['pirate'])
        d['team'] = team
    elif o == 'knight':
        d.update(shirt='#aeb6c4', pants='#7d8597', sleeves='long', shoes='#5c6070', extras=['knight'])
        d['team'] = team
    elif o == 'princess':
        d.update(pants=team, legs='bare', skirt=team, sleeves='short', shoes='#f2c94c', extras=['crown', 'gown'])
    elif o == 'superhero':
        d.update(sleeves='long', pants=team, shoes='#f2c94c' if team != '#f2c94c' else '#d9473f', extras=['cape', 'chest_star'])
    elif o == 'coach':
        d.update(sleeves='long', pants=_darker(team, 0.35), shoes='#f4f1ea', extras=['cap', 'whistle', 'track'])
    elif o == 'teacher':
        d.update(shirt=WHITE, pants='#5b4a6b', sleeves='long', extras=['cardigan'])
        d['team'] = team
    elif o == 'doctor':
        d.update(shirt=_lighter(team, 0.55), pants='#4a6a8a', sleeves='long', extras=['labcoat', 'stethoscope'])
    elif o == 'chef':
        d.update(shirt=WHITE, pants='#3a3346', sleeves='long', extras=['chef_hat', 'apron'])
    elif o == 'overalls':
        d.update(pants=DENIM, sleeves='short', extras=['bib'])
    elif kind == 'grandparent':
        d['extras'] = ['cardigan']
        d['team'] = team
        d['shirt'] = WHITE if team != WHITE else '#cfe0f0'
        d['pants'] = '#6b6458'
    return d


# ---------------------------------------------------------------- the person
PROPORTIONS = {
    #               leg   torso  width  head r  arm
    'kid':         (0.34, 0.40, 0.25, 0.30, 0.36),
    'grownup':     (0.60, 0.56, 0.29, 0.28, 0.54),
    'grandparent': (0.52, 0.52, 0.30, 0.28, 0.50),
}


def person(name, kind='kid', look=None, seed_text=None):
    """A felt person -> (root, body, head). kind: kid | grownup | grandparent."""
    kind = kind if kind in PROPORTIONS else 'kid'
    L = resolve_look(kind, look, seed_text or name)
    rng = random.Random(hash(name) & 0xffff)
    leg, torso_h, w, r, arm_len = PROPORTIONS[kind]
    small = kind == 'kid' and L['age'] == 'small'
    if small:
        leg, torso_h, w, arm_len = leg * 0.78, torso_h * 0.85, w * 0.92, arm_len * 0.85
        r *= 0.97
    O = _outfit(L['outfit'], SHIRTS[L['shirt']], kind)
    skin_hex = SKIN[L['skin']]
    hair_hex = HAIR_COLORS[L['hair_color']]
    skin = K.felt(skin_hex, fuzz=0.6, sheen=0.5)
    shirt = K.felt(O['shirt'])
    pants = K.felt(O['pants']) if O['pants'] else shirt
    root = K.empty(name)
    root['person'] = kind
    root['outfit'] = L['outfit']
    root['height'] = leg + torso_h + 2 * r + 0.08
    body = K.empty(f'{name}_body', (0, 0, 0), root)
    hip_z = leg + 0.07
    root['hip'] = hip_z
    # torso pivots at the hips, so a person can lean (run, sad, laugh) without the legs coming along
    torso = K.empty('torso', (0, 0, hip_z), body)
    stoop = 0.12 if kind == 'grandparent' else 0.0
    torso.rotation_euler.x = 0.0
    torso['rest_x'] = -stoop
    # hips / shorts
    K.prim('sphere', 'p_hips', (0, 0, 0.04), (w * 0.94, w * 0.76, torso_h * 0.3), mat=pants, parent=torso, segs=20)
    # chest: the shirt, a soft egg
    K.prim('sphere', 'p_chest', (0, 0, torso_h * 0.5), (w, w * 0.8, torso_h * 0.58), mat=shirt, parent=torso, segs=24)
    if O['skirt']:
        K.prim('cone', 'p_skirt', (0, 0, torso_h * 0.05), (1, 0.85, torso_h * 0.32), mat=K.felt(O['skirt']), parent=torso, segs=24, r1=w * 1.35, r2=w * 0.8)
    neck_z = torso_h * 1.02
    K.prim('cyl', 'p_neck', (0, 0, neck_z), (r * 0.3, r * 0.3, r * 0.2), mat=skin, parent=torso, segs=12)
    head = K.empty(f'{name}_head', (0, -0.02, neck_z + r * 0.92), torso)
    head['r'] = r
    hs = 1.06 if small else 1.0
    head.scale = (hs, hs, hs)
    _face(head, r, skin_hex, hair_hex, rng.uniform(0, 3))
    hatted = any(x in O['extras'] for x in ('beanie', 'chef_hat', 'space', 'knight'))
    _hair(head, r, 'short' if (hatted and L['hair'] in ('long', 'curly', 'bun', 'ponytail') and 'space' in O['extras']) else L['hair'], hair_hex, rng)
    if L['glasses']:
        _glasses(head, r)
    # arms: the pivot at the shoulder, a sleeve, the arm, a mitten hand and a `hand` empty to hold things
    sleeve_mat = shirt
    for sx, side in ((-1, 'L'), (1, 'R')):
        arm = K.empty(f'arm_{side}', (sx * (w * 0.98), 0, torso_h * 0.86), torso)
        arm['side'] = sx
        arm['len'] = arm_len
        long_sl = O['sleeves'] == 'long'
        K.prim('sphere', 'p_sleeve', (0, 0, -arm_len * (0.45 if long_sl else 0.18)), (0.075, 0.075, arm_len * (0.52 if long_sl else 0.24)), mat=sleeve_mat, parent=arm, segs=14)
        if not long_sl:
            K.prim('sphere', 'p_arm', (0, 0, -arm_len * 0.55), (0.055, 0.055, arm_len * 0.42), mat=skin, parent=arm, segs=12)
        hand_mat = K.felt('#d9473f' if 'mittens' in O['extras'] else ('#eef0f3' if 'space' in O['extras'] else skin_hex), fuzz=0.6)
        K.prim('sphere', 'p_hand', (0, -0.01, -arm_len * 0.98), (0.07, 0.065, 0.075), mat=hand_mat, parent=arm, segs=12)
        K.empty(f'hand_{side}', (0, -0.04, -arm_len * 1.02), arm)
        arm.rotation_euler.y = -sx * 0.12
    # legs: the pivot at the hip, the leg (trouser, shorts or bare), a sock and a shoe
    for sx, side in ((-1, 'L'), (1, 'R')):
        lg = K.empty(f'leg_{side}', (sx * w * 0.45, 0, hip_z), body)
        lg['side'] = sx
        lg['len'] = leg
        if O['legs'] == 'pants':
            K.prim('sphere', 'p_leg', (0, 0, -leg * 0.48), (0.085, 0.085, leg * 0.55), mat=pants, parent=lg, segs=14)
        else:
            if O['legs'] == 'shorts':
                K.prim('sphere', 'p_short', (0, 0, -leg * 0.14), (0.095, 0.09, leg * 0.25), mat=pants, parent=lg, segs=14)
            K.prim('sphere', 'p_leg', (0, 0, -leg * 0.55), (0.06, 0.06, leg * 0.46), mat=skin, parent=lg, segs=12)
        if O['socks']:
            K.prim('cyl', 'p_sock', (0, 0, -leg * 0.72), (0.068, 0.068, leg * 0.22), mat=K.felt(O['socks']), parent=lg, segs=12)
            K.prim('torus', 'p_sock_band', (0, 0, -leg * 0.52), (0.07, 0.07, 0.07), mat=K.felt(WHITE), parent=lg, segs=12, minor=0.22)
        if O['shoes']:
            K.prim('sphere', 'p_shoe', (0, -0.04, -leg - 0.02), (0.085, 0.13, 0.065), mat=K.felt(O['shoes'], fuzz=0.6), parent=lg, segs=14)
        else:
            K.prim('sphere', 'p_foot', (0, -0.03, -leg - 0.02), (0.065, 0.11, 0.05), mat=skin, parent=lg, segs=12)
    _extras(name, O, L, torso, head, body, w, torso_h, r, arm_len, skin_hex, kind)
    return root, body, head


def _badge_star(parent, loc, size, col='#f2c94c'):
    s = K.outline_obj('badge', K.star_pts(size, size * 0.48), 0.02, K.felt(col, sheen=0.6), bevel=0.006)
    s.parent = parent
    s.location = loc
    return s


def _extras(name, O, L, torso, head, body, w, th, r, arm_len, skin_hex, kind):
    team = O.get('team', O['shirt'])
    front = -w * 0.8
    for x in O['extras']:
        if x == 'stripe':
            # a football shirt: a contrasting collar and a chest band with a felt number badge
            K.prim('torus', 'kit_collar', (0, 0, th * 0.98), (w * 0.42, w * 0.38, w * 0.3), mat=K.felt(WHITE), parent=torso, segs=18, minor=0.2)
            K.prim('cyl', 'kit_band', (0, 0, th * 0.62), (w * 1.01, w * 0.81, 0.035), mat=K.felt(WHITE), parent=torso, segs=24)
        elif x == 'dots':
            for k, (dx, dz) in enumerate(((-0.4, 0.75), (0.3, 0.55), (-0.15, 0.35), (0.45, 0.85), (0.05, 0.75))):
                K.prim('sphere', 'pj_dot', (dx * w, front - 0.005 + abs(dx) * 0.08, dz * th), (0.028, 0.012, 0.028), mat=K.felt('#ffffff'), parent=torso, segs=8)
        elif x == 'swim':
            K.prim('torus', 'swim_ring', (0, 0, th * 0.98), (w * 0.4, w * 0.36, w * 0.3), mat=K.felt(WHITE), parent=torso, segs=18, minor=0.2)
        elif x == 'coat':
            coat = K.felt(team)
            K.prim('sphere', 'coat', (0, 0, th * 0.45), (w * 1.12, w * 0.92, th * 0.68), mat=coat, parent=torso, segs=24)
            for k in range(3):
                K.prim('sphere', 'coat_btn', (0, -w * 0.92, th * (0.25 + k * 0.2)), (0.025, 0.012, 0.025), mat=K.felt('#f4e3c3'), parent=torso, segs=8)
            K.prim('torus', 'coat_hem', (0, 0, th * 0.0), (w * 1.0, w * 0.82, w * 0.5), mat=K.felt(WHITE), parent=torso, segs=20, minor=0.13)
        elif x == 'scarf':
            K.prim('torus', 'scarf', (0, 0, th * 1.0), (w * 0.55, w * 0.5, w * 0.45), mat=K.felt('#e8b33d'), parent=torso, segs=18, minor=0.32)
            K.prim('sphere', 'scarf_end', (w * 0.25, -w * 0.6, th * 0.75), (0.06, 0.03, 0.15), (0, 0.2, 0), mat=K.felt('#e8b33d'), parent=torso, segs=10)
        elif x == 'beanie':
            _shell('beanie', r * 1.12, lambda x, y, z: z > 0.38 - 0.25 * y, K.felt(team), head, thick=0.05)
            K.prim('torus', 'beanie_band', (0, r * 0.12, r * 0.45), (r * 1.06, r * 1.02, r * 0.6), (0.18, 0, 0), mat=K.felt(WHITE), parent=head, segs=24, minor=0.12)
            K.prim('sphere', 'pompom', (0, r * 0.15, r * 1.15), (r * 0.25, r * 0.25, r * 0.25), mat=K.felt(WHITE), parent=head, segs=12)
        elif x == 'space':
            # a white suit with a chest panel, a backpack and a soft helmet hood framing the face
            K.prim('torus', 'helmet', (0, -r * 0.1, 0), (r * 1.15, r * 1.15, r * 1.15), (math.pi / 2, 0, 0), mat=K.felt('#eef0f3', sheen=0.4), parent=head, segs=28, minor=0.16)
            K.prim('sphere', 'helmet_back', (0, r * 0.35, 0), (r * 1.18, r * 0.85, r * 1.18), mat=K.felt('#eef0f3', sheen=0.4), parent=head, segs=22)
            K.prim('cyl', 'antenna', (r * 0.55, r * 0.2, r * 1.15), (0.012, 0.012, 0.12), mat=K.felt('#9aa3b5'), parent=head, segs=6)
            K.prim('sphere', 'antenna_tip', (r * 0.55, r * 0.2, r * 1.3), (0.035, 0.035, 0.035), mat=K.glow('#ff6b5b', 3.0), parent=head, segs=8)
            K.prim('cube', 'suit_panel', (0, -w * 0.8, th * 0.55), (w * 0.4, 0.02, th * 0.18), mat=K.felt('#5f7fb8'), parent=torso)
            for k, c in enumerate(('#ff6b5b', '#f2c94c', '#66c792')):
                K.prim('sphere', 'suit_light', ((k - 1) * w * 0.22, -w * 0.83, th * 0.55), (0.025, 0.012, 0.025), mat=K.glow(c, 2.0), parent=torso, segs=8)
            K.prim('cube', 'backpack', (0, w * 0.85, th * 0.5), (w * 0.7, w * 0.3, th * 0.45), mat=K.felt('#cfd5df'), parent=torso)
        elif x == 'pirate':
            for k in range(3):
                K.prim('cyl', 'pirate_stripe', (0, 0, th * (0.3 + k * 0.22)), (w * 1.01, w * 0.81, 0.03), mat=K.felt('#d9473f'), parent=torso, segs=24)
            K.prim('cyl', 'pirate_sash', (0, 0, th * 0.08), (w * 0.98, w * 0.79, 0.05), mat=K.felt(team if team != WHITE else '#d9473f'), parent=torso, segs=24)
            # a felt tricorn hat with a gold band
            hat = K.empty('pirate_hat', (0, r * 0.05, r * 0.72), head)
            K.prim('cyl', 'hat_brim', (0, 0, 0), (r * 1.2, r * 0.9, 0.03), mat=K.felt('#2d2a33'), parent=hat, segs=24)
            K.prim('sphere', 'hat_top', (0, 0, r * 0.08), (r * 0.82, r * 0.7, r * 0.45), mat=K.felt('#2d2a33'), parent=hat, segs=18)
            K.prim('torus', 'hat_band', (0, 0, r * 0.06), (r * 0.8, r * 0.68, r * 0.3), mat=K.felt('#f2c94c'), parent=hat, segs=20, minor=0.08)
            _badge_star(hat, (0, -r * 0.7, r * 0.22), r * 0.16, '#fdf6e3')
        elif x == 'knight':
            # felt armour: a tabard in the team colour with a star, a round helmet with an open face
            K.prim('cube', 'tabard', (0, -w * 0.62, th * 0.42), (w * 0.62, 0.03, th * 0.48), mat=K.felt(team if team != WHITE else '#3f74c9'), parent=torso)
            _badge_star(torso, (0, -w * 0.67, th * 0.55), w * 0.3, '#f2c94c')
            _shell('helm', r * 1.12, lambda x, y, z: not (y < -0.1 and z < 0.55 and abs(x) < 0.75) and z > -0.35, K.felt('#c4cad6', sheen=0.3), head, thick=0.03)
            K.prim('cone', 'plume', (0, r * 0.2, r * 1.2), (1, 1, r * 0.22), (0.4, 0, 0), mat=K.felt('#d9473f'), parent=head, segs=10, r1=r * 0.14, r2=0.02)
        elif x == 'crown':
            crown = K.empty('crown', (0, r * 0.05, r * 0.88), head)
            K.prim('cyl', 'crown_band', (0, 0, 0), (r * 0.5, r * 0.5, r * 0.1), mat=K.felt('#f2c94c', sheen=0.4), parent=crown, segs=20)
            for k in range(5):
                a = k * 2 * math.pi / 5 + math.pi / 2
                K.prim('cone', 'crown_pt', (math.cos(a) * r * 0.45, math.sin(a) * r * 0.45, r * 0.18), (1, 1, r * 0.1), mat=K.felt('#f2c94c', sheen=0.4), parent=crown, segs=8, r1=r * 0.09, r2=0.0)
            K.prim('sphere', 'crown_gem', (0, -r * 0.5, 0), (0.03, 0.015, 0.03), mat=K.glossy('#e2557a'), parent=crown, segs=8)
        elif x == 'gown':
            K.prim('cone', 'gown', (0, 0, -0.08), (1, 0.85, th * 0.55), mat=K.felt(team), parent=torso, segs=28, r1=w * 1.6, r2=w * 0.85)
            K.prim('torus', 'gown_hem', (0, 0, -0.08 - th * 0.52), (w * 1.58, w * 1.35, w * 0.6), mat=K.felt(_lighter(team, 0.5)), parent=torso, segs=24, minor=0.07)
        elif x == 'cape':
            cape = K.outline_obj('cape', [(-w * 1.0, 0), (w * 1.0, 0), (w * 1.4, -th * 1.3), (-w * 1.4, -th * 1.3)], 0.03, K.felt('#d9473f' if team != '#d9473f' else '#2c3d72'), bevel=0.01)
            cape.parent = torso
            cape.location = (0, w * 0.78, th * 0.95)
            cape.rotation_euler.x = -0.12
            cape.name = 'cape'
        elif x == 'chest_star':
            _badge_star(torso, (0, -w * 0.82, th * 0.6), w * 0.35)
        elif x == 'cap':
            _shell('cap', r * 1.1, lambda x, y, z: z > 0.32 - 0.1 * y, K.felt(team), head, thick=0.03)
            K.prim('cyl', 'cap_peak', (0, -r * 0.92, r * 0.36), (r * 0.5, r * 0.36, 0.018), (0.25, 0, 0), mat=K.felt(team), parent=head, segs=18)
            K.prim('sphere', 'cap_button', (0, 0, r * 1.1), (0.03, 0.03, 0.02), mat=K.felt(team), parent=head, segs=8)
        elif x == 'whistle':
            K.prim('torus', 'lanyard', (0, -w * 0.15, th * 0.8), (w * 0.55, w * 0.6, w * 0.6), (0.5, 0, 0), mat=K.felt('#f4f1ea'), parent=torso, segs=18, minor=0.05)
            K.prim('cyl', 'whistle', (0, -w * 0.82, th * 0.45), (0.035, 0.035, 0.05), (0, math.pi / 2, 0), mat=K.glossy('#c9ccd4', 0.3), parent=torso, segs=10)
        elif x == 'track':
            K.prim('cyl', 'zip', (0, -w * 0.8, th * 0.5), (0.01, 0.01, th * 0.45), mat=K.felt(WHITE), parent=torso, segs=6)
        elif x == 'cardigan':
            for sx in (-1, 1):
                K.prim('sphere', 'cardigan', (sx * w * 0.42, -w * 0.12, th * 0.48), (w * 0.62, w * 0.72, th * 0.6), mat=K.felt(team), parent=torso, segs=18)
        elif x == 'labcoat':
            for sx in (-1, 1):
                K.prim('cone', 'labcoat', (sx * w * 0.45, 0, th * 0.3), (1, 0.9, th * 0.7), mat=K.felt(WHITE), parent=torso, segs=16, r1=w * 0.78, r2=w * 0.55)
        elif x == 'stethoscope':
            K.prim('torus', 'stetho', (0, -w * 0.12, th * 0.9), (w * 0.4, w * 0.5, w * 0.45), (0.25, 0, 0), mat=K.felt('#4a6a8a'), parent=torso, segs=18, minor=0.07)
            K.prim('cyl', 'stetho_disc', (w * 0.2, -w * 0.9, th * 0.45), (0.045, 0.045, 0.015), (math.pi / 2, 0, 0), mat=K.glossy('#c9ccd4', 0.3), parent=torso, segs=12)
        elif x == 'chef_hat':
            K.prim('cyl', 'chef_band', (0, r * 0.05, r * 0.72), (r * 0.82, r * 0.82, r * 0.16), mat=K.felt(WHITE), parent=head, segs=20)
            K.prim('sphere', 'chef_puff', (0, r * 0.05, r * 1.15), (r * 0.95, r * 0.9, r * 0.5), mat=K.felt(WHITE), parent=head, segs=18)
        elif x == 'apron':
            K.prim('cube', 'apron', (0, -w * 0.72, th * 0.3), (w * 0.65, 0.02, th * 0.5), mat=K.felt('#e9a9b7'), parent=torso)
        elif x == 'bib':
            K.prim('cube', 'bib', (0, -w * 0.72, th * 0.45), (w * 0.55, 0.02, th * 0.3), mat=K.felt(DENIM), parent=torso)
            for sx in (-1, 1):
                K.prim('sphere', 'bib_btn', (sx * w * 0.4, -w * 0.76, th * 0.72), (0.025, 0.012, 0.025), mat=K.felt('#f2c94c'), parent=torso, segs=8)
        elif x == 'mittens':
            pass


PEOPLE = {'kid': person, 'grownup': person, 'grandparent': person}
