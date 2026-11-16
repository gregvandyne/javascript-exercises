// Ready-made layouts (docs/decisions.md "Ready-made layouts"; services/dash.js LAYOUT_TEMPLATES, routes/dash.js
// POST /api/dash/:id/templates/:tid, public/js/dash.js newSheet): every template builds valid widgets in every language,
// fits the 12-column grid with no overlaps at no less than each type's smallest size, pins only what may be pinned, and
// is made only by the class's own teacher, within MAX_LAYOUTS.
import fs from 'node:fs';
import os from 'node:os';
process.env.BRB_DB = ':memory:'; process.env.BRB_SILENT = '1'; process.env.LOG_REQUESTS = '0';
process.env.BRB_DATA_DIR = fs.mkdtempSync(os.tmpdir() + '/brb-dash-tpl-');
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const D = await import('../../server/services/dash.js');
const { createApp } = await import('../../server/app.js');
const { tFor, CODES, lookup } = await import('../../server/i18n/index.js');

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = (who, lang) => async (p, { method = 'GET', body } = {}) => {
  const headers = who ? { cookie: cookieFor(who.id) + (lang ? `; lang=${lang}` : '') } : {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + p, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json };
};
const POST = body => ({ method: 'POST', body });

const boss = createUser({ username: 'TplBoss', password: 'secret123', role: 'admin' });
let worlds = 0;
function world() {
  const k = ++worlds;
  const oak = S.createSchool(boss, { name: `Tpl Oak ${k}` }).school;
  const T = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Tia Teacher', role: 'teacher' }).user.id);
  const T2 = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Tom Other', role: 'teacher' }).user.id);
  const SA = createUser({ username: `TplSA${k}`, password: 'secret123' }); S.addMember(boss, oak.id, SA.id, 'admin');
  const A = S.createClass(T, oak.id, { name: '3A' }).class, B = S.createClass(T2, oak.id, { name: '3B' }).class;
  const kid = name => { const u = S.createSchoolAccount(T, oak.id, { rosterName: name }).user; S.addToClass(boss, A.id, u.id); return getUser(u.id); };
  const a1 = kid('Ada Apple'), a2 = kid('Abe Acorn');
  const stranger = createUser({ username: `TplStr${k}`, password: 'secret123' });
  return { T, T2, SA, A, B, a1, a2, stranger };
}
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test('the six ready-made layouts, as asked: their widgets, pins and backgrounds', () => {
  assert.deepEqual(D.LAYOUT_TEMPLATES.map(x => x.id), ['morning', 'lesson', 'math', 'group', 'quiet', 'fun']);
  const t = tFor('en'), types = id => D.templateWidgets(id, t).map(w => w.type).sort();
  assert.deepEqual(types('morning'), ['clock', 'ican', 'jobs', 'mood', 'schedule']);
  assert.deepEqual(types('lesson'), ['check', 'help', 'light', 'numline', 'timer']);
  assert.deepEqual(types('math'), ['fractions', 'help', 'numline', 'timer']);
  assert.deepEqual(types('group'), ['groups', 'noise', 'score', 'timer']);
  assert.deepEqual(types('quiet'), ['breathe', 'light', 'symbols', 'timer']);
  assert.deepEqual(types('fun'), ['breathe', 'dice', 'picker', 'score', 'timer', 'video'], 'a team scoreboard where the stickers were (removed)');
  const pinned = id => D.templateWidgets(id, t).filter(w => w.pin).map(w => w.type).sort();
  assert.deepEqual(pinned('morning'), ['ican', 'jobs', 'mood'], 'goal, mood and jobs on student screens');
  assert.deepEqual(pinned('lesson'), ['help'], 'the help queue on student screens (a quick check reaches them when it is sent)');
  assert.deepEqual(pinned('math'), ['help'], 'Math: the help queue on student screens'); 
  const get = (id, type) => D.templateWidgets(id, t).find(w => w.type === type).s;
  assert.equal(get('morning', 'schedule').view, 'nownext');
  assert.equal(get('morning', 'schedule').periods.length, 8);
  assert.equal(get('quiet', 'light').color, 'red');
  assert.equal(get('quiet', 'symbols').mode, 'silent');
  assert.equal(get('fun', 'picker').mode, 'wheel');
  assert.ok(get('fun', 'timer').minutes >= 3 && get('fun', 'timer').minutes <= 5, 'a short brain break');
  assert.equal(get('fun', 'video').video, null, 'an empty video slot for the teacher\'s own');
  assert.equal(get('group', 'score').mode, 'teams');
  assert.equal(get('fun', 'score').mode, 'teams');
  assert.equal(get('fun', 'score').teams.split('\n').length, 4, 'four sample teams');
  // Fun break and Math fill the whole 12 x 8 grid: no gaps (no overlaps is checked for every template below).
  for (const id of ['fun', 'math']) assert.equal(D.templateWidgets(id, t).reduce((n, w) => n + w.w * w.h, 0), 12 * 8, id);
  // Math: a number line counting in quarters from 0 to 2 beside the fraction bars, a 10-minute timer, a real colour.
  assert.deepEqual(['lo', 'hi', 'sub', 'mode'].map(k => get('math', 'numline').state[k]), [0, 2, 4, 'fraction']);
  assert.equal(get('math', 'timer').minutes, 10);
  assert.deepEqual(D.layoutTemplate('math').bg, { kind: 'color', id: 'leaf' });
  // Only maths tool ids that survive the maths tools' merge into fewer types with modes (so the layout keeps working).
  const SURVIVE = ['fractions', 'numline', 'area', 'tenframe', 'hundreds', 'placeval', 'geoboard', 'pattern', 'algebra', 'chance', 'coins', 'tclock'];
  for (const x of D.LAYOUT_TEMPLATES) for (const w of D.templateWidgets(x.id, t)) if (D.MATH_TOOLS.includes(w.type)) assert.ok(SURVIVE.includes(w.type), `${x.id}: ${w.type}`);
  for (const x of D.LAYOUT_TEMPLATES) assert.deepEqual(D.cleanBg(x.bg), x.bg, `${x.id}: a real background`);
  assert.deepEqual(D.layoutTemplate('fun').bg, { kind: 'art', id: 'sparks' });
});

