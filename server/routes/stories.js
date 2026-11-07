// Story Builder pages (docs/story-builder.md). Off unless STORY_BUILDER=1 (it needs scripts/story-worker.js running).
//   GET  /stories                  my stories, and kids' stories waiting for my OK (linked grown-ups, teachers)
//   GET  /stories/new              the idea form, with the choices (kind of story, feeling, voice, music, extras)
//   GET  /stories/:id              progress while it is made, then the player (captions track + the words below)
//   GET  /stories/:id/edit         the owner changes a finished story: its words, voice and music, or asks for a rewrite
//   GET  /stories/:id/video.mp4 | poster.jpg | captions.vtt     the files, for whoever may watch (story-jobs canView)
//   GET  /api/stories/:id          { status, progress, error, remake } for the progress page
//   POST /api/stories              { idea, ageBand, seconds, style, tone, voice, music, characters, lesson } -> { id } | 4xx { error, code }
//   POST /api/stories/voice-sample { voice }  -> { u } a fixed sample line in that narrator voice (cached; AI voice on only)
//   POST /api/stories/:id/remake   { title, lines: [[say per line] per scene], voice, music }   a quick change (no new pictures)
//   POST /api/stories/:id/rewrite  { note, style, tone }   Claude writes it again (counts like a new story)
//   POST /api/stories/:id/(share|unshare|approve|decline|retry|delete|remake-retry|remake-dismiss)
// A kid's idea, characters, lesson and rewrite note go through the Builder's own screening (story-writer screenIdea)
// before a job exists; new words go through the script checks and the classifier (checkEdited). The AI budget and the
// per-person daily limits are checked here too, and again by the worker before it calls Claude.
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { requireBuilder } from '../auth.js';
import { config } from '../config.js';
import { html, raw, jsonData } from '../views/html.js';
import { page, notFound } from '../views/layout.js';
import { rateLimit, allow } from '../services/ratelimit.js';
import * as aiBudget from '../services/ai-budget.js';
import * as J from '../services/story-jobs.js';
import * as tts from '../services/tts.js';
import * as V from '../services/tts-voices.js';
import { screenIdea, checkEdited } from '../services/story-writer.js';
import { requestFields, AGE_BANDS, LENGTHS, LIMITS } from '../services/story-script.js';
import { STYLES, TONES, MUSIC, NARRATORS, TEXT_LIMITS, DEFAULTS, choiceFields, extraFields, noteField, optionsOf, musicFor, providerVoice } from '../services/story-options.js';
import { planRemake, cachedClips, clipDir, sceneKey } from '../stories/remake.js';
import { sceneVisuals, QUALITY } from '../stories/pipeline.js';
import { log } from '../services/log.js';

export const router = Router();
const CSS = raw('<link rel="stylesheet" href="/css/stories.css">');
const on = (req, res, next) => (config.storyBuilder ? next() : next('router'));
router.use(['/stories', '/api/stories'], on);

const AGE_KEYS = { all: 'stories.form.ageAll', '3-5': 'stories.form.age35', '6-8': 'stories.form.age68', '9-12': 'stories.form.age912' };
const STATUS_KEYS = { queued: 'stories.status.queued', writing: 'stories.status.writing', voicing: 'stories.status.voicing', rendering: 'stories.status.rendering', assembling: 'stories.status.assembling', done: 'stories.status.done', failed: 'stories.status.failed' };
const SET_EMOJI = { lighthouse: '🌊', village: '🏡', forest: '🌲', meadow: '🌼', sky: '☁️' };
const TIME_EMOJI = { night: '🌙', dusk: '🌆', dawn: '🌅', day: '☀️' };
/** Seconds of rendering per second of video on the worker (measured: docs/story-builder.md), for the wait estimate. */
const RENDER_RATIO = Math.max(1, +process.env.STORY_RENDER_RATIO || 70);
const errorKey = code => `stories.error.${J.ERRORS.includes(code) ? code : 'other'}`;
const statusText = (t, s) => t(STATUS_KEYS[s.status] || 'stories.status.queued');
const when = (req, ms) => new Date(ms).toLocaleDateString(req.locale || 'en', { month: 'short', day: 'numeric' });
const quality = () => process.env.STORY_QUALITY || 'full';
/** May ▶ play a sample of the narrator voices here (the AI voice is on for this page's language)? */
const samplesOn = req => { const l = V.ttsLocale(req.locale || 'en'); return !!l && tts.localeOn(l); };

