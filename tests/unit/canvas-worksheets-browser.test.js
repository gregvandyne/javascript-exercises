// "My worksheets" in a Builder-made classroom activity (Oomba Canvas 1.4.0, canvas/src/sets.js; docs/canvas-api.md
// "Worksheets"), in real Chromium, in the production game frame (frameDocument, its CSP and sandbox): a teacher saves
// the questions on screen as a worksheet, sees it as one quiet row (name, "5 questions · date", the class code chip),
// opens it (its questions on screen), prints it by its code, and uses the More menu (keyboard: arrows, Escape, focus
// back) for Copy link, Duplicate, Rename and Delete with its question; at 375 px it is in the Teacher menu and fits; a
// student never sees it, and a link with a worksheet plays exactly its questions. The SDK's calls post to a stand-in
// play page that keeps the sets. Screenshots go to CANVAS_WS_SHOTS when it is set.
// The tests need a local Chromium; they are skipped when there is none.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LOCAL = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', '/opt/pw-browsers/chromium'];
const exe = process.env.BRB_CHROMIUM || LOCAL.find(f => fs.existsSync(f) && fs.statSync(f).isFile());
const skip = !exe && !process.env.PLAYWRIGHT_BROWSERS_PATH ? 'no Chromium on this machine' : false;
const { frameDocument, frameCsp, SANDBOX } = await import('../../server/services/frame.js');
const { vendorFile } = await import('../../server/services/snapshot.js');
const { canvasTag } = await import('../../server/services/canvaskit.js');
const SHOTS = process.env.CANVAS_WS_SHOTS || '';
let browser;
test.after(async () => { if (browser) await browser.close(); });
const launch = async () => {
  const { chromium } = await import('playwright-core');
  browser ||= await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] });
  return browser;
};

// A Builder classroom activity as the starter makes it (server/builder/templates/canvas.html), on 1.4.0, for a worksheet
// and a generator: column addition, a fresh set of 5 from the generator.
const DATA = {
  config: { lang: 'en', support: 'guided', supports: ['guided'], count: 5, fresh: true, board: false, purpose: ['screen', 'worksheet', 'generator'] },
  task: { title: 'Adding 2-digit numbers', say: 'Add the two numbers.' },
  problems: [], gen: { tool: 'digits.add', digits: 2 }, steps: {}, hints: {},
};
const PAGE = `<title>Adding 2-digit numbers</title>\n${canvasTag()}\n<div id="oc-app"></div>\n<script type="application/json" id="oc-activity">\n${JSON.stringify(DATA)}\n</script>\n<script>Oc.activity(JSON.parse(document.getElementById('oc-activity').textContent));</script>`;
const HOST = 'http://game.invalid';
const SETS_JS = `
let n = 0;
const codeOf = id => id.slice(2, 7).toUpperCase() + ' ' + id.slice(7).toUpperCase();
const view = (id, items, title) => ({ id, code: codeOf(id), title, label: items.length + ' questions', n: items.length, updated: Date.UTC(2026, 10, 21) - (n * 86400e3), items });
function setsReply(d) {
  const S = window.__store;
  if (d.op === 'list') return { sets: JSON.parse(JSON.stringify(S)) };
  const i = S.findIndex(x => x.id === d.set);
  if (i < 0) return { error: 'none' };
  if (d.op === 'delete') { S.splice(i, 1); return { ok: true }; }
  if (d.op === 'rename') { if (/bitch/.test(d.title)) return { error: 'title' }; S[i].title = d.title; return { ok: true, title: d.title }; }
  const c = view('s-dupe' + String(++n).padStart(6, '0'), S[i].items, 'Copy of ' + (S[i].title || S[i].label)); S.unshift(c);
  return { set: c.id, view: c };
}
function saveReply(d) { const id = 's-saved' + String(++n).padStart(5, '0'); window.__store.unshift(view(id, d.items, d.title || '')); return { set: id }; }`;

