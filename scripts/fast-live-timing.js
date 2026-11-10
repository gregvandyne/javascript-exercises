// Times "a first live game" on a running server and counts the steps (tests/support/fast-live-flow.js):
//   node scripts/fast-live-timing.js http://localhost:3000 [ms per key, default 150]
// The server needs LANDING_AT_ROOT on (the default) and live games on. It makes one teacher account.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import { firstLiveGame } from '../tests/support/fast-live-flow.js';

const base = process.argv[2] || 'http://localhost:3000';
const typeDelay = process.argv[3] === undefined ? 150 : +process.argv[3];
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
const username = `Quick${Array.from({ length: 6 }, () => 'bcdfghjkmnpqrstvwxz'[Math.floor(Math.random() * 19)]).join('')}`;
try {
  const r = await firstLiveGame(browser, base, { start: '/', username, typeDelay });
  const s = ms => `${(ms / 1000).toFixed(1)} s`;
  console.log(JSON.stringify({ typeDelayMs: typeDelay, teacherSteps: r.teacher.length, studentSteps: r.student.length, seconds: Object.fromEntries(Object.entries(r.marks).map(([k, v]) => [k, +(v / 1000).toFixed(1)])) }, null, 2));
  console.log(`\nTeacher: ${r.teacher.length} steps\n  ${r.teacher.join('\n  ')}`);
  console.log(`Each student: ${r.student.length} steps\n  ${r.student.join('\n  ')}`);
  console.log(`\nSign-up page open ${s(r.marks.signupPage)} · account made ${s(r.marks.account)} · room open ${s(r.marks.room)} · 3 guests in ${s(r.marks.joined)} · 3 guests answered ${s(r.marks.answered)}`);
} finally { await browser.close(); }
