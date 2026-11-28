// Oomba Canvas 1.6.1 in real Chromium, in the production game frame (frameDocument, its CSP and sandbox): the owner's
// fifth audit, "Barnyard Add-Up" played as a student (docs/decisions.md "Oomba Canvas 1.6.1: audit 5").
//   - credit: BRB.setProgress after each settled problem (done / total / score), never in a preview or on the board;
//   - hints: each press shows a hint not shown yet, and after a mistake the next one for its column;
//   - carries: every column that gets a carry has its carry box and its step, a new leading column too (64 + 58,
//     93 + 19, 957 + 868, 47 × 3);
//   - keyboard only: the next box follows the path the student is on (a step, its answer box, the next step; or answer
//     box after answer box), the focused box is the one typed into (a digit replaces it, no click), Enter checks;
//   - the ✓ ✗ ⭐ chips are named ("Not yet. 0"), as the older kits read.
// The site itself (a lesson step done without the end card, the teacher's Progress page) is in
// tests/unit/canvas-progress-site-browser.test.js. Skipped when there is no Chromium.
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
  config: { lang: 'en', support: 'guided', supports: ['guided'], count: problems.length, fresh: false, ...(extra.config || {}) },
  task: { title: 'Barnyard Add-Up', say: 'Add the animals.' }, problems, gen: null, steps: {}, hints: {}, ...extra, ...(extra.config ? { config: { lang: 'en', support: 'guided', supports: ['guided'], count: problems.length, fresh: false, ...extra.config } } : {}),
});
async function open(data, { init = {}, width = 1280, height = 900 } = {}) {
  const { chromium } = require('playwright');
  browser ||= await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width, height } });
  const html = `<title>Barnyard Add-Up</title>\n${canvasTag()}\n<div id="oc-app"></div>\n<script type="application/json" id="oc-activity">\n${JSON.stringify(data)}\n</script>\n<script>Oc.activity(JSON.parse(document.getElementById('oc-activity').textContent));</script>`;
  const doc = frameDocument(html, { user: { displayName: 'Jamie', avatar: 'x', lang: 'en', dir: 'ltr' }, game: { id: 'g', title: 'Barnyard Add-Up', url: `${HOST}/play/barnyard` }, save: {}, canSave: true, tts: { langs: [] }, ...init });
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
  const step = i => f.locator(`.oc-steps .oc-box[data-step="${i}"]`);
  const digits = () => f.locator('.oc-dbox').evaluateAll(els => els.map(e => e.textContent).reverse());   // ones first
  const state = () => frame.evaluate(() => window.__brbTest.state());
  const fb = () => f.locator('.oc-fb').textContent();
  // where the keyboard is: an answer box ("col:0"), a step box ("step:1"), the Check button ("check"), or what else
  const focus = () => frame.evaluate(() => { const a = document.activeElement; if (!a) return null; if (a.dataset.col !== undefined) return `col:${a.dataset.col}`; if (a.dataset.step !== undefined) return `step:${a.dataset.step}`; if (a.classList.contains('oc-primary')) return 'check'; return a.tagName.toLowerCase(); });
  const chosen = () => frame.evaluate(() => { const a = document.querySelector('.oc-sel'); return !a ? null : a.dataset.col !== undefined ? `col:${a.dataset.col}` : a.dataset.step !== undefined ? `step:${a.dataset.step}` : 'other'; });
  const msgs = type => p.evaluate(t => window.__msgs.filter(m => m.type === t), type);
  const type = async s => { for (const k of String(s)) await p.keyboard.press(k); };
  /** Tab (the keyboard only) until the focus is on `where` ("col:0", "step:0"...). */
  const tabTo = async where => { for (let n = 0; n < 40; n++) { if ((await focus()) === where) return; await p.keyboard.press('Tab'); } throw new Error(`Tab never reached ${where} (at ${await focus()})`); };
  return { ctx, p, f, frame, box, step, digits, state, fb, focus, chosen, msgs, type, tabTo, errors, key: k => p.keyboard.press(k), close: () => ctx.close() };
}
const hintBtn = g => g.f.locator('.oc-band .oc-btn', { hasText: 'Hint' });
const hintText = g => g.f.locator('.oc-hint p').textContent();
const check = g => g.f.locator('.oc-band .oc-primary').click();

