// Classroom dashboards: bar models (a mode of Multiply and divide) and number rods (a tool of its own)
// (docs/decisions.md "Bar models and number rods"): the state each keeps and how the server cleans it, starting states
// that leave older layouts as they were, the maths (problems, checking sentences, rods snapping into trains, equations),
// the questions, the words in every language, the short help, the library search and the renderers' safety.
import fs from 'node:fs';
import os from 'node:os';
process.env.BRB_DB = ':memory:'; process.env.BRB_SILENT = '1'; process.env.LOG_REQUESTS = '0';
process.env.BRB_DATA_DIR = fs.mkdtempSync(os.tmpdir() + '/brb-dashbars-');
import test from 'node:test';
import assert from 'node:assert/strict';
const D = await import('../../server/services/dash.js');
const DT = await import('../../server/services/dash-tools.js');
const B = await import('../../public/js/dash-math5.js');
const { questionFor } = await import('../../public/js/dash-ask.js');
const { tFor } = await import('../../server/i18n/index.js');

const LOCALES = ['en', 'en-GB', 'ar', 'de', 'es', 'fr', 'he', 'it', 'ja', 'nl', 'pt', 'ru', 'zh-Hant'];
const OTHERS = LOCALES.filter(c => !/^en/.test(c));
const loc = code => JSON.parse(fs.readFileSync(`server/i18n/locales/${code}.json`, 'utf8'));
const seeded = (n = 1) => () => { n = (n * 16807) % 2147483647; return (n - 1) / 2147483646; };

test('where they live: bar models a mode of Multiply and divide, number rods a maths tool in Teaching tools', () => {
  assert.deepEqual(DT.TOOL_MODES.area, ['area', 'times', 'bars']);
  assert.equal(DT.MODE_HOME.bars, undefined, 'bar models never were a tool of their own: not a retired type');
  assert.equal(D.widgetType('bars'), null);
  const rods = D.widgetType('rods');
  assert.equal(rods.group, 'teach'); assert.equal(rods.who, 'both'); assert.equal(rods.send, true); assert.equal(rods.pin, false);
  assert.ok(rods.min[0] >= 6 && rods.min[1] >= 8);
  assert.deepEqual([D.widgetType('area').size, D.widgetType('area').min], [[7, 8], [6, 8]], 'room for a third mode on the switch');
  for (const id of ['bars', 'rods']) assert.ok(D.MATH_TOOLS.includes(id), id);
  assert.deepEqual(D.PRACTICE.bars, ['sum-racer']); assert.deepEqual(D.PRACTICE.rods, ['lily-hop']);
  const reg = D.registryFor(tFor('en'), 'student');
  const area = reg.types.find(x => x.id === 'area');
  assert.deepEqual(area.modes.map(m => m.name), ['Area model and arrays', 'Times table grid', 'Bar models']);
  assert.ok(area.modes[2].words.howto && area.modes[2].def.kind === 'mul');
  assert.equal(reg.types.find(x => x.id === 'rods').name, 'Number rods');
  // The Math ready-made layout is full (12 × 8, no gaps), so it is left as it was; both tools are in the library.
  const math = D.templateWidgets('math', tFor('en'));
  assert.deepEqual(math.map(w => w.type), ['fractions', 'numline', 'help', 'timer']);
});

test('the limits in the browser and on the server agree', () => {
  const sb = DT.TOOL_SPECS.bars.spec, sr = DT.TOOL_SPECS.rods.spec;
  assert.deepEqual(sb.kind[1], B.BAR_KINDS);
  assert.deepEqual([sb.g[1], sb.g[2]], B.BAR_LIMITS.g); assert.deepEqual([sb.e[1], sb.e[2]], B.BAR_LIMITS.e);
  assert.deepEqual([sb.p[2], sb.p[3]], B.BAR_LIMITS.v); assert.equal(sb.p[1], B.BAR_LIMITS.n[1]);
  assert.deepEqual([sb.ca[1], sb.ca[2]], B.BAR_LIMITS.v); assert.deepEqual([sb.max[1], sb.max[2]], B.BAR_LIMITS.max);
  const start = DT.cleanToolState('bars', {});
  assert.deepEqual(start, { ...B.BAR_START });
  assert.equal(sr.rods[1], B.ROD_MAX);
  assert.deepEqual([sr.rods[2].x[2] + 1, sr.rods[2].y[2] + 1], [B.ROD_W, B.ROD_H]);
  assert.deepEqual([sr.long[1], sr.long[2]], B.ROD_LONG);
  assert.deepEqual({ l: sr.l[4], r: sr.r[4] }, B.EQ_START);
  // The server's equation rule is the browser's.
  const rnd = seeded(7);
  for (let k = 0; k < 400; k++) {
    const l = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => Math.floor(rnd() * 12)), r = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => Math.floor(rnd() * 12));
    assert.equal(DT.rodEquation(l, r), B.eqValid({ l, r }), JSON.stringify({ l, r }));
  }
});

