// "My worksheets" in the three games, in real Chromium (docs/decisions.md "My worksheets in Crossword, The Big Divide and
// Algebra Builder"): a teacher opens the list, opens a saved set in the game's editor (saving it again keeps its code),
// renames, duplicates, prints, copies its link and deletes one (with a confirm); the empty list points to making one;
// a student never sees the button. Crossword runs in the production game frame (the SDK's BRB.mySets and friends post
// brb:sets to a stand-in play page that keeps the sets); Arithmetic Lab and Algebra Builder run their built pages with
// BRB stubbed, as their own tests do. Screenshots of each list go to MY_SETS_SHOTS when it is set.
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
const G = await import('../../server/services/game-sets.js');
const SHOTS = process.env.MY_SETS_SHOTS || '';
let browser;
test.after(async () => { if (browser) await browser.close(); });
const launch = async () => {
  const { chromium } = await import('playwright-core');
  browser ||= await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] });
  return browser;
};
/** A set as GET /api/games/:id/sets lists it (the server's own label and size). */
const row = (slug, id, items, title = '', ago = 0) => ({ id, code: G.codeOf(id), title, label: G.labelOf(slug, items), n: G.sizeOf(slug, items), updated: Date.UTC(2026, 10, 20) - ago, items });
/** The stand-in for the server's list, rename, duplicate and delete (the browser side of it). */
const STORE_JS = `
function setsReply(d) {
  const S = window.__store;
  if (d.op === 'list') return { sets: JSON.parse(JSON.stringify(S)) };
  const i = S.findIndex(x => x.id === d.set);
  if (i < 0) return { error: 'none' };
  if (d.op === 'delete') { S.splice(i, 1); return { ok: true }; }
  if (d.op === 'rename') { if (/bitch/.test(d.title)) return { error: 'title' }; S[i].title = d.title; if (window.__slug === 'crossword') S[i].items[0].t = d.title; return { ok: true, title: d.title }; }
  const c = JSON.parse(JSON.stringify(S[i])); c.id = 's-dupe' + String(S.length).padStart(6, '0'); c.code = c.id.slice(2).toUpperCase();
  c.title = 'Copy of ' + (S[i].title || S[i].label); S.unshift(c);
  return { set: c.id, view: c };
}`;

