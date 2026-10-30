// School plans (docs/decisions.md "Paid plans" §5, D6, D7, D11, D12; chunk 5). Only school admins (and the platform
// admin) see or change a school's plan, on the school page's Billing tab; teachers and students never see billing.
//
//   Price: one Stripe Price per student per year (lookup key oomba_school_seat_yearly), at least SCHOOL_MIN_SEATS.
//   Card: Stripe-hosted Checkout with the number of students as the quantity (the optional "School" payment method
//         configuration, flexible billing mode). What a payment grants is decided by the webhook, as for families.
//   Invoice: the school admin asks for one (seats, PO number, a billing contact, the billing address, "we are
//         tax-exempt"); the owner clicks "Create invoice subscription" on /admin/billing (send_invoice, net 30) and can
//         mark an invoice paid by check (paid out of band).
//   Seats: more students are billed straight away (a prorated invoice); the pool grows only once that is paid (card) or
//         invoiced (send_invoice). Fewer students take effect at the renewal (next_quantity, applied just before it).
//   Pool: SCHOOL_TURNS_PER_SEAT Builder messages per paid student per billing year, shared by the school's students and
//         staff; each person may use the school's daily cap a day (never below the free daily messages). Counted from
//         builder_turns (charged_to 'school:<id>'), so a refunded build gives its messages back.
//   Lapse: when the plan ends (or an invoice is SCHOOL_INVOICE_GRACE_DAYS past due) everyone is back on the free
//         allowance. Nothing is removed or locked.
import { q, now, audit, uid, today } from '../db.js';
import { config } from '../config.js';
import { log } from './log.js';
import * as S from './stripe.js';
import * as B from './billing.js';
import * as C from './checkout.js';
import { register } from './jobs.js';
import { registerPaidBudget } from './ai-budget.js';

const DAY = 86400e3;
const YEAR = 365 * DAY;
/** Builder messages one student uses in a typical Builder lesson: the Billing tab says the pool in lessons (D6). */
export const LESSON_MESSAGES = 10;
/** The Billing tab shows the renewal reminder (and next year's seats) this many days before the renewal. */
export const RENEWAL_NOTICE_DAYS = 30;
/** Next year's seats are applied at most this long before the renewal (the renewal job runs every 6 hours). */
export const RENEWAL_APPLY_MS = 2 * DAY;
/** The most students one plan can have (a typo guard). */
export const MAX_SEATS = 5000;
/** Invoice requests' contact, address, note and PO number are deleted this long after the request is closed (the
 *  address and PO number also live on the school's Stripe Customer and invoices). */
export const KEEP_REQUESTS = 2 * YEAR;
const fail = (code, field) => ({ ok: false, code, ...(field ? { field } : {}) });

// ---------------------------------------------------------------- allowance
/** The school's daily cap setting (null = the default, SCHOOL_DAILY_CAP_DEFAULT). */
export function capSetting(school) {
  let s = {}; try { s = JSON.parse((school && school.settings) || '{}'); } catch { /* bad json */ }
  const n = Math.floor(Number(s.builderDailyCap));
  return Number.isFinite(n) && n >= 1 ? n : null;
}
/** Messages one person may use a day from the school's pool: the setting, never below the free daily messages. */
export const effectiveCap = school => Math.max(Math.max(0, config.builderDailyTurns | 0), capSetting(school) ?? config.schoolDailyCapDefault);

/** Messages charged to a school's pool since a time (refunded builds given back). */
export function poolUsedSince(schoolId, from) {
  return q.get(`SELECT COALESCE(SUM(weight), 0) n FROM builder_turns WHERE charged_to=? AND refunded=0 AND charged_day >= ?
    AND COALESCE(started_at, created_at) >= ?`, `school:${schoolId}`, today(from), from).n;
}
/**
 * A school's pool right now, or null when the school has no plan. A subscription's pool is its paid seats
 * (pool_quantity) for the current billing period; a grant's is its seats for the year that started on the grant's
 * date or its latest anniversary.
 * -> { seats, size, used, left, from, until, via }
 */
