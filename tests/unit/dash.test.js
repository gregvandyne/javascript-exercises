// Classroom dashboards, stage 1 (services/dash.js, routes/dash.js): the widget registry and what layouts may hold,
// teacher layouts and pins, a student's own screen, approved links, pushes and the tray, Eyes up, background pictures
// and who can fetch them, and the safety rules (only the class's teacher changes the class screen; no chat or typed
// text between students; no prices or plans on student screens; kids never host; no AI; no friend links for staff).
import fs from 'node:fs';
import os from 'node:os';
process.env.BRB_DB = ':memory:'; process.env.BRB_SILENT = '1'; process.env.LOG_REQUESTS = '0';
process.env.BRB_DATA_DIR = fs.mkdtempSync(os.tmpdir() + '/brb-dash-');
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q, MIGRATIONS } = await import('../../server/db.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const L = await import('../../server/services/lessons.js');
const games = await import('../../server/services/games.js');
const D = await import('../../server/services/dash.js');
const { createApp } = await import('../../server/app.js');
const { tFor } = await import('../../server/i18n/index.js');

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = who => async (p, { method = 'GET', body, raw, type } = {}) => {
  const headers = who ? { cookie: cookieFor(who.id) } : {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (raw) headers['content-type'] = type || 'image/jpeg';
  const r = await fetch(base + p, { method, headers, body: raw || (body !== undefined ? JSON.stringify(body) : undefined), redirect: 'manual' });
  const buf = Buffer.from(await r.arrayBuffer()); const text = buf.toString('utf8'); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json, headers: r.headers, buf };
};
const seg = (m, d) => { const b = Buffer.from(d); const h = Buffer.from([0xff, m, 0, 0]); h.writeUInt16BE(b.length + 2, 2); return Buffer.concat([h, b]); };
const jpeg = (w = 160, h = 90, pad = 0) => Buffer.concat([Buffer.from([0xff, 0xd8]), seg(0xe0, 'JFIF\0\x01\x01\0\0\x01\0\x01\0\0'), seg(0xe1, 'Exif\0\0GPSLatitude=51.5'), seg(0xfe, 'Oak Primary'),
  seg(0xdb, Buffer.alloc(65, 1)), seg(0xc0, Buffer.from([8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0])), seg(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])), Buffer.alloc(pad, 7), Buffer.from([0x12, 0x34, 0xff, 0xd9])]);

const boss = createUser({ username: 'DashBoss', password: 'secret123', role: 'admin' });
let worlds = 0;
function world() {
  const k = ++worlds;
  const oak = S.createSchool(boss, { name: `Dash Oak ${k}` }).school;
  const T = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Tia Teacher', role: 'teacher' }).user.id);
  const T2 = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Tom Other', role: 'teacher' }).user.id);
  const SA = createUser({ username: `DashSA${k}`, password: 'secret123' }); S.addMember(boss, oak.id, SA.id, 'admin');
  const A = S.createClass(T, oak.id, { name: '5A' }).class, B = S.createClass(T2, oak.id, { name: '5B' }).class;
  const kid = (name, c) => { const u = S.createSchoolAccount(T, oak.id, { rosterName: name }).user; if (c) S.addToClass(boss, c.id, u.id); return getUser(u.id); };
  const a1 = kid('Ada Apple', A), a2 = kid('Abe Acorn', A), b1 = kid('Bea Bloom', B);
  const stranger = createUser({ username: `DashStr${k}`, password: 'secret123' });
  return { oak, T, T2, SA, A, B, a1, a2, b1, stranger };
}

test('migration 0078 is there once and its tables exist (stage 2 adds 0079, tests/unit/dash-stage2.test.js)', () => {
  const names = MIGRATIONS.map(m => m[0]);
  assert.ok(names.includes('0078_class_dashboards'));
  assert.equal(names.filter(n => n.startsWith('0078')).length, 1);
  for (const tb of ['dash_layouts', 'dash_class', 'dash_students', 'dash_links', 'dash_pushes', 'dash_push_hidden', 'dash_pictures']) assert.ok(q.get("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", tb), tb);
});

