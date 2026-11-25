// Homeroom, Classroom and Dashboard as one page with three views, on the server (server/routes/homeroom-views.js,
// views/layout.js page and viewFragment; docs/decisions.md "Homeroom: one page, three views"):
//   - for a teacher Homeroom lets into the class, each of the three addresses draws the same page: the shared bar (the
//     class switcher, Homeroom | Classroom | Dashboard as real links, the view's own buttons) and the view area with that
//     view in it, the other two empty; Classroom's pages (Progress too) keep their content and Back link inside the view;
//   - with the X-View header the same address answers JSON with only the view: its content, its buttons for the bar,
//     its stylesheets, its scripts at the page's own ?v= addresses and their strings (never the site bar or the chat);
//   - the page may become the dashboard: Homeroom and Classroom get the dashboard's frames and camera policy;
//   - everyone else gets the pages as before: no shared bar, the dashboard its own full screen, X-View ignored.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const { createApp } = await import('../../server/app.js');
const { VERSION } = await import('../../server/views/layout.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const get = (who, p, headers = {}) => fetch(base + p, { headers: { ...(who ? { cookie: cookieFor(who.id) } : {}), ...headers }, redirect: 'manual' })
  .then(async r => { const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ } return { status: r.status, text, json, h: r.headers }; });

