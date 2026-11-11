// Admin alerts by email (docs/decisions.md "Admin alerts by email"). When something needs the platform admin (a game
// waiting for review, a new account, a message to the Oomba team, a school request, a safety report, a billing problem),
// the code that made it calls alert(kind, { ref, summary, url }), which only adds one row to admin_alerts. A job every
// 10 minutes claims every waiting row and sends ONE summary email for all of them, grouped by kind with counts and up to
// LINES_PER_KIND lines each, every line linking to the admin page that handles it. A burst (500 sign-ups) is still one
// email per 10 minutes, with counts.
//
// PRIVACY (strict): the email never carries a message's text, a game's content, anyone's real name, an email address,
// an IP, or any student identifier beyond the public username. Accounts are described by account type and public
// username only ("@Kiddo12 (student)"). Game titles appear only for games sent for review (clipped to 60 characters and
// escaped: kids write them). Everything else is a kind, a count, a fixed reason word and a link. Rows hold only ids and
// short fixed notes: usernames and titles are read when the email is built, so a deleted account leaves nothing here.
//
// Sending (the same rules as services/nudges.js and services/digest.js): a batch row is claimed ('sending') before any
// send and its rendered email is stored, so a retry or a restart sends exactly the same email with the same
// Idempotency-Key per recipient (Resend keeps keys 24 hours): never twice. A batch whose send failed is tried again on
// the next runs, up to MAX_ATTEMPTS, then marked failed. One batch per run at most.
//
// Recipients: every platform admin account's known address (services/email.js addressOf), plus ADMIN_ALERTS_TO (comma
// list, the owner's explicit addresses), sent as that admin account. Category 'admin' in services/email.js refuses any
// account that is not role 'admin'. Internal ops mail: no postal address, no unsubscribe link; the switches on
// /admin/emails (all alerts, and each kind) and ADMIN_ALERTS=0 stop it. alert() never throws into its caller.
import crypto from 'node:crypto';
import { q, uid, now, tx, setting, audit } from '../db.js';
import { config } from '../config.js';
import { getUser, accountKind, onFirstSignIn, OFFICIAL } from '../auth.js';
import * as E from './email.js';
import { register } from './jobs.js';
import { log } from './log.js';
import { esc } from '../views/html.js';

const MIN = 60e3, H = 60 * MIN, DAY = 24 * H;
export const EVERY_MS = 10 * MIN;
/** A batch claimed this long ago with no answer (the server stopped mid-send) is sent again with the same keys... */
const RECLAIM_AFTER = 5 * MIN;
/** ...but only while Resend still remembers them: later it is marked failed rather than risk a second copy. */
const IDEM_WINDOW = 23 * H;
export const MAX_ATTEMPTS = 3;
/** Rows nobody could be emailed about for this long (no address known, sending off) are dropped, not sent late. */
const STALE_MS = 2 * DAY;
export const LINES_PER_KIND = 10;
const KEEP_MS = 90 * DAY;

const s = n => (n === 1 ? '' : 's');
/** The kinds, in the order the email lists them: what the switch says, the admin page, the count line. */
export const KINDS = {
  review: { label: 'Games sent for review', path: '/admin?tab=queue', count: n => `${n} game${s(n)} waiting for review` },
  signup: { label: 'New accounts', path: '/admin?tab=newusers&range=7d', count: n => `${n} new account${s(n)}` },
  message: { label: 'Messages to the Oomba team', path: '/admin?tab=messages', count: n => `${n} new message${s(n)} to the Oomba team` },
  school_request: { label: 'School set-up requests', path: '/admin?tab=schoolreq', count: n => `${n} school request${s(n)}` },
  report: { label: 'Safety reports (games, chat, live games, family links)', path: '/admin?tab=reports', count: n => `${n} new safety report${s(n)}` },
  billing: { label: 'Billing problems and invoice requests', path: '/admin/billing', count: n => `${n} billing event${s(n)} to look at` },
};
export const KIND_ORDER = Object.keys(KINDS);

