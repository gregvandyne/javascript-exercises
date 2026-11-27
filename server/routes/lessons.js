// Lesson plans: the teacher's library (/teach/lessons), the lesson editor (/teach/lessons/:id) and the lessons panel on a
// class page (exported for routes/schools.js). The lesson page students work through is in routes/progress.js.
// Permissions come from services/lessons.js and services/schools.js; no access means 404.
import * as LIB from '../services/library.js';
import { Router } from 'express';
import { html, raw } from '../views/html.js';
import { ico } from '../views/icon.js';
import { page, notFound, VERSION } from '../views/layout.js';
import { emptyState, gradeLabel, nameFilter, jumpNav, coverArt, staffStudentName } from '../views/components.js';
import { tHtml, localeInfo } from '../i18n/index.js';
import { requireUser, requireAccount } from '../auth.js';
import { rateLimit } from '../services/ratelimit.js';
import * as S from '../services/schools.js';
import * as L from '../services/lessons.js';
import * as FS from '../services/figures-steps.js';
import * as PS from '../services/proof-steps.js';
import * as MT from '../services/manip-tasks.js';
import { taskOf as taskOfId } from '../../public/js/manip-tasks.js';
import * as F from '../services/figures.js';
import * as games from '../services/games.js';
import { publish } from '../services/publish.js';
import { draftLesson } from '../services/lesson-ai.js';
import * as P from '../services/progress.js';
import { audit, q } from '../db.js';
import { canHost as liveCanHost } from '../services/classlive-access.js';
import { liveOn } from '../services/classlive-sessions.js';
import { HUBS, SUBJECTS, SHELF_INFO } from '../learn.js';
import * as R from '../services/rubrics.js';
import { libraryTabs } from './rubrics.js';
/** The site's games for a step's Game picker: the Learn shelf first, grouped by subject (Math, Words, CS, Music,
 *  Strategy, then Learn subjects with no subject page: Maps), then Brain breaks, live class games (hosted by the
 *  teacher), then the rest ("More games": Play's fun games). A Learn-shelf game is always under its subject (learn.js
 *  SHELF_INFO), whether or not its subject page lists it: Fraction Factory is a Math game, never a "More games" one.
 *  Each group in title order. -> [{ label, games }] */
const SUBJECT_HUBS = HUBS.filter(h => h.games.length && h.key !== 'brainBreaks');
const BREAK_HUB = HUBS.find(h => h.key === 'brainBreaks');
export function siteGroups(t, site) {
  const groups = SUBJECT_HUBS.map(h => ({ label: t(`learn.hubs.${h.key}.name`), games: [] }));
  const loose = SUBJECTS.filter(s => !SUBJECT_HUBS.some(h => h.slug === s.hub)).map(s => ({ key: s.key, label: t(`learn.tab.subjects.${s.key}`), games: [] }));
  const breaks = { label: BREAK_HUB ? t(`learn.hubs.${BREAK_HUB.key}.name`) : '', games: [] };
  const live = { label: t('lessons.step.liveGames'), games: [] }, other = { label: t('lessons.step.otherGames'), games: [] };
  for (const g of site) {
    if (g.source !== 'seed') { other.games.push(g); continue; }
    if (P.HOSTED_LIVE.has(g.slug) || /-live$/.test(g.slug)) { live.games.push(g); continue; }
    // Its subject page's group, else its Learn-shelf subject's (that subject's page, or the subject's own group).
    let i = SUBJECT_HUBS.findIndex(h => h.games.includes(g.slug));
    const shelf = SHELF_INFO[g.slug], subj = shelf && SUBJECTS.find(s => s.key === shelf.subject);
    if (i < 0 && subj) i = SUBJECT_HUBS.findIndex(h => h.slug === subj.hub);
    if (i >= 0) { groups[i].games.push(g); continue; }
    const own = subj && loose.find(x => x.key === subj.key);
    (own || (BREAK_HUB && BREAK_HUB.games.includes(g.slug) ? breaks : other)).games.push(g);
  }
  const byTitle = (a, z) => String(a.title).localeCompare(String(z.title));
  return [...groups, ...loose, breaks, live, other].filter(x => x.games.length).map(x => ({ label: x.label, games: [...x.games].sort(byTitle) }));
}

import * as T from '../services/lesson-templates.js';
import { editorBanner } from '../views/cs-quest.js';
import { lessonTags } from '../services/standards-ccss.js';
import { stepGameCodes, stepGameCover, lessonGrade } from '../standards/official-tags.js';
import { codeChips, fwName } from '../views/standards.js';
import { CCSS_IDS } from '../standards/frameworks.js';
import { gcAssignField, gcAfterAssign } from './gclassroom.js';

export const router = Router();
const CSS = raw(`<link rel="stylesheet" href="/css/community.css?v=${VERSION}"><link rel="stylesheet" href="/css/schools.css?v=${VERSION}"><link rel="stylesheet" href="/css/standards.css?v=${VERSION}">`);
const b = req => req.body || {};
const err = (req, res, code, status = 400, field) => res.status(status).json({ error: req.t(code === 'badRequest' ? 'errors.api.badRequest' : `lessons.errors.${code}`), ...(field ? { field } : {}) });
/** "Assign to" from a request (L.studentsInput: who 'all' | 'some' and the ticked students). A bad one is answered here
 *  (400) and null comes back. -> { students: [ids] | undefined } | null */
export function studentsFrom(req, res) {
  const r = L.studentsInput(req.body || {});
  if (r.ok) return r;
  err(req, res, r.code);
  return null;
}
/**
 * "Assign to: Whole class / Some students" (docs/decisions.md "Assign to some students"): two choices, and with Some
 * students a tick list of the class's students by their roster names (the class's staff only ever see this). classes:
 * the classes the form can assign to, one list each; with several (a class picker named classId), only the picked
 * class's list shows and is sent (public/js/app.js [data-as-who]); shown: the class whose list shows first. picked: the
 * students ticked now ([] = the whole class). idp: an id prefix unique on the page.
 */
export function assignToField(t, classes, { idp, picked = [], shown = '' } = {}) {
  const some = picked.length > 0, first = classes.some(c => c.id === shown) ? shown : (classes[0] || {}).id;
  return html`<div class="field wide as-who" data-as-who>
    <fieldset class="choice as-choice"><legend>${t('lessons.assign.to')}</legend>
      <label><input type="radio" name="who" value="all" id="${idp}-all" ${some ? '' : raw('checked')}> ${t('lessons.assign.wholeClass')}</label>
      <label><input type="radio" name="who" value="some" id="${idp}-some" ${some ? raw('checked') : ''}> ${t('lessons.assign.someStudents')}</label></fieldset>
    ${classes.map(c => { const list = S.roster(c.id).filter(p => p.role === 'student');
      return html`<div class="as-some" data-students-of="${c.id}" ${c.id === first ? '' : raw('hidden')}>
      ${list.length ? html`<fieldset class="picklist"><legend class="sr-only">${t('lessons.assign.studentsOf', { class: c.name })}</legend>
        ${list.map(p => html`<label><input type="checkbox" name="students" value="${p.id}" ${picked.includes(p.id) ? raw('checked') : ''}> ${staffStudentName(p)}</label>`)}</fieldset>
        <p class="small muted">${t('lessons.assign.someHint')}</p>`
      : html`<p class="small muted">${t('lessons.assign.noStudents')}</p>`}</div>`; })}</div>`;
}
const send = (req, res, r, extra = {}) => (r.ok ? res.json({ ok: true, ...extra }) : err(req, res, r.code, r.code === 'notFound' ? 404 : 400));
const no = (req, res) => (req.path.startsWith('/api/') ? res.status(404).json({ error: req.t('lessons.errors.notFound') }) : notFound(req, res, req.t('lessons.errors.notFound')));
const KIND_ICON = { game: '🎮', build: '🛠️', text: '📖', question: '✍️', quiz: '🧩', figures: '📐', proofread: '🔎', manip: '🧮', grammar: '🔤' };
const isoDay = t => (t ? new Date(t).toISOString().slice(0, 10) : '');
const paras = text => String(text || '').split(/\n{2,}/).filter(Boolean).map(p => html`<p dir="auto">${p.split('\n').map((line, i) => html`${i ? raw('<br>') : ''}${line}`)}</p>`);
/** "Subject (optional)": the field name and the shared "(optional)" word. */
const optional = (t, label) => html`${label} <span class="muted">${t('school.optional')}</span>`;

/** The schools where the user is staff (by membership: the platform admin works from Schools instead). */
const staffSchools = u => S.schoolsOf(u.id).filter(s => s.role !== 'student');
/** A class the viewer manages, from an id in the URL or a form (?from=, ?class=); anything else is ignored. */
function managedClass(u, id) {
  const c = id && typeof id === 'string' ? S.getClass(id) : null;
  return c && S.canManageClass(u, c) ? c : null;
}
/** A list of items in the reader's language ("4N, 4S and 5B"), each item rendered as markup. */
function listOf(t, items, render) {
  let lf = null; try { lf = new Intl.ListFormat(t.intl || 'en', { type: 'conjunction' }); } catch { /* old runtime */ }
  if (!lf) return html`${items.map((x, i) => html`${i ? ', ' : ''}${render(x)}`)}`;
  let k = 0;
  return html`${lf.formatToParts(items.map(() => 'x')).map(p => (p.type === 'element' ? render(items[k++]) : p.value))}`;
}
/** A class lesson's due chip: 'Due today' (amber) on the day, 'Late' once the day is over (unless done), else the date.
 *  Stored dates are calendar days: always f.day (the same date whatever zone the server runs in). */
export function dueChip(t, f, cl, { done = false } = {}) {
  const st = L.dueState(cl);
  if (!st) return '';
  if (st === 'late' && !done) return html`<span class="chip-s bad">${ico('⏰', { size: 18 })} ${t('lessons.class.late')}</span>`;
  if (st === 'today') return html`<span class="chip-s warn">${ico('📅', { size: 18 })} ${t('lessons.class.dueToday')}</span>`;
  return html`<span class="chip-s">${ico('📅', { size: 18 })} ${t('lessons.class.dueOn', { date: f.day(cl.due_at) })}</span>`;
}
/** One line telling teachers when days begin and end: at midnight in the school's time zone, or (none set) in UTC with
 *  the 36-hour grace. Shown wherever dates are set or lateness is read (assign forms, the gradebook). */
