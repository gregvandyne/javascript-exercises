// Build mode: the /build page (my games + "Start from" templates), the Studio (/studio/:id) and its APIs.
// Owner or admin only for everything under a game id (404 otherwise). The Builder chat streams over SSE.
import express, { Router } from 'express';
import { html, raw, jsonData, timeAgo } from '../views/html.js';
import { page, notFound } from '../views/layout.js';
import { coverArt, emptyState, VIS_LABEL } from '../views/components.js';
import * as games from '../services/games.js';
import { publish, setVisibility } from '../services/publish.js';
import { cleanText } from '../services/textfilter.js';
import { requireAccount } from '../auth.js';
import { rateLimit } from '../services/ratelimit.js';
import { audit } from '../db.js';
import { listTemplates, templateHtml, templateInfo, TEMPLATE_KEYS } from '../builder/catalog.js';
import { scanVersion } from '../services/scanner.js';
import { SANDBOX } from '../services/frame.js'; // the SAME sandbox players get (never allow-same-origin)
import { sanitizeGameHtml } from '../services/sanitize.js';
import { runTurn, providerName, isBusy } from '../builder/agent.js';
import { turnsLeft, dailyTurns } from '../builder/usage.js';
import { loadChat } from '../builder/chat.js';
import { previewUrl } from '../builder/tools.js';
import { saveUpload, getUpload, deleteUpload, readUploadBytes, listUploads, LIMITS, UploadError } from '../builder/uploads.js';

export const router = Router();

export const SHARE_TEXT = {
  private: 'Only you can play it.',
  friends: 'Only you and your friends on Magic Cup can play it.',
  public: 'Everyone on Magic Cup can find and play it, after a quick safety check.',
};
export const ICONS = ['🎮', '🦈', '🐉', '🦖', '🤖', '🦄', '🚀', '👽', '🐱', '🐶', '🦊', '🐧', '🐰', '🐸', '🐙', '🐝', '🐠', '🐵', '🦁', '🐼', '👻', '🏴‍☠️', '👸', '🧙', '🥷', '🦋', '🐢', '🦉', '🐻', '🍕', '🧁', '🍎', '⚽', '🏀', '🚗', '🚂', '⛄', '⭐', '🌈', '🌸', '🏆', '🎲', '🧩', '🔤', '❓', '🎵', '💎', '🏰'];

/** One plain-words status for a builder's own game. */
export function studioStatus(g) {
  if (g.hidden_reason) return { label: '⚠️ Hidden for now', tone: 'bad', live: false };
  if (g.status === 'suspended') return { label: '⛔ Switched off by our team', tone: 'bad', live: false };
  if (g.status === 'in_review') return { label: '⏳ In review', tone: 'warn', live: false };
  if (g.status === 'rejected') return { label: '✏️ Needs changes', tone: 'warn', live: false };
  if (g.status !== 'published' || !g.published_version_id) return { label: '📝 Draft', tone: '', live: false };
  return { label: `Live: ${VIS_LABEL[g.visibility] || g.visibility}`, tone: 'good', live: true };
}

function loadEditable(req, res, { api = true } = {}) {
  const g = games.getGame(req.params.id);
  if (!g || !games.canEdit(req.user, g)) {
    if (api) res.status(404).json({ error: 'Game not found.' }); else notFound(req, res, "This game doesn't exist, or it isn't yours to edit.");
    return null;
  }
  return g;
}

/** Everything the Studio client needs, as JSON. */
export function studioState(user, gameId) {
  const g = games.getGame(gameId);
  const versions = games.listVersions(g.id);
  const cur = g.current_version_id ? games.getVersion(g.current_version_id) : null;
  const num = id => { const v = versions.find(x => x.id === id); return v ? v.number : null; };
  let report = {}; try { report = cur ? JSON.parse(cur.safety_report || '{}') : {}; } catch { /* ignore */ }
  const chat = loadChat(g.id);
  return {
    game: { id: g.id, slug: g.slug, title: g.title, icon: g.icon, description: g.description, category: g.category, tags: g.tags, orientation: g.orientation, players_max: g.players_max, cover: g.cover, visibility: g.visibility, status: g.status, review_note: g.review_note, hidden_reason: g.hidden_reason },
    status: studioStatus(g),
    versions: versions.map(v => ({ id: v.id, number: v.number, notes: v.notes, safety: v.safety_status, review: v.review_status, at: v.created_at, live: v.id === g.published_version_id, pending: v.id === g.pending_version_id, current: v.id === g.current_version_id })),
    current: cur ? { id: cur.id, number: cur.number, safety: cur.safety_status, issues: (report.issues || []).map(i => ({ level: i.level, message: i.message })) } : null,
    live: g.status === 'published' && g.published_version_id ? { number: num(g.published_version_id), visibility: g.visibility, id: g.published_version_id } : null,
    pending: g.pending_version_id ? { number: num(g.pending_version_id), id: g.pending_version_id } : null,
    preview: cur ? previewUrl(cur, g, user.id) : null,
    chat: chat.messages,
    turnsLeft: turnsLeft(user.id), dailyTurns: dailyTurns(), provider: providerName(), busy: isBusy(g.id),
    shareText: SHARE_TEXT, shareUrl: `/g/${g.slug}`,
    uploads: { limits: LIMITS, used: listUploads(g.id).length },
  };
}

