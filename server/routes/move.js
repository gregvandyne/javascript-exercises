// Brain Breaks: Oomba Breathe & Bend (/move). A standalone Move area, deliberately NOT a course and
// NOT a game: no course step points at it (the course-containment rule is about course games in the
// games catalogue; this is neither), and any teacher or student can open it between lessons.
//   GET  /move                 the series index (Episode 1 playable, the season listed)
//   GET  /move/:episode        the player page (public/js/move.js): Remy poses by segment, narration
//                              through the AI voice (POST /api/tts ctx 'move'), captions that are the
//                              narration lines word for word, in-code background music, teacher controls
//   POST /api/move/complete    { episode } -> records a finish, but only the player calls it, once,
//                              at the end of Starfish Rest; the server stores it only for a signed-in,
//                              non-guest user (services/move.js). Guests get { stored: false }.
// Copy lives under move.* in the locale files (English first; other languages fall back to the
// English, marked lang="en" like the teachers pages). The episode's own words (segment names,
// narration, seated versions) live in services/move-data.js, English first by design.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import { html, raw, jsonData } from '../views/html.js';
import { page, notFound } from '../views/layout.js';
import { remyStage } from '../views/move.js';
import * as MOVE from '../services/move.js';
import * as tts from '../services/tts.js';
import { rateLimit } from '../services/ratelimit.js';
import { fb } from './teachers.js';

export const router = Router();
const CSS = raw('<link rel="stylesheet" href="/css/move.css">');

/** The AI voice languages the player may use: narration is English, so this is ['en'] or nothing. */
const moveTts = () => { const langs = tts.onLocales().filter(l => l === 'en'); return langs.length ? { langs } : null; };

/**
 * The rendered 3D pose frames (public/img/move/frames/<pose>.jpg and <pose>-seated.jpg): the
 * player's visual layer since Greg's art redirect (flat SVG Remy kept only as the fallback for a
 * pose whose frame file is missing). Maps pose key -> URL, or omits the key when the file is not
 * there, so the player can fall back per pose and a new episode's frames can land file by file.
 *
 * Storage note (Episode 1, 2026-11-05): the frames were pushed to GitHub through Muse's GitHub
 * connector, which carries UTF-8 text only, so Episode 1's frames are stored as base64 text
 * (<pose>.jpg.b64 next to where the .jpg belongs) and served decoded by the /move-frames route
 * below. A real .jpg file always wins over its .b64 twin, so the cleanup is: commit the real
 * JPGs with ordinary git and delete the .b64 files; no code change needed.
 */
const FRAME_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'img', 'move', 'frames');
const frameUrl = key => (fs.existsSync(path.join(FRAME_DIR, `${key}.jpg`))
  ? `/img/move/frames/${key}.jpg`
  : fs.existsSync(path.join(FRAME_DIR, `${key}.jpg.b64`)) ? `/move-frames/${key}.jpg` : null);

/** Serves a base64-stored frame (see the storage note above) as a real JPEG. */
router.get('/move-frames/:file', (req, res) => {
  const key = String(req.params.file || '').replace(/\.jpg$/, '');
  if (!/^[a-z][a-z-]*$/.test(key)) return res.status(404).end();
  fs.readFile(path.join(FRAME_DIR, `${key}.jpg.b64`), 'utf8', (err, b64) => {
    if (err) return res.status(404).end();
    const bytes = Buffer.from(b64.replace(/\s+/g, ''), 'base64');
    res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' }).send(bytes);
  });
});

/**
 * Greg's real video clips (public/video/move/<episode>/<slug>.mp4, names from CLIP_SLUGS in the
 * episode data). One media slot per segment: when a clip file exists the player loops it over
 * the segment with the still frame as poster; when it does not, the still frame shows. At the
 * Episode 1 merge every segment is a still; clips drop in as a content update, no code change.
 */
const CLIP_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'video', 'move');
function clipsFor(ep) {
  const out = {};
  for (const s of ep.segments) {
    const slug = MOVE.CLIP_SLUGS[s.id];
    if (slug && fs.existsSync(path.join(CLIP_DIR, ep.id, `${slug}.mp4`))) out[s.id] = `/video/move/${ep.id}/${slug}.mp4`;
  }
  return out;
}
function framesFor(ep) {
  const out = {};
  for (const s of ep.segments) {
    const u = frameUrl(s.pose); if (u) out[s.pose] = u;
    const su = frameUrl(`${s.pose}-seated`); if (su) out[`${s.pose}-seated`] = su;
  }
  return out;
}

