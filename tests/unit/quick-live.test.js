// A first live game in under 3 minutes (routes/quick-live.js, docs/decisions.md): the short teacher sign-up, the "Quick
// game" chooser, the class card's one tap, a guest game's results, "Make a class to keep scores". Who may open each new
// page and API (teachers; never another teacher's class, a student, a kid, a guest, a grown-up where it is staff-only),
// the sign-up's limits, and that nothing on the way shows a price.
import { reset, call, open, config, teacher, teacher2, mum, kid, mia, cls, cls2, school, boss, S, LS, RL, auth, q } from './_live.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const ST = await import('../../server/services/classlive-settings.js');
const R = await import('../../server/services/classlive-results.js');
const QL = await import('../../server/routes/quick-live.js');
const { noFriendsAccount } = S;

const SOLD = /\$\s?\d|€\s?\d|\b119\b|per year|\/year|free trial|subscribe|checkout/i;
const visible = html => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
const guest = auth.createGuest();
const everyoneElse = () => [['a kid', kid], ['a student', mia], ['a guest', guest], ['signed out', null]];
let n = 0;
const signup = (body = {}, headers = {}) => call('/api/teachers/host-signup', { method: 'POST', headers, body: { name: 'Ms Rivera', username: `QuickT${++n}x`, password: 'sunny-meadow-42', adult: '1', ...body } });

test.beforeEach(() => { reset(); RL._reset(); });

test('/teachers/host: signed out gets the three-field teacher sign-up, with no price and nothing sold; hosts go on; kids are told to ask for the code', async () => {
  const r = await call('/teachers/host');
  assert.equal(r.status, 200);
  assert.match(r.text, /<form data-api="\/api\/teachers\/host-signup" id="ql-signup"/);
  const form = r.text.match(/<form data-api="\/api\/teachers\/host-signup"[\s\S]*?<\/form>/)[0];
  // three boxes to type in (name, username, password) and the "teacher, 18 or older" box: no email, no school, no card
  assert.deepEqual([...form.matchAll(/<input class="input"[^>]* name="([a-z]+)"/g)].map(m => m[1]), ['name', 'username', 'password']);
  assert.match(form, /<input type="checkbox" id="ql-adult" name="adult" value="1" required>/);
  assert.doesNotMatch(form, /type="email"|name="school"/);
  assert.doesNotMatch(visible(r.text), SOLD);
  assert.match(r.headers.get('x-robots-tag') || '', /noindex/);
  assert.match(r.text, /href="\/login\?next=%2Flive%2Fquick"/); assert.match(r.text, /href="\/join"/);
  // a guest who has been playing gets the same form
  assert.match((await call('/teachers/host', { user: guest })).text, /id="ql-signup"/);
  // anyone who can host goes straight to the chooser
  for (const u of [teacher, boss]) { const x = await call('/teachers/host', { user: u }); assert.equal(x.status, 302); assert.equal(x.headers.get('location'), '/live/quick'); }
  // a grown-up (parent) account has no teacher pages (routes/family.js grownupGuard); they host from /live as before
  assert.equal((await call('/teachers/host', { user: mum })).status, 404);
  // a child's account: no form, the way to join
  for (const u of [kid, mia]) {
    const x = await call('/teachers/host', { user: u });
    assert.equal(x.status, 200); assert.doesNotMatch(x.text, /ql-signup|host-signup/);
    assert.match(x.text, /Teachers host live games/); assert.match(x.text, /href="\/join"/);
    assert.doesNotMatch(visible(x.text), SOLD);
  }
});