// ---------------------------------------------------------------- Crossword (the production frame)
const CW_HTML = fs.readFileSync(path.join(ROOT, 'seed-games/crossword.html'), 'utf8');
const HOST = 'http://game.invalid';
const cwItems = (t, words) => G.cleanCrossItems([{ t, w: words, r: 4, b: true, h: true }]);
async function openCrossword({ sets = [], mySets = true, make = mySets, width = 1280 } = {}) {
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: SHOTS ? 2 : 1 });
  const doc = frameDocument(CW_HTML, { user: { displayName: 'T', avatar: 'x', lang: 'en', dir: 'ltr' }, game: { id: 'g', title: 'Crossword', url: `${HOST}/play/crossword` }, save: {}, canSave: true, tts: { langs: [] },
    canAssign: true, print: true, ...(mySets ? { mySets: true } : {}), ...(make ? { make: true } : {}) });
  const page = `<!doctype html><meta charset=utf-8><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style><iframe sandbox="${SANDBOX}" src="${HOST}/frame"></iframe>
<script>window.__msgs = []; window.__slug = 'crossword'; window.__store = ${JSON.stringify(sets)};${STORE_JS}
addEventListener('message', e => { const d = e.data; if (!d || d.brb !== 1) return; window.__msgs.push(d);
  const back = m => e.source.postMessage(Object.assign({ brb: 1 }, m), '*');
  if (d.type === 'brb:tts' && !d.pre) back({ type: 'brb:tts', id: d.id, ok: false, why: 'off' });
  if (d.type === 'brb:sets') back(Object.assign({ type: 'brb:sets-done', id: d.id }, setsReply(d)));
  if (d.type === 'brb:set-save') { const s = window.__store.find(x => x.id === d.set); if (s) s.items = d.items; back({ type: 'brb:set-saved', id: d.id, set: d.set || 's-newsetabcd' }); }
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
  await frame.waitForFunction(() => window.__brbTest && window.__brbTest.cwState, null, { timeout: 60_000 });
  const until = (fn, arg) => frame.waitForFunction(fn, arg, { timeout: 20_000 });
  const msgs = type => p.evaluate(t => window.__msgs.filter(m => m.type === t), type);
  const store = () => p.evaluate(() => window.__store);
  return { ctx, p, frame, until, msgs, store, errors };
}

test('Crossword: My worksheets lists the saved puzzles; open one, save it again under its code; rename, duplicate, print, copy, delete', { skip, timeout: 180_000 }, async () => {
  const A = 's-habitat234', B = 's-planets234';
  const g = await openCrossword({ sets: [
    row('crossword', A, cwItems('Habitats', [['habitat', 'where an animal lives'], ['predator', 'it hunts'], ['prey', 'it is hunted'], ['erosion', 'wearing away of land']]), 'Habitats'),
    row('crossword', B, cwItems('Planets', [['planet', 'a big round world'], ['moon', 'it goes around the Earth'], ['comet', 'ice with a tail']]), 'Planets', 86400e3),
  ] });
  try {
    await g.until(() => window.__brbTest.cwState().screen === 'home');
    await g.frame.click('#cw-ws');
    await g.until(() => window.__brbTest.cwState().sheets === 2);
    assert.equal(await g.frame.locator('.cw-sheet').count(), 2);
    const first = await g.frame.textContent(`[data-set="${A}"]`);
    assert.match(first, /Habitats/); assert.match(first, /Words: 4 · Nov\s20/); assert.match(first, /HABIT AT234/);
    // a quiet row: only Print and More beside it, and the row itself opens it
    assert.deepEqual(await g.frame.$$eval(`[data-set="${A}"] button:not([data-ws-open])`, l => l.map(b => b.getAttribute('aria-label'))), ['Print', 'More']);
    assert.equal(await g.frame.getAttribute(`[data-set="${A}"] [data-ws-more]`, 'aria-haspopup'), 'menu');
    if (SHOTS) await g.p.screenshot({ path: path.join(SHOTS, 'crossword-my-worksheets.png') });
    // More: a menu, in order; Escape closes it and the focus goes back to More; arrow keys move
    await g.frame.click(`[data-ws-more="${B}"]`);
    assert.deepEqual(await g.frame.$$eval('[role="menu"] [role="menuitem"]', l => l.map(b => b.textContent.trim())), ['🔑Print with answer key', '📋Copy link', '📑Duplicate', '🏷️Rename', '🗑️Delete']);
    assert.equal(await g.frame.evaluate(() => document.activeElement.dataset.wsKey), B, 'the first item has the focus');
    await g.p.keyboard.press('ArrowDown'); assert.equal(await g.frame.evaluate(() => document.activeElement.dataset.wsCopy), B);
    await g.p.keyboard.press('ArrowUp'); await g.p.keyboard.press('ArrowUp'); assert.equal(await g.frame.evaluate(() => document.activeElement.dataset.wsDel), B, 'it wraps around');
    if (SHOTS) await g.p.screenshot({ path: path.join(SHOTS, 'crossword-my-worksheets-menu.png') });
    await g.p.keyboard.press('Escape');
    assert.equal(await g.frame.locator('[role="menu"]').count(), 0);
    assert.equal(await g.frame.evaluate(() => document.activeElement.dataset.wsMore), B, 'focus back on More');
    assert.equal(await g.frame.getAttribute(`[data-ws-more="${B}"]`, 'aria-expanded'), 'false');
    // a click outside closes it too
    await g.frame.click(`[data-ws-more="${B}"]`); await g.frame.click('.cw-sub');
    assert.equal(await g.frame.locator('[role="menu"]').count(), 0);
    // Open: a click on the row (its meta line), the builder with its words, and saving keeps the same code
    await g.frame.click(`[data-set="${A}"] .cw-wsmeta`);
    await g.until(() => window.__brbTest.cwState().screen === 'build');
    assert.equal(await g.frame.inputValue('#cw-title'), 'Habitats');
    assert.equal((await g.frame.evaluate(() => window.__brbTest.cwState())).draftSet, A);
    await g.frame.fill('#cw-w0', 'habitats');
    await g.frame.click('#cw-makego');
    await g.until(() => window.__brbTest.cwState().screen === 'preview');
    await g.frame.click('#cw-save');
    await g.until(() => document.querySelector('#cw-classcode'));
    const saved = (await g.msgs('brb:set-save')).at(-1);
    assert.equal(saved.set, A, 'saved again under the same code'); assert.equal(saved.items[0].w[0][0], 'habitats');
    // back to the list: the change is there
    await g.frame.click('#cw-edit'); await g.frame.click('#cw-home');
    await g.until(() => document.querySelector('#cw-ws'));
    await g.frame.click('#cw-ws');
    await g.until(() => window.__brbTest.cwState().sheets === 2);
    // Print, and the answer key: the puzzle's own words and code
    await g.frame.click(`[data-ws-print="${B}"]`);
    let pr = (await g.msgs('brb:print')).at(-1).doc;
    assert.equal(pr.set, B); assert.equal(pr.key, false); assert.equal(pr.w.length, 3); assert.equal(pr.t, 'Planets');
    await g.frame.click(`[data-ws-more="${B}"]`); await g.frame.click(`[data-ws-key="${B}"]`);
    pr = (await g.msgs('brb:print')).at(-1).doc; assert.equal(pr.key, true);
    // Copy link
    await g.frame.click(`[data-ws-more="${B}"]`); await g.frame.click(`[data-ws-copy="${B}"]`);
    assert.equal(await g.frame.locator('[role="menu"]').count(), 0, 'a choice closes the menu');
    assert.equal(await g.frame.evaluate(() => document.activeElement.dataset.wsMore), B, 'and the focus is back on More');
    assert.equal((await g.msgs('brb:copy')).at(-1).text, `${HOST}/play/crossword?chapter=${B}&lock=1`);
    // Rename: a refused name says so; a good one shows
    await g.frame.click(`[data-ws-more="${B}"]`); await g.frame.click(`[data-ws-rename="${B}"]`);
    await g.frame.fill(`#cw-rename-${B}`, 'you bitch');
    await g.frame.click('#cw-rename-ok');
    await g.until(id => /isn't allowed/.test(document.querySelector(`[data-set="${id}"] .cw-wsmsg`).textContent), B);
    await g.frame.fill(`#cw-rename-${B}`, 'Space words');
    await g.frame.click('#cw-rename-ok');
    await g.until(id => /Space words/.test((document.querySelector(`[data-set="${id}"] .cw-wstitle`) || {}).textContent || ''), B);
    assert.deepEqual((await g.msgs('brb:sets')).filter(m => m.op === 'rename').at(-1), { brb: 1, type: 'brb:sets', id: (await g.msgs('brb:sets')).filter(m => m.op === 'rename').at(-1).id, op: 'rename', set: B, title: 'Space words' });
    // Duplicate: a copy at the top
    await g.frame.click(`[data-ws-more="${A}"]`); await g.frame.click(`[data-ws-dup="${A}"]`);
    await g.until(() => window.__brbTest.cwState().sheets === 3);
    assert.match(await g.frame.textContent('.cw-sheet:first-child'), /Copy of Habitats/);
    // Delete asks first; Keep keeps it, Delete deletes it
    await g.frame.click(`[data-ws-more="${A}"]`); await g.frame.click(`[data-ws-del="${A}"]`);
    assert.match(await g.frame.textContent('.cw-wsconfirm'), /Delete “Habitats”\? Its class code and link stop working/);
    await g.frame.click('#cw-ws-delno');
    assert.equal(await g.frame.locator('.cw-wsconfirm').count(), 0);
    assert.equal(await g.frame.evaluate(() => document.activeElement.dataset.wsMore), A, 'Keep it: back on More');
    await g.frame.click(`[data-ws-more="${A}"]`); await g.frame.click(`[data-ws-del="${A}"]`); await g.frame.click('#cw-ws-delyes');
    await g.until(() => window.__brbTest.cwState().sheets === 2);
    assert.equal(await g.frame.locator(`[data-set="${A}"]`).count(), 0);
    assert.ok(!(await g.store()).some(s => s.id === A), 'gone from the server');
    assert.equal((await g.msgs('brb:sets')).filter(m => m.op === 'delete').at(-1).set, A);
    // the puzzle's copy in Your crosswords went with it
    assert.equal((await g.frame.evaluate(() => window.__brbTest.cwState())).mine, 0);
    // all gone: the empty list points to making one
    for (const id of (await g.store()).map(s => s.id)) { await g.frame.click(`[data-ws-more="${id}"]`); await g.frame.click(`[data-ws-del="${id}"]`); await g.frame.click('#cw-ws-delyes'); await g.until(i => !document.querySelector(`[data-set="${i}"]`), id); }
    await g.until(() => document.querySelector('#cw-ws-empty'));
    assert.match(await g.frame.textContent('#cw-ws-empty'), /Nothing here yet/);
    await g.frame.click('#cw-ws-make');
    await g.until(() => window.__brbTest.cwState().screen === 'build');
    assert.deepEqual(g.errors, []);
  } finally { await g.ctx.close(); }
});