function card(req, s) {
  const t = req.t;
  const done = s.status === 'done';
  return html`<a class="sb-card" href="/stories/${s.id}">
    <span class="sb-thumb">${done ? html`<img src="/stories/${s.id}/poster.jpg" alt="" loading="lazy" width="320" height="180">` : html`<span class="sb-thumb-wait" aria-hidden="true">${s.status === 'failed' ? '☁️' : '🌙'}</span>`}</span>
    <span class="sb-card-body"><b>${s.title || s.idea.slice(0, 60)}</b>
      <span class="small muted">${when(req, s.created_at)} · ${done ? t(`stories.share.${s.share}Short`) : statusText(t, s)}</span></span>
  </a>`;
}

/**
 * A row of big choice cards (radio buttons styled as cards: an emoji and a short label). name: the form field;
 * list: story-options STYLES / TONES / MUSIC / NARRATORS; keyOf(id): the label's key; samples: a ▶ per voice.
 */
function choices(t, { name, legend, list, current, keyOf, samples = false, form = null }) {
  const id = `sb-${form ? `${form}-` : ''}${name}`;
  return html`<fieldset class="sb-choices" id="${id}"><legend>${legend}</legend>
    <div class="sb-chips">${Object.entries(list).map(([k, o]) => html`<span class="sb-choice">
      <input type="radio" class="sr-only" name="${name}" id="${id}-${k}" value="${k}"${k === current ? raw(' checked') : ''}>
      <label for="${id}-${k}"><span class="sb-emo" aria-hidden="true">${o.emoji}</span><span class="sb-lbl">${t(keyOf(k))}</span></label>
      ${samples ? html`<button class="sb-play" type="button" data-sample="${k}" aria-label="${t('stories.form.listen', { name: t(keyOf(k)) })}">▶</button>` : ''}
    </span>`)}</div></fieldset>`;
}
const voiceKey = k => `stories.voice.${k}`;
const styleKey = k => `stories.style.${k}`;
const toneKey = k => `stories.tone.${k}`;
const musicKey = k => `stories.music.${k}`;

/** The story's choices as small read-only pills. */
function optionPills(t, s) {
  const o = optionsOf(s);
  const pills = [[STYLES[o.style].emoji, t(styleKey(o.style))], [TONES[o.tone].emoji, t(toneKey(o.tone))], [NARRATORS[o.voice].emoji, t(voiceKey(o.voice))], [MUSIC[o.music].emoji, t(musicKey(o.music))]];
  return html`<ul class="sb-pills" aria-label="${t('stories.options')}">${pills.map(([e, l]) => html`<li><span aria-hidden="true">${e}</span> ${l}</li>`)}
    ${s.characters ? html`<li><span aria-hidden="true">🐾</span> ${s.characters}</li>` : ''}${s.lesson ? html`<li><span aria-hidden="true">💡</span> ${s.lesson}</li>` : ''}</ul>`;
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
  page(req, res, { active: 'stories', title: t('stories.title'), body, head: CSS, description: t('stories.sub') });
});

