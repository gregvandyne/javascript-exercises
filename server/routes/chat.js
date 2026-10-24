// Friends-only chat: inbox (/chat), thread (/chat/:username) and the polling APIs. All rules live in services/chat.js.
import { Router } from 'express';
import { html, jsonData } from '../views/html.js';
import { page, notFound } from '../views/layout.js';
import { avatar, emptyState } from '../views/components.js';
import { requireAccount, getUserByName } from '../auth.js';
import { rateLimit } from '../services/ratelimit.js';
import * as chat from '../services/chat.js';
import * as games from '../services/games.js';
import { COMMUNITY_CSS } from './social.js';
import { tHtml } from '../i18n/index.js';

export const router = Router();

function guestPage(req, res) {
  const t = req.t;
  const body = html`<h1>${t('chat.title')}</h1>${emptyState({ emoji: '💬', title: t('chat.guest.title'), text: t('chat.guest.text'), action: { href: `/signup?next=${encodeURIComponent(req.originalUrl)}`, label: t('friends.needAccount.action') } })}
    ${!req.user ? html`<p class="center small">${t('auth.page.haveAccount')} <a href="/login?next=${encodeURIComponent(req.originalUrl)}">${t('auth.page.signInLink')}</a></p>` : ''}`;
  page(req, res, { title: t('chat.title'), active: 'friends', body, head: COMMUNITY_CSS });
}
const inboxRow = (req, th) => { const t = req.t; return html`<li><a class="inboxrow ${th.unread ? 'unread' : ''}" href="/chat/${th.username}" data-thread="${th.username}">
  ${avatar(th, 48)}<span class="who"><span class="nm">${th.displayName}</span><span class="sub">${th.preview || (th.chatOn ? t('chat.inbox.sayHi') : t('chat.inbox.off'))}</span></span>
  <span class="meta">${th.last ? html`<span class="time">${req.fmt.ago(th.last)}</span>` : ''}${th.unread ? html`<span class="badge" aria-label="${t('layout.badgeNew', { count: th.unread })}">${th.unread > 9 ? '9+' : th.unread}</span>` : ''}</span></a></li>`; };

router.get('/chat', (req, res) => {
  const t = req.t;
  const u = req.user;
  if (!u || u.is_guest) return guestPage(req, res);
  const list = chat.inbox(u, t);
  const body = html`
  <div class="chatcol">
  <div class="pagehead"><h1>${t('chat.title')}</h1><a class="btn" href="/friends"><span aria-hidden="true">👫</span> ${t('nav.friends')}</a></div>
  ${!u.chat_enabled ? html`<p class="notice warn">${tHtml(t, 'chat.offNotice', { link: html`<a href="/me">${t('nav.me')}</a>` })}</p>` : ''}
  <p class="notice small chatsafety"><span aria-hidden="true">🛡️</span> ${t('chat.safety.text')}</p>
  ${list.length ? html`<ul class="plain inbox panel" id="inbox" aria-label="${t('chat.inbox.label')}">${list.map(th => inboxRow(req, th))}</ul>`
    : emptyState({ emoji: '🤝', title: t('chat.inbox.emptyTitle'), text: t('chat.inbox.emptyText'), action: { href: '/friends', label: t('friends.add.heading') } })}
  </div>
  ${jsonData('page-data', { mode: 'inbox' })}`;
  page(req, res, { title: t('chat.title'), active: 'friends', body, head: COMMUNITY_CSS, scripts: ['/js/chat.js'] });
});

