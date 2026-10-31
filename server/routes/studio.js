// Build mode: the /build page (my games + "Start from" templates), the Studio (/studio/:id) and its APIs.
// Owner or admin only for everything under a game id (404 otherwise). A Builder build runs in the Builder runner
// (builder/runner.js), apart from any request, so a closed page or a sign-out never stops it: POST /chat starts it and
// answers at once, and each Studio tab follows it on GET /live (builder/live.js), which replays a running build in full.
import express, { Router } from 'express';
import { html, raw, jsonData } from '../views/html.js';
import { page, notFound } from '../views/layout.js';
import { coverArt, emptyState, visLabel, categoryLabel } from '../views/components.js';
import * as games from '../services/games.js';
import { publish, setVisibility } from '../services/publish.js';
import { cleanText } from '../services/textfilter.js';
import { requireBuilder, getUser, isGrownup } from '../auth.js';
import { rateLimit, allow } from '../services/ratelimit.js';
import { sttEnabled, liveEnabled, transcribe, sniff, baseMime, MIMES, KINDS, SttError, clipSeconds, countedSeconds, RATE } from '../services/stt.js';
import { consumeFallback } from '../services/stt-live.js';
import * as sttUsage from '../services/stt-usage.js';
import { log } from '../services/log.js';
import { config } from '../config.js';
import { audit } from '../db.js';
import { listTemplates, templateHtml, templateInfo, TEMPLATE_KEYS } from '../builder/catalog.js';
import { scanVersion } from '../services/scanner.js';
import { SANDBOX } from '../services/frame.js'; // the SAME sandbox players get (never allow-same-origin)
import { sanitizeGameHtml } from '../services/sanitize.js';
import { providerName } from '../builder/agent.js';
import { restingUntil } from '../builder/anthropic.js';
import { isBusy, cancel as cancelBuild, life as builderLife, submit, publicTurn, lastTurn } from '../builder/runner.js';
import * as live from '../builder/live.js';
import * as turns from '../builder/turns.js';
import { allowanceFor, counter, familyOf } from '../builder/usage.js';
import { loadChat } from '../builder/chat.js';
import { previewUrl } from '../builder/tools.js';
import { saveUpload, getUpload, deleteUpload, readUploadBytes, listUploads, LIMITS, UploadError } from '../builder/uploads.js';
import { tEn } from '../i18n/index.js';
import { familiesOn, isChildAccount, liveRowOf } from '../services/family.js';
import { sharingOptions, shareDefault, shareableClasses, gameClassIds, removedClassIds } from '../services/schools.js';

export const router = Router();

/** What each sharing level means, in the reader's language. grownup: the owner is a grown-up builder, whose 'friends'
 *  are their grown-up connections. */
export const shareText = (t = tEn, grownup = false) => ({ private: t('studio.shareText.private'), family: t('studio.shareText.family'), friends: t(grownup ? 'studio.shareText.connections' : 'studio.shareText.friends'), class: t('studio.shareText.class'), school: t('studio.shareText.school'), public: t('studio.shareText.public') });
export const ICONS = ['🎮', '🦈', '🐉', '🦖', '🤖', '🦄', '🚀', '👽', '🐱', '🐶', '🦊', '🐧', '🐰', '🐸', '🐙', '🐝', '🐠', '🐵', '🦁', '🐼', '👻', '🏴‍☠️', '👸', '🧙', '🥷', '🦋', '🐢', '🦉', '🐻', '🍕', '🧁', '🍎', '⚽', '🏀', '🚗', '🚂', '⛄', '⭐', '🌈', '🌸', '🏆', '🎲', '🧩', '🔤', '❓', '🎵', '💎', '🏰'];

/** One plain-words status for a builder's own game. code: hidden|suspended|in_review|rejected|draft|live */
export function studioStatus(g, t = tEn) {
  if (g.hidden_reason) return { code: 'hidden', label: `⚠️ ${t('studio.status.hidden')}`, tone: 'bad', live: false };
  if (g.status === 'suspended') return { code: 'suspended', label: `⛔ ${t('studio.status.suspended')}`, tone: 'bad', live: false };
  if (g.status === 'in_review') return { code: 'in_review', label: `⏳ ${t('status.inReview')}`, tone: 'warn', live: false };
  if (g.status === 'rejected') return { code: 'rejected', label: `✏️ ${t('status.needsChanges')}`, tone: 'warn', live: false };
  if (g.status !== 'published' || !g.published_version_id) return { code: 'draft', label: `📝 ${t('status.draft')}`, tone: '', live: false };
  return { code: 'live', label: t('studio.status.live', { who: visLabel(g.visibility, t, g.visibility === 'class' ? games.liveClasses(g.id).length : 1, { grownup: isGrownup(getUser(g.owner_id)) }) }), tone: 'good', live: true };
}

/** The share dialog's class choices for a game's owner (see docs/decisions.md, "Share with my classes"):
 *  classes: the owner's classes now ({ id, name, school, chosen: on the game's list, removed: a teacher took the game
 *  off it, so it can't be picked }); multiSchool: show school names; live: the classes a 'class' game reaches now;
 *  lost: classes on the list that no longer count (the owner left, or the class was archived). */
