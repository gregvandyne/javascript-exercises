// Classroom dashboards: tooltips never cut off, and pattern blocks dragged from the palette (docs/decisions.md
// "Classroom dashboards: tooltips never cut off"). The tooltip's placement (public/js/dash-tip.js, pure), the rule that a
// button with a tooltip has no native title, tap versus drag on the pattern block palette and where a dragged block lands
// (public/js/dash-math4.js, pure). The browser side is checked by `npm run dash:fit`.
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
const TIP = await import('../../public/js/dash-tip.js');
const G = await import('../../public/js/dash-math4.js');

const inside = (p, w, h, vw, vh, m = 8) => p.left >= m && p.top >= m && p.left + w <= vw - m && p.top + h <= vh - m;
const overlaps = (p, w, h, r) => p.left < r.right && p.left + w > r.left && p.top < r.bottom && p.top + h > r.top;

test('tooltip: above and centred on its button when there is room', () => {
  const r = { left: 500, top: 400, right: 544, bottom: 444 };
  const p = TIP.placeTip(r, 100, 24, 1600, 900);
  assert.equal(p.side, 'top');
  assert.equal(p.left, 522 - 50);
  assert.equal(p.top, 400 - 6 - 24);
});

test('tooltip: never outside the screen, never over its button when it fits', () => {
  const VW = [[1600, 900], [1024, 768], [390, 844]];
  for (const [vw, vh] of VW) for (const x of [0, 2, 10, vw / 2, vw - 50, vw - 44]) for (const y of [0, 3, 20, vh / 2, vh - 60, vh - 44]) for (const w of [60, 160, 260]) {
    const r = { left: x, top: y, right: x + 44, bottom: y + 44 };
    const p = TIP.placeTip(r, w, 24, vw, vh);
    assert.ok(inside(p, w, 24, vw, vh), `${vw}x${vh} button at ${x},${y}: tooltip at ${p.left},${p.top}`);
    assert.ok(!overlaps(p, w, 24, r), `${vw}x${vh} button at ${x},${y}: tooltip covers it`);
  }
  // At the very top (the organizer's ✕ at the top of its box, under the top of the screen) it goes below.
  assert.equal(TIP.placeTip({ left: 100, top: 2, right: 132, bottom: 34 }, 120, 24, 1600, 900).side, 'bottom');
  // At the start edge (the shape board's colour rail) it is shifted in, not cut ("ew band").
  assert.equal(TIP.placeTip({ left: 0, top: 300, right: 44, bottom: 344 }, 100, 24, 1600, 900).left, 8);
  // Wider than the screen: from the margin (CSS caps its width to the screen).
  assert.equal(TIP.placeTip({ left: 100, top: 300, right: 144, bottom: 344 }, 500, 24, 390, 844).left, 8);
});

test('tooltip: tip() names a button and takes away its native title', () => {
  const attrs = { title: 'Delete band', 'aria-label': 'Delete band' };
  const el = { dataset: {}, removeAttribute: k => { delete attrs[k]; } };
  assert.equal(TIP.tip(el, 'Delete band'), el);
  assert.equal(el.dataset.tip, 'Delete band');
  assert.equal(attrs.title, undefined);
  assert.equal(attrs['aria-label'], 'Delete band');
  TIP.tip(el, '');
  assert.equal(el.dataset.tip, undefined);
});

