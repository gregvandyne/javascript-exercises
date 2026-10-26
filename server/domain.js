// The domain move (docs/decisions.md, "Moving to oomba.ai"): with PUBLIC_URL set, page loads that arrive on one of the
// site's old names (site.js legacyHosts: magic-cup.onrender.com, www.oomba.ai, REDIRECT_HOSTS) go to the same page on
// PUBLIC_URL, and people who were signed in there stay signed in (routes/handoff.js). Unset, nothing here does anything.
//
//   self-check     old names redirect only once PUBLIC_URL is shown to reach this very process (a typo, DNS not spread,
//                  no certificate yet or an edge redirect that would loop all keep it off)
//   canonicalRedirect   page loads only; API calls, Builder streams, game frames and files are answered where they land
//   token store    one-time hand-off tokens, in memory (one instance, like the login-card store), 60 s, single use
import crypto from 'node:crypto';
import { config } from './config.js';
import { hostOnly, publicHost, legacyHosts } from './site.js';
import { log } from './services/log.js';
import { html } from './views/html.js';
import { COOKIE as SESSION_COOKIE } from './auth.js';
import { pickLocale, readCookie, localeInfo, tFor, localPath, COOKIE as LANG_COOKIE } from './i18n/index.js';
import { COOKIE as THEME_COOKIE, normalizeTheme } from './theme.js';

// ---------------------------------------------------------------------------------------------------- self-check
/** Changeable in tests, like SIGNUP. */
export const HOST_CHECK = { retryMs: 30e3, everyMs: 600e3, timeoutMs: 5000, failsToStop: 3, warnEveryMs: 600e3 };
/** ready: old names redirect. Only the self-check (or a test) turns it on. */
export const state = { ready: false, fails: 0, lastWarn: 0, timer: null, run: 0 };
/** Random per process: only this process answers 204 for it (not an old instance during a deploy, an edge page or a
 *  parked domain). It confirms a 128-bit guess and nothing else. */
export const bootId = crypto.randomBytes(16).toString('base64url');
export const HOST_CHECK_PATH = '/.well-known/oomba-host-check/';
/** GET /.well-known/oomba-host-check/:id (registered beside /health: no session, no request log line). PUBLIC_URL
 *  unset: not there at all (the site's usual 404). */
export function hostCheckRoute(req, res, next) {
  if (!config.publicUrl) return next();
  res.set('Cache-Control', 'no-store').status(req.params.id === bootId ? 204 : 404).end();
}
/** One probe of PUBLIC_URL. -> true when it reached this process. */
export async function checkHostOnce() {
  if (!config.publicUrl || !legacyHosts().size) { state.ready = false; return false; }
  let status = 0, error;
  try {
    const r = await fetch(config.publicUrl + HOST_CHECK_PATH + bootId, { redirect: 'manual', signal: AbortSignal.timeout(HOST_CHECK.timeoutMs), headers: { 'user-agent': 'oomba-host-check' } });
    status = r.status; await r.body?.cancel();
  } catch (e) { error = e?.cause?.code || e?.name || 'error'; }
  const to = config.publicUrl;
  if (status === 204) {
    state.fails = 0;
    if (!state.ready) { state.ready = true; log('info', 'old addresses redirect', { to, from: [...legacyHosts()] }); }
    return true;
  }
  state.fails++;
  if (state.ready && state.fails >= HOST_CHECK.failsToStop) {
    state.ready = false; state.lastWarn = Date.now();
    log('warn', 'PUBLIC_URL stopped reaching this server: old addresses are not redirected any more', { to, status: status || undefined, error });
  } else if (!state.ready && Date.now() - state.lastWarn >= HOST_CHECK.warnEveryMs) {
    state.lastWarn = Date.now();
    log('warn', 'PUBLIC_URL does not reach this server yet: old addresses are not redirected', { to, status: status || undefined, error });
  }
  return false;
}
/** After listen (server/index.js): probe now, every 30 s until it works, then every 10 minutes. Does nothing when
 *  there is nothing to redirect (PUBLIC_URL unset). */
