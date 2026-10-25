// Admin moderation: review queue, game reports, chat reports, users, audit log. Every action is audited.
// Approve/reject go through services/publish.js (the only place that moves a version live).
import { q, now, tx, audit } from '../db.js';
import { getGame, getVersion } from './games.js';
import * as publish from './publish.js';

const parse = s => { try { return JSON.parse(s || '{}'); } catch { return {}; } };

/** Games waiting for a human: pending_version_id set. */
export function reviewQueue() {
  const rows = q.all(`SELECT g.*, u.username AS owner_name, u.display_name AS owner_display, u.avatar AS owner_avatar, u.photo_at AS owner_photo_at, u.color AS owner_color
    FROM games g JOIN users u ON u.id=g.owner_id WHERE g.pending_version_id IS NOT NULL ORDER BY g.updated_at ASC LIMIT 100`);
  return rows.map(g => {
    const v = getVersion(g.pending_version_id) || {};
    const live = g.published_version_id ? getVersion(g.published_version_id) : null;
    return {
      game: g, version: { id: v.id, number: v.number, notes: v.notes, created_at: v.created_at, safety_status: v.safety_status, size: v.html ? Buffer.byteLength(v.html) : 0 },
      isUpdate: g.status === 'published' && !!g.published_version_id, liveNumber: live ? live.number : null,
      safety: parse(v.safety_report), review: parse(v.review_report),
    };
  });
}
export function approve(admin, gameId, note = '') { return publish.approve(admin, gameId, String(note || '').slice(0, 500)); }
export function reject(admin, gameId, note = '') { return publish.reject(admin, gameId, String(note || '').trim().slice(0, 500) || 'Needs a few changes before it can be public.'); }

/** Games with open reports, plus anything hidden by reports or suspended. */
export function reportedGames() {
  const games = q.all(`SELECT g.id, g.slug, g.title, g.icon, g.cover, g.status, g.visibility, g.hidden_reason, g.owner_id, g.updated_at, u.username AS owner_name, u.display_name AS owner_display,
      (SELECT COUNT(*) FROM reports r WHERE r.game_id=g.id AND r.status='open') AS open_reports,
      (SELECT MAX(created_at) FROM reports r WHERE r.game_id=g.id) AS last_report
    FROM games g JOIN users u ON u.id=g.owner_id
    WHERE g.status='suspended' OR g.hidden_reason<>'' OR EXISTS (SELECT 1 FROM reports r WHERE r.game_id=g.id AND r.status='open')
    ORDER BY open_reports DESC, last_report DESC LIMIT 200`);
  return games.map(g => ({ ...g, reasons: q.all("SELECT reason, COUNT(*) n FROM reports WHERE game_id=? AND status='open' GROUP BY reason ORDER BY n DESC", g.id),
    details: q.all("SELECT details FROM reports WHERE game_id=? AND status='open' AND details<>'' ORDER BY created_at DESC LIMIT 5", g.id).map(r => r.details) }));
}
const resolveReports = (adminId, gameId, status) => q.run("UPDATE reports SET status=?, resolved_by=?, resolved_at=? WHERE game_id=? AND status='open'", status, adminId, now(), gameId).changes;
/** Restore & dismiss: the game is shown again and its open reports are closed. */
export function restoreGame(admin, gameId) {
  const g = getGame(gameId); if (!g) return null;
  let n = 0;
  tx(() => { q.run("UPDATE games SET hidden_reason='', updated_at=? WHERE id=?", now(), g.id); n = resolveReports(admin.id, g.id, 'dismissed'); });
  audit(admin.id, 'admin.restore_game', g.id, { dismissed: n });
  return getGame(g.id);
}
export function suspendGame(admin, gameId, note = '') {
  const g = getGame(gameId); if (!g) return null;
  let n = 0;
  tx(() => {
    q.run("UPDATE games SET status='suspended', review_note=?, updated_at=? WHERE id=?", String(note || 'Suspended by the safety team.').slice(0, 500), now(), g.id);
    n = resolveReports(admin.id, g.id, 'actioned');
  });
  audit(admin.id, 'admin.suspend_game', g.id, { note, reports: n });
  return getGame(g.id);
}
export function unsuspendGame(admin, gameId) {
  const g = getGame(gameId); if (!g || g.status !== 'suspended') return null;
  q.run("UPDATE games SET status=?, hidden_reason='', review_note='', updated_at=? WHERE id=?", g.published_version_id ? 'published' : 'draft', now(), g.id);
  audit(admin.id, 'admin.unsuspend_game', g.id);
  return getGame(g.id);
}