test('cleaning: bar models clamp every number, keep a sensible "?", and keep a student\'s word problem off the server', () => {
  const c = (v, o) => DT.cleanToolState('bars', v, o);
  assert.deepEqual(c({ kind: 'part', p: [0, 2000, 5, 6, 7], unk: 9, g: 99, e: -4, max: 5, story: 'Ten\u0007 apples‮' }),
    { kind: 'part', g: 12, e: 1, p: [1, 999, 5, 6], ca: 9, cb: 5, unk: 4, hide: true, bw: true, bp: true, max: 10, story: 'Ten apples' });
  assert.deepEqual(c({ kind: 'part', p: [4] }).p, [4, 1], 'part–whole has at least two parts');
  assert.equal(c({ kind: 'mul', unk: 4 }).unk, 0, 'multiply/divide has three quantities');
  assert.equal(c({ story: 'x'.repeat(500) }).story.length, 240);
  assert.equal(c({ kind: 'nope' }).kind, 'mul');
  // A student's own screen: the word problem is dropped (their text stays in their browser); the rest is kept.
  const st = DT.cleanToolState('area', { tab: 'bars', bars: { kind: 'cmp', ca: 12, story: 'My own story' } }, { student: true });
  assert.equal(st.bars.story, ''); assert.equal(st.bars.ca, 12);
  const w = D.cleanWidgets([{ id: 'b1', type: 'area', x: 0, y: 0, w: 6, h: 8, s: { state: { tab: 'bars', bars: { story: 'Secret' } } } }], 'student')[0];
  assert.equal(JSON.stringify(w).includes('Secret'), false);
  const tw = D.cleanWidgets([{ id: 'b1', type: 'area', x: 0, y: 0, w: 6, h: 8, s: { state: { tab: 'bars', bars: { story: 'Teacher text' } } } }], 'teacher')[0];
  assert.equal(tw.s.state.bars.story, 'Teacher text', 'the teacher\'s word problem is kept in their layout');
});

test('migration-free: older Multiply and divide states load and store exactly as before; number rods start empty', () => {
  for (const old of [{}, { a: 23, b: 14, view: 'area', sa: 20, sb: 10 }, { tab: 'times', times: { size: 12, r: 3, c: 4, mark: 'row', hide: false } }]) {
    const once = DT.cleanToolState('area', old), twice = DT.cleanToolState('area', once);
    assert.deepEqual(twice, once); assert.equal('bars' in once, false);
  }
  assert.deepEqual(DT.cleanToolState('area', {}), { a: 4, b: 6, view: 'array', sa: 0, sb: 0 });
  assert.deepEqual(DT.cleanToolState('area', { tab: 'bars', bars: {} }), { a: 4, b: 6, view: 'array', sa: 0, sb: 0, tab: 'bars' }, 'an untouched bar model stores nothing of its own');
  assert.deepEqual(DT.cleanToolState('rods', {}), { rods: [], dir: 'h', grid: true, units: true, long: 12, eq: true, l: [5, 4], r: [0, 3], model: false });
});

test('cleaning: number rods stay on the board, at most 60, and only equations the board can model', () => {
  const s = DT.cleanToolState('rods', { rods: [{ n: 20, v: true, x: 29, y: 19 }, { n: 7, x: 40, y: -3 }, { n: 0, x: 1, y: 1 }, ...Array(70).fill({ n: 3, x: 2, y: 2 })], l: [1, 1], r: [0], dir: 'x', zoom: 3 });
  assert.equal(s.rods.length, 60);
  assert.deepEqual(s.rods[0], { n: 20, x: 10, y: 15, v: false }, 'too long to stand: it lies, wholly on the board');
  assert.deepEqual(s.rods[1], { n: 7, x: 23, y: 0, v: false });
  assert.equal(s.rods[2].n, 1);
  assert.deepEqual([s.l, s.r, s.dir, 'zoom' in s], [[1, 1], [0], 'h', false]);
  for (const [l, r] of [[[5, 4], [3, 3]], [[0, 0], [5]], [[15, 9], [0]], [[2], [0, 9]]]) {
    assert.deepEqual(DT.cleanToolState('rods', { l, r, model: true }).l, [5, 4], JSON.stringify({ l, r }));
  }
});