export function classShare(g, ownerId) {
  const mine = shareableClasses(ownerId);
  const chosen = new Set(gameClassIds(g.id)), removed = new Set(removedClassIds(g.id)), have = new Set(mine.map(c => c.id));
  return {
    classes: mine.map(c => ({ id: c.id, name: c.name, school: c.school_name, chosen: chosen.has(c.id), removed: removed.has(c.id) })),
    multiSchool: new Set(mine.map(c => c.school_id)).size > 1,
    live: g.visibility === 'class' ? games.liveClasses(g.id).map(c => ({ id: c.id, name: c.name })) : [],
    lost: [...chosen].filter(id => !have.has(id)).length,
  };
}

function loadEditable(req, res, { api = true } = {}) {
  const g = games.getGame(req.params.id);
  if (!g || !games.canEdit(req.user, g)) {
    if (api) res.status(404).json({ error: req.t('game.api.notFound') }); else notFound(req, res, req.t('studio.notYours'));
    return null;
  }
  return g;
}

/** May the daily-limit card say "A grown-up can link to your account" (Me › For grown-ups)? Only for a kid's own
 *  account with no grown-up linked or asked yet, and only while family pages are on for this visitor. Never a plan,
 *  price or /plans link: this is a kid's page. */
export const grownUpLinkHint = (req, user) => !!req && familiesOn(req) && isChildAccount(user) && !liveRowOf(user.id);
/** Everything the Studio client needs, as JSON. t: the reader's language (labels, share texts, preview language).
 *  req: the request, for what depends on the visitor (grownUpLink). */
export function studioState(user, gameId, t = tEn, req = null) {
  const g = games.getGame(gameId);
  const versions = games.listVersions(g.id);
  const cur = g.current_version_id ? games.getVersion(g.current_version_id) : null;
  const num = id => { const v = versions.find(x => x.id === id); return v ? v.number : null; };
  let report = {}; try { report = cur ? JSON.parse(cur.safety_report || '{}') : {}; } catch { /* ignore */ }
  const chat = loadChat(g.id);
  const owner = getUser(g.owner_id), grownup = isGrownup(owner);
  return {
    game: { id: g.id, slug: g.slug, title: g.title, icon: g.icon, description: g.description, category: g.category, tags: g.tags, orientation: g.orientation, players_max: g.players_max, cover: g.cover, visibility: g.visibility, status: g.status, review_note: g.review_note, hidden_reason: g.hidden_reason },
    status: studioStatus(g, t),
    versions: versions.map(v => ({ id: v.id, number: v.number, notes: v.notes, safety: v.safety_status, review: v.review_status, at: v.created_at, live: v.id === g.published_version_id, pending: v.id === g.pending_version_id, current: v.id === g.current_version_id })),
    current: cur ? { id: cur.id, number: cur.number, safety: cur.safety_status, issues: (report.issues || []).map(i => ({ level: i.level, code: i.code, message: i.message })) } : null,
    live: g.status === 'published' && g.published_version_id ? { number: num(g.published_version_id), visibility: g.visibility, id: g.published_version_id } : null,
    pending: g.pending_version_id ? { number: num(g.pending_version_id), id: g.pending_version_id, visibility: g.pending_visibility || 'public' } : null,
    preview: cur ? previewUrl(cur, g, user.id, t.locale) : null,
    chat: chat.messages,
    ...counter(user), dailyTurns: allowanceFor(user).daily, provider: providerName(allowanceFor(user).pool), resting: restingUntil(allowanceFor(user).pool), busy: isBusy(g.id),
    // The running build as this viewer sees it (its message and what it said so far), and how the last one ended.
    turn: publicTurn(g.id, user), lastTurn: lastTurn(g.id, user),
    shareText: shareText(t, grownup), shareUrl: `/g/${g.slug}`, shareOptions: sharingOptions(owner, g), shareDefault: shareDefault(owner), classShare: classShare(g, g.owner_id),
    // A grown-up builder's game: "My grown-up connections" for 'friends', a hint under each choice, and the name a public
    // game is credited to (shown to the grown-up only; never their children's names).
    // seePlans: the out-of-messages card links to /plans only while that page is open (family pages on) and this grown-up's
    // own family plan doesn't already cover their Builder messages.
    grownup: grownup ? { name: owner.display_name, seePlans: !!req && familiesOn(req) && isGrownup(user) && !familyOf(user.id) } : null,
    uploads: { limits: LIMITS, used: listUploads(g.id).length },
    // Speech to text (services/stt.js): only when the owner turned it on; the page hides the mic otherwise.
    // Not while the Builder is off for this account (a grown-up or teacher turned it off): no voice leaves the site then.
    // live: words show while the kid speaks (services/stt-live.js), unless STT_LIVE=0; the page records and uploads otherwise.
    mic: sttEnabled() && user.builder_enabled ? { maxMs: config.sttMaxSeconds * 1000, maxBytes: config.sttMaxBytes, live: liveEnabled(), ...(liveEnabled() ? { rate: RATE[config.sttProvider] } : {}) } : null,
    grownUpLink: grownUpLinkHint(req, user),
  };
}

