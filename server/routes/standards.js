// Standards beyond computer science (docs/decisions.md, 9 Nov 2026). Teacher tools only: every route checks the class
// (S.canManageClass) or the lesson (L.canEditLesson / L.canSeeShared) or school staff (S.isSchoolStaff); anyone else
// gets the 404 page / a 404 JSON, signed-out visitors the sign-in page / 401.
//   GET  /class/:id/standards?fw=ccss-math|ccss-ela[&grade=][&student=]   the class tab's Common Core view
//   GET  /class/:id/standards.csv?fw=ccss-math|ccss-ela                   its CSV (counts only, no names)
//   GET  /api/classes/:id/standards?fw=ccss-math|ccss-ela                 the same as JSON (for teachers' tools and tests)
//   GET  /teach/lessons/:id/standards[?fw=&grade=&domain=&q=&to=]          the lesson's standards picker
//   POST /api/lessons/:id/standards {framework, code, stepId}             tag the lesson ('' step) or a step
//   POST /api/lessons/:id/standards/remove {framework, code, stepId}      untag
//   GET  /api/standards/search?fw=&grade=&domain=&q=                      picker search (staff)
// Without ?fw= (or fw=csta) the class tab is the CSTA one in routes/cs-quest.js, unchanged: this router passes it on.
import { Router } from 'express';
import { html, raw } from '../views/html.js';
import { page, notFound, VERSION } from '../views/layout.js';
import { requireUser } from '../auth.js';
import { rateLimit } from '../services/ratelimit.js';
import * as S from '../services/schools.js';
import * as L from '../services/lessons.js';
import * as games from '../services/games.js';
import * as CC from '../services/standards-ccss.js';
import * as FW from '../standards/frameworks.js';
import * as OT from '../standards/official-tags.js';
import * as V from '../views/standards.js';
import { CSS as CSQ_CSS } from '../views/cs-quest.js';
import { classHeader, classBack } from './schools.js';

export const router = Router();
const CSS = raw(`${CSQ_CSS}<link rel="stylesheet" href="/css/standards.css?v=${VERSION}">`);
const b = req => req.body || {};
const fwOf = v => (FW.isCcss(String(v || '')) ? String(v) : null);
const no = (req, res) => (req.path.startsWith('/api/') ? res.status(404).json({ error: req.t('errors.api.notFound') }) : notFound(req, res));
const bad = (req, res, code) => res.status(code === 'notFound' ? 404 : 400).json({ error: req.t(code === 'notFound' ? 'errors.api.notFound' : `standards.errors.${code}`), code });
/** The class, when the viewer may manage it (its teachers, the school's admins). */
const managed = req => { const c = S.getClass(String(req.params.id || '')); return c && S.canManageClass(req.user, c) ? c : null; };
const titlesOf = slugs => new Map([...new Set(slugs)].map(s => [s, (games.getGameBySlug(s) || {}).title || s]));
const viewOf = (req, c, fw) => CC.classView(c.id, fw, { grade: String(req.query.grade || '') });
const gameSlugs = view => view.rows.flatMap(r => r.sources.games);

// ---------------------------------------------------------------- the class tab
router.get('/class/:id/standards', requireUser, (req, res, next) => {
  const fw = fwOf(req.query.fw); if (!fw || req.query.report === '1') return next();
  const c = managed(req); if (!c) return no(req, res);
  const t = req.t, view = viewOf(req, c, fw);
  const student = req.query.student ? view.students.find(p => p.id === String(req.query.student)) || null : null;
  const body = html`${classHeader(req, c, 'standards')}${V.frameworkPicker(req, c, fw)}<p class="muted csq-std-lead">${t('standards.class.lead')}</p>
    ${V.classBody(req, { c, view, student, gameTitles: titlesOf(gameSlugs(view)) })}`;
  page(req, res, { title: `${t('cs.standards.title')} · ${V.fwName(t, fw)} · ${c.name}`, active: 'classes', body, head: CSS, scripts: ['/js/schools.js', '/js/standards.js'], ...classBack(req, c) });
});
router.get('/class/:id/standards.csv', requireUser, (req, res, next) => {
  const fw = fwOf(req.query.fw); if (!fw) return next();
  const c = managed(req); if (!c) return no(req, res);
  const view = viewOf(req, c, fw);
  const file = `${c.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'class'}-${fw}.csv`;
  res.set('Content-Type', 'text/csv; charset=utf-8').set('Cache-Control', 'no-store')
    .set('Content-Disposition', `attachment; filename="standards.csv"; filename*=UTF-8''${encodeURIComponent(file)}`).send(V.classCsv(req.t, view, titlesOf(gameSlugs(view))));
});
router.get('/api/classes/:id/standards', requireUser, (req, res) => {
  const fw = fwOf(req.query.fw); const c = managed(req);
  if (!c) return no(req, res);
  if (!fw) return bad(req, res, 'badFramework');
  const v = viewOf(req, c, fw);
  res.set('Cache-Control', 'no-store').json({ framework: v.framework, grade: v.grade, notice: FW.NOTICE, summary: v.summary,
    students: v.students.map(p => ({ id: p.id, name: p.name, noData: p.noData })),
    rows: v.rows.map(r => ({ code: r.id, grade: r.grade, domain: r.domain, statement: r.statement, sources: r.sources, practiced: r.practiced, pct: r.pct, answered: r.answered,
      checkedStudents: r.checkedStudents, rubric: r.rubricMean, meets: r.meets, needsLook: r.needsLook, status: r.status,
      students: Object.fromEntries([...r.by].map(([id, x]) => [id, { level: x.level, practiced: x.practiced, right: x.right, answered: x.answered, rubric: x.rubric }])) })) });
});

