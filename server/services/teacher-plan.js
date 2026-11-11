// The Teacher plan (docs/decisions.md "Teacher plan", the owner's decision of 2026-11-09): $119 a year per teacher, no
// per-student charge. It covers all of that teacher's classes and students.
//
//   Price: one Stripe Price per teacher per year (lookup key oomba_teacher_yearly). A teacher buys one for themself
//          (owner 'teacher', the teacher's account, quantity 1); a school buys N teacher seats on one subscription
//          (owner 'school', quantity = teachers; card Checkout, or the invoice / purchase-order path in
//          services/school-billing.js) and its school admins give the seats to teachers (teacher_seats).
//   Trial: 14 days free (TEACHER_TRIAL_DAYS), no card: Checkout with trial_period_days, payment_method_collection
//          'if_required' and trial_settings.end_behavior.missing_payment_method 'cancel'. A trial that ends without a
//          card is cancelled by Stripe (customer.subscription.deleted): the plan's extras stop, nothing is deleted or
//          locked (classes, students and their games stay). One trial ever per teacher, per email (an HMAC of it, never
//          the address) and per school (a school's seat trial), per Stripe mode (teacher_trials).
//   Builder: the teacher and every student of their classes share TEACHER_DAILY_MESSAGES Builder messages a UTC day
//          (charged_to 'teacher:<id>', paid by the paid AI pool, so the site-wide caps still apply). A student in
//          several paid teachers' classes builds from the first paid one with messages left, in the order they joined
//          the classes (the Builder doesn't know which class a build is "for"). Spark Packs stay family-only.
//   Automatic trial (docs/decisions.md "Automatic trial at sign-up"): the sign-up's "Add your classes" step (and /trial's
//          "Start my free trial") start the same trial straight through the API, with no Checkout page
//          (startTeacherTrial: a subscription with trial_period_days, missing_payment_method 'cancel', the Checkout
//          path's metadata, one Idempotency-Key per teacher). Never while the teacher is covered (their own plan, a grant,
//          a school seat) or while a school of theirs has a teacher seat nobody holds ("ask your school admin").
//          A seat given to a teacher whose own trial has no paid invoice yet closes that trial at once, at no charge
//          (seatTakesOver; teacher_trials.replaced_at: no trial-ended email, not "converted"); a teacher who already pays
//          keeps their plan, and is told they can cancel it.
//   Notices: customer.subscription.trial_will_end (Stripe sends it 3 days before the end; Stripe's own reminder email
//          is a Dashboard setting) puts a notice on the teacher's My classes and a Team inbox message with the link to
//          add a card. A trial that ends without a card, and one that turns into a paid plan, are told the same way.
import { q, now, audit, uid, today } from '../db.js';
import { config } from '../config.js';
import { log } from './log.js';
import * as S from './stripe.js';
import * as B from './billing.js';
import * as C from './checkout.js';
import { registerPaidBudget } from './ai-budget.js';
import * as funnel from './funnel.js';
import { sign } from '../auth.js';
import { notify } from './team.js';
import * as nudges from './nudges.js';
import { addressOf, rememberAddress } from './email.js';
import { allow } from './ratelimit.js';

const DAY = 86400e3;
/** The trial notice shows on My classes this many days before the trial ends (and from trial_will_end on). */
export const TRIAL_NOTICE_DAYS = 7;
/** The most teacher seats one school plan can have (a typo guard). */
export const MAX_TEACHER_SEATS = 1000;
const fail = (code, field) => ({ ok: false, code, ...(field ? { field } : {}) });
/** Where a teacher adds a card / sees their plan (My classes). */
export const PLAN_PATH = '/me/settings#teacher-plan';
const site = () => config.publicUrl || 'https://oomba.ai';

// ---------------------------------------------------------------- who
/** A teacher: a signed-in, unbanned account (never a grown-up's or a guest) that is a teacher or school admin of a live
 *  school. Only they can have the Teacher plan. */
export function isTeacher(u) {
  if (!u || u.is_guest || u.banned || u.account_type === 'grownup') return false;
  return !!q.get(`SELECT 1 FROM school_members m JOIN schools s ON s.id=m.school_id WHERE m.user_id=? AND m.status='active'
    AND m.role IN ('teacher','admin') AND s.archived_at IS NULL`, u.id);
}
/** The teacher's first school (the one they joined first), or null. */
export const homeSchool = userId => q.get(`SELECT s.id, s.name, s.slug FROM school_members m JOIN schools s ON s.id=m.school_id WHERE m.user_id=?
  AND m.status='active' AND m.role IN ('teacher','admin') AND s.archived_at IS NULL ORDER BY m.joined_at LIMIT 1`, userId) || null;

// ---------------------------------------------------------------- school seats
/** The teacher seats a school's plan has right now: { plan, seats, assigned: [{ user_id, name, assigned_at }] } where
 *  seats is 0 unless the school's plan is teacher seats (a subscription's paid seats, or a grant's seats). Only staff
 *  still active at the school count as assigned. */
