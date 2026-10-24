// Game page, play page, the sandboxed frame, and the game APIs the SDK talks to (via the parent page).
import { Router } from 'express';
import { html, raw, jsonData, fmtNum, timeAgo } from '../views/html.js';
import { page, notFound } from '../views/layout.js';
import { coverArt, stars, avatar, cardGrid, adCard, emptyState, VIS_LABEL, statusLabel } from '../views/components.js';
import * as games from '../services/games.js';
import * as presence from '../services/presence.js';
import { frameDocument, sendFrame, SANDBOX } from '../services/frame.js';
import { signToken, readToken, requireUser, getUser, createGuest, startSession } from '../auth.js';
import { rateLimit, allow } from '../services/ratelimit.js';
import { q, uid, now, audit } from '../db.js';
import { config } from '../config.js';

export const router = Router();
const SHARE_TEXT = {
  private: 'Only you can open this game. Change it to Friends or Everyone to share it.',
  friends: 'Only your friends on Magic Cups can open this link.',
  public: 'Anyone with the link can play this game.',
};
export const REPORT_REASONS = [['scary', 'It is too scary'], ['mean', 'It is mean or rude'], ['grownup', 'It has grown-up stuff'], ['broken', 'It does not work'], ['copy', 'It copies someone else'], ['other', 'Something else']];

function loadViewable(req, res) {
  const g = games.getGameBySlug(req.params.slug);
  if (!g || !games.canView(req.user, g)) { notFound(req, res, "This game doesn't exist, or it isn't shared with you."); return null; }
  return g;
}

