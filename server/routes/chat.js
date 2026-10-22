// Friends-only chat: inbox (/chat), thread (/chat/:username) and the polling APIs. All rules live in services/chat.js.
import { Router } from 'express';
import { html, jsonData, timeAgo } from '../views/html.js';
import { page, notFound } from '../views/layout.js';
import { avatar, emptyState } from '../views/components.js';
import { requireAccount, getUserByName } from '../auth.js';
import { rateLimit } from '../services/ratelimit.js';
import * as chat from '../services/chat.js';
import * as games from '../services/games.js';
import { COMMUNITY_CSS } from './social.js';

export const router = Router();
const SAFETY = 'Only chat with friends you know in real life. Never share your address, school or phone number. Tell a grown-up if something feels wrong.';

function guestPage(req, res) {
  const body = html`<h1>Chat</h1>${emptyState({ emoji: '💬', title: 'Make a free account to chat', text: 'Chat is only with friends you add by friend code. It needs a free account: just a name and a password, no email.', action: { href: `/signup?next=${encodeURIComponent(req.originalUrl)}`, label: 'Make a free account' } })}
    ${!req.user ? html`<p class="center small">Have an account? <a href="/login?next=${encodeURIComponent(req.originalUrl)}">Sign in</a></p>` : ''}`;
  page(req, res, { title: 'Chat', active: 'friends', body, head: COMMUNITY_CSS });
}
const inboxRow = t => html`<li><a class="inboxrow ${t.unread ? 'unread' : ''}" href="/chat/${t.username}" data-thread="${t.username}">
  ${avatar(t, 48)}<span class="who"><span class="nm">${t.displayName}</span><span class="sub">${t.preview || (t.chatOn ? 'Say hi! 👋' : 'Chat is switched off')}</span></span>
  <span class="meta">${t.last ? html`<span class="time">${timeAgo(t.last)}</span>` : ''}${t.unread ? html`<span class="badge" aria-label="${t.unread} new">${t.unread > 9 ? '9+' : t.unread}</span>` : ''}</span></a></li>`;

router.get('/chat', (req, res) => {
  const u = req.user;
  if (!u || u.is_guest) return guestPage(req, res);
  const list = chat.inbox(u);
  const body = html`
  <div class="pagehead"><h1>Chat</h1><a class="btn" href="/friends"><span aria-hidden="true">👫</span> Friends</a></div>
  ${!u.chat_enabled ? html`<p class="notice warn">Your chat is switched off. A grown-up can switch it on in <a href="/me">Me</a>.</p>` : ''}
  <p class="notice small chatsafety"><span aria-hidden="true">🛡️</span> ${SAFETY}</p>
  ${list.length ? html`<ul class="plain inbox panel" id="inbox" aria-label="Chats with friends">${list.map(inboxRow)}</ul>`
    : emptyState({ emoji: '🤝', title: 'No friends to chat with yet', text: 'You can only chat with friends. Swap friend codes with someone you know in real life.', action: { href: '/friends', label: 'Add a friend' } })}
  ${jsonData('page-data', { mode: 'inbox' })}`;
  page(req, res, { title: 'Chat', active: 'friends', body, head: COMMUNITY_CSS, scripts: ['/js/chat.js'] });
});

