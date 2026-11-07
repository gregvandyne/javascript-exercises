"""Word Trail's art -> its data pack (docs/decisions.md "Game data packs").

    python3 tools/blender/word_trail_pack.py DIR        (DIR: tools/blender/word_trail.py's --out)

Trims each sprite to its art, scales it to the size the game shows it at (2x for sharp phones), encodes it as WebP and
writes public/vendor/data/word-trail/1.0.0-<hash>/art.js, a script that sets window.__wtArt = { name: 'data:image/
webp;base64,...' } (the game frame allows data: images only, and has no fetch). The two grey swatches become small
seamless tiles (mirrored) with their contrast stretched, for the CSS felt and paper. Prints the pack's path, its
integrity value and the sizes; refuses to write past CAP (the brief: art well under 1 MB).
"""
import base64
import hashlib
import io
import json
import os
import sys

from PIL import Image, ImageChops, ImageFilter, ImageOps

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
CAP = 600_000          # the whole pack (base64 included), bytes
# name: height (or width, 'w') in pixels after trimming
SIZES = {
    'mascot_idle': 340, 'mascot_cheer': 340, 'mascot_think': 340, 'mascot_sad': 340,
    'chest_closed': ('w', 300), 'chest_open': ('w', 300), 'sign': 240,
    'tree': 280, 'pine': 260, 'bush': ('w', 220), 'flowers': ('w', 220),
    'stone_grey': ('w', 200), 'stone_gold': ('w', 200), 'stone_mint': ('w', 200), 'stone_lilac': ('w', 200),
}


def sprite(path, size):
    im = Image.open(path).convert('RGBA')
    box = im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
    im = im.crop(box)
    if isinstance(size, tuple):
        w = size[1]; h = round(im.height * w / im.width)
    else:
        h = size; w = round(im.width * h / im.height)
    im = im.resize((w, h), Image.LANCZOS)
    b = io.BytesIO(); im.save(b, 'WEBP', quality=80, method=6, alpha_quality=90)
    return b.getvalue(), (w, h)


def tile(path, kind):
    """A 256 px seamless tile: a 128 px crop, contrast stretched into a light band (multiply-friendly), mirrored 2x2."""
    g = ImageOps.grayscale(Image.open(path)).crop((128, 128, 256, 256))
    # keep the fibres, drop the big blotches (a high pass), so the tiles never show a repeating pattern
    hp = ImageChops.add(ImageChops.subtract(g, g.filter(ImageFilter.GaussianBlur(6)), 1, 128), Image.new('L', g.size, 0))
    g = ImageOps.autocontrast(hp, cutoff=1)
    lo, hi = (196, 255) if kind == 'felt' else (234, 255)
    g = g.point(lambda v: int(lo + (hi - lo) * v / 255))
    t = Image.new('L', (256, 256))
    t.paste(g, (0, 0)); t.paste(ImageOps.mirror(g), (128, 0)); t.paste(ImageOps.flip(g), (0, 128)); t.paste(ImageOps.flip(ImageOps.mirror(g)), (128, 128))
    b = io.BytesIO(); t.save(b, 'WEBP', quality=60, method=6)
    return b.getvalue(), (256, 256)


def main():
    src = sys.argv[1]
    art, sizes, raw = {}, {}, 0
    for name, size in SIZES.items():
        data, wh = sprite(os.path.join(src, name + '.png'), size)
        art[name] = 'data:image/webp;base64,' + base64.b64encode(data).decode(); sizes[name] = [wh[0], wh[1], len(data)]; raw += len(data)
    for kind in ('felt', 'paper'):
        data, wh = tile(os.path.join(src, f'tex_{kind}.png'), kind)
        art['tex_' + kind] = 'data:image/webp;base64,' + base64.b64encode(data).decode(); sizes['tex_' + kind] = [wh[0], wh[1], len(data)]; raw += len(data)
    dims = {k: v[:2] for k, v in sizes.items()}
    body = ('/* Word Trail: its felt-and-paper sprites (tools/blender/word_trail.py, tools/blender/word_trail_pack.py). */\n'
            'window.__wtArt = ' + json.dumps(art, separators=(',', ':')) + ';\nwindow.__wtArtSize = ' + json.dumps(dims, separators=(',', ':')) + ';\n')
    if len(body) > CAP:
        sys.exit(f'over the cap: {len(body)} B > {CAP}')
    h = hashlib.sha256(body.encode()).hexdigest()[:8]
    rel = f'public/vendor/data/word-trail/1.0.0-{h}'
    os.makedirs(os.path.join(ROOT, rel), exist_ok=True)
    with open(os.path.join(ROOT, rel, 'art.js'), 'w') as f:
        f.write(body)
    sri = 'sha384-' + base64.b64encode(hashlib.sha384(body.encode()).digest()).decode()
    print(json.dumps({'ver': f'1.0.0-{h}', 'src': '/' + rel[len('public/'):] + '/art.js', 'integrity': sri, 'webp_bytes': raw, 'pack_bytes': len(body), 'sizes': sizes}, indent=1))


if __name__ == '__main__':
    main()