export function seatState(schoolId, t = now()) {
  const plan = B.ownerPlan('school', schoolId, t);
  const teacherSeats = plan.entitled && plan.plan === 'teacher';
  const seats = !teacherSeats ? 0 : plan.via === 'subscription' ? (plan.subscription.pool_quantity || 0) : (plan.grant.seats || 0);
  const assigned = q.all(`SELECT ts.user_id, ts.assigned_at, COALESCE(NULLIF(m.roster_name,''), u.display_name) AS name FROM teacher_seats ts
    JOIN school_members m ON m.school_id=ts.school_id AND m.user_id=ts.user_id AND m.status='active' AND m.role IN ('teacher','admin')
    JOIN users u ON u.id=ts.user_id WHERE ts.school_id=? ORDER BY ts.assigned_at, ts.user_id`, schoolId);
  return { plan, teacherSeats, seats, assigned };
}
/** Does this teacher hold one of the school's seats now? Seats given beyond the paid ones (fewer seats at a renewal)
 *  count in the order they were given. */
export function hasSeat(schoolId, userId, t = now()) {
  const st = seatState(schoolId, t);
  if (!st.teacherSeats) return false;
  const i = st.assigned.findIndex(a => a.user_id === userId);
  return i >= 0 && i < st.seats;
}
/** The school whose seat covers this teacher now ({ id, name, slug }), or null. */
export function seatSchool(userId, t = now()) {
  for (const s of q.all(`SELECT s.id, s.name, s.slug FROM teacher_seats ts JOIN schools s ON s.id=ts.school_id AND s.archived_at IS NULL
    WHERE ts.user_id=? ORDER BY ts.assigned_at`, userId)) if (hasSeat(s.id, userId, t)) return s;
  return null;
}
/** A school this teacher is staff of whose teacher-seat plan has a seat nobody holds ({ id, name, slug }), or null:
 *  their admin can give them one, so no personal trial starts. */
export function freeSeatSchool(userId, t = now()) {
  for (const s of q.all(`SELECT s.id, s.name, s.slug FROM school_members m JOIN schools s ON s.id=m.school_id WHERE m.user_id=? AND m.status='active'
    AND m.role IN ('teacher','admin') AND s.archived_at IS NULL ORDER BY m.joined_at`, userId)) {
    const st = seatState(s.id, t);
    if (st.teacherSeats && st.assigned.length < st.seats) return s;
  }
  return null;
}
/** Does this teacher pay for their own Teacher plan (a subscription past its trial, not a grant)? */
export function ownPaid(userId, t = now()) {
  const own = B.ownerPlan('teacher', userId, t);
  return own.entitled && own.via === 'subscription' && own.subscription.status !== 'trialing';
}
/** A school admin gives a seat to a teacher or school admin of the school. A teacher who pays for their own plan gets
 *  one only with confirm (the Billing tab asks first). -> { ok } | { ok: false, code } */
export function assignSeat(by, schoolId, userId, { confirm = false } = {}) {
  const m = q.get("SELECT role FROM school_members WHERE school_id=? AND user_id=? AND status='active'", schoolId, String(userId || ''));
  if (!m || m.role === 'student') return fail('notStaff');
  const st = seatState(schoolId);
  if (!st.teacherSeats) return fail('noSeats');
  if (st.assigned.some(a => a.user_id === userId)) return { ok: true, did: 'already' };
  if (st.assigned.length >= st.seats) return fail('full');
  if (!confirm && ownPaid(userId)) return fail('ownPaid');
  q.run('INSERT OR REPLACE INTO teacher_seats(school_id, user_id, assigned_by, assigned_at) VALUES (?,?,?,?)', schoolId, userId, by.id, now());
  audit(by.id, 'billing.seat.give', `school:${schoolId}`, { user: userId });
  return { ok: true, did: 'given' };
}
export function unassignSeat(by, schoolId, userId) {
  if (!q.run('DELETE FROM teacher_seats WHERE school_id=? AND user_id=?', schoolId, String(userId || '')).changes) return fail('noSeat');
  audit(by.id, 'billing.seat.take', `school:${schoolId}`, { user: userId });
  return { ok: true, did: 'taken' };
}
/** The school's staff with their seat state, for the Billing tab: [{ user_id, name, role, seat, own, paid }] (own: they
 *  have their own Teacher plan; paid: and they pay for it, past its trial). */
export function staffSeats(schoolId) {
  const st = seatState(schoolId);
  const seated = new Set(st.assigned.slice(0, st.seats).map(a => a.user_id));
  const given = new Set(st.assigned.map(a => a.user_id));
  return q.all(`SELECT m.user_id, m.role, COALESCE(NULLIF(m.roster_name,''), u.display_name) AS name FROM school_members m JOIN users u ON u.id=m.user_id
    WHERE m.school_id=? AND m.status='active' AND m.role IN ('teacher','admin') ORDER BY CASE m.role WHEN 'admin' THEN 0 ELSE 1 END, name COLLATE NOCASE`, schoolId)
    .map(r => {
      const own = B.ownerPlan('teacher', r.user_id);
      return { ...r, seat: seated.has(r.user_id), given: given.has(r.user_id), own: own.entitled, paid: own.entitled && own.via === 'subscription' && own.subscription.status !== 'trialing' };
    });
}