router.get('/chat/:username', (req, res) => {
  const t = req.t;
  const u = req.user;
  if (!u || u.is_guest) return guestPage(req, res);
  const other = getUserByName(req.params.username);
  if (!other || other.banned || other.id === u.id) return notFound(req, res, t('chat.notFound'));
  const can = chat.canChat(u, other, t);
  const blockedByMe = chat.isBlocked(u.id, other.id);
  const msgs = can.ok || can.code === 'chat_off_me' || can.code === 'chat_off_other' ? chat.thread(u, other, {}, t) : [];
  chat.markRead(u, other);
  const paused = chat.pausedUntil(u.id);
  const shareable = can.ok ? games.listVisible(u, { limit: 60, order: 'popular' }).filter(g => games.canView(other, g)).slice(0, 30).map(g => ({ id: g.id, title: g.title, icon: g.icon, cover: g.cover, mine: g.owner_id === u.id })) : [];
  const name = other.display_name;
  const body = html`
  <div class="chatpage">
    <div class="threadhead">
      <a class="th-who" href="/u/${other.username}">${avatar(other, 44)}<span class="who"><span class="nm">${name}</span><span class="sub"><bdi>@${other.username}</bdi></span></span></a>
      ${blockedByMe ? html`<button class="btn" type="button" id="unblockbtn">${t('friends.blocked.unblock')}</button>`
        : can.code !== 'not_friends' ? html`<button class="btn btn-ghost btn-danger" type="button" id="blockbtn"><span aria-hidden="true">🚫</span> ${t('chat.block')}</button>` : ''}
    </div>
    <details class="chatsafety notice small" ${msgs.length ? '' : 'open'}><summary><span aria-hidden="true">🛡️</span> ${t('chat.safety.heading')}</summary><p>${t('chat.safety.text')}</p></details>
    <div class="msgs" id="msgs" role="log" aria-live="polite" aria-label="${t('chat.thread.label', { name })}" tabindex="0">
      <p class="msgs-empty muted center" id="msgs-empty" ${msgs.length ? 'hidden' : ''}>${t('chat.thread.empty')}</p>
    </div>
    <div class="composer" id="composer" ${can.ok ? '' : 'hidden'}>
      <div class="quick chips scroll" role="group" aria-label="${t('chat.thread.quickLabel')}">${chat.quickPhrases(t).map(([id, text]) => html`<button class="chip" type="button" data-quick="${id}">${text}</button>`)}</div>
      <p class="notice warn small" id="pausednote" ${paused ? '' : 'hidden'}></p>
      <form id="sendform" class="sendrow" novalidate>
        <button class="iconbtn sharegame" type="button" id="sharegame" aria-label="${t('chat.thread.shareGame')}" ${shareable.length ? '' : 'disabled'}><span class="emo" aria-hidden="true">🎮</span><span>${t('chat.thread.game')}</span></button>
        <label class="sr-only" for="msg">${t('chat.thread.messageTo', { name })}</label>
        <input class="input" id="msg" name="body" maxlength="200" dir="auto" autocomplete="off" placeholder="${t('chat.thread.placeholder')}" aria-describedby="msgcount sendmsg">
        <button class="btn btn-primary" type="submit">${t('chat.thread.send')}</button>
      </form>
      <div class="sendinfo"><span class="err" id="sendmsg" aria-live="polite"></span><span class="small muted" id="msgcount" dir="ltr">0/200</span></div>
    </div>
    <p class="notice cantchat" id="cantchat" ${can.ok ? 'hidden' : ''}>${can.reason}${can.code === 'not_friends' ? html` <a href="/friends">${t('chat.goToFriends')}</a>` : ''}</p>
  </div>
  ${jsonData('page-data', { mode: 'thread', other: { id: other.id, username: other.username, displayName: name }, can, messages: msgs, paused, games: shareable, reasons: chat.reportReasons(t), max: chat.MAX_LEN })}`;
  page(req, res, { title: t('chat.thread.title', { name }), active: 'friends', body, head: COMMUNITY_CSS, back: '/chat', backLabel: t('chat.allChats'), bodyClass: 'chatmode', scripts: ['/js/chat.js'] });
});

// ---- APIs ----
const poll = rateLimit('chatpoll', 150, 60e3);
router.get('/api/chat', requireAccount, poll, (req, res) => {
  const threads = chat.inbox(req.user, req.t);
  res.set('Cache-Control', 'no-store').json({ threads, unread: threads.reduce((s, th) => s + th.unread, 0) });
});
function other(req, res) {
  const o = getUserByName(req.params.username);
  if (!o || o.banned || o.id === req.user.id) { res.status(404).json({ error: req.t('chat.notFound') }); return null; }
  return o;
}
router.get('/api/chat/:username', requireAccount, poll, (req, res) => {
  const o = other(req, res); if (!o) return;
  const can = chat.canChat(req.user, o, req.t);
  const messages = can.ok || can.code === 'chat_off_me' || can.code === 'chat_off_other' ? chat.thread(req.user, o, { after: +req.query.after || 0 }, req.t) : [];
  if (messages.length) chat.markRead(req.user, o);
  res.set('Cache-Control', 'no-store').json({ messages, can, paused: chat.pausedUntil(req.user.id) });
});
router.post('/api/chat/:username', requireAccount, rateLimit('chatsend', 30, 60e3, 'chat.errors.rate'), (req, res) => {
  const o = other(req, res); if (!o) return;
  const { kind = 'text', body = '' } = req.body || {};
  const r = chat.send(req.user, o, { kind: String(kind), body: String(body ?? '') }, req.t);
  if (!r.ok) return res.status(r.code === 'rate' || r.code === 'daily' ? 429 : 400).json({ error: r.error, code: r.code, blocked: !!r.blocked, paused: r.paused ? r.until : 0 });
  res.json({ ok: true, message: r.message });
});
router.post('/api/chat/:username/block', requireAccount, rateLimit('chatblock', 30, 60e3), (req, res) => {
  const o = other(req, res); if (!o) return;
  chat.block(req.user, o.id);
  res.json({ ok: true, message: req.t('chat.blockedToast', { name: o.display_name }) });
});
router.post('/api/chat/:username/unblock', requireAccount, rateLimit('chatblock', 30, 60e3), (req, res) => {
  const o = other(req, res); if (!o) return;
  chat.unblock(req.user, o.id);
  res.json({ ok: true, message: req.t('chat.unblockedToast', { name: o.display_name }) });
});
router.post('/api/chat/messages/:id/report', requireAccount, rateLimit('chatreport', 20, 3600e3), (req, res) => {
  const r = chat.report(req.user, req.params.id, String((req.body || {}).reason || ''), req.t);
  if (!r.ok) return res.status(400).json({ error: r.error });
  res.json(r);
});
