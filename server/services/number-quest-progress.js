// Number Quest's Duolingo-lite progress layer (math course spec §6): Tally Marks, the daily goal and mastery
// laps. Data layer only — no routes, no pages; the course map and profile read this in a later stage.
//
// Feature-scoped on purpose: every function takes the course (a slug string or a course object, the way
// services/courses.js passes courses around) and does nothing at all unless it is Number Quest. CS Quest and
// Cyber Defenders never gain or lose a row here, and this layer never writes course_progress: a step still
// completes the win-gated way (services/courses.js isComplete); this layer only records what the doing earned.
//
// The rules the spec fixes, kept in the code rather than in copy:
// - Tally Marks are for doing, not for being right first time (§6.2). award() takes no score and no attempt
//   count, so there is nothing to pay a first-try bonus with; its amounts are fixed per kind of thing done.
//   Marks are a total to watch grow: never spendable, and nothing here ranks one child against another.
// - One award per distinct thing done: the ledger's UNIQUE(user, course, kind, ref) makes a repeat of the
//   same check / mission / lap / review / test-out a no-op, so replaying one easy step cannot farm marks.
//   Trying again is still free and still counts as the day's activity the first time it is done that day.
// - The daily goal is the student's own choice of 1, 2 or 3 activities (§6.1). Missing it stores nothing and
//   costs nothing: there is no streak table and no "broken" state anywhere in this layer.
// - Laps (§6.3) are per unit and in order: Lap 1 is the unit as written, Lap 2 the same steps with the
//   numbers scaled up a rung (Launchpad: the next lane up), Lap 3 a mixed circuit of the unit's skills with
//   its neighbors plus the unit's boss round. A lap can only be recorded after the one before it, laps are
//   optional forever, and nothing in the course gates on them.
// - Guests earn nothing here (Greg's addendum, 2026-11-04: guests cannot complete courses): award,
//   recordActivity and completeLap write nothing for a guest account. A win a guest earns is kept as a
//   pending fact by the course layer (services/courses.js) and honoured — marks and lap included —
//   when the student signs in.
import { q, uid, now, today } from '../db.js';
import { onAccountMerge } from './schools.js';

/** The one course this layer serves. */
export const COURSE_SLUG = 'number-quest';
/** The course's three tiers, bottom to top (spec §1). Grade labels live on the teacher page, not here. */
export const TIERS = Object.freeze(['launchpad', 'explorer', 'pro']);
/** Units per tier (spec §2: 7 units of 3 steps, plus an intro and a finale that are not lap units). */
export const UNITS_PER_TIER = 7;

/** Tally Marks per kind of thing done (spec §6.2's list). Design amounts, fixed in one place: a check is the
 *  smallest unit of doing, a finished mission is worth two checks, a whole lap or a passed test-out is the
 *  biggest single award. Nothing here is a measured statistic — it is the course's own points table. */
export const MARKS = Object.freeze({ check: 10, mission: 20, review: 15, testout: 20, lap: 30 });
export const MARK_KINDS = Object.freeze(Object.keys(MARKS));

/** What each lap of a unit is (spec §6.3), authored once here so the map, the teacher page and the tests all
 *  read the same words. `mode` is the machine key a later stage uses to scale a unit's checks and missions. */
export const LAP_DEFS = Object.freeze([
  Object.freeze({ lap: 1, mode: 'as-written', title: 'Lap 1', text: 'The unit as written.' }),
  // Laps 2 and 3 are designed (spec §6.3) but NOT built: no scaled checks, harder mission sets or boss
  // circuit exist yet, and replaying a step today replays the same content. Their text says so plainly
  // wherever it is shown (the path, the teacher page), and nothing records them: completeLap is only
  // ever called for Lap 1 by the step APIs (routes/courses.js nqLapSync). When they are built, this
  // text is where the promise changes back.
  Object.freeze({ lap: 2, mode: 'scaled', title: 'Lap 2', text: 'Being built: the same steps with bigger numbers (the stretch examples move into the check, missions use harder level sets; in Launchpad, the next lane up). Not playable yet: replaying a step today replays Lap 1\u2019s content.' }),
  Object.freeze({ lap: 3, mode: 'boss-circuit', title: 'Lap 3', text: 'Being built: a mixed circuit of this unit\u2019s skills interleaved with its neighbors\u2019, plus the unit\u2019s boss round at full strength. Not playable yet.' }),
]);
export const lapDef = lap => LAP_DEFS.find(d => d.lap === lap) || null;