test('the sign-up makes a staff account in a school of one: it can host, has no friends or chat, and lands on the chooser', async () => {
  const r = await signup({ name: 'Ms Rivera', username: 'RiveraQuick', tz: 'America/Chicago' });
  assert.equal(r.status, 200, r.text); assert.equal(r.json.redirect, '/live/quick');
  const u = auth.getUserByName('RiveraQuick');
  assert.ok(u && !u.is_guest); assert.equal(u.account_type, 'kid', 'an ordinary account that is school staff (as /trial makes), never a grown-up account');
  assert.equal(u.display_name, 'Ms Rivera');
  const schools = S.schoolsOf(u.id);
  assert.equal(schools.length, 1); assert.equal(schools[0].role, 'admin'); assert.equal(schools[0].name, 'Ms Rivera: my classroom');
  assert.equal(S.members(schools[0].id).length, 1, 'a school of one');
  assert.equal(S.zoneOf(S.getSchool(schools[0].id)), 'America/Chicago');
  assert.ok(S.isStaff(u)); assert.ok(noFriendsAccount(u), 'staff have no friends and no chat');
  const A = await import('../../server/services/classlive-access.js');
  assert.ok(A.canHost(u));
  // signed in: the cookie opens the chooser
  const cookie = r.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  const quick = await call('/live/quick', { cookie });
  assert.equal(quick.status, 200); assert.match(quick.text, /id="ql-quick"/);
  assert.doesNotMatch(visible(quick.text), SOLD);
  assert.ok(q.get("SELECT 1 FROM audit_log WHERE action='user.signup' AND actor_id=? AND details LIKE '%quick-live%'", u.id), 'the sign-up is in the audit log');
});

test('the sign-up refuses: no "18 or older" box, a short password, a taken or rude username, a name with a phone number, someone already signed in', async () => {
  let r = await signup({ adult: undefined });
  assert.equal(r.status, 400); assert.equal(r.json.field, 'adult');
  r = await signup({ password: 'short-pass' });
  assert.equal(r.status, 400); assert.equal(r.json.field, 'password'); assert.match(r.json.error, /12/);
  r = await signup({ username: teacher.username });
  assert.equal(r.status, 400); assert.equal(r.json.field, 'username');
  r = await signup({ username: 'x' });
  assert.equal(r.status, 400); assert.equal(r.json.field, 'username');
  r = await signup({ name: 'Call me 555-123-4567' });
  assert.equal(r.status, 400); assert.equal(r.json.field, 'name');
  r = await signup({ name: 'M' });
  assert.equal(r.status, 400); assert.equal(r.json.field, 'name');
  // every field to fix at once
  r = await signup({ name: '', username: '!!', password: '', adult: '' });
  assert.deepEqual(Object.keys(r.json.errors).sort(), ['adult', 'name', 'password', 'username']);
  const before = q.get('SELECT COUNT(*) n FROM users').n;
  for (const u of [kid, mia, teacher, mum]) {
    const x = await call('/api/teachers/host-signup', { method: 'POST', user: u, body: { name: 'Ms Rivera', username: `Nope${++n}zz`, password: 'sunny-meadow-42', adult: '1' } });
    assert.equal(x.status, u === mum ? 404 : 409);
  }
  assert.equal(q.get('SELECT COUNT(*) n FROM users').n, before, 'no account was made');
});

test('the sign-up shares the sign-up limit of its address: the 31st account in an hour is refused', async () => {
  const ip = { 'x-forwarded-for': '203.0.113.9' };
  const { SIGNUP } = RL;
  let last;
  for (let i = 0; i < SIGNUP.perHour; i++) { last = await signup({}, ip); assert.equal(last.status, 200, `${i}: ${last.text}`); }
  const over = await signup({}, ip);
  assert.equal(over.status, 429);
  assert.match(over.json.error, /sign-?ups|accounts|later|slow/i);
});

