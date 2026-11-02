// Gulp City (seed-games/gulp-city.html): the official black-hole city game, a 3D world of its own (Three.js, no Oomba
// Kit), in real Chromium inside the production frame wrapper. A small hole grows by swallowing small things, cannot
// swallow big ones until it has grown, a bigger rival swallows the player (who starts again, smaller), the player
// swallows smaller rivals, the round ends when the clock runs out, free roam has no clock, it draws a sensible amount,
// and the words follow the player's language (Arabic right to left).
// Needs a local Chromium; skipped when there is none. Most checks run the game with __brbTest.sim (no drawing, fast).
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = process.env.BRB_CHROMIUM || LOCAL.find(f => fs.existsSync(f));
const skip = !exe && !process.env.PLAYWRIGHT_BROWSERS_PATH ? 'no Chromium on this machine' : false;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { frameDocument, frameCsp, SANDBOX } = await import('../../server/services/frame.js');
const { scanVersion } = await import('../../server/services/scanner.js');
const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/gulp-city.html'), 'utf8');
const HOST = 'http://game.invalid';

let browser;
test.after(async () => { if (browser) await browser.close(); });
async function open({ size = { width: 844, height: 390 }, lang = 'en' } = {}) {
  if (!browser) { const { chromium } = await import('playwright-core'); browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] }); }
  const ctx = await browser.newContext({ viewport: size });
  const doc = frameDocument(HTML, { user: { displayName: 'P', avatar: 'x', lang, dir: lang === 'ar' ? 'rtl' : 'ltr' }, game: { id: 'g', title: 'Gulp City' }, save: {}, canSave: false, preview: true, deviceText: { title: 'x', text: 'y' } });
  const host = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%;display:block}</style><iframe sandbox="${SANDBOX}" src="${HOST}/frame"></iframe>`;
  const errors = [], kit = [];
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u === HOST + '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: host });
    if (u === HOST + '/frame') return route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': frameCsp(HOST) }, body: doc });
    const m = /^http:\/\/game\.invalid\/vendor\/three\/([\d.]+)\/([\w.]+)$/.exec(u);
    if (m) return route.fulfill({ status: 200, headers: { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' }, body: fs.readFileSync(path.join(ROOT, 'public/vendor/three', m[1], m[2])) });
    if (u.includes('/oomba-kit/')) kit.push(u);
    return route.abort();
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(String(e.message)));
  await page.goto(HOST + '/', { waitUntil: 'load' });
  let frame = null;
  for (let i = 0; i < 80 && !frame; i++) { frame = page.frames().find(f => f.url() === HOST + '/frame'); if (!frame) await page.waitForTimeout(100); }
  await frame.waitForFunction(() => window.__brbTest && window.__brbTest.state().ready, null, { timeout: 60_000 });
  return { ctx, page, frame, errors, kit };
}
const T = (frame, fn, ...a) => frame.evaluate(([f, a]) => window.__brbTest[f](...a), [fn, a]);

test('gulp-city: passes the safety scan as a 3D game of its own (pinned Three.js, no Oomba Kit)', () => {
  assert.equal(scanVersion(HTML).status, 'pass');
  assert.match(HTML, /"three": "\/vendor\/three\/0\.185\.1\/three\.module\.min\.js"/);
  assert.doesNotMatch(HTML, /oomba-kit|Oomba\.three/);
  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-games/gulp-city.json'), 'utf8'));
  assert.equal(meta.slug, 'gulp-city');
  for (const l of ['pt', 'fr', 'es', 'de', 'he', 'ja', 'ar', 'ru', 'it', 'zh-Hant', 'nl']) assert.ok(meta.l10n[l] && meta.l10n[l].description, `description in ${l}`);
});

test('gulp-city: every language has every word', () => {
  const block = HTML.slice(HTML.indexOf('const I18N = {'), HTML.indexOf('const LANG ='));
  const I18N = new Function(block + 'return I18N;')();   // test-only: the game's own word table
  const keys = Object.keys(I18N.en);
  for (const [l, words] of Object.entries(I18N)) {
    if (l === 'en-GB') continue;
    for (const k of keys) assert.ok(typeof words[k] === 'string' && words[k].length, `${l} is missing ${k}`);
    for (const k of keys) { const ph = s => (s.match(/\{\w+\}/g) || []).sort().join(); assert.equal(ph(words[k]), ph(I18N.en[k]), `${l}.${k} keeps its placeholders`); }
  }
});

test('gulp-city: a hole grows by swallowing what fits, big things wait, rivals swallow and get swallowed, the clock ends the round', { skip, timeout: 240_000 }, async () => {
  const { ctx, page, frame, errors, kit } = await open();
  try {
    let s = await T(frame, 'state');
    assert.equal(s.screen, 'title');
    assert.ok(s.objects > 20000, `a big city (${s.objects} things)`);
    assert.ok(s.movers > 100, 'traffic drives round the city');

    await T(frame, 'start', { mode: 'round', seed: 11 });
    await T(frame, 'freezeRivals', true); await T(frame, 'setGrace', 999);
    s = await T(frame, 'state');
    assert.equal(s.screen, 'play'); assert.equal(s.rT, 0.8); assert.ok(s.left > 148, 'a round of two and a half minutes');
    assert.deepEqual(kit, [], 'loads nothing from the Oomba Kit');

    // small things fit: hydrants, cones, lamp posts... each one swallowed grows the hole
    const r0 = s.rT;
    for (let k = 0; k < 8; k++) {
      const n = await T(frame, 'nearest', { maxS: 0.5 });
      await T(frame, 'teleport', n.x, n.z); await T(frame, 'sim', 1.2);
      assert.equal((await T(frame, 'objectState', n.i)).st, 2, `the ${n.type} was swallowed`);
    }
    s = await T(frame, 'state');
    assert.ok(s.eaten >= 8 && s.rT > r0, `grew from ${r0} to ${s.rT} after ${s.eaten} things`);
    assert.ok(s.points > 0);

    // a bus does not fit a small hole: it stays on the street
    const bus = await T(frame, 'nearest', { type: 'bus' });
    await T(frame, 'teleport', bus.x, bus.z); await T(frame, 'sim', 1.5);
    assert.equal((await T(frame, 'objectState', bus.i)).st, 0, 'too big for now');
    // ... until the hole has grown
    await T(frame, 'setSize', 8); await T(frame, 'teleport', bus.x, bus.z); await T(frame, 'sim', 2);
    assert.equal((await T(frame, 'objectState', bus.i)).st, 2, 'swallowed once the hole is big enough');
    s = await T(frame, 'state');
    assert.ok(s.unlocked >= 4, 'the size groups up to buses are unlocked');

    // the player swallows a smaller rival
    const before = s.points;
    const small = await T(frame, 'rival', 2, { x: s.x + 1, z: s.z, r: 1.5, freeze: true });
    await T(frame, 'sim', 1.5);
    s = await T(frame, 'state');
    assert.equal(s.holes.find(h => h.name === small.name).alive, false, 'the smaller rival is gone');
    assert.ok(s.points > before, 'swallowing a rival scores');

    // a much bigger rival swallows the player, who starts again smaller
    await T(frame, 'setSize', 3); await T(frame, 'setGrace', 0); await T(frame, 'sim', 3.5);
    s = await T(frame, 'state');
    await T(frame, 'rival', 1, { x: s.x + 0.5, z: s.z, r: 9, freeze: true });
    await T(frame, 'sim', 1.5);
    s = await T(frame, 'state');
    assert.equal(s.screen, 'gulp'); assert.equal(s.alive, false);
    await T(frame, 'keepGoing');
    s = await T(frame, 'state');
    assert.equal(s.screen, 'play'); assert.equal(s.alive, true);
    assert.ok(s.rT < 3 && s.rT >= 0.8, `starts again a little smaller (${s.rT})`);

    // the round ends when the clock runs out, with a rank
    await T(frame, 'setTimeLeft', 1); await T(frame, 'sim', 2);
    s = await T(frame, 'state');
    assert.equal(s.screen, 'end');
    assert.ok(await frame.evaluate(() => !document.getElementById('endScreen').hidden && /#|1/.test(document.getElementById('endRank').textContent)));

    // free roam has no clock
    await T(frame, 'start', { mode: 'free', seed: 12 }); await T(frame, 'freezeRivals', true);
    assert.equal(await frame.evaluate(() => document.getElementById('clock').hidden), true);
    s = await T(frame, 'sim', 160);
    assert.equal(s.screen, 'play', 'still playing after the round time');

    // it draws a sensible amount at the start of a round (a tablet can keep up)
    await T(frame, 'start', { mode: 'round', seed: 3 }); await page.waitForTimeout(1500);
    s = await T(frame, 'state');
    assert.ok(s.drawCalls > 10 && s.drawCalls < 400, `draw calls ${s.drawCalls}`);
    assert.ok(s.triangles < 600_000, `triangles ${s.triangles}`);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('gulp-city: the rivals grow through a round on their own, and the autopilot (a fair player) keeps up on easy', { skip, timeout: 120_000 }, async () => {
  const { ctx, frame, errors } = await open();
  try {
    await T(frame, 'start', { mode: 'round', seed: 1, difficulty: 'easy' }); await T(frame, 'autopilot', true);
    const s = await T(frame, 'sim', 149);
    assert.ok(s.holes.filter(h => !h.player && h.alive).some(h => h.r > 4), 'rivals grow');
    assert.ok(s.rT > 8, `the player grows big over a round (${s.rT})`);
    assert.ok(s.rank <= 3, `a fair player places well on easy (rank ${s.rank})`);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('gulp-city: Arabic reads right to left with its own words', { skip, timeout: 60_000 }, async () => {
  const { ctx, frame, errors } = await open({ lang: 'ar', size: { width: 820, height: 1180 } });
  try {
    const r = await frame.evaluate(() => ({ dir: document.documentElement.dir, tag: document.getElementById('tagText').textContent, play: document.getElementById('playBtn').textContent }));
    assert.equal(r.dir, 'rtl');
    assert.match(r.tag, /ثقب أسود/);
    assert.match(r.play, /العب/);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});
