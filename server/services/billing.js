// Paid plans: the Stripe mirror and who is entitled (docs/decisions.md "Paid plans", chunk 2). Nothing here shows on a
// page yet. With billing off (no STRIPE_API_KEY) the webhook route doesn't exist, nobody is entitled and the reconcile
// job does nothing.
//
// One shared sync path serves webhooks, the reconcile job and (later) the Checkout return page:
//   1. Stripe's GETs happen first, outside any transaction (a failed GET answers the webhook 500, so Stripe retries);
//   2. then one synchronous transaction records the event (idempotent on its id), upserts the subscription by its id,
//      sets or clears grace and writes the audit entry.
// Syncs for one subscription run one after another (a per-process promise chain), so an older GET never commits after
// a newer one. There is no ordering by event time: the re-fetch always gives Stripe's current state. Single process
// only (docs/status.md).
import { config } from '../config.js';
import { q, tx, audit, now, today } from '../db.js';
import { log } from './log.js';
import { register } from './jobs.js';
import * as S from './stripe.js';
import { registerPaidBudget } from './ai-budget.js';

const DAY = 86400e3;
export const WEBHOOK_PATH = '/api/billing/webhook';

/** The 14 events the Stripe webhook endpoint subscribes to (docs/decisions.md "Paid plans" §6.4). Anything else is
 *  stored as 'ignored' and answered 200. */
export const WEBHOOK_EVENTS = Object.freeze([
  'checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed',
  'checkout.session.expired',
  'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted',
  'invoice.paid', 'invoice.payment_failed', 'invoice.finalized', 'invoice.overdue',
  'charge.refunded', 'charge.dispute.created', 'radar.early_fraud_warning.created',
]);
const HANDLED = new Set(WEBHOOK_EVENTS);
// Audit entries for events (besides billing.subscription.<status> on a status change). Ids only, never card or email data.
const EVENT_AUDIT = {
  'checkout.session.completed': 'billing.checkout.done', 'checkout.session.async_payment_failed': 'billing.checkout.failed',
  'invoice.paid': 'billing.invoice.paid', 'invoice.payment_failed': 'billing.invoice.failed', 'invoice.overdue': 'billing.invoice.overdue',
  'charge.refunded': 'billing.refund', 'charge.dispute.created': 'billing.dispute', 'radar.early_fraud_warning.created': 'billing.fraud_warning',
};

// ---- Owners ----

/** Who can own a plan: kind -> exists(id). Schools are here; families arrive with grown-up accounts (chunk 3). An
 *  owner named only in Stripe metadata is accepted only when exists(id) says so. */
const ownerKinds = new Map();
export function registerOwnerKind(kind, exists) { ownerKinds.set(kind, exists); }
export const ownerKindExists = (kind, id) => { const f = ownerKinds.get(kind); return !!(f && id && f(String(id))); };
registerOwnerKind('school', id => !!q.get('SELECT 1 FROM schools WHERE id=?', id));

const idOf = v => (v && typeof v === 'object' ? v.id : v) || null;
/** The owner named in metadata (owner_kind + owner_id, or family_id / school_id), checked against the database. */
function ownerFromMetadata(...metas) {
  for (const m of metas) {
    if (!m || typeof m !== 'object') continue;
    const cands = [[m.owner_kind, m.owner_id], ['family', m.family_id], ['school', m.school_id]];
    for (const [kind, id] of cands) if (kind && id && ownerKindExists(kind, id)) return { owner_kind: String(kind), owner_id: String(id) };
  }
  return null;
}
/** The owner of a Stripe Customer we created or linked, in the current mode, or null. */
export const ownerOfCustomer = (customerId, livemode = S.currentLivemode()) =>
  (customerId ? q.get('SELECT owner_kind, owner_id FROM billing_customers WHERE stripe_customer_id=? AND livemode=?', customerId, livemode) || null : null);
/** Records that a Stripe Customer belongs to an owner (Checkout creates the Customer first; chunk 4). */
export function linkCustomer(customerId, kind, id, livemode = S.currentLivemode()) {
  return q.run('INSERT OR IGNORE INTO billing_customers(stripe_customer_id, owner_kind, owner_id, livemode, created_at) VALUES (?,?,?,?,?)', customerId, kind, String(id), livemode, now()).changes > 0;
}

// ---- Entitlement (source of truth: our synced rows, current mode only) ----

/** Is one synced subscription row entitled at time t? active/trialing (inside any grace), or past_due inside its
 *  grace; never while a delayed payment is pending; a plan cancelled at the period end runs to the period end. */
export function entitledRow(r, t = now()) {
  if (!r || r.orphaned_at || r.payment_pending) return false;
  if (r.cancel_at_period_end && r.current_period_end && t >= r.current_period_end) return false;
  const inGrace = r.grace_until != null && t < r.grace_until;
  if (r.status === 'active' || r.status === 'trialing') return r.grace_until == null || inGrace;
  if (r.status === 'past_due') return inGrace;
  return false;   // incomplete, incomplete_expired, unpaid, canceled, paused
}
/**
 * An owner's plan right now: { entitled, via: 'subscription'|'grant'|null, subscription, grant }. Off -> never
 * entitled. Only rows of the current key's mode, and only subscriptions whose price sells this owner's kind of plan.
 */
