// A lost password, for accounts that have an email we may use (docs/decisions.md "Teacher quick wins", item i).
//
// Who: teachers and school staff, and grown-up (parent) accounts: the accounts services/email.js may write to
// (adultRecipient), at the address it already knows (addressOf: a Google sign-in's verified address, else the one the
// trial's checkout gave us). Never a kid's or a student's account (they have no email; they keep "ask your teacher" /
// "ask a grown-up"), never a guest, a banned account or the platform admin (reset on the server, scripts/seed.js).
//
//   GET  /forgot                 the form (a username). While email sending is off: the contact address instead.
//   POST /api/auth/forgot        always the same answer, after the same wait, whether or not the account exists, may
//                                be reset or has an address. Limits: 5 an hour per address, 3 an hour per account.
//   GET  /reset?t=<token>        "Choose a new password" (a GET changes nothing: mail scanners open links)
//   POST /api/auth/reset         { token, password }: sets it, ends every session of the account, clears the sign-in
//                                lock, and goes to the sign-in page (no automatic sign-in).
//
// The link: a token signed with the site secret (auth.signToken), good for 30 minutes, that names the account and
// carries a fingerprint of the password hash it was made for. Setting a new password changes the hash, so the link (and
// every other link sent before it) stops working: single use, with nothing to store. The email goes out on the
// transactional path (services/email.js send: logged in email_log, never the body or the link). Requests and resets
// are in the audit log. Pages are no-store, no-referrer and never indexed.
import { Router } from 'express';
import { html, esc } from '../views/html.js';
import { page } from '../views/layout.js';
import * as auth from '../auth.js';
import { audit, uid } from '../db.js';
import { tHtml } from '../i18n/index.js';
import * as E from '../services/email.js';
import { allow, clear, ipOf, loginLockKey } from '../services/ratelimit.js';
import { log } from '../services/log.js';
import { contactEmail } from './teachers.js';

export const router = Router();
export const RESET_MINUTES = 30;
export const FORGOT_LIMITS = Object.freeze({ perIpHour: 5, perUserHour: 3, minMs: 400 });
const KIND = 'pwreset';
const fingerprint = u => auth.sign(`pwreset:v1:${u.id}:${u.password_hash || ''}`).slice(0, 22);
const sleep = ms => new Promise(r => { setTimeout(r, ms); });
const headers = res => res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' });

/** May this account reset its password by email? Staff and grown-ups only; never a student, a kid, a guest, a banned
 *  account or the platform admin. */
export function mayReset(u) {
  if (!u || u.is_guest || u.banned || u.role === 'admin') return false;
  // accountKind: 'staff' for a teacher or school admin (also one whose account the school made), 'grownup' for a parent;
  // a school's student account is 'student' and a kid's own is 'standard': neither is ever reset by email.
  const kind = auth.accountKind(u);
  return (kind === 'staff' || kind === 'grownup') && E.adultRecipient(u);
}
/** A link's token for an account, and the account a token is still good for (null: expired, changed, used, or not ours). */
export const resetToken = u => auth.signToken({ k: KIND, u: u.id, f: fingerprint(u) }, RESET_MINUTES * 60);
export function readResetToken(tok) {
  const p = typeof tok === 'string' && tok.length <= 600 ? auth.readToken(tok) : null;
  if (!p || p.k !== KIND || typeof p.u !== 'string') return null;
  const u = auth.getUser(p.u);
  return u && mayReset(u) && p.f === fingerprint(u) ? u : null;
}

