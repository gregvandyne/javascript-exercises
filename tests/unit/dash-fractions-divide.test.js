// Fractions, dividing as measuring (docs/decisions.md "Classroom dashboards: fractions, dividing as measuring";
// public/js/dash-math.js, server/services/dash-tools.js): the answer drawn as wholes, Divide measured with copies of the
// second fraction, a typed answer checked, and the new state (fit, step; the answer hidden at first) cleaned on the server.
import test from 'node:test';
import assert from 'node:assert/strict';
const M = await import('../../public/js/dash-math.js');
const DT = await import('../../server/services/dash-tools.js');
const f = (n, d) => ({ n, d });

test('5/10 ÷ 2/9 = 9/4 = 2 1/4: two copies fit and a quarter of a third', () => {
  const r = M.operate('div', f(5, 10), f(2, 9));
  assert.deepEqual([r.raw, r.simple, r.mixed, r.more], [f(45, 20), f(9, 4), '2 1/4', true]);
  assert.deepEqual(M.mixedParts(r.simple), { sign: 1, whole: 2, n: 1, d: 4 });
  const m = M.measure(r.a, r.b);
  assert.deepEqual([m.q, m.full, m.rest, m.copies, m.L], [f(9, 4), 2, f(1, 4), 3, 90]);
  assert.equal(m.per, 0, '90 pieces a whole are too small to draw: the copies are drawn by length');
  assert.equal(M.measure(f(3, 4), f(1, 4)).per, 4, 'a common bottom number that can be drawn');
  assert.deepEqual(M.measure(f(3, 4), f(1, 4)), { q: f(3, 1), full: 3, rest: f(0, 1), copies: 3, L: 4, per: 4 }, 'exactly three: no part copy');
  assert.deepEqual(M.measure(f(0, 5), f(1, 3)), { q: f(0, 1), full: 0, rest: f(0, 1), copies: 0, L: 15, per: 15 }, 'nothing measured: 0 fit');
  assert.deepEqual(M.measure(f(12, 1), f(1, 12)).copies, 144, 'the most copies: 12 ÷ 1/12');
});

test('dividing by zero is refused', () => {
  assert.equal(M.measure(f(3, 4), f(0, 5)), null);
  const r = M.operate('div', f(3, 4), f(0, 5));
  assert.ok(r.guarded); assert.deepEqual(r.b, f(1, 5));
  assert.deepEqual(DT.cleanToolState('fractions', { mode: 'div', b: { n: 0, d: 9 } }).b, f(1, 9));
});

test('an answer past one whole is drawn as that many wholes; 0 is one empty whole', () => {
  assert.deepEqual(M.splitWholes(f(9, 4)), [f(4, 4), f(4, 4), f(1, 4)]);
  assert.deepEqual(M.splitWholes(f(18, 8)), [f(4, 4), f(4, 4), f(1, 4)], 'in lowest terms: quarters');
  assert.deepEqual(M.splitWholes(f(6, 3)), [f(1, 1), f(1, 1)]);
  assert.deepEqual(M.splitWholes(f(-7, 6)), [f(6, 6), f(1, 6)], 'the size of a negative answer');
  assert.deepEqual(M.splitWholes(f(3, 5)), [f(3, 5)]);
  assert.deepEqual(M.splitWholes(f(0, 5)), [f(0, 1)]);
  // every operation: the wholes add up to the answer, each no more than one whole
  for (const op of Object.keys(M.OPS)) for (let i = 0; i < 300; i++) {
    const r = M.operate(op, M.clampOperand(f(i % 13, 1 + (i % 12))), M.clampOperand(f((i * 7) % 13, 1 + ((i * 5) % 12))));
    const w = M.splitWholes(r.simple), sum = w.reduce((s, x) => s + x.n / x.d, 0);
    assert.ok(Math.abs(sum - Math.abs(r.simple.n / r.simple.d)) < 1e-9, `${op} ${i}`);
    assert.equal(w.length, Math.max(1, Math.ceil(Math.abs(r.simple.n) / r.simple.d)));
    assert.ok(w.every(x => x.n <= x.d));
  }
});

test('a typed answer: right, the same amount not simplified, not yet, or not a fraction', () => {
  const ans = f(9, 4);
  for (const t of ['9/4', '2 1/4', ' 2  1 / 4 ', '2¼', '9 / 4']) assert.equal(M.checkAnswer(t, ans), 'right', t);
  for (const t of ['18/8', '45/20', '2 2/8', '2 5/20']) assert.equal(M.checkAnswer(t, ans), 'simplify', t);
  for (const t of ['3/4', '2', '1 1/4', '4/9', '-9/4']) assert.equal(M.checkAnswer(t, ans), 'no', t);
  for (const t of ['', 'two', '9/0', '2 5/4', '2 3', '1/2/3', '2.25']) assert.equal(M.checkAnswer(t, ans), 'unread', t);
  assert.equal(M.checkAnswer('2', f(2, 1)), 'right'); assert.equal(M.checkAnswer('8/4', f(2, 1)), 'simplify');
  assert.equal(M.checkAnswer('−1/6', f(-1, 6)), 'right'); assert.equal(M.checkAnswer('0', f(0, 1)), 'right');
  assert.deepEqual(M.parseFraction('2 1/4'), { n: 9, d: 4, mixed: true });
  assert.deepEqual(M.parseFraction('-3/4'), { n: -3, d: 4, mixed: false });
});

