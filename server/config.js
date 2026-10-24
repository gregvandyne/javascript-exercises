// All configuration comes from env vars with safe defaults. Documented in README.md.
import path from 'node:path';

const num = (v, d) => (v === undefined || v === '' || isNaN(+v) ? d : +v);
// A dollar amount: 0 or more (0 turns the AI off); anything else falls back to the default.
const posNum = (v, d) => { const n = num(v, d); return Number.isFinite(n) && n >= 0 ? n : d; };

export const config = {
  port: num(process.env.PORT, 3000),
  env: process.env.NODE_ENV || 'development',
  dataDir: process.env.BRB_DATA_DIR || path.resolve(process.cwd(), 'data'),
  db: process.env.BRB_DB || '', // ':memory:' for tests; default <dataDir>/brb.db
  sessionSecret: process.env.SESSION_SECRET || '',
  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
  builderModel: process.env.BUILDER_MODEL || 'claude-sonnet-5-5',
  builderProModel: process.env.BUILDER_PRO_MODEL || 'claude-opus-5-5',
  builderDailyTurns: num(process.env.BUILDER_DAILY_TURNS, 60),
  builderMaxTokens: num(process.env.BUILDER_MAX_TOKENS, 32000),
  // AI spending cap in US dollars (see server/services/ai-budget.js). Calls stop once either is reached.
  aiDailyBudgetUsd: posNum(process.env.AI_DAILY_BUDGET_USD, 5),
  aiMonthlyBudgetUsd: posNum(process.env.AI_MONTHLY_BUDGET_USD, 50),
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  adEcpmCents: num(process.env.AD_ECPM_CENTS, 200),
  builderShare: num(process.env.BUILDER_SHARE, 0.7),
  payoutThresholdCents: num(process.env.PAYOUT_THRESHOLD_CENTS, 1000),
  adIpDailyCap: num(process.env.AD_IP_DAILY_CAP, 200),
  chatDailyLimit: num(process.env.CHAT_DAILY_LIMIT, 300),
  reportsToHide: num(process.env.REPORTS_TO_HIDE, 3),
  posthogKey: process.env.POSTHOG_KEY || '',
  posthogHost: process.env.POSTHOG_HOST || 'https://us.i.posthog.com',
  logRequests: process.env.LOG_REQUESTS !== '0',
};
