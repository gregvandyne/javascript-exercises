// Build the Oomba Kit: kit/src/*.js (ES modules, imported directly by the unit tests) -> one classic-script IIFE at
// public/vendor/oomba-kit/<version>/oomba-kit.js (the core), each art pack kit/packs/<name>.js -> packs/<name>.js (its
// own classic script, loaded only by the games that use it), plus the fonts, licences and manifest.json (sha384 of
// every file), and the SRIs in server/services/kit.js (KIT_VERSIONS, KIT_PACKS). Sizes are reported as brotli; the
// caps (SIZE_CAPS) are enforced by tests/unit/kit-platform.test.js.
//   node scripts/build-kit.js            refuses to touch an existing version folder (they are immutable)
//   node scripts/build-kit.js --replace  rebuild the current version in place (refused once it is in kit/SHIPPED.json)
//   node scripts/build-kit.js --packs    add or rebuild the packs that kit/SHIPPED.json does not lock, in a version whose
//                                        core is locked: the core and every locked pack stay byte for byte (checked)
// Bundling: each module becomes a function scope returning its exports (names read by importing the module in Node),
// in dependency order. Minifying: esbuild (a pinned, build-only devDependency); without it (production installs skip
// devDependencies) a careful comment/indent stripper here. Size is measured as brotli (what /vendor serves).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'kit/src');
const PACKS_DIR = path.join(ROOT, 'kit/packs');
/** Brotli caps in bytes: the core (spec: 95 KB) and each pack. */
export const SIZE_CAPS = { core: 95 * 1024, 'art-animals': 12 * 1024, 'art-school': 12 * 1024, 'art-biomes': 8 * 1024, 'art-biomes-2': 10 * 1024, 'art-props': 10 * 1024, dress: 10 * 1024, 'style-bold': 10 * 1024, 'bridge-3d': 14 * 1024, live: 10 * 1024 };
const IMPORT_RE = /^import\s*\{([^}]*)\}\s*from\s*'\.\/([\w-]+)\.js';\s*$/;

export async function bundle() {
  const order = [], seen = new Set(), mods = {};
  const visit = name => {
    if (seen.has(name)) return; seen.add(name);
    const file = path.join(SRC, name + '.js');
    const src = fs.readFileSync(file, 'utf8');
    const deps = [];
    const body = src.split('\n').map(line => {
      const m = IMPORT_RE.exec(line);
      if (!m) { if (/^\s*import\b/.test(line)) throw new Error(`${name}.js: unsupported import: ${line}`); return line.replace(/^export\s+(?=(async\s+)?(function|class|const|let)\b)/, ''); }
      deps.push(m[2]);
      const names = m[1].split(',').map(s => s.trim()).filter(Boolean).map(s => s.replace(/\s+as\s+/, ': '));
      return `const { ${names.join(', ')} } = __m_${m[2].replace(/-/g, '_')};`;
    }).join('\n');
    if (/^\s*export\b/m.test(body)) throw new Error(`${name}.js: unsupported export form`);
    deps.forEach(visit);
    mods[name] = { body, deps };
    order.push(name);
  };
  visit('index');
  const parts = [];
  for (const name of order) {
    const ns = await import(pathToFileURL(path.join(SRC, name + '.js')).href);
    const ex = Object.keys(ns).filter(k => k !== 'default');
    parts.push(`const __m_${name.replace(/-/g, '_')} = (function () {\n${mods[name].body}\nreturn { ${ex.join(', ')} };\n})();`);
  }
  return { code: `(function () {\n'use strict';\n${parts.join('\n')}\n})();\n`, modules: order };
}

/** A pack source (kit/packs/<name>.js: `export const PACK` + `export function define(K)`, no imports) -> its classic
 *  script: it hands define() to the kit's registration hook with the kit version it was built for. */
