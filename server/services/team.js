// The Oomba team inbox (docs/decisions.md "Admin messages: the Oomba team inbox"). Team messages live in the same
// chat_messages table as friends' chat, as one thread between a person and the official account (OFFICIAL), so they show
// in the same inbox, badge and thread page, shown as "Oomba team" with a verified tick. Nobody signs in as the official
// account: platform admins write as the team (chat_messages.sent_by says which admin), automatic notices have no sender.
//
// Kinds of team message (chat_messages.kind):
//   team      an admin's own words to one person (body = the text, never translated)
//   notice    an automatic notice, e.g. a review result (body = JSON { k, title, slug, reason, note }; shown in the reader's language)
//   announce  one copy of an announcement (body = JSON { id, text }; announcements has the row)
//   copy      a copy for a child's grown-up of a team message to, or a reply from, that child (body = JSON { child, name, dir, text })
//   text/quick  a person's reply to the team
//
// Children (the safety rule): kids' chat is between kid friends only and an adult never chats with a child
// (services/friends.js samePair, services/chat.js canChat). The one exception is the Oomba team (platform admins: the
// owner's trusted staff, owner's decision November 2026), which may message any kid account. Safeguards: every team
// message to a child, and every reply from the child, is in the audit log with its text; when the child has a linked
// family grown-up or (for school students) school admins, each one gets a copy at once in their team thread; the child
// can report a team message; and the admin page shows whether a child's thread is copied to anyone.
// A child's reply goes through the same filters, pause and rate limits as friends' chat; every team message to a child
// is in the audit log with its text.
import crypto from 'node:crypto';
import { q, uid, now, tx, audit, setting } from '../db.js';
import { getUser, getUserByName, createUser, OFFICIAL, accountKind, onFirstSignIn } from '../auth.js';
import { BRAND } from '../views/brand.js';
import { tEn } from '../i18n/index.js';
import { cleanBody as cleanLine, checkText, quickText, pausedUntil, RATE_MAX, RATE_WINDOW, QUICK_IDS, QUICK_EMOJI } from './chat.js';
import { hasProfanity } from './textfilter.js';

export const MAX_TEAM_LEN = 1000;          // an admin's message, a grown-up's reply
export const TEAM_DAILY_REPLIES = 40;      // replies a person may send the team per day
export const ANNOUNCE_GAP_MS = 10 * 60e3;  // at most one announcement every 10 minutes (whole site)
export const ANNOUNCE_DAILY = 5;           // and 5 a day (whole site)
export const AUDIENCES = ['all', 'kids', 'grownups', 'staff', 'school'];
export const TEAM_KINDS = ['team', 'notice', 'announce', 'copy'];

/** The official account the team writes as (made here if the seed hasn't run, e.g. in tests). */
export function teamUser() {
  const u = getUserByName(OFFICIAL);
  if (u) return u;
  return createUser({ username: OFFICIAL, password: crypto.randomBytes(24).toString('hex'), displayName: BRAND, avatar: '🎮', color: '#66C792' });
}
export const isTeamName = name => String(name || '').toLowerCase() === OFFICIAL.toLowerCase();

/** A child, for this rule: a kid account (not a grown-up, not school staff, not a platform admin). */
export function isChild(u) {
  if (!u || u.is_guest) return false;
  if (u.account_type === 'grownup' || u.role === 'admin') return false;
  return accountKind(u) !== 'staff';
}
/** The grown-ups who see a child's team thread: the family grown-up they are linked to (a confirmed link), and for a
 *  school student the active admins of their school. Never a banned account. */
export function guardiansOf(child) {
  if (!child) return [];
  const rows = q.all(`SELECT f.owner_id AS id FROM families f JOIN family_children fc ON fc.family_id=f.id
      WHERE fc.child_id=? AND fc.status='linked' AND fc.unlinked_at IS NULL
    UNION SELECT a.user_id AS id FROM school_members s JOIN school_members a ON a.school_id=s.school_id
      WHERE s.user_id=? AND s.status='active' AND s.role='student' AND a.role='admin' AND a.status='active'`, child.id, child.id);
  return rows.map(r => getUser(r.id)).filter(g => g && !g.banned && !g.is_guest && g.id !== child.id);
}

