// Picture-vs-words audit for Number Quest course content (Greg, 2026-11-05: "check this throughout
// the whole course"). Every deck visual is rendered by visualSvg() as a pure function of its spec,
// so asserting the spec against the numbers its own label/slide text state IS asserting the picture.
// Rules: every explicit "a op b = c" claim anywhere in deck text/labels/tiles and set items must
// evaluate true; places columns must sum to the stated number; number-line points/marks/hops must
// sit where their labels say; bar parts must be proportional to their stated values; arrays must
// match their stated rows/cols/total; fraction rows must shade exactly the stated fraction.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const COURSE = path.join(ROOT, 'seed-lessons', 'number-quest', 'course', 'explorer');
const SETS = path.join(ROOT, 'seed-lessons', 'number-quest', 'sets');
const decks = fs.readdirSync(COURSE).filter(f => f.endsWith('.json')).sort()
  .map(f => ({ file: f, deck: JSON.parse(fs.readFileSync(path.join(COURSE, f), 'utf8')) }));

const rat = s => { const m = /^(-?\d+)\s*\/\s*(\d+)$/.exec(s.trim()); if (m) return Number(m[1]) / Number(m[2]); const n = Number(s.replace(/,/g, '')); return Number.isNaN(n) ? null : n; };
const NUM = String.raw`-?\d[\d,]*(?:\.\d+)?(?:\s*\/\s*\d+)?`;
const EQ = new RegExp(`(${NUM}(?:\\s*[+\\-−x×/÷]\\s*${NUM})+)\\s*=\\s*(${NUM})`, 'g');
function evalSide(side) {
  // Tokenize with fraction bars binding tighter than the operators: "2/8" is one operand.
  const toks = side.replace(/−/g, '-').replace(/÷/g, '/').match(/\d[\d,]*(?:\.\d+)?(?:\s*\/\s*\d+)?|[+\-x×/]/g);
  if (!toks) return null;
  let acc = null, op = '+';
  for (const tk of toks) {
    if (/^[+\-x×/]$/.test(tk)) { op = tk; continue; }
    const v = rat(tk); if (v == null) return null;
    if (acc == null) acc = op === '-' ? -v : v;
    else if (op === '+') acc += v; else if (op === '-') acc -= v;
    else if (op === 'x' || op === '×') acc *= v; else acc /= v;
  }
  return acc;
}
function checkEquations(text, where, failures) {
  for (const m of String(text).matchAll(EQ)) {
    const lhs = evalSide(m[1]), rhs = rat(m[2]);
    if (lhs == null || rhs == null) continue;
    if (Math.abs(lhs - rhs) > 1e-9) failures.push(`${where}: "${m[0]}" is false (lhs=${lhs})`);
  }
}

test('every stated equation in decks and sets is true', () => {
  const failures = [];
  for (const { file, deck } of decks) deck.slides.forEach((s, i) => {
    const where = `${file} slide ${i + 1}`;
    for (const f of ['kicker', 'title', 'text', 'cue', 'say']) if (s[f]) checkEquations(s[f], where, failures);
    if (s.visual) {
      checkEquations(s.visual.label || '', `${where} visual label`, failures);
      for (const v of s.visual.values || []) checkEquations(v, `${where} tile`, failures);
      for (const r of Array.isArray(s.visual.rows) ? s.visual.rows : []) { checkEquations(r.label || '', `${where} row`, failures); for (const p of r.parts || []) checkEquations(p.label || '', `${where} part`, failures); }
    }
  });
  for (const f of fs.readdirSync(SETS).filter(x => x.endsWith('.json'))) {
    const set = JSON.parse(fs.readFileSync(path.join(SETS, f), 'utf8'));
    for (const it of set.items) { checkEquations(it.q, `${f} ${it.id}`, failures); for (const c of it.choices || []) checkEquations(c, `${f} ${it.id} choice`, failures); }
  }
  assert.deepEqual(failures, []);
});

