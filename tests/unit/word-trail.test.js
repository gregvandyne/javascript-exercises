// Word Trail (seed-games/word-trail.html): the word lists, the exercise generators, spaced repetition, hearts and the
// streak (the game's own WTCore block, run with node:vm), and its AI voices: every line the game speaks is one of its
// registered lines (server/services/tts-lines.js), and nothing else is.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = fs.readFileSync(path.join(ROOT, 'seed-games/word-trail.html'), 'utf8');
const cut = (a, b) => SRC.slice(SRC.indexOf(a), SRC.indexOf(b) + b.length);
const ctx = vm.createContext({ Math, Object, Array, JSON, String, Number });
ctx.window = ctx;
vm.runInContext(cut('// ==== I18N START ====', '// ==== I18N END ====') + '\nwindow.I18N = I18N;', ctx);
vm.runInContext(cut('/* wt-core:begin */', '/* wt-core:end */'), ctx);
const C = ctx.WTCore, T = ctx.I18N.en;
// the game's arrays come from another realm: compare them as plain JSON
const J = x => JSON.parse(JSON.stringify(x));
const deq = (a, b, m) => assert.deepEqual(J(a), J(b), m);
C.setText(T);
const lines = await import('../../server/services/tts-lines.js');

const DOLCH = {
  0: 'a and away big blue can come down find for funny go help here I in is it jump little look make me my not one play red run said see the three to two up we where yellow you',
  1: 'all am are at ate be black brown but came did do eat four get good have he into like must new no now on our out please pretty ran ride saw say she so soon that there they this too under want was well went what white who will with yes',
  2: 'after again an any as ask by could every fly from give going had has her him his how just know let live may of old once open over put round some stop take thank them then think walk were when',
  3: "always around because been before best both buy call cold does don't fast first five found gave goes green its made many off or pull read right sing sit sleep tell their these those upon us use very wash which why wish work would write your",
  4: 'about better bring carry clean cut done draw drink eight fall far full got grow hold hot hurt if keep kind laugh light long much myself never only own pick seven shall show six small start ten today together try warm',
};
const text = id => C.WORDS[id].text;
const wordRe = w => new RegExp(`(^|[^A-Za-z'])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z'])`, 'gi');

test('the word lists: the 220 Dolch words, Pre-primer to Grade 3, each with a sentence and its blank', () => {
  assert.equal(C.ORDER.length, 220);
  assert.equal(new Set(C.ORDER).size, 220, 'no word twice');
  for (const [u, list] of Object.entries(DOLCH)) {
    deq(C.UNITS[u].words.map(text), list.split(' '), `unit ${+u + 1} is the Dolch list in order`);
  }
  for (const id of C.ORDER) {
    const w = C.WORDS[id];
    assert.match(w.cls, /^[AVNPDCQ]$/, `${id} has a word class`);
    assert.ok(T[`w.${id}`] && T[`s.${id}`] && T[`c.${id}`], `${id} has its word, sentence and blank`);
    const s = T[`s.${id}`], c = T[`c.${id}`];
    assert.equal((s.match(wordRe(w.text)) || []).length, 1, `"${s}" has ${w.text} exactly once`);
    assert.equal((c.match(/…/g) || []).length, 1, `"${c}" has one blank`);
    assert.equal((c.match(wordRe(w.text)) || []).length, 0, `"${c}" does not give the word away`);
    assert.ok(s.split(/\s+/).length <= 9, `"${s}" is short`);
  }
});

test('the trail: 43 lessons of 4-6 new words, a review and a treasure per unit; every word is taught once', () => {
  const lessons = C.NODES.filter(n => n.kind === 'lesson');
  assert.equal(lessons.length, 43);
  assert.equal(C.NODES.filter(n => n.kind === 'review').length, 5);
  assert.equal(C.NODES.filter(n => n.kind === 'treasure').length, 5);
  for (const n of lessons) assert.ok(n.words.length >= 4 && n.words.length <= 6, `${n.id}: ${n.words.length} words`);
  const taught = lessons.flatMap(n => n.words);
  deq([...taught].sort(), [...C.ORDER].sort());
  // a unit ends with its review, then its treasure
  for (const U of C.UNITS) {
    const ns = C.NODES.filter(n => n.unit === U.i);
    deq(ns.slice(-2).map(n => n.kind), ['review', 'treasure']);
  }
});

