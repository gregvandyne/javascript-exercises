// Stripe client (docs/decisions.md "Paid plans", chunk 2). The only file that imports the `stripe` SDK (pinned to an
// exact version in package.json). One client instance, made on first use from config; never a global or module-level
// key. The SDK is loaded only when billing is on, so with STRIPE_API_KEY unset nothing here runs.
//
// Keys and webhook secrets are never logged, put in an error message or returned: Stripe errors are turned into
// StripeCallError, which carries only { type, code, statusCode, requestId }.
import { config } from '../config.js';

/** Lookup keys of the prices we sell (set on the sandbox and live Prices; docs/decisions.md "Paid plans" §16). Prices
 *  are always found by these, so live mode only needs Prices with the same lookup keys. */
export const PRICE_LOOKUP_KEYS = Object.freeze({
  basicMonthly: 'oomba_basic_monthly',
  basicYearly: 'oomba_basic_yearly',
  familyMonthly: 'oomba_family_monthly',
  familyYearly: 'oomba_family_yearly',
  schoolSeatYearly: 'oomba_school_seat_yearly',
});
/** Which plan a lookup key sells: 'basic' (one child) and 'family' are both plans of a family (a grown-up's account),
 *  'school' of a school. */
export const planOfLookupKey = k => (/^oomba_basic_/.test(k || '') ? 'basic' : /^oomba_family_/.test(k || '') ? 'family' : /^oomba_school_/.test(k || '') ? 'school' : null);
/** The lookup key of a family-type plan's price: plan 'basic' | 'family', interval 'month' | 'year'. */
export const lookupKeyFor = (plan, interval) => `oomba_${plan}_${interval === 'year' ? 'yearly' : 'monthly'}`;

/** 'off' | 'test' | 'live', read from config each time (tests change config). Billing is on with a key and a webhook
 *  secret; config.js refuses an sk_live_ key and a live key without STRIPE_LIVE_OK before the server starts. */
export function billingMode() {
  if (!config.stripeApiKey || !config.stripeWebhookSecret) return 'off';
  return /^[rs]k_live_/.test(config.stripeApiKey) ? 'live' : 'test';
}
export const billingOn = () => billingMode() !== 'off';
/** 1 for live rows, 0 for test rows: every billing query filters on it (a test row never counts with a live key). */
export const currentLivemode = () => (billingMode() === 'live' ? 1 : 0);

/** A failed Stripe call, safe to log: never the key, the request body or Stripe's message text. */
export class StripeCallError extends Error {
  constructor(e) {
    super(`stripe ${e?.type || 'error'}${e?.code ? ' ' + e.code : ''}${e?.statusCode ? ' ' + e.statusCode : ''}`);
    this.name = 'StripeCallError';
    this.type = e?.type || 'StripeError';
    this.code = e?.code || null;
    this.statusCode = e?.statusCode || null;
    this.requestId = e?.requestId || null;
  }
  /** The fields for a log line. */
  get fields() { return { type: this.type, code: this.code, statusCode: this.statusCode, requestId: this.requestId }; }
  get missing() { return this.statusCode === 404 || this.code === 'resource_missing'; }
}

let sdk = null;          // the module, loaded once
let client = null;       // the one client instance
let clientFor = '';      // the settings it was made with (tests point it somewhere else)
async function loadSdk() {
  if (!sdk) sdk = (await import('stripe')).default;
  return sdk;
}
/** The client. Throws when billing is off. */
export async function stripe() {
  if (!billingOn()) throw new Error('billing is off');
  const Stripe = await loadSdk();
  const key = [config.stripeApiKey, config.stripeApiVersion, config.stripeApiBase].join('\n');
  if (!client || clientFor !== key) {
    const opts = { apiVersion: config.stripeApiVersion, maxNetworkRetries: 2, timeout: 10_000, appInfo: { name: 'oomba-academy' }, telemetry: false };
    if (config.stripeApiBase) {
      // Tests only (config.js refuses STRIPE_API_BASE in production): the same SDK, pointed at tests/support/fake-stripe.js.
      const u = new URL(config.stripeApiBase);
      Object.assign(opts, { host: u.hostname, port: Number(u.port) || (u.protocol === 'http:' ? 80 : 443), protocol: u.protocol.replace(':', '') });
    }
    client = new Stripe(config.stripeApiKey, opts);
    clientFor = key;
  }
  return client;
}
/** Runs one call; any SDK error becomes a StripeCallError. */
async function call(fn) {
  const s = await stripe();
  try { return await fn(s); } catch (e) { throw new StripeCallError(e); }
}

