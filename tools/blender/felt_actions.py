"""Actions for every Story Builder character (felt animals and felt people): one function, `act`, that registers a
per-frame pose with feltkit.anim. Every action name a story may use is in ACTIONS (and in
server/stories/blender/catalog.json; a test checks both lists).

Conventions (Blender, the character faces -Y, the camera):
  root.rotation z > 0 turns the face towards +X;   torso/head rotation x > 0 leans or nods forward (down);
  arm/leg rotation x < 0 swings the hand/foot forward; arm rotation y = -side * a lifts the arm out to the side.
"""
import math

import bpy

import feltkit as K
import felt_props as P

ACTIONS = ('idle', 'walk', 'walk_out', 'hop', 'wave', 'look_up', 'sleep', 'fly', 'hold_star',
           'run', 'jump', 'kick', 'throw', 'catch', 'cheer', 'high_five', 'hug', 'sit', 'sad', 'point',
           'dance', 'swim', 'climb', 'read', 'eat', 'laugh', 'cry', 'think', 'sleep_in_bed', 'ride')
# actions that move a character across the stage (render_story picks where they start)
MOVERS = ('walk', 'walk_out', 'hold_star', 'run', 'ride', 'fly')
# characters that fly by themselves; people fly only in a cape or a space suit (felt_people.FLYING_OUTFITS)
FLYERS = ('owl', 'bird', 'dragon', 'unicorn')


def _desc(ob):
    for c in ob.children:
        yield c
        yield from _desc(c)


class Char:
    """The parts of one built character, found by name (people and animals use the same names)."""

    def __init__(self, root, body, head, kind):
        self.root, self.body, self.head, self.kind = root, body, head, kind
        self.person = 'person' in root.keys()
        self.side_view = bool(root.get('side_view'))
        self.height = float(root.get('height', 1.1))
        self.hip = float(root.get('hip', 0.0))
        allc = list(_desc(root))
        self.torso = next((c for c in body.children if c.name.startswith('torso')), None) or body
        holder = self.torso if self.person else body
        side = lambda o: o.get('side', -1 if o.location.x < 0 else 1)
        self.arms = sorted([c for c in holder.children if c.name.startswith('arm')], key=side)
        self.legs = sorted([c for c in allc if c.name.startswith('leg') and c.type == 'EMPTY'], key=side)
        self.wings = sorted([c for c in body.children if c.name.startswith('wing')], key=side)
        self.ears = [c for c in head.children if c.name.startswith('ear')]
        self.tail = next((c for c in allc if c.name.startswith('tail') and c.type == 'EMPTY'), None)
        self.cape = next((c for c in allc if c.name.startswith('cape')), None)
        self.eyes = [c for c in head.children if c.name.startswith('eye')]
        self.glints = [(c, tuple(c.scale)) for c in head.children if c.name.startswith('glint')]
        self.mouths = {k: next((c for c in head.children if c.name.startswith('mouth_' + k)), None) for k in ('smile', 'open', 'sad')}
        self.mouth_scale = {k: tuple(v.get('rest', v.scale)) for k, v in self.mouths.items() if v}
        self.brows = [c for c in head.children if c.name.startswith('brow')]
        self.hands = {}
        for a in self.arms:
            h = next((c for c in a.children if c.name.startswith('hand')), None)
            if h is None:  # the animals: a hand at the end of the paw
                h = K.empty('hand', (0, -0.05, -0.3), a)
            self.hands[side(a)] = h
        self.hand = self.hands.get(1) or self.hands.get(-1) or K.empty('hand', (0.3, -0.25, self.height * 0.5), body)
        self.rest_x = float(self.torso.get('rest_x', 0.0)) if self.torso is not body else 0.0

    def side(self, o):
        return o.get('side', -1 if o.location.x < 0 else 1)

    def arm(self, a, fwd=0.0, out=0.12, inward=0.0):
        s = self.side(a)
        a.rotation_euler = (-fwd, -s * out, -s * inward)

    def leg(self, l, fwd=0.0, out=0.0):
        if self.side_view:  # four legs seen from the side: they swing along the body (its +X is forward)
            l.rotation_euler = (0, -fwd, 0)
            return
        s = self.side(l)
        l.rotation_euler = (-fwd, -s * out, 0)

    def face(self, mood='smile', eyes=1.0):
        """mood: smile | open | sad | closed (sleeping) | squint (laughing)."""
        show = {'smile': 'smile', 'open': 'open', 'sad': 'sad', 'closed': 'smile', 'squint': 'open'}[mood]
        for k, m in self.mouths.items():
            if m:
                m.scale = self.mouth_scale[k] if k == show else (0, 0, 0)
        if mood in ('closed', 'squint') or eyes < 1.0:
            k = 0.12 if mood == 'closed' else 0.4 if mood == 'squint' else eyes
            for e in self.eyes:
                e.scale.z = e.scale.x * 1.1 * k
            for g, s in self.glints:
                g.scale = (0, 0, 0) if mood == 'closed' else s
        else:
            for g, s in self.glints:
                g.scale = s
        for b in self.brows:
            s = b.get('side', 1)
            b.rotation_euler.y = s * 0.35 if mood == 'sad' else 0.0
            b.location.z = b.location.z


