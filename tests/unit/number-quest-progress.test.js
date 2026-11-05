// Number Quest's Duolingo-lite data layer (server/services/number-quest-progress.js, migration 0048;
// math course spec §6): Tally Marks for doing (never for first-try accuracy, never twice for the same
// thing), the student's own daily goal of 1-3 activities, and per-unit mastery laps in order. The layer
// is feature-scoped: every call naming another course is a no-op, and course_progress is never touched.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { q } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const NQ = await import('../../server/services/number-quest-progress.js');
const S = await import('../../server/services/schools.js');

const COURSE = { slug: 'number-quest' };
const CSQ = { slug: 'cs-quest' };
const CYBER = { slug: 'cyber-defenders' };
let n = 0;
const newKid = () => auth.createUser({ username: `nq${Date.now() % 1e6}x${++n}`, password: 'correct-horse-12', displayName: 'Kid' });
// Fixed moments (UTC days, the platform's `today`): a Wednesday and the Thursday after it.
const WED = Date.UTC(2026, 10, 4, 10, 0, 0);
const THU = Date.UTC(2026, 10, 5, 9, 0, 0);

test('migration 0048 made the four tables, and the constants match the spec', () => {
  const tables = q.all("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'nq_%' ORDER BY name").map(r => r.name);
  assert.deepEqual(tables, ['nq_daily_activity', 'nq_daily_goals', 'nq_laps', 'nq_placement', 'nq_sort_runs', 'nq_testout', 'nq_xp_events']);
  assert.equal(NQ.COURSE_SLUG, 'number-quest');
  assert.deepEqual(NQ.TIERS, ['launchpad', 'explorer', 'pro']);
  assert.deepEqual(NQ.DAILY_GOAL_CHOICES, [1, 2, 3]);
  assert.deepEqual(Object.keys(NQ.MARKS), ['check', 'mission', 'review', 'testout', 'lap']);
  // Lap definitions (§6.3): 1 as written, 2 scaled numbers / stretch, 3 mixed boss circuit.
  assert.equal(NQ.lapDef(1).mode, 'as-written');
  assert.equal(NQ.lapDef(2).mode, 'scaled');
  assert.match(NQ.lapDef(2).text, /bigger numbers/);
  assert.equal(NQ.lapDef(3).mode, 'boss-circuit');
  assert.match(NQ.lapDef(3).text, /boss round/);
  assert.equal(NQ.lapDef(4), null);
});

test('Tally Marks: fixed amounts per kind of thing done, one award per distinct thing', () => {
  const kid = newKid();
  assert.equal(NQ.totalMarks(kid, COURSE), 0);
  assert.deepEqual(NQ.awardCheckPassed(kid, COURSE, 'explorer-1.1', WED), { awarded: true, marks: 10, total: 10 });
  // The same check passed again (however many tries it took, however it was answered): no second award.
  // award() has no score or attempt input at all — marks cannot depend on first-try accuracy.
  assert.deepEqual(NQ.awardCheckPassed(kid, COURSE, 'explorer-1.1', WED), { awarded: false, marks: 0, total: 10 });
  assert.deepEqual(NQ.awardMissionCompleted(kid, COURSE, 'explorer-1.1', WED), { awarded: true, marks: 20, total: 30 });
  assert.deepEqual(NQ.awardReviewCompleted(kid, COURSE, 'jumble-mix-1', WED), { awarded: true, marks: 15, total: 45 });
  assert.deepEqual(NQ.awardTestOutPassed(kid, COURSE, 'explorer', 2, WED), { awarded: true, marks: 20, total: 65 });
  assert.deepEqual(NQ.awardTestOutPassed(kid, COURSE, 'explorer', 2, WED), { awarded: false, marks: 0, total: 65 });
  // A different thing of the same kind still pays; an unknown kind or an empty ref never does.
  assert.equal(NQ.awardCheckPassed(kid, COURSE, 'explorer-1.2', WED).total, 75);
  assert.equal(NQ.award(kid, COURSE, 'streak', 'explorer-1.3', WED).awarded, false);
  assert.equal(NQ.award(kid, COURSE, 'check', '  ', WED).awarded, false);
  assert.equal(NQ.awardTestOutPassed(kid, COURSE, 'explorer', 9, WED).awarded, false);
  assert.deepEqual(NQ.markEvents(kid, COURSE).map(e => [e.kind, e.ref, e.marks, e.day]), [
    ['check', 'explorer-1.1', 10, '2026-11-04'],
    ['mission', 'explorer-1.1', 20, '2026-11-04'],
    ['review', 'jumble-mix-1', 15, '2026-11-04'],
    ['testout', 'explorer:2', 20, '2026-11-04'],
    ['check', 'explorer-1.2', 10, '2026-11-04'],
  ]);
  // Marks are per player: another child starts at zero.
  assert.equal(NQ.totalMarks(newKid(), COURSE), 0);
  assert.equal(NQ.totalMarks(null, COURSE), 0);
});

