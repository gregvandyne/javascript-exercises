// Billing off for any server a test starts: a developer's or CI's exported Stripe settings (a live key, or a test key
// that would reach the real Stripe API) never leak into tests. Spread it after process.env; a billing test points at
// tests/support/fake-stripe.js on purpose instead.
export const NO_STRIPE_ENV = Object.freeze({
  STRIPE_API_KEY: '', STRIPE_WEBHOOK_SECRET: '', STRIPE_WEBHOOK_SECRET_OLD: '', STRIPE_LIVE_OK: '', STRIPE_TAX: '',
  STRIPE_API_BASE: '', STRIPE_API_VERSION: '', STRIPE_PMC_FAMILY: '', TERMS_PUBLISHED: '', BILLING_PUBLIC: '', BILLING_PREVIEW_TOKEN: '',
});
