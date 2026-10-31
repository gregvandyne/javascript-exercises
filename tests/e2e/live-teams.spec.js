// Oomba Live part 3, end to end: teams and teacher tools (docs/decisions.md "Oomba Live, part 3"; protocol:
// docs/live-protocol.md "Part 3"). The demo teacher hosts on the projector page; guests and the demo student join in
// their own browser contexts, all on the real socket. Teams (on, presets, drag and select-then-move, balance, shuffle,
// players choose, lock, late joiners), the team board on the projector, in Question Battle and on phones, the podium
// hold and the split results (team podium, hardest, review; student details closed; CSV; print), the teacher's
// dashboard on a phone (status, answer bars, needs help, bonus privacy), game settings and remembered defaults, eyes
// up, fixed messages in French and Arabic, +time and Reveal now, support (extra time) kept private, play again with the
// same teams, play the missed questions again, the class teams editor and "Use last teams", names hidden on the
// projector, Quest Race and Hero of Sunvale in team mode.
// LIVE_SHOTS=<dir> saves the screenshots. Run with LIVE_SAVE_SUPPORT=1 for the saved-support check.
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { login, ownIp } from './helpers.js';

const SHOTS = process.env.LIVE_SHOTS || '';
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };
const TEACHER = { username: 'DemoTeacher', password: 'demo-pass-123' }, STUDENT = { username: 'DemoStudent', password: 'demo-pass-123' };
const ITEMS = [
  { q: 'What is 2 + 3?', choices: ['5', '4', '6', '7'], answer: 0, secs: 20 },
  { q: 'What is 6 + 1?', choices: ['7', '8', '5', '6'], answer: 0, secs: 20 },
  { q: 'What is 9 - 4?', choices: ['5', '6', '3', '4'], answer: 0, secs: 20 },
  { q: 'What is 3 + 3?', choices: ['6', '5', '7', '9'], answer: 0, secs: 20 },
];
const solve = q => { const m = /(\d+)\s*([+−×-])\s*(\d+)/.exec(q); const a = +m[1], b = +m[3]; return String(m[2] === '+' ? a + b : m[2] === '×' ? a * b : a - b); };
const no3d = () => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (k, ...a) { return k === 'webgl2' ? null : g.call(this, k, ...a); }; };

