// Deleting an account (COPPA 312.6, GDPR Art 17; docs/decisions.md "Parent-made child accounts" B8). A grown-up deletes
// an account their family made (routes/family.js, behind madeOn and step-up); the platform admin deletes a grown-up's or
// teacher's account (adminDeleteAccount at the end, routes/admin.js). One transaction does everything that is in the
// database; the files (Builder uploads, screenshots, the profile photo) go right after it commits.
//
// What happens, in order:
//   1. sessions: every sign-in ends, then the rows go;
//   2. family: every link ends (unlinkAll, reason 'deleted') and the child's link codes go;
//   3. friends: both directions, pending ones too, chat blocks both ways and the chat counters;
//   4. chat: every message to or from the child goes (the other child's thread with them goes too), and the reports the
//      child filed. A message someone else reported keeps its row, with the body blanked, so the report stays for the
//      other child's safety (legal-review item 35);
//   5. the child's games, hard deleted: versions, Builder chats, uploads, saves, scores, plays, ratings, likes, class
//      shares and reports on them;
//   6. the child's rows on other games: saves, scores, ratings and likes (the games' totals adjusted), and their course
//      progress and band (services/courses.js), and the admin's activity rows (sign_ins, user_days); plays and the
//      reports they filed are kept without their user id;
//   7. Builder turns keep only what the family and AI-spend totals add up from (id, user, charged to, day, weight,
//      refunded); their request text goes. The per-day counters (builder_usage, ai_usage) hold no content and stay;
//   8. the profile photo; 9. Google sign-in rows, invites and class join requests, and the teaching loop's settings row;
//   10. the user row becomes a tombstone (like an account merge): deleted_<id>, no password, no friend code, banned.
//       made_by / made_by_family / made_at stay, so the yearly limit and the admin's "accounts this family made" count it;
//   11. the old username is reserved for RESERVE_DAYS (reserved_names), so nobody can sign up as the child;
//   12. one audit entry with ids only.
// Refused while the child is an active member of any school or class: school records belong to the school (FERPA,
// legal-review item 36), and a half-deleted account must not sit in a roster.
import fs from 'node:fs';
import { q, tx, now, audit } from '../db.js';
import { getUser, endSessions } from '../auth.js';
import { unlinkAll } from './family.js';
import { inAnySchool } from './schools.js';
import { stillBilling } from './school-delete.js';
import * as photos from './photos.js';
import * as shots from './shots.js';
import { uploadDir } from '../builder/uploads.js';
import { forgetUser as forgetLive } from './classlive-results.js';
import { storyDir } from './story-jobs.js';
import { forgetUser as forgetClassroom } from './gclassroom.js';
import { forgetUser as forgetDash } from './dash.js';
import { forgetUser as forgetGameSets } from './game-sets.js';
import { forgetUser as forgetManipulatives } from './manipulatives.js';
import { forgetUser as forgetFigures } from './figures.js';
import { forgetUser as forgetCompanion } from './companion.js';
import { forgetUser as forgetStorybooks } from './storybook.js';

const DAY = 86400e3;
/** How long a deleted child's old username can't be taken. */
export const RESERVE_DAYS = 90;
/** The tombstone's look: a neutral picture, nothing of the child's. */
const TOMB = { avatar: '🙂', color: '#64748b' };

/** An active member of any school or class (deleting is refused then). */
export const inSchoolOrClass = u => inAnySchool(u) || !!q.get("SELECT 1 FROM class_members WHERE user_id=? AND status='active'", u.id);
/** -> { ok, games: [ids] } (the caller stops any build in those games) | { ok:false, code:'notFound'|'inSchool' }
 *  leaveSchools (the platform admin deleting a grown-up's or teacher's account, adminDeleteAccount): instead of the
 *  refusal, the same transaction first ends their school and class memberships (marked 'left', their real name blanked),
 *  drops their staff invites, teacher seats and plan asks, revokes their billing grants and removes their own quiz sets. */
