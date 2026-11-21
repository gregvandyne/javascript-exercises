// "My worksheets" in the three games, in real Chromium (docs/decisions.md "My worksheets in Crossword, The Big Divide and
// Algebra Builder"): a teacher opens the list, opens a saved set in the game's editor (saving it again keeps its code),
// renames, duplicates, prints, copies its link and deletes one (with a confirm); the empty list points to making one;
// a student never sees the button. Crossword runs in the production game frame (the SDK's BRB.mySets and friends post
// brb:sets to a stand-in play page that keeps the sets); The Big Divide and Algebra Builder run their built pages with
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
async function openCrossword({ sets = [], mySets = true, width = 1280 } = {}) {
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  const doc = frameDocument(CW_HTML, { user: { displayName: 'T', avatar: 'x', lang: 'en', dir: 'ltr' }, game: { id: 'g', title: 'Crossword', url: `${HOST}/play/crossword` }, save: {}, canSave: true, tts: { langs: [] },
    canAssign: true, print: true, ...(mySets ? { mySets: true } : {}) });
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
    assert.match(first, /Habitats/); assert.match(first, /Words: 4/); assert.match(first, /HABIT AT234/);
    if (SHOTS) await g.p.screenshot({ path: path.join(SHOTS, 'crossword-my-worksheets.png') });
    // Open: the builder with its words, and saving keeps the same code
    await g.frame.click(`[data-ws-open="${A}"]`);
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
    await g.frame.click(`[data-ws-key="${B}"]`);
    pr = (await g.msgs('brb:print')).at(-1).doc; assert.equal(pr.key, true);
    // Copy link
    await g.frame.click(`[data-ws-copy="${B}"]`);
    assert.equal((await g.msgs('brb:copy')).at(-1).text, `${HOST}/play/crossword?chapter=${B}&lock=1`);
    // Rename: a refused name says so; a good one shows
    await g.frame.click(`[data-ws-rename="${B}"]`);
    await g.frame.fill(`#cw-rename-${B}`, 'you bitch');
    await g.frame.click('#cw-rename-ok');
    await g.until(id => /isn't allowed/.test(document.querySelector(`[data-set="${id}"] .cw-wsmsg`).textContent), B);
    await g.frame.fill(`#cw-rename-${B}`, 'Space words');
    await g.frame.click('#cw-rename-ok');
    await g.until(id => /Space words/.test((document.querySelector(`[data-set="${id}"] .cw-name b`) || {}).textContent || ''), B);
    assert.deepEqual((await g.msgs('brb:sets')).filter(m => m.op === 'rename').at(-1), { brb: 1, type: 'brb:sets', id: (await g.msgs('brb:sets')).filter(m => m.op === 'rename').at(-1).id, op: 'rename', set: B, title: 'Space words' });
    // Duplicate: a copy at the top
    await g.frame.click(`[data-ws-dup="${A}"]`);
    await g.until(() => window.__brbTest.cwState().sheets === 3);
    assert.match(await g.frame.textContent('.cw-sheet:first-child'), /Copy of Habitats/);
    // Delete asks first; Keep keeps it, Delete deletes it
    await g.frame.click(`[data-ws-del="${A}"]`);
    assert.match(await g.frame.textContent('.cw-wsconfirm'), /Delete “Habitats”\? Its class code and link stop working/);
    await g.frame.click('#cw-ws-delno');
    assert.equal(await g.frame.locator('.cw-wsconfirm').count(), 0);
    await g.frame.click(`[data-ws-del="${A}"]`); await g.frame.click('#cw-ws-delyes');
    await g.until(() => window.__brbTest.cwState().sheets === 2);
    assert.equal(await g.frame.locator(`[data-set="${A}"]`).count(), 0);
    assert.ok(!(await g.store()).some(s => s.id === A), 'gone from the server');
    assert.equal((await g.msgs('brb:sets')).filter(m => m.op === 'delete').at(-1).set, A);
    // the puzzle's copy in Your crosswords went with it
    assert.equal((await g.frame.evaluate(() => window.__brbTest.cwState())).mine, 0);
    // all gone: the empty list points to making one
    for (const id of (await g.store()).map(s => s.id)) { await g.frame.click(`[data-ws-del="${id}"]`); await g.frame.click('#cw-ws-delyes'); await g.until(i => !document.querySelector(`[data-set="${i}"]`), id); }
    await g.until(() => document.querySelector('#cw-ws-empty'));
    assert.match(await g.frame.textContent('#cw-ws-empty'), /Nothing here yet/);
    await g.frame.click('#cw-ws-make');
    await g.until(() => window.__brbTest.cwState().screen === 'build');
    assert.deepEqual(g.errors, []);
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
