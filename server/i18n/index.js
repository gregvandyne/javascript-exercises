// Multi-language support. See server/i18n/README.md (translators) and docs/decisions.md.
//
//   LOCALES                     the 13 site languages, in picker order: { code, name (native), dir, intl }
//   t = makeT('fr'); t(key, vars)
//                               translate; a key missing in the locale falls back to English, then to the key itself
//   req.t / res.locals.t        bound per request by middleware() (also req.locale, req.dir, req.fmt)
//   pickLocale(...)             ?lang= → lang cookie → signed-in user's saved choice → Accept-Language → en
//   fmt(locale)                 Intl number, compact number, money, date (timestamps), day (stored calendar days) and "time ago" formatting
//
// Locale files: server/i18n/locales/<code>.json, nested objects of strings, flattened to dotted keys
// ("home.hero.play"). Messages use the ICU-lite syntax in public/js/i18n-format.js ({name}, plural, select).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AsyncLocalStorage } from 'node:async_hooks';
import { format } from '../../public/js/i18n-format.js';
import { q } from '../db.js';
import { raw, esc, Raw } from '../views/html.js';
import { config } from '../config.js';
import { isOwnOrigin } from '../site.js';

export const DIR = path.dirname(fileURLToPath(import.meta.url));
// BRB_LOCALES_DIR: another folder of <code>.json files (the e2e tests use one with a stub translation).
export const LOCALES_DIR = process.env.BRB_LOCALES_DIR || path.join(DIR, 'locales');

/** Picker order is the owner's list. intl = the tag used for Intl formatting (Arabic keeps Western digits, see docs/decisions.md). */
export const LOCALES = [
  { code: 'en', name: 'English', dir: 'ltr', intl: 'en-US' },
  { code: 'en-GB', name: 'English (UK)', dir: 'ltr', intl: 'en-GB' },
  { code: 'pt', name: 'Português', dir: 'ltr', intl: 'pt-BR' },
  { code: 'fr', name: 'Français', dir: 'ltr', intl: 'fr' },
  { code: 'es', name: 'Español', dir: 'ltr', intl: 'es' },
  { code: 'de', name: 'Deutsch', dir: 'ltr', intl: 'de' },
  { code: 'he', name: 'עברית', dir: 'rtl', intl: 'he' },
  { code: 'ja', name: '日本語', dir: 'ltr', intl: 'ja' },
  { code: 'ar', name: 'العربية', dir: 'rtl', intl: 'ar-u-nu-latn' },
  { code: 'ru', name: 'Русский', dir: 'ltr', intl: 'ru' },
  { code: 'it', name: 'Italiano', dir: 'ltr', intl: 'it' },
  { code: 'zh-Hant', name: '繁體中文', dir: 'ltr', intl: 'zh-Hant-TW' },
  { code: 'nl', name: 'Nederlands', dir: 'ltr', intl: 'nl' },
];
export const DEFAULT_LOCALE = 'en';
export const CODES = LOCALES.map(l => l.code);
const BY_CODE = new Map(LOCALES.map(l => [l.code, l]));
const BY_LOWER = new Map(LOCALES.map(l => [l.code.toLowerCase(), l.code]));
export const localeInfo = code => BY_CODE.get(code) || BY_CODE.get(DEFAULT_LOCALE);
export const isRtl = code => localeInfo(code).dir === 'rtl';
/** 'EN-gb' -> 'en-GB'; unknown -> null. */
export const normalizeCode = c => (typeof c === 'string' && BY_LOWER.get(c.trim().toLowerCase())) || null;

// ---------------------------------------------------------------- dictionaries
/** Nested object -> { 'a.b.c': 'string' }. Keys starting with "_" (comments) are skipped. */
export function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj || {})) {
    if (k.startsWith('_')) continue;
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else if (typeof v === 'string') out[key] = v;
  }
  return out;
}
export function readLocaleFile(code, dir = LOCALES_DIR) {
  const file = path.join(dir, `${code}.json`);
  if (!fs.existsSync(file)) return {};
  return flatten(JSON.parse(fs.readFileSync(file, 'utf8')));
}
const dicts = new Map();
/** (Re)load every locale file. Tests call this after writing a stub file. */
export function reload(dir = LOCALES_DIR) {
  dicts.clear();
  for (const code of CODES) {
    try { dicts.set(code, readLocaleFile(code, dir)); }
    catch (e) { dicts.set(code, {}); if (!process.env.BRB_SILENT) console.error(`i18n: could not read ${code}.json: ${e.message}`); }
  }
}
reload();
export const dictionary = code => dicts.get(code) || {};

