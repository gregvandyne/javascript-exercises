// Friends-only chat: inbox (/chat), thread (/chat/:username) and the polling APIs. All rules live in services/chat.js.
import { Router } from 'express';
import { html, jsonData } from '../views/html.js';
import { page, notFound } from '../views/layout.js';
import { avatar, emptyState } from '../views/components.js';
import { requireAccount, requireAnyAccount, getUserByName, isGrownup, OFFICIAL } from '../auth.js';
import * as team from '../services/team.js';
import { rateLimit } from '../services/ratelimit.js';
import * as chat from '../services/chat.js';
import * as games from '../services/games.js';
import { COMMUNITY_CSS } from './social.js';
import { tHtml } from '../i18n/index.js';
import { isSchoolStaff, noFriendsAccount } from '../services/schools.js';
/** The chat safety line: kids' words for kids; a teacher or grown-up reads one written for adults. */
const safetyKey = u => (isSchoolStaff(u) || noFriendsAccount(u) || isGrownup(u) ? 'chat.safety.staff' : 'chat.safety.text');

export const router = Router();

function guestPage(req, res) {
  const t = req.t;
  const body = html`<h1>${t('chat.title')}</h1>${emptyState({ emoji: '💬', title: t('chat.guest.title'), text: t('chat.guest.text'), action: { href: `/signup?next=${encodeURIComponent(req.originalUrl)}`, label: t('friends.needAccount.action') } })}
    ${!req.user ? html`<p class="center small">${t('auth.page.haveAccount')} <a href="/login?next=${encodeURIComponent(req.originalUrl)}">${t('auth.page.signInLink')}</a></p>` : ''}`;
  page(req, res, { title: t('chat.title'), active: 'friends', body, head: COMMUNITY_CSS });
}
/** The ✓ after the Oomba team's name (a real team account: nobody else can have this name or tick). */
export const verified = t => html`<span class="verified" title="${t('team.verified')}"><span aria-hidden="true">✓</span><span class="sr-only">${t('team.verified')}</span></span>`;
const inboxRow = (req, th) => { const t = req.t; return html`<li><a class="inboxrow ${th.unread ? 'unread' : ''}${th.team ? ' teamrow' : ''}" href="/chat/${th.username}" data-thread="${th.username}">
  ${avatar(th, 48)}<span class="who"><span class="nm">${th.displayName}${th.team ? verified(t) : ''}</span><span class="sub">${th.preview || (th.chatOn ? t('chat.inbox.sayHi') : t('chat.inbox.off'))}</span></span>
  <span class="meta">${th.last ? html`<span class="time">${req.fmt.ago(th.last)}</span>` : ''}${th.unread ? html`<span class="badge" aria-label="${t('layout.badgeNew', { count: th.unread })}">${th.unread > 9 ? '9+' : th.unread}</span>` : ''}</span></a></li>`; };

router.get('/chat', (req, res) => {
  const t = req.t;
  const u = req.user;
  if (!u || u.is_guest) return guestPage(req, res);
  const list = withTeam(u, t, chat.inbox(u, t));
  // Staff: this page is only their Oomba team inbox (no friends, no friends' chat: services/chat.js canChat).
  const staff = noFriendsAccount(u);
  const body = html`
  <div class="chatcol">
  <div class="pagehead"><h1>${t(staff ? 'team.name' : 'chat.title')}</h1>${staff ? '' : html`<a class="btn" href="/friends"><span aria-hidden="true">👫</span> ${t('nav.friends')}</a>`}</div>
  ${!staff && !u.chat_enabled ? html`<p class="notice warn">${tHtml(t, 'chat.offNotice', { link: html`<a href="/me">${t('nav.me')}</a>` })}</p>` : ''}
  <p class="notice small chatsafety"><span aria-hidden="true">🛡️</span> ${t(safetyKey(u))}</p>
  ${list.length ? html`<ul class="plain inbox panel" id="inbox" aria-label="${t('chat.inbox.label')}">${list.map(th => inboxRow(req, th))}</ul>`
    : staff ? emptyState({ emoji: '📬', title: t('team.name'), text: t('team.empty') })
    : emptyState({ emoji: '🤝', title: t('chat.inbox.emptyTitle'), text: t('chat.inbox.emptyText'), action: { href: '/friends', label: t('friends.add.heading') } })}
  </div>
  ${jsonData('page-data', { mode: 'inbox' })}`;
  page(req, res, { title: t(staff ? 'team.name' : 'chat.title'), active: staff ? 'me' : 'friends', body, head: COMMUNITY_CSS, scripts: ['/js/chat.js'] });
});

/** The inbox with the Oomba team's thread on top (when the team ever wrote). */
function withTeam(u, t, list) {
  const row = team.inboxRow(u, t, chat.present);
  return row ? [row, ...list] : list;
}

