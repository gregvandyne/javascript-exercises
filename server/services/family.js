// Families: grown-up accounts and the children linked to them (docs/decisions.md "Paid plans", chunk 3). No payments
// here: a family is the owner a family plan will belong to (services/billing.js owner registry).
//
// Linking, step by step (every step is audited, with ids only):
//   1. The child (an own account: not a guest, not a school account, not staff) gets a code on /me. Shape K7Q-4MZ9:
//      7 characters from an alphabet without look-alikes (no 0 O 1 I L), at least one digit. Only an HMAC of it is
//      stored. Valid CODE_TTL (1 hour), single use, one open code per child (a new one ends the old one).
//   2. A signed-in grown-up types it on /family/link: a 'pending' row (family.link.request). The code is used up.
//   3. The child answers on /me: Yes (linked), No (the row goes) or Report (no link, a link_reports row for the admin).
//      A pending request ends by itself after PENDING_TTL (24 hours).
//   4. Either side can unlink at any time; a child's Report on a link unlinks it at once.
// The child only ever sees the fixed words "your grown-up", never a name the adult typed. The grown-up sees a child's
// name only after the child said yes, and never today's activity, school-charged messages or anything about school.
// With billing off (no STRIPE_API_KEY) none of this is shown or reachable, but grown-up accounts stay grown-ups.
import crypto from 'node:crypto';
import { q, tx, uid, now, audit, today } from '../db.js';
import { config } from '../config.js';
import { sign, accountKind, getUser, isGrownup } from '../auth.js';
import { billingOn } from './stripe.js';
import { registerOwnerKind, ownerPlan } from './billing.js';
import { register } from './jobs.js';
import { foldDigits } from './textfilter.js';

const DAY = 86400e3;
export const CODE_TTL = 3600e3;
export const PENDING_TTL = DAY;
/** How long rows are kept (the privacy text lists these). */
export const KEEP = { codes: 30 * DAY, unlinked: 90 * DAY, reports: 365 * DAY };
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CLASS = 'A-HJKMNP-Z2-9';

/** Families (and so grown-up sign-up, the /me panel and every family route) are on exactly when billing is. */
export const familiesOn = () => billingOn();

const fail = code => ({ ok: false, code });
const ok = (v = {}) => ({ ok: true, ...v });