/** A team message or a grown-up's reply keeps its line breaks and blank lines (paragraphs, bullet lines), at most one
 *  blank line in a row; each line is cleaned like chat (control and direction characters out, spaces collapsed). */
export const cleanBody = s => String(s ?? '').replace(/\r\n?/g, '\n').split('\n').map(cleanLine).join('\n')
  .replace(/\n{3,}/g, '\n\n').trim();

const insert = (from, to, kind, body, sentBy = null, at = now()) => {
  const id = uid(14);
  q.run('INSERT INTO chat_messages(id, from_id, to_id, body, kind, status, created_at, sent_by) VALUES (?,?,?,?,?,?,?,?)', id, from, to, body, kind, 'ok', at, sentBy);
  return id;
};
const copyTo = (guardians, child, dir, text, sentBy) => {
  const team = teamUser();
  for (const g of guardians) insert(team.id, g.id, 'copy', JSON.stringify({ child: child.id, name: child.display_name, dir, text }), sentBy);
};
const fail = (code, error) => ({ ok: false, code, error });

/** Has the team ever written to this person? (Replies are only for a thread the team started.) */
const teamWrote = (userId, team = teamUser()) => !!q.get('SELECT 1 FROM chat_messages WHERE from_id=? AND to_id=? LIMIT 1', team.id, userId);

/** May an admin send this person a direct message? -> { ok, child, guardians, code, error } (English: admin pages). */
export function canMessage(user) {
  if (!user) return fail('missing', 'User not found.');
  if (user.is_guest) return fail('guest', 'Guests have no inbox.');
  if (user.username === OFFICIAL) return fail('self', 'That is the team account itself.');
  if (user.banned) return fail('banned', 'This account is banned.');
  const child = isChild(user);
  const guardians = child ? guardiansOf(user) : [];
  return { ok: true, child, guardians };
}

/** An admin writes to one person, as the Oomba team. A child's message is copied to their grown-ups and audited with its text. */
export function sendDirect(admin, user, text) {
  if (!admin || admin.role !== 'admin') return fail('admin', 'Admins only.');
  const c = canMessage(user); if (!c.ok) return c;
  const body = cleanBody(text);
  if (!body) return fail('empty', 'Write a message first.');
  if (body.length > MAX_TEAM_LEN) return fail('long', `Keep it under ${MAX_TEAM_LEN} characters.`);
  const team = teamUser();
  let id = '';
  tx(() => {
    id = insert(team.id, user.id, 'team', body, admin.id);
    if (c.child) copyTo(c.guardians, user, 'to', body, admin.id);
  });
  audit(admin.id, 'admin.message', user.id, c.child ? { message: id, child: true, copiedTo: c.guardians.map(g => g.id), text: body.slice(0, 500) } : { message: id });
  return { ok: true, id, copiedTo: c.guardians };
}

/** An automatic notice (e.g. a review result). notice: { k, title, slug, reason, note }. Not copied (it is about the
 *  person's own game, the same words the Studio shows). */
export function notify(userId, notice) {
  const u = getUser(userId);
  if (!u || u.is_guest || u.username === OFFICIAL) return null;
  return insert(teamUser().id, u.id, 'notice', JSON.stringify(notice));
}

// ---------------------------------------------------------------- replies
/** May this person write to the team now? -> { ok, code, reason } in their language (t). */
export function canReply(me, t = tEn) {
  const no = code => ({ ok: false, code, reason: t(`team.cant.${code}`) });
  if (!me || me.is_guest) return no('guest');
  if (me.banned) return no('banned');
  if (me.username === OFFICIAL) return no('guest');
  if (!teamWrote(me.id)) return no('notYet');
  return { ok: true, code: 'ok', reason: '' };
}