// ---- The Oomba team thread (services/team.js): every real account, grown-ups too (routes/family.js lets them in).
// No block, no game sharing; a child's messages here are also seen by their grown-up (said on the page).
function teamPage(req, res) {
  const t = req.t, u = req.user;
  if (!u || u.is_guest) return guestPage(req, res);
  const tu = team.teamUser();
  const msgs = chat.thread(u, tu, {}, t);
  chat.markRead(u, tu);
  const can = team.canReply(u, t);
  const child = team.isChild(u);
  const name = t('team.name');
  const max = child ? chat.MAX_LEN : team.MAX_TEAM_LEN;
  const body = html`
  <div class="chatpage teampage">
    <div class="threadhead">
      <span class="th-who">${avatar(tu, 44)}<span class="who"><span class="nm">${name}${verified(t)}</span><span class="sub">${t('team.sub')}</span></span></span>
    </div>
    <p class="notice small chatsafety"><span aria-hidden="true">🛡️</span> ${t(child ? 'team.safety.child' : 'team.safety.grownup')}</p>
    <div class="msgs" id="msgs" role="log" aria-live="polite" aria-label="${t('chat.thread.label', { name })}" tabindex="0">
      <p class="msgs-empty muted center" id="msgs-empty" ${msgs.length ? 'hidden' : ''}>${t('team.empty')}</p>
    </div>
    <div class="composer" id="composer" ${can.ok ? '' : 'hidden'}>
      ${child ? html`<div class="quick chips scroll" role="group" aria-label="${t('chat.thread.quickLabel')}">${chat.quickPhrases(t).map(([id, text]) => html`<button class="chip" type="button" data-quick="${id}">${text}</button>`)}</div>` : ''}
      <p class="notice warn small" id="pausednote" hidden></p>
      <form id="sendform" class="sendrow" novalidate>
        <label class="sr-only" for="msg">${t('chat.thread.messageTo', { name })}</label>
        <input class="input" id="msg" name="body" maxlength="${max}" dir="auto" autocomplete="off" placeholder="${t('chat.thread.placeholder')}" aria-describedby="msgcount sendmsg">
        <button class="btn btn-primary" type="submit">${t('chat.thread.send')}</button>
      </form>
      <div class="sendinfo"><span class="err" id="sendmsg" aria-live="polite"></span><span class="small muted" id="msgcount" dir="ltr">0/${max}</span></div>
    </div>
    <p class="notice cantchat" id="cantchat" ${can.ok ? 'hidden' : ''}>${can.reason}</p>
  </div>
  ${jsonData('page-data', { mode: 'thread', team: true, other: { id: tu.id, username: tu.username, displayName: name }, can, messages: msgs, paused: child ? chat.pausedUntil(u.id) : 0, games: [], reasons: chat.reportReasons(t), max, reportable: !isGrownup(u) })}`;
  const grown = isGrownup(u);
  page(req, res, { title: t('chat.thread.title', { name }), active: grown ? 'family' : 'friends', body, head: COMMUNITY_CSS, back: grown ? '/family' : '/chat', backLabel: grown ? t('nav.family') : t('chat.allChats'), bodyClass: 'chatmode', scripts: ['/js/chat.js'] });
}
router.get(`/chat/${OFFICIAL}`, teamPage);

router.get('/chat/:username', (req, res) => {
  const t = req.t;
  const u = req.user;
  if (!u || u.is_guest) return guestPage(req, res);
  // A staff account has no friends' threads at all: back to its team inbox, whoever was named.
  if (noFriendsAccount(u)) return res.redirect('/chat');
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
    <details class="chatsafety notice small" ${msgs.length ? '' : 'open'}><summary><span aria-hidden="true">🛡️</span> ${t('chat.safety.heading')}</summary><p>${t(safetyKey(u))}</p></details>
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
// The team thread's APIs come first (the username routes below are for friends only, and closed to grown-ups).
router.get(`/api/chat/${OFFICIAL}`, requireAnyAccount, poll, (req, res) => {
  const tu = team.teamUser();
  const messages = chat.thread(req.user, tu, { after: +req.query.after || 0 }, req.t);
  if (messages.length) chat.markRead(req.user, tu);
  res.set('Cache-Control', 'no-store').json({ messages, can: team.canReply(req.user, req.t), paused: team.isChild(req.user) ? chat.pausedUntil(req.user.id) : 0 });
});
router.post(`/api/chat/${OFFICIAL}`, requireAnyAccount, rateLimit('chatsend', 30, 60e3, 'chat.errors.rate'), (req, res) => {
  const { kind = 'text', body = '' } = req.body || {};
  const r = team.reply(req.user, { kind: String(kind), body: String(body ?? '') }, req.t);
  if (!r.ok) return res.status(r.code === 'rate' || r.code === 'daily' ? 429 : 400).json({ error: r.error, code: r.code, blocked: !!r.blocked, paused: r.paused ? r.until : 0 });
  res.json({ ok: true, message: chat.present(r.message, req.user, req.t) });
});
// Nobody blocks the team (a message from it can still be reported, like any other).
router.post([`/api/chat/${OFFICIAL}/block`, `/api/chat/${OFFICIAL}/unblock`], requireAnyAccount, (req, res) => res.status(400).json({ error: req.t('team.cant.block') }));
router.get('/api/chat', requireAccount, poll, (req, res) => {
  const threads = withTeam(req.user, req.t, chat.inbox(req.user, req.t));
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
  if (noFriendsAccount(req.user)) return res.status(403).json({ error: req.t('friends.staff.text'), code: 'staff' });
  const o = other(req, res); if (!o) return;
  chat.block(req.user, o.id);
  res.json({ ok: true, message: req.t('chat.blockedToast', { name: o.display_name }) });
});
router.post('/api/chat/:username/unblock', requireAccount, rateLimit('chatblock', 30, 60e3), (req, res) => {
  if (noFriendsAccount(req.user)) return res.status(403).json({ error: req.t('friends.staff.text'), code: 'staff' });
  const o = other(req, res); if (!o) return;
  chat.unblock(req.user, o.id);
  res.json({ ok: true, message: req.t('chat.unblockedToast', { name: o.display_name }) });
});
router.post('/api/chat/messages/:id/report', requireAccount, rateLimit('chatreport', 20, 3600e3), (req, res) => {
  const r = chat.report(req.user, req.params.id, String((req.body || {}).reason || ''), req.t);
  if (!r.ok) return res.status(400).json({ error: r.error });
  res.json(r);
});
