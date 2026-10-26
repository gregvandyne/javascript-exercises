// The domain move's hand-off (server/domain.js has the redirect and the token store): someone signed in on an old name
// (magic-cup.onrender.com) arrives on PUBLIC_URL (oomba.ai) still signed in, with the SAME session, so the same rules
// apply (a student's 1 h idle and 10 h at most count from the original sign-in; signing out on either name, sign out
// everywhere and bans end both).
//
//   1 old   GET /any/page                 -> 302 new /auth/handoff/start?from=<old>&to=/any/page     (domain.js)
//   2 new   GET /auth/handoff/start       sets a 2-minute nonce cookie here -> 302 old /auth/handoff/issue?n=<nonce>
//   3 old   GET /auth/handoff/issue       reads the old sign-in, keeps a 60 s one-time token -> 302 new /auth/handoff?t=<token>
//   4 new   GET /auth/handoff             token + the same browser's nonce -> sign-in cookie for the same session -> 303 /any/page
//
// Only random codes and a path ever appear in an address; never a session id. Every hop is no-store and no-referrer.
// The nonce binds the token to the browser that started the hand-off: a hand-off link sent to someone else (to sign
// them in as the sender) is refused. Binding by address or browser type wouldn't help: a school shares both.
import { Router } from 'express';
import { config } from '../config.js';
import { q, now } from '../db.js';
import { attachSession, getUser } from '../auth.js';
import { hostOnly, publicHost, legacyHosts } from '../site.js';
import { allow, ipOf } from '../services/ratelimit.js';
import { log } from '../services/log.js';
import { readCookie, setLangCookie, normalizeCode, COOKIE as LANG_COOKIE } from '../i18n/index.js';
import { setThemeCookie, normalizeTheme, COOKIE as THEME_COOKIE } from '../theme.js';
import * as D from '../domain.js';

export const router = Router();
const hop = res => res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
/** A redirect with an empty body: the codes appear in the Location header only (Express's default body repeats it). */
const go = (res, status, url) => res.status(status).location(url).end();
/** Every Location is absolute on PUBLIC_URL (or on a listed old name), never a relative one a browser could misread. */
const onSite = to => config.publicUrl + D.cleanTo(to);
const onNew = req => D.state.ready && publicHost() && hostOnly(req.headers.host) === publicHost();
const onOld = req => D.state.ready && legacyHosts().has(hostOnly(req.headers.host));
const notFound = (req, res, next) => next('router');

// 2 (new name): remember this browser, then ask the old name for the sign-in.
router.get('/auth/handoff/start', (req, res, next) => {
  if (!onNew(req)) return notFound(req, res, next);
  hop(res);
  const from = hostOnly(req.query.from); const to = D.cleanTo(req.query.to);
  if (!legacyHosts().has(from)) return go(res, 303, onSite('/'));   // never an open redirect
  // Someone already signed in here (the newest sign-in on this name wins; nothing is carried over it).
  if (req.user && !req.user.is_guest) return go(res, 303, onSite(to));
  const n = D.randomCode();
  D.setNonceCookie(res, D.nonceKey(n), n, D.HANDOFF.nonceMaxAge);
  go(res, 302, `${new URL(config.publicUrl).protocol}//${from}/auth/handoff/issue?n=${n}&to=${encodeURIComponent(to)}`);
});

// 3 (old name): the old sign-in (already judged by sessionMiddleware: bans, idle, ended) -> a one-time token.
router.get('/auth/handoff/issue', (req, res, next) => {
  if (!onOld(req)) return notFound(req, res, next);
  hop(res);
  const to = D.cleanTo(req.query.to); const n = req.query.n;
  const lang = normalizeCode(readCookie(req, LANG_COOKIE)); const theme = normalizeTheme(readCookie(req, THEME_COOKIE));
  if (typeof n !== 'string' || !D.CODE_RE.test(n) || (!req.user && !lang && !theme)) return go(res, 302, onSite(to));
  if (!allow(`handoff:${ipOf(req)}`, D.HANDOFF.perIpHour, 3600e3)) { log('warn', 'handoff refused', { reason: 'rate' }); return go(res, 302, onSite(to)); }
  const t = D.putToken({ nonce: n, sessionId: req.user ? req.sessionId : null, userId: req.user ? req.user.id : null, to, lang, theme });
  if (!t) { log('warn', 'handoff refused', { reason: 'full' }); return go(res, 302, onSite(to)); }   // lands signed out, never fails open
  go(res, 302, `${config.publicUrl}/auth/handoff?t=${t}`);
});

// 4 (new name): spend the token in the browser that holds its nonce -> the same session here, then the clean address.
router.get('/auth/handoff', (req, res, next) => {
  if (!onNew(req)) return notFound(req, res, next);
  hop(res);
  const entry = D.takeToken(req.query.t);   // spent now, whatever happens next
  if (!entry) { log('warn', 'handoff refused', { reason: 'unknown or expired' }); return go(res, 303, onSite('/login?moved=1')); }
  const refuse = reason => {
    log('warn', 'handoff refused', { reason });
    return go(res, 303, onSite(entry.sessionId ? `/login?moved=1&next=${encodeURIComponent(entry.to)}` : entry.to));
  };
  if (!D.nonceMatches(req, entry)) return refuse('not the browser that started it');
  D.setNonceCookie(res, entry.k, '', 0);
  if (entry.sessionId) {
    // Ended, signed out everywhere or banned since step 3: refused. The full rules (idle, at most) run on the next request.
    const s = q.get('SELECT * FROM sessions WHERE id=?', entry.sessionId); const u = s && getUser(s.user_id);
    if (!s || s.user_id !== entry.userId || s.expires_at <= now() || !u || u.banned) return refuse('session ended');
    if (!req.user || req.user.is_guest) {   // someone signed in here meanwhile keeps their sign-in
      if (req.sessionId !== s.id) attachSession(res, s.id, s.expires_at);
      log('info', 'session handoff', { user: u.id });
    }
  }
  if (entry.lang && !readCookie(req, LANG_COOKIE)) setLangCookie(res, entry.lang);
  if (entry.theme && !readCookie(req, THEME_COOKIE)) setThemeCookie(res, entry.theme);
  go(res, 303, onSite(entry.to));
});
