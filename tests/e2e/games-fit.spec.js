// Every official game fits phones, tablets and desktops (docs/decisions.md "Tablets are a required check"):
// scripts/games-fit-audit.js opens each launch game on a phone (portrait and landscape), a tablet (portrait and
// landscape) and a desktop, with touch on phones and tablets, on the title screen and after pressing Play, and checks
// inside the game frame that nothing is off screen, cut off, on top of something else or squashed, that buttons are in
// view without scrolling, and that the page never scrolls sideways (tests/e2e/frame-fit.js).
// GAMES_FIT_SHOTS=<dir> keeps the screenshots (one per check) for a look by eye.
import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { ADMIN } from './helpers.js';

test('every official game fits phones and tablets in both orientations, and desktops', async ({ baseURL }) => {
  test.setTimeout(60 * 60_000);
  const out = process.env.GAMES_FIT_SHOTS || fs.mkdtempSync(path.join(os.tmpdir(), 'games-fit-'));
  const run = await new Promise(resolve => execFile(process.execPath, ['scripts/games-fit-audit.js'], {
    // the admin opens the course games, which have no page of their own for a guest
    env: { ...process.env, BASE: baseURL, OUT: out, ADMIN_USER: ADMIN.username, ADMIN_PASS: ADMIN.password }, maxBuffer: 32 * 1024 * 1024,
  }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr })));
  const report = fs.existsSync(path.join(out, 'report.json')) ? JSON.parse(fs.readFileSync(path.join(out, 'report.json'), 'utf8')) : [];
  const bad = report.filter(r => r.probs.length).map(r => `${r.slug} ${r.stage} ${r.size}: ${JSON.stringify(r.probs).slice(0, 400)}`);
  expect(run.code, `${run.stdout}\n${run.stderr}`.slice(-4000)).not.toBe(2);
  expect(report.filter(r => r.size.startsWith('tablet')).length, 'tablets were checked in both orientations').toBeGreaterThan(0);
  expect(bad, `screenshots in ${out}`).toEqual([]);
});
