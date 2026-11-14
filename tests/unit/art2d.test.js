// The 2D art packs (docs/kit2-themes-plan.md "2D versions"): the Kit 2 worlds, heroes and animals as pictures for
// games on the Oomba Kit.
//   - the lock: every file under public/vendor/art2d/ is in kit2/ART2D.json with its hash, and nothing else is there;
//   - the manifests: well-formed, every file listed with its size and hash, every frame and sprite inside its picture,
//     every pack CC0 and inside its size budget, no T-Rex and none of the custom-licence packs;
//   - the build is deterministic: a world drawn again from its shipped theme gives the locked bytes (Chromium);
//   - the frame and the scanner: the pinned tags pass, anything else under /vendor/art2d/ fails, the CSP allows the
//     path for scripts and images only, a game without the art is untouched;
//   - the Builder: the generated catalogue is fresh, the rules list only real names, the lint flags invented ones, the
//     engine choice keeps 3D as 3D, the chips work in every language, the mock builds 2D games with the right packs;
//   - in real Chromium, in the production frame under its CSP: a runner and a catching game in three worlds with
//     three heroes (one an animal) draw from the packs, and the classic look still plays.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const LOCAL = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = process.env.BRB_CHROMIUM || LOCAL.find(f => fs.existsSync(f));
const skip = !exe && !process.env.PLAYWRIGHT_BROWSERS_PATH ? 'no Chromium on this machine' : false;
if (exe) process.env.BRB_CHROMIUM = exe;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = path.join(ROOT, 'public/vendor/art2d');

const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const S = await import('../../server/services/art2d.js');
const A = await import('../../server/builder/art2d.js');
const K = await import('../../server/builder/kit2.js');
const P = await import('../../server/builder/prompt.js');
const T = await import('../../server/builder/templates/index.js');
const CAT = await import('../../server/builder/art2d-catalog.js');
const GEN = await import('../../scripts/build-art2d-rules.js');
const { scanVersion } = await import('../../server/services/scanner.js');
const { lintArt2d, art2dOf } = await import('../../server/services/art2d-lint.js');
const { frameDocument, frameCsp, cleanGameHtml, SANDBOX } = await import('../../server/services/frame.js');
const { vendorFile } = await import('../../server/services/snapshot.js');
const { usesKit } = await import('../../server/builder/layer.js');
const { toolbox } = await import('../../server/builder/tools.js');
const { CODES, LOCALES_DIR } = await import('../../server/i18n/index.js');
const auth = await import('../../server/auth.js');
const games = await import('../../server/services/games.js');
const { runTurn } = await import('../../server/builder/agent.js');
const { createApp } = await import('../../server/app.js');

