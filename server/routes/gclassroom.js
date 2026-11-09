// Google Classroom sync: the class's Google Classroom page (/class/:id/google-classroom), connecting and disconnecting
// a teacher's Classroom (/auth/google/classroom/*: incremental authorization, offline access), and the sync APIs (link a
// course, import its roster, post a lesson, send grades). Everything answers like an unknown page while it is off
// (services/gclassroom.js enabled()), and the pieces other pages show render ''. Teacher tools only: every route checks
// the class (S.canManageClass) and that the person is school staff. See docs/google-classroom.md.
import { Router } from 'express';
import crypto from 'node:crypto';
import { html, raw } from '../views/html.js';
import { page, notFound, VERSION } from '../views/layout.js';
import { config } from '../config.js';
import * as auth from '../auth.js';
import { allow, rateLimit } from '../services/ratelimit.js';
import { log } from '../services/log.js';
import { tHtml } from '../i18n/index.js';
import { newFlow, endpoints, writeFlow, readFlow, clearFlow, useState, safeEqual, verifyIdToken, OidcError } from '../oidc.js';
import * as S from '../services/schools.js';
import * as L from '../services/lessons.js';
import * as G from '../services/google.js';
import * as GC from '../services/gclassroom.js';
import { SCOPES, exchangeCode } from '../services/gclassroom-client.js';
import { classHeader, classBack } from './schools.js';

export const router = Router();
const on = (req, res, next) => (GC.enabled() ? next() : next('router'));
const b = req => req.body || {};
const sha16 = v => crypto.createHash('sha256').update(String(v || '')).digest('hex').slice(0, 16);
const CSS = raw(`<link rel="stylesheet" href="/css/community.css?v=${VERSION}"><link rel="stylesheet" href="/css/schools.css?v=${VERSION}"><link rel="stylesheet" href="/css/gclassroom.css?v=${VERSION}">`);
const ltr = s => `⁦${s}⁩`;

/** Codes a result or ?gcerr= may carry; anything else reads as "Google Classroom didn't answer". */
export const ERRORS = ['notSetUp', 'notConnected', 'reconnect', 'notLinked', 'pickCourse', 'courseNotYours', 'courseGone', 'denied', 'rateLimited',
  'googleDown', 'badRequest', 'tooMany', 'alreadyPosted', 'notPosted', 'badMode', 'scopesMissing', 'noRefresh', 'expired', 'cancelled', 'staffOnly', 'tooManyTries'];
const errKey = code => `gclassroom.errors.${ERRORS.includes(code) ? code : 'googleDown'}`;
const errText = (t, code) => t(errKey(code), { max: GC.MAX_STUDENTS });
const STATUS = { rateLimited: 429, tooManyTries: 429 };
const fail = (req, res, code) => res.status(STATUS[code] || 400).json({ error: errText(req.t, code === 'notFound' ? 'courseGone' : code), code });
const notFoundJson = (req, res) => res.status(404).json({ error: req.t('progress.errors.notFound') });

/** School staff who manage this class (school admins and its teachers). Everyone else: an unknown page. */
function loadClass(req, res) {
  const c = S.getClass(req.params.id);
  if (!c || !S.canManageClass(req.user, c)) { if (req.path.startsWith('/api/')) notFoundJson(req, res); else notFound(req, res); return null; }
  return c;
}
/** The sync APIs: staff of the school (a platform admin who isn't staff has no Classroom of their own). */
function staffClass(req, res) {
  const c = loadClass(req, res); if (!c) return null;
  if (!GC.mayConnect(req.user)) { res.status(403).json({ error: errText(req.t, 'staffOnly'), code: 'staffOnly' }); return null; }
  return c;
}
function staffLesson(req, res) {
  const cl = L.getClassLesson(req.params.id); const c = cl && S.getClass(cl.class_id);
  if (!cl || !c || !S.canManageClass(req.user, c)) { notFoundJson(req, res); return null; }
  if (!GC.mayConnect(req.user)) { res.status(403).json({ error: errText(req.t, 'staffOnly'), code: 'staffOnly' }); return null; }
  return { cl, c };
}
// Syncs per teacher: generous for a day of teaching, small enough that a stuck script can't hammer Google.
const syncLimit = rateLimit('gc-sync', 60, 3600e3, 'gclassroom.errors.tooManyTries');
const origin = req => config.publicUrl || `${req.protocol}://${req.get('host')}`;
const redirectUri = req => `${origin(req)}/auth/google/classroom/callback`;
const pagePath = classId => `/class/${classId}/google-classroom`;

