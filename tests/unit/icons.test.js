// The site's icons (docs/decisions.md "Icons: Oomba geometric for controls, Fluent 3D for big spots"): one map, one helper,
// the files it points at (our Oomba icons below 40 px, Fluent 3D at 40 px and up, Fluent for content-like pictures), the
// license, a size budget, the drawing rules, and no emoji left as icons in the shared chrome (header, menus, tab bar, cards).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FLUENT, TOOL_ICONS, OOMBA, iconHtml, toolIconHtml, hasIcon, oombaIcon } from '../../public/js/icons.js';
import { OOMBA_V } from '../../public/js/icons-oomba.js';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUB = path.join(ROOT, 'public');

test('every icon in the map has its files: an Oomba icon or a Flat SVG, 3D WebP at 1x and 2x where marked', () => {
  assert.ok(Object.keys(FLUENT).length > 100);
  for (const [e, [name, has3d]] of Object.entries(FLUENT)) {
    if (OOMBA[name]) assert.ok(fs.existsSync(path.join(PUB, 'icons/oomba', `${OOMBA[name]}.svg`)), `${e} oomba ${OOMBA[name]}`);
    else {
      assert.ok(fs.existsSync(path.join(PUB, 'icons/fluent/flat', `${name}.svg`)), `${e} flat`);
      assert.match(fs.readFileSync(path.join(PUB, 'icons/fluent/flat', `${name}.svg`), 'utf8'), /^<svg[\s\S]*<\/svg>$/);
    }
    if (has3d) for (const px of [64, 128]) {
      const b = fs.readFileSync(path.join(PUB, 'icons/fluent/3d', `${name}-${px}.webp`));
      assert.equal(b.subarray(0, 4).toString(), 'RIFF', `${e} ${px} is WebP`); assert.equal(b.subarray(8, 12).toString(), 'WEBP');
    }
  }
  // A name drawn as an Oomba icon never draws its Flat picture: that file is not shipped.
  for (const n of Object.keys(OOMBA)) assert.ok(!fs.existsSync(path.join(PUB, 'icons/fluent/flat', `${n}.svg`)), `${n}.svg is shipped but never drawn`);
  for (const slug of TOOL_ICONS) assert.ok(fs.existsSync(path.join(PUB, 'icons/tools', `${slug}.svg`)) || fs.existsSync(path.join(PUB, 'icons/tools', `${slug}-64.webp`)), slug);
  // The license travels with the pictures; the credits page lists them, and the Oomba icons as ours.
  assert.match(fs.readFileSync(path.join(PUB, 'icons/fluent/LICENSE.txt'), 'utf8'), /MIT License[\s\S]*Microsoft Corporation/);
  const credits = fs.readFileSync(path.join(ROOT, 'docs/media-credits.md'), 'utf8');
  assert.match(credits, /Fluent Emoji[\s\S]*MIT/); assert.match(credits, /Oomba icons[\s\S]*ours/i);
});