const boss = createUser({ username: 'HvsBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Views Server Oak' }).school;
const staff = n => getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n, role: 'teacher' }).user.id);
const lane = staff('Ms Lane'), plain = staff('Mr Plain');
for (const u of [lane, plain]) TOOLS.givePlan(u.id);
Object.assign(config, { homeroom: true, homeroomUsers: [lane.username.toLowerCase()] });
const cls = S.createClass(boss, oak.id, { name: '4B Math', teacherId: lane.id }).class;
const other = S.createClass(boss, oak.id, { name: '5C Science', teacherId: lane.id }).class;
const plainCls = S.createClass(boss, oak.id, { name: '3A Plain', teacherId: plain.id }).class;
const kid = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Ada' }).user.id); S.addToClass(boss, cls.id, kid.id);
const sections = text => [...text.matchAll(/<section class="cv-view[^"]*" data-cv-view="(\w+)"[^>]*>/g)].map(m => [m[1], !/ hidden/.test(m[0])]);

test('each address is the same page: the shared bar and the view area, that view shown and the others empty', async () => {
  const cases = [['homeroom', `/class/${cls.id}/homeroom`, /id="hr-board"/], ['classroom', `/class/${cls.id}`, /<nav class="tabs classtabs"/], ['dashboard', `/class/${cls.id}/dashboard`, /id="dash-grid"/]];
  for (const [view, url, inside] of cases) {
    const r = await get(lane, url);
    assert.equal(r.status, 200, url);
    assert.match(r.text, new RegExp(`<div class="cv" id="cv" data-class="${cls.id}" data-view="${view}"`));
    assert.match(r.text, /<header class="cv-bar" id="cv-bar">/);
    // the switcher has her two classes; the pill's three items are links to the three addresses
    assert.match(r.text, /<select class="input cv-class" id="hr-class" data-cv-switch[^>]*>.*4B Math.*5C Science.*<\/select>/s);
    for (const [k, href] of [['homeroom', `/class/${cls.id}/homeroom`], ['classroom', `/class/${cls.id}`], ['dashboard', `/class/${cls.id}/dashboard`]]) {
      assert.match(r.text, new RegExp(`<a href="${href}" data-cv-go="${k}"${k === view ? ' aria-current="page"' : ''}>`), `${view}: ${k}`);
    }
    assert.deepEqual(sections(r.text), [['homeroom', view === 'homeroom'], ['classroom', view === 'classroom'], ['dashboard', view === 'dashboard']]);
    assert.match(r.text, inside);
    assert.match(r.text, new RegExp(`/js/class-views\\.js\\?v=${VERSION}`)); assert.match(r.text, /\/css\/class-views\.css\?v=/);
    assert.match(r.text, new RegExp(`class="[^"]*cv-page cv-on-${view}`));
    assert.match(r.text, /<header class="topbar">/, 'the site bar stays (the dashboard too)');
    assert.match(r.text, /\/js\/companion\.js/, 'Oomba is on every view');
    // the page may become the dashboard without loading again: its frames and camera policy from the start
    assert.match(r.h.get('content-security-policy'), /frame-src 'self' https:\/\/www\.youtube\.com/);
    assert.match(r.h.get('permissions-policy'), /camera=\(self\)/);
    assert.match(r.h.get('vary') || '', /X-View/);
  }
  // each view's buttons in the bar
  const hr = await get(lane, `/class/${cls.id}/homeroom`);
  assert.match(hr.text, /data-cv-acts="homeroom">.*data-hr="seats".*data-hr="menu"/s); assert.doesNotMatch(hr.text, /hr-top/);
  const room = await get(lane, `/class/${cls.id}`);
  assert.match(room.text, /data-cv-acts="classroom"><div class="row classacts">/);
  assert.doesNotMatch(room.text, /id="class-dash-link"/, 'Dashboard is in the pill');
  assert.match(room.text, /<a class="backlink" href="\/teach[^"]*">/, 'the Back link is inside the view');
  const dash = await get(lane, `/class/${cls.id}/dashboard`);
  assert.match(dash.text, /data-cv-acts="dashboard"><div class="dash-acts" id="dash-top">.*id="dash-projector".*id="dash-edit"/s);
  assert.doesNotMatch(dash.text, /class="dash-logo"/);
  assert.match(dash.text, /id="dash-edithead" hidden/, 'edit mode keeps its own bar');
  // every Classroom page (Progress here) is the Classroom view
  const prog = await get(lane, `/class/${cls.id}/progress`);
  assert.match(prog.text, /data-view="classroom"/); assert.match(prog.text, /<a href="\/class\/[^"]+" data-cv-go="classroom" aria-current="page">/);
  // in Spanish
  const es = await fetch(`${base}/class/${cls.id}/dashboard`, { headers: { cookie: `${cookieFor(lane.id)}; lang=es` } }).then(r => r.text());
  assert.match(es, /Cambiar de clase/); assert.match(es, /data-cv-go="classroom"[^>]*>Clase</);
});

test('X-View: only the view, its buttons, styles, scripts at the page\'s own addresses and their strings', async () => {
  const H = { 'X-View': '1' };
  const hr = await get(lane, `/class/${cls.id}/homeroom`, H);
  assert.equal(hr.status, 200); assert.ok(hr.json, 'JSON');
  assert.match(hr.h.get('cache-control'), /no-store/); assert.match(hr.h.get('vary') || '', /X-View/);
  assert.equal(hr.json.view, 'homeroom');
  assert.match(hr.json.body, /id="hr-board"/); assert.match(hr.json.body, /id="page-data"/);
  assert.doesNotMatch(hr.json.body, /topbar|cv-bar|<html|companion/);
  assert.match(hr.json.actions, /data-hr="seats"/);
  assert.deepEqual(hr.json.scripts, [`/js/homeroom.js?v=${VERSION}`]);
  assert.match(hr.json.head, /\/css\/homeroom\.css\?v=/);
  assert.equal(hr.json.strings['js.homeroom.wholeClass'] !== undefined, true); assert.ok(hr.json.strings['js.board-ann.textPlaceholder'] !== undefined || Object.keys(hr.json.strings).some(k => k.startsWith('js.board-ann.')));
  assert.match(hr.json.title, /4B Math/);
  assert.match(hr.json.bodyClass, /hr-page/);

  const room = await get(lane, `/class/${cls.id}?tab=students`, H);
  assert.equal(room.json.view, 'classroom');
  assert.match(room.json.body, /<nav class="tabs classtabs"/); assert.match(room.json.body, /id="roster"|school\.class\.noStudents|Students/);
  assert.match(room.json.actions, /classacts/);
  assert.ok(room.json.scripts.includes(`/js/schools.js?v=${VERSION}`));
  assert.match(room.json.head, /\/css\/schools\.css/);

  const dash = await get(lane, `/class/${cls.id}/dashboard`, H);
  assert.equal(dash.json.view, 'dashboard');
  assert.match(dash.json.body, /id="dash-grid"/); assert.match(dash.json.actions, /id="dash-projector"/);
  assert.deepEqual(dash.json.scripts, [`/js/dash.js?v=${VERSION}`]);
  assert.doesNotMatch(dash.json.bodyClass, /(^|\s)dash-page(\s|$)/, 'the full-screen dashboard\'s own class is left off'); assert.match(dash.json.bodyClass, /dash-page-teacher/);
  assert.ok(Object.keys(dash.json.strings).some(k => k.startsWith('js.dash.')));
});

test('everyone else: the pages as before, the header ignored', async () => {
  const room = await get(plain, `/class/${plainCls.id}`);
  assert.equal(room.status, 200); assert.doesNotMatch(room.text, /id="cv"|cv-bar|hr-tabs|class-views/);
  const dash = await get(plain, `/class/${plainCls.id}/dashboard`);
  assert.match(dash.text, /class="dash-logo"/); assert.doesNotMatch(dash.text, /<header class="topbar">|id="cv"/);
  assert.doesNotMatch(dash.text, /dash-inviews/);
  const x = await get(plain, `/class/${plainCls.id}/dashboard`, { 'X-View': '1' });
  assert.equal(x.json, null, 'the whole page, never JSON'); assert.match(x.text, /<!doctype html>/);
  assert.equal((await get(plain, `/class/${cls.id}/homeroom`, { 'X-View': '1' })).status, 404);
  // a student of the class: their class page and their own dashboard, unchanged
  const k = await get(kid, `/class/${cls.id}`);
  assert.equal(k.status, 200); assert.doesNotMatch(k.text, /id="cv"|hr-tabs/);
  // the flag off: Ms Lane's pages are the separate pages again
  config.homeroom = false;
  try {
    const d = await get(lane, `/class/${cls.id}/dashboard`);
    assert.match(d.text, /class="dash-logo"/); assert.doesNotMatch(d.text, /id="cv"/);
    assert.match((await get(lane, `/class/${cls.id}`)).text, /id="class-dash-link"/);
  } finally { config.homeroom = true; }
  void other;
});

test('a game page may be framed by Homeroom\'s layer only when asked (?in=hr, in a frame); never otherwise', async () => {
  const { q } = await import('../../server/db.js');
  const games = await import('../../server/services/games.js');
  const g = games.createGame(boss.id, { title: 'Embed Pizza' });
  const v = games.addVersion(g.id, '<!doctype html><title>x</title><p>x</p><script>1</script>', { createdBy: boss.id, safetyStatus: 'pass' });
  q.run("UPDATE games SET status='published', visibility='public', published_version_id=?, slug='embed-pizza-hv' WHERE id=?", v.id, g.id);
  const plainPage = await get(lane, '/play/embed-pizza-hv');
  assert.equal(plainPage.h.get('x-frame-options'), 'DENY'); assert.match(plainPage.h.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.doesNotMatch(plainPage.text, /play-embed/);
  const asked = await get(lane, '/play/embed-pizza-hv?in=hr', { 'Sec-Fetch-Dest': 'iframe' });
  assert.equal(asked.status, 200);
  assert.equal(asked.h.get('x-frame-options'), null); assert.match(asked.h.get('content-security-policy'), /frame-ancestors 'self'/);
  assert.match(asked.text, /class="playmode[^"]*play-embed/); assert.match(asked.text, /"embed":"hr"/);
  // the address alone, opened as a page: not framable, nothing changes
  const top = await get(lane, '/play/embed-pizza-hv?in=hr', { 'Sec-Fetch-Dest': 'document' });
  assert.equal(top.h.get('x-frame-options'), 'DENY'); assert.doesNotMatch(top.text, /play-embed/);
});
