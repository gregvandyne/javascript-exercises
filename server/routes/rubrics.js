// Rubrics in the lesson library (docs/decisions.md "Rubrics"): the teacher's rubrics, colleagues' shared ones and the CS
// Quest starters (/teach/rubrics), one rubric's editor or read-only view (/teach/rubrics/:id), its print view
// (/teach/rubrics/:id/print), and their APIs. Scoring with a rubric is on the review page (routes/progress.js).
// Permissions come from services/rubrics.js: staff of the school only; anyone else gets 404.
import { Router } from 'express';
import { html, raw } from '../views/html.js';
import { page, notFound, VERSION } from '../views/layout.js';
import { emptyState } from '../views/components.js';
import { requireUser } from '../auth.js';
import { rateLimit } from '../services/ratelimit.js';
import * as S from '../services/schools.js';
import * as R from '../services/rubrics.js';
import { draftRubric } from '../services/rubric-ai.js';
import { audit } from '../db.js';
import { rubricGrid } from '../views/rubrics.js';
import { BAND_KEY } from '../views/cs-quest.js';

export const router = Router();
const CSS = raw(`<link rel="stylesheet" href="/css/community.css?v=${VERSION}"><link rel="stylesheet" href="/css/schools.css?v=${VERSION}">`);
const b = req => req.body || {};
const err = (req, res, code, status = 400, field) => res.status(status).json({ error: req.t(`rubrics.errors.${code}`), ...(field ? { field } : {}) });
const no = (req, res) => (req.path.startsWith('/api/') ? res.status(404).json({ error: req.t('rubrics.errors.notFound') }) : notFound(req, res, req.t('rubrics.errors.notFound')));
const send = (req, res, r, extra = {}) => (r.ok ? res.json({ ok: true, ...extra }) : r.code === 'notFound' ? no(req, res) : err(req, res, r.code));
const optional = (t, label) => html`${label} <span class="muted">${t('school.optional')}</span>`;
/** The schools where the user is staff (by membership; the platform admin works from Schools instead). */
const staffSchools = u => S.schoolsOf(u.id).filter(s => s.role !== 'student');
const isStaff = (u, schoolId) => ['admin', 'teacher'].includes(S.roleIn(u, schoolId));
const pts = (t, p) => t('rubrics.pointsN', { count: +(+p).toFixed(1) });

/** The lesson library's tabs, with Rubrics (routes/lessons.js shows the same three). */
export function libraryTabs(t, schoolId, current) {
  const q = `?school=${schoolId}`;
  const cur = k => (k === current ? raw('aria-current="page"') : '');
  return html`<nav class="tabs" aria-label="${t('lessons.library.title')}"><a href="/teach/lessons${q}" ${cur('mine')}>${t('lessons.library.mine')}</a><a href="/teach/lessons${q}&tab=shared" ${cur('shared')}>${t('lessons.library.shared')}</a><a href="/teach/rubrics${q}" ${cur('rubrics')}>📏 ${t('rubrics.title')}</a></nav>`;
}
const meta = (t, r) => [t('rubrics.criteriaN', { count: r.criteria.length }), t('rubrics.levelsN', { count: r.levels.length }), t('rubrics.maxPoints', { points: pts(t, R.maxPoints(r)) })];
const metaLine = parts => parts.filter(Boolean).map((x, i) => html`${i ? ' · ' : ''}<span class="nw">${x}</span>`);