/** The email: plain words, one button, in the language of the page that asked. */
export function resetEmail(t, { username, url }) {
  const v = { username, minutes: RESET_MINUTES };
  const lines = [t('auth.reset.email.intro', v), t('auth.reset.email.expires', v), t('auth.reset.email.ignore', v)];
  const P = 'margin:0 0 16px;font-size:16px;line-height:1.55;color:#1f2937;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif';
  const body = `<!doctype html><html lang="${esc(t.locale || 'en')}" dir="${t.dir || 'ltr'}"><body style="margin:0;padding:24px;background:#ffffff">
<p style="${P}">${esc(lines[0])}</p>
<p style="${P}"><a href="${esc(url)}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#141414;color:#ffffff;font-weight:700;text-decoration:none">${esc(t('auth.reset.email.button'))}</a></p>
<p style="${P}">${esc(lines[1])}</p><p style="${P};color:#4b5563">${esc(lines[2])}</p>
<p style="${P};color:#4b5563">Oomba Academy</p></body></html>`;
  const text = `${lines[0]}\n\n${url}\n\n${lines[1]}\n\n${lines[2]}\n\nOomba Academy\n`;
  return { subject: t('auth.reset.email.subject'), html: body, text };
}

const box = (req, res, title, inner, status = 200) => {
  headers(res);
  page(req, res, { title, active: 'me', body: html`<div class="authbox"><div class="panel pwreset">${inner}</div></div>`, seo: { index: false } }, status);
};
/** The way out when no link can be sent or it never arrives: the same contact address the sign-in page gives. */
const contactLine = (t, key) => html`<p class="small muted">${tHtml(t, key, { email: html`<a href="mailto:${contactEmail()}" dir="ltr">${contactEmail()}</a>` })}</p>`;

router.get('/forgot', (req, res) => {
  const t = req.t;
  if (req.user && !req.user.is_guest) return res.redirect(302, auth.isGrownup(req.user) ? '/family/account#password' : '/me#password');
  const top = html`<div class="center" style="font-size:3rem" aria-hidden="true">🔑</div><h1 class="center">${t('auth.reset.title')}</h1>`;
  const kids = html`<p class="small"><span aria-hidden="true">🙂</span> ${t('auth.reset.kids')}</p>`;
  const back = html`<p class="center" style="margin:16px 0 0"><a class="btn btn-block" href="/login">${t('auth.reset.backToSignIn')}</a></p>`;
  if (!E.sendingOn()) return box(req, res, t('auth.reset.title'), html`${top}${contactLine(t, 'auth.reset.off')}${kids}${back}`);
  if (req.query.sent === '1') {
    return box(req, res, t('auth.reset.title'), html`${top}<p class="notice good" role="status" id="reset-sent">${t('auth.reset.sent', { minutes: RESET_MINUTES })}</p>
      ${contactLine(t, 'auth.reset.noEmail')}${back}`);
  }
  box(req, res, t('auth.reset.title'), html`${top}<p class="muted">${t('auth.reset.lead')}</p>
    <form data-api="/api/auth/forgot" novalidate>
      <div class="field"><label for="fg-username">${t('auth.reset.username')}</label>
        <input class="input" id="fg-username" name="username" dir="ltr" autocomplete="username" required maxlength="16" autocapitalize="off" spellcheck="false">
        <span class="err" id="fg-username-err" aria-live="polite"></span></div>
      <p class="err form-err" aria-live="polite"></p>
      <button class="btn btn-primary btn-block" type="submit">${t('auth.reset.send')}</button>
    </form>${kids}${back}`);
});

router.post('/api/auth/forgot', async (req, res) => {
  const t0 = Date.now(), t = req.t, ip = ipOf(req);
  headers(res);
  if (!E.sendingOn()) return res.status(404).json({ error: t('errors.api.notFound') });
  if (!allow(`pw-forgot:${ip}`, FORGOT_LIMITS.perIpHour, 3600e3)) return res.status(429).json({ error: t('errors.api.slowDown') });
  const name = String((req.body || {}).username || '').trim().slice(0, 64);
  if (!name) return res.status(400).json({ error: t('auth.reset.needUsername'), field: 'username' });
  // From here on the answer is the same for every username: nothing says whether the account exists, is a teacher's or
  // a child's, or has an address.
  const u = auth.getUserByName(name);
  if (u && mayReset(u) && E.addressOf(u.id) && allow(`pw-forgot-user:${u.id}`, FORGOT_LIMITS.perUserHour, 3600e3)) {
    // The site's own address (never the request's Host header, which the sender chooses).
    const url = `${E.siteBase()}/reset?t=${encodeURIComponent(resetToken(u))}`;
    const m = resetEmail(t, { username: u.username, url });
    audit(u.id, 'user.password_reset_request', u.id, { ip });
    // Not awaited: the answer never waits for (or tells) how the send went. It leaves its own email_log row.
    E.send({ userId: u.id, template: 'password_reset', category: 'transactional', subject: m.subject, html: m.html, text: m.text, idemKey: `pwreset-${u.id}-${uid(10)}` })
      .catch(e => log('warn', 'password reset email failed', { user: u.id, error: String(e && e.message).slice(0, 120) }));
  }
  const wait = FORGOT_LIMITS.minMs - (Date.now() - t0); if (wait > 0) await sleep(wait);
  res.json({ ok: true, redirect: '/forgot?sent=1' });
});

