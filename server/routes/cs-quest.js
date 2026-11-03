// CS Quest routes (docs/cs-quest.md "Curriculum"): the catalogue as JSON for the teacher pages, the materialiser
// ("Add to my library": one lesson, a unit or a path), assigning a unit to a class with a start date and a cadence
// (P17), resetting a copy to the catalogue version (P21) and the Builder status line (P18). Staff of a school only
// (by membership); the pages themselves (/teach/cs-quest, the plan page, the coverage map, the Standards tab) mount
// here in the pages stage. Mounted before the lesson routes in server/app.js so /api/lessons/from-template is not read
// as /api/lessons/:id.
import { Router } from 'express';
import { requireUser } from '../auth.js';
import { rateLimit } from '../services/ratelimit.js';
import { config } from '../config.js';
import * as S from '../services/schools.js';
import * as L from '../services/lessons.js';
import * as T from '../services/lesson-templates.js';
import { builderStatus } from '../services/builder-status.js';
import { liveOn } from '../services/classlive-sessions.js';

export const router = Router();
const b = req => req.body || {};
/** A JSON refusal: { error (errors.api.badRequest / notFound), code } with the code the service gave. */
const bad = (req, res, code, status = 400) => res.status(status).json({ error: req.t(status === 404 ? 'errors.api.notFound' : 'errors.api.badRequest'), code });
const send = (req, res, r, shape = x => x) => (r.ok ? res.json(shape(r)) : bad(req, res, r.code, r.code === 'notFound' ? 404 : 400));
/** Staff of some school, by membership (the platform admin has no library of their own). */
const staffOnly = (req, res, next) => (S.isSchoolStaff(req.user) ? next() : bad(req, res, 'notFound', 404));
const staffSchools = u => S.schoolsOf(u.id).filter(s => s.role !== 'student');
/** The school a request works in: schoolId (body or query) when the user is staff there, else their first staff school. */
function schoolFor(req) {
  const schools = staffSchools(req.user), want = String(b(req).schoolId || req.query.schoolId || '');
  return (want && schools.find(s => s.id === want)) || schools[0] || null;
}
const bandOf = v => { const s = String(v == null ? '' : v).trim().toUpperCase(); return s === '1B' || s === '2' ? s : null; };
const isoDay = t => (t ? new Date(t).toISOString().slice(0, 10) : null);
const lessonJson = l => ({ id: l.id, title: l.title, grade: l.grade, subject: l.subject, folderId: l.folder_id, templateKey: l.template_key, templateVersion: l.template_version, url: `/teach/lessons/${l.id}` });
const statusJson = st => (st ? { inLibrary: st.inLibrary, updateAvailable: st.updateAvailable, version: st.version, lessonId: st.current ? st.current.id : null, lessonVersion: st.current ? st.current.template_version : null, copies: st.copies.length } : null);
const oneResult = r => ({ ok: true, lesson: lessonJson(r.lesson), created: r.created, notes: r.notes, sets: { warmup: r.sets.warmup ? r.sets.warmup.id : null, exit: r.sets.exit ? r.sets.exit.id : null, review: r.sets.review ? r.sets.review.id : null } });
const manyResult = r => ({ ok: true, lessons: r.lessons.map(x => ({ key: x.key, created: x.created, notes: x.notes, ...lessonJson(x.lesson) })), skipped: r.skipped, missing: r.missing || [] });

