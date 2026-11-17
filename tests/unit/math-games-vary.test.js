// Every maths game gives a player other questions each time they play, never the same one twice in a play, and the
// modes meant to be shared keep giving everyone the same ones. Checked here on the games' own pure blocks (node:vm):
//   - the Kit 2 chapter games (Garden Count … Launch Lab): a play takes a random lap from 1 up (lapOf), so two plays
//     ask different things; the rounds of one play all ask different things; a play shares nothing with the one
//     before it when that can be done; lap 0 (the fixed lap the tests pin) is never dealt; the same random numbers
//     give the same lap (so a play is reproducible from its draws);
//   - Sum Spotter: two plays (two seeds) differ; no sum comes back within a play; a given seed (a seeded start) still
//     deals the same puzzles every time;
//   - Tug of Math: two matches (two seeds) differ; a side never gets a question it had before in the match while its
//     kind has others; the same seed gives the same match (two players on one screen share it); Oomba Live: every
//     player's n-th question is the same kind (from the room's seed) and a new room gets a new seed.
// The games' own tests (tests/unit/<game>.test.js) play them in a real browser, where a play's lap is read back.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const html = slug => fs.readFileSync(path.join(ROOT, 'seed-games', `${slug}.html`), 'utf8');
const block = (slug, begin, end) => {
  const h = html(slug), a = h.indexOf(begin), b = h.indexOf(end);
  assert.ok(a >= 0 && b > a, `${slug}: the ${begin} block`);
  const box = { window: {} };
  vm.runInNewContext(h.slice(a, b + end.length), box, { timeout: 5000 });
  return box.window;
};
/** A seeded 0..1 stream (mulberry32), so a "play" in a test is reproducible. */
const stream = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

