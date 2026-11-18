// Oomba Canvas (canvas/, docs/canvas-api.md): each manipulative's pure check / solve, the self-test (a broken answer key
// and an empty start that counts as right are both caught), the frozen kit file (its hash, canvas/SHIPPED.json, a fresh
// build), the words in every site language, the copied colour tokens, and the scanner's pinned-tag rule.
process.env.BRB_SILENT = '1';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { TOOLS, TOOL_IDS, selfTest, deal, cleanProblem, seeded } from '../../canvas/src/logic.js';
import { WORDS, wordsFor } from '../../canvas/src/words.js';
import { TOKENS } from '../../canvas/src/style.js';
import { CANVAS_VERSIONS, CANVAS_LATEST, canvasTag, checkCanvas, canvasKit, canvasVersion, selfTestHtml, activityData, withActivityData } from '../../server/services/canvaskit.js';
import { scanVersion } from '../../server/services/scanner.js';
import { files as buildFiles } from '../../scripts/build-canvas.js';
import { CODES } from '../../server/i18n/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const T = id => TOOLS[id];
const ok = (id, p, st) => T(id).check(cleanProblem({ tool: id, ...p }).p, st);

// ---------------------------------------------------------------- the manipulatives
test('fraction bars: make 3/4 from eighths; only 6 eighths is right, other pieces and empty never are', () => {
  const p = { from: [3, 4], to: 8 };
  assert.equal(ok('fractions.equiv', p, { pieces: Array(6).fill(8) }).ok, true);
  assert.deepEqual(ok('fractions.equiv', p, { pieces: [] }).hint.k, 'fbEmpty');
  assert.deepEqual(ok('fractions.equiv', p, { pieces: [8, 8, 8, 8] }).hint.k, 'fbMore');
  assert.deepEqual(ok('fractions.equiv', p, { pieces: Array(7).fill(8) }).hint.k, 'fbLess');
  assert.deepEqual(ok('fractions.equiv', p, { pieces: [4, 4, 4] }).hint, { k: 'fbNotThese', v: { u: [1, 8] } }, '3/4 made of fourths is not "using eighths"');
  const q = cleanProblem({ tool: 'fractions.equiv', ...p }).p;
  assert.deepEqual(T('fractions.equiv').solve(q), { pieces: Array(6).fill(8) });
  assert.deepEqual(T('fractions.equiv').steps(q).filter(s => s.ans !== undefined).map(s => s.ans), [2, 6], 'one fourth = 2 eighths; 3 fourths = 6 eighths');
  assert.equal(T('fractions.equiv').solve(cleanProblem({ tool: 'fractions.equiv', from: [5, 6], to: 4 }).p), null, '5/6 cannot be made with fourths');
});
test('fraction bars: shade n of d parts, and compare two fractions with <, = or >', () => {
  assert.equal(ok('fractions.shade', { n: 3, d: 5 }, { on: [0, 2, 4] }).ok, true, 'any three parts');
  assert.equal(ok('fractions.shade', { n: 3, d: 5 }, { on: [0, 1] }).ok, false);
  assert.equal(ok('fractions.shade', { n: 3, d: 5 }, { on: [0, 0, 0] }).ok, false, 'a part counts once');
  assert.equal(ok('fractions.compare', { a: [2, 3], b: [3, 4] }, { pick: '<' }).ok, true);
  assert.equal(ok('fractions.compare', { a: [2, 4], b: [1, 2] }, { pick: '=' }).ok, true);
  assert.equal(ok('fractions.compare', { a: [2, 4], b: [1, 2] }, { pick: '>' }).ok, false);
  assert.equal(ok('fractions.compare', { a: [2, 4], b: [1, 2] }, { pick: null }).hint.k, 'fbPick');
  const c = cleanProblem({ tool: 'fractions.compare', a: [2, 3], b: [3, 4] }).p;
  assert.deepEqual(T('fractions.compare').steps(c).filter(s => s.ans !== undefined).map(s => s.ans), [8, 9], 'in twelfths: 8 and 9');
});
test('number line: a point at 3/4 (quarters) and a jump; the tick says left or right', () => {
  const p = { at: [3, 4], lo: 0, hi: 2, sub: 4 };
  assert.equal(ok('numberline.point', p, { tick: 3 }).ok, true);
  assert.equal(ok('numberline.point', p, { tick: 4 }).hint.k, 'fbLeft');
  assert.equal(ok('numberline.point', p, { tick: 1 }).hint.k, 'fbRight');
  assert.equal(ok('numberline.point', p, { tick: null }).hint.k, 'fbTap');
  assert.equal(ok('numberline.jump', { from: 3, by: 5, lo: 0, hi: 10, sub: 1 }, { tick: 8 }).ok, true);
  assert.equal(ok('numberline.jump', { from: [1, 2], by: [3, 4], lo: 0, hi: 2, sub: 4 }, { tick: 5 }).ok, true, '1/2 + 3/4 = 5/4: tick 5 of quarters');
  assert.equal(T('numberline.point').solve(cleanProblem({ tool: 'numberline.point', at: [1, 3], lo: 0, hi: 1, sub: 4 }).p), null, 'thirds are not on a quarters line');
  assert.equal(T('numberline.point').solve(cleanProblem({ tool: 'numberline.point', at: 3, lo: 0, hi: 2, sub: 1 }).p), null, 'off the line');
});
test('digit boxes: column add, subtract and multiply; the wrong column is named, leading empty boxes are fine', () => {
  const add = cleanProblem({ tool: 'digits.add', a: 478, b: 256 }).p, A = T('digits.add');
  assert.deepEqual(A.solve(add).ans, [4, 3, 7]);
  assert.equal(A.check(add, { ans: [4, 3, 7] }).ok, true);
  assert.equal(A.check(add, { ans: [4, 3, 7, null] }).ok, true, 'an empty box in front is fine');
  assert.deepEqual(A.check(add, { ans: [4, 2, 7] }).hint, { k: 'fbCol', v: { place: 'tens' } });
  assert.deepEqual(A.check(add, { ans: [4, null, 7] }).hint, { k: 'fbFill', v: { place: 'tens' } });
  assert.equal(A.check(add, A.start(add)).ok, false);
  assert.deepEqual(A.steps(add).filter(s => s.ans !== undefined).map(s => [s.k, s.ans]), [['colAdd', 14], ['colAddC', 13], ['colAddC', 7]]);
  const sub = cleanProblem({ tool: 'digits.sub', a: 503, b: 128 }).p, S = T('digits.sub');
  assert.equal(S.check(sub, S.solve(sub)).ok, true); assert.deepEqual(S.solve(sub).ans.filter(x => x !== null), [5, 7, 3]);
  assert.ok(S.steps(sub).some(s => s.k === 'colBorrow'), 'borrowing is a step');
  assert.equal(cleanProblem({ tool: 'digits.sub', a: 5, b: 9 }).p, undefined, 'no negative answers');
  const mul = cleanProblem({ tool: 'digits.mul', a: 47, b: 6 }).p, M = T('digits.mul');
  assert.deepEqual(M.solve(mul).ans.filter(x => x !== null), [2, 8, 2]);
  assert.equal(M.check(mul, { ans: [2, 8, 2, null] }).ok, true);
  assert.equal(cleanProblem({ tool: 'digits.mul', a: 47, b: 16 }).p, undefined, 'one digit only');
  const zero = cleanProblem({ tool: 'digits.sub', a: 7, b: 7 }).p;
  assert.equal(S.check(zero, S.start(zero)).ok, false, 'an answer of 0 still needs the 0');
  assert.equal(S.check(zero, S.solve(zero)).ok, true);
});
test('tiles: sort by a rule the kit knows (or the Builder\'s own groups) and put in order', () => {
  const s = cleanProblem({ tool: 'tiles.sort', rule: 'evenodd', items: [2, 7, 10, 13] }).p, SO = T('tiles.sort');
  assert.deepEqual(SO.solve(s).at, [0, 1, 0, 1]);
  assert.equal(SO.check(s, { at: [0, 1, 0, 1] }).ok, true);
  assert.deepEqual(SO.check(s, { at: [0, 1, 1, 1] }).hint, { k: 'fbSortWrong', v: { n: 1 } });
  assert.equal(SO.check(s, { at: [0, null, 0, 1] }).hint.k, 'fbSortAll');
  const m = cleanProblem({ tool: 'tiles.sort', rule: 'mult', n: 3, items: [9, 10] }).p;
  assert.deepEqual(SO.solve(m).at, [0, 1]);
  const own = cleanProblem({ tool: 'tiles.sort', bins: ['Shapes', 'Numbers'], items: [{ t: 'circle', bin: 0 }, { t: 'seven', bin: 1 }] }).p;
  assert.equal(SO.check(own, { at: [0, 1] }).ok, true);
  assert.equal(cleanProblem({ tool: 'tiles.sort', bins: ['A', 'B'], items: [{ t: 'x', bin: 5 }, { t: 'y', bin: 0 }] }).p, undefined, 'a group that does not exist');
  const o = cleanProblem({ tool: 'tiles.order', items: [[3, 4], [1, 2], [2, 3]] }).p, OR = T('tiles.order');
  assert.deepEqual(OR.solve(o).slots, [1, 2, 0], '1/2 < 2/3 < 3/4');
  assert.equal(OR.check(o, { slots: [1, 2, 0] }).ok, true);
  assert.equal(OR.check(o, { slots: [2, 1, 0] }).hint.k, 'fbOrderWrong');
  assert.equal(OR.check(o, { slots: [1, 1, 0] }).hint.k, 'fbOrderAll');
  assert.equal(cleanProblem({ tool: 'tiles.order', items: [[1, 2], [2, 4], 3] }).p, undefined, 'two equal tiles: no clear order');
});
test('every tool: its generator makes problems its worked answer solves, never right when empty, with steps and up to 3 hints', () => {
  for (const id of TOOL_IDS) {
    const t = T(id);
    for (let i = 1; i <= 40; i++) {
      const c = cleanProblem(t.gen(seeded(i * 31), {}));
      assert.ok(c.p, `${id} #${i}: ${c.why}`);
      assert.equal(t.check(c.p, t.solve(c.p)).ok, true, `${id} #${i}: solve passes`);
      assert.equal(t.check(c.p, t.start(c.p)).ok, false, `${id} #${i}: empty is not right`);
      const h = t.hints(c.p); assert.ok(h.length >= 1 && h.length <= 3);
      for (const x of [t.task(c.p), t.ask(c.p), ...t.steps(c.p), ...h]) assert.ok(x.k in WORDS.en, `${id}: no word "${x.k}"`);
    }
  }
});
test('a fresh set per student: a seed of their own, no repeats against what they have seen', () => {
  const a = { gen: { tool: 'digits.add', digits: 2 }, config: { count: 5 } };
  const one = deal(a, { seed: 11 }), two = deal(a, { seed: 99 }), again = deal(a, { seed: 11 });
  assert.equal(one.length, 5); assert.deepEqual(one, again, 'the same seed, the same set (a resume)');
  assert.notDeepEqual(one, two, 'another student, another set');
  const seen = one.map(p => T(p.tool).key(p)), next = deal(a, { seed: 11, seen });
  assert.ok(next.every(p => !seen.includes(T(p.tool).key(p))), 'Try new ones never repeats');
  assert.equal(deal({ problems: [{ tool: 'fractions.shade', n: 1, d: 2 }, { tool: 'nope' }] }).length, 1, 'fixed problems: the good ones');
});

