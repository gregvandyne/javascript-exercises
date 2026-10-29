// Text for games and kit chrome: t(), plurals (Intl.PluralRules), numbers (Intl.NumberFormat), RTL, and splitting text
// for the typewriter (Intl.Segmenter: by word for Arabic/Hebrew, by grapheme elsewhere).
import { chromeStrings, LANGS } from './strings.js';

const RTL = new Set(['ar', 'he', 'fa', 'ur']);
export const dirOf = lang => (RTL.has(String(lang).split('-')[0]) ? 'rtl' : 'ltr');
/** 'pt-BR' -> 'pt', 'zh-TW' -> 'zh-Hant', 'en-GB' stays: the nearest of the 13 site languages, else 'en'. */
export function normLang(lang) {
  const l = String(lang || 'en');
  if (LANGS.includes(l)) return l;
  const base = l.split('-')[0].toLowerCase();
  if (base === 'zh') return 'zh-Hant';
  return LANGS.includes(base) ? base : 'en';
}

export class I18n {
  constructor(lang = 'en') {
    this.tables = chromeStrings();
    this.setLang(lang);
  }
  setLang(lang) {
    this.raw = String(lang || 'en'); this.lang = normLang(lang); this.dir = dirOf(this.lang);
    try { this.plural = new Intl.PluralRules(this.lang); } catch (e) { this.plural = { select: n => (n === 1 ? 'one' : 'other') }; }
    this._nf = {};
  }
  /** strings({en:{hi:'Hello {name}'}, fr:{hi:'Bonjour {name}'}}) adds a game's strings (merged over the kit's). */
  strings(table) {
    for (const lang in table || {}) { const L = normLang(lang) === lang ? lang : normLang(lang); this.tables[L] = Object.assign(this.tables[L] || {}, table[lang]); }
  }
  has(key) { return !!((this.tables[this.lang] || {})[key] || (this.tables.en || {})[key]); }
  /** t('sparksOf', {n:3, total:12}); a plural entry picks its form from vars.n. Missing key -> the key itself. */
  t(key, vars) {
    let s = (this.tables[this.lang] || {})[key];
    if (s == null && this.lang === 'en-GB') s = (this.tables.en || {})[key];
    if (s == null) s = (this.tables.en || {})[key];
    if (s == null) return String(key);
    if (typeof s === 'object') { const n = vars && +vars.n; const form = isFinite(n) ? this.plural.select(n) : 'other'; s = s[form] != null ? s[form] : s.other != null ? s.other : ''; }
    return vars ? String(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] == null ? m : typeof vars[k] === 'number' ? this.num(vars[k]) : String(vars[k]))) : String(s);
  }
  num(n, opts) {
    const key = opts ? JSON.stringify(opts) : '';
    let f = this._nf[key];
    if (!f) { try { f = new Intl.NumberFormat(this.lang, opts); } catch (e) { f = { format: x => String(x) }; } this._nf[key] = f; }
    return f.format(n);
  }
  /** Units the typewriter reveals one at a time: words for ar/he, graphemes elsewhere (never splits a cluster). */
  units(text) { return splitUnits(text, this.lang); }
}
export function splitUnits(text, lang) {
  const s = String(text);
  const byWord = lang === 'ar' || lang === 'he';
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    try {
      const seg = new Intl.Segmenter(lang, { granularity: byWord ? 'word' : 'grapheme' });
      const out = []; for (const x of seg.segment(s)) out.push(x.segment); return out;
    } catch (e) { /* fall through */ }
  }
  return byWord ? s.split(/(\s+)/).filter(Boolean) : Array.from(s);
}