// ================================================================ library
router.get('/teach/rubrics', requireUser, (req, res) => {
  const t = req.t, u = req.user;
  const schools = staffSchools(u);
  if (!schools.length) return S.isPlatformAdmin(u) ? res.redirect('/admin/schools') : no(req, res);
  const school = schools.find(s => s.id === req.query.school) || schools[0];
  const tab = ['shared', 'starters'].includes(req.query.tab) ? req.query.tab : 'mine';
  const open = req.query.open === 'ai' ? 'ai' : null;
  const q = extra => `/teach/rubrics?school=${school.id}${extra || ''}`;
  const row = (r, own) => html`<li class="panel lessonrow rb-row">
    <a class="lr-main" href="/teach/rubrics/${r.id}"><b dir="auto">${r.title}</b><span class="small muted">${metaLine([own ? '' : r.owner_name, ...meta(t, r)])}</span>
      <span class="lr-chips">${r.shared ? html`<span class="chip-s">🏫 ${t('lessons.lesson.sharedChip')}</span>` : ''}${r.uses ? html`<span class="chip-s">📌 ${t('rubrics.usedN', { count: r.uses })}</span>` : ''}${r.source.startsWith('csq:') ? html`<span class="chip-s">💻 ${t('cs.program.title')}</span>` : ''}</span></a>
    <span class="acts">${own ? html`<details class="inline-menu"><summary class="btn btn-sm" aria-label="${t('school.moreFor', { name: r.title })}">⋯</summary><div class="menu">
        <a class="btn btn-sm" href="/teach/rubrics/${r.id}/print">🖨️ ${t('rubrics.print')}</a>
        <form data-api="/api/rubrics/${r.id}/copy"><button class="btn btn-sm" type="submit">📄 ${t('rubrics.copy')}</button></form>
        ${shareForm(t, r)}
        ${deleteForm(t, r)}
      </div></details>` : html`<form data-api="/api/rubrics/${r.id}/copy"><button class="btn btn-sm btn-primary" type="submit">📄 ${t('rubrics.copyMine')}</button></form>`}</span></li>`;
  let content;
  if (tab === 'mine') {
    const list = R.rubricsOf(u.id, school.id);
    content = html`<div class="libtools">
      <form class="row grow" data-api="/api/rubrics" novalidate><input type="hidden" name="schoolId" value="${school.id}">
        <label class="sr-only" for="nr-t">${t('rubrics.editor.title')}</label><input class="input grow" id="nr-t" name="title" maxlength="${R.LIMITS.title}" placeholder="${t('rubrics.newPlaceholder')}" required>
        <button class="btn btn-primary" type="submit">➕ ${t('rubrics.new')}</button></form>
      <details class="libdrop aidraft" ${open === 'ai' ? raw('open') : ''}><summary class="btn">✨ ${t('rubrics.ai.button')}</summary>
        <form class="formgrid aiform" data-api="/api/rubrics/draft" novalidate><input type="hidden" name="schoolId" value="${school.id}">
          <div class="field wide"><label for="rai-t">${t('rubrics.ai.task')}</label><input class="input" id="rai-t" name="task" maxlength="300" required placeholder="${t('rubrics.ai.taskPlaceholder')}"><span class="err" id="rai-t-err"></span></div>
          <div class="field"><label for="rai-g">${optional(t, t('school.class.grade'))}</label><input class="input" id="rai-g" name="grade" maxlength="12"></div>
          <div class="field"><label for="rai-l">${t('rubrics.ai.levels')}</label><select class="input" id="rai-l" name="levels">${[3, 4, 5].map(n => html`<option value="${n}" ${n === 4 ? raw('selected') : ''}>${n}</option>`)}</select></div>
          <div class="formacts wide"><button class="btn btn-primary" type="submit">✨ ${t('rubrics.ai.make')}</button><p class="small muted">${t('rubrics.ai.note')}</p></div>
        </form></details>
    </div>
    ${list.length ? html`<ul class="plain lessonlist" id="rubric-list">${list.map(r => row(r, true))}</ul>`
      : emptyState({ emoji: '📏', title: t('rubrics.empty'), text: t('rubrics.emptyText') })}`;
  } else if (tab === 'shared') {
    const list = R.sharedRubrics(u, school.id);
    content = list.length ? html`<ul class="plain lessonlist">${list.map(r => row(r, false))}</ul>` : emptyState({ emoji: '🏫', title: t('rubrics.sharedEmpty'), text: t('rubrics.sharedEmptyText') });
  } else {
    const list = R.starters();
    const bands = [...new Set(list.map(s => s.band))];
    content = html`<p class="muted">${t('rubrics.starters.intro')}</p>
      ${bands.map(band => html`<section class="panel rb-starters"><h2>💻 ${t('cs.program.title')} · ${t(BAND_KEY[band] || 'cs.band.label')}</h2>
        <ul class="plain rb-starter-list">${list.filter(s => s.band === band).map(s => html`<li class="rb-starter"><span class="rb-st-name"><b lang="en" dir="ltr">${s.title}</b><span class="small muted">${t('rubrics.criteriaN', { count: s.lines })}</span></span>
          <form data-api="/api/rubrics/import" novalidate><input type="hidden" name="schoolId" value="${school.id}"><input type="hidden" name="key" value="${s.key}"><button class="btn btn-sm" type="submit" aria-label="${t('rubrics.starters.addFor', { title: s.title })}">➕ ${t('rubrics.starters.add')}</button></form></li>`)}</ul></section>`)}`;
  }
  const body = html`
  <div class="pagehead"><h1>📏 ${t('rubrics.title')}</h1></div>
  ${schools.length > 1 ? html`<nav class="seg schoolpick" aria-label="${t('school.class.school')}">${schools.map(s => html`<a class="btn btn-sm ${s.id === school.id ? 'btn-primary' : ''}" href="/teach/rubrics?school=${s.id}">${s.name}</a>`)}</nav>` : ''}
  ${libraryTabs(t, school.id, 'rubrics')}
  <p class="muted rb-intro">${t('rubrics.intro')}</p>
  <nav class="chips rb-subtabs" aria-label="${t('rubrics.title')}"><a class="chip" href="${q()}" ${tab === 'mine' ? raw('aria-current="page"') : ''}>${t('rubrics.mine')}</a><a class="chip" href="${q('&tab=shared')}" ${tab === 'shared' ? raw('aria-current="page"') : ''}>${t('rubrics.shared')}</a><a class="chip" href="${q('&tab=starters')}" ${tab === 'starters' ? raw('aria-current="page"') : ''}>💻 ${t('rubrics.starters.title')}</a></nav>
  ${content}`;
  page(req, res, { title: t('rubrics.title'), active: 'classes', mid: true, body, head: CSS, scripts: ['/js/schools.js'], back: `/teach/lessons?school=${school.id}`, backLabel: t('lessons.library.title') });
});
function shareForm(t, r, id = null) {
  const toast = r.shared ? t('rubrics.unsharedToast') : t('rubrics.sharedToast');
  if (id) return html`<form id="${id}" hidden data-api="/api/rubrics/${r.id}/share" data-reload data-toast="${toast}"><input type="hidden" name="shared" value="${r.shared ? '0' : '1'}"></form>`;
  return html`<form data-api="/api/rubrics/${r.id}/share" data-reload data-toast="${toast}"><input type="hidden" name="shared" value="${r.shared ? '0' : '1'}"><button class="btn btn-sm" type="submit">${r.shared ? t('rubrics.unshare') : html`🏫 ${t('rubrics.share')}`}</button></form>`;
}
/** Delete: a rubric in use comes off its lessons too, and the confirm says so (detach=1). */
function deleteForm(t, r, id = null) {
  const uses = r.uses !== undefined ? r.uses : R.usage(r.id).length;
  const confirm = uses ? t('rubrics.deleteUsedConfirm', { title: r.title, count: uses }) : t('rubrics.deleteConfirm', { title: r.title });
  const inner = html`<input type="hidden" name="detach" value="${uses ? '1' : '0'}">`;
  if (id) return html`<form id="${id}" hidden data-api="/api/rubrics/${r.id}/delete" data-confirm="${confirm}">${inner}</form>`;
  return html`<form data-api="/api/rubrics/${r.id}/delete" data-reload data-confirm="${confirm}">${inner}<button class="btn btn-sm btn-danger" type="submit">${t('rubrics.delete')}</button></form>`;
}

