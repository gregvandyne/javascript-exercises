// Homeroom, step 3c (docs/decisions.md "Homeroom: supports, aides and sub links"; services/homeroom-supports.js,
// homeroom-aides.js, homeroom-sub.js; routes/homeroom.js and routes/homeroom-sub.js):
//   - supports: set by the class's teachers only (an aide reads them), checked values, all off removes them; a student's
//     desk gets their own (simpler wording in place of the instructions, their own longer plan clock, the game frame's
//     BRB.support), classmates never (See the room), Oomba Live's own save keeps Bigger text;
//   - aides: an invite link (only its hash kept, once, staff accounts only), a teacher of the school added at once; an
//     aide opens the class's Homeroom (no Teacher plan of their own), answers hands, looks at a desk, leaves comments;
//     every forbidden action is refused with 403; removed, they are out at once;
//   - sub links: one day, at most 24 hours, the token and PIN hashed, a wrong PIN locks the link, revoke and expiry end
//     it, first names only, Start / Next / +5 and hands and the hall pass, everything else 403, never another class,
//     every action logged and summed up in "While you were out".
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q, now } = await import('../../server/db.js');
const { createUser, startSession, getUser, OFFICIAL, getUserByName } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const H = await import('../../server/services/homeroom.js');
const HO = await import('../../server/services/homeroom-handouts.js');
const HP = await import('../../server/services/homeroom-plan.js');
const SUP = await import('../../server/services/homeroom-supports.js');
const HA = await import('../../server/services/homeroom-aides.js');
const SB = await import('../../server/services/homeroom-sub.js');
const R = await import('../../server/services/classlive-results.js');
const L = await import('../../server/services/lessons.js');
const games = await import('../../server/services/games.js');
const { createApp } = await import('../../server/app.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
async function call(p, { body, cookie = '', method } = {}) {
  const headers = cookie ? { cookie } : {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + p, { method: method || (body !== undefined ? 'POST' : 'GET'), headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json, setCookie: r.headers.get('set-cookie') || '', location: r.headers.get('location') || '' };
}
const as = who => (p, o = {}) => call(p, { ...o, cookie: who ? cookieFor(who.id) : (o.cookie || '') });

const boss = createUser({ username: 'HhBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Helper Oak' }).school;
const elm = S.createSchool(boss, { name: 'Helper Elm' }).school;
const staff = (school, name) => getUser(S.createSchoolAccount(boss, school.id, { rosterName: name, role: 'teacher' }).user.id);
const rivera = staff(oak, 'Ms Rivera'), kim = staff(oak, 'Mr Kim'), far = staff(elm, 'Ms Far'), other = staff(oak, 'Mr Other');
for (const u of [rivera, other]) TOOLS.givePlan(u.id);   // the aides (kim, far) have no Teacher plan
const cls = S.createClass(boss, oak.id, { name: 'Room 4B', teacherId: rivera.id }).class;
const otherCls = S.createClass(boss, oak.id, { name: 'Room 4C', teacherId: other.id }).class;
const kidIn = (c, n) => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n }).user.id); S.addToClass(boss, c.id, u.id); return getUser(u.id); };
const [ava, ben, cleo] = ['Ava Stone', 'Ben Hill', 'Cleo Park'].map(n => kidIn(cls, n));
const avaTwo = kidIn(cls, 'Ava Moss');
const eli = kidIn(otherCls, 'Eli Moss');
config.homeroom = true; config.homeroomUsers = [rivera, other].map(u => u.username.toLowerCase());
const official = getUserByName(OFFICIAL) || createUser({ username: OFFICIAL, password: 'official-pass-123' });
function made(title, slug) {
  const g = games.createGame(official.id, { title });
  const v = games.addVersion(g.id, '<title>x</title><p>x</p><script>1</script>', { createdBy: official.id, safetyStatus: 'pass' });
  q.run("UPDATE games SET status='published', visibility='public', published_version_id=?, source='seed', shelf='learn', slug=? WHERE id=?", v.id, slug, g.id);
  return games.getGame(g.id);
}
const pizza = made('Fraction Pizza', 'fraction-pizza-help');
const C = id => `/api/homeroom/${id}`;
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