router.get('/stories/new', requireBuilder, (req, res) => {
  const t = req.t, u = req.user;
  const left = Math.max(0, J.dailyLimit(u) - J.usedToday(u));
  const samples = samplesOn(req);
  const body = html`
  <div class="sb-wrap">
    <h1>${t('stories.new')}</h1>
    <p class="lead">${t('stories.sub')}</p>
    <form class="panel sb-form" id="sb-form" novalidate>
      <div class="field"><label for="sb-idea">${t('stories.form.idea')}</label>
        <textarea class="input" id="sb-idea" name="idea" maxlength="${LIMITS.idea}" rows="4" required aria-describedby="sb-hint sb-kit"></textarea>
        <span class="hint" id="sb-hint">${t('stories.form.ideaHint')}</span>
        <span class="sb-kit" id="sb-kit"><span aria-hidden="true">🧒👩🐶🦊🏰⚽</span> ${t('stories.form.kitHint')}</span>
        <span class="err" id="sb-err" role="alert"></span></div>
      ${choices(t, { name: 'style', legend: t('stories.form.styleH'), list: STYLES, current: DEFAULTS.style, keyOf: styleKey })}
      ${choices(t, { name: 'tone', legend: t('stories.form.toneH'), list: TONES, current: DEFAULTS.tone, keyOf: toneKey })}
      ${choices(t, { name: 'voice', legend: t('stories.form.voiceH'), list: NARRATORS, current: DEFAULTS.voice, keyOf: voiceKey, samples })}
      ${samples ? html`<p class="small muted sb-ai">${t('stories.form.voiceAi')}</p>` : ''}
      ${choices(t, { name: 'music', legend: t('stories.form.musicH'), list: MUSIC, current: musicFor(DEFAULTS.style), keyOf: musicKey })}
      <details class="sb-more"><summary>${t('stories.form.more')}</summary>
        <div class="field"><label for="sb-chars">${t('stories.form.charsLabel')}</label>
          <input class="input" id="sb-chars" name="characters" maxlength="${TEXT_LIMITS.characters}" autocomplete="off" aria-describedby="sb-chars-hint">
          <span class="hint" id="sb-chars-hint">${t('stories.form.charsHint')}</span></div>
        <div class="field"><label for="sb-lesson">${t('stories.form.lessonLabel')}</label>
          <input class="input" id="sb-lesson" name="lesson" maxlength="${TEXT_LIMITS.lesson}" autocomplete="off" aria-describedby="sb-lesson-hint">
          <span class="hint" id="sb-lesson-hint">${t('stories.form.lessonHint')}</span></div>
        <div class="row sb-opts">
          <div class="field"><label for="sb-age">${t('stories.form.age')}</label>
            <select class="input" id="sb-age" name="ageBand">${['all', ...AGE_BANDS.filter(a => a !== 'all')].map(a => html`<option value="${a}">${t(AGE_KEYS[a])}</option>`)}</select></div>
          <div class="field"><label for="sb-len">${t('stories.form.length')}</label>
            <select class="input" id="sb-len" name="seconds">${LENGTHS.map(n => html`<option value="${n}"${n === 60 ? raw(' selected') : ''}>${t('stories.form.seconds', { n })}</option>`)}</select></div>
        </div>
      </details>
      <p class="small muted">${t('stories.form.safety')}</p>
      <p class="small muted">${left ? t('stories.form.left', { count: left }) : t('stories.form.none')}</p>
      <button class="btn btn-primary btn-big" type="submit" id="sb-go"${left ? '' : raw(' disabled')}>✨ ${t('stories.form.make')}</button>
    </form>
    ${jsonData('page-data', { musicFor: Object.fromEntries(Object.keys(STYLES).map(k => [k, musicFor(k)])) })}
  </div>`;
  page(req, res, { active: 'stories', title: t('stories.new'), body, head: CSS, scripts: ['/js/stories.js'], back: '/stories', backLabel: t('stories.mine') });
});

/** The story, if this person may see it here (the owner, an approver, the admin, anyone once shared). */
function viewable(req, res) {
  const s = J.get(req.params.id);
  if (!s || !J.canView(req.user, s)) { notFound(req, res); return null; }
  return s;
}

