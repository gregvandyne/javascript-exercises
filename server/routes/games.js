// Game page, play page, the sandboxed frame, and the game APIs the SDK talks to (via the parent page).
import { Router } from 'express';
import { html, jsonData } from '../views/html.js';
import { page, notFound } from '../views/layout.js';
import { coverArt, avatar, cardGrid, statusLabel, categoryLabel } from '../views/components.js';
import * as games from '../services/games.js';
import * as presence from '../services/presence.js';
import { frameDocument, sendFrame, sendFrameText, frameOrigins, SANDBOX } from '../services/frame.js';
import { signToken, readToken, requireUser, getUser, createGuest, startSession, isGrownup } from '../auth.js';
import { rateLimit, allow, ipOf, GUESTS_PER_IP_HOUR } from '../services/ratelimit.js';
import { q, uid, now, audit } from '../db.js';
import { config } from '../config.js';
import { tEn, tFor, normalizeCode, localeInfo } from '../i18n/index.js';
import { fileFor } from '../services/shots.js';
import * as progress from '../services/progress.js';
import fs from 'node:fs';

export const router = Router();
const REASON_KEYS = ['scary', 'mean', 'grownup', 'broken', 'copy', 'other'];
/** [key, label] pairs in the reader's language (English by default; the admin panel uses English). */
export const reportReasons = (t = tEn) => REASON_KEYS.map(k => [k, t(`game.report.reasons.${k}`)]);
export const REPORT_REASONS = reportReasons();

function loadViewable(req, res) {
  const g = games.getGameBySlug(req.params.slug);
  if (!g || !games.canView(req.user, g)) { notFound(req, res, req.t('game.notShared')); return null; }
  return games.localizeGame(g, req.locale);
}

