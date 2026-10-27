// Family checkout and the Customer Portal (docs/decisions.md "Paid plans", chunk 4). Stripe-hosted pages only: the
// server makes a Checkout Session or a Portal session and the page goes there by a top-level redirect (no Stripe.js,
// no CSP change). What a payment grants is decided by the webhook (services/billing.js), never by the return page:
// the return page only asks the shared sync path to look, with the owner checked from the session itself.
//
// Before any payment or plan change the grown-up types their password again (step-up, sessions.reauth_at, valid
// STEP_UP_MS), so a child on a shared device can't buy or change a plan. While the Stripe key is a test key only
// accounts marked "billing tester" on /admin may check out (D14), so nobody "pays" with a test card for real AI money.
import { q, now, audit, uid } from '../db.js';
import { config } from '../config.js';
import { log } from './log.js';
import * as S from './stripe.js';
import * as B from './billing.js';

export const STEP_UP_MS = 10 * 60e3;
/** Did this sign-in type its password again in the last STEP_UP_MS? */
export function reauthFresh(sessionId, t = now()) {
  const r = sessionId ? q.get('SELECT reauth_at FROM sessions WHERE id=?', sessionId) : null;
  return !!(r && r.reauth_at && t - r.reauth_at < STEP_UP_MS && r.reauth_at <= t);
}
export const markReauth = sessionId => q.run('UPDATE sessions SET reauth_at=? WHERE id=?', now(), sessionId);

/** May this account pay or change a plan now? With a live key, anyone the route lets in (a grown-up, a school admin);
 *  with a test key, only billing testers and the platform admin (D14). */
export function mayBill(u) {
  const mode = S.billingMode();
  return !!u && !u.banned && (mode === 'live' || (mode === 'test' && (!!u.billing_tester || u.role === 'admin')));
}
/** The site's address for Stripe's return links: PUBLIC_URL, else this request's own origin. */
export const baseUrl = req => config.publicUrl || `${req.protocol}://${req.get('host')}`;

/** The family-type plans a grown-up can buy: Basic (one child) and Family. */
export const FAMILY_PLANS = Object.freeze(['basic', 'family']);
/**
 * Every price we sell, read from Stripe's Price objects by lookup key (cached by stripe.js; the reconcile job refreshes
 * the cache), so what a page shows always matches what Checkout charges. -> { basic, family, school } where basic and
 * family are { month: { id, unitAmount }, year: {…} } (null when either is missing) and school is { year } or null; or
 * null when billing is off or Stripe can't be read.
 */
export async function planPrices() {
  if (!S.billingOn()) return null;
  try {
    const p = await S.prices();
    const one = k => (p[k] ? { id: p[k].id, unitAmount: p[k].unitAmount } : null);
    const pair = plan => { const m = one(S.lookupKeyFor(plan, 'month')), y = one(S.lookupKeyFor(plan, 'year')); return m && y ? { month: m, year: y } : null; };
    const seat = one(S.PRICE_LOOKUP_KEYS.schoolSeatYearly);
    return { basic: pair('basic'), family: pair('family'), school: seat ? { year: seat } : null };
  } catch (e) {
    log('warn', 'billing: prices not read', e instanceof S.StripeCallError ? e.fields : { error: e.message });
    return null;
  }
}
/** A family-type plan's prices ({ month, year }), or null when they are missing, Stripe can't be read, or
 *  STRIPE_PMC_FAMILY isn't set (family-type plans are then not on sale anywhere: the "Family" payment method
 *  configuration keeps Link off, and there is no fallback to the account's default one). plan: 'basic' | 'family'. */
export async function familyPrices(plan = 'family') {
  if (!S.billingOn() || !config.stripePmcFamily || !FAMILY_PLANS.includes(plan)) return null;
  const p = await planPrices();
  return (p && p[plan]) || null;
}

const ownerKey = fid => `family:${fid}`;
/** Statuses of a plan that isn't entitled now but that Stripe may still charge or bring back (a card retry that
 *  succeeds later): a new Checkout would make two plans, so the grown-up fixes the payment in Manage billing instead. */