// ---- Switches (/admin/emails): on unless switched off; ADMIN_ALERTS=0 overrides both ----
export const SWITCH_KEY = 'emails.admin_alerts';
const kindKey = k => `${SWITCH_KEY}.${k}`;
export const switchOn = () => setting(SWITCH_KEY) !== '0';
export const kindOn = k => setting(kindKey(k)) !== '0';
/** ADMIN_ALERTS=0: nothing is queued or sent, test included. */
export const killed = () => !config.adminAlerts;
/** Alerts are being queued and sent: not killed, switched on, and email sending is configured. */
export const active = () => !killed() && switchOn() && E.sendingOn();
export function setSwitch(admin, on) { setting(SWITCH_KEY, on ? '1' : '0'); audit(admin?.id, 'admin.emails.admin_alerts', SWITCH_KEY, { on: !!on }); return switchOn(); }
export function setKind(admin, kind, on) {
  if (!KINDS[kind]) return null;
  setting(kindKey(kind), on ? '1' : '0'); audit(admin?.id, 'admin.emails.admin_alerts', kindKey(kind), { on: !!on });
  return kindOn(kind);
}

const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
/** Only an admin page path (never an outside link): anything else falls back to the kind's own page. */
const safePath = (url, kind) => (/^\/admin(?:[/?#]|$)[^\s"'<>]*$/.test(String(url || '')) ? String(url).slice(0, 200) : KINDS[kind].path);

/**
 * Something needs the admin. kind: one of KINDS. ref: the id it is about (a game, an account, a request). summary: a
 * short FIXED note written by our code (a report reason, 'update'), never user text. url: the admin page path.
 * Never throws: an alert can never break the action that raised it. -> true when queued.
 */
export function alert(kind, { ref = null, summary = '', url = '' } = {}) {
  try {
    if (!KINDS[kind] || !active() || !kindOn(kind)) return false;
    q.run("INSERT INTO admin_alerts(id, kind, ref, summary, url, status, created_at) VALUES (?,?,?,?,?,'pending',?)",
      uid(14), kind, ref == null ? null : String(ref).slice(0, 80), clip(summary, 120), safePath(url, kind), now());
    return true;
  } catch (e) {
    log('warn', 'admin alert not queued', { kind, error: e?.message });
    return false;
  }
}

// A new account: told on its first sign-in ever (a sign-up, a guest who saved their account, a student's first sign-in
// with the card their teacher printed). Guests never are.
onFirstSignIn(u => { if (u && !u.is_guest && u.username !== OFFICIAL) alert('signup', { ref: u.id }); });

// ---- Who gets them ----
/** The addresses alerts go to: [{ userId (always an admin account), email, source }]. */
export function recipients() {
  const admins = q.all("SELECT id FROM users WHERE role='admin' AND is_guest=0 AND banned=0 AND username<>? ORDER BY created_at, id", OFFICIAL)
    .map(r => getUser(r.id)).filter(u => E.adultRecipient(u) && u.role === 'admin');
  const out = [], seen = new Set();
  const add = (userId, email, source) => { const k = email.toLowerCase(); if (seen.has(k)) return; seen.add(k); out.push({ userId, email, source }); };
  for (const u of admins) { const a = E.addressOf(u.id); if (a) add(u.id, a.email, a.source); }
  // ADMIN_ALERTS_TO: sent as the first admin account (with no admin account at all, nobody gets anything).
  if (admins.length) for (const e of config.adminAlertsTo || []) { const n = E.normEmail(e); if (n) add(admins[0].id, n, 'ADMIN_ALERTS_TO'); }
  return out;
}

// ---- What the email says ----
const TYPE = { student: 'student', staff: 'teacher', grownup: 'grown-up', standard: 'kid' };
const PLURAL = { student: 'students', teacher: 'teachers', 'grown-up': 'grown-ups', kid: 'kids', admin: 'admins' };
const typeOf = u => (u.role === 'admin' ? 'admin' : TYPE[accountKind(u)] || 'kid');
const gone = u => !u || /^(deleted|merged)_/i.test(u.username || '');
const ROLE_WORDS = { teacher: 'a teacher', leader: 'a school leader', it: 'school IT staff', district: 'a district', other: 'someone at a school' };
const userLine = (u, prefix = '') => (gone(u) ? `${prefix}an account that was since removed` : `${prefix}@${u.username} (${typeOf(u)})`);

/** One row -> { kind, text, url, type? }: public usernames and titles are read now. */
function itemOf(row) {
  const base = { kind: row.kind, url: row.url || KINDS[row.kind]?.path };
  if (row.kind === 'review') {
    const g = q.get('SELECT g.title, g.status, u.username FROM games g LEFT JOIN users u ON u.id=g.owner_id WHERE g.id=?', row.ref);
    if (!g || g.status === 'deleted') return { ...base, text: 'A game that was since deleted' };
    const title = clip(g.title, 60) || 'Untitled game';
    return { ...base, text: `"${title}"${g.username ? ` by @${g.username}` : ''}${row.summary === 'update' ? ' (an update)' : ''}` };
  }
  if (row.kind === 'signup') { const u = getUser(row.ref); return { ...base, text: userLine(u), type: gone(u) ? 'removed' : typeOf(u) }; }
  if (row.kind === 'message') {
    const u = getUser(row.ref);
    return { ...base, url: gone(u) ? KINDS.message.path : `/admin/messages/${encodeURIComponent(u.username)}`, text: userLine(u, 'From ') };
  }
  if (row.kind === 'school_request') return { ...base, text: `A request from ${ROLE_WORDS[row.summary] || 'someone at a school'}` };
  return { ...base, text: row.summary || KINDS[row.kind]?.label || row.kind };
}
export const itemsOf = rows => rows.filter(r => KINDS[r.kind]).map(itemOf);

/** The count line of a kind; new accounts also say how many of each type ("5 new accounts: 3 students, 1 teacher, 1 grown-up"). */
function countLine(kind, list) {
  const n = list.length;
  if (kind !== 'signup') return KINDS[kind].count(n);
  const by = {};
  for (const it of list) if (it.type && it.type !== 'removed') by[it.type] = (by[it.type] || 0) + 1;
  const parts = ['student', 'kid', 'teacher', 'grown-up', 'admin'].filter(t => by[t]).map(t => `${by[t]} ${by[t] === 1 ? t : PLURAL[t]}`);
  return `${KINDS.signup.count(n)}${parts.length ? `: ${parts.join(', ')}` : ''}`;
}
/** Items of one kind -> up to LINES_PER_KIND distinct lines ({ text, url, n }) and how many more. */
function linesOf(list) {
  const map = new Map();
  for (const it of list) { const k = `${it.text}\n${it.url}`; const e = map.get(k); if (e) e.n++; else map.set(k, { text: it.text, url: it.url, n: 1 }); }
  const all = [...map.values()];
  return { lines: all.slice(0, LINES_PER_KIND), more: Math.max(0, all.length - LINES_PER_KIND) };
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const P = `margin:0 0 12px;font-size:15px;line-height:1.5;color:#1f2937;font-family:${FONT}`;
/**
 * The summary email for a list of items. -> { subject, html, text, kinds: { kind: count }, items }
 * English only: it is for the platform admin, like the admin pages.
 */
export function renderEmail(items, { test = false, base = E.siteBase() } = {}) {
  const groups = KIND_ORDER.map(k => [k, items.filter(i => i.kind === k)]).filter(([, l]) => l.length);
  const kinds = Object.fromEntries(groups.map(([k, l]) => [k, l.length]));
  const heads = groups.map(([k, l]) => countLine(k, l));
  const short = groups.map(([k, l]) => KINDS[k].count(l.length));
  const subject = `${test ? '[Test] ' : ''}Oomba admin: ${short.slice(0, 2).join(', ')}${short.length > 2 ? ` and ${short.length - 2} more` : ''}`;
  const abs = p => `${base}${p}`;
  const textParts = ['Oomba Academy admin alerts', ...(test ? ['This is a test with made-up examples.'] : [])];
  const htmlParts = [];
  groups.forEach(([k, l], i) => {
    const { lines, more } = linesOf(l);
    const own = KINDS[k].path;
    const lineText = x => `${x.text}${x.n > 1 ? ` (${x.n})` : ''}`;
    textParts.push([heads[i], abs(own), ...lines.map(x => `  - ${lineText(x)}${x.url !== own ? `: ${abs(x.url)}` : ''}`), ...(more ? [`  - and ${more} more`] : [])].join('\n'));
    htmlParts.push(`<p style="${P};margin-top:20px;font-weight:700"><a href="${esc(abs(own))}" style="color:#2f6bff">${esc(heads[i])}</a></p>`
      + `<ul style="margin:0 0 12px;padding-left:22px;font-size:15px;line-height:1.5;color:#1f2937;font-family:${FONT}">`
      + lines.map(x => `<li style="margin:0 0 4px">${x.url !== own ? `<a href="${esc(abs(x.url))}" style="color:#2f6bff">${esc(lineText(x))}</a>` : esc(lineText(x))}</li>`).join('')
      + (more ? `<li style="margin:0 0 4px">and ${more} more</li>` : '') + '</ul>');
  });
  const foot = 'Internal alert for the Oomba Academy admins, sent at most every 10 minutes. It never includes message text, real names or addresses: open the admin page to see more.';
  const switches = abs('/admin/emails#e-alerts');
  textParts.push(`--\n${foot}\nSwitch these off, or one kind at a time: ${switches}`);
  const html = `<!doctype html>
<html lang="en" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${esc(subject)}</title>
<style>@media (prefers-color-scheme: dark) { .bg { background:#0f172a !important; } .card { background:#111827 !important; border-color:#374151 !important; }
  .card p, .card li { color:#e5e7eb !important; } .card a { color:#93c5fd !important; } .foot, .foot a { color:#9ca3af !important; } }</style></head>
<body style="margin:0;padding:0;background:#f3f4f6" class="bg">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg" style="background:#f3f4f6"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">
<tr><td class="card" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:24px">
<p style="${P};font-weight:700;color:#2f6bff">Oomba Academy admin alerts</p>
${test ? `<p style="${P}">This is a test with made-up examples.</p>` : ''}
${htmlParts.join('\n')}
</td></tr>
<tr><td class="foot" style="padding:16px 8px;font-size:13px;line-height:1.5;color:#6b7280;font-family:${FONT};text-align:center">${esc(foot)} <a href="${esc(switches)}" style="color:#6b7280;text-decoration:underline">Alert settings</a></td></tr>
</table></td></tr></table></body></html>`;
  return { subject, html, text: `${textParts.join('\n\n')}\n`, kinds };
}
/** Made-up items for the preview and the test send (no real account is named). */
export const sampleItems = () => [
  { kind: 'review', text: '"Space Cats Rescue" by @SampleKid', url: KINDS.review.path },
  { kind: 'review', text: '"Fraction Race" by @SampleTeacher (an update)', url: KINDS.review.path },
  ...[['student', 3], ['teacher', 1], ['grown-up', 1]].flatMap(([type, n]) => Array.from({ length: n }, (_, i) => ({ kind: 'signup', type, text: `@Sample${type === 'grown-up' ? 'Parent' : type[0].toUpperCase() + type.slice(1)}${i + 1} (${type})`, url: KINDS.signup.path }))),
  { kind: 'message', text: 'From @SampleParent1 (grown-up)', url: KINDS.message.path },
  { kind: 'school_request', text: 'A request from a teacher', url: KINDS.school_request.path },
  { kind: 'report', text: 'A game was reported (scary)', url: '/admin?tab=reports' },
  { kind: 'billing', text: 'A payment failed (teacher plan)', url: KINDS.billing.path },
];

// ---- Sending ----
const parse = (v, d) => { try { const x = JSON.parse(v); return x ?? d; } catch { return d; } };
const batchById = id => q.get('SELECT * FROM admin_alert_batches WHERE id=?', id) || null;
const hashOf = email => crypto.createHash('sha256').update(String(email).toLowerCase()).digest('hex').slice(0, 16);
/** A final state: the batch and its rows. The rendered email is dropped (it is kept only while it may be retried). */
function finish(b, status, error = null) {
  q.run('UPDATE admin_alert_batches SET status=?, error=?, sent_at=?, message=NULL WHERE id=?', status, error ? clip(error, 200) : null, status === 'sent' ? now() : null, b.id);
  q.run('UPDATE admin_alerts SET status=?, sent_at=? WHERE batch_id=?', status, status === 'sent' ? now() : null, b.id);
}
const claimAgain = (b, at) => q.run("UPDATE admin_alert_batches SET status='sending', claimed_at=?, attempts=attempts+1 WHERE id=? AND status=? AND IFNULL(claimed_at,0)=?",
  at, b.id, b.status, b.claimed_at ?? 0).changes === 1;

/** Sends a claimed batch to each recipient not done yet. -> 'sent' | 'skipped' | 'retry' | 'failed' | 'off' */
async function deliver(b) {
  let m = parse(b.message, null);
  if (!m || typeof m.subject !== 'string') {   // claimed but not rendered yet (a stop in between): render it now
    m = renderEmail(itemsOf(q.all('SELECT * FROM admin_alerts WHERE batch_id=? ORDER BY created_at, rowid', b.id)));
    q.run('UPDATE admin_alert_batches SET message=?, kinds=? WHERE id=?', JSON.stringify({ subject: m.subject, html: m.html, text: m.text }), JSON.stringify(m.kinds), b.id);
  }
  const to = parse(b.recipients, []);
  const done = parse(b.delivered, []);   // [{ h: hash of the address, s: 'sent'|'skipped' }]
  let failed = 0, last = '';
  for (const r of to) {
    const h = hashOf(r.email);
    if (done.some(d => d.h === h)) continue;
    const res = await E.send({ userId: r.userId, to: r.email, template: b.test ? 'admin_alerts_test' : 'admin_alerts', category: 'admin',
      subject: m.subject, html: m.html, text: m.text, idemKey: `admin-alerts-${b.id}-${h}` });
    if (res.status === 'sent' || res.status === 'skipped') {
      done.push({ h, s: res.status });
      q.run('UPDATE admin_alert_batches SET delivered=? WHERE id=?', JSON.stringify(done), b.id);
    } else if (res.status === 'off') {   // sending was switched off meanwhile: try again later, this try doesn't count
      q.run("UPDATE admin_alert_batches SET status='retry', attempts=MAX(0, attempts-1), error=? WHERE id=?", 'sending off', b.id);
      return 'off';
    } else { failed++; last = res.reason || 'failed'; }
  }
  if (!failed) { const any = done.some(d => d.s === 'sent'); finish(b, any ? 'sent' : 'skipped', any ? null : 'no recipient took it'); return any ? 'sent' : 'skipped'; }
  if (b.attempts >= MAX_ATTEMPTS) { finish(b, 'failed', last); log('warn', 'admin alerts: gave up on a batch', { batch: b.id, error: clip(last, 200) }); return 'failed'; }
  q.run("UPDATE admin_alert_batches SET status='retry', error=? WHERE id=?", clip(last, 200), b.id);
  return 'retry';
}

let lastRunAt = 0;
/** When the job looks next (ms), or null before its first run in this process. */
export const nextRunAt = () => (lastRunAt ? lastRunAt + EVERY_MS : null);

/** One run: a leftover batch (failed before, or stopped mid-send) if there is one, else one new batch of everything
 *  waiting. at: the time to judge by (tests). -> { status: 'idle'|'sent'|'skipped'|'retry'|'failed'|'off'|'no_recipient', batch, items } */
export async function runDue(at = now()) {
  lastRunAt = at;
  q.run("UPDATE admin_alerts SET status='expired' WHERE status='pending' AND created_at<?", at - STALE_MS);
  if (!active()) return { status: 'idle', batch: null, items: 0 };
  let b = q.get(`SELECT * FROM admin_alert_batches WHERE test=0 AND (status='retry' OR (status='sending' AND claimed_at<?))
    ORDER BY created_at, rowid LIMIT 1`, at - RECLAIM_AFTER);
  if (b) {
    if (b.created_at < at - IDEM_WINDOW) { finish(b, 'failed', 'unconfirmed'); return { status: 'failed', batch: b.id, items: b.items }; }
    if (!claimAgain(b, at)) return { status: 'idle', batch: null, items: 0 };
    b = batchById(b.id);
  } else {
    // One batch in flight at a time: another process (or this one before a restart) is still sending one.
    if (q.get("SELECT 1 FROM admin_alert_batches WHERE test=0 AND status='sending' LIMIT 1")) return { status: 'idle', batch: null, items: 0 };
    // A kind switched off after its rows were queued: those rows are not sent.
    for (const k of KIND_ORDER) if (!kindOn(k)) q.run("UPDATE admin_alerts SET status='skipped' WHERE status='pending' AND kind=?", k);
    if (!q.get("SELECT 1 FROM admin_alerts WHERE status='pending' LIMIT 1")) return { status: 'idle', batch: null, items: 0 };
    const to = recipients();
    if (!to.length) { E.warnOnce('admin-alerts-to', 'Admin alerts are not sent: no platform admin address is known (sign in with Google, or set ADMIN_ALERTS_TO).'); return { status: 'no_recipient', batch: null, items: 0 }; }
    // Claim every waiting row into one new batch, in one transaction: a second process finds nothing left to claim.
    b = tx(() => {
      const id = uid(14);
      const n = q.run("UPDATE admin_alerts SET status='batched', batch_id=? WHERE status='pending'", id).changes;
      if (!n) return null;
      q.run("INSERT INTO admin_alert_batches(id, status, items, recipients, attempts, claimed_at, created_at) VALUES (?,'sending',?,?,1,?,?)", id, n, JSON.stringify(to), at, at);
      return batchById(id);
    });
    if (!b) return { status: 'idle', batch: null, items: 0 };
    const m = renderEmail(itemsOf(q.all('SELECT * FROM admin_alerts WHERE batch_id=? ORDER BY created_at, rowid', b.id)));
    q.run('UPDATE admin_alert_batches SET message=?, kinds=? WHERE id=?', JSON.stringify({ subject: m.subject, html: m.html, text: m.text }), JSON.stringify(m.kinds), b.id);
    b = batchById(b.id);
  }
  return { status: await deliver(b), batch: b.id, items: b.items };
}
register('admin-alerts', EVERY_MS, () => runDue());

/** The "Send a test alert" button: made-up examples to every address alerts would use, now. Works while the switch is
 *  off (to check the address before switching on), never with ADMIN_ALERTS=0. -> { ok, code?, sent?, to? } */
export async function sendTest(admin) {
  if (killed()) return { ok: false, code: 'killed' };
  if (!E.sendingOn()) return { ok: false, code: 'off' };
  const to = recipients();
  if (!to.length) return { ok: false, code: 'no_recipient' };
  const m = renderEmail(sampleItems(), { test: true });
  const id = uid(14), at = now();
  q.run("INSERT INTO admin_alert_batches(id, status, test, items, kinds, recipients, message, attempts, claimed_at, created_at) VALUES (?,'sending',1,0,?,?,?,1,?,?)",
    id, JSON.stringify(m.kinds), JSON.stringify(to), JSON.stringify({ subject: m.subject, html: m.html, text: m.text }), at, at);
  const st = await deliver(batchById(id));
  // A test is never retried by the job.
  if (st === 'retry' || st === 'off') finish(batchById(id), 'failed', batchById(id)?.error || st);
  audit(admin?.id, 'admin.emails.test', 'admin_alerts', { status: st });
  return { ok: st === 'sent', code: st, to: to.map(r => r.email) };
}

// ---- For /admin/emails ----
export function overview() {
  const kinds = KIND_ORDER.map(k => ({ kind: k, label: KINDS[k].label, on: kindOn(k) }));
  const waiting = q.get("SELECT COUNT(*) n FROM admin_alerts WHERE status IN ('pending','batched') AND (batch_id IS NULL OR batch_id IN (SELECT id FROM admin_alert_batches WHERE status IN ('sending','retry')))").n;
  const batches = q.all('SELECT id, status, test, items, kinds, recipients, delivered, attempts, error, created_at, sent_at FROM admin_alert_batches ORDER BY created_at DESC, rowid DESC LIMIT 8')
    .map(b => ({ ...b, kinds: parse(b.kinds, {}), recipients: parse(b.recipients, []).length, delivered: parse(b.delivered, []).filter(d => d.s === 'sent').length }));
  return { killed: killed(), on: switchOn(), sending: E.sendingOn(), active: active(), kinds, recipients: recipients(), waiting, nextAt: nextRunAt(), batches };
}

/** Rows and batches are kept 90 days (counts and ids only). */
export function retention(at = now()) {
  const a = q.run("DELETE FROM admin_alerts WHERE created_at<? AND status NOT IN ('pending','batched')", at - KEEP_MS).changes;
  const b = q.run("DELETE FROM admin_alert_batches WHERE created_at<? AND (test=1 OR status NOT IN ('sending','retry'))", at - KEEP_MS).changes;
  return a + b;
}
register('admin-alerts-retention', DAY, () => retention(), { firstAfterMs: 29 * MIN });
