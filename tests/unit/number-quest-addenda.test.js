// Greg's two binding pre-review addenda (build brief, 2026-11-04 20:55 and 20:57), landed after the
// Phase 1 parity pass:
// 1. The student's grade is stored and moves with time: nq_placement stores the DECLARED grade and the
//    date it was declared (migration 0051); the current grade is derived — declared + 1 per September 1
//    rollover since the declaration, capped at grade 8 — and everything that consumes the grade
//    (seeding, re-seeding, grown-up views) reads the derived value. A fresh declaration or a grown-up
//    override replaces the stored grade and resets the clock.
// 2. Guests cannot complete courses: a guest's check pass / game win is kept as a pending fact
//    (course_pending_wins, migration 0050), never as progress — no completion, no Tally Marks, no laps,
//    no stored placement or grade, in any course. The complete endpoint refuses a guest with the
//    sign-in prompt; the kept win completes, marks and all, when the student signs in.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { createApp } = await import('../../server/app.js');
const { q, now } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const C = await import('../../server/services/courses.js');
const NQ = await import('../../server/services/number-quest-progress.js');
const P = await import('../../server/services/number-quest-placement.js');
const { generateItem, TEMPLATES } = await import('../../seed-lessons/number-quest/placement/generator.js');

let n = 0;
const newKid = () => auth.createUser({ username: `nqa${Date.now() % 1e6}x${++n}`, password: 'correct-horse-12', displayName: 'Kid' });
const NQ_COURSE = C.getCourse('number-quest');
const CSQ_COURSE = C.getCourse('cs-quest');
const step11 = C.getStep(NQ_COURSE, 'explorer-1.1');
const allRight = step => Object.fromEntries(step.check.map(id => [id, C.item(id).answer]));

// ------------------------------------------------------------------------------------------------- the grade
test('migrations: pending-wins table and the grade declaration date exist', () => {
  const t = q.get("SELECT name FROM sqlite_master WHERE type='table' AND name='course_pending_wins'");
  assert.ok(t);
  const cols = q.all('PRAGMA table_info(nq_placement)').map(r => r.name);
  assert.ok(cols.includes('grade_declared_at'));
});

test('deriveGrade: September 1 is the rollover, counted strictly after the declaration day', () => {
  const aug31 = Date.UTC(2026, 7, 31), sept1 = Date.UTC(2026, 8, 1);
  // Declared the day before -> the grade advances on September 1.
  assert.equal(P.deriveGrade(3, aug31, sept1), 4);
  assert.equal(P.deriveGrade(3, aug31, aug31), 3);
  // Declared ON September 1 -> that is already the new school year's grade; no advance until the next.
  assert.equal(P.deriveGrade(3, sept1, sept1), 3);
  assert.equal(P.deriveGrade(3, sept1, Date.UTC(2027, 7, 31)), 3);
  assert.equal(P.deriveGrade(3, sept1, Date.UTC(2027, 8, 1)), 4);
  // Several rollovers accumulate; kindergarten is grade 0 and steps up like any other.
  assert.equal(P.deriveGrade(2, Date.UTC(2023, 5, 15), Date.UTC(2026, 10, 5)), 6);
  assert.equal(P.deriveGrade(0, aug31, sept1), 1);
  // The cap: time alone never pushes past grade 8.
  assert.equal(P.deriveGrade(7, Date.UTC(2023, 0, 10), Date.UTC(2026, 10, 5)), 8);
  assert.equal(P.deriveGrade(8, aug31, Date.UTC(2030, 10, 5)), 8);
  // Nothing declared -> nothing derived; a dateless declaration stands as declared.
  assert.equal(P.deriveGrade(null, aug31, sept1), null);
  assert.equal(P.deriveGrade(4, null, sept1), 4);
});

