// Playthrough-audit guards (2026-11-05): mission slides must state the TRUE amount of game work a step
// requires (chapter sizes + Packet Post's chained "bonus" chapters, counted from the games' own level
// data), duplicate chapter assignments must say so honestly, and every quick-check item in every
// course step and every exit item in the question sets must carry a `why`, so a miss teaches the path to the answer instead of only naming it.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const C = await import('../../server/services/courses.js');

// Chapter sizes [Explorer, Pro] counted from the games' level data (seed-games/*.html) on 2026-11-05.
const SIZE = {
  'robo-route': { sequences: [6, 6], loops: [7, 8], conditionals: [7, 7], variables: [6, 6], functions: [6, 7], debug: [7, 7], 'best-route': [5, 5], 'level-maker': [3, 3] },
  'packet-post': { packets: [5, 5], routes: [4, 6], protocols: [3, 6], locks: [6, 7], tricks: [6, 10], ciphers: [3, 7] },
  'data-detective': { sort: [6, 6], chart: [5, 5], claims: [6, 6], cleanup: [6, 6], models: [5, 5], fair: [4, 4], 'my-data': [3, 3] },
  'inside-the-machine': { parts: [6, 6], 'hw-sw': [5, 5], fixit: [7, 7], bits: [5, 7], gadget: [5, 5], 'design-lab': [3, 5] },
};
// Packet Post chapters that chain into a required second chapter when a step completes (D.THEN).
const CHAIN_PHRASE = {
  'cs-quest 1b 4.1': 'all 4 levels of Many Roads',
  'cs-quest 1b 4.3': 'the 2 messages there',
  'cs-quest 2 4.1': 'two Many Roads levels',
  'cs-quest 2 4.3': 'the 4 trick cards',
  'cyber-defenders 1b 1.1': 'all 4 levels of Many Roads',
  'cyber-defenders 2 1.1': 'the 2 Many Roads levels',
};
// Steps whose game chapter was already required in full by an earlier step: the mission must say the
// step is already earned instead of pretending there are unplayed levels. None left: since the
// 2026-11-06 student pass every step opens its own module (see the test below).
const HONEST_DUP = [];

function decks(course) {
  const out = [];
  for (const band of ['1b', '2']) {
    const dir = path.join(ROOT, 'seed-lessons', course, 'course', band);
    for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json')).sort()) {
      const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      out.push({ course, band, deck: d });
    }
  }
  return out;
}
const ALL = [...decks('cs-quest'), ...decks('cyber-defenders')];
const missionOf = d => d.slides.at(-1).text;

test('mission slides never understate the primary chapter size', () => {
  for (const { course, band, deck: d } of ALL) {
    if (!d.game || !SIZE[d.game.slug]) continue;
    const where = `${course} ${band} ${d.n}`;
    const m = missionOf(d);
    if (HONEST_DUP.includes(where)) {
      assert.ok(m.includes('already earned when the game opens'), `${where}: a duplicate chapter must be framed honestly`);
      continue;
    }
    const size = SIZE[d.game.slug][d.game.chapter][band === '1b' ? 0 : 1];
    if (d.game.chapter === 'level-maker') {
      assert.ok(m.includes('three maker tasks to finish this step') && m.includes('stretch'), `${where}: the three tasks finish the step; own-level work is a stretch`);
      continue;
    }
    const unit = d.game.chapter === 'gadget' || d.game.chapter === 'design-lab' ? 'briefs' : null;
    const num = unit
      ? (m.match(/(\d+|three|five)\s+briefs/) || [])[1]
      : (m.match(/(\d+)\s+(?:levels|cases|tickets|programs)/) || [])[1];
    if (num === undefined) continue; // the mission states no count: nothing false to catch here
    const stated = { three: 3, five: 5 }[num] ?? Number(num);
    assert.equal(stated, size, `${where}: mission states ${stated} but ${d.game.chapter} has ${size} in band ${band}`);
  }
});

test('chained Packet Post chapters are named in the mission with their true size', () => {
  for (const { course, band, deck: d } of ALL) {
    const where = `${course} ${band} ${d.n}`;
    const phrase = CHAIN_PHRASE[where];
    if (!phrase) continue;
    assert.ok(missionOf(d).includes(phrase), `${where}: mission must name the chained work ("${phrase}")`);
  }
});

