// Homeroom: the notebook (docs/decisions.md "Homeroom: the notebook"; services/notebook.js, routes/notebook.js):
//   - who keeps one: a student of a class with Homeroom (the corner button's script on their pages, never on a
//     teacher's, a grown-up's or another student's), and nobody with the flag off;
//   - the rich text cleaned on a strict allowlist (no script, no attributes, no links, no styles), its words for search;
//   - tabs (own: add, rename, delete; a class tab per class with Homeroom that keeps its name), autosave, limits per page
//     and per notebook;
//   - a handout's note area: its page in the class's tab, named after the handout, only for a handout on their desk;
//   - authorization: a student reads and writes only their own; a teacher of the student's class reads it (read only,
//     audited); an aide, a sub, another teacher, a school admin who doesn't teach them, a parent and a classmate get 403;
//   - deleted with the account, a class's tab with the school; moved with an account merge.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q } = await import('../../server/db.js');
const { createUser, startSession, getUser, OFFICIAL, getUserByName } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const HO = await import('../../server/services/homeroom-handouts.js');
const HA = await import('../../server/services/homeroom-aides.js');
const NB = await import('../../server/services/notebook.js');
const SD = await import('../../server/services/school-delete.js');
const games = await import('../../server/services/games.js');
const { deleteAccount } = await import('../../server/services/account-delete.js');
const { createApp } = await import('../../server/app.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
async function call(p, { body, cookie = '' } = {}) {
  const headers = cookie ? { cookie } : {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + p, { method: body !== undefined ? 'POST' : 'GET', headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json };
}
const as = who => (p, o = {}) => call(p, { ...o, cookie: who ? cookieFor(who.id) : '' });

const boss = createUser({ username: 'NbBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Notebook Oak' }).school;
const staff = (name, role = 'teacher') => getUser(S.createSchoolAccount(boss, oak.id, { rosterName: name, role }).user.id);
const rivera = staff('Ms Rivera'), other = staff('Mr Other'), kim = staff('Mr Kim'), head = staff('Ms Head', 'admin');
TOOLS.givePlan(rivera.id); TOOLS.givePlan(other.id);
const cls = S.createClass(boss, oak.id, { name: 'Room 4B', teacherId: rivera.id }).class;
const otherCls = S.createClass(boss, oak.id, { name: 'Room 5C', teacherId: other.id }).class;
const kidIn = (c, n) => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n }).user.id); S.addToClass(boss, c.id, u.id); return getUser(u.id); };
const [ava, ben] = ['Ava Stone', 'Ben Hill'].map(n => kidIn(cls, n));
const eli = kidIn(otherCls, 'Eli Moss');
const parent = createUser({ username: 'NbParent', password: 'secret12345678', accountType: 'grownup' });
config.homeroom = true; config.homeroomUsers = [rivera, other].map(u => u.username.toLowerCase());
const official = getUserByName(OFFICIAL) || createUser({ username: OFFICIAL, password: 'official-pass-123' });
const g = games.createGame(official.id, { title: 'Fraction Pizza' });
const v = games.addVersion(g.id, '<title>x</title><p>x</p><script>1</script>', { createdBy: official.id, safetyStatus: 'pass' });
q.run("UPDATE games SET status='published', visibility='public', published_version_id=?, source='seed', shelf='learn', slug='fraction-pizza-nb' WHERE id=?", v.id, g.id);
const book = async who => (await as(who)('/api/notebook')).json;
const pageIn = (b, kind = 'own') => b.tabs.find(t => t.kind === kind).pages[0];

