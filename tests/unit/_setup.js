// Shared test setup: in-memory DB, quiet logs, billing off. Import this FIRST in every unit test.
import { NO_STRIPE_ENV } from '../support/no-stripe-env.js';

process.env.BRB_DB = ':memory:';
process.env.BRB_SILENT = '1';
process.env.LOG_REQUESTS = '0';
// The teacher landing page at "/" for visitors with no session (server/routes/landing.js) is off in unit tests unless a
// test turns it on (tests/unit/teacher-landing.test.js): the older home-page tests describe the signed-out home, which
// is now /play. Whoever merges the Play/Learn homes moves those tests to /play and drops this line.
if (process.env.LANDING_AT_ROOT === undefined) process.env.LANDING_AT_ROOT = '0';
// The arcade games and the courses (ARCADE, COURSES; services/game-focus.js) are hidden by default on the site, but the
// unit tests describe the whole product: both are on here unless a test turns them off first (tests/unit/focus-hide.test.js).
if (process.env.ARCADE === undefined) process.env.ARCADE = '1';
if (process.env.COURSES === undefined) process.env.COURSES = '1';
// Tug of Math and Question Battle are off the site for good (REMOVED_GAMES; services/game-focus.js), but their code stays
// and its tests describe it: back on here unless a test turns the removal on first (tests/unit/removed-games.test.js).
if (process.env.REMOVED_GAMES === undefined) process.env.REMOVED_GAMES = 'none';
// Public games (PUBLIC_GAMES; services/games.js openToAll) are off on the site; the older tests publish games for everyone,
// so they are on here too unless a test turns them off first (tests/unit/play-topics-private.test.js).
if (process.env.PUBLIC_GAMES === undefined) process.env.PUBLIC_GAMES = '1';
// Homeroom's first-run guide and the student's intro card (HOMEROOM_ONBOARDING; config.homeroomOnboarding) would sit over
// the board and the desk in the older browser tests: off here unless a test turns it on (homeroom-onboarding tests).
if (process.env.HOMEROOM_ONBOARDING === undefined) process.env.HOMEROOM_ONBOARDING = '0';
// Billing off unless a test turns it on against the fake Stripe: exported STRIPE_* settings never reach a test.
for (const k of Object.keys(NO_STRIPE_ENV)) delete process.env[k];
// Email off unless a test turns it on with a fake Resend (services/email.js _hooks): exported keys never reach a test.
for (const k of ['RESEND_API_KEY', 'EMAIL_ENABLED', 'EMAIL_FROM', 'EMAIL_REPLY_TO', 'EMAIL_POSTAL_ADDRESS']) delete process.env[k];