export function poolOf(schoolId, t = now()) {
  const plan = B.ownerPlan('school', schoolId, t);
  if (!plan.entitled) return null;
  let seats, from, until;
  if (plan.via === 'subscription') {
    const r = plan.subscription;
    seats = r.pool_quantity || 0; from = r.pool_period_start ?? r.current_period_start ?? r.created_at; until = r.current_period_end;
  } else {
    const g = plan.grant;
    seats = g.seats || 0; from = g.created_at + Math.max(0, Math.floor((t - g.created_at) / YEAR)) * YEAR; until = Math.min(g.until, from + YEAR);
  }
  const size = seats * config.schoolTurnsPerSeat;
  const used = poolUsedSince(schoolId, from || 0);
  return { seats, size, used, left: Math.max(0, size - used), from, until, via: plan.via };
}

/**
 * The school side of a user's allowance (services/../builder/usage.js): the live schools they are an active member of.
 * -> { school: { id, cap, pool } | null (the entitled school with messages left that pays, the one with most left),
 *      entitled: true when any of their schools has a plan (then no family extras, even with the pool empty),
 *      student: true when they are a student of any live school (a class context: counters show no totals) }
 * Billing off (no Stripe keys): always none, so school students keep today's counter and limit message (spec §1, §10).
 */
export function schoolSide(userId) {
  const none = { school: null, entitled: false, student: false };
  if (!userId || !S.billingOn()) return none;
  const rows = q.all(`SELECT m.role, s.id, s.settings FROM school_members m JOIN schools s ON s.id=m.school_id
    WHERE m.user_id=? AND m.status='active' AND s.archived_at IS NULL`, userId);
  if (!rows.length) return none;
  const student = rows.some(r => r.role === 'student');
  let best = null, entitled = false;
  for (const r of rows) {
    const pool = poolOf(r.id);
    if (!pool) continue;
    entitled = true;
    if (pool.left > 0 && (!best || pool.left > best.pool.left)) best = { id: r.id, cap: effectiveCap(r), pool };
  }
  return { school: best, entitled, student };
}

// The paid AI pool's ceiling (services/ai-budget.js): each school with a plan adds its paid seats x SCHOOL_SEAT_AI_USD a
// year, a twelfth each month.
export function schoolsPaidMonthlyUsd(t = now()) {
  if (!S.billingOn()) return 0;
  const ids = new Set(q.all("SELECT DISTINCT owner_id FROM billing_subscriptions WHERE owner_kind='school' AND livemode=?", S.currentLivemode()).map(r => r.owner_id));
  for (const g of q.all("SELECT DISTINCT owner_id FROM billing_grants WHERE owner_kind='school' AND revoked_at IS NULL AND until > ?", t)) ids.add(g.owner_id);
  let seats = 0;
  for (const id of ids) seats += poolOf(id, t)?.seats || 0;
  return seats * config.schoolSeatAiUsd / 12;
}
registerPaidBudget('school', () => schoolsPaidMonthlyUsd());

// ---------------------------------------------------------------- what the Billing tab shows
/** Active students of a school (the seats it needs). */
export const studentCount = schoolId => q.get("SELECT COUNT(*) n FROM school_members WHERE school_id=? AND role='student' AND status='active'", schoolId).n;
/** The school's open invoice request in the current Stripe mode, or null (a test-mode leftover never blocks a live one). */
export const openRequestOf = schoolId => q.get("SELECT * FROM billing_requests WHERE school_id=? AND status='open' AND livemode=? ORDER BY created_at DESC", schoolId, S.currentLivemode()) || null;
const parseJson = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
/** The unpaid invoices of a school's subscription row: [{ id, amount_due, due_date, number, url }]. */
export const openInvoicesOf = row => parseJson(row && row.open_invoices, []);

/** Everything the Billing tab needs about one school. */
export function schoolBilling(school, t = now()) {
  const plan = B.ownerPlan('school', school.id, t);
  const sub = plan.subscription;
  const pool = plan.entitled ? poolOf(school.id, t) : null;
  const students = studentCount(school.id);
  const renewing = plan.via === 'subscription' && sub && !sub.cancel_at_period_end && sub.current_period_end && sub.current_period_end - t <= RENEWAL_NOTICE_DAYS * DAY && sub.current_period_end > t;
  return {
    plan, sub, pool, students, renewing, cap: effectiveCap(school), capSetting: capSetting(school),
    request: openRequestOf(school.id), invoices: sub ? openInvoicesOf(sub) : [],
    unsettled: C.unsettledPlanOf('school', school.id), customer: B.customerOf('school', school.id),
    lessons: pool && pool.seats ? Math.floor(pool.left / (pool.seats * LESSON_MESSAGES)) : 0,
  };
}

