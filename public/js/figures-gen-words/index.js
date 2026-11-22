// The words of the Figures question generators in every site language (docs/decisions.md "Figures opens to all
// teachers"). public/js/figures-catalog.js holds each generator in US English: its question (q), worked lines (work),
// multiple choice options (choices), a unit in words (unit) and the few words drawn in its figure (labels in fig). Each
// language file here holds the same, keyed by generator id:
//   { q, work: [...], choices?: [...], unit?, fig?: { "English label": "label" } }
// Rules (tests/unit/figures-gen-words.test.js): every generator in every language (en-GB lists only what differs from
// US English); the placeholders ({a}, {=expr}, {choice}) exactly as in English, line by line; as many worked lines;
// options in the same order (the right option's index never changes); the same answers in every language.
// A worksheet, test or lesson set keeps the language it was made in (question_sets.lang) and deals in it; a question
// already saved keeps the words it was saved with. Only the server deals questions (services/figures.js generate), so
// the browser never loads these files.
import enGB from './en-GB.js';
import es from './es.js';
import fr from './fr.js';
import de from './de.js';
import it from './it.js';
import pt from './pt.js';
import nl from './nl.js';
import ru from './ru.js';
import ja from './ja.js';
import zhHant from './zh-Hant.js';
import ar from './ar.js';
import he from './he.js';

/** The tables by site language (English is the catalog itself). */
export const TABLES = Object.freeze({ 'en-GB': enGB, es, fr, de, it, pt, nl, ru, ja, 'zh-Hant': zhHant, ar, he });
/** Every language a question can be dealt in: English and the site's other 12. */
export const GEN_LANGS = Object.freeze(['en', ...Object.keys(TABLES)]);
/** A site language as a generator language (an unknown one is English). */
export const genLang = l => (GEN_LANGS.includes(l) ? l : 'en');

/** Each string of a figure's data that is one of the labels, in the language; everything else as it is. */
function relabel(o, labels) {
  if (typeof o === 'string') return Object.prototype.hasOwnProperty.call(labels, o) ? labels[o] : o;
  if (Array.isArray(o)) return o.map(x => relabel(x, labels));
  if (o && typeof o === 'object') return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, k === 'kind' ? v : relabel(v, labels)]));
  return o;
}
/** A generator in a language: the catalog's generator (g, with its id) with that language's words; English, or a
 *  generator the language has no words for, as it is. Everything else (vars, where, answer, dp, key, pick) is the
 *  same, so the numbers and the answers are the same in every language. */
export function localGen(g, lang) {
  const L = genLang(lang);
  const w = g && L !== 'en' ? (TABLES[L] || {})[g.id] : null;
  if (!w) return g;
  const out = { ...g };
  if (typeof w.q === 'string') out.q = w.q;
  if (Array.isArray(w.work)) out.work = w.work.slice();
  if (Array.isArray(w.choices) && Array.isArray(g.choices)) out.choices = w.choices.slice();
  if (typeof w.unit === 'string') out.unit = w.unit;
  if (w.fig && typeof w.fig === 'object') out.fig = relabel(g.fig, w.fig);
  return out;
}
/** The languages whose figure for this generator differs from the English one (they translate a label in it). */
export const labelLangs = id => GEN_LANGS.filter(l => l !== 'en' && TABLES[l][id] && TABLES[l][id].fig);
/** Is this list of options a choice generator's own, in any language? */
export function isGenChoices(g, list) {
  if (!g || !Array.isArray(g.choices) || !Array.isArray(list)) return false;
  const same = a => a.length === list.length && a.every((x, i) => x === list[i]);
  return same(g.choices) || GEN_LANGS.some(l => l !== 'en' && same(localGen(g, l).choices));
}
