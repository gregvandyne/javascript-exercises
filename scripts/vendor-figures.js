// Copy the figure libraries from their npm packages into public/vendor/<lib>/<version>/ (docs/third-party.md): the
// one file a game loads, the package's own LICENSE file, and manifest.json (name, version, licence, where it came
// from, sha256 and sha384 of every file). Then node scripts/build-figures.js writes figures/SHIPPED.json for all of
// them. A version folder never changes once shipped: a new version is a new folder.
//   npm pack jsxgraph@1.14.3 smiles-drawer@2.4.2   (in an empty temporary folder), untar each, then:
//   node scripts/vendor-figures.js <jsxgraph package folder> <smiles-drawer package folder>
// It refuses a package whose LICENSE file is not the licence we checked (MIT; JSXGraph is MIT OR LGPL-3.0-or-later and
// we use it under MIT), and never copies anything GPL.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sri, sha256 } from './build-figures.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LIBS = {
  jsxgraph: { file: 'distrib/jsxgraphcore.js', license: 'LICENSE.MIT', spdx: '(MIT OR LGPL-3.0-or-later)', used: 'MIT', mustSay: /Permission is hereby granted, free of charge/ },
  'smiles-drawer': { file: 'dist/smiles-drawer.min.js', license: 'LICENSE.md', spdx: 'MIT', used: 'MIT', mustSay: /MIT License[\s\S]*Permission is hereby granted, free of charge/ },
};
function copy(lib, dir) {
  const L = LIBS[lib], pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  if (pkg.name !== lib) throw new Error(`${dir} is ${pkg.name}, not ${lib}`);
  if (pkg.license !== L.spdx) throw new Error(`${lib}: package.json says ${pkg.license}, expected ${L.spdx}`);
  const lic = fs.readFileSync(path.join(dir, L.license), 'utf8');
  if (!L.mustSay.test(lic) || /GNU GENERAL PUBLIC LICENSE/.test(lic)) throw new Error(`${lib}: ${L.license} is not the MIT text we checked`);
  const out = path.join(ROOT, 'public/vendor', lib, pkg.version);
  fs.mkdirSync(out, { recursive: true });
  const files = { [path.basename(L.file)]: fs.readFileSync(path.join(dir, L.file)), LICENSE: Buffer.from(lic) };
  for (const [k, b] of Object.entries(files)) fs.writeFileSync(path.join(out, k), b);
  const manifest = { name: lib, version: pkg.version, license: L.spdx, usedUnder: L.used, source: `npm ${lib}@${pkg.version} (${L.file}, ${L.license})`, files: Object.fromEntries(Object.entries(files).map(([k, b]) => [k, { sha256: sha256(b), sri: sri(b) }])) };
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`${lib} ${pkg.version}: ${Object.keys(files).join(', ')}`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [jsx, sd] = process.argv.slice(2);
  if (!jsx || !sd) { console.error('usage: node scripts/vendor-figures.js <jsxgraph package> <smiles-drawer package>'); process.exit(1); }
  copy('jsxgraph', jsx); copy('smiles-drawer', sd);
}
