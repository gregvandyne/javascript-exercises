// "See it in action": the short videos of the teaching tools (docs/decisions.md "Tool videos on the teacher pages"), one
// partial in two looks, like views/teacher-loop.js:
//
//   seeIt(req, { variant: 'landing' })  /teachers (routes/teachers.js), the teacher site's lp-* look (public/css/landing.css):
//                                       the homepage's video strip, played in its player (videoLink, videoDialog)
//   seeIt(req, { variant: 'page' })     the app's look (public/css/app.css): a <video> each
//
// The videos are the 720p web cuts in public/video (scripts/demo-video/README.md steps 6-7): no autoplay, muted until the
// viewer turns the sound on, nothing loaded but the poster until Play, captions as a track (they are also burned in).
// A video is shown only when its .mp4, poster and captions are all there, so a missing file never shows an empty player.
// Showing a video only shows it: who may use a tool is still services/teacher-tools.js toolAccess, unchanged.
import fs from 'node:fs';
import { html, raw } from './html.js';
import { ico } from './icon.js';
import { tHtml } from '../i18n/index.js';

const VIDEO_DIR = new URL('../../public/video/', import.meta.url);
/** The videos, in order. Adding one is one entry here, its three files in public/video/oomba-<id>.*, and its title and
 *  line under teachers.videos.<id> in the locale files. overview: the Hub's own videos, on the homepage's video strip; in
 *  the "a minute each" section on /teachers only the 60-second promo (seeIt promo), which its Hub card plays: the 60-second promo (scripts/hub-promo.mjs, behind the homepage's hero: routes/landing.js HERO_VIDEO) and the
 *  two-minute overview (scripts/hub-video.mjs). */
export const VIDEOS = [
  { id: 'hub-promo', emoji: '🏫', overview: true },
  { id: 'hub', emoji: '🏫', overview: true },
  { id: 'manipulatives', emoji: '🧮' },
  { id: 'figures', emoji: '📐' },
  { id: 'room', emoji: '📡' },
  { id: 'dashboard', emoji: '🖥️' },
];
export const videoFiles = id => [`oomba-${id}.mp4`, `oomba-${id}-poster.jpg`, `oomba-${id}.en.vtt`];
/** The videos whose files are all there (read once: the files ship with the build). */
const READY = VIDEOS.filter(v => videoFiles(v.id).every(f => fs.existsSync(new URL(f, VIDEO_DIR))));
export const readyVideos = () => READY;

/** lang/dir for a string that is still the English. */
const fb = (t, key) => (t.own(key) ? '' : raw(' lang="en" dir="ltr"'));
const tx = (t, tag, key, attrs = '') => raw(`<${tag}${attrs}${fb(t, key)}>${tHtml(t, key)}</${tag}>`);

/**
 * The section, or '' when no video is ready.
 * cta: the call to action under the grid (markup, the page's own sign-up button). note: false leaves out the note (on
 * /teachers the new-tools section above says it). The note under the grid says who can use
 * the tools today: the Classroom Dashboard is free for every class's teacher (routes/dash.js, no plan); the Manipulatives,
 * their live rooms and Figures are Teacher plan tools (toolAccess), said the homepage's way whether or not paid plans are
 * on for everyone yet.
 */
/** A link that plays a video in the teacher site's player (public/js/landing.js, the <dialog> from videoDialog), or opens
 *  the file itself without script. inner: the link's content (markup). */
export const videoLink = (t, id, inner, cls, title = t(`teachers.videos.${id}.title`), attrs = '') => html`<a class="${cls}" href="/video/oomba-${id}.mp4" data-video="/video/oomba-${id}.mp4" data-poster="/video/oomba-${id}-poster.jpg" data-vtt="/video/oomba-${id}.en.vtt" data-title="${title}" aria-label="${t('landing.videos.play', { title })}"${raw(attrs)}>${inner}</a>`;
/** The player every videoLink opens (one per page). */
export const videoDialog = t => html`<dialog class="lp-vd" id="lp-vd" aria-labelledby="lp-vd-h">
    <div class="lp-vd-in"><div class="lp-vd-top"><h2 id="lp-vd-h" class="lp-vd-h" lang="en" dir="ltr"></h2><button type="button" class="lp-vd-x" data-close aria-label="${t('landing.videos.close')}"><span aria-hidden="true">×</span></button></div>
    <video class="lp-vd-v" controls playsinline muted preload="none" width="1280" height="720"></video></div>
  </dialog>`;