test('the rich text is cleaned on a strict allowlist; its words are kept for search', () => {
  const c = NB.cleanHtml;
  assert.equal(c('<p>Hi <b>there</b></p>'), '<p>Hi <b>there</b></p>');
  assert.equal(c('<div>a</div><div><strong>b</strong> <em>c</em> <u>d</u></div>'), '<p>a</p><p><b>b</b> <i>c</i> <u>d</u></p>');
  assert.equal(c('<script>alert(1)</script>x'), 'x');
  assert.equal(c('<style>p{}</style><iframe src="x">y</iframe><svg onload="a()"><text>z</text></svg>ok'), 'ok');
  assert.equal(c('<img src=x onerror=alert(1)>a'), 'a');
  assert.equal(c('<a href="javascript:alert(1)">link</a>'), 'link');
  assert.equal(c('<b onclick="x()" style="color:red" class="hl-y">bold</b>'), '<b>bold</b>');
  assert.equal(c('<mark class="hl-g evil" style="x">green</mark><mark>plain</mark><mark class="nope">n</mark>'), '<mark class="hl-g">green</mark><mark class="hl-y">plain</mark><mark class="hl-y">n</mark>');
  assert.equal(c('<ul class="nb-check other"><li class="done x">milk</li><li>eggs</li></ul>'), '<ul class="nb-check"><li class="done">milk</li><li>eggs</li></ul>');
  assert.equal(c('<li>stray</li>'), 'stray', 'an item outside a list loses its tag');
  assert.equal(c('<b>open <i>never closed'), '<b>open <i>never closed</i></b>');
  assert.equal(c('</p></b>a'), 'a');
  assert.equal(c('1 < 2 & 3 > 2 &lt;b&gt;'), '1 &lt; 2 &amp; 3 &gt; 2 &lt;b&gt;');
  assert.equal(c('<p onmouseover="x">"quoted" it&#39;s</p>'), '<p>"quoted" it\'s</p>');
  assert.equal(c('<!-- <script>x</script> -->a<!DOCTYPE html>b'), 'ab');
  assert.equal(c('<scr<script>ipt>alert(1)</script>'), '&lt;scr', 'no tag can be put back together');
  assert.equal(c('<p><br></p><p>&nbsp;</p>'), '', 'blank is empty');
  assert.ok(!/<(?!\/?(p|br|b|i|u|ul|ol|li|mark)\b)/.test(c('<table><tr><td>x</td></tr></table><span>y</span><font>z</font><h1>w</h1>')));
  const deep = '<b>'.repeat(50) + 'x';
  assert.ok((c(deep).match(/<b>/g) || []).length <= 12, 'nesting is capped');
  assert.equal(NB.textOf('<p>one <b>two</b></p><ul><li>three</li></ul><p>a&amp;b</p>'), 'one two\nthree\na&b');
});

test('who keeps a notebook: students of a class with Homeroom; the corner button only on their pages', async () => {
  for (const u of [ava, eli]) assert.ok(NB.canUse(u), u.username);
  for (const u of [rivera, kim, head, boss, parent]) assert.equal(NB.canUse(u), false, u.username);
  const pg = await as(ava)(`/class/${cls.id}`);
  assert.equal(pg.status, 200); assert.match(pg.text, /\/js\/notebook\.js\?v=/);
  for (const u of [rivera, parent, null]) assert.doesNotMatch((await as(u)(`/class/${cls.id}`)).text, /\/js\/notebook\.js/, u ? u.username : 'signed out');
  assert.equal((await as(rivera)('/api/notebook')).status, 404);
  // a plain student (no class with Homeroom) has none
  const plainCls = S.createClass(boss, oak.id, { name: 'Room 9', teacherId: kim.id }).class;
  const solo = kidIn(plainCls, 'Sol Ray');
  assert.equal(NB.canUse(solo), false);
  assert.equal((await as(solo)('/api/notebook')).status, 404);
  assert.doesNotMatch((await as(solo)(`/class/${plainCls.id}`)).text, /\/js\/notebook\.js/);
  config.homeroom = false;
  try { assert.equal(NB.canUse(ava), false); assert.equal((await as(ava)('/api/notebook')).status, 404); } finally { config.homeroom = true; }
});

