// Doodle Hoot Live (built-in mode 'doodle', docs/decisions.md "Doodle Hoot"): a draw-and-guess game for a family or a
// group of friends, each on their own device, wherever they are. One player draws a word only they can see; everyone
// else spells it with letter tiles (never typed text). The server runs every turn, relays the strokes from memory only,
// builds the trays and checks every guess. The room runs in services/classlive-doodle.js; the rules and the reviewed
// word list are the game's own (server/live/doodle-core.js reads them from seed-games/doodle-hoot.html).
// Starter id: 'doodle:<lang>:<level 1-3>:<rounds 1-3>:<seconds 60|80|100>'.
import { doodle } from './doodle-core.js';

/** The word languages: the site's 13 locales. */
export const LANGS = ['en', 'en-GB', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'ru', 'ja', 'zh-Hant', 'ar', 'he'];
export const LEVELS = [1, 2, 3];
export const ROUNDS = [1, 2, 3];
export const SECS = [60, 80, 100];
/** The drawer's time to pick one of three words (a random one after it), the reveal after each turn, and how long the
 *  final podium shows before the results. */
export const PICK_MS = 15000, REVEAL_MS = 5000, HOLD_MS = 6000;
/** A drawer who drops out has this long to come back before the turn moves on; with fewer than 2 players the game
 *  waits this long at most, then ends. */
export const DROP_GRACE_MS = 15000, WAIT_MAX_MS = 180000;
/** Guesses: at most one every GUESS_GAP_MS and GUESS_MAX wrong ones a turn (no trying every order of a short word);
 *  each letter hint already shown costs HINT_COST points. */
export const GUESS_GAP_MS = 1200, GUESS_MAX = 12, HINT_COST = 10;
/** A turn's drawing: at most this many strokes and points, and points a second over a rolling 2 s window. */
export const MAX_STROKES = 600, MAX_POINTS = 8000, MAX_PPS = 400;
/** The most players a room holds (turns: 16 players at 80 s is about 25 minutes a round). */
export const MAX_PLAYERS = 16;
/** The shared state goes out at most this often (ms) while only the clock changes. */
export const SEND_MS = 200;
/** A canvas replay is sent in chunks of at most this many bytes of JSON. */
export const CHUNK_BYTES = 12 * 1024;
export const DEFAULT_ID = 'doodle:en:1:2:80';

/** 'doodle:<lang>:<lvl>:<rounds>:<secs>' -> { lang, lvl, rounds, secs } | null */
export function parseId(id) {
  const m = /^doodle:([a-zA-Z-]{2,7}):([1-3]):([1-3]):(\d{2,3})$/.exec(String(id || ''));
  if (!m || !LANGS.includes(m[1]) || !SECS.includes(+m[4])) return null;
  return { lang: m[1], lvl: +m[2], rounds: +m[3], secs: +m[4] };
}
export const makeId = ({ lang = 'en', lvl = 1, rounds = 2, secs = 80 } = {}) =>
  `doodle:${LANGS.includes(lang) ? lang : 'en'}:${LEVELS.includes(+lvl) ? +lvl : 1}:${ROUNDS.includes(+rounds) ? +rounds : 2}:${SECS.includes(+secs) ? +secs : 80}`;
/** The word language for a site locale (any of the 13, else English). */
export const langFor = locale => (LANGS.includes(locale) ? locale : 'en');

/** The words of a language and level: [{ id, lvl, cat, e, w }]. */
export function wordsFor(lang, lvl) {
  const { DoodleCore: C, DoodleWords: D } = doodle();
  return C.words(D, langFor(lang), lvl);
}
/** Three sample words for the landing ("cat · sun · ball"), the same for everyone. */
export function samples(lang, lvl) {
  const ws = wordsFor(lang, lvl);
  return [0, 1, 2].map(i => ws[Math.floor((i * ws.length) / 3)]).filter(Boolean).map(x => x.w);
}
