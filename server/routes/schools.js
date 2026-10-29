// Schools (enterprise): the platform admin's Schools list, each school's page (Classes · People · Settings), the
// teacher's My classes (/teach), class pages, login cards and the student's My classes (/classes).
// Permissions all come from services/schools.js; anyone without access gets 404.
// Forms post JSON through the generic form[data-api] handler in app.js: data-reload or a { redirect } reply, and a
// { toast } reply (or data-toast) is shown after the reload.
import { Router } from 'express';
import crypto from 'node:crypto';
import { html, raw } from '../views/html.js';
import { page, notFound, VERSION } from '../views/layout.js';
import { avatar, emptyState, gradeLabel, BRAND, appMark, notYou, coverArt, cardGrid, makeGameBtn } from '../views/components.js';
import { requireUser, requireAdmin, getUserByName, accountKind } from '../auth.js';
import { rateLimit } from '../services/ratelimit.js';
import * as S from '../services/schools.js';
import * as SR from '../services/school-requests.js';
import { teacherLessonsPanel, studentLessonsPanel } from './lessons.js';
import * as P from '../services/progress.js';
import * as games from '../services/games.js';
import { siteHost } from '../site.js';
import { billingTabOn, schoolBillingTab, teachPlanCard, askPanel } from './school-billing.js';
import { cardsHook, classInvitesPanel, classGoogleJoin, googleRosterInfo, googleRosterLine, googleRowMenu, schoolGoogleSettings, staffGoogleInvites } from './google.js';

export const router = Router();
const CSS = raw(`<link rel="stylesheet" href="/css/community.css?v=${VERSION}"><link rel="stylesheet" href="/css/schools.css?v=${VERSION}">`);
const nameOf = r => r.roster_name || r.display_name;
const err = (req, res, code, status = 400) => res.status(status).json({ error: req.t(`school.errors.${code}`) });
const fieldErr = (res, field, error) => res.status(400).json({ error, field });
const send = (req, res, r, extra = {}) => (r.ok ? res.json({ ok: true, ...extra }) : err(req, res, r.code, r.code === 'notFound' ? 404 : 400));
const no = (req, res) => (req.path.startsWith('/api/') ? res.status(404).json({ error: req.t('school.errors.notFound') }) : notFound(req, res, req.t('school.errors.notFound')));
const b = req => req.body || {};
/** A form value that may be one string or (repeated field) an array. */
const asList = v => (Array.isArray(v) ? v : v ? [v] : []).map(String).filter(Boolean);
/** Staff (teacher or school admin) of this school by membership, not by the platform admin's all-access. */
const staffHere = (u, schoolId) => { const m = u && S.membership(schoolId, u.id); return !!m && m.role !== 'student'; };
const selected = on => (on ? raw('selected') : '');
const optional = (t, label) => html`${label} <span class="muted">${t('school.optional')}</span>`;
/** "Signed in as … Not you? Sign out" on students' pages (classroom devices are shared): school-account students, and
 *  own accounts on the pages of a class they are a student in (classStudent). */
export const studentNotYou = (req, classStudent = false) => (classStudent || accountKind(req.user) === 'student' ? notYou(req) : '');

// Time zones grouped by region, each with its current offset ("Europe/London · GMT+1"). Offsets move with daylight
// saving, so the list is rebuilt about once an hour.
let zoneCache = { at: 0, groups: [] };
function zoneGroups() {
  if (Date.now() - zoneCache.at < 3600e3) return zoneCache.groups;
  const now = new Date(); const groups = new Map();
  for (const tz of S.ZONES) {
    const i = tz.indexOf('/'); if (i < 0) continue;   // 'UTC' and the odd legacy name are left out
    const region = tz.slice(0, i), city = tz.slice(i + 1).replace(/_/g, ' ');
    let off = ''; try { off = new Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(now).find(p => p.type === 'timeZoneName').value; } catch { continue; }
    if (!groups.has(region)) groups.set(region, []);
    groups.get(region).push({ tz, label: `${city} · ${off}` });
  }
  zoneCache = { at: Date.now(), groups: [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)) };
  return zoneCache.groups;
}
/** "14:05, Fri" in a zone, for the settings hint. */
const timeThere = (tz, intl) => { try { return new Intl.DateTimeFormat(intl, { timeZone: tz, hour: '2-digit', minute: '2-digit', weekday: 'short' }).format(new Date()); } catch { return ''; } };

/** Where a class page's back link goes: My classes for its teachers, the school page for school admins who don't teach it. */
export function classBack(req, c) {
  const t = req.t;
  if (!S.teaches(req.user, c.id) && S.canManageSchool(req.user, c.school_id)) { const s = S.getSchool(c.school_id); return { back: `/school/${s.slug}`, backLabel: s.name }; }
  return { back: '/teach', backLabel: t('school.teach.title') };
}

// One-time login cards (new and reset passwords are shown once, then forgotten). In memory, 30 minutes, creator only.
// back: 'people' (the school's People tab) or 'class' (the class's Students tab).
const CARDS = new Map();
function keepCards(by, cards, { schoolId, classId = null, back = classId ? 'class' : 'people', skipped = [] }) {
  const k = crypto.randomBytes(12).toString('base64url');
  for (const [key, v] of CARDS) if (v.exp < Date.now()) CARDS.delete(key);
  CARDS.set(k, { by: by.id, schoolId, classId, back, cards, skipped, exp: Date.now() + 30 * 60e3 });
  return k;
}
cardsHook.keep = keepCards; // Google sign-in removal prints a login card (routes/google.js)
const card = (r, role = null) => ({ name: r.rosterName || r.user.display_name, username: r.username, password: r.password, role: role && role !== 'student' ? role : null });

/** Typed names that exactly match a student who already has an account at the school (so we don't make a second one). */
function sameNames(schoolId, names) {
  const have = new Map();
  for (const p of S.members(schoolId, 'student')) { const k = nameOf(p).toLowerCase(); if (!have.has(k)) have.set(k, p); }
  return names.map(n => have.get(n.toLowerCase())).filter(Boolean);
}
const sameNamesError = (req, s, matches) => req.t('school.errors.sameName', { count: matches.length, names: matches.map(p => `${nameOf(p)} (@${p.username})`).join(', '), school: s.name });

// ================================================================ platform admin: Schools
router.get('/admin/schools', requireAdmin, (req, res) => {
  const list = S.listSchools(); const admins = S.schoolAdminNames();
  // ?request=<id>: "Create school" from a "Set up my school" request (/admin?tab=schoolreq). The name is filled in, and
  // adding the school marks the request done.
  const reqRow = SR.getRequest(req.query.request);
  const fromRequest = reqRow && reqRow.status === 'open' ? reqRow : null;
  const waiting = SR.openCount();
  const body = html`
  <div class="pagehead"><h1>🏫 Schools</h1>${waiting ? html`<a class="btn" href="/admin?tab=schoolreq">School requests&nbsp;<span class="badge">${waiting}</span></a>` : ''}</div>
  <section class="panel"><h2>Add a school</h2>
    ${fromRequest ? html`<p class="notice">From the request by <span dir="ltr">${fromRequest.email}</span> (${fromRequest.country}, about ${fromRequest.students} students). Adding the school marks the request done.</p>` : ''}
    <form class="row" data-api="/api/admin/schools" novalidate>
      ${fromRequest ? html`<input type="hidden" name="request" value="${fromRequest.id}">` : ''}
      <label class="sr-only" for="sn">School name</label><input class="input grow" id="sn" name="name" maxlength="80" placeholder="School name" required value="${fromRequest ? fromRequest.school_name.slice(0, 80) : ''}">
      <button class="btn btn-primary" type="submit">➕ Add school</button>
    </form>
    <p class="small muted">Next, appoint its school admin on the school's People tab.</p>
  </section>
  ${list.length ? html`<div class="panel tblwrap"><table class="tbl rtable"><thead><tr><th>School</th><th>School admin</th><th>Classes</th><th>Students</th><th>Added</th></tr></thead><tbody>
    ${list.map(s => html`<tr><td><a href="/school/${s.slug}"><b>${s.name}</b></a>${s.archived_at ? html` <span class="chip-s">archived</span>` : ''}</td>
      <td data-label="School admin">${admins[s.id] || html`<a class="chip-s warn" href="/school/${s.slug}?tab=people">⚠️ None yet</a>`}</td>
      <td data-label="Classes">${s.classes}</td><td data-label="Students">${s.students}</td><td data-label="Added">${new Date(s.created_at).toISOString().slice(0, 10)}</td></tr>`)}
  </tbody></table></div>` : emptyState({ emoji: '🏫', title: 'No schools yet', text: 'Add the first school above, then appoint its school admin on its People tab.' })}`;
  page(req, res, { title: 'Schools', active: S.isSchoolStaff(req.user) ? 'me' : 'schools', body, head: CSS, back: '/admin', backLabel: 'Admin' });
});
router.post('/api/admin/schools', requireAdmin, (req, res) => {
  const r = S.createSchool(req.user, { name: b(req).name });
  if (!r.ok) return err(req, res, r.code);
  // Made from a "Set up my school" request: that request is done, and remembers the school.
  if (b(req).request) SR.close(req.user, String(b(req).request), 'done', { schoolId: r.school.id });
  // The first job for a new school is appointing its school admin.
  res.json({ ok: true, redirect: `/school/${r.school.slug}?tab=people&new=1` });
});

