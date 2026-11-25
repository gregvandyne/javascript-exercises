// Deleting a whole school (the platform admin only: routes/schools.js /admin/schools/:id/delete). For test schools and
// schools made by mistake: a school that holds a Google domain it should not (schools.settings googleDomains) blocks the
// real school from saving it (services/google.js domainTakenBy), and archiving is not always what is wanted.
//
// One transaction removes the school and everything tied to it:
//   - its classes, with their rosters (class_members), join requests, units, assigned lessons (class_lessons), the
//     students' progress and rubric scores on them, games shared with them (game_classes), Oomba Live teams, support
//     and runs, every classroom-dashboard row (and, after the commit, the dashboard pictures' files) and the Google
//     Classroom link rows (gc_*), the Homeroom seating, groups, teacher's area and live state (homeroom_rooms), the students' desk pads (homeroom_doodles), their sign-in settings and picture passwords (homeroom_signins), raised hands, hall passes and desk locks (homeroom_live), the Homeroom handouts' order and grading (homeroom_handouts) and the teacher's comments and stickers on them (homeroom_feedback), the students' reading routines on Reading handouts (homeroom_reading), the class's aides, sub links and their log (homeroom_aides, homeroom_sub_links, homeroom_sub_log), the students' notebook tabs and pages for the class (notebook_tabs, notebook_pages; their own tabs stay with them), and the shares of
//     teachers' own books with them (made_book_classes; the books stay);
//   - the school's lessons, folders, standards tags and rubrics; quiz sets made at the school stay with their owner,
//     no longer shared (live_sets.school_id NULL);
//   - its memberships (school_members), staff invites, Google invites, announcements to it, billing requests, plan
//     asks, teacher seats, and its billing grants and checkout sessions;
//   - accounts the school made (users.managed_school) are switched off as when they leave the school: banned, signed
//     out, their Google sign-in and family links gone. The rows stay (like any account, the admin deletes it apart).
// Kept: people's own accounts (only their membership goes), Stripe's record of ended subscriptions and their customer
// ids and events (billing_subscriptions, billing_customers, billing_events: ids and money only), the one-trial-ever
// rows (teacher_trials), "Set up my school" requests (their school_id is cleared) and the audit log.
// Refused while the school has a Stripe subscription that will still charge (cancel it first), so nobody is billed for
// a school that no longer exists.
import fs from 'node:fs';
import { q, tx, audit } from '../db.js';
import { getSchool, settingsOf, classDeleted } from './schools.js';
import { unlinkAll } from './family.js';
import { currentLivemode } from './stripe.js';
import { picFile, pdfFile } from './dash.js';

const marks = ids => ids.map(() => '?').join(',');
/** DELETE FROM table WHERE col IN (ids); nothing to do for no ids. -> rows removed */
const delIn = (table, col, ids) => (ids.length ? q.run(`DELETE FROM ${table} WHERE ${col} IN (${marks(ids)})`, ...ids).changes : 0);
const countIn = (table, col, ids) => (ids.length ? q.get(`SELECT COUNT(*) n FROM ${table} WHERE ${col} IN (${marks(ids)})`, ...ids).n : 0);

// Every table with a school_id, class_id or class_lesson_id column is in exactly one of these lists
// (tests/unit/admin-delete.test.js checks it against the schema, so a new table can't be forgotten).
/** Rows removed by the school's id. */
export const BY_SCHOOL = ['school_members', 'staff_invites', 'staff_email_invites', 'google_invites', 'gc_pending', 'lesson_folders', 'lessons', 'rubrics',
  'announcements', 'billing_requests', 'school_plan_asks', 'teacher_seats'];
/** Rows removed by its classes' ids. */
export const BY_CLASS = ['class_members', 'join_requests', 'class_units', 'game_classes', 'gc_posts', 'gc_links', 'gc_syncs', 'gc_roster',
  'live_class_teams', 'live_class_team_cfg', 'live_support', 'dash_layouts', 'dash_class', 'dash_students', 'dash_links', 'dash_pushes',
  'dash_help', 'dash_checks', 'dash_passes', 'dash_points', 'dash_point_awards', 'dash_class_points', 'dash_moods', 'dash_pictures', 'dash_builds', 'dash_feeds', 'live_runs', 'manip_sessions', 'homeroom_rooms', 'homeroom_doodles', 'homeroom_signins', 'homeroom_live', 'homeroom_handouts', 'homeroom_feedback', 'homeroom_reading', 'homeroom_aides', 'homeroom_sub_log', 'homeroom_sub_links', 'notebook_pages', 'notebook_tabs', 'made_book_classes', 'typing_goals', 'class_lessons'];
