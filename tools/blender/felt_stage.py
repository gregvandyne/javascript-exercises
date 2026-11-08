"""Staging one Story Builder scene: who stands where, who moves to whom, what they hold, where the props go, and
the ball that is kicked, thrown and caught. render_story.py builds the set, then calls stage().

The script's character entries: {kind, action, place, who?, look?, holds?} (server/services/story-script.js).
"""
import math

import feltkit as K
import felt_actions as A
import felt_animals
import felt_people
import felt_props as P

# How far from the middle a character may start a scene (the frame is ~4.3 wide each side where they stand).
EDGE = 3.0
PLACES = {'far_left': -3.3, 'left': -1.8, 'center': 0.0, 'right': 1.8, 'far_right': 3.3}

ANIMALS = {**K.CHARACTERS, **felt_animals.ANIMALS}
CHARACTERS = {**ANIMALS, **felt_people.PEOPLE}
SCALE = {'mouse': 1.0, 'bunny': 1.05, 'fox': 1.15, 'owl': 1.0, **felt_animals.SCALE}
# where the props go when the script asks for them: slots behind and beside the characters
GROUND = [(-4.4, 1.7), (4.4, 1.7), (-2.7, 2.3), (2.7, 2.3), (-5.6, 3.3), (5.6, 3.3), (0.0, 3.4), (-1.3, 3.0), (1.3, 3.0)]
BACK = [(-5.2, 4.8), (5.2, 4.8), (-2.8, 5.6), (2.8, 5.6), (0.0, 6.2)]


def build_character(kind, i, c):
    name = f'{kind}{i}'
    if kind in felt_people.PEOPLE:
        root, body, head = felt_people.person(name, kind, c.get('look'), seed_text=c.get('who') or f'{kind}{i}')
    else:
        maker = ANIMALS.get(kind) or ANIMALS['mouse']
        root, body, head = maker(name, *([c['color']] if c.get('color') else []))
        s = SCALE.get(kind, 1.0)
        root.scale = (s, s, s)
        root['height'] = float(root.get('height', 1.15)) * s
    return A.Char(root, body, head, kind)


def can_fly(kind, c):
    if kind in A.FLYERS:
        return True
    if kind in felt_people.PEOPLE:
        look = felt_people.resolve_look(kind, c.get('look'), c.get('who') or kind)
        return look['outfit'] in felt_people.FLYING_OUTFITS
    return False


def _parabola(a, b, u, apex):
    return (a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u + apex * 4 * u * (1 - u))


