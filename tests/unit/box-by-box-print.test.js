// The Big Divide's worksheet (services/box-by-box-print.js, through the shared print route services/game-print.js;
// docs/decisions.md "The Big Divide: read aloud, worksheets, every language"):
//   - the answers are the game's own, worked on the server without floating point, for every kind and option;
//   - each problem is written as on paper (the division bracket, columns lined up) with room to work, the instructions
//     say how its options are written, the worksheet has no answers, and the answer key is on a page of its own;
//   - the request is plain numbers and fixed words, as a question set's item;
//   - the route: anyone may print the worksheet, only school staff get the key (students and parents never); Crossword's
//     print is unchanged (crossword-print.test.js).
import { call, publish, official, teacher, kid, mum, mia, auth } from './_live.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BP = await import('../../server/services/box-by-box-print.js');
const L = await import(path.join(ROOT, 'tools/box-by-box/src/lib/logic.ts'));
const { tFor } = await import('../../server/i18n/index.js');
const tEn = tFor('en');

test('worksheet answers are the game’s own: every kind and option, worked on the server without floating point', () => {
  const runs = [
    { k: 'divide', plan: { count: 60, dividends: [10, 99999], divisors: [2, 99], remainders: 'R' }, forms: ['R', 'fraction', 'decimal'] },
    { k: 'divide', plan: { count: 60, dividends: [100, 9999], divisors: [2, 25], remainders: 'R', numbers: 'decimal' }, forms: ['decimal'] },
    { k: 'multiply', plan: { count: 60, tops: [10, 9999], bottoms: [2, 999] } },
    { k: 'multiply', plan: { count: 60, tops: [10, 999], bottoms: [2, 99], numbers: 'decimal' } },
    { k: 'add', plan: { count: 60, tops: [10, 9999], bottoms: [10, 9999] } },
    { k: 'add', plan: { count: 60, tops: [100, 9999], bottoms: [100, 9999], numbers: 'decimal' } },
    { k: 'subtract', plan: { count: 60, tops: [100, 9999], bottoms: [10, 999] } },
    { k: 'subtract', plan: { count: 60, tops: [100, 9999], bottoms: [100, 999], numbers: 'decimal' } }
  ];
  let n = 0;
  for (const r of runs)
    for (const form of r.forms ?? ['R'])
      for (const [a, b] of L.kindInfo(r.k).settings.generate(r.plan)) {
        const sheet = r.k === 'divide' ? L.divideSheet({ dividend: a, divisor: b, form }) : L.kindInfo(r.k).sheet([a, b]);
        const ans = r.k === 'divide' ? BP.divideAnswer(a, b, form) : BP.columnAnswer(r.k, a, b);
        assert.equal(ans.text, L.showAnswer(sheet.answer), `${a} ${r.k} ${b} (${form})`);
        if (ans.rounded) assert.ok(sheet.note.includes(`it’s ${ans.rounded}.`), `${a} ÷ ${b}: rounds to ${ans.rounded}`);
        n++;
      }
  assert.ok(n > 500, `${n} problems`);
});

