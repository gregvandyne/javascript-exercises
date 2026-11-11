// Schools (enterprise): the platform admin's Schools list, each school's page (Classes · People · Settings), the
// teacher's My classes (/teach), class pages, login cards and the student's My classes (/classes).
// Permissions all come from services/schools.js; anyone without access gets 404.
// Forms post JSON through the generic form[data-api] handler in app.js: data-reload or a { redirect } reply, and a
// { toast } reply (or data-toast) is shown after the reload.
import { Router } from 'express';
import crypto from 'node:crypto';
import { html, raw } from '../views/html.js';
import { page, notFound, VERSION } from '../views/layout.js';
import { avatar, emptyState, gradeLabel, BRAND, appMark, notYou, coverArt, cardGrid, makeGameBtn, jumpNav, nameFilter } from '../views/components.js';
import { ADMIN_BODY, ADMIN_CSS } from '../views/admin-ui.js';
import { requireUser, requireAdmin, getUserByName, accountKind, isRetiredName } from '../auth.js';
import { rateLimit } from '../services/ratelimit.js';
import * as S from '../services/schools.js';
import * as SR from '../services/school-requests.js';
import { sendSchoolWelcome, schoolWelcomeEmail } from '../services/school-welcome.js';
import { welcomeToken, WELCOME_DAYS } from './password-reset.js';
import { siteBase, maskEmail, normEmail, sendingOn, addressOf } from '../services/email.js';
import { tFor, LOCALES, CODES } from '../i18n/index.js';
import { audit } from '../db.js';
import { cleanName } from '../services/textfilter.js';
import { teacherLessonsPanel, studentLessonsPanel, dueChip } from './lessons.js';
import * as P from '../services/progress.js';
import * as L from '../services/lessons.js';
import * as games from '../services/games.js';
import { siteHost } from '../site.js';
import { billingTabOn, schoolBillingTab } from './school-billing.js';
import { cardsHook, classInvitesPanel, classGoogleJoin, googleRosterInfo, googleRosterLine, googleRowMenu, schoolGoogleSettings, staffGoogleInvites } from './google.js';
import { gcRosterHint } from './gclassroom.js';
import { canHost as liveCanHost } from '../services/classlive-access.js';
import { liveOn, openForClass, hostSession } from '../services/classlive-sessions.js';
import * as TL from '../services/teach-loop.js';
import { teacherLoop } from '../views/teacher-loop.js';
import { LOOP_CSS } from './teach-loop.js';

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

/** The teacher's one class (a teacher of exactly one class that isn't archived), or null: /teach opens it directly. */
export function onlyClass(u) {
  const mine = u ? S.classesOf(u.id, 'teacher') : [];
  return mine.length === 1 ? mine[0] : null;
}
/** The list of the teacher's classes: /teach, or /teach?all=1 for a teacher of one class (whose /teach opens it). */
export const classesHref = u => (onlyClass(u) ? '/teach?all=1' : '/teach');
/** Where a class page's back link goes: My classes for its teachers (with one class: the list, "All classes"), the
 *  school page for school admins who don't teach it. */
export function classBack(req, c) {
  const t = req.t;
  if (!S.teaches(req.user, c.id) && S.canManageSchool(req.user, c.school_id)) { const s = S.getSchool(c.school_id); return { back: `/school/${s.slug}`, backLabel: s.name }; }
  return onlyClass(req.user) ? { back: '/teach?all=1', backLabel: t('teach.home.allClasses') } : { back: '/teach', backLabel: t('school.teach.title') };
}

// One-time login cards (new and reset passwords are shown once, then forgotten). In memory, 30 minutes, creator only.
// back: 'people' (the school's People tab) or 'class' (the class's Students tab).
const CARDS = new Map();
const CARDS_KEEP_MS = 24 * 3600e3;
function keepCards(by, cards, { schoolId, classId = null, back = classId ? 'class' : 'people', skipped = [] }) {
  const k = crypto.randomBytes(12).toString('base64url');
  for (const [key, v] of CARDS) if (v.exp < Date.now()) CARDS.delete(key);
  // Kept for the teacher who made them (only them) for a day: made on a phone during a break, printed at school later.
  CARDS.set(k, { by: by.id, schoolId, classId, back, cards, skipped, exp: Date.now() + CARDS_KEEP_MS });
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
  // An older "Create school" link from a request: the one setup page now does the school, its admin and the welcome.
  if (req.query.request) return res.redirect(302, `/admin/schools/setup?request=${encodeURIComponent(String(req.query.request))}`);
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
      <td data-label="School admin">${admins[s.id] || html`<a class="chip-s warn" href="/school/${s.slug}?tab=people">⚠️ None yet</a>`} <a class="btn btn-sm" href="/admin/schools/setup?school=${s.id}">✉️ ${admins[s.id] ? 'Welcome email' : 'Set up admin'}</a></td>
      <td data-label="Classes">${s.classes}</td><td data-label="Students">${s.students}</td><td data-label="Added">${new Date(s.created_at).toISOString().slice(0, 10)}</td></tr>`)}
  </tbody></table></div>` : emptyState({ emoji: '🏫', title: 'No schools yet', text: 'Add the first school above, then appoint its school admin on its People tab.' })}`;
  page(req, res, { title: 'Schools', active: S.isSchoolStaff(req.user) ? 'me' : 'schools', body, bodyClass: ADMIN_BODY, head: html`${CSS}${ADMIN_CSS}`, back: '/admin', backLabel: 'Admin' });
});
router.post('/api/admin/schools', requireAdmin, (req, res) => {
  const r = S.createSchool(req.user, { name: b(req).name });
  if (!r.ok) return err(req, res, r.code);
  // Made from a "Set up my school" request: that request is done, and remembers the school.
  if (b(req).request) SR.close(req.user, String(b(req).request), 'done', { schoolId: r.school.id });
  // The first job for a new school is appointing its school admin (the request's sender's name filled in).
  res.json({ ok: true, redirect: `/school/${r.school.slug}?tab=people&new=1${b(req).request ? `&from=${encodeURIComponent(String(b(req).request))}` : ''}` });
});

// ---- Set up a school from a request (docs/decisions.md "Setting up a school from a request")
// One page does what used to be three steps (create the school, appoint its admin on the People tab, email them by
// hand): the school (new, or one that exists), its admin (a new school account, their own Oomba account, or one of the
// school's admins already), and the welcome email to the address on the request, in its language. A new school account
// gets a link to choose its own password: no password is written in the email, and there is nothing to hand over.
// Also used later from the Schools list ("Welcome email") to send it again.
const setupLangs = () => LOCALES.filter(l => CODES.includes(l.code));
function setupContext(q0) {
  const r = q0.request ? SR.getRequest(String(q0.request)) : null;
  const school = q0.school ? S.getSchool(String(q0.school)) : r && r.school_id ? S.getSchool(r.school_id) : null;
  // The newest request linked to an existing school gives its email and language.
  const req2 = r || (school ? SR.latestForSchool(school.id) : null);
  return { r: req2, school };
}
router.get('/admin/schools/setup', requireAdmin, (req, res) => {
  const { r, school } = setupContext(req.query);
  if (req.query.request && !r) return notFound(req, res, 'That request is gone (requests are deleted a year after they close).');
  const admins = school ? S.members(school.id, 'admin') : [];
  const lang = r && CODES.includes(r.locale) ? r.locale : 'en';
  const email = r ? r.email : '';
  const name = r ? r.contact_name || '' : '';
  const sending = sendingOn();
  const opt = (v, label, on) => html`<label><input type="radio" name="account" value="${v}" ${on ? raw('checked') : ''}> ${label}</label>`;
  const body = html`
  <div class="pagehead"><h1>🏫 ${school ? `Welcome email: ${school.name}` : 'Set up a school'}</h1></div>
  ${r ? html`<section class="panel"><p style="margin:0"><b>${r.school_name}</b></p><p class="small muted" style="margin:4px 0 0">${r.contact_name ? html`${r.contact_name} · ` : ''}<span dir="ltr">${r.email}</span> · ${r.country} · about ${r.students} students · sent ${new Date(r.created_at).toISOString().slice(0, 10)}${r.status !== 'open' ? html` · <span class="chip-s">${r.status}</span>` : ''}</p></section>` : ''}
  ${sending ? '' : html`<p class="notice warn" id="setup-email-off">⚠️ Email sending is off (RESEND_API_KEY or EMAIL_ENABLED), so the welcome can't go out. Everything else still works, and you get a login card to send yourself.</p>`}
  <section class="panel">
    <form class="stack" data-api="/api/admin/schools/setup" novalidate id="setup-form">
      ${r ? html`<input type="hidden" name="request" value="${r.id}">` : ''}
      ${school ? html`<input type="hidden" name="schoolId" value="${school.id}"><p style="margin:0">School: <a href="/school/${school.slug}"><b>${school.name}</b></a></p>`
        : html`<div class="field"><label for="su-school">1. School name</label><input class="input" id="su-school" name="name" maxlength="80" required value="${r ? r.school_name.slice(0, 80) : ''}"><span class="err" id="su-school-err"></span></div>`}
      <fieldset class="field choice"><legend>${school ? '1' : '2'}. Their school admin account</legend>
        ${admins.length ? opt('current', 'One of this school\'s admins (below)', true) : ''}
        ${opt('new', 'Make a new school account for them (recommended: they choose its password from the email)', !admins.length)}
        ${opt('existing', 'They already have an Oomba account (type its username)', false)}
      </fieldset>
      ${admins.length ? html`<div class="field" data-when="current"><label for="su-admin">School admin</label><select class="input" id="su-admin" name="adminId">${admins.map(a => html`<option value="${a.id}">${a.roster_name || a.display_name} (@${a.username})</option>`)}</select></div>` : ''}
      <div class="field" data-when="existing"><label for="su-user">Their username</label><input class="input" id="su-user" name="username" maxlength="16" dir="ltr" autocomplete="off"><span class="err" id="su-user-err"></span></div>
      <div class="field" data-when="new"><label for="su-uname">Username <span class="muted">(optional)</span></label><input class="input" id="su-uname" name="newUsername" maxlength="16" dir="ltr" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="e.g. RoxanaG" aria-describedby="su-uname-hint"><span class="hint" id="su-uname-hint">What they sign in with, shown in the email. 3 to 16 letters, digits or _. They can change it later on their Me page. Leave it empty for a made-up one.</span><span class="err" id="su-uname-err"></span></div>
      <div class="field" data-when="new existing"><label for="su-name">Their real name (as staff and students know them)</label><input class="input" id="su-name" name="rosterName" maxlength="60" value="${name}"><span class="err" id="su-name-err"></span></div>
      <div class="field"><label for="su-email">${school ? '2' : '3'}. Send the welcome to</label><input class="input" id="su-email" name="email" type="email" dir="ltr" maxlength="254" required value="${email}"><span class="err" id="su-email-err"></span></div>
      <div class="field"><label for="su-lang">Email language</label><select class="input" id="su-lang" name="lang">${setupLangs().map(l => html`<option value="${l.code}" ${l.code === lang ? raw('selected') : ''}>${l.name}</option>`)}</select></div>
      <p class="small muted">What happens: ${school ? '' : 'the school is made, '}their admin account is made or chosen, ${r && r.status === 'open' ? 'the request is marked done, ' : ''}and they get an email with how to sign in (a link to choose their password if the account is new), the school's setup checklist and how teachers start. Replies come to you. <a href="/admin/schools/setup/preview?in=${lang}" target="_blank" rel="noopener" id="su-preview">Preview the email</a></p>
      <p class="err form-err" aria-live="polite"></p>
      <button class="btn btn-primary" type="submit">${school ? '✉️ Send the welcome email' : '🏫 Set up and send the welcome'}</button>
    </form>
  </section>`;
  page(req, res, { title: 'Set up a school', active: 'schools', body, bodyClass: ADMIN_BODY, head: html`${CSS}${ADMIN_CSS}`, back: '/admin?tab=schoolreq', backLabel: 'School requests', scripts: ['/js/admin-school-setup.js'] });
});
/** The email as it will look (sample names), in a language. */
router.get('/admin/schools/setup/preview', requireAdmin, (req, res) => {
  const t = tFor(CODES.includes(req.query.in) ? req.query.in : 'en');
  const m = schoolWelcomeEmail(t, { name: 'Alex Rivera', school: 'Sample Elementary', username: 'SchoolAdmin42', setUrl: `${siteBase()}/reset?t=sample`, schoolUrl: `${siteBase()}/school/sample-elementary`, loginUrl: `${siteBase()}/login`, days: WELCOME_DAYS });
  res.set({ 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" });
  res.type('html').send(m.html.replace('<body', `<body data-subject="${m.subject.replace(/"/g, '&quot;')}"`).replace(/(<body[^>]*>)/, `$1<p style="font:14px system-ui;color:#555;border-bottom:1px solid #ddd;padding-bottom:8px">Subject: <b>${m.subject.replace(/</g, '&lt;')}</b></p>`));
});
router.post('/api/admin/schools/setup', requireAdmin, rateLimit('school-setup', 60, 3600e3), async (req, res) => {
  const x = b(req);
  const r = x.request ? SR.getRequest(String(x.request)) : null;
  if (x.request && !r) return res.status(404).json({ error: 'That request is gone.' });
  const email = normEmail(x.email);
  if (!email) return fieldErr(res, 'email', 'Type the email address the welcome goes to.');
  const account = ['new', 'existing', 'current'].includes(x.account) ? x.account : 'new';
  const rosterName = String(x.rosterName || '').trim();
  if (account !== 'current' && !rosterName) return fieldErr(res, 'rosterName', 'Type their real name.');
  let user = null;
  // Check the admin's account before anything is made, so a typo never leaves a school with nobody in charge.
  if (account === 'existing') {
    const u = getUserByName(String(x.username || '').trim());
    if (!u || u.is_guest || u.banned) return fieldErr(res, 'username', 'No account has that username.');
    if (u.account_type === 'grownup') return fieldErr(res, 'username', 'That is a family (parent) account: family accounts never join a school. Make a new school account for them instead.');
    if (accountKind(u) === 'student' || (u.managed_school && x.schoolId && u.managed_school !== String(x.schoolId))) return fieldErr(res, 'username', 'That is another school\'s account.');
    user = u;
  }
  const wanted = account === 'new' ? String(x.newUsername || '').trim() : '';
  if (wanted) {
    const n = cleanName(wanted, req.t, { realNames: true });
    if (!n.ok) return fieldErr(res, 'newUsername', n.error);
    if (getUserByName(wanted) || isRetiredName(wanted)) return fieldErr(res, 'newUsername', 'That username is taken. Try another one.');
  }
  let school = x.schoolId ? S.getSchool(String(x.schoolId)) : null;
  if (x.schoolId && !school) return res.status(404).json({ error: 'That school is gone.' });
  if (account === 'current') {
    if (!school) return res.status(400).json({ error: 'Choose a school first.' });
    const m = S.membership(school.id, String(x.adminId || ''));
    if (!m || m.role !== 'admin') return fieldErr(res, 'adminId', 'Choose one of the school\'s admins.');
    user = getUserByName(S.members(school.id, 'admin').find(a => a.id === m.user_id).username);
  }
  if (!school) {
    const made = S.createSchool(req.user, { name: x.name });
    if (!made.ok) return fieldErr(res, 'name', req.t(`school.errors.${made.code}`));
    school = made.school;
  }
  let cardKey = null;
  if (account === 'new') {
    const made = S.createSchoolAccount(req.user, school.id, { rosterName, role: 'admin', username: wanted });
    if (!made.ok) return made.code === 'usernameTaken' || made.code === 'badUsername' ? fieldErr(res, 'newUsername', 'That username is taken. Try another one.') : err(req, res, made.code);
    user = made.user;
    // Kept for a day in case the email can't go: the platform admin can print it and send it themselves.
    cardKey = keepCards(req.user, [card(made, 'admin')], { schoolId: school.id });
  } else if (account === 'existing') {
    const m = S.membership(school.id, user.id);
    if (!m || m.role !== 'admin') { const added = S.addMember(req.user, school.id, user.id, 'admin', { rosterName }); if (!added.ok) return err(req, res, added.code); }
  }
  if (r) { if (r.status === 'open') SR.close(req.user, r.id, 'done', { schoolId: school.id }); else SR.linkSchool(r.id, school.id); }
  // The link to choose a password: only for an account the school made (its first password nobody else should hold).
  const fresh = S.getSchool(school.id), u = getUserByName(user.username);
  const t = tFor(CODES.includes(x.lang) ? x.lang : r && CODES.includes(r.locale) ? r.locale : 'en');
  const setUrl = u.managed_school === fresh.id ? `${siteBase()}/reset?t=${encodeURIComponent(welcomeToken(u))}` : null;
  const name = rosterName || (S.membership(fresh.id, u.id) || {}).roster_name || '';
  let sent;
  try { sent = await sendSchoolWelcome(t, { user: u, email, name, school: fresh.name, setUrl, schoolUrl: `${siteBase()}/school/${fresh.slug}`, loginUrl: `${siteBase()}/login`, days: WELCOME_DAYS }); }
  catch { sent = { status: 'failed', reason: 'error' }; }
  // Ids and the outcome only: the address stays in email_prefs and email_log.
  audit(req.user.id, 'school.welcome_email', fresh.id, { user: u.id, status: sent.status, account });
  const qs = new URLSearchParams({ tab: 'people', welcome: sent.status === 'sent' ? 'sent' : 'notsent', to: maskEmail(email) });
  if (sent.status !== 'sent' && sent.reason) qs.set('why', String(sent.reason).slice(0, 60));
  if (sent.status !== 'sent' && cardKey) qs.set('card', cardKey);
  res.json({ ok: true, redirect: `/school/${fresh.slug}?${qs}` });
});