export function startHostCheck() {
  stopHostCheck();
  if (!config.publicUrl || !legacyHosts().size) return;
  const run = state.run;
  const tick = async () => {
    await checkHostOnce();
    if (run !== state.run) return;   // stopped meanwhile
    state.timer = setTimeout(tick, state.ready && !state.fails ? HOST_CHECK.everyMs : HOST_CHECK.retryMs);
    state.timer.unref?.();
  };
  tick();
}
export function stopHostCheck() { state.run++; clearTimeout(state.timer); state.timer = null; }

// ---------------------------------------------------------------------------------------------------- the redirect
/** Paths that are files, frames or APIs, never pages (for requests without Fetch Metadata: crawlers, curl, old browsers). */
const NOT_PAGES = /^\/(api|frame|vendor|css|js|fonts|icons|covers|shots|avatars|sdk\/|\.well-known)(\/|$)|^\/(favicon\.ico|manifest\.webmanifest|robots\.txt)$/;
/** A top-level page load (GET/HEAD). Fetch Metadata when the browser sends it; otherwise every page path. */
export function isPageLoad(req) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  const dest = req.headers['sec-fetch-dest'];
  if (dest) return dest === 'document';   // iframe (a game frame), empty (fetch), image, script… -> served here
  const mode = req.headers['sec-fetch-mode'];
  if (mode) return mode === 'navigate' && !NOT_PAGES.test(req.path);
  return !NOT_PAGES.test(req.path);
}
/** Longest path carried through the hand-off; anything longer lands on the home page. */
export const PATH_MAX = 2000;
/** A ?to= -> a local path with its query ("/g/x?y=1"); '//evil.example/x' -> '/evil.example/x'; junk or too long -> '/'. */
export function cleanTo(raw) {
  if (typeof raw !== 'string' || !raw || raw.length > PATH_MAX) return '/';
  let u; try { u = new URL(raw, 'http://x'); } catch { return '/'; }
  const to = localPath(u) + u.search;
  return to.length > PATH_MAX ? '/' : to;
}
const hasCookie = (req, name) => !!readCookie(req, name);
/** Cookies worth carrying to the new address: the sign-in, the language and the theme. */
export const carries = req => [SESSION_COOKIE, LANG_COOKIE, THEME_COOKIE].some(c => hasCookie(req, c));
/**
 * Page loads on an old name -> the same page on PUBLIC_URL. Runs after the security headers, MOVED_TO_URL and
 * MAINTENANCE_MODE, before files and the session. No database work.
 *   no cookies                      301, cached for a day at most (a rollback lingers only that long)
 *   a sign-in, language or theme    302 into the hand-off (routes/handoff.js): same page, still signed in
 *   started inside an old open tab  200 "we moved" page that refreshes itself: a 30x answer to a form there (the top-bar
 *                                   search, the language and theme pickers) would break that page's form-action 'self'
 */
export function canonicalRedirect(req, res, next) {
  if (!state.ready) return next();
  const host = hostOnly(req.headers.host);   // the raw Host (what Render routes by), never X-Forwarded-Host
  if (!legacyHosts().has(host)) return next();
  if (req.path === '/auth/handoff/issue' || !isPageLoad(req)) return next();
  const path = req.originalUrl.startsWith('/') ? req.originalUrl : '/';   // only a path is appended (as MOVED_TO_URL)
  const carry = carries(req);
  const target = carry ? `${config.publicUrl}/auth/handoff/start?from=${encodeURIComponent(host)}&to=${encodeURIComponent(cleanTo(path))}` : config.publicUrl + path;
  if (req.headers['sec-fetch-site'] === 'same-origin') return movedPage(req, res, target);
  if (carry) return res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }).redirect(302, target);
  res.set({ 'Cache-Control': 'public, max-age=86400', Vary: 'Cookie, Sec-Fetch-Site' }).redirect(301, target);
}
/** "We moved": in the visitor's language, refreshes at once to target. No script and never a token (at most the
 *  hand-off's first step, which a link scanner can't spend). */
