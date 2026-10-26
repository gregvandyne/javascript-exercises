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

/** May this account pay or change a plan now? With a live key, any grown-up; with a test key, only billing testers. */
export function mayBill(u) {
  const mode = S.billingMode();
  return !!u && !u.banned && (mode === 'live' || (mode === 'test' && !!u.billing_tester));
}
/** The site's address for Stripe's return links: PUBLIC_URL, else this request's own origin. */
export const baseUrl = req => config.publicUrl || `${req.protocol}://${req.get('host')}`;

/** The family prices, found by lookup key: { month: { id, unitAmount }, year: {…} }, or null when either is missing,
 *  Stripe can't be read, or STRIPE_PMC_FAMILY isn't set (family plans are then not on sale anywhere: the "Family" payment
 *  method configuration keeps Link off, and there is no fallback to the account's default one). */
export async function familyPrices() {
  if (!S.billingOn() || !config.stripePmcFamily) return null;
  try {
    const p = await S.prices();
    const m = p[S.PRICE_LOOKUP_KEYS.familyMonthly], y = p[S.PRICE_LOOKUP_KEYS.familyYearly];
    return m && y ? { month: { id: m.id, unitAmount: m.unitAmount }, year: { id: y.id, unitAmount: y.unitAmount } } : null;
  } catch (e) {
    log('warn', 'billing: prices not read', e instanceof S.StripeCallError ? e.fields : { error: e.message });
    return null;
  }
}

const ownerKey = fid => `family:${fid}`;
/** Statuses of a plan that isn't entitled now but that Stripe may still charge or bring back (a card retry that
 *  succeeds later): a new Checkout would make two plans, so the grown-up fixes the payment in Manage billing instead. */
const STALE_STATUSES = ['past_due', 'unpaid', 'incomplete', 'paused'];
/** The family's subscription that still waits for a payment (or a delayed payment still processing), or null. */
export const unsettledPlan = fid => q.all(`SELECT * FROM billing_subscriptions WHERE owner_kind='family' AND owner_id=? AND plan='family' AND livemode=?
    AND orphaned_at IS NULL`, fid, S.currentLivemode())
  .find(r => STALE_STATUSES.includes(r.status) || (r.payment_pending && ['active', 'trialing'].includes(r.status))) || null;
const openSession = fid => q.get("SELECT * FROM billing_checkouts WHERE owner_kind='family' AND owner_id=? AND livemode=?", fid, S.currentLivemode()) || null;

/** The owner's Stripe Customer, made the first time (metadata only: no name or email from us) and reused after. */
async function familyCustomer(fid) {
  const known = B.customerOf('family', fid);
  if (known) return known;
  const mode = S.currentLivemode();
  const c = await S.createCustomer({ metadata: { owner_kind: 'family', owner_id: fid, family_id: fid } }, `customer-family-${fid}-${mode}`);
  B.linkCustomer(c.id, 'family', fid, mode);
  return B.customerOf('family', fid) || c.id;
}

/** Ends the owner's earlier open Checkout (one open session per owner). -> 'gone' (nothing open any more) or 'paid'
 *  (it was completed meanwhile: the plan is on its way). Other Stripe errors are thrown. */
async function endOpenSession(fid) {
  const row = openSession(fid);
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
  if (state === 'gone') q.run("DELETE FROM billing_checkouts WHERE owner_kind='family' AND owner_id=? AND session_id=?", fid, row.session_id);
  return state;
}

/**
 * A Checkout Session for a family plan. family: the families row; user: the grown-up; interval: 'month' | 'year';
 * base: the site's address. One at a time per family (an earlier open session is expired first).
 * A plan that isn't entitled but is still unsettled at Stripe (past_due after grace, unpaid, incomplete, paused, or a
 * delayed payment) refuses with 'fixPayment' (Manage billing), so a late card retry can't leave two plans billed.
 * -> { ok: true, url } | { ok: false, code: 'entitled' | 'fixPayment' | 'paying' | 'noPrice' }
 */
export function startFamilyCheckout({ family, user, interval, base }) {
  const fid = family.id;
  return B.serialize(`checkout-start:family:${fid}`, async () => {
    if (B.ownerPlan('family', fid).entitled) return { ok: false, code: 'entitled' };
    if (unsettledPlan(fid)) return { ok: false, code: 'fixPayment' };
    if (!config.stripePmcFamily) return { ok: false, code: 'noPrice' };
    const prices = await familyPrices();
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
      cancel_url: `${base}/family`,
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
    q.run(`INSERT INTO billing_checkouts(owner_kind, owner_id, livemode, session_id, created_at) VALUES ('family',?,?,?,?)
      ON CONFLICT(owner_kind, owner_id, livemode) DO UPDATE SET session_id=excluded.session_id, created_at=excluded.created_at`, fid, S.currentLivemode(), session.id, now());
    audit(user.id, 'billing.checkout.start', ownerKey(fid), { session: session.id, interval });
    return { ok: true, url: session.url };
  });
}

/** A Customer Portal session for the family's Customer. -> { ok: true, url } | { ok: false, code: 'noCustomer' } */
export async function startPortal({ family, user, base }) {
  const customer = B.customerOf('family', family.id);
  if (!customer) return { ok: false, code: 'noCustomer' };
  const p = await S.createPortalSession({ customer, return_url: `${base}/family` }, `portal-family-${family.id}-${uid(12)}`);
  audit(user.id, 'billing.portal.open', ownerKey(family.id), {});
  return { ok: true, url: p.url };
}

const SESSION_ID = /^cs_(test|live)_[A-Za-z0-9]{8,200}$/;
/** The return page's fallback: the session's own metadata must name this family (services/billing.js
 *  syncCheckoutReturn). -> 'active' | 'processing' | 'not_yours' */
export async function checkoutReturn(family, sessionId) {
  if (B.ownerPlan('family', family.id).entitled) return 'active';
  if (!SESSION_ID.test(String(sessionId || ''))) return 'not_yours';
  try {
    const r = await B.syncCheckoutReturn(String(sessionId), { kind: 'family', id: family.id });
    if (r.result === 'not_yours' || r.result === 'mode_mismatch') return 'not_yours';
  } catch (e) {
    if (e instanceof S.StripeCallError && e.missing) return 'not_yours';
    log('warn', 'billing: checkout return not synced', e instanceof S.StripeCallError ? e.fields : { error: e.message });
  }
  return B.ownerPlan('family', family.id).entitled ? 'active' : 'processing';
}