// ---------------------------------------------------------------- card Checkout
/** The seat price, found by lookup key: { id, unitAmount } or null (billing off, missing, or Stripe unreadable). */
export async function schoolPrice() {
  if (!S.billingOn()) return null;
  try {
    const p = (await S.prices())[S.PRICE_LOOKUP_KEYS.schoolSeatYearly];
    return p ? { id: p.id, unitAmount: p.unitAmount } : null;
  } catch (e) {
    log('warn', 'billing: prices not read', e instanceof S.StripeCallError ? e.fields : { error: e.message });
    return null;
  }
}
/** A whole number of seats from a form, or null. */
export function seatsFrom(v) {
  const n = Number(String(v ?? '').trim());
  return Number.isInteger(n) ? n : null;
}
const seatsOk = n => n != null && n >= config.schoolMinSeats && n <= MAX_SEATS;

/**
 * A Checkout Session for a school plan paid by card. One at a time per school (an earlier open session is expired
 * first). A school with a plan changes its seats instead; one whose plan waits for a payment fixes it in Manage billing.
 * -> { ok: true, url } | { ok: false, code: 'entitled'|'fixPayment'|'paying'|'noPrice'|'minSeats' }
 */
export function startSchoolCheckout({ school, user, seats, base }) {
  const sid = school.id;
  return B.serialize(`checkout-start:school:${sid}`, async () => {
    if (!seatsOk(seats)) return fail('minSeats', 'seats');
    const plan = B.ownerPlan('school', sid);
    if (plan.entitled && plan.via === 'subscription') return fail('entitled');
    if (C.unsettledPlanOf('school', sid)) return fail('fixPayment');
    const price = await schoolPrice();
    if (!price) return fail('noPrice');
    if (await C.endOpenSession(sid, 'school') === 'paid') return fail('paying');
    const customer = await C.ownerCustomer('school', sid);
    const meta = { owner_kind: 'school', owner_id: sid };
    const back = `${base}/school/${encodeURIComponent(school.slug)}?tab=billing`;
    const params = {
      mode: 'subscription',
      customer,
      line_items: [{ price: price.id, quantity: seats }],
      client_reference_id: sid,
      metadata: meta,
      subscription_data: { metadata: meta, billing_mode: { type: 'flexible' } },
      billing_address_collection: 'required',
      customer_update: { address: 'auto', name: 'auto' },
      allow_promotion_codes: true,
      integration_identifier: S.INTEGRATION_IDS.school,
      success_url: `${back}&checkout={CHECKOUT_SESSION_ID}`,
      cancel_url: back,
    };
    // Which ways a school can pay is the optional "School" payment method configuration (cards, Link, ACH), else the
    // account's default: never payment_method_types (BP-4).
    if (config.stripePmcSchool) params.payment_method_configuration = config.stripePmcSchool;
    params.managed_payments = { enabled: false };   // as for family Checkout (checkout.js): we are the seller
    if (config.stripeTax) params.automatic_tax = { enabled: true };
    if (config.termsPublished) {
      params.consent_collection = { terms_of_service: 'required' };
      params.custom_text = { terms_of_service_acceptance: { message: `I agree to the [Terms of Service](${base}/terms), and that the plan renews each year until it is cancelled.` } };
    }
    const session = await S.createCheckoutSession(params, `checkout-school-${sid}-${uid(12)}`);
    C.rememberSession('school', sid, session.id);
    audit(user.id, 'billing.checkout.start', `school:${sid}`, { session: session.id, seats });
    return { ok: true, url: session.url };
  });
}

// ---------------------------------------------------------------- seats
/**
 * Changes a school plan's seats (school admin, password typed again).
 *   when 'now' and more seats: billed straight away (a prorated invoice); the pool grows once it is paid (card) or
 *     invoiced (send_invoice). A card payment that doesn't go through leaves the seats as they were.
 *   fewer seats, or when 'renewal': next year's seats, applied just before the renewal (never below the minimum).
 * -> { ok: true, did: 'raised'|'pending'|'scheduled'|'cleared', seats } | { ok: false, code: 'noPlan'|'minSeats'|'sameSeats' }
 */