test('feature-scoped: other courses and the shared progress tables are untouched', () => {
  const kid = newKid();
  for (const other of [CSQ, CYBER, { slug: 'nope' }, null]) {
    assert.equal(NQ.awardCheckPassed(kid, other, '1b-1.1', WED).awarded, false);
    assert.equal(NQ.totalMarks(kid, other), 0);
    assert.equal(NQ.getDailyGoal(kid, other), null);
    assert.equal(NQ.setDailyGoal(kid, other, 2), false);
    assert.equal(NQ.dailyStatus(kid, other), null);
    assert.equal(NQ.lapState(kid, other, 'explorer', 1), null);
    assert.equal(NQ.completeLap(kid, other, 'explorer', 1, 1, WED).recorded, false);
  }
  // Nothing was written anywhere: not in this layer's tables, not in course_progress / course_bands.
  for (const tbl of ['nq_xp_events', 'nq_daily_activity', 'nq_daily_goals', 'nq_laps', 'course_progress', 'course_bands']) {
    assert.equal(q.get(`SELECT COUNT(*) AS n FROM ${tbl} WHERE user_id=?`, kid.id).n, 0, tbl);
  }
  // The slug string works as well as the course object (the way routes hold a slug).
  assert.equal(NQ.awardCheckPassed(kid, 'number-quest', 'explorer-1.1', WED).awarded, true);
  assert.equal(NQ.totalMarks(kid, 'number-quest'), 10);
});

test('the daily goal: chosen by the student (1-3), counted per day, a missed day costs nothing', () => {
  const kid = newKid();
  assert.equal(NQ.getDailyGoal(kid, COURSE), 1, 'the gentlest goal until the student chooses');
  assert.equal(NQ.setDailyGoal(kid, COURSE, 3), true);
  assert.equal(NQ.getDailyGoal(kid, COURSE), 3);
  for (const bad of [0, 4, 2.5, '2', null]) assert.equal(NQ.setDailyGoal(kid, COURSE, bad), false, String(bad));
  assert.equal(NQ.getDailyGoal(kid, COURSE), 3, 'a refused choice leaves the old goal standing');
  assert.equal(NQ.setDailyGoal(kid, COURSE, 2), true);

  // Wednesday: one award counts as one activity; doing the same thing again adds nothing that day.
  NQ.awardCheckPassed(kid, COURSE, 'explorer-1.1', WED);
  NQ.awardCheckPassed(kid, COURSE, 'explorer-1.1', WED);
  assert.deepEqual(NQ.dailyStatus(kid, COURSE, '2026-11-04'), { day: '2026-11-04', goal: 2, done: 1, met: false, activities: ['check:explorer-1.1'] });
  NQ.awardMissionCompleted(kid, COURSE, 'explorer-1.1', WED);
  const wed = NQ.dailyStatus(kid, COURSE, '2026-11-04');
  assert.equal(wed.done, 2); assert.equal(wed.met, true);
  // A bare activity (no marks attached) counts too: one step, one mission, one review are all activities.
  assert.equal(NQ.recordActivity(kid, COURSE, 'step:explorer-1.2', WED), true);
  assert.equal(NQ.recordActivity(kid, COURSE, 'step:explorer-1.2', WED), false);
  assert.equal(NQ.dailyStatus(kid, COURSE, '2026-11-04').done, 3);

  // Thursday starts empty, yesterday is unchanged, and an untouched day is just empty — there is no
  // streak row, no broken state, nothing to lose.
  assert.deepEqual(NQ.dailyStatus(kid, COURSE, '2026-11-05'), { day: '2026-11-05', goal: 2, done: 0, met: false, activities: [] });
  assert.equal(NQ.dailyStatus(kid, COURSE, '2026-11-04').done, 3);
  assert.equal(NQ.dailyStatus(kid, COURSE, 'not-a-day'), null);
  assert.equal(q.all("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%streak%'").length, 0);
});