export function zoneNote(t, schoolId, u = null) {
  const s = S.getSchool(schoolId), tz = S.zoneOf(s);
  if (tz) return t('lessons.assign.zoneNote', { zone: tz.replace(/_/g, ' ') });
  // No time zone yet: a school admin gets a link to set it (Settings); a teacher is told who can.
  return html`${t('lessons.assign.zoneUnset')}${s && u && S.canManageSchool(u, s.id) ? html` <a href="/school/${s.slug}?tab=settings#tz">${t('lessons.assign.zoneSet')}</a>` : html` ${t('lessons.assign.zoneAsk')}`}`;
}
/** The Delete lesson confirm says what goes with it: the classes it is in and the students' work. */
function deleteLessonConfirm(t, l) {
  const n = L.lessonWork(l.id), count = L.lessonClassCount(l.id);
  if (n && count) return t('lessons.lesson.deleteLiveConfirm', { name: l.title, count, n });
  if (n) return t('lessons.lesson.deleteWorkConfirm', { name: l.title, n });
  if (count) return t('lessons.lesson.deleteAssignedConfirm', { name: l.title, count });
  return t('lessons.lesson.deleteConfirm', { name: l.title });
}
/** Share with my school / Stop sharing: one button posting the opposite of the current state. With an id, the form is
 *  hidden and a button elsewhere submits it (form="<id>"). */
function shareForm(t, l, id = null) {
  const attrs = { api: `/api/lessons/${l.id}`, toast: l.shared ? t('lessons.lesson.unsharedToast') : t('lessons.lesson.sharedToast'), value: l.shared ? '0' : '1' };
  if (id) return html`<form id="${id}" hidden data-api="${attrs.api}" data-reload data-toast="${attrs.toast}"><input type="hidden" name="shared" value="${attrs.value}"></form>`;
  return html`<form data-api="${attrs.api}" data-reload data-toast="${attrs.toast}"><input type="hidden" name="shared" value="${attrs.value}"><button class="btn btn-sm" type="submit">${l.shared ? t('lessons.lesson.unshare') : html`🏫 ${t('lessons.lesson.share')}`}</button></form>`;
}

// ================================================================ library
// Games, not lessons: the lesson library is now Build (folders of games). Old links land there.
/** The editor's note after an AI draft: what was saved, read back (chk: saved.planned.fixed.replaced.dropped.games),
 *  only when something is not as the AI wrote it. */
function draftCheck(t, chk) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(chk || ''));
  if (!m) return '';
  const [saved, planned, fixed, replaced, dropped, games] = m.slice(1).map(Number);
  const lines = [];
  if (saved < planned) lines.push(t('lessons.ai.check.steps', { saved, planned }));
  if (replaced) lines.push(t('lessons.ai.check.replaced', { count: replaced }));
  if (dropped) lines.push(t('lessons.ai.check.dropped', { count: dropped }));
  if (fixed) lines.push(t('lessons.ai.check.fixed', { count: fixed }));
  if (games) lines.push(t('lessons.ai.check.games', { count: games }));
  return lines.length ? html`<div class="notice warn" role="note" id="lesson-ai-check"><p><b>${t('lessons.ai.check.title')}</b></p><ul>${lines.map(l => html`<li>${l}</li>`)}</ul></div>` : '';
}
router.get('/teach/lessons', requireUser, (req, res) => res.redirect(302, '/build'));

// ---- library APIs
/** ?class=<id> for the new lesson's editor, when it was started from that class (the class is preselected in Assign). */
const classParam = (u, classId, schoolId) => { const c = managedClass(u, classId); return c && c.school_id === schoolId ? c.id : null; };
router.post('/api/lessons', requireUser, rateLimit('lesson-new', 120, 3600e3), (req, res) => {
  const { schoolId, folderId, title, classId } = b(req);
  if (!String(title || '').trim()) return err(req, res, 'lessonTitle', 400, 'title');
  const r = L.createLesson(req.user, schoolId, { title, folderId: folderId || null });
  if (!r.ok) return err(req, res, r.code, r.code === 'notFound' ? 404 : 400);
  const cid = classParam(req.user, classId, r.lesson.school_id);
  res.json({ ok: true, redirect: `/teach/lessons/${r.lesson.id}${cid ? `?class=${encodeURIComponent(cid)}` : ''}` });
});
router.post('/api/lessons/draft', requireUser, rateLimit('lesson-ai', 30, 3600e3), async (req, res) => {
  const { schoolId, folderId, topic, grade, subject, minutes, classId } = b(req);
  if (!String(topic || '').trim()) return err(req, res, 'topic', 400, 'topic');
  if (!S.getSchool(schoolId) || !['admin', 'teacher'].includes(S.roleIn(req.user, schoolId))) return no(req, res);
  const pick = L.gamesForPicker(req.user, schoolId);
  const catalog = [...pick.school, ...pick.site].map(g => ({ ...g, ...(games.getGame(g.id) || {}) })).map(g => ({ id: g.id, title: g.title, description: g.description, tags: g.tags }));
  // A Figures tester's draft may have Figure steps: the figure catalog goes with the game catalog (the Figures gate).
  const figures = figureSteps(req.user) ? F.figureCatalog() : [];
  if (figures.length && F.namesIn(req.user, `${topic} ${subject || ''}`)) return res.status(400).json({ error: req.t('figures.errors.names'), field: 'topic' });
  let d;
  try { d = await draftLesson({ topic, grade, subject, minutes: Math.max(10, Math.min(180, +minutes || 40)), locale: req.locale, t: req.t }, catalog, figures); }
  catch { return err(req, res, 'aiFailed', 503); }
  const r = L.createLesson(req.user, schoolId, { title: d.draft.title || topic, folderId: folderId || null, summary: d.draft.summary, subject: subject || d.draft.subject || '', grade: grade || d.draft.grade || '', objectives: d.draft.objectives });
  if (!r.ok) return err(req, res, r.code);
  const planned = d.draft.steps || [];
  for (const s of planned) {
    if (s.kind === L.FIGURES_KIND) { FS.draftedStep(req.user, r.lesson.id, s, { lang: req.locale }); continue; }
    L.addStep(req.user, r.lesson.id, { kind: s.kind, title: s.title, body: s.body, minutes: s.minutes, gameId: s.gameId || null });
  }
  // Checked work (docs/decisions.md "Builders check their work"): the lesson read back as saved, so the editor's note
  // says what is really there: steps saved of planned, and what the checks did to the AI's figures and games.
  const saved = L.steps(r.lesson.id).length, rep = d.report || null;
  const chk = d.ai && rep ? [saved, planned.length, rep.figures.fixed, rep.figures.replaced, rep.figures.dropped, rep.gamesSwapped].join('.') : '';
  audit(req.user.id, 'lesson.draft', r.lesson.id, { ai: d.ai, saved, planned: planned.length });
  const cid = classParam(req.user, classId, r.lesson.school_id);
  res.json({ ok: true, redirect: `/teach/lessons/${r.lesson.id}?drafted=${d.ai ? 'ai' : 'template'}${chk ? `&chk=${chk}` : ''}${cid ? `&class=${encodeURIComponent(cid)}` : ''}` });
});
router.post('/api/lesson-folders', requireUser, (req, res) => {
  const { schoolId, parentId, name } = b(req);
  if (!String(name || '').trim()) return err(req, res, 'folderName', 400, 'name');
  const r = L.createFolder(req.user, schoolId, { name, parentId: parentId || null });
  if (!r.ok) return send(req, res, r);
  res.json({ ok: true, redirect: `/teach/lessons?school=${schoolId}&folder=${r.folder.id}` });
});
router.post('/api/lesson-folders/:id', requireUser, (req, res) => send(req, res, L.renameFolder(req.user, req.params.id, b(req).name)));
router.post('/api/lesson-folders/:id/move', requireUser, (req, res) => send(req, res, L.moveFolder(req.user, req.params.id, b(req).parentId || null)));
router.post('/api/lesson-folders/:id/up', requireUser, (req, res) => send(req, res, L.reorderFolder(req.user, req.params.id, -1)));
router.post('/api/lesson-folders/:id/down', requireUser, (req, res) => send(req, res, L.reorderFolder(req.user, req.params.id, 1)));
router.post('/api/lesson-folders/:id/delete', requireUser, (req, res) => send(req, res, L.deleteFolder(req.user, req.params.id)));
router.post('/api/lessons/:id/up', requireUser, (req, res) => send(req, res, L.reorderLesson(req.user, req.params.id, -1)));
router.post('/api/lessons/:id/down', requireUser, (req, res) => send(req, res, L.reorderLesson(req.user, req.params.id, 1)));
router.post('/api/lessons/:id/move', requireUser, (req, res) => send(req, res, L.moveLesson(req.user, req.params.id, b(req).folderId || null)));
/** Make a copy: it lands next to the original (same folder) and opens right away. */
router.post('/api/lessons/:id/copy', requireUser, (req, res) => {
  const r = L.copyLesson(req.user, req.params.id);
  send(req, res, r, r.ok ? { id: r.lesson.id, redirect: `/teach/lessons/${r.lesson.id}?copied=1` } : {});
});
router.post('/api/lessons/:id/delete', requireUser, (req, res) => {
  const l = L.getLesson(req.params.id);
  const r = L.deleteLesson(req.user, req.params.id);
  send(req, res, r, r.ok && req.get('referer') && /\/teach\/lessons\/[^/?]+/.test(req.get('referer')) ? { redirect: `/teach/lessons?school=${l.school_id}${l.folder_id ? `&folder=${l.folder_id}` : ''}` } : {});
});

