// Classroom dashboards, stage 4 (services/dash.js, services/dash-tools.js, public/js/dash-math4.js, public/js/dash-ask.js,
// public/js/dash-tools4.js): teaching tools part 2. The maths behind every tool (Pick's theorem and exact perimeters,
// angle names, nets and their faces, edges and vertices, transformations, balance steps, algebra tiles, coins and change,
// chances), the server-side rebuilding of every tool's state, "Make a question from it" (a stage 2 quick check built
// from the tool), "Practice it" (official games only, and only ones every student can open), sending a tool to students,
// and the safety rules (no AI, no free text between players, nothing a student does comes back, no prices, no real names).
import fs from 'node:fs';
import os from 'node:os';
process.env.BRB_DB = ':memory:'; process.env.BRB_SILENT = '1'; process.env.LOG_REQUESTS = '0';
process.env.BRB_DATA_DIR = fs.mkdtempSync(os.tmpdir() + '/brb-dash4-');
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q, MIGRATIONS } = await import('../../server/db.js');
const { createUser, startSession, getUser, OFFICIAL } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const games = await import('../../server/services/games.js');
const D = await import('../../server/services/dash.js');
const DT = await import('../../server/services/dash-tools.js');
const M = await import('../../public/js/dash-math.js');
const G = await import('../../public/js/dash-math4.js');
const A = await import('../../public/js/dash-ask.js');
const W = await import('../../public/js/dash-widgets.js');
const { createApp } = await import('../../server/app.js');
const { tFor } = await import('../../server/i18n/index.js');

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = who => async (p, { method = 'GET', body, headers: extra = {} } = {}) => {
  const headers = { ...(who ? { cookie: cookieFor(who.id) } : {}), ...extra };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + p, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json };
};
const POST = (body = {}) => ({ method: 'POST', body });
const pageData = html => JSON.parse(/<script[^>]*id="page-data"[^>]*>([\s\S]*?)<\/script>/.exec(html)[1].replace(/\\u003c/g, '<'));

const boss = createUser({ username: 'Dash4Boss', password: 'secret123', role: 'admin' });
let worlds = 0;
function world() {
  const k = ++worlds;
  const oak = S.createSchool(boss, { name: `Dash4 Oak ${k}` }).school;
  const T = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Tia Teacher', role: 'teacher' }).user.id);
  const T2 = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Tom Other', role: 'teacher' }).user.id);
  const A1 = S.createClass(T, oak.id, { name: '5A' }).class, B1 = S.createClass(T2, oak.id, { name: '5B' }).class;
  const kid = (name, c) => { const u = S.createSchoolAccount(T, oak.id, { rosterName: name }).user; if (c) S.addToClass(boss, c.id, u.id); return getUser(u.id); };
  const a1 = kid('Ada Apple', A1), a2 = kid('Abe Acorn', A1), b1 = kid('Bea Bloom', B1);
  const stranger = createUser({ username: `Dash4Str${k}`, password: 'secret123' });
  return { oak, T, T2, A: A1, B: B1, a1, a2, b1, stranger, REAL: /Ada Apple|Abe Acorn|Bea Bloom|Tia Teacher/ };
}
async function layout(w, widgets) {
  await as(w.T)(`/class/${w.A.id}/dashboard`);
  const l = D.layoutsOf(w.A.id, w.T.id)[0];
  const r = await as(w.T)(`/api/dash/${w.A.id}/layouts/${l.id}`, POST({ widgets }));
  assert.equal(r.status, 200, r.text);
  return r.json.layout;
}
const TOOLS4 = ['geoboard', 'pattern', 'angle', 'solids', 'transform', 'balance', 'algebra', 'coins', 'chance', 'letters', 'organizer', 'map'];
const STAGE3 = ['fractions', 'numline', 'coord', 'graph', 'base10', 'placeval', 'tenframe', 'hundreds', 'area', 'times', 'tclock', 'fdp'];
/** Maths tools combined (docs/decisions.md): angle, solids, transform and balance are modes of the shape board, geometry
 *  and algebra now; their words come with their mode in the registry. */
const LIVE4 = TOOLS4.filter(id => !DT.MODE_HOME[id]);
const wordsOf = (reg, id) => (reg.types.find(x => x.id === id) || reg.types.flatMap(x => x.modes || []).find(m => m.id === id && m.words)).words;
const P = (...xy) => { const out = []; for (let i = 0; i < xy.length; i += 2) out.push({ x: xy[i], y: xy[i + 1] }); return out; };

test('no new migration: stage 4 keeps its state in the widget and the push (0080 is still the newest)', () => {
  const names = MIGRATIONS.map(m => m[0]);
  assert.equal(names[names.indexOf('0080_dash_teaching_tools') + 1], '0081_dash_class_tools', 'the next one is stage 5\'s (tests/unit/dash-stage5.test.js)');
});

test('the registry: every stage 4 tool has a renderer, a group, English words, and is sent, never pinned', () => {
  const t = tFor('en'), reg = D.registryFor(t, 'teacher');
  assert.ok(reg.groups.some(g => g.id === 'words' && g.name === 'Words and maps'));
  for (const id of TOOLS4.filter(id => DT.MODE_HOME[id])) {
    // A retired tool is a mode of another: still drawn by its own renderer, its words with its mode.
    assert.equal(D.widgetType(id), null, id); assert.equal(typeof W.RENDER[id], 'function', `renderer for ${id}`);
    const home = reg.types.find(y => y.id === DT.MODE_HOME[id]), m = home.modes.find(y => y.id === id);
    assert.ok(m && !/^dash\./.test(m.name), id); for (const [k, v] of Object.entries(m.words)) assert.ok(!/^dash\./.test(v), `${id}.${k}`);
    assert.deepEqual(m.def, DT.cleanToolState(id, {}));
  }
  for (const id of LIVE4) {
    const x = D.widgetType(id);
    assert.ok(x, id); assert.equal(typeof W.RENDER[id], 'function', `renderer for ${id}`);
    assert.equal(x.group, ['letters', 'organizer', 'map'].includes(id) ? 'words' : 'teach', id);
    assert.equal(x.who, 'both'); assert.equal(D.canPin(x), false); assert.equal(x.send, true);
    assert.deepEqual(x.settings[0].def, DT.cleanToolState(id, {}));
    assert.ok(x.min[0] <= x.size[0] && x.min[1] <= x.size[1], id);
    const r = reg.types.find(y => y.id === id);
    assert.ok(!/^dash\./.test(r.name) && !/^dash\./.test(r.desc), id);
    for (const [k, v] of Object.entries(r.words)) assert.ok(!/^dash\./.test(v), `${id}.${k}`);
  }
  for (const v of [...Object.values(reg.common), ...Object.values(reg.ask.q)]) assert.ok(!/^dash\./.test(v), v);
  assert.deepEqual(Object.keys(reg.ask.q).sort(), [...D.ASK_KEYS].sort());
  // Students may add every tool (their own copy); a teacher can never pin one.
  assert.deepEqual(D.cleanWidgets(TOOLS4.map((type, i) => ({ id: `s${i}`, type })), 'student').map(x => x.type), TOOLS4.map(id => DT.MODE_HOME[id] || id));
  assert.deepEqual(D.cleanWidgets(TOOLS4.map((type, i) => ({ id: `p${i}`, type, pin: true })), 'teacher').filter(x => x.pin), []);
  // The server's lists match the browser's maths.
  assert.deepEqual(DT.TOOL_SPECS.pattern.spec.blocks[2].k[1], G.BLOCK_KINDS);
  assert.deepEqual(DT.TOOL_SPECS.solids.spec.shape[1], G.SOLID_KINDS);
  assert.deepEqual(DT.TOOL_SPECS.transform.spec.shape[1], Object.keys(G.SHAPES));
  assert.deepEqual(DT.TOOL_SPECS.letters.spec.fam[1].slice(1), G.FAMILY_IDS);
  assert.deepEqual(DT.TOOL_SPECS.coins.spec.cur[1].slice(1), G.CURRENCY_IDS);
});