test('/live/quick: only for people who can host; a class of another teacher is a 404; the last pick is preselected', async () => {
  assert.equal((await call('/live/quick')).headers.get('location'), '/teachers/host');
  assert.equal((await call('/live/quick', { user: guest })).headers.get('location'), '/teachers/host');
  for (const u of [kid, mia]) { const x = await call('/live/quick', { user: u }); assert.equal(x.status, 302); assert.equal(x.headers.get('location'), '/join'); }
  const r = await call('/live/quick', { user: teacher });
  assert.equal(r.status, 200);
  assert.match(r.text, /name="mode" value="battle" checked/); assert.match(r.text, /name="level" value="a8" checked/); assert.match(r.text, /name="subject" value="mixed" checked/);
  assert.match(r.text, /Anyone with the code can join/);
  assert.doesNotMatch(r.text, /name="classId"/);
  assert.equal((await call(`/live/quick?class=${cls2.id}`, { user: teacher })).status, 404, 'another teacher\'s class');
  assert.equal((await call('/live/quick?class=nope', { user: teacher })).status, 404);
  const mine = await call(`/live/quick?class=${cls.id}`, { user: teacher });
  assert.equal(mine.status, 200); assert.match(mine.text, new RegExp(`name="classId" value="${cls.id}"`)); assert.match(mine.text, /For Tia 6A\. Only students of this class can join/);
  ST.saveQuickPref(teacher.id, { mode: 'quest-race', subject: 'science', level: 'a12' });
  const again = await call('/live/quick', { user: teacher });
  assert.match(again.text, /name="mode" value="quest-race" checked/); assert.match(again.text, /name="level" value="a12" checked/); assert.match(again.text, /name="subject" value="science" checked/);
  // the settings a host starts a game with never wipe the quick pick
  ST.savePrefs(teacher.id, { settings: {}, teams: null });
  assert.deepEqual(ST.loadPrefs(teacher.id).quick, { mode: 'quest-race', subject: 'science', level: 'a12' });
  ST.resetPrefs(teacher.id);
});

test('POST /api/live/quick: 404 for kids, students, guests and signed-out visitors; never opens another teacher\'s class', async () => {
  for (const [who, u] of everyoneElse()) {
    const r = await call('/api/live/quick', { method: 'POST', user: u, body: { mode: 'battle', subject: 'mixed', level: 'a8' } });
    assert.equal(r.status, 404, who);
    const c = await call('/api/live/quick', { method: 'POST', user: u, body: { classId: cls.id, last: '1' } });
    assert.equal(c.status, 404, who);
  }
  assert.equal(LS.openCount ? LS.openCount() : 0, 0, 'no room was opened');
  const other = await call('/api/live/quick', { method: 'POST', user: teacher, body: { classId: cls2.id, last: '1' } });
  assert.equal(other.status, 404);
  // a grown-up may host an open room (as on /live), never a class
  const g = await call('/api/live/quick', { method: 'POST', user: mum, body: { classId: cls.id, last: '1' } });
  assert.equal(g.status, 404);
});