// ================================================================ connect / disconnect
router.post('/api/google-classroom/connect', on, auth.requireAccount, (req, res) => {
  const u = req.user;
  if (!GC.mayConnect(u)) return res.status(403).json({ error: errText(req.t, 'staffOnly'), code: 'staffOnly' });
  if (!GC.canStore()) return fail(req, res, 'notSetUp');
  if (!allow(`gc-connect:${u.id}`, 20, 3600e3)) return fail(req, res, 'tooManyTries');
  const c = S.getClass(String(b(req).back || ''));
  const back = c && S.canManageClass(u, c) ? c.id : '';
  const tk = auth.signToken({ p: 'gcl', u: u.id, sh: sha16(req.sessionId), b: back }, 300);
  res.json({ ok: true, redirect: `/auth/google/classroom/start?t=${encodeURIComponent(tk)}` });
});
router.get('/auth/google/classroom/start', on, auth.requireAccount, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const tk = auth.readToken(String(req.query.t || ''));
  if (!tk || tk.p !== 'gcl' || tk.u !== req.user.id || tk.sh !== sha16(req.sessionId) || !GC.mayConnect(req.user)) return res.redirect(303, '/teach');
  const f = newFlow(); const redirect = redirectUri(req);
  writeFlow(res, { s: f.state, n: f.nonce, v: f.verifier, r: redirect, i: 'classroom', u: req.user.id, b: tk.b || '' });
  const url = new URL(endpoints().authorize);
  const ident = G.identityOf(req.user.id);
  const p = { client_id: config.googleClientId, redirect_uri: redirect, response_type: 'code', scope: ['openid', 'email', ...SCOPES].join(' '),
    state: f.state, nonce: f.nonce, code_challenge: f.challenge, code_challenge_method: 'S256',
    // Incremental authorization: Google adds these scopes to what the person already granted; offline + consent so a
    // refresh token comes back every time (a reconnect replaces the old one).
    access_type: 'offline', include_granted_scopes: 'true', prompt: 'consent', ...(ident && ident.email ? { login_hint: ident.email } : {}) };
  for (const [k, v] of Object.entries(p)) url.searchParams.set(k, v);
  res.redirect(302, url.href);
});
const backTo = (flow, q) => `${flow && flow.b ? pagePath(flow.b) : '/teach'}?${q}${flow && flow.b ? '#gc-connect' : ''}`;
router.get('/auth/google/classroom/callback', on, async (req, res) => {
  res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  clearFlow(res);
  const flow = readFlow(auth.parseCookies(req));
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  if (!flow || flow.i !== 'classroom' || !req.user || req.user.id !== flow.u) return res.redirect(303, '/teach');
  if (!state || !safeEqual(state, flow.s) || !useState(flow.s)) return res.redirect(303, backTo(flow, 'gcerr=expired'));
  if (req.query.error) return res.redirect(303, backTo(flow, `gcerr=${req.query.error === 'access_denied' ? 'cancelled' : 'googleDown'}`));
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  if (!code || !GC.mayConnect(req.user)) return res.redirect(303, backTo(flow, 'gcerr=googleDown'));
  if (!GC.canStore()) return res.redirect(303, backTo(flow, 'gcerr=notSetUp'));
  try {
    const tok = await exchangeCode({ code, redirect: flow.r, verifier: flow.v });
    if (GC.missingScopes(tok.scopes).length) return res.redirect(303, backTo(flow, 'gcerr=scopesMissing'));
    const claims = await verifyIdToken(tok.idToken, { nonce: flow.n });
    const r = GC.saveConnection(req.user, { sub: claims.sub, email: claims.email, scopes: tok.scopes, refreshToken: tok.refreshToken });
    if (!r.ok) return res.redirect(303, backTo(flow, `gcerr=${r.code}`));
    return res.redirect(303, backTo(flow, 'gc=connected'));
  } catch (e) {
    log('warn', 'google classroom connect failed', { reason: e instanceof OidcError ? e.reason : e.reason || 'error' });
    return res.redirect(303, backTo(flow, 'gcerr=googleDown'));
  }
});
router.post('/api/google-classroom/disconnect', on, auth.requireAccount, async (req, res) => {
  if (!GC.mayConnect(req.user) && !GC.connectionOf(req.user.id)) return res.status(403).json({ error: errText(req.t, 'staffOnly'), code: 'staffOnly' });
  const r = await GC.disconnect(req.user);
  if (!r.ok) return fail(req, res, r.code);
  res.json({ ok: true, toast: req.t('gclassroom.connect.disconnected') });
});

