// Lesson plans: the teacher's library (/teach/lessons), the lesson editor (/teach/lessons/:id), the lessons panel on a
// class page (exported for routes/schools.js), and the lesson page students work through (/class/:cid/lessons/:clid).
// Permissions come from services/lessons.js and services/schools.js; no access means 404.
import { Router } from 'express';
import { html, raw } from '../views/html.js';
import { page, notFound } from '../views/layout.js';
import { emptyState } from '../views/components.js';
import { requireUser, requireAccount } from '../auth.js';
import { rateLimit } from '../services/ratelimit.js';
import * as S from '../services/schools.js';
import * as L from '../services/lessons.js';
import * as games from '../services/games.js';
import { publish } from '../services/publish.js';
import { draftLesson } from '../services/lesson-ai.js';
import { audit } from '../db.js';

export const router = Router();
const CSS = raw('<link rel="stylesheet" href="/css/community.css"><link rel="stylesheet" href="/css/schools.css">');
const b = req => req.body || {};
const err = (req, res, code, status = 400, field) => res.status(status).json({ error: req.t(`lessons.errors.${code}`), ...(field ? { field } : {}) });
const send = (req, res, r, extra = {}) => (r.ok ? res.json({ ok: true, ...extra }) : err(req, res, r.code, r.code === 'notFound' ? 404 : 400));
const no = (req, res) => (req.path.startsWith('/api/') ? res.status(404).json({ error: req.t('lessons.errors.notFound') }) : notFound(req, res, req.t('lessons.errors.notFound')));
const KIND_ICON = { game: '🎮', build: '🛠️', text: '📖' };
const isoDay = t => (t ? new Date(t).toISOString().slice(0, 10) : '');
const paras = text => String(text || '').split(/\n{2,}/).filter(Boolean).map(p => html`<p dir="auto">${p.split('\n').map((line, i) => html`${i ? raw('<br>') : ''}${line}`)}</p>`);

/** The schools where the user is staff (platform admins: all). */
function staffSchools(u) {
  const mine = S.schoolsOf(u.id).filter(s => s.role !== 'student');
  return S.isPlatformAdmin(u) && !mine.length ? S.listSchools().filter(s => !s.archived_at) : mine;
}

