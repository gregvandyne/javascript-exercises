// Story Library, the Classics shelf (docs/decisions.md "Story Library: a Classics shelf"; docs/story-library-classics.md):
// the public-domain rule (a fixture with an illustrator who died too recently is refused), reading an illustrated HTML
// edition, cutting a story into pages that never break inside a sentence and fit the page budget, putting each picture
// on the page it illustrates, the shipped books (grades by the shared rule, valid questions, every picture on disk, no
// digitizer's name anywhere), and over HTTP the cards, the credits and the reader's markup for text-only pages.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const C = await import('../../server/library/classics-lib.js');
const I = await import('../../server/library/import-lib.js');
const IMP = await import('../../scripts/import-classics.js');
const { sentences } = await import('../../public/js/library-text.js');
const { createApp } = await import('../../server/app.js');
const LIB = await import('../../server/services/library.js');
const { librarySeed, cookieOf } = await import('../support/library-seed.js');

const curation = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-library/classics.json'), 'utf8'));
const classics = () => LIB.books().filter(b => b.source === 'classics');

// ------------------------------------------------------------------ the public-domain rule
test('checkPublicDomain: published before 1931 and every maker dead before 1956; unknown deaths are refused', () => {
  const kipling = { published: 1912, makers: [{ role: 'author', name: 'Rudyard Kipling', died: 1936 }, { role: 'illustrator', name: 'Joseph M. Gleeson', died: 1917 }] };
  assert.deepEqual(C.checkPublicDomain(kipling), { ok: true });
  // The Aesop for Children (1919): Milo Winter died in 1956, so his pictures are still in copyright in life-plus-70 countries.
  const winter = { published: 1919, makers: [{ role: 'author', name: 'Aesop', died: -564 }, { role: 'illustrator', name: 'Milo Winter', died: 1956 }] };
  assert.match(C.checkPublicDomain(winter).reason, /illustrator Milo Winter died in 1956, not before 1956/);
  assert.match(C.checkPublicDomain({ ...kipling, published: 1931 }).reason, /not public domain in the US/);
  assert.match(C.checkPublicDomain({ published: 1910, makers: [{ role: 'translator', name: 'Someone' }] }).reason, /death year unknown/);
  assert.equal(C.checkPublicDomain({ published: 1911, makers: [{ role: 'translator', name: 'not named', anonymous: true }, { role: 'illustrator', name: 'Edmund Dulac', died: 1953 }] }).ok, true, 'an anonymous translator of a pre-1931 book');
  assert.match(C.checkPublicDomain({ published: 1912, makers: [] }).reason, /no author/);
  assert.match(C.checkPublicDomain({ makers: kipling.makers }).reason, /no publication year/);
  // The curation file records the refused edition, and the importer refuses a book from it.
  assert.equal(C.checkPublicDomain(curation.sources.aesopWinter).ok, false);
  const row = IMP.evaluateClassic('x', { title: 'X', fables: [] }, curation.sources.aesopWinter, '<h2>X</h2><p>Hi.</p>');
  assert.match(row.reason, /not public domain everywhere: illustrator Milo Winter died in 1956/);
  for (const [k, s] of Object.entries(curation.sources)) if (k !== 'aesopWinter') assert.equal(C.checkPublicDomain(s).ok, true, k);
});

// ------------------------------------------------------------------ reading an edition
const EDITION = `<html><body><p>*** START OF THE EBOOK ***</p><h2>THE TALE</h2>
<div class="figleft"><img src="images/i.png" width="100" height="300" alt="O" /></div><div>NCE upon a time there was a <i>Fish</i>,<span class='pagenum'><a name="Page_2"></a>[<a href="x">2</a>]</span>
and he swam.</div>
<p>'Mr. Crab,' said the Fish. 'Let us play.' They played all day.</p>
<div class="figcenter"><img src="images/a.png" width="400" height="300" alt="The Fish and the Crab playing." /></div>
<div class="caption2">The Fish and the Crab playing. The Crab is red.</div>
<p>This is the picture of the Fish, printed as a paragraph.</p>
<div class="poem">Swim, swim<br />
all the day!<br /></div>
<p>Then they went home. The end.</p>
<h2>THE NEXT TALE</h2><p>Another story.</p></body></html>`;