export function bundlePack(name, version) {
  const src = fs.readFileSync(path.join(PACKS_DIR, name + '.js'), 'utf8');
  if (/^\s*import\b/m.test(src)) throw new Error(`packs/${name}.js: packs take everything from define(K), never imports`);
  const body = src.replace(/^export\s+(?=(const|function)\b)/gm, '');
  if (/^\s*export\b/m.test(body)) throw new Error(`packs/${name}.js: unsupported export form`);
  return `(function () {\n'use strict';\nvar O = window.Oomba;\nif (!O || !O.__pk) { if (window.console) window.console.error('[oomba] ${name}: load the Oomba Kit tag before this pack'); return; }\n${body}\nO.__pk({ name: PACK.name, version: '${version}' }, define);\n})();\n`;
}
/** The minifier leaves template literals alone, so the notes inside the kit's CSS strings (`/* a note *\/` followed by
 *  a CSS rule, selector or the end of the string) would ship. Drop them: lowercase prose comments only. */
export const cssComments = code => code.replace(/\/\* [a-z][^*`]*?\*\/(\n?)(?=[.@:\w`\n])/g, '');
export const packNames = () => fs.readdirSync(PACKS_DIR).filter(f => f.endsWith('.js')).map(f => f.slice(0, -3)).sort();

/** Strip comments and indentation without touching strings, template literals or regex literals. */
export function strip(src) {
  let out = '', i = 0, last = '';   // last significant char, to tell a regex from a division
  const n = src.length;
  const REGEX_PREV = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^']);
  const kwBefore = () => /(?:^|[^\w$])(return|typeof|case|do|else|in|of|void|yield|await)\s*$/.test(out.slice(-12));
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') {
      const end = src.indexOf('*/', i + 2); const keep = src[i + 2] === '!';
      if (keep) out += src.slice(i, end + 2);
      i = end + 2; continue;
    }
    if (c === '"' || c === "'") { let j = i + 1; while (j < n && src[j] !== c) { if (src[j] === '\\') j++; j++; } out += src.slice(i, j + 1); i = j + 1; last = c; continue; }
    if (c === '`') {
      let j = i + 1, depth = 0;
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue; }
        if (depth === 0 && src[j] === '`') break;
        if (src[j] === '$' && src[j + 1] === '{') { depth++; j += 2; continue; }
        if (depth > 0 && src[j] === '}') { depth--; j++; continue; }
        j++;
      }
      out += src.slice(i, j + 1); i = j + 1; last = '`'; continue;
    }
    if (c === '/' && (REGEX_PREV.has(last) || kwBefore())) {
      let j = i + 1, cls = false;
      while (j < n) { const x = src[j]; if (x === '\\') { j += 2; continue; } if (x === '[') cls = true; else if (x === ']') cls = false; else if (x === '/' && !cls) break; else if (x === '\n') break; j++; }
      j++; while (j < n && /[a-z]/i.test(src[j])) j++;
      out += src.slice(i, j); i = j; last = '/'; continue;
    }
    if (c === '\n') {
      out = out.replace(/[ \t]+$/, '');
      if (!out.endsWith('\n')) out += '\n';
      i++; while (i < n && (src[i] === ' ' || src[i] === '\t')) i++;
      continue;
    }
    out += c; if (!/\s/.test(c)) last = c; i++;
  }
  return out.replace(/\n{2,}/g, '\n').trim() + '\n';
}

export async function minify(code) {
  try {
    const esbuild = await import('esbuild');
    const r = await esbuild.transform(code, { minify: true, target: 'es2019', legalComments: 'inline' });
    return { code: minifyGlsl(r.code), tool: 'esbuild' };
  } catch (e) { return { code: minifyGlsl(strip(code)), tool: 'strip' }; }
}
/** Shader sources (template literals holding GLSL, with no interpolation) lose their comments and spaces: GLSL needs a
 *  newline only after a preprocessor line (#version, #define, precision stays on a line of its own too). */
