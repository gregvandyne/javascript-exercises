// Story kit styles (server/stories/blender/styles.py): felt | cartoon | pixel. The switch defaults to felt (the
// Story Builder's look, unchanged); cartoon only uses the Oomba Ink palette (docs/kit.md §2.1); pixel stays in its
// fixed palette. The style sheet script renders every style at a quarter size. The Blender parts are skipped
// cleanly when bpy (Blender as a Python module) isn't installed.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const { hasBpy } = await import('../../server/stories/renderer.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const KIT = path.join(ROOT, 'server/stories/blender');
const PY = process.env.STORY_PYTHON || 'python3';
const bpy = await hasBpy();
const why = bpy ? false : 'bpy (Blender as a Python module) is not installed';

function py(code, timeout = 120e3) {
  const r = spawnSync(PY, ['-c', code], { cwd: KIT, encoding: 'utf8', timeout, maxBuffer: 64 << 20 });
  assert.equal(r.status, 0, r.stderr.slice(-2000));
  const last = r.stdout.trim().split('\n').filter(l => l.startsWith('{')).pop();
  return JSON.parse(last);
}

test('styles: one switch, felt by default, and the story renderer passes the spec\'s style through', () => {
  const src = fs.readFileSync(path.join(KIT, 'styles.py'), 'utf8');
  for (const s of ['felt', 'cartoon', 'pixel']) assert.match(src, new RegExp(`^    '${s}': \\{`, 'm'), `STYLES has ${s}`);
  assert.match(src, /^DEFAULT = 'felt'$/m);
  const rs = fs.readFileSync(path.join(KIT, 'render_story.py'), 'utf8');
  assert.ok(rs.includes("K.set_style(spec.get('style') or 'felt')"));
  assert.ok(rs.includes('S.finish(spec, sc_spec)') && rs.includes('S.post(spec, sc.render.filepath)'));
  const fk = fs.readFileSync(path.join(KIT, 'feltkit.py'), 'utf8');
  for (const fn of ['felt', 'paper', 'glossy', 'glow', 'haze', 'sky']) assert.ok(fk.includes(`return _restyle('${fn}'`), `feltkit.${fn} asks the style`);
});

test('styles: cartoon colours are the Oomba Ink palette; pixel keeps to 32 colours with Ink', { skip: why }, () => {
  const kitHex = new Set((fs.readFileSync(path.join(ROOT, 'docs/kit.md'), 'utf8').match(/#[0-9A-F]{6}/g) || []));
  const out = py(`
import json, styles as S
cart = sorted({S.token(v) for v in S.CARTOON_MAP.values()})
derived = sorted({c for h in S.RAMPS for c in S.ramp(h)[3:]})
skies = sorted({c for p in S.SKY_KEYS.values() for c in p})
print(json.dumps({'cart': cart, 'derived': derived, 'skies': skies, 'pixel': S.STYLES['pixel']['palette'],
                  'shade': S.shade_of('peach.base'), 'near': S.nearest_token('#f2a46e')}))`);
  const allowed = new Set([...kitHex, ...out.derived, ...out.skies]);
  for (const c of out.cart) assert.ok(allowed.has(c), `${c} is a kit colour (or a kit shade step)`);
  assert.equal(out.shade, '#C9713A', 'the cel shade is the hue\'s shade step');
  assert.equal(out.near, 'peach.base');
  assert.ok(out.pixel.length <= 32 && out.pixel.includes('#141414'));
  assert.equal(new Set(out.pixel).size, out.pixel.length);
});

test('styles: a story spec without a style builds the felt look, untouched', { skip: why, timeout: 3 * 60e3 }, () => {
  const out = py(`
import json, render_story as R, feltkit as K
spec = {'width': 64, 'height': 36, 'engine': 'eevee', 'samples': 1}
R.build_scene(spec, {'id': 'a', 'set': 'lighthouse', 'time': 'night', 'frames': 4, 'characters': [{'kind': 'fox', 'action': 'idle'}]})
import bpy
mats = [m.name for m in bpy.data.materials]
print(json.dumps({'style': K.STYLE, 'toon': sum(m.startswith(('toon_', 'flat_', 'ink_line')) for m in mats),
                  'felt': sum(m.startswith('felt_') for m in mats), 'lights': len(bpy.data.lights),
                  'ink': sum(1 for o in bpy.data.objects for m in o.modifiers if m.name == 'ink')}))`);
  assert.equal(out.style, 'felt');
  assert.equal(out.toon, 0);
  assert.equal(out.ink, 0);
  assert.ok(out.felt > 10 && out.lights >= 3);
});

test('style sheet: every style renders the same shot; pixel stays on its palette; a sprite strip', { skip: why, timeout: 10 * 60e3 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'style-sheet-'));
  try {
    const r = spawnSync(PY, [path.join(KIT, 'style_sheet.py'), '--out', dir, '--quick'], { encoding: 'utf8', timeout: 9 * 60e3, maxBuffer: 64 << 20 });
    assert.equal(r.status, 0, r.stderr.slice(-2000));
    for (const f of ['felt', 'cartoon', 'pixel'].flatMap(s => [`${s}.png`, `${s}_fox.png`]).concat(['pixel_320.png', 'fox_sprite_strip_1x.png', 'sheet.png', 'timings.json'])) {
      assert.ok(fs.existsSync(path.join(dir, f)), f);
    }
    const size = f => { const b = fs.readFileSync(path.join(dir, f)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
    assert.deepEqual(size('felt.png'), [320, 180]);
    assert.deepEqual(size('pixel.png'), [320, 180]);
    assert.deepEqual(size('pixel_320.png'), [80, 45]);
    assert.deepEqual(size('fox_sprite_strip_1x.png'), [64 * 5, 64]);
    const out = py(`
import json, numpy as np, styles as S
pal = S._srgb_arr(S.STYLES['pixel']['palette'])
small = S.read_png(${JSON.stringify(path.join(dir, 'pixel_320.png'))})[..., :3]
d = np.abs(small.reshape(-1, 1, 3) - pal[None]).max(-1).min(-1)
spr = S.read_png(${JSON.stringify(path.join(dir, 'fox_sprite_strip_1x.png'))})
print(json.dumps({'off': float(d.max()), 'alpha': sorted(set(np.round(spr[..., 3], 3).ravel().tolist())), 'opaque': float((spr[..., 3] > 0).mean())}))`);
    assert.ok(out.off < 1 / 255 + 1e-6, 'every pixel is a palette colour');
    assert.deepEqual(out.alpha, [0, 1], 'sprite pixels are either there or not');
    assert.ok(out.opaque > 0.15, 'the fox is in the sprite frames');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