// ---------------------------------------------------------------- the lesson's tags
router.get('/teach/lessons/:id/standards', requireUser, (req, res) => {
  const t = req.t, u = req.user;
  const l = L.getLesson(String(req.params.id));
  const edit = L.canEditLesson(u, l);
  if (!l || !(edit || L.canSeeShared(u, l))) return no(req, res);
  const framework = fwOf(req.query.fw) || 'ccss-math';
  const fw = FW.CCSS[framework];
  const steps = L.steps(l.id);
  const grade = fw.grades.includes(String(req.query.grade || '').toUpperCase()) ? String(req.query.grade).toUpperCase() : '';
  const domain = fw.domainsIn(grade).includes(String(req.query.domain || '').toUpperCase()) ? String(req.query.domain).toUpperCase() : '';
  const to = steps.some(s => s.id === String(req.query.to || '')) ? String(req.query.to) : '';
  const filters = { grade, domain, q: String(req.query.q || '').slice(0, 80), to };
  const results = fw.search({ q: filters.q, grade, domain, limit: 60 });
  const body = html`<div class="pagehead"><div><span class="small muted" dir="auto">${l.title}</span><h1>🎯 ${t('standards.lesson.title')}</h1>
    <p class="muted">${t('standards.lesson.lead')}</p></div><div class="row"><a class="btn" href="/teach/lessons/${l.id}">← ${t('standards.lesson.back')}</a></div></div>
    ${V.lessonBody(req, { l, steps, tags: CC.lessonTags(l.id), framework, filters, results, edit })}`;
  page(req, res, { title: `${t('standards.lesson.title')} · ${l.title}`, active: 'classes', mid: true, body, head: CSS, scripts: ['/js/schools.js', '/js/standards.js'], back: `/teach/lessons/${l.id}`, backLabel: l.title });
});
const LIMIT = rateLimit('lesson-standards', 600, 3600e3);
router.post('/api/lessons/:id/standards', requireUser, LIMIT, (req, res) => {
  const { framework, code, stepId } = b(req);
  const r = CC.addTag(req.user, String(req.params.id), { framework: String(framework || ''), code: String(code || ''), stepId: stepId ? String(stepId) : '' });
  return r.ok ? res.json({ ok: true, code: r.code, added: r.added }) : bad(req, res, r.code);
});
router.post('/api/lessons/:id/standards/remove', requireUser, LIMIT, (req, res) => {
  const { framework, code, stepId } = b(req);
  const r = CC.removeTag(req.user, String(req.params.id), { framework: String(framework || ''), code: String(code || ''), stepId: stepId ? String(stepId) : '' });
  return r.ok ? res.json({ ok: true, removed: r.removed }) : bad(req, res, r.code);
});
router.get('/api/standards/search', requireUser, (req, res) => {
  if (!S.isSchoolStaff(req.user)) return no(req, res);
  const framework = fwOf(req.query.fw); if (!framework) return bad(req, res, 'badFramework');
  const fw = FW.CCSS[framework];
  const r = fw.search({ q: String(req.query.q || '').slice(0, 80), grade: String(req.query.grade || ''), domain: String(req.query.domain || ''), limit: Math.min(200, +req.query.limit || 60) });
  res.json({ framework, notice: FW.NOTICE, total: r.total, list: r.list.map(s => ({ code: s.id, grade: s.grade, domain: s.domain, parent: s.parent || null, statement: s.statement })) });
});
/** The codes an official game practises, for staff (Learn cards, the lesson editor's game steps). */
router.get('/api/standards/games/:slug', requireUser, (req, res) => {
  if (!S.isSchoolStaff(req.user)) return no(req, res);
  const slug = String(req.params.slug);
  res.json(Object.fromEntries(FW.CCSS_IDS.map(f => [f, OT.gameCodes(slug, f)])));
});