/** Rows removed by its classes' assigned lessons. */
export const BY_CLASS_LESSON = ['step_progress', 'class_lesson_students', 'rubric_scores', 'gc_grades', 'lessons_retired', 'proof_insights'];
/** Rows kept, with why (handled apart or history). */
export const KEPT = {
  schools: 'the school row itself, deleted last',
  classrooms: 'the classes, deleted by school_id after their rows',
  live_sets: 'the owner keeps their quiz set; school_id is cleared and it is no longer shared',
  school_requests: 'the request stays as a record; its school_id is cleared',
  teacher_trials: 'one free trial ever per school/teacher/email (no school data)',
  game_folders: 'the owner keeps their folder of games; school_id is cleared and it is no longer shared',
};

/** Stripe subscriptions of an owner that will still charge: live mode always, test mode when the site runs on a test
 *  key; not ended (canceled, incomplete_expired), not orphaned, not already set to end at the period's end. */
export function stillBilling(kind, id) {
  return q.all(`SELECT stripe_subscription_id, plan, status, livemode, current_period_end FROM billing_subscriptions
    WHERE owner_kind=? AND owner_id=? AND (livemode=1 OR livemode=?) AND orphaned_at IS NULL AND cancel_at_period_end=0
      AND status NOT IN ('canceled', 'incomplete_expired')`, kind, String(id), currentLivemode());
}

function idsOf(schoolId) {
  const classIds = q.all('SELECT id FROM classrooms WHERE school_id=?', schoolId).map(r => r.id);
  const classLessonIds = classIds.length ? q.all(`SELECT id FROM class_lessons WHERE class_id IN (${marks(classIds)})`, ...classIds).map(r => r.id) : [];
  const lessonIds = q.all('SELECT id FROM lessons WHERE school_id=?', schoolId).map(r => r.id);
  const pictureIds = classIds.length ? q.all(`SELECT id FROM dash_pictures WHERE class_id IN (${marks(classIds)})`, ...classIds).map(r => r.id) : [];
  const schoolAccounts = q.all('SELECT id FROM users WHERE managed_school=?', schoolId).map(r => r.id);
  return { classIds, classLessonIds, lessonIds, pictureIds, schoolAccounts };
}

/** What deleting the school would remove (for the confirm page). -> null | { school, domains, classes, counts, billing } */
export function schoolDeletePlan(schoolId) {
  const school = getSchool(schoolId); if (!school) return null;
  const ids = idsOf(school.id), s = school.id;
  const n = (sql, ...a) => q.get(sql, ...a).n;
  const domains = settingsOf(school).googleDomains;
  return {
    school,
    domains: Array.isArray(domains) ? domains : [],
    classes: q.all('SELECT id, name, archived_at FROM classrooms WHERE school_id=? ORDER BY name COLLATE NOCASE', s),
    counts: {
      staff: n("SELECT COUNT(*) n FROM school_members WHERE school_id=? AND role!='student' AND status='active'", s),
      students: n("SELECT COUNT(*) n FROM school_members WHERE school_id=? AND role='student' AND status='active'", s),
      memberRows: n('SELECT COUNT(*) n FROM school_members WHERE school_id=?', s),
      schoolAccounts: ids.schoolAccounts.length,
      classes: ids.classIds.length,
      classMembers: countIn('class_members', 'class_id', ids.classIds),
      joinRequests: countIn('join_requests', 'class_id', ids.classIds),
      assignments: ids.classLessonIds.length,
      progress: countIn('step_progress', 'class_lesson_id', ids.classLessonIds) + countIn('rubric_scores', 'class_lesson_id', ids.classLessonIds),
      lessons: ids.lessonIds.length,
      rubrics: n('SELECT COUNT(*) n FROM rubrics WHERE school_id=?', s),
      gameShares: countIn('game_classes', 'class_id', ids.classIds),
      invites: n('SELECT COUNT(*) n FROM google_invites WHERE school_id=?', s) + n('SELECT COUNT(*) n FROM staff_invites WHERE school_id=?', s)
        + n('SELECT COUNT(*) n FROM staff_email_invites WHERE school_id=?', s),
      dashboards: countIn('dash_layouts', 'class_id', ids.classIds) + countIn('dash_class', 'class_id', ids.classIds),
      liveRuns: countIn('live_runs', 'class_id', ids.classIds),
      googleClassroom: countIn('gc_links', 'class_id', ids.classIds),
      billingRows: n('SELECT COUNT(*) n FROM billing_requests WHERE school_id=?', s) + n('SELECT COUNT(*) n FROM teacher_seats WHERE school_id=?', s)
        + n("SELECT COUNT(*) n FROM billing_grants WHERE owner_kind='school' AND owner_id=?", s) + n('SELECT COUNT(*) n FROM school_plan_asks WHERE school_id=?', s),
    },
    billing: stillBilling('school', s),
  };
}