test('htmlBlocks and storyOf: paragraphs, drop caps, captions, a poem, skips and pictures', () => {
  const b = C.htmlBlocks(EDITION);
  const sec = C.sectionOf(b, 'The Tale');
  assert.deepEqual(sec.filter(x => x.t === 'img').map(x => [x.src, x.caption]), [['images/i.png', ''], ['images/a.png', 'The Fish and the Crab playing. The Crab is red.']]);
  assert.throws(() => C.sectionOf(b, 'Missing'), /not found/);
  const st = C.storyOf(sec, { skip: ['This is the picture of the Fish'], pictures: [{ file: 'a.png' }] });
  assert.deepEqual(st.paragraphs, ['Once upon a time there was a Fish, and he swam.', "'Mr. Crab,' said the Fish. 'Let us play.' They played all day.", 'Swim, swim\nall the day!', 'Then they went home. The end.']);
  assert.deepEqual(st.pictures.map(p => [p.file, p.para, p.sentence, p.alt]), [['a.png', 1, 2, 'The Fish and the Crab playing.']], 'after its words: the last sentence before it');
  assert.throws(() => C.storyOf(sec, { skip: ['Not there'] }), /matches no paragraph/);
  assert.throws(() => C.storyOf(sec, { pictures: [{ file: 'zzz.png' }] }), /zzz\.png is not in the story/);
  // A person names the sentence a picture shows (from its caption).
  const at = C.storyOf(sec, { skip: ['This is the picture'], pictures: [{ file: 'a.png', at: 'Then they went home' }] });
  assert.deepEqual([at.pictures[0].para, at.pictures[0].sentence], [3, 0]);
  assert.throws(() => C.storyOf(sec, { pictures: [{ file: 'a.png', at: 'the' }] }), /not exactly one/);
  // Corrections: exactly once, or the import stops.
  assert.equal(C.storyOf(sec, { fixes: [{ from: 'went home', to: 'went home again' }] }).paragraphs.at(-1), 'Then they went home again. The end.');
  assert.throws(() => C.storyOf(sec, { fixes: [{ from: 'the', to: 'a' }] }), /more than once/);
  assert.throws(() => C.storyOf(sec, { fixes: [{ from: 'zebra', to: 'a' }] }), /not in the story/);
  // Small capitals at the start of a paragraph.
  assert.equal(C.smallCapsStart('ONCE upon a time'), 'Once upon a time');
  assert.equal(C.smallCapsStart('TOM THUMB set to work'), 'Tom Thumb set to work');
  assert.equal(C.smallCapsStart('A MINUTE afterwards'), 'A minute afterwards');
  assert.equal(C.smallCapsStart('I am here'), 'I am here');
});

test('pictures that come before their words (picture books) share out the sentences after them', () => {
  const html = '<p>Start.</p><img src="p1.jpg" width="300" height="300" alt="one"><img src="p2.jpg" width="300" height="300" alt="two"><p>First. Second. Third. Fourth.</p><img src="p3.jpg" width="300" height="300" alt="three"><p>Last one.</p>';
  const st = C.storyOf(C.htmlBlocks(html), { pictureSide: 'before', pictures: ['p1.jpg', 'p2.jpg', 'p3.jpg'].map(file => ({ file })) });
  assert.deepEqual(st.pictures.map(p => [p.file, p.para, p.sentence]), [['p1.jpg', 1, 0], ['p2.jpg', 1, 2], ['p3.jpg', 2, 0]]);
  const pages = C.paginate(st, { pictureStartsPage: true });
  assert.deepEqual(pages.map(p => [p.picture, p.text]), [[null, 'Start.'], ['p1.jpg', 'First. Second.'], ['p2.jpg', 'Third. Fourth.'], ['p3.jpg', 'Last one.']]);
  // Too many pictures for the words: refused, a person chooses.
  const crowded = '<img src="a.jpg" width="300" height="300"><img src="b.jpg" width="300" height="300"><p>Only one.</p>';
  assert.throws(() => C.storyOf(C.htmlBlocks(crowded), { pictureSide: 'before', pictures: [{ file: 'a.jpg' }, { file: 'b.jpg' }] }), /too many for one picture each/);
});

