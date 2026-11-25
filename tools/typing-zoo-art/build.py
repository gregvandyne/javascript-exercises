#!/usr/bin/env python3
"""Typing Zoo's animal pictures (docs/decisions.md "Typing Zoo: Noto animals"): Google's Noto Emoji animals, made small
and packed as scripts under public/vendor/data/typing-zoo-art/<version>/, the way the other games load /vendor/data
(the game frame's CSP allows no picture from another host and no fetch: a script tag with its sha384 brings in the
pictures as data URLs).

  art.js        window.__tzArt = { <pet id>: 'data:image/webp;base64,...' }   every pet, still, 144 px
  a-<id>.js     (window.__tzAnim ||= {})[<id>] = 'data:image/webp;base64,...'   the animated loop where Google made one,
                112 px, every second or third frame (loaded only for the pet that is out)
  LICENSE.txt, NOTICE.md   the licences and where every file came from

Sources (fetched by this script; needs the network): https://fonts.gstatic.com/s/e/notoemoji/latest/<codepoint>/512.png
(the still picture, Noto Emoji: Apache License 2.0) and .../512.webp (the animated one, Noto Animated Emoji: CC BY 4.0).
Needs Python 3 with Pillow (WebP). Usage: python3 tools/typing-zoo-art/build.py [--cache DIR]
It prints ART_VER, ART_SRI and ANIM_SRI for seed-games/typing-zoo.html; old version folders are removed.
"""
import base64, hashlib, io, json, os, shutil, sys, urllib.request
from PIL import Image, ImageSequence

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'public', 'vendor', 'data', 'typing-zoo-art')
# The game's PETS, in order: id and the Noto codepoint drawn for it (near stand-ins: the duck for the duckling, the cow
# for the calf, the llama for the alpaca).
PETS = [('bunny', '1f407'), ('puppy', '1f415'), ('kitten', '1f408'), ('chick', '1f424'), ('giraffe', '1f992'),
        ('elephant', '1f418'), ('kangaroo', '1f998'), ('tiger', '1f405'), ('leopard', '1f406'), ('lizard', '1f98e'),
        ('monkey', '1f412'), ('penguin', '1f427'), ('owl', '1f989'), ('turtle', '1f422'), ('octopus', '1f419'),
        ('horse', '1f40e'), ('dragon', '1f409'), ('chipmunk', '1f43f'), ('mouse', '1f401'), ('hippo', '1f99b'),
        ('pig', '1f416'), ('cow', '1f404'), ('duck', '1f986'), ('dino', '1f995'), ('trex', '1f996'),
        ('whale', '1f40b'), ('dolphin', '1f42c'), ('seal', '1f9ad'), ('crab', '1f980'), ('fish', '1f420'),
        ('bee', '1f41d'), ('ladybug', '1f41e'), ('butterfly', '1f98b'), ('snail', '1f40c'), ('hedgehog', '1f994'),
        ('sloth', '1f9a5'), ('otter', '1f9a6'), ('parrot', '1f99c'), ('flamingo', '1f9a9'), ('peacock', '1f99a'),
        ('alpaca', '1f999')]
BASE = 'https://fonts.gstatic.com/s/e/notoemoji/latest/'
STILL, ANIM = 144, 112


def get(cache, cp, ext):
    path = os.path.join(cache, f'{cp}.{ext}') if cache else None
    if path and os.path.exists(path):
        return open(path, 'rb').read()
    try:
        with urllib.request.urlopen(BASE + f'{cp}/512.{ext}', timeout=60) as r:
            data = r.read()
    except Exception:
        return None
    if not data.startswith(b'\x89PNG' if ext == 'png' else b'RIFF'):
        return None
    if path:
        os.makedirs(cache, exist_ok=True); open(path, 'wb').write(data)
    return data


def still(data):
    b = io.BytesIO()
    Image.open(io.BytesIO(data)).convert('RGBA').resize((STILL, STILL), Image.LANCZOS).save(b, 'WEBP', quality=80, method=6)
    return b.getvalue()


