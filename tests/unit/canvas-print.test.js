// Oomba Canvas 1.2.0 in real Chromium, inside the production wrapper (frameDocument + the frame CSP in a sandboxed
// iframe): the figure libraries load from their pinned files under the CSP (JSXGraph, SmilesDrawer and Oomba Figures
// all draw), a figure question is answered with the kit's keypad, and "Print worksheet" asks the page with numbers only
// (the answer key option only where BRB.canPrintKey). Then the printable page the server makes, with print media
// emulated, on A4 and US Letter: the questions on their own page(s), N questions, and the answer key with N answers on
// a page of its own.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LOCAL = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = LOCAL.find(f => fs.existsSync(f));
let chromium = null; try { ({ chromium } = await import('playwright-core')); } catch { chromium = null; }
let ok = false;
if (chromium) { try { const b = await chromium.launch({ ...(exe ? { executablePath: exe } : {}) }); await b.close(); ok = true; } catch { ok = false; } }
const skip = ok ? false : 'no Chromium on this machine';

const { frameDocument, frameCsp, SANDBOX } = await import('../../server/services/frame.js');
const { vendorFile } = await import('../../server/services/snapshot.js');
const { figureFile, figTags, figTag } = await import('../../server/services/figlibs.js');
const { canvasTag } = await import('../../server/services/canvaskit.js');
const { canvasPrintHtml } = await import('../../server/services/canvas-print.js');
const { tFor } = await import('../../server/i18n/index.js');
const HOST = 'http://game.invalid';

const DATA = {
  config: { lang: 'en', support: 'guided', supports: ['guided'], count: 3, fresh: false, board: false, purpose: ['screen', 'worksheet'] },
  task: { title: 'Forces and atoms', say: 'Answer each question.' },
  problems: [
    { tool: 'figure.number', q: 'What is the net force on the box?', fig: { kind: 'freeBody', body: 'box', forces: [{ name: 'F', dir: 'right', size: 10 }, { name: 'Ff', dir: 'left', size: 4 }] }, answer: 6, unit: 'N', work: ['10 N − 4 N', '= 6 N'] },
    { tool: 'figure.number', q: 'How many protons does this atom have?', fig: { kind: 'bohr', element: 'Na', hide: 'nucleus' }, answer: 11, work: ['Count the electrons: 2 + 8 + 1 = 11.', 'A neutral atom has as many protons: 11'] },
    { tool: 'figure.choice', q: 'Is the image real or virtual?', fig: { kind: 'rays', type: 'convex-lens', f: 10, u: 25, h: 4 }, choices: ['real', 'virtual'], answer: 0, work: ['The rays meet after the lens, so it is real'] },
  ],
  gen: null, steps: {}, hints: {},
};
const GAME = `<title>Forces and atoms</title>\n${figTags()}\n${canvasTag()}\n<div id="oc-app"></div>\n<script type="application/json" id="oc-activity">\n${JSON.stringify(DATA)}\n</script>\n<script>Oc.activity(JSON.parse(document.getElementById('oc-activity').textContent));
window.__extra = (() => { const out = {}; try { document.body.append(OF.structure('CCO', { title: 'Ethanol' })); out.structure = document.querySelectorAll('svg.of-structure *').length; } catch (e) { out.structure = 'error ' + e.message; }
try { const d = document.createElement('div'); d.id = 'jx'; d.style.width = '300px'; d.style.height = '300px'; document.body.append(d); const b = OF.board('jx'); b.create('functiongraph', [x => x * x]); out.board = document.querySelectorAll('#jx svg').length; } catch (e) { out.board = 'error ' + e.message; } return out; })();</script>`;