// ================================================================ lesson editor (and read-only view of shared lessons)
// The step form shows the fields for its type: the server sets data-kind on the form, public/js/schools.js keeps it in
// step with the Type select, and the CSS hides the Game field for other types (it also follows the select without JS).
const KIND_ORDER = ['text', 'question', 'game', 'build'];
const BODY_LABEL = { text: 'lessons.step.bodyText', question: 'lessons.step.bodyQuestion', build: 'lessons.step.bodyBuild', game: 'lessons.step.bodyGame', figures: 'lessons.step.bodyFigures' };
/** "Figure questions" in the step editor: only for someone the Figures gate lets in (services/figures.js canMake: every
 *  school staff member and the platform admin, while FIGURES is on). Adding one opens the Figures builder for the step's questions. */
const figureSteps = u => F.canMake(u);
/** The step form's Rubric select (question and build steps): the teacher's rubrics, and the one on the step now. */
function rubricField(t, rubrics, current, idp, kinds, forKind) {
  const has = rubrics.some(r => r.id === current), cur = current && !has ? R.getRubric(current) : null;
  return html`<div class="f-rub" data-for-kinds="${kinds.join(' ')}" ${forKind}><label for="${idp}-r">${t('rubrics.attach.step')} <span class="muted">${t('school.optional')}</span></label>
    <select class="input" id="${idp}-r" name="rubricId"><option value="">${t('rubrics.attach.none')}</option>${cur ? html`<option value="${cur.id}" selected>📏 ${cur.title}</option>` : ''}${rubrics.map(r => html`<option value="${r.id}" ${r.id === current ? raw('selected') : ''}>📏 ${r.title}</option>`)}</select>
    <span class="hint">${rubrics.length ? t('rubrics.attach.hint') : t('rubrics.attach.noneYet')} <a href="/teach/rubrics">${t('rubrics.attach.library')}</a></span></div>`;
}
function stepFields(t, pick, s = {}, idp, { newGameLink = false, rubrics = [], figures = false } = {}) {
  const kind = s.kind || 'text';
  const kinds = figures ? [...KIND_ORDER, L.FIGURES_KIND] : KIND_ORDER;
  const opt = g => html`<option value="${g.id}" ${g.id === s.game_id ? raw('selected') : ''}>${g.icon} ${g.title}</option>`;
  const forKind = k => (k === kind ? '' : raw('hidden'));
  return html`
    <div class="field f-k"><label for="${idp}-k">${t('lessons.step.kind')}</label><select class="input" id="${idp}-k" name="kind">${kinds.map(k => html`<option value="${k}" ${k === kind ? raw('selected') : ''}>${KIND_ICON[k]} ${t(k === L.FIGURES_KIND ? 'lessons.kinds.figureStep' : `lessons.kinds.${k}`)}</option>`)}</select></div>
    <div class="field f-t"><label for="${idp}-t">${t('lessons.step.title')}</label><input class="input" id="${idp}-t" name="title" value="${s.title || ''}" maxlength="100"></div>
    <div class="field f-g"><label for="${idp}-g">${t('lessons.step.game')}</label><select class="input" id="${idp}-g" name="gameId"><option value="">–</option>
      ${pick.mine.length ? html`<optgroup label="${t('lessons.step.myGames')}">${pick.mine.map(opt)}</optgroup>` : ''}
      ${pick.school.length ? html`<optgroup label="${t('lessons.step.schoolGames')}">${pick.school.map(opt)}</optgroup>` : ''}
      ${pick.classes && pick.classes.length ? html`<optgroup label="${t('lessons.step.classGames')}">${pick.classes.map(opt)}</optgroup>` : ''}
      ${siteGroups(t, pick.site).map(gr => html`<optgroup label="${gr.label}">${gr.games.map(opt)}</optgroup>`)}</select><span class="err" id="${idp}-g-err"></span>
      ${newGameLink ? html`<a class="small f-glink" href="#ng-i">${ico('➕', { size: 18 })} ${t('lessons.step.newGameLink')}</a>` : ''}</div>
    <div class="field f-m"><label for="${idp}-m">${t('lessons.step.minutes')}</label><input class="input" id="${idp}-m" name="minutes" type="number" min="0" max="240" value="${s.minutes || ''}"></div>
    <div class="field f-b"><label for="${idp}-b">${kinds.map(k => html`<span data-for-kind="${k}" ${forKind(k)}>${t(BODY_LABEL[k])}</span>`)}</label><textarea class="input" id="${idp}-b" name="body" rows="3" maxlength="4000">${s.body || ''}</textarea><span class="hint" data-for-kind="build" ${forKind('build')}>${t('lessons.step.buildHint')}</span>${figures ? html`<span class="hint" data-for-kind="figures" ${forKind('figures')}>${ico('📐', { size: 18 })} ${t('lessons.step.figuresHint')}</span>` : ''}<span class="err" id="${idp}-b-err"></span>
      ${rubricField(t, rubrics, s.rubric_id || null, idp, R.STEP_KINDS, R.STEP_KINDS.includes(kind) ? '' : raw('hidden'))}</div>`;
}
router.get('/teach/lessons/:id', requireUser, (req, res) => {
  const t = req.t, f = req.fmt, u = req.user;
  const l = L.getLesson(req.params.id);
  const edit = L.canEditLesson(u, l);
  if (!l || !(edit || L.canSeeShared(u, l))) return no(req, res);
  // A teacher-made lesson is retired: its games are in the folder made from it (0085_game_folders). An assigned game opens
  // as the game. Ready-made course copies (CS Quest) and live homework still open here.
  const retired = l.kind === 'lesson' && (q.get('SELECT 1 FROM lessons_retired WHERE lesson_id=? LIMIT 1', l.id) || q.get('SELECT 1 FROM game_folders WHERE from_lesson=? LIMIT 1', l.id));
  if (retired) { const fd = q.get('SELECT id FROM game_folders WHERE from_lesson=? AND owner_id=?', l.id, u.id); return res.redirect(302, fd ? `/build?folder=${encodeURIComponent(fd.id)}` : '/build'); }
  if (l.kind === 'game') { const s0 = L.steps(l.id)[0]; return res.redirect(302, s0 && s0.game_id ? `/build/save?id=${s0.game_id}` : '/build'); }
  const school = S.getSchool(l.school_id);
  const st = L.steps(l.id);
  const total = st.reduce((n, s) => n + (s.minutes || 0), 0);
  const pick = edit ? L.gamesForPicker(u, l.school_id) : null;
  // Rubrics (services/rubrics.js): the ones this teacher can attach, and the whole lesson's.
  const rubrics = edit ? R.attachable(u, l.school_id) : [];
  const lessonRubric = l.rubric_id ? R.getRubric(l.rubric_id) : null;
  const rubricChip = id => { const rb = id && R.getRubric(id); if (!rb) return ''; return html`<p class="sc-rubric">${ico('📏', { size: 18 })} ${R.canSeeRubric(u, rb) ? html`<a href="/teach/rubrics/${rb.id}" dir="auto">${rb.title}</a>` : html`<span dir="auto">${rb.title}</span>`} <span class="small muted">${t('rubrics.maxPoints', { points: t('rubrics.pointsN', { count: R.maxPoints(rb) }) })}</span></p>`; };
  // Where the lesson is now (live classes the viewer manages: one line each), and the classes it can still go to.
  const assigned = edit ? L.assignedClasses(l.id).filter(a => !a.archived_at && S.canManageClass(u, S.getClass(a.class_id))) : [];
  const justAssigned = req.query.assigned ? assigned.find(a => a.id === String(req.query.assigned)) || null : null;
  const classes = S.classesOf(u.id, 'teacher').filter(c => c.school_id === l.school_id);
  const adminClasses = S.canManageSchool(u, l.school_id) ? S.classesOfSchool(l.school_id).filter(c => !classes.some(x => x.id === c.id)) : [];
  const assignable = edit ? [...classes, ...adminClasses].filter(c => !assigned.some(a => a.class_id === c.id)) : [];
  const preselect = String(req.query.class || '');
  const from = managedClass(u, req.query.from);
  const started = L.startedIn(assigned.map(a => a.id));
  // Common Core tags (services/standards-ccss.js): the lesson's own, each step's, and what an official game practises.
  const ccTags = lessonTags(l.id);
  const ccOf = stepId => CCSS_IDS.map(fw => [fw, ccTags.filter(x => x.framework === fw && x.step_id === stepId).map(x => x.code)]).filter(([, c]) => c.length);
  const ccChips = list => list.map(([fw, codes]) => codeChips(t, fw, codes));
  // What a game step practises, as the class Standards tab counts it (a levelled game: the lesson's grade or the track
  // the step is locked to), and whether it only covers codes until the lesson has a grade.
  const lg = lessonGrade(l.grade);
  const seedGame = s => s.kind === 'game' && s.game_slug && s.game_source === 'seed';
  const gameOf = s => (seedGame(s) ? CCSS_IDS.map(fw => [fw, stepGameCodes(s.game_slug, fw, lg, s.options)]).filter(([, c]) => c.length) : []);
  const needsGrade = s => seedGame(s) && !gameOf(s).length && CCSS_IDS.some(fw => stepGameCover(s.game_slug, fw, lg, s.options).length);
  const stepView = (s, i) => {
    const playable = L.playableBy(s, l.school_id);
    // A game the viewer can't open (a colleague's class game, say): no title and no link, just that it is there.
    const hidden = s.kind === 'game' && s.game_id && s.game_owner !== u.id && !games.canView(u, games.getGame(s.game_id));
    const classOnly = s.game_visibility === 'class';
    const work = edit ? L.stepWork(s.id) : 0;
    return html`<li class="panel stepcard">
      <div class="sc-head"><span class="sc-num">${i + 1}</span><span class="sc-kind" aria-hidden="true">${KIND_ICON[s.kind]}</span>
        <div class="sc-title"><b dir="auto">${s.title || t(`lessons.kinds.${s.kind}`)}</b><span class="small muted">${t(`lessons.kinds.${s.kind}`)}${s.minutes ? ` · ${t('lessons.minutesN', { count: s.minutes })}` : ''}</span></div>
        ${edit ? html`<span class="acts">${i ? html`<form data-api="/api/lesson-steps/${s.id}/up" data-reload><button class="btn btn-sm" type="submit" aria-label="${t('lessons.up')}">↑</button></form>` : ''}${i < st.length - 1 ? html`<form data-api="/api/lesson-steps/${s.id}/down" data-reload><button class="btn btn-sm" type="submit" aria-label="${t('lessons.down')}">↓</button></form>` : ''}</span>` : ''}</div>
      ${s.kind === 'game' ? html`<p class="sc-game">${hidden ? html`🔒 <span class="muted">${t('lessons.step.hiddenGame')}</span>`
          : html`${s.game_icon} <a href="/g/${s.game_slug}">${s.game_title}</a>${classOnly ? html` <span class="chip-s">${ico('🎒', { size: 18 })} ${t('lessons.step.classOnly')}</span>` : playable ? '' : html` <span class="chip-s warn">${ico('⚠️', { size: 18 })} ${t('lessons.step.notShared')}</span>`}`}</p>
        ${!playable && !classOnly && edit && s.game_owner === u.id ? html`<form data-api="/api/lesson-steps/${s.id}/share-game" data-reload><button class="btn btn-sm" type="submit">${ico('🏫', { size: 18 })} ${t('lessons.step.shareGame')}</button></form>` : ''}
        ${!playable && !classOnly && s.game_owner === u.id ? html`<p class="small muted">${t('lessons.step.notSharedHint')} <a href="/studio/${s.game_id}">${t('lessons.step.openStudio')}</a></p>` : ''}` : ''}
      ${ccOf(s.id).length || gameOf(s).length || needsGrade(s) ? html`<div class="std-stepcodes">${ccChips(ccOf(s.id))}${gameOf(s).map(([fw, codes]) => codeChips(t, fw, codes, { label: t('standards.lesson.gameCodes', { framework: fwName(t, fw) }) }))}${needsGrade(s) ? html`<p class="small muted">${t('standards.lesson.gameNeedsGrade')}</p>` : ''}</div>` : ''}
      ${s.kind === 'build' ? html`<p class="sc-build" dir="auto">${ico('💬', { size: 18 })} “${s.body}”</p>` : s.body ? html`<div class="sc-body ${s.kind === 'question' ? 'q-text' : ''}">${paras(s.body)}</div>` : ''}
      ${R.STEP_KINDS.includes(s.kind) ? rubricChip(s.rubric_id) : ''}
      ${s.kind === L.FIGURES_KIND ? figureStepView(s, work) : s.kind === L.PROOF_KIND ? proofStepView(s, work) : s.kind === L.MANIP_KIND ? manipStepView(s) : ''}
      ${edit && !L.HANDIN_KINDS.includes(s.kind) && s.kind !== L.MANIP_KIND ? html`<details><summary class="small">${ico('✏️', { size: 18 })} ${t('lessons.step.edit')}</summary>
        <form class="formgrid stepgrid" data-kind="${s.kind}" data-api="/api/lesson-steps/${s.id}" data-reload novalidate>${stepFields(t, pick, s, `s${s.id}`, { rubrics })}
          <div class="formacts"><button class="btn btn-primary" type="submit">${t('school.save')}</button><button class="btn btn-danger" type="submit" form="sd-${s.id}">${t('lessons.step.delete')}</button></div></form>
        <form id="sd-${s.id}" hidden data-api="/api/lesson-steps/${s.id}/delete" data-reload data-confirm="${work ? t('lessons.step.deleteWorkConfirm', { n: work }) : t('lessons.step.deleteConfirm')}"></form></details>` : ''}
    </li>`;
  };
  // A Figure step: how many questions, the answers switch, and (its editors) Edit questions, Print and a small form for
  // its title, minutes and instructions with Delete. Edit questions is a Figures tester's (the Figures gate).
  const figureStepView = (s, work) => html`<p class="small muted">${ico('📐', { size: 18 })} ${t('figures.step.questions', { count: FS.itemsOf(s).length })} · ${s.show_answers ? t('figures.step.showOnNote') : t('figures.step.showOffNote')}</p>
    ${edit ? html`<div class="row fstep-acts">${figureSteps(u) ? html`<form data-api="/api/lesson-steps/${s.id}/figures-edit"><button class="btn btn-sm btn-primary" type="submit">${ico('✏️', { size: 18 })} ${t('lessons.step.editFigures')}</button></form>` : ''}
      <a class="btn btn-sm" href="/teach/lesson-steps/${s.id}/print">${ico('🖨️', { size: 18 })} ${t('lessons.step.printFigures')}</a></div>
      ${work ? html`<p class="small muted">${t('lessons.step.figuresStarted')}</p>` : ''}
      <details><summary class="small">⋯ ${t('lessons.step.more')}</summary>
        <form class="formgrid" data-api="/api/lesson-steps/${s.id}" data-reload novalidate><input type="hidden" name="kind" value="figures">
          <div class="field"><label for="s${s.id}-t">${t('lessons.step.title')}</label><input class="input" id="s${s.id}-t" name="title" value="${s.title || ''}" maxlength="100"></div>
          <div class="field"><label for="s${s.id}-m">${t('lessons.step.minutes')}</label><input class="input" id="s${s.id}-m" name="minutes" type="number" min="0" max="240" value="${s.minutes || ''}"></div>
          <div class="field wide"><label for="s${s.id}-b">${t('lessons.step.bodyFigures')}</label><textarea class="input" id="s${s.id}-b" name="body" rows="2" maxlength="4000">${s.body || ''}</textarea></div>
          <div class="formacts wide"><button class="btn btn-primary" type="submit">${t('school.save')}</button><button class="btn btn-danger" type="submit" form="sd-${s.id}">${t('lessons.step.delete')}</button></div></form>
        <form id="sd-${s.id}" hidden data-api="/api/lesson-steps/${s.id}/delete" data-reload data-confirm="${work ? t('lessons.step.deleteWorkConfirm', { n: work }) : t('lessons.step.deleteConfirm')}"></form></details>` : ''}`;
  // A graded Mistake Hunt set (services/proof-steps.js): its passages and mistakes are its snapshot; the title, minutes and
  // instructions can be edited, or the step deleted.
  const proofStepView = (s, work) => { const sn = PS.snapOf(s); return html`<p class="small muted">${ico('🔎', { size: 18 })} ${t('proof.step.passagesN', { count: sn.passages.length })} · ${t('proof.step.mistakesN', { count: PS.mistakesOf(sn).length })} · ${s.show_answers ? t('figures.step.showOnNote') : t('figures.step.showOffNote')} · ${t(sn.hints ? 'proof.step.hintsAllowed' : 'proof.step.hintsOff')}</p>
    ${edit ? html`${work ? html`<p class="small muted">${t('lessons.step.figuresStarted')}</p>` : ''}
      <details><summary class="small">⋯ ${t('lessons.step.more')}</summary>
        <form class="formgrid" data-api="/api/lesson-steps/${s.id}" data-reload novalidate><input type="hidden" name="kind" value="${L.PROOF_KIND}">
          <div class="field"><label for="s${s.id}-t">${t('lessons.step.title')}</label><input class="input" id="s${s.id}-t" name="title" value="${s.title || ''}" maxlength="100"></div>
          <div class="field"><label for="s${s.id}-m">${t('lessons.step.minutes')}</label><input class="input" id="s${s.id}-m" name="minutes" type="number" min="0" max="240" value="${s.minutes || ''}"></div>
          <div class="field wide"><label for="s${s.id}-b">${t('lessons.step.bodyFigures')}</label><textarea class="input" id="s${s.id}-b" name="body" rows="2" maxlength="4000">${s.body || ''}</textarea></div>
          <div class="formacts wide"><button class="btn btn-primary" type="submit">${t('school.save')}</button><button class="btn btn-danger" type="submit" form="sd-${s.id}">${t('lessons.step.delete')}</button></div></form>
        <form id="sd-${s.id}" hidden data-api="/api/lesson-steps/${s.id}/delete" data-reload data-confirm="${work ? t('lessons.step.deleteWorkConfirm', { n: work }) : t('lessons.step.deleteConfirm')}"></form></details>` : ''}`; };
  // A Manipulatives practice set (services/manip-tasks.js): its tasks and how many questions of each, each with Preview.
  const manipStepView = s => { const sn = MT.snapOf(s) || { tasks: [], n: 0 }; return html`<p class="small muted">${ico('🧮', { size: 18 })} ${t('manip.set.teacherNote', { count: MT.countOf(s) })}</p>
    <div class="row">${sn.tasks.map(id => html`<a class="btn btn-sm" href="/manipulatives#practice/${id}">${ico('👀', { size: 18 })} ${t('manip.set.preview', { title: (taskOfId(id) || { task: { title: id } }).task.title })}</a>`)}</div>`; };
  const drafted = req.query.drafted;
  const progressLinks = listOf(t, assigned, a => html`<a href="/class/${a.class_id}/progress/${a.id}">${a.name}</a>`);
  const body = html`
  <div class="pagehead"><div><span class="small muted">${school.name}</span><h1 dir="auto">${l.title}</h1>
    <p class="muted">${[l.subject, gradeLabel(t, l.grade), t('lessons.stepsN', { count: st.length }), total ? t('lessons.minutesN', { count: total }) : '', l.shared ? `🏫 ${t('lessons.lesson.sharedStatus')}` : ''].filter(Boolean).join(' · ')}</p></div>
    ${edit ? html`<div class="row edacts"><a class="btn btn-primary" href="#assign">${ico('📌', { size: 18 })} ${t('lessons.assign.button')}</a><button class="btn" type="submit" form="lc-${l.id}">${ico('📄', { size: 18 })} ${t('lessons.lesson.duplicate')}</button><button class="btn" type="submit" form="lsh-${l.id}">${l.shared ? t('lessons.lesson.unshare') : `🏫 ${t('lessons.lesson.share')}`}</button>${liveOn() && liveCanHost(req.user) && st.some(s => s.kind === 'question') ? html`<button class="btn" type="submit" form="lv-q-${l.id}">${ico('📡', { size: 18 })} ${t('live.entry.fromLesson')}</button>` : ''}</div>
      <form id="lv-q-${l.id}" hidden data-api="/api/live/sets/from-lesson/${l.id}"></form>`
      : html`<form data-api="/api/lessons/${l.id}/copy"><button class="btn btn-primary" type="submit">${ico('📄', { size: 18 })} ${t('lessons.shared.copy')}</button></form>`}</div>
  ${edit && req.query.copied ? html`<p class="notice good">${ico('📄', { size: 18 })} ${t('lessons.lesson.copiedNotice')}</p>` : ''}
  ${l.template_key && T.getTemplate(l.template_key) ? editorBanner(req, l, T.getTemplate(l.template_key), { edit }) : ''}
  ${req.query.figures === 'saved' ? html`<p class="notice good" role="status">${ico('📐', { size: 18 })} ${t('lessons.step.figuresSaved')}</p>` : ''}
  ${drafted ? html`<p class="notice ${drafted === 'ai' ? '' : 'warn'}">${drafted === 'ai' ? `✨ ${t('lessons.ai.done')}` : t('lessons.ai.template')}</p>` : ''}
  ${draftCheck(t, req.query.chk)}
  ${assigned.length ? html`<p class="notice livenote">${ico('📌', { size: 18 })} ${tHtml(t, 'lessons.editor.live', { classes: progressLinks, count: started })}</p>` : ''}
  ${edit ? html`<details class="panel lessondetails"><summary>${ico('✏️', { size: 18 })} ${t('lessons.lesson.editDetails')}</summary>
    <form class="formgrid" data-api="/api/lessons/${l.id}" data-reload data-toast="${t('school.settings.saved')}" novalidate>
      <div class="field wide"><label for="ld-t">${t('lessons.lesson.title')}</label><input class="input" id="ld-t" name="title" value="${l.title}" maxlength="100" required><span class="err" id="ld-t-err"></span></div>
      <div class="field"><label for="ld-s">${optional(t, t('school.class.subject'))}</label><input class="input" id="ld-s" name="subject" value="${l.subject}" maxlength="40"></div>
      <div class="field"><label for="ld-g">${optional(t, t('school.class.grade'))}</label><input class="input" id="ld-g" name="grade" value="${l.grade}" maxlength="12"></div>
      <div class="field wide"><label for="ld-su">${t('lessons.lesson.summary')}</label><textarea class="input" id="ld-su" name="summary" rows="3" maxlength="600">${l.summary}</textarea></div>
      <div class="field wide"><label for="ld-o">${t('lessons.lesson.objectives')}</label><textarea class="input" id="ld-o" name="objectives" rows="3" maxlength="1000" placeholder="${t('lessons.lesson.objectivesHint')}">${l.objectives}</textarea></div>
      <div class="field wide"><label for="ld-r">${t('rubrics.attach.lesson')} <span class="muted">${t('school.optional')}</span></label><select class="input" id="ld-r" name="rubricId"><option value="">${t('rubrics.attach.none')}</option>${lessonRubric && !rubrics.some(r => r.id === lessonRubric.id) ? html`<option value="${lessonRubric.id}" selected>📏 ${lessonRubric.title}</option>` : ''}${rubrics.map(r => html`<option value="${r.id}" ${r.id === l.rubric_id ? raw('selected') : ''}>📏 ${r.title}</option>`)}</select><span class="hint">${t('rubrics.attach.lessonHint')} <a href="/teach/rubrics?school=${l.school_id}">${t('rubrics.attach.library')}</a></span><span class="err" id="ld-r-err"></span></div>
      <div class="formacts wide"><button class="btn btn-primary" type="submit">${t('school.save')}</button><button class="btn btn-danger" type="submit" form="ldel-${l.id}">${t('lessons.lesson.delete')}</button></div>
    </form></details>` : ''}
  ${l.summary ? html`<div class="panel">${paras(l.summary)}</div>` : ''}
  ${lessonRubric ? html`<section class="panel lessonrubric"><h2>${ico('📏', { size: 28 })} ${t('rubrics.attach.lessonTitle')}</h2>${rubricChip(lessonRubric.id)}</section>` : ''}
  ${l.objectives ? html`<section class="panel"><h2>${ico('🎯', { size: 28 })} ${t('lessons.lesson.objectives')}</h2><ul>${l.objectives.split('\n').filter(Boolean).map(o => html`<li>${o.replace(/^[-•*]\s*/, '')}</li>`)}</ul></section>` : ''}
  <section class="panel std-lessonpanel" id="standards" aria-labelledby="std-h"><div class="std-lessonhead"><h2 id="std-h">${ico('🎯', { size: 28 })} ${t('standards.lesson.title')}</h2>
    <a class="btn btn-sm" href="/teach/lessons/${l.id}/standards">${edit ? `+ ${t('standards.lesson.open')}` : t('standards.lesson.view')}</a></div>
    ${ccOf('').length ? ccChips(ccOf('')) : html`<p class="small muted">${ccTags.length ? t('standards.lesson.onSteps', { count: ccTags.length }) : t('standards.lesson.editorNone')}</p>`}</section>
  ${edit && st.length > 2 ? jumpNav(t, [['steps', `🪜 ${t('lessons.lesson.steps')}`, st.length], ['add-step', `➕ ${t('lessons.step.add')}`], ['assign', `📌 ${t('lessons.assign.title')}`]]) : ''}
  <h2 class="sec-h" id="steps">${ico('🪜', { size: 28 })} ${t('lessons.lesson.steps')}</h2>
  ${st.length ? html`<ol class="plain steplist">${st.map(stepView)}</ol>` : html`<p class="muted">${t('lessons.lesson.noSteps')}</p>`}
  ${edit ? html`
  <section class="panel" id="add-step"><h2>${ico('➕', { size: 28 })} ${t('lessons.step.add')}</h2>
    <form class="formgrid stepgrid" data-kind="text" data-api="/api/lessons/${l.id}/steps" data-reload novalidate>${stepFields(t, pick, {}, 'ns', { newGameLink: true, rubrics, figures: figureSteps(u) })}
      <div class="formacts"><button class="btn btn-primary" type="submit">${ico('➕', { size: 18 })} ${t('lessons.step.addButton')}</button></div></form>
    <details class="newgame" id="new-game"><summary class="small">${ico('➕', { size: 18 })} ${t('lessons.step.newGameLink')}</summary>
      <form class="formgrid" data-api="/api/lessons/${l.id}/new-game" novalidate>
        <div class="field"><label for="ng-i">${t('lessons.step.newGameIdea')}</label><input class="input" id="ng-i" name="idea" maxlength="300" required placeholder="${t('lessons.step.newGamePlaceholder')}"><span class="err" id="ng-i-err"></span></div>
        <div class="field end"><button class="btn" type="submit">${ico('🛠️', { size: 18 })} ${t('lessons.step.newGameButton')}</button></div>
        <p class="small muted wide">${t('lessons.step.newGameNote')}</p></form></details>
  </section>
  <section class="panel" id="assign"><h2>${ico('📌', { size: 28 })} ${t('lessons.assign.title')}</h2>
    ${assigned.length ? html`<ul class="plain assignedlist">${assigned.map(a => html`<li><b dir="auto">${a.name}</b>${a.opens_at ? html` · <span class="nw">${t('lessons.class.opensOn', { date: f.day(a.opens_at) })}</span>` : ''}${a.due_at ? html` · <span class="nw">${t('lessons.class.dueOn', { date: f.day(a.due_at) })}</span>` : ''} · <a class="nw" href="/class/${a.class_id}#cl-${a.id}">${t('lessons.assign.changeDates')}</a></li>`)}</ul>` : ''}
    ${justAssigned ? (L.isOpen(justAssigned)
      ? html`<p class="notice good" id="assigned-now" role="status">${ico('✅', { size: 18 })} ${t('lessons.assign.doneHere', { class: justAssigned.name })} <a href="/class/${justAssigned.class_id}/progress/${justAssigned.id}">${t('lessons.assign.seeStarted')}</a></p>`
      // It opens later: students do not see it yet, so say when they will (never "Students see it now").
      : html`<p class="notice good" id="assigned-now" data-opens-later role="status">${ico('✅', { size: 18 })} ${t('lessons.assign.doneLater', { class: justAssigned.name, date: f.day(justAssigned.opens_at) })} <a class="nw" href="/class/${justAssigned.class_id}#cl-${justAssigned.id}">${t('lessons.assign.changeDates')}</a></p>`) : ''}
    ${assignable.length ? html`<form class="formgrid assigngrid" data-api="/api/lessons/${l.id}/assign" data-reload novalidate><input type="hidden" name="from" value="lesson">
      <div class="field"><label for="as-c">${t('lessons.assign.class')}</label><select class="input" id="as-c" name="classId">${assignable.map(c => html`<option value="${c.id}" ${c.id === preselect ? raw('selected') : ''}>${c.name}</option>`)}</select></div>
      <div class="field"><label for="as-o">${t('lessons.assign.opens')}</label><input class="input" id="as-o" name="opensAt" type="date"></div>
      <div class="field"><label for="as-d">${t('lessons.assign.due')}</label><input class="input" id="as-d" name="dueAt" type="date"></div>
      ${assignToField(t, assignable, { idp: 'as-w', shown: preselect })}
      <div class="field end"><button class="btn btn-primary" type="submit">${ico('📌', { size: 18 })} ${t('lessons.assign.button')}</button></div>
      <p class="small muted wide">${t('lessons.assign.note')} ${zoneNote(t, l.school_id, req.user)}</p></form>` : html`<p class="muted">${assigned.length ? t('lessons.assign.allClasses') : t('lessons.assign.noClasses')}</p>`}
  </section>
  <form id="lc-${l.id}" hidden data-api="/api/lessons/${l.id}/copy"></form>
  ${shareForm(t, l, `lsh-${l.id}`)}
  <form id="ldel-${l.id}" hidden data-api="/api/lessons/${l.id}/delete" data-confirm="${deleteLessonConfirm(t, l)}"></form>` : ''}`;
  const back = from ? { back: `/class/${from.id}`, backLabel: from.name }
    : { back: `/teach/lessons?school=${l.school_id}${edit && l.folder_id && l.owner_id === u.id ? `&folder=${l.folder_id}` : ''}`, backLabel: t('lessons.library.title') };
  page(req, res, { title: l.title, active: 'classes', mid: true, body, head: CSS, scripts: edit ? ['/js/schools.js'] : [], ...back });
});

