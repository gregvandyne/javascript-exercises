// Oomba Canvas 1.6.0 (and 1.6.1, which keeps these) in real Chromium, in the production game frame (frameDocument, its CSP and sandbox): the owner's
// fourth audit of Builder class games (docs/decisions.md "Builder class games: audit 4 quality").
//   - typing every digit of 2- and 3-digit answers, with a click on each box, with the kit moving to the next box by
//     itself, with a click on the box it moved to, and with the on-screen keypad: no digit is lost and none is cleared;
//   - a wrong step box gets kind feedback, is marked and counts as a Not yet; Check reads it ("Nothing is there yet"
//     only when nothing is anywhere, and that is not a try); typing in a full box starts it again; Clear empties it;
//   - hints use the problem's own digits and answer the last mistake, under one "💡 Hint" label on every problem;
//   - stars for each problem and on the end card, the theme (icon, cheers, story, end line), the sound switch.
// The tests need a local Chromium (/opt/pw-browsers/chromium); they are skipped when there is none.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'];
const exe = process.env.BRB_CHROMIUM || LOCAL.find(f => fs.existsSync(f));
const skip = !exe ? 'no Chromium on this machine' : false;
const { frameDocument, frameCsp, SANDBOX } = await import('../../server/services/frame.js');
const { vendorFile } = await import('../../server/services/snapshot.js');
const { canvasTag, CANVAS_LATEST } = await import('../../server/services/canvaskit.js');
let browser;
test.after(async () => { if (browser) await browser.close(); });
const HOST = 'http://game.invalid';

const activity = (problems, extra = {}) => ({
  config: { lang: 'en', support: 'guided', supports: ['guided'], count: problems.length, fresh: false },
  task: { title: 'Farm sums', say: 'Add the eggs.' }, problems, gen: null, steps: {}, hints: {}, ...extra,
});
async function open(data, { width = 1280, height = 900, coarse = false, v = CANVAS_LATEST } = {}) {
  const { chromium } = require('playwright');
  browser ||= await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: coarse, isMobile: coarse });
  const html = `<title>Farm sums</title>\n${canvasTag(v)}\n<div id="oc-app"></div>\n<script type="application/json" id="oc-activity">\n${JSON.stringify(data)}\n</script>\n<script>Oc.activity(JSON.parse(document.getElementById('oc-activity').textContent));</script>`;
  const doc = frameDocument(html, { user: { displayName: 'T', avatar: 'x', lang: 'en', dir: 'ltr' }, game: { id: 'g', title: 'Farm sums', url: `${HOST}/play/farm` }, save: {}, canSave: true, tts: { langs: [] } });
  const page = `<!doctype html><meta charset=utf-8><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style><iframe sandbox="${SANDBOX}" src="${HOST}/frame"></iframe>
<script>window.__msgs = []; addEventListener('message', e => { if (e.data && e.data.brb === 1) window.__msgs.push(e.data); });</script>`;
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u === HOST + '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: page });
    if (u === HOST + '/frame') return route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': frameCsp(HOST) }, body: doc });
    const f = u.startsWith(HOST + '/vendor/') && vendorFile(u);
    if (f) return route.fulfill({ status: 200, headers: { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'font/woff2', 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) });
    return route.abort();
  });
  const p = await ctx.newPage();
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.goto(HOST + '/');
  const frame = p.frames().find(f => f.url() === HOST + '/frame');
  await frame.waitForFunction(() => window.__brbTest && window.__brbTest.state && document.querySelector('.oc-band'), null, { timeout: 60_000 });
  const f = p.frameLocator('iframe');
  const box = col => f.locator(`.oc-dbox[data-col="${col}"]`);
  const digits = () => f.locator('.oc-dbox').evaluateAll(els => els.map(e => e.textContent).reverse());   // ones first
  const state = () => frame.evaluate(() => window.__brbTest.state());
  const fb = () => f.locator('.oc-fb').textContent();
  return { ctx, p, f, frame, box, digits, state, fb, errors, key: k => p.keyboard.press(k), close: () => ctx.close() };
}
const digitsOf = n => String(n).split('').reverse().map(Number);
const next = async g => { await g.f.locator('.oc-band .oc-primary').click(); };   // Next ›, after a right answer