export function ownerPlan(kind, id, t = now()) {
  const none = { entitled: false, via: null, subscription: null, grant: null };
  if (!S.billingOn()) return none;
  const subs = q.all(`SELECT * FROM billing_subscriptions WHERE owner_kind=? AND owner_id=? AND livemode=? AND plan=?
    ORDER BY current_period_end DESC`, kind, String(id), S.currentLivemode(), kind);
  const sub = subs.find(r => entitledRow(r, t));
  if (sub) return { entitled: true, via: 'subscription', subscription: sub, grant: null };
  const grant = q.get('SELECT * FROM billing_grants WHERE owner_kind=? AND owner_id=? AND revoked_at IS NULL AND until > ? ORDER BY until DESC', kind, String(id), t);
  if (grant) return { entitled: true, via: 'grant', subscription: null, grant };
  return { ...none, subscription: subs[0] || null };
}
/** The owners of a kind entitled right now (current mode): a Set of owner ids. */
function entitledOwners(kind, t = now()) {
  if (!S.billingOn()) return new Set();
  const owners = new Set(q.all('SELECT * FROM billing_subscriptions WHERE owner_kind=? AND plan=? AND livemode=?', kind, kind, S.currentLivemode())
    .filter(r => entitledRow(r, t)).map(r => r.owner_id));
  for (const g of q.all('SELECT owner_id FROM billing_grants WHERE owner_kind=? AND revoked_at IS NULL AND until > ?', kind, t)) owners.add(g.owner_id);
  return owners;
}
/** How many owners of a kind are entitled right now (current mode). */
export const entitledOwnerCount = (kind, t = now()) => entitledOwners(kind, t).size;
/** The families that count toward the paid AI pool's ceiling this UTC month: those entitled now, and those whose
 *  children's extra messages were charged to them this month (a family that stops paying mid-month keeps its share
 *  until the month ends, because its spend stays in the paid pool's month). */
export function paidFamiliesThisMonth(day = today()) {
  if (!S.billingOn()) return 0;
  const fams = entitledOwners('family');
  for (const r of q.all("SELECT DISTINCT charged_to FROM builder_turns WHERE charged_to LIKE 'family:%' AND charged_day BETWEEN ? AND ?",
    day.slice(0, 8) + '01', day.slice(0, 8) + '31')) fams.add(r.charged_to.slice('family:'.length));
  return fams.size;
}
// The paid AI pool's monthly ceiling (services/ai-budget.js): FAMILY_MONTHLY_AI_USD for each family counted above.
registerPaidBudget('family', () => paidFamiliesThisMonth() * config.familyMonthlyAiUsd);
/** The owner's Stripe Customer in the current mode, or null. */
export const customerOf = (kind, id) => q.get('SELECT stripe_customer_id FROM billing_customers WHERE owner_kind=? AND owner_id=? AND livemode=?', kind, String(id), S.currentLivemode())?.stripe_customer_id || null;

/** The refund window of a subscription row (D10 and the owner's decision of 2026-10-26): a full refund on request within
 *  14 days of a payment that started the plan or renewed a yearly plan; monthly renewals are not refunded. -> the end
 *  of the window (ms) while it is open, else null. Shown on /admin/billing; refunds themselves are made in Stripe. */
export const REFUND_DAYS = 14;
export function refundWindow(r, t = now()) {
  if (!r || !r.latest_paid_at || !(r.latest_amount_paid > 0)) return null;
  const starts = r.latest_billing_reason === 'subscription_create' || (r.latest_billing_reason === 'subscription_cycle' && r.interval === 'year');
  const until = r.latest_paid_at + REFUND_DAYS * DAY;
  return starts && t < until ? until : null;
}

// ---- The shared sync path ----

const chains = new Map();
/** Runs fn after every earlier sync of the same subscription (one at a time per subscription id). */
export function serialize(subId, fn) {
  const prev = chains.get(subId) || Promise.resolve();
  const run = prev.then(fn);
  const tail = run.catch(() => {});
  chains.set(subId, tail);
  tail.then(() => { if (chains.get(subId) === tail) chains.delete(subId); });
  return run;
}

function insertEvent(event, result, extra = {}) {
  return q.run(`INSERT INTO billing_events(event_id, type, livemode, api_version, stripe_created, received_at, result,
      stripe_object_id, stripe_subscription_id, stripe_customer_id) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(event_id) DO NOTHING`,
  event.id, String(event.type), event.livemode ? 1 : 0, event.api_version || null, event.created ? event.created * 1000 : null, now(), result,
  idOf(event.data?.object) || null, extra.subscription || null, extra.customer || null).changes > 0;
}
const setEventResult = (event, result, extra = {}) => q.run('UPDATE billing_events SET result=?, stripe_subscription_id=COALESCE(?, stripe_subscription_id), stripe_customer_id=COALESCE(?, stripe_customer_id) WHERE event_id=?',
  result, extra.subscription || null, extra.customer || null, event.id);

/** Grace (docs/decisions.md "Paid plans" §6.5). Cards: past_due starts BILLING_GRACE_DAYS once (kept while past_due),
 *  active clears it. Invoices (send_invoice): the earliest open invoice past its due date + SCHOOL_INVOICE_GRACE_DAYS,
 *  whatever the status (Stripe may leave the subscription active); none overdue clears it. */