// ---- editor APIs
const bool = v => v === true || v === '1' || v === 'true';
router.post('/api/lessons/:id', requireUser, (req, res) => {
  const { title, summary, subject, grade, objectives, shared, rubricId } = b(req);
  if (title !== undefined && !String(title).trim()) return err(req, res, 'lessonTitle', 400, 'title');
  const r = L.updateLesson(req.user, req.params.id, { title, summary, subject, grade, objectives, shared: shared !== undefined ? bool(shared) : undefined, rubricId });
  if (!r.ok && r.code === 'rubricPick') return res.status(400).json({ error: req.t('rubrics.errors.pick'), field: 'rubricId' });
  send(req, res, r);
});
// options / standards / template / rubric: CS Quest fields (docs/cs-quest.md), set by the catalogue materialiser and APIs, not the editor form.
const stepInput = x => ({ kind: x.kind, title: x.title, body: x.body, minutes: x.minutes, gameId: x.gameId, options: x.options, standards: x.standards, template: x.template, rubric: x.rubric, rubricId: x.rubricId });
const CS_CODES = ['stepOptions', 'stepStandards', 'stepTemplate', 'stepRubric'];
const stepErr = (req, res, r) => (r.code === 'buildPrompt' || r.code === 'stepText' || r.code === 'questionText' ? err(req, res, r.code, 400, 'body') : r.code === 'pickGame' ? err(req, res, r.code, 400, 'gameId')
  : r.code === 'rubricPick' ? res.status(400).json({ error: req.t('rubrics.errors.pick'), field: 'rubricId' })
  : CS_CODES.includes(r.code) ? res.status(400).json({ error: req.t('errors.api.badRequest'), code: r.code }) : send(req, res, r));
