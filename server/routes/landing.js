// The teacher marketing site at "/" for visitors who are not signed in (docs/decisions.md "Teacher landing page").
//
// A self-contained page: its own header, footer, CSS (public/css/landing.css) and script (public/js/landing.js). It does
// not use the app shell (views/layout.js), so the app's navigation can change without touching it, and it shares only
// the SEO helpers (server/seo.js) and the brand marks.
//
// THE ONE SHARED HOOK (search for "LANDING HOOK"): this router is mounted in app.js just before the home route
// (routes/discover.js GET /). GET / with no session at all (a first visit, a search engine, a link preview) is answered
// here; anyone with a session (kids, students, teachers, grown-ups, and a guest who already played) falls through to the
// home page they have today, unchanged. renderLanding(req, res) is exported for whoever merges a new home route.
//
// "Just Play" (JUST_PLAY_URL): GET /play is the Play page (routes/discover.js), for every role,
// so kids have a front door while "/" belongs to teachers. /play is private (server/seo.js PRIVATE_RE:
// X-Robots-Tag noindex), so it never competes with "/" in search.
//
// Prices: kids are never sold to, and amounts appear only on /plans (tests/unit/billing*.test.js). The landing says "one
// simple yearly price per teacher" and links to /plans; LANDING_SHOW_PRICE (off) is the one switch that would show the
// amount here and add it to the structured data.
//
// Free and paid, one story (the same line as /teachers, teachers.free.line): what is always free (the games, classes,
// lessons, progress, free daily Builder messages) and what the Teacher plan adds (the class's daily AI builds). The hero
// says it in one line, the pricing section has a Free card beside the Teacher card, and nothing free is listed as a
// Teacher plan feature.
//
// Google Classroom (#classroom): shown only when the connection is on for this server (services/gclassroom.js enabled()),
// like /teachers; its words are teachers.classroom.*, shared with /teachers, and each one matches what the code does.
import { Router } from 'express';
import { html, raw, esc } from '../views/html.js';
import { appMark, wordmark, BRAND, ICONS_V } from '../views/brand.js';
import { VERSION } from '../views/layout.js';
import { BAR_COLORS } from '../theme.js';
import { tHtml, localeInfo, availableLocales, DEFAULT_LOCALE } from '../i18n/index.js';
import * as seo from '../seo.js';
import { liveOn } from '../services/classlive-sessions.js';
import * as funnel from '../services/funnel.js';
import { countable } from '../services/traffic.js';
import { teacherLoop } from '../views/teacher-loop.js';
import { rateLimit } from '../services/ratelimit.js';
import { enabled as classroomOn } from '../services/gclassroom.js';
import { config } from '../config.js';

/** Where "Just Play" goes: the games for kids, no sign-up. */
export const JUST_PLAY_URL = '/play';
/** Every "Start free trial" (the Teacher plan's 14-day trial, no card). */
export const TRIAL_URL = '/trial';
/** "Host a live game now": the three-field teacher sign-up, then the Quick game chooser (routes/quick-live.js). */
export const HOST_NOW_URL = '/teachers/host';
/** Schools: invoices, purchase orders, more than a few teachers. */
export const SALES_EMAIL = 'Greg@oomba.ai';
/** Show the Teacher plan's price on the landing (and in its structured data). Off: prices live on /plans only. */
export const LANDING_SHOW_PRICE = false;
export const TEACHER_PRICE = { amount: '119', currency: 'USD', label: '$119' };
/** Is the landing at "/"? On unless LANDING_AT_ROOT=0 (the unit tests written for the old signed-out home turn it off). */
export const landingAtRoot = () => process.env.LANDING_AT_ROOT !== '0';
/** The covers in public/img/landing (made from public/covers: 240 and 480 px wide webp, 3:4). */
const COVER = slug => `/img/landing/${slug}`;
/** Who gets the landing at "/": nobody signed in and no guest session. */
export const wantsLanding = req => landingAtRoot() && !req.user;

/** Clicks counted by the page's beacon (POST /landing/count/<cta>): funnel steps, a daily total each, nothing else. */
const CTAS = new Map([['host', 'landing.host'], ['trial', 'landing.trial'], ['play', 'landing.play'], ['pricing', 'landing.pricing'], ['how', 'landing.how']]);

export const router = Router();

// LANDING HOOK, part 1: GET /play is the Play page for everyone (routes/discover.js), so "Just Play" lands there.
// LANDING HOOK, part 2: "/" with no session is the teacher landing; everyone else gets the home page as before.
router.get('/', (req, res, next) => (wantsLanding(req) ? renderLanding(req, res) : next()));

router.post('/landing/count/:cta', rateLimit('landing', 30, 60e3, undefined, { byIp: true }), (req, res) => {
  const step = CTAS.get(req.params.cta);
  if (!step) return res.status(404).end();
  if (req.headers['sec-fetch-site'] === 'same-origin' && countable(req)) funnel.bump(step);
  res.set('Cache-Control', 'no-store').status(204).end();
});