const PLACE_VALUE = { ones: 1, tens: 10, hundreds: 100, thousands: 1000 };
test('places visuals: columns sum to the stated number, values match digits', () => {
  for (const { file, deck } of decks) deck.slides.forEach((s, i) => {
    const v = s.visual; if (!v || v.type !== 'places') return;
    const where = `${file} slide ${i + 1}`;
    const stated = rat(v.label.split(/[\s:]/)[0]);
    const sum = v.cols.reduce((a, c) => a + Number(c.d) * PLACE_VALUE[c.place], 0);
    assert.equal(sum, stated, `${where}: columns sum ${sum} != stated ${stated}`);
    for (const c of v.cols) assert.equal(rat(c.value), Number(c.d) * PLACE_VALUE[c.place], `${where}: col ${c.place} value`);
    const phrases = [...v.label.matchAll(/(\d+) (thousands|hundreds|tens|ones)/g)].map(m => [Number(m[1]), m[2]]);
    assert.deepEqual(phrases, v.cols.map(c => [Number(c.d), c.place]), `${where}: label counts vs cols`);
  });
});

test('number lines: points, marks and hops sit where their labels say', () => {
  for (const { file, deck } of decks) deck.slides.forEach((s, i) => {
    const v = s.visual; if (!v || v.type !== 'numberline') return;
    const where = `${file} slide ${i + 1}`;
    for (const m of v.marks || []) { assert.ok(m.at >= v.min && m.at <= v.max, `${where}: mark out of range`); assert.equal(rat(m.label), m.at, `${where}: mark label ${m.label} at ${m.at}`); }
    if (v.point) { assert.ok(v.point.at >= v.min && v.point.at <= v.max, `${where}: point out of range`); assert.equal(rat(v.point.label), v.point.at, `${where}: point label`); }
    const hops = v.hops || [];
    hops.forEach((h, j) => {
      assert.ok(h.from >= v.min && h.to <= v.max, `${where}: hop out of range`);
      if (j > 0) assert.equal(h.from, hops[j - 1].to, `${where}: hops must chain`);
      const lead = /^(\d+)/.exec(h.label || ''); if (lead) assert.equal(Number(lead[1]), Math.abs(h.to - h.from), `${where}: hop label ${h.label} vs length`);
    });
  });
});

const partValue = label => { const m = /(\d[\d,]*)\s*(hundreds?|tens?|ones?)?/.exec(label || ''); if (!m) return null; const u = (m[2] || '').replace(/s$/, ''); return Number(m[1].replace(/,/g, '')) * (u === 'hundred' ? 100 : u === 'ten' ? 10 : 1); };
test('bar models: part widths are proportional to their stated values', () => {
  for (const { file, deck } of decks) deck.slides.forEach((s, i) => {
    const v = s.visual; if (!v || v.type !== 'bars') return;
    v.rows.forEach((r, ri) => {
      const where = `${file} slide ${i + 1} row ${ri + 1}`;
      const sumW = r.parts.reduce((a, p) => a + p.w, 0);
      const known = r.parts.map(p => ({ w: p.w, val: p.unknown ? null : partValue(p.label) })).filter(p => p.val != null);
      // A row may draw a single part to scale against the whole (its widths then sum to less than
      // 1 by design); when a total is stated anywhere, every known part must match value/total.
      const totalM = /^(\d[\d,]*)/.exec(r.label || '') || /(?:whole bar is|whole of|needs|makes)\s*(\d[\d,]*)/.exec(r.label || '')
        || /(?:whole bar is|whole of|needs|makes)\s*(\d[\d,]*)/.exec(v.label || '') || /(\d[\d,]*)\s*points needed/.exec(v.label || '');
      if (totalM && known.length) { const T = Number(totalM[1].replace(/,/g, '')); for (const k of known) assert.ok(Math.abs(k.w - k.val / T) < 0.02, `${where}: w ${k.w} vs ${k.val}/${T}`); }
      else {
        assert.ok(Math.abs(sumW - 1) < 0.02, `${where}: widths sum ${sumW}`);
        if (known.length >= 2) for (let a = 0; a < known.length; a++) for (let b = a + 1; b < known.length; b++)
          assert.ok(Math.abs(known[a].w / known[b].w - known[a].val / known[b].val) < 0.03 * (known[a].val / known[b].val) + 0.02, `${where}: parts ${known[a].val} and ${known[b].val} not proportional`);
      }
    });
  });
});

