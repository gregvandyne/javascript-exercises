// Friends page + friend APIs, and public profiles (/u/:username).
// Kids' safety: friends are added only by friend code. There is no endpoint that searches people by name,
// and nobody's friend list is ever shown to anyone else.
import { Router } from 'express';
import { html, raw, jsonData, fmtNum, timeAgo } from '../views/html.js';
import { page, notFound } from '../views/layout.js';
import { avatar, cardGrid, emptyState } from '../views/components.js';
import { requireAccount, getUserByName, getUser } from '../auth.js';
import { rateLimit } from '../services/ratelimit.js';
import * as friends from '../services/friends.js';
import * as chat from '../services/chat.js';
import * as games from '../services/games.js';
import * as presence from '../services/presence.js';
import { q } from '../db.js';

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
const playingLine = p => (p ? html`<a class="playing" href="/g/${p.slug}"><span class="dot" aria-hidden="true"></span>Playing ${p.icon} ${p.title}</a>` : html`<span class="sub">Not playing right now</span>`);

function needAccountPage(req, res, { title, emoji, text, active }) {
  const body = html`<h1>${title}</h1>${emptyState({ emoji, title: 'Make a free account to add friends', text, action: { href: `/signup?next=${encodeURIComponent(req.originalUrl)}`, label: req.user ? 'Make my free account' : 'Make a free account' } })}
    ${!req.user ? html`<p class="center small">Have an account? <a href="/login?next=${encodeURIComponent(req.originalUrl)}">Sign in</a></p>` : html`<p class="center small muted">Guests can play every game. Your progress comes with you when you make an account.</p>`}`;
  page(req, res, { title, active, body, head: COMMUNITY_CSS });
}