const MSG_USER = 'SELECT id, username, display_name, avatar, color, photo_at, banned, role FROM users WHERE id=?';
/** Open chat reports, each with the message, 5 messages of context on each side, reporter and sender. */
export function chatReports() {
  const reps = q.all("SELECT r.*, m.from_id, m.to_id, m.body, m.kind, m.status AS msg_status, m.created_at AS msg_at FROM chat_reports r JOIN chat_messages m ON m.id=r.message_id WHERE r.status='open' ORDER BY r.created_at ASC LIMIT 100");
  return reps.map(r => {
    const pair = [r.from_id, r.to_id, r.to_id, r.from_id];
    const before = q.all('SELECT * FROM chat_messages WHERE ((from_id=? AND to_id=?) OR (from_id=? AND to_id=?)) AND (created_at<? OR (created_at=? AND id<?)) ORDER BY created_at DESC, id DESC LIMIT 5', ...pair, r.msg_at, r.msg_at, r.message_id).reverse();
    const after = q.all('SELECT * FROM chat_messages WHERE ((from_id=? AND to_id=?) OR (from_id=? AND to_id=?)) AND (created_at>? OR (created_at=? AND id>?)) ORDER BY created_at ASC, id ASC LIMIT 5', ...pair, r.msg_at, r.msg_at, r.message_id);
    const msg = { id: r.message_id, from_id: r.from_id, to_id: r.to_id, body: r.body, kind: r.kind, status: r.msg_status, created_at: r.msg_at };
    return { report: r, message: msg, context: [...before, msg, ...after], sender: q.get(MSG_USER, r.from_id), reporter: q.get(MSG_USER, r.reporter_id) };
  });
}
const resolveChat = (adminId, messageId, status) => q.run("UPDATE chat_reports SET status=?, resolved_by=?, resolved_at=? WHERE message_id=? AND status='open'", status, adminId, now(), messageId).changes;
const getReport = id => q.get('SELECT * FROM chat_reports WHERE id=?', String(id || ''));
export function hideMessage(admin, reportId) {
  const r = getReport(reportId); if (!r) return false;
  tx(() => { q.run("UPDATE chat_messages SET status='hidden' WHERE id=?", r.message_id); resolveChat(admin.id, r.message_id, 'actioned'); });
  audit(admin.id, 'admin.hide_message', r.message_id, { report: r.id });
  return true;
}
export function dismissChatReport(admin, reportId) {
  const r = getReport(reportId); if (!r) return false;
  resolveChat(admin.id, r.message_id, 'dismissed');
  audit(admin.id, 'admin.dismiss_chat_report', r.message_id, { report: r.id });
  return true;
}
/** Ban the sender of a reported message: hides the message, closes the report, bans the account. */
export function banSender(admin, reportId) {
  const r = getReport(reportId); if (!r) return { ok: false, error: 'Report not found.' };
  const m = q.get('SELECT * FROM chat_messages WHERE id=?', r.message_id); if (!m) return { ok: false, error: 'Message not found.' };
  const res = banUser(admin, m.from_id, `chat report ${r.id}`);
  if (!res.ok) return res;
  tx(() => { q.run("UPDATE chat_messages SET status='hidden' WHERE id=?", m.id); resolveChat(admin.id, m.id, 'actioned'); });
  return res;
}

export function findUser(username) {
  const u = q.get('SELECT * FROM users WHERE username=? COLLATE NOCASE', String(username || '').trim());
  if (!u) return null;
  const games = q.get('SELECT COUNT(*) n FROM games WHERE owner_id=?', u.id).n;
  const friendsN = q.get("SELECT COUNT(*) n FROM friends WHERE user_id=? AND status='accepted'", u.id).n;
  const reportsAgainst = q.get('SELECT COUNT(*) n FROM chat_reports r JOIN chat_messages m ON m.id=r.message_id WHERE m.from_id=?', u.id).n;
  return { id: u.id, username: u.username, display_name: u.display_name, avatar: u.avatar, color: u.color, photo_at: u.photo_at, role: u.role, managed_school: u.managed_school || '', is_guest: !!u.is_guest, banned: !!u.banned, chat_enabled: !!u.chat_enabled, created_at: u.created_at, last_seen: u.last_seen, games, friends: friendsN, chatReports: reportsAgainst };
}
/** Ban: account paused, every session ended. Admins cannot be banned from here. */
export function banUser(admin, userId, reason = '') {
  const u = q.get('SELECT * FROM users WHERE id=?', userId);
  if (!u) return { ok: false, error: 'User not found.' };
  if (u.role === 'admin') return { ok: false, error: 'Admins cannot be banned here.' };
  tx(() => { q.run('UPDATE users SET banned=1 WHERE id=?', u.id); q.run('DELETE FROM sessions WHERE user_id=?', u.id); });
  audit(admin.id, 'admin.ban', u.id, { username: u.username, reason });
  return { ok: true };
}
export function unbanUser(admin, userId) {
  const u = q.get('SELECT * FROM users WHERE id=?', userId); if (!u) return { ok: false, error: 'User not found.' };
  q.run('UPDATE users SET banned=0 WHERE id=?', u.id);
  audit(admin.id, 'admin.unban', u.id, { username: u.username });
  return { ok: true };
}