test('Crossword: My worksheets on a phone, with no sideways scroll', { skip, timeout: 120_000 }, async () => {
  const g = await openCrossword({ width: 375, sets: [row('crossword', 's-habitat234', cwItems('A rather long unit name for habitats and homes', [['habitat', 'where an animal lives'], ['predator', 'it hunts'], ['prey', 'it is hunted']]), 'A rather long unit name for habitats and homes')] });
  try {
    await g.until(() => window.__brbTest.cwState().screen === 'home');
    await g.frame.click('#cw-ws');
    await g.until(() => window.__brbTest.cwState().sheets === 1);
    for (const sel of ['[data-ws-print="s-habitat234"]', '[data-ws-more="s-habitat234"]']) {
      const r = await g.frame.locator(sel).boundingBox(); assert.ok(r.width >= 44 && r.height >= 44, sel + ' is a 44px target');
    }
    assert.equal(await g.frame.locator('[data-ws-open="s-habitat234"]').count(), 1);
    assert.ok(await g.frame.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('.cw-card')].every(c => c.scrollWidth <= c.clientWidth + 1)));
    if (SHOTS) await g.p.screenshot({ path: path.join(SHOTS, 'crossword-my-worksheets-phone.png') });
    await g.frame.click('[data-ws-more="s-habitat234"]');
    assert.ok(await g.frame.evaluate(() => { const r = document.querySelector('[role="menu"]').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }), 'the menu stays on the screen');
    if (SHOTS) await g.p.screenshot({ path: path.join(SHOTS, 'crossword-my-worksheets-phone-menu.png') });
    await g.frame.click('[data-ws-del="s-habitat234"]');
    assert.ok(await g.frame.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('.cw-card')].every(c => c.scrollWidth <= c.clientWidth + 1)));
  } finally { await g.ctx.close(); }
});

