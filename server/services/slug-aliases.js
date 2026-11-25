// Old game slugs that still work. When an official game's slug changes (The Big Divide, box-by-box, is now Arithmetic
// Lab, arithmetic-lab: docs/decisions.md "The Big Divide is now Arithmetic Lab"), the old one stays here for good:
//   - every request whose path has the old slug as a segment (/g/box-by-box, /play/box-by-box?chapter=..., /es/g/box-by-box,
//     /covers/box-by-box.jpg, /api/.../box-by-box/...) is redirected to the same path with the new slug and the same
//     query string (301 for GET and HEAD, 308 for anything else, so a POST keeps its body), by slugRedirect in server/app.js;
//   - anything that looks a game up by slug from what a client sent (games.getGameBySlug, the AI voice lists, HIDDEN_GAMES)
//     reads the old slug as the new one (canonicalSlug);
//   - no new game may take an old slug (games.uniqueSlug), so an old link never lands on someone else's game.
// Migration 0121 in server/db.js renamed the stored row, so the seed import updates the same game.
// Typing Pets (typing-pets) is now Typing Zoo (typing-zoo): docs/decisions.md "Typing Zoo"; migration 0127.
export const SLUG_ALIASES = new Map([['box-by-box', 'arithmetic-lab'], ['typing-pets', 'typing-zoo']]);

/** The slug a game has now: the new one for an old slug, else the slug as given. */
export const canonicalSlug = slug => SLUG_ALIASES.get(String(slug ?? '')) ?? slug;

/** A path with every old slug in it changed to the new one (a whole segment, or a file named after it: box-by-box.jpg),
 *  or null when it has none. */
export function renamedPath(p) {
  let changed = false;
  const out = String(p).split('/').map(seg => {
    const m = /^([a-z0-9-]+)(\.[A-Za-z0-9]+)?$/.exec(seg);
    if (!m || !SLUG_ALIASES.has(m[1])) return seg;
    changed = true;
    return SLUG_ALIASES.get(m[1]) + (m[2] || '');
  }).join('/');
  return changed ? out : null;
}

/** Express middleware: a request for an old slug goes to the new one, query string and the rest of the path kept. */
export function slugRedirect(req, res, next) {
  const url = req.originalUrl || req.url;
  const i = url.indexOf('?');
  const p = i < 0 ? url : url.slice(0, i);
  if (![...SLUG_ALIASES.keys()].some(k => p.includes(k))) return next();
  const to = renamedPath(p);
  if (!to) return next();
  const get = req.method === 'GET' || req.method === 'HEAD';
  // Always a path on this site: leading slashes or backslashes become one slash, so "//host/..." can't send anyone away.
  res.redirect(get ? 301 : 308, to.replace(/^[/\\]+/, '/') + (i < 0 ? '' : url.slice(i)));
}