router.post('/api/lessons/:id/steps', requireUser, (req, res) => {
  // "Figure questions": a lesson set for the step's questions, then the Figures builder (the step is made by its "Save
  // to lesson"). Anyone the Figures gate does not let in is refused like any unknown step kind.
  if (b(req).kind === L.FIGURES_KIND) {
    if (!figureSteps(req.user)) return stepErr(req, res, { ok: false, code: 'stepKind' });
    const r = FS.newLessonSet(req.user, req.params.id, { title: String(b(req).title || '').trim(), lang: req.locale });
    return r.ok ? res.json({ ok: true, redirect: `/figures/worksheets/${r.id}` }) : send(req, res, r);
  }
  const r = L.addStep(req.user, req.params.id, stepInput(b(req))); return r.ok ? res.json({ ok: true }) : stepErr(req, res, r);
});
/** "Edit questions" on a Figure step: the Figures builder on the step's lesson set (made from its snapshot if needed). */
router.post('/api/lesson-steps/:id/figures-edit', requireUser, (req, res) => {
  const r = FS.editStepSet(req.user, req.params.id, { lang: req.locale });
  return r.ok ? res.json({ ok: true, redirect: `/figures/worksheets/${r.id}` }) : no(req, res);
});
/** A Figure step's printable student sheet (?key=1: with the answer key), black on white: the lesson's editors. */
router.get('/teach/lesson-steps/:id/print', requireUser, (req, res) => {
  const t = req.t, key = req.query.key === '1', info = localeInfo(req.locale);
  const s = L.getStep(req.params.id), l = s && L.getLesson(s.lesson_id);
  const frag = FS.stepPrintHtml(req.user, req.params.id, { t, lang: req.locale || 'en', dir: info.dir, key });
  if (frag === null) return no(req, res);
  const title = s.title || l.title;
  page(req, res, {
    title: key ? t('figures.print.keyTitle', { title }) : title, head: raw(`${CSS}<link rel="stylesheet" href="/css/figures.css?v=${VERSION}">`), scripts: ['/js/figures-print.js'], bodyClass: 'fg-page fg-printpage',
    body: html`<div class="fg-printbar noprint"><nav class="fg-crumbs" aria-label="${t('figures.crumbs')}"><a href="/teach/lessons/${l.id}">${l.title}</a> <span aria-hidden="true">/</span> <b>${t('figures.print.crumb')}</b></nav>
      <div class="row"><a class="chip${key ? '' : ' on'}" href="?key=0">${t('figures.print.sheetOnly')}</a><a class="chip${key ? ' on' : ''}" href="?key=1">${t('figures.print.withKey')}</a>
      <button class="btn btn-primary" type="button" data-print>🖨️ ${t('figures.print.print')}</button></div></div>${raw(frag)}`,
  });
});
router.post('/api/lesson-steps/:id', requireUser, (req, res) => { const r = L.updateStep(req.user, req.params.id, stepInput(b(req))); return r.ok ? res.json({ ok: true }) : stepErr(req, res, r); });
router.post('/api/lesson-steps/:id/up', requireUser, (req, res) => send(req, res, L.reorderStep(req.user, req.params.id, -1)));
router.post('/api/lesson-steps/:id/down', requireUser, (req, res) => send(req, res, L.reorderStep(req.user, req.params.id, 1)));
router.post('/api/lesson-steps/:id/delete', requireUser, (req, res) => send(req, res, L.deleteStep(req.user, req.params.id)));
/** Share the teacher's own game with the school so the class can play it. */
router.post('/api/lesson-steps/:id/share-game', requireUser, async (req, res) => {
  const s = L.getStep(req.params.id); const l = s && L.getLesson(s.lesson_id);
  const g = s && games.getGame(s.game_id);
  if (!L.canEditLesson(req.user, l) || !g || g.owner_id !== req.user.id) return no(req, res);
  const r = await publish(req.user, g.id, 'school', { t: req.t });
  return r.ok ? res.json({ ok: true }) : res.status(400).json({ error: r.message });
});
/** Make a new game for this lesson with the Builder: a new Studio game, a game step pointing at it, then the Studio. */
router.post('/api/lessons/:id/new-game', requireAccount, rateLimit('studio-new', 30, 3600e3, 'studio.api.tooManyGames'), (req, res) => {
  const l = L.getLesson(req.params.id); if (!L.canEditLesson(req.user, l)) return no(req, res);
  const idea = String(b(req).idea || '').trim().slice(0, 300);
  if (!idea) return err(req, res, 'buildPrompt', 400, 'idea');
  const g = games.createGame(req.user.id, { title: l.title.slice(0, 60), icon: '🎓', category: 'learning' });
  const r = L.addStep(req.user, l.id, { kind: 'game', title: '', gameId: g.id });
  if (!r.ok) return send(req, res, r);
  audit(req.user.id, 'game.create', g.id, { lesson: l.id });
  res.json({ ok: true, redirect: `/studio/${g.id}?ask=${encodeURIComponent(idea)}` });
});
/** Assigning (from the editor or the class's Lessons tab): stay on the page, with "Assigned to {class}" after the reload.
 *  A lesson is in a class at most once; assigning one that was removed brings it back with the students' work. */
