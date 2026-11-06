// Lesson parameters for a game (CS Quest P1 / P2; docs/sdk.md "Lesson parameters"). A lesson step can say which
// chapter of a game to open, for which band, in which mode, at which level, and whether the game is locked to that:
//   URL (teacher-readable):  /play/<slug>?chapter=<id>&band=<1b|2>&mode=<id>&level=<n>&lock=<0|1>
//   step column:             lesson_steps.options holds the same query string (routes/progress.js appends it to Play)
//   signed frame token:      o = "<chapter>.<band>.<mode>.<level>.<lock>" (empty parts allowed, at most 40 characters)
//   in the game:             BRB.params = Object.freeze({ chapter, band, mode, level, lock }) ({} when absent)
// Only these five keys exist; values are [a-z0-9-]{1,16}; band is 1b or 2; level 1-30; lock 0 or 1. Unknown keys and bad
// values are dropped on the way in (a game must never see anything else), so the frame gets exactly what the grammar allows.
// One alias: topic=<id> is another name for chapter=<id> (Would You Rather's topics, e.g. topic=online&lock=1); it arrives
// in the game as BRB.params.chapter. When both are given, chapter wins.
export const KEYS = Object.freeze(['chapter', 'band', 'mode', 'level', 'lock']);
/** Other names a step may use for a key (written the readable way in course files), folded into the key on the way in. */
export const ALIASES = Object.freeze({ topic: 'chapter' });
const unalias = src => {
  const o = { ...src };
  for (const [a, k] of Object.entries(ALIASES)) { if (o[k] === undefined && o[a] !== undefined) o[k] = o[a]; delete o[a]; }
  return o;
};
export const VALUE = /^[a-z0-9-]{1,16}$/;
export const BANDS = Object.freeze(['1b', '2']);
export const MAX_LEVEL = 30;
/** The packed token field's longest form: 16 + 1 + 2 + 1 + 16 + 1 + 2 + 1 + 1 = 41 would not fit; 40 is the cap. */
export const MAX_PACKED = 40;

const str = v => (Array.isArray(v) ? v[0] : v);
/** One key's clean value (a string for chapter/band/mode, a number for level/lock), or undefined when it is not valid. */
export function cleanValue(key, raw) {
  if (raw === undefined || raw === null) return undefined;
  const s = String(str(raw)).trim().toLowerCase();
  if (!VALUE.test(s)) return undefined;
  if (key === 'band') return BANDS.includes(s) ? s : undefined;
  if (key === 'level') { const n = /^\d{1,2}$/.test(s) ? +s : NaN; return Number.isInteger(n) && n >= 1 && n <= MAX_LEVEL ? n : undefined; }
  if (key === 'lock') return s === '0' || s === '1' ? +s : undefined;
  if (key === 'chapter' || key === 'mode') return s;
  return undefined;
}
/** From a query object (req.query) or a URLSearchParams / query string: the clean, allow-listed params ({} when none). */
export function parseParams(query) {
  const src = unalias(typeof query === 'string' || query instanceof URLSearchParams ? Object.fromEntries(new URLSearchParams(query)) : (query || {}));
  const out = {};
  for (const k of KEYS) { const v = cleanValue(k, src[k]); if (v !== undefined) out[k] = v; }
  return out;
}
/** Are these params worth carrying (at least one key)? */
export const hasParams = p => !!p && KEYS.some(k => p[k] !== undefined);
/** The token field: "chapter.band.mode.level.lock" with empty parts, or '' when there is nothing to carry. Two 16-character
 *  ids with everything else make 41: then mode is left out, and the rest always fits (chapter, band, level and lock are
 *  at most 16 + 1 + 2 + 1 + 1 + 2 + 1 + 1 = 25 characters). */
export function packParams(p) {
  const c = parseParams(p || {});
  if (!hasParams(c)) return '';
  const pack = o => KEYS.map(k => (o[k] === undefined ? '' : String(o[k]))).join('.');
  const s = pack(c);
  return s.length <= MAX_PACKED ? s : pack({ ...c, mode: undefined });
}
/** The token field back to params; anything malformed gives {} (never throws). */
export function unpackParams(o) {
  if (typeof o !== 'string' || !o || o.length > MAX_PACKED || !/^[a-z0-9.-]*$/.test(o)) return {};
  const parts = o.split('.');
  if (parts.length !== KEYS.length) return {};
  const q = {}; KEYS.forEach((k, i) => { if (parts[i]) q[k] = parts[i]; });
  return parseParams(q);
}
/** The canonical query string for a step's options column ("chapter=loops&band=1b&lock=1"; '' when empty). */
export function toQuery(p) {
  const c = parseParams(p || {});
  return KEYS.filter(k => c[k] !== undefined).map(k => `${k}=${c[k]}`).join('&');
}
/**
 * A step's options as typed or generated ("chapter=loops&band=1b&lock=1", a leading '?' allowed): the canonical string,
 * or null when a key is not one of the five or a value is not valid (the step is refused, so a catalogue mistake shows up).
 * Empty input -> ''.
 */
export function cleanOptions(text) {
  const s = String(text == null ? '' : text).trim().replace(/^\?/, '');
  if (!s) return '';
  if (s.length > 200) return null;
  const sp = new URLSearchParams(s);
  for (const [k, v] of sp) { const key = ALIASES[k] || k; if (!KEYS.includes(key) || cleanValue(key, v) === undefined) return null; }
  return toQuery(Object.fromEntries(sp));
}
