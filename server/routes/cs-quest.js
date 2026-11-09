// CS Quest routes (docs/cs-quest.md "Curriculum" and "Teacher pages"): the catalogue as JSON for the teacher pages, the
// materialiser ("Add to my library": one lesson, a unit or a path), assigning a unit to a class with a start date and a
// cadence (P17), resetting a copy to the catalogue version (P21), the Builder status line (P18), and the pages: the public
// program page /teachers/cs-quest, the signed-in program page /teach/cs-quest, the plan page /teach/cs-quest/:key with its
// print view (?print=1), printables (?sheet=) and projector questions (?projector=), and the coverage map
// /teach/cs-quest/coverage. Staff of a school only (by membership), except the public page. Mounted before the lesson
// routes in server/app.js so /api/lessons/from-template is not read as /api/lessons/:id.
import { Router } from 'express';
import { requireUser } from '../auth.js';
import { rateLimit } from '../services/ratelimit.js';
import { config } from '../config.js';
import { html, raw } from '../views/html.js';
import { page, notFound, VERSION } from '../views/layout.js';
import * as S from '../services/schools.js';
import * as L from '../services/lessons.js';
import * as T from '../services/lesson-templates.js';
import * as CSTA from '../standards/csta.js';
import * as seo from '../seo.js';
import { builderStatus } from '../services/builder-status.js';
import { liveOn } from '../services/classlive-sessions.js';
import { canHost as liveCanHost } from '../services/classlive-access.js';
import { el, lp, faqBlock, launchGame } from './teachers.js';
import { zoneNote } from './lessons.js';
import * as V from '../views/cs-quest.js';
import { crewArt } from '../views/components.js';
import { printBody, sheetBody, projectorBody } from '../views/cs-quest-sheets.js';
import * as STD from '../services/standards.js';
import { classBody as standardsBody, classCsv as standardsCsv, reportBody as standardsReport } from '../views/cs-quest-standards.js';
import { classHeader, classBack } from './schools.js';
import { frameworkPicker } from '../views/standards.js';
import { markCheck } from '../services/teach-loop.js';

export const router = Router();
const b = req => req.body || {};
/** A JSON refusal: { error (errors.api.badRequest / notFound), code } with the code the service gave. */
const bad = (req, res, code, status = 400) => res.status(status).json({ error: req.t(status === 404 ? 'errors.api.notFound' : 'errors.api.badRequest'), code });
const send = (req, res, r, shape = x => x) => (r.ok ? res.json(shape(r)) : bad(req, res, r.code, r.code === 'notFound' ? 404 : 400));
/** Staff of some school, by membership (the platform admin has no library of their own). */
const staffOnly = (req, res, next) => (S.isSchoolStaff(req.user) ? next() : bad(req, res, 'notFound', 404));
/** The same for pages: the 404 page with the "for teachers" line. */
const staffPage = (req, res, next) => (S.isSchoolStaff(req.user) ? next() : notFound(req, res, req.t('school.errors.notTeacher')));
const staffSchools = u => S.schoolsOf(u.id).filter(s => s.role !== 'student');
/** The school a request works in: schoolId (body or query) when the user is staff there, else their first staff school. */
function schoolFor(req) {
  const schools = staffSchools(req.user), want = String(b(req).schoolId || req.query.schoolId || req.query.school || '');
  return (want && schools.find(s => s.id === want)) || schools[0] || null;
}
const bandOf = v => { const s = String(v == null ? '' : v).trim().toUpperCase(); return s === '1B' || s === '2' ? s : null; };
const isoDay = t => (t ? new Date(t).toISOString().slice(0, 10) : null);
const lessonJson = l => ({ id: l.id, title: l.title, grade: l.grade, subject: l.subject, folderId: l.folder_id, templateKey: l.template_key, templateVersion: l.template_version, url: `/teach/lessons/${l.id}` });
const statusJson = st => (st ? { inLibrary: st.inLibrary, updateAvailable: st.updateAvailable, version: st.version, lessonId: st.current ? st.current.id : null, lessonVersion: st.current ? st.current.template_version : null, copies: st.copies.length } : null);
const oneResult = r => ({ ok: true, lesson: lessonJson(r.lesson), created: r.created, notes: r.notes, sets: { warmup: r.sets.warmup ? r.sets.warmup.id : null, exit: r.sets.exit ? r.sets.exit.id : null, review: r.sets.review ? r.sets.review.id : null } });
const manyResult = r => ({ ok: true, lessons: r.lessons.map(x => ({ key: x.key, created: x.created, notes: x.notes, ...lessonJson(x.lesson) })), skipped: r.skipped, missing: r.missing || [] });
/** The classes a teacher can assign to in a school: the ones they teach, plus (school admins) every other class there. */
function classesFor(u, schoolId) {
  const mine = S.classesOf(u.id, 'teacher').filter(c => c.school_id === schoolId);
  const more = S.canManageSchool(u, schoolId) ? S.classesOfSchool(schoolId).filter(c => !mine.some(x => x.id === c.id)) : [];
  return [...mine.map(c => ({ ...c, teaches: true })), ...more.map(c => ({ ...c, teaches: false }))];
}
const CS_GAMES = ['robo-route', 'data-detective', 'packet-post', 'inside-the-machine'];
const publishedMap = slugs => Object.fromEntries(slugs.map(s => [s, T.publishedGame(s)]));

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
/** Switch on the game: text steps that stood in for a game that is published now become game steps in place. */
router.post('/api/lessons/:id/switch-on-games', requireUser, staffOnly, LIMIT, (req, res) => send(req, res, T.switchOnGames(req.user, req.params.id), r => ({
  ok: true, switched: r.switched, toast: req.t('cs.state.gamesOn', { count: r.switched }),
})));

