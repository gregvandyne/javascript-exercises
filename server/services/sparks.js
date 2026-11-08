// Spark Packs (docs/decisions.md "Spark Packs"): one-time top-ups of extra Builder messages for a family that has a plan.
// A grown-up buys one on /family (password again, then Stripe's hosted Checkout, mode=payment); the webhook (or the
// return page's fallback) credits it. Everyone the family's packs cover builds from them once their free daily messages
// and the plan's extra messages are used: the family's grown-up and its first FAMILY_MAX_CHILDREN linked children,
// whatever the plan (Basic too), and also after the plan ends, until the pack's time runs out. Never in class: a member
// of a school with a plan builds from the school's pool (family money is never used in class).
//
// What a pack gives is decided here, never by the page or by Stripe metadata: the size key names a fixed number of
// messages (SIZES) and a Stripe Price (by lookup key) whose amount Checkout charges. One message = one credit; a "Pro"
// message uses the plan's Pro weight, but never more credits than are left (a balance never goes below 0).
// Every change of a pack's credit is a spark_ledger row; a build given back (turns.refund) returns the very credits it
// took. Refunds and disputes (charge.refunded, charge.dispute.created, radar.early_fraud_warning.created) take back the
// credits that are left: a full refund or a dispute ends the pack, a partial one removes its share of the messages.
//
// Asks (builder_asks): a child at the Builder's daily limit taps "Ask my grown-up"; the family's grown-up sees it on
// /family (and a Family badge) with one tap to the plans or to a Spark Pack. Ids and dates only, never a message.
import { q, tx, uid, now, audit, today } from '../db.js';
import { config } from '../config.js';
import { log } from './log.js';
import { register } from './jobs.js';
import * as S from './stripe.js';
import * as B from './billing.js';
import * as C from './checkout.js';
import { registerPaidBudget } from './ai-budget.js';

const DAY = 86400e3;
/** The packs for sale: size key -> { messages, lookupKey }. Prices are Stripe's (one-time Prices with these lookup keys). */
export const SIZES = Object.freeze({
  p25: Object.freeze({ messages: 25, lookupKey: S.PRICE_LOOKUP_KEYS.spark25 }),
  p60: Object.freeze({ messages: 60, lookupKey: S.PRICE_LOOKUP_KEYS.spark60 }),
  p150: Object.freeze({ messages: 150, lookupKey: S.PRICE_LOOKUP_KEYS.spark150 }),
});
export const SIZE_KEYS = Object.freeze(Object.keys(SIZES));
/** The most messages an admin grant may give at once. */
export const GRANT_MAX = 1000;
/** An ask is open for a week at most. */
export const ASK_TTL = 7 * DAY;
/** Closed asks and ended open checkouts are deleted after this long. */
export const KEEP_CLOSED = 90 * DAY;

const lm = () => S.currentLivemode();
const fail = code => ({ ok: false, code });
const source = fid => `spark:${fid}`;

// ---------------------------------------------------------------- balances

/** A family's packs that can pay for a message now (active, credit left, not expired, the current key's mode), the
 *  first to run out first. */
const usablePacks = (fid, t = now()) => q.all(`SELECT * FROM spark_packs WHERE family_id=? AND status='active' AND remaining>0 AND expires_at>? AND livemode=?
  ORDER BY expires_at, created_at, id`, String(fid), t, lm());
/** Spark Pack messages a family has left now (0 with billing off). */
export function balance(fid, t = now()) {
  if (!fid || !S.billingOn()) return 0;
  return q.get(`SELECT COALESCE(SUM(remaining), 0) n FROM spark_packs WHERE family_id=? AND status='active' AND remaining>0 AND expires_at>? AND livemode=?`, String(fid), t, lm()).n;
}
/** When the family's next usable messages run out (ms), or null. */
export const nextExpiry = (fid, t = now()) => usablePacks(fid, t)[0]?.expires_at ?? null;
/** Spark Pack messages one builder used on a UTC day (Pro weight counted, builds given back not). */
export const usedOn = (userId, fid, day = today()) => q.get('SELECT COALESCE(SUM(weight), 0) n FROM builder_turns WHERE user_id=? AND charged_to=? AND charged_day=? AND refunded=0',
  userId, source(fid), day).n;