// ---------------------------------------------------------------- a teacher's plan
/**
 * A teacher's plan now: { entitled, via: 'own'|'grant'|'seat'|null, trialing, trialEnd, subscription, school }.
 * own: their own Teacher plan (a subscription, a trial included); grant: one the platform admin gave (owner 'teacher');
 * seat: a seat of a school's teacher seats (school: that school). Billing off: never entitled.
 */
export function teacherPlan(userId, t = now()) {
  const none = { entitled: false, via: null, trialing: false, trialEnd: null, subscription: null, school: null };
  if (!userId || !S.billingOn()) return none;
  const own = B.ownerPlan('teacher', userId, t);
  if (own.entitled) {
    const sub = own.subscription;
    return { entitled: true, via: own.via === 'grant' ? 'grant' : 'own', trialing: sub?.status === 'trialing', trialEnd: sub?.trial_end ?? null, subscription: sub, grant: own.grant, school: null };
  }
  const s = seatSchool(userId, t);
  if (s) {
    const sp = B.ownerPlan('school', s.id, t);
    return { entitled: true, via: 'seat', trialing: sp.subscription?.status === 'trialing', trialEnd: sp.subscription?.trial_end ?? null, subscription: sp.subscription, school: s };
  }
  return { ...none, subscription: own.subscription };
}

// ---------------------------------------------------------------- the class's Builder messages
/** Messages charged to a teacher's pool on a UTC day (refunded builds given back). */
export const poolUsed = (teacherId, day = today()) => q.get('SELECT COALESCE(SUM(weight), 0) n FROM builder_turns WHERE charged_to=? AND charged_day=? AND refunded=0',
  `teacher:${teacherId}`, day).n;
/** A teacher's pool today: { size, used, left }. */
export function poolOf(teacherId, day = today()) {
  const size = Math.max(0, config.teacherDailyMessages | 0);
  const used = poolUsed(teacherId, day);
  return { size, used, left: Math.max(0, size - used) };
}
/** The teachers whose classes this user is an active student of (not archived), in the order they joined the classes. */
export function teachersOfStudent(userId) {
  const seen = new Set(); const out = [];
  for (const r of q.all(`SELECT t.user_id FROM class_members s JOIN classrooms c ON c.id=s.class_id AND c.archived_at IS NULL
    JOIN class_members t ON t.class_id=c.id AND t.role='teacher' AND t.status='active'
    WHERE s.user_id=? AND s.role='student' AND s.status='active' ORDER BY s.joined_at, c.created_at, t.joined_at`, userId)) {
    if (!seen.has(r.user_id)) { seen.add(r.user_id); out.push(r.user_id); }
  }
  return out;
}
/**
 * The Teacher plan side of a user's allowance (builder/usage.js): their own plan first (a teacher with the plan builds
 * from their classes' pool), then their classes' teachers in the order they joined the classes.
 * -> { teacher: { id, pool } | null (the paid teacher whose pool pays: the first with messages left),
 *      entitled: true when any of them has the plan (then no family extras or Spark Packs, even with the pool empty) }
 */
export function teacherSide(userId, day = today()) {
  const none = { teacher: null, entitled: false };
  if (!userId || !S.billingOn()) return none;
  const cands = [userId, ...teachersOfStudent(userId).filter(id => id !== userId)];
  let entitled = false;
  for (const id of cands) {
    if (!teacherPlan(id).entitled) continue;
    entitled = true;
    const pool = poolOf(id, day);
    if (pool.left > 0) return { teacher: { id, pool }, entitled };
  }
  return { teacher: null, entitled };
}

// The paid AI pool's ceiling (services/ai-budget.js): each teacher with the plan (their own, a grant, or a school's
// paid seat) adds TEACHER_MONTHLY_AI_USD a month.
export function teachersPaidMonthlyUsd(t = now()) {
  if (!S.billingOn()) return 0;
  let n = B.entitledOwnerCount('teacher', t);
  const lm = S.currentLivemode();
  for (const r of q.all("SELECT * FROM billing_subscriptions WHERE owner_kind='school' AND plan='teacher' AND livemode=?", lm)) if (B.entitledRow(r, t)) n += r.pool_quantity || 0;
  for (const g of q.all("SELECT seats FROM billing_grants WHERE owner_kind='school' AND plan='teacher' AND revoked_at IS NULL AND until > ?", t)) n += g.seats || 0;
  return n * config.teacherMonthlyAiUsd;
}
registerPaidBudget('teacher', () => teachersPaidMonthlyUsd());

