// "A first live game in under 3 minutes", walked in real browsers and counted (docs/decisions.md): a teacher who has
// never used Oomba goes from the first page to a room where three guests have answered a question. Used by
// tests/e2e/fast-live.spec.js (which asserts the upper bounds) and scripts/fast-live-timing.js (which prints the numbers).
//
// A step is one thing a person does: a tap on a button or link, a box ticked, or a box typed into. Opening the first
// page (and a student opening /join) is not a step.
const randomIp = () => `10.${1 + Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;

/**
 * browser: a Playwright browser. base: the site's origin. opts: { start: '/' | '/teachers', name, username, password,
 * typeDelay: ms per key (0 = instant; about 150 is a person typing), guests: how many students }.
 * -> { teacher: [step names], student: [step names of one student], marks: { signupPage, account, room, joined,
 *      answered } (ms since the first page was asked for), code, host (the host's page), players, resultsUrl() }
 */
export async function firstLiveGame(browser, base, { start = '/', name = 'Ms Rivera', username, password = 'sunny-meadow-42', typeDelay = 0, guests = 3, viewport = { width: 1280, height: 800 } } = {}) {
  const teacher = [], student = [], marks = {};
  const ctx = await browser.newContext({ viewport, baseURL: base, extraHTTPHeaders: { 'X-Forwarded-For': randomIp() } });
  const host = await ctx.newPage();
  const t0 = Date.now();
  const mark = k => { marks[k] = Date.now() - t0; };
  const type = async (sel, text, label) => { await host.locator(sel).pressSequentially(text, { delay: typeDelay }); teacher.push(`type: ${label}`); };

  await host.goto(start);
  const cta = host.locator('#lp-host-now, #host-now').first();
  await Promise.all([host.waitForURL(/\/teachers\/host/), cta.click()]); teacher.push('tap: Host a live game now');
  await host.locator('#ql-signup').waitFor();
  mark('signupPage');
  await type('#ql-name', name, 'your name');
  await type('#ql-username', username, 'username');
  await type('#ql-password', password, 'password');
  await host.locator('#ql-adult').check(); teacher.push('tick: I am a teacher, 18 or older');
  await Promise.all([host.waitForURL(/\/live\/quick/), host.locator('#ql-signup button[type=submit]').click()]); teacher.push('tap: Make my account and pick a game');
  await host.locator('#ql-quick').waitFor();
  mark('account');
  // The chooser opens with a game, a level and a subject already picked: one tap opens the room.
  await Promise.all([host.waitForURL(/\/live\/host\//), host.locator('#ql-go').click()]); teacher.push('tap: Open the room');
  await host.locator('#lv-code').waitFor();
  const code = (await host.locator('#lv-code').textContent()).replace(/\s/g, '');
  mark('room');

  // Students: no account. The code (or the QR, which fills it in), then "Join".
  const join = async (first) => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: base, extraHTTPHeaders: { 'X-Forwarded-For': randomIp() } });
    const p = await c.newPage();
    await p.goto('/join');
    await p.locator('#jc').pressSequentially(code, { delay: typeDelay }); if (first) student.push('type: the 7-digit code');
    await p.locator('#lv-join button[type=submit]').click(); if (first) student.push('tap: Join');
    await p.locator('#lv-go').waitFor();
    await p.locator('#lv-go').click(); if (first) student.push('tap: Let\'s go (the made-up name is on the card)');
    await p.waitForURL(/\/live\/play\//);
    return p;
  };
  const players = await Promise.all(Array.from({ length: guests }, (_, i) => join(i === 0)));
  const frameOf = async p => {
    for (let i = 0; i < 300; i++) {
      const f = p.frames().find(x => /\/live\/frame\//.test(x.url()));
      if (f) { try { if (await f.evaluate(() => !!(window.__brbTest && window.__brbTest.state && window.__brbTest.state() && window.__brbTest.state().game))) return f; } catch { /* still loading */ } }
      await p.waitForTimeout(150);
    }
    throw new Error('the live game frame never came up');
  };
  const frames = await Promise.all(players.map(frameOf));
  await frameOf(host);
  mark('joined');
  await host.locator('[data-lv-act="start"]:not([hidden])').click(); teacher.push('tap: Start');
  for (const f of frames) {
    await f.locator('.qb-a').first().waitFor({ timeout: 30_000 });
    await f.locator('.qb-a').first().click();
  }
  student.push('tap: an answer');
  mark('answered');
  return { teacher, student, marks, code, host, players, frames, ctx };
}