router.get('/g/:slug', (req, res) => {
  const g = loadViewable(req, res); if (!g) return;
  const u = req.user;
  const [d] = games.decorate([{ ...g, ...(() => { const o = games.getOwner(g); return { owner_name: o.username, owner_display: o.display_name, owner_avatar: o.avatar, owner_color: o.color }; })() }]);
  const owner = games.getOwner(g);
  const isOwner = u && u.id === g.owner_id;
  const myStars = games.userRating(g.id, u && u.id), liked = games.userLiked(g.id, u && u.id);
  const lb = games.leaderboard(g.id, 10);
  const more = games.similar(u, g, 6);
  const cat = games.categoryInfo(g.category);
  const playable = !!g.published_version_id || (isOwner && g.current_version_id);
  const body = html`
  <article>
    <div class="gamehero">
      <div style="position:relative">${coverArt(d)}</div>
      <div>
        <h1>${g.title}</h1>
        <a class="person" href="/u/${owner.username}" style="display:inline-flex;padding:4px 10px 4px 4px;margin-left:-4px">${avatar(owner, 32)}<span class="nm">${owner.display_name}</span></a>
        <div class="statrow">
          <div class="stat"><b>${d.rating_count ? d.rating.toFixed(1) + ' ★' : 'New'}</b>${d.rating_count ? `${fmtNum(d.rating_count)} ratings` : 'no ratings yet'}</div>
          <div class="stat"><b data-live="${g.id}" data-live-format="number">${d.playing}</b>playing now</div>
          <div class="stat"><b>${fmtNum(g.plays)}</b>plays</div>
          <div class="stat"><b id="likecount">${fmtNum(g.likes)}</b>likes</div>
        </div>
        <div class="row actions">
          ${playable ? html`<a class="btn btn-primary btn-big playbig" href="/play/${g.slug}" id="playbtn">▶ Play</a>` : html`<span class="notice">Not ready to play yet.</span>`}
          <button class="iconbtn" type="button" id="likebtn" aria-pressed="${liked}"><span class="emo" aria-hidden="true">${liked ? '❤️' : '🤍'}</span>Like</button>
          <button class="iconbtn" type="button" id="sharebtn"><span class="emo" aria-hidden="true">🔗</span>Share</button>
          ${isOwner ? html`<a class="iconbtn" href="/studio/${g.id}"><span class="emo" aria-hidden="true">🛠️</span>Edit</a>` : html`<button class="iconbtn" type="button" id="reportbtn"><span class="emo" aria-hidden="true">🚩</span>Report</button>`}
        </div>
        ${isOwner ? html`<p class="small muted" style="margin-top:8px">${statusLabel(g)}${g.pending_version_id ? ' · an update is waiting for review' : ''}${g.review_note ? html` · Reviewer: “${g.review_note}”` : ''}</p>` : ''}
      </div>
    </div>
    <div class="grid2">
      <div class="stack">
        <section class="panel"><h2>About this game</h2>
          <p style="white-space:pre-line">${g.description || 'No description yet.'}</p>
          <div class="taglist"><a class="tag" href="/search?cat=${cat.key}">${cat.icon} ${cat.label}</a>${d.tagList.map(t => html`<a class="tag" href="/search?q=${encodeURIComponent(t)}">#${t}</a>`)}</div>
          <p class="small muted" style="margin:12px 0 0">${g.players_max > 1 ? `👥 1 to ${g.players_max} players · ` : '👤 1 player · '}${g.orientation === 'landscape' ? '📱↔️ Best sideways · ' : ''}Updated ${timeAgo(g.updated_at)}</p>
        </section>
        <section class="panel" aria-labelledby="rate-h"><h2 id="rate-h">Rate it</h2>
          ${u ? html`<div class="rate" role="radiogroup" aria-label="Your rating" id="rate">${[1, 2, 3, 4, 5].map(n => html`<button type="button" role="radio" aria-checked="${myStars === n}" aria-label="${n} star${n > 1 ? 's' : ''}" data-stars="${n}" class="${n <= myStars ? 'on' : ''}">★</button>`)}</div>
            <p class="small muted" id="ratemsg">${myStars ? 'Thanks! Tap to change your stars any time.' : 'Tap a star.'}</p>`
          : html`<p><button class="btn" type="button" data-guest-play="">Play as guest to rate</button></p>`}
        </section>
        <section class="panel" aria-labelledby="lb-h"><h2 id="lb-h">🏆 Leaderboard</h2>
          ${lb.length ? html`<ol class="lb">${lb.map(r => html`<li>${avatar(r, 30)}<span>${r.display_name}</span><span class="sc">${fmtNum(r.score)}${r.label ? ' ' + r.label : ''}</span></li>`)}</ol>` : html`<p class="muted">No scores yet. Be the first!</p>`}
        </section>
      </div>
      <aside class="stack" aria-label="More">
        <div style="max-width:200px">${adCard({ placement: 'game', category: g.category, gameId: g.id, user: u })}</div>
        ${more.length ? html`<section><h2>More like this</h2>${cardGrid(more, { ads: false })}</section>` : ''}
      </aside>
    </div>
  </article>
  ${jsonData('page-data', { gameId: g.id, slug: g.slug, title: g.title, visibility: g.visibility, shareText: SHARE_TEXT[g.visibility], reasons: REPORT_REASONS, signedIn: !!u })}`;
  page(req, res, { title: g.title, active: 'home', back: '/', backLabel: 'Home', body, description: g.description.slice(0, 160), scripts: ['/js/game.js', '/js/ads.js'] });
});

router.get('/play/:slug', (req, res) => {
  const g = games.getGameBySlug(req.params.slug);
  if (!g || !games.canView(req.user, g)) return notFound(req, res, "This game doesn't exist, or it isn't shared with you.");
  // One tap to play: a visitor without a session becomes a guest so progress saves (rate-limited per IP).
  if (!req.user && req.headers['sec-fetch-mode'] === 'navigate' && allow(`guestip:${req.ip}`, 60, 3600e3)) {
    const guest = createGuest(); req.sessionId = startSession(res, guest.id, req.headers['user-agent']); req.user = guest;
  }
  const u = req.user;
  const isOwner = u && (u.id === g.owner_id || u.role === 'admin');
  const versionId = g.published_version_id || (isOwner ? g.current_version_id : null);
  if (!versionId) return notFound(req, res, 'This game is not ready yet.');
  const token = signToken({ v: versionId, g: g.id, u: u ? u.id : null });
  const body = html`
  <div class="playbar">
    <a class="iconbtn" href="/g/${g.slug}" aria-label="Back to ${g.title}"><span class="emo" aria-hidden="true">←</span><span class="lbl">Back</span></a>
    <span class="ptitle">${g.icon} ${g.title}</span>
    <span class="livecount" data-live="${g.id}" data-live-format="bar"></span>
    <button class="iconbtn" type="button" id="p-like" aria-pressed="${games.userLiked(g.id, u && u.id)}" aria-label="Like"><span class="emo" aria-hidden="true">${games.userLiked(g.id, u && u.id) ? '❤️' : '🤍'}</span><span class="lbl">Like</span></button>
    <button class="iconbtn" type="button" id="p-rate" aria-label="Rate"><span class="emo" aria-hidden="true">⭐</span><span class="lbl">Rate</span></button>
    <button class="iconbtn" type="button" id="p-full" aria-label="Full screen"><span class="emo" aria-hidden="true">⛶</span><span class="lbl">Full screen</span></button>
  </div>
  <div class="stage" id="stage">
    <iframe id="gameframe" title="${g.title}" src="/frame/${token}" sandbox="${SANDBOX}" allow="fullscreen; autoplay" allowfullscreen referrerpolicy="no-referrer"></iframe>
  </div>
  <div class="orient-hint ${g.orientation === 'landscape' ? 'show' : ''}" id="orient"><div><div class="emo" aria-hidden="true">📱</div><h2>Turn your phone sideways</h2><p>This game is best in landscape.</p><button class="btn" type="button" id="orient-ok">Play anyway</button></div></div>
  ${jsonData('page-data', { gameId: g.id, slug: g.slug, title: g.title, signedIn: !!u, myStars: games.userRating(g.id, u && u.id), canSave: !!u })}`;
  page(req, res, { title: g.title, bare: true, bodyClass: `playmode ${g.orientation === 'landscape' ? 'wants-landscape' : ''}`, body, scripts: ['/js/play.js'] });
});

// The frame: no cookies are needed; access comes from the short-lived signed token minted for the play/studio page.
router.get('/frame/:token', (req, res) => {
  const t = readToken(req.params.token);
  if (!t) return res.status(403).type('text').send('This game link expired. Go back and press Play again.');
  const v = games.getVersion(t.v); const g = v && games.getGame(v.game_id);
  if (!v || !g || g.id !== t.g) return res.status(404).type('text').send('Not found');
  const u = t.u ? getUser(t.u) : null;
  const preview = !!t.p;
  const init = {
    user: u ? { displayName: u.display_name, avatar: u.avatar, isGuest: !!u.is_guest } : { displayName: 'Player', avatar: '🙂', isGuest: true },
    game: { id: g.id, title: g.title },
    save: u && !preview ? games.getSave(g.id, u.id) : {},
    canSave: !!u && !preview,
    preview,
  };
  sendFrame(res, frameDocument(v.html, init));
});

// ---- APIs used by game.js / play.js ----
function apiGame(req, res) {
  const g = games.getGame(req.params.id);
  if (!g || !games.canView(req.user, g)) { res.status(404).json({ error: 'Game not found.' }); return null; }
  return g;
}
router.post('/api/games/:id/rate', requireUser, rateLimit('rate', 30, 60e3), (req, res) => {
  const g = apiGame(req, res); if (!g) return;
  const s = Math.round(+(req.body || {}).stars);
  if (!(s >= 1 && s <= 5)) return res.status(400).json({ error: 'Pick 1 to 5 stars.' });
  res.json({ ok: true, ...games.rate(g.id, req.user.id, s) });
});
router.post('/api/games/:id/like', requireUser, rateLimit('like', 30, 60e3), (req, res) => {
  const g = apiGame(req, res); if (!g) return;
  res.json({ ok: true, ...games.toggleLike(g.id, req.user.id) });
});
router.post('/api/games/:id/play', rateLimit('play', 60, 60e3), (req, res) => {
  const g = apiGame(req, res); if (!g) return;
  const key = req.sessionId || `anon:${req.ip}`;
  presence.touch(g.id, key, req.user ? req.user.id : null);
  const playId = games.recordPlay(g.id, req.user && req.user.id);
  res.json({ ok: true, playId, playing: presence.count(g.id) });
});
router.post('/api/games/:id/heartbeat', rateLimit('hb', 30, 60e3), (req, res) => {
  const g = apiGame(req, res); if (!g) return;
  presence.touch(g.id, req.sessionId || `anon:${req.ip}`, req.user ? req.user.id : null);
  res.json({ ok: true, playing: presence.count(g.id) });
});
// sendBeacon posts text/plain; accept both.
router.post('/api/games/:id/leave', (req, res) => {
  const g = games.getGame(req.params.id); if (!g) return res.status(404).end();
  presence.leave(g.id, req.sessionId || `anon:${req.ip}`);
  let body = req.body; if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  if (body && body.playId) games.endPlay(String(body.playId), req.user ? req.user.id : null);
  res.status(204).end();
});
router.post('/api/games/:id/save', requireUser, rateLimit('save', 60, 60e3), (req, res) => {
  const g = apiGame(req, res); if (!g) return;
  try { games.putSave(g.id, req.user.id, (req.body || {}).data); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
router.get('/api/games/:id/save', requireUser, (req, res) => {
  const g = apiGame(req, res); if (!g) return;
  res.json({ data: games.getSave(g.id, req.user.id) });
});
router.post('/api/games/:id/score', requireUser, rateLimit('score', 30, 60e3), (req, res) => {
  const g = apiGame(req, res); if (!g) return;
  const { score, label } = req.body || {};
  if (!Number.isFinite(+score) || +score < 0) return res.status(400).json({ error: 'Bad score.' });
  res.json({ ok: true, ...games.submitScore(g.id, req.user.id, +score, label) });
});
router.get('/api/games/:id/leaderboard', (req, res) => {
  const g = apiGame(req, res); if (!g) return;
  res.json({ rows: games.leaderboard(g.id, 10).map(r => ({ name: r.display_name, avatar: r.avatar, score: r.score, label: r.label })) });
});
// Reports: any signed-in player (guests included) can report with a simple reason. N open reports auto-hide the game.
router.post('/api/games/:id/report', requireUser, rateLimit('report', 10, 3600e3), (req, res) => {
  const g = games.getGame(req.params.id);
  if (!g || !games.canView(req.user, g)) return res.status(404).json({ error: 'Game not found.' });
  const reason = String((req.body || {}).reason || '');
  if (!REPORT_REASONS.some(([k]) => k === reason)) return res.status(400).json({ error: 'Pick a reason.' });
  const details = String((req.body || {}).details || '').slice(0, 300);
  if (q.get("SELECT 1 FROM reports WHERE game_id=? AND user_id=? AND status='open'", g.id, req.user.id)) return res.json({ ok: true, already: true, message: 'Thanks, we already have your report.' });
  q.run('INSERT INTO reports(id, game_id, user_id, reason, details, created_at) VALUES (?,?,?,?,?,?)', uid(), g.id, req.user.id, reason, details, now());
  const open = q.get("SELECT COUNT(DISTINCT user_id) n FROM reports WHERE game_id=? AND status='open'", g.id).n;
  if (open >= config.reportsToHide && !g.hidden_reason && g.owner_id !== req.user.id) {
    q.run("UPDATE games SET hidden_reason='reports', updated_at=? WHERE id=?", now(), g.id);
    audit(null, 'game.auto_hidden', g.id, { reports: open });
  }
  res.json({ ok: true, message: 'Thank you for telling us. A grown-up on our team will take a look.' });
});
