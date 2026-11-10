// The Oomba Live question bank (server/live/bank, docs/decisions.md "The live question bank"): subjects x levels for
// teachers (/live) and solo practice (the games' language packs from scripts/live-bank.js).
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';

const BANK = await import('../../server/live/bank/index.js');
const { makeBank, SUBJECTS, LEVELS } = await import('../../server/live/bank/engine.js');
const textfilterMod = await import('../../server/services/textfilter.js');
const { profanityMatch } = textfilterMod;
const { cleanItems } = await import('../../server/services/classlive-sets.js');
const { availableLocales, tFor } = await import('../../server/i18n/index.js');
const { loadItems } = await import('../../server/services/classlive-quiz.js');
const { bankChoice } = await import('../../server/routes/live.js');

test('English: every hand-written subject has at least 25 questions at every level, each fair and clean', () => {
  const data = BANK.dataFor('en');
  for (const s of SUBJECTS.filter(x => x !== 'math')) for (const l of LEVELS) {
    const rows = data[s][l];
    assert.ok(rows && rows.length >= 25, `${s} ${l}: ${rows && rows.length}`);
    for (const r of rows) {
      assert.ok(r.length >= 3 && r.length <= 5, `${s} ${l}: ${r[0]}`);
      assert.equal(new Set(r.slice(1).map(x => x.toLowerCase())).size, r.length - 1, `different answers: ${r[0]}`);
      for (const x of r) assert.equal(profanityMatch(x), null, `filter: ${x}`);
      assert.ok(!r.some(x => /\d{7,}/.test(x)), `no phone-like numbers: ${r[0]}`);
    }
  }
});

test('items come out ready to play: the answer among the choices, and they pass the question-set checks', () => {
  for (const lang of ['en', 'en-GB', 'fr', 'ja', 'ar']) {
    const bank = BANK.bankFor(lang);
    for (const subject of ['mixed', ...bank.subjects()]) for (const level of LEVELS) {
      const items = bank.pick({ subject, level, count: 10 });
      assert.equal(items.length, 10, `${lang} ${subject} ${level}`);
      for (const it of items) {
        assert.ok(it.answer >= 0 && it.answer < it.choices.length, it.q);
        assert.ok(it.cat && it.q && !/\{\w+\}/.test(it.q), `${lang}: ${it.q}`);
      }
      assert.equal(cleanItems(items.map(({ q, choices, answer, secs, cat }) => ({ q, choices, answer, secs, cat }))).ok, true, `${lang} ${subject} ${level}`);
    }
  }
});

test('maths gets harder by level (fractions, percentages, negatives and algebra at 12-14)', () => {
  const bank = BANK.bankFor('en');
  const qs = l => Array.from({ length: 200 }, () => bank.mathItem(l).q).join('\n');
  assert.doesNotMatch(qs('a6'), /×|÷|%/);
  assert.match(qs('a10'), /÷/);
  const big = qs('a12'); assert.match(big, /%/); assert.match(big, /x \+/); assert.match(big, /squared/);
});

test('no repeats until the pool is used up', () => {
  const bank = BANK.bankFor('en'), seen = new Set();
  const a = bank.pick({ subject: 'history', level: 'a10', count: 20, seen }); a.forEach(x => seen.add(x.id));
  const b = bank.pick({ subject: 'history', level: 'a10', count: 5, seen });
  assert.equal(b.filter(x => seen.has(x.id)).length, 0);
});

test('a board: the chosen subjects as columns of 5, easy to hard; every language offers every subject', () => {
  const items = BANK.bankItems('bank:board:a10:science+history+geography', 'en');
  assert.equal(items.length, 15);
  assert.deepEqual([...new Set(items.map(x => x.cat))], ['Science', 'History', 'Geography']);
  const all = BANK.pickerFor('en').subjects.map(x => x.id);
  for (const lang of ['fr', 'de', 'es', 'pt', 'it', 'nl', 'ru', 'ja', 'zh-Hant', 'ar', 'he']) assert.deepEqual(BANK.pickerFor(lang).subjects.map(x => x.id), all, lang);
  assert.equal(BANK.parseBankId('bank:nope:a8:10'), null);
  assert.equal(BANK.parseBankId('bank:science:a9:10'), null);
});

test('British English spellings in en-GB', () => {
  const all = JSON.stringify(BANK.dataFor('en-GB'));
  assert.match(all, /colours/); assert.doesNotMatch(all, /\bcolors\b/);
  assert.match(all, /The fall of the Berlin Wall/, 'only the season becomes autumn');
});