// ---- Reads used by the sync path (server/services/billing.js) ----

/** A subscription with its latest invoice, its customer and its price's Product expanded (one request; the Product's
 *  oomba_plan metadata names the plan when a Price has lost its lookup key). */
export const getSubscription = id => call(s => s.subscriptions.retrieve(id, { expand: ['latest_invoice', 'customer', 'items.data.price.product'] }));
export const getInvoice = id => call(s => s.invoices.retrieve(id));
/** A subscription's open invoices (send_invoice grace looks at every one, not only the latest). */
export const openInvoices = subscriptionId => call(async s => (await s.invoices.list({ subscription: subscriptionId, status: 'open', limit: 100 })).data);
export const getCharge = id => call(s => s.charges.retrieve(id));
export const getCheckoutSession = id => call(s => s.checkout.sessions.retrieve(id));
/** The invoice a payment belongs to. From API basil on a Charge no longer names its invoice: Stripe's invoice payments
 *  link a PaymentIntent to its invoice. -> the invoice (with `parent`) or null (not an invoice payment). */
export const invoiceForPaymentIntent = paymentIntentId => call(async s => {
  const list = await s.invoicePayments.list({ payment: { type: 'payment_intent', payment_intent: paymentIntentId }, expand: ['data.invoice'], limit: 10 });
  const ip = list.data.find(p => p.invoice && typeof p.invoice === 'object') || list.data[0];
  if (!ip) return null;
  return typeof ip.invoice === 'object' ? ip.invoice : s.invoices.retrieve(ip.invoice);
});
/** A charge's invoice: charge -> its PaymentIntent -> invoice payments -> invoice. -> invoice or null. */
export async function invoiceForCharge(chargeOrId) {
  const charge = typeof chargeOrId === 'string' ? await getCharge(chargeOrId) : chargeOrId;
  const pi = typeof charge?.payment_intent === 'object' ? charge.payment_intent?.id : charge?.payment_intent;
  return pi ? invoiceForPaymentIntent(pi) : null;
}
/** The subscription id an invoice was made for (basil and later: invoice.parent.subscription_details). */
export const subscriptionOfInvoice = inv => {
  const sub = inv?.parent?.subscription_details?.subscription;
  return (typeof sub === 'object' ? sub?.id : sub) || null;
};

// ---- Writes (chunk 4: family checkout). Every POST carries an idempotency key made from our own ids and the action,
// so a retry never repeats it and one key never goes with other parameters. Never `payment_method_types` (BP-4). ----

/** integration_identifier of each Checkout flow (API dahlia and later), so the Dashboard can compare them: made once,
 *  with 8 random letters as Stripe asks. Never change them (the Dashboard groups sessions by them). */
export const INTEGRATION_IDS = Object.freeze({ family: 'oomba_family_qhzvtrkm', school: 'oomba_school_wbnxjfpd' });

/** A Customer for an owner, with no name or email from us (Checkout asks for the email; Stripe keeps it). */
export const createCustomer = (params, idempotencyKey) => call(s => s.customers.create(params, { idempotencyKey }));
export const createCheckoutSession = (params, idempotencyKey) => call(s => s.checkout.sessions.create(params, { idempotencyKey }));
export const expireCheckoutSession = id => call(s => s.checkout.sessions.expire(id, {}, { idempotencyKey: `expire-${id}` }));
/** A Customer Portal session (the sandbox's default Portal configuration). */
export const createPortalSession = (params, idempotencyKey) => call(s => s.billingPortal.sessions.create(params, { idempotencyKey }));
/** Ends a subscription now, with no proration credit (a refund, a dispute, a fraud warning or a duplicate). */
export const cancelSubscriptionNow = (id, why) => call(s => s.subscriptions.cancel(id, { prorate: false, invoice_now: false }, { idempotencyKey: `cancel-${why}-${id}` }));
/** The PaymentIntent that paid an invoice (through its invoice payments), or null. */
export const paymentIntentOfInvoice = invoiceId => call(async s => {
  const list = await s.invoicePayments.list({ invoice: invoiceId, limit: 10 });
  const ip = list.data.find(p => p.status === 'paid') || list.data[0];
  const pi = ip?.payment?.payment_intent;
  return (typeof pi === 'object' ? pi?.id : pi) || null;
});
/** A full refund of one payment. key: our id and the action (e.g. "duplicate-<subscription id>"). */
export const refundPaymentIntent = (paymentIntentId, key) => call(s => s.refunds.create({ payment_intent: paymentIntentId }, { idempotencyKey: `refund-${key}` }));

