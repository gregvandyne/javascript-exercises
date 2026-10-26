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
import { q, tx, audit, now } from '../db.js';
import { log } from './log.js';
import { register } from './jobs.js';
import * as S from './stripe.js';

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
  if (sub.collection_method === 'send_invoice') {
    const due = openInvoices.filter(i => i.status === 'open' && i.due_date && i.due_date * 1000 <= t).map(i => i.due_date * 1000);
    return due.length ? Math.min(...due) + config.schoolInvoiceGraceDays * DAY : null;
  }
  if (sub.status === 'past_due') return prev?.grace_until ?? t + config.billingGraceDays * DAY;
  return null;
}

/** Writes one fetched subscription. Synchronous: runs inside tx(). -> { result, row? } */
function applySubscription(sub, { event = null, session = null, openInvoices = [] } = {}) {
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
  const plan = S.planOfLookupKey(lookupKey) || 'unknown';
  const li = sub.latest_invoice && typeof sub.latest_invoice === 'object' ? sub.latest_invoice : null;
  const latestPaid = li?.status === 'paid';
  // A delayed payment (ACH) completes Checkout unpaid: no plan until the money arrives (async_payment_succeeded, or
  // the invoice is paid). The session is re-fetched, so its events can arrive in any order.
  let pending = prev?.payment_pending ? 1 : 0;
  if (session) pending = session.payment_status === 'unpaid' ? 1 : 0;
  if (latestPaid) pending = 0;
  const grace = graceFor(sub, prev, openInvoices, t);
  let flag = prev?.flag ?? null;
  if (event?.type === 'checkout.session.async_payment_failed') flag = 'async_failed';
  else if (flag === 'async_failed' && !pending) flag = null;
  if (sub.collection_method === 'send_invoice' && grace != null && !flag) flag = 'overdue';
  else if (flag === 'overdue' && grace == null) flag = null;
  const row = {
    stripe_subscription_id: sub.id, stripe_customer_id: customerId, owner_kind: owner.owner_kind, owner_id: owner.owner_id,
    plan, price_id: price.id || null, price_lookup_key: lookupKey, interval: price.recurring?.interval || null,
    quantity: item.quantity ?? 1, status: String(sub.status), collection_method: sub.collection_method || null,
    current_period_start: item.current_period_start ? item.current_period_start * 1000 : null,
    current_period_end: item.current_period_end ? item.current_period_end * 1000 : null,
    cancel_at_period_end: sub.cancel_at_period_end ? 1 : 0, grace_until: grace, payment_pending: pending, flag, livemode,
  };
  q.run(`INSERT INTO billing_subscriptions(stripe_subscription_id, stripe_customer_id, owner_kind, owner_id, plan, price_id,
      price_lookup_key, interval, quantity, status, collection_method, current_period_start, current_period_end,
      cancel_at_period_end, grace_until, payment_pending, flag, livemode, created_at, updated_at)
    VALUES (@stripe_subscription_id, @stripe_customer_id, @owner_kind, @owner_id, @plan, @price_id, @price_lookup_key, @interval,
      @quantity, @status, @collection_method, @current_period_start, @current_period_end, @cancel_at_period_end, @grace_until,
      @payment_pending, @flag, @livemode, @t, @t)
    ON CONFLICT(stripe_subscription_id) DO UPDATE SET stripe_customer_id=excluded.stripe_customer_id, owner_kind=excluded.owner_kind,
      owner_id=excluded.owner_id, plan=excluded.plan, price_id=excluded.price_id, price_lookup_key=excluded.price_lookup_key,
      interval=excluded.interval, quantity=excluded.quantity, status=excluded.status, collection_method=excluded.collection_method,
      current_period_start=excluded.current_period_start, current_period_end=excluded.current_period_end,
      cancel_at_period_end=excluded.cancel_at_period_end, grace_until=excluded.grace_until, payment_pending=excluded.payment_pending,
      flag=excluded.flag, livemode=excluded.livemode, orphaned_at=NULL, updated_at=excluded.updated_at`, { ...row, t });
  const target = `${owner.owner_kind}:${owner.owner_id}`;
  if (!prev || prev.status !== row.status) audit(null, `billing.subscription.${row.status}`, target, { subscription: sub.id, from: prev?.status || null, event: event?.id || null });
  if (event && EVENT_AUDIT[event.type]) audit(null, EVENT_AUDIT[event.type], target, { subscription: sub.id, event: event.id });
  if (session) q.run('DELETE FROM billing_checkouts WHERE session_id=?', session.id);
  if (event) setEventResult(event, 'ok');
  return { result: 'ok', row: q.get('SELECT * FROM billing_subscriptions WHERE stripe_subscription_id=?', sub.id) };
}

