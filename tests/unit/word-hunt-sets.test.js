// Word Hunt in Crossword's look, with a teacher's own words (docs/decisions.md "Word Hunt in Crossword's look, with your
// own words"): the game's puzzle code (seed-games/word-hunt.html word-hunt-core: the themes' generator unchanged, a
// teacher's list on a seeded grid, any script, the filler-letter blocklist), the question set's cleaner
// (services/game-sets.js cleanHuntItems), My worksheets' routes for word-hunt sets (owner only), the frame's flags,
// words from a PDF or Word file through Crossword's path (words only), and Print (services/word-hunt-print.js: the
// server makes the grid itself; the answer key for school staff only).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { reset, call, publish, official, kid, teacher, teacher2, mia, mum, boss, q, auth, config, cls } from './_live.js';
import * as G from '../../server/services/game-sets.js';
import * as D from '../../server/services/crossword-doc.js';
import * as WP from '../../server/services/word-hunt-print.js';
import { tFor } from '../../server/i18n/index.js';
import { makeDocx } from './_crossword-files.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/word-hunt.html'), 'utf8');
const core = () => {
  const box = { window: {} };
  vm.runInNewContext(HTML.slice(HTML.indexOf('/* word-hunt-core:begin */'), HTML.indexOf('/* word-hunt-core:end */')), box);
  return box.window.HuntCore;
};
const H = core();
/** A value from the game's own realm (node:vm), as plain data. */
const plain = v => JSON.parse(JSON.stringify(v));
const WORDS = ['habitat', 'predator', 'prey', 'erosion', 'ecosystem', 'food chain'];
const ITEM = { t: 'Habitats', w: WORDS, s: 0, d: 'medium', r: 4, b: true };
const lineOf = (grid, a, b) => H.cellsOf(a, b).map(([r, c]) => grid[r][c]).join('');

// ---------------------------------------------------------------- the puzzle code
test('core: the themes\' generator is the first Word Hunt\'s (the same seed gives the same grid, so daily puzzles stay)', () => {
  assert.deepEqual(plain(H.generatePuzzle('ocean', 'medium', 12345).grid), ['TZINIFBRCC', 'NGHDSBSEKL', 'OLVEAUHEEH', 'YEHDIBRFEG', 'TBCIOBIFIB', 'RIOEPLMULT', 'ZMWAVEPLDK', 'KNOBTSMHEY', 'JONNSIKTIQ', 'CEERSHARKN']);
  for (let seed = 1; seed < 60; seed++) for (const d of ['easy', 'medium', 'hard']) {
    const p = H.generatePuzzle(H.THEMES[seed % H.THEMES.length].id, d, seed), n = p.size;
    assert.equal(n, H.LEVELS[d].size);
    assert.equal(H.hasBlocked(p.grid.join(''), n), false, 'no blocked word in the filler');
    for (const w of p.words) assert.equal(H.findAll(p.grid.join(''), n, w.word).length, 1, w.word);
  }
});

test('core: a teacher\'s list on a seeded grid: every word where it says, the same options the same grid, the right directions', () => {
  const a = H.layout(WORDS, { s: 0, d: 'medium', r: 4 }), b = H.layout(WORDS, { s: 0, d: 'medium', r: 4 });
  assert.deepEqual(a, b, 'deterministic');
  assert.notDeepEqual(H.layout(WORDS, { s: 0, d: 'medium', r: 5 }).grid, a.grid, 'another seed, another layout');
  assert.equal(a.unplaced.length, 0); assert.equal(a.size, 10, 'Auto: the smallest grid that holds them');
  for (const w of a.words) assert.equal(lineOf(a.grid, w.start, w.end), H.letters(WORDS[w.i]).join(''), w.word);
  assert.equal(H.hasBlocked([].concat(...a.grid), a.size), false);
  for (const [d, allowed] of [['easy', ['E', 'S']], ['medium', ['E', 'S', 'SE']], ['hard', Object.keys(H.DIRS)]]) {
    for (let r = 1; r < 8; r++) for (const w of H.layout(WORDS, { s: 12, d, r }).words) assert.ok(allowed.includes(w.dir), `${d}: ${w.dir}`);
  }
  // a chosen size; a word too long for it is left out (the editor says so first)
  assert.equal(H.layout(WORDS, { s: 15, d: 'easy', r: 2 }).size, 15);
  const small = H.layout(['photosynthesis', 'cat', 'dog'], { s: 8, d: 'easy', r: 1 });
  assert.deepEqual(plain(small.unplaced), [0]);
  // a word inside another (CAT in CATERPILLAR) is fine
  const inside = H.layout(['cat', 'caterpillar', 'dog', 'bird'], { s: 0, d: 'hard', r: 3 });
  assert.equal(inside.unplaced.length, 0);
});

