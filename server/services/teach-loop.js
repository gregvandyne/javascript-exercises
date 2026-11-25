// The teaching loop: Plan → Play → Check → Feedback (docs/decisions.md "The teaching loop").
//
// Each step ticks itself off from what the teacher has really done, read from the tables those tools already write:
//   plan     a lesson in their library (lessons.owner_id), or a game they made in the Builder (games.owner_id)
//   play     a lesson they assigned to a class (class_lessons.assigned_by, not removed) or a live game they hosted
//            (live_runs.host_id)
//   check    they opened a class's gradebook, its CSV, a lesson's progress or the Standards tab (noted by markCheck)
//   feedback an answer they marked reviewed, with or without written feedback (step_progress.reviewed_by)
// The only thing kept for this feature is one row in the settings table per teacher who has opened a Check page or hidden
// the card: key "teach.loop:<user id>", value JSON { check: ms, hidden: ms }. No new table, no migration.
import { q, setting, now } from '../db.js';
import { config } from '../config.js';
import * as S from './schools.js';
import * as L from './lessons.js';
import { liveOn } from './classlive-sessions.js';
import { canHost as liveCanHost } from './classlive-access.js';

export const STEPS = ['plan', 'play', 'check', 'feedback'];
const key = id => `teach.loop:${id}`;

function stored(userId) {
  try { const v = JSON.parse(setting(key(userId)) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
function save(userId, patch) {
  const v = { ...stored(userId), ...patch };
  for (const k of Object.keys(v)) if (v[k] == null) delete v[k];
  setting(key(userId), JSON.stringify(v));
  return v;
}

/** What this teacher has done: { plan, play, check, feedback } (booleans), how many, all four, and whether they hid the card. */
export function loopState(u) {
  if (!u) return null;
  const has = (sql, ...p) => !!q.get(sql, ...p);
  const kept = stored(u.id);
  const done = {
    plan: has('SELECT 1 FROM lessons WHERE owner_id=? LIMIT 1', u.id) || has("SELECT 1 FROM games WHERE owner_id=? AND status!='deleted' LIMIT 1", u.id) || has('SELECT 1 FROM game_folders WHERE owner_id=? LIMIT 1', u.id),
    play: has('SELECT 1 FROM class_lessons WHERE assigned_by=? AND removed_at IS NULL LIMIT 1', u.id) || has('SELECT 1 FROM live_runs WHERE host_id=? LIMIT 1', u.id),
    check: !!kept.check,
    feedback: has('SELECT 1 FROM step_progress WHERE reviewed_by=? LIMIT 1', u.id),
  };
  const count = STEPS.filter(s => done[s]).length;
  return { done, count, all: count === STEPS.length, hidden: !!kept.hidden };
}

/** The Check step: called by the gradebook, its CSV, a lesson's progress and the Standards tab, after their own class check.
 *  Writes once (the first time); later visits only read. */
export function markCheck(u) {
  if (!u || !S.isSchoolStaff(u)) return;
  if (!stored(u.id).check) save(u.id, { check: now() });
}

/** Hide the card on the Classroom home (hide = true), or bring it back (false). */
export function setHidden(u, hide) { save(u.id, { hidden: hide ? now() : null }); }

/** Show the compact card on /teach? Until every step is done once, and not after the teacher hid it. */
export const showCard = st => config.teachLoopCard && !!st && !st.all && !st.hidden;

/** Links to the real tools for this teacher, for their first class (the class tools are null when they have none yet). Every link opens a
 *  page that checks the teacher's own access again; nothing here grants anything. */
export function loopLinks(u) {
  const mine = S.classesOf(u.id, 'teacher');
  const c = mine[0] || null;
  // The most recent lesson assigned to the class: "Needs attention first" and its answers live on that lesson's page.
  const latest = c ? L.classLessons(c.id).filter(cl => !cl.removed_at).sort((a, z) => (z.assigned_at || 0) - (a.assigned_at || 0))[0] : null;
  const host = liveOn() && liveCanHost(u);
  // No class yet: the class tools have nowhere to go, so they are left out (the view lists them as plain words) and one
  // "Make your first class" button goes to the form on the Classroom home. Where only the school admin makes classes,
  // there is no button (the form would refuse them): one calm line says the admin makes it instead.
  const canMake = !c && S.classSchoolsFor(u).length > 0;
  return {
    class: c ? { id: c.id, name: c.name } : null,
    makeClass: canMake ? '/teach?new=class' : null,
    askAdmin: !c && !canMake,
    // Games, not lessons: the library is Build (folders of games), drafting and building are the Builder, and Assign is
    // the class page (its assigned games, New game, Assign a game).
    library: '/build',
    draftAi: '/build/new',
    builder: '/build/new',
    assign: c ? `/class/${encodeURIComponent(c.id)}#lessons` : null,
    live: host ? (c ? `/live?class=${encodeURIComponent(c.id)}` : '/live') : null,
    gradebook: c ? `/class/${c.id}/progress` : null,
    csv: c ? `/class/${c.id}/progress.csv` : null,
    attention: c ? (latest ? `/class/${c.id}/progress/${latest.id}#needs-attention` : `/class/${c.id}/progress`) : null,
    standards: c ? `/class/${c.id}/standards` : null,
    review: c ? `/class/${c.id}/progress#to-review` : null,
    written: c ? (latest ? `/class/${c.id}/progress/${latest.id}#answers` : `/class/${c.id}/progress`) : null,
  };
}