test('every stage 4 state is rebuilt on the server: unknown keys go, numbers clamp, lists are cut, rules kept, text cleaned', () => {
  const c = DT.cleanToolState;
  for (const id of TOOLS4) { const s = c(id, { evil: '<script>', __proto__: { x: 1 } }); assert.ok(s && !('evil' in s), id); assert.deepEqual(c(id, s), s, `${id}: cleaning is stable`); assert.deepEqual(c(id, JSON.parse(JSON.stringify(s))), s); }
  // geoboard: pegs on the board, no repeated neighbours, a band back at its start is closed, fewer than 3 pegs is open
  const gb = c('geoboard', { pegs: 5, cur: 9, bands: [{ pts: P(0, 0, 0, 0, 4, 0, 9, 9, 4, 4, 0, 0) }, { pts: P(1, 1, 2, 2), closed: true }, ...Array(9).fill({ pts: [] })] });
  assert.deepEqual(gb.bands[0], { pts: P(0, 0, 4, 0, 4, 4), closed: true });
  // The shape board (docs/decisions.md "Shape board") keeps up to 12 bands (it was 6): these 11 all stay, and so does cur.
  assert.equal(gb.bands[1].closed, false); assert.equal(gb.bands.length, 11); assert.equal(gb.cur, 9);
  assert.equal(c('geoboard', { bands: Array(20).fill({ pts: [] }), cur: 30 }).bands.length, 12);
  assert.equal(c('geoboard', { pegs: 8 }).pegs, 7);
  assert.equal(c('geoboard', { bands: [{ pts: Array.from({ length: 40 }, (_, i) => ({ x: i % 7, y: Math.floor(i / 7) })) }] }).bands[0].pts.length, 16);
  // pattern blocks: on the triangle grid (x + y even), at most 40, a known kind
  const pb = c('pattern', { blocks: [{ k: 'star', x: 3, y: 4, r: 99 }, ...Array(50).fill({ k: 'tri', x: 2, y: 2 })] });
  assert.deepEqual(pb.blocks[0], { k: 'hex', x: 4, y: 4, r: 11 }); assert.equal(pb.blocks.length, 40);
  // angle, solids, transformations
  assert.deepEqual(c('angle', { a: 999, step: 7 }), { a: 360, proto: true, step: 5, arc: true });
  assert.deepEqual(c('solids', { shape: 'sphere', fold: -5, yaw: 400 }), { shape: 'cube', fold: 0, yaw: 359, mark: 'none' });
  const tr = c('transform', { shape: 'arrow', ox: 7, oy: -20, op: 'shear', dx: 40, turn: 45 });
  assert.equal(tr.ox, 3, 'the arrow (5 wide) stays on the grid'); assert.equal(tr.oy, -9); assert.equal(tr.op, 'translate'); assert.equal(tr.dx, 8); assert.equal(tr.turn, 90);
  // balance: whole numbers within the scale, a history of at most 12 steps
  const bl = c('balance', { x: 0, lx: 20, lu: -3, rx: 1.4, ru: 99, hist: Array(20).fill({ op: 'rm -rf', lx: 99 }) });
  assert.deepEqual([bl.x, bl.lx, bl.lu, bl.rx, bl.ru], [1, 9, 0, 1, 30]); assert.equal(bl.hist.length, 12); assert.equal(bl.hist[0].op, 'new'); assert.equal(bl.hist[0].lx, 9);
  // algebra tiles: at most 36, only x², x and 1
  const at = c('algebra', { tiles: [{ k: 'y', neg: 'yes' }, ...Array(50).fill({ k: 'x2', neg: true })] });
  assert.deepEqual(at.tiles[0], { k: 'x', neg: false }); assert.equal(at.tiles.length, 36);
  // coins: one count per coin or note of the currency, 0-20 each
  assert.deepEqual(c('coins', { cur: 'gen', counts: [99, -1, 3, 4, 5, 6, 7, 8, 9] }).counts, [20, 0, 3, 4, 5, 6, 7]);
  assert.equal(c('coins', { cur: 'usd' }).counts.length, G.denoms('usd').length);
  assert.equal(c('coins', { cur: 'eur' }).counts.length, G.denoms('eur').length);
  assert.equal(c('coins', { cost: 1e9 }).cost, 10000);
  // chance: one count per outcome; runs 1-1000
  assert.equal(c('chance', { kind: 'dice', dice: 2, counts: [1, 2] }).counts.length, 11);
  assert.deepEqual(c('chance', { kind: 'spinner', parts: 3, counts: [5, 6, 7, 8, 9] }).counts, [5, 6, 7]);
  assert.equal(c('chance', { runs: 5000 }).runs, 1000); assert.equal(c('chance', { runs: 0 }).runs, 1);
  // letters: indexes of a-z only (nothing typed), at most 12; a family keeps at most two letters in front
  assert.deepEqual(c('letters', { word: [0, 99, -1, 'x', 4], fam: '' }).word, [0, 25, 0, 4]);
  assert.deepEqual(c('letters', { word: [1, 2, 3, 4], fam: 'at' }).word, [1, 2]);
  assert.equal(c('letters', { fam: 'ass' }).fam, 'at');
  assert.equal(c('letters', { word: 'hello' }).word.length, 1, 'a string is not a word: the default stays');
  // organizer: the teacher's text, cleaned (lines kept, control and direction characters gone), its boxes fitting its kind
  const og = c('organizer', { kind: 'kwl', title: `Frogs‮\u0007${'x'.repeat(90)}`, boxes: [{ h: 'K\u0000now', t: 'one\r\ntwo\n\n\n\nthree\u0007⁦' + 'z'.repeat(500) }, { t: 'w' }, { t: 'l' }, { t: 'extra' }] });
  assert.equal(og.boxes.length, 3); assert.equal([...og.title].length, 60); assert.doesNotMatch(og.title, /[‮\u0007]/);
  assert.equal(og.boxes[0].h, 'Know'); assert.match(og.boxes[0].t, /^one\ntwo\n\nthreez/); assert.equal([...og.boxes[0].t].length, 400); assert.doesNotMatch(og.boxes[0].t, /[\r\u0007⁦]/);
  assert.equal(c('organizer', { kind: 'seq', n: 6 }).boxes.length, 6);
  assert.equal(c('organizer', { kind: 'venn', n: 6 }).boxes.length, 3);
  // map: pins on the map, at most 12, short labels
  const mp = c('map', { kind: 'moon', pins: [{ x: -50, y: 9999, l: `Home‮${'y'.repeat(40)}` }, ...Array(20).fill({ x: 1, y: 1 })] });
  assert.equal(mp.kind, 'world'); assert.equal(mp.pins.length, 12); assert.deepEqual([mp.pins[0].x, mp.pins[0].y], [0, 500]); assert.equal([...mp.pins[0].l].length, 24); assert.doesNotMatch(mp.pins[0].l, /‮/);
});

test('geoboard: Pick\'s theorem gives the exact area, the pegs inside and on the band match a count; perimeters are exact', () => {
  // A brute-force count of pegs strictly inside and on the boundary, to check I and B.
  const count = pts => {
    let I = 0, B = 0;
    const onEdge = (x, y) => pts.some((a, i) => { const b = pts[(i + 1) % pts.length]; return (b.x - a.x) * (y - a.y) === (b.y - a.y) * (x - a.x) && Math.min(a.x, b.x) <= x && x <= Math.max(a.x, b.x) && Math.min(a.y, b.y) <= y && y <= Math.max(a.y, b.y); });
    const inside = (x, y) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [a, b] = [pts[i], pts[j]]; if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c; } return c; };
    for (let x = 0; x <= 10; x++) for (let y = 0; y <= 10; y++) { if (onEdge(x, y)) B++; else if (inside(x, y)) I++; }
    return { I, B };
  };
  const shapes = [P(0, 0, 3, 0, 3, 3, 0, 3), P(0, 0, 4, 0, 0, 3), P(1, 0, 2, 1, 1, 2, 0, 1), P(1, 1, 4, 1, 5, 3, 2, 3), P(1, 1, 8, 2, 9, 7, 3, 9, 2, 5), P(0, 0, 6, 0, 6, 1, 1, 1, 1, 5, 0, 5), P(2, 0, 4, 3, 0, 5)];
  for (const s of shapes) {
    assert.ok(G.isSimple(s), JSON.stringify(s));
    const p = G.pick(s), b = count(s);
    assert.equal(p.B, b.B, `B of ${JSON.stringify(s)}`); assert.equal(p.I, b.I, `I of ${JSON.stringify(s)}`);
    assert.equal(p.a2, 2 * p.I + p.B - 2, 'A = I + B/2 − 1');
  }
  assert.deepEqual(G.pick(P(0, 0, 3, 0, 3, 3, 0, 3)), { a2: 18, B: 12, I: 4 });
  assert.equal(G.mixed(G.pick(P(0, 0, 4, 0, 0, 3)).a2, 2), '6');
  assert.equal(G.mixed(G.pick(P(2, 0, 4, 3, 0, 5)).a2, 2), '8');
  assert.equal(G.mixed(G.pick(P(0, 0, 1, 0, 0, 1)).a2, 2), '1/2');
  assert.equal(G.mixed(9, 2), '4 1/2');
  // Exact perimeters: whole sides, and roots simplified and gathered.
  assert.deepEqual(G.sqrtParts(8), { k: 2, m: 2 }); assert.deepEqual(G.sqrtParts(45), { k: 3, m: 5 }); assert.deepEqual(G.sqrtParts(13), { k: 1, m: 13 }); assert.deepEqual(G.sqrtParts(16), { k: 4, m: 1 });
  assert.equal(G.lengthText(G.bandLength(P(0, 0, 4, 0, 0, 3))), '12');
  assert.equal(G.lengthText(G.bandLength(P(1, 0, 2, 1, 1, 2, 0, 1))), '4√2');
  assert.equal(G.lengthText(G.bandLength(P(1, 1, 4, 1, 5, 3, 2, 3))), '6 + 2√5');
  assert.equal(G.lengthText(G.bandLength(P(0, 0, 2, 1, 2, 3))), '2 + √5 + √13');
  assert.equal(G.lengthText(G.bandLength(P(0, 0, 3, 0, 3, 4), false)), '7', 'an open band: its length only');
  assert.ok(Math.abs(G.bandLength(P(1, 1, 4, 1, 5, 3, 2, 3)).approx - (6 + 2 * Math.sqrt(5))) < 1e-9);
  assert.equal(G.approxText(G.bandLength(P(1, 1, 4, 1, 5, 3, 2, 3)), 'en'), '10.47');
  // Not shapes: a bow tie, a straight line, a band that doubles back, a repeated peg.
  for (const bad of [P(0, 0, 2, 2, 2, 0, 0, 2), P(0, 0, 1, 1, 2, 2), P(0, 0, 3, 0, 1, 0, 1, 2), P(0, 0, 2, 0, 2, 2, 2, 0), P(0, 0, 1, 1)]) assert.equal(G.isSimple(bad), false, JSON.stringify(bad));
});

