// The live-ready check (docs/decisions.md "Oomba Live"; docs/kit-api.md "Live class games"): may a game version be
// hosted live? A game is ready when it loads the kit's `live` pack with its pinned tag and uses Oomba.live correctly:
// it says it is ready, reacts to the session, reports results, and never touches the raw transport. Warnings (never
// blocking) feed the Builder's fix loop; the real protection is at run time (the SDK's port, the data shape of game
// events, text entry off in live frames). Versions never change, so results are cached by version id.
// Every regex here runs in linear time (no nested quantifiers).
import * as games from './games.js';
import { checkHtml } from './classlive-lint.js';
export { hooks, PACK, hasLivePack, checkHtml, LIVE_NOTES } from './classlive-lint.js';

const cache = new Map();
/** The check for a stored version (cached: versions never change). Unknown version: not ready. */
export function liveCheck(versionId) {
  if (cache.has(versionId)) return cache.get(versionId);
  const v = games.getVersion(versionId);
  const r = v ? checkHtml(v.html) : { ready: false, issues: [{ level: 'fail', code: 'live_pack' }] };
  if (v) { if (cache.size > 500) cache.delete(cache.keys().next().value); cache.set(versionId, r); }
  return r;
}
/** Is a game's published version live-ready? (Game pages and the /live landing.) */
export const gameReady = game => !!(game && game.published_version_id && liveCheck(game.published_version_id).ready);
export const _clearCache = () => cache.clear();
