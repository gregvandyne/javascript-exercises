// Schools (enterprise): the platform admin's school list, each school's console, teachers' classes, class pages,
// login cards and students' "My classes". Permissions all come from services/schools.js; anyone without access gets 404.
// Forms post JSON through the generic form[data-api] handler in app.js (data-reload / a { redirect } reply).
import { Router } from 'express';
import crypto from 'node:crypto';
import { html, raw } from '../views/html.js';
import { page, notFound } from '../views/layout.js';
import { avatar, emptyState } from '../views/components.js';
import { requireUser, requireAdmin, getUserByName } from '../auth.js';
import { rateLimit } from '../services/ratelimit.js';
import * as S from '../services/schools.js';
import { teacherLessonsPanel, studentLessonsPanel } from './lessons.js';

export const router = Router();
const CSS = raw('<link rel="stylesheet" href="/css/community.css"><link rel="stylesheet" href="/css/schools.css">');
const nameOf = r => r.roster_name || r.display_name;
const err = (req, res, code, status = 400) => res.status(status).json({ error: req.t(`school.errors.${code}`) });
const send = (req, res, r, extra = {}) => (r.ok ? res.json({ ok: true, ...extra }) : err(req, res, r.code, r.code === 'notFound' ? 404 : 400));
const no = (req, res) => (req.path.startsWith('/api/') ? res.status(404).json({ error: req.t('school.errors.notFound') }) : notFound(req, res, req.t('school.errors.notFound')));
const b = req => req.body || {};

// One-time login cards (new and reset passwords are shown once, then forgotten). In memory, 30 minutes, creator only.
const CARDS = new Map();
function keepCards(by, classId, cards) {
  const k = crypto.randomBytes(12).toString('base64url');
  CARDS.set(k, { by: by.id, classId, cards, exp: Date.now() + 30 * 60e3 });
  for (const [key, v] of CARDS) if (v.exp < Date.now()) CARDS.delete(key);
  return k;
}
const card = r => ({ name: r.rosterName || r.user.display_name, username: r.username, password: r.password });

// ================================================================ platform admin: schools
router.get('/admin/schools', requireAdmin, (req, res) => {
  const list = S.listSchools();
  const body = html`
  <div class="pagehead"><h1>🏫 Schools</h1></div>
  <section class="panel"><h2>Add a school</h2>
    <form class="row" data-api="/api/admin/schools" novalidate>
      <label class="sr-only" for="sn">School name</label><input class="input grow" id="sn" name="name" maxlength="80" placeholder="School name" required>
      <button class="btn btn-primary" type="submit">➕ Add school</button>
    </form>
  </section>
  ${list.length ? html`<div class="panel tblwrap"><table class="tbl"><thead><tr><th>School</th><th>Classes</th><th>Staff</th><th>Students</th><th>Added</th></tr></thead><tbody>
    ${list.map(s => html`<tr><td><a href="/school/${s.slug}"><b>${s.name}</b></a>${s.archived_at ? html` <span class="chip-s">archived</span>` : ''}</td><td>${s.classes}</td><td>${s.staff}</td><td>${s.students}</td><td>${new Date(s.created_at).toISOString().slice(0, 10)}</td></tr>`)}
  </tbody></table></div>` : emptyState({ emoji: '🏫', title: 'No schools yet', text: 'Add the first school above, then appoint its school admin from the school page.' })}`;
  page(req, res, { title: 'Schools', active: 'me', body, head: CSS, back: '/admin', backLabel: 'Admin' });
});
router.post('/api/admin/schools', requireAdmin, (req, res) => {
  const r = S.createSchool(req.user, { name: b(req).name });
  if (!r.ok) return err(req, res, r.code);
  res.json({ ok: true, redirect: `/school/${r.school.slug}` });
});

// ================================================================ school console (school admins)
const loadSchool = (req, res) => {
  const s = S.getSchoolBySlug(req.params.slug);
  if (!s || !S.canManageSchool(req.user, s.id)) { no(req, res); return null; }
  return s;
};
const SCHOOL_TABS = ['classes', 'people', 'settings'];
router.get('/school/:slug', requireUser, (req, res) => {
  const s = loadSchool(req, res); if (!s) return;
  const t = req.t;
  const tab = SCHOOL_TABS.includes(req.query.tab) ? req.query.tab : 'classes';
  const content = { classes: schoolClasses, people: schoolPeople, settings: schoolSettings }[tab](req, s);
  const body = html`
  <div class="pagehead"><h1>🏫 ${s.name}</h1><a class="btn" href="/teach">🍎 ${t('school.nav.teach')}</a></div>
  <nav class="tabs" aria-label="${s.name}">${SCHOOL_TABS.map(k => html`<a href="/school/${s.slug}?tab=${k}" ${k === tab ? raw('aria-current="page"') : ''}>${t(`school.tabs.${k}`)}</a>`)}</nav>
  ${content}`;
  page(req, res, { title: s.name, active: 'me', body, head: CSS, back: S.isPlatformAdmin(req.user) ? '/admin/schools' : '/me', backLabel: S.isPlatformAdmin(req.user) ? 'Schools' : t('nav.me') });
});

