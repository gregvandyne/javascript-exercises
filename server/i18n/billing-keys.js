// The words of paid plans (docs/decisions.md "Paid plans", "Plans page", "Spark Packs"): /plans, the grown-up and family
// pages, the school Billing tab, Spark Packs, the Builder's limit card, the paid-plan wording of /parents and /safety,
// the footer, and the legal pages. They must be in every site language before BILLING_PUBLIC (docs/billing-go-live.md):
// tests/unit/billing-i18n.test.js fails on a gap, and /admin/billing's "Ready to go live?" panel shows it.
import { dictionary, CODES, DEFAULT_LOCALE } from './index.js';

export const BILLING_KEY_PREFIXES = Object.freeze([
  'plans.', 'family.', 'school.billing.', 'school.tabs.billing',
  'info.terms.', 'info.refunds.', 'info.privacy.', 'info.legal.', 'layout.footer.', 'nav.plans', 'nav.grownups',
  'js.studio.limitCard.', 'js.studio.limit.', 'js.studio.extra', 'js.studio.sparks',
  'parents.plans.', 'parents.cta.',
]);
// paidN items: the wording that replaces pN once plans are public (server/routes/info.js items()).
const PAID_ITEM = /^(info\.(parents|safety)|parents)\..*\.paid\d+$/;
const isBilling = k => PAID_ITEM.test(k) || BILLING_KEY_PREFIXES.some(p => (p.endsWith('.') ? k.startsWith(p) : k === p || k.startsWith(`${p}.`)));

/** The English paid-plan keys. */
export const billingKeys = () => Object.keys(dictionary(DEFAULT_LOCALE)).filter(isBilling);

/** Paid-plan keys each language lacks: { code: [key, …] } for the languages with a gap (en-GB lists only UK
 *  differences and inherits the rest, so it is never short). */
export function billingKeyGaps() {
  const keys = billingKeys(); const out = {};
  for (const code of CODES) {
    if (code === DEFAULT_LOCALE || code === 'en-GB') continue;
    const d = dictionary(code); const miss = keys.filter(k => !(k in d));
    if (miss.length) out[code] = miss;
  }
  return out;
}
