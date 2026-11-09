// The weekly class summary email (docs/decisions.md "Weekly class summary email"). Once a week, at the day and hour a
// teacher picks (default Monday 7:00 in their school's time zone), each teacher with an address we may use gets one
// email with counts per class they teach: lessons due this week, % of the work done, answers waiting for review,
// students who haven't started, live games played. Never a student's name or answer: those stay on the site, on
// "See this week's summary" (/teach/summary), which only the teacher can open. Classes with nothing going on are left
// out, and a week with nothing in any class sends nothing.
//
// Sending: a job every 15 minutes looks at each teacher's slot for the current week. The first run after the slot
// claims a digest_sends row (teacher, week) before sending and marks it after; every send of that row uses the same
// Idempotency-Key, so a restart or a second process never sends a week twice. After downtime a late summary still
// goes up to LATE_MS after its slot, never later (it would read as last week's). Its own off switch (the email's
// "Stop these summaries" link, the Me page) and the admin's switch on /admin/emails.
import { q, now, setting, audit } from '../db.js';
import { getUser } from '../auth.js';
import { register } from './jobs.js';
import * as E from './email.js';
import * as S from './schools.js';
import * as L from './lessons.js';
import * as P from './progress.js';
import { renderDigest } from './digest-email.js';

const H = 3600e3, DAY = 24 * H, WEEK = 7 * DAY;
export const DEFAULTS = Object.freeze({ day: 1, hour: 7 });
/** Without a school time zone or a choice of their own (most teachers are in the US). */
export const FALLBACK_TZ = 'America/New_York';
/** How late a summary may still go after its slot (downtime, a deploy). */
export const LATE_MS = 12 * H;
const RECLAIM_AFTER = 10 * 60e3;
const IDEM_WINDOW = 23 * H;
const MAX_ATTEMPTS = 5;
export const EVERY_MS = 15 * 60e3;

// ---- The admin's switch (/admin/emails): on unless switched off ----
export const SWITCH_KEY = 'emails.class_digest';
export const switchOn = () => setting(SWITCH_KEY) !== '0';
export function setSwitch(admin, on) { setting(SWITCH_KEY, on ? '1' : '0'); audit(admin?.id, 'admin.emails.digest', SWITCH_KEY, { on: !!on }); return switchOn(); }

