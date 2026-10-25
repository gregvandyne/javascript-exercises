// Lesson plans: the teacher's library (/teach/lessons), the lesson editor (/teach/lessons/:id) and the lessons panel on a
// class page (exported for routes/schools.js). The lesson page students work through is in routes/progress.js.
// Permissions come from services/lessons.js and services/schools.js; no access means 404.
import { Router } from 'express';
import { html, raw } from '../views/html.js';
import { page, notFound, VERSION } from '../views/layout.js';
import { emptyState, gradeLabel } from '../views/components.js';
import { tHtml } from '../i18n/index.js';
import { requireUser, requireAccount } from '../auth.js';
import { rateLimit } from '../services/ratelimit.js';
import * as S from '../services/schools.js';
import * as L from '../services/lessons.js';
import * as games from '../services/games.js';
import { publish } from '../services/publish.js';
import { draftLesson } from '../services/lesson-ai.js';
import * as P from '../services/progress.js';
import { audit } from '../db.js';

export const router = Router();
const CSS = raw(`<link rel="stylesheet" href="/css/community.css?v=${VERSION}"><link rel="stylesheet" href="/css/schools.css?v=${VERSION}">`);
const b = req => req.body || {};
const err = (req, res, code, status = 400, field) => res.status(status).json({ error: req.t(`lessons.errors.${code}`), ...(field ? { field } : {}) });
const send = (req, res, r, extra = {}) => (r.ok ? res.json({ ok: true, ...extra }) : err(req, res, r.code, r.code === 'notFound' ? 404 : 400));
const no = (req, res) => (req.path.startsWith('/api/') ? res.status(404).json({ error: req.t('lessons.errors.notFound') }) : notFound(req, res, req.t('lessons.errors.notFound')));
const KIND_ICON = { game: '🎮', build: '🛠️', text: '📖', question: '✍️' };
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
/** A class lesson's due chip: 'Due today' (amber) on the day, 'Late' once the day is over (unless done), else the date. */
function dueChip(t, f, cl, { done = false } = {}) {
  const st = L.dueState(cl);
  if (!st) return '';
  if (st === 'late' && !done) return html`<span class="chip-s bad">⏰ ${t('lessons.class.late')}</span>`;
  if (st === 'today') return html`<span class="chip-s warn">📅 ${t('lessons.class.dueToday')}</span>`;
  return html`<span class="chip-s">📅 ${t('lessons.class.dueOn', { date: f.date(cl.due_at) })}</span>`;
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
router.get('/teach/lessons', requireUser, (req, res) => {
  const t = req.t; const u = req.user;
  const schools = staffSchools(u);
  if (!schools.length) return S.isPlatformAdmin(u) ? res.redirect('/admin/schools') : notFound(req, res, t('school.errors.notTeacher'));
  const school = schools.find(s => s.id === req.query.school) || schools[0];
  const tab = req.query.tab === 'shared' ? 'shared' : 'mine';
  // From a class's empty Lessons tab: the New lesson / Draft with AI form is ready, and the class comes along to the editor.
  const open = ['new', 'ai'].includes(req.query.open) ? req.query.open : null;
  const forClass = managedClass(u, req.query.class);
  const classId = forClass && forClass.school_id === school.id ? forClass.id : '';
  const tree = L.folderTree(u.id, school.id);
  const folder = req.query.folder ? tree.find(f => f.id === req.query.folder) : null;
  const q = extra => `/teach/lessons?school=${school.id}${extra || ''}`;
  const crumbs = []; for (let f = folder; f; f = tree.find(x => x.id === f.parent_id)) crumbs.unshift(f);
  const sub = tree.filter(f => (f.parent_id || null) === (folder ? folder.id : null));
  const list = L.lessonsIn(u.id, school.id, folder ? folder.id : null);
  const folderOptions = (selected, exclude = null) => html`<option value="">📚 ${t('lessons.library.top')}</option>${tree.filter(f => !exclude || (f.id !== exclude)).map(f => html`<option value="${f.id}" ${f.id === selected ? raw('selected') : ''}>${'  '.repeat(f.depth)}📁 ${f.name}</option>`)}`;
  const meta = parts => parts.filter(Boolean).map((x, i) => html`${i ? ' · ' : ''}<span class="nw">${x}</span>`);
  const mine = html`
    ${crumbs.length ? html`<nav class="crumbs" aria-label="${t('lessons.library.path')}"><a href="${q()}">📚 ${t('lessons.library.top')}</a>${crumbs.map((f, i) => html` <span aria-hidden="true">›</span> ${i === crumbs.length - 1 ? html`<span aria-current="page">📁 ${f.name}</span>` : html`<a href="${q(`&folder=${f.id}`)}">${f.name}</a>`}`)}</nav>` : ''}
    <div class="libtools">
      <form class="row grow" data-api="/api/lessons" novalidate><input type="hidden" name="schoolId" value="${school.id}"><input type="hidden" name="folderId" value="${folder ? folder.id : ''}"><input type="hidden" name="classId" value="${classId}">
        <label class="sr-only" for="nl-t">${t('lessons.lesson.title')}</label><input class="input grow" id="nl-t" name="title" maxlength="100" placeholder="${t('lessons.library.newLessonPlaceholder')}" required ${open === 'new' ? raw('autofocus') : ''}>
        <button class="btn btn-primary" type="submit">➕ ${t('lessons.library.newLesson')}</button></form>
      <details class="libdrop"><summary class="btn">📁 ${t('lessons.folder.new')}</summary>
        <form class="row newfolder" data-api="/api/lesson-folders" novalidate><input type="hidden" name="schoolId" value="${school.id}"><input type="hidden" name="parentId" value="${folder ? folder.id : ''}">
          <label class="sr-only" for="nf">${t('lessons.folder.name')}</label><input class="input grow" id="nf" name="name" maxlength="60" placeholder="${t('lessons.folder.newPlaceholder')}" required>
          <button class="btn btn-primary" type="submit">📁 ${t('lessons.folder.new')}</button></form>
        <p class="small muted">${t('lessons.folder.hint')}</p></details>
      <details class="libdrop aidraft" ${open === 'ai' ? raw('open') : ''}><summary class="btn">✨ ${t('lessons.ai.button')}</summary>
        <form class="formgrid aiform" data-api="/api/lessons/draft" novalidate><input type="hidden" name="schoolId" value="${school.id}"><input type="hidden" name="folderId" value="${folder ? folder.id : ''}"><input type="hidden" name="classId" value="${classId}">
          <div class="field wide"><label for="ai-t">${t('lessons.ai.topic')}</label><input class="input" id="ai-t" name="topic" maxlength="200" required placeholder="${t('lessons.ai.topicPlaceholder')}" ${open === 'ai' ? raw('autofocus') : ''}><span class="err" id="ai-t-err"></span></div>
          <div class="field"><label for="ai-g">${optional(t, t('school.class.grade'))}</label><input class="input" id="ai-g" name="grade" maxlength="12"></div>
          <div class="field"><label for="ai-s">${optional(t, t('school.class.subject'))}</label><input class="input" id="ai-s" name="subject" maxlength="40"></div>
          <div class="field"><label for="ai-m">${t('lessons.ai.minutes')}</label><input class="input" id="ai-m" name="minutes" type="number" min="10" max="180" value="40"></div>
          <div class="formacts"><button class="btn btn-primary" type="submit">✨ ${t('lessons.ai.make')}</button><p class="small muted">${t('lessons.ai.note')}</p></div>
        </form></details>
    </div>
    ${sub.length ? html`<ul class="plain folderlist">${sub.map((f, i) => html`<li class="panel folderrow">
      <a class="fr-name" href="${q(`&folder=${f.id}`)}">📁 ${f.name}</a>
      <span class="acts">${i ? html`<form data-api="/api/lesson-folders/${f.id}/up" data-reload><button class="btn btn-sm" type="submit" aria-label="${t('lessons.up')}">↑</button></form>` : ''}${i < sub.length - 1 ? html`<form data-api="/api/lesson-folders/${f.id}/down" data-reload><button class="btn btn-sm" type="submit" aria-label="${t('lessons.down')}">↓</button></form>` : ''}
        <details class="inline-menu"><summary class="btn btn-sm" aria-label="${t('school.moreFor', { name: f.name })}">⋯</summary><div class="menu">
          <span class="lbl" aria-hidden="true">${t('lessons.folder.name')}</span>
          <form class="row" data-api="/api/lesson-folders/${f.id}" data-reload><input class="input input-sm grow" name="name" value="${f.name}" maxlength="60" aria-label="${t('lessons.folder.name')}"><button class="btn btn-sm" type="submit">${t('school.save')}</button></form>
          <span class="lbl" aria-hidden="true">${t('lessons.moveTo')}</span>
          <form class="row" data-api="/api/lesson-folders/${f.id}/move" data-reload><select class="input input-sm grow" name="parentId" aria-label="${t('lessons.moveTo')}">${folderOptions(f.parent_id, f.id)}</select><button class="btn btn-sm" type="submit">${t('lessons.move')}</button></form>
          <form data-api="/api/lesson-folders/${f.id}/delete" data-reload data-confirm="${t('lessons.folder.deleteConfirm', { name: f.name })}"><button class="btn btn-sm btn-danger" type="submit">${t('lessons.folder.delete')}</button></form>
        </div></details></span></li>`)}</ul>` : ''}
    ${list.length ? html`<ul class="plain lessonlist">${list.map((l, i) => html`<li class="panel lessonrow">
      <a class="lr-main" href="/teach/lessons/${l.id}"><b dir="auto">${l.title}</b><span class="small muted">${meta([l.subject, gradeLabel(t, l.grade), t('lessons.stepsN', { count: l.steps })])}</span>
        <span class="lr-chips">${l.shared ? html`<span class="chip-s">🏫 ${t('lessons.lesson.sharedChip')}</span>` : ''}${l.assigned ? html`<span class="chip-s">📌 ${t('lessons.assignedN', { count: l.assigned })}</span>` : ''}</span></a>
      <span class="acts">${i ? html`<form data-api="/api/lessons/${l.id}/up" data-reload><button class="btn btn-sm" type="submit" aria-label="${t('lessons.up')}">↑</button></form>` : ''}${i < list.length - 1 ? html`<form data-api="/api/lessons/${l.id}/down" data-reload><button class="btn btn-sm" type="submit" aria-label="${t('lessons.down')}">↓</button></form>` : ''}
        <details class="inline-menu"><summary class="btn btn-sm" aria-label="${t('school.moreFor', { name: l.title })}">⋯</summary><div class="menu">
          <span class="lbl" aria-hidden="true">${t('lessons.moveTo')}</span>
          <form class="row" data-api="/api/lessons/${l.id}/move" data-reload><select class="input input-sm grow" name="folderId" aria-label="${t('lessons.moveTo')}">${folderOptions(l.folder_id)}</select><button class="btn btn-sm" type="submit">${t('lessons.move')}</button></form>
          <form data-api="/api/lessons/${l.id}/copy"><button class="btn btn-sm" type="submit">📄 ${t('lessons.lesson.duplicate')}</button></form>
          ${shareForm(t, l)}
          <form data-api="/api/lessons/${l.id}/delete" data-reload data-confirm="${deleteLessonConfirm(t, l)}"><button class="btn btn-sm btn-danger" type="submit">${t('lessons.lesson.delete')}</button></form>
        </div></details></span></li>`)}</ul>`
      : !sub.length ? emptyState({ emoji: '📚', title: t('lessons.library.empty'), text: t('lessons.library.emptyText') }) : ''}
`;
  const shared = (() => {
    const rows = L.sharedLessons(u, school.id);
    if (!rows.length) return emptyState({ emoji: '🏫', title: t('lessons.shared.empty'), text: t('lessons.shared.emptyText') });
    return html`<ul class="plain lessonlist">${rows.map(l => html`<li class="panel lessonrow">
      <a class="lr-main" href="/teach/lessons/${l.id}"><b dir="auto">${l.title}</b><span class="small muted">${meta([l.owner_name, l.subject, gradeLabel(t, l.grade), t('lessons.stepsN', { count: l.steps })])}</span></a>
      <span class="acts"><form data-api="/api/lessons/${l.id}/copy"><button class="btn btn-sm btn-primary" type="submit">📄 ${t('lessons.shared.copy')}</button></form></span></li>`)}</ul>`;
  })();
  const body = html`
  <div class="pagehead"><h1>📚 ${t('lessons.library.title')}</h1></div>
  ${schools.length > 1 ? html`<nav class="seg schoolpick" aria-label="${t('school.class.school')}">${schools.map(s => html`<a class="btn btn-sm ${s.id === school.id ? 'btn-primary' : ''}" href="/teach/lessons?school=${s.id}">${s.name}</a>`)}</nav>` : ''}
  <nav class="tabs" aria-label="${t('lessons.library.title')}"><a href="${q()}" ${tab === 'mine' ? raw('aria-current="page"') : ''}>${t('lessons.library.mine')}</a><a href="${q('&tab=shared')}" ${tab === 'shared' ? raw('aria-current="page"') : ''}>${t('lessons.library.shared')}</a></nav>
  ${tab === 'mine' ? mine : shared}`;
  page(req, res, { title: t('lessons.library.title'), active: 'classes', mid: true, body, head: CSS, back: '/teach', backLabel: t('school.teach.title') });
});

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
  let d;
  try { d = await draftLesson({ topic, grade, subject, minutes: Math.max(10, Math.min(180, +minutes || 40)), locale: req.locale, t: req.t }, catalog); }
  catch { return err(req, res, 'aiFailed', 503); }
  const r = L.createLesson(req.user, schoolId, { title: d.draft.title || topic, folderId: folderId || null, summary: d.draft.summary, subject: subject || d.draft.subject || '', grade: grade || d.draft.grade || '', objectives: d.draft.objectives });
  if (!r.ok) return err(req, res, r.code);
  for (const s of d.draft.steps || []) L.addStep(req.user, r.lesson.id, { kind: s.kind, title: s.title, body: s.body, minutes: s.minutes, gameId: s.gameId || null });
  audit(req.user.id, 'lesson.draft', r.lesson.id, { ai: d.ai });
  const cid = classParam(req.user, classId, r.lesson.school_id);
  res.json({ ok: true, redirect: `/teach/lessons/${r.lesson.id}?drafted=${d.ai ? 'ai' : 'template'}${cid ? `&class=${encodeURIComponent(cid)}` : ''}` });
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
const BODY_LABEL = { text: 'lessons.step.bodyText', question: 'lessons.step.bodyQuestion', build: 'lessons.step.bodyBuild', game: 'lessons.step.bodyGame' };
function stepFields(t, pick, s = {}, idp, { newGameLink = false } = {}) {
  const kind = s.kind || 'text';
  const opt = g => html`<option value="${g.id}" ${g.id === s.game_id ? raw('selected') : ''}>${g.icon} ${g.title}</option>`;
  const forKind = k => (k === kind ? '' : raw('hidden'));
  return html`
    <div class="field f-k"><label for="${idp}-k">${t('lessons.step.kind')}</label><select class="input" id="${idp}-k" name="kind">${KIND_ORDER.map(k => html`<option value="${k}" ${k === kind ? raw('selected') : ''}>${KIND_ICON[k]} ${t(`lessons.kinds.${k}`)}</option>`)}</select></div>
    <div class="field f-t"><label for="${idp}-t">${t('lessons.step.title')}</label><input class="input" id="${idp}-t" name="title" value="${s.title || ''}" maxlength="100"></div>
    <div class="field f-g"><label for="${idp}-g">${t('lessons.step.game')}</label><select class="input" id="${idp}-g" name="gameId"><option value="">–</option>
      ${pick.mine.length ? html`<optgroup label="${t('lessons.step.myGames')}">${pick.mine.map(opt)}</optgroup>` : ''}
      ${pick.school.length ? html`<optgroup label="${t('lessons.step.schoolGames')}">${pick.school.map(opt)}</optgroup>` : ''}
      <optgroup label="${t('lessons.step.siteGames')}">${pick.site.map(opt)}</optgroup></select><span class="err" id="${idp}-g-err"></span>
      ${newGameLink ? html`<a class="small f-glink" href="#ng-i">➕ ${t('lessons.step.newGameLink')}</a>` : ''}</div>
    <div class="field f-m"><label for="${idp}-m">${t('lessons.step.minutes')}</label><input class="input" id="${idp}-m" name="minutes" type="number" min="0" max="240" value="${s.minutes || ''}"></div>
    <div class="field f-b"><label for="${idp}-b">${KIND_ORDER.map(k => html`<span data-for-kind="${k}" ${forKind(k)}>${t(BODY_LABEL[k])}</span>`)}</label><textarea class="input" id="${idp}-b" name="body" rows="3" maxlength="4000">${s.body || ''}</textarea><span class="hint" data-for-kind="build" ${forKind('build')}>${t('lessons.step.buildHint')}</span><span class="err" id="${idp}-b-err"></span></div>`;
}
router.get('/teach/lessons/:id', requireUser, (req, res) => {
  const t = req.t, f = req.fmt, u = req.user;
  const l = L.getLesson(req.params.id);
  const edit = L.canEditLesson(u, l);
  if (!l || !(edit || L.canSeeShared(u, l))) return no(req, res);
  const school = S.getSchool(l.school_id);
  const st = L.steps(l.id);
  const total = st.reduce((n, s) => n + (s.minutes || 0), 0);
  const pick = edit ? L.gamesForPicker(u, l.school_id) : null;
  // Where the lesson is now (live classes the viewer manages: one line each), and the classes it can still go to.
  const assigned = edit ? L.assignedClasses(l.id).filter(a => !a.archived_at && S.canManageClass(u, S.getClass(a.class_id))) : [];
  const classes = S.classesOf(u.id, 'teacher').filter(c => c.school_id === l.school_id);
  const adminClasses = S.canManageSchool(u, l.school_id) ? S.classesOfSchool(l.school_id).filter(c => !classes.some(x => x.id === c.id)) : [];
  const assignable = edit ? [...classes, ...adminClasses].filter(c => !assigned.some(a => a.class_id === c.id)) : [];
  const preselect = String(req.query.class || '');
  const from = managedClass(u, req.query.from);
  const started = L.startedIn(assigned.map(a => a.id));
  const stepView = (s, i) => {
    const playable = L.playableBy(s, l.school_id);
    const work = edit ? L.stepWork(s.id) : 0;
    return html`<li class="panel stepcard">
      <div class="sc-head"><span class="sc-num">${i + 1}</span><span class="sc-kind" aria-hidden="true">${KIND_ICON[s.kind]}</span>
        <div class="sc-title"><b dir="auto">${s.title || t(`lessons.kinds.${s.kind}`)}</b><span class="small muted">${t(`lessons.kinds.${s.kind}`)}${s.minutes ? ` · ${t('lessons.minutesN', { count: s.minutes })}` : ''}</span></div>
        ${edit ? html`<span class="acts">${i ? html`<form data-api="/api/lesson-steps/${s.id}/up" data-reload><button class="btn btn-sm" type="submit" aria-label="${t('lessons.up')}">↑</button></form>` : ''}${i < st.length - 1 ? html`<form data-api="/api/lesson-steps/${s.id}/down" data-reload><button class="btn btn-sm" type="submit" aria-label="${t('lessons.down')}">↓</button></form>` : ''}</span>` : ''}</div>
      ${s.kind === 'game' ? html`<p class="sc-game">${s.game_icon} <a href="/g/${s.game_slug}">${s.game_title}</a>${playable ? '' : html` <span class="chip-s warn">⚠️ ${t('lessons.step.notShared')}</span>`}</p>
        ${!playable && edit && s.game_owner === u.id ? html`<form data-api="/api/lesson-steps/${s.id}/share-game" data-reload><button class="btn btn-sm" type="submit">🏫 ${t('lessons.step.shareGame')}</button></form>` : ''}
        ${!playable && s.game_owner === u.id ? html`<p class="small muted">${t('lessons.step.notSharedHint')} <a href="/studio/${s.game_id}">${t('lessons.step.openStudio')}</a></p>` : ''}` : ''}
      ${s.kind === 'build' ? html`<p class="sc-build" dir="auto">💬 “${s.body}”</p>` : s.body ? html`<div class="sc-body ${s.kind === 'question' ? 'q-text' : ''}">${paras(s.body)}</div>` : ''}
      ${edit ? html`<details><summary class="small">✏️ ${t('lessons.step.edit')}</summary>
        <form class="formgrid stepgrid" data-kind="${s.kind}" data-api="/api/lesson-steps/${s.id}" data-reload novalidate>${stepFields(t, pick, s, `s${s.id}`)}
          <div class="formacts"><button class="btn btn-primary" type="submit">${t('school.save')}</button><button class="btn btn-danger" type="submit" form="sd-${s.id}">${t('lessons.step.delete')}</button></div></form>
        <form id="sd-${s.id}" hidden data-api="/api/lesson-steps/${s.id}/delete" data-reload data-confirm="${work ? t('lessons.step.deleteWorkConfirm', { n: work }) : t('lessons.step.deleteConfirm')}"></form></details>` : ''}
    </li>`;
  };
  const drafted = req.query.drafted;
  const progressLinks = listOf(t, assigned, a => html`<a href="/class/${a.class_id}/progress/${a.id}">${a.name}</a>`);
  const body = html`
  <div class="pagehead"><div><span class="small muted">${school.name}</span><h1 dir="auto">${l.title}</h1>
    <p class="muted">${[l.subject, gradeLabel(t, l.grade), t('lessons.stepsN', { count: st.length }), total ? t('lessons.minutesN', { count: total }) : '', l.shared ? `🏫 ${t('lessons.lesson.sharedStatus')}` : ''].filter(Boolean).join(' · ')}</p></div>
    ${edit ? html`<div class="row edacts"><a class="btn btn-primary" href="#assign">📌 ${t('lessons.assign.button')}</a><button class="btn" type="submit" form="lc-${l.id}">📄 ${t('lessons.lesson.duplicate')}</button><button class="btn" type="submit" form="lsh-${l.id}">${l.shared ? t('lessons.lesson.unshare') : `🏫 ${t('lessons.lesson.share')}`}</button></div>`
      : html`<form data-api="/api/lessons/${l.id}/copy"><button class="btn btn-primary" type="submit">📄 ${t('lessons.shared.copy')}</button></form>`}</div>
  ${edit && req.query.copied ? html`<p class="notice good">📄 ${t('lessons.lesson.copiedNotice')}</p>` : ''}
  ${drafted ? html`<p class="notice ${drafted === 'ai' ? '' : 'warn'}">${drafted === 'ai' ? `✨ ${t('lessons.ai.done')}` : t('lessons.ai.template')}</p>` : ''}
  ${assigned.length ? html`<p class="notice livenote">📌 ${tHtml(t, 'lessons.editor.live', { classes: progressLinks, count: started })}</p>` : ''}
  ${edit ? html`<details class="panel lessondetails"><summary>✏️ ${t('lessons.lesson.editDetails')}</summary>
    <form class="formgrid" data-api="/api/lessons/${l.id}" data-reload data-toast="${t('school.settings.saved')}" novalidate>
      <div class="field wide"><label for="ld-t">${t('lessons.lesson.title')}</label><input class="input" id="ld-t" name="title" value="${l.title}" maxlength="100" required><span class="err" id="ld-t-err"></span></div>
      <div class="field"><label for="ld-s">${optional(t, t('school.class.subject'))}</label><input class="input" id="ld-s" name="subject" value="${l.subject}" maxlength="40"></div>
      <div class="field"><label for="ld-g">${optional(t, t('school.class.grade'))}</label><input class="input" id="ld-g" name="grade" value="${l.grade}" maxlength="12"></div>
      <div class="field wide"><label for="ld-su">${t('lessons.lesson.summary')}</label><textarea class="input" id="ld-su" name="summary" rows="3" maxlength="600">${l.summary}</textarea></div>
      <div class="field wide"><label for="ld-o">${t('lessons.lesson.objectives')}</label><textarea class="input" id="ld-o" name="objectives" rows="3" maxlength="1000" placeholder="${t('lessons.lesson.objectivesHint')}">${l.objectives}</textarea></div>
      <div class="formacts wide"><button class="btn btn-primary" type="submit">${t('school.save')}</button><button class="btn btn-danger" type="submit" form="ldel-${l.id}">${t('lessons.lesson.delete')}</button></div>
    </form></details>` : ''}
  ${l.summary ? html`<div class="panel">${paras(l.summary)}</div>` : ''}
  ${l.objectives ? html`<section class="panel"><h2>🎯 ${t('lessons.lesson.objectives')}</h2><ul>${l.objectives.split('\n').filter(Boolean).map(o => html`<li>${o.replace(/^[-•*]\s*/, '')}</li>`)}</ul></section>` : ''}
  <h2 class="sec-h">🪜 ${t('lessons.lesson.steps')}</h2>
  ${st.length ? html`<ol class="plain steplist">${st.map(stepView)}</ol>` : html`<p class="muted">${t('lessons.lesson.noSteps')}</p>`}
  ${edit ? html`
  <section class="panel"><h2>➕ ${t('lessons.step.add')}</h2>
    <form class="formgrid stepgrid" data-kind="text" data-api="/api/lessons/${l.id}/steps" data-reload novalidate>${stepFields(t, pick, {}, 'ns', { newGameLink: true })}
      <div class="formacts"><button class="btn btn-primary" type="submit">➕ ${t('lessons.step.addButton')}</button></div></form>
    <details class="newgame"><summary class="small">➕ ${t('lessons.step.newGameLink')}</summary>
      <form class="formgrid" data-api="/api/lessons/${l.id}/new-game" novalidate>
        <div class="field"><label for="ng-i">${t('lessons.step.newGameIdea')}</label><input class="input" id="ng-i" name="idea" maxlength="300" required placeholder="${t('lessons.step.newGamePlaceholder')}"><span class="err" id="ng-i-err"></span></div>
        <div class="field end"><button class="btn" type="submit">🛠️ ${t('lessons.step.newGameButton')}</button></div>
        <p class="small muted wide">${t('lessons.step.newGameNote')}</p></form></details>
  </section>
  <section class="panel" id="assign"><h2>📌 ${t('lessons.assign.title')}</h2>
    ${assigned.length ? html`<ul class="plain assignedlist">${assigned.map(a => html`<li><b dir="auto">${a.name}</b>${a.opens_at ? html` · <span class="nw">${t('lessons.class.opensOn', { date: f.date(a.opens_at) })}</span>` : ''}${a.due_at ? html` · <span class="nw">${t('lessons.class.dueOn', { date: f.date(a.due_at) })}</span>` : ''} · <a class="nw" href="/class/${a.class_id}#cl-${a.id}">${t('lessons.assign.changeDates')}</a></li>`)}</ul>` : ''}
    ${assignable.length ? html`<form class="formgrid assigngrid" data-api="/api/lessons/${l.id}/assign" data-reload novalidate>
      <div class="field"><label for="as-c">${t('lessons.assign.class')}</label><select class="input" id="as-c" name="classId">${assignable.map(c => html`<option value="${c.id}" ${c.id === preselect ? raw('selected') : ''}>${c.name}</option>`)}</select></div>
      <div class="field"><label for="as-o">${t('lessons.assign.opens')}</label><input class="input" id="as-o" name="opensAt" type="date"></div>
      <div class="field"><label for="as-d">${t('lessons.assign.due')}</label><input class="input" id="as-d" name="dueAt" type="date"></div>
      <div class="field end"><button class="btn btn-primary" type="submit">📌 ${t('lessons.assign.button')}</button></div>
      <p class="small muted wide">${t('lessons.assign.note')}</p></form>` : html`<p class="muted">${assigned.length ? t('lessons.assign.allClasses') : t('lessons.assign.noClasses')}</p>`}
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
  const { title, summary, subject, grade, objectives, shared } = b(req);
  if (title !== undefined && !String(title).trim()) return err(req, res, 'lessonTitle', 400, 'title');
  send(req, res, L.updateLesson(req.user, req.params.id, { title, summary, subject, grade, objectives, shared: shared !== undefined ? bool(shared) : undefined }));
});
const stepInput = x => ({ kind: x.kind, title: x.title, body: x.body, minutes: x.minutes, gameId: x.gameId });
const stepErr = (req, res, r) => (r.code === 'buildPrompt' || r.code === 'stepText' || r.code === 'questionText' ? err(req, res, r.code, 400, 'body') : r.code === 'pickGame' ? err(req, res, r.code, 400, 'gameId') : send(req, res, r));
router.post('/api/lessons/:id/steps', requireUser, (req, res) => { const r = L.addStep(req.user, req.params.id, stepInput(b(req))); return r.ok ? res.json({ ok: true }) : stepErr(req, res, r); });
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
function assignReply(req, res, r) {
  if (r.ok) {
    const c = S.getClass(r.classLesson.class_id);
    return res.json({ ok: true, toast: req.t(r.workBack ? 'lessons.assign.restored' : 'lessons.assign.done', { class: c.name }) });
  }
  if (r.code === 'alreadyAssigned') return res.status(400).json({ error: req.t('lessons.errors.alreadyAssigned', { class: r.className }) });
  return err(req, res, r.code, r.code === 'notFound' ? 404 : 400);
}
router.post('/api/lessons/:id/assign', requireUser, (req, res) => {
  const { classId, opensAt, dueAt } = b(req);
  assignReply(req, res, L.assign(req.user, classId, req.params.id, { opensAt, dueAt }));
});

// ================================================================ class page panels (used by routes/schools.js)
/** Teacher view: units and assigned lessons (each opens its progress), with ordering, dates and an "assign a lesson" form. */
export function teacherLessonsPanel(req, c) {
  const t = req.t, f = req.fmt, u = req.user;
  const plan = L.classPlan(c.id);
  const units = plan.filter(g => g.unit).map(g => g.unit);
  const count = plan.reduce((n, g) => n + g.lessons.length, 0);
  // A lesson is in a class once, and colleagues' lessons are copied first: the select lists your lessons not in it yet.
  const inClass = new Set(plan.flatMap(g => g.lessons.map(cl => cl.lesson_id)));
  const mine = L.allLessonsOf(u.id, c.school_id), avail = mine.filter(l => !inClass.has(l.id));
  // Lessons removed from this class can be brought back (with their work) by any of its teachers.
  const mineIds = new Set(mine.map(l => l.id)), back = L.removedFrom(c.id).filter(l => !mineIds.has(l.id));
  // The library is for school staff (the platform admin manages classes from the school page but has no library).
  const libOk = S.schoolsOf(u.id).some(s => s.id === c.school_id && s.role !== 'student');
  const colleagues = L.sharedCount(u, c.school_id) > 0;
  const sums = count ? P.lessonSummaries(c.id) : {};
  const lib = `/teach/lessons?school=${c.school_id}`;
  const lessonRow = (cl, i, n) => {
    const sm = sums[cl.id] || { done: 0, students: 0, toRead: 0 };
    return html`<li class="cl-row" id="cl-${cl.id}">
    <a class="cl-main" href="/class/${c.id}/progress/${cl.id}"><b dir="auto">${cl.title}</b><span class="small muted cl-meta"><span>${t('lessons.stepsN', { count: cl.steps })}${cl.minutes ? ` · ${t('lessons.minutesN', { count: cl.minutes })}` : ''}</span>
      ${cl.opens_at && !L.isOpen(cl) ? html`<span class="chip-s">🔒 ${t('lessons.class.opensOn', { date: f.date(cl.opens_at) })}</span>` : ''}${dueChip(t, f, cl, { done: !sm.students || sm.done >= sm.students })}</span>
      ${sm.students ? html`<span class="small cl-stats"><span>${t('lessons.class.doneOf', { done: sm.done, students: sm.students })}</span>${sm.toRead ? html`<span class="chip-s warn">✍️ ${t('lessons.class.toReview', { count: sm.toRead })}</span>` : ''}</span>` : ''}</a>
    <span class="acts">${i ? html`<form data-api="/api/class-lessons/${cl.id}/up" data-reload><button class="btn btn-sm" type="submit" aria-label="${t('lessons.up')}">↑</button></form>` : ''}${i < n - 1 ? html`<form data-api="/api/class-lessons/${cl.id}/down" data-reload><button class="btn btn-sm" type="submit" aria-label="${t('lessons.down')}">↓</button></form>` : ''}
      <details class="inline-menu"><summary class="btn btn-sm" aria-label="${t('school.moreFor', { name: cl.title })}">⋯</summary><div class="menu">
        <form class="formgrid" data-api="/api/class-lessons/${cl.id}" data-reload data-toast="${t('school.settings.saved')}" novalidate>
          ${units.length ? html`<div class="field"><label for="u-${cl.id}">${t('lessons.class.unit')}</label><select class="input input-sm" id="u-${cl.id}" name="unitId"><option value="">–</option>${units.map(un => html`<option value="${un.id}" ${un.id === cl.unit_id ? raw('selected') : ''}>${un.name}</option>`)}</select></div>` : ''}
          <div class="field"><label for="o-${cl.id}">${t('lessons.assign.opens')}</label><input class="input input-sm" id="o-${cl.id}" name="opensAt" type="date" value="${isoDay(cl.opens_at)}"></div>
          <div class="field"><label for="d-${cl.id}">${t('lessons.assign.due')}</label><input class="input input-sm" id="d-${cl.id}" name="dueAt" type="date" value="${isoDay(cl.due_at)}"></div>
          <div class="field end"><button class="btn btn-sm" type="submit">${t('school.save')}</button></div></form>
        <a class="btn btn-sm" href="/class/${c.id}/lessons/${cl.id}">👀 ${t('progress.lesson.studentView')}</a>
        ${L.canEditLesson(u, L.getLesson(cl.lesson_id)) ? html`<a class="btn btn-sm" href="/teach/lessons/${cl.lesson_id}?from=${c.id}">✏️ ${t('lessons.class.editLesson')}</a>` : ''}
        <form data-api="/api/class-lessons/${cl.id}/delete" data-reload data-confirm="${t('lessons.class.unassignConfirm', { name: cl.title })}"><button class="btn btn-sm btn-danger" type="submit">${t('lessons.class.unassign')}</button></form>
      </div></details></span></li>`;
  };
  return html`<section class="panel" id="lessons" aria-labelledby="ls-h"><h2 id="ls-h" class="sr-only">📚 ${t('lessons.class.title')}</h2>
    ${count ? '' : html`<div class="empty"><div class="emo" aria-hidden="true">📚</div><h3>${t('lessons.class.empty')}</h3>${libOk ? html`<p>${t('lessons.class.emptyText')}</p>
      <div class="row emptyacts"><a class="btn btn-primary" href="${lib}&class=${c.id}&open=new">➕ ${t('lessons.library.newLesson')}</a><a class="btn" href="${lib}&class=${c.id}&open=ai">✨ ${t('lessons.ai.button')}</a></div>` : ''}</div>`}
    ${plan.map((g, gi) => (g.unit || g.lessons.length) ? html`<div class="unit">
      ${g.unit ? html`<div class="unit-head"><h3>🗂️ ${g.unit.name}</h3><span class="acts">
        ${gi > 1 ? html`<form data-api="/api/class-units/${g.unit.id}/up" data-reload><button class="btn btn-sm" type="submit" aria-label="${t('lessons.up')}">↑</button></form>` : ''}${gi < plan.length - 1 ? html`<form data-api="/api/class-units/${g.unit.id}/down" data-reload><button class="btn btn-sm" type="submit" aria-label="${t('lessons.down')}">↓</button></form>` : ''}
        <details class="inline-menu"><summary class="btn btn-sm" aria-label="${t('school.moreFor', { name: g.unit.name })}">⋯</summary><div class="menu">
          <form class="row" data-api="/api/class-units/${g.unit.id}" data-reload><input class="input input-sm grow" name="name" value="${g.unit.name}" maxlength="60" aria-label="${t('lessons.class.unitName')}"><button class="btn btn-sm" type="submit">${t('school.save')}</button></form>
          <form data-api="/api/class-units/${g.unit.id}/delete" data-reload data-confirm="${t('lessons.class.deleteUnitConfirm', { name: g.unit.name })}"><button class="btn btn-sm btn-danger" type="submit">${t('lessons.class.deleteUnit')}</button></form>
        </div></details></span></div>` : ''}
      ${g.lessons.length ? html`<ol class="plain cl-list">${g.lessons.map((cl, i) => lessonRow(cl, i, g.lessons.length))}</ol>` : html`<p class="small muted">${t('lessons.class.emptyUnit')}</p>`}</div>` : '')}
    <div class="cl-tools">
      ${avail.length || back.length ? html`<form class="formgrid" data-api="/api/classes/${c.id}/lessons" data-reload novalidate>
        <div class="field"><label for="al-l">${t('lessons.class.assign')}</label><select class="input" id="al-l" name="lessonId">${back.length
          ? html`${avail.length ? html`<optgroup label="${t('lessons.library.mine')}">${avail.map(l => html`<option value="${l.id}">${l.title}</option>`)}</optgroup>` : ''}<optgroup label="${t('lessons.class.removedGroup')}">${back.map(l => html`<option value="${l.id}">${l.title}</option>`)}</optgroup>`
          : avail.map(l => html`<option value="${l.id}">${l.title}</option>`)}</select></div>
        ${units.length ? html`<div class="field"><label for="al-u">${t('lessons.class.unit')}</label><select class="input" id="al-u" name="unitId"><option value="">–</option>${units.map(un => html`<option value="${un.id}">${un.name}</option>`)}</select></div>` : ''}
        <div class="field"><label for="al-o">${t('lessons.assign.opens')}</label><input class="input" id="al-o" name="opensAt" type="date"></div>
        <div class="field"><label for="al-d">${t('lessons.assign.due')}</label><input class="input" id="al-d" name="dueAt" type="date"></div>
        <div class="field end"><button class="btn btn-primary" type="submit">📌 ${t('lessons.assign.button')}</button></div></form>` : ''}
      ${colleagues && libOk ? html`<p class="small muted">💡 ${tHtml(t, 'lessons.class.sharedHint', { tab: html`<a href="${lib}&tab=shared">${t('lessons.library.shared')}</a>` })}</p>` : ''}
      <div class="cl-more">
        ${mine.length && !avail.length && !back.length ? html`<p class="small muted allin">${t('lessons.class.allIn')}</p>` : ''}
        ${libOk ? html`<a class="btn" href="${lib}">📚 ${t('lessons.class.library')}</a>` : ''}
        <details class="libdrop unitdrop"><summary class="btn">🗂️ ${t('lessons.class.newUnit')}</summary>
          <form class="row unitform" data-api="/api/classes/${c.id}/units" data-reload novalidate><label class="sr-only" for="nu">${t('lessons.class.unitName')}</label><input class="input grow" id="nu" name="name" maxlength="60" placeholder="${t('lessons.class.newUnitPlaceholder')}" required><button class="btn btn-primary" type="submit">🗂️ ${t('lessons.class.newUnit')}</button></form>
          <p class="small muted">${t('lessons.class.unitHint')}</p></details></div>
    </div></section>`;
}
/** Student view: open lessons by unit, with how far the student has got in each. */
export function studentLessonsPanel(req, c) {
  const t = req.t, f = req.fmt;
  const plan = L.classPlan(c.id, { openOnly: true });
  const done = P.studentSummary(c.id, req.user.id);
  const doneN = cl => Math.min(done[cl.id] || 0, cl.steps);
  const state = cl => { const d = doneN(cl); return cl.steps && d >= cl.steps ? html`<span class="stepstate is-done">✅ ${t('progress.status.done')}</span>` : d ? html`<span class="stepstate">${t('progress.student.doneOf', { done: d, total: cl.steps })}</span>` : ''; };
  if (!plan.length) return html`<section class="panel">${emptyState({ emoji: '📚', title: t('classes.noLessons'), text: t('classes.noLessonsText') })}</section>`;
  return html`<section class="panel" aria-labelledby="sl-h"><h2 id="sl-h">📚 ${t('lessons.class.title')}</h2>${plan.map(g => html`<div class="unit">
    ${g.unit ? html`<h3>🗂️ ${g.unit.name}</h3>` : ''}
    <ol class="plain cl-list">${g.lessons.map(cl => html`<li class="cl-row"><a class="cl-main" href="/class/${c.id}/lessons/${cl.id}"><b dir="auto">${cl.title}</b>
      <span class="small muted cl-meta"><span>${t('lessons.stepsN', { count: cl.steps })}${cl.minutes ? ` · ${t('lessons.minutesN', { count: cl.minutes })}` : ''}</span>${dueChip(t, f, cl, { done: !!cl.steps && doneN(cl) >= cl.steps })}</span></a>${state(cl)}</li>`)}</ol></div>`)}</section>`;
}

// ---- class lesson APIs
router.post('/api/classes/:id/lessons', requireUser, (req, res) => {
  const { lessonId, unitId, opensAt, dueAt } = b(req);
  assignReply(req, res, L.assign(req.user, req.params.id, lessonId, { unitId: unitId || null, opensAt, dueAt }));
});
router.post('/api/classes/:id/units', requireUser, (req, res) => { if (!String(b(req).name || '').trim()) return err(req, res, 'unitName', 400, 'name'); send(req, res, L.createUnit(req.user, req.params.id, b(req).name)); });
router.post('/api/class-units/:id', requireUser, (req, res) => send(req, res, L.renameUnit(req.user, req.params.id, b(req).name)));
router.post('/api/class-units/:id/up', requireUser, (req, res) => send(req, res, L.reorderUnit(req.user, req.params.id, -1)));
router.post('/api/class-units/:id/down', requireUser, (req, res) => send(req, res, L.reorderUnit(req.user, req.params.id, 1)));
router.post('/api/class-units/:id/delete', requireUser, (req, res) => send(req, res, L.deleteUnit(req.user, req.params.id)));
router.post('/api/class-lessons/:id', requireUser, (req, res) => { const { unitId, opensAt, dueAt } = b(req); send(req, res, L.updateAssignment(req.user, req.params.id, { unitId, opensAt, dueAt })); });
router.post('/api/class-lessons/:id/up', requireUser, (req, res) => send(req, res, L.reorderAssignment(req.user, req.params.id, -1)));
router.post('/api/class-lessons/:id/down', requireUser, (req, res) => send(req, res, L.reorderAssignment(req.user, req.params.id, 1)));
router.post('/api/class-lessons/:id/delete', requireUser, (req, res) => send(req, res, L.unassign(req.user, req.params.id)));
// The lesson page students work through (/class/:cid/lessons/:clid) and its step actions live in routes/progress.js.
