// Friends-only chat (added at the owner's request; kid-safe by design). Every rule lives here and is unit-tested.
//  - Only between accepted friends, both real accounts, both with chat switched on, neither banned, neither blocking the other.
//  - Text: max 200 chars, trimmed, control characters stripped. Bad words and personal details (phone, email, link,
//    address, "add me on snap", "what school") are refused and never stored; they count in chat_usage.blocked.
//  - 5 refused messages in a day pause text chat for 10 minutes. Max 8 messages per 20 s, config.chatDailyLimit per day.
//  - Quick phrases (fixed list) are always allowed. Game invites only for games both people can open.
//  - Block hides the thread both ways. Reporting a message hides it for the reporter at once and queues it for admins.
//  - Messages to the player come back in the language of t (req.t; English by default). Quick phrases are stored by id
//    and shown to each reader in their own language, so friends who speak different languages can still say "Good game!".
import { photoUrl } from './photos.js';
import { q, uid, now, today, migrate, audit } from '../db.js';
import { config } from '../config.js';
import { hasProfanity, personalInfo, foldDigits } from './textfilter.js';
import { tEn } from '../i18n/index.js';
import { getGame, canView } from './games.js';

migrate([['0002_community', 'ALTER TABLE chat_usage ADD COLUMN paused_until INTEGER NOT NULL DEFAULT 0; CREATE INDEX IF NOT EXISTS chat_reports_msg ON chat_reports(message_id, reporter_id);']]);

export const MAX_LEN = 200;
export const RATE_MAX = 8;
export const RATE_WINDOW = 20e3;
export const PAUSE_AFTER = 5;
export const PAUSE_MS = 10 * 60e3;
// Quick phrases: ids with text in the locale files (chat.quick.<id>); emoji-only ones are the same in every language.
export const QUICK_IDS = ['hi', 'gg', 'play', 'nice', 'brb', 'again', 'thanks', 'bye'];
export const QUICK_EMOJI = ['👋', '😂', '🔥', '🏆', '❤️', '👍'];
/** [id, text] pairs for the chips, in the reader's language. */
export const quickPhrases = (t = tEn) => [...QUICK_IDS.map(id => [id, t(`chat.quick.${id}`)]), ...QUICK_EMOJI.map(e => [e, e])];
/** English text of every quick phrase (older messages and API clients may send the text instead of the id). */
export const QUICK = quickPhrases().map(([, text]) => text);
const quickId = body => { const b = String(body); if (QUICK_IDS.includes(b) || QUICK_EMOJI.includes(b)) return b; const hit = quickPhrases().find(([, text]) => text === b); return hit ? hit[0] : null; };
const REASON_KEYS = ['mean', 'scary', 'personal', 'grownup', 'spam', 'other'];
/** [key, label] pairs in the reader's language (English by default; the admin panel uses English). */
export const reportReasons = (t = tEn) => REASON_KEYS.map(k => [k, t(`chat.report.reasons.${k}`)]);
export const REPORT_REASONS = reportReasons();
const BLOCKED_KEYS = ['words', 'phone', 'email', 'link', 'address', 'contact', 'handle'];

/** Strip control and bidi-override characters, squash whitespace, trim. */
export const cleanBody = s => String(s ?? '').replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g, ' ').replace(/\s+/g, ' ').trim();

const userById = id => (id ? q.get('SELECT * FROM users WHERE id=?', id) : null);
export const isBlocked = (a, b) => !!q.get('SELECT 1 FROM chat_blocks WHERE user_id=? AND blocked_id=?', a, b);
const accepted = (a, b) => !!q.get("SELECT 1 FROM friends WHERE user_id=? AND friend_id=? AND status='accepted'", a, b);

/** Can `me` chat with `other` at all? Returns { ok, code, reason } with a plain-words reason when not. */
export function canChat(me, other, t = tEn) {
  me = me && userById(me.id); other = other && userById(other.id);
  const no = (code, vars) => ({ ok: false, code, reason: t(`chat.cant.${code}`, vars) });
  if (!me || me.is_guest) return no('guest');
  if (me.banned) return no('banned');
  if (!other || other.banned) return no('missing');
  if (other.id === me.id) return no('self');
  if (other.is_guest) return no('guest_other');
  const name = other.display_name;
  if (!accepted(me.id, other.id) || !accepted(other.id, me.id)) return no('not_friends', { name });
  if (!me.chat_enabled) return no('chat_off_me');
  if (!other.chat_enabled) return no('chat_off_other', { name });
  if (isBlocked(me.id, other.id)) return no('blocked_by_me', { name });
  if (isBlocked(other.id, me.id)) return no('blocked_by_other', { name });
  return { ok: true, code: 'ok', reason: '' };
}