// ------------------------------------------------------------------ pages that fit
const long = n => Array.from({ length: n }, (_, i) => `Sentence number ${i + 1} is here, and it goes on for a little while like the others do.`).join(' ');
test('paginate: never inside a sentence, never over the budget, a scrap never left alone, the whole story kept', () => {
  const story = { paragraphs: [long(9), "'Mr. Brown,' said Nutkin. 'Hello!'", long(5), 'Flopsy,\nMopsy,\nCotton-tail,\nand Peter.', long(3)], pictures: [], breaks: [], keep: [] };
  const pages = C.paginate(story);
  assert.ok(pages.length >= 3);
  assert.deepEqual(C.checkPages(pages, story), []);
  for (const p of pages) {
    assert.ok(C.fitsPage(p.text), `${C.linesOf(p.text)} lines`);
    assert.ok(C.linesOf(p.text) <= C.PAGE_FIT.lines && I.wordCount(p.text) <= C.PAGE_FIT.maxWords);
  }
  for (const p of pages.slice(0, -1)) assert.ok(C.endsSentence(p.text), `ends a sentence: …${p.text.slice(-20)}`);
  assert.ok(!pages.some(p => /Mr\.$/.test(p.text)), 'never after "Mr."');
  assert.ok(pages.some(p => p.text.includes('Flopsy,\nMopsy,\nCotton-tail,\nand Peter.')), 'a list that is one sentence stays on one page');
  // A sentence cut by the reader at "!" but going on in small letters is one sentence for the page cut.
  const splash = { paragraphs: [long(8) + ' A great big trout came up—ker-pflop! with a splash—and it seized him. ' + long(3)], pictures: [], breaks: [], keep: [] };
  for (const [i, p] of C.paginate(splash).entries()) if (i) assert.ok(!/^\s*\p{Ll}/u.test(p.text), p.text.slice(0, 30));
  // checkPages finds a page that ends inside a sentence or does not fit.
  assert.match(C.checkPages([{ text: 'He went' }, { text: 'home.' }])[0], /ends inside a sentence/);
  assert.match(C.checkPages([{ text: long(20) }])[0], /does not fit/);
  // A heading (a fable's title) is never the last thing on a page; a forced break starts each fable.
  const fables = { paragraphs: ['The Fox and the Crow.', long(4), 'The Fox and the Stork.', long(3)], pictures: [], breaks: [0, 2], keep: [0, 2] };
  const fp = C.paginate(fables);
  assert.ok(fp.every(p => !/\.$/.test(p.text) || !['The Fox and the Crow.', 'The Fox and the Stork.'].includes(p.text.split('\n\n').at(-1))));
  assert.ok(fp.some(p => p.text.startsWith('The Fox and the Stork.')));
  // Every sentence the reader cuts is whole on one page (so Read to me reads page by page).
  for (const p of pages) for (const s of sentences(p.text)) assert.ok(story.paragraphs.join('\n').includes(s.text));
});

test('paginate: each picture on the page with the sentence it illustrates, never two on a page', () => {
  const story = { paragraphs: [long(6), long(6), 'The Whale swallowed the Mariner. ' + long(2), long(4)], pictures: [{ file: 'whale.png', para: 2, sentence: 0 }, { file: 'map.png', para: 3, sentence: 1 }], breaks: [], keep: [] };
  const pages = C.paginate(story);
  const withWhale = pages.find(p => p.picture === 'whale.png'), withMap = pages.find(p => p.picture === 'map.png');
  assert.ok(withWhale.text.includes('The Whale swallowed the Mariner.'));
  assert.ok(withMap.text.includes('Sentence number 2 is here'));
  assert.notEqual(withWhale, withMap);
  assert.equal(pages.filter(p => p.picture).length, 2);
});

