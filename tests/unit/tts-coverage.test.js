// Coverage: every official game is registered for AI voices (owner's rule, 5 Nov 2026 — docs/decisions.md
// "AI voices for every official game"). A new game — above all a game built for a course — fails here until it
// is added to GAMES in server/services/tts-lines.js, so it cannot silently ship on the device voice.
// Enumeration sources: (1) the official catalogue on disk, seed-games/*.html; (2) every game named by the
// course system, server/services/course-catalog.js (COURSES: each course's games list, owned and shared
// alike). When the Number Quest branch lands, its course entry names fraction-factory and this test fails
// until that game is registered too — that is the point.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lines = await import('../../server/services/tts-lines.js');
const catalog = await import('../../server/services/course-catalog.js');

test('every official seed game is registered for AI voices', () => {
  const slugs = fs.readdirSync(path.join(ROOT, 'seed-games')).filter(f => f.endsWith('.html')).map(f => f.slice(0, -5)).sort();
  assert.ok(slugs.length >= 30, `the seed catalogue is read (${slugs.length} games)`);
  for (const slug of slugs) assert.ok(lines.TTS_GAMES.has(slug), `${slug} is not in tts-lines GAMES: register it for AI voices`);
});

test('every game named by a course is registered for AI voices', () => {
  const slugs = new Set(catalog.COURSES.flatMap(c => c.games.map(g => g.slug)));
  assert.ok(slugs.size >= 6, `the course catalogue names games (${[...slugs].join(', ')})`);
  for (const slug of slugs) assert.ok(lines.TTS_GAMES.has(slug), `course game ${slug} is not in tts-lines GAMES: register it for AI voices`);
});

test('a registered game yields its lines, unless it is one of the known no-table games', () => {
  // These four keep their words outside a marked I18N block (identity-keyed string tables, or the kit's
  // literal strings), so the warm-up cannot read their lines yet. They are still registered: course
  // read-aloud takes their role from GAMES, and any future marked block is picked up automatically.
  // Adding a fifth name here needs the owner's say-so, not just a failing game.
  const NO_TABLE = new Set(['atlas-quest', 'code-isle', 'escape-the-post-office', 'trick-inbox']);
  for (const slug of lines.TTS_GAMES) {
    const g = lines.readGame(slug);
    if (!g) { assert.ok(NO_TABLE.has(slug), `${slug} is registered but its lines cannot be read`); continue; }
    assert.ok(lines.gameLines(slug, 'en', g).length > 0, `${slug} yields spoken lines`);
  }
});

test('no seed game calls the device speech API itself; speech goes through the shared path', () => {
  // The device voice remains only as the shared fallback inside public/js/tts.js and the SDK
  // (public/sdk/brb-sdk.js). A game that grows its own speechSynthesis call bypasses the AI voice.
  const dir = path.join(ROOT, 'seed-games');
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.html'))) {
    assert.ok(!fs.readFileSync(path.join(dir, f), 'utf8').includes('speechSynthesis'), `${f} calls speechSynthesis directly`);
  }
});