router.get('/g/:slug', (req, res) => {
  const g = loadViewable(req, res); if (!g) return;
  const t = req.t, f = req.fmt;
  const u = req.user;
  const [d] = games.decorate([{ ...g, ...(() => { const o = games.getOwner(g); return { owner_name: o.username, owner_display: o.display_name, owner_avatar: o.avatar, owner_color: o.color }; })() }]);
  const owner = games.getOwner(g);
  const isOwner = u && u.id === g.owner_id;
  const myStars = games.userRating(g.id, u && u.id), liked = games.userLiked(g.id, u && u.id);
  const lb = games.leaderboard(g.id, 10);
  const more = games.similar(u, g, 6);
  const cat = games.categoryInfo(g.category);
  const playable = !!g.published_version_id || (isOwner && g.current_version_id);
  const players = g.players_max > 1 ? `👥 ${t('game.about.players', { count: g.players_max })} · ` : `👤 ${t('game.about.onePlayer')} · `;
  // "Shared with: 5B, Art Club" (only reached after canView). The owner and admins see every class; anyone else sees
  // the classes they are in and a count of the others.
  const shared = games.classNamesFor(g, u);
  const body = html`
  <article>
    <div class="gamehero">
      <div style="position:relative">${coverArt(d)}</div>
      <div>
        <h1>${g.title}</h1>
        <a class="person ownerchip" href="/u/${owner.username}">${avatar(owner, 32)}<span class="nm">${owner.display_name}</span></a>
        ${shared && shared.names.length ? html`<div class="sharedwith small"><span>🎒 ${t('game.sharedWith')}</span> <ul class="chips-inline">${shared.names.map(n => html`<li dir="auto">${n}</li>`)}</ul>${shared.others ? html` <span class="muted">${t('game.sharedWithMore', { count: shared.others })}</span>` : ''}</div>` : ''}
        <div class="statrow">
          <div class="stat"><b>${d.rating_count ? d.rating.toFixed(1) + ' ★' : t('cards.new')}</b>${d.rating_count ? t('game.stats.ratings', { count: d.rating_count, n: f.num(d.rating_count) }) : t('game.stats.noRatings')}</div>
          <div class="stat"><b data-live="${g.id}" data-live-format="number">${d.playing}</b>${t('game.stats.playingNow')}</div>
          <div class="stat"><b>${f.num(g.plays)}</b>${t('game.stats.plays', { count: +g.plays || 0 })}</div>
          <div class="stat"><b id="likecount">${f.num(g.likes)}</b>${t('game.stats.likes', { count: +g.likes || 0 })}</div>
        </div>
        <div class="row actions">
          ${playable ? html`<a class="btn btn-primary btn-big playbig" href="/play/${g.slug}" id="playbtn">▶ ${t('game.play')}</a>` : html`<span class="notice">${t('game.notReady')}</span>`}
          <button class="iconbtn" type="button" id="likebtn" aria-pressed="${String(!!liked)}"><span class="emo" aria-hidden="true">${liked ? '❤️' : '🤍'}</span>${t('game.like')}</button>
          <button class="iconbtn" type="button" id="sharebtn"><span class="emo" aria-hidden="true">🔗</span>${t('game.share')}</button>
          ${isOwner ? html`<a class="iconbtn" href="/studio/${g.id}"><span class="emo" aria-hidden="true">🛠️</span>${t('game.edit')}</a>` : html`<button class="iconbtn" type="button" id="reportbtn"><span class="emo" aria-hidden="true">🚩</span>${t('game.report.button')}</button>`}
        </div>
        ${isOwner ? html`<p class="small muted" style="margin-top:8px">${statusLabel(g, t, shared ? shared.names.length : 1)}${g.pending_version_id ? ` · ${t('game.updateWaiting')}` : ''}${g.review_note ? html` · ${t('game.reviewer', { note: g.review_note })}` : ''}</p>` : ''}
      </div>
    </div>
    <div class="grid2">
      <div class="stack">
        <section class="panel"><h2>${t('game.about.heading')}</h2>
          <p class="ugc" style="white-space:pre-line">${g.description || t('game.about.noDescription')}</p>
          <div class="taglist"><a class="tag" href="/search?cat=${cat.key}">${cat.icon} ${categoryLabel(cat.key, t)}</a>${d.tagList.map(tag => html`<a class="tag" href="/search?q=${encodeURIComponent(tag)}">#${tag}</a>`)}</div>
          <p class="small muted" style="margin:12px 0 0">${players}${g.orientation === 'landscape' ? `📱↔️ ${t('game.about.sideways')} · ` : ''}${t('game.about.updated', { when: f.ago(g.updated_at) })}</p>
        </section>
        <section class="panel" aria-labelledby="rate-h"><h2 id="rate-h">${t('game.rate.heading')}</h2>
          ${u ? html`<div class="rate" role="radiogroup" aria-label="${t('game.rate.yourRating')}" id="rate">${[1, 2, 3, 4, 5].map(n => html`<button type="button" role="radio" aria-checked="${myStars === n}" aria-label="${t('game.rate.stars', { count: n })}" data-stars="${n}" class="${n <= myStars ? 'on' : ''}">★</button>`)}</div>
            <p class="small muted" id="ratemsg">${myStars ? t('game.rate.thanks') : t('game.rate.tap')}</p>`
          : html`<p><button class="btn" type="button" data-guest-play="">${t('game.rate.guest')}</button></p>`}
        </section>
        <section class="panel" aria-labelledby="lb-h"><h2 id="lb-h">🏆 ${t('game.leaderboard.heading')}</h2>
          ${lb.length ? html`<ol class="lb">${lb.map(r => html`<li>${avatar(r, 30)}<span>${r.display_name}</span><span class="sc" dir="ltr">${f.int(r.score)}${r.label ? ' ' + r.label : ''}</span></li>`)}</ol>` : html`<p class="muted">${t('game.leaderboard.empty')}</p>`}
        </section>
      </div>
      <aside class="stack" aria-label="${t('game.more.label')}">
        ${more.length ? html`<section><h2>${t('game.more.heading')}</h2>${cardGrid(more, {})}</section>` : ''}
      </aside>
    </div>
  </article>
  ${jsonData('page-data', { gameId: g.id, slug: g.slug, title: g.title, visibility: g.visibility, shareText: t(`game.shareText.${g.visibility}`), reasons: reportReasons(t), signedIn: !!u })}`;
  page(req, res, { title: g.title, active: 'home', back: '/', backLabel: t('nav.home'), body, description: g.description.slice(0, 160), scripts: ['/js/game.js'] });
});

router.get('/play/:slug', (req, res) => {
  const t = req.t;
  const g = games.localizeGame(games.getGameBySlug(req.params.slug), req.locale);
  if (!g || !games.canView(req.user, g)) return notFound(req, res, t('game.notShared'));
  // One tap to play: a visitor without a session becomes a guest so progress saves (rate-limited per IP).
  if (!req.user && req.headers['sec-fetch-mode'] === 'navigate' && allow(`guestip:${ipOf(req)}`, GUESTS_PER_IP_HOUR, 3600e3)) {
    const guest = createGuest(); req.sessionId = startSession(res, guest.id, req.headers['user-agent']); req.user = guest;
  }
  const u = req.user;
  const isOwner = u && (u.id === g.owner_id || u.role === 'admin');
  const versionId = g.published_version_id || (isOwner ? g.current_version_id : null);
  if (!versionId) return notFound(req, res, t('game.notReadyYet'));
  const token = signToken({ v: versionId, g: g.id, u: u ? u.id : null, l: req.locale }, 15 * 60);
  const liked = games.userLiked(g.id, u && u.id);
  // Opened from a lesson step (?lesson=<class lesson>&step=<step>): play time and scores count for that step.
  const lc = req.query.lesson && req.query.step && u ? progress.context(u, String(req.query.lesson), String(req.query.step)) : null;
  const lesson = lc && lc.ok && lc.step.kind === 'game' && lc.step.game_id === g.id ? { cl: lc.cl.id, step: lc.step.id, back: `/class/${lc.cl.class_id}/lessons/${lc.cl.id}` } : null;
  const body = html`
  <div class="playbar">
    <a class="iconbtn" href="${lesson ? lesson.back : `/g/${g.slug}`}" aria-label="${lesson ? t('progress.play.backToLesson') : t('play.backTo', { title: g.title })}"><span class="emo flip" aria-hidden="true">←</span><span class="lbl">${t('layout.back')}</span></a>
    <span class="ptitle">${g.icon} ${g.title}</span>
    <span class="livecount" data-live="${g.id}" data-live-format="bar"></span>
    <button class="iconbtn" type="button" id="p-like" aria-pressed="${String(!!liked)}" aria-label="${t('game.like')}"><span class="emo" aria-hidden="true">${liked ? '❤️' : '🤍'}</span><span class="lbl">${t('game.like')}</span></button>
    <button class="iconbtn" type="button" id="p-rate" aria-label="${t('play.rate')}"><span class="emo" aria-hidden="true">⭐</span><span class="lbl">${t('play.rate')}</span></button>
    <button class="iconbtn" type="button" id="p-full" aria-label="${t('play.fullScreen')}"><span class="emo" aria-hidden="true">⛶</span><span class="lbl">${t('play.fullScreen')}</span></button>
  </div>
  <div class="stage" id="stage" dir="ltr">
    <template id="gameframe-tpl"><iframe id="gameframe" title="${g.title}" data-src="/frame/${token}" sandbox="${SANDBOX}" allow="fullscreen; autoplay" allowfullscreen referrerpolicy="no-referrer"></iframe></template>
  </div>
  <div class="orient-hint ${g.orientation === 'landscape' ? 'show' : ''}" id="orient"><div><div class="emo" aria-hidden="true">📱</div><h2>${t('play.turn.heading')}</h2><p>${t('play.turn.text')}</p><button class="btn" type="button" id="orient-ok">${t('play.turn.ok')}</button></div></div>
  ${jsonData('page-data', { gameId: g.id, slug: g.slug, title: g.title, signedIn: !!u, myStars: games.userRating(g.id, u && u.id), canSave: !!u, lesson })}`;
  page(req, res, { title: g.title, bare: true, bodyClass: `playmode ${g.orientation === 'landscape' ? 'wants-landscape' : ''}`, body, scripts: ['/js/play.js'] });
});

// The frame: no cookies are needed; access comes from the short-lived signed token minted for the play/studio page.
// The token also carries the player's language (l), which games read as BRB.user.lang / BRB.user.dir.
// A Studio game's cover picture. Players get the live version's picture of a game they may open; the builder (and
// admins) can also see their drafts'. Anything else is a 404, so unreviewed pictures never leak.
router.get('/shots/:file', (req, res) => {
  const m = /^([A-Za-z0-9_-]{4,40})\.jpg$/.exec(req.params.file);
  const v = m && games.getVersion(m[1]);
  const g = v && v.shot_at && games.getGame(v.game_id);
  if (!g) return res.status(404).end();
  const live = g.published_version_id === v.id && games.canView(req.user, g);
  if (!live && !games.canEdit(req.user, g)) return res.status(404).end();
  const file = fileFor(v.id);
  if (!fs.existsSync(file)) return res.status(404).end();
  const open = live && g.visibility === 'public' && g.status === 'published' && !g.hidden_reason;
  res.set({ 'Cache-Control': open ? 'public, max-age=604800, immutable' : 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
  res.type('jpg').sendFile(file);
});

router.get('/frame/:token', (req, res) => {
  const t = req.t;
  const tok = readToken(req.params.token);
  if (!tok) return sendFrameText(res, 403, t('play.frameExpired'));
  const v = games.getVersion(tok.v); const g = v && games.getGame(v.game_id);
  if (!v || !g || g.id !== tok.g) return sendFrameText(res, 404, t('errors.api.notFound'));
  const preview = !!tok.p;
  // Bind the token to the viewer so a leaked frame URL is useless to anyone else: the sandboxed iframe is same-site, so
  // the SameSite=Lax session cookie rides along and req.user is the minter (guest-play sets its cookie before the frame loads).
  // Only when the page loads the frame: a reload the frame starts itself has no cookie, so the SDK's "Try again" asks the page.
  const u = req.user;
  if (tok.u && (!u || u.id !== tok.u)) return sendFrameText(res, 403, t('play.frameExpired'));
  // Re-check the live game against the viewer (catches a game since hidden, unpublished or made private); preview is owner/admin-only at mint.
  if (!preview && !games.canView(u, g)) return sendFrameText(res, 404, t('errors.api.notFound'));
  const lang = normalizeCode(tok.l) || req.locale;
  const init = {
    user: { ...(u ? { displayName: u.display_name, avatar: u.avatar, isGuest: !!u.is_guest } : { displayName: t('play.defaultPlayer'), avatar: '🙂', isGuest: true }), lang, dir: localeInfo(lang).dir },
    game: { id: g.id, title: g.title },
    save: u && !preview ? games.getSave(g.id, u.id) : {},
    canSave: !!u && !preview,
    preview,
    // Shown by the SDK, in the game's language: the "newer device" card (can't run 3D) and the "3D picture
    // stopped" card (a lost WebGL context on any device) with its Try again button.
    deviceText: {
      title: tFor(lang)('play.device.title'), text: tFor(lang)('play.device.text'),
      lostTitle: tFor(lang)('play.device.lostTitle'), lostText: tFor(lang)('play.device.lostText'), retry: tFor(lang)('play.device.retry'),
    },
  };
  sendFrame(res, frameDocument(v.html, init), frameOrigins(req));
});

// ---- APIs used by game.js / play.js ----
function apiGame(req, res) {
  const g = games.getGame(req.params.id);
  if (!g || !games.canView(req.user, g)) { res.status(404).json({ error: req.t('game.api.notFound') }); return null; }
  return g;
}
router.post('/api/games/:id/rate', requireUser, rateLimit('rate', 30, 60e3), (req, res) => {
  const g = apiGame(req, res); if (!g) return;
  const s = Math.round(+(req.body || {}).stars);
  if (!(s >= 1 && s <= 5)) return res.status(400).json({ error: req.t('game.api.pickStars') });
  res.json({ ok: true, ...games.rate(g.id, req.user.id, s) });
});
router.post('/api/games/:id/like', requireUser, rateLimit('like', 30, 60e3), (req, res) => {
  const g = apiGame(req, res); if (!g) return;
  res.json({ ok: true, ...games.toggleLike(g.id, req.user.id) });
});
router.post('/api/games/:id/play', requireUser, rateLimit('play', 60, 60e3), (req, res) => {
  const g = apiGame(req, res); if (!g) return;
  const key = req.sessionId || `anon:${ipOf(req)}`;
  presence.touch(g.id, key, req.user ? req.user.id : null);
  const playId = games.recordPlay(g.id, req.user && req.user.id);
  res.json({ ok: true, playId, playing: presence.count(g.id) });
});
router.post('/api/games/:id/heartbeat', requireUser, rateLimit('hb', 30, 60e3), (req, res) => {
  const g = apiGame(req, res); if (!g) return;
  presence.touch(g.id, req.sessionId || `anon:${ipOf(req)}`, req.user ? req.user.id : null);
  res.json({ ok: true, playing: presence.count(g.id) });
});
// sendBeacon posts text/plain; accept both.
router.post('/api/games/:id/leave', (req, res) => {
  const g = games.getGame(req.params.id); if (!g) return res.status(404).end();
  presence.leave(g.id, req.sessionId || `anon:${ipOf(req)}`);
  let body = req.body; if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  if (body && body.playId) games.endPlay(String(body.playId), req.user ? req.user.id : null);
  res.status(204).end();
});
router.post('/api/games/:id/save', requireUser, rateLimit('save', 60, 60e3), (req, res) => {
  const g = apiGame(req, res); if (!g) return;
  try { games.putSave(g.id, req.user.id, (req.body || {}).data); res.json({ ok: true }); }
  catch { res.status(400).json({ error: req.t('game.api.saveFailed') }); }
});
router.get('/api/games/:id/save', requireUser, (req, res) => {
  const g = apiGame(req, res); if (!g) return;
  res.json({ data: games.getSave(g.id, req.user.id) });
});
router.post('/api/games/:id/score', requireUser, rateLimit('score', 30, 60e3), (req, res) => {
  const g = apiGame(req, res); if (!g) return;
  const { score, label } = req.body || {};
  if (!Number.isFinite(+score) || +score < 0) return res.status(400).json({ error: req.t('game.api.badScore') });
  // A score only counts after the player actually opened the game (a recorded play in the last 24h): this stops a
  // script from poisoning a leaderboard without ever loading the game. Scores are still client-reported (see docs/safety.md).
  if (!games.hasRecentPlay(g.id, req.user.id)) return res.status(400).json({ error: req.t('game.api.badScore') });
  // Grown-up accounts play, but are on no leaderboard: their scores are never stored.
  if (isGrownup(req.user)) return res.json({ ok: true, best: Math.max(0, Math.floor(+score)), improved: false });
  res.json({ ok: true, ...games.submitScore(g.id, req.user.id, +score, label) });
});
router.get('/api/games/:id/leaderboard', (req, res) => {
  const g = apiGame(req, res); if (!g) return;
  res.json({ rows: games.leaderboard(g.id, 10).map(r => ({ name: r.display_name, avatar: r.avatar, score: r.score, label: r.label })) });
});
// Reports: any signed-in player (guests included) can report with a simple reason. N open reports auto-hide the game.
router.post('/api/games/:id/report', requireUser, rateLimit('report', 10, 3600e3), (req, res) => {
  const t = req.t;
  const g = games.getGame(req.params.id);
  if (!g || !games.canView(req.user, g)) return res.status(404).json({ error: t('game.api.notFound') });
  const reason = String((req.body || {}).reason || '');
  if (!REASON_KEYS.includes(reason)) return res.status(400).json({ error: t('game.api.pickReason') });
  const details = String((req.body || {}).details || '').slice(0, 300);
  if (q.get("SELECT 1 FROM reports WHERE game_id=? AND user_id=? AND status='open'", g.id, req.user.id)) return res.json({ ok: true, already: true, message: t('game.report.already') });
  q.run('INSERT INTO reports(id, game_id, user_id, reason, details, created_at) VALUES (?,?,?,?,?,?)', uid(), g.id, req.user.id, reason, details, now());
  // Only trustworthy distinct reporters count toward auto-hiding (not guests, not the owner): a few throwaway guest
  // reports must not silently take a game down. Guest reports are still stored for admin review.
  const open = q.get("SELECT COUNT(DISTINCT r.user_id) n FROM reports r JOIN users u ON u.id=r.user_id WHERE r.game_id=? AND r.status='open' AND u.is_guest=0 AND r.user_id!=?", g.id, g.owner_id).n;
  if (open >= config.reportsToHide && !g.hidden_reason && g.owner_id !== req.user.id) {
    q.run("UPDATE games SET hidden_reason='reports', updated_at=? WHERE id=?", now(), g.id);
    audit(null, 'game.auto_hidden', g.id, { reports: open });
  }
  res.json({ ok: true, message: t('game.report.thanks') });
});