/** A person replies to the team. kind: 'text' | 'quick' (quick phrases for kids). */
export function reply(me, { kind = 'text', body = '' } = {}, t = tEn) {
  me = me && getUser(me.id);
  const c = canReply(me, t);
  if (!c.ok) return { ok: false, code: c.code, error: c.reason };
  if (!['text', 'quick'].includes(kind)) return { ok: false, code: 'kind', error: t('chat.errors.kind') };
  const team = teamUser();
  const at = now();
  const recent = q.get('SELECT COUNT(*) n FROM chat_messages WHERE from_id=? AND created_at>?', me.id, at - RATE_WINDOW).n;
  if (recent >= RATE_MAX) return { ok: false, code: 'rate', error: t('chat.errors.rate') };
  const dayStart = Date.UTC(new Date(at).getUTCFullYear(), new Date(at).getUTCMonth(), new Date(at).getUTCDate());
  if (q.get('SELECT COUNT(*) n FROM chat_messages WHERE from_id=? AND to_id=? AND created_at>=?', me.id, team.id, dayStart).n >= TEAM_DAILY_REPLIES) return { ok: false, code: 'daily', error: t('chat.errors.daily') };
  const child = isChild(me);
  let text;
  if (kind === 'quick') {
    text = QUICK_IDS.includes(String(body)) || QUICK_EMOJI.includes(String(body)) ? String(body) : null;
    if (!text) return { ok: false, code: 'quick', error: t('chat.errors.quick') };
  } else if (child) {
    // The same filters as friends' chat (bad words, phone numbers, addresses, links...) and the same pause.
    const p = pausedUntil(me.id);
    if (p) return { ok: false, code: 'paused', paused: true, until: p, error: t('chat.paused', { minutes: Math.max(1, Math.ceil((p - at) / 60e3)) }) };
    const r = checkText(body, t);
    if (!r.ok) return r;
    text = r.value;
  } else {
    text = cleanBody(body);
    if (!text) return { ok: false, code: 'empty', error: t('chat.errors.empty') };
    if (text.length > MAX_TEAM_LEN) return { ok: false, code: 'long', error: t('chat.errors.long', { max: MAX_TEAM_LEN }) };
    if (hasProfanity(text)) return { ok: false, code: 'words', error: t('chat.blocked.words') };
  }
  let id = '';
  tx(() => {
    id = insert(me.id, team.id, kind, text, null, at);
    if (child) copyTo(guardiansOf(me), me, 'from', kind === 'quick' ? quickText(text) : text, null);
  });
  if (child) audit(me.id, 'team.reply.child', me.id, { message: id, text: (kind === 'quick' ? quickText(text) : text).slice(0, 500) });
  return { ok: true, id, message: q.get('SELECT * FROM chat_messages WHERE id=?', id) };
}

// ---------------------------------------------------------------- the person's side
/** The team row for a person's inbox, or null when the team never wrote. */
export function inboxRow(me, t = tEn, present) {
  const team = teamUser();
  if (!me || me.id === team.id) return null;
  const last = q.get(`SELECT * FROM chat_messages m WHERE ((m.from_id=? AND m.to_id=?) OR (m.from_id=? AND m.to_id=?)) AND m.status='ok' ORDER BY m.created_at DESC, m.id DESC LIMIT 1`, team.id, me.id, me.id, team.id);
  if (!last) return null;
  const unread = q.get("SELECT COUNT(*) n FROM chat_messages WHERE from_id=? AND to_id=? AND read_at IS NULL AND status='ok'", team.id, me.id).n;
  const shown = present(last, me, t);
  const preview = last.from_id === me.id ? t('chat.inbox.you', { text: shown.body }) : shown.body;
  return { id: team.id, username: team.username, displayName: t('team.name'), avatar: team.avatar, color: team.color, photo_at: 0, photo: '', chatOn: true, team: true, last: last.created_at, preview: preview.slice(0, 140), unread };
}
/** Unread team messages for this person (the grown-up's Family badge; kids' and staff's count in the chat badge). */
export const unreadFor = userId => q.get("SELECT COUNT(*) n FROM chat_messages m JOIN users u ON u.id=m.from_id WHERE m.to_id=? AND m.read_at IS NULL AND m.status='ok' AND u.username=?", userId, OFFICIAL).n;

// ---------------------------------------------------------------- the admin's side (English)
/** Threads for the admin's Team inbox: people the team wrote to directly (or copied), or who wrote to the team.
 *  Announcements and automatic notices alone don't make a thread. Unanswered first, then newest. */
