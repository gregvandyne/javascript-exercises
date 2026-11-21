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

// The rest of the app, converted after the shared chrome: the class dashboard and its tools, the Studio, Number Quest
// and CS Quest's own pages, the course pages, toasts and sheets, and the pages a later sweep found. Emoji written straight
// into markup ("<b>🎲 Pick" or "<span aria-hidden="true">📌</span>") are icons now; what is left is listed here, each
// with why: text glyphs, select options, people's and games' own pictures, and pages another piece of work owns.
const CONVERTED = {
  'server/views/courses.js': ['✓', '✕'], 'server/views/cs-quest.js': [], 'server/views/cs-quest-sheets.js': ['☐', '✓'],
  'server/views/cs-quest-standards.js': [], 'server/views/number-quest-path.js': ['🪨'], 'server/views/number-quest-placement.js': ['🐾'],
  'server/routes/number-quest.js': [], 'server/routes/cs-quest.js': [], 'server/routes/cyber-defenders.js': [], 'server/routes/dash.js': ['✔'],
  'server/routes/student-report.js': ['✓'], 'server/routes/digest.js': [], 'server/routes/social.js': [], 'server/routes/chat.js': ['✓'],
  'server/routes/stories.js': ['🐾', '🧒'], 'server/routes/plans.js': ['✓'], 'server/routes/progress.js': ['✓'], 'server/routes/school-billing.js': [],
  'server/routes/staff-invites.js': [], 'server/routes/trust.js': [], 'server/routes/landing.js': ['✓', '🐼', '🦊', '🐨', '🦦'],
  'server/views/live.js': ['✓', '✗'], 'server/views/rubrics.js': ['✔'], 'server/views/standards.js': ['✓', '✕'], 'server/views/teacher-loop.js': [],
  'public/js/studio.js': ['✕'], 'public/js/dash.js': ['🌐'], 'public/js/dash-widgets.js': [], 'public/js/dash-tools.js': [],
  'public/js/dash-tools4.js': [], 'public/js/dash-class5.js': [], 'public/js/app.js': [], 'public/js/course.js': [],
  'public/js/folder-save.js': [], 'public/js/live-sets.js': ['✕'], 'public/js/build.js': [], 'public/js/activity-panel/index.js': ['✕'],
  'public/js/activity-panel/editor.js': ['✕'],
};
// Why each one stays: ✓ ✔ ✕ ✗ ☐ are text glyphs (a done or verified mark, close, wrong, a box to tick on paper); 🌐 is a select <option> (text only);
// 🪨 and 🐾 are Number Quest's own game pictures (a unit's stamp stone, the placement trail); 🧒🐶… and 🐾 on the Story
// Builder are the story's characters; 🐼🦊🐨🦦 on the landing page are the demo class's avatars.
test('the rest of the app has no emoji left as icons, apart from the listed ones (and why they stay)', () => {
  for (const [f, allowed] of Object.entries(CONVERTED)) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const inMarkup = [...src.matchAll(/(<[^<>]*>)\s*([\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]️?)/gu)].filter(m => !/class="avatar/.test(m[1])).map(m => m[2])
      .filter(e => !['▶', '★', '☆'].includes(e));
    assert.deepEqual([...new Set(inMarkup)].sort(), [...new Set(allowed)].sort(), `${f}: emoji straight in markup`);
    // A button or line written as text in the page's own script draws its leading emoji through the helper.
    if (f.startsWith('public/js/')) assert.deepEqual([...src.matchAll(/\.textContent = `((?:\p{Extended_Pictographic}|✓|✔)\uFE0F?) \$\{/gu)].map(m => m[1]), [], `${f}: "emoji words" set as plain text`);
  }
  // Toasts and sheet titles: a leading emoji is drawn as its icon, in one place for every page.
  const app = fs.readFileSync(path.join(PUB, 'js/app.js'), 'utf8');
  assert.match(app, /if \(leadIcon\(msg\)\) t\.innerHTML = iconLine\(msg, 20\)/);
  assert.match(app, /<h2 id="sheet-title">\$\{iconLine\(title, 28\)\}<\/h2>/);
});

test('leadIcon / iconLine: "✅ Saved" becomes the icon and the words; plain words and unknown emoji stay text', async () => {
  const { leadIcon, iconLine } = await import('../../public/js/icons.js');
  assert.deepEqual(leadIcon('✅ Saved'), ['✅', 'Saved']);
  assert.deepEqual(leadIcon('🗑️ Deleted'), ['🗑️', 'Deleted']);
  assert.equal(leadIcon('Saved'), null); assert.equal(leadIcon('🦜 Polly'), null); assert.equal(leadIcon('✅'), null);
  assert.match(iconLine('✅ <b>Saved</b>'), /^<img class="fx fx-flat" src="\/icons\/fluent\/flat\/check-mark-button\.svg"[^>]*> &lt;b&gt;Saved&lt;\/b&gt;$/);
  assert.equal(iconLine('a <b>'), 'a &lt;b&gt;');
});

test('dark theme: no dark silhouette stands for Grown-ups, Friends or Two players, and each has its own bright picture', () => {
  const DARK = ['busts-in-silhouette', 'bust-in-silhouette', 'people-hugging', 'file-cabinet', 'musical-note'];
  for (const [e, [name]] of Object.entries(FLUENT)) assert.ok(!DARK.includes(name), `${e} is drawn as ${name}, a near-black picture on the dark theme`);
  for (const name of DARK) for (const dir of ['flat', '3d']) assert.ok(!fs.readdirSync(path.join(PUB, 'icons/fluent', dir)).some(f => f.startsWith(`${name}.`) || f.startsWith(`${name}-`)), `${name} is not shipped`);
  const [grownups, friends, two] = ['👪', '👫', '👥'].map(e => FLUENT[e][0]);
  assert.equal(new Set([grownups, friends, two]).size, 3, 'three different pictures');
  for (const e of ['👪', '👫', '👥', '👤']) assert.equal(FLUENT[e][1], 1, `${e} has a 3D picture (the tab bar and rails draw it at 28 px and up)`);
  // Fluent's few near-black pictures that have no bright twin sit on a light disc in the dark theme (a token: none in light).
  const css = fs.readFileSync(path.join(PUB, 'css/app.css'), 'utf8');
  assert.match(css, /img\.fx\[src\*="\/graduation-cap"\][^{]*\{background:radial-gradient\([^)]*var\(--fx-plate\)/);
  assert.match(css, /\n:root\{[\s\S]*?--fx-plate:transparent;/);
});

test('i18n: the toasts and notes that move their emoji into the markup carry none in any language', () => {
  const dir = path.join(ROOT, 'server/i18n/locales');
  const keys = ['js.studio.resumed', 'js.studio.resumedV', 'js.studio.resting.text', 'js.activityPanel.editTitle', 'js.play.nqMarks', 'js.play.nqGoal', 'js.play.nqLap', 'js.course.nqMarks', 'js.course.nqGoal', 'js.course.nqLap'];
  for (const f of fs.readdirSync(dir)) {
    const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const k of keys) { const v = k.split('.').reduce((o, x) => o && o[x], d); if (typeof v === 'string') assert.doesNotMatch(v, /^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, `${f} ${k}`); }
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
