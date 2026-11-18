// Classroom dashboards: Build it, Show/Hide the answer and the place value number typed straight in (docs/decisions.md
// "Classroom dashboards: Build it"). The targets (typed and ready-made), each tool's check, the answer hidden after Make
// a question, the push and progress flow with who may see what, the cleanup, and the place value chart's typed number.
// The real page is checked in Chromium (skipped where none is installed).
import fs from 'node:fs';
import os from 'node:os';
process.env.BRB_DB = ':memory:'; process.env.BRB_SILENT = '1'; process.env.LOG_REQUESTS = '0';
process.env.BRB_DATA_DIR = fs.mkdtempSync(os.tmpdir() + '/brb-dashbuild-');
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q, now, MIGRATIONS } = await import('../../server/db.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const D = await import('../../server/services/dash.js');
const DT = await import('../../server/services/dash-tools.js');
const SD = await import('../../server/services/school-delete.js');
const B = await import('../../public/js/dash-build.js');
const M = await import('../../public/js/dash-math.js');
const ASK = await import('../../public/js/dash-ask.js');
const { createApp } = await import('../../server/app.js');
const { tFor } = await import('../../server/i18n/index.js');

// Chromium, probed before any test is declared (a test declared after a top-level await would come too late).
const exe = [process.env.BRB_CHROMIUM, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => p && fs.existsSync(p));
let chromium = null;
try { ({ chromium } = await import('@playwright/test')); } catch { chromium = null; }
let haveBrowser = false;
if (chromium) { try { const b = await chromium.launch(exe ? { executablePath: exe } : {}); await b.close(); haveBrowser = true; } catch { haveBrowser = false; } }
const skip = haveBrowser ? false : 'no Chromium installed';

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = who => async (p, { method = 'GET', body } = {}) => {
  const headers = { cookie: cookieFor(who.id), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) };
  const r = await fetch(base + p, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json };
};
const POST = (body = {}) => ({ method: 'POST', body });
const boss = createUser({ username: 'DashBuildBoss', password: 'secret123', role: 'admin' });
let worlds = 0;
function world() {
  const k = ++worlds;
  const oak = S.createSchool(boss, { name: `DashBuild Oak ${k}` }).school;
  const T = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Tia Teacher', role: 'teacher' }).user.id);
  const A = S.createClass(T, oak.id, { name: '3B' }).class;
  const B2 = S.createClass(T, oak.id, { name: '3C' }).class;
  const kid = (name, c = A) => { const u = S.createSchoolAccount(T, oak.id, { rosterName: name }).user; S.addToClass(boss, c.id, u.id); q.run('UPDATE users SET display_name=? WHERE id=?', `Oomba${name.replace(/\W/g, '')}`, u.id); return getUser(u.id); };
  const T2 = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Other Teacher', role: 'teacher' }).user.id);
  return { oak, T, T2, A, B2, a1: kid('Ada Apple'), a2: kid('Abe Acorn'), b1: kid('Bea Birch', B2) };
}
async function layout(w, widgets) {
  await as(w.T)(`/class/${w.A.id}/dashboard`);
  const l = D.layoutsOf(w.A.id, w.T.id)[0];
  const r = await as(w.T)(`/api/dash/${w.A.id}/layouts/${l.id}`, POST({ widgets }));
  assert.equal(r.status, 200, r.text);
  return r.json.layout;
}

// ---------------------------------------------------------------- targets
test('typed targets: commas, grouping marks, times, fractions, points; what a tool cannot build is left out', () => {
  assert.deepEqual(B.parseTargets('base10', '347, 1205, 58'), { targets: [347, 58], bad: ['1205'], over: false });
  assert.deepEqual(B.parseTargets('placeval', '3,405.27, 1205; 58\n0.5', { dec: true }).targets, [3405270, 1205000, 58000, 500]);
  assert.deepEqual(B.parseTargets('placeval', '3.405,27', { dec: true }, 'de').targets, [3405270], 'the reader\'s own marks');
  assert.deepEqual(B.parseTargets('placeval', '3405.27, 12', { dec: false }), { targets: [12000], bad: ['3405.27'], over: false }, 'no decimals without the decimal columns');
  assert.deepEqual(B.parseTargets('tclock', '3:45, 7:10, 15:45, 3pm', {}).targets, [225, 430, 180], '15:45 is 3:45 on a 12-hour face (one target)');
  assert.deepEqual(B.parseTargets('tclock', '15:45, 3:45', { h24: true }).targets, [945, 225]);
  assert.deepEqual(B.parseTargets('tenframe', '7, 3+4, 21').targets, [{ n: 7 }, { r: 3, y: 4 }]);
  assert.deepEqual(B.parseTargets('coord', '(3, -2), (1,4) (9, 1)', { quads: 4, size: 5 }), { targets: [{ x: 3, y: -2 }, { x: 1, y: 4 }], bad: ['(9, 1)'], over: false });
  assert.deepEqual(B.parseTargets('fdp', '3/4, 0.25, 25%, 12.5%').targets, [{ n: 3, d: 4, as: 'f' }, { n: 1, d: 4, as: 'd' }, { n: 1, d: 4, as: 'p' }, { n: 1, d: 8, as: 'p' }]);
  assert.deepEqual(B.parseTargets('area', '3x4, 3 × 4, 12').targets, [{ a: 3, b: 4 }, { p: 12 }]);
  assert.deepEqual(B.parseTargets('coins', '1.25, 37c, $2', { cur: 'usd' }).targets, [125, 37, 200]);
  assert.deepEqual(B.parseTargets('coins', '1.25, 20', { cur: 'gen' }), { targets: [20], bad: ['1.25'], over: false }, 'the plain set has whole units only');
  assert.deepEqual(B.parseTargets('numline', '3, 1/2, 2 1/4, 11', { lo: 0, hi: 10, sub: 4, mode: 'fraction' }), { targets: [12, 2, 9], bad: ['11'], over: false }, 'ticks of the teacher\'s line only');
  assert.deepEqual(B.parseTargets('numline', '1/3', { lo: 0, hi: 10, sub: 4, mode: 'fraction' }).targets, [], 'not a tick of a line in quarters');
  assert.deepEqual(B.parseTargets('geoboard', '6, 4 1/2, 4.5', { pegs: 7 }).targets, [12, 9]);
  assert.deepEqual(B.parseTargets('pattern', '1 1/2, 2/3, 1/4').targets, [9, 4]);
  assert.deepEqual(B.parseTargets('hundreds', '0, 37, 120', { start: 1 }).targets, [37]);
  assert.deepEqual(B.parseTargets('hundreds', '120', { start: 1, upto: 120 }).targets, [120]);
  assert.deepEqual(B.parseTargets('angle', '45°, 90, 400').targets, [45, 90]);
  assert.deepEqual(B.parseTargets('rods', '10 7 31').targets, [10, 7]);
  assert.deepEqual(B.parseTargets('fractions', '3/4, 13/12, 0/3').targets, [{ n: 3, d: 4 }, { n: 0, d: 3 }]);
  // At most 12, no repeats; Arabic-Indic digits too.
  const many = B.parseTargets('base10', Array.from({ length: 15 }, (_, i) => i + 1).join(', ') + ', 3');
  assert.equal(many.targets.length, B.MAX_TARGETS); assert.equal(many.over, true);
  assert.deepEqual(B.parseTargets('base10', '٣٤٧', {}, 'ar').targets, [347]);
});

