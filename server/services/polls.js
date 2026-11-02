// Game polls: "62% of players chose this" in Would You Rather (and any official game on the list). The game asks
// through the SDK (BRB.poll), the play page posts it here. Only counts are kept and shown: never who chose what to
// anyone, never any text. One vote per player per item and seat (pass-and-play players on one device are seats 0-5);
// a second vote for the same item and seat changes nothing. Docs: docs/sdk.md "Polls", docs/decisions.md "Game polls".
import { q, tx, now } from '../db.js';

/** Official games that may keep polls (slugs). */
export const POLL_GAMES = new Set(['would-you-rather']);
export const ITEM = /^[a-z0-9][a-z0-9-]{0,39}$/;
/** Below this many votes the game says "one of the first to answer" instead of a percentage. */
export const MIN_SHOWN = 5;

/** Count a vote (once per player, item and seat) and return the totals: { a, b, total }. */
export function vote(gameId, userId, item, choice, seat = 0) {
  return tx(() => {
    const fresh = q.run('INSERT OR IGNORE INTO game_poll_votes(game_id, item, user_id, seat, choice, at) VALUES (?,?,?,?,?,?)', gameId, item, userId, seat, choice, now()).changes > 0;
    if (fresh) q.run(`INSERT INTO game_polls(game_id, item, a, b) VALUES (?,?,?,?) ON CONFLICT(game_id, item) DO UPDATE SET a=a+excluded.a, b=b+excluded.b`, gameId, item, choice === 0 ? 1 : 0, choice === 1 ? 1 : 0);
    return totals(gameId, item);
  });
}
export function totals(gameId, item) {
  const r = q.get('SELECT a, b FROM game_polls WHERE game_id=? AND item=?', gameId, item) || { a: 0, b: 0 };
  return { a: r.a, b: r.b, total: r.a + r.b };
}
