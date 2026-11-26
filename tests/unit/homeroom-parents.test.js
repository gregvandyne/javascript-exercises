// Homeroom step 4d: the parents' view (docs/decisions.md "Homeroom: the parents' view"; services/homeroom-parents.js,
// routes/homeroom-parents.js):
//   - a grown-up whose family has the child linked (the existing family linking) reads, for each class of the child with
//     Homeroom and the view on: the child's handouts (title, instructions, dates, done or not yet, the grade as chosen),
//     the teacher's comments and stickers, books read with the routine and the quiz, "Missed while away", and the
//     child's notebook pages in that class's tab only;
//   - never own tabs, other students (names, handouts, notes), supports (the simpler wording), live status;
//   - refused (404) to another family, a pending request, the child, a classmate, a teacher, signed out (sign in), a
//     class that is not the child's or has the view off, families off;
//   - the teacher's switch: the class's teachers only (an aide 403, another teacher 404), on by default;
//   - the student's notebook says a grown-up can see the class tabs; students and teachers otherwise unaffected.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q, now } = await import('../../server/db.js');
const { createUser, startSession, getUser, OFFICIAL, getUserByName } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const HO = await import('../../server/services/homeroom-handouts.js');
const HA = await import('../../server/services/homeroom-aides.js');
const AT = await import('../../server/services/homeroom-attendance.js');
const HR = await import('../../server/services/homeroom-reading.js');
const SUP = await import('../../server/services/homeroom-supports.js');
const NB = await import('../../server/services/notebook.js');
const P = await import('../../server/services/progress.js');
const L = await import('../../server/services/lessons.js');
const LIB = await import('../../server/services/library.js');
const F = await import('../../server/services/family.js');
const PV = await import('../../server/services/homeroom-parents.js');
const { grownupMay } = await import('../../server/routes/family.js');
const games = await import('../../server/services/games.js');
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
  return { status: r.status, text, json, location: r.headers.get('location') || '' };
}
const as = who => (p, o = {}) => call(p, { ...o, cookie: who ? cookieFor(who.id) : '' });

const boss = createUser({ username: 'PvBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Parents Oak' }).school;
const staff = name => getUser(S.createSchoolAccount(boss, oak.id, { rosterName: name, role: 'teacher' }).user.id);
const rivera = staff('Ms Rivera'), aide = staff('Mr Aide'), other = staff('Mr Other'), plain = staff('Mr Plain');
for (const u of [rivera, other]) TOOLS.givePlan(u.id);
config.homeroom = true; config.homeroomUsers = [rivera, other].map(u => u.username.toLowerCase());
const cls = S.createClass(boss, oak.id, { name: 'Room 4B', teacherId: rivera.id, grade: '4' }).class;
const cls2 = S.createClass(boss, oak.id, { name: 'Room 5C', teacherId: rivera.id, grade: '5' }).class;
const noHr = S.createClass(boss, oak.id, { name: 'Art Club', teacherId: plain.id, grade: '4' }).class;
const otherCls = S.createClass(boss, oak.id, { name: 'Room 6D', teacherId: other.id, grade: '6' }).class;
assert.ok(HA.addStaff(rivera, cls, aide.id).ok);
// Mia: her own account (linkable), a student of the school in three classes
const ownKid = (username, roster, classes) => {
  const u = createUser({ username, password: 'kidpass123' });
  assert.ok(S.addMember(boss, oak.id, u.id, 'student', { rosterName: roster }).ok);
  for (const c of classes) assert.ok(S.addToClass(boss, c.id, u.id).ok);
  return getUser(u.id);
};
const mia = ownKid('MiaPv', 'Mia Lane', [cls, cls2, noHr]);
const ben = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Ben Hill' }).user.id); S.addToClass(boss, cls.id, ben.id);
const zed = ownKid('ZedPv', 'Zed Ray', [noHr]);
const lee = ownKid('LeePv', 'Lee Fox', [cls]);
const grown = n => createUser({ username: n, password: 'grownpass12345', accountType: 'grownup' });
const mom = grown('PvMom'), dad = grown('PvDad'), aunt = grown('PvAunt');
const link = (g, kid, yes = true) => { const c = F.createCode(kid); assert.ok(c.ok, JSON.stringify(c)); assert.ok(F.redeem(g, c.code).ok); if (yes) assert.ok(F.answer(kid, 'yes').ok); return F.requestToken(F.familyOfOwner(g.id).id, kid.id); };
const miaTok = link(mom, mia), zedTok = link(dad, zed), leeTok = link(aunt, lee, false);   // Lee hasn't said yes yet

