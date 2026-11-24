// Word Hunt in real Chromium, in the production game frame (docs/decisions.md "Word Hunt in Crossword's look, with
// your own words"): the home (daily, levels, themes, Play), a real drag and a tap-tap on a theme's puzzle and the
// results card; a teacher makes a word hunt from a pasted list, previews it, tries another layout, saves it (a class
// code, the link, a QR code and Assign), then My worksheets: the list, Open and save under the same code, Print and the
// answer key, Copy link, Rename, Duplicate and Delete with its confirm; a student playing the saved set; a student never
// sees My worksheets; light and dark. The SDK's calls go to a stand-in play page that keeps the sets.
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
const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/word-hunt.html'), 'utf8');
const HOST = 'http://game.invalid';
let browser;
test.after(async () => { if (browser) await browser.close(); });
const row = (id, items, title = '', ago = 0) => ({ id, code: G.codeOf(id), title, label: G.labelOf('word-hunt', items), n: G.sizeOf('word-hunt', items), updated: Date.UTC(2026, 10, 20) - ago, items });
const hunt = (t, w, extra = {}) => G.cleanHuntItems([{ t, w, s: 0, d: 'medium', r: 4, b: true, ...extra }]);

async function openGame({ sets = [], init = {}, set = null, width = 1280, theme } = {}) {
  const { chromium } = await import('playwright-core');
  browser ||= await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const doc = frameDocument(HTML, { user: { displayName: 'T', avatar: 'x', lang: 'en', dir: 'ltr' }, game: { id: 'g', title: 'Word Hunt', url: `${HOST}/play/word-hunt` }, save: {}, canSave: true, tts: { langs: [] },
    ...(set ? { set } : {}), ...(theme ? { theme } : {}), ...init });
  const page = `<!doctype html><meta charset=utf-8><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style><iframe sandbox="${SANDBOX}" src="${HOST}/frame"></iframe>
<script>window.__msgs = []; window.__store = ${JSON.stringify(sets)};
function setsReply(d) {
  const S = window.__store;
  if (d.op === 'list') return { sets: JSON.parse(JSON.stringify(S)) };
  const i = S.findIndex(x => x.id === d.set);
  if (i < 0) return { error: 'none' };
  if (d.op === 'delete') { S.splice(i, 1); return { ok: true }; }
  if (d.op === 'rename') { if (/bitch/.test(d.title)) return { error: 'title' }; S[i].title = d.title; S[i].items[0].t = d.title; return { ok: true, title: d.title }; }
  const c = JSON.parse(JSON.stringify(S[i])); c.id = 's-dupe' + String(S.length).padStart(6, '0'); c.code = c.id.slice(2).toUpperCase();
  c.title = 'Copy of ' + (S[i].title || S[i].label); S.unshift(c);
  return { set: c.id, view: c };
}
addEventListener('message', e => { const d = e.data; if (!d || d.brb !== 1) return; window.__msgs.push(d);
  const back = m => e.source.postMessage(Object.assign({ brb: 1 }, m), '*');
  if (d.type === 'brb:tts' && !d.pre) back({ type: 'brb:tts', id: d.id, ok: false, why: 'off' });
  if (d.type === 'brb:sets') back(Object.assign({ type: 'brb:sets-done', id: d.id }, setsReply(d)));
  if (d.type === 'brb:set-save') { const s = window.__store.find(x => x.id === d.set); if (s) s.items = d.items; back({ type: 'brb:set-saved', id: d.id, set: d.set || 's-newsetabcd' }); }
  if (d.type === 'brb:set-find') back({ type: 'brb:set-found', id: d.id, set: 's-habitat234', items: ${JSON.stringify(hunt('Habitats', ['habitat', 'predator', 'prey', 'erosion']))} });
  if (d.type === 'brb:print') back({ type: 'brb:printed', id: d.id, ok: true });
  if (d.type === 'brb:copy') back({ type: 'brb:copied', id: d.id, ok: true });
});</script>`;
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u === HOST + '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: page });
    if (u === HOST + '/frame') return route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': frameCsp(HOST) }, body: doc });
    const f = u.startsWith(HOST + '/vendor/') && vendorFile(u);
    if (f) return route.fulfill({ status: 200, headers: { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) });
    return route.abort();
  });
  const p = await ctx.newPage();
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.goto(HOST + '/');
  const frame = p.frames().find(f => f.url() === HOST + '/frame');
  await frame.waitForFunction(() => window.__brbTest && window.__brbTest.whState, null, { timeout: 60_000 });
  const until = (fn, arg) => frame.waitForFunction(fn, arg, { timeout: 20_000 });
  const msgs = type => p.evaluate(t => window.__msgs.filter(m => m.type === t), type);
  const store = () => p.evaluate(() => window.__store);
  const st = () => frame.evaluate(() => window.__brbTest.state());
  const ws = () => frame.evaluate(() => window.__brbTest.whState());
  return { ctx, p, frame, until, msgs, store, st, ws, errors };
}

