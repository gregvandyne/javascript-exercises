// Build Oomba Figures (figures/src/*.js, ES modules the unit tests import directly) into one classic-script IIFE at
// public/vendor/oomba-figures/<version>/oomba-figures.js, with its LICENSE and manifest.json (sha256 and sha384 of every
// file). The same way as scripts/build-canvas.js: no minifier, the modules share one scope in dependency order, and a
// version that is in figures/SHIPPED.json may never change (saved games pin its hash): make a new version instead.
// The vendored libraries next to it (JSXGraph, SmilesDrawer) are copied from npm by scripts/vendor-figures.js; this
// script only (re)writes Oomba Figures and then the lock for all three.
//   node scripts/build-figures.js           build the version in figures/src/svg.js (FIG_VERSION) and lock it
//   node scripts/build-figures.js --check   rebuild in memory and fail if the files on disk differ
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = ['canvas/src/expr.js', 'figures/src/svg.js', 'figures/src/words.js', 'figures/src/physics.js', 'figures/src/graphs.js', 'figures/src/chem.js', 'figures/src/readings.js', 'figures/src/index.js'];
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
export const sri = buf => `sha384-${crypto.createHash('sha384').update(buf).digest('base64')}`;
export const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');
export function version() { const m = /export const FIG_VERSION = '(\d+\.\d+\.\d+)'/.exec(fs.readFileSync(path.join(ROOT, 'figures/src/svg.js'), 'utf8')); if (!m) throw new Error('no FIG_VERSION in figures/src/svg.js'); return m[1]; }

export function bundle() {
  const parts = SOURCES.map(rel => {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const body = src.split('\n').filter(l => !/^import\s.*from\s+'(\.\.?\/)+[\w./-]+\.js';\s*$/.test(l) && !/^export\s*\{[^}]*\}(\s*from\s*'[^']*')?;\s*$/.test(l))
      .map(l => l.replace(/^export\s+(?=(async\s+)?(function|class|const|let)\b)/, ''));
    for (const l of body) if (/^\s*(import|export)\b/.test(l)) throw new Error(`${rel}: unsupported module line: ${l}`);
    return `// ---- ${rel}\n${body.join('\n')}`;
  });
  return `/*! Oomba Figures ${version()} | (c) Oomba Academy | MIT | science, maths and graph figures as SVG: docs/figures-api.md */\n(function () {\n'use strict';\n${parts.join('\n')}\n})();\n`;
}
/** The version folder: { 'oomba-figures.js': Buffer, LICENSE, 'manifest.json' }. */
export function files() {
  const out = { 'oomba-figures.js': Buffer.from(bundle()), LICENSE: Buffer.from(LICENSE) };
  out['manifest.json'] = Buffer.from(JSON.stringify({ name: 'oomba-figures', version: version(), license: 'MIT', source: 'figures/src (this repository)', files: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, { sha256: sha256(v), sri: sri(v) }])) }, null, 2) + '\n');
  return out;
}
/** figures/SHIPPED.json for every folder under public/vendor/{jsxgraph,smiles-drawer,oomba-figures}/<version>/. */
export function lockText() {
  const libs = {};
  for (const lib of ['jsxgraph', 'smiles-drawer', 'oomba-figures']) {
    const base = path.join(ROOT, 'public/vendor', lib);
    if (!fs.existsSync(base)) continue;
    for (const v of fs.readdirSync(base).sort()) for (const f of fs.readdirSync(path.join(base, v)).sort()) {
      const b = fs.readFileSync(path.join(base, v, f));
      libs[`${lib}/${v}/${f}`] = { sha256: sha256(b), sri: sri(b) };
    }
  }
  return JSON.stringify({ _: 'Figure libraries that have shipped (docs/figures-api.md, docs/third-party.md). Their files never change bytes: saved games pin the script hashes (server/services/figlibs.js). scripts/build-figures.js writes this list; tests/unit/figures-vendor.test.js checks it against public/vendor.', files: libs }, null, 1) + '\n';
}

function main() {
  const v = version(), dir = path.join(ROOT, 'public/vendor/oomba-figures', v), built = files();
  const lockFile = path.join(ROOT, 'figures/SHIPPED.json');
  const lock = fs.existsSync(lockFile) ? JSON.parse(fs.readFileSync(lockFile, 'utf8')).files : {};
  const same = Object.entries(built).every(([k, b]) => { const f = path.join(dir, k); return fs.existsSync(f) && fs.readFileSync(f).equals(b); });
  if (process.argv.includes('--check')) { if (!same) { console.error(`oomba-figures ${v}: the files on disk differ from a fresh build`); process.exit(1); } console.log(`oomba-figures ${v}: up to date`); return; }
  if (lock[`oomba-figures/${v}/oomba-figures.js`] && !same) { console.error(`oomba-figures ${v} has shipped (figures/SHIPPED.json): its files may never change. Make a new version.`); process.exit(1); }
  fs.mkdirSync(dir, { recursive: true });
  for (const [k, b] of Object.entries(built)) fs.writeFileSync(path.join(dir, k), b);
  fs.writeFileSync(lockFile, lockText());
  console.log(`oomba-figures ${v}: ${(built['oomba-figures.js'].length / 1024).toFixed(1)} KB, ${sri(built['oomba-figures.js'])}`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
