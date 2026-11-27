// Grammar Lab for teachers (services/grammar-lab-assign.js; views/grammar-lab-teach.js): the units to assign
// (/teach/grammar-lab) and the Assign API, a class's grid (/class/:id/grammar-lab), one student's view with their
// starting grades (/class/:id/grammar-lab/:student) and the band override API. Every path answers the normal 404 unless
// GRAMMAR_LAB lets the teacher in (services/grammar-lab-access.js mayAssignGrammarLab): with the flag off, for everyone.
// POSTs are same-origin only (csrfCheck in app.js). No plan gate: the ready-made courses are assigned without the
// Teacher plan, so Grammar Lab is too (services/grammar-lab-assign.js).
import { Router } from 'express';
import { requireUser } from '../auth.js';
import { rateLimit } from '../services/ratelimit.js';
import { html } from '../views/html.js';
import { page, notFound } from '../views/layout.js';
import * as S from '../services/schools.js';
import * as H from '../services/homeroom.js';
import * as GL from '../services/grammar-lab.js';
import * as GLA from '../services/grammar-lab-assign.js';
import { mayAssignGrammarLab, grammarLabOn } from '../services/grammar-lab-access.js';
import { classHeader, classBack } from './schools.js';
import * as V from '../views/grammar-lab-teach.js';

export const router = Router();
const b = req => req.body || {};
const bad = (req, res, code, status = 400) => res.status(status).json({ error: req.t(ERR[code] || (status === 404 ? 'errors.api.notFound' : 'errors.api.badRequest')), code });
const ERR = { noClass: 'grammarLab.teach.errNoClass', badDate: 'grammarLab.teach.errDate', noRoom: 'grammarLab.teach.errNoRoom', alreadyAssigned: 'grammarLab.teach.errAgain', notInClass: 'grammarLab.teach.errStudent', badBand: 'errors.api.badRequest' };
/** The flag first: off, every path here is the normal 404 (never a sign-in page that says it exists). */
const flagOn = (req, res, next) => (grammarLabOn() ? next() : req.path.startsWith('/api/') ? bad(req, res, 'notFound', 404) : notFound(req, res));
const teacherOnly = (req, res, next) => (mayAssignGrammarLab(req.user) && S.isSchoolStaff(req.user) ? next() : req.path.startsWith('/api/') ? bad(req, res, 'notFound', 404) : notFound(req, res));
/** The class a /class/:id/grammar-lab page or API is about, when the teacher may see it; else the 404 (sent). */
function classOf(req, res) {
  const c = S.getClass(String(req.params.id || ''));
  if (GLA.canView(req.user, c)) return c;
  if (req.path.startsWith('/api/')) bad(req, res, 'notFound', 404); else notFound(req, res);
  return null;
}
/** Who in the class (the dialog's choice): 'all' -> [] (the whole class, whoever joins later too), 'group:<id>' -> its
 *  members, 'desk:<id>' -> that student. -> [ids] | null */
function studentsOf(c, to) {
  const v = String(to || 'all');
  if (v === 'all') return [];
  const room = H.roomOf(c.id), ids = room.students.map(s => s.id);
  if (v.startsWith('desk:')) { const id = v.slice(5); return ids.includes(id) ? [id] : null; }
  if (v.startsWith('group:')) { const gid = v.slice(6); const list = ids.filter(id => room.members[id] === gid); return list.length ? list : null; }
  return null;
}
/** The teacher's classes for the dialog, each with its groups (those with students) and students, in roster order. */
function dialogClasses(req) {
  return GLA.assignClasses(req.user).map(c => {
    const room = H.roomOf(c.id);
    const groups = room.groups.filter(g => room.students.some(s => room.members[s.id] === g.id)).map(g => ({ id: g.id, name: g.name || (g.key ? req.t(`js.homeroom.groups.${g.key}`) : g.id) }));
    return { id: c.id, name: c.name, groups, students: room.students };
  });
}