test('every quick-check item in every course step carries a why, and a miss returns it', () => {
  // Since the 2026-11-10 pass every step of all three courses is covered: CS Quest units 4-6 already had
  // their whys (the old audited list just never named them), and Number Quest units 0-4 got theirs then.
  // Number Quest's bands are its tiers: every tier that has a deck folder is read (course/<tier>/).
  const nqRoot = path.join(ROOT, 'seed-lessons', 'number-quest', 'course');
  const nqTiers = fs.readdirSync(nqRoot).filter(x => fs.statSync(path.join(nqRoot, x)).isDirectory()).sort();
  assert.deepEqual(nqTiers, ['explorer', 'launchpad'], 'the Number Quest tiers that have decks');
  const nq = nqTiers.flatMap(band => fs.readdirSync(path.join(nqRoot, band)).filter(x => x.endsWith('.json')).sort()
    .map(f => ({ course: 'number-quest', band, deck: JSON.parse(fs.readFileSync(path.join(nqRoot, band, f), 'utf8')) })));
  let checked = 0;
  for (const { course, band, deck: d } of [...ALL, ...nq]) {
    for (const id of d.check) {
      const it = C.item(id);
      assert.ok(it, `${course} ${band} ${d.n}: ${id} exists`);
      assert.ok(typeof it.why === 'string' && it.why.length >= 20, `${course} ${band} ${d.n}: ${id} needs a why so a miss teaches`);
      const wrong = (it.answer + 1) % it.choices.length;
      const r = C.answerOne({ check: [id] }, id, wrong);
      assert.equal(r.right, false);
      assert.equal(r.why, it.why, `${id}: answerOne returns the why on a miss`);
      checked++;
    }
  }
  assert.equal(checked, 339, 'the three courses hold 339 deck-check items (CS Quest 129, Cyber Defenders 120, Number Quest 90: Explorer 69, Launchpad 21)');
});

test('every exit item in every question-set file carries a why', () => {
  // Exit items are the ones a course quick check or an exit ticket asks, so each carries a why. Openers
  // (unit pre-tests) and review items (CS Quest only: warm-ups and the unit review in the live games) are
  // vocabulary recall that never shows a why, so they are not required to carry one. No exit item is
  // skipped: the skip list stays empty unless an explanation cannot be verified against its lesson.
  const SKIP = new Set([]);
  let files = 0, exits = 0;
  for (const program of ['cs-quest', 'cyber-defenders', 'number-quest']) {
    const dir = path.join(ROOT, 'seed-lessons', program, 'sets');
    for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json')).sort()) {
      const bank = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      files++;
      for (const it of bank.items) {
        if (it.use !== 'exit' || SKIP.has(it.id)) continue;
        exits++;
        assert.ok(typeof it.why === 'string' && it.why.length >= 20 && it.why.length <= 240, `${program}/${f} ${it.id}: needs a short why`);
        assert.ok(!/[\u2013\u2014]/.test(it.why), `${program}/${f} ${it.id}: no long dashes in a why`);
      }
    }
  }
  assert.equal(files, 39, 'the three programs hold 39 question-set files');
  assert.equal(exits, 348, 'and 348 exit items, every one with a why');
});

// Packet Post's lesson chains, read from the game itself (PacketPostLevels.THEN, seed-games/packet-post.html).
import vm from 'node:vm';
const ppCtx = vm.createContext({});
for (const m of fs.readFileSync(path.join(ROOT, 'seed-games/packet-post.html'), 'utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)) {
  if (m[1].includes('PacketPostLevels')) vm.runInContext(m[1], ppCtx);
}
const PP = ppCtx.PacketPostLevels;

test('cyber defenders: no step replays work an earlier step already required (chained chapters and escape locks too)', () => {
  assert.ok(PP && PP.THEN && PP.LEVELS, 'Packet Post exposes its chains');
  for (const band of ['1b', '2']) {
    // What a step's module makes the player do: its own chapter, all of it, plus the chapter Packet Post chains
    // into at the end (all of it, or the levels THEN names); an escape lock (the whole escape counts as its own
    // finale module); a Trick Inbox set. Would You Rather is a free topic, not a finished chapter: not counted.
    const work = d => {
      const g = d.game;
      if (!g || g.slug === 'would-you-rather') return [];
      if (g.slug !== 'packet-post') return [{ id: `${g.slug}:${g.chapter}`, levels: null }];
      const out = [{ id: `packet-post:${g.chapter}`, levels: null }];
      const then = (PP.THEN[band] || {})[g.chapter];
      if (then) out.push({ id: `packet-post:${then.ch}`, levels: then.levels || null });
      return out;
    };
    const levelsOf = (id, lv) => {
      if (!id.startsWith('packet-post:')) return null;
      const all = PP.LEVELS.filter(l => l.ch === id.slice(12) && l.bands.includes(band)).map((_, i) => i + 1);
      return lv ? all.filter(n => n >= lv[0] && n <= lv[1]) : all;
    };
    const seen = new Map(); // id -> [{ n, levels }]
    const decksOf = ALL.filter(x => x.course === 'cyber-defenders' && x.band === band).sort((a, b) => parseFloat(a.deck.n) - parseFloat(b.deck.n));
    for (const { deck: d } of decksOf) {
      for (const w of work(d)) {
        const mine = levelsOf(w.id, w.levels);
        for (const before of seen.get(w.id) || []) {
          const overlap = mine ? mine.filter(n => before.levels.includes(n)) : [];
          assert.ok(mine ? !overlap.length : false, `cyber-defenders ${band} ${d.n}: ${w.id}${mine ? ` levels ${overlap.join(', ')}` : ''} already required by step ${before.n}`);
        }
        if (!seen.has(w.id)) seen.set(w.id, []);
        seen.get(w.id).push({ n: d.n, levels: mine });
      }
    }
  }
});