test('the state: the answer starts hidden, fit and step are cleaned, old states load as they were', () => {
  const c = DT.cleanToolState;
  assert.equal(c('fractions', {}).hide, true, 'hidden by default: students work it out first');
  assert.equal(c('fractions', { hide: false }).hide, false, 'a state saved with the answer shown keeps it shown');
  const old = { shape: 'circle', bars: [{ n: 2, d: 3 }, { n: 6, d: 6 }], same: true, hide: false };
  assert.deepEqual(c('fractions', old), old, 'an old Compare state comes back exactly as it was');
  const oldDiv = { ...old, mode: 'div', a: f(5, 10), b: f(2, 9) };
  assert.deepEqual(c('fractions', oldDiv), oldDiv, 'an old Divide state has no fit or step');
  const s = c('fractions', { ...oldDiv, fit: 2, step: 3 });
  assert.deepEqual([s.fit, s.step], [2, 3]);
  assert.deepEqual(c('fractions', s), s, 'cleaning is stable');
  assert.equal(c('fractions', { ...oldDiv, fit: 99 }).fit, 3, 'no more copies than fit (2 and a part)');
  assert.equal(c('fractions', { ...oldDiv, fit: -4, step: 'x' }).fit, undefined);
  assert.equal(c('fractions', { ...oldDiv, step: 9 }).step, 4);
  assert.equal(c('fractions', { ...oldDiv, a: f(0, 3), fit: 2 }).fit, undefined, 'nothing to measure');
  assert.equal(c('fractions', { ...old, mode: 'add', fit: 2, step: 1 }).fit, undefined, 'copies are laid only when dividing');
  assert.equal(c('fractions', { ...old, mode: 'add', step: 1 }).step, 1);
  assert.equal(c('fractions', { ...old, step: 2 }).step, undefined, 'Compare has no steps');
  assert.equal(c('fractions', { ...oldDiv, b: f(0, 9), fit: 5 }).fit, 5, 'never by zero: 5/10 ÷ 1/9 has room for 5');
});

test('words: every new string in all 13 languages, one-line instructions and the short help', async () => {
  const fs = await import('node:fs');
  const loc = c => JSON.parse(fs.readFileSync(`server/i18n/locales/${c}.json`, 'utf8'));
  const src = fs.readFileSync('server/services/dash.js', 'utf8');
  const en = loc('en').dash.w.fractions, codes = fs.readdirSync('server/i18n/locales').map(x => x.replace('.json', ''));
  assert.equal(codes.length, 13);
  const keys = ['show', 'yourAnswer', 'check', 'checkRight', 'checkSimplify', 'checkNo', 'checkUnread', 'fitOne', 'again', 'fitSoFar', 'fitPart', 'fitAll',
    'stepNext', 'stepBack', 'stepClear', 'stepCleared', 'stepHide', 'stepCommon', 'stepRename', 'stepAddTops', 'stepSubTops', 'stepGrid', 'stepShade', 'stepOverlap', 'stepKeep', 'stepChange', 'stepFlip', 'stepTimes'];
  for (const k of keys) assert.match(src, new RegExp(`TOOL_WORDS\\.fractions\\.push\\([^)]*'${k}'`), `${k} reaches the browser`);
  const words = s => s.split(/\s+/).filter(x => /[\p{L}\p{N}]/u.test(x)).length;
  for (const code of codes.filter(c => c !== 'en-GB')) {   // en-GB keeps only its own spellings; the rest is en
    const w = loc(code).dash.w.fractions;
    for (const k of keys) {
      assert.ok(w[k], `${code} ${k}`);
      assert.deepEqual((w[k].match(/\{\w+\}/g) || []).sort(), (en[k].match(/\{\w+\}/g) || []).sort(), `${code} ${k}: the same {places}`);
    }
    for (const k of ['howto', 'howtoOp', 'howtoMul', 'howtoDiv']) assert.ok(!/\n/.test(w[k]) && [...w[k]].length <= 72, `${code} ${k}: ${w[k]}`);
    const pts = w.helpUse.split('\n');
    assert.ok(pts.length <= 3 && !/\n/.test(w.helpIdeas), code);
    for (const t of [...pts, w.helpIdeas]) assert.ok(t.trim() && [...t].length <= 90, `${code}: ${t}`);
    if (code === 'en') { for (const t of pts) assert.ok(words(t) <= 12, t); assert.ok(words(w.helpUse) + words(w.helpIdeas) <= 50); }
    assert.doesNotMatch(w.tooSmall, /\{n\}/, `${code}: no "90 tiny pieces"`);
  }
});