// ================================================================ library
router.get('/teach/lessons', requireUser, (req, res) => {
  const t = req.t; const u = req.user;
  const schools = staffSchools(u);
  if (!schools.length) return notFound(req, res, t('school.errors.notTeacher'));
  const school = schools.find(s => s.id === req.query.school) || schools[0];
  const tab = req.query.tab === 'shared' ? 'shared' : 'mine';
  const tree = L.folderTree(u.id, school.id);
  const folder = req.query.folder ? tree.find(f => f.id === req.query.folder) : null;
  const q = extra => `/teach/lessons?school=${school.id}${extra || ''}`;
  const crumbs = []; for (let f = folder; f; f = tree.find(x => x.id === f.parent_id)) crumbs.unshift(f);
  const sub = tree.filter(f => (f.parent_id || null) === (folder ? folder.id : null));
  const list = L.lessonsIn(u.id, school.id, folder ? folder.id : null);
  const folderOptions = (selected, exclude = null) => html`<option value="">📚 ${t('lessons.library.top')}</option>${tree.filter(f => !exclude || (f.id !== exclude)).map(f => html`<option value="${f.id}" ${f.id === selected ? raw('selected') : ''}>${'  '.repeat(f.depth)}📁 ${f.name}</option>`)}`;
  const mine = html`
    <nav class="crumbs" aria-label="${t('lessons.library.path')}"><a href="${q()}">📚 ${t('lessons.library.top')}</a>${crumbs.map(f => html` <span aria-hidden="true">›</span> <a href="${q(`&folder=${f.id}`)}">${f.name}</a>`)}</nav>
    <div class="libtools">
      <form class="row grow" data-api="/api/lessons" novalidate><input type="hidden" name="schoolId" value="${school.id}"><input type="hidden" name="folderId" value="${folder ? folder.id : ''}">
        <label class="sr-only" for="nl-t">${t('lessons.lesson.title')}</label><input class="input grow" id="nl-t" name="title" maxlength="100" placeholder="${t('lessons.library.newLessonPlaceholder')}" required>
        <button class="btn btn-primary" type="submit">➕ ${t('lessons.library.newLesson')}</button></form>
      <details class="aidraft"><summary class="btn">✨ ${t('lessons.ai.button')}</summary>
        <form class="formgrid" data-api="/api/lessons/draft" novalidate><input type="hidden" name="schoolId" value="${school.id}"><input type="hidden" name="folderId" value="${folder ? folder.id : ''}">
          <div class="field wide"><label for="ai-t">${t('lessons.ai.topic')}</label><input class="input" id="ai-t" name="topic" maxlength="200" required placeholder="${t('lessons.ai.topicPlaceholder')}"><span class="err" id="ai-t-err"></span></div>
          <div class="field"><label for="ai-g">${t('school.class.grade')}</label><input class="input" id="ai-g" name="grade" maxlength="12"></div>
          <div class="field"><label for="ai-s">${t('school.class.subject')}</label><input class="input" id="ai-s" name="subject" maxlength="40"></div>
          <div class="field"><label for="ai-m">${t('lessons.ai.minutes')}</label><input class="input" id="ai-m" name="minutes" type="number" min="10" max="180" value="40"></div>
          <div class="field end"><button class="btn btn-primary" type="submit">✨ ${t('lessons.ai.make')}</button></div>
          <p class="small muted wide">${t('lessons.ai.note')}</p>
        </form></details>
    </div>
    ${sub.length ? html`<ul class="plain folderlist">${sub.map((f, i) => html`<li class="panel folderrow">
      <a class="fr-name" href="${q(`&folder=${f.id}`)}">📁 ${f.name}</a>
      <span class="acts">${i ? html`<form data-api="/api/lesson-folders/${f.id}/up" data-reload><button class="btn btn-sm" type="submit" aria-label="${t('lessons.up')}">↑</button></form>` : ''}${i < sub.length - 1 ? html`<form data-api="/api/lesson-folders/${f.id}/down" data-reload><button class="btn btn-sm" type="submit" aria-label="${t('lessons.down')}">↓</button></form>` : ''}
        <details class="inline-menu"><summary class="btn btn-sm">⋯</summary><div class="menu">
          <form class="row" data-api="/api/lesson-folders/${f.id}" data-reload><input class="input input-sm grow" name="name" value="${f.name}" maxlength="60" aria-label="${t('lessons.folder.name')}"><button class="btn btn-sm" type="submit">${t('school.save')}</button></form>
          <form class="row" data-api="/api/lesson-folders/${f.id}/move" data-reload><select class="input input-sm grow" name="parentId" aria-label="${t('lessons.moveTo')}">${folderOptions(f.parent_id, f.id)}</select><button class="btn btn-sm" type="submit">${t('lessons.move')}</button></form>
          <form data-api="/api/lesson-folders/${f.id}/delete" data-reload data-confirm="${t('lessons.folder.deleteConfirm', { name: f.name })}"><button class="btn btn-sm btn-danger" type="submit">${t('lessons.folder.delete')}</button></form>
        </div></details></span></li>`)}</ul>` : ''}
    ${list.length ? html`<ul class="plain lessonlist">${list.map((l, i) => html`<li class="panel lessonrow">
      <a class="lr-main" href="/teach/lessons/${l.id}"><b>${l.title}</b><span class="small muted">${[l.subject, l.grade ? t('school.class.gradeN', { grade: l.grade }) : '', t('lessons.stepsN', { count: l.steps })].filter(Boolean).join(' · ')}</span>
        <span class="lr-chips">${l.shared ? html`<span class="chip-s">🏫 ${t('lessons.lesson.sharedChip')}</span>` : ''}${l.assigned ? html`<span class="chip-s">📌 ${t('lessons.assignedN', { count: l.assigned })}</span>` : ''}</span></a>
      <span class="acts">${i ? html`<form data-api="/api/lessons/${l.id}/up" data-reload><button class="btn btn-sm" type="submit" aria-label="${t('lessons.up')}">↑</button></form>` : ''}${i < list.length - 1 ? html`<form data-api="/api/lessons/${l.id}/down" data-reload><button class="btn btn-sm" type="submit" aria-label="${t('lessons.down')}">↓</button></form>` : ''}
        <details class="inline-menu"><summary class="btn btn-sm">⋯</summary><div class="menu">
          <form class="row" data-api="/api/lessons/${l.id}/move" data-reload><select class="input input-sm grow" name="folderId" aria-label="${t('lessons.moveTo')}">${folderOptions(l.folder_id)}</select><button class="btn btn-sm" type="submit">${t('lessons.move')}</button></form>
          <form data-api="/api/lessons/${l.id}/copy" data-reload><button class="btn btn-sm" type="submit">📄 ${t('lessons.lesson.duplicate')}</button></form>
          <form data-api="/api/lessons/${l.id}/delete" data-reload data-confirm="${l.assigned ? t('lessons.lesson.deleteAssignedConfirm', { name: l.title, count: l.assigned }) : t('lessons.lesson.deleteConfirm', { name: l.title })}"><button class="btn btn-sm btn-danger" type="submit">${t('lessons.lesson.delete')}</button></form>
        </div></details></span></li>`)}</ul>`
      : !sub.length ? emptyState({ emoji: '📚', title: t('lessons.library.empty'), text: t('lessons.library.emptyText') }) : ''}
    <form class="row newfolder" data-api="/api/lesson-folders" novalidate><input type="hidden" name="schoolId" value="${school.id}"><input type="hidden" name="parentId" value="${folder ? folder.id : ''}">
      <label class="sr-only" for="nf">${t('lessons.folder.name')}</label><input class="input grow" id="nf" name="name" maxlength="60" placeholder="${t('lessons.folder.newPlaceholder')}" required>
      <button class="btn" type="submit">📁 ${t('lessons.folder.new')}</button></form>`;
  const shared = (() => {
    const rows = L.sharedLessons(u, school.id);
    if (!rows.length) return emptyState({ emoji: '🏫', title: t('lessons.shared.empty'), text: t('lessons.shared.emptyText') });
    return html`<ul class="plain lessonlist">${rows.map(l => html`<li class="panel lessonrow">
      <a class="lr-main" href="/teach/lessons/${l.id}"><b>${l.title}</b><span class="small muted">${[l.owner_name, l.subject, l.grade ? t('school.class.gradeN', { grade: l.grade }) : '', t('lessons.stepsN', { count: l.steps })].filter(Boolean).join(' · ')}</span></a>
      <span class="acts"><form data-api="/api/lessons/${l.id}/copy" data-toast="${t('lessons.shared.copied')}"><button class="btn btn-sm btn-primary" type="submit">📄 ${t('lessons.shared.copy')}</button></form></span></li>`)}</ul>`;
  })();
  const body = html`
  <div class="pagehead"><h1>📚 ${t('lessons.library.title')}</h1><a class="btn" href="/teach">🍎 ${t('school.teach.title')}</a></div>
  ${schools.length > 1 ? html`<nav class="seg schoolpick" aria-label="${t('school.class.school')}">${schools.map(s => html`<a class="btn btn-sm ${s.id === school.id ? 'btn-primary' : ''}" href="/teach/lessons?school=${s.id}">${s.name}</a>`)}</nav>` : ''}
  <nav class="tabs" aria-label="${t('lessons.library.title')}"><a href="${q()}" ${tab === 'mine' ? raw('aria-current="page"') : ''}>${t('lessons.library.mine')}</a><a href="${q('&tab=shared')}" ${tab === 'shared' ? raw('aria-current="page"') : ''}>${t('lessons.library.shared')}</a></nav>
  ${tab === 'mine' ? mine : shared}`;
  page(req, res, { title: t('lessons.library.title'), active: 'classes', body, head: CSS });
});

