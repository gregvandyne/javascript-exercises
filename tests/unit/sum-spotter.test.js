// Sum Spotter (seed-games/sum-spotter.html): a math game on the Oomba Kit. A small group of numbers sits on stones in
// a pond and the player taps the one number that is the sum (later the product) of two OTHER numbers in the group.
// Checked here:
//   - the puzzle maker (the pure block between sum-spotter-core:begin and sum-spotter-core:end): thousands of puzzles
//     per level, each checked by a checker written here (not the game's): different whole numbers, exactly ONE way
//     any member is made from two others (for Mixed by plus or times), no member that is another doubled or squared,
//     the answer and pair it reports are that one way, sizes and ranges fit the level, the same seed makes the same
//     puzzle; the game's own checker agrees on groups written out here; stars and points;
//   - the file: the kit pinned and used the kit's way, kit roles not color codes, no timers of its own, the scanner
//     passes it, nothing from outside, no prices, and none of the inspiring puzzle's names;
//   - its words: every key in all 13 languages with the same placeholders, no dashes, plain digits; spoken lines;
//   - its registration: seeded, on the Learn shelf as math for grades 1 to 5, the migration, a cover and a share picture;
//   - the game in real Chromium inside the production game frame: a level played by taps (a wrong tap, hints, the
//     win and its one game-over message), Rush ending on its clock, Practice, Arabic and a 390 px phone.
// The play tests need a local Chromium; they are skipped when there is none.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LOCAL = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = process.env.BRB_CHROMIUM || LOCAL.find(f => fs.existsSync(f));
const skip = !exe && !process.env.PLAYWRIGHT_BROWSERS_PATH ? 'no Chromium on this machine' : false;
const { frameDocument, frameCsp, SANDBOX } = await import('../../server/services/frame.js');
const { vendorFile } = await import('../../server/services/snapshot.js');
const { scanVersion } = await import('../../server/services/scanner.js');
const { kitTag, kitPackTag } = await import('../../server/services/kit.js');
const lines = await import('../../server/services/tts-lines.js');
const { SHELF_INFO, LEARNING } = await import('../../server/learn.js');
const { SEED_GAMES } = await import('../../scripts/seed.js');
const { MIGRATIONS } = await import('../../server/db.js');
const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/sum-spotter.html'), 'utf8');
const META = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-games/sum-spotter.json'), 'utf8'));
const LANGS = ['en', 'en-GB', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'ru', 'ja', 'zh-Hant', 'ar', 'he'];