const sri = buf => 'sha384-' + crypto.createHash('sha384').update(buf).digest('base64');
const LOCK = JSON.parse(fs.readFileSync(path.join(ROOT, 'kit2/ART2D.json'), 'utf8'));
const walk = (d, base = d) => fs.readdirSync(d).flatMap(f => { const p = path.join(d, f); return fs.statSync(p).isDirectory() ? walk(p, base) : [path.relative(base, p).split(path.sep).join('/')]; });
const packs = Object.keys(LOCK.packs).map(key => { const [id, version] = key.split('/'); return { key, id, version, dir: path.join(DIR, id, version), m: JSON.parse(fs.readFileSync(path.join(DIR, id, version, 'pack.json'), 'utf8')) }; });
const worlds = packs.filter(p => p.m.kind === 'world');
/** The size of a WebP picture from its header (VP8X, VP8 or VP8L). */
function webpSize(buf) {
  assert.equal(buf.toString('latin1', 0, 4), 'RIFF'); assert.equal(buf.toString('latin1', 8, 12), 'WEBP');
  const kind = buf.toString('latin1', 12, 16);
  if (kind === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
  if (kind === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  if (kind === 'VP8L') { const b = buf.readUInt32LE(21); return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff)]; }
  throw new Error('not a WebP picture: ' + kind);
}
// A language's words, with English where it has none of its own (en-GB keeps only what differs).
const EN = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, 'en.json'), 'utf8'));
const merge = (a, b) => { const o = { ...a }; for (const [k, v] of Object.entries(b || {})) o[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(a && typeof a[k] === 'object' ? a[k] : {}, v) : v; return o; };
const words = code => merge(EN, JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${code}.json`), 'utf8')));
const fails = html => scanVersion(html).issues.filter(i => i.level === 'fail').map(i => i.code);

// ---------------------------------------------------------------- the lock
test('lock: every file under /vendor/art2d/ is locked with its hash, and a locked file never changes', () => {
  const onDisk = walk(DIR).sort(), locked = [];
  for (const [v, hash] of Object.entries(LOCK.helper)) { locked.push(`oomba2d/${v}/oomba2d.js`); assert.equal(sri(fs.readFileSync(path.join(DIR, 'oomba2d', v, 'oomba2d.js'))), hash, `oomba2d ${v} changed: a shipped version never changes`); }
  for (const [key, files] of Object.entries(LOCK.packs)) for (const [f, hash] of Object.entries(files)) {
    locked.push(`${key}/${f}`);
    assert.ok(fs.existsSync(path.join(DIR, key, f)), `${key}/${f} is locked but missing`);
    assert.equal(sri(fs.readFileSync(path.join(DIR, key, f))), hash, `${key}/${f} changed: a shipped pack version never changes (ship a new version)`);
  }
  assert.deepEqual(onDisk, locked.sort(), 'a file under public/vendor/art2d/ is not in kit2/ART2D.json (run node kit2/pipeline/art2d-lock.mjs)');
  // the helper's source is the newest shipped helper (a change to it ships as a new version)
  assert.equal(sri(fs.readFileSync(path.join(ROOT, 'kit2/src2d/oomba2d.js'))), LOCK.helper[S.OOMBA2D_VERSION], 'kit2/src2d/oomba2d.js differs from the shipped Oomba2D: bump its VERSION and lock the new one');
  assert.equal(packs.length, 11); assert.equal(worlds.length, 9);
  assert.deepEqual(worlds.map(w => w.id).sort(), K.WORLD_IDS.slice().sort(), 'every 3D world has its 2D pack');
  // no raw model and nothing but pictures, manifests and licence texts ships
  for (const f of onDisk) assert.match(f, /\.(webp|json|js|txt)$/, f);
});

// ---------------------------------------------------------------- the manifests
test('manifests: every file listed with its size and hash, pack.js is the same manifest, licences on file', () => {
  for (const p of packs) {
    const { m, dir } = p;
    assert.equal(m.id, p.id); assert.equal(m.version, p.version); assert.equal(m.cell, 96);
    const files = walk(dir).filter(f => f !== 'pack.json' && f !== 'pack.js').sort();
    assert.deepEqual(Object.keys(m.files).sort(), files, `${p.key}: files`);
    for (const [f, info] of Object.entries(m.files)) { const b = fs.readFileSync(path.join(dir, f)); assert.equal(b.length, info.bytes, `${p.key}/${f} size`); assert.equal(sri(b), info.sha384, `${p.key}/${f} hash`); }
    const js = fs.readFileSync(path.join(dir, 'pack.js'), 'utf8'), body = /Oomba2D\.pack\((\{[\s\S]*\})\);\n$/.exec(js);
    assert.ok(body, `${p.key}: pack.js calls Oomba2D.pack`); assert.deepEqual(JSON.parse(body[1]), m, `${p.key}: pack.js carries pack.json`);
    assert.doesNotMatch(js.replace(body[1], ''), /\bfetch\b|\bimport\b|XMLHttpRequest|\beval\b/, 'pack.js is data only');
    // CC0 only; a world comes from one shipped theme version (which holds the licence files)
    assert.ok(m.from.packs.length); for (const s of m.from.packs) assert.equal(s.licence, 'CC0-1.0', `${p.key}: ${s.id}`);
    if (m.from.theme) { const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'kit2/SHIPPED.json'), 'utf8')); assert.ok(lock.themes[m.from.theme], `${p.key}: drawn from a shipped theme`); assert.ok(fs.existsSync(path.join(ROOT, 'public/vendor/themes', m.from.theme, 'LICENSES'))); }
    else for (const s of m.from.packs) assert.match(fs.readFileSync(path.join(dir, 'LICENSES', `${s.id}.txt`), 'utf8'), /CC0 1\.0 Universal/, `${p.key}: licence text of ${s.id}`);
    // never the custom-licence packs, never the T-Rex (the owner has not decided)
    assert.doesNotMatch(JSON.stringify(m), /desert-oasis|sky-islands-pack|underwater-pack|reodesuxz|t-rex|tyrannosaurus/i, p.key);
  }
});

test('manifests: every sprite, frame and strip is inside its picture; anchors and sizes make sense', () => {
  for (const p of packs) {
    const { m, dir } = p, size = f => webpSize(fs.readFileSync(path.join(dir, f)));
    if (m.kind === 'world') {
      const [pw, ph] = size(m.props.image); assert.deepEqual([pw, ph], [m.props.w, m.props.h]);
      const kinds = Object.values(m.sprites).map(s => s.kind);
      assert.ok(kinds.filter(k => k === 'prop').length >= 5, `${p.id}: props`); assert.ok(kinds.filter(k => k === 'obstacle').length >= 2, `${p.id}: obstacles`);
      assert.ok(m.sprites.goal && m.sprites.coin, `${p.id}: a goal and a coin`);
      for (const [n, s] of Object.entries(m.sprites)) {
        const [x, y, w, h] = s.rect;
        assert.ok(x >= 0 && y >= 0 && w > 4 && h > 4 && x + w <= pw && y + h <= ph, `${p.id}/${n}: its rectangle is inside props.webp`);
        assert.ok(s.ax > 0 && s.ax < 1 && s.ay > 0.5 && s.ay <= 1, `${p.id}/${n}: stands on its anchor`);
        assert.ok(Math.abs(s.size - h / 96) < 0.011 && s.size >= 0.3 && s.size <= 6, `${p.id}/${n}: size in cells`);
        if (s.kind === 'obstacle') assert.ok(s.size <= 1.2, `${p.id}/${n}: an obstacle is a small thing to jump over`);
        if (s.kind === 'coin') assert.ok(s.size >= 0.45 && s.size <= 0.9, `${p.id}: coin`);
      }
      for (const n of ['far', 'mid']) { const L = m.layers[n]; assert.ok(L, `${p.id}: ${n}`); assert.deepEqual(size(L.image), [L.w, L.h]); assert.equal(L.w % 4, 0); assert.ok(L.speed > 0 && L.speed < 1); }
      assert.ok(m.layers.far.speed < m.layers.mid.speed, 'far scenery moves slower');
      assert.deepEqual(size(m.ground.image), [m.ground.cells * 96, m.ground.over + 96], `${p.id}: the ground is whole cells wide`);
      assert.equal(m.sky.length, 3); for (const c of [...m.sky, m.ground.fill]) assert.match(c, /^#[0-9a-f]{6}$/i);
      assert.deepEqual(m.heroes, K.worldById(p.id).heroes.map(h => h.id), `${p.id}: the heroes its 3D world has`);
    } else {
      assert.ok(['heroes', 'animals'].includes(m.kind));
      for (const [id, s] of Object.entries(m.sprites)) {
        const [w, h] = size(s.image), n = s.anims.idle.length + s.anims.run.length + s.anims.jump.length;
        assert.deepEqual([s.anims.idle.length, s.anims.run.length, s.anims.jump.length], [4, 8, 2], `${id}: idle, run and jump frames`);
        assert.deepEqual([...s.anims.idle, ...s.anims.run, ...s.anims.jump], [...Array(n).keys()], `${id}: frames in order`);
        assert.equal(w, s.cols * s.fw, `${id}: sheet width`); assert.equal(h, Math.ceil(n / s.cols) * s.fh, `${id}: sheet height`);
        assert.ok(s.ax > 0.15 && s.ax < 0.85 && s.ay > 0.6 && s.ay <= 1, `${id}: feet on the anchor line`);
        assert.ok(s.fh >= 90 && s.fh <= 620 && s.fw <= 640, `${id}: big enough for a phone, small enough for a Chromebook (${s.fw}x${s.fh})`);
        assert.ok(s.name && s.fps.idle > 0 && s.fps.run > 0);
        assert.equal(s.kind, m.kind === 'heroes' ? 'hero' : 'animal');
      }
    }
  }
  const animals = packs.find(p => p.id === 'animals').m.sprites;
  assert.equal(Object.keys(animals).length, 24);
  for (const g of ['woodland', 'farm', 'dinosaur']) assert.ok(Object.values(animals).some(a => a.group === g), g);
  assert.deepEqual(Object.keys(packs.find(p => p.id === 'heroes').m.sprites), K.KIT2_CHARACTERS.filter(c => c.kind === 'hero').map(c => c.id), 'every 3D hero has a sheet');
});

// The budget: what one game downloads the first time (Oomba2D, its world's pack and pictures, one hero's sheet and
// the heroes or animals manifest) stays well under 1 MB; a whole world pack under 300 KB; one sheet under 150 KB.
const WORLD_BUDGET = 300 * 1024, SHEET_BUDGET = 150 * 1024, FIRST_LOAD_BUDGET = 520 * 1024;
test('size budget: a world pack, a sprite sheet and a game\'s first load', () => {
  const bytes = (p, f) => fs.statSync(path.join(p.dir, f)).size, total = p => walk(p.dir).reduce((n, f) => n + bytes(p, f), 0);
  const chars = packs.filter(p => p.m.kind !== 'world');
  let worstSheet = 0, worstExtra = 0;
  for (const p of chars) for (const s of Object.values(p.m.sprites)) { const b = bytes(p, s.image); assert.ok(b <= SHEET_BUDGET, `${s.image}: ${b} bytes`); worstSheet = Math.max(worstSheet, b); worstExtra = Math.max(worstExtra, b + bytes(p, 'pack.js')); }
  const helper = fs.statSync(path.join(DIR, 'oomba2d', S.OOMBA2D_VERSION, 'oomba2d.js')).size;
  for (const w of worlds) {
    const t = total(w) - bytes(w, 'pack.json');   // a game loads pack.js, never pack.json
    assert.ok(total(w) <= WORLD_BUDGET, `${w.id}: ${total(w)} bytes`);
    assert.ok(helper + t + worstExtra <= FIRST_LOAD_BUDGET, `${w.id}: first load ${helper + t + worstExtra} bytes`);
  }
});

// ---------------------------------------------------------------- the build
test('the build is deterministic: Pirate Cove and the heroes drawn again from the shipped theme are the locked bytes', { skip, timeout: 240_000 }, async () => {
  const { buildPacks } = await import('../../kit2/pipeline/art2d.mjs');
  const built = await buildPacks(['pirate-cove', 'heroes']);
  assert.deepEqual(built.map(b => b.id).sort(), ['heroes', 'pirate-cove']);
  for (const b of built) {
    const locked = LOCK.packs[`${b.id}/${b.version}`];
    assert.deepEqual(Object.keys(b.files).sort(), Object.keys(locked).sort(), `${b.id}: the same files`);
    for (const [f, buf] of Object.entries(b.files)) assert.equal(sri(buf), locked[f], `${b.id}/${f} came out different`);
  }
});

// ---------------------------------------------------------------- the frame and the scanner
const runner = (world, hero) => T.loadTemplate('runner', { world, hero });
test('scanner: the pinned tags pass; any other way to reach /vendor/art2d/ fails; a classic game is as before', () => {
  for (const key of A.ART2D_TEMPLATES) {
    const plain = T.loadTemplate(key), src = fs.readFileSync(path.join(ROOT, 'server/builder/templates', `${key}.html`), 'utf8');
    assert.ok(!plain.includes('art2d') && !plain.includes('<!--ART2D-->'), `${key}: with no world there is no 2D art tag`);
    assert.equal(plain, T.withKitTags(src).replace('<!--ART2D-->\n', ''), `${key}: only the marker goes`);
    assert.match(plain, /\n  world: '',\n  hero2d: '',\n/);
    assert.equal(scanVersion(plain).status, 'pass'); assert.deepEqual(scanVersion(plain).lint, []);
    for (const [w, h] of [['pirate-cove', 'fox'], ['castle-quest', 'knight'], ['space-base', ''], ['', 'cow']]) {
      const g = T.loadTemplate(key, { world: w, hero: h }), r = scanVersion(g);
      assert.equal(r.status, 'pass', `${key} ${w} ${h}: ${JSON.stringify(r.issues)}`); assert.deepEqual(r.lint, [], `${key} ${w} ${h}`);
      assert.ok(g.includes(S.oomba2dTag())); if (w) assert.ok(g.includes(S.art2dPackTag(w)) && g.includes(`world: '${w}',`)); if (h) assert.ok(g.includes(S.art2dPackTag(A.art2dCharacter(h).pack)) && g.includes(`hero2d: '${h}',`));
      assert.ok(usesKit(g), 'still an Oomba Kit game'); assert.deepEqual(art2dOf(g), { world: w, hero: h });
    }
    // names that do not exist are left out, never guessed
    assert.equal(T.loadTemplate(key, { world: 'candy-land', hero: 'unicorn' }), plain);
  }
  const good = runner('pirate-cove', 'fox');
  assert.deepEqual(fails(good.replace(/(art2d\/pirate-cove\/1\.0\.0\/pack\.js" integrity="sha384-)[A-Za-z0-9+/]{6}/, '$1AAAAAA')), ['art2d_pin'], 'another hash');
  assert.deepEqual(fails(good.replace('art2d/pirate-cove/1.0.0/pack.js', 'art2d/pirate-cove/9.9.9/pack.js')), ['art2d_pin'], 'a version that has not shipped');
  assert.deepEqual(fails(good.replace(/(oomba2d\.js" integrity="[^"]+") crossorigin="anonymous"/, '$1')), ['art2d_pin'], 'no crossorigin');
  assert.deepEqual(fails(good.replace('</script>\n<script>', '</script>\n<script src="/vendor/art2d/pirate-cove/1.0.0/far.webp"></script>\n<script>')), ['art2d_pin']);
  assert.ok(fails(good + '<img src="/vendor/art2d/pirate-cove/1.0.0/far.webp">').includes('art2d_pin'), 'a game never names a picture file');
  assert.ok(fails(good + '<script>const u = "/vendor/art2d/animals/1.0.0/fox.webp";</script>').includes('art2d_pin'));
  assert.ok(fails(good + '<script src="https://evil.example/oomba2d.js"></script>').includes('external_url'), 'what failed before still fails');
  assert.ok(fails(good + '<script>fetch("/x")</script>').includes('network'));
  // the packs themselves: no network, no free text box, no prices
  const helper = fs.readFileSync(path.join(DIR, 'oomba2d', S.OOMBA2D_VERSION, 'oomba2d.js'), 'utf8');
  assert.doesNotMatch(helper, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|document\.cookie|<input|\$\d|price/i);
});

test('frame: the CSP allows /vendor/art2d/ for scripts and pictures only, and only on our own origin', () => {
  const csp = frameCsp('https://oomba.example'), part = n => (new RegExp(`${n} ([^;]*)`).exec(csp) || [])[1] || '';
  assert.ok(part('script-src').includes('https://oomba.example/vendor/art2d/'));
  assert.ok(part('img-src').includes('https://oomba.example/vendor/art2d/'));
  for (const n of ['connect-src', 'media-src', 'font-src', 'style-src']) assert.ok(!part(n).includes('art2d'), n);
  assert.match(csp, /default-src 'none'/); assert.ok(!frameCsp().includes('art2d'), 'no origin, no path');
  assert.equal((csp.match(/vendor\/art2d\//g) || []).length, 2, 'two places, no more');
  // the screenshot worker serves the same files and nothing beside them
  assert.ok(vendorFile('http://x.invalid/vendor/art2d/pirate-cove/1.0.0/far.webp'));
  assert.equal(vendorFile('http://x.invalid/vendor/art2d/pirate-cove/1.0.0/../../../../package.json'), null);
});

test('a game built before the 2D art is untouched: its stored HTML is served byte for byte as before', () => {
  const old = '<title>Old</title><div id="game"></div>' + T.loadTemplate('runner').split('\n').slice(2).join('\n');
  const served = cleanGameHtml(old);
  assert.ok(!served.includes('art2d') && !served.includes('Oomba2D.use({ world: \'pirate'));
  assert.equal(cleanGameHtml(old), served, 'the same every time');
  // a game that never heard of Oomba2D (its code has no such lines) is not changed by anything here
  const older = '<title>Older</title><canvas id="c"></canvas><script>const hero = "🦊"; document.title = hero;</script>';
  assert.equal(cleanGameHtml(older), older); assert.deepEqual(lintArt2d(older), []); assert.equal(A.isArt2dGame(older), false);
  assert.equal(A.art2dConfig(older, { world: 'pirate-cove', hero: 'fox' }), older, 'a game without the marker is never given the art');
  for (const key of ['quiz', 'memory', 'word', 'duel', 'board']) assert.equal(T.loadTemplate(key, { world: 'pirate-cove', hero: 'fox' }), T.loadTemplate(key), `${key} does not draw the worlds yet`);
});

// ---------------------------------------------------------------- the Builder
test('catalogue: generated from the locked manifests, fresh, and nothing typed by hand', () => {
  assert.equal(fs.readFileSync(GEN.OUT, 'utf8'), GEN.fileText(), 'server/builder/art2d-catalog.js is out of date: run node scripts/build-art2d-rules.js');
  assert.equal(CAT.ART2D_HELPER, S.OOMBA2D_VERSION);
  for (const w of CAT.ART2D_WORLDS) {
    const m = S.art2dManifest(w.id); assert.equal(w.version, m.version);
    assert.deepEqual(w.sprites.map(s => s.name), Object.keys(m.sprites));
    assert.ok(P.ART2D_RULES.includes(`${w.id} ${w.version}`));
    for (const s of w.sprites.filter(x => x.kind === 'prop')) assert.ok(P.ART2D_RULES.includes(`${s.name} ${s.size}`), `${w.id}: ${s.name} is in the rules with its size`);
  }
  for (const c of CAT.ART2D_CHARACTERS) { assert.ok(P.ART2D_RULES.includes(`${c.id} (${c.name})`), c.id); assert.ok(S.art2dManifest(c.pack).sprites[c.id]); }
  for (const id of Object.keys(S.ART2D_PACKS)) assert.ok(P.ART2D_RULES.includes(S.art2dPackTag(id)), `the rules carry the exact tag of ${id}`);
  assert.ok(P.ART2D_RULES.includes(S.oomba2dTag()));
  assert.match(P.ART2D_RULES, /Animals never chase, bite or hurt/); assert.match(P.ART2D_RULES, /has no sprite yet: say so kindly/);
  assert.ok(P.SYSTEM_PROMPT.includes(P.ART2D_SHORT)); assert.ok(!P.SYSTEM_PROMPT.includes('sha384-' + S.art2dPackTag('animals').split('sha384-')[1].slice(0, 20)), 'the tags are only in the 2D ART RULES');
  // every animal the picker offers has its picture and its name in every language
  for (const c of A.ART2D_ANIMALS) assert.ok(fs.existsSync(path.join(ROOT, 'public/img/art2d/animals', `${c.id}.webp`)), `${c.id}: picker picture (node scripts/art2d-thumbs.js)`);
  for (const code of CODES) {
    const d = words(code);
    for (const c of A.ART2D_ANIMALS) assert.ok(d.studio.animals.names[c.id], `${code}: ${c.id}`);
    for (const k of ['world2dUse', 'animal2dUse']) assert.ok(d.js.studio[k].includes('{name}'), `${code}: ${k}`);
  }
});

test('lint: an invented world, hero or sprite name is a note for the Builder, never a safety failure', () => {
  const codes = html => lintArt2d(html).map(l => l.code);
  const good = runner('pirate-cove', 'fox');
  assert.deepEqual(codes(good), []);
  assert.deepEqual(codes(good.replace("world: 'pirate-cove'", "world: 'candy-land'")), ['art2d_world']);
  assert.deepEqual(codes(good.replace("hero2d: 'fox'", "hero2d: 'unicorn'")), ['art2d_hero']);
  assert.deepEqual(codes(good.replace("hero2d: 'fox'", "hero2d: 'knight'")), ['art2d_pack'], 'a hero whose pack is not loaded');
  assert.deepEqual(codes(good.replace("world: 'pirate-cove'", "world: 'toy-town'")), ['art2d_pack'], 'a world whose pack is not loaded');
  const spawn = good.replace('setup(w) { rest = 0;', "setup(w) { rest = 0; if (art) { w.spawn(art.sprite('palm'), { c: 4, r: 6 }); w.spawn(art.sprite('dragon'), { c: 9, r: 6 }); }");
  const notes = lintArt2d(spawn);
  assert.deepEqual(notes.map(n => n.code), ['art2d_sprite']); assert.match(notes[0].message, /no sprite "dragon"[\s\S]*palm/);
  const r = scanVersion(spawn); assert.equal(r.status, 'pass'); assert.deepEqual(r.lint.map(l => l.code), ['art2d_sprite']);
  assert.deepEqual(lintArt2d(T.loadTemplate('runner')), []); assert.deepEqual(lintArt2d(T.loadTemplate('oomba3d', { world: 'pirate-cove' })), []);
});

const pick = (text, version = null, state = {}) => {
  const a = A.wantsArt2d(state, text, version, K.pickKit2(text));
  if (a && a.force2d) delete state.kit2;
  const k = a && a.force2d ? null : K.wantsKit2(state, text, version);
  return { k2: k, a2: k ? null : a };
};
test('engine choice: 3D stays 3D; a 2D request that names a world or an animal gets the 2D art', () => {
  // exactly what kit2.js chose before (tests/unit/builder-kit2.test.js has the full list)
  for (const [text, world] of [['a running game in a spooky forest', 'spooky-hollow'], ['a maths quiz in a medieval village', 'medieval-village'], ['a dinosaur game on the moon', 'space-base'], ['a pirate treasure game', 'pirate-cove'],
    ['Make it a 3D game in the Castle Quest world.', 'castle-quest'], ['a 3D castle adventure', 'castle-quest'], ['a 3D game with a skeleton', 'castle-quest']]) {
    const p = pick(text); assert.ok(p.k2, text); assert.equal(p.k2.world, world, text); assert.equal(p.a2, null, text);
  }
  for (const [text, world, hero, force] of [
    ['a pirate catching game', 'pirate-cove', ''], ['a catching game on a treasure island', 'pirate-cove', ''], ['a 2D game on the moon', 'space-base', ''], ['a 2D pirate game', 'pirate-cove', ''],
    ['a running game with a fox in the castle', 'castle-quest', 'fox', true], ['a running game with a triceratops on the moon', 'space-base', 'triceratops', true],
    ['a catching game with a fox', '', 'fox'], ['a jumping game with a cow', '', 'cow'], ['catch the falling pumpkins', 'spooky-hollow', ''], ['a catching game with a pony in the village', 'medieval-village', 'pony'],
    ['Use the 2D world Pirate Cove.', 'pirate-cove', ''], ['Use the 2D world Toy Town.\nMake the hero this animal: Zebra.', 'toy-town', 'zebra'],
  ]) {
    const p = pick(text); assert.equal(p.k2, null, `2D: ${text}`); assert.ok(p.a2, text);
    assert.deepEqual([p.a2.world, p.a2.hero], [world, hero], text); assert.equal(!!p.a2.force2d, !!force, text);
  }
  // nothing for the art: the old kit exactly as before
  for (const text of ['hi', 'a catching game about sharks', 'a wizard quiz', 'a racing game with cars', 'Use the Space theme.', 'a quiz about space', 'make a 3D game with a fox'])
    assert.deepEqual(pick(text), { k2: null, a2: null }, text);
  // an animal with no sprite, in a world: said honestly (the T-Rex is one of them)
  for (const text of ['a catching game with a shark in the kitchen', 'catch the falling pumpkins with a t-rex']) { const p = pick(text); assert.equal(p.a2.missing, true, text); assert.equal(p.a2.hero, '', text); assert.match(A.art2dNote(p.a2), /no sprite yet/); }
  assert.equal(pick('a pirate catching game').a2.missing, false);
  // remembered while the Builder still asks its questions; an existing game keeps what it has
  const st = {}; assert.equal(pick('a game with a fox', null, st).a2.hero, 'fox'); assert.deepEqual(st.art2d, { world: '', hero: 'fox' }); assert.equal(pick('a running game', null, st).a2.hero, 'fox');
  const cur = { html: runner('pirate-cove', 'fox') };
  assert.deepEqual([pick('make it harder', cur).a2.by, pick('make it harder', cur).a2.world, pick('make it harder', cur).a2.hero, pick('make it harder', cur).a2.changed], ['game', 'pirate-cove', 'fox', false]);
  const moved = pick('Use the 2D world Space Base.', cur).a2; assert.deepEqual([moved.world, moved.hero, moved.changed], ['space-base', 'fox', true]);
  assert.equal(pick('change the hero to a wolf', cur).a2.hero, 'wolf');
  assert.equal(pick('Make it a 3D game in the Space Base world.', cur).k2.by, 'chip', 'a 3D chip still moves a 2D game to 3D');
  const k2game = { html: T.loadTemplate('oomba3d', { world: 'castle-quest', hero: 'knight' }) };
  assert.equal(pick('Use the 2D world Pirate Cove.', k2game).k2.by, 'game', 'a 3D game stays 3D');
});

test('chips: the Classic tab\'s 2D world and animal sentences are understood in every language, and are never a 3D pick', () => {
  for (const code of CODES) {
    const d = words(code), names = d.studio.worlds.names, animals = d.studio.animals.names;
    for (const w of A.ART2D_WORLD_IDS) {
      const line = d.js.studio.world2dUse.replace('{name}', names[w]), p = A.pickArt2d(line);
      assert.deepEqual([p.world, p.by], [w, 'chip'], `${code}: ${line}`);
      assert.equal(K.pickKit2(line).by, '', `${code}: not a 3D pick`); assert.equal(K.wantsKit2({}, line, null), null, `${code}: ${line}`);
      // the 3D chip of the same world is still the 3D pick
      assert.equal(K.pickKit2(d.js.studio.worldUse.replace('{name}', names[w])).by, 'chip'); assert.equal(A.pickArt2d(d.js.studio.worldUse.replace('{name}', names[w])).world, '');
    }
    for (const c of A.ART2D_ANIMALS) { const line = d.js.studio.animal2dUse.replace('{name}', animals[c.id]); assert.deepEqual([A.pickArt2d(line).hero, A.pickArt2d(line).by], [c.id, 'chip'], `${code}: ${line}`); }
    const both = pick(`${d.js.studio.world2dUse.replace('{name}', names['castle-quest'])}\n${d.js.studio.animal2dUse.replace('{name}', animals.wolf)}`);
    assert.equal(both.k2, null); assert.deepEqual([both.a2.world, both.a2.hero], ['castle-quest', 'wolf'], code);
  }
});

let n = 0;
const newUser = () => auth.createUser({ username: `A2_${String.fromCharCode(97 + (n++ % 26))}${n}`, password: 'secret1' });
async function turn(user, gameId, text) {
  const events = [];
  const r = await runTurn({ user, gameId, text, emit: (name, data) => events.push([name, data]) });
  const of = name => events.filter(e => e[0] === name).map(e => e[1]);
  return { r, of, text: of('text').map(d => d.text).join('') };
}
const current = id => games.getVersion(games.getGame(id).current_version_id);

test('start_from_template: a 2D world and a sprite hero for runner and catch, or a refusal with the real names', async () => {
  const u = newUser(), g = games.createGame(u.id, {}), state = {};
  const tb = toolbox({ user: u, gameId: g.id, emit: () => {}, state, locale: 'en' });
  let r = await tb.exec('start_from_template', { template: 'catch', world: 'candy-land', notes: 'x' });
  assert.equal(r.ok, false); assert.match(r.forModel, /no 2D world called "candy-land"[\s\S]*pirate-cove/);
  r = await tb.exec('start_from_template', { template: 'runner', world: 'pirate-cove', hero: 'unicorn', notes: 'x' });
  assert.equal(r.ok, false); assert.match(r.forModel, /no sprite hero or animal called "unicorn"[\s\S]*fox/);
  r = await tb.exec('start_from_template', { template: 'catch', world: 'toy-town', hero: 'pig', notes: 'A town catch' });
  assert.equal(r.ok, true); assert.match(r.forModel, /2D world toy-town with the sprite pig/);
  assert.deepEqual(art2dOf(tb.current().html), { world: 'toy-town', hero: 'pig' });
  r = await tb.exec('start_from_template', { template: 'quiz', world: 'toy-town', notes: 'A quiz' });
  assert.equal(r.ok, true); assert.match(r.forModel, /does not draw the 2D worlds yet/); assert.ok(!tb.current().html.includes('art2d'));
  r = await tb.exec('start_from_template', { template: 'runner', notes: 'Plain' });
  assert.equal(r.ok, true); assert.ok(!tb.current().html.includes('art2d'), 'no world asked for, none given');
});

test('mock: "a pirate catching game" is a 2D catching game with the Pirate Cove pack', async () => {
  const u = newUser(), g = games.createGame(u.id, { title: 'New game' });
  let t = await turn(u, g.id, 'a pirate catching game');
  assert.equal(t.of('version').length, 1, 'built straight away'); assert.equal(t.of('version')[0].status, 'pass');
  let v = current(g.id);
  assert.ok(usesKit(v.html) && !K.isKit2Game(v.html), 'a 2D game on the Oomba Kit');
  assert.match(v.html, /Catch the Falling Things, on the Oomba Kit/);
  assert.ok(v.html.includes(S.oomba2dTag()) && v.html.includes(S.art2dPackTag('pirate-cove')));
  assert.deepEqual(art2dOf(v.html), { world: 'pirate-cove', hero: '' });
  assert.match(t.text, /set in Pirate Cove/);
  assert.equal(scanVersion(v.html).status, 'pass'); assert.deepEqual(scanVersion(v.html).lint, []);
  // another world and an animal later: two CONFIG lines and the pack tags
  t = await turn(u, g.id, 'Use the 2D world Castle Quest.\nMake the hero this animal: Fox.');
  v = current(g.id);
  assert.equal(v.number, 2); assert.deepEqual(art2dOf(v.html), { world: 'castle-quest', hero: 'fox' });
  assert.ok(v.html.includes(S.art2dPackTag('castle-quest')) && v.html.includes(S.art2dPackTag('animals')) && !v.html.includes('art2d/pirate-cove/'));
  assert.equal(scanVersion(v.html).status, 'pass'); assert.deepEqual(scanVersion(v.html).lint, []);
  t = await turn(u, g.id, 'make it harder');
  assert.deepEqual(art2dOf(current(g.id).html), { world: 'castle-quest', hero: 'fox' }, 'an ordinary change keeps the art');
  for (const ver of games.listVersions(g.id)) assert.equal(ver.safety_status, 'pass');
});

test('mock: "a running game with a fox in the castle" is a 2D runner with the Castle Quest and animals packs', async () => {
  const u = newUser(), g = games.createGame(u.id, { title: 'New game' });
  const t = await turn(u, g.id, 'a running game with a fox in the castle');
  assert.equal(t.of('version').length, 1); assert.equal(t.of('version')[0].status, 'pass');
  const v = current(g.id);
  assert.ok(usesKit(v.html) && !K.isKit2Game(v.html)); assert.match(v.html, /Endless Runner, on the Oomba Kit/);
  assert.deepEqual(art2dOf(v.html), { world: 'castle-quest', hero: 'fox' });
  for (const id of ['castle-quest', 'animals']) assert.ok(v.html.includes(S.art2dPackTag(id)), id);
  assert.ok(!v.html.includes('art2d/heroes/'), 'only the packs it uses');
  assert.match(t.text, /set in Castle Quest, and the fox is your hero/);
  assert.equal(scanVersion(v.html).status, 'pass'); assert.deepEqual(scanVersion(v.html).lint, []);
});

test('mock: an animal with no sprite is said honestly; a game with no world is the classic game', async () => {
  const u = newUser();
  let g = games.createGame(u.id, { title: 'New game' });
  let t = await turn(u, g.id, 'a catching game with a shark in the kitchen');
  assert.match(t.text, /no picture of that animal yet/);
  assert.deepEqual(art2dOf(current(g.id).html), { world: 'busy-kitchen', hero: '' });
  g = games.createGame(u.id, { title: 'New game' });
  t = await turn(u, g.id, 'a catching game about sharks');
  assert.ok(!current(g.id).html.includes('art2d'), 'no world, no 2D art'); assert.doesNotMatch(t.text, /picture of that animal|set in/);
  g = games.createGame(u.id, { title: 'New game' });
  t = await turn(u, g.id, 'a running game\njust build it');
  assert.ok(!current(g.id).html.includes('art2d'));
});

test('the Studio picker: the Classic tab offers every 2D world and animal with a picture and a translated name', async () => {
  const app = createApp(); const server = app.listen(0); const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const u = newUser(), g = games.createGame(u.id, { title: 'Pick' });
    const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: u.username, password: 'secret1' }) });
    const cookie = (login.headers.getSetCookie ? login.headers.getSetCookie() : []).map(c => c.split(';')[0]).join('; ');
    const page = await (await fetch(`${base}/studio/${g.id}`, { headers: { cookie } })).text();
    const row = /id="st-row-classic"[\s\S]*?<\/div>/.exec(page);
    assert.ok(row, 'the Classic row');
    for (const w of A.ART2D_WORLD_IDS) assert.match(row[0], new RegExp(`data-world2d="${w}"[^>]*data-name="[^"]+ · 2D"[^>]*><img src="/img/kit2/worlds/${w}\\.webp"`), w);
    for (const c of A.ART2D_ANIMALS) assert.match(row[0], new RegExp(`data-animal="${c.id}" data-name="[^"]+"[^>]*><img src="/img/art2d/animals/${c.id}\\.webp"`), c.id);
    assert.match(row[0], /class="st-theme/, 'the kit themes are still there');
    assert.equal((await fetch(`${base}/vendor/art2d/pirate-cove/1.0.0/far.webp`)).headers.get('content-type'), 'image/webp');
    assert.match((await fetch(`${base}/vendor/art2d/oomba2d/${S.OOMBA2D_VERSION}/oomba2d.js`)).headers.get('cache-control'), /immutable/);
  } finally { server.close(); }
});

