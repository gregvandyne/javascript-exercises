// Grammar Lab in the site's lists (docs/decisions.md "Grammar Lab listed everywhere"): the Learn page and the
// Words subject page, the teachers' Find on Oomba catalog (routes/game-shelf.js), site search (routes/discover.js) and
// the sitemap (routes/seo.js). One place says who sees it listed and what a search finds:
//   - listed only where Grammar Lab lets the visitor in (grammar-lab-access.js mayOpenGrammarLab): with GRAMMAR_LAB
//     off nowhere, for anyone; restricted (a list of testers), only for them and for students with assigned work;
//     with GRAMMAR_LAB_USERS=* for every visitor, signed out too. The sitemap and other pages that are the same for
//     everyone list it only while it is open to all (openToAll: mayOpenGrammarLab(null)).
//   - its subject tags (English, grammar, writing) and grades K-12, the same on every list;
//   - a search finds it by its own words (grammar, punctuation, commas, capital letters, nouns, verbs, writing...),
//     in English and in the page's language (grammarLab.listing.terms), and by any unit or topic title; a search that
//     names a unit or topic deep-links to the units that teach it (a student with assigned work: only theirs).
// The course text (unit and topic titles) stays English; the words around it are translated.
import * as GL from './grammar-lab.js';
import { mayOpenGrammarLab, reachOf, unitInReach } from './grammar-lab-access.js';

export const SLUG = GL.SLUG;
export const HREF = '/courses/grammar-lab';
export const COVER = '/covers/grammar-lab.jpg';
/** The Learn filters' subject (learn.js SUBJECTS 'words') and its grades: K (0) to 12. */
export const INFO = Object.freeze({ subject: 'words', from: 0, to: 12 });
/** What a search finds it by, in English (the course's own language). */
export const TERMS = Object.freeze(['grammar', 'grammar lab', 'punctuation', 'comma', 'commas', 'capital letters', 'capitalization', 'capitals', 'nouns', 'verbs',
  'adjectives', 'adverbs', 'pronouns', 'apostrophes', 'quotation marks', 'conjunctions', 'sentences', 'fragments', 'run-ons', 'parts of speech', 'writing',
  'proofreading', 'editing', 'english', 'ela', 'language arts', 'subject verb agreement', 'tenses', 'contractions', 'possessives', 'plurals', 'prepositions',
  'articles', 'modifiers', 'clauses', 'phrases', 'transitions', 'citations', 'thesis statements', 'topic sentences', 'evidence', 'dialogue', 'quotes',
  'homophones', 'sound-alike words', 'spelling', 'titles']);

/** Is Grammar Lab listed for this visitor (null: a visitor with no session)? */
export const listedFor = u => mayOpenGrammarLab(u || null);
/** Is it listed for everyone (the pages that are the same for every visitor: the sitemap)? */
export const listedForAll = () => mayOpenGrammarLab(null);

const fold = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}\s]+/gu, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'for', 'to', 'in', 'on', 'with', 'vs', 'practice', 'lesson', 'lessons', 'game', 'games', 'unit', 'units', 'topic', 'topics']);
const words = s => fold(s).split(' ').filter(w => w.length > 1 && !STOP.has(w));
// "commas" finds "comma", "capital letters" finds "Capitalizing ..." (a word's start, either way round)
const stem = w => (w.length > 4 ? w.replace(/(ies|es|s)$/, '') : w);
const hitWord = (w, hay) => hay.some(h => h.startsWith(stem(w)) || (h.length > 3 && w.startsWith(stem(h))));
/** Does every word of the query appear (from its start) in these words? */
const allIn = (q, hay) => q.length > 0 && q.every(w => hitWord(w, hay));

/** Grammar Lab's own search words in this language, and the English ones. */
function termsFor(t) {
  const own = t && t.own && t.own('grammarLab.listing.terms') ? String(t('grammarLab.listing.terms')).split(',') : [];
  return [...TERMS, ...own, 'Grammar Lab', t ? t('grammarLab.title') : ''].flatMap(words);
}
/** Does this search text find Grammar Lab: one of its own words (in English or this language), or two words or more
 *  that name a unit or a topic ("who whom", "identifying adjectives")? One word of a title alone is not enough: "math"
 *  or "space" is in a topic's title but is not a grammar search. */
export function matches(text, t = null, u = null) {
  const q = words(String(text || '').slice(0, 60));
  if (!q.length || q.join('').length < 3) return false;
  return allIn(q, termsFor(t)) || (q.length >= 2 && unitsFor(text, u, { t }).length > 0);
}

/** The units a search names, for deep links: a unit whose title fits first, then a unit with a topic whose title fits
 *  (named: topic). Only for a grammar search (matches), and only units this visitor reaches.
 *  -> [{ unit, band, grades, title, topic?, href }] */
export function unitsFor(text, u = null, { limit = 6, t = null } = {}) {
  const q = words(String(text || '').slice(0, 60));
  if (!q.length || q.join('').length < 3 || (q.length < 2 && !allIn(q, termsFor(t)))) return [];
  const reach = reachOf(u || null);
  const byUnit = [], byTopic = [];
  for (const b of GL.bands()) for (const p of GL.pathwaysOf(b.id)) {
    if (!p || !unitInReach(reach, p.id)) continue;
    const row = { unit: p.id, band: p.band, grades: b.grades, title: p.title, href: `${HREF}/${p.band}/${p.id}` };
    if (allIn(q, words(p.title))) { byUnit.push(row); continue; }
    const tp = p.topics.map(id => GL.topic(id)).find(x => x && allIn(q, words(x.title)));
    if (tp) byTopic.push({ ...row, topic: tp.title, href: `${row.href}#gl-topic-${tp.id}` });
  }
  return [...byUnit, ...byTopic].slice(0, limit);
}

/** The words a list's client-side filter matches against (routes/game-shelf.js data-q): its title, its tags, its
 *  search words in this language and English, and every unit title. */
export function filterText(t) {
  const units = new Set();
  for (const b of GL.bands()) for (const p of GL.pathwaysOf(b.id)) if (p) units.add(p.title);
  return fold([t('grammarLab.title'), t('grammarLab.listing.tags'), t.own && t.own('grammarLab.listing.terms') ? t('grammarLab.listing.terms') : '', ...TERMS, ...units].join(' '));
}
/** "English, grammar, writing · Grades K-12" in this language (the same line as a game card's "Subject · Grades"). */
export const metaLine = t => t('learn.tab.meta', { subject: t('grammarLab.listing.tags'), grades: t('grammarLab.band', { grades: 'K-12' }) });