test('bar models: the model, generation within the teacher\'s limit, and checking the number sentences', () => {
  assert.deepEqual(B.barModel({ kind: 'mul', g: 3, e: 4, unk: 2 }).slots.map(x => x.value), [12, 3, 4]);
  assert.equal(B.barModel({ kind: 'part', p: [5, 3, 2], unk: 3 }).answer, 2);
  assert.equal(B.barModel({ kind: 'cmp', ca: 4, cb: 9, unk: 0 }).answer, 5);
  const rnd = seeded(3);
  for (const kind of B.BAR_KINDS) for (const max of [10, 20, 50, 100, 1000]) for (let k = 0; k < 150; k++) {
    const p = B.newBarProblem({ kind, max, p: [1, 1, 1] }, rnd), m = B.barModel(p);
    assert.ok(m.unk >= 0 && m.unk < m.slots.length);
    if (kind === 'mul') { assert.ok(p.g >= 2 && p.g <= 10 && p.e >= 2 && p.e <= 12, JSON.stringify(p)); assert.ok(p.g * p.e <= Math.max(max, 4), `${max}: ${p.g} × ${p.e}`); }
    if (kind === 'part') { assert.equal(p.p.length, 3); assert.ok(p.p.every(v => v >= 1) && p.p.reduce((a, b) => a + b) <= max); }
    if (kind === 'cmp') { assert.ok(p.ca !== p.cb && Math.max(p.ca, p.cb) <= max && Math.min(p.ca, p.cb) >= 1, JSON.stringify(p)); }
  }
  const mul = { kind: 'mul', g: 3, e: 4 };
  assert.deepEqual(B.barSentences(mul), [{ op: '×', n: 2 }, { op: '÷', n: 2 }]);
  assert.equal(B.checkSentence(mul, 0, [3, 4, 12]), true); assert.equal(B.checkSentence(mul, 0, [4, 3, 12]), true);
  assert.equal(B.checkSentence(mul, 0, [2, 6, 12]), false, 'true maths, but not this model');
  assert.equal(B.checkSentence(mul, 1, [12, 3, 4]), true); assert.equal(B.checkSentence(mul, 1, [12, 4, 3]), true); assert.equal(B.checkSentence(mul, 1, [12, 4, 4]), false);
  assert.equal(B.checkSentence(mul, 1, [12, NaN, 3]), null, 'a box still empty');
  const part = { kind: 'part', p: [5, 3, 2] };
  assert.deepEqual(B.barSentences(part), [{ op: '+', n: 3 }, { op: '−', n: 2 }]);
  assert.equal(B.checkSentence(part, 0, [2, 5, 3, 10]), true); assert.equal(B.checkSentence(part, 0, [5, 5, 0, 10]), false);
  assert.equal(B.checkSentence(part, 1, [10, 3, 7]), true); assert.equal(B.checkSentence(part, 1, [10, 7, 3]), true); assert.equal(B.checkSentence(part, 1, [10, 4, 6]), false);
  const cmp = { kind: 'cmp', ca: 4, cb: 9 };
  assert.equal(B.checkSentence(cmp, 0, [9, 4, 5]), true); assert.equal(B.checkSentence(cmp, 0, [4, 9, -5]), false);
  assert.equal(B.checkSentence(cmp, 1, [5, 4, 9]), true); assert.equal(B.checkSentence(cmp, 1, [4, 4, 8]), false);
});