// ------------------------------------------------------------------ the shipped books
test('the shipped Classics: public domain, pages that fit, pictures on disk, grades by the rule, questions valid', () => {
  const books = classics();
  assert.ok(books.length >= 20, `${books.length} classics`);
  const keys = new Set(Object.keys(curation.books));
  for (const b of books) {
    assert.match(b.id, /^cl-[a-z0-9-]+$/);
    const pick = curation.books[b.id.slice(3)]; assert.ok(pick && keys.has(b.id.slice(3)), `${b.id} was picked by a person`);
    assert.equal(C.checkPublicDomain(curation.sources[pick.source]).ok, true, b.id);
    assert.equal(b.credits.license, 'public-domain'); assert.ok(Number.isInteger(b.credits.published) && b.credits.published < 1931);
    assert.ok(b.credits.text.length && b.credits.illustration.length, `${b.id} credits`);
    assert.deepEqual(C.checkPages(b.pages.map(p => ({ text: p.text }))), [], b.id);
    assert.deepEqual(I.checkQuestions(b.questions, b.pages.length), [], b.id);
    assert.equal(b.questions.filter(x => x.kind === 'inference').length, 1, `${b.id}: one inference question`);
    const m = I.measure(b.pages.map(p => p.text));
    // The rule's grade, unless the owner set one by hand with a reason (Beatrix Potter: Grade 3).
    if (pick.grade) assert.ok(pick.gradeWhy && pick.grade === b.grade, `${b.id}: a hand-set grade`);
    else assert.equal(I.gradeOf(m, { maxWords: IMP.CLASSICS_MAX_WORDS }).grade, b.grade, `${b.id}: the grade is the rule's`);
    assert.ok(b.words <= IMP.CLASSICS_MAX_WORDS);
    for (const src of [b.cover.src, ...b.pages.filter(p => p.image).map(p => p.image.src)]) assert.ok(fs.existsSync(path.join(ROOT, 'public', src)), src);
    assert.ok(b.pages.filter(p => p.image).every(p => p.image.w > 0 && p.image.h > 0), `${b.id}: picture sizes`);
    assert.ok(new Set(b.pages.filter(p => p.image).map(p => p.image.file)).size === b.pages.filter(p => p.image).length, `${b.id}: a picture once`);
  }
  // Beatrix Potter reads at Grade 3 (owner's decision, 20 Nov 2026).
  for (const b of books.filter(x => x.credits.text.includes('Beatrix Potter'))) assert.equal(b.grade, '3', b.id);
  // The Whale leaves out the line about the Mariner being Irish (owner's decision, 20 Nov 2026).
  const whale = books.find(b => b.id === 'cl-whale');
  assert.ok(!/Hi-ber-ni-an|Hibernian/.test(whale.pages.map(p => p.text).join(' ')));
  assert.equal(whale.credits.cuts, 1); assert.ok(!whale.credits.corrections, 'a cut is not a spelling fix');
  // The shelf adds books for older readers, where the library was thin.
  assert.ok(books.filter(b => b.grade === '4-5').length >= 10);
  // Grades 4-5 is the shelf's usual grade; a long book is allowed only for this source.
  assert.ok(books.some(b => b.words > I.GRADE_RULE.maxWords), 'longer than the other sources allow');
  assert.ok(LIB.books().filter(b => b.source !== 'classics').every(b => b.words <= I.GRADE_RULE.maxWords));
});

