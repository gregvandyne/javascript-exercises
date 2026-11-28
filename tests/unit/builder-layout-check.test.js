// The Builder's layout check (server/services/layout-check.js), run in a real browser on small fixture pages the way the
// playtest runs it in a game frame: overlapping buttons, a label that does not fit its button, a page wider than the
// screen and a too-small tap target are flagged with short, specific findings; a clean page and a toolbar row that
// scrolls sideways on purpose are not. Then an Oomba Canvas end card like the owner's (a fraction activity: Try new ones,
// Print worksheet, Back) at 390 px: flagged on 1.3.0, clean on 1.4.1. Also how the findings reach the model
// (autotest.js) and the sizes the playtest checks (snapshot.js). Skipped when no Chromium is installed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { layoutProblems, canvasToEnd } from '../../server/services/layout-check.js';
import { canvasTag } from '../../server/services/canvaskit.js';
import { buildReport } from '../../server/builder/autotest.js';
import { LAYOUT_VIEWS, VIEWS } from '../../server/services/snapshot.js';

const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
let chromium = null; try { ({ chromium } = await import('playwright-core')); } catch { /* not installed */ }
const skip = !chromium || (!exe && !process.env.PLAYWRIGHT_BROWSERS_PATH) ? 'needs Chromium' : false;
const BASE = 'http://layout.test';
const PUBLIC = path.resolve('public');

let browser;
test.before(async () => { if (!skip) browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] }); });
test.after(async () => { if (browser) await browser.close(); });

