// Sum Racer's pixel style (?style=pixel): the game loads the kit's two pixel packs with their exact pinned tags, the
// default is still the Ink look, the style falls back to Ink without the pack, and the pixel art has every frame the
// game draws, in the pixel palette only, small. The e2e twin (tests/e2e/sum-racer-pixel.spec.js) plays it in a frame.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { fakeWin } from '../support/kit-fake.js';
import { createKit, VERSION } from '../../kit/src/index.js';
import { STYLE } from '../../kit/src/chars.js';
import * as stylePixel from '../../kit/packs/style-pixel.js';
import * as artPixel from '../../kit/packs/art-pixel.js';
import * as K from '../../server/services/kit.js';
import { scanVersion } from '../../server/services/scanner.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const html = fs.readFileSync(path.join(ROOT, 'seed-games/sum-racer.html'), 'utf8');
const pure = html.slice(html.indexOf('const CONFIG'), html.indexOf('/* @@PURE-END */'));
const ctx = vm.createContext({});
vm.runInContext(`${pure}\n;globalThis.__sr = { CONFIG };`, ctx);
const { CONFIG } = ctx.__sr;
const art = (() => { let A = null; artPixel.define({ kit: { set pixelArt(v) { A = v; }, get pixelArt() { return A; } } }); return A; })();

test('the game pins the kit pixel packs exactly (after the kit tag) and still passes the scanner', () => {
  const v = K.kitVersion(html);
  for (const name of ['style-pixel', 'art-pixel']) assert.ok(html.includes(K.kitPackTag(name, v)), `${name} is loaded with its exact pinned tag`);
  assert.ok(html.indexOf(K.kitTag(v)) < html.indexOf(K.kitPackTag('style-pixel', v)), 'the kit first');
  assert.deepEqual(scanVersion(html).issues.filter(i => i.level === 'fail'), []);
});