const slugOf = course => (typeof course === 'string' ? course : course && course.slug) || null;
/** True only for Number Quest: the guard every public function below starts with. */
export const isNumberQuest = course => slugOf(course) === COURSE_SLUG;
const ok = (user, course) => !!(user && user.id && isNumberQuest(course));
const cleanRef = ref => (typeof ref === 'string' ? ref.trim().slice(0, 120) : '');
const isUnit = unit => Number.isInteger(unit) && unit >= 1 && unit <= UNITS_PER_TIER;

// ------------------------------------------------------------------------------------------------- Tally Marks
/** Record one distinct activity for the day (idempotent per day + ref) and say whether it was new today.
 *  An activity is one step, one mission, one review — whatever the caller did (spec §6.1). Exported for the
 *  later wiring; award() already calls it, so anything that earns marks also counts toward the daily goal. */
export function recordActivity(user, course, ref, at = now()) {
  if (!ok(user, course) || user.is_guest) return false;
  const r = cleanRef(ref); if (!r) return false;
  const res = q.run('INSERT OR IGNORE INTO nq_daily_activity(user_id, course, day, ref, created_at) VALUES (?,?,?,?,?)',
    user.id, COURSE_SLUG, today(at), r, at);
  return res.changes > 0;
}

/** Award Tally Marks for one thing done: { awarded, marks, total }. `kind` is one of MARK_KINDS, `ref` names
 *  the thing (a step key, a unit's lap, a review id). The same kind + ref never pays twice. An unknown kind,
 *  an empty ref, no user, or any other course earns nothing and writes nothing. */
export function award(user, course, kind, ref, at = now()) {
  const total = () => totalMarks(user, course);
  if (!ok(user, course) || user.is_guest || !MARK_KINDS.includes(kind)) return { awarded: false, marks: 0, total: total() };
  const r = cleanRef(ref); if (!r) return { awarded: false, marks: 0, total: total() };
  const res = q.run('INSERT OR IGNORE INTO nq_xp_events(id, user_id, course, kind, ref, marks, day, created_at) VALUES (?,?,?,?,?,?,?,?)',
    uid(), user.id, COURSE_SLUG, kind, r, MARKS[kind], today(at), at);
  if (res.changes > 0) recordActivity(user, course, `${kind}:${r}`, at);
  return { awarded: res.changes > 0, marks: res.changes > 0 ? MARKS[kind] : 0, total: total() };
}
/** The named happenings of spec §6.2, one wrapper each so callers never spell a kind or a ref shape twice. */
export const awardCheckPassed = (user, course, stepKey, at) => award(user, course, 'check', cleanRef(stepKey), at);
export const awardMissionCompleted = (user, course, stepKey, at) => award(user, course, 'mission', cleanRef(stepKey), at);
export const awardReviewCompleted = (user, course, reviewRef, at) => award(user, course, 'review', cleanRef(reviewRef), at);
export const awardTestOutPassed = (user, course, tier, unit, at) => (TIERS.includes(tier) && isUnit(unit))
  ? award(user, course, 'testout', `${tier}:${unit}`, at)
  : { awarded: false, marks: 0, total: totalMarks(user, course) };

/** The player's Tally Marks total for Number Quest (0 for anyone else, any other course, or no player). */
export function totalMarks(user, course) {
  if (!ok(user, course)) return 0;
  const r = q.get('SELECT COALESCE(SUM(marks), 0) AS total FROM nq_xp_events WHERE user_id=? AND course=?', user.id, COURSE_SLUG);
  return r ? r.total : 0;
}
/** The player's ledger, oldest first: [{ kind, ref, marks, day, created_at }] — the profile's "what I did". */
export function markEvents(user, course) {
  if (!ok(user, course)) return [];
  return q.all('SELECT kind, ref, marks, day, created_at FROM nq_xp_events WHERE user_id=? AND course=? ORDER BY created_at, rowid', user.id, COURSE_SLUG);
}

// ------------------------------------------------------------------------------------------------- the daily goal
/** The gentlest goal, until the student picks their own. */
export const DEFAULT_DAILY_GOAL = 1;
export const DAILY_GOAL_CHOICES = Object.freeze([1, 2, 3]);

/** The student's chosen daily goal: 1, 2 or 3 activities (DEFAULT_DAILY_GOAL until they choose). */
export function getDailyGoal(user, course) {
  if (!ok(user, course)) return null;
  const r = q.get('SELECT goal FROM nq_daily_goals WHERE user_id=? AND course=?', user.id, COURSE_SLUG);
  return r && DAILY_GOAL_CHOICES.includes(r.goal) ? r.goal : DEFAULT_DAILY_GOAL;
}
/** Choose the daily goal. Anything but the whole numbers 1, 2 or 3 is refused and the old goal stands. */
export function setDailyGoal(user, course, goal) {
  if (!ok(user, course) || !DAILY_GOAL_CHOICES.includes(goal)) return false;
  q.run('INSERT INTO nq_daily_goals(user_id, course, goal, updated_at) VALUES (?,?,?,?) ON CONFLICT(user_id, course) DO UPDATE SET goal=excluded.goal, updated_at=excluded.updated_at',
    user.id, COURSE_SLUG, goal, now());
  return true;
}
/** One day against the goal: { day, goal, done, met, activities }. `day` is a YYYY-MM-DD string (UTC, the
 *  platform's `today`); it defaults to today. A day with nothing done is done: 0, met: false — and that is
 *  all that is ever true about it; nothing anywhere records it as a failure or a broken streak. */