/** The first FAMILY_MAX_CHILDREN linked children of a family (packs cover them whatever the plan). */
export function coveredByPacks(fid) {
  return q.all("SELECT child_id FROM family_children WHERE family_id=? AND status='linked' AND unlinked_at IS NULL ORDER BY linked_at, requested_at, child_id", String(fid))
    .slice(0, config.familyMaxChildren).map(r => r.child_id);
}
/** The family whose packs this builder may use, or null: the grown-up owner's own family, or a covered child's linked
 *  family; never for a member of a school with a plan (side: schoolSide(userId)), never with billing off. Only while the
 *  family has messages left (a family without packs changes nothing). */
export function familyFor(userId, side = null) {
  const fid = builderFamily(userId, side);
  return fid && balance(fid) > 0 ? fid : null;
}
/** The same family whether or not it has messages left (to count what this builder used from its packs today). */
export function builderFamily(userId, side = null) {
  if (!userId || !S.billingOn() || (side && side.entitled)) return null;
  const own = q.get('SELECT id FROM families WHERE owner_id=?', userId);
  const fid = own ? own.id : q.get("SELECT family_id FROM family_children WHERE child_id=? AND status='linked' AND unlinked_at IS NULL", userId)?.family_id;
  return fid && (own || coveredByPacks(fid).includes(userId)) ? fid : null;
}

/** Takes up to n credits from the family's packs for one build (inside the charge transaction). Never below 0: a Pro
 *  message with fewer credits left takes what is left. -> credits taken */
export function take(fid, userId, n, { turnId = null, day = today() } = {}) {
  let need = Math.max(1, n | 0), taken = 0;
  for (const p of usablePacks(fid)) {
    if (need <= 0) break;
    const k = Math.min(need, p.remaining);
    if (!q.run('UPDATE spark_packs SET remaining=remaining-? WHERE id=? AND remaining>=?', k, p.id, k).changes) continue;
    q.run('INSERT INTO spark_ledger(pack_id, family_id, delta, reason, user_id, turn_id, day, at) VALUES (?,?,?,?,?,?,?,?)', p.id, fid, -k, 'use', userId, turnId, day, now());
    need -= k; taken += k;
  }
  return taken;
}
/** Gives back what one build took from packs (turns.refund, inside its transaction), once, to packs still active and
 *  not expired (a refunded, disputed or revoked pack's credit is gone). -> credits given back */
export function giveBack(turnId) {
  if (!turnId || q.get("SELECT 1 FROM spark_ledger WHERE turn_id=? AND reason='refund_use'", turnId)) return 0;
  let back = 0;
  for (const r of q.all("SELECT * FROM spark_ledger WHERE turn_id=? AND reason='use'", turnId)) {
    const k = -r.delta;
    const ok = q.run("UPDATE spark_packs SET remaining=remaining+? WHERE id=? AND status='active' AND expires_at>?", k, r.pack_id, now()).changes;
    q.run('INSERT INTO spark_ledger(pack_id, family_id, delta, reason, user_id, turn_id, day, at) VALUES (?,?,?,?,?,?,?,?)', r.pack_id, r.family_id, ok ? k : 0, 'refund_use', r.user_id, turnId, today(), now());
    if (ok) back += k;
  }
  return back;
}

// ---------------------------------------------------------------- the paid AI pool
/** What packs add to the paid pool's ceiling this UTC month: the messages used from packs this month and the messages
 *  left in usable packs, x SPARK_PACK_AI_USD_PER_MESSAGE. */
export function poolUsd(day = today()) {
  if (!S.billingOn()) return 0;
  const used = -q.get("SELECT COALESCE(SUM(delta), 0) n FROM spark_ledger WHERE reason IN ('use','refund_use') AND day BETWEEN ? AND ?", day.slice(0, 8) + '01', day.slice(0, 8) + '31').n;
  const left = q.get("SELECT COALESCE(SUM(remaining), 0) n FROM spark_packs WHERE status='active' AND expires_at>? AND livemode=?", now(), lm()).n;
  return Math.max(0, used + left) * config.sparkAiUsdPerMessage;
}
registerPaidBudget('sparks', () => poolUsd());

// ---------------------------------------------------------------- crediting
const ledger = (pack, delta, reason, { eventId = null, by = null } = {}) => q.run('INSERT INTO spark_ledger(pack_id, family_id, delta, reason, event_id, by_user, day, at) VALUES (?,?,?,?,?,?,?,?)',
  pack.id, pack.family_id, delta, reason, eventId, by, today(), now());
