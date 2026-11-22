// Mistake Hunt on the server (docs/decisions.md "Mistake Hunt"):
//   - the set's cleaner (game-sets.js cleanProofItems): the shape, sizes, every text through the site's text filter
//     (refused, never changed), every mistake by the game's own rules, the options only on the first passage;
//   - saving and My worksheets through the existing routes: save, list (label, size), rename, duplicate, delete, a
//     class code, owner only (404 for anyone else), guests refused;
//   - print (services/proof-print.js): anyone who can open the game gets the worksheet; the answer key only school
//     staff (a student, a kid, a family grown-up, a guest and a visitor get 403 'key'); the wrong text is the
//     server's own, the key's fixes the teacher's text; the legend, directions, codes and why lines; Hebrew right to
//     left with the passage left to right; the saved set's class code in the footer;
//   - "Upload a passage" (POST /api/games/:id/text-from-doc): a Word or PDF file's text, no AI, for grown-ups who may
//     host, never a kid; the frame offers it (BRB.canReadDocs) to a teacher only; the SDK and the play page carry it;
//   - the class Standards tab's seam: a lesson step that opens a set practises its mistakes' Common Core codes.
import './_live.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { call, publish, official, teacher, teacher2, kid, mum, mia, auth, q, RL } from './_live.js';
import * as G from '../../server/services/game-sets.js';
import { cleanProofPrintDoc } from '../../server/services/proof-print.js';
import { proofCore } from '../../server/services/proof-core.js';
import { stepGameCodes, stepGameCover } from '../../server/standards/official-tags.js';
import { makeDocx, makePdf } from './_crossword-files.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const P = proofCore();
const MH = publish(official, '<!doctype html><title>t</title><p>mh</p>', { source: 'seed', slug: 'mistake-hunt', title: 'Mistake Hunt' });
const X1 = "A volcano is an opening in Earth's crust. Hot melted rock, called magma, rises from deep underground. When magma reaches the surface, it is called lava. Some volcanoes erupt with a loud boom, while others ooze lava slowly.";
const clone = x => JSON.parse(JSON.stringify(x));
const item = (x, extra = {}, n = 4, seed = 3) => ({ t: 'Inside a volcano', x, g: 4, m: clone(P.plant(x, { types: P.preset(5), n, seed })), ...extra });
const X2 = 'On Monday, our class went to the library. Your library card is important, so don\'t lose it. The children found books about wolves, geese, and mice.';
const ITEMS = [item(X1, { o: { h: true, s: false, n: 'type' } }), item(X2, { t: 'Library day' }, 3, 8)];
const base = `/api/games/${MH.id}/sets`;
const save = async (items, user = teacher, extra = {}) => { const r = await call(base, { method: 'POST', body: { items, ...extra }, user }); return r; };
const print = (user, doc, headers = {}) => call(`/api/games/${MH.id}/print`, { method: 'POST', body: { doc }, user, headers });
const frameInit = async (user = null) => {
  const page = await call('/play/mistake-hunt', { user });
  assert.equal(page.status, 200);
  const frame = await call(/data-src="(\/frame\/[^"]+?)"/.exec(page.text)[1].replace(/&amp;/g, '&'), { user });
  return JSON.parse(/window\.__BRB_INIT__=(\{.*?\});<\/script>/.exec(frame.text)[1]);
};
test.beforeEach(() => RL._reset());

// ---------------------------------------------------------------- the cleaner
test('cleaner: a good set comes back the same (mistakes in order, options on the first passage, defaults filled)', () => {
  const got = G.cleanProofItems(clone(ITEMS));
  assert.ok(got);
  assert.equal(got.length, 2); assert.deepEqual(got[0].o, { h: true, s: false, n: 'type' }); assert.equal(got[1].o, undefined);
  assert.deepEqual(got[0].m, ITEMS[0].m.slice().sort((a, b) => a.a - b.a));
  const d = G.cleanProofItems([{ x: X1, g: 0, m: [{ ...ITEMS[0].m[0], p: 1 }], o: {} }]);
  assert.deepEqual(d[0].o, { h: true, s: true, n: 'total' }); assert.equal(d[0].t, ''); assert.equal(d[0].m[0].p, 1);
  assert.equal(G.SET_GAMES.get('mistake-hunt'), G.cleanProofItems);
});

