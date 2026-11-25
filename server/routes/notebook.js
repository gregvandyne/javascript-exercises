// The student notebook (docs/decisions.md "Homeroom: the notebook"; services/notebook.js, public/js/notebook.js):
//   GET  /api/notebook                 the student's own notebook: tabs, pages, limits, whether a teacher reads it
//   POST /api/notebook/tabs            own tabs: { action: add, name } | { action: rename, id, name } | { action: delete, id }
//                                      | { action: move, id, dir }
//   POST /api/notebook/pages/:id       autosave a page: { body, drawing? } (rich text and pen strokes, cleaned on the server)
//   POST /api/notebook/handout         a handout's note area on the desk: { classId, handout } -> its page in the class tab
//   GET  /api/notebook/of/:studentId   a teacher of the student's class: the whole notebook, read only (403 for anyone else)
// The corner button's script goes on every full page for a student who keeps a notebook (views/layout.js onEveryPage).
import { Router } from 'express';
import { onEveryPage } from '../views/layout.js';
import { rateLimit } from '../services/ratelimit.js';
import * as NB from '../services/notebook.js';
import * as S from '../services/schools.js';
import * as HO from '../services/homeroom-handouts.js';

export const router = Router();
const STATUS = { notFound: 404, forbidden: 403, pageFull: 413, notebookFull: 413 };
const fail = (req, res, code) => res.status(STATUS[code] || 400).json({ error: req.t(`notebook.errors.${code}`), code });
const send = (req, res, r) => (r.ok ? res.json(r) : fail(req, res, r.code));
const body = req => (req.body && typeof req.body === 'object' ? req.body : {});
const quiet = (req, res, next) => { res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }); next(); };
router.use('/api/notebook', quiet);

router.get('/api/notebook', rateLimit('notebook-read', 600, 3600e3), (req, res) => send(req, res, NB.mine(req.user)));
router.post('/api/notebook/tabs', rateLimit('notebook-tabs', 300, 3600e3), (req, res) => send(req, res, NB.tabs(req.user, body(req))));
router.post('/api/notebook/pages/:id', rateLimit('notebook-save', 3000, 3600e3), (req, res) => send(req, res, NB.savePage(req.user, req.params.id, body(req).body, body(req).drawing)));
router.post('/api/notebook/handout', rateLimit('notebook-handout', 600, 3600e3), (req, res) => {
  const x = body(req), c = S.getClass(String(x.classId || ''));
  if (!c || !req.user) return fail(req, res, 'notFound');
  send(req, res, NB.handoutPage(req.user, c, x.handout, HO.deskView(c, req.user, req.locale)));
});
router.get('/api/notebook/of/:studentId', rateLimit('notebook-teacher', 600, 3600e3), (req, res) => send(req, res, NB.forTeacher(req.user, req.params.studentId)));

onEveryPage(req => (NB.canUse(req.user) ? '/js/notebook.js' : null));
