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
// Step 2c (docs/decisions.md "Homeroom, step 2c"):
//   POST /api/homeroom/:id/handouts            also { gcPost: true }: "Also post to Google Classroom" (routes/gclassroom.js
//                                              gcAfterAssign, as Classroom's Assign does; never twice: GC.postOf)
//   POST /api/homeroom/:id/handouts/:clid/feedback  a comment and a sticker on a finished card: { studentId, comment, sticker }
//   POST /api/homeroom/:id/handouts/:clid/grade     change how it is graded: { grade: score | completion | none } (the
//                                              Classroom tab's overview; every version handed out together)
// The teacher's desk (docs/decisions.md "Homeroom: the teacher's desk"; services/homeroom-staged.js):
//   GET  /api/homeroom/:id/staged              what is on the teacher's own desk (this teacher's view)
//   POST /api/homeroom/:id/staged              { action: add, pick: gameId | L:<lessonId> | T:<tool> } | { action: remove, id }
//   POST /api/homeroom/:id/teams               team desks: { action: make, members, x?, y? } | { action: split | move, id, x?, y? }
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
//                                              (the desk's Notebook and a handout's Notes: routes/notebook.js)
//   GET  /api/homeroom-live                    the live classes of this student with Homeroom (the prompt on every page)
// Step 3a, live class (services/homeroom-live.js; docs/decisions.md "Homeroom, step 3a"):
//   GET  /api/homeroom/:id/pulse?hv=           the teacher's board while live, every 2 s: each desk's status, current
//                                              handout, hand, pass, settings and cursor samples; the Hands panel; and the
//                                              desks' handouts again when they changed (hv: the fingerprint the page has)
//   POST /api/homeroom/:id/hands               { action: answer | pass | notNow | back, studentId } or { action: minutes, minutes }
//   POST /api/homeroom/:id/desk-flag           { studentId, flag: lock | hide | coming, on }
//   GET  /api/homeroom/:id/look/:sid           look at one student's desk: status, current handout, last pulse, their pad
//   POST /api/desk/:id/pulse                   a desk's or a handout game's pulse: { where, on, idle, step, cur, pad }
//   POST /api/desk/:id/hand                    their own hand: { action: raise, kind } | { action: lower } | { action: back }
// The day plan (docs/decisions.md "Homeroom: the day plan"; services/homeroom-plan.js; planned in the Oomba chat only):
//   GET  /api/homeroom/:id/plan                today's plan of the class with its timer (the plan pill)
//   POST /api/homeroom/:id/plan                { action: start | more | next | finish | clear } -> { plan, summary? }
//   The projector's and a desk's state carry only the Now / Next part names and the timer (HP.publicView).
import { Router } from 'express';
import { html, raw, jsonData } from '../views/html.js';
import { ico } from '../views/icon.js';
import { page, VERSION, onEveryPage } from '../views/layout.js';
import { rateLimit } from '../services/ratelimit.js';
import * as H from '../services/homeroom.js';
import * as HO from '../services/homeroom-handouts.js';
import * as HL from '../services/homeroom-lessons.js';
import * as HV from '../services/homeroom-live.js';
import * as HS from '../services/homeroom-staged.js';
import * as HP from '../services/homeroom-plan.js';
import crypto from 'node:crypto';
import { localeInfo } from '../i18n/index.js';
import { hasModel } from '../builder/anthropic.js';
import { canHost as liveCanHost } from '../services/classlive-access.js';
import { liveOn } from '../services/classlive-sessions.js';
import { requestOrigin } from '../services/frame.js';
import * as SI from '../services/homeroom-signin.js';
import { signinView } from './homeroom-signin.js';
import * as S from '../services/schools.js';
import * as games from '../services/games.js';
import { toolAccess } from '../services/teacher-tools.js';
import { config } from '../config.js';
import { gcAfterAssign, gcCanPost } from './gclassroom.js';
import { markView } from './homeroom-views.js';
import * as SUP from '../services/homeroom-supports.js';
import * as HA from '../services/homeroom-aides.js';
import * as SB from '../services/homeroom-sub.js';
import { parseCookies } from '../auth.js';
import * as NB from '../services/notebook.js';

export const router = Router();
const STATUS = { notFound: 404, tooBig: 413, forbidden: 403 };
const fail = (req, res, code) => res.status(STATUS[code] || 400).json({ error: req.t(`homeroom.errors.${code}`), code });
const send = (req, res, r) => (r.ok ? res.json(r) : fail(req, res, r.code));
const body = req => (req.body && typeof req.body === 'object' ? req.body : {});

