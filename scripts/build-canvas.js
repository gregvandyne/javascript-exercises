// Build Oomba Canvas: canvas/src/*.js (ES modules, imported directly by the unit tests) -> one classic-script IIFE at
// public/vendor/oomba-canvas/<version>/oomba-canvas.js, the same CSS as a readable oomba-canvas.css (the script carries
// it: a game frame may not load stylesheets from the site), the font files, and manifest.json (sha384 of every file).
// The pinned hashes live in server/services/canvaskit.js (CANVAS_VERSIONS) and canvas/SHIPPED.json.
//   node scripts/build-canvas.js           build the version in canvas/src/ui.js (VERSION); refused once that version
//                                          is in canvas/SHIPPED.json and the new build differs from it (versions are
//                                          immutable: saved games pin the hash; make a new version instead)
//   node scripts/build-canvas.js --check   rebuild in memory and fail if the files on disk differ
// Bundling: the modules share one function scope, in dependency order (import lines dropped, export keywords removed),
// so top-level names must be unique across canvas/src. No minifier: the kit is small and stays readable.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'canvas/src');
const ORDER = ['logic', 'words', 'style', 'ui', 'index'];
const FONTS = { from: path.join(ROOT, 'public/vendor/oomba-kit/1.1.6/fonts'), files: ['bricolage-latin.woff2', 'bricolage-latin-ext.woff2', 'OFL.txt'] };
export const sri = buf => `sha384-${crypto.createHash('sha384').update(buf).digest('base64')}`;

export function bundle() {
  const parts = ORDER.map(name => {
    const src = fs.readFileSync(path.join(SRC, `${name}.js`), 'utf8');
    const body = src.split('\n').filter(l => !/^import\s.*from\s+'\.\/[\w-]+\.js';\s*$/.test(l) && !/^export\s*\{[^}]*\}(\s*from\s*'[^']*')?;\s*$/.test(l))
      .map(l => l.replace(/^export\s+(?=(async\s+)?(function|class|const|let)\b)/, ''));
    for (const l of body) if (/^\s*(import|export)\b/.test(l)) throw new Error(`${name}.js: unsupported module line: ${l}`);
    return `// ---- ${name}.js\n${body.join('\n')}`;
  });
  return `/*! Oomba Canvas ${version()} | (c) Oomba Academy | the classroom activity kit: docs/canvas-api.md */\n(function () {\n'use strict';\n${parts.join('\n')}\n})();\n`;
}
export function version() { const m = /const VERSION = '(\d+\.\d+\.\d+)'/.exec(fs.readFileSync(path.join(SRC, 'ui.js'), 'utf8')); if (!m) throw new Error('no VERSION in canvas/src/ui.js'); return m[1]; }
export async function css() { const m = await import(`${path.join(SRC, 'style.js')}?t=${Date.now()}`); return m.CSS; }

/** Everything the version folder holds: { 'oomba-canvas.js': Buffer, ... }. */
export async function files() {
  const out = { 'oomba-canvas.js': Buffer.from(bundle()), 'oomba-canvas.css': Buffer.from(`/*! Oomba Canvas ${version()}: the styles oomba-canvas.js puts in the page (a copy to read; games never link it) */\n${await css()}`) };
  for (const f of FONTS.files) out[`fonts/${f}`] = fs.readFileSync(path.join(FONTS.from, f));
  out['manifest.json'] = Buffer.from(JSON.stringify({ name: 'oomba-canvas', version: version(), files: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, sri(v)])) }, null, 2) + '\n');
  return out;
}

async function main() {
  const v = version(), dir = path.join(ROOT, 'public/vendor/oomba-canvas', v), built = await files();
  const shipped = JSON.parse(fs.readFileSync(path.join(ROOT, 'canvas/SHIPPED.json'), 'utf8')).versions || {};
  const same = Object.entries(built).every(([k, b]) => { const f = path.join(dir, k); return fs.existsSync(f) && fs.readFileSync(f).equals(b); });
  if (process.argv.includes('--check')) { if (!same) { console.error(`oomba-canvas ${v}: the files on disk differ from a fresh build`); process.exit(1); } console.log(`oomba-canvas ${v}: up to date`); return; }
  if (shipped[v] && !same) { console.error(`oomba-canvas ${v} has shipped (canvas/SHIPPED.json): its files may never change. Make a new version.`); process.exit(1); }
  for (const [k, b] of Object.entries(built)) { const f = path.join(dir, k); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, b); }
  const js = sri(built['oomba-canvas.js']);
  const svc = path.join(ROOT, 'server/services/canvaskit.js');
  if (!shipped[v]) fs.writeFileSync(svc, fs.readFileSync(svc, 'utf8').replace(new RegExp(`('${v.replace(/\./g, '\\.')}': )'sha384-[^']*'`), `$1'${js}'`));
  console.log(`oomba-canvas ${v}: ${(built['oomba-canvas.js'].length / 1024).toFixed(1)} KB js, ${js}`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch(e => { console.error(e); process.exit(1); });