router.get('/reset', (req, res) => {
  const t = req.t, tok = typeof req.query.t === 'string' ? req.query.t : '';
  const u = readResetToken(tok);
  const top = html`<div class="center" style="font-size:3rem" aria-hidden="true">🔑</div><h1 class="center">${t('auth.reset.newTitle')}</h1>`;
  if (!u) {
    return box(req, res, t('auth.reset.newTitle'), html`${top}<p class="notice warn" role="status" id="reset-bad">${t('auth.reset.bad', { minutes: RESET_MINUTES })}</p>
      <p class="center" style="margin-bottom:0"><a class="btn btn-primary btn-block" href="/forgot">${t('auth.reset.again')}</a></p>`, 400);
  }
  const min = auth.STAFF_PASSWORD_MIN;
  box(req, res, t('auth.reset.newTitle'), html`${top}<p class="muted center">${tHtml(t, 'auth.reset.forAccount', { username: html`<b dir="ltr">${u.username}</b>` })}</p>
    <form data-api="/api/auth/reset" novalidate><input type="hidden" name="token" value="${tok}">
      <input type="text" name="username" value="${u.username}" autocomplete="username" hidden>
      <div class="field"><label for="rs-password">${t('auth.reset.newLabel')}</label>
        <span class="pw-row"><input class="input" id="rs-password" name="password" type="password" dir="ltr" autocomplete="new-password" required minlength="${min}" maxlength="72" aria-describedby="rs-password-hint">
        <button class="btn pw-toggle" type="button" data-pw-toggle="rs-password" aria-controls="rs-password" aria-pressed="false" data-show="${t('auth.page.showPassword')}" data-hide="${t('auth.page.hidePassword')}">👁️ <span>${t('auth.page.showPassword')}</span></button></span>
        <span class="hint" id="rs-password-hint">${t('auth.reset.newHint', { min })}</span>
        <span class="err" id="rs-password-err" aria-live="polite"></span></div>
      <p class="err form-err" aria-live="polite"></p>
      <button class="btn btn-primary btn-block" type="submit">${t('auth.reset.save')}</button>
    </form>`);
});

router.post('/api/auth/reset', (req, res) => {
  const t = req.t, ip = ipOf(req), b = req.body || {};
  headers(res);
  if (!allow(`pw-reset:${ip}`, 20, 3600e3)) return res.status(429).json({ error: t('errors.api.slowDown') });
  const u = readResetToken(b.token);
  if (!u) return res.status(400).json({ error: t('auth.reset.bad', { minutes: RESET_MINUTES }), code: 'badLink' });
  const pw = String(b.password ?? '');
  const pe = pw.length < auth.STAFF_PASSWORD_MIN ? t('auth.reset.newHint', { min: auth.STAFF_PASSWORD_MIN }) : auth.checkPassword(pw, u.username, t);
  if (pe) return res.status(400).json({ error: pe, field: 'password' });
  // The new hash retires this link and every other one; every session of the account ends (this browser's too).
  auth.setPassword(u.id, pw, { signOutEverywhere: true });
  clear(loginLockKey(u.username));
  audit(u.id, 'user.password_reset', u.id, { ip, via: 'email' });
  if (req.user) auth.endSession(req, res);
  res.json({ ok: true, redirect: '/login?reset=1' });
});