test('the registry: every type has a renderer, labels in English, and layouts are rebuilt from the schema', () => {
  const t = tFor('en');
  const reg = D.registryFor(t, 'student');
  assert.deepEqual(reg.types.map(x => x.id).slice(0, 3), ['clock', 'text', 'ican'], 'stage 1 types first; stage 2 adds more');
  for (const x of reg.types) { assert.ok(!/^dash\./.test(x.name) && !/^dash\./.test(x.desc), x.id); for (const s of x.settings) assert.ok(!/^dash\./.test(s.label), `${x.id}.${s.key}`); }
  assert.equal(reg.types.find(x => x.id === 'text').add, false, 'students cannot add the teacher text widget');
  // The library's group chips: only groups the reader can add from (a student had Class, Check, Oomba and Join chips
  // that led to "nothing found").
  for (const role of ['student', 'teacher']) {
    const r = D.registryFor(t, role);
    for (const g of r.groups) assert.ok(r.types.some(x => x.add && x.group === g.id), `${role}: group ${g.id} has something to add`);
  }
  assert.deepEqual(reg.groups.map(g => g.id).filter(g => ['class', 'check', 'oomba', 'join'].includes(g)), []);
  assert.ok(D.registryFor(t, 'teacher').groups.length > reg.groups.length);
  // The teacher's goal pinned on a student screen has no "add today's goal" hint (the student can't edit it).
  const wsrc = fs.readFileSync('public/js/dash-widgets.js', 'utf8');
  assert.match(wsrc.slice(wsrc.indexOf('function ican('), wsrc.indexOf('function ican(') + 600), /ctx\.pinned \? '' : ctx\.type\.words\.empty/);
  // Stage 3's renderers are in dash-tools.js, stage 4's in dash-tools4.js (both merged into RENDER).
  const js = fs.readFileSync('public/js/dash-widgets.js', 'utf8') + fs.readFileSync('public/js/dash-tools.js', 'utf8') + fs.readFileSync('public/js/dash-tools4.js', 'utf8') + fs.readFileSync('public/js/dash-class5.js', 'utf8') + fs.readFileSync('public/js/dash-camera.js', 'utf8');
  for (const w of D.WIDGETS) assert.match(js, new RegExp(`\\b${w.id}\\b`), `renderer for ${w.id}`);
  // Cleaning: unknown types, bad ids and duplicate ids go; sizes clamp; text is clipped; unknown settings dropped; pin
  // only for teachers.
  const raw = [
    { id: 'a', type: 'clock', x: 11, y: -3, w: 40, h: 99, s: { face: 'sundial', seconds: 'yes', evil: '<script>' }, pin: true },
    { id: 'a', type: 'clock' }, { id: 'bad id!', type: 'clock' }, { id: 'x', type: 'chat' },
    { id: 'n', type: 'text', s: { title: 'T'.repeat(100), body: 'line\u0000‮one\n\n\n\nb' }, pin: 1 },
  ];
  const tw = D.cleanWidgets(raw, 'teacher');
  assert.deepEqual(tw.map(w => w.id), ['a', 'n']);
  assert.deepEqual([tw[0].x, tw[0].y, tw[0].w, tw[0].h], [0, 0, 12, D.MAX_H]);
  assert.deepEqual(tw[0].s, { face: 'digital', hour12: true, seconds: false, date: true, zone2: '' });
  assert.equal(tw[0].pin, true);
  assert.equal(tw[1].s.title.length, 40); assert.equal(tw[1].s.body, 'lineone\n\nb');
  const sw = D.cleanWidgets(raw, 'student');
  assert.deepEqual(sw.map(w => w.id), ['a'], 'students: no text widget'); assert.equal(sw[0].pin, undefined, 'students never pin');
  assert.equal(D.cleanWidgets(Array.from({ length: 60 }, (_, i) => ({ id: `c${i}`, type: 'clock' })), 'teacher').length, D.MAX_WIDGETS);
});

test('approved links: https only, no javascript:, data:, http:, credentials, IPs or local names', () => {
  assert.equal(D.cleanUrl('https://example.org/a?b=1#c'), 'https://example.org/a?b=1#c');
  assert.equal(D.cleanUrl('HTTPS://Example.ORG'), 'https://example.org/');
  for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<b>x</b>', 'http://example.org', 'ftp://example.org', 'https://user:pw@example.org',
    'https://127.0.0.1/', 'https://localhost/', 'https://printer.local/', 'https://example.org:8443/', '//example.org', 'example.org', ' ', 'https://exa mple.org', 'https://example.org/a b', `https://e.org/${'a'.repeat(600)}`, 'https://e.org/‮gnp.exe'])
    assert.equal(D.cleanUrl(bad), null, bad);
});

