// Crossword's Print (services/crossword-print.js, POST /api/games/:id/print, BRB.print; docs/decisions.md "Crossword:
// print a puzzle"). Checked here:
//   - the print request is plain data and is checked part by part: unknown keys, a huge or malformed request, a layout
//     that doesn't spell its words or runs off the grid, a word used twice, and any word, clue or title the site's text
//     filter refuses are all turned down; what the game sends for a real layout passes;
//   - the clue numbers are counted on the server, in reading order, and match the game's own (crossword-core);
//   - the printable page: the title, Name and Date lines, the grid's squares and numbers, the Across and Down clues, the
//     word bank only when the puzzle has it, the footer, every word escaped; the answer key on a page of its own;
//   - the route: anyone who can open the game may print the puzzle; only school staff get the answer key (a student, a
//     kid, a family grown-up, a guest and a visitor are refused); a saved set's class code and link in the footer; the
//     viewer's language and direction;
//   - the play page and the SDK: brb:print checked by the page (size, shape), printed only after a tap.
import './_live.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { call, publish, official, teacher, kid, mum, mia, auth } from './_live.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CP = await import('../../server/services/crossword-print.js');
const G = await import('../../server/services/game-sets.js');
const { tFor } = await import('../../server/i18n/index.js');
const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/crossword.html'), 'utf8');
const C = (() => { const box = { window: {} }; vm.runInNewContext(/\/\* crossword-core:begin \*\/([\s\S]*?)\/\* crossword-core:end \*\//.exec(HTML)[1], box); return box.window.CrosswordCore; })();

const WORDS = [['habitat', 'Where an animal lives'], ['predator', 'An animal that hunts others'], ['erosion', 'The wearing away of land'],
  ['migrate', 'To move with the seasons'], ['prey', 'An animal that is hunted'], ['camouflage', 'Colors that help an animal hide']];
/** What the game's printIt sends for these words and seed. */
function docFor(words = WORDS, seed = 3, extra = {}) {
  const L = C.layout(words.map(p => p[0]), seed);
  return { doc: { t: 'Habitats', w: words.map(p => [p[0], p[1]]), b: true, g: { w: L.w, h: L.h, e: L.entries.map(e => [e.i, e.dir, e.r, e.c]) }, key: false, set: '', ...extra }, L };
}
const clone = x => JSON.parse(JSON.stringify(x));

// ---------------------------------------------------------------- the request
test('a real layout passes; the numbers and letters are the game\'s own, counted and put down on the server', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const { doc, L } = docFor(WORDS, seed);
    const r = CP.cleanPrintDoc(doc);
    assert.equal(r.ok, true, `seed ${seed}`);
    assert.equal(r.doc.W, L.w); assert.equal(r.doc.H, L.h);
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) assert.equal(r.doc.grid[y][x], L.grid[y][x], `seed ${seed} ${y},${x}`);
    const want = dir => L.entries.filter(e => e.dir === dir).map(e => ({ n: e.num, clue: WORDS[e.i][1], len: e.len }));
    assert.deepEqual(r.doc.across, JSON.parse(JSON.stringify(want("a")))); assert.deepEqual(r.doc.down, JSON.parse(JSON.stringify(want("d"))));
  }
  // Other scripts: Hebrew runs right to left; Japanese kana; an accented word keeps its accents in the key.
  const he = docFor([['שמש', 'בשמיים ביום'], ['ירח', 'בשמיים בלילה'], ['כוכב', 'נוצץ בלילה'], ['שמיים', 'מעלינו']], 2);
  const rh = CP.cleanPrintDoc(he.doc); assert.equal(rh.ok, true); assert.equal(rh.doc.rtl, true);
  assert.equal(CP.cleanPrintDoc(docFor().doc).doc.rtl, false);
  const fr = CP.cleanPrintDoc(docFor([['école', 'Où on apprend'], ['élève', 'Il apprend'], ['crayon', 'Pour écrire'], ['livre', 'On le lit']], 5).doc);
  assert.equal(fr.ok, true); assert.ok(fr.doc.grid.flat().includes('É'));
});