// ---------------------------------------------------------------- the free trial
const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;
/** A work email as typed, trimmed and lower-cased, or '' when it doesn't look like one. */
export const cleanEmail = v => { const e = String(v ?? '').trim().toLowerCase().slice(0, 254); return EMAIL.test(e) ? e : ''; };
/** An HMAC of an email (the server's secret): the trial table never stores the address. */
export const emailHash = e => (e ? sign(`teacher-trial-email:${cleanEmail(e) || String(e).trim().toLowerCase()}`) : null);
/** Has this teacher, this email or this school (a school's seat trial) had a free trial already (this Stripe mode)? */
export function trialUsed({ userId = null, email = null, schoolId = null } = {}) {
  const h = email ? emailHash(email) : null;
  return !!q.get(`SELECT 1 FROM teacher_trials WHERE livemode=? AND ((? IS NOT NULL AND user_id=?) OR (? IS NOT NULL AND email_hash=?)
    OR (? IS NOT NULL AND owner_kind='school' AND school_id=?))`, S.currentLivemode(), userId, userId, h, h, schoolId, schoolId);
}
/** Free trials started, for /admin/billing: { trialing, converted, ended, replaced, total } (replaced: closed because a
 *  school seat took over; neither converted nor ended). */
export function trialStats() {
  const lm = S.currentLivemode();
  const rows = q.all(`SELECT tt.*, bs.status FROM teacher_trials tt LEFT JOIN billing_subscriptions bs ON bs.stripe_subscription_id=tt.stripe_subscription_id WHERE tt.livemode=?`, lm);
  const out = { total: rows.length, trialing: 0, converted: 0, ended: 0, replaced: 0 };
  for (const r of rows) {
    if (r.replaced_at && r.status !== 'trialing') out.replaced++;
    else if (r.status === 'trialing') out.trialing++;
    else if (r.status === 'active' || r.status === 'past_due') out.converted++;
    else out.ended++;
  }
  return out;
}

/** The Teacher price, found by lookup key: { id, unitAmount } or null (billing off, missing, or Stripe unreadable). */
export async function teacherPrice() {
  if (!S.billingOn()) return null;
  try {
    const p = (await S.prices())[S.PRICE_LOOKUP_KEYS.teacherYearly];
    return p ? { id: p.id, unitAmount: p.unitAmount } : null;
  } catch (e) {
    log('warn', 'billing: prices not read', e instanceof S.StripeCallError ? e.fields : { error: e.message });
    return null;
  }
}
/** The free-trial part of a Checkout Session's parameters (a teacher's or a school's). */
export function trialParams() {
  return {
    subscription_data: { trial_period_days: config.teacherTrialDays, trial_settings: { end_behavior: { missing_payment_method: 'cancel' } } },
    payment_method_collection: 'if_required',
  };
}

/**
 * A Checkout Session for a teacher's own Teacher plan. trial: start with the free trial (no card); refused with
 * 'trialUsed' when this teacher or email had one (they can still subscribe with trial false). One open session per
 * teacher. The email is the teacher's work email: Stripe sends the trial reminder and receipts there.
 * -> { ok: true, url, trial } | { ok: false, code: 'notTeacher'|'entitled'|'fixPayment'|'email'|'trialUsed'|'noPrice'|'paying' }
 */