test('tabs, autosave and limits: a student\'s own notebook', async () => {
  const b = await book(ava);
  assert.equal(b.teacherReads, true, 'told: a teacher reads it');
  assert.deepEqual(b.tabs.map(t => t.kind), ['own', 'class']);
  assert.equal(b.tabs[1].name, 'Room 4B'); assert.equal(b.tabs[1].classId, cls.id);
  const pid = pageIn(b).id;
  const s = await as(ava)(`/api/notebook/pages/${pid}`, { body: { body: '<p>Fractions are <mark class="hl-g">parts</mark><script>x()</script></p>' } });
  assert.equal(s.status, 200, s.text);
  assert.equal(s.json.body, '<p>Fractions are <mark class="hl-g">parts</mark></p>');
  assert.equal(q.get('SELECT text FROM notebook_pages WHERE id=?', pid).text, 'Fractions are parts');
  assert.equal(pageIn(await book(ava)).body, s.json.body, 'kept across sessions');
  // own tabs: add, rename, delete; a class tab keeps its name and stays
  const add = await as(ava)('/api/notebook/tabs', { body: { action: 'add', name: '  Reading   log ' } });
  assert.equal(add.status, 200); const rl = add.json.tabs.find(t => t.id === add.json.tab);
  assert.equal(rl.name, 'Reading log'); assert.equal(rl.pages.length, 1);
  assert.equal((await as(ava)('/api/notebook/tabs', { body: { action: 'add', name: '   ' } })).json.code, 'tabName');
  assert.equal((await as(ava)('/api/notebook/tabs', { body: { action: 'rename', id: rl.id, name: 'Books' } })).json.tabs.find(t => t.id === rl.id).name, 'Books');
  const classTab = b.tabs[1];
  assert.equal((await as(ava)('/api/notebook/tabs', { body: { action: 'rename', id: classTab.id, name: 'Mine' } })).json.code, 'classTab');
  assert.equal((await as(ava)('/api/notebook/tabs', { body: { action: 'delete', id: classTab.id } })).json.code, 'classTab');
  const moved = await as(ava)('/api/notebook/tabs', { body: { action: 'move', id: rl.id, dir: -1 } });
  assert.equal(moved.json.tabs[1].id, rl.id);
  await as(ava)(`/api/notebook/pages/${rl.pages[0].id}`, { body: { body: '<p>Charlotte\'s Web</p>' } });
  assert.equal((await as(ava)('/api/notebook/tabs', { body: { action: 'delete', id: rl.id } })).status, 200);
  assert.equal(q.get('SELECT COUNT(*) n FROM notebook_pages WHERE tab_id=?', rl.id).n, 0, 'its pages go too');
  // limits: a page, the whole notebook
  const big = `<p>${'a'.repeat(NB.LIMITS.page + 10)}</p>`;
  const r = await as(ava)(`/api/notebook/pages/${pid}`, { body: { body: big } });
  assert.equal(r.status, 413); assert.equal(r.json.code, 'pageFull');
  assert.equal((await as(ava)(`/api/notebook/pages/${pid}`, { body: { body: 42 } })).status, 400);
  const was = NB.LIMITS.total; NB.LIMITS.total = 100;
  try { assert.equal((await as(ava)(`/api/notebook/pages/${pid}`, { body: { body: `<p>${'b'.repeat(120)}</p>` } })).json.code, 'notebookFull'); } finally { NB.LIMITS.total = was; }
  const wasTabs = NB.LIMITS.tabs; NB.LIMITS.tabs = 1;
  try { assert.equal((await as(ava)('/api/notebook/tabs', { body: { action: 'add', name: 'One more' } })).json.code, 'tooManyTabs'); } finally { NB.LIMITS.tabs = wasTabs; }
});