test('bad or huge requests are turned down: shape, keys, size, the layout, a word twice, text the filter refuses', () => {
  const { doc } = docFor();
  const bad = (d, why) => assert.deepEqual(CP.cleanPrintDoc(d), { ok: false, code: 'bad' }, why);
  for (const d of [null, undefined, 'a string', 42, [], [doc]]) bad(d, JSON.stringify(d));
  bad({ ...doc, html: '<b>hi</b>' }, 'an unknown key');
  bad({ ...doc, t: 7 }, 'a title that is not text'); bad({ ...doc, b: 'yes' }, 'the bank option'); bad({ ...doc, key: 1 }, 'the key option');
  bad({ ...doc, set: 's-NOTVALID!' }, 'a set id that is not one');
  bad({ ...doc, w: [...doc.w, ...Array.from({ length: 40 }, (_, i) => ['word' + 'abcdefghijklmnopqrstuvwxyzabcdefghijklmnop'[i], 'a clue'])] }, 'more than 30 words');
  bad({ ...doc, t: 'x'.repeat(30000) }, 'more than 20,000 characters');
  bad({ ...doc, w: doc.w.slice(0, 2), g: { ...doc.g, e: doc.g.e.filter(e => e[0] < 2) } }, 'fewer than 3 words');
  // the layout
  const lay = f => { const d = clone(doc); f(d); return d; };
  bad(lay(d => { d.g.w = 26; }), 'wider than 25'); bad(lay(d => { d.g.h = 0; }), 'no rows'); bad(lay(d => { d.g.w = 2.5; }), 'not a whole number');
  bad(lay(d => { d.g.extra = 1; }), 'an unknown layout key'); bad(lay(d => { d.g.e = []; }), 'no words placed');
  bad(lay(d => { d.g.e[0][1] = 'x'; }), 'a direction that is neither'); bad(lay(d => { d.g.e[0][0] = 99; }), 'a word that is not in the list');
  bad(lay(d => { d.g.e[1][0] = d.g.e[0][0]; }), 'a word placed twice'); bad(lay(d => { d.g.e[0][2] = -1; }), 'off the top');
  bad(lay(d => { const e = d.g.e[0]; e[1] === 'a' ? (e[3] = d.g.w - 1) : (e[2] = d.g.h - 1); }), 'runs off the grid');
  bad(lay(d => { d.g.e[0] = [d.g.e[0][0], d.g.e[0][1], d.g.e[0][2]]; }), 'an entry with three parts');
  bad({ t: '', w: [['cat', 'a pet'], ['cats', 'pets'], ['owl', 'hoots']], g: { w: 4, h: 1, e: [[0, 'a', 0, 0], [1, 'a', 0, 0]] } }, 'two words the same way in one square')
  // two words crossing on letters that differ
  const cross = { t: '', w: [['cat', 'a pet'], ['dog', 'barks'], ['owl', 'hoots']], g: { w: 3, h: 3, e: [[0, 'a', 0, 0], [1, 'd', 0, 0], [2, 'a', 2, 0]] } };
  bad(cross, 'C and D in one square');
  // text the filter refuses: a rude word, a link or an email in a clue, in a word, in the title
  const words = clone(doc.w);
  for (const [i, k, v] of [[0, 1, 'go to www.example.com now'], [1, 1, 'email me at kid@example.com'], [2, 1, 'what the fuck'], [3, 0, 'shit']]) {
    const w = clone(words); w[i][k] = v; bad({ ...doc, w }, v);
  }
  bad({ ...doc, t: 'Call 555 123 4567' }, 'a phone number in the title');
  bad({ ...doc, w: words.map((p, i) => (i ? p : [p[0], ''])) }, 'a word with no clue');
  // and the same request passes as it is
  assert.equal(CP.cleanPrintDoc(doc).ok, true);
});