function usage(userId, day = today()) {
  return q.get('SELECT * FROM chat_usage WHERE user_id=? AND day=?', userId, day) || { user_id: userId, day, sent: 0, blocked: 0, paused_until: 0 };
}
const bump = (userId, col) => q.run(`INSERT INTO chat_usage(user_id, day, ${col}) VALUES (?,?,1) ON CONFLICT(user_id, day) DO UPDATE SET ${col}=${col}+1`, userId, today());
/** ms timestamp until which text chat is paused for this user (0 = not paused). */
export function pausedUntil(userId) {
  const u = q.get('SELECT MAX(paused_until) t FROM chat_usage WHERE user_id=?', userId);
  const t = (u && u.t) || 0;
  return t > now() ? t : 0;
}
function recordBlocked(userId) {
  bump(userId, 'blocked');
  const u = usage(userId);
  if (u.blocked >= PAUSE_AFTER && u.blocked % PAUSE_AFTER === 0) {
    q.run('UPDATE chat_usage SET paused_until=? WHERE user_id=? AND day=?', now() + PAUSE_MS, userId, today());
    audit(userId, 'chat.paused', userId, { blocked: u.blocked });
    return true;
  }
  return false;
}
const pauseMsg = (until, tr) => tr('chat.paused', { minutes: Math.max(1, Math.ceil((until - now()) / 60e3)) });

/** Check a text message. Returns { ok, value } or { ok:false, code, error }. Does not record anything. */
export function checkText(body, tr = tEn) {
  const raw = String(body ?? '');
  const t = cleanBody(raw);
  if (!t) return { ok: false, code: 'empty', error: tr('chat.errors.empty') };
  if (t.length > MAX_LEN) return { ok: false, code: 'long', error: tr('chat.errors.long', { max: MAX_LEN }) };
  if (hasProfanity(t)) return { ok: false, code: 'words', blocked: true, error: tr('chat.blocked.words') };
  const pi = personalInfo(t) || extraPersonal(t);
  if (pi) return { ok: false, code: pi, blocked: true, error: tr(`chat.blocked.${BLOCKED_KEYS.includes(pi) ? pi : 'contact'}`) };
  return { ok: true, value: t };
}
// A few chat-specific phrasings on top of textfilter.personalInfo (it is shared with usernames and games, so we add here).
function extraPersonal(t) {
  if (/\b(add|follow|find|dm|message|text|call)\s+me\s+(on|at|in)\b/i.test(t)) return 'contact';
  if (/\b(what|which)\s+(school|town|city|street)\b|\bwhere\s+(do\s+)?(you|u)\s+(live|go to school)\b|\bhow\s+old\s+(are\s+)?(you|u)\b|\byour\s+(real\s+name|address|password|last\s+name|age)\b/i.test(t)) return 'contact';
  if (/\b(my|our)\s+(address|password|school)\s+is\b/i.test(t)) return 'contact';
  // digits spelled with spaces or words ("five five five one two ..."), in any script (full-width, Arabic-Indic...)
  const digits = foldDigits(t.normalize('NFKC')).replace(/\b(zero|oh|one|two|three|four|five|six|seven|eight|nine)\b/gi, '1');
  if (/(\d[\s.\-_,/()]*){7,}/.test(digits)) return 'phone';
  return null;
}

/**
 * Send a message. kind: 'text' | 'quick' | 'game' (body = game id).
 * Returns { ok:true, message } or { ok:false, code, error, blocked?, paused? }.
 */