export function startTeacherCheckout({ user, email, base, trial = true }) {
  const id = user && user.id;
  return B.serialize(`checkout-start:teacher:${id}`, async () => {
    if (!isTeacher(user)) return fail('notTeacher');
    if (teacherPlan(id).entitled) return fail('entitled');
    if (C.unsettledPlanOf('teacher', id)) return fail('fixPayment');
    const mail = cleanEmail(email);
    if (!mail) return fail('email', 'email');
    if (trial && trialUsed({ userId: id, email: mail })) return fail('trialUsed');
    const price = await teacherPrice();
    if (!price) return fail('noPrice');
    if (await C.endOpenSession(id, 'teacher') === 'paid') return fail('paying');
    const school = homeSchool(id);
    const meta = { owner_kind: 'teacher', owner_id: id };
    // The Customer carries the work email (Stripe's trial reminder and receipts go there); made once, then updated.
    const mode = S.currentLivemode();
    let customer = B.customerOf('teacher', id);
    if (customer) await S.updateCustomer(customer, { email: mail }, `customer-teacher-email-${id}-${emailHash(mail).slice(0, 16)}`);
    else {
      const c = await S.createCustomer({ email: mail, metadata: { ...meta, teacher_id: id } }, `customer-teacher-${id}-${mode}`);
      B.linkCustomer(c.id, 'teacher', id, mode);
      customer = B.customerOf('teacher', id) || c.id;
    }
    const tp = trial ? trialParams() : { subscription_data: {} };
    const params = {
      mode: 'subscription',
      customer,
      line_items: [{ price: price.id, quantity: 1 }],
      client_reference_id: id,
      metadata: meta,
      subscription_data: { ...tp.subscription_data, metadata: { ...meta, ...(school ? { school_id: school.id } : {}), ...(trial ? { trial_key: emailHash(mail) } : {}) }, billing_mode: { type: 'flexible' } },
      ...(tp.payment_method_collection ? { payment_method_collection: tp.payment_method_collection } : {}),
      // Stripe Tax needs the address; without it, a trial asks for as little as it can.
      billing_address_collection: config.stripeTax ? 'required' : 'auto',
      customer_update: { address: 'auto' },
      allow_promotion_codes: true,
      integration_identifier: S.INTEGRATION_IDS.teacher,
      success_url: `${base}/trial/thanks?checkout={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/trial?cancelled=1`,
    };
    // The optional "School" payment method configuration (cards, Link, ACH), else the account's default; never
    // payment_method_types (BP-4).
    if (config.stripePmcSchool) params.payment_method_configuration = config.stripePmcSchool;
    params.managed_payments = { enabled: false };
    if (config.stripeTax) params.automatic_tax = { enabled: true };
    if (config.termsPublished) {
      params.consent_collection = { terms_of_service: 'required' };
      params.custom_text = { terms_of_service_acceptance: { message: `I agree to the [Terms of Service](${base}/terms), and that the plan renews each year until I cancel it.` } };
    }
    const session = await S.createCheckoutSession(params, `checkout-teacher-${id}-${uid(12)}`);
    C.rememberSession('teacher', id, session.id);
    audit(id, 'billing.checkout.start', `teacher:${id}`, { session: session.id, trial: !!trial });
    return { ok: true, url: session.url, trial: !!trial };
  });
}

// ---------------------------------------------------------------- the trial started straight through the API
/** The schools this account is active staff of. */
const staffSchools = userId => q.all(`SELECT s.id FROM school_members m JOIN schools s ON s.id=m.school_id WHERE m.user_id=? AND m.status='active'
  AND m.role IN ('teacher','admin') AND s.archived_at IS NULL`, userId);
/** The subscription parameters of a teacher's own trial made through the API (no Checkout page): the same trial and the
 *  same metadata as the Checkout path (startTeacherCheckout), so the webhooks and the trial emails treat it alike. */
export function directTrialParams({ customer, priceId, userId, schoolId = null, mail = '' }) {
  return {
    customer,
    items: [{ price: priceId, quantity: 1 }],
    trial_period_days: config.teacherTrialDays,
    trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
    // A card added later (the Customer Portal) becomes the subscription's default, so the first year is charged to it.
    payment_settings: { save_default_payment_method: 'on_subscription' },
    metadata: { owner_kind: 'teacher', owner_id: userId, ...(schoolId ? { school_id: schoolId } : {}), ...(mail ? { trial_key: emailHash(mail) } : {}), trial_start: 'direct' },
    billing_mode: { type: 'flexible' },
  };
}
/**
 * Starts a teacher's own free trial through Stripe's API, with no Checkout page and no card (the sign-up's "Add your
 * classes" step, and /trial's "Start my free trial"). The rules are the Checkout trial's: billing on and open to this
 * account (C.mayBill), a teacher (never a kid, a guest, a grown-up or a school student), not covered already (their own
 * plan, a grant or a school seat), no unassigned seat at one of their schools (their admin can give them one), one trial
 * ever per teacher, email and school. email: their work email, if typed; else the one we know (Google's, the school
 * step's); none is fine (the in-app notices still come). One Idempotency-Key per teacher (and email), so a double submit
 * or a retry never makes two subscriptions; the subscription is synced at once (its webhooks come too and change nothing).
 * -> { ok: true, subscription } | { ok: false, code: 'off'|'notTeacher'|'notOpen'|'entitled'|'askAdmin'|'fixPayment'|'trialUsed'|'noPrice'|'paying' }
 */