router.get('/move', (req, res) => {
  const t = req.t, u = req.user;
  const done = MOVE.completionsFor(u);
  const ep = MOVE.EPISODES[0];
  const mins = Math.round(MOVE.episodeSeconds(ep) / 60);
  const body = html`
  <div class="mv-hero"><h1 ${fb(t, 'move.h')}>${t('move.h')}</h1><p class="lead" ${fb(t, 'move.sub')}>${t('move.sub')}</p></div>
  <div class="mv-cards">
    <a class="mv-card" href="/move/${ep.id}">
      ${frameUrl(ep.coverPose)
        ? html`<img src="${frameUrl(ep.coverPose)}" alt="Remy the Red Panda in Mountain Pose" width="640" height="427">`
        : html`<span class="mv-card-art mv-stage" data-pose="mountain" aria-hidden="true">${remyStage()}</span>`}
      <span class="mv-card-body"><h3>${ep.withHost}</h3>
      <p class="small muted">${ep.note} · <span ${fb(t, 'move.minutes')}>${t('move.minutes', { mins })}</span></p>
      ${done[ep.id] ? html`<span class="mv-done-badge" ${fb(t, 'move.doneBadge')}>${t('move.doneBadge')}</span>` : ''}
      <span class="btn btn-primary">${t('move.play')}</span></span>
    </a>
    ${MOVE.SERIES.season.filter(s => s.slug !== ep.id).map(s => html`
    <div class="mv-card mv-soon"><span class="mv-card-body"><h3>Episode ${s.n}: ${s.title}</h3>
      <p class="small muted">${s.note}</p><span class="btn btn-ghost" aria-disabled="true">${t('move.comingSoon')}</span></span></div>`)}
  </div>
  <section class="panel"><h2 ${fb(t, 'move.howH')}>${t('move.howH')}</h2>
    <p ${fb(t, 'move.how1')}>${t('move.how1')}</p><p ${fb(t, 'move.how2')}>${t('move.how2')}</p>
    <p ${fb(t, 'move.how3')}>${t('move.how3')}</p><p ${fb(t, 'move.how4')}>${t('move.how4')}</p></section>
  <section class="panel"><h2 ${fb(t, 'move.teachersH')}>${t('move.teachersH')}</h2>
    <p ${fb(t, 'move.teachersP')}>${t('move.teachersP')}</p>
    <p><a class="btn btn-ghost" href="/teachers">${t('nav.teachers')}</a></p></section>`;
  page(req, res, { title: t('move.title'), active: null, body, head: CSS, description: t('move.sub') });
});

