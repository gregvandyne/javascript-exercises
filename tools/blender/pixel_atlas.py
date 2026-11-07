"""Sum Racer's pixel art: the track layers (hand-pixelled in code, with the Blender props stamped in), the effects, and
one atlas with everything (the racers and props from pixel_racers.py / pixel_props.py).

    python3 tools/blender/pixel_atlas.py --sprites DIR [--out DIR] [--preview FILE]

Every colour is one of the pixel palette's (pixel_racers.PALETTE: the style sheet's 32 plus 8 kit colours), gradients
are an ordered (Bayer 4x4) dither between two palette colours, and every shape has a 1 px Ink edge, as in the style
sheet. The scenery tiles repeat sideways (TW px) and are drawn bottom-up from the road's top edge (LH px tall); the sky
above them is a dithered gradient the game draws at any height (SKIES).

Writes:
  kit/packs/art-pixel.js      the art pack: the atlas (an indexed PNG as a data: URI, so the frame's img-src allows it),
                              the frame map, the palette, the scene recipes (sky stops, dust colour, ambient life)
  DIR/atlas.png               the atlas on its own, DIR/preview.png every scene's layers side by side (for checking)
"""
import argparse
import base64
import io
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)

TW, LH = 256, 80
INK = '#141414'
# the palette (kept equal to pixel_racers.PALETTE; that module needs bpy, this one does not)
PALETTE = [INK, '#FFFDF2', '#E0DDD2', '#FFFFFF', '#F4F7FA', '#DDE6EE', '#B4C3D1', '#C6C2B5', '#8F8A7C', '#5E5A50',
           '#BF957A', '#8A5A3C', '#5C3A26', '#FFC89E', '#F5A26B', '#C9713A', '#FF9C8F', '#FF6B5B', '#C8402F',
           '#FFF3C4', '#FFE27A', '#FFD23F', '#C99A00', '#4FA8F0', '#2F6FC8', '#1F54A8', '#12397A', '#1F9D63', '#0F7A48',
           '#0E2A2E', '#12323A', '#163B3A',
           '#C6A9F3', '#9B6BE8', '#6C44C0', '#3D2775', '#2B1F5C', '#9BDDB7', '#66C792', '#93CBF6']
# names for the colours used below
C = dict(ink=INK, cream='#FFFDF2', creamS='#E0DDD2', white='#FFFFFF', snowL='#F4F7FA', snow='#DDE6EE', snowS='#B4C3D1',
         stoneL='#C6C2B5', stone='#8F8A7C', stoneS='#5E5A50', cocoaL='#BF957A', cocoa='#8A5A3C', cocoaS='#5C3A26',
         peachL='#FFC89E', peach='#F5A26B', peachS='#C9713A', coralL='#FF9C8F', coral='#FF6B5B', coralS='#C8402F',
         sparkT='#FFF3C4', sparkL='#FFE27A', spark='#FFD23F', sparkS='#C99A00', sky='#4FA8F0', skyS='#2F6FC8',
         skyD='#1F54A8', skyN='#12397A', mintS='#1F9D63', mintD='#0F7A48', night='#0E2A2E', night2='#12323A',
         night3='#163B3A', grapeL='#C6A9F3', grape='#9B6BE8', grapeS='#6C44C0', dock='#3D2775', dock2='#2B1F5C',
         mintL='#9BDDB7', mint='#66C792', skyL='#93CBF6')
for v in C.values():
    assert v in PALETTE, v
BAYER4 = (np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) + 0.5) / 16


def rgba(h, a=255):
    return (int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16), a)


# ---------------------------------------------------------------- a layer: drawn 3 tiles wide, so shapes wrap
class Layer:
    def __init__(self, w=TW, h=LH):
        self.w, self.h = w, h
        self.im = Image.new('RGBA', (w * 3, h), (0, 0, 0, 0))

    def piece(self):
        return Piece(self.w * 3, self.h)

    def add(self, p, outline=True, top_only=False):
        """Composite a piece (one object) with its Ink edge round the silhouette (or along its top only)."""
        a = np.array(p.im)
        if outline:
            a = ink_edge(a, top_only)
        self.im.alpha_composite(Image.fromarray(a))

    def tile(self):
        """The middle tile. Every shape was drawn at x, x + w and x + 2w, so whatever crosses an edge of the middle tile
        is already there from its neighbour's copy: the tile repeats seamlessly."""
        return self.im.crop((self.w, 0, 2 * self.w, self.h))