// ================================================================ the class's sync APIs
router.post('/api/classes/:id/google-classroom/link', on, auth.requireAccount, syncLimit, async (req, res) => {
  const c = staffClass(req, res); if (!c) return;
  const r = await GC.link(req.user, c, b(req).courseId);
  if (!r.ok) return r.code === 'pickCourse' ? res.status(400).json({ error: errText(req.t, 'pickCourse'), field: 'courseId' }) : fail(req, res, r.code);
  res.json({ ok: true, toast: req.t('gclassroom.course.linked', { course: r.course.name }) });
});
router.post('/api/classes/:id/google-classroom/unlink', on, auth.requireAccount, (req, res) => {
  const c = staffClass(req, res); if (!c) return;
  const r = GC.unlink(req.user, c); if (!r.ok) return fail(req, res, r.code);
  res.json({ ok: true, toast: req.t('gclassroom.course.unlinked') });
});
router.post('/api/classes/:id/google-classroom/roster', on, auth.requireAccount, syncLimit, async (req, res) => {
  const c = staffClass(req, res); if (!c) return;
  if (!allow(`gc-roster:${c.id}`, 20, 3600e3)) return fail(req, res, 'tooManyTries');
  const r = await GC.importRoster(req.user, c);
  if (!r.ok) return fail(req, res, r.code);
  res.json({ ok: true, toast: rosterText(req.t, r.counts) });
});
router.post('/api/class-lessons/:id/google-classroom/post', on, auth.requireAccount, syncLimit, async (req, res) => {
  const x = staffLesson(req, res); if (!x) return;
  const r = await GC.postLesson(req.user, x.cl, { origin: origin(req), description: req.t('gclassroom.post.description') });
  if (!r.ok) return fail(req, res, r.code);
  res.json({ ok: true, toast: postText(req, r) });
});
router.post('/api/class-lessons/:id/google-classroom/grades', on, auth.requireAccount, syncLimit, async (req, res) => {
  const x = staffLesson(req, res); if (!x) return;
  const r = await GC.sendGrades(req.user, x.cl, String(b(req).mode || ''));
  if (!r.ok) return fail(req, res, r.code);
  res.json({ ok: true, toast: gradesText(req.t, r.counts) });
});

// ================================================================ text for results
/** After a post: done, done without the passed due date, or scheduled for the day the lesson opens. */
function postText(req, r) {
  if (r.scheduled) return req.t('gclassroom.post.doneScheduled', { date: req.fmt.day(r.scheduled) });
  return req.t(r.pastDue ? 'gclassroom.post.donePastDue' : 'gclassroom.post.done');
}
function rosterText(t, k) {
  // (created: accounts made at import by the first version of this feature, before students waited to sign in.)
  return [t('gclassroom.roster.resultAdded', { count: (k.added || 0) + (k.created || 0) }), k.waiting && t('gclassroom.roster.resultWaiting', { count: k.waiting }),
    k.already && t('gclassroom.roster.resultAlready', { count: k.already }),
    k.ownAccount && t('gclassroom.roster.resultOwn', { count: k.ownAccount }), k.otherSchool && t('gclassroom.roster.resultOther', { count: k.otherSchool }),
    k.staff && t('gclassroom.roster.resultStaff', { count: k.staff }), k.needDomains && t('gclassroom.roster.resultDomains', { count: k.needDomains })].filter(Boolean).join(' · ');
}
function gradesText(t, k) {
  return [t('gclassroom.grades.resultSent', { count: k.sent || 0 }), k.notStarted && t('gclassroom.grades.resultNotStarted', { count: k.notStarted }),
    k.notMatched && t('gclassroom.grades.resultNotMatched', { count: k.notMatched }), k.failed && t('gclassroom.grades.resultFailed', { count: k.failed })].filter(Boolean).join(' · ');
}
function syncLine(req, s) {
  const t = req.t, f = req.fmt;
  const what = s.kind === 'roster' && s.status === 'ok' ? rosterText(t, s.counts) : s.kind === 'grades' && s.status !== 'error' ? gradesText(t, s.counts) : '';
  const bad = s.status === 'error' || s.status === 'partial';
  return html`<li class="gc-log-row${bad ? ' is-bad' : ''}"><span class="gc-log-what"><b>${s.status === 'ok' ? '✅' : s.status === 'partial' ? '⚠️' : '❌'} ${t(`gclassroom.log.kinds.${s.kind}`)}</b>
    ${what ? html`<span class="small">${what}</span>` : ''}${s.error ? html`<span class="small gc-err">${errText(t, s.error)}</span>` : ''}</span>
    <span class="small muted gc-log-when">${f.ago(s.created_at)}${s.username ? html` · <bdi>@${s.username}</bdi>` : ''}</span></li>`;
}

