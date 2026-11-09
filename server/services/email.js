// Sending email (docs/decisions.md "Trial emails"): Resend's HTTP API (POST https://api.resend.com/emails with a bearer
// key; no SDK). Off unless RESEND_API_KEY is set and EMAIL_ENABLED is not 0. Two kinds of email:
//  - 'nudge': marketing (the trial sequence). Needs EMAIL_POSTAL_ADDRESS (CAN-SPAM): while it is empty none is sent at
//    all (logged once; /admin/emails and /admin/billing warn). Never to someone who unsubscribed.
//  - 'transactional' (a thank-you for a purchase, later receipts): unsubscribing doesn't stop these.
//  - 'digest': the weekly class summary for teachers (services/digest.js). Its own off switch (digest_off_at, the
//    "Stop these summaries" link and the Me page), separate from the nudges'; no postal address needed (it is about
//    the teacher's own classes, not marketing), though the footer carries it when it is set.
// Every email goes only to a grown-up, teacher or staff account (never a kid's: kid accounts have no email anyway), at
// the address we know for it: a Google sign-in's verified address, else the one the trial's checkout gave us. No
// address: skipped and logged. Each send carries an Idempotency-Key (Resend keeps it 24 hours, so a retry or a restart
// mid-send never sends twice), is retried with backoff on network errors, 429 and 5xx, and leaves one email_log row
// (to, template, status, the provider's id, a short error): never the body.
import crypto from 'node:crypto';
import { config } from '../config.js';
import { q, uid, now } from '../db.js';
import { log } from './log.js';
import { secret, isGrownup, getUser } from '../auth.js';
import { isStaff } from './schools.js';
import { register } from './jobs.js';

export const RESEND_URL = 'https://api.resend.com/emails';
const DAY = 864e5;
// Tests replace fetch (Resend is never called from a test) and the backoff wait.
let fetchImpl = null;
let sleep = ms => new Promise(r => { setTimeout(r, ms).unref?.(); });
/** Tests: a fetch stand-in for Resend (null: the real fetch), and a wait stand-in for the backoff. */
export function _hooks({ fetch, wait } = {}) { if (fetch !== undefined) fetchImpl = fetch; if (wait !== undefined) sleep = wait || (ms => new Promise(r => { setTimeout(r, ms).unref?.(); })); }
const doFetch = (...a) => (fetchImpl || globalThis.fetch)(...a);
/** Waits before each retry (ms): three tries in all. */
export const BACKOFF_MS = [1000, 4000];

/** Any email can go (a key, and EMAIL_ENABLED not 0). */
export const sendingOn = () => !!(config.emailEnabled && config.resendApiKey);
/** Marketing (trial nudges) can go: sending is on and the footer has a postal address. */
export const nudgesAllowed = () => sendingOn() && !!config.emailPostalAddress;
/** What the admin pages show: settings by name only, never the key. */
export function emailStatus() {
  const problems = [];
  if (!config.resendApiKey) problems.push('RESEND_API_KEY is not set: no email is sent.');
  if (!config.emailEnabled) problems.push('EMAIL_ENABLED is 0: no email is sent.');
  if (!config.emailPostalAddress) problems.push('EMAIL_POSTAL_ADDRESS is not set: trial emails (marketing) are not sent at all until it holds the postal address CAN-SPAM requires in their footer.');
  return { key: !!config.resendApiKey, enabled: config.emailEnabled, postal: !!config.emailPostalAddress, from: config.emailFrom, replyTo: config.emailReplyTo,
    postalAddress: config.emailPostalAddress, sending: sendingOn(), nudges: nudgesAllowed(), problems };
}
const warned = new Set();
/** Logs a warning once per process (e.g. "no postal address"), not once per email. */
export function warnOnce(key, msg) { if (warned.has(key)) return; warned.add(key); log('warn', msg); }

// ---- Who may get email, and at which address ----
const EMAIL_RE = /^[^\s@<>()",;:\\]+@[^\s@<>()",;:\\]+\.[A-Za-z]{2,}$/;
export const normEmail = e => { const s = String(e || '').trim(); return s.length <= 254 && EMAIL_RE.test(s) ? s : ''; };
/** A grown-up, a teacher or school staff, or the platform admin; never a guest, a banned account or a kid's. */
export function adultRecipient(u) {
  if (!u || u.is_guest || u.banned) return false;
  return u.role === 'admin' || isGrownup(u) || isStaff(u);
}
/** The address we may use for this account: Google's verified one first, else the one a trial checkout gave us.
 *  -> { email, source } or null. */