test('generators: every one makes targets its tool can build, different from each other, never already built at the start', () => {
  const bases = { numline: { lo: -5, hi: 20, sub: 2, mode: 'fraction' }, coord: { quads: 4, size: 10 }, coins: { cur: 'eur' }, placeval: { dec: true }, hundreds: { start: 0 }, tclock: {}, geoboard: { pegs: 9 } };
  for (const tool of B.BUILD_TOOLS) {
    const b = bases[tool] || {};
    const gens = B.gensFor(tool, b);
    assert.ok(gens.length >= 2, tool);
    for (const g of gens) {
      for (let seed = 1; seed < 6; seed++) {
        const xs = B.makeTargets(tool, g, 8, b, B.seeded(seed * 97));
        assert.ok(xs.length >= 1 && xs.length <= 8, `${tool} ${g}`);
        assert.deepEqual(B.cleanTargets(tool, xs, b), xs, `${tool} ${g}: the server keeps them all`);
        for (const x of xs) {
          assert.equal(B.checkBuild(tool, B.startState(tool, b, x), x, b).ok, false, `${tool} ${g} ${JSON.stringify(x)}: nothing built yet`);
          const text = B.targetText(tool, x, b, 'en');
          assert.ok(text && !/undefined|NaN/.test(text), `${tool} ${text}`);
        }
      }
    }
  }
  assert.deepEqual(B.gensFor('placeval', { dec: false }), ['d3', 'd4'], 'no decimals without the decimal columns');
  assert.equal(new Set(B.makeTargets('base10', 'd3', 10, {}, B.seeded(5))).size, 10, 'different from each other');
  assert.ok(B.makeTargets('base10', 'd2', 5).every(n => n >= 10 && n <= 99));
  assert.ok(B.makeTargets('tclock', 'quarter', 8).every(m => m % 15 === 0 && m < 720));
});

test('the server keeps only targets the tool can build (cleanTargets)', () => {
  assert.deepEqual(B.cleanTargets('base10', [347, 347, 1205, '58', -1, 3.5, { n: 1 }, 999]), [347, 999]);
  assert.deepEqual(B.cleanTargets('tenframe', [{ n: 7, x: 1 }, { r: 3, y: 4 }, { r: 15, y: 9 }, 'x']), [{ n: 7 }, { r: 3, y: 4 }]);
  assert.deepEqual(B.cleanTargets('coord', [{ x: 3, y: -2 }, { x: 9, y: 0 }], { quads: 4, size: 5 }), [{ x: 3, y: -2 }]);
  assert.deepEqual(B.cleanTargets('placeval', [3405270, 3405000], { dec: false }), [3405000]);
  assert.deepEqual(B.cleanTargets('nope', [1]), []);
  assert.equal(B.cleanTargets('angle', Array.from({ length: 40 }, (_, i) => i)).length, B.MAX_TARGETS);
});