export function send(me, other, { kind = 'text', body = '' } = {}, tr = tEn) {
  const c = canChat(me, other, tr);
  if (!c.ok) return { ok: false, code: c.code, error: c.reason };
  if (!['text', 'quick', 'game'].includes(kind)) return { ok: false, code: 'kind', error: tr('chat.errors.kind') };
  const t = now();
  const recent = q.get('SELECT COUNT(*) n FROM chat_messages WHERE from_id=? AND created_at>?', me.id, t - RATE_WINDOW).n;
  if (recent >= RATE_MAX) return { ok: false, code: 'rate', error: tr('chat.errors.rate') };
  if (usage(me.id).sent >= config.chatDailyLimit) return { ok: false, code: 'daily', error: tr('chat.errors.daily') };
  let text = '';
  if (kind === 'quick') {
    text = quickId(body);
    if (!text) return { ok: false, code: 'quick', error: tr('chat.errors.quick') };
  } else if (kind === 'game') {
    const g = getGame(String(body));
    if (!g || !canView(me, g)) return { ok: false, code: 'game', error: tr('chat.errors.game') };
    if (!canView(userById(other.id), g)) return { ok: false, code: 'game_hidden', error: tr('chat.errors.gameHidden', { name: other.display_name }) };
    text = g.id;
  } else {
    const p = pausedUntil(me.id);
    if (p) return { ok: false, code: 'paused', paused: true, until: p, error: pauseMsg(p, tr) };
    const r = checkText(body, tr);
    if (!r.ok) {
      if (r.blocked) {
        const paused = recordBlocked(me.id);
        if (paused) return { ok: false, code: r.code, blocked: true, paused: true, until: pausedUntil(me.id), error: `${r.error} ${pauseMsg(pausedUntil(me.id), tr)}` };
      }
      return r;
    }
    text = r.value;
  }
  const id = uid(14);
  q.run('INSERT INTO chat_messages(id, from_id, to_id, body, kind, status, created_at) VALUES (?,?,?,?,?,?,?)', id, me.id, other.id, text, kind, 'ok', t);
  bump(me.id, 'sent');
  return { ok: true, message: present(q.get('SELECT * FROM chat_messages WHERE id=?', id), me, tr) };
}

/** A quick message's text for a reader (stored as an id; older rows hold the English text). */
export const quickText = (body, t = tEn) => (QUICK_IDS.includes(body) ? t(`chat.quick.${body}`) : body);

/** Shape a message row for the viewer. Game invites carry the game card only if the viewer can open it. */
export function present(m, viewer, t = tEn) {
  const out = { id: m.id, mine: m.from_id === viewer.id, kind: m.kind, body: m.kind === 'quick' ? quickText(m.body, t) : m.body, at: m.created_at, read: !!m.read_at };
  if (m.kind === 'game') {
    const g = getGame(m.body);
    out.body = '';
    out.game = g && canView(userById(viewer.id), g) ? { id: g.id, slug: g.slug, title: g.title, icon: g.icon, cover: g.cover } : null;
  }
  return out;
}

const VISIBLE_FOR = `m.status='ok' AND NOT EXISTS (SELECT 1 FROM chat_reports r WHERE r.message_id=m.id AND r.reporter_id=?)`;
/** Messages between me and other that I may see, oldest first. `after` = ms timestamp (inclusive; clients de-dupe by id). */
export function thread(me, other, { after = 0, limit = 80 } = {}, t = tEn) {
  if (isBlocked(me.id, other.id) || isBlocked(other.id, me.id)) return [];
  const rows = after
    ? q.all(`SELECT * FROM chat_messages m WHERE ((m.from_id=? AND m.to_id=?) OR (m.from_id=? AND m.to_id=?)) AND m.created_at>=? AND ${VISIBLE_FOR} ORDER BY m.created_at ASC, m.id ASC LIMIT ?`, me.id, other.id, other.id, me.id, +after || 0, me.id, limit)
    : q.all(`SELECT * FROM (SELECT * FROM chat_messages m WHERE ((m.from_id=? AND m.to_id=?) OR (m.from_id=? AND m.to_id=?)) AND ${VISIBLE_FOR} ORDER BY m.created_at DESC, m.id DESC LIMIT ?) ORDER BY created_at ASC, id ASC`, me.id, other.id, other.id, me.id, me.id, limit);
  return rows.map(m => present(m, me, t));
}
export function markRead(me, other) {
  return q.run('UPDATE chat_messages SET read_at=? WHERE to_id=? AND from_id=? AND read_at IS NULL', now(), me.id, other.id).changes;
}

