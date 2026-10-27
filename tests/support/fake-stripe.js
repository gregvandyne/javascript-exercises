// A small stand-in for Stripe's API for tests (docs/decisions.md "Paid plans", chunk 2). It never talks to Stripe and
// imports nothing from server/. The app reaches it through the real `stripe` SDK (host / port / protocol options, set
// from STRIPE_API_BASE), so requests are encoded exactly as the SDK sends them. Objects have the shapes of the pinned
// API version (2026-09-30.endive): period dates on subscription items, invoice.parent.subscription_details, invoice
// payments linking a PaymentIntent to its invoice. Webhooks are signed the way Stripe signs them, so the app's
// stripe.webhooks.constructEvent checks them for real.
//
// Unit tests start it in-process (startFakeStripe); Playwright can run it as `node tests/support/fake-stripe.js --port N`
// with the control endpoints under /_test/. Every key and secret here is a short fake value, not a credential.
import http from 'node:http';
import crypto from 'node:crypto';

export const FAKE_API_VERSION = '2026-09-30.endive';
const rid = (prefix, n = 14) => prefix + crypto.randomBytes(16).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').slice(0, n);
const sec = (t = Date.now()) => Math.floor(t / 1000);
const DAY = 86400;

/** Decodes the SDK's form / query encoding (a[b][0]=c) into nested objects and arrays. */
export function decodeForm(str) {
  const out = {};
  for (const [rawK, v] of new URLSearchParams(str)) {
    const parts = rawK.replace(/\]/g, '').split('[');
    let o = out;
    parts.forEach((p, i) => {
      const last = i === parts.length - 1;
      const nextIsIndex = !last && /^\d*$/.test(parts[i + 1]);
      const key = p === '' && Array.isArray(o) ? o.length : p;
      if (last) { o[key] = v; return; }
      if (o[key] == null) o[key] = nextIsIndex ? [] : {};
      o = o[key];
    });
  }
  return out;
}
const list = (data, url) => ({ object: 'list', data, has_more: false, url });

