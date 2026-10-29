// Families: grown-up accounts and the children linked to them (docs/decisions.md "Paid plans", chunk 3). No payments
// here: a family is the owner a family plan will belong to (services/billing.js owner registry).
//
// Linking, step by step (every step is audited, with ids only):
//   1. The child (an own account: not a guest, not a school account, not staff) gets a code on /me. Shape K7Q-4MZ9:
//      7 characters from an alphabet without look-alikes (no 0 O 1 I L), at least one digit. Only an HMAC of it is
//      stored. Valid CODE_TTL (24 hours, so a child can show it to a grown-up later that day), single use, one open
//      code per child (a new one ends the old one).
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
import { sign, accountKind, getUser, isGrownup, parseCookies, createUser, getUserByName, isRetiredName, cleanName, checkPassword, verifyPassword, setPassword, endSessions } from '../auth.js';
import { billingOn } from './stripe.js';
import { registerOwnerKind, ownerPlan, planLimits } from './billing.js';
import { register } from './jobs.js';
import * as funnel from './funnel.js';
import { looksLikeLinkCode, LINK_CODE_ALPHABET } from './textfilter.js';
import { allow, count, SIGNUP } from './ratelimit.js';
import { tEn } from '../i18n/index.js';

const DAY = 86400e3;
export const CODE_TTL = 24 * 3600e3;
export const PENDING_TTL = DAY;
/** How long rows are kept (the privacy text lists these). */
export const KEEP = { codes: 30 * DAY, unlinked: 90 * DAY, reports: 365 * DAY };
export const CODE_ALPHABET = LINK_CODE_ALPHABET;
const CLASS = 'A-HJKMNP-Z2-9';

/** Families (and so grown-up sign-up, the /me panel and every family route) are on exactly when billing is. */
export const PREVIEW_COOKIE = 'brb_bpreview';
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
/** Does this request carry the paid-plan preview cookie (config.billingPreviewToken)? */
export function previewing(req) {
  const tok = config.billingPreviewToken, c = req && req.headers ? parseCookies(req)[PREVIEW_COOKIE] : null;
  return !!(tok && c && same(c, tok));
}
/** Are family accounts on for this request? Billing must be on, and either open to everyone (BILLING_PUBLIC=1) or this
 *  browser holds the preview cookie. Without a request (jobs, counts) only the billing switch counts. */
export const familiesOn = req => billingOn() && (config.billingPublic || req === undefined || previewing(req));
/** Parent-made child accounts (docs/decisions.md "Parent-made child accounts"): families on for this request AND
 *  PARENT_MADE_CHILDREN=1 (off by default). Every page, link, panel, API and text about them checks this one gate; off,
 *  their routes are 404 like an unknown address and nothing about them shows anywhere. */
export const madeOn = req => familiesOn(req) && !!config.parentMadeChildren;

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

/** Something shaped like a link code, however it is spaced or punctuated (services/textfilter.js): friends chat, names,
 *  game text and score labels refuse it, so a code can't easily be passed on anywhere but face to face. */
export { looksLikeLinkCode };

// ---------------------------------------------------------------- who is who
/** An account that can be linked to a family: an own kid account (not a guest, a school account, staff, the platform
 *  admin or a grown-up), not banned. */
export const isChildAccount = u => !!u && !u.is_guest && !u.banned && !isGrownup(u) && u.role !== 'admin' && accountKind(u) === 'standard';

