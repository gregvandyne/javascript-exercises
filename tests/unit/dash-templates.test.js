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

test('the five ready-made layouts, as asked: their widgets, pins and backgrounds', () => {
  assert.deepEqual(D.LAYOUT_TEMPLATES.map(x => x.id), ['morning', 'lesson', 'group', 'quiet', 'fun']);
  const t = tFor('en'), types = id => D.templateWidgets(id, t).map(w => w.type).sort();
  assert.deepEqual(types('morning'), ['clock', 'ican', 'jobs', 'mood', 'schedule']);
  assert.deepEqual(types('lesson'), ['check', 'help', 'light', 'numline', 'timer']);
  assert.deepEqual(types('group'), ['groups', 'noise', 'score', 'timer']);
  assert.deepEqual(types('quiet'), ['breathe', 'light', 'symbols', 'timer']);
  assert.deepEqual(types('fun'), ['breathe', 'dice', 'picker', 'stickers', 'timer', 'video']);
  const pinned = id => D.templateWidgets(id, t).filter(w => w.pin).map(w => w.type).sort();
  assert.deepEqual(pinned('morning'), ['ican', 'jobs', 'mood'], 'goal, mood and jobs on student screens');
  assert.deepEqual(pinned('lesson'), ['help'], 'the help queue on student screens (a quick check reaches them when it is sent)');
  const get = (id, type) => D.templateWidgets(id, t).find(w => w.type === type).s;
  assert.equal(get('morning', 'schedule').view, 'nownext');
  assert.equal(get('morning', 'schedule').periods.length, 8);
  assert.equal(get('quiet', 'light').color, 'red');
  assert.equal(get('quiet', 'symbols').mode, 'silent');
  assert.equal(get('fun', 'picker').mode, 'wheel');
  assert.ok(get('fun', 'timer').minutes >= 3 && get('fun', 'timer').minutes <= 5, 'a short brain break');
  assert.equal(get('fun', 'video').video, null, 'an empty video slot for the teacher\'s own');
  assert.equal(get('group', 'score').mode, 'teams');
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
  assert.equal(D.layoutsOf(w.A.id, w.T.id).length, 1, 'nothing was made');
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

test('the teacher\'s page lists the templates; a student\'s page carries none of them; the first layout is unchanged', async () => {
  const w = world();
  const page = (await as(w.T, 'it')(`/class/${w.A.id}/dashboard`)).text;
  assert.match(page, /"templates":\[\{"id":"morning","icon":"🌅","name":"Inizio giornata"/);
  assert.equal(D.layoutsOf(w.A.id, w.T.id).length, 1, 'a brand-new class still gets one starter layout');
  assert.deepEqual(D.layoutsOf(w.A.id, w.T.id)[0].widgets.map(x => x.type), ['clock', 'ican', 'text']);
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