test('number rods: snapping to the grid and to rod ends, trains and their lengths, free spots', () => {
  const rods = [{ n: 3, x: 0, y: 0 }, { n: 4, x: 3, y: 0 }, { n: 2, x: 8, y: 0 }, { n: 5, x: 0, y: 2, v: true }];
  assert.deepEqual(B.trains(rods).map(t => [t.rods, t.len]), [[[0, 1], 7], [[2], 2], [[3], 5]]);
  assert.equal(B.trainOf(rods, 1).len, 7);
  assert.deepEqual(B.snapRod({ n: 2, x: 7.6, y: 0.2 }, rods), { n: 2, v: false, x: 7, y: 0 }, 'joins the 4-rod\'s end');
  assert.deepEqual(B.snapRod({ n: 2, x: 12.4, y: 5.3 }, rods), { n: 2, v: false, x: 12, y: 5 }, 'nothing near: the grid');
  assert.deepEqual(B.snapRod({ n: 3, x: 29, y: 15.8 }, []), { n: 3, v: false, x: 27, y: 15 }, 'kept on the board');
  assert.deepEqual(B.snapRod({ n: 2, v: true, x: 0.3, y: 7.4 }, rods), { n: 2, v: true, x: 0, y: 7 }, 'a standing rod joins a standing rod\'s end');
  assert.deepEqual(B.clampRod({ n: 18, v: true, x: 3, y: 3 }), { n: 18, v: false, x: 3, y: 3 });
  assert.deepEqual(B.freeSpot([{ n: 10, x: 0, y: 6 }], 3), { n: 3, v: false, x: 10, y: 6 });
  assert.deepEqual(B.freeSpot([], 5, true, 5), { n: 5, v: true, x: 5, y: 0 });
  const full = []; for (let y = 0; y < B.ROD_H; y++) for (let x = 0; x < B.ROD_W; x += 10) full.push({ n: 10, x, y });
  assert.equal(B.freeSpot(full, 1), null);
  assert.equal(B.rodsOverlap({ n: 3, x: 0, y: 0 }, { n: 1, x: 2, y: 0 }), true); assert.equal(B.rodsOverlap({ n: 3, x: 0, y: 0 }, { n: 1, x: 3, y: 0 }), false);
});

test('number rods: equations typed, made at random, modelled as two trains and checked', () => {
  assert.deepEqual(B.parseEquation('5 + 4 = ? + 3'), { l: [5, 4], r: [0, 3] });
  assert.deepEqual(B.parseEquation('7=3+_'), { l: [7], r: [3, 0] });
  assert.deepEqual(B.parseEquation('□+2 = 9'), { l: [0, 2], r: [9] });
  for (const bad of ['5 + 4 = 9', '? + ? = 4', '5 - 4 = ?', '15 + 9 = ?', '0 + 4 = ?', 'x', '', '<b>1</b>+1=?']) assert.equal(B.parseEquation(bad), null, bad);
  assert.equal(B.missingOf({ l: [5, 4], r: [0, 3] }), 6);
  assert.equal(B.eqText({ l: [5, 4], r: [0, 3] }), '5 + 4 = □ + 3');
  const rnd = seeded(11);
  for (let k = 0; k < 500; k++) {
    const e = B.newEquation(rnd);
    assert.ok(B.eqValid(e), JSON.stringify(e));
    assert.ok([...e.l, ...e.r].every(x => x <= 10) && B.missingOf(e) >= 1, JSON.stringify(e));
  }
  const m = B.modelEquation({ l: [5, 4], r: [0, 3] });
  assert.deepEqual(m.rods, [{ n: 5, v: false, x: 1, y: 1 }, { n: 4, v: false, x: 6, y: 1 }, { n: 3, v: false, x: 7, y: 3 }]);
  assert.deepEqual(m.gap, { n: 6, v: false, x: 1, y: 3 });
  assert.equal(B.trainOf(m.rods, 0).len, 9);
  assert.deepEqual(B.trainOf([...m.rods, { ...m.gap }], 3).len, 9, 'the right rod in the gap makes the trains the same length');
  assert.equal(B.modelEquation({ l: [5, 4], r: [0, 3] }, true).gap.v, true, 'standing trains');
  assert.equal(B.modelEquation({ l: [9, 9], r: [0, 8] }, true).gap.v, false, 'too tall for the board: they lie down');
});

