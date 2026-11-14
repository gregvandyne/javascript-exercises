// 2D art packs (docs/kit2-themes-plan.md, "2D versions"): the worlds, heroes and animals of Kit 2 drawn from their 3D
// models as pictures a 2D game can use: backgrounds that tile, a ground strip, props, and sprite sheets.
//   node kit2/pipeline/art2d.mjs [pack ...] [--out public/vendor/art2d] [--stage <staged packs>] [--check]
// With no pack named it builds every pack of kit2/art2d/packs.json that it can (the animals need --stage: the staged
// creature conversions of kit2/pipeline/stage-pack.mjs, which are not in the repository). Worlds and heroes are drawn
// only from shipped theme files under public/vendor/themes/. A pack folder that exists is never rewritten: --check
// builds into memory and compares with what is on disk (the determinism test), otherwise an existing version is skipped.
// Output per pack: <out>/<pack>/<version>/ with the WebP pictures, pack.json (sizes, frames, anchors, every file's
// hash) and pack.js (the same manifest for a game: Oomba2D.pack({...})). Then run kit2/pipeline/art2d-lock.mjs.
// Needs the Playwright Chromium (BRB_CHROMIUM, or the one Playwright installed); draws with software WebGL.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../..');
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf('--' + name); return i < 0 ? dflt : args[i + 1]; };
const flag = name => args.includes('--' + name);
const names = args.filter((a, i) => !a.startsWith('--') && !(i && ['--out', '--stage'].includes(args[i - 1])));
const OUT = path.resolve(opt('out', path.join(ROOT, 'public/vendor/art2d'))), STAGE = opt('stage', '');
const RECIPES = JSON.parse(fs.readFileSync(path.join(ROOT, 'kit2/art2d/packs.json'), 'utf8'));
export const sri = buf => 'sha384-' + crypto.createHash('sha384').update(buf).digest('base64');

const THEMES = path.join(ROOT, 'public/vendor/themes');
const served = { '/three/': path.join(ROOT, 'public/vendor/three/0.185.1'), '/addons/': path.join(ROOT, 'public/vendor/kit2/three-addons/0.185.1'), '/themes/': THEMES, '/pipeline/': HERE, ...(STAGE ? { '/stage/': path.resolve(STAGE) } : {}) };
const TYPES = { '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.json': 'application/json', '.wasm': 'application/wasm' };

/** Build the packs named (all when none) -> [{ id, version, dir, files: { name: Buffer } }]; nothing is written here. */
export async function buildPacks(ids = []) {
  const exe = [process.env.BRB_CHROMIUM, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => p && fs.existsSync(p));
  const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await (await browser.newContext({ viewport: { width: 800, height: 600 } })).newPage();
    const HOST = 'http://art2d.invalid';
    await page.route(HOST + '/**', route => {
      const u = new URL(route.request().url());
      if (u.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>art2d</title><script type="importmap">{"imports":{"three":"/three/three.module.min.js","three/addons/":"/addons/"}}</script><body>' });
      for (const [prefix, d] of Object.entries(served)) if (u.pathname.startsWith(prefix)) {
        const f = path.join(d, path.normalize(decodeURIComponent(u.pathname.slice(prefix.length))));
        if (f.startsWith(d) && fs.existsSync(f)) return route.fulfill({ contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
      }
      return route.fulfill({ status: 404, body: '' });
    });
    const errors = []; page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); page.on('pageerror', e => errors.push(e.message));
    await page.goto(HOST + '/');
    const out = [];
    for (const [id, recipe] of Object.entries(RECIPES.packs)) {
      if (ids.length && !ids.includes(id)) continue;
      if (recipe.kind === 'animals' && !STAGE) { if (ids.length) throw new Error('the animals pack needs --stage <staged packs>'); continue; }
      const theme = recipe.theme ? JSON.parse(fs.readFileSync(path.join(THEMES, recipe.theme, recipe.themeVersion, 'theme.json'), 'utf8')) : null;
      const look = theme ? theme.look : JSON.parse(fs.readFileSync(path.join(THEMES, RECIPES.daylight, 'theme.json'), 'utf8')).look;
      const base = theme ? `/themes/${recipe.theme}/${recipe.themeVersion}/` : '/stage/';
      const r = await page.evaluate(async ({ recipe, theme, look, base }) => {
        const P = await import('/pipeline/art2d-page.js');
        if (recipe.kind === 'world') return P.buildWorld(recipe, theme, base);
        if (recipe.kind === 'heroes') return P.buildHeroes(recipe, theme, base);
        return P.buildAnimals(recipe, look, base);
      }, { recipe, theme, look, base });
      if (errors.length) throw new Error(`${id}: ${errors.join('; ')}`);
      const files = {}; for (const [n, b64] of Object.entries(r.images)) files[n] = Buffer.from(b64, 'base64');
      const { images, ...art } = r;
      // Where the art comes from, with its licences: a world's is its theme's (which holds the licence files).
      const from = theme ? { theme: `${recipe.theme}/${recipe.themeVersion}`, packs: theme.packs.map(p => ({ id: p.id, name: p.name, author: p.author, licence: p.licence })) }
        : { packs: recipe.sources };
      if (recipe.licenses) for (const [n, f] of Object.entries(recipe.licenses)) files['LICENSES/' + n] = fs.readFileSync(path.resolve(ROOT, f));
      const manifest = { id, version: recipe.version, kind: recipe.kind, name: recipe.name || (theme && theme.name) || id, ...(recipe.kind === 'world' ? { world: recipe.theme, heroes: theme.heroes.map(h => h.id) } : {}),
        cell: 96, from, ...art,
        files: Object.fromEntries(Object.entries(files).sort(([a], [b]) => (a < b ? -1 : 1)).map(([n, b]) => [n, { bytes: b.length, sha384: sri(b) }])) };
      files['pack.json'] = Buffer.from(JSON.stringify(manifest, null, 1) + '\n');
      files['pack.js'] = Buffer.from(`// Oomba 2D art pack ${id} ${recipe.version} (built by kit2/pipeline/art2d.mjs from pack.json: never edited by hand).\nOomba2D.pack(${JSON.stringify(manifest)});\n`);
      out.push({ id, version: recipe.version, dir: path.join(OUT, id, recipe.version), files });
    }
    return out;
  } finally { await browser.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const built = await buildPacks(names);
  let bad = 0;
  for (const p of built) {
    const total = Object.values(p.files).reduce((n, b) => n + b.length, 0);
    if (flag('check')) {
      const diff = Object.entries(p.files).filter(([n, b]) => !fs.existsSync(path.join(p.dir, n)) || !fs.readFileSync(path.join(p.dir, n)).equals(b)).map(([n]) => n);
      console.log(`${p.id} ${p.version}: ${diff.length ? 'DIFFERS: ' + diff.join(', ') : 'same as on disk'}`); bad += diff.length;
      continue;
    }
    if (fs.existsSync(path.join(p.dir, 'pack.json')) && !flag('force')) { console.log(`${p.id} ${p.version}: already built (a shipped version never changes; bump the version in kit2/art2d/packs.json)`); continue; }
    for (const [n, b] of Object.entries(p.files)) { fs.mkdirSync(path.dirname(path.join(p.dir, n)), { recursive: true }); fs.writeFileSync(path.join(p.dir, n), b); }
    console.log(`${p.id} ${p.version}: ${Object.keys(p.files).length} files, ${Math.round(total / 1024)} KB`);
  }
  process.exit(bad ? 1 : 0);
}
