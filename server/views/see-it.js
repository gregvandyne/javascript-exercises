// "See it in action": the short videos of the teaching tools (docs/decisions.md "Tool videos on the teacher pages"), one
// partial in two looks, like views/teacher-loop.js:
//
//   seeIt(req, { variant: 'landing' })  the section on the teacher landing at "/" (routes/landing.js), lp-* look
//                                       (public/css/landing.css)
//   seeIt(req, { variant: 'page' })     /teachers (routes/teachers.js), the app's look (public/css/app.css)
//
// The videos are the 720p web cuts in public/video (scripts/demo-video/README.md steps 6-7): no autoplay, muted until the
// viewer turns the sound on, nothing loaded but the poster until Play, captions as a track (they are also burned in).
// A video is shown only when its .mp4, poster and captions are all there, so a missing file never shows an empty player.
// Showing a video only shows it: who may use a tool is still services/teacher-tools.js toolAccess, unchanged.
import fs from 'node:fs';
import { html, raw } from './html.js';
import { ico } from './icon.js';
import { tHtml } from '../i18n/index.js';
import { plansOn } from '../services/teacher-tools.js';

const VIDEO_DIR = new URL('../../public/video/', import.meta.url);
/** The videos, in order. Adding one is one entry here, its three files in public/video/oomba-<id>.*, and its title and
 *  line under teachers.videos.<id> in the locale files. */
export const VIDEOS = [
  { id: 'manipulatives', emoji: '🧮' },
  { id: 'figures', emoji: '📐' },
  { id: 'room', emoji: '📡' },
  // The Classroom Dashboard video goes here when it is made: { id: 'dashboard', emoji: '📊' },
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
 * cta: the call to action under the grid (markup, the page's own sign-up button). The note under the grid says who can use
 * the tools today, by the same switch as toolAccess: with paid plans on for everyone, "part of the Teacher plan"; off, only
 * the tester list may use them, so it says they are being tried out in a few classrooms.
 */
export function seeIt(req, { variant = 'page', cta = '' } = {}) {
  const list = readyVideos();
  if (!list.length) return '';
  const t = req.t;
  const landing = variant === 'landing';
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
  const head = landing
    ? html`<header class="lp-sec-head">${tx(t, 'p', 'teachers.videos.kicker', ' class="lp-eyebrow"')}${tx(t, 'h2', 'teachers.videos.h', ' id="see-it-h"')}${tx(t, 'p', 'teachers.videos.lead')}</header>`
    : html`${tx(t, 'h2', 'teachers.videos.h', ' id="see-it-h"')}${tx(t, 'p', 'teachers.videos.lead')}`;
  const grid = html`<ul class="pv-grid" data-n="${list.length}">${list.map(item)}</ul>
    ${tx(t, 'p', plansOn() ? 'teachers.videos.plan' : 'teachers.videos.testing', ` class="${landing ? 'lp-note ' : 'small muted '}pv-plan"`)}
    ${cta ? html`<div class="${landing ? 'lp-ctas lp-ctas-c' : 'row'} pv-cta">${cta}</div>` : ''}`;
  return landing
    ? html`<section class="lp-sec pv pv-landing" id="see-it" aria-labelledby="see-it-h"><div class="lp-wrap">${head}${grid}</div></section>`
    : html`<section class="lp-sec pv" id="see-it" aria-labelledby="see-it-h">${head}${grid}</section>`;
}
