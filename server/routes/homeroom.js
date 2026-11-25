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
//   GET  /api/homeroom/:id/handouts            step 2a: the class's handouts and every desk's cards with progress
//   POST /api/homeroom/:id/handouts            hand out a game: { gameId, to: { kind: all | group | desk, id }, instructions,
//                                              order: in | any, grade: score | completion | none, dueAt }
//   POST /api/homeroom/:id/handouts/:clid/remove  take it off one desk ({ studentId }) or off every desk ({})
// Lessons (step 2b; services/homeroom-lessons.js): the teacher's own, for any of their classes (the class in the address
// is where they are working: its groups make the versions).
//   GET  /api/homeroom/:id/lessons             My lessons
//   POST /api/homeroom/:id/lessons             save one: { id?, slug, title, instructions, base, versions: [{ key, label, s }] }
//   POST /api/homeroom/:id/lessons/preview     the builder's worksheet preview: { slug, title, instructions, settings }
//   POST /api/homeroom/:id/lessons/:lid/duplicate | /delete
//   POST /api/homeroom/:id/lessons/:lid/print  a version's printable worksheet: { version: '' (everyone) | key, key }
//   POST /api/homeroom/:id/handouts            with { lessonId, to, order, grade, dueAt }: hand out a lesson
// The student side (step 1b): only a class's own students, the class having Homeroom (services/homeroom.js canUseDesk);
// everyone else (teachers included) the site's 404.
//   GET  /class/:id/desk                       the student's desk (public/js/homeroom-desk.js)
//   GET  /api/desk/:id/state?v=&hv=            the live state, the teacher's area when it changed, and the student's own
//                                              handout cards when they changed (hv: the cards' version the page has)
//   POST /api/desk/:id/doodle                  their doodle and working-out pad: { strokes }
//   GET  /api/homeroom-live                    the live classes of this student with Homeroom (the prompt on every page)
import { Router } from 'express';
import { html, raw, jsonData } from '../views/html.js';
import { ico } from '../views/icon.js';
import { page, VERSION, onEveryPage } from '../views/layout.js';
import { rateLimit } from '../services/ratelimit.js';
import * as H from '../services/homeroom.js';
import * as HO from '../services/homeroom-handouts.js';
import * as HL from '../services/homeroom-lessons.js';
import { localeInfo } from '../i18n/index.js';
import { hasModel } from '../builder/anthropic.js';
import { canHost as liveCanHost } from '../services/classlive-access.js';
import { requestOrigin } from '../services/frame.js';
import * as SI from '../services/homeroom-signin.js';
import { signinView } from './homeroom-signin.js';
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

/** What the teacher's desk lists: their own games and the Oomba games, each one a handout (step 2a: tap it, then a desk,
 *  a group or Whole class; or drag it there), and the Manipulatives and Figures, which come next. */
function deskLists(req) {
  const u = req.user;
  const title = g => games.localizeGame(g, req.locale).title;
  const mine = games.myGames(u.id, 12).filter(g => g.status !== 'deleted').map(g => ({ id: g.id, icon: g.icon || '🎮', title: g.title }));
  const tools = [
    ...(toolAccess(u, config.manipulatives) === 'yes' ? [{ icon: '🧮', title: req.t('homeroom.panel.manipulatives'), soon: true }] : []),
    ...(toolAccess(u, config.figures) === 'yes' ? [{ icon: '📐', title: req.t('homeroom.panel.figures'), soon: true }] : []),
  ];
  const oomba = games.listVisible(u, { shelf: 'learn', official: true, order: 'plays', limit: 16 }).filter(g => HO.handable(u, g)).map(g => ({ id: g.id, icon: g.icon || '🎮', title: title(g) }));
  return { mine, oomba: [...oomba, ...tools] };
}
const row = (t, x) => (x.id
  ? html`<li><button type="button" class="hr-item hr-give" data-hritem="${x.id}" data-icon="${x.icon}" aria-pressed="false"><span class="hr-ico" aria-hidden="true">${ico(x.icon, { size: 18 })}</span><span class="hr-itemt" dir="auto">${x.title}</span></button></li>`
  : html`<li class="hr-item hr-later"><span class="hr-ico" aria-hidden="true">${ico(x.icon, { size: 18 })}</span><span class="hr-itemt" dir="auto">${x.title}</span>${x.soon ? html`<span class="hr-soontag">${t('homeroom.panel.comingNext')}</span>` : ''}</li>`);

