#!/usr/bin/env node
// Grammar Lab's data build: the course text (seed-lessons/grammar-lab/source/course.md, the reviewed course as written)
// plus Oomba's own grouping (pathways.json) and per-item notes (overrides.json) -> topics.json, the data the server
// reads (services/grammar-lab.js). topics.json is committed; tests/unit/grammar-lab.test.js checks it is what this
// script makes from the source, so a source edit without a rebuild fails the tests.
//   node scripts/grammar-lab-build.js           write topics.json
//   node scripts/grammar-lab-build.js --check   exit 1 when topics.json is out of date
//   node scripts/grammar-lab-build.js --options print every generated choice (for a spot check)
//
// The source's shape: "# ..." band sections (K-2, Grades 3-5, ...), "## Pathway N: Title" units, "### Topic: Title"
// (or "### 8.5 Title") topics. A topic written in full has a "**Teaching Card**" (or "Teaching card:") list of
// Definition, Worked example, How it works and Tip box, then a "**Quiz**" of numbered items:
//   1. "The round ball rolled down the hill." Answer: round. Hint: Look for the word that tells what shape the ball is.
// A topic that only says "See X above" is a cross-reference to the full one. File header and summary lines are never
// shipped: only the topics pathways.json names are built.
//
// Formats (a topic's "format" in pathways.json; the build prompt's list, nothing invented):
//   tap     highlight-the-word: tap the word the line asks for. The answer is stored as word places in the shared cut
//           (services/grammar-lab-text.js).
//   capfix  click-to-fix capitalization: the sentence as written has a word that needs a capital; tap it. The answer is
//           its word places, and fixed the word as it should be written.
//   gaps    punctuation: tap the gap (between two words) where a comma goes. The answer is the gaps a comma must go in;
//           optional the gaps where one may go or not (a list's last comma, before "and": any valid fix is accepted).
//   choice  binary or pill choice (your / you're), whole-title choice and pick-the-correct-version: the item's
//           options, one or more of them right. Answer-only items get their wrong options here, by fixed grammar rules
//           (the other word of a pair, a missing capital, a comma in the wrong place, the wrong tense form), never by
//           chance and never by AI; every wrong option is checked to be wrong by a second, independent rule.
//           kind 'pair'   a blank, filled from a word pair ("your" / "you're"); the other word is the wrong option
//           kind 'title'  a blank holding a title (shown in italics, never in quotes): the right capitals and two
//                         titles each missing capitals the rules call for
//           kind 'comma'  the whole sentence: the comma after the starting phrase, and the same sentence with the comma
//                         in a wrong place (one word early, one word late). The sentence with no comma is not offered:
//                         a comma after a short starting phrase is accepted with or without (content review)
//           kind 'tense'  a blank with its base verb in parentheses (a K-2 open blank becomes a choice): the right form
//                         for the time word (today, yesterday, will), and the two other forms of the same verb
// No option is ever pre-selected: the page opens every question with nothing chosen and Submit off.
//
// Mistake Hunt rooms (phase0.md): a topic whose pathways.json entry has room.kinds gets a passage built from its own
// right sentences, planted at build time by Mistake Hunt's own planter (seed-games/mistake-hunt.html proof-core, read
// through server/services/proof-core.js) with only those kinds and a fixed seed. A room that cannot plant 3 mistakes
// fails the build.
//
// The build fails loudly on: an item it cannot place, an answer that is not in its sentence exactly once, a hint that
// names its answer (and not the other choices with it), a generated wrong option that is also right, an em or en dash
// anywhere, and the reference product's names or coinages.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { tokenize, findWords, hasWord, norm } from '../server/services/grammar-lab-text.js';
import { proofCore } from '../server/services/proof-core.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DIR = path.join(ROOT, 'seed-lessons/grammar-lab');
export const OUT = path.join(DIR, 'topics.json');
const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'));