test('mastery laps: per tier and unit, in order, idempotent, and they award their marks once', () => {
  const kid = newKid();
  assert.deepEqual(NQ.lapState(kid, COURSE, 'explorer', 1),
    { tier: 'explorer', unit: 1, completed: [], rings: 0, current: 1, defs: NQ.LAP_DEFS });
  // Lap 2 cannot come before Lap 1, and a lap the course does not have cannot be recorded.
  assert.equal(NQ.completeLap(kid, COURSE, 'explorer', 1, 2, WED).recorded, false);
  assert.equal(NQ.completeLap(kid, COURSE, 'explorer', 1, 4, WED).recorded, false);
  assert.equal(NQ.completeLap(kid, COURSE, 'middle', 1, 1, WED).recorded, false);
  assert.equal(NQ.completeLap(kid, COURSE, 'explorer', 8, 1, WED).recorded, false);

  const l1 = NQ.completeLap(kid, COURSE, 'explorer', 1, 1, WED);
  assert.equal(l1.recorded, true);
  assert.deepEqual(l1.marks, { awarded: true, marks: 30, total: 30 });
  assert.deepEqual([l1.state.completed, l1.state.rings, l1.state.current], [[1], 1, 2]);
  // Again: no second row, no second award.
  const again = NQ.completeLap(kid, COURSE, 'explorer', 1, 1, WED);
  assert.equal(again.recorded, false); assert.equal(again.marks.awarded, false);
  assert.equal(NQ.totalMarks(kid, COURSE), 30);

  assert.equal(NQ.completeLap(kid, COURSE, 'explorer', 1, 2, THU).recorded, true);
  const l3 = NQ.completeLap(kid, COURSE, 'explorer', 1, 3, THU);
  assert.deepEqual([l3.state.completed, l3.state.rings, l3.state.current], [[1, 2, 3], 3, null]);
  assert.equal(NQ.totalMarks(kid, COURSE), 90);
  // Lap completions counted as activities on the days they happened.
  assert.deepEqual(NQ.dailyStatus(kid, COURSE, '2026-11-04').activities, ['lap:explorer:1:lap1']);
  assert.deepEqual(NQ.dailyStatus(kid, COURSE, '2026-11-05').activities, ['lap:explorer:1:lap2', 'lap:explorer:1:lap3']);

  // Laps are per unit and per tier: unit 2 and the Pro tier are still untouched, and a tier lists 7 units.
  assert.equal(NQ.lapState(kid, COURSE, 'explorer', 2).rings, 0);
  assert.equal(NQ.lapState(kid, COURSE, 'pro', 1).rings, 0);
  const tier = NQ.lapsForTier(kid, COURSE, 'explorer');
  assert.equal(tier.length, 7);
  assert.deepEqual(tier.map(u => u.unit), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(tier[0].rings, 3); assert.equal(tier[1].rings, 0);
  assert.deepEqual(NQ.lapsForTier(kid, COURSE, 'middle'), []);
});

test('a school-account merge carries the Number Quest layer over, the student\u2019s own rows winning', () => {
  const boss = auth.createUser({ username: `nqboss${Date.now() % 1e6}`, password: 'correct-horse-12', role: 'admin' });
  const school = S.createSchool(boss, { name: 'Merge Primary' }).school;
  const head = S.createSchoolAccount(boss, school.id, { rosterName: 'Mrs Head', role: 'admin' }).user;
  const teacher = S.createSchoolAccount(head, school.id, { rosterName: 'Ms Merge', role: 'teacher' }).user;
  const cls = S.createClass(teacher, school.id, { name: 'Merge Class' }).class;
  const placeholder = S.createSchoolAccount(teacher, school.id, { rosterName: 'Merge Kid' }).user;
  S.addToClass(teacher, cls.id, placeholder.id);
  const kid = newKid();

  // The school account did Number Quest work; the student's own account did one of the same things.
  NQ.awardCheckPassed(placeholder, COURSE, 'explorer-1.1', WED); // also on the kid's account: the kid's row wins
  NQ.awardMissionCompleted(placeholder, COURSE, 'explorer-1.1', WED);
  NQ.setDailyGoal(placeholder, COURSE, 3);
  NQ.completeLap(placeholder, COURSE, 'explorer', 1, 1, WED);
  NQ.awardCheckPassed(kid, COURSE, 'explorer-1.1', WED);

  assert.equal(S.requestJoin(kid, cls.join_code).state, 'pending');
  const req = S.pendingRequests(cls.id)[0];
  assert.ok(S.approveRequest(teacher, req.id, { sameAs: placeholder.id }).ok);

  // Carried over: the mission (20) and the lap (30) join the kid's own check (10) — the shared check pays once.
  assert.equal(NQ.totalMarks(kid, COURSE), 60);
  assert.deepEqual(NQ.markEvents(kid, COURSE).map(e => e.kind).sort(), ['check', 'lap', 'mission']);
  assert.equal(NQ.getDailyGoal(kid, COURSE), 3);
  assert.equal(NQ.lapState(kid, COURSE, 'explorer', 1).rings, 1);
  assert.equal(NQ.dailyStatus(kid, COURSE, '2026-11-04').done, 3);
  // Nothing is left behind on the merged-away account.
  for (const tbl of ['nq_xp_events', 'nq_daily_goals', 'nq_daily_activity', 'nq_laps']) {
    assert.equal(q.get(`SELECT COUNT(*) AS n FROM ${tbl} WHERE user_id=?`, placeholder.id).n, 0, tbl);
  }
});
