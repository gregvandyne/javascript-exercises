// Staff invites by email (services/staff-email-invites.js): the "Invite by email" panel (a school's People tab for its
// admins and the platform admin; /school/<slug>/invite for a teacher of the school, linked from the school's name on
// their class pages), its APIs, and the page the email's link opens (/join-staff/<token>).
// With email sending off (or a send that failed), the invite is still made and its inviter is shown the link once
// (kept in memory for them only, like a login card) to copy and send themselves.
import { Router } from 'express';
import crypto from 'node:crypto';
import { html, raw } from '../views/html.js';
import { page, notFound, VERSION } from '../views/layout.js';
import { requireUser } from '../auth.js';
import { rateLimit } from '../services/ratelimit.js';
import * as S from '../services/schools.js';
import * as SE from '../services/staff-email-invites.js';
import { maskEmail, sendingOn } from '../services/email.js';
import { tFor, LOCALES, CODES } from '../i18n/index.js';

export const router = Router();
const CSS = raw(`<link rel="stylesheet" href="/css/community.css?v=${VERSION}"><link rel="stylesheet" href="/css/schools.css?v=${VERSION}">`);
const b = req => req.body || {};
const err = (req, res, code, status = 400) => res.status(status).json({ error: req.t(`school.errors.${code}`, { max: SE.MAX_OPEN }) });
const fieldErr = (res, field, error) => res.status(400).json({ error, field });
const no = (req, res) => (req.path.startsWith('/api/') ? res.status(404).json({ error: req.t('school.errors.notFound') }) : notFound(req, res, req.t('school.errors.notFound')));
const noStore = res => res.set({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' });

// ---- the link shown once to its inviter when no email went out (in memory, an hour, the inviter only)
const LINKS = new Map();
const LINK_KEEP_MS = 3600e3;
function keepLink(by, inv, token, status) {
  const k = crypto.randomBytes(12).toString('base64url');
  for (const [key, v] of LINKS) if (v.exp < Date.now()) LINKS.delete(key);
  LINKS.set(k, { by: by.id, schoolId: inv.school_id, invite: inv.id, url: SE.joinUrl(token), status, exp: Date.now() + LINK_KEEP_MS });
  return k;
}
const takeLink = (req, s) => {
  const v = LINKS.get(String(req.query.invlink || ''));
  return v && v.by === req.user.id && v.schoolId === s.id && v.exp >= Date.now() ? v : null;
};
/** Where the inviter sees the list: the People tab (admins), else the teacher's invite page. */
const panelHref = (u, s) => (S.canManageSchool(u, s.id) ? `/school/${s.slug}?tab=people` : `/school/${s.slug}/invite`);

/** The email's language: the one chosen on the form, else the page's (English for a language the site doesn't have). */
const langOf = (req, v) => (CODES.includes(v) ? v : CODES.includes(req.locale) ? req.locale : 'en');

/** "Invite by email": the form and the open invites (with Resend and Cancel). Teachers: Teachers only, their own invites. */
export function emailInvitesPanel(req, s) {
  const t = req.t, u = req.user, who = SE.inviterRole(u, s.id);
  if (!who) return '';
  const list = SE.listFor(u, s.id), shown = takeLink(req, s);
  const lang = langOf(req, '');
  return html`<section class="panel" id="email-invites" aria-labelledby="ei-h"><h3 id="ei-h">✉️ ${t('school.emailInvite.h')}</h3>
    <p class="small muted">${t('school.emailInvite.text', { school: s.name, days: SE.INVITE_DAYS })}</p>
    ${shown ? html`<div class="notice warn" role="status" id="invite-link"><p style="margin-top:0">⚠️ ${t(shown.status === 'off' ? 'school.emailInvite.notSentOff' : 'school.emailInvite.notSentFailed')}</p>
      <p class="row"><input class="input" id="invite-link-url" readonly dir="ltr" value="${shown.url}" aria-label="${t('school.emailInvite.linkLabel')}"> <button class="btn btn-sm" type="button" data-copy="${shown.url}">📋 ${t('school.emailInvite.copy')}</button></p>
      <p class="small muted" style="margin-bottom:0">${t('school.emailInvite.linkOnce')}</p></div>` : ''}
    ${sendingOn() ? '' : html`<p class="small muted" id="invite-email-off">${t('school.emailInvite.offNote')}</p>`}
    <form class="formgrid" id="email-invite-form" data-api="/api/schools/${s.id}/email-invites" novalidate>
      <div class="field"><label for="ei-email">${t('school.emailInvite.email')}</label><input class="input" id="ei-email" name="email" type="email" dir="ltr" maxlength="254" autocomplete="off" autocapitalize="off" spellcheck="false" required><span class="err" id="ei-email-err"></span></div>
      <div class="field"><label for="ei-name">${t('school.people.realName')}</label><input class="input" id="ei-name" name="rosterName" maxlength="60" required><span class="err" id="ei-name-err"></span></div>
      ${who === 'admin' ? html`<div class="field"><label for="ei-role">${t('school.people.role')}</label><select class="input" id="ei-role" name="role"><option value="teacher">${t('school.roles.teacher')}</option><option value="admin">${t('school.roles.admin')}</option></select></div>`
        : html`<input type="hidden" name="role" value="teacher"><p class="small muted wide" id="ei-teachers-only">${t('school.emailInvite.teachersOnly')}</p>`}
      <div class="field"><label for="ei-lang">${t('school.emailInvite.lang')}</label><select class="input" id="ei-lang" name="lang">${LOCALES.map(l => html`<option value="${l.code}" ${l.code === lang ? raw('selected') : ''}>${l.name}</option>`)}</select></div>
      <p class="err form-err wide" aria-live="polite"></p>
      <div class="formacts"><button class="btn btn-primary" type="submit">✉️ ${t('school.emailInvite.send')}</button></div>
    </form>
    ${list.length ? html`<h4 id="ei-list-h">${t('school.emailInvite.pendingH')} <span class="count">${list.length}</span></h4>
      <p class="small muted">${t(who === 'admin' ? 'school.emailInvite.pendingAdmin' : 'school.emailInvite.pendingTeacher')}</p>
      <ul class="plain" id="email-invite-list">${list.map(i => html`<li class="row inv-row" data-invite="${i.id}"><span><b>${i.roster_name}</b> <span class="small muted"><bdi dir="ltr">${i.email}</bdi> · ${t(`school.roles.${i.role}`)} · ${t('school.emailInvite.by', { name: i.inviter })} · ${req.fmt.day(i.created_at)} · ${i.expired ? html`<span class="chip-s warn">${t('school.emailInvite.expired')}</span>` : t('school.emailInvite.expires', { date: req.fmt.day(i.expires_at) })}</span></span>
        <span class="row"><form data-api="/api/schools/${s.id}/email-invites/${i.id}/resend"><button class="btn btn-sm" type="submit">🔁 ${t('school.emailInvite.resend')}</button></form>
        <form data-api="/api/schools/${s.id}/email-invites/${i.id}/cancel" data-reload><button class="btn btn-sm" type="submit">${t('school.people.inviteCancel')}</button></form></span></li>`)}</ul>` : ''}
  </section>`;
}

/** After making or renewing an invite: the email, and the reply (a toast, or the page with the link to copy). */
async function sendAndReply(req, res, s, inv, token, toastKey) {
  const r = await SE.sendInvite(tFor(inv.lang || 'en'), inv, token).catch(() => ({ status: 'failed' }));
  const back = panelHref(req.user, s);
  if (r.status === 'sent') return res.json({ ok: true, toast: req.t(toastKey, { email: inv.email }), redirect: `${back}#email-invites` });
  const k = keepLink(req.user, inv, token, r.status === 'off' ? 'off' : 'failed');
  res.json({ ok: true, redirect: `${back}${back.includes('?') ? '&' : '?'}invlink=${k}#email-invites` });
}
const inviteLimit = rateLimit('staff-email-invite', SE.PER_INVITER_HOUR, 3600e3);
router.post('/api/schools/:id/email-invites', requireUser, inviteLimit, async (req, res) => {
  const s = S.getSchool(req.params.id);
  if (!s || !SE.inviterRole(req.user, s.id)) return no(req, res);
  const x = b(req);
  const r = SE.createInvite(req.user, s.id, { email: x.email, rosterName: x.rosterName, role: x.role || 'teacher', lang: langOf(req, x.lang) });
  if (!r.ok) {
    if (r.code === 'badEmail' || r.code === 'emailStaff' || r.code === 'alreadyInvited') return fieldErr(res, 'email', req.t(`school.errors.${r.code}`));
    if (r.code === 'staffName') return fieldErr(res, 'rosterName', req.t('school.errors.staffName'));
    if (r.code === 'teachersOnly') return err(req, res, r.code, 403);
    return err(req, res, r.code, r.code === 'notFound' ? 404 : 400);
  }
  await sendAndReply(req, res, s, r.invite, r.token, 'school.emailInvite.sent');
});
router.post('/api/schools/:id/email-invites/:iid/resend', requireUser, inviteLimit, async (req, res) => {
  const s = S.getSchool(req.params.id);
  if (!s || !SE.inviterRole(req.user, s.id)) return no(req, res);
  const r = SE.renewInvite(req.user, s.id, String(req.params.iid));
  if (!r.ok) return err(req, res, r.code, r.code === 'notFound' ? 404 : 400);
  await sendAndReply(req, res, s, r.invite, r.token, 'school.emailInvite.resent');
});
router.post('/api/schools/:id/email-invites/:iid/cancel', requireUser, (req, res) => {
  const s = S.getSchool(req.params.id);
  if (!s || !SE.inviterRole(req.user, s.id)) return no(req, res);
  const r = SE.cancelInvite(req.user, s.id, String(req.params.iid));
  if (!r.ok) return err(req, res, r.code, 404);
  res.json({ ok: true, toast: req.t('school.people.inviteCancelled') });
});

// ---- a teacher's page for their school: invite a teacher (admins have this on the People tab)
router.get('/school/:slug/invite', requireUser, (req, res) => {
  const s = S.getSchoolBySlug(req.params.slug);
  const who = s && SE.inviterRole(req.user, s.id);
  if (!who) return no(req, res);
  if (who === 'admin') return res.redirect(302, `/school/${s.slug}?tab=people${req.query.invlink ? `&invlink=${encodeURIComponent(String(req.query.invlink))}` : ''}#email-invites`);
  const t = req.t;
  noStore(res);
  const body = html`<div class="pagehead"><div><span class="small muted">${s.name}</span><h1>✉️ ${t('school.emailInvite.teacherTitle')}</h1></div></div>
    ${emailInvitesPanel(req, s)}`;
  page(req, res, { title: t('school.emailInvite.teacherTitle'), active: 'classes', body, head: CSS, scripts: ['/js/schools.js'], back: '/teach', backLabel: t('school.teach.title') });
});

// ---- the link in the email
const J = key => `school.joinStaff.${key}`;
function joinBox(req, res, title, inner, status = 200) {
  noStore(res);
  page(req, res, { title, active: 'me', body: html`<div class="authbox"><div class="panel joinstaff" id="join-staff">${inner}</div></div>`, head: CSS, seo: { index: false } }, status);
}
router.get('/join-staff/:token', (req, res) => {
  const t = req.t, u = req.user && !req.user.is_guest ? req.user : null;
  const tok = String(req.params.token);
  const inv = SE.byToken(tok), s = inv && S.getSchool(inv.school_id);
  const top = emoji => html`<div class="center" style="font-size:3rem" aria-hidden="true">${emoji}</div>`;
  if (!inv || !s || s.archived_at) return joinBox(req, res, t(J('title')), html`${top('🔗')}<h1 class="center">${t(J('badH'))}</h1><p id="join-state" data-state="notFound">${t(J('notFound'))}</p>`, 404);
  const st = SE.stateOf(inv);
  if (st !== 'open') return joinBox(req, res, t(J('title')), html`${top(st === 'expired' ? '⏳' : '🔗')}<h1 class="center">${t(J('badH'))}</h1><p id="join-state" data-state="${st}">${t(J(st), { school: s.name })}</p>
    ${u ? '' : html`<p class="center"><a class="btn" href="/login">${t(J('signIn'))}</a></p>`}`, 410);
  const role = t(`school.roles.${inv.role}`);
  const head = html`${top('🏫')}<h1 class="center" id="join-h">${t(J('heading'), { school: s.name, role })}</h1>
    <p class="center">${t(J('from'), { name: SE.inviterName(inv) || t('school.emailInvite.mail.someone') })}</p>`;
  const next = encodeURIComponent(SE.joinPath(tok));
  if (!u) {
    return joinBox(req, res, t(J('title')), html`${head}
      <p class="small muted center">${t(J('useAddress'), { email: maskEmail(inv.email) })}</p>
      <p><a class="btn btn-primary btn-block btn-big" id="join-signin" href="/login?next=${next}">${t(J('signIn'))}</a></p>
      <p><a class="btn btn-block" id="join-signup" href="/signup/teacher?next=${next}">${t(J('create'))}</a></p>`);
  }
  const c = SE.checkAnswer(u, inv);
  if (c && c.code) {
    const why = c.code === 'emailMismatch' ? t(J('mismatch'), { email: maskEmail(inv.email), name: u.username }) : t(`school.errors.${c.code}`);
    return joinBox(req, res, t(J('title')), html`${head}
      <div class="notice warn" id="join-refused" data-code="${c.code}"><p style="margin-top:0">${why}</p>
      ${c.code === 'emailMismatch' || c.code === 'childAccount' || c.code === 'staffAccountOnly' ? html`<form data-api="/api/auth/logout"><input type="hidden" name="next" value="/login?next=${SE.joinPath(tok)}"><button class="btn" type="submit" id="join-signout">${t(J('signOut'))}</button></form>` : ''}</div>`);
  }
  joinBox(req, res, t(J('title')), html`${head}
    ${c && c.claim ? html`<p class="small muted" id="join-claim">${t(J('claim'), { email: maskEmail(inv.email) })}</p>` : ''}
    <p class="small inv-warn">⚠️ ${t('school.invite.warn')}</p>
    <form data-api="/api/join-staff/${tok}/accept" novalidate><p class="err form-err" aria-live="polite"></p><button class="btn btn-primary btn-block btn-big" type="submit" id="join-accept">✅ ${t('school.invite.accept')}</button></form>
    <form data-api="/api/join-staff/${tok}/decline" data-confirm="${t(J('declineConfirm'), { school: s.name })}"><p><button class="btn btn-block" type="submit" id="join-decline">${t('school.invite.decline')}</button></p></form>`);
});
router.post('/api/join-staff/:token/:answer', requireUser, rateLimit('join-staff', 30, 3600e3), (req, res) => {
  const accept = req.params.answer === 'accept';
  if (!accept && req.params.answer !== 'decline') return no(req, res);
  const r = SE.answer(req.user, String(req.params.token), accept);
  if (!r.ok) {
    if (['expired', 'used', 'cancelled'].includes(r.code)) return res.status(410).json({ error: req.t(J(r.code)) });
    if (r.code === 'emailMismatch') return err(req, res, r.code, 403);
    return err(req, res, r.code, r.code === 'notFound' ? 404 : 400);
  }
  if (!accept) return res.json({ ok: true, toast: req.t('school.invite.declined'), redirect: '/' });
  res.json({ ok: true, toast: req.t('school.invite.accepted', { school: r.school.name }), redirect: r.role === 'admin' ? `/school/${r.school.slug}` : '/teach' });
});