// ---------------------------------------------------------------- the plan page's buttons: live, assign
/** The copy of a lesson file in the teacher's library for the school, made when missing. -> { lesson, sets, steps } | null */
function copyOf(u, schoolId, tpl) {
  const r = T.materialise(u, schoolId, tpl.key);
  return r.ok ? { lesson: r.lesson, sets: r.sets, steps: r.steps || L.steps(r.lesson.id) } : null;
}
/**
 * Where a live button goes: { what: 'warmup' | 'exit' | 'review' | 'wyr', classId?, schoolId? } -> { ok, redirect }.
 * The lesson is materialised first (its derived sets live in the teacher's My sets), then /live is preselected: the
 * band's mode (Quest Race at 1B, Question Battle at 2) with the warm-up set, Question Battle with the exit set, Brain
 * Board with the unit review, or Would You Rather with the lesson's starter; with a class picked, and bound to the
 * lesson's step when the class has the lesson (the run then writes the gradebook cell).
 */
router.post('/api/cs-quest/lessons/:key/live', requireUser, staffOnly, LIMIT, (req, res) => {
  if (!liveOn() || !liveCanHost(req.user)) return bad(req, res, 'liveOff', 404);
  const tpl = T.getTemplate(req.params.key), school = schoolFor(req);
  if (!tpl || !school) return bad(req, res, 'notFound', 404);
  const what = String(b(req).what || ''), classId = String(b(req).classId || '');
  const c = classId ? S.getClass(classId) : null;
  if (classId && (!c || c.school_id !== school.id || !S.canManageClass(req.user, c))) return bad(req, res, 'notFound', 404);
  const copy = copyOf(req.user, school.id, tpl); if (!copy) return bad(req, res, 'notFound', 404);
  const q = new URLSearchParams();
  const stepFor = slug => copy.steps.find(s => s.kind === 'game' && s.game_slug === slug);
  let step = null;
  if (what === 'warmup' && tpl.warmup && copy.sets.warmup) { q.set('mode', V.WARMUP_MODE[tpl.band]); q.set('set', copy.sets.warmup.id); step = stepFor(T.WARMUP_GAME[tpl.band]); }
  else if (what === 'exit' && copy.sets.exit) { q.set('mode', 'battle'); q.set('set', copy.sets.exit.id); }
  else if (what === 'review' && copy.sets.review) { q.set('mode', 'board'); q.set('set', copy.sets.review.id); }
  else if (what === 'wyr' && tpl.play && tpl.play.type === 'live') { q.set('mode', 'wyr'); if (tpl.play.starter) q.set('starter', tpl.play.starter); step = stepFor(T.WYR_SLUG); }
  else return bad(req, res, what === 'warmup' || what === 'exit' || what === 'review' ? 'bankMissing' : 'badRequest');
  let note = null;
  if (c) {
    q.set('class', c.id);
    const cl = step && L.assignedClasses(copy.lesson.id).find(a => a.class_id === c.id && !a.archived_at);
    if (cl) { q.set('cl', cl.id); q.set('step', step.id); } else if (step) note = req.t('cs.plan.liveNotAssigned');
  }
  res.json({ ok: true, redirect: `/live?${q}`, ...(note ? { note, toast: note } : {}) });
});
/** Assign to class: { classId, opensAt?, dueAt?, unitId?, schoolId? }: the lesson is materialised first, then assigned. */
router.post('/api/cs-quest/lessons/:key/assign', requireUser, staffOnly, LIMIT, (req, res) => {
  const tpl = T.getTemplate(req.params.key), school = schoolFor(req), body = b(req);
  if (!tpl || !school) return bad(req, res, 'notFound', 404);
  const c = S.getClass(String(body.classId || ''));
  if (!c || c.school_id !== school.id || !S.canManageClass(req.user, c)) return bad(req, res, 'notFound', 404);
  const copy = copyOf(req.user, school.id, tpl); if (!copy) return bad(req, res, 'notFound', 404);
  const r = L.assign(req.user, c.id, copy.lesson.id, { unitId: body.unitId || null, opensAt: body.opensAt || null, dueAt: body.dueAt || null });
  if (!r.ok) return r.code === 'alreadyAssigned' ? res.status(400).json({ error: req.t('lessons.errors.alreadyAssigned', { class: c.name }), code: r.code }) : bad(req, res, r.code, r.code === 'notFound' ? 404 : 400);
  res.json({ ok: true, lesson: lessonJson(copy.lesson), classLessonId: r.classLesson.id, restored: !!r.restored, toast: req.t(r.restored ? 'lessons.assign.restored' : 'lessons.assign.done', { class: c.name }) });
});

