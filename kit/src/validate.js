// validate(kind, spec) -> {spec, warnings}: snaps anything a game (or the Builder) writes to valid values instead of
// failing. Unknown species -> nearest by edit distance (else 'oomba'); hex -> nearest palette hue; sizes clamped;
// level legends must use single characters.
import { PALETTE, HUES, ROLES, nearestHue } from './tokens.js';

export const SPECIES = ['oomba', 'kid', 'fox', 'bunny', 'frog', 'bee'];
export const MOODS = ['happy', 'sad', 'surprised', 'determined', 'thinking', 'sleepy', 'wink'];
export const BODIES = ['bean', 'ball', 'pear'];
export const HAIR_STYLES = ['puffs', 'bob', 'curls', 'spiky', 'braids', 'buzz', 'long', 'cap'];
export const TOPS = ['tee', 'hoodie', 'dress', 'overalls'];
export const WEAR = ['scarf', 'glasses', 'crown', 'wizard-hat', 'backpack', 'headphones'];
export const PARTS = ['move', 'player', 'patrol', 'follow', 'bob', 'fly', 'collectible', 'hazard', 'goal', 'checkpoint', 'spring', 'quizGate', 'talk', 'lantern', 'shadow', 'glow',
  'platform', 'door', 'key', 'solid', 'walk'];

export function editDistance(a, b) {
  a = String(a); b = String(b);
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = new Array(n + 1), cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    const t = prev; prev = cur; cur = t;
  }
  return prev[n];
}
/** The closest name in list within maxD edits, else fallback. */
export function nearest(name, list, fallback, maxD = 2) {
  const s = String(name || '').toLowerCase().trim();
  if (list.includes(s)) return s;
  let best = fallback, bd = Infinity;
  for (const x of list) { const d = editDistance(s, x); if (d < bd) { bd = d; best = x; } }
  return bd <= maxD ? best : fallback;
}
const clamp = (v, a, b, d) => { v = +v; return isFinite(v) ? Math.max(a, Math.min(b, v)) : d; };
/** A colour name/role/hex -> a hue name. */
export function hueOf(c, warnings, fallback = 'mint') {
  if (c == null) return fallback;
  const s = String(c).trim();
  if (PALETTE[s]) return s;
  if (ROLES[s]) return ROLES[s];
  if (/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s)) { const h = nearestHue(s.startsWith('#') ? s : '#' + s).hue; if (warnings) warnings.push(`colour ${s} snapped to "${h}"`); return h; }
  const n = nearest(s, HUES, fallback, 2); if (warnings) warnings.push(`unknown colour "${s}" -> "${n}"`); return n;
}

export function validate(kind, spec) {
  const w = [];
  const s = Object.assign({}, spec || {});
  if (kind === 'char') {
    const sp = nearest(s.species, SPECIES, 'oomba');
    if (sp !== s.species) w.push(`species "${s.species}" -> "${sp}"`);
    s.species = sp;
    s.body = BODIES.includes(s.body) ? s.body : 'bean';
    s.size = clamp(s.size, 0.6, 1.4, 1);
    const c = s.colors || {};
    s.colors = { base: hueOf(c.base, w, sp === 'fox' || sp === 'bee' ? 'peach' : 'mint'), belly: hueOf(c.belly, w, 'cream'), accent: hueOf(c.accent, w, 'spark') };
    s.skin = clamp(s.skin | 0, 0, 7, 0) | 0;
    if (s.hair) s.hair = { style: nearest(s.hair.style, HAIR_STYLES, 'bob'), color: s.hair.color || 'cocoa' };
    if (s.outfit) s.outfit = { top: nearest(s.outfit.top, TOPS, 'tee'), color: hueOf(s.outfit.color, w, 'sky') };
    s.mood = MOODS.includes(s.mood) ? s.mood : 'happy';
    s.wear = [].concat(s.wear || []).map(x => { const n = nearest(x, WEAR, null); if (!n) w.push(`unknown wear "${x}"`); return n; }).filter(Boolean);
    s.seed = isFinite(+s.seed) ? +s.seed | 0 : 1;
    return { spec: Object.freeze(s), warnings: w };
  }
  if (kind === 'legend') {
    const out = {};
    for (const k in s) { if ([...k].length !== 1) { w.push(`legend key "${k}" must be one character`); continue; } out[k] = s[k]; }
    return { spec: out, warnings: w };
  }
  if (kind === 'parts') {
    const list = [].concat(spec || []).filter(p => { const name = typeof p === 'string' ? p : p && Object.keys(p)[0]; if (!PARTS.includes(name)) { w.push(`unknown part "${name}"`); return false; } return true; });
    return { spec: list, warnings: w };
  }
  if (kind === 'game') {
    s.api = 1;
    s.size = Array.isArray(s.size) && s.size.length === 2 ? [clamp(s.size[0], 320, 3840, 960), clamp(s.size[1], 240, 2160, 540)] : [960, 540];
    s.fit = s.fit === 'letterbox' ? 'letterbox' : 'expand';
    // theme: 'light' | 'dark' | 'auto' (the light/dark mode, as in 1.0), or a named theme ('beach', {name, accent, palette}):
    // a theme is kept in s.look for the dress pack (kit.useTheme); mode then goes in s.mode
    const th = s.theme; if (th && !['light', 'dark', 'auto'].includes(th)) s.look = th;
    s.theme = ['light', 'dark'].includes(s.mode || th) ? s.mode || th : 'auto';
    s.backend = ['paper', 'glaze'].includes(s.backend) ? s.backend : 'auto';
    if (s.howTo && s.howTo.length > 3) { w.push('howTo has more than 3 cards; extra cards dropped'); s.howTo = s.howTo.slice(0, 3); }
    return { spec: s, warnings: w };
  }
  return { spec: s, warnings: w };
}