test('Word Hunt: the home, a theme\'s puzzle with a real drag and a tap-tap, a hint, pause, the results and the score', { skip, timeout: 180_000 }, async () => {
  const g = await openGame();
  try {
    assert.equal((await g.ws()).screen, 'home');
    assert.equal(await g.frame.locator('#wh-themes [data-theme]').count(), 14);
    assert.equal(await g.frame.locator('[data-diff]').count(), 3);
    for (const id of ['#wh-daily', '#wh-play', '#wh-race', '#wh-make', '#wh-codein']) assert.equal(await g.frame.locator(id).count(), 1, id);
    assert.equal(await g.frame.locator('#wh-ws').count(), 0, 'no My worksheets for a student');
    await g.frame.click('[data-theme="ocean"]'); await g.frame.click('[data-diff="medium"]');
    assert.equal(await g.frame.getAttribute('[data-theme="ocean"]', 'aria-pressed'), 'true');
    await g.frame.click('#wh-play');
    let s = await g.st();
    assert.deepEqual([s.screen, s.theme, s.difficulty, s.grid.length], ['play', 'ocean', 'medium', 10]);
    s = await g.frame.evaluate(() => window.__brbTest.start({ theme: 'space', difficulty: 'easy', seed: 3 }));
    const box = await g.p.locator('iframe').boundingBox();
    const at = async (r, c) => { const q = await g.frame.evaluate(([r, c]) => window.__brbTest.cellCenter(r, c), [r, c]); return { x: box.x + q.x, y: box.y + q.y }; };
    const [w1, w2] = s.words;
    const a = await at(...w1.start), b = await at(...w1.end);
    await g.p.mouse.move(a.x, a.y); await g.p.mouse.down();
    await g.p.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 }); await g.p.mouse.move(b.x, b.y, { steps: 4 }); await g.p.mouse.up();
    assert.equal((await g.st()).found, 1);
    assert.equal(await g.frame.locator('.wh-wchip.wh-found').count(), 1);
    const c = await at(...w2.start), d = await at(...w2.end);
    await g.p.mouse.click(c.x, c.y);
    assert.deepEqual((await g.st()).pending, w2.start);
    await g.p.mouse.click(d.x, d.y);
    assert.equal((await g.st()).found, 2);
    const h = await g.frame.evaluate(() => window.__brbTest.hint());
    assert.ok(s.words.map(w => w.word).includes(h.word)); assert.equal(await g.frame.locator('.wh-wchip.wh-hinted').count(), 1);
    // pause: the letters are hidden, the timer stops; P again resumes
    await g.frame.click('#wh-board'); await g.p.keyboard.press('p');
    assert.equal((await g.st()).paused, true); assert.equal(await g.frame.isVisible('#wh-pausecard'), true);
    assert.match(await g.frame.textContent('#wh-quit'), /Change theme/);
    await g.p.keyboard.press('p'); assert.equal((await g.st()).paused, false);
    s = await g.frame.evaluate(() => { const t = window.__brbTest; t.skipAnimations(true); return t.solveAll(); });
    assert.deepEqual([s.screen, s.done, s.stars], ['results', true, 2]);
    assert.equal(await g.frame.locator('#wh-resstars span').count(), 3);
    assert.equal(s.save.puzzles, 1); assert.equal(s.save.solved.space, 1);
    const over = await g.msgs('brb:gameover');
    assert.equal(over.length, 1); assert.equal(over[0].won, true); assert.equal(over[0].score, s.save.total);
    assert.ok((await g.msgs('brb:score')).some(m => m.label === 'puzzle points'));
    s = await g.frame.evaluate(() => window.__brbTest.next());
    assert.deepEqual([s.screen, s.found, s.theme], ['play', 0, 'space']);
    assert.deepEqual(g.errors, []);
  } finally { await g.ctx.close(); }
});

