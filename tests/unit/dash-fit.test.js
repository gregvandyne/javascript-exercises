// Classroom dashboards: nothing is ever cut off. Runs scripts/dash-fit-check.js (every widget type at its default and
// its smallest size; teacher normal and projector at 1600 × 900, student 1366 × 768, phone 390 × 844, light and dark;
// English, German and Arabic) in a child process: several minutes (stage 3 spreads the widgets over more layouts; stage 4
// adds its tools on more layouts and a dark phone). Skipped where no Chromium is installed
// (BRB_CHROMIUM, the repo's pinned browser, or Playwright's own build).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const exe = [process.env.BRB_CHROMIUM, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => p && fs.existsSync(p));
let haveBrowser = !!exe;
if (!haveBrowser) { try { haveBrowser = fs.existsSync(chromium.executablePath()); } catch { haveBrowser = false; } }

test('every dashboard widget fits its box: no content, control or text cut off, controls 12px clear of the edge (en, de, ar; teacher, projector, student, phone; light and dark; default and smallest sizes)', { skip: haveBrowser ? false : 'no Chromium installed', timeout: 3600e3 }, () => {
  const r = spawnSync(process.execPath, ['scripts/dash-fit-check.js'], { encoding: 'utf8', timeout: 3580e3, env: { ...process.env, OUT: '', SIZES: '', LANGS: '', VIEWS: '' } });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  assert.equal(r.status, 0, out);
  assert.match(out, /No problems found\./);
  // Every layout the script made (default, default-2..., min, min-2...): stage 3's tools are on the later ones.
  const keys = (/\d+ layouts: (.*)/.exec(out) || [])[1].split(', ');
  assert.ok(keys.includes('default') && keys.includes('min') && keys.length >= 10, keys.join());
  for (const size of keys) for (const lang of ['en', 'de', 'ar']) for (const view of ['teacher', 'projector', 'student', 'phone', 'teacher-dark', 'projector-dark', 'student-dark', 'phone-dark'])
    assert.match(out, new RegExp(`✓ ${size} ${lang} ${view}: nothing cut off`));
});