// ---------------------------------------------------------------- supports
test('supports: the teacher sets them (checked values), all off removes them; only current students', async () => {
  assert.equal(SUP.setSupport(rivera, cls, ava.id, { time: 175 }).code, 'badSupport');
  assert.equal(SUP.setSupport(rivera, cls, eli.id, { read: true }).code, 'notInClass');
  assert.equal(SUP.setSupport(other, cls, ava.id, { read: true }).code, 'notFound', 'another teacher: not there');
  const r = await as(rivera)(`${C(cls.id)}/supports`, { body: { studentId: ava.id, time: 150, read: true, simple: true, big: true } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.support, { time: 150, read: true, simple: true, big: true });
  assert.deepEqual(SUP.supportOf(cls.id, ava.id), { time: 150, read: true, simple: true, big: true });
  assert.deepEqual(Object.keys(SUP.supportsOf(cls.id)), [ava.id]);
  assert.deepEqual(SUP.subLabels(SUP.supportOf(cls.id, ava.id)), ['time', 'read', 'simple', 'big']);
  // the same table as Oomba Live: its save never drops Bigger text, and a row with Bigger text only stays
  SUP.setSupport(rivera, cls, ben.id, { big: true });
  R.saveSupport(cls.id, ben.id, { time: 200, read: false, simple: false }, rivera.id);
  assert.deepEqual(SUP.supportOf(cls.id, ben.id), { time: 200, read: false, simple: false, big: true });
  R.saveSupport(cls.id, ben.id, { time: 100 }, rivera.id);
  assert.deepEqual(SUP.supportOf(cls.id, ben.id), { time: 100, read: false, simple: false, big: true });
  assert.ok(SUP.setSupport(rivera, cls, ben.id, {}).ok);
  assert.equal(q.get('SELECT COUNT(*) n FROM live_support WHERE class_id=? AND user_id=?', cls.id, ben.id).n, 0, 'all off: no row');
});

test('supports reach only their own desk: simpler wording, the plan clock with extra time, the game frame', async () => {
  const r = HO.handOut(rivera, cls, { gameId: pizza.id, to: { kind: 'all' }, instructions: 'Determine the equivalent fractions for each pizza slice.', order: 'in', grade: 'completion' });
  assert.ok(r.ok);
  const cl = r.classLesson.id;
  assert.equal(SUP.setSimple(rivera, cls, cl, 'x'.repeat(SUP.SIMPLE_MAX + 1)).code, 'tooLong');
  assert.equal(SUP.setSimple(other, cls, cl, 'Find the same amount.').code, 'notFound');
  const sres = await as(rivera)(`${C(cls.id)}/handouts/${cl}/simpler`, { body: { text: 'Find two fractions\nthat are the same amount.' } });
  assert.equal(sres.status, 200);
  assert.equal(sres.json.text, 'Find two fractions\nthat are the same amount.');
  // Ava (Simpler wording) gets the simpler words; Cleo (no supports) the teacher's
  const da = await as(ava)(`/api/desk/${cls.id}/state`), dc = await as(cleo)(`/api/desk/${cls.id}/state`);
  assert.equal(da.json.cards[0].instructions, 'Find two fractions\nthat are the same amount.');
  assert.equal(dc.json.cards[0].instructions, 'Determine the equivalent fractions for each pizza slice.');
  assert.deepEqual(da.json.support, { time: 150, read: true, simple: true, big: true });
  assert.equal(dc.json.support.read, false);
  // classmates zooming out never see supports
  const page = await as(cleo)(`/class/${cls.id}/desk`);
  assert.equal(page.status, 200);
  assert.ok(!/"support":\{"time":150/.test(page.text) && !page.text.includes('read":true'), 'no one else\'s supports on a desk page');
  assert.ok(!JSON.stringify(H.roomForStudent(cls, cleo)).includes('support'));
  // the plan: Ava's own clock is 1.5x the part's time, nobody else's desk has one
  const plan = HP.cleanPlan(rivera, cls, { parts: [{ kind: 'slides', minutes: 10 }, { kind: 'break', minutes: 2 }] }).plan;
  assert.ok(HP.usePlan(rivera, cls, plan).ok);
  assert.ok(HP.runAction(rivera, cls, 'start').ok);
  const pa = (await as(ava)(`/api/desk/${cls.id}/state`)).json.plan, pc = (await as(cleo)(`/api/desk/${cls.id}/state`)).json.plan;
  assert.ok(pa.mine && pc && !pc.mine);
  assert.equal(pa.mine.time, 150);
  assert.ok(Math.abs((pa.mine.endsAt - pa.endsAt) - 5 * 60e3) < 2000, 'a 10 minute part: 5 more minutes for Ava');
  // the game page: the note is the simpler wording, the page and the frame's token carry the supports
  const step = q.get("SELECT id FROM lesson_steps WHERE lesson_id=(SELECT lesson_id FROM class_lessons WHERE id=?) AND kind='game'", cl).id;
  const fr = L.playFrame(ava, { id: cl, class_id: cls.id }, { body: 'Determine the equivalent fractions for each pizza slice.' }, k => k);
  assert.equal(fr.note, 'Find two fractions\nthat are the same amount.');
  assert.deepEqual(fr.data.hrSupport, { time: 150, read: true, simple: true, big: true });
  assert.deepEqual(fr.support, fr.data.hrSupport);
  const fc = L.playFrame(cleo, { id: cl, class_id: cls.id }, { body: 'Determine the equivalent fractions for each pizza slice.' }, k => k);
  assert.ok(!fc.data.hrSupport && !fc.support);
  const play = await as(ava)(`/play/${pizza.slug}?lesson=${cl}&step=${step}`);
  assert.equal(play.status, 200);
  assert.match(play.text, /"hrSupport":\{"time":150,"read":true,"simple":true,"big":true\}/);
  assert.match(play.text, /that are the same amount/);
  assert.ok(HP.runAction(rivera, cls, 'clear').ok);
});

// ---------------------------------------------------------------- aides
let invited;
test('aides: an invite link keeps only its hash, works once, for staff accounts only', async () => {
  assert.equal(HA.invite(rivera, cls, { email: 'not an email' }).code, 'badEmail');
  const r = await as(rivera)(`${C(cls.id)}/aides`, { body: { action: 'invite', email: 'far@elm.example' } });
  assert.equal(r.status, 200);
  const token = r.json.url.split('/hr/aide/')[1];
  assert.ok(token && token.length >= 30);
  const row = q.get("SELECT * FROM homeroom_aides WHERE class_id=? AND status='invited'", cls.id);
  assert.equal(row.invite_hash, sha(token), 'only the hash is kept');
  assert.ok(!JSON.stringify(row).includes(token));
  invited = token;
  // a student cannot take it; signed out: the page asks to sign in
  assert.equal((await as(ben)(`/api/hr/aide/${token}`, { body: {} })).status, 403);
  const out = await call(`/hr/aide/${token}`);
  assert.equal(out.status, 200); assert.match(out.text, /Sign in to join/);
  // Ms Far (another school's teacher, no Teacher plan) joins; the link stops working
  const j = await as(far)(`/api/hr/aide/${token}`, { body: {} });
  assert.equal(j.status, 200); assert.equal(j.json.redirect, `/class/${cls.id}/homeroom`);
  assert.ok(HA.isAide(far, cls));
  assert.equal(H.helperRole(far, cls), 'aide');
  assert.equal((await as(kim)(`/api/hr/aide/${token}`, { body: {} })).status, 410, 'once');
  assert.equal((await call(`/hr/aide/${token}`)).status, 410);
  // a teacher of the same school, at once
  const staffList = (await as(rivera)(`${C(cls.id)}/aides`)).json.staff;
  assert.ok(staffList.some(p => p.id === kim.id) && !staffList.some(p => p.id === rivera.id));
  assert.equal(HA.addStaff(rivera, cls, ben.id).code, 'notStaff');
  assert.ok((await as(rivera)(`${C(cls.id)}/aides`, { body: { action: 'add', userId: kim.id } })).json.ok);
  assert.ok(HA.isAide(kim, cls));
  assert.equal(HA.isAide(kim, otherCls), false, 'one class only');
  // their own list of where to go: My classes
  const teach = await as(far)('/teach');
  assert.equal(teach.status, 200); assert.match(teach.text, /Classes you help in/); assert.ok(teach.text.includes(`/class/${cls.id}/homeroom`));
});

test('aides: see desks, live status, hands, a look, comments; everything else is 403', async () => {
  const p = await as(far)(`/class/${cls.id}/homeroom`);
  assert.equal(p.status, 200);
  assert.match(p.text, /hr-aidechip/); assert.match(p.text, /"role":"aide"/);
  assert.ok(!p.text.includes('data-cv-go'), 'no Classroom or Dashboard tabs');
  assert.ok(!p.text.includes('"helpers":'), 'no aides or sub links for an aide');
  assert.ok(H.setLive(rivera, cls, 'start').ok);
  q.run("INSERT INTO homeroom_live(class_id, user_id, hand, hand_at, updated_at) VALUES (?,?,?,?,?) ON CONFLICT(class_id,user_id) DO UPDATE SET hand=excluded.hand", cls.id, ben.id, 'question', now(), now());
  const fa = as(far);
  assert.equal((await fa(`${C(cls.id)}/pulse`)).status, 200);
  assert.equal((await fa(`${C(cls.id)}/handouts`)).status, 200);
  assert.equal((await fa(`${C(cls.id)}/supports`)).json.supports[ava.id].read, true, 'an aide reads supports');
  assert.equal((await fa(`${C(cls.id)}/look/${ben.id}`)).status, 200);
  assert.equal((await fa(`${C(cls.id)}/hands`, { body: { action: 'answer', studentId: ben.id } })).status, 200);
  assert.equal((await fa(`${C(cls.id)}/desk-flag`, { body: { studentId: ben.id, flag: 'coming', on: true } })).status, 200, 'I\'m coming over');
  // a comment on finished work
  const cl = HO.boardView(cls).handouts[0].id;
  q.run("INSERT INTO step_progress(class_lesson_id, step_id, user_id, status, seconds, started_at, updated_at) SELECT ?, s.id, ?, 'done', 200, ?, ? FROM lesson_steps s WHERE s.lesson_id=(SELECT lesson_id FROM class_lessons WHERE id=?) LIMIT 1", cl, cleo.id, now(), now(), cl);
  const fb = await fa(`${C(cls.id)}/handouts/${cl}/feedback`, { body: { studentId: cleo.id, comment: 'Great work', sticker: 'star' } });
  assert.equal(fb.status, 200, fb.text);
  // forbidden: grades, handouts, groups, seating, the AI plan, End class, supports, aides, sub links, sign-in
  const no = [
    [`${C(cls.id)}/seats`, { preset: 'rows', seats: {} }], [`${C(cls.id)}/groups`, { groups: [], members: {} }], [`${C(cls.id)}/teams`, { action: 'make', members: [ava.id, ben.id] }],
    [`${C(cls.id)}/handouts`, { gameId: pizza.id, to: { kind: 'all' } }], [`${C(cls.id)}/handouts/${cl}/remove`, {}], [`${C(cls.id)}/handouts/${cl}/grade`, { grade: 'none' }],
    [`${C(cls.id)}/handouts/${cl}/simpler`, { text: 'x' }], [`${C(cls.id)}/area`, { state: {} }], [`${C(cls.id)}/live`, { action: 'end' }], [`${C(cls.id)}/plan`, { action: 'start' }],
    [`${C(cls.id)}/lessons`, { slug: 'arithmetic-lab' }], [`${C(cls.id)}/staged`, { action: 'add', pick: pizza.id }], [`${C(cls.id)}/supports`, { studentId: ava.id, read: false }],
    [`${C(cls.id)}/aides`, { action: 'invite' }], [`${C(cls.id)}/sub-links`, { action: 'create' }], [`${C(cls.id)}/signin`, { action: 'open' }],
  ];
  for (const [path, body] of no) { const r = await fa(path, { body }); assert.equal(r.status, 403, `${path}: ${r.status}`); assert.equal(r.json.code, 'forbidden'); }
  for (const path of [`${C(cls.id)}/lessons`, `${C(cls.id)}/staged`, `${C(cls.id)}/aides`, `${C(cls.id)}/sub-links`, `${C(cls.id)}/signin`]) assert.equal((await fa(path)).status, 403, path);
  assert.equal((await fa(`${C(cls.id)}/desk-flag`, { body: { studentId: ben.id, flag: 'lock', on: true } })).status, 403, 'locking a desk is the teacher\'s');
  assert.equal((await fa(`/class/${cls.id}/homeroom/signin`)).status, 403);
  // the services say so too
  assert.equal(HO.setGrade(far, cls, cl, 'none').code, 'notFound');
  assert.equal(H.setLive(far, cls, 'end').code, 'forbidden');
  assert.equal(HP.runAction(far, cls, 'next').code, 'forbidden');
  assert.equal(SUP.setSupport(far, cls, ava.id, {}).code, 'forbidden');
  // Classroom and the gradebook are not theirs: the class page is the normal 404
  assert.equal((await fa(`/class/${cls.id}`)).status, 404);
  assert.equal((await fa(`/class/${cls.id}/progress`)).status, 404);
  // another class: not an aide there
  assert.equal((await fa(`/class/${otherCls.id}/homeroom`)).status, 404);
  assert.ok(H.setLive(rivera, cls, 'end').ok);
});

test('aides: removed at once', async () => {
  const list = (await as(rivera)(`${C(cls.id)}/aides`)).json.aides;
  const kimRow = list.find(a => a.name === 'Mr Kim');
  assert.ok(kimRow);
  assert.equal((await as(kim)(`/class/${cls.id}/homeroom`)).status, 200);
  assert.ok((await as(rivera)(`${C(cls.id)}/aides`, { body: { action: 'remove', id: kimRow.id } })).json.ok);
  assert.equal((await as(kim)(`/class/${cls.id}/homeroom`)).status, 404);
  assert.equal(HA.isAide(kim, cls), false);
});

// ---------------------------------------------------------------- sub links
const linkOf = async (body = {}) => {
  const r = await as(rivera)(`${C(cls.id)}/sub-links`, { body: { action: 'create', day: 'today', ...body } });
  assert.equal(r.status, 200, r.text);
  return { token: r.json.url.split('/sub/')[1], link: r.json.link };
};
const subCookie = r => (r.setCookie.match(/hr_sub=[^;]*/) || [''])[0];

test('sub links: the day window, at most 24 hours; only hashes are kept', async () => {
  const at = Date.UTC(2026, 10, 25, 15, 0);   // 10:00 in New York
  q.run('UPDATE schools SET settings=? WHERE id=?', JSON.stringify({ ...S.settingsOf(oak), timeZone: 'America/New_York' }), oak.id);
  const c = S.getClass(cls.id);
  const w = SB.windowFor(c, { day: 'today' }, at);
  assert.equal(w.start, at); assert.equal(w.end, Date.UTC(2026, 10, 26, 5, 0), 'local midnight');
  const w2 = SB.windowFor(c, { day: 'today', until: '15:30' }, at);
  assert.equal(w2.end, Date.UTC(2026, 10, 25, 20, 30));
  const w3 = SB.windowFor(c, { day: 'tomorrow' }, at);
  assert.equal(w3.start, Date.UTC(2026, 10, 26, 5, 0)); assert.ok(w3.end - w3.start <= SB.MAX_MS);
  assert.equal(SB.windowFor(c, { day: 'today', until: '08:00' }, at).code, 'endsBefore');
  assert.equal(SB.windowFor(c, { day: 'next week' }, at).code, 'badDay');
  assert.equal(SB.createLink(rivera, c, { pin: '12' }).code, 'badPin');
  const { token } = await linkOf({ pin: '', note: 'Lunch at 11:40. Ben may need help logging in.' });
  const row = q.get('SELECT * FROM homeroom_sub_links WHERE token_hash=?', sha(token));
  assert.ok(row, 'the token\'s SHA-256');
  assert.ok(!Object.values(row).some(v => String(v).includes(token)), 'the token itself is stored nowhere');
  q.run('DELETE FROM homeroom_sub_links WHERE id=?', row.id);
});

test('sub links: first names only; Start, Next, +5, hands and the pass; everything else 403; logged', async () => {
  const { token } = await linkOf({ note: 'Lunch at 11:40.' });
  const open = await call(`/sub/${token}`);
  assert.equal(open.status, 303); assert.equal(open.location, '/sub');
  const ck = subCookie(open);
  assert.match(ck, /^hr_sub=/); assert.match(open.setCookie, /HttpOnly/); assert.match(open.setCookie, /SameSite=Lax/);
  const sub = (p, o = {}) => call(p, { ...o, cookie: ck });
  const pg = await sub('/sub');
  assert.equal(pg.status, 200);
  assert.match(pg.text, /Lunch at 11:40/);
  const st = (await sub('/api/sub/state')).json;
  const names = st.desks.map(d => d.name).sort();
  assert.deepEqual(names, ['Ava M.', 'Ava S.', 'Ben', 'Cleo'], 'first names; the same first name gets an initial');
  for (const full of ['Stone', 'Hill', 'Park', 'Moss']) assert.ok(!pg.text.includes(full) && !JSON.stringify(st).includes(full), `no last name ${full}`);
  const avaDesk = st.desks.find(d => d.id === ava.id);
  assert.deepEqual(avaDesk.sup, ['time', 'read', 'simple', 'big'], 'what to act on, no more');
  for (const k of ['pct', 'score', 'handouts', 'fb', 'grade', 'summary']) assert.ok(!JSON.stringify(st).includes(`"${k}"`), `no ${k}`);
  // run the class: start, the plan, hands
  assert.ok((await sub('/api/sub/live', { body: { action: 'start' } })).json.ok);
  assert.ok(H.liveOf(cls.id));
  const plan = HP.cleanPlan(rivera, cls, { parts: [{ kind: 'slides', minutes: 5 }, { kind: 'break', minutes: 2 }] }).plan;
  assert.ok(HP.usePlan(rivera, cls, plan).ok);
  assert.ok((await sub('/api/sub/plan', { body: { action: 'start' } })).json.ok);
  assert.ok((await sub('/api/sub/plan', { body: { action: 'more' } })).json.ok);
  assert.ok((await sub('/api/sub/plan', { body: { action: 'next' } })).json.ok);
  for (const a of ['finish', 'clear']) assert.equal((await sub('/api/sub/plan', { body: { action: a } })).status, 403, a);
  q.run("INSERT INTO homeroom_live(class_id, user_id, hand, hand_at, updated_at) VALUES (?,?,?,?,?) ON CONFLICT(class_id,user_id) DO UPDATE SET hand=excluded.hand, hand_at=excluded.hand_at", cls.id, cleo.id, 'bathroom', now(), now());
  const hands = (await sub('/api/sub/state')).json.hands;
  assert.deepEqual(hands.map(h => h.name), ['Cleo']);
  assert.ok((await sub('/api/sub/hands', { body: { action: 'pass', studentId: cleo.id } })).json.ok);
  assert.equal((await sub('/api/sub/hands', { body: { action: 'minutes', minutes: 20 } })).status, 403, 'the pass length stays the teacher\'s');
  assert.ok((await sub('/api/sub/hands', { body: { action: 'back', studentId: cleo.id } })).json.ok);
  // the projector is theirs; nothing else of the class's Homeroom is
  assert.equal((await sub(`/class/${cls.id}/homeroom/projector`)).status, 200);
  assert.equal((await sub(`${C(cls.id)}/state`)).status, 200);
  for (const path of [`/class/${cls.id}/homeroom`, `${C(cls.id)}/handouts`, `${C(cls.id)}/pulse`, `${C(cls.id)}/supports`, `${C(cls.id)}/look/${ava.id}`, `${C(cls.id)}/plan`, `${C(cls.id)}/lessons`, `/class/${cls.id}/homeroom/signin`]) {
    assert.equal((await sub(path)).status, 403, path);
  }
  for (const [path, body] of [[`${C(cls.id)}/seats`, { seats: {} }], [`${C(cls.id)}/handouts`, { gameId: pizza.id, to: { kind: 'all' } }], [`${C(cls.id)}/hands`, { action: 'answer', studentId: ava.id }], [`${C(cls.id)}/live`, { action: 'end' }], [`${C(cls.id)}/plan`, { action: 'next' }], [`${C(cls.id)}/supports`, { studentId: ava.id }], [`${C(cls.id)}/sub-links`, { action: 'create' }]]) {
    const r = await sub(path, { body }); assert.equal(r.status, 403, path); assert.equal(r.json.code, 'forbidden');
  }
  // never Classroom, a desk, another class
  // (no account: the site's sign-in, never the class)
  for (const path of [`/class/${cls.id}`, `/class/${cls.id}/desk`]) assert.ok([302, 404].includes((await sub(path)).status), path);
  assert.equal((await sub(`/api/homeroom/${otherCls.id}/state`)).status, 404);
  assert.equal((await sub(`/class/${otherCls.id}/homeroom/projector`)).status, 404);
  // End class is theirs at the end of the day
  assert.ok((await sub('/api/sub/live', { body: { action: 'end' } })).json.ok);
  // logged, and summed up for the teacher
  const notes = SB.notesFor(cls);
  assert.equal(notes.length, 1);
  const n = notes[0].counts;
  assert.equal(n.open, 1); assert.equal(n['live:start'], 1); assert.equal(n['live:end'], 1); assert.equal(n['plan:next'], 1); assert.equal(n['plan:more'], 1); assert.equal(n['hand:pass'], 1); assert.equal(n['hand:back'], 1);
  const tp = await as(rivera)(`/class/${cls.id}/homeroom`);
  assert.match(tp.text, /"notes":\[\{"id":/);
  assert.ok((await as(rivera)(`${C(cls.id)}/sub-links`, { body: { action: 'seen', id: notes[0].id } })).json.ok);
  assert.equal(SB.notesFor(cls).length, 0, 'Got it');
  assert.equal(HP.runAction(rivera, cls, 'clear').ok, true);
});

test('sub links: revoke, expiry, a link for tomorrow, a forged cookie', async () => {
  const { token, link } = await linkOf();
  const ck = subCookie(await call(`/sub/${token}`));
  assert.equal((await call('/api/sub/state', { cookie: ck })).status, 200);
  // a cookie with the token but no server signature, or someone else's signature
  assert.equal((await call('/api/sub/state', { cookie: `hr_sub=${token}` })).status, 403);
  assert.equal((await call('/api/sub/state', { cookie: `hr_sub=${token}.${'A'.repeat(43)}` })).status, 403);
  // expiry
  q.run('UPDATE homeroom_sub_links SET ends_at=? WHERE id=?', now() - 1000, link.id);
  assert.equal((await call('/api/sub/state', { cookie: ck })).status, 403);
  assert.equal((await call(`${C(cls.id)}/state`, { cookie: ck })).status, 404, 'an ended link is nobody');
  assert.equal((await call(`/sub/${token}`)).status, 410);
  q.run('UPDATE homeroom_sub_links SET ends_at=? WHERE id=?', now() + 3600e3, link.id);
  assert.equal((await call('/api/sub/state', { cookie: ck })).status, 200);
  // revoke
  assert.equal(SB.revoke(other, cls, link.id).code, 'notFound');
  assert.ok((await as(rivera)(`${C(cls.id)}/sub-links`, { body: { action: 'revoke', id: link.id } })).json.ok);
  const r = await call('/api/sub/state', { cookie: ck });
  assert.equal(r.status, 403); assert.equal(r.json.code, 'subEnded');
  assert.equal((await call('/api/sub/live', { cookie: ck, body: { action: 'start' } })).status, 403);
  // tomorrow: not open yet
  const t2 = await linkOf({ day: 'tomorrow' });
  assert.equal(t2.link.state, 'later');
  const pg = await call(`/sub/${t2.token}`);
  assert.equal(pg.status, 200); assert.match(pg.text, /open yet/); assert.ok(!subCookie(pg));
  SB.revoke(rivera, cls, t2.link.id);
  // a made-up token
  assert.equal((await call(`/sub/${'x'.repeat(32)}`)).status, 404);
});

test('sub links: a PIN (hashed with a salt) before the class opens; wrong PINs lock the link', async () => {
  const { token, link } = await linkOf({ pin: '4821' });
  const row = q.get('SELECT pin_hash FROM homeroom_sub_links WHERE id=?', link.id);
  assert.ok(row.pin_hash && !row.pin_hash.includes('4821'));
  const pg = await call(`/sub/${token}`);
  assert.equal(pg.status, 200); assert.match(pg.text, /hr-subpin/); assert.ok(!subCookie(pg), 'no cookie before the PIN');
  const bad = await call('/api/sub/open', { body: { token, pin: '1111' } });
  assert.equal(bad.status, 400); assert.equal(bad.json.code, 'badPin');
  const good = await call('/api/sub/open', { body: { token, pin: '4821' } });
  assert.equal(good.status, 200); assert.equal(good.json.redirect, '/sub');
  const ck = subCookie(good);
  assert.equal((await call('/api/sub/state', { cookie: ck })).status, 200);
  // the open link's cookie is not this one's: a PIN link's proof differs
  for (let i = 0; i < SB.PIN_TRIES; i++) await call('/api/sub/open', { body: { token, pin: '0000' } });
  assert.equal(SB.stateOf(q.get('SELECT * FROM homeroom_sub_links WHERE id=?', link.id)), 'locked');
  assert.equal((await call('/api/sub/open', { body: { token, pin: '4821' } })).status, 410, 'locked: even the right PIN');
  assert.equal((await call('/api/sub/state', { cookie: ck })).status, 403);
  SB.revoke(rivera, cls, link.id);
});

test('helpers and deletion: a class gone takes its aides, links and log', () => {
  const c = S.createClass(boss, oak.id, { name: 'Room 9Z', teacherId: rivera.id }).class;
  assert.ok(HA.invite(rivera, c, {}).ok);
  const l = SB.createLink(rivera, c, { day: 'today' }); assert.ok(l.ok);
  SB.log(q.get('SELECT * FROM homeroom_sub_links WHERE id=?', l.link.id), 'open');
  assert.ok(S.deleteClass(boss, c.id).ok);
  for (const tb of ['homeroom_aides', 'homeroom_sub_links', 'homeroom_sub_log']) assert.equal(q.get(`SELECT COUNT(*) n FROM ${tb} WHERE class_id=?`, c.id).n, 0, tb);
});