function classTable(t, list, { archived = false } = {}) {
  return html`<div class="panel tblwrap"><table class="tbl rtable"><thead><tr><th>${t('school.class.name')}</th><th>${t('school.class.grade')}</th><th>${t('school.class.teachers')}</th><th>${t('school.class.students')}</th><th>${t('school.class.code')}</th><th><span class="sr-only">${t('school.actions')}</span></th></tr></thead><tbody>
    ${list.map(c => html`<tr><td><a href="/class/${c.id}"><b>${c.name}</b></a>${c.subject ? html`<div class="small muted">${c.subject}</div>` : ''}</td><td data-label="${t('school.class.grade')}">${c.grade || '–'}</td><td data-label="${t('school.class.teachers')}">${c.teachers || html`<span class="muted">–</span>`}</td><td data-label="${t('school.class.students')}">${c.students}</td><td data-label="${t('school.class.code')}"><code dir="ltr">${c.join_code}</code></td>
      <td class="acts">${archived
        ? html`<form data-api="/api/classes/${c.id}/restore" data-reload><button class="btn btn-sm" type="submit">${t('school.class.restore')}</button></form>`
        : html`<form data-api="/api/classes/${c.id}/archive" data-reload data-confirm="${t('school.class.archiveConfirm', { name: c.name })}"><button class="btn btn-sm" type="submit">${t('school.class.archive')}</button></form>`}
        ${c.students ? '' : html`<form data-api="/api/classes/${c.id}/delete" data-reload data-confirm="${t('school.class.deleteConfirm', { name: c.name })}"><button class="btn btn-sm btn-danger" type="submit">${t('school.class.delete')}</button></form>`}</td></tr>`)}
  </tbody></table></div>`;
}
function newClassForm(t, s, schools = null) {
  return html`<section class="panel"><h2>${t('school.class.new')}</h2>
    <form class="formgrid" data-api="/api/classes" novalidate>
      ${schools && schools.length > 1 ? html`<div class="field"><label for="nc-s">${t('school.class.school')}</label><select class="input" id="nc-s" name="schoolId">${schools.map(x => html`<option value="${x.id}">${x.name}</option>`)}</select></div>` : html`<input type="hidden" name="schoolId" value="${s.id}">`}
      <div class="field"><label for="nc-n">${t('school.class.name')}</label><input class="input" id="nc-n" name="name" maxlength="60" required placeholder="${t('school.class.namePlaceholder')}"><span class="err" id="nc-n-err"></span></div>
      <div class="field"><label for="nc-sub">${t('school.class.subject')}</label><input class="input" id="nc-sub" name="subject" maxlength="40"></div>
      <div class="field"><label for="nc-g">${t('school.class.grade')}</label><input class="input" id="nc-g" name="grade" maxlength="12"></div>
      <div class="field end"><button class="btn btn-primary" type="submit">➕ ${t('school.class.create')}</button></div>
    </form></section>`;
}
function schoolClasses(req, s) {
  const t = req.t; const live = S.classesOfSchool(s.id), old = S.classesOfSchool(s.id, { archived: true });
  return html`${newClassForm(t, s)}
    ${live.length ? classTable(t, live) : emptyState({ emoji: '🏫', title: t('school.class.none'), text: t('school.class.noneText') })}
    ${old.length ? html`<details class="panel"><summary>${t('school.class.archived', { count: old.length })}</summary>${classTable(t, old, { archived: true })}</details>` : ''}`;
}
function personRow(t, s, p, me) {
  const mine = p.id === me.id;
  return html`<tr><td><span class="pp">${avatar(p, 32)}<span><b>${nameOf(p)}</b><span class="small muted"> <bdi>@${p.username}</bdi>${p.managed_school === s.id ? html` · ${t('school.people.schoolAccount')}` : html` · ${t('school.people.ownAccount')}`}</span></span></span></td>
    <td data-label="${t('school.people.role')}">${t(`school.roles.${p.role}`)}</td>${p.role === 'student' ? html`<td data-label="${t('school.people.grade')}">${p.grade || '–'}</td>` : html`<td class="hide-sm"></td>`}<td data-label="${t('school.class.classes')}">${p.classes}</td>
    <td class="acts">
      <form class="inline" data-api="/api/schools/${s.id}/members/${p.id}" data-reload><label class="sr-only" for="g-${p.id}">${t('school.people.grade')}</label>
        ${p.role === 'student' ? html`<input class="input input-sm" id="g-${p.id}" name="grade" value="${p.grade}" maxlength="12" placeholder="${t('school.people.grade')}">` : html`<select class="input input-sm" name="role" aria-label="${t('school.people.role')}">${['teacher', 'admin'].map(r => html`<option value="${r}" ${p.role === r ? raw('selected') : ''}>${t(`school.roles.${r}`)}</option>`)}</select>`}
        <button class="btn btn-sm" type="submit">${t('school.save')}</button></form>
      ${p.managed_school === s.id ? html`<form data-api="/api/schools/${s.id}/members/${p.id}/password" data-confirm="${t('school.people.resetConfirm', { name: nameOf(p) })}"><button class="btn btn-sm" type="submit">🔑 ${t('school.people.reset')}</button></form>` : ''}
      ${mine ? '' : html`<form data-api="/api/schools/${s.id}/members/${p.id}/remove" data-reload data-confirm="${t('school.people.removeConfirm', { name: nameOf(p) })}"><button class="btn btn-sm btn-danger" type="submit">${t('school.people.remove')}</button></form>`}
    </td></tr>`;
}
function schoolPeople(req, s) {
  const t = req.t; const staff = S.members(s.id, 'staff'), students = S.members(s.id, 'student');
  const table = (rows, empty) => rows.length ? html`<div class="panel tblwrap"><table class="tbl rtable"><thead><tr><th>${t('school.people.name')}</th><th>${t('school.people.role')}</th><th>${t('school.people.grade')}</th><th>${t('school.class.classes')}</th><th><span class="sr-only">${t('school.actions')}</span></th></tr></thead><tbody>${rows.map(p => personRow(t, s, p, req.user))}</tbody></table></div>` : html`<p class="muted">${empty}</p>`;
  return html`
  <section class="panel"><h2>${t('school.people.addStaff')}</h2>
    <p class="small muted">${t('school.people.addStaffText')}</p>
    <form class="formgrid" data-api="/api/schools/${s.id}/staff" novalidate>
      <div class="field"><label for="st-n">${t('school.people.realName')}</label><input class="input" id="st-n" name="rosterName" maxlength="60" required><span class="err" id="st-n-err"></span></div>
      <div class="field"><label for="st-r">${t('school.people.role')}</label><select class="input" id="st-r" name="role"><option value="teacher">${t('school.roles.teacher')}</option><option value="admin">${t('school.roles.admin')}</option></select></div>
      <div class="field"><label for="st-u">${t('school.people.existing')}</label><input class="input" id="st-u" name="username" maxlength="16" dir="ltr" placeholder="${t('school.people.existingPlaceholder')}"><span class="err" id="st-u-err"></span></div>
      <div class="field end"><button class="btn btn-primary" type="submit">➕ ${t('school.people.add')}</button></div>
    </form></section>
  <h2 class="sec-h">${t('school.people.staff')}</h2>${table(staff, t('school.people.noStaff'))}
  <section class="panel"><h2>${t('school.people.addStudents')}</h2>
    <p class="small muted">${t('school.people.addStudentsText')}</p>
    <form class="formgrid" data-api="/api/schools/${s.id}/students" novalidate>
      <div class="field wide"><label for="ss-n">${t('school.people.names')}</label><textarea class="input" id="ss-n" name="names" rows="4" required placeholder="${t('school.people.namesPlaceholder')}"></textarea><span class="err" id="ss-n-err"></span></div>
      <div class="field"><label for="ss-g">${t('school.people.grade')}</label><input class="input" id="ss-g" name="grade" maxlength="12"></div>
      <div class="field end"><button class="btn btn-primary" type="submit">➕ ${t('school.people.createAccounts')}</button></div>
    </form></section>
  <h2 class="sec-h">${t('school.people.students')}</h2>${table(students, t('school.people.noStudents'))}`;
}
function schoolSettings(req, s) {
  const t = req.t; const st = S.settingsOf(s);
  const yn = (name, val) => html`<select class="input" id="set-${name}" name="${name}"><option value="1" ${val ? raw('selected') : ''}>${t('school.settings.yes')}</option><option value="0" ${val ? '' : raw('selected')}>${t('school.settings.no')}</option></select>`;
  return html`<section class="panel"><form class="stack" data-api="/api/schools/${s.id}/settings" data-reload data-toast="${t('school.settings.saved')}" novalidate>
    <div class="field"><label for="set-name">${t('school.settings.name')}</label><input class="input" id="set-name" name="name" value="${s.name}" maxlength="80"></div>
    <div class="field"><label for="set-teachersCreateClasses">${t('school.settings.teachersCreate')}</label>${yn('teachersCreateClasses', st.teachersCreateClasses)}</div>
    <div class="field"><label for="set-allowOwnAccounts">${t('school.settings.ownAccounts')}</label>${yn('allowOwnAccounts', st.allowOwnAccounts)}<span class="hint">${t('school.settings.ownAccountsHint')}</span></div>
    <h3>${t('school.settings.gameSite')}</h3><p class="small muted">${t('school.settings.gameSiteText')}</p>
    <div class="field"><label for="set-chat">${t('school.settings.chat')}</label><select class="input" id="set-chat" name="chat"><option value="classmates" ${st.chat === 'classmates' ? raw('selected') : ''}>${t('school.settings.chatClassmates')}</option><option value="off" ${st.chat === 'off' ? raw('selected') : ''}>${t('school.settings.chatOff')}</option></select></div>
    <div class="field"><label for="set-publishing">${t('school.settings.publishing')}</label><select class="input" id="set-publishing" name="publishing"><option value="school" ${st.publishing === 'school' ? raw('selected') : ''}>${t('school.settings.publishSchool')}</option><option value="public" ${st.publishing === 'public' ? raw('selected') : ''}>${t('school.settings.publishPublic')}</option></select></div>
    <p class="small muted">${t('school.settings.photos')}</p>
    <div><button class="btn btn-primary" type="submit">${t('school.save')}</button></div>
  </form></section>`;
}