function assignReply(req, res, r, also = '') {
  if (r.ok) {
    const c = S.getClass(r.classLesson.class_id);
    // From the lesson page: back to its Assign section with "Assigned to … · See who's started" next to the form.
    const back = String((req.body && req.body.from) || '') === 'lesson' ? { redirect: `/teach/lessons/${r.classLesson.lesson_id}?assigned=${encodeURIComponent(r.classLesson.id)}#assign` } : {};
    const later = !L.isOpen(r.classLesson);
    const toast = later ? req.t('lessons.assign.doneLater', { class: c.name, date: req.fmt.day(r.classLesson.opens_at) }) : req.t(r.workBack ? 'lessons.assign.restored' : 'lessons.assign.done', { class: c.name });
    return res.json({ ok: true, toast: also ? `${toast} · ${also}` : toast, ...back });
  }
  if (r.code === 'alreadyAssigned') return res.status(400).json({ error: req.t('lessons.errors.alreadyAssigned', { class: r.className }) });
  return err(req, res, r.code, r.code === 'notFound' ? 404 : 400);
}
router.post('/api/lessons/:id/assign', requireUser, (req, res) => {
  const { classId, opensAt, dueAt } = b(req);
  const who = studentsFrom(req, res); if (!who) return;
  assignReply(req, res, L.assign(req.user, classId, req.params.id, { opensAt, dueAt, students: who.students || [] }));
});

// ================================================================ class page panels (used by routes/schools.js)
/** The class page's "Assigned to <class>" (the Games tab's sidebar, routes/game-shelf.js): the class's assigned games
 *  (and its ready-made courses' lessons and live homework) by unit, each opening its progress, with due chips, done
 *  counts, ↑ ↓ and ⋯ (dates, Scores, Student view, Save to folder, Unassign). tools: buttons for its head that only
 *  phones show (the Google Classroom button, which wider screens have in the sidebar). -> { count, pane() } */
