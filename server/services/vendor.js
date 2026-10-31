// The one Three.js build 3D games may use, self-hosted under public/vendor/three/<version>/ (copied from the npm
// package, with its LICENSE). Games load it with exactly the import map below (relative URLs + SRI for both files).
// Pure module (no database): used by the scanner, the frame, the screenshot worker and the Builder prompt.
// To bump the version, see docs/decisions.md ("3D games").

export const THREE_VERSION = '0.185.1';
export const VENDOR_PATH = '/vendor/three/';                  // every vendored version; the frame CSP allows this path
export const THREE_DIR = `${VENDOR_PATH}${THREE_VERSION}/`;
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
  let pinned = false;
  let rest = src.replace(IMPORTMAP_RE, (block, body) => {
    let map = null;
    try { map = JSON.parse(body); } catch { add('three_pin', 'The import map is not valid. Use the exact import map from the 3D rules.'); return ' '; }
    if (isPinnedMap(map)) { pinned = true; return ' '; }
    // Not the pinned map: anything Three.js or vendor in it is refused; other entries are judged by the URL rules.
    if (body.includes(VENDOR_PATH) || THREE_URL.test(body) || (map && map.imports && typeof map.imports === 'object' && 'three' in map.imports)) add('three_pin', PIN);
    return block;
  });
  if (rest.includes(VENDOR_PATH)) add('three_pin', PIN);
  if (THREE_URL.test(rest)) add('three_pin', PIN);
  const mods = moduleCode(rest);
  if (THREE_ADDON.test(mods)) add('three_pin', 'Uses a Three.js add-on (three/addons/...). Add-ons are not available here: build it with Three.js itself.');
  if (BARE_THREE.test(mods) && !pinned) add('three_pin', `Uses Three.js without the import map. Add the exact import map from the 3D rules.`);
  return issues;
}