/** The owner's view of a change: being made (with its own progress bar), or failed (try again / keep the old one). */
function remakeBox(t, s) {
  if (J.remaking(s)) {
    return html`<section class="panel sb-remake" id="sb-remake" aria-live="polite"><p><span aria-hidden="true">🛠️</span> ${t('stories.edit.working')}</p>
      <div class="sb-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(s.remake_progress * 100)}" aria-label="${t('stories.progressLabel')}"><span id="sb-remake-fill" style="width:${Math.round(s.remake_progress * 100)}%"></span></div></section>`;
  }
  if (s.remake_status === 'failed') {
    return html`<section class="panel sb-remake sb-remake-failed" role="status"><p><span aria-hidden="true">☁️</span> ${t('stories.edit.failed')} ${t(errorKey(s.remake_error))}</p>
      <p class="row"><button class="btn btn-primary" type="button" data-act="remake-retry">${t('stories.retry')}</button>
      <button class="btn btn-ghost" type="button" data-act="remake-dismiss">${t('stories.edit.keepOld')}</button></p></section>`;
  }
  return '';
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
    <div class="sb-player"><video id="sb-video" controls playsinline preload="metadata" poster="/stories/${s.id}/poster.jpg?v=${s.version}" width="1280" height="720">
      <source src="/stories/${s.id}/video.mp4?v=${s.version}" type="video/mp4">
      <track kind="captions" src="/stories/${s.id}/captions.vtt?v=${s.version}" srclang="${s.locale}" label="${t('stories.captions')}">
    </video></div>
    ${owner ? remakeBox(t, s) : ''}
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
  const canEdit = owner && s.status === 'done' && !J.remaking(s) && !!script;
  const shareBox = s.status !== 'done' ? '' : owner ? html`<section class="panel sb-share"><p id="sb-share-state">${t(`stories.share.${s.share}`)}</p>
      <p class="row">${canEdit ? html`<a class="btn btn-primary" href="/stories/${s.id}/edit">✏️ ${t('stories.edit.btn')}</a>` : ''}
      ${s.share === 'private' ? html`<button class="btn ${canEdit ? 'btn-ghost' : 'btn-primary'}" type="button" data-act="share">${J.adultOwner(u) ? t('stories.share.btnAdult') : t('stories.share.btnKid')}</button>` : ''}
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
    ${optionPills(t, s)}
    ${main}
    ${shareBox}
    ${jsonData('page-data', { id: s.id, status: s.status, remake: owner ? s.remake_status : '', labels: Object.fromEntries(Object.entries(STATUS_KEYS).map(([k, key]) => [k, t(key)])) })}
  </div>`;
  page(req, res, { active: 'stories', title, body, head: CSS, scripts: ['/js/stories.js'], back: u ? '/stories' : null, backLabel: u ? t('stories.mine') : null });
});

/** The owner's finished story, for the edit page and its APIs (404 for anyone else). */
function ownDone(req) {
  const s = J.get(req.params.id);
  return s && req.user && s.owner_id === req.user.id && s.status === 'done' && J.scriptOf(s) ? s : null;
}