test('cleaner: refuses the wrong shape, sizes, overlaps, a wrong text that is the right one, and anything the text filter refuses', () => {
  const bad = [];
  const one = (fn) => { const s = clone(ITEMS); fn(s); bad.push(s); };
  bad.push([], 'x', null, Array.from({ length: 9 }, () => item(X2)));
  one(s => { s[0].z = 1; });                                           // an unknown key
  one(s => { s[0].m[0].z = 1; });
  one(s => { s[1].o = { h: true }; });                                  // options on a later passage
  one(s => { s[0].o = { h: 'yes' }; }); one(s => { s[0].o = { n: 'all' }; }); one(s => { s[0].o = { q: 1 }; });
  one(s => { s[0].g = 9; }); one(s => { s[0].g = 2.5; }); one(s => { delete s[0].g; });
  one(s => { s[0].x = 'Too short.'; });                                // under 40 characters
  one(s => { s[0].x = X1 + ' Then more.'.repeat(140); });               // over 1,500
  one(s => { s[0].x = X1.replace('. Hot', '.  Hot'); });               // not the kept form (the offsets would move)
  one(s => { s[0].m = []; });                                           // a passage with no mistake
  one(s => { s[0].m.push({ ...s[0].m[0] }); });                        // overlapping
  one(s => { s[0].m[0].k = 'nope'; });
  one(s => { s[0].m[0].k = 'constructor'; });
  one(s => { s[0].m[0].w = P.tokenize(X1).slice(s[0].m[0].a, s[0].m[0].b).map(t => t.s).join(' '); });   // the same as the text
  one(s => { s[0].m[0].p = true; });
  one(s => { s[0].m[0].y = 'x'.repeat(141); });
  one(s => { s[0].t = 'x'.repeat(61); });
  // the text filter: a rude title, wrong word, why line or passage, personal details and links
  one(s => { s[0].t = 'Shit happens'; });
  one(s => { s[0].m[0].w = 'shit'; });
  one(s => { s[0].m[0].y = 'This is shit.'; });
  one(s => { s[0].x = X1 + ' Call me on 07700 900123 after school today.'; s[0].m = P.plant(s[0].x, { types: ['pc-end'], n: 1, seed: 1 }); });
  one(s => { s[0].x = X1 + ' See www.example.com for more.'; s[0].m = P.plant(s[0].x, { types: ['pc-end'], n: 1, seed: 1 }); });
  for (const [i, b] of bad.entries()) assert.equal(G.cleanProofItems(b), null, `case ${i}: ${JSON.stringify(b).slice(0, 120)}`);
  // too big as a whole (20,000 characters), though every part is within its own limit
  const long = (X1 + ' ' + X2 + ' ').repeat(4).slice(0, 1400).replace(/\s\S*$/, '') + '.';
  const big = Array.from({ length: 8 }, (_, i) => { const it = item(long, {}, 15, i + 1); it.m.forEach(m => { m.y = 'Read the sentence out loud and listen for where it stops, then check the capital letters and the end marks again. '.slice(0, 120); }); return it; });
  assert.ok(big.every(it => it.m.length >= 10 && it.x.length <= G.PROOF.maxText));
  assert.ok(JSON.stringify(big).length > G.PROOF.bytes, String(JSON.stringify(big).length)); assert.equal(G.cleanProofItems(big), null);
  assert.ok(G.cleanProofItems(big.slice(0, 3)), 'three of them are fine');
  // a why line of the teacher's own is kept (Phase 2 drafts them; the game's fixed line otherwise)
  const y = clone(ITEMS); y[0].m[0].y = '  Volcano   is spelled with one o at the end. ';
  assert.equal(G.cleanProofItems(y)[0].m[0].y, 'Volcano is spelled with one o at the end.');
});

