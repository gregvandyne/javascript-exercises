// Oomba Kit rendering core without a browser: atlas packing and page recycling, size buckets, the pooled display
// list, shared placement maths, the governor (synthetic frame times), sky model, fit, particles, LUT, flash limiter,
// and the art grammar (deterministic drawing, ink + rim + mask on every sticker).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Shelves, Atlas, bucket, PAD } from '../../kit/src/atlas.js';
import { DisplayList, View } from '../../kit/src/list.js';
import { Governor, pickBackend, pickTier, TIER_SPEC } from '../../kit/src/governor.js';
import { sky, skyAt, SKY_KEYS } from '../../kit/src/sky.js';
import { computeFit } from '../../kit/src/fit.js';
import { Particles, PRESET_NAMES } from '../../kit/src/particles.js';
import { makeLut } from '../../kit/src/glaze.js';
import { FlashLimiter } from '../../kit/src/juice.js';
import { Camera } from '../../kit/src/camera.js';
import { mulberry32 } from '../../kit/src/rand.js';
import { NIGHT_SKY } from '../../kit/src/tokens.js';

// ---- a recording fake canvas (enough for the atlas and the art grammar) ----
class FakePath { constructor() { this.ops = []; } }
for (const m of ['moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'arc', 'arcTo', 'ellipse', 'rect', 'closePath']) FakePath.prototype[m] = function (...a) { this.ops.push([m, ...a.map(v => (typeof v === 'number' ? +v.toFixed(3) : v))]); };
globalThis.Path2D = FakePath;
function fakeDoc(log = []) {
  const ctxFor = c => new Proxy({ canvas: c, getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), measureText: s => ({ width: String(s).length * 10 }), createRadialGradient: () => ({ addColorStop() {} }), createLinearGradient: () => ({ addColorStop() {} }) }, {
    get(t, k) { if (k in t) return t[k]; return (...a) => { log.push([k, ...a.map(v => (v instanceof FakePath ? v.ops : typeof v === 'number' ? +v.toFixed(3) : typeof v === 'object' ? 'obj' : v))]); }; },
    set(t, k, v) { log.push(['set', k, v]); t[k] = v; return true; },
  });
  return { createElement: () => { const c = { width: 1, height: 1 }; const ctx = ctxFor(c); c.getContext = () => ctx; return c; } };
}

test('shelf packer: never overlaps, keeps padding, says when full', () => {
  const S = new Shelves(256), R = mulberry32(5), rects = [];
  for (let i = 0; i < 400; i++) { const w = 4 + Math.floor(R() * 60), h = 4 + Math.floor(R() * 60); const r = S.add(w, h); if (r) rects.push({ ...r, w, h }); }
  assert.ok(rects.length > 10 && rects.length < 400, 'fills up');
  for (const a of rects) { assert.ok(a.x >= PAD && a.y >= PAD && a.x + a.w <= 256 - PAD + PAD && a.y + a.h <= 256); }
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    assert.ok(a.x + a.w + PAD <= b.x || b.x + b.w + PAD <= a.x || a.y + a.h + PAD <= b.y || b.y + b.h + PAD <= a.y, `overlap ${i} ${j}`);
  }
  assert.equal(S.add(300, 10), null);
});

test('size buckets: ~15% steps, so small zoom changes never re-bake', () => {
  assert.equal(bucket(100), bucket(104)); assert.notEqual(bucket(100), bucket(120));
  for (let px = 8; px < 2000; px *= 1.07) { const b = bucket(px); assert.ok(b / px > 0.9 && b / px < 1.1, `${px} -> ${b}`); }
});