router.get('/stories/:id/edit', requireBuilder, (req, res) => {
  const s = ownDone(req);
  if (!s) return notFound(req, res);
  const t = req.t, u = req.user, script = J.scriptOf(s), o = optionsOf(s);
  const remakesLeft = Math.max(0, J.remakeLimit(u) - J.remakesToday(u));
  const left = Math.max(0, J.dailyLimit(u) - J.usedToday(u));
  const busy = J.remaking(s);
  const asksAgain = s.share !== 'private' && !J.adultOwner(u);
  let n = 0;
  const body = html`<div class="sb-wrap">
    <h1>${t('stories.edit.h')}</h1>
    <p class="lead">${s.title}</p>
    ${busy ? html`<p class="notice" role="status">${t('stories.edit.busy')}</p>` : ''}
    ${asksAgain ? html`<p class="small muted">${t('stories.edit.asksAgain')}</p>` : ''}
    <form class="panel sb-form" id="sb-edit" novalidate>
      <h2><span aria-hidden="true">✏️</span> ${t('stories.edit.wordsH')}</h2>
      <p class="muted">${t('stories.edit.wordsP')}</p>
      <div class="field"><label for="sb-title">${t('stories.edit.titleLabel')}</label>
        <input class="input" id="sb-title" name="title" maxlength="${LIMITS.title}" value="${script.title}" autocomplete="off"></div>
      ${script.scenes.map((sc, i) => html`<section class="sb-scene" data-scene="${i}">
        <h3><span class="sb-scene-n">${t('stories.edit.scene', { n: i + 1 })}</span> <span class="small muted"><span aria-hidden="true">${SET_EMOJI[sc.set] || ''}</span> ${t(`stories.set.${sc.set}`)} · <span aria-hidden="true">${TIME_EMOJI[sc.time] || ''}</span> ${t(`stories.time.${sc.time}`)}</span></h3>
        ${sc.lines.map((l, k) => { n++; return html`<div class="field"><label for="sb-line-${i}-${k}" class="sr-only">${t('stories.edit.line', { n })}</label>
          <textarea class="input sb-line" id="sb-line-${i}-${k}" data-scene="${i}" data-line="${k}" rows="2" maxlength="${LIMITS.line}">${l.say}</textarea></div>`; })}
      </section>`)}
      ${choices(t, { name: 'voice', legend: t('stories.form.voiceH'), list: NARRATORS, current: o.voice, keyOf: voiceKey, samples: samplesOn(req), form: 'edit' })}
      ${choices(t, { name: 'music', legend: t('stories.form.musicH'), list: MUSIC, current: o.music, keyOf: musicKey, form: 'edit' })}
      <p class="small muted">${t('stories.edit.remakeP')}</p>
      <p class="small muted">${remakesLeft ? t('stories.edit.remakesLeft', { count: remakesLeft }) : t('stories.edit.remakeNone')}</p>
      <span class="err" id="sb-edit-err" role="alert"></span>
      <button class="btn btn-primary btn-big" type="submit" id="sb-edit-go"${remakesLeft && !busy ? '' : raw(' disabled')}>🎬 ${t('stories.edit.remake')}</button>
    </form>
    <form class="panel sb-form" id="sb-rewrite" novalidate>
      <h2><span aria-hidden="true">🪄</span> ${t('stories.edit.rewriteH')}</h2>
      <p class="muted">${t('stories.edit.rewriteP')}</p>
      <div class="field"><label for="sb-note">${t('stories.edit.noteLabel')}</label>
        <textarea class="input" id="sb-note" name="note" rows="2" maxlength="${TEXT_LIMITS.note}" aria-describedby="sb-note-hint"></textarea>
        <span class="hint" id="sb-note-hint">${t('stories.edit.noteHint')}</span></div>
      ${choices(t, { name: 'style', legend: t('stories.form.styleH'), list: STYLES, current: o.style, keyOf: styleKey, form: 'rw' })}
      ${choices(t, { name: 'tone', legend: t('stories.form.toneH'), list: TONES, current: o.tone, keyOf: toneKey, form: 'rw' })}
      <p class="small muted">${left ? t('stories.form.left', { count: left }) : t('stories.form.none')}</p>
      <span class="err" id="sb-rw-err" role="alert"></span>
      <button class="btn btn-big" type="submit" id="sb-rw-go"${left && !busy ? '' : raw(' disabled')}>🪄 ${t('stories.edit.rewrite')}</button>
    </form>
    ${jsonData('page-data', { id: s.id, edit: true, current: { style: o.style, tone: o.tone } })}
  </div>`;
  page(req, res, { active: 'stories', title: t('stories.edit.h'), body, head: CSS, scripts: ['/js/stories.js'], back: `/stories/${s.id}`, backLabel: t('stories.edit.back') });
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
  const owner = !!req.user && req.user.id === s.owner_id;
  res.json({ status: s.status, progress: Math.round(s.progress * 1000) / 1000, error: s.error ? req.t(errorKey(s.error)) : '',
    ...(owner ? { remake: { status: s.remake_status, progress: Math.round(s.remake_progress * 1000) / 1000 } } : {}) });
});