// ================================================================ the school page (school admins)
const loadSchool = (req, res) => {
  const s = S.getSchoolBySlug(req.params.slug);
  if (!s || !S.canManageSchool(req.user, s.id)) { no(req, res); return null; }
  return s;
};
const SCHOOL_TABS = ['classes', 'people', 'settings'];
/** Migration 0068 switched this school's chat off while its students were using it: said on every tab of the school
 *  page (the Settings tab has the full text beside the Chat box) until an admin switches chat on or keeps it off. */
function chatOffNotice(req, s, tab) {
  const t = req.t, st = S.settingsOf(s);
  if (!st.chatNotice || st.chat !== 'off' || s.archived_at || tab === 'settings') return '';
  return html`<p class="notice warn" id="chat-off-notice" role="status"><span aria-hidden="true">🛡️</span> ${t('school.settings.chatNoticeShort')} <a class="btn btn-sm" href="/school/${s.slug}?tab=settings#set-chat">${t('school.tabs.settings')}</a></p>`;
}
// /school: the School tab of a school admin's menu. An admin of one school goes to its People tab; of several, picks
// one; anyone else (teachers, students, kids, the platform admin who isn't a school's admin) gets a 404.
router.get('/school', requireUser, (req, res) => {
  const t = req.t;
  const list = S.adminSchools(req.user);
  if (!list.length) return no(req, res);
  // The School tab opens on the overview: the setup checklist and the classes (People is one tap away).
  if (list.length === 1) return res.redirect(302, `/school/${encodeURIComponent(list[0].slug)}`);
  const en = key => (t.own(key) ? '' : raw(' lang="en" dir="ltr"'));
  const body = html`<div class="pagehead"><h1${en('school.pick.title')}>🏛️ ${t('school.pick.title')}</h1></div>
    <p class="muted"${en('school.pick.text')}>${t('school.pick.text')}</p>
    <div class="classgrid">${list.map(x => html`<div class="panel classcard"><a class="cc-name cc-link" href="/school/${x.slug}"><b>${x.name}</b></a></div>`)}</div>`;
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
  ${S.canManageSchool(req.user, s.id) && !s.archived_at ? setupChecklist(req, s, tabs) : ''}
  ${chatOffNotice(req, s, tab)}
  <nav class="tabs" aria-label="${s.name}">${tabs.map(k => html`<a href="/school/${s.slug}?tab=${k}" ${k === tab ? raw('aria-current="page"') : ''}${t.own(`school.tabs.${k}`) ? '' : raw(' lang="en" dir="ltr"')}>${t(`school.tabs.${k}`)}</a>`)}</nav>
  ${content}`;
  // The School tab is current for the school's own admins; a teacher on a school page keeps Classes.
  const active = member ? (S.membership(s.id, req.user.id).role === 'admin' ? 'school' : 'classes') : S.isSchoolStaff(req.user) ? 'me' : 'schools';
  // The school's own admins are on their first tab (School): no back arrow to Classroom, which is one tab away.
  const back = active === 'school' ? null : member ? '/teach' : '/admin/schools';
  page(req, res, { title: s.name, active, body, head: CSS, scripts: tab === 'billing' ? ['/js/schools.js', '/js/family.js'] : ['/js/schools.js'],
    back, backLabel: member ? t('school.teach.title') : t('nav.schools') });
});

/** A new school's setup, in order, ticking itself off: ① teachers ② classes with their teacher ③ students in classes
 *  ④ the school's rules and time zone; and what a School plan adds (Billing, when that tab is on). Gone once ①-③ are done. */
function setupChecklist(req, s, tabs) {
  const t = req.t;
  const staff = S.members(s.id, 'staff'), students = S.members(s.id, 'student'), classes = S.classesOfSchool(s.id), placed = S.memberClasses(s.id);
  const steps = [
    ['teachers', staff.length > 1 || S.invitesOf(s.id).length > 0 || classes.length > 0, `/school/${s.slug}?tab=people#staff`],
    ['classes', classes.length > 0 && classes.every(c => c.teachers), `/school/${s.slug}?tab=classes#class-list`],
    ['students', students.length > 0 && students.every(p => placed[p.id]), `/school/${s.slug}?tab=people#students`],
    ['rules', !!S.zoneOf(s), `/school/${s.slug}?tab=settings`],
  ];
  // For a new school: gone once teachers, classes and students are in place (the time zone alone doesn't keep it up).
  if (steps.slice(0, 3).every(x => x[1])) return '';
  return html`<section class="panel setup-list" id="setup-list" aria-labelledby="setup-h"><h2 id="setup-h">🧭 ${t('school.setup.h')}</h2>
    <ol class="plain setup-steps">${steps.map(([k, done, href], i) => html`<li class="${done ? 'is-done' : ''}"><span class="setup-n" aria-hidden="true">${done ? '✅' : i + 1}</span> <a href="${href}">${t(`school.setup.${k}`)}</a>${done ? html` <span class="sr-only">${t('school.setup.done')}</span>` : ''}</li>`)}
      ${tabs.includes('billing') ? html`<li><span class="setup-n" aria-hidden="true">${steps.length + 1}</span> <a href="/school/${s.slug}?tab=billing">${t('school.setup.billing')}</a></li>` : ''}</ol></section>`;
}

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
  return html`<div class="panel tblwrap" id="class-list"><table class="tbl rtable classes"><thead><tr><th>${t('school.class.name')}</th><th>${t('school.class.grade')}</th><th>${t('school.class.teachers')}</th><th>${t('school.class.students')}</th><th>${t('school.class.lessons')}</th><th>${t('school.class.lastActivity')}</th><th>${t('school.class.code')}</th><th><span class="sr-only">${t('school.actions')}</span></th></tr></thead><tbody>
    ${list.map(c => html`<tr><td><a class="cl-name-link" href="/class/${c.id}"><b>${c.name}</b></a>${toRead[c.id] ? html` <a class="chip-s warn" href="/class/${c.id}/progress#to-review">✍️ ${t('progress.teach.toRead', { count: toRead[c.id] })}</a>` : ''}${c.subject ? html`<div class="small muted">${c.subject}</div>` : ''}</td><td data-label="${t('school.class.grade')}">${c.grade || '–'}</td>
      <td data-label="${t('school.class.teachers')}">${c.teachers || html`<a class="chip-s warn" href="/class/${c.id}?tab=settings#tch-h">⚠️ ${t('school.class.noTeacherChip')}</a>`}</td><td data-label="${t('school.class.students')}">${c.students}</td>
      <td data-label="${t('school.class.lessons')}">${c.lessons}</td><td data-label="${t('school.class.lastActivity')}">${c.last_activity ? f.ago(c.last_activity) : html`<span class="muted">${t('school.class.noActivity')}</span>`}</td><td data-label="${t('school.class.code')}"><code dir="ltr">${c.join_code}</code></td>
      <td class="tacts"><div class="acts">${classMenu(t, s, c)}</div></td></tr>`)}
  </tbody></table></div>`;
}
/** The New class form. On the school page it asks who teaches the class; on My classes the creator teaches it. */
function newClassForm(t, { schools, me, staff = null, open = false, focus = false }) {
  const s = schools[0];
  // focus (the page was asked for with ?new=class, "Make your first class"): open already, with the cursor in the name
  // box and no script needed (the link carries no #fragment: a browser skips autofocus when the address has one).
  // id + data-hash-open: a link to #new-class also opens the fold (public/js/app.js openFold).
  return html`<div class="libtools"><details class="libdrop" id="new-class" data-hash-open ${open || focus ? raw('open') : ''}><summary class="btn ${open ? '' : 'btn-primary'}">➕ ${t('school.class.new')}</summary>
    <form class="formgrid" data-api="/api/classes" novalidate>
      ${schools.length > 1 ? html`<div class="field"><label for="nc-s">${t('school.class.school')}</label><select class="input" id="nc-s" name="schoolId">${schools.map(x => html`<option value="${x.id}">${x.name}</option>`)}</select></div>` : html`<input type="hidden" name="schoolId" value="${s.id}">`}
      <div class="field"><label for="nc-n">${t('school.class.name')}</label><input class="input" id="nc-n" name="name" maxlength="60" required placeholder="${t('school.class.namePlaceholder')}" ${focus ? raw('autofocus') : ''}><span class="err" id="nc-n-err"></span></div>
      ${staff ? html`<div class="field"><label for="nc-t">${t('school.class.teacher')}</label><select class="input" id="nc-t" name="teacherId" required><option value="">${t('school.class.teacherChoose')}</option>${staffOptions(t, staff, me)}<option value="none">${t('school.class.teacherNone')}</option></select><span class="err" id="nc-t-err"></span></div>` : ''}
      <div class="field"><label for="nc-sub">${optional(t, t('school.class.subject'))}</label><input class="input" id="nc-sub" name="subject" maxlength="40"></div>
      <div class="field"><label for="nc-g">${optional(t, t('school.class.grade'))}</label><input class="input" id="nc-g" name="grade" maxlength="12"></div>
      <div class="formacts"><button class="btn btn-primary" type="submit">➕ ${t('school.class.create')}</button></div>
    </form></details></div>`;
}
/** The school at a glance (Classes tab): classes, teachers, students, students not in a class, answers to review.
 *  The people numbers link to the People tab. */
