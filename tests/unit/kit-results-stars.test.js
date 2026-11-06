// The results card's earned stars (sparks) must turn yellow in dark mode too: the night look sets the empty fill with
// a stronger selector (.ok-night .ok-sparks .ok-slot), so the lit rule has to match it (kit 1.1.4 fix).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('kit results: an earned spark is lit by a rule at least as specific as the night empty fill', () => {
  const src = fs.readFileSync(new URL('../../kit/src/screens.js', import.meta.url), 'utf8');
  assert.match(src, /\.ok-night \.ok-sparks \.ok-slot\{--ok-fill:/);
  assert.match(src, /\.ok-night \.ok-sparks \.ok-on[,{][^}]*--ok-fill:\$\{P\.spark\[2\]\}/);
});
