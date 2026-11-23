// Oomba companion: how-to answers with links, Create class and Copy (docs/decisions.md "Oomba companion: how-to answers
// with links, Create class and Copy"). The help map (services/companion-help.js) is the one source of truth: every page
// a step links to opens (200) for a teacher, every button it names is a real label (a locale key in all 13 languages
// that the site's own code uses). Answers keep only links a tool gave (the teacher's own pages); the Markdown renderer
// escapes everything and keeps only same-site or https links; Copy text has numbered steps and links as
// "words (address)". createClass: a confirm card, made through the same rule and service as My classes' New class,
// audited, with Undo while the class has no students and a card to open its dashboard; a teacher who may not make
// classes gets numbered steps with links instead. The AI is a stand-in (services/companion.js hooks.create).
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q } = await import('../../server/db.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const CO = await import('../../server/services/companion.js');
const C = await import('../../server/services/oomba-chat.js');
const H = await import('../../server/services/companion-help.js');
const RL = await import('../../server/services/ratelimit.js');
const { makeT, CODES } = await import('../../server/i18n/index.js');
const { formatText, copyText, safeHref } = await import('../../public/js/oomba-text.js');
const { createApp } = await import('../../server/app.js');

const ROOT = path.resolve(import.meta.dirname, '../..');
let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => { CO.hooks.create = null; server.close(); });
test.beforeEach(() => RL._reset());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = who => async (p, { body } = {}) => {
  const headers = { cookie: cookieFor(who.id) };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + p, { method: body !== undefined ? 'POST' : 'GET', headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json, location: r.headers.get('location') };
};
const boss = createUser({ username: 'HelpBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Help Oak' }).school;
const elm = S.createSchool(boss, { name: 'Help Elm' }).school;
S.updateSchool(boss, elm.id, { settings: { teachersCreateClasses: false } });
let k = 0;
function teacher({ classes = 1, school = oak, role = 'admin' } = {}) {
  const u = getUser(S.createSchoolAccount(boss, school.id, { rosterName: `Help Teacher${++k}`, role }).user.id);
  config.manipulativesUsers = [...config.manipulativesUsers, u.username.toLowerCase()];
  const cs = Array.from({ length: classes }, (_, i) => S.createClass(boss, school.id, { name: `${3 + i}H-${k}`, grade: String(3 + i), teacherId: u.id }).class);
  return { u, cs };
}
function standIn(script, reply = 'Okay.') {
  const calls = [];
  CO.hooks.create = async p => {
    calls.push(JSON.parse(JSON.stringify(p)));
    const afterTool = Array.isArray(p.messages.at(-1).content) && p.messages.at(-1).content.some(c => c.type === 'tool_result');
    const t = afterTool ? null : script(p);
    if (t) return { model: p.model, usage: {}, stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `tu${calls.length}`, name: t[0], input: t[1] }] };
    return { model: p.model, usage: {}, stop_reason: 'end_turn', content: [{ type: 'text', text: typeof reply === 'function' ? reply(p) : reply }] };
  };
  return calls;
}
const lastResult = p => JSON.parse(p.messages.at(-1).content.find(c => c.type === 'tool_result').content);
const reset = async who => { await C.allSettled(); CO.reset(who); };
async function ask(who, text, page = { type: 'teach' }) {
  const r = CO.send(who, { text, page, lang: 'en' });
  assert.ok(r.ok, JSON.stringify(r));
  await C.allSettled();
  return CO.current(who).chat;
}
const lastBot = chat => [...chat.turns].reverse().find(x => x.role === 'oomba');