test('the Oomba icons: every mapped name has a drawing, each file is one valid symbol, and the map is the built one', async () => {
  const { ART, CONCEPT } = await import('../../scripts/icons/oomba-art.mjs');
  assert.deepEqual(OOMBA, Object.fromEntries(Object.entries(CONCEPT).sort()), 'public/js/icons-oomba.js is built from scripts/icons/oomba-art.mjs (node scripts/icons/build_oomba.mjs)');
  const names = new Set(Object.values(FLUENT).map(([n]) => n));
  for (const n of Object.keys(OOMBA)) assert.ok(names.has(n), `${n} is not in the Fluent map`);
  const files = fs.readdirSync(path.join(PUB, 'icons/oomba')).filter(f => f.endsWith('.svg'));
  assert.deepEqual(files.map(f => f.slice(0, -4)).sort(), Object.keys(ART).sort(), 'one file per drawing, no strays');
  assert.ok(files.length >= 120, `${files.length} icons`);
  assert.match(OOMBA_V, /^[0-9a-f]{10}$/);
  for (const f of files) {
    const svg = fs.readFileSync(path.join(PUB, 'icons/oomba', f), 'utf8');
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 24 24"><symbol id="i" viewBox="0 0 24 24">[\s\S]*<\/symbol><use href="#i"\/><\/svg>\n$/, f);
    assert.doesNotMatch(svg, /<script|<image|href="(?!#i")|on[a-z]+=|style=/i, `${f}: plain shapes only`);
    assert.equal((svg.match(/<symbol/g) || []).length, 1, f);
    // The drawing rules: the brand colors, ink, cream highlights and the text color, nothing else; strokes 1.2 and up.
    const colors = new Set([...svg.matchAll(/(?:fill|stroke)="([^"]+)"/g)].map(m => m[1]).filter(c => c !== 'none'));
    for (const c of colors) assert.ok(['#66C792', '#FFD23F', '#FF8A6B', '#141414', '#FFFDF2', 'currentColor'].includes(c), `${f}: color ${c}`);
    const brand = [...colors].filter(c => ['#66C792', '#FFD23F', '#FF8A6B'].includes(c));
    assert.ok(brand.length <= (f === 'traffic.svg' ? 3 : 2), `${f}: ${brand.join(' ')}`);   // the traffic light needs its three
    for (const m of svg.matchAll(/stroke-width="([\d.]+)"/g)) assert.ok(+m[1] >= 1 || /stroke="#(66C792|FFD23F|FF8A6B)"[^>]*stroke-width="[\d.]+"/.test(svg), `${f}: stroke ${m[1]}`);
    // Spark yellow is faint on cream: a yellow piece always has ink on or beside it.
    if (brand.length === 1 && brand[0] === '#FFD23F') assert.ok(colors.has('#141414') || colors.has('currentColor'), `${f}: yellow with no ink`);
  }
  // Owl eyes (the logo's) only on Me, Classroom and Eyes up.
  const owl = f => /<circle[^>]*stroke="#141414"[^>]*\/><circle[^>]*stroke="#141414"[^>]*\/><circle[^>]*fill="#141414"\/><circle[^>]*fill="#141414"\/>/.test(fs.readFileSync(path.join(PUB, 'icons/oomba', f), 'utf8'));
  assert.deepEqual(files.filter(owl).sort(), ['classroom.svg', 'eyes.svg', 'me.svg']);
});

test('the one helper: the Oomba icon below 40 px, Fluent 3D at 40 and up; content stays Fluent; decorative unless labelled', () => {
  const v = `\\?v=${OOMBA_V}`;
  // Below 40 px: an inline <svg> that draws our file, with the Fluent name it stands for.
  assert.match(iconHtml('⚙️', { size: 18 }), new RegExp(`^<svg class="fx fx-oo" data-fx="gear" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><use href="/icons/oomba/settings\\.svg${v}#i"/></svg>$`));
  assert.match(iconHtml('🍎', { size: 30 }), /<use href="\/icons\/oomba\/classroom\.svg[^"]*#i"\/>/);
  assert.match(iconHtml('📚', { size: 39 }), /fx-oo/);
  // 40 px and up: the 3D picture where there is one; else the Oomba icon (it scales).
  const big = iconHtml('🍎', { size: 40 });
  assert.match(big, /^<img class="fx fx-3d" src="\/icons\/fluent\/3d\/red-apple-64\.webp" srcset="[^"]*red-apple-64\.webp 1x, [^"]*red-apple-128\.webp 2x" width="40" height="40" alt="" aria-hidden="true"/);
  assert.match(iconHtml('📚', { size: 64, lazy: true }), /fx-3d[^>]*loading="lazy"/);
  assert.match(iconHtml('⚙️', { size: 48 }), /fx-3d/); assert.match(iconHtml('🖨️', { size: 48 }), /<svg class="fx fx-oo" data-fx="printer"[^>]*width="48"/);
  // Content-like pictures (animals, food, weather, faces) have no Oomba icon: Fluent as before, 3D at 28 px and up.
  assert.equal(oombaIcon('🐻'), null); assert.equal(oombaIcon('⚙️'), 'settings');
  assert.match(iconHtml('🐻', { size: 18 }), /class="fx fx-flat" src="\/icons\/fluent\/flat\/bear\.svg" width="18" height="18" alt="" aria-hidden="true"/);
  assert.match(iconHtml('🐻', { size: 28 }), /class="fx fx-3d" src="\/icons\/fluent\/3d\/bear-64\.webp"/);
  // A label makes it an image with a name; otherwise decorative.
  const labelled = iconHtml('🔎', { size: 20, label: 'Search' });
  assert.match(labelled, /role="img" aria-label="Search"/); assert.doesNotMatch(labelled, /aria-hidden/);
  assert.match(iconHtml('🐻', { size: 20, label: 'Bear' }), /alt="Bear"/);
  assert.match(iconHtml('⚙️', { cls: 'x"y' }), /class="fx fx-oo x&quot;y"/);
  // An emoji with no icon (an avatar, a game's own emoji) stays as it was, escaped.
  assert.equal(iconHtml('<b>'), '&lt;b&gt;'); assert.equal(hasIcon('🦜'), false);
  assert.match(toolIconHtml('geoboard'), /src="\/icons\/tools\/geoboard\.svg"/); assert.match(toolIconHtml('clock'), /clock-64\.webp/); assert.equal(toolIconHtml('nope'), '');
});

