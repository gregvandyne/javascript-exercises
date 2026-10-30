// Shared UI components (server-rendered). Markup contracts used by public/js/*.js:
//  - live counts: any element with [data-live="<gameId>"] gets its text updated every 30s by app.js
// Text comes from the request's language via current() (server/i18n); outside a request it is English.
import { html, raw, esc } from './html.js';
import { current, tHtml } from '../i18n/index.js';
import { urlFor } from '../services/shots.js';
import { photoUrl } from '../services/photos.js';
import { OFFICIAL, GROWNUP_AVATAR, GROWNUP_COLOR } from '../auth.js';
import { faceMark } from './brand.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Real screenshots of the launch games (made by `npm run covers`), keyed by slug -> cache-busting version.
const COVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/covers');
const COVER_SHOTS = new Map();
try { for (const f of fs.readdirSync(COVER_DIR)) if (f.endsWith('.jpg')) COVER_SHOTS.set(f.slice(0, -4), Math.round(fs.statSync(path.join(COVER_DIR, f)).mtimeMs).toString(36)); } catch { /* no covers yet */ }

export { BRAND, wordmark, appMark } from './brand.js';

const VIS_EMOJI = { private: '🔒', family: '🏠', friends: '👫', class: '🎒', school: '🏫', public: '🌍' };
/** "🔒 Only me" / "🏠 My family" / "👫 Friends" / "🎒 My class(es)" / "🏫 My school" / "🌍 Everyone" in the reader's language.
 *  count: how many classes a 'class' game is shared with ("My class" for one, "My classes" otherwise).
 *  grownup: the game's owner is a grown-up builder, whose 'friends' are "🤝 My grown-up connections". */
export function visLabel(v, t = current().t, count = 1, { grownup = false } = {}) {
  // A class game that reaches no class right now (its builder left, or a teacher took it off): in effect only them.
  if (v === 'class' && count === 0) return `🔒 ${t('vis.onlyYouNow')}`;
  if (v === 'friends' && grownup) return `🤝 ${t('vis.connections')}`;
  return VIS_EMOJI[v] ? `${VIS_EMOJI[v]} ${t(`vis.${v}`, { count })}` : v;
}
/** A category's label in the reader's language. */
export const categoryLabel = (key, t = current().t) => t(`categories.${key}`);
/** A class or lesson grade as the teacher typed it: a plain number gets the word ('Grade 4' / 'Year 4'), anything
 *  else ('Year 4', 'K', '4–5') is shown as typed, so it never reads 'Grade Year 4'. */
export const gradeLabel = (t, g) => (!g ? '' : /^\d{1,2}$/.test(String(g).trim()) ? t('school.class.gradeN', { grade: String(g).trim() }) : String(g));

export function stars(rating, count) {
  const { t } = current();
  const r = Math.round((+rating || 0) * 2) / 2;
  if (!count) return html`<span class="stars small muted" aria-label="${t('cards.noRatings')}">☆ ${t('cards.new')}</span>`;
  return html`<span class="stars" aria-label="${t('cards.starsLabel', { stars: r.toFixed(1), count })}">★<span class="num">${r.toFixed(1)}</span></span>`;
}
/** A player's picture: their profile photo when they have one, else their emoji on their colour. The photo URL itself
 *  decides per viewer (/avatars/<id>): friends, the player and admins get the photo, everyone else the emoji. */
export function avatar(u, size = 40) {
  if (!u) return '';
  // Grown-up accounts (older ones too, made with a random animal) show a plain person.
  const grownup = u.account_type === 'grownup' && !u.is_guest;
  const a = grownup ? GROWNUP_AVATAR : u.avatar || u.owner_avatar || '🙂', c = grownup ? GROWNUP_COLOR : u.color || u.owner_color || '#2f6bff';
  const photo = photoUrl(u);
  // The official account's picture is Oomba.
  if (!photo && u.username === OFFICIAL) return html`<span class="avatar" style="--s:${size}px;--c:var(--brand-mint)" aria-hidden="true">${faceMark()}</span>`;
  if (photo) return html`<span class="avatar has-photo" style="--s:${size}px;--c:${c}" aria-hidden="true"><img src="${photo}" alt="" loading="lazy" decoding="async" width="${size}" height="${size}"></span>`;
  return html`<span class="avatar" style="--s:${size}px;--c:${c}" aria-hidden="true">${a}</span>`;
}
/** "Signed in as Ana. Not you? Sign out" for shared classroom devices: one tap signs out and opens the sign-in page.
 *  withName: false where the name is already the page heading (the Me page); plain: just "Sign out" (a device of one's own). */
export function notYou(req, { withName = true, plain = false } = {}) {
  const t = req.t, u = req.user; if (!u) return '';
  return html`<form class="notyou small" data-api="/api/auth/logout"><input type="hidden" name="next" value="${plain ? '/' : '/login'}">${withName ? html`<span class="muted">${tHtml(t, 'layout.notYou.signedInAs', { name: html`<b><bdi>${u.display_name}</bdi></b>` })}</span>` : ''}<button class="notyou-btn" type="submit">${plain ? t('me.signOut.button') : t('layout.notYou.button')}</button></form>`;
}
export function livePill(g) {
  const { t } = current();
  return html`<span class="live" data-live="${g.id}" data-live-format="pill" ${g.playing ? '' : raw('hidden')}>${t('cards.playing', { count: g.playing || 0 })}</span>`;
}
/** A launch game's cover screenshot URL (cache-busted), or null. */
export const coverUrl = slug => (COVER_SHOTS.has(slug) ? `/covers/${slug}.jpg?v=${COVER_SHOTS.get(slug)}` : null);
/** A game's cover: a real screenshot when there is one (launch games: public/covers; Studio games: the picture of the
 *  published version, or of the draft when draft is true, for the builder's own lists), otherwise the emoji art.
 *  eager: the page's main picture (the largest thing on screen at first): loaded at once, before other pictures. */