// ---------------------------------------------------------------- the printable page
const tEn = tFor('en');
test('the page: title, Name and Date, the grid with its numbers, Across and Down, the word bank, the footer; all escaped', () => {
  const { doc, L } = docFor(WORDS, 3, { t: 'Habitats <script>alert(1)</script> & more' });
  doc.w[0][1] = 'Where an <b>animal</b> lives';
  const r = CP.cleanPrintDoc(doc); assert.equal(r.ok, true);
  const html = CP.printHtml(r.doc, { t: tEn, code: 'ABCDE FGHJK', link: 'http://x.test/play/crossword?chapter=s-abcdefghjk&lock=1' });
  assert.doesNotMatch(html, /<script|<b>animal/); assert.match(html, /Habitats &lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; more/); assert.match(html, /Where an &lt;b&gt;animal&lt;\/b&gt; lives/);
  assert.match(html, /Name:<i class="cwp-blank/); assert.match(html, /Date:<i class="cwp-blank/);
  // the grid: one square per letter, a number for every word's first square, no letters on the puzzle page
  const puzzle = html.slice(0, html.indexOf('</section>', html.indexOf('cwp-foot')));
  const cells = L.grid.flat().filter(Boolean).length;
  assert.equal((puzzle.match(/<rect /g) || []).length, cells);
  const nums = [...new Set(L.entries.map(e => e.num))];
  assert.deepEqual([...puzzle.matchAll(/class="cwp-n"[^>]*>(\d+)</g)].map(m => +m[1]), nums);
  assert.doesNotMatch(puzzle, /cwp-l"/, 'no letters in the puzzle');
  // the clues, with their numbers and lengths, under Across and Down
  assert.match(html, /<h2>Across<\/h2>/); assert.match(html, /<h2>Down<\/h2>/);
  for (const e of L.entries) assert.ok(html.includes(`<b class="cwp-num">${e.num}</b><span dir="auto">${doc.w[e.i][1].replace(/</g, '&lt;').replace(/>/g, '&gt;')} (${e.len})</span>`), `${e.num}${e.dir}`);
  assert.match(html, /<h2>Word bank<\/h2><ul><li dir="auto">camouflage<\/li>/);
  assert.match(html, /Made with Oomba Academy<\/span><span>Class code: ABCDE FGHJK<\/span><span dir="ltr" class="cwp-link">http:\/\/x\.test\/play\/crossword\?chapter=s-abcdefghjk&amp;lock=1/);
  assert.doesNotMatch(html, /\$|price|upgrade|plan/i, 'nothing salesy');
  assert.doesNotMatch(html, /cwp-key/, 'no answer key unless asked');
  assert.doesNotMatch(html, /—/, 'no em dashes');
  // no word bank when the puzzle has none; an untitled puzzle is "Crossword"
  const nb = CP.printHtml(CP.cleanPrintDoc({ ...docFor().doc, b: false, t: '' }).doc, { t: tEn });
  assert.doesNotMatch(nb, /Word bank/); assert.match(nb, /<h1 dir="auto">Crossword<\/h1>/); assert.doesNotMatch(nb, /Class code/);
});

test('the answer key: the filled grid on a page of its own; Hebrew: the lists right to left, the grid in its own direction', () => {
  const { doc, L } = docFor(WORDS, 3, { key: true });
  const html = CP.printHtml(CP.cleanPrintDoc(doc).doc, { t: tEn });
  const key = html.slice(html.indexOf('cwp-key'));
  assert.match(html, /<section class="cwp-page cwp-key">/); assert.match(key, /Habitats: Answer key/);
  assert.equal((key.match(/class="cwp-l"/g) || []).length, L.grid.flat().filter(Boolean).length);
  assert.deepEqual([...key.matchAll(/class="cwp-l"[^>]*>([^<]+)</g)].map(m => m[1]).sort().join(''), L.grid.flat().filter(Boolean).sort().join(''));
  assert.match(fs.readFileSync(path.join(ROOT, 'public/css/app.css'), 'utf8'), /\.cwp-page\+\.cwp-page\{break-before:page/);
  // The viewer reads Hebrew; an English puzzle's grid stays left to right, a Hebrew puzzle's runs right to left
  const tHe = tFor('he');
  const en = CP.printHtml(CP.cleanPrintDoc(docFor().doc).doc, { t: tHe, dir: 'rtl', lang: 'he' });
  assert.match(en, /^<div class="cwp" lang="he" dir="rtl">/); assert.match(en, /<h2>מאוזן<\/h2>/); assert.match(en, /<div class="cwp-gridbox" dir="ltr">/);
  const he = CP.cleanPrintDoc(docFor([['שמש', 'בשמיים ביום'], ['ירח', 'בשמיים בלילה'], ['כוכב', 'נוצץ בלילה'], ['שמיים', 'מעלינו']], 2).doc);
  const hh = CP.printHtml(he.doc, { t: tHe, dir: 'rtl', lang: 'he' });
  assert.match(hh, /<div class="cwp-gridbox" dir="rtl">/);
  // column 0 is drawn on the right: the picture is mirrored, so it reads as the game shows it
  const c0 = he.doc.grid.findIndex(row => row[0]);
  const x0 = (he.doc.W - 1) * 10 + 1;
  assert.match(hh, new RegExp(`<rect x="${x0}" y="${c0 * 10 + 1}"`));
});

// ---------------------------------------------------------------- the route
const cw = publish(official, '<!doctype html><title>Crossword</title><p>crossword</p>', { source: 'seed', slug: 'crossword', title: 'Crossword' });
const post = (user, body, opts = {}) => call(`/api/games/${cw.id}/print`, { method: 'POST', body, user, ...opts });

test('route: anyone may print the puzzle; only school staff get the answer key; a saved set\'s code and link', async () => {
  const { doc } = docFor();
  const guest = auth.createGuest();
  for (const u of [teacher, mia, kid, mum, guest, null]) {
    const r = await post(u, { doc });
    assert.equal(r.status, 200, `${u ? u.username : 'a visitor'}: ${r.text}`);
    assert.match(r.json.html, /<h2>Across<\/h2>/); assert.doesNotMatch(r.json.html, /cwp-key/);
  }
  // the answer key: a teacher yes; a student, a kid, a family grown-up, a guest and a visitor no
  const k = await post(teacher, { doc: { ...doc, key: true } });
  assert.equal(k.status, 200); assert.match(k.json.html, /cwp-key/); assert.match(k.json.html, /Answer key/);
  for (const u of [mia, kid, mum, guest, null]) {
    const r = await post(u, { doc: { ...doc, key: true } });
    assert.equal(r.status, 403, `${u ? u.username : 'a visitor'}`); assert.equal(r.json.code, 'key'); assert.equal(r.json.html, undefined);
  }
  // a bad request, by code
  const b = await post(teacher, { doc: { ...doc, w: [['shit', 'x'], ...doc.w.slice(1)] } });
  assert.equal(b.status, 400); assert.equal(b.json.code, 'bad');
  assert.equal((await post(teacher, { doc: 'x' })).status, 400);
  // a saved set: its class code and link in the footer; a set id that isn't one of this game's: neither
  const saved = G.save(cw.id, teacher.id, [{ t: 'Habitats', w: WORDS, r: 3, b: true, h: true }], null, 'crossword');
  const s = await post(mia, { doc: { ...doc, set: saved.id } });
  const code = saved.id.slice(2).toUpperCase();
  assert.ok(s.json.html.includes(`Class code: ${code.slice(0, 5)} ${code.slice(5)}`), s.json.html.slice(-400));
  assert.ok(s.json.html.includes(`/play/crossword?chapter=${saved.id}&amp;lock=1`));
  const none = await post(mia, { doc: { ...doc, set: 's-zzzzzzzzzz' } });
  assert.equal(none.status, 200); assert.doesNotMatch(none.json.html, /Class code/);
  // the viewer's language: a Hebrew page, right to left
  const he = await call(`/api/games/${cw.id}/print`, { method: 'POST', body: { doc }, headers: { 'accept-language': 'he' } });
  assert.equal(he.status, 200); assert.match(he.json.html, /dir="rtl"/); assert.match(he.json.html, /מאוזן/);
  // another game: no print
  const other = publish(official, '<!doctype html><title>x</title>', { source: 'seed', slug: 'algebra-builder', title: 'Algebra Builder' });
  assert.equal((await call(`/api/games/${other.id}/print`, { method: 'POST', body: { doc } })).status, 404);
});

test('the play page and the SDK: brb:print checked by the page, printed only after a tap; the frame and page say Print is on', async () => {
  const src = fs.readFileSync(path.join(ROOT, 'public/js/play.js'), 'utf8');
  const start = src.indexOf('const TYPES = {'), end = src.indexOf('let saveTimer');
  const validMessage = new Function(src.slice(start, end).replace('export function', 'function') + '\nreturn validMessage;')();
  const frame = {}, ev = data => ({ source: frame, origin: 'null', data });
  const { doc } = docFor();
  assert.ok(validMessage(ev({ brb: 1, type: 'brb:print', id: 1, doc }), frame));
  for (const m of [{ id: 1, doc: 'x' }, { id: 1, doc: [doc] }, { id: 0, doc }, { id: 1 }, { id: 1, doc: { t: 'x'.repeat(20001) } }]) assert.equal(validMessage(ev({ brb: 1, type: 'brb:print', ...m }), frame), null, JSON.stringify(m).slice(0, 60));
  assert.match(src, /case 'brb:print': printForGame\(m, tappedJustNow\('brb-print-at', 2000\)\)/);
  assert.match(src, /if \(!tapped\) return done\(\{ error: 'tap' \}\)/);
  assert.match(src, /area\.innerHTML = r\.html;/); assert.match(src, /window\.print\(\)/);
  const sdk = fs.readFileSync(path.join(ROOT, 'public/sdk/brb-sdk.js'), 'utf8');
  assert.match(sdk, /canPrint: INIT\.print === true/); assert.match(sdk, /send\('brb:print', \{ id: n, doc: copy \}\)/);
  // the play page carries the print flag for Crossword only
  const page = await call('/play/crossword');
  assert.equal(page.status, 200); assert.match(page.text, /"print":true/);
  // the game: Print on the preview (with the answer key choice for teachers) and on the play screen (the puzzle only)
  assert.match(HTML, /'cw-print'/); assert.match(HTML, /'cw-print-key'/); assert.match(HTML, /'cw-printit'/);
  assert.match(HTML, /if \(!B\.canAssign\) \{ printIt\(false\); return; \}/);
});