// ---------------------------------------------------------------- pages
router.get('/build', requireAccount, async (req, res) => {
  const mine = games.myGames(req.user.id, 100);
  const templates = await listTemplates();
  const body = html`
  <div class="pagehead"><h1>🛠️ Build a game</h1></div>
  <section class="build-hero panel">
    <div class="build-hero-text"><h2>Make your own game by chatting!</h2><p>Tell the Builder your idea. It builds the game, and you can keep changing it.</p></div>
    <button class="btn btn-primary btn-big" type="button" id="newgame">✨ New game</button>
  </section>
  <section aria-labelledby="tpl-h" class="build-sec">
    <h2 id="tpl-h">Start from</h2>
    <div class="tplgrid">${templates.map(t => html`<button type="button" class="tplcard" data-template="${t.key}" aria-label="Start from ${t.title}">
      ${coverArt({ cover: t.cover, icon: t.icon }, 'tplcover')}<span class="tpl-t">${t.title}</span><span class="tpl-d">${t.description}</span>
      <span class="tpl-p">${t.players > 1 ? '👫 2 players' : '👤 1 player'}</span></button>`)}</div>
  </section>
  <section aria-labelledby="mine-h" class="build-sec">
    <h2 id="mine-h">My games</h2>
    ${mine.length ? html`<ul class="mygames">${mine.map(g => { const s = studioStatus(g); return html`<li class="mygame panel">
      <a class="mg-cover" href="/studio/${g.id}" tabindex="-1" aria-hidden="true">${coverArt(g)}</a>
      <div class="mg-body">
        <h3><a href="/studio/${g.id}">${g.title}</a></h3>
        <div class="mg-status"><span class="stchip ${s.tone}">${s.label}</span>${g.pending_version_id ? html`<span class="stchip warn">⏳ Update waiting for review</span>` : ''}</div>
        ${g.review_note ? html`<p class="mg-note">💬 Reviewer: “${g.review_note}”</p>` : ''}
        <p class="small muted">Changed ${timeAgo(g.updated_at)}</p>
      </div>
      <div class="mg-actions">
        <a class="btn btn-primary" href="/studio/${g.id}">✏️ Edit</a>
        ${g.published_version_id ? html`<a class="btn" href="/g/${g.slug}">▶ Play</a>` : ''}
      </div></li>`; })}</ul>`
    : emptyState({ emoji: '🌱', title: 'No games yet', text: 'Tap “New game” or pick a starter above. Your games will show up here.' })}
  </section>`;
  page(req, res, { title: 'Build', active: 'build', body, head: raw('<link rel="stylesheet" href="/css/studio.css">'), scripts: ['/js/build.js'] });
});

