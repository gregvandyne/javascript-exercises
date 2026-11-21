// The figure libraries (docs/figures-api.md, docs/third-party.md): JSXGraph (MIT, of its MIT OR LGPL-3.0-or-later),
// SmilesDrawer (MIT) and our own Oomba Figures (MIT), self-hosted under public/vendor/<lib>/<version>/ and locked in
// figures/SHIPPED.json (sha256 and sha384 of every file; a shipped file never changes). A game loads one with exactly
// the tag figTag() makes: the pinned file, its SRI hash, crossorigin="anonymous", nothing else. The same way as the
// Oomba Kit and Oomba Canvas: the scanner admits exactly those tags (checkFigures), the frame's CSP names exactly those
// files (frame.js), and the screenshot worker serves exactly those files (snapshot.js). Anything else that names one of
// these folders fails the scan.
// Also here: the pure parts of a pinned Oomba Figures file, run on the server with no document (the printable
// worksheet's figures and the classroom activity's figure checks), from its own frozen file.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
/** lib -> the one file a page loads from each version folder. Oomba Figures from 1.1.0 also has its subject packs
 *  (FIG_LIB_FILES.packs: lib -> { pack: file }), each a script of its own loaded after the core file, with its own pinned
 *  tag. (packs is not enumerable, so Object.keys(FIG_LIB_FILES) stays the three libraries.) */
export const FIG_PACK_NAMES = Object.freeze(['math', 'data', 'physics', 'chem', 'bio', 'measure']);
export const FIG_LIB_FILES = Object.freeze(Object.defineProperty({ jsxgraph: 'jsxgraphcore.js', 'smiles-drawer': 'smiles-drawer.min.js', 'oomba-figures': 'oomba-figures.js' }, 'packs', {
  value: Object.freeze({ 'oomba-figures': Object.freeze(Object.fromEntries(FIG_PACK_NAMES.map(p => [p, `packs/${p}.js`]))) }), enumerable: false }));
