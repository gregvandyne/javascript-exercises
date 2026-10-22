// End-to-end tests run against a fresh server with its own temp database and the mock Builder.
import { defineConfig } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const PORT = +(process.env.E2E_PORT || 4310);
const DATA = process.env.E2E_DATA || fs.mkdtempSync(path.join(os.tmpdir(), 'brb-e2e-'));
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
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
  },
  webServer: {
    command: `node scripts/seed.js && node server/index.js`,
    url: `http://localhost:${PORT}/health`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: { PORT: String(PORT), BRB_DATA_DIR: DATA, ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'admin-pass-123', ANTHROPIC_API_KEY: '', BRB_SILENT: '1', REPORTS_TO_HIDE: '3' },
  },
});
