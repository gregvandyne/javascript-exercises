// Homeroom (services/homeroom.js; docs/homeroom.md). Behind the gate every address here answers only a teacher Homeroom
// lets into this class (services/homeroom.js canUseClass); everyone else goes on to the site's normal 404.
//   GET  /class/:id/homeroom                   the page: the top bar (class switcher, Homeroom | Classroom | Dashboard,
//                                              Arrange seats, ⋯), the teacher's desk panel and the board
//                                              (public/js/homeroom.js)
//   POST /api/homeroom/:id/seats               Arrange seats: { preset, seats: { studentId: { x, y } } }
//   POST /api/homeroom/:id/groups              the teacher's groups and who is in which: { groups, members }
//   POST /api/homeroom/:id/area                the teacher's area: { state: { __ann: { notes, texts, strokes }, shapes } }
//   POST /api/homeroom/:id/live                live class: { action: start | bring | back | pause | resume | end }
//   GET  /class/:id/homeroom/projector         the projector view: the teacher's area full screen, the class's name and
//                                              whether it is live; never a student's name, desk or work
//   GET  /api/homeroom/:id/state?v=            the live state, and the teacher's area when it changed (the projector)
// The student side (step 1b): only a class's own students, the class having Homeroom (services/homeroom.js canUseDesk);
// everyone else (teachers included) the site's 404.
//   GET  /class/:id/desk                       the student's desk (public/js/homeroom-desk.js)
//   GET  /api/desk/:id/state?v=                the live state, and the teacher's area when it changed
//   POST /api/desk/:id/doodle                  their doodle and working-out pad: { strokes }
//   GET  /api/homeroom-live                    the live classes of this student with Homeroom (the prompt on every page)
import { Router } from 'express';
import { html, raw, jsonData } from '../views/html.js';
import { ico } from '../views/icon.js';
import { page, VERSION, onEveryPage } from '../views/layout.js';
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