// ================================================================ one rubric: editor / view
router.get('/teach/rubrics/:id', requireUser, (req, res) => {
  const t = req.t, u = req.user;
  const r = R.getRubric(req.params.id);
  if (!R.canSeeRubric(u, r)) return no(req, res);
  const edit = R.canEditRubric(u, r);
  const school = S.getSchool(r.school_id);
  const uses = R.usage(r.id);
  const notice = req.query.drafted ? html`<p class="notice ${req.query.drafted === 'ai' ? '' : 'warn'}">${req.query.drafted === 'ai' ? `✨ ${t('rubrics.ai.done')}` : t('rubrics.ai.template')}</p>`
    : req.query.copied ? html`<p class="notice good">📄 ${t('rubrics.copiedNotice')}</p>` : req.query.imported ? html`<p class="notice good">💻 ${t('rubrics.starters.added')}</p>` : '';
  const usedIn = uses.length ? html`<section class="panel"><h2>📌 ${t('rubrics.usedIn')}</h2><ul class="plain assignedlist">${uses.map(x => html`<li><a href="/teach/lessons/${x.lessonId}" dir="auto">${x.title}</a> <span class="small muted">${[x.whole ? t('rubrics.wholeLesson') : '', x.steps ? t('rubrics.stepsN', { count: x.steps }) : ''].filter(Boolean).join(' · ')}</span></li>`)}</ul></section>`
    : edit ? html`<p class="small muted">${t('rubrics.notUsed')}</p>` : '';
  const editor = () => html`<form class="panel rb-editor" data-api="/api/rubrics/${r.id}" data-reload data-toast="${t('school.settings.saved')}" novalidate>
    <div class="formgrid">
      <div class="field wide"><label for="re-t">${t('rubrics.editor.title')}</label><input class="input" id="re-t" name="title" value="${r.title}" maxlength="${R.LIMITS.title}" required dir="auto"><span class="err" id="re-t-err"></span></div>
      <div class="field wide"><label for="re-d">${optional(t, t('rubrics.editor.description'))}</label><textarea class="input" id="re-d" name="description" rows="2" maxlength="${R.LIMITS.description}" dir="auto">${r.description}</textarea></div>
    </div>
    <h2 class="rb-h" id="levels">🪜 ${t('rubrics.editor.levels')}</h2><p class="small muted">${t('rubrics.editor.levelsHint')}</p>
    <ol class="plain rb-lvlist">${r.levels.map((l, j) => html`<li class="rb-lvrow">
      <div class="field"><label for="re-l${j}">${t('rubrics.editor.levelLabel', { n: j + 1 })}</label><input class="input" id="re-l${j}" name="lv-${j}-label" value="${l.label}" maxlength="${R.LIMITS.label}" required dir="auto"><span class="err" id="re-l${j}-err"></span></div>
      <div class="field rb-ptsf"><label for="re-p${j}">${t('rubrics.editor.points')}</label><input class="input" id="re-p${j}" name="lv-${j}-points" type="number" min="0" max="${R.LIMITS.points}" step="0.5" value="${l.points}" required inputmode="decimal"><span class="err" id="re-p${j}-err"></span></div>
      ${r.levels.length > R.LIMITS.levels[0] ? html`<button class="btn btn-sm rb-x" type="submit" name="op" value="dropLevel:${j}" aria-label="${t('rubrics.editor.removeLevel', { name: l.label })}">✕</button>` : ''}</li>`)}</ol>
    ${r.levels.length < R.LIMITS.levels[1] ? html`<button class="btn btn-sm" type="submit" name="op" value="addLevel">➕ ${t('rubrics.editor.addLevel')}</button>` : ''}
    <h2 class="rb-h">📋 ${t('rubrics.editor.criteria')}</h2><p class="small muted">${t('rubrics.editor.criteriaHint')}</p>
    <ol class="plain rb-crlist">${r.criteria.map((c, i) => html`<li class="rb-crrow" id="crit-${i}">
      <div class="rb-crhead"><div class="field grow"><label for="re-c${i}">${t('rubrics.editor.criterionN', { n: i + 1 })}</label><input class="input" id="re-c${i}" name="cr-${i}-name" value="${c.name}" maxlength="${R.LIMITS.name}" required dir="auto"><span class="err" id="re-c${i}-err"></span></div>
        <span class="acts">${i ? html`<button class="btn btn-sm" type="submit" name="op" value="up:${i}" aria-label="${t('lessons.up')}">↑</button>` : ''}${i < r.criteria.length - 1 ? html`<button class="btn btn-sm" type="submit" name="op" value="down:${i}" aria-label="${t('lessons.down')}">↓</button>` : ''}${r.criteria.length > 1 ? html`<button class="btn btn-sm rb-x" type="submit" name="op" value="dropCriterion:${i}" aria-label="${t('rubrics.editor.removeCriterion', { name: c.name })}">✕</button>` : ''}</span></div>
      <div class="rb-descs">${r.levels.map((l, j) => html`<div class="field"><label for="re-c${i}d${j}"><span dir="auto">${l.label}</span> <span class="muted">${pts(t, l.points)}</span></label><textarea class="input" id="re-c${i}d${j}" name="cr-${i}-d-${j}" rows="3" maxlength="${R.LIMITS.desc}" dir="auto" placeholder="${t('rubrics.editor.descPlaceholder')}">${c.descs[j] || ''}</textarea></div>`)}</div>
    </li>`)}</ol>
    ${r.criteria.length < R.LIMITS.criteria[1] ? html`<button class="btn btn-sm" type="submit" name="op" value="addCriterion">➕ ${t('rubrics.editor.addCriterion')}</button>` : ''}
    <div class="formacts rb-save"><button class="btn btn-primary" type="submit">${t('school.save')}</button><span class="small muted">${t('rubrics.maxPoints', { points: pts(t, R.maxPoints(r)) })}</span></div>
  </form>`;
  const body = html`
  <div class="pagehead"><div><span class="small muted">${school ? school.name : ''}</span><h1 dir="auto">📏 ${r.title}</h1>
    <p class="muted">${metaLine([...meta(t, r), r.shared ? `🏫 ${t('rubrics.sharedStatus')}` : ''])}</p></div>
    <div class="row edacts"><a class="btn" href="/teach/rubrics/${r.id}/print">🖨️ ${t('rubrics.print')}</a>
      ${edit ? html`<button class="btn" type="submit" form="rc-${r.id}">📄 ${t('rubrics.copy')}</button><button class="btn" type="submit" form="rsh-${r.id}">${r.shared ? t('rubrics.unshare') : `🏫 ${t('rubrics.share')}`}</button>`
        : html`<button class="btn btn-primary" type="submit" form="rc-${r.id}">📄 ${t('rubrics.copyMine')}</button>`}</div></div>
  ${notice}
  ${r.description && !edit ? html`<p dir="auto">${r.description}</p>` : ''}
  ${edit ? editor() : html`<section class="panel">${rubricGrid(t, r)}</section>`}
  ${edit ? html`<details class="panel rb-preview"><summary>👀 ${t('rubrics.preview')}</summary>${rubricGrid(t, r)}</details>` : ''}
  ${usedIn}
  <form id="rc-${r.id}" hidden data-api="/api/rubrics/${r.id}/copy"></form>
  ${edit ? html`${shareForm(t, r, `rsh-${r.id}`)}<div class="row rb-danger"><button class="btn btn-danger" type="submit" form="rdel-${r.id}">${t('rubrics.delete')}</button></div>${deleteForm(t, { ...r, uses: uses.length }, `rdel-${r.id}`)}` : ''}`;
  page(req, res, { title: r.title, active: 'classes', mid: true, body, head: CSS, scripts: ['/js/schools.js'], back: `/teach/rubrics?school=${r.school_id}`, backLabel: t('rubrics.title') });
});

