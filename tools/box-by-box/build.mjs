// Box by Box: builds tools/box-by-box (a Svelte app) into the single self-contained seed game seed-games/box-by-box.html.
//   cd tools/box-by-box && npm install && node build.mjs          write the game file
//   node build.mjs --check                                       exit 1 when the committed file is not what the sources build
// Vite (vite.config.js) bundles the app into one page; then this script
//   - puts the pinned Oomba Kit tag where index.html says <!--@@KIT@@--> (its sounds, effects and font),
//   - takes out web addresses the libraries carry in their messages (Svelte's error links, Tailwind's banner),
//   - checks the page carries none of the names it must not, and that the platform's safety scanner passes it.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
export const OUT = path.join(ROOT, 'seed-games', 'box-by-box.html');
const check = process.argv.includes('--check');

execFileSync(process.execPath, [path.join(HERE, 'node_modules/vite/bin/vite.js'), 'build', '--logLevel', 'warn'], { cwd: HERE, stdio: 'inherit' });
let html = fs.readFileSync(path.join(HERE, 'dist/index.html'), 'utf8');

const { kitTag } = await import(path.join(ROOT, 'server/services/kit.js'));
const must = (re, what) => { if (!re.test(html)) throw new Error(`build.mjs: ${what} not found (the bundle changed: update build.mjs)`); };

must(/<!--@@KIT@@-->/, 'the kit marker');
html = html.replace('<!--@@KIT@@-->', kitTag());
// Web addresses: Svelte's error links and Tailwind's banner (the license name stays)
html = html.replace(/https:\/\/svelte\.dev\/e\//g, 'svelte.dev/e/').replace(/ \| https:\/\/tailwindcss\.com/g, '');

const banner = `<!-- Box by Box. Built by tools/box-by-box/build.mjs from tools/box-by-box: do not edit by hand. -->\n`;
html = html.replace(/^<!doctype html>\n?/i, (m) => m + banner);

// What must never be in the page: an outside web address (SVG namespaces aside), or a name it must not carry (spelled
// by character code, so this file doesn't carry them either).
const urls = (html.match(/(?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}[^\s"'`)<>]*/gi) || []).filter((u) => !/^http:\/\/www\.w3\.org\//.test(u));
if (urls.length) throw new Error(`build.mjs: outside addresses left in the page: ${[...new Set(urls)].slice(0, 5).join(', ')}`);
const w = (...codes) => String.fromCharCode(...codes);
const KEPT_OUT = [
  new RegExp(w(100, 105, 103, 105, 116) + '[\\s._-]*' + w(100, 114, 105, 108, 108), 'i'),
  new RegExp(w(116, 101, 97, 99, 104, 101, 114) + '\\s*(?:\\.|dot)\\s*' + w(100, 101, 118), 'i'),
  new RegExp(w(109, 100, 112, 114, 97, 99, 116, 105, 99, 101), 'i'),
  new RegExp(w(109, 117, 108, 116, 105, 112, 108, 105, 99, 97, 116, 105, 111, 110) + '[\\s._-]*' + w(100, 105, 118, 105, 115, 105, 111, 110) + '[\\s._-]*' + w(112, 114, 97, 99, 116, 105, 99, 101), 'i'),
  new RegExp(w(109, 97, 116, 104, 102, 114, 111, 103), 'i'),
  new RegExp(w(67, 69, 77, 67)),
  new RegExp(w(119, 97, 116, 101, 114, 108, 111, 111), 'i'),
  new RegExp(w(115, 117, 112, 112, 111, 114, 116) + '@', 'i'),
  new RegExp(w(109, 97, 105, 108, 116, 111) + ':', 'i'),
];
const scanned = { page: html };
for (const f of walk(path.join(HERE, 'src')).concat(['build.mjs', 'index.html', 'package.json', 'vite.config.js', 'svelte.config.js'].map((f) => path.join(HERE, f))))
  scanned[path.relative(HERE, f)] = fs.readFileSync(f, 'utf8');
for (const [where, text] of Object.entries(scanned))
  for (const re of KEPT_OUT) {
    const m = text.match(new RegExp(`.{0,30}(?:${re.source}).{0,30}`, re.flags));
    if (m) throw new Error(`build.mjs: ${where} carries a name it must not: ${m[0]}`);
  }
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
}

const { scanVersion } = await import(path.join(ROOT, 'server/services/scanner.js'));
const scan = scanVersion(html);
if (scan.status !== 'pass') throw new Error(`build.mjs: the safety scan says ${scan.status}: ${JSON.stringify(scan.issues)}`);

if (check) {
  const now = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (now !== html) { console.error('seed-games/box-by-box.html is not what tools/box-by-box builds: run node tools/box-by-box/build.mjs'); process.exit(1); }
  console.log('seed-games/box-by-box.html is up to date');
} else {
  fs.writeFileSync(OUT, html);
  console.log(`wrote ${path.relative(ROOT, OUT)} (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB), scan: ${scan.status}`);
}