let browser = null;
test.after(async () => { if (browser) await browser.close(); });
async function openFrame(init) {
  browser ||= await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--disable-gpu'] });
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const host = `<!doctype html><body style="margin:0"><iframe id="f" src="${HOST}/frame" sandbox="${SANDBOX}" style="width:1100px;height:900px;border:0"></iframe><script>window.__msgs=[];addEventListener('message',e=>{if(e.data&&e.data.brb===1)window.__msgs.push(e.data);});</script>`;
  const doc = frameDocument(GAME, { user: { displayName: 'P', avatar: 'x', lang: 'en' }, game: { id: 'g', title: 'T' }, save: {}, canSave: false, preview: true, ...init });
  const errors = [];
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u === `${HOST}/`) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: host });
    if (u === `${HOST}/frame`) return route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': frameCsp(HOST) }, body: doc });
    const p = new URL(u).pathname, f = figureFile(p) || (u.startsWith(HOST) ? vendorFile(u) : null);
    if (f) return route.fulfill({ status: 200, headers: { 'content-type': f.endsWith('.woff2') ? 'font/woff2' : 'text/javascript', 'access-control-allow-origin': '*', 'cross-origin-resource-policy': 'cross-origin' }, body: fs.readFileSync(f) });
    return route.abort();
  });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${HOST}/`);
  const frame = page.frames().find(f => f.url() === `${HOST}/frame`) || await (await page.waitForSelector('#f')).contentFrame();
  await frame.waitForSelector('.oc-fig svg');
  return { ctx, page, frame, errors };
}

test('the frame: the pinned figure libraries load under the CSP and draw; a figure question is answered with the keypad', { skip }, async () => {
  const { ctx, frame, errors } = await openFrame({ print: true, printKey: true });
  const extra = await frame.evaluate(() => window.__extra);
  assert.ok(extra.structure > 3, `SmilesDrawer drew (${extra.structure})`); assert.ok(extra.board >= 1, `JSXGraph drew (${extra.board})`);
  assert.equal(await frame.evaluate(() => typeof OF.draw), 'function');
  assert.ok(await frame.$eval('.oc-fig svg', s => s.querySelectorAll('polygon').length >= 2), 'the free-body figure');
  await frame.click('.oc-keybtn'); await frame.click('.oc-key:text-is("6")'); await frame.click('.oc-band .oc-primary');
  assert.match(await frame.textContent('.oc-fb'), /Right!/);
  assert.deepEqual(errors.filter(e => !/Failed to load resource/.test(e)), [], 'no errors, no CSP refusals');
  await ctx.close();
});
test('Print worksheet: numbers only to the page; the answer key option only with BRB.canPrintKey', { skip }, async () => {
  const t = await openFrame({ print: true, printKey: true });
  await t.frame.click('button[aria-controls="oc-print"]');
  assert.ok(await t.frame.isVisible('#oc-print'));
  await t.frame.click('#oc-print [aria-label="Fewer"]'); await t.frame.click('#oc-print .oc-tog:text("A4")'); await t.frame.click('#oc-print .oc-tog:has-text("answer key")');
  // the sheet number: tap it, then type another with the kit's keypad (the first digit starts a new number)
  await t.frame.click('.oc-keybtn'); await t.frame.click('#oc-print .oc-seed'); for (const d of '482') await t.frame.click(`.oc-key:text-is("${d}")`);
  assert.equal(await t.frame.textContent('#oc-print .oc-seed'), '482');
  await t.frame.click('#oc-print .oc-primary');
  await t.page.waitForFunction(() => window.__msgs.some(m => m.type === 'brb:print'));
  const m = (await t.page.evaluate(() => window.__msgs)).find(x => x.type === 'brb:print');
  assert.deepEqual(m.doc, { k: 'canvas', seed: 482, n: 2, paper: 'a4', key: true });
  await t.ctx.close();
  const s = await openFrame({ print: true });
  await s.frame.click('button[aria-controls="oc-print"]');
  assert.equal(await s.frame.$$eval('#oc-print .oc-tog', b => b.filter(x => /answer key/i.test(x.textContent)).length), 0, 'a student: no answer key option');
  await s.ctx.close();
  const n = await openFrame({});
  assert.equal(await n.frame.$$eval('button[aria-controls="oc-print"]', b => b.length), 0, 'no printing here: no button');
  await n.ctx.close();
});
test('the printed worksheet (print media): its own page(s), N questions with figures, then the answer key with N answers on a page of its own', { skip }, async () => {
  browser ||= await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--disable-gpu'] });
  const css = fs.readFileSync(path.join(ROOT, 'public/css/app.css'), 'utf8');
  for (const paper of ['a4', 'letter']) {
    for (const [key, want] of [[true, 3], [false, 0]]) {
      const html = canvasPrintHtml(GAME, { k: 'canvas', seed: 9, n: 3, paper, key }, { t: tFor('en'), dir: 'ltr', lang: 'en' });
      const ctx = await browser.newContext(), page = await ctx.newPage();
      await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body class="printing"><main>screen only</main><div id="print-area" class="print-area">${html}</div></body></html>`);
      await page.emulateMedia({ media: 'print' });
      assert.equal(await page.$eval('main', e => getComputedStyle(e).display), 'none', 'only the print area prints');
      assert.equal(await page.$$eval('.ocp-sheet .ocp-q', l => l.length), 3, 'N questions');
      assert.equal(await page.$$eval('.ocp-sheet .ocp-q svg', l => l.length), 3, 'each with its figure');
      assert.equal(await page.$$eval('.ocp-keylist > li', l => l.length), want, 'N answers in the key');
      if (key) {
        assert.equal(await page.$eval('.ocp-key', e => getComputedStyle(e).breakBefore), 'page', 'the key starts a page of its own');
        assert.deepEqual(await page.$$eval('.ocp-kans', l => l.map(x => x.textContent)), ['6 N', '11', 'A) real']);
      }
      assert.equal(await page.$eval('.ocp-q', e => getComputedStyle(e).breakInside), 'avoid', 'a question never splits across pages');
      assert.match(await page.textContent('.ocp-sheet'), /Name:.*Date:/s); assert.match(await page.textContent('.ocp-sheet'), /Sheet 9/);
      const pdf = await page.pdf({ preferCSSPageSize: true });
      const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
      const box = /\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)/.exec(pdf.toString('latin1'));
      assert.ok(pages >= (key ? 2 : 1), `${paper} key=${key}: ${pages} pages`);
      if (key) assert.ok(pages >= 2, 'the key is on a page of its own');
      if (box) assert.ok(paper === 'a4' ? Math.abs(+box[1] - 595.92) < 2 : Math.abs(+box[1] - 612) < 2, `${paper}: ${box[1]} x ${box[2]}`);
      await ctx.close();
    }
  }
});