export function adminThreads({ limit = 100 } = {}) {
  const team = teamUser();
  return q.all(`SELECT u.id, u.username, u.display_name, u.avatar, u.color, u.photo_at, u.account_type, u.banned,
      MAX(m.created_at) AS last,
      SUM(CASE WHEN m.from_id=u.id AND m.read_at IS NULL THEN 1 ELSE 0 END) AS unread
    FROM chat_messages m JOIN users u ON u.id = CASE WHEN m.from_id=? THEN m.to_id ELSE m.from_id END
    WHERE (m.from_id=? OR m.to_id=?) AND (m.to_id=? OR m.kind IN ('team','copy'))
    GROUP BY u.id ORDER BY unread>0 DESC, last DESC LIMIT ?`, team.id, team.id, team.id, team.id, limit);
}
/** Every message between the team and one person, oldest first (the admin's thread view). */
export function adminThread(user, limit = 200) {
  const team = teamUser();
  return q.all(`SELECT * FROM (SELECT m.*, a.username AS admin_name FROM chat_messages m LEFT JOIN users a ON a.id=m.sent_by
      WHERE (m.from_id=? AND m.to_id=?) OR (m.from_id=? AND m.to_id=?) ORDER BY m.created_at DESC, m.id DESC LIMIT ?) ORDER BY created_at ASC, id ASC`,
  team.id, user.id, user.id, team.id, limit);
}
/** The admin opened the thread: the person's messages count as read (for every admin: one team inbox). */
export const markReadByTeam = user => q.run('UPDATE chat_messages SET read_at=? WHERE from_id=? AND to_id=? AND read_at IS NULL', now(), user.id, teamUser().id).changes;
/** Team inbox badge: messages to the team nobody opened yet. */
export const adminUnread = () => q.get('SELECT COUNT(*) n FROM chat_messages WHERE to_id=? AND read_at IS NULL', teamUser().id).n;

