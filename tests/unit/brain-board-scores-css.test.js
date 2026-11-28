// Brain Board's projector score column (seed-games/brain-board.html .bb-rows): a team name is never cut with an
// ellipsis ("Orange Tig…", owner's 28 Nov audit). It fits the wider column or wraps cleanly onto a second line.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const html = fs.readFileSync(path.join(ROOT, 'seed-games/brain-board.html'), 'utf8');

test('brain board: projector team names wrap instead of being cut', () => {
  const nm = /\.bb-rows li \.nm\s*\{([^}]*)\}/.exec(html);
  assert.ok(nm, 'the team name rule');
  assert.doesNotMatch(nm[1], /text-overflow:\s*ellipsis/, 'no ellipsis');
  assert.doesNotMatch(nm[1], /white-space:\s*nowrap/, 'may wrap');
  assert.match(nm[1], /overflow-wrap:\s*break-word/, 'a very long word still breaks inside the column');
  const side = /\.bb-side\s*\{[^}]*width:\s*clamp\((\d+)px/.exec(html);
  assert.ok(side && +side[1] >= 200, 'the column is at least 200px wide');
});
