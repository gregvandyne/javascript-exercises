// Tug of Math Live end to end (docs/live-protocol.md "Tug of Math"): the demo teacher picks Tug of Math on /live with a
// grade and a length, four guests join on phones and are split into two teams of two, the projector shows both teams in
// the lobby, then the tug, the clock and each team's pulls; each player answers their own questions on the keypad (taps)
// or the keyboard (digits and Enter), a wrong answer shows the right one, and the rope moves until one team pulls it past
// the line; everyone sees the winner, the projector moves to the results (team podium, each player's right answers).
// The projector at 1920 × 1080 and a phone at 390 × 844 pass the layout check (tests/e2e/frame-fit.js).
// LIVE_SHOTS=<dir> saves the screenshots.
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { login, ownIp } from './helpers.js';
import { frameProblems, pageScrollsSideways } from './frame-fit.js';

const SHOTS = process.env.LIVE_SHOTS || '';
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `tug-live-${name}.png`) }); };
const TEACHER = { username: 'DemoTeacher', password: 'demo-pass-123' };
const frameOf = page => page.frames().find(x => /\/live\/frame\//.test(x.url()));
async function liveFrame(page) {
  let f = null;
  await expect.poll(async () => {
    f = frameOf(page);
    if (!f) return false;
    try { return !!(await f.evaluate(() => window.__brbTest && window.__brbTest.state && window.__brbTest.state().tugLive)); } catch { return false; }
  }, { timeout: 45_000 }).toBe(true);
  return f;
}
const state = f => f.evaluate(() => window.__brbTest.state());
/** A question's answer from its tokens, worked out here (never sent by the server). */
function solve(e) {
  const OP = { add: '+', sub: '-', mul: '*', div: '/', lp: '(', rp: ')', sq: '**2', cu: '**3', pow: '**', pct: '/100', of: '*', x: '(x)', q: '(x)', sqrt: 'Math.sqrt' };
  const f = toks => Function('x', `return ${toks.map((t, i) => (typeof t === 'number' ? `(${t})${toks[i + 1] === 'x' || toks[i + 1] === 'q' ? '*' : ''}` : OP[t])).join('')}`);
  const eq = e.indexOf('eq');
  if (eq < 0) return f(e)(0);
  const L = f(e.slice(0, eq)), R = f(e.slice(eq + 1));
  for (let x = -3000; x <= 3000; x++) if (Math.abs(L(x) - R(x)) < 1e-9) return x;
  return null;
}
async function player(browser, code, viewport = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({ viewport, hasTouch: true });
  const page = await ctx.newPage();
  await ownIp(page);
  await page.goto(`/join#${code}`);
  await expect(page.locator('#jc')).toHaveValue(code);
  await page.click('#lv-join button[type=submit]');
  await expect(page.locator('#lv-card-step')).toBeVisible();
  await page.click('#lv-go');
  await page.waitForURL(/\/live\/play\//);
  return page;
}
/** The open question, once it shows and is not waiting for a result. */
async function openQ(f) {
  let q = null;
  await expect.poll(async () => { const s = await state(f); q = s.question; return !!(q && !q.locked && s.phase === 'playing' && s.tug && s.tug.win == null); }, { timeout: 20_000 }).toBe(true);
  return q;
}
/** Tap the answer on the keypad, then the check key. */
async function tap(f, v, timeout) {
  const o = timeout ? { timeout } : {};
  if (v < 0) await f.locator('.arow .key[data-k="pm"]').tap(o);
  for (const d of String(Math.abs(v))) await f.locator(`.keys .key[data-k="${d}"]`).tap(o);
  await f.locator('.keys .key[data-k="ok"]').tap(o);
}

test('a live room: host and four players on phones, two teams, keypads and keyboard, the rope to the line, the results', async ({ browser }) => {
  test.setTimeout(240_000);
  const hctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const host = await hctx.newPage();
  const errors = [];
  host.on('pageerror', e => errors.push(`host: ${e.message}`));
  await login(host, TEACHER.username, TEACHER.password);
  // a room another test left open (a failed one) is ended first, so this one starts clean
  const mine = await (await host.request.get('/api/live/mine')).json();
  if (mine.sid) { await host.goto(mine.host); host.once('dialog', d => d.accept()); await host.locator('#lv-controls [data-lv-act="end"]:not([hidden])').click(); await expect.poll(async () => (await (await host.request.get('/api/live/mine')).json()).sid || null).toBe(null); }
  // the landing: Tug of Math with its grade (sample questions) and length; no teams row, no question set
  await host.goto('/live');
  await host.locator('label.lv-pick', { has: host.locator('input[value="mode:tug"]') }).click();
  await expect(host.locator('#lv-tug-opts')).toBeVisible();
  await expect(host.locator('#lv-sets')).toBeHidden();
  await expect(host.locator('#lv-teams-landing')).toBeHidden();
  await host.selectOption('#lv-tug-grade', '2');
  await expect(host.locator('#lv-tug-sample')).toContainText(/[+−]/);
  await host.selectOption('#lv-tug-len', '120');
  await host.locator('input[name="audience"][value="open"]').check();
  // DemoTeacher may still host a game an earlier spec left open (tts.spec.js): "Replace it?" yes, as a teacher starting
  // a new game would answer (Playwright's default answer is no, which goes back to that old game).
  host.on('dialog', d => d.accept());
  await host.locator('#lv-new button[type=submit]').click();
  await host.waitForURL(/\/live\/host\//);
  const code = (await host.locator('#lv-code').textContent()).replace(/\s/g, '');
  await expect(host.locator('#lv-controls [data-lv-act="next"]')).toHaveCount(0);
  const ps = [];
  for (let i = 0; i < 4; i++) ps.push(await player(browser, code));
  for (const [i, p] of ps.entries()) p.on('pageerror', e => errors.push(`player ${i}: ${e.message}`));
  const hf = await liveFrame(host);
  const fs = [];
  for (const p of ps) fs.push(await liveFrame(p));
  // the lobby: two teams of two, on every phone its team; the projector lists both teams
  await expect.poll(async () => (await Promise.all(fs.map(state))).map(s => s.team).sort().join(','), { timeout: 20_000 }).toBe('1,1,2,2');
  await expect(hf.locator('.tlh .col.b li canvas')).toHaveCount(2);
  await expect(hf.locator('.tlh .col.r li canvas')).toHaveCount(2);
  await expect(hf.locator('.tlh .foot')).toContainText('Grade 2');
  await expect(fs[0].locator('.tl-wait .big canvas')).toHaveCount(1);   // the team's mascot, not a plain shape
  await expect(fs[0].locator('.tl-wait h2')).toContainText(/Your team: (Blue Whales|Red Foxes)/);
  await shot(host, 'lobby-host'); await shot(ps[0], 'lobby-phone');
  // start: everyone gets a question of their own; the clock runs on the projector
  await host.locator('#lv-controls [data-lv-act="start"]:not([hidden])').click();
  const qs = await Promise.all(fs.map(openQ));
  expect(qs.every(q => q.i === 0 && /[+−]/.test(q.text))).toBe(true);
  expect((await state(fs[0])).minusKey).toBe(false);
  await expect(hf.locator('.tlh .scene')).toBeVisible();
  await expect.poll(async () => (await state(hf)).tug.run).toBe(1);
  await expect(hf.locator('.tlh .tl-clock')).toContainText(/1:5\d|2:00/);
  // the layout: the projector at 1920 × 1080 and a phone at 390 × 844, mid-game
  await host.waitForTimeout(600);
  expect(await frameProblems(hf)).toEqual([]); expect(await pageScrollsSideways(host)).toBe(false);
  expect(await frameProblems(fs[0])).toEqual([]); expect(await pageScrollsSideways(ps[0])).toBe(false);
  await shot(host, 'play-host'); await shot(ps[0], 'play-phone');
  // a wrong answer (keypad taps): the right one shows, then the next question
  const wrong = qs[0].e; const right0 = solve(wrong);
  await tap(fs[0], right0 + 1);
  // (the number is in an isolate, which keeps a minus sign on its left in Arabic and Hebrew)
  await expect(fs[0].locator('.play .say')).toContainText(`It was \u2066${right0}\u2069`);
  await expect(fs[0].locator('.qcard')).toHaveClass(/wrong/);
  await expect.poll(async () => (await state(fs[0])).question && (await state(fs[0])).question.i).toBe(1);
  // a right answer by keyboard (digits, then Enter)
  const q1 = await openQ(fs[1]);
  await fs[1].locator('.qcard').click();
  for (const d of String(solve(q1.e))) await ps[1].keyboard.press(d);
  await ps[1].keyboard.press('Enter');
  await expect.poll(async () => (await state(fs[1])).right).toBe(1);
  // the rope: one team keeps answering right until it is past the line
  const s0 = await Promise.all(fs.map(state));
  const blueIx = s0.map((s, i) => (s.team === 1 ? i : -1)).filter(i => i >= 0);
  for (let k = 0; k < 40; k++) {
    const h = await state(hf);
    if (h.tug && h.tug.win != null) break;
    for (const i of blueIx) {
      // a team of two pulls half a step a right answer: the line can be crossed after the first player's answer
      if ((await state(hf)).tug.win != null) break;
      const q = await openQ(fs[i]);
      // (the win can still be on its way to this phone: then its keypad goes away mid-answer)
      try { await tap(fs[i], solve(q.e), 5_000); } catch (e) { if ((await state(hf)).tug.win == null) throw e; break; }
    }
  }
  await expect.poll(async () => (await state(hf)).tug.win, { timeout: 20_000 }).toBe(1);
  await expect(hf.locator('.scene .banner')).toHaveText('Winner: Blue Whales');
  const redIx = s0.findIndex(s => s.team === 2);
  await expect(fs[blueIx[0]].locator('.tl-wait')).toContainText('Your team won!');
  await expect(fs[redIx].locator('.tl-wait')).toContainText('The other team won this time');
  await shot(host, 'win-host'); await shot(ps[redIx], 'win-phone');
  // the results: the projector page moves there (team podium first), every player's right answers in the details
  await host.locator('#lv-see-results').click({ timeout: 15_000 }).catch(() => {});
  await host.waitForURL(/\/live\/results\//, { timeout: 30_000 });
  await expect(host.locator('#lv-team-podium li')).toHaveCount(2);
  await expect(host.locator('#lv-team-podium .lv-step-1')).toContainText('Blue Whales');
  await host.locator('#lv-details summary').click();
  await expect(host.locator('#lv-student-table tbody tr')).toHaveCount(4);
  await expect(host.locator("#lv-student-table")).toContainText(/\d+ of \d+ right/);
  await shot(host, 'results');
  expect(errors).toEqual([]);
  for (const p of ps) await p.context().close();
  await hctx.close();
});