// ---------------------------------------------------------------- announcements
/** Who an announcement reaches: real (non-guest), not banned accounts, never the team account or the sender. */
function audienceSql(audience, schoolId) {
  const base = "u.is_guest=0 AND u.banned=0 AND u.username<>?";
  const staff = "EXISTS (SELECT 1 FROM school_members sm WHERE sm.user_id=u.id AND sm.status='active' AND sm.role<>'student')";
  if (audience === 'all') return { sql: base, params: [OFFICIAL] };
  if (audience === 'grownups') return { sql: `${base} AND u.account_type='grownup'`, params: [OFFICIAL] };
  if (audience === 'staff') return { sql: `${base} AND u.account_type<>'grownup' AND ${staff}`, params: [OFFICIAL] };
  if (audience === 'kids') return { sql: `${base} AND u.account_type<>'grownup' AND u.role<>'admin' AND NOT ${staff}`, params: [OFFICIAL] };
  if (audience === 'school') return { sql: `${base} AND EXISTS (SELECT 1 FROM school_members sm WHERE sm.user_id=u.id AND sm.school_id=? AND sm.status='active')`, params: [OFFICIAL, schoolId] };
  return null;
}
const recipients = (audience, schoolId, exceptId) => {
  const a = audienceSql(audience, schoolId);
  return a ? q.all(`SELECT u.id FROM users u WHERE ${a.sql} AND u.id<>?`, ...a.params, exceptId || '').map(r => r.id) : null;
};
const fingerprint = (audience, schoolId, text) => crypto.createHash('sha256').update(JSON.stringify([audience, schoolId || '', text])).digest('base64url').slice(0, 22);
/** When the next announcement may go out (0 = now), and how many are left today. */
export function announceLimits(at = now()) {
  const lastRow = q.get('SELECT MAX(created_at) t FROM announcements');
  const day = q.get('SELECT COUNT(*) n FROM announcements WHERE created_at>?', at - 24 * 3600e3).n;
  const nextAt = lastRow && lastRow.t ? lastRow.t + ANNOUNCE_GAP_MS : 0;
  return { nextAt: nextAt > at ? nextAt : 0, leftToday: Math.max(0, ANNOUNCE_DAILY - day) };
}
function checkAnnouncement(admin, { audience, schoolId, text }) {
  if (!admin || admin.role !== 'admin') return fail('admin', 'Admins only.');
  if (!AUDIENCES.includes(audience)) return fail('audience', 'Pick who it is for.');
  if (audience === 'school' && !q.get('SELECT 1 FROM schools WHERE id=? AND archived_at IS NULL', String(schoolId || ''))) return fail('school', 'Pick a school.');
  const body = cleanBody(text);
  if (!body) return fail('empty', 'Write the announcement first.');
  if (body.length > MAX_TEAM_LEN) return fail('long', `Keep it under ${MAX_TEAM_LEN} characters.`);
  return { ok: true, body, school: audience === 'school' ? String(schoolId) : null };
}
/** Step 1: who it would reach, and the confirm code for step 2 (the same audience and the same words). */
export function previewAnnouncement(admin, input) {
  const c = checkAnnouncement(admin, input); if (!c.ok) return c;
  const ids = recipients(input.audience, c.school, admin.id);
  return { ok: true, count: ids.length, confirm: fingerprint(input.audience, c.school, c.body), limits: announceLimits() };
}
/** Step 2: send it. confirm must be step 1's code for exactly this audience and text. Rate limited for the whole site. */
export function sendAnnouncement(admin, input) {
  const c = checkAnnouncement(admin, input); if (!c.ok) return c;
  if (!input.confirm || input.confirm !== fingerprint(input.audience, c.school, c.body)) return fail('confirm', 'Check who it goes to first (the audience or the words changed).');
  const lim = announceLimits();
  if (lim.nextAt) return fail('rate', `One announcement every ${ANNOUNCE_GAP_MS / 60e3} minutes. Try again in ${Math.ceil((lim.nextAt - now()) / 60e3)} min.`);
  if (!lim.leftToday) return fail('daily', `At most ${ANNOUNCE_DAILY} announcements a day.`);
  const ids = recipients(input.audience, c.school, admin.id);
  if (!ids.length) return fail('nobody', 'Nobody is in that group.');
  const team = teamUser(); const id = uid(12); const at = now();
  const body = JSON.stringify({ id, text: c.body });
  tx(() => {
    q.run('INSERT INTO announcements(id, sent_by, audience, school_id, body, recipients, created_at) VALUES (?,?,?,?,?,?,?)', id, admin.id, input.audience, c.school, c.body, ids.length, at);
    for (const to of ids) insert(team.id, to, 'announce', body, admin.id, at);
  });
  audit(admin.id, 'admin.announce', id, { audience: input.audience, school: c.school || undefined, recipients: ids.length, text: c.body.slice(0, 500) });
  return { ok: true, id, count: ids.length };
}
export const recentAnnouncements = (limit = 20) => q.all(`SELECT a.*, u.username AS admin_name, s.name AS school_name,
    NOT EXISTS (SELECT 1 FROM chat_messages m WHERE m.kind='announce' AND m.status='ok' AND m.body LIKE '{"id":"' || a.id || '"%') AS unsent
    FROM announcements a LEFT JOIN users u ON u.id=a.sent_by LEFT JOIN schools s ON s.id=a.school_id ORDER BY a.created_at DESC LIMIT ?`, limit);

// ---------------------------------------------------------------- unsend
// An admin takes back a team message (a typo, a blank left in): it disappears from the person's inbox (status
// 'unsent'; chat shows only 'ok' messages), and so do the copies their grown-ups got. The admin's thread still shows it,
// marked unsent, and the audit log keeps the text. Replies and automatic notices can't be unsent here.
export function unsendDirect(admin, messageId) {
  if (!admin || admin.role !== 'admin') return fail('admin', 'Admins only.');
  const team = teamUser();
  const m = q.get('SELECT * FROM chat_messages WHERE id=?', String(messageId || ''));
  if (!m || m.from_id !== team.id || m.kind !== 'team') return fail('missing', 'No such team message.');
  if (m.status === 'unsent') return { ok: true, id: m.id, copies: 0, already: true };
  let copies = 0;
  tx(() => {
    q.run("UPDATE chat_messages SET status='unsent' WHERE id=?", m.id);
    // The copies sent with it: same team sender and admin, within a few seconds, about this child, the same words.
    for (const c of q.all("SELECT id, body FROM chat_messages WHERE from_id=? AND kind='copy' AND status='ok' AND created_at BETWEEN ? AND ?", team.id, m.created_at - 5000, m.created_at + 5000)) {
      let b = null; try { b = JSON.parse(c.body); } catch { b = null; }
      if (b && b.child === m.to_id && b.dir === 'to' && b.text === m.body) { q.run("UPDATE chat_messages SET status='unsent' WHERE id=?", c.id); copies++; }
    }
  });
  audit(admin.id, 'admin.message.unsend', m.to_id, { message: m.id, copies, text: String(m.body).slice(0, 500) });
  return { ok: true, id: m.id, copies };
}
export function unsendAnnouncement(admin, announcementId) {
  if (!admin || admin.role !== 'admin') return fail('admin', 'Admins only.');
  const a = q.get('SELECT * FROM announcements WHERE id=?', String(announcementId || ''));
  if (!a) return fail('missing', 'No such announcement.');
  const n = q.run(`UPDATE chat_messages SET status='unsent' WHERE from_id=? AND kind='announce' AND status='ok' AND body LIKE ?`, teamUser().id, `{"id":"${a.id}"%`).changes;
  audit(admin.id, 'admin.announce.unsend', a.id, { removed: n, text: String(a.body).slice(0, 500) });
  return { ok: true, id: a.id, removed: n };
}