/** Inbox: every friend I can see, with the latest visible message and my unread count, newest first. */
export function inbox(me, t = tEn) {
  const friends = q.all(`SELECT u.id, u.username, u.display_name, u.avatar, u.color, u.photo_at, u.chat_enabled FROM friends f JOIN users u ON u.id=f.friend_id
    WHERE f.user_id=? AND f.status='accepted' AND u.banned=0 AND u.is_guest=0
    AND NOT EXISTS (SELECT 1 FROM chat_blocks b WHERE (b.user_id=? AND b.blocked_id=u.id) OR (b.user_id=u.id AND b.blocked_id=?))`, me.id, me.id, me.id);
  const rows = friends.map(f => {
    const last = q.get(`SELECT * FROM chat_messages m WHERE ((m.from_id=? AND m.to_id=?) OR (m.from_id=? AND m.to_id=?)) AND ${VISIBLE_FOR} ORDER BY m.created_at DESC, m.id DESC LIMIT 1`, me.id, f.id, f.id, me.id, me.id);
    const unread = q.get(`SELECT COUNT(*) n FROM chat_messages m WHERE m.from_id=? AND m.to_id=? AND m.read_at IS NULL AND ${VISIBLE_FOR}`, f.id, me.id, me.id).n;
    let preview = '';
    if (last) {
      const text = last.kind === 'game' ? `🎮 ${t('chat.inbox.sharedGame')}` : last.kind === 'quick' ? quickText(last.body, t) : last.body;
      preview = last.from_id === me.id ? t('chat.inbox.you', { text }) : text;
    }
    return { id: f.id, username: f.username, displayName: f.display_name, avatar: f.avatar, color: f.color, photo_at: f.photo_at, photo: photoUrl(f), chatOn: !!f.chat_enabled, last: last ? last.created_at : 0, preview, unread };
  });
  return rows.sort((a, b) => b.last - a.last || a.displayName.localeCompare(b.displayName));
}

export function block(me, otherId) {
  if (!otherId || otherId === me.id) return false;
  q.run('INSERT OR IGNORE INTO chat_blocks(user_id, blocked_id, created_at) VALUES (?,?,?)', me.id, otherId, now());
  // Nothing from a blocked person should keep a badge lit.
  q.run('UPDATE chat_messages SET read_at=? WHERE to_id=? AND from_id=? AND read_at IS NULL', now(), me.id, otherId);
  q.run('UPDATE chat_messages SET read_at=? WHERE to_id=? AND from_id=? AND read_at IS NULL', now(), otherId, me.id);
  audit(me.id, 'chat.block', otherId);
  return true;
}
export function unblock(me, otherId) {
  const n = q.run('DELETE FROM chat_blocks WHERE user_id=? AND blocked_id=?', me.id, otherId).changes;
  if (n) audit(me.id, 'chat.unblock', otherId);
  return n > 0;
}
export const blockedList = userId => q.all('SELECT u.id, u.username, u.display_name, u.avatar, u.color, u.photo_at FROM chat_blocks b JOIN users u ON u.id=b.blocked_id WHERE b.user_id=? ORDER BY b.created_at DESC', userId);

/** Report a message someone sent me. It disappears for me at once; admins see it in Chat reports. */
export function report(me, messageId, reason, t = tEn) {
  if (!REASON_KEYS.includes(reason)) return { ok: false, error: t('game.api.pickReason') };
  const m = q.get('SELECT * FROM chat_messages WHERE id=?', String(messageId || ''));
  if (!m || m.to_id !== me.id) return { ok: false, error: t('chat.errors.messageNotFound') };
  if (!q.get('SELECT 1 FROM chat_reports WHERE message_id=? AND reporter_id=?', m.id, me.id)) {
    q.run('INSERT INTO chat_reports(id, message_id, reporter_id, reason, status, created_at) VALUES (?,?,?,?,?,?)', uid(), m.id, me.id, reason, 'open', now());
    q.run('UPDATE chat_messages SET read_at=COALESCE(read_at, ?) WHERE id=?', now(), m.id);
    audit(me.id, 'chat.report', m.id, { reason, from: m.from_id });
  }
  return { ok: true, message: t('chat.report.thanks') };
}