// The desk's gate: one of the class's own students, the class having Homeroom; else on to the site's 404.
const deskGate = (req, res, next) => {
  const c = S.getClass(req.params.id);
  if (!H.canUseDesk(req.user, c)) return next('router');
  res.set({ 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' });
  req.homeroomClass = c;
  next();
};
router.use(['/class/:id/desk', '/api/desk/:id'], deskGate);

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
    body: html`${jsonData('page-data', { classId: c.id, className: c.name, room, live: H.liveOf(c.id) })}
    <div id="homeroom" class="hr">
      <header class="hr-top">
        <label class="sr-only" for="hr-class">${t('homeroom.switchClass')}</label>
        <select class="input hr-class" id="hr-class" data-hr-switch>${classes.map(x => html`<option value="${x.id}"${x.id === c.id ? raw(' selected') : ''}>${x.name}</option>`)}</select>
        ${homeroomTabs(req, c, 'homeroom')}
        <span class="hr-livedot" id="hr-live"${H.liveOf(c.id) ? '' : raw(' hidden')}>${t('homeroom.live')}</span>
        <span class="hr-grow"></span>
        <span class="hr-livebtns" id="hr-livebtns"></span>
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
router.post('/api/homeroom/:id/live', rateLimit('homeroom-live', 600, 3600e3), (req, res) => send(req, res, H.setLive(req.user, req.homeroomClass, String(body(req).action || ''))));

// ---------------------------------------------------------------- the projector view
// The teacher's area as big as the screen, the class's name and the Live dot: never a name, a desk, a hand or progress.
// No site bar or chat (bare), so nothing of the teacher's own screen shows either.
router.get('/class/:id/homeroom/projector', (req, res) => {
  const t = req.t, c = req.homeroomClass;
  page(req, res, {
    title: t('homeroom.projector.title', { class: c.name }), bare: true, bodyClass: 'hr-projpage', scripts: ['/js/homeroom-projector.js'], i18n: ['js.homeroom-area'],
    head: raw(`<link rel="stylesheet" href="/css/manipulatives.css?v=${VERSION}"><link rel="stylesheet" href="/css/homeroom.css?v=${VERSION}">`),
    body: html`${jsonData('page-data', { classId: c.id, state: H.boardState(c.id) })}
    <div class="hr-proj" id="hr-proj">
      <header class="hr-projtop"><h1 class="hr-projname" dir="auto">${c.name}</h1><span class="hr-livedot" id="hr-live"${H.liveOf(c.id) ? '' : raw(' hidden')}>${t('homeroom.live')}</span></header>
      <div class="hr-projarea" id="hr-projarea"></div>
    </div>`,
  });
});
router.get('/api/homeroom/:id/state', rateLimit('homeroom-state', 3000, 3600e3), (req, res) => res.json(H.boardState(req.homeroomClass.id, req.query.v)));

// ---------------------------------------------------------------- the student desk
const dockBtn = (k, icon, label, attrs = '') => html`<button type="button" class="hd-dockbtn" data-hd="${k}"${raw(attrs)}>${ico(icon, { size: 20 })}<span>${label}</span></button>`;
router.get('/class/:id/desk', (req, res) => {
  const t = req.t, c = req.homeroomClass, u = req.user;
  const room = H.roomForStudent(c, u);
  page(req, res, {
    title: t('homeroom.desk.pageTitle', { class: c.name }), active: 'classes', bodyClass: 'hr-page hd-page', scripts: ['/js/homeroom-desk.js'], i18n: ['js.homeroom-area'],
    head: raw(`<link rel="stylesheet" href="/css/manipulatives.css?v=${VERSION}"><link rel="stylesheet" href="/css/homeroom.css?v=${VERSION}">`),
    body: html`${jsonData('page-data', { classId: c.id, className: c.name, me: { id: u.id, name: u.display_name }, color: room.color, desks: room.desks,
      strokes: H.doodleOf(c.id, u.id), doodle: { w: H.DOODLE.w, h: H.DOODLE.h, strokes: H.DOODLE.strokes, points: H.DOODLE.points, total: H.DOODLE.total, colors: H.DOODLE_COLORS }, state: H.boardState(c.id) })}
    <div class="hd" id="hd">
      <header class="hd-top hd-float">
        <span class="hr-livedot" id="hr-live"${H.liveOf(c.id) ? '' : raw(' hidden')}>${t('homeroom.live')}</span>
        <h1 class="hd-title" dir="auto">${c.name}</h1>
      </header>
      <div class="hd-body" id="hd-body"><p class="muted hr-loading">${t('homeroom.loading')}</p></div>
      <nav class="hd-dock hd-float" aria-label="${t('homeroom.desk.dock')}">
        ${dockBtn('desk', '🎒', t('homeroom.desk.myDesk'), ' aria-pressed="true"')}
        ${dockBtn('area', '🧑‍🏫', t('homeroom.desk.teacherArea'), ' aria-pressed="false"')}
        <a class="hd-dockbtn" href="/library">${ico('📚', { size: 20 })}<span>${t('homeroom.desk.library')}</span></a>
        <span class="hd-grow"></span>
        ${dockBtn('room', '🏫', t('homeroom.desk.room'), ' aria-pressed="false"')}
      </nav>
      <div id="hd-over"></div>
      <noscript><p class="notice warn">${t('homeroom.noscript')}</p></noscript>
    </div>`,
  });
});
router.get('/api/desk/:id/state', rateLimit('homeroom-desk-state', 3000, 3600e3), (req, res) => res.json(H.boardState(req.homeroomClass.id, req.query.v)));
router.post('/api/desk/:id/doodle', rateLimit('homeroom-doodle', 1200, 3600e3), (req, res) => send(req, res, H.saveDoodle(req.user, req.homeroomClass, body(req).strokes)));

// ---------------------------------------------------------------- "Your class is in Homeroom" on every page
// A student signed in anywhere on the site hears when a class of theirs goes live: a small script, loaded only for
// students with a class that has a Homeroom room (one query), asks every so often (public/js/homeroom-notify.js) and
// shows a calm prompt with a link to their desk. Not on the desk itself.
router.get('/api/homeroom-live', rateLimit('homeroom-live-check', 600, 3600e3), (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ live: req.user ? H.liveDesksFor(req.user) : [] });
});
onEveryPage(req => (/^\/class\/[^/]+\/desk\/?$/.test(req.path || '') || !H.mayGetPrompt(req.user) ? null : '/js/homeroom-notify.js'));

/** A student's class page: the way to their desk (routes/schools.js studentClass). '' when the class has no Homeroom. */
export function deskLink(req, c) {
  if (!H.canUseDesk(req.user, c)) return '';
  return html`<a class="btn btn-primary" href="/class/${c.id}/desk" id="class-desk-link">${ico('🎒', { size: 18 })} ${req.t('homeroom.desk.link')}</a>`;
}
