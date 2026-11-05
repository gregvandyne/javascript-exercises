// Brain Board Number Quest lessons (Greg, 5 Nov 2026): a lesson board completes at a points goal
// (3,000 of the board's 7,500 face points), not at a full clear, and the board saves as you play.
// The first tests pin the goal against the board's real tile values (both of Greg's routes, many
// easy tiles or fewer hard ones, verified arithmetically at face value) and pin the save / restore /
// report wiring in the game file. The Chromium tests then play real lesson boards inside the
// production frame wrapper through the game's own test hooks: progress persists across sessions,
// reaching the goal completes the step without clearing the board and reports exactly once, and a
// board used up below the goal reports nothing and comes back fresh. They skip without Chromium.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/brain-board.html'), 'utf8');
const GOAL = Number(/var NQ_GOAL = (\d+);/.exec(HTML)[1]);

test('brain-board lesson: the points goal against the real tile values', () => {
  assert.match(HTML, /v: \(r \+ 1\) \* 100/, 'tile values are the row ladder, (row + 1) x 100');
  const tiles = [100, 200, 300, 400, 500].flatMap(v => Array(5).fill(v)); // five columns of five rows
  const total = tiles.reduce((a, b) => a + b, 0);
  assert.equal(total, 7500, 'the board holds 7,500 face points');
  assert.equal(GOAL, 3000);
  assert.ok(GOAL / total >= 0.4 && GOAL / total <= 0.5, 'a solid share of the board, not a token tile or two');
  // Greg's easy route: every tile worth 300 or less, correct answers only, no speed bonus counted.
  const easy = tiles.filter(v => v <= 300);
  assert.equal(easy.length, 15);
  assert.equal(easy.reduce((a, b) => a + b, 0), GOAL, 'the easy route lands exactly on the goal');
  const asc = [...tiles].sort((a, b) => a - b);
  assert.ok(asc.slice(0, 14).reduce((a, b) => a + b, 0) < GOAL, 'no shorter easy route sneaks under the work');
  // Greg's hard route: the richest tiles first.
  const desc = [...tiles].sort((a, b) => b - a);
  assert.ok(desc.slice(0, 6).reduce((a, b) => a + b, 0) < GOAL, 'six tiles can never be enough');
  assert.ok(desc.slice(0, 7).reduce((a, b) => a + b, 0) >= GOAL, 'seven hard tiles reach it');
});