// ---------------------------------------------------------------------------------------------------- the page
const ARROW = raw('<span class="lp-arrow flip" aria-hidden="true">→</span>');
const check = raw('<svg class="lp-check" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M4 10.5l4 4 8-9" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>');
/** A cover picture, sized so nothing moves when it loads. */
const cover = (slug, { w = 240, eager = false, cls = '' } = {}) => raw(`<img class="${cls}" src="${COVER(slug)}-${w}.webp" srcset="${COVER(slug)}-240.webp 240w, ${COVER(slug)}-480.webp 480w" sizes="${w}px" width="${w}" height="${Math.round(w * 4 / 3)}" alt="" decoding="async"${eager ? '' : ' loading="lazy"'}>`);
/** A screenshot from public/img/how (1024 and 2048 wide, 16:10). */
const shot = (name, alt, cls = '') => html`<img class="${cls}" src="/img/how/${name}-d-1024.webp" srcset="/img/how/${name}-d-1024.webp 1024w, /img/how/${name}-d-2048.webp 2048w" sizes="(min-width: 1100px) 560px, 92vw" width="1024" height="640" alt="${alt}" loading="lazy" decoding="async">`;

/** The landing's words for this request: t, plus English-fallback marking for a key this language doesn't have yet. */
function words(req) {
  const t = req.t;
  const fb = key => (t.own(key) ? '' : raw(' lang="en" dir="ltr"'));
  return { t, fb };
}

/** A small note under a button row, marked English until this language has it. */
const el = (fb, t, key) => html`<p class="lp-note"${fb(key)}>${t(key)}</p>`;

