// Friends page + friend APIs, and public profiles (/u/:username).
// Kids' safety: friends are added only by friend code. There is no endpoint that searches people by name,
// and nobody's friend list is ever shown to anyone else.
import { Router } from 'express';
import { html, raw, jsonData } from '../views/html.js';
import { page, notFound } from '../views/layout.js';
import { avatar, cardGrid, emptyState } from '../views/components.js';
import { requireAccount, getUserByName, getUser } from '../auth.js';
import { rateLimit } from '../services/ratelimit.js';
import * as friends from '../services/friends.js';
import * as chat from '../services/chat.js';
import * as games from '../services/games.js';
import * as presence from '../services/presence.js';
import { q } from '../db.js';
import { tEn, tHtml } from '../i18n/index.js';

export const router = Router();
export const COMMUNITY_CSS = raw('<link rel="stylesheet" href="/css/community.css">');

/** What each friend is playing right now, only if the viewer may see that game. */
export function playingFor(viewer, ids) {
  const map = presence.playingByUser(ids); const out = {};
  for (const [uidKey, gid] of Object.entries(map)) {
    const g = games.getGame(gid);
    if (g && games.canView(viewer, g)) out[uidKey] = { id: g.id, slug: g.slug, title: g.title, icon: g.icon };
  }
  return out;
}
const miniGame = g => html`<a class="minigame" href="/g/${g.slug}"><span class="mg-art cover-${g.cover || 'sunset'}" aria-hidden="true">${g.icon}</span><span class="mg-t">${g.title}</span></a>`;
const playingLine = (t, p) => (p ? html`<a class="playing" href="/g/${p.slug}"><span class="dot" aria-hidden="true"></span>${t('friends.playing', { game: `${p.icon} ${p.title}` })}</a>` : html`<span class="sub">${t('friends.notPlaying')}</span>`);
const at = u => html`<bdi>@${u.username}</bdi>`;

function needAccountPage(req, res, { title, emoji, text, active }) {
  const t = req.t;
  const body = html`<h1>${title}</h1>${emptyState({ emoji, title: t('friends.needAccount.title'), text, action: { href: `/signup?next=${encodeURIComponent(req.originalUrl)}`, label: req.user ? t('friends.needAccount.actionGuest') : t('friends.needAccount.action') } })}
    ${!req.user ? html`<p class="center small">${t('auth.page.haveAccount')} <a href="/login?next=${encodeURIComponent(req.originalUrl)}">${t('auth.page.signInLink')}</a></p>` : html`<p class="center small muted">${t('friends.needAccount.guestNote')}</p>`}`;
  page(req, res, { title, active, body, head: COMMUNITY_CSS });
}

