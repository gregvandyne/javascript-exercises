// Crossword's "Upload a word list (PDF or Word)" (services/crossword-doc.js, services/pdf-text.js, the route
// POST /api/games/:id/words-from-doc; docs/decisions.md "Crossword: word lists from a PDF or Word file, with limits").
// Checked here, with files made in the test (tiny PDFs and .docx files) and the AI stood in for:
//   - the PDF reader: pages, text (plain and compressed, a font with a ToUnicode map), a scanned page has no text,
//     and the site's own printable PDF;
//   - a plain "word - definition" list is read with no AI at all (from a .docx and from a PDF); anything else goes to
//     the AI once, with its text cut at about 5 pages (the teacher is told);
//   - the limits: 2 MB, 5 pages, the type, no text; none of them asks the AI;
//   - what comes back passes the crossword's own set cleaner (cleanCrossItems): letters only, no word twice, every
//     word and clue through the text filter (a clue with personal details is left empty), never a give-away clue;
//   - the route: staff and grown-ups may, kids and guests may not; 10 a day each; the file is never kept or logged.
import './_live.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { call, publish, official, teacher, teacher2, kid, mum, boss, q, auth, DATA } from './_live.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const P = await import('../../server/services/pdf-text.js');
const D = await import('../../server/services/crossword-doc.js');
const G = await import('../../server/services/game-sets.js');
const { makePdf, makeDocx } = await import('./_crossword-files.js');

// ---------------------------------------------------------------- fixtures, made here (_crossword-files.js)
const LIST = ['Unit 3 Vocabulary', 'Word - Definition', 'habitat - where an animal lives', 'predator: an animal that hunts others', 'erosion - the wearing away of land', 'migrate - to move with the seasons'];
const PROSE = ['Ecosystems', 'Every living thing needs a home. The place where an animal lives is its habitat, and it gives the animal food,',
  'water and shelter. Some animals hunt other animals for food. They are called predators, and the animals they hunt are their prey.',
  'Wind and water slowly wear away rocks and soil. This is erosion. Over many years it can change the shape of the land.',
  'Some birds fly a long way when the seasons change. They migrate to find food and warm weather.'];
/** A stand-in for the model: what it answers, and what it was asked. */
function fakeAi(out) {
  const asked = [];
  return { asked, client: { messages: { create: async req => { asked.push(req); return { model: 'm', usage: {}, content: [{ type: 'text', text: JSON.stringify(out) }] }; } } } };
}
const NO_AI = { messages: { create: async () => { throw new Error('the AI was asked'); } } };
const clued = words => words.map(([w, c]) => [w, c || 'a clue']);

// ---------------------------------------------------------------- the PDF reader
test('pdf: pages and text, plain or compressed, a two-byte font through its ToUnicode map; a scanned page has no text', () => {
  for (const opts of [{}, { compress: false }, { cid: true }]) {
    const r = P.pdfInfo(makePdf([LIST.slice(0, 3), LIST.slice(3)], opts));
    assert.equal(r.pages, 2, JSON.stringify(opts)); assert.equal(r.fonts, true); assert.equal(r.encrypted, false);
    assert.equal(r.text, LIST.join('\n'), JSON.stringify(opts));
  }
  const scan = P.pdfInfo(makePdf([[], [], []], { scanned: true }));
  assert.deepEqual(scan, { pages: 3, text: null, fonts: false, encrypted: false });
  assert.equal(P.pdfInfo(makePdf([['a'], ['b'], ['c'], ['d'], ['e'], ['f']])).pages, 6);
  for (const bad of [Buffer.from('PK\u0003\u0004 a zip'), Buffer.alloc(4), 'a string', Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(P.PDF_MAX)])]) assert.equal(P.pdfInfo(bad), null);
  // The site's own printable cards (made by a browser: subset fonts, each with its map, a glyph at a time).
  const pack = P.pdfInfo(fs.readFileSync(path.join(ROOT, 'public/teachers/spot-the-trick-pack.pdf')));
  assert.equal(pack.pages, 5); assert.match(pack.text, /Spot the Trick/); assert.match(pack.text, /Subject: You won a tablet!/);
  assert.equal(P.readable('��� abc'), false); assert.equal(P.readable('habitat - where an animal lives'), true);
});