const packById = id => q.get('SELECT * FROM spark_packs WHERE id=?', String(id || '')) || null;
export const packBySession = sessionId => q.get('SELECT * FROM spark_packs WHERE stripe_session_id=?', String(sessionId || '')) || null;
/** A paid pack's credit (inside a transaction), once: active, its messages, its expiry, the PaymentIntent. Open asks for
 *  a Spark Pack close. -> true when credited now */
function credit(pack, session, eventId = null) {
  if (pack.paid_at || !['open', 'processing', 'failed', 'expired'].includes(pack.status)) return false;
  const t = now();
  const pi = session?.payment_intent && typeof session.payment_intent === 'object' ? session.payment_intent.id : session?.payment_intent || null;
  q.run(`UPDATE spark_packs SET status='active', remaining=messages, paid_at=?, expires_at=?, stripe_payment_intent=COALESCE(?, stripe_payment_intent),
    amount_total=COALESCE(?, amount_total), currency=COALESCE(?, currency) WHERE id=?`, t, t + config.sparkExpiryDays * DAY, pi, session?.amount_total ?? null, session?.currency || null, pack.id);
  ledger(pack, pack.messages, 'purchase', { eventId });
  audit(null, 'billing.spark.paid', `family:${pack.family_id}`, { pack: pack.id, size: pack.size, messages: pack.messages, session: pack.stripe_session_id, event: eventId });
  closeAsks(pack.family_id, 'spark', 'bought');
  return true;
}
/** Applies a re-fetched Checkout Session to its pack (webhook or return page). Inside a transaction. -> the pack row */
function applySession(pack, session, eventType = null, eventId = null) {
  if (session.status === 'expired' || eventType === 'checkout.session.expired') {
    if (pack.status === 'open') { q.run("UPDATE spark_packs SET status='expired', ended_at=? WHERE id=?", now(), pack.id); audit(null, 'billing.spark.expired', `family:${pack.family_id}`, { pack: pack.id }); }
  } else if (session.status === 'complete' && (session.payment_status === 'paid' || session.payment_status === 'no_payment_required')) {
    credit(pack, session, eventId);
  } else if (eventType === 'checkout.session.async_payment_failed') {
    if (!pack.paid_at && pack.status !== 'failed') { q.run("UPDATE spark_packs SET status='failed', ended_at=? WHERE id=?", now(), pack.id); audit(null, 'billing.spark.failed', `family:${pack.family_id}`, { pack: pack.id, event: eventId }); }
  } else if (session.status === 'complete' && pack.status === 'open') {
    q.run("UPDATE spark_packs SET status='processing' WHERE id=?", pack.id);   // a delayed payment: nothing until it arrives
  }
  return packById(pack.id);
}
/** The pack a session belongs to. A session of ours whose row is missing (the server stopped between making the session
 *  and writing the row) is rebuilt from its metadata, checked: a known size and an existing family. */
function packForSession(session) {
  const known = packBySession(session.id);
  if (known) return known;
  const m = session.metadata || {};
  if (m.kind !== 'spark_pack' || m.owner_kind !== 'family' || !SIZES[m.pack] || !q.get('SELECT 1 FROM families WHERE id=?', String(m.owner_id || ''))) return null;
  if (session.client_reference_id && String(session.client_reference_id) !== String(m.owner_id)) return null;
  const id = uid();
  q.run(`INSERT INTO spark_packs(id, family_id, size, messages, remaining, status, source, stripe_session_id, livemode, created_at) VALUES (?,?,?,?,0,'open','stripe',?,?,?)`,
    id, String(m.owner_id), m.pack, SIZES[m.pack].messages, session.id, session.livemode ? 1 : 0, now());
  return packById(id);
}

// ---------------------------------------------------------------- Checkout
/**
 * A Checkout Session for one Spark Pack (mode=payment). family: the families row; user: the grown-up; size: a SIZES
 * key; base: the site's address. Only for a family whose plan is on now. The price comes from Stripe by lookup key;
 * the messages from SIZES. The pack's row is written (status 'open') before the grown-up is sent to Stripe.
 * -> { ok: true, url } | { ok: false, code: 'badPack' | 'noPlan' | 'noPrice' }
 */