// ---------------------------------------------------------------- the self-test
test('the self-test rejects a broken answer key and an empty start that counts as right, and names the problem', () => {
  assert.deepEqual(selfTest({ problems: [{ tool: 'fractions.equiv', from: [3, 4], to: 8 }] }), { ok: true, problems: [] });
  const r = selfTest({ problems: [{ tool: 'fractions.equiv', from: [3, 4], to: 8 }, { tool: 'fractions.equiv', from: [5, 6], to: 4 }, { tool: 'numberline.point', at: [1, 3], sub: 4 }, { tool: 'digits.add', a: 'x', b: 2 }, { tool: 'magic' }] });
  assert.equal(r.ok, false);
  assert.deepEqual(r.problems.map(p => p.at), ['problem 2', 'problem 3', 'problem 4', 'problem 5']);
  assert.match(r.problems[0].why, /cannot be solved: 5\/6 cannot be made with pieces of 1\/4/);
  assert.match(r.problems[3].why, /unknown tool "magic"/);
  // an empty start that counts as right: a tool whose check passes on its own start state is caught
  const real = TOOLS['fractions.shade'].check;
  TOOLS['fractions.shade'].check = () => ({ ok: true, hint: null });
  try { assert.match(selfTest({ problems: [{ tool: 'fractions.shade', n: 1, d: 2 }] }).problems[0].why, /the empty start already counts as right/); } finally { TOOLS['fractions.shade'].check = real; }
  // a worked answer that does not pass
  const solve = TOOLS['fractions.shade'].solve;
  TOOLS['fractions.shade'].solve = () => ({ on: [] });
  try { assert.match(selfTest({ problems: [{ tool: 'fractions.shade', n: 1, d: 2 }] }).problems[0].why, /worked answer does not pass/); } finally { TOOLS['fractions.shade'].solve = solve; }
  assert.equal(selfTest({}).ok, false, 'no problems and no generator');
  assert.equal(selfTest({ gen: { tool: 'digits.mul' } }).ok, true);
  assert.match(selfTest({ problems: [{ tool: 'fractions.shade', n: 1, d: 2 }], hints: { 'fractions.shade': ['a', 'b', 'c', 'd'] } }).problems[0].why, /1 to 3 short lines/);
});
test('the server runs the kit\'s own frozen file: an activity page passes, a broken one names its problem', () => {
  const tpl = fs.readFileSync(path.join(ROOT, 'server/builder/templates/canvas.html'), 'utf8').replace('<!--CANVAS-->', canvasTag());
  assert.equal(canvasVersion(tpl), CANVAS_LATEST);
  assert.deepEqual(selfTestHtml(tpl), { ok: true, problems: [] });
  const bad = withActivityData(tpl, { ...activityData(tpl).data, problems: [{ tool: 'fractions.equiv', from: [5, 6], to: 4 }], gen: null });
  assert.equal(selfTestHtml(bad).ok, false); assert.match(selfTestHtml(bad).problems[0].why, /5\/6 cannot be made/);
  assert.match(selfTestHtml(tpl.replace(/"problems": \[/, '"problems": [,')).problems[0].why, /not valid JSON/);
  assert.equal(selfTestHtml('<p>an arcade game</p>'), null, 'not an activity: no self-test');
  const k = canvasKit();
  assert.deepEqual([...k.tools], TOOL_IDS, 'the frozen file has the same tools as the source');
});

// ---------------------------------------------------------------- the frozen file
test('Oomba Canvas 1.0.0: the hash in canvaskit.js and canvas/SHIPPED.json match the file, and a fresh build makes the same bytes', async () => {
  const shipped = JSON.parse(fs.readFileSync(path.join(ROOT, 'canvas/SHIPPED.json'), 'utf8')).versions;
  for (const [v, h] of Object.entries(CANVAS_VERSIONS)) {
    const f = fs.readFileSync(path.join(ROOT, 'public/vendor/oomba-canvas', v, 'oomba-canvas.js'));
    assert.equal(`sha384-${crypto.createHash('sha384').update(f).digest('base64')}`, h, v);
    assert.equal(shipped[v], h, `${v} is locked in canvas/SHIPPED.json`);
    assert.ok(fs.existsSync(path.join(ROOT, 'public/vendor/oomba-canvas', v, 'fonts/bricolage-latin.woff2')));
  }
  const built = await buildFiles();
  for (const [k, b] of Object.entries(built)) assert.ok(fs.readFileSync(path.join(ROOT, 'public/vendor/oomba-canvas', CANVAS_LATEST, k)).equals(b), `${k} matches canvas/src`);
  const js = built['oomba-canvas.js'].toString();
  assert.doesNotMatch(js, /\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|\beval\s*\(|new Function/, 'no network, no browser storage, no eval');
  assert.doesNotMatch(js, /<input|contenteditable|<textarea/i, 'no text field anywhere: digits only, through the kit');
});
test('the kit\'s words: every language has every key, with the same {values}', () => {
  const keys = Object.keys(WORDS.en), want = s => [...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
  const langs = CODES.filter(c => c !== 'en-GB');
  for (const l of langs) {
    assert.ok(WORDS[l], `${l} is there`);
    const missing = keys.filter(k => typeof WORDS[l][k] !== 'string' || !WORDS[l][k].trim());
    assert.deepEqual(missing, [], `${l} is missing words`);
    for (const k of keys) assert.deepEqual(want(WORDS[l][k]), want(WORDS.en[k]), `${l}.${k} keeps its values`);
  }
  assert.equal(wordsFor('en-GB').check, 'Check'); assert.equal(wordsFor('zh-Hant').check, '檢查'); assert.equal(wordsFor('xx').hint, 'Hint');
});
test('the kit\'s colours are a copy of the site\'s tokens (light and dark)', () => {
  const app = fs.readFileSync(path.join(ROOT, 'public/css/app.css'), 'utf8');
  const light = /:root\{([\s\S]*?)\n\}/.exec(app)[1], dark = /:root\[data-theme="dark"\]\{([\s\S]*?)\n\}\}/.exec(app)[1];
  const val = (block, name) => (new RegExp(`${name}:([^;]+);`).exec(block) || [])[1];
  for (const [mode, block] of [['light', light], ['dark', dark]]) {
    for (const m of TOKENS[mode].matchAll(/(--[\w-]+):([^;]+)/g)) {
      if (m[1] === '--shadow') continue;
      const site = val(block, m[1]) || (mode === 'dark' ? null : undefined);
      if (site !== null && site !== undefined) assert.equal(m[2].trim(), site.trim(), `${mode} ${m[1]}`);
    }
  }
});

// ---------------------------------------------------------------- the scanner
test('the scanner admits exactly the pinned Oomba Canvas tag and refuses altered ones', () => {
  const page = tag => `<title>A</title>${tag}<div id="oc-app"></div><script>Oc.activity({})</script>`;
  const good = scanVersion(page(canvasTag()));
  assert.equal(good.status, 'pass', JSON.stringify(good.issues));
  assert.deepEqual(checkCanvas(page(canvasTag())).issues, []);
  const h = CANVAS_VERSIONS[CANVAS_LATEST];
  const bad = [
    canvasTag().replace(h, 'sha384-' + 'A'.repeat(64)),                               // another hash
    canvasTag().replace('1.0.0', '9.9.9'),                                             // a version we do not have
    canvasTag().replace(' crossorigin="anonymous"', ''),                               // no crossorigin
    canvasTag().replace('></script>', ' data-x="1"></script>'),                        // anything extra
    canvasTag().replace('></script>', '>alert(1)</script>'),                           // code inside the tag
    `<script src="/vendor/oomba-canvas/1.0.0/other.js" integrity="${h}" crossorigin="anonymous"></script>`,
    `<img src="/vendor/oomba-canvas/1.0.0/oomba-canvas.js">`,                          // its files named elsewhere
  ];
  for (const b of bad) {
    const r = scanVersion(page(b));
    assert.equal(r.status, 'fail', b);
    assert.ok(r.issues.some(i => /^canvas_/.test(i.code) || i.code === 'external_script'), `${b}: ${JSON.stringify(r.issues)}`);
  }
});