test('Make a question: a bar model\'s ? and the rods\' missing number, never a wrong answer equal to the right one', () => {
  const A = { q: { bars: 'What number is the ? in this bar model? {s}', rods: 'What number goes in the box? {e}' } };
  const cases = [[{ kind: 'mul', g: 3, e: 4, unk: 0 }, '3 × 4 = ?', 12], [{ kind: 'mul', g: 3, e: 4, unk: 1 }, '? × 4 = 12', 3], [{ kind: 'mul', g: 3, e: 4, unk: 2 }, '12 ÷ 3 = ?', 4],
    [{ kind: 'part', p: [5, 3], unk: 0 }, '5 + 3 = ?', 8], [{ kind: 'part', p: [5, 3], unk: 2 }, '5 + ? = 8', 3], [{ kind: 'cmp', ca: 9, cb: 5, unk: 0 }, '9 − 5 = ?', 4],
    [{ kind: 'cmp', ca: 9, cb: 5, unk: 1 }, '5 + 4 = ?', 9], [{ kind: 'cmp', ca: 9, cb: 5, unk: 2 }, '9 − 4 = ?', 5]];
  for (const [st, s, ans] of cases) {
    const q = questionFor('bars', st, {}, A);
    assert.equal(q.q, `What number is the ? in this bar model? ${s}`);
    assert.equal(q.options[q.answer], String(ans));
    assert.equal(new Set(q.options).size, q.options.length); assert.ok(q.options.length >= 2);
  }
  const r = questionFor('rods', { eq: true, l: [5, 4], r: [0, 3] }, {}, A);
  assert.equal(r.q, 'What number goes in the box? 5 + 4 = □ + 3'); assert.equal(r.options[r.answer], '6'); assert.ok(r.options.includes('9'), 'the slip: the other side\'s total');
  assert.equal(questionFor('rods', { eq: false, l: [5, 4], r: [0, 3] }, {}, A), null, 'no equation, no question');
});

test('words: every bar model and number rods string in all 13 languages, the short help, and no "drawn below"', () => {
  const en = loc('en'), keys = [...D.widgetType('rods').words, 'name', 'desc'];
  const bw = D.registryFor(tFor('en'), 'teacher').types.find(x => x.id === 'area').modes.find(m => m.id === 'bars').words;
  for (const code of OTHERS) {
    const l = loc(code);
    for (const k of Object.keys(bw)) assert.ok(l.dash.w.bars[k], `${code} bars.${k}`);
    for (const k of keys) assert.ok(l.dash.w.rods[k], `${code} rods.${k}`);
    for (const k of ['howto', 'helpUse', 'helpIdeas']) { assert.notEqual(l.dash.w.bars[k], en.dash.w.bars[k], `${code} bars.${k}`); assert.notEqual(l.dash.w.rods[k], en.dash.w.rods[k], `${code} rods.${k}`); }
    assert.notEqual(l.dash.w.rods.name, en.dash.w.rods.name, `${code} rods.name`);
    assert.notEqual(l.dash.w.area.m.bars, en.dash.w.area.m.bars, `${code} area.m.bars`);
    for (const k of ['bars', 'rods']) assert.ok(l.dash.ask[k], `${code} ask.${k}`);
  }
  assert.equal(loc('en-GB').dash.w.rods.desc.startsWith('Coloured'), true);
  // The short ⓘ help: at most three points of one line, one "Try:" idea; German instructions fit one line.
  const words = s => s.split(/\s+/).filter(x => /[\p{L}\p{N}]/u.test(x)).length;
  for (const code of LOCALES.filter(c => c !== 'en-GB')) {
    for (const id of ['bars', 'rods']) {
      const w = loc(code).dash.w[id];
      assert.ok(w.howto && !/\n/.test(w.howto) && [...w.howto].length <= 72, `${code} ${id}: ${w.howto}`);
      const pts = w.helpUse.split('\n');
      assert.ok(pts.length <= 3 && !/\n/.test(w.helpIdeas), `${code} ${id}`);
      for (const t of [...pts, w.helpIdeas]) assert.ok(t.trim() && [...t].length <= 90, `${code} ${id}: ${t}`);
      assert.ok([...w.helpUse, ...w.helpIdeas].length <= 300, `${code} ${id}`);
      if (code === 'en') { for (const t of pts) assert.ok(words(t) <= 12, t); assert.ok(words(w.helpUse) + words(w.helpIdeas) <= 50); }
    }
  }
  // Fractions Add/Subtract: the answer is to the right in circles, so the instruction no longer says "below".
  assert.equal(en.dash.w.fractions.howtoOp, 'Use − and + on each number. The answer is drawn too.');
  for (const code of LOCALES) assert.doesNotMatch(JSON.stringify(loc(code).dash.w.fractions?.howtoOp || ''), /below|unten|dessous|abajo|sotto|abaixo|onder|ниже|下/i, code);
});