export function minifyGlsl(code) {
  const one = src => {
    const lines = src.replace(/\/\/[^\n]*/g, '').split('\n').map(l => l.trim()).filter(Boolean);
    let out = '', buf = '';
    const flush = () => { if (buf) out += buf.replace(/\s+/g, ' ').replace(/ ?([{}()\[\];,=+\-*\/<>!&|?:]) ?/g, '$1').trim(); buf = ''; };
    for (const l of lines) { if (/^(#|precision )/.test(l)) { flush(); out += (out && !out.endsWith('\n') ? '\n' : '') + l + '\n'; } else buf += ' ' + l; }
    flush();
    return (src.startsWith('\n') ? '\n' : '') + out;
  };
  // the shader literals start with "#version", "uniform" or a newline then "uniform"; none holds ${...}
  let out = '', i = 0;
  for (;;) {
    const m = /`(?=#version 300 es|\n?uniform )/g; m.lastIndex = i; const r = m.exec(code); if (!r) break;
    const end = code.indexOf('`', r.index + 1), src = code.slice(r.index + 1, end);
    out += code.slice(i, r.index + 1) + (src.includes('${') ? src : one(src)) + '`'; i = end + 1;
  }
  return out + code.slice(i);
}
export const sri = buf => 'sha384-' + crypto.createHash('sha384').update(buf).digest('base64');
export const brotli = buf => zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
export const gzip = buf => zlib.gzipSync(buf, { level: 9 }).length;

/** Write manifest.json (sha384 of every file) and KIT_VERSIONS / KIT_PACKS in server/services/kit.js for a version. */
function writeIndex(dir, VERSION) {
  const files = {};
  for (const f of ['oomba-kit.js', ...packNames().map(n => `packs/${n}.js`), 'fonts/bricolage-latin.woff2', 'fonts/bricolage-latin-ext.woff2', 'fonts/OFL.txt', 'LICENSE']) files[f] = sri(fs.readFileSync(path.join(dir, f)));
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ version: VERSION, api: 1, files, packs: packNames() }, null, 2) + '\n');
  // KIT_VERSIONS and KIT_PACKS in server/services/kit.js: add this version, or update it with --replace.
  const svc = path.join(ROOT, 'server/services/kit.js');
  if (fs.existsSync(svc)) {
    let s = fs.readFileSync(svc, 'utf8');
    const v = VERSION.replace(/\./g, '\\.');
    const line = `  '${VERSION}': '${files['oomba-kit.js']}',`;
    const re = new RegExp(`^  '${v}': 'sha384-[^']+',$`, 'm');
    if (re.test(s)) s = s.replace(re, line); else s = s.replace(/(export const KIT_VERSIONS = Object\.freeze\(\{\n)/, `$1${line}\n`);
    const pl = `  '${VERSION}': Object.freeze({ ${packNames().map(n => `'${n}': '${files['packs/' + n + '.js']}'`).join(', ')} }),`;
    const pre = new RegExp(`^  '${v}': Object\\.freeze\\(\\{[^\\n]*\\}\\),$`, 'm');
    if (pre.test(s)) s = s.replace(pre, pl); else s = s.replace(/(export const KIT_PACKS = Object\.freeze\(\{\n)/, `$1${pl}\n`);
    fs.writeFileSync(svc, s);
  }
}
async function buildPack(name, VERSION) {
  const p = await minify(bundlePack(name, VERSION));
  return Buffer.from(`/*! Oomba Kit ${VERSION} pack ${name} | (c) Oomba Academy */\n` + p.code);
}
const report = rows => { for (const [name, buf] of rows) { const br = brotli(buf), cap = SIZE_CAPS[name]; console.log(`  ${name.padEnd(12)} ${String(buf.length).padStart(7)} B  gzip ${String(gzip(buf)).padStart(6)}  brotli ${String(br).padStart(6)} (${(br / 1024).toFixed(1)} KB${cap ? `, cap ${(cap / 1024).toFixed(0)} KB${br > cap ? ' OVER' : ''}` : ''})`); } };

async function main() {
  const replace = process.argv.includes('--replace'), addPacks = process.argv.includes('--packs');
  const { VERSION } = await import(pathToFileURL(path.join(SRC, 'index.js')).href);
  const dir = path.join(ROOT, 'public/vendor/oomba-kit', VERSION);
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'kit/SHIPPED.json'), 'utf8')), shipped = lock.versions || {};
  if (addPacks) {
    // A locked version gains packs it did not ship with; nothing it shipped changes (the core and the locked packs are
    // checked byte for byte against the lock, never rewritten).
    if (!fs.existsSync(dir)) { console.error(`public/vendor/oomba-kit/${VERSION}/ does not exist: build the version first.`); process.exit(1); }
    const locked = (lock.packs || {})[VERSION] || {};
    if (shipped[VERSION] && sri(fs.readFileSync(path.join(dir, 'oomba-kit.js'))) !== shipped[VERSION]) { console.error(`kit ${VERSION}: oomba-kit.js does not match its lock`); process.exit(1); }
    const rows = [];
    for (const name of packNames()) {
      const file = path.join(dir, 'packs', name + '.js');
      if (locked[name]) {
        if (!fs.existsSync(file) || sri(fs.readFileSync(file)) !== locked[name]) { console.error(`kit ${VERSION} pack ${name} does not match its lock (kit/SHIPPED.json)`); process.exit(1); }
        continue;
      }
      const buf = await buildPack(name, VERSION); fs.writeFileSync(file, buf); rows.push([name, buf]);
    }
    for (const n of Object.keys(locked)) if (!packNames().includes(n)) { console.error(`kit ${VERSION} shipped pack ${n}, which kit/packs no longer has`); process.exit(1); }
    writeIndex(dir, VERSION);
    console.log(`oomba-kit ${VERSION}: packs added or rebuilt (the core and ${Object.keys(locked).length} locked packs untouched)`);
    report(rows);
    return;
  }
  if (shipped[VERSION]) { console.error(`kit ${VERSION} has shipped (kit/SHIPPED.json): its files and hash can never change, because saved games pin them. Bump the patch version in kit/src/index.js and build that (a new pack alone: --packs).`); process.exit(1); }
  if (fs.existsSync(dir) && !replace) { console.error(`public/vendor/oomba-kit/${VERSION}/ exists. Version folders are immutable: bump VERSION in kit/src/index.js (or --replace while it has not shipped).`); process.exit(1); }
  const { code, modules } = await bundle();
  const banner = `/*! Oomba Kit ${VERSION} (api 1) | (c) Oomba Academy | fonts: Bricolage Grotesque, SIL OFL 1.1 */\n`;
  const min = await minify(code);
  const out = Buffer.from(banner + cssComments(min.code));
  fs.mkdirSync(path.join(dir, 'fonts'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'oomba-kit.js'), out);
  const F = path.join(ROOT, 'public/fonts');
  fs.copyFileSync(path.join(F, 'bricolage-grotesque-latin-opsz-normal.woff2'), path.join(dir, 'fonts/bricolage-latin.woff2'));
  fs.copyFileSync(path.join(F, 'bricolage-grotesque-latin-ext-opsz-normal.woff2'), path.join(dir, 'fonts/bricolage-latin-ext.woff2'));
  fs.copyFileSync(path.join(F, 'bricolage-grotesque-OFL.txt'), path.join(dir, 'fonts/OFL.txt'));
  fs.writeFileSync(path.join(dir, 'LICENSE'), `Oomba Kit ${VERSION}\nCopyright (c) Oomba Academy. All rights reserved.\nGames on Oomba Academy may load this file from this path. It may not be copied elsewhere.\n\nfonts/: Bricolage Grotesque, licensed under the SIL Open Font License 1.1 (fonts/OFL.txt).\n`);
  // the art packs
  const rows = [['core', out]];
  fs.rmSync(path.join(dir, 'packs'), { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'packs'), { recursive: true });
  for (const name of packNames()) { const buf = await buildPack(name, VERSION); fs.writeFileSync(path.join(dir, 'packs', name + '.js'), buf); rows.push([name, buf]); }
  writeIndex(dir, VERSION);
  console.log(`oomba-kit ${VERSION}: ${modules.length} modules, ${min.tool}`);
  report(rows);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exit(1); });