router.get('/studio/:id', requireAccount, (req, res) => {
  const g = loadEditable(req, res, { api: false }); if (!g) return;
  const state = studioState(req.user, g.id);
  const body = html`
  <div class="studio" id="studio">
    <div class="st-top">
      <button class="st-iconbtn" type="button" id="st-icon" aria-label="Change the game icon">${g.icon}</button>
      <label class="sr-only" for="st-title">Game name</label>
      <input class="st-title" id="st-title" maxlength="60" value="${g.title}" autocomplete="off" spellcheck="false">
      <div class="st-actions" role="toolbar" aria-label="Game tools">
        <button class="iconbtn" type="button" id="st-save"><span class="emo" aria-hidden="true">💾</span>Save</button>
        <button class="iconbtn" type="button" id="st-history"><span class="emo" aria-hidden="true">🕘</span>Versions</button>
        <button class="iconbtn" type="button" id="st-settings"><span class="emo" aria-hidden="true">⚙️</span>Settings</button>
        <button class="iconbtn" type="button" id="st-share"><span class="emo" aria-hidden="true">🔗</span>Share</button>
        <button class="btn btn-coral st-publish" type="button" id="st-publish">🚀 Publish</button>
      </div>
    </div>
    <div class="st-live" id="st-live" aria-live="polite"></div>
    <div class="st-main">
      <section class="st-chat" aria-label="Chat with the Builder">
        <div class="st-chat-head">
          <span class="st-bot" aria-hidden="true">🤖</span><b>Builder</b>
          <span class="st-turns" id="st-turns"></span>
          <button class="st-pro" type="button" id="st-pro" aria-pressed="false" title="Pro quality takes longer but builds fancier games">✨ Pro quality</button>
        </div>
        <div class="st-log" id="st-log" role="log" aria-live="polite"></div>
        <form class="st-compose" id="st-compose" autocomplete="off">
          <div class="st-attach" id="st-attach" hidden></div>
          <div class="st-row">
            <button class="st-clip" type="button" id="st-clip" aria-label="Add a picture or file" title="Add a picture or file">📎</button>
            <input type="file" id="st-file" hidden multiple accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,.txt,.md,.csv,.json,text/plain,text/markdown,text/csv,application/json">
            <label class="sr-only" for="st-input">Message to the Builder</label>
            <textarea class="st-input" id="st-input" rows="1" maxlength="2000" placeholder="Tell the Builder your idea…"></textarea>
            <button class="btn btn-primary st-send" type="submit" id="st-send">Send</button>
          </div>
        </form>
      </section>
      <section class="st-preview" aria-label="Game preview">
        <div class="st-prev-head">
          <div class="seg" role="group" aria-label="Preview size">
            <button type="button" data-size="phone" aria-pressed="true">📱 Phone</button><button type="button" data-size="tablet" aria-pressed="false">Tablet</button><button type="button" data-size="landscape" aria-pressed="false">↔️ Sideways</button>
          </div>
          <span class="st-prev-tools"><button class="btn btn-sm" type="button" id="st-reload">↻ Reload</button><button class="btn btn-sm" type="button" id="st-full">⛶ Full screen</button></span>
        </div>
        <div class="st-stage" id="st-stage"><div class="st-device" id="st-device" data-size="phone">
          <iframe id="st-frame" title="Game preview" sandbox="${SANDBOX}" allow="fullscreen; autoplay" allowfullscreen referrerpolicy="no-referrer" ${state.preview ? raw(`src="${state.preview}"`) : ''}></iframe>
          <div class="st-empty" id="st-empty" ${state.preview ? raw('hidden') : ''}><div class="emo" aria-hidden="true">🎨</div><p><b>Your game will appear here.</b></p><p>Tell the Builder your idea to start.</p></div>
        </div></div>
        <div class="st-safety" id="st-safety" aria-live="polite"></div>
      </section>
    </div>
  </div>
  ${jsonData('page-data', { ...state, icons: ICONS, categories: games.CATEGORIES, covers: games.COVERS })}`;
  page(req, res, { title: `Studio: ${g.title}`, active: 'build', back: '/build', backLabel: 'My games', body, bodyClass: 'studio-page', head: raw('<link rel="stylesheet" href="/css/studio.css">'), scripts: ['/js/studio.js'] });
});

// ---------------------------------------------------------------- APIs
router.post('/api/studio/new', requireAccount, rateLimit('studio-new', 30, 3600e3, 'You made lots of games already! Try again a bit later.'), async (req, res) => {
  const key = String((req.body || {}).template || '');
  if (key && !TEMPLATE_KEYS.includes(key)) return res.status(400).json({ error: 'Pick one of the starters.' });
  if (!req.user.builder_enabled) return res.status(403).json({ error: 'Building is switched off for this account.' });
  if (!key) {
    const g = games.createGame(req.user.id, { title: 'My new game', icon: '🎮', cover: games.COVERS[Math.floor(Math.random() * games.COVERS.length)] });
    audit(req.user.id, 'game.create', g.id, {});
    return res.json({ ok: true, id: g.id, url: `/studio/${g.id}` });
  }
  const t = await templateInfo(key);
  const { html: tpl } = await templateHtml(key);
  const g = games.createGame(req.user.id, { title: t.title, icon: t.icon, cover: t.cover, category: t.category, description: t.description, players_max: t.players || 1, tags: key });
  const { html: clean } = sanitizeGameHtml(tpl);
  const report = scanVersion(clean);
  games.addVersion(g.id, clean, { notes: `Started from the ${t.title} starter`, createdBy: req.user.id, safetyStatus: report.status, safetyReport: report });
  audit(req.user.id, 'game.create', g.id, { template: key });
  res.json({ ok: true, id: g.id, url: `/studio/${g.id}` });
});