// ---------------------------------------------------------------- the checks
test('each tool\'s check: the built target is right, the shown answer (solve) is right, and the hints are gentle and exact', () => {
  const ok = (tool, st, x, b = {}) => B.checkBuild(tool, st, x, b).ok;
  const hint = (tool, st, x, b = {}) => B.checkBuild(tool, st, x, b).hint;
  // Base-ten blocks: the value, with any trades; a hint names one place.
  assert.equal(ok('base10', { h: 3, t: 4, o: 7 }, 347), true);
  assert.equal(ok('base10', { h: 2, t: 14, o: 7 }, 347), true, 'traded blocks are the same number');
  assert.deepEqual(hint('base10', { h: 3, t: 3, o: 7 }, 347), { k: 'place', place: 'tens', a: 3, b: 4 });
  assert.deepEqual(hint('base10', { h: 2, t: 13, o: 7 }, 347), { k: 'made', a: 337, b: 347 });
  assert.deepEqual(hint('base10', { h: 0, t: 0, o: 0 }, 347), { k: 'empty' });
  // Place value: the digits.
  assert.equal(ok('placeval', { v: 3405270 }, 3405270), true);
  assert.deepEqual(hint('placeval', { v: 3415270 }, 3405270), { k: 'place', place: 'tens', a: 1, b: 0 });
  // Ten frames: the count, or each colour.
  assert.equal(ok('tenframe', { frames: 1, cells: [1, 2, 1, 0, 1] }, { n: 4 }), true);
  assert.equal(ok('tenframe', { frames: 1, cells: [1, 1, 1, 2, 2, 2, 2] }, { r: 3, y: 4 }), true);
  assert.deepEqual(hint('tenframe', { frames: 1, cells: [1, 1, 2, 2, 2, 2, 2] }, { r: 3, y: 4 }), { k: 'colours', a: 2, b: 5, c: 3, d: 4 });
  assert.equal(ok('tenframe', { frames: 1, cells: Array(20).fill(1) }, { n: 10 }), true, 'only the frames on show count');
  // Number chart: just that one square.
  assert.equal(ok('hundreds', { shade: [37] }, 37), true);
  assert.deepEqual(hint('hundreds', { shade: [36, 37] }, 37), { k: 'oneCell' });
  assert.deepEqual(hint('hundreds', { shade: [36] }, 37), { k: 'cell', a: 36, b: 37 });
  // Number line: one point on the tick.
  const nl = { lo: 0, hi: 5, sub: 4, mode: 'fraction' };
  assert.equal(ok('numline', { points: [9] }, 9, nl), true);
  assert.deepEqual(hint('numline', { points: [8] }, 9, nl), { k: 'point', a: '2', b: '2 1/4' });
  assert.deepEqual(hint('numline', { points: [8, 9] }, 9, nl), { k: 'onePoint' });
  // Clock: the hands (12-hour: either half of the day); the minute hand first.
  assert.equal(ok('tclock', { t: 225 }, 225), true); assert.equal(ok('tclock', { t: 945 }, 225), true);
  assert.equal(ok('tclock', { t: 945 }, 225, { h24: true }), false);
  assert.deepEqual(hint('tclock', { t: 220 }, 225), { k: 'clockMin', a: 40, b: 45 });
  assert.deepEqual(hint('tclock', { t: 285 }, 225), { k: 'clockHour' });
  // Shape board: a closed shape that doesn't cross itself, with that area (in halves).
  const sq = pts => ({ pegs: 7, cur: 0, bands: [{ pts: pts.map(([x, y]) => ({ x, y })), closed: true }] });
  assert.equal(ok('geoboard', sq([[0, 0], [3, 0], [3, 2], [0, 2]]), 12), true);
  assert.deepEqual(hint('geoboard', sq([[0, 0], [2, 0], [2, 2], [0, 2]]), 12), { k: 'area', a: '4', b: '6' });
  assert.deepEqual(hint('geoboard', sq([[0, 0], [2, 2], [2, 0], [0, 2]]), 12), { k: 'shape' }, 'a band that crosses itself');
  // Fractions: an equal fraction is right too.
  assert.equal(ok('fractions', { bars: [{ n: 6, d: 8 }] }, { n: 3, d: 4 }), true);
  assert.deepEqual(hint('fractions', { bars: [{ n: 2, d: 4 }] }, { n: 3, d: 4 }), { k: 'made', a: '2/4', b: '3/4' });
  // Fraction, decimal, percent; arrays (either way round, or any array of a number); coins; angle; blocks; points; rods.
  assert.equal(ok('fdp', { n: 25, d: 100 }, { n: 1, d: 4, as: 'p' }), true);
  assert.equal(ok('area', { a: 4, b: 3 }, { a: 3, b: 4 }), true); assert.equal(ok('area', { a: 2, b: 6 }, { p: 12 }), true);
  assert.equal(ok('area', { a: 2, b: 5 }, { p: 12 }), false);
  assert.equal(ok('coins', { counts: [2, 0, 1, 1] }, 37, { cur: 'usd' }), true);
  assert.equal(B.checkBuild('coins', { counts: [1] }, 37, { cur: 'usd' }, 'en').hint.a, '$0.01');
  assert.equal(ok('angle', { a: 45 }, 45), true); assert.deepEqual(hint('angle', { a: 40 }, 45), { k: 'made', a: '40°', b: '45°' });
  assert.equal(ok('pattern', { blocks: [{ k: 'hex' }, { k: 'tri' }, { k: 'rhom' }] }, 9), true);
  assert.equal(ok('pattern', { blocks: [{ k: 'sq' }, { k: 'thin' }] }, 1), false, 'squares are not part of a hexagon');
  assert.equal(ok('coord', { points: [{ x: 3, y: -2 }] }, { x: 3, y: -2 }), true);
  assert.deepEqual(hint('coord', { points: [{ x: 2, y: -2 }] }, { x: 3, y: -2 }), { k: 'point', a: '(2, −2)', b: '(3, −2)' });
  assert.equal(ok('rods', { rods: [{ n: 6, x: 0, y: 0 }, { n: 4, x: 6, y: 0 }] }, 10), true, 'a train of 6 and 4');
  assert.deepEqual(hint('rods', { rods: [{ n: 6, x: 0, y: 0 }, { n: 4, x: 8, y: 0 }] }, 10), { k: 'train', a: 6, b: 10 }, 'not end to end');
  // Shown on the board: the solved state is right, for every target a generator makes.
  for (const tool of B.BUILD_TOOLS) {
    const b = { numline: { lo: 0, hi: 10, sub: 2, mode: 'fraction' }, coord: { quads: 4, size: 5 }, coins: { cur: 'gbp' }, placeval: { dec: true }, geoboard: { pegs: 7 } }[tool] || {};
    for (const g of B.gensFor(tool, b)) for (const x of B.makeTargets(tool, g, 6, b, B.seeded(13))) {
      const s = B.solveState(tool, b, x);
      if (s) assert.equal(B.checkBuild(tool, s, x, b).ok, true, `${tool} ${g} ${JSON.stringify(x)}`);
      if (s) assert.equal(B.checkBuild(tool, DT.cleanToolState(tool, s), x, b).ok, true, `${tool} ${JSON.stringify(x)}: still right once the server has cleaned it`);
    }
  }
  // The teacher's fractions tool on Add (or any operation): Show on the board turns it to Compare, where the target shows.
  assert.deepEqual(B.solveState('fractions', { mode: 'add', a: { n: 3, d: 4 }, b: { n: 3, d: 2 }, step: 2 }, { n: 1, d: 5 }), { shape: 'bar', mode: 'compare', fit: 0, step: 0, bars: [{ n: 1, d: 5 }], same: false, hide: false });
  for (let a2 = 1; a2 <= 72; a2++) assert.equal(B.checkBuild('geoboard', { pegs: 7, bands: [{ pts: B.areaShape(a2, 7), closed: true }] }, a2).ok, true, `area ${a2 / 2}`);
  // Every hint has its words.
  const en = JSON.parse(fs.readFileSync('server/i18n/locales/en.json', 'utf8')).js.dash.build;
  for (const k of ['empty', 'place', 'made', 'colours', 'cell', 'oneCell', 'onePoint', 'point', 'clockMin', 'clockHour', 'shape', 'area', 'train']) assert.ok(en.hint[k], k);
  for (const tool of B.BUILD_TOOLS) { assert.ok(en.sayDef[tool], tool); for (const g of Object.keys(B.BUILD[tool].gens)) assert.ok(en.gens[g], g); }
});