// ---------------------------------------------------------------- pages
/** The Builder chip on a "My games" card: building, ready, a question, or stopped (text and emoji, never colour alone). */
const BUILD_TONE = { building: 'warn', ready: 'good', question: 'good', stopped: 'bad' };
const buildChip = (st, t) => (st ? html`<span class="stchip ${BUILD_TONE[st]}">${t(`build.status.${st}`)}</span>` : '');

router.get('/build', requireBuilder, async (req, res) => {
  const t = req.t;
  const mine = games.myGames(req.user.id, 100);
  const news = turns.buildStatus(req.user.id);
  const templates = await listTemplates();
  const tpl = (k, field, fallback) => (t.has(`studio.templates.${k}.${field}`) ? t(`studio.templates.${k}.${field}`) : fallback);
  const body = html`
  <div class="pagehead"><h1>🛠️ ${t('build.title')}</h1></div>
  <section class="build-hero panel">
    <div class="build-hero-text"><h2>${t('build.hero.heading')}</h2><p>${t('build.hero.text')}</p></div>
    <button class="btn btn-primary btn-big" type="button" id="newgame">✨ ${t('build.newGame')}</button>
  </section>
  <section aria-labelledby="tpl-h" class="build-sec">
    <h2 id="tpl-h">${t('build.startFrom')}</h2>
    <div class="tplgrid">${templates.map(tp => { const title = tpl(tp.key, 'title', tp.title); return html`<button type="button" class="tplcard" data-template="${tp.key}"${tp.threeD ? ' data-threed="1"' : ''} aria-label="${t('build.startFromLabel', { title })}">
      ${coverArt({ cover: tp.cover, icon: tp.icon }, 'tplcover')}<span class="tpl-t">${title}</span><span class="tpl-d">${tpl(tp.key, 'description', tp.description)}</span>
      <span class="tpl-p">${tp.players > 1 ? `👫 ${t('build.twoPlayers')}` : `👤 ${t('game.about.onePlayer')}`}</span></button>`; })}</div>
  </section>
  <section aria-labelledby="mine-h" class="build-sec">
    <h2 id="mine-h">${t('home.rails.mine')}</h2>
    ${mine.length ? html`<ul class="mygames">${mine.map(g => { const s = studioStatus(g, t); return html`<li class="mygame panel" data-id="${g.id}" data-title="${g.title}" data-live="${s.live ? '1' : ''}">
      <a class="mg-cover" href="/studio/${g.id}" tabindex="-1" aria-hidden="true">${coverArt(g, '', { draft: true })}</a>
      <div class="mg-body">
        <h3><a href="/studio/${g.id}">${g.title}</a></h3>
        <div class="mg-status"><span class="stchip ${s.tone}">${s.label}</span>${buildChip(news.get(g.id), t)}${g.pending_version_id ? html`<span class="stchip warn">⏳ ${t('build.updateWaiting')}</span>` : ''}</div>
        ${g.review_note ? html`<p class="mg-note">💬 ${t('game.reviewer', { note: g.review_note })}</p>` : ''}
        <p class="small muted">${t('build.changed', { when: req.fmt.ago(g.updated_at) })}</p>
      </div>
      <div class="mg-actions">
        <div class="mg-row">
          <a class="btn btn-primary" href="/studio/${g.id}">✏️ ${t('game.edit')}</a>
          ${g.published_version_id ? html`<a class="btn" href="/g/${g.slug}">▶ ${t('game.play')}</a>` : ''}
        </div>
        <div class="mg-row mg-more">
          <button class="btn" type="button" data-rename>🏷️ ${t('build.rename')}</button>
          ${g.source === 'seed' ? '' : html`<button class="btn mg-del" type="button" data-delete>🗑️ ${t('build.delete')}</button>`}
        </div>
      </div></li>`; })}</ul>`
    : emptyState({ emoji: '🌱', title: t('home.empty.title'), text: t('build.empty') })}
  </section>`;
  page(req, res, { title: t('nav.build'), active: 'build', body, head: raw('<link rel="stylesheet" href="/css/studio.css">'), scripts: ['/js/build.js'] });
});