export function startTeacherTrial({ user, email = '', via = 'signup' } = {}) {
  const id = user && user.id;
  return B.serialize(`checkout-start:teacher:${id}`, async () => {
    if (!S.billingOn()) return fail('off');
    if (!isTeacher(user)) return fail('notTeacher');
    if (!C.mayBill(user)) return fail('notOpen');
    if (teacherPlan(id).entitled) return fail('entitled');
    if (freeSeatSchool(id)) return fail('askAdmin');
    if (C.unsettledPlanOf('teacher', id)) return fail('fixPayment');
    const mail = cleanEmail(email) || cleanEmail(addressOf(id)?.email);
    if (trialUsed({ userId: id, email: mail || null }) || staffSchools(id).some(s => trialUsed({ schoolId: s.id }))) return fail('trialUsed');
    const price = await teacherPrice();
    if (!price) return fail('noPrice');
    // A Checkout left open (a paid start begun earlier) is closed first, so it can't become a second plan.
    if (await C.endOpenSession(id, 'teacher') === 'paid') return fail('paying');
    const mode = S.currentLivemode();
    const tag = mail ? emailHash(mail).slice(0, 16) : 'none';
    let customer = B.customerOf('teacher', id);
    if (customer) { if (mail) await S.updateCustomer(customer, { email: mail }, `customer-teacher-email-${id}-${tag}`); }
    else {
      const c = await S.createCustomer({ ...(mail ? { email: mail } : {}), metadata: { owner_kind: 'teacher', owner_id: id, teacher_id: id } }, `customer-teacher-direct-${id}-${mode}-${tag}`);
      B.linkCustomer(c.id, 'teacher', id, mode);
      customer = B.customerOf('teacher', id) || c.id;
    }
    const params = directTrialParams({ customer, priceId: price.id, userId: id, schoolId: homeSchool(id)?.id || null, mail });
    const sub = await S.createSubscription(params, `trial-teacher-${id}-${mode}-${tag}`);
    audit(id, 'billing.trial.direct', `teacher:${id}`, { subscription: sub.id, via, email: !!mail });
    // Recorded now (the trial, its emails, the plan on My classes), not only when the webhook arrives.
    try { await B.syncSubscription(sub.id); } catch (e) { log('warn', 'billing: a direct trial was not synced yet (the webhook will)', e instanceof S.StripeCallError ? { subscription: sub.id, ...e.fields } : { subscription: sub.id, error: e.message }); }
    return { ok: true, subscription: sub.id };
  });
}
/** At most this many automatic trials an hour from one address (a sign-up farm), and the sign-up waits at most this long. */
export const AUTO_TRIALS_PER_IP_HOUR = 10;
export const AUTO_WAIT_MS = 8000;
/**
 * The sign-up's automatic trial (routes/onboarding.js, once the first class is saved). Never throws and never holds the
 * sign-up up for long: a Stripe failure is logged and the sign-up goes on (the teacher can start the trial from /plans or
 * /trial later). -> startTeacherTrial's answer, or { ok: false, code: 'off'|'slowDown'|'slow'|'stripe' }
 */
export async function autoStartTrial(user, { ip = '' } = {}) {
  try {
    if (!S.billingOn() || !isTeacher(user) || !C.mayBill(user)) return fail('off');
    if (ip && !allow(`trial-auto:${ip}`, AUTO_TRIALS_PER_IP_HOUR, 3600e3)) return fail('slowDown');
    const run = startTeacherTrial({ user, via: 'signup' }).catch(e => {
      log('warn', 'billing: the automatic trial did not start', e instanceof S.StripeCallError ? { user: user.id, ...e.fields } : { user: user.id, error: e.message });
      return fail('stripe');
    });
    let timer;
    const late = new Promise(r => { timer = setTimeout(() => r(fail('slow')), AUTO_WAIT_MS); timer.unref?.(); });
    const r = await Promise.race([run, late]).finally(() => clearTimeout(timer));
    if (!r.ok) audit(user.id, 'billing.trial.auto_skip', `teacher:${user.id}`, { code: r.code });
    return r;
  } catch (e) {
    log('warn', 'billing: the automatic trial did not start', { error: e.message });
    return fail('stripe');
  }
}
/**
 * What the sign-up's last step and My classes say about the Teacher plan, in one line: { state: 'started', trialEnd }
 * (their own trial is on), { state: 'covered', school } (a school seat covers them), { state: 'askAdmin', school } (a
 * school of theirs has a seat nobody holds), or null.
 */
export function trialLine(userId) {
  if (!userId || !S.billingOn()) return null;
  const seat = seatSchool(userId);
  if (seat) return { state: 'covered', school: seat };
  const plan = teacherPlan(userId);
  if (plan.entitled && plan.via === 'own' && plan.trialing) return { state: 'started', trialEnd: plan.trialEnd };
  if (plan.entitled) return null;
  const free = freeSeatSchool(userId);
  return free ? { state: 'askAdmin', school: free } : null;
}
/**
 * The email typed on the sign-up's last step for the trial reminders, kept the way the trial Checkout keeps its work
 * email: on the teacher's Stripe Customer (Stripe's reminder and receipts) and for our own trial emails
 * (email.rememberAddress, source 'checkout'); its HMAC joins the trial's row (one trial per email).
 * -> { ok } | { ok: false, code: 'email'|'noTrial' }
 */
export async function saveTrialEmail(user, email) {
  const mail = cleanEmail(email);
  if (!mail) return fail('email', 'email');
  const id = user && user.id;
  const plan = teacherPlan(id);
  if (!(plan.entitled && plan.via === 'own')) return fail('noTrial');
  rememberAddress(id, mail, 'checkout');
  q.run('UPDATE teacher_trials SET email_hash=? WHERE user_id=? AND livemode=? AND email_hash IS NULL', emailHash(mail), id, S.currentLivemode());
  const customer = B.customerOf('teacher', id);
  if (customer) {
    try { await S.updateCustomer(customer, { email: mail }, `customer-teacher-email-${id}-${emailHash(mail).slice(0, 16)}`); }
    catch (e) { log('warn', 'billing: the trial email was not put on the Stripe customer', e instanceof S.StripeCallError ? e.fields : { error: e.message }); }
  }
  audit(id, 'billing.trial.email', `teacher:${id}`, {});
  return { ok: true };
}