test('Crossword: a student (no BRB.canListSets) never sees My worksheets', { skip, timeout: 120_000 }, async () => {
  const g = await openCrossword({ mySets: false });
  try {
    await g.until(() => window.__brbTest.cwState().screen === 'home');
    assert.equal(await g.frame.locator('#cw-ws').count(), 0);
    assert.deepEqual(await g.msgs('brb:sets'), []);
  } finally { await g.ctx.close(); }
});

// ---------------------------------------------------------------- Arithmetic Lab and Algebra Builder (BRB stubbed)
/** A built Svelte game with BRB stubbed as a teacher's frame: the sets in a store (STORE_JS), save, print, copy. */
async function openBuilt(file, slug, { sets = [], mySets = true, saved = {}, width = 1280 } = {}) {
  const b = await launch();
  const html = fs.readFileSync(path.join(ROOT, 'seed-games', file), 'utf8');
  const ctx = await b.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: SHOTS ? 2 : 1, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', r => {
    const u = new URL(r.request().url());
    if (u.host !== 'game.test') return r.abort();
    if (u.pathname.startsWith('/vendor/')) return r.fulfill({ path: path.join(ROOT, 'public', u.pathname) });
    return r.fulfill({ contentType: 'text/html', body: html });
  });
  await page.addInitScript(([sets, slug, mySets, saved, store]) => {
    window.__slug = slug; window.__store = sets; window.__log = [];
    (0, eval)(store);
    const kept = { ...saved };
    // the SDK's answers (BRB.duplicateQuestionSet gives { id, set }, where the page's message has { set, view })
    const ask = (op, set, title) => { window.__log.push({ op, set, title }); const r = window.setsReply({ op, set, title }); return Promise.resolve(typeof r.set === 'string' ? { id: r.set, set: r.view } : r); };
    window.BRB = {
      questionSet: null, user: { isGuest: false, lang: 'en' }, gameUrl: 'http://game.test/play/' + slug, canAssign: true, assign: q => { window.__log.push({ op: 'assign', q }); return true; },
      storage: { get: k => kept[k] ?? null, set: (k, v) => { kept[k] = JSON.parse(JSON.stringify(v)); } },
      saveQuestionSet: (items, id, opts) => { window.__log.push({ op: 'save', items, id, title: opts && opts.title }); const s = window.__store.find(x => x.id === id); if (s) s.items = items; return Promise.resolve({ id: id || 's-newsetabcd' }); },
      findQuestionSet: () => Promise.resolve({ error: 'none' }),
      copy: what => { window.__log.push({ op: 'copy', what }); return Promise.resolve(true); },
      canPrint: true, print: doc => { window.__log.push({ op: 'print', doc }); return Promise.resolve({ ok: true }); },
      ...(mySets ? { canListSets: true, mySets: () => ask('list'), deleteQuestionSet: id => ask('delete', id), renameQuestionSet: (id, t) => ask('rename', id, t), duplicateQuestionSet: id => ask('duplicate', id) } : {}),
      gameOver: () => {},
    };
    window.__kept = kept;
  }, [sets, slug, mySets, saved, STORE_JS + '\nwindow.setsReply = setsReply;']);
  await page.goto('http://game.test/play');
  const log = op => page.evaluate(o => window.__log.filter(x => x.op === o), op);
  return { ctx, page, errors, log, store: () => page.evaluate(() => window.__store) };
}

