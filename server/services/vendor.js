// The one Three.js build 3D games may use, self-hosted under public/vendor/three/<version>/ (copied from the npm
// package, with its LICENSE). Games load it with exactly the import map below (relative URLs + SRI for both files).
// Pure module (no database): used by the scanner, the frame, the screenshot worker and the Builder prompt.
// To bump the version, see docs/decisions.md ("3D games").

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const THREE_VERSION = '0.185.1';
export const VENDOR_PATH = '/vendor/three/';                  // every vendored version; the frame CSP allows this path
export const THREE_DIR = `${VENDOR_PATH}${THREE_VERSION}/`;
// Reviewed data packs for one game (e.g. its words in one language), under public/vendor/data/<game>/<version>/.
// A game loads only the pack it needs at run time (a script tag with integrity), so a big game can keep a
// per-language pack out of its own file and every player downloads only their language. Like every /vendor folder,
// a version folder never changes once published (served immutable): new content goes in a new version folder.
export const DATA_PATH = '/vendor/data/';
export const THREE_MODULE = `${THREE_DIR}three.module.min.js`;
export const THREE_CORE = `${THREE_DIR}three.core.min.js`;    // three.module.min.js imports it as ./three.core.min.js
// sha384 of the two files (tests/unit/vendor.test.js checks these against public/vendor).
export const THREE_SRI = {
  [THREE_MODULE]: 'sha384-QHQk1LzjJlJYNdthXjKCmffpDRZL3EqJ7LfqBzyKyvGgjAYM2ZVuYtFGg42NcAJ/',
  [THREE_CORE]: 'sha384-rx+KIp/9ptjArhnFAcpVoOc/ynktDsRtRJKIbC7YVKylEvFu8sgmzk9RmQ+CIV48',
};

/** The exact import map a 3D game must use (the Star Island template carries this same text). */
export const threeImportMap = () => `<script type="importmap">
{ "imports": { "three": "${THREE_MODULE}" },
  "integrity": {
    "${THREE_MODULE}": "${THREE_SRI[THREE_MODULE]}",
    "${THREE_CORE}": "${THREE_SRI[THREE_CORE]}" } }
</script>`;

