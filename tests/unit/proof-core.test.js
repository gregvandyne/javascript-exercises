// Mistake Hunt's planter and checker (the pure block between proof-core:begin and proof-core:end in
// seed-games/mistake-hunt.html; docs/decisions.md "Mistake Hunt"), run here on its own, and the game's registration:
//   - every one of the 30 kinds of mistake plants somewhere in our test passages, and its answer key fixes the passage
//     back to the teacher's text exactly (every candidate, not just one); a check counts it;
//   - the same text, kinds, count and seed plant the same mistakes; other seeds plant others; mistakes never overlap,
//     stay inside one paragraph and spread over the sentences;
//   - pin (kept on re-roll), re-roll one, remove, a teacher's own mistake on a span (only kinds that fit), problem();
//   - checking: a found mistake, a half fix, a correct word changed (reported, not counted), the accepted other fixes
//     of a run-on and a comma splice, curly quotes and spaces;
//   - every planted word passes the site's text filter; a passage with "constructor" or "__proto__" in it is plain text;
//   - the file: its own page, the scanner passes it, every language has every word with its placeholders, no em dash,
//     each kind's Common Core code is a real Language standard, the Learn shelf, the seed list, no spoken lines.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/mistake-hunt.html'), 'utf8');
const META = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-games/mistake-hunt.json'), 'utf8'));
const P = (() => { const box = { window: {} }; vm.runInNewContext(/\/\* proof-core:begin \*\/([\s\S]*?)\/\* proof-core:end \*\//.exec(HTML)[1], box); return box.window.ProofCore; })();
const I18N = (() => { const b = {}; vm.runInNewContext(HTML.slice(HTML.indexOf('// ==== I18N START ===='), HTML.indexOf('// ==== I18N END ====')) + '\nthis.I18N = I18N;', b); return JSON.parse(JSON.stringify(b.I18N)); })();
const { cleanText } = await import('../../server/services/textfilter.js');
const { scanVersion } = await import('../../server/services/scanner.js');
const lines = await import('../../server/services/tts-lines.js');
const { SHELF_INFO, LEARNING } = await import('../../server/learn.js');
const { SEED_GAMES } = await import('../../scripts/seed.js');
const SC = await import('../../server/services/proof-core.js');
const plain = x => JSON.parse(JSON.stringify(x));
const LANGS = ['en', 'en-GB', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'ru', 'ja', 'zh-Hant', 'ar', 'he'];

// Our own test passages (written for this test), together giving every kind of mistake room.
const CORPUS = [
  "A volcano is an opening in Earth's crust. Hot melted rock, called magma, rises from deep underground. When magma reaches the surface, it is called lava. Some volcanoes erupt with a loud boom, while others ooze lava slowly. Scientists who study volcanoes watch for small earthquakes. They look for changes in the ground. These clues help them warn people to leave their homes in time.\n\nMaya and I visited a volcano last summer. We walked carefully, and we saw red, orange, and yellow rocks. It's a place I'll never forget because it was so beautiful.",
  "On Monday, our class went to the library. Your library card is important, so don't lose it. The children found books about wolves, geese, and mice. I could have stayed there all day! Mr. Lee said that you're allowed to take two books home. He thinks it is better than watching TV, and he is right.",
  "The dogs' bowls were empty, so Sam filled them quickly. Then he played with the puppies in the yard. Their tails wagged happily. Later, the family ate dinner together. Where is the cat? It was hiding under the table because the thunder scared it. My sister's room was quiet, and she was reading a book about ancient Egypt.",
];
const tokText = (x, m) => P.tokenize(x).slice(m.a, m.b).map(t => t.s).join(' ');
/** Fix every mistake the way the key says, over the words students see. */
const fixAll = (x, ms) => P.key(x, ms).map(k => ({ a: k.a, b: k.b, s: k.right }));

test('30 kinds in 5 groups, each with a Common Core Language code that is a real standard, a name and a why line in English', () => {
  assert.equal(P.TYPES.length, 30);
  assert.deepEqual(plain(P.GROUPS), ['spell', 'usage', 'grammar', 'sent', 'punct']);
  const ela = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/standards/ccss-ela.json'), 'utf8'));
  const ids = new Set(); (function walk(o) { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') { if (typeof o.id === 'string') ids.add(o.id); Object.values(o).forEach(walk); } })(ela);
  for (const t of P.TYPES) {
    assert.ok(P.GROUPS.includes(t.g), t.k);
    assert.ok(ids.has(t.cc), `${t.k}: ${t.cc} is a CCSS ELA standard`);
    assert.ok(I18N.en[`ty.${t.k}`] && I18N.en[`why.${t.k}`], `${t.k} has a name and a why line`);
    assert.ok(I18N.en[`why.${t.k}`].length <= 140, `${t.k}: a why line fits 140 characters`);
  }
  for (const g of P.GROUPS) assert.ok(P.TYPES.filter(t => t.g === g).length >= 3, `${g} has kinds`);
  // grade presets grow with the grade; the two off-by-default kinds are never in a preset
  assert.ok(P.preset(0).length < P.preset(3).length && P.preset(3).length < P.preset(5).length);
  for (let g = 0; g <= 8; g++) assert.ok(!P.preset(g).includes('us-could-of') && !P.preset(g).includes('pc-stray'));
  assert.deepEqual(plain(P.preset(0)).sort(), ['pc-end', 'pc-i', 'pc-start']);
});

test('every kind plants in the test passages, and every candidate\'s key fixes the passage back to the teacher\'s text exactly', () => {
  let total = 0;
  for (const t of P.TYPES) {
    let n = 0;
    for (const x of CORPUS) {
      for (const c of P.allCandidates(x, [t.k])) {
        n++; total++;
        const ms = [c], fix = fixAll(x, ms);
        assert.equal(P.applyEdits(x, ms, fix), P.normText(x), `${t.k}: ${tokText(x, c)} -> ${c.w}`);
        const r = P.check(x, ms, fix);
        assert.deepEqual(plain(r.found), [0], `${t.k}: found`); assert.equal(r.changed.length, 0);
        assert.notEqual(P.norm(c.w), P.norm(tokText(x, c)), `${t.k}: the wrong text differs`);
        assert.equal(P.problem(x, ms), '', `${t.k}: kept`);
      }
    }
    assert.ok(n > 0, `${t.k} plants somewhere in the test passages`);
  }
  assert.ok(total > 250, `${total} candidates checked`);
});

test('planting: the same seed plants the same mistakes, other seeds others; never overlapping, inside one paragraph, spread out', () => {
  const kinds = P.TYPES.map(t => t.k);
  for (const x of CORPUS) {
    const a = P.plant(x, { types: kinds, n: 8, seed: 42 }), b = P.plant(x, { types: kinds, n: 8, seed: 42 });
    assert.deepEqual(plain(a), plain(b), 'the same seed, the same mistakes');
    const seen = new Set();
    for (let seed = 1; seed <= 60; seed++) {
      for (const n of [1, 4, 8, 15]) {
        const ms = P.plant(x, { types: kinds, n, seed });
        assert.ok(ms.length <= n);
        assert.equal(P.problem(x, ms), '', `seed ${seed}, ${n}: ${JSON.stringify(ms)}`);
        const s = ms.slice().sort((p, q) => p.a - q.a);
        for (let i = 1; i < s.length; i++) assert.ok(s[i].a >= s[i - 1].b, 'no overlap');
        assert.equal(P.applyEdits(x, ms, fixAll(x, ms)), P.normText(x), 'the key fixes them all');
        assert.equal(P.check(x, ms, fixAll(x, ms)).found.length, ms.length);
        if (n === 4) seen.add(JSON.stringify(ms));
      }
    }
    assert.ok(seen.size > 20, `other seeds plant other mistakes (${seen.size} different sets)`);
    // 8 mistakes in a passage of 15 or so sentences: at most 2 in any one sentence
    const ms = P.plant(x, { types: kinds, n: 8, seed: 3 }), sid = P.sentences(P.tokenize(x)), per = {};
    ms.forEach(m => { per[sid[m.a]] = (per[sid[m.a]] || 0) + 1; });
    assert.ok(Math.max(...Object.values(per)) <= 2, JSON.stringify(per));
  }
  // only the kinds asked for; none when no kind is chosen; a short passage plants what fits
  const only = P.plant(CORPUS[0], { types: ['pc-end', 'sp-common'], n: 6, seed: 9 });
  assert.ok(only.every(m => m.k === 'pc-end' || m.k === 'sp-common') && only.length === 6);
  assert.deepEqual(plain(P.plant(CORPUS[0], { types: [], n: 6, seed: 9 })), []);
  assert.ok(P.plant('My cat sleeps on the warm bed all day long, every day.', { types: ['us-there'], n: 5, seed: 1 }).length === 0);
});

test('pin, re-roll, re-roll one, remove: a pinned mistake stays on re-roll and the others change', () => {
  const x = CORPUS[0], kinds = P.preset(5);
  const ms = P.plant(x, { types: kinds, n: 6, seed: 5 });
  ms[2].p = 1;
  for (let seed = 6; seed < 30; seed++) {
    const again = P.reroll(x, ms, { types: kinds, n: 6, seed });
    assert.ok(again.some(m => m.a === ms[2].a && m.w === ms[2].w && m.p === 1), 'the pinned one stays, still pinned');
    assert.equal(P.problem(x, again), '');
    assert.ok(again.filter(m => !m.p).every(m => !ms.some(o => !o.p && o.a === m.a && o.b === m.b && o.w === m.w)), 'the others are not planted again');
  }
  // re-roll one: the others stay, that one moves, the same kind when it can
  const one = P.rerollOne(x, ms, 0, { types: kinds, seed: 77 });
  assert.equal(one.length, ms.length);
  for (const m of ms.slice(1)) assert.ok(one.some(o => o.a === m.a && o.w === m.w), 'the others stay');
  assert.ok(!one.some(o => o.a === ms[0].a && o.w === ms[0].w), 'that one is new');
  assert.ok(one.some(o => o.k === ms[0].k && o.a !== ms[0].a) || one.length === ms.length);
  assert.ok(one.some(o => o.p === 1 && o.a === ms[2].a), 'a pin stays a pin'); assert.equal(one.filter(o => o.p).length, 1, 'only the pinned one is pinned');
  // remove is the builder's splice: the rest is still a good list
  assert.equal(P.problem(x, ms.filter((_, i) => i !== 1)), '');
});

test('a teacher\'s own mistake: only the kinds that fit a selected span are offered; typed wrong text; refused when the same or overlapping', () => {
  const x = CORPUS[0], toks = P.tokenize(x);
  const at = w => toks.findIndex(t => t.s === w);
  const lib = P.fitting(x, [], at('beautiful.'), at('beautiful.') + 1).map(f => f.k);
  assert.ok(lib.includes('sp-common') && lib.includes('sp-suffix') && lib.includes('pc-end'), lib.join());
  assert.ok(!lib.includes('sx-runon') && !lib.includes('us-there'), 'nothing that does not fit one word');
  const s = at('lava.'), two = P.fitting(x, [], s, s + 2).map(f => f.k);
  assert.ok(two.includes('sx-runon') && two.includes('sx-splice'), two.join());
  const f = P.fitting(x, [], s, s + 2).find(f => f.k === 'sx-runon');
  assert.equal(f.w, 'lava some'); assert.equal(f.a, s); assert.equal(f.b, s + 2);
  // nothing fits a plain word with no rule ("ooze")
  assert.deepEqual(plain(P.fitting(x, [], at('ooze'), at('ooze') + 1).filter(c => c.k !== 'pc-stray')), []);
  // the kinds a typed mistake may take: by how many words are selected
  assert.ok(P.typesFor(x, 3, 4).includes('sp-common') && !P.typesFor(x, 3, 4).includes('sx-runon'));
  assert.ok(P.typesFor(x, 3, 5).includes('sx-runon') && !P.typesFor(x, 3, 5).includes('sp-common'));
  const own = P.custom(x, [], at('ooze'), at('ooze') + 1, ' oose ', 'sp-common');
  assert.deepEqual(plain(own), { a: at('ooze'), b: at('ooze') + 1, w: 'oose', k: 'sp-common', p: 1 });
  assert.equal(P.custom(x, [], at('ooze'), at('ooze') + 1, 'ooze', 'sp-common'), null, 'the same as the passage');
  assert.equal(P.custom(x, [own], at('ooze'), at('ooze') + 1, 'ouze', 'sp-common'), null, 'overlapping');
  assert.equal(P.custom(x, [], at('ooze'), at('ooze') + 1, 'x', 'no-such-kind'), null, 'a kind we do not have');
  assert.equal(P.custom(x, [], 0, 6, 'a b c d e f', 'sp-common'), null, 'more than 4 words');
  const para = toks.findIndex(t => t.sp === '\n\n');
  assert.equal(P.custom(x, [], para, para + 2, 'x y', 'sx-runon'), null, 'across a paragraph');
});

test('problem(): the shapes a saved set may not have', () => {
  const x = CORPUS[1], ok = P.plant(x, { types: P.preset(5), n: 3, seed: 2 });
  assert.equal(P.problem(x, ok), '');
  assert.equal(P.problem(x, []), 'count');
  assert.equal(P.problem(x, Array.from({ length: 16 }, (_, i) => ({ a: i * 3, b: i * 3 + 1, w: 'zz', k: 'sp-common' }))), 'count');
  assert.equal(P.problem(x, [{ ...ok[0], k: 'nope' }]), 'type');
  assert.equal(P.problem(x, [{ ...ok[0], k: '__proto__' }]), 'type');
  assert.equal(P.problem(x, [{ ...ok[0], w: tokText(x, ok[0]) }]), 'same');
  assert.equal(P.problem(x, [{ ...ok[0], b: 999 }]), 'range');
  assert.equal(P.problem(x, [{ ...ok[0], w: 'two  spaces' }]), 'range');
  assert.equal(P.problem(x, [{ ...ok[0], w: 'x'.repeat(81) }]), 'range');
  assert.equal(P.problem(x, [{ a: 0, b: 2, w: 'zz yy', k: 'sx-runon' }, { a: 1, b: 2, w: 'qq', k: 'sp-common' }]), 'overlap');
});

test('checking: a half fix, a correct word changed, the other accepted fixes of a run-on, quotes and spaces', () => {
  const x = 'The lava cools down. Some rocks form. It takes a long time.';
  const run = { a: 3, b: 5, w: 'down some', k: 'sx-runon' };
  const W = P.wrongTokens(x, [run]);
  assert.deepEqual(plain(W.map(t => t.s)), ['The', 'lava', 'cools', 'down', 'some', 'rocks', 'form.', 'It', 'takes', 'a', 'long', 'time.']);
  // two separate edits over the two words, and one edit over both: both count
  assert.deepEqual(plain(P.check(x, [run], [{ a: 3, b: 4, s: 'down.' }, { a: 4, b: 5, s: 'Some' }]).found), [0]);
  assert.deepEqual(plain(P.check(x, [run], [{ a: 3, b: 5, s: '  down.   Some ' }]).found), [0]);
  for (const s of ['down; some', 'down, and some', 'down, so some', 'down! Some']) assert.deepEqual(plain(P.check(x, [run], [{ a: 3, b: 5, s }]).found), [0], s);
  // half a fix is not a fix
  assert.deepEqual(plain(P.check(x, [run], [{ a: 3, b: 4, s: 'down.' }]).missed), [0]);
  // a correct word changed: reported, never counted against the mistake
  const r = P.check(x, [run], [{ a: 3, b: 5, s: 'down. Some' }, { a: 10, b: 11, s: 'longer' }]);
  assert.deepEqual(plain(r.found), [0]); assert.deepEqual(plain(r.changed), [{ a: 10, b: 11, was: 'long', now: 'longer' }]);
  // a word taken out ('' ) and put back the same is no change
  assert.deepEqual(plain(P.check(x, [run], [{ a: 10, b: 11, s: 'long' }]).changed), []);
  assert.equal(P.check(x, [run], [{ a: 10, b: 11, s: '' }]).changed[0].now, '');
  // curly and straight apostrophes are the same
  const y = "We can't wait.", c = { a: 1, b: 2, w: 'cant', k: 'pc-contraction' };
  assert.deepEqual(plain(P.check(y, [c], [{ a: 1, b: 2, s: 'can’t' }]).found), [0]);
  // overlapping and out-of-range edits are dropped, not trusted
  assert.deepEqual(plain(P.check(x, [run], [{ a: 3, b: 5, s: 'down. Some' }, { a: 4, b: 6, s: 'x' }, { a: -1, b: 2, s: 'y' }, { a: 0, b: 99, s: 'z' }]).found), [0]);
});

test('every planted word passes the site\'s text filter; word lists never inherit keys; text is normalized the way the cleaner wants', () => {
  for (const x of CORPUS) for (const c of P.allCandidates(x)) { const r = cleanText(c.w, 80); assert.ok(r.ok && r.value === c.w, `${c.k}: ${c.w}`); }
  assert.doesNotThrow(() => P.allCandidates('The constructor of toString and __proto__ was hasOwnProperty. Valueof is here today, and it is fine.'));
  assert.equal(P.normText('  One  line\r\nand more.\n\n\n Two\tparas.  '), 'One line and more.\n\nTwo paras.');
  const parts = P.split(Array.from({ length: 12 }, (_, i) => `Paragraph ${i} ` + 'has some words in it. '.repeat(10)).join('\n\n'));
  assert.ok(parts.length > 1 && parts.every(p => p.length <= P.LIMITS.maxText && p.length >= 40));
});

test('the server runs the same core and reads the same word tables', () => {
  const S = SC.proofCore();
  const x = CORPUS[2], o = { types: P.preset(6), n: 7, seed: 31 };
  assert.deepEqual(plain(S.plant(x, o)), plain(P.plant(x, o)));
  assert.equal(SC.proofT('es')('ty.pc-end'), I18N.es['ty.pc-end']);
  assert.equal(SC.proofT('en-GB')('mkPeriod'), 'Full stop'); assert.equal(SC.proofT('en-GB')('mkComma'), 'Comma', 'falls back to English');
  assert.equal(SC.proofT('pt-BR')('check'), I18N.pt.check, 'a regional language uses its base');
});

test('the file: its own page outside the Oomba Kit; the scanner passes it; every language has every word; no em dash; registered', () => {
  assert.doesNotMatch(HTML, /oomba-kit|Oomba\.(scene|kit)/);
  assert.equal(scanVersion(HTML).status, 'pass');
  for (const s of [HTML, JSON.stringify(META)]) assert.ok(!s.includes('\u2014'), 'no em dash');
  const en = I18N.en;
  for (const l of LANGS) {
    const w = I18N[l]; assert.ok(w, l);
    if (l === 'en-GB') { for (const k of Object.keys(w)) assert.ok(k in en, `en-GB ${k}`); continue; }
    for (const k of Object.keys(en)) {
      assert.ok(typeof w[k] === 'string' && w[k].trim(), `${l} ${k}`);
      const ph = s => (s.match(/\{\w+\}/g) || []).sort().join();
      assert.equal(ph(w[k]), ph(en[k]), `${l} ${k} keeps its placeholders`);
    }
  }
  assert.ok(SEED_GAMES.includes('mistake-hunt'));
  assert.equal(META.shelf, 'learn'); assert.deepEqual(SHELF_INFO['mistake-hunt'], { subject: 'words', from: 1, to: 8 });
  assert.equal(LEARNING['mistake-hunt'].key, 'mistakeHunt');
  for (const l of LANGS) {
    const loc = JSON.parse(fs.readFileSync(path.join(ROOT, `server/i18n/locales/${l}.json`), 'utf8'));
    assert.ok(loc.learn.games.mistakeHunt, `${l} learn.games.mistakeHunt`);
    if (l !== 'en') assert.ok(META.l10n[l] && META.l10n[l].description, `${l} description`);
  }
  assert.ok(lines.TTS_GAMES.has('mistake-hunt'));
  assert.equal(lines.gameLines('mistake-hunt', 'en', lines.readGame('mistake-hunt')).length, 0, 'reads nothing aloud yet');
  for (const f of ['public/covers/mistake-hunt.jpg', 'public/og/mistake-hunt.jpg', 'scripts/covers/mistake-hunt.recipe.js']) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
});