router.get('/studio/:id', requireBuilder, (req, res) => {
  const t = req.t;
  const g = loadEditable(req, res, { api: false }); if (!g) return;
  if (req.user.id === g.owner_id) turns.markSeen(g.id);   // the owner sees how the last build ended: no more "Ready" news
  const state = studioState(req.user, g.id, t, req);
  // The microphone is allowed on this page only, and only while speech to text is on (the game frame never gets it).
  if (state.mic) res.set('Permissions-Policy', 'camera=(), microphone=(self), geolocation=(), payment=(), interest-cohort=()');
  const body = html`
  <div class="studio" id="studio">
    <div class="st-top">
      <button class="st-iconbtn" type="button" id="st-icon" aria-label="${t('studio.top.icon')}">${g.icon}</button>
      <label class="sr-only" for="st-title">${t('studio.top.name')}</label>
      <input class="st-title" id="st-title" maxlength="60" value="${g.title}" dir="auto" autocomplete="off" spellcheck="false">
      <div class="st-actions" role="toolbar" aria-label="${t('studio.top.tools')}">
        <button class="iconbtn" type="button" id="st-save"><span class="emo" aria-hidden="true">💾</span>${t('studio.top.save')}</button>
        <button class="iconbtn" type="button" id="st-history"><span class="emo" aria-hidden="true">🕘</span>${t('studio.top.versions')}</button>
        <button class="iconbtn" type="button" id="st-settings"><span class="emo" aria-hidden="true">⚙️</span>${t('studio.top.settings')}</button>
        <button class="iconbtn" type="button" id="st-share"><span class="emo" aria-hidden="true">🔗</span>${t('game.share')}</button>
        <button class="btn btn-hot st-publish" type="button" id="st-publish">🚀 ${t('studio.top.publish')}</button>
      </div>
    </div>
    <div class="st-live" id="st-live" aria-live="polite"></div>
    <p class="sr-only" id="st-steps-live" aria-live="polite" aria-atomic="true"></p>
    <div class="st-main">
      <section class="st-chat" aria-label="${t('studio.chat.label')}">
        <div class="st-chat-head">
          <span class="st-bot" aria-hidden="true">🤖</span><b>${t('studio.chat.builder')}</b>
          <span class="st-turns" id="st-turns"${t.own('js.studio.turnsLeftToday') ? '' : html` data-class-en`}></span>
          <button class="st-pro" type="button" id="st-pro" aria-pressed="false" title="${t('studio.chat.proTitle')}">✨ ${t('studio.chat.pro')}</button>
        </div>
        <div class="st-log" id="st-log" role="log" aria-live="polite"></div>
        <form class="st-compose" id="st-compose" autocomplete="off">
          <div class="st-limit" id="st-limit" role="status"${t.own('js.studio.limitCard.heading') ? '' : html` lang="en" dir="ltr"`} hidden></div>
          <div class="st-attach" id="st-attach" hidden></div>
          <div class="st-row">
            <button class="st-clip" type="button" id="st-clip" aria-label="${t('studio.chat.attach')}" title="${t('studio.chat.attach')}">📎</button>
            <input type="file" id="st-file" hidden multiple accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,.txt,.md,.csv,.json,text/plain,text/markdown,text/csv,application/json">
            <label class="sr-only" for="st-input">${t('studio.chat.inputLabel')}</label>
            <textarea class="st-input" id="st-input" rows="1" maxlength="2000" dir="auto" placeholder="${t('studio.chat.placeholder')}" data-short="${t('studio.chat.placeholderShort')}"></textarea>
            ${state.mic ? html`<button class="st-mic" type="button" id="st-mic" aria-pressed="false" aria-describedby="st-mic-status" aria-label="${t('studio.mic.start')}" title="${t('studio.mic.start')}" hidden><span class="st-mic-ico" aria-hidden="true">🎤</span></button>` : ''}
            <button class="btn btn-primary st-send" type="submit" id="st-send">${t('chat.thread.send')}</button>
          </div>
          ${state.mic ? html`<p class="st-mic-status" id="st-mic-status" role="status" aria-live="polite"></p><p class="sr-only" id="st-mic-said" aria-live="polite" aria-atomic="true"></p>` : ''}
        </form>
      </section>
      <section class="st-preview" aria-label="${t('studio.preview.label')}">
        <div class="st-prev-head">
          <div class="seg" role="group" aria-label="${t('studio.preview.size')}">
            <button type="button" data-size="phone" aria-pressed="true">📱 ${t('studio.preview.phone')}</button><button type="button" data-size="tablet" aria-pressed="false">${t('studio.preview.tablet')}</button><button type="button" data-size="landscape" aria-pressed="false">↔️ ${t('studio.preview.sideways')}</button>
          </div>
          <span class="st-prev-tools"><button class="btn btn-sm" type="button" id="st-reload">↻ ${t('studio.preview.reload')}</button><button class="btn btn-sm" type="button" id="st-full">⛶ ${t('play.fullScreen')}</button></span>
        </div>
        <div class="st-stage" id="st-stage" dir="ltr"><div class="st-device" id="st-device" data-size="phone">
          <iframe id="st-frame" title="${t('studio.preview.label')}" sandbox="${SANDBOX}" allow="fullscreen; autoplay" allowfullscreen referrerpolicy="no-referrer" ${state.preview ? raw(`src="${state.preview}"`) : ''}></iframe>
          <div class="st-empty" id="st-empty" dir="${req.dir}" ${state.preview ? raw('hidden') : ''}><div class="emo" aria-hidden="true">🎨</div><p><b>${t('studio.preview.emptyTitle')}</b></p><p>${t('studio.preview.emptyText')}</p></div>
        </div></div>
        <div class="st-safety" id="st-safety" aria-live="polite"></div>
      </section>
    </div>
  </div>
  ${jsonData('page-data', { ...state, icons: ICONS, categories: games.CATEGORIES.map(([k, i]) => [k, i, categoryLabel(k, t)]), covers: games.COVERS })}`;
  page(req, res, { title: t('studio.title', { title: g.title }), active: 'build', back: '/build', backLabel: t('home.rails.mine'), body, bodyClass: 'studio-page', head: raw('<link rel="stylesheet" href="/css/studio.css">'), scripts: ['/js/studio.js'] });
});