// ---------------------------------------------------------------- codes
/** A new code like K7Q-4MZ9. */
export function newCodeText() {
  for (;;) {
    const s = Array.from({ length: 7 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('');
    if (/[2-9]/.test(s)) return `${s.slice(0, 3)}-${s.slice(3)}`;
  }
}
/** What a person typed, as the 7 characters of a code (spaces, dashes and case don't matter). */
export const normLinkCode = s => String(s ?? '').normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const isCodeShape = c => new RegExp(`^[${CLASS}]{7}$`).test(c) && /[2-9]/.test(c);
// Keyed with the session secret, so a copy of the database alone can't be searched for codes.
const hashCode = c => sign(`family-link:${c}`);

/** Does a chat message carry something shaped like a link code ("K7Q-4MZ9", "k7q 4mz9", "K7Q4MZ9")? Only runs of
 *  exactly 3 + 4 characters from the code alphabet with a digit in them count, so ordinary words (which almost always
 *  have an O, I or L, or no digit) pass. Used by services/chat.js. */
export function looksLikeLinkCode(text) {
  const s = foldDigits(String(text ?? '').normalize('NFKC'));
  const re = new RegExp(`(?<![\\p{L}\\p{N}])([${CLASS}]{3})[\\s._\\-]{0,2}([${CLASS}]{4})(?![\\p{L}\\p{N}])`, 'giu');
  for (const m of s.matchAll(re)) if (/[2-9]/.test(m[1] + m[2])) return true;
  return false;
}

// ---------------------------------------------------------------- who is who
/** An account that can be linked to a family: an own kid account (not a guest, a school account, staff, the platform
 *  admin or a grown-up), not banned. */
export const isChildAccount = u => !!u && !u.is_guest && !u.banned && !isGrownup(u) && u.role !== 'admin' && accountKind(u) === 'standard';

export const familyById = id => (id ? q.get('SELECT * FROM families WHERE id=?', String(id)) || null : null);
export const familyOfOwner = userId => (userId ? q.get('SELECT * FROM families WHERE owner_id=?', userId) || null : null);
/** The grown-up's family, made the first time it is needed (sign-up makes it). */
export function ensureFamily(grownup) {
  if (!isGrownup(grownup)) return null;
  const f = familyOfOwner(grownup.id); if (f) return f;
  const id = uid(12);
  q.run('INSERT OR IGNORE INTO families(id, owner_id, created_at) VALUES (?,?,?)', id, grownup.id, now());
  const fam = familyOfOwner(grownup.id);
  if (fam.id === id) audit(grownup.id, 'family.create', fam.id);
  return fam;
}
// A family can own a plan when its grown-up's account exists and isn't banned (metadata from Stripe is checked here).
registerOwnerKind('family', id => !!q.get('SELECT 1 FROM families f JOIN users u ON u.id=f.owner_id WHERE f.id=? AND u.banned=0', id));

/** Pending requests older than PENDING_TTL are gone (also swept by the daily job). */
function dropExpired(childId = null, t = now()) {
  if (childId) q.run("DELETE FROM family_children WHERE child_id=? AND status='pending' AND requested_at<=?", childId, t - PENDING_TTL);
  else q.run("DELETE FROM family_children WHERE status='pending' AND requested_at<=?", t - PENDING_TTL);
}
/** The child's live row (pending and not expired, or linked), or null. */
export function liveRowOf(childId, t = now()) {
  const r = q.get('SELECT * FROM family_children WHERE child_id=? AND unlinked_at IS NULL', childId);
  if (!r) return null;
  if (r.status === 'pending' && r.requested_at <= t - PENDING_TTL) return null;
  return r;
}
export const linkOf = childId => { const r = liveRowOf(childId); return r && r.status === 'linked' ? r : null; };
export const pendingOf = childId => { const r = liveRowOf(childId); return r && r.status === 'pending' ? r : null; };
/** The child's code that still works: { expiresAt } or null (the code itself is never kept). */
export function openCode(childId, t = now()) {
  const r = q.get('SELECT expires_at FROM family_link_codes WHERE child_id=? AND used_at IS NULL AND expires_at>? ORDER BY expires_at DESC', childId, t);
  return r ? { expiresAt: r.expires_at } : null;
}
/** Live rows (pending, not expired, and linked) of a family, oldest first. */
export function childrenOf(familyId, t = now()) {
  return q.all(`SELECT fc.*, u.username, u.display_name, u.avatar, u.color, u.photo_at FROM family_children fc JOIN users u ON u.id=fc.child_id
    WHERE fc.family_id=? AND fc.unlinked_at IS NULL AND (fc.status='linked' OR fc.requested_at>?) ORDER BY fc.requested_at`, familyId, t - PENDING_TTL);
}
/** For the nav badge on Me: 1 when a request waits for the child's answer. */
export const pendingCount = u => (u && !u.is_guest && !isGrownup(u) && pendingOf(u.id) ? 1 : 0);

// ---------------------------------------------------------------- the child's side
/** A new code for the child. -> { ok, code, expiresAt } | { ok:false, code:'notChild'|'linked'|'pending' } */
export function createCode(child) {
  if (!isChildAccount(child)) return fail('notChild');
  const t = now();
  dropExpired(child.id, t);
  const live = liveRowOf(child.id, t);
  if (live) return fail(live.status === 'linked' ? 'linked' : 'pending');
  const code = newCodeText();
  tx(() => {
    // One open code per child: a new one ends the old one (kept until the retention job deletes it).
    q.run('UPDATE family_link_codes SET expires_at=? WHERE child_id=? AND used_at IS NULL AND expires_at>?', t, child.id, t);
    q.run('INSERT INTO family_link_codes(code_hash, child_id, created_at, expires_at) VALUES (?,?,?,?)', hashCode(normLinkCode(code)), child.id, t, t + CODE_TTL);
  });
  audit(child.id, 'family.code', child.id);
  return ok({ code, expiresAt: t + CODE_TTL });
}

/** The child's answer to a pending request: 'yes' | 'no' | 'report'. -> { ok } | { ok:false, code:'nothing' } */
export function answer(child, what) {
  if (!isChildAccount(child) || !['yes', 'no', 'report'].includes(what)) return fail('nothing');
  const t = now();
  const r = pendingOf(child.id);
  if (!r) return fail('nothing');
  tx(() => {
    if (what === 'yes') {
      q.run("UPDATE family_children SET status='linked', linked_at=? WHERE family_id=? AND child_id=? AND status='pending'", t, r.family_id, child.id);
      audit(child.id, 'family.link', r.family_id, { child: child.id });
    } else {
      q.run("DELETE FROM family_children WHERE family_id=? AND child_id=? AND status='pending'", r.family_id, child.id);
      if (what === 'report') report(child.id, r.family_id, t);
      else audit(child.id, 'family.link.decline', r.family_id, { child: child.id });
    }
  });
  return ok();
}
function report(childId, familyId, t) {
  const id = uid(12);
  q.run('INSERT INTO link_reports(id, child_id, family_id, created_at) VALUES (?,?,?,?)', id, childId, familyId, t);
  audit(childId, 'family.link.report', familyId, { child: childId, report: id });
}
/** The child ends the link ('unlink'), or reports it ('report': unlinked at once and queued for the admin). */
export function childLeaves(child, { reportIt = false } = {}) {
  if (!isChildAccount(child)) return fail('nothing');
  const r = linkOf(child.id);
  if (!r) return fail('nothing');
  const t = now();
  tx(() => {
    q.run('UPDATE family_children SET unlinked_at=? WHERE family_id=? AND child_id=? AND unlinked_at IS NULL', t, r.family_id, child.id);
    audit(child.id, 'family.unlink', r.family_id, { child: child.id, by: 'child' });
    if (reportIt) report(child.id, r.family_id, t);
  });
  return ok();
}

// ---------------------------------------------------------------- the grown-up's side
/** A grown-up types a child's code. Every way a code can be wrong (unknown, expired, used, a child who can't be linked
 *  now) gives the same answer. -> { ok } | { ok:false, code:'badCode'|'already'|'full'|'notGrownup' } */
export function redeem(grownup, typed) {
  if (!isGrownup(grownup) || grownup.banned) return fail('notGrownup');
  const fam = ensureFamily(grownup);
  const c = normLinkCode(typed);
  if (!isCodeShape(c)) return fail('badCode');
  const t = now();
  const row = q.get('SELECT * FROM family_link_codes WHERE code_hash=?', hashCode(c));
  if (!row || row.used_at || row.expires_at <= t) return fail('badCode');
  const child = getUser(row.child_id);
  if (!isChildAccount(child)) return fail('badCode');
  dropExpired(child.id, t);
  const live = liveRowOf(child.id, t);
  if (live && live.family_id === fam.id) return fail('already');
  if (live) return fail('badCode');
  if (childrenOf(fam.id, t).length >= config.familyMaxChildren) return fail('full');
  let used = false;
  tx(() => {
    used = q.run('UPDATE family_link_codes SET used_at=?, used_by=? WHERE code_hash=? AND used_at IS NULL', t, fam.id, row.code_hash).changes === 1;
    if (!used) return;
    // An old unlinked row of the same pair is reused (one row per family and child).
    q.run(`INSERT INTO family_children(family_id, child_id, status, requested_at) VALUES (?,?,'pending',?)
      ON CONFLICT(family_id, child_id) DO UPDATE SET status='pending', requested_at=excluded.requested_at, linked_at=NULL, unlinked_at=NULL`, fam.id, child.id, t);
    audit(grownup.id, 'family.link.request', fam.id, { child: child.id });
  });
  return used ? ok() : fail('badCode');
}
/** The grown-up cancels a request or unlinks a child. */
export function removeChild(grownup, childId) {
  const fam = isGrownup(grownup) ? familyOfOwner(grownup.id) : null;
  if (!fam) return fail('nothing');
  const r = q.get('SELECT * FROM family_children WHERE family_id=? AND child_id=? AND unlinked_at IS NULL', fam.id, String(childId || ''));
  if (!r) return fail('nothing');
  tx(() => {
    if (r.status === 'pending') {
      q.run("DELETE FROM family_children WHERE family_id=? AND child_id=? AND status='pending'", fam.id, r.child_id);
      audit(grownup.id, 'family.link.cancel', fam.id, { child: r.child_id });
    } else {
      q.run('UPDATE family_children SET unlinked_at=? WHERE family_id=? AND child_id=? AND unlinked_at IS NULL', now(), fam.id, r.child_id);
      audit(grownup.id, 'family.unlink', fam.id, { child: r.child_id, by: 'grownup' });
    }
  });
  return ok();
}

/**
 * What /family shows for one linked child: extra messages charged to this family yesterday and this month up to the
 * end of yesterday (never today, which would show when the child is online), and whether the family plan pays for
 * their extra messages. Nothing about school: school-charged messages are never counted here.
 */
export function childUsage(familyId, childId, t = now()) {
  const day = today(t), yesterday = today(t - DAY), monthStart = day.slice(0, 8) + '01';
  const sum = (from, to) => q.get(`SELECT COALESCE(SUM(weight), 0) n FROM builder_turns WHERE user_id=? AND charged_to=? AND refunded=0
    AND charged_day>=? AND charged_day<?`, childId, `family:${familyId}`, from, to).n;
  return { yesterday: sum(yesterday, day), month: monthStart < day ? sum(monthStart, day) : 0 };
}
export const familyPlan = familyId => ownerPlan('family', familyId);

// ---------------------------------------------------------------- the platform admin
export function openReports(limit = 100) {
  return q.all(`SELECT r.*, c.username AS child_name, c.display_name AS child_display, c.avatar AS child_avatar, c.color AS child_color, c.photo_at AS child_photo_at, c.banned AS child_banned,
      o.id AS owner_id, o.username AS owner_name, o.created_at AS owner_created, o.banned AS owner_banned,
      (SELECT COUNT(*) FROM link_reports x WHERE x.family_id=r.family_id) AS family_reports
    FROM link_reports r JOIN users c ON c.id=r.child_id LEFT JOIN families f ON f.id=r.family_id LEFT JOIN users o ON o.id=f.owner_id
    WHERE r.status='open' ORDER BY r.created_at LIMIT ?`, limit);
}
export const openReportCount = () => q.get("SELECT COUNT(*) n FROM link_reports WHERE status='open'").n;
export function resolveReport(admin, id) {
  const n = q.run("UPDATE link_reports SET status='resolved', resolved_by=?, resolved_at=? WHERE id=? AND status='open'", admin.id, now(), String(id || '')).changes;
  if (n) audit(admin.id, 'admin.link_report.resolve', String(id));
  return n > 0;
}
export const reportById = id => q.get('SELECT * FROM link_reports WHERE id=?', String(id || '')) || null;
/** Links shown in the admin's user lookup: the child's family (as a child) or the family's children (as a grown-up). */
export function adminLinks(userId) {
  const asChild = q.all(`SELECT fc.*, o.username AS owner_name FROM family_children fc JOIN families f ON f.id=fc.family_id JOIN users o ON o.id=f.owner_id
    WHERE fc.child_id=? AND fc.unlinked_at IS NULL`, userId);
  const fam = familyOfOwner(userId);
  const kids = fam ? q.all(`SELECT fc.*, u.username AS child_name FROM family_children fc JOIN users u ON u.id=fc.child_id
    WHERE fc.family_id=? AND fc.unlinked_at IS NULL`, fam.id) : [];
  return { asChild, family: fam, children: kids };
}
/** The platform admin breaks a link (or a pending request). */
export function adminUnlink(admin, familyId, childId) {
  const r = q.get('SELECT * FROM family_children WHERE family_id=? AND child_id=? AND unlinked_at IS NULL', String(familyId || ''), String(childId || ''));
  if (!r) return false;
  tx(() => {
    if (r.status === 'pending') q.run("DELETE FROM family_children WHERE family_id=? AND child_id=? AND status='pending'", r.family_id, r.child_id);
    else q.run('UPDATE family_children SET unlinked_at=? WHERE family_id=? AND child_id=?', now(), r.family_id, r.child_id);
    audit(admin.id, 'admin.family.unlink', r.family_id, { child: r.child_id, status: r.status });
  });
  return true;
}

/**
 * Every link and request of an account, as a child or as a family's grown-up, ends: called inside the same transaction
 * as a ban, a school account's removal or an account merge (services/moderation.js, services/schools.js). Synchronous.
 */
export function unlinkAll(userId, actorId = null, reason = '') {
  const t = now();
  const fam = familyOfOwner(userId);
  const rows = q.all(`SELECT * FROM family_children WHERE unlinked_at IS NULL AND (child_id=? ${fam ? 'OR family_id=?' : ''})`, ...(fam ? [userId, fam.id] : [userId]));
  for (const r of rows) {
    if (r.status === 'pending') q.run("DELETE FROM family_children WHERE family_id=? AND child_id=? AND status='pending'", r.family_id, r.child_id);
    else {
      q.run('UPDATE family_children SET unlinked_at=? WHERE family_id=? AND child_id=?', t, r.family_id, r.child_id);
      audit(actorId, 'family.unlink', r.family_id, { child: r.child_id, by: reason || 'system' });
    }
  }
  q.run('UPDATE family_link_codes SET expires_at=? WHERE child_id=? AND used_at IS NULL AND expires_at>?', t, userId, t);
  return rows.length;
}

// ---------------------------------------------------------------- retention (daily)
/** Deletes what the privacy text says we delete: codes 30 days after they were used or ran out, requests nobody
 *  answered within 24 hours, unlinked rows 90 days after unlinking, resolved reports after a year. */
export function retention(t = now()) {
  return tx(() => ({
    codes: q.run('DELETE FROM family_link_codes WHERE COALESCE(used_at, expires_at) < ? OR expires_at < ?', t - KEEP.codes, t - KEEP.codes).changes,
    pending: q.run("DELETE FROM family_children WHERE status='pending' AND unlinked_at IS NULL AND requested_at <= ?", t - PENDING_TTL).changes,
    unlinked: q.run('DELETE FROM family_children WHERE unlinked_at IS NOT NULL AND unlinked_at < ?', t - KEEP.unlinked).changes,
    reports: q.run("DELETE FROM link_reports WHERE status!='open' AND resolved_at < ?", t - KEEP.reports).changes,
  }));
}
register('family-retention', DAY, retention, { firstAfterMs: 5 * 60e3 });