test('angles: every angle gets its name at the right boundaries; dragging snaps', () => {
  const want = { 0: 'zero', 1: 'acute', 45: 'acute', 89: 'acute', 90: 'right', 91: 'obtuse', 179: 'obtuse', 180: 'straight', 181: 'reflex', 270: 'reflex', 359: 'reflex', 360: 'full' };
  for (const [a, k] of Object.entries(want)) assert.equal(G.angleKind(+a), k, a);
  for (let a = 0; a <= 360; a++) assert.ok(G.ANGLE_KINDS.includes(G.angleKind(a)));
  assert.equal(G.angleAt(1, 1, 1), 45); assert.equal(G.angleAt(0, 1, 5), 90); assert.equal(G.angleAt(-1, 0, 15), 180); assert.equal(G.angleAt(0, -1, 1), 270);
  assert.equal(G.angleAt(Math.cos(0.61), Math.sin(0.61), 5), 35, '34.95° snaps to 35');
  assert.equal(G.angleAt(1, -0.001, 1, 350), 360, 'dragging round past 359 makes a full turn');
  assert.equal(G.angleAt(1, 0.001, 1, 10), 0);
});

test('3D shapes and nets: faces, edges and vertices; the net is flat, the folded net is the solid, faces never stretch', () => {
  const want = { cube: [6, 12, 8], cuboid: [6, 12, 8], triprism: [5, 9, 6], hexprism: [8, 18, 12], sqpyramid: [5, 8, 5], tripyramid: [4, 6, 4], cylinder: [3, 2, 0], cone: [2, 1, 1] };
  for (const [k, [f, e, v]] of Object.entries(want)) {
    const s = G.SOLIDS[k];
    assert.deepEqual([s.f, s.e, s.vx], [f, e, v], k);
    if (!s.curved) { assert.deepEqual(G.countSolid(k), { f, e, vx: v }, `${k}: counted from the model`); assert.equal(f + v - e, 2, `${k}: Euler`); }
    else assert.equal(s.flat + s.curved, s.f);
    const model = G.solidModel(k), flat = G.foldPose(k, 0), folded = G.foldPose(k, 1), half = G.foldPose(k, 0.5);
    for (const face of flat) for (const p of face) assert.ok(Math.abs(p[2]) < 1e-9, `${k}: the net lies flat`);
    folded.forEach((face, i) => face.forEach((p, j) => { const o = model.v[model.faces[i].v[j]]; assert.ok(Math.hypot(p[0] - o[0], p[1] - o[1], p[2] - o[2]) < 1e-9, `${k}: folded is the solid`); }));
    // Folding turns faces; it never stretches one.
    const side = (face, i) => Math.hypot(...face[i].map((c, d) => c - face[(i + 1) % face.length][d]));
    folded.forEach((face, i) => face.forEach((_, j) => { assert.ok(Math.abs(side(face, j) - side(flat[i], j)) < 1e-9); assert.ok(Math.abs(side(face, j) - side(half[i], j)) < 1e-9); }));
  }
  // Every face's corners run outwards (the folded solid paints only the faces turned towards the viewer).
  for (const k of G.SOLID_KINDS) {
    const m = G.solidModel(k), C = [0, 1, 2].map(d => m.v.reduce((a, p) => a + p[d], 0) / m.v.length);
    for (const f of m.faces) {
      const P = f.v.map(i => m.v[i]), u = [0, 1, 2].map(d => P[1][d] - P[0][d]), v = [0, 1, 2].map(d => P[2][d] - P[0][d]);
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], fc = [0, 1, 2].map(d => P.reduce((a, p) => a + p[d], 0) / P.length);
      assert.ok(n.reduce((a, x, d) => a + x * (fc[d] - C[d]), 0) > 0, `${k}: a face turned inwards`);
    }
  }
  // A cube's net: six squares that don't overlap (their centres are at least a side apart).
  const net = G.foldPose('cube', 0).map(f => [f.reduce((a, p) => a + p[0], 0) / 4, f.reduce((a, p) => a + p[1], 0) / 4]);
  for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) assert.ok(Math.hypot(net[i][0] - net[j][0], net[i][1] - net[j][1]) > 1.6 - 1e-9);
});

test('transformations: coordinates of every move, the rules, and moves that undo each other', () => {
  const A0 = [2, 1];
  assert.deepEqual(G.transformPoint(A0, { op: 'translate', dx: 3, dy: -5 }), [5, -4]);
  assert.deepEqual(G.transformPoint(A0, { op: 'reflect', axis: 'x' }), [2, -1]);
  assert.deepEqual(G.transformPoint(A0, { op: 'reflect', axis: 'y' }), [-2, 1]);
  assert.deepEqual(G.transformPoint(A0, { op: 'reflect', axis: 'yx' }), [1, 2]);
  assert.deepEqual(G.transformPoint(A0, { op: 'reflect', axis: 'ynx' }), [-1, -2]);
  assert.deepEqual(G.transformPoint(A0, { op: 'rotate', turn: 90 }), [-1, 2]);
  assert.deepEqual(G.transformPoint(A0, { op: 'rotate', turn: 180 }), [-2, -1]);
  assert.deepEqual(G.transformPoint(A0, { op: 'rotate', turn: 270 }), [1, -2]);
  for (let x = -8; x <= 8; x++) for (let y = -8; y <= 8; y++) {
    for (const axis of ['x', 'y', 'yx', 'ynx']) assert.deepEqual(G.transformPoint(G.transformPoint([x, y], { op: 'reflect', axis }), { op: 'reflect', axis }), [x, y]);
    let p = [x, y]; for (let k = 0; k < 4; k++) p = G.transformPoint(p, { op: 'rotate', turn: 90 }); assert.deepEqual(p, [x, y]);
    assert.deepEqual(G.transformPoint(G.transformPoint([x, y], { op: 'rotate', turn: 90 }), { op: 'rotate', turn: 270 }), [x, y]);
    // A rotation keeps the distance from the origin; a translation keeps the shape's sides.
    const r = G.transformPoint([x, y], { op: 'rotate', turn: 90 }); assert.equal(r[0] ** 2 + r[1] ** 2, x * x + y * y);
  }
  assert.equal(G.ruleText({ op: 'translate', dx: 3, dy: -5 }), '(x, y) → (x + 3, y − 5)');
  assert.equal(G.ruleText({ op: 'translate', dx: 0, dy: 2 }), '(x, y) → (x, y + 2)');
  assert.equal(G.ruleText({ op: 'reflect', axis: 'y' }), '(x, y) → (−x, y)');
  assert.equal(G.ruleText({ op: 'rotate', turn: 90 }), '(x, y) → (−y, x)');
  assert.equal(G.pointText([-2, 5]), '(−2, 5)');
  // Every rule says what the point does.
  for (const t of [{ op: 'reflect', axis: 'x' }, { op: 'reflect', axis: 'yx' }, { op: 'reflect', axis: 'ynx' }, { op: 'rotate', turn: 180 }, { op: 'rotate', turn: 270 }]) {
    const [, to] = /→ \((.*)\)$/.exec(G.ruleText(t)), [a, b] = to.split(', '), val = (e, x, y) => (e.startsWith('−') ? -1 : 1) * (e.replace('−', '') === 'x' ? x : y);
    assert.deepEqual(G.transformPoint([3, 7], t), [val(a, 3, 7), val(b, 3, 7)], JSON.stringify(t));
  }
});