// ---------------------------------------------------------------- welcome for new kids
// The owner's welcome message, sent automatically from the Oomba team to every new kid account at its first sign-in
// (signing up, or the first time a kid made by a grown-up or a school signs in). Accounts made more than WELCOME_DAYS
// ago are not "new" (an old account whose first recorded sign-in comes late gets nothing). {name} becomes the kid's
// display name. Stored in settings 'team.welcome' as { on, text }; on by default with DEFAULT_WELCOME. Copied to the
// kid's grown-ups like any team message and audited.
export const WELCOME_DAYS = 30;
export const DEFAULT_WELCOME = `Hi {name}! 👋

Welcome to Oomba Academy! I'm Greg from the Oomba team, and I wanted to say hi.

Here are a few fun things to try:
• Play: lots of free games, from math racing to geography and chess.
• Build: tap Build, tell the AI your game idea, and it makes it for you to play and share with friends.
• Learn: try a course like Number Quest (math), CS Quest (coding) or Cyber Defenders (staying safe online).

Got a question, or something that felt confusing? Just write back here. I read every message!

Greg & the Oomba team`;
export function welcomeSettings() {
  let v = null; try { v = JSON.parse(setting('team.welcome') || 'null'); } catch { v = null; }
  return { on: v ? v.on !== false : true, text: v && typeof v.text === 'string' && v.text.trim() ? v.text : DEFAULT_WELCOME };
}
export function saveWelcome(admin, { on, text }) {
  if (!admin || admin.role !== 'admin') return fail('admin', 'Admins only.');
  const body = cleanBody(text);
  if (!body) return fail('empty', 'Write the welcome message first.');
  if (body.length > MAX_TEAM_LEN) return fail('long', `Keep it under ${MAX_TEAM_LEN} characters.`);
  const value = { on: !!on, text: body };
  setting('team.welcome', JSON.stringify(value));
  audit(admin.id, 'admin.team.welcome', 'team.welcome', { on: value.on, text: body.slice(0, 500) });
  return { ok: true, ...value };
}
/** Send the welcome to this kid now (if on, a kid, new, and not welcomed before). -> message id or null. */
export function sendWelcome(user, at = now()) {
  if (!user || user.is_guest || user.banned || !isChild(user)) return null;
  if (!(user.created_at > at - WELCOME_DAYS * 86400e3)) return null;
  const w = welcomeSettings(); if (!w.on) return null;
  const team = teamUser();
  if (q.get("SELECT 1 FROM chat_messages WHERE from_id=? AND to_id=? AND kind='team' AND sent_by IS NULL LIMIT 1", team.id, user.id)) return null;
  const first = String(user.display_name || user.username || '').trim().split(/\s+/)[0] || 'there';
  const body = cleanBody(w.text.replace(/\{name\}/g, first)).slice(0, MAX_TEAM_LEN);
  const guardians = guardiansOf(user);
  let id = '';
  tx(() => { id = insert(team.id, user.id, 'team', body, null); if (guardians.length) copyTo(guardians, user, 'to', body, null); });
  audit(null, 'team.welcome', user.id, { message: id, child: true, copiedTo: guardians.map(g => g.id), text: body.slice(0, 500) });
  return id;
}
onFirstSignIn(u => { sendWelcome(u); });