class Piece:
    def __init__(self, w, h):
        self.im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.im)
        self.W = w // 3

    def each(self, x):
        return (x, x + self.W, x + 2 * self.W)

    def poly(self, pts, col):
        for o in self.each(0):
            self.d.polygon([(x + o, y) for x, y in pts], fill=rgba(col))

    def rect(self, x0, y0, x1, y1, col):
        for o in self.each(0):
            self.d.rectangle([x0 + o, y0, x1 + o, y1], fill=rgba(col))

    def ellipse(self, x0, y0, x1, y1, col):
        for o in self.each(0):
            self.d.ellipse([x0 + o, y0, x1 + o, y1], fill=rgba(col))

    def px(self, x, y, col):
        for o in self.each(0):
            if 0 <= y < self.im.height:
                self.im.putpixel((int(x + o) % self.im.width, int(y)), rgba(col))

    def stamp(self, sprite, x, ybot):
        """A Blender prop (already outlined) with its bottom centre at (x, ybot)."""
        for o in self.each(0):
            self.im.alpha_composite(sprite, (int(round(x - sprite.width / 2)) + o, int(ybot - sprite.height + 1)))


def ink_edge(a, top_only=False):
    on = a[..., 3] > 127
    ring = np.zeros_like(on)
    ring[1:, :] |= on[:-1, :] if not top_only else False
    ring[:-1, :] |= on[1:, :]
    if not top_only:
        ring[:, 1:] |= on[:, :-1]
        ring[:, :-1] |= on[:, 1:]
    ring &= ~on
    a = a.copy()
    a[ring] = rgba(INK)
    return a


def wave(x, base, amp, waves, phase=0.0):
    v = base
    for k, w in waves:
        v -= math.sin(x / TW * 2 * math.pi * k + phase * k) * w * amp
    return v


def ridge_piece(L, base, amp, waves, col, phase=0.0, bottom=None, shade=None):
    """A rolling band from y(x) down to the bottom; shade: a darker lower part, dithered into the fill."""
    p = L.piece()
    bottom = L.h if bottom is None else bottom
    ys = [wave(x, base, amp, waves, phase) for x in range(TW + 1)]
    pts = [(x, ys[x]) for x in range(TW + 1)] + [(TW, bottom), (0, bottom)]
    p.poly(pts, col)
    if shade:
        a = np.array(p.im)
        c2 = np.array(rgba(shade))
        for y in range(a.shape[0]):
            for x in range(a.shape[1]):
                if a[y, x, 3]:
                    yy = ys[x % TW]
                    f = (y - yy) / max(1, bottom - yy)
                    if f > BAYER4[y % 4, x % 4] * 1.0 + 0.45:
                        a[y, x] = c2
        p.im = Image.fromarray(a)
        p.d = ImageDraw.Draw(p.im)
    return p, (lambda x: wave(x, base, amp, waves, phase))


def dither_rect(p, x0, y0, x1, y1, c0, c1, horizontal=False):
    """A gradient from c0 (top) to c1 (bottom) as an ordered dither (two palette colours only)."""
    a = np.array(p.im)
    A, B = np.array(rgba(c0)), np.array(rgba(c1))
    W = a.shape[1] // 3
    span = range(int(x0), int(x1)) if x1 - x0 >= a.shape[1] else [x + o for o in (0, W, 2 * W) for x in range(int(x0), int(x1))]
    for y in range(int(y0), int(y1)):
        f = (y - y0) / max(1, y1 - y0 - 1)
        for x in span:
            xx = x % a.shape[1]
            a[y, xx] = B if f > BAYER4[y % 4, x % 4] else A
    p.im = Image.fromarray(a)
    p.d = ImageDraw.Draw(p.im)