// ---------------------------------------------------------------- place value: the number typed in
test('the place value number typed in: commas and points in the reader\'s marks, the chart\'s places, out of range refused', () => {
  const ok = (t, intl = 'en', dec = 3) => { const r = M.pvParse(t, intl, dec); return r.ok ? r.v : r.why; };
  assert.equal(ok('3,405.27'), 3405270); assert.equal(ok('3405.27'), 3405270); assert.equal(ok(' 3 405.27 '), 3405270);
  assert.equal(ok('3.405,27', 'de'), 3405270); assert.equal(ok('3405,27', 'de'), 3405270); assert.equal(ok('3405.27', 'de'), 3405270);
  assert.equal(ok('3,405', 'en'), 3405000, 'a grouping mark in English'); assert.equal(ok('3,405', 'de'), 3405, 'the decimal comma in German');
  assert.equal(ok('3.405', 'de'), 3405000); assert.equal(ok('.5'), 500); assert.equal(ok('5.'), 5000); assert.equal(ok('0.001'), 1);
  assert.equal(ok('9,999.999'), M.PV_MAX); assert.equal(ok('0'), 0); assert.equal(ok('٣٬٤٠٥٫٢٧', 'ar'), 3405270);
  assert.equal(ok('10,000'), 'range'); assert.equal(ok('12345'), 'range'); assert.equal(ok('-3'), 'range');
  assert.equal(ok('1.2345'), 'places'); assert.equal(ok('3.5', 'en', 0), 'places'); assert.equal(ok('3.50', 'en', 1), 3500, 'trailing zeros are no place');
  for (const bad of ['', 'abc', '3,40,5', '1.2.3,4', '3 + 4', '--', '½']) assert.equal(ok(bad), 'bad', bad);
  // Base-ten blocks: 0-999, as hundreds, tens and ones.
  assert.equal(M.pvParse('1,000', 'en', 0, 999000).why, 'range');
  assert.deepEqual(M.blocksOf(347), { h: 3, t: 4, o: 7 }); assert.deepEqual(M.blocksOf(0), { h: 0, t: 0, o: 0 });
});

