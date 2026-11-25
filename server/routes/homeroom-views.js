// Homeroom, Classroom and Dashboard as one page with three views (docs/decisions.md "Homeroom: one page, three views").
// For a teacher Homeroom lets into a class (services/homeroom.js canUseClass) the three are views of one page: one shared
// bar (the class switcher, Homeroom | Classroom | Dashboard, and the view's own buttons) over a view area. A route marks
// its page as one view (markView: the Homeroom page, every Classroom page through routes/schools.js classHeader, the
// teacher's dashboard); views/layout.js page() then asks the shell registered here how to send it:
//   - a normal request: the whole page, the view's content in its place and the other two views empty (they are fetched
//     the first time they are opened), plus public/js/class-views.js and public/css/class-views.css;
//   - the X-View: 1 header (public/js/class-views.js): JSON with only the view (views/layout.js viewFragment) and its
//     buttons for the bar, which the page swaps in without loading again.
// Everyone else (other teachers, students, school admins who do not teach the class) gets the pages exactly as before.
import { html, raw, esc } from '../views/html.js';
import { setViewShell, VERSION } from '../views/layout.js';
import * as H from '../services/homeroom.js';
import * as DASH from '../services/dash.js';
import { dashCsp, DASH_TEACHER_POLICY, VIDEO_HOSTS } from '../services/dash-media.js';

export const VIEWS = ['homeroom', 'classroom', 'dashboard'];
const urlOf = (c, k) => (k === 'homeroom' ? `/class/${c.id}/homeroom` : k === 'dashboard' ? `/class/${c.id}/dashboard` : `/class/${c.id}`);
const viewsOf = (req, c) => VIEWS.filter(k => k !== 'dashboard' || DASH.isTeacher(req.user, c));

/** The Homeroom | Classroom | Dashboard pill (real links: without script each opens its page). '' for anyone Homeroom
 *  does not let into this class. */
export function homeroomTabs(req, c, active) {
  if (!H.canUseClass(req.user, c)) return '';
  const t = req.t;
  return html`<nav class="hr-tabs" aria-label="${t('homeroom.tabs.label')}">${viewsOf(req, c).map(k => html`<a href="${urlOf(c, k)}" data-cv-go="${k}"${k === active ? raw(' aria-current="page"') : ''}>${t(`homeroom.tabs.${k}`)}</a>`)}</nav>`;
}

/** Marks this page as one of the class's views, with the buttons it puts in the shared bar. false (and nothing marked)
 *  for anyone who keeps today's separate pages. */
export function markView(req, c, view, actions = '') {
  if (!c || !H.canUseClass(req.user, c)) return false;
  req.classView = { c, view, actions };
  return true;
}

function shell(req, c, view, { content, actions, bodyClass, mid }) {
  const t = req.t, u = req.user;
  const classes = H.switchable(u);
  if (!classes.some(x => x.id === c.id)) classes.unshift({ id: c.id, name: c.name });
  const urls = Object.fromEntries(viewsOf(req, c).map(k => [k, urlOf(c, k)]));
  return html`<div class="cv" id="cv" data-class="${c.id}" data-view="${view}" data-urls="${JSON.stringify(urls)}">
    <header class="cv-bar" id="cv-bar">
      <div class="cv-nav">
        <label class="sr-only" for="hr-class">${t('homeroom.switchClass')}</label>
        <select class="input cv-class" id="hr-class" data-cv-switch autocomplete="off">${classes.map(x => html`<option value="${x.id}"${x.id === c.id ? raw(' selected') : ''}>${x.name}</option>`)}</select>
        ${homeroomTabs(req, c, view)}
      </div>
      <p class="sr-only" id="cv-say" aria-live="polite"></p>
      ${viewsOf(req, c).map(k => html`<div class="cv-acts cv-acts-${k}${k === 'homeroom' ? ' hr' : ''}" data-cv-acts="${k}">${k === view ? raw(String(actions || '')) : ''}</div>`)}
    </header>
    <div class="cv-views">
      ${viewsOf(req, c).map(k => html`<section class="cv-view cv-view-${k}${k === 'classroom' ? ` wrap${mid ? ' mid' : ''}` : ''}" data-cv-view="${k}" aria-label="${t(`homeroom.tabs.${k}`)}"${k === view
        ? raw(` data-cv-body="${esc(bodyClass)}" data-cv-url="${esc(req.originalUrl)}"`) : raw(' hidden')}>${k === view ? content : ''}</section>`)}
    </div>
  </div>`;
}

setViewShell((req, res, opts) => {
  const { c, view, actions = '' } = req.classView;
  if (!H.canUseClass(req.user, c) || !VIEWS.includes(view)) return null;
  const t = req.t;
  // The dashboard's own full-page look (no site bar) gives way to the shared bar; its class on <body> that drops the
  // tab bar's space on a phone is left off (the site's tab bar stays, as on the other two views).
  const bodyClass = String(opts.bodyClass || '').split(/\s+/).filter(x => x && x !== 'dash-page').join(' ');
  // Classroom pages have a Back link ("My classes"): it stays at the top of the view, under the shared bar.
  const back = view === 'classroom' && opts.back ? html`<a class="backlink" href="${opts.back}"><span class="flip" aria-hidden="true">←</span> ${opts.backLabel || t('layout.back')}</a>` : '';
  const content = html`${back}${raw(String(opts.body || ''))}`;
  const vopts = { ...opts, body: content, bodyClass, bare: false, companion: undefined, back: null };
  if (req.get('X-View') === '1') return { fragment: true, opts: vopts, extra: { view, actions: String(actions || ''), mid: !!opts.mid } };
  // The page may become the dashboard without loading again: it gets the dashboard's frames (the two video hosts) and
  // camera and microphone (after a tap) from the start, as the dashboard page itself does (routes/dash.js).
  if (DASH.isTeacher(req.user, c) && !res.headersSent) {
    const csp = String(res.get('Content-Security-Policy') || '');
    if (csp && !csp.includes(VIDEO_HOSTS.youtube)) res.set('Content-Security-Policy', dashCsp(csp));
    res.set('Permissions-Policy', DASH_TEACHER_POLICY);
  }
  return { opts: { ...vopts, mid: false, bodyClass: `${bodyClass} cv-page cv-on-${view}`.trim(),
    body: shell(req, c, view, { content, actions, bodyClass, mid: !!opts.mid }),
    head: raw(`${String(opts.head || '')}<link rel="stylesheet" href="/css/class-views.css?v=${VERSION}" data-cv-css>`),
    scripts: [...(opts.scripts || []), '/js/class-views.js'] } };
});