test('the declared grade persists, and the current grade is derived from its date, never edited', () => {
  const kid = newKid();
  const p = P.placeAtBeginning(kid, 3);
  assert.equal(p.grade, 3); assert.equal(p.declaredGrade, 3);
  assert.ok(Math.abs(p.gradeDeclaredAt - now()) < 120e3, 'the declaration date is stored');
  const row = q.get('SELECT grade, grade_declared_at FROM nq_placement WHERE user_id=?', kid.id);
  assert.equal(row.grade, 3);
  // Time passes (the stored date is moved back, as if the declaration were older): the derived grade
  // moves with it, while the stored declaration itself is untouched.
  const old = Date.UTC(2025, 7, 31);
  q.run('UPDATE nq_placement SET grade_declared_at=? WHERE user_id=?', old, kid.id);
  const later = P.getPlacement(kid);
  assert.equal(later.grade, P.deriveGrade(3, old));
  assert.ok(later.grade > 3, 'the derived grade advanced across the September 1 in between');
  assert.equal(later.declaredGrade, 3);
  assert.equal(q.get('SELECT grade FROM nq_placement WHERE user_id=?', kid.id).grade, 3, 'time never edits the stored grade');
});

test('a fresh declaration replaces the stored grade and resets the clock', () => {
  const kid = newKid();
  P.placeAtBeginning(kid, 3);
  q.run('UPDATE nq_placement SET grade_declared_at=? WHERE user_id=?', Date.UTC(2024, 7, 31), kid.id);
  assert.ok(P.getPlacement(kid).grade > 3);
  const p = P.placeAtBeginning(kid, 5);
  assert.equal(p.declaredGrade, 5); assert.equal(p.grade, 5);
  assert.ok(Math.abs(p.gradeDeclaredAt - now()) < 120e3, 'the clock restarted at the new declaration');
});

test('a grown-up override re-anchors the grade at its current value and resets the clock', () => {
  const kid = newKid();
  P.placeAtBeginning(kid, 3);
  const old = Date.UTC(2024, 7, 31);
  q.run('UPDATE nq_placement SET grade_declared_at=? WHERE user_id=?', old, kid.id);
  const derivedBefore = P.getPlacement(kid).grade;
  assert.equal(derivedBefore, P.deriveGrade(3, old));
  const p = P.overrideStartNode(kid, 'explorer-2.1');
  assert.equal(p.startNode, 'explorer-2.1'); assert.equal(p.source, 'override');
  assert.equal(p.grade, derivedBefore, 'the override keeps the grade the student has today');
  assert.equal(p.declaredGrade, derivedBefore, '...as the new stored declaration');
  assert.ok(Math.abs(p.gradeDeclaredAt - now()) < 120e3, '...with the clock reset to the override');
});

test('seeding: a run that names no grade re-seeds at the derived current grade', () => {
  const kid = newKid();
  P.placeAtBeginning(kid, 2);
  const old = Date.UTC(2024, 7, 31);
  q.run('UPDATE nq_placement SET grade_declared_at=? WHERE user_id=?', old, kid.id);
  const derived = P.deriveGrade(2, old);
  assert.equal(P.startRun(kid, { grade: '' }).state.grade, derived);
  assert.equal(P.startRun(kid, {}).state.grade, derived);
  assert.equal(P.startRun(kid, { grade: 3 }).state.grade, 3, 'a named grade wins over the stored one');
});

// ------------------------------------------------------------------------------------------------- guests: placement
test('a guest stores no placement and no grade, however they play', () => {
  const guest = auth.createGuest();
  const p = P.placeAtBeginning(guest, 4);
  assert.equal(p.startNode, 'explorer-1.1', 'the door still answers for this sitting');
  assert.equal(p.guest, true);
  assert.equal(P.getPlacement(guest), null);
  assert.equal(q.get('SELECT * FROM nq_placement WHERE user_id=?', guest.id), undefined);
  // A whole Sorting Game, answered all the way: a start point is named, and still nothing is stored.
  const run = P.startRun(guest, { grade: 4 });
  let result = null;
  for (let i = 0; i < 30 && !result; i++) {
    const row = q.get('SELECT current_item FROM nq_sort_runs WHERE id=? AND user_id=?', run.runId, guest.id);
    const c = JSON.parse(row.current_item);
    const full = generateItem(TEMPLATES.find(x => x.id === c.templateId), c.itemSeed);
    const answer = full.responseType === 'pick' ? { choice: full.answerIndex } : { value: String(full.answer) };
    const out = P.answerRun(guest, run.runId, answer);
    if (out && out.result) result = out.result;
  }
  assert.ok(result && result.startNode, 'the game still places the guest for the sitting');
  assert.equal(P.getPlacement(guest), null);
  assert.equal(q.get('SELECT * FROM nq_placement WHERE user_id=?', guest.id), undefined);
});