router.get('/api/studio/:id', requireAccount, (req, res) => {
  const g = loadEditable(req, res); if (!g) return;
  res.json(studioState(req.user, g.id));
});

// The Builder chat: POST, answered as text/event-stream (the client reads it with fetch + ReadableStream).
router.post('/api/studio/:id/chat', requireAccount, rateLimit('builder', 20, 60e3, 'The Builder needs a tiny break. Try again in a minute.'), async (req, res) => {
  const g = loadEditable(req, res); if (!g) return;
  const b = req.body || {};
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no', Connection: 'keep-alive' });
  res.flushHeaders && res.flushHeaders();
  const send = (event, data) => { if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
  const ac = new AbortController();
  res.on('close', () => { if (!res.writableFinished) ac.abort(); });
  const ping = setInterval(() => { if (!res.writableEnded) res.write(': ping\n\n'); }, 15000);
  try {
    await runTurn({ user: req.user, gameId: g.id, text: b.text, pro: !!b.pro, uploadIds: b.uploads, emit: send, signal: ac.signal });
  } catch {
    send('error', { message: 'Something went wrong. Please try again.' }); send('done', { turnsLeft: turnsLeft(req.user.id) });
  } finally { clearInterval(ping); res.end(); }
});

router.post('/api/studio/:id/meta', requireAccount, rateLimit('studio-meta', 60, 60e3), (req, res) => {
  const g = loadEditable(req, res); if (!g) return;
  const b = req.body || {}; const f = {};
  for (const [k, max] of [['title', 60], ['description', 600]]) {
    if (b[k] === undefined) continue;
    const c = cleanText(b[k], max); if (!c.ok) return res.status(400).json({ error: c.error, field: k });
    if (k === 'title' && !c.value) return res.status(400).json({ error: 'Give your game a name.', field: 'title' });
    f[k] = c.value;
  }
  if (b.tags !== undefined) {
    const tags = String(b.tags).split(',').map(t => t.trim().toLowerCase().replace(/^#/, '')).filter(Boolean).slice(0, 8).join(',');
    const c = cleanText(tags, 200); if (!c.ok) return res.status(400).json({ error: c.error, field: 'tags' }); f.tags = c.value;
  }
  if (b.icon !== undefined) { if (!ICONS.includes(b.icon)) return res.status(400).json({ error: 'Pick an icon from the list.' }); f.icon = b.icon; }
  if (b.category !== undefined) { if (!games.CATEGORY_KEYS.includes(b.category)) return res.status(400).json({ error: 'Pick a category.' }); f.category = b.category; }
  if (b.cover !== undefined) { if (!games.COVERS.includes(b.cover)) return res.status(400).json({ error: 'Pick a cover.' }); f.cover = b.cover; }
  if (b.orientation !== undefined) { if (!games.ORIENTATIONS.includes(b.orientation)) return res.status(400).json({ error: 'Pick a direction.' }); f.orientation = b.orientation; }
  if (b.players_max !== undefined) f.players_max = Math.max(1, Math.min(8, Math.round(+b.players_max || 1)));
  games.updateMeta(g.id, f);
  res.json({ ok: true, state: studioState(req.user, g.id) });
});

router.post('/api/studio/:id/restore', requireAccount, rateLimit('studio-restore', 30, 60e3), (req, res) => {
  const g = loadEditable(req, res); if (!g) return;
  const v = games.restoreVersion(g.id, String((req.body || {}).versionId || ''), req.user.id);
  if (!v) return res.status(404).json({ error: 'That version was not found.' });
  res.json({ ok: true, message: `Brought back as version ${v.number}.`, state: studioState(req.user, g.id) });
});

// "Save version": a named checkpoint (a copy of the current version with the builder's note). History is never rewritten.
router.post('/api/studio/:id/save', requireAccount, rateLimit('studio-save', 30, 60e3), (req, res) => {
  const g = loadEditable(req, res); if (!g) return;
  const cur = games.getVersion(g.current_version_id);
  if (!cur) return res.status(400).json({ error: 'Build something first, then save it.' });
  const c = cleanText((req.body || {}).note || '', 80); if (!c.ok) return res.status(400).json({ error: c.error });
  const v = games.addVersion(g.id, cur.html, { notes: `⭐ Saved: ${c.value || 'my favourite so far'}`, createdBy: req.user.id, safetyStatus: cur.safety_status, safetyReport: JSON.parse(cur.safety_report || '{}') });
  res.json({ ok: true, message: `Saved as version ${v.number}.`, state: studioState(req.user, g.id) });
});

const VIS = ['private', 'friends', 'public'];
router.post('/api/studio/:id/publish', requireAccount, rateLimit('studio-publish', 20, 60e3), async (req, res) => {
  const g = loadEditable(req, res); if (!g) return;
  const vis = String((req.body || {}).visibility || '');
  if (!VIS.includes(vis)) return res.status(400).json({ error: 'Pick who can play.' });
  const r = await publish(req.user, g.id, vis);
  res.status(r.ok ? 200 : 400).json({ ...r, game: undefined, error: r.ok ? undefined : r.message, state: studioState(req.user, g.id) });
});
// Update an already-live game to the version being edited, at its current sharing level.
router.post('/api/studio/:id/update', requireAccount, rateLimit('studio-publish', 20, 60e3), async (req, res) => {
  const g = loadEditable(req, res); if (!g) return;
  if (g.status !== 'published' || !g.published_version_id) return res.status(400).json({ error: 'This game is not live yet. Use Publish first.' });
  // A request to go public is waiting while the game is live for friends/only me: update the live game now AND
  // send the new version for the public check, so the builder's request to share with everyone is not lost.
  const wantsPublic = g.pending_version_id && g.visibility !== 'public';
  let r = await publish(req.user, g.id, g.visibility);
  if (r.ok && wantsPublic) {
    const p = await publish(req.user, g.id, 'public');
    r = { ...p, ok: true, message: p.state === 'live' ? p.message : `Updated for ${g.visibility === 'friends' ? 'your friends' : 'you'}! The new version is also waiting for its check before everyone can play.` };
  }
  res.status(r.ok ? 200 : 400).json({ ...r, game: undefined, error: r.ok ? undefined : r.message, state: studioState(req.user, g.id) });
});
// Change who can play a live game (keeps the live version).
router.post('/api/studio/:id/visibility', requireAccount, rateLimit('studio-publish', 20, 60e3), async (req, res) => {
  const g = loadEditable(req, res); if (!g) return;
  const vis = String((req.body || {}).visibility || '');
  if (!VIS.includes(vis)) return res.status(400).json({ error: 'Pick who can play.' });
  const r = await setVisibility(req.user, g.id, vis);
  res.status(r.ok ? 200 : 400).json({ ...r, game: undefined, error: r.ok ? undefined : r.message, state: studioState(req.user, g.id) });
});

// ---- Uploads (inspiration pictures and files). Raw body: the file bytes; ?name= the file name.
router.post('/api/studio/:id/uploads', requireAccount, rateLimit('studio-upload', 30, 60e3, 'That is a lot of files! Wait a minute and try again.'),
  express.raw({ type: () => true, limit: '6mb' }), async (req, res) => {
    const g = loadEditable(req, res); if (!g) return;
    try {
      const u = await saveUpload({ user: req.user, game: g, name: String(req.query.name || 'file'), bytes: Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0) });
      res.json({ ok: true, upload: u });
    } catch (e) {
      if (e instanceof UploadError) return res.status(e.status).json({ error: e.message });
      throw e;
    }
  });
router.get('/api/studio/:id/uploads/:uid', requireAccount, (req, res) => {
  const g = loadEditable(req, res); if (!g) return;
  const u = getUpload(req.params.uid);
  if (!u || u.game_id !== g.id) return res.status(404).json({ error: 'Not found' });
  let bytes; try { bytes = readUploadBytes(u); } catch { return res.status(404).json({ error: 'Not found' }); }
  const mime = u.kind === 'text' ? 'text/plain; charset=utf-8' : u.mime; // never SVG or HTML
  res.set({
    'Content-Type': mime, 'Content-Disposition': `inline; filename="${encodeURIComponent(u.name)}"`, 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'", 'Cache-Control': 'private, max-age=3600', 'Cross-Origin-Resource-Policy': 'same-origin',
  });
  res.send(bytes);
});
router.delete('/api/studio/:id/uploads/:uid', requireAccount, (req, res) => {
  const g = loadEditable(req, res); if (!g) return;
  const u = getUpload(req.params.uid);
  if (!u || u.game_id !== g.id) return res.status(404).json({ error: 'Not found' });
  if (u.used_at) return res.status(400).json({ error: 'That one was already sent to the Builder.' });
  deleteUpload(u); res.json({ ok: true });
});