// ================================================================ the school page (school admins)
const loadSchool = (req, res) => {
  const s = S.getSchoolBySlug(req.params.slug);
  if (!s || !S.canManageSchool(req.user, s.id)) { no(req, res); return null; }
  return s;
};
const SCHOOL_TABS = ['classes', 'people', 'settings'];
// /school: the School tab of a school admin's menu. An admin of one school goes to its People tab; of several, picks
// one; anyone else (teachers, students, kids, the platform admin who isn't a school's admin) gets a 404.
router.get('/school', requireUser, (req, res) => {
  const t = req.t;
  const list = S.adminSchools(req.user);
  if (!list.length) return no(req, res);
  if (list.length === 1) return res.redirect(302, `/school/${encodeURIComponent(list[0].slug)}?tab=people`);
  const en = key => (t.own(key) ? '' : raw(' lang="en" dir="ltr"'));
  const body = html`<div class="pagehead"><h1${en('school.pick.title')}>🏛️ ${t('school.pick.title')}</h1></div>
    <p class="muted"${en('school.pick.text')}>${t('school.pick.text')}</p>
    <div class="classgrid">${list.map(x => html`<div class="panel classcard"><a class="cc-name cc-link" href="/school/${x.slug}?tab=people"><b>${x.name}</b></a></div>`)}</div>`;
  page(req, res, { title: t(t.own('school.pick.title') ? 'school.pick.title' : 'nav.schools'), active: 'school', body, head: CSS });
});
router.get('/school/:slug', requireUser, async (req, res) => {
  const s = loadSchool(req, res); if (!s) return;
  const t = req.t;
  // Billing (school plans): school admins only, and only while paid-plan pages are on for this request.
  const tabs = billingTabOn(req, s) && !s.archived_at ? [...SCHOOL_TABS, 'billing'] : SCHOOL_TABS;
  const tab = tabs.includes(req.query.tab) ? req.query.tab : 'classes';
  const content = await { classes: schoolClasses, people: schoolPeople, settings: schoolSettings, billing: schoolBillingTab }[tab](req, s);
  const member = staffHere(req.user, s.id);
  const body = html`
  <div class="pagehead"><h1>🏫 ${s.name}</h1></div>
  <nav class="tabs" aria-label="${s.name}">${tabs.map(k => html`<a href="/school/${s.slug}?tab=${k}" ${k === tab ? raw('aria-current="page"') : ''}${t.own(`school.tabs.${k}`) ? '' : raw(' lang="en" dir="ltr"')}>${t(`school.tabs.${k}`)}</a>`)}</nav>
  ${content}`;
  // The School tab is current for the school's own admins; a teacher on a school page keeps Classes.
  const active = member ? (S.membership(s.id, req.user.id).role === 'admin' ? 'school' : 'classes') : S.isSchoolStaff(req.user) ? 'me' : 'schools';
  page(req, res, { title: s.name, active, body, head: CSS, scripts: tab === 'billing' ? ['/js/schools.js', '/js/family.js'] : ['/js/schools.js'],
    back: member ? '/teach' : '/admin/schools', backLabel: member ? t('school.teach.title') : t('nav.schools') });
});

/** The school's staff as <option>s (the viewer marked "me"). */
const staffOptions = (t, staff, me, chosen = '') => staff.map(p => html`<option value="${p.id}" ${selected(p.id === chosen)}>${nameOf(p)}${p.id === me.id ? ` (${t('school.me')})` : ''}</option>`);

function classMenu(t, s, c) {
  const canDelete = !S.everHadStudents(c.id);
  return html`<details class="inline-menu"><summary class="btn btn-sm" aria-label="${t('school.moreFor', { name: c.name })}">⋯</summary><div class="menu">
    ${c.archived_at
      ? html`<form data-api="/api/classes/${c.id}/restore" data-reload data-toast="${t('school.class.restored', { name: c.name })}"><button class="btn btn-sm" type="submit">${t('school.class.restore')}</button></form>`
      : html`<form data-api="/api/classes/${c.id}/archive" data-reload data-toast="${t('school.class.archivedToast', { name: c.name })}" data-confirm="${t('school.class.archiveConfirm', { name: c.name })}"><button class="btn btn-sm" type="submit">🗄️ ${t('school.class.archive')}</button></form>`}
    ${canDelete ? html`<form data-api="/api/classes/${c.id}/delete" data-confirm="${t('school.class.deleteConfirm', { name: c.name })}"><input type="hidden" name="from" value="school"><button class="btn btn-sm btn-danger" type="submit">${t('school.class.delete')}</button></form>` : ''}
  </div></details>`;
}
function classTable(req, s, list) {
  const t = req.t, f = req.fmt;
  const toRead = P.toReadByClass(list.map(c => c.id));
  return html`<div class="panel tblwrap"><table class="tbl rtable classes"><thead><tr><th>${t('school.class.name')}</th><th>${t('school.class.grade')}</th><th>${t('school.class.teachers')}</th><th>${t('school.class.students')}</th><th>${t('school.class.lessons')}</th><th>${t('school.class.lastActivity')}</th><th>${t('school.class.code')}</th><th><span class="sr-only">${t('school.actions')}</span></th></tr></thead><tbody>
    ${list.map(c => html`<tr><td><a href="/class/${c.id}"><b>${c.name}</b></a>${toRead[c.id] ? html` <a class="chip-s warn" href="/class/${c.id}/progress#to-review">✍️ ${t('progress.teach.toRead', { count: toRead[c.id] })}</a>` : ''}${c.subject ? html`<div class="small muted">${c.subject}</div>` : ''}</td><td data-label="${t('school.class.grade')}">${c.grade || '–'}</td>
      <td data-label="${t('school.class.teachers')}">${c.teachers || html`<span class="chip-s warn">⚠️ ${t('school.class.noTeacherChip')}</span>`}</td><td data-label="${t('school.class.students')}">${c.students}</td>
      <td data-label="${t('school.class.lessons')}">${c.lessons}</td><td data-label="${t('school.class.lastActivity')}">${c.last_activity ? f.ago(c.last_activity) : html`<span class="muted">${t('school.class.noActivity')}</span>`}</td><td data-label="${t('school.class.code')}"><code dir="ltr">${c.join_code}</code></td>
      <td class="tacts"><div class="acts">${classMenu(t, s, c)}</div></td></tr>`)}
  </tbody></table></div>`;
}
/** The New class form. On the school page it asks who teaches the class; on My classes the creator teaches it. */
function newClassForm(t, { schools, me, staff = null, open = false }) {
  const s = schools[0];
  return html`<div class="libtools"><details class="libdrop" ${open ? raw('open') : ''}><summary class="btn ${open ? '' : 'btn-primary'}">➕ ${t('school.class.new')}</summary>
    <form class="formgrid" data-api="/api/classes" novalidate>
      ${schools.length > 1 ? html`<div class="field"><label for="nc-s">${t('school.class.school')}</label><select class="input" id="nc-s" name="schoolId">${schools.map(x => html`<option value="${x.id}">${x.name}</option>`)}</select></div>` : html`<input type="hidden" name="schoolId" value="${s.id}">`}
      <div class="field"><label for="nc-n">${t('school.class.name')}</label><input class="input" id="nc-n" name="name" maxlength="60" required placeholder="${t('school.class.namePlaceholder')}"><span class="err" id="nc-n-err"></span></div>
      ${staff ? html`<div class="field"><label for="nc-t">${t('school.class.teacher')}</label><select class="input" id="nc-t" name="teacherId" required><option value="">${t('school.class.teacherChoose')}</option>${staffOptions(t, staff, me)}<option value="none">${t('school.class.teacherNone')}</option></select><span class="err" id="nc-t-err"></span></div>` : ''}
      <div class="field"><label for="nc-sub">${optional(t, t('school.class.subject'))}</label><input class="input" id="nc-sub" name="subject" maxlength="40"></div>
      <div class="field"><label for="nc-g">${optional(t, t('school.class.grade'))}</label><input class="input" id="nc-g" name="grade" maxlength="12"></div>
      <div class="formacts"><button class="btn btn-primary" type="submit">➕ ${t('school.class.create')}</button></div>
    </form></details></div>`;
}
function schoolClasses(req, s) {
  const t = req.t; const live = S.classesOfSchool(s.id), old = S.classesOfSchool(s.id, { archived: true });
  return html`${newClassForm(t, { schools: [s], me: req.user, staff: S.members(s.id, 'staff') })}
    ${live.length ? classTable(req, s, live) : emptyState({ emoji: '🏫', title: t('school.class.none'), text: t('school.class.noneText') })}
    ${old.length ? html`<details class="panel"><summary>🗄️ ${t('school.class.archived', { count: old.length })}</summary>${classTable(req, s, old)}</details>` : ''}`;
}