// The audit: "the first keypress into the Tens box often did not register (5 of 6 problems)" and "in a 3-digit game
// clicking/filling the Hundreds box cleared the Tens box". The kit moved on to the Tens box by itself after the ones
// digit; tapping that box (as a student does) let go of it, so the digit typed next went nowhere.
const PROBLEMS = [{ tool: 'digits.add', a: 46, b: 38 }, { tool: 'digits.add', a: 478, b: 256 }, { tool: 'digits.add', a: 957, b: 868 }];
// 1.6.1 keeps every 1.6.0 behaviour here; the two that changed on purpose (the box chosen after a right step box, the
// order of the hints) are checked for each version (docs/decisions.md "Oomba Canvas 1.6.1: audit 5").
for (const V of ['1.6.0', CANVAS_LATEST]) {
  const vtest = (name, o, fn) => test(`${name} [${V}]`, o, fn);
  const openV = (data, o = {}) => open(data, { ...o, v: V });
  const WAYS = {
    'a click on every box': async (g, ds) => { for (let i = 0; i < ds.length; i++) { await g.box(i).click(); await g.key(String(ds[i])); } },
    'one click, then the kit moves on by itself': async (g, ds) => { await g.box(0).click(); for (const d of ds) await g.key(String(d)); },
    'a click on the box the kit moved to': async (g, ds) => { await g.box(0).click(); await g.key(String(ds[0])); for (let i = 1; i < ds.length; i++) { await g.box(i).click(); await g.key(String(ds[i])); } },
    'a double tap on each box': async (g, ds) => { for (let i = 0; i < ds.length; i++) { await g.box(i).dblclick(); await g.key(String(ds[i])); } },
    'the keypad': async (g, ds) => { await g.f.locator('.oc-keybtn').click(); await g.box(0).click(); for (const d of ds) await g.f.locator('.oc-keys .oc-key', { hasText: new RegExp(`^${d}$`) }).click(); await g.f.locator('.oc-keybtn').click(); },
    'from the left (hundreds first), with a click on each box': async (g, ds) => { for (let i = ds.length - 1; i >= 0; i--) { await g.box(i).click(); await g.key(String(ds[i])); } },
  };
  for (const [way, type] of Object.entries(WAYS)) {
    vtest(`every digit of 2-, 3- and 4-digit answers is kept: ${way}`, { skip, timeout: 120_000 }, async () => {
      const g = await openV(activity(PROBLEMS));
      try {
        for (const [n, p] of PROBLEMS.entries()) {
          const ds = digitsOf(p.a + p.b);
          await type(g, ds);
          assert.deepEqual((await g.digits()).slice(0, ds.length).map(Number), ds, `problem ${n + 1} (${p.a} + ${p.b}): every digit is there`);
          await g.f.locator('.oc-band .oc-primary').click();
          assert.match(await g.fb(), /^Right!/, `problem ${n + 1}: right`);
          if (n < PROBLEMS.length - 1) await next(g);
        }
        assert.deepEqual(g.errors, []);
      } finally { await g.close(); }
    });
  }
  vtest('on a phone (390 px, touch: the keypad opens by itself), taps on each box and the keypad keep every digit', { skip, timeout: 120_000 }, async () => {
    const g = await openV(activity(PROBLEMS), { width: 390, height: 844, coarse: true });
    try {
      for (const [n, p] of PROBLEMS.entries()) {
        const ds = digitsOf(p.a + p.b);
        await g.box(0).tap();
        assert.equal(await g.f.locator('.oc-keys').isVisible(), true, 'the keypad is open');
        for (let i = 0; i < ds.length; i++) { if (i) await g.box(i).tap(); await g.f.locator('.oc-keys .oc-key', { hasText: new RegExp(`^${ds[i]}$`) }).tap(); }
        assert.deepEqual((await g.digits()).slice(0, ds.length).map(Number), ds, `problem ${n + 1}`);
        await g.f.locator('.oc-band .oc-primary').tap();
        assert.match(await g.fb(), /^Right!/);
        if (n < PROBLEMS.length - 1) await g.f.locator('.oc-band .oc-primary').tap();
      }
    } finally { await g.close(); }
  });
  vtest('filling the Hundreds box never clears the Tens box, and the box chosen stays chosen when it is tapped again', { skip, timeout: 60_000 }, async () => {
    const g = await openV(activity([{ tool: 'digits.add', a: 478, b: 256 }]));
    try {
      await g.box(0).click(); await g.key('4'); await g.key('3');
      assert.equal(await g.f.locator('.oc-dbox.oc-sel').getAttribute('data-col'), '2', 'the kit moved on to the Hundreds box');
      await g.box(2).click(); await g.box(2).click();
      assert.equal(await g.f.locator('.oc-dbox.oc-sel').getAttribute('data-col'), '2', 'tapping it again keeps it chosen');
      await g.key('7');
      assert.deepEqual(await g.digits(), ['4', '3', '7']);
      // correcting the Tens box: tap it, type; the Hundreds box keeps its digit
      await g.box(1).click(); await g.key('5');
      assert.deepEqual(await g.digits(), ['4', '5', '7'], 'only the tapped box changes');
    } finally { await g.close(); }
  });

  // "A wrong digit in a step box sits silently... Pressing Check then says 'Not yet. Nothing is there yet.'"
  vtest('a wrong step box: kind feedback, marked, a Not yet; Check reads it; a full box starts again; Clear empties it', { skip, timeout: 60_000 }, async () => {
    const g = await openV(activity([{ tool: 'digits.add', a: 23, b: 45 }]));   // ones 3 + 5 = 8 (one digit), tens 2 + 4 = 6
    try {
      const step = i => g.f.locator('.oc-steps .oc-box').nth(i);
      assert.equal((await g.state()).notYet, 0);
      await step(0).click(); await g.key('9');
      assert.match(await g.fb(), /^Not yet\. 9 is not it yet for this step\. Have another go, or press Hint\.$/);
      assert.match(await step(0).getAttribute('class'), /oc-bad/, 'the box is marked');
      assert.match(await step(0).getAttribute('aria-label'), /Not yet/);
      assert.equal(await g.f.locator('.oc-no').textContent(), '✗ 1', 'the Not yet counter moved');
      // Check with only that wrong step box: it is about the step, never "Nothing is there yet"
      await g.f.locator('.oc-band .oc-primary').click();
      assert.doesNotMatch(await g.fb(), /Nothing is there yet/);
      assert.equal((await g.state()).phase, 'work', 'and it did not use up a try');
      // typing in the full box starts it again: 9 then 8 is 8, not 98, and 8 is right
      await step(0).click(); await g.key('8');
      assert.equal(await step(0).textContent(), '8');
      assert.match(await g.f.locator('.oc-steps li').first().getAttribute('class'), /oc-done/, 'the step is done');
      assert.equal(await g.fb(), '', 'the Not yet line goes once it is right');
      if (V === '1.6.0') { assert.equal(await g.f.locator('.oc-steps .oc-box.oc-sel').count(), 1, 'the next step box is chosen by itself'); await g.key('5'); }
      else {
        // 1.6.1: its column's answer box first (the ones: write the 8), then the next step
        assert.equal(await g.f.locator('.oc-dbox.oc-sel').getAttribute('data-col'), '0', 'the ones answer box is chosen by itself');
        await step(1).click(); await g.key('5');
      }
      // Clear empties a step box that is not done (a done one stays)
      assert.equal(await step(1).textContent(), '5'); assert.match(await g.fb(), /Not yet/);
      await g.f.locator('.oc-band .oc-btn', { hasText: 'Clear' }).click();
      assert.equal(await step(1).textContent(), '', 'Clear empties the step box');
      assert.equal(await step(0).textContent(), '8', 'the done step stays');
      assert.doesNotMatch(await step(1).getAttribute('class'), /oc-bad/);
      // the carried digit: none here (3 + 5 does not carry)
      assert.equal(await g.f.locator('.oc-carry').count(), 0);
      // a Check with a digit typed but not yet checked reads the step box
      await step(1).click(); await g.key('6');
      assert.match(await g.f.locator('.oc-steps li').nth(1).getAttribute('class'), /oc-done/);
      assert.equal((await g.state()).notYet, 2, 'two Not yets: 9 and 5');
      // the steps done, the ones answer box is chosen, so the answer can be typed straight away (1.6.1: the answer box of
      // the column of the step just done, the tens; the ones are typed from their own box)
      assert.equal(await g.f.locator('.oc-dbox.oc-sel').getAttribute('data-col'), V === '1.6.0' ? '0' : '1');
      if (V !== '1.6.0') await g.box(0).click();
      await g.key('8'); await g.key('6');
      assert.deepEqual(await g.digits(), ['8', '6']);
      await g.f.locator('.oc-band .oc-primary').click();
      assert.match(await g.fb(), /^Right! ⭐☆☆/, 'two Not yets: one star');
    } finally { await g.close(); }
  });
  vtest('Check with nothing anywhere: "Nothing is there yet", not a try (twice still leaves the problem to do)', { skip, timeout: 60_000 }, async () => {
    const g = await openV(activity([{ tool: 'digits.add', a: 46, b: 38 }]));
    try {
      await g.f.locator('.oc-band .oc-primary').click();
      assert.equal(await g.fb(), 'Nothing is there yet. Tap a box, then type a digit.');
      await g.f.locator('.oc-band .oc-primary').click();
      const st = await g.state();
      assert.equal(st.phase, 'work'); assert.equal(st.notYet, 0);
      // a wrong answer box after a Check is marked, and the hint answers it with the problem's own digits
      await g.box(0).click(); await g.key('4'); await g.key('7');
      await g.f.locator('.oc-band .oc-primary').click();
      assert.match(await g.fb(), /^Not yet\. Look again at this column: Tens\. Have another go\.$/);
      assert.match(await g.box(1).getAttribute('class'), /oc-bad/);
      await g.f.locator('.oc-band .oc-btn', { hasText: 'Hint' }).click();
      assert.equal(await g.f.locator('.oc-hint p').textContent(), 'Tens: Add 4 + 3, then the 1 you carried. Is it 10 or more?');
      await g.f.locator('.oc-band .oc-btn', { hasText: 'Hint' }).click();
      assert.equal(await g.f.locator('.oc-hint p').textContent(), 'Tens: 4 + 3 + 1 = 8. Write 8 in this column.');
      await g.box(1).click(); await g.key('8');
      assert.doesNotMatch(await g.box(1).getAttribute('class'), /oc-bad/, 'the mark goes when the box changes');
    } finally { await g.close(); }
  });
  vtest('hints: the problem\'s own digits ("6 + 8 = 14. Write 4 and carry 1"), one "💡 Hint" label on every problem', { skip, timeout: 60_000 }, async () => {
    const g = await openV(activity([{ tool: 'digits.add', a: 46, b: 38 }, { tool: 'digits.add', a: 27, b: 15 }]));
    try {
      const hint = g.f.locator('.oc-band .oc-btn').nth(1);
      assert.equal(await hint.textContent(), '💡 Hint', 'problem 1');
      await g.f.locator('.oc-band .oc-primary').click();            // nothing there: still the same label
      await hint.click();
      assert.equal(await g.f.locator('.oc-hint p').textContent(), 'Ones: Add 6 + 8. Is it 10 or more?');
      await hint.click();
      assert.equal(await g.f.locator('.oc-hint p').textContent(), 'Ones: 6 + 8 = 14. Write 4 and carry 1 to the next column (Tens).');
      await hint.click();
      // (1.6.1: every hint in turn, so the tens' nudge comes before its worked line)
      if (V !== '1.6.0') { assert.equal(await g.f.locator('.oc-hint p').textContent(), 'Tens: Add 4 + 3, then the 1 you carried. Is it 10 or more?'); await hint.click(); }
      assert.equal(await g.f.locator('.oc-hint p').textContent(), 'Tens: 4 + 3 + 1 = 8. Write 8 in this column.');
      // a step box done: the carried 1 shows over the tens
      await g.f.locator('.oc-steps .oc-box').first().click(); await g.key('1'); await g.key('4');
      assert.deepEqual(await g.f.locator('.oc-carry .oc-cc').evaluateAll(els => els.map(e => e.textContent)), ['1', ''], 'the 1 over the tens (then the ones)');
      if (V === '1.6.0') { await g.box(0).click(); await g.key('4'); await g.key('8'); }
      else {
        // 1.6.1: on the steps' path: the ones answer box, then the tens step (it asks for the carry), then its answer box
        assert.equal(await g.f.locator('.oc-dbox.oc-sel').getAttribute('data-col'), '0');
        await g.key('4'); await g.key('8'); await g.key('8');
        assert.equal(await g.f.locator('.oc-steps .oc-box').nth(1).textContent(), '8');
      }
      assert.deepEqual(await g.digits(), ['4', '8']);
      await g.f.locator('.oc-band .oc-primary').click();
      assert.match(await g.fb(), /^Right! ⭐⭐☆/, 'a hint was used: two stars');
      await next(g);
      assert.equal(await hint.textContent(), '💡 Hint', 'problem 2: the same label');
      await g.f.locator('.oc-band .oc-primary').click();
      assert.equal(await hint.textContent(), '💡 Hint');
    } finally { await g.close(); }
  });
  vtest('a game: stars for each problem, the stars on the end card, the theme on screen, a sound switch', { skip, timeout: 60_000 }, async () => {
    const theme = { icon: '🐔', cheers: ['Egg-cellent!', 'The hens are happy!'], end: 'Every crate of eggs is packed. Well done, farmer!' };
    const g = await openV(activity([{ tool: 'digits.add', a: 46, b: 38, story: 'The farm packs {a} eggs, then {b} more. How many eggs?' }, { tool: 'digits.add', a: 23, b: 45 }], { task: { title: 'Farm sums', say: 'Help pack the eggs.', theme } }));
    try {
      assert.equal(await g.f.locator('.oc-task .oc-ticon').textContent(), '🐔');
      assert.equal(await g.f.locator('#oc-taskline').textContent(), 'The farm packs 46 eggs, then 38 more. How many eggs?');
      assert.equal(await g.f.locator('.oc-stars').textContent(), '⭐ 0');
      await g.box(0).click(); await g.key('4'); await g.key('8');
      await g.f.locator('.oc-band .oc-primary').click();
      assert.equal(await g.fb(), 'Right! ⭐⭐⭐ Egg-cellent!');
      assert.equal(await g.f.locator('.oc-stars').textContent(), '⭐ 3');
      await next(g);
      assert.equal(await g.f.locator('#oc-taskline').textContent(), 'Work out 23 + 45.');
      await g.box(0).click(); await g.key('8'); await g.key('5');
      await g.f.locator('.oc-band .oc-primary').click();                      // not yet: tens
      await g.box(1).click(); await g.key('6');
      await g.f.locator('.oc-band .oc-primary').click();
      assert.equal(await g.fb(), 'Right! ⭐⭐☆ The hens are happy!');
      await next(g);
      await g.f.locator('.oc-end').waitFor();
      const end = await g.f.locator('.oc-end').textContent();
      assert.match(end, /🐔/); assert.match(end, /2 of 2 right/); assert.match(end, /⭐⭐⭐ ⭐⭐☆/); assert.match(end, /5 of 6 stars/);
      assert.match(end, /Every crate of eggs is packed\. Well done, farmer!/);
      assert.match(end, /Try again/, 'the end card keeps its buttons');
      // sound: the site's own switch (BRB.sfx.mute), kept for every game
      const snd = g.f.locator('.oc-snd');
      assert.equal(await snd.textContent(), '🔊'); assert.equal(await snd.getAttribute('aria-pressed'), 'true');
      await snd.click();
      assert.equal(await snd.textContent(), '🔇'); assert.equal(await g.frame.evaluate(() => window.BRB.sfx.muted), true);
      await snd.click();
      assert.equal(await g.frame.evaluate(() => window.BRB.sfx.muted), false);
      assert.deepEqual(g.errors, []);
    } finally { await g.close(); }
  });
}
test(`the latest kit is ${CANVAS_LATEST}`, () => { assert.equal(CANVAS_LATEST, '1.6.1'); });
