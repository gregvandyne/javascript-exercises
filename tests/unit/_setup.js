// Shared test setup: in-memory DB, quiet logs, billing off. Import this FIRST in every unit test.
import { NO_STRIPE_ENV } from '../support/no-stripe-env.js';

process.env.BRB_DB = ':memory:';
process.env.BRB_SILENT = '1';
process.env.LOG_REQUESTS = '0';
// Billing off unless a test turns it on against the fake Stripe: exported STRIPE_* settings never reach a test.
for (const k of Object.keys(NO_STRIPE_ENV)) delete process.env[k];