async function openActivity({ init = {}, width = 1280, height = 900, sets = [], scale = 1 } = {}) {
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width, height }, deviceScaleFactor: scale });
  const doc = frameDocument(PAGE, { user: { displayName: 'T', avatar: 'x', lang: 'en', dir: 'ltr' }, game: { id: 'g', title: 'Adding', url: `${HOST}/play/adding-2-digit` }, save: {}, canSave: true, tts: { langs: [] }, ...init });
  const page = `<!doctype html><meta charset=utf-8><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style><iframe sandbox="${SANDBOX}" src="${HOST}/frame"></iframe>
<script>window.__msgs = []; window.__store = ${JSON.stringify(sets)};${SETS_JS}
addEventListener('message', e => { const d = e.data; if (!d || d.brb !== 1) return; window.__msgs.push(d);
  const back = m => e.source.postMessage(Object.assign({ brb: 1 }, m), '*');
  if (d.type === 'brb:tts' && !d.pre) back({ type: 'brb:tts', id: d.id, ok: false, why: 'off' });
  if (d.type === 'brb:sets') back(Object.assign({ type: 'brb:sets-done', id: d.id }, setsReply(d)));
  if (d.type === 'brb:set-save') back(Object.assign({ type: 'brb:set-saved', id: d.id }, saveReply(d)));
  if (d.type === 'brb:print') back({ type: 'brb:printed', id: d.id, ok: true });
  if (d.type === 'brb:copy') back({ type: 'brb:copied', id: d.id, ok: true });
});</script>`;
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u === HOST + '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: page });
    if (u === HOST + '/frame') return route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': frameCsp(HOST) }, body: doc });
    const f = u.startsWith(HOST + '/vendor/') && vendorFile(u);
    if (f) return route.fulfill({ status: 200, headers: { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream', 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) });
    return route.abort();
  });
  const p = await ctx.newPage();
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.goto(HOST + '/');
  const frame = p.frames().find(f => f.url() === HOST + '/frame');
  await frame.waitForFunction(() => window.__brbTest && window.__brbTest.state, null, { timeout: 60_000 });
  const until = (fn, arg) => frame.waitForFunction(fn, arg, { timeout: 20_000 });
  const msgs = type => p.evaluate(t => window.__msgs.filter(m => m.type === t), type);
  const store = () => p.evaluate(() => window.__store);
  const shot = async name => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, name) }); } };
  return { ctx, p, frame, until, msgs, store, errors, shot };
}
const TEACHER = { teach: true, mySets: true, print: true, printKey: true };