// ---------------------------------------------------------------- saving and My worksheets
test('save, find by class code, My worksheets: list, rename, duplicate, delete; owner only; guests refused', async () => {
  q.run('DELETE FROM game_sets');
  const r = await save(ITEMS, teacher, { title: 'Volcanoes: find the mistakes' });
  assert.equal(r.status, 200, JSON.stringify(r.json)); const id = r.json.id;
  // anyone with the code gets the set to play (a practice game: its key is in the page, as Crossword's)
  const found = await call(`${base}/${id.slice(2, 7).toUpperCase()} ${id.slice(7)}`, { user: mia });
  assert.equal(found.status, 200); assert.equal(found.json.items.length, 2);
  const list = await call(base, { user: teacher });
  assert.equal(list.status, 200);
  const s = list.json.sets[0];
  assert.equal(s.title, 'Volcanoes: find the mistakes'); assert.equal(s.n, 7);
  assert.equal(s.label, 'Inside a volcano: 2 passages, 7 mistakes');
  assert.deepEqual(s.items, G.cleanProofItems(clone(ITEMS)));
  assert.deepEqual((await call(base, { user: teacher2 })).json.sets, [], 'nobody else\'s');
  // a bad set is turned down as 'bad'; a guest may not save
  assert.equal((await save([{ ...ITEMS[0], m: [] }])).json.code, 'bad');
  assert.equal((await save(ITEMS, auth.createGuest())).status, 403);
  // saving again under its code changes it; someone else can't
  const again = await save([ITEMS[1]], teacher, { id });
  assert.equal(again.json.id, id);
  assert.equal((await save(ITEMS, teacher2, { id })).status >= 400, true);
  // rename (through the filter), duplicate, delete: the owner's only
  const rn = await call(`${base}/${id}/rename`, { method: 'POST', body: { title: 'Library day set' }, user: teacher });
  assert.equal(rn.json.title, 'Library day set');
  assert.equal((await call(`${base}/${id}/rename`, { method: 'POST', body: { title: 'shit' }, user: teacher })).json.code, 'title');
  assert.equal((await call(`${base}/${id}/rename`, { method: 'POST', body: { title: 'x' }, user: teacher2 })).status, 404);
  const dup = await call(`${base}/${id}/duplicate`, { method: 'POST', body: {}, user: teacher });
  assert.equal(dup.status, 200); assert.equal(dup.json.set.title, 'Copy of Library day set'); assert.equal(dup.json.set.label, 'Library day: 1 passage, 3 mistakes');
  assert.equal((await call(`${base}/${id}`, { method: 'DELETE', user: teacher2 })).status, 404);
  assert.equal((await call(`${base}/${id}`, { method: 'DELETE', user: teacher })).status, 200);
  assert.equal((await call(`${base}/${id}`, { user: mia })).status, 404, 'its class code stops working');
  // the assign page's label
  assert.deepEqual(G.describe(MH.id, { chapter: dup.json.id, lock: '1' }, 'mistake-hunt'), { kind: 'one', label: 'Library day: 1 passage, 3 mistakes' });
});

test('the frame: a teacher gets My worksheets, Print, Assign and Upload a passage; a student only Print; a parent no document upload', async () => {
  const t = await frameInit(teacher);
  assert.equal(t.mySets, true); assert.equal(t.print, true); assert.equal(t.canAssign, true); assert.equal(t.docText, true);
  const s = await frameInit(mia);
  assert.equal(s.mySets, undefined); assert.equal(s.print, true); assert.equal(s.canAssign, undefined); assert.equal(s.docText, undefined);
  const k = await frameInit(kid); assert.equal(k.docText, undefined);
  const m = await frameInit(mum); assert.equal(m.docText, undefined, 'the grown-up fence refuses the call, so the game hides it');
});