const STALE_STATUSES = ['past_due', 'unpaid', 'incomplete', 'paused'];
/** An owner's subscription that still waits for a payment (or a delayed payment still processing), or null. */
export const unsettledPlanOf = (kind, id) => q.all(`SELECT * FROM billing_subscriptions WHERE owner_kind=? AND owner_id=? AND plan IN (${B.PLANS_OF[kind].map(() => '?').join(',')}) AND livemode=?
    AND orphaned_at IS NULL`, kind, String(id), ...B.PLANS_OF[kind], S.currentLivemode())
  .find(r => STALE_STATUSES.includes(r.status) || (r.payment_pending && ['active', 'trialing'].includes(r.status))) || null;
/** The family's subscription that still waits for a payment (or a delayed payment still processing), or null. */
export const unsettledPlan = fid => unsettledPlanOf('family', fid);
const openSession = (kind, id) => q.get('SELECT * FROM billing_checkouts WHERE owner_kind=? AND owner_id=? AND livemode=?', kind, String(id), S.currentLivemode()) || null;

/** An owner's Stripe Customer, made the first time (metadata only: no name or email from us) and reused after. */
export async function ownerCustomer(kind, id) {
  const known = B.customerOf(kind, id);
  if (known) return known;
  const mode = S.currentLivemode();
  const c = await S.createCustomer({ metadata: { owner_kind: kind, owner_id: id, [`${kind}_id`]: id } }, `customer-${kind}-${id}-${mode}`);
  B.linkCustomer(c.id, kind, id, mode);
  return B.customerOf(kind, id) || c.id;
}
const familyCustomer = fid => ownerCustomer('family', fid);

/** Ends the owner's earlier open Checkout (one open session per owner). -> 'gone' (nothing open any more) or 'paid'
 *  (it was completed meanwhile: the plan is on its way). Other Stripe errors are thrown. */
export async function endOpenSession(fid, kind = 'family') {
  const row = openSession(kind, fid);
  if (!row) return 'gone';
  let state = 'gone';
  try { await S.expireCheckoutSession(row.session_id); } catch (e) {
    if (!(e instanceof S.StripeCallError)) throw e;
    if (!e.missing) {
      const s = await S.getCheckoutSession(row.session_id);
      if (s.status === 'complete') state = 'paid';
      else if (s.status !== 'expired') throw e;
    }
  }
  if (state === 'gone') q.run('DELETE FROM billing_checkouts WHERE owner_kind=? AND owner_id=? AND session_id=?', kind, String(fid), row.session_id);
  return state;
}

/**
 * A Checkout Session for a family-type plan. family: the families row; user: the grown-up; plan: 'basic' | 'family';
 * interval: 'month' | 'year'; base: the site's address. One at a time per family (an earlier open session is expired
 * first). No child needs to be linked first: the grown-up pays, then adds their children on /family.
 * A plan that isn't entitled but is still unsettled at Stripe (past_due after grace, unpaid, incomplete, paused, or a
 * delayed payment) refuses with 'fixPayment' (Manage billing), so a late card retry can't leave two plans billed.
 * -> { ok: true, url } | { ok: false, code: 'entitled' | 'fixPayment' | 'paying' | 'noPrice' }
 */