export function movedPage(req, res, target) {
  const lang = pickLocale({ cookie: readCookie(req, LANG_COOKIE), acceptLanguage: req.headers['accept-language'] }).locale;
  const t = tFor(lang); const site = publicHost();
  const theme = normalizeTheme(readCookie(req, THEME_COOKIE));
  const scheme = theme === 'light' || theme === 'dark' ? theme : 'light dark';
  res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' }).status(200).type('html');
  res.send(String(html`<!doctype html><html lang="${lang}" dir="${localeInfo(lang).dir}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="${scheme}"><meta http-equiv="refresh" content="0;url=${target}"><title>${t('errors.moved.title')}</title>`
    + html`<body style="font:18px/1.5 system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;margin:0 16px;text-align:center">`
    + html`<main><div style="font-size:64px" aria-hidden="true">🚀</div><h1>${t('errors.moved.heading')}</h1><p>${t('errors.moved.text', { site })}</p>`
    + html`<p><a href="${target}" style="display:inline-block;padding:12px 20px;font-weight:700">${t('errors.moved.link', { site })}</a></p></main></body></html>`));
}

// ---------------------------------------------------------------------------------------------------- hand-off tokens
/** ttlMs: a token's life; nonceMaxAge: the browser nonce cookie's (seconds); max: tokens kept at once; perIpHour: hand-offs
 *  one address can start in an hour (a class behind one address is ~30 children with a few tabs each). */
export const HANDOFF = { ttlMs: 60e3, nonceMaxAge: 120, max: 20000, perIpHour: 300 };
const tokens = new Map();
let lastSweep = 0;
const sweep = (force = false) => {
  const t = Date.now(); if (!force && t - lastSweep < 10e3) return; lastSweep = t;
  for (const [k, e] of tokens) if (e.exp <= t) tokens.delete(k);
};
/** 32 random bytes, base64url (43 characters). */
export const randomCode = () => crypto.randomBytes(32).toString('base64url');
export const CODE_RE = /^[A-Za-z0-9_-]{43}$/;
export const sha256 = s => crypto.createHash('sha256').update(String(s)).digest();
/** The nonce cookie's name suffix: one cookie per hand-off, so tabs restored together don't overwrite each other. */
export const nonceKey = n => sha256(n).toString('hex').slice(0, 12);
/** __Host- (Secure, no Domain, Path=/) when PUBLIC_URL is https; without https (local tests) a plain name. */
export const nonceCookieName = k => `${config.publicUrl.startsWith('https:') ? '__Host-' : ''}brb_hn_${k}`;
export function setNonceCookie(res, k, value, maxAge) {
  const secure = config.publicUrl.startsWith('https:') ? '; Secure' : '';
  res.append('Set-Cookie', `${nonceCookieName(k)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
}
/** Keep a hand-off: entry { sessionId, userId, nonce (from the URL), to, lang, theme }. -> the token, or null when full. */
export function putToken({ nonce, ...entry }) {
  sweep();
  if (tokens.size >= HANDOFF.max) { sweep(true); if (tokens.size >= HANDOFF.max) return null; }
  const t = randomCode();
  tokens.set(t, { ...entry, k: nonceKey(nonce), nonceHash: sha256(nonce), exp: Date.now() + HANDOFF.ttlMs });
  return t;
}
/** Spend a token: gone from the store whatever happens next, so it is presented once only. -> entry or null (expired). */
export function takeToken(t) {
  if (typeof t !== 'string' || !CODE_RE.test(t)) return null;
  const e = tokens.get(t); tokens.delete(t);
  return e && e.exp > Date.now() ? e : null;
}
/** Does this browser hold the nonce the token was made for? (timing-safe) */
export function nonceMatches(req, entry) {
  const v = readCookie(req, nonceCookieName(entry.k));
  return !!v && CODE_RE.test(v) && crypto.timingSafeEqual(sha256(v), entry.nonceHash);
}
export const _tokens = { size: () => tokens.size, clear: () => tokens.clear() };