const official = getUserByName(OFFICIAL) || createUser({ username: OFFICIAL, password: 'official-pass-123' });
function made(title, slug) {
  const g = games.createGame(official.id, { title });
  const v = games.addVersion(g.id, '<title>x</title><p>x</p><script>1</script>', { createdBy: official.id, safetyStatus: 'pass' });
  q.run("UPDATE games SET status='published', visibility='public', published_version_id=?, source='seed', shelf='learn', slug=?, icon='🍕' WHERE id=?", v.id, slug, g.id);
  return games.getGame(g.id);
}
const pizza = made('Fraction Pizza', 'fraction-pizza-pv'), bees = made('Counting Bees', 'counting-bees-pv'), secret = made('Ben Only Puzzle', 'ben-only-pv'), late = made('Shape Hunt', 'shape-hunt-pv');
const doneAll = (u, clId) => { for (const s of L.steps(L.getClassLesson(clId).lesson_id)) assert.ok(P.markDone(u, clId, s.id).ok); };

// What the class has: a finished handout with a comment and a sticker, one for Ben only, Reading graded by score with
// the routine done, one missed while Mia was away, and a support with the teacher's simpler words.
const due = new Date(now() + 3 * 86400e3).toISOString().slice(0, 10);
const h1 = HO.handOut(rivera, cls, { gameId: pizza.id, to: { kind: 'all' }, instructions: 'Make three halves.', dueAt: due });
assert.ok(h1.ok, JSON.stringify(h1));
doneAll(mia, h1.classLesson.id);
assert.ok(HO.setFeedback(rivera, cls, h1.classLesson.id, mia.id, { comment: 'Lovely halves!', sticker: 'rocket' }).ok);
const h2 = HO.handOut(rivera, cls, { gameId: secret.id, to: { kind: 'desk', id: ben.id }, instructions: 'Just for Ben.' });
assert.ok(h2.ok);
const book = LIB.books().find(b => b.pages.length >= 4 && b.questions && b.questions.length >= 3);
const rd = HR.handOutReading(rivera, cls, { bookId: book.id, to: { kind: 'all' }, order: 'any', grade: 'score' });
assert.ok(rd.ok, JSON.stringify(rd));
{
  const t = now();
  q.run(`INSERT INTO homeroom_reading(class_lesson_id, class_id, user_id, book_id, page, pages, read_at, quiz_src, marks, solved, quiz_at, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, rd.classLesson.id, cls.id, mia.id, book.id, book.pages.length, book.pages.length, t, 'library', '101', '111', t, t, t);
  const r = HR.saveNotes(mia, cls, rd.classLesson.id, { happened: 'The fox ran home.', word: 'burrow', think: 'It was funny.' }, { happened: 'Something that happened', word: 'A new word', think: 'What I think' });
  assert.ok(r.ok, JSON.stringify(r));
}
assert.ok(AT.mark(rivera, cls, mia.id, 'absent').ok);
const h3 = HO.handOut(rivera, cls, { gameId: bees.id, to: { kind: 'all' }, instructions: 'Count to 20.', grade: 'none' });
assert.ok(h3.ok);
assert.ok(SUP.setSupport(rivera, cls, mia.id, { simple: true }).ok);
assert.ok(SUP.setSimple(rivera, cls, h1.classLesson.id, 'Cut the pizza in two.').ok);
// Notebooks: Mia's class tab note, her own tab, Ben's class note
NB.mine(mia); NB.mine(ben);
const tabOf = (u, kind, classId = null) => NB.mine(u).tabs.find(t => t.kind === kind && (!classId || t.classId === classId));
assert.ok(NB.savePage(mia, tabOf(mia, 'class', cls.id).pages[0].id, '<p>Fractions are <mark class="hl-g">equal parts</mark>.</p>').ok);
assert.ok(NB.savePage(mia, tabOf(mia, 'own').pages[0].id, '<p>My secret diary page</p>').ok);
assert.ok(NB.savePage(ben, tabOf(ben, 'class', cls.id).pages[0].id, '<p>Ben class thoughts</p>').ok);
const P_ = `/family/class/${miaTok}`;

test('a linked grown-up sees the child\'s handouts, comments, reading, missed work and class-tab notes', async () => {
  const r = await as(mom)(`${P_}?class=${cls.id}`);
  assert.equal(r.status, 200, r.text.slice(0, 300));
  assert.match(r.text, /Room 4B/); assert.match(r.text, /Room 5C/, 'every class with Homeroom is a chip');
  assert.ok(!/Art Club/.test(r.text), 'a class without Homeroom is not there');
  // handouts: title, instructions, due, done, the grade as chosen
  assert.match(r.text, /Fraction Pizza/); assert.match(r.text, /Make three halves\./); assert.match(r.text, /Due /);
  assert.match(r.text, /Graded by completion/); assert.match(r.text, /Practice, not graded/);
  // the teacher's comment and sticker
  assert.match(r.text, /Lovely halves!/); assert.match(r.text, new RegExp(HO.stickerSrc('rocket').replace(/[./]/g, '\\$&')));
  // reading: the book, the quiz, the score as chosen (2 of 3 right on the first try: 67%)
  assert.match(r.text, new RegExp(book.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(r.text, /Quiz: 2 of 3 right on the first try/); assert.match(r.text, /67% right/);
  // missed while away
  assert.match(r.text, /To catch up on/); assert.match(r.text, /Missed while away/); assert.match(r.text, /Counting Bees/);
  // class-tab notes (the reading notes page and Class notes), never her own tab
  assert.match(r.text, /equal parts/); assert.match(r.text, /<mark class="hl-g">/); assert.match(r.text, /The fox ran home\./);
  assert.ok(!/secret diary/.test(r.text), 'own tabs are never shown');
  // nothing about anyone else, supports or live class
  for (const bad of ['Ben Hill', 'Ben class thoughts', 'Ben Only Puzzle', 'Just for Ben', 'Cut the pizza in two', ben.id, mia.id]) assert.ok(!r.text.includes(bad), bad);
  assert.ok(!/hr-livedot|Raise hand|hall pass|Absent|At home/i.test(r.text), 'no live status, hands or attendance marks');
  // the other class's page
  const two = await as(mom)(`${P_}?class=${cls2.id}`);
  assert.equal(two.status, 200); assert.match(two.text, /No handouts yet/);
  // audited, with ids only
  const a = q.get("SELECT * FROM audit_log WHERE action='homeroom.parents.read' AND actor_id=? ORDER BY rowid DESC", mom.id);
  assert.ok(a && a.target === mia.id, 'the read is audited');
});

test('refused: other families, a pending request, the child, a classmate, a teacher, signed out, other classes', async () => {
  assert.equal((await as(dad)(P_)).status, 404, 'another family');
  assert.equal((await as(aunt)(`/family/class/${leeTok}`)).status, 404, 'a request the child has not said yes to');
  assert.equal((await as(mia)(P_)).status, 404, 'the child');
  assert.equal((await as(ben)(P_)).status, 404, 'a classmate');
  assert.equal((await as(rivera)(P_)).status, 404, 'the teacher');
  assert.equal((await as(boss)(P_)).status, 404, 'the platform admin');
  const out = await call(P_);
  assert.equal(out.status, 302); assert.match(out.location, /^\/login\?next=/);
  assert.equal((await as(mom)('/family/class/nottoken')).status, 404);
  for (const c of [noHr, otherCls]) assert.equal((await as(mom)(`${P_}?class=${c.id}`)).status, 404, c.name);
  // Dad's child has no class with Homeroom: a calm empty page
  const z = await as(dad)(`/family/class/${zedTok}`);
  assert.equal(z.status, 200); assert.match(z.text, /Nothing from school here yet/);
  // families off (billing off): 404 like every family page
  const key = config.stripeApiKey; config.stripeApiKey = '';
  try { assert.equal((await as(mom)(P_)).status, 404); } finally { config.stripeApiKey = key; }
  // the grown-up fence lets this one address through, nothing else of Homeroom
  assert.equal(grownupMay('GET', P_), true);
  assert.equal(grownupMay('GET', `/class/${cls.id}/homeroom`), false);
  assert.equal(grownupMay('GET', `/class/${cls.id}/desk`), false);
  assert.equal(grownupMay('GET', `/api/notebook/of/${mia.id}`), false);
  assert.equal((await as(mom)(`/api/notebook/of/${mia.id}`)).status, 404);
  assert.equal((await as(mom)(`/api/desk/${cls.id}/state`)).status, 404);
});

test('the /family page links to the class work; the teacher turns the view off and on per class', async () => {
  const fam = await as(mom)('/family');
  assert.equal(fam.status, 200); assert.ok(fam.text.includes(`href="${P_}"`), 'the child\'s row links to the class work');
  // the switch: on by default, the class's teachers only
  assert.equal(PV.parentsOn(cls), true);
  const page = await as(rivera)(`/class/${cls.id}/homeroom`);
  assert.match(page.text, /"parents":true/);
  assert.equal((await as(aide)(`/api/homeroom/${cls.id}/parents`, { body: { on: false } })).status, 403);
  assert.equal((await as(other)(`/api/homeroom/${cls.id}/parents`, { body: { on: false } })).status, 404);
  assert.equal((await as(mom)(`/api/homeroom/${cls.id}/parents`, { body: { on: false } })).status, 404);
  assert.equal((await as(rivera)(`/api/homeroom/${cls.id}/parents`, { body: { on: 'no' } })).status, 400);
  const off = await as(rivera)(`/api/homeroom/${cls.id}/parents`, { body: { on: false } });
  assert.equal(off.status, 200); assert.equal(off.json.parents, false);
  assert.equal(PV.parentsOn(cls), false);
  assert.equal((await as(mom)(`${P_}?class=${cls.id}`)).status, 404, 'off: the class is hidden');
  const rest = await as(mom)(P_);
  assert.equal(rest.status, 200); assert.ok(!/Room 4B/.test(rest.text) && !/Fraction Pizza/.test(rest.text)); assert.match(rest.text, /Room 5C/);
  // off for both: no link on /family, the empty page
  assert.ok((await as(rivera)(`/api/homeroom/${cls2.id}/parents`, { body: { on: false } })).json.ok);
  assert.ok(!(await as(mom)('/family')).text.includes(`href="${P_}"`));
  assert.match((await as(mom)(P_)).text, /Nothing from school here yet/);
  assert.equal(NB.mine(mia).parentsRead, undefined, 'the notebook stops saying so');
  for (const c of [cls, cls2]) assert.ok((await as(rivera)(`/api/homeroom/${c.id}/parents`, { body: { on: true } })).json.parents);
  assert.equal((await as(mom)(P_)).status, 200);
});

test('students are told; students and teachers are otherwise unaffected', async () => {
  assert.equal(NB.mine(mia).parentsRead, true, 'a linked student\'s notebook says a grown-up sees the class tabs');
  assert.equal(NB.mine(ben).parentsRead, undefined, 'a student with no grown-up linked');
  assert.equal(NB.mine(lee).parentsRead, undefined, 'a request not answered is no link');
  const nb = await as(mia)('/api/notebook');
  assert.equal(nb.status, 200); assert.equal(nb.json.parentsRead, true); assert.equal(nb.json.teacherReads, true);
  // the reading notes say so too
  const rv = await as(mia)(`/api/desk/${cls.id}/reading/${rd.classLesson.id}`);
  assert.equal(rv.status, 200); assert.equal(rv.json.parentsRead, true);
  assert.equal((await as(mia)(`/api/desk/${cls.id}/state`)).status, 200);
  // the teacher still reads the whole notebook (own tabs too)
  const tv = await as(rivera)(`/api/notebook/of/${mia.id}`);
  assert.equal(tv.status, 200); assert.ok(JSON.stringify(tv.json).includes('secret diary'));
  assert.equal((await as(rivera)(`/api/homeroom/${cls.id}/handouts`)).status, 200);
});