test('the help map: every linked page opens for a teacher (200), every button label is a real label in all 13 languages', async () => {
  const { u, cs } = teacher();
  const place = { cls: S.getClass(cs[0].id), school: S.schoolsOf(u.id)[0] };
  const pages = H.allPages();
  assert.ok(pages.length >= 12, 'the map covers the common pages');
  const prev = { gc: config.googleClassroom, live: config.liveClassroom };
  for (const key of pages) {
    const p = H.pathOf(key, place);
    assert.ok(p && p.startsWith('/') && !p.includes(':'), key);
    if (key === 'gclassroom' || key === 'live') continue;   // turned on below when the feature is on
    const r = await as(u)(p);
    // makeSchool: a teacher with a school is sent on to the next step; still a real page, never a 404.
    assert.ok(r.status === 200 || (key === 'makeSchool' && r.status === 302) || (key === 'inviteTeacher' && r.status === 302 && /tab=people/.test(r.location)), `${key} ${p} -> ${r.status}`);
  }
  config.liveClassroom = true;
  assert.equal((await as(u)(H.pathOf('live', place))).status, 200, '/live when Live is on');
  Object.assign(config, { googleClassroom: prev.gc, liveClassroom: prev.live });
  // The router knows the Google Classroom page (on only with Google set up); its path is the class's own.
  assert.match(fs.readFileSync(path.join(ROOT, 'server/routes/gclassroom.js'), 'utf8'), /router\.get\('\/class\/:id\/google-classroom'/);
  // Labels: in every language, and used by the site's own code (a real button or tab).
  const code = ['server/routes', 'server/views', 'public/js'].flatMap(d => fs.readdirSync(path.join(ROOT, d)).filter(f => f.endsWith('.js')).map(f => fs.readFileSync(path.join(ROOT, d, f), 'utf8'))).join('\n');
  for (const key of H.allLabels()) {
    for (const c of CODES) { const v = makeT(c)(key); assert.ok(v && v !== key, `${c} ${key}`); }
    const leaf = key.split('.').at(-1), short = key.replace(/^js\.[^.]+\./, '');
    assert.ok(code.includes(`'${key}'`) || code.includes(`\`${key}\``) || code.includes(`'${short}'`) || code.includes(`(${JSON.stringify(short)}`) || code.includes(`${leaf}'`), `${key} is used by the site`);
  }
});

test('howTo: numbered steps with the teacher\'s own links; a class task without one class opens the list first; no school, admin only', async () => {
  const { u, cs } = teacher();
  const r = H.howTo(u, 'add-students', { lang: 'en' });
  assert.ok(r.steps.length >= 3);
  assert.match(r.steps[0], new RegExp(`\\[[^\\]]+\\]\\(/class/${cs[0].id}\\?tab=students\\)`));
  assert.ok(r.steps.some(s => /\*\*Create accounts and login cards\*\*/.test(s)));
  assert.deepEqual(r.links, [`/class/${cs[0].id}?tab=students`]);
  assert.deepEqual(r.go, { pageType: 'class', id: cs[0].id });
  const es = H.howTo(u, 'add-students', { lang: 'es' });
  assert.ok(es.steps.some(s => s.includes(`**${makeT('es')('school.class.createCards')}**`)), 'labels in the teacher\'s language');
  const two = teacher({ classes: 2 });
  const p = H.howTo(two.u, 'print-cards');
  assert.match(p.steps[0], /\[your classes\]\(\/teach\?all=1\)/);
  assert.match(p.steps[1], /\*\*Students\*\*/, 'then the tab by its name');
  assert.equal(p.links.length, 1);
  assert.ok(!p.go);
  // On a class's page: that class.
  assert.match(H.howTo(two.u, 'progress', { page: { type: 'class', classId: two.cs[1].id } }).steps[0], new RegExp(`/class/${two.cs[1].id}/progress`));
  // School settings: admins get the link; a teacher is told to ask an admin.
  assert.match(H.howTo(u, 'school-settings').steps[0], new RegExp(`/school/${oak.slug}\\?tab=settings`));
  const plain = teacher({ role: 'teacher' });
  const ss = H.howTo(plain.u, 'school-settings');
  assert.ok(ss.adminOnly); assert.match(ss.steps[1], /school admin/);
  // No school: make or join one first.
  const solo = createUser({ username: 'HelpSolo', password: 'secret123' });
  assert.ok(H.howTo(solo, 'create-class').noSchool);
  assert.match(H.howTo(solo, 'create-class').steps[0], /\/signup\/teacher\/school/);
  assert.ok(H.howTo(u, 'nope').error);
});

test('an answer keeps only the links a tool gave; any other link is stripped', async () => {
  const { u, cs } = teacher();
  standIn(p => (p.messages.length === 1 ? ['howTo', { task: 'add-students' }] : null),
    p => `Here's how:\n${lastResult(p).steps.join('\n')}\nAlso see [my site](https://evil.example/x) and [admin](/admin/schools).`);
  const chat = await ask(u, 'How do I add students?');
  const x = lastBot(chat);
  assert.match(x.text, new RegExp(`1\\. Open \\[your class's Students tab\\]\\(/class/${cs[0].id}\\?tab=students\\)\\.`));
  assert.match(x.text, /2\. /); assert.match(x.text, /\*\*Create accounts and login cards\*\*/);
  assert.doesNotMatch(x.text, /evil|https?:|\(\/admin/);
  assert.match(x.text, /my site/, 'a stripped link keeps its words');
  assert.equal(x.note.steps[0].k, 'howto');
  await reset(u);
});

test('Markdown: numbered lists, bold and safe links only; everything else escaped', () => {
  const html = formatText('Steps:\n1. Open [your class](/class/abc?tab=students).\n2. Tap **Create**.\n\n- a [bad](javascript:alert(1)) one\n- <img src=x onerror=alert(1)> and [x](//evil.example) and [y](http://plain.example)\n\nSee [the source](https://example.org/a "t").');
  assert.match(html, /<p class="oc-p" dir="auto">Steps:<\/p><ol class="oc-ol"><li dir="auto">Open <a href="\/class\/abc\?tab=students">your class<\/a>\.<\/li><li dir="auto">Tap <b>Create<\/b>\.<\/li><\/ol>/);
  assert.doesNotMatch(html, /<img|javascript:|href="\/\/|href="http:/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /<ul class="oc-ul">/);
  assert.equal(safeHref('/class/1').out, false); assert.equal(safeHref('https://a.example/').out, true);
  for (const bad of ['javascript:alert(1)', '//evil.example', '/\\evil', 'http://a.example', 'https://u:p@a.example/', 'data:text/html,x', ' /x"onmouseover=1']) assert.equal(safeHref(bad), null, bad);
  assert.doesNotMatch(formatText('[**x**](/a" onclick="1)'), /<a |onclick="/);
});

test('Copy text: steps numbered, links as "words (address)", no bold marks, citations or chrome', () => {
  const t = 'Here is how:\n1. Open [your classes](/teach?all=1).\n2. Tap **New class**.\n3. Tap **Create class**.\n\nFrom the web [^1]: see [a guide](https://example.org/g).';
  assert.equal(copyText(t, 'https://oomba.example'), 'Here is how:\n1. Open your classes (https://oomba.example/teach?all=1).\n2. Tap New class.\n3. Tap Create class.\n\nFrom the web: see a guide (https://example.org/g).');
  assert.equal(copyText('- one\n- two'), '- one\n- two');
  assert.equal(copyText('Bad [x](javascript:alert(1)'), 'Bad x');
});

test('createClass: a confirm card; Create makes it as My classes does (audited, the teacher teaches it, no students); Open its dashboard; Undo deletes it while empty', async () => {
  const { u } = teacher({ classes: 0 });
  assert.equal(S.classesOf(u.id, 'teacher').length, 0);
  const calls = standIn(p => (p.messages.length === 1 ? ['createClass', {}] : null), 'Here is a test class for you. Tap Create.');
  const chat = await ask(u, 'Can you make me a test classroom so I can check out your dashboard?');
  assert.ok(calls[0].tools.some(t => t.name === 'createClass') && calls[0].tools.some(t => t.name === 'howTo'));
  const x = lastBot(chat);
  assert.equal(x.note.classNew.name, 'Test class'); assert.equal(x.note.classNew.state, 'open');
  assert.equal(S.classesOf(u.id, 'teacher').length, 0, 'nothing before the tap');
  // Another teacher can't tap it.
  const other = teacher();
  assert.equal(CO.act(other.u, x.id, 'create').ok, false);
  const r = CO.act(u, x.id, 'create');
  assert.ok(r.ok, JSON.stringify(r));
  const mine = S.classesOf(u.id, 'teacher');
  assert.equal(mine.length, 1); assert.equal(mine[0].name, 'Test class'); assert.equal(mine[0].school_id, oak.id);
  assert.equal(q.get("SELECT COUNT(*) n FROM class_members WHERE class_id=? AND role='student'", mine[0].id).n, 0, 'no students');
  assert.ok(q.get("SELECT 1 FROM audit_log WHERE actor_id=? AND action='class.create' AND target=?", u.id, mine[0].id));
  assert.ok(q.get("SELECT 1 FROM audit_log WHERE actor_id=? AND action='companion.class.create' AND target=?", u.id, mine[0].id));
  const c2 = CO.current(u).chat, made = c2.turns.at(-1);
  assert.equal(made.change.kind, 'class'); assert.ok(made.change.canUndo);
  assert.equal(c2.turns.find(t => t.id === x.id).note.classNew.state, 'created');
  assert.equal(CO.act(u, x.id, 'create').ok, false, 'once');
  // Open its dashboard: Go there with nothing to carry.
  assert.equal(made.note.nav.open, true);
  const go = CO.act(u, made.id, 'go');
  assert.equal(go.href, `/class/${mine[0].id}/dashboard`);
  assert.equal(CO.current(u).pending, false, 'nothing carried');
  assert.equal((await as(u)(go.href)).status, 200, 'the dashboard opens');
  // Undo: the empty class goes.
  const un = CO.undo(u, made.id);
  assert.ok(un.ok, JSON.stringify(un));
  assert.equal(S.getClass(mine[0].id), null);
  await reset(u);
  // Undo keeps a class that has had a student.
  standIn(p => (p.messages.length === 1 ? ['createClass', { name: 'Room 9', grade: '4' }] : null), 'Tap Create.');
  const y = lastBot(await ask(u, 'make me a class called Room 9 for grade 4'));
  assert.equal(y.note.classNew.grade, '4');
  CO.act(u, y.id, 'create');
  const room = S.classesOf(u.id, 'teacher')[0];
  const kid = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Pat Brook' }).user.id); S.addToClass(boss, room.id, kid.id);
  const turn = CO.current(u).chat.turns.at(-1);
  assert.equal(CO.undo(u, turn.id).ok, false);
  assert.ok(S.getClass(room.id), 'a class with a student stays');
  await reset(u);
  // Not now: nothing made.
  standIn(p => (p.messages.length === 1 ? ['createClass', {}] : null), 'Tap Create.');
  const z = lastBot(await ask(u, 'make a test class'));
  CO.act(u, z.id, 'createNo');
  assert.equal(S.classesOf(u.id, 'teacher').length, 1);
  assert.equal(lastBot(CO.current(u).chat).note.classNew.state, 'declined');
  await reset(u);
});

test('createClass where teachers may not make classes: no card, numbered steps with links instead; never a student\'s name as a class name', async () => {
  const { u } = teacher({ classes: 0, school: elm, role: 'teacher' });
  assert.equal(S.canCreateClass(u, elm.id), false);
  standIn(p => (p.messages.length === 1 ? ['createClass', {}] : null), p => `I can't make it here.\n${(lastResult(p).steps || []).join('\n')}`);
  const x = lastBot(await ask(u, 'Can you make me a test classroom so I can check out your dashboard?'));
  assert.ok(!x.note.classNew);
  assert.equal(x.note.steps[0].k, 'classNo');
  assert.match(x.text, /1\. Open \[your classes\]\(\/teach\?all=1\)/);
  assert.match(x.text, /2\. .*school admin/);
  for (const [, href] of x.text.matchAll(/\]\((\/[^)]+)\)/g)) assert.equal((await as(u)(href)).status, 200, href);
  await reset(u);
  // The same rule as the site's own button.
  assert.equal((await as(u)('/api/classes', { body: { schoolId: elm.id, name: 'Nope' } })).status, 404);
  // A student's name never becomes a class name.
  const a = teacher();
  const kid = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Quinn Marsh' }).user.id); S.addToClass(boss, a.cs[0].id, kid.id);
  standIn(p => (p.messages.length === 1 ? ['createClass', { name: 'Quinn Marsh' }] : null), 'Okay.');
  const y = lastBot(await ask(a.u, 'make a class'));
  assert.ok(!y.note.classNew || !/Quinn|Marsh/.test(y.note.classNew.name));
  await reset(a.u);
});

test('the browser files: a Copy button only on Oomba\'s answers, clipboard with a fallback; strings in all 13 languages without em dashes', () => {
  const chat = fs.readFileSync(path.join(ROOT, 'public/js/oomba-chat.js'), 'utf8');
  assert.match(chat, /x\.text && o\.copyText \? copyBtn\(x\)/);
  assert.match(chat, /aria-label="\$\{esc\(t\('js\.oomba-chat\.copy'\)\)\}"/);
  const txt = fs.readFileSync(path.join(ROOT, 'public/js/oomba-text.js'), 'utf8');
  assert.match(txt, /navigator\.clipboard/); assert.match(txt, /execCommand\('copy'\)/);
  for (const c of CODES) {
    const t = makeT(c);
    for (const key of ['js.oomba-chat.copy', 'js.oomba-chat.copied', 'js.companion.cls.ask', 'js.companion.cls.create', 'js.companion.cls.openDash', 'js.companion.cls.default', 'js.companion.step.howto']) {
      const v = t(key, { name: 'X', grade: '3' }); assert.ok(v && v !== key, `${c} ${key}`); assert.doesNotMatch(v, /—/, `${c} ${key}`);
    }
  }
});