const IMPORTMAP_RE = /<script\b[^>]*\btype\s*=\s*["']?importmap["']?[^>]*>([\s\S]*?)<\/script\s*>/gi;
const MODULE_RE = /<script\b[^>]*\btype\s*=\s*["']?module["']?[^>]*>([\s\S]*?)<\/script\s*>/gi;
// Only module scripts can import, so a quiz line like "from 'three' to 'ten'" in an ordinary script is not a 3D game.
const moduleCode = src => [...String(src).matchAll(MODULE_RE)].map(m => m[1].replace(/\/\*[\s\S]*?\*\//g, ' ')).join('\n');
const BARE_THREE = /\bfrom\s*["']three["']|\bimport\s*["']three["']/;
const THREE_ADDON = /\bfrom\s*["']three\/|\bimport\s*["']three\//;
// Three.js named in a URL on any host (cdnjs, unpkg, a CDN folder...).
const THREE_URL = /(?:https?:)?\/\/[^\s"'`<>]*\/three(?:\.js)?(?:@|\/|\.module|\.core|\.min|\.cjs)/i;

/** Does this game use the 3D library (an import map, a bare 'three' import, or the vendor path)? */
export function isThreeGame(html) {
  const s = String(html || '');
  return /<script\b[^>]*\btype\s*=\s*["']?importmap/i.test(s) || BARE_THREE.test(moduleCode(s)) || s.includes(VENDOR_PATH);
}

/** What the browser must support for this game, or null for an ordinary 2D game. */
/** A live game with a 2D path for devices without 3D (docs/kit-api.md "Live class games"). */
export const LIVE_2D_RE = /<meta\s+name\s*=\s*["']oomba-live["']\s+content\s*=\s*["']2d["']/i;
export function deviceNeeds(html) {
  if (!isThreeGame(html)) return null;
  // fallback '2d': the SDK runs the game's own 2D path instead of the "newer device" card (the game draws it).
  return LIVE_2D_RE.test(String(html || '')) ? { webgl2: true, importmap: true, fallback: '2d' } : { webgl2: true, importmap: true };
}

const isPinnedMap = m => {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return false;
  const keys = Object.keys(m).sort().join(',');
  if (keys !== 'imports,integrity') return false;
  const imp = m.imports, integ = m.integrity;
  if (!imp || typeof imp !== 'object' || Object.keys(imp).length !== 1 || imp.three !== THREE_MODULE) return false;
  if (!integ || typeof integ !== 'object' || Object.keys(integ).length !== 2) return false;
  return integ[THREE_MODULE] === THREE_SRI[THREE_MODULE] && integ[THREE_CORE] === THREE_SRI[THREE_CORE];
};

// ---------- Kit 2 (docs/kit2-themes-plan.md) ----------
// Engines under /vendor/kit2/ (Three.js add-ons, Rapier physics, Phaser 2D) and theme art under /vendor/themes/, every
// file pinned by kit2/SHIPPED.json (it never changes once shipped). A Kit 2 3D game uses exactly KIT2_IMPORT_MAP: the
// same Three.js as above plus "three/addons/", Rapier and Oomba3D, with integrity for every file, so no file can be
// swapped. Rapier and the meshopt decoder run WebAssembly: the frame allows it since 12 Nov 2026 (docs/safety.md).
export const KIT2_PATH = '/vendor/kit2/';
export const THEMES_PATH = '/vendor/themes/';
export const KIT2_ADDONS_DIR = `${KIT2_PATH}three-addons/${THREE_VERSION}/`;
// Oomba3D, the Kit 2 game library (docs/kit2-api.md): imported as 'oomba3d' through the Kit 2 import map.
export const OOMBA3D_VERSION = '1.1.0';
export const RAPIER_VERSION = '0.21.0';
export const RAPIER_MODULE = `${KIT2_PATH}rapier/${RAPIER_VERSION}/rapier.mjs`;
export const OOMBA3D_MODULE = `${KIT2_PATH}oomba3d/${OOMBA3D_VERSION}/oomba3d.js`;
export const PHASER_VERSION = '3.90.0';
export const PHASER_SCRIPT = `${KIT2_PATH}phaser/${PHASER_VERSION}/phaser.min.js`;
const KIT2_LOCK_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../kit2/SHIPPED.json');
/** kit2/SHIPPED.json: { engines: { "<path under /vendor/kit2/>": sri }, themes: { "<theme>/<version>": sri of theme.json } }. */
export const KIT2_LOCK = (() => { try { return JSON.parse(fs.readFileSync(KIT2_LOCK_FILE, 'utf8')); } catch { return { engines: {}, themes: {} }; } })();
const kit2Sri = url => KIT2_LOCK.engines[url.slice(KIT2_PATH.length)];
export const PHASER_SRI = kit2Sri(PHASER_SCRIPT);
/** The one import map a Kit 2 3D game may use (every add-on file, Rapier and Oomba3D listed with its integrity). */
export const KIT2_IMPORT_MAP = (() => {
  const integrity = { [THREE_MODULE]: THREE_SRI[THREE_MODULE], [THREE_CORE]: THREE_SRI[THREE_CORE] };
  const addons = KIT2_ADDONS_DIR.slice(KIT2_PATH.length);
  for (const [rel, sri] of Object.entries(KIT2_LOCK.engines)) if (rel.startsWith(addons) && rel.endsWith('.js')) integrity[KIT2_PATH + rel] = sri;
  for (const m of [OOMBA3D_MODULE, RAPIER_MODULE]) if (kit2Sri(m)) integrity[m] = kit2Sri(m);
  return { imports: { three: THREE_MODULE, 'three/addons/': KIT2_ADDONS_DIR, '@dimforge/rapier3d-compat': RAPIER_MODULE, oomba3d: OOMBA3D_MODULE }, integrity };
})();
export const kit2ImportMap = () => `<script type="importmap">\n${JSON.stringify(KIT2_IMPORT_MAP, null, 1)}\n</script>`;
/** The one tag a Kit 2 2D game loads Phaser with. */
export const phaserTag = () => `<script src="${PHASER_SCRIPT}" integrity="${PHASER_SRI}" crossorigin="anonymous"></script>`;
const sameKeys = (a, b) => a && b && typeof a === 'object' && !Array.isArray(a) && Object.keys(a).length === Object.keys(b).length && Object.keys(b).every(k => a[k] === b[k]);
const isKit2Map = m => !!m && typeof m === 'object' && Object.keys(m).sort().join(',') === 'imports,integrity' && sameKeys(m.imports, KIT2_IMPORT_MAP.imports) && sameKeys(m.integrity, KIT2_IMPORT_MAP.integrity);
const PHASER_TAG_RE = /<script\b([^>]*)>\s*<\/script\s*>/gi;
const attr = (attrs, name) => { const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs); return m ? (m[1] ?? m[2] ?? m[3]) : null; };
const THEME_REF_RE = /\/vendor\/themes\/([^\s"'`)<>]*)/g;

/**
 * Kit 2 rules -> { rest, issues }. The exact Phaser tag is taken out (like the Oomba Kit tag) so the scanner's
 * external-script rule does not see it; any other Kit 2 script tag fails. A theme path must name a shipped theme version.
 */
export function checkKit2(src) {
  src = String(src || '');
  const issues = [];
  const add = (code, message) => { if (!issues.some(i => i.message === message)) issues.push({ level: 'fail', code, message }); };
  const rest = src.replace(PHASER_TAG_RE, (tag, attrs) => {
    const s = attr(attrs, 'src');
    if (!s || !s.includes(KIT2_PATH)) return tag;
    if (s === PHASER_SCRIPT && attr(attrs, 'integrity') === PHASER_SRI && attr(attrs, 'crossorigin') === 'anonymous' && PHASER_SRI) return ' ';
    add('kit2_pin', `Loads a Kit 2 file in a way we do not allow. Load Phaser ${PHASER_VERSION} with exactly the tag from the Kit 2 rules.`);
    return ' ';
  });
  for (const m of rest.matchAll(THEME_REF_RE)) {
    const [theme, version] = m[1].split('/');
    if (!theme || !version || !KIT2_LOCK.themes[`${theme}/${version}`] || m[1].includes('..')) add('kit2_theme', `Uses theme art that does not exist (${('/vendor/themes/' + m[1]).slice(0, 70)}). Use a theme and version from the theme list.`);
  }
  // A game on Oomba3D names its world and version in words (start({ theme, version }), or the starter's CONFIG lines
  // world / version): a pair written out as text must be a shipped theme version, so a built game is pinned to art that
  // exists and never changes. (A name built in code cannot be read here; the frame can only reach /vendor/themes/.)
  if (/\bfrom\s*["']oomba3d["']/.test(rest)) {
    for (const m of rest.matchAll(/\b(?:theme|world)\s*:\s*(['"])([^'"\n]{1,60})\1\s*,\s*(?:\/\/[^\n]*\n\s*)?version\s*:\s*(['"])([^'"\n]{1,20})\3/g)) {
      if (!KIT2_LOCK.themes[`${m[2]}/${m[4]}`]) add('kit2_theme', `Names a world or version that has not shipped (${`${m[2]} ${m[4]}`.slice(0, 60)}). Use a world and its exact version from the KIT 2 RULES.`);
    }
  }
  return { rest, issues };
}

/**
 * Scanner rules for 3D games -> [{ level, code, message }]. Accepts exactly the pinned form: the import map above
 * (any whitespace or key order) and bare `import ... from 'three'`. Any other Three.js (another version, another host,
 * the vendor files without the map or without integrity, add-ons) fails, with a message the Builder can act on.
 */
export function checkThree(src) {
  src = String(src || '');
  const issues = [];
  const add = (code, message) => { if (!issues.some(i => i.message === message)) issues.push({ level: 'fail', code, message }); };
  const PIN = `Loads Three.js in a way we do not allow. Use the built-in Three.js ${THREE_VERSION} with the exact import map (and its integrity lines) from the 3D rules.`;
  let pinned = false, kit2 = false;
  let rest = src.replace(IMPORTMAP_RE, (block, body) => {
    let map = null;
    try { map = JSON.parse(body); } catch { add('three_pin', 'The import map is not valid. Use the exact import map from the 3D rules.'); return ' '; }
    if (isPinnedMap(map)) { pinned = true; return ' '; }
    if (isKit2Map(map)) { pinned = true; kit2 = true; return ' '; }
    // Not the pinned map: anything Three.js or vendor in it is refused; other entries are judged by the URL rules.
    if (body.includes(VENDOR_PATH) || body.includes(KIT2_PATH) || THREE_URL.test(body) || (map && map.imports && typeof map.imports === 'object' && 'three' in map.imports)) add('three_pin', PIN);
    return block;
  });
  if (rest.includes(VENDOR_PATH)) add('three_pin', PIN);
  if (rest.includes(KIT2_PATH)) add('kit2_pin', 'Loads a Kit 2 file in a way we do not allow. Use exactly the Kit 2 import map from the Kit 2 rules.');
  if (THREE_URL.test(rest)) add('three_pin', PIN);
  const mods = moduleCode(rest);
  if (THREE_ADDON.test(mods) && !kit2) add('three_pin', 'Uses a Three.js add-on (three/addons/...). Add-ons are not available here: build it with Three.js itself.');
  if (BARE_THREE.test(mods) && !pinned) add('three_pin', `Uses Three.js without the import map. Add the exact import map from the 3D rules.`);
  return issues;
}