export function graceFor(sub, prev, openInvoices, t = now()) {
  // Ended for good: no grace, so the row drops out of the reconcile after this last sync.
  if (sub.status === 'canceled' || sub.status === 'incomplete_expired') return null;
  if (sub.collection_method === 'send_invoice') {
    const due = openInvoices.filter(i => i.status === 'open' && i.due_date && i.due_date * 1000 <= t).map(i => i.due_date * 1000);
    return due.length ? Math.min(...due) + config.schoolInvoiceGraceDays * DAY : null;
  }
  if (sub.status === 'past_due') return prev?.grace_until ?? t + config.billingGraceDays * DAY;
  return null;
}

/** The plan a price sells, from what survives a price change: its lookup key, else its Product (the oomba_plan
 *  metadata of an expanded Product, else the plan of one of our lookup-keyed prices on the same Product). A new Price
 *  that took over the lookup key (transfer_lookup_key) leaves the old Price, which existing subscribers stay on,
 *  without one. -> 'family' | 'school' | null */
export function planOfPrice(price, productPlans = null) {
  if (!price) return null;
  const byKey = S.planOfLookupKey(price.lookup_key);
  if (byKey) return byKey;
  const meta = price.product && typeof price.product === 'object' ? price.product.metadata?.oomba_plan : null;
  if (meta === 'family' || meta === 'school') return meta;
  return productPlans?.[idOf(price.product)] || null;
}
/** { productId: plan } from our lookup-keyed prices (cached by stripe.js). Only read when a price has no lookup key. */
async function productPlansFor(price) {
  if (!price || S.planOfLookupKey(price.lookup_key)) return null;
  try {
    const out = {};
    for (const [k, p] of Object.entries(await S.prices())) if (p.product && S.planOfLookupKey(k)) out[p.product] = S.planOfLookupKey(k);
    return out;
  } catch (e) {
    log('warn', 'billing: prices not read', e instanceof S.StripeCallError ? e.fields : { error: e.message });
    return null;
  }
}

/**
 * A school plan's pool (docs/decisions.md "Paid plans" §5): the seats whose Builder messages the school may use this
 * period. It is the highest quantity paid for (a card school: the latest invoice is paid; a seat increase waits for its
 * payment, pending_if_incomplete) or invoiced (a send_invoice school: the latest invoice is finalized, open or paid) in
 * the period, and never goes down within it. Only the invoice that covers a quantity raises the pool to it: the
 * quantity on its lines when Stripe sent them, else the quantity at the sync where that invoice is new or has just
 * become paid/finalized. A quantity changed with no invoice (next year's seats applied before the renewal with no
 * proration, or a Dashboard change whose proration waits for the next invoice) leaves the pool as it was.
 * A new period starts from the seats paid for it; until its invoice is paid (card) or finalized (send_invoice), the
 * old pool carries over (never above the new quantity) and keeps counting from the old period's start, so the school
 * keeps only what was left of last year's pool. -> { quantity, periodStart }
 */
export function poolFor({ plan, sub, li, quantity, periodStart, prev }) {
  if (plan !== 'school') return { quantity: prev?.pool_quantity ?? 0, periodStart: prev?.pool_period_start ?? null };
  const samePeriod = prev && prev.pool_period_start != null && prev.pool_period_start === periodStart;
  const carried = samePeriod ? (prev.pool_quantity || 0) : Math.min(prev?.pool_quantity || 0, quantity);
  const invoiced = sub.collection_method === 'send_invoice' ? ['open', 'paid'].includes(li?.status) : li?.status === 'paid';
  const lines = Array.isArray(li?.lines?.data) && li.lines.data.length && !li.lines.has_more ? li.lines.data : null;
  const fresh = !prev || (li?.id ?? null) !== (prev.latest_invoice_id ?? null) || (li?.status ?? null) !== (prev.latest_invoice_status ?? null);
  const covered = lines ? Math.min(quantity, Math.max(0, ...lines.map(l => Number(l.quantity) || 0))) : fresh ? quantity : 0;
  const paid = invoiced && !sub.pending_update ? covered : 0;
  if (samePeriod || paid) return { quantity: Math.max(carried, paid), periodStart };
  return { quantity: carried, periodStart: prev?.pool_period_start ?? periodStart };
}

/** Writes one fetched subscription. Synchronous: runs inside tx(). risk: { flag, paymentIntent, cancelled } from
 *  riskAction or a duplicate Checkout (the flag wins over the others). -> { result, row? } */