// ---------------------------------------------------------------- the catalogue as JSON (teacher pages)
/** The program for the signed-in teacher: units, lessons (with library status in the school), paths, flags, Builder status. */
router.get('/api/cs-quest/catalog', requireUser, staffOnly, (req, res) => {
  const cat = T.catalogue(), school = schoolFor(req);
  const lib = T.libraryStatus(req.user, school ? school.id : null);
  const units = cat.units.map(u => ({
    n: u.n, title: u.title, tool: u.tool, optional: !!u.optional, needsSchoolPlan: !!u.needsSchoolPlan,
    lessons: u.lessons.map(l => ({
      n: l.n, order: l.order, title: l.title, short: l.short, main: l.main, warmup: l.warmup, primary: l.primary, also: l.also, buildsToward: l.buildsToward,
      bands: Object.fromEntries(T.BANDS.map(band => { const key = l.keys[band], tpl = T.getTemplate(key); return [band, { key, file: !!tpl, version: tpl ? tpl.version : null, questCode: tpl ? tpl.questCode : null, params: tpl ? tpl.params : null, status: statusJson(lib.get(key)) }]; })),
    })),
  }));
  res.json({
    program: cat.program, bands: cat.bands, school: school ? { id: school.id, name: school.name } : null, schools: staffSchools(req.user).map(s => ({ id: s.id, name: s.name })),
    units, paths: cat.paths, period: cat.period, periodVariants: cat.periodVariants, rules: cat.rules, materials: cat.materials, faq: cat.faq,
    missing: cat.missing, banks: cat.banks.size, flags: { quizSteps: !!config.quizSteps, live: liveOn() }, builder: builderStatus(),
  });
});
/** One lesson file (the plan page's data) with its library status. */
router.get('/api/cs-quest/lessons/:key', requireUser, staffOnly, (req, res) => {
  const tpl = T.getTemplate(req.params.key); if (!tpl) return bad(req, res, 'notFound', 404);
  const school = schoolFor(req);
  res.json({ lesson: tpl, setTitles: T.setTitles(tpl), status: statusJson(T.status(req.user, school ? school.id : null, tpl.key)), banks: !!T.bankOf(tpl.exit.setId), builder: tpl.unit === 7 ? builderStatus() : undefined });
});
/** The coverage map (44 ids -> lessons, steps, chapters, items, rubric lines, practices). */
router.get('/api/cs-quest/coverage', requireUser, staffOnly, (req, res) => res.json(T.coverage()));
/** The Builder status line for unit-7 plan pages: { on, state, why, resetsAt, teamsPerPeriod, pools }. No prices anywhere. */
router.get('/api/cs-quest/builder-status', requireUser, staffOnly, (req, res) => res.json(builderStatus()));

// ---------------------------------------------------------------- the materialiser: Add to my library
const LIMIT = rateLimit('lesson-new', 120, 3600e3);
const schoolOr404 = (req, res) => { const school = schoolFor(req); if (!school) bad(req, res, 'notFound', 404); return school; };
const opts = req => ({ again: b(req).again === true || b(req).again === '1' || b(req).again === 1 });
/** One lesson: { schoolId?, again? } -> { ok, lesson, created, notes, sets }. */
router.post('/api/lessons/from-template/:key', requireUser, staffOnly, LIMIT, (req, res) => {
  const school = schoolOr404(req, res); if (!school) return;
  send(req, res, T.materialise(req.user, school.id, req.params.key, opts(req)), oneResult);
});
/** A whole unit: { band: '1b' | '2', schoolId?, again? } -> { ok, lessons, skipped, missing }. */
router.post('/api/lessons/from-template/unit/:unit', requireUser, staffOnly, LIMIT, (req, res) => {
  const school = schoolOr404(req, res); if (!school) return;
  const band = bandOf(b(req).band); if (!band) return bad(req, res, 'band');
  send(req, res, T.materialiseUnit(req.user, school.id, req.params.unit, band, opts(req)), manyResult);
});
/** A published path (core10-no-builder, full, cs-ed-week, device-first): { band, schoolId?, again? }. */
router.post('/api/lessons/from-template/path/:path', requireUser, staffOnly, LIMIT, (req, res) => {
  const school = schoolOr404(req, res); if (!school) return;
  const band = bandOf(b(req).band); if (!band) return bad(req, res, 'band');
  send(req, res, T.materialisePath(req.user, school.id, req.params.path, band, opts(req)), manyResult);
});
/** The same three through one body: { key } | { keys: [...] } | { unit, band } | { path, band }, plus schoolId? and again?. */
router.post('/api/lessons/from-template', requireUser, staffOnly, LIMIT, (req, res) => {
  const school = schoolOr404(req, res); if (!school) return;
  const body = b(req), o = opts(req);
  if (body.key) return send(req, res, T.materialise(req.user, school.id, body.key, o), oneResult);
  if (Array.isArray(body.keys)) { if (!body.keys.length || body.keys.length > 60) return bad(req, res, 'badRequest'); return send(req, res, T.materialiseMany(req.user, school.id, body.keys.map(String), o), manyResult); }
  const band = bandOf(body.band);
  if (body.unit !== undefined && body.unit !== '') { if (!band) return bad(req, res, 'band'); return send(req, res, T.materialiseUnit(req.user, school.id, body.unit, band, o), manyResult); }
  if (body.path) { if (!band) return bad(req, res, 'band'); return send(req, res, T.materialisePath(req.user, school.id, body.path, band, o), manyResult); }
  return bad(req, res, 'badRequest');
});
/** Reset to the CS Quest version (P21): a fresh copy takes over the old copy's class assignments and dates. */
router.post('/api/lessons/:id/reset-template', requireUser, staffOnly, LIMIT, (req, res) => send(req, res, T.resetLesson(req.user, req.params.id), r => ({
  ok: true, lesson: lessonJson(r.lesson), old: lessonJson(r.old), moved: r.moved.map(m => ({ classId: m.classId, classLessonId: m.classLesson.id })), kept: r.kept, notes: r.notes,
})));