// ================================================================ the page
router.get('/class/:id/google-classroom', on, auth.requireUser, async (req, res) => {
  const c = loadClass(req, res); if (!c) return;
  const t = req.t, f = req.fmt, u = req.user;
  const s = S.getSchool(c.school_id);
  const staff = GC.mayConnect(u);
  const state = GC.connectionState(u.id); const conn = GC.connectionOf(u.id);
  const lk = GC.linkOf(c.id);
  const flash = req.query.gc === 'connected' ? html`<p class="notice good" role="status">✅ ${t('gclassroom.connect.connectedToast')}</p>` : '';
  const gerr = typeof req.query.gcerr === 'string' && ERRORS.includes(req.query.gcerr) ? html`<p class="notice warn" role="alert">${errText(t, req.query.gcerr)}</p>` : '';

  // 1. The teacher's own connection.
  const connectForm = label => html`<form data-api="/api/google-classroom/connect" novalidate><input type="hidden" name="back" value="${c.id}"><p class="err form-err" aria-live="polite"></p>
    <button class="btn btn-primary" type="submit" ${GC.canStore() ? '' : raw('disabled')}>🔗 ${label}</button></form>`;
  const connectPanel = html`<section class="panel" id="gc-connect" aria-labelledby="gc-c-h"><h2 id="gc-c-h">🔗 ${t('gclassroom.connect.heading')}</h2>${flash}${gerr}
    ${!staff ? html`<p class="small muted">${t('gclassroom.errors.staffOnly')}</p>`
      : !GC.canStore() ? html`<p class="notice warn">${t('gclassroom.errors.notSetUp')}</p>`
      : state === 'ok' ? html`<p>${t('gclassroom.connect.connectedAs', { email: ltr(conn.email) })}</p><p class="small muted">${t('gclassroom.connect.connectedHint')}</p>
          <form data-api="/api/google-classroom/disconnect" data-reload data-confirm="${t('gclassroom.connect.disconnectConfirm')}"><button class="btn" type="submit">${t('gclassroom.connect.disconnect')}</button></form>`
      : state === 'reconnect' ? html`<p class="notice warn">${t('gclassroom.errors.reconnect')}</p>${connectForm(t('gclassroom.connect.reconnect'))}`
      : html`<p class="muted">${t('gclassroom.connect.text')}</p><ul class="gc-what small">${['courses', 'roster', 'post', 'grades'].map(k => html`<li>${t(`gclassroom.connect.what.${k}`)}</li>`)}</ul>${connectForm(t('gclassroom.connect.button'))}
          <p class="small muted">${t('gclassroom.connect.privacy')}</p>`}</section>`;

  // 2. The linked course.
  let coursePanel;
  if (state !== 'ok') {
    coursePanel = lk ? html`<section class="panel" id="gc-course"><h2>🎓 ${t('gclassroom.course.heading')}</h2><p>${t('gclassroom.course.linkedTo', { course: lk.course_name })}</p><p class="small muted">${t('gclassroom.course.connectFirst')}</p></section>` : '';
  } else if (lk) {
    coursePanel = html`<section class="panel" id="gc-course"><h2>🎓 ${t('gclassroom.course.heading')}</h2><p><b>${t('gclassroom.course.linkedTo', { course: lk.course_name })}</b></p>
      <form data-api="/api/classes/${c.id}/google-classroom/unlink" data-reload data-confirm="${t('gclassroom.course.unlinkConfirm', { course: lk.course_name })}"><button class="btn btn-sm" type="submit">${t('gclassroom.course.unlink')}</button></form></section>`;
  } else {
    // The five-minute cached list unless the teacher asks for a fresh one ("Refresh the list"); linking always checks a
    // fresh one. Every call to Google from here is rate limited per teacher.
    const fresh = req.query.fresh === '1';
    const r = (!fresh && GC.hasCourses(u)) || allow(`gc-courses:${u.id}`, 30, 3600e3) ? await GC.courses(u, { fresh }) : { ok: false, code: 'tooManyTries' };
    coursePanel = html`<section class="panel" id="gc-course"><h2>🎓 ${t('gclassroom.course.heading')}</h2><p class="small muted">${t('gclassroom.course.text', { class: c.name })}</p>
      ${!r.ok ? html`<p class="notice warn" role="alert">${errText(t, r.code)}</p>`
        : !r.courses.length ? html`<p class="small muted">${t('gclassroom.course.none')}</p>`
        : html`<form class="row gc-linkform" data-api="/api/classes/${c.id}/google-classroom/link" data-reload novalidate>
          <label class="sr-only" for="gc-course-pick">${t('gclassroom.course.pick')}</label>
          <select class="input grow" id="gc-course-pick" name="courseId" required><option value="">${t('gclassroom.course.pick')}</option>${r.courses.map(x => html`<option value="${x.id}">${x.name}${x.section ? ` · ${x.section}` : ''}</option>`)}</select>
          <button class="btn btn-primary" type="submit">${t('gclassroom.course.link')}</button><span class="err" id="gc-course-pick-err" aria-live="polite"></span></form>`}
      <p class="small"><a class="btn btn-sm" href="${pagePath(c.id)}?fresh=1#gc-course">🔄 ${t('gclassroom.course.refresh')}</a></p></section>`;
  }

  // 3. Roster and 4. lessons: only once connected and linked.
  const ready = state === 'ok' && !!lk && staff;
  const domains = G.schoolDomains(s);
  const lastRoster = lk && lk.roster_at ? html`<p class="small muted">${t('gclassroom.roster.last', { when: f.ago(lk.roster_at) })} · ${rosterText(t, JSON.parse(lk.roster_counts || '{}'))}</p>` : '';
  const waiting = lk ? GC.pendingCount(c.id) : 0;
  const waitingLine = waiting ? html`<p class="small" id="gc-waiting">⏳ ${t('gclassroom.roster.waitingNow', { count: waiting })}</p>` : '';
  const rosterPanel = ready ? html`<section class="panel" id="gc-roster"><h2>👩‍🎓 ${t('gclassroom.roster.heading')}</h2>
    <p class="small muted">${t('gclassroom.roster.text')}</p>
    ${domains.length ? '' : html`<p class="notice warn small">${S.canManageSchool(u, s.id) ? tHtml(t, 'gclassroom.roster.noDomainsAdmin', { link: html`<a href="/school/${s.slug}?tab=settings#google">${t('google.invites.settingsLink')}</a>` }) : t('gclassroom.roster.noDomains')}</p>`}
    <form data-api="/api/classes/${c.id}/google-classroom/roster" data-reload><button class="btn btn-primary" type="submit">⬇️ ${t('gclassroom.roster.button')}</button></form>${lastRoster}${waitingLine}</section>` : '';

  const posts = GC.postsOfClass(c.id);
  const lessons = L.classPlan(c.id).flatMap(g => g.lessons);
  const lessonRow = cl => {
    const p = posts.get(cl.id);
    const g = p && p.grades_at ? html`<span class="small muted">${t(p.grades_mode === 'assigned' ? 'gclassroom.grades.lastAssigned' : 'gclassroom.grades.lastDraft', { when: f.ago(p.grades_at) })} · ${gradesText(t, JSON.parse(p.grades_counts || '{}'))}</span>` : '';
    return html`<li class="gc-lesson" id="gc-l-${cl.id}"><div class="gc-lesson-head"><b dir="auto">${cl.title}</b>
      <span class="small muted">${cl.due_at ? t('gclassroom.post.due', { date: f.day(cl.due_at) }) : t('gclassroom.post.noDue')}</span>
      ${p ? html`<span class="chip-s good">✅ ${t('gclassroom.post.posted')}</span>` : ''}</div>
      ${p ? html`<div class="gc-lesson-acts">${p.link ? html`<a class="btn btn-sm" href="${p.link}" target="_blank" rel="noopener noreferrer">↗ ${t('gclassroom.post.open')}</a>` : ''}
          <form class="gc-gradeform" data-api="/api/class-lessons/${cl.id}/google-classroom/grades" data-reload novalidate>
            <fieldset class="gc-modes"><legend class="small">${t('gclassroom.grades.as')}</legend>
              <label class="gc-mode"><input type="radio" name="mode" value="draft" checked> <span>${t('gclassroom.grades.draft')}</span></label>
              <label class="gc-mode"><input type="radio" name="mode" value="assigned"> <span>${t('gclassroom.grades.assigned')}</span></label></fieldset>
            <button class="btn btn-sm btn-primary" type="submit">📤 ${t('gclassroom.grades.button')}</button></form>${g}</div>`
        : html`<form data-api="/api/class-lessons/${cl.id}/google-classroom/post" data-reload><button class="btn btn-sm" type="submit">📌 ${t('gclassroom.post.button')}</button></form>`}</li>`;
  };
  const lessonsPanel = ready ? html`<section class="panel" id="gc-lessons"><h2>📚 ${t('gclassroom.post.heading')}</h2>
    <p class="small muted">${t('gclassroom.post.text')}</p><p class="small muted">${t('gclassroom.grades.text')}</p>
    ${lessons.length ? html`<ul class="plain gc-lessons">${lessons.map(lessonRow)}</ul>` : html`<p class="small muted">${t('gclassroom.post.noLessons')}</p>`}</section>` : '';

  const syncs = GC.recentSyncs(c.id);
  const logPanel = syncs.length ? html`<section class="panel" id="gc-log"><h2>🧾 ${t('gclassroom.log.heading')}</h2><ul class="plain gc-log">${syncs.map(x => syncLine(req, x))}</ul></section>` : '';

  page(req, res, { title: `${t('gclassroom.title')} · ${c.name}`, active: 'classes', head: CSS, ...classBack(req, c), scripts: ['/js/schools.js'],
    body: html`${classHeader(req, c, null)}<div class="gc-page"><h2 class="gc-title">🎓 ${t('gclassroom.title')}</h2>${connectPanel}${coursePanel}${rosterPanel}${lessonsPanel}${logPanel}</div>` });
});