/** Screen each piece of free text a person typed (idea, characters, lesson, note) like a Builder message. */
async function screenAll(t, texts) {
  for (const text of texts.filter(Boolean)) {
    const r = await screenIdea(text, { t });
    if (!r.ok) return [r.message, r.suggestion].filter(Boolean).join(' ') || t('stories.error.refused');
  }
  return null;
}

router.post('/api/stories', requireBuilder, rateLimit('stories', 12, 3600e3), async (req, res) => {
  const t = req.t, u = req.user;
  const b = req.body || {};
  const f = requestFields(b), c = choiceFields(b), x = extraFields(b);
  if (f.idea.length < 3) return res.status(422).json({ code: 'empty', error: t('stories.form.needIdea') });
  if (J.usedToday(u) >= J.dailyLimit(u)) return res.status(429).json({ code: 'limit', error: t('stories.form.none') });
  // The idea and the extras are screened first (the word rules always run; the model classifier too when the AI is available)...
  const refused = await screenAll(t, [f.idea, x.characters, x.lesson]);
  if (refused) return res.status(422).json({ code: 'refused', error: refused });
  // ...and a story is only queued while Claude can write it.
  if (!config.anthropicKey || !aiBudget.ok()) return res.status(503).json({ code: 'aiOff', error: t('stories.error.aiOff') });
  const r = J.create(u, { ...f, ...c, ...x, locale: req.locale || 'en' });
  if (!r.ok) return res.status(r.code === 'limit' ? 429 : 503).json({ code: r.code, error: t(r.code === 'limit' ? 'stories.form.none' : 'stories.busy') });
  log('info', 'story queued', { id: r.story.id, seconds: f.seconds, age: f.ageBand, style: c.style, tone: c.tone, voice: c.voice, music: c.music });
  res.json({ id: r.story.id });
});

// A narrator's sample: one fixed line per language (stories.voiceSample), so each voice is made once and then kept
// (pinned in the voice cache) — never text a person typed. Only while the AI voice is on for the page's language.
router.post('/api/stories/voice-sample', requireBuilder, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const b = req.body || {};
  if (!Object.hasOwn(NARRATORS, b.voice)) return res.status(400).json({ code: 'voice', error: req.t('js.stories.failed') });
  const locale = V.ttsLocale(req.locale || 'en');
  if (!samplesOn(req)) return res.status(404).json({ code: 'off', error: req.t('js.stories.sampleOff') });
  if (!allow(`story-sample:${req.user.id}`, 30, 600e3)) return res.status(429).json({ code: 'fast', error: req.t('errors.api.slowDown') });
  try {
    const r = await tts.synthesize({ text: req.t('stories.voiceSample'), locale, role: 'narrator', rate: 'slow', voice: providerVoice(b.voice), ctx: 'story-sample', pin: true });
    res.json({ u: r.url });
  } catch (e) {
    res.status(e.code === 'site' ? 429 : 503).json({ code: e.code || 'busy', error: req.t('js.stories.sampleOff') });
  }
});

const REMAKE_STATUS = { notYours: 404, notDone: 409, busyEdit: 409, limit: 429, remakeLimit: 429, busy: 503 };
const REMAKE_MSG = { notYours: 'errors.api.notFound', notDone: 'stories.error.other', busyEdit: 'stories.edit.busy', limit: 'stories.form.none', remakeLimit: 'stories.edit.remakeNone', busy: 'stories.busy' };
const refuse = (req, res, code) => res.status(REMAKE_STATUS[code] || 409).json({ code, error: req.t(REMAKE_MSG[code] || 'stories.error.other') });

/** The current script with the owner's new words laid over it (only the words: the scenes and pictures stay). */
export function withNewWords(script, { title, lines }) {
  const out = JSON.parse(JSON.stringify(script));
  if (typeof title === 'string' && title.trim()) out.title = title;
  out.scenes.forEach((sc, i) => sc.lines.forEach((l, k) => {
    const v = Array.isArray(lines) && Array.isArray(lines[i]) ? lines[i][k] : undefined;
    if (typeof v === 'string' && v.trim() !== l.say) { l.say = v; l.show = v; }
  }));
  return out;
}