def anim(data, step=2):
    im = Image.open(io.BytesIO(data))
    frames = [(f.convert('RGBA'), f.info.get('duration', 33)) for f in ImageSequence.Iterator(im)]
    out, dur = [], []
    for i in range(0, len(frames), step):
        out.append(frames[i][0].resize((ANIM, ANIM), Image.LANCZOS)); dur.append(sum(d for _, d in frames[i:i + step]))
    b = io.BytesIO()
    out[0].save(b, 'WEBP', save_all=True, append_images=out[1:], duration=dur, loop=0, quality=45, method=4, minimize_size=True, allow_mixed=True)
    # a long, busy loop keeps every third frame instead, so no pet's loop is much over 100 KB
    return anim(data, 3) if step == 2 and b.tell() > 110_000 else b.getvalue()


def url(b):
    return 'data:image/webp;base64,' + base64.b64encode(b).decode()


def sri(text):
    return 'sha384-' + base64.b64encode(hashlib.sha384(text.encode()).digest()).decode()


LICENSE = """Typing Zoo's animal pictures are Google's Noto Emoji animals, resized and converted to WebP.

Still pictures (art.js): Noto Emoji, Copyright Google LLC, Apache License, Version 2.0
  https://github.com/googlefonts/noto-emoji  (http://www.apache.org/licenses/LICENSE-2.0)
Animated pictures (a-<id>.js): Noto Animated Emoji, Copyright Google LLC, Creative Commons Attribution 4.0 International
  https://googlefonts.github.io/noto-emoji-animation/  (https://creativecommons.org/licenses/by/4.0/)
Changes: resized (144 px still, 112 px animated, every second or third frame kept), converted to WebP, packed as data URLs.
The game shows the credit "Animal art: Noto Emoji by Google, CC BY 4.0" in the pet collection.
"""


def main():
    cache = sys.argv[sys.argv.index('--cache') + 1] if '--cache' in sys.argv else None
    stills, anims, rows = {}, {}, []
    for pid, cp in PETS:
        png = get(cache, cp, 'png')
        if not png:
            sys.exit(f'no still picture for {pid} ({cp})')
        stills[pid] = url(still(png))
        w = get(cache, cp, 'webp')
        if w:
            anims[pid] = url(anim(w))
        rows.append(f'| {pid} | U+{cp.upper()} | {BASE}{cp}/512.png | ' + (f'{BASE}{cp}/512.webp' if w else 'none') + ' |')
    files = {'art.js': '/* Typing Zoo: Noto Emoji animals by Google (Apache 2.0), see LICENSE.txt. */\nwindow.__tzArt = ' + json.dumps(stills, separators=(',', ':')) + ';\n'}
    for pid, u in anims.items():
        files[f'a-{pid}.js'] = '/* Typing Zoo: Noto Animated Emoji by Google (CC BY 4.0), see LICENSE.txt. */\n(window.__tzAnim = window.__tzAnim || {})[' + json.dumps(pid) + '] = ' + json.dumps(u) + ';\n'
    files['LICENSE.txt'] = LICENSE
    files['NOTICE.md'] = '# Where each picture came from\n\n| Pet id | Emoji | Still (Apache 2.0) | Animated (CC BY 4.0) |\n|---|---|---|---|\n' + '\n'.join(rows) + '\n'
    h = hashlib.sha256(''.join(files[k] for k in sorted(files)).encode()).hexdigest()[:8]
    ver = f'1.0.0-{h}'
    if os.path.isdir(OUT):
        for old in os.listdir(OUT):
            if old != ver:
                shutil.rmtree(os.path.join(OUT, old))
    os.makedirs(os.path.join(OUT, ver), exist_ok=True)
    for name, text in files.items():
        open(os.path.join(OUT, ver, name), 'w').write(text)
    total = sum(len(t) for t in files.values())
    print(f"const ART_VER = '{ver}', ART_SRI = '{sri(files['art.js'])}';")
    print('const ANIM_SRI = ' + json.dumps({p: sri(files[f'a-{p}.js']) for p in anims}, separators=(', ', ': ')) + ';')
    print(f'# {len(stills)} still, {len(anims)} animated, {total // 1024} KB in public/vendor/data/typing-zoo-art/{ver}/ (art.js {len(files["art.js"]) // 1024} KB)', file=sys.stderr)


if __name__ == '__main__':
    main()
