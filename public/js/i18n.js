// Client-side t(). The server embeds the strings this page needs, already resolved for the reader's language
// (with English fallback), as <script type="application/json" id="i18n">{ lang, dir, intl, strings }</script>.
//   import { t, LANG, DIR, fmtNum, timeAgo } from '/js/i18n.js';
//   t('js.app.playing', { n: fmtNum(3) })   (keys: js.app.* on every page, js.<module>.* for /js/<module>.js)
import { format } from '/js/i18n-format.js';

let data = { lang: 'en', dir: 'ltr', intl: 'en-US', strings: {} };
try { const el = document.getElementById('i18n'); if (el) data = { ...data, ...JSON.parse(el.textContent) }; } catch { /* keep English */ }

export const LANG = data.lang;
export const DIR = data.dir;
export const INTL = data.intl;
export const RTL = DIR === 'rtl';
/** Translate a key. Unknown keys come back as the key, so a missing string is easy to spot. */
export function t(key, vars) {
  const msg = data.strings[key];
  return msg === undefined ? key : format(msg, vars, INTL);
}
const compact = new Intl.NumberFormat(INTL, { notation: 'compact', maximumFractionDigits: 1 });
/** 1234 -> "1.2K" in the reader's language. */
export const fmtNum = n => compact.format(+n || 0);
const rel = new Intl.RelativeTimeFormat(INTL, { numeric: 'auto' });
/** ms timestamp -> "5 minutes ago". */
export function timeAgo(t0) {
  const s = Math.max(1, Math.round((Date.now() - t0) / 1000));
  if (s < 60) return t('js.app.justNow');
  const m = Math.round(s / 60); if (m < 60) return rel.format(-m, 'minute');
  const h = Math.round(m / 60); if (h < 24) return rel.format(-h, 'hour');
  return rel.format(-Math.round(h / 24), 'day');
}