/** A person's live classes in the school, as links (or "Not in a class"). */
function classLinks(t, rows, student) {
  if (!rows || !rows.length) return html`<span class="muted">${t('school.people.noClass')}</span>`;
  return rows.map((c, i) => html`${i ? ', ' : ''}<a href="/class/${c.id}${student ? '?tab=students' : ''}">${c.name}</a>`);
}
function personRow(req, s, p, me, classes, ginfo) {
  const t = req.t;
  const mine = p.id === me.id; const student = p.role === 'student';
  const second = student
    ? html`<form class="inline" data-api="/api/schools/${s.id}/members/${p.id}" data-reload data-toast="${t('school.settings.saved')}"><label class="sr-only" for="g-${p.id}">${t('school.people.grade')}</label><input class="input input-sm" id="g-${p.id}" name="grade" value="${p.grade}" maxlength="12" placeholder="${t('school.people.grade')}"><button class="btn btn-sm" type="submit">${t('school.save')}</button></form>`
    : mine ? html`<span>${t('school.people.you', { role: t(`school.roles.${p.role}`) })}</span>`
      : html`<form class="inline" data-api="/api/schools/${s.id}/members/${p.id}" data-reload data-toast="${t('school.settings.saved')}"><label class="sr-only" for="r-${p.id}">${t('school.people.role')}</label><select class="input input-sm" id="r-${p.id}" name="role">${['teacher', 'admin'].map(r => html`<option value="${r}" ${selected(p.role === r)}>${t(`school.roles.${r}`)}</option>`)}</select><button class="btn btn-sm" type="submit">${t('school.save')}</button></form>`;
  return html`<tr><td><span class="pp">${avatar(p, 32)}<span><b>${nameOf(p)}</b><span class="small muted"><bdi>@${p.username}</bdi> · ${p.managed_school === s.id ? t('school.people.schoolAccount') : t('school.people.ownAccount')}</span>${googleRosterLine(req, ginfo, p)}</span></span></td>
    <td class="edit">${second}</td>
    <td data-label="${t('school.class.classes')}">${classLinks(t, classes[p.id], student)}</td>
    <td class="tacts"><div class="acts">
      ${p.managed_school === s.id && !mine ? html`<form data-api="/api/schools/${s.id}/members/${p.id}/password" data-confirm="${t('school.people.resetConfirm', { name: nameOf(p) })}"><button class="btn btn-sm" type="submit">🔑 ${t('school.people.reset')}</button></form>` : ''}
      ${mine ? '' : html`<details class="inline-menu"><summary class="btn btn-sm" aria-label="${t('school.moreFor', { name: nameOf(p) })}">⋯</summary><div class="menu">
        ${googleRowMenu(req, ginfo, p, { s, connectApi: `/api/schools/${s.id}/members/${p.id}/google`, removeApi: `/api/schools/${s.id}/members/${p.id}/google/remove` })}
        <form data-api="/api/schools/${s.id}/members/${p.id}/remove" data-reload data-confirm="${t('school.people.removeConfirm', { name: nameOf(p) })}"><button class="btn btn-sm btn-danger" type="submit">${t('school.people.remove')}</button></form></div></details>`}
    </div></td></tr>`;
}
function schoolPeople(req, s) {
  const t = req.t; const staff = S.members(s.id, 'staff'), classes = S.memberClasses(s.id);
  // Students who aren't in a class yet come first: they are the ones who still need placing.
  const students = S.members(s.id, 'student').map((p, i) => ({ p, i, placed: classes[p.id] ? 1 : 0 })).sort((a, z) => a.placed - z.placed || a.i - z.i).map(x => x.p);
  const live = S.classesOfSchool(s.id);
  const ginfo = googleRosterInfo([...staff, ...students].map(p => p.id));
  const table = (rows, second, empty) => rows.length ? html`<div class="panel tblwrap"><table class="tbl rtable people"><thead><tr><th>${t('school.people.name')}</th><th>${second}</th><th>${t('school.class.classes')}</th><th><span class="sr-only">${t('school.actions')}</span></th></tr></thead><tbody>${rows.map(p => personRow(req, s, p, req.user, classes, ginfo))}</tbody></table></div>` : html`<p class="muted">${empty}</p>`;
  return html`
  ${req.query.new && !staff.some(p => p.role === 'admin') ? html`<p class="notice good">👋 ${t('school.people.newSchool')}</p>` : ''}
  <h2 class="sec-h">🍎 ${t('school.people.staff')}</h2>
  ${table(staff, t('school.people.role'), t('school.people.noStaff'))}
  <section class="panel" id="add-staff"><h3>➕ ${t('school.people.addStaff')}</h3>
    <p class="small muted">${t('school.people.addStaffText')}</p>
    <form class="formgrid staffform" data-api="/api/schools/${s.id}/staff" data-reload novalidate>
      <fieldset class="field wide choice"><legend>${t('school.people.account')}</legend>
        <label><input type="radio" name="account" value="new" checked> ${t('school.people.accountNew')}</label>
        <label><input type="radio" name="account" value="existing"> ${t('school.people.accountExisting')}</label></fieldset>
      <div class="field"><label for="st-n">${t('school.people.realName')}</label><input class="input" id="st-n" name="rosterName" maxlength="60" required><span class="err" id="st-n-err"></span></div>
      <div class="field"><label for="st-r">${t('school.people.role')}</label><select class="input" id="st-r" name="role"><option value="teacher" ${selected(staff.length)}>${t('school.roles.teacher')}</option><option value="admin" ${selected(!staff.length)}>${t('school.roles.admin')}</option></select></div>
      <div class="field" data-account="existing"><label for="st-u">${t('school.people.existing')}</label><input class="input" id="st-u" name="username" maxlength="16" dir="ltr" autocomplete="off" placeholder="${t('school.people.existingPlaceholder')}"><span class="err" id="st-u-err"></span></div>
      <div class="formacts"><button class="btn btn-primary" type="submit" data-new="🪪 ${t('school.people.createStaff')}" data-existing="➕ ${t('school.people.addToSchool')}">🪪 ${t('school.people.createStaff')}</button></div>
    </form></section>
  ${staffGoogleInvites(req, s)}
  <h2 class="sec-h">👩‍🎓 ${t('school.people.students')}</h2>
  ${table(students, t('school.people.grade'), t('school.people.noStudents'))}
  <section class="panel"><h3>➕ ${t('school.people.addStudents')}</h3>
    <p class="small muted">${t('school.people.addStudentsText')}</p>
    <form class="formgrid" data-api="/api/schools/${s.id}/students" novalidate>
      <div class="field wide"><label for="ss-n">${t('school.people.names')}</label><textarea class="input" id="ss-n" name="names" rows="4" required placeholder="${t('school.people.namesPlaceholder')}"></textarea><span class="err" id="ss-n-err"></span></div>
      <div class="field"><label for="ss-g">${optional(t, t('school.people.grade'))}</label><input class="input" id="ss-g" name="grade" maxlength="12"></div>
      ${live.length ? html`<div class="field"><label for="ss-c">${optional(t, t('school.people.putInClass'))}</label><select class="input" id="ss-c" name="classId"><option value="">–</option>${live.map(c => html`<option value="${c.id}">${c.name}</option>`)}</select></div>` : ''}
      <div class="formacts"><button class="btn btn-primary" type="submit">🪪 ${t('school.people.createAccounts')}</button></div>
    </form></section>`;
}
function schoolSettings(req, s) {
  const t = req.t; const st = S.settingsOf(s); const tz = S.zoneOf(s);
  const yn = (name, val) => html`<select class="input" id="set-${name}" name="${name}"><option value="1" ${selected(val)}>${t('school.settings.yes')}</option><option value="0" ${selected(!val)}>${t('school.settings.no')}</option></select>`;
  return html`<section class="panel"><form class="stack settingsform" data-api="/api/schools/${s.id}/settings" data-reload data-toast="${t('school.settings.saved')}" novalidate>
    <div class="field"><label for="set-name">${t('school.settings.name')}</label><input class="input" id="set-name" name="name" value="${s.name}" maxlength="80"></div>
    <div class="field"><label for="set-teachersCreateClasses">${t('school.settings.teachersCreate')}</label>${yn('teachersCreateClasses', st.teachersCreateClasses)}</div>
    <div class="field"><label for="set-allowOwnAccounts">${t('school.settings.ownAccounts')}</label>${yn('allowOwnAccounts', st.allowOwnAccounts)}<span class="hint">${t('school.settings.ownAccountsHint')}</span></div>
    <div class="field"><label for="set-timeZone">${t('school.settings.timeZone')}</label>
      <select class="input" id="set-timeZone" name="timeZone"><option value="" ${selected(!tz)}>${t('school.settings.timeZoneNone')}</option>
        ${zoneGroups().map(([region, zs]) => html`<optgroup label="${region}">${zs.map(z => html`<option value="${z.tz}" ${selected(z.tz === tz)}>${z.label}</option>`)}</optgroup>`)}</select>
      <span class="hint">${tz ? t('school.settings.timeZoneHint', { time: timeThere(tz, req.fmt.intl) }) : t('school.settings.timeZoneUnset')}</span></div>
    <h3>${t('school.settings.gameSite')}</h3><p class="small muted">${t('school.settings.gameSiteText')}</p>
    <div class="field"><label for="set-chat">${t('school.settings.chat')}</label><select class="input" id="set-chat" name="chat"><option value="classmates" ${selected(st.chat === 'classmates')}>${t('school.settings.chatClassmates')}</option><option value="off" ${selected(st.chat === 'off')}>${t('school.settings.chatOff')}</option></select><span class="hint">${t('school.settings.chatHint')}</span></div>
    <div class="field"><label for="set-publishing">${t('school.settings.publishing')}</label><select class="input" id="set-publishing" name="publishing" aria-describedby="set-publishing-hint"><option value="school" ${selected(st.publishing === 'school')}>${t('school.settings.publishSchool')}</option><option value="public" ${selected(st.publishing === 'public')}>${t('school.settings.publishPublic')}</option></select><span class="hint" id="set-publishing-hint">${t('school.settings.publishingHint')}</span></div>
    <p class="small muted">${t('school.settings.photos')}</p>
    <div><button class="btn btn-primary" type="submit">${t('school.save')}</button></div>
  </form></section>
  ${schoolGoogleSettings(req, s)}`;
}

