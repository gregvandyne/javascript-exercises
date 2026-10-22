// Payout adapters (Money node). Today every payout is handled by a person: a builder asks, a row
// with status 'requested' appears on /admin/money, an admin sends the money by hand (with a grown-up's
// consent for under-18 builders) and presses "Mark paid". Nothing here moves real money.
//
// Stripe Connect adapter: DESIGNED, NOT CONNECTED. No network calls are made. To switch it on later:
//  1. Onboarding: createAccountLink(user) -> Stripe Connect *Express* account (type: 'express',
//     capabilities: { transfers }), owned by the builder's parent/guardian for minors; store the
//     acct_ id in a new `payout_accounts(user_id, provider, account_id, status)` table (migration 0003_money).
//  2. Requests: onRequested(payout) -> stripe.transfers.create({ amount, currency: 'usd',
//     destination: account_id, transfer_group: payout.id }, { idempotencyKey: payout.id }).
//  3. Webhooks: POST /api/stripe/webhook (raw body + signature check) moves payouts to 'paid' or
//     'failed' on transfer.paid / transfer.failed, and audits each change.
//  4. Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, PAYOUT_PROVIDER=stripe. Keep 'manual' as fallback.
//
// Interface: { name, enabled, onRequested(payout, user), createAccountLink(user) -> url, transfer(payout) }

export const manualAdapter = {
  name: 'manual',
  enabled: true,
  onRequested() { /* nothing to do: the request shows up on /admin/money for a person to handle */ },
  async createAccountLink() { return null; },
  async transfer() { return { status: 'requested' }; },
};

export const stripeConnectAdapter = {
  name: 'stripe',
  enabled: false,
  onRequested() { /* TODO: call transfer(payout) when enabled; until then manual handling applies */ },
  async createAccountLink(/* user */) {
    // TODO: const acct = await stripe.accounts.create({ type: 'express', capabilities: { transfers: { requested: true } } });
    // TODO: return (await stripe.accountLinks.create({ account: acct.id, type: 'account_onboarding', refresh_url, return_url })).url;
    throw new Error('Stripe Connect payouts are not switched on yet.');
  },
  async transfer(/* payout */) {
    // TODO: stripe.transfers.create({ amount: payout.amount_cents, currency: 'usd', destination, transfer_group: payout.id }, { idempotencyKey: payout.id })
    throw new Error('Stripe Connect payouts are not switched on yet.');
  },
};

const ADAPTERS = { manual: manualAdapter, stripe: stripeConnectAdapter };
export function payoutAdapter() {
  const a = ADAPTERS[process.env.PAYOUT_PROVIDER || 'manual'];
  return a && a.enabled ? a : manualAdapter;
}