router.get('/friends', (req, res) => {
  const t = req.t, f = req.fmt;
  const u = req.user;
  if (!u || u.is_guest) return needAccountPage(req, res, { title: t('friends.title'), emoji: '👫', text: t('friends.needAccount.text'), active: 'friends' });
  const inc = friends.incoming(u.id), out = friends.outgoing(u.id), mine = friends.list(u.id), blocked = chat.blockedList(u.id);
  const playing = playingFor(u, mine.map(fr => fr.id));
  const shared = Object.fromEntries(mine.map(fr => [fr.id, games.listVisible(u, { ownerId: fr.id, limit: 8, order: 'new' })]));
  const body = html`
  <div class="pagehead"><h1>${t('friends.title')}</h1><a class="btn" href="/chat"><span aria-hidden="true">💬</span> ${t('friends.chat')}</a></div>
  <div class="friends-top">
    <section class="panel" aria-labelledby="code-h">
      <h2 id="code-h">${t('friends.code.heading')}</h2>
      <div class="row"><span class="bigcode" id="mycode" dir="ltr">${u.friend_code}</span><button class="btn btn-primary" type="button" id="copycode" data-code="${u.friend_code}"><span aria-hidden="true">📋</span> ${t('friends.code.copy')}</button></div>
      <p class="muted small" style="margin:12px 0 0">${t('friends.code.hint')}</p>
    </section>
    <section class="panel" aria-labelledby="add-h">
      <h2 id="add-h">${t('friends.add.heading')}</h2>
      <form id="addform" novalidate>
        <div class="field"><label for="code">${t('friends.add.label')}</label>
          <div class="row nowrap"><input class="input codeinput" id="code" name="code" dir="ltr" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="12" placeholder="ABC123" aria-describedby="code-err code-hint">
          <button class="btn btn-primary" type="submit">${t('friends.add.button')}</button></div>
          <span class="hint" id="code-hint">${t('friends.add.hint')}</span>
          <span class="err" id="code-err" aria-live="polite"></span></div>
      </form>
    </section>
  </div>
  ${inc.length ? html`<section class="panel reqs" aria-labelledby="inc-h"><h2 id="inc-h">${t('friends.requests.heading')} <span class="badge">${inc.length}</span></h2>
    <ul class="plain">${inc.map(fr => html`<li class="reqrow">${avatar(fr, 44)}<span class="who"><span class="nm">${fr.display_name}</span><span class="sub">${at(fr)} · ${f.ago(fr.created_at)}</span></span>
      <span class="acts"><button class="btn btn-primary" type="button" data-act="accept" data-id="${fr.id}" data-name="${fr.display_name}">${t('friends.requests.accept')}</button><button class="btn" type="button" data-act="decline" data-id="${fr.id}" data-name="${fr.display_name}">${t('friends.requests.decline')}</button></span></li>`)}</ul></section>` : ''}
  ${out.length ? html`<section class="panel reqs" aria-labelledby="out-h"><h2 id="out-h">${t('friends.waiting.heading')}</h2>
    <ul class="plain">${out.map(fr => html`<li class="reqrow">${avatar(fr, 44)}<span class="who"><span class="nm">${fr.display_name}</span><span class="sub">${t('friends.waiting.asked', { when: f.ago(fr.created_at) })}</span></span>
      <span class="acts"><button class="btn" type="button" data-act="cancel" data-id="${fr.id}" data-name="${fr.display_name}">${t('friends.waiting.cancel')}</button></span></li>`)}</ul></section>` : ''}
  <section aria-labelledby="fr-h" style="margin-top:24px">
    <h2 id="fr-h">${t('friends.list.heading')}${mine.length ? html` <span class="muted">(${f.int(mine.length)})</span>` : ''}</h2>
    ${mine.length ? html`<div class="friendgrid">${mine.map(fr => html`<article class="panel friendcard" aria-label="${fr.display_name}">
      <div class="fc-head">
        <a href="/u/${fr.username}" class="fc-who">${avatar(fr, 52)}<span class="who"><span class="nm">${fr.display_name}</span><span class="sub">${at(fr)}</span></span></a>
      </div>
      <div class="fc-playing" data-playing="${fr.id}">${playingLine(t, playing[fr.id])}</div>
      <div class="fc-acts"><a class="btn btn-primary" href="/chat/${fr.username}"><span aria-hidden="true">💬</span> ${t('friends.chat')}</a><a class="btn" href="/u/${fr.username}">${t('friends.list.profile')}</a>
        <button class="btn btn-ghost" type="button" data-act="remove" data-id="${fr.id}" data-name="${fr.display_name}">${t('friends.list.remove')}</button></div>
      ${shared[fr.id].length ? html`<div class="fc-games"><h3 class="small muted">${t('friends.list.shared', { name: fr.display_name })}</h3><div class="minigames">${shared[fr.id].map(miniGame)}</div></div>` : ''}
    </article>`)}</div>`
    : emptyState({ emoji: '🤝', title: t('friends.list.emptyTitle'), text: t('friends.list.emptyText') })}
  </section>
  ${blocked.length ? html`<section class="panel" aria-labelledby="bl-h" style="margin-top:24px"><h2 id="bl-h">${t('friends.blocked.heading')}</h2>
    <p class="muted small">${t('friends.blocked.text')}</p>
    <ul class="plain">${blocked.map(b => html`<li class="reqrow">${avatar(b, 40)}<span class="who"><span class="nm">${b.display_name}</span><span class="sub">${at(b)}</span></span>
      <span class="acts"><button class="btn" type="button" data-act="unblock" data-id="${b.id}" data-username="${b.username}" data-name="${b.display_name}">${t('friends.blocked.unblock')}</button></span></li>`)}</ul></section>` : ''}
  ${jsonData('page-data', { friendIds: mine.map(fr => fr.id) })}`;
  page(req, res, { title: t('friends.title'), active: 'friends', body, head: COMMUNITY_CSS, scripts: ['/js/friends.js'] });
});