// ---- school page APIs
const schoolApi = (req, res) => { const s = S.getSchool(req.params.id); if (!s || !S.canManageSchool(req.user, s.id)) { no(req, res); return null; } return s; };
router.post('/api/schools/:id/settings', requireUser, (req, res) => {
  const s = schoolApi(req, res); if (!s) return;
  const x = b(req); const bool = v => v === true || v === '1' || v === 'true';
  // The daily Builder cap (school plans) is set on the Billing tab, so only where that tab is.
  if (x.builderDailyCap !== undefined && !billingTabOn(req, s)) return no(req, res);
  const r = S.updateSchool(req.user, s.id, { name: x.name, settings: { teachersCreateClasses: x.teachersCreateClasses !== undefined ? bool(x.teachersCreateClasses) : undefined, allowOwnAccounts: x.allowOwnAccounts !== undefined ? bool(x.allowOwnAccounts) : undefined, chat: x.chat, publishing: x.publishing, timeZone: typeof x.timeZone === 'string' ? x.timeZone : undefined, builderDailyCap: x.builderDailyCap } });
  if (!r.ok && r.code === 'badCap') return fieldErr(res, 'builderDailyCap', req.t('school.errors.badCap', { min: S.minDailyCap(), max: S.MAX_DAILY_CAP }));
  send(req, res, r);
});
router.post('/api/schools/:id/staff', requireUser, rateLimit('school-add', 120, 3600e3), (req, res) => {
  const s = schoolApi(req, res); if (!s) return;
  const t = req.t; const { rosterName, role = 'teacher', username, account = 'new' } = b(req);
  if (!['teacher', 'admin'].includes(role)) return err(req, res, 'badRole');
  if (!String(rosterName || '').trim()) return fieldErr(res, 'rosterName', t('school.errors.staffName'));
  if (account === 'existing') {
    // They already have an Oomba Academy account: add it (no login card).
    if (!String(username || '').trim()) return fieldErr(res, 'username', t('school.errors.username'));
    const u = getUserByName(username);
    if (!u || u.is_guest || u.banned || u.account_type === 'grownup') return fieldErr(res, 'username', t('school.errors.noSuchUser'));
    const m = S.membership(s.id, u.id);
    if (m && m.role === 'student') return fieldErr(res, 'username', t('school.errors.isStudent', { name: nameOf({ ...u, roster_name: m.roster_name }) }));
    if (m) return fieldErr(res, 'username', t('school.errors.alreadyStaff', { name: nameOf({ ...u, roster_name: m.roster_name }), role: t(`school.roles.${m.role}`) }));
    const r = S.addMember(req.user, s.id, u.id, role, { rosterName });
    if (!r.ok) return err(req, res, r.code);
    return res.json({ ok: true, toast: t('school.people.added', { name: String(rosterName).trim(), role: t(`school.roles.${role}`) }) });
  }
  const r = S.createSchoolAccount(req.user, s.id, { rosterName, role });
  if (!r.ok) return err(req, res, r.code);
  res.json({ ok: true, redirect: `/cards/${keepCards(req.user, [card(r, role)], { schoolId: s.id })}` });
});
router.post('/api/schools/:id/students', requireUser, rateLimit('school-add', 120, 3600e3), (req, res) => {
  const s = schoolApi(req, res); if (!s) return;
  const { grade, classId } = b(req);
  const names = parseNames(b(req).names);
  if (!names.length) return fieldErr(res, 'names', req.t('school.errors.names'));
  const c = classId ? S.getClass(classId) : null;
  if (classId && (!c || c.school_id !== s.id || c.archived_at)) return no(req, res);
  const same = sameNames(s.id, names);
  if (same.length) return fieldErr(res, 'names', sameNamesError(req, s, same));
  const made = names.map(n => S.createSchoolAccount(req.user, s.id, { rosterName: n, grade })).filter(r => r.ok);
  if (c) for (const r of made) S.addToClass(req.user, c.id, r.user.id, 'student');
  res.json({ ok: true, redirect: `/cards/${keepCards(req.user, made.map(r => card(r)), { schoolId: s.id, classId: c ? c.id : null, back: 'people' })}` });
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
  // Not your own: a new password signs you out everywhere, this session too.
  if (req.params.uid === req.user.id) return err(req, res, 'ownRole');
  const m = S.membership(s.id, req.params.uid);
  const r = S.resetSchoolPassword(req.user, s.id, req.params.uid);
  if (!r.ok) return err(req, res, r.code);
  res.json({ ok: true, redirect: `/cards/${keepCards(req.user, [{ name: (m && m.roster_name) || r.user.display_name, username: r.username, password: r.password, role: m && m.role !== 'student' ? m.role : null }], { schoolId: s.id })}` });
});
router.post('/api/schools/:id/members/:uid/remove', requireUser, (req, res) => {
  const s = schoolApi(req, res); if (!s) return;
  if (req.params.uid === req.user.id) return err(req, res, 'ownRole');
  send(req, res, S.removeMember(req.user, s.id, req.params.uid));
});
/** One name per line (or separated by commas/semicolons), at most 60 at a time. */
export const parseNames = text => String(text || '').split(/[\n;,]+/).map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 60);