// ---------------------------------------------------------------- assign a unit with a cadence (P17)
/**
 * Body: the lessons as { lessonIds: [...] } (library lessons), { keys: [...] } (catalogue keys: materialised first when
 * needed), { unit, band } (the whole unit, materialised first), { path, band } (a published path) or the plan page's
 * { what: 'unit:<n>' | 'path:<id>', band }; the class unit as { unitId } (an existing one), { unitName } (found or made)
 * or, by default, the catalogue unit's name ('Unit 1 · Think Like a Robot') or the path's title; then { start:
 * 'YYYY-MM-DD' (today when empty), cadence: daily | weekdays | weekly | twice-weekly (weekdays), dueDays? }.
 * -> { ok, unit: { id, name } | null, assigned: [{ lessonId, key?, classLessonId, opensAt, dueAt, restored }], skipped, materialised, missing }
 */
function assignUnit(req, res, classId) {
  const u = req.user, c = S.getClass(String(classId || ''));
  if (!c || c.archived_at || !S.canManageClass(u, c)) return bad(req, res, 'notFound', 404);
  const body = { ...b(req) };
  if (typeof body.what === 'string') { const m = /^(unit|path):(.+)$/.exec(body.what); if (m) body[m[1]] = m[2]; }
  const band = bandOf(body.band);
  // Everything that can refuse the request is checked before anything is materialised (no side effects on a 400 / 404).
  const cadence = body.cadence || 'weekdays';
  if (!L.CADENCES.includes(cadence)) return bad(req, res, 'badCadence');
  if (body.start && !/^\d{4}-\d{2}-\d{2}$/.test(String(body.start))) return bad(req, res, 'badDate');
  if (body.dueDays !== undefined && body.dueDays !== '' && body.dueDays !== null && !(Number.isInteger(+body.dueDays) && +body.dueDays >= 0 && +body.dueDays <= 365)) return bad(req, res, 'badDate');
  if (body.unitId) { const un = L.getUnit(String(body.unitId)); if (!un || un.class_id !== c.id) return bad(req, res, 'notFound', 404); }
  let lessonIds = [], keyOf = new Map(), materialised = [], missing = [], unitName = typeof body.unitName === 'string' ? body.unitName.trim() : '';
  if (Array.isArray(body.lessonIds) && body.lessonIds.length) lessonIds = body.lessonIds.map(String);
  else {
    let keys = null;
    if (Array.isArray(body.keys) && body.keys.length) keys = body.keys.map(String);
    else if (body.unit !== undefined && body.unit !== '') {
      if (!band) return bad(req, res, 'band');
      const k = T.unitKeys(body.unit, band); if (!k) return bad(req, res, 'notFound', 404);
      keys = k.keys; missing = k.missing;
      if (!unitName) { const un = T.unitOf(body.unit); unitName = `${req.t('cs.unit.n', { n: un.n })} · ${un.title}`; }
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
  const dueDays = body.dueDays === undefined || body.dueDays === '' || body.dueDays === null ? null : body.dueDays;
  const r = L.assignUnitWithCadence(u, c.id, lessonIds, { unitId: unit ? unit.id : null, start: body.start || null, cadence, dueDays });
  if (!r.ok) return bad(req, res, r.code, r.code === 'notFound' ? 404 : 400);
  res.json({
    ok: true, unit: unit ? { id: unit.id, name: unit.name } : null,
    assigned: r.assigned.map(a => ({ lessonId: a.lessonId, key: keyOf.get(a.lessonId) || null, classLessonId: a.classLesson.id, opensAt: isoDay(a.opensAt), dueAt: isoDay(a.dueAt), restored: !!a.restored })),
    skipped: r.skipped.map(s => ({ ...s, key: keyOf.get(s.lessonId) || null })), materialised, missing,
    toast: req.t('cs.unitForm.done', { count: r.assigned.length, class: c.name }) + (r.skipped.length ? ` ${req.t('cs.unitForm.skipped', { count: r.skipped.length, list: r.skipped.map(x => { const k = keyOf.get(x.lessonId); const m = k && /\d\.\d$/.exec(k); return m ? m[0] : ''; }).filter(Boolean).join(', ') })}` : ''),
  });
}
router.post('/api/classes/:id/assign-unit', requireUser, staffOnly, LIMIT, (req, res) => assignUnit(req, res, req.params.id));
/** The plan page's form: the class comes in the body ({ classId, what, band, start, cadence, dueDays }). */
router.post('/api/cs-quest/assign-unit', requireUser, staffOnly, LIMIT, (req, res) => assignUnit(req, res, b(req).classId));

// ---------------------------------------------------------------- the pages
const pageSchool = (req, res) => {
  const school = schoolFor(req);
  if (!school) notFound(req, res, req.t('school.errors.notTeacher'));
  return school;
};
/** The ids of a band a path never lists as primary (the program page says what a path misses). */
function pathMisses(cat, band) {
  const out = {};
  for (const p of cat.paths) {
    const covered = new Set(cat.units.flatMap(u => u.lessons.filter(l => p.lessons.includes(l.n)).flatMap(l => l.primary[band] || [])));
    out[p.id] = CSTA.ids(band).filter(id => !covered.has(id));
  }
  return out;
}
/** The signed-in program page: band toggle, Before you start, the four paths, the seven units with lesson rows. */
router.get('/teach/cs-quest', requireUser, staffPage, (req, res) => {
  const t = req.t, u = req.user, school = pageSchool(req, res); if (!school) return;
  const cat = T.catalogue(), band = bandOf(req.query.band) || '1B';
  const body = V.programBody(req, {
    cat, band, school, schools: staffSchools(u), lib: T.libraryStatus(u, school.id), flags: { quizSteps: !!config.quizSteps, live: liveOn() && liveCanHost(u) },
    builder: builderStatus(), classes: classesFor(u, school.id), zone: S.zoneOf(S.getSchool(school.id)), published: publishedMap(CS_GAMES), misses: pathMisses(cat, band),
  });
  page(req, res, { title: t('cs.program.title'), active: 'classes', body, head: V.CSS, scripts: ['/js/cs.js'], back: '/teach', backLabel: t('school.teach.title') });
});
/** The coverage map: the 44 ids with lessons, chapters, items and rubric lines, and the practices table (?print=1, ?level=). */
router.get('/teach/cs-quest/coverage', requireUser, staffPage, (req, res) => {
  const t = req.t, print = req.query.print === '1';
  const body = V.coverageBody(req, { map: T.coverage(), level: bandOf(req.query.level), print });
  if (print) return page(req, res, { title: t('cs.coverage.title'), body: html`<div class="printdoc csq-print"><div class="printbar row noprint"><a class="btn" href="/teach/cs-quest/coverage">← ${t('cs.print.back')}</a><button class="btn btn-primary" type="button" data-print>🖨️ ${t('cs.print.print')}</button></div>${body}</div>`, head: V.CSS, bare: true, bodyClass: 'printpage', scripts: ['/js/print.js'] });
  page(req, res, { title: t('cs.coverage.title'), active: 'classes', body, head: V.CSS, back: '/teach/cs-quest', backLabel: 'CS Quest' });
});
/** The plan page, its print view, its printables and its projector questions. */
router.get('/teach/cs-quest/:key', requireUser, staffPage, (req, res) => {
  const t = req.t, u = req.user;
  const tpl = T.getTemplate(req.params.key);
  if (!tpl) return T.isKey(req.params.key) ? notFound(req, res, t('cs.plan.notWritten')) : notFound(req, res);
  const school = pageSchool(req, res); if (!school) return;
  const cat = T.catalogue();
  const bank = !!T.bankOf(tpl.exit.setId);
  const warmupItems = tpl.warmup ? T.bankItems(tpl.warmup.setId, tpl.warmup.items) : null;
  const exitItems = T.bankItems(tpl.exit.setId, tpl.exit.items);
  const back = `/teach/cs-quest/${tpl.key}`;
  const bare = { head: V.CSS, bare: true, bodyClass: 'printpage' };
  if (req.query.print === '1') return page(req, res, { title: tpl.title, body: printBody(req, { cat, tpl, warmupItems, exitItems, back }), ...bare, scripts: ['/js/print.js'] });
  if (req.query.sheet) {
    if (!V.printablesOf(tpl).includes(String(req.query.sheet))) return notFound(req, res);
    const body = sheetBody(req, { cat, tpl, sheet: String(req.query.sheet), exitItems, back });
    if (!body) return notFound(req, res);
    return page(req, res, { title: tpl.title, body, ...bare, scripts: ['/js/print.js'] });
  }
  if (req.query.projector) {
    const which = req.query.projector === 'exit' || !tpl.warmup ? 'exit' : 'warmup';
    const items = which === 'exit' ? exitItems : warmupItems;
    if (!items) return notFound(req, res, t('cs.plan.bankMissing'));
    return page(req, res, { title: tpl.title, body: projectorBody(req, { cat, tpl, which, items, back }), ...bare, bodyClass: 'csq-proj-page', scripts: ['/js/cs.js'] });
  }
  const st = T.status(u, school.id, tpl.key);
  const current = st && st.current;
  const assigned = current ? L.assignedClasses(current.id).filter(a => !a.archived_at && S.canManageClass(u, S.getClass(a.class_id))) : [];
  const classes = classesFor(u, school.id);
  const preselect = classes.find(c => c.id === String(req.query.class || ''))?.id || '';
  const body = V.planBody(req, {
    cat, tpl, other: T.getTemplate(`csq-${cat.bands[V.otherBand(tpl.band)].code}-${tpl.n}`), st, copy: current ? L.steps(current.id) : null, assigned, bank, warmupItems, exitItems,
    classes, preselect, flags: { quizSteps: !!config.quizSteps, live: liveOn() && liveCanHost(u) }, builder: builderStatus(), published: publishedMap([...CS_GAMES, T.WARMUP_GAME['1B'], T.WARMUP_GAME['2'], T.WYR_SLUG]),
    school, zoneNote: zoneNote(t, school.id),
  });
  page(req, res, { title: tpl.title, active: 'classes', body, head: V.CSS, scripts: ['/js/cs.js'], back: `/teach/cs-quest?band=${tpl.band}#l-${tpl.key}`, backLabel: 'CS Quest' });
});

// ---------------------------------------------------------------- the public program page (/teachers/cs-quest)
/** Anyone: what CS Quest is, the seven units, the four paths (Core 10 (no Builder) first), the period, what a teacher can
 *  honestly claim, materials, FAQ. CSTA alignment stated factually (ids and statements in JSON-LD); no prices anywhere.
 *  Copy under teachers.cs.* (English-first, marked lang="en" until a language has it). */
router.get('/teachers/cs-quest', (req, res) => {
  const t = req.t, u = req.user, cat = T.catalogue();
  const staff = !!u && !u.is_guest && S.isSchoolStaff(u);
  const k = 'teachers.cs';
  const crew = CS_GAMES.map(slug => ({ slug, game: cat.games[slug], live: launchGame(slug) }));
  const bandIds = band => cat.units.flatMap(un => un.lessons.flatMap(l => l.primary[band] || []));
  const ids = CSTA.all().filter(s => bandIds(s.level).includes(s.id));
  const unitItem = un => html`<li class="panel"><b lang="en" dir="ltr">${t('cs.unit.n', { n: un.n })} · ${un.title}</b>${un.needsSchoolPlan ? html` <span class="chip-s warn">${el(t, 'span', `${k}.units.needsPlan`)}</span>` : ''}
    <ol class="csq-lessons" lang="en" dir="ltr">${un.lessons.map(l => html`<li>${l.n} ${l.title} <span class="small muted">(${[...l.primary['1B'], ...l.primary['2']].join(', ')})</span></li>`)}</ol></li>`;
  const pathItem = p => html`<article class="panel"><h3 lang="en" dir="ltr">${p.title}${p.default ? html` <span class="csq-badge">${el(t, 'span', `${k}.paths.recommended`)}</span>` : ''}</h3>
    <p class="small"><span lang="en" dir="ltr">${p.lessons.join(', ')}</span></p>${p.note ? V.en('p', p.note, ' class="small muted"') : ''}</article>`;
  const faqPairs = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => [`${k}.faq.q${n}`, `${k}.faq.a${n}`]).filter(([qk, ak]) => t.own(qk) && t.own(ak));
  const faq = faqBlock(req, faqPairs, `${k}.faq.h`, { teachers: lp(req, '/teachers') });
  const path = '/teachers/cs-quest';
  const crumbs = [[t('nav.home'), '/'], [t('nav.teachers'), '/teachers'], [t(`${k}.crumb`), path]];
  const body = html`<div class="lp">
  <nav class="crumbs small" aria-label="${t('learn.crumbs')}"><ol>${crumbs.map(([name, p], i) => html`<li>${i < crumbs.length - 1 ? html`<a href="${lp(req, p)}">${name}</a>` : html`<span aria-current="page">${name}</span>`}</li>`)}</ol></nav>
  <section class="lp-hero" aria-labelledby="lp-h1">
    ${el(t, 'p', `${k}.kicker`, {}, ' class="lp-kicker"')}
    ${el(t, 'h1', `${k}.h1`, {}, ' id="lp-h1"')}
    ${el(t, 'p', `${k}.lead`, {}, ' class="lead"')}
    <ul class="lp-badges">${['csta', 'lessons', 'minutes', 'games', 'free'].map(x => html`<li>${el(t, 'span', `${k}.badges.${x}`)}</li>`)}</ul>
    ${el(t, 'p', `${k}.badges.note`, {}, ' class="small muted"')}
    <div class="row lp-cta">${staff ? html`<a class="btn btn-primary btn-big" href="/teach/cs-quest">💻 ${t(`${k}.cta.open`)}</a>` : html`<a class="btn btn-primary btn-big" href="${lp(req, '/teachers')}#start">${t('teachers.cta.start')}</a><a class="btn btn-big" href="/login?next=%2Fteach%2Fcs-quest">${t('layout.signIn')}</a>`}</div>
  </section>
  <section class="lp-sec" id="promise" aria-labelledby="promise-h">${el(t, 'h2', `${k}.promise.h`, {}, ' id="promise-h"')}
    <ul class="lp-list">${[1, 2, 3, 4, 5, 6, 7, 8].map(n => el(t, 'li', `${k}.promise.li${n}`))}</ul></section>
  <section class="lp-sec" id="crew" aria-labelledby="crew-h">${el(t, 'h2', `${k}.crew.h`, {}, ' id="crew-h"')}${el(t, 'p', `${k}.crew.p`)}
    <ul class="csq-crew">${crew.map(c => html`<li class="panel">${crewArt(c.slug, V.GAME_EMOJI[c.slug])}<h3 lang="en" dir="ltr">${c.game ? c.game.title : c.slug}</h3>
      ${el(t, 'p', `${k}.crew.${c.slug.replace(/-(\w)/g, (m, ch) => ch.toUpperCase())}`, {}, ' class="small"')}
      <div class="row">${c.live ? html`<a class="btn btn-primary" href="/play/${c.slug}" rel="nofollow">▶ ${t(`${k}.crew.try`)}</a>` : html`<span class="chip-s">${el(t, 'span', `${k}.crew.soon`)}</span>`}</div></li>`)}</ul></section>
  <section class="lp-sec" id="units" aria-labelledby="units-h">${el(t, 'h2', `${k}.units.h`, {}, ' id="units-h"')}${el(t, 'p', `${k}.units.p`)}
    <ul class="csq-public-units">${cat.units.map(unitItem)}</ul></section>
  <section class="lp-sec" id="paths" aria-labelledby="paths-h">${el(t, 'h2', `${k}.paths.h`, {}, ' id="paths-h"')}${el(t, 'p', `${k}.paths.p`)}
    <div class="csq-paths">${cat.paths.map(pathItem)}</div></section>
  <div class="lp-cols">
    <section class="panel" id="period" aria-labelledby="period-h">${el(t, 'h2', `${k}.period.h`, {}, ' id="period-h"')}${el(t, 'p', `${k}.period.p`)}${V.periodTable(t, cat.period)}
      ${el(t, 'p', `${k}.period.short`, {}, ' class="small muted"')}</section>
    <section class="panel" id="claim" aria-labelledby="claim-h">${el(t, 'h2', `${k}.claim.h`, {}, ' id="claim-h"')}
      <div class="csq-claim"><div>${el(t, 'h3', `${k}.claim.withH`)}${el(t, 'blockquote', `${k}.claim.with`)}</div><div>${el(t, 'h3', `${k}.claim.dayOneH`)}${el(t, 'blockquote', `${k}.claim.dayOne`)}</div></div>
      ${el(t, 'p', `${k}.claim.note`, {}, ' class="small muted"')}</section>
    <section class="panel" id="standards" aria-labelledby="standards-h">${el(t, 'h2', `${k}.standards.h`, {}, ' id="standards-h"')}
      <div class="csq-stats"><div class="csq-stat"><b dir="ltr">${CSTA.ids('1B').length}</b>${el(t, 'span', `${k}.standards.b1`)}</div><div class="csq-stat"><b dir="ltr">${CSTA.ids('2').length}</b>${el(t, 'span', `${k}.standards.b2`)}</div><div class="csq-stat"><b dir="ltr">46</b>${el(t, 'span', `${k}.standards.files`)}</div></div>
      ${el(t, 'p', `${k}.standards.p`)}${el(t, 'p', `${k}.cstaNote`, {}, ' class="small muted"')}
      ${staff ? html`<p><a href="/teach/cs-quest/coverage">🗺️ ${t('cs.program.coverage')}</a></p>` : ''}</section>
    <section class="panel" id="materials" aria-labelledby="materials-h">${el(t, 'h2', `${k}.materials.h`, {}, ' id="materials-h"')}
      ${V.enList(cat.materials, 'lp-list')}${el(t, 'p', `${k}.materials.p`, {}, ' class="small muted"')}</section>
  </div>
  ${faq.markup}
  <section class="panel lp-start" id="start" aria-labelledby="start-h">${el(t, 'h2', `${k}.start.h`, {}, ' id="start-h"')}${el(t, 'p', staff ? `${k}.start.staff` : `${k}.start.p`)}
    <div class="row">${staff ? html`<a class="btn btn-primary btn-big" href="/teach/cs-quest">💻 ${t(`${k}.cta.open`)}</a>` : html`<a class="btn btn-primary btn-big" href="${lp(req, '/teachers')}#start">${t('teachers.cta.start')}</a><a class="btn btn-big" href="/login?next=%2Fteach%2Fcs-quest">${t('layout.signIn')}</a>`}</div></section>
  </div>`;
  const course = {
    '@type': ['Course', 'LearningResource'], '@id': seo.abs(req, `${path}#course`), url: seo.abs(req, path), name: 'CS Quest', description: t(`${k}.description`),
    provider: { '@id': seo.orgId(req) }, educationalLevel: 'Grades 3-8', inLanguage: 'en', isAccessibleForFree: true, learningResourceType: 'Lesson plan', timeRequired: 'PT45M',
    teaches: [...new Set(ids.map(s => s.concept))], audience: { '@type': 'EducationalAudience', educationalRole: 'teacher' },
    educationalAlignment: ids.map(s => ({ '@type': 'AlignmentObject', alignmentType: 'teaches', educationalFramework: 'CSTA K-12 Computer Science Standards 2017', targetName: s.id, targetDescription: s.statement })),
  };
  page(req, res, {
    title: t(`${k}.title`), description: t(`${k}.description`), body, bodyClass: 'lp-page', head: V.CSS,
    seo: {
      index: true, path, langs: seo.langsWithKey(`${k}.h1`), image: '/og/teachers.jpg', imageAlt: t(`${k}.title`),
      jsonld: [seo.graph([
        { '@type': 'WebPage', '@id': seo.abs(req, path), url: seo.abs(req, path), name: t(`${k}.title`), description: t(`${k}.description`), isPartOf: { '@id': seo.abs(req, '/#website') }, publisher: { '@id': seo.orgId(req) }, audience: { '@type': 'EducationalAudience', educationalRole: 'teacher' }, mainEntity: { '@id': course['@id'] } },
        course, faq.ld, seo.breadcrumbLd(req, crumbs), seo.organizationLd(req), seo.websiteLd(req, req.locale),
      ])],
    },
  });
});

// ---------------------------------------------------------------- the class Standards tab (plan 9.4, P12)
/** The class's teachers and school admins (S.canManageClass); the principal's report: the school's admins (S.canManageSchool). */
const stdClass = (req, res, { report = false } = {}) => {
  const c = S.getClass(String(req.params.id || ''));
  const okay = c && (report ? S.canManageSchool(req.user, c.school_id) : S.canManageClass(req.user, c));
  if (!okay) { notFound(req, res); return null; }
  return c;
};
router.get('/class/:id/standards', requireUser, (req, res) => {
  const t = req.t, all = req.query.all === '1';
  if (req.query.report === '1') {
    const c = stdClass(req, res, { report: true }); if (!c) return;
    const school = S.getSchool(c.school_id);
    const body = standardsReport(req, { school, rep: STD.schoolReport(school.id, { all }), backHref: S.canManageClass(req.user, c) ? `/class/${c.id}/standards` : '/teach' });
    return page(req, res, { title: `${t('cs.standards.reportH.title')} · ${school.name}`, body: html`<div class="printdoc csq-print">${body}</div>`, head: V.CSS, bare: true, bodyClass: 'printpage', scripts: ['/js/print.js'] });
  }
  const c = stdClass(req, res); if (!c) return;
  markCheck(req.user);   // the teaching loop's Check step (services/teach-loop.js)
  const data = STD.classStandards(c.id, { all });
  const student = req.query.student ? data.students.find(p => p.id === String(req.query.student)) || null : null;
  // The framework chips (CSTA here; Common Core in routes/standards.js, ?fw=): the CSTA table below is unchanged.
  const body = html`${classHeader(req, c, 'standards')}${frameworkPicker(req, c, 'csta')}<p class="muted csq-std-lead">${t('cs.standards.lead')}</p>${standardsBody(req, { c, data, all, student })}`;
  page(req, res, { title: `${t('cs.standards.title')} · ${c.name}`, active: 'classes', body, head: raw(`${V.CSS}<link rel="stylesheet" href="/css/standards.css?v=${VERSION}">`), scripts: ['/js/schools.js'], ...classBack(req, c) });
});
router.get('/class/:id/standards.csv', requireUser, (req, res) => {
  const c = stdClass(req, res); if (!c) return;
  const data = STD.classStandards(c.id, { all: req.query.all === '1' });
  const file = `${c.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'class'}-standards.csv`;
  res.set('Content-Type', 'text/csv; charset=utf-8').set('Cache-Control', 'no-store')
    .set('Content-Disposition', `attachment; filename="standards.csv"; filename*=UTF-8''${encodeURIComponent(file)}`).send(standardsCsv(req.t, data));
});