// ---- APIs (accounts only) ----
router.get('/api/friends', requireAccount, (req, res) => {
  const mine = friends.list(req.user.id);
  const playing = playingFor(req.user, mine.map(f => f.id));
  res.set('Cache-Control', 'no-store').json({
    code: req.user.friend_code,
    friends: mine.map(f => ({ id: f.id, username: f.username, displayName: f.display_name, avatar: f.avatar, color: f.color, playing: playing[f.id] || null })),
    incoming: friends.incoming(req.user.id).map(f => ({ id: f.id, username: f.username, displayName: f.display_name })),
    outgoing: friends.outgoing(req.user.id).map(f => ({ id: f.id, username: f.username, displayName: f.display_name })),
  });
});
router.post('/api/friends/add', requireAccount, rateLimit('friendcode', 15, 600e3, 'friends.api.tooManyTries'), (req, res) => {
  const r = friends.addByCode(req.user, (req.body || {}).code, req.t);
  if (!r.ok) return res.status(400).json({ error: r.error, field: 'code' });
  res.json({ ok: true, state: r.state, message: r.message });
});
const act = (fn, okKey) => (req, res) => {
  const other = getUser(req.params.id);
  if (!other || !fn(req.user, other.id)) return res.status(404).json({ error: req.t('friends.api.gone') });
  res.json({ ok: true, message: req.t(okKey, { name: other.display_name }) });
};
router.post('/api/friends/:id/accept', requireAccount, rateLimit('friendact', 60, 60e3), act(friends.accept, 'friends.api.accepted'));
router.post('/api/friends/:id/decline', requireAccount, rateLimit('friendact', 60, 60e3), act(friends.decline, 'friends.api.declined'));
router.post('/api/friends/:id/cancel', requireAccount, rateLimit('friendact', 60, 60e3), act(friends.cancel, 'friends.api.canceled'));
router.post('/api/friends/:id/remove', requireAccount, rateLimit('friendact', 60, 60e3), act(friends.unfriend, 'friends.api.removed'));

// ---- Profiles ----
const BADGES = [
  ['builder', '🛠️'],
  ['hit', '🌟'],
  ['top', '🏆'],
  ['player', '🎮'],
  ['friendly', '👫'],
];
export function profileBadges(user, visibleGames, t = tEn) {
  const has = {
    builder: visibleGames.length > 0,
    hit: visibleGames.some(g => g.plays >= 100),
    top: visibleGames.some(g => g.rating_count >= 5 && g.rating_sum / g.rating_count >= 4.5),
    player: q.get('SELECT COUNT(DISTINCT game_id) n FROM plays WHERE user_id=?', user.id).n >= 10,
    friendly: friends.count(user.id) >= 3,
  };
  return BADGES.filter(([k]) => has[k]).map(([key, emoji]) => ({ key, emoji, label: t(`profile.badges.${key}.label`), why: t(`profile.badges.${key}.why`) }));
}
export const favouriteGames = (viewer, userId, limit = 12) => games.favorites(viewer, userId, limit);