export function addressOf(userId) {
  const g = q.get("SELECT email FROM google_identities WHERE user_id=? AND email<>''", userId);
  if (g && normEmail(g.email)) return { email: normEmail(g.email), source: 'google' };
  const p = q.get("SELECT email, email_source FROM email_prefs WHERE user_id=? AND email<>''", userId);
  if (p && normEmail(p.email)) return { email: normEmail(p.email), source: p.email_source || 'checkout' };
  return null;
}
/** Keeps the address a trial's checkout gave us for this account (only for adults; a bad address is ignored). */
export function rememberAddress(userId, email, source = 'checkout') {
  const e = normEmail(email); if (!e) return false;
  const u = getUser(userId); if (!adultRecipient(u)) return false;
  q.run(`INSERT INTO email_prefs(user_id, email, email_source, updated_at) VALUES (?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET email=excluded.email, email_source=excluded.email_source, updated_at=excluded.updated_at`, userId, e, source, now());
  return true;
}
export const prefsOf = userId => q.get('SELECT * FROM email_prefs WHERE user_id=?', userId) || null;
export const nudgesOff = userId => !!prefsOf(userId)?.nudges_off_at;
export const digestOff = userId => !!prefsOf(userId)?.digest_off_at;
/** The weekly class summary off (off = true) or on again: only that email; nothing else changes. */
export function setDigestOff(userId, off = true) {
  q.run(`INSERT INTO email_prefs(user_id, digest_off_at, updated_at) VALUES (?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET digest_off_at=excluded.digest_off_at, updated_at=excluded.updated_at`, userId, off ? now() : null, now());
}
/** Unsubscribe (off = true) or subscribe again: trial nudges and any later marketing; transactional email is unaffected. */
export function setNudgesOff(userId, off = true) {
  q.run(`INSERT INTO email_prefs(user_id, nudges_off_at, updated_at) VALUES (?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET nudges_off_at=excluded.nudges_off_at, updated_at=excluded.updated_at`, userId, off ? now() : null, now());
}

// ---- Signed one-click unsubscribe links ----
// HMAC of the account id under the site secret, with its own label (it can't be mistaken for a session or any other
// signed value). It never expires: an unsubscribe link must keep working.
const unsubMac = userId => crypto.createHmac('sha256', secret()).update(`email-unsubscribe:v1:${userId}`).digest('base64url').slice(0, 32);
export const unsubToken = userId => `${userId}.${unsubMac(userId)}`;
/** A token -> the account id, or null when it isn't one we signed. */
export function readUnsubToken(t) {
  const s = String(t || ''); const i = s.lastIndexOf('.');
  if (i < 1 || s.length > 200) return null;
  const id = s.slice(0, i), mac = Buffer.from(s.slice(i + 1)), want = Buffer.from(unsubMac(id));
  return mac.length === want.length && crypto.timingSafeEqual(mac, want) ? id : null;
}
export const siteBase = () => config.publicUrl || 'https://oomba.ai';
export const UNSUBSCRIBE_PATH = '/email/unsubscribe';
/** The one-click link. scope 'digest': it stops only the weekly class summary (the same signed token; c only picks
 *  which switch the account's own link turns off). */
export const UNSUB_SCOPES = ['digest'];
export const unsubscribeUrl = (userId, scope = '') => `${siteBase()}${UNSUBSCRIBE_PATH}?t=${encodeURIComponent(unsubToken(userId))}${UNSUB_SCOPES.includes(scope) ? `&c=${scope}` : ''}`;