def cloud(p, x, y, w, col=C['white'], shade=C['snow']):
    h = max(4, w // 3)
    p.ellipse(x, y + h * 0.3, x + w * 0.55, y + h, col)
    p.ellipse(x + w * 0.25, y, x + w * 0.8, y + h, col)
    p.ellipse(x + w * 0.5, y + h * 0.25, x + w, y + h, col)
    p.rect(x + 2, y + h - 2, x + w - 2, y + h, shade)


# ---------------------------------------------------------------- the props (Blender renders)
SPR = {}


def prop(name, px):
    return SPR[f'prop_{name}_{px}']


def pad_seed(n):
    import random
    return random.Random(n)


# ---------------------------------------------------------------- the seven scenes
def town():
    """1. Number Lane: clouds over soft green hills; numbered houses and trees; a picket fence with flowers."""
    r = pad_seed(1)
    far, mid, side = Layer(), Layer(), Layer()
    for i, (x, y, w) in enumerate(((14, 6, 30), (92, 16, 22), (150, 4, 34), (214, 18, 20))):
        c = far.piece(); cloud(c, x, y, w); far.add(c)
    p, y = ridge_piece(far, 54, 6, [(2, 1), (3, 0.5)], C['mintL'], 0.4)
    far.add(p, top_only=True)
    p, y = ridge_piece(mid, 64, 3, [(3, 1), (5, 0.5)], C['mint'])
    mid.add(p, top_only=True)
    houses = ['house_a', 'house_b', 'house_c', 'house_d']
    for i in range(4):
        x = 20 + i * 64
        h = mid.piece(); h.stamp(prop(houses[i], 26), x, int(y(x)) + 2); mid.add(h, outline=False)
        num = mid.piece(); digit(num, str(i + 1), x - 1, int(y(x)) - 25, C['ink'], C['cream']); mid.add(num, outline=False)
        t = mid.piece(); t.stamp(prop('tree', 20 if i % 2 else 30), x + 32, int(y(x + 32)) + 2); mid.add(t, outline=False)
    # roadside: a green verge, a picket fence, flowers
    g = side.piece(); g.rect(0, LH - 7, TW * 3, LH - 1, C['mint']); side.add(g, top_only=True)
    f = side.piece()
    f.rect(0, LH - 13, TW, LH - 12, C['cream']); f.rect(0, LH - 8, TW, LH - 7, C['cream'])
    for x in range(2, TW, 8):
        f.poly([(x, LH - 3), (x, LH - 15), (x + 2, LH - 17), (x + 4, LH - 15), (x + 4, LH - 3)], C['cream'])
    side.add(f)
    for x in range(5, TW, 13):
        fl = side.piece(); col = [C['coral'], C['spark'], C['grapeL'], C['white']][x % 4]
        fl.rect(x, LH - 4, x, LH - 2, C['mintS']); fl.rect(x - 1, LH - 6, x + 1, LH - 5, col); fl.px(x, LH - 6, C['sparkL'])
        side.add(fl, outline=False)
    return far, mid, side


def beach():
    """2. Sunny Speedway: the sea to the horizon (an island, sails), dunes with palm groves and umbrellas, sandcastles."""
    far, mid, side = Layer(), Layer(), Layer()
    hz = 30
    c = far.piece(); cloud(c, 30, 4, 26); cloud(c, 170, 10, 20); far.add(c)
    sea = far.piece(); dither_rect(sea, 0, hz, TW * 3, hz + 14, C['skyS'], C['sky']); dither_rect(sea, 0, hz + 14, TW * 3, LH, C['sky'], C['skyL'])
    far.add(sea, outline=False)
    hl = far.piece(); hl.rect(0, hz, TW, hz, C['skyL']); far.add(hl, outline=False)
    isl = far.piece(); isl.ellipse(40, hz - 7, 96, hz + 5, C['mintS']); isl.rect(40, hz + 1, 96, hz + 6, C['skyS'])
    far.add(isl, top_only=True)
    for x, s in ((56, 10), (72, 10)):
        q = far.piece(); q.stamp(prop('palm', s), x, hz - 3); far.add(q, outline=False)
    for x, yb, s in ((140, hz + 8, 7), (210, hz + 12, 7), (110, hz + 26, 12)):
        q = far.piece(); q.stamp(prop('boat', s), x, yb); far.add(q, outline=False)
    foam = far.piece()
    for row in range(5):
        yy = hz + 6 + row * 8
        for x in range(row * 13 % 29, TW, 34 + row * 6):
            foam.rect(x, yy, x + 3 + row, yy, C['white'])
    far.add(foam, outline=False)
    p, y = ridge_piece(mid, 62, 3, [(2, 1), (5, 0.4)], C['sparkT'], shade=C['peachL'])
    mid.add(p, top_only=True)
    fm = mid.piece()
    for x in range(TW):
        fm.px(x, int(y(x)) - 1, C['white'])
    mid.add(fm, outline=False)
    for i, x in enumerate((20, 34, 100, 168, 186, 236)):
        s = [36, 24][i % 2]
        q = mid.piece(); q.stamp(prop('palm', s), x, int(y(x)) + 3); mid.add(q, outline=False)
    for x in (62, 140, 214):
        q = mid.piece(); q.stamp(prop('umbrella', 16), x, int(y(x)) + 6); mid.add(q, outline=False)
    g = side.piece(); g.rect(0, LH - 6, TW * 3, LH - 1, C['peachL']); side.add(g, top_only=True)
    for x, k in ((40, 'sandcastle'), (120, 'flag'), (200, 'sandcastle')):
        q = side.piece(); q.stamp(prop(k, 14 if k == 'sandcastle' else 18), x, LH - 1); side.add(q, outline=False)
    for x in (80, 168, 244):
        sh = side.piece(); sh.ellipse(x - 2, LH - 4, x + 2, LH - 1, C['coralL']); side.add(sh)
    return far, mid, side


def desert():
    """3. Desert Dash (and the Trading Post): red mesas, dunes with cacti, rocks and a sign by the road."""
    far, mid, side = Layer(), Layer(), Layer()
    for x, w, h in ((40, 34, 22), (130, 26, 30), (210, 40, 18)):
        m = far.piece(); b = 56
        m.poly([(x - w, b), (x - w * 0.7, b - h), (x + w * 0.6, b - h), (x + w, b)], C['coralL'])
        m.poly([(x + w * 0.3, b - h), (x + w * 0.6, b - h), (x + w, b), (x + w * 0.5, b)], C['coral'])
        for k in (0.35, 0.65):
            m.rect(x - w * (0.72 - k * 0.15), b - h * k, x + w * (0.6 + k * 0.1), b - h * k + 1, C['coral'])
        far.add(m)
    p, y = ridge_piece(far, 58, 2, [(3, 1)], C['peachL'], 0.2)
    far.add(p, top_only=True)
    p, y = ridge_piece(mid, 64, 4, [(2, 1), (3, 0.7)], C['peach'], shade=C['peachS'])
    mid.add(p, top_only=True)
    for i, x in enumerate((24, 90, 150, 214)):
        q = mid.piece(); q.stamp(prop('cactus', 24 if i % 2 == 0 else 16), x, int(y(x)) + 3); mid.add(q, outline=False)
    g = side.piece(); g.rect(0, LH - 6, TW * 3, LH - 1, C['peachS']); side.add(g, top_only=True)
    for x, k in ((30, 'rock'), (76, 'cactus'), (190, 'rock'), (236, 'rock')):
        q = side.piece(); q.stamp(prop(k, 16 if k == 'cactus' else 9), x, LH - 1); side.add(q, outline=False)
    sg = side.piece()
    sg.rect(140, LH - 16, 141, LH - 1, C['cocoa']); sg.rect(129, LH - 22, 153, LH - 15, C['cocoaL'])
    side.add(sg)
    t = side.piece(); digit(t, '100', 133, LH - 21, C['ink'], None); t.poly([(150, LH - 21), (152, LH - 19), (150, LH - 17)], C['ink'])
    side.add(t, outline=False)
    return far, mid, side


def snowy():
    """4. Snowy Summit: snowy peaks, a white ridge with frosted pines and a cabin, snowmen and flags."""
    far, mid, side = Layer(), Layer(), Layer()
    for x, w, h, col in ((30, 46, 44, C['skyL']), (120, 52, 52, C['skyL']), (200, 44, 40, C['skyL'])):
        m = far.piece(); b = 60
        m.poly([(x - w, b), (x - 3, b - h), (x + 4, b - h - 1), (x + w, b)], col)
        m.poly([(x + 1, b - h), (x + 4, b - h - 1), (x + w, b), (x + 10, b)], C['sky'])
        m.poly([(x - w * 0.3, b - h * 0.68), (x - 3, b - h), (x + 4, b - h - 1), (x + w * 0.3, b - h * 0.66), (x + 6, b - h * 0.74), (x, b - h * 0.64), (x - 6, b - h * 0.74)], C['white'])
        far.add(m)
    p, y = ridge_piece(far, 60, 2, [(4, 1)], C['snowS'], 0.6)
    far.add(p, top_only=True)
    p, y = ridge_piece(mid, 64, 3, [(2, 1), (5, 0.4)], C['snowL'], shade=C['snow'])
    mid.add(p, top_only=True)
    for i, x in enumerate((12, 40, 66, 150, 178, 206, 236)):
        q = mid.piece(); q.stamp(prop('pine_snow', 26 if i % 3 != 1 else 18), x, int(y(x)) + 3); mid.add(q, outline=False)
    q = mid.piece(); q.stamp(prop('cabin', 24), 108, int(y(108)) + 3); mid.add(q, outline=False)
    g = side.piece()
    for x in range(-8, TW + 8, 22):
        g.ellipse(x, LH - 6, x + 26, LH + 3, C['white'])
    side.add(g, top_only=True)
    for x, k in ((50, 'snowman'), (130, 'flag'), (210, 'snowman')):
        q = side.piece(); q.stamp(prop(k, 18), x, LH - 1); side.add(q, outline=False)
    return far, mid, side


def jungle():
    """5. Jungle Jam: misty mountains with a waterfall, a dark green ridge of big trees, grass, mushrooms."""
    far, mid, side = Layer(), Layer(), Layer()
    for x, w, h in ((50, 50, 40), (150, 56, 46), (230, 40, 34)):
        m = far.piece(); b = 58
        m.poly([(x - w, b), (x - 6, b - h), (x + 6, b - h), (x + w, b)], C['mint'])
        m.poly([(x + 2, b - h), (x + 6, b - h), (x + w, b), (x + 12, b)], C['mintS'])
        far.add(m)
    wf = far.piece(); dither_rect(wf, 146, 22, 154, 56, C['white'], C['skyL']); far.add(wf)
    p, y = ridge_piece(far, 56, 4, [(3, 1), (5, 0.5)], C['mintS'], 0.7)
    far.add(p, top_only=True)
    p, y = ridge_piece(mid, 64, 3, [(4, 1), (7, 0.4)], C['mintD'])
    mid.add(p, top_only=True)
    for i, x in enumerate((10, 40, 74, 104, 140, 172, 204, 236)):
        q = mid.piece(); q.stamp(prop('tree', 30 if i % 2 == 0 else 20), x, int(y(x)) + 3); mid.add(q, outline=False)
    g = side.piece(); g.rect(0, LH - 5, TW * 3, LH - 1, C['mintD']); side.add(g, top_only=True)
    gr = side.piece()
    for x in range(3, TW, 9):
        gr.poly([(x, LH - 4), (x + 1, LH - 9 - x % 3), (x + 2, LH - 4)], C['mint']); gr.poly([(x + 2, LH - 4), (x + 4, LH - 7), (x + 4, LH - 4)], C['mintS'])
    side.add(gr, outline=False)
    for x in (34, 120, 196):
        q = side.piece(); q.stamp(prop('mushroom', 10), x, LH - 1); side.add(q, outline=False)
    return far, mid, side


def volcano():
    """6. Volcano Valley (a dark track): a smoking volcano with a lava glow, lava pools, dark rocks and crystals."""
    far, mid, side = Layer(), Layer(), Layer()
    p, y = ridge_piece(far, 54, 4, [(3, 1), (5, 0.5)], C['dock2'], 0.3)
    far.add(p, top_only=True)
    v = far.piece(); x, b, t = 128, 62, 14
    v.poly([(x - 70, b), (x - 10, t), (x + 10, t), (x + 70, b)], C['cocoaS'])
    v.poly([(x + 4, t), (x + 10, t), (x + 70, b), (x + 24, b)], C['ink'])
    far.add(v)
    lava = far.piece()
    lava.poly([(x - 6, t + 1), (x - 3, t + 1), (x - 16, t + 30), (x - 20, t + 30)], C['peach'])
    lava.poly([(x + 3, t + 1), (x + 6, t + 1), (x + 24, t + 34), (x + 20, t + 34)], C['peach'])
    lava.rect(x - 9, t, x + 9, t + 1, C['spark'])
    far.add(lava, outline=False)
    for k, (dx, dy, s) in enumerate(((-4, -6, 5), (2, -12, 6), (-2, -19, 7))):
        sm = far.piece(); sm.ellipse(x + dx - s, t + dy - s, x + dx + s, t + dy + s, C['stoneS']); far.add(sm)
    p, y = ridge_piece(mid, 66, 3, [(3, 1), (6, 0.5)], C['dock'])
    mid.add(p, top_only=True)
    for x in (40, 120, 200):
        pool = mid.piece(); yy = int(y(x)) + 6
        pool.ellipse(x - 12, yy - 2, x + 12, yy + 3, C['peach']); pool.ellipse(x - 7, yy - 1, x + 7, yy + 1, C['spark'])
        mid.add(pool)
        q = mid.piece(); q.stamp(prop('rock', 9), x + 30, int(y(x + 30)) + 4); mid.add(q, outline=False)
    g = side.piece(); g.rect(0, LH - 6, TW * 3, LH - 1, C['dock2']); side.add(g, top_only=True)
    for x in (20, 70, 150, 230):
        q = side.piece(); q.stamp(prop('rock', 9 if x % 20 else 6), x, LH - 1); side.add(q, outline=False)
    for x in (110, 190):
        q = side.piece(); q.stamp(prop('crystal', 9), x, LH - 1); side.add(q, outline=False)
    return far, mid, side


def galaxy():
    """7. Galaxy Grand Prix (a dark track): floating rocks, a violet ridge with glass domes and rockets, lanterns."""
    far, mid, side = Layer(), Layer(), Layer()
    for x, yy in ((30, 14), (110, 26), (200, 10)):
        q = far.piece(); q.stamp(prop('rock', 6 if x % 20 else 9), x, yy); far.add(q, outline=False)
    p, y = ridge_piece(far, 56, 4, [(2, 1), (5, 0.4)], C['dock'], 0.3)
    far.add(p, top_only=True)
    p, y = ridge_piece(mid, 64, 3, [(3, 1), (4, 0.5)], C['grapeS'])
    mid.add(p, top_only=True)
    cr = mid.piece()
    for x in (18, 66, 98, 150, 220):
        yy = int(y(x)) + 8 + x % 5
        cr.ellipse(x - 7, yy - 1, x + 7, yy + 2, C['dock']); cr.rect(x - 4, yy, x + 4, yy, C['dock2'])
    mid.add(cr, outline=False)
    for x in (40, 168):
        q = mid.piece(); q.stamp(prop('dome', 16), x, int(y(x)) + 3); mid.add(q, outline=False)
        q = mid.piece(); q.stamp(prop('rocket', 26), x + 34, int(y(x + 34)) + 3); mid.add(q, outline=False)
    g = side.piece(); g.rect(0, LH - 5, TW * 3, LH - 1, C['dock']); side.add(g, top_only=True)
    for x in range(16, TW, 64):
        q = side.piece(); q.stamp(prop('lantern', 18), x, LH - 1); side.add(q, outline=False)
    for x in (48, 112, 176, 240):
        q = side.piece(); q.stamp(prop('crystal', 9), x, LH - 1); side.add(q, outline=False)
    return far, mid, side


# the scene recipes the game reads (sky stops top -> horizon, dust colour, ambient life, sky decorations)
SCENES = {
    1: dict(draw=town, sky=[C['sky'], C['skyL'], C['snow']], dust=C['cream'], amb='flutter', deco=[('sun', 0.14, 0.22)]),
    2: dict(draw=beach, sky=[C['skyS'], C['sky'], C['skyL']], dust=C['cream'], amb='gull', deco=[('sun', 0.8, 0.2)]),
    3: dict(draw=desert, sky=[C['peach'], C['peachL'], C['sparkT']], dust=C['peachL'], amb='tumble', deco=[('sunbig', 0.3, 0.45)]),
    4: dict(draw=snowy, sky=[C['skyL'], C['snow'], C['snowL']], dust=C['white'], amb='snow', deco=[('sun', 0.7, 0.18)]),
    5: dict(draw=jungle, sky=[C['mintL'], C['snow'], C['snowL']], dust=C['cocoaL'], amb='leaf', deco=[]),
    6: dict(draw=volcano, sky=[C['dock2'], C['grapeS'], C['coralS'], C['peach']], dust=C['stoneL'], amb='ember', deco=[('moon', 0.82, 0.18)], dark=True),
    7: dict(draw=galaxy, sky=[C['ink'], C['dock2'], C['dock'], C['grapeS']], dust=C['grapeL'], amb='twinkle', deco=[('planet', 0.76, 0.3), ('planet_s', 0.18, 0.16)], dark=True),
}
# the road (game draws it): asphalt, lane dashes, kerb colours
ROADS = {1: ('stoneS', 'cream', 'coral', 'cream'), 2: ('stoneS', 'cream', 'coral', 'cream'), 3: ('cocoa', 'peachL', 'coral', 'peachL'),
         4: ('snowS', 'white', 'skyS', 'white'), 5: ('cocoa', 'peachL', 'peach', 'cocoaS'), 6: ('ink', 'peachL', 'coral', 'dock2'),
         7: ('dock2', 'skyL', 'grapeL', 'dock')}
NIGHT = dict(sky=[C['night'], C['night2'], C['night3']])


# ---------------------------------------------------------------- tiny digits (3x5) for house numbers and signs
DIGITS = {
    '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111', '4': '101101111001001',
    '5': '111100111001111', '6': '111100111101111', '7': '111001010010010', '8': '111101111101111', '9': '111101111001111',
}


def digit(p, s, x, y, col, bg=None):
    if bg:
        p.ellipse(x - 2, y - 2, x + 4 * len(s), y + 6, bg)
    for i, ch in enumerate(s):
        bits = DIGITS[ch]
        for k, b in enumerate(bits):
            if b == '1':
                p.px(x + i * 4 + k % 3, y + k // 3, col)


# ---------------------------------------------------------------- effects and sky decorations (hand-pixelled)
def fx():
    out = {}

    def canvas(w, h):
        im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        return im, ImageDraw.Draw(im)

    def outlined(im):
        return Image.fromarray(ink_edge(np.array(im)))
    # dust puffs: three sizes, in three tints (the scene picks one)
    for tint, (c1, c2) in {'light': (C['white'], C['snow']), 'sand': (C['peachL'], C['peach']), 'dark': (C['stoneL'], C['stone'])}.items():
        for i, r in enumerate((2, 3, 4)):
            im, d = canvas(2 * r + 2, 2 * r + 2)
            d.ellipse([1, 1, 2 * r, 2 * r], fill=rgba(c1)); d.ellipse([r, r, 2 * r, 2 * r], fill=rgba(c2))
            out[f'fx_dust_{tint}_{i}'] = im
    # exhaust flame: two flickers
    for i, ln in enumerate((9, 12)):
        im, d = canvas(ln + 2, 9)
        d.polygon([(ln, 1), (1, 4), (ln, 7)], fill=rgba(C['coral'])); d.polygon([(ln, 2), (4, 4), (ln, 6)], fill=rgba(C['peach']))
        d.polygon([(ln, 3), (ln - 4, 4), (ln, 5)], fill=rgba(C['spark']))
        out[f'fx_flame_{i}'] = outlined(im)
    # reward sparkle: a 4-point star, three sizes
    for i, r in enumerate((4, 3, 2)):
        im, d = canvas(2 * r + 3, 2 * r + 3)
        c = r + 1
        d.polygon([(c, c - r), (c + 1, c - 1), (c + r, c), (c + 1, c + 1), (c, c + r), (c - 1, c + 1), (c - r, c), (c - 1, c - 1)], fill=rgba(C['spark']))
        d.point((c, c), fill=rgba(C['white']))
        out[f'fx_spark_{i}'] = outlined(im)
    # oops puff (grey), two sizes
    for i, r in enumerate((3, 5)):
        im, d = canvas(2 * r + 3, 2 * r + 3)
        d.ellipse([1, 2, 2 * r, 2 * r + 1], fill=rgba(C['stoneL'])); d.ellipse([r - 1, 1, 2 * r + 1, 2 * r], fill=rgba(C['snowS']))
        out[f'fx_puff_{i}'] = outlined(im)
    # sky decorations
    im, d = canvas(16, 16); d.ellipse([1, 1, 14, 14], fill=rgba(C['sparkL'])); d.ellipse([3, 3, 9, 9], fill=rgba(C['sparkT'])); out['sky_sun'] = outlined(im)
    im, d = canvas(26, 26); d.ellipse([1, 1, 24, 24], fill=rgba(C['sparkL'])); d.ellipse([4, 4, 14, 14], fill=rgba(C['sparkT'])); out['sky_sunbig'] = outlined(im)
    im, d = canvas(13, 13); d.ellipse([1, 1, 11, 11], fill=rgba(C['snowL'])); d.ellipse([6, 3, 8, 5], fill=rgba(C['snow'])); d.ellipse([3, 7, 5, 9], fill=rgba(C['snow'])); out['sky_moon'] = outlined(im)
    im, d = canvas(34, 20)
    d.ellipse([2, 7, 31, 13], outline=rgba(C['peachL']), width=2)
    d.ellipse([10, 2, 23, 17], fill=rgba(C['peachL'])); d.ellipse([15, 7, 23, 17], fill=rgba(C['peach']))
    d.arc([2, 7, 31, 13], 0, 180, fill=rgba(C['sparkT']), width=2)
    out['sky_planet'] = outlined(im)
    im, d = canvas(10, 10); d.ellipse([1, 1, 8, 8], fill=rgba(C['skyL'])); d.ellipse([4, 4, 8, 8], fill=rgba(C['sky'])); out['sky_planet_s'] = outlined(im)
    # ambient life
    im, d = canvas(7, 4); d.point([(0, 0), (1, 1), (2, 2), (4, 2), (5, 1), (6, 0), (3, 2)], fill=rgba(INK)); out['amb_gull_0'] = im
    im, d = canvas(7, 4); d.point([(0, 2), (1, 1), (2, 1), (3, 2), (4, 1), (5, 1), (6, 2)], fill=rgba(INK)); out['amb_gull_1'] = im
    for i, wgt in enumerate((3, 1)):
        im, d = canvas(9, 6)
        d.ellipse([4 - wgt - 1, 0, 4, 4], fill=rgba(C['coralL'])); d.ellipse([4, 0, 4 + wgt + 1, 4], fill=rgba(C['coralL'])); d.line([(4, 1), (4, 4)], fill=rgba(INK))
        out[f'amb_fly_{i}'] = im
    im, d = canvas(6, 4); d.ellipse([0, 0, 5, 3], fill=rgba(C['mint'])); d.line([(1, 2), (4, 1)], fill=rgba(C['mintS'])); out['amb_leaf'] = outlined(im)
    for i in range(2):
        im, d = canvas(9, 9); d.ellipse([1, 1, 7, 7], outline=rgba(C['cocoa']))
        if i == 0:
            d.line([(2, 2), (6, 6)], fill=rgba(C['cocoaL'])); d.line([(2, 6), (6, 2)], fill=rgba(C['cocoaL']))
        else:
            d.line([(4, 1), (4, 7)], fill=rgba(C['cocoaL'])); d.line([(1, 4), (7, 4)], fill=rgba(C['cocoaL']))
        out[f'amb_tumble_{i}'] = im
    return out


# ---------------------------------------------------------------- the atlas
def pack(items, width=512):
    """Shelf packer: tallest first, 1 px gap. -> (image, {name: [x, y, w, h]})."""
    order = sorted(items.items(), key=lambda kv: (-kv[1].height, kv[0]))
    x = y = sh = 0
    pos = {}
    for name, im in order:
        if x + im.width > width:
            x, y, sh = 0, y + sh + 1, 0
        pos[name] = [x, y, im.width, im.height]
        x += im.width + 1
        sh = max(sh, im.height)
    H = y + sh
    atlas = Image.new('RGBA', (width, H), (0, 0, 0, 0))
    for name, im in items.items():
        atlas.alpha_composite(im, tuple(pos[name][:2]))
    return atlas, pos


def indexed_png(im):
    """RGBA (palette colours only, alpha 0 or 255) -> an indexed PNG with a tRNS entry: the smallest honest file."""
    a = np.array(im)
    used = []
    flat = a.reshape(-1, 4)
    keys = (flat[:, 0].astype(np.int64) << 24) | (flat[:, 1].astype(np.int64) << 16) | (flat[:, 2].astype(np.int64) << 8) | flat[:, 3]
    uniq = np.unique(keys)
    used = [(int(k >> 24) & 255, int(k >> 16) & 255, int(k >> 8) & 255, int(k) & 255) for k in uniq]
    assert len(used) <= 256, len(used)
    for c in used:
        if c[3] not in (0, 255):
            raise ValueError(f'semi-transparent pixel {c}')
        if c[3] == 255:
            h = '#%02X%02X%02X' % c[:3]
            assert h in PALETTE, f'{h} is not a palette colour'
    used.sort(key=lambda c: c[3])   # transparent first
    lut = {((c[0] << 24) | (c[1] << 16) | (c[2] << 8) | c[3]): i for i, c in enumerate(used)}
    idx = np.vectorize(lut.get)(keys).astype(np.uint8).reshape(a.shape[:2])
    p = Image.fromarray(idx, 'P')
    p.putpalette([v for c in used for v in c[:3]])
    trans = bytes(c[3] for c in used)
    buf = io.BytesIO()
    p.save(buf, 'PNG', optimize=True, transparency=trans)
    return buf.getvalue()


def load_sprites(d):
    for f in sorted(os.listdir(d)):
        if f.endswith('.png') and not f.endswith('.raw.png'):
            im = Image.open(os.path.join(d, f)).convert('RGBA')
            a = np.array(im)
            a[..., 3] = np.where(a[..., 3] > 127, 255, 0)
            SPR[f[:-4]] = Image.fromarray(a)


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument('--sprites', required=True, nargs='+', help='folders of PNGs from pixel_racers.py and pixel_props.py')
    ap.add_argument('--out', default=None)
    ap.add_argument('--pack', default=os.path.join(ROOT, 'kit/packs/art-pixel.js'))
    a = ap.parse_args(argv)
    for d in a.sprites:
        load_sprites(d)
    meta = {}
    for d in a.sprites:
        m = os.path.join(d, 'meta.json')
        if os.path.exists(m):
            meta = json.load(open(m))
    items = {}
    for k, v in SPR.items():
        if k.startswith(('kart_', 'head_')):
            items[k] = v
    scenes = {}
    for n, sc in SCENES.items():
        far, mid, side = sc['draw']()
        for nm, L in (('far', far), ('mid', mid), ('side', side)):
            t = L.tile()
            bb = t.getbbox()
            top = bb[1] if bb else LH - 1
            items[f'sc{n}_{nm}'] = t.crop((0, top, TW, LH))   # stored cropped: the layer's top rows are empty
        scenes[n] = {'sky': sc['sky'], 'dust': sc['dust'], 'amb': sc['amb'], 'deco': sc['deco'], 'dark': bool(sc.get('dark')),
                     'road': [C[k] for k in ROADS[n]]}
    items.update(fx())
    atlas, pos = pack(items)
    png = indexed_png(atlas)
    out = a.out
    if out:
        os.makedirs(out, exist_ok=True)
        open(os.path.join(out, 'atlas.png'), 'wb').write(png)
        prev = Image.new('RGBA', (TW * 3 + 8, 8 + 7 * (LH + 4)), (255, 255, 255, 255))
        for n in SCENES:
            y0 = 4 + (n - 1) * (LH + 4)
            sky = Image.new('RGBA', (TW * 3, LH), rgba(SCENES[n]['sky'][-1]))
            prev.alpha_composite(sky, (4, y0))
            for nm, f in (('far', 0), ('mid', 0), ('side', 0)):
                im = items[f'sc{n}_{nm}']
                for k in range(3):
                    prev.alpha_composite(im, (4 + k * TW, y0 + LH - im.height))
        prev = prev.resize((prev.width * 3, prev.height * 3), Image.NEAREST)
        prev.save(os.path.join(out, 'preview.png'))
    data = {
        'png': 'data:image/png;base64,' + base64.b64encode(png).decode(),
        'frames': pos,
        'tile': [TW, LH],
        'kart': meta.get('frame', [64, 56]), 'disc': meta.get('disc'), 'seat': meta.get('seat'), 'ground': meta.get('ground'),
        'palette': PALETTE, 'scenes': scenes, 'night': NIGHT,
    }
    write_pack(a.pack, data)
    print(json.dumps({'atlas': list(atlas.size), 'png_bytes': len(png), 'frames': len(pos)}))


def write_pack(path, data):
    js = f"""// Art pack "art-pixel" (public/vendor/oomba-kit/<version>/packs/art-pixel.js): the pixel art for the kit's pixel
// style (style-pixel). GENERATED by tools/blender/pixel_atlas.py from the Blender renders of tools/blender/pixel_racers.py
// and pixel_props.py and the hand-pixelled track layers in pixel_atlas.py: do not edit by hand, run those again.
// One atlas (an indexed PNG, palette colours only, as a data: URI: the game frame's img-src allows data: and blob:) and
// its frame map: karts with their drivers (idle, d0-d2, cheer), empty karts and their front layer (a game's own avatar
// sits between), HUD heads, the seven track worlds (far, mid and roadside tiles {TW} px wide, bottom-up from the road),
// effects, sky decorations and ambient life. Oomba.pixel.art (style-pixel) reads it.
export const PACK = {{ name: 'art-pixel' }};
export function define(K) {{
  const A = {json.dumps(data, separators=(',', ':'))};
  K.kit.pixelArt = A;
  if (K.kit.pixelArtReady) K.kit.pixelArtReady(A);
}}
"""
    open(path, 'w').write(js)


if __name__ == '__main__':
    main(sys.argv[1:])
