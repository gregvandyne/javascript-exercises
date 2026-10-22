// Friends: added only by a 6-character friend code (never by searching names, for kids' safety).
// Storage: one 'pending' row (requester -> target) while waiting; two 'accepted' rows (both directions) once friends.
import { q, now, tx, audit } from '../db.js';

const USER_COLS = 'u.id, u.username, u.display_name, u.avatar, u.color, u.is_guest, u.chat_enabled';

/** Friend codes are case-insensitive and people type spaces or dashes; keep letters and digits only. */
export const normCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const fail = error => ({ ok: false, error });

export function addByCode(user, code) {
  if (!user || user.is_guest) return fail('Make a free account to add friends.');
  const c = normCode(code);
  if (!c) return fail("Type your friend's code first.");
  if (c.length !== 6) return fail('A friend code has 6 letters and numbers. Check it and try again.');
  const t = q.get('SELECT * FROM users WHERE friend_code=?', c);
  if (!t || t.banned) return fail("We couldn't find that code. Check each letter and try again.");
  if (t.id === user.id) return fail("That's your own code! Give it to a friend so they can add you.");
  if (t.is_guest) return fail('That player is a guest. They need a free account before you can be friends.');
  const name = t.display_name;
  const mine = q.get('SELECT status FROM friends WHERE user_id=? AND friend_id=?', user.id, t.id);
  const theirs = q.get('SELECT status FROM friends WHERE user_id=? AND friend_id=?', t.id, user.id);
  if (mine && mine.status === 'accepted') return { ok: true, state: 'already', message: `You and ${name} are already friends.`, friend: t };
  if (theirs && theirs.status === 'pending') { accept(user, t.id); return { ok: true, state: 'accepted', message: `You and ${name} are now friends! 🎉`, friend: t }; }
  if (mine) return { ok: true, state: 'pending', message: `You already asked ${name}. Wait for them to say yes.`, friend: t };
  q.run("INSERT INTO friends(user_id, friend_id, status, created_at) VALUES (?,?,'pending',?)", user.id, t.id, now());
  audit(user.id, 'friend.request', t.id);
  return { ok: true, state: 'sent', message: `Friend request sent to ${name}! They need to say yes.`, friend: t };
}

/** Accept a pending request from `fromId` to `user`. */
export function accept(user, fromId) {
  const r = q.get("SELECT 1 FROM friends WHERE user_id=? AND friend_id=? AND status='pending'", fromId, user.id);
  if (!r) return false;
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
export const incoming = userId => q.all(`SELECT ${USER_COLS}, f.created_at FROM friends f JOIN users u ON u.id=f.user_id WHERE f.friend_id=? AND f.status='pending' AND u.banned=0 ORDER BY f.created_at DESC`, userId);
/** Requests I sent that are still waiting. */
export const outgoing = userId => q.all(`SELECT ${USER_COLS}, f.created_at FROM friends f JOIN users u ON u.id=f.friend_id WHERE f.user_id=? AND f.status='pending' AND u.banned=0 ORDER BY f.created_at DESC`, userId);
/** Accepted friends (banned accounts are left out). */
export const list = userId => q.all(`SELECT ${USER_COLS}, f.created_at FROM friends f JOIN users u ON u.id=f.friend_id WHERE f.user_id=? AND f.status='accepted' AND u.banned=0 ORDER BY u.display_name COLLATE NOCASE`, userId);
export const count = userId => q.get("SELECT COUNT(*) n FROM friends f JOIN users u ON u.id=f.friend_id WHERE f.user_id=? AND f.status='accepted' AND u.banned=0", userId).n;
export const status = (a, b) => {
  const r = q.get('SELECT status FROM friends WHERE user_id=? AND friend_id=?', a, b);
  if (r) return r.status === 'accepted' ? 'friends' : 'sent';
  return q.get("SELECT 1 FROM friends WHERE user_id=? AND friend_id=? AND status='pending'", b, a) ? 'received' : 'none';
};