// ---------------------------------------------------------------- print
test('print: a worksheet for anyone, the answer key for school staff only; the server writes the wrong text and the key', async () => {
  const doc = { T: 'Volcanoes', p: clone(ITEMS), key: false, set: '', note: 'Use a pencil.\nRead it out loud first.' };
  const guest = auth.createGuest();
  for (const u of [teacher, mia, kid, mum, guest, null]) {
    const r = await print(u, doc);
    assert.equal(r.status, 200, `${u ? u.username : 'a visitor'}: ${r.text}`);
    assert.doesNotMatch(r.json.html, /mhp-key/);
  }
  const html = (await print(mia, doc)).json.html;
  // the sheet: kicker, Name and Date, the title, directions by kind (the set's option), the legend, the wrong text, the note
  assert.match(html, /Mistake Hunt · Proofreading/); assert.match(html, /Name:/); assert.match(html, /Date:/);
  assert.match(html, /<h1 dir="auto">Inside a volcano<\/h1>/); assert.match(html, /<h1 dir="auto">Library day<\/h1>/);
  assert.match(html, /Find the mistakes \(/, 'told by kind (o.n = type)');
  for (const k of ['Capital', 'Lowercase', 'Add', 'Take out', 'Period', 'Comma', 'Apostrophe', 'Spelling']) assert.ok(html.includes(`</svg>${k}</span>`), k);
  const wrong = P.wrongText(ITEMS[0].x, ITEMS[0].m).replace(/'/g, '&#39;');
  assert.ok(html.includes(wrong), 'the passage as students see it');
  assert.match(html, /<div class="mhp-text" lang="en" dir="ltr">/);
  assert.match(html, /Use a pencil\.\nRead it out loud first\./);
  // the key: a teacher yes; everyone else 403 'key' and no page
  const k = await print(teacher, { ...doc, key: true });
  assert.equal(k.status, 200);
  assert.match(k.json.html, /Answer key · For teachers/); assert.match(k.json.html, /Key: school staff only/);
  const K = P.key(ITEMS[0].x, ITEMS[0].m);
  for (const e of K) {
    assert.ok(k.json.html.includes(`<b class="mhp-fix">${e.right.replace(/'/g, '&#39;')}</b><sup>${e.n}</sup>`), `fix ${e.n} in place`);
    assert.ok(k.json.html.includes(`(${e.cc})`), e.cc);
  }
  assert.ok(k.json.html.split('mhp-key').length - 1 >= 2, 'a key page for each passage');
  assert.doesNotMatch(k.json.html.slice(k.json.html.indexOf('mhp-key')), /Use a pencil/, 'the note is never on the key');
  for (const u of [mia, kid, mum, guest, null]) {
    const r = await print(u, { ...doc, key: true });
    assert.equal(r.status, 403, `${u ? u.username : 'a visitor'}`); assert.equal(r.json.code, 'key'); assert.equal(r.json.html, undefined);
  }
  // a bad request: anything the cleaner refuses, an unknown key, a note too long
  for (const d of [{ ...doc, p: [{ ...ITEMS[0], m: [] }] }, { ...doc, z: 1 }, { ...doc, note: 'x'.repeat(301) }, { ...doc, T: 'shit' }, 'x']) {
    const r = await print(teacher, d); assert.equal(r.status, 400); assert.equal(r.json.code, 'bad');
  }
  RL._reset();   // the route allows 20 a minute per address
  // a saved set: its class code and link in the footer
  const saved = G.save(MH.id, teacher.id, clone(ITEMS), null, 'mistake-hunt');
  const s = await print(mia, { ...doc, set: saved.id });
  const code = saved.id.slice(2).toUpperCase();
  assert.ok(s.json.html.includes(`Class code: ${code.slice(0, 5)} ${code.slice(5)}`));
  assert.ok(s.json.html.includes(`/play/mistake-hunt?chapter=${saved.id}&amp;lock=1`));
  // told "total" and "none"; one mistake reads "1 mistake"
  const tot = await print(mia, { ...doc, p: [{ ...ITEMS[0], o: { n: 'total' }, m: ITEMS[0].m.slice(0, 1) }] });
  assert.match(tot.json.html, /This passage has 1 mistake\./); assert.match(tot.json.html, /I found <i class="cwp-blank mhp-blank"><\/i> of 1 mistake\./);
  const none = await print(mia, { ...doc, p: [{ ...ITEMS[0], o: { n: 'none' } }] });
  assert.match(none.json.html, /Find the mistakes and use the marks to fix them\./); assert.doesNotMatch(none.json.html, /I found/);
  // the viewer's language and direction: Hebrew right to left, the passage left to right
  const he = await call(`/api/games/${MH.id}/print`, { method: 'POST', body: { doc: { ...doc, key: true } }, user: teacher, headers: { 'accept-language': 'he' } });
  assert.equal(he.status, 200); assert.match(he.json.html, /<div class="cwp mhp" lang="he" dir="rtl">/); assert.match(he.json.html, /הגהה/);
  assert.match(he.json.html, /<div class="mhp-text" lang="en" dir="ltr">/);
  assert.ok(cleanProofPrintDoc(doc).ok);
});

// ---------------------------------------------------------------- upload a passage
test('text from a document: a Word or PDF file\'s text, no AI; grown-ups who may host only; the limits', async () => {
  const url = `/api/games/${MH.id}/text-from-doc`;
  const docx = makeDocx(['Inside a volcano', 'A volcano is an opening in the crust of the Earth.', 'Hot rock rises from deep underground.']);
  const r = await call(url, { method: 'POST', body: { kind: 'docx', data: docx.toString('base64') }, user: teacher });
  assert.equal(r.status, 200, r.text);
  assert.match(r.json.text, /A volcano is an opening in the crust of the Earth\./); assert.equal(r.json.cut, false);
  const pdf = makePdf([['A volcano is an opening.', 'Hot rock rises.']]);
  const p = await call(url, { method: 'POST', body: { kind: 'pdf', data: pdf.toString('base64') }, user: teacher });
  assert.equal(p.status, 200, p.text); assert.match(p.json.text, /Hot rock rises\./);
  const scan = await call(url, { method: 'POST', body: { kind: 'pdf', data: makePdf([['x']], { scanned: true }).toString('base64') }, user: teacher });
  assert.equal(scan.json.code, 'docScan');
  const long = await call(url, { method: 'POST', body: { kind: 'pdf', data: makePdf(Array.from({ length: 6 }, () => ['A page.'])).toString('base64') }, user: teacher });
  assert.equal(long.json.code, 'docPages');
  assert.equal((await call(url, { method: 'POST', body: { kind: 'doc', data: 'AAAA' }, user: teacher })).json.code, 'docType');
  assert.equal((await call(url, { method: 'POST', body: { kind: 'docx', data: Buffer.from('not a zip').toString('base64') }, user: teacher })).json.code, 'docType');
  // who: never a kid or a student; a family grown-up is fenced off; signed out 401
  assert.equal((await call(url, { method: 'POST', body: { kind: 'docx', data: docx.toString('base64') }, user: kid })).status, 403);
  assert.equal((await call(url, { method: 'POST', body: { kind: 'docx', data: docx.toString('base64') }, user: mia })).status, 403);
  assert.equal((await call(url, { method: 'POST', body: { kind: 'docx', data: docx.toString('base64') }, user: mum })).status >= 403, true, 'the grown-up fence');
  assert.ok([401, 403].includes((await call(url, { method: 'POST', body: { kind: 'docx', data: docx.toString('base64') } })).status));
  // not for other games
  const cw = publish(official, '<!doctype html><title>t</title>', { source: 'seed', slug: 'crossword', title: 'Crossword' });
  assert.equal((await call(`/api/games/${cw.id}/text-from-doc`, { method: 'POST', body: { kind: 'docx', data: docx.toString('base64') }, user: teacher })).status, 404);
});

test('the SDK and the play page carry BRB.textFromDoc; the page checks the message', async () => {
  const sdk = fs.readFileSync(path.join(ROOT, 'public/sdk/brb-sdk.js'), 'utf8'), play = fs.readFileSync(path.join(ROOT, 'public/js/play.js'), 'utf8');
  assert.match(sdk, /canReadDocs: INIT\.docText === true/); assert.match(sdk, /send\('brb:textdoc', \{ id: n, file: file, kind: kind \}\)/);
  assert.match(play, /case 'brb:textdoc': textDocForGame\(m\); break;/); assert.match(play, /\/text-from-doc`/);
  const { validMessage } = await import('../../public/js/play.js').catch(() => ({}));
  if (validMessage) {
    const frame = {}, ev = data => ({ source: frame, data });
    globalThis.Blob ||= (await import('node:buffer')).Blob;
    assert.ok(validMessage(ev({ brb: 1, type: 'brb:textdoc', id: 1, file: new Blob(['x']), kind: 'pdf' }), frame));
    assert.equal(validMessage(ev({ brb: 1, type: 'brb:textdoc', id: 1, file: new Blob(['x']), kind: 'doc' }), frame), null);
  }
});

// ---------------------------------------------------------------- standards
test('standards: a lesson step that opens a passage set practises its mistakes\' Common Core codes; no set, none', () => {
  const saved = G.save(MH.id, teacher.id, clone(ITEMS), null, 'mistake-hunt');
  const want = [...new Set(ITEMS.flatMap(it => it.m.map(m => P.BY[m.k].cc)))].sort();
  assert.deepEqual(stepGameCodes('mistake-hunt', 'ccss-ela', '', `chapter=${saved.id}&lock=1`), want);
  assert.deepEqual(stepGameCover('mistake-hunt', 'ccss-ela', '4', `chapter=${saved.id}&lock=1`), want);
  assert.deepEqual(stepGameCodes('mistake-hunt', 'ccss-math', '', `chapter=${saved.id}&lock=1`), []);
  assert.deepEqual(stepGameCodes('mistake-hunt', 'ccss-ela', '4', ''), []);
  assert.deepEqual(stepGameCodes('mistake-hunt', 'ccss-ela', '', 'chapter=s-zzzzzzzzzz&lock=1'), []);
  assert.deepEqual(G.proofCodes(ITEMS), want);
});