router.get('/chat/:username', (req, res) => {
  const u = req.user;
  if (!u || u.is_guest) return guestPage(req, res);
  const other = getUserByName(req.params.username);
  if (!other || other.banned || other.id === u.id) return notFound(req, res, "We couldn't find that chat.");
  const can = chat.canChat(u, other);
  const blockedByMe = chat.isBlocked(u.id, other.id);
  const msgs = can.ok || can.code === 'chat_off_me' || can.code === 'chat_off_other' ? chat.thread(u, other) : [];
  chat.markRead(u, other);
  const paused = chat.pausedUntil(u.id);
  const shareable = can.ok ? games.listVisible(u, { limit: 60, order: 'popular' }).filter(g => games.canView(other, g)).slice(0, 30).map(g => ({ id: g.id, title: g.title, icon: g.icon, cover: g.cover, mine: g.owner_id === u.id })) : [];
  const body = html`
  <div class="chatpage">
    <div class="threadhead">
      <a class="th-who" href="/u/${other.username}">${avatar(other, 44)}<span class="who"><span class="nm">${other.display_name}</span><span class="sub">@${other.username}</span></span></a>
      ${blockedByMe ? html`<button class="btn" type="button" id="unblockbtn">Unblock</button>`
        : can.code !== 'not_friends' ? html`<button class="btn btn-ghost btn-danger" type="button" id="blockbtn"><span aria-hidden="true">🚫</span> Block</button>` : ''}
    </div>
    <details class="chatsafety notice small" ${msgs.length > 6 ? '' : 'open'}><summary><span aria-hidden="true">🛡️</span> Chat safety</summary><p>${SAFETY}</p></details>
    <div class="msgs" id="msgs" role="log" aria-live="polite" aria-label="Messages with ${other.display_name}" tabindex="0">
      <p class="msgs-empty muted center" id="msgs-empty" ${msgs.length ? 'hidden' : ''}>No messages yet. Say hi with a quick message! 👋</p>
    </div>
    <div class="composer" id="composer" ${can.ok ? '' : 'hidden'}>
      <div class="quick chips scroll" role="group" aria-label="Quick messages">${chat.QUICK.map(t => html`<button class="chip" type="button" data-quick="${t}">${t}</button>`)}</div>
      <p class="notice warn small" id="pausednote" ${paused ? '' : 'hidden'}></p>
      <form id="sendform" class="sendrow" novalidate>
        <button class="iconbtn sharegame" type="button" id="sharegame" aria-label="Share a game" ${shareable.length ? '' : 'disabled'}><span class="emo" aria-hidden="true">🎮</span><span>Game</span></button>
        <label class="sr-only" for="msg">Message to ${other.display_name}</label>
        <input class="input" id="msg" name="body" maxlength="200" autocomplete="off" placeholder="Type a message" aria-describedby="msgcount sendmsg">
        <button class="btn btn-primary" type="submit">Send</button>
      </form>
      <div class="sendinfo"><span class="err" id="sendmsg" aria-live="polite"></span><span class="small muted" id="msgcount">0/200</span></div>
    </div>
    <p class="notice cantchat" id="cantchat" ${can.ok ? 'hidden' : ''}>${can.reason}${can.code === 'not_friends' ? html` <a href="/friends">Go to Friends</a>` : ''}</p>
  </div>
  ${jsonData('page-data', { mode: 'thread', other: { id: other.id, username: other.username, displayName: other.display_name }, can, messages: msgs, paused, games: shareable, reasons: chat.REPORT_REASONS, max: chat.MAX_LEN })}`;
  page(req, res, { title: `Chat with ${other.display_name}`, active: 'friends', body, head: COMMUNITY_CSS, back: '/chat', backLabel: 'All chats', bodyClass: 'chatmode', scripts: ['/js/chat.js'] });
});

// ---- APIs ----
const poll = rateLimit('chatpoll', 150, 60e3);
router.get('/api/chat', requireAccount, poll, (req, res) => {
  const threads = chat.inbox(req.user);
  res.set('Cache-Control', 'no-store').json({ threads, unread: threads.reduce((s, t) => s + t.unread, 0) });
});
function other(req, res) {
  const o = getUserByName(req.params.username);
  if (!o || o.banned || o.id === req.user.id) { res.status(404).json({ error: "We couldn't find that chat." }); return null; }
  return o;
}
router.get('/api/chat/:username', requireAccount, poll, (req, res) => {
  const o = other(req, res); if (!o) return;
  const can = chat.canChat(req.user, o);
  const messages = can.ok || can.code === 'chat_off_me' || can.code === 'chat_off_other' ? chat.thread(req.user, o, { after: +req.query.after || 0 }) : [];
  if (messages.length) chat.markRead(req.user, o);
  res.set('Cache-Control', 'no-store').json({ messages, can, paused: chat.pausedUntil(req.user.id) });
});
router.post('/api/chat/:username', requireAccount, rateLimit('chatsend', 30, 60e3, 'Whoa, that is a lot of messages! Wait a few seconds.'), (req, res) => {
  const o = other(req, res); if (!o) return;
  const { kind = 'text', body = '' } = req.body || {};
  const r = chat.send(req.user, o, { kind: String(kind), body: String(body ?? '') });
  if (!r.ok) return res.status(r.code === 'rate' || r.code === 'daily' ? 429 : 400).json({ error: r.error, code: r.code, blocked: !!r.blocked, paused: r.paused ? r.until : 0 });
  res.json({ ok: true, message: r.message });
});
router.post('/api/chat/:username/block', requireAccount, rateLimit('chatblock', 30, 60e3), (req, res) => {
  const o = other(req, res); if (!o) return;
  chat.block(req.user, o.id);
  res.json({ ok: true, message: `${o.display_name} is blocked. You won't see their messages.` });
});
router.post('/api/chat/:username/unblock', requireAccount, rateLimit('chatblock', 30, 60e3), (req, res) => {
  const o = other(req, res); if (!o) return;
  chat.unblock(req.user, o.id);
  res.json({ ok: true, message: `${o.display_name} is unblocked.` });
});
router.post('/api/chat/messages/:id/report', requireAccount, rateLimit('chatreport', 20, 3600e3), (req, res) => {
  const r = chat.report(req.user, req.params.id, String((req.body || {}).reason || ''));
  if (!r.ok) return res.status(400).json({ error: r.error });
  res.json(r);
});