// ---- school console APIs
const schoolApi = (req, res) => { const s = S.getSchool(req.params.id); if (!s || !S.canManageSchool(req.user, s.id)) { no(req, res); return null; } return s; };
router.post('/api/schools/:id/settings', requireUser, (req, res) => {
  const s = schoolApi(req, res); if (!s) return;
  const x = b(req); const bool = v => v === true || v === '1' || v === 'true';
  send(req, res, S.updateSchool(req.user, s.id, { name: x.name, settings: { teachersCreateClasses: x.teachersCreateClasses !== undefined ? bool(x.teachersCreateClasses) : undefined, allowOwnAccounts: x.allowOwnAccounts !== undefined ? bool(x.allowOwnAccounts) : undefined, chat: x.chat, publishing: x.publishing } }));
});
router.post('/api/schools/:id/staff', requireUser, rateLimit('school-add', 120, 3600e3), (req, res) => {
  const s = schoolApi(req, res); if (!s) return;
  const { rosterName, role = 'teacher', username } = b(req);
  if (!['teacher', 'admin'].includes(role)) return err(req, res, 'badRole');
  if (!String(rosterName || '').trim()) return res.status(400).json({ error: req.t('school.errors.rosterName'), field: 'rosterName' });
  if (String(username || '').trim()) {
    const u = getUserByName(username);
    if (!u || u.is_guest || u.banned) return res.status(400).json({ error: req.t('school.errors.noSuchUser'), field: 'username' });
    return send(req, res, S.addMember(req.user, s.id, u.id, role, { rosterName }));
  }
  const r = S.createSchoolAccount(req.user, s.id, { rosterName, role });
  if (!r.ok) return err(req, res, r.code);
  res.json({ ok: true, redirect: `/cards/${keepCards(req.user, null, [card(r)])}` });
});
router.post('/api/schools/:id/students', requireUser, rateLimit('school-add', 120, 3600e3), (req, res) => {
  const s = schoolApi(req, res); if (!s) return;
  const names = parseNames(b(req).names);
  if (!names.length) return res.status(400).json({ error: req.t('school.errors.names'), field: 'names' });
  const made = names.map(n => S.createSchoolAccount(req.user, s.id, { rosterName: n, grade: b(req).grade })).filter(r => r.ok);
  res.json({ ok: true, redirect: `/cards/${keepCards(req.user, null, made.map(card))}` });
});
router.post('/api/schools/:id/members/:uid', requireUser, (req, res) => {
  const s = schoolApi(req, res); if (!s) return;
  const { grade, role, rosterName } = b(req);
  if (role !== undefined && !['teacher', 'admin'].includes(role)) return err(req, res, 'badRole');
  if (role !== undefined && req.params.uid === req.user.id && role !== 'admin' && !S.isPlatformAdmin(req.user)) return err(req, res, 'ownRole');
  send(req, res, S.updateMember(req.user, s.id, req.params.uid, { grade, role, rosterName }));
});
router.post('/api/schools/:id/members/:uid/password', requireUser, (req, res) => {
  const s = schoolApi(req, res); if (!s) return;
  const m = S.membership(s.id, req.params.uid);
  const r = S.resetSchoolPassword(req.user, s.id, req.params.uid);
  if (!r.ok) return err(req, res, r.code);
  res.json({ ok: true, redirect: `/cards/${keepCards(req.user, null, [{ name: (m && m.roster_name) || r.user.display_name, username: r.username, password: r.password }])}` });
});
router.post('/api/schools/:id/members/:uid/remove', requireUser, (req, res) => {
  const s = schoolApi(req, res); if (!s) return;
  if (req.params.uid === req.user.id) return err(req, res, 'ownRole');
  send(req, res, S.removeMember(req.user, s.id, req.params.uid));
});
/** One name per line (or separated by commas/semicolons), at most 60 at a time. */
export const parseNames = text => String(text || '').split(/[\n;,]+/).map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 60);