test('brain-board lesson: saving, restoring and the once-only report are wired', () => {
  assert.match(HTML, /id="goal" hidden/, 'the goal pill sits in the top bar');
  assert.match(HTML, /t\('goal', \{ have: nqFmt\(Math\.round\(practice\.score\)\), need: nqFmt\(NQ_GOAL\) \}\)/, 'the pill shows points so far against the goal');
  assert.match(HTML, /'bb-nq-' \+ String\(BRB\.params\.mode\)/, 'the save is keyed per course step');
  assert.match(HTML, /BRB\.storage\.set\(nqKey\(\), \{/, 'answering saves the board');
  assert.match(HTML, /BRB\.storage\.get\(nqKey\(\)\)/, 're-entering reads the saved board');
  assert.match(HTML, /passed: nqPassed \? 1 : 0/, 'whether the goal was met is saved with the board');
  assert.match(HTML, /if \(!left && !nqPassed\) return null;/, 'a used-up board below the goal starts fresh');
  assert.match(HTML, /if \(justPassed\) \{\s*try \{ BRB\.score\.submit\(p\.score, 'board points'\); BRB\.gameOver\(\{ won: true, score: p\.score \}\)/, 'reaching the goal is what reports the lesson');
  assert.equal((HTML.match(/stepDone:/g) || []).length, 13, 'the step-complete strings exist in all 13 locales');
  assert.equal((HTML.match(/keepPlaying:/g) || []).length, 13, 'the keep-playing strings exist in all 13 locales');
  assert.equal((HTML.match(/tryFresh:/g) || []).length, 13, 'the fresh-board strings exist in all 13 locales');
});

test('brain-board lesson: the missions and the decision record state the new rule', () => {
  for (const n of ['1.1', '2.3']) {
    const deck = JSON.parse(fs.readFileSync(path.join(ROOT, `seed-lessons/number-quest/course/explorer/${n}.json`), 'utf8'));
    const mission = deck.slides.at(-1);
    assert.equal(mission.kind, 'mission', n);
    assert.match(mission.text, /score 3,000 points to finish/, `${n} states the points goal`);
    assert.match(mission.text, /board saves as you go/, `${n} says the board saves`);
    assert.doesNotMatch(mission.text, /finish the whole board/, `${n} no longer demands the whole board`);
  }
  const decisions = fs.readFileSync(path.join(ROOT, 'docs/decisions.md'), 'utf8');
  assert.match(decisions, /## Brain Board lessons complete at a points goal/);
  assert.match(decisions, /Brain Board's Number Quest lessons only/);
});

/* ---------- real Chromium, inside the production frame wrapper ---------- */
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  path.join(os.homedir(), '.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'),
  path.join(os.homedir(), '.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell')];
const exe = process.env.BRB_CHROMIUM || LOCAL.find(f => fs.existsSync(f));
const skip = !exe && !process.env.PLAYWRIGHT_BROWSERS_PATH ? 'no Chromium on this machine' : false;
const { frameDocument, frameCsp, SANDBOX } = await import('../../server/services/frame.js');
const HOST = 'http://game.invalid';
const TYPES = { js: 'text/javascript', woff2: 'font/woff2', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', svg: 'image/svg+xml' };
let browser;
test.after(async () => { if (browser) await browser.close(); });

async function open({ save = {} } = {}) {
  if (!browser) { const { chromium } = await import('playwright-core'); browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] }); }
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const init = { user: { displayName: 'P', avatar: 'x', lang: 'en', dir: 'ltr' }, game: { id: 'g', title: 'Brain Board' }, save, canSave: true, preview: false, params: { mode: 'nq-1-1', lock: 1 } };
  const doc = frameDocument(HTML, init);
  const host = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%;display:block}</style><script>window.__msgs=[];addEventListener('message',function(e){var d=e.data;if(d&&d.brb===1)window.__msgs.push(d);});</script><iframe sandbox="${SANDBOX}" src="${HOST}/frame"></iframe>`;
  const pageErrors = [];
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u === HOST + '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: host });
    if (u === HOST + '/frame') return route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': frameCsp(HOST) }, body: doc });
    const m = /^http:\/\/game\.invalid\/vendor\/([\w./-]+)$/.exec(u);
    if (m) {
      const f = path.join(ROOT, 'public/vendor', m[1]);
      if (!fs.existsSync(f)) return route.abort();
      return route.fulfill({ status: 200, headers: { 'content-type': TYPES[path.extname(f).slice(1)] || 'application/octet-stream', 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) });
    }
    return route.abort();
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => pageErrors.push(String(e.message)));
  await page.goto(HOST + '/', { waitUntil: 'load' });
  let frame = null;
  for (let i = 0; i < 200 && !frame; i++) { frame = page.frames().find(f => f.url() === HOST + '/frame'); if (!frame) await page.waitForTimeout(25); }
  await frame.waitForFunction(() => window.__brbTest && typeof window.__brbTest.start === 'function', null, { timeout: 60_000 });
  return { ctx, page, frame, pageErrors };
}
const S = frame => frame.evaluate(() => window.__brbTest.state());
const msgs = page => page.evaluate(() => window.__msgs);
async function startBoard(frame) {
  await frame.evaluate(() => window.__brbTest.start());
  const ready = () => frame.waitForFunction(() => { const s = window.__brbTest.state(); return s.board && s.canPick; }, null, { timeout: 20_000 });
  try { await ready(); } catch (e) {
    const hot = await frame.$('.ok-title-screen .ok-hot');
    if (hot) await hot.click();
    await ready();
  }
}
/** Answer one tile through the game's own hooks; pick(state) returns [column, row] of an open tile. */
async function answer(frame, pick, correctly) {
  const st = await S(frame);
  const at = pick(st);
  assert.ok(at, 'a tile to answer');
  await frame.evaluate(([c, r]) => window.__brbTest.pick(c, r), at);
  await frame.waitForFunction(() => { const s = window.__brbTest.state(); return s.question && !s.question.answered && typeof s.question.correct === 'number'; }, null, { timeout: 15_000 });
  const q = (await S(frame)).question;
  await frame.evaluate(i => window.__brbTest.answer(i), correctly ? q.correct : (q.correct + 1) % q.choices.length);
  await frame.waitForTimeout(2200); // the reveal holds about two seconds before the next pick
}
const openInRows = rows => st => {
  for (const r of rows) for (let ci = 0; ci < st.board.done.length; ci++) if (st.board.done[ci][r] === 0) return [ci, r];
  return null;
};
const wonReports = async page => (await msgs(page)).filter(m => m.type === 'brb:gameover' && m.won === true).length;
/** The newest cloud save the frame sent its parent, as the next session's starting save.
    On the wire a save is { type: 'brb:save', data: { key: jsonString } } — the store the server
    persists per player and hands back as the next frame's starting save. */
async function latestSave(page) {
  await page.waitForFunction(() => window.__msgs.some(m => m.type === 'brb:save' && m.data && typeof m.data['bb-nq-nq-1-1'] === 'string'), null, { timeout: 15_000 });
  const all = (await msgs(page)).filter(m => m.type === 'brb:save');
  return all[all.length - 1].data;
}

test('brain-board lesson: progress persists, the goal completes the step once, short of a full clear', { skip, timeout: 300_000 }, async () => {
  // Session A: answer only the two easiest rows (100s and 200s) correctly. Even with the speed
  // bonus and a doubled Lucky Star that cannot reach 3,000, so nothing may complete yet.
  const a = await open();
  await startBoard(a.frame);
  for (let k = 0; k < 10; k++) await answer(a.frame, openInRows([0, 1]), true);
  const stA = await S(a.frame);
  assert.equal(stA.board.left, 15, 'ten tiles answered');
  assert.ok(stA.goal.have >= 1500 && stA.goal.have < GOAL, `below the goal at ${stA.goal.have}`);
  assert.equal(stA.goal.passed, false);
  assert.equal(await wonReports(a.page), 0, 'no completion below the goal');
  const store = await latestSave(a.page);
  assert.equal(JSON.parse(store['bb-nq-nq-1-1']).score, stA.goal.have, 'the save carries the score');
  await a.ctx.close();

  // Session B: the same student comes back — the board is exactly as they left it.
  const b = await open({ save: store });
  await startBoard(b.frame);
  const stB = await S(b.frame);
  assert.deepEqual(stB.board.done, stA.board.done, 'tiles cleared stay cleared');
  assert.equal(stB.goal.have, stA.goal.have, 'points kept');
  assert.equal(stB.goal.passed, false);
  const pill = await b.frame.evaluate(() => document.getElementById('goal').textContent);
  assert.match(pill, /of 3,000 points/, 'the goal is on screen: points so far against the target');

  // Play on until the goal is met: the step completes there, with tiles still on the board,
  // and the completion report fires exactly once even as play continues afterwards.
  let guard = 0;
  while (!(await S(b.frame)).goal.passed && guard++ < 12) await answer(b.frame, openInRows([2, 3, 4, 0, 1]), true);
  const stP = await S(b.frame);
  assert.equal(stP.goal.passed, true, 'the goal was reached');
  assert.ok(stP.goal.have >= GOAL);
  assert.ok(stP.board.left >= 5, `the step completed with ${stP.board.left} tiles still on the board — no full clear needed`);
  assert.equal(await wonReports(b.page), 1, 'the completion reported exactly once');
  assert.match(stP.status, /Step complete!/, 'the board shows the step is complete');
  await answer(b.frame, openInRows([0, 1, 2, 3, 4]), true);
  await answer(b.frame, openInRows([0, 1, 2, 3, 4]), true);
  assert.equal(await wonReports(b.page), 1, 'playing on after the goal never reports twice');
  assert.deepEqual(b.pageErrors, []);
  await b.ctx.close();
});

test('brain-board lesson: a board used up below the goal completes nothing and comes back fresh', { skip, timeout: 300_000 }, async () => {
  const c = await open();
  await startBoard(c.frame);
  let guard = 0;
  while ((await S(c.frame)).board.left > 0 && guard++ < 30) await answer(c.frame, openInRows([0, 1, 2, 3, 4]), false);
  await c.frame.waitForFunction(() => window.__brbTest.state().ended, null, { timeout: 15_000 });
  const stC = await S(c.frame);
  assert.equal(stC.goal.have, 0, 'every answer wrong: no points earned');
  assert.equal(stC.goal.passed, false);
  assert.equal(await wonReports(c.page), 0, 'below the goal, no completion — full clear or not');
  const store = await latestSave(c.page);
  await c.ctx.close();

  const d = await open({ save: store });
  await startBoard(d.frame);
  const stD = await S(d.frame);
  assert.equal(stD.board.left, 25, 'the used-up board starts fresh');
  assert.equal(stD.goal.have, 0);
  assert.ok(stD.board.done.every(col => col.every(x => x === 0)), 'no tile carried over');
  assert.deepEqual(d.pageErrors, []);
  await d.ctx.close();
});
