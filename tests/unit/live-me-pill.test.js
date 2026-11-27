// Oomba Live, a player's own name pill (.lv-me in public/css/live.css): it sits on the team bar, whose ink can be
// white (Whales, Owls), so the pill sets its own text color for its light background instead of inheriting the ink.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const css = fs.readFileSync(path.join(ROOT, 'public/css/live.css'), 'utf8');

test('live: the player name pill has its own text color, readable on its background in light and dark', () => {
  const rules = [...css.matchAll(/(^|\})\s*\.lv-me\s*\{([^}]*)\}/g)].map(m => m[2]);
  const pill = rules.find(r => /background:\s*var\(--card-2\)/.test(r));
  assert.ok(pill, 'the pill rule');
  assert.match(pill, /(^|;)\s*color:\s*var\(--text\)/, 'the pill sets color: var(--text), not the team ink');
  const app = fs.readFileSync(path.join(ROOT, 'public/css/app.css'), 'utf8');
  const lum = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const texts = [...app.matchAll(/--text:(#[0-9A-Fa-f]{6})/g)].map(m => m[1]), cards = [...app.matchAll(/--card-2:(#[0-9A-Fa-f]{6})/g)].map(m => m[1]);
  assert.ok(texts.length >= 2 && texts.length === cards.length, 'light and dark tokens');
  texts.forEach((t, i) => assert.ok(ratio(t, cards[i]) >= 4.5, `${t} on ${cards[i]}: ${ratio(t, cards[i]).toFixed(1)}:1`));
});