// ---------------------------------------------------------------- the no-AI path
test('a plain "word - definition" list is read as it is: bullets, numbers, a header and wrapped definitions; prose is not', () => {
  const r = D.listFromText(['Unit 3 Vocabulary', 'Word\tDefinition', '1. habitat - where an animal lives', '• predator: an animal that hunts', 'others for food', 'ice-cream = a cold treat', 'food chain – who eats whom', "o'clock\tthe hour", 'CO2 - a gas', 'habitat - again'].join('\n'));
  assert.deepEqual(r, { title: 'Unit 3 Vocabulary', words: [['habitat', 'where an animal lives'], ['predator', 'an animal that hunts others for food'], ['ice-cream', 'a cold treat'], ['food chain', 'who eats whom'], ["o'clock", 'the hour']] });
  assert.equal(D.listFromText(PROSE.join('\n')), null, 'a page of prose goes to the AI');
  assert.equal(D.listFromText('cat - a pet\ndog - barks'), null, 'fewer than 3 words');
  assert.equal(D.listFromText(['a: b', 'Habitat: where it lives', ...PROSE].join('\n')), null, 'a few pairs in a page of prose');
  assert.deepEqual(D.listFromText('水曜日：週の三日目\nÉcole – lieu où on apprend\nшкола - место учёбы').words.map(p => p[0]), ['水曜日', 'École', 'школа']);
});

test('the words: what the crossword takes (cleanCrossItems), each through the text filter, never a give-away clue', () => {
  const got = D.cleanWords([['habitat', 'where an animal lives'], ['CO2', 'a gas'], ['x', 'one letter'], ['predator', 'call 555-123-4567'], ['erosion', 'see www.example.com'],
    ['shit', 'rude'], ['Habitat', 'again'], ['prey', 'prey is hunted'], ['ice cream', 'a cold treat'], ['a'.repeat(25), 'too long'], ['migrate', 'x'.repeat(200)], 'nope']);
  assert.deepEqual(got.map(p => p[0]), ['habitat', 'predator', 'erosion', 'prey', 'ice cream', 'migrate']);
  assert.deepEqual(got.map(p => p[1]).slice(0, 5), ['where an animal lives', '', '', '', 'a cold treat'], 'personal details, a link and a give-away leave the clue empty');
  assert.equal(got[5][1].length, G.CROSS.clue);
  assert.ok(G.cleanCrossItems([{ t: 'Unit 3', w: clued(got) }]), 'with its clues filled in, the list saves');
  assert.equal(D.cleanWords(Array.from({ length: 50 }, (_, i) => [`word${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`, 'c'])).length, 30);
});

// ---------------------------------------------------------------- a file in, words out
test('a .docx or PDF word list: its words without asking the AI, and they pass the set cleaner', async () => {
  D.hooks.client = NO_AI;
  try {
    for (const [kind, buf] of [['docx', makeDocx(LIST)], ['pdf', makePdf([LIST])], ['pdf', makePdf([LIST], { cid: true })]]) {
      const r = await D.wordsFromFile({ kind, buf });
      assert.deepEqual(r, { ok: true, title: 'Unit 3 Vocabulary', words: [['habitat', 'where an animal lives'], ['predator', 'an animal that hunts others'], ['erosion', 'the wearing away of land'], ['migrate', 'to move with the seasons']], cut: false, ai: false }, kind);
      assert.ok(G.cleanCrossItems([{ t: r.title, w: r.words }]), `${kind}: saves as it is`);
    }
  } finally { D.hooks.client = undefined; }
});