// ---- Writes for school plans (chunk 5) ----

/** Changes a Customer (a school's billing address, name, billing email, tax-exempt status). */
export const updateCustomer = (id, params, idempotencyKey) => call(s => s.customers.update(id, params, { idempotencyKey }));
/**
 * Changes a school subscription's seats (its one item's quantity).
 *   now: an increase, billed straight away (proration_behavior=always_invoice). A card school's change waits for the
 *        payment (payment_behavior=pending_if_incomplete: the quantity stays until it is paid); an invoice school gets
 *        the proration invoice at once.
 *   renewal: next year's seats, set just before the renewal with no proration.
 */
export function updateSeats(sub, quantity, { when = 'now', key }) {
  const item = sub.items?.data?.[0];
  const params = { items: [{ id: item.id, quantity }], proration_behavior: when === 'now' ? 'always_invoice' : 'none' };
  if (when === 'now' && sub.collection_method !== 'send_invoice') params.payment_behavior = 'pending_if_incomplete';
  return call(s => s.subscriptions.update(sub.id, params, { idempotencyKey: `seats-${when}-${sub.id}-${quantity}-${key}` }));
}
/** A send_invoice subscription made by the owner on /admin/billing (D7). */
export const createSubscription = (params, idempotencyKey) => call(s => s.subscriptions.create(params, { idempotencyKey }));
/** An open invoice paid outside Stripe (a paper check, BP-8): Stripe then sends invoice.paid as usual. */
export const payInvoiceOutOfBand = id => call(s => s.invoices.pay(id, { paid_out_of_band: true }, { idempotencyKey: `oob-${id}` }));

/** Our prices, found by lookup key: { [lookupKey]: { id, interval, unitAmount, currency, product } }. Cached; the
 *  reconcile job refreshes it. */
let priceCache = null;
export async function prices({ refresh = false } = {}) {
  if (priceCache && !refresh) return priceCache;
  const list = await call(s => s.prices.list({ lookup_keys: Object.values(PRICE_LOOKUP_KEYS), active: true, limit: 10 }));
  const out = {};
  for (const p of list.data) if (p.lookup_key) out[p.lookup_key] = { id: p.id, interval: p.recurring?.interval || null, unitAmount: p.unit_amount, currency: p.currency, product: typeof p.product === 'object' ? p.product?.id : p.product };
  priceCache = out;
  return out;
}

/**
 * Is Stripe Tax really collecting? `automatic_tax` charges no tax and gives no error until Tax settings are active and
 * there is an active registration (docs/decisions.md "Paid plans", BP-6). Checked only when STRIPE_TAX=1.
 * -> { on, ok, settings: 'active'|'pending'|null, registrations: n, problem: null|'settings_pending'|'no_registrations' }
 */
let lastTax = null;
export async function taxReadiness() {
  if (!config.stripeTax) return (lastTax = { on: false, ok: true, settings: null, registrations: 0, problem: null, checkedAt: Date.now() });
  const settings = await call(s => s.tax.settings.retrieve());
  const regs = await call(s => s.tax.registrations.list({ status: 'active', limit: 100 }));
  const n = regs.data.length;
  const problem = settings.status !== 'active' ? 'settings_pending' : n === 0 ? 'no_registrations' : null;
  return (lastTax = { on: true, ok: !problem, settings: settings.status, registrations: n, problem, checkedAt: Date.now() });
}
/** The last taxReadiness() result (for /admin/billing later), or null before the first check. */
export const lastTaxReadiness = () => lastTax;

/**
 * Verifies a webhook with Stripe's own check (signature over the raw body, timing-safe, 300 s tolerance), trying the
 * current secret and then the previous one. -> the event, or null when neither secret matches.
 */
export async function verifyWebhook(rawBody, header) {
  if (!billingOn() || !Buffer.isBuffer(rawBody) || !header) return null;
  const Stripe = await loadSdk();
  for (const secret of [config.stripeWebhookSecret, config.stripeWebhookSecretOld]) {
    if (!secret) continue;
    try { return Stripe.webhooks.constructEvent(rawBody, header, secret); } catch { /* the next secret, or null */ }
  }
  return null;
}

/** Tests only: forget the client and caches. */
export function _reset() { client = null; clientFor = ''; priceCache = null; lastTax = null; }