/**
 * The shared sync: fetch the subscription (and a send_invoice subscription's open invoices) from Stripe, then write it
 * in one transaction. `event` (a verified webhook event) is recorded in the same transaction; `session` is a re-fetched
 * Checkout Session. A subscription Stripe doesn't know (404) is marked orphaned. Other Stripe errors are thrown
 * (StripeCallError): nothing is written, and a webhook answers 500 so Stripe sends it again.
 * -> { result: 'ok'|'duplicate'|'unlinked'|'missing', row? }
 */
export function syncSubscription(subId, { event = null, session = null } = {}) {
  return serialize(subId, async () => {
    let sub, openInvoices = [];
    try {
      sub = await S.getSubscription(subId);
      if (sub.collection_method === 'send_invoice') openInvoices = await S.openInvoices(sub.id);
    } catch (e) {
      if (!(e instanceof S.StripeCallError) || !e.missing) throw e;
      tx(() => {
        q.run('UPDATE billing_subscriptions SET orphaned_at=?, updated_at=? WHERE stripe_subscription_id=? AND orphaned_at IS NULL', now(), now(), subId);
        if (event) insertEvent(event, 'ignored', { subscription: subId });
      });
      log('warn', 'billing: Stripe has no such subscription', { subscription: subId, event: event?.id });
      return { result: 'missing' };
    }
    return tx(() => applySubscription(sub, { event, session, openInvoices }));
  });
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
    case 'invoice.paid': case 'invoice.payment_failed': case 'invoice.finalized': case 'invoice.overdue':
      return { subId: S.subscriptionOfInvoice(o) };
    case 'charge.refunded':
      return { subId: S.subscriptionOfInvoice(await S.invoiceForCharge(o)) };
    case 'charge.dispute.created': case 'radar.early_fraud_warning.created': {
      const inv = o.payment_intent ? await S.invoiceForPaymentIntent(idOf(o.payment_intent)) : await S.invoiceForCharge(idOf(o.charge));
      return { subId: S.subscriptionOfInvoice(inv) };
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
  const { subId, session } = await resolveEvent(event);
  if (!subId) {
    return tx(() => {
      if (!insertEvent(event, 'ignored')) return { result: 'duplicate' };
      // An expired Checkout: the owner may start again (billing_checkouts holds one open session per owner).
      if (event.type === 'checkout.session.expired' && q.run('DELETE FROM billing_checkouts WHERE session_id=?', idOf(event.data?.object)).changes) setEventResult(event, 'ok');
      return { result: q.get('SELECT result FROM billing_events WHERE event_id=?', event.id).result };
    });
  }
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
  return syncSubscription(idOf(session.subscription), { session });
}

// ---- The reconcile job ----

/** Re-fetches every current-mode subscription that isn't canceled, and every one whose grace has ended, through the
 *  shared sync path (a missed webhook can't keep or drop a plan). Errors are caught per subscription. */
export async function reconcile() {
  if (!S.billingOn()) return { skipped: true };
  const rows = q.all(`SELECT stripe_subscription_id AS id FROM billing_subscriptions WHERE livemode=? AND orphaned_at IS NULL
    AND (status <> 'canceled' OR (grace_until IS NOT NULL AND grace_until < ?))`, S.currentLivemode(), now());
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
  try { await S.prices({ refresh: true }); } catch (e) { log('warn', 'billing: prices not read', e instanceof S.StripeCallError ? e.fields : { error: e.message }); }
  await checkTax();
  return out;
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
register('billing-reconcile', 6 * 3600e3, reconcile);

/** Tests only. */
export function _reset() { chains.clear(); warnedVersion = ''; }
