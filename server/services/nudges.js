// The Teacher plan trial emails (docs/decisions.md "Trial emails"). The billing side calls three functions and knows
// nothing else about email:
//   onTrialStarted({ userId, trialEnd, trialStart?, email? })  a trial began (email: the checkout's, if we have one)
//   onTrialConverted(userId)                                   it will be paid (a card was added, or it became active)
//   onTrialEnded(userId)                                       it ended without converting
// Each is idempotent (Stripe redelivers webhooks) and never throws into the caller.
//
// The sequence, from the trial's start (one row per email in trial_nudges, with due_at and latest_at):
//   welcome  at once                     class  day 2 (skipped if they already have a class)
//   ideas    day 5                       ending 3 days before the trial ends
//   ended    when the trial ended unconverted        thanks  on conversion (the rest is canceled)
// A job checks every 15 minutes (and right after each event). A row is claimed (status 'sending') before it is sent
// and marked 'sent' after, and every send of a row uses the same Idempotency-Key, so a restart never sends one twice.
// After downtime a late email still goes, but never after its latest_at: 24 hours for the date-sensitive ones (class
// says "tomorrow", ending names the date, ended), longer for the others. A row past it is skipped ('too_late').
import { q, now, setting, audit } from '../db.js';
import { getUser } from '../auth.js';
import { log } from './log.js';
import { register, job, runJob } from './jobs.js';
import * as E from './email.js';
import { staffName } from './schools.js';
import { renderTrial, firstNameOf, TRIAL_STEPS } from './email-templates.js';
export { TRIAL_STEPS };

const H = 3600e3, DAY = 24 * H;
/** When each email of the sequence is due (from the trial row) and how late it may still go. */
export const PLAN = {
  welcome: { due: t => t.trial_start, late: 2 * DAY },
  class: { due: t => t.trial_start + 2 * DAY, late: DAY },
  ideas: { due: t => t.trial_start + 5 * DAY, late: 2 * DAY },
  // Two hours after Stripe's trial_will_end (sent 3 days before the end): its sync tells us first when a card was
  // added during the trial, so a teacher who already stays never gets "add a card".
  ending: { due: t => t.trial_end - 3 * DAY + 2 * H, late: DAY },
};
const ENDED_LATE = DAY, THANKS_LATE = 3 * DAY;
/** The thank-you is about a purchase (transactional): it goes even to someone who unsubscribed from the nudges. */
export const CATEGORY = { welcome: 'nudge', class: 'nudge', ideas: 'nudge', ending: 'nudge', ended: 'nudge', thanks: 'transactional' };
/** A row claimed this long ago without an answer (the server stopped mid-send) is tried again with the same key... */
const RECLAIM_AFTER = 10 * 60e3;
/** ...but only while Resend still remembers the key (24 hours): later, it is marked failed rather than risk a second copy. */
const IDEM_WINDOW = 23 * H;
const MAX_ATTEMPTS = 5;
export const EVERY_MS = 15 * 60e3;

// ---- The admin's switch (/admin/emails): on unless switched off. Off: nothing is sent; due rows wait (late rules apply). ----
export const SWITCH_KEY = 'emails.trial_nudges';
export const switchOn = () => setting(SWITCH_KEY) !== '0';
export function setSwitch(admin, on) { setting(SWITCH_KEY, on ? '1' : '0'); audit(admin?.id, 'admin.emails.nudges', SWITCH_KEY, { on: !!on }); return switchOn(); }

const trialOf = userId => q.get('SELECT * FROM trial_emails WHERE user_id=?', userId) || null;
const addRow = (userId, step, due, late) => q.run(`INSERT INTO trial_nudges(user_id, step, due_at, latest_at, status, created_at) VALUES (?,?,?,?,'pending',?)
  ON CONFLICT(user_id, step) DO NOTHING`, userId, step, due, due + late, now());