// ================================================================ teachers: My classes (/teach)
router.get('/teach', requireUser, (req, res) => {
  const t = req.t; const u = req.user;
  // The platform admin who isn't staff of a school works from Schools, not from an empty teacher page.
  if (!S.isSchoolStaff(u)) return S.isPlatformAdmin(u) ? res.redirect('/admin/schools') : notFound(req, res, t('school.errors.notTeacher'));
  const schools = S.schoolsOf(u.id).filter(x => x.role !== 'student');
  const mine = S.classesOf(u.id, 'teacher'), old = S.classesOf(u.id, 'teacher', { archived: true });
  const toRead = P.toReadByClass(mine.map(c => c.id));
  const canCreate = schools.filter(x => S.canCreateClass(u, x.id));
  const admins = schools.filter(x => S.canManageSchool(u, x.id));
  const body = html`
  <div class="pagehead"><h1>🍎 ${t('school.teach.title')}</h1><div class="row"><a class="btn btn-primary" href="/teach/lessons">📚 ${t('lessons.library.title')}</a>${makeGameBtn(t)}${admins.map(x => html`<a class="btn" href="/school/${x.slug}">🏫 ${t('school.teach.manage', { school: x.name })}</a>`)}</div></div>
  ${admins.map(x => teachPlanCard(req, x))}
  ${schools.map(x => askPanel(req, x))}
  ${mine.length ? html`<div class="classgrid">${mine.map(c => html`<div class="panel classcard">
      <span class="cc-school small muted">${c.school_name}</span><a class="cc-name cc-link" href="/class/${c.id}"><b>${c.name}</b></a>
      <span class="small">${[c.subject, gradeLabel(t, c.grade)].filter(Boolean).join(' · ')}</span>
      <span class="cc-meta">👩‍🎓 ${t('school.class.studentsN', { count: c.students })}${c.requests ? html` <a class="chip-s warn" href="/class/${c.id}?tab=students#requests">✋ ${t('school.class.requestsN', { count: c.requests })}</a>` : ''}${toRead[c.id] ? html` <a class="chip-s warn" href="/class/${c.id}/progress#to-review">✍️ ${t('progress.teach.toRead', { count: toRead[c.id] })}</a>` : ''}</span></div>`)}</div>`
    : emptyState({ emoji: '🍎', title: admins.length ? t('school.teach.noneAdmin') : t('school.teach.none'), text: admins.length ? t('school.teach.noneAdminText', { school: admins[0].name }) : canCreate.length ? t('school.teach.noneText') : t('school.teach.noneAsk') })}
  ${canCreate.length ? newClassForm(t, { schools: canCreate, me: u, open: !mine.length && !admins.length }) : ''}
  ${old.length ? html`<details class="panel archived"><summary>🗄️ ${t('school.class.archived', { count: old.length })}</summary>
    <ul class="plain archlist">${old.map(c => html`<li><a href="/class/${c.id}"><b>${c.name}</b></a> <span class="small muted">${c.school_name}</span>
      <form data-api="/api/classes/${c.id}/restore" data-reload data-toast="${t('school.class.restored', { name: c.name })}"><button class="btn btn-sm" type="submit">${t('school.class.restore')}</button></form></li>`)}</ul></details>` : ''}`;
  page(req, res, { title: t('school.teach.title'), active: 'classes', body, head: CSS });
});
router.post('/api/classes', requireUser, rateLimit('class-new', 60, 3600e3), (req, res) => {
  const t = req.t; const { schoolId, name, subject, grade, teacherId } = b(req);
  const s = S.getSchool(schoolId);
  if (!s || !S.canCreateClass(req.user, schoolId)) return no(req, res);
  if (!String(name || '').trim()) return fieldErr(res, 'name', t('school.errors.className'));
  // The school page's form says who teaches the class; My classes' form makes the creator its teacher.
  const fromSchoolPage = teacherId !== undefined;
  if (fromSchoolPage && !S.canManageSchool(req.user, s.id)) return no(req, res);
  if (fromSchoolPage && !String(teacherId).trim()) return fieldErr(res, 'teacherId', t('school.errors.chooseTeacher'));
  const r = S.createClass(req.user, s.id, { name, subject, grade, ...(fromSchoolPage ? { teacherId: String(teacherId) } : {}) });
  if (!r.ok) return r.code === 'badTeacher' ? fieldErr(res, 'teacherId', t('school.errors.badTeacher')) : err(req, res, r.code);
  if (fromSchoolPage) return res.json({ ok: true, toast: t('school.class.created', { name: r.class.name }), redirect: `/school/${s.slug}` });
  // A new class has no students yet: open it on the Students tab.
  res.json({ ok: true, redirect: `/class/${r.class.id}?tab=students` });
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
const CLASS_TABS = ['lessons', 'progress', 'games', 'students', 'settings'];
/** The class header and its tabs (Lessons, Progress, Games, Students, Settings), shared with the progress pages. */
export function classHeader(req, c, active) {
  const t = req.t; const s = S.getSchool(c.school_id);
  const students = S.roster(c.id).filter(p => p.role === 'student').length;
  const requests = S.pendingRequests(c.id).length;
  const toRead = P.toReadByClass([c.id])[c.id] || 0;
  const href = { lessons: `/class/${c.id}`, progress: `/class/${c.id}/progress`, games: `/class/${c.id}?tab=games`, students: `/class/${c.id}?tab=students`, settings: `/class/${c.id}?tab=settings` };
  const icon = { lessons: '📚', progress: '📊', games: '🎮', students: '👩‍🎓', settings: '⚙️' };
  const badge = { progress: toRead ? html` <span class="tabbadge" title="${t('progress.gradebook.toRead', { count: toRead })}">${toRead}</span>` : '', students: requests ? html` <span class="tabbadge" title="${t('school.requests.title', { count: requests })}">${requests}</span>` : '' };
  return html`
  <div class="pagehead"><div><span class="small muted">${s.name}</span><h1>${c.name}</h1>
    <p class="muted">${[c.subject, gradeLabel(t, c.grade), t('school.class.studentsN', { count: students })].filter(Boolean).join(' · ')}</p></div></div>
  ${c.archived_at ? html`<div class="notice warn archbanner"><span>🗄️ ${t('school.class.archivedBanner')}</span><form data-api="/api/classes/${c.id}/restore" data-reload data-toast="${t('school.class.restored', { name: c.name })}"><button class="btn btn-sm" type="submit">${t('school.class.restore')}</button></form></div>` : ''}
  <nav class="tabs classtabs" aria-label="${c.name}">${CLASS_TABS.map(k => html`<a href="${href[k]}" ${k === active ? raw('aria-current="page"') : ''}><span aria-hidden="true">${icon[k]}</span> ${t(`school.classTabs.${k}`)}${badge[k] || ''}</a>`)}</nav>`;
}

function requestsPanel(req, c, s, people) {
  const t = req.t; const requests = S.pendingRequests(c.id);
  if (!requests.length) return '';
  // School accounts a join request might be the same student as. The ones in this class come first: the usual case is a
  // class that got login cards, then a child joins with their own account and is matched to their card.
  const inClass = new Set(people.map(p => p.id));
  const accounts = S.members(s.id, 'student').filter(p => p.managed_school === s.id);
  const here = accounts.filter(p => inClass.has(p.id)), elsewhere = accounts.filter(p => !inClass.has(p.id));
  const opts = (r, list) => list.map(p => html`<option value="${p.id}" data-confirm="${t('school.requests.mergeConfirm', { account: p.username, name: r.username })}">${nameOf(p)} (@${p.username})</option>`);
  return html`<section class="panel" id="requests" aria-labelledby="rq-h"><h2 id="rq-h">✋ ${t('school.requests.title', { count: requests.length })}</h2>
    <p class="small muted">${t('school.requests.text')}</p>
    <ul class="plain reqlist">${requests.map(r => html`<li class="reqcard">
      <div class="reqhead"><span class="pp">${avatar(r, 40)}<span><b><bdi>@${r.username}</bdi></b>${r.display_name !== r.username ? html`<span class="small muted">${r.display_name}</span>` : ''}</span></span>
        <form data-api="/api/join-requests/${r.id}/decline" data-reload data-confirm="${t('school.requests.declineConfirm', { name: r.username })}"><button class="btn btn-sm" type="submit">${t('school.requests.decline')}</button></form></div>
      <form class="formgrid approveform" data-api="/api/join-requests/${r.id}/approve" data-reload data-toast="${t('school.requests.approved', { name: r.username })}" novalidate>
        <div class="field"><label for="rn-${r.id}">${t('school.requests.realName')}</label><input class="input" id="rn-${r.id}" name="rosterName" maxlength="60" required><span class="err" id="rn-${r.id}-err"></span></div>
        ${accounts.length ? html`<div class="field"><label for="sa-${r.id}">${t('school.requests.sameAs')}</label><select class="input" id="sa-${r.id}" name="sameAs" autocomplete="off" aria-describedby="sa-${r.id}-hint"><option value="">${t('school.requests.sameAsNone')}</option>
          ${here.length && elsewhere.length ? html`<optgroup label="${t('school.requests.inClass')}">${opts(r, here)}</optgroup><optgroup label="${t('school.requests.otherAccounts')}">${opts(r, elsewhere)}</optgroup>` : opts(r, accounts)}</select></div>` : ''}
        <div class="formacts"><button class="btn btn-primary" type="submit">✅ ${t('school.requests.approve')}</button></div>
        ${accounts.length ? html`<p class="hint small muted wide" id="sa-${r.id}-hint">${t('school.requests.mergeHint', { name: r.username })}</p>` : ''}
      </form>
    </li>`)}</ul></section>`;
}
function studentRow(req, c, s, p, others, ginfo) {
  const t = req.t;
  return html`<tr><td><span class="pp">${avatar(p, 30)}<span><b>${nameOf(p)}</b>${googleRosterLine(req, ginfo, p)}</span></span></td><td data-label="${t('school.cards.username')}"><bdi>@${p.username}</bdi> <span class="small muted">· ${p.managed_school === s.id ? t('school.people.schoolAccount') : t('school.people.ownAccount')}</span></td><td data-label="${t('school.people.grade')}">${p.grade || '–'}</td>
    <td class="tacts"><div class="acts">
      ${p.managed_school === s.id ? html`<form data-api="/api/classes/${c.id}/students/${p.id}/password" data-confirm="${t('school.people.resetConfirm', { name: nameOf(p) })}"><button class="btn btn-sm" type="submit">🔑 ${t('school.people.reset')}</button></form>` : ''}
      <details class="inline-menu"><summary class="btn btn-sm" aria-label="${t('school.moreFor', { name: nameOf(p) })}">⋯</summary><div class="menu">
        ${others.length ? html`<span class="lbl" aria-hidden="true">${t('school.class.moveTo')}</span>
        <form class="row" data-api="/api/classes/${c.id}/students/${p.id}/move" data-reload data-confirm="${t('school.class.moveConfirm', { name: nameOf(p) })}"><select class="input input-sm grow" name="to" required aria-label="${t('school.class.moveTo')}"><option value="">${t('school.class.moveChoose')}</option>${others.map(o => html`<option value="${o.id}">${o.name}</option>`)}</select><button class="btn btn-sm" type="submit">${t('school.class.move')}</button></form>` : ''}
        ${googleRowMenu(req, ginfo, p, { s, connectApi: `/api/classes/${c.id}/students/${p.id}/google`, removeApi: `/api/classes/${c.id}/students/${p.id}/google/remove` })}
        <form data-api="/api/classes/${c.id}/students/${p.id}/remove" data-reload data-confirm="${t('school.class.removeConfirm', { name: nameOf(p) })}"><button class="btn btn-sm btn-danger" type="submit">${t('school.class.removeStudent')}</button></form>
      </div></details>
    </div></td></tr>`;
}
/** The teacher's Games tab: games shared only with this class (each can be taken off it), and the ones taken off
 *  (each can be put back). Staff see students' real names. */
function classGamesTab(req, c, people) {
  const t = req.t, f = req.fmt;
  const live = games.classGames(c.id, { limit: 200 }), off = games.removedClassGames(c.id);
  const real = new Map(people.map(p => [p.id, nameOf(p)]));
  const who = g => { const n = real.get(g.owner_id); return n && n !== g.owner_name ? `@${g.owner_name} (${n})` : `@${g.owner_name}`; };
  return html`<section class="panel" aria-labelledby="cg-h"><h2 id="cg-h">🎮 ${t('school.classTabs.games')}</h2>
    <p class="small muted">${t('school.classGames.text')}</p>
    ${live.length ? html`<ul class="plain cg-list">${live.map(g => html`<li class="cg-row">
      <a class="cg-cover" href="/g/${g.slug}" tabindex="-1" aria-hidden="true">${coverArt(g, 'cg-thumb')}</a>
      <div class="cg-body"><a href="/g/${g.slug}"><b dir="auto">${g.title}</b></a>
        <span class="small muted"><bdi>${t('school.classGames.by', { name: who(g) })}</bdi> · ${t('school.classGames.sharedAgo', { when: f.ago(g.shared_at) })}</span></div>
      <form class="cg-act" data-api="/api/classes/${c.id}/games/${g.id}/remove" data-reload data-confirm="${t('school.classGames.removeConfirm', { title: g.title, class: c.name })}"><button class="btn btn-sm" type="submit">${t('school.classGames.remove')}</button></form>
    </li>`)}</ul>` : html`<p class="muted">${t('school.classGames.empty')}</p>`}
  </section>
  ${off.length ? html`<details class="panel cg-off"><summary>${t('school.classGames.removedHeading', { count: off.length })}</summary>
    <ul class="plain cg-list">${off.map(g => html`<li class="cg-row"><div class="cg-body">${games.canView(req.user, g) ? html`<b dir="auto">${g.icon} ${g.title}</b>` : html`<b>🎮 ${t('school.classGames.hiddenGame')}</b>`}
      <span class="small muted"><bdi>${t('school.classGames.by', { name: who(g) })}</bdi></span></div>
      <form class="cg-act" data-api="/api/classes/${c.id}/games/${g.id}/restore" data-reload><button class="btn btn-sm" type="submit">${t('school.classGames.restore')}</button></form></li>`)}</ul></details>` : ''}`;
}
function teacherClass(req, res, c) {
  const t = req.t; const s = S.getSchool(c.school_id); const st = S.settingsOf(s);
  const tab = ['games', 'students', 'settings'].includes(req.query.tab) ? req.query.tab : 'lessons';
  const people = S.roster(c.id), teachers = people.filter(p => p.role === 'teacher'), students = people.filter(p => p.role === 'student');
  const others = S.classesOfSchool(s.id).filter(x => x.id !== c.id);
  const inClass = new Set(people.map(p => p.id));
  const classes = S.memberClasses(s.id);
  // Students of the school who aren't in this class; the ones in no class at all first.
  const schoolStudents = S.members(s.id, 'student').filter(p => !inClass.has(p.id)).map((p, i) => ({ p, i, placed: classes[p.id] ? 1 : 0 })).sort((a, z) => a.placed - z.placed || a.i - z.i).map(x => x.p);
  const schoolStaff = S.members(s.id, 'staff').filter(p => !inClass.has(p.id));
  const cardable = students.filter(p => p.managed_school === s.id).length;
  const manager = S.canManageSchool(req.user, s.id);
  const ginfo = googleRosterInfo(students.map(p => p.id));

  const studentsTab = html`
  ${requestsPanel(req, c, s, people)}
  ${students.length ? html`<section class="panel" aria-labelledby="stu-h"><div class="panelhead"><h2 id="stu-h">👩‍🎓 ${t('school.class.studentsN', { count: students.length })}</h2>
      ${cardable ? html`<form data-api="/api/classes/${c.id}/cards" data-confirm="${t('school.class.reprintConfirm', { count: cardable })}"><button class="btn btn-sm" type="submit">🪪 ${t('school.class.reprint')}</button></form>` : ''}</div>
    <div class="tblwrap"><table class="tbl rtable roster"><thead><tr><th>${t('school.people.name')}</th><th>${t('school.cards.username')}</th><th>${t('school.people.grade')}</th><th><span class="sr-only">${t('school.actions')}</span></th></tr></thead><tbody>
      ${students.map(p => studentRow(req, c, s, p, others, ginfo))}
    </tbody></table></div></section>`
    : emptyState({ emoji: '👩‍🎓', title: t('school.class.noStudents'), text: `${t('school.class.noStudentsText')}${st.allowOwnAccounts ? ` ${t('school.class.noStudentsCode')}` : ''}` })}
  ${classInvitesPanel(req, c, s)}
  <section class="panel"><h2>🪪 ${t('school.class.newAccounts')}</h2>
    <form class="formgrid" data-api="/api/classes/${c.id}/students" novalidate>
      <div class="field wide"><label for="as-n">${t('school.people.names')}</label><textarea class="input" id="as-n" name="names" rows="4" required placeholder="${t('school.people.namesPlaceholder')}"></textarea><span class="err" id="as-n-err"></span><span class="hint">${t('school.class.newAccountsHint')}</span></div>
      <div class="field"><label for="as-g">${optional(t, t('school.people.grade'))}</label><input class="input" id="as-g" name="grade" maxlength="12" value="${c.grade}"></div>
      <div class="formacts"><button class="btn btn-primary" type="submit">🪪 ${t('school.class.createCards')}</button></div>
    </form></section>
  ${schoolStudents.length ? html`<details class="panel"><summary>➕ ${t('school.class.alreadyAt', { school: s.name, count: schoolStudents.length })}</summary>
    <form class="stack" data-api="/api/classes/${c.id}/students" data-reload novalidate><input type="hidden" name="mode" value="existing">
      <fieldset class="picklist"><legend class="sr-only">${t('school.class.alreadyAt', { school: s.name, count: schoolStudents.length })}</legend>
        ${schoolStudents.map(p => html`<label><input type="checkbox" name="existing" value="${p.id}"><span><b>${nameOf(p)}</b> <span class="small muted"><bdi>@${p.username}</bdi></span><span class="small muted pl-sub">${classes[p.id] ? classes[p.id].map(x => x.name).join(', ') : html`<span class="chip-s">${t('school.people.noClass')}</span>`}</span></span></label>`)}</fieldset>
      <span class="err form-err" role="alert"></span>
      <div><button class="btn btn-primary" type="submit">➕ ${t('school.class.addToClass')}</button></div>
    </form></details>` : ''}
  <section class="panel joincode"><div><h2>🔑 ${t('school.class.joinCode')}</h2><p class="small muted">${st.allowOwnAccounts ? t('school.class.joinCodeTextOn', { school: s.name }) : t('school.class.joinCodeTextOff', { school: s.name })}</p></div>
    <div class="jc-code" dir="ltr">${c.join_code}</div>
    <form data-api="/api/classes/${c.id}/code" data-reload data-confirm="${t('school.class.newCodeConfirm')}"><button class="btn btn-sm" type="submit">🔄 ${t('school.class.newCode')}</button></form>
    ${classGoogleJoin(req, c, s)}</section>`;

  const admins = S.members(s.id, 'staff').filter(p => p.role === 'admin').map(nameOf).join(', ');
  const iTeach = teachers.some(p => p.id === req.user.id);
  const canDelete = !S.everHadStudents(c.id);
  const settingsTab = html`
  <section class="panel"><h2>✏️ ${t('school.class.details')}</h2>
    <form class="formgrid" data-api="/api/classes/${c.id}" data-reload data-toast="${t('school.settings.saved')}" novalidate>
      <div class="field"><label for="ec-n">${t('school.class.name')}</label><input class="input" id="ec-n" name="name" value="${c.name}" maxlength="60" required><span class="err" id="ec-n-err"></span></div>
      <div class="field"><label for="ec-s">${optional(t, t('school.class.subject'))}</label><input class="input" id="ec-s" name="subject" value="${c.subject}" maxlength="40"></div>
      <div class="field"><label for="ec-g">${optional(t, t('school.class.grade'))}</label><input class="input" id="ec-g" name="grade" value="${c.grade}" maxlength="12"></div>
      <div class="formacts"><button class="btn btn-primary" type="submit">${t('school.save')}</button></div>
    </form></section>
  <section class="panel" aria-labelledby="tch-h"><h2 id="tch-h">🍎 ${t('school.class.teachers')}</h2>
    <p class="small muted">${teachers.length ? t('school.class.teachersText') : t('school.class.noTeacher')}</p>
    ${teachers.length ? html`<ul class="plain chips-list">${teachers.map(p => html`<li class="pp">${avatar(p, 28)} ${nameOf(p)}${teachers.length > 1 && p.id !== req.user.id ? html`<form class="inline" data-api="/api/classes/${c.id}/students/${p.id}/remove" data-reload data-confirm="${t('school.class.removeTeacherConfirm', { name: nameOf(p) })}"><button class="linkbtn" type="submit" aria-label="${t('school.class.removeTeacher', { name: nameOf(p) })}">✖</button></form>` : ''}</li>`)}</ul>` : ''}
    ${schoolStaff.length ? html`<form class="row" data-api="/api/classes/${c.id}/teachers" data-reload><label class="sr-only" for="at">${t('school.class.addTeacher')}</label><select class="input grow" id="at" name="userId" required><option value="">${t('school.class.teacherChoose')}</option>${staffOptions(t, schoolStaff, req.user)}</select><button class="btn" type="submit">➕ ${t('school.class.addTeacher')}</button></form>`
      : manager ? html`<p class="small"><a href="/school/${s.slug}?tab=people#add-staff">➕ ${t('school.class.addStaffLink')}</a></p>`
        : html`<p class="small muted">${t('school.class.onlyStaff', { school: s.name })} ${admins ? t('school.class.askAdmin', { admins }) : t('school.class.askNoAdmin', { school: s.name })}</p>`}
    ${iTeach && teachers.length > 1 ? html`<form data-api="/api/classes/${c.id}/students/${req.user.id}/remove" data-confirm="${t('school.class.leaveConfirm', { name: c.name })}"><button class="btn btn-sm" type="submit">🚪 ${t('school.class.leave')}</button></form>` : ''}
  </section>
  ${!c.archived_at || canDelete ? html`<section class="panel" aria-labelledby="ad-h"><h2 id="ad-h">🗄️ ${c.archived_at ? t('school.class.deleteTitle') : t('school.class.archiveTitle')}</h2>
    ${c.archived_at ? '' : html`<p class="small muted">${t('school.class.archiveText')}</p>
    <form data-api="/api/classes/${c.id}/archive" data-reload data-confirm="${t('school.class.archiveConfirm', { name: c.name })}"><button class="btn" type="submit">🗄️ ${t('school.class.archive')}</button></form>`}
    ${canDelete ? html`<p class="small muted">${t('school.class.deleteText')}</p>
    <form data-api="/api/classes/${c.id}/delete" data-confirm="${t('school.class.deleteConfirm', { name: c.name })}"><button class="btn btn-danger" type="submit">${t('school.class.delete')}</button></form>` : ''}
  </section>` : ''}`;

  const body = html`${classHeader(req, c, tab)}
  ${tab === 'students' ? studentsTab : tab === 'settings' ? settingsTab : tab === 'games' ? classGamesTab(req, c, people) : teacherLessonsPanel(req, c)}`;
  page(req, res, { title: c.name, active: 'classes', body, head: CSS, scripts: ['/js/schools.js'], ...classBack(req, c) });
}
function studentClass(req, res, c) {
  const t = req.t; const s = S.getSchool(c.school_id);
  const people = S.roster(c.id);
  const teachers = people.filter(p => p.role === 'teacher'), classmates = people.filter(p => p.role === 'student' && p.id !== req.user.id);
  const body = html`
  <div class="pagehead"><div><span class="small muted">${s.name}</span><h1>${c.name}</h1>
    <p class="muted">${[c.subject, gradeLabel(t, c.grade)].filter(Boolean).join(' · ')}</p></div>${studentNotYou(req, S.classMember(c.id, req.user.id)?.role === 'student')}</div>
  ${studentLessonsPanel(req, c)}
  ${studentGamesPanel(req, c, teachers)}
  <div class="cols2"><section class="panel"><h2>🍎 ${t('school.class.teachers')}</h2><ul class="plain chips-list">${teachers.map(p => html`<li class="pp">${avatar(p, 28)} ${nameOf(p)}</li>`)}</ul></section>
  <section class="panel"><h2>👫 ${t('classes.classmates', { count: classmates.length })}</h2>${classmates.length ? html`<ul class="plain chips-list">${classmates.map(p => html`<li class="pp">${avatar(p, 28)} ${p.display_name}</li>`)}</ul>` : ''}</section></div>`;
  page(req, res, { title: c.name, active: 'classes', body, head: CSS, back: '/classes', backLabel: t('nav.classes') });
}

/** "Games from our class" on a student's class page: games shared only with this class (everyone who can open this
 *  page can open each of them). */
function studentGamesPanel(req, c, teachers = []) {
  const t = req.t; const list = games.classGames(c.id, { limit: 200 });
  // A teacher's own game is credited with the name the class knows them by (as in the Teachers list), not a username.
  const staff = new Map(teachers.map(p => [p.id, nameOf(p)]));
  return html`<section class="panel" aria-labelledby="cg-h"><h2 id="cg-h">🎮 ${t('classes.games.heading')}</h2>
    ${list.length ? cardGrid(list, { classPill: false, byName: g => staff.get(g.owner_id) || null }) : emptyState({ emoji: '🎒', title: t('classes.games.emptyTitle'), text: t('classes.games.emptyText'), action: req.user.is_guest ? null : { href: '/build', label: t('classes.games.emptyAction') } })}
  </section>`;
}

// ---- class APIs
// A class's teacher (or a school admin) takes a game off the class / puts it back. 404 when the game isn't on (or
// wasn't taken off) this class's list.
router.post('/api/classes/:id/games/:gid/remove', requireUser, (req, res) => {
  const c = loadClass(req, res); if (!c) return;
  const r = S.removeClassGame(req.user, c.id, String(req.params.gid));
  if (!r.ok) return err(req, res, 'gameNotHere', 404);
  res.json({ ok: true, toast: req.t('school.classGames.removed', { class: c.name }) });
});
router.post('/api/classes/:id/games/:gid/restore', requireUser, (req, res) => {
  const c = loadClass(req, res); if (!c) return;
  const r = S.restoreClassGame(req.user, c.id, String(req.params.gid));
  if (!r.ok) return err(req, res, 'gameNotHere', 404);
  res.json({ ok: true, toast: req.t('school.classGames.restored', { class: c.name }) });
});
// (before /api/classes/:id, which would otherwise catch 'join')
router.post('/api/classes/join', requireUser, rateLimit('class-join', 20, 3600e3), (req, res) => {
  const r = S.requestJoin(req.user, b(req).code);
  if (!r.ok) return err(req, res, r.code);
  if (r.state === 'pending') return res.json({ ok: true, state: r.state, toast: req.t('classes.sent', { name: r.class.name }), redirect: '/classes?sent=1' });
  res.json({ ok: true, state: r.state, redirect: `/class/${r.class.id}` });
});
router.post('/api/classes/:id', requireUser, (req, res) => { const c = loadClass(req, res); if (!c) return; const { name, subject, grade } = b(req); if (!String(name || '').trim()) return fieldErr(res, 'name', req.t('school.errors.className')); send(req, res, S.updateClass(req.user, c.id, { name, subject, grade })); });
router.post('/api/classes/:id/code', requireUser, (req, res) => { const c = loadClass(req, res); if (!c) return; send(req, res, S.newCode(req.user, c.id)); });
router.post('/api/classes/:id/archive', requireUser, (req, res) => { const c = loadClass(req, res); if (!c) return; send(req, res, S.archiveClass(req.user, c.id, true)); });
router.post('/api/classes/:id/restore', requireUser, (req, res) => { const c = loadClass(req, res); if (!c) return; send(req, res, S.archiveClass(req.user, c.id, false)); });
router.post('/api/classes/:id/delete', requireUser, (req, res) => {
  const c = loadClass(req, res); if (!c) return;
  const s = S.getSchool(c.school_id);
  // Afterwards: back to the school page when deleted from there (or by a school admin who doesn't teach it), else My classes.
  const toSchool = b(req).from === 'school' || (!S.teaches(req.user, c.id) && S.canManageSchool(req.user, s.id));
  send(req, res, S.deleteClass(req.user, c.id), { toast: req.t('school.class.deleted', { name: c.name }), redirect: toSchool ? `/school/${s.slug}` : '/teach' });
});
router.post('/api/classes/:id/students', requireUser, rateLimit('school-add', 120, 3600e3), (req, res) => {
  const c = loadClass(req, res); if (!c) return;
  const t = req.t; const s = S.getSchool(c.school_id);
  const existing = asList(b(req).existing);
  if (existing.length || b(req).mode === 'existing') {
    if (!existing.length) return res.status(400).json({ error: t('school.errors.tickStudents') });
    // Students already at the school, ticked in the list: all must be students of this school.
    if (existing.some(id => { const m = S.membership(s.id, id); return !m || m.role !== 'student'; })) return err(req, res, 'notInSchool');
    for (const id of existing) S.addToClass(req.user, c.id, id, 'student');
    return res.json({ ok: true, toast: t('school.class.addedN', { count: existing.length }) });
  }
  const names = parseNames(b(req).names);
  if (!names.length) return fieldErr(res, 'names', t('school.errors.names'));
  const same = sameNames(s.id, names);
  if (same.length) return fieldErr(res, 'names', sameNamesError(req, s, same));
  const made = [];
  for (const n of names) { const r = S.createSchoolAccount(req.user, s.id, { rosterName: n, grade: b(req).grade }); if (r.ok) { S.addToClass(req.user, c.id, r.user.id, 'student'); made.push(card(r)); } }
  res.json({ ok: true, redirect: `/cards/${keepCards(req.user, made, { schoolId: s.id, classId: c.id })}` });
});
// New login cards for every school-account student in the class (old passwords stop working; they are signed out).
router.post('/api/classes/:id/cards', requireUser, rateLimit('class-cards', 10, 3600e3), (req, res) => {
  const c = loadClass(req, res); if (!c) return;
  const students = S.roster(c.id).filter(p => p.role === 'student');
  const made = [], skipped = [];
  for (const p of students) {
    if (p.managed_school !== c.school_id) { skipped.push(nameOf(p)); continue; }
    const sm = S.membership(c.school_id, p.id); if (!sm || sm.role !== 'student') continue;
    const r = S.resetSchoolPassword(req.user, c.school_id, p.id);
    if (r.ok) made.push({ name: nameOf(p), username: r.username, password: r.password });
  }
  if (!made.length) return err(req, res, 'noSchoolAccounts');
  res.json({ ok: true, redirect: `/cards/${keepCards(req.user, made, { schoolId: c.school_id, classId: c.id, skipped })}` });
});
router.post('/api/classes/:id/teachers', requireUser, (req, res) => {
  const c = loadClass(req, res); if (!c) return;
  if (!String(b(req).userId || '').trim()) return fieldErr(res, 'userId', req.t('school.errors.chooseTeacher'));
  const m = S.membership(c.school_id, b(req).userId);
  if (!m || m.role === 'student') return err(req, res, 'badRole');
  send(req, res, S.addToClass(req.user, c.id, m.user_id, 'teacher'));
});
const memberOf = (req, res, c) => { const m = S.classMember(c.id, req.params.uid); if (!m) { no(req, res); return null; } return m; };
router.post('/api/classes/:id/students/:uid/remove', requireUser, (req, res) => {
  const c = loadClass(req, res); if (!c) return; const m = memberOf(req, res, c); if (!m) return;
  if (m.role === 'teacher' && S.roster(c.id).filter(p => p.role === 'teacher').length < 2) return err(req, res, 'lastTeacher');
  const r = S.removeFromClass(req.user, c.id, m.user_id);
  // Leaving a class yourself: the class may no longer be yours to open, so go back to My classes (or the school page).
  if (r.ok && m.user_id === req.user.id) {
    const s = S.getSchool(c.school_id);
    return res.json({ ok: true, toast: req.t('school.class.left', { name: c.name }), redirect: S.canManageSchool(req.user, s.id) ? `/school/${s.slug}` : '/teach' });
  }
  send(req, res, r);
});
router.post('/api/classes/:id/students/:uid/move', requireUser, (req, res) => {
  const c = loadClass(req, res); if (!c) return; const m = memberOf(req, res, c); if (!m) return;
  if (m.role !== 'student') return no(req, res);
  if (!String(b(req).to || '').trim()) return fieldErr(res, 'to', req.t('school.errors.chooseClass'));
  // Teachers can move their students to any class of the same school (the other class's teacher sees them arrive).
  const to = S.getClass(b(req).to);
  if (!to || to.school_id !== c.school_id || to.archived_at || to.id === c.id) return no(req, res);
  const p = S.roster(c.id).find(x => x.id === m.user_id);
  send(req, res, S.moveStudent(req.user, c.id, to.id, m.user_id), { toast: req.t('school.class.moved', { name: p ? nameOf(p) : '', class: to.name }) });
});
router.post('/api/classes/:id/students/:uid/password', requireUser, (req, res) => {
  const c = loadClass(req, res); if (!c) return; const m = memberOf(req, res, c); if (!m) return;
  const sm = S.membership(c.school_id, m.user_id);
  // Students only: staff passwords are reset by school admins on the People tab.
  if (m.role !== 'student' || !sm || sm.role !== 'student') return no(req, res);
  const r = S.resetSchoolPassword(req.user, c.school_id, m.user_id);
  if (!r.ok) return err(req, res, r.code);
  res.json({ ok: true, redirect: `/cards/${keepCards(req.user, [{ name: (sm && sm.roster_name) || r.user.display_name, username: r.username, password: r.password }], { schoolId: c.school_id, classId: c.id })}` });
});
const loadRequest = (req, res) => { const c = S.requestClass(req.params.rid); if (!c || !S.canManageClass(req.user, c)) { no(req, res); return null; } return c; };
router.post('/api/join-requests/:rid/approve', requireUser, (req, res) => {
  const c = loadRequest(req, res); if (!c) return;
  const { rosterName, sameAs } = b(req);
  if (!String(rosterName || '').trim() && !sameAs) return fieldErr(res, 'rosterName', req.t('school.errors.rosterName'));
  send(req, res, S.approveRequest(req.user, req.params.rid, { rosterName, sameAs: sameAs || null }));
});
router.post('/api/join-requests/:rid/decline', requireUser, (req, res) => { const c = loadRequest(req, res); if (!c) return; send(req, res, S.declineRequest(req.user, req.params.rid)); });

// ================================================================ login cards
router.get('/cards/:k', requireUser, (req, res) => {
  const t = req.t; const v = CARDS.get(req.params.k);
  if (!v || v.by !== req.user.id || v.exp < Date.now()) return notFound(req, res, t('school.cards.gone'));
  const s = S.getSchool(v.schoolId); const c = v.classId ? S.getClass(v.classId) : null;
  const site = `${siteHost(req).replace(/^www\./, '')}/login`;
  const back = v.back === 'class' && c ? { href: `/class/${c.id}?tab=students`, label: t('school.cards.backClass', { name: c.name }) }
    : s ? { href: `/school/${s.slug}?tab=people`, label: t('school.cards.backPeople') } : { href: '/teach', label: t('school.teach.title') };
  const body = html`
  <div class="pagehead noprint"><h1>🪪 ${t('school.cards.title')}</h1><div class="row"><button class="btn btn-primary" type="button" data-print>🖨️ ${t('school.cards.print')}</button><a class="btn" href="${back.href}">${back.label}</a></div></div>
  <p class="notice warn noprint">${t('school.cards.once')}</p>
  ${v.skipped.length ? html`<p class="notice noprint">${t('school.cards.skipped', { count: v.skipped.length, names: v.skipped.join(', ') })}</p>` : ''}
  <div class="cards">${v.cards.map(x => html`<div class="logincard">
    <div class="lc-top">${appMark('lc-mark appmark')}<span>${[s && s.name.includes(BRAND) ? null : BRAND, s && s.name, c && c.name, x.role && t(`school.roles.${x.role}`)].filter(Boolean).join(' · ')}</span></div>
    <div class="lc-name">${x.name}</div>
    <dl><dt>${t('school.cards.site')}</dt><dd dir="ltr">${site}</dd><dt>${t('school.cards.username')}</dt><dd dir="ltr"><b>${x.username}</b></dd><dt>${t('school.cards.password')}</dt><dd dir="ltr"><b>${x.password}</b></dd></dl>
  </div>`)}</div>`;
  page(req, res, { title: t('school.cards.title'), active: 'classes', body, head: CSS, scripts: ['/js/schools.js'] });
});

// ================================================================ students: My classes (/classes)
router.get('/classes', requireUser, (req, res) => {
  const t = req.t; const u = req.user;
  const mine = S.classesOf(u.id, 'student'), waiting = S.myPendingRequests(u.id);
  // Staff work from their own My classes, and the platform admin from Schools, unless they are also a student somewhere.
  if (!mine.length && !waiting.length) {
    if (S.isSchoolStaff(u)) return res.redirect('/teach');
    if (S.isPlatformAdmin(u)) return res.redirect('/admin/schools');
  }
  const body = html`
  <div class="pagehead"><h1>🏫 ${t('classes.title')}</h1>${studentNotYou(req, mine.length > 0)}</div>
  ${mine.length ? html`<div class="classgrid">${mine.map(c => html`<a class="panel classcard" href="/class/${c.id}"><span class="cc-school small muted">${c.school_name}</span><b class="cc-name">${c.name}</b>${c.teachers ? html`<span class="cc-meta">🍎 ${c.teachers}</span>` : ''}</a>`)}</div>`
    : waiting.length ? '' : emptyState({ emoji: '🏫', title: t('classes.none'), text: u.is_guest ? t('classes.guest') : t('classes.noneText') })}
  ${waiting.length || !u.is_guest ? html`<div class="cols2">
  ${waiting.length ? html`<section class="panel"><h2>⏳ ${t('classes.waiting')}</h2><ul class="plain">${waiting.map(w => html`<li>${w.class_name} <span class="muted small">· ${w.school_name}</span></li>`)}</ul></section>` : ''}
  ${u.is_guest ? '' : html`<section class="panel"><h2>${t('classes.join')}</h2><p class="small muted">${t('classes.joinText')}</p>
    <form class="row" data-api="/api/classes/join" novalidate><label class="sr-only" for="jc">${t('classes.code')}</label>
      <input class="input code-input" id="jc" name="code" maxlength="8" autocomplete="off" autocapitalize="characters" spellcheck="false" dir="ltr" placeholder="ABC123" required>
      <button class="btn btn-primary" type="submit">${t('classes.joinButton')}</button><span class="err form-err" role="alert"></span></form></section>`}</div>` : ''}`;
  page(req, res, { title: t('classes.title'), active: 'classes', body, head: CSS });
});