test('Arithmetic Lab: My worksheets lists the saved activities; open one in the editor and save it under its code; rename, duplicate, print, copy, delete', { skip, timeout: 180_000 }, async () => {
  const A = 's-division23', B = 's-multiply23';
  const g = await openBuilt('arithmetic-lab.html', 'arithmetic-lab', { sets: [
    row('arithmetic-lab', A, [{ k: 'divide', p: [[84, 4], [96, 3], [125, 5]], l: 'guided' }], 'Week 3 division'),
    row('arithmetic-lab', B, [{ k: 'multiply', p: [[23, 4], [56, 7]], l: 'onMyOwn', m: 'area' }], '', 86400e3),
  ] });
  const { page } = g;
  try {
    await page.getByRole('button', { name: /I’m a teacher/ }).click();
    await page.locator('#bb-ws').click();
    await page.locator('[data-set]').first().waitFor();
    assert.equal(await page.locator('[data-set]').count(), 2);
    const a = await page.locator(`[data-set="${A}"]`).textContent();
    assert.match(a, /Week 3 division/); assert.match(a, /3 problems · Long division · Nov\s20/); assert.match(a, /DIVIS ION23/);
    assert.match(await page.locator(`[data-set="${B}"] .title`).textContent(), /Multiplication/, 'no name: the kind');
    assert.match(await page.locator(`[data-set="${B}"]`).textContent(), /2 problems · Multiplication \(Area model\) · Nov\s19/);
    // a quiet row: only Print and More beside it
    assert.deepEqual(await page.locator(`[data-set="${A}"] button:not([data-ws-open])`).evaluateAll(l => l.map(b => b.getAttribute('aria-label'))), ['Print worksheet: Week 3 division', 'More for Week 3 division']);
    assert.equal(await page.locator(`[data-ws-more="${A}"]`).getAttribute('aria-haspopup'), 'menu');
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'big-divide-my-worksheets.png') });
    // More: the menu in order, arrow keys move, Escape closes it with the focus back on More, a click outside too
    await page.locator(`[data-ws-more="${A}"]`).click();
    assert.deepEqual(await page.locator('[role="menu"] [role="menuitem"]').allTextContents().then(l => l.map(x => x.trim())), ['Print with answer key', 'Copy link', 'Duplicate', 'Rename', 'Delete']);
    assert.equal(await page.evaluate(() => document.activeElement.dataset.wsKey), A);
    await page.keyboard.press('ArrowUp'); assert.equal(await page.evaluate(() => document.activeElement.dataset.wsDel), A);
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); assert.equal(await page.evaluate(() => document.activeElement.dataset.wsCopy), A);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'big-divide-my-worksheets-menu.png') });
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('[role="menu"]').count(), 0);
    assert.equal(await page.evaluate(() => document.activeElement.dataset.wsMore), A);
    await page.locator(`[data-ws-more="${A}"]`).click(); await page.locator('.lede').click();
    assert.equal(await page.locator('[role="menu"]').count(), 0);
    // Print and the answer key: the activity's own problems, with its code
    await page.locator(`[data-ws-print="${A}"]`).click();
    let pr = (await g.log('print')).at(-1).doc;
    assert.deepEqual([pr.k, pr.p, pr.key, pr.set], ['divide', [[84, 4], [96, 3], [125, 5]], false, A]);
    await page.locator(`[data-ws-more="${B}"]`).click(); await page.locator(`[data-ws-key="${B}"]`).click();
    pr = (await g.log('print')).at(-1).doc; assert.equal(pr.key, true); assert.equal(pr.m, 'area');
    await page.locator(`[data-ws-more="${A}"]`).click(); await page.locator(`[data-ws-copy="${A}"]`).click();
    assert.equal((await g.log('copy')).at(-1).what, `http://game.test/play/arithmetic-lab?chapter=${A}&lock=1`);
    assert.equal(await page.locator('[role="menu"]').count(), 0, 'a choice closes the menu');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.wsMore), A, 'and the focus is back on More');
    // Rename: refused, then fine
    await page.locator(`[data-ws-more="${B}"]`).click(); await page.locator(`[data-ws-rename="${B}"]`).click();
    await page.locator(`#bb-rename-${B}`).fill('you bitch');
    await page.locator('#bb-rename-ok').click();
    await page.locator(`[data-set="${B}"] .problem`).waitFor();
    assert.match(await page.locator(`[data-set="${B}"] .problem`).textContent(), /isn’t allowed/);
    await page.locator(`#bb-rename-${B}`).fill('Area model practice');
    await page.locator('#bb-rename-ok').click();
    await page.locator(`[data-set="${B}"] .title`, { hasText: 'Area model practice' }).waitFor();
    // Duplicate: a copy on top
    await page.locator(`[data-ws-more="${A}"]`).click(); await page.locator(`[data-ws-dup="${A}"]`).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-set]').length === 3);
    assert.match(await page.locator('[data-set]').first().textContent(), /Copy of Week 3 division/);
    // Open: a click on the row (its meta line), the editor, with its problems and name; Save keeps the same code and sends the name
    await page.locator(`[data-set="${A}"] .meta`).click();
    await page.locator('input.title').waitFor();
    assert.equal(await page.locator('input.title').inputValue(), 'Week 3 division');
    await page.locator('input.title').fill('Week 3 long division');
    await page.locator('button.remove').nth(2).click();
    await page.getByRole('button', { name: /Save changes/ }).first().click();
    // students may already have it: the page's own dialog asks first (docs/decisions.md "Arithmetic Lab: the owner's playthrough")
    await page.locator('dialog.confirm[open]').getByRole('button', { name: 'Save for everyone' }).click();
    await page.waitForFunction(() => window.__log.some(x => x.op === 'save'));
    const sv = (await g.log('save')).at(-1);
    assert.equal(sv.id, A, 'saved again under the same code'); assert.equal(sv.title, 'Week 3 long division');
    assert.deepEqual(sv.items[0].p, [[84, 4], [96, 3]]);
    // back to Your activities (the opened one is there now), then My worksheets again
    await page.locator('button.back:visible, button.back-list:visible').first().click();
    await page.locator('.card', { hasText: 'Week 3 long division' }).waitFor();
    await page.locator('#bb-ws').click();
    await page.locator(`[data-set="${A}"]`).waitFor();
    // Delete asks first; Keep keeps it; Delete deletes it (and its activity in the list)
    await page.locator(`[data-ws-more="${A}"]`).click(); await page.locator(`[data-ws-del="${A}"]`).click();
    assert.match(await page.locator('.ask').textContent(), /Delete “Week 3 division”\? Its class code and link stop working/);
    await page.locator('#bb-ws-delno').click();
    assert.equal(await page.locator('.ask').count(), 0);
    assert.equal(await page.evaluate(() => document.activeElement.dataset.wsMore), A, 'Keep: back on More');
    await page.locator(`[data-ws-more="${A}"]`).click(); await page.locator(`[data-ws-del="${A}"]`).click(); await page.locator('#bb-ws-delyes').click();
    await page.waitForFunction(id => !document.querySelector(`[data-set="${id}"]`), A);
    assert.ok(!(await g.store()).some(s => s.id === A));
    const acts = await page.evaluate(() => window.__kept['box-by-box-activities-v1'] || []);
    assert.ok(!acts.some(x => x.setId === A), 'its activity went with it');
    for (const id of (await g.store()).map(s => s.id)) { await page.locator(`[data-ws-more="${id}"]`).click(); await page.locator(`[data-ws-del="${id}"]`).click(); await page.locator('#bb-ws-delyes').click(); await page.waitForFunction(i => !document.querySelector(`[data-set="${i}"]`), id); }
    await page.locator('#bb-ws-empty').waitFor();
    assert.match(await page.locator('#bb-ws-empty').textContent(), /Nothing here yet/);
    assert.deepEqual(g.errors, []);
  } finally { await g.ctx.close(); }
});