router.get('/friends', (req, res) => {
  const u = req.user;
  if (!u || u.is_guest) return needAccountPage(req, res, { title: 'Friends', emoji: '👫', text: 'Friends and chat need a free account. It only takes a name and a password, no email.', active: 'friends' });
  const inc = friends.incoming(u.id), out = friends.outgoing(u.id), mine = friends.list(u.id), blocked = chat.blockedList(u.id);
  const playing = playingFor(u, mine.map(f => f.id));
  const shared = Object.fromEntries(mine.map(f => [f.id, games.listVisible(u, { ownerId: f.id, limit: 8, order: 'new' })]));
  const body = html`
  <div class="pagehead"><h1>Friends</h1><a class="btn" href="/chat"><span aria-hidden="true">💬</span> Chat</a></div>
  <div class="friends-top">
    <section class="panel" aria-labelledby="code-h">
      <h2 id="code-h">Your friend code</h2>
      <div class="row"><span class="bigcode" id="mycode">${u.friend_code}</span><button class="btn btn-primary" type="button" id="copycode" data-code="${u.friend_code}"><span aria-hidden="true">📋</span> Copy</button></div>
      <p class="muted small" style="margin:12px 0 0">Give this code only to friends you know in real life. They type it in to send you a friend request.</p>
    </section>
    <section class="panel" aria-labelledby="add-h">
      <h2 id="add-h">Add a friend</h2>
      <form id="addform" novalidate>
        <div class="field"><label for="code">Enter a friend's code</label>
          <div class="row nowrap"><input class="input codeinput" id="code" name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="12" placeholder="ABC123" aria-describedby="code-err code-hint">
          <button class="btn btn-primary" type="submit">Add friend</button></div>
          <span class="hint" id="code-hint">6 letters and numbers. Capitals don't matter.</span>
          <span class="err" id="code-err" aria-live="polite"></span></div>
      </form>
    </section>
  </div>
  ${inc.length ? html`<section class="panel reqs" aria-labelledby="inc-h"><h2 id="inc-h">Friend requests <span class="badge">${inc.length}</span></h2>
    <ul class="plain">${inc.map(f => html`<li class="reqrow">${avatar(f, 44)}<span class="who"><span class="nm">${f.display_name}</span><span class="sub">@${f.username} · ${timeAgo(f.created_at)}</span></span>
      <span class="acts"><button class="btn btn-primary" type="button" data-act="accept" data-id="${f.id}" data-name="${f.display_name}">Accept</button><button class="btn" type="button" data-act="decline" data-id="${f.id}" data-name="${f.display_name}">Decline</button></span></li>`)}</ul></section>` : ''}
  ${out.length ? html`<section class="panel reqs" aria-labelledby="out-h"><h2 id="out-h">Waiting for a yes</h2>
    <ul class="plain">${out.map(f => html`<li class="reqrow">${avatar(f, 44)}<span class="who"><span class="nm">${f.display_name}</span><span class="sub">You asked ${timeAgo(f.created_at)}</span></span>
      <span class="acts"><button class="btn" type="button" data-act="cancel" data-id="${f.id}" data-name="${f.display_name}">Cancel</button></span></li>`)}</ul></section>` : ''}
  <section aria-labelledby="fr-h" style="margin-top:24px">
    <h2 id="fr-h">Your friends${mine.length ? html` <span class="muted">(${mine.length})</span>` : ''}</h2>
    ${mine.length ? html`<div class="friendgrid">${mine.map(f => html`<article class="panel friendcard" aria-label="${f.display_name}">
      <div class="fc-head">
        <a href="/u/${f.username}" class="fc-who">${avatar(f, 52)}<span class="who"><span class="nm">${f.display_name}</span><span class="sub">@${f.username}</span></span></a>
      </div>
      <div class="fc-playing" data-playing="${f.id}">${playingLine(playing[f.id])}</div>
      <div class="fc-acts"><a class="btn btn-primary" href="/chat/${f.username}"><span aria-hidden="true">💬</span> Chat</a><a class="btn" href="/u/${f.username}">Profile</a>
        <button class="btn btn-ghost" type="button" data-act="remove" data-id="${f.id}" data-name="${f.display_name}">Remove</button></div>
      ${shared[f.id].length ? html`<div class="fc-games"><h3 class="small muted">Games ${f.display_name} shared</h3><div class="minigames">${shared[f.id].map(miniGame)}</div></div>` : ''}
    </article>`)}</div>`
    : emptyState({ emoji: '🤝', title: 'No friends yet', text: 'Swap friend codes with someone you know in real life, like a brother, sister or classmate.' })}
  </section>
  ${blocked.length ? html`<section class="panel" aria-labelledby="bl-h" style="margin-top:24px"><h2 id="bl-h">Blocked</h2>
    <p class="muted small">Blocked friends can't chat with you. Unblock them to chat again.</p>
    <ul class="plain">${blocked.map(b => html`<li class="reqrow">${avatar(b, 40)}<span class="who"><span class="nm">${b.display_name}</span><span class="sub">@${b.username}</span></span>
      <span class="acts"><button class="btn" type="button" data-act="unblock" data-id="${b.id}" data-username="${b.username}" data-name="${b.display_name}">Unblock</button></span></li>`)}</ul></section>` : ''}
  ${jsonData('page-data', { friendIds: mine.map(f => f.id) })}`;
  page(req, res, { title: 'Friends', active: 'friends', body, head: COMMUNITY_CSS, scripts: ['/js/friends.js'] });
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
router.post('/api/friends/add', requireAccount, rateLimit('friendcode', 15, 600e3, 'Lots of tries! Wait a few minutes, then check the code with your friend.'), (req, res) => {
  const r = friends.addByCode(req.user, (req.body || {}).code);
  if (!r.ok) return res.status(400).json({ error: r.error, field: 'code' });
  res.json({ ok: true, state: r.state, message: r.message });
});
const act = (fn, okMsg) => (req, res) => {
  const other = getUser(req.params.id);
  if (!other || !fn(req.user, other.id)) return res.status(404).json({ error: 'That request is gone. Try reloading the page.' });
  res.json({ ok: true, message: okMsg(other) });
};
router.post('/api/friends/:id/accept', requireAccount, rateLimit('friendact', 60, 60e3), act(friends.accept, o => `You and ${o.display_name} are now friends! 🎉`));
router.post('/api/friends/:id/decline', requireAccount, rateLimit('friendact', 60, 60e3), act(friends.decline, () => 'Request declined.'));
router.post('/api/friends/:id/cancel', requireAccount, rateLimit('friendact', 60, 60e3), act(friends.cancel, () => 'Request cancelled.'));
router.post('/api/friends/:id/remove', requireAccount, rateLimit('friendact', 60, 60e3), act(friends.unfriend, o => `${o.display_name} is no longer your friend.`));

// ---- Profiles ----
const BADGES = [
  ['builder', '🛠️', 'Builder', 'Has a live game'],
  ['hit', '🌟', 'Hit maker', 'A game with 100+ plays'],
  ['top', '🏆', 'Top rated', 'A game rated 4.5+ by 5 or more players'],
  ['player', '🎮', 'Player', 'Played 10+ different games'],
  ['friendly', '👫', 'Friendly', 'Has 3+ friends'],
];
export function profileBadges(user, visibleGames) {
  const has = {
    builder: visibleGames.length > 0,
    hit: visibleGames.some(g => g.plays >= 100),
    top: visibleGames.some(g => g.rating_count >= 5 && g.rating_sum / g.rating_count >= 4.5),
    player: q.get('SELECT COUNT(DISTINCT game_id) n FROM plays WHERE user_id=?', user.id).n >= 10,
    friendly: friends.count(user.id) >= 3,
  };
  return BADGES.filter(([k]) => has[k]).map(([key, emoji, label, why]) => ({ key, emoji, label, why }));
}
export function favouriteGames(viewer, userId, limit = 12) {
  const v = games.visibleWhere(viewer);
  return games.decorate(q.all(`${games.SELECT} JOIN likes l ON l.game_id=g.id AND l.user_id=? WHERE ${v.sql} ORDER BY l.created_at DESC LIMIT ?`, userId, ...v.params, limit));
}

router.get('/u/:username', (req, res) => {
  const p = getUserByName(req.params.username);
  if (!p || p.banned) return notFound(req, res, "We couldn't find that player.");
  const viewer = req.user;
  if (p.is_guest) {
    const body = html`<div class="empty">${avatar(p, 96)}<h1 style="margin-top:12px">${p.display_name}</h1><p class="muted">Guest player</p><p>Guests can play every game. When they make a free account, they get a profile too.</p><a class="btn btn-primary" href="/">Find a game</a></div>`;
    return page(req, res, { title: p.display_name, active: viewer && viewer.id === p.id ? 'me' : null, body, head: COMMUNITY_CSS });
  }
  const built = games.listVisible(viewer, { ownerId: p.id, limit: 60, order: 'popular' });
  const favs = favouriteGames(viewer, p.id);
  const badges = profileBadges(p, built);
  const stats = { games: built.length, plays: built.reduce((s, g) => s + g.plays, 0), likes: built.reduce((s, g) => s + g.likes, 0) };
  const isMe = viewer && viewer.id === p.id;
  const rel = viewer && !isMe ? friends.status(viewer.id, p.id) : 'none';
  const can = rel === 'friends' ? chat.canChat(viewer, p) : null;
  const body = html`
  <div class="profilehead panel">
    ${avatar(p, 96)}
    <div class="ph-main">
      <h1>${p.display_name}</h1>
      <div class="muted">@${p.username}${p.role === 'admin' ? ' · 🛡️ BRB team' : ''}${rel === 'friends' ? ' · 👫 Your friend' : ''}</div>
      ${p.bio ? html`<p class="small" style="margin:6px 0 0">${p.bio}</p>` : ''}
      ${badges.length ? html`<ul class="badgelist" aria-label="Badges">${badges.map(b => html`<li class="pbadge" title="${b.why}"><span aria-hidden="true">${b.emoji}</span> ${b.label}<span class="sr-only">: ${b.why}</span></li>`)}</ul>` : ''}
    </div>
    <div class="ph-acts">
      ${isMe ? html`<a class="btn" href="/me">✏️ Change my look</a>` : ''}
      <button class="btn" type="button" id="shareprofile" data-url="/u/${p.username}"><span aria-hidden="true">🔗</span> Share</button>
      ${rel === 'friends' ? (can.ok ? html`<a class="btn btn-primary" href="/chat/${p.username}"><span aria-hidden="true">💬</span> Chat</a>` : html`<span class="small muted">${can.reason}</span>`) : ''}
      ${rel === 'received' ? html`<a class="btn btn-primary" href="/friends">Answer friend request</a>` : ''}
      ${rel === 'sent' ? html`<span class="small muted">Friend request sent</span>` : ''}
    </div>
  </div>
  ${isMe ? html`<p class="notice small" style="margin-top:12px">This is your profile. Everyone sees your name, look, games and badges. Nobody sees your friends.</p>` : ''}
  <div class="statrow pstats" aria-label="Stats">
    <div class="stat"><b>${fmtNum(stats.games)}</b>${stats.games === 1 ? 'game' : 'games'}</div>
    <div class="stat"><b>${fmtNum(stats.plays)}</b>plays</div>
    <div class="stat"><b>${fmtNum(stats.likes)}</b>likes</div>
  </div>
  <section aria-labelledby="built-h"><h2 id="built-h">🛠️ Games by ${p.display_name}</h2>
    ${built.length ? cardGrid(built, { ads: false }) : emptyState({ emoji: '🧱', title: 'No games to show yet', text: isMe ? 'Build one and share it!' : '', action: isMe ? { href: '/build', label: 'Build a game' } : null })}
  </section>
  <section aria-labelledby="fav-h" style="margin-top:28px"><h2 id="fav-h">❤️ Favourite games</h2>
    ${favs.length ? cardGrid(favs, { ads: false }) : html`<p class="muted">No favourites yet.</p>`}
  </section>
  ${!isMe && viewer && !viewer.is_guest && rel === 'none' ? html`<p class="small muted" style="margin-top:24px">Want to be friends? Swap friend codes in real life, then add the code on the <a href="/friends">Friends</a> page.</p>` : ''}`;
  page(req, res, { title: p.display_name, active: isMe ? 'me' : null, body, head: COMMUNITY_CSS, back: '/', backLabel: 'Home', description: `${p.display_name} on BRB Gaming`, scripts: ['/js/profile.js'] });
});