def stage(sc_spec, fps, frames, rng, hints=None):
    """Build and animate the cast and the props. -> the object the camera focuses on (the first character's head)."""
    hints = hints or {}
    set_name = sc_spec.get('set')
    dur = frames / fps
    chars = (sc_spec.get('characters') or [])[:3]
    props = [p for p in dict.fromkeys(sc_spec.get('props') or []) if p in P.PROPS]
    z0 = float(hints.get('z0', 0.0))
    cast = []
    for i, c in enumerate(chars):
        kind = c.get('kind') if c.get('kind') in CHARACTERS else 'mouse'
        ch = build_character(kind, i, c)
        x1 = PLACES.get(c.get('place'), [-1.4, 1.4, 0.0][i % 3])
        action = c.get('action') if c.get('action') in A.ACTIONS else 'idle'
        x0 = x1
        if action in ('walk', 'walk_in', 'hold_star'):
            dist = 1.2 if action == 'hold_star' else 2.0
            x0 = max(-EDGE, min(EDGE, x1 - dist if x1 <= 0 else x1 + dist))
        elif action in ('run', 'ride'):
            x0 = max(-EDGE - 0.5, min(EDGE + 0.5, x1 - 3.2 if x1 <= 0 else x1 + 3.2))
        elif action == 'walk_out':
            x0, x1 = x1, x1 + (4.0 if x1 >= 0 else -4.0)
        elif action == 'fly':
            x0 = x1 + (2.5 if x1 <= 0 else -2.5)
        y = 0.25 + i * 0.35
        ch.root.location = (x0, y, z0)
        ch.root.rotation_euler.z = 0.25 if x1 < 0 else -0.25 if x1 > 0 else 0
        if ch.side_view:
            ch.root.rotation_euler.z = -0.4 if x1 <= 0 else math.pi + 0.4
        cast.append(dict(ch=ch, c=c, kind=kind, action=action, x0=x0, x1=x1, y=y, start=0.3 + i * 0.4, i=i))

    # film framings (two-shot, over the shoulder): the ones standing still turn more towards each other, as if talking
    turn = {'two_shot': 0.5, 'over_shoulder': 0.7}.get(sc_spec.get('camera'))
    if turn and len(cast) >= 2:
        for m in cast:
            if m['ch'].side_view or m['action'] in A.MOVERS or m['action'] == 'sleep_in_bed':
                continue
            o = min((o for o in cast if o is not m), key=lambda o: abs(o['x1'] - m['x1']))
            m['ch'].root.rotation_euler.z = turn if o['x1'] >= m['x1'] else -turn

    # pairs: hugs and high fives meet in the middle (both move when both are doing it)
    for m in cast:
        if m['action'] not in ('hug', 'high_five'):
            continue
        others = [o for o in cast if o is not m]
        if not others:
            continue
        p = min(others, key=lambda o: abs(o['x1'] - m['x1']))
        gap = (0.62 if m['action'] == 'hug' else 0.85) * (1.0 if m['ch'].person and p['ch'].person else 1.15)
        toward = 1 if p['x1'] >= m['x1'] else -1
        if p['action'] == m['action']:
            mid = (m['x1'] + p['x1']) / 2
            m['pair_x'] = mid - toward * gap / 2
        else:
            m['pair_x'] = p['x1'] - toward * gap
        ym = (m['y'] + p['y']) / 2
        m['y'] = ym
        p['y'] = ym
        m['ch'].root.location.y = ym
        p['ch'].root.location.y = ym

    # the ball: kicked (towards the goal on a pitch), or thrown to whoever catches
    ball_kind = P.ball_for(set_name, props)
    throwers = [m for m in cast if m['action'] == 'throw']
    catchers = [m for m in cast if m['action'] == 'catch']
    kickers = [m for m in cast if m['action'] == 'kick']
    used_props = set(hints.get('used', ()))
    if kickers or throwers or catchers:
        used_props.add(ball_kind)
    for m in kickers:
        ch = m['ch']
        b = P.BALLS[ball_kind]()
        r = {'soccer_ball': 0.13, 'basketball': 0.15, 'baseball': 0.08, 'beach_ball': 0.22}[ball_kind]
        kx = m['x1'] + 0.12
        a = (kx, m['y'] - 0.32, z0 + r)
        target = (rng.uniform(-0.9, 0.9), 10.9, z0 + 0.8) if set_name == 'soccer_field' else (m['x1'] + (2.5 if m['x1'] <= 0 else -2.5), m['y'] + 6.0, z0 + r)
        t_kick = m['start'] + 1.0
        b.location = a

        def go(t, f, b=b, a=a, target=target, t_kick=t_kick, r=r):
            u = (t - t_kick) / 1.1
            if u <= 0:
                b.location = a
                b.rotation_euler = (0, 0, 0)
            elif u < 1:
                b.location = _parabola(a, target, u, 1.3)
                b.rotation_euler = (u * 14, u * 5, 0)
            else:
                b.location = (target[0], target[1], max(z0 + r, target[2] - (u - 1) * 2.5))
        K.anim(go)
    pairs = []
    for k, m in enumerate(throwers):
        pairs.append((m, catchers[k] if k < len(catchers) else None))
    for m in catchers[len(throwers):]:
        pairs.append((None, m))
    for thrower, catcher in pairs:
        r = {'soccer_ball': 0.13, 'basketball': 0.15, 'baseball': 0.08, 'beach_ball': 0.22}[ball_kind]
        held = P.BALLS[ball_kind](name='ball_held') if thrower else None
        free = P.BALLS[ball_kind](name='ball_flight')
        caught = P.BALLS[ball_kind](name='ball_caught') if catcher else None
        if thrower:
            held.parent = thrower['ch'].hand
            held.location = (0, -0.06, -0.04)
            t_rel = thrower['start'] + 1.0
            a = (thrower['x1'] + 0.25, thrower['y'] - 0.3, z0 + thrower['ch'].height * 0.85)
        else:
            t_rel = catcher['start'] + 0.6
            side = -1 if catcher['x1'] > 0 else 1
            a = (catcher['x1'] + side * 4.6, catcher['y'] + 1.0, z0 + 1.6)
        if catcher:
            b = (catcher['x1'], catcher['y'] - 0.4, z0 + catcher['ch'].height * 0.62)
            caught.parent = catcher['ch'].body
            caught.location = (0, -0.42, catcher['ch'].height * 0.62 - (0.0 if catcher['ch'].person else 0.05))
            flight = 0.8
            catcher['catch_at'] = t_rel + flight - catcher['start']
        else:
            b = (a[0] + 4.0, a[1] + 5.0, z0 + r)
            flight = 1.2

        def go(t, f, held=held, free=free, caught=caught, a=a, b=b, t_rel=t_rel, flight=flight):
            u = (t - t_rel) / flight
            hide = (0, 0, 0)
            if held is not None:
                held.scale = (1, 1, 1) if u <= 0 else hide
            if u <= 0:
                free.scale = hide
                free.location = a
            elif u < 1:
                free.scale = (1, 1, 1)
                free.location = _parabola(a, b, u, 0.9)
                free.rotation_euler = (u * 9, u * 4, 0)
            else:
                free.scale = hide if caught is not None else (1, 1, 1)
                free.location = b
            if caught is not None:
                caught.scale = (1, 1, 1) if u >= 1 else hide
        K.anim(go)

    # someone sleeping in their own bed: the room's own bed makes way
    if hints.get('bed') is not None and any(m['action'] == 'sleep_in_bed' for m in cast):
        hints['bed'].location.z = -60.0

    # riding: on a horse if there is one in the scene, else a bike
    horses = [m for m in cast if m['kind'] in ('horse', 'unicorn')]
    focus = None
    for m in cast:
        ch, c = m['ch'], m['c']
        ctx = {'set': set_name, 'z0': z0, 'can_fly': can_fly(m['kind'], c), 'pair_x': m.get('pair_x', m['x1']),
               'catch_at': m.get('catch_at', 1.6)}
        if m['action'] == 'ride':
            horse = next((h for h in horses if h is not m), None)
            if horse is not None:
                ctx['rider_of'] = horse['ch']
        A.act(ch, m['action'], m['x0'], m['x1'], m['start'], min(dur * 0.55, 4.5), phase=m['i'] * 1.7, ctx=ctx)
        hold = c.get('holds')
        if hold and m['action'] not in ('throw', 'catch', 'read', 'eat', 'hold_star'):
            if hold == 'star':
                s = K.held_star(ch.hand, 0.2)
                s.location = (0, -0.06, -0.02)
            elif hold in P.HOLD:
                ob = P.HOLD[hold]()
                ob.parent = ch.hand
                used_props.add(hold)
            if m['action'] in ('idle', 'look_up', 'sad', 'sit', 'think', 'laugh') and ch.arms:
                arm = ch.arms[-1]
                K.anim(lambda t, f, ch=ch, arm=arm: ch.arm(arm, 0.75, 0.25, 0.15))
        if focus is None:
            focus = ch.head

    # props the set did not already put in, in free slots away from the characters
    xs = [m['x1'] for m in cast] + [m['x0'] for m in cast]
    ctx = {'night': hints.get('night', False), 'set': set_name, 'indoor': hints.get('indoor', False)}
    gslots, bslots = list(GROUND), list(BACK)
    for p in props:
        if p in used_props:
            continue
        spot, fn = P.PROPS[p]
        if spot == 'ground':
            free = [s for s in gslots if all(abs(s[0] - x) > 1.0 for x in xs)] or gslots
            if not free:
                continue
            x, y = free[0]
            gslots.remove(free[0])
            fn(x, y, z0, rng, ctx)
        elif spot == 'back':
            if not bslots:
                continue
            x, y = bslots.pop(0)
            fn(x, y, z0, rng, ctx)
        else:
            fn(0.0, 3.0, z0, rng, ctx)
    return focus