/** Lookups for the audit log: one query per table for all the ids on the page (IN (...)), never one per row. */
const CHUNK = 900; // under SQLite's variable limit (999 on old builds), so even a very long page still works; a 200-row page is one query per table
const ID_SHAPE = /^[A-Za-z0-9_-]{6,40}$/; // what an id looks like (uid() is 10-12 alphanumerics); skips free text such as notes
function lookup(sql, ids, key = 'id') {
  const out = new Map();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    for (const r of q.all(sql.replace('(?)', `(${part.map(() => '?').join(',')})`), ...part)) out.set(r[key], r);
  }
  return out;
}
const clipText = (s, n) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
/** Latest audit entries with readable actor and target names (games, users, schools, classes) and a short readable
 *  details line where ids are shown as @username / school / class names. */
export function auditLog(limit = 200) {
  const rows = q.all('SELECT a.*, u.username AS actor_name FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT ?', limit);
  // 1. parse details once, collect every id-shaped value on the page
  const parsed = rows.map(r => { if (!r.details) return null; try { const o = JSON.parse(r.details); return o && typeof o === 'object' && !Array.isArray(o) ? o : null; } catch { return null; } });
  const ids = new Set();
  rows.forEach((r, i) => {
    if (r.target && ID_SHAPE.test(r.target)) ids.add(r.target);
    for (const v of Object.values(parsed[i] || {})) if (typeof v === 'string' && ID_SHAPE.test(v)) ids.add(v);
  });
  const all = [...ids];
  // 2. at most one query per table
  const games = all.length ? lookup('SELECT id, title FROM games WHERE id IN (?)', all) : new Map();
  const users = all.length ? lookup('SELECT id, username FROM users WHERE id IN (?)', all) : new Map();
  const schools = all.length ? lookup('SELECT id, name FROM schools WHERE id IN (?)', all) : new Map();
  const classes = all.length ? lookup('SELECT c.id, c.name, s.name AS school FROM classrooms c LEFT JOIN schools s ON s.id=c.school_id WHERE c.id IN (?)', all) : new Map();
  const name = id => {
    if (games.has(id)) return `🎮 ${games.get(id).title}`;
    if (users.has(id)) return `@${users.get(id).username}`;
    if (schools.has(id)) return `🏫 ${schools.get(id).name}`;
    if (classes.has(id)) { const c = classes.get(id); return `🧑‍🏫 ${c.name}${c.school ? ` (${c.school})` : ''}`; }
    return null;
  };
  const plain = id => (users.has(id) ? `@${users.get(id).username}` : schools.has(id) ? schools.get(id).name : classes.has(id) ? classes.get(id).name : games.has(id) ? games.get(id).title : null);
  const value = v => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return plain(v) || clipText(v, 80);
    if (typeof v === 'object') return clipText(JSON.stringify(v), 80);
    return String(v);
  };
  // 3. label each row
  return rows.map((r, i) => {
    const o = parsed[i];
    const detailsLabel = o ? clipText(Object.entries(o).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => `${k}: ${value(v)}`).join(' · '), 240)
      : clipText(r.details, 240);
    return { ...r, targetLabel: (r.target && name(r.target)) || r.target, detailsLabel };
  });
}
export const counts = () => ({
  queue: q.get('SELECT COUNT(*) n FROM games WHERE pending_version_id IS NOT NULL').n,
  reports: q.get("SELECT COUNT(DISTINCT game_id) n FROM reports WHERE status='open'").n,
  chat: q.get("SELECT COUNT(*) n FROM chat_reports WHERE status='open'").n,
});