// ---------------------------------------------------------------- real Chromium, the production frame
const HOST = 'http://game.invalid';
let browser;
test.after(async () => { if (browser) await browser.close(); });
/** Play a game in the sandboxed frame under the frame CSP -> what it drew. */
async function play(html, { size = [960, 600], reduced = false, backend = 'paper' } = {}) {
  const { chromium } = await import('playwright-core');
  if (!browser) browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: size[0], height: size[1] }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const doc = frameDocument(html, { user: { displayName: 'T', avatar: 'x', lang: 'en' }, game: { id: 'g', title: 'K' }, save: {}, canSave: false });
  const page = `<!doctype html><meta charset=utf-8><body style="margin:0"><iframe id=f sandbox="${SANDBOX}" src="${HOST}/frame?okGov=off&okBackend=${backend}" style="border:0;width:100vw;height:100vh;display:block"></iframe>`;
  const seen = [], errors = [];
  await ctx.route('**/*', route => {
    const u = route.request().url(); seen.push(u);
    if (u === HOST + '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: page });
    if (u.startsWith(HOST + '/frame')) return route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': frameCsp(HOST) }, body: doc });
    const f = u.startsWith(HOST + '/vendor/') && vendorFile(u);
    if (f) return route.fulfill({ status: 200, headers: { 'content-type': { js: 'text/javascript', webp: 'image/webp', woff2: 'font/woff2' }[f.split('.').pop()] || 'application/octet-stream', 'access-control-allow-origin': '*', 'cross-origin-resource-policy': 'cross-origin' }, body: fs.readFileSync(f) });
    return route.fulfill({ status: 404, body: '' });
  });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(String(e))); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(HOST + '/', { waitUntil: 'load' });
  const frame = p.frames().find(f => f.url().startsWith(HOST + '/frame'));
  await frame.waitForFunction(() => { const T = window.__brbTest; if (!T || !T.state) return false; const s = T.state().scene; if (s !== 'play' && T.start) T.start(); return s === 'play'; }, null, { timeout: 60_000, polling: 400 });
  await p.waitForTimeout(1800);
  // What is on the kit's canvas now: read the picture's pixels (the frame is opaque-origin, but its own canvas is its own).
  const R = await frame.evaluate(() => {
    const O2 = window.Oomba2D, T = window.__brbTest.state(), c = document.querySelector('.ok-stage canvas');
    const probe = document.createElement('canvas'); probe.width = 96; probe.height = 60; const g = probe.getContext('2d'); g.drawImage(c, 0, 0, 96, 60);
    const d = g.getImageData(0, 0, 96, 60).data, px = (x, y) => [d[(y * 96 + x) * 4], d[(y * 96 + x) * 4 + 1], d[(y * 96 + x) * 4 + 2]];
    const colours = new Set(); for (let i = 0; i < d.length; i += 4) colours.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4));
    return { scene: T.scene, stats: O2 ? O2.stats : null, worlds: O2 ? O2.worlds : null, top: px(48, 3), colours: colours.size, portrait: !!document.querySelector('.a2d-portrait'), heroX: T.hero ? T.hero.x : (T.x || 0), canvas: [c.width, c.height] };
  });
  // run on for a moment: the hero's frames change
  const f0 = await frame.evaluate(() => window.Oomba2D ? window.Oomba2D.stats.draws : 0); await p.waitForTimeout(1200);
  R.drawsLater = await frame.evaluate(() => window.Oomba2D ? window.Oomba2D.stats.draws : 0); R.draws0 = f0;
  await ctx.close();
  return { R, seen, errors };
}
const hexToRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