// ---------------------------------------------------------------- a seat meets the teacher's own plan
/**
 * After a school admin gives a seat (giveSeat): the teacher's own plan meets the seat.
 *   Their own trial with no paid invoice yet: closed now through Stripe (cancel at once with no proration and no
 *   invoice, so nothing is charged) and remembered as replaced by the seat (teacher_trials.replaced_at: no trial-ended
 *   email, not "converted"); the sync hook tells them "Your school now covers your Teacher plan, so your free trial was
 *   closed." The seat covers them from now on.
 *   Their own paid plan: left alone; they are told they can cancel it (Team inbox, and the Teacher plan card).
 * -> { did: 'none'|'trialClosed'|'paidTold'|'closeFailed' }
 */
export async function seatTakesOver(by, schoolId, userId) {
  if (!S.billingOn() || !hasSeat(schoolId, userId)) return { did: 'none' };
  const own = B.ownerPlan('teacher', userId);
  if (!own.entitled || own.via !== 'subscription') return { did: 'none' };
  const sub = own.subscription, subId = sub.stripe_subscription_id;
  const school = q.get('SELECT id, name, slug FROM schools WHERE id=?', schoolId);
  if (sub.status !== 'trialing' || (sub.latest_amount_paid || 0) > 0) {
    try { notify(userId, { k: 'seatCoversPaid', school: school?.name || '', href: `${site()}${PLAN_PATH}` }); } catch { /* a notice never blocks a seat */ }
    audit(by?.id || null, 'billing.seat.own_paid', `teacher:${userId}`, { school: schoolId, subscription: subId });
    return { did: 'paidTold' };
  }
  return B.serialize(`checkout-start:teacher:${userId}`, async () => {
    if (!q.run('UPDATE teacher_trials SET replaced_by_school=?, replaced_at=? WHERE stripe_subscription_id=?', schoolId, now(), subId).changes) {
      q.run(`INSERT OR IGNORE INTO teacher_trials(id, owner_kind, owner_id, user_id, school_id, email_hash, stripe_subscription_id, livemode, created_at, replaced_by_school, replaced_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`, uid(12), 'teacher', userId, userId, homeSchool(userId)?.id || null, null, subId, sub.livemode, now(), schoolId, now());
    }
    try { await S.cancelSubscriptionNow(subId, 'seat'); } catch (e) {
      q.run('UPDATE teacher_trials SET replaced_by_school=NULL, replaced_at=NULL WHERE stripe_subscription_id=?', subId);
      log('warn', 'billing: a trial replaced by a seat was not cancelled', e instanceof S.StripeCallError ? { subscription: subId, ...e.fields } : { subscription: subId, error: e.message });
      return { did: 'closeFailed' };
    }
    audit(by?.id || null, 'billing.trial.replaced', `teacher:${userId}`, { school: schoolId, subscription: subId });
    try { await B.syncSubscription(subId); } catch (e) { log('warn', 'billing: a cancelled trial was not synced yet (the webhook will)', { subscription: subId, error: e.message }); }
    return { did: 'trialClosed' };
  });
}
/** A school admin gives a seat (assignSeat), then the seat meets the teacher's own plan (seatTakesOver).
 *  -> assignSeat's answer, with after: seatTakesOver's did */
export async function giveSeat(by, schoolId, userId, opts = {}) {
  const r = assignSeat(by, schoolId, userId, opts);
  if (!r.ok || r.did !== 'given') return r;
  let after = { did: 'none' };
  try { after = await seatTakesOver(by, schoolId, userId); } catch (e) { log('warn', 'billing: what a given seat means for an own plan failed', { error: e.message }); }
  return { ...r, after: after.did };
}

// ---------------------------------------------------------------- what a synced row means (billing.js sync hook)
/** Who hears about a plan: the teacher (a teacher's own plan) or the school's admins (teacher seats). */
function listeners(row) {
  if (row.owner_kind === 'teacher') return [row.owner_id];
  if (row.owner_kind === 'school') return q.all("SELECT user_id FROM school_members WHERE school_id=? AND role='admin' AND status='active'", row.owner_id).map(r => r.user_id);
  return [];
}
const tell = (row, notice) => { for (const uidTo of listeners(row)) { try { notify(uidTo, notice); } catch { /* a notice never blocks a sync */ } } };

