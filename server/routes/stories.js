// Story Builder pages (docs/story-builder.md). Off unless STORY_BUILDER=1 (it needs scripts/story-worker.js running).
//   GET  /stories                  my stories, and kids' stories waiting for my OK (linked grown-ups, teachers)
//   GET  /stories/new              the idea form
//   GET  /stories/:id              progress while it is made, then the player (captions track + the words below)
//   GET  /stories/:id/video.mp4 | poster.jpg | captions.vtt     the files, for whoever may watch (story-jobs canView)
//   GET  /api/stories/:id          { status, progress, error } for the progress page
//   POST /api/stories              { idea, ageBand, seconds } -> { id } | 4xx { error, code }
//   POST /api/stories/:id/(share|unshare|approve|decline|retry|delete)
// A kid's idea goes through the Builder's own screening (story-writer screenIdea) before a job exists; the AI budget
// and the per-person daily limit are checked here too, and again by the worker before it calls Claude.
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { requireBuilder } from '../auth.js';
import { config } from '../config.js';
import { html, raw, jsonData } from '../views/html.js';
import { page, notFound } from '../views/layout.js';
import { rateLimit } from '../services/ratelimit.js';
import * as aiBudget from '../services/ai-budget.js';
import * as J from '../services/story-jobs.js';
import { screenIdea } from '../services/story-writer.js';
import { requestFields, AGE_BANDS, LENGTHS, LIMITS } from '../services/story-script.js';
import { log } from '../services/log.js';

export const router = Router();
const CSS = raw('<link rel="stylesheet" href="/css/stories.css">');
const on = (req, res, next) => (config.storyBuilder ? next() : next('router'));
router.use(['/stories', '/api/stories'], on);

const AGE_KEYS = { all: 'stories.form.ageAll', '3-5': 'stories.form.age35', '6-8': 'stories.form.age68', '9-12': 'stories.form.age912' };
const STATUS_KEYS = { queued: 'stories.status.queued', writing: 'stories.status.writing', voicing: 'stories.status.voicing', rendering: 'stories.status.rendering', assembling: 'stories.status.assembling', done: 'stories.status.done', failed: 'stories.status.failed' };
/** Seconds of rendering per second of video on the worker (measured: docs/story-builder.md), for the wait estimate. */
const RENDER_RATIO = Math.max(1, +process.env.STORY_RENDER_RATIO || 70);
const errorKey = code => `stories.error.${J.ERRORS.includes(code) ? code : 'other'}`;
const statusText = (t, s) => t(STATUS_KEYS[s.status] || 'stories.status.queued');
const when = (req, ms) => new Date(ms).toLocaleDateString(req.locale || 'en', { month: 'short', day: 'numeric' });

function card(req, s) {
  const t = req.t;
  const done = s.status === 'done';
  return html`<a class="sb-card" href="/stories/${s.id}">
    <span class="sb-thumb">${done ? html`<img src="/stories/${s.id}/poster.jpg" alt="" loading="lazy" width="320" height="180">` : html`<span class="sb-thumb-wait" aria-hidden="true">${s.status === 'failed' ? '☁️' : '🌙'}</span>`}</span>
    <span class="sb-card-body"><b>${s.title || s.idea.slice(0, 60)}</b>
      <span class="small muted">${when(req, s.created_at)} · ${done ? t(`stories.share.${s.share}Short`) : statusText(t, s)}</span></span>
  </a>`;
}

router.get('/stories', requireBuilder, (req, res) => {
  const t = req.t, u = req.user;
  const mine = J.listMine(u), waiting = J.pendingFor(u);
  const left = Math.max(0, J.dailyLimit(u) - J.usedToday(u));
  const body = html`
  <div class="sb-hero"><h1>${t('stories.h')}</h1><p class="lead">${t('stories.sub')}</p>
    <p class="row">${left ? html`<a class="btn btn-primary btn-big" href="/stories/new">✨ ${t('stories.new')}</a>` : html`<span class="notice">${t('stories.form.none')}</span>`}</p></div>
  ${waiting.length ? html`<section class="panel"><h2>${t('stories.waitingH')}</h2><p class="muted">${t('stories.waitingP')}</p>
    <div class="sb-grid">${waiting.map(s => card(req, s))}</div></section>` : ''}
  <section class="panel"><h2>${t('stories.mine')}</h2>
    ${mine.length ? html`<div class="sb-grid">${mine.map(s => card(req, s))}</div>`
    : html`<div class="empty"><span class="emo" aria-hidden="true">🌙</span><h3>${t('stories.empty')}</h3></div>`}
  </section>`;
  page(req, res, { title: t('stories.title'), body, head: CSS, description: t('stories.sub') });
});