for (const [key, world, hero] of [['runner', 'pirate-cove', 'fox'], ['runner', 'castle-quest', 'knight'], ['runner', 'space-base', 'mage'], ['catch', 'pirate-cove', 'knight'], ['catch', 'castle-quest', 'cow'], ['catch', 'space-base', 'skelly']]) {
  test(`in the frame: a ${key} game in ${world} with ${hero} draws the pack's pictures`, { skip, timeout: 120_000 }, async () => {
    const html = T.loadTemplate(key, { world, hero }), { R, seen, errors } = await play(html);
    assert.deepEqual(errors, [], 'no errors, nothing refused by the CSP');
    assert.equal(R.scene, 'play'); assert.deepEqual(R.worlds, [world]);
    const m = S.art2dManifest(world), c = A.art2dCharacter(hero);
    // every picture of the world and the hero's sheet were fetched from the pack's folder, and nothing else from /vendor/art2d/
    const art = seen.filter(u => u.includes('/vendor/art2d/')).map(u => u.replace(HOST + '/vendor/art2d/', '')).sort();
    assert.deepEqual(art, [`${c.pack}/1.0.0/${hero}.webp`, `${c.pack}/1.0.0/pack.js`, `oomba2d/${S.OOMBA2D_VERSION}/oomba2d.js`, ...['far.webp', 'ground.webp', 'mid.webp', 'pack.js', 'props.webp'].map(f => `${world}/1.0.0/${f}`)].sort());
    assert.equal(R.stats.images, 5, 'five pictures decoded');
    assert.equal(R.stats.define, Object.keys(m.sprites).length + 6, 'every sprite, the ground, two strips, the sky, the under colour and the hero are kit sprites');
    assert.ok(R.stats.draws >= 12, `the kit drew them (${R.stats.draws} bakes from the pack's pictures)`);
    // the top of the picture is the world's sky colour (the kit's own sky is covered)
    const sky = hexToRgb(m.sky[0]); for (let i = 0; i < 3; i++) assert.ok(Math.abs(R.top[i] - sky[i]) <= 28, `sky ${R.top} is ${m.sky[0]}`);
    assert.ok(R.colours > 40, `a picture, not a flat fill (${R.colours} colours)`);
    if (key === 'runner') assert.ok(R.drawsLater > R.draws0, 'the running hero shows new frames');
    assert.ok(!seen.some(u => !u.startsWith(HOST + '/')), 'nothing left our origin');
  });
}

