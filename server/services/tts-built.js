// AI voices for games made in the Builder, by default (the owner's decision of 2026-11-13; docs/decisions.md "AI voices
// for Builder games: fixed, scanned lines only"). Before, a Builder game always kept the device's voice, so that a kid's
// own words were never sent to the voice service. Now a Builder game's FIXED lines may be read by the AI voice:
// - Which games: not an official game (those have their registered lines, tts-lines.js), published, not hidden, its
//   maker's account in good standing, and its published version's stored safety scan is 'pass' (services/scanner.js; a
//   flagged, failed or unscanned version keeps the device's voice, as does a draft or a Studio/Builder preview).
//   TTS_BUILT_GAMES=0 switches the whole thing off.
// - Which words: the allowlist is derived on the server from the STORED copy of that published version (never from the
//   page): the string literals in its scripts, its markup text and a few text attributes (tts-games.js sourceItems),
//   each also split into its lines and sentences. A request must equal one of them EXACTLY after tidy() (NFC, whitespace
//   collapsed, trimmed), ignoring only upper and lower case (a word game reads 'CAT' as 'cat'); punctuation and digits
//   as written. Nothing is filled in: a string with a ${…} slot or a
//   'a' + x + 'b' chain is left out whole, numbers are not interchangeable, and pieces are never joined. So what a
//   player types while playing (an answer, an input's value, a name), and anything the game puts together while it
//   runs, is never one of the lines unless the very same words were already fixed in the game's source when it was saved.
// - The role is one fixed, friendly voice (ROLE); the page's role is ignored.
// - The usual backstops (rude words, personal info, the player's own name or username, TTS_MAX_CHARS), the per-person
//   daily quotas and the TTS budget still run in routes/tts.js. No warm-up: a line is made the first time it is played.
// The allowlist is computed on demand and cached per version id (a version's HTML never changes), so there is no
// migration and a newly published version is used at once.
import { q } from '../db.js';
import { config } from '../config.js';
import { tidy } from './tts.js';
import { sourceItems, whyNot } from './tts-games.js';

/** The one voice role every Builder game is read with. */
export const ROLE = 'friendly';
const SLOT = '${x}';   // how tts-games.js scriptItems marks a ${…} slot and a joined expression
const MAX_LINE = 2400, MAX_LINES = 20000, CACHE_N = 100;

/** How a line is compared: tidy(), lower case. */
export const key = text => tidy(text).toLowerCase();
/** The exact lines of one game source: a Set of key() strings. Strings with a slot are left out whole. */
export function fixedLines(html) {
  const out = new Set();
  const add = s => {
    if (out.size >= MAX_LINES || s.includes(SLOT)) return;
    const t = key(s);
    if (t && t.length <= MAX_LINE && /[\p{L}\p{N}]/u.test(t)) out.add(t);
  };
  for (const { s } of sourceItems(html)) {
    const f = String(s);
    if (!f || f.length > MAX_LINE * 4) continue;
    add(f);
    // Its lines and sentences on their own (a game may read a paragraph one sentence at a time). A slot only takes
    // out the line or sentence it is in.
    const lines = f.split(/\n+/);
    if (lines.length > 1) lines.forEach(add);
    for (const l of lines) { const parts = tidy(l).split(/(?<=[.!?。！？…])\s+/); if (parts.length > 1) parts.forEach(add); }
  }
  return out;
}

const versionRow = id => (id ? q.get('SELECT id, game_id, safety_status FROM game_versions WHERE id=?', id) : null) || null;
/** Did the game's published version pass the safety scanner (its stored result)? */
export function passed(g) {
  const v = g && versionRow(g.published_version_id);
  return !!v && v.game_id === g.id && v.safety_status === 'pass';
}
/** May this game's fixed lines be read by the AI voice: a Builder game (never an official one), published, not hidden,
 *  its maker in good standing, its published version passed by the scanner. Never a draft or a preview. */
export const allowed = g => !!config.ttsBuiltGames && !!g && g.status === 'published' && !!g.published_version_id && !g.hidden_reason
  && !whyNot(g) && passed(g);

const cache = new Map();   // published version id -> Set of fixed lines
/** The fixed lines of a game's published version (cached per version id), or null. */
export function linesFor(g) {
  if (!passed(g)) return null;
  const vid = g.published_version_id;
  let a = cache.get(vid);
  if (!a) {
    const v = q.get('SELECT html FROM game_versions WHERE id=? AND game_id=?', vid, g.id); if (!v) return null;
    a = fixedLines(v.html);
    cache.set(vid, a); if (cache.size > CACHE_N) cache.delete(cache.keys().next().value);
  }
  return a;
}
/** Is this exactly one of the game's fixed lines? -> the text to read, or null. */
export function allowedText(g, text) {
  if (typeof text !== 'string') return null;
  const a = linesFor(g); if (!a) return null;
  const s = tidy(text);
  return s && a.has(s.toLowerCase()) ? s : null;
}
export const _clear = () => cache.clear();