test('atlas: sprites bake once per bucket, a nearby size stands in while the exact one queues, full pages recycle LRU', () => {
  const A = new Atlas({ doc: fakeDoc(), pageSize: 256, maxPages: 2 });
  let bakes = 0; A.define('box', { w: 10, h: 10, draw: () => { bakes++; } });
  const a = A.sprite('box', 50); assert.ok(a >= 0); assert.equal(A.lastExact, true);
  assert.equal(A.sprite('box', 51), a, 'same bucket'); assert.equal(bakes, 1);
  const b = A.sprite('box', 60); assert.equal(b, a, 'nearest stands in'); assert.equal(A.lastExact, false); assert.equal(A.queue.length, 1);
  A.pump(4, null); assert.equal(bakes, 2); assert.notEqual(A.sprite('box', 60), a);
  // fill both pages, then a new bake recycles the least recently used page
  A.frame = 1; for (let i = 0; i < 60; i++) A.bake('big' + i, 100, 100, () => {});
  assert.ok(A.pages.length <= 2);
  assert.ok(A.entries.some(e => !e.alive), 'some entries were evicted with their page');
  assert.equal(A.get('box|' + '|' + bucket(50)) >= 0 || A.entries[a].alive === false, true);
});

test('display list: pooled (no growth in steady state), stable sort by layer', () => {
  const L = new DisplayList(64);
  for (let f = 0; f < 50; f++) { L.clear(); for (let i = 0; i < 60; i++) L.push(i, i, 0, 1, 1, (i * 7) % 10, 1); }
  assert.equal(L.grows, 0); assert.equal(L.cap, 64);
  const idx = L.order(); let prevLayer = -1, prevI = -1;
  for (let o = 0; o < L.n; o++) { const i = idx[o]; if (L.layer[i] === prevLayer) assert.ok(i > prevI, 'submit order kept inside a layer'); else assert.ok(L.layer[i] > prevLayer); prevLayer = L.layer[i]; prevI = i; }
  L.clear(); for (let i = 0; i < 100; i++) L.push(0, 0, 0, 1, 1, 0, 1); assert.equal(L.grows, 1, 'grows only past the high-water mark');
});

test('view: one placement maths for both backends (parallax, zoom, design -> device px)', () => {
  const V = new View(); V.scale = 2; V.offX = 10; V.offY = 0; V.vw = 960; V.vh = 540; V.camX = 100; V.camY = 0; V.zoom = 1;
  const L = new DisplayList(4), m = new Float32Array(6);
  const i = L.push(0, 100, 0, 10, 10, 5, 1); V.matrix(L, i, m);
  assert.deepEqual([m[4], m[5]], [10 + 480 * 2, 270 * 2], 'the camera target sits at the centre');
  const j = L.push(0, 100, 0, 10, 10, 1, 0.5); V.matrix(L, j, m); assert.equal(m[4], 10 + (480 + 50) * 2, 'half parallax moves half as far');
  const k = L.push(0, 5, 7, 10, 10, 0, 0); V.matrix(L, k, m); assert.deepEqual([m[4], m[5]], [20, 14], 'par 0 = design units on screen');
  V.zoom = 2; V.matrix(L, i, m); assert.equal(m[0], 4, 'zoom scales world items');
});

test('governor: steps down after 1.5 s over budget, up only after 5 s under, tier only at a transition', () => {
  const G = new Governor({ tier: 'mid' });
  let t = 0; const feed = (ms, secs) => { const out = []; for (let i = 0; i < secs * 60; i++) { t += 16.7; const r = G.sample(ms, t); if (r) out.push(r); } return out; };
  assert.deepEqual(feed(14, 3), [], 'fine at 14 ms');
  const d = feed(25, 1.2); assert.deepEqual(d, [], 'not before 1.5 s');
  feed(25, 1); assert.equal(G.scale, 0.9, 'first rung: render scale');
  feed(25, 12); assert.ok(G.scale <= 0.6 + 1e-9); assert.equal(G.particleK, 0.5); assert.equal(G.lights, 0);
  assert.equal(G.tier, 'mid', 'tier waits for a transition'); assert.equal(G.pending, 'low');
  assert.equal(G.transition(), true); assert.equal(G.tier, 'low'); assert.equal(G.backend, 'paper');
  const H = new Governor({ tier: 'mid' }); H.scale = 0.7; t = 0;
  for (let i = 0; i < 60 * 4; i++) { t += 16.7; H.sample(8, t); } assert.equal(H.scale, 0.7, 'no step up before 5 s');
  for (let i = 0; i < 60 * 2; i++) { t += 16.7; H.sample(8, t); } assert.equal(H.scale, 0.8, 'one step up');
  for (let i = 0; i < 60 * 12; i++) { t += 16.7; H.sample(8, t); } assert.equal(H.scale, 0.8, 'at most once per scene');
  H.transition(); for (let i = 0; i < 60 * 6; i++) { t += 16.7; H.sample(8, t); } assert.equal(H.scale, 0.9, 'again after a transition');
});

