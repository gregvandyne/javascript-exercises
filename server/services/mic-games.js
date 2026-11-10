// Loudness on the play page (docs/safety.md "Loudness"; docs/decisions.md "Remi's Quiet Meadow"). Three official
// classroom noise meters (Remi's Quiet Meadow, Quiet Bounce, Popcorn Hush) may listen for HOW LOUD the room is: their play page (never its game frame) opens
// the microphone after a tap, measures the level on the device and passes the game one number at a time
// (public/js/loudness.js). Nothing is recorded, stored or sent anywhere.
//
// Why the page and not the frame: every game frame is opaque-origin (no allow-same-origin, ever), and browsers refuse
// getUserMedia in an opaque-origin document whatever the Permissions-Policy says (Chromium: "Invalid security origin").
// So the frame, its sandbox, its CSP and its `microphone=()` header stay exactly as for every other game.
//
// Who gets it is decided here, on the server, from the database row: the slug on the list, an official seed game
// (source 'seed', owned by the official account), published and not hidden. A user game with a byte copy of the html,
// the same title or a look-alike slug never passes. MIC_GAMES=0 switches it off for the whole site (the game then offers
// its "try it without a mic" demo).
import { isOfficial } from './classlive-access.js';
import { config } from '../config.js';

/** The official games whose play page may listen for loudness. */
export const MIC_GAMES = Object.freeze(new Set(['remis-quiet-meadow', 'quiet-bounce', 'popcorn-hush']));
/** The play page's Permissions-Policy for such a game: the site's usual one with the microphone for this page only
 *  (`self`, never `*`; the game frame keeps its own `microphone=()`). */
export const MIC_POLICY = 'camera=(), microphone=(self), geolocation=(), payment=(), interest-cohort=()';
/** May this game's play page listen for loudness? g: a games row. */
export function micGame(g) {
  if (config.micGames === false || !g || !MIC_GAMES.has(g.slug)) return false;
  if (g.status !== 'published' || !g.published_version_id || g.hidden_reason) return false;
  return isOfficial(g);
}