test('live sessions take bank questions; the /live form turns into a bank id', () => {
  const r = loadItems(null, { starter: 'bank:geography:a12:15', lang: 'en' });
  assert.equal(r.ok, true); assert.equal(r.items.length, 15);
  assert.equal(loadItems(null, { starter: 'bank:geography:zz:15' }).ok, false);
  assert.deepEqual(bankChoice({ bankLevel: 'a6', bankSubject: 'science', bankCount: '5' }, 'mode:battle'), { board: false, level: 'a6', subject: 'science', count: 5, subs: [] });
  assert.equal(bankChoice({ bankLevel: 'x', bankSubject: 'evil', bankCount: '999', bankBoard: ['math', 'science', 'hack'] }, 'mode:board').subs.join(), 'math,science');
});

test('every site language has its words for the bank, with the same {slots} as English', () => {
  for (const { code } of availableLocales()) {
    const s = BANK.stringsFor(code), en = BANK.stringsFor('en');
    for (const k of Object.keys(en.math)) assert.deepEqual((s.math[k].match(/\{\w+\}/g) || []).sort(), (en.math[k].match(/\{\w+\}/g) || []).sort(), `${code} math.${k}`);
    for (const v of [...Object.values(s.subject), ...Object.values(s.level), ...Object.values(s.math)]) assert.equal(profanityMatch(v), null, `${code}: ${v}`);
    for (const k of ['title', 'subject', 'level', 'count', 'start', 'boardSubjects']) assert.ok(tFor(code)(`live.bank.solo.${k}`), `${code} solo.${k}`);
  }
});

test('maths: a game never asks the same question twice (10 and 20 questions, every level, a board column, a redraw)', () => {
  const bank = BANK.bankFor('en');
  for (const level of LEVELS) for (const count of [10, 20]) for (let g = 0; g < 300; g++) {
    const qs = bank.pick({ subject: 'math', level, count }).map(x => x.q);
    assert.equal(new Set(qs).size, count, `${level} x${count}: ${qs.join(' | ')}`);
  }
  for (let g = 0; g < 200; g++) {
    const mixed = bank.pick({ subject: 'mixed', level: 'a6', count: 20 }).map(x => x.q);
    assert.equal(new Set(mixed).size, mixed.length, 'mixed');
  }
  // A board column draws from three levels, and the same sum can be made at two of them: still never twice.
  for (const level of LEVELS) for (let g = 0; g < 600; g++) {
    const tiles = bank.board({ subjects: ['math', 'science'], level }).map(x => x.q), maths = tiles.slice(0, 5);
    assert.equal(tiles.length, 10);
    assert.equal(new Set(maths).size, 5, `a board's maths column at ${level}: ${maths.join(' | ')}`);
    assert.equal(new Set(tiles).size, 10, `a board at ${level}`);
  }
  // Questions already played (seen) are not drawn while the level has others.
  const first = bank.pick({ subject: 'math', level: 'a6', count: 20 });
  const next = bank.pick({ subject: 'math', level: 'a6', count: 20, seen: new Set(first.map(x => x.id)) });
  assert.equal(next.filter(x => first.some(y => y.q === x.q)).length, 0);
  // A pick bigger than the level's pool still fills (repeats only then).
  assert.equal(makeBank(BANK.dataFor('en'), BANK.stringsFor('en'), Math.random).pick({ subject: 'math', level: 'a6', count: 50 }).length, 50);
  // The server's redraw of a refused sum never puts back a question the set already has.
  const raw = makeBank(BANK.dataFor('en'), BANK.stringsFor('en'), Math.random);
  const set = raw.pick({ subject: 'math', level: 'a6', count: 20 });
  const bad = { ...set[0], q: '2x + 5 = 23 のとき、x は？', id: 'math:a12:x' };
  assert.equal(textfilterMod.cleanText(bad.q, 300).ok, false);
  const stuck = { mathItem: () => set[1] };   // only ever offers a question the set already has
  assert.equal(BANK.redraw(stuck, [bad, ...set.slice(1)])[0], bad, 'nothing new to draw: left as it is, never doubled');
  const fixed = BANK.redraw(raw, [bad, ...set.slice(1)]);
  assert.equal(new Set(fixed.map(x => x.q)).size, 20);
});