router.get('/move/:episode', (req, res) => {
  const ep = MOVE.episodeById(req.params.episode);
  if (!ep) return notFound(req, res);
  const t = req.t, u = req.user;
  const done = MOVE.completionsFor(u);
  const mins = Math.round(MOVE.episodeSeconds(ep) / 60);
  const calm = [['calm', 'move.calmCalm'], ['okay', 'move.calmOkay'], ['wiggly', 'move.calmWiggly']];
  const body = html`
  <div class="mv-wrap">
    <p class="small muted" ${fb(t, 'move.episodeKicker')}>${t('move.episodeKicker', { n: ep.n })}</p>
    <h1>${ep.withHost}</h1>
    <p class="lead">${ep.note} · <span ${fb(t, 'move.minutes')}>${t('move.minutes', { mins })}</span>${done[ep.id] ? html` · <span class="mv-done-badge" ${fb(t, 'move.doneBadge')}>${t('move.doneBadge')}</span>` : ''}</p>

    <div class="mv-calm" id="mv-calm-before" role="group" aria-label="${t('move.calmBefore')}">
      <b ${fb(t, 'move.calmBefore')}>${t('move.calmBefore')}</b>
      ${calm.map(([k, key]) => html`<button class="btn btn-ghost" type="button" data-calm="${k}" aria-pressed="false"><span ${fb(t, key)}>${t(key)}</span></button>`)}
    </div>

    <div class="mv-stagebox">
      <div class="mv-frames" id="mv-frames" hidden>
        <div class="mv-framewrap" id="mv-framewrap">
          <img class="mv-frame" id="mv-frame-a" alt="" draggable="false">
          <img class="mv-frame" id="mv-frame-b" alt="" draggable="false">
          <video class="mv-video" id="mv-video" muted loop playsinline preload="auto" hidden></video>
          <div class="mv-frame-light" aria-hidden="true"></div>
        </div>
      </div>
      <div class="mv-stage" id="mv-stage" data-pose="intro" data-seated="0">${remyStage()}</div>
      <div class="mv-mini-cap" id="mv-mini-wrap" hidden>
        <div class="mv-mini mv-stage" id="mv-mini" data-pose="intro" data-seated="1">${remyStage()}</div>
        <img class="mv-mini-img" id="mv-mini-img" alt="" hidden>
        <p><b ${fb(t, 'move.seatedLabel')}>${t('move.seatedLabel')}</b><br><span id="mv-mini-text"></span></p>
      </div>
      <div class="mv-yourturn" id="mv-yourturn" aria-hidden="true">
        <svg viewBox="0 0 120 120"><circle class="ring-bg" cx="60" cy="60" r="52" fill="rgba(255,253,242,.92)" stroke-width="10"/>
        <circle class="ring-fg" id="mv-ring" cx="60" cy="60" r="52" fill="none" stroke-width="10" stroke-linecap="round" stroke-dasharray="326.7" stroke-dashoffset="326.7"/></svg>
        <p ${fb(t, 'move.yourTurn')}>${t('move.yourTurn')}</p>
      </div>
      <div class="mv-endcard" id="mv-endcard">
        <h2 ${fb(t, 'move.endH')}>${t('move.endH')}</h2>
        <p id="mv-endline">${ep.endLines[0]}</p>
        <div class="mv-calm" id="mv-calm-after" role="group" aria-label="${t('move.calmAfter')}">
          <b ${fb(t, 'move.calmAfter')}>${t('move.calmAfter')}</b>
          ${calm.map(([k, key]) => html`<button class="btn btn-ghost" type="button" data-calm="${k}" aria-pressed="false"><span ${fb(t, key)}>${t(key)}</span></button>`)}
        </div>
        <p class="mv-status" id="mv-done-status" role="status"></p>
        <div class="row">
          <button class="btn btn-primary" type="button" id="mv-again">${t('move.restartBtn')}</button>
          <a class="btn btn-ghost" href="/move">${t('move.backToClass')}</a>
        </div>
        <p class="small muted" ${fb(t, 'move.nextSoon')}>${t('move.nextSoon')}</p>
      </div>
    </div>

    <div class="mv-caption" id="mv-caption" aria-live="polite"></div>
    <div class="mv-meta"><span class="mv-segname" id="mv-segname"></span>
      <span class="mv-progress"><i id="mv-bar"></i></span><span class="mv-time" id="mv-time">0:00 / ${mins}:00</span></div>
    <div class="mv-controls">
      <button class="btn btn-primary" type="button" id="mv-play">${t('move.playBtn')}</button>
      <button class="btn" type="button" id="mv-restart">${t('move.restartBtn')}</button>
      <button class="btn" type="button" id="mv-cap-btn" aria-pressed="true">${t('move.captionsBtn')}</button>
      <button class="btn" type="button" id="mv-music-btn" aria-pressed="true">${t('move.musicBtn')}</button>
      <button class="btn" type="button" id="mv-narr-btn" aria-pressed="true">${t('move.narrationBtn')}</button>
      <button class="btn" type="button" id="mv-seated-btn" aria-pressed="false">${t('move.seatedBtn')}</button>
    </div>
    <p class="mv-status" id="mv-status" role="status" ${fb(t, 'move.ready')}>${t('move.ready')}</p>
  </div>
  ${jsonData('page-data', {
    episode: { id: ep.id, title: ep.title, endLines: ep.endLines, segments: ep.segments.map(s => ({ id: s.id, name: s.name, pose: s.pose, seconds: s.seconds, lines: s.lines, seated: s.seated || null, yourTurn: !!s.yourTurn })) },
    frames: framesFor(ep),
    clips: clipsFor(ep),
    tts: moveTts(), signedIn: !!u && !u.is_guest, alreadyDone: !!done[ep.id],
    ui: { play: t('move.playBtn'), pause: t('move.pauseBtn'), yourTurn: t('move.yourTurn'),
      guestDone: t('move.guestDone'), savedDone: t('move.savedDone'), alreadyDone: t('move.alreadyDone') },
  })}`;
  page(req, res, { title: ep.withHost, active: null, body, head: CSS, scripts: ['/js/move.js'], description: t('move.sub'), back: '/move', backLabel: t('move.title') });
});

router.post('/api/move/complete', rateLimit('move', 60, 60e3), (req, res) => {
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  const r = MOVE.complete(req.user, b.episode);
  if (!r.ok) return res.status(404).json({ error: 'No such episode.' });
  res.json(r);
});
