// The site's icons (docs/decisions.md "Icons: Fluent Emoji 3D"): one map, one helper, the files it points at, the
// license, a size budget, and no emoji left as icons in the shared chrome (the header, menus, tab bar, footer, cards).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FLUENT, TOOL_ICONS, iconHtml, toolIconHtml, hasIcon } from '../../public/js/icons.js';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUB = path.join(ROOT, 'public');

test('every icon in the map has its files: Flat SVG always, 3D WebP at 1x and 2x where marked', () => {
  assert.ok(Object.keys(FLUENT).length > 100);
  for (const [e, [name, has3d]] of Object.entries(FLUENT)) {
    assert.ok(fs.existsSync(path.join(PUB, 'icons/fluent/flat', `${name}.svg`)), `${e} flat`);
    assert.match(fs.readFileSync(path.join(PUB, 'icons/fluent/flat', `${name}.svg`), 'utf8'), /^<svg[\s\S]*<\/svg>$/);
    if (has3d) for (const px of [64, 128]) {
      const b = fs.readFileSync(path.join(PUB, 'icons/fluent/3d', `${name}-${px}.webp`));
      assert.equal(b.subarray(0, 4).toString(), 'RIFF', `${e} ${px} is WebP`); assert.equal(b.subarray(8, 12).toString(), 'WEBP');
    }
  }
  for (const slug of TOOL_ICONS) assert.ok(fs.existsSync(path.join(PUB, 'icons/tools', `${slug}.svg`)) || fs.existsSync(path.join(PUB, 'icons/tools', `${slug}-64.webp`)), slug);
  // The license travels with the pictures; the credits page lists them.
  assert.match(fs.readFileSync(path.join(PUB, 'icons/fluent/LICENSE.txt'), 'utf8'), /MIT License[\s\S]*Microsoft Corporation/);
  assert.match(fs.readFileSync(path.join(ROOT, 'docs/media-credits.md'), 'utf8'), /Fluent Emoji[\s\S]*MIT/);
});

test('the one helper: 3D WebP with 1x/2x at 28 px and up, Flat SVG below; decorative unless labelled; lazy on request', () => {
  const big = iconHtml('🍎', { size: 28 });
  assert.match(big, /^<img class="fx fx-3d" src="\/icons\/fluent\/3d\/red-apple-64\.webp" srcset="[^"]*red-apple-64\.webp 1x, [^"]*red-apple-128\.webp 2x" width="28" height="28" alt="" aria-hidden="true"/);
  const small = iconHtml('⚙️', { size: 18 });
  assert.match(small, /class="fx fx-flat" src="\/icons\/fluent\/flat\/gear\.svg" width="18" height="18" alt="" aria-hidden="true"/);
  const labelled = iconHtml('🔎', { size: 20, label: 'Search' });
  assert.match(labelled, /alt="Search"/); assert.doesNotMatch(labelled, /aria-hidden/);
  assert.match(iconHtml('📚', { size: 32, lazy: true }), /loading="lazy"/);
  // An emoji with no icon (an avatar, a game's own emoji) stays as it was, escaped.
  assert.equal(iconHtml('<b>'), '&lt;b&gt;'); assert.equal(hasIcon('🦜'), false);
  assert.match(toolIconHtml('geoboard'), /src="\/icons\/tools\/geoboard\.svg"/); assert.match(toolIconHtml('clock'), /clock-64\.webp/); assert.equal(toolIconHtml('nope'), '');
});

test('size budget: the icons the site ships stay small (each page loads only its own)', () => {
  let total = 0; const walk = d => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else total += fs.statSync(p).size; } };
  walk(path.join(PUB, 'icons'));
  assert.ok(total < 1_100_000, `public/icons is ${total} bytes`);
  for (const f of fs.readdirSync(path.join(PUB, 'icons/fluent/3d'))) assert.ok(fs.statSync(path.join(PUB, 'icons/fluent/3d', f)).size < 24_000, f);
});

test('the shared chrome has no emoji left as icons (avatars, game covers and people\'s words are not icons)', () => {
  const E = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]️?/u;
  for (const f of ['server/views/layout.js', 'server/views/components.js']) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    // Emoji written straight into markup: ">🎮 Play", "aria-hidden="true">🎮<".
    // (An avatar's own span is a person's picture, not an icon: the signed-out "🙂" stands in for one.)
    const inMarkup = [...src.matchAll(/(<[^<>]*>)\s*([\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]️?)/gu)].filter(m => !/class="avatar/.test(m[1])).map(m => m[2])
      .filter(e => !['▶', '★', '☆'].includes(e));   // play arrow, rating stars: text glyphs
    assert.deepEqual(inMarkup, [], `${f}: emoji straight in markup`);
    // Allowed: emoji as data that the icon helper draws (the nav's [key, href, emoji], THEME_ICONS, tile and empty-state
    // emoji), comments, and text-only places (select options, aria labels, the visibility words).
    void E;
  }
});

test('i18n: the build notes and status chips carry no emoji in any language (the icon is markup now)', () => {
  const dir = path.join(ROOT, 'server/i18n/locales');
  for (const f of fs.readdirSync(dir)) {
    const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const [a, b, keys] of [['layout', 'build', ['ready', 'question', 'stopped', 'many']], ['build', 'status', ['building', 'ready', 'question', 'stopped']]]) {
      for (const k of keys) { const v = d[a] && d[a][b] && d[a][b][k]; if (typeof v === 'string') assert.doesNotMatch(v, /^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, `${f} ${a}.${b}.${k}`); }
    }
  }
});