// ---------------------------------------------------------------- Show/Hide the answer
test('the answer hidden (qh): kept through cleaning only when true, in every mode; the question and its order never change with it', () => {
  assert.deepEqual(DT.cleanToolState('base10', { h: 3, t: 4, o: 7, qh: true }), { h: 3, t: 4, o: 7, qh: true });
  assert.deepEqual(DT.cleanToolState('base10', { h: 3, t: 4, o: 7, qh: false }), { h: 3, t: 4, o: 7 }, 'states saved before it are unchanged');
  assert.equal('qh' in DT.cleanToolState('base10', { qh: 'yes' }), false);
  assert.equal('qh' in DT.cleanToolState('fractions', { qh: true }), false, 'the fraction tool keeps its own hide');
  const pv = DT.cleanToolState('placeval', { tab: 'base10', base10: { h: 1, qh: true }, qh: true });
  assert.equal(pv.qh, true); assert.equal(pv.base10.qh, true, 'a mode keeps its own');
  // The client's list agrees with the server's.
  const src = fs.readFileSync('public/js/dash-tools.js', 'utf8');
  const list = JSON.parse(src.match(/export const ANSWER_TOOLS = new Set\((\[[^\]]+\])\)/)[1].replace(/'/g, '"'));
  assert.deepEqual(list, DT.ANSWER_TOOLS);
  // Every tool that makes a question has a way to hide its answer (the shared one, or its own).
  const ask = JSON.parse(fs.readFileSync('server/i18n/locales/en.json', 'utf8')).dash.ask;
  assert.ok(ask);
  for (const t of D.MATH_TOOLS) assert.ok(DT.ANSWER_TOOLS.includes(t) || ['fractions', 'bars'].includes(t), t);
  const st = { h: 3, t: 4, o: 7 };
  assert.deepEqual(ASK.questionFor('base10', st, {}, { q: { base10: 'Q' } }), ASK.questionFor('base10', { ...st, qh: true }, {}, { q: { base10: 'Q' } }));
});

test('Make a question hides the answer on the teacher\'s screen until Show the answer, and the shell knows each tool\'s giveaways', () => {
  const src = fs.readFileSync('public/js/dash-tools.js', 'utf8');
  assert.match(src, /const made = T\.question\(\); if \(!made\) return; if \(!T\.hid\(\)\) \{ T\.hideAnswer\(\); T\.commit\(C\.ansHidden\); \} askSheet\(ctx, made\);/);
  assert.match(src, /body\.classList\.toggle\('dt-ans-off'/);
  assert.match(fs.readFileSync('public/css/dash.css', 'utf8'), /\.dt-ans-off \.dt-read>\*\{display:none!important\}/);
  for (const [file, re] of [['public/js/dash-tools.js', /T\.ownHide = \(\) => st\.hide/], ['public/js/dash-bars.js', /T\.ownHide = \(\) => st\.hide/],
    ['public/js/dash-tools.js', /mask: \(\) => T\.hid\(\)/], ['public/js/dash-tools4.js', /mask: \(\) => T\.hid\(\)/]]) assert.match(fs.readFileSync(file, 'utf8'), re, file);
});

// ---------------------------------------------------------------- push, progress and who sees what
test('migration 0084: dash_builds holds only right / not yet per target, and is in every cleanup list', () => {
  const names = MIGRATIONS.map(m => m[0]);
  assert.equal(names[names.indexOf('0083_staff_email_invites') + 1], '0084_dash_builds');
  assert.deepEqual(q.all('PRAGMA table_info(dash_builds)').map(c => c.name), ['push_id', 'class_id', 'user_id', 'item', 'ok', 'tries', 'at']);
  assert.ok(SD.BY_CLASS.includes('dash_builds'));
  assert.match(fs.readFileSync('server/services/dash.js', 'utf8'), /DELETE FROM dash_builds WHERE user_id=\?/);
});

test('Build it: the teacher sends a set; each student checks their own copy; the teacher sees names and progress; a student only their own', async () => {
  const w = world();
  await layout(w, [{ id: 'pv', type: 'placeval', x: 0, y: 0, w: 7, h: 7, s: { state: { tab: 'base10' } } }, { id: 'ck', type: 'tclock', x: 7, y: 0, w: 5, h: 5 }]);
  const T = as(w.T), A1 = as(w.a1), A2 = as(w.a2);
  // Who may send: only this class's teacher, a tool on their screen, a mode the tool has, at least one target.
  const send = (who, body, cls = w.A) => who(`/api/dash/${cls.id}/pushes`, POST({ kind: 'build', ref: 'pv', ...body }));
  assert.equal((await send(A1, { build: { mode: 'base10', targets: [347] } })).status, 404);
  assert.equal((await send(as(w.T2), { build: { mode: 'base10', targets: [347] } })).status, 404);
  assert.equal((await send(T, { build: { mode: 'tenframe', targets: [{ n: 3 }] } })).status, 400, 'not a mode of place value');
  assert.equal((await send(T, { build: { mode: 'base10', targets: [5000, 'x'] } })).status, 400, 'no target it can build');
  assert.equal((await send(T, { ref: 'nope', build: { mode: 'base10', targets: [3] } })).status, 400);
  const r = await send(T, { build: { mode: 'base10', base: { h: 9, t: 9, o: 9 }, targets: [347, 58, 347, 1205, 206], say: 'Build <b>these</b>‮ numbers' } });
  assert.equal(r.status, 200, r.text);
  const pid = r.json.push;
  const data = JSON.parse(q.get('SELECT data FROM dash_pushes WHERE id=?', pid).data);
  assert.deepEqual(data.targets, [347, 58, 206], 'cleaned: no repeats, nothing it cannot build');
  assert.equal(data.mode, 'base10'); assert.equal(data.type, 'placeval'); assert.doesNotMatch(data.say, /‮/);
  // A student's tray: the set, with their own results.
  let live = (await A1(`/api/dash/${w.A.id}/live`)).json;
  let p = live.pushes.find(x => x.id === pid);
  assert.equal(p.kind, 'build'); assert.equal(p.href, `#build-${pid}`); assert.deepEqual(p.build.targets, [347, 58, 206]); assert.deepEqual(p.build.mine, []);
  // Checks: the server works it out from the state (what a browser claims is not trusted), keeps right once right.
  const chk = (who, item, state, cls = w.A, id = pid) => who(`/api/dash/${cls.id}/builds/${id}/check`, POST({ item, state, right: true }));
  assert.equal((await chk(A1, 0, { h: 3, t: 3, o: 7 })).json.right, false);
  assert.equal((await chk(A1, 0, { h: 2, t: 14, o: 7 })).json.right, true);
  assert.equal((await chk(A1, 0, { h: 0, t: 0, o: 0 })).json.right, false, 'a later wrong check');
  assert.equal((await chk(A1, 1, { h: 0, t: 5, o: 9 })).json.right, false);
  assert.equal((await chk(A2, 2, { h: 2, t: 0, o: 6 })).json.right, true);
  assert.equal((await chk(A1, 3, { h: 3 })).status, 400, 'no such target');
  assert.equal((await chk(T, 0, { h: 3, t: 4, o: 7 })).status, 404, 'the teacher does not check');
  assert.equal((await chk(as(w.b1), 0, { h: 3, t: 4, o: 7 }, w.B2)).status, 400, 'not a set of their class');
  assert.equal((await chk(as(w.b1), 0, { h: 3, t: 4, o: 7 })).status, 404, 'not their class');
  assert.deepEqual(q.all('SELECT item, ok, tries FROM dash_builds WHERE push_id=? AND user_id=? ORDER BY item', pid, w.a1.id), [{ item: 0, ok: 1, tries: 3 }, { item: 1, ok: 0, tries: 1 }]);
  // The teacher's progress: Oomba names (never roster names), done, right, which are not right yet; per target.
  const prog = (await T(`/api/dash/${w.A.id}/builds/${pid}`)).json;
  assert.equal(prog.ref, 'pv');
  assert.deepEqual(prog.students, [{ name: 'OombaAbeAcorn', done: 1, right: 1, wrong: [] }, { name: 'OombaAdaApple', done: 2, right: 1, wrong: [1] }]);
  assert.deepEqual(prog.items, [{ right: 1, tried: 1 }, { right: 0, tried: 1 }, { right: 1, tried: 1 }]);
  assert.doesNotMatch(JSON.stringify(prog), /Ada Apple|Abe Acorn/);
  // A student sees only their own, never anyone else's or names.
  const mine = (await A1(`/api/dash/${w.A.id}/builds/${pid}`)).json;
  assert.deepEqual(mine.mine, [{ i: 0, right: true, tries: 3 }, { i: 1, right: false, tries: 1 }]);
  assert.equal(mine.students, undefined); assert.doesNotMatch(JSON.stringify(mine), /Oomba/);
  live = (await A2(`/api/dash/${w.A.id}/live`)).json;
  assert.deepEqual(live.pushes.find(x => x.id === pid).build.mine, [{ i: 2, right: true, tries: 1 }]);
  // Nobody outside the class sees anything.
  for (const who of [as(w.T2), as(w.b1)]) assert.equal((await who(`/api/dash/${w.A.id}/builds/${pid}`)).status, 404);
  // Ended: no more checks; the progress is still there for the teacher.
  assert.equal((await T(`/api/dash/${w.A.id}/pushes/${pid}/end`, POST())).status, 200);
  assert.equal((await chk(A1, 1, { h: 0, t: 5, o: 8 })).status, 400);
  assert.equal((await T(`/api/dash/${w.A.id}/builds/${pid}`)).json.students.length, 2);
  // Nothing a student built is stored anywhere.
  assert.doesNotMatch(JSON.stringify(q.all('SELECT * FROM dash_builds')), /"h"|state/);
});

test('cleanup: a student\'s rows go with their account, a set\'s with its push after two weeks, and all of them with the school', async () => {
  const w = world();
  await layout(w, [{ id: 'ck', type: 'tclock', x: 0, y: 0, w: 5, h: 5 }]);
  const pid = D.push(w.T, w.A, { kind: 'build', ref: 'ck', build: { mode: 'tclock', base: {}, targets: [225, 430] } }).push;
  assert.ok(pid);
  assert.equal(D.buildCheck(w.a1, w.A, pid, { item: 0, state: { t: 225 } }).right, true);
  assert.equal(D.buildCheck(w.a2, w.A, pid, { item: 1, state: { t: 10 } }).right, false);
  D.forgetUser(w.a1.id);
  assert.equal(q.get('SELECT COUNT(*) n FROM dash_builds WHERE user_id=?', w.a1.id).n, 0);
  assert.equal(q.get('SELECT COUNT(*) n FROM dash_builds WHERE push_id=?', pid).n, 1);
  // Two weeks on, the next push of the class takes old pushes and their rows away.
  q.run('UPDATE dash_pushes SET created_at=? WHERE id=?', now() - 15 * 86400e3, pid);
  D.push(w.T, w.A, { kind: 'build', ref: 'ck', build: { mode: 'tclock', base: {}, targets: [60] } });
  assert.equal(q.get('SELECT COUNT(*) n FROM dash_builds WHERE push_id=?', pid).n, 0);
  // The school delete takes the rest.
  const p2 = D.todaysPushes(w.A)[0].id;
  D.buildCheck(w.a2, w.A, p2, { item: 0, state: { t: 60 } });
  assert.equal(q.get('SELECT COUNT(*) n FROM dash_builds WHERE class_id=?', w.A.id).n, 1);
  assert.equal(SD.deleteSchool(boss, w.oak.id).ok, true);
  assert.equal(q.get('SELECT COUNT(*) n FROM dash_builds WHERE class_id=?', w.A.id).n, 0);
});

test('safety: the Build it module is pure, no AI, no free text between students; strings in every locale', () => {
  const src = fs.readFileSync('public/js/dash-build.js', 'utf8');
  assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB|document\.|innerHTML|anthropic|claude/i);
  const page = fs.readFileSync('public/js/dash.js', 'utf8');
  const student = page.slice(page.indexOf('function openBuild('), page.indexOf('projector mode (the teacher)'));
  assert.ok(student.length > 1000);
  assert.doesNotMatch(student, /<textarea|<input|sessionStorage|localStorage/, 'a student only builds and checks: nothing to type to anyone');
  assert.match(student, /body: \{ item: i, state: st \}/, 'what is sent: the target and the tool\'s state');
  const en = JSON.parse(fs.readFileSync('server/i18n/locales/en.json', 'utf8'));
  const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? flat(v, `${p}${k}.`) : [[`${p}${k}`, v]]));
  const keys = flat({ js: { dash: { build: en.js.dash.build } } }).map(([k]) => k).concat(['dash.tools.showAns', 'dash.tools.hideAns', 'dash.tools.build', 'dash.tools.editHint']);
  const get = (o, k) => k.split('.').reduce((x, y) => (x ? x[y] : undefined), o);
  for (const code of ['de', 'fr', 'es', 'it', 'nl', 'pt', 'ru', 'ja', 'zh-Hant', 'ar', 'he']) {
    const loc = JSON.parse(fs.readFileSync(`server/i18n/locales/${code}.json`, 'utf8'));
    for (const k of keys) { assert.ok(get(loc, k), `${code} ${k}`); if (!/^js\.dash\.build\.(of|gens\.(to10|named|facts5|facts10))$/.test(k)) assert.notEqual(get(loc, k), get(en, k), `${code} ${k} is translated`); }
  }
  for (const f of ['server/i18n/locales/en.json', 'public/js/dash-build.js']) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /Cuisenaire/i);
});