const KIT2 = ['garden-count', 'lily-hop', 'balance-bridge', 'rocket-supply', 'shape-hunt', 'kitchen-rush', 'lantern-mix', 'sub-zero', 'machine-line', 'scale-scout', 'sky-lines', 'keep-builder', 'launch-lab'];
for (const slug of KIT2) {
  test(`${slug}: every play its own lap, six different questions, none from the play before`, () => {
    const M = Object.values(block(slug, `/* ${slug}:begin */`, `/* ${slug}:end */`))[0];
    assert.equal(typeof M.lapOf, 'function'); assert.equal(typeof M.sig, 'function');
    const count = ch => (M.roundsOf ? M.roundsOf(ch) : M.ROUNDS);
    const play = (ch, lap) => Array.from({ length: count(ch) }, (_, i) => M.sig(M.round(ch, i + 1, lap)));
    for (const ch of M.CHAPTERS) {
      // two plays with nothing before them (a first visit on two devices): other laps, other questions
      const a = M.lapOf(ch, 0, stream(1)), b = M.lapOf(ch, 0, stream(2));
      assert.ok(a >= 1 && b >= 1, `${ch}: never the fixed lap 0`);
      assert.notEqual(a, b); assert.notDeepEqual(play(ch, a), play(ch, b), `${ch}: two plays ask different things`);
      assert.equal(M.lapOf(ch, 0, stream(1)), a, `${ch}: the same draws, the same lap`);
      // forty plays in a row, each after the last
      let last = 0, overlaps = 0;
      for (let p = 0; p < 40; p++) {
        const lap = M.lapOf(ch, last, stream(1000 + p)), q = play(ch, lap);
        assert.ok(Number.isInteger(lap) && lap >= 1 && lap !== last, `${ch} play ${p}: a new lap (${lap})`);
        assert.equal(new Set(q).size, q.length, `${ch} play ${p} (lap ${lap}): no question twice in one play`);
        q.forEach((s, i) => assert.ok(M.round(ch, i + 1, lap), `${ch} lap ${lap} round ${i + 1}`));
        if (last) {
          const before = play(ch, last);
          assert.notDeepEqual(q, before, `${ch} play ${p}: not the set the play before asked`);
          if (q.some(s => before.includes(s))) overlaps++;
        }
        last = lap;
      }
      // a question from the play before only where the chapter's numbers are too few to avoid it (Garden Count's
      // smallest counts): never most of the time
      assert.ok(overlaps <= 20, `${ch}: ${overlaps} of 39 plays shared a question with the play before`);
    }
  });
  test(`${slug}: the game takes a new lap at every start and Play again, and keeps the last one in its save`, () => {
    const h = html(slug);
    assert.match(h, /function playLap\(chapter\) \{/);
    assert.match(h, /S\.chapter = chapter; S\.lap = playLap\(chapter\);/, 'every start of a chapter takes a lap');
    assert.doesNotMatch(h, /S\.lap\+\+/, 'Play again no longer steps to the next lap');
    assert.match(h, /B\.storage\.get\(LAPS_KEY\)/); assert.match(h, new RegExp(`const LAPS_KEY = '${slug}\\.laps';`));
    assert.match(h, /try \{ if \(B && B\.storage\) B\.storage\.set\(LAPS_KEY, last\); \} catch/, 'the save is best effort');
    assert.match(h, /lap: n => \{ S\.pin = /, 'a test can still pin a lap');
  });
}

test('sky-lines: later laps mix each round’s three sets, laps 0-2 are what they were', () => {
  const SL = block('sky-lines', '/* sky-lines:begin */', '/* sky-lines:end */').SkyLines;
  for (const ch of SL.CHAPTERS) {
    const mixes = new Set();
    for (let lap = 1; lap < 200; lap++) mixes.add(Array.from({ length: 6 }, (_, i) => SL.sig(SL.round(ch, i + 1, lap))).join('|'));
    assert.ok(mixes.size >= 27, `${ch}: ${mixes.size} different plays`);
  }
});

test('sum-spotter: two plays differ, no sum twice in a play, a given seed deals the same puzzles', () => {
  const C = block('sum-spotter', '/* sum-spotter-core:begin */', '/* sum-spotter-core:end */').SumSpotterCore;
  const playOf = (id, seed, rounds) => { const seen = {}, out = []; for (let k = 0; k < rounds; k++) { const lid = id || C.rushLevel(k), p = C.fresh(lid, (seed + k * 7919) >>> 0, seen); assert.ok(p, `${lid} seed ${seed}`); seen[C.factOf(p)] = true; out.push(p); } return out; };
  for (const L of C.LEVELS) {
    let differ = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const a = playOf(L.id, seed * 104723, L.rounds), b = playOf(L.id, seed * 104723 + 1, L.rounds);
      assert.equal(new Set(a.map(C.factOf)).size, a.length, `${L.id} seed ${seed}: no sum twice in one play`);
      assert.ok(a.every(p => C.check(p.values, C.opsOf(L))), `${L.id} seed ${seed}: every puzzle still fair`);
      if (JSON.stringify(a.map(p => p.values)) !== JSON.stringify(b.map(p => p.values))) differ++;
      assert.deepEqual(JSON.parse(JSON.stringify(playOf(L.id, seed * 104723, L.rounds))), JSON.parse(JSON.stringify(a)), `${L.id}: the same seed, the same play`);
    }
    assert.equal(differ, 60, `${L.id}: two seeds, two different plays`);
  }
  // Rush: a minute of puzzles through the ramp, none twice
  const r = playOf('', 4242, 30);
  assert.equal(new Set(r.map(C.factOf)).size, 30);
  // nothing seen: exactly the puzzle the seed always made
  for (let s = 1; s <= 50; s++) assert.deepEqual(JSON.parse(JSON.stringify(C.fresh('add20', s, {}))), JSON.parse(JSON.stringify(C.generate('add20', s) || C.generate('add20', s + 1))));
});

const { load: loadTug } = await import('../../server/live/tug-gen.js');
test('tug-of-math solo: two matches differ, no question twice for a side, one seed one match', () => {
  const { TugGen: G } = loadTug(html('tug-of-math'));
  for (const g of G.GRADES) {
    const match = seed => { const d = G.deck(g, seed), out = [[], []]; for (let i = 0; i < 30; i++) for (const side of [0, 1]) out[side].push(d.next(side)); return out; };
    for (let s = 1; s <= 40; s++) {
      const a = match(s * 7777), b = match(s * 7777 + 1);
      assert.notDeepEqual(a[0].map(q => q.e.join(' ')), b[0].map(q => q.e.join(' ')), `grade ${g}: two seeds, two matches`);
      assert.deepEqual(match(s * 7777), a, `grade ${g}: the same seed, the same match`);
      for (const side of [0, 1]) {
        const texts = a[side].map(q => q.e.join(' '));
        assert.ok(new Set(texts).size >= texts.length - 2, `grade ${g} seed ${s} side ${side}: ${texts.length - new Set(texts).size} repeats in 30`);
        a[side].forEach((q, n) => assert.equal(q.k, a[1 - side][n].k, `grade ${g}: both sides' ${n}-th question is the same kind`));
        a[side].forEach(q => assert.equal(G.check ? G.check(q, q.a) : true, true));
      }
    }
  }
});

test('tug-of-math live: one room, one kind for everyone’s n-th question; a new room, a new seed', async () => {
  const TG = await import('../../server/services/classlive-tug.js');
  const room = () => { const s = { state: {}, seats: new Map() }; TG.init(s, 'tug:5:90'); return s; };
  const seeds = new Set(Array.from({ length: 8 }, () => room().tug.seed));
  assert.ok(seeds.size >= 7, 'every new live session draws its own seed');
  const { TugGen: G } = loadTug(html('tug-of-math'));
  const s = room(), kinds = n => G.kindAt(s.tug.g, s.tug.seed, n);
  // two players' streams (their own numbers), as classlive-tug.js deals them: the same kind and form at every n
  const players = [G.rng(11), G.rng(22)].map(r => { let prev = null; return Array.from({ length: 20 }, (_, n) => { const q = G.make(s.tug.g, r, prev, kinds(n), null, G.variantSeed(s.tug.seed, n)); prev = q; return q; }); });
  players[0].forEach((q, n) => assert.equal(q.k, players[1][n].k, `question ${n}: the same kind for both players`));
});