test('no digitizer\'s name, header or license anywhere in the manifest, the curation shown, or the pages', async () => {
  const manifest = fs.readFileSync(path.join(ROOT, 'server/library/manifest.json'), 'utf8');
  assert.ok(!/gutenberg|pglaf|pgdp|distributed proofread|transcriber/i.test(manifest), 'the manifest');
  for (const b of classics()) for (const p of b.pages) assert.ok(!C.SOURCE_NAME_RE.test(p.text) && !/https?:|www\./.test(p.text), `${b.id}`);
  for (const pathname of ['/read', '/read?q=classics', '/library/cl-whale', '/library/cl-whale/read', '/library/cl-velveteen-rabbit/read?p=10']) {
    const r = await call(pathname);
    assert.equal(r.status, 200, pathname);
    assert.ok(!/gutenberg/i.test(r.text), pathname);
  }
});

// ------------------------------------------------------------------ over HTTP
let server, BASE;
test.before(async () => { server = createApp().listen(0); await new Promise(r => server.once('listening', r)); BASE = `http://127.0.0.1:${server.address().port}`; });
test.after(() => { server.closeAllConnections(); server.close(); });
async function call(p, { method = 'GET', body, user = null } = {}) {
  const headers = { ...(user ? { cookie: cookieOf(user.id) } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) };
  const r = await fetch(BASE + p, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json };
}