def _zzz(parent, height, rng_phase=0.0, base=None):
    """Felt Z letters that float up from a sleeper, one after another (from `base` in the world when the sleeper
    lies down, so the letters stay upright)."""
    zs = []
    for k in range(3):
        s = 0.09 + k * 0.025
        pts = [(-s, s), (s, s), (s, s * 0.6), (-s * 0.35, -s * 0.6), (s, -s * 0.6), (s, -s), (-s, -s), (-s, -s * 0.6), (s * 0.35, s * 0.6), (-s, s * 0.6)]
        z = K.outline_obj('zzz', pts, 0.02, K.felt('#e8eefc', emit=0.6, emit_color='#cfdcff'), bevel=0.005)
        if base is None:
            z.parent = parent
        zs.append(z)
    bx, by, bz = base if base is not None else (0.0, 0.0, 0.0)

    def go(t, f):
        for k, z in enumerate(zs):
            u = ((t * 0.35 + k / 3 + rng_phase) % 1.0)
            z.location = (bx + 0.25 + u * 0.35 + math.sin(u * 6) * 0.05, by - 0.1, bz + height + u * 0.7)
            sc = math.sin(u * math.pi)
            z.scale = (sc, sc, sc)
            z.rotation_euler.y = -0.3 + u * 0.4
    K.anim(go)


def _thought(parent, height):
    puffs = []
    for k, (dx, dz, r) in enumerate(((0.18, 0.05, 0.045), (0.3, 0.2, 0.07), (0.48, 0.42, 0.16))):
        p = K.prim('sphere', 'thought', (dx, -0.05, height + dz), (r * 1.2, r * 0.5, r), mat=K.paper('#ffffff', emit=0.35), parent=parent, segs=14)
        puffs.append((p, p.scale.copy()))
    K.prim('sphere', 'thought_b', (0.36, -0.05, height + 0.47), (0.11, 0.05, 0.09), mat=K.paper('#ffffff', emit=0.35), parent=puffs[2][0].parent, segs=12)

    def go(t, f):
        for k, (p, s) in enumerate(puffs):
            g = max(0.0, min(1.0, (t - 0.4 - k * 0.35) / 0.4))
            w = 1 + math.sin(t * 2 + k) * 0.04
            p.scale = (s[0] * g * w, s[1] * g * w, s[2] * g * w)
    K.anim(go)


def _tears(ch):
    r = float(ch.head.get('r', 0.28))
    drops = []
    for sx in (-1, 1):
        d = K.prim('sphere', 'tear', (sx * r * 0.36, -r * 0.88, -r * 0.05), (0.025, 0.018, 0.035), mat=K.glossy('#8fc8f0', 0.1), parent=ch.head, segs=10)
        drops.append((d, d.location.copy(), sx))

    def go(t, f):
        for k, (d, l0, sx) in enumerate(drops):
            u = (t * 0.7 + k * 0.5) % 1.0
            d.location = (l0.x + sx * u * 0.03, l0.y, l0.z - u * r * 0.55)
            s = 1.0 if u < 0.85 else (1 - u) / 0.15
            d.scale = (0.025 * s, 0.018 * s, 0.035 * s)
    K.anim(go)


