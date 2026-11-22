// Virtual math manipulatives (services/manipulatives.js; docs/decisions.md "Virtual math manipulatives"). Hidden while it
// is tested: every address here answers only someone services/manipulatives.js roleOf lets in (a host, or a student of
// a class with a session running); everyone else falls through to the site's normal 404. Never linked from any menu,
// the sitemap or search, and never indexed (X-Robots-Tag and the layout's noindex).
//   GET  /manipulatives                         the page (tools, tasks, live): the browser's public/js/manip.js
//   GET  /manipulatives/boards                  a host's All boards page (every template, recent board and room, by tool)
//   GET  /api/manipulatives/state               what the page starts from: role, own templates and recent boards,
//                                               classes, sessions, the AI draft (and how long drafts take)
//   POST /api/manipulatives/boards              a host saves a template (Save as template: it gets a share code)
//   POST /api/manipulatives/boards/autosave     a host's board, saved as they work ({ id } a recent board of theirs, or
//                                               none: a new recent board)
//   GET  /api/manipulatives/boards/:id          one of the host's own boards (a template comes as a fresh copy)
//   POST .../boards/:id/delete | rename | duplicate   the owner only
//   GET  /api/manipulatives/code/:code          a share code: a copy of a template for the opener's own board
//   POST /api/manipulatives/live                a host starts a session for one of their classes
//   POST /api/manipulatives/live/join           a student joins (by code, or by id from their class)
//   GET  /api/manipulatives/live/:id            the session's teacher: every joined student's board; a student: their own
//   POST /api/manipulatives/live/:id/work       a student sends their board (autosave)
//   POST /api/manipulatives/live/:id/push       the teacher pushes one of their saved boards to every student
//   POST /api/manipulatives/live/:id/end        the teacher ends the session
//   POST /api/manipulatives/live/:id/reopen     the teacher reopens an ended room (same code, same squares)
//   POST /api/manipulatives/live/:id/rename     the teacher renames a room;  POST .../live/:id/delete an ended room
//   GET  /api/manipulatives/live/:id/export.pdf the teacher's PDF of the students' work
//   GET  /api/manipulatives/live/:id/room       the shared room: the teacher's area and every square (classmates' typed
//                                               text removed), cursors, the last "Bring everyone to me"
//   POST /api/manipulatives/live/:id/area/:key  save one area (key 't' the teacher's area, or a student's id): the teacher
//                                               any, a student only their own square
//   POST /api/manipulatives/live/:id/bring      the teacher: "Bring everyone to me" (their current view)
//   POST /api/manipulatives/live/:id/step       the deck: the teacher moves it ({ dir } or { to }); a student moves their
//                                               own step only while the teacher lets them go at their own pace
//   POST /api/manipulatives/live/:id/pace       the teacher: "Students go at their own pace" ({ on })
//   POST /api/manipulatives/live/:id/show       the teacher: show students' work to the class ({ show: true }), or hide it
//   POST /api/manipulatives/live/:id/hand       a student raises or lowers their own hand; the teacher lowers one ({ key })
//                                               or all ({ key: 'all' }) (memory only)
//   POST /api/manipulatives/live/:id/check      "Check my answers": a student's typed answers in, right / not yet per box out
//                                               (never the answers; the teacher's switch; 5 a minute; memory only)
//   POST /api/manipulatives/live/:id/cursor     a cursor without a socket (memory only); the socket is
//                                               /api/manipulatives/ws?s=<id> (services/manip-socket.js)
//   POST /api/manipulatives/draft               a host asks the AI to draft a lesson board: a server job
//                                               (services/manip-drafts.js), one at a time; -> the job
//   GET  /api/manipulatives/draft               the host's draft now (running, or ended and not seen yet) and the estimate
//   POST /api/manipulatives/draft/:id/seen      the host saw how it ended
//   GET  /api/manipulatives/chat?tool=&boardId= the host's Oomba chat for the board they have open (services/manip-chat.js)
//   POST /api/manipulatives/chat                a message to Oomba about that board ({ tool, boardId?, title, text, grade?,
//                                               state, retry? }): checked, stored, answered in the background; -> the chat
//   POST /api/manipulatives/chat/applied        a change Oomba made was put on the board ({ tool, boardId?, turnId })
import { Router } from 'express';
import { html, raw, jsonData } from '../views/html.js';
import { ico } from '../views/icon.js';
import { page, VERSION } from '../views/layout.js';
import { rateLimit } from '../services/ratelimit.js';
import * as M from '../services/manipulatives.js';
import * as D from '../services/manip-drafts.js';
import * as C from '../services/manip-chat.js';
import { teachingTools, planReply } from './figures.js';

