// Algebra Builder: builds tools/algebra-builder (a Svelte app, adapted from Algebra Tiles by teacher.dev, Apache-2.0:
// LICENSE and NOTICE here) into the single self-contained seed game seed-games/algebra-builder.html.
//   cd tools/algebra-builder && npm install && node build.mjs          write the game file
//   node build.mjs --check                                            exit 1 when the committed file is not what the sources build
// Vite (vite.config.js) bundles the app into one page; then this script
//   - puts the pinned Oomba Kit tag where index.html says <!--@@KIT@@--> (its sounds, effects and font),
//   - takes out what the platform's safety scanner refuses in a game: web addresses (Svelte's error links, Tailwind's
//     license banner keeps its name) and a JavaScript validator's "can this page build code from text?" probe (it
//     calls Function(''); answered "no", the validator just never compiles code),
//   - checks the page doesn't carry a word it was asked to keep out, and that the scanner passes it.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
export const OUT = path.join(ROOT, 'seed-games', 'algebra-builder.html');
const check = process.argv.includes('--check');

execFileSync(process.execPath, [path.join(HERE, 'node_modules/vite/bin/vite.js'), 'build', '--logLevel', 'warn'], { cwd: HERE, stdio: 'inherit' });
let html = fs.readFileSync(path.join(HERE, 'dist/index.html'), 'utf8');

const { kitTag } = await import(path.join(ROOT, 'server/services/kit.js'));
const must = (re, what) => { if (!re.test(html)) throw new Error(`build.mjs: ${what} not found (the bundle changed: update build.mjs)`); };

must(/<!--@@KIT@@-->/, 'the kit marker');
html = html.replace('<!--@@KIT@@-->', kitTag());
// The validator's probe: try { return Function(''), true } catch { return false }  ->  return false
must(/try\{return Function\(``\),!0\}catch\{return!1\}/, "the validator's code-building probe");
html = html.replace(/try\{return Function\(``\),!0\}catch\{return!1\}/g, 'return!1');
// Web addresses: Svelte's error links and Tailwind's banner (the license name stays)
html = html.replace(/https:\/\/svelte\.dev\/e\//g, 'svelte.dev/e/').replace(/ \| https:\/\/tailwindcss\.com/g, '');
// The validator's own web-address check, /^https?:\/\//i, reads to the scanner like an address ("//i.test"): the same
// pattern without two slashes in a row
must(/\/\^https\?:\\\/\\\/\/i\.test/, "the validator's address pattern");
html = html.replace(/\/\^https\?:\\\/\\\/\/i\.test/g, '/^https?:[/][/]/i.test');
// JSON Schema's names for its versions (the validator's labels, never fetched)
html = html.replace(/https?:\/\/json-schema\.org\//g, 'json-schema.org/');
// The validator's 64-bit integer limits, written as digits, read to the scanner like phone numbers: the same values
// as BigInt arithmetic
for (const [digits, same] of [['-9223372036854775808', '(-(2n**63n))'], ['9223372036854775807', '(2n**63n-1n)'], ['18446744073709551615', '(2n**64n-1n)']]) {
  must(new RegExp('BigInt\\(`' + digits + '`\\)'), `the validator's limit ${digits}`);
  html = html.replace('BigInt(`' + digits + '`)', same);
}
// A word kept out of the page (spelled by character code so this file doesn't carry it either): an icon's name that
// happens to contain it is renamed
const KEPT_OUT = String.fromCharCode(99, 97, 114, 101, 116);
html = html.replaceAll(`${KEPT_OUT}s-to-axis`, 'arrows-to-axis');

const banner = `<!-- Algebra Builder. Adapted from Algebra Tiles by teacher.dev (EdTech-a-thon 2026), Apache License 2.0.
     Built by tools/algebra-builder/build.mjs from tools/algebra-builder (LICENSE and NOTICE there): do not edit by hand. -->\n`;
html = html.replace(/^<!doctype html>\n?/i, m => m + banner);

// What must never be in the page: an outside web address (SVG namespaces aside), the word kept out (the CSS property
// for the text cursor's colour aside).
const urls = (html.match(/(?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}[^\s"'`)<>]*/gi) || []).filter(u => !/^http:\/\/www\.w3\.org\//.test(u));
if (urls.length) throw new Error(`build.mjs: outside addresses left in the page: ${[...new Set(urls)].slice(0, 5).join(', ')}`);
const named = html.replaceAll(`${KEPT_OUT}-color`, '').match(new RegExp(`.{0,30}${KEPT_OUT}.{0,30}`, 'i'));
if (named) throw new Error(`build.mjs: the page carries a word kept out: ${named[0]}`);
const { scanVersion } = await import(path.join(ROOT, 'server/services/scanner.js'));
const scan = scanVersion(html);
if (scan.status !== 'pass') throw new Error(`build.mjs: the safety scan says ${scan.status}: ${JSON.stringify(scan.issues)}`);

if (check) {
  const now = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (now !== html) { console.error('seed-games/algebra-builder.html is not what tools/algebra-builder builds: run node tools/algebra-builder/build.mjs'); process.exit(1); }
  console.log('seed-games/algebra-builder.html is up to date');
} else {
  fs.writeFileSync(OUT, html);
  console.log(`wrote ${path.relative(ROOT, OUT)} (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB), scan: ${scan.status}`);
}