export function dailyStatus(user, course, day = today()) {
  if (!ok(user, course) || !/^\d{4}-\d{2}-\d{2}$/.test(String(day || ''))) return null;
  const activities = q.all('SELECT ref FROM nq_daily_activity WHERE user_id=? AND course=? AND day=? ORDER BY created_at, ref', user.id, COURSE_SLUG, day)
    .map(r => r.ref);
  const goal = getDailyGoal(user, course);
  return { day, goal, done: activities.length, met: activities.length >= goal, activities };
}

// ------------------------------------------------------------------------------------------------- mastery laps
/** One unit's lap state: { tier, unit, completed: [laps done, in order], rings (the map's 0-3 rings, spec
 *  §6.3), current (the lap to try next, or null when all three are done), defs: LAP_DEFS }. Null for a tier
 *  or unit the course does not have. */
export function lapState(user, course, tier, unit) {
  if (!ok(user, course) || !TIERS.includes(tier) || !isUnit(unit)) return null;
  const completed = q.all('SELECT lap FROM nq_laps WHERE user_id=? AND course=? AND tier=? AND unit=? ORDER BY lap', user.id, COURSE_SLUG, tier, unit)
    .map(r => r.lap);
  const rings = completed.length ? Math.max(...completed) : 0;
  return { tier, unit, completed, rings, current: rings < 3 ? rings + 1 : null, defs: LAP_DEFS };
}
/** Every unit's lap state for a tier: 7 entries, units 1-7 in order (units never touched are rings: 0). */
export function lapsForTier(user, course, tier) {
  if (!ok(user, course) || !TIERS.includes(tier)) return [];
  return Array.from({ length: UNITS_PER_TIER }, (_, i) => lapState(user, course, tier, i + 1));
}
/** Record a finished lap: { recorded, state, marks }. Laps are in order — lap N needs lap N-1 done first —
 *  and a lap already recorded is a no-op (no second row, no second award). Recording a lap also awards its
 *  Tally Marks (kind 'lap') and counts as the day's activity, through award(). */
export function completeLap(user, course, tier, unit, lap, at = now()) {
  const state = () => lapState(user, course, tier, unit);
  if (user && user.is_guest) return { recorded: false, state: state(), marks: { awarded: false, marks: 0, total: totalMarks(user, course) } };
  if (!lapDef(lap)) return { recorded: false, state: state(), marks: { awarded: false, marks: 0, total: totalMarks(user, course) } };
  const before = state();
  if (!before) return { recorded: false, state: null, marks: { awarded: false, marks: 0, total: 0 } };
  if (before.completed.includes(lap)) return { recorded: false, state: before, marks: { awarded: false, marks: 0, total: totalMarks(user, course) } };
  if (lap > 1 && !before.completed.includes(lap - 1)) return { recorded: false, state: before, marks: { awarded: false, marks: 0, total: totalMarks(user, course) } };
  q.run('INSERT INTO nq_laps(user_id, course, tier, unit, lap, completed_at) VALUES (?,?,?,?,?,?)', user.id, COURSE_SLUG, tier, unit, lap, at);
  const marks = award(user, course, 'lap', `${tier}:${unit}:lap${lap}`, at);
  return { recorded: true, state: state(), marks };
}

// A school account merged into a student's own account brings its Number Quest layer (the student's own
// rows win, as with course_progress in services/courses.js).
onAccountMerge(({ from, into }) => {
  q.run('UPDATE OR IGNORE nq_xp_events SET user_id=? WHERE user_id=?', into, from);
  q.run('DELETE FROM nq_xp_events WHERE user_id=?', from);
  q.run('UPDATE OR IGNORE nq_daily_goals SET user_id=? WHERE user_id=?', into, from);
  q.run('DELETE FROM nq_daily_goals WHERE user_id=?', from);
  q.run('UPDATE OR IGNORE nq_daily_activity SET user_id=? WHERE user_id=?', into, from);
  q.run('DELETE FROM nq_daily_activity WHERE user_id=?', from);
  q.run('UPDATE OR IGNORE nq_laps SET user_id=? WHERE user_id=?', into, from);
  q.run('DELETE FROM nq_laps WHERE user_id=?', from);
});
