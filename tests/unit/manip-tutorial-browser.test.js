// The Manipulatives page's "How it works" videos and layout at 1280x720 (25 Nov 2026, found recording the number line
// tutorial): a tool with a video (manip-data.js TUTORIALS) shows the button by its title and on its "All tools" card,
// which opens the video in the site's sheet (poster, captions on, Escape closes it and gives the focus back); a tool
// without one shows no button. The number line switched to Jumps grows taller and the view follows it (never under the
// zoom pill), the hint follows the switch, and Oomba's chat button stays off the board. Skipped without Chromium.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { createApp } = await import('../../server/app.js');
const { createUser, startSession } = await import('../../server/auth.js');
const { TUTORIALS } = await import('../../public/js/manip-data.js');

const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
let chromium = null; try { ({ chromium } = await import('playwright-core')); } catch { /* not installed */ }
const skip = !chromium || (!exe && !process.env.PLAYWRIGHT_BROWSERS_PATH) ? 'needs Chromium' : false;

const boss = createUser({ username: 'TutorialBoss', password: 'secret123', role: 'admin' });
const cookieOf = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
let server, BASE, browser;
test.before(async () => {
  if (skip) return;
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] });
});
test.after(async () => { if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });
const pageOf = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const [name, value] = cookieOf(boss.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  return { ctx, page, errors };
};

test('every tool with a video has its three files', () => {
  for (const slug of TUTORIALS) for (const f of [`manip-${slug}.mp4`, `manip-${slug}-poster.jpg`, `manip-${slug}.en.vtt`]) {
    assert.ok(fs.existsSync(new URL(`../../public/video/manip/${f}`, import.meta.url)), `${f} is in public/video/manip`);
  }
});

test('How it works: the button opens the video with captions, Escape closes it; no button without a video', { skip }, async () => {
  const { ctx, page, errors } = await pageOf();
  await page.goto(`${BASE}/manipulatives#number-lines`);
  await page.waitForSelector('#mp-content svg.mp-nl');
  const how = page.locator('.mp-head .mp-howbtn');
  assert.equal(await how.count(), 1);
  assert.match(await how.textContent(), /How it works/);
  await how.click();
  await page.waitForSelector('.sheet.mp-vsheet video');
  const v = await page.$eval('.sheet.mp-vsheet video', el => ({ src: el.querySelector('source').getAttribute('src'), poster: el.getAttribute('poster'), inline: el.hasAttribute('playsinline'), controls: el.controls, track: el.querySelector('track') && { src: el.querySelector('track').getAttribute('src'), kind: el.querySelector('track').kind, def: el.querySelector('track').default } }));
  assert.match(v.src, /manip-number-lines\.mp4$/);
  assert.match(v.poster, /manip-number-lines-poster\.jpg$/);
  assert.ok(v.inline && v.controls);
  assert.deepEqual(v.track, { src: '/video/manip/manip-number-lines.en.vtt', kind: 'captions', def: true });
  assert.equal(await page.getAttribute('.sheet.mp-vsheet', 'role'), 'dialog');
  assert.match(await page.textContent('.sheet.mp-vsheet h2'), /Number Lines: how it works/);
  // The files are served.
  for (const u of [v.src, v.poster, v.track.src]) assert.equal((await page.request.get(`${BASE}${u}`)).status(), 200, u);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.sheet-bg').count(), 0, 'Escape closed it');
  assert.ok(await how.evaluate(el => el === document.activeElement), 'the focus went back to the button');
  // A tool without a video: no button.
  await page.goto(`${BASE}/manipulatives#clock`);
  await page.waitForSelector('#mp-content .mp-obj');
  assert.equal(await page.locator('.mp-howbtn').count(), 0);
  // The All tools cards: only the ones with a video, and the button opens it without following the card's link.
  await page.goto(`${BASE}/manipulatives`);
  await page.waitForSelector('.mp-toolcard');
  assert.equal(await page.locator('.mp-toolcell .mp-howbtn').count(), TUTORIALS.size);
  await page.click('.mp-toolcell .mp-howbtn[data-how="number-lines"]');
  await page.waitForSelector('.sheet.mp-vsheet video');
  assert.equal(new URL(page.url()).hash, '', 'still on All tools');
  await page.click('.sheet .close');
  assert.equal(await page.locator('.sheet-bg').count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('at 1280x720: Jumps keeps the number line in view and off the zoom pill, the hint follows the switch, the chat button is off the board', { skip }, async () => {
  const { ctx, page, errors } = await pageOf();
  await page.goto(`${BASE}/manipulatives#number-lines`);
  await page.waitForSelector('#mp-content svg.mp-nl');
  assert.match(await page.textContent('.mp-hint'), /^Points: tap the line/);
  await page.click('#mp-content [data-act="nlmode"][data-m="jumps"]');
  await page.waitForTimeout(100);
  assert.match(await page.textContent('.mp-hint'), /^Jumps: tap where to start/);
  const g = await page.evaluate(() => {
    const r = s => document.querySelector(s).getBoundingClientRect();
    return { board: r('#mp-board'), obj: r('#mp-content .mp-obj'), pill: r('#mp-zoom'), bubble: document.querySelector('.oc-bubble') && r('.oc-bubble') };
  });
  assert.ok(g.obj.bottom <= g.board.bottom && g.obj.right <= g.board.right && g.obj.top >= g.board.top, 'the taller line is all on the board');
  assert.ok(g.obj.bottom <= g.pill.top, 'and above the zoom pill');
  if (g.bubble) assert.ok(g.bubble.left >= g.board.right, 'the chat button is right of the board');
  // Fit leaves the pill's strip clear too.
  await page.click('[data-view="fit"]');
  const f = await page.evaluate(() => ({ obj: document.querySelector('#mp-content .mp-obj').getBoundingClientRect().bottom, pill: document.getElementById('mp-zoom').getBoundingClientRect().top }));
  assert.ok(f.obj <= f.pill);
  assert.deepEqual(errors, []);
  await ctx.close();
});