// The game's puzzle maker, run on its own (no DOM, no kit).
const C = (() => { const box = { window: {} }; vm.runInNewContext(/\/\* sum-spotter-core:begin \*\/([\s\S]*?)\/\* sum-spotter-core:end \*\//.exec(HTML)[1], box); return box.window.SumSpotterCore; })();
const I18N = (() => { const b = {}; vm.runInNewContext(HTML.slice(HTML.indexOf('// ==== I18N START ===='), HTML.indexOf('// ==== I18N END ====')) + '\nthis.I18N = I18N;', b); return b.I18N; })();
const LEVELS = JSON.parse(JSON.stringify(C.LEVELS));   // plain objects of this realm
const plain = x => JSON.parse(JSON.stringify(x));

// What this test knows about a fair group, written out here and never taken from the game.
const OPS = { add: (a, b) => a + b, mul: (a, b) => a * b };
const opsFor = L => (L.op === 'mix' ? ['add', 'mul'] : [L.op]);
/** Every (target, pair, op) in the group, by brute force over every target and every pair of two other members. */
function ways(values, ops) {
  const out = [];
  for (const op of ops) for (let t = 0; t < values.length; t++) for (let a = 0; a < values.length; a++) for (let b = a + 1; b < values.length; b++) {
    if (a === t || b === t) continue;
    if (OPS[op](values[a], values[b]) === values[t]) out.push({ t, a, b, op });
  }
  return out;
}
const lookalikes = (values, ops) => ops.some(op => values.some((v, i) => values.some((w, j) => i !== j && OPS[op](w, w) === v)));
const PER_LEVEL = 3000;

test('the levels ramp: sums to 10, 20, 50 and 100, then times, then mixed; groups of 4, then 5 and 6', () => {
  assert.deepEqual(LEVELS.map(L => L.id), ['add10', 'add20', 'add50', 'add100', 'times', 'mixed']);
  assert.deepEqual(LEVELS.map(L => L.op), ['add', 'add', 'add', 'add', 'mul', 'mix']);
  assert.deepEqual(LEVELS.map(L => L.size), [[4, 4], [4, 4], [5, 5], [5, 6], [4, 5], [5, 6]]);
  assert.deepEqual(LEVELS.slice(0, 4).map(L => L.add.max), [10, 20, 50, 100]);
  for (const L of LEVELS) assert.ok(L.rounds >= 6 && L.base > 0, L.id);
  for (let k = 1; k < 4; k++) assert.ok(LEVELS[k].base > LEVELS[k - 1].base, `${LEVELS[k].id} is worth more`);
  assert.equal(C.RUSH.secs, 60);
  assert.equal(C.rushLevel(0), 'add10'); assert.equal(C.rushLevel(999), 'mixed');
  for (const id of C.RUSH.ramp) assert.ok(C.level(id), id);
});

test(`every level, ${PER_LEVEL} puzzles: different numbers, exactly one answer, no look-alikes, sizes and ranges fit`, () => {
  for (const L of LEVELS) {
    const ops = opsFor(L), seen = new Set(), usedOps = new Set();
    let notBiggest = 0;
    for (let seed = 1; seed <= PER_LEVEL; seed++) {
      const p = plain(C.generate(L.id, seed));
      assert.ok(p && Array.isArray(p.values), `${L.id} seed ${seed}: a puzzle`);
      const v = p.values, n = v.length, at = `${L.id} seed ${seed} [${v}]`;
      assert.ok(n >= L.size[0] && n <= L.size[1], `${at}: size`);
      assert.ok(v.every(x => Number.isInteger(x) && x > 0), `${at}: whole numbers above zero`);
      assert.equal(new Set(v).size, n, `${at}: no duplicates`);
      const w = ways(v, ops);
      assert.equal(w.length, 1, `${at}: exactly one way (${JSON.stringify(w)})`);
      assert.ok(!lookalikes(v, ops), `${at}: no member is another doubled or squared`);
      assert.equal(p.answer, w[0].t, `${at}: the answer`); assert.deepEqual([...p.pair].sort(), [w[0].a, w[0].b].sort(), `${at}: the pair`);
      assert.equal(p.op, w[0].op, `${at}: the operation the question names`);
      usedOps.add(p.op);
      const c = L[p.op];
      assert.ok(v.every(x => x <= c.max), `${at}: at most ${c.max}`);
      if (p.op === 'add') assert.ok(v[p.answer] >= c.minT && v.every(x => x >= c.lo), `${at}: add ranges`);
      else assert.ok(v[p.pair[0]] >= 2 && v[p.pair[0]] <= c.fmax && v[p.pair[1]] >= 2 && v[p.pair[1]] <= c.fmax, `${at}: factors 2 to ${c.fmax}`);
      if (v.some(x => x > v[p.answer])) notBiggest++;
      seen.add([...v].sort((x, y) => x - y).join());
      // the game's own checker agrees
      assert.equal(C.check(v, ops), true, at);
      if (seed <= 50) assert.deepEqual(plain(C.generate(L.id, seed)), p, `${at}: the same seed, the same puzzle`);
    }
    assert.ok(seen.size >= (L.id === 'add10' ? 40 : L.id === 'add20' ? 500 : PER_LEVEL * 0.5), `${L.id}: varied groups (${seen.size})`);
    assert.ok(notBiggest > PER_LEVEL * 0.25, `${L.id}: the answer is often not the biggest stone (${notBiggest})`);
    assert.deepEqual([...usedOps].sort(), L.op === 'mix' ? ['add', 'mul'] : [L.op], `${L.id}: operations`);
  }
});

test('Rush: thousands of puzzles along the ramp are fair too, and puzzles are made fast', () => {
  for (let k = 0; k < C.RUSH.ramp.length; k++) for (let s = 1; s <= 300; s++) {
    const L = C.level(C.rushLevel(k)), p = plain(C.generate(L.id, s * 7919 + k));
    assert.equal(ways(p.values, opsFor(L)).length, 1); assert.ok(!lookalikes(p.values, opsFor(L)));
  }
  const t0 = performance.now();
  for (const L of LEVELS) for (let s = 1; s <= 200; s++) C.generate(L.id, s);
  const per = (performance.now() - t0) / (LEVELS.length * 200);
  assert.ok(per < 5, `${per.toFixed(2)} ms a puzzle`);
});

test('the checker on groups written out here', () => {
  const cases = [
    [[3, 5, 8, 1], ['add'], true, 'one way: 3 + 5 = 8'],
    [[3, 5, 8, 11], ['add'], false, 'two ways: 3 + 5 = 8 and 3 + 8 = 11'],
    [[2, 4, 7, 9], ['add'], false, '4 looks like 2 + 2'],
    [[2, 3, 5, 5], ['add'], false, 'a duplicate'],
    [[2, 3, 5, 0], ['add'], false, 'a zero'],
    [[2, 6, 12, 7], ['mul'], true, 'one way: 2 × 6 = 12'],
    [[2, 6, 12, 7], ['add', 'mul'], false, 'in Mixed, 12 also looks like 6 + 6'],
    [[3, 4, 7, 12], ['add'], true, 'plus only: 3 + 4 = 7'],
    [[3, 4, 7, 12], ['add', 'mul'], false, 'in Mixed, 3 × 4 = 12 is a second answer'],
  ];
  for (const [v, ops, want, why] of cases) {
    assert.equal(C.check(v, ops), want, why);
    if (!v.includes(0) && new Set(v).size === v.length) assert.equal(ways(v, ops).length === 1 && !lookalikes(v, ops), want, `this test agrees: ${why}`);
  }
});

test('stars and points: three for a clean pond, fewer with help; Rush stars by finds', () => {
  assert.equal(C.stars({ mistakes: 0, hints: 0 }), 3);
  assert.equal(C.stars({ mistakes: 1, hints: 0 }), 3);
  assert.equal(C.stars({ mistakes: 0, hints: 1 }), 2);
  assert.equal(C.stars({ mistakes: 3, hints: 1 }), 2);
  assert.equal(C.stars({ mistakes: 6, hints: 2 }), 1);
  assert.ok(C.score('add10', { clean: 8 }) > C.score('add10', { clean: 4, mistakes: 4 }));
  assert.ok(C.score('add10', { mistakes: 99, hints: 99 }) >= 20);
  assert.ok(C.score('mixed', { clean: 8 }) > C.score('add10', { clean: 8 }));
  assert.deepEqual([0, 1, 7, 8, 14, 15].map(C.rushStars), [0, 1, 1, 2, 2, 3]);
});

test('the file: the kit pinned and used the kit way, kit colors, the scan passes, nothing from outside, no prices', () => {
  const r = scanVersion(HTML);
  assert.equal(r.status, 'pass', JSON.stringify(r.issues));
  assert.ok(HTML.startsWith('<title>Sum Spotter</title>\n<style>'));
  assert.ok(HTML.includes(kitTag()), 'the kit, pinned with its integrity');
  assert.match(kitTag(), /\/1\.1\.6\//, 'the latest kit');
  assert.ok(HTML.includes(kitPackTag('dress')), 'dress');
  assert.match(HTML, /O\.game\(\{\s*api: 1, title: t\('title'\), subtitle: t\('tag'\)/);
  assert.match(HTML, /controls: 'none', camera: 'fixed'/);
  assert.match(HTML, /howTo: \[\{ icon: '\w+', text: t\('how1'\) \}, \{ icon: '\w+', text: t\('how2'\) \}, \{ icon: '\w+', text: t\('how3'\) \}\]/);
  for (const k of ['O.ui.root()', 'O.ui.announce', 'O.sfx(', 'O.color(', 'O.art.toCanvas(', 'O.icon(', 'w.win({ stars: stars, score: points', 'O.settings.reduced', 'O.time.real.after', 'BRB.storage']) assert.ok(HTML.includes(k), k);
  const own = HTML.replace(/<script src=[^>]+><\/script>/g, '');
  assert.doesNotMatch(own, /#[0-9a-fA-F]{3,8}\b(?![\w-])|rgba?\(|hsla?\(/, 'no color codes');
  assert.doesNotMatch(own, /setTimeout|setInterval|Date\.now|new Date/, 'the game clock and the kit\'s only');
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'sendBeacon', 'eval(', 'new Function', 'localStorage', 'speechSynthesis', '<img', 'url(']) assert.ok(!own.includes(bad), bad);
  assert.doesNotMatch(own, /—/, 'no em dashes');
  // an original game: never the inspiring puzzle's name or its author, and nothing is ever sold
  for (const s of [HTML, JSON.stringify(META)]) { assert.doesNotMatch(s, /kakooma|greg\s*tang/i); assert.doesNotMatch(s, /[$€£]\s?\d|\bprice|\bbuy\b|\bpurchase|\bsubscribe|\bupgrade/i); }
  // the pond and the sum read left to right in every language; the words follow the page
  assert.match(HTML, /pond\.dir = 'ltr'/); assert.match(HTML, /eq\.dir = 'ltr'/); assert.match(HTML, /ss\.dir = O\.dir/);
  assert.match(HTML, /\.ss-tool \{[^}]*min-height: 56px/);
});

test('the words: every key in all 13 languages, the same placeholders, plain digits, no dashes; the spoken lines are registered', () => {
  const keys = Object.keys(I18N.en);
  assert.ok(keys.length >= 40);
  const ph = s => (String(s).match(/\{\w+\}/g) || []).sort().join();
  for (const l of LANGS) {
    assert.ok(I18N[l], l);
    assert.deepEqual(Object.keys(I18N[l]).sort(), [...keys].sort(), `${l}: the same keys`);
    for (const k of keys) {
      assert.ok(typeof I18N[l][k] === 'string' && I18N[l][k].trim(), `${l}.${k}`);
      assert.equal(ph(I18N[l][k]), ph(I18N.en[k]), `${l}.${k}: placeholders`);
      assert.doesNotMatch(I18N[l][k], /[–—]/, `${l}.${k}: no dashes`);
      assert.doesNotMatch(I18N[l][k], /[٠-٩۰-۹]/, `${l}.${k}: Western digits`);
      if (!l.startsWith('en')) assert.ok(!['how1', 'how2', 'how3', 'tag', 'askAdd', 'askMul'].includes(k) || I18N[l][k] !== I18N.en[k], `${l}.${k}: translated`);
    }
  }
  // US spelling in English
  assert.doesNotMatch(JSON.stringify(I18N.en), /colour|favourite|practise|centre|organis/i);
  assert.match(I18N.ar.how1, /[؀-ۿ]/); assert.match(I18N.he.how1, /[֐-׿]/); assert.match(I18N.ru.how1, /[Ѐ-ӿ]/); assert.match(I18N.ja.how1, /[぀-ヿ]/);
  // every key the code names is in the table, and every key is used (by name, or a level's name and blurb)
  const code = HTML.slice(HTML.indexOf('// ==== I18N END ===='));
  const used = new Set([...code.matchAll(/\bt\('([A-Za-z_0-9]+)'(?!\s*\+)/g)].map(m => m[1]));
  for (const k of used) if (!/_$/.test(k)) assert.ok(k in I18N.en, `t('${k}')`);
  for (const k of keys) assert.ok(code.includes(`'${k}'`) || /^[LP]_/.test(k), `${k} is used`);
  for (const L of LEVELS) assert.ok(I18N.en['L_' + L.id] && I18N.en['P_' + L.id], L.id);
  // the AI voice: the title, the how-to cards and Pip's fixed lines, never a line with the stones' numbers
  assert.ok(lines.TTS_GAMES.has('sum-spotter'));
  for (const k of ['title', 'tag', 'how1', 'how2', 'how3', 'askAdd', 'askMul', 'right1', 'doneH']) assert.deepEqual(lines.allowedLine('sum-spotter', 'en', I18N.en[k]), { text: I18N.en[k], role: 'friendly' }, k);
  assert.ok(lines.allowedLine('sum-spotter', 'ja', I18N.ja.how2));
  for (const k of ['L_add10', 'pond', 'levels', 'hint']) assert.equal(lines.allowedLine('sum-spotter', 'en', I18N.en[k]), null, k);
});

test('registration: seeded, on the Learn shelf as math for grades 1 to 5, a migration, described in every language, with a cover', () => {
  assert.ok(SEED_GAMES.includes('sum-spotter'));
  assert.equal(SEED_GAMES.indexOf('sum-spotter'), SEED_GAMES.indexOf('sudoku') + 1, 'next to Sudoku');
  assert.equal(META.slug, 'sum-spotter'); assert.equal(META.title, 'Sum Spotter'); assert.equal(META.shelf, 'learn');
  assert.equal(META.players_max, 1); assert.equal(META.age_rating, 'everyone'); assert.equal(META.orientation, 'any'); assert.ok(META.icon && META.cover && META.notes.length > 800);
  assert.doesNotMatch(JSON.stringify(META), /—/, 'no em dashes');
  assert.deepEqual(SHELF_INFO['sum-spotter'], { subject: 'math', from: 1, to: 5 });
  assert.equal(LEARNING['sum-spotter'].key, 'sumSpotter'); assert.equal(LEARNING['sum-spotter'].level, 'Grades 1-5');
  const names = MIGRATIONS.map(m => m[0]), mi = names.indexOf('0082_sum_spotter_shelf');
  assert.ok(mi >= 0, 'its own migration'); assert.equal(mi, names.length - 1, 'numbered after the others');
  assert.ok(!MIGRATIONS.find(m => m[0] === '0062_game_shelf')[2].toString().includes('sum-spotter'), 'the old migration is untouched');
  for (const l of LANGS.filter(x => !x.startsWith('en'))) {
    assert.ok(META.l10n[l] && META.l10n[l].description && META.l10n[l].tags, `l10n ${l}`);
    assert.equal(META.l10n[l].title, I18N[l].title, `${l}: the same title as in the game`);
  }
  for (const l of LANGS.filter(x => x !== 'en-GB')) {
    const loc = JSON.parse(fs.readFileSync(path.join(ROOT, `server/i18n/locales/${l}.json`), 'utf8'));
    assert.ok(loc.learn.games.sumSpotter, `${l}: learn.games.sumSpotter`);
  }
  for (const f of ['public/covers/sum-spotter.jpg', 'public/og/sum-spotter.jpg', 'scripts/covers/sum-spotter.recipe.js']) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
});

// ---------------------------------------------------------------- the game in a browser
const HOST = 'http://game.invalid';
let browser;
test.after(async () => { if (browser) await browser.close(); });
/** The game in the production frame, on a stand-in for the play page that keeps the SDK's messages (window.__msgs). */
async function open({ width = 390, height = 844, lang = 'en', save = {}, touch = true } = {}) {
  const { chromium } = await import('playwright-core');
  browser ||= await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: touch });
  const doc = frameDocument(HTML, { user: { displayName: 'T', avatar: 'x', lang, dir: ['ar', 'he'].includes(lang) ? 'rtl' : 'ltr' }, game: { id: 'g', title: 'Sum Spotter' }, save, canSave: true, tts: { langs: [] } });
  const page = `<!doctype html><meta charset=utf-8><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style><iframe sandbox="${SANDBOX}" src="${HOST}/frame"></iframe>
<script>window.__msgs = []; addEventListener('message', e => { const d = e.data; if (!d || d.brb !== 1) return; window.__msgs.push(d);
  if (d.type === 'brb:tts' && !d.pre) e.source.postMessage({ brb: 1, type: 'brb:tts', id: d.id, ok: false, why: 'off' }, '*'); });</script>`;
  const outside = [];
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u === HOST + '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: page });
    if (u === HOST + '/frame') return route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': frameCsp(HOST) }, body: doc });
    const f = u.startsWith(HOST + '/vendor/') && vendorFile(u);
    if (f) return route.fulfill({ status: 200, headers: { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream', 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) });
    outside.push(u); return route.abort();
  });
  const p = await ctx.newPage();
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.goto(HOST + '/');
  const frame = p.frames().find(f => f.url() === HOST + '/frame');
  await frame.waitForFunction(() => window.__brbTest && window.__brbTest.pick && document.querySelector('.ok-title-screen .ok-hot'), null, { timeout: 60_000 });
  const state = () => frame.evaluate(() => window.__brbTest.state());
  const msgs = type => p.evaluate(t => window.__msgs.filter(m => m.type === t), type);
  const until = (fn, arg, timeout = 20_000) => frame.waitForFunction(fn, arg, { timeout });
  // the stones bob gently, so a tap does not wait for them to stand still
  const tapStone = i => frame.click(`.ss-stone[data-i="${i}"]`, { force: true });
  return { ctx, p, frame, state, msgs, until, errors, outside, tapStone };
}
const say = frame => frame.evaluate(() => document.querySelector('#ss-say').textContent);

test('play: the picker, a level by taps (a wrong tap, hints, Pip showing the pair), the win and one game-over message', { skip, timeout: 120_000 }, async () => {
  const g = await open();
  try {
    await g.frame.click('.ok-title-screen .ok-hot');
    await g.until(() => document.querySelector('.ok-modal .ok-hot, .ok-howto .ok-hot, .ok-card .ok-hot') || window.__brbTest.state().screen === 'pick');
    const cards = await g.frame.evaluate(() => [...document.querySelectorAll('.ok-howto, .ok-modal')].map(e => e.textContent).join(' '));
    for (const k of ['how1', 'how2', 'how3']) assert.ok(cards.includes(I18N.en[k]), `how-to card ${k}`);
    const go = await g.frame.$('.ok-modal .ok-hot, .ok-howto .ok-hot, .ok-card .ok-hot'); if (go) await go.click();
    await g.until(() => window.__brbTest.state().screen === 'pick');
    assert.deepEqual(await g.frame.evaluate(() => [...document.querySelectorAll('.ss-lv')].map(b => b.dataset.level)), LEVELS.map(L => L.id));
    assert.ok(await g.frame.$('#ss-rush')); assert.equal((await g.frame.$$('.ss-chip')).length, LEVELS.length);
    await g.frame.click('#lv-add10');
    await g.until(() => window.__brbTest.state().screen === 'play');
    let s = await g.state();
    assert.equal(s.values.length, 4); assert.equal(ways(s.values, ['add']).length, 1);
    assert.equal(await g.frame.evaluate(() => document.querySelector('.ss-pond').getAttribute('dir')), 'ltr');
    assert.equal(await say(g.frame), I18N.en.askAdd);
    // a wrong tap: a gentle nudge that names the number, counted
    const wrong = s.values.findIndex((_, i) => i !== s.answer);
    await g.tapStone(wrong);
    s = await g.state(); assert.equal(s.mistakes, 1);
    assert.equal(await say(g.frame), I18N.en.nopeAdd.replace('{x}', s.values[wrong]));
    // a second wrong tap: Pip shows the two numbers that are needed
    const wrong2 = s.values.findIndex((_, i) => i !== s.answer && i !== wrong);
    await g.tapStone(wrong2);
    s = await g.state(); assert.equal(s.hintStep, 2);
    assert.equal(await say(g.frame), I18N.en.lookPair.replace('{a}', s.values[s.pair[0]]).replace('{b}', s.values[s.pair[1]]));
    assert.equal(await g.frame.evaluate(() => document.querySelectorAll('.ss-stone.hint').length), 2);
    await g.tapStone(s.answer);
    await g.until(() => window.__brbTest.state().round === 1);
    // the next puzzle: a hint shows one of the two numbers, then the other
    await g.frame.click('#ss-hint');
    s = await g.state(); assert.equal(s.hints, 1); assert.equal(s.hintStep, 1);
    assert.equal(await say(g.frame), I18N.en.hint1.replace('{a}', s.values[s.pair[0]]));
    assert.equal(await g.frame.evaluate(() => document.querySelector('.ss-eq').textContent.replace(/\s/g, '')), `${s.values[s.pair[0]]}+?=?`);
    await g.frame.click('#ss-hint'); s = await g.state(); assert.equal(s.hints, 2);
    await g.tapStone(s.answer);
    await g.until(() => window.__brbTest.state().round === 2);
    // the rest, right first time
    await g.frame.evaluate(() => window.__brbTest.skipAnimations());
    for (let k = 2; k < 8; k++) { s = await g.state(); await g.tapStone(s.answer); }
    s = await g.state(); assert.equal(s.screen, 'won');
    assert.deepEqual({ ...s.lastWin, score: 0 }, { mode: 'level', id: 'add10', stars: 2, score: 0, mistakes: 2, hints: 2, clean: 6 });
    await g.until(() => window.__brbTest.state().kit === 'win', null, 30_000);
    const over = await g.msgs('brb:gameover');
    assert.equal(over.length, 1, 'one game-over message'); assert.equal(over[0].won, true); assert.equal(over[0].score, s.lastWin.score);
    assert.equal(s.best.add10.stars, 2);
    assert.deepEqual(g.errors, []); assert.deepEqual(g.outside, []);
  } finally { await g.ctx.close(); }
});

test('play: Rush ends on its clock, Practice has no end, Arabic mirrors the words and not the sum, a 390 px phone fits', { skip, timeout: 120_000 }, async () => {
  let g = await open({ width: 1280, height: 800, touch: false });
  try {
    await g.frame.evaluate(() => window.__brbTest.pick('rush', '', { seed: 99 }));
    await g.until(() => window.__brbTest.state().screen === 'play');
    await g.frame.evaluate(() => window.__brbTest.skipAnimations());
    for (let k = 0; k < 3; k++) { const s = await g.state(); await g.tapStone(s.answer); }
    let s = await g.state(); assert.equal(s.found, 3); assert.equal(s.mode, 'rush');
    assert.ok(s.left > 0 && s.left <= 60);
    // the clock runs on the game clock: it stands still in the pause screen
    await g.p.keyboard.press('p'); await g.p.waitForTimeout(300);
    const t0 = (await g.state()).left; await g.p.waitForTimeout(1600);
    assert.equal((await g.state()).left, t0, 'paused, the clock stands still');
    await g.p.keyboard.press('Escape'); await g.p.waitForTimeout(400);
    await g.frame.evaluate(() => window.__brbTest.setLeft(0.2));
    await g.until(() => window.__brbTest.state().kit === 'win', null, 30_000);
    s = await g.state(); assert.equal(s.lastWin.mode, 'rush'); assert.equal(s.lastWin.found, 3); assert.equal(s.rushBest, 3); assert.equal(s.lastWin.stars, 1);
    assert.equal((await g.msgs('brb:gameover')).length, 1);
    await g.ctx.close();
    // Practice: endless, no stars
    g = await open();
    await g.frame.evaluate(() => window.__brbTest.pick('practice', 'times', { seed: 4 }));
    await g.until(() => window.__brbTest.state().screen === 'play');
    await g.frame.evaluate(() => window.__brbTest.skipAnimations());
    for (let k = 0; k < 10; k++) { const p = await g.state(); assert.equal(p.op, 'mul'); await g.tapStone(p.answer); }
    s = await g.state(); assert.equal(s.screen, 'play'); assert.equal(s.found, 10); assert.equal((await g.msgs('brb:gameover')).length, 0);
    assert.equal(await say(g.frame), I18N.en.askMul);
    // a 390 px phone: the pond, the sum and the hint fit, nothing scrolls sideways, big targets
    await g.frame.evaluate(() => window.__brbTest.pick('level', 'mixed', { seed: 21 }));
    await g.until(() => window.__brbTest.state().screen === 'play');
    const fit = await g.frame.evaluate(() => { const r = document.querySelector('.ss-pond').getBoundingClientRect(), h = document.querySelector('#ss-hint').getBoundingClientRect(); return { left: r.left, right: r.right, bottom: h.bottom, vw: innerWidth, vh: innerHeight, sw: document.documentElement.scrollWidth }; });
    assert.ok(fit.left >= 0 && fit.right <= fit.vw && fit.bottom <= fit.vh && fit.sw <= fit.vw, JSON.stringify(fit));
    const sizes = await g.frame.evaluate(() => [...document.querySelectorAll('.ss-stone, .ss-tool, .ss-back')].map(b => { const r = b.getBoundingClientRect(); return Math.min(r.width, r.height); }));
    assert.ok(Math.min(...sizes) >= 44, `44 px targets (${Math.min(...sizes)})`);
    // stones inside the pond, not on top of each other
    const boxes = await g.frame.evaluate(() => { const p = document.querySelector('.ss-pond').getBoundingClientRect(); return [...document.querySelectorAll('.ss-stone')].map(b => { const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, d: r.width, inside: r.left >= p.left - 2 && r.right <= p.right + 2 && r.top >= p.top - 2 && r.bottom <= p.bottom + 2 }; }); });
    for (const b of boxes) assert.ok(b.inside, JSON.stringify(b));
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) assert.ok(Math.hypot(boxes[i].x - boxes[j].x, boxes[i].y - boxes[j].y) >= boxes[i].d * 0.95, `stones ${i} and ${j} apart`);
    assert.deepEqual(g.errors, []); assert.deepEqual(g.outside, []);
    await g.ctx.close();
    // Arabic: the words mirror, the pond and the sum do not, and the words are Arabic
    g = await open({ lang: 'ar' });
    await g.frame.evaluate(() => window.__brbTest.pick('level', 'add20', { seed: 8 }));
    await g.until(() => window.__brbTest.state().screen === 'play');
    assert.deepEqual(await g.frame.evaluate(() => [document.querySelector('.ss').dir, getComputedStyle(document.querySelector('.ss-pond')).direction, getComputedStyle(document.querySelector('.ss-eq')).direction, document.querySelector('#ss-hint').textContent.trim()]), ['rtl', 'ltr', 'ltr', I18N.ar.hint]);
    assert.equal(await say(g.frame), I18N.ar.askAdd);
    assert.deepEqual(g.errors, []);
  } finally { await g.ctx.close().catch(() => {}); }
});