export function changeSeats({ school, user, seats, when = 'now' }) {
  const sid = school.id;
  return B.serialize(`seats:school:${sid}`, async () => {
    const plan = B.ownerPlan('school', sid);
    if (!plan.entitled || plan.via !== 'subscription') return fail('noPlan');
    const row = plan.subscription;
    if (!seatsOk(seats)) return fail('minSeats', 'seats');
    const target = `school:${sid}`;
    if (when === 'renewal' || seats < row.quantity) {
      const next = seats === row.quantity ? null : seats;
      if (next === row.next_quantity) return fail('sameSeats', 'seats');
      q.run('UPDATE billing_subscriptions SET next_quantity=?, updated_at=? WHERE stripe_subscription_id=?', next, now(), row.stripe_subscription_id);
      audit(user.id, 'billing.seats', target, { subscription: row.stripe_subscription_id, from: row.quantity, next });
      return { ok: true, did: next == null ? 'cleared' : 'scheduled', seats };
    }
    if (seats === row.quantity) {
      if (row.next_quantity == null) return fail('sameSeats', 'seats');
      q.run('UPDATE billing_subscriptions SET next_quantity=NULL, updated_at=? WHERE stripe_subscription_id=?', now(), row.stripe_subscription_id);
      audit(user.id, 'billing.seats', target, { subscription: row.stripe_subscription_id, from: row.quantity, next: null });
      return { ok: true, did: 'cleared', seats };
    }
    const sub = await S.getSubscription(row.stripe_subscription_id);
    const updated = await S.updateSeats(sub, seats, { when: 'now', key: uid(8) });
    // A new decision about this year: next year's seats start again from this.
    q.run('UPDATE billing_subscriptions SET next_quantity=NULL WHERE stripe_subscription_id=?', row.stripe_subscription_id);
    audit(user.id, 'billing.seats', target, { subscription: row.stripe_subscription_id, from: row.quantity, to: seats, pending: !!updated.pending_update });
    await B.syncSubscription(row.stripe_subscription_id);
    return { ok: true, did: updated.pending_update ? 'pending' : 'raised', seats };
  });
}

/** The renewal job: next year's seats (next_quantity) are set at Stripe just before the renewal, with no proration.
 *  Also deletes invoice requests' contact details, address, note and PO number KEEP_REQUESTS after they were closed
 *  (the PO number stays on the Stripe invoice). */
export async function renewalJob(t = now()) {
  q.run(`UPDATE billing_requests SET contact_name=NULL, contact_email=NULL, address_json=NULL, note='', po='' WHERE closed_at IS NOT NULL AND closed_at < ?
    AND (contact_name IS NOT NULL OR contact_email IS NOT NULL OR address_json IS NOT NULL OR COALESCE(note, '') != '' OR COALESCE(po, '') != '')`, t - KEEP_REQUESTS);
  if (!S.billingOn()) return { skipped: true };
  const rows = q.all(`SELECT * FROM billing_subscriptions WHERE owner_kind='school' AND plan='school' AND livemode=? AND next_quantity IS NOT NULL
    AND status IN ('active','trialing','past_due') AND cancel_at_period_end=0 AND current_period_end IS NOT NULL AND current_period_end - ? <= ? AND current_period_end > ?`,
  S.currentLivemode(), t, RENEWAL_APPLY_MS, t);
  const out = { applied: 0, errors: 0 };
  for (const r of rows) {
    try {
      await B.serialize(`seats:school:${r.owner_id}`, async () => {
        const next = Math.max(config.schoolMinSeats, r.next_quantity);
        const sub = await S.getSubscription(r.stripe_subscription_id);
        if ((sub.items?.data?.[0]?.quantity ?? 0) !== next) await S.updateSeats(sub, next, { when: 'renewal', key: String(r.current_period_end) });
        q.run('UPDATE billing_subscriptions SET next_quantity=NULL WHERE stripe_subscription_id=?', r.stripe_subscription_id);
        audit(null, 'billing.seats.renewal', `school:${r.owner_id}`, { subscription: r.stripe_subscription_id, from: r.quantity, to: next });
        await B.syncSubscription(r.stripe_subscription_id);
      });
      out.applied++;
    } catch (e) {
      out.errors++;
      log('warn', 'billing: next year\'s seats not applied', { subscription: r.stripe_subscription_id, ...(e instanceof S.StripeCallError ? e.fields : { error: e.message }) });
    }
  }
  return out;
}
register('school-renewal', 6 * 3600e3, renewalJob, { firstAfterMs: 3 * 60e3 });