test('balance scale: doing the same to both sides keeps it level, one side tips it, and the steps solve the equation', () => {
  const L = { x: 3, u: 2 }, R = { x: 1, u: 8 };
  assert.equal(G.weigh(L, 3), 11); assert.equal(G.tip(L, R, 3), 0); assert.equal(G.tip(L, R, 4), -1); assert.equal(G.tip(L, R, 2), 1);
  assert.equal(G.sideText(L), '3x + 2'); assert.equal(G.sideText(R), 'x + 8'); assert.equal(G.sideText({ x: 0, u: 0 }), '0'); assert.equal(G.sideText({ x: 2, u: 0 }), '2x');
  // 3x + 2 = x + 8 → take x from both → 2x + 2 = 8 → take 1 twice → 2x = 6 → share into 2 → x = 3
  let s = { L, R };
  for (const op of ['subx', 'sub1', 'sub1']) { s = G.balanceOp(s.L, s.R, op); assert.equal(G.tip(s.L, s.R, 3), 0, op); }
  assert.deepEqual(s, { L: { x: 2, u: 0 }, R: { x: 0, u: 6 } });
  assert.equal(G.balanceOp(s.L, s.R, 'div', 'both', 4), null, 'not shared evenly into 4');
  s = G.balanceOp(s.L, s.R, 'div', 'both', 2);
  assert.deepEqual(s, { L: { x: 1, u: 0 }, R: { x: 0, u: 3 } }); assert.equal(G.solvedValue(s.L, s.R), 3);
  assert.equal(G.solvedValue(s.R, s.L), 3); assert.equal(G.solvedValue(L, R), null);
  // One side only tips it; nothing to take away can't be done; the scale has room for 9 x-boxes and 30 weights.
  const one = G.balanceOp(L, R, 'add1', 'left'); assert.deepEqual(one, { L: { x: 3, u: 3 }, R }); assert.equal(G.tip(one.L, one.R, 3), -1);
  assert.equal(G.balanceOp({ x: 0, u: 5 }, R, 'subx'), null);
  assert.equal(G.balanceOp({ x: 9, u: 0 }, { x: 1, u: 0 }, 'addx'), null);
  assert.equal(G.balanceOp({ x: 1, u: 30 }, { x: 1, u: 0 }, 'add1', 'left'), null);
  // Whatever is done to both sides of a level scale, it stays level (for every x).
  const rnd = G.seeded(7);
  for (let k = 0; k < 300; k++) {
    const x = 1 + Math.floor(rnd() * 9), e = G.makeEquation(x, rnd);
    assert.equal(G.tip(e.L, e.R, x), 0, 'a new equation balances'); assert.ok(e.L.x > e.R.x && e.L.x <= 9 && e.R.u <= 30);
    const op = ['addx', 'subx', 'add1', 'sub1', 'div'][Math.floor(rnd() * 5)], n = [e.L.x, e.L.u, e.R.x, e.R.u].reduce((a, b) => M.gcd(a, b), 0);
    const r = G.balanceOp(e.L, e.R, op, 'both', n);
    if (r) assert.equal(G.tip(r.L, r.R, x), 0, `${op} keeps it level`);
  }
});

test('algebra tiles: zero pairs cancel, the expression simplifies and its value never changes', () => {
  const t = (k, neg = false) => ({ k, neg });
  const tiles = [t('x2'), t('x2'), t('x'), t('x'), t('x'), t('x', true), t('1'), t('1'), t('1', true)];
  assert.deepEqual(G.simplifyTiles(tiles), { a: 2, b: 2, c: 1 });
  assert.equal(G.rawText(tiles), '2x² + 3x − x + 2 − 1');
  assert.equal(G.polyText(G.simplifyTiles(tiles)), '2x² + 2x + 1');
  assert.equal(G.zeroPairs(tiles).size, 4);
  const left = G.removeZeroPairs(tiles);
  assert.equal(left.length, 5); assert.equal(G.rawText(left), '2x² + 2x + 1'); assert.equal(G.zeroPairs(left).size, 0);
  for (let x = -5; x <= 5; x++) assert.equal(G.tilesValue(left, x), G.tilesValue(tiles, x));
  assert.equal(G.polyText({ a: 0, b: -1, c: 0 }), '−x'); assert.equal(G.polyText({ a: -1, b: 1, c: -3 }), '−x² + x − 3'); assert.equal(G.polyText({ a: 0, b: 0, c: 0 }), '0'); assert.equal(G.polyText({ a: 1, b: 0, c: 0 }), 'x²');
  assert.equal(G.rawText([t('x', true), t('x')]), 'x − x'); assert.equal(G.polyText(G.simplifyTiles([t('x', true), t('x')])), '0');
  assert.equal(G.rawText([]), '0');
  // Random mats: simplifying never changes the value, and no zero pair survives.
  const rnd = G.seeded(11);
  for (let k = 0; k < 200; k++) {
    const m = Array.from({ length: Math.floor(rnd() * 36) }, () => t(G.TILE_KINDS[Math.floor(rnd() * 3)], rnd() < 0.5));
    const r = G.removeZeroPairs(m), s = G.simplifyTiles(m);
    for (const x of [-3, 0, 2, 7]) { assert.equal(G.tilesValue(r, x), G.tilesValue(m, x)); assert.equal(s.a * x * x + s.b * x + s.c, G.tilesValue(m, x)); }
    assert.equal(G.zeroPairs(r).size, 0); assert.deepEqual(G.simplifyTiles(r), s);
  }
});

test('coins and money: totals, the fewest coins (checked against every way), making change by counting up', () => {
  assert.equal(G.moneyTotal('usd', [3, 1, 2, 1]), 3 + 5 + 20 + 25);
  assert.equal(G.moneyTotal('eur', [0, 0, 0, 0, 0, 0, 1, 1, 1]), 100 + 200 + 500);
  assert.equal(G.moneyTotal('gen', [1, 1, 1, 1, 1, 1, 1]), 188);
  for (const cur of G.CURRENCY_IDS) {
    const ds = G.denoms(cur).map(d => d.v), best = [0];
    for (let a = 1; a <= 600; a++) best[a] = Math.min(...ds.filter(d => d <= a).map(d => best[a - d] + 1));
    for (let a = 0; a <= 600; a++) { const f = G.fewest(cur, a); assert.equal(G.moneyTotal(cur, f), a, `${cur} ${a}`); assert.equal(f.reduce((x, y) => x + y, 0), best[a], `${cur} ${a}: the fewest`); }
  }
  const steps = G.countUp('usd', 37, 100);
  assert.deepEqual(steps.map(s => s.to), [38, 39, 40, 50, 100]);
  assert.equal(steps.reduce((a, s) => a + s.add, 0), 63);
  assert.equal(G.countUp('usd', 120, 100), null, 'not enough paid');
  assert.deepEqual(G.countUp('gbp', 100, 100), []);
  for (let cost = 0; cost <= 500; cost += 7) { const st = G.countUp('eur', cost, 500); assert.equal(st.length ? st.at(-1).to : cost, 500); }
  assert.equal(G.moneyText('usd', 125, 'en-US'), '$1.25'); assert.equal(G.moneyText('gbp', 40, 'en-GB'), '£0.40'); assert.equal(G.moneyText('eur', 125, 'de').replace(/\s/g, ' '), '1,25 €'); assert.equal(G.moneyText('gen', 1250, 'en'), '1,250');
  assert.equal(G.currencyFor('en-US'), 'usd'); assert.equal(G.currencyFor('en'), 'usd'); assert.equal(G.currencyFor('en-GB'), 'gbp'); assert.equal(G.currencyFor('de'), 'eur'); assert.equal(G.currencyFor('fr'), 'eur'); assert.equal(G.currencyFor('ja'), 'gen'); assert.equal(G.currencyFor('ar'), 'gen');
  assert.equal(G.faceText('usd', 25), '25¢'); assert.equal(G.faceText('usd', 500), '$5'); assert.equal(G.faceText('gbp', 50), '50p'); assert.equal(G.faceText('gen', 20), '20');
});

test('chance lab: exact chances, expected counts, trials that add up', () => {
  for (const [kind, dice, parts] of [['coin', 1, 4], ['dice', 1, 4], ['dice', 2, 4], ['spinner', 1, 3], ['spinner', 1, 8]]) {
    const o = G.outcomes(kind, dice, parts), L = o.reduce((m, x) => M.lcm(m, x.p.d), 1);
    assert.equal(o.reduce((s, x) => s + (x.p.n * L) / x.p.d, 0), L, `${kind}: the chances add up to 1`);
  }
  const two = G.outcomes('dice', 2);
  assert.deepEqual(two.map(x => x.o), ['2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']);
  assert.deepEqual(two[5].p, { n: 1, d: 6 }); assert.deepEqual(two[0].p, { n: 1, d: 36 }); assert.deepEqual(two[4].p, { n: 5, d: 36 });
  assert.deepEqual(G.expectedCount(1000, two[5].p), { n: 500, d: 3 }); assert.deepEqual(G.expectedCount(100, { n: 1, d: 2 }), { n: 50, d: 1 });
  const rnd = G.seeded(42), counts = G.runTrials('dice', 2, 4, 1000, [], rnd);
  assert.equal(counts.length, 11); assert.equal(counts.reduce((a, b) => a + b, 0), 1000);
  const more = G.runTrials('dice', 2, 4, 10, counts, rnd); assert.equal(more.reduce((a, b) => a + b, 0), 1010);
  assert.deepEqual(G.runTrials('coin', 1, 4, 50, [], G.seeded(5)), G.runTrials('coin', 1, 4, 50, [], G.seeded(5)), 'the same seed, the same results');
  for (let k = 0; k < 500; k++) { const t = G.trial('spinner', 1, 5, rnd); assert.ok(t >= 0 && t < 5); }
  // Many trials come close to what we expect (a seeded run, so this never flakes).
  const big = G.runTrials('dice', 1, 4, 60000, [], G.seeded(9));
  for (const n of big) assert.ok(Math.abs(n - 10000) < 500, String(n));
});