test('a handout\'s note area: its page in the class\'s tab, named after the handout; only for their desk', async () => {
  const h = HO.handOut(rivera, cls, { gameId: g.id, to: { kind: 'desk', id: ava.id }, instructions: 'Slice the pizza.', order: 'any', grade: 'completion' });
  assert.ok(h.ok, JSON.stringify(h));
  const clId = h.classLesson.id;
  const r = await as(ava)('/api/notebook/handout', { body: { classId: cls.id, handout: clId } });
  assert.equal(r.status, 200, r.text);
  const tab = r.json.tabs.find(t => t.id === r.json.tab), p = tab.pages.find(x => x.id === r.json.page);
  assert.equal(tab.kind, 'class'); assert.equal(p.title, 'Fraction Pizza'); assert.equal(p.handout, clId);
  assert.equal((await as(ava)('/api/notebook/handout', { body: { classId: cls.id, handout: clId } })).json.page, p.id, 'the same page again');
  assert.equal((await as(ben)('/api/notebook/handout', { body: { classId: cls.id, handout: clId } })).status, 404, 'not on Ben\'s desk');
  assert.equal((await as(eli)('/api/notebook/handout', { body: { classId: cls.id, handout: clId } })).status, 404, 'another class');
  assert.equal((await as(ava)('/api/notebook/handout', { body: { classId: otherCls.id, handout: clId } })).status, 404);
  await as(ava)(`/api/notebook/pages/${p.id}`, { body: { body: '<p>The <b>numerator</b> counts slices</p>' } });
});

test('authorization: only the student writes; their class\'s teacher reads; aides, subs, other teachers, parents: 403', async () => {
  const pid = pageIn(await book(ava)).id;
  // nobody else writes Ava's pages or tabs (her ids are not theirs)
  for (const u of [ben, eli]) {
    const w = await as(u)(`/api/notebook/pages/${pid}`, { body: { body: '<p>hacked</p>' } });
    assert.equal(w.status, 404, u.username);
  }
  for (const u of [rivera, kim, parent, null]) assert.ok([403, 404, 401].includes((await as(u)(`/api/notebook/pages/${pid}`, { body: { body: '<p>x</p>' } })).status));
  assert.doesNotMatch(q.get('SELECT body FROM notebook_pages WHERE id=?', pid).body, /hacked|<p>x<\/p>/);
  const avaTab = (await book(ava)).tabs[0];
  assert.equal((await as(ben)('/api/notebook/tabs', { body: { action: 'delete', id: avaTab.id } })).status, 404);
  assert.ok(q.get('SELECT 1 FROM notebook_tabs WHERE id=?', avaTab.id));
  // her teacher reads all of it, read only; it is audited
  const r = await as(rivera)(`/api/notebook/of/${ava.id}`);
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.student.name, 'Ava Stone');
  assert.ok(r.json.tabs.some(t => t.kind === 'own') && r.json.tabs.some(t => t.kind === 'class'), 'the whole notebook, own tabs too');
  assert.ok(r.json.tabs.some(t => t.pages.some(p => /numerator/.test(p.body))));
  assert.ok(q.get("SELECT 1 FROM audit_log WHERE actor_id=? AND action='notebook.read' AND target=?", rivera.id, ava.id));
  // an aide of the class, another teacher, a school admin, the platform admin, a parent, a classmate, signed out: 403
  assert.ok(HA.addStaff(rivera, cls, kim.id).ok);
  assert.ok(HA.isAide(kim, cls));
  for (const [who, label] of [[kim, 'aide'], [other, 'another teacher'], [head, 'school admin'], [boss, 'platform admin'], [parent, 'parent'], [ben, 'classmate'], [eli, 'another student'], [null, 'signed out']]) {
    const x = await as(who)(`/api/notebook/of/${ava.id}`);
    // a grown-up's account is kept off every student address by the site's own guard (routes/family.js): 404 there
    assert.equal(x.status, who === parent ? 404 : 403, label); if (who !== parent) assert.equal(x.json.code, 'forbidden');
    assert.doesNotMatch(x.text, /numerator|Fractions/);
  }
  assert.equal((await as(other)(`/api/notebook/of/${eli.id}`)).status, 200, 'Eli\'s own teacher');
  assert.equal((await as(rivera)(`/api/notebook/of/${eli.id}`)).status, 403, 'not her student');
  // a sub (no account: the hr_sub cookie) gets nothing
  assert.equal((await call(`/api/notebook/of/${ava.id}`, { cookie: 'hr_sub=whatever' })).status, 403);
  // a student who left the class: their teacher reads no more
  S.removeFromClass(boss, cls.id, ben.id);
  assert.equal((await as(rivera)(`/api/notebook/of/${ben.id}`)).status, 403);
  // the teacher's Homeroom page carries the notebook's strings; the desk has its Notebook button
  assert.match((await as(rivera)(`/class/${cls.id}/homeroom`)).text, /"js\.notebook\.title"|My notebook/);
  const desk = await as(ava)(`/class/${cls.id}/desk`);
  assert.match(desk.text, /data-nb-open/); assert.match(desk.text, /\/js\/notebook\.js/);
});