test('the worksheet number line is Oomba Figures\' numberLine in print: the same ticks and numbers as before, one way to draw a line', async () => {
  const { lineData, LINE_FIGURES } = await import('../../server/services/canvas-print.js');
  const { figuresKit } = await import('../../server/services/figlibs.js');
  const data = { config: { lang: 'en', count: 2, purpose: ['screen', 'worksheet'] }, task: { title: 'Fractions on a line' },
    problems: [{ tool: 'numberline.point', at: [3, 4], lo: 0, hi: 2, sub: 4 }, { tool: 'numberline.jump', from: -2, by: [3, 2], lo: -3, hi: 2, sub: 2 }], gen: null, steps: {}, hints: {} };
  const page = `<title>Lines</title>\n${canvasTag()}\n<div id="oc-app"></div>\n<script type="application/json" id="oc-activity">\n${JSON.stringify(data)}\n</script>\n<script>Oc.activity(JSON.parse(document.getElementById('oc-activity').textContent));</script>`;
  for (const lang of ['en', 'de', 'ar']) {
    const html = canvasPrintHtml(page, { k: 'canvas', seed: 3, n: 2, paper: 'a4', key: false }, { t: tFor('en'), dir: 'ltr', lang });
    const lines = [...html.matchAll(/<div class="ocp-svg ocp-line">(<svg[\s\S]*?<\/svg>)<\/div>/g)].map(m => m[1]);
    assert.equal(lines.length, 2, 'each question draws its line');
    for (const s of lines) {
      assert.match(s, /class="of-fig of-numberLine of-print"/); assert.match(s, /width="360"/, '360 wide, as the old drawing');
      assert.doesNotMatch(s, /#1F9D63|#FFFDF2|of-end|of-graph|class="of-val"/, 'black on white, nothing marked: the student finds the point');
      assert.match(s, /aria-label="Figure \d"|aria-label="[^"]+"/);
    }
    const ticks = s => (/class="of-ticks">(.*?)<\/g>/.exec(s)[1].match(/<line /g) || []).length;
    const nums = s => [...s.matchAll(/class="of-num">(.*?)<\/g>/g)].map(m => [...m[1].matchAll(/>([^<]+)<\/text>/g)].map(x => x[1]).join('').replace(/\u200e/g, ''));   // Arabic: Intl's invisible left-to-right mark before a minus
    // the old drawer: (hi - lo) * sub + 1 ticks, a number under every whole from lo to hi
    const byTicks = Object.fromEntries(lines.map(s => [ticks(s), nums(s)]));
    assert.deepEqual(byTicks[9], ['0', '1', '2']); assert.deepEqual(byTicks[11], ['−3', '−2', '−1', '0', '1', '2'], 'a true minus sign');
  }
  assert.equal(LINE_FIGURES, '1.1.0'); assert.deepEqual(lineData({ lo: 0, hi: 2, sub: 4 }), { from: 0, to: 2, step: [1, 4], every: 4, values: false, size: 'large' });
  assert.equal(figuresKit(LINE_FIGURES).check('numberLine', lineData({ lo: -20, hi: 0, sub: 3 })).length, 0, 'the largest line a tool allows (60 ticks) draws');
  const src = fs.readFileSync(path.join(ROOT, 'server/services/canvas-print.js'), 'utf8');
  assert.doesNotMatch(src, /case 'line': \{/, 'no second number line drawer');
});