export function renderLanding(req, res) {
  const { t, fb } = words(req);
  const locale = req.locale || DEFAULT_LOCALE; const info = localeInfo(locale);
  const live = liveOn();
  const count = availableLocales().length;
  const lp = p => (req.pathLocale && seo.localizable(p) ? seo.localeUrl(p, req.pathLocale) : p);
  const theme = req.theme === 'light' ? 'light' : 'dark';   // dark by design; an explicit Light choice gets the light variant
  const title = t('landing.meta.title');
  const description = seo.clip(t('landing.meta.description'), 160);
  const langs = seo.langsWithKey('landing.hero.h1');
  const faq = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => [t(`landing.faq.q${i}`), t(`landing.faq.a${i}${i === 2 ? 'free' : ''}`, { count })]);
  const price = LANDING_SHOW_PRICE ? TEACHER_PRICE.label : null;
  const cta = (href, label, { cls = 'lp-btn-primary', name = 'trial', big = false } = {}) =>
    html`<a class="lp-btn ${cls}${big ? ' lp-btn-big' : ''}" href="${href}" data-cta="${name}">${label}</a>`;

  if (req.method === 'GET' && countable(req)) funnel.bump('landing.view');

  const header = html`<a class="lp-skip" href="#lp-main">${t('landing.nav.skip')}</a>
<header class="lp-bar" id="lp-bar">
  <a class="lp-logo" href="${lp('/')}" aria-label="${t('landing.nav.home')}">${appMark('lp-mark')}<span class="lp-word" dir="ltr" aria-hidden="true">${wordmark('lp-wordmark')}<span>Academy</span></span></a>
  <nav class="lp-nav" aria-label="${t('landing.nav.label')}">
    <a href="#how" data-cta="how">${t('landing.nav.how')}</a><a href="#builder">${t('landing.nav.builder')}</a><a href="#courses">${t('landing.nav.courses')}</a>${live ? html`<a href="#live">${t('landing.nav.live')}</a>` : ''}<a href="#pricing" data-cta="pricing">${t('landing.nav.pricing')}</a><a href="#faq">${t('landing.nav.faq')}</a>
  </nav>
  <div class="lp-actions">
    <a class="lp-signin" href="/login">${t('landing.nav.signIn')}</a>
    <a class="lp-btn lp-btn-ghost lp-btn-sm lp-justplay" href="${JUST_PLAY_URL}" data-cta="play">${t('landing.nav.justPlay')} ${ARROW}</a>
    <a class="lp-btn lp-btn-primary lp-btn-sm" href="${TRIAL_URL}" data-cta="trial" aria-label="${t('landing.nav.trial')}"><span class="lp-long">${t('landing.nav.trial')}</span><span class="lp-short" aria-hidden="true">${t('landing.nav.trialShort')}</span></a>
  </div>
</header>`;

  // The sky: three star fields and the aurora, each moved at its own speed by public/js/landing.js (data-depth).
  const sky = raw(`<div class="lp-sky" aria-hidden="true"><div class="lp-stars lp-s1" data-sky=".05"></div><div class="lp-stars lp-s2" data-sky=".12"></div><div class="lp-stars lp-s3" data-sky=".22"></div><div class="lp-aurora" data-sky=".08"><i></i><i></i><i></i></div></div>`);

  const FLOATS = [['quest-race', 'lp-f1', '-.18'], ['brain-board', 'lp-f2', '.12'], ['robo-route', 'lp-f3', '-.28'], ['tug-of-math', 'lp-f4', '.22'], ['word-trail', 'lp-f5', '-.1']];
  const hero = html`<section class="lp-hero" aria-labelledby="lp-h1">
  <div class="lp-floor" aria-hidden="true" data-depth=".35"><div class="lp-floor-grid"></div></div>
  <div class="lp-floats" aria-hidden="true">${FLOATS.map(([s, c, d]) => html`<div class="lp-float ${c}" data-depth="${d}"><div class="lp-bob">${cover(s, { eager: true })}</div></div>`)}</div>
  <div class="lp-wrap lp-hero-in">
    <div class="lp-hero-copy">
      <p class="lp-kicker"${fb('landing.hero.kicker')}><span class="lp-pulse" aria-hidden="true"></span>${t('landing.hero.kicker')}</p>
      <h1 id="lp-h1" class="lp-h1"${fb('landing.hero.h1')}>${t('landing.hero.h1')}</h1>
      <p class="lp-lead"${fb('landing.hero.lead')}>${t('landing.hero.lead')}</p>
      <div class="lp-ctas">
        ${cta(TRIAL_URL, t('landing.hero.cta'), { big: true })}
        ${live ? html`<a class="lp-btn lp-btn-spark lp-btn-big" href="${HOST_NOW_URL}" data-cta="host" id="lp-host-now"${fb('quickLive.cta')}><span aria-hidden="true">📡</span> ${t('quickLive.cta')}</a>` : ''}
        <a class="lp-btn lp-btn-ghost lp-btn-big" href="#how" data-cta="how">${t('landing.hero.how')} <span aria-hidden="true">↓</span></a>
      </div>
      <ul class="lp-trust">
        <li>${check}${t('landing.hero.trustCard')}</li><li>${check}${t('landing.hero.trustCancel')}</li><li>${check}${t('landing.hero.trustStudents')}</li>
      </ul>
      <p class="lp-freeline"${fb('teachers.free.line')}>${tHtml(t, 'teachers.free.line', { daily: req.fmt.int(config.teacherDailyMessages), plans: '/plans' })}</p>
      <a class="lp-games" href="${JUST_PLAY_URL}" data-cta="play"><span class="lp-fan" aria-hidden="true">${HERO_FAN.map(s => cover(s, { eager: true }))}</span><span><b>30+</b> ${t('landing.facts.games')} ${ARROW}</span></a>
    </div>
    ${demo(t, fb)}
  </div>
</section>`;

  const facts = html`<section class="lp-facts" aria-label="${t('landing.nav.label')}"><div class="lp-wrap"><ul>
    <li><b>30+</b><span>${t('landing.facts.games')}</span></li>
    <li><b>3</b><span>${t('landing.facts.courses')}</span></li>
    <li><b>${count}</b><span>${t('landing.facts.languages')}</span></li>
    <li><b>0</b><span>${t('landing.facts.installs')}</span></li>
  </ul></div></section>`;

  const how = html`<section class="lp-sec" id="how" aria-labelledby="how-h">
  <div class="lp-wrap">
    <header class="lp-sec-head"><p class="lp-eyebrow">${t('landing.how.kicker')}</p><h2 id="how-h">${t('landing.how.h')}</h2><p>${t('landing.how.lead')}</p></header>
    <ol class="lp-steps">
      ${[['1', '📄', 's1'], ['2', '✨', 's2'], ['3', '🎮', 's3']].map(([n, e, k]) => html`<li class="lp-card lp-step rv"><span class="lp-step-n" aria-hidden="true">0${n}</span><span class="lp-step-e" aria-hidden="true">${e}</span><h3>${t(`landing.how.${k}.h`)}</h3><p>${t(`landing.how.${k}.p`)}</p></li>`)}
    </ol>
  </div>
</section>`;

  // The teaching loop, Plan → Play → Check → Feedback, with the four real screens (views/teacher-loop.js, docs/decisions.md
  // "The teaching loop"): right after how it works.
  const loopSec = teacherLoop(t, { variant: 'landing', id: 'loop', live, cta: cta(TRIAL_URL, t('landing.hero.cta'), { big: true }) });

  const builder = html`<section class="lp-sec lp-split" id="builder" aria-labelledby="builder-h">
  <div class="lp-glow lp-glow-a" aria-hidden="true" data-depth=".25"></div>
  <div class="lp-wrap lp-split-in">
    <div class="lp-split-text rv">
      <p class="lp-eyebrow">${t('landing.builder.kicker')}</p><h2 id="builder-h">${t('landing.builder.h')}</h2><p>${t('landing.builder.lead')}</p>
      <ul class="lp-list">${[1, 2, 3, 4, 5].map(i => html`<li>${check}<span>${t(`landing.builder.li${i}`)}</span></li>`)}</ul>
      ${cta(TRIAL_URL, t('landing.hero.cta'))}
    </div>
    <figure class="lp-device rv">
      <div class="lp-screen">${shot('parents-build', t('landing.builder.shotAlt'))}</div>
      <div class="lp-bubble lp-bubble-you" data-depth="-.12"><b>${t('landing.builder.you')}</b><span>${t('landing.builder.msg')}</span><span class="lp-chip">📄 ${t('landing.demo.file')}</span></div>
      <div class="lp-bubble lp-bubble-bot" data-depth=".1"><b>🤖 ${t('landing.demo.builderTag')}</b><span>${t('landing.builder.bot')}</span></div>
      <figcaption>${t('landing.builder.caption')}</figcaption>
    </figure>
  </div>
</section>`;

  const COURSES = [['nq', '/teachers/number-quest', 'lp-c-nq', ['sum-racer', 'fraction-factory', 'quest-race']], ['cs', '/teachers/cs-quest', 'lp-c-cs', ['data-detective', 'robo-route', 'packet-post']], ['cd', '/teachers/cyber-defenders', 'lp-c-cd', ['escape-the-post-office', 'trick-inbox', 'packet-post']]];
  const courses = html`<section class="lp-sec" id="courses" aria-labelledby="courses-h">
  <div class="lp-wrap">
    <header class="lp-sec-head"><p class="lp-eyebrow">${t('landing.courses.kicker')}</p><h2 id="courses-h">${t('landing.courses.h')}</h2><p>${t('landing.courses.lead')}</p></header>
    <div class="lp-courses">
      ${COURSES.map(([k, href, cls, games]) => html`<article class="lp-card lp-course ${cls} rv">
        <div class="lp-course-art" aria-hidden="true">${games.map(s => cover(s))}</div>
        <p class="lp-tag">${t(`landing.courses.${k}.tag`)}</p>
        <h3>${t(`landing.courses.${k}.name`)}</h3>
        <p>${t(`landing.courses.${k}.p`)}</p>
        <a class="lp-more" href="${lp(href)}">${t('landing.courses.link')}<span class="sr-only">: ${t(`landing.courses.${k}.name`)}</span> ${ARROW}</a>
      </article>`)}
    </div>
  </div>
  <div class="lp-marquee" aria-hidden="true"><div class="lp-marquee-track">${[...MARQUEE, ...MARQUEE].map(s => cover(s))}</div></div>
</section>`;

  // Google Classroom: only when it is on here (every line is teachers.classroom.*, the same words as /teachers).
  const classroomSec = classroomOn() ? html`<section class="lp-sec" id="classroom" aria-labelledby="classroom-h">
  <div class="lp-wrap">
    <header class="lp-sec-head"><p class="lp-eyebrow">${t('teachers.classroom.kicker')}</p><h2 id="classroom-h"${fb('teachers.classroom.h')}>${t('teachers.classroom.h')}</h2><p${fb('teachers.classroom.lead')}>${t('teachers.classroom.lead')}</p></header>
    <div class="lp-card lp-gc rv">
      <ul class="lp-list lp-list-2">${['li1', 'li2', 'li3', 'li4', 'li5'].map(k => html`<li>${check}<span${fb(`teachers.classroom.${k}`)}>${t(`teachers.classroom.${k}`)}</span></li>`)}</ul>
      <p class="lp-small"${fb('teachers.classroom.note')}>${t('teachers.classroom.note')} <a href="/privacy#google">${t('teachers.classroom.privacy')}</a></p>
    </div>
  </div>
</section>` : '';

  const liveSec = live ? html`<section class="lp-sec lp-split lp-split-rev" id="live" aria-labelledby="live-h">
  <div class="lp-glow lp-glow-b" aria-hidden="true" data-depth="-.2"></div>
  <div class="lp-wrap lp-split-in">
    <div class="lp-split-text rv">
      <p class="lp-eyebrow">${t('landing.live.kicker')}</p><h2 id="live-h">${t('landing.live.h')}</h2><p>${t('landing.live.lead')}</p>
      <ul class="lp-list">${[1, 2, 3, 4].map(i => html`<li>${check}<span>${t(`landing.live.li${i}`)}</span></li>`)}</ul>
      <div class="lp-ctas lp-live-ctas">
        <a class="lp-btn lp-btn-spark" href="${HOST_NOW_URL}" data-cta="host"${fb('quickLive.cta')}><span aria-hidden="true">📡</span> ${t('quickLive.cta')}</a>
        <a class="lp-btn lp-btn-ghost" href="/join" id="lp-join"${fb('quickLive.haveCode')}>${t('quickLive.haveCode')}</a>
      </div>
      ${el(fb, t, 'quickLive.ctaNote')}
      <a class="lp-more" href="${lp('/teachers/live')}">${t('landing.live.link')} ${ARROW}</a>
    </div>
    <figure class="lp-device lp-device-live rv">
      <div class="lp-screen">${shot('live-lobby', t('landing.live.shotAlt'))}</div>
      <div class="lp-phone" data-depth=".16" aria-hidden="true"><img src="/img/how/live-play-p-390.webp" srcset="/img/how/live-play-p-390.webp 390w, /img/how/live-play-p-780.webp 780w" sizes="170px" width="390" height="844" alt="" loading="lazy" decoding="async"></div>
    </figure>
  </div>
</section>` : '';

  const why = html`<section class="lp-sec" id="why" aria-labelledby="why-h">
  <div class="lp-wrap">
    <header class="lp-sec-head"><p class="lp-eyebrow">${t('landing.why.kicker')}</p><h2 id="why-h">${t('landing.why.h')}</h2><p>${t('landing.why.lead')}</p></header>
    <div class="lp-why">
      ${[['b1', '🧠'], ['b2', '⚡'], ['b3', '🔁'], ['b4', '🙋'], ['b5', '🛠️']].map(([k, e]) => html`<article class="lp-card lp-why-card rv"><span class="lp-why-e" aria-hidden="true">${e}</span><h3>${t(`landing.why.${k}.h`)}</h3><p>${t(`landing.why.${k}.p`)}</p></article>`)}
    </div>
    <p class="lp-sources"><span>${t('landing.why.sources')}:</span> <a href="https://doi.org/10.1111/j.1467-9280.2006.01693.x" rel="noopener" lang="en" dir="ltr">Roediger &amp; Karpicke (2006), Test-enhanced learning, <i>Psychological Science</i></a> <a href="https://doi.org/10.3102/003465430298487" rel="noopener" lang="en" dir="ltr">Hattie &amp; Timperley (2007), The power of feedback, <i>Review of Educational Research</i></a></p>
    <p class="lp-research"><a class="lp-more" href="/research">${t('teachers.research.link')} ${ARROW}</a></p>
  </div>
</section>`;

  const safety = html`<section class="lp-sec" id="safety" aria-labelledby="safety-h">
  <div class="lp-wrap lp-safety">
    <div class="lp-shield rv" aria-hidden="true"><svg viewBox="0 0 120 140"><defs><linearGradient id="lp-sg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7DD2A4"/><stop offset=".6" stop-color="#66C792"/><stop offset="1" stop-color="#FFD23F"/></linearGradient></defs><path d="M60 6l48 18v38c0 32-20 58-48 72C32 120 12 94 12 62V24z" fill="none" stroke="url(#lp-sg)" stroke-width="5"/><path d="M40 70l14 14 28-32" fill="none" stroke="url(#lp-sg)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
    <div class="rv">
      <p class="lp-eyebrow">${t('landing.safety.kicker')}</p><h2 id="safety-h">${t('landing.safety.h')}</h2><p>${t('landing.safety.lead')}</p>
      <ul class="lp-list lp-list-2">${[1, 2, 3, 4, 5, 6].map(i => html`<li>${check}<span>${t(`landing.safety.li${i}`)}</span></li>`)}</ul>
      <p class="lp-small">${tHtml(t, 'landing.safety.links', { safety: lp('/safety'), privacy: '/privacy' })}</p>
    </div>
  </div>
  <div class="lp-wrap"><div class="lp-everywhere">
    <div class="lp-card rv"><span aria-hidden="true">💻</span><h3>${t('landing.everywhere.h')}</h3><p>${t('landing.everywhere.devices')}</p></div>
    <div class="lp-card rv"><span aria-hidden="true">🌍</span><h3>${t('landing.footer.languages')}</h3><p>${t('landing.everywhere.languages', { count })}</p></div>
    <div class="lp-card rv"><span aria-hidden="true">🔊</span><h3>${t('landing.everywhere.voicesH')}</h3><p>${t('landing.everywhere.voices')}</p></div>
  </div></div>
</section>`;

  const mail = `mailto:${SALES_EMAIL}?subject=${encodeURIComponent(t('landing.pricing.schools.subject'))}`;
  const pricing = html`<section class="lp-sec" id="pricing" aria-labelledby="pricing-h">
  <div class="lp-wrap">
    <header class="lp-sec-head"><p class="lp-eyebrow">${t('landing.pricing.kicker')}</p><h2 id="pricing-h">${t('landing.pricing.h')}</h2><p>${t('landing.pricing.leadFree')}</p></header>
    <div class="lp-plans lp-plans-3">
      <article class="lp-card lp-plan rv" aria-labelledby="plan-free">
        <h3 id="plan-free">${t('landing.pricing.free.name')}</h3>
        <p class="lp-price">${t('landing.pricing.free.price')}</p>
        <p class="lp-plan-trial">${t('landing.hero.trustCard')}</p>
        <ul class="lp-list">${['landing.pricing.free.li1', 'landing.pricing.free.li2', 'landing.pricing.free.li3', 'landing.pricing.free.li4', ...(live ? ['landing.pricing.free.liLive'] : []), 'landing.pricing.teacher.li5'].map(k => html`<li>${check}<span>${t(k)}</span></li>`)}</ul>
        <a class="lp-btn lp-btn-ghost lp-btn-big" href="${lp('/teachers')}#start">${t('teachers.cta.start')}</a>
      </article>
      <article class="lp-card lp-plan lp-plan-hot rv" aria-labelledby="plan-teacher">
        <h3 id="plan-teacher">${t('landing.pricing.teacher.name')}</h3>
        <p class="lp-price">${price ? t('landing.pricing.teacher.priceShown', { price }) : t('landing.pricing.teacher.price')}</p>
        <p class="lp-plan-trial">${t('landing.pricing.teacher.trial')}</p>
        <p class="lp-plan-plus">${t('landing.pricing.teacher.plus')}</p>
        <ul class="lp-list">${['landing.pricing.teacher.li2', 'landing.pricing.teacher.li1', 'plans.teacher.li3', 'plans.teacher.li4'].map(k => html`<li>${check}<span>${t(k)}</span></li>`)}</ul>
        ${cta(TRIAL_URL, t('landing.pricing.teacher.cta'), { big: true })}
        <a class="lp-more" href="/plans" data-cta="pricing">${t('landing.pricing.teacher.plans')} ${ARROW}</a>
      </article>
      <article class="lp-card lp-plan rv" aria-labelledby="plan-schools">
        <h3 id="plan-schools">${t('landing.pricing.schools.name')}</h3>
        <p class="lp-price">${price ? t('landing.pricing.schools.priceShown', { price }) : t('landing.pricing.schools.price')}</p>
        <p class="lp-plan-trial">${t('landing.pricing.teacher.trial')}</p>
        <ul class="lp-list">${[1, 2, 3, 4].map(i => html`<li>${check}<span>${t(`landing.pricing.schools.li${i}`)}</span></li>`)}</ul>
        <a class="lp-btn lp-btn-ghost lp-btn-big" href="${mail}">${t('landing.pricing.schools.cta')}</a>
        <a class="lp-more" href="${lp('/teachers')}#start">${t('landing.pricing.schools.form')} ${ARROW}</a>
      </article>
    </div>
  </div>
</section>`;

  const faqSec = html`<section class="lp-sec" id="faq" aria-labelledby="faq-h">
  <div class="lp-wrap lp-narrow">
    <header class="lp-sec-head"><h2 id="faq-h">${t('landing.faq.h')}</h2></header>
    <div class="lp-faq">${faq.map(([q, a], i) => html`<details class="lp-card"${i === 0 ? raw(' open') : ''}><summary><h3>${q}</h3><span class="lp-plus" aria-hidden="true"></span></summary><p>${a}</p></details>`)}</div>
  </div>
</section>`;

  const final = html`<section class="lp-final" aria-labelledby="final-h">
  <div class="lp-glow lp-glow-c" aria-hidden="true" data-depth=".18"></div>
  <div class="lp-wrap lp-final-in rv">
    <h2 id="final-h">${t('landing.final.h')}</h2><p>${t('landing.final.pFree')}</p>
    <div class="lp-ctas lp-ctas-c">${cta(TRIAL_URL, t('landing.final.cta'), { big: true })}<a class="lp-btn lp-btn-ghost lp-btn-big" href="${JUST_PLAY_URL}" data-cta="play">${t('landing.nav.justPlay')} ${ARROW}</a></div>
  </div>
</section>`;
  const playBand = html`<section class="lp-play" id="play" aria-labelledby="play-h"><div class="lp-wrap lp-play-in"><h2 id="play-h">🎮 ${t('landing.play.h')}</h2><p>${t('landing.play.p')}</p><a class="lp-btn lp-btn-spark" href="${JUST_PLAY_URL}" data-cta="play">${t('landing.play.cta')} ${ARROW}</a></div></section>`;

  const others = availableLocales().filter(l => langs.includes(l.code));
  const footer = html`<footer class="lp-foot">
  ${playBand}
  <div class="lp-wrap lp-foot-in">
    <div class="lp-foot-brand"><a class="lp-logo" href="${lp('/')}" aria-label="${t('landing.nav.home')}">${appMark('lp-mark')}<span class="lp-word" dir="ltr" aria-hidden="true">${wordmark('lp-wordmark')}<span>Academy</span></span></a><p class="lp-tagline">${t('brand.tagline')}</p><p>${t('landing.footer.tagline')}</p>
      <a class="lp-btn lp-btn-ghost lp-btn-sm" href="${JUST_PLAY_URL}" data-cta="play">${t('landing.nav.justPlay')} ${ARROW}</a></div>
    <nav aria-labelledby="ft-t"><h2 id="ft-t">${t('landing.footer.teachers')}</h2><ul>
      <li><a href="${lp('/teachers')}">${t('landing.footer.guide')}</a></li>
      <li><a href="${lp('/teachers/cs-quest')}">${t('landing.courses.cs.name')}</a></li>
      <li><a href="/teachers/number-quest">${t('landing.courses.nq.name')}</a></li>
      <li><a href="/teachers/cyber-defenders">${t('landing.courses.cd.name')}</a></li>
      ${live ? html`<li><a href="${lp('/teachers/live')}">${t('landing.nav.live')}</a></li>` : ''}
      <li><a href="/plans" data-cta="pricing">${t('landing.footer.plans')}</a></li>
      <li><a href="${lp('/research')}">${t('research.footer')}</a></li>
    </ul></nav>
    <nav aria-labelledby="fe-t"><h2 id="fe-t">${t('landing.footer.product')}</h2><ul>
      <li><a href="${JUST_PLAY_URL}" data-cta="play">${t('landing.nav.justPlay')}</a></li>
      ${live ? html`<li><a href="/join"${fb('quickLive.join')}>${t('quickLive.join')}</a></li>` : ''}
      <li><a href="${lp('/learn')}">${t('landing.footer.learn')}</a></li>
      <li><a href="${lp('/parents')}">${t('landing.footer.parents')}</a></li>
      <li><a href="${lp('/safety')}">${t('landing.footer.safety')}</a></li>
      <li><a href="/login">${t('landing.nav.signIn')}</a></li>
    </ul></nav>
    <nav aria-labelledby="fa-t"><h2 id="fa-t">${t('landing.footer.about')}</h2><ul>
      <li><a href="/privacy">${t('landing.footer.privacy')}</a></li>
      <li><a href="${lp('/compliance')}">${t('compliance.footer')}</a></li>
      <li><a href="/terms">${t('landing.footer.terms')}</a></li>
      <li><a href="/refunds">${t('landing.footer.refunds')}</a></li>
      <li><a href="mailto:${SALES_EMAIL}">${t('landing.footer.contact')}</a></li>
    </ul></nav>
  </div>
  <div class="lp-wrap lp-foot-base">
    <nav class="lp-langs" aria-labelledby="fl-t"><h2 id="fl-t" class="sr-only">${t('landing.footer.languages')}</h2><span aria-hidden="true">🌐</span>${others.map(l => html`<a href="${seo.localeUrl('/', l.code)}" hreflang="${l.code}" lang="${l.code}"${l.code === locale ? raw(' aria-current="page"') : ''}>${l.name}</a>`)}</nav>
    <p class="lp-theme"><span>${t('landing.footer.theme')}:</span> <a href="?theme=dark" rel="nofollow"${theme === 'dark' ? raw(' aria-current="true"') : ''}>🌙 ${t('landing.footer.dark')}</a> <a href="?theme=light" rel="nofollow"${theme === 'light' ? raw(' aria-current="true"') : ''}>☀️ ${t('landing.footer.light')}</a></p>
    <p class="lp-copy">© ${new Date().getFullYear()} ${BRAND}</p>
  </div>
</footer>`;

  const jsonld = seo.graph([
    seo.organizationLd(req),
    seo.websiteLd(req, locale),
    { '@type': 'WebPage', '@id': seo.abs(req, lp('/')) + '#webpage', url: seo.abs(req, lp('/')), name: title, description, inLanguage: info.code,
      isPartOf: { '@id': seo.abs(req, '/#website') }, about: { '@id': seo.abs(req, '/#app') }, primaryImageOfPage: seo.abs(req, '/og/landing.jpg') },
    softwareLd(req, t, { description, langs }),
    seo.faqLd(faq.map(([q, a]) => [q, seo.plainText(a)])),
  ]);

  const body = html`${sky}${header}<main id="lp-main">${hero}${facts}${how}${loopSec}${builder}${courses}${classroomSec}${liveSec}${why}${safety}${pricing}${faqSec}${final}</main>${footer}`;
  const head = seo.seoHead(req, { index: true, path: '/', langs, image: '/og/landing.jpg', imageAlt: t('landing.meta.imageAlt'), jsonld: [jsonld] }, { title, description });
  res.status(200).type('html').set('Vary', 'Cookie, Accept-Language').send(`<!doctype html>
<html lang="${esc(locale)}" dir="${esc(info.dir)}" data-theme="${theme}" class="lp-html${theme === 'light' ? ' lp-light' : ''}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="${theme}">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${head}
<meta name="theme-color" content="${theme === 'light' ? BAR_COLORS.light : BAR_COLORS.dark}">
<link rel="icon" href="/favicon.ico?v=${ICONS_V}" sizes="32x32">
<link rel="icon" href="/icons/icon.svg?v=${ICONS_V}" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png?v=${ICONS_V}">
<link rel="manifest" href="/manifest.webmanifest?v=${ICONS_V}">
<link rel="preload" href="/fonts/bricolage-grotesque-latin-opsz-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/css/landing.css?v=${VERSION}">
</head>
<body class="lp">
${body}
<script type="module" src="/js/landing.js?v=${VERSION}"></script>
</body>
</html>`);
}