export async function startCheckout({ family, user, size, base }) {
  const def = SIZES[size];
  if (!def || !Object.hasOwn(SIZES, size)) return fail('badPack');
  const fid = family.id;
  if (!B.ownerPlan('family', fid).entitled) return fail('noPlan');
  if (!config.stripePmcFamily) return fail('noPrice');
  let price = null;
  try { price = (await S.prices())[def.lookupKey] || null; } catch (e) {
    log('warn', 'billing: prices not read', e instanceof S.StripeCallError ? e.fields : { error: e.message });
  }
  if (!price || price.interval) return fail('noPrice');   // a recurring Price can't be a pack
  const customer = await C.ownerCustomer('family', fid);
  const id = uid();
  const meta = { owner_kind: 'family', owner_id: fid, kind: 'spark_pack', pack: size, pack_id: id };
  const params = {
    mode: 'payment',
    customer,
    line_items: [{ price: price.id, quantity: 1 }],
    client_reference_id: fid,
    metadata: meta,
    payment_intent_data: { metadata: meta },
    billing_address_collection: 'required',
    customer_update: { address: 'auto' },
    integration_identifier: S.INTEGRATION_IDS.spark,
    success_url: `${base}/family?sparks_checkout={CHECKOUT_SESSION_ID}#sparks`,
    cancel_url: `${base}/family#sparks`,
    payment_method_configuration: config.stripePmcFamily,
    managed_payments: { enabled: false },
  };
  if (config.stripeTax) params.automatic_tax = { enabled: true };
  if (config.termsPublished) params.consent_collection = { terms_of_service: 'required' };
  const session = await S.createCheckoutSession(params, `checkout-spark-${fid}-${id}`);
  q.run(`INSERT INTO spark_packs(id, family_id, size, messages, remaining, status, source, stripe_session_id, amount_total, currency, livemode, bought_by, created_at)
    VALUES (?,?,?,?,0,'open','stripe',?,?,?,?,?,?) ON CONFLICT(stripe_session_id) DO NOTHING`, id, fid, size, def.messages, session.id, price.unitAmount ?? null, price.currency || 'usd', lm(), user.id, now());
  audit(user.id, 'billing.spark.start', `family:${fid}`, { pack: id, size, session: session.id });
  return { ok: true, url: session.url };
}

const SESSION_ID = /^cs_(test|live)_[A-Za-z0-9]{8,200}$/;
/** The return page's fallback (/family?sparks_checkout=…): the session must be this family's own (its row, else its
 *  metadata), then it is applied like its webhook. -> 'active' | 'processing' | 'failed' | 'not_yours' */
export async function checkoutReturn(fid, sessionId) {
  if (!SESSION_ID.test(String(sessionId || ''))) return 'not_yours';
  const row = packBySession(sessionId);
  if (row && row.family_id !== String(fid)) return 'not_yours';
  if (row && row.status === 'active') return 'active';
  let session;
  try { session = await S.getCheckoutSession(String(sessionId)); } catch (e) {
    if (e instanceof S.StripeCallError && e.missing) return 'not_yours';
    log('warn', 'billing: spark checkout return not synced', e instanceof S.StripeCallError ? e.fields : { error: e.message });
    return 'processing';
  }
  if (!!session.livemode !== (lm() === 1) || session.metadata?.kind !== 'spark_pack' || String(session.metadata?.owner_id) !== String(fid)) return 'not_yours';
  const pack = await B.serialize(`spark:${session.id}`, async () => tx(() => { const p = packForSession(session); return p ? applySession(p, session) : null; }));
  if (!pack) return 'not_yours';
  return pack.status === 'active' ? 'active' : pack.status === 'failed' || pack.status === 'expired' ? 'failed' : 'processing';
}

// ---------------------------------------------------------------- webhooks
const PI_EVENTS = new Set(['charge.refunded', 'charge.dispute.created', 'radar.early_fraud_warning.created']);
const idOf = v => (v && typeof v === 'object' ? v.id : v) || null;
/** Is this event about a Spark Pack? Checkout events: a payment-mode session with our metadata or a pack row; payment
 *  events: a PaymentIntent one of our packs was paid with. */