export function deleteAccount(childId, actor, { by = 'grownup', parentMade = true, leaveSchools = false } = {}) {
  const u = getUser(childId);
  if (!u || !u.password_hash || /^deleted_/.test(u.username)) return { ok: false, code: 'notFound' };
  if (!leaveSchools && inSchoolOrClass(u)) return { ok: false, code: 'inSchool' };
  const t = now();
  const gameIds = q.all('SELECT id FROM games WHERE owner_id=?', u.id).map(r => r.id);
  const storyIds = q.all('SELECT id FROM stories WHERE owner_id=?', u.id).map(r => r.id);
  const versionIds = gameIds.length ? q.all(`SELECT id FROM game_versions WHERE game_id IN (${gameIds.map(() => '?').join(',')})`, ...gameIds).map(r => r.id) : [];
  tx(() => {
    // 0. (the admin's delete of a grown-up or teacher) their memberships and what they hold as school staff
    if (leaveSchools) {
      q.run("UPDATE school_members SET status='left', left_at=? WHERE user_id=? AND status='active'", t, u.id);
      q.run("UPDATE school_members SET roster_name='' WHERE user_id=?", u.id);
      q.run("UPDATE class_members SET status='left', left_at=? WHERE user_id=? AND status='active'", t, u.id);
      for (const tbl of ['staff_invites', 'teacher_seats']) q.run(`DELETE FROM ${tbl} WHERE user_id=?`, u.id);
      q.run('DELETE FROM school_plan_asks WHERE teacher_id=?', u.id);
      q.run('DELETE FROM live_sets WHERE owner_id=? AND school_id IS NULL', u.id);   // their own quiz sets (a school's stay)
      const fam = q.get('SELECT id FROM families WHERE owner_id=?', u.id);
      q.run("UPDATE billing_grants SET revoked_at=? WHERE revoked_at IS NULL AND ((owner_kind='teacher' AND owner_id=?) OR (owner_kind='family' AND owner_id=?))", t, u.id, fam ? fam.id : '');
    }
    // 0b. staff invites by email they sent, or that were sent to them (to an address of theirs, or accepted by them)
    const addrs = q.all("SELECT LOWER(email) e FROM google_identities WHERE user_id=? AND email<>'' UNION SELECT LOWER(email) e FROM email_prefs WHERE user_id=? AND email<>''", u.id, u.id).map(r => r.e);
    q.run(`DELETE FROM staff_email_invites WHERE invited_by=? OR used_by=?${addrs.length ? ` OR email IN (${addrs.map(() => '?').join(',')})` : ''}`, u.id, u.id, ...addrs);
    // 1. sessions
    endSessions(u.id);
    q.run('DELETE FROM sessions WHERE user_id=?', u.id);
    // 2. family
    unlinkAll(u.id, actor ? actor.id : null, 'deleted');
    q.run('DELETE FROM family_link_codes WHERE child_id=?', u.id);
    // 3. friends
    q.run('DELETE FROM friends WHERE user_id=? OR friend_id=?', u.id, u.id);
    q.run('DELETE FROM chat_blocks WHERE user_id=? OR blocked_id=?', u.id, u.id);
    q.run('DELETE FROM chat_usage WHERE user_id=?', u.id);
    q.run('DELETE FROM stt_usage WHERE user_id=?', u.id);   // speech to text counts (never audio)
    q.run('DELETE FROM stt_live WHERE user_id=?', u.id);    // live speech to text session ids (never audio)
    forgetLive(u.id);                                       // Oomba Live: scores, and anything they hosted
    // 4. chat: reports the child filed go; a message of theirs someone else reported stays, blanked, for that report
    q.run('DELETE FROM chat_reports WHERE reporter_id=?', u.id);
    q.run("UPDATE chat_messages SET body='' WHERE from_id=? AND id IN (SELECT message_id FROM chat_reports)", u.id);
    q.run('DELETE FROM chat_messages WHERE (from_id=? OR to_id=?) AND id NOT IN (SELECT message_id FROM chat_reports)', u.id, u.id);
    // 5. the child's games
    for (const g of gameIds) {
      for (const tbl of ['game_versions', 'builder_chats', 'builder_uploads', 'saves', 'scores', 'plays', 'ratings', 'likes', 'game_classes', 'reports', 'builder_searches', 'game_folder_items']) q.run(`DELETE FROM ${tbl} WHERE game_id=?`, g);
      q.run('DELETE FROM games WHERE id=?', g);
    }
    // 6. the child's rows on other games
    for (const r of q.all('SELECT game_id FROM likes WHERE user_id=?', u.id)) q.run('UPDATE games SET likes=MAX(0, likes-1) WHERE id=?', r.game_id);
    for (const r of q.all('SELECT game_id, stars FROM ratings WHERE user_id=?', u.id)) q.run('UPDATE games SET rating_sum=MAX(0, rating_sum-?), rating_count=MAX(0, rating_count-1) WHERE id=?', r.stars, r.game_id);
    for (const tbl of ['saves', 'scores', 'ratings', 'likes', 'builder_uploads', 'course_progress', 'course_bands', 'course_pending_wins', 'story_reads', 'nq_xp_events', 'nq_daily_goals', 'nq_daily_activity', 'nq_laps', 'nq_placement', 'nq_sort_runs', 'nq_testout', 'user_days', 'sign_ins', 'team_welcomes', 'email_prefs', 'email_log', 'trial_emails', 'trial_nudges']) q.run(`DELETE FROM ${tbl} WHERE user_id=?`, u.id);
    // their game folders (services/game-folders.js): the folders and what they hold; the games themselves are handled above
    q.run('DELETE FROM game_folder_items WHERE folder_id IN (SELECT id FROM game_folders WHERE owner_id=?)', u.id);
    q.run('DELETE FROM game_folders WHERE owner_id=?', u.id);
    q.run('DELETE FROM stories WHERE owner_id=?', u.id);   // Story Builder videos (their files go after the commit)
    q.run('DELETE FROM story_edits WHERE owner_id=?', u.id);   // their story changes (for the daily limits)
    q.run('UPDATE plays SET user_id=NULL WHERE user_id=?', u.id);
    q.run('UPDATE reports SET user_id=NULL WHERE user_id=?', u.id);
    // 7. Builder turns: totals only
    q.run("UPDATE builder_turns SET request='{}' WHERE user_id=?", u.id);
    // 9. Google and class join requests
    for (const tbl of ['google_identities', 'google_invites', 'join_requests']) q.run(`DELETE FROM ${tbl} WHERE user_id=?`, u.id);
    forgetClassroom(u.id);   // Google Classroom: the stored token (revoked at Google best-effort)
    // the teaching loop's row for a teacher (services/teach-loop.js: when they first opened a Check page or hid the card)
    q.run('DELETE FROM settings WHERE key=?', `teach.loop:${u.id}`);
    // 10. the tombstone (8: the photo's file goes after the commit, its flag here)
    q.run(`UPDATE users SET username=?, display_name='deleted', password_hash=NULL, friend_code=NULL, bio='', banned=1, photo_at=0, avatar=?, color=?,
      chat_enabled=0, lang='', theme='', character_spec=NULL, password_short=0, made_note_seen_at=NULL, pw_reset_note_at=NULL WHERE id=?`, `deleted_${u.id}`, TOMB.avatar, TOMB.color, u.id);
    // 11. the old name, reserved
    q.run('INSERT INTO reserved_names(name, until) VALUES (?,?) ON CONFLICT(name) DO UPDATE SET until=excluded.until', u.username, t + RESERVE_DAYS * DAY);
    // 11b. question sets they kept in official games (their links stop opening a set)
    forgetGameSets(u.id);
    // 11c. virtual math manipulatives: their saved boards, their work in sessions, the sessions they ran
    forgetManipulatives(u.id);
    // 11c2. Homeroom: their doodle and working-out pads (one per class desk)
    q.run('DELETE FROM homeroom_doodles WHERE user_id=?', u.id);
    // 11d. Figures: their worksheets (question sets), presets and "Power with AI" switch
    forgetFigures(u.id);
    // 11e. Oomba, the teaching companion: their conversation, its attached texts and pictures (services/companion.js)
    forgetCompanion(u.id);
    // 11f. the book maker: their books, the pictures in them, shares, readers' places and chats; their own reading places
    forgetStorybooks(u.id);
    // 12. the audit (ids only, never the old name)
    audit(actor ? actor.id : null, 'user.delete', u.id, { by: actor ? actor.id : null, kind: by, ...(parentMade ? { parentMade: true } : {}) });
  });
  // The files, after the commit (a failure here leaves a file without a database row, never the other way round).
  photos.removePhoto(u.id, actor ? actor.id : u.id);
  forgetDash(u.id);   // classroom dashboards: their own screens and background pictures
  for (const g of gameIds) { try { fs.rmSync(uploadDir(g), { recursive: true, force: true }); } catch { /* already gone */ } }
  for (const v of versionIds) { try { fs.unlinkSync(shots.fileFor(v)); } catch { /* no screenshot */ } }
  for (const id of storyIds) { try { fs.rmSync(storyDir(id), { recursive: true, force: true }); } catch { /* already gone */ } }
  return { ok: true, games: gameIds };
}