/** A teacher who has a class now (one they teach or made, not archived). */
export const hasClass = userId => !!q.get(`SELECT 1 FROM class_members m JOIN classrooms c ON c.id=m.class_id WHERE m.user_id=? AND m.role='teacher' AND m.status='active' AND c.archived_at IS NULL
  UNION ALL SELECT 1 FROM classrooms WHERE created_by=? AND archived_at IS NULL LIMIT 1`, userId, userId);

// Events run the job soon, so the welcome goes "at once" rather than at the next 15-minute turn. Tests turn it off.
export const _opts = { kick: true };
function kick() { if (!_opts.kick) return; const j = job('trial-nudges'); if (j) setTimeout(() => { runJob(j); }, 50).unref(); }
const safe = (name, fn) => (...a) => { try { return fn(...a); } catch (e) { log('error', 'trial email event failed', { event: name, error: e?.message }); return { ok: false, reason: 'error' }; } };

/** A trial started. trialEnd / trialStart: ms (Stripe's seconds are fine too). Only the first trial of an account gets
 *  the sequence. -> { ok, reason? } */
export const onTrialStarted = safe('started', ({ userId, trialEnd, trialStart = now(), email = '' } = {}) => {
  const ms = t => (t && t < 1e11 ? t * 1000 : t);
  const start = ms(trialStart) || now(), end = ms(trialEnd);
  const u = getUser(userId);
  if (!E.adultRecipient(u)) { log('warn', 'trial emails: not an adult account', { user: userId }); return { ok: false, reason: 'not_adult' }; }
  if (!end || end <= start) return { ok: false, reason: 'bad_dates' };
  if (email) E.rememberAddress(userId, email, 'checkout');
  if (trialOf(userId)) return { ok: true, reason: 'already' };
  q.run("INSERT INTO trial_emails(user_id, trial_start, trial_end, state, created_at) VALUES (?,?,?,'trialing',?) ON CONFLICT(user_id) DO NOTHING", userId, start, end, now());
  const t = trialOf(userId);
  for (const [step, p] of Object.entries(PLAN)) {
    const due = p.due(t);
    // A short trial: day 2 and day 5 only if they come before "ends in 3 days", and that one only if it is after the start.
    if ((step === 'class' || step === 'ideas') && due >= PLAN.ending.due(t)) continue;
    if (step === 'ending' && due <= t.trial_start) continue;
    addRow(userId, step, due, p.late);
  }
  kick();
  return { ok: true };
});

/** The trial will be paid: stop the sequence and say thank you (once). */
export const onTrialConverted = safe('converted', (userId) => {
  const t = trialOf(userId);
  if (!t) return { ok: false, reason: 'no_trial' };
  if (t.state === 'converted') return { ok: true, reason: 'already' };
  q.run("UPDATE trial_emails SET state='converted', converted_at=? WHERE user_id=?", now(), userId);
  q.run("UPDATE trial_nudges SET status='canceled', reason='converted' WHERE user_id=? AND status IN ('pending','failed')", userId);
  addRow(userId, 'thanks', now(), THANKS_LATE);
  kick();
  return { ok: true };
});

/** The trial ended without converting: the rest of the sequence stops and "Your trial has ended" goes. */
export const onTrialEnded = safe('ended', (userId) => {
  const t = trialOf(userId);
  if (!t) return { ok: false, reason: 'no_trial' };
  if (t.state !== 'trialing') return { ok: true, reason: t.state };
  q.run("UPDATE trial_emails SET state='ended', ended_at=? WHERE user_id=?", now(), userId);
  q.run("UPDATE trial_nudges SET status='canceled', reason='trial_ended' WHERE user_id=? AND status IN ('pending','failed')", userId);
  addRow(userId, 'ended', now(), ENDED_LATE);
  kick();
  return { ok: true };
});

