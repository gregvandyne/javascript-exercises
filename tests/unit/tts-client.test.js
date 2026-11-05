// AI voices, the page-side fallback (public/js/tts.js): the device voice must read the same words the
// AI voice would. spokenText is the shared strip: emoji and pictographs never reach an utterance —
// Greg heard a placement counting question's star row read aloud as repeated "star" (2026-11-05).
import test from 'node:test';
import assert from 'node:assert/strict';

const { spokenText } = await import('../../public/js/tts.js');

test('spokenText: a star-row question is spoken as its words only', () => {
  assert.equal(spokenText('Count the stars ⭐⭐⭐⭐⭐⭐⭐⭐⭐'), 'Count the stars');
  assert.equal(spokenText('⭐⭐⭐'), '');
  assert.equal(spokenText('Press 1️⃣ to start'), 'Press 1 to start', 'a keycap keeps its digit');
  assert.equal(spokenText('Family 👨‍👩‍👧 time'), 'Family time', 'a joined sequence goes whole');
  assert.equal(spokenText('Go 🇬🇧 team'), 'Go team', 'a flag is a picture too');
  assert.equal(spokenText('What is 3 × 4? Turn 6 ÷ 2 → 3'), 'What is 3 × 4? Turn 6 ÷ 2 → 3', 'maths symbols survive');
  assert.equal(spokenText('  Tap   ▶  to play 🎮 '), 'Tap to play', 'whitespace still collapses');
  assert.equal(spokenText(null), '');
});
