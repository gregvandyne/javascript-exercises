// Virtual math manipulatives (services/manipulatives.js; docs/decisions.md "Virtual math manipulatives"). Hidden while it
// is tested: every address here answers only someone services/manipulatives.js roleOf lets in (a host, or a student of
// a class with a session running); everyone else falls through to the site's normal 404. Never linked from any menu,
// the sitemap or search, and never indexed (X-Robots-Tag and the layout's noindex).
//   GET  /manipulatives                         the page (tools, tasks, live): the browser's public/js/manip.js
//   GET  /api/manipulatives/state               what the page starts from: role, own boards, classes, sessions
//   POST /api/manipulatives/boards              a host saves a board (it gets a share code)
//   GET  /api/manipulatives/boards/:id          one of the host's own boards;  POST .../boards/:id/delete (owner only)
//   GET  /api/manipulatives/code/:code          a share code: a copy for the opener's own board
//   POST /api/manipulatives/live                a host starts a session for one of their classes
//   POST /api/manipulatives/live/join           a student joins (by code, or by id from their class)
//   GET  /api/manipulatives/live/:id            the session's teacher: every joined student's board; a student: their own
//   POST /api/manipulatives/live/:id/work       a student sends their board (autosave)
//   POST /api/manipulatives/live/:id/push       the teacher pushes one of their saved boards to every student
//   POST /api/manipulatives/live/:id/end        the teacher ends the session
//   GET  /api/manipulatives/live/:id/export.pdf the teacher's PDF of the students' work
//   POST /api/manipulatives/draft               a host asks the AI to draft a lesson board
import { Router } from 'express';
import { html, raw, jsonData } from '../views/html.js';
import { page, VERSION } from '../views/layout.js';
import { rateLimit } from '../services/ratelimit.js';
import * as M from '../services/manipulatives.js';

export const router = Router();
const STATUS = { notFound: 404, ended: 409, aiFailed: 503, tooBig: 413 };
const fail = (req, res, code) => res.status(STATUS[code] || 400).json({ error: req.t(`manip.errors.${code}`), code });
const send = (req, res, r) => (r.ok ? res.json(r) : fail(req, res, r.code));
const body = req => (req.body && typeof req.body === 'object' ? req.body : {});

// The gate: anyone else goes on to the next router, and so to the site's 404 (the page's, or the API's JSON one).
router.use(['/manipulatives', '/api/manipulatives'], (req, res, next) => {
  const role = M.roleOf(req.user);
  if (!role) return next('router');
  req.manipRole = role;
  res.set({ 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' });
  next();
});
const hostOnly = (req, res, next) => (req.manipRole === 'host' ? next() : fail(req, res, 'notFound'));

const CSS = raw(`<link rel="stylesheet" href="/css/manipulatives.css?v=${VERSION}">`);
router.get('/manipulatives', (req, res) => {
  const t = req.t;
  page(req, res, {
    title: t('manip.title'), active: null, head: CSS, scripts: ['/js/manip.js'], bodyClass: 'manip-page',
    body: html`${jsonData('page-data', { role: req.manipRole })}
      <div id="manip" class="manip" data-role="${req.manipRole}"><p class="muted">${t('manip.loading')}</p></div>`,
  });
});

router.get('/api/manipulatives/state', (req, res) => {
  const u = req.user;
  if (req.manipRole === 'host') return res.json({ role: 'host', boards: M.listBoards(u), classes: M.hostClasses(u), sessions: M.hostSessions(u) });
  res.json({ role: 'student', sessions: M.studentSessions(u).map(s => ({ id: s.id, tool: s.tool, title: s.title, status: s.status, className: s.class_name, joined: !!s.joined })) });
});

// ---- boards
router.post('/api/manipulatives/boards', hostOnly, rateLimit('manip-save', 120, 3600e3), (req, res) => send(req, res, M.saveBoard(req.user, body(req))));
router.get('/api/manipulatives/boards/:id', hostOnly, (req, res) => {
  const b = M.ownBoard(req.user, req.params.id);
  return b ? res.json({ ok: true, board: b }) : fail(req, res, 'notFound');
});
router.post('/api/manipulatives/boards/:id/delete', hostOnly, (req, res) => send(req, res, M.deleteBoard(req.user, req.params.id)));
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
router.get('/api/manipulatives/live/:id/export.pdf', hostOnly, rateLimit('manip-pdf', 60, 3600e3), (req, res) => {
  const r = M.exportPdf(req.user, req.params.id);
  if (!r.ok) return fail(req, res, r.code);
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${r.filename}"` }).send(r.pdf);
});

// ---- the AI lesson drafter
router.post('/api/manipulatives/draft', hostOnly, rateLimit('manip-ai', 30, 3600e3), async (req, res) => {
  const { tool, brief, grade, task } = body(req);
  send(req, res, await M.draftLesson(req.user, { tool, brief, grade, task }));
});

/** A student's class page: "Your teacher started a math board" while a session for this class is running. */
export function classBanner(req, c) {
  const s = M.studentSessions(req.user).find(x => x.class_id === c.id && x.status === 'active');
  if (!s) return '';
  const t = req.t;
  return html`<div class="notice good manip-class" role="status"><b>🧮 ${t('manip.class.banner')}</b> <span>${s.title}</span>
    <a class="btn btn-primary btn-sm" href="/manipulatives#join/${s.id}">${t('manip.class.join')}</a></div>`;
}