router.get('/class/:id/homeroom', (req, res) => {
  const t = req.t, c = req.homeroomClass, u = req.user;
  const room = H.roomOf(c.id), classes = H.switchable(u);
  if (!classes.some(x => x.id === c.id)) classes.unshift({ id: c.id, name: c.name });
  const lists = deskLists(req);
  const section = (k, items, empty = '') => html`<h2 class="hr-cap">${t(`homeroom.panel.${k}`)}</h2>${items.length ? html`<ul class="hr-items">${items.map(x => row(t, x))}</ul>` : empty ? html`<p class="hr-empty small">${empty}</p>` : ''}`;
  page(req, res, {
    title: t('homeroom.pageTitle', { class: c.name }), active: 'classes', bodyClass: 'hr-page', scripts: ['/js/homeroom.js'], i18n: ['js.manip-room', 'js.board-ann', 'js.homeroom-signin-panel', 'js.homeroom-lessons'],
    head: raw(`<link rel="stylesheet" href="/css/manipulatives.css?v=${VERSION}"><link rel="stylesheet" href="/css/homeroom.css?v=${VERSION}">`),
    body: html`${jsonData('page-data', { classId: c.id, className: c.name, room, live: H.liveOf(c.id), handouts: HO.boardView(c, req.locale), instructionsMax: HO.INSTRUCTIONS_MAX,
      lessons: HL.listMine(u, req.locale), lessonGames: HL.lessonGames(u, req.locale), lessonsMax: HL.LESSONS_MAX, titleMax: HL.TITLE_MAX, ai: hasModel() && liveCanHost(u) })}
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
          <p class="hr-soon small" id="hr-givehint">${ico('👆', { size: 16 })} ${t('homeroom.panel.handOutHint')}</p>
          <h2 class="hr-cap">${t('homeroom.panel.myLessons')}</h2><div id="hr-lessons" class="hr-lessons"></div>
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

// ---------------------------------------------------------------- handouts (step 2a; services/homeroom-handouts.js)
// A handout is a real class assignment (services/game-folders.js assignGame), so it shares the assign routes' limit
// (lesson-new, 120 an hour). Errors that name a count (alreadyOnDesk) say how many desks.
const HO_ERR = { pickGame: 'homeroom.errors.pickGame', publishFirst: 'homeroom.errors.publishFirst', badDate: 'homeroom.errors.badDate' };
const hoFail = (req, res, r) => res.status(STATUS[r.code] || 400).json({ error: req.t(HO_ERR[r.code] || `homeroom.errors.${r.code}`, { count: r.count || 0 }), code: r.code });
router.get('/api/homeroom/:id/handouts', rateLimit('homeroom-state', 3000, 3600e3), (req, res) => res.json(HO.boardView(req.homeroomClass, req.locale)));
router.post('/api/homeroom/:id/handouts', rateLimit('lesson-new', 120, 3600e3), (req, res) => {
  const x = body(req), c = req.homeroomClass;
  const to = x.to && typeof x.to === 'object' ? { kind: String(x.to.kind || ''), id: String(x.to.id || '') } : null;
  if (x.lessonId) {
    const r = HL.handOutLesson(req.user, c, { lessonId: String(x.lessonId), to, order: String(x.order || 'in'), grade: String(x.grade || 'score'), dueAt: x.dueAt ? String(x.dueAt) : null });
    if (!r.ok) return hoFail(req, res, r);
    return res.json({ ok: true, toast: req.t(r.versions > 1 ? 'homeroom.lessons.handedOutVersions' : 'homeroom.lessons.handedOut', { title: r.lesson.title, count: r.students, versions: r.versions }), ...HO.boardView(c, req.locale) });
  }
  const r = HO.handOut(req.user, c, { gameId: String(x.gameId || ''), to, instructions: typeof x.instructions === 'string' ? x.instructions : '', order: String(x.order || 'in'), grade: String(x.grade || 'completion'), dueAt: x.dueAt ? String(x.dueAt) : null });
  if (!r.ok) return hoFail(req, res, r);
  res.json({ ok: true, toast: req.t('homeroom.handout.done', { title: games.localizeGame(r.game, req.locale).title, count: r.students }), ...HO.boardView(c, req.locale) });
});
router.post('/api/homeroom/:id/handouts/:clid/remove', rateLimit('homeroom-handout-remove', 600, 3600e3), (req, res) => {
  const c = req.homeroomClass, sid = body(req).studentId ? String(body(req).studentId) : null;
  const r = HO.removeHandout(req.user, c, req.params.clid, sid);
  if (!r.ok) return hoFail(req, res, r);
  res.json({ ok: true, toast: req.t(r.removed === 'all' ? 'homeroom.handout.removedAll' : 'homeroom.handout.removedOne'), ...HO.boardView(c, req.locale) });
});

// ---------------------------------------------------------------- lessons (step 2b; services/homeroom-lessons.js)
// The teacher's own lessons; anyone else's reads as one that isn't there (noLesson, 404). Saving makes or changes real
// question sets, so it shares the sets' limit (game-sets, 60 a minute).
const printCtx = req => ({ t: req.t, dir: localeInfo(req.locale).dir, lang: req.locale, origin: requestOrigin(req) });
const lessonsOut = req => ({ lessons: HL.listMine(req.user, req.locale) });
const hlFail = (req, res, r) => res.status(r.code === 'noLesson' ? 404 : STATUS[r.code] || 400).json({ error: req.t(`homeroom.errors.${r.code}`), code: r.code });
router.get('/api/homeroom/:id/lessons', rateLimit('homeroom-state', 3000, 3600e3), (req, res) => res.json(lessonsOut(req)));
router.post('/api/homeroom/:id/lessons/preview', rateLimit('homeroom-lesson-preview', 1200, 3600e3), (req, res) => {
  const x = body(req);
  const r = HL.preview(req.user, { slug: String(x.slug || ''), title: x.title, instructions: x.instructions, settings: x.settings }, printCtx(req));
  if (!r.ok) return hlFail(req, res, r);
  res.json({ html: r.html, n: r.n, settings: r.s });
});
router.post('/api/homeroom/:id/lessons', rateLimit('game-sets', 60, 60e3), (req, res) => {
  const x = body(req);
  const r = HL.saveLesson(req.user, { id: x.id ? String(x.id) : null, slug: String(x.slug || ''), title: x.title, instructions: x.instructions, base: x.base, versions: x.versions });
  if (!r.ok) return hlFail(req, res, r);
  res.json({ ok: true, id: r.lesson.id, toast: req.t(x.id ? 'homeroom.lessons.saved' : 'homeroom.lessons.savedNew'), ...lessonsOut(req) });
});
router.post('/api/homeroom/:id/lessons/:lid/duplicate', rateLimit('game-sets', 60, 60e3), (req, res) => {
  const l = HL.getMine(req.user, req.params.lid); if (!l) return hlFail(req, res, { code: 'noLesson' });
  const r = HL.duplicateLesson(req.user, l.id, req.t('homeroom.lessons.copyOf', { title: l.title }));
  if (!r.ok) return hlFail(req, res, r);
  res.json({ ok: true, id: r.lesson.id, toast: req.t('homeroom.lessons.duplicated'), ...lessonsOut(req) });
});
router.post('/api/homeroom/:id/lessons/:lid/delete', rateLimit('game-sets', 60, 60e3), (req, res) => {
  const r = HL.deleteLesson(req.user, req.params.lid);
  if (!r.ok) return hlFail(req, res, r);
  res.json({ ok: true, toast: req.t('homeroom.lessons.deleted'), ...lessonsOut(req) });
});
router.post('/api/homeroom/:id/lessons/:lid/print', rateLimit('game-print', 60, 60e3), (req, res) => {
  const x = body(req);
  const r = HL.printLesson(req.user, req.params.lid, typeof x.version === 'string' ? x.version : '', { key: x.key === true }, printCtx(req));
  if (!r.ok) return hlFail(req, res, r);
  res.json({ html: r.html });
});

// ---------------------------------------------------------------- the projector view
// The teacher's area as big as the screen, the class's name and the Live dot: never a name, a desk, a hand or progress.
// No site bar or chat (bare), so nothing of the teacher's own screen shows either.
router.get('/class/:id/homeroom/projector', (req, res) => {
  const t = req.t, c = req.homeroomClass;
  page(req, res, {
    title: t('homeroom.projector.title', { class: c.name }), bare: true, bodyClass: 'hr-projpage', scripts: ['/js/homeroom-projector.js'], i18n: ['js.homeroom-area'],
    head: raw(`<link rel="stylesheet" href="/css/manipulatives.css?v=${VERSION}"><link rel="stylesheet" href="/css/homeroom.css?v=${VERSION}">`),
    body: html`${jsonData('page-data', { classId: c.id, state: { ...H.boardState(c.id), signin: signinView(req, c.id) } })}
    <div class="hr-proj" id="hr-proj">
      <header class="hr-projtop"><h1 class="hr-projname" dir="auto">${c.name}</h1><span class="hr-livedot" id="hr-live"${H.liveOf(c.id) ? '' : raw(' hidden')}>${t('homeroom.live')}</span></header>
      <div class="hr-projmain"><div class="hr-projarea" id="hr-projarea"></div>
        <aside class="hr-projsign" id="hr-projsign" hidden aria-labelledby="hr-projsignh"><h2 id="hr-projsignh">${ico('🔑', { size: 28 })} ${t('homeroom.signin.title')}</h2>
          <div class="hr-projqr" id="hr-projqr"></div>
          <p class="hr-projgo">${t('homeroom.signin.goTo')} <b dir="ltr" id="hr-projurl"></b></p>
          <p class="hr-projcodecap">${t('homeroom.signin.enterCode')}</p><p class="hr-projcode" dir="ltr" id="hr-projcode"></p></aside></div>
    </div>`,
  });
});
// The projector's poll: the live state, the area when it changed, and the class sign-in (its QR code only when the code
// changed since sc, the code the page last saw).
router.get('/api/homeroom/:id/state', rateLimit('homeroom-state', 3000, 3600e3), (req, res) => {
  const id = req.homeroomClass.id, si = SI.signinOf(id);
  res.json({ ...H.boardState(id, req.query.v), signin: signinView(req, id, { qr: !si.open || String(req.query.sc || '') !== si.code }) });
});

// ---------------------------------------------------------------- the student desk
const dockBtn = (k, icon, label, attrs = '') => html`<button type="button" class="hd-dockbtn" data-hd="${k}"${raw(attrs)}>${ico(icon, { size: 20 })}<span>${label}</span></button>`;
router.get('/class/:id/desk', (req, res) => {
  const t = req.t, c = req.homeroomClass, u = req.user;
  const room = H.roomForStudent(c, u), device = SI.deviceClass(req.sessionId) === c.id, cards = HO.deskView(c, u, req.locale);
  page(req, res, {
    title: t('homeroom.desk.pageTitle', { class: c.name }), active: 'classes', bodyClass: 'hr-page hd-page', scripts: ['/js/homeroom-desk.js'], i18n: ['js.homeroom-area'],
    head: raw(`<link rel="stylesheet" href="/css/manipulatives.css?v=${VERSION}"><link rel="stylesheet" href="/css/homeroom.css?v=${VERSION}">`),
    body: html`${jsonData('page-data', { classId: c.id, className: c.name, me: { id: u.id, name: u.display_name }, device, color: room.color, desks: room.desks, cards,
      strokes: H.doodleOf(c.id, u.id), doodle: { w: H.DOODLE.w, h: H.DOODLE.h, strokes: H.DOODLE.strokes, points: H.DOODLE.points, total: H.DOODLE.total, colors: H.DOODLE_COLORS }, state: H.boardState(c.id) })}
    <div class="hd" id="hd">
      <header class="hd-top hd-float">
        <span class="hr-livedot" id="hr-live"${H.liveOf(c.id) ? '' : raw(' hidden')}>${t('homeroom.live')}</span>
        <h1 class="hd-title" dir="auto">${c.name}</h1>
        ${device ? html`<span class="hd-grow"></span><span class="hd-notyou"><span class="hd-hidephone">${t('homeroom.desk.notYou', { name: u.display_name })}</span><button type="button" class="hd-tool hd-switch" data-hd="switch">${ico('🔄', { size: 18 })} ${t('homeroom.desk.switch')}</button></span>` : ''}
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
router.get('/api/desk/:id/state', rateLimit('homeroom-desk-state', 3000, 3600e3), (req, res) => {
  // The student's own cards (never anyone else's), sent again only when they changed (hv: the version the page has).
  const cards = HO.deskView(req.homeroomClass, req.user, req.locale), hv = HO.deskVersion(cards);
  res.json({ ...H.boardState(req.homeroomClass.id, req.query.v), hv, ...(String(req.query.hv ?? '') === hv ? {} : { cards }) });
});
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