test('a document that is not a list: one small AI call on its text (cut at about 5 pages), the answer cleaned', async () => {
  const ai = fakeAi({ title: 'Ecosystems', words: [{ word: 'habitat', clue: 'Where an animal lives' }, { word: 'CO2', clue: 'a gas' }, { word: 'predator', clue: 'Email mia@example.com' },
    { word: 'prey', clue: 'Prey is hunted' }, { word: 'erosion', clue: 'Wearing away of land' }, { word: 'Habitat', clue: 'again' }] });
  D.hooks.client = ai.client;
  try {
    const long = [...PROSE, ...Array.from({ length: 200 }, (_, i) => `Paragraph ${i + 1}: more about living things and the places they live, the food they eat and the land.`)];
    let r = await D.wordsFromFile({ kind: 'docx', buf: makeDocx(long), level: 'Grade 4' });
    assert.deepEqual(r, { ok: true, title: 'Ecosystems', words: [['habitat', 'Where an animal lives'], ['predator', ''], ['prey', ''], ['erosion', 'Wearing away of land']], cut: true, ai: true });
    assert.equal(ai.asked.length, 1);
    const sent = ai.asked[0].messages[0].content;
    assert.ok(sent.length < D.LIMITS.chars + 200, 'about 5 pages of text at most');
    assert.ok(sent.includes('Paragraph 1:') && !sent.includes('Paragraph 200:'), 'the start is read, the rest cut off');
    assert.equal(ai.asked[0].model, (await import('../../server/config.js')).config.builderModel, "set-ai's own model");
    assert.ok(ai.asked[0].max_tokens <= 4000); assert.equal(ai.asked[0].output_config.effort, 'low');
    assert.ok(G.cleanCrossItems([{ t: r.title, w: clued(r.words) }]));
    // A PDF of prose: its text, not the file.
    r = await D.wordsFromFile({ kind: 'pdf', buf: makePdf([PROSE]) });
    assert.equal(r.ok, true); assert.equal(r.cut, false); assert.equal(typeof ai.asked[1].messages[0].content, 'string');
    // A PDF whose font can't be read here (no map): the file goes to the model as a document.
    const nomap = Buffer.from(makePdf([PROSE], { cid: true }).toString('latin1').replace(/ \/ToUnicode \d+ 0 R/, ''), 'latin1');
    r = await D.wordsFromFile({ kind: 'pdf', buf: nomap });
    assert.equal(r.ok, true); assert.equal(ai.asked[2].messages[0].content[0].type, 'document');
    // Nothing to take: docNone; the AI off: aiOff.
    D.hooks.client = fakeAi({ title: '', words: [{ word: 'CO2', clue: 'x' }] }).client;
    assert.equal((await D.wordsFromFile({ kind: 'docx', buf: makeDocx(PROSE) })).code, 'docNone');
    D.hooks.client = null;
    assert.equal((await D.wordsFromFile({ kind: 'docx', buf: makeDocx(PROSE) })).code, 'aiOff');
    assert.equal((await D.wordsFromFile({ kind: 'docx', buf: makeDocx(LIST) })).ok, true, 'a plain list needs no AI');
  } finally { D.hooks.client = undefined; }
});

test('limits: 2 MB, 5 pages, the type, a scanned PDF, an empty or damaged file; none of them asks the AI', async () => {
  D.hooks.client = NO_AI;
  try {
    const code = async (kind, buf) => (await D.wordsFromFile({ kind, buf })).code;
    assert.equal(await code('pdf', Buffer.concat([makePdf([LIST]), Buffer.alloc(D.LIMITS.bytes)])), 'docBig');
    assert.equal(await code('pdf', makePdf([LIST, LIST, LIST, LIST, LIST, LIST])), 'docPages');
    assert.equal((await D.wordsFromFile({ kind: 'pdf', buf: makePdf([LIST, LIST, LIST, LIST, LIST]) })).ok, true, '5 pages is fine');
    assert.equal(await code('pdf', makePdf([[], []], { scanned: true })), 'docScan');
    assert.equal(await code('pdf', makePdf([[]])), 'docScan', 'a font but no words');
    assert.equal(await code('pdf', makeDocx(LIST)), 'docType'); assert.equal(await code('docx', makePdf([LIST])), 'docType');
    assert.equal(await code('txt', Buffer.from('cat - a pet')), 'docType'); assert.equal(await code('docx', Buffer.alloc(0)), 'docType');
    assert.equal(await code('docx', Buffer.from('PK\u0003\u0004 a broken zip, no directory')), 'docBad');
    assert.equal(await code('docx', makeDocx([' '])), 'docEmpty');
    assert.equal(await code('pdf', Buffer.from(makePdf([LIST]).toString('latin1').replace('/Root', '/Encrypt 9 0 R /Root'), 'latin1')), 'docBad', 'a locked PDF');
    assert.equal(D.LIMITS.pages, 5); assert.equal(D.LIMITS.chars, 15000); assert.equal(D.LIMITS.perDay, 10); assert.equal(D.LIMITS.words, 30);
  } finally { D.hooks.client = undefined; }
});