export function assignedPane(req, c, { tools = '' } = {}) {
  // Games, not lessons (docs/decisions.md "Games, not lessons").
  const t = req.t, f = req.fmt, u = req.user;
  const plan = L.classPlan(c.id);
  const count = plan.reduce((n, g) => n + g.lessons.length, 0);
  const staff = S.schoolsOf(u.id).some(s => s.id === c.school_id && s.role !== 'student');
  // A game step shows its game's own emoji (a game's picture, never an icon); the other kinds their icon.
  const iconOf = cl => { const e = icon(cl); return cl.kind === 'game' && cl.first_game ? e : ico(e, { size: 18 }); };
  const icon = cl => { const g = cl.kind === 'game' && cl.first_game ? games.getGame(cl.first_game) : null; return g ? (g.icon || '🎮') : cl.kind === 'homework' ? '📝' : cl.kind === 'story' ? '📖' : cl.kind === 'figures' ? '📐' : cl.kind === 'proofread' ? '🔎' : cl.kind === 'manip' ? '🧮' : cl.kind === 'grammar' ? '🔤' : '📚'; };
  const pane = () => {
    const sums = count ? P.lessonSummaries(c.id) : {};
    const lessonRow = (cl, i, n) => {
      const sm = sums[cl.id] || { done: 0, students: 0, toRead: 0 };
      return html`<li class="cl-row" id="cl-${cl.id}">
      <a class="cl-main" href="/class/${c.id}/progress/${cl.id}"><b dir="auto"><span aria-hidden="true">${iconOf(cl)}</span> ${cl.title}</b><span class="small muted cl-meta">${cl.kind === 'game' ? html`<span>${ico('🎮', { size: 18 })} ${t('folders.kindGame')}</span>` : cl.kind === 'story' ? html`<span>${ico('📖', { size: 18 })} ${t('library.kindStory')}</span>` : html`<span>${staff && ['lesson', 'course'].includes(cl.kind) ? `${t('lessons.class.kindPlan')} · ` : ''}${t('lessons.stepsN', { count: cl.steps })}${cl.minutes ? ` · ${t('lessons.minutesN', { count: cl.minutes })}` : ''}</span>`}
        ${cl.opens_at && !L.isOpen(cl) ? html`<span class="chip-s">${ico('🔒', { size: 18 })} ${t('lessons.class.opensOn', { date: f.day(cl.opens_at) })}</span>` : ''}${dueChip(t, f, cl, { done: !sm.students || sm.done >= sm.students })}</span>
        ${cl.picked ? html`<span class="small cl-stats"><span class="chip-s cl-some">${ico('👥', { size: 18 })} ${t('lessons.class.someStudents', { count: sm.students })}</span></span>` : ''}
        ${sm.students ? html`<span class="small cl-stats"><span>${t('lessons.class.doneOf', { done: sm.done, students: sm.students })}</span>${sm.toRead ? html`<span class="chip-s warn">${ico('✍️', { size: 18 })} ${t('lessons.class.toReview', { count: sm.toRead })}</span>` : ''}</span>` : ''}</a>
      <span class="acts">${i ? html`<form data-api="/api/class-lessons/${cl.id}/up" data-reload><button class="btn btn-sm" type="submit" aria-label="${t('lessons.up')}">↑</button></form>` : ''}${i < n - 1 ? html`<form data-api="/api/class-lessons/${cl.id}/down" data-reload><button class="btn btn-sm" type="submit" aria-label="${t('lessons.down')}">↓</button></form>` : ''}
        <details class="inline-menu"><summary class="btn btn-sm" aria-label="${t('school.moreFor', { name: cl.title })}">⋯</summary><div class="menu">
          <form class="formgrid" data-api="/api/class-lessons/${cl.id}" data-reload data-toast="${t('school.settings.saved')}" novalidate>
            <div class="field"><label for="o-${cl.id}">${t('lessons.assign.opens')}</label><input class="input input-sm" id="o-${cl.id}" name="opensAt" type="date" value="${isoDay(cl.opens_at)}"></div>
            <div class="field"><label for="d-${cl.id}">${t('lessons.assign.due')}</label><input class="input input-sm" id="d-${cl.id}" name="dueAt" type="date" value="${isoDay(cl.due_at)}"></div>
            ${assignToField(t, [c], { idp: `w-${cl.id}`, picked: cl.picked ? L.studentsOfLesson(cl.id) : [] })}
            <p class="form-err err wide" role="alert"></p>
            <div class="field end"><button class="btn btn-sm" type="submit">${t('school.save')}</button></div></form>
          <a class="btn btn-sm" href="/class/${c.id}/progress/${cl.id}">${ico('📊', { size: 18 })} ${t('folders.scores')}</a>
          <a class="btn btn-sm" href="/class/${c.id}/lessons/${cl.id}">${ico('👀', { size: 18 })} ${t('progress.lesson.studentView')}</a>
          ${cl.kind === 'course' && L.canEditLesson(u, L.getLesson(cl.lesson_id)) ? html`<a class="btn btn-sm" href="/teach/lessons/${cl.lesson_id}?from=${c.id}">${ico('✏️', { size: 18 })} ${t('lessons.class.editLesson')}</a>` : ''}
          ${cl.kind === 'game' && cl.first_game ? html`<a class="btn btn-sm" href="/build/save?id=${cl.first_game}">${ico('📁', { size: 18 })} ${t('folders.save')}</a>` : ''}
          <form data-api="/api/class-lessons/${cl.id}/delete" data-reload data-confirm="${t('lessons.class.unassignConfirm', { name: cl.title })}"><button class="btn btn-sm btn-danger" type="submit">${t('lessons.class.unassign')}</button></form>
        </div></details></span></li>`;
    };
    return html`<div class="shelf-head"><div class="shelf-title"><h2 id="shelf-h" tabindex="-1" dir="auto">${t('folders.assignedTo', { class: c.name })}</h2><p class="small muted">${t(staff ? 'folders.assignedItemsN' : 'folders.gamesN', { count })}</p></div>${tools ? html`<div class="shelf-tools shelf-phone-tools">${tools}</div>` : ''}</div>
      ${count ? '' : html`<div class="cl-none"><span class="emo">${ico('🎮', { size: 20 })}</span><div><b>${t('folders.classEmpty')}</b>${staff ? html`<p class="small muted">${t('folders.classEmptyText')}</p>` : ''}</div></div>`}
      ${plan.map((g, gi) => g.unit || g.lessons.length ? html`<div class="unit">
        ${g.unit ? html`<div class="unit-head"><h3>${ico('🗂️', { size: 22 })} ${g.unit.name}</h3><span class="acts">
          ${gi > 1 ? html`<form data-api="/api/class-units/${g.unit.id}/up" data-reload><button class="btn btn-sm" type="submit" aria-label="${t('lessons.up')}">↑</button></form>` : ''}${gi < plan.length - 1 ? html`<form data-api="/api/class-units/${g.unit.id}/down" data-reload><button class="btn btn-sm" type="submit" aria-label="${t('lessons.down')}">↓</button></form>` : ''}
          <details class="inline-menu"><summary class="btn btn-sm" aria-label="${t('school.moreFor', { name: g.unit.name })}">⋯</summary><div class="menu">
            <form class="row" data-api="/api/class-units/${g.unit.id}" data-reload><input class="input input-sm grow" name="name" value="${g.unit.name}" maxlength="60" aria-label="${t('lessons.class.unitName')}"><button class="btn btn-sm" type="submit">${t('school.save')}</button></form>
            <form data-api="/api/class-units/${g.unit.id}/delete" data-reload data-confirm="${t('lessons.class.deleteUnitConfirm', { name: g.unit.name })}"><button class="btn btn-sm btn-danger" type="submit">${t('lessons.class.deleteUnit')}</button></form>
          </div></details></span></div>` : ''}
        ${g.lessons.length ? html`<ol class="plain cl-list">${g.lessons.map((cl, i) => lessonRow(cl, i, g.lessons.length))}</ol>` : html`<p class="small muted">${t('lessons.class.emptyUnit')}</p>`}</div>` : '')}`;
  };
  /** The phone's Assigned view (docs/decisions.md "The Games tab on phones: two clear tabs"): compact rows (cover,
   *  title, due pill, done bar, ⋯ with today's row actions), and in reorder mode (?reorder=1) big ↑/↓ buttons on each
   *  row instead of the ⋯. Ids are lib-… so they never clash with the wider screens' list in the same page. */
  const phone = ({ base, reorder = false } = {}) => {
    const sums = count ? P.lessonSummaries(c.id) : {};
    const n = count, canMove = staff && n > 1;
    const due = cl => {
      const st = L.dueState(cl);
      if (!st) return html`<span class="lib-due is-none">${ico('📅', { size: 18 })} ${t('folders.phone.noDue')}</span>`;
      if (st === 'late') return html`<span class="lib-due is-late">${ico('⏰', { size: 18 })} ${t('lessons.class.late')}</span>`;
      if (st === 'today') return html`<span class="lib-due is-soon">${ico('📅', { size: 18 })} ${t('lessons.class.dueToday')}</span>`;
      return html`<span class="lib-due is-soon">${ico('📅', { size: 18 })} ${t('lessons.class.dueOn', { date: f.day(cl.due_at, { weekday: 'short', day: 'numeric', month: 'short' }) })}</span>`;
    };
    const row = (cl, i, len) => {
      const sm = sums[cl.id] || { done: 0, students: 0 };
      const g = cl.kind === 'game' && cl.first_game ? games.getGame(cl.first_game) : null;
      const bk = cl.kind === 'story' && cl.first_story ? LIB.getBook(cl.first_story) : null;
      const thumb = g ? coverArt(g.source === 'seed' ? games.localizeGame(g) : g, 'lib-thumb') : bk ? html`<div class="coverart has-shot lib-thumb"><img src="${bk.cover.src}" alt="" loading="lazy" decoding="async" width="${bk.cover.w || 440}" height="${bk.cover.h || 330}"></div>` : html`<div class="coverart cover-sunset lib-thumb"><div class="art" aria-hidden="true">${icon(cl)}</div></div>`;
      const play = g ? (g.published_version_id || g.source === 'seed' ? `/g/${g.slug}` : null) : bk ? `/library/${bk.id}/read` : null;
      const up = t('folders.phone.up', { name: cl.title }), down = t('folders.phone.down', { name: cl.title });
      const acts = reorder && canMove
        ? html`<span class="lib-moves">${i ? html`<form data-api="/api/class-lessons/${cl.id}/up" data-reload><button class="btn lib-mv" type="submit" aria-label="${up}" title="${up}"><span class="lib-arrow" aria-hidden="true">↑</span></button></form>` : html`<span class="lib-mv-gap"></span>`}${i < len - 1 ? html`<form data-api="/api/class-lessons/${cl.id}/down" data-reload><button class="btn lib-mv" type="submit" aria-label="${down}" title="${down}"><span class="lib-arrow" aria-hidden="true">↓</span></button></form>` : html`<span class="lib-mv-gap"></span>`}</span>`
        : html`<details class="shelf-menu lib-menu"><summary class="btn btn-ghost shelf-more lib-more" aria-label="${t('school.moreFor', { name: cl.title })}" title="${t('school.moreFor', { name: cl.title })}"><span aria-hidden="true">⋯</span></summary><div class="shelf-menu-panel">
          <form class="formgrid" data-api="/api/class-lessons/${cl.id}" data-reload data-toast="${t('school.settings.saved')}" novalidate>
            <div class="field"><label for="lib-o-${cl.id}">${t('lessons.assign.opens')}</label><input class="input input-sm" id="lib-o-${cl.id}" name="opensAt" type="date" value="${isoDay(cl.opens_at)}"></div>
            <div class="field"><label for="lib-d-${cl.id}">${t('lessons.assign.due')}</label><input class="input input-sm" id="lib-d-${cl.id}" name="dueAt" type="date" value="${isoDay(cl.due_at)}"></div>
            ${assignToField(t, [c], { idp: `lib-w-${cl.id}`, picked: cl.picked ? L.studentsOfLesson(cl.id) : [] })}
            <p class="form-err err wide" role="alert"></p>
            <div class="field end"><button class="btn" type="submit">${t('school.save')}</button></div></form>
          <a class="btn" href="/class/${c.id}/progress/${cl.id}">${ico('📊', { size: 18 })} ${t('folders.scores')}</a>
          <a class="btn" href="/class/${c.id}/lessons/${cl.id}">${ico('👀', { size: 18 })} ${t('progress.lesson.studentView')}</a>
          ${play ? html`<a class="btn" href="${play}">▶ ${t('game.play')}</a>` : ''}
          ${cl.kind === 'course' && L.canEditLesson(u, L.getLesson(cl.lesson_id)) ? html`<a class="btn" href="/teach/lessons/${cl.lesson_id}?from=${c.id}">${ico('✏️', { size: 18 })} ${t('lessons.class.editLesson')}</a>` : ''}
          ${cl.kind === 'game' && cl.first_game ? html`<a class="btn" href="/build/save?id=${cl.first_game}">${ico('📁', { size: 18 })} ${t('folders.save')}</a>` : ''}
          ${i ? html`<form data-api="/api/class-lessons/${cl.id}/up" data-reload><button class="btn" type="submit">↑ ${t('folders.moveUp')}</button></form>` : ''}
          ${i < len - 1 ? html`<form data-api="/api/class-lessons/${cl.id}/down" data-reload><button class="btn" type="submit">↓ ${t('folders.moveDown')}</button></form>` : ''}
          <form data-api="/api/class-lessons/${cl.id}/delete" data-reload data-confirm="${t('lessons.class.unassignConfirm', { name: cl.title })}"><button class="btn btn-danger" type="submit">${t('lessons.class.unassign')}</button></form>
        </div></details>`;
      return html`<li class="lib-row${reorder && canMove ? ' is-moving' : ''}" data-id="${cl.id}">
        <a class="lib-cover" href="/class/${c.id}/progress/${cl.id}" tabindex="-1" aria-hidden="true">${thumb}</a>
        <div class="lib-body"><a class="lib-name" href="/class/${c.id}/progress/${cl.id}" dir="auto">${cl.title}</a>
          <span class="lib-meta">${cl.opens_at && !L.isOpen(cl) ? html`<span class="lib-due is-none">${ico('🔒', { size: 18 })} ${t('lessons.class.opensOn', { date: f.day(cl.opens_at, { day: 'numeric', month: 'short' }) })}</span>` : ''}${due(cl)}${cl.picked ? html`<span class="lib-due is-none cl-some">${ico('👥', { size: 18 })} ${t('lessons.class.someStudents', { count: sm.students })}</span>` : ''}</span>
          ${sm.students ? html`<span class="lib-done"><progress max="${sm.students}" value="${sm.done}" aria-hidden="true"></progress><span>${t('lessons.class.doneOf', { done: sm.done, students: sm.students })}</span></span>` : ''}</div>
        ${staff ? acts : ''}</li>`;
    };
    const head = html`<div class="lib-head"><div class="lib-title"><h2 id="lib-h" dir="auto">${t('folders.assignedTo', { class: c.name })}</h2><p>${t('folders.phone.assignedSub', { count: n })}</p></div>
      ${staff ? html`<div class="lib-tools">${reorder && canMove
        ? html`<a class="btn btn-primary lib-tool" href="${base}?view=assigned">${ico('✓', { size: 18 })} ${t('folders.phone.done')}</a>`
        : html`<a class="btn btn-primary lib-tool" href="${base}?view=library">+ ${t('folders.phone.addFromLibrary')}</a>${canMove ? html`<a class="btn lib-tool" href="${base}?view=assigned&amp;reorder=1">↕ ${t('folders.phone.reorder')}</a>` : ''}`}</div>` : ''}</div>`;
    return html`${head}
      ${count ? '' : html`<div class="cl-none lib-none"><span class="emo">${ico('🎮', { size: 20 })}</span><div><b>${t('folders.classEmpty')}</b>${staff ? html`<p class="small muted">${t('folders.classEmptyText')}</p>` : ''}</div></div>`}
      ${plan.map(g => (g.lessons.length ? html`${g.unit ? html`<h3 class="lib-unit" dir="auto">${ico('🗂️', { size: 22 })} ${g.unit.name}</h3>` : ''}<ol class="lib-list">${g.lessons.map((cl, i) => row(cl, i, g.lessons.length))}</ol>` : ''))}
      ${tools ? html`<div class="lib-foot">${tools}</div>` : ''}`;
  };
  return { count, pane, phone };
}
/** Student view: open lessons by unit, with how far the student has got in each. */
export function studentLessonsPanel(req, c) {
  const t = req.t, f = req.fmt;
  // Only the lessons assigned to this student (the whole class's, and those listing them).
  const plan = L.classPlan(c.id, { openOnly: true, userId: req.user.id });
  const done = P.studentSummary(c.id, req.user.id);
  const doneN = cl => Math.min(done[cl.id] || 0, cl.steps);
  const state = cl => { const d = doneN(cl); return cl.steps && d >= cl.steps ? html`<span class="stepstate is-done">${ico('✅', { size: 18 })} ${t('progress.status.done')}</span>` : d ? html`<span class="stepstate">${t('progress.student.doneOf', { done: d, total: cl.steps })}</span>` : ''; };
  if (!plan.length) return html`<section class="panel">${emptyState({ emoji: '🎮', title: t('folders.classEmpty'), text: t('folders.studentEmptyText') })}</section>`;
  return html`<section class="panel" aria-labelledby="sl-h"><h2 id="sl-h">${ico('📌', { size: 28 })} ${t('folders.assigned')}</h2>${plan.map(g => html`<div class="unit">
    ${g.unit ? html`<h3>${ico('🗂️', { size: 22 })} ${g.unit.name}</h3>` : ''}
    <ol class="plain cl-list">${g.lessons.map(cl => html`<li class="cl-row"><a class="cl-main" href="/class/${c.id}/lessons/${cl.id}"><b dir="auto">${cl.title}</b>
      <span class="small muted cl-meta"><span>${cl.kind === 'game' ? `🎮 ${t('folders.kindGame')}` : cl.kind === 'story' ? `📖 ${t('library.kindStory')}` : html`${t('lessons.stepsN', { count: cl.steps })}${cl.minutes ? ` · ${t('lessons.minutesN', { count: cl.minutes })}` : ''}`}</span>${dueChip(t, f, cl, { done: !!cl.steps && doneN(cl) >= cl.steps })}</span></a>${state(cl)}</li>`)}</ol></div>`)}</section>`;
}