/** Languages ready to offer: English, plus any locale with at least 90% of the English keys (en-GB only lists
 *  its differences, so it counts once it has any). The picker and Accept-Language matching only use these, so a
 *  half-done translation never shows up as a choice. BRB_ALL_LOCALES=1 offers every locale (tests, translators). */
export const READY_SHARE = 0.9;
/** Long legal text (the /terms, /refunds and /privacy pages) is not counted for that share: it is translated last, after
 *  the legal review, and shows in English until then, so adding it never takes a language out of the picker. The same
 *  goes for the long teacher, parent and subject pages (/teachers, /parents, /learn/*) and the search-engine wording (seo.*): until a
 *  language has them, those pages show the English, marked as English, and server/seo.js lists only the languages
 *  that have them in hreflang and the sitemap. The parent-made accounts' legal notice (family.made.notice.*, the /parents
 *  fold info.parents.made.*) is legal text too. */
export const UNCOUNTED_PREFIXES = ['info.terms.', 'info.refunds.', 'info.privacy.', 'teachers.', 'parents.', 'learn.', 'seo.', 'info.parents.made.', 'family.made.notice.'];
const counted = code => Object.keys(dictionary(code)).filter(k => !UNCOUNTED_PREFIXES.some(p => k.startsWith(p))).length;
export function availableCodes() {
  if (process.env.BRB_ALL_LOCALES === '1') return CODES.slice();
  const total = counted(DEFAULT_LOCALE) || 1;
  return CODES.filter(c => {
    if (c === DEFAULT_LOCALE) return true;
    const n = counted(c);
    return c === 'en-GB' ? n > 0 : n / total >= READY_SHARE;
  });
}
export const availableLocales = () => { const ok = new Set(availableCodes()); return LOCALES.filter(l => ok.has(l.code)); };

/** Lookup order: the locale, then its base language (en-GB -> en), then English. */
function chain(code) {
  const out = [code];
  const base = code.split('-')[0];
  if (base !== code && BY_CODE.has(base)) out.push(base);
  if (!out.includes(DEFAULT_LOCALE)) out.push(DEFAULT_LOCALE);
  return out;
}
const missingWarned = new Set();
/** The raw (unformatted) message for a key, with fallback. undefined if even English lacks it. */
export function lookup(code, key) {
  for (const c of chain(BY_CODE.has(code) ? code : DEFAULT_LOCALE)) {
    const v = dicts.get(c)?.[key];
    if (typeof v === 'string' && v !== '') return v;
  }
  return undefined;
}
export function translate(code, key, vars) {
  const msg = lookup(code, key);
  if (msg === undefined) {
    if (!missingWarned.has(key) && !process.env.BRB_SILENT) { missingWarned.add(key); console.warn(`i18n: missing key "${key}"`); }
    return key;
  }
  return format(msg, vars, localeInfo(code).intl);
}
/** A t() bound to one locale. t.locale, t.dir, t.has(key) and t.own(key) are there for callers that need them. */
export function makeT(code) {
  code = BY_CODE.has(code) ? code : DEFAULT_LOCALE;
  const t = (key, vars) => translate(code, key, vars);
  t.locale = code; t.dir = localeInfo(code).dir; t.intl = localeInfo(code).intl;
  t.has = key => lookup(code, key) !== undefined;
  // Is the key written in this language (not the English fallback)? English and en-GB always are.
  t.own = key => code.split('-')[0] === 'en' || chain(code).some(c => c !== DEFAULT_LOCALE && typeof dicts.get(c)?.[key] === 'string' && dicts.get(c)[key] !== '');
  return t;
}
/** A translation that contains a little markup (<b>, <a href="{href}">): values are escaped, the result is trusted HTML. */
export function tHtml(t, key, vars = {}) {
  const safe = {}; for (const [k, v] of Object.entries(vars)) safe[k] = typeof v === 'number' ? v : v instanceof Raw ? v.s : esc(v);
  return raw(t(key, safe));
}
/** English t(): the default for services called without a request (tests, scripts, admin). */
export const tEn = makeT(DEFAULT_LOCALE);
const tCache = new Map(CODES.map(c => [c, makeT(c)]));
export const tFor = code => tCache.get(code) || tEn;

/** Resolved raw messages for every key under the given prefixes (for the browser's <script id="i18n">). */
export function clientStrings(code, prefixes = []) {
  const out = {};
  const en = dicts.get(DEFAULT_LOCALE) || {};
  for (const key of Object.keys(en)) {
    if (!prefixes.some(p => key === p || key.startsWith(p + '.'))) continue;
    out[key] = lookup(code, key);
  }
  return out;
}