test('core: any script: Hebrew reads right to left, Japanese and Chinese fill with their own kind of letters, accents kept', () => {
  const he = H.layout(['שלום', 'בית', 'ספר', 'מורה'], { s: 0, d: 'easy', r: 2 });
  assert.equal(he.rtl, true);
  for (const w of he.words) { assert.ok(['W', 'S'].includes(w.dir), w.dir); assert.equal(lineOf(he.grid, w.start, w.end), w.letters.join('')); }
  for (const [list, re] of [[['ねこ', 'いぬ', 'さかな', 'うさぎ'], /^[぀-ゟ]$/], [['蘋果', '香蕉', '葡萄', '西瓜'], /^[一-鿿]$/], [['кошка', 'собака', 'рыба'], /^[Ѐ-ӿ]$/]]) {
    const L = H.layout(list, { s: 0, d: 'medium', r: 1 });
    assert.equal(L.unplaced.length, 0, list.join());
    for (const row of L.grid) for (const ch of row) assert.match(ch, re, `${list[0]}: ${ch}`);
  }
  const fr = H.layout(['école', 'élève', 'règle'], { s: 8, d: 'easy', r: 1 });
  assert.ok(fr.words.some(w => w.letters.includes('É')));
});

test('core: a pasted list: one word a line or with commas; a word and its definition gives the word; bad and twice-given words out', () => {
  assert.deepEqual(plain(H.parseList('Word, Definition\nhabitat - where an animal lives\ncat, dog; fish\nerosion,the wearing away of land\n1. photosynthesis\n• x\nbad1\nCat')),
    ['habitat', 'cat', 'dog', 'fish', 'erosion', 'photosynthesis']);
  assert.equal(H.parseList(Array.from({ length: 40 }, (_, i) => 'word' + 'abcdefghijklmnopqrstuvwxyz'[i % 26] + 'abcdefghijklmnopqrstuvwxyz'[Math.floor(i / 26)]).join('\n')).length, 25);
  assert.equal(H.okWord('a'), false); assert.equal(H.okWord('abcdefghijklmnop'), false, '16 letters'); assert.equal(H.okWord('food chain'), true);
});

// ---------------------------------------------------------------- the question set
test('cleanHuntItems: words and title through the text filter; sizes, directions and seed checked; old fields kept out', () => {
  assert.deepEqual(G.cleanHuntItems([ITEM]), [{ t: 'Habitats', w: WORDS, s: 0, d: 'medium', r: 4, b: true }]);
  assert.deepEqual(G.cleanHuntItems([{ w: ['cat', 'dog', 'fish'] }]), [{ t: '', w: ['cat', 'dog', 'fish'], s: 0, d: 'medium', r: 1, b: true }], 'defaults');
  assert.equal(G.cleanHuntItems([{ ...ITEM, b: false, extra: 1 }])[0].b, false);
  assert.equal(G.cleanHuntItems([{ ...ITEM, x: 'y' }])[0].x, undefined);
  for (const bad of [
    null, [], [ITEM, ITEM], [{ ...ITEM, w: ['cat', 'dog'] }], [{ ...ITEM, w: Array.from({ length: 26 }, (_, i) => 'cat' + 'abcdefghijklmnopqrstuvwxyz'[i]) }],
    [{ ...ITEM, w: ['cat', 'dog', 'cat'] }], [{ ...ITEM, w: ['cat', 'dog', 'c4t'] }], [{ ...ITEM, w: ['cat', 'dog', 'abcdefghijklmnop'] }], [{ ...ITEM, w: ['cat', 'dog', 7] }],
    [{ ...ITEM, w: ['cat', 'dog', 'shit'] }], [{ ...ITEM, t: 'call me at 555-123-4567' }], [{ ...ITEM, t: 'x'.repeat(61) }],
    [{ ...ITEM, s: 9 }], [{ ...ITEM, s: 8, w: ['cat', 'dog', 'ecosystems'] }], [{ ...ITEM, d: 'sideways' }],
  ]) assert.equal(G.cleanHuntItems(bad), null, JSON.stringify(bad).slice(0, 80));
  assert.equal(G.SET_GAMES.get('word-hunt'), G.cleanHuntItems);
  assert.equal(G.labelOf('word-hunt', [ITEM]), 'Habitats: word hunt, 6 words');
  assert.equal(G.sizeOf('word-hunt', [ITEM]), 6);
});