// ---- Sending ----
const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').slice(0, n);
const logRow = (r) => {
  q.run('INSERT INTO email_log(id, user_id, to_email, template, category, status, provider_id, error, idem_key, attempts, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    uid(14), r.userId || null, r.to || '', r.template, r.category, r.status, r.providerId || null, r.error ? clip(r.error, 200) : null, r.idemKey || null, r.attempts || 0, now());
};
// 409 concurrent_idempotent_requests: the same key is still being handled at Resend (another 409, a key reused with a
// different email, is not retried).
const retryable = (st, data) => st === 429 || st >= 500 || (st === 409 && data?.name === 'concurrent_idempotent_requests');

/**
 * Sends one email to an account.
 * { userId, template, category: 'nudge'|'transactional'|'digest'|'test', subject, html, text, idemKey, to? (test sends only) }
 * -> { status: 'sent'|'skipped'|'failed'|'off', reason?, id? }
 * 'off' (sending is off, or a nudge or digest while EMAIL_POSTAL_ADDRESS is empty) leaves no log row: the caller may try again
 * later. Every other outcome leaves one.
 */
export async function send({ userId, template, category, subject, html, text, idemKey, to = null }) {
  if (!sendingOn()) return { status: 'off', reason: config.resendApiKey ? 'disabled' : 'no_key' };
  // Everything but receipts and admin test sends (nudges, the weekly digest, any later kind) needs the postal address
  // (CAN-SPAM). The trial unsubscribe stops nudges; the weekly digest has its own switch (digest_off_at).
  const marketing = category !== 'transactional' && category !== 'test';
  if (marketing && !config.emailPostalAddress) {
    warnOnce('postal', 'Trial and summary emails are not sent: EMAIL_POSTAL_ADDRESS is not set (CAN-SPAM needs a postal address in their footer).');
    return { status: 'off', reason: 'no_postal_address' };
  }
  const base = { userId, template, category, idemKey };
  const u = getUser(userId);
  if (!adultRecipient(u)) { logRow({ ...base, status: 'skipped', error: 'not_adult' }); return { status: 'skipped', reason: 'not_adult' }; }
  if (category === 'nudge' && nudgesOff(userId)) { logRow({ ...base, status: 'skipped', error: 'unsubscribed' }); return { status: 'skipped', reason: 'unsubscribed' }; }
  if (category === 'digest' && digestOff(userId)) { logRow({ ...base, status: 'skipped', error: 'unsubscribed' }); return { status: 'skipped', reason: 'unsubscribed' }; }
  const address = to ? normEmail(to) : addressOf(userId)?.email;
  if (!address) { logRow({ ...base, status: 'skipped', error: 'no_address' }); log('info', 'email skipped: no address', { user: userId, template }); return { status: 'skipped', reason: 'no_address' }; }
  const unsub = unsubscribeUrl(userId, category === 'digest' ? 'digest' : '');
  const body = {
    from: config.emailFrom, to: [address], reply_to: config.emailReplyTo, subject, html, text,
    headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    tags: [{ name: 'template', value: String(template).replace(/[^A-Za-z0-9_-]/g, '_') }, { name: 'category', value: category }],
  };
  const key = idemKey || `${template}-${userId}-${uid(8)}`;
  let attempts = 0, last = '';
  for (;;) {
    attempts++;
    let st = 0, data = null;
    try {
      const r = await doFetch(RESEND_URL, { method: 'POST', headers: { Authorization: `Bearer ${config.resendApiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': key, 'User-Agent': 'oomba-academy' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
      st = r.status;
      try { data = await r.json(); } catch { data = null; }
    } catch (e) { last = `network: ${e?.name || 'error'}`; }
    if (st >= 200 && st < 300 && data && data.id) {
      logRow({ ...base, to: address, status: 'sent', providerId: String(data.id).slice(0, 80), idemKey: key, attempts });
      return { status: 'sent', id: data.id };
    }
    if (st) last = `HTTP ${st}${data?.name ? ` ${data.name}` : ''}${data?.message ? `: ${data.message}` : ''}`;
    if ((st && !retryable(st, data)) || attempts > BACKOFF_MS.length) break;
    await sleep(BACKOFF_MS[attempts - 1]);
  }
  logRow({ ...base, to: address, status: 'failed', error: last, idemKey: key, attempts });
  log('warn', 'email failed', { user: userId, template, error: clip(last, 200) });
  return { status: 'failed', reason: last };
}

/** Counts for the admin page: { sent, failed, skipped } since `since`, and by template. */
export function logCounts(since = now() - 30 * DAY) {
  const rows = q.all('SELECT template, status, COUNT(*) n FROM email_log WHERE created_at>=? GROUP BY template, status', since);
  const total = { sent: 0, failed: 0, skipped: 0 }, byTemplate = {};
  for (const r of rows) { total[r.status] = (total[r.status] || 0) + r.n; (byTemplate[r.template] ||= { sent: 0, failed: 0, skipped: 0 })[r.status] = r.n; }
  return { total, byTemplate };
}
export const recentLog = (n = 50) => q.all('SELECT * FROM email_log ORDER BY created_at DESC, rowid DESC LIMIT ?', n);
/** An address shown on the admin page: "g•••@oomba.ai". */
export const maskEmail = e => { const [a, d] = String(e || '').split('@'); return d ? `${a.slice(0, 1)}•••@${d}` : ''; };

/** The send log is kept a year. */
export const retention = () => q.run('DELETE FROM email_log WHERE created_at<?', now() - 365 * DAY).changes;
register('email-log-retention', DAY, () => retention(), { firstAfterMs: 19 * 60e3 });