// ---------------------------------------------------------------- assign a unit with a cadence (P17)
/**
 * Body: the lessons as { lessonIds: [...] } (library lessons), { keys: [...] } (catalogue keys: materialised first when
 * needed) or { unit, band } (the whole unit, materialised first); the class unit as { unitId } (an existing one),
 * { unitName } (found or made) or, with { unit }, the catalogue unit's name; then { start: 'YYYY-MM-DD' (today when
 * empty), cadence: daily | weekdays | weekly | twice-weekly (weekdays), dueDays? }.
 * -> { ok, unit: { id, name } | null, assigned: [{ lessonId, key?, classLessonId, opensAt, dueAt, restored }], skipped, materialised, missing }
 */
router.post('/api/classes/:id/assign-unit', requireUser, staffOnly, LIMIT, (req, res) => {
  const u = req.user, c = S.getClass(req.params.id);
  if (!c || c.archived_at || !S.canManageClass(u, c)) return bad(req, res, 'notFound', 404);
  const body = b(req), band = bandOf(body.band);
  let lessonIds = [], keyOf = new Map(), materialised = [], missing = [], unitName = typeof body.unitName === 'string' ? body.unitName.trim() : '';
  if (Array.isArray(body.lessonIds) && body.lessonIds.length) lessonIds = body.lessonIds.map(String);
  else {
    let keys = null;
    if (Array.isArray(body.keys) && body.keys.length) keys = body.keys.map(String);
    else if (body.unit !== undefined && body.unit !== '') {
      if (!band) return bad(req, res, 'band');
      const k = T.unitKeys(body.unit, band); if (!k) return bad(req, res, 'notFound', 404);
      keys = k.keys; missing = k.missing;
      if (!unitName) { const un = T.unitOf(body.unit); unitName = `Unit ${un.n} · ${un.title}`; }
    } else if (body.path) {
      if (!band) return bad(req, res, 'band');
      const k = T.pathKeys(body.path, band); if (!k) return bad(req, res, 'notFound', 404);
      keys = k.keys; missing = k.missing;
      if (!unitName) unitName = T.pathOf(body.path).title;
    }
    if (!keys) return bad(req, res, 'badRequest');
    if (keys.length > 60) return bad(req, res, 'badRequest');
    const m = T.materialiseMany(u, c.school_id, keys);
    for (const x of m.lessons) { lessonIds.push(x.lesson.id); keyOf.set(x.lesson.id, x.key); if (x.created) materialised.push({ key: x.key, lessonId: x.lesson.id, notes: x.notes }); }
    if (m.skipped.length && !m.lessons.length) return bad(req, res, m.skipped[0].code, m.skipped[0].code === 'notFound' ? 404 : 400);
  }
  let unit = null;
  if (body.unitId) { unit = L.getUnit(String(body.unitId)); if (!unit || unit.class_id !== c.id) return bad(req, res, 'notFound', 404); }
  else if (unitName) {
    unit = L.unitsOf(c.id).find(x => x.name === unitName.slice(0, 60)) || null;
    if (!unit) { const r = L.createUnit(u, c.id, unitName); if (!r.ok) return bad(req, res, r.code); unit = r.unit; }
  }
  const r = L.assignUnitWithCadence(u, c.id, lessonIds, { unitId: unit ? unit.id : null, start: body.start || null, cadence: body.cadence || 'weekdays', dueDays: body.dueDays === undefined ? null : body.dueDays });
  if (!r.ok) return bad(req, res, r.code, r.code === 'notFound' ? 404 : 400);
  res.json({
    ok: true, unit: unit ? { id: unit.id, name: unit.name } : null,
    assigned: r.assigned.map(a => ({ lessonId: a.lessonId, key: keyOf.get(a.lessonId) || null, classLessonId: a.classLesson.id, opensAt: isoDay(a.opensAt), dueAt: isoDay(a.dueAt), restored: !!a.restored })),
    skipped: r.skipped.map(s => ({ ...s, key: keyOf.get(s.lessonId) || null })), materialised, missing,
  });
});
