// Build Oomba Figures (figures/src/*.js, ES modules the unit tests import directly) into one classic-script IIFE at
// public/vendor/oomba-figures/<version>/oomba-figures.js, with its LICENSE and manifest.json (sha256 and sha384 of every
// file). The modules share one scope in dependency order, and a version that is in figures/SHIPPED.json may never change
// (saved games pin its hash): make a new version instead. From 1.1.0 the file is minified by esbuild (the pinned,
// build-only devDependency scripts/build-kit.js uses; the build stops if it is missing rather than ship other bytes):
// comments go, except the legal ones (/*! ... */): the header and, for each ported file (figures/src/ported/), its note
// that it is ported code under the Apache License 2.0 and how it was changed (section 4(b)). 1.0.0 was not minified,
// and stays byte for byte.
// The vendored libraries next to it (JSXGraph, SmilesDrawer) are copied from npm by scripts/vendor-figures.js; this
// script only (re)writes Oomba Figures and then the lock for all three.
//   node scripts/build-figures.js           build the version in figures/src/svg.js (FIG_VERSION) and lock it
//   node scripts/build-figures.js --check   rebuild in memory and fail if the files on disk differ
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// The core and its packs (docs/figures-api.md "The core and its packs"): each is one classic-script IIFE in the version
// folder, the core at oomba-figures.js and each pack at packs/<name>.js, loaded after it. A pack's modules may import
// from the core's modules (the core hands them over as OombaFigures._core, a frozen object of exactly the names the packs
// use) and from the pack's own modules, never from another pack: each file stands on the core alone.
export const PARTS = {
  core: ['canvas/src/expr.js', 'figures/src/svg.js', 'figures/src/words.js', 'figures/src/notice.js', 'figures/src/ported/numbering.js', 'figures/src/ported/transform.js', 'figures/src/radians.js', 'figures/src/mathtext.js', 'figures/src/graphs.js', 'figures/src/core.js'],
  math: ['figures/src/ported/numberline.js', 'figures/src/ported/shapes.js', 'figures/src/ported/polygons.js', 'figures/src/shapes.js', 'figures/src/ported/lines.js', 'figures/src/lines.js', 'figures/src/ported/segments.js', 'figures/src/segments.js', 'figures/src/ported/circle.js', 'figures/src/circle.js', 'figures/src/composite.js', 'figures/src/ported/solids.js', 'figures/src/ported/nets.js', 'figures/src/solids.js', 'figures/src/ported/mapping.js', 'figures/src/mapping.js', 'figures/src/packs/math.js'],
  data: ['figures/src/ported/stats.js', 'figures/src/data.js', 'figures/src/prob.js', 'figures/src/packs/data.js'],
  physics: ['figures/src/ported/circuittree.js', 'figures/src/network.js', 'figures/src/physics.js', 'figures/src/ported/motion.js', 'figures/src/motion.js', 'figures/src/ported/projectile.js', 'figures/src/projectile.js', 'figures/src/ported/waves.js', 'figures/src/waves.js', 'figures/src/packs/physics.js'],
  chem: ['figures/src/chem.js', 'figures/src/curves.js', 'figures/src/packs/chem.js'],
  measure: ['figures/src/ported/ruler.js', 'figures/src/ported/gauges.js', 'figures/src/readings.js', 'figures/src/protractor.js', 'figures/src/packs/measure.js'],
};
export const PACKS = Object.keys(PARTS).filter(k => k !== 'core');
/** The file a part is published as, inside the version folder. */
export const partFile = part => (part === 'core' ? 'oomba-figures.js' : `packs/${part}.js`);
// Ported code (figures/src/ported/, Apache License 2.0, its LICENSE.txt next to it; docs/third-party.md) goes into the
// bundle with its "changed from the original" notes, and its license text into the version folder's LICENSE after ours.
export const LICENSE = `Oomba Figures
Copyright (c) 2026 Oomba Academy

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
`;
/** The version folder's LICENSE: ours (MIT), then the Apache License 2.0 that the ported parts are used under. */
export function licenseText() {
  const apache = fs.readFileSync(path.join(ROOT, 'figures/src/ported/LICENSE.txt'), 'utf8');
  return `${LICENSE}\n----------------------------------------------------------------------------------------------------------------------\nParts of oomba-figures.js and its packs (the sections from figures/src/ported/, each marked in the file) are ported\ncode used under the Apache License, Version 2.0. Where they come from is recorded in docs/third-party.md. The license:\n\n${apache}`;
}
export const sri = buf => `sha384-${crypto.createHash('sha384').update(buf).digest('base64')}`;
export const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');
export function version() { const m = /export const FIG_VERSION = '(\d+\.\d+\.\d+)'/.exec(fs.readFileSync(path.join(ROOT, 'figures/src/svg.js'), 'utf8')); if (!m) throw new Error('no FIG_VERSION in figures/src/svg.js'); return m[1]; }