test(`the latest kit is ${CANVAS_LATEST}`, () => { assert.equal(CANVAS_LATEST, '1.6.1'); });

// ---------------------------------------------------------------- 1. credit as each problem is settled
test('credit: BRB.setProgress after each settled problem (done / total / score), the last one before the end card', { skip, timeout: 90_000 }, async () => {
  const g = await open(activity([{ tool: 'digits.add', a: 64, b: 58 }, { tool: 'digits.add', a: 93, b: 19 }, { tool: 'digits.add', a: 23, b: 45 }]));
  try {
    assert.deepEqual(await g.msgs('brb:progress'), [], 'nothing before the first answer');
    // problem 1: right
    await g.box(0).click(); await g.type('221'); await check(g);
    assert.match(await g.fb(), /^Right!/);
    assert.deepEqual((await g.msgs('brb:progress')).map(m => [m.done, m.total, m.score]), [[1, 3, 1]], 'started with the first');
    // a wrong Check is not settled; the second wrong Check shows the worked answer: settled, not right
    await check(g);   // Next
    await g.box(0).click(); await g.type('111'); await check(g);
    assert.equal((await g.msgs('brb:progress')).length, 1, 'a Not yet is not a settled problem');
    await check(g);
    assert.match(await g.fb(), /^Here is one way/);
    assert.deepEqual((await g.msgs('brb:progress')).map(m => [m.done, m.total, m.score]), [[1, 3, 1], [2, 3, 1]]);
    // the last problem right: done = total, the end card not reached (no Next pressed, no gameOver yet)
    await check(g);   // Next
    await g.box(0).click(); await g.type('86'); await check(g);
    assert.deepEqual((await g.msgs('brb:progress')).map(m => [m.done, m.total, m.score]).at(-1), [3, 3, 2], 'done with the score, before the end card');
    assert.equal((await g.state()).screen, 'work'); assert.deepEqual(await g.msgs('brb:gameover'), []);
    // Next: the end card and the result as before (once)
    await check(g);
    await g.f.locator('.oc-end').waitFor();
    assert.deepEqual((await g.msgs('brb:gameover')).map(m => [m.won, m.score]), [[false, 2]]);
    assert.deepEqual(g.errors, []);
  } finally { await g.close(); }
});
test('credit: never in a preview (no play page) and never on the board', { skip, timeout: 90_000 }, async () => {
  for (const [why, data, init] of [
    ['a Studio preview', activity([{ tool: 'digits.add', a: 23, b: 45 }]), { preview: true }],
    ['no play page', activity([{ tool: 'digits.add', a: 23, b: 45 }]), { game: { id: 'g', title: 'B' } }],
    ['played on the board', activity([{ tool: 'digits.add', a: 23, b: 45 }], { config: { board: true } }), {}],
  ]) {
    const g = await open(data, { init });
    try {
      await g.box(0).click(); await g.type('86'); await check(g);
      assert.match(await g.fb(), /^Right!/, why);
      assert.deepEqual(await g.msgs('brb:progress'), [], `${why}: nothing sent`);
    } finally { await g.close(); }
  }
});