/** Is this tool's video ready (its three files there)? */
export const videoReady = id => READY.some(v => v.id === id);

export function seeIt(req, { variant = 'page', cta = '', note = true, promo = false } = {}) {
  // promo: the Hub's 60-second promo first (the homepage's hero video), for /teachers, whose Hub card plays it here.
  const list = readyVideos().filter(v => !v.overview || (promo && v.id === 'hub-promo'));
  if (!list.length) return '';
  const t = req.t;
  const landing = variant === 'landing';
  // The teacher site (/teachers): the homepage's video strip, the first one big, each played in the page's player.
  if (landing) {
    const card = (v, i) => videoLink(t, v.id, html`<img src="/video/oomba-${v.id}-poster.jpg" width="1280" height="720" alt="" loading="lazy" decoding="async"><span class="lp-pb" aria-hidden="true"></span><span class="lp-vcap"><b${fb(t, `teachers.videos.${v.id}.title`)}>${t(`teachers.videos.${v.id}.title`)}</b>${tx(t, 'span', `teachers.videos.${v.id}.p`)}</span>`,
      `lp-vid${i === 0 ? ' lp-vid-big' : ''}`, undefined, i === 0 && list.length > 4 ? ` style="grid-row:span ${list.length - 1}"` : '');
    return html`<section class="lp-sec lp-dots lp-alt" id="see-it" aria-labelledby="see-it-h"><div class="lp-wrap">
    <header class="lp-head">${tx(t, 'p', 'teachers.videos.kicker', ' class="lp-eyebrow"')}${tx(t, 'h2', 'teachers.videos.h', ' id="see-it-h"')}${tx(t, 'p', 'teachers.videos.lead', ' class="lp-sub"')}</header>
    <div class="lp-vids" data-n="${list.length}">${list.map(card)}</div>
    ${note ? tx(t, 'p', 'teachers.videos.plan', ' class="lp-small lp-center pv-plan"') : ''}
    ${cta ? html`<div class="lp-ctas pv-cta">${cta}</div>` : ''}
  </div>
  ${videoDialog(t)}</section>`;
  }
  const item = v => {
    const k = `teachers.videos.${v.id}`;
    return html`<li class="pv-item">
      <video class="pv-video" controls muted playsinline preload="none" width="1280" height="720" poster="/video/oomba-${v.id}-poster.jpg" aria-labelledby="pv-${v.id}-h" aria-describedby="pv-${v.id}-p">
        <source src="/video/oomba-${v.id}.mp4" type="video/mp4">
        <track kind="captions" src="/video/oomba-${v.id}.en.vtt" srclang="en" label="English">
      </video>
      <div class="pv-text">
        ${raw(`<h3 class="pv-h" id="pv-${v.id}-h"${fb(t, `${k}.title`)}>`)}${ico(v.emoji, { size: 18 })} ${t(`${k}.title`)}${raw('</h3>')}
        ${tx(t, 'p', `${k}.p`, ` class="pv-p" id="pv-${v.id}-p"`)}
      </div>
    </li>`;
  };
  const head = html`${tx(t, 'h2', 'teachers.videos.h', ' id="see-it-h"')}${tx(t, 'p', 'teachers.videos.lead')}`;
  const grid = html`<ul class="pv-grid" data-n="${list.length}">${list.map(item)}</ul>
    ${note ? tx(t, 'p', 'teachers.videos.plan', ' class="small muted pv-plan"') : ''}
    ${cta ? html`<div class="row pv-cta">${cta}</div>` : ''}`;
  return html`<section class="lp-sec pv" id="see-it" aria-labelledby="see-it-h">${head}${grid}</section>`;
}