router.post('/api/stories/:id/remake', requireBuilder, rateLimit('stories-edit', 20, 3600e3), async (req, res) => {
  const t = req.t, u = req.user, s = ownDone(req);
  if (!s) return refuse(req, res, 'notYours');
  if (J.remaking(s)) return refuse(req, res, 'busyEdit');
  if (J.remakesToday(u) >= J.remakeLimit(u)) return refuse(req, res, 'remakeLimit');
  const b = req.body || {};
  const before = { script: J.scriptOf(s), options: optionsOf(s) };
  const options = choiceFields({ voice: b.voice, music: b.music }, before.options);
  const edited = withNewWords(before.script, b);
  // New words get every check a written script gets, and the classifier.
  const words = JSON.stringify(edited) !== JSON.stringify(before.script);
  let script = before.script;
  if (words) {
    const c = await checkEdited(edited, { seconds: s.seconds });
    if (!c.ok) return res.status(422).json({ code: c.code, error: t(c.code === 'unsafe' ? 'stories.edit.unsafe' : 'stories.edit.invalid') });
    script = c.script;
  }
  const q = QUALITY[(J.metaOf(s).render || {}).quality || quality()] || QUALITY.full;   // the size the kept clips were made at
  const plan = planRemake({ kind: 'remake', before, after: { script, options, scenes: sceneVisuals(script, { id: s.id }) }, cached: new Set(cachedClips(clipDir(J.storyDir(s.id))).keys()), keyOf: sc => sceneKey(sc, q) });
  if (plan.nothing) return res.status(422).json({ code: 'nothing', error: t('stories.edit.nothing') });
  const r = J.requestRemake(u, s, { kind: 'remake', script: words ? script : null, options: { voice: options.voice, music: options.music } });
  if (!r.ok) return refuse(req, res, r.code);
  log('info', 'story change queued', { id: s.id, kind: 'remake', words, voice: options.voice, music: options.music, render: plan.render.length, reuse: plan.reuse.length });
  res.json({ ok: true, plan: { render: plan.render.length, reuse: plan.reuse.length } });
});

router.post('/api/stories/:id/rewrite', requireBuilder, rateLimit('stories-edit', 20, 3600e3), async (req, res) => {
  const t = req.t, u = req.user, s = ownDone(req);
  if (!s) return refuse(req, res, 'notYours');
  if (J.remaking(s)) return refuse(req, res, 'busyEdit');
  if (J.usedToday(u) >= J.dailyLimit(u)) return refuse(req, res, 'limit');
  const b = req.body || {};
  const now = optionsOf(s);
  const o = choiceFields({ style: b.style, tone: b.tone }, now);
  const note = noteField(b);
  if (!note && o.style === now.style && o.tone === now.tone) return res.status(422).json({ code: 'needNote', error: t('stories.edit.needNote') });
  const refused = await screenAll(t, [note]);
  if (refused) return res.status(422).json({ code: 'refused', error: refused });
  if (!config.anthropicKey || !aiBudget.ok()) return res.status(503).json({ code: 'aiOff', error: t('stories.error.aiOff') });
  const r = J.requestRemake(u, s, { kind: 'rewrite', note, options: { style: o.style, tone: o.tone } });
  if (!r.ok) return refuse(req, res, r.code);
  log('info', 'story change queued', { id: s.id, kind: 'rewrite', style: o.style, tone: o.tone, note: !!note });
  res.json({ ok: true });
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
    case 'remake-retry': ok = J.retryRemake(u, s); break;
    case 'remake-dismiss': ok = J.dismissRemake(u, s); break;
    default: return next();
  }
  if (!ok) return res.status(409).json({ error: req.t('stories.error.other') });
  res.json({ ok: true, story: (({ status, share }) => ({ status, share }))(J.get(s.id) || { status: 'deleted', share: 'private' }) });
});