const DOCS = {
  R: { k: 'divide', p: [[745, 6], [92, 4], [1000, 3]] },
  fraction: { k: 'divide', p: [[745, 6], [30, 4]], r: 'fraction' },
  decimal: { k: 'divide', p: [[745, 6], [27, 6]], r: 'decimal' },
  decimals: { k: 'divide', p: [[12.6, 4], [4.5, 0.3]], dec: 1 },
  multiply: { k: 'multiply', p: [[24, 13], [4096, 908]] },
  multiplyDec: { k: 'multiply', p: [[2.4, 1.3], [0.6, 4]], dec: 1 },
  add: { k: 'add', p: [[475, 368], [3.5, 2.75]], dec: 1 },
  subtract: { k: 'subtract', p: [[400, 167], [5003, 2468]] },
  area: { k: 'divide', p: [[7.5, 3]], dec: 1, m: 'area' }
};
test('the worksheet: each problem as on paper with room to work, the instructions for its options, no answers; the key on its own page', () => {
  for (const [name, d] of Object.entries(DOCS)) {
    const r = BP.cleanBoxPrintDoc({ ...d, key: true });
    assert.equal(r.ok, true, name);
    const html = BP.boxPrintHtml(r.doc, { t: tEn });
    const sheet = html.slice(0, html.indexOf('cwp-key'));
    const key = html.slice(html.indexOf('cwp-key'));
    assert.equal((sheet.match(/<svg class="bbp-svg"/g) || []).length, d.p.length, `${name}: a picture for each problem`);
    assert.doesNotMatch(sheet, /bbp-ans/, `${name}: no answers on the worksheet`);
    assert.match(sheet, /Name:.*Date:/s);
    if (d.k === 'divide') assert.match(sheet, /class="bbp-line" d="M[\d.]+ 10 q/, `${name}: the division bracket`);
    else assert.match(sheet, d.k === 'multiply' ? />×</ : d.k === 'add' ? />\+</ : />−</, `${name}: the sign`);
    assert.match(html, /<section class="cwp-page cwp-key bbp-key">/);
    for (const a of r.doc.answers) for (const ch of a.text.split(' ')[0].replace('…', '')) assert.ok(key.includes(`>${ch === '.' ? '.' : ch}</text>`), `${name}: ${a.text} in the key`);
    assert.doesNotMatch(html, /—/, 'no em dashes');
  }
  const how = (d) => BP.boxPrintHtml(BP.cleanBoxPrintDoc(d).doc, { t: tEn }).match(/<p class="bbp-how">([^<]*)</)[1];
  assert.match(how(DOCS.R), /remainder with R/);
  assert.match(how(DOCS.fraction), /as a fraction/);
  assert.match(how(DOCS.decimal), /2 decimal places, and round/);
  assert.match(how(DOCS.decimals), /move both points/);
  assert.match(how(DOCS.multiplyDec), /count the decimal places/);
  assert.match(how(DOCS.add), /Line up the decimal points/);
  assert.match(how(DOCS.area), /area model/);
  // the key's extra lines: what a stopped decimal rounds to, a fraction simplified
  const k1 = BP.boxPrintHtml(BP.cleanBoxPrintDoc({ ...DOCS.decimal, key: true }).doc, { t: tEn });
  assert.match(k1, /Rounded: 124\.17/);
  const k2 = BP.boxPrintHtml(BP.cleanBoxPrintDoc({ ...DOCS.fraction, key: true }).doc, { t: tEn });
  assert.match(k2, /Simplified: 7 1\/2/);
  // no key unless asked; Hebrew: the page right to left, the math left to right
  assert.doesNotMatch(BP.boxPrintHtml(BP.cleanBoxPrintDoc(DOCS.R).doc, { t: tEn }), /cwp-key/);
  const he = BP.boxPrintHtml(BP.cleanBoxPrintDoc(DOCS.R).doc, { t: tFor('he'), dir: 'rtl', lang: 'he' });
  assert.match(he, /^<div class="cwp bbp" lang="he" dir="rtl">/);
  assert.match(he, /<div class="bbp-pic" dir="ltr">/);
});

test('the print request: plain numbers and fixed words only, as a question set’s item', () => {
  const bad = (d, why) => assert.deepEqual(BP.cleanBoxPrintDoc(d), { ok: false, code: 'bad' }, why);
  for (const d of [null, 'x', [], [DOCS.R]]) bad(d, JSON.stringify(d));
  bad({ ...DOCS.R, t: 'A title' }, 'no free text');
  bad({ ...DOCS.R, p: [] }, 'no problems');
  bad({ ...DOCS.R, p: [[3, 4]] }, 'a problem the game can’t work');
  bad({ ...DOCS.R, p: [[4.5, 0.3]] }, 'a decimal without dec');
  bad({ ...DOCS.R, k: 'power' }, 'a kind it doesn’t have');
  bad({ ...DOCS.R, p: Array(101).fill([92, 4]) }, 'too many');
  bad({ ...DOCS.R, key: 'yes' });
  bad({ ...DOCS.R, set: 'not-a-set' });
  assert.equal(BP.cleanBoxPrintDoc({ ...DOCS.R, set: 's-abcdefghjk' }).ok, true);
});

const bb = publish(official, '<!doctype html><title>The Big Divide</title><p>bb</p>', { source: 'seed', slug: 'box-by-box', title: 'The Big Divide' });
const post = (user, body, opts = {}) => call(`/api/games/${bb.id}/print`, { method: 'POST', body, user, ...opts });
test('route: anyone may print the worksheet; only school staff get the answer key (students and parents never)', async () => {
  const guest = auth.createGuest();
  for (const u of [teacher, mia, kid, mum, guest, null]) {
    const r = await post(u, { doc: DOCS.R });
    assert.equal(r.status, 200, `${u ? u.username : 'a visitor'}: ${r.text}`);
    assert.match(r.json.html, /bbp-sheet/); assert.doesNotMatch(r.json.html, /cwp-key/);
  }
  const k = await post(teacher, { doc: { ...DOCS.R, key: true } });
  assert.equal(k.status, 200); assert.match(k.json.html, /Long division: Answer key/);
  for (const u of [mia, kid, mum, guest, null]) {
    const r = await post(u, { doc: { ...DOCS.R, key: true } });
    assert.equal(r.status, 403, u ? u.username : 'a visitor'); assert.equal(r.json.code, 'key'); assert.equal(r.json.html, undefined);
  }
  assert.equal((await post(teacher, { doc: { ...DOCS.R, p: [[3, 4]] } })).status, 400);
  // the viewer's language
  const es = await call(`/api/games/${bb.id}/print`, { method: 'POST', body: { doc: DOCS.R }, headers: { 'accept-language': 'es' } });
  assert.equal(es.status, 200); assert.match(es.json.html, /lang="es"/);
  // the play page says Print is on
  assert.match((await call('/play/box-by-box')).text, /"print":true/);
});


test('the teacher’s own instructions: printed at the top as plain text (escaped, line breaks kept), never on the key; checked', () => {
  const bad = (d, why) => assert.deepEqual(BP.cleanBoxPrintDoc(d), { ok: false, code: 'bad' }, why);
  const note = 'Show your work.\nCircle <b>your</b> answer & check it.';
  const r = BP.cleanBoxPrintDoc({ ...DOCS.R, note, key: true });
  assert.equal(r.ok, true);
  const html = BP.boxPrintHtml(r.doc, { t: tEn });
  const sheet = html.split('cwp-key')[0];
  assert.match(sheet, /<p class="bbp-mine" dir="auto">Show your work\.\nCircle &lt;b&gt;your&lt;\/b&gt; answer &amp; check it\.<\/p><p class="bbp-how">/);
  assert.equal(html.match(/bbp-mine/g).length, 1, 'on the worksheet only, not the answer key');
  assert.doesNotMatch(BP.boxPrintHtml(BP.cleanBoxPrintDoc(DOCS.R).doc, { t: tEn }), /bbp-mine/, 'none without a note');
  assert.doesNotMatch(BP.boxPrintHtml(BP.cleanBoxPrintDoc({ ...DOCS.R, note: '  \n ' }).doc, { t: tEn }), /bbp-mine/, 'blank is none');
  assert.equal(BP.cleanBoxPrintDoc({ ...DOCS.R, note: 'a\u0000b\n\n\n\nc' }).doc.note, 'ab\n\nc');
  bad({ ...DOCS.R, note: 'x'.repeat(BP.PRINT_NOTE_MAX + 1) }, 'too long');
  bad({ ...DOCS.R, note: 7 }, 'not text');
});