test('who can open a class dashboard: its teacher and students; everyone else gets 404', async () => {
  const w = world();
  const url = `/class/${w.A.id}/dashboard`;
  const t = await as(w.T)(url); assert.equal(t.status, 200); assert.match(t.text, /dash-teacher/); assert.match(t.text, /Push to students/);
  const s = await as(w.a1)(url); assert.equal(s.status, 200); assert.match(s.text, /dash-student/); assert.doesNotMatch(s.text.replace(/<script[\s\S]*?<\/script>/g, ''), /Push to students|Eyes up<\/button>|dash-layout-new/);
  for (const who of [w.T2, w.SA, w.b1, w.stranger]) assert.equal((await as(who)(url)).status, 404, who.username);
  assert.notEqual((await as(null)(url)).status, 200);
  for (const who of [w.T2, w.b1, w.stranger]) assert.equal((await as(who)(`/api/dash/${w.A.id}/live`)).status, 404, who.username);
  assert.equal((await as(null)(`/api/dash/${w.A.id}/live`)).status, 401);
  // An archived class has no dashboard; a student who left loses it.
  S.removeFromClass(w.T, w.A.id, w.a2.id);
  assert.equal((await as(w.a2)(url)).status, 404);
  // The class page and the student's class page link to it.
  assert.match((await as(w.T)(`/class/${w.A.id}`)).text, /id="class-dash-link"/);
  assert.match((await as(w.a1)(`/class/${w.A.id}`)).text, /id="class-dash-link"/);
  assert.doesNotMatch((await as(w.SA)(`/class/${w.A.id}`)).text, /id="class-dash-link"/, 'a school admin who does not teach it has no dashboard link');
});

test('the dashboard says whether the school\'s time zone is set (unset: the page follows the browser\'s own zone)', async () => {
  const w = world();
  const url = `/class/${w.A.id}/dashboard`;
  for (const who of [w.T, w.a1]) assert.match((await as(who)(url)).text, /"tz":"America\/New_York","tzSet":false/);
  assert.ok(S.updateSchool(boss, w.oak.id, { settings: { timeZone: 'Europe/Berlin' } }).ok);
  for (const who of [w.T, w.a1]) assert.match((await as(who)(url)).text, /"tz":"Europe\/Berlin","tzSet":true/);
});