/** Why a due row must not go now (null: it may). */
function skipReason(row, t, at) {
  if (!t) return 'no_trial';
  if (at > row.latest_at) return 'too_late';
  if (row.step === 'thanks') return t.state === 'converted' ? null : 'not_converted';
  if (row.step === 'ended') return t.state === 'ended' ? null : 'not_ended';
  if (t.state !== 'trialing') return t.state;
  if (row.step === 'class' && hasClass(row.user_id)) return 'has_class';
  return null;
}
/** The email for one row, rendered for its teacher. */
export function renderFor(step, u, t) {
  return renderTrial(step, { locale: u?.lang || 'en', firstName: firstNameOf(u, u?.id ? staffName(u) : ''), trialStart: t?.trial_start, trialEnd: t?.trial_end, base: E.siteBase(),
    unsubscribeUrl: E.unsubscribeUrl(u?.id || ''), postalAddress: E.emailStatus().postalAddress });
}
const mark = (row, status, extra = {}) => q.run('UPDATE trial_nudges SET status=?, reason=?, sent_at=?, claimed_at=? WHERE user_id=? AND step=?',
  status, extra.reason ?? null, extra.sentAt ?? null, extra.claimedAt ?? null, row.user_id, row.step);

/** Sends what is due. at: the time to judge by (tests). -> { sent, skipped, failed, waiting } */
export async function runDue(at = now()) {
  const out = { sent: 0, skipped: 0, failed: 0, waiting: 0 };
  if (!switchOn() || !E.sendingOn()) return out;
  const rows = q.all(`SELECT * FROM trial_nudges WHERE (status='pending' AND due_at<=?) OR (status='sending' AND claimed_at<?)
    ORDER BY due_at LIMIT 200`, at, at - RECLAIM_AFTER);
  for (const row of rows) {
    if (row.status === 'sending' && row.claimed_at < at - IDEM_WINDOW) { mark(row, 'failed', { reason: 'unconfirmed' }); out.failed++; continue; }
    const t = trialOf(row.user_id);
    const why = skipReason(row, t, at);
    if (why) { mark(row, why === 'too_late' || why === 'has_class' ? 'skipped' : 'canceled', { reason: why }); out.skipped++; continue; }
    const category = CATEGORY[row.step];
    if (category === 'nudge' && !E.nudgesAllowed()) {   // no postal address yet: wait (the late rule still applies)
      E.warnOnce('postal', 'Trial emails are not sent: EMAIL_POSTAL_ADDRESS is not set (CAN-SPAM needs a postal address in their footer).');
      out.waiting++; continue;
    }
    // Claim it first: only the run that flips the row sends it.
    const claimed = q.run("UPDATE trial_nudges SET status='sending', claimed_at=?, attempts=attempts+1 WHERE user_id=? AND step=? AND status=? AND IFNULL(claimed_at, 0)=?",
      at, row.user_id, row.step, row.status, row.claimed_at ?? 0).changes;
    if (!claimed) continue;
    const u = getUser(row.user_id);
    const m = renderFor(row.step, u, t);
    const r = await E.send({ userId: row.user_id, template: `trial_${row.step}`, category, subject: m.subject, html: m.html, text: m.text, idemKey: `trial-${row.user_id}-${row.step}` });
    if (r.status === 'sent') { mark(row, 'sent', { sentAt: now(), claimedAt: at }); out.sent++; }
    else if (r.status === 'skipped') { mark(row, 'skipped', { reason: r.reason }); out.skipped++; }
    else if (r.status === 'off') { mark(row, 'pending', { reason: r.reason }); out.waiting++; }
    else if (row.attempts + 1 >= MAX_ATTEMPTS) { mark(row, 'failed', { reason: 'gave_up' }); out.failed++; }
    else { mark(row, 'pending', { reason: 'retry' }); out.failed++; }
  }
  return out;
}
register('trial-nudges', EVERY_MS, () => runDue(), { firstAfterMs: 90e3 });

/** For /admin/emails: rows per step and status. */
export function sequenceCounts() {
  const out = {};
  for (const r of q.all('SELECT step, status, COUNT(*) n FROM trial_nudges GROUP BY step, status')) (out[r.step] ||= {})[r.status] = r.n;
  return out;
}