/** Delete the school and everything tied to it (see the top of this file). by: the platform admin.
 *  -> { ok:true, counts } | { ok:false, code:'notFound'|'billing', subscriptions? } */
export function deleteSchool(by, schoolId) {
  const school = getSchool(schoolId); if (!school) return { ok: false, code: 'notFound' };
  const subs = stillBilling('school', school.id);
  if (subs.length) return { ok: false, code: 'billing', subscriptions: subs.map(r => r.stripe_subscription_id) };
  const s = school.id;
  const { classIds, classLessonIds, lessonIds, pictureIds, schoolAccounts } = idsOf(s);
  const counts = {};
  tx(() => {
    // Rows hanging off the classes' assigned lessons, dashboards and live runs first (they are found through them).
    for (const tbl of BY_CLASS_LESSON) counts[tbl] = delIn(tbl, 'class_lesson_id', classLessonIds);
    const pushIds = classIds.length ? q.all(`SELECT id FROM dash_pushes WHERE class_id IN (${marks(classIds)})`, ...classIds).map(r => r.id) : [];
    const checkIds = classIds.length ? q.all(`SELECT id FROM dash_checks WHERE class_id IN (${marks(classIds)})`, ...classIds).map(r => r.id) : [];
    const runIds = classIds.length ? q.all(`SELECT id FROM live_runs WHERE class_id IN (${marks(classIds)})`, ...classIds).map(r => r.id) : [];
    delIn('dash_push_hidden', 'push_id', pushIds); delIn('dash_answers', 'check_id', checkIds);
    delIn('live_run_scores', 'run_id', runIds); delIn('live_run_log', 'run_id', runIds);
    for (const tbl of BY_CLASS) counts[tbl] = delIn(tbl, 'class_id', classIds);
    // The school's lessons: their steps and standards tags; a quiz set made from one keeps its items.
    delIn('lesson_steps', 'lesson_id', lessonIds); delIn('lesson_standards', 'lesson_id', lessonIds);
    if (lessonIds.length) q.run(`UPDATE live_sets SET lesson_id=NULL WHERE lesson_id IN (${marks(lessonIds)})`, ...lessonIds);
    q.run('UPDATE live_sets SET school_id=NULL, shared=0 WHERE school_id=?', s);
    q.run('UPDATE game_folders SET school_id=NULL, shared_at=NULL WHERE school_id=?', s);   // a teacher's folder stays theirs, unshared
    // Accounts the school made: switched off, as when they leave the school (schools.js removeMember).
    for (const id of schoolAccounts) {
      q.run('UPDATE users SET banned=1 WHERE id=?', id); q.run('DELETE FROM sessions WHERE user_id=?', id);
      unlinkAll(id, by.id, 'school_delete');
      q.run('DELETE FROM google_identities WHERE user_id=?', id);
    }
    for (const tbl of BY_SCHOOL) counts[tbl] = q.run(`DELETE FROM ${tbl} WHERE school_id=?`, s).changes;
    q.run("DELETE FROM billing_grants WHERE owner_kind='school' AND owner_id=?", s);
    q.run("DELETE FROM billing_checkouts WHERE owner_kind='school' AND owner_id=?", s);
    q.run('UPDATE school_requests SET school_id=NULL WHERE school_id=?', s);
    for (const c of classIds) classDeleted(c);   // other modules' per-class rows (schools.js onClassLeave)
    q.run('DELETE FROM classrooms WHERE school_id=?', s);
    q.run('DELETE FROM schools WHERE id=?', s);
    // Ids and counts only: never the school's name, its domains or anyone's name.
    audit(by.id, 'school.delete', s, { classes: classIds.length, members: counts.school_members, schoolAccounts: schoolAccounts.length });
  });
  // A dash_pictures row is a picture (<id>.jpg) or a Class Board PDF (<id>.pdf): both files go.
  for (const id of pictureIds) for (const f of [picFile(id), pdfFile(id)]) { try { fs.unlinkSync(f); } catch { /* already gone, or not this kind */ } }
  return { ok: true, counts };
}