const SEEDS = [1, 2, 3, 42, 777, 2026];
const pools = () => C.UNITS.map(U => U.words);
function oneRight(it, n) {
  assert.equal(it.choices.length, n, `${it.type} ${it.word}: ${n} choices`);
  assert.equal(it.choices.filter(c => c === it.word).length, 1, `${it.type} ${it.word}: exactly one right answer`);
  assert.equal(new Set(it.choices.map(c => text(c).toLowerCase())).size, n, `${it.type} ${it.word}: no duplicates`);
  for (const c of it.choices) for (const d of it.choices) if (c !== d) assert.ok(!C.soundsLike(c, d), `${it.type} ${it.word}: ${c} and ${d} sound alike`);
}

test('hear it / say-pick: one right answer, look-alike wrong ones, never two that sound alike', () => {
  for (const seed of SEEDS) {
    const r = C.rng(seed);
    for (const [u, pool] of pools().entries()) {
      for (const w of C.UNITS[u].words) {
        const h = C.hear(w, pool, r); oneRight(h, 4);
        const s = C.say(w, pool, r); oneRight(s, 3);
      }
    }
  }
  // plausible: most wrong choices share the first letter or a close length with the word
  const r = C.rng(5); let close = 0, all = 0;
  for (const w of C.UNITS[1].words) for (const c of C.hear(w, C.UNITS[1].words, r).choices) if (c !== w) { all++; if (text(c)[0] === text(w)[0] || Math.abs(text(c).length - text(w).length) <= 1) close++; }
  assert.ok(close / all > 0.7, `look-alikes: ${close}/${all}`);
  // to, too and two are never offered together (they sound the same)
  for (const seed of SEEDS) for (const w of ['to', 'too', 'two', 'for', 'four', 'no', 'know', 'right', 'write', 'there', 'their']) {
    const h = C.hear(w, C.ORDER, C.rng(seed));
    for (const c of h.choices) if (c !== w) assert.ok(!C.soundsLike(c, w), `${w} with ${c}`);
  }
});

test('fill the sentence: one right answer; the wrong ones can never fit (another kind of word, not in the sentence)', () => {
  for (const seed of SEEDS) {
    const r = C.rng(seed);
    for (const id of C.ORDER) {
      const it = C.fill(id, T[`s.${id}`], C.UNITS[C.WORDS[id].unit].words, r);
      oneRight(it, 3);
      for (const c of it.choices) {
        if (c === id) continue;
        assert.ok(C.ALLOW[C.WORDS[id].cls].includes(C.WORDS[c].cls), `${id} (${C.WORDS[id].cls}): ${c} (${C.WORDS[c].cls}) is a kind that cannot fit`);
        assert.equal((T[`s.${id}`].match(wordRe(text(c))) || []).length, 0, `${c} is not already in "${T[`s.${id}`]}"`);
      }
    }
  }
});

test('build it: the word\'s letters plus look-alike distractor letters that are not in the word', () => {
  for (const seed of SEEDS) {
    const r = C.rng(seed);
    for (const id of C.ORDER) {
      if (!C.canBuild(id)) { assert.ok(['a', 'i', 'dont'].includes(id), `${id} can be built`); continue; }
      const it = C.build(id, r), t = text(id);
      deq(it.letters.join(''), t);
      const rest = it.tiles.slice();
      for (const l of it.letters) { const k = rest.indexOf(l); assert.ok(k >= 0, `${t}: tile ${l}`); rest.splice(k, 1); }
      assert.ok(rest.length >= 1 && rest.length <= 3, `${t}: ${rest.length} extra tiles`);
      assert.equal(new Set(rest).size, rest.length, `${t}: no duplicate extra tile`);
      for (const l of rest) assert.ok(!t.includes(l), `${t}: extra ${l} is not in the word`);
      assert.ok(it.tiles.length <= 10, `${t}: at most 10 tiles`);
    }
  }
  // b and d: the classic mix-up is offered
  const tiles = new Set(); for (const seed of SEEDS) C.build('big', C.rng(seed)).tiles.forEach(x => tiles.add(x));
  assert.ok(tiles.has('d') || tiles.has('p'), 'big gets d or p');
});

test('match pairs and speed tap: different words, no sound-alikes; the word 2-3 times among six cards', () => {
  for (const seed of SEEDS) {
    const r = C.rng(seed);
    for (const U of C.UNITS) {
      const m = C.match(U.words.slice(0, 5), U.words, r, 3);
      assert.equal(m.words.length, 3); assert.equal(new Set(m.words).size, 3);
      deq([...m.right].sort(), [...m.words].sort());
      for (const a of m.words) for (const b of m.words) if (a !== b) assert.ok(!C.soundsLike(a, b));
      for (const w of U.words) {
        const s = C.speed(w, U.words, r);
        assert.equal(s.cards.length, 6);
        assert.equal(s.cards.filter(c => c === w).length, s.count);
        assert.ok(s.count === 2 || s.count === 3);
        for (const c of s.cards) if (c !== w) assert.ok(!C.soundsLike(c, w), `${w} with ${c}`);
      }
    }
  }
  const m = C.match(['to', 'two', 'too', 'big', 'red'], C.ORDER, C.rng(1), 3);
  assert.equal(m.words.filter(x => ['to', 'two', 'too'].includes(x)).length, 1);
});