/** A subscription that will be paid at its trial's end: a default card on it or on its (expanded) customer. */
const hasCard = sub => !!(sub && (sub.default_payment_method || (typeof sub.customer === 'object' && sub.customer?.invoice_settings?.default_payment_method)));
B.registerSyncHook(({ row, prev, event, owner, sub }) => {
  if (row.plan !== 'teacher' || !['teacher', 'school'].includes(owner.owner_kind)) return;
  const target = `${owner.owner_kind}:${owner.owner_id}`;
  // A free trial started: remembered once (one trial ever per teacher, email and school).
  if (row.trial_end && (row.status === 'trialing' || (prev && prev.status === 'trialing'))) {
    const meta = (sub && sub.metadata) || {};
    const isTeacherOwner = owner.owner_kind === 'teacher';
    const added = q.run(`INSERT OR IGNORE INTO teacher_trials(id, owner_kind, owner_id, user_id, school_id, email_hash, stripe_subscription_id, livemode, created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`, uid(12), owner.owner_kind, owner.owner_id, isTeacherOwner ? owner.owner_id : (meta.started_by || null),
    isTeacherOwner ? (meta.school_id || homeSchool(owner.owner_id)?.id || null) : owner.owner_id, meta.trial_key || null, row.stripe_subscription_id, row.livemode, now()).changes;
    if (added) { funnel.bump('teacher.trial'); audit(null, 'billing.trial.start', target, { subscription: row.stripe_subscription_id, until: row.trial_end }); }
    // The trial emails (services/nudges.js; idempotent): a teacher's own trial only (a school's seat trial has no one
    // teacher). Also for a trial that began before the emails existed: its late emails are skipped by their own rules.
    if (isTeacherOwner && row.status === 'trialing') nudges.onTrialStarted({ userId: owner.owner_id, trialStart: sub?.trial_start ? sub.trial_start * 1000 : now(), trialEnd: row.trial_end, email: typeof sub?.customer === 'object' ? sub.customer?.email : '' });
  }
  const days = row.trial_end ? Math.max(0, Math.ceil((row.trial_end - now()) / DAY)) : 0;
  const href = `${site()}${owner.owner_kind === 'school' ? `/school/${encodeURIComponent(q.get('SELECT slug FROM schools WHERE id=?', owner.owner_id)?.slug || '')}?tab=billing` : PLAN_PATH}`;
  // Stripe's trial_will_end (3 days before): the notice on My classes and one Team inbox message.
  if (event && event.type === 'customer.subscription.trial_will_end' && row.status === 'trialing' && !row.trial_notice_at) {
    q.run('UPDATE billing_subscriptions SET trial_notice_at=? WHERE stripe_subscription_id=?', now(), row.stripe_subscription_id);
    tell(row, { k: 'trialEnding', days, href });
  }
  // A card added during the trial (it will be paid at the end): the trial emails stop and say thank you. Read from this
  // sync's subscription (its customer is expanded), e.g. at trial_will_end, before "Your trial ends in 3 days" is due.
  if (owner.owner_kind === 'teacher' && row.status === 'trialing' && hasCard(sub)) nudges.onTrialConverted(owner.owner_id);
  if (prev && prev.status === 'trialing' && row.status === 'canceled') {
    // Closed because a school seat took over (seatTakesOver): no "your trial ended", not converted.
    const replaced = owner.owner_kind === 'teacher' ? q.get(`SELECT s.name FROM teacher_trials tt LEFT JOIN schools s ON s.id=tt.replaced_by_school
      WHERE tt.stripe_subscription_id=? AND tt.replaced_at IS NOT NULL`, row.stripe_subscription_id) : null;
    if (replaced) {
      nudges.onTrialReplaced(owner.owner_id);
      tell(row, { k: 'trialReplaced', school: replaced.name || '' });
      audit(null, 'billing.trial.ended', target, { subscription: row.stripe_subscription_id, replaced: true });
    } else {
      if (owner.owner_kind === 'teacher') nudges.onTrialEnded(owner.owner_id);
      tell(row, { k: 'trialEnded', href: `${site()}/trial` });
      audit(null, 'billing.trial.ended', target, { subscription: row.stripe_subscription_id });
    }
  }
  if (prev && prev.status === 'trialing' && row.status === 'active') {
    if (owner.owner_kind === 'teacher') nudges.onTrialConverted(owner.owner_id);
    tell(row, { k: 'trialConverted' });
    audit(null, 'billing.trial.converted', target, { subscription: row.stripe_subscription_id });
  }
});

/** The trial notice for My classes: { days, until, noticed } while the teacher's own trial (or their school's seat trial)
 *  ends within TRIAL_NOTICE_DAYS or Stripe said it will end; else null. */
export function trialNotice(plan, t = now()) {
  if (!plan || !plan.entitled || !plan.trialing || !plan.trialEnd) return null;
  const sub = plan.subscription || {};
  const left = plan.trialEnd - t;
  if (!sub.trial_notice_at && left > TRIAL_NOTICE_DAYS * DAY) return null;
  return { days: Math.max(0, Math.ceil(left / DAY)), until: plan.trialEnd, noticed: !!sub.trial_notice_at };
}
