// Arithmetic Lab: Save on the activity's own form (not only under Share), the same save as Share's.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = (f) => fs.readFileSync(path.join(ROOT, 'tools/box-by-box/src', f), 'utf8');

test('the editor form has its own Save, using the same save as Share, with its words in every language', () => {
  const ed = src('pages/Editor.svelte');
  assert.match(ed, /<SaveBar \{activity\} \/>\s*<Footer \/>/, 'at the end of the form, before the footer');
  const bar = src('lib/SaveBar.svelte');
  // the same save as Share's (which asks first, in the page's own dialog, when students may already have it)
  assert.match(bar, /saveMindful\(activity, /, 'the same save as Share');
  assert.match(src('lib/SharePanel.svelte'), /saveMindful\(activity, /);
  assert.doesNotMatch(bar + src('lib/SharePanel.svelte') + src('lib/activities.svelte.ts'), /\b(confirm|alert)\(/, 'no confirm() or alert()');
  assert.match(bar, /isShared\(activity\)/, 'shows Saved once what is on Oomba matches');
  assert.match(bar, /ui\.save\.preview/);
  assert.match(bar, /ui\.save\.guest/);
  for (const f of fs.readdirSync(path.join(ROOT, 'tools/box-by-box/src/i18n'))) {
    const d = JSON.parse(src(`i18n/${f}`));
    for (const k of ['ui.ed.save', 'ui.ed.saveHint', 'ui.ed.savedHint']) assert.ok(d[k]?.trim(), `${f} ${k}`);
  }
});

test('every keypad offers the decimal point when the problem has a point to type (the floating one too)', () => {
  const p = src('pages/Player.svelte');
  assert.match(p, /<FloatingKeypad\s+top=\{barH\}\s+point=\{hasPoints\}/, 'the floating keypad in the standard player');
  assert.match(p, /<Keypad wide point=\{hasPoints\}/);
  const m = src('pages/MethodPlayer.svelte');
  assert.match(m, /<FloatingKeypad[^>]*point=\{fields\.some\(\(x\) => x\.point\)\}/);
  assert.match(m, /<Keypad wide point=\{fields\.some\(\(x\) => x\.point\)\}/);
});
