// Friends: added only by a 6-character friend code (never by searching names, for kids' safety).
// Grown-up accounts use the same codes and rows for "connections", with OTHER grown-ups only: a friendship (or a request)
// always joins two kids or two grown-ups, never one of each (samePair). A kid typing a grown-up's code, or a grown-up
// typing a kid's, gets the same "not found" as a code nobody has, so neither learns the other exists.
// Staff (services/schools.js noFriendsAccount: the platform admin, and anyone who is or was a teacher or school admin)
// have no friend code, no friends and no requests, with anyone: a teacher's account is an ordinary kid-type account, so
// without this rule a teacher could type a child's code (the audit's bug 0). Staff typing any code are told friends are
// not for staff accounts; a staff account's old code finds nobody. The rule is checked here, so every route gets it.
// Storage: one 'pending' row (requester -> target) while waiting; two 'accepted' rows (both directions) once friends.
import { q, now, tx, audit } from '../db.js';
import { tEn } from '../i18n/index.js';
import { classmates, noFriendsAccount, endFriendships } from './schools.js';
import { isGrownup, getUser, friendCode } from '../auth.js';

/** May these two accounts be friends (or connections)? Both kids, or both grown-ups: never an adult and a child, and
 *  never a staff account on either side. */
export const samePair = (a, b) => !!a && !!b && isGrownup(a) === isGrownup(b) && !noFriendsAccount(a) && !noFriendsAccount(b);
/** Is this account closed to friends (staff)? If it still holds friend rows or a code (it became staff by a path that
 *  didn't clear them: the seed makes the platform admin), they are ended now. */
export function closedToFriends(u) {
  if (!noFriendsAccount(u)) return false;
  if (u.friend_code || q.get('SELECT 1 FROM friends WHERE user_id=? OR friend_id=? LIMIT 1', u.id, u.id)) endFriendships(u.id);
  return true;
}
/** The account's own friend code: null for staff and guests. An account that stopped being staff (a child added as a
 *  teacher by mistake and put back) gets a fresh code here; its old one is never given back. */
export function codeOf(u) {
  if (!u || u.is_guest || closedToFriends(u)) return null;
  if (u.friend_code) return u.friend_code;
  const c = friendCode();
  q.run('UPDATE users SET friend_code=? WHERE id=? AND friend_code IS NULL', c, u.id);
  return q.get('SELECT friend_code c FROM users WHERE id=?', u.id).c;
}

const USER_COLS = 'u.id, u.username, u.display_name, u.avatar, u.color, u.photo_at, u.is_guest, u.chat_enabled';
/** SQL: the joined account u is not staff (noFriendsAccount, said in SQL). The lists below leave staff out, so a row
 *  that should not exist (an account made the platform admin straight in the database) never shows a child a staff
 *  account as a friend or a request, even before anything has cleaned the row up. */
const NOT_STAFF = "u.role!='admin' AND NOT EXISTS (SELECT 1 FROM school_members sm WHERE sm.user_id=u.id AND sm.role!='student')";

/** Friend codes are case-insensitive and people type spaces or dashes; keep letters and digits only. */
export const normCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const fail = error => ({ ok: false, error });

/** Messages come back in the language of tr (req.t); English by default. */
export function addByCode(user, code, tr = tEn) {
  if (!user || user.is_guest) return fail(tr('friends.api.needAccount'));
  if (closedToFriends(user)) return fail(tr('friends.staff.text'));
  const c = normCode(code);
  if (!c) return fail(tr('friends.api.typeCode'));
  if (c.length !== 6) return fail(tr('friends.api.codeLength'));
  const t = q.get('SELECT * FROM users WHERE friend_code=?', c);
  if (t) closedToFriends(t);   // a staff account still holding a code loses it here, and is "not found" below
  // A grown-up's code finds grown-ups only, and a kid's finds kids only: the other kind is "not found", word for word.
  // So is a staff account (samePair): its code was taken away, and this holds even if one were still stored.
  if (!t || t.banned || !samePair(user, t)) return fail(tr('friends.api.codeNotFound'));
  if (t.id === user.id) return fail(tr('friends.api.ownCode'));
  if (t.is_guest) return fail(tr('friends.api.guest'));
  // School accounts make friends with classmates only (the school's safe default).
  if ((user.managed_school || t.managed_school) && !classmates(user.id, t.id)) return fail(tr('friends.api.classmatesOnly'));
  const name = t.display_name;
  const mine = q.get('SELECT status FROM friends WHERE user_id=? AND friend_id=?', user.id, t.id);
  const theirs = q.get('SELECT status FROM friends WHERE user_id=? AND friend_id=?', t.id, user.id);
  if (mine && mine.status === 'accepted') return { ok: true, state: 'already', message: tr('friends.api.already', { name }), friend: t };
  if (theirs && theirs.status === 'pending') { accept(user, t.id); return { ok: true, state: 'accepted', message: tr('friends.api.accepted', { name }), friend: t }; }
  if (mine) return { ok: true, state: 'pending', message: tr('friends.api.alreadyAsked', { name }), friend: t };
  q.run("INSERT INTO friends(user_id, friend_id, status, created_at) VALUES (?,?,'pending',?)", user.id, t.id, now());
  audit(user.id, 'friend.request', t.id);
  return { ok: true, state: 'sent', message: tr('friends.api.sent', { name }), friend: t };
}