/** Print view: the grid black on white, with lines to write a student's name and points (no site navigation). */
router.get('/teach/rubrics/:id/print', requireUser, (req, res) => {
  const t = req.t, r = R.getRubric(req.params.id);
  if (!R.canSeeRubric(req.user, r)) return no(req, res);
  const body = html`<div class="printdoc rb-print"><div class="printbar row noprint"><a class="btn" href="/teach/rubrics/${r.id}">← ${t('rubrics.backToRubric')}</a><button class="btn btn-primary" type="button" data-print>🖨️ ${t('rubrics.print')}</button></div>
    <h1 dir="auto">${r.title}</h1>${r.description ? html`<p dir="auto">${r.description}</p>` : ''}
    <p class="rb-print-lines"><span>${t('rubrics.printName')} ____________________</span><span>${t('rubrics.printPoints', { max: +R.maxPoints(r).toFixed(1) })}</span></p>
    ${rubricGrid(t, r)}</div>`;
  page(req, res, { title: r.title, body, head: CSS, bare: true, bodyClass: 'printpage', scripts: ['/js/print.js'] });
});

// ================================================================ APIs
/** Levels and criteria from the editor's fields (lv-<j>-label / -points, cr-<i>-name, cr-<i>-d-<j>). */
function fromForm(body) {
  const max = re => Math.max(-1, ...Object.keys(body).map(k => re.exec(k)).filter(Boolean).map(m => +m[1]));
  const nl = max(/^lv-(\d{1,2})-label$/) + 1, nc = max(/^cr-(\d{1,2})-name$/) + 1;
  const levels = Array.from({ length: nl }, (_, j) => ({ label: body[`lv-${j}-label`], points: body[`lv-${j}-points`] }));
  const criteria = Array.from({ length: nc }, (_, i) => ({ name: body[`cr-${i}-name`], descs: Array.from({ length: nl }, (_, j) => body[`cr-${i}-d-${j}`] || '') }));
  return { levels: nl ? levels : undefined, criteria: nc ? criteria : undefined };
}
/** The editor's row buttons (op): add / remove a level or a criterion, move a criterion. Applied to what the form sent. */
function applyOp(t, op, levels, criteria) {
  const [name, arg] = String(op || '').split(':'); const k = +arg;
  if (name === 'addLevel' && levels.length < R.LIMITS.levels[1]) { levels.push({ label: t('rubrics.editor.newLevel'), points: Math.max(0, ...levels.map(l => +l.points || 0)) + 1 }); for (const c of criteria) c.descs.push(''); }
  else if (name === 'dropLevel' && levels.length > R.LIMITS.levels[0] && k >= 0 && k < levels.length) { levels.splice(k, 1); for (const c of criteria) c.descs.splice(k, 1); }
  else if (name === 'addCriterion' && criteria.length < R.LIMITS.criteria[1]) criteria.push({ name: t('rubrics.editor.criterionN', { n: criteria.length + 1 }), descs: levels.map(() => '') });
  else if (name === 'dropCriterion' && criteria.length > 1 && k >= 0 && k < criteria.length) criteria.splice(k, 1);
  else if ((name === 'up' || name === 'down') && k >= 0 && k < criteria.length) { const j = name === 'up' ? k - 1 : k + 1; if (j >= 0 && j < criteria.length) [criteria[k], criteria[j]] = [criteria[j], criteria[k]]; }
}
/** A failed save points at the field to fix. */
function saveErr(req, res, code, v) {
  const at = (list, bad) => list.findIndex(bad);
  if (code === 'rubricTitle') return err(req, res, code, 400, 'title');
  if (code === 'rubricLabel') { const j = at(v.levels, l => !String(l.label || '').trim()); return err(req, res, code, 400, j >= 0 ? `lv-${j}-label` : undefined); }
  if (code === 'rubricPoints') { const j = at(v.levels, l => { const p = String(l.points ?? '').trim(); return p === '' || !Number.isFinite(+p) || +p < 0 || +p > R.LIMITS.points; }); return err(req, res, code, 400, j >= 0 ? `lv-${j}-points` : undefined); }
  if (code === 'rubricName') { const i = at(v.criteria, c => !String(c.name || '').trim()); return err(req, res, code, 400, i >= 0 ? `cr-${i}-name` : undefined); }
  return err(req, res, code);
}
const blank = (t, title) => ({ title, levels: R.defaultLevels(t), criteria: [1, 2, 3].map(n => ({ name: t('rubrics.editor.criterionN', { n }), descs: [] })) });