test('letter tiles, word families and maps', () => {
  assert.deepEqual(G.ALPHABET.filter(G.isVowel), ['a', 'e', 'i', 'o', 'u']);
  assert.deepEqual(G.letterCounts('Cat!'), { letters: 3, vowels: 1, consonants: 2 });
  for (const [fam, words] of Object.entries(G.FAMILIES)) for (const w of words) { assert.ok(w.endsWith(fam), w); assert.ok(w.length - fam.length >= 1 && w.length - fam.length <= 2, w); assert.match(w, /^[a-z]+$/); }
  assert.ok(G.isFamilyWord('at', 'cat')); assert.ok(G.isFamilyWord('at', 'CHAT')); assert.ok(!G.isFamilyWord('at', 'zat')); assert.ok(!G.isFamilyWord('xx', 'cat'));
  assert.ok(G.onsetsOf('ig').includes('p') && G.onsetsOf('ig').includes('tw'));
  // A short, kind word list: nothing unkind or grown-up.
  assert.doesNotMatch(Object.values(G.FAMILIES).flat().join(' '), /\b(gun|wine|kill|hate|sexy?|drug|bet)\b/);
  assert.equal(G.continentAt(550, 255), 'africa'); assert.equal(G.continentAt(235, 140), 'northAmerica'); assert.equal(G.continentAt(320, 310), 'southAmerica'); assert.equal(G.continentAt(865, 330), 'australia');
  assert.equal(G.continentAt(740, 130), 'asia'); assert.equal(G.continentAt(530, 108), 'europe'); assert.equal(G.continentAt(400, 210), null, 'the Atlantic');
  for (const [id, [x, y]] of Object.entries(G.PLACE_LABELS)) if (!G.OCEAN_IDS.includes(id)) assert.equal(G.continentAt(x, y), id, `${id}'s name is on it`); else assert.equal(G.continentAt(x, y), null, `${id}'s name is on the sea`);
  assert.equal(G.gridRef(0, 0), 'A1'); assert.equal(G.gridRef(250, 350), 'C4'); assert.equal(G.gridRef(999, 499), 'J5'); assert.equal(G.gridRef(5000, 5000), 'J5');
});

test('"Make a question from it": every tool with one right answer makes a quick check from its state, the answer among the choices', () => {
  const t = tFor('en'), reg = D.registryFor(t, 'teacher'), words = id => wordsOf(reg, id);
  const cases = {
    fractions: [{ bars: [{ n: 3, d: 8 }] }, '3/8'],
    numline: [{ lo: 0, hi: 3, sub: 4, mode: 'fraction', points: [], jumps: [{ a: 0, b: 3 }, { a: 3, b: 6 }] }, '1 1/2'],
    coord: [{ mi: 13, b: 1, line: true }, '1/2'],
    graph: [{ rows: [{ l: 'Dogs', v: 4 }, { l: 'Cats', v: 9 }, { l: '', v: 2 }] }, 'Cats'],
    base10: [{ h: 1, t: 12, o: 3 }, '223'],
    placeval: [{ v: 3405270 }, '3,405.27'],
    tenframe: [{ cells: [1, 1, 2, 0, 1] }, '4'],
    hundreds: [{ start: 1, skip: 5, shade: [] }, '20'],
    area: [{ a: 7, b: 8 }, '56'],
    times: [{ r: 6, c: 9 }, '54'],
    tclock: [{ t: 9 * 60 + 40, h24: false }, '9:40 AM'],
    fdp: [{ n: 1, d: 4 }, '0.25'],
    geoboard: [{ bands: [{ pts: P(1, 1, 4, 1, 5, 3, 2, 3), closed: true }] }, '6'],
    pattern: [{ blocks: [{ k: 'hex' }, { k: 'trap' }, { k: 'tri' }, { k: 'sq' }] }, '1 2/3'],
    angle: [{ a: 135 }, 'Obtuse angle'],
    solids: [{ shape: 'triprism' }, '9'],
    transform: [{ shape: 'tri', ox: 0, oy: 0, op: 'rotate', turn: 90 }, '(−1, 1)'],
    balance: [{ x: 3, lx: 3, lu: 2, rx: 1, ru: 8 }, '3'],
    algebra: [{ tiles: [{ k: 'x', neg: false }, { k: 'x', neg: false }, { k: 'x', neg: true }, { k: '1', neg: false }] }, 'x + 1'],
    coins: [{ cur: 'usd', mode: 'count', counts: [2, 1, 1, 1] }, '$0.42'],
    chance: [{ kind: 'dice', dice: 2, parts: 4 }, '1/6'],
    letters: [{ word: [2], fam: 'at' }, '1'],
    map: [{ kind: 'world', pins: [{ x: 400, y: 210, l: '' }, { x: 550, y: 255, l: '' }] }, 'Africa'],
  };
  for (const [id, [state, right]] of Object.entries(cases)) {
    const st = { ...DT.cleanToolState(id, {}), ...state };
    const made = A.questionFor(id, st, words(id), reg.ask, 'en-US');
    assert.ok(made, id);
    assert.equal(made.options[made.answer], right, `${id}: ${JSON.stringify(made)}`);
    assert.ok(made.options.length >= 2 && made.options.length <= 4, id);
    assert.equal(new Set(made.options).size, made.options.length, `${id}: no answer twice`);
    for (const o of made.options) assert.ok(o && [...o].length <= 60, id);
    assert.ok(made.q && [...made.q].length <= 120 && !/\{\w+\}/.test(made.q) && !/^dash\./.test(made.q), `${id}: ${made.q}`);
    // The same state makes the same question (so it doesn't jump about while the teacher reads it).
    assert.deepEqual(A.questionFor(id, st, words(id), reg.ask, 'en-US'), made);
  }
  // The right answer is not always first.
  const firsts = Object.entries(cases).map(([id, [state]]) => A.questionFor(id, { ...DT.cleanToolState(id, {}), ...state }, words(id), reg.ask, 'en-US').answer);
  assert.ok(new Set(firsts).size >= 3, firsts.join());
  // Nothing with one right answer: no question, and the button is hidden.
  assert.equal(A.questionFor('organizer', DT.cleanToolState('organizer', {}), words('organizer'), reg.ask), null);
  assert.equal(A.questionFor('board', {}, {}, reg.ask), null);
  assert.equal(A.questionFor('tenframe', { cells: [] }, words('tenframe'), reg.ask), null);
  assert.equal(A.questionFor('geoboard', { bands: [{ pts: P(0, 0, 2, 2, 2, 0, 0, 2), closed: true }] }, words('geoboard'), reg.ask), null, 'a band that crosses itself has no area');
  assert.equal(A.questionFor('balance', { x: 3, lx: 3, lu: 2, rx: 1, ru: 9 }, words('balance'), reg.ask), null, 'an untrue equation');
  assert.equal(A.questionFor('map', { kind: 'world', pins: [{ x: 400, y: 210 }] }, words('map'), reg.ask), null, 'a pin in the sea');
  assert.equal(A.questionFor('coins', { cur: 'usd', mode: 'change', cost: 120, paid: 100, counts: [] }, words('coins'), reg.ask), null);
  // In another language the words are that language's.
  const de = D.registryFor(tFor('de'), 'teacher');
  const deQ = A.questionFor('angle', { a: 90 }, wordsOf(de, 'angle'), de.ask, 'de');
  assert.equal(deQ.q, 'Was für ein Winkel ist das?'); assert.equal(deQ.options[deQ.answer], 'Rechter Winkel');
});