/** Accept a pending request from `fromId` to `user`. */
export function accept(user, fromId) {
  if (closedToFriends(user)) return false;
  const r = q.get("SELECT 1 FROM friends WHERE user_id=? AND friend_id=? AND status='pending'", fromId, user.id);
  if (!r) return false;
  // Defence in depth: a mixed request (a row that should never exist) is refused and dropped, never accepted.
  if (!samePair(user, getUser(fromId))) { q.run("DELETE FROM friends WHERE user_id=? AND friend_id=? AND status='pending'", fromId, user.id); return false; }
  tx(() => {
    const t = now();
    q.run('DELETE FROM friends WHERE (user_id=? AND friend_id=?) OR (user_id=? AND friend_id=?)', fromId, user.id, user.id, fromId);
    q.run("INSERT INTO friends(user_id, friend_id, status, created_at) VALUES (?,?,'accepted',?)", fromId, user.id, t);
    q.run("INSERT INTO friends(user_id, friend_id, status, created_at) VALUES (?,?,'accepted',?)", user.id, fromId, t);
  });
  audit(user.id, 'friend.accept', fromId);
  return true;
}
/** Decline a request someone sent me. */
export function decline(user, fromId) {
  return q.run("DELETE FROM friends WHERE user_id=? AND friend_id=? AND status='pending'", fromId, user.id).changes > 0;
}
/** Cancel a request I sent. */
export function cancel(user, toId) {
  return q.run("DELETE FROM friends WHERE user_id=? AND friend_id=? AND status='pending'", user.id, toId).changes > 0;
}
/** Unfriend: removes both rows. */
export function unfriend(user, otherId) {
  const n = q.run('DELETE FROM friends WHERE (user_id=? AND friend_id=?) OR (user_id=? AND friend_id=?)', user.id, otherId, otherId, user.id).changes;
  if (n) audit(user.id, 'friend.remove', otherId);
  return n > 0;
}

/** Requests waiting for me to say yes. */
export const incoming = userId => q.all(`SELECT ${USER_COLS}, f.created_at FROM friends f JOIN users u ON u.id=f.user_id WHERE f.friend_id=? AND f.status='pending' AND u.banned=0 AND ${NOT_STAFF} ORDER BY f.created_at DESC`, userId);
/** How many of those there are (the Friends tab's badge). */
export const incomingCount = userId => q.get(`SELECT COUNT(*) n FROM friends f JOIN users u ON u.id=f.user_id WHERE f.friend_id=? AND f.status='pending' AND u.banned=0 AND ${NOT_STAFF}`, userId).n;
/** Requests I sent that are still waiting. */
export const outgoing = userId => q.all(`SELECT ${USER_COLS}, f.created_at FROM friends f JOIN users u ON u.id=f.friend_id WHERE f.user_id=? AND f.status='pending' AND u.banned=0 AND ${NOT_STAFF} ORDER BY f.created_at DESC`, userId);
/** Accepted friends (banned accounts are left out). */
export const list = userId => q.all(`SELECT ${USER_COLS}, f.created_at FROM friends f JOIN users u ON u.id=f.friend_id WHERE f.user_id=? AND f.status='accepted' AND u.banned=0 AND ${NOT_STAFF} ORDER BY u.display_name COLLATE NOCASE`, userId);
export const count = userId => q.get(`SELECT COUNT(*) n FROM friends f JOIN users u ON u.id=f.friend_id WHERE f.user_id=? AND f.status='accepted' AND u.banned=0 AND ${NOT_STAFF}`, userId).n;
export const status = (a, b) => {
  const r = q.get('SELECT status FROM friends WHERE user_id=? AND friend_id=?', a, b);
  if (r) return r.status === 'accepted' ? 'friends' : 'sent';
  return q.get("SELECT 1 FROM friends WHERE user_id=? AND friend_id=? AND status='pending'", b, a) ? 'received' : 'none';
};