router.get('/stories/new', requireBuilder, (req, res) => {
  const t = req.t, u = req.user;
  const left = Math.max(0, J.dailyLimit(u) - J.usedToday(u));
  const body = html`
  <div class="sb-wrap">
    <h1>${t('stories.new')}</h1>
    <p class="lead">${t('stories.sub')}</p>
    <form class="panel sb-form" id="sb-form" novalidate>
      <div class="field"><label for="sb-idea">${t('stories.form.idea')}</label>
        <textarea class="input" id="sb-idea" name="idea" maxlength="${LIMITS.idea}" rows="4" required aria-describedby="sb-hint"></textarea>
        <span class="hint" id="sb-hint">${t('stories.form.ideaHint')}</span><span class="err" id="sb-err" role="alert"></span></div>
      <div class="row sb-opts">
        <div class="field"><label for="sb-age">${t('stories.form.age')}</label>
          <select class="input" id="sb-age" name="ageBand">${['all', ...AGE_BANDS.filter(a => a !== 'all')].map(a => html`<option value="${a}">${t(AGE_KEYS[a])}</option>`)}</select></div>
        <div class="field"><label for="sb-len">${t('stories.form.length')}</label>
          <select class="input" id="sb-len" name="seconds">${LENGTHS.map(n => html`<option value="${n}"${n === 60 ? raw(' selected') : ''}>${t('stories.form.seconds', { n })}</option>`)}</select></div>
      </div>
      <p class="small muted">${t('stories.form.safety')}</p>
      <p class="small muted">${left ? t('stories.form.left', { count: left }) : t('stories.form.none')}</p>
      <button class="btn btn-primary btn-big" type="submit" id="sb-go"${left ? '' : raw(' disabled')}>✨ ${t('stories.form.make')}</button>
    </form>
  </div>`;
  page(req, res, { title: t('stories.new'), body, head: CSS, scripts: ['/js/stories.js'], back: '/stories', backLabel: t('stories.mine') });
});

/** The story, if this person may see it here (the owner, an approver, the admin, anyone once shared). */
function viewable(req, res) {
  const s = J.get(req.params.id);
  if (!s || !J.canView(req.user, s)) { notFound(req, res); return null; }
  return s;
}

router.get('/stories/:id', (req, res) => {
  const s = viewable(req, res); if (!s) return;
  const t = req.t, u = req.user;
  const owner = !!u && u.id === s.owner_id;
  const approver = !owner && s.share === 'pending' && J.isApprover(u, s);
  const script = J.scriptOf(s);
  const title = s.title || t('stories.title');
  let main;
  if (s.status === 'done') {
    main = html`
    <div class="sb-player"><video id="sb-video" controls playsinline preload="metadata" poster="/stories/${s.id}/poster.jpg" width="1280" height="720">
      <source src="/stories/${s.id}/video.mp4" type="video/mp4">
      <track kind="captions" src="/stories/${s.id}/captions.vtt" srclang="${s.locale}" label="${t('stories.captions')}">
    </video></div>
    ${script ? html`<details class="panel sb-words"><summary>${t('stories.words')}</summary>
      ${script.scenes.map(sc => sc.lines.map(l => html`<p>${l.say}</p>`))}</details>` : ''}`;
  } else if (s.status === 'failed') {
    main = html`<div class="panel sb-progress"><p class="sb-big" aria-hidden="true">☁️</p><h2>${t('stories.status.failed')}</h2>
      <p>${t(errorKey(s.error))}</p>
      ${owner ? html`<p class="row"><button class="btn btn-primary" type="button" data-act="retry">${t('stories.retry')}</button>
        <button class="btn btn-ghost btn-danger" type="button" data-act="delete">${t('stories.delete')}</button></p>` : ''}</div>`;
  } else {
    const mins = Math.max(5, Math.ceil((s.seconds * RENDER_RATIO) / 60));
    main = html`<div class="panel sb-progress" id="sb-progress" aria-live="polite">
      <p class="sb-big sb-moon" aria-hidden="true">🌙</p>
      <h2 id="sb-status">${statusText(t, s)}</h2>
      <div class="sb-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(s.progress * 100)}" aria-label="${t('stories.progressLabel')}"><span id="sb-fill" style="width:${Math.round(s.progress * 100)}%"></span></div>
      <p class="small muted">${t('stories.progress', { mins })}</p></div>`;
  }
  const shareBox = s.status !== 'done' ? '' : owner ? html`<section class="panel sb-share"><p id="sb-share-state">${t(`stories.share.${s.share}`)}</p>
      <p class="row">${s.share === 'private' ? html`<button class="btn btn-primary" type="button" data-act="share">${J.adultOwner(u) ? t('stories.share.btnAdult') : t('stories.share.btnKid')}</button>` : ''}
      ${s.share !== 'private' ? html`<button class="btn btn-ghost" type="button" data-act="unshare">${t('stories.share.stop')}</button>` : ''}
      ${s.share === 'shared' ? html`<button class="btn btn-ghost" type="button" data-act="copy">${t('stories.share.copy')}</button>` : ''}
      <button class="btn btn-ghost btn-danger" type="button" data-act="delete">${t('stories.delete')}</button></p>
      ${s.share === 'private' && !J.adultOwner(u) ? html`<p class="small muted">${t('stories.share.askNote')}</p>` : ''}</section>`
    : approver ? html`<section class="panel sb-share"><p>${t('stories.share.decideP')}</p><p class="small muted">${t('stories.by', { idea: s.idea })}</p>
      <p class="row"><button class="btn btn-primary" type="button" data-act="approve">${t('stories.share.approve')}</button>
      <button class="btn btn-ghost" type="button" data-act="decline">${t('stories.share.decline')}</button></p></section>` : '';
  const body = html`<div class="sb-wrap">
    <h1>${title}</h1>
    ${owner ? html`<p class="small muted">${t('stories.by', { idea: s.idea })}</p>` : ''}
    ${main}
    ${shareBox}
    ${jsonData('page-data', { id: s.id, status: s.status, labels: Object.fromEntries(Object.entries(STATUS_KEYS).map(([k, key]) => [k, t(key)])) })}
  </div>`;
  page(req, res, { title, body, head: CSS, scripts: ['/js/stories.js'], back: u ? '/stories' : null, backLabel: u ? t('stories.mine') : null });
});