// ---------------------------------------------------------------- the routes
const WH = publish(official, '<!doctype html><title>t</title><p>wh</p>', { source: 'seed', slug: 'word-hunt', title: 'Word Hunt' });
const base = `/api/games/${WH.id}/sets`;
const save = async (items = [ITEM], user = teacher) => { const r = await call(base, { method: 'POST', body: { items }, user }); assert.equal(r.status, 200, r.text); return r.json.id; };
const frameInit = async (user = null) => {
  const page = await call('/play/word-hunt', { user });
  const frame = await call(/data-src="(\/frame\/[^"]+?)"/.exec(page.text)[1].replace(/&amp;/g, '&'), { user });
  return JSON.parse(/window\.__BRB_INIT__=(\{.*?\});<\/script>/.exec(frame.text)[1]);
};

test('routes: a teacher saves a word hunt (named after its title), lists, renames, duplicates and deletes their own; nobody else can', async () => {
  reset(); q.run('DELETE FROM game_sets');
  const id = await save();
  assert.equal((await call(base, { method: 'POST', body: { items: [{ ...ITEM, w: ['cat', 'dog', 'shit'] }] }, user: teacher })).json.code, 'bad', 'the text filter');
  const list = (await call(base, { user: teacher })).json.sets;
  assert.equal(list.length, 1); assert.equal(list[0].title, 'Habitats'); assert.equal(list[0].n, 6); assert.equal(list[0].label, 'Habitats: word hunt, 6 words');
  assert.deepEqual(list[0].items, [ITEM]);
  // a student with the code gets it to play
  const found = await call(`${base}/${id.slice(2)}`, { user: mia });
  assert.equal(found.status, 200); assert.deepEqual(found.json.items, [ITEM]);
  // owner only: anyone else's set is a 404, a guest 403, signed out 401, the grown-up fence 404
  assert.deepEqual((await call(base, { user: teacher2 })).json.sets, []);
  for (const [user, m, p, body] of [[teacher2, 'DELETE', `${base}/${id}`], [kid, 'POST', `${base}/${id}/rename`, { title: 'x' }], [teacher2, 'POST', `${base}/${id}/duplicate`, {}]]) {
    assert.equal((await call(p, { method: m, body, user })).status, 404, `${user.username} ${m} ${p}`);
  }
  assert.equal((await call(base, { user: auth.createGuest() })).status, 403);
  assert.equal((await call(base)).status, 401);
  assert.equal((await call(base, { user: mum })).status, 404);
  // rename: through the filter, and the puzzle's title changes too
  assert.equal((await call(`${base}/${id}/rename`, { method: 'POST', body: { title: 'shit list' }, user: teacher })).json.code, 'title');
  const rn = await call(`${base}/${id}/rename`, { method: 'POST', body: { title: 'Ecosystems' }, user: teacher });
  assert.equal(rn.status, 200); assert.equal(G.get(WH.id, id).items[0].t, 'Ecosystems');
  // duplicate: a copy under a new code, named "Copy of ..."
  const dup = await call(`${base}/${id}/duplicate`, { method: 'POST', body: {}, user: teacher });
  assert.equal(dup.status, 200); assert.notEqual(dup.json.id, id);
  assert.equal(dup.json.set.title, 'Copy of Ecosystems'); assert.equal(G.get(WH.id, dup.json.id).items[0].t, 'Copy of Ecosystems');
  assert.deepEqual(G.get(WH.id, dup.json.id).items[0].w, WORDS);
  // delete: the code stops working
  assert.equal((await call(`${base}/${id}`, { method: 'DELETE', user: teacher })).status, 200);
  assert.equal((await call(`${base}/${id.slice(2)}`, { user: mia })).status, 404);
  assert.equal((await call(base, { user: teacher })).json.sets.length, 1);
});