/** The covers fanned out in the hero (every size: the floating ones only fit very wide screens). */
const HERO_FAN = ['beat-lanes', 'robo-route', 'fraction-factory', 'atlas-quest', 'word-trail'];
/** The games in the moving row under the courses. */
const MARQUEE = ['sum-racer', 'atlas-quest', 'doodle-hoot', 'trick-inbox', 'code-isle', 'data-detective', 'fraction-factory', 'quest-race', 'brain-board', 'word-trail'];

/** The hero's picture: a lesson, the Builder at work, and a game. Without JavaScript (or with reduced motion) all three
 *  show at once; public/js/landing.js plays it as a short loop. */
function demo(t, fb) {
  return html`<figure class="lp-demo" data-stage="done" aria-labelledby="lp-demo-cap">
  <div class="lp-glass lp-d-lesson">
    <p class="lp-d-tag">📄 ${t('landing.demo.lessonTag')}</p>
    <p class="lp-d-title">${t('landing.demo.lessonTitle')}</p>
    <p class="lp-d-body"${fb('landing.demo.lessonBody')}>${t('landing.demo.lessonBody')}</p>
    <span class="lp-chip">📎 ${t('landing.demo.file')}</span>
  </div>
  <div class="lp-beam lp-beam-1" aria-hidden="true"></div>
  <div class="lp-glass lp-d-build">
    <p class="lp-d-tag">✨ ${t('landing.demo.builderTag')}</p>
    <ol class="lp-d-steps">${[1, 2, 3, 4].map(i => html`<li data-i="${i}">${check}<span>${t(`landing.demo.step${i}`)}</span></li>`)}</ol>
    <div class="lp-d-bar" aria-hidden="true"><i></i></div>
  </div>
  <div class="lp-beam lp-beam-2" aria-hidden="true"></div>
  <div class="lp-glass lp-d-game">
    ${cover('fraction-factory', { eager: true, cls: 'lp-d-cover' })}
    <div class="lp-d-gtext"><p class="lp-d-tag">🎮 ${t('landing.demo.gameTag')}</p><p class="lp-d-title" lang="en" dir="ltr">Fraction Factory</p><p class="lp-d-meta">${t('landing.demo.gameMeta')}</p>
    <p class="lp-d-btns" aria-hidden="true"><span>▶ ${t('landing.demo.host')}</span><span>${t('landing.demo.assign')}</span></p></div>
  </div>
  <figcaption id="lp-demo-cap" class="lp-d-cap">${t('landing.demo.label')}. ${t('landing.demo.credit')}</figcaption>
</figure>`;
}