test('tooltip: one layer for the page, never a pseudo-element inside a tool; no native title where a tooltip is set', () => {
  const css = fs.readFileSync('public/css/dash.css', 'utf8');
  assert.doesNotMatch(css, /attr\(data-tip\)/, 'the tooltip is not a ::after inside the button (a tool edge clips it)');
  assert.match(css, /\.dash-tip\{position:fixed/);
  const src = fs.readFileSync('public/js/dash-tip.js', 'utf8');
  assert.match(src, /setAttribute\('role', 'tooltip'\)/);
  assert.match(src, /aria-describedby/);
  assert.match(src, /'scroll'/); assert.match(src, /'resize'/); assert.match(src, /'blur'/);
  assert.match(src, /pointerType === 'touch'/, 'touch: only on a long press');
  for (const f of ['public/js/dash-tools.js', 'public/js/dash-tools4.js', 'public/js/dash-shapeboard.js']) {
    const s = fs.readFileSync(f, 'utf8');
    assert.doesNotMatch(s, /dataset\.tip\s*=/, `${f}: tooltips are set with tip(), which drops the native title`);
    for (const line of s.split('\n')) if (/\btip\(/.test(line)) assert.doesNotMatch(line, /\.title\s*=/, `${f}: a title next to a tooltip: ${line.trim().slice(0, 80)}`);
  }
});

test('pattern blocks: a press on the palette is a tap until it moves more than a few px', () => {
  assert.equal(G.PALETTE_SLOP, 8);
  assert.equal(G.paletteDrag(10, 10, 10, 10), false);
  assert.equal(G.paletteDrag(10, 10, 15, 15), false);   // a wobbly finger is still a tap
  assert.equal(G.paletteDrag(10, 10, 18, 10), false);
  assert.equal(G.paletteDrag(10, 10, 18.5, 10), true);
  assert.equal(G.paletteDrag(10, 10, 4, 3), true);
  assert.equal(G.paletteDrag(0, 0, 3, 3, 4), true);
});

test('pattern blocks: a block dragged from the palette lands on the grid where it is let go, whole on the board', () => {
  const R3 = Math.sqrt(3) / 2;
  for (const k of G.BLOCK_KINDS) for (let px = 0; px <= 15; px += 0.7) for (let py = 0; py <= 10 * R3; py += 0.6) {
    const b = G.dropBlock(k, px, py);
    assert.ok(b, `${k} at ${px},${py}`);
    assert.equal(b.k, k); assert.equal(b.r, 0);
    assert.equal((b.x + b.y) % 2, 0, 'on the triangle grid');
    for (const [x, y] of G.blockPoints(b)) assert.ok(x >= -1e-9 && x <= 15 + 1e-9 && y >= -1e-9 && y <= 10 * R3 + 1e-9, `${k} dropped at ${px},${py} is off the board`);
  }
  // Its middle lands where it is let go (to the nearest grid point).
  const b = G.dropBlock('tri', 7.5, 4);
  const pts = G.blockPoints(b), cx = pts.reduce((a, p) => a + p[0], 0) / 3, cy = pts.reduce((a, p) => a + p[1], 0) / 3;
  assert.ok(Math.hypot(cx - 7.5, cy - 4) < 1, `${cx},${cy}`);
  // Two triangles let go side by side share an edge (they snap together).
  const t1 = G.dropBlock('tri', 5.5, 4), t2 = G.dropBlock('tri', 6.5, 4);
  const key = p => p.map(v => v.toFixed(6)).join(',');
  const shared = G.blockPoints(t1).map(key).filter(p => G.blockPoints(t2).map(key).includes(p));
  assert.ok(shared.length >= 1, 'neighbours meet on the grid');
  // Off the board (or an unknown kind): cancelled.
  assert.equal(G.dropBlock('hex', -0.1, 2), null);
  assert.equal(G.dropBlock('hex', 3, 9), null);
  assert.equal(G.dropBlock('hex', 15.1, 2), null);
  assert.equal(G.dropBlock('star', 3, 3), null);
});

test('pattern blocks: the palette can be dragged by mouse, touch and pen, and a tap still adds', () => {
  const src = fs.readFileSync('public/js/dash-tools4.js', 'utf8');
  const pat = src.slice(src.indexOf('function pattern('), src.indexOf('// ===', src.indexOf('function pattern(')));
  assert.match(pat, /addEventListener\('pointerdown', e => paletteDown\(e, k, b\)\)/);
  assert.match(pat, /G\.paletteDrag\(/);
  assert.match(pat, /G\.dropBlock\(/);
  assert.match(pat, /addEventListener\('click', \(\) => \{ if \(pal && pal\.moved\) return; add\(k\); \}\)/, 'a click after a drag adds nothing; a tap or Enter adds');
  assert.match(pat, /'Escape'/, 'Escape cancels a drag');
  assert.match(pat, /pointercancel/);
  const css = fs.readFileSync('public/css/dash.css', 'utf8');
  assert.match(css, /\.dt-pbtn\{touch-action:none/, 'no page scroll while a block is dragged from the palette');
  assert.match(css, /\.dt svg\.dt-pboard\{[^}]*touch-action:none/);
});