// ---------------------------------------------------------------- APIs
router.post('/api/studio/new', requireBuilder, rateLimit('studio-new', 30, 3600e3, 'studio.api.tooManyGames'), async (req, res) => {
  const t = req.t;
  const key = String((req.body || {}).template || '');
  if (key && !TEMPLATE_KEYS.includes(key)) return res.status(400).json({ error: t('studio.api.pickStarter') });
  if (!req.user.builder_enabled) return res.status(403).json({ error: t('studio.api.buildingOff') });
  if (!key) {
    const g = games.createGame(req.user.id, { title: t('studio.newGameTitle'), icon: '🎮', cover: games.COVERS[Math.floor(Math.random() * games.COVERS.length)] });
    audit(req.user.id, 'game.create', g.id, {});
    return res.json({ ok: true, id: g.id, url: `/studio/${g.id}` });
  }
  const info = await templateInfo(key);
  const { html: tpl } = await templateHtml(key);
  const g = games.createGame(req.user.id, { title: info.title, icon: info.icon, cover: info.cover, category: info.category, description: info.description, players_max: info.players || 1, tags: key });
  const { html: clean } = sanitizeGameHtml(tpl);
  const report = scanVersion(clean);
  games.addVersion(g.id, clean, { notes: t('studio.startedFrom', { title: info.title }), createdBy: req.user.id, safetyStatus: report.status, safetyReport: report });
  audit(req.user.id, 'game.create', g.id, { template: key });
  res.json({ ok: true, id: g.id, url: `/studio/${g.id}` });
});

router.get('/api/studio/:id', requireBuilder, (req, res) => {
  const g = loadEditable(req, res); if (!g) return;
  res.json(studioState(req.user, g.id, req.t, req));
});

