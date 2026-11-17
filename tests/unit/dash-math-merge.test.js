// Classroom dashboards: maths tools combined (docs/decisions.md "Classroom dashboards: maths tools combined"). Eight maths
// tools are modes of others now: base-ten blocks (place value), fraction/decimal/percent (fractions), the times table
// (multiply and divide: area), the angle maker (shape board: geoboard), 3D shapes and transformations (geometry: pattern),
// the balance (algebra) and the graph maker (data and chance: chance). Layouts, pins, student screens and sent copies
// saved with an old type are read as that mode of the tool it became, with the same widget id and the state intact.
import fs from 'node:fs';
import os from 'node:os';
process.env.BRB_DB = ':memory:'; process.env.BRB_SILENT = '1'; process.env.LOG_REQUESTS = '0';
process.env.BRB_DATA_DIR = fs.mkdtempSync(os.tmpdir() + '/brb-dashmerge-');
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q } = await import('../../server/db.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const games = await import('../../server/services/games.js');
const D = await import('../../server/services/dash.js');
const DT = await import('../../server/services/dash-tools.js');
const W = await import('../../public/js/dash-widgets.js');
const MO = await import('../../public/js/dash-modes.js');
const { createApp } = await import('../../server/app.js');
const { tFor } = await import('../../server/i18n/index.js');

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
const boss = createUser({ username: 'DashMergeBoss', password: 'secret123', role: 'admin' });
let worlds = 0;
function world() {
  const k = ++worlds;
  const oak = S.createSchool(boss, { name: `DashMerge Oak ${k}` }).school;
  const T = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Tia Teacher', role: 'teacher' }).user.id);
  const A = S.createClass(T, oak.id, { name: '5A' }).class;
  const kid = name => { const u = S.createSchoolAccount(T, oak.id, { rosterName: name }).user; S.addToClass(boss, A.id, u.id); return getUser(u.id); };
  return { oak, T, A, a1: kid('Ada Apple'), a2: kid('Abe Acorn') };
}
async function layout(w, widgets) {
  await as(w.T)(`/class/${w.A.id}/dashboard`);
  const l = D.layoutsOf(w.A.id, w.T.id)[0];
  const r = await as(w.T)(`/api/dash/${w.A.id}/layouts/${l.id}`, POST({ widgets }));
  assert.equal(r.status, 200, r.text);
  return r.json.layout;
}

/** The final mapping: each retired tool and the tool (and mode) it is now. */
const MAP = { base10: 'placeval', fdp: 'fractions', times: 'area', angle: 'geoboard', solids: 'pattern', transform: 'pattern', balance: 'algebra', graph: 'chance' };
/** A busy state of each retired tool, as it was saved (each differs from the tool's start). */
const OLD = {
  base10: { h: 3, t: 14, o: 7 },
  fdp: { n: 1, d: 7 },
  times: { size: 12, r: 7, c: 8, mark: 'row', hide: true },
  angle: { a: 235, proto: false, step: 15, arc: true },
  solids: { shape: 'cylinder', fold: 60, yaw: 40, mark: 'faces' },
  transform: { shape: 'arrow', ox: 2, oy: 1, op: 'rotate', dx: 3, dy: -5, axis: 'y', turn: 270, ghost: true, table: false },
  balance: { x: 4, lx: 5, lu: 3, rx: 2, ru: 15, show: false, where: 'both', hist: [{ lx: 6, lu: 3, rx: 3, ru: 15, op: 'subx', n: 0, w: 'both' }] },
  graph: { kind: 'dot', title: 'Pets', icon: 3, per: 2, rows: [{ l: 'Dogs', v: 4 }, { l: 'Cats', v: 6 }] },
};
// Bar models and number rods (docs/decisions.md): number rods is a maths tool of its own since then (fourteen).
const MATHS = ['fractions', 'numline', 'coord', 'placeval', 'tenframe', 'hundreds', 'area', 'tclock', 'geoboard', 'pattern', 'algebra', 'coins', 'chance', 'rods'];

test('the final mapping: thirteen maths tools in the library, each retired tool a mode of one', () => {
  assert.deepEqual(DT.MODE_HOME, MAP);
  for (const [old, home] of Object.entries(MAP)) {
    assert.equal(D.widgetType(old), null, `${old} has no library entry of its own`);
    assert.ok(D.widgetType(home).modes.includes(old), `${old} is a mode of ${home}`);
    assert.equal(D.widgetType(home).modes[0], home, `${home}'s own mode comes first`);
    assert.equal(typeof W.RENDER[old], 'function', `${old} still has its renderer (it draws the mode)`);
  }
  for (const role of ['teacher', 'student']) {
    const reg = D.registryFor(tFor('en'), role);
    const maths = reg.types.filter(x => x.group === 'teach' && x.send).map(x => x.id);
    assert.deepEqual(maths, MATHS, role);
    for (const old of Object.keys(MAP)) assert.ok(!reg.types.some(x => x.id === old), `${role}: no ${old}`);
  }
  // Each tool is as big as its biggest mode was, at its default and smallest size (the fit check proves the switch fits).
  const was = { base10: [[7, 6], [6, 5]], fdp: [[6, 5], [5, 4]], times: [[6, 8], [5, 8]], angle: [[6, 6], [5, 5]], solids: [[6, 7], [5, 7]], transform: [[7, 6], [6, 6]], balance: [[7, 6], [6, 6]], graph: [[5, 6], [5, 6]] };
  for (const [old, [size, min]] of Object.entries(was)) {
    const t = D.widgetType(MAP[old]);
    for (const i of [0, 1]) { assert.ok(t.size[i] >= size[i], `${t.id} size fits ${old}`); assert.ok(t.min[i] >= min[i], `${t.id} smallest fits ${old}`); }
  }
  // The names: every language has the new name, a description and every mode's name, translated.
  const en = D.registryFor(tFor('en'), 'teacher').types;
  assert.deepEqual(en.filter(x => x.modes).map(x => [x.id, x.name, x.modes.map(m => m.name)]), [
    ['fractions', 'Fractions', ['Fraction bars', 'Fraction, decimal, percent']],
    ['placeval', 'Place value', ['Place value chart', 'Base-ten blocks']],
    ['area', 'Multiply and divide', ['Area model and arrays', 'Times table grid', 'Bar models']],
    ['geoboard', 'Shape board', ['Geoboard', 'Angle maker']],
    ['pattern', 'Geometry', ['Pattern blocks', '3D shapes and nets', 'Transformations']],
    ['algebra', 'Algebra', ['Algebra tiles', 'Balance scale']],
    ['chance', 'Data and chance', ['Chance lab', 'Graph maker']]]);
  assert.equal(en.find(x => x.id === 'hundreds').name, 'Number chart');
  for (const loc of ['ar', 'de', 'es', 'fr', 'he', 'it', 'ja', 'nl', 'pt', 'ru', 'zh-Hant']) {
    const reg = D.registryFor(tFor(loc), 'teacher');
    for (const x of reg.types.filter(y => y.modes || y.id === 'hundreds')) {
      const e = en.find(y => y.id === x.id);
      assert.ok(!/^dash\./.test(x.name) && !/^dash\./.test(x.desc), `${loc} ${x.id}`);
      // The same word in English: "Algebra" in German, Italian and Dutch, "Fractions" in French.
      if (!['de algebra', 'it algebra', 'nl algebra', 'fr fractions'].includes(`${loc} ${x.id}`)) assert.notEqual(x.name, e.name, `${loc} ${x.id} name translated`);
      assert.notEqual(x.desc, e.desc, `${loc} ${x.id} desc translated`);
      // A mode's name is the old tool's name in that language ("Transformations" is French too).
      for (const m of x.modes || []) assert.ok(m.name && !/^dash\./.test(m.name), `${loc} ${x.id}.${m.id}`);
      for (const m of x.modes || []) if (m.id !== x.id) assert.equal(m.name, tFor(loc)(`dash.w.${m.id}.name`), `${loc} ${m.id}: the old tool's name`);
    }
    assert.ok(reg.common.modeFor.includes('{name}') && reg.common.modeFor !== D.registryFor(tFor('en'), 'teacher').common.modeFor, loc);
  }
  assert.equal(D.registryFor(tFor('it'), 'teacher').types.find(x => x.id === 'placeval').name, 'Valore posizionale');
  // en-GB: its own spelling where it differs (the times tables grid), never an old description of a combined tool.
  const gb = D.registryFor(tFor('en-GB'), 'teacher').types;
  assert.equal(gb.find(x => x.id === 'area').modes[1].name, 'Times tables grid');
  for (const id of ['geoboard', 'pattern', 'algebra', 'chance']) assert.equal(gb.find(x => x.id === id).desc, en.find(x => x.id === id).desc, id);
});

test('help per mode, in every language: each mode keeps its own instruction, ⓘ points and Try idea', () => {
  for (const loc of ['en', 'en-GB', 'ar', 'de', 'es', 'fr', 'he', 'it', 'ja', 'nl', 'pt', 'ru', 'zh-Hant']) {
    const reg = D.registryFor(tFor(loc), 'teacher');
    for (const x of reg.types.filter(y => y.modes)) {
      for (const m of x.modes) {
        const words = m.id === x.id ? x.words : m.words;
        for (const k of ['howto', 'helpUse', 'helpIdeas']) assert.ok(words[k] && !/^dash\./.test(words[k]), `${loc} ${x.id}.${m.id}.${k}`);
        assert.ok(words.helpUse.split('\n').length <= 3, `${loc} ${m.id}: at most three points`);
        if (m.id !== x.id) { assert.deepEqual(m.def, DT.cleanToolState(m.id, {})); assert.equal(m.icon, D.MODE_ICONS[m.id]); }
      }
    }
  }
  // The help panel is named for the mode: the wrapper hands the mode's name and words to the tool's own renderer.
  const src = fs.readFileSync('public/js/dash-modes.js', 'utf8');
  assert.match(src, /name: mode\.name, words: mode\.words/);
  assert.match(src, /\{ \.\.\.type, name: mode\.name \}/);
});

test('every retired type migrates: a layout, the pins, a student screen, same id, state intact, boxes grown', async () => {
  const w = world(); const T = as(w.T), K = as(w.a1);
  const l = await layout(w, [{ id: 'clock1', type: 'clock' }]);
  const olds = Object.keys(OLD).map((type, i) => ({ id: `old${type}`, type, x: 0, y: i * 3, w: 4, h: 3, s: { state: OLD[type] } }));
  q.run('UPDATE dash_layouts SET widgets=? WHERE id=?', JSON.stringify(olds), l.id);
  q.run('INSERT INTO dash_students(class_id, user_id, widgets, pins, bg, updated_at) VALUES (?,?,?,?,?,?)', w.A.id, w.a1.id,
    JSON.stringify([{ id: 'myAngle', type: 'angle', x: 0, y: 0, w: 5, h: 5, s: { state: OLD.angle } }, { id: 'myGraph', type: 'graph', x: 6, y: 0, w: 5, h: 6, s: { state: OLD.graph } }]), '{}', JSON.stringify({ kind: 'color', id: 'sky' }), Date.now());
  // A pin of an old tool can't be made (tools are never pinned), but a stored one would still read (read like a layout).
  q.run('UPDATE dash_class SET pins=? WHERE class_id=?', JSON.stringify([{ id: 'pinTimes', type: 'times', x: 0, y: 0, w: 6, h: 8, s: { state: OLD.times } }]), w.A.id);

  const read = D.layoutsOf(w.A.id, w.T.id)[0].widgets;
  assert.equal(read.length, olds.length, 'none is dropped');
  for (const x of read) {
    const old = x.id.slice(3), home = MAP[old], t = D.widgetType(home);
    assert.equal(x.type, home, old);
    assert.equal(x.s.state.tab, old, `${old} shows its mode`);
    assert.deepEqual(x.s.state[old], DT.cleanToolState(old, OLD[old]), `${old}: its state is kept as it was`);
    assert.deepEqual(x.s.state[old], OLD[old], `${old}: nothing lost`);
    assert.ok(x.w >= t.min[0] && x.h >= t.min[1], `${old}: grown to the tool's smallest size`);
    // The tool's own keys are its start: nothing of the old state leaks into them.
    const own = MO.modeState(x.s.state, home, t.modes, home);
    assert.deepEqual({ ...DT.cleanToolState(home, {}), ...own }, DT.cleanToolState(home, {}), old);
  }
  // A layout that has the room (24 rows): what a grown widget would cover moves down below it.
  const grown = D.migrateWidgets([{ id: 'g1', type: 'fdp', x: 0, y: 0, w: 5, h: 4, s: {} }, { id: 'g2', type: 'clock', x: 0, y: 4, w: 3, h: 2, s: {} },
    { id: 'g3', type: 'angle', x: 6, y: 0, w: 5, h: 5, s: {} }, { id: 'g4', type: 'note', x: 6, y: 5, w: 3, h: 3, s: {} }]);
  assert.deepEqual(grown.map(x => [x.id, x.x, x.y, x.w, x.h]), [['g1', 0, 0, 5, 8], ['g2', 0, 8, 3, 2], ['g3', 6, 0, 5, 8], ['g4', 6, 8, 3, 3]]);
  assert.deepEqual(D.pinsOf(w.A.id).map(x => [x.id, x.type, x.s.state.tab]), [['pinTimes', 'area', 'times']]);
  const me = D.studentState(w.A.id, w.a1.id);
  assert.deepEqual(me.widgets.map(x => [x.id, x.type, x.s.state.tab, x.s.state[x.s.state.tab]]), [['myAngle', 'geoboard', 'angle', OLD.angle], ['myGraph', 'chance', 'graph', OLD.graph]]);
  // The pages never carry a retired type.
  const tPage = (await T(`/class/${w.A.id}/dashboard`)).text, sPage = (await K(`/class/${w.A.id}/dashboard`)).text;
  for (const page of [tPage, sPage]) for (const old of Object.keys(MAP)) assert.doesNotMatch(page, new RegExp(`"type":"${old}"`), old);
  // Saved as the browser now has it: stored as the new types; a student's own screen too.
  await layout(w, read);
  const stored = JSON.parse(q.get('SELECT widgets FROM dash_layouts WHERE id=?', l.id).widgets);
  assert.deepEqual(stored.map(x => [x.id, x.type, x.s.state.tab]), read.map(x => [x.id, x.type, x.s.state.tab]));
  const saved = (await K(`/api/dash/${w.A.id}/me`, POST({ widgets: me.widgets }))).json.state;
  assert.deepEqual(saved.widgets.map(x => [x.type, x.s.state.tab]), [['geoboard', 'angle'], ['chance', 'graph']]);
  // A browser that still sends an old type is read the same way.
  assert.deepEqual(D.cleanWidgets([{ id: 'b1', type: 'balance', s: { state: OLD.balance } }], 'student').map(x => [x.type, x.s.state.tab, x.s.state.balance]), [['algebra', 'balance', OLD.balance]]);
});

test('old states of the surviving tools load unchanged; a state of every mode is kept when switching', () => {
  const c = DT.cleanToolState;
  // Saved before the modes: exactly as they were (no tab, no other mode's key).
  const before = {
    placeval: { v: 9876543, discs: false, dec: true }, fractions: { shape: 'circle', bars: [{ n: 3, d: 4 }], same: true, hide: false },
    area: { a: 23, b: 14, view: 'area', sa: 20, sb: 10 }, pattern: { blocks: [{ k: 'hex', x: 3, y: 5, r: 0 }] }, algebra: { tiles: [{ k: 'x', neg: true }] },
    chance: { kind: 'dice', dice: 2, parts: 4, runs: 1000, counts: [1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1] }, geoboard: { pegs: 9, cur: 0, show: true, bands: [{ pts: [{ x: 1, y: 1 }, { x: 4, y: 1 }, { x: 4, y: 4 }], closed: true }] },
    hundreds: { start: 1, shade: [5, 10], skip: 5, hide: 'none' },
  };
  for (const [id, s] of Object.entries(before)) { assert.deepEqual(c(id, s), c(id, c(id, s)), id); assert.ok(!('tab' in c(id, s)), id); for (const m of DT.TOOL_MODES[id] || []) if (m !== id) assert.ok(!(m in c(id, s)), `${id}.${m}`); }
  assert.deepEqual(c('placeval', before.placeval), before.placeval);
  assert.deepEqual(c('hundreds', before.hundreds), before.hundreds, 'no upto unless it is 1-120');
  // Every mode's work at once: switching tabs never loses any of it.
  const all = { ...before.pattern, tab: 'transform', solids: OLD.solids, transform: OLD.transform };
  for (const tab of ['pattern', 'solids', 'transform']) {
    const s = c('pattern', { ...all, tab });
    assert.equal(s.tab, tab === 'pattern' ? undefined : tab);
    assert.deepEqual([s.blocks, s.solids, s.transform], [before.pattern.blocks, OLD.solids, OLD.transform], tab);
  }
  // Each part is cleaned by its own spec: clamped, unknown keys and modes dropped, a part at its start not stored.
  const dirty = c('area', { a: 4, tab: 'times', times: { size: 99, r: 99, evil: 1 }, base10: { h: 9 }, fdp: 'x' });
  assert.deepEqual(dirty, { ...c('area', {}), tab: 'times' }, 'a times table at its start, base10 is no mode of area');
  assert.equal(c('area', { tab: 'nope' }).tab, undefined);
  assert.equal(c('area', { tab: 'area' }).tab, undefined, 'the own mode is never stored');
  assert.equal(c('fractions', { tab: 'fdp', fdp: { n: 50, d: 7 } }).fdp.n, 7, 'fdp: never more than one whole');
  // A student's own screen drops shape board labels and drawings, in whatever mode it is.
  const gbs = c('geoboard', { tab: 'angle', angle: { a: 90 }, notes: [{ x: 1, y: 1, t: 'hi' }] }, { student: true });
  assert.deepEqual([gbs.tab, gbs.angle.a, gbs.notes], ['angle', 90, undefined]);
  // The browser's helpers: a mode's part and the whole state put back together.
  const st = { v: 5, discs: true, dec: true, tab: 'base10', base10: { h: 1, t: 2, o: 3 } }, modes = ['placeval', 'base10'];
  assert.deepEqual(MO.modeState(st, 'placeval', modes, 'placeval'), { v: 5, discs: true, dec: true });
  assert.deepEqual(MO.modeState(st, 'placeval', modes, 'base10'), { h: 1, t: 2, o: 3 });
  assert.deepEqual(MO.withMode(st, 'placeval', modes, 'placeval', { v: 77, discs: false, dec: true }), { v: 77, discs: false, dec: true, tab: 'base10', base10: { h: 1, t: 2, o: 3 } });
  assert.deepEqual(MO.withMode(st, 'placeval', modes, 'base10', { h: 9, t: 0, o: 0 }), { ...st, base10: { h: 9, t: 0, o: 0 } });
  assert.equal(MO.modeState({ v: 1 }, 'placeval', modes, 'base10'), null, 'a mode never opened starts from its own start');
});

test('sent copies: an old push opens as the mode; a new one carries the whole tool; nothing comes back', async () => {
  const w = world(); const T = as(w.T), K = as(w.a1);
  await layout(w, [{ id: 'pv', type: 'placeval', s: { state: { v: 42, tab: 'base10', base10: { h: 2, t: 0, o: 5 } } } }]);
  // Pushed before the change (dash_pushes.data with an old type): opens for students as that mode.
  for (const [i, old] of Object.keys(OLD).entries()) {
    q.run('INSERT INTO dash_pushes(id, class_id, day, kind, ref, title, by_id, created_at, data) VALUES (?,?,?,?,?,?,?,?,?)', `oldpush${i}`, w.A.id, D.dayOf(w.A), 'tool', `old${old}`, old, w.T.id, Date.now() - 1000 + i, JSON.stringify({ type: old, state: OLD[old] }));
  }
  const live = (await K(`/api/dash/${w.A.id}/live`)).json;
  for (const [i, old] of Object.keys(OLD).entries()) {
    const p = live.pushes.find(x => x.id === `oldpush${i}`);
    assert.ok(p, old); assert.equal(p.href, `#tool-oldpush${i}`);
    assert.deepEqual([p.tool.type, p.tool.state.tab, p.tool.state[old]], [MAP[old], old, OLD[old]], old);
  }
  assert.equal(q.get("SELECT data FROM dash_pushes WHERE id='oldpush0'").data, JSON.stringify({ type: 'base10', state: OLD.base10 }), 'the stored push is never rewritten');
  // Sent now: the whole state (both modes) as the teacher has it.
  const r = await T(`/api/dash/${w.A.id}/pushes`, POST({ kind: 'tool', ref: 'pv', state: { v: 42, tab: 'base10', base10: { h: 3, t: 1, o: 0 } } }));
  assert.equal(r.status, 200, r.text);
  const sent = (await K(`/api/dash/${w.A.id}/live`)).json.pushes.find(x => x.id === r.json.push);
  assert.deepEqual(sent.tool, { type: 'placeval', state: { ...DT.cleanToolState('placeval', {}), v: 42, tab: 'base10', base10: { h: 3, t: 1, o: 0 } } });
  // A student pins their copy: kept on their own screen in the mode they left it.
  const saved = (await K(`/api/dash/${w.A.id}/me`, POST({ widgets: [{ id: 'mine1', type: 'placeval', x: 0, y: 2, w: 7, h: 7, s: { state: sent.tool.state } }] }))).json.state;
  assert.deepEqual(saved.widgets[0].s.state.base10, { h: 3, t: 1, o: 0 });
  // The browser names a sent tool by its mode and keeps the copy in this browser (copies.set), as before.
  const page = fs.readFileSync('public/js/dash.js', 'utf8');
  assert.match(page, /const toolName = tool =>/);
  assert.match(page, /keep: state => copies\.set\(pid, state\)/);
});

test('Practice it: each mode resolves its own games; ready-made layouts still make their tools', () => {
  // PRACTICE is keyed by mode (a retired tool's id is its mode's id): every key is a tool or a mode of one.
  const modes = new Set(D.WIDGETS.flatMap(x => x.modes || [x.id]));
  for (const k of Object.keys(D.PRACTICE)) assert.ok(modes.has(k), k);
  for (const [old, games] of Object.entries({ base10: ['rocket-supply'], times: ['sum-racer'], angle: ['keep-builder'], solids: ['shape-hunt', 'keep-builder'], transform: ['keep-builder'], balance: ['balance-bridge', 'machine-line'], graph: ['data-detective'] })) assert.deepEqual(D.PRACTICE[old], games, old);
  // practiceFor gives one list per mode with a game; the page looks each mode up (ctx.practiceOf) and the wrapper uses it.
  const w = world();
  const official = q.get("SELECT * FROM users WHERE username='OombaAcademy'") || createUser({ username: 'OombaAcademy', password: 'secret123', role: 'admin' });
  for (const slug of ['rocket-supply', 'sum-racer', 'data-detective']) {
    const g = games.createGame(official.id, { title: slug, icon: '🎮' }); const v = games.addVersion(g.id, '<title>G</title><canvas></canvas>');
    q.run("UPDATE games SET slug=?, source='seed', status='published', visibility='public', published_version_id=? WHERE id=?", slug, v.id || v, g.id);
  }
  const p = D.practiceFor(w.A);
  assert.deepEqual(['base10', 'times', 'graph', 'placeval'].map(k => (p[k] || []).map(x => x.href)), [['/play/rocket-supply'], ['/play/sum-racer'], ['/play/data-detective'], ['/play/rocket-supply']]);
  assert.match(fs.readFileSync('public/js/dash.js', 'utf8'), /practiceOf: mode => \(D\.practice \|\| \{\}\)\[mode\] \|\| \[\]/);
  assert.match(fs.readFileSync('public/js/dash-modes.js', 'utf8'), /practice: ctx\.practiceOf \? ctx\.practiceOf\(m\)/);
  // Every ready-made layout's widgets are in the registry; the Lesson layout's number line is unchanged.
  for (const tpl of D.LAYOUT_TEMPLATES) for (const x of D.templateWidgets(tpl.id, tFor('en'))) assert.ok(D.widgetType(x.type), `${tpl.id}: ${x.type}`);
  const nl = D.templateWidgets('lesson', tFor('en')).find(x => x.type === 'numline');
  assert.deepEqual([nl.w, nl.h, nl.s.state], [8, 4, DT.cleanToolState('numline', {})]);
});

test('the number chart runs 1-120; the wrapper stays small, local and safe', () => {
  const c = DT.cleanToolState;
  assert.deepEqual(c('hundreds', { upto: 120, shade: [1, 101, 120, 121] }), { start: 1, shade: [1, 101, 120], skip: 0, hide: 'none', upto: 120 });
  assert.deepEqual(c('hundreds', { start: 0, upto: 120, shade: [0, 99, 101] }), { start: 0, shade: [0, 99], skip: 0, hide: 'none' }, '0-99 has no 1-120');
  const src = fs.readFileSync('public/js/dash-modes.js', 'utf8');
  for (const bad of [/\bfetch\s*\(/, /XMLHttpRequest/, /localStorage|sessionStorage|indexedDB/, /innerHTML/, /WebSocket/]) assert.doesNotMatch(src, bad, String(bad));
  assert.ok(src.split('\n').length < 150, 'a thin wrapper, not a giant file');
  assert.match(fs.readFileSync('public/js/dash-widgets.js', 'utf8'), /withModes\(\{ \.\.\.TOOLS, \.\.\.TOOLS4, bars, rods \}\)/);
});
