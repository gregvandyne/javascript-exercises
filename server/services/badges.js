// Numbers shown on the nav tabs. Friends tab = pending friend requests + unread chat messages.
import { q } from '../db.js';
export function navBadges(user) {
  if (!user) return { friends: 0 };
  const reqs = q.get("SELECT COUNT(*) n FROM friends WHERE friend_id=? AND status='pending'", user.id).n;
  const unread = q.get("SELECT COUNT(*) n FROM chat_messages WHERE to_id=? AND read_at IS NULL AND status='ok'", user.id).n;
  return { friends: reqs + unread, requests: reqs, unread };
}