test('a teacher saves the questions on screen as a worksheet, and the list is one quiet row each: open, print, More', { skip, timeout: 180_000 }, async () => {
  const g = await openActivity({ init: TEACHER, scale: SHOTS ? 2 : 1 });
  try {
    const { frame, until, msgs, store } = g;
    const btn = frame.locator('.oc-tb .oc-tb-ws');
    assert.equal(await btn.textContent(), '📄 Worksheets'); assert.equal(await btn.getAttribute('aria-label'), 'My worksheets');
    await btn.click();
    await until(() => document.querySelector('#oc-ws') && !document.querySelector('#oc-ws').hidden && /No worksheets yet/.test(document.querySelector('#oc-ws').textContent));
    assert.equal(await btn.getAttribute('aria-expanded'), 'true');
    assert.equal(await frame.evaluate(() => document.activeElement.id), 'oc-ws-h', 'focus moves into the panel');
    const save = frame.locator('.oc-wssave button');
    assert.match(await save.textContent(), /Save as worksheet/);
    assert.match(await frame.locator('.oc-wssave').textContent(), /Saves the 5 questions on screen under a class code\./);
    await save.click();
    await until(() => document.querySelectorAll('.oc-wsr').length === 1);
    const sent = (await msgs('brb:set-save')).at(-1);
    assert.equal(sent.items.length, 5); assert.equal(sent.title, 'Adding 2-digit numbers'); assert.equal(sent.set, null);
    assert.ok(sent.items.every(it => it.tool === 'digits.add' && Number.isInteger(it.a) && Number.isInteger(it.b)), 'the problems only');
    assert.deepEqual(Object.keys(sent.items[0]).sort(), ['a', 'b', 'tool'], 'nothing about the student');
    assert.match(await frame.locator('.oc-wsmsg').textContent(), /^Saved\. Class code: SAVED 00001$/);
    // the row: bold name, one quiet line with the count and the date, the code as a chip, then only Print and More
    const row = frame.locator('.oc-wsr').first();
    assert.equal(await row.locator('.oc-wst').textContent(), 'Adding 2-digit numbers');
    assert.match(await row.locator('.oc-wsm').textContent(), /^5 questions · Nov \d{1,2}(, 2026)?SAVED 00001$/);
    assert.equal(await row.locator('.oc-wsc').textContent(), 'SAVED 00001');
    assert.deepEqual(await row.locator('.oc-wstools button').evaluateAll(bs => bs.map(b => b.getAttribute('aria-label'))), ['Print Adding 2-digit numbers', 'More for Adding 2-digit numbers']);
    // Print sends the worksheet's code, not its questions or a seed
    await row.locator('.oc-wsi').first().click();
    await until(() => /Print window is open|print/i.test(document.querySelector('.oc-wsmsg').textContent));
    const pr = (await msgs('brb:print')).at(-1).doc;
    assert.deepEqual(pr, { k: 'canvas', set: 's-saved00001', n: 5, paper: 'letter', key: false });
    // More: keyboard (Enter opens, arrows move, Escape closes and focus goes back)
    const more = row.locator('[aria-haspopup="menu"]');
    await more.focus(); await g.p.keyboard.press('Enter');
    await until(() => !!document.querySelector('.oc-wsmenu'));
    assert.equal(await more.getAttribute('aria-expanded'), 'true');
    assert.deepEqual(await frame.locator('.oc-wsmenu [role="menuitem"]').evaluateAll(bs => bs.map(b => b.textContent)), ['🔑Answer key', '🔗Copy link', '⧉Duplicate', '✏️Rename', '🗑Delete']);
    assert.equal(await frame.evaluate(() => document.activeElement.dataset.act), 'key', 'focus on the first item');
    await g.p.keyboard.press('ArrowUp');
    assert.equal(await frame.evaluate(() => document.activeElement.dataset.act), 'del', 'wraps to Delete (last, in red)');
    assert.match(await frame.evaluate(() => getComputedStyle(document.activeElement).color), /rgb\(161, 42, 32\)/);
    await g.p.keyboard.press('ArrowDown');
    assert.equal(await frame.evaluate(() => document.activeElement.dataset.act), 'key');
    if (SHOTS) await g.shot('canvas-worksheets-menu.png');
    await g.p.keyboard.press('Escape');
    await until(() => !document.querySelector('.oc-wsmenu'));
    assert.equal(await frame.evaluate(() => document.activeElement.getAttribute('aria-haspopup')), 'menu', 'focus back on More');
    assert.equal(await frame.locator('#oc-ws').isVisible(), true, 'Escape in the menu closes only the menu');
    // a click outside closes it too
    await more.click(); await until(() => !!document.querySelector('.oc-wsmenu'));
    await frame.locator('#oc-ws-h').click(); await until(() => !document.querySelector('.oc-wsmenu'));
    // Answer key
    await more.click(); await frame.locator('[data-act="key"]').click();
    await until(() => document.querySelectorAll('.oc-wsmenu').length === 0);
    assert.equal((await msgs('brb:print')).at(-1).doc.key, true);
    // Copy link: the worksheet's own link
    await more.click(); await frame.locator('[data-act="copy"]').click();
    await until(() => /Link copied\./.test(document.querySelector('.oc-wsmsg').textContent));
    assert.equal((await msgs('brb:copy')).at(-1).text, `${HOST}/play/adding-2-digit?chapter=s-saved00001&lock=1`);
    // Duplicate
    await more.click(); await frame.locator('[data-act="dup"]').click();
    await until(() => document.querySelectorAll('.oc-wsr').length === 2);
    assert.equal(await frame.locator('.oc-wsr').first().locator('.oc-wst').textContent(), 'Copy of Adding 2-digit numbers');
    // Rename (inline: Escape cancels, Enter saves; a name the filter refuses says so)
    const first = frame.locator('.oc-wsr').first();
    await first.locator('[aria-haspopup="menu"]').click(); await frame.locator('[data-act="rename"]').click();
    const box = frame.locator('.oc-wsren input');
    assert.equal(await frame.evaluate(() => document.activeElement.tagName), 'INPUT');
    await g.p.keyboard.press('Escape');
    await until(() => !document.querySelector('.oc-wsren'));
    await first.locator('[aria-haspopup="menu"]').click(); await frame.locator('[data-act="rename"]').click();
    await box.fill('bitch list'); await g.p.keyboard.press('Enter');
    await until(() => /That name isn't allowed/.test(document.querySelector('.oc-wsmsg').textContent));
    await box.fill('Unit 4 practice'); await g.p.keyboard.press('Enter');
    await until(() => [...document.querySelectorAll('.oc-wst')].some(b => b.textContent === 'Unit 4 practice'));
    assert.equal((await store())[0].title, 'Unit 4 practice');
    // Delete asks first; Keep it keeps it
    const renamed = frame.locator('.oc-wsr').first();
    await renamed.locator('[aria-haspopup="menu"]').click(); await frame.locator('[data-act="del"]').click();
    assert.match(await frame.locator('.oc-wsask').textContent(), /Delete “Unit 4 practice”\? Its class code and link stop working\./);
    assert.equal(await frame.evaluate(() => document.activeElement.textContent), 'Delete');
    await frame.locator('.oc-wsask button', { hasText: 'Keep it' }).click();
    assert.equal(await frame.locator('.oc-wsr').count(), 2);
    await renamed.locator('[aria-haspopup="menu"]').click(); await frame.locator('[data-act="del"]').click();
    await frame.locator('.oc-wsask .oc-wsdel').click();
    await until(() => document.querySelectorAll('.oc-wsr').length === 1);
    assert.deepEqual((await store()).map(s => s.id), ['s-saved00001']);
    // the whole row opens the worksheet on screen; the line under the controls says which; printing prints it
    const before = await frame.locator('#oc-taskline').textContent();
    await frame.locator('.oc-wsr .oc-wsm').click();
    await until(() => window.__brbTest.state().worksheet === 's-saved00001');
    assert.equal(await frame.locator('#oc-ws').isHidden(), true, 'the panel closes');
    assert.match(await frame.locator('.oc-wsbar').textContent(), /On screen: Adding 2-digit numbers\s*SAVED 00001/);
    const saved = (await store())[0].items[0];
    assert.equal(await frame.locator('#oc-taskline').textContent(), `Work out ${saved.a} + ${saved.b}.`, 'its first question');
    assert.ok(before);
    await frame.locator('button[aria-controls="oc-print"]').click();
    assert.match(await frame.locator('#oc-print').textContent(), /Prints worksheet SAVED 00001: 5 questions, with its class code\./);
    await frame.locator('#oc-print .oc-primary').click();
    await until(() => /print window/i.test(document.querySelector('#oc-print').textContent));
    assert.deepEqual((await msgs('brb:print')).at(-1).doc, { k: 'canvas', set: 's-saved00001', n: 5, paper: 'letter', key: false });
    // with a worksheet on screen, the panel says so instead of offering to save it again
    await frame.locator('.oc-tb .oc-tb-ws').click();
    await until(() => !!document.querySelector('.oc-wsnow'));
    assert.equal(await frame.locator('.oc-wssave').count(), 0);
    if (SHOTS) await g.shot('canvas-worksheets-list.png');
    // Escape closes the panel and focus goes back to its button; New set leaves the worksheet
    await frame.locator('#oc-ws-h').focus(); await g.p.keyboard.press('Escape');
    assert.equal(await frame.locator('#oc-ws').isHidden(), true);
    assert.equal(await frame.evaluate(() => document.activeElement.classList.contains('oc-tb-ws')), true);
    await frame.locator('.oc-tb button', { hasText: 'New set' }).click();
    await until(() => window.__brbTest.state().worksheet === null);
    assert.equal(await frame.locator('.oc-wsbar').isHidden(), true);
    assert.deepEqual(g.errors, []);
  } finally { await g.ctx.close(); }
});

test('the first screenshot: Save as worksheet and the list, with the More menu open (desktop)', { skip: skip || !SHOTS, timeout: 120_000 }, async () => {
  const items = n => Array.from({ length: n }, (_, i) => ({ tool: 'digits.add', a: 23 + i * 7, b: 45 + i }));
  const g = await openActivity({ init: TEACHER, scale: 2, sets: [
    { id: 's-c5exp1cm9h', code: 'C5EXP 1CM9H', title: 'Unit 4: adding with regrouping', label: '6 questions', n: 6, updated: Date.UTC(2026, 10, 21), items: items(6) },
    { id: 's-k7rq2mzt4w', code: 'K7RQ2 MZT4W', title: 'Warm-up, Monday', label: '5 questions', n: 5, updated: Date.UTC(2026, 10, 18), items: items(5) },
    { id: 's-p3hd8xna6v', code: 'P3HD8 XNA6V', title: 'Exit ticket', label: '3 questions', n: 3, updated: Date.UTC(2026, 10, 12), items: items(3) },
  ] });
  try {
    await g.frame.locator('.oc-tb .oc-tb-ws').click();
    await g.until(() => document.querySelectorAll('.oc-wsr').length === 3);
    await g.frame.locator('.oc-wsr').first().locator('[aria-haspopup="menu"]').click();
    await g.until(() => !!document.querySelector('.oc-wsmenu'));
    await g.shot('canvas-worksheets-desktop.png');
  } finally { await g.ctx.close(); }
});

test('the teacher bar stays on one line at 1280 and 1024 px wide, with My worksheets in it', { skip, timeout: 120_000 }, async () => {
  for (const width of [1280, 1024]) {
    const g = await openActivity({ init: TEACHER, width });
    try {
      const r = await g.frame.evaluate(() => {
        const bar = document.querySelector('.oc-tb'), kids = [...bar.children].filter(k => k.offsetParent);
        window.__w = [...document.querySelector(".oc-tb").children].map(k => k.className + ":" + Math.round(k.getBoundingClientRect().width)).join(" "); const mid = k => { const b = k.getBoundingClientRect(); return (b.top + b.bottom) / 2; };
        return { w: window.__w, tops: kids.map(mid).filter((m, i, a) => Math.abs(m - a[0]) > 4), mid: kids.map(mid), h: bar.getBoundingClientRect().height, last: kids.at(-1).className, page: document.scrollingElement.scrollWidth };
      });
      assert.equal(r.tops.length, 0, `${width}: one line (${JSON.stringify(r)})`);
      assert.match(r.last, /oc-tb-ws/); assert.ok(r.page <= width, `${width}: no sideways scroll`);
      assert.equal(await g.frame.locator('.oc-tb-ws').getAttribute('aria-label'), 'My worksheets', 'its full name for screen readers');
    } finally { await g.ctx.close(); }
  }
});

test('at 375 px: My worksheets is in the Teacher menu, the list fits with 44 px targets, and the menu stays on screen', { skip, timeout: 120_000 }, async () => {
  const items = Array.from({ length: 5 }, (_, i) => ({ tool: 'digits.add', a: 31 + i, b: 18 + i }));
  const g = await openActivity({ init: TEACHER, width: 375, height: 812, scale: SHOTS ? 2 : 1, sets: [
    { id: 's-c5exp1cm9h', code: 'C5EXP 1CM9H', title: 'Unit 4: adding with regrouping, a long name that has to fit', label: '5 questions', n: 5, updated: Date.UTC(2026, 10, 21), items },
    { id: 's-k7rq2mzt4w', code: 'K7RQ2 MZT4W', title: 'Warm-up', label: '5 questions', n: 5, updated: Date.UTC(2026, 10, 18), items },
  ] });
  try {
    const { frame, until } = g;
    assert.equal(await frame.locator('.oc-tb').isHidden(), true, 'no bar on a phone');
    await frame.locator('.oc-tbtn').click();
    await frame.locator('.oc-tmenu .oc-tmi', { hasText: 'My worksheets' }).click();
    await until(() => document.querySelectorAll('.oc-wsr').length === 2);
    await until(() => document.activeElement && document.activeElement.id === 'oc-ws-h');
    const fit = await frame.evaluate(() => ({ page: document.scrollingElement.scrollWidth, panel: document.querySelector('#oc-ws').getBoundingClientRect().right,
      small: [...document.querySelectorAll('#oc-ws button')].filter(b => b.offsetParent).map(b => b.getBoundingClientRect()).filter(r => r.width < 44 || r.height < 40).length,
      icons: [...document.querySelectorAll('.oc-wsi')].map(b => [Math.round(b.getBoundingClientRect().width), Math.round(b.getBoundingClientRect().height)]) }));
    assert.ok(fit.page <= 375, `no sideways scroll (${fit.page})`); assert.ok(fit.panel <= 375 - 14 + 1, `the card keeps its gutter (${fit.panel})`);
    assert.equal(fit.small, 0, 'every button is a big enough target');
    assert.ok(fit.icons.every(([w, h]) => w >= 44 && h >= 44), JSON.stringify(fit.icons));
    const t = await frame.locator('.oc-wst').first().evaluate(b => ({ w: b.scrollWidth > b.clientWidth, ellipsis: getComputedStyle(b).textOverflow }));
    assert.equal(t.ellipsis, 'ellipsis', 'a long name is cut with an ellipsis, on one line');
    await frame.locator('.oc-wsr').first().locator('[aria-haspopup="menu"]').click();
    const m = await frame.locator('.oc-wsmenu').evaluate(el => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, items: [...el.querySelectorAll('[role="menuitem"]')].map(b => b.getBoundingClientRect().height) }; });
    assert.ok(m.l >= 0 && m.r <= 375, JSON.stringify(m)); assert.ok(m.items.every(h => h >= 44));
    if (SHOTS) await g.shot('canvas-worksheets-375.png');
    assert.deepEqual(g.errors, []);
  } finally { await g.ctx.close(); }
});