test('a guest test-out pass is applauded, never recorded', () => {
  const guest = auth.createGuest();
  const run = P.startRun(guest, { kind: 'testout', unit: 1 });
  let result = null;
  for (let i = 0; i < 5; i++) {
    const row = q.get('SELECT current_item FROM nq_sort_runs WHERE id=? AND user_id=?', run.runId, guest.id);
    const c = JSON.parse(row.current_item);
    const full = generateItem(TEMPLATES.find(x => x.id === c.templateId), c.itemSeed);
    const answer = full.responseType === 'pick' ? { choice: full.answerIndex } : { value: String(full.answer) };
    const out = P.answerRun(guest, run.runId, answer);
    if (out && out.result) result = out.result;
  }
  assert.equal(result.passed, true);
  assert.equal(result.marks.awarded, false);
  assert.deepEqual(P.testedOutUnits(guest), []);
  assert.equal(q.get('SELECT * FROM nq_testout WHERE user_id=?', guest.id), undefined);
});

test('the Number Quest layer itself pays a guest nothing: no marks, no activity, no laps', () => {
  const guest = auth.createGuest();
  assert.equal(NQ.awardCheckPassed(guest, NQ_COURSE, 'explorer-1.1').awarded, false);
  assert.equal(NQ.recordActivity(guest, NQ_COURSE, 'check:explorer-1.1'), false);
  assert.equal(NQ.completeLap(guest, NQ_COURSE, 'explorer', 1, 1).recorded, false);
  assert.equal(NQ.totalMarks(guest, NQ_COURSE), 0);
  assert.equal(q.get('SELECT * FROM nq_xp_events WHERE user_id=?', guest.id), undefined);
  assert.equal(q.get('SELECT * FROM nq_laps WHERE user_id=?', guest.id), undefined);
});