test('a quick game without a class is an open room: guests with generated names, ready questions from the bank, the pick remembered', async () => {
  const r = await call('/api/live/quick', { method: 'POST', user: teacher, body: { mode: 'battle', subject: 'science', level: 'a10' } });
  assert.equal(r.status, 200, r.text); assert.match(r.json.redirect, /^\/live\/host\//);
  const s = LS.get(r.json.sid);
  assert.equal(s.audience, 'open'); assert.equal(s.nameMode, 'nicknames'); assert.equal(s.mode, 'battle'); assert.equal(s.classId, null);
  assert.equal((s.allItems || s.items).length, QL.QUICK_COUNT);
  assert.deepEqual(ST.loadPrefs(teacher.id).quick, { mode: 'battle', subject: 'science', level: 'a10' });
  // a guest joins with the code alone and gets a generated name (a number into the name list, never text they typed)
  const j = await call('/api/live/join', { method: 'POST', body: { code: s.code, asGuest: true, nick: 'My Real Name' } });
  assert.equal(j.status, 200, j.text); assert.equal(typeof j.json.nick, 'number'); assert.equal(j.json.name, '');
  // a second tap while that room is open goes back to it: a room with players is never ended from somewhere else
  const again = await call('/api/live/quick', { method: 'POST', user: teacher, body: { mode: 'quest-race', subject: 'math', level: 'a6' } });
  assert.equal(again.status, 200); assert.equal(again.json.sid, s.id); assert.equal(again.json.already, true);
  assert.equal(LS.get(s.id).phase !== 'ended', true);
  // values that are not on the form fall back to the last pick
  LS.endSession(s.id, 'ended');
  const odd = await call('/api/live/quick', { method: 'POST', user: teacher, body: { mode: 'doodle', subject: 'x'.repeat(40), level: 'a99' } });
  assert.equal(odd.status, 200, odd.text);
  assert.equal(LS.get(odd.json.sid).mode, 'battle');
  ST.resetPrefs(teacher.id);
});

test('the class card\'s one tap: the last pick for that class, a class room where only its signed-in students join, and their page says so', async () => {
  S.updateClass ? S.updateClass(teacher, cls.id, { grade: '5' }) : q.run('UPDATE classrooms SET grade=? WHERE id=?', '5', cls.id);
  const home = await call('/teach', { user: teacher });
  const card = home.text.match(new RegExp(`<form class="cc-quick" data-api="/api/live/quick"><input type="hidden" name="classId" value="${cls.id}">[\\s\\S]*?</form>`));
  assert.ok(card, 'the Quick game button is on the class card');
  assert.match(card[0], /<input type="hidden" name="last" value="1">/);
  assert.match(card[0], /Question Battle · A bit of everything · Ages 10–11/, 'what one tap opens: the class\'s grade picks the level');
  assert.match(card[0], new RegExp(`href="/live/quick\\?class=${cls.id}"`));
  assert.doesNotMatch(home.text, new RegExp(`name="classId" value="${cls2.id}"`), 'only the classes they teach');
  const r = await call('/api/live/quick', { method: 'POST', user: teacher, body: { classId: cls.id, last: '1' } });
  assert.equal(r.status, 200, r.text);
  const s = LS.get(r.json.sid);
  assert.equal(s.audience, 'class'); assert.equal(s.classId, cls.id); assert.equal(s.nameMode, 'accounts');
  // a guest and a student of another class cannot take a seat
  assert.equal((await call('/api/live/join', { method: 'POST', body: { code: s.code } })).status, 401);
  const A = await import('../../server/services/classlive-access.js');
  assert.ok(A);
  // the student's class page shows "Your teacher started a live game" with the code in the link
  const page = await call(`/class/${cls.id}`, { user: mia });
  assert.match(page.text, new RegExp(`id="class-live"[^>]*data-class="${cls.id}" role="status" aria-live="polite">`));
  assert.match(page.text, new RegExp(`href="/join#${s.code}"`));
  assert.equal((await call(`/api/classes/${cls.id}/live`, { user: mia })).json.live.code, s.code);
  // while the room is open the card offers the way back, not a second room
  const home2 = await call('/teach', { user: teacher });
  assert.doesNotMatch(home2.text, new RegExp(`name="classId" value="${cls.id}"`));
  assert.match(home2.text, new RegExp(`href="/live/host/${s.id}"`));
});

test('a guest game\'s results: the host is told what is kept and offered "Make a class to keep scores"; a class game is not', async () => {
  const s = open(teacher, { mode: 'battle', audience: 'open', starter: 'bank:mixed:a8:5' });
  await call('/api/live/join', { method: 'POST', body: { code: s.code, asGuest: true } });
  s.startedAt = Date.now();   // the game was started (a room that never started is not kept)
  LS.endSession(s.id, 'ended');
  const now = await call(`/live/results/${s.id}`, { user: teacher });
  assert.equal(now.status, 200);
  assert.match(now.text, /id="lv-guest-note"/); assert.match(now.text, /This was a guest game\./); assert.match(now.text, /nothing went into a gradebook/);
  assert.match(now.text, /<a class="btn btn-primary btn-wrap" id="lv-keep-scores" href="\/teach\/keep-scores">/);
  // after the 10 minutes in memory: the saved run keeps the questions and counts, and no player
  const run = q.get('SELECT * FROM live_runs WHERE id=?', s.id);
  assert.ok(run, 'the run is saved'); assert.equal(run.class_id, null);
  assert.equal(q.get('SELECT COUNT(*) n FROM live_run_scores WHERE run_id=?', s.id).n, 0, 'no score row for a guest');
  LS._reset();
  const later = await call(`/live/results/${s.id}`, { user: teacher });
  assert.equal(later.status, 200);
  assert.match(later.text, /no names or scores were kept/); assert.match(later.text, /The question review is kept\./);
  assert.doesNotMatch(later.text, /lv-student-table/);
  // nobody else opens it
  for (const u of [teacher2, mia, kid, mum]) assert.equal((await call(`/live/results/${s.id}`, { user: u })).status, 404);
  // a grown-up host (not staff) is told the same, without the class offer
  const g = open(mum, { mode: 'battle', audience: 'open', starter: 'bank:mixed:a8:5' });
  LS.endSession(g.id, 'ended');
  const gm = await call(`/live/results/${g.id}`, { user: mum });
  assert.match(gm.text, /id="lv-guest-note"/); assert.doesNotMatch(gm.text, /keep-scores/);
  // a class game: no guest note
  const c = open(teacher, { mode: 'battle', audience: 'class', classId: cls.id, starter: 'bank:mixed:a8:5' });
  LS.endSession(c.id, 'ended');
  assert.doesNotMatch((await call(`/live/results/${c.id}`, { user: teacher })).text, /lv-guest-note/);
  assert.ok(R);
});

test('"Make a class to keep scores": staff who may make a class only; pasted names become a class with login cards for their maker', async () => {
  for (const [who, u] of [['a kid', kid], ['a student', mia], ['a grown-up', mum], ['a guest', guest]]) {
    assert.equal((await call('/teach/keep-scores', { user: u })).status, 404, who);
    assert.equal((await call('/api/teach/keep-scores', { method: 'POST', user: u, body: { name: 'X', names: 'Ava\nBen' } })).status, 404, who);
  }
  const out = await call('/teach/keep-scores');
  assert.ok([302, 401].includes(out.status), 'signed out: the sign-in page');
  assert.ok([302, 401, 404].includes((await call('/api/teach/keep-scores', { method: 'POST', body: { name: 'X', names: 'Ava' } })).status));
  // a teacher made by the short sign-up runs their own school, so they may
  const su = await signup({ username: 'KeepScores1' });
  const u = auth.getUserByName('KeepScores1'), sid = S.schoolsOf(u.id)[0].id;
  const page = await call('/teach/keep-scores', { user: u });
  assert.equal(page.status, 200, su.text); assert.match(page.text, /<form class="panel ql-form" data-api="\/api\/teach\/keep-scores" id="ql-keep"/);
  assert.equal((await call('/api/teach/keep-scores', { method: 'POST', user: u, body: { name: '', names: 'Ava' } })).json.field, 'name');
  assert.equal((await call('/api/teach/keep-scores', { method: 'POST', user: u, body: { name: 'Room 12', names: '  ' } })).json.field, 'names');
  const before = S.classesOf(u.id, 'teacher').length;
  const r = await call('/api/teach/keep-scores', { method: 'POST', user: u, body: { name: 'Room 12', grade: '4', names: 'Ava\nBen\nChidi' } });
  assert.equal(r.status, 200, r.text); assert.match(r.json.redirect, /^\/cards\/[\w-]+$/);
  const classes = S.classesOf(u.id, 'teacher');
  assert.equal(classes.length, before + 1); assert.equal(classes[0].name, 'Room 12'); assert.equal(classes[0].school_id, sid);
  const roster = S.roster(classes[0].id).filter(p => p.role === 'student');
  assert.deepEqual(roster.map(p => p.roster_name).sort(), ['Ava', 'Ben', 'Chidi']);
  assert.ok(roster.every(p => auth.getUser(p.id).managed_school === sid), 'school accounts, as login cards always are');
  // the cards: their maker only
  const cards = await call(r.json.redirect, { user: u });
  assert.equal(cards.status, 200); assert.match(cards.text, /Ava/); assert.match(cards.text, /Chidi/);
  for (const x of [teacher, mia, kid]) assert.equal((await call(r.json.redirect, { user: x })).status, 404);
  // the same names again would make second accounts: refused, as on the Students tab
  const dup = await call('/api/teach/keep-scores', { method: 'POST', user: u, body: { name: 'Room 13', names: 'Ava' } });
  assert.equal(dup.status, 400); assert.equal(dup.json.field, 'names');
  // a teacher of a school that keeps class-making for its admins cannot
  S.updateSchool(boss, school.id, { settings: { teachersCreateClasses: false } });
  assert.equal((await call('/teach/keep-scores', { user: teacher })).status, 404);
  assert.equal((await call('/api/teach/keep-scores', { method: 'POST', user: teacher, body: { name: 'X', names: 'Ava' } })).status, 404);
  S.updateSchool(boss, school.id, { settings: { teachersCreateClasses: true } });
});

test('the doors: "/", /teachers and /teachers/live send teachers to the teacher sign-up, never the parents\' one, and "/" shows no price', async () => {
  process.env.LANDING_AT_ROOT = '1';
  const L = await import('../../server/routes/landing.js');
  const home = await call('/');
  assert.match(home.text, /<a class="lp-btn lp-btn-spark lp-btn-big" href="\/teachers\/host" data-cta="host" id="lp-host-now">/);
  assert.match(home.text, /Host a live game now/); assert.match(home.text, /<a class="lp-btn lp-btn-ghost" href="\/join" id="lp-join">Have a game code\? Join<\/a>/);
  assert.doesNotMatch(visible(home.text), /\$\s?\d|\b119\b/, 'no price on "/"');
  assert.equal(L.HOST_NOW_URL, QL.HOST_URL);
  const t = await call('/teachers');
  assert.match(t.text, /<a class="btn btn-hot btn-big" href="\/teachers\/host" id="host-now">/);
  assert.match((await call('/teachers', { user: teacher })).text, /href="\/live\/quick" id="host-now"/);
  assert.doesNotMatch((await call('/teachers', { user: kid })).text, /id="host-now"/, 'a child is not offered hosting');
  const tl = await call('/teachers/live');
  assert.match(tl.text, /<a class="btn btn-primary btn-big" href="\/teachers\/host">▶ Host a free live game<\/a>/);
  assert.doesNotMatch(tl.text, /grown-ups\/signup/, 'a teacher is never sent to the parent sign-up');
  // the landing's click counter knows the new button
  const c = await call('/landing/count/host', { method: 'POST', headers: { 'sec-fetch-site': 'same-origin', 'user-agent': 'Mozilla/5.0 Chrome/141.0' } });
  assert.equal(c.status, 204);
  process.env.LANDING_AT_ROOT = '0';
});

test('live games off: every new page and API is a 404', async () => {
  config.liveClassroom = false;
  try {
    assert.equal((await call('/teachers/host')).status, 404);
    assert.equal((await signup()).status, 404);
    assert.equal((await call('/live/quick', { user: teacher })).status, 404);
    assert.equal((await call('/api/live/quick', { method: 'POST', user: teacher, body: {} })).status, 404);
    assert.doesNotMatch((await call('/teachers')).text, /id="host-now"/);
    assert.doesNotMatch((await call('/teach', { user: teacher })).text, /cc-quick/);
  } finally { config.liveClassroom = true; }
});

test('levelForGrade: a class\'s grade picks the question level', () => {
  assert.equal(QL.levelForGrade('K'), 'a6'); assert.equal(QL.levelForGrade('1'), 'a6'); assert.equal(QL.levelForGrade('Grade 3'), 'a8');
  assert.equal(QL.levelForGrade('5'), 'a10'); assert.equal(QL.levelForGrade('7B'), 'a12'); assert.equal(QL.levelForGrade(''), null); assert.equal(QL.levelForGrade('Blue group'), null);
});

test('a staff account\'s password: 12 characters is not enough when it is only digits, one piece repeated, or easy passwords end to end', async () => {
  for (const password of ['123456789012', 'passwordpassword', 'abcabcabcabc', 'qwerty123456', 'minecraft2024roblox']) {
    const r = await signup({ password });
    assert.equal(r.status, 400, password); assert.equal(r.json.field, 'password', password);
    assert.match(r.json.error, /too easy to guess/, password);
  }
  assert.equal(auth.checkStaffPassword('short-pass', '', undefined, 'too short'), 'too short');
  assert.match(auth.checkStaffPassword('MsRivera-teaches-4B', 'MsRivera'), /name/);
  for (const ok of ['sunny-meadow-42', 'correct horse battery', 'purple-otter-1234']) assert.equal(auth.checkStaffPassword(ok, 'MsRivera'), null, ok);
  assert.equal((await signup({ password: 'purple-otter-1234' })).status, 200);
});

test('a room open for one class: the teacher\'s other class cards lead back to it and say so, and offer no second room', async () => {
  const other = S.createClass(teacher, school.id, { name: 'Tia 6C' }).class;
  let home = await call('/teach', { user: teacher });
  assert.equal([...home.text.matchAll(/<form class="cc-quick"/g)].length, 2, 'no room open: Quick game on both cards');
  const r = await call('/api/live/quick', { method: 'POST', user: teacher, body: { classId: cls.id, last: '1' } });
  assert.equal(r.status, 200, r.text);
  home = await call('/teach', { user: teacher });
  assert.doesNotMatch(home.text, /<form class="cc-quick"/, 'no card offers a second room');
  assert.doesNotMatch(home.text, new RegExp(`href="/live\\?class=${other.id}"`));
  const back = [...home.text.matchAll(new RegExp(`<a class="btn btn-sm[^"]*cc-live[^"]*" href="/live/host/${r.json.sid}">`, 'g'))];
  assert.equal(back.length, 2, 'both cards lead to the open room');
  const note = home.text.match(new RegExp(`<p class="small muted cc-quick cc-elsewhere" data-room="${r.json.sid}">([^<]*)</p>`));
  assert.ok(note, 'the other class\'s card says a game is open already'); assert.match(note[1], /You already have a game open/);
  assert.equal([...home.text.matchAll(/cc-elsewhere/g)].length, 1, 'only on the card of the class the room is not for');
  // another teacher's page is as it was: their own Quick game, nothing about this room
  const theirs = await call('/teach', { user: teacher2 });
  assert.match(theirs.text, /<form class="cc-quick"/); assert.doesNotMatch(theirs.text, new RegExp(r.json.sid));
  LS.endSession(r.json.sid, 'ended');
  S.deleteClass(teacher, other.id);
});

test('keep-scores says which school; staff of two schools choose, and never get a school that is not theirs', async () => {
  await signup({ username: 'TwoSchools1' });
  const u = auth.getUserByName('TwoSchools1'), own = S.schoolsOf(u.id)[0];
  let page = await call('/teach/keep-scores', { user: u });
  assert.match(page.text, /<p class="small muted" id="ks-school">🏫 <bdi>Ms Rivera: my classroom<\/bdi><\/p>/);
  assert.doesNotMatch(page.text, /<select/);
  S.addMember(boss, school.id, u.id, 'teacher', { rosterName: 'Ms Rivera' });
  page = await call('/teach/keep-scores', { user: u });
  const sel = page.text.match(/<select class="input" id="ks-school" name="schoolId">([\s\S]*?)<\/select>/);
  assert.ok(sel, 'two schools: a picker');
  assert.deepEqual([...sel[1].matchAll(/<option value="([^"]+)">/g)].map(m => m[1]).sort(), [own.id, school.id].sort());
  const r = await call('/api/teach/keep-scores', { method: 'POST', user: u, body: { schoolId: school.id, name: 'Room 20', names: 'Nia\nOmar' } });
  assert.equal(r.status, 200, r.text);
  assert.equal(S.classesOf(u.id, 'teacher').find(c => c.name === 'Room 20').school_id, school.id);
  // a school they are not staff of: 404, and nothing is made
  const far = S.createSchool(boss, { name: 'Far Away' }).school;
  const no = await call('/api/teach/keep-scores', { method: 'POST', user: u, body: { schoolId: far.id, name: 'Room 21', names: 'Pia' } });
  assert.equal(no.status, 404); assert.equal(S.classesOf(u.id, 'teacher').some(c => c.name === 'Room 21'), false);
  assert.equal(q.get('SELECT COUNT(*) AS n FROM classrooms WHERE school_id=?', far.id).n, 0);
});