// ---------------------------------------------------------------- the route
const cw = publish(official, '<!doctype html><title>Crossword</title><p>crossword</p>', { source: 'seed', slug: 'crossword', title: 'Crossword' });
const post = (user, body, cookie) => call(`/api/games/${cw.id}/words-from-doc`, { method: 'POST', body, user, cookie });
const b64 = buf => buf.toString('base64');

test('route: a teacher and the admin get the words; a kid, a guest and a family grown-up are turned away; the file is never kept', async () => {
  D.hooks.client = NO_AI;
  try {
    for (const u of [teacher, boss]) {
      const r = await post(u, { kind: 'docx', data: b64(makeDocx(LIST)), level: '' });
      assert.equal(r.status, 200, `${u.username}: ${r.text}`);
      assert.deepEqual(r.json.words.map(p => p[0]), ['habitat', 'predator', 'erosion', 'migrate']); assert.equal(r.json.ai, false); assert.equal(r.json.cut, false);
    }
    const k = await post(kid, { kind: 'docx', data: b64(makeDocx(LIST)) });
    assert.equal(k.status, 403); assert.equal(k.json.code, 'notAllowed');
    // A family grown-up: the crossword's teacher tools (AI clues, saving a set) are not open to them today
    // (routes/family.js keeps them to playing), and nor is this.
    const m = await post(mum, { kind: 'docx', data: b64(makeDocx(LIST)) });
    assert.equal(m.status, 404);
    assert.equal((await call(`/api/games/${cw.id}/clues`, { method: 'POST', body: { words: ['cat'] }, user: mum })).status, 404, 'as for AI clues');
    const guest = auth.createGuest();
    const gc = await post(guest, { kind: 'docx', data: b64(makeDocx(LIST)) });
    assert.equal(gc.status, 403);
    assert.equal((await post(null, { kind: 'docx', data: b64(makeDocx(LIST)) })).status, 401);
    // The errors, by code.
    assert.equal((await post(teacher, { kind: 'pdf', data: b64(makePdf([LIST, LIST, LIST, LIST, LIST, LIST])) })).json.code, 'docPages');
    assert.equal((await post(teacher, { kind: 'pdf', data: b64(makePdf([[]], { scanned: true })) })).json.code, 'docScan');
    assert.equal((await post(teacher, { kind: 'png', data: 'AAAA' })).json.code, 'docType');
    const big = await post(teacher, { kind: 'pdf', data: b64(Buffer.alloc(D.LIMITS.bytes + 10)) });
    assert.equal(big.status, 413); assert.equal(big.json.code, 'docBig');
    // Never kept: no file under the data folder, and the log has only the kind and how many words.
    const files = []; const walk = d => { for (const f of fs.readdirSync(d, { withFileTypes: true })) f.isDirectory() ? walk(path.join(d, f.name)) : files.push(f.name); };
    walk(DATA);
    assert.ok(!files.some(f => /\.(pdf|docx)$/i.test(f)), files.join(','));
    const logs = q.all("SELECT details FROM audit_log WHERE action='game.doc_words'");
    assert.ok(logs.length >= 2); for (const l of logs) assert.doesNotMatch(l.details, /habitat|animal/);
  } finally { D.hooks.client = undefined; }
});

test('route: 10 files a day each (a file turned away for its pages does not count); the AI stand-in is asked for prose', async () => {
  const ai = fakeAi({ title: 'Ecosystems', words: [{ word: 'habitat', clue: 'Where an animal lives' }, { word: 'prey', clue: 'Hunted by others' }, { word: 'erosion', clue: 'Wearing away of land' }] });
  D.hooks.client = ai.client;
  try {
    assert.equal((await post(teacher2, { kind: 'pdf', data: b64(makePdf([LIST, LIST, LIST, LIST, LIST, LIST])) })).json.code, 'docPages');
    let r = await post(teacher2, { kind: 'docx', data: b64(makeDocx(PROSE)), level: 'Grade 4' });
    assert.equal(r.status, 200); assert.equal(r.json.ai, true); assert.deepEqual(r.json.words.map(p => p[0]), ['habitat', 'prey', 'erosion']); assert.equal(ai.asked.length, 1);
    for (let i = 2; i <= 10; i++) assert.equal((await post(teacher2, { kind: 'docx', data: b64(makeDocx(LIST)) })).status, 200, `file ${i}`);
    r = await post(teacher2, { kind: 'docx', data: b64(makeDocx(LIST)) });
    assert.equal(r.status, 429); assert.equal(r.json.code, 'docLimit');
    assert.equal(ai.asked.length, 1, 'the limit is checked before any AI');
    assert.equal((await post(teacher, { kind: 'docx', data: b64(makeDocx(LIST)) })).status, 200, 'per teacher');
  } finally { D.hooks.client = undefined; }
});