// The gate: a class this person may run Homeroom for, else on to the site's 404 (the page's, or the API's JSON one).
// Step 3c (docs/decisions.md "Homeroom: supports, aides and sub links"): a class's aide (services/homeroom-aides.js) and
// a sub with that class's one-day link (services/homeroom-sub.js, the hr_sub cookie) get in too, but only to the
// addresses listed for them here; everything else of the class's Homeroom answers them 403. The services check again.
const HELPER_OK = {
  aide: [['GET', /^\/class\/[^/]+\/homeroom\/?$/], ['GET', /^\/class\/[^/]+\/homeroom\/projector\/?$/], ['GET', /^\/api\/homeroom\/[^/]+\/(state|handouts|plan|pulse|supports)$/],
    ['GET', /^\/api\/homeroom\/[^/]+\/look\/[^/]+$/], ['POST', /^\/api\/homeroom\/[^/]+\/(hands|desk-flag)$/], ['POST', /^\/api\/homeroom\/[^/]+\/handouts\/[^/]+\/feedback$/]],
  sub: [['GET', /^\/class\/[^/]+\/homeroom\/projector\/?$/], ['GET', /^\/api\/homeroom\/[^/]+\/state$/]],
};
/** The sub this request's hr_sub cookie stands for now ({ link, c, actor }), or null. */
export function subOf(req) {
  if (req.hrSubOf === undefined) req.hrSubOf = SB.subFromCookie(parseCookies(req)[SB.COOKIE]);
  return req.hrSubOf;
}
const helperMay = (role, req) => {
  const path = req.originalUrl.split('?')[0], m = req.method === 'HEAD' ? 'GET' : req.method;
  return (HELPER_OK[role] || []).some(([mm, re]) => mm === m && re.test(path));
};
export function forbidden(req, res) {
  res.set({ 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' });
  if (req.originalUrl.startsWith('/api/')) return res.status(403).json({ error: req.t('homeroom.errors.forbidden'), code: 'forbidden' });
  return page(req, res, { title: req.t('homeroom.helpers.forbiddenTitle'), body: html`<div class="empty"><div class="emo">${ico('🔒', { size: 56 })}</div><h1>${req.t('homeroom.helpers.forbiddenTitle')}</h1><p>${req.t('homeroom.helpers.forbiddenText')}</p></div>` }, 403);
}
const gate = (req, res, next) => {
  const c = S.getClass(req.params.id);
  let role = H.canUseClass(req.user, c) ? 'teacher' : c ? H.helperRole(req.user, c) : null, actor = req.user;
  if (!role && c) { const x = subOf(req); if (x && x.c.id === c.id) { role = 'sub'; actor = x.actor; req.hrSub = x; } }
  if (!role) return next('router');
  if (role !== 'teacher' && !helperMay(role, req)) return forbidden(req, res);
  res.set({ 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' });
  req.homeroomClass = c; req.hrRole = role; req.hrActor = actor;
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

// The tabs a Homeroom teacher has on a class (Homeroom | Classroom | Dashboard) and the one page they are views of:
// routes/homeroom-views.js (docs/decisions.md "Homeroom: one page, three views").
export { homeroomTabs } from './homeroom-views.js';

/** What the left panel lists: their own games and the Oomba games, each one a handout (step 2a: tap it, then a desk,
 *  a group or Whole class; or drag it there), and the Manipulatives and Figures, which come next. */
function deskLists(req) {
  const u = req.user;
  const title = g => games.localizeGame(g, req.locale).title;
  const mine = games.myGames(u.id, 12).filter(g => g.status !== 'deleted').map(g => ({ id: g.id, icon: g.icon || '🎮', title: g.title }));
  const tools = [
    // tools can't be handed out yet ("Coming next"), but they go on the teacher's desk to open from there
    ...(toolAccess(u, config.manipulatives) === 'yes' ? [{ id: 'T:manipulatives', icon: '🧮', title: req.t('homeroom.panel.manipulatives'), soon: true }] : []),
    ...(toolAccess(u, config.figures) === 'yes' ? [{ id: 'T:figures', icon: '📐', title: req.t('homeroom.panel.figures'), soon: true }] : []),
  ];
  const oomba = games.listVisible(u, { shelf: 'learn', official: true, order: 'plays', limit: 16 }).filter(g => HO.handable(u, g)).map(g => ({ id: g.id, icon: g.icon || '🎮', title: title(g) }));
  return { mine, oomba: [...oomba, ...tools] };
}
const row = (t, x) => (x.id
  ? html`<li><button type="button" class="hr-item hr-give" data-hritem="${x.id}" data-icon="${x.icon}" aria-pressed="false"><span class="hr-ico" aria-hidden="true">${ico(x.icon, { size: 18 })}</span><span class="hr-itemt" dir="auto">${x.title}</span>${x.soon ? html`<span class="hr-soontag">${t('homeroom.panel.comingNext')}</span>` : ''}</button></li>`
  : html`<li class="hr-item hr-later"><span class="hr-ico" aria-hidden="true">${ico(x.icon, { size: 18 })}</span><span class="hr-itemt" dir="auto">${x.title}</span>${x.soon ? html`<span class="hr-soontag">${t('homeroom.panel.comingNext')}</span>` : ''}</li>`);

router.get('/class/:id/homeroom', (req, res) => {
  const t = req.t, c = req.homeroomClass, u = req.user, aide = req.hrRole === 'aide';
  const room = H.roomOf(c.id);
  // The shared bar's Homeroom buttons (routes/homeroom-views.js): the Live dot, live class's buttons, Arrange seats, ⋯.
  // An aide (step 3c) gets the same bar on its own (no Classroom or Dashboard, no Arrange seats) with an Aide chip.
  const acts = html`<span class="hr-livedot" id="hr-live"${H.liveOf(c.id) ? '' : raw(' hidden')}>${t('homeroom.live')}</span>
        <span class="hr-plan" id="hr-plan"></span>
        <span class="hr-grow"></span>
        <span class="hr-livebtns" id="hr-livebtns"></span>
        ${aide ? '' : html`<button class="btn hr-chunk" type="button" data-hr="seats" data-cv-fold aria-pressed="false" aria-label="${t('homeroom.arrange')}">${ico('🔀', { size: 18 })}<span class="hr-hidephone"> ${t('homeroom.arrange')}</span></button>`}
        <div class="hr-morewrap"><button class="btn hr-chunk" type="button" data-hr="menu" aria-expanded="false" aria-haspopup="true" aria-label="${t('homeroom.more')}">⋯</button><div id="hr-menu"></div></div>`;
  if (!aide) markView(req, c, 'homeroom', acts);
  const lists = aide ? { mine: [], oomba: [] } : deskLists(req);
  const section = (k, items, empty = '') => html`<h2 class="hr-cap">${t(`homeroom.panel.${k}`)}</h2>${items.length ? html`<ul class="hr-items">${items.map(x => row(t, x))}</ul>` : empty ? html`<p class="hr-empty small">${empty}</p>` : ''}`;
  const board = html`<div id="homeroom" class="hr${aide ? ' hr-aide' : ''}">
      <div class="hr-stage">
        <div class="rm rm-teacher hr-board" id="hr-board" tabindex="-1" aria-label="${t('homeroom.boardLabel')}"><div class="rm-world" id="hr-world"><p class="muted hr-loading">${t('homeroom.loading')}</p></div></div>
        <aside class="hr-panel" id="hr-panel" aria-label="${t('homeroom.panel.label')}"${aide ? raw(' hidden') : ''}>
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
    </div>`;
  // An aide's page: the same board and bar, outside the three views (they see neither Classroom nor Dashboard).
  const body = aide ? html`<div class="cv" id="cv-aide" data-view="homeroom">
      <header class="cv-bar" id="cv-bar"><div class="cv-nav"><span class="hr-aidecls" dir="auto">${c.name}</span><span class="hr-aidechip" title="${t('homeroom.helpers.aideChipHint')}">${ico('🧑‍🏫', { size: 18 })} ${t('homeroom.helpers.aideChip')}</span></div>
        <div class="cv-acts cv-acts-homeroom hr" data-cv-acts="homeroom">${acts}</div></header>
      <div class="cv-views"><section class="cv-view cv-view-homeroom" data-cv-view="homeroom" aria-label="${t('homeroom.tabs.homeroom')}">${board}</section></div></div>` : board;
  page(req, res, {
    title: t('homeroom.pageTitle', { class: c.name }), active: 'classes', bodyClass: aide ? 'hr-page cv-page cv-on-homeroom hr-aidepage' : 'hr-page', scripts: ['/js/homeroom.js'], i18n: ['js.manip-room', 'js.board-ann', 'js.homeroom-signin-panel', 'js.homeroom-lessons', 'js.homeroom-live', 'js.homeroom-plan', 'js.homeroom-helpers', 'js.notebook'],
    head: raw(`<link rel="stylesheet" href="/css/manipulatives.css?v=${VERSION}"><link rel="stylesheet" href="/css/homeroom.css?v=${VERSION}">${aide ? `<link rel="stylesheet" href="/css/class-views.css?v=${VERSION}">` : ''}`),
    body: html`${jsonData('page-data', { classId: c.id, className: c.name, role: aide ? 'aide' : 'teacher', room, live: H.liveOf(c.id), handouts: HO.boardView(c, req.locale), instructionsMax: HO.INSTRUCTIONS_MAX,
      gc: aide ? false : gcCanPost(req, c), stickers: Object.keys(HO.STICKERS).map(k => ({ k, src: HO.stickerSrc(k), label: t(`homeroom.stickers.${k}`) })), commentMax: HO.COMMENT_MAX,
      lessons: aide ? [] : HL.listMine(u, req.locale), staged: aide ? [] : HS.stagedFor(u, c, req.locale, t), stagedMax: HS.STAGED_MAX, lessonGames: aide ? [] : HL.lessonGames(u, req.locale), lessonsMax: HL.LESSONS_MAX, titleMax: HL.TITLE_MAX, ai: !aide && hasModel() && liveCanHost(u),
      // the ⋯ menu's Host a live game (the Classroom view no longer has one; docs/decisions.md "A calmer Classroom view on phones")
      hostLive: !aide && !c.archived_at && liveOn() && liveCanHost(u) ? `/live?class=${c.id}` : '',
      pulse: { stuckMin: HV.STUCK_MS / 60e3, passMin: HV.PASS_MIN, passMax: HV.PASS_MAX }, plan: HP.teacherView(c),
      // step 3c: the students' supports, and for the teacher the aides, sub links and "While you were out"
      supports: SUP.supportsOf(c.id), simples: aide ? {} : Object.fromEntries(SUP.simplesOf(c.id)), simpleMax: SUP.SIMPLE_MAX, chat: !aide && hasModel(),
      ...(aide ? {} : { helpers: { aides: HA.listFor(c), subLinks: SB.linksOf(c), notes: SB.notesFor(c), noteMax: SB.NOTE_MAX, aidesMax: HA.AIDES_MAX } }) })}
    ${body}`,
  });
});

// ---------------------------------------------------------------- step 3c: supports, aides, sub links
// Supports (services/homeroom-supports.js): the class's teachers set them; an aide reads them (the gate lets the GET).
router.get('/api/homeroom/:id/supports', rateLimit('homeroom-state', 3000, 3600e3), (req, res) => res.json({ supports: SUP.supportsOf(req.homeroomClass.id) }));
router.post('/api/homeroom/:id/supports', rateLimit('homeroom-supports', 600, 3600e3), (req, res) => {
  const x = body(req), r = SUP.setSupport(req.user, req.homeroomClass, String(x.studentId || ''), { time: x.time, read: x.read, simple: x.simple, big: x.big });
  if (!r.ok) return fail(req, res, r.code);
  res.json({ ok: true, support: r.support, supports: SUP.supportsOf(req.homeroomClass.id), toast: req.t('homeroom.helpers.supportsSaved') });
});
router.post('/api/homeroom/:id/handouts/:clid/simpler', rateLimit('homeroom-simpler', 300, 3600e3), (req, res) => {
  const r = SUP.setSimple(req.user, req.homeroomClass, req.params.clid, typeof body(req).text === 'string' ? body(req).text : '');
  if (!r.ok) return fail(req, res, r.code);
  res.json({ ok: true, text: r.text, simples: Object.fromEntries(SUP.simplesOf(req.homeroomClass.id)), toast: req.t(r.text ? 'homeroom.helpers.simplerSaved' : 'homeroom.helpers.simplerRemoved') });
});
// Aides (services/homeroom-aides.js): the class's teachers only (an aide never sees this list).
const aidesOut = req => ({ aides: HA.listFor(req.homeroomClass), staff: HA.staffToAdd(req.user, req.homeroomClass) });
router.get('/api/homeroom/:id/aides', rateLimit('homeroom-state', 3000, 3600e3), (req, res) => res.json(aidesOut(req)));
router.post('/api/homeroom/:id/aides', rateLimit('homeroom-aides', 120, 3600e3), (req, res) => {
  const x = body(req), c = req.homeroomClass, a = String(x.action || '');
  const r = a === 'invite' ? HA.invite(req.user, c, { email: x.email }) : a === 'add' ? HA.addStaff(req.user, c, x.userId) : a === 'remove' ? HA.remove(req.user, c, x.id) : { ok: false, code: 'badAction' };
  if (!r.ok) return fail(req, res, r.code);
  res.json({ ok: true, ...aidesOut(req), ...(r.token ? { url: `${requestOrigin(req).replace(/\/$/, '')}/hr/aide/${r.token}` } : {}),
    toast: req.t({ invite: 'homeroom.helpers.aideInvited', add: 'homeroom.helpers.aideAdded', remove: 'homeroom.helpers.aideRemoved' }[a]) });
});
// Sub links (services/homeroom-sub.js): made, listed and revoked by the class's teachers; "While you were out".
const subOut = req => ({ subLinks: SB.linksOf(req.homeroomClass), notes: SB.notesFor(req.homeroomClass) });
router.get('/api/homeroom/:id/sub-links', rateLimit('homeroom-state', 3000, 3600e3), (req, res) => res.json(subOut(req)));
router.post('/api/homeroom/:id/sub-links', rateLimit('homeroom-sublinks', 120, 3600e3), (req, res) => {
  const x = body(req), c = req.homeroomClass, a = String(x.action || '');
  const r = a === 'create' ? SB.createLink(req.user, c, { day: String(x.day || 'today'), until: String(x.until || ''), pin: String(x.pin ?? ''), note: typeof x.note === 'string' ? x.note : '', tz: String(x.tz || '') })
    : a === 'revoke' ? SB.revoke(req.user, c, x.id) : a === 'seen' ? SB.markSeen(req.user, c, x.id) : { ok: false, code: 'badAction' };
  if (!r.ok) return fail(req, res, r.code);
  res.json({ ok: true, ...subOut(req), ...(r.token ? { url: `${requestOrigin(req).replace(/\/$/, '')}/sub/${r.token}`, link: r.link } : {}),
    ...(a === 'seen' ? {} : { toast: req.t(a === 'create' ? 'homeroom.helpers.subMade' : 'homeroom.helpers.subRevoked') }) });
});

router.post('/api/homeroom/:id/seats', rateLimit('homeroom-seats', 600, 3600e3), (req, res) => send(req, res, H.saveSeats(req.user, req.homeroomClass, { preset: body(req).preset, seats: body(req).seats })));
router.post('/api/homeroom/:id/groups', rateLimit('homeroom-groups', 300, 3600e3), (req, res) => send(req, res, H.saveGroups(req.user, req.homeroomClass, { groups: body(req).groups, members: body(req).members })));
router.post('/api/homeroom/:id/area', rateLimit('homeroom-area', 1800, 3600e3), (req, res) => send(req, res, H.saveArea(req.user, req.homeroomClass, body(req).state)));
router.post('/api/homeroom/:id/live', rateLimit('homeroom-live', 600, 3600e3), (req, res) => send(req, res, H.setLive(req.user, req.homeroomClass, String(body(req).action || ''))));

// ---------------------------------------------------------------- the day plan (services/homeroom-plan.js)
// The pill's timer is the server's (a reload, the projector and the desks see the same); it never moves on by itself.
router.get('/api/homeroom/:id/plan', rateLimit('homeroom-state', 3000, 3600e3), (req, res) => res.json({ plan: HP.teacherView(req.homeroomClass) }));
router.post('/api/homeroom/:id/plan', rateLimit('homeroom-plan', 600, 3600e3), (req, res) => {
  const r = HP.runAction(req.user, req.homeroomClass, String(body(req).action || ''));
  if (!r.ok) return fail(req, res, r.code);
  res.json({ ok: true, plan: HP.teacherView(req.homeroomClass), ...(r.summary ? { summary: r.summary } : {}) });
});

// ---------------------------------------------------------------- live class: watching desks (step 3a)
// The board asks every 2 s while live and visible (1800 an hour); the desks' handouts come again only when they changed.
const hoPrint = ho => crypto.createHash('sha1').update(JSON.stringify(ho)).digest('base64url').slice(0, 16);
router.get('/api/homeroom/:id/pulse', rateLimit('homeroom-pulse-t', 5000, 3600e3), (req, res) => {
  const c = req.homeroomClass, ho = HO.boardView(c, req.locale), hv = hoPrint(ho);
  res.json({ ...HV.liveView(c, ho), hv, ...(String(req.query.hv || '') === hv ? {} : { ho }) });
});
router.post('/api/homeroom/:id/hands', rateLimit('homeroom-hands-t', 1200, 3600e3), (req, res) => {
  const x = body(req);
  send(req, res, HV.teacherHands(req.user, req.homeroomClass, { action: String(x.action || ''), studentId: String(x.studentId || ''), minutes: x.minutes }));
});
router.post('/api/homeroom/:id/desk-flag', rateLimit('homeroom-flag', 1200, 3600e3), (req, res) => {
  const x = body(req);
  send(req, res, HV.setFlag(req.user, req.homeroomClass, String(x.studentId || ''), String(x.flag || ''), !!x.on));
});
router.get('/api/homeroom/:id/look/:sid', rateLimit('homeroom-look', 1200, 3600e3), (req, res) => send(req, res, HV.lookAt(req.user, req.homeroomClass, req.params.sid, req.locale)));

// ---------------------------------------------------------------- handouts (step 2a; services/homeroom-handouts.js)
// A handout is a real class assignment (services/game-folders.js assignGame), so it shares the assign routes' limit
// (lesson-new, 120 an hour). Errors that name a count (alreadyOnDesk) say how many desks.
const HO_ERR = { pickGame: 'homeroom.errors.pickGame', publishFirst: 'homeroom.errors.publishFirst', badDate: 'homeroom.errors.badDate' };
const hoFail = (req, res, r) => res.status(STATUS[r.code] || 400).json({ error: req.t(HO_ERR[r.code] || `homeroom.errors.${r.code}`, { count: r.count || 0 }), code: r.code });
router.get('/api/homeroom/:id/handouts', rateLimit('homeroom-state', 3000, 3600e3), (req, res) => res.json(HO.boardView(req.homeroomClass, req.locale)));
router.post('/api/homeroom/:id/handouts', rateLimit('lesson-new', 120, 3600e3), async (req, res) => {
  const x = body(req), c = req.homeroomClass;
  const to = x.to && typeof x.to === 'object' ? { kind: String(x.to.kind || ''), id: String(x.to.id || '') } : null;
  if (x.lessonId) {
    const r = HL.handOutLesson(req.user, c, { lessonId: String(x.lessonId), to, order: String(x.order || 'in'), grade: String(x.grade || 'score'), dueAt: x.dueAt ? String(x.dueAt) : null });
    if (!r.ok) return hoFail(req, res, r);
    const also = await alsoPost(req, r.classLessons);
    const toast = !r.students ? req.t('homeroom.handout.forLater', { title: r.lesson.title })
      : req.t(r.versions > 1 ? 'homeroom.lessons.handedOutVersions' : 'homeroom.lessons.handedOut', { title: r.lesson.title, count: r.students, versions: r.versions });
    return res.json({ ok: true, toast: also ? `${toast} · ${also}` : toast, ...HO.boardView(c, req.locale) });
  }
  const r = HO.handOut(req.user, c, { gameId: String(x.gameId || ''), to, instructions: typeof x.instructions === 'string' ? x.instructions : '', order: String(x.order || 'in'), grade: String(x.grade || 'completion'), dueAt: x.dueAt ? String(x.dueAt) : null });
  if (!r.ok) return hoFail(req, res, r);
  const also = await alsoPost(req, [r.classLesson]);
  const title = games.localizeGame(r.game, req.locale).title;
  // Whole class with no students yet: it waits for them (whoever joins gets it).
  const toast = r.students ? req.t('homeroom.handout.done', { title, count: r.students }) : req.t('homeroom.handout.forLater', { title });
  res.json({ ok: true, toast: also ? `${toast} · ${also}` : toast, ...HO.boardView(c, req.locale) });
});
/** "Also post to Google Classroom" (step 2c): each class lesson just made goes to the linked Classroom class through
 *  the same path as Classroom's Assign (gcAfterAssign: asked for, connected, the class's teacher, the sync limit; a
 *  handout to some desks is refused there, since in Classroom it would reach the whole course). A lesson is posted once
 *  (services/gclassroom.js postOf). -> the toast's extra line ('' when not asked). */
async function alsoPost(req, cls) {
  const lines = [];
  for (const cl of cls || []) { const line = await gcAfterAssign(req, cl); if (line && !lines.includes(line)) lines.push(line); }
  return lines.join(' · ');
}
router.post('/api/homeroom/:id/handouts/:clid/feedback', rateLimit('homeroom-feedback', 600, 3600e3), (req, res) => {
  const x = body(req), c = req.homeroomClass;
  const r = HO.setFeedback(req.user, c, req.params.clid, String(x.studentId || ''), { comment: typeof x.comment === 'string' ? x.comment : '', sticker: typeof x.sticker === 'string' ? x.sticker : '' });
  if (!r.ok) return hoFail(req, res, r);
  res.json({ ok: true, feedback: r.feedback, toast: req.t(r.feedback ? 'homeroom.feedback.saved' : 'homeroom.feedback.removed'), ...HO.boardView(c, req.locale) });
});
router.post('/api/homeroom/:id/handouts/:clid/grade', rateLimit('homeroom-grade', 300, 3600e3), (req, res) => {
  const r = HO.setGrade(req.user, req.homeroomClass, req.params.clid, String(body(req).grade || ''));
  if (!r.ok) return hoFail(req, res, r);
  res.json({ ok: true, grade: r.grade, ids: r.ids, toast: req.t('homeroom.overview.gradeSaved') });
});
// ---------------------------------------------------------------- the teacher's desk (services/homeroom-staged.js)
// Games, lessons and tools the teacher put on their own desk to try and hand out later: staged, never assigned. Only
// the class's teachers (the gate above); nothing a student reads carries it.
const stagedOut = req => ({ staged: HS.stagedFor(req.user, req.homeroomClass, req.locale, req.t) });
router.get('/api/homeroom/:id/staged', rateLimit('homeroom-state', 3000, 3600e3), (req, res) => res.json(stagedOut(req)));
router.post('/api/homeroom/:id/staged', rateLimit('homeroom-staged', 600, 3600e3), (req, res) => {
  const x = body(req), c = req.homeroomClass;
  if (x.action === 'remove') {
    const r = HS.unstage(req.user, c, String(x.id || ''));
    if (!r.ok) return fail(req, res, r.code);
    return res.json({ ok: true, toast: req.t('homeroom.staged.removed'), ...stagedOut(req) });
  }
  if (x.action !== 'add') return fail(req, res, 'badAction');
  const r = HS.stage(req.user, c, { pick: String(x.pick || '') });
  if (!r.ok) return fail(req, res, r.code);
  res.json({ ok: true, id: r.item.id, toast: req.t(r.already ? 'homeroom.staged.already' : 'homeroom.staged.added'), ...stagedOut(req) });
});
router.post('/api/homeroom/:id/teams', rateLimit('homeroom-seats', 600, 3600e3), (req, res) => {
  const x = body(req);
  const r = H.saveTeams(req.user, req.homeroomClass, { action: String(x.action || ''), id: String(x.id || ''), members: Array.isArray(x.members) ? x.members.slice(0, 50) : [], x: x.x, y: x.y });
  if (!r.ok) return fail(req, res, r.code);
  res.json({ ok: true, teams: r.teams, ...(r.team ? { team: r.team } : {}), ...HO.boardView(req.homeroomClass, req.locale) });
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
    title: t('homeroom.projector.title', { class: c.name }), bare: true, bodyClass: 'hr-projpage', scripts: ['/js/homeroom-projector.js'], i18n: ['js.homeroom-area', 'js.homeroom-plan'],
    head: raw(`<link rel="stylesheet" href="/css/manipulatives.css?v=${VERSION}"><link rel="stylesheet" href="/css/homeroom.css?v=${VERSION}">`),
    body: html`${jsonData('page-data', { classId: c.id, state: { ...H.boardState(c.id), signin: signinView(req, c.id), plan: HP.publicView(c) } })}
    <div class="hr-proj" id="hr-proj">
      <header class="hr-projtop"><h1 class="hr-projname" dir="auto">${c.name}</h1><span class="hr-livedot" id="hr-live"${H.liveOf(c.id) ? '' : raw(' hidden')}>${t('homeroom.live')}</span><div class="hr-projplan" id="hr-projplan" hidden></div></header>
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
  res.json({ ...H.boardState(id, req.query.v), signin: signinView(req, id, { qr: !si.open || String(req.query.sc || '') !== si.code }), plan: HP.publicView(req.homeroomClass) });
});

// ---------------------------------------------------------------- the student desk
const dockBtn = (k, icon, label, attrs = '') => html`<button type="button" class="hd-dockbtn" data-hd="${k}"${raw(attrs)}>${ico(icon, { size: 20 })}<span>${label}</span></button>`;
router.get('/class/:id/desk', (req, res) => {
  const t = req.t, c = req.homeroomClass, u = req.user;
  const room = H.roomForStudent(c, u), device = SI.deviceClass(req.sessionId) === c.id, sup = SUP.forDesk(c, u), cards = SUP.applyToCards(c, sup, HO.deskView(c, u, req.locale));
  // the notebook (docs/decisions.md "Homeroom: the notebook"): the dock's last button, and a Notes button on each handout
  const nb = NB.canUse(u);
  page(req, res, {
    title: t('homeroom.desk.pageTitle', { class: c.name }), active: 'classes', bodyClass: 'hr-page hd-page', scripts: ['/js/homeroom-desk.js'], i18n: ['js.homeroom-area', 'js.homeroom-pulse', 'js.homeroom-plan', 'js.homeroom-support'],
    head: raw(`<link rel="stylesheet" href="/css/manipulatives.css?v=${VERSION}"><link rel="stylesheet" href="/css/homeroom.css?v=${VERSION}">`),
    body: html`${jsonData('page-data', { classId: c.id, className: c.name, me: { id: u.id, name: u.display_name }, device, notebook: nb, color: room.color, desks: room.desks, teams: room.teams, team: room.team, cards,
      strokes: H.doodleOf(c.id, u.id), pv: H.padVersion(c.id, u.id), doodle: { w: H.DOODLE.w, h: H.DOODLE.h, strokes: H.DOODLE.strokes, points: H.DOODLE.points, total: H.DOODLE.total, colors: H.DOODLE_COLORS },
      // step 3c: their own supports (only theirs; See the room never carries anyone's)
      ...(SUP.anySup(sup) ? { support: sup } : {}), state: { ...H.boardState(c.id), ...deskLive(c, u), plan: HP.deskView(c, sup), support: sup } })}
    <div class="hd" id="hd">
      <header class="hd-top hd-float">
        <span class="hr-livedot" id="hr-live"${H.liveOf(c.id) ? '' : raw(' hidden')}>${t('homeroom.live')}</span>
        <h1 class="hd-title" dir="auto">${c.name}</h1>
        <span class="hd-now" id="hd-now" hidden></span>
        <span class="hd-grow"></span><span class="hd-handwrap" id="hd-handwrap"></span>
        ${device ? html`<span class="hd-notyou"><span class="hd-hidephone">${t('homeroom.desk.notYou', { name: u.display_name })}</span><button type="button" class="hd-tool hd-switch" data-hd="switch">${ico('🔄', { size: 18 })} ${t('homeroom.desk.switch')}</button></span>` : ''}
      </header>
      <div class="hd-body" id="hd-body"><p class="muted hr-loading">${t('homeroom.loading')}</p></div>
      <nav class="hd-dock hd-float" aria-label="${t('homeroom.desk.dock')}">
        ${dockBtn('desk', '🎒', t('homeroom.desk.myDesk'), ' aria-pressed="true"')}
        ${dockBtn('area', '🧑‍🏫', t('homeroom.desk.teacherArea'), ' aria-pressed="false"')}
        <a class="hd-dockbtn" href="/library">${ico('📚', { size: 20 })}<span>${t('homeroom.desk.library')}</span></a>
        <span class="hd-grow"></span>
        ${dockBtn('room', '🏫', t('homeroom.desk.room'), ' aria-pressed="false"')}
        ${nb ? html`<button type="button" class="hd-dockbtn hd-nbbtn" data-nb-open aria-controls="nb" aria-expanded="false">${ico('📝', { size: 20 })}<span>${t('homeroom.desk.notebook')}</span></button>` : ''}
      </nav>
      <div id="hd-over"></div>
      <noscript><p class="notice warn">${t('homeroom.noscript')}</p></noscript>
    </div>`,
  });
});
router.get('/api/desk/:id/state', rateLimit('homeroom-desk-state', 3000, 3600e3), (req, res) => {
  // The student's own cards (never anyone else's), sent again only when they changed (hv: the version the page has).
  const c = req.homeroomClass, sup = SUP.forDesk(c, req.user), cards = SUP.applyToCards(c, sup, HO.deskView(c, req.user, req.locale)), hv = HO.deskVersion(cards);
  // A team desk's shared pad (step 2c): its version, and its strokes when another member drew since pv.
  const team = H.teamOf(c.id, req.user.id), pv = team ? H.padVersion(c.id, req.user.id) : null;
  res.json({ ...H.boardState(c.id, req.query.v), ...deskLive(c, req.user), plan: HP.deskView(c, sup), support: sup, hv, ...(String(req.query.hv ?? '') === hv ? {} : { cards }),
    ...(team ? { pv, team: team.id, ...(String(req.query.pv ?? '') === String(pv) ? {} : { strokes: H.doodleOf(c.id, req.user.id) }) } : {}) });
});
// Step 3a: what a desk hears about its own live desk (its hand, its place with the hall pass, its settings, and a team
// desk's teammates' cursors on the shared pad); nothing while class isn't live.
function deskLive(c, u) {
  if (!H.liveOf(c.id)) return {};
  return HV.deskLiveOf(c, u);
}
// A pulse at most every 2 s while the pointer moves, else every 10 s (1800 an hour at most).
router.post('/api/desk/:id/pulse', rateLimit('homeroom-pulse', 4000, 3600e3), (req, res) => send(req, res, HV.pulse(req.user, req.homeroomClass, body(req))));
router.post('/api/desk/:id/hand', rateLimit('homeroom-hand', 300, 3600e3), (req, res) => {
  const x = body(req), a = String(x.action || ''), c = req.homeroomClass;
  if (a === 'raise') return send(req, res, HV.raiseHand(req.user, c, String(x.kind || '')));
  if (a === 'lower' || a === 'back') return send(req, res, HV.lowerHand(req.user, c, { back: a === 'back' }));
  fail(req, res, 'badAction');
});
router.post('/api/desk/:id/doodle', rateLimit('homeroom-doodle', 1200, 3600e3), (req, res) => {
  const x = body(req), r = H.saveDoodle(req.user, req.homeroomClass, x.strokes, { base: x.base === undefined || x.base === null ? null : String(x.base) });
  // Another team member drew since: the current pad comes back so the page adds its strokes to it (409).
  if (!r.ok && r.code === 'padChanged') return res.status(409).json({ error: req.t('homeroom.errors.padChanged'), code: r.code, strokes: r.strokes, pv: r.pv });
  send(req, res, r);
});

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

/** An aide's own list of where to go (step 3c): the classes they help in, each to its Homeroom, on their My classes
 *  page (routes/schools.js /teach). '' when they help in none. */
export function aidePanel(req) {
  const list = HA.classesFor(req.user);
  if (!list.length) return '';
  const t = req.t;
  return html`<section class="panel hr-aidepanel" aria-labelledby="hr-aidepanelh"><h2 id="hr-aidepanelh">${ico('🤝', { size: 28 })} ${t('homeroom.helpers.aideClasses')}</h2>
    <p class="small muted">${t('homeroom.helpers.aideClassesText')}</p>
    <ul class="plain row">${list.map(c => html`<li><a class="btn" href="/class/${c.id}/homeroom">${ico('🏫', { size: 18 })} <span dir="auto">${c.name}</span></a></li>`)}</ul></section>`;
}