function applySubscription(sub, { event = null, session = null, openInvoices = [], productPlans = null, risk = null } = {}) {
  const t = now();
  const livemode = sub.livemode ? 1 : 0;
  const customerId = idOf(sub.customer);
  if (event && !insertEvent(event, null, { subscription: sub.id, customer: customerId })) return { result: 'duplicate' };
  // The owner: from Stripe's own ids first (the Customer), metadata only as a checked fallback (BP-9).
  let owner = ownerOfCustomer(customerId, livemode);
  if (!owner) {
    const sessionMeta = session ? { ...session.metadata, owner_id: session.metadata?.owner_id || session.client_reference_id } : null;
    owner = ownerFromMetadata(sub.metadata, sessionMeta, typeof sub.customer === 'object' ? sub.customer.metadata : null);
    if (owner && customerId) linkCustomer(customerId, owner.owner_kind, owner.owner_id, livemode);
  }
  const prev = q.get('SELECT * FROM billing_subscriptions WHERE stripe_subscription_id=?', sub.id);
  if (!owner && prev) owner = { owner_kind: prev.owner_kind, owner_id: prev.owner_id };
  if (!owner) {
    if (event) { setEventResult(event, 'unlinked'); audit(null, 'billing.unlinked_event', sub.id, { event: event.id, type: event.type, customer: customerId }); }
    log('warn', 'billing: subscription with an unknown customer', { subscription: sub.id, event: event?.id });
    return { result: 'unlinked' };
  }
  const item = sub.items?.data?.[0] || {};
  const price = item.price || {};
  const lookupKey = price.lookup_key || null;
  // The plan never silently drops to 'unknown' for a known row (e.g. its Price lost the lookup key): keep the plan it
  // had, but say so. A new row we can't place is 'unknown' (entitles nobody), flagged, logged and audited.
  const resolved = planOfPrice(price, productPlans);
  const plan = resolved || (prev?.plan && prev.plan !== 'unknown' ? prev.plan : 'unknown');
  if (!resolved) {
    log('warn', 'billing: a subscription\'s price sells no known plan; set the lookup keys (oomba_family_monthly, oomba_family_yearly, oomba_school_seat_yearly) on the Prices, or oomba_plan metadata on the Product', { subscription: sub.id, price: price.id || null, product: idOf(price.product), kept: plan });
    if (!prev || prev.price_id !== (price.id || null) || prev.price_lookup_key !== lookupKey || (plan === 'unknown' && prev.flag !== 'unknown_price')) audit(null, 'billing.unknown_price', `${owner.owner_kind}:${owner.owner_id}`, { subscription: sub.id, price: price.id || null, plan });
  }
  const li = sub.latest_invoice && typeof sub.latest_invoice === 'object' ? sub.latest_invoice : null;
  const latestPaid = li?.status === 'paid';
  // A delayed payment (ACH) completes Checkout unpaid: no plan until the money arrives (async_payment_succeeded, or
  // the invoice is paid). The session is re-fetched, so its events can arrive in any order. A new subscription synced
  // before its Checkout Session (customer.subscription.created first, or checkout.session.completed never processed)
  // is pending too while its first invoice is unpaid: Stripe may show it 'active' while the payment is processing.
  let pending = prev?.payment_pending ? 1 : 0;
  if (!prev && !session && sub.collection_method === 'charge_automatically' && (sub.status === 'active' || sub.status === 'trialing')
    && li && li.status !== 'paid' && (li.amount_due ?? 0) > 0) pending = 1;
  if (session) pending = session.payment_status === 'unpaid' ? 1 : 0;
  if (latestPaid) pending = 0;
  const grace = graceFor(sub, prev, openInvoices, t);
  let flag = prev?.flag ?? null;
  if (event?.type === 'checkout.session.async_payment_failed') flag = 'async_failed';
  else if (flag === 'async_failed' && !pending) flag = null;
  if (sub.collection_method === 'send_invoice' && grace != null && !flag) flag = 'overdue';
  else if (flag === 'overdue' && grace == null) flag = null;
  if (plan === 'unknown') flag = 'unknown_price';
  else if (flag === 'unknown_price') flag = null;
  if (risk?.flag) flag = risk.flag;
  const quantity = item.quantity ?? 1;
  const periodStart = item.current_period_start ? item.current_period_start * 1000 : null;
  const pool = poolFor({ plan, sub, li, quantity, periodStart, prev });
  const row = {
    stripe_subscription_id: sub.id, stripe_customer_id: customerId, owner_kind: owner.owner_kind, owner_id: owner.owner_id,
    plan, price_id: price.id || null, price_lookup_key: lookupKey, interval: price.recurring?.interval || null,
    quantity, status: String(sub.status), collection_method: sub.collection_method || null,
    current_period_start: periodStart,
    current_period_end: item.current_period_end ? item.current_period_end * 1000 : null,
    cancel_at_period_end: sub.cancel_at_period_end ? 1 : 0, grace_until: grace, payment_pending: pending, flag, livemode,
    // The latest invoice: what was paid, when and why (the refund window on /admin/billing).
    latest_invoice_id: li?.id || idOf(sub.latest_invoice) || null,
    latest_paid_at: li?.status === 'paid' && li.status_transitions?.paid_at ? li.status_transitions.paid_at * 1000 : (li ? null : prev?.latest_paid_at ?? null),
    latest_billing_reason: li?.billing_reason || (li ? null : prev?.latest_billing_reason ?? null),
    latest_amount_paid: li ? (li.amount_paid ?? null) : prev?.latest_amount_paid ?? null,
    risk_payment_intent: risk?.paymentIntent || prev?.risk_payment_intent || null,
    pool_quantity: pool.quantity, pool_period_start: pool.periodStart,
    latest_invoice_status: li?.status || (li ? null : prev?.latest_invoice_status ?? null),
    // What an invoice school still owes (the Billing tab and /admin/billing's "Mark paid by check").
    open_invoices: sub.collection_method === 'send_invoice' ? JSON.stringify(openInvoices.filter(i => i.status === 'open')
      .map(i => ({ id: i.id, amount_due: i.amount_due ?? 0, due_date: i.due_date ? i.due_date * 1000 : null, number: i.number || null, url: i.hosted_invoice_url || null }))) : null,
  };
  q.run(`INSERT INTO billing_subscriptions(stripe_subscription_id, stripe_customer_id, owner_kind, owner_id, plan, price_id,
      price_lookup_key, interval, quantity, status, collection_method, current_period_start, current_period_end,
      cancel_at_period_end, grace_until, payment_pending, flag, livemode, latest_invoice_id, latest_paid_at, latest_billing_reason,
      latest_amount_paid, risk_payment_intent, pool_quantity, pool_period_start, latest_invoice_status, open_invoices, created_at, updated_at)
    VALUES (@stripe_subscription_id, @stripe_customer_id, @owner_kind, @owner_id, @plan, @price_id, @price_lookup_key, @interval,
      @quantity, @status, @collection_method, @current_period_start, @current_period_end, @cancel_at_period_end, @grace_until,
      @payment_pending, @flag, @livemode, @latest_invoice_id, @latest_paid_at, @latest_billing_reason, @latest_amount_paid,
      @risk_payment_intent, @pool_quantity, @pool_period_start, @latest_invoice_status, @open_invoices, @t, @t)
    ON CONFLICT(stripe_subscription_id) DO UPDATE SET stripe_customer_id=excluded.stripe_customer_id, owner_kind=excluded.owner_kind,
      owner_id=excluded.owner_id, plan=excluded.plan, price_id=excluded.price_id, price_lookup_key=excluded.price_lookup_key,
      interval=excluded.interval, quantity=excluded.quantity, status=excluded.status, collection_method=excluded.collection_method,
      current_period_start=excluded.current_period_start, current_period_end=excluded.current_period_end,
      cancel_at_period_end=excluded.cancel_at_period_end, grace_until=excluded.grace_until, payment_pending=excluded.payment_pending,
      flag=excluded.flag, livemode=excluded.livemode, latest_invoice_id=excluded.latest_invoice_id, latest_paid_at=excluded.latest_paid_at,
      latest_billing_reason=excluded.latest_billing_reason, latest_amount_paid=excluded.latest_amount_paid,
      risk_payment_intent=excluded.risk_payment_intent, pool_quantity=excluded.pool_quantity, pool_period_start=excluded.pool_period_start,
      latest_invoice_status=excluded.latest_invoice_status, open_invoices=excluded.open_invoices, orphaned_at=NULL, updated_at=excluded.updated_at`, { ...row, t });
  // A school whose pool grew (seats paid for, or a new year): audited with ids and numbers only.
  if (plan === 'school' && pool.quantity !== (prev?.pool_quantity ?? 0)) audit(null, 'billing.school.pool', `${owner.owner_kind}:${owner.owner_id}`, { subscription: sub.id, seats: pool.quantity, from: prev?.pool_quantity ?? 0 });
  const target = `${owner.owner_kind}:${owner.owner_id}`;
  if (!prev || prev.status !== row.status) audit(null, `billing.subscription.${row.status}`, target, { subscription: sub.id, from: prev?.status || null, event: event?.id || null });
  if (event && EVENT_AUDIT[event.type]) audit(null, EVENT_AUDIT[event.type], target, { subscription: sub.id, event: event.id, ...(risk?.cancelled ? { cancelled: true } : {}) });
  if (risk?.flag === 'duplicate' && prev?.flag !== 'duplicate') audit(null, 'billing.duplicate', target, { subscription: sub.id, kept: risk.kept || null, refunded: !!risk.refunded });
  if (session) q.run('DELETE FROM billing_checkouts WHERE session_id=?', session.id);
  if (event) setEventResult(event, 'ok');
  return { result: 'ok', row: q.get('SELECT * FROM billing_subscriptions WHERE stripe_subscription_id=?', sub.id) };
}