function mine(event) {
  const o = event.data?.object || {};
  if (event.type.startsWith('checkout.session.')) return o.mode === 'payment' && (o.metadata?.kind === 'spark_pack' || !!packBySession(o.id));
  if (PI_EVENTS.has(event.type)) {
    const pi = idOf(o.payment_intent);
    return !!pi && !!q.get('SELECT 1 FROM spark_packs WHERE stripe_payment_intent=?', pi);
  }
  return false;
}
/** One verified webhook event (services/billing.js runs this first for every handled type). Stripe is read again first,
 *  outside any transaction; then one transaction records the event (idempotent on its id) and changes the pack.
 *  -> null (not a Spark Pack event) | { result } */
export async function handleEvent(event) {
  if (!mine(event)) return null;
  const o = event.data.object;
  if (event.type.startsWith('checkout.session.')) {
    let session;
    try { session = await S.getCheckoutSession(o.id); } catch (e) {
      if (!(e instanceof S.StripeCallError) || !e.missing) throw e;
      tx(() => B.recordEvent(event, 'ignored'));
      return { result: 'missing' };
    }
    return B.serialize(`spark:${session.id}`, async () => tx(() => {
      if (!B.recordEvent(event, null, { customer: idOf(session.customer) })) return { result: 'duplicate' };
      const pack = packForSession(session);
      if (!pack) { B.setEventResult(event, 'unlinked'); return { result: 'unlinked' }; }
      applySession(pack, session, event.type, event.id);
      B.setEventResult(event, 'ok');
      return { result: 'ok' };
    }));
  }
  // A refund, a dispute or an early fraud warning on a pack's payment: re-read the charge (the payload follows the
  // endpoint's API version).
  const pi = idOf(o.payment_intent);
  let charge = null;
  if (event.type === 'charge.refunded') charge = await S.getCharge(o.id);
  return tx(() => {
    if (!B.recordEvent(event, null)) return { result: 'duplicate' };
    for (const pack of q.all('SELECT * FROM spark_packs WHERE stripe_payment_intent=?', pi)) {
      if (event.type === 'charge.refunded') refundPack(pack, charge, event.id);
      else endPack(pack, 'disputed', event.type === 'charge.dispute.created' ? 'dispute' : 'efw', { eventId: event.id });
    }
    B.setEventResult(event, 'ok');
    return { result: 'ok' };
  });
}
B.registerEventHandler(handleEvent);

/** Ends a pack now: what is left goes (ledger), status as given. */
function endPack(pack, status, reason, { eventId = null, by = null } = {}) {
  const cur = packById(pack.id);
  if (cur.remaining > 0) { q.run('UPDATE spark_packs SET remaining=0 WHERE id=?', cur.id); ledger(cur, -cur.remaining, reason, { eventId, by }); }
  if (!['refunded', 'disputed', 'revoked', 'ended'].includes(cur.status) || status === 'disputed') q.run('UPDATE spark_packs SET status=?, ended_at=COALESCE(ended_at, ?) WHERE id=?', status, now(), cur.id);
  audit(by, `billing.spark.${reason}`, `family:${cur.family_id}`, { pack: cur.id, removed: cur.remaining, event: eventId });
}
/** A refund of a pack's payment (charge: the re-read Charge). The pack keeps only the share of its messages that was
 *  not refunded: a full refund ends it; a partial one removes its share of the messages from what is left (never below
 *  0: messages already used stay used). Repeated refunds count the total refunded so far. */
function refundPack(pack, charge, eventId) {
  const paid = charge?.amount || pack.amount_total || 0;
  const refunded = charge?.amount_refunded || 0;
  if (!paid || refunded <= 0) return;
  if (refunded >= paid) return endPack(pack, 'refunded', 'refund', { eventId });
  const owed = Math.ceil(pack.messages * refunded / paid);   // messages the refunds so far pay back
  const already = -q.get("SELECT COALESCE(SUM(delta), 0) n FROM spark_ledger WHERE pack_id=? AND reason='refund'", pack.id).n;
  const cur = packById(pack.id);
  const k = Math.min(cur.remaining, Math.max(0, owed - already));
  if (k > 0) { q.run('UPDATE spark_packs SET remaining=remaining-? WHERE id=? AND remaining>=?', k, cur.id, k); ledger(cur, -k, 'refund', { eventId }); }
  audit(null, 'billing.spark.refund', `family:${cur.family_id}`, { pack: cur.id, removed: k, partial: true, event: eventId });
}

