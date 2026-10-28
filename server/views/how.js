// "How it works" on /parents and /teachers: a layered picture in the hero (howArt) and numbered steps, each with a real
// screenshot of the site (howSteps). The screenshots are made by scripts/how-shots.js from a throwaway demo database with
// made-up names, and live in public/img/how as <slug>-p-390/-p-780 (phone, 390×844 CSS px) and <slug>-d-1024/-d-2048
// (desktop, 1024×640 CSS px). Both show the same screen, so one alt text is true at every width. A step whose pictures are missing is left out, so the page never shows a broken image.
//
// The markup is complete without JavaScript: every step shows its own picture. public/js/how.js only adds classes (the
// parallax, the reveal, and on wide screens a sticky screen that changes as the steps scroll by), and does nothing when
// the reader asked for reduced motion. Styles: public/css/how.css.
import fs from 'node:fs';
import { html, raw, esc } from './html.js';
import { VERSION } from './layout.js';
import { tHtml } from '../i18n/index.js';
import { familiesOn } from '../services/family.js';
import { googleEnabled } from '../oidc.js';

const DIR = new URL('../../public/img/how/', import.meta.url);
export const IMG = '/img/how/';
/** Every file one step's pictures need. */
export const howFiles = slug => [`${slug}-p-390.webp`, `${slug}-p-780.webp`, `${slug}-d-1024.webp`, `${slug}-d-2048.webp`];
const have = slug => howFiles(slug).every(f => fs.existsSync(new URL(f, DIR)));

/** The steps, in order. `when` hides a step whose screen is off on this server; `p` picks the caption's key. */
export const STEPS = {
  parents: [
    { n: 's1', slug: 'parents-start' },
    { n: 's2', slug: 'parents-play' },
    { n: 's3', slug: 'parents-build' },
    { n: 's4', slug: 'parents-share' },
    { n: 's5', slug: 'parents-friends' },
    // The family page and grown-up accounts exist only while paid-plan pages are on.
    { n: 's6', slug: 'parents-family', when: req => familiesOn(req) },
  ],
  teachers: [
    { n: 's1', slug: 'teachers-classes' },
    { n: 's2', slug: 'teachers-join', p: () => (googleEnabled() ? 'pgoogle' : 'p') },
    { n: 's3', slug: 'teachers-lesson' },
    { n: 's4', slug: 'teachers-student' },
    { n: 's5', slug: 'teachers-gradebook' },
  ],
};
/** The hero picture: a wide screen (desktop capture) and a phone (phone capture), reusing the steps' files. */
const ART = { parents: { laptop: 'parents-build', phone: 'parents-play' }, teachers: { laptop: 'teachers-gradebook', phone: 'teachers-student' } };

/** The steps shown on this page for this request. */
export const howStepList = (req, page) => STEPS[page].filter(s => (!s.when || s.when(req)) && have(s.slug));

/** The stylesheet, for page({ head }). */
export const howHead = () => raw(`<link rel="stylesheet" href="/css/how.css?v=${VERSION}">`);
export const HOW_SCRIPT = '/js/how.js';

/** lang/dir for a string still in English (the same as routes/teachers.js fb). */
const fb = (t, key) => (t.own(key) ? '' : ' lang="en" dir="ltr"');
const DESK = [1024, 2048];
const srcset = (slug, kind, widths) => widths.map(w => `${IMG}${slug}-${kind}-${w}.webp ${w}w`).join(', ');
/** A screenshot: the phone capture under 960px, the desktop capture from 960px. Width and height keep the space. */
function picture(slug, alt, { lazy = true } = {}) {
  return raw(`<picture><source media="(min-width:960px)" type="image/webp" srcset="${srcset(slug, 'd', DESK)}" sizes="(min-width:1240px) 640px, 52vw" width="1024" height="640">`
    + `<img src="${IMG}${slug}-p-390.webp" srcset="${srcset(slug, 'p', [390, 780])}" sizes="(min-width:640px) 220px, (min-width:600px) 260px, 70vw" width="390" height="844" alt="${esc(alt)}"${lazy ? ' loading="lazy"' : ''} decoding="async"></picture>`);
}

/** The hero's layered picture (decoration: aria-hidden, empty alt). Brand shapes at the back, a wide screen, a phone. */
export function howArt(req, page) {
  const a = ART[page];
  if (!a || !have(a.laptop) || !have(a.phone)) return '';
  // Under 960px the wide screen is not shown, and its <img> points at an empty pixel so phones don't download it.
  const blank = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
  return html`<div class="how-art" aria-hidden="true">
    <div class="how-l how-l0"><span class="how-shape how-blob"></span><span class="how-shape how-dot"></span><span class="how-shape how-star"></span></div>
    <div class="how-l how-l1"><div class="how-card how-laptop"><span class="how-bar"><i></i><i></i><i></i></span>${raw(`<picture><source media="(min-width:960px)" type="image/webp" srcset="${srcset(a.laptop, 'd', DESK)}" sizes="380px" width="1024" height="640"><img src="${blank}" width="1024" height="640" alt="" decoding="async"></picture>`)}</div></div>
    <div class="how-l how-l2"><div class="how-card how-phone">${raw(`<img src="${IMG}${a.phone}-p-390.webp" srcset="${srcset(a.phone, 'p', [390, 780])}" sizes="(min-width:960px) 150px, 120px" width="390" height="844" alt="" decoding="async">`)}</div></div>
  </div>`;
}

/** The "How it works" section: a heading, a lead, and an ordered list of steps (title, caption, screenshot). */
export function howSteps(req, page) {
  const t = req.t; const k = `${page}.how`;
  const list = howStepList(req, page);
  if (!list.length) return '';
  const step = (s, i) => {
    const pk = `${k}.${s.n}.${s.p ? s.p() : 'p'}`;
    return html`<li class="how-step" id="how-${i + 1}" data-step="${i + 1}">
      <div class="how-box">
        <span class="how-num" aria-hidden="true">${i + 1}</span>
        <div class="how-text">${raw(`<h3 class="how-h"${fb(t, `${k}.${s.n}.h`)}>${tHtml(t, `${k}.${s.n}.h`)}</h3><p${fb(t, pk)}>${tHtml(t, pk)}</p>`)}</div>
        <figure class="how-fig">${picture(s.slug, t(`${k}.${s.n}.alt`))}</figure>
      </div>
    </li>`;
  };
  return html`<section class="lp-sec how" id="how-it-works" aria-labelledby="how-h">
    ${raw(`<h2 id="how-h"${fb(t, `${k}.h`)}>${tHtml(t, `${k}.h`)}</h2><p class="how-lead"${fb(t, `${k}.lead`)}>${tHtml(t, `${k}.lead`)}</p>`)}
    <div class="how-body">
      <ol class="how-steps">${list.map(step)}</ol>
      <div class="how-stage" aria-hidden="true" hidden><div class="how-screen"><span class="how-bar"><i></i><i></i><i></i></span><div class="how-shots"></div></div><div class="how-prog"><span class="how-count" dir="ltr"></span><span class="how-dots"></span></div></div>
    </div>
  </section>`;
}
