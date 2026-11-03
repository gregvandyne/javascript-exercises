// A full classroom on one server (docs/live-capacity.md): scripts/live-load.js in its light form hosts each built-in
// live mode on a real projector page with 10 bot players on the real protocol (HTTP join + WebSocket), answers at human
// speed, and checks that everyone is seated, every bot gets every question and every answer is counted at the reveal.
// The full audit (10, 20 and 30 players, server CPU, bytes per player, screenshots) is the same script with
// SIZES=10,20,30 SERVER_PID=... (see the doc). LIVE_LOAD_SHOTS=<dir> keeps the screenshots.
import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { ADMIN } from './helpers.js';

test('10 players in each live mode: everyone seated, every question and every answer counted', async ({ baseURL }) => {
  test.setTimeout(10 * 60_000);
  const out = process.env.LIVE_LOAD_SHOTS || fs.mkdtempSync(path.join(os.tmpdir(), 'live-load-'));
  const run = await new Promise(resolve => execFile(process.execPath, ['scripts/live-load.js'], {
    env: { ...process.env, BASE: baseURL, ADMIN_USER: ADMIN.username, ADMIN_PASS: ADMIN.password, OUT: out, MODES: 'battle,board,quest-race', SIZES: '10', QUESTIONS: '1', SECS: '6' }, maxBuffer: 16 * 1024 * 1024,
  }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr })));
  const results = fs.existsSync(path.join(out, 'load.json')) ? JSON.parse(fs.readFileSync(path.join(out, 'load.json'), 'utf8')) : [];
  expect(run.code, `${run.stdout}\n${run.stderr}`.slice(-4000)).toBe(0);
  expect(results.map(r => r.mode)).toEqual(['battle', 'board', 'quest-race']);
  for (const r of results) {
    expect(r.seated, `${r.mode}: everyone seated`).toBe(10);
    expect(r.everyBotGotEveryQuestion, `${r.mode}: every question reached every player`).toBe(true);
    expect(r.answersCounted, `${r.mode}: every answer counted`).toBe(r.answersSent);
  }
});