/** The findings for this page at this size. */
async function check(body, { width = 390, height = 844, minTap = 40, before, skipKit } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  await page.route(`${BASE}/**`, r => {
    const u = new URL(r.request().url());
    if (u.pathname === '/') return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font:16px sans-serif}button{min-height:48px;min-width:48px}a{display:inline-flex;align-items:center;min-height:48px;padding:0 12px}</style></head><body>${body}</body></html>` });
    const f = path.join(PUBLIC, u.pathname);
    if (!f.startsWith(PUBLIC + path.sep) || !fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
    return r.fulfill({ status: 200, headers: { 'content-type': f.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'font/woff2', 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) });
  });
  await page.goto(`${BASE}/`);
  if (before) await before(page);
  const out = await page.evaluate(layoutProblems, { minTap, skipKit });
  await ctx.close();
  return out;
}

test('a clean page has no findings', { skip }, async () => {
  assert.deepEqual(await check('<h1>Fractions</h1><p>Make 3/4.</p><div style="display:flex;flex-wrap:wrap;gap:8px"><button>Try new ones</button><button>Print worksheet</button><a href="#">Back</a></div>'), []);
  assert.deepEqual(await check('<h1>Fractions</h1><div style="display:flex;gap:8px"><button>Check</button><button>Hint</button></div>', { width: 1280, height: 800, minTap: 44 }), []);
});

test('overlapping buttons are flagged, by name', { skip }, async () => {
  const out = await check('<div style="position:relative;height:60px"><button style="position:absolute;left:10px;width:200px">Try new ones</button><button style="position:absolute;left:150px;width:200px">Print worksheet</button></div>');
  assert.ok(out.includes('the buttons "Try new ones" and "Print worksheet" overlap'), out.join(' | '));
});

test('a label that does not fit its button is flagged (spilling out, cut off, or "…"), and so is a clipped heading', { skip }, async () => {
  const spill = await check('<div style="display:flex;width:220px"><button style="flex:1 1 0;min-width:0;white-space:nowrap">Print worksheet please</button><button style="flex:1 1 0;min-width:0;white-space:nowrap">Back</button></div>');
  assert.ok(spill.some(s => /^the text of the button "Print worksheet please" does not fit in it \(\d+px wide, needs \d+px\)/.test(s)), spill.join(' | '));
  const dots = await check('<button style="width:90px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Try new ones</button>');
  assert.ok(dots.some(s => s.startsWith('the text of the button "Try new ones" does not fit')), dots.join(' | '));
  const head = await check('<h1 style="width:120px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:0">Common Denominator Builder</h1>');
  assert.ok(head.some(s => s.startsWith('the text of the heading or label "Common Denominator Builder" does not fit')), head.join(' | '));
});

test('a page wider than the screen, something off the edge, and a small tap target are flagged', { skip }, async () => {
  const wide = await check('<div style="width:600px;height:20px" id="board">x</div>');
  assert.ok(wide.some(s => s.startsWith('the page is wider than the screen and scrolls sideways (<div#board>')), wide.join(' | '));
  const off = await check('<button style="position:fixed;left:360px;top:10px;width:120px">Keypad</button>');
  assert.ok(off.includes('cut off at the screen edge: "Keypad"'), off.join(' | '));
  const small = '<button style="min-height:0;min-width:0;width:36px;height:36px">+</button><button style="min-height:0;min-width:0;width:42px;height:42px;margin-left:20px">-</button>';
  assert.deepEqual(await check(small), ['too small to tap (36x36px, needs 40): "+"'], 'on the phone a target needs 40 px');
  assert.equal((await check(small, { minTap: 44 })).length, 2, 'elsewhere 44');
});

test('a toolbar that scrolls sideways on purpose is not flagged, and nor is content passing under a sticky bar', { skip }, async () => {
  const row = `<div style="display:flex;gap:8px;overflow-x:auto;width:100%">${['New sheet', 'Print worksheet', 'Teacher', 'Keypad', 'Board mode'].map(t => `<button style="flex:none;white-space:nowrap;padding:0 24px">${t}</button>`).join('')}</div>`;
  assert.deepEqual(await check(row), []);
  const sticky = '<div style="height:2000px"><button style="margin-top:780px">Answer</button></div><footer style="position:sticky;bottom:0;background:#fff;height:90px"><button>Check</button></footer>';
  assert.deepEqual(await check(sticky), []);
});

// ---- Oomba Canvas: the owner's results card
const fractions = { config: { lang: 'en', support: 'own', supports: ['own'], count: 2, fresh: true, purpose: ['screen', 'worksheet', 'generator'] }, task: { title: 'Common Denominator Builder' },
  problems: [], gen: { tool: 'fractions.equiv', dens: [2, 3, 4], mult: [2, 3] }, steps: {}, hints: {} };
const canvasPage = v => `${canvasTag(v).replace('src="/', `src="${BASE}/`)}<script>window.BRB={user:{lang:'en',dir:'ltr'},theme:'light',canPrint:true,storage:{_:{},get(k){return this._[k]},set(k,v){this._[k]=v}},gameOver(){},back(){},print(){return {ok:true}}};</script>
<div id="oc-app"></div><script>window.addEventListener('load',()=>Oc.activity(${JSON.stringify(fractions)}))</script>`;
const toEnd = async page => { await page.waitForSelector('.oc-band .oc-primary'); assert.equal(await page.evaluate(canvasToEnd), true); };

test('Oomba Canvas end card at 390 px: 1.3.0\'s three buttons are flagged, 1.3.1\'s are clean (and at 1280)', { skip }, async () => {
  const old = await check(canvasPage('1.3.0'), { before: toEnd });
  assert.ok(old.some(s => /^the text of the button "🎲 Try new ones" does not fit|^the text of the button "🖨 Print worksheet" does not fit/.test(s)), old.join(' | '));
  assert.deepEqual(await check(canvasPage('1.4.1'), { before: toEnd }), []);
  assert.deepEqual(await check(canvasPage('1.3.0'), { before: toEnd, skipKit: true }), [], 'an activity on an older kit: the kit\'s own parts are not the model\'s to fix');
  assert.deepEqual(await check(canvasPage('1.4.1'), { before: toEnd, width: 1280, height: 800, minTap: 44 }), []);
  assert.deepEqual(await check(canvasPage('1.4.1'), { before: p => p.waitForSelector('.oc-band .oc-primary') }), [], 'the activity itself at 390');
  // 1.5.0 (the Crossword look) keeps 1.4.1's phone layout
  assert.deepEqual(await check(canvasPage('1.5.0'), { before: toEnd }), [], '1.5.0 end card at 390');
  assert.deepEqual(await check(canvasPage('1.5.0'), { before: toEnd, width: 1280, height: 800, minTap: 44 }), [], '1.5.0 end card at 1280');
  assert.deepEqual(await check(canvasPage('1.5.0'), { before: p => p.waitForSelector('.oc-band .oc-primary') }), [], '1.5.0: the activity itself at 390');
});
// 1.6.0 (the fourth audit): the stars chip and the sound switch in the strip, the theme's icon in the Now bar, a story
// line, the carried digit over its column and the stars on the end card all fit at 390 and 1280
// 1.6.1 (the fifth audit): the same, with the carry boxes over the columns (a new leading one too)
for (const KV of ['1.6.0', '1.6.1']) test(`Oomba Canvas ${KV} at 390 px and 1280: stars, the sound switch, the theme and a story fit, end card included`, { skip }, async () => {
  const farm = { config: { lang: 'en', support: 'guided', supports: ['guided', 'own'], count: 2, fresh: true, purpose: ['screen', 'worksheet', 'generator'] },
    task: { title: 'Farm Sums: Carry the Ten', say: 'Help the farmer pack the eggs.', theme: { icon: '🐔', cheers: ['Egg-cellent!'], end: 'Every crate of eggs is packed. Well done, farmer!' } },
    problems: [], gen: { tool: 'digits.add', digits: 3, regroup: 'all', story: 'The hens laid {a} eggs on Monday and {b} on Tuesday. How many eggs?' }, steps: {}, hints: {}, skill: { regroup: 'all', digits: 3 } };
  const page = canvasPage(KV).replace(JSON.stringify(fractions), JSON.stringify(farm)).replace('print(){return {ok:true}}', 'print(){return {ok:true}},sfx:{muted:false,play(){},mute(o){this.muted=o===undefined?!this.muted:!!o;return this.muted}}');
  const work = async p => { await p.waitForSelector('.oc-band .oc-primary'); await p.click('.oc-steps .oc-box'); for (const d of String(await p.evaluate(() => { const s = document.querySelector('.oc-steps li p').textContent.match(/(\d+) \+ (\d+)/); return +s[1] + +s[2]; }))) await p.keyboard.press(d); await p.waitForSelector('.oc-carry'); };
  assert.deepEqual(await check(page, { before: work }), [], 'the activity at 390, a carried digit showing');
  assert.deepEqual(await check(page, { before: work, width: 1280, height: 800, minTap: 44 }), [], 'and at 1280');
  assert.deepEqual(await check(page, { before: toEnd }), [], 'the end card with its stars at 390');
  assert.deepEqual(await check(page, { before: toEnd, width: 1280, height: 800, minTap: 44 }), [], 'and at 1280');
});

test('the findings reach the model as a playtest problem, size by size; the playtest checks a phone upright and a desktop first', () => {
  assert.deepEqual(LAYOUT_VIEWS.slice(0, 2), ['phone-portrait', 'desktop']);
  assert.deepEqual(LAYOUT_VIEWS.map(k => VIEWS.find(v => v.key === k)).slice(0, 2).map(v => [v.width, v.height]), [[390, 844], [1280, 800]]);
  const raw = { mode: 'autoplay', started: 'hook', startedAt: 1500, inputs: 40, playMs: 18000, errors: [], kitWarnings: [], events: [{ type: 'brb:score', score: 3, t: 4000 }], fps: 55,
    s0: { state: { scene: 'title' } }, s1: { state: { scene: 'play' } }, readings: [{ state: { scene: 'play', score: 3 }, nums: '3' }], s2: { state: { scene: 'play', score: 3 }, nums: '3' },
    shots: [{ at: 'start', moved: 0.4 }, { at: 'idle', moved: 0.01 }, { at: 'play', moved: 0.2 }],
    layout: [{ key: 'phone-portrait', label: 'Phone portrait', width: 390, height: 844, problems: ['the buttons "Try new ones" and "Print worksheet" overlap'] }, { key: 'desktop', label: 'Desktop', width: 1280, height: 800, problems: [] }] };
  const r = buildReport(raw, { html: '<script>BRB.score(1)</script>', version: 2 });
  assert.equal(r.clean, false);
  assert.deepEqual(r.issues.filter(i => i.key.startsWith('layout:')).map(i => [i.text, i.soft]), [['At 390px wide (phone portrait, 390x844): the buttons "Try new ones" and "Print worksheet" overlap.', false]]);
  assert.match(r.forModel, /checked the layout on a phone held upright \(390 px wide\), a desktop \(1280 px\)/);
});
