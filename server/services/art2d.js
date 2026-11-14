// 2D art packs (docs/kit2-themes-plan.md "2D versions"): the Kit 2 worlds, heroes and animals as pictures for games on
// the Oomba Kit. Everything lives under /vendor/art2d/: the Oomba2D helper (oomba2d/<version>/oomba2d.js) and one
// folder per pack version (<pack>/<version>/ with pack.js, pack.json and WebP pictures), locked by kit2/ART2D.json
// (a locked file never changes; new art is a new version). A game loads the helper and its packs with exactly the
// tags below (integrity + crossorigin), after the kit's tag; the pictures are then loaded by the helper as <img> from
// the pack's own folder. Pure module (no database): used by the scanner, the frame, the Builder and the tests.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ART2D_PATH = '/vendor/art2d/';
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ART2D_DIR = path.resolve(HERE, '../../public/vendor/art2d');
/** kit2/ART2D.json: { helper: { version: sri }, packs: { "<pack>/<version>": { file: sri } } }. */
export const ART2D_LOCK = (() => { try { return JSON.parse(fs.readFileSync(path.resolve(HERE, '../../kit2/ART2D.json'), 'utf8')); } catch { return { helper: {}, packs: {} }; } })();
const byVersion = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; };
export const OOMBA2D_VERSION = Object.keys(ART2D_LOCK.helper).sort(byVersion).pop() || '';
export const oomba2dSrc = (v = OOMBA2D_VERSION) => `${ART2D_PATH}oomba2d/${v}/oomba2d.js`;
/** Every locked pack -> its newest version: { 'pirate-cove': '1.0.0', heroes: '1.0.0', ... }. */
export const ART2D_PACKS = (() => { const out = {}; for (const key of Object.keys(ART2D_LOCK.packs)) { const [id, v] = key.split('/'); if (!out[id] || byVersion(out[id], v) < 0) out[id] = v; } return Object.freeze(out); })();
export const art2dPackSrc = (id, v = ART2D_PACKS[id]) => `${ART2D_PATH}${id}/${v}/pack.js`;
const tag = (src, sri) => `<script src="${src}" integrity="${sri}" crossorigin="anonymous"></script>`;
/** The one tag a game loads Oomba2D with (after the kit's tag). */
export const oomba2dTag = (v = OOMBA2D_VERSION) => { if (!ART2D_LOCK.helper[v]) throw new Error(`Unknown Oomba2D version: ${v}`); return tag(oomba2dSrc(v), ART2D_LOCK.helper[v]); };
/** The one tag a game loads a 2D art pack with (after the Oomba2D tag). */
export const art2dPackTag = (id, v = ART2D_PACKS[id]) => { const p = ART2D_LOCK.packs[`${id}/${v}`]; if (!p || !p['pack.js']) throw new Error(`Unknown 2D art pack: ${id} ${v}`); return tag(art2dPackSrc(id, v), p['pack.js']); };
/** A pack version's manifest (pack.json), or null. */
const manifests = new Map();
export function art2dManifest(id, v = ART2D_PACKS[id]) {
  const key = `${id}/${v}`; if (!ART2D_LOCK.packs[key]) return null;
  if (!manifests.has(key)) { try { manifests.set(key, JSON.parse(fs.readFileSync(path.join(ART2D_DIR, id, v, 'pack.json'), 'utf8'))); } catch { manifests.set(key, null); } }
  return manifests.get(key);
}
/** The packs a game loads with a pinned tag: [{ id, version }]. */
export function art2dPacksOf(html) {
  const out = [], re = /\/vendor\/art2d\/([a-z0-9-]+)\/(\d+\.\d+\.\d+)\/pack\.js/g; let m;
  while ((m = re.exec(String(html || '')))) if (m[1] !== 'oomba2d' && !out.some(p => p.id === m[1])) out.push({ id: m[1], version: m[2] });
  return out;
}
export const usesArt2d = html => String(html || '').includes(ART2D_PATH);

const TAG_RE = /<script\b([^>]*)>\s*<\/script\s*>/gi;
const attr = (attrs, name) => { const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs); return m ? (m[1] ?? m[2] ?? m[3]) : null; };
/**
 * Scanner rules -> { rest, issues }. Exactly the pinned tags pass (a locked helper or pack version with its own
 * integrity, crossorigin anonymous) and are taken out, like the kit's tag; any other mention of /vendor/art2d/ fails:
 * a game never names a picture file itself (the helper loads them from the pack's folder).
 */
export function checkArt2d(src) {
  src = String(src || '');
  const issues = [];
  const add = message => { if (!issues.some(i => i.message === message)) issues.push({ level: 'fail', code: 'art2d_pin', message }); };
  const MSG = 'Loads 2D art in a way we do not allow. Load Oomba2D and each art pack with exactly the tags from the 2D ART RULES.';
  let rest = src.replace(TAG_RE, (t, attrs) => {
    const s = attr(attrs, 'src');
    if (!s || !s.includes(ART2D_PATH)) return t;
    const m = /^\/vendor\/art2d\/([a-z0-9-]+)\/(\d+\.\d+\.\d+)\/(oomba2d|pack)\.js$/.exec(s);
    const want = !m ? null : m[1] === 'oomba2d' ? (m[3] === 'oomba2d' ? ART2D_LOCK.helper[m[2]] : null) : m[3] === 'pack' ? (ART2D_LOCK.packs[`${m[1]}/${m[2]}`] || {})['pack.js'] : null;
    if (!want || attr(attrs, 'integrity') !== want || attr(attrs, 'crossorigin') !== 'anonymous') add(MSG);
    return ' ';
  });
  if (rest.includes(ART2D_PATH)) { add(MSG); rest = rest.split(ART2D_PATH).join(' '); }
  return { rest, issues };
}
