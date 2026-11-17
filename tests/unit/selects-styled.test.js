// Every dropdown wears the app's look (class "input" from app.css: its border, radius, height and colours), never the
// browser's bare <select>. The live host's steps once shipped bare selects in Game settings; this keeps any page from
// doing it again. It reads the markup in the views and scripts: a <select ...> tag in a template, and a select made
// with document.createElement('select'), which must be given className 'input' in the same statement or the next.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) return e.name === 'vendor' || e.name === 'node_modules' ? [] : walk(p);
  return /\.(js|html)$/.test(e.name) && !e.name.includes('.min.') ? [p] : [];
});
const files = [...walk(path.join(ROOT, 'server')), ...walk(path.join(ROOT, 'public'))];
// Comments are left out (they may name a <select> in passing).
const code = src => src.split('\n').map(l => (/^\s*(\/\/|\*|\/\*)/.test(l) ? '' : l));

test('every <select> in a view or script has class "input"', () => {
  const bad = [];
  for (const f of files) {
    const lines = code(fs.readFileSync(f, 'utf8'));
    lines.forEach((l, i) => {
      for (const m of l.matchAll(/<select\b[^>]*>/g)) if (!/\bclass=\\?["'][^"']*\binput\b/.test(m[0])) bad.push(`${path.relative(ROOT, f)}:${i + 1} ${m[0].slice(0, 80)}`);
    });
  }
  assert.deepEqual(bad, [], 'give these selects class="input" (the app\'s dropdown style)');
});

test('every select made in a script gets className "input"', () => {
  const bad = [];
  for (const f of files) {
    const lines = code(fs.readFileSync(f, 'utf8'));
    lines.forEach((l, i) => {
      if (!/createElement\(\s*['"]select['"]\s*\)/.test(l)) return;
      const near = l + (lines[i + 1] || '');
      if (!/className\s*=\s*[`'"][^`'"]*\binput\b|classList\.add\([^)]*['"]input['"]/.test(near)) bad.push(`${path.relative(ROOT, f)}:${i + 1}`);
    });
  }
  assert.deepEqual(bad, [], 'give these selects className = \'input\' (the app\'s dropdown style)');
});
