// Story Library (docs/decisions.md "Story Library"; docs/story-library-sources.md): the importer's license filter
// (fixtures with CC BY, NC, SA, ND, Public Domain, mixed picture licenses, missing and unreadable metadata), parsing,
// picture mapping, the US grade rule, the shipped manifest, the sentence cut shared with the TTS route, and the
// reader / assign / results APIs over HTTP, with the gradebook's Score.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const I = await import('../../server/library/import-lib.js');
const IMP = await import('../../scripts/import-stories.js');
const { sentences, tokens } = await import('../../public/js/library-text.js');
const { createApp } = await import('../../server/app.js');
const { q } = await import('../../server/db.js');
const LIB = await import('../../server/services/library.js');
const P = await import('../../server/services/progress.js');
const SC = await import('../../server/services/scores.js');
const { librarySeed, cookieOf } = await import('../support/library-seed.js');

const FIX = path.join(ROOT, 'tests/fixtures/library');
const CC = '[CC-BY](https://creativecommons.org/licenses/by/4.0/)';

// ------------------------------------------------------------------ the license filter
test('licenseOf: CC BY 4.0 and Public Domain pass; NC, ND, SA, other versions, missing and unreadable do not', () => {
  for (const s of ['[CC-BY]', CC, 'CC BY 4.0', 'CC-BY', '[CC-BY].', 'Creative Commons BY 4.0']) assert.equal(I.licenseOf(s), 'cc-by-4.0', s);
  for (const s of ['Public Domain', '[Public Domain]', 'CC0']) assert.equal(I.licenseOf(s), 'public-domain', s);
  assert.equal(I.licenseOf('[CC-BY-NC]'), 'nc');
  assert.equal(I.licenseOf('CC BY-NC-SA 4.0'), 'nc');
  assert.equal(I.licenseOf('CC BY-ND 4.0'), 'nd');
  assert.equal(I.licenseOf('[CC-BY-SA](https://creativecommons.org/licenses/by-sa/4.0/)'), 'sa');
  assert.equal(I.licenseOf('[CC-BY](https://creativecommons.org/licenses/by-nc/4.0/)'), 'nc', 'a link that disagrees with the words is believed for the worse');
  assert.equal(I.licenseOf('[CC-BY](https://creativecommons.org/licenses/by/2.0/)'), 'version');
  assert.equal(I.licenseOf('CC BY 3.0'), 'version');
  assert.equal(I.licenseOf(''), 'missing');
  assert.equal(I.licenseOf(undefined), 'missing');
  assert.equal(I.licenseOf('All rights reserved'), 'unknown');
  assert.equal(I.licenseOf(`Ravi|${CC}`), 'unknown', 'a table row whose columns ran together');
  assert.equal(I.isAllowed('cc-by-4.0'), true); assert.equal(I.isAllowed('nc'), false);
});

test('checkLicenses: the text and every picture must pass; one bad picture is enough to leave a book out', () => {
  const im = l => ({ file: '01.jpg', license: l });
  assert.equal(I.checkLicenses('[CC-BY]', [im(CC), im('Public Domain')]).ok, true);
  assert.match(I.checkLicenses('[CC-BY-NC]', [im(CC)]).reason, /text license: NC/);
  assert.match(I.checkLicenses('', [im(CC)]).reason, /text license: missing/);
  assert.match(I.checkLicenses('[CC-BY]', [im(CC), { file: '02.jpg', license: 'CC BY-SA 4.0' }]).reason, /02\.jpg license: SA/);
  assert.match(I.checkLicenses('[CC-BY]', []).reason, /metadata missing/);
  assert.equal(I.bookLicense('public-domain', ['public-domain']), 'public-domain');
  assert.equal(I.bookLicense('public-domain', ['cc-by-4.0']), 'cc-by-4.0');
});