test('the frame: My worksheets and the answer key for school staff; document upload for grown-ups who may host with AI on; print for all', async () => {
  const was = config.anthropicKey; config.anthropicKey = 'test-key';
  try {
    const t = await frameInit(teacher);
    assert.equal(t.mySets, true); assert.equal(t.canAssign, true); assert.equal(t.print, true); assert.equal(t.clues, true);
    for (const u of [mia, kid, null]) {
      const f = await frameInit(u);
      assert.equal(f.mySets, undefined, u ? u.username : 'visitor'); assert.equal(f.canAssign, undefined); assert.equal(f.clues, undefined); assert.equal(f.print, true);
    }
    const m = await frameInit(mum);
    assert.equal(m.clues, undefined, 'the fence keeps a family grown-up from documents'); assert.equal(m.setSave, false); assert.equal(m.mySets, undefined);
  } finally { config.anthropicKey = was; }
  config.anthropicKey = '';
  try { assert.equal((await frameInit(teacher)).clues, undefined, 'no AI, no document upload'); } finally { config.anthropicKey = was; }
});

test('words from a document: Crossword\'s path, the words only (no clues), 2 to 15 letters; never for a kid or a family grown-up', async () => {
  const post = (user, body) => call(`/api/games/${WH.id}/words-from-doc`, { method: 'POST', body, user });
  const doc = makeDocx(['Unit 3', 'habitat - where an animal lives', 'predator: an animal that hunts others', 'photosynthesisprocess - too long for a grid', 'erosion - the wearing away of land', 'prey - hunted']);
  D.hooks.client = { messages: { create: async () => { throw new Error('the AI was asked'); } } };
  try {
    const r = await post(teacher, { kind: 'docx', data: doc.toString('base64') });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(r.json.words, [['habitat', ''], ['predator', ''], ['erosion', ''], ['prey', '']]);
    assert.equal((await post(kid, { kind: 'docx', data: doc.toString('base64') })).status, 403);
    assert.equal((await post(mum, { kind: 'docx', data: doc.toString('base64') })).status, 404);
    assert.equal((await call(`/api/games/${WH.id}/clues`, { method: 'POST', body: { words: ['cat'] }, user: teacher })).status, 404, 'no AI clues in a word hunt');
  } finally { D.hooks.client = undefined; }
});

// ---------------------------------------------------------------- print
test('print: the server makes the same grid the game shows, letters and all; only the words and options come from the game', () => {
  const r = WP.cleanHuntPrintDoc({ ...ITEM, key: false, set: '' });
  assert.equal(r.ok, true);
  const L = H.layout(WORDS, ITEM);
  assert.deepEqual(plain(r.doc.grid), plain(L.grid)); assert.equal(r.doc.size, L.size);
  assert.deepEqual(plain(r.doc.words.map(w => [w.word, w.start, w.end])), plain(L.words.map(w => [w.word, w.start, w.end])));
  for (const bad of [
    'x', [ITEM], { ...ITEM, grid: [['A']] }, { ...ITEM, w: ['cat', 'dog', 'shit'] }, { ...ITEM, t: 'see www.example.com' }, { ...ITEM, key: 'yes' },
    { ...ITEM, set: 'nope' }, { ...ITEM, r: 0 }, { ...ITEM, s: 7 }, { ...ITEM, note: 'x'.repeat(301) }, { ...ITEM, note: 5 },
  ]) assert.deepEqual(WP.cleanHuntPrintDoc(bad), { ok: false, code: 'bad' }, JSON.stringify(bad).slice(0, 60));
});