// ================================================================ pieces for other pages
/** Lessons tab: a button to the class's Google Classroom page (school staff only). */
export function gcLessonsButton(req, c) {
  if (!GC.enabled() || !GC.mayConnect(req.user)) return '';
  const lk = GC.linkOf(c.id);
  return html`<a class="btn" href="${pagePath(c.id)}">🎓 ${req.t('gclassroom.title')}${lk ? html` <span class="chip-s good">✓</span>` : ''}</a>`;
}
/** Students tab: "Import from Google Classroom" (school staff only). */
export function gcRosterHint(req, c) {
  if (!GC.enabled() || !GC.mayConnect(req.user)) return '';
  return html`<p class="small gc-hint">🎓 ${tHtml(req.t, 'gclassroom.roster.hint', { link: html`<a href="${pagePath(c.id)}#gc-roster">${req.t('gclassroom.roster.hintLink')}</a>` })}</p>`;
}
/** The assign form: "Also post to Google Classroom", when this teacher is connected and the class linked. */
export function gcAssignField(req, c) {
  if (!GC.enabled() || !GC.mayConnect(req.user) || !GC.linkOf(c.id) || GC.connectionState(req.user.id) !== 'ok') return '';
  // Unticked: a post reaches real students in Classroom and can't be taken back from here, so the teacher asks for it.
  return html`<label class="field gc-also wide"><span class="gc-check"><input type="checkbox" name="gcPost" value="1"> <span>🎓 ${req.t('gclassroom.post.also')}</span></span></label>`;
}
/** After an assign from that form: post it too. -> a line for the toast ('' when not asked). */
export async function gcAfterAssign(req, classLesson) {
  const v = b(req).gcPost;
  if (!GC.enabled() || !(v === '1' || v === true || v === 'on') || !classLesson || !GC.mayConnect(req.user)) return '';
  const c = S.getClass(classLesson.class_id);
  if (!c || !S.canManageClass(req.user, c) || !GC.linkOf(c.id)) return '';
  if (!allow(`gc-sync:${req.user.id}`, 60, 3600e3)) return errText(req.t, 'tooManyTries');
  const r = await GC.postLesson(req.user, classLesson, { origin: origin(req), description: req.t('gclassroom.post.description') });
  return r.ok ? postText(req, r) : `${req.t('gclassroom.post.failed')} ${errText(req.t, r.code)}`;
}