/**
 * The shared sync: fetch the subscription (and a send_invoice subscription's open invoices) from Stripe, then write it
 * in one transaction. `event` (a verified webhook event) is recorded in the same transaction; `session` is a re-fetched
 * Checkout Session. A subscription Stripe doesn't know (404) is marked orphaned. Other Stripe errors are thrown
 * (StripeCallError): nothing is written, and a webhook answers 500 so Stripe sends it again.
 * A subscription that starts to entitle its owner (new, paid at last, or back from past_due / unpaid) while the owner
 * already has another entitled plan of the same kind is a duplicate: see duplicateRisk.
 * -> { result: 'ok'|'duplicate'|'unlinked'|'missing', row? }
 */
export function syncSubscription(subId, { event = null, session = null, risk = null } = {}) {
  return serialize(subId, async () => {
    let sub, openInvoices = [], productPlans = null;
    const read = async () => {
      sub = await S.getSubscription(subId);
      if (sub.collection_method === 'send_invoice') openInvoices = await S.openInvoices(sub.id);
      productPlans = await productPlansFor(sub.items?.data?.[0]?.price);
    };
    try { await read(); } catch (e) {
      if (!(e instanceof S.StripeCallError) || !e.missing) throw e;
      tx(() => {
        q.run('UPDATE billing_subscriptions SET orphaned_at=?, updated_at=? WHERE stripe_subscription_id=? AND orphaned_at IS NULL', now(), now(), subId);
        if (event) insertEvent(event, 'ignored', { subscription: subId });
      });
      log('warn', 'billing: Stripe has no such subscription', { subscription: subId, event: event?.id });
      return { result: 'missing' };
    }
    if (risk?.flag || !mayDuplicate(sub, session)) return tx(() => applySubscription(sub, { event, session, openInvoices, productPlans, risk }));
    // One owner's plans become entitled one at a time (a single chain), so two can't each see the other as not yet
    // entitled and both stay.
    return serialize('owner-entitled', async () => {
      const dup = await duplicateRisk(sub, session);
      if (dup?.cancelled) await read();   // write the cancelled state Stripe now has
      return tx(() => applySubscription(sub, { event, session, openInvoices, productPlans, risk: dup || risk }));
    });
  });
}
/** Could this fetched subscription be a second plan? A completed Checkout's (live or incomplete), or one that is
 *  active/trialing now while our row of it wasn't entitled (new, a delayed payment arrived, a card retry succeeded). */