// ---------------------------------------------------------------- invoice requests (D7)
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;
/**
 * A school admin asks for an invoice. input: { seats, po, contactName, contactEmail, line1, line2, city, state,
 * postalCode, country, taxExempt, note }. One open request per school.
 * -> { ok: true, request } | { ok: false, code, field? }
 */
export function requestInvoice(user, school, input = {}) {
  const seats = seatsFrom(input.seats);
  if (!seatsOk(seats)) return fail('minSeats', 'seats');
  const contactName = clip(input.contactName, 80);
  if (contactName.length < 2) return fail('contactName', 'contactName');
  const contactEmail = clip(input.contactEmail, 120);
  if (!EMAIL.test(contactEmail)) return fail('contactEmail', 'contactEmail');
  const country = clip(input.country || 'US', 3).toUpperCase();
  const address = { line1: clip(input.line1, 100), line2: clip(input.line2, 100), city: clip(input.city, 60), state: clip(input.state, 60), postal_code: clip(input.postalCode, 20), country };
  for (const [k, field] of [['line1', 'line1'], ['city', 'city'], ['postal_code', 'postalCode']]) if (!address[k]) return fail('address', field);
  if (!/^[A-Z]{2}$/.test(country)) return fail('country', 'country');
  if (openRequestOf(school.id)) return fail('requestOpen');
  const id = uid(12);
  const tax = input.taxExempt === true || input.taxExempt === '1' || input.taxExempt === 'on' ? 1 : 0;
  q.run(`INSERT INTO billing_requests(id, school_id, requested_by, seats, po, contact_name, contact_email, address_json, tax_exempt_claimed, note, livemode, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, id, school.id, user.id, seats, clip(input.po, 60), contactName, contactEmail, JSON.stringify(address), tax, clip(input.note, 500), S.currentLivemode(), now());
  // Ids and numbers only: never the contact's name, email or the address.
  audit(user.id, 'billing.school.request', `school:${school.id}`, { request: id, seats, taxExemptClaimed: !!tax });
  return { ok: true, request: q.get('SELECT * FROM billing_requests WHERE id=?', id) };
}
/** The school admin withdraws their open request. */
export function cancelRequest(user, school) {
  const r = openRequestOf(school.id);
  if (!r) return fail('noRequest');
  q.run("UPDATE billing_requests SET status='cancelled', closed_at=?, closed_by=? WHERE id=?", now(), user.id, r.id);
  audit(user.id, 'billing.school.request.cancel', `school:${school.id}`, { request: r.id });
  return { ok: true };
}
/** Open requests in the current Stripe mode for /admin/billing, newest first. */
export const openRequests = () => q.all("SELECT r.*, s.name school_name, s.slug school_slug FROM billing_requests r JOIN schools s ON s.id=r.school_id WHERE r.status='open' AND r.livemode=? ORDER BY r.created_at DESC LIMIT 200", S.currentLivemode())
  .map(r => ({ ...r, address: parseJson(r.address_json, {}) }));
/** The owner closes a request without an invoice (handled another way). */
export function closeRequest(admin, id) {
  const r = q.get("SELECT * FROM billing_requests WHERE id=? AND status='open'", String(id || ''));
  if (!r) return fail('noRequest');
  q.run("UPDATE billing_requests SET status='closed', closed_at=?, closed_by=? WHERE id=?", now(), admin.id, r.id);
  audit(admin.id, 'admin.billing.request_close', `school:${r.school_id}`, { request: r.id });
  return { ok: true };
}

/**
 * "Create invoice subscription" (the owner on /admin/billing, D7, BP-7): the school's Customer gets its name, billing
 * contact email (Stripe sends the invoices there), billing address (Stripe Tax needs it) and the PO number as an invoice
 * field; tax_exempt only when the owner ticks that an exemption certificate arrived. Then a send_invoice subscription,
 * net 30, in flexible billing mode, with automatic_tax only when STRIPE_TAX=1 and never payment method types (how a
 * school pays an invoice is set in the Dashboard).
 * -> { ok: true, subscription } | { ok: false, code: 'noRequest'|'noSchool'|'entitled'|'noPrice'|'minSeats' }
 */
export function createInvoiceSubscription(admin, requestId, { seats = null, exempt = false } = {}) {
  return B.serialize(`invoice-sub:${requestId}`, async () => {
    const r = q.get("SELECT * FROM billing_requests WHERE id=? AND status='open'", String(requestId || ''));
    if (!r) return fail('noRequest');
    const school = q.get('SELECT * FROM schools WHERE id=?', r.school_id);
    if (!school) return fail('noSchool');
    const n = seats ?? r.seats;
    if (!seatsOk(n)) return fail('minSeats', 'seats');
    const plan = B.ownerPlan('school', school.id);
    if ((plan.entitled && plan.via === 'subscription') || C.unsettledPlanOf('school', school.id)) return fail('entitled');
    const price = await schoolPrice();
    if (!price) return fail('noPrice');
    const meta = { owner_kind: 'school', owner_id: school.id, school_id: school.id };
    const address = parseJson(r.address_json, {});
    const customerParams = {
      name: school.name.slice(0, 250), email: r.contact_email, address: { ...address, line2: address.line2 || undefined, state: address.state || undefined }, metadata: meta,
      invoice_settings: { custom_fields: r.po ? [{ name: 'PO number', value: r.po.slice(0, 140) }] : '' },
      ...(exempt ? { tax_exempt: 'exempt' } : {}),
    };
    const mode = S.currentLivemode();
    // The keys carry what the owner can change between attempts (the exemption box, the number of students), so a
    // retry with other values is a new request at Stripe rather than an idempotency_error; a plain retry still dedupes.
    const custKey = verb => `customer-invoice-${verb}-${r.id}-${exempt ? 1 : 0}`;
    let customer = B.customerOf('school', school.id);
    if (customer) await S.updateCustomer(customer, customerParams, custKey('update'));
    else {
      const { invoice_settings: is, ...create } = customerParams;
      const c = await S.createCustomer({ ...create, ...(r.po ? { invoice_settings: is } : {}) }, custKey('create'));
      B.linkCustomer(c.id, 'school', school.id, mode);
      customer = B.customerOf('school', school.id) || c.id;
    }
    const params = {
      customer,
      items: [{ price: price.id, quantity: n }],
      collection_method: 'send_invoice',
      days_until_due: 30,
      metadata: { ...meta, billing_request: r.id, ...(r.po ? { po: r.po } : {}) },
      billing_mode: { type: 'flexible' },
    };
    if (config.stripeTax) params.automatic_tax = { enabled: true };
    const sub = await S.createSubscription(params, `invoice-sub-${r.id}-${n}`);
    q.run("UPDATE billing_requests SET status='done', stripe_subscription_id=?, closed_at=?, closed_by=? WHERE id=?", sub.id, now(), admin.id, r.id);
    audit(admin.id, 'admin.billing.invoice_create', `school:${school.id}`, { request: r.id, subscription: sub.id, seats: n, exempt: !!exempt });
    await B.syncSubscription(sub.id);
    return { ok: true, subscription: sub.id };
  });
}

/** "Mark paid by check" (BP-8): an open invoice of one of our school subscriptions, paid out of band at Stripe. Stripe
 *  then sends invoice.paid; the subscription is synced at once too. -> { ok } | { ok: false, code: 'noInvoice' } */
export async function markPaidByCheck(admin, invoiceId) {
  const id = String(invoiceId || '');
  if (!/^in_[A-Za-z0-9]{6,200}$/.test(id)) return fail('noInvoice');
  const row = q.all("SELECT * FROM billing_subscriptions WHERE owner_kind='school' AND livemode=? AND collection_method='send_invoice'", S.currentLivemode())
    .find(r => openInvoicesOf(r).some(i => i.id === id));
  if (!row) return fail('noInvoice');
  await S.payInvoiceOutOfBand(id);
  audit(admin.id, 'admin.billing.paid_out_of_band', `school:${row.owner_id}`, { invoice: id, subscription: row.stripe_subscription_id });
  await B.syncSubscription(row.stripe_subscription_id);
  return { ok: true };
}