test('every template builds valid widgets in every language: on the grid, no overlaps, at least the smallest size, allowed pins', () => {
  for (const code of CODES) {
    const t = tFor(code);
    for (const tpl of D.LAYOUT_TEMPLATES) {
      const raw = tpl.widgets(t), built = D.templateWidgets(tpl.id, t), where = `${code} ${tpl.id}`;
      assert.equal(built.length, raw.length, `${where}: cleanWidgets kept every widget`);
      assert.ok(built.length <= D.MAX_WIDGETS);
      // Rebuilding what was built changes nothing: the template already is what cleanWidgets would store.
      assert.deepEqual(D.cleanWidgets(built, 'teacher'), built, where);
      built.forEach((w, i) => {
        const type = D.widgetType(w.type), [, [x, y, ww, h], s = {}, pin = false] = raw[i];
        assert.deepEqual({ x: w.x, y: w.y, w: w.w, h: w.h }, { x, y, w: ww, h }, `${where} ${w.type}: the box as designed, not clamped`);
        assert.ok(D.canAdd(type, 'teacher'), `${where} ${w.type}`);
        assert.ok(w.w >= type.min[0] && w.h >= type.min[1], `${where} ${w.type}: at least ${type.min}`);
        assert.ok(w.x >= 0 && w.x + w.w <= D.COLS && w.y + w.h <= D.MAX_ROWS && w.h <= D.MAX_H, `${where} ${w.type}: on the 12-column grid`);
        assert.equal(!!w.pin, !!pin, `${where} ${w.type}: pinned as designed`);
        if (w.pin) assert.ok(D.canPin(type), `${where} ${w.type} may be pinned`);
        // Every setting the template gives survives cleaning as given (so nothing silently falls back).
        for (const [k, v] of Object.entries(s)) assert.deepEqual(w.s[k], typeof v === 'string' ? v.trim() : v, `${where} ${w.type}.${k}`);
        for (const o of built.slice(0, i)) assert.ok(!overlap(w, o), `${where}: ${w.type} overlaps ${o.type}`);
      });
      assert.equal(new Set(built.map(w => w.id)).size, built.length, `${where}: unique ids`);
      assert.ok(Math.max(...built.map(w => w.y + w.h)) <= 8, `${where}: fits a screen (8 rows at most)`);
      // Sample content is in this language, from the locale file (or the English fallback), never a raw key.
      for (const w of built) for (const v of Object.values(w.s)) assert.doesNotMatch(JSON.stringify(v), /dash\.tpl\./, where);
    }
    // The sheet's list, in this language.
    for (const x of D.templatesFor(t)) { assert.ok(x.name && x.desc && x.icon, `${code} ${x.id}`); assert.doesNotMatch(x.name + x.desc, /^dash\./); }
  }
});

