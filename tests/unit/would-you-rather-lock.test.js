// Would You Rather (seed-games/would-you-rather.html): a course step locks the game to one topic with the module params
// topic=<id>&lock=1 (the play page passes topic on as BRB.params.chapter). Locked, the game opens on that topic with no
// topic picker and no way to switch: Play alone starts a run at once, the friends setup shows the one topic only, and
// Play again keeps it. Cyber Defenders uses topic=online, Number Quest 7.3 topic=numbers. Unlocked, nothing changes.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/would-you-rather.html'), 'utf8');
const { parseParams } = await import('../../server/services/play-params.js');
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = process.env.BRB_CHROMIUM || LOCAL.find(f => fs.existsSync(f));
const skip = !exe && !process.env.PLAYWRIGHT_BROWSERS_PATH ? 'no Chromium on this machine' : false;
const HOST = 'http://game.invalid';
let browser;
test.after(async () => { if (browser) await browser.close(); });

test('would-you-rather: every topic id a course may lock to is a topic of the game, and topic= reaches the game as its chapter', () => {
  const cats = /cats: \[([^\]]*)\]/.exec(HTML)[1].match(/'([a-z]+)'/g).map(s => s.slice(1, -1));
  for (const id of ['online', 'numbers', 'tech']) assert.ok(cats.includes(id), `${id} is a pickable topic`);
  assert.deepEqual(parseParams('topic=online&lock=1'), { chapter: 'online', lock: 1 });
  assert.deepEqual(parseParams('topic=numbers&lock=1'), { chapter: 'numbers', lock: 1 });
});

async function open(params) {
  const { frameDocument, frameCsp, SANDBOX } = await import('../../server/services/frame.js');
  if (!browser) { const { chromium } = await import('playwright-core'); browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] }); }
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  // BRB.params as the play page builds it (the same frozen object; set right after the SDK, before the game reads it)
  const src = params ? HTML.replace('<title>Would You Rather?</title>', `<script>BRB.params = Object.freeze(${JSON.stringify(parseParams(params))});</script><title>Would You Rather?</title>`) : HTML;
  const doc = frameDocument(src, { user: { displayName: 'P', avatar: 'x', lang: 'en', dir: 'ltr' }, game: { id: 'g', title: 'Would You Rather?' }, save: {}, canSave: false, preview: true, deviceText: { title: 'x', text: 'y' } });
  const host = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%;display:block}</style><iframe sandbox="${SANDBOX}" src="${HOST}/frame"></iframe>`;
  const errors = [];
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u === HOST + '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: host });
    if (u === HOST + '/frame') return route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': frameCsp(HOST) }, body: doc });
    const m = /^http:\/\/game\.invalid\/(vendor\/(?:oomba-kit|data)\/[\w./-]+)$/.exec(u);
    if (m && fs.existsSync(path.join(ROOT, 'public', m[1]))) return route.fulfill({ status: 200, headers: { 'content-type': m[1].endsWith('.js') ? 'text/javascript' : 'font/woff2', 'access-control-allow-origin': '*' }, body: fs.readFileSync(path.join(ROOT, 'public', m[1])) });
    return route.abort();
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(String(e.message)));
  await page.goto(HOST + '/', { waitUntil: 'load' });
  let frame = null;
  for (let i = 0; i < 200 && !frame; i++) { frame = page.frames().find(f => f.url() === HOST + '/frame'); if (!frame) await page.waitForTimeout(25); }
  await frame.waitForFunction(() => window.__brbTest && window.__brbTest.state, null, { timeout: 60_000 });
  return { ctx, page, frame, errors };
}
const S = frame => frame.evaluate(() => window.__brbTest.state());

test('would-you-rather: topic=<id>&lock=1 starts straight on that topic, no picker, no switching; unlocked keeps the picker', { skip, timeout: 120_000 }, async () => {
  for (const [topic, name] of [['online', 'Online: share or keep'], ['numbers', 'Numbers']]) {
    const { ctx, page, frame, errors } = await open(`topic=${topic}&lock=1`);
    try {
      let s = await S(frame); assert.equal(s.locked, topic); assert.deepEqual(s.topics, [topic]); assert.equal(s.screen, 'home');
      assert.match(await frame.evaluate(() => document.getElementById('lockTopic').textContent), new RegExp(name), 'the home card names the topic');
      await frame.click('#play'); await page.waitForTimeout(300);
      s = await S(frame); assert.equal(s.screen, 'playScreen', 'Play alone starts a run at once'); assert.ok(s.cur.startsWith(topic + '-'), `${s.cur} is a ${topic} question`);
      for (let i = 0; i < 9; i++) { await frame.evaluate(() => window.__brbTest.pick('a')); await frame.evaluate(() => window.__brbTest.next()); }
      s = await S(frame); assert.equal(s.picks, 9);
      // the friends setup: one topic chip, pressed, that does nothing when tapped
      await frame.evaluate(() => window.__brbTest.home()); await frame.click('.mode.m-friends'); await page.waitForTimeout(200);
      const chips = await frame.evaluate(() => [...document.querySelectorAll('#topics .chip')].map(c => [c.dataset.cat, c.getAttribute('aria-pressed')]));
      assert.deepEqual(chips, [[topic, 'true']]);
      await frame.evaluate(() => document.querySelector('#topics .chip').click()); assert.deepEqual((await S(frame)).topics, [topic], 'tapping the chip changes nothing');
      await frame.evaluate(() => window.__brbTest.start('alone', { topics: ['animals'] }));
      s = await S(frame); assert.deepEqual(s.topics, [topic], 'nothing switches the topic while locked'); assert.ok(s.cur.startsWith(topic + '-'));
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  }
  const { ctx, page, frame } = await open(null);
  try {
    const s = await S(frame); assert.equal(s.locked, null);
    assert.equal(await frame.evaluate(() => document.getElementById('lockTopic').hidden), true);
    await frame.click('#play'); await page.waitForTimeout(200);
    assert.equal((await S(frame)).screen, 'setup', 'unlocked: the topic picker as before');
    const n = await frame.evaluate(() => document.querySelectorAll('#topics .chip').length); assert.equal(n, 15, 'mix and 14 topics, numbers included');
  } finally { await ctx.close(); }
});
