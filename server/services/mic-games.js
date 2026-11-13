// Loudness on the play page (docs/safety.md "Loudness"; docs/decisions.md "Remi's Quiet Meadow"). Three official
// classroom noise meters (Remi's Quiet Meadow, Quiet Bounce, Popcorn Hush) may listen for HOW LOUD the room is: their play page (never its game frame) opens
// the microphone after a tap, measures the level on the device and passes the game one number at a time
// (public/js/loudness.js). Nothing is recorded, stored or sent anywhere.
//
// Why the page and not the frame: every game frame is opaque-origin (no allow-same-origin, ever), and browsers refuse
// getUserMedia in an opaque-origin document whatever the Permissions-Policy says (Chromium: "Invalid security origin").
// So the frame, its sandbox, its CSP and its `microphone=()` header stay exactly as for every other game.
//
// Who gets it is decided here, on the server: the three official noise meters (slug on the list, official, published,
// not hidden), and since 13 Nov 2026 any Builder game whose code uses BRB.loudness (MIC_BUILDER=0 turns that part off).
// Both get exactly the same page-side listening and nothing more. MIC_GAMES=0 switches it off for the whole site.
import { isOfficial } from './classlive-access.js';
import { config } from '../config.js';

/** The official games whose play page may listen for loudness. */
export const MIC_GAMES = Object.freeze(new Set(['remis-quiet-meadow', 'quiet-bounce', 'popcorn-hush']));
/** The play page's Permissions-Policy for such a game: the site's usual one with the microphone for this page only
 *  (`self`, never `*`; the game frame keeps its own `microphone=()`). */
export const MIC_POLICY = 'camera=(), microphone=(self), geolocation=(), payment=(), interest-cohort=()';
/** Code that asks for loudness through the SDK (the only way a game can: getUserMedia itself is refused by the scanner,
 *  and the opaque frame could never use it anyway). */
export const USES_LOUDNESS = /\bBRB\s*\.\s*loudness\b/;
/** Builder games may listen too (MIC_BUILDER, on by default; MIC_GAMES=0 still switches every game off). */
export const builderMicOn = () => config.micGames !== false && config.micBuilder !== false;
/**
 * May this game's play page listen for loudness? g: a games row; html: the code of the version this page plays.
 * The official noise meters on the list: published, not hidden, official. Any other game (a Builder game): its code uses
 * BRB.loudness and it is not hidden. Either way it is the same page-side listening: a tap, the browser's prompt, the
 * page's own Listening pill, one number at a time to the game, nothing recorded or sent.
 */
export function micGame(g, html = null) {
  if (config.micGames === false || !g || g.hidden_reason) return false;
  if (MIC_GAMES.has(g.slug) && g.status === 'published' && g.published_version_id && isOfficial(g)) return true;
  return builderMicOn() && typeof html === 'string' && USES_LOUDNESS.test(html);
}
