// Homeroom (services/homeroom.js; docs/homeroom.md). Behind the gate every address here answers only a teacher Homeroom
// lets into this class (services/homeroom.js canUseClass); everyone else goes on to the site's normal 404.
//   GET  /class/:id/homeroom                   the page: the top bar (class switcher, Homeroom | Classroom | Dashboard,
//                                              Arrange seats, ⋯), the teacher's desk panel and the board
//                                              (public/js/homeroom.js)
//   POST /api/homeroom/:id/seats               Arrange seats: { preset, seats: { studentId: { x, y } } }
//   POST /api/homeroom/:id/groups              the teacher's groups and who is in which: { groups, members }
//   POST /api/homeroom/:id/area                the teacher's area: { state: { __ann: { notes, texts, strokes }, shapes } }
import { Router } from 'express';
import { html, raw, jsonData } from '../views/html.js';
import { ico } from '../views/icon.js';
import { page, VERSION } from '../views/layout.js';
import { rateLimit } from '../services/ratelimit.js';
import * as H from '../services/homeroom.js';
import * as S from '../services/schools.js';
import * as games from '../services/games.js';
import * as DASH from '../services/dash.js';
import { toolAccess } from '../services/teacher-tools.js';
import { config } from '../config.js';

export const router = Router();
const STATUS = { notFound: 404, tooBig: 413 };
const fail = (req, res, code) => res.status(STATUS[code] || 400).json({ error: req.t(`homeroom.errors.${code}`), code });
const send = (req, res, r) => (r.ok ? res.json(r) : fail(req, res, r.code));
const body = req => (req.body && typeof req.body === 'object' ? req.body : {});

