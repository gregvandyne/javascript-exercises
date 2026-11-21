#!/usr/bin/env python3
"""Build the site's Fluent Emoji icons (public/icons/fluent/) from Microsoft's repo (MIT).

Usage: python3 scripts/icons/build_fluent.py <fluent checkout> <glyphs.json>
  <fluent checkout>: a clone of https://github.com/microsoft/fluentui-emoji (a sparse, blob-less clone is enough: the
  files this needs are checked out on demand).
  <glyphs.json>: {"<glyph>": {"name": "<file name>", "folder": "<assets folder>", "big": true|false}}
Writes flat/<name>.svg (every icon; numbers rounded to one decimal) and 3d/<name>-64.webp + 3d/<name>-128.webp (icons shown at 28 px and up), and copies
the license. docs/decisions.md "Icons: Fluent Emoji 3D".
"""
import json, os, re, subprocess, sys
from PIL import Image
src, spec = sys.argv[1], json.load(open(sys.argv[2]))
out = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'icons', 'fluent')
os.makedirs(os.path.join(out, 'flat'), exist_ok=True); os.makedirs(os.path.join(out, '3d'), exist_ok=True)
def find(folder, style):
    base = os.path.join(src, 'assets', folder)
    for sub in (style, os.path.join('Default', style)):
        d = os.path.join(base, sub)
        if os.path.isdir(d):
            fs = [f for f in os.listdir(d) if not f.startswith('.')]
            if fs: return os.path.join(d, fs[0])
    return None
pats = []
for g, s in spec.items():
    pats += [f"/assets/{s['folder']}/Flat/*", f"/assets/{s['folder']}/Default/Flat/*"]
    if s.get('big'): pats += [f"/assets/{s['folder']}/3D/*", f"/assets/{s['folder']}/Default/3D/*"]
with open(os.path.join(src, '.git', 'info', 'sparse-checkout'), 'a') as f: f.write('\n'.join(p.replace(' ', '\\ ') for p in pats) + '\n')
subprocess.run(['git', '-C', src, 'read-tree', '-mu', 'HEAD'], check=True)
for g, s in spec.items():
    f = find(s['folder'], 'Flat')
    if not f: print('no flat', s['folder']); continue
    svg = open(f).read()
    svg = re.sub(r'>\s+<', '><', svg).strip()
    svg = re.sub(r'(\d\.\d)\d+', r'\1', svg)   # one decimal is plenty in a 32-unit box (keeps public/icons in its budget)
    open(os.path.join(out, 'flat', s['name'] + '.svg'), 'w').write(svg)
    if s.get('big'):
        p = find(s['folder'], '3D')
        if not p: print('no 3d', s['folder']); continue
        im = Image.open(p).convert('RGBA')
        for px in (64, 128):
            im.resize((px, px), Image.LANCZOS).save(os.path.join(out, '3d', f"{s['name']}-{px}.webp"), 'WEBP', quality=82, method=6)
open(os.path.join(out, 'LICENSE.txt'), 'w').write(open(os.path.join(src, 'LICENSE')).read())
print('built', len(spec))