export const familyById = id => (id ? q.get('SELECT * FROM families WHERE id=?', String(id)) || null : null);
export const familyOfOwner = userId => (userId ? q.get('SELECT * FROM families WHERE owner_id=?', userId) || null : null);
/** The grown-up said a free family is fine: the /family checklist folds to its "All set" line (routes/family.js). */
export const hideChecklist = familyId => q.run('UPDATE families SET checklist_hidden_at=? WHERE id=? AND checklist_hidden_at IS NULL', now(), familyId).changes > 0;
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
  return q.all(`SELECT fc.*, u.username, u.display_name, u.avatar, u.color, u.photo_at, u.made_by_family, u.made_at FROM family_children fc JOIN users u ON u.id=fc.child_id
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
      funnel.bump('parent.child');   // a daily total only (services/funnel.js): nothing about which child
    } else {
      q.run("DELETE FROM family_children WHERE family_id=? AND child_id=? AND status='pending'", r.family_id, child.id);
      if (what === 'report') report(child.id, r.family_id, t);
      else audit(child.id, 'family.link.decline', r.family_id, { child: child.id });
    }
  });
  return ok();
}
function report(childId, familyId, t, parentMade = false) {
  const id = uid(12);
  q.run('INSERT INTO link_reports(id, child_id, family_id, created_at, parent_made) VALUES (?,?,?,?,?)', id, childId, familyId, t, parentMade ? 1 : 0);
  audit(childId, 'family.link.report', familyId, { child: childId, report: id, ...(parentMade ? { parentMade: true } : {}) });
}
/** The child's link to the family that made their account, or null: the very link createChildAccount wrote (made_link),
 *  unbroken since. That grown-up chose the password, so leaving them needs a new one (childLeaves). A later code link to
 *  the same family (after the child left with a new password) is an ordinary link. */
export function madeLinkOf(child) {
  const r = child && child.made_by_family ? linkOf(child.id) : null;
  return r && r.family_id === child.made_by_family && r.made_link === 1 ? r : null;
}
/** The child ends the link ('unlink'), or reports it ('report': unlinked at once and queued for the admin). On an account
 *  the linked grown-up made (madeLinkOf), newPassword is required (the route checks the rules): in one transaction the
 *  password changes, every sign-in ends (the route starts a fresh one on this device), the link ends and a report is
 *  marked parent_made, so the adult who knew the old password is out. -> { ok } | { ok:false, code:'nothing'|'needPassword' } */
export function childLeaves(child, { reportIt = false, newPassword = null } = {}) {
  if (!isChildAccount(child)) return fail('nothing');
  const r = linkOf(child.id);
  if (!r) return fail('nothing');
  const made = !!madeLinkOf(child);
  if (made && !newPassword) return fail('needPassword');
  const t = now();
  tx(() => {
    if (made) { setPassword(child.id, String(newPassword)); endSessions(child.id); }
    // made_link=0: the child cut the adult out (pauseMade then leaves this account alone).
    q.run('UPDATE family_children SET unlinked_at=?, made_link=0 WHERE family_id=? AND child_id=? AND unlinked_at IS NULL', t, r.family_id, child.id);
    audit(child.id, 'family.unlink', r.family_id, { child: child.id, by: 'child' });
    if (reportIt) report(child.id, r.family_id, t, made);
    if (made) audit(child.id, 'user.password_change', child.id, { reason: 'family' });
  });
  return ok({ made });
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
  // A Basic plan covers one child: a second can't be linked while it is on (Family covers up to FAMILY_MAX_CHILDREN).
  if (childrenOf(fam.id, t).length >= maxChildrenFor(fam.id)) return fail(familyPlan(fam.id).plan === 'basic' ? 'fullBasic' : 'full');
  let used = false;
  tx(() => {
    used = q.run('UPDATE family_link_codes SET used_at=?, used_by=? WHERE code_hash=? AND used_at IS NULL', t, fam.id, row.code_hash).changes === 1;
    if (!used) return;
    // An old unlinked row of the same pair is reused (one row per family and child).
    // made_link=0: a code link is never the link a parent-made account was made with, also when the family that made
    // the account links again after the child left (madeChild, madeLinkOf).
    q.run(`INSERT INTO family_children(family_id, child_id, status, requested_at, made_link) VALUES (?,?,'pending',?,0)
      ON CONFLICT(family_id, child_id) DO UPDATE SET status='pending', requested_at=excluded.requested_at, linked_at=NULL, unlinked_at=NULL, made_link=0`, fam.id, child.id, t);
    audit(grownup.id, 'family.link.request', fam.id, { child: child.id });
  });
  return used ? ok() : fail('badCode');
}
/** What the grown-up's page uses to name one of their rows (a request or a linked child) in its Cancel or Remove
 *  button: a keyed hash of the family and the child, so the page never carries a child's user id (user ids show in
 *  public photo URLs, so an id would tell a grown-up who a child is before the child said yes). */
export const requestToken = (familyId, childId) => sign(`fam-req:${familyId}:${childId}`).slice(0, 24);
/** The grown-up cancels a request or unlinks a child, named by requestToken (only rows of their own family). */
export function removeChild(grownup, token) {
  const fam = isGrownup(grownup) ? familyOfOwner(grownup.id) : null;
  if (!fam) return fail('nothing');
  const want = String(token || '');
  const r = q.all('SELECT * FROM family_children WHERE family_id=? AND unlinked_at IS NULL', fam.id).find(x => requestToken(fam.id, x.child_id) === want);
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
/** How many children (linked or asked) a family can have now: 1 with a Basic plan, else FAMILY_MAX_CHILDREN (also
 *  before paying: a grown-up may link first or pay first). */
export function maxChildrenFor(familyId) {
  const p = familyPlan(familyId);
  return p.entitled && p.plan === 'basic' ? 1 : config.familyMaxChildren;
}
export { planLimits };

// ---------------------------------------------------------------- parent-made child accounts (madeOn)
// A grown-up makes their child's own account (docs/decisions.md "Parent-made child accounts"; behind madeOn). It is an
// ordinary kid account: users.made_by / made_by_family / made_at only record who made it (never cleared), and nothing
// that decides how an account is treated (accountKind, isChildAccount, sessions, chat, friends, plan limits,
// publicUser) reads them. No page a child or the public sees reads them either: no badge, no "family-verified" mark.
/** Creation limits. perYear: accounts one family made in the last 365 days (unlinked and deleted ones still count: the
 *  tombstone keeps made_by_family, so making, deleting and making again never frees a slot); perDay: in the last 24
 *  hours. The live cap (children linked or asked, maxChildrenFor) applies on top. */
export const MADE = { get perYear() { return config.familyMaxChildren; }, perDay: 2, year: 365 * DAY };
/** The notice method stored with each acknowledgement (family_notice_acks.method). A record, never a consent. */
export const NOTICE_METHOD = 'notice-ack';
/** What a grown-up can see about a child's account, as categories: /family's "What we keep" page counts these
 *  (keptCounts), the child's first-sign-in card and Me panel list them (me.family.made.sees.<category>), and
 *  /privacy#made says the same. Plus the family's extra Builder messages (childUsage) on /family itself. One list, so
 *  what the child is told always matches what the grown-up sees. */
export const GROWNUP_SEES = ['extras', 'games', 'chats', 'uploads', 'saves', 'scores', 'friends', 'messages', 'photo', 'signins'];
const isUnique = e => /UNIQUE/.test(String(e && e.message));
/** Does a name use the grown-up's own name: all of it, or any run of 4 or more of its letters (case and digits ignored)? */
export function nameLikeGrownup(name, grownupName) {
  const a = String(name || '').toLowerCase().replace(/[^a-z]/g, ''), g = String(grownupName || '').toLowerCase().replace(/[^a-z]/g, '');
  if (!a || g.length < 3) return false;
  if (g.length < 4) return a.includes(g);
  for (let i = 0; i + 4 <= g.length; i++) if (a.includes(g.slice(i, i + 4))) return true;
  return false;
}
/** Accounts this family made in the window ending at t. */
const madeSince = (familyId, since) => q.get('SELECT COUNT(*) n FROM users WHERE made_by_family=? AND made_at>?', familyId, since).n;
/** Which creation limit this family is at now: 'yearCap' | 'dayCap' | 'full' | 'fullBasic', or null. */
export function madeLimit(fam, t = now()) {
  if (madeSince(fam.id, t - MADE.year) >= MADE.perYear) return 'yearCap';
  if (madeSince(fam.id, t - DAY) >= MADE.perDay) return 'dayCap';
  if (childrenOf(fam.id, t).length >= maxChildrenFor(fam.id)) return familyPlan(fam.id).plan === 'basic' && familyPlan(fam.id).entitled ? 'fullBasic' : 'full';
  return null;
}
const yes = v => v === true || v === '1' || v === 'on' || v === 1;
class Refused extends Error { constructor(code) { super(code); this.code = code; } }
/**
 * The one way a parent-made account is made (POST /api/family/children/new runs madeOn, grownupOnly and step-up first).
 * Steps, in order; a refusal is { ok:false, code, field?, error? } (error: the rule's own message, in the language of t):
 *   1. a grown-up, not banned, with a family;
 *   2. no open link report against the family ('reported');
 *   3. the kid sign-up's per-address buckets (SIGNUP, shared: 'slowDown', 'tooManySignups'), before any bcrypt work;
 *   4. the creation limits (madeLimit), checked again inside the transaction;
 *   5. the name by kid rules (cleanName without realNames), not using the grown-up's name ('nameLikeYours'), free;
 *   6. the password by kid rules (checkPassword), typed twice, not the grown-up's own ('sameAsYours');
 *   7. "I've read this" (ack) and the guardian statement (guardian), each required;
 *   8. one transaction: the account (every kid default), made_by*, the linked family row, the family_notice_acks record
 *      (noticeVersion, 'notice-ack', the statement), three audits with ids only, the parent.child funnel count;
 *   9. after the commit, the address's sign-up bucket counts the account.
 * The password is never logged, audited or returned. -> { ok, child, token }
 */
export function createChildAccount(grownup, { username, password, confirm, ack, guardian } = {}, { ip = 'anon', t: tr = tEn, noticeVersion = '', at = now() } = {}) {
  if (!isGrownup(grownup) || grownup.banned) return fail('notGrownup');
  const fam = ensureFamily(grownup);
  if (q.get("SELECT 1 FROM link_reports WHERE family_id=? AND status='open'", fam.id)) return fail('reported');
  if (!allow(`signup-try:${ip}`, SIGNUP.triesPerHour, 3600e3)) return fail('slowDown');
  if (count(`signup:${ip}`) >= SIGNUP.perHour) return fail('tooManySignups');
  const cap = madeLimit(fam, at); if (cap) return fail(cap);
  const n = cleanName(username, tr);
  if (!n.ok) return { ok: false, code: 'name', field: 'username', error: n.error };
  if (nameLikeGrownup(n.value, grownup.username)) return { ok: false, code: 'nameLikeYours', field: 'username' };
  if (getUserByName(n.value) || isRetiredName(n.value)) return { ok: false, code: 'nameTaken', field: 'username' };
  const pw = String(password ?? '');
  const pe = checkPassword(pw, n.value, tr);
  if (pe) return { ok: false, code: 'password', field: 'newPassword', error: pe };
  if (String(confirm ?? '') !== pw) return { ok: false, code: 'mismatch', field: 'newConfirm' };
  if (verifyPassword(grownup, pw)) return { ok: false, code: 'sameAsYours', field: 'newPassword' };
  if (!yes(ack)) return { ok: false, code: 'needAck', field: 'ack' };
  if (!yes(guardian)) return { ok: false, code: 'needGuardian', field: 'guardian' };
  let child;
  try {
    tx(() => {
      const again = madeLimit(fam, at); if (again) throw new Refused(again);
      child = createUser({ username: n.value, password: pw });
      q.run('UPDATE users SET made_by=?, made_by_family=?, made_at=? WHERE id=?', grownup.id, fam.id, at, child.id);
      q.run(`INSERT INTO family_children(family_id, child_id, status, requested_at, linked_at, made_link) VALUES (?,?,'linked',?,?,1)
        ON CONFLICT(family_id, child_id) DO UPDATE SET status='linked', requested_at=excluded.requested_at, linked_at=excluded.linked_at, unlinked_at=NULL, made_link=1`, fam.id, child.id, at, at);
      q.run('INSERT INTO family_notice_acks(id, child_id, family_id, grownup_id, notice_version, method, guardian_statement, created_at) VALUES (?,?,?,?,?,?,?,?)',
        uid(12), child.id, fam.id, grownup.id, String(noticeVersion), NOTICE_METHOD, 1, at);
      audit(grownup.id, 'user.signup', child.id, { by_grownup: grownup.id, family: fam.id, parentMade: true });
      audit(grownup.id, 'family.child.create', fam.id, { child: child.id });
      audit(grownup.id, 'family.link', fam.id, { child: child.id, by: 'create' });
      funnel.bump('parent.child');
    });
  } catch (e) {
    if (e instanceof Refused) return fail(e.code);
    if (isUnique(e)) return { ok: false, code: 'nameTaken', field: 'username' };
    throw e;
  }
  allow(`signup:${ip}`, SIGNUP.perHour, 3600e3);
  return ok({ child: getUser(child.id), token: requestToken(fam.id, child.id) });
}
/** The make-a-child form's own fields, every one at once (routes/family.js asks for them before the step-up): the name
 *  (kid rules, not like the grown-up's, free), the password (kid rules) typed twice, "I've read this" and the guardian
 *  statement. No bcrypt here: "not the grown-up's own password" stays in createChildAccount, after the address limits.
 *  -> { field: { code, error? } }, in the form's order (empty: nothing to fix). */
export function childFieldErrors(grownup, { username, password, confirm, ack, guardian } = {}, tr = tEn) {
  const e = {};
  const n = cleanName(username, tr);
  if (!n.ok) e.username = { code: 'name', error: n.error };
  else if (nameLikeGrownup(n.value, grownup && grownup.username)) e.username = { code: 'nameLikeYours' };
  else if (getUserByName(n.value) || isRetiredName(n.value)) e.username = { code: 'nameTaken' };
  const pw = String(password ?? '');
  const pe = checkPassword(pw, n.ok ? n.value : String(username ?? ''), tr);
  if (pe) e.newPassword = { code: 'password', error: pe };
  else if (String(confirm ?? '') !== pw) e.newConfirm = { code: 'mismatch' };
  if (!yes(ack)) e.ack = { code: 'needAck' };
  if (!yes(guardian)) e.guardian = { code: 'needGuardian' };
  return e;
}
/** A child this grown-up's family made and is still linked to by the link made with the account (made_link), named by
 *  requestToken: { row, child } or null. Every made-only action (Switch, password, What we keep, Delete) starts here,
 *  so a code-linked child (also one this family made who left and linked again by code) is never reachable, nor a
 *  banned, school-managed or other non-standard account (a banned account may be under review: its data stays). */
export function madeChild(grownup, token) {
  const fam = isGrownup(grownup) && !grownup.banned ? familyOfOwner(grownup.id) : null;
  if (!fam) return null;
  const want = String(token || '');
  const row = q.all("SELECT * FROM family_children WHERE family_id=? AND status='linked' AND unlinked_at IS NULL AND made_link=1", fam.id).find(x => requestToken(fam.id, x.child_id) === want);
  const child = row && getUser(row.child_id);
  if (!child || child.made_by_family !== fam.id || child.is_guest || isGrownup(child)) return null;
  if (child.banned || child.managed_school || accountKind(child) !== 'standard') return null;
  return { row, child, family: fam };
}
/** The grown-up sets a new password for a child they made (route: step-up, the rules checked): every sign-in of the
 *  child ends, and the child is told once on their next page (users.pw_reset_note_at, views/layout.js). */
export function resetChildPassword(grownup, child, password) {
  tx(() => {
    setPassword(child.id, String(password), { signOutEverywhere: true });
    q.run('UPDATE users SET pw_reset_note_at=? WHERE id=?', now(), child.id);
    audit(grownup.id, 'family.child.password_reset', child.id, { child: child.id });
  });
}
/** OK on the first-sign-in card in a sign-in a grown-up's Switch started: hidden for that sign-in only (sessions.via). */
export const madeCardOkThisSession = sessionId => q.run("UPDATE sessions SET made_card_ok=1 WHERE id=? AND via='switch'", String(sessionId || '')).changes > 0;
/** The child answered the first-sign-in card (only from a sign-in of their own: routes/family.js made-seen). */
export const madeNoteSeen = childId => q.run('UPDATE users SET made_note_seen_at=? WHERE id=? AND made_note_seen_at IS NULL', now(), childId).changes > 0;
/** The one-time "your grown-up gave your account a new password" note: true once (then cleared). */
export const takePwResetNote = childId => q.run('UPDATE users SET pw_reset_note_at=NULL WHERE id=? AND pw_reset_note_at IS NOT NULL', childId).changes > 0;
/**
 * "What we keep" for a made child: counts only, never content, as of the end of yesterday (UTC), so nothing shows what
 * the child did today. One entry per GROWNUP_SEES category, plus when the account was made and the notice version.
 */
export function keptCounts(childId, t = now()) {
  const cut = Date.parse(`${today(t)}T00:00:00Z`);
  const n = (sql, ...p) => q.get(sql, ...p).n;
  const games = q.get("SELECT COUNT(*) n, COALESCE(SUM(status='published' AND visibility='public'), 0) pub FROM games WHERE owner_id=? AND status!='deleted' AND created_at<?", childId, cut);
  const u = getUser(childId) || {};
  const ack = q.get('SELECT notice_version, created_at FROM family_notice_acks WHERE child_id=?', childId);
  return {
    extras: null,   // shown on /family itself (childUsage), not repeated here
    games: { n: games.n, public: games.pub },
    chats: n("SELECT COUNT(*) n FROM builder_chats c JOIN games g ON g.id=c.game_id WHERE c.user_id=? AND g.status!='deleted' AND c.created_at<?", childId, cut),
    uploads: n('SELECT COUNT(*) n FROM builder_uploads WHERE user_id=? AND created_at<?', childId, cut),
    saves: n('SELECT COUNT(*) n FROM saves s WHERE s.user_id=? AND (s.updated_at<? OR EXISTS (SELECT 1 FROM plays p WHERE p.game_id=s.game_id AND p.user_id=s.user_id AND p.started_at<?))', childId, cut, cut),
    scores: n('SELECT COUNT(*) n FROM scores WHERE user_id=? AND created_at<?', childId, cut),
    friends: n("SELECT COUNT(*) n FROM friends WHERE user_id=? AND status='accepted' AND created_at<?", childId, cut),
    messages: n('SELECT COUNT(*) n FROM chat_messages WHERE from_id=? AND created_at<?', childId, cut),
    photo: !!(u.photo_at && u.photo_at < cut),
    signins: q.all('SELECT ua, created_at FROM sessions WHERE user_id=? AND expires_at>? AND created_at<? ORDER BY created_at', childId, t, cut).map(r => ({ ua: r.ua, since: r.created_at })),
    madeAt: u.made_at || null,
    notice: ack ? ack.notice_version : null,
  };
}
/** Accounts a grown-up made that "Pause all" may pause: not banned or deleted, the link made with the account is still
 *  on or was ended by someone other than the child (the grown-up's own ban ends it: made_link stays 1), no link report
 *  by the child against that family, and no live link to another family. A child who left (new password) or reported
 *  that grown-up is never paused with them: the admin reviews those one by one (adminLinks lists them). */
const PAUSABLE = `SELECT u.id FROM users u WHERE u.made_by=? AND u.banned=0 AND u.password_hash IS NOT NULL
  AND EXISTS (SELECT 1 FROM family_children fc WHERE fc.child_id=u.id AND fc.family_id=u.made_by_family AND fc.made_link=1)
  AND NOT EXISTS (SELECT 1 FROM link_reports r WHERE r.child_id=u.id AND r.family_id=u.made_by_family)
  AND NOT EXISTS (SELECT 1 FROM family_children o WHERE o.child_id=u.id AND o.family_id!=u.made_by_family AND o.unlinked_at IS NULL)`;
export const pausableMade = grownupId => q.all(PAUSABLE, String(grownupId || '')).map(r => r.id);
/** The admin's "Pause all accounts this grown-up made" (after a ban): each pausable one (pausableMade) banned with reason
 *  made-by-banned, so the admin can review them. -> how many were paused. `ban`: services/moderation.js banUser. */
export function pauseMade(admin, grownupId, ban) {
  const kids = pausableMade(grownupId);
  for (const id of kids) ban(admin, id, 'made-by-banned');
  audit(admin.id, 'admin.family.pause_made', String(grownupId || ''), { children: kids });
  return kids.length;
}

// ---------------------------------------------------------------- the platform admin
export function openReports(limit = 100) {
  return q.all(`SELECT r.*, c.username AS child_name, c.display_name AS child_display, c.avatar AS child_avatar, c.color AS child_color, c.photo_at AS child_photo_at, c.banned AS child_banned,
      o.id AS owner_id, o.username AS owner_name, o.created_at AS owner_created, o.banned AS owner_banned,
      (SELECT COUNT(*) FROM link_reports x WHERE x.family_id=r.family_id) AS family_reports,
      (SELECT COUNT(*) FROM users m WHERE m.made_by_family=r.family_id) AS made_count,
      (SELECT COUNT(*) FROM family_children l WHERE l.family_id=r.family_id AND l.status='linked' AND l.unlinked_at IS NULL AND l.made_link=0) AS code_linked_count
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
  // Parent-made accounts: who made this one (kept after an unlink or a deletion), and the accounts this family made.
  const madeBy = q.get('SELECT u.made_by, u.made_by_family, u.made_at, o.username AS maker_name FROM users u LEFT JOIN users o ON o.id=u.made_by WHERE u.id=? AND u.made_by IS NOT NULL', userId) || null;
  // status: deleted | paused | linked (the link made with the account) | relinked (left, then linked again by code) |
  // reported (the child reported this family) | left (the child left with a new password) | unlinked (ended by someone
  // else, e.g. the grown-up's ban). pausable: what "Pause all" would pause (pausableMade).
  const pausable = new Set(fam ? pausableMade(userId) : []);
  const made = fam ? q.all(`SELECT u.id, u.username, u.banned, u.password_hash IS NULL AS gone, u.made_at, l.made_link, l.unlinked_at IS NULL AND l.status='linked' AS live,
      EXISTS (SELECT 1 FROM link_reports r WHERE r.child_id=u.id AND r.family_id=u.made_by_family) AS reported
    FROM users u LEFT JOIN family_children l ON l.family_id=u.made_by_family AND l.child_id=u.id WHERE u.made_by_family=? ORDER BY u.made_at`, fam.id)
    .map(r => ({ ...r, pausable: pausable.has(r.id), status: r.gone ? 'deleted' : r.banned ? 'paused' : r.live ? (r.made_link ? 'linked' : 'relinked') : r.reported ? 'reported' : r.made_link === 0 ? 'left' : 'unlinked' })) : [];
  const madeYear = made.filter(r => r.made_at > now() - MADE.year).length;
  const codeLinked = kids.filter(c => c.status === 'linked' && !c.made_link).length;
  return { asChild, family: fam, children: kids, madeBy, made, madeYear, codeLinked };
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
    reservedNames: q.run('DELETE FROM reserved_names WHERE until <= ?', t).changes,
  }));
}
register('family-retention', DAY, retention, { firstAfterMs: 5 * 60e3 });