test('sample content is translated in every locale and kid-appropriate', () => {
  const keys = Object.keys(JSON.parse(fs.readFileSync('server/i18n/locales/en.json', 'utf8')).dash.tpl).flatMap(g =>
    Object.keys(JSON.parse(fs.readFileSync('server/i18n/locales/en.json', 'utf8')).dash.tpl[g]).map(k => `dash.tpl.${g}.${k}`));
  assert.ok(keys.length >= 24, String(keys.length));
  const money = /\$\s?\d|€\s?\d|£\s?\d|\/plans|upgrade|free trial|Teacher plan|School plan|pricing|\bPro\b|price|buy now/i;
  for (const code of CODES.filter(c => c !== 'en' && c !== 'en-GB')) for (const k of [...keys, 'dash.errors.template', 'js.dash.tpl.heading', 'js.dash.tpl.own', 'js.dash.tpl.ownName', 'js.dash.tpl.ownDesc']) {
    const v = lookup(code, k); assert.ok(typeof v === 'string' && v.trim(), `${code} ${k}`);
    // The same word as English only where the language really uses it (Dutch "Lunch").
    if (!(code === 'nl' && k === 'dash.tpl.periods.lunch')) assert.notEqual(v, lookup('en', k), `${code} ${k} is translated`);
    assert.doesNotMatch(v, money, `${code} ${k}`);
  }
  // British spelling where it differs.
  assert.equal(lookup('en-GB', 'dash.tpl.periods.maths'), 'Maths');
  assert.equal(lookup('en-GB', 'dash.tpl.math.name'), 'Maths');
  assert.equal(lookup('en', 'dash.tpl.math.name'), 'Math');
  assert.equal(lookup('it', 'dash.tpl.math.name'), 'Matematica');
  assert.equal(lookup('de', 'dash.tpl.math.name'), 'Mathe');
  // Team names and jobs are one a line, a handful each.
  for (const code of CODES) {
    const t = tFor(code);
    assert.equal(t('dash.tpl.group.teams').split('\n').length, 4, code);
    assert.equal(t('dash.tpl.morning.jobs').split('\n').length, 5, code);
  }
});