test('governor: context loss drops to Paper at once; two losses in 60 s lock Paper for the session', () => {
  const G = new Governor({ tier: 'high' });
  G.contextLost(1000); assert.equal(G.backend, 'paper'); assert.equal(G.glLocked, false);
  G.contextRestored(); assert.equal(G.pending, 'high'); assert.equal(G.backend, 'paper', 'not before a transition'); G.transition(); assert.equal(G.backend, 'glaze');
  G.contextLost(30000); assert.equal(G.glLocked, true); G.contextRestored(); G.request('mid'); G.transition(); assert.equal(G.backend, 'paper');
  const H = new Governor({ tier: 'mid' }); H.contextLost(0); H.contextRestored(); H.transition(); H.contextLost(70000); assert.equal(H.glLocked, false, 'losses 70 s apart do not lock');
});

test('backend and tier choice', () => {
  assert.equal(pickBackend({ probe: { webgl2: true, software: false } }), 'glaze');
  assert.equal(pickBackend({ probe: { webgl2: true, software: true } }), 'paper', 'software GL -> Paper');
  assert.equal(pickBackend({ probe: null }), 'paper');
  assert.equal(pickBackend({ override: 'glaze', probe: null }), 'glaze');
  assert.equal(pickBackend({ graphics: 'simple', probe: { webgl2: true } }), 'paper');
  assert.equal(pickTier({ backend: 'glaze' }), 'mid'); assert.equal(pickTier({ backend: 'glaze', graphics: 'fancy' }), 'high'); assert.equal(pickTier({ backend: 'paper', override: 'high' }), 'low');
  assert.deepEqual(['low', 'mid', 'high'].map(t => TIER_SPEC[t].particles), [120, 300, 600]);
});

test('sky: keyframes in OKLab, night is the brand teal, sun sets and moon rises', () => {
  const day = sky(0), night = sky(1), gold = sky(0.42);
  assert.equal(skyAt(night, 0), NIGHT_SKY[0]); assert.equal(skyAt(night, 1), NIGHT_SKY[1]);
  assert.equal(skyAt(day, 0), SKY_KEYS[0][1].toUpperCase());
  assert.ok(day.sun.a === 1 && night.sun.a === 0 && night.moon.a === 1 && night.stars === 1 && day.stars === 0);
  assert.ok(gold.ambient[2] < gold.ambient[0], 'golden hour is warm');
  assert.ok(night.ambient[0] < 0.6 && night.ambient[2] > night.ambient[0], 'night ambient drops and turns cool (characters stay readable: lanterns add the warm side)');
});

test('fit: expand grows the view on the long side, letterbox centres', () => {
  const e = computeFit(1920, 1080, [960, 540], 'expand', 2); assert.deepEqual([e.k, e.vw, e.vh, e.pw, e.ph], [2, 960, 540, 3840, 2160]);
  const p = computeFit(390, 700, [960, 540], 'expand', 1); assert.equal(Math.round(p.vw), 960); assert.ok(p.vh > 1700, 'portrait sees more height');
  const l = computeFit(390, 700, [960, 540], 'letterbox', 1); assert.equal(l.vw, 960); assert.ok(l.offY > 200 && l.offX === 0);
});

test('particles: pooled, capped by tier, 80% fewer with reduced motion, all presets work', () => {
  const P = new Particles(1024, mulberry32(1));
  P.limit = 120; for (let i = 0; i < 50; i++) P.burst('confetti', 0, 0); assert.equal(P.n, 120);
  for (let i = 0; i < 400; i++) P.update(1 / 60, i / 60); assert.equal(P.n, 0, 'all expire');
  P.limit = 1000; P.reduced = true; assert.equal(P.burst('sparkle', 0, 0), 3, 'reduced: 14 -> 3');
  P.reduced = false; for (const n of PRESET_NAMES) assert.ok(P.burst(n, 0, 0) > 0, n);
  const look = new Float32Array(2); for (let i = 0; i < P.n; i++) { P.look(i, 0, look); assert.ok(look[0] >= 0 && look[0] <= 1); }
});