test('a lesson: its new words first, then 12-13 exercises of every kind, each new word at least twice, missed words back', () => {
  const s = C.fresh();
  for (const n of C.NODES.filter(x => x.kind === 'lesson')) {
    const p = C.planLesson(s, n, 11, T);
    deq(p.intro, n.words);
    assert.ok(p.items.length >= 12 && p.items.length <= 13, `${n.id}: ${p.items.length} exercises`);
    for (const w of n.words) assert.ok(p.items.filter(i => i.word === w || (i.words || []).includes(w)).length >= 2, `${n.id}: ${w} twice`);
    const types = new Set(p.items.map(i => i.type));
    for (const k of ['hear', 'say', 'fill', 'match', 'speed']) assert.ok(types.has(k), `${n.id} has ${k}`);
    for (let i = 1; i < p.items.length; i++) if (p.items[i].word === p.items[i - 1].word) assert.ok(n.words.length < 3, `${n.id}: ${p.items[i].word} twice in a row`);
  }
  // after lesson 1, a missed word comes back in lesson 2 (and is first in practice)
  const a = C.fresh(); const L1 = C.NODES[0], L2 = C.NODES[1];
  C.grade(a, Object.fromEntries(L1.words.map(w => [w, w === 'big' ? { r: 1, w: 1 } : { r: 2, w: 0 }])));
  a.played = 1;
  deq(a.missed, ['big']);
  const p2 = C.planLesson(a, L2, 3, T);
  assert.ok(p2.items.some(i => i.word === 'big'), 'the missed word is in the next lesson');
  assert.equal(C.planPractice(a, 4, T).items[0].word, 'big');
  // a unit review has no new words and every kind of exercise
  const r = C.planReview(a, C.NODES.find(n => n.kind === 'review'), 9, T);
  assert.equal(r.intro.length, 0); assert.equal(r.items.length, 12);
  assert.ok(new Set(r.items.map(i => i.type)).size >= 5);
  assert.equal(C.planPractice(C.fresh(), 1, T), null, 'nothing to practise before the first lesson');
});

test('spaced repetition: right moves a word up a box and further away; a miss sends it back and onto the missed list', () => {
  const s = C.fresh();
  C.grade(s, { the: { r: 1, w: 0 } });
  assert.equal(s.words.the.b, 1); assert.equal(s.words.the.d, 0 + C.INTERVAL[1]);
  for (let L = 1; L <= 5; L++) { s.played = L; C.grade(s, { the: { r: 1, w: 0 } }); }
  assert.equal(s.words.the.b, 5, 'mastered at box 5');
  assert.equal(s.words.the.d, 5 + C.INTERVAL[5]);
  deq(C.due(s, 5, []), [], 'not due yet');
  s.played = 6; C.grade(s, { the: { r: 1, w: 1 } });
  assert.equal(s.words.the.b, 1, 'a miss from a high box drops to box 1');
  deq(s.missed, ['the']);
  assert.equal(s.words.the.d, 7);
  s.played = 7;
  C.grade(s, { red: { r: 1, w: 0 } }); s.words.red.d = 7;
  deq(C.due(s, 5, []), ['the', 'red'], 'missed words first');
  C.grade(s, { the: { r: 1, w: 0 } });
  deq(s.missed, [], 'off the missed list at box 2');
  assert.equal(C.mastery(s, 'the'), 2);
  // a word missed early (box 0) stays on the list for two right lessons
  C.grade(s, { see: { r: 0, w: 1 } }); s.played = 8; C.grade(s, { see: { r: 1, w: 0 } });
  deq(s.missed, ['see'], 'still practised at box 1');
  s.played = 9; C.grade(s, { see: { r: 1, w: 0 } });
  deq(s.missed, [], 'off the list at box 2');
  assert.equal(C.mastery(s, 'blue'), 0);
});