function mayDuplicate(sub, session) {
  if (session) return LIVE_STATUSES.has(sub.status) || sub.status === 'incomplete';
  if (sub.status !== 'active' && sub.status !== 'trialing') return false;
  const prev = q.get('SELECT * FROM billing_subscriptions WHERE stripe_subscription_id=?', sub.id);
  return !prev || !entitledRow(prev);
}
/**
 * The duplicate guard (docs/decisions.md "Paid plans" §6.2): when the owner already has another entitled subscription
 * of the same plan (two Checkouts paid, or an old plan's card retry succeeded after a new plan started), the one that
 * became entitled second is ended now and its latest payment refunded; it is flagged 'duplicate' (billing.duplicate is
 * audited). Done once: a row already flagged makes no Stripe writes again. -> risk { flag, kept, refunded, cancelled }
 * or null
 */
async function duplicateRisk(sub, session) {
  const owner = ownerOfCustomer(idOf(sub.customer), sub.livemode ? 1 : 0) || ownerFromMetadata(session?.metadata, sub.metadata);
  const plan = planOfPrice(sub.items?.data?.[0]?.price);
  const kept = owner && plan ? q.all(`SELECT * FROM billing_subscriptions WHERE owner_kind=? AND owner_id=? AND livemode=? AND plan=? AND stripe_subscription_id!=?`,
    owner.owner_kind, owner.owner_id, sub.livemode ? 1 : 0, plan, sub.id).find(r => entitledRow(r)) : null;
  if (!kept) return null;
  if (q.get("SELECT 1 FROM billing_subscriptions WHERE stripe_subscription_id=? AND flag='duplicate'", sub.id)) return { flag: 'duplicate', kept: kept.stripe_subscription_id };
  if (LIVE_STATUSES.has(sub.status) || sub.status === 'incomplete') await S.cancelSubscriptionNow(sub.id, 'duplicate');
  const inv = idOf(sub.latest_invoice);
  const pi = inv ? await S.paymentIntentOfInvoice(inv) : null;
  if (pi) {
    try { await S.refundPaymentIntent(pi, `duplicate-${sub.id}-${inv}`); } catch (e) {
      if (!(e instanceof S.StripeCallError) || e.code !== 'charge_already_refunded') throw e;   // refunded already: fine
    }
  }
  log('warn', 'billing: a second subscription for the same owner was cancelled and refunded', { subscription: sub.id, kept: kept.stripe_subscription_id });
  return { flag: 'duplicate', kept: kept.stripe_subscription_id, refunded: !!pi, cancelled: true };
}

/** fn's result, or null when Stripe has no such object (other errors are thrown). */
async function reread(fn) {
  try { return await fn(); } catch (e) { if (e instanceof S.StripeCallError && e.missing) return null; throw e; }
}
/** The subscription an event is about, following Stripe's objects (outside any transaction). -> { subId, session } */
async function resolveEvent(event) {
  const o = event.data?.object || {};
  switch (event.type) {
    case 'checkout.session.completed': case 'checkout.session.async_payment_succeeded': case 'checkout.session.async_payment_failed': {
      if (o.mode !== 'subscription') return { subId: null };
      const session = await S.getCheckoutSession(o.id);
      return { subId: idOf(session.subscription), session };
    }
    case 'customer.subscription.created': case 'customer.subscription.updated': case 'customer.subscription.deleted':
      return { subId: o.id };
    case 'invoice.paid': case 'invoice.payment_failed': case 'invoice.finalized': case 'invoice.overdue': {
      // The payload has the endpoint's API version, which may not be ours (no invoice.parent before basil): read the
      // invoice again under the pinned version. Pre-basil payloads' own `subscription` is the last fallback.
      const inv = await reread(() => S.getInvoice(o.id));
      return { subId: S.subscriptionOfInvoice(inv) || S.subscriptionOfInvoice(o) || idOf(o.subscription) };
    }
    case 'charge.refunded': { // re-read the charge too (the payload's shape follows the endpoint's version)
      const charge = (o.id && await reread(() => S.getCharge(o.id))) || o;
      const invoice = await S.invoiceForCharge(charge);
      return { subId: S.subscriptionOfInvoice(invoice), charge, invoice };
    }
    case 'charge.dispute.created': case 'radar.early_fraud_warning.created': {
      const pi = idOf(o.payment_intent) || (o.charge ? idOf((await S.getCharge(idOf(o.charge))).payment_intent) : null);
      const invoice = pi ? await S.invoiceForPaymentIntent(pi) : null;
      return { subId: S.subscriptionOfInvoice(invoice), invoice, paymentIntent: pi };
    }
    default: return { subId: null };
  }
}