// ---- Clocks in a time zone ----
const dtfs = new Map();
const dtf = tz => { let f = dtfs.get(tz); if (!f) { f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric' }); dtfs.set(tz, f); } return f; };
/** The zone's calendar day at t (as its 00:00 UTC value, like lesson due dates) and the hour there. */
export function wall(tz, t) {
  const p = {}; for (const x of dtf(tz).formatToParts(new Date(t))) if (x.type !== 'literal') p[x.type] = +x.value;
  return { day: Date.UTC(p.year, p.month - 1, p.day), hour: p.hour % 24 };
}
/** The instant a stored day's hour starts in a zone (the hour moved when the clocks changed earlier that day). */
export function instantOf(day, hour, tz) {
  let at = L.dayBounds(day, tz).start + hour * H;
  const h = wall(tz, at).hour; if (h !== hour) at += (hour - h) * H;
  return at;
}
const isoDay = d => new Date(d).toISOString().slice(0, 10);

// ---- A teacher's choice ----
/** Is this account a teacher who may get the summary (school staff who teaches a class)? */
export const teachesAClass = userId => !!q.get(`SELECT 1 FROM class_members m JOIN classrooms c ON c.id=m.class_id
  WHERE m.user_id=? AND m.role='teacher' AND m.status='active' AND c.archived_at IS NULL LIMIT 1`, userId);
/** Their school's time zone: the first school they are staff of that has one. */
export function schoolZone(userId) {
  for (const s of S.schoolsOf(userId)) if (s.role !== 'student') { const z = S.zoneOf(s); if (z) return z; }
  return null;
}
/** { on, day, hour, tz (their own choice or ''), zone (the one used), zoneFrom: 'mine'|'school'|'default' } */
export function prefsOf(userId) {
  const p = E.prefsOf(userId) || {};
  const day = Number.isInteger(p.digest_day) && p.digest_day >= 0 && p.digest_day <= 6 ? p.digest_day : DEFAULTS.day;
  const hour = Number.isInteger(p.digest_hour) && p.digest_hour >= 0 && p.digest_hour <= 23 ? p.digest_hour : DEFAULTS.hour;
  const tz = S.isZone(p.digest_tz) ? p.digest_tz : '';
  const school = tz ? null : schoolZone(userId);
  return { on: !p.digest_off_at, day, hour, tz, zone: tz || school || FALLBACK_TZ, zoneFrom: tz ? 'mine' : school ? 'school' : 'default' };
}
/** Saves the teacher's choice: { on, day, hour, tz } (each optional; tz '' = their school's). -> { ok, code? } */
export function savePrefs(userId, { on, day, hour, tz } = {}) {
  const set = {};
  if (day !== undefined) { const d = Number(day); if (!Number.isInteger(d) || d < 0 || d > 6) return { ok: false, code: 'badDay' }; set.digest_day = d; }
  if (hour !== undefined) { const h = Number(hour); if (!Number.isInteger(h) || h < 0 || h > 23) return { ok: false, code: 'badHour' }; set.digest_hour = h; }
  if (tz !== undefined) { const z = String(tz || ''); if (z && !S.isZone(z)) return { ok: false, code: 'badZone' }; set.digest_tz = z; }
  q.run('INSERT INTO email_prefs(user_id, updated_at) VALUES (?,?) ON CONFLICT(user_id) DO NOTHING', userId, now());
  for (const [k, v] of Object.entries(set)) q.run(`UPDATE email_prefs SET ${k}=?, updated_at=? WHERE user_id=?`, v, now(), userId);
  if (on !== undefined && !!on === E.digestOff(userId)) E.setDigestOff(userId, !on);
  return { ok: true };
}
/** This week's slot for a teacher at instant t: the latest send time at or before t.
 *  -> { week: 'YYYY-MM-DD' (its local date), day (that date at 00:00 UTC), at (ms), next (next week's slot, ms) } */
export function slotFor(p, t = now()) {
  const tz = p.zone || FALLBACK_TZ;
  const today = wall(tz, t).day;
  let d = today - ((new Date(today).getUTCDay() - p.day + 7) % 7) * DAY;
  let at = instantOf(d, p.hour, tz);
  if (at > t) { d -= WEEK; at = instantOf(d, p.hour, tz); }
  return { week: isoDay(d), day: d, at, next: instantOf(d + WEEK, p.hour, tz) };
}

// ---- What a class did ----
const nameOf = r => r.roster_name || r.display_name;
/** One class's week at instant t (zone: the teacher's): counts, and with names (the site page only) who hasn't started
 *  and the lessons due. The email uses the counts alone. */
export function classSummary(c, t = now(), zone = FALLBACK_TZ, { names = false } = {}) {
  const gb = P.classProgress(c.id, t);
  const today = wall(zone, t).day;
  const due = gb.lessons.map((cl, i) => ({ cl, i })).filter(({ cl }) => cl.due_at && cl.due_at >= today && cl.due_at < today + WEEK);
  let done = 0, total = 0;
  const notStarted = [];
  const openWork = gb.lessons.some(cl => !cl.locked && cl.steps > 0);
  for (const p of gb.students) {
    let started = false;
    for (const x of p.cells) { if (x.locked) continue; total += x.total; done += Math.min(x.done, x.total); if (x.done || x.last) started = true; }
    if (openWork && !started) notStarted.push(p);
  }
  const toRead = P.toReadByClass([c.id])[c.id] || 0;
  const live = q.get('SELECT COUNT(*) n FROM live_runs WHERE class_id=? AND ended_at>=? AND ended_at<=?', c.id, t - WEEK, t).n;
  const recent = q.get(`SELECT COUNT(*) n FROM step_progress p JOIN class_lessons cl ON cl.id=p.class_lesson_id AND cl.removed_at IS NULL
    WHERE cl.class_id=? AND p.updated_at>=? AND p.updated_at<=?`, c.id, t - WEEK, t).n;
  const out = {
    id: c.id, name: c.name, school: c.school_name || '', students: gb.students.length,
    due: due.length, pct: total ? Math.round((100 * done) / total) : null, toRead, notStarted: notStarted.length, live, recent,
    active: recent > 0 || live > 0 || toRead > 0 || due.length > 0,
  };
  if (names) {
    out.notStartedNames = notStarted.map(nameOf);
    out.dueLessons = due.map(({ cl, i }) => ({ id: cl.id, title: cl.title, due_at: cl.due_at, finished: gb.students.filter(p => p.cells[i].total && p.cells[i].done >= p.cells[i].total).length }));
    out.toReadLessons = toRead ? P.toReadByLesson(c.id) : [];
  }
  return out;
}
/** A teacher's whole summary at t: { prefs, classes (all they teach), active, quiet }. */
export function summaryFor(u, t = now(), { names = false } = {}) {
  const p = prefsOf(u.id);
  const classes = S.classesOf(u.id, 'teacher').map(c => classSummary(c, t, p.zone, { names }));
  return { prefs: p, classes, active: classes.filter(c => c.active), quiet: classes.filter(c => !c.active) };
}

// ---- Sending ----
const rowOf = (userId, week) => q.get('SELECT * FROM digest_sends WHERE user_id=? AND week=?', userId, week) || null;
const mark = (userId, week, status, extra = {}) => q.run('UPDATE digest_sends SET status=?, reason=?, sent_at=?, classes=COALESCE(?, classes) WHERE user_id=? AND week=?',
  status, extra.reason ?? null, extra.sentAt ?? null, extra.classes ?? null, userId, week);
/** Teachers to look at: active staff who teach a class that isn't archived. */
const teacherIds = () => q.all(`SELECT DISTINCT m.user_id id FROM class_members m JOIN classrooms c ON c.id=m.class_id
  JOIN school_members sm ON sm.user_id=m.user_id AND sm.school_id=c.school_id AND sm.status='active' AND sm.role!='student'
  WHERE m.role='teacher' AND m.status='active' AND c.archived_at IS NULL`).map(r => r.id);

/** Claims this week's row for one teacher: true when this run may send it. */
function claim(userId, slot, at) {
  const r = rowOf(userId, slot.week);
  if (!r) return q.run("INSERT INTO digest_sends(user_id, week, slot_at, status, attempts, claimed_at, created_at) VALUES (?,?,?,'sending',1,?,?) ON CONFLICT(user_id, week) DO NOTHING",
    userId, slot.week, slot.at, at, now()).changes === 1;
  const retry = r.status === 'pending' || (r.status === 'sending' && r.claimed_at < at - RECLAIM_AFTER);
  if (!retry) return false;
  if (r.status === 'sending' && r.claimed_at < at - IDEM_WINDOW) { mark(userId, slot.week, 'failed', { reason: 'unconfirmed' }); return false; }
  return q.run("UPDATE digest_sends SET status='sending', claimed_at=?, attempts=attempts+1 WHERE user_id=? AND week=? AND status=? AND IFNULL(claimed_at,0)=?",
    at, userId, slot.week, r.status, r.claimed_at ?? 0).changes === 1;
}

/** Sends the summaries that are due. at: the time to judge by (tests). -> { sent, skipped, failed, waiting } */
export async function runDue(at = now()) {
  const out = { sent: 0, skipped: 0, failed: 0, waiting: 0 };
  if (!switchOn() || !E.sendingOn()) return out;
  for (const id of teacherIds()) {
    const u = getUser(id);
    if (!E.adultRecipient(u) || !S.isStaff(u)) continue;
    const p = prefsOf(id);
    if (!p.on) continue;
    const slot = slotFor(p, at);
    if (at - slot.at > LATE_MS) continue;
    if (!claim(id, slot, at)) continue;
    const row = rowOf(id, slot.week);
    if (!E.addressOf(id)) { mark(id, slot.week, 'skipped', { reason: 'no_address' }); out.skipped++; continue; }
    const sum = summaryFor(u, at);
    if (!sum.active.length) { mark(id, slot.week, 'skipped', { reason: 'empty', classes: 0 }); out.skipped++; continue; }
    const m = renderDigest(u, sum, slot);
    const r = await E.send({ userId: id, template: 'class_digest', category: 'digest', subject: m.subject, html: m.html, text: m.text, idemKey: `digest-${id}-${slot.week}` });
    if (r.status === 'sent') { mark(id, slot.week, 'sent', { sentAt: now(), classes: sum.active.length }); out.sent++; }
    else if (r.status === 'skipped') { mark(id, slot.week, 'skipped', { reason: r.reason }); out.skipped++; }
    else if (r.status === 'off') { mark(id, slot.week, 'pending', { reason: r.reason }); out.waiting++; }
    else if ((row?.attempts || 1) >= MAX_ATTEMPTS) { mark(id, slot.week, 'failed', { reason: 'gave_up' }); out.failed++; }
    else { mark(id, slot.week, 'pending', { reason: 'retry' }); out.failed++; }
  }
  return out;
}
register('class-digest', EVERY_MS, () => runDue(), { firstAfterMs: 2 * 60e3 });

/** For /admin/emails: summaries by status in the last 30 days, and why the skipped ones were skipped. */
export function sendCounts(since = now() - 30 * DAY) {
  const out = { status: {}, reasons: {} };
  for (const r of q.all('SELECT status, reason, COUNT(*) n FROM digest_sends WHERE created_at>=? GROUP BY status, reason', since)) {
    out.status[r.status] = (out.status[r.status] || 0) + r.n;
    if (r.status === 'skipped' && r.reason) out.reasons[r.reason] = (out.reasons[r.reason] || 0) + r.n;
  }
  return out;
}
/** Rows are kept six months (counts only). */
export const retention = () => q.run('DELETE FROM digest_sends WHERE created_at<?', now() - 182 * DAY).changes;
register('class-digest-retention', DAY, () => retention(), { firstAfterMs: 23 * 60e3 });