const IMPORT_RE = /^import\s*\{([^}]*)\}\s*from\s*'([^']+)';\s*$/;
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const partOf = rel => Object.keys(PARTS).find(k => PARTS[k].includes(rel));
/** The names each module imports, and from which file: [{ name, as, from }]. */
function importsOf(rel) {
  const out = [];
  for (const l of read(rel).split('\n')) {
    const m = IMPORT_RE.exec(l); if (!m) continue;
    const from = path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[2]));
    for (const x of m[1].split(',').map(t => t.trim()).filter(Boolean)) { const [name, as] = x.split(/\s+as\s+/); out.push({ name, as: as || name, from }); }
  }
  return out;
}
/** The core's names that the packs use (handed to them as OombaFigures._core): [{ name, as }], sorted. */
export function coreLib() {
  const seen = new Map();
  for (const p of PACKS) for (const rel of PARTS[p]) for (const im of importsOf(rel)) {
    const where = partOf(im.from);
    if (!where) throw new Error(`${rel}: imports ${im.from}, which is in no part`);
    if (where !== 'core' && where !== p) throw new Error(`${rel} (the ${p} pack) imports from ${im.from} (the ${where} pack): a pack may use the core and itself only`);
    if (where === 'core') { if (im.as !== im.name) throw new Error(`${rel}: a name from the core is used under its own name (no "as")`); seen.set(im.name, im.name); }
  }
  for (const rel of PARTS.core) for (const im of importsOf(rel)) if (partOf(im.from) !== 'core') throw new Error(`${rel}: the core may not import from a pack (${im.from})`);
  return [...seen.keys()].sort();
}
function body(rel) {
  const src = read(rel);
  const lines = src.split('\n').filter(l => !/^import\s.*from\s+'(\.\.?\/)+[\w./-]+\.js';\s*$/.test(l) && !/^export\s*\{[^}]*\}(\s*from\s*'[^']*')?;\s*$/.test(l))
    .map(l => l.replace(/^export\s+(?=(async\s+)?(function|class|const|let)\b)/, ''));
  for (const l of lines) if (/^\s*(import|export)\b/.test(l)) throw new Error(`${rel}: unsupported module line: ${l}`);
  return `${rel.startsWith('figures/src/ported/') ? portedNote(rel, src) : ''}// ---- ${rel}\n${lines.join('\n')}`;
}
/** One part (the core, or a pack) as a classic script, not yet minified. */
export function bundle(part = 'core') {
  if (!PARTS[part]) throw new Error(`no part "${part}"`);
  const v = version(), parts = PARTS[part].map(body);
  if (part === 'core') {
    const lib = coreLib();
    return `/*! Oomba Figures ${v} | (c) Oomba Academy | MIT, with ported parts under Apache-2.0 (see LICENSE) | science, math and graph figures as SVG: docs/figures-api.md */\n(function () {\n'use strict';\n${parts.join('\n')}\n// ---- the names the packs use (they load after this file)\nObject.defineProperty(OombaFigures, '_core', { value: Object.freeze({ ${lib.join(', ')} }) });\n})();\n`;
  }
  const names = [...new Set(PARTS[part].flatMap(rel => importsOf(rel).filter(im => partOf(im.from) === 'core').map(im => im.name)))].sort();
  return `/*! Oomba Figures ${v}, the ${part} pack | (c) Oomba Academy | MIT, with ported parts under Apache-2.0 (see LICENSE) | load it after oomba-figures.js: docs/figures-api.md */\n(function () {\n'use strict';\nconst __of = globalThis.OombaFigures;\nif (!__of || __of.version !== '${v}' || !__of._core) { if (typeof console !== 'undefined') console.warn('[oomba-figures] the ${part} pack needs the Oomba Figures ${v} tag before it'); return; }\nconst { ${names.join(', ')} } = __of._core;\n${parts.join('\n')}\n})();\n`;
}
/** A ported file's note (its leading comment: what it is, that it is ported under the Apache License 2.0, and how it was
 *  changed) as a legal comment, which the minifier keeps where it is. */