test('hearts come back over time and by practising; the streak counts days in a row', () => {
  const s = C.fresh(), t0 = 1_700_000_000_000;
  assert.equal(C.hearts(s, t0).n, 5);
  C.loseHeart(s, t0); C.loseHeart(s, t0 + 1000);
  assert.equal(C.hearts(s, t0 + 2000).n, 3);
  assert.equal(C.hearts(s, t0 + C.REGEN_MS + 5).n, 4, 'one back after the regen time');
  assert.equal(C.hearts(s, t0 + 3 * C.REGEN_MS).n, 5, 'never more than five');
  for (let i = 0; i < 7; i++) C.loseHeart(s, t0 + 4 * C.REGEN_MS);
  assert.equal(s.hearts, 0, 'never below zero');
  C.gainHeart(s, t0 + 4 * C.REGEN_MS); assert.equal(s.hearts, 1);
  const k = C.fresh();
  assert.equal(C.addDay(k, '2026-11-06'), true); assert.equal(k.streak, 1);
  assert.equal(C.addDay(k, '2026-11-06'), false, 'twice in a day counts once');
  assert.equal(C.addDay(k, '2026-11-07'), true); assert.equal(k.streak, 2);
  assert.equal(C.streakNow(k, '2026-11-08'), 2, 'still on the next day');
  assert.equal(C.streakNow(k, '2026-11-09'), 0, 'gone after a missed day');
  C.addDay(k, '2026-11-10'); assert.equal(k.streak, 1); assert.equal(k.best, 2);
  C.addDay(k, '2026-11-30'); C.addDay(k, '2026-12-01'); assert.equal(k.streak, 2, 'across a month');
  assert.equal(C.xpFor('lesson', 12, 12, 0, 12), 10 + 12 + 4 + 5);
  deq([C.starsFor(0), C.starsFor(2), C.starsFor(5)], [3, 2, 1]);
});

test('the trail opens one stone at a time; a save from anywhere is made safe', () => {
  const s = C.fresh();
  assert.equal(C.current(s).id, 'u0l0');
  assert.ok(C.open(s, C.BYID.u0l0)); assert.ok(!C.open(s, C.BYID.u0l1));
  s.done.u0l0 = 3; assert.equal(C.current(s).id, 'u0l1');
  const n = C.norm({ xp: 5, missed: ['nope', 'the'], words: null });
  assert.equal(n.xp, 5); deq(n.missed, ['the']); deq(n.words, {}); assert.equal(n.hearts, 5);
  assert.equal(C.norm(null).xp, 0);
});

test('AI voices: Word Trail is registered and every line it speaks is one of its own registered lines', () => {
  assert.ok(lines.TTS_GAMES.has('word-trail'));
  const g = lines.readGame('word-trail');
  const spoken = new Map(lines.gameLines('word-trail', 'en', g).map(x => [x.key, x]));
  for (const x of spoken.values()) assert.equal(x.role, 'friendly', `${x.key} in Bramble's voice`);
  // every word, sentence and blank sentence
  for (const id of C.ORDER) for (const k of [`w.${id}`, `s.${id}`, `c.${id}`]) {
    assert.ok(spoken.has(k), `${k} is registered`);
    deq(lines.allowedLine('word-trail', 'en', T[k], 'friendly'), { text: T[k], role: 'friendly' }, `${k} is allowed`);
  }
  // every key the game passes to speak()/speakAll() literally, and the families it builds ('w.' + id …)
  const code = SRC.slice(SRC.indexOf('/* The game:'));
  const literal = new Set();
  for (const m of code.matchAll(/speak(?:All)?\(\s*(\[[^\]]*\]|'[^']+')/g)) for (const k of m[1].matchAll(/'([a-z]+\.[a-zA-Z0-9]+)'/g)) literal.add(k[1]);
  for (const m of code.matchAll(/'((?:ins|ok|no|combo|done|review|practice|treasure|hearts|title|map|lesson|speed)\.[a-z0-9]+)'/g)) literal.add(m[1]);
  ['later'].forEach(k => literal.add(k));
  assert.ok(literal.size > 15, `found the game's spoken keys (${literal.size})`);
  for (const k of literal) {
    assert.ok(T[k], `${k} is in the I18N block`);
    assert.ok(spoken.has(k), `${k} is registered for AI voices`);
  }
  for (const n of [1, 2, 3, 4, 5, 6]) assert.ok(spoken.has(`ok.${n}`));
  for (const n of [3, 5, 8]) assert.ok(spoken.has(`combo.${n}`));
  for (const fam of ['w', 's', 'c']) assert.match(code, new RegExp(`'${fam}\\.' \\+`), `the game speaks ${fam}.* lines`);
  // screen labels are never read, and nothing else is allowed: no joins, no typed text, no word strings
  assert.ok(![...spoken.keys()].some(k => k.startsWith('ui.')));
  assert.equal(lines.allowedLine('word-trail', 'en', 'the big'), null);
  assert.equal(lines.allowedLine('word-trail', 'en', 'I see a big dog. Mom and Dad sing.'), null);
  assert.equal(lines.allowedLine('word-trail', 'en', 'Play'), null);
  assert.ok(!/speak\([^)]*ui\./.test(code), 'no ui.* line is spoken');
  assert.ok(!SRC.includes('speechSynthesis'));
});