router.get('/u/:username', (req, res) => {
  const t = req.t, f = req.fmt;
  const p = getUserByName(req.params.username);
  if (!p || p.banned) return notFound(req, res, t('profile.notFound'));
  const viewer = req.user;
  if (p.is_guest) {
    const body = html`<div class="empty">${avatar(p, 96)}<h1 style="margin-top:12px">${p.display_name}</h1><p class="muted">${t('profile.guest.tag')}</p><p>${t('profile.guest.text')}</p><a class="btn btn-primary" href="/">${t('profile.guest.action')}</a></div>`;
    return page(req, res, { title: p.display_name, active: viewer && viewer.id === p.id ? 'me' : null, body, head: COMMUNITY_CSS });
  }
  const built = games.listVisible(viewer, { ownerId: p.id, limit: 60, order: 'popular' });
  const favs = favouriteGames(viewer, p.id);
  const badges = profileBadges(p, built, t);
  const stats = { games: built.length, plays: built.reduce((s, g) => s + g.plays, 0), likes: built.reduce((s, g) => s + g.likes, 0) };
  const isMe = viewer && viewer.id === p.id;
  const rel = viewer && !isMe ? friends.status(viewer.id, p.id) : 'none';
  const can = rel === 'friends' ? chat.canChat(viewer, p, t) : null;
  const body = html`
  <div class="profilehead panel">
    ${avatar(p, 96)}
    <div class="ph-main">
      <h1>${p.display_name}</h1>
      <div class="muted">${at(p)}${p.role === 'admin' ? ` · 🛡️ ${t('profile.team')}` : ''}${rel === 'friends' ? ` · 👫 ${t('profile.yourFriend')}` : ''}</div>
      ${p.bio ? html`<p class="small" style="margin:6px 0 0">${p.bio}</p>` : ''}
      ${badges.length ? html`<ul class="badgelist" aria-label="${t('profile.badgesLabel')}">${badges.map(b => html`<li class="pbadge" title="${b.why}"><span aria-hidden="true">${b.emoji}</span> ${b.label}<span class="sr-only">: ${b.why}</span></li>`)}</ul>` : ''}
    </div>
    <div class="ph-acts">
      ${isMe ? html`<a class="btn" href="/me">✏️ ${t('profile.changeLook')}</a>` : ''}
      <button class="btn" type="button" id="shareprofile" data-url="/u/${p.username}"><span aria-hidden="true">🔗</span> ${t('game.share')}</button>
      ${rel === 'friends' ? (can.ok ? html`<a class="btn btn-primary" href="/chat/${p.username}"><span aria-hidden="true">💬</span> ${t('friends.chat')}</a>` : html`<span class="small muted">${can.reason}</span>`) : ''}
      ${rel === 'received' ? html`<a class="btn btn-primary" href="/friends">${t('profile.answerRequest')}</a>` : ''}
      ${rel === 'sent' ? html`<span class="small muted">${t('profile.requestSent')}</span>` : ''}
    </div>
  </div>
  ${isMe ? html`<p class="notice small" style="margin-top:12px">${t('profile.yourProfile')}</p>` : ''}
  <div class="statrow pstats" aria-label="${t('profile.statsLabel')}">
    <div class="stat"><b>${f.num(stats.games)}</b>${t('profile.stats.games', { count: stats.games })}</div>
    <div class="stat"><b>${f.num(stats.plays)}</b>${t('game.stats.plays', { count: stats.plays })}</div>
    <div class="stat"><b>${f.num(stats.likes)}</b>${t('game.stats.likes', { count: stats.likes })}</div>
  </div>
  <section aria-labelledby="built-h"><h2 id="built-h">🛠️ ${t('profile.gamesBy', { name: p.display_name })}</h2>
    ${built.length ? cardGrid(built, { ads: false }) : emptyState({ emoji: '🧱', title: t('profile.noGames'), text: isMe ? t('profile.noGamesMe') : '', action: isMe ? { href: '/build', label: t('home.empty.action') } : null })}
  </section>
  <section aria-labelledby="fav-h" style="margin-top:28px"><h2 id="fav-h">❤️ ${t('profile.favorites')}</h2>
    ${favs.length ? cardGrid(favs, { ads: false }) : html`<p class="muted">${t('profile.noFavorites')}</p>`}
  </section>
  ${!isMe && viewer && !viewer.is_guest && rel === 'none' ? html`<p class="small muted" style="margin-top:24px">${tHtml(t, 'profile.beFriends', { link: html`<a href="/friends">${t('nav.friends')}</a>` })}</p>` : ''}`;
  page(req, res, { title: p.display_name, active: isMe ? 'me' : null, body, head: COMMUNITY_CSS, back: '/', backLabel: t('nav.home'), description: t('profile.description', { name: p.display_name }), scripts: ['/js/profile.js'] });
});