// ---- library APIs
router.post('/api/lessons', requireUser, rateLimit('lesson-new', 120, 3600e3), (req, res) => {
  const { schoolId, folderId, title } = b(req);
  if (!String(title || '').trim()) return err(req, res, 'lessonTitle', 400, 'title');
  const r = L.createLesson(req.user, schoolId, { title, folderId: folderId || null });
  if (!r.ok) return err(req, res, r.code, r.code === 'notFound' ? 404 : 400);
  res.json({ ok: true, redirect: `/teach/lessons/${r.lesson.id}` });
});
router.post('/api/lessons/draft', requireUser, rateLimit('lesson-ai', 30, 3600e3), async (req, res) => {
  const { schoolId, folderId, topic, grade, subject, minutes } = b(req);
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
  res.json({ ok: true, redirect: `/teach/lessons/${r.lesson.id}?drafted=${d.ai ? 'ai' : 'template'}` });
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
router.post('/api/lessons/:id/copy', requireUser, (req, res) => { const r = L.copyLesson(req.user, req.params.id); send(req, res, r, r.ok ? { id: r.lesson.id } : {}); });
router.post('/api/lessons/:id/delete', requireUser, (req, res) => {
  const l = L.getLesson(req.params.id);
  const r = L.deleteLesson(req.user, req.params.id);
  send(req, res, r, r.ok && req.get('referer') && /\/teach\/lessons\/[^/?]+/.test(req.get('referer')) ? { redirect: `/teach/lessons?school=${l.school_id}${l.folder_id ? `&folder=${l.folder_id}` : ''}` } : {});
});

// ================================================================ lesson editor (and read-only view of shared lessons)
function stepFields(t, pick, s = {}, idp) {
  const opt = g => html`<option value="${g.id}" ${g.id === s.game_id ? raw('selected') : ''}>${g.icon} ${g.title}</option>`;
  return html`
    <div class="field"><label for="${idp}-k">${t('lessons.step.kind')}</label><select class="input" id="${idp}-k" name="kind">${L.STEP_KINDS.map(k => html`<option value="${k}" ${k === (s.kind || 'game') ? raw('selected') : ''}>${KIND_ICON[k]} ${t(`lessons.kinds.${k}`)}</option>`)}</select></div>
    <div class="field"><label for="${idp}-t">${t('lessons.step.title')}</label><input class="input" id="${idp}-t" name="title" value="${s.title || ''}" maxlength="100"></div>
    <div class="field"><label for="${idp}-g">${t('lessons.step.game')}</label><select class="input" id="${idp}-g" name="gameId"><option value="">–</option>
      ${pick.mine.length ? html`<optgroup label="${t('lessons.step.myGames')}">${pick.mine.map(opt)}</optgroup>` : ''}
      ${pick.school.length ? html`<optgroup label="${t('lessons.step.schoolGames')}">${pick.school.map(opt)}</optgroup>` : ''}
      <optgroup label="${t('lessons.step.siteGames')}">${pick.site.map(opt)}</optgroup></select><span class="hint">${t('lessons.step.gameHint')}</span></div>
    <div class="field"><label for="${idp}-m">${t('lessons.step.minutes')}</label><input class="input" id="${idp}-m" name="minutes" type="number" min="0" max="240" value="${s.minutes || ''}"></div>
    <div class="field wide"><label for="${idp}-b">${t('lessons.step.body')}</label><textarea class="input" id="${idp}-b" name="body" rows="3" maxlength="4000">${s.body || ''}</textarea><span class="hint">${t('lessons.step.bodyHint')}</span><span class="err" id="${idp}-b-err"></span></div>`;
}
router.get('/teach/lessons/:id', requireUser, (req, res) => {
  const t = req.t; const u = req.user;
  const l = L.getLesson(req.params.id);
  const edit = L.canEditLesson(u, l);
  if (!l || !(edit || L.canSeeShared(u, l))) return no(req, res);
  const school = S.getSchool(l.school_id);
  const st = L.steps(l.id);
  const total = st.reduce((n, s) => n + (s.minutes || 0), 0);
  const pick = edit ? L.gamesForPicker(u, l.school_id) : null;
  const classes = S.classesOf(u.id, 'teacher').filter(c => c.school_id === l.school_id);
  const adminClasses = S.canManageSchool(u, l.school_id) ? S.classesOfSchool(l.school_id).filter(c => !classes.some(x => x.id === c.id)) : [];
  const assignable = [...classes, ...adminClasses];
  const assigned = L.assignedClasses(l.id).filter(a => S.canManageClass(u, S.getClass(a.class_id)));
  const stepView = (s, i) => {
    const playable = L.playableBy(s, l.school_id);
    return html`<li class="panel stepcard">
      <div class="sc-head"><span class="sc-num">${i + 1}</span><span class="sc-kind" aria-hidden="true">${KIND_ICON[s.kind]}</span>
        <div class="sc-title"><b dir="auto">${s.title || t(`lessons.kinds.${s.kind}`)}</b><span class="small muted">${t(`lessons.kinds.${s.kind}`)}${s.minutes ? ` · ${t('lessons.minutesN', { count: s.minutes })}` : ''}</span></div>
        ${edit ? html`<span class="acts">${i ? html`<form data-api="/api/lesson-steps/${s.id}/up" data-reload><button class="btn btn-sm" type="submit" aria-label="${t('lessons.up')}">↑</button></form>` : ''}${i < st.length - 1 ? html`<form data-api="/api/lesson-steps/${s.id}/down" data-reload><button class="btn btn-sm" type="submit" aria-label="${t('lessons.down')}">↓</button></form>` : ''}</span>` : ''}</div>
      ${s.kind === 'game' ? html`<p class="sc-game">${s.game_icon} <a href="/g/${s.game_slug}">${s.game_title}</a>${playable ? '' : html` <span class="chip-s warn">⚠️ ${t('lessons.step.notShared')}</span>`}</p>
        ${!playable && edit && s.game_owner === u.id ? html`<form data-api="/api/lesson-steps/${s.id}/share-game" data-reload><button class="btn btn-sm" type="submit">🏫 ${t('lessons.step.shareGame')}</button></form>` : ''}
        ${!playable && s.game_owner === u.id ? html`<p class="small muted">${t('lessons.step.notSharedHint')} <a href="/studio/${s.game_id}">${t('lessons.step.openStudio')}</a></p>` : ''}` : ''}
      ${s.kind === 'build' ? html`<p class="sc-build" dir="auto">💬 “${s.body}”</p>` : s.body ? html`<div class="sc-body">${paras(s.body)}</div>` : ''}
      ${edit ? html`<details><summary class="small">✏️ ${t('lessons.step.edit')}</summary>
        <form class="formgrid" data-api="/api/lesson-steps/${s.id}" data-reload novalidate>${stepFields(t, pick, s, `s${s.id}`)}
          <div class="field end row"><button class="btn btn-primary" type="submit">${t('school.save')}</button></div></form>
        <form data-api="/api/lesson-steps/${s.id}/delete" data-reload data-confirm="${t('lessons.step.deleteConfirm')}"><button class="btn btn-sm btn-danger" type="submit">${t('lessons.step.delete')}</button></form></details>` : ''}
    </li>`;
  };
  const drafted = req.query.drafted;
  const body = html`
  <div class="pagehead"><div><span class="small muted">${school.name}</span><h1 dir="auto">${l.title}</h1>
    <p class="muted">${[l.subject, l.grade ? t('school.class.gradeN', { grade: l.grade }) : '', t('lessons.stepsN', { count: st.length }), total ? t('lessons.minutesN', { count: total }) : ''].filter(Boolean).join(' · ')}</p></div>
    ${edit ? '' : html`<form data-api="/api/lessons/${l.id}/copy" data-toast="${t('lessons.shared.copied')}"><button class="btn btn-primary" type="submit">📄 ${t('lessons.shared.copy')}</button></form>`}</div>
  ${drafted ? html`<p class="notice">${drafted === 'ai' ? `✨ ${t('lessons.ai.done')}` : t('lessons.ai.template')}</p>` : ''}
  ${l.summary ? html`<div class="panel">${paras(l.summary)}</div>` : ''}
  ${l.objectives ? html`<section class="panel"><h2>🎯 ${t('lessons.lesson.objectives')}</h2><ul>${l.objectives.split('\n').filter(Boolean).map(o => html`<li>${o.replace(/^[-•*]\s*/, '')}</li>`)}</ul></section>` : ''}
  <h2 class="sec-h">🪜 ${t('lessons.lesson.steps')}</h2>
  ${st.length ? html`<ol class="plain steplist">${st.map(stepView)}</ol>` : html`<p class="muted">${t('lessons.lesson.noSteps')}</p>`}
  ${edit ? html`
  <section class="panel"><h2>➕ ${t('lessons.step.add')}</h2>
    <form class="formgrid" data-api="/api/lessons/${l.id}/steps" data-reload novalidate>${stepFields(t, pick, {}, 'ns')}
      <div class="field end"><button class="btn btn-primary" type="submit">➕ ${t('lessons.step.addButton')}</button></div></form>
    <details class="newgame"><summary class="small">✨ ${t('lessons.step.newGame')}</summary>
      <form class="formgrid" data-api="/api/lessons/${l.id}/new-game" novalidate>
        <div class="field wide"><label for="ng-i">${t('lessons.step.newGameIdea')}</label><input class="input" id="ng-i" name="idea" maxlength="300" required placeholder="${t('lessons.step.newGamePlaceholder')}"><span class="err" id="ng-i-err"></span></div>
        <div class="field end"><button class="btn" type="submit">🛠️ ${t('lessons.step.newGameButton')}</button></div>
        <p class="small muted wide">${t('lessons.step.newGameNote')}</p></form></details>
  </section>
  <section class="panel"><h2>📌 ${t('lessons.assign.title')}</h2>
    ${assigned.length ? html`<p class="small">${t('lessons.assign.already')} ${assigned.map((a, i) => html`${i ? ', ' : ''}<a href="/class/${a.class_id}">${a.name}</a>`)}</p>` : ''}
    ${assignable.length ? html`<form class="formgrid" data-api="/api/lessons/${l.id}/assign" novalidate>
      <div class="field"><label for="as-c">${t('lessons.assign.class')}</label><select class="input" id="as-c" name="classId">${assignable.map(c => html`<option value="${c.id}">${c.name}</option>`)}</select></div>
      <div class="field"><label for="as-o">${t('lessons.assign.opens')}</label><input class="input" id="as-o" name="opensAt" type="date"></div>
      <div class="field"><label for="as-d">${t('lessons.assign.due')}</label><input class="input" id="as-d" name="dueAt" type="date"></div>
      <div class="field end"><button class="btn btn-primary" type="submit">📌 ${t('lessons.assign.button')}</button></div>
      <p class="small muted wide">${t('lessons.assign.note')}</p></form>` : html`<p class="muted">${t('lessons.assign.noClasses')}</p>`}
  </section>
  <details class="panel"><summary>⚙️ ${t('lessons.lesson.details')}</summary>
    <form class="formgrid" data-api="/api/lessons/${l.id}" data-reload data-toast="${t('school.settings.saved')}" novalidate>
      <div class="field wide"><label for="ld-t">${t('lessons.lesson.title')}</label><input class="input" id="ld-t" name="title" value="${l.title}" maxlength="100" required><span class="err" id="ld-t-err"></span></div>
      <div class="field"><label for="ld-s">${t('school.class.subject')}</label><input class="input" id="ld-s" name="subject" value="${l.subject}" maxlength="40"></div>
      <div class="field"><label for="ld-g">${t('school.class.grade')}</label><input class="input" id="ld-g" name="grade" value="${l.grade}" maxlength="12"></div>
      <div class="field"><label for="ld-sh">${t('lessons.lesson.share')}</label><select class="input" id="ld-sh" name="shared"><option value="0" ${l.shared ? '' : raw('selected')}>${t('lessons.lesson.shareNo')}</option><option value="1" ${l.shared ? raw('selected') : ''}>${t('lessons.lesson.shareYes')}</option></select></div>
      <div class="field wide"><label for="ld-su">${t('lessons.lesson.summary')}</label><textarea class="input" id="ld-su" name="summary" rows="3" maxlength="600">${l.summary}</textarea></div>
      <div class="field wide"><label for="ld-o">${t('lessons.lesson.objectives')}</label><textarea class="input" id="ld-o" name="objectives" rows="3" maxlength="1000" placeholder="${t('lessons.lesson.objectivesHint')}">${l.objectives}</textarea></div>
      <div class="field end"><button class="btn btn-primary" type="submit">${t('school.save')}</button></div>
    </form>
    <form data-api="/api/lessons/${l.id}/copy" data-toast="${t('lessons.lesson.duplicated')}"><button class="btn" type="submit">📄 ${t('lessons.lesson.duplicate')}</button></form>
    <form data-api="/api/lessons/${l.id}/delete" data-confirm="${assigned.length ? t('lessons.lesson.deleteAssignedConfirm', { name: l.title, count: assigned.length }) : t('lessons.lesson.deleteConfirm', { name: l.title })}"><button class="btn btn-danger" type="submit">${t('lessons.lesson.delete')}</button></form>
  </details>` : ''}`;
  page(req, res, { title: l.title, active: 'classes', body, head: CSS, back: `/teach/lessons?school=${l.school_id}${edit && l.folder_id ? `&folder=${l.folder_id}` : ''}`, backLabel: t('lessons.library.title') });
});

// ---- editor APIs
const bool = v => v === true || v === '1' || v === 'true';
router.post('/api/lessons/:id', requireUser, (req, res) => {
  const { title, summary, subject, grade, objectives, shared } = b(req);
  if (title !== undefined && !String(title).trim()) return err(req, res, 'lessonTitle', 400, 'title');
  send(req, res, L.updateLesson(req.user, req.params.id, { title, summary, subject, grade, objectives, shared: shared !== undefined ? bool(shared) : undefined }));
});
const stepInput = x => ({ kind: x.kind, title: x.title, body: x.body, minutes: x.minutes, gameId: x.gameId });
const stepErr = (req, res, r) => (r.code === 'buildPrompt' || r.code === 'stepText' ? err(req, res, r.code, 400, 'body') : send(req, res, r));
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
router.post('/api/lessons/:id/assign', requireUser, (req, res) => {
  const { classId, opensAt, dueAt, unitId } = b(req);
  const r = L.assign(req.user, classId, req.params.id, { opensAt, dueAt, unitId: unitId || null });
  send(req, res, r, r.ok ? { redirect: `/class/${classId}#lessons` } : {});
});

// ================================================================ class page panels (used by routes/schools.js)
/** Teacher view: units and assigned lessons, with ordering, dates and an "assign a lesson" form. */
export function teacherLessonsPanel(req, c) {
  const t = req.t, f = req.fmt, u = req.user;
  const plan = L.classPlan(c.id);
  const units = plan.filter(g => g.unit).map(g => g.unit);
  const mine = L.allLessonsOf(u.id, c.school_id), shared = L.sharedLessons(u, c.school_id);
  const lessonRow = (cl, i, n) => html`<li class="cl-row">
    <a class="cl-main" href="/class/${c.id}/lessons/${cl.id}"><b>${cl.title}</b><span class="small muted">${t('lessons.stepsN', { count: cl.steps })}${cl.minutes ? ` · ${t('lessons.minutesN', { count: cl.minutes })}` : ''}
      ${cl.opens_at && !L.isOpen(cl) ? html` · <span class="chip-s">🔒 ${t('lessons.class.opensOn', { date: f.date(cl.opens_at) })}</span>` : ''}${cl.due_at ? html` · <span class="chip-s">📅 ${t('lessons.class.dueOn', { date: f.date(cl.due_at) })}</span>` : ''}</span></a>
    <span class="acts">${i ? html`<form data-api="/api/class-lessons/${cl.id}/up" data-reload><button class="btn btn-sm" type="submit" aria-label="${t('lessons.up')}">↑</button></form>` : ''}${i < n - 1 ? html`<form data-api="/api/class-lessons/${cl.id}/down" data-reload><button class="btn btn-sm" type="submit" aria-label="${t('lessons.down')}">↓</button></form>` : ''}
      <details class="inline-menu"><summary class="btn btn-sm">⋯</summary><div class="menu">
        <form class="formgrid" data-api="/api/class-lessons/${cl.id}" data-reload novalidate>
          ${units.length ? html`<div class="field"><label for="u-${cl.id}">${t('lessons.class.unit')}</label><select class="input input-sm" id="u-${cl.id}" name="unitId"><option value="">–</option>${units.map(un => html`<option value="${un.id}" ${un.id === cl.unit_id ? raw('selected') : ''}>${un.name}</option>`)}</select></div>` : ''}
          <div class="field"><label for="o-${cl.id}">${t('lessons.assign.opens')}</label><input class="input input-sm" id="o-${cl.id}" name="opensAt" type="date" value="${isoDay(cl.opens_at)}"></div>
          <div class="field"><label for="d-${cl.id}">${t('lessons.assign.due')}</label><input class="input input-sm" id="d-${cl.id}" name="dueAt" type="date" value="${isoDay(cl.due_at)}"></div>
          <div class="field end"><button class="btn btn-sm" type="submit">${t('school.save')}</button></div></form>
        ${L.canEditLesson(u, L.getLesson(cl.lesson_id)) ? html`<a class="btn btn-sm" href="/teach/lessons/${cl.lesson_id}">✏️ ${t('lessons.class.editLesson')}</a>` : ''}
        <form data-api="/api/class-lessons/${cl.id}/delete" data-reload data-confirm="${t('lessons.class.unassignConfirm', { name: cl.title })}"><button class="btn btn-sm btn-danger" type="submit">${t('lessons.class.unassign')}</button></form>
      </div></details></span></li>`;
  return html`<section class="panel" id="lessons" aria-labelledby="ls-h"><h2 id="ls-h">📚 ${t('lessons.class.title')}</h2>
    ${plan.some(g => g.lessons.length) || units.length ? plan.map((g, gi) => (g.unit || g.lessons.length) ? html`<div class="unit">
      ${g.unit ? html`<div class="unit-head"><h3>🗂️ ${g.unit.name}</h3><span class="acts">
        ${gi > 1 ? html`<form data-api="/api/class-units/${g.unit.id}/up" data-reload><button class="btn btn-sm" type="submit" aria-label="${t('lessons.up')}">↑</button></form>` : ''}${gi < plan.length - 1 ? html`<form data-api="/api/class-units/${g.unit.id}/down" data-reload><button class="btn btn-sm" type="submit" aria-label="${t('lessons.down')}">↓</button></form>` : ''}
        <details class="inline-menu"><summary class="btn btn-sm">⋯</summary><div class="menu">
          <form class="row" data-api="/api/class-units/${g.unit.id}" data-reload><input class="input input-sm grow" name="name" value="${g.unit.name}" maxlength="60" aria-label="${t('lessons.class.unitName')}"><button class="btn btn-sm" type="submit">${t('school.save')}</button></form>
          <form data-api="/api/class-units/${g.unit.id}/delete" data-reload data-confirm="${t('lessons.class.deleteUnitConfirm', { name: g.unit.name })}"><button class="btn btn-sm btn-danger" type="submit">${t('lessons.class.deleteUnit')}</button></form>
        </div></details></span></div>` : ''}
      ${g.lessons.length ? html`<ol class="plain cl-list">${g.lessons.map((cl, i) => lessonRow(cl, i, g.lessons.length))}</ol>` : html`<p class="small muted">${t('lessons.class.emptyUnit')}</p>`}</div>` : '')
    : html`<p class="muted">${t('lessons.class.none')}</p>`}
    <div class="cl-tools">
      ${mine.length || shared.length ? html`<form class="formgrid" data-api="/api/classes/${c.id}/lessons" data-reload novalidate>
        <div class="field"><label for="al-l">${t('lessons.class.assign')}</label><select class="input" id="al-l" name="lessonId">
          ${mine.length ? html`<optgroup label="${t('lessons.library.mine')}">${mine.map(l => html`<option value="${l.id}">${l.title}</option>`)}</optgroup>` : ''}
          ${shared.length ? html`<optgroup label="${t('lessons.library.shared')}">${shared.map(l => html`<option value="${l.id}">${l.title} · ${l.owner_name}</option>`)}</optgroup>` : ''}</select></div>
        ${units.length ? html`<div class="field"><label for="al-u">${t('lessons.class.unit')}</label><select class="input" id="al-u" name="unitId"><option value="">–</option>${units.map(un => html`<option value="${un.id}">${un.name}</option>`)}</select></div>` : ''}
        <div class="field"><label for="al-o">${t('lessons.assign.opens')}</label><input class="input" id="al-o" name="opensAt" type="date"></div>
        <div class="field"><label for="al-d">${t('lessons.assign.due')}</label><input class="input" id="al-d" name="dueAt" type="date"></div>
        <div class="field end"><button class="btn btn-primary" type="submit">📌 ${t('lessons.assign.button')}</button></div></form>` : ''}
      <div class="row wrap"><a class="btn" href="/teach/lessons?school=${c.school_id}">📚 ${t('lessons.class.library')}</a>
        <form class="row" data-api="/api/classes/${c.id}/units" data-reload novalidate><label class="sr-only" for="nu">${t('lessons.class.unitName')}</label><input class="input" id="nu" name="name" maxlength="60" placeholder="${t('lessons.class.newUnitPlaceholder')}" required><button class="btn" type="submit">🗂️ ${t('lessons.class.newUnit')}</button></form></div>
    </div></section>`;
}
/** Student view: open lessons by unit. */
export function studentLessonsPanel(req, c) {
  const t = req.t, f = req.fmt;
  const plan = L.classPlan(c.id, { openOnly: true });
  if (!plan.length) return html`<section class="panel">${emptyState({ emoji: '📚', title: t('classes.noLessons'), text: t('classes.noLessonsText') })}</section>`;
  return html`<section class="panel" aria-labelledby="sl-h"><h2 id="sl-h">📚 ${t('lessons.class.title')}</h2>${plan.map(g => html`<div class="unit">
    ${g.unit ? html`<h3>🗂️ ${g.unit.name}</h3>` : ''}
    <ol class="plain cl-list">${g.lessons.map(cl => html`<li class="cl-row"><a class="cl-main" href="/class/${c.id}/lessons/${cl.id}"><b>${cl.title}</b>
      <span class="small muted">${t('lessons.stepsN', { count: cl.steps })}${cl.minutes ? ` · ${t('lessons.minutesN', { count: cl.minutes })}` : ''}${cl.due_at ? html` · <span class="chip-s">📅 ${t('lessons.class.dueOn', { date: f.date(cl.due_at) })}</span>` : ''}</span></a></li>`)}</ol></div>`)}</section>`;
}

// ---- class lesson APIs
router.post('/api/classes/:id/lessons', requireUser, (req, res) => {
  const { lessonId, unitId, opensAt, dueAt } = b(req);
  send(req, res, L.assign(req.user, req.params.id, lessonId, { unitId: unitId || null, opensAt, dueAt }));
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

// ================================================================ the lesson as the class sees it
router.get('/class/:cid/lessons/:clid', requireUser, (req, res) => {
  const t = req.t, f = req.fmt, u = req.user;
  const cl = L.getClassLesson(req.params.clid);
  if (!cl || cl.class_id !== req.params.cid || !L.canViewClassLesson(u, cl)) return no(req, res);
  const c = S.getClass(cl.class_id), l = L.getLesson(cl.lesson_id), st = L.steps(l.id);
  const teacher = S.canManageClass(u, c);
  const body = html`
  <div class="pagehead"><div><h1 dir="auto">${l.title}</h1>
    <p class="muted">${[t('lessons.stepsN', { count: st.length }), cl.due_at ? t('lessons.class.dueOn', { date: f.date(cl.due_at) }) : ''].filter(Boolean).join(' · ')}</p></div>
    ${teacher && L.canEditLesson(u, l) ? html`<a class="btn" href="/teach/lessons/${l.id}">✏️ ${t('lessons.class.editLesson')}</a>` : ''}</div>
  ${teacher ? html`<p class="notice">👀 ${t('lessons.view.teacherPreview')}</p>` : ''}
  ${l.summary ? html`<div class="panel">${paras(l.summary)}</div>` : ''}
  <ol class="plain steplist">${st.map((s, i) => html`<li class="panel stepcard">
    <div class="sc-head"><span class="sc-num">${i + 1}</span><span class="sc-kind" aria-hidden="true">${KIND_ICON[s.kind]}</span>
      <div class="sc-title"><b dir="auto">${s.title || t(`lessons.kinds.${s.kind}`)}</b>${s.minutes ? html`<span class="small muted">${t('lessons.minutesN', { count: s.minutes })}</span>` : ''}</div></div>
    ${s.kind !== 'build' && s.body ? html`<div class="sc-body">${paras(s.body)}</div>` : ''}
    ${s.kind === 'game' ? (L.playableBy(s, c.school_id)
      ? html`<a class="btn btn-primary btn-big" href="/play/${s.game_slug}">▶ ${t('lessons.view.play', { title: s.game_title })}</a>`
      : html`<p class="notice warn">${t('lessons.view.notReady')}</p>`) : ''}
    ${s.kind === 'build' ? html`<p class="sc-build" dir="auto">💬 “${s.body}”</p>
      <form data-api="/api/class-lessons/${cl.id}/steps/${s.id}/build"><button class="btn btn-primary btn-big" type="submit">🛠️ ${t('lessons.view.build')}</button></form>` : ''}
  </li>`)}</ol>`;
  page(req, res, { title: l.title, active: 'classes', body, head: CSS, back: `/class/${c.id}`, backLabel: c.name });
});
/** A "build" step: a new Studio game for the student, with the teacher's idea ready in the Builder box. */
router.post('/api/class-lessons/:clid/steps/:sid/build', requireAccount, rateLimit('studio-new', 30, 3600e3, 'studio.api.tooManyGames'), (req, res) => {
  const cl = L.getClassLesson(req.params.clid); const s = L.getStep(req.params.sid);
  if (!cl || !s || s.lesson_id !== cl.lesson_id || s.kind !== 'build' || !L.canViewClassLesson(req.user, cl)) return no(req, res);
  if (!req.user.builder_enabled) return res.status(403).json({ error: req.t('studio.api.buildingOff') });
  const l = L.getLesson(cl.lesson_id);
  const g = games.createGame(req.user.id, { title: (s.title || l.title).slice(0, 60), icon: '🎓', category: 'learning' });
  audit(req.user.id, 'game.create', g.id, { lessonStep: s.id });
  res.json({ ok: true, redirect: `/studio/${g.id}?ask=${encodeURIComponent(s.body.slice(0, 300))}` });
});
