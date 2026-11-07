// Jungle Cup build: concatenates tools/jungle-cup/src into the single self-contained seed-games/jungle-cup.html.
//   node tools/jungle-cup/build.mjs          write the game file
//   node tools/jungle-cup/build.mjs --check  exit 1 when the committed game file is not what the sources build
// Order (docs/jungle-cup-plan.md "How to build"):
//   src/shell.html up to the @@GAME@@ line (title, style, canvas)
//   the I18N block: `const I18N = {};` then every src/i18n/*.js (core.*.js first, then the rest by name)
//   one IIFE: src/core/*.js by name, then every src/sport-*.js by name, then src/boot.js
//   the rest of src/shell.html
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, 'src');
const ROOT = path.resolve(HERE, '../..');
export const OUT = path.join(ROOT, 'seed-games', 'jungle-cup.html');

const read = f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').replace(/\s+$/, '') + '\n';
const list = (dir, re) => fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => re.test(f)).sort() : [];

/** The source files in build order (paths relative to src/). */
export function sources() {
  const i18n = list(path.join(SRC, 'i18n'), /\.js$/).sort((a, b) => (b.startsWith('core.') - a.startsWith('core.')) || (a < b ? -1 : a > b ? 1 : 0));
  return {
    i18n: i18n.map(f => `i18n/${f}`),
    core: list(path.join(SRC, 'core'), /\.js$/).map(f => `core/${f}`),
    sports: list(SRC, /^sport-[a-z0-9-]+\.js$/),
    boot: ['boot.js'],
  };
}

export function build() {
  const shell = read(path.join(SRC, 'shell.html'));
  const at = shell.indexOf('/*@@GAME@@*/');
  if (at < 0) throw new Error('shell.html has no /*@@GAME@@*/ marker');
  const s = sources();
  const part = rel => `/* ---- ${rel} ---- */\n` + read(path.join(SRC, rel));
  const js = [
    '// ==== I18N START ====',
    'const I18N = {};',
    ...s.i18n.map(part),
    '// ==== I18N END ====',
    read(path.join(SRC, 'voices.js')),
    '(function () {',
    "'use strict';",
    ...s.core.map(part),
    ...s.sports.map(part),
    ...s.boot.map(part),
    '})();',
  ].join('\n');
  return shell.slice(0, at) + js + shell.slice(at + '/*@@GAME@@*/'.length);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const html = build();
  if (process.argv.includes('--check')) {
    const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (cur !== html) { console.error('seed-games/jungle-cup.html is out of date: run npm run build:jungle'); process.exit(1); }
    console.log('seed-games/jungle-cup.html is up to date');
  } else {
    fs.writeFileSync(OUT, html);
    console.log(`wrote ${path.relative(ROOT, OUT)} (${Math.round(Buffer.byteLength(html) / 1024)} KB)`);
  }
}
