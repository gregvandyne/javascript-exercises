// Would You Rather and Would You Rather Live in Crossword's look (docs/decisions.md "Would You Rather in Crossword's
// look"): the classroom dashboard's widgets on the dotted mint board, the dark Now bar, Bricolage Grotesque, light and
// dark from the site's theme. The solo game is a plain page (no kit, BRB.sfx, BRB.theme, BRB.motion); the live game
// keeps the kit's live pack for the session and changes only how it looks. Every behavior stays: modes, the poll, no
// score, BRB.gameOver once at the end card, the live protocol (one vote per dilemma, never a name), tap targets.
// The browser parts run both pages in real Chromium inside the production frame wrapper (frameDocument, the frame CSP,
// the sandbox); the live one talks to a fake session over the frame's MessagePort. Skipped without a local Chromium.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOLO = fs.readFileSync(path.join(ROOT, 'seed-games/would-you-rather.html'), 'utf8');
const LIVE = fs.readFileSync(path.join(ROOT, 'seed-games/would-you-rather-live.html'), 'utf8');
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = process.env.BRB_CHROMIUM || LOCAL.find(f => fs.existsSync(f));
const skip = !exe && !process.env.PLAYWRIGHT_BROWSERS_PATH ? 'no Chromium on this machine' : false;
const HOST = 'http://game.invalid';
let browser;
test.after(async () => { if (browser) await browser.close(); });