test('the Oomba icon takes the text color: ink on the page is currentColor, ink on a colored piece stays ink', () => {
  const css = fs.readFileSync(path.join(PUB, 'css/app.css'), 'utf8');
  assert.match(css, /svg\.fx-oo\{display:inline-block;flex:none;max-width:none;overflow:visible\}/);
  for (const f of ['search', 'live', 'progress', 'calendar']) assert.match(fs.readFileSync(path.join(PUB, 'icons/oomba', `${f}.svg`), 'utf8'), /="currentColor"/, f);
  // No stylesheet sizes an icon in a place as an <img> only (the Oomba icon there is an <svg>): ".tab .fx", not ".tab img.fx".
  for (const f of fs.readdirSync(path.join(PUB, 'css'))) assert.doesNotMatch(fs.readFileSync(path.join(PUB, 'css', f), 'utf8'), /[ >]img\.fx(?![-\w[])/, `${f}: img.fx inside a place`);
});

test('size budget: the icons the site ships stay small (each page loads only its own)', () => {
  let total = 0; const walk = d => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else total += fs.statSync(p).size; } };
  walk(path.join(PUB, 'icons'));
  assert.ok(total < 1_100_000, `public/icons is ${total} bytes`);
  for (const f of fs.readdirSync(path.join(PUB, 'icons/fluent/3d'))) assert.ok(fs.statSync(path.join(PUB, 'icons/fluent/3d', f)).size < 24_000, f);
  let oo = 0; for (const f of fs.readdirSync(path.join(PUB, 'icons/oomba'))) { const n = fs.statSync(path.join(PUB, 'icons/oomba', f)).size; oo += n; assert.ok(n < 1_200, `${f} is ${n} bytes`); }
  assert.ok(oo < 90_000, `public/icons/oomba is ${oo} bytes`);
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
  'server/routes/staff-invites.js': [], 'server/routes/trust.js': [], 'server/routes/landing.js': ['✓'],
  'server/views/live.js': ['✓', '✗'], 'server/views/rubrics.js': ['✔'], 'server/views/standards.js': ['✓', '✕'], 'server/views/teacher-loop.js': [],
  'public/js/studio.js': ['✕'], 'public/js/dash.js': ['🌐'], 'public/js/dash-widgets.js': [], 'public/js/dash-tools.js': [],
  'public/js/dash-tools4.js': [], 'public/js/dash-class5.js': [], 'public/js/app.js': [], 'public/js/course.js': [],
  'public/js/folder-save.js': [], 'public/js/live-sets.js': ['✕'], 'public/js/build.js': [], 'public/js/activity-panel/index.js': ['✕'],
  'public/js/activity-panel/editor.js': ['✕'],
};
// Why each one stays: ✓ ✔ ✕ ✗ ☐ are text glyphs (a done or verified mark, close, wrong, a box to tick on paper); 🌐 is a select <option> (text only);
// 🪨 and 🐾 are Number Quest's own game pictures (a unit's stamp stone, the placement trail); 🧒🐶… and 🐾 on the Story
// Builder are the story's characters.
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
  assert.match(iconLine('✅ <b>Saved</b>'), /^<svg class="fx fx-oo" data-fx="check-mark-button"[^>]*><use href="\/icons\/oomba\/check\.svg[^"]*"\/><\/svg> &lt;b&gt;Saved&lt;\/b&gt;$/);
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