export async function startFakeStripe({ port = 0, host = '127.0.0.1', apiVersion = FAKE_API_VERSION, apiKey = null, webhookSecret = 'whsec_fake', webhookUrl = '', livemode = false } = {}) {
  const st = {
    customers: new Map(), subscriptions: new Map(), invoices: new Map(), charges: new Map(), invoicePayments: new Map(),
    sessions: new Map(), disputes: new Map(), efws: new Map(), refunds: new Map(), portals: new Map(),
    prices: new Map(), products: new Map(), tax: { status: 'active', registrations: [] },
  };
  const chargeOfInvoice = new Map();   // invoice id -> charge id (bookkeeping, not part of Stripe's shapes)
  const sessionExtra = new Map();      // session id -> what the fake hosted page needs to make the subscription
  const fake = { url: '', host, port: 0, apiVersion, webhookSecret, webhookUrl, livemode, requests: [], violations: [], failGets: [], slowGets: [], deliveries: [], st };

  // ---- Catalogue: the five prices, found by lookup key (like the sandbox) ----
  const addPrice = (lookup, amount, interval, product) => st.prices.set(lookup, { id: 'price_fake_' + lookup.replace(/^oomba_/, ''), object: 'price', active: true, currency: 'usd', lookup_key: lookup, product, recurring: { interval, interval_count: 1, usage_type: 'licensed' }, tax_behavior: 'exclusive', type: 'recurring', unit_amount: amount, livemode });
  // Products carry oomba_plan metadata (docs/decisions.md "Paid plans": the plan survives a new Price).
  for (const [id, plan] of [['prod_fake_basic', 'basic'], ['prod_fake_family', 'family'], ['prod_fake_school', 'school'], ['prod_fake_other', null]]) st.products.set(id, { id, object: 'product', active: true, livemode, metadata: plan ? { oomba_plan: plan } : {}, name: id });
  addPrice('oomba_basic_monthly', 499, 'month', 'prod_fake_basic');
  addPrice('oomba_basic_yearly', 4500, 'year', 'prod_fake_basic');
  addPrice('oomba_family_monthly', 799, 'month', 'prod_fake_family');
  addPrice('oomba_family_yearly', 6900, 'year', 'prod_fake_family');
  addPrice('oomba_school_seat_yearly', 2000, 'year', 'prod_fake_school');
  const priceById = id => [...st.prices.values()].find(p => p.id === id);

  // ---- Object makers (pinned shapes) ----
  fake.customer = ({ metadata = {}, address = null, email = null, name = null, taxExempt = 'none', invoiceSettings = null } = {}) => {
    const c = { id: rid('cus_'), object: 'customer', address, created: sec(), email, livemode, metadata: { ...metadata }, name, tax_exempt: taxExempt, invoice_settings: { custom_fields: invoiceSettings?.custom_fields || null } };
    st.customers.set(c.id, c); return c;
  };
  fake.invoice = ({ subscription = null, customer, status = 'paid', collectionMethod = 'charge_automatically', dueDate = null, amount = 799, created = Date.now(), billingReason = subscription ? 'subscription_create' : 'manual' } = {}) => {
    const inv = {
      id: rid('in_'), object: 'invoice', customer, status, collection_method: collectionMethod, livemode, created: sec(created), billing_reason: billingReason,
      currency: 'usd', amount_due: amount, amount_paid: status === 'paid' ? amount : 0, amount_remaining: status === 'paid' ? 0 : amount,
      due_date: dueDate ? sec(dueDate) : null, hosted_invoice_url: null, metadata: {},
      parent: subscription ? { type: 'subscription_details', quote_details: null, subscription_details: { subscription, metadata: {} } } : null,
      status_transitions: { paid_at: status === 'paid' ? sec(created) : null, finalized_at: status === 'draft' ? null : sec(created) },
    };
    st.invoices.set(inv.id, inv);
    if (status === 'paid') payment(inv);
    return inv;
  };
  // A paid invoice's PaymentIntent, its Charge and the invoice payment linking them.
  function payment(inv) {
    const pi = rid('pi_');
    const ch = { id: rid('ch_'), object: 'charge', amount: inv.amount_due, amount_refunded: 0, refunded: false, captured: true, currency: 'usd', customer: inv.customer, livemode, paid: true, payment_intent: pi, status: 'succeeded', created: sec(), disputed: false };
    st.charges.set(ch.id, ch);
    const ip = { id: rid('inpay_'), object: 'invoice_payment', amount_paid: inv.amount_due, amount_requested: inv.amount_due, created: sec(), currency: 'usd', invoice: inv.id, is_default: true, livemode, payment: { type: 'payment_intent', payment_intent: pi }, status: 'paid', status_transitions: { canceled_at: null, paid_at: sec() } };
    st.invoicePayments.set(ip.id, ip);
    chargeOfInvoice.set(inv.id, ch.id);
    return ch;
  }
  fake.payInvoice = (invId, { outOfBand = false } = {}) => {
    const inv = st.invoices.get(invId); inv.status = 'paid'; inv.amount_paid = inv.amount_due; inv.amount_remaining = 0; inv.status_transitions.paid_at = sec();
    if (outOfBand) inv.paid_out_of_band = true;
    else if (!chargeOfInvoice.has(inv.id)) payment(inv);
    return inv;
  };
  /** The next card payment for a seat change fails (the subscription keeps its quantity, with a pending_update). */
  fake.failNextPayment = (n = 1) => { fake.failPayments = (fake.failPayments || 0) + n; };
  /** A seat change (POST /v1/subscriptions/:id with items[0][quantity]), the way Stripe does it for our parameters:
   *  always_invoice bills the difference at once (a card payment that fails leaves the quantity, pending_if_incomplete);
   *  none just changes the quantity. */
  fake.changeQuantity = (s, quantity, { proration = 'create_prorations', paymentBehavior = null } = {}) => {
    const item = s.items.data[0]; const old = item.quantity;
    if (proration !== 'always_invoice' || quantity <= old) { item.quantity = quantity; return s; }
    const amount = (item.price.unit_amount || 0) * (quantity - old);
    if (s.collection_method === 'send_invoice') {
      const inv = fake.invoice({ subscription: s.id, customer: s.customer, status: 'open', collectionMethod: 'send_invoice', dueDate: Date.now() + 30 * DAY * 1000, amount, billingReason: 'subscription_update' });
      s.latest_invoice = inv.id; item.quantity = quantity; return s;
    }
    const fails = (fake.failPayments || 0) > 0;
    if (fails) fake.failPayments--;
    const inv = fake.invoice({ subscription: s.id, customer: s.customer, status: fails ? 'open' : 'paid', amount, billingReason: 'subscription_update' });
    if (fails && paymentBehavior === 'pending_if_incomplete') {
      s.pending_update = { expires_at: sec() + DAY, subscription_items: [{ id: item.id, quantity, price: item.price.id }] };
      s.pending_update_invoice = inv.id;   // bookkeeping only
      return s;
    }
    s.latest_invoice = inv.id; item.quantity = quantity; s.pending_update = null;
    return s;
  };
  /** A new billing period (the yearly renewal): the period moves on and a renewal invoice is made for the quantity. */
  fake.renew = (subId, { paid = true } = {}) => {
    const s = st.subscriptions.get(subId); const item = s.items.data[0];
    const len = item.current_period_end - item.current_period_start;
    item.current_period_start = item.current_period_end; item.current_period_end += len;
    const send = s.collection_method === 'send_invoice';
    const inv = fake.invoice({ subscription: s.id, customer: s.customer, status: send ? 'open' : paid ? 'paid' : 'open', collectionMethod: s.collection_method, dueDate: send ? Date.now() + 30 * DAY * 1000 : null, amount: (item.price.unit_amount || 0) * item.quantity, billingReason: 'subscription_cycle' });
    s.latest_invoice = inv.id;
    if (!send && !paid) s.status = 'past_due';
    return s;
  };
  /** A subscription with one item and a latest invoice. invoice: 'paid' | 'open' | 'draft' | null; dueDate (ms) for open send_invoice ones. */
  fake.subscription = ({ description = null, customer = null, lookupKey = 'oomba_family_monthly', status = 'active', collectionMethod = 'charge_automatically', metadata = {}, quantity = 1, cancelAtPeriodEnd = false, periodStart = Date.now(), invoice = 'paid', dueDate = null, customerMetadata = {} } = {}) => {
    const cus = customer || fake.customer({ metadata: customerMetadata }).id;
    const price = st.prices.get(lookupKey) || { id: 'price_fake_other', object: 'price', lookup_key: null, product: 'prod_fake_other', recurring: { interval: 'month', interval_count: 1 }, unit_amount: 100, currency: 'usd', livemode };
    const start = sec(periodStart); const end = start + (price.recurring.interval === 'year' ? 365 : 30) * DAY;
    const sub = {
      id: rid('sub_'), object: 'subscription', billing_mode: { type: 'flexible' }, description, pending_update: null, cancel_at: cancelAtPeriodEnd ? end : null, cancel_at_period_end: cancelAtPeriodEnd,
      canceled_at: null, collection_method: collectionMethod, created: start, currency: 'usd', customer: cus,
      days_until_due: collectionMethod === 'send_invoice' ? 30 : null, ended_at: null, latest_invoice: null, livemode, metadata: { ...metadata },
      status, items: { object: 'list', data: [{ id: rid('si_'), object: 'subscription_item', current_period_start: start, current_period_end: end, price, quantity, metadata: {} }], has_more: false, url: '/v1/subscription_items' },
    };
    st.subscriptions.set(sub.id, sub);
    if (invoice) sub.latest_invoice = fake.invoice({ subscription: sub.id, customer: cus, status: invoice, collectionMethod, dueDate, amount: price.unit_amount * quantity }).id;
    return sub;
  };
  fake.update = (subId, patch) => {
    const s = st.subscriptions.get(subId);
    if ('cancelAtPeriodEnd' in patch) { s.cancel_at_period_end = patch.cancelAtPeriodEnd; s.cancel_at = patch.cancelAtPeriodEnd ? s.items.data[0].current_period_end : null; }
    if (patch.status) { s.status = patch.status; if (patch.status === 'canceled') { s.canceled_at = s.ended_at = sec(); } }
    if (patch.periodEnd) s.items.data[0].current_period_end = sec(patch.periodEnd);
    if (patch.latestInvoice) s.latest_invoice = patch.latestInvoice;
    return s;
  };
  /** A plan switch in the Customer Portal (Basic <-> Family, monthly <-> yearly): the same subscription gets the other
   *  price; Stripe prorates and sends customer.subscription.updated. */
  fake.switchPrice = (subId, lookupKey) => {
    const s = st.subscriptions.get(subId); const price = st.prices.get(lookupKey);
    if (!s || !price) throw new Error('no such subscription or price');
    s.items.data[0].price = price;
    return s;
  };
  fake.chargeOf = invId => st.charges.get(chargeOfInvoice.get(invId));
  fake.sessionExtra = id => sessionExtra.get(id) || {};
  fake.dispute = chargeId => { const ch = st.charges.get(chargeId); const d = { id: rid('dp_'), object: 'dispute', amount: ch.amount, charge: ch.id, payment_intent: ch.payment_intent, currency: 'usd', livemode, reason: 'fraudulent', status: 'needs_response', created: sec() }; ch.disputed = true; st.disputes.set(d.id, d); return d; };
  fake.earlyFraudWarning = chargeId => { const ch = st.charges.get(chargeId); const w = { id: rid('issfr_'), object: 'radar.early_fraud_warning', actionable: true, charge: ch.id, payment_intent: ch.payment_intent, created: sec(), fraud_type: 'unauthorized_use_of_card', livemode }; st.efws.set(w.id, w); return w; };
  fake.refund = (chargeId, amount = null) => { const ch = st.charges.get(chargeId); ch.amount_refunded = amount ?? ch.amount; ch.refunded = ch.amount_refunded >= ch.amount; return ch; };
  fake.session = ({ customer = null, subscription = null, status = 'complete', paymentStatus = 'paid', metadata = {}, clientReferenceId = null, mode = 'subscription' } = {}) => {
    const s = { id: rid('cs_test_', 24), object: 'checkout.session', client_reference_id: clientReferenceId, customer, livemode, metadata: { ...metadata }, mode, payment_status: paymentStatus, status, subscription, url: null, integration_identifier: null, created: sec(), expires_at: sec() + DAY };
    s.url = `${fake.url}/pay/${s.id}`;
    st.sessions.set(s.id, s); return s;
  };
  const expandSub = (s, expand = []) => {
    const o = structuredClone(s);
    if (expand.includes('latest_invoice') && o.latest_invoice) o.latest_invoice = structuredClone(st.invoices.get(o.latest_invoice));
    if (expand.includes('customer')) o.customer = structuredClone(st.customers.get(o.customer)) || o.customer;
    if (expand.includes('items.data.price.product')) for (const it of o.items.data) if (typeof it.price?.product === 'string') it.price.product = structuredClone(st.products.get(it.price.product)) || it.price.product;
    return o;
  };
  /** The object an event carries (the current state, as Stripe sends it). */
  const objectOf = id => structuredClone(st.subscriptions.get(id) || st.invoices.get(id) || st.charges.get(id) || st.sessions.get(id) || st.disputes.get(id) || st.efws.get(id) || st.customers.get(id));

  // ---- Webhooks ----
  fake.event = (type, objOrId, { id = rid('evt_', 24), livemode: lm = livemode, api_version = apiVersion, created = sec() } = {}) => ({
    id, object: 'event', api_version, created, data: { object: typeof objOrId === 'string' ? objectOf(objOrId) : structuredClone(objOrId) },
    livemode: lm, pending_webhooks: 1, request: { id: null, idempotency_key: null }, type,
  });
  /** Stripe-Signature for a payload: t=<seconds>,v1=HMAC-SHA256(secret, "<t>.<payload>"). */
  fake.sign = (payload, { secret = fake.webhookSecret, timestamp = sec() } = {}) => `t=${timestamp},v1=${crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex')}`;
  /** POSTs an event to the webhook URL, signed. -> { status, body } */
  fake.deliver = async (event, { url = fake.webhookUrl, secret, timestamp, header, payload } = {}) => {
    const body = payload ?? JSON.stringify(event);
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8', 'stripe-signature': header ?? fake.sign(body, { secret, timestamp }), 'user-agent': 'Stripe/1.0 (+https://stripe.com/docs/webhooks)' }, body });
    const out = { status: res.status, body: await res.text() };
    fake.deliveries.push({ type: event?.type, id: event?.id, status: out.status });
    return out;
  };
  fake.emit = (type, objOrId, opts = {}) => fake.deliver(fake.event(type, objOrId, opts), opts);
  /** The next n GETs answer 500 (with stripe-should-retry: false, so the SDK doesn't retry). */
  /** The next GET's answer is taken now but sent after ms. */
  fake.delayNextGet = ms => { fake.slowGets.push(ms); };
  fake.failNextGet = (n = 1, status = 500) => { for (let i = 0; i < n; i++) fake.failGets.push(status); };

  // ---- HTTP ----
  const err = (res, status, type, code, message, param) => { res.writeHead(status, { 'content-type': 'application/json', 'request-id': rid('req_'), 'stripe-should-retry': 'false' }); res.end(JSON.stringify({ error: { type, code, message, param } })); };
  // A delayed answer is computed now (the state as it is) and sent later: an "older" read arriving after a newer one.
  const ok = (res, obj) => (res.delayMs ? setTimeout(() => send(res, obj), res.delayMs) : send(res, obj));
  const idem = new Map();   // Idempotency-Key -> the first answer (Stripe replays it for a retried POST)
  const send = (res, obj) => { if (res.idemKey) idem.set(res.idemKey, obj); res.writeHead(200, { 'content-type': 'application/json', 'request-id': rid('req_'), 'stripe-version': apiVersion }); res.end(JSON.stringify(obj)); };
  const missing = (res, what, id) => err(res, 404, 'invalid_request_error', 'resource_missing', `No such ${what}: '${id}'`, 'id');
  const readBody = req => new Promise(r => { let d = ''; req.on('data', c => { d += c; }); req.on('end', () => r(d)); });

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    const raw = await readBody(req);
    const params = req.method === 'GET' || req.method === 'DELETE' ? decodeForm(u.search.slice(1)) : (/json/.test(req.headers['content-type'] || '') ? JSON.parse(raw || '{}') : decodeForm(raw));
    const p = u.pathname;
    // Control endpoints (Playwright): no API key.
    if (p.startsWith('/_test/')) {
      try {
        const b = JSON.parse(raw || '{}');
        if (p === '/_test/fail-next-get') { fake.failNextGet(b.n || 1, b.status || 500); return ok(res, { ok: true }); }
        if (p === '/_test/emit') return ok(res, await fake.emit(b.type, b.id, b));
        if (p === '/_test/state') return ok(res, { subscriptions: [...st.subscriptions.values()], requests: fake.requests.length, violations: fake.violations, checkouts: fake.requests.filter(r => r.path === '/v1/checkout/sessions').map(r => r.params) });
        // The period ends (a plan cancelled at the period end): canceled, and Stripe's customer.subscription.deleted.
        if (p === '/_test/end-period') { fake.update(b.subscription, { status: 'canceled' }); return ok(res, await fake.emit('customer.subscription.deleted', b.subscription)); }
        // The owner refunds the latest payment in the Dashboard: a full refund and charge.refunded.
        // An invoice school's open invoices fall due (b.days ago, default 1) and Stripe sends invoice.overdue.
        if (p === '/_test/overdue') {
          const open = [...st.invoices.values()].filter(i => i.parent?.subscription_details?.subscription === b.subscription && i.status === 'open');
          for (const i of open) i.due_date = sec(Date.now() - (b.days ?? 1) * DAY * 1000);
          return ok(res, open.length ? await fake.emit('invoice.overdue', open[0].id) : { status: 404 });
        }
        // The grown-up switches plans in the Portal (b.lookupKey, e.g. oomba_basic_monthly).
        if (p === '/_test/switch-plan') { fake.switchPrice(b.subscription, b.lookupKey); return ok(res, await fake.emit('customer.subscription.updated', b.subscription)); }
        if (p === '/_test/fail-next-payment') { fake.failNextPayment(b.n || 1); return ok(res, { ok: true }); }
        if (p === '/_test/refund-latest') { const sub = st.subscriptions.get(b.subscription); const ch = fake.chargeOf(sub.latest_invoice); fake.refund(ch.id, b.amount ?? null); return ok(res, await fake.emit('charge.refunded', ch.id)); }
      } catch (e) { return err(res, 400, 'invalid_request_error', null, e.message); }
      return err(res, 404, 'invalid_request_error', null, 'unknown control endpoint');
    }
    // The fake Customer Portal: one "Cancel plan" button (cancel at the period end, like the sandbox's Portal), then back.
    if (p.startsWith('/portal/')) {
      const [, , id, action] = p.split('/');
      const ps = st.portals.get(id);
      if (!ps) return err(res, 404, 'invalid_request_error', null, 'no portal session');
      const sub = [...st.subscriptions.values()].find(x => x.customer === ps.customer && ['active', 'trialing', 'past_due'].includes(x.status));
      if (req.method === 'POST' && action === 'cancel' && sub) {
        fake.update(sub.id, { cancelAtPeriodEnd: true });
        await fake.emit('customer.subscription.updated', sub.id);
        res.writeHead(303, { location: ps.return_url || '/' }); return res.end();
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(`<!doctype html><title>Fake portal</title><h1>Fake Stripe portal</h1>${sub ? `<p id="plan">Plan ${sub.id}: ${sub.status}${sub.cancel_at_period_end ? ', ends at the period end' : ''}</p><form method="post" action="/portal/${id}/cancel"><button id="cancel">Cancel plan</button></form>` : '<p>No plan</p>'}<p><a id="back" href="${ps.return_url || '/'}">Return</a></p>`);
    }
    // The fake hosted Checkout page: completes the session, then sends the webhooks Stripe would.
    if (req.method === 'GET' && p.startsWith('/pay/')) {
      const s = st.sessions.get(p.slice(5));
      if (!s || s.status !== 'open') return err(res, 404, 'invalid_request_error', null, 'no open session');
      const x = sessionExtra.get(s.id) || {};
      const sub = fake.subscription({ customer: s.customer, lookupKey: x.lookupKey, metadata: x.subscriptionMetadata || {}, quantity: x.quantity || 1 });
      Object.assign(s, { status: 'complete', payment_status: 'paid', subscription: sub.id });
      await fake.emit('customer.subscription.created', sub.id);
      await fake.emit('checkout.session.completed', s.id);
      res.writeHead(302, { location: String(x.successUrl || '/').replace('{CHECKOUT_SESSION_ID}', s.id) }); return res.end();
    }
    fake.requests.push({ method: req.method, path: p, params, version: req.headers['stripe-version'] || null, idempotencyKey: req.headers['idempotency-key'] || null, auth: !!req.headers.authorization });
    if (/payment_method_types/.test(decodeURIComponent(u.search + raw))) {
      fake.violations.push({ method: req.method, path: p });
      return err(res, 400, 'invalid_request_error', 'parameter_unknown', 'payment_method_types is not allowed here (use payment method configurations)', 'payment_method_types');
    }
    const auth = String(req.headers.authorization || '');
    if (!/^Bearer \S+$/.test(auth) || (apiKey && auth !== `Bearer ${apiKey}`)) return err(res, 401, 'invalid_request_error', null, 'Invalid API Key provided');
    if (req.headers['stripe-version'] !== apiVersion) return err(res, 400, 'invalid_request_error', 'api_version_invalid', 'unexpected Stripe-Version');
    if (req.method === 'GET' && fake.slowGets.length) res.delayMs = fake.slowGets.shift();
    if (req.method === 'GET' && fake.failGets.length) { const s = fake.failGets.shift(); return err(res, s, 'api_error', null, 'fake failure'); }
    const expand = params.expand || [];
    if (req.method === 'POST' && req.headers['idempotency-key']) {
      const k = req.headers['idempotency-key'];
      if (idem.has(k)) return send(res, idem.get(k));
      res.idemKey = k;
    }
    let m;
    // GETs
    if (req.method === 'GET') {
      if ((m = p.match(/^\/v1\/subscriptions\/([\w]+)$/))) { const s = st.subscriptions.get(m[1]); return s ? ok(res, expandSub(s, expand)) : missing(res, 'subscription', m[1]); }
      if ((m = p.match(/^\/v1\/invoices\/([\w]+)$/))) { const i = st.invoices.get(m[1]); return i ? ok(res, i) : missing(res, 'invoice', m[1]); }
      if (p === '/v1/invoices') return ok(res, list([...st.invoices.values()].filter(i => (!params.subscription || i.parent?.subscription_details?.subscription === params.subscription) && (!params.status || i.status === params.status)), '/v1/invoices'));
      if ((m = p.match(/^\/v1\/charges\/([\w]+)$/))) { const c = st.charges.get(m[1]); return c ? ok(res, c) : missing(res, 'charge', m[1]); }
      if ((m = p.match(/^\/v1\/checkout\/sessions\/([\w]+)$/))) { const s = st.sessions.get(m[1]); return s ? ok(res, s) : missing(res, 'checkout.session', m[1]); }
      if (p === '/v1/invoice_payments') {
        const pi = params.payment?.payment_intent;
        const data = [...st.invoicePayments.values()].filter(ip => (!params.invoice || ip.invoice === params.invoice) && (!pi || ip.payment.payment_intent === pi))
          .map(ip => (expand.includes('data.invoice') ? { ...ip, invoice: st.invoices.get(ip.invoice) } : ip));
        return ok(res, list(data, '/v1/invoice_payments'));
      }
      if (p === '/v1/prices') { const keys = params.lookup_keys || []; return ok(res, list([...st.prices.values()].filter(x => !keys.length || keys.includes(x.lookup_key)), '/v1/prices')); }
      if (p === '/v1/tax/settings') return ok(res, { object: 'tax.settings', defaults: { provider: 'stripe', tax_behavior: 'exclusive', tax_code: null }, head_office: st.tax.status === 'active' ? { address: { country: 'US', state: 'CA' } } : null, livemode, status: st.tax.status, status_details: {} });
      if (p === '/v1/tax/registrations') return ok(res, list(st.tax.registrations.filter(r => !params.status || params.status === 'all' || r.status === params.status), '/v1/tax/registrations'));
    }
    if (req.method === 'DELETE' && (m = p.match(/^\/v1\/subscriptions\/([\w]+)$/))) {
      const s = st.subscriptions.get(m[1]); if (!s) return missing(res, 'subscription', m[1]);
      fake.update(s.id, { status: 'canceled' }); return ok(res, s);
    }
    if (req.method === 'POST') {
      if (p === '/v1/customers') return ok(res, fake.customer({ metadata: params.metadata || {}, address: params.address || null, email: params.email || null, name: params.name || null, taxExempt: params.tax_exempt || 'none', invoiceSettings: params.invoice_settings || null }));
      if ((m = p.match(/^\/v1\/customers\/([\w]+)$/))) {
        const c = st.customers.get(m[1]); if (!c) return missing(res, 'customer', m[1]);
        Object.assign(c.metadata, params.metadata || {});
        for (const k of ['address', 'email', 'name', 'tax_exempt']) if (params[k]) c[k] = params[k];
        if (params.invoice_settings) c.invoice_settings = { custom_fields: params.invoice_settings.custom_fields || null };
        return ok(res, c);
      }
      if (p === '/v1/checkout/sessions') {
        const item = (params.line_items || [])[0] || {};
        const price = priceById(item.price);
        if (!price) return err(res, 400, 'invalid_request_error', 'resource_missing', 'No such price', 'line_items[0][price]');
        const s = fake.session({ customer: params.customer || fake.customer().id, status: 'open', paymentStatus: 'unpaid', metadata: params.metadata || {}, clientReferenceId: params.client_reference_id || null, mode: params.mode });
        Object.assign(s, { subscription: null, success_url: params.success_url, cancel_url: params.cancel_url || null, integration_identifier: params.integration_identifier || null });
        sessionExtra.set(s.id, { successUrl: params.success_url, paymentMethodConfiguration: params.payment_method_configuration || null, subscriptionMetadata: params.subscription_data?.metadata || {}, lookupKey: price.lookup_key, quantity: Number(item.quantity) || 1 });
        return ok(res, s);
      }
      if ((m = p.match(/^\/v1\/checkout\/sessions\/([\w]+)\/expire$/))) { const s = st.sessions.get(m[1]); if (!s) return missing(res, 'checkout.session', m[1]); if (s.status !== 'open') return err(res, 400, 'invalid_request_error', 'checkout_session_not_open', `This Checkout Session is ${s.status}`); s.status = 'expired'; return ok(res, s); }
      if (p === '/v1/billing_portal/sessions') { const ps = { id: rid('bps_'), object: 'billing_portal.session', customer: params.customer, livemode, return_url: params.return_url || null, configuration: params.configuration || null }; ps.url = `${fake.url}/portal/${ps.id}`; st.portals.set(ps.id, ps); return ok(res, ps); }
      if (p === '/v1/subscriptions') { const s = fake.subscription({ description: params.description || null, customer: params.customer, lookupKey: [...st.prices.values()].find(x => x.id === params.items?.[0]?.price)?.lookup_key, collectionMethod: params.collection_method || 'charge_automatically', metadata: params.metadata || {}, quantity: Number(params.items?.[0]?.quantity) || 1, invoice: params.collection_method === 'send_invoice' ? 'open' : 'paid', dueDate: params.collection_method === 'send_invoice' ? Date.now() + 30 * DAY * 1000 : null }); return ok(res, s); }
      if ((m = p.match(/^\/v1\/subscriptions\/([\w]+)$/))) {
        const s = st.subscriptions.get(m[1]); if (!s) return missing(res, 'subscription', m[1]);
        if ('cancel_at_period_end' in params) fake.update(s.id, { cancelAtPeriodEnd: params.cancel_at_period_end === 'true' });
        if (params.items?.[0]?.quantity) {
          if (params.items[0].id && params.items[0].id !== s.items.data[0].id) return err(res, 400, 'invalid_request_error', 'resource_missing', 'No such subscription item', 'items[0][id]');
          fake.changeQuantity(s, Number(params.items[0].quantity), { proration: params.proration_behavior || 'create_prorations', paymentBehavior: params.payment_behavior || null });
        }
        if (params.metadata) Object.assign(s.metadata, params.metadata);
        return ok(res, s);
      }
      if (p === '/v1/refunds') { const ch = [...st.charges.values()].find(c => c.payment_intent === params.payment_intent); if (!ch) return missing(res, 'payment_intent', params.payment_intent); if (ch.refunded) return err(res, 400, 'invalid_request_error', 'charge_already_refunded', 'Charge has already been refunded.'); fake.refund(ch.id, params.amount ? Number(params.amount) : null); const r = { id: rid('re_'), object: 'refund', amount: ch.amount_refunded, charge: ch.id, payment_intent: ch.payment_intent, status: 'succeeded' }; st.refunds.set(r.id, r); return ok(res, r); }
      if ((m = p.match(/^\/v1\/invoices\/([\w]+)\/pay$/))) { const i = st.invoices.get(m[1]); if (!i) return missing(res, 'invoice', m[1]); if (i.status !== 'open') return err(res, 400, 'invalid_request_error', 'invoice_not_open', 'Invoice is not open'); return ok(res, fake.payInvoice(i.id, { outOfBand: params.paid_out_of_band === 'true' })); }
    }
    return err(res, 404, 'invalid_request_error', null, `Unrecognized request URL (${req.method}: ${p})`);
  });
  await new Promise(r => server.listen(port, host, r));
  fake.port = server.address().port;
  fake.url = `http://${host}:${fake.port}`;
  fake.close = () => new Promise(r => { server.closeAllConnections?.(); server.close(() => r()); });
  return fake;
}

// `node tests/support/fake-stripe.js --port 5962 [--webhook http://127.0.0.1:5961/api/billing/webhook] [--secret whsec_fake]`
if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (name, d) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : d; };
  const f = await startFakeStripe({ port: Number(arg('--port', 0)), webhookUrl: arg('--webhook', ''), webhookSecret: arg('--secret', 'whsec_fake') });
  console.log(JSON.stringify({ msg: 'fake stripe listening', url: f.url }));
}