// ---------------------------------------------------------------- the admin (/admin/billing)
/** The platform admin gives a family Spark Pack messages (a goodwill credit, a lost payment fixed by hand). Audited.
 *  -> { ok: true, pack } | { ok: false, code: 'noFamily' | 'badCount' } */
export function grant(admin, familyId, messages, note = '') {
  const n = Math.floor(Number(messages));
  if (!Number.isFinite(n) || n < 1 || n > GRANT_MAX) return fail('badCount');
  if (!q.get('SELECT 1 FROM families WHERE id=?', String(familyId || ''))) return fail('noFamily');
  const t = now(), id = uid();
  return tx(() => {
    q.run(`INSERT INTO spark_packs(id, family_id, size, messages, remaining, status, source, livemode, bought_by, note, created_at, paid_at, expires_at)
      VALUES (?,?,'grant',?,?,'active','grant',?,?,?,?,?,?)`, id, String(familyId), n, n, lm(), admin.id, String(note || '').slice(0, 300), t, t, t + config.sparkExpiryDays * DAY);
    const pack = packById(id);
    ledger(pack, n, 'grant', { by: admin.id });
    audit(admin.id, 'admin.spark.grant', `family:${familyId}`, { pack: id, messages: n });
    closeAsks(familyId, 'spark', 'bought');
    return { ok: true, pack };
  });
}
/** The platform admin ends what is left of a pack (after a refund made outside Stripe, a mistaken grant). Audited.
 *  -> { ok } | { ok: false, code: 'noPack' } */
export function revoke(admin, packId) {
  const pack = packById(packId);
  if (!pack || !['active', 'processing'].includes(pack.status)) return fail('noPack');
  tx(() => endPack(pack, 'revoked', 'revoke', { by: admin.id }));
  return { ok: true };
}
/** The latest packs (not the never-paid ones), newest first, for /admin/billing. */
export const recentPacks = (limit = 50) => q.all(`SELECT p.*, u.username owner FROM spark_packs p LEFT JOIN families f ON f.id=p.family_id LEFT JOIN users u ON u.id=f.owner_id
  WHERE p.livemode=? AND p.status NOT IN ('open','expired') ORDER BY COALESCE(p.paid_at, p.created_at) DESC LIMIT ?`, lm(), limit);
/** Totals for /admin/billing: packs paid and their amount this UTC month, and messages left in usable packs. */
export function totals(t = now()) {
  const d = new Date(t); const from = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const sold = q.get("SELECT COUNT(*) n, COALESCE(SUM(amount_total), 0) cents FROM spark_packs WHERE source='stripe' AND paid_at>=? AND livemode=?", from, lm());
  return { sold: sold.n, cents: sold.cents, left: q.get("SELECT COALESCE(SUM(remaining), 0) n FROM spark_packs WHERE status='active' AND expires_at>? AND livemode=?", t, lm()).n };
}
/** A family's packs for /family: paid, granted or ended ones (not checkouts never paid), newest first. */
export const packsOf = (fid, limit = 6) => q.all(`SELECT * FROM spark_packs WHERE family_id=? AND livemode=? AND status NOT IN ('open','expired')
  ORDER BY COALESCE(paid_at, created_at) DESC LIMIT ?`, String(fid), lm(), limit);
/** A pack's state for a page: 'active' | 'used' | 'ended' (its time ran out) | 'processing' | 'failed' | 'refunded' |
 *  'disputed' | 'revoked'. */
export function packState(p, t = now()) {
  if (p.status === 'active') return p.expires_at <= t ? 'ended' : p.remaining > 0 ? 'active' : 'used';
  return p.status;
}

// ---------------------------------------------------------------- asks
/** A child's open ask (younger than ASK_TTL), or null. */
export const openAsk = (childId, t = now()) => (childId ? q.get('SELECT * FROM builder_asks WHERE child_id=? AND closed_at IS NULL AND created_at>?', childId, t - ASK_TTL) || null : null);
/** Closes a family's open asks of a kind ('plan' | 'spark', or null for both). -> rows closed */
export function closeAsks(fid, kind = null, reason = 'closed') {
  return q.run(`UPDATE builder_asks SET closed_at=?, close_reason=? WHERE family_id=? AND closed_at IS NULL${kind ? ' AND kind=?' : ''}`, now(), reason, String(fid), ...(kind ? [kind] : [])).changes;
}
/** A child asks their linked grown-up for more building. kind: what would help ('plan' | 'spark', decided by the
 *  caller from the child's allowance). -> { ok: true, ask, already } | { ok: false, code: 'noGrownup' } */