let warnedVersion = '';
/** One verified webhook event. -> { result } ('ok', 'duplicate', 'ignored', 'unlinked', 'mode_mismatch', 'missing') */
export async function processEvent(event) {
  if (!!event.livemode !== (S.currentLivemode() === 1)) {
    insertEvent(event, 'mode_mismatch');
    return { result: 'mode_mismatch' };
  }
  if (event.api_version && event.api_version !== config.stripeApiVersion && warnedVersion !== event.api_version) {
    warnedVersion = event.api_version;
    log('warn', 'billing: webhook event has a different API version than STRIPE_API_VERSION; recreate the endpoint with the same version', { eventVersion: event.api_version, apiVersion: config.stripeApiVersion });
  }
  if (q.get('SELECT 1 FROM billing_events WHERE event_id=?', event.id)) return { result: 'duplicate' };
  if (!HANDLED.has(event.type)) { insertEvent(event, 'ignored'); return { result: 'ignored' }; }
  const resolved = await resolveEvent(event);
  const { subId, session } = resolved;
  if (!subId) {
    // Not about one of our subscriptions. When the event came in another API version, say so in its result rather than
    // a plain 'ignored', so a wrongly made endpoint shows up.
    const otherVersion = event.api_version && event.api_version !== config.stripeApiVersion && /^(invoice|charge)\./.test(event.type);
    if (otherVersion) log('warn', 'billing: an event of another API version names no subscription', { event: event.id, type: event.type, eventVersion: event.api_version });
    return tx(() => {
      if (!insertEvent(event, otherVersion ? 'unresolved_version' : 'ignored')) return { result: 'duplicate' };
      // An expired Checkout: the owner may start again (billing_checkouts holds one open session per owner).
      if (event.type === 'checkout.session.expired' && q.run('DELETE FROM billing_checkouts WHERE session_id=?', idOf(event.data?.object)).changes) setEventResult(event, 'ok');
      return { result: q.get('SELECT result FROM billing_events WHERE event_id=?', event.id).result };
    });
  }
  if (event.type === 'checkout.session.completed') return finishCheckout({ subId, session, event });
  const risk = await riskAction(event, resolved);
  return syncSubscription(subId, { event, session, risk });
}

const LIVE_STATUSES = new Set(['active', 'trialing', 'past_due']);
/**
 * Refunds, disputes and early fraud warnings (docs/decisions.md "Paid plans" §6.4). Runs before the sync, outside any
 * transaction; every Stripe write is idempotent, so a webhook retried after a failure here does no harm.
 *   - charge.refunded: a refund of the whole latest invoice ends a live plan now (we cancel first, then refund; a full
 *     refund made the other way round cancels too). Any other refund of a live plan: flag 'refunded_active'.
 *   - charge.dispute.created, radar.early_fraud_warning.created: the plan ends now, so the card isn't charged again
 *     (a child using a parent's card often shows up this way). Flag 'dispute' / 'efw'; refunding is the owner's choice.
 * -> { flag, paymentIntent, cancelled } or null
 */
async function riskAction(event, { subId, charge = null, invoice = null, paymentIntent = null }) {
  const kind = event.type;
  if (!['charge.refunded', 'charge.dispute.created', 'radar.early_fraud_warning.created'].includes(kind)) return null;
  const sub = await reread(() => S.getSubscription(subId));
  if (!sub) return null;
  const live = LIVE_STATUSES.has(sub.status);
  if (kind === 'charge.refunded') {
    const paid = invoice?.amount_paid ?? charge?.amount ?? 0;
    const full = !!charge && charge.amount_refunded > 0 && charge.amount_refunded >= paid;
    if (!live) return null;
    if (full && invoice && invoice.id === idOf(sub.latest_invoice)) { await S.cancelSubscriptionNow(sub.id, 'refund'); return { cancelled: true }; }
    return { flag: 'refunded_active' };
  }
  if (live) await S.cancelSubscriptionNow(sub.id, kind === 'charge.dispute.created' ? 'dispute' : 'efw');
  return { flag: kind === 'charge.dispute.created' ? 'dispute' : 'efw', paymentIntent, cancelled: live };
}

/** A completed Checkout (its webhook, or the return page's fallback): the shared sync, whose duplicate guard ends and
 *  refunds a second plan of the same owner (see duplicateRisk). */