async function signedIn(browser, who, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...opts });
  const page = await ctx.newPage(); await login(page, who.username, who.password); return page;
}
async function openRoom(page, body) {
  const origin = new URL(page.url()).origin;
  const r = await page.request.post('/api/live/sessions', { data: { audience: 'open', replace: true, ...body }, headers: { Origin: origin } });
  expect(r.status(), await r.text()).toBe(200);
  await page.goto((await r.json()).redirect);
  return (await page.locator('#lv-code').textContent()).replace(/\s/g, '');
}
async function player(browser, code, { viewport = { width: 420, height: 800 }, locale, colorScheme, init, account } = {}) {
  const ctx = await browser.newContext({ viewport, ...(locale ? { locale } : {}), ...(colorScheme ? { colorScheme } : {}) });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  if (account) await login(page, account.username, account.password); else await ownIp(page);
  await page.goto(`/join#${code}`);
  await expect(page.locator('#jc')).toHaveValue(code);
  await page.click('#lv-join button[type=submit]');
  if (account) await page.locator('#lv-as-me').click();
  else { await expect(page.locator('#lv-card-step')).toBeVisible(); await page.click('#lv-go'); }
  await page.waitForURL(/\/live\/play\//);
  return page;
}
async function liveFrame(page, ready = s => s && (s.game || s.phase || s.view)) {
  let f = null;
  await expect.poll(async () => {
    f = page.frames().find(x => /\/live\/frame\//.test(x.url()));
    if (!f) return false;
    try { return !!ready(await f.evaluate(() => window.__brbTest && window.__brbTest.state && window.__brbTest.state())); } catch { return false; }
  }, { timeout: 45_000 }).toBe(true);
  return f;
}
const state = f => f.evaluate(() => window.__brbTest.state());
async function waitPhase(f, phase, timeout = 20_000) { await expect.poll(async () => (await state(f)).phase, { timeout }).toBe(phase); }
async function waitQuestion(f, i) { await expect.poll(async () => { const s = await state(f); return s.phase === 'playing' && s.question && s.question.i === i ? 'open' : s.phase; }, { timeout: 25_000 }).toBe('open'); return (await state(f)).question; }
const act = (host, a) => host.locator(`#lv-controls [data-lv-act="${a}"]:not([hidden])`).click();
const sizes = async host => host.locator('#lv-teams-summary li').evaluateAll(els => els.map(e => +(/(\d+)/.exec(e.querySelector('.lv-team-extra').textContent) || [0, 0])[1]));
const seatOf = page => page.evaluate(() => { const f = [...document.querySelectorAll('iframe')][0]; return f ? null : null; });

test.describe.configure({ mode: 'serial' });

test('teams in the lobby: on with 3, presets, the Teams sheet (drag, select then move, balance, shuffle), players choose on a 360px phone, lock, a late joiner', async ({ browser }) => {
  test.setTimeout(240_000);
  const host = await signedIn(browser, TEACHER);
  const code = await openRoom(host, { pick: 'mode:battle', items: ITEMS });
  const guests = [];
  for (let i = 0; i < 5; i++) guests.push(await player(browser, code));
  await expect(host.locator('#lv-roster li')).toHaveCount(5);
  // Teams: 3 -> everyone placed at once, 2/2/1
  await host.locator('#lv-teams-n label', { hasText: '3' }).click();
  await expect(host.locator('#lv-teams-summary li')).toHaveCount(3);
  await expect.poll(async () => (await sizes(host)).sort().join(',')).toBe('1,2,2');
  await expect(host.locator('#lv-teams-summary')).toContainText('Blue Whales');
  // every device shows its team band (colour, shape and name)
  for (const g of guests) await expect(g.locator('#lv-me-team')).toBeVisible();
  await expect(guests[0].locator('.lv-play > .lv-bar')).toHaveAttribute('data-team', /[1-3]/);
  await liveFrame(host);
  await host.waitForTimeout(800);
  await host.evaluate(() => scrollTo(0, 0));
  await shot(host, 'lobby-teams-light');
  // the sheet; a preset change swaps with the team that had it
  await host.click('#lv-teams-edit');
  await expect(host.locator('#lv-teams-sheet')).toBeVisible();
  await expect(host.locator('#lv-teams-cols .lv-team')).toHaveCount(3);
  await expect(host.locator('#lv-teams-cols .lv-chip')).toHaveCount(5);
  await host.locator('#lv-teams-more > summary').click();
  await host.selectOption('#lv-preset-1', '2');       // team 1 takes Green Frogs; team 3 gets Blue Whales
  await expect(host.locator('#lv-teams-cols .lv-team[data-team="1"] .lv-team-name')).toHaveText('Green Frogs');
  await expect(host.locator('#lv-teams-cols .lv-team[data-team="3"] .lv-team-name')).toHaveText('Blue Whales');
  // keyboard: arrowing through a preset picker keeps focus on it while each change goes round the server (regression:
  // the pickers were rebuilt on every tms, dropping focus to <body>)
  await host.focus('#lv-preset-2');
  await host.keyboard.press('ArrowDown');
  await host.waitForTimeout(400);
  expect(await host.evaluate(() => document.activeElement && document.activeElement.id)).toBe('lv-preset-2');
  await host.keyboard.press('ArrowUp');
  await host.waitForTimeout(400);
  expect(await host.evaluate(() => document.activeElement && document.activeElement.id)).toBe('lv-preset-2');
  await expect(host.locator('#lv-preset-2')).toHaveValue(await host.locator('#lv-preset-2 option:checked').getAttribute('value'));
  await host.locator('#lv-teams-more > summary').click();
  await shot(host, 'teams-sheet');
  // drag a chip from team 1 to team 2
  const chip = host.locator('#lv-teams-cols .lv-team[data-team="1"] .lv-chip').first();
  const seat = await chip.getAttribute('data-seat');
  const target = host.locator('#lv-teams-cols .lv-team[data-team="2"]');
  const cb = await chip.boundingBox(), tb = await target.boundingBox();
  await host.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2); await host.mouse.down();
  await host.mouse.move(cb.x + cb.width / 2 + 20, cb.y + cb.height / 2 + 10, { steps: 3 });
  await host.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 8 });
  await expect(target).toHaveClass(/is-drop/);
  await shot(host, 'assign-drag');
  await host.mouse.up();
  await expect(host.locator(`#lv-teams-cols .lv-team[data-team="2"] .lv-chip[data-seat="${seat}"]`)).toHaveCount(1);
  // keyboard: select a chip (Enter), "Move here" on team 3, focus comes back to the chip, the move is announced
  const kchip = host.locator(`#lv-teams-cols .lv-chip[data-seat="${seat}"]`);
  await kchip.focus(); await host.keyboard.press('Enter');
  await expect(kchip).toHaveAttribute('aria-pressed', 'true');
  await expect(host.locator('#lv-teams-cols .lv-team[data-team="3"] [data-lv-move]')).toBeVisible();
  await shot(host, 'assign-keyboard');
  await host.locator('#lv-teams-cols .lv-team[data-team="3"] [data-lv-move]').focus();
  await host.keyboard.press('Enter');
  await expect(host.locator(`#lv-teams-cols .lv-team[data-team="3"] .lv-chip[data-seat="${seat}"]`)).toHaveCount(1);
  await expect.poll(() => host.evaluate(() => document.activeElement && document.activeElement.dataset.seat)).toBe(seat);
  await expect(host.locator('#lv-teams-live')).toContainText('Blue Whales');
  // Escape cancels a selection, not the sheet
  await host.keyboard.press('Enter'); await expect(host.locator(`#lv-teams-cols .lv-chip[data-seat="${seat}"]`)).toHaveAttribute('aria-pressed', 'true');
  await host.keyboard.press('Escape'); await expect(host.locator('#lv-teams-sheet')).toBeVisible();
  await expect(host.locator(`#lv-teams-cols .lv-chip[data-seat="${seat}"]`)).toHaveAttribute('aria-pressed', 'false');
  // Balance evens out; Shuffle keeps sizes within one
  await host.click('[data-lv-tm="balance"]');
  await expect.poll(async () => { const z = await host.locator('#lv-teams-cols .lv-team').evaluateAll(els => els.map(e => e.querySelectorAll('.lv-chip').length)); return Math.max(...z) - Math.min(...z); }).toBeLessThanOrEqual(1);
  await host.click('[data-lv-tm="shuffle"]');
  await expect.poll(async () => { const z = await host.locator('#lv-teams-cols .lv-team').evaluateAll(els => els.map(e => e.querySelectorAll('.lv-chip').length)); return z.join('') && Math.max(...z) - Math.min(...z); }).toBeLessThanOrEqual(1);
  // players choose (a 360px phone): the picker shows; locked teams disable it
  await host.locator('#lv-teams-more > summary').click();
  await host.check('#lv-teams-choose');
  const phone = await player(browser, code, { viewport: { width: 360, height: 740 } });
  await expect(phone.locator('#lv-team-pick')).toBeVisible();
  await expect(phone.locator('#lv-team-pick-list button')).toHaveCount(3);
  const mineK = await phone.locator('#lv-team-pick-list button[aria-pressed="true"]').getAttribute('data-k');
  const other = phone.locator('#lv-team-pick-list button[aria-pressed="false"]:not([disabled])').first();
  const otherK = await other.getAttribute('data-k');
  await other.click();
  await expect(phone.locator(`#lv-team-pick-list button[data-k="${otherK}"]`)).toHaveAttribute('aria-pressed', 'true');
  expect(otherK).not.toBe(mineK);
  await expect(phone.locator('#lv-team-live')).toContainText(/moved|You are in/);
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await shot(phone, 'phone-team-pick-360');
  await host.click('[data-lv-tm="lock"]');
  await expect.poll(() => phone.locator('#lv-team-pick-list button:not([disabled])').count()).toBe(0);
  await expect(phone.locator('#lv-team-pick-list')).toContainText('locked');
  await host.click('#lv-teams-done');
  // dark theme on a second projector look
  await host.emulateMedia({ colorScheme: 'dark' }); await host.waitForTimeout(300); await shot(host, 'lobby-teams-dark'); await host.emulateMedia({ colorScheme: 'light' });
  // start: the room's late join is on for... open rooms lock at start; unlock lets a late joiner in: smallest team
  await act(host, 'start');
  // open rooms lock at the start: "Late join" in the settings lets late joiners in (they go to the smallest team)
  await act(host, 'settings');
  await host.locator('#lv-settings-more, #lv-settings .lv-settings-more > summary').first().click();
  await host.check('#lv-hs-late');
  await host.locator('#lv-settings button[value="save"]').click();
  await expect(host.locator('#lv-joinbox')).not.toHaveClass(/is-locked/);
  const late = await player(browser, code);
  await expect(late.locator('#lv-me-team')).toBeVisible();
  await act(host, 'end');
  for (const p of [...guests, phone, late, host]) await p.context().close();
});