def ease(u):
    u = max(0.0, min(1.0, u))
    return u * u * (3 - 2 * u)


def act(ch, action, x0, x1, start, dur, phase=0.0, ctx=None):
    """Register the pose of `ch` doing `action`. x0 -> x1 for actions that move; ctx: {'partner': Char,
    'pair_x': x, 'set': name, 'throw_to': Char, 'z0': ground height, 'rider_of': Char, 'can_fly': bool}."""
    ctx = ctx or {}
    root, body, head, torso = ch.root, ch.body, ch.head, ch.torso
    z0 = ctx.get('z0', 0.0)
    y0 = root.location.y
    yaw0 = root.rotation_euler.z
    if action == 'fly' and not ctx.get('can_fly', True):
        action = 'jump'
    arms, legs = ch.arms, ch.legs
    armR = arms[-1] if arms else None
    armL = arms[0] if arms else None
    h = ch.height
    extra = {}

    # ---- things an action brings with it
    if action == 'hold_star':
        s = K.held_star(ch.hand, 0.2 if ch.person else 0.22)
        s.location = (0, -0.06, -0.02)
    elif action == 'read':
        b = P.book_open()
        b.parent = torso if ch.person else body
        b.location = (0, -0.42 if ch.person else -0.38, (0.42 * h / 1.45) if ch.person else h * 0.45)
        extra['book'] = b
    elif action == 'eat':
        food = P.snack(ctx.get('set'))
        food.parent = ch.hand
        food.location = (0, -0.06, 0.0)
    elif action == 'think':
        _thought(root, h + 0.05)
    elif action == 'sleep':
        _zzz(root, h * 0.75 + 0.1, phase)
    elif action == 'sleep_in_bed':
        _zzz(None, 1.0, phase, base=(x0 - 0.75, y0 - 0.2, z0))
    elif action == 'cry':
        _tears(ch)
    elif action == 'climb':
        lad = P.ladder(1.9)
        lad.location = (x0, y0 + 0.3, z0)
        extra['ladder'] = lad
    elif action == 'swim':
        rip = P.ripple(0.55 if ch.person else 0.5)
        rip.parent = root
        rip.location = (0, 0, ch.hip * 1.1 + 0.18 if ch.person else h * 0.35)
        extra['ripple'] = rip
        if ctx.get('set') == 'underwater':
            rip.scale = (0, 0, 0)
    elif action == 'sleep_in_bed':
        pass
    elif action == 'ride' and not ctx.get('rider_of'):
        bike = P.bike(0.95 if ch.person and ch.kind != 'kid' else 0.8)
        extra['bike'] = bike
    if action == 'sleep_in_bed':
        bed = P.bed(h + 0.35)
        bed.location = (x0, y0 + 0.05, z0)
        extra['bed'] = bed
    ball = ctx.get('ball')

    rider_of = ctx.get('rider_of')
    if action == 'ride' and rider_of is not None:
        root.parent = rider_of.body
        root.location = (-0.05, 0, float(rider_of.root.get('saddle', rider_of.height * 0.62)) - 0.1)
        root.rotation_euler.z = -rider_of.root.rotation_euler.z * 0.0
    if action == 'sleep_in_bed':
        root.rotation_euler = (0, -math.pi / 2, 0)
        # the head on the pillow (felt_props.bed: the pillow at the left end, the quilt from 0.72 in)
        root.location = (x0 + h / 2 - 0.16, y0 + 0.02, z0 + 0.5 + 0.14)

    walk_like = action in ('walk', 'walk_in', 'walk_out', 'hold_star')

    def go(t, f):
        T = t - start
        u = max(0.0, min(1.0, T / max(0.1, dur)))
        e = ease(u)
        breath = math.sin(t * 2.2 + phase)
        sway = math.sin(t * 0.9 + phase)
        # ---- rest pose, every frame
        body.location = (0, 0, 0)
        body.rotation_euler = (0, 0, 0)
        body.scale = (1 - breath * 0.01, 1 - breath * 0.01, 1 + breath * 0.02)
        if torso is not body:
            torso.rotation_euler = (ch.rest_x, 0, 0)
        head.rotation_euler = (0, sway * 0.06, 0)
        if action != 'sleep_in_bed' and not (action == 'ride' and rider_of is not None):
            root.location = (x0, y0, z0)
            root.rotation_euler.z = yaw0
        for i, a in enumerate(arms):
            ch.arm(a, 0.05 * math.sin(t * 1.3 + phase + i), 0.12 + math.sin(t * 2.2 + phase) * 0.04)
        for l in legs:
            ch.leg(l, 0.0)
        for i, w in enumerate(ch.wings):
            w.rotation_euler = (0, 0, 0)
        mood = 'smile'
        if ch.cape is not None:
            ch.cape.rotation_euler.x = -0.12 - 0.04 * math.sin(t * 2 + phase)

        def facing(dirn, k=0.35):
            if ch.side_view:
                root.rotation_euler.z = -0.35 if dirn > 0 else math.pi + 0.35
            else:
                root.rotation_euler.z = k if dirn > 0 else -k

        def stride(freq, legamp, armamp, bounce):
            c = math.sin(t * freq + phase)
            for l in legs:
                ch.leg(l, ch.side(l) * c * legamp)
            for a in arms:
                ch.arm(a, -ch.side(a) * c * armamp, 0.15)
            body.location.z = abs(c) * bounce
            if not legs:  # animals without legs waddle
                body.rotation_euler.y = c * 0.06

        # ---- the actions
        if walk_like:
            root.location.x = x0 + (x1 - x0) * e
            moving = 0 < u < 1
            if moving:
                stride(7, 0.5, 0.35, 0.07)
                facing(x1 - x0)
            else:
                facing(x1 - x0, 0.14)
            if action == 'hold_star' and armR:
                ch.arm(armR, 0.9, 0.2)
        elif action == 'run':
            root.location.x = x0 + (x1 - x0) * e
            moving = 0 < u < 1
            if moving:
                stride(12, 0.9, 0.85, 0.11)
                facing(x1 - x0, 0.8)
                if torso is not body:
                    torso.rotation_euler.x = ch.rest_x + 0.22
                else:
                    body.rotation_euler.x = 0.12
                mood = 'open'
            else:
                facing(x1 - x0, 0.2)
                body.scale.z = 1 + math.sin(t * 6) * 0.03  # puffing after the run
        elif action == 'ride':
            if rider_of is not None:
                for l in legs:
                    ch.leg(l, 0.5, 0.55)
                for a in arms:
                    ch.arm(a, 0.7, 0.2)
                body.location.z = -ch.hip + 0.05 + abs(math.sin(t * 5)) * 0.03
            else:
                bike = extra['bike']
                xx = x0 + (x1 - x0) * e
                root.location.x = xx
                dirn = 1 if x1 >= x0 else -1
                facing(dirn, 0.9)
                bike.location = (xx, y0 + 0.02, z0)
                bike.rotation_euler.z = 0 if dirn > 0 else math.pi
                spin = t * 6 if 0 < u < 1 else 0
                P.bike_spin(bike, spin)
                seat = bike.get('seat', 0.55)
                body.location.z = seat - ch.hip + 0.02 if ch.person else seat - 0.05
                pc = math.sin(spin)
                for l in legs:
                    ch.leg(l, 0.9 + ch.side(l) * pc * 0.45)
                for a in arms:
                    ch.arm(a, 1.0, 0.15)
                if torso is not body:
                    torso.rotation_euler.x = ch.rest_x + 0.15
        elif action == 'fly':
            root.location.x = x0 + (x1 - x0) * e
            root.location.z = z0 + 1.1 * ease(T / 1.2) + math.sin(t * 2.5 + phase) * 0.12
            facing(x1 - x0, 0.3)
            for i, w in enumerate(ch.wings):
                w.rotation_euler.y = (1 if i else -1) * (0.3 + math.sin(t * 9) * 0.6)
            if not ch.wings:
                if ch.person:
                    if armR:
                        ch.arm(armR, 0.4, 2.7)
                    if armL:
                        ch.arm(armL, 0.2, 0.6)
                    for l in legs:
                        ch.leg(l, -0.25 + ch.side(l) * 0.1)
                    if ch.cape is not None:
                        ch.cape.rotation_euler.x = -0.6 - 0.15 * math.sin(t * 8)
                else:
                    for l in legs:
                        ch.leg(l, math.sin(t * 6 + ch.side(l)) * 0.4)
            mood = 'open' if ch.person else 'smile'
        elif action == 'hop':
            body.location.z = max(0, math.sin(t * 4.2 + phase)) * 0.28
            body.scale.z = 1 + breath * 0.02 + (0.06 if body.location.z < 0.02 else -0.03)
            for l in legs:
                ch.leg(l, -0.2 if body.location.z > 0.05 else 0.0)
        elif action == 'jump':
            c = ((T if T > 0 else 0) % 1.5) / 1.5
            if c < 0.25:  # crouch
                k = math.sin(c / 0.25 * math.pi)
                body.scale.z = 1 - 0.12 * k
                for a in arms:
                    ch.arm(a, -0.5 * k, 0.3)
            else:
                v = (c - 0.25) / 0.75
                body.location.z = math.sin(v * math.pi) * 0.55
                for a in arms:
                    ch.arm(a, 0.4, 2.5 * math.sin(v * math.pi) + 0.2)
                for l in legs:
                    ch.leg(l, -0.35 * math.sin(v * math.pi))
                mood = 'open'
        elif action == 'wave':
            if armR:
                ch.arm(armR, 0.2, 2.5 + math.sin(t * 6) * 0.4)
        elif action == 'look_up':
            head.rotation_euler.x = -0.4 + math.sin(t * 0.8) * 0.05
        elif action == 'point':
            dirn = -1 if x0 > 0.5 else 1
            arm_p = armR if dirn > 0 else armL
            if arm_p is not None:
                ch.arm(arm_p, 0.35, 1.45 + math.sin(t * 1.5) * 0.04)
            head.rotation_euler.z = dirn * 0.4
            head.rotation_euler.x = -0.15
            mood = 'open' if (T % 3) < 1.2 else 'smile'
        elif action == 'sleep':
            body.scale.z = 1 + math.sin(t * 1.3) * 0.04
            head.rotation_euler = (0.2, 0.25, 0)
            mood = 'closed'
        elif action == 'sleep_in_bed':
            body.scale.z = 1 + math.sin(t * 1.3) * 0.02
            body.scale.y = 1 + math.sin(t * 1.3) * 0.03
            head.rotation_euler = (0, 0.15, 0)
            for a in arms:
                ch.arm(a, 0.0, 0.08)
            mood = 'closed'
        elif action == 'sit':
            facing(1 if x0 <= 0 else -1, 0.55)
            if ch.person:
                body.location.z = -(ch.hip - 0.13)
                for l in legs:
                    ch.leg(l, 1.45 + ch.side(l) * 0.04 * math.sin(t * 1.4), 0.08)
                for a in arms:
                    ch.arm(a, 0.25, 0.35)
            else:
                body.scale.z *= 0.9
                for l in legs:
                    ch.leg(l, 1.2)
        elif action in ('sad', 'cry'):
            if torso is not body:
                torso.rotation_euler.x = ch.rest_x + 0.12
            head.rotation_euler.x = 0.32
            head.rotation_euler.y = sway * 0.03
            for a in arms:
                ch.arm(a, 0.15, 0.05)
            for e_ in ch.ears:
                e_.rotation_euler.x = 0.5
            mood = 'sad'
            if action == 'cry':
                body.location.z = abs(math.sin(t * 7)) * 0.012
                c = (T % 4.0)
                if 1.5 < c < 3.0 and len(arms) == 2:  # wipes the eyes
                    for a in arms:
                        ch.arm(a, 2.3, 0.0, 0.55)
                    head.rotation_euler.x = 0.4
        elif action == 'think':
            if armR:
                ch.arm(armR, 2.1, 0.0, 0.6)
            if armL:
                ch.arm(armL, 0.9, 0.0, 0.7)
            head.rotation_euler = (-0.15, 0.18 + sway * 0.04, 0)
        elif action == 'cheer':
            c = math.sin(t * 5 + phase)
            body.location.z = max(0, c) * 0.22
            for a in arms:
                ch.arm(a, 0.15, 2.55 + math.sin(t * 10 + ch.side(a)) * 0.15)
            for l in legs:
                ch.leg(l, -0.25 * max(0, c), 0.12 * max(0, c))
            for i, w in enumerate(ch.wings):
                w.rotation_euler.y = (1 if i else -1) * (0.6 + math.sin(t * 10) * 0.4)
            mood = 'open'
        elif action == 'laugh':
            body.rotation_euler.y = math.sin(t * 14) * 0.03
            body.location.z = abs(math.sin(t * 7)) * 0.03
            head.rotation_euler.x = -0.22
            if torso is not body:
                torso.rotation_euler.x = ch.rest_x - 0.08
            for a in arms:
                ch.arm(a, 0.6, 0.0, 0.65)  # holding the tummy
            mood = 'squint'
        elif action == 'dance':
            beat = t * 4.2 + phase
            body.rotation_euler.y = math.sin(beat / 2) * 0.12
            body.location.z = abs(math.sin(beat)) * 0.08
            root.rotation_euler.z = yaw0 + math.sin(beat / 4) * 0.5
            up = math.sin(beat / 2) > 0
            for a in arms:
                hi = (ch.side(a) > 0) == up
                ch.arm(a, 0.3, 2.4 if hi else 0.7)
            for l in legs:
                ch.leg(l, (0.3 if (ch.side(l) > 0) != up else 0.0), 0.1)
            head.rotation_euler.y = math.sin(beat / 2) * 0.15
            mood = 'open' if up else 'smile'
        elif action == 'swim':
            c = t * 3 + phase
            if ctx.get('set') == 'underwater':
                root.location.z = z0 + 0.9 + math.sin(t * 1.4 + phase) * 0.12
                root.location.x = x0 + math.sin(t * 0.4 + phase) * 0.4
                if torso is not body:
                    torso.rotation_euler.x = 0.25
            else:
                root.location.z = z0 - ch.hip * 0.9 - 0.05 + math.sin(t * 2 + phase) * 0.03 if ch.person else z0 - h * 0.25
            for a in arms:
                ch.arm(a, 1.6 + math.sin(c + (0 if ch.side(a) > 0 else math.pi)) * 1.1, 0.25)
            for l in legs:
                ch.leg(l, math.sin(c * 2 + ch.side(l)) * 0.3)
            if ch.tail is not None:
                ch.tail.rotation_euler.z = math.sin(t * 6) * 0.4
        elif action == 'climb':
            lift = 1.25 * ease((T - 0.3) / max(0.5, dur * 1.4))
            root.location.z = z0 + lift
            root.location.y = y0 + 0.05
            c = math.sin(t * 5)
            climbing = 0.05 < lift < 1.24
            for a in arms:
                ch.arm(a, 0.4, 2.6 + (ch.side(a) * c * 0.35 if climbing else 0))
            for l in legs:
                ch.leg(l, 0.5 * max(0, ch.side(l) * c) if climbing else 0.0, 0.15)
            mood = 'open' if not climbing and lift > 1.0 else 'smile'
        elif action == 'read':
            head.rotation_euler.x = 0.3
            for a in arms:
                ch.arm(a, 1.1, 0.05, 0.45)
            P.book_flip(extra['book'], t)
        elif action == 'eat':
            c = (T % 2.6) / 2.6
            k = ease(c / 0.3) if c < 0.3 else (1.0 if c < 0.7 else 1 - ease((c - 0.7) / 0.3))
            if armR:
                ch.arm(armR, 0.8 + 1.5 * k, 0.1, 0.5 * k)
            chew = 0.3 < c < 0.7
            mood = 'open' if chew and math.sin(t * 16) > 0 else 'smile'
            body.location.z = abs(math.sin(t * 8)) * 0.01 if chew else 0
        elif action == 'hug':
            px = ctx.get('pair_x', x0)
            root.location.x = x0 + (px - x0) * ease(T / 1.4)
            toward = 1 if px >= x0 else -1
            if T > 1.0:
                for a in arms:
                    ch.arm(a, 1.35, 0.2, 0.75)
                root.rotation_euler.z = yaw0 * 0.3 + toward * 0.25
                body.rotation_euler.y = toward * 0.12 + math.sin(t * 1.6) * 0.06
                mood = 'closed'
            else:
                stride(7, 0.45, 0.3, 0.05)
                facing(toward)
        elif action == 'high_five':
            px = ctx.get('pair_x', x0)
            toward = 1 if px >= x0 else -1
            root.location.x = x0 + (px - x0) * ease(T / 1.3)
            arm_in = armR if toward > 0 else armL
            slap = 1.6
            if T < 1.3:
                stride(7, 0.45, 0.3, 0.05)
                facing(toward)
            else:
                facing(toward, 0.4)
                if arm_in is not None:
                    k = ease((T - 1.3) / 0.3)
                    ch.arm(arm_in, 0.5, 0.2 + 2.3 * k, 0.25 * k)
                if T > slap:
                    body.location.z = max(0.0, math.sin((T - slap) * 5)) * 0.12
                    mood = 'open'
        elif action == 'kick':
            kick_at = 1.0
            k = T - kick_at
            legk = legs[-1] if legs else None
            if -0.5 < k < 0:
                if legk:
                    ch.leg(legk, -0.9 * ease((k + 0.5) / 0.5))
                if torso is not body:
                    torso.rotation_euler.x = ch.rest_x - 0.1
            elif 0 <= k < 0.5:
                if legk:
                    ch.leg(legk, -0.9 + 2.3 * ease(k / 0.12))
                for a in arms:
                    ch.arm(a, 0.3, 0.9)
                if torso is not body:
                    torso.rotation_euler.x = ch.rest_x - 0.15
                mood = 'open'
            elif k >= 0.5:
                # the shot is away: a happy little hop
                body.location.z = max(0.0, math.sin((k - 0.5) * 6)) * 0.12 if k < 2.0 else 0.0
                if k < 2.0:
                    for a in arms:
                        ch.arm(a, 0.1, 2.4)
                    mood = 'open'
            if not legs:
                body.rotation_euler.x = -0.15 if 0 <= k < 0.4 else 0.0
        elif action == 'throw':
            k = T - 1.0
            if -0.6 < k < 0 and armR:
                ch.arm(armR, -0.9 * ease((k + 0.6) / 0.6), 0.6)
                torso.rotation_euler.z = -0.2 * ease((k + 0.6) / 0.6) if torso is not body else 0
            elif 0 <= k < 0.5 and armR:
                ch.arm(armR, -0.9 + 2.6 * ease(k / 0.18), 0.6 - 0.4 * ease(k / 0.18))
                mood = 'open'
            elif k >= 0.5 and armR:
                ch.arm(armR, 0.6, 0.3)
        elif action == 'catch':
            arrive = ctx.get('catch_at', 1.6)
            reach = ease((T - (arrive - 0.8)) / 0.5)
            for a in arms:
                ch.arm(a, 0.4 + 0.9 * reach, 0.2, 0.25 * reach)
            if T > arrive:
                body.location.z = max(0.0, math.sin((T - arrive) * 6)) * 0.08 if T < arrive + 1 else 0.0
                mood = 'open' if T < arrive + 1.5 else 'smile'
        # idle, and whatever else: the rest pose above
        if ch.tail is not None and action != 'swim':
            ch.tail.rotation_euler.y = math.sin(t * 2.0 + phase) * 0.15
        for i, ea in enumerate(ch.ears):
            if action not in ('sad', 'cry'):
                ea.rotation_euler.x = math.sin(t * 1.7 + i + phase) * 0.08
        if ball is not None:
            ball(t)
        ch.face(mood)
    K.anim(go)
    return extra