export function finishCheckout({ subId, session = null, event = null }) {
  return syncSubscription(subId, { event, session });
}

/** POST /api/billing/webhook (mounted in app.js before the request log, maintenance and JSON parsing; raw body). The
 *  signature is always checked first. 400 bad signature, 500 when Stripe couldn't be read (Stripe retries), else 200. */
export async function webhookHandler(req, res) {
  let event = null;
  try { event = await S.verifyWebhook(req.body, req.get('stripe-signature')); } catch { event = null; }
  if (!event) {
    log('warn', 'billing webhook: signature check failed', { ip: req.ip });
    return res.status(400).json({ received: false });
  }
  try {
    const r = await processEvent(event);
    log('info', 'billing webhook', { event: event.id, type: event.type, result: r.result });
    res.json({ received: true });
  } catch (e) {
    log('error', 'billing webhook failed', { event: event.id, type: event.type, ...(e instanceof S.StripeCallError ? e.fields : { error: e.message }) });
    res.status(500).json({ received: false });
  }
}

/**
 * The Checkout return page's fallback (chunk 4 calls it): the owner comes only from the session's own metadata /
 * client_reference_id, never from who is asking, and must be `expected`. Syncs only a complete session of the current
 * mode. -> { result: 'ok'|'not_yours'|'mode_mismatch'|'processing', row? }
 */
export async function syncCheckoutReturn(sessionId, expected) {
  const session = await S.getCheckoutSession(sessionId);
  if (!!session.livemode !== (S.currentLivemode() === 1)) return { result: 'mode_mismatch' };
  const kind = session.metadata?.owner_kind; const id = session.metadata?.owner_id || session.client_reference_id;
  if (!expected || kind !== expected.kind || String(id) !== String(expected.id) || (session.client_reference_id && String(session.client_reference_id) !== String(expected.id))) return { result: 'not_yours' };
  const known = ownerOfCustomer(idOf(session.customer));
  if (known && (known.owner_kind !== expected.kind || known.owner_id !== String(expected.id))) return { result: 'not_yours' };
  if (session.status !== 'complete' || !idOf(session.subscription)) return { result: 'processing' };
  return finishCheckout({ subId: idOf(session.subscription), session });
}

// ---- The reconcile job ----

/** Re-fetches every current-mode subscription that isn't canceled, and every one whose grace has ended, through the
 *  shared sync path (a missed webhook can't keep or drop a plan). Errors are caught per subscription. */
export async function reconcile() {
  if (!S.billingOn()) return { skipped: true };
  // Ended rows (canceled, incomplete_expired: every abandoned first payment) are not read again, except once more after
  // their grace ends; graceFor clears grace for them, so that is the last time.
  const rows = q.all(`SELECT stripe_subscription_id AS id FROM billing_subscriptions WHERE livemode=? AND orphaned_at IS NULL
    AND (status NOT IN ('canceled', 'incomplete_expired') OR (grace_until IS NOT NULL AND grace_until < ?))`, S.currentLivemode(), now());
  const out = { checked: 0, errors: 0, orphaned: 0 };
  for (const { id } of rows) {
    try {
      const r = await syncSubscription(id);
      out.checked++;
      if (r.result === 'missing') out.orphaned++;
    } catch (e) {
      out.errors++;
      log('warn', 'billing reconcile: subscription not synced', { subscription: id, ...(e instanceof S.StripeCallError ? e.fields : { error: e.message }) });
    }
  }
  await checkPrices({ refresh: true });
  await checkTax();
  return out;
}
/** Logs a warning when Stripe doesn't return an active Price for each of our lookup keys (e.g. live Prices made
 *  without them). Checked at start-up and by the reconcile job. -> the missing lookup keys, or null when unread. */
export async function checkPrices({ refresh = false } = {}) {
  if (!S.billingOn()) return null;
  try {
    const p = await S.prices({ refresh });
    const missing = Object.values(S.PRICE_LOOKUP_KEYS).filter(k => !p[k]);
    if (missing.length) log('warn', 'billing: no active Stripe Price has these lookup keys: set them on the Prices (Product catalog → Price → Lookup key)', { missing });
    return missing;
  } catch (e) { log('warn', 'billing: prices not read', e instanceof S.StripeCallError ? e.fields : { error: e.message }); return null; }
}
/** Logs a warning when STRIPE_TAX=1 but Stripe Tax isn't collecting anywhere (BP-6). */
export async function checkTax() {
  if (!S.billingOn() || !config.stripeTax) return null;
  try {
    const r = await S.taxReadiness();
    if (!r.ok) log('warn', r.problem === 'settings_pending' ? 'Stripe Tax is on but its settings are pending: no tax is collected (set the head office address)' : 'Stripe Tax is on but is collecting in no state: add a registration in Stripe (Tax → Registrations)', { problem: r.problem });
    return r;
  } catch (e) { log('warn', 'billing: tax settings not read', e instanceof S.StripeCallError ? e.fields : { error: e.message }); return null; }
}
// Also once two minutes after start-up: every deploy restarts the process (and this timer).
register('billing-reconcile', 6 * 3600e3, reconcile, { firstAfterMs: 2 * 60e3 });

/** Tests only. */
export function _reset() { chains.clear(); warnedVersion = ''; }
