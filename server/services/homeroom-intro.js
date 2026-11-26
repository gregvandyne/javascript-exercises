// Homeroom: what a person has been shown once (docs/decisions.md "Homeroom: onboarding, Needs a look, Oomba follow-ups";
// homeroom_seen, migration 0140): 'tour', a teacher's first-run guide to Homeroom (public/js/homeroom-tour.js), and
// 'desk', a student's intro card the first time they open their desk (public/js/homeroom-intro.js). Kept on the server so
// another device, a shared Chromebook or a cleared browser does not show it again. The ⋯ menu's Show me around opens the
// guide again at any time (it changes nothing here until it is closed).
import { q, now } from '../db.js';

export const WHATS = Object.freeze(['tour', 'desk']);
/** Has this person been shown it? */
export const seen = (u, what) => !!(u && WHATS.includes(what) && q.get('SELECT 1 FROM homeroom_seen WHERE user_id=? AND what=?', u.id, what));
/** Shown (done: true) or to show again (done: false). -> { ok, seen } */
export function setSeen(u, what, done = true) {
  if (!u || !WHATS.includes(what)) return { ok: false, code: 'badAction' };
  if (done) q.run('INSERT INTO homeroom_seen(user_id, what, at) VALUES (?,?,?) ON CONFLICT(user_id, what) DO UPDATE SET at=excluded.at', u.id, what, now());
  else q.run('DELETE FROM homeroom_seen WHERE user_id=? AND what=?', u.id, what);
  return { ok: true, seen: !!done };
}
