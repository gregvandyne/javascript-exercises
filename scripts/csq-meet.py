#!/usr/bin/env python3
"""CS Quest "Meet" pictures (and Bolt's thank-you in the finale): each world's guide (the story sprite, public/img/csq/chars/<id>.webp, extracted from its
own game by scripts/csq-sprites.js) standing in a scene cut from that world's own capture, so a "Meet Dot / Pim /
Gizmo" slide shows the character it introduces. The scene is the game's capture, softened, behind a cream card.

Usage: python3 scripts/csq-meet.py   ->  public/img/csq/chars/meet-<id>.webp (1280x720, WebP q80)
The character's box in the picture (% of the frame) is printed for the slide's focus step.
"""
import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, 'public', 'img', 'csq')
# id -> the capture its scene comes from, the disc colour (the character's piece colour, server/views/courses.js)
MEET = {
    'bolt': ('robo-route/sequences-1b-key.webp', '#4FA8F0'),
    'dot': ('data-detective/sort-1b-grouped-n.webp', '#F2994A'),
    'pim': ('packet-post/routes-1b-roads-n.webp', '#FFD23F'),
    'gizmo': ('inside-the-machine/bits-1b-five-n.webp', '#8FC1F5'),
}
W, H = 1280, 720
for cid, (scene, color) in MEET.items():
    bg = Image.open(os.path.join(IMG, scene)).convert('RGB').resize((W, H)).filter(ImageFilter.GaussianBlur(14))
    bg = Image.blend(bg, Image.new('RGB', (W, H), '#FFFDF2'), 0.55)
    d = ImageDraw.Draw(bg)
    cx, cy, r = W // 2, H // 2 + 10, 300
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)
    d.ellipse([cx - r + 18, cy - r + 18, cx + r - 18, cy + r - 18], fill='#FFFDF2')
    sp = Image.open(os.path.join(IMG, 'chars', f'{cid}.webp')).convert('RGBA')
    sh = 400 if cid == 'bolt' else 540   # Bolt is as wide as he is tall: smaller, so his arms stay inside the disc
    sw = round(sp.width * sh / sp.height)
    sp = sp.resize((sw, sh), Image.LANCZOS)
    x, y = cx - sw // 2, cy - sh // 2 + (0 if cid == 'bolt' else 10)
    bg.paste(sp, (x, y), sp)
    out = os.path.join(IMG, 'chars', f'meet-{cid}.webp')
    bg.save(out, 'WEBP', quality=80)
    print(f'{out}: box {[round(x / W * 100, 1), round(y / H * 100, 1), round(sw / W * 100, 1), round(sh / H * 100, 1)]}')
