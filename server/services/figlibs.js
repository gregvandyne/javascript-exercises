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
/** lib -> the one file a page loads from each version folder. */
export const FIG_LIB_FILES = Object.freeze({ jsxgraph: 'jsxgraphcore.js', 'smiles-drawer': 'smiles-drawer.min.js', 'oomba-figures': 'oomba-figures.js' });
export const FIG_LIB_NAMES = Object.freeze({ jsxgraph: 'JSXGraph', 'smiles-drawer': 'SmilesDrawer', 'oomba-figures': 'Oomba Figures' });
export const FIG_LIB_PATHS = Object.freeze(Object.keys(FIG_LIB_FILES).map(l => `/vendor/${l}/`));
const LOCK_FILE = path.join(ROOT, 'figures/SHIPPED.json');
/** figures/SHIPPED.json: { files: { '<lib>/<version>/<file>': { sha256, sri } } }. */
export const FIG_LOCK = (() => { try { return JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8')); } catch { return { files: {} }; } })();
const cmpV = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; };
/** { lib: { version: sri } } for every locked script file. */
export const FIG_VERSIONS = (() => {
  const out = Object.fromEntries(Object.keys(FIG_LIB_FILES).map(l => [l, {}]));
  for (const [rel, h] of Object.entries(FIG_LOCK.files || {})) {
    const m = /^([a-z-]+)\/(\d+\.\d+\.\d+)\/([^/]+)$/.exec(rel);
    if (m && FIG_LIB_FILES[m[1]] === m[3]) out[m[1]][m[2]] = h.sri;
  }
  return out;
})();
/** The newest version of each library (what a new build gets). */
export const FIG_LATEST = Object.freeze(Object.fromEntries(Object.entries(FIG_VERSIONS).map(([l, vs]) => [l, Object.keys(vs).sort(cmpV).pop() || ''])));
export const figSrc = (lib, v = FIG_LATEST[lib]) => `/vendor/${lib}/${v}/${FIG_LIB_FILES[lib]}`;
/** Every pinned script URL (the CSP lists exactly these; the screenshot worker serves exactly these). */
export const FIG_SCRIPTS = Object.freeze(Object.entries(FIG_VERSIONS).flatMap(([l, vs]) => Object.keys(vs).map(v => figSrc(l, v))));
const SCRIPT_SET = new Set(FIG_SCRIPTS);

/** The one tag a game loads a figure library with. */
export function figTag(lib, v = FIG_LATEST[lib]) {
  const h = FIG_VERSIONS[lib] && FIG_VERSIONS[lib][v];
  if (!h) throw new Error(`unknown figure library ${lib} ${v}`);
  return `<script src="${figSrc(lib, v)}" integrity="${h}" crossorigin="anonymous"></script>`;
}
/** The three tags in the order a page needs them (the libraries before Oomba Figures, which uses them). */
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
const libOfSrc = src => FIG_LIB_PATHS.find(p => String(src || '').includes(p));

/** The figure libraries this page loads with a valid pinned tag: { 'oomba-figures': '1.0.0', ... }. */
export function figureLibs(html) {
  const out = {};
  for (const m of String(html || '').matchAll(SCRIPT_RE)) {
    const a = attrs(m[1]), p = PIN_RE.exec(a.src || '');
    if (p && SCRIPT_SET.has(a.src) && FIG_VERSIONS[p[1]][p[2]] === a.integrity && a.crossorigin === 'anonymous' && !m[2].trim()) out[p[1]] = p[2];
  }
  return out;
}
/** Does this page name a figure library at all (a pinned tag or a wrong one)? */
export const usesFigures = html => FIG_LIB_PATHS.some(p => String(html || '').includes(p)) || /\/vendor\/(jsxgraph|smiles-drawer|oomba-figures)\b/.test(String(html || ''));

/**
 * Scanner rule (scanner.js) -> { issues: [{ level, code, message }], rest }: rest is the page with each accepted tag
 * taken out (so the external-script check never sees it). Accepted: exactly figTag(lib, v) for a locked version
 * (attributes in any order and quoting, nothing else in the tag). Anything else that names a figure library's folder
 * fails, with a message the Builder can act on.
 */
export function checkFigures(src) {
  src = String(src || '');
  const issues = [];
  const add = (code, message) => { if (!issues.some(i => i.message === message)) issues.push({ level: 'fail', code, message }); };
  const rest = src.replace(SCRIPT_RE, (block, attrText, body) => {
    const a = attrs(attrText), base = libOfSrc(a.src);
    if (!base) return block;
    const lib = base.slice(8, -1), p = PIN_RE.exec(a.src), name = FIG_LIB_NAMES[lib];
    const extra = Object.keys(a).filter(k => !['src', 'integrity', 'crossorigin'].includes(k));
    if (!p || p[1] !== lib || !SCRIPT_SET.has(a.src)) { add('figures_pin', `Loads a ${name} file or version we do not have. Use exactly: ${figTag(lib)}`); return block; }
    if (a.integrity !== FIG_VERSIONS[lib][p[2]]) { add('figures_pin', `The ${name} tag has the wrong integrity value. Use exactly: ${figTag(lib, p[2])}`); return block; }
    if (a.crossorigin !== 'anonymous') { add('figures_pin', `The ${name} tag needs crossorigin="anonymous". Use exactly: ${figTag(lib, p[2])}`); return block; }
    if (extra.length || body.trim()) { add('figures_pin', `The ${name} tag must be exactly: ${figTag(lib, p[2])}`); return block; }
    return ' ';
  });
  for (const lib of Object.keys(FIG_LIB_FILES)) if (rest.includes(`/vendor/${lib}/`) || new RegExp(`/vendor/${lib}\\b`).test(rest)) add('figures_tag', `Uses the ${FIG_LIB_NAMES[lib]} files in a way we do not allow (only its script tag may name them). Load it with exactly: ${figTag(lib)}`);
  return { issues, rest };
}

/** A pinned file on disk for a request path, or null (exactly the locked script files: the screenshot worker). */
export function figureFile(pathname) {
  if (!SCRIPT_SET.has(pathname)) return null;
  const f = path.join(ROOT, 'public', pathname);
  return fs.existsSync(f) ? f : null;
}

const kits = new Map();
/** The pure parts of a pinned Oomba Figures version (svg, check, solve), from its own frozen file, run once in an empty
 *  context: no document, no network. */
export function figuresKit(v = FIG_LATEST['oomba-figures']) {
  if (!FIG_VERSIONS['oomba-figures'][v]) return null;
  if (!kits.has(v)) {
    const src = fs.readFileSync(path.join(ROOT, 'public/vendor/oomba-figures', v, 'oomba-figures.js'), 'utf8');
    const ctx = vm.createContext({});
    vm.runInContext(src, ctx, { timeout: 3000, filename: `oomba-figures-${v}.js` });
    kits.set(v, ctx.OombaFigures);
  }
  return kits.get(v);
}