test('print: the page: title, Name and Date, the teacher\'s note, how the words run, the grid, the word list (or how many are hidden), the key', () => {
  const t = tFor('en');
  const { doc } = WP.cleanHuntPrintDoc({ ...ITEM, key: true, note: 'Use a <pencil>.\nCircle them.' });
  const html = WP.huntPrintHtml(doc, { t, code: 'ABCDE FGHIJ', link: 'https://x.test/play/word-hunt?chapter=s-abcdefghij&lock=1' });
  assert.match(html, /<h1 dir="auto">Habitats<\/h1>/); assert.match(html, /Name:/); assert.match(html, /Date:/);
  assert.match(html, /Use a &lt;pencil&gt;\.\nCircle them\./, 'escaped, line breaks kept');
  assert.match(html, /Words go across, down and diagonally\./);
  assert.equal((html.match(/class="whp-l"/g) || []).length, doc.size * doc.size * 2, 'every letter, on the puzzle and the key');
  assert.match(html, /Find these words/); for (const w of WORDS) assert.ok(html.includes(`${w}</li>`), w);
  assert.match(html, /Habitats: Answer key/); assert.equal((html.match(/class="whp-ring"/g) || []).length, WORDS.length);
  assert.ok(html.indexOf('whp-mine') < html.indexOf('whp-key'), 'the note on the puzzle'); assert.equal(html.split('Circle them').length, 2, 'never on the key');
  assert.match(html, /Class code: ABCDE FGHIJ/);
  const hidden = WP.huntPrintHtml(WP.cleanHuntPrintDoc({ ...ITEM, b: false }).doc, { t });
  assert.match(hidden, /Words hidden in the grid: 6\. Find them all!/); assert.doesNotMatch(hidden, /Find these words/); assert.doesNotMatch(hidden, /whp-key/);
  const he = WP.huntPrintHtml(WP.cleanHuntPrintDoc({ ...ITEM, w: ['שלום', 'בית', 'ספר'], t: '' }).doc, { t: tFor('he'), dir: 'rtl', lang: 'he' });
  assert.match(he, /dir="rtl"/); assert.match(he, /תפזורת/);
  assert.match(fs.readFileSync(path.join(ROOT, 'public/css/app.css'), 'utf8'), /\.whp-grid \.whp-l\{/);
});

test('print route: anyone may print a word hunt; only school staff get the answer key; a saved set\'s code in the footer', async () => {
  const post = (user, body) => call(`/api/games/${WH.id}/print`, { method: 'POST', body, user });
  const doc = { ...ITEM, key: false, set: '' };
  for (const u of [teacher, mia, kid, mum, null]) {
    const r = await post(u, { doc });
    assert.equal(r.status, 200, `${u ? u.username : 'visitor'}: ${r.text}`); assert.match(r.json.html, /whp-puzzle/); assert.doesNotMatch(r.json.html, /whp-key/);
  }
  assert.match((await post(teacher, { doc: { ...doc, key: true } })).json.html, /whp-key/);
  for (const u of [mia, kid, mum, null]) assert.equal((await post(u, { doc: { ...doc, key: true } })).status, 403);
  assert.equal((await post(teacher, { doc: { ...doc, w: ['cat', 'dog', 'shit'] } })).json.code, 'bad');
  const saved = G.save(WH.id, teacher.id, [ITEM], null, 'word-hunt');
  const s = await post(mia, { doc: { ...doc, set: saved.id } });
  const code = saved.id.slice(2).toUpperCase();
  assert.ok(s.json.html.includes(`Class code: ${code.slice(0, 5)} ${code.slice(5)}`));
  assert.ok(s.json.html.includes(`/play/word-hunt?chapter=${saved.id}&amp;lock=1`));
  void boss;
});

test('the page: Crossword\'s look and tools; the save key and its shape; read-aloud guarded; scoring; no browser dialogs', () => {
  assert.match(HTML, /family=Bricolage\+Grotesque/); assert.doesNotMatch(HTML, /oomba-kit/);
  assert.match(HTML, /radial-gradient\(var\(--dots\)/, 'the dotted mint board');
  assert.match(HTML, /saveKey: 'word-hunt-v1'/);
  for (const k of ['total: 0', 'puzzles: 0', 'solved: {}', 'best: { easy: null, medium: null, hard: null }', 'daily: { last: null, streak: 0, bestStreak: 0 }', 'relax: false', "difficulty: 'easy'", "theme: 'animals'", 'seenHelp: 0']) assert.ok(HTML.includes(k), k);
  assert.match(HTML, /B\.score\.submit\(save\.total, 'puzzle points'\)/); assert.match(HTML, /B\.gameOver\(\{ won: true, score: save\.total \}\)/);
  assert.match(HTML, /typeof BRB\.speak === 'function' \? BRB\.speak\(/);
  assert.doesNotMatch(HTML, /\b(confirm|alert|prompt)\(/); assert.doesNotMatch(HTML, /—/, 'no em dashes');
  for (const id of ['wh-make', 'wh-ws', 'wh-codein', 'wh-file', 'wh-shuffle', 'wh-save', 'wh-print', 'wh-print-key', 'wh-assign', 'wh-copy', 'wh-qr']) assert.ok(HTML.includes(`'${id}'`), id);
  // every language has the game's words
  const I18N = vm.runInNewContext(HTML.slice(HTML.indexOf('// ==== I18N START ===='), HTML.indexOf('// ==== I18N END ====')) + '\n;I18N', {});
  assert.deepEqual(Object.keys(I18N).sort(), ['ar', 'de', 'en', 'en-GB', 'es', 'fr', 'he', 'it', 'ja', 'nl', 'pt', 'ru', 'zh-Hant'].sort());
  const need = ['make', 'buildH', 'listH', 'sizeH', 'dirH', 'dir_hard', 'bankShow', 'unplaced', 'ws', 'wsEmpty', 'saved', 'assign', 'printKey', 'pickTheme', 'race', 'daily'];
  for (const L of Object.keys(I18N)) if (L !== 'en-GB') for (const k of need) assert.ok(I18N[L][k], `${L}.${k}`);
  for (const L of Object.keys(I18N)) for (const [k, v] of Object.entries(I18N[L])) assert.doesNotMatch(JSON.stringify(v), /crossword|crucigrama|mots croisés|kreuzwort|cruciverba|кроссворд|クロスワード|填字|תשבץ|متقاطعة/i, `${L}.${k}`);
});

test('assigning: Word Hunt is still a whole game a teacher may assign without a set, and with one (its set opens)', async () => {
  q.run('DELETE FROM class_lessons WHERE class_id=?', cls.id);
  const plain = await call('/api/teach/assign-game', { method: 'POST', body: { gameId: WH.id, classId: cls.id }, user: teacher });
  assert.equal(plain.status, 200, plain.text);
  q.run('DELETE FROM class_lessons WHERE class_id=?', cls.id);
  const id = G.save(WH.id, teacher.id, [ITEM], null, 'word-hunt').id;
  const withSet = await call('/api/teach/assign-game', { method: 'POST', body: { gameId: WH.id, classId: cls.id, opts: `chapter=${id}&lock=1` }, user: teacher });
  assert.equal(withSet.status, 200, withSet.text);
  const l = q.get('SELECT l.title FROM class_lessons cl JOIN lessons l ON l.id=cl.lesson_id WHERE cl.class_id=? AND cl.removed_at IS NULL', cls.id);
  assert.match(l.title, /Habitats: word hunt, 6 words/);
  assert.equal(G.OPEN_SET_GAMES.has('word-hunt'), true); assert.equal(G.OPEN_SET_GAMES.has('crossword'), false);
});