// ================================================================ teachers: /teach
router.get('/teach', requireUser, (req, res) => {
  const t = req.t; const u = req.user;
  const schools = S.schoolsOf(u.id).filter(x => x.role !== 'student');
  const allSchools = S.isPlatformAdmin(u) ? S.listSchools().filter(x => !x.archived_at) : schools;
  if (!allSchools.length) return notFound(req, res, t('school.errors.notTeacher'));
  const mine = S.classesOf(u.id, 'teacher');
  const canCreate = allSchools.filter(x => S.canCreateClass(u, x.id));
  const admins = allSchools.filter(x => S.canManageSchool(u, x.id));
  const body = html`
  <div class="pagehead"><h1>🍎 ${t('school.teach.title')}</h1><div class="row wrap"><a class="btn btn-primary" href="/teach/lessons">📚 ${t('lessons.library.title')}</a>${admins.map(x => html`<a class="btn" href="/school/${x.slug}">🏫 ${x.name}</a>`)}</div></div>
  ${mine.length ? html`<div class="classgrid">${mine.map(c => html`<a class="panel classcard" href="/class/${c.id}">
      <span class="cc-school small muted">${c.school_name}</span><b class="cc-name">${c.name}</b>
      <span class="small">${[c.subject, c.grade ? t('school.class.gradeN', { grade: c.grade }) : ''].filter(Boolean).join(' · ')}</span>
      <span class="cc-meta">👩‍🎓 ${t('school.class.studentsN', { count: c.students })}${c.requests ? html` · <span class="chip-s warn">✋ ${t('school.class.requestsN', { count: c.requests })}</span>` : ''}</span></a>`)}</div>`
    : emptyState({ emoji: '🍎', title: t('school.teach.none'), text: canCreate.length ? t('school.teach.noneText') : t('school.teach.noneAsk') })}
  ${canCreate.length ? newClassForm(t, canCreate[0], canCreate) : ''}`;
  page(req, res, { title: t('school.teach.title'), active: 'classes', body, head: CSS });
});
router.post('/api/classes', requireUser, rateLimit('class-new', 60, 3600e3), (req, res) => {
  const { schoolId, name, subject, grade } = b(req);
  if (!S.getSchool(schoolId) || !S.canCreateClass(req.user, schoolId)) return no(req, res);
  if (!String(name || '').trim()) return res.status(400).json({ error: req.t('school.errors.className'), field: 'name' });
  const r = S.createClass(req.user, schoolId, { name, subject, grade });
  if (!r.ok) return err(req, res, r.code);
  res.json({ ok: true, redirect: `/class/${r.class.id}` });
});