test('the default is the Ink look: CONFIG.style is ink and only ?style=pixel (BRB.params.style) asks for pixel', () => {
  assert.equal(CONFIG.style, 'ink');
  assert.match(html, /const STYLE = \(\(\) => \{ const p = \(window\.BRB && BRB\.params\) \|\| \{\}; return \(p\.style \|\| CONFIG\.style\) === 'pixel' \? 'pixel' : 'ink'; \}\)\(\);/);
  assert.match(html, /const PXK = STYLE === 'pixel' && Oomba\.style\('pixel'\) === 'pixel' && Oomba\.pixel \? Oomba\.pixel : null;/, 'pixel only when the kit says the style is on');
  // every pixel drawing path is behind PIX() (the art decoded), so Ink players run exactly the old code
  for (const hook of ['if (PIX()) return pxRaceView(v, dt, time);', 'if (PIX()) return pxDemo(v, race, cam, dt, time);', 'if (PIX()) { pxSizeThumb(v); pxThumb(v, id); return; }', 'if (PIX()) { pxPodiumStart(); return; }']) assert.ok(html.includes(hook), hook);
  // the pixel skin's CSS only applies under html.sr-pixel, set once the art is ready
  const css = html.slice(0, html.indexOf('</style>'));
  for (const rule of css.match(/^[^@\n{}][^{}\n]*\{/gm).filter(r => /pixel|--u\b/.test(r))) assert.match(rule, /\.sr-pixel/, `pixel rule outside .sr-pixel: ${rule}`);
});

test("the kit: Oomba.style('pixel') is the Ink look without the pack, pixel with it, and back", () => {
  STYLE.name = 'playful';
  const plain = createKit(fakeWin({ search: '' }));
  assert.equal(plain.style('pixel'), 'playful', 'no style-pixel pack: Ink');
  assert.equal(plain.pixel, undefined);
  const win = fakeWin({ search: '' }), O = createKit(win); win.Oomba = O;   // as the kit's own script does
  O.__pk({ name: 'style-pixel', version: VERSION }, stylePixel.define);
  O.__pk({ name: 'art-pixel', version: VERSION }, artPixel.define);
  try {
    assert.equal(O.style('pixel'), 'pixel');
    assert.equal(O.style(), 'pixel');
    assert.ok(O.pixel && O.pixel.style, 'Oomba.pixel is there and on');
    assert.equal(O.pixel.on, false, 'nothing is drawn in pixel art until the atlas has decoded (a fake window has no images)');
    assert.equal(O.pixel.art.png, art.png, 'the art-pixel pack hands its atlas to the style');
    assert.equal(O.pixel.scale(130, 64), 2);
    assert.equal(O.style('playful'), 'playful');
    assert.equal(O.pixel.style, false);
  } finally { STYLE.name = 'playful'; }
});

const FRAMES = [
  ...['fox', 'bunny', 'robot', 'dino'].flatMap(k => ['idle', 'd0', 'd1', 'd2', 'cheer'].map(f => `kart_${k}_${f}`)),
  ...['coral', 'sky'].flatMap(h => ['idle', 'd0', 'd1', 'd2'].flatMap(f => [`kart_empty_${h}_${f}`, `kart_front_${h}_${f}`])),
  ...['fox', 'bunny', 'robot', 'dino'].map(k => `head_${k}`),
  ...[1, 2, 3, 4, 5, 6, 7].flatMap(n => ['far', 'mid', 'side'].map(l => `sc${n}_${l}`)),
  ...['light', 'sand', 'dark'].flatMap(t => [0, 1, 2].map(i => `fx_dust_${t}_${i}`)),
  'fx_flame_0', 'fx_flame_1', 'fx_spark_0', 'fx_spark_1', 'fx_spark_2', 'fx_puff_0', 'fx_puff_1',
  'sky_sun', 'sky_sunbig', 'sky_moon', 'sky_planet', 'sky_planet_s', 'amb_gull_0', 'amb_gull_1', 'amb_fly_0', 'amb_fly_1', 'amb_leaf', 'amb_tumble_0', 'amb_tumble_1',
];

test('the art: every frame the game draws, inside one small indexed PNG that uses palette colours only', () => {
  const png = Buffer.from(art.png.replace(/^data:image\/png;base64,/, ''), 'base64');
  assert.ok(png.length <= 24 * 1024, `atlas ${png.length} bytes`);
  assert.equal(png.toString('latin1', 1, 4), 'PNG');
  const W = png.readUInt32BE(16), H = png.readUInt32BE(20);
  assert.equal(png[24], 8, '8-bit'); assert.equal(png[25], 3, 'indexed colour');
  for (const f of FRAMES) {
    const r = art.frames[f]; assert.ok(r, `frame ${f}`);
    assert.ok(r[0] >= 0 && r[1] >= 0 && r[0] + r[2] <= W && r[1] + r[3] <= H, `${f} inside the atlas`);
  }
  // PLTE: every colour is one of the pixel palette's
  let o = 8; const pal = [];
  while (o < png.length) { const len = png.readUInt32BE(o), type = png.toString('latin1', o + 4, o + 8); if (type === 'PLTE') for (let i = 0; i < len; i += 3) pal.push('#' + png.slice(o + 8 + i, o + 11 + i).toString('hex').toUpperCase()); o += 12 + len; }
  assert.ok(pal.length > 8);
  for (const c of pal) assert.ok(art.palette.includes(c) || c === '#000000', `${c} is a palette colour`);
  // the scene recipes the game reads: one per scenery, and every track's scenery has one
  const sceneOf = track => (track === 8 ? 2 : track === 9 ? 1 : track === 10 ? 3 : track);
  for (const tc of CONFIG.tracks) { const sc = art.scenes[sceneOf(tc.id)]; assert.ok(sc && sc.sky.length >= 2 && sc.road.length === 4, `track ${tc.id}`); for (const c of [...sc.sky, ...sc.road, sc.dust]) assert.ok(art.palette.includes(c), c); }
  assert.deepEqual(art.tile, [256, 80]);
  assert.ok(art.disc && art.seat, 'where the number disc and the seat are');
});

test('crisp on any screen: pixel canvases in device pixels (no 2x cap), whole art pixels, no see-through or anti-aliased drawing', () => {
  const px = html.slice(html.indexOf('const PXA = '), html.indexOf('const freshSave'));
  const fit = html.slice(html.indexOf('function pxFit(v)'), html.indexOf('function pxSizeThumb('));
  assert.match(fit, /pxDpr\(\)/, 'the real ratio');
  assert.doesNotMatch(fit, /dprCap|DPR\(\)/, 'no 2x cap in the pixel fit');
  assert.match(fit, /width: pw \/ dpr \+ 'px', height: ph \/ dpr \+ 'px'/, 'CSS size = device pixels / ratio');
  assert.match(fit, /imageSmoothingEnabled = false/, 'smoothing off after a resize');
  assert.match(html, /const pxDpr = \(\) => Math\.min\(4, window\.devicePixelRatio \|\| 1\);/);
  assert.match(html, /function pxStep\(dpr\)/, 'sizes and positions on the 1/64 px layout grid too');
  assert.match(html, /\.sr-pixel \.sr canvas\{image-rendering:crisp-edges;image-rendering:pixelated\}/);
  assert.match(html, /if \(PIX\(\)\) return pxFit\(v\);/, 'every pixel view goes through it');
  // the pixel drawing: solid palette colours only (a translucent shadow, streak or fade blends colours on edges) and
  // words as hard-edged bitmaps scaled by whole device pixels
  assert.doesNotMatch(px.replace("disc(cx, cy, 9, 'rgba(0,0,0,0)');", ''), /rgba\(/, 'no see-through colours in the pixel drawing');
  assert.doesNotMatch(px, /alpha: a\b/, 'pops vanish in a step, never fade');
  assert.match(px, /function pxLabel\(text, color, edge\)/);
  assert.match(px, /on\[i\] = src\[i \* 4 \+ 3\] >= 110 \? 1 : 0/, 'the label alpha is cut hard');
  assert.match(px, /let n = Math\.max\(1, Math\.floor\(T\.size \/ PX_GRID \* d\)\)/, 'whole device pixels per font pixel');
});