test('cards, book page and credits: "Classics", author and illustrator with the year, public domain, what Oomba changed', async () => {
  const lib = await call('/read');
  assert.match(lib.text, /<li class="lb-card" data-grade="[^"]+">\s*<a class="lb-cover" href="\/library\/cl-whale"/);
  assert.match(lib.text, /<span class="lb-src">Classics<\/span>/);
  assert.match(lib.text, /Classics: old books in the public domain, with their original pictures\./);
  assert.ok(LIB.search({ q: 'classics' }).length >= classics().length, 'search finds the shelf');
  assert.ok(LIB.search({ q: 'kipling whale' }).some(b => b.id === 'cl-whale'));
  const page = await call('/library/cl-whale');
  assert.match(page.text, /Story: Rudyard Kipling · Pictures: Joseph M\. Gleeson \(1912\)/);
  assert.match(page.text, /Public domain · First published in 1912 \(Doubleday, Page &amp; Company, New York\)\./);
  assert.match(page.text, /Oomba split the story into pages, resized the pictures and left out one line\. All the other words are the author&#39;s own\./);
  assert.match((await call('/library/cl-camel')).text, /Oomba split the story into pages and resized the pictures\. The words are the author&#39;s own\./);
  assert.match(page.text, /Words to know/); assert.match(page.text, /&#39;Stute|'Stute/);
  assert.ok(!/creativecommons/.test(page.text.split('lb-credit')[1] || ''), 'no license deed for a public-domain book');
  // A corrected book says so; one with an unnamed translator names nobody.
  assert.match((await call('/library/cl-tittlemouse')).text, /Oomba corrected spelling and punctuation\./);
  assert.ok(!/Translation:/.test((await call('/library/cl-aesop-friends')).text));
  assert.match((await call('/library/cl-whale', {})).text, /Classics/);
  // French.
  const fr = await fetch(`${BASE}/library/cl-whale`, { headers: { cookie: 'lang=fr', 'accept-language': 'fr' } }).then(r => r.text());
  assert.match(fr, /Domaine public|Classiques/);
});

test('the reader: a text-only page has no picture and keeps its paragraphs; picture books keep the usual markup', async () => {
  const w = LIB.getBook('cl-whale');
  const p1 = await call('/library/cl-whale/read');
  assert.match(p1.text, /class="rd rd-classic"/);
  assert.match(p1.text, /class="rd-stage is-classic is-text"/);
  assert.match(p1.text, /<figure class="rd-pic" hidden>/);
  assert.match(p1.text, /id="rd-leaf-r" hidden/);
  const pic = w.pages.findIndex(p => p.image) + 1;
  const p5 = await call(`/library/cl-whale/read?p=${pic}`);
  assert.match(p5.text, /class="rd-stage is-classic"/); assert.match(p5.text, new RegExp(`src="${w.pages[pic - 1].image.src}"`));
  const para = w.pages.findIndex(p => p.text.includes('\n\n')) + 1;
  assert.match((await call(`/library/cl-whale/read?p=${para}`)).text, /<span class="rd-para"><\/span>/);
  // A picture book (a picture on every page, StoryWeaver or Classics) is drawn exactly as before.
  for (const id of ['sw-0001', 'cl-peter-rabbit']) {
    const r = await call(`/library/${id}/read`);
    assert.match(r.text, /<div class="rd" id="reader"/); assert.match(r.text, /<div class="rd-stage" id="rd-stage">/);
    assert.ok(!/rd-leaf/.test(r.text), id);
  }
  // Read to me with the AI voice reads a text-only page by its numbers, like any page.
  const { config, TTS_ALL_LOCALES } = await import('../../server/config.js');
  const V = await import('../../server/services/tts-voices.js');
  config.ttsEnabled = true; config.ttsProvider = 'mock'; config.ttsApiKey = ''; config.ttsLocales = [...TTS_ALL_LOCALES]; config.ttsMaxChars = 600;
  V.save(null, { locales: Object.fromEntries(TTS_ALL_LOCALES.map(l => [l, { on: l === 'en' }])) });
  try {
    const n = sentences(w.pages[1].text).length;
    assert.equal((await call('/api/tts', { method: 'POST', body: { ctx: 'story', book: 'cl-whale', page: 2, s: n - 1, check: true } })).json.ok, true);
    assert.equal((await call('/api/tts', { method: 'POST', body: { ctx: 'story', book: 'cl-whale', page: 2, s: n, check: true } })).status, 404);
  } finally { config.ttsEnabled = false; config.ttsProvider = 'openai'; }
});

test('progress and answers work by page number on a classic (the furthest page is the last one read)', async () => {
  const s = librarySeed({ book: null });
  const kid = s.kids[0], b = LIB.getBook('cl-camel'), n = b.pages.length;
  assert.equal((await call(`/api/library/cl-camel/progress`, { method: 'POST', body: { page: 4 }, user: kid })).json.ok, true);
  assert.equal(LIB.readOf(kid.id, 'cl-camel').page, 4);
  const early = await call('/api/library/cl-camel/answer', { method: 'POST', body: { i: 0, c: 0 }, user: kid });
  assert.equal(early.json.code, 'readFirst');
  await call(`/api/library/cl-camel/progress`, { method: 'POST', body: { page: n }, user: kid });
  for (const [i, x] of b.questions.entries()) {
    const r = await call('/api/library/cl-camel/answer', { method: 'POST', body: { i, c: x.answer }, user: kid });
    assert.equal(r.json.right, true);
  }
  const rd = LIB.readOf(kid.id, 'cl-camel');
  assert.equal(rd.page, n); assert.equal(rd.marks, '111'); assert.ok(rd.quiz_at);
  // Assigning a classic works like any book.
  assert.equal(LIB.assignStory(s.teacher, s.cls.id, 'cl-camel').ok, true);
});

test('dotWindow: every dot up to 24 pages, then 13 that slide with the reader and stop at either end', async () => {
  const { dotWindow, DOTS } = await import('../../public/js/library-text.js');
  assert.deepEqual(dotWindow(24, 5), { from: 0, to: 24, sliding: false });
  assert.deepEqual(dotWindow(50, 1), { from: 0, to: DOTS.size, sliding: true });
  assert.deepEqual(dotWindow(50, 24), { from: 17, to: 30, sliding: true });
  assert.deepEqual(dotWindow(50, 50), { from: 37, to: 50, sliding: true });
  assert.deepEqual(dotWindow(50, 51), { from: 37, to: 50, sliding: true }, 'the questions page');
  const page = await call('/library/cl-velveteen-rabbit/read?p=24');
  assert.equal((page.text.match(/<i class="[^"]*" hidden><\/i>/g) || []).length, 37, 'the server hides the same dots');
  assert.match(page.text, /class="rd-dots sliding more-l more-r"/);
});