test('camera: follow with dead zone, bounds, shake decays, reduced motion means no shake or punch', () => {
  const C = new Camera(); const e = { x: 0, y: 0, vx: 0 }; C.follow(e);
  e.x = 50; for (let i = 0; i < 60; i++) C.update(1 / 60); assert.equal(Math.round(C.x), 0, 'inside the dead zone');
  e.x = 2000; e.vx = 300; for (let i = 0; i < 240; i++) C.update(1 / 60); assert.ok(C.x > 1700);
  C.bounds({ x: 0, y: -1000, w: 1500, h: 2000 }); assert.equal(C.x, 1500 - 480);
  C.shake(1); C.update(1 / 60); assert.ok(Math.abs(C.sx) + Math.abs(C.sy) > 0); for (let i = 0; i < 120; i++) C.update(1 / 60); assert.equal(C.trauma, 0);
  C.reduced = true; C.shake(1); C.punch(1.2); C.update(1 / 60); assert.equal(C.sx, 0); assert.equal(C.punchZ, 0);
});

test('LUT: 16³, day warms a little, night cools; flash limiter allows at most 3 a second', () => {
  const d = makeLut(0), n = makeLut(1); assert.equal(d.length, 16 * 16 * 16 * 4);
  const at = (lut, r, g, b) => { const i = ((b * 16 + g) * 16 + r) * 4; return [lut[i], lut[i + 1], lut[i + 2]]; };
  const gd = at(d, 8, 8, 8), gn = at(n, 8, 8, 8); assert.ok(gd[0] >= gd[2], 'day grey leans warm'); assert.ok(gn[2] >= gn[0], 'night grey leans cool');
  const F = new FlashLimiter(); assert.deepEqual([0, 100, 200, 300, 1250].map(t => F.allow(t)), [true, true, true, false, true]);
});

test('art grammar: every sticker is deterministic, inked, rimmed and masked', async () => {
  const { defineCoreArt } = await import('../../kit/src/art.js');
  const draw = name => { const log = []; const A = new Atlas({ doc: fakeDoc(log), pageSize: 512 }); defineCoreArt(A); A.sprite(name, 96); return log; };
  for (const name of ['spark', 'heart', 'oomba', 'lantern', 'cloud', 'pupil', 'oomba-lids']) {
    const a = JSON.stringify(draw(name)), b = JSON.stringify(draw(name));
    assert.equal(a, b, `${name} draws the same every time`);
    assert.match(a, /"(strokeStyle|fillStyle)","#141414"/, `${name} has Ink`);
    assert.match(a, /"#00FF00"/, `${name} marks its ink unlit in the mask`);
    if (!['cloud', 'pupil', 'oomba-lids'].includes(name)) assert.match(a, /"strokeStyle","#FFFDF2"/, `${name} has the Cream sticker rim`);
  }
  assert.doesNotMatch(JSON.stringify(draw('oomba')), /shadowBlur|filter/);
  assert.match(JSON.stringify(draw('oomba')), /"#FF0000"/, 'the spark antenna glows');
});

test('atlas: dedicated pages re-bake in place and freed slots are reused (a resizing window never grows the page list)', () => {
  const A = new Atlas({ doc: fakeDoc(), pageSize: 256, maxPages: 2 });
  const band = (w, h) => { const c = A.canvas(w, h); return c; };
  const id = A.dedicated('band|0', band(1500, 300)); A.setMask(id, band(1500, 300));
  const night = A.variant(id, 'night', true); assert.ok(night >= 0, 'the band has a night copy');
  const pages0 = A.pages.length;
  for (let i = 0; i < 30; i++) {   // 30 sizes: same entry, same page slot; its night copy is freed and made again
    assert.equal(A.replace(id, band(1500 + i * 13, 300 + i), band(1500 + i * 13, 300 + i)), id);
    A.variant(id, 'night', true);
  }
  assert.equal(A.pages.length, pages0, 'no page per size');
  assert.equal(A.entries[id].w, 1500 + 29 * 13);
  assert.equal(A.livePages, pages0);
  const f0 = A.freed; A.freePage(A.entries[id].page); assert.equal(A.freed, f0 + 2, 'freeing a page frees its variants too');
  const again = A.dedicated('band|0', band(100, 100)); assert.ok(again >= 0); assert.ok(A.pages.length <= pages0, 'the freed slot is reused');
});