test('Arithmetic Lab: My worksheets on a phone, with no sideways scroll', { skip, timeout: 120_000 }, async () => {
  const A = 's-division23';
  const g = await openBuilt('arithmetic-lab.html', 'arithmetic-lab', { width: 375, sets: [row('arithmetic-lab', A, [{ k: 'divide', p: [[84, 4], [96, 3], [125, 5]], l: 'guided' }], 'A rather long name for the week 3 division practice')] });
  const { page } = g;
  try {
    await page.getByRole('button', { name: /I’m a teacher/ }).click();
    await page.locator('#bb-ws').click();
    await page.locator(`[data-set="${A}"]`).waitFor();
    for (const sel of [`[data-ws-print="${A}"]`, `[data-ws-more="${A}"]`]) {
      const r = await page.locator(sel).boundingBox(); assert.ok(r.width >= 44 && r.height >= 44, sel + ' is a 44px target');
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'big-divide-my-worksheets-phone.png') });
    await page.locator(`[data-ws-more="${A}"]`).click();
    assert.ok(await page.evaluate(() => { const r = document.querySelector('[role="menu"]').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }), 'the menu stays on the screen');
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'big-divide-my-worksheets-phone-menu.png') });
    assert.deepEqual(g.errors, []);
  } finally { await g.ctx.close(); }
});