// The gate: a class this person may run Homeroom for, else on to the site's 404 (the page's, or the API's JSON one).
const gate = (req, res, next) => {
  const c = S.getClass(req.params.id);
  if (!H.canUseClass(req.user, c)) return next('router');
  res.set({ 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' });
  req.homeroomClass = c;
  next();
};
router.use(['/class/:id/homeroom', '/api/homeroom/:id'], gate);

/** The tabs a Homeroom teacher has on a class: Homeroom | Classroom | Dashboard (also over the class page:
 *  routes/schools.js classHeader). '' for anyone Homeroom does not let into this class. */
export function homeroomTabs(req, c, active) {
  if (!H.canUseClass(req.user, c)) return '';
  const t = req.t;
  const tabs = [['homeroom', `/class/${c.id}/homeroom`], ['classroom', `/class/${c.id}`], ...(DASH.isTeacher(req.user, c) ? [['dashboard', `/class/${c.id}/dashboard`]] : [])];
  return html`<nav class="hr-tabs" aria-label="${t('homeroom.tabs.label')}">${tabs.map(([k, href]) => html`<a href="${href}"${k === active ? raw(' aria-current="page"') : ''}>${t(`homeroom.tabs.${k}`)}</a>`)}</nav>`;
}

/** What the teacher's desk lists in this step (handing out comes next): their own games and the Oomba games and tools. */
function deskLists(req) {
  const u = req.user;
  const title = g => games.localizeGame(g, req.locale).title;
  const mine = games.myGames(u.id, 12).filter(g => g.status !== 'deleted').map(g => ({ icon: g.icon || '🎮', title: g.title }));
  const tools = [
    ...(toolAccess(u, config.manipulatives) === 'yes' ? [{ icon: '🧮', title: req.t('homeroom.panel.manipulatives') }] : []),
    ...(toolAccess(u, config.figures) === 'yes' ? [{ icon: '📐', title: req.t('homeroom.panel.figures') }] : []),
  ];
  const oomba = games.listVisible(u, { shelf: 'learn', official: true, order: 'plays', limit: 16 }).map(g => ({ icon: g.icon || '🎮', title: title(g) }));
  return { mine, oomba: [...tools, ...oomba] };
}
const row = x => html`<li class="hr-item"><span class="hr-ico" aria-hidden="true">${ico(x.icon, { size: 18 })}</span><span class="hr-itemt" dir="auto">${x.title}</span></li>`;

router.get('/class/:id/homeroom', (req, res) => {
  const t = req.t, c = req.homeroomClass, u = req.user;
  const room = H.roomOf(c.id), classes = H.switchable(u);
  if (!classes.some(x => x.id === c.id)) classes.unshift({ id: c.id, name: c.name });
  const lists = deskLists(req);
  const section = (k, items, empty = '') => html`<h2 class="hr-cap">${t(`homeroom.panel.${k}`)}</h2>${items.length ? html`<ul class="hr-items">${items.map(row)}</ul>` : empty ? html`<p class="hr-empty small">${empty}</p>` : ''}`;
  page(req, res, {
    title: t('homeroom.pageTitle', { class: c.name }), active: 'classes', bodyClass: 'hr-page', scripts: ['/js/homeroom.js'], i18n: ['js.manip-room', 'js.board-ann'],
    head: raw(`<link rel="stylesheet" href="/css/manipulatives.css?v=${VERSION}"><link rel="stylesheet" href="/css/homeroom.css?v=${VERSION}">`),
    body: html`${jsonData('page-data', { classId: c.id, className: c.name, room })}
    <div id="homeroom" class="hr">
      <header class="hr-top">
        <label class="sr-only" for="hr-class">${t('homeroom.switchClass')}</label>
        <select class="input hr-class" id="hr-class" data-hr-switch>${classes.map(x => html`<option value="${x.id}"${x.id === c.id ? raw(' selected') : ''}>${x.name}</option>`)}</select>
        ${homeroomTabs(req, c, 'homeroom')}
        <span class="hr-grow"></span>
        <button class="btn hr-chunk" type="button" data-hr="seats" aria-pressed="false" aria-label="${t('homeroom.arrange')}">${ico('🔀', { size: 18 })}<span class="hr-hidephone"> ${t('homeroom.arrange')}</span></button>
        <div class="hr-morewrap"><button class="btn hr-chunk" type="button" data-hr="menu" aria-expanded="false" aria-haspopup="true" aria-label="${t('homeroom.more')}">⋯</button><div id="hr-menu"></div></div>
      </header>
      <div class="hr-stage">
        <div class="rm rm-teacher hr-board" id="hr-board" tabindex="-1" aria-label="${t('homeroom.boardLabel')}"><div class="rm-world" id="hr-world"><p class="muted hr-loading">${t('homeroom.loading')}</p></div></div>
        <aside class="hr-panel" id="hr-panel" aria-label="${t('homeroom.panel.label')}">
          <h2 class="hr-cap">${t('homeroom.panel.handOut')}</h2>
          <div class="hr-groupchips" id="hr-groupchips"></div>
          <p class="hr-soon small">${ico('🗓️', { size: 16 })} ${t('homeroom.panel.handOutSoon')}</p>
          ${section('myLessons', [], t('homeroom.panel.noLessons'))}
          ${section('myGames', lists.mine, t('homeroom.panel.noGames'))}
          ${section('oomba', lists.oomba)}
          ${section('reading', [{ icon: '📚', title: t('homeroom.panel.storyLibrary') }])}
          ${section('flow', [{ icon: '🧠', title: t('homeroom.panel.brainBreak') }, { icon: '🗒️', title: t('homeroom.panel.note') }, { icon: '⏱️', title: t('homeroom.panel.timer') }])}
          <h2 class="hr-cap">${t('homeroom.panel.board')}</h2>
          <div class="hr-tools" id="hr-tools"></div>
        </aside>
        <div class="hr-seatbar" id="hr-seatbar" hidden></div>
        <div class="rm-float hr-zoom" id="hr-zoom"></div><div class="rm-float hr-mini" id="hr-mini"></div>
        <div id="hr-dialog"></div>
      </div>
      <noscript><p class="notice warn">${t('homeroom.noscript')}</p></noscript>
    </div>`,
  });
});

router.post('/api/homeroom/:id/seats', rateLimit('homeroom-seats', 600, 3600e3), (req, res) => send(req, res, H.saveSeats(req.user, req.homeroomClass, { preset: body(req).preset, seats: body(req).seats })));
router.post('/api/homeroom/:id/groups', rateLimit('homeroom-groups', 300, 3600e3), (req, res) => send(req, res, H.saveGroups(req.user, req.homeroomClass, { groups: body(req).groups, members: body(req).members })));
router.post('/api/homeroom/:id/area', rateLimit('homeroom-area', 1800, 3600e3), (req, res) => send(req, res, H.saveArea(req.user, req.homeroomClass, body(req).state)));