test('the games load their packs: right version, checksums match, the pack runs and makes questions', () => {
  const pv = fs.readdirSync('public/vendor/data/live-bank');
  assert.equal(pv.length, 1, 'one pack version');
  for (const g of ['quest-race', 'question-battle', 'brain-board']) {
    const html = fs.readFileSync(`seed-games/${g}.html`, 'utf8');
    const m = /var BANK_VER = '([^']+)', BANK_SRI = (\{[^;]*\});/.exec(html);
    assert.ok(m, g); assert.equal(m[1], pv[0], `${g}: built with scripts/live-bank.js`);
    const sri = JSON.parse(m[2]);
    for (const { code } of availableLocales()) {
      const body = fs.readFileSync(path.join('public/vendor/data/live-bank', pv[0], `${code}.js`));
      assert.equal('sha384-' + crypto.createHash('sha384').update(body).digest('base64'), sri[code], `${g} ${code}`);
    }
  }
  const w = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join('public/vendor/data/live-bank', pv[0], 'de.js'), 'utf8'), w);
  const p = w.window.OombaBank.de, bank = p.makeBank(p.data, p.strings, Math.random);
  assert.ok(bank.pick({ subject: 'math', level: 'a8', count: 3 }).every(x => /\?/.test(x.q)));
  assert.equal(p.strings.solo.start, tFor('de')('live.bank.solo.start'));
});

test('makeBank works with any random source (same seed, same questions)', () => {
  const seq = () => { let a = 7; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; };
  const data = BANK.dataFor('en'), strings = BANK.stringsFor('en');
  assert.deepEqual(makeBank(data, strings, seq()).pick({ subject: 'science', level: 'a8', count: 5 }).map(x => x.q), makeBank(data, strings, seq()).pick({ subject: 'science', level: 'a8', count: 5 }).map(x => x.q));
});

test('every language has the whole bank: same levels and counts as English, one right answer first, no repeated answers, clean words', async () => {
  const fs = await import('node:fs');
  const { profanityMatch } = await import('../../server/services/textfilter.js');
  const en = Object.fromEntries(fs.readdirSync('server/live/bank/en').map(f => [f, JSON.parse(fs.readFileSync(`server/live/bank/en/${f}`, 'utf8'))]));
  for (const lang of fs.readdirSync('server/live/bank').filter(d => !/\.js$/.test(d) && d !== 'en')) {
    for (const [f, src] of Object.entries(en)) {
      const d = JSON.parse(fs.readFileSync(`server/live/bank/${lang}/${f}`, 'utf8'));
      assert.deepEqual(Object.keys(d), Object.keys(src), `${lang}/${f} levels`);
      for (const [lv, items] of Object.entries(src)) {
        assert.equal(d[lv].length, items.length, `${lang}/${f} ${lv} count`);
        d[lv].forEach((it, i) => {
          assert.ok(it.length >= 3 && it.every(x => typeof x === 'string' && x.trim()), `${lang}/${f} ${lv} #${i}`);
          assert.equal(new Set(it.slice(1).map(x => x.toLowerCase())).size, it.length - 1, `${lang}/${f} ${lv} #${i}: answers differ`);
          for (const x of it) assert.ok(!profanityMatch(x), `${lang}/${f} ${lv} #${i}: ${x}`);
        });
      }
    }
  }
});


test('a generated maths question the text filter refuses is drawn again (ja "2x + 5 = 23" read as a rude word)', () => {
  const { cleanText } = textfilterMod;
  const bad = { q: '2x + 5 = 23 のとき、x は？', choices: ['9', '8', '10', '7'], answer: 0, secs: 20, cat: '算数', id: 'math:a12:2x + 5 = 23 のとき、x は？' };
  assert.equal(cleanText(bad.q, 300).ok, false, 'the filter refuses this one');
  const bank = BANK.bankFor('ja');
  const [fixed] = BANK.redraw(bank, [bad]);
  assert.notEqual(fixed.q, bad.q);
  assert.equal(cleanText(fixed.q, 300).ok, true);
  assert.ok(fixed.id.startsWith('math:a12:'));
  assert.equal(cleanItems([{ q: fixed.q, choices: fixed.choices, answer: fixed.answer, secs: fixed.secs, cat: fixed.cat }]).ok, true);
  // a hand-written item is left as it is
  const hand = { q: 'Q', choices: ['a', 'b'], answer: 0, secs: 20, cat: 'c', id: 'science:a8:0' };
  assert.equal(BANK.redraw(bank, [hand])[0], hand);
});