test('atlas: night, white and moon variants are made by compositing only (no pixel readback), queued and time-sliced', () => {
  const log = []; const A = new Atlas({ doc: fakeDoc(log), pageSize: 512 });
  A.define('blob', { w: 10, h: 10, draw: (ctx, k) => { ctx.fillRect(0, 0, 10, 10); const m = k.mask(); m.fillRect(0, 0, 5, 5); } });
  const id = A.sprite('blob', 40);
  assert.equal(A.variant(id, 'night'), -1, 'queued: draw the base meanwhile');
  assert.equal(A.variant(id, 'night'), -1, 'queued once'); assert.equal(A.queue.length, 1);
  A.pump(4, null); const n = A.variant(id, 'night'); assert.ok(n >= 0, 'made by pump()');
  assert.ok(A.variant(id, 'moon', true) >= 0 && A.variant(id, 'white', true) >= 0);
  assert.ok(!log.some(l => l[0] === 'getImageData' || l[0] === 'putImageData'), 'never reads pixels back');
  assert.ok(log.some(l => l[0] === 'set' && l[1] === 'globalCompositeOperation' && l[2] === 'destination-in'), 'clips with destination-in');
});

test('atlas: each page tracks the rectangle baked since the last upload (Glaze copies only that)', () => {
  const A = new Atlas({ doc: fakeDoc(), pageSize: 512 });
  A.define('a', { w: 10, h: 10, draw: () => {} });
  const id = A.sprite('a', 40), p = A.pages[A.entries[id].page];
  assert.ok(p.full, 'a new page uploads whole once'); p.full = false; p.dr = null;
  const id2 = A.bake('b', 30, 20, () => {}), e2 = A.entries[id2]; assert.equal(e2.page, p.id);
  assert.deepEqual(p.dr, [e2.x - 1, e2.y - 1, e2.x + e2.w + 1, e2.y + e2.h + 1], 'the dirty rectangle is the new sprite');
  A.evictPage(p); assert.ok(p.full, 'a recycled page uploads whole');
});

test('governor: on Paper a 1x screen skips the pixel-ratio rung, and Paper has a render-scale rung of its own', () => {
  const G = new Governor({ tier: 'low' }); G.devDpr = 1;
  assert.equal(G.stepDown(), true); assert.deepEqual(G.log, ['particles/bloom'], 'no useless "dpr 1" step at 1x');
  assert.equal(G.stepDown(), true); assert.equal(G.scale, 0.85, 'then a smaller backing store');
  assert.equal(G.stepDown(), true); assert.equal(G.scale, 0.7);
  assert.equal(G.stepDown(), false, 'the bottom rung');
  const H = new Governor({ tier: 'low' }); H.devDpr = 2; H.stepDown(); assert.deepEqual(H.log, ['dpr 1'], 'a 2x screen lowers the ratio first');
  G.upThisScene = false; assert.equal(G.stepUp(), true);
});

test('night: fireflies are few (12-20), small and green-yellow; the cast takes a quarter of the night grade', async () => {
  assert.deepEqual(['low', 'mid', 'high'].map(t => TIER_SPEC[t].fireflies), [12, 16, 20]);
  const { PRESETS } = await import('../../kit/src/particles.js');
  const ff = PRESETS.fireflies; assert.ok(ff.size[1] <= 12, 'small'); assert.ok(ff.colors.every(c => c[1] > c[0] && c[1] > c[2]), 'green-yellow, never spark yellow');
  const { MOON_GRADE } = await import('../../kit/src/atlas.js'); assert.ok(MOON_GRADE > 0.15 && MOON_GRADE <= 0.3);
});