// ---------------------------------------------------------------- 2. hints progress
test('hints: each press shows the next hint, a Check that is not right moves to the next one for its column', { skip, timeout: 60_000 }, async () => {
  const g = await open(activity([{ tool: 'digits.add', a: 64, b: 58 }, { tool: 'digits.add', a: 46, b: 38 }]));
  try {
    const seen = [];
    await hintBtn(g).click(); seen.push(await hintText(g));
    assert.equal(seen[0], 'Ones: Add 4 + 8. Is it 10 or more?');
    assert.match(await g.f.locator('.oc-hint b').textContent(), /^Hint 1 of 5$/);
    // the audit: a Check (ones wrong), then Hint showed nothing new
    await g.box(0).click(); await g.type('3'); await check(g);
    assert.match(await g.fb(), /^Not yet\. Look again at this column: Ones\./);
    await hintBtn(g).click(); seen.push(await hintText(g));
    assert.equal(seen[1], 'Ones: 4 + 8 = 12. Write 2 and carry 1 to the next column (Tens).', 'the next one for the ones, not the one on screen');
    await hintBtn(g).click(); seen.push(await hintText(g));
    assert.equal(seen[2], 'Tens: Add 6 + 5, then the 1 you carried. Is it 10 or more?');
    await hintBtn(g).click(); seen.push(await hintText(g));
    assert.equal(seen[3], 'Tens: 6 + 5 + 1 = 12. Write 2 here and 1 in the box on its left.');
    await hintBtn(g).click(); seen.push(await hintText(g));
    assert.equal(seen[4], 'Now check every box once more, from the ones to the left.');
    assert.equal(new Set(seen).size, 5, 'five presses, five different hints');
    await hintBtn(g).click();
    assert.equal(await hintText(g), 'That was the last hint. Have a go, then press Check.');
    // a new problem starts the hints again; a wrong step box (the tens) turns them to that column
    await g.box(0).click(); await g.type('221'); await check(g); await check(g);
    await g.step(0).click(); await g.type('14');           // ones step right
    await g.step(1).click(); await g.type('7');            // tens step: 4 + 3 + 1 is 8, not 7
    assert.match(await g.fb(), /^Not yet\. 7 is not it yet/);
    await hintBtn(g).click();
    assert.equal(await hintText(g), 'Tens: Add 4 + 3, then the 1 you carried. Is it 10 or more?');
    await hintBtn(g).click();
    assert.equal(await hintText(g), 'Tens: 4 + 3 + 1 = 8. Write 8 in this column.');
    await g.step(1).click(); await g.type('9');            // wrong again: the tens hints are shown, the next one is new
    await hintBtn(g).click();
    assert.equal(await hintText(g), 'Ones: Add 6 + 8. Is it 10 or more?');
    assert.deepEqual(g.errors, []);
  } finally { await g.close(); }
});

// ---------------------------------------------------------------- 3. carries into every column, a new leading one too
const carryBoxes = g => g.f.locator('.oc-carry [data-carry]').evaluateAll(els => els.map(e => [+e.dataset.carry, e.textContent]).sort((a, b) => a[0] - b[0]));
const stepLines = g => g.f.locator('.oc-steps li p').allTextContents();
for (const [a, b, op, carryCols, lead] of [
  [64, 58, '+', [1, 2], 'Hundreds: just the 1 carried = ?'],
  [93, 19, '+', [1, 2], 'Hundreds: just the 1 carried = ?'],
  [957, 868, '+', [1, 2, 3], 'Thousands: just the 1 carried = ?'],
  [478, 657, '+', [1, 2, 3], 'Thousands: just the 1 carried = ?'],
  [47, 3, '×', [1, 2], 'Hundreds: just the 1 carried = ?'],
]) {
  const tool = op === '+' ? 'digits.add' : 'digits.mul', sum = op === '+' ? a + b : a * b;
  test(`carries: ${a} ${op} ${b} = ${sum}, a carry box over every column that gets one and a step for the new leading column`, { skip, timeout: 60_000 }, async () => {
    const g = await open(activity([{ tool, a, b }]));
    try {
      assert.deepEqual(await carryBoxes(g), carryCols.map(c => [c, '']), 'the carry boxes, empty');
      const lines = await stepLines(g);
      assert.ok(lines.includes(lead), `the step for the leading column: ${lines.join(' | ')}`);
      // the keyboard only, along the guided path: each step, then its column's answer digit; the carries fill in
      const ds = String(sum).split('').reverse();
      await g.step(0).click();
      const steps = await g.f.locator('.oc-steps .oc-box').count();
      for (let i = 0; i < steps; i++) {
        assert.equal(await g.chosen(), `step:${i}`, `step ${i + 1} is chosen`);
        await g.type(stepAns(tool, a, b)[i]);
        assert.equal(await g.chosen(), `col:${i}`, `then the answer box of its column (${i})`);
        await g.type(ds[i]);
      }
      assert.deepEqual(await g.digits(), ds, 'every digit');
      assert.deepEqual(await carryBoxes(g), carryCols.map(c => [c, String(carryOf(tool, a, b, c))]), 'every carry box filled');
      await check(g);
      assert.match(await g.fb(), /^Right! ⭐⭐⭐/);
      assert.deepEqual(g.errors, []);
    } finally { await g.close(); }
  });
}
/** The step answers of a column sum (the column's sum with what came in; the last, the carry alone). */
function stepAns(tool, a, b) {
  const A = String(a).split('').reverse().map(Number), B = String(b).split('').reverse().map(Number), out = []; let c = 0;
  const n = tool === 'digits.add' ? Math.max(A.length, B.length) : A.length;
  for (let i = 0; i < n; i++) { const s = tool === 'digits.add' ? (A[i] || 0) + (B[i] || 0) + c : A[i] * b + c; out.push(String(s)); c = tool === 'digits.add' ? (s >= 10 ? 1 : 0) : Math.floor(s / 10); }
  if (c) out.push(String(c));
  return out;
}
const carryOf = (tool, a, b, col) => { const s = stepAns(tool, a, b); return Math.floor(+s[col - 1] / 10); };