// ---------------------------------------------------------------- in the real page


test('in Chromium: Make a question hides Base-ten blocks\' answer until Show the answer; Build it from sheet to a student\'s Check; place value typed in', { skip, timeout: 180e3 }, async () => {
  const w = world();
  D.ensureLayouts(w.T, w.A, tFor('en'));
  const l0 = D.layoutsOf(w.A.id, w.T.id)[0];
  D.updateLayout(w.T, w.A, l0.id, { widgets: [{ id: 'pv', type: 'placeval', x: 0, y: 0, w: 6, h: 7, s: { state: { tab: 'base10', base10: { h: 3, t: 4, o: 7 } } } },
    { id: 'pv2', type: 'placeval', x: 6, y: 0, w: 6, h: 7 }] });
  D.useLayout(w.T, w.A, l0.id);
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  try {
    const open = async (who, size) => {
      const ctx = await browser.newContext({ viewport: { width: size[0], height: size[1] }, reducedMotion: 'reduce' });
      const [cn, cv] = cookieFor(who.id).split('=');
      await ctx.addCookies([{ name: cn, value: cv, url: base }, { name: 'lang', value: 'en', url: base }]);
      const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto(`${base}/class/${w.A.id}/dashboard`); await page.waitForSelector('.dash-w'); await page.waitForTimeout(400);
      return { page, errors };
    };
    const saved = async test2 => { for (let i = 0; i < 40; i++) { const x = D.layoutsOf(w.A.id, w.T.id)[0].widgets.find(y => y.id === 'pv'); if (test2(x)) return x; await new Promise(r => setTimeout(r, 100)); } return null; };
    const { page: tp, errors: te } = await open(w.T, [1600, 900]);
    const pv = tp.locator('.dash-w[data-id="pv"]');
    assert.equal(await pv.locator('.dt-matn').first().inputValue(), '3');
    // Make a question and Build it are in 📤 Share ▾ (docs/decisions.md "one calm row of buttons"): only sharing in it.
    assert.equal(await pv.locator('.dt-foot .dt-ask, .dt-foot .dt-buildit, .dt-foot .dt-send').evaluateAll(xs => xs.filter(x => x.getClientRects().length).length), 0, 'nothing of Share shows before it opens');
    await pv.locator('.dt-share').click(); await tp.waitForTimeout(100);
    assert.equal(await pv.locator('.dt-share').getAttribute('aria-expanded'), 'true');
    const shared = await pv.locator('.dt-sharemenu .dt-mi').evaluateAll(xs => xs.map(x => x.getAttribute('aria-label')));
    assert.deepEqual(shared.slice(0, 3), ['Send to students', 'Build it', 'Make a question']);
    assert.ok(shared.slice(3).every(x => /^Practice it/.test(x)), shared.join(' | '));
    await pv.locator('.dt-ask').click(); await tp.waitForTimeout(200);
    assert.ok(await tp.locator('.dt-askform').isVisible(), 'the question sheet');
    assert.equal(await pv.locator('.dt-share').getAttribute('aria-expanded'), 'false', 'Share closes when one of its items is used');
    await tp.keyboard.press('Escape');
    assert.equal(await pv.locator('.dash-wb').evaluate(b => b.classList.contains('dt-ans-off')), true, 'the answer is hidden');
    assert.deepEqual(await pv.locator('.dt-matn').evaluateAll(xs => xs.map(x => x.value)), ['?', '?', '?'], 'the counts too');
    assert.equal(await pv.locator('.dt-read .dt-bigin').isVisible(), false, 'the number under the blocks');
    assert.ok((await saved(x => x.s.state.base10 && x.s.state.base10.qh === true)), 'kept with the layout (the projector shows it the same)');
    assert.equal(await pv.locator('.dt-ans').getAttribute('aria-label'), 'Show the answer');
    await pv.locator('.dt-ans').click(); await tp.waitForTimeout(100);
    assert.equal(await pv.locator('.dash-wb').evaluate(b => b.classList.contains('dt-ans-off')), false);
    assert.equal(await pv.locator('.dt-bigin').inputValue(), '347');
    assert.ok(await saved(x => !x.s.state.base10.qh));
    // Place value: the number typed straight in.
    const pv2 = tp.locator('.dash-w[data-id="pv2"]'), inp = pv2.locator('.dt-bigin');
    assert.equal(await inp.inputValue(), '3,405.27');
    assert.equal(await inp.getAttribute('aria-label'), 'Place value chart: type a number');
    await inp.click(); await tp.keyboard.type('12,345'); await tp.keyboard.press('Enter');
    assert.equal(await inp.inputValue(), '3,405.27', 'out of range keeps the old value');
    assert.match(await pv2.locator('.dt-editmsg').textContent(), /0 to 9,999\.999/);
    assert.equal(await inp.getAttribute('aria-invalid'), 'true');
    await inp.fill('2,708.5'); await inp.press('Enter');
    assert.equal(await inp.inputValue(), '2,708.5');
    assert.equal(await pv2.locator('.dt-editmsg').isVisible(), false);
    assert.deepEqual(await pv2.locator('.dt-pvd').evaluateAll(xs => xs.map(x => x.textContent)), ['2', '7', '0', '8', '5', '0', '0']);
    assert.match(await pv2.locator('.dt-read .dt-sub').textContent(), /2,000 \+ 700 \+ 8 \+ 0\.5/);
    await inp.fill('9'); await inp.press('Escape');
    assert.equal(await inp.inputValue(), '2,708.5', 'Escape puts it back');
    await inp.fill('9'); await pv2.locator('.dt-pvcol').first().click();
    assert.equal(await inp.inputValue(), '9', 'leaving the field uses it');
    // Build it: the teacher's sheet, then a student's copy.
    await pv.locator('.dt-share').click(); await pv.locator('.dt-buildit').click(); await tp.waitForTimeout(200);
    await tp.fill('#dash-bi-list', '347, 1205, 58');
    assert.match(await tp.locator('#dash-bi-preview').textContent(), /2 targets.*1205/s);
    await tp.click('.dash-biform [type="submit"]'); await tp.waitForTimeout(600);
    assert.ok(await tp.locator('.dash-bprog').isVisible(), 'the progress opens');
    const pid = D.todaysPushes(w.A)[0].id;
    const { page: sp, errors: se } = await open(w.a1, [390, 844]);
    await sp.waitForTimeout(300);
    await sp.click('#dash-banner .btn-hot'); await sp.waitForTimeout(300);
    assert.match(await sp.locator('.dash-bstep').textContent(), /1 of 2/);
    assert.equal(await sp.locator('.dash-bnum').textContent(), '347');
    assert.equal(await sp.locator('.dash-wbuild .dt-modes').count(), 0, 'one mode, no switch');
    assert.equal(await sp.locator('.dash-wbuild .dt-ask, .dash-wbuild .dt-ans, .dash-wbuild .dt-send, .dash-wbuild .dt-buildit, .dash-wbuild .dt-share, .dash-wbuild .dt-opt').count(), 0);
    assert.equal(await sp.locator('.dash-wbuild .dash-wb').evaluate(b => b.classList.contains('dt-ans-off')), true, 'the answer hidden');
    const plus = (p, n) => (async () => { for (let i = 0; i < n; i++) await sp.locator(`.dash-wbuild .dt-mat[data-place="${p}"] .dt-pm`).nth(1).click(); })();
    await plus('h', 3); await plus('t', 3); await plus('o', 7);
    await sp.click('[data-bcheck]'); await sp.waitForTimeout(300);
    assert.equal(await sp.locator('.dash-bfb').textContent(), 'Not yet. Tens: you have 3; you need 4.');
    await plus('t', 1); await sp.waitForTimeout(650);
    await sp.click('[data-bcheck]'); await sp.waitForTimeout(400);
    assert.match(await sp.locator('.dash-bfb').textContent(), /Yes!/);
    await sp.click('[data-bnext]'); await sp.click('[data-bnext]'); await sp.waitForTimeout(200);
    assert.match(await sp.locator('.dash-bdone').textContent(), /All done!.*1 of 2 right.*58/s);
    assert.deepEqual(q.all('SELECT item, ok FROM dash_builds WHERE push_id=? AND user_id=?', pid, w.a1.id), [{ item: 0, ok: 1 }]);
    // The teacher's live view picks it up, and shows a target on the board.
    await tp.waitForTimeout(4500);
    assert.match(await tp.locator('.dash-bslist').textContent(), /OombaAdaApple.*1 of 2 done · 1 right/s);
    await tp.locator('[data-board="1"]').click(); await tp.waitForTimeout(200);
    assert.equal(await pv.locator('.dt-bigin').inputValue(), '58');
    assert.deepEqual(te, []); assert.deepEqual(se, []);
  } finally { await browser.close(); }
});
