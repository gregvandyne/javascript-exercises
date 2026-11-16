// Classroom dashboards, stage 3 (services/dash.js, services/dash-tools.js, routes/dash.js, public/js/dash-math.js,
// public/js/dash-tools.js): teaching tools, the whiteboard and the Picture widget. The maths behind every tool (fractions,
// number lines, lines and tables, base ten, place value, area models, clocks, repeating decimals), the server-side
// rebuilding of every tool's state, sending a tool to students (each gets their own copy; nothing comes back), the
// Picture widget's access rules (the class's teacher uploads; the class's students see it only while it is pinned), and
// the safety rules (no AI, drawings never leave the browser, no prices, no real names).
import fs from 'node:fs';
import os from 'node:os';
process.env.BRB_DB = ':memory:'; process.env.BRB_SILENT = '1'; process.env.LOG_REQUESTS = '0';
process.env.BRB_DATA_DIR = fs.mkdtempSync(os.tmpdir() + '/brb-dash3-');
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q, MIGRATIONS } = await import('../../server/db.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const D = await import('../../server/services/dash.js');
const DT = await import('../../server/services/dash-tools.js');
const M = await import('../../public/js/dash-math.js');
const W = await import('../../public/js/dash-widgets.js');
const TL = await import('../../public/js/dash-tools.js');
const { createApp } = await import('../../server/app.js');
const { tFor } = await import('../../server/i18n/index.js');

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = who => async (p, { method = 'GET', body, raw, type, headers: extra = {} } = {}) => {
  const headers = { ...(who ? { cookie: cookieFor(who.id) } : {}), ...extra };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (raw) headers['content-type'] = type || 'image/jpeg';
  const r = await fetch(base + p, { method, headers, body: raw || (body !== undefined ? JSON.stringify(body) : undefined), redirect: 'manual' });
  const text = Buffer.from(await r.arrayBuffer()).toString('utf8'); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json, headers: r.headers };
};
const POST = (body = {}) => ({ method: 'POST', body });
const seg = (m, d) => { const b = Buffer.from(d); const h = Buffer.from([0xff, m, 0, 0]); h.writeUInt16BE(b.length + 2, 2); return Buffer.concat([h, b]); };
const jpeg = (w = 160, h = 90) => Buffer.concat([Buffer.from([0xff, 0xd8]), seg(0xe0, 'JFIF\0\x01\x01\0\0\x01\0\x01\0\0'), seg(0xe1, 'Exif\0\0GPSLatitude=51.5'),
  seg(0xdb, Buffer.alloc(65, 1)), seg(0xc0, Buffer.from([8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0])), seg(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])), Buffer.from([0x12, 0x34, 0xff, 0xd9])]);

const boss = createUser({ username: 'Dash3Boss', password: 'secret123', role: 'admin' });
let worlds = 0;
function world() {
  const k = ++worlds;
  const oak = S.createSchool(boss, { name: `Dash3 Oak ${k}` }).school;
  const T = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Tia Teacher', role: 'teacher' }).user.id);
  const T2 = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Tom Other', role: 'teacher' }).user.id);
  const SA = createUser({ username: `Dash3SA${k}`, password: 'secret123' }); S.addMember(boss, oak.id, SA.id, 'admin');
  const A = S.createClass(T, oak.id, { name: '5A' }).class, B = S.createClass(T2, oak.id, { name: '5B' }).class;
  const kid = (name, c) => { const u = S.createSchoolAccount(T, oak.id, { rosterName: name }).user; if (c) S.addToClass(boss, c.id, u.id); return getUser(u.id); };
  const a1 = kid('Ada Apple', A), a2 = kid('Abe Acorn', A), b1 = kid('Bea Bloom', B);
  const stranger = createUser({ username: `Dash3Str${k}`, password: 'secret123' });
  return { oak, T, T2, SA, A, B, a1, a2, b1, stranger, REAL: /Ada Apple|Abe Acorn|Bea Bloom|Tia Teacher/ };
}
async function layout(w, widgets) {
  await as(w.T)(`/class/${w.A.id}/dashboard`);
  const l = D.layoutsOf(w.A.id, w.T.id)[0];
  const r = await as(w.T)(`/api/dash/${w.A.id}/layouts/${l.id}`, POST({ widgets }));
  assert.equal(r.status, 200, r.text);
  return r.json.layout;
}
const TOOLS = ['fractions', 'numline', 'coord', 'graph', 'base10', 'placeval', 'tenframe', 'hundreds', 'area', 'times', 'tclock', 'fdp'];
const f = (n, d) => ({ n, d });

test('migration 0080 is the newest; pushes carry data and pictures a use', () => {
  const names = MIGRATIONS.map(m => m[0]);
  assert.equal(names[names.indexOf('0079_dash_everyday') + 1], '0080_dash_teaching_tools', 'stage 5 adds 0081 after it');
  assert.equal(names.filter(n => n.startsWith('0080')).length, 1);
  assert.ok(q.all('PRAGMA table_info(dash_pushes)').some(c => c.name === 'data'));
  assert.ok(q.all('PRAGMA table_info(dash_pictures)').some(c => c.name === 'use'));
});