test('a question made from a tool goes out as an ordinary quick check: the class\'s teacher only, students see it, totals only', async () => {
  const w = world(), An = w.A.id;
  await as(w.T)(`/class/${An}/dashboard`);
  // The first visit's Morning start pins class jobs, whose crew (students' Oomba names, which may hold "right") students
  // see by design; follow Quiet work (nothing pinned) so the live answer holds only the check.
  D.useLayout(w.T, w.A, D.layoutsOf(An, w.T.id).find(l => l.name === 'Quiet work').id);
  const reg = D.registryFor(tFor('en'), 'teacher');
  const made = A.questionFor('angle', { a: 135 }, wordsOf(reg, 'angle'), reg.ask, 'en');
  const r = await as(w.T)(`/api/dash/${An}/checks`, POST({ kind: 'choice', question: made.q, options: made.options }));
  assert.equal(r.status, 200, r.text);
  const live = (await as(w.a1)(`/api/dash/${An}/live`)).json;
  assert.equal(live.checks[0].q, 'What kind of angle is this?'); assert.deepEqual(live.checks[0].options, made.options);
  assert.ok(!('answer' in live.checks[0]) && !JSON.stringify(live).includes('right'), 'which answer is right never leaves the teacher\'s browser');
  assert.ok(live.pushes.some(p => p.kind === 'check'));
  for (const who of [w.a1, w.T2, w.stranger]) assert.equal((await as(who)(`/api/dash/${An}/checks`, POST({ kind: 'choice', question: 'x', options: ['a', 'b'] }))).status, 404);
  // The question sheet is built with textContent (the teacher's words are never HTML).
  const shell = fs.readFileSync('public/js/dash-tools.js', 'utf8'), sheet = shell.slice(shell.indexOf('function askSheet('), shell.indexOf('/** A labelled field'));
  assert.doesNotMatch(sheet, /innerHTML|insertAdjacentHTML/);
  assert.match(sheet, /ctx\.ask\(/);
});

test('"Practice it": only official games every student of the class can open; nothing when there is no clean match', async () => {
  const w = world();
  const official = q.get('SELECT * FROM users WHERE username=?', OFFICIAL) || createUser({ username: OFFICIAL, password: 'secret123', role: 'admin' });
  const make = (owner, slug, title, visibility = 'public', source = 'seed') => {
    const g = games.createGame(owner.id, { title, icon: '🎮' }); const v = games.addVersion(g.id, '<title>G</title><canvas></canvas>');
    q.run('DELETE FROM games WHERE slug=? AND id<>?', slug, g.id);
    q.run("UPDATE games SET slug=?, source=?, status='published', visibility=?, published_version_id=? WHERE id=?", slug, source, visibility, v.id || v, g.id);
    return games.getGame(g.id);
  };
  assert.deepEqual(D.practiceFor(w.A), {}, 'no games yet: no links');
  make(official, 'balance-bridge', 'Balance Bridge');
  make(official, 'fraction-factory', 'Fraction Factory', 'private');      // not every student can open it
  make(w.T2, 'atlas-quest', 'Atlas Quest (a copy)', 'public', 'studio');  // the right name, not the official game
  make(official, 'launch-lab', 'Launch Lab');
  const p = D.practiceFor(w.A);
  assert.deepEqual(p.balance, [{ title: 'Balance Bridge', icon: '🎮', href: '/play/balance-bridge' }]);
  assert.deepEqual(p.chance.map(x => x.href), ['/play/launch-lab']);
  for (const tool of ['fractions', 'map', 'organizer', 'fdp', 'area', 'board']) assert.ok(!(tool in p), tool);
  // Every link is to one of the games picked by hand; tools without a clean match have none.
  for (const [tool, list] of Object.entries(p)) for (const g of list) assert.ok(D.PRACTICE[tool].includes(g.href.replace('/play/', '')));
  assert.ok(!('organizer' in D.PRACTICE) && !('fdp' in D.PRACTICE) && !('area' in D.PRACTICE));
  for (const slugs of Object.values(D.PRACTICE)) for (const slug of slugs) assert.ok(fs.existsSync(`seed-games/${slug}.json`), `${slug} is an official game`);
  // The teacher's and the students' pages carry the same links; no prices or plan words.
  for (const who of [w.T, w.a1]) {
    const html = (await as(who)(`/class/${w.A.id}/dashboard`)).text, data = pageData(html);
    assert.deepEqual(data.practice, p);
    assert.doesNotMatch(JSON.stringify(data.practice), /\$|€|£|price|plan|upgrade/i);
  }
});

test('sending a stage 4 tool: the teacher\'s own tool, its state rebuilt; each student gets their own copy; nothing comes back', async () => {
  const w = world(), An = w.A.id;
  await layout(w, [{ id: 'og1', type: 'organizer', s: { state: { kind: 'tchart', boxes: [{ t: 'Pros' }, { t: 'Cons' }] } } }, { id: 'mp1', type: 'map' }, { id: 'lt1', type: 'letters' }]);
  const r = await as(w.T)(`/api/dash/${An}/pushes`, POST({ kind: 'tool', ref: 'og1', state: { kind: 'kwl', title: 'Frogs‮', boxes: [{ t: 'jump\u0007' }], spy: 1 } }));
  assert.equal(r.status, 200, r.text);
  const p = (await as(w.a1)(`/api/dash/${An}/live`)).json.pushes.find(x => x.kind === 'tool');
  assert.deepEqual(p.tool, { type: 'organizer', state: { kind: 'kwl', n: 4, d: 3, title: 'Frogs', boxes: [{ h: '', t: 'jump' }, { h: '', t: '' }, { h: '', t: '' }] } });
  assert.deepEqual((await as(w.a2)(`/api/dash/${An}/live`)).json.pushes.find(x => x.kind === 'tool').tool, p.tool);
  await as(w.T)(`/api/dash/${An}/pushes`, POST({ kind: 'tool', ref: 'mp1', state: { pins: [{ x: 9999, y: 10, l: 'Here' }] } }));
  assert.deepEqual((await as(w.a1)(`/api/dash/${An}/live`)).json.pushes[0].tool.state.pins, [{ x: 1000, y: 10, l: 'Here' }]);
  for (const who of [w.a1, w.T2, w.b1, w.stranger]) assert.equal((await as(who)(`/api/dash/${An}/pushes`, POST({ kind: 'tool', ref: 'og1' }))).status, 404);
  // A student pins their copy and writes in it: it is theirs alone, never on another screen or the teacher's.
  const mine = await as(w.a1)(`/api/dash/${An}/me`, POST({ widgets: [{ id: 'myorg', type: 'organizer', x: 0, y: 0, w: 7, h: 6, s: { state: { kind: 'kwl', boxes: [{ t: 'my secret idea' }] } } }, { id: 'mymap', type: 'map', x: 0, y: 6, w: 7, h: 6, s: { state: { pins: [{ x: 1, y: 1, l: 'my house' }] } } }] }));
  assert.equal(mine.status, 200, mine.text);
  assert.equal(mine.json.state.widgets[0].s.state.boxes[0].t, 'my secret idea');
  for (const who of [w.a2, w.T]) { const txt = (await as(who)(`/class/${An}/dashboard`)).text + (await as(who)(`/api/dash/${An}/live`)).text; assert.ok(!txt.includes('my secret idea') && !txt.includes('my house'), who.username); }
  assert.ok(!JSON.stringify(D.pinsOf(An)).includes('my secret idea'));
});

test('safety: no AI, no network or storage in the tools, no prices, no "Pro", no real names, students never type to each other', async () => {
  for (const file of ['public/js/dash-tools4.js', 'public/js/dash-shapeboard.js', 'public/js/dash-math4.js', 'public/js/dash-ask.js', 'server/services/dash-tools.js'])
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /anthropic|screenPhoto|ai-budget|lesson-ai|\bclaude\b|openai/i, file);
  const tools = fs.readFileSync('public/js/dash-tools4.js', 'utf8'), math = fs.readFileSync('public/js/dash-math4.js', 'utf8'), ask = fs.readFileSync('public/js/dash-ask.js', 'utf8');
  const shapes = fs.readFileSync('public/js/dash-shapeboard.js', 'utf8');
  for (const src of [tools, shapes, math, ask]) for (const bad of [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /WebSocket/, /EventSource/, /localStorage|sessionStorage|indexedDB/, /from '\/js\/app\.js'/, /MediaRecorder|getUserMedia/, /toDataURL|toBlob/, /innerHTML/])
    assert.doesNotMatch(src, bad, String(bad));
  for (const src of [math, ask]) assert.doesNotMatch(src, /document\.|window\./, 'the maths and the questions are pure');
  // Coins are our own simple drawings: no image files or pictures of real money.
  assert.doesNotMatch(tools, /<img|new Image\(|\.png|\.jpe?g|\.webp|createElement\('img'\)/);
  // Letter tiles: nobody types. The tool has no text input of its own; a word is letter indexes, never free text.
  const letters = tools.slice(tools.indexOf('function letters('), tools.indexOf('// ====', tools.indexOf('function letters(')));
  assert.doesNotMatch(letters, /el\('input'|el\('textarea'|contenteditable/i);
  assert.equal(DT.TOOL_SPECS.letters.spec.word[0], 'ints');
  // No selling words, no "Pro" anywhere in stage 4's strings, in every language.
  const money = /\$\s?\d|€\s?\d|£\s?\d|\/plans|upgrade|free trial|Teacher plan|School plan|pricing|\bPro\b|Explorer/i;
  for (const code of ['en', 'en-GB', 'de', 'es', 'fr', 'it', 'nl', 'pt', 'ru', 'ja', 'zh-Hant', 'he', 'ar']) {
    const l = JSON.parse(fs.readFileSync(`server/i18n/locales/${code}.json`, 'utf8')).dash || {};
    for (const id of TOOLS4) if (l.w && l.w[id]) assert.doesNotMatch(JSON.stringify(l.w[id]), money, `${code} ${id}`);
    if (l.ask) assert.doesNotMatch(JSON.stringify(l.ask), money, code);
    if (l.tools) assert.doesNotMatch(JSON.stringify(l.tools), money, code);
  }
  // A student's screen with a sent tool and practice links carries no real names and no prices.
  const w = world();
  await layout(w, [{ id: 'cn', type: 'coins' }, { id: 'og', type: 'organizer' }]);
  await as(w.T)(`/api/dash/${w.A.id}/pushes`, POST({ kind: 'tool', ref: 'cn', state: { cur: 'usd', counts: [1, 1] } }));
  for (const who of [w.a1, w.a2]) { const page = (await as(who)(`/class/${w.A.id}/dashboard`)).text; assert.doesNotMatch(page, w.REAL); assert.doesNotMatch(page, money); }
  // No new route: stage 4 rides on the stage 1-3 addresses.
  const routes = fs.readFileSync('server/routes/dash.js', 'utf8').match(/router\.(get|post|put|delete|patch)\(/g).length;
  assert.equal(routes, 49, 'the same 35 addresses as stage 3, stage 5\'s 7 (hall pass, points, mood, site windows), ready-made layouts\' 1, Build it\'s 2 (progress, check), the schedule\'s connected calendar\'s 2 (connect, disconnect) and the Class Board PDF widget\'s 2 (upload, fetch)');
});

test('every stage 4 string is translated into every locale', async () => {
  const { checkAll } = await import('../../server/i18n/check.js');
  const r = checkAll();
  const keys = Object.keys(r.en).filter(k => new RegExp(`^dash\\.w\\.(${TOOLS4.join('|')})\\.|^dash\\.ask\\.|^dash\\.tools\\.(ask|practice)|^dash\\.groups\\.words$`).test(k));
  assert.ok(keys.length > 300, String(keys.length));
  for (const l of r.locales) {
    if (l.code === 'en-GB') continue;
    assert.deepEqual(l.missing.filter(k => keys.includes(k)), [], l.code);
    assert.deepEqual([...l.placeholderErrors, ...l.parseErrors, ...l.extra], [], l.code);
  }
  // The stage 3 tools keep their place: Teach still has them all, in order, before stage 4's.
  const ids = D.WIDGETS.map(x => x.id);
  assert.ok(STAGE3.every(id => ids.indexOf(id) < ids.indexOf('geoboard')));
});

// ---------------------------------------------------------------- review (docs/decisions.md "Classroom dashboards, stage 4", "Review changes")
test('review: a sequence\'s steps and main idea\'s details can be added and taken away; the server clamps their counts', () => {
  const c = (v) => DT.cleanToolState('organizer', v);
  assert.deepEqual(DT.ORGANIZER_GROW, { seq: { key: 'n', lo: 2, hi: 10 }, main: { key: 'd', lo: 2, hi: 6 } });
  for (const n of [2, 3, 7, 10]) assert.equal(c({ kind: 'seq', n }).boxes.length, n, String(n));
  assert.equal(c({ kind: 'seq', n: 99, boxes: Array(40).fill({ t: 'step' }) }).boxes.length, 10, 'at most 10 steps, however many are sent');
  assert.equal(c({ kind: 'seq', n: 99 }).n, 10); assert.equal(c({ kind: 'seq', n: 1 }).n, 2); assert.equal(c({ kind: 'seq', n: -5 }).boxes.length, 2);
  assert.equal(c({ kind: 'seq', n: 'many' }).n, 4, 'not a number: the default');
  // Steps keep their own text and headings in order; the 11th and later never survive.
  const ten = c({ kind: 'seq', n: 10, boxes: Array.from({ length: 12 }, (_, i) => ({ h: `H${i}`, t: `step ${i}` })) });
  assert.deepEqual(ten.boxes.map(b => b.t), Array.from({ length: 10 }, (_, i) => `step ${i}`));
  // Main idea and details: the idea and 2-6 details.
  assert.equal(c({ kind: 'main', d: 6 }).boxes.length, 7); assert.equal(c({ kind: 'main', d: 2 }).boxes.length, 3);
  assert.equal(c({ kind: 'main', d: 40 }).boxes.length, 7); assert.equal(c({ kind: 'main', d: 0 }).boxes.length, 3);
  // The other kinds keep their fixed boxes whatever n and d say.
  for (const [kind, n] of [['venn', 3], ['tchart', 2], ['kwl', 3], ['story', 5]]) assert.equal(c({ kind, n: 10, d: 6 }).boxes.length, n, kind);
  // Text written in place is cleaned as before (the same 400 characters, lines kept, control and direction marks gone).
  const t = c({ kind: 'seq', n: 2, boxes: [{ h: `H‮${'h'.repeat(60)}`, t: `a\r\nb\u0007⁦${'z'.repeat(600)}` }] });
  assert.equal([...t.boxes[0].h].length, 40); assert.doesNotMatch(t.boxes[0].h, /‮/); assert.match(t.boxes[0].t, /^a\nbz/); assert.equal([...t.boxes[0].t].length, 400);
});

test('review: organizers saved in the old shape (before steps could be added) come back as they were', () => {
  const c = (v) => DT.cleanToolState('organizer', v);
  // The old shape: n 3-6 for a sequence, no d, main idea always the idea and 3 details.
  const oldSeq = { kind: 'seq', n: 6, title: 'Life cycle', boxes: Array.from({ length: 6 }, (_, i) => ({ h: '', t: `s${i}` })) };
  assert.deepEqual(c(oldSeq), { ...oldSeq, d: 3 });
  const oldMain = { kind: 'main', n: 4, title: 'Bees', boxes: [{ h: '', t: 'idea' }, { h: '', t: 'd1' }, { h: 'Mine', t: 'd2' }, { h: '', t: 'd3' }] };
  assert.deepEqual(c(oldMain), { ...oldMain, d: 3 });
  const oldVenn = { kind: 'venn', n: 4, title: '', boxes: [{ h: 'Frogs', t: 'a' }, { h: '', t: 'b' }, { h: 'Toads', t: 'c' }] };
  assert.deepEqual(c(oldVenn), { ...oldVenn, d: 3 });
  // A widget default still has a Venn diagram's three boxes, and the registry default is the cleaned empty state.
  assert.equal(c({}).boxes.length, 3);
  assert.deepEqual(D.widgetType('organizer').settings[0].def, c({}));
  // Cleaning twice changes nothing (what a teacher's layout saves is what comes back).
  for (const v of [oldSeq, oldMain, { kind: 'seq', n: 10 }, { kind: 'main', d: 6 }]) assert.deepEqual(c(c(v)), c(v));
});

test('review: choosing a word family starts the board from scratch; "none" clears it too', () => {
  const st = { fam: '', word: [2, 0, 19, 18], caps: true };
  assert.deepEqual(G.switchFamily(st, 'ig'), { fam: 'ig', word: [], caps: true }, 'the old letters are not kept in front of the new ending');
  assert.deepEqual(G.switchFamily({ fam: 'at', word: [2] }, 'op'), { fam: 'op', word: [] });
  assert.deepEqual(G.switchFamily({ fam: 'at', word: [2] }, ''), { fam: '', word: [] });
  assert.deepEqual(G.switchFamily({ fam: 'at', word: [2] }, 'zzz'), { fam: '', word: [] }, 'not a family: none');
  assert.deepEqual(st.word, [2, 0, 19, 18], 'the state passed in is not changed');
  // The tool uses it for the family menu (the old code kept two letters).
  const tools = fs.readFileSync('public/js/dash-tools4.js', 'utf8');
  const letters = tools.slice(tools.indexOf('function letters('), tools.indexOf('// ====', tools.indexOf('function letters(')));
  assert.match(letters, /G\.switchFamily\(st, v\)/);
  assert.doesNotMatch(letters, /st\.word = st\.word\.slice\(0, 2\)/);
});

test('review: organizers are written in place, saved only through the widget\'s own keep (a student\'s copy stays theirs)', () => {
  const tools = fs.readFileSync('public/js/dash-tools4.js', 'utf8');
  const org = tools.slice(tools.indexOf('function organizer('), tools.indexOf('// ====', tools.indexOf('function organizer(')));
  // No sheet for writing: a text area in each box, named, with the same limits the server keeps.
  assert.doesNotMatch(org, /editSheet|ctx\.sheet\(/);
  assert.match(org, /el\('textarea', 'dt-orgta'\)/); assert.match(org, /maxLength: 400/); assert.match(org, /maxLength: 40,/); assert.match(org, /maxLength: 60,/);
  assert.match(org, /setAttribute\('aria-label', `\$\{headOf\(i\)\}: \$\{W\.text\}`\)/);
  // What is typed goes nowhere but ctx.keep: the teacher's layout, or the student's own copy.
  assert.doesNotMatch(org, /ctx\.send|ctx\.act|ctx\.get|ctx\.upload|ctx\.checks/);
  assert.match(org, /ctx\.keep\(parts\.clone\(st\)\)/);
  // The copy a student opens keeps its state in their own browser (public/js/dash.js openCopy).
  const dash = fs.readFileSync('public/js/dash.js', 'utf8');
  assert.match(dash, /copy: true, send: null, upload: null, checks: null, ask: null, keep: state => copies\.set\(pid, state\)/);
  // The Venn diagram's circles are circles: no stretching.
  assert.doesNotMatch(org, /preserveAspectRatio/); assert.match(org, /svg\('circle'/);
});

test('review: the new words are in every locale (the instruction above the letter board, adding and taking away steps)', async () => {
  const keys = ['dash.w.letters.instr', 'dash.w.organizer.addStep', 'dash.w.organizer.addDetail', 'dash.w.organizer.remove', 'dash.w.organizer.added', 'dash.w.organizer.removed'];
  for (const k of keys) {
    const en = tFor('en')(k); assert.ok(en && en !== k, k);
    for (const code of ['ar', 'de', 'es', 'fr', 'he', 'it', 'ja', 'nl', 'pt', 'ru', 'zh-Hant']) {
      const l = JSON.parse(fs.readFileSync(`server/i18n/locales/${code}.json`, 'utf8'));
      const v = k.split('.').reduce((o, p) => o && o[p], l);
      assert.ok(typeof v === 'string' && v.trim() && v !== en, `${code} ${k}`);
    }
  }
  assert.ok(D.widgetType('letters').words.includes('instr'));
  for (const w of ['addStep', 'addDetail', 'remove', 'added', 'removed']) assert.ok(D.widgetType('organizer').words.includes(w), w);
  assert.match(JSON.parse(fs.readFileSync('server/i18n/locales/it.json', 'utf8')).dash.w.letters.instr, /^Trascina .*parola\.$/);
});

// ---------------------------------------------------------------- help on the maths tools
// (docs/decisions.md "Classroom dashboards: help on the maths tools")
test('help on the maths tools: every maths tool has a one-line instruction and short ⓘ help, in every language', async () => {
  const { checkAll } = await import('../../server/i18n/check.js');
  const reg = D.registryFor(tFor('en'), 'teacher');
  // Every maths tool (Teach, sent to students), and only those: not the whiteboard, letters, organizers or maps. Since
  // "maths tools combined", every mode of a maths tool (a mode has its own instruction and ⓘ help).
  const maths = reg.types.filter(x => x.group === 'teach' && x.send).flatMap(x => (x.modes ? x.modes.map(m => m.id) : [x.id]));
  assert.deepEqual([...D.MATH_TOOLS].sort(), maths.sort());
  for (const id of ['board', 'letters', 'organizer', 'map']) assert.ok(!D.MATH_TOOLS.includes(id), id);
  const fr = ['modeCompare', 'modeAdd', 'modeSub', 'modeMul', 'modeDiv', 'howtoOp', 'howtoMul', 'howtoDiv', 'first', 'second', 'num', 'den', 'simplest', 'mixed', 'already', 'below', 'swap', 'overlap', 'fits', 'noZero', 'think'];
  const keys = [...D.MATH_TOOLS.flatMap(id => ['howto', 'helpUse', 'helpIdeas'].map(k => `dash.w.${id}.${k}`)), ...fr.map(k => `dash.w.fractions.${k}`),
    ...['helpFor', 'helpClose', 'helpTry'].map(k => `dash.tools.${k}`),
    ...['fractionsAdd', 'fractionsSub', 'fractionsMul', 'fractionsDiv'].map(k => `dash.ask.${k}`)];
  const r = checkAll();
  for (const k of keys) assert.ok(r.en[k], k);
  for (const l of r.locales) {
    if (l.code === 'en-GB') continue;
    assert.deepEqual(l.missing.filter(k => keys.includes(k)), [], l.code);
    assert.deepEqual([...l.placeholderErrors, ...l.parseErrors, ...l.extra], [], l.code);
  }
  const en = JSON.parse(fs.readFileSync('server/i18n/locales/en.json', 'utf8'));
  const get = (o, k) => k.split('.').reduce((a, p) => a && a[p], o);
  for (const code of ['ar', 'de', 'es', 'fr', 'he', 'it', 'ja', 'nl', 'pt', 'ru', 'zh-Hant']) {
    const loc = JSON.parse(fs.readFileSync(`server/i18n/locales/${code}.json`, 'utf8'));
    for (const k of keys) if (!/^dash\.ask\./.test(k)) assert.notEqual(get(loc, k), get(en, k), `${code} ${k} is translated, not copied`);
  }
  // The panel is short (product: "much more concise"): at most three points and one idea for class, no "More" section.
  // The geoboard is being rebuilt elsewhere with the same short format, so its help is not held to the budget here yet.
  const words = s => s.split(/\s+/).filter(x => /[\p{L}\p{N}]/u.test(x)).length;
  const short = D.MATH_TOOLS.filter(id => id !== 'geoboard');
  for (const id of D.MATH_TOOLS) {
    const w = wordsOf(reg, id);
    // One line: one sentence or two short ones, no line breaks.
    assert.ok(w.howto && !/\n/.test(w.howto) && [...w.howto].length <= 72, `${id}: ${w.howto}`);
    for (const [k, v] of Object.entries({ howto: w.howto, helpUse: w.helpUse, helpIdeas: w.helpIdeas })) assert.doesNotMatch(v, /\$\s?\d|€\s?\d|£\s?\d|pricing|upgrade|\bPro\b|\bAI\b/, `${id}.${k}`);
    if (!short.includes(id)) continue;
    // English: 1-3 points of at most 12 words, one "Try:" idea, about 40-50 words in all.
    const items = w.helpUse.split('\n');
    assert.ok(items.length >= 1 && items.length <= 3, `${id}: ${items.length} points`);
    assert.ok(!/\n/.test(w.helpIdeas) && w.helpIdeas.trim(), `${id}: one idea`);
    for (const t of items) assert.ok(words(t) <= 12, `${id}: "${t}" is ${words(t)} words`);
    assert.ok(words(w.helpUse) + words(w.helpIdeas) <= 50, `${id}: ${words(w.helpUse) + words(w.helpIdeas)} words`);
  }
  // Every language: the same shape, and a character budget so a translation can't make the panel long again.
  for (const code of ['en', 'ar', 'de', 'es', 'fr', 'he', 'it', 'ja', 'nl', 'pt', 'ru', 'zh-Hant']) {
    const loc = JSON.parse(fs.readFileSync(`server/i18n/locales/${code}.json`, 'utf8'));
    for (const k of ['helpControls', 'helpIdeas', 'helpMore', 'helpAsk', 'helpSend', 'helpPractice']) assert.equal(loc.dash.tools[k], undefined, `${code} dash.tools.${k} is gone`);
    for (const id of short) {
      const { helpUse, helpIdeas } = loc.dash.w[id], lines = [...helpUse.split('\n'), ...helpIdeas.split('\n')];
      assert.ok(helpUse.split('\n').length <= 3 && helpIdeas.split('\n').length === 1, `${code} ${id}`);
      for (const t of lines) assert.ok(t.trim() && [...t].length <= 90, `${code} ${id}: ${t}`);
      assert.ok([...helpUse, ...helpIdeas].length <= 300, `${code} ${id}: ${[...helpUse, ...helpIdeas].length} characters`);
    }
  }
  const gb = JSON.parse(fs.readFileSync('server/i18n/locales/en-GB.json', 'utf8'));
  assert.equal(gb.dash.tools.helpPractice, undefined);
  // German instructions stay short enough for one line at a tool's default size.
  const de = D.registryFor(tFor('de'), 'teacher');
  for (const id of D.MATH_TOOLS) assert.ok([...wordsOf(de, id).howto].length <= 72, id);
  // The help lives in the tools' shell: ⓘ named for the tool, a panel with aria-expanded/controls, Escape, a tap outside;
  // hidden on the projector. No markup from strings (textContent only), no network or storage.
  const src = fs.readFileSync('public/js/dash-tools.js', 'utf8'), css = fs.readFileSync('public/css/dash.css', 'utf8');
  const help = src.slice(src.indexOf('function helpButton('), src.indexOf('function askSheet('));
  for (const bit of ["'aria-expanded'", "'aria-controls'", "'Escape'", "'pointerdown'", 'C.helpFor', 'C.helpTry', 'W.helpUse', 'W.helpIdeas', 'ctx.copy', '.slice(0, 3)']) assert.ok(help.includes(bit), bit);
  // No "More" section: Make a question, Send and Practice it explain themselves.
  assert.doesNotMatch(help, /helpMore|helpAsk|helpSend|helpPractice|helpControls/);
  assert.doesNotMatch(help, /innerHTML|fetch\(|localStorage/);
  assert.match(css, /\.dash-projector \.dt-info,\.dash-projector \.dt-help\{display:none!important\}/);
  // Students get the same points without the teacher's "Try:" idea (one line at most).
  assert.match(help, /ctx\.copy \|\| !ctx\.teacher \? '' : lines\(W\.helpIdeas\)\[0\]/);
});