// ---------------------------------------------------------------- the units to assign
router.get('/teach/grammar-lab', flagOn, requireUser, teacherOnly, (req, res) => {
  const t = req.t, band = GL.BAND_IDS.includes(req.query.band) ? req.query.band : 'k-2';
  page(req, res, { title: t('grammarLab.teach.h1'), active: 'learn', head: V.HEAD,
    body: V.teachPage({ t, band, units: GL.pathwaysOf(band), classes: dialogClasses(req) }), scripts: ['/js/grammar-lab-teach.js'] });
});
/** Assign: { classId, what: 'unit' | 'topic' | 'room', unit, band, topic?, to ('all' | 'group:<id>' | 'desk:<id>'), dueAt? }. */
router.post('/api/grammar-lab/assign', flagOn, requireUser, teacherOnly, rateLimit('lesson-new', 120, 3600e3), (req, res) => {
  const x = b(req), c = S.getClass(String(x.classId || ''));
  if (!GLA.canAssignTo(req.user, c)) return bad(req, res, 'noClass');
  const students = studentsOf(c, x.to);
  if (!students) return bad(req, res, 'notInClass');
  const topic = typeof x.topic === 'string' && x.topic ? x.topic : null;
  const tp = topic ? GL.topic(topic) : null;
  const r = GLA.assign(req.user, { classId: c.id, what: String(x.what || ''), unit: String(x.unit || ''), band: typeof x.band === 'string' ? x.band : null, topic,
    students, dueAt: x.dueAt ? String(x.dueAt) : null, roomTitle: tp ? req.t('grammarLab.teach.roomTitle', { topic: tp.title }) : null });
  if (!r.ok) return bad(req, res, r.code, r.code === 'notFound' ? 404 : 400);
  res.json({ ok: true, classLessonId: r.classLesson.id, toast: req.t('grammarLab.teach.done', { title: r.title, class: c.name }) });
});

// ---------------------------------------------------------------- a class's grid, one student
router.get('/class/:id/grammar-lab', flagOn, requireUser, (req, res) => {
  const c = classOf(req, res); if (!c) return;
  const t = req.t, g = GLA.classGrid(c, { unit: String(req.query.unit || ''), band: String(req.query.band || '') });
  const body = html`${classHeader(req, c, 'progress')}<h2 class="glt-gridh">🔤 ${t('grammarLab.teach.gridTitle')}</h2><p class="muted">${t('grammarLab.teach.gridLead')}</p>
    <p class="row"><a class="btn btn-sm" href="/class/${c.id}/progress">${t('grammarLab.teach.backProgress')}</a><a class="btn btn-sm" href="/teach/grammar-lab">${t('grammarLab.teach.assignSome')}</a></p>${V.gridBody({ t, c, g })}`;
  page(req, res, { title: `${t('grammarLab.teach.gridTitle')} · ${c.name}`, active: 'classes', head: V.CLASS_HEAD, body, scripts: ['/js/schools.js'], ...classBack(req, c) });
});
router.get('/class/:id/grammar-lab/:student', flagOn, requireUser, (req, res) => {
  const c = classOf(req, res); if (!c) return;
  const s = GLA.studentIn(c, req.params.student); if (!s) return notFound(req, res);
  const t = req.t, v = GLA.studentView(c, s);
  page(req, res, { title: `${t('grammarLab.teach.gridTitle')} · ${c.name}`, active: 'classes', head: V.CLASS_HEAD,
    body: html`${classHeader(req, c, 'progress')}${V.studentBody({ t, f: req.fmt, c, v })}`, scripts: ['/js/schools.js'], ...classBack(req, c) });
});
/** A student's starting grades: { student, band ('' = the student's grade's) }. A teacher's choice is absolute. */
router.post('/api/class/:id/grammar-lab/band', flagOn, requireUser, rateLimit('grammar-lab-band', 60, 60e3), (req, res) => {
  const c = classOf(req, res); if (!c) return;
  const r = GLA.setBand(req.user, c, String(b(req).student || ''), String(b(req).band ?? ''));
  if (!r.ok) return bad(req, res, r.code, r.code === 'notFound' ? 404 : 400);
  res.json({ ok: true, place: r.place, toast: req.t('grammarLab.teach.placeSaved') });
});