function schoolStats(req, s, live) {
  const t = req.t;
  const staff = S.members(s.id, 'staff'), students = S.members(s.id, 'student'), placed = S.memberClasses(s.id);
  const unplaced = students.filter(p => !placed[p.id]).length;
  const byClass = P.toReadByClass(live.map(c => c.id));
  const toRead = Object.values(byClass).reduce((n, x) => n + x, 0);
  // Answers to review link to the class that has them (its Progress tab, at the list of answers to read); spread over
  // several classes, to the class list below, where each class shows its own count.
  const most = live.filter(c => byClass[c.id]).sort((a, z) => byClass[z.id] - byClass[a.id])[0];
  const people = `/school/${s.slug}?tab=people`;
  return html`<ul class="plain statstrip" aria-label="${s.name}">
    <li>🏫 ${t('school.stats.classes', { count: live.length })}</li>
    <li><a href="${people}#staff">🍎 ${t('school.stats.staff', { count: staff.length })}</a></li>
    <li><a href="${people}#students">👩‍🎓 ${t('school.class.studentsN', { count: students.length })}</a></li>
    ${unplaced ? html`<li class="warn"><a href="${people}#students">🧭 ${t('school.stats.unplaced', { count: unplaced })}</a></li>` : ''}
    ${toRead ? html`<li class="warn"><a href="${Object.keys(byClass).filter(id => byClass[id]).length > 1 ? '#class-list' : `/class/${most.id}/progress#to-review`}">✍️ ${t('progress.teach.toRead', { count: toRead })}</a></li>` : ''}
  </ul>`;
}
function schoolClasses(req, s) {
  const t = req.t; const live = S.classesOfSchool(s.id), old = S.classesOfSchool(s.id, { archived: true });
  return html`${schoolStats(req, s, live)}
  ${newClassForm(t, { schools: [s], me: req.user, staff: S.members(s.id, 'staff') })}
    ${live.length ? classTable(req, s, live) : emptyState({ emoji: '🏫', title: t('school.class.none'), text: t('school.class.noneText') })}
    ${old.length ? html`<details class="panel"><summary>🗄️ ${t('school.class.archived', { count: old.length })}</summary>${classTable(req, s, old)}</details>` : ''}`;
}

/** A person's live classes in the school, as links (or "Not in a class"). */
function classLinks(t, rows, student) {
  if (!rows || !rows.length) return html`<span class="muted">${t('school.people.noClass')}</span>`;
  return html`<span class="clinks">${rows.map((c, i) => html`${i ? ', ' : ''}<a href="/class/${c.id}${student ? '?tab=students' : ''}">${c.name}</a>`)}</span>`;
}
function personRow(req, s, p, me, classes, ginfo, live = []) {
  const t = req.t;
  const mine = p.id === me.id; const student = p.role === 'student';
  const second = student
    ? html`<details class="gedit"><summary class="btn btn-sm" aria-label="${t('school.people.changeGrade', { name: nameOf(p) })}"><span class="gv">${p.grade || '–'} <span aria-hidden="true">✏️</span></span><span class="gx" aria-hidden="true" title="${t('school.cancel')}">✕</span></summary><form class="inline" data-api="/api/schools/${s.id}/members/${p.id}" data-reload data-toast="${t('school.settings.saved')}"><label class="sr-only" for="g-${p.id}">${t('school.people.grade')}</label><input class="input input-sm" id="g-${p.id}" name="grade" value="${p.grade}" maxlength="12" placeholder="${t('school.people.grade')}"><button class="btn btn-sm" type="submit">${t('school.save')}</button></form></details>`
    : mine ? html`<span>${t('school.people.you', { role: t(`school.roles.${p.role}`) })}</span>`
      : html`<form class="inline" data-api="/api/schools/${s.id}/members/${p.id}" data-reload data-toast="${t('school.settings.saved')}"><label class="sr-only" for="r-${p.id}">${t('school.people.role')}</label><select class="input input-sm" id="r-${p.id}" name="role">${['teacher', 'admin'].map(r => html`<option value="${r}" ${selected(p.role === r)}>${t(`school.roles.${r}`)}</option>`)}</select><button class="btn btn-sm" type="submit">${t('school.save')}</button></form>`;
  return html`<tr${student && !(classes[p.id] || []).length ? raw(' data-noclass') : ''}><td><span class="pp">${avatar(p, 32)}<span><b>${nameOf(p)}</b><span class="small muted"><bdi>@${p.username}</bdi> · ${p.managed_school === s.id ? t('school.people.schoolAccount') : t('school.people.ownAccount')}</span>${googleRosterLine(req, ginfo, p)}</span></span></td>
    <td class="edit" data-label="${student ? t('school.people.grade') : t('school.people.role')}">${second}</td>
    <td data-label="${t('school.class.classes')}">${classLinks(t, classes[p.id], student)}</td>
    <td class="tacts"><div class="acts">
      ${p.managed_school === s.id && !mine ? html`<form data-api="/api/schools/${s.id}/members/${p.id}/password" data-confirm="${t('school.people.resetConfirm', { name: nameOf(p) })}"><button class="btn btn-sm" type="submit">🔑 ${t('school.people.reset')}</button></form>` : ''}
      ${mine ? '' : html`<details class="inline-menu"><summary class="btn btn-sm" aria-label="${t('school.moreFor', { name: nameOf(p) })}">⋯</summary><div class="menu">
        ${googleRowMenu(req, ginfo, p, { s, connectApi: `/api/schools/${s.id}/members/${p.id}/google`, removeApi: `/api/schools/${s.id}/members/${p.id}/google/remove` })}
        ${student && live.length ? html`<form class="inline menu-form" data-api="/api/schools/${s.id}/members/${p.id}/class" data-reload><label class="small" for="ac-${p.id}">${t('school.people.addToClassFor', { name: nameOf(p) })}</label>
          <select class="input input-sm" id="ac-${p.id}" name="classId">${live.filter(c => !(classes[p.id] || []).some(x => x.id === c.id)).map(c => html`<option value="${c.id}">${c.name}</option>`)}</select><button class="btn btn-sm" type="submit">➕ ${t('school.class.addToClass')}</button></form>` : ''}
        <form class="inline menu-form" data-api="/api/schools/${s.id}/members/${p.id}" data-reload data-toast="${t('school.settings.saved')}"><label class="small" for="rn-${p.id}">${t('school.people.changeName')}</label>
          <input class="input input-sm" id="rn-${p.id}" name="rosterName" value="${p.roster_name || ''}" maxlength="60" required><button class="btn btn-sm" type="submit">${t('school.save')}</button></form>
        ${!student && !p.managed_school ? html`<form data-api="/api/schools/${s.id}/members/${p.id}/not-staff" data-reload data-confirm="${t('school.people.notStaffConfirm', { name: nameOf(p) })}"><button class="btn btn-sm" type="submit">↩️ ${t('school.people.notStaff')}</button></form>` : ''}
        <form data-api="/api/schools/${s.id}/members/${p.id}/remove" data-reload data-confirm="${t('school.people.removeConfirm', { name: nameOf(p) })}"><button class="btn btn-sm btn-danger" type="submit">${t('school.people.remove')}</button></form></div></details>`}
    </div></td></tr>`;
}
/** People removed from the staff list still have a staff account (no friends, no chat). Listed so that one who was
 *  added by mistake (a student who accepted a staff invite) can be put right after the event. */