// ---------------------------------------------------------------- choosing a language
/** Best supported locale for an Accept-Language header, or null. */
export function negotiate(header) {
  if (!header || typeof header !== 'string') return null;
  const tags = header.split(',').slice(0, 30).map((part, i) => {
    const [tag, ...params] = part.trim().split(';');
    const qp = params.map(p => p.trim()).find(p => p.startsWith('q='));
    const qv = qp ? parseFloat(qp.slice(2)) : 1;
    return { tag: tag.trim(), q: Number.isFinite(qv) ? qv : 0, i };
  }).filter(x => x.tag && x.tag !== '*' && x.q > 0).sort((a, b) => b.q - a.q || a.i - b.i);
  for (const { tag } of tags) { const m = matchTag(tag); if (m) return m; }
  return null;
}
const COMMONWEALTH = new Set(['gb', 'uk', 'ie', 'au', 'nz', 'za', 'in', 'sg', 'mt', 'hk']);
/** One BCP 47 tag -> a supported code, or null. */
export function matchTag(tag) {
  const lower = String(tag).toLowerCase().replace(/_/g, '-');
  const exact = normalizeCode(lower); if (exact) return exact;
  const [lang, ...rest] = lower.split('-');
  if (lang === 'en') return rest.some(r => COMMONWEALTH.has(r)) ? 'en-GB' : 'en';
  if (lang === 'zh') {
    if (rest.includes('hant') || rest.some(r => ['tw', 'hk', 'mo'].includes(r))) return 'zh-Hant';
    return null; // Simplified Chinese is not offered yet: try the reader's next language instead
  }
  if (lang === 'iw') return 'he';
  if (lang === 'nb' || lang === 'no') return null;
  return normalizeCode(lang);
}
/** -> { locale, source: 'query'|'path'|'cookie'|'user'|'header'|'default' }. path: the language of a /<code>/… address
 *  (server/seo.js pathLocale), which says what that page is in, whatever the visitor chose before. */
export function pickLocale({ query = null, path = null, cookie = null, user = null, acceptLanguage = null } = {}) {
  const fromQuery = normalizeCode(query); if (fromQuery) return { locale: fromQuery, source: 'query' };
  const fromPath = normalizeCode(path); if (fromPath) return { locale: fromPath, source: 'path' };
  const fromCookie = normalizeCode(cookie); if (fromCookie) return { locale: fromCookie, source: 'cookie' };
  const fromUser = normalizeCode(user && user.lang); if (fromUser) return { locale: fromUser, source: 'user' };
  const fromHeader = negotiate(acceptLanguage); if (fromHeader && availableCodes().includes(fromHeader)) return { locale: fromHeader, source: 'header' };
  return { locale: DEFAULT_LOCALE, source: 'default' };
}

// ---------------------------------------------------------------- formatting
const fmtCache = new Map();
/** Intl helpers for one locale. */
export function fmt(code) {
  code = BY_CODE.has(code) ? code : DEFAULT_LOCALE;
  let f = fmtCache.get(code); if (f) return f;
  const tag = localeInfo(code).intl;
  const num = new Intl.NumberFormat(tag);
  const compact = new Intl.NumberFormat(tag, { notation: 'compact', maximumFractionDigits: 1 });
  const money = new Intl.NumberFormat(tag, { style: 'currency', currency: 'USD' });
  const rel = new Intl.RelativeTimeFormat(tag, { numeric: 'auto' });
  const t = tFor(code);
  f = {
    locale: code, intl: tag,
    /** 1234 -> "1.2K" (compact, for play counts and likes) */
    num: n => compact.format(+n || 0),
    /** 1234 -> "1,234" */
    int: n => num.format(+n || 0),
    /** cents -> "$12.34" in the locale's style */
    money: cents => money.format((+cents || 0) / 100),
    /** a real timestamp -> "Oct 24, 2026" (in the server's zone) */
    date: (t0, opts = { month: 'short', day: 'numeric', year: 'numeric' }) => new Date(t0).toLocaleDateString(tag, opts),
    /** a stored calendar day (00:00 UTC) -> the same date whatever zone the server runs in (lesson opens / due dates) */
    day: (t0, opts = { month: 'short', day: 'numeric', year: 'numeric' }) => new Date(t0).toLocaleDateString(tag, { ...opts, timeZone: 'UTC' }),
    /** ms timestamp -> "5 minutes ago" */
    ago: t0 => {
      const s = Math.max(1, Math.round((Date.now() - t0) / 1000));
      if (s < 60) return t('time.justNow');
      const m = Math.round(s / 60); if (m < 60) return rel.format(-m, 'minute');
      const h = Math.round(m / 60); if (h < 24) return rel.format(-h, 'hour');
      const d = Math.round(h / 24); if (d < 30) return rel.format(-d, 'day');
      return f.date(t0);
    },
  };
  fmtCache.set(code, f);
  return f;
}