/** Words the content must never carry: the reference product and its coinages. */
const BANNED = /\b(no ?red ?ink|thamos?|swabis?)\b/i;
const DASHES = /[\u2013\u2014]/;
const BAND_OF = heading => {
  const m = /\b(K-2|3-5|6-8|9-12)\b/.exec(heading);
  return m ? m[1].toLowerCase() : null;
};
const unquote = s => String(s).trim().replace(/^["“]|["”]$/g, '');
const cap = w => w.charAt(0).toUpperCase() + w.slice(1);
/** A number from a text, the same every time (orders options and seeds rooms). */
const hashInt = s => crypto.createHash('sha256').update(String(s)).digest().readUInt32BE(0);
/** A seeded shuffle that is the same on every build. */
function seededShuffle(list, seed) {
  const a = list.slice();
  let h = crypto.createHash('sha256').update(String(seed)).digest(), k = 0;
  for (let i = a.length - 1; i > 0; i--) {
    if (k + 2 > h.length) { h = crypto.createHash('sha256').update(h).digest(); k = 0; }
    const j = ((h[k] << 8) | h[k + 1]) % (i + 1); k += 2;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const words = text => tokenize(text).map(w => w.t);
const joinTokens = toks => toks.map(w => w.pre + w.t + w.post).join(' ');

// ------------------------------------------------------------------------------------------------- parsing
/** The course text -> [{ band, heading, pathways: [{ title, topics: [{ title, line, ref, cardLines, quizLines }] }] }]. */
export function parseCourse(md) {
  const sections = [];
  let sec = null, pw = null, topic = null, mode = null;
  const lines = String(md).split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    let m;
    if ((m = /^# (.+)$/.exec(line))) {
      const band = BAND_OF(m[1]);
      sec = band ? { band, heading: m[1], pathways: [] } : null;
      if (sec) sections.push(sec);
      pw = null; topic = null; mode = null;
      return;
    }
    if (!sec) return;
    if ((m = /^## (?:Pathway \d+: )?(.+?)(?: \(\d+ topics?\))?$/.exec(line))) {
      pw = { title: m[1].trim(), topics: [] }; sec.pathways.push(pw); topic = null; mode = null;
      return;
    }
    if ((m = /^### (?:Topic: |\d+\.\d+ )(.+)$/.exec(line))) {
      if (!pw) { pw = { title: '', topics: [] }; sec.pathways.push(pw); }
      topic = { title: m[1].trim(), line: i + 1, ref: null, cardLines: [], quizLines: [] }; pw.topics.push(topic); mode = null;
      return;
    }
    if (!topic) return;
    if (/^(\*\*Teaching Card\*\*|Teaching card:)\s*$/i.test(line.trim())) { mode = 'card'; return; }
    if (/^(\*\*Quiz\*\*|Quiz:)\s*$/i.test(line.trim())) { mode = 'quiz'; return; }
    if (!mode && /\bSee\b.+\babove\b/.test(line)) { topic.ref = line.trim(); return; }
    if (mode === 'card' && /^- /.test(line)) topic.cardLines.push({ text: line.slice(2).trim(), line: i + 1 });
    if (mode === 'quiz' && /^\d+\. /.test(line)) topic.quizLines.push({ text: line.trim(), line: i + 1 });
  });
  return sections;
}

/** The topic written in full with this title in this band (cross-references skipped), or null. */
export function findTopic(sections, band, title) {
  for (const s of sections.filter(x => x.band === band)) {
    for (const p of s.pathways) for (const t of p.topics) if (t.title === title && t.cardLines.length && t.quizLines.length) return t;
  }
  return null;
}
/** Every place in the band that names this topic, written in full or as a "See ... above" cross-reference. */
export function slotsOf(sections, band, title) {
  const out = [];
  for (const s of sections.filter(x => x.band === band)) for (const p of s.pathways) for (const t of p.topics) if (t.title === title) out.push({ pathway: p.title, full: !!(t.cardLines.length && t.quizLines.length), ref: t.ref });
  return out;
}

/** "Fluffy is the adjective. Kitten is the noun it tells about." -> [{ word, role }] ("Dog is a noun." too). Tense
 *  cards: "Walks is now. Will walk is later." -> the verb. */
function rolesIn(text) {
  const out = [];
  for (const m of String(text).matchAll(/(?:^|[.!?]\s+)([\p{L}'-]+) is (?:the|a|an) (adjective|noun|verb|adverb|pronoun|subject|article|conjunction|preposition)\b/gu)) out.push({ word: m[1], role: m[2] });
  for (const m of String(text).matchAll(/(?:^|[.!?]\s+)((?:[Ww]ill )?[\p{L}'-]+) is (?:now|past|later)\b/gu)) out.push({ word: m[1], role: 'verb' });
  return out;
}

/** Example text as written ('lead "quote" note "quote" note ...') -> units: [{ lead?, text, note, then?: { text, note } }].
 *  A plain bit that does not end a sentence leads into the next quote: inside a unit ("The title is" "X") it is the
 *  unit's note and the next quote its then; after a unit's then it leads the next unit. */
export function unitsOf(raw) {
  const bits = String(raw || '').split(/"([^"]+)"/);
  const units = [];
  let lead = bits[0].trim(), open = null;
  for (let i = 1; i < bits.length; i += 2) {
    const q = bits[i], after = (bits[i + 1] || '').trim();
    let u;
    if (open) { open.then = { text: q, note: '' }; u = open; open = null; }
    else { u = { ...(lead ? { lead } : {}), text: q, note: '' }; units.push(u); lead = ''; }
    if (!after) continue;
    if (/[.!?]$/.test(after)) { if (u.then) u.then.note = after; else u.note = after; }
    else if (u.then) lead = after;
    else { u.note = after; open = u; }
  }
  return units;
}

/** Word places (in the first text's cut) where two versions of a sentence differ by capitals only. */
function capitalDiff(a, b) {
  const A = tokenize(a), Bt = tokenize(b);
  if (A.length !== Bt.length) return null;
  const out = [];
  for (let i = 0; i < A.length; i++) {
    if (norm(A[i].t) !== norm(Bt[i].t) || A[i].pre !== Bt[i].pre || A[i].post !== Bt[i].post) return null;
    if (A[i].t !== Bt[i].t) out.push(i);
  }
  return out;
}
/** Gaps (after word i) where the second version adds a comma the first lacks; null when they differ otherwise. */
function commaDiff(a, b) {
  const A = tokenize(a), Bt = tokenize(b);
  if (A.length !== Bt.length) return null;
  const out = [];
  for (let i = 0; i < A.length; i++) {
    if (A[i].t !== Bt[i].t || A[i].pre !== Bt[i].pre) return null;
    if (A[i].post === Bt[i].post) continue;
    if (Bt[i].post === `,${A[i].post}` && i < A.length - 1) out.push(i); else return null;
  }
  return out;
}

/** The teaching card lines -> { definition, example: unit + { marks, more }, how, tips: [unit + { marks }] }. */
export function parseCard(cardLines, problems, where, format = 'tap', pair = null) {
  const field = name => {
    const l = cardLines.find(x => x.text.toLowerCase().startsWith(name.toLowerCase() + ':'));
    return l ? l.text.slice(name.length + 1).trim() : '';
  };
  const definition = field('Definition'), worked = field('Worked example'), how = field('How it works'), tip = field('Tip box');
  for (const [k, v] of [['Definition', definition], ['Worked example', worked], ['How it works', how], ['Tip box', tip]]) if (!v) problems.push(`${where}: the teaching card has no ${k}`);
  const units = unitsOf(worked);
  let example = null;
  if (!units.length) problems.push(`${where}: the worked example has no quoted sentence`);
  else {
    const [first, ...more] = units;
    example = { ...first, marks: [] };
    if (more.length) example.more = more.map(u => ({ ...u, marks: [] }));
    if (format === 'tap' || format === 'choice') {
      const notes = [first.note, first.then && first.then.note].filter(Boolean).join(' ');
      const tokens = tokenize(first.text);
      example.marks = rolesIn(notes).flatMap(r => {
        const at = findWords(tokens, r.word);
        if (at.length !== 1) { if (format === 'tap') problems.push(`${where}: the worked example's ${r.role} "${r.word}" is in its sentence ${at.length} times`); return []; }
        return at[0].map(i => ({ i, role: r.role }));
      });
      if (format === 'tap' && !example.marks.length) problems.push(`${where}: the worked example names no word's job ("X is the adjective.")`);
    }
    if (format === 'capfix' || format === 'gaps' || format === 'choice') {
      // A fix example: "wrong" ... "right". The words that changed are marked in both.
      const pairs = [example, ...(example.more || [])].filter(u => u.then);
      for (const u of pairs) {
        const c = capitalDiff(u.text, u.then.text), g = commaDiff(u.text, u.then.text);
        if (c && c.length) { u.marks = c.map(i => ({ i, role: 'capital' })); u.then.marks = c.map(i => ({ i, role: 'capital' })); }
        else if (g && g.length) { u.then.marks = g.map(i => ({ i, role: 'comma' })); }
      }
      if ((format === 'capfix' || format === 'gaps') && !pairs.some(u => u.then && u.then.marks)) problems.push(`${where}: the worked example has no "before" and "after" sentences that differ by a capital or a comma`);
    }
  }
  // A word pair (your / you're): the pair's words are marked wherever the examples use them.
  const pairMarks = u => (pair ? tokenize(u.text).flatMap((w, i) => (pair.some(x => norm(x) === norm(w.t)) ? [{ i, role: 'key' }] : [])) : []);
  if (example && pair) for (const u of [example, ...(example.more || [])]) u.marks = pairMarks(u);
  const roles = example ? example.marks.map(m => m.role) : [];
  const tips = unitsOf(tip).map(u => {
    const tokens = tokenize(u.text), marks = [];
    if (format === 'tap') {
      // "The yellow bus." Yellow tells about bus: the words of the note that are in the example once.
      const inNote = tokenize(u.note).map(x => x.t).filter(w => findWords(tokens, w).length === 1);
      if (inNote.length) marks.push({ i: findWords(tokens, inNote[0])[0][0], role: roles[0] || 'key' });
      if (inNote.length > 1 && roles[1]) marks.push({ i: findWords(tokens, inNote[inNote.length - 1])[0][0], role: roles[1] });
    } else if (format === 'capfix') {
      // "Today is monday." Monday starts with a big letter: the word written with a small letter that the note capitalizes.
      for (const w of tokenize(u.note)) for (const [i] of findWords(tokens, w.t)) if (/^\p{Lu}/u.test(w.t) && tokens[i].t !== w.t && !marks.some(m => m.i === i)) marks.push({ i, role: 'capital' });
    }
    if (pair) marks.push(...pairMarks(u));
    const out = { ...u, marks };
    if (u.then) {
      const c = capitalDiff(u.text, u.then.text), g = commaDiff(u.text, u.then.text);
      out.then = { ...u.then, marks: c && c.length ? c.map(i => ({ i, role: 'capital' })) : g && g.length ? g.map(i => ({ i, role: 'comma' })) : [] };
    }
    return out;
  });
  if (tip && !tips.length) problems.push(`${where}: the tip box has no quoted example`);
  return { definition, example, how, tips };
}

// ------------------------------------------------------------------------------------------------- the rules for wrong options
/** Small words a title keeps lowercase unless first or last (the card's "big words" are every other word). */
export const SMALL_WORDS = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'so', 'yet', 'at', 'by', 'in', 'of', 'on', 'to', 'up', 'as', 'off', 'per', 'via']);
/** A title as the rules write it: the first and last words and every big word start with a capital. */
export function titleCase(title) {
  const w = String(title).split(' ');
  return w.map((x, i) => {
    const low = x.toLowerCase();
    return i === 0 || i === w.length - 1 || !SMALL_WORDS.has(low.replace(/[^a-z]/g, '')) ? cap(low) : low;
  }).join(' ');
}
/** Wrong capitalizations of a right title, each missing a capital the rules call for: all small letters, the first word
 *  only, and the right title missing one big word's capital (the first big word after the first word, else the last). */
export function wrongTitles(right) {
  const w = right.split(' ');
  const out = [right.toLowerCase(), w.map((x, i) => (i ? x.toLowerCase() : x)).join(' ')];
  const big = w.findIndex((x, i) => i > 0 && i < w.length - 1 && /^\p{Lu}/u.test(x));
  const k = big > 0 ? big : w.length - 1;
  if (k > 0) out.push(w.map((x, i) => (i === k ? x.toLowerCase() : x)).join(' '));
  return [...new Set(out)].filter(x => x !== right);
}

// Verb forms: present (he, she, it, a name), past, and the base form (after will, and the present after I, you, we,
// they). Irregular pasts by hand; a regular past that Mistake Hunt's own word list calls a made-up form ("drawed") fails
// the build, so a missing irregular verb can never slip in as "right".
const IRREGULAR_PAST = Object.freeze({ draw: 'drew', fly: 'flew', eat: 'ate', sing: 'sang', ride: 'rode', run: 'ran', swim: 'swam',
  go: 'went', see: 'saw', make: 'made', take: 'took', give: 'gave', write: 'wrote', drive: 'drove', come: 'came', sit: 'sat',
  get: 'got', read: 'read', build: 'built', find: 'found', tell: 'told', throw: 'threw', grow: 'grew', know: 'knew', blow: 'blew',
  dig: 'dug', hide: 'hid', bring: 'brought', catch: 'caught', buy: 'bought', think: 'thought', teach: 'taught', sleep: 'slept',
  keep: 'kept', feel: 'felt', hold: 'held', win: 'won', fall: 'fell', break: 'broke', wake: 'woke', drink: 'drank', swing: 'swung' });
const MADE_UP_PASTS = new Set(['runned', 'goed', 'eated', 'catched', 'bringed', 'thinked', 'teached', 'swimmed', 'beginned', 'comed', 'builded',
  'finded', 'telled', 'sitted', 'hided', 'freezed', 'drawed', 'throwed', 'growed', 'knowed', 'flyed', 'blowed', 'writed', 'rided', 'drived',
  'gived', 'taked', 'maked', 'keeped', 'sleeped', 'digged', 'standed', 'buyed', 'fighted', 'selled', 'feeled', 'holded', 'speaked', 'breaked',
  'choosed', 'waked', 'shaked', 'falled', 'forgetted', 'winned', 'becomed', 'meaned', 'sended', 'spended', 'drinked', 'sinked', 'heared', 'singed', 'seed']);
const VOWEL = /[aeiou]/;
export function presentOf(base) {
  if (/(s|sh|ch|x|z|o)$/.test(base)) return `${base}es`;
  if (/[^aeiou]y$/.test(base)) return `${base.slice(0, -1)}ies`;
  return `${base}s`;
}
export function pastOf(base) {
  if (IRREGULAR_PAST[base]) return IRREGULAR_PAST[base];
  if (/e$/.test(base)) return `${base}d`;
  if (/[^aeiou]y$/.test(base)) return `${base.slice(0, -1)}ied`;
  // one short vowel between two consonants at the end of a one-beat word doubles (hop, hopped)
  if (/^[^aeiou]*[aeiou][^aeiouwxy]$/.test(base) && base.length <= 4) return `${base}${base.slice(-1)}ed`;
  return `${base}ed`;
}
const PLURAL_SUBJECTS = new Set(['i', 'you', 'we', 'they']);
/** The time a tense blank asks for, from its sentence: 'present' | 'past' | 'future' | null. */
function timeOf(before) {
  const w = words(before).map(x => x.toLowerCase());
  if (w[w.length - 1] === 'will') return 'future';
  if (w.includes('today') || w.includes('now')) return 'present';
  if (w.includes('yesterday')) return 'past';
  return null;
}

// ------------------------------------------------------------------------------------------------- the formats
const QUOTED_ITEM = /^(\d+)\.\s+"(.+?)"\s+Answer:\s+(.+?)\.\s+Hint:\s+(.+)$/;
/** A hint may name the rule's words, but never single out the answer: naming the right choice is a leak unless the hint
 *  names every other choice too. */
function hintLeaks(hint, answer, others = []) {
  if (!hasWord(hint, answer)) return false;
  return !others.length || !others.every(o => hasWord(hint, o));
}

const FORMATS = {
  /** Tap the word: 1. "Sentence." Answer: word. Hint: ... -> { text, answer: [word places], hint }. */
  tap(line, problems, where) {
    const m = QUOTED_ITEM.exec(line.text);
    if (!m) { problems.push(`${where} line ${line.line}: not a tap item ("N. "Sentence." Answer: word. Hint: ...")`); return null; }
    const [, n, text, answer, hint] = m;
    const at = findWords(tokenize(text), unquote(answer));
    if (at.length !== 1) problems.push(`${where} item ${n}: the answer "${answer}" is in its sentence ${at.length} times, not once`);
    if (hintLeaks(hint, unquote(answer))) problems.push(`${where} item ${n}: the hint names the answer "${answer}"`);
    return { n: +n, text, answer: at[0] || [], hint: hint.trim() };
  },
  /** Click-to-fix capitalization: 1. "My friend ana likes to draw." Answer: Ana. -> the places of the word written with a
   *  small letter, and the word as it should be written. */
  capfix(line, problems, where) {
    const m = QUOTED_ITEM.exec(line.text);
    if (!m) { problems.push(`${where} line ${line.line}: not a capitalization item ("N. "Sentence." Answer: Word. Hint: ...")`); return null; }
    const [, n, text, answerRaw, hint] = m;
    const answer = unquote(answerRaw), toks = tokenize(text);
    const at = findWords(toks, answer);
    if (at.length !== 1) { problems.push(`${where} item ${n}: the word "${answer}" is in its sentence ${at.length} times, not once`); return null; }
    const want = answer.split(/\s+/);
    if (at[0].every((i, k) => toks[i].t === want[k])) problems.push(`${where} item ${n}: "${answer}" is already written that way in the sentence`);
    if (!want.every(w => /^\p{Lu}/u.test(w))) problems.push(`${where} item ${n}: the fix "${answer}" does not start with a capital`);
    if (hintLeaks(hint, answer)) problems.push(`${where} item ${n}: the hint names the answer "${answer}"`);
    const fixedToks = toks.map((w, i) => (at[0].includes(i) ? { ...w, t: want[at[0].indexOf(i)] } : w));
    return { n: +n, text, answer: at[0], fixed: want, right: joinTokens(fixedToks), hint: hint.trim() };
  },
  /** Commas: 1. "We need milk eggs and bread." Answer: We need milk, eggs, and bread. -> the gaps a comma goes in. The
   *  last comma of a list (before "and" or "or") is optional: with or without it is a valid fix. */
  gaps(line, problems, where) {
    const m = QUOTED_ITEM.exec(line.text);
    if (!m) { problems.push(`${where} line ${line.line}: not a comma item ("N. "Sentence." Answer: Sentence. Hint: ...")`); return null; }
    const [, n, text, rightRaw, hint] = m;
    const right = /[.!?]$/.test(rightRaw.trim()) ? rightRaw.trim() : `${rightRaw.trim()}.`;
    const gaps = commaDiff(text, right);
    if (!gaps || !gaps.length) { problems.push(`${where} item ${n}: the answer is not the sentence with commas added`); return null; }
    const toks = tokenize(text);
    const optional = gaps.length > 1 ? gaps.filter(g => /^(and|or)$/i.test(toks[g + 1].t) && g === gaps[gaps.length - 1]) : [];
    const answer = gaps.filter(g => !optional.includes(g));
    if (/,/.test(hint) && hintLeaks(hint, right)) problems.push(`${where} item ${n}: the hint gives the answer`);
    return { n: +n, text, answer, optional, right, hint: hint.trim() };
  },
  /** A choice, by the topic's kind (see the head of this file). -> { text: before ___ after, options, answer: [right
   *  indexes], right (the whole right sentence), italic? }. */
  choice(line, problems, where, def) {
    const m = QUOTED_ITEM.exec(line.text);
    if (!m) { problems.push(`${where} line ${line.line}: not a choice item ("N. "Sentence." Answer: ... Hint: ...")`); return null; }
    const [, n, textRaw, answerRaw, hint] = m;
    const kind = def.choices && def.choices.kind;
    const at = `${where} item ${n}`;
    const answer = unquote(answerRaw);
    let before = '', after = '', right, wrong = [], options, whole = false, italic = false;
    if (kind === 'pair') {
      const pair = def.choices.pair;
      const b = /^(.*?)___(.*)$/.exec(textRaw);
      if (!b) { problems.push(`${at}: no blank (___) in the sentence`); return null; }
      [, before, after] = b;
      const start = !before.trim();
      const shown = pair.map(w => (start ? cap(w) : w));
      const k = pair.findIndex(w => norm(w) === norm(answer));
      if (k < 0) { problems.push(`${at}: the answer "${answer}" is not one of ${pair.join(' / ')}`); return null; }
      if (shown[k] !== answer) problems.push(`${at}: the answer "${answer}" should be written "${shown[k]}" there`);
      right = shown[k]; wrong = shown.filter((_, i) => i !== k);
      options = shown;   // a pair keeps its own order: your, you're
      if (hintLeaks(hint, right, wrong)) problems.push(`${at}: the hint names the answer "${right}" and not the other choice`);
    } else if (kind === 'title') {
      // "My favorite book is 'the brave little fox.'" -> before "My favorite book is ", the title, after "."
      const t = /^(.*?)'([^']+?)(\.?)'(.*)$/.exec(textRaw);
      if (!t) { problems.push(`${at}: no title in single quotes`); return null; }
      const [, b, title, dot, rest] = t;
      before = b; after = `${rest}${dot && !rest ? dot : ''}`;
      if (rest && dot) problems.push(`${at}: a period inside the title's quotes in the middle of the sentence`);
      if (norm(title) !== norm(answer)) { problems.push(`${at}: the answer "${answer}" is not the title "${title}" with capitals`); return null; }
      if (titleCase(answer) !== answer) problems.push(`${at}: the answer "${answer}" is not what the title rules make ("${titleCase(answer)}")`);
      right = answer; wrong = wrongTitles(answer).slice(0, 2); italic = true;
      if (wrong.length < 2) problems.push(`${at}: fewer than 2 wrong titles`);
      options = seededShuffle([right, ...wrong], `${where}|${n}`);
      if (hintLeaks(hint, right)) problems.push(`${at}: the hint names the answer`);
    } else if (kind === 'comma') {
      // The right sentence has one comma more, after the starting phrase; the wrong ones put it one word early or late.
      const fixed = /[.!?]$/.test(answer) ? answer : `${answer}.`;
      const g = commaDiff(textRaw, fixed);
      if (!g || g.length !== 1) { problems.push(`${at}: the answer is not the sentence with one comma added`); return null; }
      const toks = tokenize(textRaw), p = g[0];
      const withComma = gap => joinTokens(toks.map((w, i) => (i === gap ? { ...w, post: `,${w.post}` } : w)));
      right = withComma(p);
      const places = [p - 1, p + 1, p + 2].filter(x => x >= 0 && x < toks.length - 1 && x !== p).slice(0, 2);
      wrong = places.map(withComma);
      if (wrong.length < 2) problems.push(`${at}: fewer than 2 places for a wrong comma`);
      whole = true;
      options = seededShuffle([right, ...wrong], `${where}|${n}`);
      if (hintLeaks(hint, right)) problems.push(`${at}: the hint gives the answer`);
    } else if (kind === 'tense') {
      // "Yesterday, Ana ___ (draw) a picture." -> the right form for the time word, and the other two forms.
      const b = /^(.*?)___ \(([a-z]+)\)(.*)$/.exec(textRaw);
      if (!b) { problems.push(`${at}: no blank with its base verb in parentheses ("___ (draw)")`); return null; }
      const [, bf, base, af] = b;
      before = bf; after = af;
      const time = timeOf(before);
      if (!time) { problems.push(`${at}: no time word (today, yesterday, will) before the blank`); return null; }
      const past = pastOf(base), present = presentOf(base);
      if (MADE_UP_PASTS.has(past)) problems.push(`${at}: "${past}" is not a real past form of "${base}": add it to the irregular verbs`);
      const subject = words(before.replace(/^\s*(today|yesterday|tomorrow|now),?\s*/i, '')).filter(w => w.toLowerCase() !== 'will');
      const plural = subject.length === 1 && PLURAL_SUBJECTS.has(subject[0].toLowerCase());
      const forms = { present: plural ? base : present, past, future: base };
      right = forms[time];
      if (right !== answer) { problems.push(`${at}: the rules make "${right}" for ${time}, not the answer "${answer}"`); return null; }
      wrong = time === 'future' ? [present, past] : time === 'past' ? [present, base] : plural ? [present, past] : [past, base];
      options = seededShuffle([right, ...wrong], `${where}|${n}`);
      if (hintLeaks(hint, right)) problems.push(`${at}: the hint names the answer "${right}"`);
    } else { problems.push(`${where}: a choice topic needs choices.kind (pair, title, comma or tense)`); return null; }
    if (new Set(options).size !== options.length) problems.push(`${at}: two options read the same`);
    if (wrong.some(w => w === right)) problems.push(`${at}: a wrong option is the right one`);
    const full = whole ? right : `${before}${right}${after}`;
    return { n: +n, text: whole ? textRaw : `${before}___${after}`, options, answer: [options.indexOf(right)], right: full, hint: hint.trim(),
      ...(whole ? { whole: true } : {}), ...(italic ? { italic: true } : {}) };
  },
};

/** A second, independent look at every generated wrong option: is it really wrong by the topic's rule? -> problems. */
export function checkOptions(topic) {
  const problems = [];
  const kind = topic.choices && topic.choices.kind;
  for (const it of topic.items) {
    if (!it.options) continue;
    const at = `${it.id}`;
    const right = it.options[it.answer[0]];
    if (it.answer.length !== 1) problems.push(`${at}: a choice must have exactly one right option`);
    it.options.forEach((o, i) => {
      if (i === it.answer[0]) return;
      if (o === right) problems.push(`${at}: wrong option "${o}" is the right one`);
      if (kind === 'title' && titleCase(o) === o) problems.push(`${at}: wrong title "${o}" follows the title rules`);
      if (kind === 'pair' && norm(o) === norm(right)) problems.push(`${at}: wrong word "${o}" is the right one`);
      if (kind === 'comma') {
        // The only right places: after the starting phrase, or (accepted too) no comma at all; neither may be a wrong option.
        const plain = it.text.replace(/,/g, '');
        if (o.replace(/,/g, '') !== plain) problems.push(`${at}: wrong option "${o}" changes more than a comma`);
        if (o === plain) problems.push(`${at}: the sentence with no comma is accepted, so it cannot be a wrong option`);
        if (o.indexOf(',') === right.indexOf(',')) problems.push(`${at}: wrong option "${o}" has the comma in the right place`);
      }
      if (kind === 'tense') {
        const time = timeOf(it.text.split('___')[0]);
        if (time === 'future' && !/s$|ed$/.test(o) && !Object.values(IRREGULAR_PAST).includes(o)) problems.push(`${at}: "${o}" after will reads right`);
        if (time === 'past' && (/ed$/.test(o) || Object.values(IRREGULAR_PAST).includes(o))) problems.push(`${at}: "${o}" reads as a past form`);
        if (time === 'present' && /s$/.test(o) && !/ed$/.test(o) && /s$/.test(right)) problems.push(`${at}: "${o}" reads as a present form`);
      }
    });
  }
  return problems;
}

/** Check one text field for the content rules. */
function lint(text, problems, where) {
  if (DASHES.test(text)) problems.push(`${where}: an em or en dash`);
  if (BANNED.test(text)) problems.push(`${where}: names the reference product or one of its coinages`);
}
const unitText = u => [u.lead, u.text, u.note, u.then && u.then.text, u.then && u.then.note].filter(Boolean).join(' ');

// ------------------------------------------------------------------------------------------------- Mistake Hunt rooms
const ROOM_SIZE = 8, ROOM_MISTAKES = 5, ROOM_MIN = 3, ROOM_PASS = 0.8;
/** A topic's room: its own right sentences (8 of them, in a fixed order), planted by Mistake Hunt's planter with only
 *  the topic's kinds and a fixed seed. titlesOnly: a capital is planted only inside a title (the kind would also take
 *  a person's name). -> { title, passages: [{ t, x, g, m }], need } or a problem. */
export function buildRoom(topic, def, problems) {
  const P = proofCore();
  const kinds = def.room.kinds;
  for (const k of kinds) if (!P.BY[k]) { problems.push(`${topic.id} room: Mistake Hunt has no mistake kind "${k}"`); return null; }
  const sentences = seededShuffle(topic.items.map(it => ({ s: it.right || it.text, it })), `room|${topic.id}`).slice(0, ROOM_SIZE);
  const x = P.normText(sentences.map(o => o.s).join(' '));
  let avoid = [];
  if (def.room.titlesOnly) {
    // the word places of each title in the passage; every capital outside them is kept as it is
    const toks = P.tokenize(x), inTitle = new Set();
    let at = 0;
    for (const { s, it } of sentences) {
      const n = P.tokenize(s).length;
      const title = it.options ? it.options[it.answer[0]] : '';
      const first = (it.text.split('___')[0].trim() ? P.tokenize(it.text.split('___')[0]).length : 0);
      for (let k = 0; k < title.split(' ').length; k++) inTitle.add(at + first + k);
      at += n;
    }
    avoid = P.allCandidates(x, kinds).filter(c => !inTitle.has(c.a));
    if (toks.length !== at) problems.push(`${topic.id} room: the passage's words do not line up with its sentences`);
  }
  const m = P.plant(x, { types: kinds, n: ROOM_MISTAKES, seed: hashInt(`room|${topic.id}`), avoid });
  if (m.length < ROOM_MIN) { problems.push(`${topic.id} room: only ${m.length} mistakes planted, at least ${ROOM_MIN} needed`); return null; }
  // the planted text must read wrong, and the checker must take the right text back as every mistake fixed
  const W = P.wrongTokens(x, m);
  const edits = m.map(mm => { const a = W.findIndex(w => w.m === m.indexOf(mm)); const b = a + mm.w.split(' ').length; return { a, b, s: P.tokenize(x).slice(mm.a, mm.b).map(t => t.s).join(' ') }; });
  const r = P.check(x, m, edits);
  if (r.found.length !== m.length) problems.push(`${topic.id} room: the checker does not take the right text back`);
  return { title: topic.title, passages: [{ t: topic.title, x, g: 1, m }], need: Math.ceil(ROOM_PASS * m.length), kinds };
}

/** Build every topic pathways.json names. -> { topics, rooms, problems }. */
export function buildTopics(md, plan, overrides = { topics: {} }) {
  const sections = parseCourse(md);
  const problems = [];
  const topics = {}, rooms = {};
  const bandOf = {};
  for (const b of plan.bands) for (const p of b.pathways) for (const part of (plan.pathways[p] || { parts: [] }).parts) for (const id of part.topics) bandOf[id] = bandOf[id] || b.id;
  for (const [id, def] of Object.entries(plan.topics)) {
    const where = `${id} (${def.source.band} "${def.source.title}")`;
    const src = findTopic(sections, def.source.band, def.source.title);
    if (!src) { problems.push(`${where}: no full topic with that title in that band of the source`); continue; }
    const fmt = FORMATS[def.format];
    if (!fmt) { problems.push(`${where}: format "${def.format}" is not built yet`); continue; }
    const card = parseCard(src.cardLines, problems, where, def.format, def.choices && def.choices.pair);
    const notes = (overrides.topics || {})[id] || {};
    const items = src.quizLines.map(l => fmt({ ...l, text: (notes[l.text.split('.')[0]] || {}).text || l.text }, problems, where, def)).filter(Boolean)
      .map(it => { const { n, ...rest } = it; return { id: `${id}-${n}`, ...rest }; });
    const levels = Array.isArray(def.levels) && def.levels.length ? def.levels : [4, 4, 4];
    if (items.length < 12) problems.push(`${where}: ${items.length} quiz items, at least 12 needed`);
    for (const it of items) {
      lint(it.text, problems, `${it.id} sentence`); lint(it.hint, problems, `${it.id} hint`);
      for (const o of it.options || []) lint(o, problems, `${it.id} option`);
    }
    for (const [k, v] of Object.entries({ definition: card.definition, how: card.how, ask: def.ask, title: src.title })) lint(v || '', problems, `${id} ${k}`);
    if (card.example) for (const u of [card.example, ...(card.example.more || [])]) lint(unitText(u), problems, `${id} worked example`);
    for (const t of card.tips) lint(unitText(t), problems, `${id} tip`);
    const topic = { id, title: src.title, band: bandOf[id] || def.source.band, format: def.format, ask: def.ask, levels, source: { line: src.line },
      ...(def.choices ? { choices: def.choices } : {}), ...(def.choices && def.choices.kind === 'title' ? { italic: true } : {}), card, items };
    problems.push(...checkOptions(topic));
    topics[id] = topic;
    if (def.room) { const r = buildRoom(topic, def, problems); if (r) { rooms[id] = r; topic.room = true; } }
  }
  for (const b of plan.bands) for (const p of b.pathways) {
    if (!plan.pathways[p]) { problems.push(`band ${b.id}: no pathway "${p}"`); continue; }
    lint(plan.pathways[p].title, problems, `pathway ${p}`);
    for (const part of plan.pathways[p].parts) {
      if (part.title) lint(part.title, problems, `pathway ${p} part`);
      for (const id of part.topics) if (!plan.topics[id]) problems.push(`pathway ${p}: no topic "${id}"`);
    }
    for (const [id, mark] of Object.entries(plan.pathways[p].marks || {})) {
      if (!plan.pathways[p].parts.some(x => x.topics.includes(id))) problems.push(`pathway ${p}: a ${mark} mark on "${id}", which is not in it`);
      if (!['checkpoint', 'review'].includes(mark)) problems.push(`pathway ${p}: "${mark}" is not a checkpoint or review mark`);
    }
  }
  return { topics, rooms, problems };
}

/** The whole topics.json, from the files on disk. Throws on any problem. */
export function build() {
  const md = fs.readFileSync(path.join(DIR, 'source/course.md'), 'utf8');
  const plan = readJson(path.join(DIR, 'pathways.json'));
  const overrides = readJson(path.join(DIR, 'overrides.json'));
  const { topics, rooms, problems } = buildTopics(md, plan, overrides);
  if (problems.length) throw new Error(`grammar-lab-build: ${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  return { _about: 'Generated by scripts/grammar-lab-build.js from source/course.md, pathways.json and overrides.json. Do not edit by hand.', bands: plan.bands, pathways: plan.pathways, topics, rooms };
}
export const serialize = data => JSON.stringify(data, null, 1) + '\n';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let data, text;
  try { data = build(); text = serialize(data); } catch (e) { process.stderr.write(e.message + '\n'); process.exit(1); }
  if (process.argv.includes('--options')) {
    for (const t of Object.values(data.topics)) for (const it of t.items) if (it.options) process.stdout.write(`${it.id}\t${it.text}\n\t${it.options.map((o, i) => (it.answer.includes(i) ? `[right] ${o}` : `[wrong] ${o}`)).join('\n\t')}\n`);
    for (const [id, r] of Object.entries(data.rooms)) process.stdout.write(`room ${id}: ${proofCore().wrongText(r.passages[0].x, r.passages[0].m)}\n`);
  } else if (process.argv.includes('--check')) {
    const now = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (now !== text) { process.stderr.write('topics.json is out of date: run node scripts/grammar-lab-build.js\n'); process.exit(1); }
    process.stdout.write('topics.json is up to date.\n');
  } else {
    fs.writeFileSync(OUT, text);
    process.stdout.write(`Wrote ${path.relative(ROOT, OUT)}: ${Object.keys(data.topics).length} topic(s), ${Object.keys(data.rooms).length} room(s).\n`);
  }
}
