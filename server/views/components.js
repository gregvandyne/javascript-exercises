// Shared UI components (server-rendered). Markup contracts used by public/js/*.js:
//  - live counts: any element with [data-live="<gameId>"] gets its text updated every 30s by app.js
//  - ad cards: a.adcard[data-ad][data-placement][data-game|data-games] observed by public/js/ads.js
import { html, raw, esc, fmtNum } from './html.js';
import { pickAd } from '../services/ads.js';

export const VIS_LABEL = { private: '🔒 Only me', friends: '👫 Friends', public: '🌍 Everyone' };
export function stars(rating, count) {
  const r = Math.round((+rating || 0) * 2) / 2;
  if (!count) return html`<span class="stars small muted" aria-label="No ratings yet">☆ New</span>`;
  return html`<span class="stars" aria-label="${r.toFixed(1)} out of 5 stars from ${count} ratings">★<span class="num">${r.toFixed(1)}</span></span>`;
}
export function avatar(u, size = 40) {
  if (!u) return '';
  const a = u.avatar || u.owner_avatar || '🙂', c = u.color || u.owner_color || '#2f6bff';
  return html`<span class="avatar" style="--s:${size}px;--c:${c}" aria-hidden="true">${a}</span>`;
}
export function livePill(g) {
  return html`<span class="live" data-live="${g.id}" data-live-format="pill" ${g.playing ? '' : raw('hidden')}>${g.playing} playing</span>`;
}
export function coverArt(g, extra = '') {
  return html`<div class="coverart cover-${g.cover || 'sunset'} ${extra}"><div class="art" aria-hidden="true">${g.icon || '🎮'}</div></div>`;
}
export function gameCard(g, { showVis = false } = {}) {
  const by = g.owner_display || g.owner_name || '';
  return html`<a class="gcard" href="/g/${g.slug}" aria-label="${g.title}${by ? ', by ' + by : ''}">
    <div style="position:relative">${coverArt(g)}${livePill(g)}${showVis ? html`<span class="vis-pill">${statusLabel(g)}</span>` : ''}</div>
    <div class="t">${g.title}</div>
    ${by ? html`<div class="by">by ${by}</div>` : ''}
    <div class="meta">${stars(g.rating, g.rating_count)}<span class="muted">· ${fmtNum(g.plays)} plays</span></div>
  </a>`;
}
export function statusLabel(g) {
  if (g.hidden_reason) return '⚠️ Hidden';
  if (g.status === 'in_review') return '⏳ In review';
  if (g.status === 'rejected') return '✏️ Needs changes';
  if (g.status === 'suspended') return '⛔ Suspended';
  if (g.status !== 'published') return '📝 Draft';
  return VIS_LABEL[g.visibility] || g.visibility;
}
/** Sponsored card in the same style as a game card. placement: 'grid' | 'game'. */
export function adCard({ placement, category = null, gameId = null, gamesShown = [], user = null }) {
  const ad = pickAd({ placement, category, user });
  if (!ad) return '';
  return html`<a class="gcard adcard" href="${ad.href}" data-ad="${ad.id}" data-placement="${placement}" ${gameId ? raw(`data-game="${esc(gameId)}"`) : ''} ${gamesShown.length ? raw(`data-games="${esc(gamesShown.join(','))}"`) : ''} aria-label="Sponsored: ${ad.title}">
    <div class="coverart cover-ad"><div class="art" aria-hidden="true">${ad.icon}</div><div class="adtext">${ad.text}</div></div>
    <div class="t">${ad.title}</div>
    <div class="by"><span class="sponsored">Sponsored</span></div>
  </a>`;
}
/** Insert a sponsored card as every 8th tile. */
export function withAds(games, { user, category = null, every = 8 } = {}) {
  const out = [];
  games.forEach((g, i) => {
    out.push(gameCard(g));
    if ((i + 1) % (every - 1) === 0 && i < games.length - 1) {
      const shown = games.slice(Math.max(0, i - (every - 2)), i + 1).map(x => x.id);
      out.push(adCard({ placement: 'grid', category: category || g.category, gamesShown: shown, user }));
    }
  });
  return out;
}
let railN = 0;
export function rail({ title, games, more = null, user = null, ads = true, id = null, emoji = '' }) {
  if (!games || !games.length) return '';
  const rid = id || `rail${++railN}`;
  const cards = ads ? withAds(games, { user }) : games.map(g => gameCard(g));
  return html`<section class="rail" aria-labelledby="${rid}-h">
    <div class="rail-head"><h2 id="${rid}-h">${emoji ? emoji + ' ' : ''}${title}</h2>
      ${more ? html`<a class="more" href="${more}">See all</a>` : ''}
      <div class="rail-arrows"><button type="button" data-rail="${rid}" data-dir="-1" aria-label="Scroll ${title} left">←</button><button type="button" data-rail="${rid}" data-dir="1" aria-label="Scroll ${title} right">→</button></div>
    </div>
    <div class="rail-track" id="${rid}" role="list">${cards.map(c => html`<div role="listitem">${c}</div>`)}</div>
  </section>`;
}
export function cardGrid(games, { user = null, ads = true, category = null, showVis = false } = {}) {
  const cards = ads ? withAds(games, { user, category }) : games.map(g => gameCard(g, { showVis }));
  return html`<div class="cardgrid">${cards}</div>`;
}
export function emptyState({ emoji = '🌈', title, text = '', action = null }) {
  return html`<div class="empty"><div class="emo" aria-hidden="true">${emoji}</div><h3>${title}</h3>${text ? html`<p>${text}</p>` : ''}${action ? html`<a class="btn btn-primary" href="${action.href}">${action.label}</a>` : ''}</div>`;
}
export function personRow(u, { href = null, sub = '', right = '' } = {}) {
  return html`<a class="person" href="${href || '/u/' + u.username}">${avatar(u, 44)}<span style="flex:1;min-width:0"><span class="nm">${u.display_name || u.displayName || u.username}</span><br><span class="sub">${sub || '@' + u.username}</span></span>${right}</a>`;
}