// ---------------------------------------------------------------- per-request middleware
export const COOKIE = 'lang';
const ONE_YEAR = 365 * 86400;
export function readCookie(req, name) {
  const h = req.headers.cookie; if (!h) return null;
  for (const part of h.split(';')) { const i = part.indexOf('='); if (i > 0 && part.slice(0, i).trim() === name) { try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return null; } } }
  return null;
}
export function setLangCookie(res, code) {
  const secure = config.env === 'production' ? '; Secure' : '';
  res.append('Set-Cookie', `${COOKIE}=${encodeURIComponent(code)}; Path=/; Max-Age=${ONE_YEAR}; SameSite=Lax${secure}`);
}
/** Save a signed-in user's choice (guests too: their row carries over when they make an account). */
export function saveUserLang(user, code) {
  if (!user || !normalizeCode(code) || user.lang === code) return;
  q.run('UPDATE users SET lang=? WHERE id=?', code, user.id);
  user.lang = code;
}
/** A request's path, always starting with exactly one '/': URL parsing turns '/.//evil.com' into '//evil.com', which a
 *  browser would read as another site. */
export const localPath = u => '/' + u.pathname.replace(/^\/+/, '');
/** The same URL without ?<name>= (for the redirect after a choice). */
export function withoutParam(originalUrl, name) {
  const u = new URL(originalUrl, 'http://x');
  u.searchParams.delete(name);
  return localPath(u) + (u.searchParams.toString() ? '?' + u.searchParams : '');
}
export const withoutLang = originalUrl => withoutParam(originalUrl, 'lang');
/** Settings picked with a plain GET link (?lang=, ?theme=) are not guarded by csrfCheck, so they are only SAVED for a
 *  same-origin or direct request: a cross-site link can't silently change a signed-in user's settings. */
export function sameOrigin(req) {
  const site = req.headers['sec-fetch-site']; const origin = req.headers.origin;
  if (site) return site === 'same-origin' || site === 'none';
  if (origin && origin !== 'null') return isOwnOrigin(req, origin);
  return true;
}
/** A GET for a page (not an API call or a game frame): these redirect after a ?lang= or ?theme= choice. */
export const isPageGet = req => req.method === 'GET' && !req.path.startsWith('/api/') && !req.path.startsWith('/frame/');
/**
 * Runs after the session middleware. Sets req.locale, req.dir, req.t, req.fmt and res.locals.t.
 * A GET page with a valid ?lang= stores the choice (cookie for a year + the signed-in account) and redirects to the
 * same page without the parameter, so links stay clean and the picker works with no JavaScript at all.
 */
export function middleware(req, res, next) {
  const query = typeof req.query.lang === 'string' ? req.query.lang : null;
  // req.ignoreAcceptLanguage: a search-engine robot (server/seo.js pathLocale) gets each address in its own language.
  const picked = pickLocale({ query, path: req.pathLocale, cookie: readCookie(req, COOKIE), user: req.user, acceptLanguage: req.ignoreAcceptLanguage ? null : req.headers['accept-language'] });
  const code = picked.locale;
  req.locale = code; req.localeSource = picked.source; req.dir = localeInfo(code).dir; req.t = tFor(code); req.fmt = fmt(code);
  res.locals.t = req.t; res.locals.locale = code;
  res.vary('Accept-Language'); res.vary('Cookie');
  res.set('Content-Language', code);
  if (picked.source === 'query') {
    // The language picker is a plain GET (works without JS): see sameOrigin() for why only some requests save it.
    if (sameOrigin(req)) { setLangCookie(res, code); saveUserLang(req.user, code); }
    if (isPageGet(req)) return res.redirect(303, withoutLang(req.originalUrl));
  }
  // anon: a signed-out visitor (search engines are one). Shared view helpers leave children's names out for them.
  als.run({ t: req.t, fmt: req.fmt, locale: code, anon: !req.user }, next);
}
/** t for a request, even one that failed before the middleware ran. */
export const tReq = req => (req && req.t) || tEn;

// The request's t/fmt for shared view helpers (server/views/components.js) that are called without req.
// Outside a request (tests, scripts) this is English.
const als = new AsyncLocalStorage();
export const current = () => als.getStore() || { t: tEn, fmt: fmt(DEFAULT_LOCALE), locale: DEFAULT_LOCALE };
/** Run fn with a locale as the "current" one (tests and background jobs). */
export const withLocale = (code, fn) => { const c = normalizeCode(code) || DEFAULT_LOCALE; return als.run({ t: tFor(c), fmt: fmt(c), locale: c }, fn); };