/** The product as structured data. Following the game pages (docs/decisions.md "Search engines"), no
 *  applicationCategory/operatingSystem without ratings, and no price unless LANDING_SHOW_PRICE. */
function softwareLd(req, t, { description, langs }) {
  const app = {
    '@type': 'SoftwareApplication', '@id': seo.abs(req, '/#app'), name: BRAND, url: seo.abs(req, '/'), description,
    publisher: { '@id': seo.orgId(req) }, image: seo.abs(req, '/og/landing.jpg'),
    screenshot: ['parents-build', 'live-lobby'].map(n => seo.abs(req, `/img/how/${n}-d-1024.webp`)),
    inLanguage: langs, isAccessibleForFree: false,
    audience: [{ '@type': 'EducationalAudience', educationalRole: 'teacher' }, ...seo.audienceLd()],
    featureList: [1, 2, 3, 4, 5].map(i => t(`landing.builder.li${i}`)).concat([t('landing.pricing.teacher.li1'), t('landing.pricing.teacher.li2')]),
  };
  if (LANDING_SHOW_PRICE) {
    app.offers = { '@type': 'Offer', name: t('landing.pricing.teacher.name'), price: TEACHER_PRICE.amount, priceCurrency: TEACHER_PRICE.currency, url: seo.abs(req, TRIAL_URL),
      priceSpecification: { '@type': 'UnitPriceSpecification', price: TEACHER_PRICE.amount, priceCurrency: TEACHER_PRICE.currency, billingDuration: 'P1Y', unitText: 'teacher' },
      description: t('landing.pricing.teacher.trial') };
  }
  return app;
}