test('in the frame: with no world the game has the classic look, and Oomba2D is not even loaded', { skip, timeout: 120_000 }, async () => {
  for (const key of ['runner', 'catch']) {
    const { R, seen, errors } = await play(T.loadTemplate(key));
    assert.deepEqual(errors, []); assert.equal(R.scene, 'play'); assert.equal(R.stats, null, 'no Oomba2D');
    assert.ok(!seen.some(u => u.includes('art2d')), key); assert.ok(R.colours > 20);
  }
});

test('in the frame: when a picture cannot load the game still plays, with the kit\'s look', { skip, timeout: 120_000 }, async () => {
  // a world name the packs do not have (an older saved game after a pack was renamed would look like this)
  const html = T.loadTemplate('runner', { world: 'pirate-cove', hero: 'fox' }).replace("world: 'pirate-cove'", "world: 'nowhere'").replace("hero2d: 'fox'", "hero2d: 'nobody'");
  const { R, errors } = await play(html);
  assert.deepEqual(errors, []); assert.equal(R.scene, 'play'); assert.equal(R.stats.define, 0, 'nothing was drawn from the packs');
});

test('in the frame: on a phone, with reduced motion, the world still draws and the hero stands on the ground', { skip, timeout: 120_000 }, async () => {
  const { R, errors } = await play(T.loadTemplate('runner', { world: 'medieval-village', hero: 'pony' }), { size: [390, 844], reduced: true });
  assert.deepEqual(errors, []); assert.equal(R.scene, 'play'); assert.ok(R.stats.draws >= 12);
  const sky = hexToRgb(S.art2dManifest('medieval-village').sky[0]); for (let i = 0; i < 3; i++) assert.ok(Math.abs(R.top[i] - sky[i]) <= 28);
});