export function coverArt(g, extra = '', { draft = false, eager = false } = {}) {
  const seed = g.source === 'seed' && g.slug ? COVER_SHOTS.get(g.slug) : null;
  const src = seed ? `/covers/${g.slug}.jpg?v=${seed}` : g.source !== 'seed' && g.id ? urlFor(draft ? g.current_version_id : g.published_version_id) : null;
  if (src) return html`<div class="coverart has-shot cover-${g.cover || 'sunset'} ${extra}"><img src="${src}" alt="" ${eager ? raw('loading="eager" fetchpriority="high"') : raw('loading="lazy"')} decoding="async" width="540" height="720"><span class="shot-icon" aria-hidden="true">${g.icon || '🎮'}</span></div>`;
  return html`<div class="coverart cover-${g.cover || 'sunset'} ${extra}"><div class="art" aria-hidden="true">${g.icon || '🎮'}</div></div>`;
}
/** classPill: false inside a list that is all class games (the class page), where the "Class only" tag is just noise.
 *  byName: a name to credit instead of the owner's display name (the class page shows a teacher's real name). */
export function gameCard(g, { showVis = false, classPill = true, byName = null } = {}) {
  const { t, fmt, anon } = current();
  // Signed out (search engines included): no child's name. Only the official account's name is shown.
  const by = anon && g.owner_name !== OFFICIAL ? '' : byName || g.owner_display || g.owner_name || '';
  const label = by ? t('cards.gameBy', { title: g.title, name: by }) : g.title;
  const pill = g.visibility === 'class' && classPill && !showVis;
  return html`<a class="gcard" href="/g/${g.slug}" aria-label="${pill ? `${label} · ${t('cards.classOnly')}` : label}">
    <div style="position:relative">${coverArt(g)}${livePill(g)}${showVis ? html`<span class="vis-pill">${statusLabel(g)}</span>` : pill ? html`<span class="vis-pill vis-class">🎒 ${t('cards.classOnly')}</span>` : ''}</div>
    <div class="t">${g.title}</div>
    ${by ? html`<div class="by">${t('cards.by', { name: by })}</div>` : ''}
    <div class="meta">${stars(g.rating, g.rating_count)}<span class="muted">· ${t('cards.plays', { count: +g.plays || 0, n: fmt.num(g.plays) })}</span></div>
  </a>`;
}
/** count: for a 'class' game, how many classes it is shared with ("My class" / "My classes"). */
export function statusLabel(g, t = current().t, count = 1, grownup = g.owner_type === 'grownup') {
  if (g.hidden_reason) return `⚠️ ${t('status.hidden')}`;
  if (g.status === 'in_review') return `⏳ ${t('status.inReview')}`;
  if (g.status === 'rejected') return `✏️ ${t('status.needsChanges')}`;
  if (g.status === 'suspended') return `⛔ ${t('status.suspended')}`;
  if (g.status !== 'published') return `📝 ${t('status.draft')}`;
  return visLabel(g.visibility, t, count, { grownup });
}
export function rail({ title, games, more = null, id = null, emoji = '' }) {
  if (!games || !games.length) return '';
  const { t } = current();
  const rid = id || `rail${++railN}`;
  const cards = games.map(g => gameCard(g));
  return html`<section class="rail" aria-labelledby="${rid}-h">
    <div class="rail-head"><h2 id="${rid}-h">${emoji ? emoji + ' ' : ''}${title}</h2>
      ${more ? html`<a class="more" href="${more}"${more.startsWith('/search') ? raw(' rel="nofollow"') : ''}>${t('cards.seeAll')}</a>` : ''}
      <div class="rail-arrows"><button type="button" data-rail="${rid}" data-dir="-1" aria-label="${t('cards.scrollBack', { title })}"><span class="flip" aria-hidden="true">←</span></button><button type="button" data-rail="${rid}" data-dir="1" aria-label="${t('cards.scrollForward', { title })}"><span class="flip" aria-hidden="true">→</span></button></div>
    </div>
    <div class="rail-track" id="${rid}" role="list">${cards.map(c => html`<div role="listitem">${c}</div>`)}</div>
  </section>`;
}
export function cardGrid(games, { showVis = false, classPill = true, byName = null } = {}) {
  const cards = games.map(g => gameCard(g, { showVis, classPill, byName: byName ? byName(g) : null }));
  return html`<div class="cardgrid">${cards}</div>`;
}
export function emptyState({ emoji = '🌈', title, text = '', action = null }) {
  return html`<div class="empty"><div class="emo" aria-hidden="true">${emoji}</div><h3>${title}</h3>${text ? html`<p>${text}</p>` : ''}${action ? html`<a class="btn btn-primary" href="${action.href}">${action.label}</a>` : ''}</div>`;
}
export function personRow(u, { href = null, sub = '', right = '' } = {}) {
  return html`<a class="person" href="${href || '/u/' + u.username}">${avatar(u, 44)}<span style="flex:1;min-width:0"><span class="nm">${u.display_name || u.displayName || u.username}</span><br><span class="sub">${sub || html`<bdi>@${u.username}</bdi>`}</span></span>${right}</a>`;
}

/** "🛠️ Make a game" (the Builder): school staff have no Build tab, so My classes and Me keep it one tap away. */
export const makeGameBtn = t => html`<a class="btn" href="/build"${t.own('school.teach.makeGame') ? '' : raw(' lang="en" dir="ltr"')}>🛠️ ${t('school.teach.makeGame')}</a>`;