export const router = Router();
const STATUS = { notFound: 404, chatBusy: 409, ended: 409, notEnded: 409, aiFailed: 503, tooBig: 413, slow: 429, checkSlow: 429, noAnswers: 404 };
const fail = (req, res, code) => res.status(STATUS[code] || 400).json({ error: req.t(`manip.errors.${code}`), code });
const send = (req, res, r) => (r.ok ? res.json(r) : fail(req, res, r.code));
const body = req => (req.body && typeof req.body === 'object' ? req.body : {});

// The gate: anyone else goes on to the next router, and so to the site's 404 (the page's, or the API's JSON one).
router.use(['/manipulatives', '/api/manipulatives'], (req, res, next) => {
  const role = M.roleOf(req.user);
  if (!role) return next('router');
  res.set({ 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' });
  // School staff without the Teacher plan: the plan page (routes/figures.js planReply), the same as for Figures.
  if (role === 'plan') return planReply(req, res, 'manip');
  req.manipRole = role;
  next();
});
const hostOnly = (req, res, next) => (req.manipRole === 'host' ? next() : fail(req, res, 'notFound'));

const CSS = raw(`<link rel="stylesheet" href="/css/manipulatives.css?v=${VERSION}"><link rel="stylesheet" href="/css/manip-chat.css?v=${VERSION}">`);
router.get('/manipulatives', (req, res) => {
  const t = req.t;
  // "Teaching tools: Manipulatives · Figures" for someone who can open both (routes/figures.js).
  const tools = teachingTools(req, 'manip');
  page(req, res, {
    title: t('manip.title'), active: null, head: tools ? raw(`${CSS}<link rel="stylesheet" href="/css/figures.css?v=${VERSION}">`) : CSS, scripts: ['/js/manip.js'], i18n: ['js.manip-room', 'js.manip-chat'], bodyClass: 'manip-page',
    body: html`${tools}${jsonData('page-data', { role: req.manipRole })}
      <div id="manip" class="manip" data-role="${req.manipRole}"><p class="muted">${t('manip.loading')}</p></div>`,
  });
});

// All boards: every template and every kept recent board and room, grouped by tool (public/js/manip.js boardsPage). The
// teacher's own page: anyone else (a student too) gets the site's 404, as for anything here the gate doesn't let in.
router.get('/manipulatives/boards', (req, res, next) => {
  if (req.manipRole !== 'host') return next('router');
  const t = req.t, tools = teachingTools(req, 'manip');
  page(req, res, {
    title: t('manip.boardsTitle'), active: null, head: tools ? raw(`${CSS}<link rel="stylesheet" href="/css/figures.css?v=${VERSION}">`) : CSS, scripts: ['/js/manip.js'], i18n: ['js.manip-room', 'js.manip-chat'], bodyClass: 'manip-page',
    body: html`${tools}${jsonData('page-data', { role: req.manipRole, view: 'boards' })}
      <div id="manip" class="manip" data-role="${req.manipRole}"><p class="muted">${t('manip.loading')}</p></div>`,
  });
});

router.get('/api/manipulatives/state', (req, res) => {
  const u = req.user;
  // ?all=1: every template (the All boards page); the home gets the newest 100 and the count.
  if (req.manipRole === 'host') return res.json({ role: 'host', boards: M.listBoards(u, { all: req.query.all === '1' }), templateCount: M.countBoards(u), recent: M.listRecent(u), classes: M.hostClasses(u), sessions: M.hostSessions(u), draft: D.current(u), eta: D.eta() });
  res.json({ role: 'student', sessions: M.studentSessions(u).map(s => ({ id: s.id, tool: s.tool, title: s.title, status: s.status, className: s.class_name, joined: !!s.joined })) });
});

// ---- boards
router.post('/api/manipulatives/boards', hostOnly, rateLimit('manip-save', 120, 3600e3), (req, res) => send(req, res, M.saveBoard(req.user, body(req))));
router.post('/api/manipulatives/boards/autosave', hostOnly, rateLimit('manip-autosave', 900, 3600e3), (req, res) => {
  const { id, tool, title, state } = body(req);
  send(req, res, M.autosave(req.user, { id: typeof id === 'string' && id ? id : null, tool, title, state }));
});
router.get('/api/manipulatives/boards/:id', hostOnly, (req, res) => send(req, res, M.openBoard(req.user, req.params.id)));
router.post('/api/manipulatives/boards/:id/delete', hostOnly, (req, res) => send(req, res, M.deleteBoard(req.user, req.params.id)));
router.post('/api/manipulatives/boards/:id/rename', hostOnly, rateLimit('manip-rename', 120, 3600e3), (req, res) => send(req, res, M.renameBoard(req.user, req.params.id, body(req).title)));
router.post('/api/manipulatives/boards/:id/duplicate', hostOnly, rateLimit('manip-save', 120, 3600e3), (req, res) => send(req, res, M.duplicateBoard(req.user, req.params.id)));
router.get('/api/manipulatives/code/:code', rateLimit('manip-code', 60, 600e3), (req, res) => send(req, res, M.openCode(req.user, req.params.code)));

// ---- live sessions
router.post('/api/manipulatives/live', hostOnly, rateLimit('manip-live', 60, 3600e3), (req, res) => send(req, res, M.createSession(req.user, body(req))));
router.post('/api/manipulatives/live/join', rateLimit('manip-join', 30, 600e3), (req, res) => {
  const { code, id } = body(req);
  send(req, res, M.join(req.user, { code: typeof code === 'string' ? code : '', id: typeof id === 'string' ? id : '' }));
});
router.get('/api/manipulatives/live/:id', (req, res) => {
  const s = M.getSession(req.params.id);
  if (s && M.isSessionHost(req.user, s)) return res.json({ ok: true, role: 'teacher', session: M.teacherView(req.user, s.id) });
  const v = M.studentView(req.user, req.params.id);
  return v ? res.json({ ok: true, role: 'student', session: v }) : fail(req, res, 'notFound');
});
router.post('/api/manipulatives/live/:id/work', rateLimit('manip-work', 900, 3600e3), (req, res) => send(req, res, M.submitWork(req.user, req.params.id, body(req).state)));
router.post('/api/manipulatives/live/:id/push', hostOnly, rateLimit('manip-push', 120, 3600e3), (req, res) => send(req, res, M.push(req.user, req.params.id, body(req).boardId)));
router.post('/api/manipulatives/live/:id/end', hostOnly, (req, res) => send(req, res, M.end(req.user, req.params.id)));
router.post('/api/manipulatives/live/:id/reopen', hostOnly, rateLimit('manip-live', 60, 3600e3), (req, res) => send(req, res, M.reopen(req.user, req.params.id)));
router.post('/api/manipulatives/live/:id/rename', hostOnly, rateLimit('manip-rename', 120, 3600e3), (req, res) => send(req, res, M.renameSession(req.user, req.params.id, body(req).title)));
router.post('/api/manipulatives/live/:id/delete', hostOnly, (req, res) => send(req, res, M.deleteSession(req.user, req.params.id)));
router.get('/api/manipulatives/live/:id/export.pdf', hostOnly, rateLimit('manip-pdf', 60, 3600e3), (req, res) => {
  const r = M.exportPdf(req.user, req.params.id);
  if (!r.ok) return fail(req, res, r.code);
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${r.filename}"` }).send(r.pdf);
});

router.get('/api/manipulatives/live/:id/room', (req, res) => {
  const r = M.roomFor(req.user, req.params.id);
  return r ? res.json({ ok: true, room: r }) : fail(req, res, 'notFound');
});
router.post('/api/manipulatives/live/:id/area/:key', rateLimit('manip-area', 1800, 3600e3), (req, res) => send(req, res, M.saveArea(req.user, req.params.id, req.params.key, body(req).state)));
router.post('/api/manipulatives/live/:id/bring', hostOnly, rateLimit('manip-bring', 120, 3600e3), (req, res) => send(req, res, M.bring(req.user, req.params.id, body(req).view || {})));
router.post('/api/manipulatives/live/:id/step', rateLimit('manip-step', 600, 3600e3), (req, res) => send(req, res, M.step(req.user, req.params.id, { dir: body(req).dir, to: body(req).to ?? null })));
router.post('/api/manipulatives/live/:id/pace', hostOnly, (req, res) => send(req, res, M.pace(req.user, req.params.id, !!body(req).on)));
router.post('/api/manipulatives/live/:id/show', hostOnly, (req, res) => send(req, res, M.showWork(req.user, req.params.id, !!body(req).show)));
router.post('/api/manipulatives/live/:id/hand', (req, res) => send(req, res, M.hand(req.user, req.params.id, { up: !!body(req).up, key: typeof body(req).key === 'string' ? body(req).key : null })));
router.post('/api/manipulatives/live/:id/check', (req, res) => send(req, res, M.checkAnswers(req.user, req.params.id, body(req).answers)));
router.post('/api/manipulatives/live/:id/cursor', rateLimit('manip-cursor', 3600, 3600e3), (req, res) => send(req, res, M.moveCursor(req.user, req.params.id, body(req))));

// ---- the AI lesson drafter
// A draft runs on the server (services/manip-drafts.js): the answer is the job, and the page asks how it is going.
router.post('/api/manipulatives/draft', hostOnly, rateLimit('manip-ai', 30, 3600e3), (req, res) => {
  const { tool, brief, grade, task } = body(req);
  const r = D.start(req.user, { tool, brief, grade, task });
  return r.ok ? res.json({ ...r, eta: D.eta() }) : fail(req, res, r.code);
});
router.get('/api/manipulatives/draft', hostOnly, (req, res) => res.json({ ok: true, job: D.current(req.user), eta: D.eta() }));
router.post('/api/manipulatives/draft/:id/seen', hostOnly, (req, res) => send(req, res, D.seen(req.user, req.params.id)));

// ---- Oomba on the board: a chat about the open board (services/manip-chat.js); each message is one AI turn, a job
router.get('/api/manipulatives/chat', hostOnly, (req, res) => send(req, res, C.current(req.user, { tool: req.query.tool, boardId: req.query.boardId || null })));
router.post('/api/manipulatives/chat', hostOnly, rateLimit('manip-ai', 30, 3600e3), (req, res) => send(req, res, C.send(req.user, body(req))));
router.post('/api/manipulatives/chat/applied', hostOnly, (req, res) => send(req, res, C.applied(req.user, body(req))));

/** A student's class page: "Your teacher started a math board" while a session for this class is running. */
export function classBanner(req, c) {
  const s = M.studentSessions(req.user).find(x => x.class_id === c.id && x.status === 'active');
  if (!s) return '';
  const t = req.t;
  return html`<div class="notice good manip-class" role="status"><b>${ico('🧮', { size: 18 })} ${t('manip.class.banner')}</b> <span>${s.title}</span>
    <a class="btn btn-primary btn-sm" href="/manipulatives#join/${s.id}">${t('manip.class.join')}</a></div>`;
}