export function ask(child, fid, kind) {
  if (!fid) return fail('noGrownup');
  return tx(() => {
    const t = now();
    // An old ask (past its week) or one of another kind (the plan came on since) closes first.
    q.run("UPDATE builder_asks SET closed_at=?, close_reason='replaced' WHERE child_id=? AND closed_at IS NULL AND (created_at<=? OR kind<>? OR family_id<>?)", t, child.id, t - ASK_TTL, kind, String(fid));
    const open = openAsk(child.id, t);
    if (open) return { ok: true, ask: open, already: true };
    const row = { id: uid(), family_id: String(fid), child_id: child.id, kind, created_at: t };
    q.run('INSERT INTO builder_asks(id, family_id, child_id, kind, created_at) VALUES (?,?,?,?,?)', row.id, row.family_id, row.child_id, row.kind, row.created_at);
    audit(child.id, 'builder.ask', `family:${fid}`, { ask: row.id, kind });
    return { ok: true, ask: row, already: false };
  });
}
/** A family's open asks, oldest first, with each child's display name; closes plan asks once the plan is on. */
export function asksFor(fid, t = now()) {
  if (B.ownerPlan('family', fid).entitled) closeAsks(fid, 'plan', 'plan');
  return q.all(`SELECT a.*, u.display_name name FROM builder_asks a JOIN users u ON u.id=a.child_id
    WHERE a.family_id=? AND a.closed_at IS NULL AND a.created_at>? ORDER BY a.created_at, a.id`, String(fid), t - ASK_TTL);
}
/** The grown-up has seen their family's asks (the Family badge clears). */
export const markSeen = fid => q.run('UPDATE builder_asks SET seen_at=? WHERE family_id=? AND closed_at IS NULL AND seen_at IS NULL', now(), String(fid)).changes;
/** Open asks the family's grown-up hasn't seen yet (the Family badge). */
export function unseenAsks(ownerId, t = now()) {
  const fam = ownerId ? q.get('SELECT id FROM families WHERE owner_id=?', ownerId) : null;
  return fam ? q.get('SELECT COUNT(*) n FROM builder_asks WHERE family_id=? AND closed_at IS NULL AND seen_at IS NULL AND created_at>?', fam.id, t - ASK_TTL).n : 0;
}
/** The grown-up dismisses one ask. -> true when it was open */
export function dismissAsk(grownup, fid, askId) {
  const ok = q.run("UPDATE builder_asks SET closed_at=?, close_reason='dismissed' WHERE id=? AND family_id=? AND closed_at IS NULL", now(), String(askId || ''), String(fid)).changes > 0;
  if (ok) audit(grownup.id, 'builder.ask.dismiss', `family:${fid}`, { ask: String(askId) });
  return ok;
}

// ---------------------------------------------------------------- the daily job
/** Packs whose time ran out lose what is left (ledger 'expire', status 'ended'); closed asks and never-paid checkouts
 *  are deleted after KEEP_CLOSED. -> { ended, deleted } */
export function daily(t = now()) {
  let ended = 0;
  tx(() => {
    for (const p of q.all("SELECT * FROM spark_packs WHERE status='active' AND expires_at<=?", t)) {
      if (p.remaining > 0) { q.run('UPDATE spark_packs SET remaining=0 WHERE id=?', p.id); ledger(p, -p.remaining, 'expire'); }
      q.run("UPDATE spark_packs SET status='ended', ended_at=? WHERE id=?", t, p.id);
      ended++;
    }
  });
  const deleted = q.run('DELETE FROM builder_asks WHERE closed_at IS NOT NULL AND closed_at<?', t - KEEP_CLOSED).changes
    + q.run("DELETE FROM builder_asks WHERE closed_at IS NULL AND created_at<?", t - KEEP_CLOSED).changes
    + q.run("DELETE FROM spark_packs WHERE status IN ('open','expired') AND paid_at IS NULL AND created_at<?", t - KEEP_CLOSED).changes;
  return { ended, deleted };
}
register('spark-packs-daily', DAY, () => daily(), { firstAfterMs: 9 * 60e3 });