export const FIG_LIB_NAMES = Object.freeze({ jsxgraph: 'JSXGraph', 'smiles-drawer': 'SmilesDrawer', 'oomba-figures': 'Oomba Figures' });
export const FIG_LIB_PATHS = Object.freeze(Object.keys(FIG_LIB_FILES).map(l => `/vendor/${l}/`));
const LOCK_FILE = path.join(ROOT, 'figures/SHIPPED.json');
/** figures/SHIPPED.json: { files: { '<lib>/<version>/<file>': { sha256, sri } } }. */
export const FIG_LOCK = (() => { try { return JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8')); } catch { return { files: {} }; } })();
const cmpV = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; };
/** { lib: { version: sri } } for every locked script file (the core file of each library). */
export const FIG_VERSIONS = (() => {
  const out = Object.fromEntries(Object.keys(FIG_LIB_FILES).map(l => [l, {}]));
  for (const [rel, h] of Object.entries(FIG_LOCK.files || {})) {
    const m = /^([a-z-]+)\/(\d+\.\d+\.\d+)\/([^/]+)$/.exec(rel);
    if (m && FIG_LIB_FILES[m[1]] === m[3]) out[m[1]][m[2]] = h.sri;
  }
  return out;
})();
/** { version: { pack: sri } }: Oomba Figures' locked packs (none for 1.0.0, which is one file). */
export const FIG_PACKS = (() => {
  const out = {};
  for (const [rel, h] of Object.entries(FIG_LOCK.files || {})) {
    const m = /^oomba-figures\/(\d+\.\d+\.\d+)\/packs\/([a-z]+)\.js$/.exec(rel);
    if (m && FIG_PACK_NAMES.includes(m[2]) && FIG_VERSIONS['oomba-figures'][m[1]]) (out[m[1]] = out[m[1]] || {})[m[2]] = h.sri;
  }
  for (const v of Object.keys(out)) out[v] = Object.fromEntries(FIG_PACK_NAMES.filter(p => out[v][p]).map(p => [p, out[v][p]]));
  return out;
})();
/** { version: { kind: pack } } from each version's manifest ('core' for the core's own kinds). */
export const FIG_KIND_PACKS = (() => {
  const out = {};
  for (const v of Object.keys(FIG_PACKS)) {
    try {
      const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/vendor/oomba-figures', v, 'manifest.json'), 'utf8'));
      out[v] = Object.fromEntries([...(m.core ? m.core.kinds : []).map(k => [k, 'core']), ...Object.entries(m.packs || {}).flatMap(([p, x]) => x.kinds.map(k => [k, p]))]);
    } catch { out[v] = {}; }
  }
  return out;
})();
/** The newest version of each library (what a new build gets). */
export const FIG_LATEST = Object.freeze(Object.fromEntries(Object.entries(FIG_VERSIONS).map(([l, vs]) => [l, Object.keys(vs).sort(cmpV).pop() || ''])));
export const figSrc = (lib, v = FIG_LATEST[lib]) => `/vendor/${lib}/${v}/${FIG_LIB_FILES[lib]}`;
export const figPackSrc = (pack, v = FIG_LATEST['oomba-figures']) => `/vendor/oomba-figures/${v}/${FIG_LIB_FILES.packs['oomba-figures'][pack]}`;
/** Every pinned script URL -> its SRI (the CSP lists exactly these; the screenshot worker serves exactly these). */
const FIG_SRI = Object.freeze(Object.fromEntries([
  ...Object.entries(FIG_VERSIONS).flatMap(([l, vs]) => Object.entries(vs).map(([v, h]) => [figSrc(l, v), h])),
  ...Object.entries(FIG_PACKS).flatMap(([v, ps]) => Object.entries(ps).map(([p, h]) => [figPackSrc(p, v), h])),
]));
export const FIG_SCRIPTS = Object.freeze(Object.keys(FIG_SRI));
const SCRIPT_SET = new Set(FIG_SCRIPTS);
/** The packs a page needs for these kinds (in the order their tags go), at Oomba Figures v; unknown kinds need none. */
export function figPacksFor(kinds, v = FIG_LATEST['oomba-figures']) {
  const map = FIG_KIND_PACKS[v] || {}, need = new Set((kinds || []).map(k => map[k]).filter(p => p && p !== 'core'));
  return FIG_PACK_NAMES.filter(p => need.has(p));
}

const tagOf = (src, h) => `<script src="${src}" integrity="${h}" crossorigin="anonymous"></script>`;
/** One pack's tag (after the core's). */
export function figPackTag(pack, v = FIG_LATEST['oomba-figures']) {
  const h = FIG_PACKS[v] && FIG_PACKS[v][pack];
  if (!h) throw new Error(`unknown Oomba Figures pack ${pack} ${v}`);
  return tagOf(figPackSrc(pack, v), h);
}
/**
 * The tag(s) a game loads a figure library with. Oomba Figures from 1.1.0 is its core tag followed by its pack tags:
 * opts.kinds (the kinds the page draws) adds exactly the packs those need, opts.packs names them, and with neither every
 * pack is added. Each tag is the pinned file, its SRI hash and crossorigin="anonymous", nothing else.
 */
export function figTag(lib, v = FIG_LATEST[lib], opts = {}) {
  const h = FIG_VERSIONS[lib] && FIG_VERSIONS[lib][v];
  if (!h) throw new Error(`unknown figure library ${lib} ${v}`);
  const core = tagOf(figSrc(lib, v), h);
  if (lib !== 'oomba-figures' || !FIG_PACKS[v]) return core;
  const packs = Array.isArray(opts.kinds) ? figPacksFor(opts.kinds, v) : Array.isArray(opts.packs) ? FIG_PACK_NAMES.filter(p => opts.packs.includes(p)) : Object.keys(FIG_PACKS[v]);
  return [core, ...packs.map(p => figPackTag(p, v))].join('\n');
}
/** The tags in the order a page needs them (the libraries before Oomba Figures, which uses them; its packs after it). */
export const figTags = () => ['jsxgraph', 'smiles-drawer', 'oomba-figures'].map(l => figTag(l)).join('\n');

const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const ATTR_RE = /([a-z-]+)\s*(?:=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/gi;
function attrs(s) {
  const out = {}; let m;
  ATTR_RE.lastIndex = 0;
  while ((m = ATTR_RE.exec(s))) out[m[1].toLowerCase()] = m[2] == null ? '' : m[2].replace(/^["']|["']$/g, '');
  return out;
}
const PIN_RE = /^\/vendor\/([a-z-]+)\/(\d+\.\d+\.\d+)\/([a-z0-9.-]+)$/;
const PACK_RE = /^\/vendor\/oomba-figures\/(\d+\.\d+\.\d+)\/packs\/([a-z]+)\.js$/;
const libOfSrc = src => FIG_LIB_PATHS.find(p => String(src || '').includes(p));

/** The figure libraries this page loads with a valid pinned tag: { 'oomba-figures': '1.0.0', ... } (core files only). */
export function figureLibs(html) {
  const out = {};
  for (const m of String(html || '').matchAll(SCRIPT_RE)) {
    const a = attrs(m[1]), p = PIN_RE.exec(a.src || '');
    if (p && SCRIPT_SET.has(a.src) && FIG_SRI[a.src] === a.integrity && a.crossorigin === 'anonymous' && !m[2].trim()) out[p[1]] = p[2];
  }
  return out;
}
/** The Oomba Figures packs this page loads with a valid pinned tag after the core tag of the same version: ['math', ...]. */
export function figurePacks(html) {
  const out = []; let core = '';
  for (const m of String(html || '').matchAll(SCRIPT_RE)) {
    const a = attrs(m[1]), ok = SCRIPT_SET.has(a.src) && FIG_SRI[a.src] === a.integrity && a.crossorigin === 'anonymous' && !m[2].trim();
    if (!ok) continue;
    const p = PIN_RE.exec(a.src), k = PACK_RE.exec(a.src);
    if (p && p[1] === 'oomba-figures') core = p[2];
    else if (k && core === k[1] && !out.includes(k[2])) out.push(k[2]);
  }
  return FIG_PACK_NAMES.filter(p => out.includes(p));
}
/** Does this page name a figure library at all (a pinned tag or a wrong one)? */
export const usesFigures = html => FIG_LIB_PATHS.some(p => String(html || '').includes(p)) || /\/vendor\/(jsxgraph|smiles-drawer|oomba-figures)\b/.test(String(html || ''));

/**
 * Scanner rule (scanner.js) -> { issues: [{ level, code, message }], rest }: rest is the page with each accepted tag
 * taken out (so the external-script check never sees it). Accepted: exactly figTag(lib, v) for a locked version
 * (attributes in any order and quoting, nothing else in the tag), and an Oomba Figures pack's pinned tag placed after
 * the core tag of its version (once each). Anything else that names a figure library's folder fails, with a message the
 * Builder can act on.
 */
export function checkFigures(src) {
  src = String(src || '');
  const issues = [];
  const add = (code, message) => { if (!issues.some(i => i.message === message)) issues.push({ level: 'fail', code, message }); };
  let core = '';
  const packs = new Set();
  const rest = src.replace(SCRIPT_RE, (block, attrText, body) => {
    const a = attrs(attrText), base = libOfSrc(a.src);
    if (!base) return block;
    const lib = base.slice(8, -1), name = FIG_LIB_NAMES[lib], k = lib === 'oomba-figures' ? PACK_RE.exec(a.src || '') : null;
    const extra = Object.keys(a).filter(x => !['src', 'integrity', 'crossorigin'].includes(x));
    if (k) {
      const pv = k[1], pk = k[2], ok = FIG_PACKS[pv] && FIG_PACKS[pv][pk];
      const want = ok ? figPackTag(pk, pv) : FIG_PACKS[FIG_LATEST[lib]] && FIG_PACKS[FIG_LATEST[lib]][pk] ? figPackTag(pk) : `one of the pack tags in the FIGURE RULES (${Object.keys(FIG_PACKS[FIG_LATEST[lib]] || {}).join(', ')})`;
      if (!ok || !SCRIPT_SET.has(a.src)) { add('figures_pin', `Loads an Oomba Figures pack or version we do not have. Use exactly: ${want}`); return block; }
      if (a.integrity !== FIG_SRI[a.src]) { add('figures_pin', `The Oomba Figures ${pk} pack tag has the wrong integrity value. Use exactly: ${want}`); return block; }
      if (a.crossorigin !== 'anonymous') { add('figures_pin', `The Oomba Figures ${pk} pack tag needs crossorigin="anonymous". Use exactly: ${want}`); return block; }
      if (extra.length || body.trim()) { add('figures_pin', `The Oomba Figures ${pk} pack tag must be exactly: ${want}`); return block; }
      if (core !== pv) { add('figures_pack', `The Oomba Figures ${pk} pack tag must come after the Oomba Figures ${pv} tag (${figTag(lib, pv, { packs: [] })}), never before it or without it.`); return block; }
      if (packs.has(pk)) { add('figures_pack', `The Oomba Figures ${pk} pack is loaded twice: keep one tag.`); return block; }
      packs.add(pk);
      return ' ';
    }
    const p = PIN_RE.exec(a.src || ''), one = v => figTag(lib, v, { packs: [] });
    if (!p || p[1] !== lib || !SCRIPT_SET.has(a.src)) { add('figures_pin', `Loads a ${name} file or version we do not have. Use exactly: ${one(FIG_LATEST[lib])}`); return block; }
    if (a.integrity !== FIG_SRI[a.src]) { add('figures_pin', `The ${name} tag has the wrong integrity value. Use exactly: ${one(p[2])}`); return block; }
    if (a.crossorigin !== 'anonymous') { add('figures_pin', `The ${name} tag needs crossorigin="anonymous". Use exactly: ${one(p[2])}`); return block; }
    if (extra.length || body.trim()) { add('figures_pin', `The ${name} tag must be exactly: ${one(p[2])}`); return block; }
    if (lib === 'oomba-figures') { if (core) { add('figures_pack', 'Oomba Figures is loaded twice: keep one tag.'); return block; } core = p[2]; }
    return ' ';
  });
  for (const lib of Object.keys(FIG_LIB_FILES)) if (rest.includes(`/vendor/${lib}/`) || new RegExp(`/vendor/${lib}\\b`).test(rest)) add('figures_tag', `Uses the ${FIG_LIB_NAMES[lib]} files in a way we do not allow (only its script tags may name them). Load it with exactly: ${figTag(lib)}`);
  return { issues, rest };
}

/** The figure kinds a page names in its own code or data: OF.draw/svg/check("kind", ...), OF.kind(...), and "kind":
 *  "x" (a classroom activity's figure questions). A kind chosen at run time from a variable is not seen. */
export function figureKindsIn(html, v = FIG_LATEST['oomba-figures']) {
  const map = FIG_KIND_PACKS[v] || {}, s = String(html || ''), out = new Set();
  for (const m of s.matchAll(/\b(?:OF|OombaFigures)\s*\.\s*(?:draw|svg|check)\s*\(\s*["'`]([A-Za-z]+)["'`]/g)) out.add(m[1]);
  for (const m of s.matchAll(/\b(?:OF|OombaFigures)\s*\.\s*([A-Za-z]+)\s*\(/g)) if (map[m[1]]) out.add(m[1]);
  for (const m of s.matchAll(/["']?\bkind["']?\s*:\s*["']([A-Za-z]+)["']/g)) if (map[m[1]]) out.add(m[1]);
  return [...out].filter(k => map[k]);
}
/** The packs a page needs for these kinds (or the kinds it names) but does not load: [{ pack, kinds, tag }]. */
export function missingFigurePacks(html, kinds = null) {
  const v = figureLibs(html)['oomba-figures'];
  if (!v || !FIG_PACKS[v]) return [];
  const have = figurePacks(html), list = kinds || figureKindsIn(html, v), map = FIG_KIND_PACKS[v] || {};
  return figPacksFor(list, v).filter(p => !have.includes(p)).map(p => ({ pack: p, kinds: [...new Set(list.filter(k => map[k] === p))], tag: figPackTag(p, v) }));
}

/** A pinned file on disk for a request path, or null (exactly the locked script files: the screenshot worker). */
export function figureFile(pathname) {
  if (!SCRIPT_SET.has(pathname)) return null;
  const f = path.join(ROOT, 'public', pathname);
  return fs.existsSync(f) ? f : null;
}

const kits = new Map();
/** The pure parts of a pinned Oomba Figures version (svg, check, solve), from its own frozen files (the core and every
 *  pack it has), run once in an empty context: no document, no network. */
export function figuresKit(v = FIG_LATEST['oomba-figures']) {
  if (!FIG_VERSIONS['oomba-figures'][v]) return null;
  if (!kits.has(v)) {
    const ctx = vm.createContext({});
    const dir = path.join(ROOT, 'public/vendor/oomba-figures', v);
    vm.runInContext(fs.readFileSync(path.join(dir, 'oomba-figures.js'), 'utf8'), ctx, { timeout: 3000, filename: `oomba-figures-${v}.js` });
    for (const p of Object.keys(FIG_PACKS[v] || {})) vm.runInContext(fs.readFileSync(path.join(dir, 'packs', `${p}.js`), 'utf8'), ctx, { timeout: 3000, filename: `oomba-figures-${v}-${p}.js` });
    kits.set(v, ctx.OombaFigures);
  }
  return kits.get(v);
}