test('carries: none for a sum that does not carry, and On my own shows only the carries made', { skip, timeout: 60_000 }, async () => {
  const g = await open(activity([{ tool: 'digits.add', a: 23, b: 45 }]));
  try { assert.equal(await g.f.locator('.oc-carry').count(), 0); } finally { await g.close(); }
  const o = await open(activity([{ tool: 'digits.add', a: 64, b: 58 }], { config: { support: 'own', supports: ['own'] } }));
  try { assert.equal(await o.f.locator('.oc-carry').count(), 0, 'no empty carry boxes On my own (they would tell)'); } finally { await o.close(); }
});

// ---------------------------------------------------------------- 4. the keyboard only
test('keyboard only: answer box after answer box (ones, tens, hundreds), never diverted into a step box; a focused filled box is replaced', { skip, timeout: 60_000 }, async () => {
  const g = await open(activity([{ tool: 'digits.add', a: 64, b: 58 }, { tool: 'digits.add', a: 93, b: 19 }]));
  try {
    await g.tabTo('col:0');
    await g.type('2');
    assert.equal(await g.focus(), 'col:1', 'the ones typed: the tens box, chosen and focused');
    assert.equal(await g.chosen(), 'col:1');
    await g.type('2');
    assert.equal(await g.focus(), 'col:2');
    await g.type('1');
    assert.deepEqual(await g.digits(), ['2', '2', '1'], 'the ones answer, then the tens answer, then the hundreds');
    for (let i = 0; i < 3; i++) assert.equal(await g.step(i).textContent(), '', 'no step box got a digit');
    // replace a digit without a click: Tab onto the filled tens box (focus only) and type
    await g.key('Tab');
    assert.equal(await g.focus(), 'col:1');
    await g.type('7');
    assert.deepEqual(await g.digits(), ['2', '7', '1'], 'the focused box took the digit (it replaced the 2)');
    assert.equal(await g.focus(), 'col:2');
    // ← and → move between the answer boxes
    await g.key('ArrowRight'); assert.equal(await g.focus(), 'col:1');
    await g.key('ArrowRight'); assert.equal(await g.focus(), 'col:0');
    await g.key('ArrowLeft'); assert.equal(await g.focus(), 'col:1');
    await g.type('2');
    assert.deepEqual(await g.digits(), ['2', '2', '1']);
    // Enter on a box checks
    assert.match(await g.focus(), /^col:/);
    await g.key('Enter');
    assert.match(await g.fb(), /^Right! ⭐⭐⭐/);
    assert.equal(await g.focus(), 'check'); await g.key('Enter');   // Next
    // problem 2: a slip in the ones, put right by Tab and a digit (the boxes go hundreds, tens, ones)
    await g.tabTo('col:0'); await g.type('5');
    assert.equal(await g.focus(), 'col:1');
    await g.key('Tab'); assert.equal(await g.focus(), 'col:0');
    await g.type('2');
    assert.equal((await g.digits())[0], '2', '5 became 2 in the focused box');
    assert.equal(await g.focus(), 'col:1');
    await g.type('11');
    await g.key('Enter');
    assert.match(await g.fb(), /^Right!/);
    assert.deepEqual(g.errors, []);
  } finally { await g.close(); }
});
test('keyboard only, with the steps: a step, its column\'s answer box, the next step (it asks for the carry), and so on', { skip, timeout: 60_000 }, async () => {
  const g = await open(activity([{ tool: 'digits.add', a: 64, b: 58 }]));
  try {
    await g.tabTo('step:0');
    await g.type('12');
    assert.equal(await g.focus(), 'col:0', 'Ones: 4 + 8 = 12, then the ones answer box (it went to the Tens step box, the "carry box")');
    await g.type('2');
    assert.equal(await g.focus(), 'step:1', 'this column\'s step was done: the next step, which asks for the carry');
    assert.match((await stepLines(g))[1], /^Tens: 6 \+ 5 \+ 1 carried = \?$/);
    await g.type('12');
    assert.equal(await g.focus(), 'col:1'); await g.type('2');
    assert.equal(await g.focus(), 'step:2'); await g.type('1');
    assert.equal(await g.focus(), 'col:2'); await g.type('1');
    assert.deepEqual(await g.digits(), ['2', '2', '1']);
    assert.deepEqual(await carryBoxes(g), [[1, '1'], [2, '1']]);
    await g.key('Enter');
    assert.match(await g.fb(), /^Right! ⭐⭐⭐/);
    assert.deepEqual(g.errors, []);
  } finally { await g.close(); }
});
test('keyboard only: a wrong step box with the focus takes the next digits in place of its own, and Enter checks a step', { skip, timeout: 60_000 }, async () => {
  const g = await open(activity([{ tool: 'digits.add', a: 46, b: 38 }]));
  try {
    await g.tabTo('step:0');
    await g.type('15');
    assert.match(await g.fb(), /^Not yet\. 15 is not it yet/);
    assert.equal(await g.focus(), 'step:0', 'the focus stays on the wrong box');
    await g.type('14');
    assert.equal(await g.step(0).textContent(), '14', 'the new digits replaced 15');
    assert.equal(await g.focus(), 'col:0');
    await g.type('4'); assert.equal(await g.focus(), 'step:1');
    await g.type('8'); assert.equal(await g.focus(), 'col:1');
    await g.type('8');
    assert.deepEqual(await g.digits(), ['4', '8']);
    await g.key('Enter');
    assert.match(await g.fb(), /^Right! ⭐⭐☆/, 'one Not yet: two stars');
    assert.deepEqual(g.errors, []);
  } finally { await g.close(); }
});

// ---------------------------------------------------------------- 5. the Not yet counter stays, named
test('the ✓ ✗ ⭐ chips are named ("Right! 0", "Not yet. 0", "0 stars"), and ✗ counts every Not yet', { skip, timeout: 60_000 }, async () => {
  const g = await open(activity([{ tool: 'digits.add', a: 64, b: 58 }]));
  try {
    const strip = await g.f.locator('.oc-strip').ariaSnapshot();
    assert.match(strip, /img "Right! 0"/); assert.match(strip, /img "Not yet\. 0"/); assert.match(strip, /img "0 stars"/);
    assert.equal(await g.f.locator('.oc-no').getAttribute('title'), 'Not yet. 0', 'and on hover');
    await g.box(0).click(); await g.type('3'); await check(g);
    assert.equal(await g.f.locator('.oc-no').textContent(), '✗ 1');
    assert.match(await g.f.locator('.oc-strip').ariaSnapshot(), /img "Not yet\. 1"/);
  } finally { await g.close(); }
});