// ---------------------------------------------------------------- the platform admin deletes a grown-up or teacher
// (routes/schools.js /admin/users/:id/delete). Their school and class memberships end first (deleteAccount
// leaveSchools); schools they made are NOT deleted: the confirm page lists them, to delete one by one
// (services/school-delete.js). Refused for a platform admin, for the admin themselves, for children (a family deletes
// a made child; a school account leaves with its school), and while a Stripe subscription of theirs (the Teacher plan,
// or their family's plan) will still charge.
/** A grown-up's or teacher's account: a family account, school staff (now or before), or signed up as a teacher. */
export const isAdultAccount = u => !!u && !u.is_guest && (u.account_type === 'grownup' || u.signup_as === 'teacher'
  || !!q.get("SELECT 1 FROM school_members WHERE user_id=? AND role!='student'", u.id));
/** Why the admin may not delete this account, or null. -> null | 'notFound'|'self'|'platformAdmin'|'notAdult'|'billing' */
export function adminDeleteRefusal(actor, u) {
  if (!u || !u.password_hash || /^deleted_/.test(u.username)) return 'notFound';
  if (actor && actor.id === u.id) return 'self';
  if (u.role === 'admin') return 'platformAdmin';
  if (!isAdultAccount(u)) return 'notAdult';
  if (billingOf(u).length) return 'billing';
  return null;
}
/** Their subscriptions that will still charge: the Teacher plan (owner 'teacher') and their family's plan. */
function billingOf(u) {
  const fam = q.get('SELECT id FROM families WHERE owner_id=?', u.id);
  return [...stillBilling('teacher', u.id), ...(fam ? stillBilling('family', fam.id) : [])];
}
/** What the delete does, for the confirm page. -> null | { user, refusal, schools, createdSchools, classes, children, billing } */
export function adminDeletePlan(actor, userId) {
  const u = getUser(userId); if (!u) return null;
  const fam = q.get('SELECT id FROM families WHERE owner_id=?', u.id);
  return {
    user: u,
    refusal: adminDeleteRefusal(actor, u),
    schools: q.all(`SELECT s.id, s.name, s.slug, m.role FROM school_members m JOIN schools s ON s.id=m.school_id WHERE m.user_id=? AND m.status='active' ORDER BY s.name COLLATE NOCASE`, u.id),
    createdSchools: q.all('SELECT id, name, slug, archived_at FROM schools WHERE created_by=? ORDER BY name COLLATE NOCASE', u.id),
    classes: q.get("SELECT COUNT(*) n FROM class_members WHERE user_id=? AND status='active'", u.id).n,
    games: q.get("SELECT COUNT(*) n FROM games WHERE owner_id=?", u.id).n,
    children: fam ? q.get('SELECT COUNT(*) n FROM family_children WHERE family_id=? AND unlinked_at IS NULL', fam.id).n : 0,
    billing: billingOf(u),
  };
}
/** The platform admin deletes a grown-up's or teacher's account. -> deleteAccount's result | { ok:false, code } */
export function adminDeleteAccount(actor, userId) {
  const u = getUser(userId);
  const no = adminDeleteRefusal(actor, u);
  if (no) return { ok: false, code: no };
  return deleteAccount(u.id, actor, { by: 'admin', parentMade: false, leaveSchools: true });
}
