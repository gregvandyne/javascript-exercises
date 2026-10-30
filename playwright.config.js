// End-to-end tests run against a fresh server with its own temp database and the mock Builder.
import { defineConfig } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { NO_STRIPE_ENV } from './tests/support/no-stripe-env.js';

const PORT = +(process.env.E2E_PORT || 4310);
const DATA = process.env.E2E_DATA || fs.mkdtempSync(path.join(os.tmpdir(), 'brb-e2e-'));
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

// Locales for the test server: the real files, with the small stubs in tests/e2e/fixtures/locales merged over them,
// so tests/e2e/i18n.spec.js can check translated text whatever the translators have written so far.
const LOCALES = fs.mkdtempSync(path.join(os.tmpdir(), 'brb-e2e-locales-'));
const merge = (a, b) => { for (const [k, v] of Object.entries(b)) a[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(a[k] && typeof a[k] === 'object' ? a[k] : {}, v) : v; return a; };
for (const f of fs.readdirSync('server/i18n/locales').filter(f => f.endsWith('.json'))) fs.copyFileSync(path.join('server/i18n/locales', f), path.join(LOCALES, f));
for (const f of fs.readdirSync('tests/e2e/fixtures/locales')) {
  const real = JSON.parse(fs.readFileSync(path.join(LOCALES, f), 'utf8'));
  fs.writeFileSync(path.join(LOCALES, f), JSON.stringify(merge(real, JSON.parse(fs.readFileSync(path.join('tests/e2e/fixtures/locales', f), 'utf8')))));
}

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    launchOptions: fs.existsSync(exe) ? { executablePath: exe } : {},
    trace: 'retain-on-failure',
    locale: 'en-US',
  },
  // A fake Google (tests/support/fake-google.js) on E2E_PORT + 1, so Sign in with Google is on for the whole run.
  webServer: [{
    command: `node tests/support/fake-google.js --port ${PORT + 1}`,
    url: `http://127.0.0.1:${PORT + 1}/.well-known/openid-configuration`,
    reuseExistingServer: false,
    timeout: 10_000,
  }, {
    command: `node scripts/seed.js && node server/index.js`,
    url: `http://localhost:${PORT}/health`,
    reuseExistingServer: false,
    // Seeding the launch games (and their share images and covers) takes about 30 s on a slow machine.
    timeout: 90_000,
    // Billing off: Playwright merges process.env under this, so exported STRIPE_* settings are blanked like ANTHROPIC_API_KEY.
    env: { ...NO_STRIPE_ENV, PORT: String(PORT), BRB_DATA_DIR: DATA, BRB_LOCALES_DIR: LOCALES, BRB_ALL_LOCALES: '1', ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'admin-pass-123', DEMO_TEACHER_PASSWORD: 'demo-pass-123', ANTHROPIC_API_KEY: '', BRB_SILENT: '1',
      // Speaking instead of typing with the test-only provider (fixed words, no network), so the Studio has its mic;
      // a real STT_API_KEY and web search never reach a test server.
      STT_PROVIDER: 'mock', STT_API_KEY: '', STT_MODEL: '', BUILDER_WEB_SEARCH: '', REPORTS_TO_HIDE: '3', TRUST_PROXY: '1',
      GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'fake-test-secret', GOOGLE_OIDC_BASE: `http://127.0.0.1:${PORT + 1}` },
  }],
});
