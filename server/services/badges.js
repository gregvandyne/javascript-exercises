// Numbers shown on the nav tabs. Friends tab = pending friend requests + unread chat messages. Me = a grown-up's link
// request waiting for the child's answer (services/family.js).
import { q } from '../db.js';
import { pendingCount, familiesOn } from './family.js';
import { unseenAsks } from './sparks.js';
import { noFriendsAccount } from './schools.js';
import { incomingCount } from './friends.js';
export function navBadges(user) {
  if (!user) return { friends: 0 };
  const me = familiesOn() ? pendingCount(user) : 0;
  // Staff have no friends: a request row that should not exist never lights a badge (services/friends.js ends it).
  const reqs = noFriendsAccount(user) ? 0 : incomingCount(user.id);   // never counts a request from a staff account
  const unread = q.get("SELECT COUNT(*) n FROM chat_messages WHERE to_id=? AND read_at IS NULL AND status='ok'", user.id).n;
  // The platform admin: games waiting for a person on the team (the review queue).
  const review = user.role === 'admin' ? q.get("SELECT COUNT(*) n FROM games WHERE pending_version_id IS NOT NULL AND status<>'deleted'").n : 0;
  // A grown-up: their children's "Ask my grown-up" not seen yet (the Family tab).
  const asks = familiesOn() && user.account_type === 'grownup' ? unseenAsks(user.id) : 0;
  return { friends: reqs + unread, requests: reqs, unread, me, review, asks };
}