test('the registry: the Teach group, a renderer and English words for every tool; who may add, pin and send each', () => {
  const t = tFor('en');
  for (const id of [...TOOLS, 'board', 'picture']) { assert.ok(D.widgetType(id), id); assert.equal(typeof W.RENDER[id], 'function', `renderer for ${id}`); }
  const reg = D.registryFor(t, 'teacher');
  assert.ok(reg.groups.some(g => g.id === 'teach' && g.name === 'Teaching tools'));
  for (const x of reg.types.filter(x => [...TOOLS, 'board', 'picture'].includes(x.id))) {
    assert.ok(!/^dash\./.test(x.name) && !/^dash\./.test(x.desc), x.id);
    for (const [k, v] of Object.entries(x.words)) assert.ok(!/^dash\./.test(v), `${x.id}.${k}`);
    for (const s of x.settings) if (s.type !== 'tool') { assert.ok(!/^dash\./.test(s.label), `${x.id}.${s.key}`); for (const o of Object.values(s.labels || {})) assert.ok(!/^dash\./.test(o)); }
  }
  for (const v of Object.values(reg.common)) assert.ok(!/^dash\./.test(v));
  for (const id of TOOLS) {
    const x = D.widgetType(id);
    assert.equal(x.group, 'teach'); assert.equal(x.who, 'both', id); assert.equal(D.canPin(x), false, `${id} is sent, never pinned`); assert.equal(x.send, true);
    // The starting state the browser gets is the cleaned default.
    assert.deepEqual(x.settings[0].def, DT.cleanToolState(id, {}));
  }
  // The whiteboard: the teacher's only, never pinned, never sent. The picture: the teacher's, and it may be pinned.
  assert.equal(D.widgetType('board').who, 'teacher'); assert.equal(D.canPin(D.widgetType('board')), false); assert.ok(!D.widgetType('board').send);
  assert.equal(D.widgetType('picture').who, 'teacher'); assert.equal(D.canPin(D.widgetType('picture')), true); assert.ok(!D.widgetType('picture').send);
  // Students may add the tools (their own copies), never the whiteboard or the picture.
  const sw = D.cleanWidgets([...TOOLS, 'board', 'picture'].map((type, i) => ({ id: `s${i}`, type })), 'student').map(x => x.type);
  assert.deepEqual(sw, TOOLS);
  assert.deepEqual(D.cleanWidgets([{ id: 'p1', type: 'fractions', pin: true }, { id: 'p2', type: 'board', pin: true }, { id: 'p3', type: 'picture', pin: true }], 'teacher').filter(x => x.pin).map(x => x.type), ['picture']);
});

