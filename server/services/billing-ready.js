// "Ready to go live?" on /admin/billing (docs/billing-go-live.md): one row per thing that must be true before paid plans
// take real money, each green or red with what to do. It reads settings by NAME only: a key, secret or id is never
// shown, not even a prefix of it (a row says "a live restricted key", never the key). Rows that can't be checked by
// code (the lawyer's sign-off, the Stripe Dashboard's own settings) are in docs/billing-go-live.md.
import { config } from '../config.js';
import { q } from '../db.js';
import * as S from './stripe.js';
import { billingKeyGaps } from '../i18n/billing-keys.js';

// Webhook results that mean the event was verified and handled (anything else is listed under "Event problems").
const GOOD_RESULTS = new Set(['ok', 'ignored', 'duplicate', 'unlinked']);
const site = () => config.publicUrl || 'https://oomba.ai';
const ago = t => { const d = Math.floor((Date.now() - t) / 86400e3); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`; };

/** The key's kind, from its prefix, in words (never any of the key itself). */
function keyKind() {
  const k = config.stripeApiKey || '';
  if (!k) return 'not set';
  if (/^rk_live_/.test(k)) return 'a live restricted key (rk_live_)';
  if (/^rk_test_/.test(k)) return 'a test restricted key (rk_test_)';
  if (/^sk_test_/.test(k)) return 'a test secret key (sk_test_)';
  return 'set, but not a restricted key';
}

/** The latest webhook event Stripe signed in live mode (only verified events are ever stored). */
const lastLiveEvent = () => q.get('SELECT type, result, received_at FROM billing_events WHERE livemode=1 ORDER BY received_at DESC LIMIT 1');
const lastLiveGoodEvent = () => q.get(`SELECT type, result, received_at FROM billing_events WHERE livemode=1 AND result IN (${[...GOOD_RESULTS].map(() => '?').join(',')}) ORDER BY received_at DESC LIMIT 1`, ...GOOD_RESULTS);

// The page waits at most this long for Stripe's price list (the cached list answers at once; Check again reads it anew).
const PRICE_WAIT_MS = 6000;
/** Our prices as Stripe returns them for the current key: { missing: [lookupKey], error } (error: Stripe couldn't be read). */
async function priceCheck(refresh) {
  if (!S.billingOn()) return { missing: Object.values(S.PRICE_LOOKUP_KEYS), error: 'off' };
  try { const p = await Promise.race([S.prices({ refresh }), new Promise((_, no) => { setTimeout(() => no(new Error('slow')), PRICE_WAIT_MS).unref(); })]); return { missing: Object.values(S.PRICE_LOOKUP_KEYS).filter(k => !p[k]), error: null }; }
  catch (e) { return { missing: [], error: e instanceof S.StripeCallError ? (e.fields?.code || e.fields?.type || 'stripe_error') : e.message === 'slow' ? 'too slowly' : 'stripe_error' }; }
}

/**
 * The checks, in the order the owner does them. -> { rows: [{ id, label, ok, now, fix }], ready, total, live }
 * ok: true (green) or false (red). `now` says what is set today in words; `fix` what to do (empty when ok).
 * refresh: read the prices from Stripe again rather than the cache.
 */
export async function readiness({ refresh = false } = {}) {
  const mode = S.billingMode(); const live = mode === 'live';
  const rows = [];
  const row = (id, label, ok, now, fix) => rows.push({ id, label, ok: !!ok, now, fix: ok ? '' : fix });

  row('key', 'STRIPE_API_KEY is a live restricted key', live, keyKind(),
    'In Stripe (live mode): Developers → API keys → Create restricted key with the permissions in docs/billing-go-live.md, then put it in STRIPE_API_KEY on Render.');
  row('liveok', 'STRIPE_LIVE_OK is 1', config.stripeLiveOk, config.stripeLiveOk ? 'set to 1' : 'not set',
    'Set STRIPE_LIVE_OK=1 on Render together with the live key (the server refuses to start with a live key without it).');
  row('secret', 'STRIPE_WEBHOOK_SECRET is set', !!config.stripeWebhookSecret, config.stripeWebhookSecret ? `set${config.stripeWebhookSecretOld ? ' (and STRIPE_WEBHOOK_SECRET_OLD)' : ''}` : 'not set',
    `In Stripe (live mode): Developers → Webhooks → add the endpoint ${site()}/api/billing/webhook with the 14 events in docs/billing-go-live.md, then copy its signing secret (whsec_…) into STRIPE_WEBHOOK_SECRET.`);

  const good = lastLiveGoodEvent(), last = lastLiveEvent();
  const wrongMode = last && last.result === 'mode_mismatch';
  row('webhook', 'The webhook has received a signed live-mode event', !!good,
    good ? `last one ${ago(good.received_at)} (${good.type}: ${good.result})${last && last.received_at > good.received_at && !GOOD_RESULTS.has(last.result) ? `; latest: ${last.result}` : ''}`
      : last ? `live events arrive but are not handled (latest: ${last.result})` : 'none yet',
    wrongMode ? 'Live events reach the site while STRIPE_API_KEY is a test key: put the live key in STRIPE_API_KEY.'
      : last && last.result === 'unresolved_version' ? 'The endpoint was made with another API version: recreate it with the version in STRIPE_API_VERSION (docs/billing-go-live.md).'
        : 'With the live key and secret set, send a test event from the endpoint\'s page in Stripe (or make the test purchase in docs/billing-go-live.md), then reload this page.');

  const pr = await priceCheck(refresh);
  const pricesOk = live && !pr.error && !pr.missing.length;
  row('prices', 'Every price exists in Stripe (by lookup key)', pricesOk,
    pr.error === 'off' ? 'not checked: billing is off' : pr.error ? `not checked: Stripe answered ${pr.error}` : pr.missing.length ? `missing: ${pr.missing.join(', ')}` : `all ${Object.keys(S.PRICE_LOOKUP_KEYS).length} found${live ? '' : ' (with the test key)'}`,
    pr.error && pr.error !== 'off' ? 'Check the restricted key can read Prices, then use "Check again".'
      : !live && !pr.missing.length && !pr.error ? 'Found in test mode. Create the same Prices with the same lookup keys in live mode (docs/billing-go-live.md), then check again with the live key.'
        : 'Create the missing Prices in live mode with these lookup keys (Product catalog → Price → Lookup key). Amounts are the owner\'s decision (docs/billing-go-live.md).');

  row('pmcFamily', 'STRIPE_PMC_FAMILY names the "Family" payment methods', !!config.stripePmcFamily, config.stripePmcFamily ? 'set' : 'not set: family plans and Spark Packs are not on sale',
    'In Stripe (live mode): Settings → Payment methods → create a configuration "Family" (cards, Apple Pay, Google Pay on; Link off) and put its pmc_… id in STRIPE_PMC_FAMILY.');
  row('pmcSchool', 'STRIPE_PMC_SCHOOL (optional)', true, config.stripePmcSchool ? 'set' : 'not set: school card Checkout uses the account\'s default payment methods', '');

  if (refresh && config.stripeTax && S.billingOn()) { try { await S.taxReadiness(); } catch { /* shown as not checked */ } }
  const tax = S.lastTaxReadiness();
  const taxOk = config.stripeTax && (!tax || tax.ok);
  row('tax', 'Stripe Tax collects US sales tax (STRIPE_TAX=1)', taxOk && !!tax,
    !config.stripeTax ? 'STRIPE_TAX is not set: no tax is collected' : !tax ? 'set; not checked with Stripe yet' : tax.ok ? `collecting in ${tax.registrations} registration${tax.registrations === 1 ? '' : 's'}` : tax.problem === 'settings_pending' ? 'settings pending' : 'no registrations',
    !config.stripeTax ? 'D9: turn on Stripe Tax (head office address, US registrations) in live mode, then set STRIPE_TAX=1.' : !tax ? 'Use "Check again" below (the reconcile job also checks it).' : 'In Stripe (live mode): Tax → Settings (head office address) and Tax → Registrations (at least one state).');

  row('terms', 'TERMS_PUBLISHED is 1 (Checkout asks the buyer to agree to /terms)', config.termsPublished, config.termsPublished ? 'set to 1' : 'not set',
    'After the lawyer\'s sign-off on docs/legal-review.md (the Spark Packs refund lines included): add https://oomba.ai/terms in Stripe (Settings → Public details), then set TERMS_PUBLISHED=1.');
  row('contact', 'CONTACT_EMAIL is set (refund requests go there)', !!config.contactEmail, config.contactEmail ? 'set' : 'not set', 'Set CONTACT_EMAIL on Render (render.yaml has greg@oomba.ai).');
  const pu = config.publicUrl || '';
  row('publicUrl', 'PUBLIC_URL is the https address (Stripe\'s return links)', /^https:\/\//.test(pu), pu ? (/^https:\/\//.test(pu) ? 'set (https)' : 'set, but not https') : 'not set', 'Set PUBLIC_URL=https://oomba.ai on Render.');
  row('ai', 'ANTHROPIC_API_KEY is set (what is sold are real Builder messages)', !!config.anthropicKey, config.anthropicKey ? 'set' : 'not set: the Builder is the offline mock',
    'Owner Step 0: set ANTHROPIC_API_KEY, build about 20 games and read the cost per message on /admin/stats before setting prices.');

  // BUILDER_FULL_FOR_ALL (on by default, the owner's November rule "Everyone builds like a teacher"): every signed-in maker
  // builds with Pro and each message counts as one (builder/usage.js trustedMaker), so PRO_TURN_WEIGHT changes nothing.
  if (config.builderFullForAll) {
    row('proWeight', 'Pro messages: BUILDER_FULL_FOR_ALL is on (every message is Pro and counts as one)', true,
      `PRO_TURN_WEIGHT is ${config.proTurnWeight} but has no effect while BUILDER_FULL_FOR_ALL is on`, '');
  } else {
    row('proWeight', 'PRO_TURN_WEIGHT is 2 (D5: a Pro message counts as 2)', config.proTurnWeight >= 2, `${config.proTurnWeight}`,
      'D5 (approved): set PRO_TURN_WEIGHT=2 on Render in the same release that opens paid plans.');
  }

  const gaps = billingKeyGaps(); const short = Object.entries(gaps);
  row('i18n', 'Every paid-plan word is in all 13 languages', !short.length, short.length ? short.map(([c, k]) => `${c} lacks ${k.length}`).join(', ') : 'complete',
    'Translate the missing keys (tests/unit/billing-i18n.test.js lists them), then deploy.');

  row('public', 'BILLING_PUBLIC is 1 (the last switch: everyone sees /plans)', config.billingPublic, config.billingPublic ? 'set to 1' : 'not set: only browsers with the preview cookie see paid plans',
    'Last step, once every row above is green and the test purchase in docs/billing-go-live.md worked: set BILLING_PUBLIC=1.');

  return { rows, ready: rows.filter(r => r.ok).length, total: rows.length, live };
}