test('parsing: a story file, the image metadata table, picture mapping, whitespace only', () => {
  const s = I.parseStoryMarkdown(fs.readFileSync(path.join(FIX, 'pb-source/en/0001_sunny-cat.md'), 'utf8'));
  assert.equal(s.title, 'Sunny Cat');
  assert.deepEqual(s.pages, ['A cat sat in the sun.', 'The cat saw a red ball.', 'The cat and the ball played all day.']);
  assert.equal(s.meta.license, '[CC-BY]'); assert.equal(s.meta.translation, 'Mira Translator');
  assert.deepEqual(s.problems, []);
  assert.deepEqual(I.parseStoryMarkdown('# T\n\n##\nHi\n').problems, ['no credits block']);
  const m = I.parseImageMetadata(fs.readFileSync(path.join(FIX, 'pb-imagebank/metadata/0001.md'), 'utf8'));
  assert.equal(m.images.length, 4); assert.equal(m.images[0].illustrator, 'Ravi Artist');
  assert.match(m.sourceUrl, /^https:\/\/storyweaver\.org\.in\/stories\//);
  assert.deepEqual(I.mapImages(3, m.images), { ok: true, cover: '01.jpg', pages: ['02.jpg', '03.jpg', '04.jpg'] });
  assert.equal(I.mapImages(4, m.images).ok, false, 'never guessed');
  assert.equal(I.mapImages(3, [{ file: '01.jpg' }, { file: '02.jpg' }, { file: '05.jpg' }, { file: '06.jpg' }]).ok, false);
  assert.equal(I.tidyText('  The  \\*cat\\*  sat.\r\n\r\n\r\n\r\nYes '), 'The *cat* sat.\n\nYes');
  assert.deepEqual(I.people('Angie & Upesh'), ['Angie & Upesh']);
  assert.deepEqual(I.people('Mala Kumar, Manisha Chaudhry'), ['Mala Kumar', 'Manisha Chaudhry']);
});

test('measure and gradeOf: the measures of a text and the US grade they point to', () => {
  const m = I.measure(['A cat sat.', '', 'Don\'t go!']);
  assert.deepEqual([m.words, m.pages, m.perPage, m.maxPage, m.sentences, m.perSentence], [5, 2, 2.5, 3, 2, 2.5], 'pages with no words are not counted, "don\'t" is one word');
  assert.deepEqual(I.measure(['', '']).words, 0);
  assert.equal(I.gradeOf(I.measure(['', ''])).grade, null);
  // Sight words (Dolch and Fry), with endings; names inside a sentence and numbers are not counted.
  for (const w of ['the', 'jumped', 'running', 'babies', 'mother\'s', 'bigger', 'happily', 'Trees']) assert.ok(I.isSightWord(w), w);
  assert.ok(!I.isSightWord('boulder') && !I.isSightWord('massaged'));
  assert.equal(I.measure(['Then Ravi ran to the big tree.']).notSight, 0, 'a name is not a hard word');
  assert.equal(I.measure(['The boulder crumbled.']).notSight, 66.7);
  assert.deepEqual(['cat', 'table', 'jumped', 'elephant', 'tomato', 'the'].map(I.syllables), [1, 2, 1, 3, 3, 1]);
  const fk = I.measure(['The cat sat on the mat.']);
  assert.equal(fk.fk, Math.round((0.39 * 6 + 11.8 * 1 - 15.59) * 10) / 10, 'Flesch-Kincaid: 0.39 words a sentence + 11.8 syllables a word - 15.59');
  // Bands: a few short, plain pages are Pre-K/K; longer pages, sentences and words climb the grades.
  const pageOf = (n, w = 'cat') => Array.from({ length: n }, (_, i) => (i % 6 === 5 ? `${w}.` : w)).join(' ');
  assert.equal(I.gradeOf(I.measure(['I can run.', 'I can jump.', 'I can see a cat.', 'Look at me!', 'We play.', 'I can go up.', 'I like my dog.'])).grade, 'k');
  assert.equal(I.gradeOf(I.measure(Array(11).fill('The fawn leapt over the stream. He stumbled on a rock.'))).grade, '1');
  assert.equal(I.gradeOf(I.measure(Array(12).fill('The old train shuddered and thundered through the tunnel, while the frightened mynahs scattered from the wires above the platform.'))).grade, '3');
  const long = I.gradeOf(I.measure(Array(30).fill(pageOf(90, 'remarkable'))));
  assert.equal(long.grade, null); assert.match(long.why, /too long \(2700 words\)/, 'over 2,500 words is left out');
  const order = ['k', '1', '2', '3', '4-5'];
  let last = -1;
  for (const n of [40, 150, 400, 900, 1800]) { const g = I.gradeOf(I.measure(Array(10).fill(pageOf(n / 10, 'garden')))); assert.ok(order.indexOf(g.grade) >= last, `${n} words: ${g.grade}`); last = order.indexOf(g.grade); }
  assert.deepEqual(I.GRADES, order);
});

test('evaluate: the fixtures are included or left out for the right reason', () => {
  const qs = [{ q: 'Who sat?', right: 'A cat', wrong: ['A dog', 'A cow'], page: 1, kind: 'literal' },
    { q: 'What did it see?', right: 'A ball', wrong: ['A bat', 'A box'], page: 2, kind: 'literal' },
    { q: 'Was it fun?', right: 'Yes', wrong: ['No', 'Maybe'], page: 3, kind: 'inference' }];
  const picks = Object.fromEntries(['0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008', '0009', '0010', '0011', '0012'].map(id => [id, { glossary: { kheer: 'rice pudding' }, questions: qs }]));
  const rows = IMP.evaluate({ storiesDir: path.join(FIX, 'pb-source/en'), metadataDir: path.join(FIX, 'pb-imagebank/metadata'), curation: { picks, skipped: {}, scanReviewed: {} } });
  const why = Object.fromEntries(rows.map(r => [r.sourceId, r.status === 'included' ? 'included' : r.reason]));
  assert.equal(why['0001'], 'included');
  assert.equal(why['0005'], 'included', 'Public Domain text and pictures');
  assert.match(why['0002'], /text license: NC/);
  assert.match(why['0003'], /03\.jpg license: SA/);
  assert.match(why['0004'], /license: ND/);
  assert.match(why['0006'], /04\.jpg license: NC/, 'mixed picture licenses');
  assert.match(why['0007'], /metadata missing/);
  assert.match(why['0008'], /no credits block/);
  assert.match(why['0009'], /pictures do not line up/);
  assert.match(why['0010'], /04\.jpg license: unreadable/);
  assert.match(why['0011'], /scanner flagged/);
  assert.match(why['0012'], /license: VERSION/);
  const b = rows.find(r => r.sourceId === '0001').book;
  assert.equal(b.id, 'sw-0001'); assert.equal(b.source, 'storyweaver');
  assert.deepEqual(b.credits.translation, ['Mira Translator']);
  assert.equal(b.credits.licenseName, 'CC BY 4.0');
  assert.equal(b.pages[1].image.src, '/img/library/sw-0001/03.webp');
  assert.equal(rows.find(r => r.sourceId === '0005').book.credits.license, 'public-domain');
  for (const [i, x] of b.questions.entries()) { assert.equal(x.choices[x.answer], qs[i].right); assert.equal(x.choices.length, 3); }
  // A person reviewed the scanner's flag: the book comes in, with the note.
  const reviewed = IMP.evaluate({ storiesDir: path.join(FIX, 'pb-source/en'), metadataDir: path.join(FIX, 'pb-imagebank/metadata'), curation: { picks, skipped: {}, scanReviewed: { '0011': 'checked' } } });
  assert.equal(reviewed.find(r => r.sourceId === '0011').status, 'included');
  // Not picked: licensed but left out, with the curator's reason when there is one.
  const none = IMP.evaluate({ storiesDir: path.join(FIX, 'pb-source/en'), metadataDir: path.join(FIX, 'pb-imagebank/metadata'), curation: { picks: {}, skipped: { '0001': 'Too scary.' }, scanReviewed: {} } });
  assert.match(none.find(r => r.sourceId === '0001').reason, /read and left out: Too scary/);
  assert.match(none.find(r => r.sourceId === '0005').reason, /not picked/);
  // A picture listed in the metadata but missing from the image bank.
  const gone = IMP.evaluate({ storiesDir: path.join(FIX, 'pb-source/en'), metadataDir: path.join(FIX, 'pb-imagebank/metadata'), curation: { picks, skipped: {}, scanReviewed: {} }, hasImage: (id, f) => f !== '04.jpg' });
  assert.match(gone.find(r => r.sourceId === '0001').reason, /04\.jpg is in the metadata but not in the image bank/);
  const md = IMP.reportMarkdown(rows, { totalBytes: 1048576, generated: '2026-01-01' });
  assert.match(md, /Included: \*\*2\*\*/); assert.match(md, /\| sw-0002 \| NC Book \| text license: NC \|/);
  assert.equal(IMP.manifestOf(rows).books.length, 2);
});

test('checkQuestions: exactly 3, each with 3 different choices, one answer and a page in the book', () => {
  const ok = { q: 'Q?', choices: ['a', 'b', 'c'], answer: 1, page: 2 };
  assert.deepEqual(I.checkQuestions([ok, ok, ok], 3), []);
  assert.ok(I.checkQuestions([ok, ok], 3).length);
  assert.ok(I.checkQuestions([ok, ok, { ...ok, page: 4 }], 3).length);
  assert.ok(I.checkQuestions([ok, ok, { ...ok, choices: ['a', 'a', 'b'] }], 3).length);
  assert.ok(I.checkQuestions([ok, ok, { ...ok, answer: 3 }], 3).length);
});

// ------------------------------------------------------------------ the shipped manifest
test('the manifest: checked books over the US grades, every picture on disk, credits and 3 questions each, under 90 MB', () => {
  const books = LIB.books();
  assert.ok(books.length >= 55, `${books.length} books`);
  for (const g of I.GRADES) assert.ok(books.filter(b => b.grade === g).length >= 1, `grade ${g}`);
  const curation = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-library/storyweaver.json'), 'utf8'));
  let bytes = 0;
  const ids = new Set();
  for (const b of books) {
    assert.ok(!ids.has(b.id)); ids.add(b.id);
    assert.equal(b.source, 'storyweaver'); assert.match(b.id, /^sw-\d{4}$/);
    assert.ok(curation.picks[b.sourceId], `${b.id} was picked by a person`);
    assert.ok(['cc-by-4.0', 'public-domain'].includes(b.credits.license));
    assert.ok(b.credits.textLicense && b.credits.imageLicenses.every(I.isAllowed));
    assert.ok(b.credits.text.length && b.credits.illustration.length, `${b.id} credits`);
    assert.equal(b.credits.publisher, 'Pratham Books');
    assert.deepEqual(I.checkQuestions(b.questions, b.pages.length), [], b.id);
    assert.equal(b.questions.filter(x => x.kind === 'inference').length, 1, `${b.id}: one inference question`);
    for (const src of [b.cover.src, ...b.pages.map(p => p.image.src)]) {
      const f = path.join(ROOT, 'public', src); assert.ok(fs.existsSync(f), src); bytes += fs.statSync(f).size;
    }
    assert.ok(b.pages.every(p => p.image.w > 0 && p.image.h > 0), `${b.id}: picture sizes for layout`);
    const m = I.measure(b.pages.map(p => p.text));
    assert.equal(I.gradeOf(m).grade, b.grade, `${b.id}: the grade is the rule's`);
    assert.deepEqual(b.measures, { perPage: m.perPage, perSentence: m.perSentence, syllablesPerWord: m.syllablesPerWord, fk: m.fk, notSight: m.notSight });
    assert.ok(b.words <= 2500);
  }
  assert.ok(bytes < 90 * 1048576, `${(bytes / 1048576).toFixed(1)} MB`);
  // Answers are spread over the three places.
  const at = [0, 1, 2].map(k => books.flatMap(b => b.questions).filter(x => x.answer === k).length);
  assert.ok(Math.min(...at) > 30, `answers at ${at}`);
  // The reader page never gets the answers.
  assert.ok(!JSON.stringify(LIB.forReader(books[0])).includes('"answer"'));
  assert.ok(LIB.search({ grade: '2' }).length && LIB.search({ grade: '2' }).every(b => b.grade === '2'));
  assert.equal(LIB.search({ grade: 'nope' }).length, books.length, 'an unknown grade is all books');
  assert.deepEqual([LIB.gradeParam('4-5'), LIB.gradeParam('K'), LIB.gradeParam('', '1'), LIB.gradeParam('', '2'), LIB.gradeParam('', '3'), LIB.gradeParam('x', '9')], ['4-5', 'k', 'k', '1', '2', null]);
  assert.ok(LIB.search({ q: 'fawn' }).some(b => b.id === 'sw-0001'));
  assert.deepEqual(LIB.search({ q: 'zzzzqqq' }), []);
});

test('sentences and tokens: the cut the reader highlights and the TTS route reads', () => {
  const txt = 'The fawn said, “Oh, don\'t do that or he will also start crying.” His mother laughed. So did the fawn.';
  assert.deepEqual(sentences(txt).map(s => s.text), ['The fawn said, “Oh, don\'t do that or he will also start crying.”', 'His mother laughed.', 'So did the fawn.']);
  const two = 'Hee...Heee...Heeee... Pehelwaan ji jumped!\n\nNext line';
  for (const s of sentences(two)) assert.equal(two.slice(s.start, s.end), s.text);
  assert.equal(sentences(two).at(-1).text, 'Next line');
  assert.deepEqual(sentences('...'), []);
  const tk = tokens('A cat\nsat.');
  assert.deepEqual(tk.filter(t => t.word).map(t => [t.text, t.start]), [['A', 0], ['cat', 2], ['sat.', 6]]);
});

// ------------------------------------------------------------------ over HTTP
let server, BASE;
test.before(async () => { server = createApp().listen(0); await new Promise(r => server.once('listening', r)); BASE = `http://127.0.0.1:${server.address().port}`; });
test.after(() => { server.closeAllConnections(); server.close(); });
async function call(p, { method = 'GET', body, user = null } = {}) {
  const headers = { ...(user ? { cookie: cookieOf(user.id) } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) };
  const r = await fetch(BASE + p, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json, headers: r.headers };
}

test('pages: the library, a book, the reader and its credits for everyone; Assign only for school staff', async () => {
  const s = librarySeed({ book: null });
  const lib = await call('/library');
  assert.equal(lib.status, 200); assert.equal((lib.text.match(/class="lb-card"/g) || []).length, LIB.books().length);
  assert.ok(!lib.text.includes('/assign'), 'no Assign for a visitor');
  assert.equal((await call('/library?grade=2')).text.match(/class="lb-card"/g).length, LIB.search({ grade: '2' }).length);
  assert.match((await call('/library?grade=4-5')).text, /class="chip on" href="\/library\?grade=4-5" aria-current="true">[^<]*<span aria-hidden="true">[^<]*<\/span> Grades 4-5/);
  const old = await call('/library?level=3&q=boat');
  assert.equal(old.status, 301, 'an old Level link'); assert.equal(old.headers.get('location'), '/library?grade=2&q=boat');
  assert.ok((await call('/library', { user: s.teacher })).text.includes('/library/sw-0001/assign'));
  assert.ok(!(await call('/library', { user: s.kids[0] })).text.includes('/assign'));
  const book = await call('/library/sw-0096');
  assert.match(book.text, new RegExp(`lb-g${LIB.getBook('sw-0096').grade.replace('-', '')}`));
  assert.match(book.text, /About the grade level/); assert.match(book.text, /Oomba&#39;s estimate of the US school grade|Oomba's estimate of the US school grade/);
  assert.match(book.text, /Flesch-Kincaid grade: [\d.-]+/); assert.ok(!/Lexile level|Guided Reading level/.test(book.text.replace(/It is not a Lexile, Guided Reading or Fountas &amp; Pinnell level\./, '')));
  assert.match(book.text, /Words to know/); assert.match(book.text, /kheer/); assert.match(book.text, /creativecommons\.org\/licenses\/by\/4\.0/);
  assert.match(book.text, /Pratham Books does not endorse Oomba/); assert.match(book.text, /Bharati Jagannathan/);
  const rd = await call('/library/sw-0001/read');
  assert.equal(rd.status, 200); assert.match(rd.text, /A fawn was racing in the forest\./); assert.match(rd.text, /Translation: Manisha Chaudhry/);
  assert.match(rd.text, /<a class="btn btn-primary" href="\/library">[^<]*More stories/, 'More stories goes back to the whole library');
  const data = JSON.parse(/<script type="application\/json" id="page-data">([^<]*)<\/script>/.exec(rd.text)[1]);
  assert.ok(!JSON.stringify(data).includes('"answer"'), 'no answers on the page');
  assert.equal((await call('/library/sw-9999')).status, 404);
  assert.equal((await call('/library/sw-0001/assign', { user: s.kids[0] })).status, 404);
  assert.equal((await call('/library/sw-0001/assign', { user: s.teacher })).status, 200);
});

test('reading, answering and the class: progress, first-try marks, done, the Score and the teacher\'s results', async () => {
  const s = librarySeed({ book: null });
  const [ava, leo, mia] = s.kids;
  // Assign: staff of the class only, once per book.
  assert.equal((await call('/api/library/assign', { method: 'POST', user: s.kids[0], body: { bookId: 'sw-0001', classId: s.cls.id } })).status, 404);
  assert.equal((await call('/api/library/assign', { method: 'POST', user: s.outsider, body: { bookId: 'sw-0001', classId: s.cls.id } })).status, 404);
  const a = await call('/api/library/assign', { method: 'POST', user: s.teacher, body: { bookId: 'sw-0001', classId: s.cls.id, dueAt: '2030-01-10' } });
  assert.equal(a.status, 200, a.text); assert.match(a.json.redirect, new RegExp(`/class/${s.cls.id}`));
  assert.match((await call('/api/library/assign', { method: 'POST', user: s.teacher, body: { bookId: 'sw-0001', classId: s.cls.id } })).json.error, /already assigned/);
  assert.equal((await call('/api/library/assign', { method: 'POST', user: s.teacher, body: { bookId: 'sw-nope', classId: s.cls.id } })).status, 400);
  const cl = LIB.assignmentOf(s.cls.id, 'sw-0001'); assert.ok(cl);
  const stepId = LIB.storyOfLesson(cl.lesson_id).stepId;
  const bk = LIB.getBook('sw-0001'), n = bk.pages.length;
  const ctx = { cl: cl.id, step: stepId };
  // The class page row and the student's link into the reader with the assignment.
  assert.match((await call(`/class/${s.cls.id}`, { user: s.teacher })).text, /Smile Please!/);
  const go = await call(`/class/${s.cls.id}/lessons/${cl.id}`, { user: ava });
  assert.equal(go.status, 302); assert.equal(go.headers.get('location'), `/library/sw-0001/read?cl=${cl.id}&step=${stepId}`);
  // Questions before the last page: refused.
  assert.equal((await call('/api/library/sw-0001/answer', { method: 'POST', user: ava, body: { i: 0, c: 0, ...ctx } })).json.code, 'readFirst');
  // Ava reads with Read to me to page 6, then to the end.
  await call('/api/library/sw-0001/progress', { method: 'POST', user: ava, body: { page: 6, aloud: true, ...ctx } });
  let r = LIB.results(cl);
  assert.equal(r.students.find(p => p.id === ava.id).state, 'reading'); assert.equal(r.students.find(p => p.id === ava.id).page, 6);
  assert.equal(r.students.find(p => p.id === ava.id).aloud, true);
  await call('/api/library/sw-0001/progress', { method: 'POST', user: ava, body: { page: n, ...ctx } });
  await call('/api/library/sw-0001/progress', { method: 'POST', user: ava, body: { page: 2, ...ctx } });
  assert.equal(LIB.readOf(ava.id, 'sw-0001').page, n, 'the furthest page is kept');
  // A wrong answer: "look at page N", then the right one; only the first try is the mark.
  const right = i => bk.questions[i].answer, wrong = i => (bk.questions[i].answer + 1) % 3;
  let x = (await call('/api/library/sw-0001/answer', { method: 'POST', user: ava, body: { i: 1, c: wrong(1), ...ctx } })).json;
  assert.deepEqual([x.right, x.page, x.done], [false, bk.questions[1].page, false]);
  x = (await call('/api/library/sw-0001/answer', { method: 'POST', user: ava, body: { i: 1, c: right(1), ...ctx } })).json;
  assert.deepEqual([x.right, x.page], [true, null]);
  await call('/api/library/sw-0001/answer', { method: 'POST', user: ava, body: { i: 0, c: right(0), ...ctx } });
  x = (await call('/api/library/sw-0001/answer', { method: 'POST', user: ava, body: { i: 2, c: right(2), ...ctx } })).json;
  assert.equal(x.done, true); assert.equal(x.marks, '101');
  const row = P.get(cl.id, stepId, ava.id);
  assert.deepEqual([row.status, row.marks, row.score, row.label], ['done', '101', 67, 'aloud']);
  // Leo read it on his own before it was assigned: that does not count. Opening it from the class starts him again
  // from page 1 (his old reading is cleared), and the questions wait for the last page.
  for (const i of [0, 1, 2]) { if (i === 0) await call('/api/library/sw-0001/progress', { method: 'POST', user: leo, body: { page: n } }); await call('/api/library/sw-0001/answer', { method: 'POST', user: leo, body: { i, c: right(i) } }); }
  assert.ok(LIB.readOf(leo.id, 'sw-0001').quiz_at, 'Leo finished it on his own');
  const opened = await call(`/library/sw-0001/read?cl=${cl.id}&step=${stepId}`, { user: leo });
  assert.equal(opened.status, 200);
  assert.equal(LIB.readOf(leo.id, 'sw-0001'), null, 'his earlier reading is cleared');
  assert.equal((await call('/api/library/sw-0001/answer', { method: 'POST', user: leo, body: { i: 0, c: right(0), ...ctx } })).json.code, 'readFirst');
  await call('/api/library/sw-0001/progress', { method: 'POST', user: leo, body: { page: 1, ...ctx } });
  assert.equal(P.get(cl.id, stepId, leo.id).status === 'done', false, 'not done until he reads it again');
  assert.equal(LIB.readOf(leo.id, 'sw-0001').page, 1, 'reading carries on from where he is now, not cleared again');
  await call('/api/library/sw-0001/progress', { method: 'POST', user: leo, body: { page: n, ...ctx } });
  for (const i of [0, 1, 2]) await call('/api/library/sw-0001/answer', { method: 'POST', user: leo, body: { i, c: right(i), ...ctx } });
  assert.deepEqual([P.get(cl.id, stepId, leo.id).status, P.get(cl.id, stepId, leo.id).marks, P.get(cl.id, stepId, leo.id).label], ['done', '111', 'own']);
  // Someone else's assignment (an outsider sending the class's ids) is not counted for the class.
  await call('/api/library/sw-0001/progress', { method: 'POST', user: s.outsider, body: { page: 3, ...ctx } });
  assert.equal(P.get(cl.id, stepId, s.outsider.id), null);
  // A visitor (no account) can read and answer; nothing is saved.
  assert.equal((await call('/api/library/sw-0001/answer', { method: 'POST', body: { i: 0, c: right(0) } })).json.right, true);
  assert.equal((await call('/api/library/sw-0001/answer', { method: 'POST', body: { i: 7, c: 0 } })).status, 400);
  // The teacher's results.
  r = LIB.results(cl);
  assert.deepEqual([r.started, r.finished, r.hardest], [2, 2, 1]);
  assert.equal(r.students.find(p => p.id === mia.id).state, 'none');
  const page = await call(`/class/${s.cls.id}/progress/${cl.id}`, { user: s.teacher });
  assert.equal(page.status, 200);
  assert.match(page.text, /with Read to me/); assert.match(page.text, /on their own/); assert.match(page.text, /Question 2 was the hardest/);
  assert.match(page.text, /not started/);
  assert.equal((await call(`/class/${s.cls.id}/progress/${cl.id}`, { user: ava })).status, 404, 'students never see the class results');
  assert.equal((await call(`/class/${s.cls.id}/progress/${cl.id}`, { user: s.outsider })).status, 404);
  // The gradebook: one step done, and the Score counts the first-try marks (2 of 3 and 3 of 3).
  const items = SC.classItems(s.cls.id);
  assert.deepEqual(items.get(`${ava.id}:${cl.id}`).map(it => [it.kind, it.earned, it.possible]), [['quiz', 2, 3]]);
  const gb = P.classProgress(s.cls.id);
  const cell = p => gb.students.find(x => x.id === p.id).cells[gb.lessons.findIndex(l => l.id === cl.id)];
  assert.deepEqual([cell(ava).done, cell(ava).total, cell(ava).score.pct], [1, 1, 67]);
  assert.equal(cell(mia).done, 0);
  // Removing the story from the class and deleting an account keep things tidy.
  assert.equal(P.markDone(ava, cl.id, stepId).ok, false, 'a story step is done by reading, never by a tick');
});

test('Read to me with the AI voice: ctx story reads sentence s of page p by its numbers only', async () => {
  const { config, TTS_ALL_LOCALES } = await import('../../server/config.js');
  const V = await import('../../server/services/tts-voices.js');
  config.ttsEnabled = true; config.ttsProvider = 'mock'; config.ttsApiKey = ''; config.ttsLocales = [...TTS_ALL_LOCALES]; config.ttsMaxChars = 600;
  V.save(null, { locales: Object.fromEntries(TTS_ALL_LOCALES.map(l => [l, { on: l === 'en' }])) });
  try {
    const say = body => call('/api/tts', { method: 'POST', body: { ctx: 'story', ...body, check: true } });
    assert.equal((await say({ book: 'sw-0001', page: 11, s: 1 })).json.ok, true);
    assert.equal((await say({ book: 'sw-0001', page: 11, s: 9 })).status, 404);
    assert.equal((await say({ book: 'sw-0001', page: 99, s: 0 })).status, 404);
    assert.equal((await say({ book: 'nope', page: 1, s: 0 })).status, 404);
    assert.equal((await say({ book: 'sw-0001', page: '1', s: 0 })).status, 404, 'numbers only');
  } finally { config.ttsEnabled = false; config.ttsProvider = 'openai'; }
});

test('account delete removes the reader\'s own progress', async () => {
  const s = librarySeed({ book: null });
  LIB.progress(s.outsider, 'sw-0003', { page: 2 });
  assert.ok(LIB.readOf(s.outsider.id, 'sw-0003'));
  const del = await import('../../server/services/account-delete.js');
  const r = del.deleteAccount(s.outsider.id, s.boss, { by: 'admin', parentMade: false });
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(q.get('SELECT COUNT(*) n FROM story_reads WHERE user_id=?', s.outsider.id).n, 0);
});