export function portedNote(rel, src) {
  const lines = [];
  for (const l of src.split('\n')) { if (!l.startsWith('//')) break; lines.push(l.replace(/^\/\/ ?/, '')); }
  const text = lines.join('\n').replace(/\*\//g, '* /').trim();
  if (!/Ported code, used under the Apache License 2\.0/.test(text) || !/Changed from the original/.test(text)) throw new Error(`${rel}: a ported file must open with its note (ported under the Apache License 2.0, and how it was changed)`);
  return `/*! ${rel}:\n${text}\n*/\n`;
}
/** The bundle, minified (esbuild, pinned): the same code, no comments but the legal ones, short local names. */
export function minified(code = bundle()) {
  let esbuild;
  try { esbuild = createRequire(import.meta.url)('esbuild'); } catch (e) { throw new Error('oomba-figures: minifying needs esbuild (the pinned devDependency): run npm install'); }
  if (esbuild.version !== ESBUILD) throw new Error(`oomba-figures: esbuild ${esbuild.version} is not the pinned ${ESBUILD} (its output could differ)`);
  return esbuild.transformSync(code, { minify: true, target: 'es2020', legalComments: 'inline', charset: 'utf8' }).code;
}
const ESBUILD = '0.28.2';
/** The version folder: { 'oomba-figures.js', 'packs/<name>.js' (each a Buffer), LICENSE, 'manifest.json' }. The manifest
 *  names each file's sha256 and SRI, and each pack's file and kinds. */
export async function files() {
  const out = {};
  for (const part of Object.keys(PARTS)) out[partFile(part)] = Buffer.from(minified(bundle(part)));
  out.LICENSE = Buffer.from(licenseText());
  const { KIND_PACKS } = await import('../figures/src/core.js');
  const packs = Object.fromEntries(PACKS.map(p => [p, { file: partFile(p), kinds: Object.keys(KIND_PACKS).filter(k => KIND_PACKS[k] === p) }]));
  out['manifest.json'] = Buffer.from(JSON.stringify({ name: 'oomba-figures', version: version(), license: 'MIT AND Apache-2.0', source: 'figures/src (this repository; figures/src/ported is Apache-2.0, docs/third-party.md)',
    core: { file: partFile('core'), kinds: Object.keys(KIND_PACKS).filter(k => KIND_PACKS[k] === 'core') }, packs,
    files: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, { sha256: sha256(v), sri: sri(v) }])) }, null, 2) + '\n');
  return out;
}
/** Every file under a folder, as paths relative to it ('packs/math.js'), sorted. */
export function filesIn(dir, pre = '') {
  return fs.readdirSync(path.join(dir, pre), { withFileTypes: true }).flatMap(e => (e.isDirectory() ? filesIn(dir, path.posix.join(pre, e.name)) : [path.posix.join(pre, e.name)])).sort();
}
/** figures/SHIPPED.json for every folder under public/vendor/{jsxgraph,smiles-drawer,oomba-figures}/<version>/. */
export function lockText() {
  const libs = {};
  for (const lib of ['jsxgraph', 'smiles-drawer', 'oomba-figures']) {
    const base = path.join(ROOT, 'public/vendor', lib);
    if (!fs.existsSync(base)) continue;
    for (const v of fs.readdirSync(base).sort()) for (const f of filesIn(path.join(base, v))) {
      const b = fs.readFileSync(path.join(base, v, f));
      libs[`${lib}/${v}/${f}`] = { sha256: sha256(b), sri: sri(b) };
    }
  }
  return JSON.stringify({ _: 'Figure libraries that have shipped (docs/figures-api.md, docs/third-party.md). Their files never change bytes: saved games pin the script hashes (server/services/figlibs.js). scripts/build-figures.js writes this list; tests/unit/figures-vendor.test.js checks it against public/vendor.', files: libs }, null, 1) + '\n';
}

async function main() {
  const v = version(), dir = path.join(ROOT, 'public/vendor/oomba-figures', v), built = await files();
  const lockFile = path.join(ROOT, 'figures/SHIPPED.json');
  const lock = fs.existsSync(lockFile) ? JSON.parse(fs.readFileSync(lockFile, 'utf8')).files : {};
  const onDisk = fs.existsSync(dir) ? filesIn(dir) : [];
  const same = onDisk.join() === Object.keys(built).sort().join() && Object.entries(built).every(([k, b]) => fs.readFileSync(path.join(dir, k)).equals(b));
  if (process.argv.includes('--check')) { if (!same) { console.error(`oomba-figures ${v}: the files on disk differ from a fresh build`); process.exit(1); } console.log(`oomba-figures ${v}: up to date`); return; }
  if (lock[`oomba-figures/${v}/oomba-figures.js`] && !same) { console.error(`oomba-figures ${v} has shipped (figures/SHIPPED.json): its files may never change. Make a new version.`); process.exit(1); }
  fs.rmSync(dir, { recursive: true, force: true });
  for (const [k, b] of Object.entries(built)) { fs.mkdirSync(path.dirname(path.join(dir, k)), { recursive: true }); fs.writeFileSync(path.join(dir, k), b); }
  fs.writeFileSync(lockFile, lockText());
  for (const k of Object.keys(built).filter(f => f.endsWith('.js'))) console.log(`oomba-figures ${v} ${k}: ${(built[k].length / 1024).toFixed(1)} KB, ${sri(built[k])}`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
