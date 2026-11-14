// Notes for games that use the 2D art packs (Oomba2D): names the game uses that the packs do not have. Like the style
// lint (stylelint.js) and the Kit 2 lint, it never changes the safety result: the notes ride along in report.lint as
// { level: 'warn', code, message } and go back to the Builder after each version, so an invented world, hero or
// sprite name is fixed before a player meets a game that quietly falls back to the old look. Only names written out
// as text are checked. The names come from the locked pack manifests (kit2/ART2D.json, pack.json).
// Pure function, linear patterns; games over LINT_MAX bytes are not linted.
import { ART2D_PACKS, art2dManifest, art2dPacksOf, usesArt2d } from './art2d.js';

const LINT_MAX = 300000;
const NAME = '([a-z][a-z0-9-]{1,40})';
const all = (src, re) => [...new Set([...src.matchAll(re)].map(m => m[1]))];
const list = a => a.slice(0, 40).join(', ');

/** The world and hero a game asks Oomba2D for (the templates' CONFIG lines, or Oomba2D.use({ world, hero })). */
export function art2dOf(html) {
  const s = String(html || ''); if (!/\bOomba2D\b/.test(s)) return null;
  const pick = re => (re.exec(s) || [])[1] || '';
  return { world: pick(/\bworld\s*:\s*['"]([a-z0-9-]{2,40})['"]/), hero: pick(/\bhero2d\s*:\s*['"]([a-z0-9-]{2,40})['"]/) || pick(/Oomba2D\s*\.\s*use\s*\(\s*\{[^}]*\bhero\s*:\s*['"]([a-z0-9-]{2,40})['"]/) };
}

/** -> [{ level: 'warn', code, message }] for a game that uses Oomba2D; [] for any other game. */
export function lintArt2d(html) {
  const src = String(html || '');
  if (src.length > LINT_MAX || !/\bOomba2D\b/.test(src) || !usesArt2d(src)) return [];
  const out = [], warn = (code, message) => { if (!out.some(o => o.message === message)) out.push({ level: 'warn', code, message }); };
  const loaded = art2dPacksOf(src), pick = art2dOf(src) || {};
  const worlds = Object.keys(ART2D_PACKS).filter(id => (art2dManifest(id) || {}).kind === 'world');
  const chars = {}; for (const id of ['heroes', 'animals']) { const m = art2dManifest(id); if (m) for (const n of Object.keys(m.sprites)) chars[n] = id; }
  if (pick.world) {
    if (!worlds.includes(pick.world)) warn('art2d_world', `There is no 2D world "${pick.world}". Worlds: ${list(worlds)}.`);
    else if (!loaded.some(p => p.id === pick.world)) warn('art2d_pack', `The game asks for the 2D world "${pick.world}" but does not load its pack: add its tag from the 2D ART RULES after the Oomba2D tag.`);
  }
  if (pick.hero) {
    if (!chars[pick.hero]) warn('art2d_hero', `There is no 2D hero or animal "${pick.hero}". Heroes and animals: ${list(Object.keys(chars))}.`);
    else if (!loaded.some(p => p.id === chars[pick.hero])) warn('art2d_pack', `The game asks for "${pick.hero}" but does not load the ${chars[pick.hero]} pack: add its tag from the 2D ART RULES.`);
  }
  // Sprite names: art.sprite('palm') must be one of the world's sprites, in the version the game loads.
  const w = pick.world && loaded.find(p => p.id === pick.world), m = w ? art2dManifest(w.id, w.version) : null;
  if (m) for (const n of all(src, new RegExp(`\\.sprite\\(\\s*['"]${NAME}['"]`, 'g'))) if (!m.sprites[n]) warn('art2d_sprite', `The 2D world ${m.id} has no sprite "${n}". Its sprites: ${list(Object.keys(m.sprites))}.`);
  return out;
}