export function startFamilyCheckout({ family, user, interval, base, plan = 'family' }) {
  const fid = family.id;
  return B.serialize(`checkout-start:family:${fid}`, async () => {
    if (B.ownerPlan('family', fid).entitled) return { ok: false, code: 'entitled' };
    if (unsettledPlan(fid)) return { ok: false, code: 'fixPayment' };
    if (!config.stripePmcFamily) return { ok: false, code: 'noPrice' };
    const prices = await familyPrices(plan);
    const price = prices && prices[interval];
    if (!price) return { ok: false, code: 'noPrice' };
    if (await endOpenSession(fid) === 'paid') return { ok: false, code: 'paying' };
    const customer = await familyCustomer(fid);
    const meta = { owner_kind: 'family', owner_id: fid };
    const params = {
      mode: 'subscription',
      customer,
      line_items: [{ price: price.id, quantity: 1 }],
      client_reference_id: fid,
      metadata: meta,
      subscription_data: { metadata: meta, billing_mode: { type: 'flexible' } },
      // A full US address for Radar and Stripe Tax; the Customer gets it (D9).
      billing_address_collection: 'required',
      customer_update: { address: 'auto' },
      allow_promotion_codes: true,
      integration_identifier: S.INTEGRATION_IDS.family,
      success_url: `${base}/family?checkout={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/family?plan=${plan}&interval=${interval}`,
    };
    // Which ways to pay is the "Family" payment method configuration's job (Link off), never payment_method_types.
    params.payment_method_configuration = config.stripePmcFamily;
    // Stripe Tax only when the owner turned it on (and /admin/billing says whether it really collects anywhere).
    if (config.stripeTax) params.automatic_tax = { enabled: true };
    if (config.termsPublished) {
      params.consent_collection = { terms_of_service: 'required' };
      params.custom_text = { terms_of_service_acceptance: { message: `I agree to the [Terms of Service](${base}/terms), and that the plan renews until I cancel it.` } };
    }
    const session = await S.createCheckoutSession(params, `checkout-family-${fid}-${uid(12)}`);
    rememberSession('family', fid, session.id);
    audit(user.id, 'billing.checkout.start', ownerKey(fid), { session: session.id, plan, interval });
    return { ok: true, url: session.url };
  });
}

/** Records the owner's one open Checkout Session. */
export function rememberSession(kind, id, sessionId) {
  q.run(`INSERT INTO billing_checkouts(owner_kind, owner_id, livemode, session_id, created_at) VALUES (?,?,?,?,?)
    ON CONFLICT(owner_kind, owner_id, livemode) DO UPDATE SET session_id=excluded.session_id, created_at=excluded.created_at`, kind, String(id), S.currentLivemode(), sessionId, now());
}

/** A Customer Portal session for an owner's Customer. -> { ok: true, url } | { ok: false, code: 'noCustomer' } */
export async function startPortalFor({ kind, id, user, returnUrl }) {
  const customer = B.customerOf(kind, id);
  if (!customer) return { ok: false, code: 'noCustomer' };
  const p = await S.createPortalSession({ customer, return_url: returnUrl }, `portal-${kind}-${id}-${uid(12)}`);
  audit(user.id, 'billing.portal.open', `${kind}:${id}`, {});
  return { ok: true, url: p.url };
}
/** A Customer Portal session for the family's Customer. -> { ok: true, url } | { ok: false, code: 'noCustomer' } */
export const startPortal = ({ family, user, base }) => startPortalFor({ kind: 'family', id: family.id, user, returnUrl: `${base}/family` });

const SESSION_ID = /^cs_(test|live)_[A-Za-z0-9]{8,200}$/;
/** The return page's fallback: the session's own metadata must name this family (services/billing.js
 *  syncCheckoutReturn). -> 'active' | 'processing' | 'not_yours' */
export const checkoutReturn = (family, sessionId) => checkoutReturnFor('family', family.id, sessionId);
/** The same for any owner (a school's Billing tab). */
export async function checkoutReturnFor(kind, ownerId, sessionId) {
  const family = { id: ownerId };
  if (B.ownerPlan(kind, family.id).entitled) return 'active';
  if (!SESSION_ID.test(String(sessionId || ''))) return 'not_yours';
  try {
    const r = await B.syncCheckoutReturn(String(sessionId), { kind, id: family.id });
    if (r.result === 'not_yours' || r.result === 'mode_mismatch') return 'not_yours';
  } catch (e) {
    if (e instanceof S.StripeCallError && e.missing) return 'not_yours';
    log('warn', 'billing: checkout return not synced', e instanceof S.StripeCallError ? e.fields : { error: e.message });
  }
  return B.ownerPlan(kind, family.id).entitled ? 'active' : 'processing';
}