// ================================================================ a class
const loadClass = (req, res, manage = true) => {
  const c = S.getClass(req.params.id);
  if (!c || !(manage ? S.canManageClass(req.user, c) : S.canViewClass(req.user, c))) { no(req, res); return null; }
  return c;
};
router.get('/class/:id', requireUser, (req, res) => {
  const c = S.getClass(req.params.id);
  if (c && S.canManageClass(req.user, c)) return teacherClass(req, res, c);
  if (c && S.canViewClass(req.user, c)) return studentClass(req, res, c);
  no(req, res);
});
function teacherClass(req, res, c) {
  const t = req.t; const s = S.getSchool(c.school_id);
  const people = S.roster(c.id), teachers = people.filter(p => p.role === 'teacher'), students = people.filter(p => p.role === 'student');
  const requests = S.pendingRequests(c.id);
  const others = S.classesOfSchool(s.id).filter(x => x.id !== c.id);
  const inClass = new Set(people.map(p => p.id));
  const schoolStudents = S.members(s.id, 'student').filter(p => !inClass.has(p.id));
  const schoolStaff = S.members(s.id, 'staff').filter(p => !inClass.has(p.id));
  const linkable = S.members(s.id, 'student').filter(p => p.managed_school === s.id);
  const body = html`
  <div class="pagehead"><div><span class="small muted">${s.name}</span><h1>${c.name}</h1>
    <p class="muted">${[c.subject, c.grade ? t('school.class.gradeN', { grade: c.grade }) : ''].filter(Boolean).join(' · ')}${c.archived_at ? html` <span class="chip-s">${t('school.class.isArchived')}</span>` : ''}</p></div></div>
  <section class="panel joincode"><div><h2>${t('school.class.joinCode')}</h2><p class="small muted">${t('school.class.joinCodeText')}</p></div>
    <div class="jc-code" dir="ltr">${c.join_code}</div>
    <form data-api="/api/classes/${c.id}/code" data-reload data-confirm="${t('school.class.newCodeConfirm')}"><button class="btn btn-sm" type="submit">🔄 ${t('school.class.newCode')}</button></form></section>
  ${teacherLessonsPanel(req, c)}

  ${requests.length ? html`<section class="panel" aria-labelledby="rq-h"><h2 id="rq-h">✋ ${t('school.requests.title', { count: requests.length })}</h2>
    <p class="small muted">${t('school.requests.text')}</p>
    <ul class="plain reqlist">${requests.map(r => html`<li class="reqcard">
      <span class="pp">${avatar(r, 40)}<span><b><bdi>@${r.username}</bdi></b><span class="small muted"> ${r.display_name !== r.username ? r.display_name : ''}</span></span></span>
      <form class="formgrid" data-api="/api/join-requests/${r.id}/approve" data-reload novalidate>
        <div class="field"><label for="rn-${r.id}">${t('school.requests.realName')}</label><input class="input" id="rn-${r.id}" name="rosterName" maxlength="60" required><span class="err" id="rn-${r.id}-err"></span></div>
        ${linkable.length ? html`<div class="field"><label for="sa-${r.id}">${t('school.requests.sameAs')}</label><select class="input" id="sa-${r.id}" name="sameAs"><option value="">${t('school.requests.sameAsNone')}</option>${linkable.map(p => html`<option value="${p.id}">${nameOf(p)} (@${p.username})</option>`)}</select></div>` : ''}
        <div class="field end row"><button class="btn btn-primary" type="submit">✅ ${t('school.requests.approve')}</button></div>
      </form>
      <form data-api="/api/join-requests/${r.id}/decline" data-reload data-confirm="${t('school.requests.declineConfirm', { name: r.username })}"><button class="btn btn-sm" type="submit">${t('school.requests.decline')}</button></form>
    </li>`)}</ul></section>` : ''}

  <section class="panel" aria-labelledby="stu-h"><h2 id="stu-h">👩‍🎓 ${t('school.class.studentsN', { count: students.length })}</h2>
    ${students.length ? html`<div class="tblwrap"><table class="tbl rtable"><thead><tr><th>${t('school.people.name')}</th><th>${t('school.people.username')}</th><th>${t('school.people.grade')}</th><th><span class="sr-only">${t('school.actions')}</span></th></tr></thead><tbody>
      ${students.map(p => html`<tr><td><span class="pp">${avatar(p, 30)}<b>${nameOf(p)}</b></span></td><td data-label="${t('school.people.username')}"><bdi>@${p.username}</bdi> <span class="small muted">· ${p.managed_school === s.id ? t('school.people.schoolAccount') : t('school.people.ownAccount')}</span></td><td data-label="${t('school.people.grade')}">${p.grade || '–'}</td>
        <td class="acts">
          ${p.managed_school === s.id ? html`<form data-api="/api/classes/${c.id}/students/${p.id}/password" data-confirm="${t('school.people.resetConfirm', { name: nameOf(p) })}"><button class="btn btn-sm" type="submit">🔑 ${t('school.people.reset')}</button></form>` : ''}
          ${others.length ? html`<form class="inline" data-api="/api/classes/${c.id}/students/${p.id}/move" data-reload><label class="sr-only" for="mv-${p.id}">${t('school.class.moveTo')}</label><select class="input input-sm" id="mv-${p.id}" name="to">${others.map(o => html`<option value="${o.id}">${o.name}</option>`)}</select><button class="btn btn-sm" type="submit">${t('school.class.move')}</button></form>` : ''}
          <form data-api="/api/classes/${c.id}/students/${p.id}/remove" data-reload data-confirm="${t('school.class.removeConfirm', { name: nameOf(p) })}"><button class="btn btn-sm btn-danger" type="submit">${t('school.class.removeStudent')}</button></form>
        </td></tr>`)}
    </tbody></table></div>` : html`<p class="muted">${t('school.class.noStudents')}</p>`}
  </section>

  <section class="panel"><h2>➕ ${t('school.class.addStudents')}</h2>
    <form class="formgrid" data-api="/api/classes/${c.id}/students" novalidate>
      <div class="field wide"><label for="as-n">${t('school.class.newAccounts')}</label><textarea class="input" id="as-n" name="names" rows="4" placeholder="${t('school.people.namesPlaceholder')}"></textarea><span class="hint">${t('school.class.newAccountsHint')}</span></div>
      <div class="field"><label for="as-g">${t('school.people.grade')}</label><input class="input" id="as-g" name="grade" maxlength="12" value="${c.grade}"></div>
      ${schoolStudents.length ? html`<div class="field"><label for="as-e">${t('school.class.fromSchool')}</label><select class="input" id="as-e" name="existing"><option value="">–</option>${schoolStudents.map(p => html`<option value="${p.id}">${nameOf(p)} (@${p.username})</option>`)}</select></div>` : ''}
      <div class="field end"><button class="btn btn-primary" type="submit">➕ ${t('school.class.add')}</button></div>
    </form></section>

  <section class="panel"><h2>🍎 ${t('school.class.teachers')}</h2>
    <ul class="plain chips-list">${teachers.map(p => html`<li class="pp">${avatar(p, 28)} ${nameOf(p)}${teachers.length > 1 && p.id !== req.user.id ? html`<form class="inline" data-api="/api/classes/${c.id}/students/${p.id}/remove" data-reload data-confirm="${t('school.class.removeConfirm', { name: nameOf(p) })}"><button class="linkbtn" type="submit" aria-label="${t('school.class.removeStudent')}">✖</button></form>` : ''}</li>`)}</ul>
    ${schoolStaff.length ? html`<form class="row" data-api="/api/classes/${c.id}/teachers" data-reload><label class="sr-only" for="at">${t('school.class.addTeacher')}</label><select class="input grow" id="at" name="userId">${schoolStaff.map(p => html`<option value="${p.id}">${nameOf(p)}</option>`)}</select><button class="btn" type="submit">➕ ${t('school.class.addTeacher')}</button></form>` : ''}
  </section>

  <details class="panel"><summary>⚙️ ${t('school.class.edit')}</summary>
    <form class="formgrid" data-api="/api/classes/${c.id}" data-reload novalidate>
      <div class="field"><label for="ec-n">${t('school.class.name')}</label><input class="input" id="ec-n" name="name" value="${c.name}" maxlength="60" required></div>
      <div class="field"><label for="ec-s">${t('school.class.subject')}</label><input class="input" id="ec-s" name="subject" value="${c.subject}" maxlength="40"></div>
      <div class="field"><label for="ec-g">${t('school.class.grade')}</label><input class="input" id="ec-g" name="grade" value="${c.grade}" maxlength="12"></div>
      <div class="field end"><button class="btn btn-primary" type="submit">${t('school.save')}</button></div>
    </form>
    <form data-api="/api/classes/${c.id}/${c.archived_at ? 'restore' : 'archive'}" data-reload ${c.archived_at ? '' : raw(`data-confirm="${t('school.class.archiveConfirm', { name: c.name }).replace(/"/g, '&quot;')}"`)}><button class="btn" type="submit">${c.archived_at ? t('school.class.restore') : t('school.class.archive')}</button></form>
  </details>`;
  page(req, res, { title: c.name, active: 'classes', body, head: CSS, back: '/teach', backLabel: t('school.teach.title') });
}
function studentClass(req, res, c) {
  const t = req.t; const s = S.getSchool(c.school_id);
  const people = S.roster(c.id);
  const teachers = people.filter(p => p.role === 'teacher'), classmates = people.filter(p => p.role === 'student');
  const body = html`
  <div class="pagehead"><div><span class="small muted">${s.name}</span><h1>${c.name}</h1>
    <p class="muted">${[c.subject, c.grade ? t('school.class.gradeN', { grade: c.grade }) : ''].filter(Boolean).join(' · ')}</p></div></div>
  ${studentLessonsPanel(req, c)}
  <section class="panel"><h2>🍎 ${t('school.class.teachers')}</h2><ul class="plain chips-list">${teachers.map(p => html`<li class="pp">${avatar(p, 28)} ${nameOf(p)}</li>`)}</ul></section>
  <section class="panel"><h2>👫 ${t('classes.classmates', { count: classmates.length })}</h2><ul class="plain chips-list">${classmates.map(p => html`<li class="pp">${avatar(p, 28)} ${p.display_name}</li>`)}</ul></section>`;
  page(req, res, { title: c.name, active: 'classes', body, head: CSS, back: '/classes', backLabel: t('nav.classes') });
}

// ---- class APIs
// (before /api/classes/:id, which would otherwise catch 'join')
router.post('/api/classes/join', requireUser, rateLimit('class-join', 20, 3600e3), (req, res) => {
  const r = S.requestJoin(req.user, b(req).code);
  if (!r.ok) return err(req, res, r.code);
  if (r.state === 'pending') return res.json({ ok: true, state: r.state, message: req.t('classes.sent', { name: r.class.name }), redirect: '/classes?sent=1' });
  res.json({ ok: true, state: r.state, redirect: `/class/${r.class.id}` });
});
router.post('/api/classes/:id', requireUser, (req, res) => { const c = loadClass(req, res); if (!c) return; const { name, subject, grade } = b(req); if (!String(name || '').trim()) return res.status(400).json({ error: req.t('school.errors.className'), field: 'name' }); send(req, res, S.updateClass(req.user, c.id, { name, subject, grade })); });
router.post('/api/classes/:id/code', requireUser, (req, res) => { const c = loadClass(req, res); if (!c) return; send(req, res, S.newCode(req.user, c.id)); });
router.post('/api/classes/:id/archive', requireUser, (req, res) => { const c = loadClass(req, res); if (!c) return; send(req, res, S.archiveClass(req.user, c.id, true)); });
router.post('/api/classes/:id/restore', requireUser, (req, res) => { const c = loadClass(req, res); if (!c) return; send(req, res, S.archiveClass(req.user, c.id, false)); });
router.post('/api/classes/:id/delete', requireUser, (req, res) => { const c = loadClass(req, res); if (!c) return; send(req, res, S.deleteClass(req.user, c.id)); });
router.post('/api/classes/:id/students', requireUser, rateLimit('school-add', 120, 3600e3), (req, res) => {
  const c = loadClass(req, res); if (!c) return;
  const { names, grade, existing } = b(req);
  if (existing) { const r = S.addToClass(req.user, c.id, existing, 'student'); if (!r.ok) return err(req, res, r.code); }
  const list = parseNames(names);
  if (!list.length) return existing ? res.json({ ok: true, redirect: `/class/${c.id}` }) : res.status(400).json({ error: req.t('school.errors.names'), field: 'names' });
  const made = [];
  for (const n of list) { const r = S.createSchoolAccount(req.user, c.school_id, { rosterName: n, grade }); if (r.ok) { S.addToClass(req.user, c.id, r.user.id, 'student'); made.push(card(r)); } }
  res.json({ ok: true, redirect: `/cards/${keepCards(req.user, c.id, made)}` });
});
router.post('/api/classes/:id/teachers', requireUser, (req, res) => {
  const c = loadClass(req, res); if (!c) return;
  const m = S.membership(c.school_id, b(req).userId);
  if (!m || m.role === 'student') return err(req, res, 'badRole');
  send(req, res, S.addToClass(req.user, c.id, m.user_id, 'teacher'));
});
const studentOf = (req, res, c) => { const m = S.classMember(c.id, req.params.uid); if (!m) { no(req, res); return null; } return m; };
router.post('/api/classes/:id/students/:uid/remove', requireUser, (req, res) => {
  const c = loadClass(req, res); if (!c) return; const m = studentOf(req, res, c); if (!m) return;
  if (m.role === 'teacher' && S.roster(c.id).filter(p => p.role === 'teacher').length < 2) return err(req, res, 'lastTeacher');
  send(req, res, S.removeFromClass(req.user, c.id, m.user_id));
});
router.post('/api/classes/:id/students/:uid/move', requireUser, (req, res) => {
  const c = loadClass(req, res); if (!c) return; const m = studentOf(req, res, c); if (!m) return;
  if (m.role !== 'student') return no(req, res);
  // Teachers can move their students to any class of the same school (the other class's teacher sees them arrive).
  const to = S.getClass(b(req).to);
  if (!to || to.school_id !== c.school_id || to.archived_at) return no(req, res);
  send(req, res, S.moveStudent(req.user, c.id, to.id, m.user_id));
});
router.post('/api/classes/:id/students/:uid/password', requireUser, (req, res) => {
  const c = loadClass(req, res); if (!c) return; const m = studentOf(req, res, c); if (!m) return;
  const sm = S.membership(c.school_id, m.user_id);
  const r = S.resetSchoolPassword(req.user, c.school_id, m.user_id);
  if (!r.ok) return err(req, res, r.code);
  res.json({ ok: true, redirect: `/cards/${keepCards(req.user, c.id, [{ name: (sm && sm.roster_name) || r.user.display_name, username: r.username, password: r.password }])}` });
});
const loadRequest = (req, res) => { const c = S.requestClass(req.params.rid); if (!c || !S.canManageClass(req.user, c)) { no(req, res); return null; } return c; };
router.post('/api/join-requests/:rid/approve', requireUser, (req, res) => {
  const c = loadRequest(req, res); if (!c) return;
  const { rosterName, sameAs } = b(req);
  if (!String(rosterName || '').trim() && !sameAs) return res.status(400).json({ error: req.t('school.errors.rosterName'), field: 'rosterName' });
  send(req, res, S.approveRequest(req.user, req.params.rid, { rosterName, sameAs: sameAs || null }));
});
router.post('/api/join-requests/:rid/decline', requireUser, (req, res) => { const c = loadRequest(req, res); if (!c) return; send(req, res, S.declineRequest(req.user, req.params.rid)); });

// ================================================================ login cards
router.get('/cards/:k', requireUser, (req, res) => {
  const t = req.t; const v = CARDS.get(req.params.k);
  if (!v || v.by !== req.user.id || v.exp < Date.now()) return notFound(req, res, t('school.cards.gone'));
  const c = v.classId ? S.getClass(v.classId) : null;
  const site = String(req.get('host') || '').replace(/^www\./, '');
  const back = c ? `/class/${c.id}` : '/teach';
  const body = html`
  <div class="pagehead noprint"><h1>🪪 ${t('school.cards.title')}</h1><div class="row"><button class="btn btn-primary" type="button" data-print>🖨️ ${t('school.cards.print')}</button><a class="btn" href="${back}">${t('school.cards.done')}</a></div></div>
  <p class="notice warn noprint">${t('school.cards.once')}</p>
  <div class="cards">${v.cards.map(x => html`<div class="logincard">
    <div class="lc-top"><span aria-hidden="true">🏆</span> Magic Cups${c ? html` · ${c.name}` : ''}</div>
    <div class="lc-name">${x.name}</div>
    <dl><dt>${t('school.cards.site')}</dt><dd dir="ltr">${site}</dd><dt>${t('school.cards.username')}</dt><dd dir="ltr"><b>${x.username}</b></dd><dt>${t('school.cards.password')}</dt><dd dir="ltr"><b>${x.password}</b></dd></dl>
  </div>`)}</div>`;
  page(req, res, { title: t('school.cards.title'), active: 'classes', body, head: CSS, scripts: ['/js/schools.js'] });
});

// ================================================================ students: My classes
router.get('/classes', requireUser, (req, res) => {
  const t = req.t; const u = req.user;
  const mine = S.classesOf(u.id, 'student'), waiting = S.myPendingRequests(u.id);
  const staff = S.isStaff(u);
  const body = html`
  <div class="pagehead"><h1>🏫 ${t('classes.title')}</h1>${staff ? html`<a class="btn" href="/teach">🍎 ${t('school.nav.teach')}</a>` : ''}</div>
  ${mine.length ? html`<div class="classgrid">${mine.map(c => html`<a class="panel classcard" href="/class/${c.id}"><span class="cc-school small muted">${c.school_name}</span><b class="cc-name">${c.name}</b><span class="small">${c.teachers || ''}</span></a>`)}</div>`
    : emptyState({ emoji: '🏫', title: t('classes.none'), text: u.is_guest ? t('classes.guest') : t('classes.noneText') })}
  ${waiting.length ? html`<section class="panel"><h2>⏳ ${t('classes.waiting')}</h2><ul class="plain">${waiting.map(w => html`<li>${w.class_name} <span class="muted small">· ${w.school_name}</span></li>`)}</ul></section>` : ''}
  ${u.is_guest ? '' : html`<section class="panel"><h2>${t('classes.join')}</h2><p class="small muted">${t('classes.joinText')}</p>
    <form class="row" data-api="/api/classes/join" novalidate><label class="sr-only" for="jc">${t('classes.code')}</label>
      <input class="input code-input" id="jc" name="code" maxlength="8" autocomplete="off" autocapitalize="characters" spellcheck="false" dir="ltr" placeholder="ABC123" required>
      <button class="btn btn-primary" type="submit">${t('classes.joinButton')}</button><span class="err form-err"></span></form></section>`}`;
  page(req, res, { title: t('classes.title'), active: 'classes', body, head: CSS });
});

