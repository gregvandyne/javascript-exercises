// Shared test setup: in-memory DB, quiet logs, billing off. Import this FIRST in every unit test.
import { NO_STRIPE_ENV } from '../support/no-stripe-env.js';

process.env.BRB_DB = ':memory:';
process.env.BRB_SILENT = '1';
process.env.LOG_REQUESTS = '0';
// The teacher landing page at "/" for visitors with no session (server/routes/landing.js) is off in unit tests unless a
// test turns it on (tests/unit/teacher-landing.test.js): the older home-page tests describe the signed-out home, which
// is now /play. Whoever merges the Play/Learn homes moves those tests to /play and drops this line.
if (process.env.LANDING_AT_ROOT === undefined) process.env.LANDING_AT_ROOT = '0';
// Billing off unless a test turns it on against the fake Stripe: exported STRIPE_* settings never reach a test.
for (const k of Object.keys(NO_STRIPE_ENV)) delete process.env[k];