test('Arithmetic Lab: a student\'s frame (no BRB.canListSets) has no My worksheets', { skip, timeout: 120_000 }, async () => {
  const g = await openBuilt('arithmetic-lab.html', 'arithmetic-lab', { mySets: false });
  try {
    await g.page.getByRole('button', { name: /I’m a teacher/ }).click();
    await g.page.getByRole('heading', { name: 'Your activities' }).waitFor();
    assert.equal(await g.page.locator('#bb-ws').count(), 0);
  } finally { await g.ctx.close(); }
});

// Algebra Builder's page is built from tools/algebra-builder (npm run build:algebra-builder). Until the committed page
// carries My question sets (a checkout without the vendored math field's built files can't build it), this test waits.
const AB_BUILT = fs.readFileSync(path.join(ROOT, 'seed-games/algebra-builder.html'), 'utf8').includes('My question sets');
test('Algebra Builder: My question sets lists the saved sets; open one and save it under its code; rename, duplicate, copy, delete', { skip: skip || (!AB_BUILT && 'seed-games/algebra-builder.html is not rebuilt yet'), timeout: 180_000 }, async () => {
  const A = 's-solveabc23', B = 's-factorab23';
  const g = await openBuilt('algebra-builder.html', 'algebra-builder', { sets: [
    row('algebra-builder', A, [{ a: 'solve', p: '2x+3=7', s: 'all', l: true }, { a: 'factor', p: 'x^2+3x+2', s: 'none', l: true }], 'Unit 2 warm-up'),
    row('algebra-builder', B, [{ a: 'multiply', p: '(x+2)(x+1)', s: 'all', l: false }], '', 86400e3),
  ] });
  const { page } = g;
  try {
    await page.getByRole('button', { name: /I’m a teacher/ }).click();
    await page.locator('#ab-my-sets').click();
    await page.locator('[data-set]').first().waitFor();
    assert.equal(await page.locator('[data-set]').count(), 2);
    assert.match(await page.locator(`[data-set="${A}"]`).textContent(), /Unit 2 warm-up[\s\S]*2 questions · Solve, Factor/);
    assert.match(await page.locator(`[data-set="${B}"] .title`).textContent(), /1 question/);
    assert.deepEqual(await page.locator(`[data-set="${A}"] button:not([data-ws-open])`).evaluateAll(l => l.map(b => b.getAttribute('aria-label'))), ['More for Unit 2 warm-up']);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'algebra-builder-my-question-sets.png') });
    await page.locator(`[data-ws-more="${A}"]`).click(); await page.locator(`[data-ws-copy="${A}"]`).click();
    assert.equal((await g.log('copy')).at(-1).what, `http://game.test/play/algebra-builder?chapter=${A}&lock=1`);
    await page.locator(`[data-ws-more="${B}"]`).click(); await page.locator(`[data-ws-rename="${B}"]`).click();
    await page.locator(`#ab-rename-${B}`).fill('Multiplying binomials');
    await page.locator('#ab-rename-ok').click();
    await page.locator(`[data-set="${B}"] .title`, { hasText: 'Multiplying binomials' }).waitFor();
    await page.locator(`[data-ws-more="${A}"]`).click(); await page.locator(`[data-ws-dup="${A}"]`).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-set]').length === 3);
    assert.match(await page.locator('[data-set]').first().textContent(), /Copy of Unit 2 warm-up/);
    // Open: the question set page with its questions; a change saves under the same code
    await page.locator(`[data-set="${A}"] .meta`).click();
    await page.getByRole('heading', { name: 'Question set' }).waitFor();
    assert.equal(await page.locator('.item').count(), 2);
    await page.getByRole('button', { name: 'Remove question 2' }).click();
    await page.getByRole('button', { name: 'Save changes' }).click();
    await page.waitForFunction(() => window.__log.some(x => x.op === 'save'));
    const sv = (await g.log('save')).at(-1);
    assert.equal(sv.id, A); assert.equal(sv.items.length, 1);
    await page.getByRole('button', { name: '← Back' }).click();
    await page.locator(`[data-ws-more="${A}"]`).click(); await page.locator(`[data-ws-del="${A}"]`).click();
    assert.match(await page.locator('.ask').textContent(), /Delete “Unit 2 warm-up”\?/);
    await page.locator('#ab-my-delno').click();
    await page.locator(`[data-ws-more="${A}"]`).click(); await page.locator(`[data-ws-del="${A}"]`).click(); await page.locator('#ab-my-delyes').click();
    await page.waitForFunction(id => !document.querySelector(`[data-set="${id}"]`), A);
    for (const id of (await g.store()).map(s => s.id)) { await page.locator(`[data-ws-more="${id}"]`).click(); await page.locator(`[data-ws-del="${id}"]`).click(); await page.locator('#ab-my-delyes').click(); await page.waitForFunction(i => !document.querySelector(`[data-set="${i}"]`), id); }
    await page.locator('#ab-my-empty').waitFor();
    assert.deepEqual(g.errors, []);
  } finally { await g.ctx.close(); }
});