test('team play in Question Battle: the projector team board, Battle\'s team board, team ranks on phones; podium hold; split results, CSV and print', async ({ browser }) => {
  test.setTimeout(240_000);
  const host = await signedIn(browser, TEACHER);
  host.on('dialog', d => d.accept());
  const code = await openRoom(host, { pick: 'mode:battle', items: ITEMS.slice(0, 3), teams: { n: 3, scoring: 'avg' } });
  const ps = [];
  for (let i = 0; i < 4; i++) ps.push(await player(browser, code, i === 3 ? { viewport: { width: 360, height: 740 } } : {}));
  await expect(host.locator('#lv-teams-summary li')).toHaveCount(3);
  const fs = []; for (const p of ps) fs.push(await liveFrame(p));
  const hf = await liveFrame(host);
  await act(host, 'start');
  for (let i = 0; i < 3; i++) {
    const q = await waitQuestion(fs[0], i);
    const right = q.choices.indexOf(solve(q.q));
    // players 0 and 1 right, 2 wrong, 3 wrong on the first two
    for (let k = 0; k < 4; k++) await fs[k].evaluate(c => window.__brbTest.answer(c), k < 2 || (k === 3 && i === 2) ? right : (right + 1) % q.choices.length);
    await waitPhase(fs[0], 'between');
    // team scores arrive before the reveal: the projector's board, the phone's rank
    await expect(host.locator('#lv-team-board li')).toHaveCount(3);
    await expect(host.locator('#lv-teams-n')).toBeHidden();   // the team count is a lobby control: not on the class's screen
    await expect(ps[0].locator('.lv-me-team-rank')).toContainText(/Place \d of \d/);
    if (i === 0) {
      // the host frame: answer bars, then Battle's team board after 2.5 s
      await expect.poll(async () => (await state(hf)).teamBoard, { timeout: 8_000 }).toBe(true);
      // the frame has the presets in its own language (names, never undefined)
      expect((await state(hf)).teams.map(x => x.name).join(',')).toMatch(/^(Blue Whales|Orange Tigers|Green Frogs)(,(Blue Whales|Orange Tigers|Green Frogs)){2}$/);
      await expect(hf.locator('#tboard-list')).not.toContainText('undefined');
      await shot(host, 'projector-team-board');
      await expect(fs[0].locator('#note')).toContainText(/place \d/);
      await shot(ps[3], 'phone-team-rank');
    }
    await act(host, 'next');
  }
  // the end: the projector holds the game's podium (See results now), then results
  await expect(host.locator('#lv-podium-hold')).toBeVisible();
  await expect.poll(async () => (await state(hf)).teamBoard, { timeout: 8_000 }).toBe(true);
  await host.waitForURL(/\/live\/results\//, { timeout: 30_000 });
  await expect(host.locator('#lv-team-podium li').first()).toBeVisible();
  await expect(host.locator('#lv-team-table tbody tr')).toHaveCount(3);
  // one column per number, the one that ranks marked and named in the caption (no duplicate 'Score' column)
  await expect(host.locator('#lv-team-table thead th')).toHaveCount(5);
  await expect(host.locator('#lv-team-table caption')).toHaveText('Ranked by: Average per player');
  await expect(host.locator('#lv-team-table thead th[aria-sort="descending"]')).toHaveText('Average per player');
  await expect(host.locator('#lv-hardest li').first()).toBeVisible();
  await expect(host.locator('#lv-review > li')).toHaveCount(3);
  await expect(host.locator('#lv-review .lv-bar-right').first()).toContainText('Right');
  // the class-safe part has no student names; the details are closed
  await expect(host.locator('#lv-details')).not.toHaveAttribute('open', '');
  await expect(host.locator('#lv-student-table')).toBeHidden();
  await host.waitForTimeout(400);
  await shot(host, 'results-class-safe');
  await host.locator('#lv-details > summary').click();
  await expect(host.locator('#lv-student-table')).toBeVisible();
  await expect(host.locator('#lv-student-table tbody tr')).toHaveCount(4);
  await expect(host.locator('#lv-student-table .lv-mark-right').first()).toBeVisible();
  await shot(host, 'results-details');
  // CSV: team and question columns
  const href = await host.locator('#lv-details a[download]').getAttribute('href');
  const csv = await (await host.request.get(href)).text();
  expect(csv.split('\n')[0]).toMatch(/^rank,student,team,score,bonus,correct,answered,q1,q2,q3\b/);
  expect(csv).toMatch(/Blue Whales|Orange Tigers|Green Frogs/);
  expect(csv).toContain('question,right,answered');
  // print
  await host.emulateMedia({ media: 'print' });
  await expect(host.locator('#lv-results-acts')).toBeHidden();
  await shot(host, 'results-print');
  await host.emulateMedia({ media: 'screen' });
  // a 360px phone in Arabic, dark: the tables scroll inside their own box, the page never scrolls sideways
  const url = host.url();
  const narrow = await signedIn(browser, TEACHER, { viewport: { width: 360, height: 740 }, colorScheme: 'dark', locale: 'ar' });
  await narrow.goto(url);
  await narrow.locator('#lv-details > summary').click();
  const out = await narrow.evaluate(() => {
    const W = document.documentElement.clientWidth;
    return [...document.querySelectorAll('.lv-results *')].filter(e => !e.closest('.lv-table-wrap') || e.classList.contains('lv-table-wrap'))
      .map(e => ({ e: e.tagName + (e.id ? `#${e.id}` : ''), r: e.getBoundingClientRect() })).filter(x => x.r.width && (x.r.right > W + 1 || x.r.left < -1)).map(x => x.e);
  });
  expect(out).toEqual([]);
  // and the page itself (regression: the marks' .sr-only text escaped the scroll box and widened the page)
  expect(await narrow.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  expect(await narrow.locator('#lv-team-table').evaluate(t => t.closest('.lv-table-wrap').scrollWidth >= t.closest('.lv-table-wrap').clientWidth)).toBe(true);
  await shot(narrow, 'results-ar-dark-360');
  await narrow.context().close();
  for (const p of [...ps, host]) await p.context().close();
});

test('the teacher\'s dashboard on a phone: answered status, live bars, needs help behind a toggle, bonus privacy; eyes up, messages in French and Arabic, +10 s and Reveal now', async ({ browser }) => {
  test.setTimeout(240_000);
  const host = await signedIn(browser, TEACHER);
  host.on('dialog', d => d.accept());
  const code = await openRoom(host, { pick: 'mode:battle', items: ITEMS, teams: { n: 2 } });
  const sid = new URL(host.url()).pathname.split('/').pop();
  const a = await player(browser, code), fr = await player(browser, code, { locale: 'fr-FR' }), ar = await player(browser, code, { locale: 'ar', viewport: { width: 360, height: 740 } });
  // the QR dialog
  await act(host, 'dash');
  await expect(host.locator('#lv-dash-qr svg')).toBeVisible();
  await shot(host, 'teacher-view-qr');
  await host.locator('#lv-dash-qr button[type=submit]').click();
  // the dashboard: same teacher, a phone; a student scanning it gets nothing
  const dash = await signedIn(browser, TEACHER, { viewport: { width: 390, height: 844 } });
  dash.on('dialog', d => d.accept());
  await dash.goto(`/live/host/${sid}/dash`);
  await expect(dash.locator('#lv-dash-notice')).toBeVisible();
  await dash.click('#lv-dash-notice-ok');
  await expect(dash.locator('#lv-dash-players .lv-dash-card')).toHaveCount(3);
  const stu = await signedIn(browser, STUDENT);
  const r = await stu.goto(`/live/host/${sid}/dash`); expect(r.status()).toBe(404);
  const [fa, ffr, far] = [await liveFrame(a), await liveFrame(fr), await liveFrame(ar)];
  await liveFrame(host);
  await act(host, 'start');
  // question 1: a answers right, fr wrong, ar waits
  let q = await waitQuestion(fa, 0); let right = q.choices.indexOf(solve(q.q));
  await fa.evaluate(c => window.__brbTest.answer(c), right);
  await ffr.evaluate(c => window.__brbTest.answer(c), (right + 1) % 4);
  await dash.click('#lv-tab-question-btn');
  await expect(dash.locator('#lv-dash-bars li')).toHaveCount(4);
  await expect(dash.locator('#lv-dash-answered')).toContainText('2 answers');
  await expect(dash.locator('#lv-dash-bars .is-right')).toHaveCount(0);           // hidden until tapped
  await dash.click('#lv-dash-answer-toggle');
  await expect(dash.locator('#lv-dash-bars .is-right')).toHaveCount(1);
  await shot(dash, 'dashboard-question');
  await dash.click('#lv-tab-players-btn');
  await expect(dash.locator('.lv-dash-status[data-status="answered"]')).toHaveCount(2);
  await expect(dash.locator('.lv-dash-status[data-status="thinking"]')).toHaveCount(1);
  // eyes up mid-question: covers the phone, the stage inert, the clock stops; off resumes
  const left0 = await fa.evaluate(() => Oomba.live.quiz.left());
  await act(host, 'eyes');
  await expect(ar.locator('#lv-eyes')).toBeVisible();
  await expect(ar.locator('#lv-stage')).toHaveAttribute('inert', '');
  await expect(host.locator('#lv-eyes-banner')).toBeVisible();
  await ar.waitForTimeout(2000);
  await shot(ar, 'eyes-up-phone'); await shot(host, 'eyes-up-projector');
  await act(host, 'eyes');
  await expect(ar.locator('#lv-eyes')).toBeHidden();
  await waitPhase(fa, 'playing');
  const left1 = await fa.evaluate(() => Oomba.live.quiz.left());
  expect(left0 - left1).toBeLessThan(1500);                                          // the 2 s under eyes up didn't count
  // +10 s: the deadline moves; then Reveal now
  await host.locator('[data-lv-time="10"]').click();
  await expect.poll(() => fa.evaluate(() => Oomba.live.quiz.left())).toBeGreaterThan(left1 + 5000);
  await expect(host.locator('#lv-controls [data-lv-act="next"]')).toHaveText('Reveal now');
  await act(host, 'next');
  await waitPhase(fa, 'between');
  // a message in each device's language
  await host.locator('#lv-say > summary').click();
  await host.locator('[data-lv-say="5"]').click();
  await expect(fr.locator('#lv-say-banner')).toBeVisible();
  await expect(ar.locator('#lv-say-banner')).toBeVisible();
  const [tfr, tar] = [await fr.locator('#lv-say-banner').textContent(), await ar.locator('#lv-say-banner').textContent()];
  expect(tfr).not.toBe(tar); expect(tar).toMatch(/[؀-ۿ]/);
  await shot(ar, 'say-banner-ar');
  await act(host, 'next');
  // question 2: fr wrong again -> needs help after two wrong (hidden until the toggle)
  q = await waitQuestion(fa, 1); right = q.choices.indexOf(solve(q.q));
  await fa.evaluate(c => window.__brbTest.answer(c), right);
  await ffr.evaluate(c => window.__brbTest.answer(c), (right + 1) % 4);
  await far.evaluate(c => window.__brbTest.answer(c), right);
  await waitPhase(fa, 'between');
  await expect(dash.locator('.lv-dash-help:not([hidden])')).toHaveCount(0);
  await dash.click('#lv-dash-help-toggle');
  await expect(dash.locator('.lv-dash-help:not([hidden])')).toHaveCount(1);
  await expect(dash.locator('.lv-dash-help:not([hidden])')).toContainText('Two wrong in a row');
  await expect(host.locator('body')).not.toContainText('Two wrong');                 // never on the projector
  // a player's bonus: only that device (and the teacher) hears of it; a team's: everyone
  const frSeat = await ffr.evaluate(() => Oomba.live.me.seat);
  await dash.locator(`.lv-dash-card[data-seat="${frSeat}"] .lv-dash-menu`).click();
  await dash.locator('[data-lv-bonus="1"]').click();
  await expect(fr.locator('#lv-bonus-toast')).toBeVisible();
  await expect(fr.locator('#lv-bonus-toast')).toContainText('+100');
  await a.waitForTimeout(800);
  await expect(a.locator('#lv-bonus-toast')).toBeHidden();
  await expect(host.locator('#lv-bonus-toast')).toBeHidden();
  await shot(dash, 'dashboard-players');
  await dash.waitForTimeout(1100);                                                   // bonus: one a second
  await dash.click('#lv-tab-teams-btn');
  await dash.locator('.lv-dash-tb > summary').first().click();
  await dash.locator('[data-lv-team-bonus^="1:"]').first().click();
  await expect(host.locator('#lv-bonus-toast')).toBeVisible();
  await expect(a.locator('#lv-bonus-toast')).toBeVisible();
  await act(host, 'end');
  for (const p of [a, fr, ar, dash, stu, host]) await p.context().close();
});

test('game settings: 2 questions, accuracy only, leaderboard off; remembered on the landing; back to standard', async ({ browser }) => {
  test.setTimeout(180_000);
  const host = await signedIn(browser, TEACHER);
  host.on('dialog', d => d.accept());
  const code = await openRoom(host, { pick: 'mode:battle', items: ITEMS, teams: { n: 2 } });
  const a = await player(browser, code), b = await player(browser, code);
  await act(host, 'settings');
  await expect(host.locator('#lv-settings')).toBeVisible();
  await host.selectOption('#lv-hs-count', '5');
  await host.selectOption('#lv-hs-points', 'accuracy');
  await host.selectOption('#lv-hs-board', 'off');
  await shot(host, 'settings-dialog');
  await host.locator('#lv-settings button[value="save"]').click();
  const [fa, fb] = [await liveFrame(a), await liveFrame(b)];
  await liveFrame(host);
  await act(host, 'start');
  const q = await waitQuestion(fa, 0); const right = q.choices.indexOf(solve(q.q));
  await fa.evaluate(c => window.__brbTest.answer(c), right);
  await fb.evaluate(c => window.__brbTest.answer(c), (right + 1) % 4);
  await waitPhase(fa, 'between');
  await expect.poll(async () => (await state(fa)).score).toBe(1000);                 // accuracy only: 1000 a right answer
  await expect(fa.locator('#note')).not.toContainText('number');                      // no rank when the board is off
  await expect(a.locator('.lv-me-team-rank')).toHaveText('');
  await act(host, 'end');
  // remembered on the landing
  await host.goto('/live');
  await host.locator('#lv-settings-landing > summary').click();
  await expect(host.locator('#lv-ls-points')).toHaveValue('accuracy');
  await expect(host.locator('#lv-ls-board')).toHaveValue('off');
  await expect(host.locator('#lv-teams-n input[value="2"]')).toBeChecked();
  await shot(host, 'landing-settings');
  await host.click('#lv-prefs-reset');
  await expect(host.locator('#lv-prefs-reset')).toHaveCount(0);                      // reloaded with no remembered settings
  await host.locator('#lv-settings-landing > summary').click();
  await expect(host.locator('#lv-ls-points')).toHaveValue('speed');
  for (const p of [a, b, host]) await p.context().close();
});

test('support kept private, play again with the same players and teams, play the missed questions again', async ({ browser }) => {
  test.setTimeout(240_000);
  const host = await signedIn(browser, TEACHER);
  host.on('dialog', d => d.accept());
  const code = await openRoom(host, { pick: 'mode:battle', items: ITEMS.slice(0, 2), teams: { n: 2 } });
  const sid = new URL(host.url()).pathname.split('/').pop();
  const a = await player(browser, code), b = await player(browser, code), c = await player(browser, code);
  const [fa, fb, fc] = [await liveFrame(a), await liveFrame(b), await liveFrame(c)];
  // support for A (x2) from the dashboard; nothing about it reaches B or any frame
  const dash = await signedIn(browser, TEACHER, { viewport: { width: 390, height: 844 } });
  await dash.goto(`/live/host/${sid}/dash`);
  const seatA = await fa.evaluate(() => Oomba.live.me.seat);
  await dash.locator(`.lv-dash-card[data-seat="${seatA}"] .lv-dash-menu`).click();
  await dash.locator('label.lv-seg-opt', { has: dash.locator('input[name="lv-acc-time"][value="200"]') }).click();
  await dash.click('#lv-acc-apply');
  await expect(dash.locator(`.lv-dash-card[data-seat="${seatA}"] .lv-dash-sup`)).toBeVisible();
  await liveFrame(host);
  await act(host, 'start');
  const qa = await waitQuestion(fa, 0), qb = await waitQuestion(fb, 0);
  const [sa, sb] = [await fa.evaluate(() => Oomba.live.quiz.current.secs), await fb.evaluate(() => Oomba.live.quiz.current.secs)];
  expect(sa).toBe(sb * 2);
  for (const f of [fa, fb, fc]) expect(await f.evaluate(() => JSON.stringify(window.__BRB_INIT__ || {}) + JSON.stringify(Oomba.live.me))).not.toMatch(/"acc"|extraTime|readAloud/);
  void qa; void qb;
  // A right, B and C wrong on both
  for (let i = 0; i < 2; i++) {
    const q = await waitQuestion(fa, i); const right = q.choices.indexOf(solve(q.q));
    await fa.evaluate(k => window.__brbTest.answer(k), right);
    await fb.evaluate(k => window.__brbTest.answer(k), (right + 1) % 4);
    await fc.evaluate(k => window.__brbTest.answer(k), (right + 2) % 4);
    await waitPhase(fa, 'between');
    await act(host, 'next');
  }
  await host.waitForURL(/\/live\/results\//, { timeout: 30_000 });
  await expect(a.locator('#lv-again-wait')).toBeVisible();
  const teamA = await a.locator('.lv-me-team-name').textContent(), nickA = await a.locator('#lv-me-name').textContent();
  // play again: the lingering players move with their nickname and team
  await expect(host.locator('#lv-play-again')).toBeVisible();
  await expect(host.locator('#lv-still')).toContainText('3 players');
  await host.locator('#lv-play-again button[type=submit]').click();
  await host.waitForURL(/\/live\/host\//);
  await a.waitForURL(u => !u.pathname.endsWith(sid), { timeout: 20_000 });
  await expect(a.locator('#lv-me-name')).toHaveText(nickA);
  await expect(a.locator('.lv-me-team-name')).toHaveText(teamA);
  await expect(host.locator('#lv-roster li')).toHaveCount(3);
  await shot(host, 'rematch-lobby');
  await act(host, 'end');
  await host.waitForURL(/\/live\/results\//);
  // the first run's missed questions: both (B and C got them wrong)
  await host.goto(`/live/results/${sid}`);
  await host.locator('form:has(input[name="only"]) button[type=submit]').click();
  await host.waitForURL(/\/live\/host\//);
  const code2 = (await host.locator('#lv-code').textContent()).replace(/\s/g, '');
  const d = await player(browser, code2); const fd = await liveFrame(d); await liveFrame(host);
  await act(host, 'start');
  const q0 = await waitQuestion(fd, 0);
  expect(ITEMS.slice(0, 2).map(x => x.q)).toContain(q0.q);
  expect(await fd.evaluate(() => Oomba.live.quiz.current.n)).toBe(2);
  await act(host, 'end');
  for (const p of [a, b, c, d, dash, host]) await p.context().close();
});

test('class teams: the editor on the class page, "Use last teams" in a class lobby; names hidden on the projector, shown on the dashboard', async ({ browser }) => {
  test.setTimeout(180_000);
  const host = await signedIn(browser, TEACHER);
  host.on('dialog', d => d.accept());
  await host.goto('/live');
  const classId = await host.locator('#lv-class option').first().getAttribute('value');
  await host.goto(`/class/${classId}/progress`);
  await host.click('#lv-class-teams-open');
  await expect(host.locator('#lv-ct-cols .lv-team').first()).toBeVisible();
  await host.selectOption('#lv-ct-n', '3');
  await expect(host.locator('#lv-ct-cols .lv-team')).toHaveCount(3);
  // DemoStudent to team 3 (select then move)
  const chip = host.locator('.lv-class-teams-board .lv-chip', { hasText: /Demo ?Student/ });
  await chip.click();
  await host.locator('#lv-ct-cols .lv-team[data-team="3"] [data-lv-move]').click();
  await expect(host.locator('#lv-ct-cols .lv-team[data-team="3"] .lv-chip', { hasText: /Demo ?Student/ })).toHaveCount(1);
  await shot(host, 'class-teams-editor');
  await host.click('[data-ct="save"]');
  await expect(host.locator('#lv-class-teams-state')).toContainText(/Saved teams/);
  // a class room: names hidden on the projector
  const code = await openRoom(host, { pick: 'mode:battle', items: ITEMS.slice(0, 2), audience: 'class', classId, settings: { names: 'hidden' } });
  const sid = new URL(host.url()).pathname.split('/').pop();
  const s = await player(browser, code, { account: STUDENT });
  await expect(host.locator('#lv-roster li')).toHaveCount(1);
  await expect(host.locator('#lv-roster')).not.toContainText(/Demo ?Student/);
  await host.locator('#lv-teams-n label', { hasText: '2' }).click();
  await host.click('#lv-teams-edit');
  await host.click('[data-lv-tm="last"]');
  await expect(host.locator('#lv-teams-cols .lv-team')).toHaveCount(3);
  await expect(host.locator('#lv-teams-cols .lv-team[data-team="3"] .lv-chip')).toHaveCount(1);
  await host.click('#lv-teams-done');
  await expect(s.locator('#lv-me-team')).toBeVisible();
  await shot(host, 'projector-names-hidden');
  const dash = await signedIn(browser, TEACHER, { viewport: { width: 390, height: 844 } });
  await dash.goto(`/live/host/${sid}/dash`);
  await expect(dash.locator('#lv-dash-players')).toContainText(/Demo ?Student/);
  await act(host, 'end');
  for (const p of [s, dash, host]) await p.context().close();
});

test('Quest Race in team mode (3D and 2D): team rings and bands, team bars on the projector, the team podium; Hero of Sunvale team meters', async ({ browser }) => {
  test.setTimeout(300_000);
  const host = await signedIn(browser, TEACHER);
  host.on('dialog', d => d.accept());
  const code = await openRoom(host, { pick: 'mode:quest-race', items: ITEMS.slice(0, 2), teams: { n: 2 } });
  const a = await player(browser, code), b = await player(browser, code, { init: no3d });
  const fa = await liveFrame(a, s => s.started3d), fb = await liveFrame(b, s => s.view === '2d');
  const hf = await liveFrame(host, s => s.started3d || s.view === '2d');
  await expect.poll(async () => (await state(fa)).myTeam).toBeGreaterThan(0);
  await act(host, 'start');
  for (let i = 0; i < 2; i++) {
    const q = await waitQuestion(fa, i); const right = q.choices.indexOf(solve(q.q));
    await fa.evaluate(k => window.__brbTest.answer(k), right);
    await fb.evaluate(k => window.__brbTest.answer(k), i ? right : (right + 1) % 4);
    await waitPhase(fa, 'between');
    await expect.poll(async () => (await state(hf)).teamBars).toBe(true);
    if (i === 0) { await host.waitForTimeout(2500); await shot(host, 'quest-race-teams'); await shot(b, 'quest-race-teams-2d'); }
    await act(host, 'next');
  }
  const end = await liveFrame(a, s => s.phase === 'ended');
  await expect.poll(async () => (await state(end)).podiumTeams.length).toBeGreaterThan(0);
  await a.waitForTimeout(1500); await shot(a, 'quest-race-team-podium');
  await host.waitForURL(/\/live\/results\//, { timeout: 30_000 });
  // Hero of Sunvale: the projector's team meters
  await host.goto('/g/hero-of-sunvale');
  const gameId = new URL(await host.locator('#hostlive').getAttribute('href'), 'http://x').searchParams.get('game');
  const code2 = await openRoom(host, { pick: `game:${gameId}`, teams: { n: 2 } });
  const h1 = await player(browser, code2, { viewport: { width: 900, height: 700 } }), h2 = await player(browser, code2, { viewport: { width: 900, height: 700 } });
  await liveFrame(h1, s => s && s.ready); await liveFrame(h2, s => s && s.ready);
  const hh = await liveFrame(host, s => s && s.ready);
  await act(host, 'start');
  await expect.poll(() => hh.evaluate(() => document.querySelectorAll('#liveMeter .liveTeam').length), { timeout: 30_000 }).toBe(2);
  await host.waitForTimeout(1500);
  await shot(host, 'hero-team-meters');
  await act(host, 'end');
  for (const p of [a, b, h1, h2, host]) await p.context().close();
});
void seatOf;

test('homework (LIVE_HOMEWORK=1): assign the run\'s question set to the class; the student answers the quiz step; the gradebook has the score', async ({ browser }) => {
  test.skip(process.env.LIVE_HOMEWORK !== '1', 'needs LIVE_HOMEWORK=1 on the test server');
  test.setTimeout(180_000);
  const host = await signedIn(browser, TEACHER);
  host.on('dialog', d => d.accept());
  // a saved set (homework comes from a set, not loose items)
  const origin = new URL(host.url()).origin;
  const mk = await host.request.post('/api/live/sets', { data: { title: 'Sums homework', items: ITEMS.slice(0, 2) }, headers: { Origin: origin } });
  expect(mk.status(), await mk.text()).toBe(200);
  const setId = (await mk.json()).id;
  const code = await openRoom(host, { pick: 'mode:battle', set: `set:${setId}` });
  const p = await player(browser, code); const f = await liveFrame(p); await liveFrame(host);
  await act(host, 'start');
  for (let i = 0; i < 2; i++) { const q = await waitQuestion(f, i); await f.evaluate(k => window.__brbTest.answer(k), q.choices.indexOf(solve(q.q))); await waitPhase(f, 'between'); await act(host, 'next'); }
  await host.waitForURL(/\/live\/results\//, { timeout: 30_000 });
  await host.locator('#lv-homework > summary').click();
  const classId = await host.locator('#lv-hw-class').inputValue();
  let made = null;
  await host.route(/\/api\/live\/sets\/[^/]+\/homework$/, async r => { const res = await r.fetch(); made = await res.json(); await r.fulfill({ response: res }); });
  await host.locator('#lv-homework button[type=submit]').click();
  await expect.poll(() => made && made.classLessonId).toBeTruthy();
  const clId = made.classLessonId;
  await host.waitForURL(/\/class\/[^/]+\/progress/);
  // the student
  const s = await signedIn(browser, STUDENT, { viewport: { width: 390, height: 844 } });
  await s.goto(`/class/${classId}/lessons/${clId}`);
  await s.locator('.lv-qstep-go').click();
  for (let i = 0; i < 2; i++) {
    const qt = await s.locator('.lv-qstep-q').textContent();
    await s.locator('.lv-qstep-a', { hasText: new RegExp(`^\\W*${solve(qt)}$`) }).first().click();
    await expect(s.locator('.lv-qstep-note')).toBeVisible();
    if (i === 0) await shot(s, 'homework-step-phone');
    await s.locator('.lv-qstep button.btn-primary').click();
  }
  await expect(s.locator('.lv-qstep .sc-score')).toContainText('100%');
  for (const x of [p, s, host]) await x.context().close();
});