function formerStaffPanel(req, s) {
  const t = req.t, list = S.formerStaff(s.id);
  return list.length ? html`<details class="libdrop" id="former-staff"><summary class="btn btn-sm">${t('school.people.formerStaff')} <span class="count">${list.length}</span></summary><div>
    <p class="small muted">${t('school.people.formerStaffText')}</p>
    <ul class="plain">${list.map(p => html`<li class="row inv-row"><span><b>${p.roster_name || p.username}</b> <span class="small muted"><bdi>@${p.username}</bdi> · ${t(`school.roles.${p.role}`)}</span></span>
      <form data-api="/api/schools/${s.id}/members/${p.id}/not-staff" data-reload data-confirm="${t('school.people.notStaffConfirm', { name: p.roster_name || p.username })}"><button class="btn btn-sm" type="submit">↩️ ${t('school.people.notStaff')}</button></form></li>`)}</ul></div></details>` : '';
}
function schoolPeople(req, s) {
  const t = req.t; const staff = S.members(s.id, 'staff'), classes = S.memberClasses(s.id), invites = S.invitesOf(s.id);
  // Made from a "Set up my school" request: the sender's name goes in the first staff form (the platform admin only).
  const fromReq = req.query.from && S.isPlatformAdmin(req.user) && !staff.length ? SR.getRequest(String(req.query.from)) : null;
  const preName = fromReq && fromReq.school_id === s.id ? fromReq.contact_name || '' : '';
  // Students who aren't in a class yet come first: they are the ones who still need placing.
  const students = S.members(s.id, 'student').map((p, i) => ({ p, i, placed: classes[p.id] ? 1 : 0 })).sort((a, z) => a.placed - z.placed || a.i - z.i).map(x => x.p);
  const unplaced = students.filter(p => !classes[p.id]).length;
  const live = S.classesOfSchool(s.id);
  const ginfo = googleRosterInfo([...staff, ...students].map(p => p.id));
  const table = (rows, second, empty, id) => rows.length ? html`<div class="panel tblwrap"><table class="tbl rtable people" id="${id}"><thead><tr><th>${t('school.people.name')}</th><th>${second}</th><th>${t('school.class.classes')}</th><th><span class="sr-only">${t('school.actions')}</span></th></tr></thead><tbody>${rows.map(p => personRow(req, s, p, req.user, classes, ginfo, live))}</tbody></table></div>` : html`<p class="muted">${empty}</p>`;
  return html`
  ${req.query.new && !staff.some(p => p.role === 'admin') ? html`<p class="notice good">👋 ${t('school.people.newSchool')}</p>` : ''}
  ${S.isPlatformAdmin(req.user) && req.query.welcome === 'sent' ? html`<p class="notice good" role="status" id="welcome-sent">✅ Set up. The welcome email went to <span dir="ltr">${String(req.query.to || '')}</span>: how to sign in, the checklist below and how teachers start. Their replies come to you.</p>` : ''}
  ${S.isPlatformAdmin(req.user) && req.query.welcome === 'notsent' ? html`<p class="notice warn" role="status" id="welcome-notsent">⚠️ Set up, but the welcome email was not sent${req.query.why ? html` (<code>${String(req.query.why)}</code>)` : ''}. ${req.query.card ? html`<a class="btn btn-sm" href="/cards/${String(req.query.card)}">🖨️ Their login card</a> to send yourself, or ` : ''}<a class="btn btn-sm" href="/admin/schools/setup?school=${s.id}">✉️ try the email again</a></p>` : ''}
  ${jumpNav(t, [['staff', `🍎 ${t('school.people.staff')}`, staff.length], ['students', `👩‍🎓 ${t('school.people.students')}`, students.length]])}
  <div class="sec-row" id="staff"><h2 class="sec-h">🍎 ${t('school.people.staff')} <span class="count">${staff.length}</span></h2>
    <details class="libdrop adddrop" id="add-staff" ${staff.length ? '' : raw('open')}><summary class="btn btn-sm">➕ ${t('school.people.addStaff')}</summary><div>
    <p class="small muted">${t('school.people.addStaffText')}</p>
    <form class="formgrid staffform" data-api="/api/schools/${s.id}/staff" data-reload novalidate>
      <fieldset class="field wide choice"><legend>${t('school.people.account')}</legend>
        <label><input type="radio" name="account" value="new" checked> ${t('school.people.accountNew')}</label>
        <label><input type="radio" name="account" value="existing"> ${t('school.people.accountExisting')}</label></fieldset>
      <div class="field" data-account="existing"><label for="st-u">${t('school.people.existingShort')}</label><input class="input" id="st-u" name="username" maxlength="16" dir="ltr" autocomplete="off" placeholder="${t('school.people.existingPlaceholder')}"><span class="err" id="st-u-err"></span></div>
      <div class="field"><label for="st-n">${t('school.people.realName')}</label><input class="input" id="st-n" name="rosterName" maxlength="60" required value="${preName}"><span class="err" id="st-n-err"></span></div>
      <div class="field"><label for="st-r">${t('school.people.role')}</label><select class="input" id="st-r" name="role"><option value="teacher" ${selected(staff.length)}>${t('school.roles.teacher')}</option><option value="admin" ${selected(!staff.length)}>${t('school.roles.admin')}</option></select></div>
      ${S.isPlatformAdmin(req.user) ? '' : html`<p class="small muted wide" data-account="existing">${t('school.people.inviteNote')}</p>`}
      <div class="formacts"><button class="btn btn-primary" type="submit" data-new="🪪 ${t('school.people.createStaff')}" data-existing="${S.isPlatformAdmin(req.user) ? `➕ ${t('school.people.addToSchool')}` : `✉️ ${t('school.people.sendInvite')}`}">🪪 ${t('school.people.createStaff')}</button></div>
    </form></div></details></div>
  ${table(staff, t('school.people.role'), t('school.people.noStaff'), 'staff-list')}
  ${formerStaffPanel(req, s)}
  ${invites.length ? html`<section class="panel" id="staff-invites" aria-labelledby="si-h"><h3 id="si-h">✉️ ${t('school.people.invitesH')}</h3><p class="small muted">${t('school.people.invitesText')}</p>
    <ul class="plain">${invites.map(i => html`<li class="row inv-row"><span><b>${i.roster_name || i.username}</b> <span class="small muted"><bdi>@${i.username}</bdi> · ${t(`school.roles.${i.role}`)} · ${t('school.people.invitedWaiting')}</span></span>
      <form data-api="/api/schools/${s.id}/invites/${i.user_id}/cancel" data-reload><button class="btn btn-sm" type="submit">${t('school.people.inviteCancel')}</button></form></li>`)}</ul></section>` : ''}
  ${staffGoogleInvites(req, s)}
  <div class="sec-row" id="students"><h2 class="sec-h">👩‍🎓 ${t('school.people.students')} <span class="count">${students.length}</span></h2>
    <details class="libdrop adddrop" id="add-students" ${students.length ? '' : raw('open')}><summary class="btn btn-sm">➕ ${t('school.people.addStudents')}</summary><div>
    <p class="small muted">${t('school.people.addStudentsText')}</p>
    <form class="formgrid" data-api="/api/schools/${s.id}/students" novalidate>
      <div class="field wide"><label for="ss-n">${t('school.people.names')}</label><textarea class="input" id="ss-n" name="names" rows="4" required placeholder="${t('school.people.namesPlaceholder')}"></textarea><span class="err" id="ss-n-err"></span></div>
      <div class="field"><label for="ss-g">${optional(t, t('school.people.grade'))}</label><input class="input" id="ss-g" name="grade" maxlength="12"></div>
      ${live.length ? html`<div class="field"><label for="ss-c">${optional(t, t('school.people.putInClass'))}</label><select class="input" id="ss-c" name="classId"><option value="">–</option>${live.map(c => html`<option value="${c.id}">${c.name}</option>`)}</select></div>` : ''}
      <div class="formacts"><button class="btn btn-primary" type="submit">🪪 ${t('school.people.createAccounts')}</button></div>
    </form></div></details></div>
  ${students.length > 8 ? nameFilter(t, 'student-list', { toggle: unplaced ? [`${t('school.people.noClass')} (${unplaced})`, 'noclass'] : null }) : ''}
  ${table(students, t('school.people.grade'), t('school.people.noStudents'), 'student-list')}`;
}
function schoolSettings(req, s) {
  const t = req.t; const st = S.settingsOf(s); const tz = S.zoneOf(s);
  const yn = (name, val) => html`<select class="input" id="set-${name}" name="${name}"><option value="1" ${selected(val)}>${t('school.settings.yes')}</option><option value="0" ${selected(!val)}>${t('school.settings.no')}</option></select>`;
  // One form (one Save) in three groups: the school itself, classes and joining, and the game-site rules.
  return html`<section class="panel"><form class="stack settingsform" id="school-settings" data-unsaved="${t('school.settings.unsavedLeave')}" data-api="/api/schools/${s.id}/settings" data-reload data-toast="${t('school.settings.saved')}" novalidate>
    <h3 class="setgroup-h">🏫 ${t('school.settings.groupSchool')}</h3>
    <div class="field"><label for="set-name">${t('school.settings.name')}</label><input class="input" id="set-name" name="name" value="${s.name}" maxlength="80"></div>
    <div class="field" id="tz"><label for="set-timeZone">${t('school.settings.timeZone')}</label>
      <select class="input" id="set-timeZone" name="timeZone"><option value="" ${selected(!tz)}>${t('school.settings.timeZoneNone')}</option>
        ${zoneGroups().map(([region, zs]) => html`<optgroup label="${region}">${zs.map(z => html`<option value="${z.tz}" ${selected(z.tz === tz)}>${z.label}</option>`)}</optgroup>`)}</select>
      <span class="hint">${tz ? t('school.settings.timeZoneHint', { time: timeThere(tz, req.fmt.intl) }) : t('school.settings.timeZoneUnset')}</span>
      ${tz ? '' : html`<button class="btn btn-sm" type="button" id="tz-suggest" hidden data-tpl="${t('school.settings.timeZoneUse', { zone: '{zone}' })}"></button>`}</div>
    <h3>🍎 ${t('school.settings.groupClasses')}</h3>
    <div class="field"><label for="set-teachersCreateClasses">${t('school.settings.teachersCreate')}</label>${yn('teachersCreateClasses', st.teachersCreateClasses)}</div>
    <div class="field"><label for="set-allowOwnAccounts">${t('school.settings.ownAccounts')}</label>${yn('allowOwnAccounts', st.allowOwnAccounts)}<span class="hint">${t('school.settings.ownAccountsHint')}</span></div>
    <h3>🎮 ${t('school.settings.gameSite')}</h3><p class="small muted">${t('school.settings.gameSiteText')}</p>
    ${st.chatNotice && st.chat === 'off' ? html`<p class="notice warn" id="chat-notice" role="status"><span aria-hidden="true">🛡️</span> ${t('school.settings.chatNotice')}
      <button class="btn btn-sm" type="submit" form="chat-notice-seen">${t('school.settings.chatNoticeKeep')}</button></p>` : ''}
    <div class="field"><label for="set-chat">${t('school.settings.chat')}</label><select class="input" id="set-chat" name="chat" data-hint-classmates="${t('school.settings.chatHint')}" data-hint-off="${t('school.settings.chatHintOff')}"><option value="off" ${selected(st.chat === 'off')}>${t('school.settings.chatOff')}</option><option value="classmates" ${selected(st.chat === 'classmates')}>${t('school.settings.chatClassmates')}</option></select><span class="hint" id="set-chat-hint">${t(st.chat === 'off' ? 'school.settings.chatHintOff' : 'school.settings.chatHint')}</span></div>
    <div class="field"><label for="set-publishing">${t('school.settings.publishing')}</label><select class="input" id="set-publishing" name="publishing" aria-describedby="set-publishing-hint"><option value="school" ${selected(st.publishing === 'school')}>${t('school.settings.publishSchool')}</option><option value="public" ${selected(st.publishing === 'public')}>${t('school.settings.publishPublic')}</option></select><span class="hint" id="set-publishing-hint">${t('school.settings.publishingHint')}</span></div>
    <p class="small muted">${t('school.settings.photos')}</p>
    <div class="savebar"><span class="small unsaved-note" id="set-unsaved" hidden>⚠️ ${t('school.settings.unsaved')}</span><button class="btn btn-primary" type="submit">${t('school.save')}</button></div>
  </form>
  ${st.chatNotice && st.chat === 'off' ? html`<form id="chat-notice-seen" data-api="/api/schools/${s.id}/settings" data-reload hidden><input type="hidden" name="chatNotice" value="seen"></form>` : ''}</section>
  ${schoolGoogleSettings(req, s)}`;
}