test('arrays: rows, cols, extras and totals match the words', () => {
  for (const { file, deck } of decks) deck.slides.forEach((s, i) => {
    const v = s.visual; if (!v || v.type !== 'array') return;
    const where = `${file} slide ${i + 1}`;
    const rc = /(\d+) rows of (\d+)/.exec(v.label); if (rc) { assert.equal(Number(rc[1]), v.rows, where); assert.equal(Number(rc[2]), v.cols, where); }
    const isN = / is (\d+)\b/.exec(v.label); if (isN) assert.equal(v.rows * v.cols, Number(isN[1]), `${where}: product`);
    const lead = /^(\d+) /.exec(v.label); if (lead && v.extra) assert.equal(v.rows * v.cols + v.extra, Number(lead[1]), `${where}: total with extra`);
    if (v.extraLabel) { const e = /^(\d+)/.exec(v.extraLabel); if (e) assert.equal(Number(e[1]), v.extra, `${where}: extra label`); }
  });
});

test('fractions: each row shades exactly the fraction its label states', () => {
  for (const { file, deck } of decks) deck.slides.forEach((s, i) => {
    const v = s.visual; if (!v || v.type !== 'fraction') return;
    const where = `${file} slide ${i + 1}`;
    for (const r of v.rows) {
      assert.ok(r.shaded >= 0 && r.shaded <= r.cuts, `${where}: shaded out of range`);
      const eq = /=\s*(\d+)\s*\/\s*(\d+)/.exec(r.label || '');
      const lead = /^(\d+)\s*\/\s*(\d+)/.exec(r.label || '');
      if (eq) { assert.equal(r.cuts, Number(eq[2]), `${where}: "${r.label}" cuts`); assert.equal(r.shaded / r.cuts, Number(eq[1]) / Number(eq[2]), `${where}: "${r.label}" shaded`); }
      else if (lead) { assert.equal(r.shaded, Number(lead[1]), `${where}: "${r.label}" shaded`); assert.equal(r.cuts, Number(lead[2]), `${where}: "${r.label}" cuts`); }
    }
    if (/same share|exactly the same/.test(v.label)) { const vals = v.rows.map(r => r.shaded / r.cuts); assert.ok(vals.every(x => Math.abs(x - vals[0]) < 1e-9), `${where}: rows claimed equal differ`); }
    const last = v.rows[v.rows.length - 1];
    if (v.rows.length >= 2 && last && /\+/.test(last.label || '') && !/=/.test(last.label || '') && v.rows.every(r => r.cuts === last.cuts))
      assert.equal(last.shaded, v.rows.slice(0, -1).reduce((a, r) => a + r.shaded, 0), `${where}: addition row sum`);
  });
});

test('tiles: bad-tile index breaks the pattern, sequences and sharing strips add up', () => {
  for (const { file, deck } of decks) deck.slides.forEach((s, i) => {
    const v = s.visual; if (!v || v.type !== 'tiles') return;
    const where = `${file} slide ${i + 1}`;
    const nums = (v.values || []).map(x => (/^-?\d+$/.test(x) ? Number(x) : null));
    if (v.bad != null) {
      assert.ok(nums[v.bad] != null, `${where}: bad tile not numeric`);
      // The bad tile REPLACED the right one: the others must fit one arithmetic pattern at their
      // own positions, and the bad tile must not fit it.
      const good = nums.map((n, j) => [n, j]).filter(([, j]) => j !== v.bad);
      const d = (good[1][0] - good[0][0]) / (good[1][1] - good[0][1]);
      const a = good[0][0] - d * good[0][1];
      assert.ok(good.every(([n, j]) => n === a + d * j), `${where}: tiles around the bad one form no clean pattern`);
      assert.notEqual(nums[v.bad], a + d * v.bad, `${where}: the "bad" tile actually fits the pattern`);
    }
    if (v.bad == null && nums.length >= 4 && nums.every(n => n != null)) { const d = nums[1] - nums[0]; assert.ok(nums.every((n, j) => n === nums[0] + j * d), `${where}: numeric tiles not an arithmetic pattern`); }
    const strip = (v.values || []).map(x => /^(\d+) /.exec(x)).map(m => m && Number(m[1]));
    if (strip.length === 4 && strip.every(n => n != null) && /each/.test(v.values[2]) && /left/.test(v.values[3]))
      assert.equal(strip[1] * strip[2] + strip[3], strip[0], `${where}: sharing strip ${strip}`);
  });
});
