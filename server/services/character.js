// The player's own Oomba character (the "shared avatar"): designed once on the Me page, then the hero of any kit game
// that asks for the player (Oomba.avatar() / Oomba.me() / hero: 'me', 2D and 3D). It is a small parts spec: only names
// from the kit's own lists and small numbers, never a picture, a photo, free text or a name. Stored as JSON in
// users.character_spec (migration 0035) and given to games as BRB.user.character. Guests have none: the kit draws them
// the mascot. Pure module apart from the two database calls at the bottom. See docs/kit.md §6.4.
import { SPECIES, BODIES, HAIR_STYLES, TOPS, WEAR, MOODS } from '../../kit/src/validate.js';
import { HAIR } from '../../kit/src/tokens.js';
import { q } from '../db.js';

/** What the editor offers (each list is a subset of the kit's own names, so every spec draws on kit 1.1.0). */
export const CHARACTER = Object.freeze({
  species: SPECIES.filter(s => ['kid', 'oomba', 'fox', 'bunny', 'frog', 'bee'].includes(s)),
  body: [...BODIES],
  skin: 8,
  hair: [...HAIR_STYLES],
  hairColor: Object.keys(HAIR),
  eyes: MOODS.filter(m => m !== 'sad'),
  top: [...TOPS],
  // Spark yellow is for rewards only (never a creature or clothes); ink and cream are lines and cards.
  color: ['mint', 'coral', 'sky', 'grape', 'peach', 'cocoa', 'stone', 'snow'],
  accessory: [...WEAR],
  // The Bold style (12-14, the style-bold pack): head and body wear shown only when a game runs in Bold.
  boldHat: ['hood', 'visor', 'headset', 'helmet', 'cap-back'],
  boldTop: ['jersey', 'bomber', 'techvest'],
});
export const MAX_JSON = 600;

export class CharacterError extends Error { constructor(field) { super(`bad character field: ${field}`); this.field = field; } }

const pick = (v, list, field, optional = false) => {
  if (optional && (v == null || v === '')) return undefined;
  if (typeof v !== 'string' || !list.includes(v)) throw new CharacterError(field);
  return v;
};

/** The editor's starting point (also what a reset goes back to in the editor; the account itself then has none). */
export const DEFAULT_CHARACTER = Object.freeze({ species: 'kid', body: 'bean', skin: 2, hair: { style: 'curls', color: 'cocoa' }, mood: 'happy', outfit: { top: 'hoodie', color: 'sky' }, colors: { base: 'mint', accent: 'coral' }, wear: [], bold: { wear: ['headset', 'bomber'] } });

/**
 * input (from the editor) -> a clean spec with exactly the kit's field names, or throws CharacterError naming the field.
 * Unknown keys are dropped; every value must be one of CHARACTER's names (nothing is snapped: the editor only sends those).
 */
export function cleanCharacter(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new CharacterError('spec');
  const o = input, out = {};
  out.species = pick(o.species, CHARACTER.species, 'species');
  out.body = pick(o.body == null ? 'bean' : o.body, CHARACTER.body, 'body');
  out.mood = pick(o.mood == null ? 'happy' : o.mood, CHARACTER.eyes, 'mood');
  const c = o.colors && typeof o.colors === 'object' ? o.colors : {};
  out.colors = { base: pick(c.base == null ? 'mint' : c.base, CHARACTER.color, 'colors.base'), accent: pick(c.accent == null ? 'coral' : c.accent, CHARACTER.color, 'colors.accent') };
  if (out.species === 'kid') {
    const skin = o.skin == null ? 2 : o.skin;
    if (!Number.isInteger(skin) || skin < 0 || skin >= CHARACTER.skin) throw new CharacterError('skin');
    out.skin = skin;
    const h = o.hair && typeof o.hair === 'object' ? o.hair : {};
    out.hair = { style: pick(h.style == null ? 'curls' : h.style, CHARACTER.hair, 'hair.style'), color: pick(h.color == null ? 'cocoa' : h.color, CHARACTER.hairColor, 'hair.color') };
    const t = o.outfit && typeof o.outfit === 'object' ? o.outfit : {};
    out.outfit = { top: pick(t.top == null ? 'tee' : t.top, CHARACTER.top, 'outfit.top'), color: pick(t.color == null ? 'sky' : t.color, CHARACTER.color, 'outfit.color') };
  }
  const wear = o.wear == null ? [] : o.wear;
  if (!Array.isArray(wear) || wear.length > 1) throw new CharacterError('wear');
  out.wear = wear.map(w => pick(w, CHARACTER.accessory, 'wear'));
  const b = o.bold == null ? {} : o.bold;
  if (typeof b !== 'object' || Array.isArray(b)) throw new CharacterError('bold');
  const bw = b.wear == null ? [] : b.wear;
  if (!Array.isArray(bw) || bw.length > 2) throw new CharacterError('bold.wear');
  const hats = bw.filter(w => CHARACTER.boldHat.includes(w)), tops = bw.filter(w => CHARACTER.boldTop.includes(w));
  if (hats.length > 1 || tops.length > 1 || hats.length + tops.length !== bw.length) throw new CharacterError('bold.wear');
  out.bold = { wear: [...hats, ...tops] };
  const bm = pick(b.mood, CHARACTER.eyes, 'bold.mood', true);
  if (bm) out.bold.mood = bm;
  if (JSON.stringify(out).length > MAX_JSON) throw new CharacterError('spec');
  return out;
}

/** The stored spec of a user row (parsed and re-checked: a bad row reads as none), or null. Guests have none. */
export function characterOf(u) {
  if (!u || u.is_guest || !u.character_spec) return null;
  try { return cleanCharacter(JSON.parse(u.character_spec)); } catch { return null; }
}
export function saveCharacter(userId, input) {
  const spec = cleanCharacter(input);
  q.run('UPDATE users SET character_spec=? WHERE id=?', JSON.stringify(spec), userId);
  return spec;
}
export function clearCharacter(userId) { q.run('UPDATE users SET character_spec=NULL WHERE id=?', userId); }