test('the route: only the class\'s own teacher, CSRF and a rate limit like making any layout, and MAX_LAYOUTS holds', async () => {
  const w = world();
  await as(w.T)(`/class/${w.A.id}/dashboard`);
  const url = `/api/dash/${w.A.id}/templates/morning`;
  for (const who of [w.a1, w.T2, w.SA, w.stranger]) assert.equal((await as(who)(url, POST({ name: 'x' }))).status, 404, who.username);
  assert.equal((await as(null)(url, POST({}))).status === 200, false, 'signed out: no');
  assert.equal(D.layoutsOf(w.A.id, w.T.id).length, D.DEFAULT_SET.length, 'nothing was made beyond the first visit\'s set');
  // A cross-site form post is refused by the site's same-origin check, as for every other write.
  const cross = await fetch(base + url, { method: 'POST', headers: { cookie: cookieFor(w.T.id), 'content-type': 'application/json', origin: 'https://evil.example' }, body: '{}' });
  assert.equal(cross.status, 403);
  // The route is written like the create-layout route: requireUser, the same rate limit, teacher only.
  const src = fs.readFileSync('server/routes/dash.js', 'utf8');
  assert.match(src, /router\.post\('\/api\/dash\/:id\/templates\/:tid', requireUser, rateLimit\('dash-layout', 120, 3600e3\), \(req, res\) => \{\n\s+const x = load\(req, res, \{ teacher: true \}\);/);
  // The teacher: a layout in their language, name editable, an unknown template refused.
  const r = await as(w.T, 'it')(url, POST({ name: '' }));
  assert.equal(r.status, 200);
  assert.equal(r.json.layout.name, 'Inizio giornata', 'the template\'s name in the teacher\'s language when none is typed');
  assert.equal(r.json.layout.widgets.find(x => x.type === 'schedule').s.periods[1].name, 'Matematica');
  assert.deepEqual(r.json.layout.bg, { kind: 'art', id: 'hills' });
  const named = await as(w.T)(`/api/dash/${w.A.id}/templates/fun`, POST({ name: '  Friday fun  ' }));
  assert.equal(named.json.layout.name, 'Friday fun');
  assert.equal((await as(w.T)(`/api/dash/${w.A.id}/templates/nope`, POST({}))).status, 400);
  assert.equal((await as(w.T)(`/api/dash/${w.A.id}/templates/__proto__`, POST({}))).status, 400);
  // Two layouts from one template never share a widget id (a running timer is kept per widget id).
  const again = await as(w.T)(`/api/dash/${w.A.id}/templates/fun`, POST({}));
  const ids = l => l.widgets.map(x => x.id);
  assert.equal(ids(named.json.layout).filter(id => ids(again.json.layout).includes(id)).length, 0);
  // It is an ordinary layout: renamed, changed and used like any other; its pins reach students when it is used.
  const lid = r.json.layout.id;
  assert.equal((await as(w.T)(`/api/dash/${w.A.id}/layouts/${lid}`, POST({ name: 'Buongiorno' }))).json.layout.name, 'Buongiorno');
  await as(w.T)(`/api/dash/${w.A.id}/layouts/${lid}/use`, POST({}));
  assert.deepEqual(D.pinsOf(w.A.id).map(x => x.type).sort(), ['ican', 'jobs', 'mood']);
  // MAX_LAYOUTS: the same error as any new layout.
  while (D.layoutsOf(w.A.id, w.T.id).length < D.MAX_LAYOUTS) await as(w.T)(`/api/dash/${w.A.id}/templates/quiet`, POST({}));
  const full = await as(w.T)(`/api/dash/${w.A.id}/templates/lesson`, POST({}));
  assert.equal(full.status, 400);
  assert.equal(full.json.error, tFor('en')('dash.errors.tooMany'));
  assert.equal(D.layoutsOf(w.A.id, w.T.id).length, D.MAX_LAYOUTS);
});

test('the teacher\'s page lists the templates (Math among them); a student\'s page carries none of them', async () => {
  const w = world();
  const page = (await as(w.T, 'it')(`/class/${w.A.id}/dashboard`)).text;
  assert.match(page, /"templates":\[\{"id":"morning","icon":"🌅","name":"Inizio giornata"/);
  assert.match(page, /\{"id":"math","icon":"🔢","name":"Matematica","desc":"[^"]+"\}/);
  const kid = (await as(w.a1)(`/class/${w.A.id}/dashboard`)).text;
  assert.doesNotMatch(kid, /"templates"|Morning start|dash-tpl/);
  assert.doesNotMatch(kid, /Ada Apple|Abe Acorn|Tia Teacher/);
  // The New layout sheet offers them; the copy-or-fresh choice is still there.
  const js = fs.readFileSync('public/js/dash.js', 'utf8');
  assert.match(js, /\/api\/dash\/\$\{CID\}\/templates\//);
  assert.match(js, /copyFrom: \$\('#dash-name-copy', sh\.el\)\.checked \? S\.layoutId : null/);
  // No AI, nothing about students sent anywhere.
  assert.doesNotMatch(fs.readFileSync('server/services/dash.js', 'utf8'), /anthropic|\bclaude\b|openai/i);
});

// ---------------------------------------------------------------- the first visit: the whole ready-made set
const names = (c, u) => D.layoutsOf(c.id, u.id).map(l => l.name);
test('a teacher\'s first visit makes the six ready-made layouts in order, in their language; Morning start is the one students follow', async () => {
  assert.deepEqual(D.DEFAULT_SET, ['morning', 'lesson', 'math', 'group', 'quiet', 'fun']);
  assert.ok(D.DEFAULT_SET.length <= D.MAX_LAYOUTS);
  const w = world();
  assert.equal(D.layoutsOf(w.A.id, w.T.id).length, 0);
  const page = await as(w.T)(`/class/${w.A.id}/dashboard`);
  assert.equal(page.status, 200);
  assert.deepEqual(names(w.A, w.T), ['Morning start', 'Lesson', 'Math', 'Group work', 'Quiet work', 'Fun break']);
  const list = D.layoutsOf(w.A.id, w.T.id), t = tFor('en');
  // Each is the template as designed (types, boxes, pins, background), with its own widget ids.
  list.forEach((l, i) => {
    const tpl = D.layoutTemplate(D.DEFAULT_SET[i]), want = D.templateWidgets(tpl.id, t);
    assert.deepEqual(l.widgets.map(x => [x.type, x.x, x.y, x.w, x.h, !!x.pin]), want.map(x => [x.type, x.x, x.y, x.w, x.h, !!x.pin]), l.name);
    assert.deepEqual(l.bg, tpl.bg, l.name);
    assert.equal(l.position, i);
  });
  assert.equal(new Set(list.flatMap(l => l.widgets.map(x => x.id))).size, list.reduce((n, l) => n + l.widgets.length, 0), 'no widget id shared between layouts');
  // Morning start is on screen and the one students follow (its goal, mood check-in and jobs pinned).
  assert.equal(D.classState(w.A.id).layout_id, list[0].id);
  assert.match(page.text, new RegExp(`"current":"${list[0].id}","active":"${list[0].id}"`));
  assert.deepEqual(D.pinsOf(w.A.id).map(p => p.type).sort(), ['ican', 'jobs', 'mood']);
  // The page lists the six chips' names.
  assert.match(page.text, /"layouts":\[\{"id":"[^"]+","name":"Morning start"/);
  // A second visit (and a third, in another language) makes nothing more and changes nothing.
  const before = JSON.stringify(D.layoutsOf(w.A.id, w.T.id));
  await as(w.T)(`/class/${w.A.id}/dashboard`); await as(w.T, 'it')(`/class/${w.A.id}/dashboard`);
  assert.equal(JSON.stringify(D.layoutsOf(w.A.id, w.T.id)), before);
  // Another teacher's first visit to their own class: their set, in their language (Italian names and sample words).
  await as(w.T2, 'it')(`/class/${w.B.id}/dashboard`);
  assert.deepEqual(names(w.B, w.T2), D.DEFAULT_SET.map(id => tFor('it')(`dash.tpl.${id}.name`)));
  assert.equal(names(w.B, w.T2)[0], 'Inizio giornata'); assert.equal(names(w.B, w.T2)[2], 'Matematica');
  assert.equal(D.layoutsOf(w.B.id, w.T2.id)[0].widgets.find(x => x.type === 'schedule').s.periods[1].name, 'Matematica');
  assert.equal(D.classState(w.B.id).layout_id, D.layoutsOf(w.B.id, w.T2.id)[0].id);
  // The first visit made nothing in the other teacher's class.
  assert.equal(D.layoutsOf(w.A.id, w.T2.id).length, 0);
});

test('a teacher who already has layouts for the class gets nothing new: never touched, never duplicated', async () => {
  const w = world();
  const mine = D.createLayout(w.T, w.A, { name: 'My own day', widgets: D.starterWidgets() }).layout;
  const before = JSON.stringify(D.layoutsOf(w.A.id, w.T.id));
  for (const lang of ['en', 'it']) assert.equal((await as(w.T, lang)(`/class/${w.A.id}/dashboard`)).status, 200);
  assert.equal(JSON.stringify(D.layoutsOf(w.A.id, w.T.id)), before, 'the existing layout is exactly as it was, and alone');
  assert.equal(D.classState(w.A.id).layout_id, mine.id);
  // ensureLayouts itself: the list as it is.
  assert.deepEqual(D.ensureLayouts(w.T, w.A, tFor('en')).map(l => l.id), [mine.id]);
});

test('two first visits at once (two tabs) make the set once', async () => {
  const w = world();
  const pages = await Promise.all([as(w.T)(`/class/${w.A.id}/dashboard`), as(w.T, 'it')(`/class/${w.A.id}/dashboard`), as(w.T)(`/class/${w.A.id}/dashboard`)]);
  for (const p of pages) assert.equal(p.status, 200);
  assert.equal(D.layoutsOf(w.A.id, w.T.id).length, D.DEFAULT_SET.length);
  assert.equal(new Set(names(w.A, w.T)).size, D.DEFAULT_SET.length, 'no name twice');
  // The check and the inserts are one IMMEDIATE transaction (the write lock is taken before counting).
  const src = fs.readFileSync('server/services/dash.js', 'utf8'), fn = src.slice(src.indexOf('export function ensureLayouts('), src.indexOf('/** The layout the teacher sees now'));
  assert.match(fn, /db\.transaction\(\(\) => \{\n\s+if \(q\.get\('SELECT COUNT\(\*\) n FROM dash_layouts WHERE class_id=\? AND owner_id=\?', c\.id, u\.id\)\.n\) return;/);
  assert.match(fn, /\}\)\.immediate\(\);/);
});

test('two server processes on one database file, first visit at the same moment: the set is made once', async () => {
  const { execFileSync, spawn } = await import('node:child_process');
  const path = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  const dir = fs.mkdtempSync(os.tmpdir() + '/brb-dash-race-'), env = { ...process.env, BRB_DB: path.join(dir, 'race.db'), BRB_DATA_DIR: dir, BRB_SILENT: '1' };
  const mod = f => JSON.stringify(pathToFileURL(path.resolve(f)).href);
  const head = `const { createUser, getUser } = await import(${mod('server/auth.js')}); const S = await import(${mod('server/services/schools.js')}); const D = await import(${mod('server/services/dash.js')}); const { tFor } = await import(${mod('server/i18n/index.js')});`;
  const ids = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `${head}
    const boss = createUser({ username: 'RaceBoss', password: 'secret123', role: 'admin' });
    const oak = S.createSchool(boss, { name: 'Race Oak' }).school;
    const T = S.createSchoolAccount(boss, oak.id, { rosterName: 'Rae Teacher', role: 'teacher' }).user;
    const C = S.createClass(getUser(T.id), oak.id, { name: '4R' }).class;
    console.log(JSON.stringify({ T: T.id, C: C.id }));`], { env, encoding: 'utf8' }).trim().split('\n').pop());
  const go = Date.now() + 1500;
  const run = () => new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ['--input-type=module', '-e', `${head}
      const u = getUser(${JSON.stringify(ids.T)}), c = S.getClass(${JSON.stringify(ids.C)});
      while (Date.now() < ${go}) { /* both start together */ }
      console.log(D.ensureLayouts(u, c, tFor('en')).length);`], { env });
    let out = '', err = ''; p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { err += d; });
    p.on('close', code => (code === 0 ? resolve(out.trim()) : reject(new Error(err))));
  });
  const got = await Promise.all([run(), run()]);
  assert.deepEqual(got, ['6', '6'], 'each process sees the one set');
  const count = execFileSync(process.execPath, ['--input-type=module', '-e', `${head}
    const { q } = await import(${mod('server/db.js')});
    console.log(q.get('SELECT COUNT(*) n FROM dash_layouts WHERE class_id=? AND owner_id=?', ${JSON.stringify(ids.C)}, ${JSON.stringify(ids.T)}).n);`], { env, encoding: 'utf8' }).trim().split('\n').pop();
  assert.equal(count, String(D.DEFAULT_SET.length));
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------- rename in edit mode
test('rename in edit mode: the edit bar\'s name is a labelled field, saved through the layout route with the same checks', async () => {
  const w = world();
  const en = (await as(w.T)(`/class/${w.A.id}/dashboard`)).text, it = (await as(w.T, 'it')(`/class/${w.A.id}/dashboard`)).text;
  // The field: the current name, at most 40 characters, labelled "Layout name"; the words around it from the one string.
  assert.match(en, /<h1 class="dash-class dash-edittitle" id="dash-editing"><span>Editing: <\/span><span class="dash-namebox"><input class="dash-namein" id="dash-edit-name" maxlength="40" value="Morning start" aria-label="Layout name" aria-describedby="dash-edit-name-err"/);
  assert.match(it, /<span>Modifica: <\/span><span class="dash-namebox"><input class="dash-namein" id="dash-edit-name" maxlength="40" value="Morning start" aria-label="Nome della disposizione"/, 'the name as made (on the English first visit); the words around it in Italian');
  assert.match(en, /<span class="err dash-nameerr" id="dash-edit-name-err" role="alert"><\/span>/);
  // A name with markup in it is escaped in the field.
  const lid = D.layoutsOf(w.A.id, w.T.id)[0].id;
  D.updateLayout(w.T, w.A, lid, { name: '"><b>x' });
  assert.match((await as(w.T)(`/class/${w.A.id}/dashboard`)).text, /value="&quot;&gt;&lt;b&gt;x"/);
  // The browser: Enter or leaving the field posts { name } to the layout route; Escape puts the saved name back; the
  // chip list is redrawn at once; an error shows under the field.
  const js = fs.readFileSync('public/js/dash.js', 'utf8'), part = js.slice(js.indexOf('const nameIn = $(\'#dash-edit-name\')'), js.indexOf('nameIn?.addEventListener(\'input\''));
  assert.match(part, /api\(`\/api\/dash\/\$\{CID\}\/layouts\/\$\{l\.id\}`, \{ method: 'POST', body: \{ name \} \}\)/);
  assert.match(part, /l\.name = r\.layout\.name; renderLayouts\(\);/);
  assert.match(part, /e\.key === 'Enter'\) \{ e\.preventDefault\(\); commitName\(\); \}/);
  assert.match(part, /e\.key === 'Escape'\) \{ e\.preventDefault\(\); e\.stopPropagation\(\); resetName\(\); \}/);
  assert.match(part, /addEventListener\('blur', commitName\)/);
  assert.match(part, /nameError\(t\('js\.dash\.layouts\.needName'\)\)/);
  assert.match(part, /catch \(err\) \{ nameError\(err\.message\); \}/);
  // The route it uses: cleaned (trimmed, control and direction characters gone), required, at most 40; owner only.
  const post = (who, name, lang) => as(who, lang)(`/api/dash/${w.A.id}/layouts/${lid}`, POST({ name }));
  let r = await post(w.T, '  Fractions\u202E day\u0007  ');
  assert.equal(r.status, 200); assert.equal(r.json.layout.name, 'Fractions day');
  assert.equal(names(w.A, w.T)[0], 'Fractions day');
  r = await post(w.T, '   ');
  assert.equal(r.status, 400); assert.equal(r.json.error, tFor('en')('dash.errors.name'));
  assert.equal((await post(w.T, '', 'it')).json.error, tFor('it')('dash.errors.name'), 'the error in the teacher\'s language');
  r = await post(w.T, 'x'.repeat(60));
  assert.equal(r.status, 200); assert.equal(r.json.layout.name.length, 40, 'clipped at 40');
  for (const who of [w.T2, w.a1, w.SA]) assert.equal((await post(who, 'Hacked')).status, 404, who.username);
  assert.equal(names(w.A, w.T)[0], 'x'.repeat(40));
  // The ⋯ sheet's Rename is still there.
  assert.match(js, /\$\('#dash-rename', sh\.el\)\.addEventListener\('click'/);
});