test('Word Hunt: a teacher makes a word hunt, previews, saves (code, link, QR, Assign); My worksheets: open, print, key, copy, rename, duplicate, delete', { skip, timeout: 240_000 }, async () => {
  const A = 's-habitat234', B = 's-planets234';
  const g = await openGame({ init: { canAssign: true, print: true, mySets: true }, sets: [
    row(A, hunt('Habitats', ['habitat', 'predator', 'prey', 'erosion']), 'Habitats'),
    row(B, hunt('Planets', ['mercury', 'venus', 'earth', 'mars'], { b: false, d: 'easy' }), 'Planets', 86400e3),
  ] });
  try {
    await g.frame.click('#wh-make');
    await g.until(() => window.__brbTest.whState().screen === 'build');
    await g.frame.fill('#wh-title', 'Ecosystems');
    await g.frame.fill('#wh-paste', 'habitat - where an animal lives\npredator, prey\nerosion\nc4t');
    await g.frame.click('#wh-addgo');
    assert.equal((await g.ws()).draft, 4);
    assert.equal(await g.frame.inputValue('#wh-w1'), 'predator');
    // too few words or a word too long for the chosen grid: the editor says so
    await g.frame.click('#wh-w0 ~ .wh-x');
    await g.frame.click('#wh-addw'); await g.frame.fill('#wh-w3', 'photosynthesis');
    await g.frame.click('#wh-size [data-v="8"]');
    await g.frame.click('#wh-makego');
    assert.match(await g.frame.textContent('#wh-buildmsg'), /too long for a 8 × 8 grid/);
    await g.frame.click('#wh-size [data-v="0"]'); await g.frame.click('#wh-dirs [data-v="hard"]');
    await g.frame.click('#wh-makego');
    await g.until(() => window.__brbTest.whState().screen === 'preview');
    const size = (await g.ws()).size;
    assert.equal((await g.ws()).unplaced, 0); assert.ok(size >= 12, 'Auto fits photosynthesis');
    assert.equal(await g.frame.locator('.wh-prevwords li').count(), 4);
    const before = await g.frame.textContent('.wh-letters');
    await g.frame.click('#wh-shuffle');
    assert.notEqual(await g.frame.textContent('.wh-letters'), before, 'another layout');
    // Print: puzzle or puzzle + key (a teacher)
    await g.frame.click('#wh-print'); await g.frame.click('#wh-print-key');
    let pr = (await g.msgs('brb:print')).at(-1).doc;
    assert.deepEqual([pr.t, pr.key, pr.d, pr.w.length], ['Ecosystems', true, 'hard', 4]); assert.equal(pr.grid, undefined, 'never letters from the game');
    await g.frame.fill('#wh-mine-note', 'Use a pencil.');
    await g.frame.click('#wh-print-puzzle');
    pr = (await g.msgs('brb:print')).at(-1).doc; assert.equal(pr.note, 'Use a pencil.'); assert.equal(pr.key, false);
    // Save and get a link
    await g.frame.click('#wh-save');
    await g.until(() => document.querySelector('#wh-classcode'));
    const saved = (await g.msgs('brb:set-save')).at(-1);
    assert.deepEqual(Object.keys(saved.items[0]).sort(), ['b', 'd', 'r', 's', 't', 'w']);
    assert.equal(saved.items[0].t, 'Ecosystems'); assert.equal(saved.items[0].d, 'hard');
    assert.ok(G.cleanHuntItems(saved.items), 'what the game saves, the server takes');
    assert.equal(await g.frame.textContent('#wh-classcode'), 'NEWSE TABCD');
    assert.match(await g.frame.inputValue('#wh-link'), /\/play\/word-hunt\?chapter=s-newsetabcd&lock=1$/);
    assert.equal(await g.frame.locator('#wh-qr').count(), 1); assert.equal(await g.frame.locator('#wh-assign').count(), 1);
    // the draft is in Your word hunts on the home
    await g.frame.click('#wh-edit'); await g.frame.click('#wh-home');
    await g.until(() => document.querySelector('#wh-mine'));
    assert.match(await g.frame.textContent('#wh-mine'), /Ecosystems/);
    // My worksheets
    await g.frame.click('#wh-ws');
    await g.until(() => window.__brbTest.whState().sheets === 2);
    assert.match(await g.frame.textContent(`[data-set="${A}"]`), /Habitats/); assert.match(await g.frame.textContent(`[data-set="${A}"]`), /HABIT AT234/);
    assert.deepEqual(await g.frame.$$eval(`[data-set="${A}"] button:not([data-ws-open])`, l => l.map(b => b.getAttribute('aria-label'))), ['Print', 'More']);
    await g.frame.click(`[data-ws-more="${B}"]`);
    assert.deepEqual(await g.frame.$$eval('[role="menu"] [role="menuitem"]', l => l.map(b => b.textContent.trim())), ['🔑Print with answer key', '📋Copy link', '📑Duplicate', '🏷️Rename', '🗑️Delete']);
    await g.p.keyboard.press('Escape');
    // Print and the key from the list
    await g.frame.click(`[data-ws-print="${B}"]`);
    pr = (await g.msgs('brb:print')).at(-1).doc;
    assert.deepEqual([pr.set, pr.key, pr.t, pr.b, pr.d], [B, false, 'Planets', false, 'easy']);
    await g.frame.click(`[data-ws-more="${B}"]`); await g.frame.click(`[data-ws-key="${B}"]`);
    assert.equal((await g.msgs('brb:print')).at(-1).doc.key, true);
    // Copy link
    await g.frame.click(`[data-ws-more="${B}"]`); await g.frame.click(`[data-ws-copy="${B}"]`);
    assert.match((await g.msgs('brb:copy')).at(-1).text, /\/play\/word-hunt\?chapter=s-planets234&lock=1$/);
    // Rename (the filter's no, then a yes)
    await g.frame.click(`[data-ws-more="${A}"]`); await g.frame.click(`[data-ws-rename="${A}"]`);
    await g.frame.fill(`#wh-rename-${A}`, 'bitch'); await g.p.keyboard.press('Enter');
    await g.until(id => /isn't allowed/.test((document.querySelector(`[data-set="${id}"] .wh-wsmsg`) || {}).textContent), A);
    await g.frame.fill(`#wh-rename-${A}`, 'Habitats 2'); await g.p.keyboard.press('Enter');
    await g.until(id => /Habitats 2/.test((document.querySelector(`[data-set="${id}"]`) || {}).textContent), A);
    // Duplicate
    await g.frame.click(`[data-ws-more="${A}"]`); await g.frame.click(`[data-ws-dup="${A}"]`);
    await g.until(() => window.__brbTest.whState().sheets === 3);
    assert.match(await g.frame.textContent('.wh-sheet'), /Copy of Habitats 2/);
    // Delete, with its confirm (Keep it first)
    await g.frame.click(`[data-ws-more="${B}"]`); await g.frame.click(`[data-ws-del="${B}"]`);
    assert.match(await g.frame.textContent('.wh-wsconfirm'), /class code and link stop working/);
    await g.frame.click('#wh-ws-delno'); assert.equal(await g.frame.locator('.wh-wsconfirm').count(), 0);
    await g.frame.click(`[data-ws-more="${B}"]`); await g.frame.click(`[data-ws-del="${B}"]`); await g.frame.click('#wh-ws-delyes');
    await g.until(() => window.__brbTest.whState().sheets === 2);
    assert.equal((await g.store()).some(s => s.id === B), false);
    // Open: the editor with its words; saving keeps the same code
    await g.frame.click(`[data-set="${A}"] .wh-wsmeta`);
    await g.until(() => window.__brbTest.whState().screen === 'build');
    assert.equal(await g.frame.inputValue('#wh-title'), 'Habitats 2'); assert.equal((await g.ws()).draftSet, A);
    await g.frame.fill('#wh-w0', 'habitats');
    await g.frame.click('#wh-makego'); await g.until(() => window.__brbTest.whState().screen === 'preview');
    await g.frame.click('#wh-save'); await g.until(() => document.querySelector('#wh-classcode'));
    const again = (await g.msgs('brb:set-save')).at(-1);
    assert.equal(again.set, A); assert.equal(again.items[0].w[0], 'habitats');
    assert.deepEqual(g.errors, []);
  } finally { await g.ctx.close(); }
});

test('Word Hunt: a student opens a saved word hunt (hidden list), finds the words, and finishes once; the empty list; dark', { skip, timeout: 180_000 }, async () => {
  const items = hunt('Planets', ['mercury', 'venus', 'earth', 'mars'], { b: false, d: 'easy' });
  const g = await openGame({ set: { id: 's-planets234', items, mine: false }, theme: 'dark', init: { print: true } });
  try {
    let s = await g.st();
    assert.equal(s.screen, 'play'); assert.equal(s.custom.set, 's-planets234'); assert.equal(s.custom.b, false);
    assert.equal(await g.frame.getAttribute('html', 'data-theme'), 'dark');
    assert.equal(await g.frame.locator('.wh-wchip').count(), 0, 'a hidden list shows nothing until found');
    assert.match(await g.frame.textContent('#wh-hiddenn'), /Still hidden: 4/);
    assert.equal(await g.frame.locator('#wh-printit').count(), 1);
    await g.frame.evaluate(() => window.__brbTest.select(...(x => [x.words[0].start, x.words[0].end])(window.__brbTest.state())));
    assert.equal(await g.frame.locator('.wh-wchip.wh-found').count(), 1);
    s = await g.frame.evaluate(() => { const t = window.__brbTest; t.skipAnimations(true); return t.solveAll(); });
    assert.equal(s.screen, 'results'); assert.equal(s.save.solved.own, 1);
    assert.equal((await g.msgs('brb:gameover')).length, 1);
    assert.match(await g.frame.textContent('#wh-next'), /Play again/);
    await g.frame.click('#wh-printit').catch(() => {});
    assert.deepEqual(g.errors, []);
  } finally { await g.ctx.close(); }
  const e = await openGame({ init: { canAssign: true, mySets: true } });
  try {
    await e.frame.click('#wh-ws');
    await e.until(() => document.querySelector('#wh-ws-empty'));
    assert.match(await e.frame.textContent('#wh-ws-empty'), /Make a word hunt and press “Save and get a link”/);
    // a class code: the set straight away
    await e.frame.click('#wh-ws-home');
    await e.frame.fill('#wh-codein', 'habit at234'); await e.frame.click('#wh-codego');
    await e.until(() => window.__brbTest.state().screen === 'play');
    assert.equal((await e.st()).custom.set, 's-habitat234');
  } finally { await e.ctx.close(); }
});