test('only the class\'s teacher changes layouts, pushes, approves links or starts Eyes up', async () => {
  const w = world();
  await as(w.T)(`/class/${w.A.id}/dashboard`);
  const lid = D.layoutsOf(w.A.id, w.T.id)[0].id;
  const writes = [
    [`/api/dash/${w.A.id}/layouts`, { name: 'Morning' }], [`/api/dash/${w.A.id}/layouts/${lid}`, { name: 'Hacked' }], [`/api/dash/${w.A.id}/layouts/${lid}/use`, {}],
    [`/api/dash/${w.A.id}/pushes`, { kind: 'link', ref: 'x' }], [`/api/dash/${w.A.id}/links`, { url: 'https://example.org' }], [`/api/dash/${w.A.id}/eyes`, { on: true }],
  ];
  for (const who of [w.a1, w.T2, w.SA, w.b1, w.stranger]) for (const [p, body] of writes) assert.equal((await as(who)(p, { method: 'POST', body })).status, 404, `${who.username} ${p}`);
  for (const [p, body] of writes) assert.equal((await as(null)(p, { method: 'POST', body })).status, 401);
  assert.equal(D.layoutsOf(w.A.id, w.T.id)[0].name, 'Morning start', 'not renamed by anyone else');
  assert.equal(D.eyesOf(w.A.id), null);
  // CSRF: a cross-site write is refused before it reaches the route.
  const r = await fetch(base + `/api/dash/${w.A.id}/eyes`, { method: 'POST', headers: { cookie: cookieFor(w.T.id), 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' }, body: '{"on":true}' });
  assert.equal(r.status, 403); assert.equal(D.eyesOf(w.A.id), null);
});

test('layouts: create, rename, switch, delete; pinned widgets of the layout in use reach students', async () => {
  const w = world(); const T = as(w.T);
  await T(`/class/${w.A.id}/dashboard`);
  const first = D.layoutsOf(w.A.id, w.T.id)[0];
  assert.equal(D.classState(w.A.id).layout_id, first.id);
  assert.equal(first.name, 'Morning start', 'the first visit\'s ready-made set: Morning start is the one students follow');
  assert.deepEqual(D.pinsOf(w.A.id).map(p => p.type).sort(), ['ican', 'jobs', 'mood']);
  let r = await T(`/api/dash/${w.A.id}/layouts/${first.id}`, { method: 'POST', body: { widgets: [{ id: 'g', type: 'ican', x: 0, y: 0, w: 6, h: 2, s: { goal: 'add fractions' }, pin: true }, { id: 'c', type: 'clock', x: 6, y: 0 }] } });
  assert.equal(r.status, 200);
  assert.deepEqual(D.pinsOf(w.A.id).map(p => [p.id, p.s.goal]), [['g', 'add fractions']], 'only pinned widgets, without the pin flag');
  r = await T(`/api/dash/${w.A.id}/layouts`, { method: 'POST', body: { name: 'Test day', copyFrom: first.id } });
  assert.equal(r.status, 200); const second = r.json.layout;
  assert.equal(second.widgets.length, 2);
  assert.equal((await T(`/api/dash/${w.A.id}/layouts`, { method: 'POST', body: { name: '  ' } })).status, 400);
  await T(`/api/dash/${w.A.id}/layouts/${second.id}`, { method: 'POST', body: { name: 'Quiz', widgets: [] } });
  assert.equal(D.pinsOf(w.A.id).length, 1, 'editing a layout not in use changes nothing for students');
  await T(`/api/dash/${w.A.id}/layouts/${second.id}/use`, { method: 'POST', body: {} });
  assert.equal(D.pinsOf(w.A.id).length, 0);
  assert.equal((await T(`/api/dash/${w.A.id}/layouts/${second.id}/delete`, { method: 'POST', body: {} })).status, 200);
  assert.equal(D.classState(w.A.id).layout_id, first.id, 'deleting the layout in use goes back to another');
  // Down to one layout (the first visit made six): the last one stays.
  for (const l of D.layoutsOf(w.A.id, w.T.id).filter(x => x.id !== first.id)) assert.equal((await T(`/api/dash/${w.A.id}/layouts/${l.id}/delete`, { method: 'POST', body: {} })).status, 200, l.name);
  assert.equal((await T(`/api/dash/${w.A.id}/layouts/${first.id}/delete`, { method: 'POST', body: {} })).status, 400, 'the last layout stays');
  // Another teacher's layout id can't be touched through this class.
  await as(w.T2)(`/class/${w.B.id}/dashboard`);
  const other = D.layoutsOf(w.B.id, w.T2.id)[0];
  assert.equal((await T(`/api/dash/${w.A.id}/layouts/${other.id}`, { method: 'POST', body: { name: 'x' } })).status, 404);
  assert.equal((await T(`/api/dash/${w.A.id}/layouts`, { method: 'POST', body: { name: 'Copy', copyFrom: other.id } })).json.layout.widgets.length, 3, 'copyFrom of a stranger layout is ignored (starter)');
});

test('a student\'s screen: own widgets and places only; pins cannot be removed or rewritten; typed text stays with them', async () => {
  const w = world();
  await as(w.T)(`/class/${w.A.id}/dashboard`);
  const pin = D.pinsOf(w.A.id)[0], pinId = pin.id;
  assert.equal(pin.type, 'ican'); assert.equal(pin.s.goal, tFor('en')('dash.tpl.morning.goal'), 'Morning start\'s sample goal');
  const A1 = as(w.a1);
  const r = await A1(`/api/dash/${w.A.id}/me`, { method: 'POST', body: {
    widgets: [{ id: 'mine', type: 'ican', x: 0, y: 5, w: 4, h: 2, s: { goal: 'SECRET-GOAL-a1' } }, { id: 'note', type: 'text', s: { body: 'hello classmates' } }],
    pins: { [pinId]: { x: 8, y: 6, w: 4, h: 2, s: { goal: 'rewritten' } }, nope: { x: 1 } }, bg: { kind: 'art', id: 'hills' } } });
  assert.equal(r.status, 200);
  const st = D.studentState(w.A.id, w.a1.id);
  assert.deepEqual(st.widgets.map(x => x.id), ['mine'], 'no teacher-only widget types');
  assert.deepEqual(Object.keys(st.pins), [pinId]); assert.deepEqual(st.pins[pinId], { x: 8, y: 6, w: 4, h: 2 }, 'a place only');
  assert.deepEqual(st.bg, { kind: 'art', id: 'hills' });
  assert.equal(D.pinsOf(w.A.id).find(p => p.id === pinId).s.goal, pin.s.goal, 'the teacher\'s pinned widget is unchanged');
  // Another student, the teacher and the projector never get a1's typed text.
  for (const who of [w.a2, w.T]) {
    assert.doesNotMatch((await as(who)(`/class/${w.A.id}/dashboard`)).text, /SECRET-GOAL-a1/, who.username);
    assert.doesNotMatch((await as(who)(`/api/dash/${w.A.id}/live`)).text, /SECRET-GOAL-a1/);
    assert.doesNotMatch((await as(who)(`/api/dash/${w.A.id}/pins`)).text, /SECRET-GOAL-a1/);
  }
  assert.match((await A1(`/class/${w.A.id}/dashboard`)).text, /SECRET-GOAL-a1/);
  // Teachers can't post a student screen.
  assert.equal((await as(w.T)(`/api/dash/${w.A.id}/me`, { method: 'POST', body: { widgets: [] } })).status, 404);
});

test('approved links, pushes and the tray: today only, hide and bring back, ended items leave', async () => {
  const w = world(); const T = as(w.T), A1 = as(w.a1), A2 = as(w.a2);
  assert.equal((await T(`/api/dash/${w.A.id}/links`, { method: 'POST', body: { url: 'javascript:alert(1)', title: 'x' } })).status, 400);
  assert.equal((await T(`/api/dash/${w.A.id}/links`, { method: 'POST', body: { url: 'data:text/html,hi' } })).status, 400);
  const link = (await T(`/api/dash/${w.A.id}/links`, { method: 'POST', body: { url: 'https://library.example.org/kids', title: 'School library' } })).json.link;
  assert.ok(link.id);
  // A link of another class can't be pushed here; nor a made-up one.
  const otherLink = D.addLink(w.T2, w.B, { url: 'https://other.example.org' }).link;
  assert.equal((await T(`/api/dash/${w.A.id}/pushes`, { method: 'POST', body: { kind: 'link', ref: otherLink.id } })).status, 400);
  assert.equal((await T(`/api/dash/${w.A.id}/pushes`, { method: 'POST', body: { kind: 'chat', ref: 'x' } })).status, 400);
  const p1 = (await T(`/api/dash/${w.A.id}/pushes`, { method: 'POST', body: { kind: 'link', ref: link.id } })).json.push;
  // A game: only one the class's students can open.
  const g = games.createGame(w.T.id, { title: 'Fraction Face-off' });
  const v = games.addVersion(g.id, '<title>F</title><canvas></canvas>');
  q.run("UPDATE games SET status='published', visibility='private', published_version_id=? WHERE id=?", v.id || v, g.id);
  assert.equal((await T(`/api/dash/${w.A.id}/pushes`, { method: 'POST', body: { kind: 'game', ref: g.id } })).status, 400, 'a private game');
  q.run("UPDATE games SET visibility='public' WHERE id=?", g.id);
  const p2 = (await T(`/api/dash/${w.A.id}/pushes`, { method: 'POST', body: { kind: 'game', ref: g.id } })).json.push;
  // A lesson: only one open in this class.
  const lesson = L.createLesson(w.T, w.oak.id, { title: 'Comparing fractions' }).lesson;
  const cl = L.assign(w.T, w.A.id, lesson.id);
  const clid = (cl.classLesson || cl.cl || L.classLessons(w.A.id)[0]).id;
  const p3 = (await T(`/api/dash/${w.A.id}/pushes`, { method: 'POST', body: { kind: 'lesson', ref: clid } })).json.push;
  assert.ok(p3);
  // Live: needs the teacher's open live room; students only ever join.
  assert.equal((await T(`/api/dash/${w.A.id}/pushes`, { method: 'POST', body: { kind: 'live', ref: '' } })).status, 400);

  let live = (await A1(`/api/dash/${w.A.id}/live`)).json;
  assert.deepEqual(live.pushes.map(p => p.id), [p3, p2, p1], 'newest first');
  assert.deepEqual(live.pushes.map(p => p.href), [`/class/${w.A.id}/lessons/${clid}`, `/play/${games.getGame(g.id).slug}`, `/class/${w.A.id}/dashboard/link/${link.id}`]);
  assert.equal((await as(w.b1)(`/api/dash/${w.A.id}/live`)).status, 404);
  // Hide: only for this student, and it survives a reload (stored on the server).
  assert.equal((await A1(`/api/dash/${w.A.id}/pushes/${p3}/hide`, { method: 'POST', body: { hidden: true } })).status, 200);
  live = (await A1(`/api/dash/${w.A.id}/live`)).json;
  assert.equal(live.pushes[0].hidden, true);
  assert.equal((await A2(`/api/dash/${w.A.id}/live`)).json.pushes[0].hidden, false);
  assert.match((await A1(`/class/${w.A.id}/dashboard`)).text, /"hidden":true/);
  await A1(`/api/dash/${w.A.id}/pushes/${p3}/hide`, { method: 'POST', body: { hidden: false } });
  assert.equal((await A1(`/api/dash/${w.A.id}/live`)).json.pushes[0].hidden, false);
  // The approved link opens for class members only, and only while it is approved.
  const go = await A1(`/class/${w.A.id}/dashboard/link/${link.id}`);
  assert.equal(go.status, 302); assert.equal(go.headers.get('location'), 'https://library.example.org/kids');
  assert.equal((await as(w.b1)(`/class/${w.A.id}/dashboard/link/${link.id}`)).status, 404);
  assert.equal((await A1(`/class/${w.A.id}/dashboard/link/${otherLink.id}`)).status, 404);
  // The teacher ends one; removing the link ends its push too.
  await T(`/api/dash/${w.A.id}/pushes/${p2}/end`, { method: 'POST', body: {} });
  await T(`/api/dash/${w.A.id}/links/${link.id}/remove`, { method: 'POST', body: {} });
  assert.deepEqual((await A1(`/api/dash/${w.A.id}/live`)).json.pushes.map(p => p.id), [p3]);
  assert.equal((await A1(`/class/${w.A.id}/dashboard/link/${link.id}`)).status, 404);
  // A new day: yesterday's pushes are gone from the tray.
  q.run("UPDATE dash_pushes SET day='2000-01-01' WHERE class_id=?", w.A.id);
  assert.deepEqual((await A1(`/api/dash/${w.A.id}/live`)).json.pushes, []);
  // Students can't push or end.
  assert.equal((await A1(`/api/dash/${w.A.id}/pushes/${p3}/end`, { method: 'POST', body: {} })).status, 404);
});

test('Eyes up: on for every student screen, ends when the teacher ends it or by itself', async () => {
  const w = world(); const T = as(w.T);
  const r = await T(`/api/dash/${w.A.id}/eyes`, { method: 'POST', body: { on: true } });
  assert.equal(r.status, 200); assert.ok(r.json.eyes.until > Date.now());
  assert.ok(r.json.eyes.until <= Date.now() + D.EYES_MS);
  assert.ok((await as(w.a1)(`/api/dash/${w.A.id}/live`)).json.eyes);
  assert.equal((await as(w.b1)(`/api/dash/${w.B.id}/live`)).json.eyes, null, 'another class is not affected');
  await T(`/api/dash/${w.A.id}/eyes`, { method: 'POST', body: { on: false } });
  assert.equal((await as(w.a1)(`/api/dash/${w.A.id}/live`)).json.eyes, null);
  await T(`/api/dash/${w.A.id}/eyes`, { method: 'POST', body: { on: true } });
  q.run('UPDATE dash_class SET eyes_until=? WHERE class_id=?', Date.now() - 1, w.A.id);
  assert.equal((await as(w.a1)(`/api/dash/${w.A.id}/live`)).json.eyes, null, 'ends by itself');
});

test('background pictures: the profile photo\'s file checks, no AI, and only the owner and the class\'s teachers see them', async () => {
  const w = world();
  const outside = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (u, ...rest) => { const s = String(u && u.url || u); if (!s.startsWith(base)) outside.push(s); return realFetch(u, ...rest); };
  try {
    const A1 = as(w.a1);
    assert.equal((await A1(`/api/dash/${w.A.id}/pictures`, { method: 'POST', raw: Buffer.from('<svg onload=alert(1)>'), type: 'image/svg+xml' })).status, 400);
    assert.equal((await A1(`/api/dash/${w.A.id}/pictures`, { method: 'POST', raw: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]) })).status, 400);
    assert.equal((await A1(`/api/dash/${w.A.id}/pictures`, { method: 'POST', raw: jpeg(4000, 3000) })).status, 400);
    assert.equal((await A1(`/api/dash/${w.A.id}/pictures`, { method: 'POST', raw: jpeg(64, 64, D.PIC_LIMITS.maxBytes) })).status, 413);
    const up = await A1(`/api/dash/${w.A.id}/pictures`, { method: 'POST', raw: jpeg() });
    assert.equal(up.status, 200, up.text);
    const saved = fs.readFileSync(D.picFile(up.json.id));
    assert.equal(saved.includes(Buffer.from('GPSLatitude')), false); assert.equal(saved.includes(Buffer.from('Oak Primary')), false);
    await A1(`/api/dash/${w.A.id}/me`, { method: 'POST', body: { bg: { kind: 'pic', id: up.json.id } } });
    assert.deepEqual(D.studentState(w.A.id, w.a1.id).bg, { kind: 'pic', id: up.json.id });
    // Someone else's picture can't be set as a background.
    await as(w.a2)(`/api/dash/${w.A.id}/me`, { method: 'POST', body: { bg: { kind: 'pic', id: up.json.id } } });
    assert.deepEqual(D.studentState(w.A.id, w.a2.id).bg, D.DEFAULT_BG);
    const pic = `/dash/pictures/${up.json.id}`;
    for (const who of [w.a1, w.T]) { const r = await as(who)(pic); assert.equal(r.status, 200, who.username); assert.equal(r.headers.get('content-type'), 'image/jpeg'); assert.match(r.headers.get('cache-control'), /private/); }
    for (const who of [w.a2, w.b1, w.T2, w.SA, w.stranger, null]) assert.equal((await as(who)(pic)).status, 404, who ? who.username : 'signed out');
    // The teacher sees it in the class's list and can take it down; nobody else's list has it.
    const list = (await as(w.T)(`/api/dash/${w.A.id}/pictures`)).json.pictures;
    assert.deepEqual(list.map(p => p.id), [up.json.id]);
    assert.equal((await as(w.a2)(`/api/dash/${w.A.id}/pictures`)).status, 404);
    assert.equal((await as(w.a2)(`/api/dash/${w.A.id}/pictures/${up.json.id}/remove`, { method: 'POST', body: {} })).status, 404);
    assert.equal((await as(w.T)(`/api/dash/${w.A.id}/pictures/${up.json.id}/remove`, { method: 'POST', body: {} })).status, 200);
    assert.equal((await as(w.a1)(pic)).status, 404);
    assert.deepEqual(D.studentState(w.A.id, w.a1.id).bg, D.DEFAULT_BG);
    // A teacher's own picture works the same way.
    const tu = await as(w.T)(`/api/dash/${w.A.id}/pictures`, { method: 'POST', raw: jpeg() });
    assert.equal(tu.status, 200);
    assert.equal((await as(w.a1)(`/dash/pictures/${tu.json.id}`)).status, 404, 'students never fetch pictures by id');
  } finally { globalThis.fetch = realFetch; }
  assert.deepEqual(outside, [], 'nothing left this server (no AI check, no upload anywhere)');
  // No AI anywhere in this feature's code.
  for (const f of ['server/services/dash.js', 'server/routes/dash.js', 'public/js/dash.js', 'public/js/dash-widgets.js']) {
    const src = fs.readFileSync(f, 'utf8');
    assert.doesNotMatch(src, /anthropic|screenPhoto|ai-budget|lesson-ai|set-ai|rubric-ai|\bclaude\b/i, f);
  }
});

test('safety: no prices or plan names on student screens, no chat or text box to classmates, no staff friend links, names the class sees', async () => {
  const w = world();
  await as(w.T)(`/class/${w.A.id}/dashboard`);
  const html = (await as(w.a1)(`/class/${w.A.id}/dashboard`)).text;
  assert.doesNotMatch(html, /\$\s?\d|€\s?\d|£\s?\d|\/plans|upgrade|free trial|Teacher plan|School plan|pricing/i);
  assert.doesNotMatch(html, /Ada Apple|Abe Acorn|Tia Teacher/, 'no real (roster) names on a student screen');
  assert.match(html, new RegExp(w.a1.display_name), 'their own Oomba name');
  assert.doesNotMatch(html, /\/chat\b|friend/i);
  const src = fs.readFileSync('public/js/dash.js', 'utf8');
  assert.doesNotMatch(src, /\/api\/chat|\/api\/friends|friend_code/);
  // Everything teachers and students did here made no friendships or messages.
  const people = [w.T.id, w.a1.id, w.a2.id], marks = people.map(() => '?').join(',');
  assert.equal(q.get(`SELECT COUNT(*) n FROM friends WHERE user_id IN (${marks}) AND friend_id IN (${marks})`, ...people, ...people).n, 0);
  assert.equal(q.get(`SELECT COUNT(*) n FROM chat_messages WHERE from_id IN (${marks}) AND to_id IN (${marks})`, ...people, ...people).n, 0);
  assert.equal(getUser(w.T.id).friend_code, null, 'the teacher still has no friend code');
  // The registry offers students nothing that sends text to others: their types are clock, their own goal, and (stage
  // 2) a timer (which is also a stopwatch), dice and a random number that run in their own browser.
  // Maths tools combined: base-ten blocks, the times table, fraction/decimal/percent, the angle maker, 3D shapes,
  // transformations, the balance and the graph maker are modes of the tools listed.
  assert.deepEqual(D.WIDGETS.filter(x => D.canAdd(x, 'student')).map(x => x.id), ['clock', 'ican', 'timer', 'dice', 'random', 'fractions', 'numline', 'coord', 'placeval', 'tenframe', 'hundreds', 'area', 'tclock',
    'geoboard', 'pattern', 'algebra', 'coins', 'chance', 'letters', 'organizer', 'map', 'breathe'], 'stage 3 and 4: their own copies of the teaching tools; stage 5: the breathing circle');
});

test('account deletion forgets a person\'s screens and pictures', async () => {
  const w = world();
  const pic = D.savePicture(w.a1, w.A, jpeg());
  D.saveStudent(w.a1, w.A, { bg: { kind: 'pic', id: pic.id } });
  D.forgetUser(w.a1.id);
  assert.equal(q.get('SELECT COUNT(*) n FROM dash_students WHERE user_id=?', w.a1.id).n, 0);
  assert.equal(D.getPicture(pic.id), null);
  assert.equal(fs.existsSync(D.picFile(pic.id)), false);
});

test('layout CSS (end-to-end review): the grid never shrinks under what follows it; the light and symbols keep their buttons at their default size', () => {
  const css = fs.readFileSync('public/css/dash.css', 'utf8');
  // A layout taller than the screen used to be squeezed into the stage, its rows spilling over edit mode's background
  // bar (which could then not be clicked). The grid keeps its full height; the stage scrolls.
  assert.match(css, /\.dash-grid\{flex:1 0 auto;/);
  // At their default 3 x 3 the body is about 188px tall on a 1366 or 1600 wide screen: the buttons were hidden below
  // 200px, so the teacher could not switch the light or the symbol at all. Hidden only when really short now.
  for (const row of ['dw-symrow', 'dw-lightrow']) {
    const m = new RegExp(`@container \\(max-height:(\\d+)px\\)\\{\\.${row}\\{display:none\\}\\}`).exec(css);
    assert.ok(m, row); assert.ok(+m[1] <= 150, `${row} hides only below ${m[1]}px`);
  }
});
