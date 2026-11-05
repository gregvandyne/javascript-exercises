// Playthrough-audit guards (2026-11-05): mission slides must state the TRUE amount of game work a step
// requires (chapter sizes + Packet Post's chained "bonus" chapters, counted from the games' own level
// data), duplicate chapter assignments must say so honestly, and every quick-check item in the audited
// units must carry a `why`, so a miss teaches the path to the answer instead of only naming it.
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
  'packet-post': { packets: [5, 5], routes: [4, 6], protocols: [2, 6], locks: [6, 7], tricks: [6, 10], ciphers: [3, 7] },
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
  'cyber-defenders 1b 4.1': 'the 2 messages there',
  'cyber-defenders 2 1.1': 'the 2 Many Roads levels',
  'cyber-defenders 2 2.3': 'check the 4 cards there',
};
// Steps whose game chapter was already required in full by an earlier step: the mission must say the
// step is already earned instead of pretending there are unplayed levels.
const HONEST_DUP = ['cyber-defenders 1b 2.2', 'cyber-defenders 1b 4.2', 'cyber-defenders 2 1.2', 'cyber-defenders 2 2.2', 'cyber-defenders 2 4.1'];

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

test('every quick-check item in the audited units carries a why, and a miss returns it', () => {
  const audited = {
    'cs-quest': ['0.1', '1.1', '1.2', '1.3', '1.4', '1.5', '2.1', '2.2', '3.1', '3.2', '3.3'],
    'cyber-defenders': ['0.1', '1.1', '1.2', '1.3', '2.1', '2.2', '2.3'],
  };
  let checked = 0;
  for (const { course, band, deck: d } of ALL) {
    if (!audited[course].includes(d.n)) continue;
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
  assert.equal(checked, 108, 'the audited units hold 108 deck-check items');
});