test('a student never sees My worksheets, and a worksheet link plays exactly its questions; a deleted one says so', { skip, timeout: 120_000 }, async () => {
  const items = [{ tool: 'digits.add', a: 12, b: 34 }, { tool: 'digits.add', a: 56, b: 27 }, { tool: 'digits.add', a: 48, b: 19 }];
  const g = await openActivity({ init: { print: true, set: { id: 's-c5exp1cm9h', items, mine: false } } });
  try {
    const { frame } = g;
    assert.equal(await frame.locator('.oc-tb, .oc-tbtn, .oc-tb-ws, #oc-ws').count(), 0, 'no teacher controls, no list');
    const st = await frame.evaluate(() => window.__brbTest.state());
    assert.equal(st.problems, 3); assert.equal(st.worksheet, 's-c5exp1cm9h');
    assert.equal(await frame.locator('#oc-taskline').textContent(), 'Work out 12 + 34.');
    assert.equal(await frame.locator('.oc-strip button', { hasText: 'New sheet' }).count(), 0, 'no New sheet: the worksheet is the set');
    assert.equal(await frame.locator('.oc-wsbar').isHidden(), true, 'no note for a student');
    // printing it prints the worksheet by its code (a student gets no answer key)
    await frame.locator('button[aria-controls="oc-print"]').click();
    await frame.locator('#oc-print .oc-primary').click();
    await g.until(() => /print window/i.test(document.querySelector('#oc-print').textContent));
    assert.deepEqual((await g.msgs('brb:print')).at(-1).doc, { k: 'canvas', set: 's-c5exp1cm9h', n: 3, paper: 'letter', key: false });
    assert.deepEqual(g.errors, []);
  } finally { await g.ctx.close(); }
  const gone = await openActivity({ init: { set: { id: 's-c5exp1cm9h', missing: true } } });
  try {
    assert.match(await gone.frame.locator('.oc-wsbar').textContent(), /This worksheet isn't on Oomba any more\. Here are the activity's own questions\./);
    assert.equal((await gone.frame.evaluate(() => window.__brbTest.state())).problems, 5, 'the activity\'s own set');
  } finally { await gone.ctx.close(); }
  // a teacher without the list (a preview, or the page did not offer it) gets the controls but no My worksheets
  const prev = await openActivity({ init: { teach: true, print: true } });
  try { assert.equal(await prev.frame.locator('.oc-tb-ws, #oc-ws').count(), 0); } finally { await prev.ctx.close(); }
});