// ------------------------------------------------------------------------------------------------- guests: completion over HTTP
let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const H = { accept: 'text/html', 'user-agent': 'Mozilla/5.0 Chrome/141.0' };
const get = async (path, cookie) => { const r = await fetch(base + path, { headers: { ...H, ...(cookie ? { cookie } : {}) }, redirect: 'manual' }); return { status: r.status, text: await r.text() }; };
const post = async (path, cookie, body) => {
  const r = await fetch(base + path, { method: 'POST', redirect: 'manual', headers: { ...H, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, json, text, setCookies: r.headers.getSetCookie ? r.headers.getSetCookie() : [] };
};
const sessionCookieOf = setCookies => {
  const mine = setCookies.filter(c => c.startsWith('brb_session=') && c.length > 20);
  return mine.length ? mine[mine.length - 1].split(';')[0] : null;
};

test('a guest win is refused with the sign-in prompt, then honoured in full on sign-up', async () => {
  const guest = auth.createGuest();
  const cookie = cookieFor(guest.id);
  // The intro step (0.1) has no game: its passed check IS its completion moment, so the guest meets
  // the sign-in prompt right there — and the kept fact opens step 1.1 for the sitting.
  const step01 = C.getStep(NQ_COURSE, 'explorer-0.1');
  assert.equal(step01.game, null);
  const intro = await post('/api/courses/number-quest/explorer-0.1/check', cookie, { answers: allRight(step01) });
  assert.equal(intro.status, 200); assert.equal(intro.json.passed, true);
  assert.ok(intro.json.needAccount && String(intro.json.needAccount.signup).startsWith('/signup'), 'the prompt rides the completion moment');
  assert.equal(q.get('SELECT * FROM course_progress WHERE user_id=? AND course=?', guest.id, 'number-quest'), undefined, 'nothing is recorded');
  assert.equal(C.stateOf(guest, NQ_COURSE, 'explorer-1.1').open, true, 'the kept fact opens the next step for the sitting');
  // Step 1.1's check, passed: the sitting flows on (a play link comes back), still nothing recorded.
  const chk = await post('/api/courses/number-quest/explorer-1.1/check', cookie, { answers: allRight(step11) });
  assert.equal(chk.status, 200); assert.equal(chk.json.passed, true);
  assert.ok(chk.json.play && chk.json.play.includes('/play/'), 'the module still opens for the sitting');
  assert.equal(q.get('SELECT * FROM course_progress WHERE user_id=? AND course=?', guest.id, 'number-quest'), undefined);
  assert.equal(C.pendingFacts(guest, NQ_COURSE, step11).check, true);
  // The module opens for the guest (the /play gate reads the pending fact), and entering it is a fact too.
  assert.equal(C.playable(guest, NQ_COURSE, 'explorer-1.1', step11.game.slug).key, 'explorer-1.1');
  C.markPlayed(guest, NQ_COURSE, step11);
  // The win: refused, with the prompt — and kept.
  const win = await post('/api/courses/number-quest/explorer-1.1/complete', cookie, {});
  assert.equal(win.status, 403);
  assert.equal(win.json.needAccount, true); assert.equal(win.json.pendingWin, true);
  assert.ok(String(win.json.signup).startsWith('/signup'));
  assert.equal(q.get('SELECT * FROM course_progress WHERE user_id=? AND course=? AND (checked_at IS NOT NULL OR completed_at IS NOT NULL)', guest.id, 'number-quest'), undefined, 'the win recorded no progress');
  assert.equal(NQ.totalMarks(guest, NQ_COURSE), 0);
  assert.equal(C.pendingFacts(guest, NQ_COURSE, step11).win, true);
  assert.deepEqual(C.applyPendingWins(guest), [], 'a guest’s own facts are never applied to a guest');
  // Sign up (the guest upgrade: the same user row becomes the account).
  const name = `herox${++n}`; // (kid-safe name rules: no long digit runs)
  const su = await post('/api/auth/signup', cookie, { username: name, password: 'correct-horse-12' });
  assert.equal(su.status, 200); assert.equal(su.json.user.id, guest.id, 'the upgrade keeps the same account');
  const newCookie = sessionCookieOf(su.setCookies); assert.ok(newCookie);
  // The next course page honours the kept win: the step is complete, marks and all, facts cleared.
  const page1 = await get('/courses/number-quest', newCookie);
  assert.equal(page1.status, 200);
  const kid = auth.getUser(guest.id);
  assert.equal(kid.is_guest, 0);
  assert.equal(C.stateOf(kid, NQ_COURSE, 'explorer-1.1').complete, true);
  assert.equal(C.stateOf(kid, NQ_COURSE, 'explorer-0.1').complete, true, 'the intro’s kept check is honoured too: it was a finished step');
  // Two checks (0.1 and 1.1) and one mission (1.1): the whole sitting’s earnings land at sign-in.
  assert.equal(NQ.totalMarks(kid, NQ_COURSE), 2 * NQ.MARKS.check + NQ.MARKS.mission);
  assert.deepEqual(q.all('SELECT * FROM course_pending_wins WHERE user_id=?', kid.id), []);
});

test('a guest who signs in to an existing account hands the win over at login', async () => {
  const guest = auth.createGuest();
  C.recordCheck(guest, NQ_COURSE, step11, { score: 3, passed: true });
  C.markPlayed(guest, NQ_COURSE, step11);
  C.stashPendingFact(guest, NQ_COURSE, step11, 'win');
  const kid = newKid();
  const li = await post('/api/auth/login', cookieFor(guest.id), { username: kid.username, password: 'correct-horse-12' });
  assert.equal(li.status, 200); assert.equal(li.json.user.id, kid.id);
  assert.deepEqual(q.all('SELECT * FROM course_pending_wins WHERE user_id=?', guest.id), [], 'nothing is stranded on the guest');
  assert.equal(q.all('SELECT * FROM course_pending_wins WHERE user_id=?', kid.id).length, 3, 'the facts moved to the account');
  const page1 = await get('/courses/number-quest', sessionCookieOf(li.setCookies));
  assert.equal(page1.status, 200);
  assert.equal(C.stateOf(kid, NQ_COURSE, 'explorer-1.1').complete, true);
  assert.equal(NQ.totalMarks(kid, NQ_COURSE), NQ.MARKS.check + NQ.MARKS.mission);
});

test('the gate is platform-wide: a CS Quest guest win is refused the same way', async () => {
  const guest = auth.createGuest();
  const cookie = cookieFor(guest.id);
  const intro = C.getStep(CSQ_COURSE, '1b-0.1'); // the course-only intro: no game, its check is its finish
  const ic = await post('/api/courses/cs-quest/1b-0.1/check', cookie, { answers: allRight(intro) });
  assert.equal(ic.status, 200); assert.equal(ic.json.passed, true);
  assert.ok(ic.json.needAccount, 'the intro’s completion moment carries the prompt too');
  const step = C.getStep(CSQ_COURSE, '1b-1.1');
  const chk = await post('/api/courses/cs-quest/1b-1.1/check', cookie, { answers: allRight(step) });
  assert.equal(chk.status, 200); assert.equal(chk.json.passed, true);
  C.markPlayed(guest, CSQ_COURSE, step);
  const win = await post('/api/courses/cs-quest/1b-1.1/complete', cookie, {});
  assert.equal(win.status, 403); assert.equal(win.json.needAccount, true);
  assert.equal(q.get('SELECT * FROM course_progress WHERE user_id=? AND course=? AND (checked_at IS NOT NULL OR completed_at IS NOT NULL)', guest.id, 'cs-quest'), undefined, 'no CS Quest progress was recorded either');
});

test('signed-in flows are unchanged: check, play, win — recorded, completed, awarded', async () => {
  const kid = newKid();
  const cookie = cookieFor(kid.id);
  const step01 = C.getStep(NQ_COURSE, 'explorer-0.1');
  const intro = await post('/api/courses/number-quest/explorer-0.1/check', cookie, { answers: allRight(step01) });
  assert.equal(intro.status, 200); assert.equal(intro.json.passed, true);
  assert.equal(intro.json.needAccount, undefined, 'an account never sees the guest prompt');
  assert.equal(C.stateOf(kid, NQ_COURSE, 'explorer-0.1').complete, true, 'a no-game step completes at its recorded check');
  assert.equal(NQ.totalMarks(kid, NQ_COURSE), NQ.MARKS.check);
  const chk = await post('/api/courses/number-quest/explorer-1.1/check', cookie, { answers: allRight(step11) });
  assert.equal(chk.status, 200); assert.equal(chk.json.passed, true);
  assert.equal(C.stateOf(kid, NQ_COURSE, 'explorer-1.1').checked, true, 'the pass is recorded at once');
  assert.equal(NQ.totalMarks(kid, NQ_COURSE), 2 * NQ.MARKS.check);
  C.markPlayed(kid, NQ_COURSE, step11);
  const win = await post('/api/courses/number-quest/explorer-1.1/complete', cookie, {});
  assert.equal(win.status, 200); assert.deepEqual({ ok: win.json.ok, complete: win.json.complete }, { ok: true, complete: true });
  assert.equal(C.stateOf(kid, NQ_COURSE, 'explorer-1.1').complete, true);
  assert.equal(NQ.totalMarks(kid, NQ_COURSE), 2 * NQ.MARKS.check + NQ.MARKS.mission);
  assert.deepEqual(q.all('SELECT * FROM course_pending_wins WHERE user_id=?', kid.id), [], 'an account never needs pending facts');
});