// ---- class lesson APIs
router.post('/api/classes/:id/lessons', requireUser, async (req, res) => {
  const { lessonId, unitId, opensAt, dueAt } = b(req);
  const who = studentsFrom(req, res); if (!who) return;
  const r = L.assign(req.user, req.params.id, lessonId, { unitId: unitId || null, opensAt, dueAt, students: who.students || [] });
  // "Also post to Google Classroom" (routes/gclassroom.js): the assignment stands whatever Google says; its line joins the toast.
  assignReply(req, res, r, r.ok ? await gcAfterAssign(req, r.classLesson) : '');
});
router.post('/api/classes/:id/units', requireUser, (req, res) => { if (!String(b(req).name || '').trim()) return err(req, res, 'unitName', 400, 'name'); send(req, res, L.createUnit(req.user, req.params.id, b(req).name)); });
router.post('/api/class-units/:id', requireUser, (req, res) => send(req, res, L.renameUnit(req.user, req.params.id, b(req).name)));
router.post('/api/class-units/:id/up', requireUser, (req, res) => send(req, res, L.reorderUnit(req.user, req.params.id, -1)));
router.post('/api/class-units/:id/down', requireUser, (req, res) => send(req, res, L.reorderUnit(req.user, req.params.id, 1)));
router.post('/api/class-units/:id/delete', requireUser, (req, res) => send(req, res, L.deleteUnit(req.user, req.params.id)));
router.post('/api/class-lessons/:id', requireUser, (req, res) => {
  const { unitId, opensAt, dueAt } = b(req);
  const who = studentsFrom(req, res); if (!who) return;
  send(req, res, L.updateAssignment(req.user, req.params.id, { unitId, opensAt, dueAt, students: who.students }));
});
router.post('/api/class-lessons/:id/up', requireUser, (req, res) => send(req, res, L.reorderAssignment(req.user, req.params.id, -1)));
router.post('/api/class-lessons/:id/down', requireUser, (req, res) => send(req, res, L.reorderAssignment(req.user, req.params.id, 1)));
router.post('/api/class-lessons/:id/delete', requireUser, (req, res) => send(req, res, L.unassign(req.user, req.params.id)));
// The lesson page students work through (/class/:cid/lessons/:clid) and its step actions live in routes/progress.js.

// "Assign" a game (from Learn, Build or a folder): /teach/assign and /api/teach/assign-game live in routes/game-folders.js.

