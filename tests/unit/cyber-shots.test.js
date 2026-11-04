// Cyber Defenders capture spec (scripts/cyber-shots-spec.json): every shot the parity pass took, checked
// against the games it claims to show. Packet Post entries must name a real chapter for their band and a
// level inside it (games.json is the chapter table); Would You Rather entries must name a real dilemma in
// the game's "online" bank (the runner plays through the round until that dilemma is on screen). Every
// state must be registered in the shared manifest with the spec's alt, its WebP must exist, and at least
// one Cyber Defenders deck slide must use it — a capture nothing uses is drift.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'cyber-shots-spec.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'img', 'csq', 'manifest.json'), 'utf8'));
const manifestByKey = new Map(manifest.images.map(e => [e.key, e]));
const ppChapters = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons', 'cs-quest', 'games.json'), 'utf8')).games['packet-post'].chapters;
const wyrBank = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'data', 'would-you-rather', 'en.json'), 'utf8')).items;
const usedByDecks = new Set();
for (const band of ['1b', '2']) for (const f of fs.readdirSync(path.join(ROOT, 'seed-lessons', 'cyber-defenders', 'course', band))) {
  const deck = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons', 'cyber-defenders', 'course', band, f), 'utf8'));
  for (const s of deck.slides) if (s.img) usedByDecks.add(s.img);
}

test('the spec: unique states, real chapters and levels, real online dilemmas', () => {
  assert.ok(spec.length >= 40, `${spec.length} shots in the table`);
  const seen = new Set();
  for (const s of spec) {
    assert.ok(!seen.has(s.state), `${s.state} twice`); seen.add(s.state);
    assert.ok(['packet-post', 'would-you-rather'].includes(s.game), `${s.state}: a Cyber game`);
    assert.ok(typeof s.alt === 'string' && s.alt.length >= 1 && s.alt.length <= 160, `${s.state}: alt 1-160 chars`);
    assert.ok(typeof s.concept === 'string' && s.concept.length >= 3, `${s.state}: a concept line`);
    if (s.game === 'packet-post') {
      if (s.title) { assert.equal(s.chapter, 'title', 'the title-screen shot'); continue; }
      const ch = ppChapters.find(c => c.id === s.chapter && c.band === (s.band === '1b' ? '1B' : '2'));
      assert.ok(ch, `${s.state}: ${s.chapter} is a Packet Post chapter for band ${s.band}`);
      assert.ok(Number.isInteger(s.level) && s.level >= 1 && s.level <= ch.levels, `${s.state}: level ${s.level} inside ${s.chapter} (${ch.levels} levels)`);
      for (const a of s.actions) assert.ok(a.acts || a.solve || a.closeCards, `${s.state}: only acts/solve/closeCards actions drive Packet Post`);
    } else {
      const item = wyrBank.find(x => x.id === s.dilemma);
      assert.ok(item, `${s.state}: ${s.dilemma} is a real Would You Rather dilemma`);
      assert.equal(item.cat, 'online', `${s.state}: ${s.dilemma} is in the online bank`);
      assert.equal(s.chapter, 'online', `${s.state}: the online chapter`);
    }
  }
});

test('every spec state is in the manifest with the same alt, its WebP exists, and a deck slide uses it', () => {
  for (const s of spec) {
    const key = `csq/${s.game}/${s.state}`;
    const entry = manifestByKey.get(key);
    assert.ok(entry, `${key} is registered in public/img/csq/manifest.json`);
    assert.equal(entry.alt, s.alt, `${key}: manifest alt matches the spec`);
    assert.equal(entry.band, s.band, `${key}: manifest band matches the spec`);
    assert.ok(fs.existsSync(path.join(ROOT, 'public', 'img', `${key}.webp`)), `${key}.webp exists`);
    assert.ok(usedByDecks.has(key), `${key} is used by at least one Cyber Defenders slide`);
  }
});
