// Every Oomba Live quiz mode fits every screen: scripts/live-layout-audit.js hosts each mode (Quest Race, Question
// Battle, Brain Board) with three players and checks the projector page and a player's page on a phone, a small phone,
// a tablet in portrait and in landscape, a desktop and a projector, in the lobby, during a long question, at the
// reveal, on the board and at the end (nothing off screen, cut off, on top of each other or squashed; no sideways
// scrolling: tests/e2e/frame-fit.js). Change a live game or the live pages? This test must stay green.
// LIVE_LAYOUT_SHOTS=<dir> keeps the screenshots (one per check) for a look by eye.
import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { ADMIN } from './helpers.js';

test('live games fit phones, tablets and desktops in every stage of the game', async ({ baseURL }) => {
  test.setTimeout(30 * 60_000);
  const out = process.env.LIVE_LAYOUT_SHOTS || fs.mkdtempSync(path.join(os.tmpdir(), 'live-layout-'));
  const run = await new Promise(resolve => execFile(process.execPath, ['scripts/live-layout-audit.js'], {
    env: { ...process.env, BASE: baseURL, ADMIN_USER: ADMIN.username, ADMIN_PASS: ADMIN.password, OUT: out }, maxBuffer: 16 * 1024 * 1024,
  }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr })));
  const report = fs.existsSync(path.join(out, 'report.json')) ? JSON.parse(fs.readFileSync(path.join(out, 'report.json'), 'utf8')) : [];
  const bad = report.filter(r => r.probs.length).map(r => `${r.mode} ${r.tag} ${r.who} ${r.size}: ${JSON.stringify(r.probs).slice(0, 400)}`);
  expect(run.code, `${run.stdout}\n${run.stderr}`.slice(-4000)).not.toBe(2);
  expect(report.length, 'every mode, stage, size and view was checked').toBeGreaterThanOrEqual(150);
  expect(bad, `screenshots in ${out}`).toEqual([]);
});