const FILES = { 'video.mp4': ['story.mp4', 'video/mp4'], 'poster.jpg': ['poster.jpg', 'image/jpeg'], 'captions.vtt': ['captions.vtt', 'text/vtt; charset=utf-8'] };
router.get('/stories/:id/:file', (req, res, next) => {
  const f = FILES[req.params.file]; if (!f) return next();
  const s = J.get(req.params.id);
  if (!s || s.status !== 'done' || !J.canView(req.user, s)) return res.status(404).end();
  const file = path.join(J.storyDir(s.id), f[0]);
  if (!fs.existsSync(file)) return res.status(404).end();
  res.set({ 'Content-Type': f[1], 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
  // dotfiles: the data directory may sit under a dot folder (a checkout in ~/.something); the name is ours, not the user's.
  res.sendFile(file, { acceptRanges: true, dotfiles: 'allow', headers: { 'Content-Type': f[1] } }, err => { if (err && !res.headersSent) res.status(404).end(); });
});

router.get('/api/stories/:id', (req, res) => {
  const s = J.get(req.params.id);
  if (!s || !J.canView(req.user, s)) return res.status(404).json({ error: req.t('errors.api.notFound') });
  res.json({ status: s.status, progress: Math.round(s.progress * 1000) / 1000, error: s.error ? req.t(errorKey(s.error)) : '' });
});

router.post('/api/stories', requireBuilder, rateLimit('stories', 12, 3600e3), async (req, res) => {
  const t = req.t, u = req.user;
  const f = requestFields(req.body || {});
  if (f.idea.length < 3) return res.status(422).json({ code: 'empty', error: t('stories.form.needIdea') });
  if (J.usedToday(u) >= J.dailyLimit(u)) return res.status(429).json({ code: 'limit', error: t('stories.form.none') });
  // The idea is screened first (the word rules always run; the model classifier too when the AI is available)...
  const screened = await screenIdea(f.idea, { t });
  if (!screened.ok) return res.status(422).json({ code: 'refused', error: [screened.message, screened.suggestion].filter(Boolean).join(' ') || t('stories.error.refused') });
  // ...and a story is only queued while Claude can write it.
  if (!config.anthropicKey || !aiBudget.ok()) return res.status(503).json({ code: 'aiOff', error: t('stories.error.aiOff') });
  const r = J.create(u, { ...f, locale: req.locale || 'en' });
  if (!r.ok) return res.status(r.code === 'limit' ? 429 : 503).json({ code: r.code, error: t(r.code === 'limit' ? 'stories.form.none' : 'stories.busy') });
  log('info', 'story queued', { id: r.story.id, seconds: f.seconds, age: f.ageBand });
  res.json({ id: r.story.id });
});

router.post('/api/stories/:id/:act', requireBuilder, rateLimit('stories-act', 60, 600e3), (req, res, next) => {
  const u = req.user, s = J.get(req.params.id);
  if (!s || !J.canView(u, s)) return res.status(404).json({ error: req.t('errors.api.notFound') });
  let ok;
  switch (req.params.act) {
    case 'share': ok = !!J.share(u, s); break;
    case 'unshare': ok = J.unshare(u, s); break;
    case 'approve': ok = J.decide(u, s, true); break;
    case 'decline': ok = J.decide(u, s, false); break;
    case 'retry': ok = J.retry(u, s); break;
    case 'delete': ok = J.remove(u, s); break;
    default: return next();
  }
  if (!ok) return res.status(409).json({ error: req.t('stories.error.other') });
  res.json({ ok: true, story: (({ status, share }) => ({ status, share }))(J.get(s.id) || { status: 'deleted', share: 'private' }) });
});