test('would-you-rather look: the dashboard tokens, the font and the dotted board on both pages; the solo game has no kit, the live one keeps its pinned live pack', async () => {
  for (const [name, html] of [['solo', SOLO], ['live', LIVE]]) {
    assert.match(html, /fonts\.googleapis\.com\/css2\?family=Bricolage\+Grotesque/, `${name}: Bricolage Grotesque`);
    assert.match(html, /--paper: #E1F1E1; --dots: #66C792; --card: #FFFDF2;/, `${name}: the dashboard's light tokens`);
    assert.match(html, /--paper: #141414; --dots: #2E5A41; --card: #1E1E1B;/, `${name}: and its dark ones`);
    assert.match(html, /radial-gradient\(var\(--dots\) 1\.5px, transparent 1\.6px\)/, `${name}: the dotted board`);
    assert.doesNotMatch(html, /\bconfirm\(|\balert\(/, `${name}: no browser dialogs`);
  }
  // solo: no kit tag, no stage, the SDK's own theme, motion and sound; the generated data block still where the build puts it
  assert.doesNotMatch(SOLO, /oomba-kit\/|Oomba\./);
  assert.match(SOLO, /B\.theme === 'light' \|\| B\.theme === 'dark'/); assert.match(SOLO, /B\.motion === 'reduce'/); assert.match(SOLO, /B\.sfx\.play\(/);
  assert.match(SOLO, /\/\* wyr-data:begin \*\/[\s\S]*"sound":"Sound on or off"[\s\S]*\/\* wyr-data:end \*\//);
  // the end card's one completion, no score
  assert.equal((SOLO.match(/BRB\.gameOver\(\{/g) || []).length - (SOLO.match(/signals BRB\.gameOver\(\{/g) || []).length, 1); assert.match(SOLO, /BRB\.gameOver\(\{ won: true \}\); \}/);
  // live: the kit and its live pack, pinned exactly as the manifest says
  const { KIT_PACKS, KIT_LATEST } = await import('../../server/services/kit.js');
  const m = LIVE.match(/\/vendor\/oomba-kit\/([\d.]+)\/packs\/live\.js" integrity="([^"]+)"/);
  assert.ok(m, 'the live pack is loaded'); assert.equal(m[1], KIT_LATEST); assert.equal(m[2], KIT_PACKS[KIT_LATEST].live);
  assert.match(LIVE, /L\.ready\(\{ quiz: true, hostView: true, words: \[\] \}\)/);
  assert.match(LIVE, /\/\* wyr-live:begin \*\/[\s\S]*\/\* wyr-live:end \*\//);
});

const FONT_CSS = "@font-face{font-family:'Bricolage Grotesque';font-weight:200 800;src:url(https://fonts.gstatic.com/x/bricolage-latin.woff2) format('woff2');}";
/** A page in the frame wrapper, with a parent that answers polls, records the game's messages and holds the live port. */
async function open(html, { viewport = { width: 1280, height: 800 }, theme, motion, live, mobile, poll } = {}) {
  const { frameDocument, frameCsp, SANDBOX } = await import('../../server/services/frame.js');
  if (!browser) { const { chromium } = await import('playwright-core'); browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] }); }
  const init = { user: { displayName: 'P', avatar: 'x', lang: 'en', dir: 'ltr' }, game: { id: 'g', title: 'W' }, save: {}, canSave: false, preview: true,
    deviceText: { title: 'x', text: 'y' }, ...(theme ? { theme } : {}), ...(motion ? { motion } : {}), ...(live ? { live } : {}) };
  const doc = frameDocument(html, init);
  const parent = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%;display:block}</style><iframe id=f sandbox="${SANDBOX}" src="${HOST}/frame"></iframe><script>
    window.__P = { msgs: [], types: [], polls: [] };
    addEventListener('message', function (e) {
      var f = document.getElementById('f'), d = e.data;
      if (e.source !== f.contentWindow || !d) return;
      __P.types.push(d.type);
      if (d.type === 'brb:poll') { __P.polls.push(d); f.contentWindow.postMessage(Object.assign({ brb: 1, type: 'brb:pollResult', n: d.n }, ${JSON.stringify(poll || { off: true })}), '*'); }
      if (d.type === 'brb:ready' && e.ports && e.ports[0] && !__P.port) { __P.port = e.ports[0]; __P.port.onmessage = function (ev) { __P.msgs.push(ev.data); }; __P.port.postMessage({ t: 'clk', s: performance.now() }); }
    });
    window.send = function (m) { __P.port.postMessage(m); };
  </script>`;
  const ctx = await browser.newContext({ viewport, hasTouch: !!mobile, isMobile: !!mobile });
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u === HOST + '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: parent });
    if (u === HOST + '/frame') return route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': frameCsp(HOST) }, body: doc });
    if (u.startsWith('https://fonts.googleapis.com/')) return route.fulfill({ status: 200, headers: { 'content-type': 'text/css', 'access-control-allow-origin': '*' }, body: FONT_CSS });
    if (u === 'https://fonts.gstatic.com/x/bricolage-latin.woff2') return route.fulfill({ status: 200, headers: { 'content-type': 'font/woff2', 'access-control-allow-origin': '*' }, body: fs.readFileSync(path.join(ROOT, 'public/vendor/oomba-classroom/1.0.0/fonts/bricolage-latin.woff2')) });
    const m = /^http:\/\/game\.invalid\/(vendor\/(?:oomba-kit|data)\/[\w./-]+)$/.exec(u);
    if (m && fs.existsSync(path.join(ROOT, 'public', m[1]))) return route.fulfill({ status: 200, headers: { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' }, body: fs.readFileSync(path.join(ROOT, 'public', m[1])) });
    return route.abort();
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message)));
  await page.goto(HOST + '/', { waitUntil: 'load' });
  let frame = null;
  for (let i = 0; i < 200 && !frame; i++) { frame = page.frames().find(f => f.url() === HOST + '/frame'); if (!frame) await page.waitForTimeout(25); }
  await frame.waitForFunction(() => window.__brbTest && window.__brbTest.state, null, { timeout: 60_000 });
  return { ctx, page, frame, errors, send: msg => page.evaluate(x => window.send(x), msg), P: () => page.evaluate(() => ({ msgs: __P.msgs, types: __P.types, polls: __P.polls })) };
}
const S = frame => frame.evaluate(() => window.__brbTest.state());
const style = (frame, sel, props) => frame.evaluate(([s, p]) => { const e = document.querySelector(s), c = getComputedStyle(e); return Object.fromEntries(p.map(k => [k, c.getPropertyValue(k)])); }, [sel, props]);
const box = (frame, sel) => frame.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { w: r.width, h: r.height }; }, sel);

test('would-you-rather look (solo): the board, the widgets and the Now bar; a run plays to the end card with the poll and one gameOver', { skip, timeout: 120_000 }, async () => {
  const { ctx, page, frame, errors, P } = await open(SOLO, { theme: 'light', poll: { a: 7, b: 3, total: 10, min: 5 } });
  try {
    assert.equal(await frame.evaluate(() => document.documentElement.dataset.theme), 'light');
    const body = await style(frame, 'body', ['background-color', 'background-image', 'font-family']);
    assert.equal(body['background-color'], 'rgb(225, 241, 225)'); assert.match(body['background-image'], /radial-gradient/); assert.match(body['font-family'], /Bricolage Grotesque/);
    assert.match((await style(frame, '#home .card', ['box-shadow']))['box-shadow'], /inset/, 'a widget: its group colour on the top edge');
    assert.equal((await style(frame, '.mode.m-alone', ['background-color']))['background-color'], 'rgb(20, 20, 20)', 'Play alone in the dark Now style');
    assert.equal(await frame.evaluate(() => document.querySelector('canvas')), null, 'no stage behind the cards');
    await frame.click('#play'); assert.equal((await S(frame)).screen, 'setup');
    await frame.evaluate(() => window.__brbTest.start('alone', { count: 10, topics: ['animals'] }));
    let s = await S(frame); assert.equal(s.screen, 'playScreen'); assert.ok(s.cur.startsWith('animals-'));
    assert.equal((await style(frame, '.now', ['background-color']))['background-color'], 'rgb(20, 20, 20)', 'the question in the dark Now bar');
    assert.equal(await frame.evaluate(() => document.getElementById('progress').textContent), '1 of 10');
    const [a, b] = [await style(frame, '#optA', ['box-shadow']), await style(frame, '#optB', ['box-shadow'])];
    assert.match(a['box-shadow'], /inset/); assert.match(b['box-shadow'], /inset/); assert.notEqual(a['box-shadow'], b['box-shadow'], 'A and B: each its own group colour on the top edge');
    assert.notEqual(await frame.evaluate(() => document.querySelector('#optA .tag').textContent), '', 'an icon chip on each choice');
    await frame.click('#optA'); await page.waitForTimeout(400);
    assert.equal(await frame.evaluate(() => document.getElementById('optA').classList.contains('chosen')), true);
    assert.equal(await frame.evaluate(() => document.querySelector('#optA .pct b').textContent), '70% chose this', 'what everyone chose (BRB.poll)');
    assert.deepEqual((await P()).polls.map(p => [p.item, p.choice, p.seat]), [[s.cur, 0, 0]]);
    for (let i = 0; i < 9; i++) await frame.evaluate(() => { window.__brbTest.next(); window.__brbTest.pick('b'); });
    await frame.evaluate(() => window.__brbTest.next()); await page.waitForTimeout(300);
    s = await S(frame); assert.equal(s.screen, 'summary'); assert.equal(s.picks, 10); assert.equal(s.gameOver, true);
    assert.ok(await frame.evaluate(() => !!document.querySelector('#sumCard .sum-now') && !!document.querySelector('#sumCard .trait-name').textContent));
    const types = (await P()).types; assert.equal(types.filter(x => x === 'brb:gameover').length, 1, 'gameOver once'); assert.equal(types.includes('brb:score'), false, 'never a score');
    await frame.evaluate(() => window.__brbTest.finish()); await page.waitForTimeout(100);
    assert.equal((await P()).types.filter(x => x === 'brb:gameover').length, 1, 'still once');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('would-you-rather look (solo): dark from BRB.theme, reduced motion from BRB.motion, the sound button, phone tap targets', { skip, timeout: 120_000 }, async () => {
  const { ctx, page, frame, errors } = await open(SOLO, { theme: 'dark', motion: 'reduce', viewport: { width: 390, height: 844 }, mobile: true });
  try {
    assert.equal(await frame.evaluate(() => document.documentElement.dataset.theme), 'dark');
    assert.equal((await style(frame, 'body', ['background-color']))['background-color'], 'rgb(20, 20, 20)');
    assert.equal((await style(frame, '#home .card', ['background-color']))['background-color'], 'rgb(30, 30, 27)');
    assert.equal(await frame.evaluate(() => document.getElementById('game').classList.contains('rm')), true);
    for (const sel of ['#setBtn', '#play', '.mode.m-friends', '.mode.m-guess']) { const r = await box(frame, sel); assert.ok(r.w >= 44 && r.h >= 44, `${sel} ${r.w}x${r.h}`); }
    const before = await frame.evaluate(() => [BRB.sfx.muted, document.getElementById('setBtn').getAttribute('aria-pressed')]);
    await frame.locator('#setBtn').tap();
    const after = await frame.evaluate(() => [BRB.sfx.muted, document.getElementById('setBtn').getAttribute('aria-pressed'), document.getElementById('setBtn').getAttribute('aria-label')]);
    assert.equal(after[0], !before[0]); assert.equal(after[1], String(!after[0])); assert.equal(after[2], 'Sound on or off');
    // with friends on a phone: the choices one above the other, each a big tap target
    await frame.evaluate(() => window.__brbTest.start('friends', { count: 10, players: 2 }));
    assert.equal((await S(frame)).screen, 'pass');
    await frame.locator('#readyBtn').tap();
    const [ra, rb] = [await box(frame, '#optA'), await box(frame, '#optB')];
    assert.ok(ra.h >= 120 && rb.h >= 120 && ra.w > 300, `cards ${JSON.stringify([ra, rb])}`);
    const ya = await frame.evaluate(() => [document.getElementById('optA').getBoundingClientRect().top, document.getElementById('optB').getBoundingClientRect().top]);
    assert.ok(ya[1] > ya[0] + 100, 'stacked in portrait');
    await frame.locator('#optB').tap(); await page.waitForTimeout(400);
    await frame.locator('#readyBtn').tap(); await frame.locator('#optB').tap(); await page.waitForTimeout(400);
    assert.match(await frame.evaluate(() => document.getElementById('react').textContent), /Everyone picked the same!/);
    await frame.evaluate(() => window.__brbTest.finish()); await page.waitForTimeout(200);
    assert.equal(await frame.evaluate(() => document.querySelectorAll('.confetti').length), 0, 'no confetti with reduced motion');
    assert.equal((await S(frame)).gameOver, true);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

const NICKS = Array.from({ length: 30 }, (_, i) => 'N' + i);
const PLAYERS = Array.from({ length: 25 }, (_, i) => [i + 1, i, null, 0, 0, 1, 1, 0]);
async function room(role, opts) {
  const live = { v: 1, role, seat: role === 'host' ? 0 : 3, frame: 'game', nameMode: 'nicknames', mode: 'wyr', nicks: NICKS, view: '2d', me: role === 'host' ? null : { seat: 3, name: 3, avatar: null, team: 0 } };
  const r = await open(LIVE, { live, ...opts });
  await r.send({ t: 'wel', role, seat: live.seat, phase: 'lobby', players: PLAYERS, state: {} });
  await r.page.waitForTimeout(150);
  return r;
}
async function ask(r, i, choices) {
  await r.send({ t: 'ph', phase: 'playing' });
  const at = await r.frame.evaluate(() => window.Oomba.live.now());
  await r.send({ t: 'q', i, n: 8, q: 'Would you rather…', choices, secs: 20, at });
  await r.page.waitForTimeout(200);
}

test('would-you-rather look (live projector): the Now bar, the class split on widget cards, everyone on Oomba, the end', { skip, timeout: 120_000 }, async () => {
  const r = await room('host', { viewport: { width: 1600, height: 900 }, theme: 'light' });
  const { frame, page } = r;
  try {
    assert.equal(await frame.evaluate(() => document.getElementById('banner').textContent), 'Would You Rather?');
    assert.equal(await frame.evaluate(() => document.getElementById('now').hidden), true, 'no Now bar in the lobby');
    await ask(r, 0, ['Fly', 'Be invisible']);
    assert.equal(await frame.evaluate(() => document.getElementById('now').hidden), false);
    assert.equal((await style(frame, '#now', ['background-color']))['background-color'], 'rgb(20, 20, 20)');
    assert.deepEqual(await frame.evaluate(() => [document.getElementById('ask').textContent, document.getElementById('qnum').textContent, document.getElementById('count').textContent]), ['Would you rather…', '1 / 8', '🗳 0 / 25']);
    assert.equal(await frame.evaluate(() => document.getElementById('ca').disabled && document.getElementById('cb').disabled), true, 'the projector never votes');
    assert.ok(parseFloat((await style(frame, '#xa', ['font-size']))['font-size']) >= 40, 'legible from the back of the room');
    await r.send({ t: 'ac', i: 0, n: 14 }); await page.waitForTimeout(100);
    assert.equal(await frame.evaluate(() => document.getElementById('count').textContent), '🗳 14 / 25');
    await r.send({ t: 'ph', phase: 'between' }); await r.send({ t: 'rv', i: 0, counts: [15, 8] }); await r.send({ t: 'st', d: { wyr: { i: 0, a: 58, b: 42, n: 4210 } } });
    await page.waitForTimeout(1300);
    const st = await S(frame); assert.equal(st.revealed, true); assert.equal(st.world, true);
    assert.deepEqual(await frame.evaluate(() => [document.getElementById('pa').textContent, document.getElementById('pb').textContent, document.getElementById('na').textContent]), ['65%', '35%', '👥 15']);
    const fills = await frame.evaluate(() => [document.getElementById('fa').style.width, document.getElementById('fb').style.width, document.getElementById('ba').hidden]);
    assert.deepEqual(fills, ['65%', '35%', false], 'the split as bars in the group colours');
    assert.equal(await frame.evaluate(() => document.getElementById('ca').classList.contains('win')), true);
    assert.equal(await frame.evaluate(() => document.getElementById('wnums').textContent), '58% · 42%');
    assert.match((await style(frame, '#world', ['box-shadow']))['box-shadow'], /inset/);
    assert.notEqual(await frame.evaluate(() => document.getElementById('talkt').textContent), '', 'a question to talk about');
    await ask(r, 1, ['Eat only sweet food forever', 'Eat only salty food forever']);
    await r.send({ t: 'rv', i: 1, counts: [12, 11] }); await r.send({ t: 'ph', phase: 'ended' }); await page.waitForTimeout(300);
    assert.equal((await S(frame)).summary, true);
    assert.deepEqual(await frame.evaluate(() => [document.getElementById('now').hidden, document.getElementById('cards').hidden, document.getElementById('agree').hidden, document.getElementById('close').hidden, document.getElementById('again').hidden]), [true, true, false, false, true]);
    assert.match(await frame.evaluate(() => document.getElementById('agreet').textContent), /Fly \(65%\)/);
    assert.equal(await frame.evaluate(() => /N\d/.test(document.body.innerText)), false, 'never a name');
    assert.deepEqual(r.errors, []);
  } finally { await r.ctx.close(); }
});

test('would-you-rather look (live phone): two big cards, one vote sent once, your side; dark from the site theme', { skip, timeout: 120_000 }, async () => {
  const r = await room('player', { viewport: { width: 390, height: 844 }, mobile: true, theme: 'dark' });
  const { frame, page } = r;
  try {
    assert.equal(await frame.evaluate(() => document.documentElement.classList.contains('dark')), true);
    assert.equal((await style(frame, 'body', ['background-color']))['background-color'], 'rgb(20, 20, 20)');
    assert.equal(await frame.evaluate(() => document.getElementById('banner').textContent), 'Waiting for the host to start…');
    await ask(r, 2, ['Have a pet dragon the size of a cat', 'Have a pet cat the size of a horse']);
    const [ra, rb] = [await box(frame, '#ca'), await box(frame, '#cb')];
    assert.ok(ra.h >= 150 && rb.h >= 150 && ra.w >= 340, `big tap targets ${JSON.stringify([ra, rb])}`);
    assert.equal(await frame.evaluate(() => document.getElementById('note').textContent), 'Tap the one you would rather!');
    await frame.locator('#cb').tap(); await page.waitForTimeout(200);
    assert.equal(await frame.evaluate(() => document.getElementById('ca').disabled && document.getElementById('cb').disabled), true, 'locked after a vote');
    await frame.evaluate(() => window.__brbTest.answer(0)); await page.waitForTimeout(200);
    const votes = (await r.P()).msgs.filter(m => m.t === 'an');
    assert.deepEqual(votes.map(m => [m.i, m.c]), [[2, 1]], 'one vote, for the card tapped');
    assert.equal((await S(frame)).question.picked, 1);
    assert.deepEqual(await frame.evaluate(() => [document.getElementById('cb').classList.contains('mine'), document.getElementById('ca').classList.contains('dim')]), [true, true]);
    await r.send({ t: 'ph', phase: 'between' }); await r.send({ t: 'rv', i: 2, counts: [15, 8] }); await page.waitForTimeout(300);
    assert.equal(await frame.evaluate(() => document.getElementById('note').textContent), 'You chose this, with 35% of your class');
    assert.equal(await frame.evaluate(() => document.getElementById('talk').hidden), true, 'the talk question is the projector\'s');
    assert.deepEqual(r.errors, []);
  } finally { await r.ctx.close(); }
});