test('the library finds them: "bar model", "tape diagram", "rods", "number rods" in every language', () => {
  const src = fs.readFileSync('public/js/dash.js', 'utf8');
  // The library's own filter (public/js/dash.js): a tool's name, description, other names (find) and its modes'.
  assert.match(src, /\$\{x\.name\} \$\{x\.desc\} \$\{\(x\.words \|\| \{\}\)\.find \|\| ''\} \$\{\(x\.modes \|\| \[\]\)\.map\(m => `\$\{m\.name\} \$\{\(m\.words \|\| \{\}\)\.find \|\| ''\}`\)/);
  const hay = x => `${x.name} ${x.desc} ${(x.words || {}).find || ''} ${(x.modes || []).map(m => `${m.name} ${(m.words || {}).find || ''}`).join(' ')}`.toLowerCase();
  for (const code of LOCALES) {
    const reg = D.registryFor(tFor(code), 'teacher'), find = q => reg.types.filter(x => x.add && hay(x).includes(q.toLowerCase())).map(x => x.id);
    for (const q of ['bar model', 'tape diagram']) assert.ok(find(q).includes('area'), `${code}: ${q}`);
    for (const q of ['rods', 'number rods']) assert.ok(find(q).includes('rods'), `${code}: ${q}`);
    // ... and by their own names in that language.
    const l = loc(code === 'en-GB' ? 'en' : code);
    assert.ok(find(l.dash.w.area.m.bars).includes('area'), `${code}: ${l.dash.w.area.m.bars}`);
    assert.ok(find(l.dash.w.rods.name).includes('rods'), `${code}: ${l.dash.w.rods.name}`);
    // Both are in the library's maths group (Teaching tools).
    assert.equal(reg.types.find(x => x.id === 'rods').group, 'teach'); assert.equal(reg.types.find(x => x.id === 'area').group, 'teach');
  }
});

test('safety: the renderers are local (no network, storage, innerHTML or AI); tooltips without native titles; no prices', () => {
  for (const f of ['public/js/dash-bars.js', 'public/js/dash-rods.js', 'public/js/dash-math5.js']) {
    const src = fs.readFileSync(f, 'utf8');
    for (const bad of [/\bfetch\s*\(/, /XMLHttpRequest/, /localStorage|sessionStorage|indexedDB/, /innerHTML/, /WebSocket/, /anthropic|openai|\/api\/ai/i, /\$\s?\d|€\s?\d|£\s?\d|pricing|upgrade/]) assert.doesNotMatch(src, bad, `${f} ${bad}`);
    assert.doesNotMatch(src, /Cuisenaire/i, f);
    assert.doesNotMatch(src, /\.title\s*=/, `${f}: no native title (the shared tip() names buttons)`);
  }
  const bars = fs.readFileSync('public/js/dash-bars.js', 'utf8'), rods = fs.readFileSync('public/js/dash-rods.js', 'utf8');
  // A student's own screen never keeps the word problem; the sentence boxes and the rods' answer box stay in the page.
  assert.match(bars, /ownScreen && ctx\.keep \? \{ \.\.\.ctx, keep: p => ctx\.keep\(\{ \.\.\.p, story: '' \}\) \}/);
  assert.match(bars, /const boxes = new Map\(\), stories = new Map\(\)/);
  assert.match(rods, /ans: ''/);
  // Pointer events, touch-action on the board and palette, the palette drag shared with pattern blocks.
  assert.match(rods, /G\.paletteDrag\(/); assert.match(rods, /pointerdown/); assert.match(rods, /setPointerCapture/);
  const css = fs.readFileSync('public/css/dash.css', 'utf8');
  assert.match(css, /\.dt svg\.dt-rboard\{[^}]*touch-action:none/); assert.match(css, /\.dt-rtray\{[^}]*touch-action:none/);
  for (const code of LOCALES) assert.doesNotMatch(fs.readFileSync(`server/i18n/locales/${code}.json`, 'utf8'), /Cuisenaire/i, code);
});