router.post('/api/rubrics', requireUser, rateLimit('rubric-new', 120, 3600e3), (req, res) => {
  const { schoolId, title } = b(req);
  if (!String(title || '').trim()) return err(req, res, 'rubricTitle', 400, 'title');
  const r = R.createRubric(req.user, String(schoolId || ''), blank(req.t, title));
  if (!r.ok) return send(req, res, r);
  res.json({ ok: true, redirect: `/teach/rubrics/${r.rubric.id}` });
});
/** ✨ Draft a rubric with AI: only the task and grade the teacher typed are sent (never students' work). */
router.post('/api/rubrics/draft', requireUser, rateLimit('rubric-ai', 30, 3600e3), async (req, res) => {
  const { schoolId, task, grade, levels } = b(req);
  if (!S.getSchool(schoolId) || !isStaff(req.user, schoolId)) return no(req, res);
  if (!String(task || '').trim()) return err(req, res, 'task', 400, 'task');
  let d;
  try { d = await draftRubric({ task: String(task).slice(0, 300), grade: String(grade || '').slice(0, 12), levels, locale: req.locale, t: req.t }); }
  catch { return err(req, res, 'aiFailed', 503); }
  const r = R.createRubric(req.user, schoolId, d.draft, { source: d.ai ? 'ai' : '' });
  if (!r.ok) return send(req, res, r);
  audit(req.user.id, 'rubric.draft', r.rubric.id, { ai: d.ai });
  res.json({ ok: true, redirect: `/teach/rubrics/${r.rubric.id}?drafted=${d.ai ? 'ai' : 'template'}` });
});
router.post('/api/rubrics/import', requireUser, rateLimit('rubric-new', 120, 3600e3), (req, res) => {
  const { schoolId, key } = b(req);
  if (!S.getSchool(schoolId) || !isStaff(req.user, schoolId)) return no(req, res);
  const r = R.importStarter(req.user, schoolId, String(key || ''), req.t);
  if (!r.ok) return send(req, res, r);
  res.json({ ok: true, redirect: `/teach/rubrics/${r.rubric.id}?imported=1` });
});
router.post('/api/rubrics/:id', requireUser, (req, res) => {
  const body = b(req), t = req.t;
  const r = R.getRubric(req.params.id); if (!R.canEditRubric(req.user, r)) return no(req, res);
  const f = fromForm(body);
  const levels = f.levels || r.levels.map(l => ({ ...l })), criteria = f.criteria || r.criteria.map(c => ({ ...c, descs: [...c.descs] }));
  // JSON callers may send levels / criteria arrays directly.
  const lv = Array.isArray(body.levels) ? body.levels : levels, cr = Array.isArray(body.criteria) ? body.criteria : criteria;
  if (body.op) applyOp(t, body.op, lv, cr);
  const v = { title: body.title, description: body.description, levels: lv, criteria: cr };
  const out = R.updateRubric(req.user, r.id, v);
  if (!out.ok) return out.code === 'notFound' ? no(req, res) : saveErr(req, res, out.code, { levels: lv, criteria: cr });
  // A row button: back to the same place in the editor (the version in the address makes it a fresh page load).
  if (body.op) { const [name, arg] = String(body.op).split(':'); const at = /Level/.test(name) ? 'levels' : name === 'addCriterion' ? `crit-${cr.length - 1}` : `crit-${Math.max(0, Math.min(cr.length - 1, +arg + (name === 'down' ? 1 : name === 'up' ? -1 : 0)))}`;
    return res.json({ ok: true, redirect: `/teach/rubrics/${r.id}?v=${out.rubric.version}#${at}` }); }
  res.json({ ok: true });
});
router.post('/api/rubrics/:id/share', requireUser, (req, res) => {
  const v = b(req).shared;
  send(req, res, R.updateRubric(req.user, req.params.id, { shared: v === true || v === '1' || v === 'true' }));
});
router.post('/api/rubrics/:id/copy', requireUser, rateLimit('rubric-new', 120, 3600e3), (req, res) => {
  const r = R.copyRubric(req.user, req.params.id, { t: req.t });
  send(req, res, r, r.ok ? { redirect: `/teach/rubrics/${r.rubric.id}?copied=1` } : {});
});
router.post('/api/rubrics/:id/delete', requireUser, (req, res) => {
  const r0 = R.getRubric(req.params.id);
  const d = b(req).detach;
  const r = R.deleteRubric(req.user, req.params.id, { detach: d === true || d === '1' || d === 'true' });
  if (!r.ok && r.code === 'inUse') return res.status(409).json({ error: req.t('rubrics.errors.inUse', { count: r.uses.length }), code: 'inUse', uses: r.uses });
  send(req, res, r, r.ok ? { redirect: `/teach/rubrics?school=${r0.school_id}`, toast: req.t('rubrics.deletedToast') } : {});
});
