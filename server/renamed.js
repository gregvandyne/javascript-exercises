// Official games that changed their address (docs/decisions.md "Typing Zoo"): the old slug answers 301 to the new one
// for good, on every page that carries a slug (the game page, play, a language's game page) and for the game's cover and
// share pictures, keeping the rest of the path and the query string (?chapter=l05&lock=1 and the like). The game row
// itself was renamed in place by a migration (server/db.js), so its id, saves and assignments never moved.
export const RENAMED_GAMES = new Map([['typing-pets', 'typing-zoo']]);

const OLD = [...RENAMED_GAMES.keys()].join('|');
// [/<lang>]/(g|play)/<old>[/...]   and   /(covers|og)/<old>.jpg
const PAGE_RE = new RegExp(`^(/[a-z]{2}(?:-[a-z]{2,4})?)?/(g|play)/(${OLD})(?=/|$)`);
const PIC_RE = new RegExp(`^/(covers|og)/(${OLD})(\\.jpg)$`);

/** The new address of an old one (path and query), or null when it is not a renamed game's. */
export function renamedUrl(url) {
  const i = url.indexOf('?'), p = i < 0 ? url : url.slice(0, i), qs = i < 0 ? '' : url.slice(i);
  let m = PAGE_RE.exec(p);
  if (m) return `${m[1] || ''}/${m[2]}/${RENAMED_GAMES.get(m[3])}${p.slice(m[0].length)}${qs}`;
  m = PIC_RE.exec(p);
  if (m) return `/${m[1]}/${RENAMED_GAMES.get(m[2])}${m[3]}${qs}`;
  return null;
}

/** Express middleware: GET and HEAD of an old address go to the new one (301). */
export function renamedGames(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const to = renamedUrl(req.originalUrl || req.url);
  if (!to) return next();
  res.set('Cache-Control', 'public, max-age=86400');
  return res.redirect(301, to);
}