// The Builder chat. Body: { text, pro, uploads, cid, continueOf?, detach? }.
//   detach: true (the Studio page): starts the build and answers at once, 202 { ok, turn: { id, status } }, or an error
//     as JSON ({ error, code }: 400 empty, 403 disabled, 409 cantContinue, 429 tooMany / limit, 503 restarting).
//     The page follows the build on GET /live. A retried message (the same cid) gets the same build back.
//     While the game builds, a message is a follow-up of that build (runner.js): 200 { followUp: { id, cid, status },
//     left, turnsLeft } or 200 { refused: { category, message, suggestion } }; 409 notYours / uploads, 429 cap /
//     refusedCap. If the build ended meanwhile, the message starts the next build (202).
//   no detach (pages loaded before builds ran on their own, and scripts): text/event-stream with every event of the
//     build, ending after 'done'. A game that is already building answers builder.errors.busy, as it always did.
// The build never stops when the request does: a page closed while its POST is on the way still gets its message built.
router.post('/api/studio/:id/chat', requireBuilder, rateLimit('builder', 20, 60e3, 'studio.api.builderBreak'), async (req, res) => {
  const g = loadEditable(req, res); if (!g) return;
  const b = req.body || {};
  // Shutting down: nothing is stored, and the page keeps the message (runner.drain).
  if (builderLife.draining) return res.status(503).json({ error: req.t('studio.api.restarting'), code: 'restarting' });
  const opts = { user: req.user, game: g, text: b.text, pro: !!b.pro, uploadIds: b.uploads, cid: b.cid, continueOf: b.continueOf, t: req.t };
  if (b.detach) {
    const r = await submit(opts);
    return res.status(r.status).json(r.body);
  }
  live.sseHeaders(res);
  const send = (event, data) => { if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
  try {
    const r = await submit({ ...opts, compat: true });
    if (r.job) { live.open(req, res, g, { compat: true, job: r.job }); return; }   // ends after 'done' (or at sign-out)
    send('error', { message: r.body.error });
  } catch {
    send('error', { message: req.t('studio.api.wentWrong') });
  }
  send('done', counter(req.user.id)); res.end();
});

// The live view of this game's builds for one Studio tab (builder/live.js): hello { now, turn }, the replay of the running
// build, caughtup, then live events; it stays open between builds. A background request: it never keeps a sign-in awake.
router.get('/api/studio/:id/live', requireBuilder, rateLimit('studio-live', 40, 60e3), (req, res) => {
  const g = loadEditable(req, res); if (!g) return;
  live.open(req, res, g);
});

router.post('/api/studio/:id/meta', requireBuilder, rateLimit('studio-meta', 60, 60e3), (req, res) => {
  const g = loadEditable(req, res); if (!g) return;
  const t = req.t;
  const b = req.body || {}; const f = {};
  for (const [k, max] of [['title', 60], ['description', 600]]) {
    if (b[k] === undefined) continue;
    const c = cleanText(b[k], max, t); if (!c.ok) return res.status(400).json({ error: c.error, field: k });
    if (k === 'title' && !c.value) return res.status(400).json({ error: t('studio.api.nameIt'), field: 'title' });
    f[k] = c.value;
  }
  if (b.tags !== undefined) {
    const tags = String(b.tags).split(',').map(x => x.trim().toLowerCase().replace(/^#/, '')).filter(Boolean).slice(0, 8).join(',');
    const c = cleanText(tags, 200, t); if (!c.ok) return res.status(400).json({ error: c.error, field: 'tags' }); f.tags = c.value;
  }
  if (b.icon !== undefined) { if (!ICONS.includes(b.icon)) return res.status(400).json({ error: t('studio.api.pickIcon') }); f.icon = b.icon; }
  if (b.category !== undefined) { if (!games.CATEGORY_KEYS.includes(b.category)) return res.status(400).json({ error: t('studio.api.pickCategory') }); f.category = b.category; }
  if (b.cover !== undefined) { if (!games.COVERS.includes(b.cover)) return res.status(400).json({ error: t('studio.api.pickCover') }); f.cover = b.cover; }
  if (b.orientation !== undefined) { if (!games.ORIENTATIONS.includes(b.orientation)) return res.status(400).json({ error: t('studio.api.pickDirection') }); f.orientation = b.orientation; }
  if (b.players_max !== undefined) f.players_max = Math.max(1, Math.min(8, Math.round(+b.players_max || 1)));
  games.updateMeta(g.id, f);
  res.json({ ok: true, state: studioState(req.user, g.id, t, req) });
});

// Delete from "My games". Starter (seed) games stay: they belong to the site, not a builder.
router.post('/api/studio/:id/delete', requireBuilder, rateLimit('studio-delete', 20, 60e3), (req, res) => {
  const g = loadEditable(req, res); if (!g) return;
  if (g.source === 'seed') return res.status(400).json({ error: req.t('studio.api.cantDeleteStarter') });
  games.deleteGame(g.id);
  cancelBuild(g.id, 'deleted');   // a build in this game stops at once
  audit(req.user.id, 'game.delete', g.id, { title: g.title, wasLive: g.status === 'published' });
  res.json({ ok: true });
});

// Restore and Save version wait while the Builder works, so its edits never land on a swapped version.
const builderWorking = (req, res, g) => { if (!isBusy(g.id)) return false; res.status(409).json({ error: req.t('studio.api.builderWorking') }); return true; };
router.post('/api/studio/:id/restore', requireBuilder, rateLimit('studio-restore', 30, 60e3), (req, res) => {
  const g = loadEditable(req, res); if (!g) return;
  if (builderWorking(req, res, g)) return;
  const v = games.restoreVersion(g.id, String((req.body || {}).versionId || ''), req.user.id);
  if (!v) return res.status(404).json({ error: req.t('studio.api.versionNotFound') });
  res.json({ ok: true, message: req.t('studio.api.restored', { number: v.number }), state: studioState(req.user, g.id, req.t, req) });
});

// "Save version": a named checkpoint (a copy of the current version with the builder's note). History is never rewritten.
router.post('/api/studio/:id/save', requireBuilder, rateLimit('studio-save', 30, 60e3), (req, res) => {
  const g = loadEditable(req, res); if (!g) return;
  if (builderWorking(req, res, g)) return;
  const cur = games.getVersion(g.current_version_id);
  const t = req.t;
  if (!cur) return res.status(400).json({ error: t('studio.api.buildFirst') });
  const c = cleanText((req.body || {}).note || '', 80, t); if (!c.ok) return res.status(400).json({ error: c.error });
  const v = games.addVersion(g.id, cur.html, { notes: `⭐ ${t('studio.api.savedNote', { note: c.value || t('studio.api.savedDefault') })}`, createdBy: req.user.id, safetyStatus: cur.safety_status, safetyReport: JSON.parse(cur.safety_report || '{}') });
  res.json({ ok: true, message: t('studio.api.saved', { number: v.number }), state: studioState(req.user, g.id, t, req) });
});

/** { visibility, classIds } from a publish/visibility request. classIds: for 'class' only, and then required (an array
 *  of class ids; the one-class dialog sends that one id). -> { vis, classIds } or { error }. */
function shareRequest(req) {
  const body = req.body || {};
  const vis = String(body.visibility || '');
  if (!games.VISIBILITIES.includes(vis)) return { error: req.t('studio.api.pickWho') };
  if (vis !== 'class') return { vis };
  if (!Array.isArray(body.classIds)) return { error: req.t('studio.api.pickClass') };
  return { vis, classIds: body.classIds };
}
const shareReply = (req, res, g, r) => res.status(r.ok ? 200 : 400).json({ ...r, game: undefined, error: r.ok ? undefined : r.message, state: studioState(req.user, g.id, req.t, req) });
// Publish the version being edited. Body: { visibility, classIds? } (classIds: the chosen classes, for 'class').
router.post('/api/studio/:id/publish', requireBuilder, rateLimit('studio-publish', 20, 60e3), async (req, res) => {
  const g = loadEditable(req, res); if (!g) return;
  const sr = shareRequest(req); if (sr.error) return res.status(400).json({ error: sr.error });
  shareReply(req, res, g, await publish(req.user, g.id, sr.vis, { t: req.t, classIds: sr.classIds }));
});
// Update an already-live game to the version being edited, at its current sharing level (a 'class' game keeps its classes).
router.post('/api/studio/:id/update', requireBuilder, rateLimit('studio-publish', 20, 60e3), async (req, res) => {
  const g = loadEditable(req, res); if (!g) return;
  const t = req.t;
  if (g.status !== 'published' || !g.published_version_id) return res.status(400).json({ error: t('studio.api.notLive') });
  // A request to share more widely is waiting (pending_visibility: public, school or class) while the game is live at
  // its current level: update the live game now AND send the new version for that check, so the builder's request is
  // not lost (and is never turned into a request for some other audience).
  const want = g.pending_version_id && (g.pending_visibility || 'public') !== g.visibility ? (g.pending_visibility || 'public') : null;
  let r = await publish(req.user, g.id, g.visibility, { t });
  if (r.ok && want) {
    const p = await publish(req.user, g.id, want, { t });
    // A grown-up's family or connections game: "more people" (their family or connections already have the update).
    const wide = want !== 'public' || g.visibility === 'family' || (g.visibility === 'friends' && isGrownup(getUser(g.owner_id)));
    r = { ...p, ok: true, message: p.state === 'live' ? p.message : t(wide ? 'studio.api.updatedNowWaiting' : g.visibility === 'friends' ? 'studio.api.updatedFriends' : 'studio.api.updatedYou') };
  }
  shareReply(req, res, g, r);
});
// Change who can play a live game (keeps the live version). Body: { visibility, classIds? } as for publish.
router.post('/api/studio/:id/visibility', requireBuilder, rateLimit('studio-publish', 20, 60e3), async (req, res) => {
  const g = loadEditable(req, res); if (!g) return;
  const sr = shareRequest(req); if (sr.error) return res.status(400).json({ error: sr.error });
  shareReply(req, res, g, await setVisibility(req.user, g.id, sr.vis, req.t, sr.classIds));
});

// ---- Speech to text (services/stt.js). Raw body: one recorded clip (WebM, MP4/AAC or Ogg), at most
// STT_MAX_BYTES; X-Clip-Ms (required): its length as the page measured it. The real length is read from the clip itself
// (a page can lie about X-Clip-Ms) and must be within STT_MAX_SECONDS. Answers { text } (rude words starred) for the kid
// to check and edit; it is never sent to the Builder from here (Send screens it like typed text). The clip lives in
// memory for this request only: it is never written anywhere, and the log line has only its size, the time taken and
// the service. Caps: clips a minute per builder (memory), clips a day per builder and minutes a day for the whole site
// (SQLite, services/stt-usage.js), and the AI spending caps (the cost is recorded there). A clip that is refused before
// it reaches the service uses none of the daily caps.
const clockOf = sec => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
const tooLong = req => req.t('studio.mic.tooLong', { max: clockOf(config.sttMaxSeconds) });
const sttBody = (req, res, next) => express.raw({ type: () => true, limit: config.sttMaxBytes, inflate: false })(req, res, err => {
  if (!err) return next();
  const big = err.status === 413;
  res.status(big ? 413 : 400).json({ error: big ? tooLong(req) : req.t('studio.mic.failed'), code: big ? 'too_big' : 'bad' });
});
router.post('/api/studio/:id/transcribe', requireBuilder, (req, res, next) => {
  if (!sttEnabled()) return res.status(404).json({ error: req.t('errors.api.notFound'), code: 'off' });
  // The Builder is off for this account: the voice is never sent to the outside service.
  if (!req.user.builder_enabled) return res.status(403).json({ error: req.t('studio.api.buildingOff'), code: 'builder_off' });
  const g = loadEditable(req, res); if (!g) return;   // the owner (or an admin) only, before the clip is read
  if (!MIMES.includes(baseMime(req.get('content-type')))) return res.status(415).json({ error: req.t('studio.mic.failed'), code: 'type' });
  const hdr = req.get('x-clip-ms'); const ms = Number(hdr);
  if (!hdr || !Number.isFinite(ms) || ms < 0) return res.status(400).json({ error: req.t('studio.mic.failed'), code: 'bad' });
  if (ms > config.sttMaxSeconds * 1000 + 2000) return res.status(413).json({ error: tooLong(req), code: 'too_long' });
  // X-Live-Id: the clip of a live session that failed (services/stt-live.js), uploaded once instead. That session was
  // already counted as a clip (and its minute's turn), so this upload isn't; its seconds are, as the audio really goes
  // to the service again. A used, unknown or someone else's id is ignored: the upload counts like any other.
  req.sttFromLive = !!req.get('x-live-id') && consumeFallback(req.get('x-live-id'), req.user.id, g.id);
  // Clips a minute (fixed window, in memory), then the day's caps (kept in the database), before the clip is read.
  if (!req.sttFromLive && !allow(`stt:${req.user.id}`, config.sttPerMinute, 60e3)) return res.status(429).json({ error: req.t('studio.mic.tooFast'), code: 'fast' });
  // A fallback skips the builder's own daily cap (its clip was counted when the session opened), never the site's.
  const pool = allowanceFor(req.user).pool;
  const why = req.sttFromLive ? sttUsage.siteBlocked(pool) : sttUsage.blocked(req.user.id, pool);
  if (why === 'daily') return res.status(429).json({ error: req.t('studio.mic.daily'), code: 'daily' });
  if (why) return res.status(503).json({ error: req.t('studio.mic.busy'), code: 'site' });
  next();
}, sttBody, async (req, res) => {
  let bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  req.body = null;   // the only other reference to the clip: nothing later (error handlers, logs) can see it
  if (bytes.length < 200 || !KINDS.includes(sniff(bytes))) return res.status(415).json({ error: req.t('studio.mic.failed'), code: 'type' });
  const size = bytes.length;
  const real = clipSeconds(bytes);
  if (real != null && real > config.sttMaxSeconds + 2) { bytes = null; return res.status(413).json({ error: tooLong(req), code: 'too_long' }); }
  // Counted at its real length, or (when that can't be read) at an estimate from its size that errs long.
  const seconds = countedSeconds(bytes, +req.get('x-clip-ms'));
  if (req.sttFromLive) sttUsage.addSeconds(req.user.id, seconds, config.sttProvider, allowanceFor(req.user).pool);
  else sttUsage.record(req.user.id, seconds, config.sttProvider, allowanceFor(req.user).pool);
  try {
    const r = await transcribe({ bytes, locale: req.locale || 'en' });
    bytes = null;
    log('info', 'speech to text', { bytes: size, seconds: Math.round(seconds), ms: r.ms, provider: r.provider, ...(req.sttFromLive ? { mode: 'fallback' } : {}), ...(req.get('x-live-why') ? { liveWhy: String(req.get('x-live-why')).replace(/[^a-z0-9-]/gi, '').slice(0, 32) } : {}) });
    if (!r.text) return res.json({ text: '', reason: 'nothing' });
    res.json({ text: r.text });
  } catch (e) {
    bytes = null;
    const code = e instanceof SttError ? e.code : 'provider';
    log('info', 'speech to text failed', { bytes: size, code });
    res.status(code === 'format' ? 415 : code === 'busy' ? 503 : 502).json({ error: req.t(code === 'busy' ? 'studio.mic.busy' : 'studio.mic.failed'), code });
  }
});

// ---- Uploads (inspiration pictures and files). Raw body: the file bytes; ?name= the file name.
router.post('/api/studio/:id/uploads', requireBuilder, rateLimit('studio-upload', 30, 60e3, 'uploads.tooFast'),
  express.raw({ type: () => true, limit: '6mb', inflate: false }), async (req, res) => {
    const g = loadEditable(req, res); if (!g) return;
    try {
      const u = await saveUpload({ user: req.user, game: g, name: String(req.query.name || 'file'), bytes: Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0), t: req.t });
      res.json({ ok: true, upload: u });
    } catch (e) {
      if (e instanceof UploadError) return res.status(e.status).json({ error: e.message });
      throw e;
    }
  });
router.get('/api/studio/:id/uploads/:uid', requireBuilder, (req, res) => {
  const g = loadEditable(req, res); if (!g) return;
  const u = getUpload(req.params.uid);
  if (!u || u.game_id !== g.id) return res.status(404).json({ error: req.t('errors.api.notFound') });
  let bytes; try { bytes = readUploadBytes(u); } catch { return res.status(404).json({ error: req.t('errors.api.notFound') }); }
  const mime = u.kind === 'text' ? 'text/plain; charset=utf-8' : u.mime; // never SVG or HTML
  res.set({
    'Content-Type': mime, 'Content-Disposition': `inline; filename="${encodeURIComponent(u.name)}"`, 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'", 'Cache-Control': 'private, max-age=3600', 'Cross-Origin-Resource-Policy': 'same-origin',
  });
  res.send(bytes);
});
router.delete('/api/studio/:id/uploads/:uid', requireBuilder, (req, res) => {
  const g = loadEditable(req, res); if (!g) return;
  const u = getUpload(req.params.uid);
  if (!u || u.game_id !== g.id) return res.status(404).json({ error: req.t('errors.api.notFound') });
  if (u.used_at) return res.status(400).json({ error: req.t('uploads.alreadySent') });
  deleteUpload(u); res.json({ ok: true });
});
