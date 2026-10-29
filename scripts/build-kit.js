// Build the Oomba Kit: kit/src/*.js (ES modules, imported directly by the unit tests) -> one classic-script IIFE at
// public/vendor/oomba-kit/<version>/oomba-kit.js, plus the fonts, licences and manifest.json (sha384 of every file),
// and the version's SRI in server/services/kit.js (KIT_VERSIONS).
//   node scripts/build-kit.js            refuses to touch an existing version folder (they are immutable)
//   node scripts/build-kit.js --replace  rebuild the current version in place (refused once it is in kit/SHIPPED.json)
// Bundling: each module becomes a function scope returning its exports (names read by importing the module in Node),
// in dependency order. Minifying: esbuild when it is installed (a pinned devDependency, owner to confirm); otherwise
// a careful comment/indent stripper here. Size is measured as brotli (what /vendor serves).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'kit/src');
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
    return { code: r.code, tool: 'esbuild' };
  } catch (e) { return { code: strip(code), tool: 'strip' }; }
}
export const sri = buf => 'sha384-' + crypto.createHash('sha384').update(buf).digest('base64');
export const brotli = buf => zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
export const gzip = buf => zlib.gzipSync(buf, { level: 9 }).length;

async function main() {
  const replace = process.argv.includes('--replace');
  const { VERSION } = await import(pathToFileURL(path.join(SRC, 'index.js')).href);
  const dir = path.join(ROOT, 'public/vendor/oomba-kit', VERSION);
  const shipped = JSON.parse(fs.readFileSync(path.join(ROOT, 'kit/SHIPPED.json'), 'utf8')).versions || {};
  if (shipped[VERSION]) { console.error(`kit ${VERSION} has shipped (kit/SHIPPED.json): its files and hash can never change, because saved games pin them. Bump the patch version in kit/src/index.js and build that.`); process.exit(1); }
  if (fs.existsSync(dir) && !replace) { console.error(`public/vendor/oomba-kit/${VERSION}/ exists. Version folders are immutable: bump VERSION in kit/src/index.js (or --replace while it has not shipped).`); process.exit(1); }
  const { code, modules } = await bundle();
  const banner = `/*! Oomba Kit ${VERSION} (api 1) | (c) Oomba Academy | fonts: Bricolage Grotesque, SIL OFL 1.1 */\n`;
  const min = await minify(code);
  const out = Buffer.from(banner + min.code);
  fs.mkdirSync(path.join(dir, 'fonts'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'oomba-kit.js'), out);
  const F = path.join(ROOT, 'public/fonts');
  fs.copyFileSync(path.join(F, 'bricolage-grotesque-latin-opsz-normal.woff2'), path.join(dir, 'fonts/bricolage-latin.woff2'));
  fs.copyFileSync(path.join(F, 'bricolage-grotesque-latin-ext-opsz-normal.woff2'), path.join(dir, 'fonts/bricolage-latin-ext.woff2'));
  fs.copyFileSync(path.join(F, 'bricolage-grotesque-OFL.txt'), path.join(dir, 'fonts/OFL.txt'));
  fs.writeFileSync(path.join(dir, 'LICENSE'), `Oomba Kit ${VERSION}\nCopyright (c) Oomba Academy. All rights reserved.\nGames on Oomba Academy may load this file from this path. It may not be copied elsewhere.\n\nfonts/: Bricolage Grotesque, licensed under the SIL Open Font License 1.1 (fonts/OFL.txt).\n`);
  const files = {};
  for (const f of ['oomba-kit.js', 'fonts/bricolage-latin.woff2', 'fonts/bricolage-latin-ext.woff2', 'fonts/OFL.txt', 'LICENSE']) files[f] = sri(fs.readFileSync(path.join(dir, f)));
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ version: VERSION, api: 1, files }, null, 2) + '\n');
  // KIT_VERSIONS in server/services/kit.js: add this version, or update it with --replace.
  const svc = path.join(ROOT, 'server/services/kit.js');
  if (fs.existsSync(svc)) {
    let s = fs.readFileSync(svc, 'utf8');
    const line = `  '${VERSION}': '${files['oomba-kit.js']}',`;
    const re = new RegExp(`^  '${VERSION.replace(/\./g, '\\.')}': 'sha384-[^']+',$`, 'm');
    if (re.test(s)) s = s.replace(re, line); else s = s.replace(/(export const KIT_VERSIONS = Object\.freeze\(\{\n)/, `$1${line}\n`);
    fs.writeFileSync(svc, s);
  }
  console.log(`oomba-kit ${VERSION}: ${modules.length} modules, ${min.tool}; ${out.length} bytes, gzip ${gzip(out)}, brotli ${brotli(out)}; ${files['oomba-kit.js']}`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exit(1); });