test('route: the teacher\'s focus line goes to the AI cleaned (trimmed, at most 200 characters); a rude or personal one is refused before any AI; none, none sent', async () => {
  const ai = fakeAi({ title: 'Ecosystems', words: [{ word: 'habitat', clue: 'Where an animal lives' }, { word: 'prey', clue: 'Hunted by others' }] });
  D.hooks.client = ai.client;
  const prose = b64(makeDocx(PROSE));
  try {
    let r = await post(boss, { kind: 'docx', data: prose, focus: '   Science   words only  ' });
    assert.equal(r.status, 200, r.text); assert.equal(ai.asked.length, 1);
    assert.match(ai.asked[0].messages[0].content, /<focus>\nScience words only\n<\/focus>/);
    assert.doesNotMatch(ai.asked[0].system, /Science words only/, 'never in the system prompt');
    // refused by the site's text filter: a clear code, no AI, and it does not count towards the day's 10
    for (const focus of ['only shit words', 'email me at someone@example.com', 'call 555-123-4567 first', 'see www.example.com', 42, ['a']]) {
      r = await post(boss, { kind: 'docx', data: prose, focus });
      assert.equal(r.status, 400, JSON.stringify(focus)); assert.equal(r.json.code, 'focusBad', JSON.stringify(focus));
    }
    assert.equal(ai.asked.length, 1, 'a refused focus never reaches the AI');
    // capped at 200 characters
    r = await post(boss, { kind: 'docx', data: prose, focus: 'Focus on the water cycle ' + 'and rain '.repeat(40) });
    assert.equal(r.status, 200, r.text);
    const inner = /<focus>\n(.*)\n<\/focus>/.exec(ai.asked[1].messages[0].content)[1];
    assert.ok(inner.length <= 200 && inner.startsWith('Focus on the water cycle'), inner);
    // none (absent, null or blank): no focus tag at all
    for (const body of [{}, { focus: null }, { focus: '   ' }]) {
      r = await post(boss, { kind: 'docx', data: prose, ...body });
      assert.equal(r.status, 200, r.text); assert.doesNotMatch(ai.asked.at(-1).messages[0].content, /<focus>/);
    }
    // a plain list needs no AI, so a focus is simply not used
    D.hooks.client = NO_AI;
    assert.equal((await post(teacher, { kind: 'docx', data: b64(makeDocx(LIST)), focus: 'Science words only' })).json.ai, false);
    // the focus is never logged
    for (const l of q.all("SELECT details FROM audit_log WHERE action='game.doc_words'")) assert.doesNotMatch(l.details, /Science|water cycle|focus/i);
  } finally { D.hooks.client = undefined; }
});

test('the editor: the upload button and its limits, every error has words in every language, no em dashes in English', () => {
  const html = fs.readFileSync(path.join(ROOT, 'seed-games/crossword.html'), 'utf8');
  const keys = ['uploadDoc', 'docLimits', 'docBig', 'docPages', 'docScan', 'docType', 'docLimit', 'docCut', 'docDoneList', 'docBad', 'docNone', 'docOff', 'focusL', 'focusPh', 'focusBad', 'aiBoxP'];
  const lines = html.split('\n').filter(l => /^\s*"[A-Za-z-]+": \{"title"/.test(l));
  assert.equal(lines.length, 13);
  for (const l of lines) {
    const lang = /"([A-Za-z-]+)"/.exec(l)[1], d = JSON.parse(l.trim().replace(/^"[A-Za-z-]+": /, '').replace(/,$/, ''));
    for (const k of keys) assert.ok(typeof d[k] === 'string' && d[k].length > 5, `${lang} ${k}`);
    if (lang.startsWith('en')) { for (const k of keys) assert.doesNotMatch(d[k], /—/, `${lang} ${k}: no em dash`); assert.equal(d.uploadDoc, 'Upload a word list (PDF or Word)'); }
  }
  assert.match(html, /\['docBig', 'docBad', 'docNone', 'docType', 'docPages', 'docScan', 'docLimit', 'focusBad'\]/, 'each error is shown by its own words');
});