test('every tool\'s state is rebuilt on the server: unknown keys go, numbers are clamped, lists cut, rules kept', () => {
  const c = DT.cleanToolState;
  assert.equal(c('nope', {}), null);
  for (const id of TOOLS) { const s = c(id, { evil: '<script>', __proto__: { x: 1 } }); assert.ok(s && !('evil' in s), id); assert.deepEqual(c(id, s), s, `${id}: cleaning is stable`); }
  // fractions: 1-3 fractions, 1-12 parts, never more shaded than parts
  const fr = c('fractions', { shape: 'star', bars: [{ n: 9, d: 4 }, { n: -2, d: 99 }, { n: 1, d: 0 }, { n: 1, d: 2 }], same: 'yes' });
  assert.deepEqual(fr, { shape: 'bar', bars: [{ n: 4, d: 4 }, { n: 0, d: 12 }, { n: 1, d: 1 }], same: false, hide: false });
  assert.deepEqual(c('fractions', { bars: [] }).bars, [{ n: 1, d: 2 }]);
  // number line: a real range, at most 240 steps, points and jumps on the line, decimals that end
  const nl = c('numline', { lo: 5, hi: 2, sub: 7, mode: 'fraction', points: [1, 99999, 'x', 6], jumps: [{ a: 0, b: 0 }, { a: 5, b: 6 }, { a: -1, b: 3 }] });
  assert.equal(nl.hi, 6); assert.equal(nl.sub, 1); assert.deepEqual(nl.points, [6]); assert.deepEqual(nl.jumps, [{ a: 5, b: 6 }]);
  assert.equal(c('numline', { lo: 0, hi: 100, sub: 12, mode: 'fraction' }).sub, 2, 'too many ticks: fewer steps');
  assert.equal(c('numline', { lo: 0, hi: 2, sub: 3, mode: 'decimal' }).sub, 10, 'thirds never label a decimal line');
  assert.equal(c('numline', { lo: 0, hi: 2, sub: 4, mode: 'whole' }).sub, 1);
  // coordinate plane: points inside the grid, no repeats
  const co = c('coord', { quads: 1, size: 5, mi: 99, b: -50, points: [{ x: -1, y: 2 }, { x: 3, y: 4 }, { x: 3, y: 4 }, { x: 10, y: 10 }, { x: 11, y: 0 }] });
  assert.equal(co.mi, 20); assert.equal(co.b, -10); assert.deepEqual(co.points, [{ x: 3, y: 4 }, { x: 10, y: 10 }]);
  // graph: text clipped and cleaned, at most 12 rows of whole numbers 0-999
  const gr = c('graph', { kind: 'pie', title: `Fav‮${'x'.repeat(90)}\u0007`, rows: Array.from({ length: 20 }, (_, i) => ({ l: `Row ${i}`.repeat(9), v: i * 100 - 50 })) });
  assert.equal(gr.kind, 'bar'); assert.equal([...gr.title].length, 60); assert.doesNotMatch(gr.title, /[‮\u0007]/);
  assert.equal(gr.rows.length, 12); assert.equal(gr.rows[0].v, 0); assert.equal(gr.rows[11].v, 999); assert.equal([...gr.rows[0].l].length, 24);
  // base ten, place value, ten frames, hundreds, area, times, clock, fdp
  assert.deepEqual(c('base10', { h: 40, t: -3, o: 19.6 }), { h: 9, t: 0, o: 19 });
  assert.equal(c('placeval', { v: 1e12 }).v, 9999999); assert.equal(c('placeval', { v: 1234567, dec: false }).v, 1234000);
  assert.deepEqual(c('tenframe', { frames: 1, cells: [1, 2, 3, 1, 1, 1, 1, 1, 1, 1, 2, 2] }).cells, [1, 2, 2, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(c('hundreds', { start: 0, shade: [5, 5, 100, -1, 0], skip: 1 }), { start: 0, shade: [0, 5], skip: 0, hide: 'none' });
  assert.deepEqual(c('area', { a: 12, b: 3, sa: 12, sb: 2, view: 'x' }), { a: 12, b: 3, view: 'array', sa: 0, sb: 2 });
  assert.deepEqual(c('times', { size: 10, r: 12, c: 3 }), { size: 10, r: 0, c: 3, mark: 'fact', hide: false });
  assert.equal(c('tclock', { t: 5000 }).t, 1439);
  assert.deepEqual(c('fdp', { n: 9, d: 4 }), { n: 4, d: 4 });
});

test('fractions: equivalence, comparing, common denominators, and words for screen readers', () => {
  assert.deepEqual(M.simplify(6, 8), f(3, 4)); assert.deepEqual(M.simplify(0, 5), f(0, 1)); assert.deepEqual(M.simplify(3, -6), f(-1, 2));
  assert.ok(M.equivalent(f(2, 4), f(1, 2))); assert.ok(M.equivalent(f(6, 9), f(4, 6))); assert.ok(!M.equivalent(f(2, 3), f(3, 4)));
  assert.equal(M.compare(f(3, 4), f(5, 8)), 1); assert.equal(M.compare(f(5, 8), f(3, 4)), -1); assert.equal(M.compare(f(4, 8), f(1, 2)), 0);
  assert.deepEqual(M.commonDenominator([f(3, 4), f(5, 8)]), { L: 8, list: [f(6, 8), f(5, 8)] });
  assert.deepEqual(M.commonDenominator([f(1, 4), f(1, 6)]), { L: 12, list: [f(3, 12), f(2, 12)] }, 'the least common denominator, not 24');
  assert.deepEqual(M.commonDenominator([f(2, 3), f(3, 4), f(7, 12)]), { L: 12, list: [f(8, 12), f(9, 12), f(7, 12)] });
  assert.equal(M.commonDenominator([f(1, 11), f(1, 12), f(1, 7)]).L, 924);
  const o = M.ordered([f(3, 4), f(5, 8), f(6, 8)]);
  assert.deepEqual(o.list.map(x => x.i), [1, 0, 2]); assert.deepEqual(o.signs, ['<', '=']);
  assert.equal(M.fractionWords(3, 8), 'three eighths'); assert.equal(M.fractionWords(1, 2), 'one half'); assert.equal(M.fractionWords(2, 2), 'two halves');
  assert.equal(M.fractionWords(1, 3), 'one third'); assert.equal(M.fractionWords(5, 12), 'five twelfths'); assert.equal(M.fractionWords(4, 4), 'four fourths');
  assert.equal(M.fractionWords(1, 1), 'one whole'); assert.equal(M.fractionWords(0, 5), 'zero fifths'); assert.equal(M.fractionWords(21, 100), 'twenty-one hundredths');
  assert.equal(TL.shadedWords(3, 8, { shadedOf: '{n} of {d} parts shaded' }, 'en-US'), '3 of 8 parts shaded, three eighths');
  assert.equal(TL.shadedWords(3, 8, { shadedOf: '{n} von {d} Teilen gefärbt' }, 'de'), '3 von 8 Teilen gefärbt', 'other languages read the numbers');
});

test('number line: ticks land where they should; labels as whole numbers, mixed numbers or decimals; jumps are signed', () => {
  // 0 to 2 in quarters: tick 3 is three quarters of the way to 1
  assert.equal(M.tickX(0, 0, 8, 40, 960), 40); assert.equal(M.tickX(8, 0, 8, 40, 960), 960); assert.equal(M.tickX(3, 0, 8, 40, 960), 40 + 3 * 115);
  // negatives: -2 to 3 (whole steps), 0 is two fifths along
  assert.equal(M.tickX(0, -2, 3, 0, 1000), 400);
  assert.equal(M.nearestTick(400, -2, 3, 0, 1000), 0); assert.equal(M.nearestTick(-50, -2, 3, 0, 1000), -2); assert.equal(M.nearestTick(1999, -2, 3, 0, 1000), 3);
  assert.equal(M.tickLabel(2, 4), '1/2'); assert.equal(M.tickLabel(5, 4), '1 1/4'); assert.equal(M.tickLabel(8, 4), '2'); assert.equal(M.tickLabel(-3, 4), '−3/4'); assert.equal(M.tickLabel(-6, 4), '−1 1/2');
  assert.equal(M.tickLabel(0, 3), '0'); assert.equal(M.tickLabel(4, 3), '1 1/3');
  assert.equal(M.tickLabel(5, 4, 'decimal'), '1.25'); assert.equal(M.tickLabel(-1, 10, 'decimal'), '−0.1'); assert.equal(M.tickLabel(7, 2, 'decimal'), '3.5');
  assert.equal(M.jumpLabel(1, 4, 4), '+3/4'); assert.equal(M.jumpLabel(4, -4, 4), '−2'); assert.equal(M.jumpLabel(0, 6, 4), '+1 1/2');
  // labels thin out on a long line
  assert.equal(M.labelEvery(0, 8, 4, 20), 1); assert.equal(M.labelEvery(0, 40, 4, 20), 4); assert.equal(M.labelEvery(-100, 100, 1, 20), 10);
});

test('coordinate plane: points on y = mx + b, tables of values, the line inside the grid, the equation', () => {
  const m = f(2, 3);
  assert.deepEqual(M.lineY(m, 1, 3), f(3, 1)); assert.deepEqual(M.lineY(m, 1, 1), f(5, 3)); assert.deepEqual(M.lineY(m, 1, -3), f(-1, 1));
  assert.deepEqual(M.valueTable(f(2, 1), -1, [-2, -1, 0, 1, 2]).map(p => p.y.n), [-5, -3, -1, 1, 3]);
  assert.deepEqual(M.valueTable(f(-1, 2), 2, [0, 1, 2]).map(p => M.fracText(p.y)), ['2', '3/2', '1']);
  assert.deepEqual(M.lineInBox(f(1, 1), 0, -5, 5, -5, 5), [[-5, -5], [5, 5]]);
  assert.deepEqual(M.lineInBox(f(2, 1), 1, -5, 5, -5, 5), [[-3, -5], [2, 5]]);
  assert.deepEqual(M.lineInBox(f(0, 1), 3, -5, 5, -5, 5), [[-5, 3], [5, 3]]);
  assert.equal(M.lineInBox(f(0, 1), 9, -5, 5, -5, 5), null, 'a line above the grid misses it');
  assert.equal(M.equationText(f(2, 3), -1), 'y = 2/3x − 1'); assert.equal(M.equationText(f(1, 1), 2), 'y = x + 2'); assert.equal(M.equationText(f(-1, 1), 0), 'y = −x');
  assert.equal(M.equationText(f(0, 1), -4), 'y = −4'); assert.equal(M.equationText(f(-3, 2), 5), 'y = −3/2x + 5'); assert.equal(M.equationText(f(3, 1), 0), 'y = 3x');
  // the slope buttons step through whole numbers and friendly fractions, in order
  for (let i = 1; i < M.SLOPES.length; i++) assert.equal(M.compare(M.SLOPES[i - 1], M.SLOPES[i]), -1);
  assert.deepEqual(M.SLOPES[DT.cleanToolState('coord', {}).mi], f(1, 1));
});

test('base-ten blocks regroup without changing the number; place value carries, borrows and shifts', () => {
  const s = { h: 1, t: 9, o: 12 };
  assert.equal(M.blocksValue(s), 202);
  const up = M.trade(s, 'o', 'up'); assert.deepEqual(up, { h: 1, t: 10, o: 2 }); assert.equal(M.blocksValue(up), 202);
  const up2 = M.trade(up, 't', 'up'); assert.deepEqual(up2, { h: 2, t: 0, o: 2 }); assert.equal(M.blocksValue(up2), 202);
  const down = M.trade(up2, 'h', 'down'); assert.deepEqual(down, { h: 1, t: 10, o: 2 });
  assert.deepEqual(M.trade({ h: 0, t: 1, o: 3 }, 't', 'down'), { h: 0, t: 0, o: 13 });
  assert.equal(M.trade({ h: 0, t: 0, o: 9 }, 'o', 'up'), null, 'fewer than 10 ones');
  assert.equal(M.trade({ h: 0, t: 1, o: 10 }, 't', 'down'), null, 'no room for 10 more ones');
  // place value (kept in thousandths): 3,405.27
  const v = 3405270;
  assert.deepEqual(M.pvDigits(v), [3, 4, 0, 5, 2, 7, 0]);
  assert.equal(M.pvFormat(v, 'en'), '3,405.27'); assert.equal(M.pvFormat(v, 'de'), '3.405,27'); assert.equal(M.pvFormat(5000, 'en'), '5'); assert.equal(M.pvFormat(1, 'en'), '0.001');
  assert.deepEqual(M.pvExpanded(v).map(x => x.value), [3000, 400, 5, 0.2, 0.07]);
  assert.deepEqual(M.pvDigits(M.pvAdd(3999000, 3, 1)), [4, 0, 0, 0, 0, 0, 0], 'one more one carries into the thousands');
  assert.deepEqual(M.pvDigits(M.pvAdd(1000000, 6, -1)), [0, 9, 9, 9, 9, 9, 9], 'one less thousandth borrows all the way');
  assert.equal(M.pvAdd(0, 3, -1), null); assert.equal(M.pvAdd(9999999, 6, 1), null);
  assert.deepEqual(M.pvDigits(M.pvTimes10(345600)), [3, 4, 5, 6, 0, 0, 0], '345.6 × 10 = 3,456');
  assert.deepEqual(M.pvDigits(M.pvDiv10(345600)), [0, 0, 3, 4, 5, 6, 0], '345.6 ÷ 10 = 34.56');
  assert.equal(M.pvDiv10(1), null, 'no ten-thousandths'); assert.equal(M.pvTimes10(1000000), null);
});

test('area model: partial products add up to the product; place-value splits; skip counting; graph scales', () => {
  const r = M.partialProducts(23, 14, 20, 10);
  assert.deepEqual(r.parts.map(p => p.p), [200, 80, 30, 12]); assert.equal(r.total, 322); assert.equal(r.total, 23 * 14);
  assert.deepEqual(M.partialProducts(7, 8, 5, 0).parts.map(p => [p.a, p.b, p.p]), [[5, 8, 40], [2, 8, 16]]);
  assert.equal(M.partialProducts(7, 8).total, 56); assert.equal(M.partialProducts(7, 8, 7, 9).parts.length, 1, 'a split outside the side is no split');
  for (let a = 1; a <= 99; a += 7) for (let b = 1; b <= 99; b += 5) assert.equal(M.partialProducts(a, b, M.placeSplit(a), M.placeSplit(b)).total, a * b);
  assert.equal(M.placeSplit(23), 20); assert.equal(M.placeSplit(30), 0); assert.equal(M.placeSplit(7), 0);
  assert.deepEqual(M.skipCount(25, 1), [25, 50, 75, 100]); assert.deepEqual(M.skipCount(25, 0), [25, 50, 75]); assert.equal(M.skipCount(7, 1).length, 14);
  assert.deepEqual(M.niceScale(7), { top: 8, step: 2 }); assert.deepEqual(M.niceScale(5), { top: 5, step: 1 }); assert.deepEqual(M.niceScale(37), { top: 40, step: 10 });
  for (const max of [1, 5, 7, 12, 37, 99, 250, 999]) { const s = M.niceScale(max); assert.ok(s.top >= max && s.top / s.step <= 6 && s.top % s.step === 0, String(max)); }
});

test('teaching clock: hands move together, dragging the minute hand past 12 changes the hour, elapsed time across noon and midnight', () => {
  assert.deepEqual(M.handAngles(0), { hour: 0, minute: 0 });
  assert.deepEqual(M.handAngles(3 * 60), { hour: 90, minute: 0 });
  assert.deepEqual(M.handAngles(9 * 60 + 30), { hour: 285, minute: 180 }, 'half past nine: the hour hand halfway between 9 and 10');
  assert.deepEqual(M.handAngles(15 * 60 + 40), { hour: 110, minute: 240 }, '3:40 pm');
  assert.equal(M.dragMinute(10 * 60 + 55, 0), 11 * 60, 'past 12 forward: the next hour');
  assert.equal(M.dragMinute(11 * 60 + 5, 330), 10 * 60 + 55, 'back past 12: the hour before');
  assert.equal(M.dragMinute(11 * 60 + 55, 6), 12 * 60 + 1, 'across noon');
  assert.equal(M.dragMinute(23 * 60 + 58, 12), 2, 'across midnight');
  assert.equal(M.dragHour(3 * 60 + 20, 120), 4 * 60);
  assert.equal(M.elapsed(11 * 60 + 40, 13 * 60 + 15), 95, '11:40 am to 1:15 pm');
  assert.equal(M.elapsed(23 * 60 + 30, 30), 60, 'across midnight');
  assert.equal(M.elapsed(9 * 60, 9 * 60), 0);
  assert.deepEqual(M.elapsedJumps(11 * 60 + 40, 13 * 60 + 15).map(j => j.mins), [20, 60, 15]);
  assert.deepEqual(M.elapsedJumps(9 * 60, 11 * 60 + 30).map(j => j.mins), [120, 30]);
  assert.deepEqual(M.elapsedJumps(10 * 60 + 10, 10 * 60 + 40).map(j => j.mins), [30]);
  const j = M.elapsedJumps(11 * 60 + 40, 13 * 60 + 15); assert.equal(j.reduce((s, x) => s + x.mins, 0), 95); assert.equal(j.at(-1).to, 13 * 60 + 15);
  assert.deepEqual(M.clockParts(0), { h: 12, h24: 0, m: 0, pm: false }); assert.deepEqual(M.clockParts(12 * 60 + 5), { h: 12, h24: 12, m: 5, pm: true });
});

// ---------------------------------------------------------------- help on the maths tools: the fraction tool's operations
// (docs/decisions.md "Classroom dashboards: help on the maths tools")
test('fractions: add, subtract, multiply and divide exactly, simplified, as mixed numbers; below zero; never by zero', async () => {
  const op = (o, a, b) => M.operate(o, f(...a), f(...b));
  assert.deepEqual(M.gcd(12, 18), 6); assert.equal(M.lcm(4, 6), 12); assert.equal(M.lcm(11, 12), 132);
  // add: the least common denominator, the same-size pieces, the answer, its simplest form and mixed number
  let r = op('add', [1, 2], [1, 3]);
  assert.deepEqual([r.L, r.a2, r.b2, r.raw, r.simple, r.mixed, r.more], [6, f(3, 6), f(2, 6), f(5, 6), f(5, 6), '5/6', false]);
  r = op('add', [3, 4], [3, 4]); assert.deepEqual([r.raw, r.simple, r.mixed, r.more], [f(6, 4), f(3, 2), '1 1/2', true]);
  r = op('add', [1, 4], [1, 6]); assert.equal(r.L, 12, 'the least common denominator, not 24'); assert.deepEqual(r.raw, f(5, 12));
  r = op('add', [2, 4], [1, 2]); assert.deepEqual([r.raw, r.simple, r.mixed, r.whole], [f(4, 4), f(1, 1), '1', true]);
  r = op('add', [7, 11], [5, 12]); assert.deepEqual([r.L, r.raw, r.mixed], [132, f(139, 132), '1 7/132']);
  // subtract, below zero: the minus is on the answer, never lost
  r = op('sub', [3, 4], [1, 3]); assert.deepEqual([r.raw, r.mixed, r.negative], [f(5, 12), '5/12', false]);
  r = op('sub', [1, 3], [1, 2]); assert.deepEqual([r.raw, r.simple, r.mixed, r.negative], [f(-1, 6), f(-1, 6), '−1/6', true]);
  r = op('sub', [1, 2], [7, 3]); assert.equal(r.mixed, '−1 5/6');
  r = op('sub', [2, 5], [2, 5]); assert.deepEqual([r.simple, r.mixed, r.negative], [f(0, 1), '0', false]);
  // multiply: whole numbers (n/1) work
  r = op('mul', [2, 3], [3, 4]); assert.deepEqual([r.raw, r.simple, r.mixed], [f(6, 12), f(1, 2), '1/2']);
  r = op('mul', [3, 1], [2, 3]); assert.deepEqual([r.raw, r.mixed, r.whole], [f(6, 3), '2', true]);
  r = op('mul', [3, 1], [2, 1]); assert.equal(r.mixed, '6');
  r = op('mul', [0, 5], [3, 4]); assert.equal(r.mixed, '0');
  // divide: a/b × d/c; how many of the second fit in the first
  r = op('div', [3, 4], [1, 4]); assert.deepEqual([r.flip, r.raw, r.mixed], [f(4, 1), f(12, 4), '3']);
  r = op('div', [3, 4], [1, 2]); assert.deepEqual([r.L, r.a2, r.b2, r.raw, r.mixed], [4, f(3, 4), f(2, 4), f(6, 4), '1 1/2']);
  r = op('div', [1, 2], [3, 4]); assert.equal(r.mixed, '2/3');
  r = op('div', [2, 1], [1, 3]); assert.equal(r.mixed, '6');
  r = op('div', [3, 4], [0, 5]); assert.ok(r.guarded, 'nothing is divided by zero'); assert.deepEqual(r.b, f(1, 5)); assert.equal(r.mixed, '3 3/4');
  for (const o of Object.keys(M.OPS)) for (let i = 0; i < 400; i++) {
    // every answer is exact: compared with the same sum in floating point
    const a = M.clampOperand(f(i % 13, 1 + (i % 12))), b = M.clampOperand(f((i * 7) % 13, 1 + ((i * 5) % 12)));
    const x = M.operate(o, a, b), va = a.n / a.d, vb = x.b.n / x.b.d;
    const want = { add: va + vb, sub: va - vb, mul: va * vb, div: va / vb }[o];
    assert.ok(Math.abs(x.simple.n / x.simple.d - want) < 1e-9, `${o} ${a.n}/${a.d} ${b.n}/${b.d}`);
    assert.equal(M.gcd(x.simple.n, x.simple.d), 1, 'lowest terms');
  }
  // the operands' limits: bottom 1-12, top 0-12 and at most three wholes
  assert.deepEqual(M.clampOperand(f(99, 1)), f(3, 1)); assert.deepEqual(M.clampOperand(f(-4, 40)), f(0, 12)); assert.deepEqual(M.clampOperand(f(5, 0)), f(3, 1));
  assert.deepEqual(M.mixedParts(f(-7, 6)), { sign: -1, whole: 1, n: 1, d: 6 }); assert.equal(M.mixedText(f(8, 4)), '2'); assert.equal(M.fracRaw(f(-1, 6)), '−1/6');
  assert.deepEqual(M.FRACTION_MODES, ['compare', 'add', 'sub', 'mul', 'div']);
  // the browser's starting fractions are the server's
  const st = DT.cleanToolState('fractions', { mode: 'add' });
  assert.deepEqual([st.a, st.b], [M.OP_START.a, M.OP_START.b]);
});

test('fractions: the new state (mode, a, b) is rebuilt on the server; layouts saved before it load unchanged', () => {
  const c = DT.cleanToolState;
  const old = { shape: 'circle', bars: [{ n: 2, d: 3 }, { n: 6, d: 6 }], same: true, hide: false };
  assert.deepEqual(c('fractions', old), old, 'an old Compare state comes back exactly as it was');
  assert.deepEqual(c('fractions', { ...old, mode: 'compare', a: { n: 1, d: 2 }, b: { n: 1, d: 3 } }), old, 'Compare with the starting fractions is stored in the old shape');
  const s = c('fractions', { ...old, mode: 'add', a: { n: 30, d: 0 }, b: { n: -3, d: 99, evil: 1 }, x: 1 });
  assert.deepEqual([s.mode, s.a, s.b], ['add', { n: 3, d: 1 }, { n: 0, d: 12 }]);
  assert.deepEqual(c('fractions', s), s, 'cleaning is stable');
  assert.deepEqual(c('fractions', { mode: 'compare', a: { n: 2, d: 5 } }).a, { n: 2, d: 5 }, 'a teacher\'s fractions are kept while comparing');
  assert.equal(c('fractions', { mode: 'pow' }).mode, undefined, 'an unknown mode is Compare');
  assert.deepEqual(c('fractions', { mode: 'div', b: { n: 0, d: 4 } }).b, { n: 1, d: 4 }, 'never divide by zero');
  assert.deepEqual(c('fractions', { mode: 'mul', a: 'x', b: [1, 2] }).a, { n: 1, d: 2 });
  assert.equal(c('fractions', { mode: 'sub', a: { n: 12, d: 12 } }).a.n, 12);
  assert.equal(c('fractions', { mode: 'sub', a: { n: 12, d: 2 } }).a.n, 6, 'at most three wholes');
});

test('fractions: "Make a question" from each mode, the right answer in lowest terms, no wrong answer worth the same', async () => {
  const A = await import('../../public/js/dash-ask.js');
  const reg = D.registryFor(tFor('en'), 'teacher'), W2 = reg.types.find(x => x.id === 'fractions').words;
  const ask = (st, lang = 'en') => A.questionFor('fractions', { ...DT.cleanToolState('fractions', {}), ...st }, W2, D.registryFor(tFor(lang), 'teacher').ask, lang);
  const cases = [
    [{ mode: 'compare', bars: [{ n: 3, d: 8 }] }, 'What fraction is shaded?', '3/8'],
    [{ mode: 'add', a: f(1, 2), b: f(1, 3) }, 'What is 1/2 + 1/3?', '5/6', '2/5'],
    [{ mode: 'add', a: f(3, 4), b: f(3, 4) }, 'What is 3/4 + 3/4?', '1 1/2'],
    [{ mode: 'sub', a: f(1, 3), b: f(1, 2) }, 'What is 1/3 − 1/2?', '−1/6', '1/6'],
    [{ mode: 'mul', a: f(2, 3), b: f(3, 4) }, 'What is 2/3 × 3/4?', '1/2', '5/7'],
    [{ mode: 'mul', a: f(3, 1), b: f(2, 1) }, 'What is 3/1 × 2/1?', '6'],
    [{ mode: 'div', a: f(3, 4), b: f(1, 2) }, 'What is 3/4 ÷ 1/2?', '1 1/2', '3/8'],
    [{ mode: 'div', a: f(3, 4), b: f(1, 4) }, 'What is 3/4 ÷ 1/4?', '3'],
  ];
  const value = t => { const m = /^(−?)(?:(\d+) )?(\d+)(?:\/(\d+))?$/.exec(t); const s = m[1] ? -1 : 1; return m[4] ? s * ((+m[2] || 0) + m[3] / m[4]) : s * (+m[2] || 0) + s * +m[3] * (m[2] ? 0 : 1); };
  for (const [st, q, right, wrong] of cases) {
    const made = ask(st);
    assert.equal(made.q, q); assert.equal(made.options[made.answer], right, q);
    assert.ok(made.options.length >= 2 && made.options.length <= 4, q);
    if (wrong) assert.ok(made.options.includes(wrong), `${q}: the usual slip ${wrong} is offered`);
    const v = value(right);
    made.options.forEach((o, i) => { if (i !== made.answer) assert.ok(Math.abs(value(o) - v) > 1e-9, `${q}: ${o} is not worth the same as ${right}`); });
    assert.deepEqual(ask(st), made, 'the same state makes the same question');
  }
  // "Hide the answer" never changes the question; the words follow the language.
  assert.equal(ask({ mode: 'div', a: f(3, 4), b: f(1, 2) }, 'it').q, 'Quanto fa 3/4 ÷ 1/2?');
  assert.deepEqual(ask({ mode: 'add', a: f(1, 2), b: f(1, 3), hide: true }).options.sort(), ask({ mode: 'add', a: f(1, 2), b: f(1, 3) }).options.sort());
});

test('fraction, decimal, percent: exact, with repeating decimals shown sensibly', () => {
  assert.equal(M.decimalString(1, 3), '0.333…'); assert.equal(M.percentString(1, 3), '33.3…%');
  assert.equal(M.decimalString(2, 3), '0.666…'); assert.equal(M.percentString(2, 3), '66.6…%');
  assert.equal(M.decimalString(1, 6), '0.1666…'); assert.equal(M.percentString(1, 6), '16.6…%');
  assert.equal(M.decimalString(1, 11), '0.0909…'); assert.equal(M.decimalString(1, 7), '0.142857…'); assert.equal(M.percentString(1, 7), '14.285714…%');
  assert.equal(M.decimalString(3, 8), '0.375'); assert.equal(M.percentString(3, 8), '37.5%'); assert.equal(M.percentString(1, 8), '12.5%');
  assert.equal(M.decimalString(1, 4), '0.25'); assert.equal(M.percentString(1, 4), '25%'); assert.equal(M.decimalString(4, 4), '1'); assert.equal(M.percentString(4, 4), '100%');
  assert.equal(M.decimalString(0, 5), '0'); assert.equal(M.percentString(0, 5), '0%'); assert.equal(M.decimalString(7, 20), '0.35');
  assert.deepEqual(M.decimalParts(1, 12), { int: 0, nonrep: '08', rep: '3' }); assert.equal(M.decimalString(1, 12), '0.08333…');
  assert.deepEqual(M.hundredGrid(1, 4), { full: 25, part: 0 }); assert.deepEqual(M.hundredGrid(3, 8), { full: 37, part: 0.5 });
  const third = M.hundredGrid(1, 3); assert.equal(third.full, 33); assert.ok(Math.abs(third.part - 1 / 3) < 1e-9);
});

test('sending a tool: the teacher\'s own tool only, its state rebuilt; every student opens their own copy; nothing comes back', async () => {
  const w = world();
  await layout(w, [{ id: 'fr1', type: 'fractions', s: { state: { bars: [{ n: 3, d: 4 }, { n: 5, d: 8 }] } } }, { id: 'tx1', type: 'text' }]);
  const A = w.A.id;
  const r = await as(w.T)(`/api/dash/${A}/pushes`, POST({ kind: 'tool', ref: 'fr1', state: { bars: [{ n: 2, d: 3 }, { n: 40, d: 6 }], same: true, steal: 'x' } }));
  assert.equal(r.status, 200, r.text);
  const live = (await as(w.a1)(`/api/dash/${A}/live`)).json;
  const p = live.pushes.find(x => x.kind === 'tool');
  assert.equal(p.href, `#tool-${p.id}`); assert.equal(p.title, '');
  assert.deepEqual(p.tool, { type: 'fractions', state: { shape: 'bar', bars: [{ n: 2, d: 3 }, { n: 6, d: 6 }], same: true, hide: false } });
  // The same copy for every student; the push holds no student data.
  assert.deepEqual((await as(w.a2)(`/api/dash/${A}/live`)).json.pushes.find(x => x.kind === 'tool').tool, p.tool);
  assert.doesNotMatch(q.get('SELECT data FROM dash_pushes WHERE id=?', p.id).data, new RegExp(`${w.a1.id}|${w.a2.id}`));
  // Without a state the tool goes as it is saved.
  await as(w.T)(`/api/dash/${A}/pushes`, POST({ kind: 'tool', ref: 'fr1' }));
  assert.deepEqual((await as(w.a1)(`/api/dash/${A}/live`)).json.pushes[0].tool.state.bars, [{ n: 3, d: 4 }, { n: 5, d: 8 }]);
  // Only a tool on this teacher's own layout; not a text widget, not someone else's.
  for (const ref of ['tx1', 'nope', '']) assert.equal((await as(w.T)(`/api/dash/${A}/pushes`, POST({ kind: 'tool', ref }))).status, 400, ref);
  for (const who of [w.a1, w.T2, w.SA, w.b1, w.stranger]) assert.equal((await as(who)(`/api/dash/${A}/pushes`, POST({ kind: 'tool', ref: 'fr1' }))).status, 404, who.username);
  assert.equal((await as(w.T)(`/api/dash/${A}/pushes`, { ...POST({ kind: 'tool', ref: 'fr1' }), headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
  // A student pins their copy: it is one of their own widgets, its state rebuilt; another student never sees it.
  const mine = await as(w.a1)(`/api/dash/${A}/me`, POST({ widgets: [{ id: 'my1', type: 'fractions', x: 0, y: 0, w: 6, h: 4, s: { state: { bars: [{ n: 1, d: 99 }] } } }] }));
  assert.equal(mine.status, 200, mine.text);
  assert.deepEqual(mine.json.state.widgets[0].s.state.bars, [{ n: 1, d: 12 }]);
  assert.ok(!(await as(w.a2)(`/class/${A}/dashboard`)).text.includes('my1'));
  assert.ok(!(await as(w.T)(`/api/dash/${A}/live`)).text.includes('my1'));
});

test('a teacher working a tool saves the layout, but students\' screens redraw only when the pins really change', async () => {
  const w = world();
  await layout(w, [{ id: 'nl1', type: 'numline', x: 0, y: 0, w: 8, h: 3 }, { id: 'tx1', type: 'text', x: 0, y: 3, w: 4, h: 3, pin: true }]);
  const before = D.classState(w.A.id).pins_at;
  const l = D.layoutsOf(w.A.id, w.T.id)[0];
  await new Promise(r => setTimeout(r, 5));
  D.updateLayout(w.T, w.A, l.id, { widgets: [{ id: 'nl1', type: 'numline', x: 0, y: 0, w: 8, h: 3, s: { state: { points: [3] } } }, { id: 'tx1', type: 'text', x: 0, y: 3, w: 4, h: 3, pin: true }] });
  assert.equal(D.classState(w.A.id).pins_at, before, 'a tool\'s state is not a pin');
  D.updateLayout(w.T, w.A, l.id, { widgets: [{ id: 'tx1', type: 'text', x: 0, y: 3, w: 4, h: 3, s: { body: 'Hi' }, pin: true }] });
  assert.ok(D.classState(w.A.id).pins_at > before);
});

test('the Picture widget: the teacher uploads (stage 1 checks, no AI); students see it only while it is pinned with a description', async () => {
  const w = world(), A = w.A.id;
  await as(w.T)(`/class/${A}/dashboard`);
  // Students never upload a Picture-widget picture; the file checks are the profile photo's.
  assert.equal((await as(w.a1)(`/api/dash/${A}/pictures?use=show`, { method: 'POST', raw: jpeg() })).status, 404);
  assert.equal((await as(w.T2)(`/api/dash/${A}/pictures?use=show`, { method: 'POST', raw: jpeg() })).status, 404);
  assert.equal((await as(w.T)(`/api/dash/${A}/pictures?use=show`, { method: 'POST', raw: Buffer.from('<svg onload=alert(1)>'), type: 'image/svg+xml' })).status, 400);
  assert.equal((await as(w.T)(`/api/dash/${A}/pictures?use=show`, { method: 'POST', raw: jpeg(4000, 3000) })).status, 400);
  const up = await as(w.T)(`/api/dash/${A}/pictures?use=show`, { method: 'POST', raw: jpeg() });
  assert.equal(up.status, 200, up.text);
  const pid = up.json.id, url = `/dash/pictures/${pid}`;
  const file = fs.readFileSync(D.picFile(pid));
  assert.ok(!file.includes(Buffer.from('GPSLatitude')), 'metadata removed');
  assert.equal(D.getPicture(pid).use, 'show');
  // Not shown yet: students get 404.
  assert.equal((await as(w.T)(url)).status, 200);
  assert.equal((await as(w.a1)(url)).status, 404);
  // Pinned without a description: still nobody's but the teacher's, and it isn't in the pins.
  await layout(w, [{ id: 'pc', type: 'picture', s: { pic: pid, alt: '' }, pin: true }]);
  assert.deepEqual(D.pinsOf(A), []);
  assert.equal((await as(w.a1)(url)).status, 404);
  // Pinned with a description: the class's students may fetch it; nobody else.
  await layout(w, [{ id: 'pc', type: 'picture', s: { pic: pid, alt: 'A fraction anchor chart', fit: 'cover' }, pin: true }]);
  assert.equal(D.pinsOf(A)[0].s.pic, pid);
  for (const who of [w.a1, w.a2]) assert.equal((await as(who)(url)).status, 200, who.username);
  for (const who of [w.b1, w.T2, w.SA, w.stranger]) assert.equal((await as(who)(url)).status, 404, who.username);
  assert.equal((await as(null)(url)).status, 404);
  // Unpinned: gone for students again.
  await layout(w, [{ id: 'pc', type: 'picture', s: { pic: pid, alt: 'A fraction anchor chart' } }]);
  assert.equal((await as(w.a1)(url)).status, 404);
  // A picture widget can't show someone else's picture or a background; a background never reaches a student.
  const bgPic = (await as(w.T)(`/api/dash/${A}/pictures`, { method: 'POST', raw: jpeg() })).json.id;
  const otherPic = D.savePicture(w.T2, w.B, jpeg(), { use: 'show' }).id;
  const lay = await layout(w, [{ id: 'p1', type: 'picture', s: { pic: bgPic, alt: 'x' }, pin: true }, { id: 'p2', type: 'picture', s: { pic: otherPic, alt: 'x' }, pin: true }]);
  assert.deepEqual(lay.widgets.map(x => x.s.pic), ['', '']);
  assert.equal((await as(w.a1)(`/dash/pictures/${bgPic}`)).status, 404);
  // A picture can't be a background, and a background upload keeps working as before.
  const l = D.layoutsOf(A, w.T.id)[0];
  assert.deepEqual(D.updateLayout(w.T, w.A, l.id, { bg: { kind: 'pic', id: pid } }).layout.bg, D.DEFAULT_BG);
  assert.equal(D.updateLayout(w.T, w.A, l.id, { bg: { kind: 'pic', id: bgPic } }).layout.bg.id, bgPic);
  // The newest 12 shown pictures are kept, apart from backgrounds.
  for (let i = 0; i < 14; i++) D.savePicture(w.T, w.A, jpeg(), { use: 'show' });
  assert.equal(q.get("SELECT COUNT(*) n FROM dash_pictures WHERE owner_id=? AND class_id=? AND use='show'", w.T.id, A).n, D.SHOW_PICS_KEPT);
  assert.ok(D.getPicture(bgPic), 'the background is kept');
});

test('safety: no AI, drawings and tool states never leave the browser by themselves, no prices, no real names', async () => {
  for (const file of ['public/js/dash-tools.js', 'public/js/dash-math.js', 'server/services/dash-tools.js'])
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /anthropic|screenPhoto|ai-budget|lesson-ai|\bclaude\b|openai/i, file);
  // The tools and the whiteboard have no network, storage or recorder code at all: what leaves goes through dash.js's
  // ctx.keep / ctx.send / ctx.upload, which the whiteboard never calls.
  const tools = fs.readFileSync('public/js/dash-tools.js', 'utf8'), math = fs.readFileSync('public/js/dash-math.js', 'utf8');
  for (const src of [tools, math]) for (const bad of [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /WebSocket/, /EventSource/, /localStorage|sessionStorage|indexedDB/, /from '\/js\/app\.js'/, /MediaRecorder|getUserMedia/, /toDataURL|toBlob/])
    assert.doesNotMatch(src, bad, String(bad));
  const boardSrc = tools.slice(tools.indexOf('function board('), tools.indexOf('function picture('));
  assert.doesNotMatch(boardSrc, /ctx\.(keep|send|set|upload|act|get)\b/, 'the whiteboard keeps its drawings in this page only');
  assert.match(boardSrc, /const boards = new Map\(\)|boards\.get/);
  assert.doesNotMatch(math, /\bimport\b/, 'the maths imports nothing');
  // No selling words in any stage 3 string.
  const en = JSON.parse(fs.readFileSync('server/i18n/locales/en.json', 'utf8'));
  const money = /\$\s?\d|€\s?\d|£\s?\d|\/plans|upgrade|free trial|Teacher plan|School plan|pricing|\bPro\b|Explorer/i;
  for (const id of [...TOOLS, 'board', 'picture']) assert.doesNotMatch(JSON.stringify(en.dash.w[id]), money, id);
  assert.doesNotMatch(JSON.stringify(en.dash.tools), money);
  // A student's screen with a sent tool carries no real names.
  const w = world();
  await layout(w, [{ id: 'gr', type: 'graph' }]);
  await as(w.T)(`/api/dash/${w.A.id}/pushes`, POST({ kind: 'tool', ref: 'gr', state: { title: 'Pets', rows: [{ l: 'Dogs', v: 4 }] } }));
  for (const who of [w.a1, w.a2]) { const page = (await as(who)(`/class/${w.A.id}/dashboard`)).text; assert.doesNotMatch(page, w.REAL); assert.doesNotMatch(page, money); }
});

test('every stage 3 string is translated into every locale', async () => {
  const { checkAll } = await import('../../server/i18n/check.js');
  const r = checkAll();
  const keys = Object.keys(r.en).filter(k => new RegExp(`^dash\\.w\\.(${[...TOOLS, 'board', 'picture'].join('|')})\\.|^dash\\.tools\\.|^dash\\.groups\\.teach$|^dash\\.errors\\.tool$|^js\\.dash\\.(kind\\.tool|act\\.open|tools\\.)`).test(k));
  assert.ok(keys.length > 220, String(keys.length));
  for (const l of r.locales) {
    if (l.code === 'en-GB') continue;
    assert.deepEqual(l.missing.filter(k => keys.includes(k)), [], l.code);
    assert.deepEqual([...l.placeholderErrors, ...l.parseErrors, ...l.extra], [], l.code);
  }
});
