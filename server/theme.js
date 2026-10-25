// Site theme: 'system' (follow the device, the default), 'light' or 'dark'. See docs/decisions.md.
//   pickTheme(...)   ?theme= → theme cookie → the signed-in user's saved choice (users.theme, '' = system) → system
//   middleware       sets req.theme and req.themeSource; a GET page with ?theme= saves the choice and redirects without it
// layout.js turns req.theme into <html data-theme> (only for Light or Dark) and <meta name="color-scheme">.
import { q } from './db.js';
import { config } from './config.js';
import { readCookie, sameOrigin, isPageGet, withoutParam } from './i18n/index.js';

export const THEMES = ['system', 'light', 'dark'];
export const THEME_ICONS = { system: '🌓', light: '☀️', dark: '🌙' };
export const COOKIE = 'theme';
const ONE_YEAR = 365 * 86400;
/** 'Dark ' -> 'dark'; anything else -> null. */
export const normalizeTheme = v => {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return THEMES.includes(s) ? s : null;
};
/** -> { theme, source: 'query'|'cookie'|'user'|'default' } */
export function pickTheme({ query = null, cookie = null, user = null } = {}) {
  const fromQuery = normalizeTheme(query); if (fromQuery) return { theme: fromQuery, source: 'query' };
  const fromCookie = normalizeTheme(cookie); if (fromCookie) return { theme: fromCookie, source: 'cookie' };
  const fromUser = normalizeTheme(user && user.theme); if (fromUser) return { theme: fromUser, source: 'user' };
  return { theme: 'system', source: 'default' };
}
export function setThemeCookie(res, theme) {
  const secure = config.env === 'production' ? '; Secure' : '';
  res.append('Set-Cookie', `${COOKIE}=${theme}; Path=/; Max-Age=${ONE_YEAR}; SameSite=Lax${secure}`);
}
/** Save a signed-in user's choice (guests too: their row carries over when they make an account). */
export function saveUserTheme(user, theme) {
  theme = normalizeTheme(theme); if (!user || !theme) return;
  const v = theme === 'system' ? '' : theme;
  if ((user.theme || '') === v) return;
  q.run('UPDATE users SET theme=? WHERE id=?', v, user.id);
  user.theme = v;
}
/** Runs after the session and language middleware. Same rules as ?lang= (see server/i18n/index.js). */
export function middleware(req, res, next) {
  const query = typeof req.query.theme === 'string' ? req.query.theme : null;
  const picked = pickTheme({ query, cookie: readCookie(req, COOKIE), user: req.user });
  req.theme = picked.theme; req.themeSource = picked.source;
  if (picked.source === 'query') {
    if (sameOrigin(req)) { setThemeCookie(res, picked.theme); saveUserTheme(req.user, picked.theme); }
    if (isPageGet(req)) return res.redirect(303, withoutParam(req.originalUrl, 'theme'));
  }
  next();
}