test('deleting: the account takes every tab and page; the school takes the class tab; a merge moves them', async () => {
  const gone = kidIn(cls, 'Gus Gone');
  const b = await book(gone);
  await as(gone)(`/api/notebook/pages/${pageIn(b).id}`, { body: { body: '<p>mine</p>' } });
  assert.ok(q.get('SELECT COUNT(*) n FROM notebook_pages WHERE user_id=?', gone.id).n >= 2);
  assert.equal(deleteAccount(gone.id, boss, { by: 'admin', leaveSchools: true }).ok, true);
  assert.equal(q.get('SELECT COUNT(*) n FROM notebook_pages WHERE user_id=?', gone.id).n, 0);
  assert.equal(q.get('SELECT COUNT(*) n FROM notebook_tabs WHERE user_id=?', gone.id).n, 0);
  // a school account merged into the student's own account: the notebook moves with them
  const sa = kidIn(cls, 'Mo Merge'), own = createUser({ username: 'NbOwnMo', password: 'secret123' });
  const sb = await book(sa);
  await as(sa)(`/api/notebook/pages/${pageIn(sb).id}`, { body: { body: '<p>kept</p>' } });
  assert.equal(S.mergeSchoolAccount(rivera, oak.id, sa.id, own.id).ok, true);
  assert.equal(q.get('SELECT COUNT(*) n FROM notebook_tabs WHERE user_id=?', sa.id).n, 0);
  const ob = await book(getUser(own.id));
  assert.ok(ob.tabs.some(t => t.pages.some(p => p.body === '<p>kept</p>')));
  assert.equal(ob.tabs.filter(t => t.classId === cls.id).length, 1, 'one class tab');
  // the school: a class tab and its pages go; a student's own tab stays theirs
  const elm = S.createSchool(boss, { name: 'Notebook Elm' }).school;
  const t2 = getUser(S.createSchoolAccount(boss, elm.id, { rosterName: 'Ms Elm', role: 'teacher' }).user.id); TOOLS.givePlan(t2.id);
  config.homeroomUsers.push(t2.username.toLowerCase());
  const c2 = S.createClass(boss, elm.id, { name: 'Elm 1', teacherId: t2.id }).class;
  const kid = getUser(S.createSchoolAccount(boss, elm.id, { rosterName: 'Ivy Elm' }).user.id); S.addToClass(boss, c2.id, kid.id);
  const kb = await book(kid);
  assert.ok(kb.tabs.some(t => t.classId === c2.id));
  assert.ok(SD.BY_CLASS.includes('notebook_tabs') && SD.BY_CLASS.includes('notebook_pages'));
  assert.equal(SD.deleteSchool(boss, elm.id).ok, true);
  assert.equal(q.get('SELECT COUNT(*) n FROM notebook_tabs WHERE class_id=?', c2.id).n, 0);
  assert.equal(q.get('SELECT COUNT(*) n FROM notebook_pages WHERE class_id=?', c2.id).n, 0);
  assert.equal(q.get("SELECT COUNT(*) n FROM notebook_tabs WHERE user_id=? AND kind='own'", kid.id).n, 1, 'their own tab stays');
});

test('no AI reads it: the notebook is in no prompt-building code', async () => {
  const fs = await import('node:fs');
  for (const f of ['server/services/companion.js', 'server/services/homeroom-plan.js']) {
    if (!fs.existsSync(f)) continue;
    assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /notebook_(tabs|pages)|services\/notebook|from '\.\/notebook\.js'/, f);
  }
});