// ---- school page APIs
const schoolApi = (req, res) => { const s = S.getSchool(req.params.id); if (!s || !S.canManageSchool(req.user, s.id)) { no(req, res); return null; } return s; };
router.post('/api/schools/:id/settings', requireUser, (req, res) => {
  const s = schoolApi(req, res); if (!s) return;
  const x = b(req); const bool = v => v === true || v === '1' || v === 'true';
  // The daily Builder cap (school plans) is set on the Billing tab, so only where that tab is.
  if (x.builderDailyCap !== undefined && !billingTabOn(req, s)) return no(req, res);
  const r = S.updateSchool(req.user, s.id, { name: x.name, settings: { teachersCreateClasses: x.teachersCreateClasses !== undefined ? bool(x.teachersCreateClasses) : undefined, allowOwnAccounts: x.allowOwnAccounts !== undefined ? bool(x.allowOwnAccounts) : undefined, chat: x.chat, chatNotice: x.chatNotice === 'seen' ? false : undefined, publishing: x.publishing, timeZone: typeof x.timeZone === 'string' ? x.timeZone : undefined, builderDailyCap: x.builderDailyCap } });
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
    if (u.managed_school && u.managed_school !== s.id) return fieldErr(res, 'username', t('school.errors.otherSchoolNext'));
    // The platform admin appoints at once (a new school's first admin). A school admin sends an invite: the person is
    // asked on their My classes page and becomes staff only when they accept (a mistyped name never pulls in a stranger).
    if (S.isPlatformAdmin(req.user)) {
      const r = S.addMember(req.user, s.id, u.id, role, { rosterName });
      if (!r.ok) return err(req, res, r.code);
      return res.json({ ok: true, toast: t('school.people.added', { name: String(rosterName).trim(), role: t(`school.roles.${role}`) }) });
    }
    const r = S.inviteStaff(req.user, s.id, u.id, role, { rosterName });
    if (!r.ok) return r.code === 'otherSchoolAccount' ? fieldErr(res, 'username', t('school.errors.otherSchoolNext')) : err(req, res, r.code);
    return res.json({ ok: true, toast: t('school.people.invited', { name: u.username, role: t(`school.roles.${role}`) }) });
  }
  const r = S.createSchoolAccount(req.user, s.id, { rosterName, role });
  if (!r.ok) return err(req, res, r.code);
  res.json({ ok: true, redirect: `/cards/${keepCards(req.user, [card(r, role)], { schoolId: s.id })}` });
});
router.post('/api/schools/:id/invites/:uid/cancel', requireUser, (req, res) => {
  const s = schoolApi(req, res); if (!s) return;
  const r = S.cancelInvite(req.user, s.id, String(req.params.uid));
  if (!r.ok) return err(req, res, r.code, 404);
  res.json({ ok: true, toast: req.t('school.people.inviteCancelled') });
});
// The invited person answers (My classes / Teach): Accept makes them staff; Decline drops the invite.
router.post('/api/staff-invites/:sid/:answer', requireUser, (req, res) => {
  const accept = req.params.answer === 'accept';
  if (!accept && req.params.answer !== 'decline') return no(req, res);
  const r = S.answerInvite(req.user, String(req.params.sid), accept);
  if (!r.ok) return err(req, res, r.code, r.code === 'notFound' ? 404 : 400);
  res.json(accept ? { ok: true, toast: req.t('school.invite.accepted', { school: r.school.name }), redirect: '/teach' } : { ok: true, toast: req.t('school.invite.declined'), reload: true });
});
/** "Riverside Primary wants to add you as a Teacher: Accept / Decline" (My classes and Teach). */
export function staffInvitesPanel(req) {
  const t = req.t, list = S.invitesFor(req.user && req.user.id);
  return list.length ? html`<section class="panel notice" id="my-invites" aria-labelledby="mi-h"><h2 id="mi-h">✉️ ${t('school.invite.h')}</h2>
    <ul class="plain">${list.map(i => html`<li class="row inv-row"><span>${t('school.invite.text', { school: i.school_name, role: t(`school.roles.${i.role}`) })}<br><span class="small inv-warn">⚠️ ${t('school.invite.warn')}</span></span>
      <span class="row"><form data-api="/api/staff-invites/${i.school_id}/accept" data-confirm="${t('school.invite.warn')}"><button class="btn btn-primary btn-sm" type="submit">✅ ${t('school.invite.accept')}</button></form>
      <form data-api="/api/staff-invites/${i.school_id}/decline" data-reload><button class="btn btn-sm" type="submit">${t('school.invite.decline')}</button></form></span></li>`)}</ul></section>` : '';
}
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
// People › Students: put a student who is in no class (or another one) in a class of this school.
router.post('/api/schools/:id/members/:uid/class', requireUser, (req, res) => {
  const s = schoolApi(req, res); if (!s) return;
  const m = S.membership(s.id, String(req.params.uid)), c = S.getClass(String(b(req).classId || ''));
  if (!m || m.role !== 'student' || !c || c.school_id !== s.id || c.archived_at) return no(req, res);
  const r = S.addToClass(req.user, c.id, m.user_id, 'student');
  if (r && r.ok === false) return err(req, res, r.code);
  res.json({ ok: true, toast: req.t('school.class.addedN', { count: 1 }) });
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
// "Added by mistake": a person's own account that should never have been staff here (a child who accepted a staff invite).
// Works for someone still on the staff list and for someone already removed (services/schools.js notStaff).
router.post('/api/schools/:id/members/:uid/not-staff', requireUser, (req, res) => {
  const s = schoolApi(req, res); if (!s) return;
  if (req.params.uid === req.user.id) return err(req, res, 'ownRole');
  const r = S.notStaff(req.user, s.id, String(req.params.uid));
  if (!r.ok) return err(req, res, r.code, r.code === 'notFound' ? 404 : 400);
  res.json({ ok: true, toast: req.t('school.people.notStaffDone', { name: r.user.username }) });
});
/** One name per line (or separated by commas/semicolons), at most 60 at a time. */
export const parseNames = text => String(text || '').split(/[\n;,]+/).map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 60);

// ================================================================ teachers: the Classroom tab (/teach)
// docs/decisions.md "Play and Learn" and "My classes, simpler": a teacher's (and a school admin's) first tab. Hello and
// what needs doing, the tools row, the teaching loop's card while it shows, then each class as a card with what needs
// attention (requests, answers to read, the next lesson due, a live room that is open) and its buttons, New class as a
// tile beside them, and the archived list. Nothing else: the school (My school) and the Teacher plan are on the Me page;
// courses, live games and brain breaks are on the Learn tab. A teacher with exactly one class goes straight to it.
const DAY_MS = 864e5;
/** The soonest open lesson due in the next 7 days (not late yet), or null. */
function nextDue(classId, t = Date.now()) {
  return L.classLessons(classId).filter(cl => cl.due_at && L.isOpen(cl, t) && ['today', 'upcoming'].includes(L.dueState(cl, t)) && cl.due_at - t < 7 * DAY_MS)
    .sort((a, z) => a.due_at - z.due_at)[0] || null;
}
function classroomHome(req) {
  const t = req.t, u = req.user;
  const schools = S.schoolsOf(u.id).filter(x => x.role !== 'student');
  const mine = S.classesOf(u.id, 'teacher'), old = S.classesOf(u.id, 'teacher', { archived: true });
  const toRead = P.toReadByClass(mine.map(c => c.id));
  const answers = Object.values(toRead).reduce((n, x) => n + x, 0);
  const canCreate = schools.filter(x => S.canCreateClass(u, x.id));
  const admins = schools.filter(x => S.canManageSchool(u, x.id));   // for the empty state
  const hostLive = liveOn() && liveCanHost(u);
  const wantNew = req.query.new === 'class';   // from "Make your first class": the New class form open and focused
  // Their own name (staff see real names; this is their own page).
  const name = S.staffName(u) || u.display_name || u.username;
  // The room this teacher has open now, if any (a host has one room at a time): while it is open, no card offers a
  // second one. The cards of other classes lead back to it and say which game it is.
  const own = hostLive ? hostSession(u.id) : null, ownRoom = own && own.phase !== 'ended' ? own : null;
  const card = c => {
    const due = nextDue(c.id), room = liveOn() ? openForClass(c.id) : null;
    const mineRoom = room && room.phase !== 'ended' && room.host && (room.host.userId === u.id || (room.cohosts && room.cohosts.has(u.id)));
    const chips = [
      c.requests ? html`<a class="chip-s warn" href="/class/${c.id}?tab=students#requests">✋ ${t('school.class.requestsN', { count: c.requests })}</a>` : '',
      toRead[c.id] ? html`<a class="chip-s warn" href="/class/${c.id}/progress#to-review">✍️ ${t('progress.teach.toRead', { count: toRead[c.id] })}</a>` : '',
      room && room.phase !== 'ended' ? (mineRoom ? html`<a class="chip-s good" href="/live/host/${room.id}">📡 ${t('classes.live.chip')}</a>` : html`<span class="chip-s good">📡 ${t('classes.live.chip')}</span>`) : '',
      // The next lesson due: its title cut short on one line, the date on a line of its own.
      due ? html`<a class="chip-s th-due" href="/class/${c.id}"><span class="th-due-t">📚 <bdi>${due.title}</bdi></span><span class="th-due-d">📅 ${L.dueState(due) === 'today' ? t('lessons.class.dueToday') : t('lessons.class.dueOn', { date: req.fmt.day(due.due_at) })}</span></a>` : '',
    ].filter(Boolean);
    // While a room is open for the class: its host gets back to it (never a second room); a co-teacher's room has the chip only.
    const open = room && room.phase !== 'ended';
    const liveBtn = !hostLive ? '' : mineRoom ? html`<a class="btn btn-sm btn-hot cc-live" href="/live/host/${room.id}">📡 ${t('teach.home.openLive')}</a>`
      : open ? '' : ownRoom ? html`<a class="btn btn-sm cc-live cc-live-other" href="/live/host/${ownRoom.id}">📡 ${t('teach.home.openLive')}</a>`
        : html`<a class="btn btn-sm cc-live" href="/live?class=${c.id}">📡 ${t('school.teach.hostLive')}</a>`;
    const elsewhere = hostLive && !open && ownRoom ? html`<p class="small muted cc-quick cc-elsewhere" data-room="${ownRoom.id}">${t('quickLive.quick.hasOpen', { title: ownRoom.title })}</p>` : '';
    return html`<div class="panel classcard th-class">
      <span class="cc-school small muted">${c.school_name}</span><a class="cc-name cc-link" href="/class/${c.id}"><b>${c.name}</b></a>
      <span class="small">${[c.subject, gradeLabel(t, c.grade), t('school.class.studentsN', { count: c.students })].filter(Boolean).join(' · ')}</span>
      <span class="cc-meta th-chips">${chips.length ? chips : html`<span class="chip-s ok">✅ ${t('teach.home.caughtUp')}</span>`}</span>
      <span class="cc-acts"><a class="btn btn-sm" href="/class/${c.id}">${t('teach.home.openClass')}</a><a class="btn btn-sm btn-primary" href="/teach/lessons?school=${c.school_id}&amp;class=${c.id}">📚 ${t('lessons.class.assign')}</a>${liveBtn}</span>${elsewhere}</div>`;
  };
  // The teaching loop (docs/decisions.md "The teaching loop"): the card until each step is done once (or it is hidden),
  // then a small "How Oomba fits your week" link under the tools row.
  const loop = TL.loopState(u), showLoop = TL.showCard(loop);
  const summary = [t('teach.home.classesN', { count: mine.length }), answers ? t('teach.home.waitingN', { count: answers }) : ''].filter(Boolean).join(' · ');
  return html`
  <div class="pagehead th-head"><div><h1>👋 ${t('teach.home.hello', { name })}</h1><p class="muted th-sum">${summary}</p></div>
    ${mine.length ? html`<a class="btn" href="/teach/summary" id="teach-summary">📬 ${t('digest.page.link')}</a>` : ''}${hostLive ? html`<a class="btn btn-hot" href="/live" id="teach-host">📡 ${t('school.teach.hostLive')}</a>` : ''}</div>
  <nav class="row teachtools" aria-label="${t('school.teach.tools')}"><a class="btn btn-primary" href="/teach/lessons">📚 ${t('lessons.library.title')}</a>${hostLive ? html`<a class="btn" href="/teach/make" id="teach-make">✨ ${t('teach.home.make')}</a>` : ''}${makeGameBtn(t)}</nav>
  ${showLoop ? teacherLoop(t, { variant: 'compact', links: TL.loopLinks(u), state: loop, live: hostLive }) : html`<p class="tl-week"><a href="/teach/loop" id="teach-loop-link">🗓️ ${t('teach.loop.page.link')}</a></p>`}
  ${req.query.welcome === 'school' && admins[0] ? html`<p class="notice good" role="status" id="school-ready">🏫 ${t('teach.home.schoolReady', { school: admins[0].name })}</p>` : ''}
  ${staffInvitesPanel(req)}
  <section class="th-sec" id="my-classes" aria-labelledby="my-classes-h"><h2 id="my-classes-h">🍎 ${t('school.teach.title')}</h2>
  ${mine.length ? html`<div class="classgrid th-classes">${mine.map(card)}${canCreate.length ? html`<div class="th-newclass">${newClassForm(t, { schools: canCreate, me: u, focus: wantNew })}</div>` : ''}</div>`
    : emptyState({ emoji: '🍎', title: admins.length ? t('school.teach.noneAdmin') : t('school.teach.none'), text: admins.length ? t('school.teach.noneAdminText', { school: admins[0].name }) : canCreate.length ? t('school.teach.noneText') : t('school.teach.noneAsk'),
      ...(admins.length ? { action: { href: `/school/${admins[0].slug}`, label: `🏫 ${t('me.tiles.school')}` } } : {}) })}
  ${canCreate.length && !mine.length ? newClassForm(t, { schools: canCreate, me: u, open: !admins.length, focus: wantNew }) : ''}
  ${old.length ? html`<details class="panel archived"><summary>🗄️ ${t('school.class.archived', { count: old.length })}</summary>
    <ul class="plain archlist">${old.map(c => html`<li><a href="/class/${c.id}"><b>${c.name}</b></a> <span class="small muted">${c.school_name}</span>
      <form data-api="/api/classes/${c.id}/restore" data-reload data-toast="${t('school.class.restored', { name: c.name })}"><button class="btn btn-sm" type="submit">${t('school.class.restore')}</button></form></li>`)}</ul></details>` : ''}
  </section>
`;
}
router.get('/teach', requireUser, (req, res) => {
  const t = req.t; const u = req.user;
  // The platform admin who isn't staff of a school works from Schools, not from an empty teacher page.
  if (!S.isSchoolStaff(u)) return S.isPlatformAdmin(u) ? res.redirect('/admin/schools') : notFound(req, res, t('school.errors.notTeacher'));
  // The Teacher plan card moved to the Me page: old links (?plan=welcome after Checkout, ?plan=on from /trial) follow it.
  if (['welcome', 'on'].includes(req.query.plan)) return res.redirect(302, `/me?plan=${req.query.plan}#teacher-plan`);
  // One class: My classes is that class. Not when the list is asked for (All classes, New class), with a welcome notice,
  // or with a staff invite to answer (those are said on the list).
  const one = onlyClass(u);
  if (one && req.query.all === undefined && req.query.new === undefined && req.query.welcome === undefined && !S.invitesFor(u.id).length) {
    res.set('Cache-Control', 'private, no-store');
    return res.redirect(302, `/class/${one.id}`);
  }
  page(req, res, { title: t('nav.classroom'), active: 'classes', body: classroomHome(req), head: html`${CSS}${LOOP_CSS}` });
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

// "Make a class to keep scores" (after a live game played by guests: routes/quick-live.js, the results page): one page
// that makes a class and its students' accounts from a pasted list of names, then shows the login cards to print.
// Staff who may make a class only; everyone else gets a 404.
const keepSchools = u => S.schoolsOf(u.id).filter(x => x.role !== 'student' && S.canCreateClass(u, x.id));
/** The school the class goes into: the one asked for (it must be one of theirs), else their first. */
const keepSchool = (u, id = '') => { const all = keepSchools(u); return (id ? all.find(x => x.id === String(id)) : all[0]) || null; };
router.get('/teach/keep-scores', requireUser, (req, res) => {
  const t = req.t, all = keepSchools(req.user), s = all[0];
  if (!s) return no(req, res);
  // Staff of one school see its name; staff of more than one choose.
  const where = all.length > 1
    ? html`<div class="field"><label for="ks-school">${t('school.class.school')}</label><select class="input" id="ks-school" name="schoolId">${all.map(x => html`<option value="${x.id}">${x.name}</option>`)}</select></div>`
    : html`<p class="small muted" id="ks-school">🏫 <bdi>${s.name}</bdi></p>`;
  res.set('Cache-Control', 'no-store');
  page(req, res, { title: t('quickLive.keep.title'), active: 'classes', head: html`${CSS}<link rel="stylesheet" href="/css/quick-live.css">`, back: '/teach', backLabel: t('nav.classroom'),
    body: html`<div class="ql"><h1>🪪 ${t('quickLive.keep.h')}</h1><p class="lead">${t('quickLive.keep.lead')}</p>
    <form class="panel ql-form" data-api="/api/teach/keep-scores" id="ql-keep" novalidate>
      ${where}
      <div class="field"><label for="ks-name">${t('school.class.name')}</label><input class="input" id="ks-name" name="name" maxlength="60" required placeholder="${t('school.class.namePlaceholder')}"><span class="err" id="ks-name-err" aria-live="polite"></span></div>
      <div class="field"><label for="ks-grade">${optional(t, t('school.class.grade'))}</label><input class="input" id="ks-grade" name="grade" maxlength="12"></div>
      <div class="field"><label for="ks-names">${t('quickLive.keep.names')}</label><textarea class="input" id="ks-names" name="names" rows="8" required aria-describedby="ks-names-hint"></textarea>
        <span class="hint" id="ks-names-hint">${t('quickLive.keep.namesHint')}</span><span class="err" id="ks-names-err" aria-live="polite"></span></div>
      <p class="err form-err" aria-live="polite"></p>
      <button class="btn btn-primary btn-big" type="submit">🪪 ${t('quickLive.keep.go')}</button>
      <p class="small muted ql-last">${t('quickLive.keep.note')}</p>
    </form></div>` });
});
router.post('/api/teach/keep-scores', requireUser, rateLimit('class-new', 60, 3600e3), (req, res) => {
  const t = req.t, u = req.user, s = keepSchool(u, b(req).schoolId);
  if (!s) return no(req, res);
  const name = String(b(req).name || '').trim();
  if (!name) return fieldErr(res, 'name', t('school.errors.className'));
  const names = parseNames(b(req).names);
  if (!names.length) return fieldErr(res, 'names', t('school.errors.names'));
  const same = sameNames(s.id, names);
  if (same.length) return fieldErr(res, 'names', sameNamesError(req, s, same));
  const grade = String(b(req).grade || '').trim().slice(0, 12);
  const r = S.createClass(u, s.id, { name, grade });
  if (!r.ok) return err(req, res, r.code);
  const made = [];
  for (const n of names) { const a = S.createSchoolAccount(u, s.id, { rosterName: n, grade }); if (a.ok) { S.addToClass(u, r.class.id, a.user.id, 'student'); made.push(card(a)); } }
  // No account could be made: no empty class is left behind and no empty page of cards is shown.
  if (!made.length) { S.deleteClass(u, r.class.id); return fieldErr(res, 'names', t('school.errors.names')); }
  res.json({ ok: true, redirect: `/cards/${keepCards(u, made, { schoolId: s.id, classId: r.class.id })}` });
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
const CLASS_TABS = ['lessons', 'progress', 'standards', 'games', 'students', 'settings'];
/** The class header and its tabs (Lessons, Progress, Standards, Games, Students, Settings), shared with the progress pages. */
export function classHeader(req, c, active) {
  const t = req.t; const s = S.getSchool(c.school_id);
  const students = S.roster(c.id).filter(p => p.role === 'student').length;
  const requests = S.pendingRequests(c.id).length;
  const toRead = P.toReadByClass([c.id])[c.id] || 0;
  const href = { lessons: `/class/${c.id}`, progress: `/class/${c.id}/progress`, standards: `/class/${c.id}/standards`, games: `/class/${c.id}?tab=games`, students: `/class/${c.id}?tab=students`, settings: `/class/${c.id}?tab=settings` };
  const icon = { lessons: '📚', progress: '📊', standards: '🧭', games: '🎮', students: '👩‍🎓', settings: '⚙️' };
  const badge = { progress: toRead ? html` <span class="tabbadge" title="${t('progress.gradebook.toRead', { count: toRead })}">${toRead}</span>` : '', students: requests ? html` <span class="tabbadge" title="${t('school.requests.title', { count: requests })}">${requests}</span>` : '' };
  return html`
  <div class="pagehead"><div><span class="small muted">${s.name}</span><h1>${c.name}</h1>
    <p class="muted">${[c.subject, gradeLabel(t, c.grade), t('school.class.studentsN', { count: students })].filter(Boolean).join(' · ')}</p></div>
    ${!c.archived_at && liveOn() && liveCanHost(req.user) ? html`<div class="row"><a class="btn btn-primary" href="/live?class=${c.id}">📡 ${t('live.entry.host')}</a></div>` : ''}</div>
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
    </li>`)}</ul>` : html`<div class="empty"><div class="emo" aria-hidden="true">🎮</div><p>${t('school.classGames.empty')}</p><div class="row emptyacts">${makeGameBtn(t)}</div></div>`}
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

  // Jump chips: requests, the roster, adding students and the class code (what a teacher needs while projecting) up top.
  const nReq = S.pendingRequests(c.id).length;
  // Students already at the school: ticked into this class. With an empty class and students at the school who are in
  // no class yet, this list comes first and open (making new accounts for them would mean two login cards per child).
  const pickFirst = !students.length && schoolStudents.some(p => !classes[p.id]);
  const pickPanel = schoolStudents.length ? html`<details class="panel" id="pick-existing"${pickFirst ? raw(' open') : ''}><summary>➕ ${t('school.class.alreadyAt', { school: s.name, count: schoolStudents.length })}</summary>
    <form class="stack" data-api="/api/classes/${c.id}/students" data-reload novalidate><input type="hidden" name="mode" value="existing">
      ${schoolStudents.length > 8 ? nameFilter(t, 'pick-list', { toggle: schoolStudents.some(p => !classes[p.id]) ? [t('school.people.noClass'), 'noclass'] : null }) : ''}
      <div class="row"><button class="btn btn-sm" type="button" data-select-all="pick-list">☑️ ${t('school.class.selectShown')}</button></div>
      <fieldset class="picklist" id="pick-list"><legend class="sr-only">${t('school.class.alreadyAt', { school: s.name, count: schoolStudents.length })}</legend>
        ${schoolStudents.map(p => html`<label${classes[p.id] ? '' : raw(' data-noclass')}><input type="checkbox" name="existing" value="${p.id}"><span><b>${nameOf(p)}</b> <span class="small muted"><bdi>@${p.username}</bdi></span><span class="small muted pl-sub">${classes[p.id] ? classes[p.id].map(x => x.name).join(', ') : html`<span class="chip-s">${t('school.people.noClass')}</span>`}</span></span></label>`)}</fieldset>
      <span class="err form-err" role="alert"></span>
      <div><button class="btn btn-primary" type="submit">➕ ${t('school.class.addToClass')}</button></div>
    </form></details>` : '';
  // Login cards this teacher made for this class in the last day, still here to print (only for them).
  const myCards = [...CARDS.entries()].filter(([, v]) => v.by === req.user.id && v.classId === c.id && v.exp > Date.now()).sort((a, z) => z[1].exp - a[1].exp);
  const studentsTab = html`
  ${myCards.length ? html`<p class="notice" id="cards-again">🪪 ${t('school.cards.again', { count: myCards[0][1].cards.length })} <a class="btn btn-sm" href="/cards/${myCards[0][0]}">${t('school.cards.open')}</a></p>` : ''}
  ${jumpNav(t, [nReq ? ['requests', `✋ ${t('school.requests.title', { count: nReq })}`] : null, students.length ? ['roster', `👩‍🎓 ${t('school.class.studentsN', { count: students.length })}`] : null,
    ['add-students', `🪪 ${t('school.class.newAccounts')}`], ['class-code', html`🔑 ${t('school.class.joinCode')} <code dir="ltr">${c.join_code}</code>`]])}
  ${requestsPanel(req, c, s, people)}
  ${students.length ? html`<section class="panel" id="roster" aria-labelledby="stu-h"><div class="panelhead"><h2 id="stu-h">👩‍🎓 ${t('school.class.studentsN', { count: students.length })}</h2>
      ${cardable ? html`<form data-api="/api/classes/${c.id}/cards" data-confirm="${t('school.class.reprintConfirm', { count: cardable })}"><button class="btn btn-sm" type="submit">🪪 ${t('school.class.reprint')}</button></form>` : ''}</div>
    ${students.length > 8 ? nameFilter(t, 'roster-list') : ''}
    <div class="tblwrap"><table class="tbl rtable roster" id="roster-list"><thead><tr><th>${t('school.people.name')}</th><th>${t('school.cards.username')}</th><th>${t('school.people.grade')}</th><th><span class="sr-only">${t('school.actions')}</span></th></tr></thead><tbody>
      ${students.map(p => studentRow(req, c, s, p, others, ginfo))}
    </tbody></table></div></section>`
    : emptyState({ emoji: '👩‍🎓', title: t('school.class.noStudents'), text: `${pickFirst ? t('school.class.noStudentsPick', { school: s.name }) : t('school.class.noStudentsText')}${st.allowOwnAccounts ? ` ${t('school.class.noStudentsCode')}` : ''}` })}
  ${classInvitesPanel(req, c, s)}
  ${gcRosterHint(req, c)}
  ${pickFirst ? pickPanel : ''}
  <section class="panel" id="add-students"><h2>🪪 ${t('school.class.newAccounts')}</h2>
    <form class="formgrid" data-api="/api/classes/${c.id}/students" novalidate>
      <div class="field wide"><label for="as-n">${t('school.people.names')}</label><textarea class="input" id="as-n" name="names" rows="4" required placeholder="${t('school.people.namesPlaceholder')}"></textarea><span class="err" id="as-n-err"></span><span class="hint">${t('school.class.newAccountsHint')}</span></div>
      <div class="field"><label for="as-g">${optional(t, t('school.people.grade'))}</label><input class="input" id="as-g" name="grade" maxlength="12" value="${c.grade}"></div>
      <div class="formacts"><button class="btn btn-primary" type="submit">🪪 ${t('school.class.createCards')}</button></div>
    </form></section>
  ${schoolStudents.length && !pickFirst ? pickPanel : ''}
  <section class="panel joincode" id="class-code"><div><h2>🔑 ${t('school.class.joinCode')}</h2><p class="small muted">${st.allowOwnAccounts ? t('school.class.joinCodeTextOn', { school: s.name }) : t('school.class.joinCodeTextOff', { school: s.name })}</p></div>
    <div class="jc-code" dir="ltr">${c.join_code}</div>
    <form data-api="/api/classes/${c.id}/code" data-reload data-confirm="${t('school.class.newCodeConfirm')}"><button class="btn btn-sm" type="submit">🔄 ${t('school.class.newCode')}</button></form>
    ${classGoogleJoin(req, c, s)}</section>`;

  const admins = S.members(s.id, 'staff').filter(p => p.role === 'admin').map(nameOf).join(', ');
  const iTeach = teachers.some(p => p.id === req.user.id);
  const canDelete = !S.everHadStudents(c.id);
  const settingsTab = html`
  <section class="panel"><h2>✏️ ${t('school.class.details')}</h2>
    <form class="formgrid detailsform" data-api="/api/classes/${c.id}" data-reload data-toast="${t('school.settings.saved')}" novalidate>
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
  ${!c.archived_at || canDelete ? html`<section class="panel ${canDelete ? 'dangerzone' : ''}" aria-labelledby="ad-h"><h2 id="ad-h">🗄️ ${c.archived_at ? t('school.class.deleteTitle') : t('school.class.archiveTitle')}</h2>
    ${c.archived_at ? '' : html`<p class="small muted">${t('school.class.archiveText')}</p>
    <form data-api="/api/classes/${c.id}/archive" data-reload data-confirm="${t('school.class.archiveConfirm', { name: c.name })}"><button class="btn" type="submit">🗄️ ${t('school.class.archive')}</button></form>`}
    ${canDelete ? html`<p class="small muted">${t('school.class.deleteText')}</p>
    <form data-api="/api/classes/${c.id}/delete" data-confirm="${t('school.class.deleteConfirm', { name: c.name })}"><button class="btn btn-danger" type="submit">${t('school.class.delete')}</button></form>` : ''}
  </section>` : ''}`;

  // A teacher of one class lands here from My classes (/teach opens their one class): the teaching loop's card, while it
  // shows, comes with them, on the Lessons tab.
  const loopHere = tab === 'lessons' && (onlyClass(req.user) || {}).id === c.id && TL.showCard(TL.loopState(req.user));
  const loopCard = loopHere ? teacherLoop(t, { variant: 'compact', links: TL.loopLinks(req.user), state: TL.loopState(req.user), live: liveOn() && liveCanHost(req.user) }) : '';
  const body = html`${classHeader(req, c, tab)}${loopCard}
  ${tab === 'students' ? studentsTab : tab === 'settings' ? settingsTab : tab === 'games' ? classGamesTab(req, c, people) : teacherLessonsPanel(req, c)}`;
  page(req, res, { title: c.name, active: 'classes', body, head: loopHere ? html`${CSS}${LOOP_CSS}` : CSS, scripts: ['/js/schools.js'], ...classBack(req, c) });
}
function studentClass(req, res, c) {
  const t = req.t; const s = S.getSchool(c.school_id);
  const people = S.roster(c.id);
  const teachers = people.filter(p => p.role === 'teacher'), classmates = people.filter(p => p.role === 'student' && p.id !== req.user.id);
  const body = html`
  <div class="pagehead"><div><span class="small muted">${s.name}</span><h1>${c.name}</h1>
    <p class="muted">${[c.subject, gradeLabel(t, c.grade)].filter(Boolean).join(' · ')}</p></div>${studentNotYou(req, S.classMember(c.id, req.user.id)?.role === 'student')}</div>
  ${classLiveBanner(req, c)}
  ${studentLessonsPanel(req, c)}
  ${studentGamesPanel(req, c, teachers)}
  <div class="cols2"><section class="panel"><h2>🍎 ${t('school.class.teachers')}</h2><ul class="plain chips-list">${teachers.map(p => html`<li class="pp">${avatar(p, 28)} ${nameOf(p)}</li>`)}</ul></section>
  <section class="panel"><h2>👫 ${t('classes.classmates', { count: classmates.length })}</h2>${classmates.length ? html`<ul class="plain chips-list">${classmates.map(p => html`<li class="pp">${avatar(p, 28)} ${p.display_name}</li>`)}</ul>` : ''}</section></div>`;
  page(req, res, { title: c.name, active: 'classes', body, head: CSS, back: '/classes', backLabel: t('nav.classes'), scripts: liveOn() ? ['/js/class-live.js'] : [] });
}

/** A class's open live room, for its students: "Your teacher started a live game · Join now" (to /join with the code in
 *  the #fragment). The page checks again every few seconds (class-live.js), so a student waiting here sees it appear. */
const liveRoomOf = c => { const s = liveOn() ? openForClass(c.id) : null; return s && s.phase !== 'ended' ? { title: s.title, code: s.code } : null; };
function classLiveBanner(req, c, n = 0) {
  // The first banner on a page has the ids class-live.js and the tests know; more (one per class on the Class tab) get -n.
  const t = req.t, r = liveRoomOf(c), x = n ? `-${n}` : '';
  return html`<div class="notice good class-live" id="class-live${x}" data-class="${c.id}" role="status" aria-live="polite"${r ? '' : raw(' hidden')}>
    <b>📡 ${t('classes.live.title')}</b> <span id="class-live-game${x}" data-live-game>${r ? r.title : ''}</span>
    <a class="btn btn-primary" id="class-live-join${x}" data-live-join href="${r ? `/join#${r.code}` : '/join'}">${t('classes.live.join')}</a></div>`;
}
router.get('/api/classes/:id/live', requireUser, (req, res) => {
  const c = S.getClass(req.params.id);
  if (!c || !S.canViewClass(req.user, c)) return res.status(404).json({ error: req.t('errors.api.notFound') });
  res.set('Cache-Control', 'no-store');
  res.json({ live: liveRoomOf(c) });
});

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
  // 7 numbers is a live game code, typed in the class box: on to the Join a game page with it (the code goes in the
  // #fragment, never in an address the server sees).
  const typed = String(b(req).code || '').replace(/[\s-]/g, '');
  if (/^\d{7}$/.test(typed)) return res.json({ ok: true, toast: req.t('classes.gameCode'), redirect: `/join#${typed}` });
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
  // A class with students and nothing assigned yet: the next thing to do is one tap away (Learn, where every game and
  // course has "Assign").
  const nextGame = !!c && S.canManageClass(req.user, c) && !L.classLessons(c.id).length;
  const body = html`
  <div class="pagehead noprint cardsbar"><div><h1>🪪 ${t('school.cards.title')}</h1><p class="muted">${t('school.cards.count', { count: v.cards.length })}</p></div><div class="row"><button class="btn btn-primary" type="button" data-print>🖨️ ${t('school.cards.print')}</button><a class="btn" href="${back.href}">${back.label}</a></div></div>
  <p class="notice warn noprint">${t('school.cards.once')}</p>
  <p class="notice noprint" id="cards-later">📱 ${t('school.cards.later')}</p>
  ${nextGame ? html`<p class="notice good noprint" id="cards-next"><a href="/learn"><b>${t('school.cards.next')}</b> <span class="flip" aria-hidden="true">→</span></a></p>` : ''}
  ${v.skipped.length ? html`<p class="notice noprint">${t('school.cards.skipped', { count: v.skipped.length, names: v.skipped.join(', ') })}</p>` : ''}
  <div class="cards">${v.cards.map(x => html`<div class="logincard">
    <div class="lc-top">${appMark('lc-mark appmark')}<span>${[s && s.name.includes(BRAND) ? null : BRAND, s && s.name, c && c.name, x.role && t(`school.roles.${x.role}`)].filter(Boolean).join(' · ')}</span></div>
    <div class="lc-name">${x.name}</div>
    <dl><dt>${t('school.cards.site')}</dt><dd dir="ltr">${site}</dd><dt>${t('school.cards.username')}</dt><dd dir="ltr"><b>${x.username}</b></dd><dt>${t('school.cards.password')}</dt><dd dir="ltr"><b>${x.password}</b></dd></dl>
  </div>`)}</div>`;
  page(req, res, { title: t('school.cards.title'), active: 'classes', body, head: CSS, scripts: ['/js/schools.js'] });
});

// ================================================================ students: the Class tab (/classes)
// docs/decisions.md "Play and Learn": a school student's first tab. For each class: the live-game banner while the
// teacher has a room open, the class (its card opens the class page), To do (open lessons not finished, soonest due
// first, with progress, the next step and Continue), and games shared with the class. Several classes: a picker on top.
// Joining a class, the waiting list and "Not you?" stay. Only the teachers' names are shown (as on the class page),
// never classmates.
/** A student's next step in a class lesson (the first not done), for "Next: …". */
function nextStep(cl, userId) {
  const done = P.forStudent(cl.id, userId);
  const s = L.steps(cl.lesson_id).find(x => !done[x.id] || done[x.id].status !== 'done');
  return s ? (s.title || s.game_title || '') : '';
}
function classSection(req, c, i, many) {
  const t = req.t, u = req.user;
  const todo = P.toDoFor(c.id, u.id), live = liveRoomOf(c);
  const list = games.classGames(c.id, { limit: 9 });
  const row = x => {
    const total = x.cl.steps, doneN = total - x.left, step = nextStep(x.cl, u.id);
    const pct = Math.round(doneN / Math.max(1, total) * 100);
    return html`<li class="ct-todo"><div class="ct-todo-t"><b dir="auto">${x.title}</b>${dueChip(t, req.fmt, x.cl)}</div>
      <div class="cprog" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${doneN}" aria-label="${t('progress.student.doneOf', { done: doneN, total })}"><span style="width:${pct}%"></span></div>
      <p class="small muted">${t('progress.student.doneOf', { done: doneN, total })}${step ? html` · <bdi>${t('classes.tab.next', { step })}</bdi>` : ''}</p>
      <a class="btn btn-primary btn-sm" href="/class/${c.id}/lessons/${x.id}">▶ ${doneN ? t('classes.tab.continue') : t('classes.tab.start')}</a></li>`;
  };
  return html`<section class="ct-class" id="class-${c.id}" aria-labelledby="ct-${c.id}-h">
    ${classLiveBanner(req, c, i)}
    <a class="panel classcard ct-head" href="/class/${c.id}"><span class="cc-school small muted">${c.school_name}</span>
      <${raw(many ? 'h2' : 'h1')} class="cc-name" id="ct-${c.id}-h">${c.name}</${raw(many ? 'h2' : 'h1')}>${c.teachers ? html`<span class="cc-meta">🍎 ${c.teachers}</span>` : ''}
      ${live || todo.length ? html`<span class="cc-meta">${live ? html`<span class="chip-s warn">📡 ${t('classes.live.chip')}</span> ` : ''}${todo.length ? html`<span class="chip-s">📚 ${t('home.class.todo', { count: todo.length })}</span>` : ''}</span>` : ''}</a>
    <section class="panel ct-todos" aria-labelledby="ct-${c.id}-todo"><h3 id="ct-${c.id}-todo">✅ ${t('classes.tab.todo')}</h3>
      ${todo.length ? html`<ol class="plain ct-list">${todo.map(row)}</ol>` : html`<p class="ct-done">🎉 ${t('classes.tab.allDone')}</p>`}</section>
    <section class="ct-games" aria-labelledby="ct-${c.id}-games"><div class="rail-head"><h3 id="ct-${c.id}-games">🎮 ${t('classes.games.heading')}</h3>${list.length > 8 ? html`<a class="more" href="/class/${c.id}">${t('cards.seeAll')}</a>` : ''}</div>
      ${list.length ? cardGrid(list.slice(0, 8), { classPill: false }) : html`<p class="small muted">${t('classes.games.emptyText')}</p>`}</section>
  </section>`;
}
router.get('/classes', requireUser, (req, res) => {
  const t = req.t; const u = req.user;
  const mine = S.classesOf(u.id, 'student'), waiting = S.myPendingRequests(u.id);
  // Staff work from their own My classes, and the platform admin from Schools, unless they are also a student somewhere.
  if (!mine.length && !waiting.length) {
    if (S.isSchoolStaff(u)) return res.redirect('/teach');
    if (S.isPlatformAdmin(u)) return res.redirect('/admin/schools');
  }
  const many = mine.length > 1;
  const body = html`
  ${many || !mine.length ? html`<div class="pagehead"><h1>🏫 ${t('classes.title')}</h1>${studentNotYou(req, mine.length > 0)}</div>` : html`<div class="pagehead ct-top">${studentNotYou(req, true)}</div>`}
  ${staffInvitesPanel(req)}
  ${many ? html`<nav class="chips ajump ct-pick" aria-label="${t('classes.tab.pick')}"><span class="ajump-l" aria-hidden="true">${t('classes.tab.pick')}</span>${mine.map(c => html`<a class="chip" href="#class-${c.id}">${c.name}</a>`)}</nav>` : ''}
  ${mine.length ? mine.map((c, i) => classSection(req, c, i, many))
    : waiting.length ? '' : emptyState({ emoji: '🏫', title: t('classes.none'), text: u.is_guest ? t('classes.guest') : t('classes.noneText') })}
  ${mine.length ? html`<p class="ct-more">${t('classes.tab.more')} <a class="btn btn-sm" href="/play">🎮 ${t('nav.play')}</a> <a class="btn btn-sm" href="/learn">📚 ${t('nav.learn')}</a></p>` : ''}
  ${waiting.length || !u.is_guest ? html`<div class="cols2">
  ${waiting.length ? html`<section class="panel"><h2>⏳ ${t('classes.waiting')}</h2><ul class="plain">${waiting.map(w => html`<li>${w.class_name} <span class="muted small">· ${w.school_name}</span></li>`)}</ul></section>` : ''}
  ${u.is_guest ? '' : mine.length && !req.query.code ? html`<details class="panel classes-join-more"><summary>${t('classes.joinAnother')}</summary><p class="small muted">${t('classes.joinText')}</p>
    <form class="row" data-api="/api/classes/join" novalidate><label class="sr-only" for="jc">${t('classes.code')}</label>
      <input class="input code-input" id="jc" name="code" maxlength="8" autocomplete="off" autocapitalize="characters" spellcheck="false" dir="ltr" placeholder="ABC123" required>
      <button class="btn btn-primary" type="submit">${t('classes.joinButton')}</button><span class="err form-err" role="alert"></span></form></details>` : html`<section class="panel"><h2>${t('classes.join')}</h2><p class="small muted">${t('classes.joinText')}</p>
    <form class="row" data-api="/api/classes/join" novalidate><label class="sr-only" for="jc">${t('classes.code')}</label>
      <input class="input code-input" id="jc" name="code" maxlength="8" autocomplete="off" autocapitalize="characters" spellcheck="false" dir="ltr" placeholder="ABC123" required value="${/^[A-Za-z0-9]{6}$/.test(String(req.query.code || '')) ? String(req.query.code).toUpperCase() : ''}">
      <button class="btn btn-primary" type="submit">${t('classes.joinButton')}</button><span class="err form-err" role="alert"></span></form></section>`}</div>` : ''}`;
  page(req, res, { title: mine.length === 1 ? mine[0].name : t('classes.title'), active: 'classes', body, head: CSS, scripts: liveOn() && mine.length ? ['/js/class-live.js'] : [] });
});
