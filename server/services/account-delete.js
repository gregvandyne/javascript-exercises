// Deleting a child's account (COPPA 312.6, GDPR Art 17; docs/decisions.md "Parent-made child accounts" B8). Today only a
// grown-up deletes, and only an account their family made (routes/family.js, behind madeOn and step-up); the platform
// admin will use the same service later. One transaction does everything that is in the database; the files (Builder
// uploads, screenshots, the profile photo) go right after it commits.
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
//   6. the child's rows on other games: saves, scores, ratings and likes (the games' totals adjusted); plays and the
//      reports they filed are kept without their user id;
//   7. Builder turns keep only what the family and AI-spend totals add up from (id, user, charged to, day, weight,
//      refunded); their request text goes. The per-day counters (builder_usage, ai_usage) hold no content and stay;
//   8. the profile photo; 9. Google sign-in rows, invites and class join requests;
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
import * as photos from './photos.js';
import * as shots from './shots.js';
import { uploadDir } from '../builder/uploads.js';

const DAY = 86400e3;
/** How long a deleted child's old username can't be taken. */
export const RESERVE_DAYS = 90;
/** The tombstone's look: a neutral picture, nothing of the child's. */
const TOMB = { avatar: '🙂', color: '#64748b' };

/** An active member of any school or class (deleting is refused then). */
export const inSchoolOrClass = u => inAnySchool(u) || !!q.get("SELECT 1 FROM class_members WHERE user_id=? AND status='active'", u.id);
/** -> { ok, games: [ids] } (the caller stops any build in those games) | { ok:false, code:'notFound'|'inSchool' } */
export function deleteAccount(childId, actor, { by = 'grownup', parentMade = true } = {}) {
  const u = getUser(childId);
  if (!u || !u.password_hash || /^deleted_/.test(u.username)) return { ok: false, code: 'notFound' };
  if (inSchoolOrClass(u)) return { ok: false, code: 'inSchool' };
  const t = now();
  const gameIds = q.all('SELECT id FROM games WHERE owner_id=?', u.id).map(r => r.id);
  const versionIds = gameIds.length ? q.all(`SELECT id FROM game_versions WHERE game_id IN (${gameIds.map(() => '?').join(',')})`, ...gameIds).map(r => r.id) : [];
  tx(() => {
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
    // 4. chat: reports the child filed go; a message of theirs someone else reported stays, blanked, for that report
    q.run('DELETE FROM chat_reports WHERE reporter_id=?', u.id);
    q.run("UPDATE chat_messages SET body='' WHERE from_id=? AND id IN (SELECT message_id FROM chat_reports)", u.id);
    q.run('DELETE FROM chat_messages WHERE (from_id=? OR to_id=?) AND id NOT IN (SELECT message_id FROM chat_reports)', u.id, u.id);
    // 5. the child's games
    for (const g of gameIds) {
      for (const tbl of ['game_versions', 'builder_chats', 'builder_uploads', 'saves', 'scores', 'plays', 'ratings', 'likes', 'game_classes', 'reports', 'builder_searches']) q.run(`DELETE FROM ${tbl} WHERE game_id=?`, g);
      q.run('DELETE FROM games WHERE id=?', g);
    }
    // 6. the child's rows on other games
    for (const r of q.all('SELECT game_id FROM likes WHERE user_id=?', u.id)) q.run('UPDATE games SET likes=MAX(0, likes-1) WHERE id=?', r.game_id);
    for (const r of q.all('SELECT game_id, stars FROM ratings WHERE user_id=?', u.id)) q.run('UPDATE games SET rating_sum=MAX(0, rating_sum-?), rating_count=MAX(0, rating_count-1) WHERE id=?', r.stars, r.game_id);
    for (const tbl of ['saves', 'scores', 'ratings', 'likes', 'builder_uploads']) q.run(`DELETE FROM ${tbl} WHERE user_id=?`, u.id);
    q.run('UPDATE plays SET user_id=NULL WHERE user_id=?', u.id);
    q.run('UPDATE reports SET user_id=NULL WHERE user_id=?', u.id);
    // 7. Builder turns: totals only
    q.run("UPDATE builder_turns SET request='{}' WHERE user_id=?", u.id);
    // 9. Google and class join requests
    for (const tbl of ['google_identities', 'google_invites', 'join_requests']) q.run(`DELETE FROM ${tbl} WHERE user_id=?`, u.id);
    // 10. the tombstone (8: the photo's file goes after the commit, its flag here)
    q.run(`UPDATE users SET username=?, display_name='deleted', password_hash=NULL, friend_code=NULL, bio='', banned=1, photo_at=0, avatar=?, color=?,
      chat_enabled=0, lang='', theme='', character_spec=NULL, password_short=0, made_note_seen_at=NULL, pw_reset_note_at=NULL WHERE id=?`, `deleted_${u.id}`, TOMB.avatar, TOMB.color, u.id);
    // 11. the old name, reserved
    q.run('INSERT INTO reserved_names(name, until) VALUES (?,?) ON CONFLICT(name) DO UPDATE SET until=excluded.until', u.username, t + RESERVE_DAYS * DAY);
    // 12. the audit (ids only, never the old name)
    audit(actor ? actor.id : null, 'user.delete', u.id, { by: actor ? actor.id : null, kind: by, ...(parentMade ? { parentMade: true } : {}) });
  });
  // The files, after the commit (a failure here leaves a file without a database row, never the other way round).
  photos.removePhoto(u.id, actor ? actor.id : u.id);
  for (const g of gameIds) { try { fs.rmSync(uploadDir(g), { recursive: true, force: true }); } catch { /* already gone */ } }
  for (const v of versionIds) { try { fs.unlinkSync(shots.fileFor(v)); } catch { /* no screenshot */ } }
  return { ok: true, games: gameIds };
}
