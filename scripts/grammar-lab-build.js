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
//           Grades 3-5 add (the code is under "grades 3-5" below):
//           kind 'join'    compound sentences: two thoughts as the prompt; the joined sentence, a comma splice, a run-on
//                          and (for and, but, so, yet) the same thoughts joined by "or", a choice they do not offer
//           kind 'connect' complex sentences: the sentence with its connecting word, the extra idea cut off as a
//                          fragment, a comma splice, and for "because" its opposite, "although"
//           kind 'label'   sentence or fragment: two pills (choices.labels), the sentence shown as it is
//           kind 'ab'      showing vs. telling: the two sentences the item gives, its own question
//           kind 'given'   "(is reading/reads)": the two forms the item gives
//           kind 'shift'   a tense shift: the verb that jumped tense is the blank; its past, present and base forms
//           choices.cycle  shows the choice as press-to-cycle in the blank (opens on "Press to choose", never an option)
//   passage judge the sentence in a short passage: "Passage: "..." Which ...? Answer: the second sentence." The passage's
//           sentences are the choices, the item's question asks. Writing cards have three sections (parseSections).
//   fix     an error-fixing box: the student types the fix; after a wrong answer the box turns into press-to-cycle through
//           whole versions of the sentence. fix.kind 'runon' accepts any valid fix (a period and a capital, a semicolon,
//           or a comma and a joining word that fits the hint's relation); 'dialogue' and 'quote' accept the fix as
//           written (quotes straight or curly). The versions' wrong ones break a rule: a splice, the run-on itself, a
//           missing capital; a missing comma, an end mark outside the marks, a small letter to start the quote.
//   items   grades 6-8 (and up): a topic whose quiz mixes question shapes; each line is read by the first reader that
//           knows its shape and keeps its own format (tap with phrases, capfix both ways, marks: punctuation chips,
//           choice, passage, fix). The code and its rules are under "grades 6-8" and "grades 6-8, part 2" below;
//           pathways.json read.* holds a topic's notes for them (its independent check, pills, chips, fix kind,
//           optional commas, "right as it is", press-to-cycle, and read.bare: what a line written as only its
//           sentence asks). source.line picks one of a topic written twice in the source.
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
import { tokenize, findWords, hasWord, norm, normTyped } from '../server/services/grammar-lab-text.js';
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
    // grades 9-12 write a topic as "### Title" (no "Topic: " and no number)
    if ((m = /^### (?:Topic: |\d+\.\d+ )?(.+)$/.exec(line))) {
      if (!pw) { pw = { title: '', topics: [] }; sec.pathways.push(pw); }
      topic = { title: m[1].trim(), line: i + 1, ref: null, cardLines: [], quizLines: [] }; pw.topics.push(topic); mode = null;
      return;
    }
    if (!topic) return;
    // "**Teaching Card**", "Teaching card:" or "Teaching card, three sections:"; "**Quiz**", "Quiz:" or "Quiz (tap the adjective):"
    if (/^(\*\*Teaching Card\*\*|Teaching card(?:, [a-z ]+| \([a-z ]+\))?:)\s*$/i.test(line.trim())) { mode = 'card'; return; }
    if (/^(\*\*Quiz\*\*|Quiz(?: \([^)]*\))?:)\s*$/i.test(line.trim())) { mode = 'quiz'; return; }
    if (!mode && /\bSee\b.+\babove\b/.test(line)) { topic.ref = line.trim(); return; }
    if (mode === 'card' && /^- /.test(line)) topic.cardLines.push({ text: line.slice(2).trim(), line: i + 1 });
    // grades 9-12 write a card's fields with no "- " in front ("Definition: ...")
    else if (mode === 'card' && /^(Definition|Worked example|How it works|Tip box): /.test(line)) topic.cardLines.push({ text: line.trim(), line: i + 1 });
    if (mode === 'quiz' && /^\d+\. /.test(line)) topic.quizLines.push({ text: line.trim(), line: i + 1 });
  });
  return sections;
}

/** The topic written in full with this title in this band (cross-references skipped), or null. */
export function findTopic(sections, band, title, line = null) {
  for (const s of sections.filter(x => x.band === band)) {
    for (const p of s.pathways) for (const t of p.topics) if (t.title === title && t.cardLines.length && t.quizLines.length && (!line || t.line === line)) return t;
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
  // "Walked is past, but buys is present." -> both verbs
  for (const m of String(text).matchAll(/(?:^|[.!?]\s+|,\s+(?:but|and)\s+)((?:[Ww]ill )?[\p{L}'-]+) is (?:now|past|present|later)\b/gu)) out.push({ word: m[1], role: 'verb' });
  // "But joins the two thoughts." -> a conjunction
  for (const m of String(text).matchAll(/(?:^|[.!?]\s+)([\p{L}'-]+) joins\b/gu)) out.push({ word: m[1], role: 'conjunction' });
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
  const definition = field('Definition'), worked = field('Worked example') || field('Example'), how = field('How it works') || field('Explanation'), tip = field('Tip box');
  for (const [k, v] of [['Definition', definition], ['Worked example', worked], ['How it works', how], ['Tip box', tip]]) if (!v) problems.push(`${where}: the teaching card has no ${k}`);
  if (worked && !worked.includes('"') && /\bLabels: /.test(worked)) return plainCard(definition, worked, how, tip);
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
    return { ...u, marks, ...(u.then ? { then: { ...u.then } } : {}) };
  });
  // Before and after: every example that shows a sentence as written and then fixed.
  if (example) {
    const all = [example, ...(example.more || [])];
    for (const u of all) beforeAfter(u, all[0], problems, where);
    for (const u of tips) beforeAfter(u, all[0], problems, where);
    if ((format === 'capfix' || format === 'gaps') && !all.some(u => u.fix && u.then.marks.some(m => m.role === 'capital' || m.role === 'comma'))) problems.push(`${where}: the worked example has no "before" and "after" sentences that differ by a capital or a comma`);
  }
  if (tip && !tips.length && format === 'choice' && /^[A-Z][^"]+\.$/.test(tip)) tips.push({ text: tip, note: '', marks: [] });
  else if (tip && !tips.length) problems.push(`${where}: the tip box has no quoted example`);
  return { definition, example, how, tips };
}

/** A grades 9-12 card writes its examples with no quotes: "Worked example: Sentence. Labels: word, what it is; word,
 *  what it is." and "Tip box: Sentence. Sentence." The labeled words are marked in the sentences that hold them, and the
 *  labels are the example's note. "X becomes Y" is a fix example: the sentence before, then after. */
function plainCard(definition, worked, how, tip) {
  const [ex, labels = ''] = worked.split(/\s*\bLabels: /);
  const parts = labels.replace(/\.$/, '').split(/;\s*/).filter(Boolean).map(x => { const bits = x.split(/,\s*/); return { keys: bits.slice(0, -1), what: bits[bits.length - 1] }; });
  const keys = parts.flatMap(x => x.keys);
  const marksOf = text => { const toks = tokenize(text); return keys.flatMap(k => { const at = findWords(toks, k); return at.length === 1 ? at[0].map(i => ({ i, role: 'key' })) : []; }).sort((a, b) => a.i - b.i); };
  const note = parts.map(x => `${capFirst(x.keys.join(', '))}: ${x.what}.`).join(' ');
  const unit = (text, n = '') => {
    const b = /^(.+?) becomes (.+)$/.exec(text);
    if (!b) return { text, note: n, marks: marksOf(text) };
    return { text: b[1], note: 'becomes', marks: marksOf(b[1]), then: { text: b[2], note: n, marks: marksOf(b[2]) }, fix: true };
  };
  const example = unit(ex.trim(), note), tips = sentencesOf(tip).map(t => unit(t));
  for (const u of [example, ...tips]) beforeAfter(u, example, [], '');
  return { definition, example, how, tips };
}

/** The words a fix example's note ends on when the quote after it is the sentence fixed. */
const FIX_CUE = /(?:^|[\s.!?:,])(?:the correct sentence is|the title is|with (?:a )?commas?:|fix(?: it(?: like this)?)?:|fixed:|the fix is)$/i;
/** A fix example (a sentence as written, then fixed: "before" and "after"): u.fix, and its marks all on the after. It
 *  is a fix when its note says so (FIX_CUE), when the two differ by capitals or commas only, or when it "becomes" the
 *  next sentence on a card whose worked example is a fix. The after's marks: the words whose capital changed ('capital',
 *  or 'lower' for one that loses it) or the commas added, any word jobs the before had marked on the same words, and (a
 *  title) the small words the title leaves lowercase ('small'). The before is shown as written, with no marks. */
function beforeAfter(u, first, problems, where) {
  if (!u.then) return;
  const note = String(u.note || '').trim();
  const c = capitalDiff(u.text, u.then.text), g = commaDiff(u.text, u.then.text);
  const diff = (c && c.length) || (g && g.length);
  if (!u.fix && !FIX_CUE.test(note) && !diff && !(/\bbecomes$/.test(note) && u !== first && first.fix)) return;
  u.fix = true;
  const A = tokenize(u.text), Bt = tokenize(u.then.text);
  let marks = (u.then.marks || []).slice();
  if (c && c.length) marks = c.map(i => ({ i, role: /^\p{Ll}/u.test(Bt[i].t) ? 'lower' : 'capital' }));
  else if (g && g.length) marks = g.map(i => ({ i, role: 'comma' }));
  // A word job the before had marked goes to the same word in the after, or to the word that replaced it when the fix
  // swaps one word for another ("buys" fixed to "bought" keeps its "verb" label).
  for (const m of u.marks || []) if (!['capital', 'lower', 'comma', 'key'].includes(m.role) && A[m.i] && Bt[m.i] && (A[m.i].t === Bt[m.i].t || A.length === Bt.length) && !marks.some(x => x.i === m.i)) marks.push(m);
  if (/\bthe title is$/i.test(note)) {
    const right = titleCase(u.then.text.replace(/[.!?]$/, ''));
    if (`${right}${/[.!?]$/.test(u.then.text) ? u.then.text.slice(-1) : ''}` !== u.then.text) problems.push(`${where}: the title "${u.then.text}" is not capitalized by the title rules ("${right}")`);
    Bt.forEach((w, i) => { if (i > 0 && i < Bt.length - 1 && SMALL_WORDS.has(norm(w.t)) && /^\p{Ll}/u.test(w.t) && !marks.some(x => x.i === i)) marks.push({ i, role: 'small' }); });
  }
  u.then.marks = marks.sort((a, b) => a.i - b.i);
  u.marks = [];
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
  keep: 'kept', feel: 'felt', hold: 'held', win: 'won', fall: 'fell', break: 'broke', wake: 'woke', drink: 'drank', swing: 'swung', feed: 'fed' });
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
  // "Look for the small word ..." uses "for" as a plain word, not the answer "for"
  hint = String(hint).replace(/\b(look|reason) for\b/gi, '$1');
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
    if (def.choices && Object.hasOwn(MORE_CHOICES, def.choices.kind)) return MORE_CHOICES[def.choices.kind](line, problems, where, def);
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
    } else { problems.push(`${where}: a choice topic needs choices.kind (pair, title, comma, tense, ${Object.keys(MORE_CHOICES).join(', ')})`); return null; }
    if (new Set(options).size !== options.length) problems.push(`${at}: two options read the same`);
    if (wrong.some(w => w === right)) problems.push(`${at}: a wrong option is the right one`);
    const full = whole ? right : `${before}${right}${after}`;
    return { n: +n, text: whole ? textRaw : `${before}___${after}`, options, answer: [options.indexOf(right)], right: full, hint: hint.trim(),
      ...(whole ? { whole: true } : {}), ...(italic ? { italic: true } : {}) };
  },
};

// ------------------------------------------------------------------------------------------------- grades 3-5
// Items whose answer is a whole sentence: 1. "The dog barked. The cat hid." Answer: The dog barked, and the cat hid. Hint: ...
const FIX_ITEM = /^(\d+)\.\s+"(.+?)"\s+Answer:\s+(.+?)\s+Hint:\s+(.+)$/;
// Two given sentences: 1. "A) Ana was sad. B) Ana wiped her eyes." Which sentence shows how Ana feels? Answer: B. Hint: ...
const AB_ITEM = /^(\d+)\.\s+"A\)\s+(.+?)\s+B\)\s+(.+?)"\s+(.+?\?)\s+Answer:\s+([AB])\.\s+Hint:\s+(.+)$/;
// A short passage: 1. Passage: "S1 S2 S3" Which sentence ...? Answer: the second sentence. Hint: ...
const PASSAGE_ITEM = /^(\d+)\.\s+Passage:\s+"(.+?)"\s+(.+?\?)\s+Answer:\s+the (first|second|third|fourth|fifth) sentence\.\s+Hint:\s+(.+)$/;
const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth'];
export const FANBOYS = Object.freeze(['and', 'but', 'or', 'so', 'yet', 'for', 'nor']);
export const SUBORDINATORS = Object.freeze(['because', 'when', 'after', 'before', 'until', 'while', 'since', 'although', 'if', 'unless']);
const PREPOSITIONS = new Set(['under', 'over', 'in', 'on', 'at', 'by', 'near', 'behind', 'beside', 'across', 'into', 'with', 'from', 'during', 'after', 'before', 'around', 'through']);
const HELPERS = new Set(['will', 'is', 'are', 'was', 'were', 'am', 'can', 'has', 'have', 'had', 'did', 'does', 'do']);
const PAST_FORMS = () => new Set(Object.values(IRREGULAR_PAST));
const capFirst = x => x.charAt(0).toUpperCase() + x.slice(1);
const lowFirst = x => x.charAt(0).toLowerCase() + x.slice(1);
const lowWords = text => words(text).map(w => w.toLowerCase());
const sameWords = (a, b) => lowWords(a).join(' ') === lowWords(b).join(' ');
const sameBag = (a, b) => lowWords(a).sort().join(' ') === lowWords(b).sort().join(' ');
/** Split a passage into its sentences ("50,000 bees." stays one). */
export const sentencesOf = text => String(text).trim().split(/(?<!\b(?:Dr|Mr|Mrs|Ms|St)\.)(?<=[.!?])\s+(?=[A-Z"])/).filter(Boolean);
/** Is the word a verb form in the past (a listed irregular past, or a regular -ed)? */
const isPast = w => PAST_FORMS().has(w) || (/ed$/.test(w) && !/eed$/.test(w) && w.length > 3);   // not feed, need

// Compound sentences (choices.kind 'join'): the two thoughts joined with a comma and a joining word. The wrong options
// break the rule a compound sentence follows: a comma splice (the comma with no joining word), a run-on (no comma and no
// joining word), and, where the joining word adds, gives a result or shows a difference, "or", which offers a choice the
// two thoughts do not give. ("and" and "so" can both read right for two events, so they are never each other's wrong.)
export const JOIN_CONFLICT = Object.freeze({ and: 'or', but: 'or', so: 'or', yet: 'or' });
// Complex sentences (choices.kind 'connect'): the extra idea joined by its connecting word. Wrong: the extra idea cut off
// as a fragment, a comma splice with the connecting word dropped, and for "because" the opposite, "although". The time
// words get no opposite: "before" and "after" can both be true of two events the item does not order.
export const CONNECT_OPPOSITE = Object.freeze({ because: 'although' });
// Run-ons (fix kind 'runon'): any valid fix is right. A fix splits the two thoughts with a period (and a capital) or a
// semicolon, or joins them with a comma and a joining word that fits how the thoughts relate (the hint says how).
export const RUNON_JOINERS = Object.freeze({ add: ['and', 'so'], result: ['so', 'and'], contrast: ['but', 'yet'], choice: ['or'], split: ['and'] });
const relationOf = hint => (/adds one thought/i.test(hint) ? 'add' : /result/i.test(hint) ? 'result' : /difference/i.test(hint) ? 'contrast'
  : /choice/i.test(hint) ? 'choice' : /stand alone/i.test(hint) ? 'split' : null);

/** A verb's base form from two of its forms ("bought", "buys" -> "buy"), or null. */
export function baseOf(a, b) {
  const cands = w => {
    const out = [w];
    for (const [base, past] of Object.entries(IRREGULAR_PAST)) if (past === w) out.push(base);
    if (/ies$/.test(w)) out.push(`${w.slice(0, -3)}y`);
    if (/es$/.test(w)) out.push(w.slice(0, -2));
    if (/s$/.test(w)) out.push(w.slice(0, -1));
    if (/ied$/.test(w)) out.push(`${w.slice(0, -3)}y`);
    if (/ed$/.test(w)) { out.push(w.slice(0, -2), w.slice(0, -1)); if (/(.)\1ed$/.test(w)) out.push(w.slice(0, -3)); }
    return out;
  };
  return [...cands(a), ...cands(b)].find(x => { const f = [x, presentOf(x), pastOf(x)]; return f.includes(a) && f.includes(b); }) || null;
}

const MORE_CHOICES = {
  /** Compound sentences: pick the sentence that joins the two thoughts the right way. */
  join(line, problems, where) {
    const m = FIX_ITEM.exec(line.text);
    if (!m) { problems.push(`${where} line ${line.line}: not a whole-sentence item ("N. "Two thoughts." Answer: Sentence. Hint: ...")`); return null; }
    const [, n, text, rightRaw, hint] = m, at = `${where} item ${n}`, right = rightRaw.trim();
    const j = /^(.+?), (and|but|or|so|yet) (.+[.!?])$/.exec(right);
    if (!j) { problems.push(`${at}: the answer is not two thoughts joined by a comma and and, but, or, so or yet`); return null; }
    const [, A, conj, b] = j;
    if (!sameWords(text, `${A} ${b}`)) problems.push(`${at}: the answer's words are not the two thoughts`);
    const wrong = [`${A}, ${b}`, `${A} ${b}`, ...(JOIN_CONFLICT[conj] ? [`${A}, ${JOIN_CONFLICT[conj]} ${b}`] : [])];
    if (hintLeaks(hint, conj)) problems.push(`${at}: the hint names the joining word "${conj}"`);
    const options = seededShuffle([right, ...wrong], `${where}|${n}`);
    return { n: +n, text, prompt: text, options, answer: [options.indexOf(right)], right, hint: hint.trim(), whole: true };
  },
  /** Complex sentences: pick the sentence that adds the extra idea with its connecting word. */
  connect(line, problems, where) {
    const m = FIX_ITEM.exec(line.text);
    if (!m) { problems.push(`${where} line ${line.line}: not a whole-sentence item`); return null; }
    const [, n, text, rightRaw, hint] = m, at = `${where} item ${n}`, right = rightRaw.trim();
    const toks = tokenize(right);
    const k = toks.findIndex((w, i) => i > 0 && SUBORDINATORS.includes(w.t.toLowerCase()) && !w.pre);
    if (k < 0 || toks[k - 1].post) { problems.push(`${at}: the answer has no connecting word (${SUBORDINATORS.join(', ')}) in the middle`); return null; }
    const main = joinTokens(toks.slice(0, k)), conn = toks[k].t, dep = joinTokens(toks.slice(k + 1));
    if (!sameBag(text, `${main} ${dep}`)) problems.push(`${at}: the answer's words are not the two thoughts`);
    const wrong = [`${main}. ${capFirst(conn)} ${dep}`, `${main}, ${dep}`, ...(CONNECT_OPPOSITE[conn] ? [`${main} ${CONNECT_OPPOSITE[conn]} ${dep}`] : [])];
    if (hintLeaks(hint, conn)) problems.push(`${at}: the hint names the connecting word "${conn}"`);
    const options = seededShuffle([right, ...wrong], `${where}|${n}`);
    return { n: +n, text, prompt: text, options, answer: [options.indexOf(right)], right, hint: hint.trim(), whole: true };
  },
  /** Sentence or fragment: two pills from the topic's labels (choices.labels: [{ text, answer }]), in a fixed order. */
  label(line, problems, where, def) {
    const m = QUOTED_ITEM.exec(line.text);
    if (!m) { problems.push(`${where} line ${line.line}: not a label item`); return null; }
    const [, n, text, answerRaw, hint] = m, at = `${where} item ${n}`;
    const labels = def.choices.labels || [];
    const k = labels.findIndex(l => norm(l.answer) === norm(unquote(answerRaw)));
    if (k < 0) { problems.push(`${at}: the answer "${answerRaw}" is not one of the labels`); return null; }
    if (labels.some(l => hasWord(hint, l.text))) problems.push(`${at}: the hint names a label`);
    return { n: +n, text, options: labels.map(l => l.text), answer: [k], right: text, label: labels[k].text, hint: hint.trim(), plain: true };
  },
  /** Showing vs. telling: the two sentences the item gives, in its order (the page never opens on either). */
  ab(line, problems, where) {
    const m = AB_ITEM.exec(line.text);
    if (!m) { problems.push(`${where} line ${line.line}: not an A) B) item`); return null; }
    const [, n, a, b, ask, ans, hint] = m;
    const options = [a.trim(), b.trim()], k = ans === 'A' ? 0 : 1;
    if (options.some(o => hint.includes(o))) problems.push(`${where} item ${n}: the hint quotes an option`);
    return { n: +n, text: ask.trim(), ask: ask.trim(), options, answer: [k], right: options[k], hint: hint.trim(), whole: true };
  },
  /** Progressive verbs: "Sam (is reading/reads) a book." -> a blank and the two forms the item gives (seeded order). */
  given(line, problems, where) {
    const m = QUOTED_ITEM.exec(line.text);
    if (!m) { problems.push(`${where} line ${line.line}: not a choice item`); return null; }
    const [, n, textRaw, answerRaw, hint] = m, at = `${where} item ${n}`;
    const g = /^(.*?)\(([^()/]+)\/([^()/]+)\)(.*)$/.exec(textRaw);
    if (!g) { problems.push(`${at}: no (one/other) choice in the sentence`); return null; }
    const [, before, x, y, after] = g, answer = unquote(answerRaw);
    const given = [x.trim(), y.trim()];
    if (!given.includes(answer)) { problems.push(`${at}: the answer "${answer}" is not one of ${given.join(' / ')}`); return null; }
    const wrong = given.filter(o => o !== answer);
    if (hintLeaks(hint, answer, wrong)) problems.push(`${at}: the hint names the answer "${answer}"`);
    const options = seededShuffle(given, `${where}|${n}`);
    return { n: +n, text: `${before}___${after}`, options, answer: [options.indexOf(answer)], right: `${before}${answer}${after}`, hint: hint.trim() };
  },
  /** A tense shift: the verb that jumped tense becomes a blank; its three forms (past, present, base) are the choices. */
  shift(line, problems, where) {
    const m = FIX_ITEM.exec(line.text);
    if (!m) { problems.push(`${where} line ${line.line}: not a whole-sentence item`); return null; }
    const [, n, text, rightRaw, hint] = m, at = `${where} item ${n}`, right = rightRaw.trim();
    const A = tokenize(text), B = tokenize(right);
    const diff = A.length === B.length ? A.flatMap((w, i) => (w.t !== B[i].t || w.pre !== B[i].pre || w.post !== B[i].post ? [i] : [])) : [];
    if (diff.length !== 1 || A[diff[0]].pre !== B[diff[0]].pre || A[diff[0]].post !== B[diff[0]].post) { problems.push(`${at}: the fix is not one verb changed`); return null; }
    const p = diff[0], was = A[p].t, want = B[p].t;
    const base = baseOf(want, was);
    if (!base) { problems.push(`${at}: "${was}" and "${want}" are not two forms of one verb: add it to the irregular verbs`); return null; }
    if (MADE_UP_PASTS.has(pastOf(base))) problems.push(`${at}: "${pastOf(base)}" is not a real past form of "${base}"`);
    const forms = [...new Set([pastOf(base), presentOf(base), base])];
    if (forms.length < 3) problems.push(`${at}: "${base}" has fewer than three forms to choose from`);
    if (hintLeaks(hint, want)) problems.push(`${at}: the hint names the answer "${want}"`);
    const options = seededShuffle(forms, `${where}|${n}`);
    return { n: +n, text: joinTokens(A.map((w, i) => (i === p ? { ...w, t: '___' } : w))), prompt: text, options, answer: [options.indexOf(want)], right, hint: hint.trim() };
  },
};

/** Judge the sentence in a short passage: the passage's sentences are the choices. */
FORMATS.passage = function passage(line, problems, where) {
  const m = PASSAGE_ITEM.exec(line.text);
  if (!m) { problems.push(`${where} line ${line.line}: not a passage item ("N. Passage: "..." Which ...? Answer: the second sentence. Hint: ...")`); return null; }
  const [, n, text, ask, ord, hint] = m, at = `${where} item ${n}`;
  const options = sentencesOf(text), k = ORDINALS.indexOf(ord);
  if (options.length < 2 || k >= options.length) { problems.push(`${at}: the passage has ${options.length} sentences, so no ${ord} one`); return null; }
  if (new RegExp(`\\b(${ORDINALS.join('|')})\\b`, 'i').test(hint) || options.some(o => hint.includes(o.replace(/[.!?]$/, '')))) problems.push(`${at}: the hint points at a sentence`);
  return { n: +n, text, ask: ask.trim(), options, answer: [k], right: options[k], hint: hint.trim() };
};

/** Fix the sentence: an error-fixing box (the student types the fix), turned into press-to-cycle through whole-sentence
 *  versions after a wrong answer. accept: every typed fix that is right (kind 'runon': any valid fix); options and
 *  answer: the cycle's versions, the right one among wrong ones made by the kind's rules. */
FORMATS.fix = function fix(line, problems, where, def) {
  const m = FIX_ITEM.exec(line.text);
  if (!m) { problems.push(`${where} line ${line.line}: not a fix item ("N. "Sentence." Answer: Fixed sentence. Hint: ...")`); return null; }
  const [, n, text, rightRaw, hint] = m, at = `${where} item ${n}`, right = rightRaw.trim();
  const kind = def.fix && def.fix.kind;
  let accept = [right], wrong = [];
  if (kind === 'runon') {
    const j = /^(.+?), (and|but|or|so|yet) (.+)$/.exec(right) || /^(.+?[^.!?])\. (\S.+)$/.exec(right);
    if (!j) { problems.push(`${at}: the fix neither joins with a comma and a joining word nor splits with a period`); return null; }
    const A = j[1], conj = j.length === 4 ? j[2] : null;
    const T = tokenize(text), nA = tokenize(A).length;
    const first = joinTokens(T.slice(0, nA)), second = joinTokens(T.slice(nA));
    if (first !== A || !sameWords(second, j[j.length - 1])) { problems.push(`${at}: the fix is not the run-on's two thoughts`); return null; }
    const rel = relationOf(hint);
    if (!rel) { problems.push(`${at}: the hint does not say how the thoughts relate (adds, result, difference, choice, stand alone)`); return null; }
    const extra = ((def.notes || {})[n] || {}).accept || [];
    const joiners = [...new Set([...RUNON_JOINERS[rel], ...extra])];
    if (conj && !joiners.includes(conj)) problems.push(`${at}: "${conj}" does not fit a thought that ${rel === 'add' ? 'adds' : `shows a ${rel}`}`);
    accept = [...new Set([right, `${A}. ${capFirst(second)}`, `${A}; ${second}`, ...joiners.map(c => `${A}, ${c} ${second}`)])];
    wrong = [`${A}, ${second}`, text, /^[a-z]/.test(second) ? `${A}. ${second}` : `${A}, or ${second}`].filter(w => !accept.includes(w));
    // "a comma and a word" uses "and" as a plain word; naming the fix's word is ", and", "the word and" or "and" in quotes
    if (conj && new RegExp(`(, ${conj} |\\bword ${conj}\\b|"${conj}")`, 'i').test(hint)) problems.push(`${at}: the hint names the joining word "${conj}"`);
  } else if (kind === 'dialogue' || kind === 'quote') {
    const q = /^(.*?)([,:]?) "(.+?)([.!?])"$/.exec(right);
    if (!q) { problems.push(`${at}: the fix is not words leading into a quote that ends inside its marks`); return null; }
    const [, tag, lead, body, end] = q;
    if (!sameWords(text, right)) problems.push(`${at}: the fix changes words, not only marks and capitals`);
    const noQuotes = `${tag}${lead} ${body}${end}`;
    wrong = [lead ? `${tag} "${body}${end}"` : noQuotes, `${tag}${lead} "${body}"${end}`,
      /^[A-Z]/.test(body) && !/^I\b/.test(body) ? `${tag}${lead} "${lowFirst(body)}${end}"` : noQuotes];
    wrong = [...new Set(wrong)];
  } else { problems.push(`${where}: a fix topic needs fix.kind (runon, dialogue or quote)`); return null; }
  if (wrong.length < 2) problems.push(`${at}: fewer than 2 wrong versions`);
  if (hint.includes(right) || hint.includes(right.replace(/[.!?"]+$/, ''))) problems.push(`${at}: the hint gives the fix`);
  const options = seededShuffle([right, ...wrong], `${where}|${n}`);
  return { n: +n, text, right, accept, options, answer: [options.indexOf(right)], hint: hint.trim() };
};

/** Is a two-thought sentence put together right (the second, independent rule for run-on fixes)? first: the first
 *  thought's words as written. Right: a period and a capital, a semicolon, or a comma and a joining word. */
export function joinsRight(sentence, first) {
  if (!sentence.startsWith(first)) return false;
  const rest = sentence.slice(first.length);
  return /^\. [A-Z]/.test(rest) || /^; [a-zA-Z]/.test(rest) || new RegExp(`^, (${FANBOYS.join('|')}) [a-zA-Z]`).test(rest);
}
/** The quotation rules (the second, independent rule for dialogue and quotes): two marks, the end mark inside them, a
 *  capital to start the quoted words, and the same mark (comma, colon or none) before the opening mark as the fix. */
export function quoteRules(sentence, right) {
  const marks = (sentence.match(/"/g) || []).length;
  const open = sentence.indexOf('"'), close = sentence.lastIndexOf('"');
  const leadOf = s => { const i = s.indexOf('"'); const c = s.slice(0, i).trim().slice(-1); return /[,:]/.test(c) ? c : ''; };
  return { marks: marks === 2, endInside: close > 0 && /[.!?]/.test(sentence.charAt(close - 1)) && close === sentence.length - 1,
    capital: open >= 0 && /^[A-Z]/.test(sentence.slice(open + 1)), lead: open >= 0 && leadOf(sentence) === leadOf(right) };
}
/** A fragment by its shape (the second, independent rule for sentence-or-fragment): it starts with a connecting word,
 *  starts with a verb (no subject), or has no verb at all. */
export function looksLikeFragment(text) {
  const w = lowWords(text);
  const verb = x => isPast(x) || HELPERS.has(x);
  if (SUBORDINATORS.includes(w[0])) return true;
  if (isPast(w[0])) return true;
  if (PREPOSITIONS.has(w[0]) && !w.slice(1).some(verb)) return true;
  return !w.some(verb);
}
const TELLING = /^(?:the )?[\p{L}']+ (?:was|is|were|are|felt|seemed) [a-z]+\.$/iu;
const PROGRESSIVE = /^(?:is|are|was|were|am|will be) [a-z]+ing$/;

// ------------------------------------------------------------------------------------------------- three-section cards
/** A writing topic's card: "Section 1, Facts. Guiding question: What is a fact? Worked passage: "S1 S2" Note." ->
 *  { sections: [{ title, question, passage: [{ label?, text, hl }], note }] }. Which sentences the card highlights is
 *  Oomba's own note (overrides.json card.sections[i].highlight: indexes of the section's sentences). */
export function parseSections(cardLines, problems, where, notes = {}) {
  const hl = ((notes.card || {}).sections || []);
  const sections = cardLines.map((l, i) => {
    const m = /^Section (\d+), (.+?)([.?]) Guiding question: (.+?\?) (?:(.+?) )?Worked passage: (.+)$/.exec(l.text);
    if (!m) { problems.push(`${where}: card line ${l.line} is not "Section N, Title. Guiding question: ...? Worked passage: ..."`); return null; }
    const [, , name, end, question, body, rest] = m, title = end === '?' ? `${name}?` : name;
    const bits = rest.split(/"([^"]+)"/);
    const passage = [];
    let label = bits[0].trim().replace(/:$/, '');
    let k = 1;
    for (; k < bits.length; k += 2) {
      for (const text of sentencesOf(bits[k])) { passage.push({ ...(label ? { label } : {}), text, hl: false }); label = ''; }
      const after = (bits[k + 1] || '').trim();
      // a short label ("Good paraphrase:") leads the next quote; prose between quotes starts the note, which keeps its
      // own quoted examples in quotation marks
      if (k + 2 < bits.length && (!after || /^[^.!?]{1,40}:$/.test(after))) label = after.replace(/:$/, '');
      else break;
    }
    const note = bits.slice(k + 1).map((b, j) => (j % 2 ? `\u201C${b}\u201D` : b)).join('').trim();
    const want = (hl[i] || {}).highlight;
    if (!Array.isArray(want) || !want.length || want.some(x => !passage[x])) problems.push(`${where}: section ${i + 1} needs overrides card.sections[${i}].highlight (sentences 0 to ${passage.length - 1})`);
    else for (const x of want) passage[x].hl = true;
    if (!passage.length) problems.push(`${where}: section ${i + 1} has no worked passage`);
    return { title, question, ...(body ? { body } : {}), passage, note };
  }).filter(Boolean);
  if (sections.length !== 3) problems.push(`${where}: a writing card has 3 sections, not ${sections.length}`);
  return { sections };
}

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
      if (kind === 'join') {
        // two thoughts need a joining word after the comma; "or" offers a choice, which the right sentence does not
        const c = (/, (and|but|or|so|yet) /.exec(o) || [])[1], rc = (/, (and|but|or|so|yet) /.exec(right) || [])[1];
        if (!rc) problems.push(`${at}: the right sentence has no comma and joining word`);
        if (c && !(c === 'or' && rc !== 'or')) problems.push(`${at}: wrong option "${o}" joins the thoughts with a fitting word`);
      }
      if (kind === 'connect') {
        const fragment = new RegExp(`[.!?] (${SUBORDINATORS.join('|')}) `, 'i').test(o);
        const has = SUBORDINATORS.find(w => hasWord(o, w)), rw = SUBORDINATORS.find(w => hasWord(right, w));
        const splice = !has && /, /.test(o);
        if (!fragment && !splice && !(rw === 'because' && has === 'although')) problems.push(`${at}: wrong option "${o}" adds the idea in a way that can read right`);
      }
      if (kind === 'label' && looksLikeFragment(it.text) !== (norm(right) === 'fragment')) problems.push(`${at}: "${it.text}" does not look like a ${right.toLowerCase()} by its shape`);
      if (kind === 'ab') {
        if (!TELLING.test(o)) problems.push(`${at}: the other option "${o}" is not a telling sentence`);
        if (TELLING.test(right)) problems.push(`${at}: the right option "${right}" names the feeling instead of showing it`);
      }
      if (kind === 'given') {
        if (!PROGRESSIVE.test(right)) problems.push(`${at}: the right form "${right}" is not progressive`);
        if (PROGRESSIVE.test(o)) problems.push(`${at}: wrong option "${o}" is progressive too`);
      }
      if (kind === 'shift') {
        // the time the first verb sets, read from the words before the blank, against each form's time
        const before = lowWords(it.text.split('___')[0]);
        const time = before.includes('will') ? 'future' : before.some(isPast) ? 'past' : 'present';
        const timeOf2 = w => (isPast(w) ? 'past' : /s$/.test(w) ? 'present' : 'base');
        const fits = w => (time === 'future' ? timeOf2(w) === 'base' : timeOf2(w) === time);
        if (!fits(right)) problems.push(`${at}: the right form "${right}" does not keep the ${time} time`);
        if (fits(o)) problems.push(`${at}: wrong option "${o}" keeps the ${time} time too`);
      }
      if (kind === 'tense') {
        const time = timeOf(it.text.split('___')[0]);
        if (time === 'future' && !/s$|ed$/.test(o) && !Object.values(IRREGULAR_PAST).includes(o)) problems.push(`${at}: "${o}" after will reads right`);
        if (time === 'past' && (/ed$/.test(o) || Object.values(IRREGULAR_PAST).includes(o))) problems.push(`${at}: "${o}" reads as a past form`);
        if (time === 'present' && /s$/.test(o) && !/ed$/.test(o) && /s$/.test(right)) problems.push(`${at}: "${o}" reads as a present form`);
      }
    });
  }
  // Fix items: every typed fix accepted follows the rules, and no wrong version of the cycle does.
  for (const it of topic.items) {
    if (topic.format !== 'fix') break;
    const right = it.options[it.answer[0]], fk = topic.fix && topic.fix.kind;
    if (!it.accept.includes(right)) problems.push(`${it.id}: the cycle's right version is not an accepted fix`);
    if (fk === 'runon') {
      const first = (/^(.+?)(?:, (?:and|but|or|so|yet) |\. |; )/.exec(right) || [])[1] || '';
      for (const a of it.accept) if (!joinsRight(a, first)) problems.push(`${it.id}: accepted fix "${a}" does not join the thoughts right`);
      for (const o of it.options) if (o !== right && (joinsRight(o, first) && /^\. |^; /.test(o.slice(first.length)))) problems.push(`${it.id}: wrong version "${o}" splits the thoughts right`);
      for (const o of it.options) if (o !== right && it.accept.includes(o)) problems.push(`${it.id}: wrong version "${o}" is an accepted fix`);
    }
    if (fk === 'dialogue' || fk === 'quote') {
      const ok = r => Object.values(r).every(Boolean);
      if (!ok(quoteRules(right, right))) problems.push(`${it.id}: the fix "${right}" breaks the quotation rules`);
      for (const o of it.options) if (o !== right && ok(quoteRules(o, right))) problems.push(`${it.id}: wrong version "${o}" follows every quotation rule`);
    }
  }
  return problems;
}

// ------------------------------------------------------------------------------------------------- grades 6-8
// A 6-8 topic mixes question shapes, so its format is 'items': each quiz line is read by the first reader below that
// knows its shape, and the item keeps its own format:
//   tap      highlight the word or phrase (answer: word places; optional: places that may be marked or not, such as
//            "the" before a noun; alts: other right answers, such as a second mention of the speaker; focus: the word
//            the question names, shown in bold)
//   capfix   click-to-fix capitalization, both ways (a word that needs a capital, or one that must lose it)
//   marks    punctuation chips: the gaps between words hold a mark from the topic's chip bank (read.chips) or none; the
//            sentence opens with the marks as written. want: the marks the right sentence has; optional: gaps where a
//            mark may go or not (a comma after a short opening phrase, the comma before "and" in a list)
//   choice   pick one (a blank, whole sentences, or pills for a label such as active / passive)
//   passage  judge the sentence in a short passage
//   fix      an error-fixing box that turns into press-to-cycle after a wrong answer
// read.asIs offers "It's right as it is" on every marks and fix question of the topic, so a sentence with nothing to
// fix can be asked without giving its answer away. Every generated wrong option has a rule name (it.rule) and is
// checked by checkItems, a second and independent rule.
const ITEM_LINE = /^(\d+)\.\s+(.+?)\s+Answer:\s+(.+?)\s+Hint:\s+(.+)$/;
const unq = s => String(s).trim().replace(/^"(.*)"\.?$/, '$1').replace(/^"(.*)"$/, '$1');
const bare = s => normTyped(s).replace(/[.]$/, '').toLowerCase();
const lc = s => (/^(The|A|An|My|Our|Their|His|Her) /.test(s) ? lowFirst(s) : s);

/** Quoted words inside a quoted item are written with single marks ('Stop!'); shown, they are real double quotes. An
 *  apostrophe (it's, the twins') is never one. A text whose single marks do not pair up is left as it is. */
export function doubleQuotes(text) {
  const s = String(text);
  let out = '', open = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== "'") { out += c; continue; }
    const prev = i ? s[i - 1] : ' ', next = i + 1 < s.length ? s[i + 1] : ' ';
    if (!open && /[\s(]/.test(prev) && /[\p{L}\p{N}]/u.test(next)) { out += '“'; open = true; }
    else if (open && !/\s/.test(prev) && !/[\p{L}\p{N}]/u.test(next)) { out += '”'; open = false; }
    else out += c;
  }
  return open ? s : out;
}

/** The word places of an answer in a text: the phrase once, or a list ("dog and moon", "The and the"). */
function placesOf(text, answer) {
  const toks = tokenize(text);
  const whole = findWords(toks, answer);
  if (whole.length === 1) return whole[0];
  const parts = String(answer).split(/,\s*(?:and\s+)?|\s+and\s+/).map(s => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const count = new Map();
  for (const p of parts) count.set(norm(p), (count.get(norm(p)) || 0) + 1);
  const out = [];
  for (const [w, c] of count) { const at = findWords(toks, w); if (at.length !== c) return null; out.push(...at.flat()); }
  return out.sort((a, b) => a - b);
}
const ARTICLES = new Set(['the', 'a', 'an', 'one']);
/** A noun phrase to tap ("the young sailor"): its words without the article, the article optional; every other
 *  mention of its last word is right too ("the sailor says"). */
function nounPhrase(text, answer) {
  const toks = tokenize(text);
  const at = findWords(toks, answer);
  if (at.length !== 1) return null;
  const core = at[0].filter(i => !ARTICLES.has(norm(toks[i].t)));
  const optional = at[0].filter(i => ARTICLES.has(norm(toks[i].t)));
  const head = core[core.length - 1];
  const alts = toks.flatMap((w, i) => (i !== head && norm(w.t) === norm(toks[head].t) ? [i] : [])).map(i => {
    const opt = [];
    for (let k = i - 1; k >= 0 && ARTICLES.has(norm(toks[k].t)) && !toks[k].post; k--) opt.push(k);
    return { answer: [i], optional: opt };
  });
  return { answer: core, optional, ...(alts.length ? { alts } : {}) };
}

// The rules behind generated wrong options (each with its independent check in checkItems).
/** Syllables, roughly (a final silent e does not count): enough to tell short words from long ones. */
export const syllables = w => (String(w).toLowerCase().replace(/e$/, '').match(/[aeiouy]+/g) || ['x']).length;
const withEnding = (w, suf) => (/e$/.test(w) ? w + suf.slice(1) : /[^aeiou]y$/.test(w) ? `${w.slice(0, -1)}i${suf}`
  : /^[^aeiou]*[aeiou][^aeiouwxy]$/.test(w) ? w + w.slice(-1) + suf : w + suf);
const takesEnding = w => !(/ly$/.test(w) && w !== 'early') && (syllables(w) === 1 || (syllables(w) === 2 && /y$/.test(w)));
/** The comparative or superlative of an adjective or adverb, by the card's rules: a short word takes er or est (with its
 *  spelling change), a longer one (and most ly adverbs) takes more or most. */
export function degreeOf(w, deg) {
  const comp = deg === 'comparative';
  return takesEnding(w) ? withEnding(w, comp ? 'er' : 'est') : `${comp ? 'more' : 'most'} ${w}`;
}
/** Adjective order (opinion, size, age, shape, color, origin, material, purpose): each listed word's place. */
export const ADJ_ORDER = Object.freeze({ lovely: 0, delicious: 0, beautiful: 0, kind: 0, soft: 0, big: 1, small: 1, huge: 1, tiny: 1,
  old: 2, ancient: 2, round: 3, square: 3, red: 4, blue: 4, gray: 4, white: 4, french: 5, wooden: 6, stone: 6, silk: 6, metal: 6, cotton: 6, toy: 7 });
const adjRanks = phrase => lowWords(phrase).filter(w => !ARTICLES.has(w) && Object.hasOwn(ADJ_ORDER, w)).map(w => ADJ_ORDER[w]);
const inOrder = phrase => { const r = adjRanks(phrase); return r.length > 1 && r.every((x, i) => !i || r[i - 1] <= x); };
/** Correlative conjunctions: the first half -> its partner. */
export const CORRELATIVE = Object.freeze({ both: 'and', either: 'or', neither: 'nor', 'not only': 'but also', whether: 'or' });
const PARTNERS = ['and', 'or', 'nor', 'but also'];
/** What each coordinating conjunction does (8.2's card); but and yet both contrast, or and nor both choose, so neither of
 *  a pair is ever the other's wrong option. */
export const FUNCTION_OF = Object.freeze({ for: 'It gives a reason.', and: 'It adds.', nor: 'It gives a negative choice.', but: 'It shows a contrast.',
  or: 'It gives a choice.', yet: 'It shows a surprising contrast.', so: 'It shows a result.' });
const FUNCTION_KIN = { but: ['yet'], yet: ['but'], or: ['nor'], nor: ['or'] };
/** Tense names by form: will + verb (simple future), be + ing (progressive), have + participle (perfect). */
export function tenseOf(vp) {
  const w = lowWords(vp);
  if (w[0] === 'will' && w.length === 2) return 'simple future';
  if (w.length === 2 && /ing$/.test(w[1])) return ['is', 'are', 'am'].includes(w[0]) ? 'present progressive' : ['was', 'were'].includes(w[0]) ? 'past progressive' : null;
  if (w.length === 2 && ['has', 'have'].includes(w[0])) return 'present perfect';
  if (w.length === 2 && w[0] === 'had') return 'past perfect';
  if (w.length === 1) return isPast(w[0]) ? 'simple past' : /s$/.test(w[0]) ? 'simple present' : null;
  return null;
}
const TENSE_TIMES = ['past', 'present', 'future'], TENSE_ASPECTS = ['simple', 'progressive', 'perfect'];
const tenseName = (time, aspect) => (aspect === 'simple' ? `simple ${time}` : `${time} ${aspect}`);
const tenseParts = name => { const [a, b] = name.split(' '); return a === 'simple' ? [b, 'simple'] : [a, b]; };
/** Transition words by what they show (7.1's card). */
export const TRANSITION_KIND = Object.freeze({ also: 'Adding an idea', 'in addition': 'Adding an idea', furthermore: 'Adding an idea',
  however: 'Contrast', 'on the other hand': 'Contrast', nevertheless: 'Contrast', although: 'Contrast',
  therefore: 'Cause and effect', 'as a result': 'Cause and effect', consequently: 'Cause and effect',
  first: 'Order of steps', next: 'Order of steps', finally: 'Order of steps', then: 'Order of steps' });
const PARTICIPLES = new Set(['built', 'held', 'sent', 'won', 'caught', 'made', 'told', 'sung', 'drawn', 'done', 'eaten', 'given', 'written', 'taken', 'seen', 'known', 'shown', 'broken', 'lost', 'found']);
/** Passive voice by form: a form of be, then a past participle. */
export const isPassive = s => { const w = lowWords(s); return w.some((x, i) => ['is', 'are', 'was', 'were', 'be', 'been', 'being'].includes(x) && w[i + 1] && (PARTICIPLES.has(w[i + 1]) || /ed$/.test(w[i + 1]))); };
function baseFromPast(p) {
  for (const [b, past] of Object.entries(IRREGULAR_PAST)) if (past === p) return b;
  return [p.slice(0, -2), p.slice(0, -1), `${p.slice(0, -3)}y`, p.slice(0, -3)].find(c => c && pastOf(c) === p) || null;
}
/** The longest run of the same words, in order, two texts share. */
export function sharedRun(a, b) {
  const A = lowWords(a), Bw = lowWords(b);
  let best = 0;
  for (let i = 0; i < A.length; i++) for (let j = 0; j < Bw.length; j++) { let k = 0; while (A[i + k] && A[i + k] === Bw[j + k]) k++; best = Math.max(best, k); }
  return best;
}
/** Adverbs of time, place and manner (3.4's card; a word in ly tells how). */
const ADVERB_KIND = { tomorrow: 'time', yesterday: 'time', soon: 'time', recently: 'time', today: 'time', underneath: 'place', away: 'place', here: 'place', high: 'place', there: 'place' };
const adverbKind = w => ADVERB_KIND[norm(w)] || (/ly$/.test(norm(w)) ? 'manner' : null);
/** Long-form and short-form works (9.1's card). */
const LONG_WORKS = ['book', 'movie', 'play', 'album', 'magazine', 'newspaper'], SHORT_WORKS = ['chapter', 'poem', 'song', 'article', 'short story'];
const workKind = s => { const t = String(s).toLowerCase(); return SHORT_WORKS.some(k => new RegExp(`is an? ${k}\\b`).test(t)) ? 'short' : LONG_WORKS.some(k => new RegExp(`is an? ${k}\\b`).test(t)) ? 'long' : null; };
/** a or an by the sound the next word starts with: a vowel letter, except the words that start with a "you" sound;
 *  an before a silent h. */
const A_AN_SOUNDS = { vowel: ['honor', 'honest', 'hour', 'heir'], consonant: ['unicorn', 'university', 'uniform', 'one', 'used', 'useful'] };
const anBefore = w => { const x = norm(w); return A_AN_SOUNDS.vowel.includes(x) || (/^[aeiou]/.test(x) && !A_AN_SOUNDS.consonant.includes(x)); };
const CONTRACTION = /(n't|'re|'ll|'ve|'m|'d)$|^(it|he|she|that|what|there)'s$/i;
const POSSESSIVE_PRONOUNS = ['yours', 'hers', 'ours', 'theirs', 'his', 'its'];
const CONJ_FAMILY = { but: ['but', 'yet'], yet: ['yet', 'but'], so: ['so'], and: ['and'], or: ['or'], nor: ['nor'], for: ['for'] };
const CONJ_WRONG = { but: 'so', yet: 'so', so: 'but', and: 'or', or: 'and', nor: 'or', for: 'so' };
const SPLICE_JOINERS = { so: ['so', 'and'], and: ['and', 'so'], but: ['but', 'yet'], yet: ['yet', 'but'], or: ['or'] };
/** A sentence's two thoughts and how they are joined: 'joined' (a comma and a coordinating conjunction, a semicolon, or
 *  a period), 'splice' (a comma alone) or 'fused' (nothing). first: the first thought as the sentence writes it. */
export function joinOf(s, first) {
  const rest = s.slice(first.length);
  if (new RegExp(`^, (${FANBOYS.join('|')}) `).test(rest) || /^; /.test(rest) || /^\. [A-Z]/.test(rest)) return 'joined';
  if (/^, /.test(rest)) return 'splice';
  return /^ [a-z]/i.test(rest) ? 'fused' : null;
}
/** A citation as the card writes it: (Last 12) right before the sentence's period. */
const CITE_RIGHT = /[^.\s] \([A-Z][a-z]+ \d+\)\.$/;

/** One quiz line of a 6-8 topic, read into its parts: { n, q, a, hint, text?, question? } (text and question: the
 *  sentence or passage the line quotes first, and what it asks about it; "Same passage." reuses the last one). */
function rawOf(line, ctx, def = {}) {
  const m = ITEM_LINE.exec(line.text);
  if (!m) return null;
  const [, n, q, a, hint] = m;
  const r = { n: +n, q, a: a.trim(), hint: hint.trim() };
  let x;
  // "Passage: "..." Ask: Which sentence ...?" asks like "Passage: "..." Which sentence ...?"
  if ((x = /^(?:Passage|Original): "(.+)" (\S.+)$/.exec(q))) { r.text = x[1]; r.question = x[2].replace(/^Ask: /, ''); r.passage = true; ctx.last = x[1]; }
  else if ((x = /^Same (?:passage|original)\. (.+)$/.exec(q))) { r.text = ctx.last; r.question = x[1]; r.passage = true; }
  else if ((x = /^Read the sentence: "([^"]+)" Ask: (.+)$/.exec(q))) { r.text = x[1]; r.question = x[2]; }
  else if ((x = /^"([^"]+)" (\S[^"]*)$/.exec(q))) { r.text = x[1]; r.question = x[2]; }
  // only the sentence: the topic's read.bare says what it asks
  else if ((x = /^"([^"]+)"$/.exec(q)) && def.read && def.read.bare) { r.text = x[1]; r.bare = true; }
  return r;
}

/** The readers, in order: (raw, topic def, problems, at) -> an item, false (the shape is known but the item is wrong; a
 *  problem was added) or null (not this shape). */
const READERS = [
  // judge the sentence in a passage: "Passage: "..." Which sentence is the claim? Answer: the first sentence."
  function judge(r, def, problems, at) {
    const o = /^the (first|second|third|fourth|fifth) sentence\.?$/.exec(r.a);
    if (!r.passage || !o) return null;
    const options = sentencesOf(r.text), k = ORDINALS.indexOf(o[1]);
    if (k >= options.length) { problems.push(`${at}: the passage has no ${o[1]} sentence`); return false; }
    if (new RegExp(`\\b(${ORDINALS.join('|')})\\b`, 'i').test(r.hint)) problems.push(`${at}: the hint points at a sentence`);
    return { format: 'passage', text: r.text, ask: r.question, options, answer: [k], right: options[k], rule: 'judge' };
  },
  // "Fill in the blank: "She is a ___ singer." Choose good or well." and "Which transition fits: "..." Choose A or B."
  function fillIn(r, def, problems, at) {
    const m = /^(?:Fill in the blank: |(.+?): )?"([^"]*___[^"]*)" Choose (.+?)\.$/.exec(r.q);
    if (!m) return null;
    const [, lead, text, list] = m;
    const given = list.split(/,? or |, /).map(s => s.trim());
    const start = !text.split('___')[0].trim();
    const options = given.map(w => (start ? capFirst(w) : w));
    const k = options.findIndex(o => o === unq(r.a).replace(/\.$/, ''));
    if (k < 0) { problems.push(`${at}: the answer "${r.a}" is not one of ${options.join(' / ')} as the sentence needs it`); return false; }
    if (hintLeaks(r.hint, options[k], options.filter((_, i) => i !== k))) problems.push(`${at}: the hint names the answer "${options[k]}" and not the other choices`);
    const [before, after] = text.split('___');
    return { format: 'choice', text, ...(lead ? { ask: `${capFirst(lead)}?` } : {}), options, answer: [k], right: `${before}${options[k]}${after}`, rule: 'given',
      ...(def.read && def.read.cycle ? { cycle: true } : {}) };
  },
  // two or three quoted versions: "Which sentence is punctuated correctly: "A" or "B"?"
  function whichOf(r, def, problems, at) {
    const m = /^(.*?)\b((?:Which|Where)\b[^"]*?):? ("[^"]+"(?:,? (?:or )?"[^"]+")+)\?$/.exec(r.q);
    if (!m) return null;
    const [, lead, ask, list] = m;
    const options = [...list.matchAll(/"([^"]+)"/g)].map(x => doubleQuotes(x[1]));
    if (options.length < 2) return null;
    const k = options.findIndex(o => bare(o) === bare(doubleQuotes(unq(r.a))));
    if (k < 0) { problems.push(`${at}: the answer is not one of the versions`); return false; }
    const prompt = doubleQuotes(lead.trim());
    return { format: 'choice', text: options[k], ask: `${ask}?`, ...(prompt ? { prompt } : {}), options, answer: [k], right: options[k], whole: true, rule: 'given' };
  },
  // unquoted choices: "Which is NOT a job of a conclusion: restating the claim, leaving a final thought, or ...?"
  function listOf(r) {
    const m = /^(Which (?:is|should)[^:"]+): ([^"?]+?),? or ([^"?]+)\?$/.exec(r.q);
    if (!m) return null;
    const options = [...m[2].split(/, /), m[3]].map(capFirst);
    const k = options.findIndex(o => bare(o) === bare(r.a));
    if (k < 0) return null;
    return { format: 'choice', text: options[k], ask: `${m[1]}?`, options, answer: [k], right: options[k], whole: true, rule: 'given' };
  },
  // "Fix the punctuation: "..." Answer: "..."": the punctuation chips; "Is a comma needed? No comma is needed." asks
  // the same sentence, right as it is.
  function marks(r, def, problems, at) {
    const m = /^Fix the punctuation: "(.+)"( Is a comma needed\?)?$/.exec(r.q);
    if (!m || (def.read && def.read.fix)) return null;
    const text = doubleQuotes(m[1]);
    const right = m[2] ? (/^No comma is needed\.?$/.test(r.a) ? text : null) : doubleQuotes(unq(r.a));
    if (!right) { problems.push(`${at}: "Is a comma needed?" answers other than "No comma is needed."`); return false; }
    return marksItem(text, right, def, problems, at);
  },
  // "Fix the capitalization: "..."": tap each word whose capital is wrong (it gets one, or loses it)
  function capfix(r, def, problems, at) {
    const m = /^Fix the capitalization: "(.+)"$/.exec(r.q);
    if (!m) return null;
    const text = doubleQuotes(m[1]), right = doubleQuotes(unq(r.a));
    const diff = capitalDiff(text, right);
    // nothing to fix: asked with "It's right as it is" (read.asIs)
    if (diff && !diff.length && def.read && def.read.asIs) return { format: 'capfix', text, answer: [], fixed: [], right, rule: 'capital' };
    if (!diff || !diff.length) { problems.push(`${at}: the fix is not the sentence with capitals changed`); return false; }
    const toks = tokenize(right);
    return { format: 'capfix', text, answer: diff, fixed: diff.map(i => toks[i].t), right, rule: 'capital' };
  },
  // an error-fixing box: "Fix the error: ...", "Fix the spelling: ...", "Fix this comma splice with a semicolon: ..."
  function fix(r, def, problems, at) {
    const m = /^Fix (?:the error|the spelling|the punctuation|this (?:comma splice|fused sentence) with (a period|a semicolon|a comma and a FANBOYS word)): "(.+)"( Is this correct\?)?$/.exec(r.q);
    if (!m) return null;
    const [, how, given] = m;
    let right;
    if (/^Yes, it is correct\.?$/.test(r.a)) right = given;
    else { const y = /^(?:No\. The correct sentence is )?"(.+)"\.?$/.exec(r.a); right = y ? y[1] : null; }
    if (!right) { problems.push(`${at}: the fix is not a quoted sentence`); return false; }
    return fixItem(doubleQuotes(given), doubleQuotes(right), how || null, def, problems, at);
  },
  // "Is this correct: "..."? Yes, it is correct.": in a fix topic the box itself (right as it is), else two pills
  function correct(r, def, problems, at) {
    const m = /^Is this (?:sentence )?correct: "(.+)"\?$/.exec(r.q);
    if (!m) return null;
    const yes = /^Yes\b/.test(r.a);
    const text = doubleQuotes(m[1]);
    if (def.read && def.read.fix && !def.read.labels) {
      if (!yes) { problems.push(`${at}: a "no" here needs its fix written out`); return false; }
      return fixItem(text, text, null, def, problems, at);
    }
    const labels = (def.read && def.read.labels) || ['Correct', 'Needs a fix'];
    const k = yes ? labels.findIndex(l => /^correct$/i.test(l)) : -1;
    if (k < 0) { problems.push(`${at}: no "Correct" pill for this item`); return false; }
    return labelItem(text, labels, labels[k], r, problems, at, { rule: def.read.check || 'given', ask: 'Is this sentence correct?' });
  },
  // two or three pills the question names: "Is this sentence active or passive?", "Is "don't" a contraction or a
  // possessive?", "Is this a comma splice, a fused sentence, or correct: "..."?"
  function pills(r, def, problems, at) {
    let text = r.text, labels, ask = r.question || r.q, focus = null, x;
    const q = r.question || '';
    if ((x = /^Is (this sentence|this thought|[^"]+?) (?:an? )?([\w-]+) or (?:an? )?([\w-]+)(?: noun)?\?$/.exec(q)) && text) { labels = [x[2], x[3]]; if (!/^this /.test(x[1])) focus = x[1]; }
    else if ((x = /^Is (this|it) ([\w-]+) or ([\w-]+)\?$/.exec(q.replace(/^.*?\. /, ''))) && text) { labels = [x[2], x[3]]; text = r.q.replace(/ Is it .*$/, ''); }
    else if ((x = /^(.+?\.) In print, should it be (.+?) or (.+?)\?$/.exec(r.q.replace(/^"([^"]+)"/, '$1'))) ) { text = x[1]; labels = [x[2], x[3]]; ask = 'In print, should it be italicized or in quotation marks?'; }
    else if ((x = /^(.+?\.) Is it (.+?) or (.+?)\?$/.exec(r.q.replace(/^"([^"]+)"/, '$1')))) { text = x[1]; labels = [x[2], x[3]]; ask = `Is it ${x[2]} or ${x[3]}?`; }
    else if ((x = /^Is "([^"]+)" an? (\w+) or an? (\w+)\?$/.exec(r.q))) { text = x[1]; labels = [x[2], x[3]]; ask = `Is it a ${x[2]} or a ${x[3]}?`; }
    else if ((x = /^Is this thought (\w+) or (\w+): "(.+)"\?$/.exec(r.q))) { text = x[3]; labels = [x[1], x[2]]; ask = 'Is this thought complete or incomplete?'; }
    else if ((x = /^Is this a ([\w ]+?), a ([\w ]+?), or (\w+): "(.+)"\?$/.exec(r.q))) { text = x[4]; labels = [x[1], x[2], x[3]]; ask = 'Is it a comma splice, a fused sentence, or correct?'; }
    else if ((x = /^Which voice is used(?:, and what does it emphasize)?\?$/.exec(q)) && text) { labels = ['active voice', 'passive voice']; ask = 'Which voice is used?'; }
    else if ((x = /^What kind of adverb is (\S+)\?$/.exec(q)) && text) { labels = ['adverb of time', 'adverb of place', 'adverb of manner']; focus = x[1]; }
    else return null;
    const ans = r.a.split(',')[0].replace(/\.$/, '').replace(/^(?:a|an) (?=\w)/i, '');
    const shown = labels.map(capFirst);
    const k = shown.findIndex(l => norm(l) === norm(ans));
    if (k < 0) { problems.push(`${at}: the answer "${r.a}" is not one of ${shown.join(' / ')}`); return false; }
    const f = focus && text ? placesOf(text, focus) : null;
    return labelItem(doubleQuotes(text), shown, shown[k], r, problems, at, { ask: capFirst(ask), rule: (def.read && def.read.check) || 'given', ...(f ? { focus: f } : {}) });
  },
  // "What is the function of so?": the function, and two that no other coordinating conjunction of its kind shares
  function functionOf(r, def, problems, at) {
    const x = r.text && /^What is the function of (\w+)\?$/.exec(r.question || '');
    if (!x) return null;
    const w = x[1].toLowerCase(), right = FUNCTION_OF[w];
    if (!right || norm(right) !== norm(r.a)) { problems.push(`${at}: the answer is not the card's function of "${w}"`); return false; }
    const others = Object.keys(FUNCTION_OF).filter(c => c !== w && !(FUNCTION_KIN[w] || []).includes(c));
    const wrong = seededShuffle(others, `${at}|fn`).slice(0, 2).map(c => FUNCTION_OF[c]);
    const options = seededShuffle([right, ...wrong], at);
    return { format: 'choice', text: r.text, ask: capFirst(r.question), options, answer: [options.indexOf(right)], right: r.text, label: right, plain: true, rule: 'function', word: w, focus: placesOf(r.text, w) || [] };
  },
  // "Which tense is has walked?": the tense by its form, one with the same time and one with the same kind of form
  function tense(r, def, problems, at) {
    const x = r.text && /^Which tense is (.+?)\?$/.exec(r.question || '');
    if (!x) return null;
    const right = tenseOf(x[1]);
    if (right !== r.a.replace(/\.$/, '')) { problems.push(`${at}: the form rule makes "${right}", not "${r.a}"`); return false; }
    const [time, aspect] = tenseParts(right);
    const nextAspect = TENSE_ASPECTS[(TENSE_ASPECTS.indexOf(aspect) + 1) % 3];
    const otherTime = time === 'past' ? 'present' : 'past';
    const wrong = [tenseName(time, nextAspect), tenseName(otherTime, aspect)];
    const options = seededShuffle([right, ...wrong].map(capFirst), at);
    return { format: 'choice', text: r.text, ask: `Which tense is ${x[1]}?`, options, answer: [options.indexOf(capFirst(right))], right: r.text, label: capFirst(right), plain: true,
      rule: 'tense', verb: x[1], focus: placesOf(r.text, x[1]) || [] };
  },
  // "What does as a result show?": what the transition does
  function transition(r, def, problems, at) {
    const x = r.text && /^What do(?:es)? (.+?) show\?$/.exec(r.question || '');
    if (!x) return null;
    const labels = ['Adding an idea', 'Contrast', 'Cause and effect', 'Order of steps'];
    const k = labels.findIndex(l => norm(l) === norm(r.a.replace(/^the /, '').replace(/\.$/, '')));
    if (k < 0) { problems.push(`${at}: "${r.a}" is not one of the transition kinds`); return false; }
    return labelItem(r.text, labels, labels[k], r, problems, at, { ask: capFirst(r.question), rule: 'transition', words: x[1] });
  },
  // "Who is the speaker?": tap the person in the passage
  function who(r, def, problems, at) {
    const x = r.text && /^Who is the (speaker|listener)\?$/.exec(r.question || '');
    if (!x) return null;
    const text = doubleQuotes(r.text), np = nounPhrase(text, r.a.replace(/\.$/, ''));
    if (!np) { problems.push(`${at}: "${r.a}" is not in the passage once`); return false; }
    return { format: 'tap', text, ask: `${r.question} Tap the person.`, ...np, rule: 'tap' };
  },
  // tap the word or phrase the question asks for
  function tap(r, def, problems, at) {
    const q = r.question || '';
    const x = r.text && (/^(?:Which words? (?:is|are) .+|What is the (?:pronoun )?(?:subject|verb|direct object)(?: in the second sentence)?|Which is the dependent clause|Where (?:is|are) the adjectives?(?:, and what do(?:es)? (?:it|they) describe)?|What does (\S+) describe)\?$/.exec(q));
    if (!x) return null;
    const text = doubleQuotes(r.text);
    let ans = unq(r.a).replace(/\.$/, '');
    if (def.read && def.read.answerHead) ans = ans.split(/,? (?:before|after)\b/)[0];
    const places = placesOf(text, ans);
    if (!places) { problems.push(`${at}: the answer "${ans}" is not in the sentence once`); return false; }
    const rule = new Set(((def.read && def.read.ruleWords) || []).map(norm));
    if (!places.every(i => rule.has(norm(tokenize(text)[i].t))) && hintLeaks(r.hint, ans)) problems.push(`${at}: the hint names the answer "${ans}"`);
    const focus = x[1] ? placesOf(text, x[1]) : null;
    return { format: 'tap', text, ...(def.read && def.read.answerHead ? {} : { ask: q }), answer: places, rule: 'tap', ...(focus ? { focus } : {}) };
  },
  // "Form the comparative of tall: "The oak is ___ than the maple." Answer: taller."
  function degree(r, def, problems, at) {
    const x = /^Form the (comparative|superlative)(?: adverb)? of (\S+): "(.+___.+)"$/.exec(r.q);
    if (!x) return null;
    const [, deg, w, text] = x, right = degreeOf(w, deg);
    if (right !== r.a.replace(/\.$/, '')) { problems.push(`${at}: the rules make "${right}", not "${r.a}"`); return false; }
    const other = degreeOf(w, deg === 'comparative' ? 'superlative' : 'comparative');
    // the wrong way to compare: more or most with a one-beat word (never with a two-beat y word, where some writers use
    // it), or an ending on a long word
    const method = takesEnding(w) ? (syllables(w) === 1 ? `${deg === 'comparative' ? 'more' : 'most'} ${w}` : null) : withEnding(w, deg === 'comparative' ? 'er' : 'est');
    const naive = `${w}${deg === 'comparative' ? 'er' : 'est'}`;
    const wrong = [...new Set([other, ...(method ? [method] : []), ...(takesEnding(w) && naive !== right && !/e$/.test(w) ? [naive] : [])])].filter(o => o !== right);
    const options = seededShuffle([right, ...wrong], at);
    const [before, after] = text.split('___');
    return { format: 'choice', text, ask: `Choose the ${deg} of ${w}.`, options, answer: [options.indexOf(right)], right: `${before}${right}${after}`, rule: 'degree', word: w, degree: deg };
  },
  // "Rewrite in active voice: "The window was washed by Ana." Answer: "Ana washed the window.""
  function rewrite(r, def, problems, at) {
    const x = /^Rewrite in active voice: "(.+)"$/.exec(r.q);
    if (!x) return null;
    const p = /^(.+?) (was|were) (\w+) by (.+?)\.$/.exec(x[1]), right = unq(r.a);
    const y = p && new RegExp(`^${capFirst(p[4]).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (\\w+) ${lc(p[1])}\\.$`).exec(right);
    if (!y) { problems.push(`${at}: the rewrite is not the doer, the verb and the receiver`); return false; }
    const [, recv, be, part, doer] = p, verb = y[1], base = baseFromPast(verb);
    if (!base) { problems.push(`${at}: "${verb}" is not a past form the rules know`); return false; }
    const plural = /[^s]s$/.test(doer);
    const wrong = [`${capFirst(recv)} ${verb} ${lc(doer)}.`, `${capFirst(recv)} ${be} ${part}.`, `${capFirst(doer)} ${plural ? base : presentOf(base)} ${lc(recv)}.`];
    const options = seededShuffle([right, ...wrong], at);
    return { format: 'choice', text: x[1], prompt: x[1], ask: 'Choose the sentence in active voice that keeps its meaning and time.', options, answer: [options.indexOf(right)], right, whole: true,
      rule: 'rewrite', doer: capFirst(doer), recv: capFirst(recv), verb };
  },
  // "Put the adjectives in order: "red / big / ball""
  function order(r, def, problems, at) {
    const x = /^Put the adjectives in order: "(.+)"$/.exec(r.q);
    if (!x) return null;
    const bits = x[1].split(/\s*\/\s*/), noun = bits[bits.length - 1], right = r.a.replace(/\.$/, '');
    if (!sameBag(bits.join(' '), right) || !right.endsWith(noun)) { problems.push(`${at}: the answer is not the same words`); return false; }
    const adj = words(right).slice(0, -1);
    const perms = adj.length === 2 ? [[adj[1], adj[0]].join(' '), `${adj[0]}, ${adj[1]}`]
      : [[...adj].reverse().join(' '), [adj[1], adj[0], ...adj.slice(2)].join(' '), [...adj.slice(0, -2), adj[adj.length - 1], adj[adj.length - 2]].join(' ')];
    const wrong = [...new Set(perms.map(p => `${p} ${noun}`))].filter(o => o !== right);
    const options = seededShuffle([right, ...wrong], at);
    return { format: 'choice', text: right, prompt: bits.join(' / '), ask: 'Choose the adjectives in the right order.', options, answer: [options.indexOf(right)], right, whole: true, rule: 'order' };
  },
  // "Match the pair: "Both Ana ___ Leo finished the race." Answer: and."
  function correlative(r, def, problems, at) {
    const x = /^Match the pair: "(.+___.+)"$/.exec(r.q);
    if (!x) return null;
    const before = x[1].split('___')[0].toLowerCase();
    const first = /\bnot only\b/.test(before) ? 'not only' : ['both', 'either', 'neither', 'whether'].filter(w => hasWord(before, w)).pop();
    const right = CORRELATIVE[first];
    if (!right || right !== r.a.replace(/\.$/, '')) { problems.push(`${at}: the pair's partner is not the answer`); return false; }
    const wrong = seededShuffle(PARTNERS.filter(p => p !== right), `${at}|pair`).slice(0, 2);
    const options = seededShuffle([right, ...wrong], at);
    const [b, a] = x[1].split('___');
    return { format: 'choice', text: x[1], ask: 'Choose the word that completes the pair.', options, answer: [options.indexOf(right)], right: `${b}${right}${a}`, rule: 'correlative', first,
      ...(def.read && def.read.cycle ? { cycle: true } : {}) };
  },
  // "Capitalize this title: "the road not taken""
  function title(r, def, problems, at) {
    const x = /^Capitalize this title: "(.+)"$/.exec(r.q);
    if (!x) return null;
    const right = unq(r.a);
    if (titleCase(x[1]) !== right) { problems.push(`${at}: the title rules make "${titleCase(x[1])}", not "${right}"`); return false; }
    const options = seededShuffle([right, ...wrongTitles(right).slice(0, 2)], at);
    return { format: 'choice', text: right, prompt: x[1], ask: 'Choose the title with the right capital letters.', options, answer: [options.indexOf(right)], right, whole: true, rule: 'title' };
  },
  // "Add the citation to this sentence: "..." The source is Ana Lopez, page 7."
  function cite(r, def, problems, at) {
    const x = /^(?:Where does the citation go in this sentence|Add the citation to this sentence): "(.+?)"\??\s*The source is (.+?), page (\d+)\.$/.exec(r.q);
    if (!x) return null;
    const base = x[1].replace(/\.$/, ''), last = words(x[2]).pop(), page = x[3], right = unq(r.a);
    if (right !== `${base} (${last} ${page}).`) { problems.push(`${at}: the citation rules make "${base} (${last} ${page})."`); return false; }
    const wrong = [`${base}. (${last} ${page})`, `${base} (${last}, ${page}).`, `${base} (${last} p. ${page}).`];
    const options = seededShuffle([right, ...wrong], at);
    return { format: 'choice', text: right, prompt: `${x[1]} The source is ${x[2]}, page ${page}.`, ask: 'Choose the sentence with the citation written the right way.', options, answer: [options.indexOf(right)], right, whole: true, rule: 'cite' };
  },
  // a paraphrase: "Which is a good paraphrase?" / "Which is too close to the original?" (the two answers of one
  // original are each other's wrong option; the original itself, copied word for word, is never a good paraphrase)
  function paraphrase(r, def, problems, at, ctx) {
    const x = r.passage && /^Which is (a good paraphrase|too close to the original)\?$/.exec(r.question || '');
    if (!x) return null;
    const pair = ctx.raws.filter(o => o.text === r.text && /^Which is (a good paraphrase|too close to the original)\?$/.test(o.question || ''));
    const good = pair.find(o => /good/.test(o.question)), close = pair.find(o => /close/.test(o.question));
    if (!good || !close) { problems.push(`${at}: the original has no good paraphrase and too-close version both`); return false; }
    const g = unq(good.a), c = unq(close.a), right = /good/.test(x[1]) ? g : c;
    const opts = /good/.test(x[1]) ? [g, c, r.text] : [c, g];
    const options = seededShuffle(opts, at);
    return { format: 'choice', text: right, prompt: `Original: ${r.text}`, ask: capFirst(r.question), options, answer: [options.indexOf(right)], right, whole: true, rule: 'paraphrase', original: r.text, good: /good/.test(x[1]) };
  },
  // a question about a passage whose answer is not in it ("What is the plot clue?"): the answer, and the answers the same
  // question has for the topic's other passages
  function pool(r, def, problems, at, ctx) {
    if (!r.passage) return null;
    const key = s => { const w = lowWords(s); return `${w[0]} ${w[1]} ${w[w.length - 1]}`; };
    const right = capFirst(unq(r.a).replace(/\.$/, ''));
    const sibs = ctx.raws.filter(o => o !== r && o.passage && o.question && key(o.question) === key(r.question) && o.text !== r.text);
    const extra = ((def.read && def.read.pool) || {})[key(r.question)] || [];
    const wrong = [...new Set([...sibs.map(o => capFirst(unq(o.a).replace(/\.$/, ''))), ...extra])].filter(o => norm(o) !== norm(right));
    if (!wrong.length) return null;
    const options = seededShuffle([right, ...seededShuffle(wrong, `${at}|pool`).slice(0, 2)], at);
    return { format: 'choice', text: doubleQuotes(r.text), ask: capFirst(r.question), options, answer: [options.indexOf(right)], right: doubleQuotes(r.text), label: right, plain: true, rule: 'pool' };
  },
];

/** Pills for a label: the sentence shown as it is, the labels in a fixed order. */
function labelItem(text, labels, right, r, problems, at, extra = {}) {
  const k = labels.indexOf(right);
  if (hintLeaks(r.hint, right, labels.filter(l => l !== right))) problems.push(`${at}: the hint names the answer "${right}"`);
  return { format: 'choice', text, options: labels, answer: [k], right: text, label: right, plain: true, ...extra };
}
/** The gap marks of a sentence: its words with the chip marks taken off ({ w, m }); a mark stuck to other marks (a
 *  comma inside closing quotes) stays part of the word. */
function gapsOf(text) {
  const toks = tokenize(text);
  return toks.map((w, i) => { const m = i < toks.length - 1 && /^[,;:]$/.test(w.post) ? w.post : ''; return { w: m ? { ...w, post: '' } : w, m }; });
}
const SHORT_OPENING = 4;
/** A punctuation-chips item: the words, the marks as written (start) and as they must be (want), and the optional gaps:
 *  read.optional 'intro' (a comma after a short opening phrase with no verb), 'series' (the comma before the "and" or
 *  "or" that ends a list of three or more), 'trailing' (the comma before a trailing "including" or "although"). */
function marksItem(text, right, def, problems, at) {
  const A = gapsOf(text), Bg = gapsOf(right);
  if (A.length !== Bg.length || A.some((x, i) => x.w.t !== Bg[i].w.t || x.w.pre !== Bg[i].w.pre || x.w.post !== Bg[i].w.post)) { problems.push(`${at}: the fix changes more than the marks between words`); return false; }
  const want = Bg.flatMap((x, i) => (x.m ? [[i, x.m]] : [])), start = A.flatMap((x, i) => (x.m ? [[i, x.m]] : []));
  const chips = (def.read && def.read.chips) || [','];
  for (const [, mk] of [...want, ...start]) if (!chips.includes(mk)) problems.push(`${at}: the mark "${mk}" is not in the topic's chips`);
  const opt = (def.read && def.read.optional) || [];
  const optional = want.filter(([g, mk]) => {
    if (mk !== ',') return false;
    if (opt.includes('intro') && g + 1 <= SHORT_OPENING && want.filter(x => x[0] < g).length === 0) {
      const lead = Bg.slice(0, g + 1).map(x => x.w.t.toLowerCase());
      if (PREPOSITIONS.has(lead[0]) && !lead.slice(1).some(w => isPast(w) || HELPERS.has(w))) return true;
    }
    if (opt.includes('series') && /^(and|or)$/i.test(Bg[g + 1].w.t) && want.filter(x => x[1] === ',' && x[0] < g).length >= 1) return true;
    // a comma before a trailing "including" or "although" (content review: with or without)
    if (opt.includes('trailing') && /^(including|although)$/i.test(Bg[g + 1].w.t)) return true;
    return false;
  });
  const need = want.filter(x => !optional.includes(x));
  return { format: 'marks', text, words: A.map(x => x.w), start, want: need, optional, chips, right, rule: 'marks' };
}
/** An error-fixing box by the topic's read.fix: the fixes accepted, and the cycle's wrong versions. */
function fixItem(text, right, how, def, problems, at) {
  const kind = def.read.fix;
  let accept = [right], wrong = [];
  const swap = (s, a, b) => s.replace(new RegExp(`\\b${a}\\b`), b);
  if (kind === 'splice') {
    const j = /^(.+?), (and|but|or|so|yet) (.+)$/.exec(right) || /^(.+?); (.+)$/.exec(right) || /^(.+?[^.!?])\. (\S.+)$/.exec(right);
    if (!j) { problems.push(`${at}: the fix is not two thoughts joined or split`); return false; }
    const A = j[1], conj = j.length === 4 ? j[2] : null;
    const T = tokenize(text), nA = tokenize(A).length;
    const second = joinTokens(T.slice(nA));
    if (joinTokens(T.slice(0, nA)).replace(/,$/, '') !== A) { problems.push(`${at}: the fix is not the sentence's two thoughts`); return false; }
    const low = lowFirst(second), up = capFirst(second);
    if (/period/.test(how || '')) accept = [`${A}. ${up}`];
    else if (/semicolon/.test(how || '')) accept = [`${A}; ${low}`];
    else accept = (SPLICE_JOINERS[conj] || [conj]).map(c => `${A}, ${c} ${low}`);
    if (!accept.includes(right)) problems.push(`${at}: the fix does not use the way the item asks for`);
    wrong = [`${A}, ${low}`, `${A} ${low}`, /period/.test(how || '') ? `${A}. ${low}` : `${A}, or ${low}`];
  } else if (kind === 'conj') {
    const c = (/ (and|but|or|so|yet|nor|for) /.exec(right) || [])[1];
    if (!c) { problems.push(`${at}: the fix has no coordinating conjunction`); return false; }
    accept = (CONJ_FAMILY[c] || [c]).map(x => swap(right, c, x));
    const toggled = right.includes(`, ${c} `) ? right.replace(`, ${c} `, ` ${c} `) : right.replace(` ${c} `, `, ${c} `);
    wrong = [text, toggled, swap(right, c, CONJ_WRONG[c])];
  } else if (kind === 'spelling') {
    if (!/\ba lot\b/.test(right)) { problems.push(`${at}: the fix has no "a lot"`); return false; }
    wrong = [text, right.replace(/\ba lot\b/, 'allot'), right.replace(/\ba lot\b/, 'a-lot')];
  } else if (kind === 'apostrophe') {
    const p = POSSESSIVE_PRONOUNS.find(w => hasWord(right, w));
    if (!p) { problems.push(`${at}: the fix has no possessive pronoun`); return false; }
    wrong = [right.replace(new RegExp(`\\b${p}\\b`), `${p.slice(0, -1)}'s`), right.replace(new RegExp(`\\b${p}\\b`), `${p}'`), text];
  } else if (kind === 'endmark') {
    const close = right.lastIndexOf('”'), mk = right.charAt(close - 1);
    if (close < 1 || !/[.,?!]/.test(mk)) { problems.push(`${at}: the fix has no mark before its closing quotation mark`); return false; }
    const outside = right.slice(0, close - 1) + right.slice(close, close + 1) + (/[.]$/.test(right) && close === right.length - 1 ? '' : mk) + right.slice(close + 1);
    const alt = { ',': '.', '.': ',', '?': '.', '!': ',' }[mk];
    wrong = [text, outside.replace(/\.\.$/, '.'), right.slice(0, close - 1) + alt + right.slice(close)];
  } else { problems.push(`${at}: read.fix "${kind}" is not built`); return false; }
  wrong = [...new Set(wrong)].filter(w => !accept.includes(w) && w !== right);
  if (wrong.length < 2) problems.push(`${at}: fewer than 2 wrong versions`);
  const options = seededShuffle([right, ...wrong], at);
  return { format: 'fix', text, right, accept: [...new Set(accept)], options, answer: [options.indexOf(right)], rule: `fix-${kind}`, ...(how ? { how } : {}) };
}

// ------------------------------------------------------------------------------------------------- grades 6-8, part 2
// More quiz shapes for the second half of the 6-8 band. Every reader here keeps a format already built (tap, capfix,
// marks, choice, passage, fix); none is new. A quiz line written as only the sentence ("1. "The dog's bone was buried."
// Answer: possessive.") is read by the topic's read.bare reader, which says what the line asks (BARE below); the rest
// are read by their own lead-in ("Choose the correct verb:", "Name the tense:", "Form the past participle:", "Write
// the possessive:", "Fix the sentence so it is clear that ...:", "What is the antecedent of he?"). Every generated wrong
// option has a rule name and a second, independent check in checkItems.
const SUBJECT_PRONOUNS = new Set(['i', 'you', 'he', 'she', 'it', 'we', 'they']);
const OBJECT_PRONOUNS = new Set(['me', 'you', 'him', 'her', 'it', 'us', 'them']);
const POSSESSIVE_DETERMINERS = new Set(['my', 'your', 'his', 'her', 'its', 'our', 'their']);
/** Reflexive pronouns by person and number; hisself, theirselves and itsself are never standard. */
export const REFLEXIVE = Object.freeze({ myself: '1s', yourself: '2s', himself: '3s', herself: '3s', itself: '3s', ourselves: '1p', yourselves: '2p', themselves: '3p' });
const REFLEXIVE_WRONG = { myself: ['yourself', 'ourselves'], yourself: ['myself', 'themselves'], himself: ['hisself', 'themselves'], herself: ['themselves', 'ourselves'],
  itself: ['itsself', 'ourselves'], ourselves: ['myself', 'themselves'], themselves: ['theirselves', 'itself'] };
const PERSON_OF = { i: '1s', we: '1p', you: '2', he: '3s', she: '3s', it: '3s', they: '3p' };
/** Before a gerund: the possessive, never the object or subject form. */
const GERUND_WRONG = { his: ['him', 'he'], her: ['she', 'hers'], their: ['them', 'they'], my: ['me', 'I'], our: ['us', 'we'], your: ['you', 'yours'] };
/** A pronoun that agrees: the wrong number, or a form that is not a possessive (singular "their" is right for a person). */
const AGREE_WRONG = { its: ['their', "it's"], their: ['its', 'his or her'], her: ['its', 'hers'], his: ['its', "he's"] };
export const INDEFINITE_SINGULAR = Object.freeze(['everyone', 'everybody', 'someone', 'somebody', 'anyone', 'anybody', 'nobody', 'each', 'either', 'neither']);
export const INDEFINITE_PLURAL = Object.freeze(['both', 'few', 'many', 'several']);
const PERSON_NOUNS = new Set(['teacher', 'student', 'students', 'cook', 'coach', 'baker', 'chef', 'girl', 'boy', 'player', 'players', 'librarian', 'doctor', 'nurse']);
const SUBORDINATORS_2 = [...SUBORDINATORS, 'as'];
/** Past participles that are not the regular -ed form. */
export const PAST_PARTICIPLE = Object.freeze({ sing: 'sung', write: 'written', eat: 'eaten', take: 'taken', break: 'broken', choose: 'chosen', give: 'given', see: 'seen',
  drive: 'driven', ride: 'ridden', fall: 'fallen', fly: 'flown', go: 'gone', know: 'known', swim: 'swum', run: 'run', draw: 'drawn', grow: 'grown', speak: 'spoken' });
const EXTRA_PAST = { choose: 'chose', speak: 'spoke' };
/** Words that start a verb phrase (to find where a subject ends). */
const VERBISH = new Set(['must', 'should', 'would', 'could', 'may', 'might', 'began', 'rang', 'felt', 'found', 'lost', 'heard', 'saw', 'fell', 'took', 'made']);
const isVerbish = w => { const x = norm(w); return VERBISH.has(x) || HELPERS.has(x) || isPast(x); };
const body = s => String(s).replace(/[.!?]$/, '');
const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A word's place in a text, with the article before it optional. */
function wordAt(text, word) {
  const toks = tokenize(text), at = findWords(toks, word);
  if (at.length !== 1 || at[0].length !== 1) return null;
  const i = at[0][0];
  return { answer: [i], optional: i > 0 && ARTICLES.has(norm(toks[i - 1].t)) && !toks[i - 1].post ? [i - 1] : [] };
}
/** The sentence with the words at these places as one blank. */
const blankAt = (text, places) => { const toks = tokenize(text); return joinTokens(toks.flatMap((w, i) => (i === places[0] ? [{ ...w, t: '___' }] : places.includes(i) ? [] : [w]))).replace(/___ (?=[,.!?])/, '___'); };
const firstUp = (o, start) => (start ? capFirst(o) : o);

/** The plural of a regular noun: -es after s, x, ch, sh or z, else -s. */
export const pluralOf = base => (/(s|x|ch|sh|z)$/.test(base) ? `${base}es` : `${base}s`);
/** The present participle: a silent e dropped, the last letter doubled after one short vowel, else -ing. */
export function ingOf(base) {
  if (/[^aeiou]e$/.test(base)) return `${base.slice(0, -1)}ing`;
  if (/^[^aeiou]*[aeiou][^aeiouwxy]$/.test(base)) return `${base}${base.slice(-1)}ing`;
  return `${base}ing`;
}
const regularPast = base => (/e$/.test(base) ? `${base}d` : /[^aeiou]y$/.test(base) ? `${base.slice(0, -1)}ied` : /^[^aeiou]*[aeiou][^aeiouwxy]$/.test(base) && base.length <= 4 ? `${base}${base.slice(-1)}ed` : `${base}ed`);
/** The past participle: the irregular form, else the regular -ed. */
export const ppOf = base => PAST_PARTICIPLE[base] || regularPast(base);
/** A progressive or perfect verb by its helpers: { name ('past progressive', ...), at: word places }, or null. */
export function tense3Of(text) {
  const w = lowWords(text);
  for (let i = 0; i < w.length; i++) {
    if (w[i] === 'will' && w[i + 1] === 'be' && /ing$/.test(w[i + 2] || '')) return { name: 'future progressive', at: [i, i + 1, i + 2] };
    if (w[i] === 'will' && w[i + 1] === 'have' && w[i + 2]) return { name: 'future perfect', at: [i, i + 1, i + 2] };
    if (['am', 'is', 'are'].includes(w[i]) && /ing$/.test(w[i + 1] || '')) return { name: 'present progressive', at: [i, i + 1] };
    if (['was', 'were'].includes(w[i]) && /ing$/.test(w[i + 1] || '')) return { name: 'past progressive', at: [i, i + 1] };
    if (['has', 'have'].includes(w[i]) && w[i + 1]) return { name: 'present perfect', at: [i, i + 1] };
    if (w[i] === 'had' && w[i + 1]) return { name: 'past perfect', at: [i, i + 1] };
  }
  return null;
}
/** A possessive by the owner: the apostrophe alone after a plural ("the students'"), else an apostrophe and s. */
export const possessiveOf = owner => (/^the \S+s$/i.test(owner) ? `${owner}'` : `${owner}'s`);
const seqAt = (w, v) => w.findIndex((_, i) => v.every((x, k) => w[i + k] === x));
/** Is the word a verbal here (an infinitive, an -ing word with no form of be before it, or a word after an article)? */
export function isVerbal(text, v) {
  const w = lowWords(text), vw = lowWords(v), i = seqAt(w, vw);
  if (vw[0] === 'to') return true;
  if (/ing$/.test(vw[0]) && !['am', 'is', 'are', 'was', 'were', 'be'].includes(w[i - 1])) return true;
  return i > 0 && ARTICLES.has(w[i - 1]);
}
/** What a verbal does: 'noun' (a subject or an object), 'adjective' (it describes a noun) or 'adverb' (it tells why). */
export function verbalRole(text, v) {
  const w = lowWords(text), vw = lowWords(v), i = seqAt(w, vw), prev = w[i - 1];
  if (vw[0] === 'to') {
    if (i === 0 || ['like', 'likes', 'want', 'wants', 'hope', 'hopes', 'love', 'loves', 'need', 'needs'].includes(prev)) return 'noun';
    return i >= 2 && ARTICLES.has(w[i - 2]) ? 'adjective' : 'adverb';
  }
  if (i === 0) return 'noun';
  return ARTICLES.has(prev) ? 'adjective' : 'noun';
}
/** Who or what the words after a sentence's first comma name, up to their verb (the subject of the main clause). */
export function subjectAfterComma(s) {
  const toks = tokenize(s), c = toks.findIndex(w => /^,/.test(w.post));
  if (c < 0) return null;
  const out = [];
  for (let i = c + 1; i < toks.length && !isVerbish(toks[i].t); i++) out.push(toks[i].t);
  return out.length && out.length < toks.length - c - 1 ? out.join(' ').toLowerCase() : null;
}
/** The word a modifier (a phrase) sits next to in a sentence: after it when the sentence opens with it, else before
 *  it ("that was" before it, or a "that had" version, counts as the word before "that"). */
export function attachOf(s, mod) {
  const w = words(body(s)), m = lowWords(mod), low = w.map(x => x.toLowerCase());
  const i = seqAt(low, m);
  if (i === 0) { let j = m.length; while (j < w.length && (ARTICLES.has(low[j]) || POSSESSIVE_DETERMINERS.has(low[j]))) j++; return low[j] || null; }
  if (i > 1 && ['was', 'were'].includes(low[i - 1]) && low[i - 2] === 'that') return low[i - 3] || null;
  if (i > 0) return low[i - 1];
  const t = low.indexOf('that');
  return t > 0 ? low[t - 1] : null;
}
/** Restrictive or not: a "that" clause never takes commas, a "which" clause always does, and a "who" clause does
 *  after a name (it only adds detail). */
export function needsClauseCommas(text) {
  const toks = tokenize(text.replace(/,/g, ''));
  const k = toks.findIndex((w, i) => i > 0 && /^(who|which|that)$/i.test(w.t));
  if (k < 0) return null;
  const w = norm(toks[k].t);
  if (w === 'that') return false;
  if (w === 'which') return true;
  return /^\p{Lu}/u.test(toks[k - 1].t) || (k > 1 && /^(my|our)$/i.test(toks[k - 2].t));
}
/** Shared or unshared possession by its apostrophes: one owned thing takes one apostrophe (on the last name), several
 *  take one on every name. -> the possession is written right. */
export function possessionOk(s) {
  const m = /\b(\w+)('s)? and (\w+)('s)? (\w+)/.exec(s);
  if (m) return /s$/.test(m[5]) ? !!(m[2] && m[4]) : !m[2] && !!m[4];
  const p = /^The (\w+s)('s|')? \w+/.exec(s);
  return !!p && p[2] === "'";
}
/** Does a noun phrase name a person (a name, or a word for a person)? */
const personal = np => /^\p{Lu}/u.test(np.replace(/^the /i, '')) && !/^the /i.test(np) ? true : PERSON_NOUNS.has(norm(np.split(' ').pop()));
/** The nouns a pronoun could stand for: names and "the" + noun before it. */
function candidatesBefore(text, upto) {
  const toks = tokenize(text), out = [];
  for (let i = 0; i < upto; i++) {
    const w = toks[i];
    if (/^the$/i.test(w.t) && i + 1 < upto) { out.push(`the ${toks[i + 1].t}`); i++; continue; }
    if (/^\p{Lu}/u.test(w.t) && !/^(When|If|After|Before|While|The|A|An)$/.test(w.t)) out.push(w.t);
  }
  return [...new Set(out)];
}
const PRONOUN_KIND = { he: 'person', she: 'person', him: 'person', his: 'person', her: 'person', it: 'thing', its: 'thing', they: 'plural', them: 'plural', their: 'plural' };
/** Which of the candidates the pronoun can stand for by its kind (a person, a thing, more than one). */
const fits = (pron, cands) => cands.filter(c => (PRONOUN_KIND[pron] === 'person' ? personal(c) : PRONOUN_KIND[pron] === 'thing' ? !personal(c) : / and /.test(c)));

/** Readers for a line that is only its sentence, by the topic's read.bare: (raw, def, problems, at) -> item. */
const BARE = {
  // tap the word or phrase the topic asks for (the answer)
  tap(r, def, problems, at) {
    const text = doubleQuotes(r.text), ans = unq(r.a).replace(/\.$/, '');
    const np = !def.read.whole && /^(the|a|an) /i.test(ans) ? nounPhrase(text, ans) : null;
    const places = np ? null : placesOf(text, ans);
    if (!np && !places) { problems.push(`${at}: the answer "${ans}" is not in the sentence once`); return false; }
    if (hintLeaks(r.hint, ans)) problems.push(`${at}: the hint names the answer "${ans}"`);
    // an appositive is shown in bold: the words between the commas
    let focus = null;
    if (def.read.focus === 'appositive') { const toks = tokenize(text), a = toks.findIndex(w => /^,/.test(w.post)), b = toks.findIndex((w, i) => i > a && /^,/.test(w.post)); if (a >= 0 && b > a) focus = Array.from({ length: b - a }, (_, k) => a + 1 + k); }
    return { format: 'tap', text, ...(np || { answer: places }), rule: 'tap', ...(focus ? { focus } : {}) };
  },
  // pills from the topic's labels, checked by its rule (read.check)
  label(r, def, problems, at) {
    const text = doubleQuotes(r.text), labels = def.read.labels;
    const k = labels.findIndex(l => norm(l) === norm(unq(r.a).replace(/\.$/, '')));
    if (k < 0) { problems.push(`${at}: the answer "${r.a}" is not one of ${labels.join(' / ')}`); return false; }
    const focus = def.read.focus === 'second' ? [1] : null;
    return labelItem(text, labels, labels[k], r, problems, at, { rule: def.read.check || 'given', ...(focus ? { focus } : {}) });
  },
  // a misplaced modifier: tap the word the sentence seems to give it, or the word it really describes
  misplaced(r, def, problems, at) {
    const a = unq(r.a);
    let x, ask, head;
    if ((x = /^The sentence seems to say (?:the |a )?(\S+) (?:was|were|wore)\b/.exec(a))) { head = x[1]; ask = 'Tap the word the sentence seems to say the modifier describes.'; }
    else if ((x = /^.+? describes (?:the )?(\S+?),? not /.exec(a))) { head = x[1]; ask = 'Tap the word the modifier really describes.'; }
    else { problems.push(`${at}: the answer neither says what the sentence seems to say nor what the modifier describes`); return false; }
    const w = wordAt(r.text, head);
    if (!w) { problems.push(`${at}: "${head}" is not in the sentence once`); return false; }
    return { format: 'tap', text: r.text, ask, ...w, rule: 'tap' };
  },
  // a dangling modifier: tap the word the opening phrase seems to describe (the subject after the comma)
  dangling(r, def, problems, at) {
    const toks = tokenize(r.text), c = toks.findIndex(w => /^,/.test(w.post));
    let v = c + 1;
    while (c >= 0 && v < toks.length && !isVerbish(toks[v].t)) v++;
    if (c < 0 || v >= toks.length || v === c + 1) { problems.push(`${at}: no subject after the opening phrase`); return false; }
    if (!/^The modifier dangles because no one in the sentence /.test(r.a)) { problems.push(`${at}: the answer does not say the modifier dangles`); return false; }
    const span = Array.from({ length: v - c - 1 }, (_, k) => c + 1 + k);
    return { format: 'tap', text: r.text, ask: 'Tap the word the opening phrase seems to describe.', answer: [span[span.length - 1]], optional: span.slice(0, -1), rule: 'tap' };
  },
  // restrictive or not: the sentence with its commas taken out, and the chips to put them back (or not)
  restrictive(r, def, problems, at) {
    const right = doubleQuotes(r.text), text = right.replace(/,/g, '');
    if (/^no commas/i.test(r.a) === right.includes(',')) { problems.push(`${at}: the answer and the sentence disagree about commas`); return false; }
    const it = marksItem(text, right, def, problems, at);
    return it && { ...it, rule: 'restrictive' };
  },
  // "One cat, two cats.": the plural is the blank
  plural(r, def, problems, at) {
    const x = /^One (\w+), two (\w+)\.$/.exec(r.text);
    if (!x || x[2] !== unq(r.a).replace(/\.$/, '')) { problems.push(`${at}: not "One noun, two nouns." with the plural as the answer`); return false; }
    const [, base, right] = x;
    const wrong = /(s|x|ch|sh|z)$/.test(base) ? [`${base}s`, `${base}'s`] : /e$/.test(base) ? [`${base}'s`, `${base}s'`] : [`${base}es`, `${base}'s`];
    const options = seededShuffle([right, ...wrong], at);
    return { format: 'choice', text: `One ${base}, two ___.`, options, answer: [options.indexOf(right)], right: r.text, rule: 'plural', base };
  },
  // subject and object pronouns: tap the one the line names (when it names both, odd lines ask for the object)
  subjobj(r, def, problems, at) {
    const parts = [...r.a.matchAll(/(\w+(?: and \w+)?) (?:is|are) (?:the )?(subject|object) pronouns?/gi)].map(m => ({ w: m[1], role: m[2].toLowerCase() }));
    const pick = parts.length === 1 ? parts[0] : parts.find(p => p.role === (r.n % 2 ? 'object' : 'subject'));
    if (!pick) { problems.push(`${at}: the answer names no subject or object pronoun`); return false; }
    const places = placesOf(r.text, pick.w.replace(/ and /, ', '));
    if (!places) { problems.push(`${at}: "${pick.w}" is not in the sentence once`); return false; }
    return { format: 'tap', text: r.text, ask: `Tap the ${pick.role} pronoun${/ and /.test(pick.w) ? 's' : ''}.`, answer: places, rule: 'pronoun-role', role: pick.role };
  },
  // he or him, she or her in a compound: the pronoun is the blank
  pair(r, def, problems, at) {
    const ans = unq(r.a).replace(/\.$/, ''), toks = tokenize(r.text), found = findWords(toks, ans);
    const PAIR = { she: 'her', he: 'him' }, low = ans.toLowerCase();
    const subj = Object.keys(PAIR).find(k => k === low || PAIR[k] === low);
    if (found.length !== 1 || !subj) { problems.push(`${at}: the answer is not he, she, him or her once in the sentence`); return false; }
    const i = found[0][0], options = [subj, PAIR[subj]].map(o => firstUp(o, i === 0));
    return { format: 'choice', text: blankAt(r.text, [i]), options, answer: [options.indexOf(ans)], right: r.text, rule: 'compound', spot: i };
  },
  // a pronoun before a gerund: the possessive is the blank
  gerund(r, def, problems, at) {
    const ans = unq(r.a).replace(/\.$/, ''), found = findWords(tokenize(r.text), ans), wrong = GERUND_WRONG[ans.toLowerCase()];
    if (found.length !== 1 || !wrong) { problems.push(`${at}: the answer is not a possessive pronoun once in the sentence`); return false; }
    const i = found[0][0], options = seededShuffle([ans, ...wrong.map(o => firstUp(o, i === 0))], at);
    return { format: 'choice', text: blankAt(r.text, [i]), options, answer: [options.indexOf(ans)], right: r.text, rule: 'gerund' };
  },
  // a reflexive pronoun: the blank, with two that do not point back to the subject
  reflexive(r, def, problems, at) {
    const ans = unq(r.a).replace(/\.$/, ''), found = findWords(tokenize(r.text), ans), wrong = REFLEXIVE_WRONG[ans];
    if (found.length !== 1 || !wrong) { problems.push(`${at}: the answer is not a reflexive pronoun once in the sentence`); return false; }
    const options = seededShuffle([ans, ...wrong], at);
    return { format: 'choice', text: blankAt(r.text, found[0]), options, answer: [options.indexOf(ans)], right: r.text, rule: 'reflexive' };
  },
  // a pronoun that agrees with its antecedent
  agree(r, def, problems, at) {
    const ans = unq(r.a).replace(/\.$/, ''), found = findWords(tokenize(r.text), ans), wrong = AGREE_WRONG[ans];
    if (found.length !== 1 || !wrong) { problems.push(`${at}: the answer is not its, their, his or her once in the sentence`); return false; }
    const options = seededShuffle([ans, ...wrong], at);
    return { format: 'choice', text: blankAt(r.text, found[0]), options, answer: [options.indexOf(ans)], right: r.text, rule: 'agree' };
  },
  // an indefinite antecedent: "his or her" and singular "their" are both right after a singular one
  indefinite(r, def, problems, at) {
    const ans = unq(r.a).replace(/\.$/, ''), found = findWords(tokenize(r.text), ans);
    if (found.length !== 1 || !['his or her', 'her', 'his', 'their'].includes(ans)) { problems.push(`${at}: the answer is not "his or her", "her" or "their" once in the sentence`); return false; }
    const first = ans === 'their' ? 'his or her' : ans, options = [first, 'their', 'its'];
    const word = lowWords(r.text)[0], singular = INDEFINITE_SINGULAR.includes(word);
    const answer = singular ? [0, 1] : [1];
    if (!answer.includes(options.indexOf(ans))) { problems.push(`${at}: "${ans}" does not agree with "${word}" by the rule`); return false; }
    return { format: 'choice', text: blankAt(r.text, found[0]), options, answer, right: r.text, rule: 'indefinite', word, ...(answer.length > 1 ? { multi: true } : {}) };
  },
  // a dependent clause fragment: pick the sentence that joins it to a main clause
  depfrag(r, def, problems, at) {
    const right = unq(r.a), m = /^(.+?), (.+)$/.exec(right);
    if (!m || `${m[1]}.` !== r.text) { problems.push(`${at}: the fix is not the fragment, a comma and a main clause`); return false; }
    const [, dep, main] = m, rest = dep.split(' ').slice(1).join(' ');
    const wrong = [r.text, `${dep}. ${capFirst(main)}`, `${capFirst(rest)}, ${main}`];
    const options = seededShuffle([right, ...wrong], at);
    return { format: 'choice', text: right, prompt: r.text, ask: 'Choose the sentence that fixes the fragment.', options, answer: [options.indexOf(right)], right, whole: true, rule: 'depfrag' };
  },
  // a misplaced modifier fixed: the fix, the sentence as it was, the modifier as a "that" clause on the wrong word, and
  // (when it fits) the modifier moved next to the wrong word
  movefix(r, def, problems, at) {
    const text = r.text, right = unq(r.a), open = /^([^,]+), (.+)$/.exec(text);
    let mod = null, kind = null;
    if (open && new RegExp(`\\b${esc(open[1])}\\b`, 'i').test(body(right)) && !right.startsWith(open[1])) { mod = open[1]; kind = 'open'; }
    else {
      const w = words(body(text));
      for (let k = 1; k < w.length && !mod; k++) { const tail = w.slice(k).join(' '); if (new RegExp(`\\b${esc(tail)}\\b`, 'i').test(right)) { mod = tail; kind = 'end'; } }
    }
    if (!mod) { problems.push(`${at}: no modifier moves between the sentence and its fix`); return false; }
    const wrongWord = attachOf(text, mod), be = /[^s]s$/.test(wrongWord || '') ? 'were' : 'was';
    const rel = /^with /i.test(mod) ? `that had ${mod.replace(/^with /i, '')}` : `that ${be} ${lowFirst(mod)}`;
    const wrong = [text];
    if (kind === 'open') {
      const rest = tokenize(open[2]), v = rest.findIndex(x => isVerbish(x.t));
      const subj = joinTokens(rest.slice(0, v)), after = joinTokens(rest.slice(v));
      wrong.push(`${capFirst(subj)} ${rel} ${after}`, `${capFirst(subj)} ${lowFirst(mod)} ${after}`);
    } else {
      const lead = body(text).slice(0, body(text).length - mod.length).trim();
      wrong.push(`${lead} ${rel}.`);
      if (!right.toLowerCase().startsWith(mod.toLowerCase())) wrong.push(`${capFirst(mod)}, ${lc(lead)}.`);
    }
    const options = seededShuffle([right, ...new Set(wrong)], at);
    return { format: 'choice', text: right, prompt: text, ask: 'Choose the sentence that puts the modifier next to the word it describes.', options, answer: [options.indexOf(right)], right, whole: true, rule: 'misplaced', mod };
  },
  // a dangling modifier fixed: the fix names the doer as the subject; the wrong versions leave the old subject in place
  danglefix(r, def, problems, at) {
    const right = unq(r.a), doer = subjectAfterComma(right);
    if (!doer || subjectAfterComma(r.text) === doer) { problems.push(`${at}: the fix does not give the main clause a new subject`); return false; }
    const doerShown = subjectAfterComma(right) && right.split(', ').slice(1).join(', ').split(' ').slice(0, doer.split(' ').length).join(' ');
    const wrong = [r.text, `${body(r.text)} ${isPassive(r.text) ? 'by' : 'for'} ${doerShown}.`];
    const options = seededShuffle([right, ...wrong], at);
    return { format: 'choice', text: right, prompt: r.text, ask: 'Choose the sentence that gives the modifier a word to describe.', options, answer: [options.indexOf(right)], right, whole: true, rule: 'dangling', doer };
  },
  // shared or unshared possession: the error-fixing box
  sharedfix(r, def, problems, at) {
    const text = doubleQuotes(r.text), right = unq(r.a);
    let third;
    const m = /\b(\w+?)(?:'s)? and (\w+?)(?:'s)? (\w+)/.exec(right);
    if (m) third = right.replace(m[0], `${m[1]}'s and ${m[2]} ${m[3]}`);
    else third = right.replace(/^The (\w+s)' /, 'The $1 ');
    const wrong = [...new Set([text, third])].filter(w => w !== right);
    if (wrong.length < 2) problems.push(`${at}: fewer than 2 wrong versions`);
    const options = seededShuffle([right, ...wrong], at);
    return { format: 'fix', text, right, accept: [right], options, answer: [options.indexOf(right)], rule: 'fix-possession' };
  },
  // a question mark or exclamation point with a citation: pick the sentence punctuated right
  citemark(r, def, problems, at) {
    const right = doubleQuotes(r.text), m = /^“(.+)([?!])” (.+?) (\([A-Z][a-z]+ \d+\))\.$/.exec(right);
    if (!m) { problems.push(`${at}: not a quote ending in ? or ! with a citation after it`); return false; }
    const [, q, mk, tag, cite] = m;
    if ((mk === '?') !== /question mark/.test(r.a)) { problems.push(`${at}: the answer names the other mark`); return false; }
    const wrong = [`“${q}”${mk} ${tag} ${cite}.`, `“${q}” ${tag} ${cite}${mk}`, `“${q}${mk}” ${tag}. ${cite}`];
    const options = seededShuffle([right, ...wrong], at);
    return { format: 'choice', text: right, ask: 'Which sentence is punctuated correctly?', options, answer: [options.indexOf(right)], right, whole: true, rule: 'citemark' };
  },
};

/** The readers of part 2, tried before the others: (raw, def, problems, at, ctx) -> item, false or null. */
const READERS_2 = [
  function bare(r, def, problems, at) {
    if (!r.bare) return null;
    const read = BARE[def.read.bare];
    if (!read) { problems.push(`${at}: read.bare "${def.read.bare}" is not built`); return false; }
    const it = read(r, def, problems, at);
    // read.cycle: a blank's choices as press-to-cycle
    return it && def.read.cycle && it.format === 'choice' && it.text.includes('___') ? { ...it, cycle: true } : it;
  },
  // "Choose the correct verb: "The dog (bark / barks) at the mail carrier.""
  function givenPair(r, def, problems, at) {
    const x = /^Choose the correct (?:verb|word|form): "(.*?)\(([^()]+?) \/ ([^()]+?)\)(.*)"$/.exec(r.q);
    if (!x) return null;
    const [, before, a, b, after] = x, options = [a.trim(), b.trim()], ans = unq(r.a).replace(/\.$/, '');
    const k = options.indexOf(ans);
    if (k < 0) { problems.push(`${at}: the answer "${ans}" is not one of ${options.join(' / ')}`); return false; }
    // a form of be, have or do is a plain word in a hint ("so the verb is singular")
    if (!/^(is|are|was|were|has|have|does|do)$/.test(ans) && hintLeaks(r.hint, ans, options.filter(o => o !== ans))) problems.push(`${at}: the hint names the answer "${ans}" and not the other choice`);
    return { format: 'choice', text: `${before}___${after}`, options, answer: [k], right: `${before}${ans}${after}`, rule: 'given', ...(def.read && def.read.cycle ? { cycle: true } : {}) };
  },
  // "Name the tense: "Ana was reading when the phone rang."": the verb in bold, the three times of its kind of tense
  function nameTense(r, def, problems, at) {
    const x = /^Name the tense: "(.+)"$/.exec(r.q);
    if (!x) return null;
    const t = tense3Of(x[1]), ans = r.a.replace(/\.$/, '');
    if (!t || t.name !== ans.toLowerCase()) { problems.push(`${at}: the helping verbs make "${t && t.name}", not "${ans}"`); return false; }
    const aspect = t.name.split(' ')[1], options = ['past', 'present', 'future'].map(tm => capFirst(`${tm} ${aspect}`)), right = capFirst(t.name);
    return { format: 'choice', text: x[1], options, answer: [options.indexOf(right)], right: x[1], label: right, plain: true, rule: 'tense3', focus: t.at };
  },
  // "Form the past participle: "sing."": the form after "have" (or "are"), and two forms that are not it
  function participle(r, def, problems, at) {
    const x = /^Form the (present|past) participle: "(\w+)\.?"$/.exec(r.q);
    if (!x) return null;
    const [, kind, base] = x, right = kind === 'present' ? ingOf(base) : ppOf(base), ans = unq(r.a).replace(/\.$/, '');
    if (right !== ans) { problems.push(`${at}: the rules make "${right}", not "${ans}"`); return false; }
    let wrong;
    if (kind === 'present') {
      const misspelled = right === `${base}ing` ? `${base}${base.slice(-1)}ing` : `${base}ing`;
      wrong = [IRREGULAR_PAST[base] || regularPast(base), misspelled];
    } else wrong = PAST_PARTICIPLE[base] ? [IRREGULAR_PAST[base] || EXTRA_PAST[base], regularPast(base)] : [ingOf(base), presentOf(base)];
    if (wrong.some(w => !w)) { problems.push(`${at}: no past form of "${base}" to offer`); return false; }
    const options = seededShuffle([right, ...new Set(wrong)].filter((o, i, a) => a.indexOf(o) === i), at);
    const frame = kind === 'present' ? 'We are' : 'We have';
    return { format: 'choice', text: `${frame} ___.`, ask: `Choose the ${kind} participle of ${base}.`, options, answer: [options.indexOf(right)], right: `${frame} ${right}.`, rule: 'participle', base, kind };
  },
  // "Write the possessive: "The books belong to the students."": the possessive phrase, and three that misplace the
  // apostrophe
  function possessive(r, def, problems, at) {
    const x = /^Write the possessive: "((?:The )?(.+?) belongs? to (.+?)\.)"$/.exec(r.q);
    if (!x) return null;
    const [, said, thing, owner] = x, ans = unq(r.a).replace(/\.$/, ''), up = /^\p{Lu}/u.test(ans);
    const shown = s => (up ? capFirst(s) : s);
    const right = shown(`${possessiveOf(owner)} ${thing}`);
    if (right !== ans) { problems.push(`${at}: the rule makes "${right}", not "${ans}"`); return false; }
    const plural = /'$/.test(possessiveOf(owner));
    const wrong = plural ? [`${owner.slice(0, -1)}'s ${thing}`, `${owner}'s ${thing}`, `${owner} ${thing}`] : [`${owner}s' ${thing}`, `${owner}s ${thing}`];
    const options = seededShuffle([right, ...wrong.map(shown)], at);
    return { format: 'choice', text: right, prompt: said, ask: 'Choose the possessive.', options, answer: [options.indexOf(right)], right, whole: true, rule: 'possessive', owner, thing };
  },
  // "What is the function of to win?": noun, adjective or adverb (a verbal's job)
  function verbalFunction(r, def, problems, at) {
    const x = def.read && def.read.verbals && r.text && /^What is the function of (.+?)\?$/.exec(r.question || '');
    if (!x) return null;
    const labels = ['Noun', 'Adjective', 'Adverb'], ans = capFirst(r.a.split(',')[0].trim().replace(/\.$/, ''));
    if (!labels.includes(ans)) { problems.push(`${at}: "${r.a}" is not noun, adjective or adverb`); return false; }
    const focus = placesOf(r.text, x[1]);
    if (!focus) { problems.push(`${at}: "${x[1]}" is not in the sentence once`); return false; }
    return labelItem(r.text, labels, ans, r, problems, at, { ask: `What does ${x[1]} do in this sentence?`, rule: 'verbalfn', focus, verbal: x[1] });
  },
  // "What is the antecedent of he?": the nouns it could stand for, "It is unclear", and for "they" the two together
  function antecedent(r, def, problems, at) {
    const x = r.text && /^What is the antecedent of (\w+)\?$/.exec(r.question || '');
    if (!x) return null;
    const pron = x[1].toLowerCase(), toks = tokenize(r.text), pi = toks.findIndex(w => norm(w.t) === pron);
    const cands = candidatesBefore(r.text, pi).map(capFirst);
    const people = cands.filter(personal);
    const options = [...cands, ...(pron === 'they' && people.length >= 2 ? [`${people[0]} and ${people[1]}`] : []), 'It is unclear'];
    const u = /^It is unclear\. It could be (.+) or (.+)\.$/.exec(r.a);
    const right = u ? 'It is unclear' : capFirst(r.a.replace(/\.$/, ''));
    if (u && ![u[1], u[2]].every(c => cands.some(o => norm(o) === norm(c)))) { problems.push(`${at}: "${u[1]}" and "${u[2]}" are not both nouns before the pronoun`); return false; }
    if (!options.includes(right)) { problems.push(`${at}: "${right}" is not one of ${options.join(' / ')}`); return false; }
    return { format: 'choice', text: r.text, ask: `What does ${x[1]} stand for?`, options, answer: [options.indexOf(right)], right: r.text, label: right, plain: true, rule: 'antecedent', pron, focus: [pi] };
  },
  // "Fix the sentence so it is clear that Sam was upset: "...": the error-fixing box; the cycle's wrong versions are the
  // sentence as it was and the pronoun replaced by the other noun
  function clearFix(r, def, problems, at) {
    const x = /^Fix the sentence so it is clear that (.+?): "(.+)"$/.exec(r.q);
    if (!x) return null;
    const [, meaning, text] = x, right = unq(r.a).replace(/"([^"]+)"/g, '“$1”'), toks = tokenize(text);
    const pi = toks.findIndex((w, i) => i > 0 && Object.hasOwn(PRONOUN_KIND, norm(w.t)));
    const pron = pi >= 0 ? norm(toks[pi].t) : null;
    const cands = pron ? fits(pron, candidatesBefore(text, pi)) : [];
    const intended = cands.slice().sort((a, b) => meaning.toLowerCase().indexOf(a.toLowerCase()) - meaning.toLowerCase().indexOf(b.toLowerCase())).find(c => meaning.toLowerCase().includes(c.toLowerCase()));
    const other = cands.find(c => c !== intended);
    if (!intended || !other) { problems.push(`${at}: no two nouns the pronoun could stand for`); return false; }
    const poss = ['his', 'its'].includes(pron) || (pron === 'her' && pi < toks.length - 1 && !/[.!?]/.test(toks[pi].post));
    const swapped = joinTokens(toks.map((w, i) => (i === pi ? { ...w, t: poss ? `${other}'s` : other } : w)));
    const extra = ((def.notes || {})[r.n] || {}).accept || [];
    const options = seededShuffle([right, text, swapped], at);
    return { format: 'fix', text, ask: `Fix the sentence so it is clear that ${meaning}.`, right, accept: [right, ...extra], options, answer: [options.indexOf(right)], rule: 'fix-vague', intended, other, pron };
  },
];
const countOf = (s, w) => (String(s).toLowerCase().match(new RegExp(`\\b${esc(w.toLowerCase())}\\b`, 'g')) || []).length;

/** The independent check of part 2's items (called from checkItems). */
function checkItems2(it, chk) {
  const at = it.id, right = it.options ? it.options[it.answer[0]] : null, wrong = it.options ? it.options.filter((_, i) => !it.answer.includes(i)) : [];
  switch (it.rule) {
    case 'plural': chk(pluralOf(it.base) === right && wrong.every(o => o !== pluralOf(it.base)), `${at}: a wrong plural follows the -s and -es rule`); break;
    case 'participle': { const want = it.kind === 'present' ? ingOf(it.base) : ppOf(it.base); chk(right === want && wrong.every(o => o !== want), `${at}: a wrong option is the ${it.kind} participle`); break; }
    case 'tense3': chk(capFirst((tense3Of(it.text) || {}).name || '') === it.label, `${at}: the helping verbs do not make "${it.label}"`); break;
    // a singular owner ending in s takes 's (James's) and the apostrophe alone (James') is accepted too (owner decision),
    // so that form is never offered as a wrong option
    case 'possessive': chk(right.toLowerCase() === `${possessiveOf(it.owner)} ${it.thing}`.toLowerCase() && wrong.every(o => o.toLowerCase() !== right.toLowerCase())
      && !(/'s$/.test(possessiveOf(it.owner)) && /s$/.test(it.owner) && wrong.some(o => o.toLowerCase() === `${it.owner}' ${it.thing}`.toLowerCase())), `${at}: a wrong possessive is the right one`); break;
    case 'compound': { const subj = it.spot <= 2; chk(wrong.every(o => SUBJECT_PRONOUNS.has(norm(o)) !== subj) && SUBJECT_PRONOUNS.has(norm(right)) === subj, `${at}: the pronoun's form does not fit its place in the sentence`); break; }
    case 'gerund': chk(POSSESSIVE_DETERMINERS.has(norm(right)) && wrong.every(o => !POSSESSIVE_DETERMINERS.has(norm(o))), `${at}: a wrong option is a possessive before the gerund`); break;
    case 'reflexive': {
      const w = lowWords(it.text), k = w.indexOf('___'), before = w.slice(0, k);
      const person = PERSON_OF[w[0]] || (before.includes('and') ? '3p' : '3s');
      const ok = o => REFLEXIVE[o] && REFLEXIVE[o].startsWith(person);
      chk(ok(right) && wrong.every(o => !ok(o)), `${at}: a wrong reflexive points back to the subject`);
      break;
    }
    case 'agree': {
      const w = lowWords(it.text), k = w.indexOf('___'), subj = w.slice(0, k).filter(x => !ARTICLES.has(x));
      const head = it.text.split(' ').filter(x => !/^(The|the)$/.test(x))[0];
      const kind = subj.includes('and') || /[^s]s$/.test(subj[0]) ? 'plural' : personal(head) ? 'person' : 'thing';
      const ok = { plural: ['their'], person: ['his', 'her', 'their', 'his or her'], thing: ['its'] }[kind];
      chk(ok.includes(right) && wrong.every(o => !ok.includes(o)), `${at}: a wrong pronoun agrees with a ${kind} antecedent`);
      break;
    }
    case 'indefinite': {
      const sing = INDEFINITE_SINGULAR.includes(it.word), plur = INDEFINITE_PLURAL.includes(it.word);
      const rights = it.answer.map(i => it.options[i]);
      chk(sing !== plur && rights.includes('their') && (sing ? rights.length === 2 : rights.length === 1) && !rights.includes('its'), `${at}: the right pronouns do not match "${it.word}"`);
      break;
    }
    case 'depfrag': {
      const ok = new RegExp(`^(${SUBORDINATORS_2.join('|')}) [^.,]+, [^.]+\\.$`, 'i');
      chk(ok.test(right) && wrong.every(o => !ok.test(o)), `${at}: a wrong version joins the clause to a main clause`);
      break;
    }
    case 'misplaced': { const target = attachOf(right, it.mod); chk(!!target && wrong.every(o => attachOf(o, it.mod) !== target), `${at}: a wrong version puts the modifier next to "${target}"`); break; }
    case 'dangling': chk(subjectAfterComma(right) === it.doer && wrong.every(o => subjectAfterComma(o) !== it.doer), `${at}: a wrong version gives the modifier its doer`); break;
    case 'citemark': { const ok = /[?!]” .+ \([A-Z][a-z]+ \d+\)\.$/; chk(ok.test(right) && wrong.every(o => !ok.test(o)), `${at}: a wrong version keeps the mark inside the quotes and the period after the citation`); break; }
    case 'antecedent': {
      const cands = it.options.filter(o => o !== 'It is unclear' && !/ and /.test(o)), fit = fits(it.pron, cands.map(c => (/^The /.test(c) ? lowFirst(c) : c)));
      const want = it.pron === 'they' ? it.options.find(o => / and /.test(o)) : fit.length === 1 ? capFirst(fit[0]) : 'It is unclear';
      chk(want === it.label, `${at}: the pronoun's kind makes "${want}", not "${it.label}"`);
      break;
    }
    default: break;
  }
  if (it.plain && it.label) {
    const w = it.focus && it.focus.length ? it.focus.map(i => tokenize(it.text)[i].t).join(' ') : '';
    let want = null;
    if (it.rule === 'verbal') want = isVerbal(it.text, w) ? /^verbal$/i : /^verb$/i;
    if (it.rule === 'verbalfn') want = new RegExp(`^${verbalRole(it.text, it.verbal)}$`, 'i');
    if (it.rule === 'fragment68') want = /^(that|which|especially)\b/i.test(it.text) ? /fragment/i : /sentence/i;
    if (it.rule === 'pluralposs') want = /'/.test(w) ? /possessive/i : /plural/i;
    if (it.rule === 'shared') { const n = (it.text.match(/'s\b|s'/g) || []).length; const owned = (/(?:'s|s') (\w+)/.exec(it.text.split(' and ').pop()) || [])[1] || ''; want = n >= 2 || /s$/.test(owned) ? /unshared/i : /^shared/i; }
    if (want) chk(want.test(it.label), `${at}: the ${it.rule} rule does not give "${it.label}" for "${it.text}"`);
  }
  if (it.rule === 'pronoun-role') { const toks = tokenize(it.text), set = it.role === 'subject' ? SUBJECT_PRONOUNS : OBJECT_PRONOUNS; chk(it.answer.every(i => set.has(norm(toks[i].t))), `${at}: a tapped word is not a ${it.role} pronoun`); }
  if (it.rule === 'restrictive') { const need = needsClauseCommas(it.text); chk(need !== null && (it.want.length > 0) === need, `${at}: the clause rule ${need ? 'needs' : 'takes no'} commas`); }
  if (it.rule === 'fix-possession') { chk(possessionOk(it.right), `${at}: the fix breaks the possession rule`); for (const o of it.options) if (o !== it.right) chk(!possessionOk(o), `${at}: wrong version "${o}" follows the possession rule`); }
  if (it.rule === 'fix-vague') {
    chk(countOf(it.right, it.intended) > countOf(it.text, it.intended) || !countOf(it.right, it.pron), `${at}: the fix neither names "${it.intended}" again nor drops "${it.pron}"`);
    for (const o of it.options) if (o !== it.right) chk(o === it.text || countOf(o, it.other) > countOf(it.text, it.other), `${at}: wrong version "${o}" is not the sentence as it was or the other noun`);
  }
}

// ------------------------------------------------------------------------------------------------- grades 9-12
// The new 9-12 topics (sound-alike words IV and V, colons and semicolons, hyphens, list cue words, parallel structure).
// Every line is written as only its sentence ("1. "The ___ of the film ..." Answer: scene."), so each topic's read.bare
// names its reader. Every reader keeps a format already built: a choice in the blank (pills, or press-to-cycle with
// read.cycle), whole sentences to choose from, highlight-the-word, and the punctuation chips. Every generated wrong
// option has a rule name and a second, independent check in checkItems3.
const VERB_SLOT = new Set(['to', 'will', 'may', 'can', 'could', 'should', 'must', 'would', 'please']);
const BE_FORMS = new Set(['is', 'are', 'was', 'were', 'be', 'been']);
const FARTHER_NEXT = new Set(['from', 'than', 'along', 'up', 'down', 'away', 'into', 'out', 'ahead', 'back']);
const PLACE_PREPS = new Set(['at', 'in', 'on', 'for', 'to', 'with', 'by', 'from']);
const NOT_A_NOUN = new Set(['because', 'before', 'in', 'toward', 'of', 'can', 'is', 'was', 'and', 'but', 'when', 'that']);
/** The word of a sound-alike set a blank takes, by where it sits (read.check names the set). b: the words before the
 *  blank, a: the words after it, both in lower case. These are the cards' own tests, written as rules: a verb after to,
 *  will or can; seen after a form of have; the adjective before a noun or after a form of be; farther for a distance
 *  (from, than, along); all together and all ready before at, in, for or to. */
export const WORD_RULES = Object.freeze({
  'cite-sight-site': (b, a) => (VERB_SLOT.has(b[b.length - 1]) ? 'cite' : a[0] === 'of' || b[b.length - 1] === 'first' ? 'sight' : 'site'),
  'scene-seen': b => (b.slice(-3).some(w => ['have', 'has', 'had'].includes(w)) ? 'seen' : 'scene'),
  'advice-advise': b => (VERB_SLOT.has(b[b.length - 1]) ? 'advise' : 'advice'),
  'farther-further': (b, a) => (FARTHER_NEXT.has(a[0]) ? 'farther' : 'further'),
  'anyway-anyways': () => 'anyway',
  'altogether-all-together': (b, a) => (!b.length || (a.length && !PLACE_PREPS.has(a[0])) ? 'altogether' : 'all together'),
  'already-all-ready': (b, a) => (!a.length || ['for', 'to', 'when'].includes(a[0]) ? 'all ready' : 'already'),
  'prejudice-prejudiced': (b, a) => (adjSlot(b, a) ? 'prejudiced' : 'prejudice'),
  'bias-biased': (b, a) => (adjSlot(b, a) ? 'biased' : 'bias'),
  'later-latter': b => (b[b.length - 1] === 'the' ? 'latter' : 'later'),
  'altar-alter': b => (VERB_SLOT.has(b[b.length - 1]) ? 'alter' : 'altar'),
});
function adjSlot(b, a) {
  const last = b[b.length - 1];
  return (ARTICLES.has(last) && a.length > 0 && !NOT_A_NOUN.has(a[0])) || BE_FORMS.has(last) || b[b.length - 3] === 'called';
}
/** The words around a blank, in lower case and without marks. */
const around = text => { const [b, a = ''] = String(text).split('___'); return [lowWords(b), lowWords(a)]; };

/** Compound nouns by their standard (dictionary) form: closed, hyphenated or open. */
export const COMPOUND_NOUNS = Object.freeze({ 'mother in law': ['mother-in-law'], 'ice cream': ['ice cream'], 'tooth brush': ['toothbrush'], 'check in': ['check-in'],
  'butter fly': ['butterfly'], 'sister in law': ['sister-in-law'], 'mail box': ['mailbox'], 'well being': ['well-being', 'wellbeing'], 'rain coat': ['raincoat'],
  'follow up': ['follow-up'], 'bird house': ['birdhouse'], 'father in law': ['father-in-law'] });
/** Closed compound nouns (one word made of two). */
export const CLOSED_COMPOUNDS = Object.freeze(['firefighter', 'toothpaste', 'sunflower', 'lighthouse', 'mailbox', 'snowman', 'toothbrush', 'butterfly', 'raincoat', 'birdhouse', 'hairbrush', 'notebook']);
/** Words a prefix makes that mean something else (recover: get well; re-cover: cover again), so the hyphen keeps "again". */
export const CLARITY_WORDS = Object.freeze(['recover', 'resign', 'recreate', 'recollect', 'reform', 'release', 'remark']);
const NUMBER_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const FRACTION_PARTS = /^(half|halves|thirds?|quarters?|fourths?|fifths?|sixths?|sevenths?|eighths?|ninths?|tenths?)$/;
/** A prefix and its root take a hyphen when the prefix ends with the vowel the root starts with, or the root starts with a
 *  capital or a number; else they join closed. -> 'hyphen' | 'closed' (with re before e, both are standard US spellings). */
export const affixJoin = (pre, root) => (/^[\p{Lu}\d]/u.test(root) || (/[aeiou]$/.test(pre) && pre.slice(-1) === root.charAt(0)) ? 'hyphen' : 'closed');
/** The three ways to write words joined into one: open (spaces), hyphenated, and closed; for three or more words the
 *  third way is the hyphens stopping one word short. */
function joinForms(parts) {
  const open = parts.join(' '), hyphen = parts.join('-');
  const third = parts.length > 2 ? `${parts.slice(0, -1).join('-')} ${parts[parts.length - 1]}` : parts.join('');
  return { open, hyphen, third };
}

/** Parallel structure: the form of each item a list (or "X to Y") joins: 'inf' (to read), 'ing', 'past', 'adj', 'noun'
 *  or 'plain'. -> the forms, or null when the sentence joins no items. */
const PARALLEL_ADJ = new Set(['smart', 'kind', 'honest', 'brave', 'loyal', 'long', 'detailed', 'interesting']);
const PARALLEL_NOUN = new Set(['honesty', 'interest', 'laughter', 'defense']);
const formOf = (head, inf) => (inf ? 'inf' : PARALLEL_ADJ.has(head) ? 'adj' : PARALLEL_NOUN.has(head) ? 'noun' : /ing$/.test(head) ? 'ing' : /ed$/.test(head) ? 'past' : 'plain');
export function parallelForms(s) {
  const t = body(s);
  const pieces = t.split(/, /);
  if (pieces.length < 3) {
    const c = /\b(\w+) to (\w+)$/.exec(t);
    return c ? [formOf(c[1].toLowerCase(), false), formOf(c[2].toLowerCase(), false)] : null;
  }
  return pieces.map((p, i) => {
    const w = lowWords(p.replace(/^(and|or) /, ''));
    if (i === 0) return formOf(w[w.length - 1], w[w.length - 2] === 'to');
    return formOf(w[w.length > 1 && w[0] === 'to' ? 1 : 0], w[0] === 'to');
  });
}
export const isParallel = s => { const f = parallelForms(s); return !!f && f.every(x => x === f[0]); };
/** Where two versions of a sentence differ: { before, after (tokens), a, b (the words that differ, without the marks
 *  after them) }. */
function versionDiff(x, y) {
  const A = tokenize(x), Bt = tokenize(y);
  const same = (p, q) => p.t === q.t && p.post === q.post && p.pre === q.pre;
  let i = 0; while (i < A.length && i < Bt.length && same(A[i], Bt[i])) i++;
  let j = 0; while (j < A.length - i && j < Bt.length - i && same(A[A.length - 1 - j], Bt[Bt.length - 1 - j])) j++;
  // one version only adds words ("graphs" / "to read graphs"): the last shared word is part of both items
  while (j > 0 && (A.length - j === i || Bt.length - j === i)) j--;
  const ma = A.slice(i, A.length - j), mb = Bt.slice(i, Bt.length - j);
  if (!ma.length || !mb.length) return null;
  const post = ma[ma.length - 1].post;
  if (post !== mb[mb.length - 1].post) return null;
  const bare = m => joinTokens(m.map((w, k) => (k === m.length - 1 ? { ...w, post: '' } : w)));
  return { before: A.slice(0, i), after: A.slice(A.length - j), a: bare(ma), b: bare(mb), post };
}
/** Conjunctive adverbs (the card's list). */
export const CONJ_ADVERBS = Object.freeze(['however', 'therefore', 'meanwhile', 'consequently', 'nevertheless', 'instead', 'furthermore', 'afterward', 'moreover', 'otherwise', 'also', 'then', 'still', 'thus']);
/** A colon follows a clause that names what comes next (a number, a plan, a reason, a rule); else two related clauses
 *  take a semicolon. */
const SETUP = /\b(one|two|three|four|five|reason|rule|plan|goal|items|supplies|tool|things)\b/i;
const LIST_CUES = ['for example', 'such as', 'including'];

const BARE_912 = {
  // a sound-alike set: the words of the set are the choices in the blank
  words(r, def, problems, at) {
    const text = doubleQuotes(r.text).replace(/___ ([,.!?])/g, '___$1'), ans = unq(r.a).replace(/\.$/, '');
    if (!text.includes('___')) { problems.push(`${at}: no blank (___) in the sentence`); return false; }
    const start = !text.split('___')[0].trim();
    // the set's words in a fixed order per item (never always the same place for the same answer)
    const options = seededShuffle(def.read.words.map(w => firstUp(w, start)), at);
    const k = options.indexOf(ans);
    if (k < 0) { problems.push(`${at}: the answer "${ans}" is not one of ${options.join(' / ')} as the sentence needs it`); return false; }
    if (hintLeaks(r.hint, ans, options.filter(o => o !== ans))) problems.push(`${at}: the hint names the answer "${ans}" and not the other choices`);
    const [b, a] = text.split('___');
    return { format: 'choice', text, options, answer: [k], right: `${b}${ans}${a}`, rule: 'words', check: def.read.check };
  },
  // a blank between two clauses: the chips put back the colon or semicolon (and the comma after a conjunctive adverb)
  clausemark(r, def, problems, at) {
    const right = doubleQuotes(unq(r.a));
    let text = doubleQuotes(r.text).replace(/ ___ /, ' ');
    const adv = CONJ_ADVERBS.find(w => new RegExp(`; ${w},`, 'i').test(right));
    if (def.read.check === 'conjadv') {
      if (!adv) { problems.push(`${at}: the fix has no "; adverb," between its clauses`); return false; }
      text = text.replace(new RegExp(`\\b(${adv}),`, 'i'), '$1');
    }
    const it = marksItem(text, right, def, problems, at);
    return it && { ...it, rule: def.read.check, ...(adv ? { adverb: adv } : {}) };
  },
  // "Which word is a compound noun in this sentence: The firefighter checked the alarm?": tap it
  compound(r, def, problems, at) {
    const x = /^Which (word|phrase) is a compound (noun|adjective) in this sentence: (.+)\?$/.exec(r.text);
    if (!x) { problems.push(`${at}: not "Which word is a compound noun in this sentence: ...?"`); return false; }
    const text = `${x[3]}.`, ans = unq(r.a).replace(/\.$/, ''), places = placesOf(text, ans);
    if (!places) { problems.push(`${at}: the answer "${ans}" is not in the sentence once`); return false; }
    if (hintLeaks(r.hint, ans)) problems.push(`${at}: the hint names the answer "${ans}"`);
    return { format: 'tap', text, ask: `Tap the compound ${x[2]}.`, answer: places, rule: 'compound-word', kind: x[2] };
  },
  // "Write the compound noun correctly: My (mother in law) visited us.": the ways to write the words in the blank
  join(r, def, problems, at) {
    const x = /^(.+?): (.*?)\(([^()]+)\)(.*)$/.exec(r.text);
    if (!x) { problems.push(`${at}: no words in parentheses to join`); return false; }
    const [, , before, inner, after] = x, kind = def.read.join, right = unq(r.a);
    const parts = inner.split(/\s*\+\s*|\s+/);
    const { open, hyphen, third } = joinForms(parts);
    const start = !before.trim();
    const forms = [hyphen, kind === 'affix' ? parts.join('') : third, open].map(o => firstUp(o, start));
    const k = forms.findIndex(o => right === `${before}${o}${after}`);
    if (k < 0) { problems.push(`${at}: the answer is not the sentence with one way of writing "${inner}"`); return false; }
    const rights = [k];
    // a compound noun with two standard spellings (well-being, wellbeing): either is right
    if (kind === 'noun') rights.push(...forms.map((o, i) => i).filter(i => i !== k && (COMPOUND_NOUNS[parts.join(' ').toLowerCase()] || []).includes(forms[i].toLowerCase())));
    // re before e: "re-enter" and "reenter" are both standard US spellings, so either is right
    if (kind === 'affix' && /^re$/i.test(parts[0]) && /^e/.test(parts[1])) rights.push(...[0, 1].filter(i => i !== k));
    const options = seededShuffle([...new Set(forms)], at);
    const answer = rights.map(i => options.indexOf(forms[i])).sort((p, q) => p - q);
    if (hintLeaks(r.hint, forms[k])) problems.push(`${at}: the hint names the answer "${forms[k]}"`);
    return { format: 'choice', text: `${before}___${after}`, options, answer, right, rule: 'join', kind, parts,
      ...(answer.length > 1 ? { multi: true } : {}), ...(def.read.cycle ? { cycle: true } : {}) };
  },
  // a list with a cue word: the chips (a comma, or a colon that never belongs after such as or including)
  cue(r, def, problems, at) {
    const x = /^Punctuate the list cue: (.+)$/.exec(r.text);
    if (!x) { problems.push(`${at}: not "Punctuate the list cue: ..."`); return false; }
    const it = marksItem(doubleQuotes(x[1]), doubleQuotes(unq(r.a)), def, problems, at);
    return it && { ...it, rule: 'listcue' };
  },
  // "Which sentence has parallel elements: A, or B?": the two sentences
  parallel(r, def, problems, at) {
    const x = /^Which (sentence has parallel elements|revision is parallel): (.+?), or ([A-Z].+)\?$/.exec(r.text);
    if (!x) { problems.push(`${at}: not "Which sentence has parallel elements: A, or B?"`); return false; }
    const versions = [x[2], x[3]].map(v => (/[.!?]$/.test(v) ? v : `${v}.`)), right = unq(r.a);
    const k = versions.indexOf(right);
    if (k < 0) { problems.push(`${at}: the answer is not one of the two sentences`); return false; }
    if (def.read.match) {
      // the revision: the odd item is the blank, its forms the choices (the parallel one, the odd one, and one more form)
      const d = versionDiff(versions[k], versions[1 - k]);
      if (!d) { problems.push(`${at}: the two sentences do not differ in one item`); return false; }
      const odd = d.b, fix = d.a, third = thirdForm(fix, odd);
      const blank = `${joinTokens([...d.before, { t: '___', pre: '', post: d.post }])}${d.after.length ? ` ${joinTokens(d.after)}` : ''}`;
      const options = seededShuffle([fix, odd, ...(third ? [third] : [])], at);
      return { format: 'choice', text: blank, ask: 'Choose the words that match the other items.', options, answer: [options.indexOf(fix)], right, rule: 'parallel-match',
        ...(def.read.cycle ? { cycle: true } : {}) };
    }
    return { format: 'choice', text: right, ask: 'Which sentence has parallel elements?', options: versions, answer: [k], right, whole: true, rule: 'parallel' };
  },
};
/** One more form of a list item, by rule: an infinitive's -ing form or base, an -ing word's base, a past form's -ing. */
function thirdForm(fix, odd) {
  const w = fix.split(' ');
  let base = null;
  if (w[0] === 'to') base = w[1];
  else if (/ing$/.test(w[0]) && /^to /.test(odd)) base = odd.split(' ')[1];
  else if (/ed$/.test(w[0])) base = baseFromPast(w[0]);
  if (!base) return null;
  const rest = (w[0] === 'to' ? w.slice(2) : w.slice(1)).join(' ');
  const cands = [ingOf(base), base, `to ${base}`].map(c => (rest ? `${c} ${rest}` : c));
  return cands.find(c => c !== fix && c !== odd) || null;
}
Object.assign(BARE, BARE_912);

/** The independent check of the 9-12 items (called from checkItems). */
function checkItems3(it, chk) {
  const at = it.id, right = it.options ? it.options[it.answer[0]] : null, wrong = it.options ? it.options.filter((_, i) => !it.answer.includes(i)) : [];
  switch (it.rule) {
    case 'words': {
      const [b, a] = around(it.text), want = WORD_RULES[it.check] && WORD_RULES[it.check](b, a);
      chk(!!want && norm(right) === want && wrong.every(o => norm(o) !== want), `${at}: the ${it.check} rule takes "${want}" here, not "${right}"`);
      break;
    }
    case 'join': {
      const rights = it.answer.map(i => it.options[i].toLowerCase());
      const inner = it.parts.join(' ').toLowerCase();
      let want;
      if (it.kind === 'noun') want = COMPOUND_NOUNS[inner] || [];
      else if (it.kind === 'adjective' || it.kind === 'fraction') want = [it.parts.join('-').toLowerCase()];
      else if (it.kind === 'affix') {
        const [pre, root] = it.parts;
        want = [affixJoin(pre, root) === 'hyphen' ? `${pre}-${root}` : `${pre}${root}`].map(x => x.toLowerCase());
        if (/^re$/i.test(pre) && /^e/.test(root)) want.push(`${pre}${root}`.toLowerCase());
      } else if (it.kind === 'clarity') want = [it.parts.join('-').toLowerCase()];
      if (it.kind === 'fraction') chk(NUMBER_WORDS.includes(it.parts[0].toLowerCase()) && FRACTION_PARTS.test(it.parts[1]), `${at}: "${inner}" is not a spelled-out fraction`);
      if (it.kind === 'clarity' && it.parts[0].toLowerCase() === 're') chk(CLARITY_WORDS.includes(it.parts.join('').toLowerCase()), `${at}: "${it.parts.join('')}" is not a word with another meaning`);
      chk(!!want && want[0] !== undefined && rights.every(o => want.includes(o)) && want.every(o => rights.includes(o)), `${at}: the ${it.kind} rule makes "${want}", not "${rights}"`);
      for (const o of wrong) chk(!want || !want.includes(o.toLowerCase()), `${at}: wrong option "${o}" is the ${it.kind} rule's form`);
      break;
    }
    case 'parallel': chk(isParallel(right) && wrong.every(o => !isParallel(o)), `${at}: the parallel rule disagrees`); break;
    case 'parallel-match': {
      const fill = o => it.text.replace('___', o);
      chk(isParallel(fill(right)) && wrong.every(o => !isParallel(fill(o))), `${at}: a wrong form matches the other items, or the right one does not`);
      break;
    }
    case 'compound-word': {
      const w = it.answer.map(i => tokenize(it.text)[i].t).join(' ').toLowerCase();
      chk(it.kind === 'noun' ? CLOSED_COMPOUNDS.includes(w) : /^[a-z]+(-[a-z]+)+$/.test(w) && it.answer[it.answer.length - 1] < tokenize(it.text).length - 1, `${at}: "${w}" is not a compound ${it.kind} by the rule`);
      break;
    }
    case 'colon': {
      const [g, mk] = it.want.find(([, m]) => m === ':' || m === ';') || [-1, ''];
      const first = it.words.slice(0, g + 1).map(w => w.t).join(' ');
      chk(mk === (SETUP.test(first) ? ':' : ';'), `${at}: the colon rule wants "${SETUP.test(first) ? ':' : ';'}" here`);
      break;
    }
    case 'conjadv': {
      const k = it.words.findIndex(w => norm(w.t) === it.adverb);
      chk(k > 0 && it.want.length === 2 && it.want.some(([g, m]) => g === k - 1 && m === ';') && it.want.some(([g, m]) => g === k && m === ','), `${at}: not a semicolon before "${it.adverb}" and a comma after it`);
      break;
    }
    case 'listcue': {
      const toks = it.words.map(w => norm(w.t));
      for (const cue of LIST_CUES) {
        const c = cue.split(' '), k = toks.findIndex((_, i) => c.every((x, j) => toks[i + j] === x));
        if (k < 0) continue;
        const end = k + c.length - 1, all = [...it.want, ...it.optional];
        const before = all.some(([g]) => g === k - 1), after = all.some(([g]) => g === end);
        if (cue === 'for example') chk(it.want.some(([g, m]) => g === k - 1 && m === ',') && it.want.some(([g, m]) => g === end && m === ','), `${at}: "for example" takes a comma on each side`);
        if (cue === 'such as') chk(!before && !after, `${at}: "such as" takes no mark before or after it`);
        if (cue === 'including') chk(!after && !it.want.some(([g]) => g === k - 1), `${at}: the comma before "including" is optional and none goes after it`);
      }
      chk(!it.want.some(([, m]) => m === ':'), `${at}: a colon never goes in a list with a cue word`);
      break;
    }
    default: break;
  }
}

/** A 6-8 topic's quiz lines -> its items (each with its own format). */
function readItems(lines, problems, where, topicDef, notes) {
  const ctx = { last: null, raws: [] }, def = { ...topicDef, notes };
  const raws = lines.map(l => {
    const line = { ...l, text: (notes[l.text.split('.')[0]] || {}).text || l.text };
    const r = rawOf(line, ctx, def);
    if (!r) problems.push(`${where} line ${l.line}: not "N. ... Answer: ... Hint: ..."`);
    return r;
  });
  ctx.raws = raws.filter(Boolean);
  return ctx.raws.map(r => {
    const at = `${where} item ${r.n}`;
    for (const read of [...READERS_2, ...READERS]) {
      const it = read(r, def, problems, at, ctx);
      if (it === false) return null;
      if (it) {
        if (it.format !== 'passage' && it.format !== 'tap' && r.hint.includes(it.right)) problems.push(`${at}: the hint gives the answer`);
        // a book or movie title in the sentence is shown in italics (overrides { title })
        const title = (notes[String(r.n)] || {}).title, titleAt = title ? placesOf(it.text, title) : null;
        if (title && !titleAt) problems.push(`${at}: the title "${title}" is not in the sentence`);
        return { n: r.n, ...it, hint: r.hint, ...(titleAt ? { titleAt } : {}), ...(def.read && def.read.asIs && (it.format === 'marks' || it.format === 'fix' || it.format === 'capfix') ? { asIs: true } : {}) };
      }
    }
    problems.push(`${at}: no reader knows this item's shape: ${r.q.slice(0, 80)}`);
    return null;
  }).filter(Boolean);
}

/** The second, independent check of a 6-8 topic's items: no wrong option is also right, by the rule each was made
 *  with. -> problems. */
export function checkItems(topic) {
  const problems = [];
  const chk = (ok, msg) => { if (!ok) problems.push(msg); };
  for (const it of topic.items) {
    const at = it.id;
    if (it.options && it.format !== 'fix') {
      chk((it.answer.length === 1 || (it.multi && it.answer.length === 2)) && new Set(it.options).size === it.options.length, `${at}: options repeat or more than one is right`);
      const right = it.options[it.answer[0]], wrong = it.options.filter((_, i) => i !== it.answer[0]);
      for (const o of wrong) {
        switch (it.rule) {
          case 'degree': chk(degreeOf(it.word, it.degree) === right && o !== right, `${at}: "${o}" is the ${it.degree} the rules make`); break;
          case 'rewrite': chk(right.startsWith(it.doer) && !isPassive(right) && (!o.startsWith(it.doer) || isPassive(o) || !o.includes(` ${it.verb} `)) && !(o.startsWith(it.doer) && o.includes(` ${it.verb} `)), `${at}: "${o}" is active, keeps the doer first and the time`); break;
          case 'order': chk(inOrder(right) && !right.includes(',') && (o.includes(',') || !inOrder(o)), `${at}: "${o}" keeps the adjective order with no comma`); break;
          case 'correlative': chk(CORRELATIVE[it.first] === right && o !== right, `${at}: "${o}" is the partner of "${it.first}"`); break;
          case 'title': chk(titleCase(right) === right && titleCase(o) !== o, `${at}: "${o}" follows the title rules`); break;
          case 'cite': chk(CITE_RIGHT.test(right) && !CITE_RIGHT.test(o), `${at}: "${o}" is a citation the card writes`); break;
          case 'function': chk(FUNCTION_OF[it.word] === right && o !== FUNCTION_OF[it.word] && !(FUNCTION_KIN[it.word] || []).some(c => FUNCTION_OF[c] === o), `${at}: "${o}" is a function "${it.word}" can have`); break;
          case 'tense': chk(capFirst(tenseOf(it.verb)) === right && o !== right, `${at}: "${it.verb}" is ${o}`); break;
          case 'paraphrase': {
            const runs = x => sharedRun(x, it.original);
            if (it.good) chk(runs(right) < 4 && runs(o) >= 4, `${at}: "${o}" is not too close to the original`);
            else chk(runs(right) >= 4 && runs(o) < 4, `${at}: "${o}" is too close to the original as well`);
            break;
          }
          default: break;
        }
      }
      // pills: the label the topic's rule gives the sentence
      if (it.plain && it.rule !== 'function' && it.rule !== 'tense' && it.rule !== 'pool' && it.rule !== 'given') {
        const w = it.focus && it.focus.length ? it.focus.map(i => tokenize(it.text)[i].t).join(' ') : '';
        const label = it.label.toLowerCase();
        let want = null;
        if (it.rule === 'voice') want = isPassive(it.text) ? /passive/ : /active/;
        if (it.rule === 'adjadv') want = /ly$/.test(w) ? /adverb/ : /adjective/;
        if (it.rule === 'advkind') want = new RegExp(adverbKind(w) || 'none');
        if (it.rule === 'commonproper') want = /^\p{Lu}/u.test(w) ? /proper/ : /common/;
        if (it.rule === 'longshort') want = workKind(it.text) === 'long' ? /long/ : /short/;
        if (it.rule === 'italics') want = workKind(it.text) === 'long' ? /italic/ : /quotation/;
        if (it.rule === 'thought') want = SUBORDINATORS.includes(lowWords(it.text)[0]) ? /incomplete/ : /^complete/;
        if (it.rule === 'contraction') want = CONTRACTION.test(it.text) ? /contraction/ : /possessive/;
        if (it.rule === 'splice') want = new RegExp(`, (${FANBOYS.join('|')}) `).test(it.text) ? /correct/ : /, /.test(it.text) ? /splice/ : /fused/;
        if (it.rule === 'transition') want = new RegExp(`^${(TRANSITION_KIND[lowWords(it.words).filter(x => x !== 'and').slice(0, 1).join(' ')] || TRANSITION_KIND[it.words.toLowerCase()] || 'none').toLowerCase()}`);
        if (want) chk(want.test(label), `${at}: the ${it.rule} rule does not give "${it.label}" for "${it.text}"`);
      }
      if (it.rule === 'given' && it.options.length === 2 && topic.read && topic.read.check === 'a-an') {
        const next = tokenize(it.text.split('___')[1] || '')[0];
        chk(next && (anBefore(next.t) ? /^an$/i : /^a$/i).test(right), `${at}: "${right}" is not the article the next word's sound takes`);
      }
      if (it.rule === 'given' && topic.read && topic.read.check === 'adjadv' && it.text.includes('___')) {
        const before = lowWords(it.text.split('___')[0]);
        const adjSpot = ['the', 'a', 'an'].includes(before[before.length - 1]);
        chk(adjSpot ? !/ly$|^well$/.test(right) : /ly$|^well$/.test(right), `${at}: "${right}" is not the form the blank's spot takes`);
      }
      if (it.rule === 'given' && topic.read && topic.read.check === 'order' && it.whole) chk(inOrder(right) && wrong.every(o => !inOrder(o)), `${at}: the adjective order rule disagrees`);
    }
    if (it.format === 'fix') {
      const right = it.options[it.answer[0]];
      chk(it.accept.includes(right), `${at}: the cycle's right version is not an accepted fix`);
      for (const o of it.options) if (o !== right) chk(!it.accept.includes(o), `${at}: wrong version "${o}" is an accepted fix`);
      if (it.rule === 'fix-splice') {
        const first = (/^(.+?)(?:, (?:and|but|or|so|yet) |\. |; )/.exec(right) || [])[1] || '';
        for (const a of it.accept) chk(joinOf(a, first) === 'joined', `${at}: accepted fix "${a}" does not join the thoughts right`);
        for (const o of it.options) if (o !== right) chk(joinOf(o, first) !== 'joined' || /, or /.test(o), `${at}: wrong version "${o}" joins the thoughts right`);
      }
      if (it.rule === 'fix-spelling') for (const o of it.options) if (o !== right) chk(!/\ba lot\b/.test(o), `${at}: "${o}" writes a lot as two words`);
      if (it.rule === 'fix-apostrophe') for (const o of it.options) if (o !== right) chk(/\b(your|her|our|their)'s\b|\b(yours|hers|ours|theirs)'/.test(o), `${at}: "${o}" has no apostrophe in its possessive pronoun`);
      if (it.rule === 'fix-endmark') {
        const inside = s => /[.,?!]”/.test(s) && !/”[.,?!]/.test(s);
        chk(inside(right), `${at}: the fix's mark is not inside the closing quotation mark`);
        for (const o of it.options) if (o !== right) chk(!inside(o) || o.charAt(o.lastIndexOf('”') - 1) !== right.charAt(right.lastIndexOf('”') - 1), `${at}: "${o}" has the right mark inside the quotation marks`);
      }
      if (it.rule === 'fix-conj') for (const o of it.options) if (o !== right) chk(o !== right && !it.accept.includes(o), `${at}: "${o}" is accepted`);
    }
    if (it.format === 'marks') {
      chk(it.want.every(([g]) => g >= 0 && g < it.words.length - 1), `${at}: a mark outside the sentence`);
      chk(!it.optional.some(([g]) => it.want.some(([h]) => h === g)), `${at}: a gap both needed and optional`);
    }
    if (it.format === 'capfix') chk(it.answer.every((i, k) => tokenize(it.text)[i].t !== it.fixed[k] && norm(tokenize(it.text)[i].t) === norm(it.fixed[k])), `${at}: a tapped word does not change case`);
    checkItems2(it, chk);
    checkItems3(it, chk);
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
/** Grades 9-12 read longer passages: a 9-12 topic's room holds 12 of its sentences. */
const ROOM_SIZE_912 = 12;
/** A topic's room: its own right sentences (8 of them, in a fixed order), planted by Mistake Hunt's planter with only
 *  the topic's kinds and a fixed seed. titlesOnly: a capital is planted only inside a title (the kind would also take
 *  a person's name); words: a mistake is planted only on these words. -> { title, passages: [{ t, x, g, m }], need } or
 *  a problem. */
export function buildRoom(topic, def, problems) {
  const P = proofCore();
  const kinds = def.room.kinds;
  for (const k of kinds) if (!P.BY[k]) { problems.push(`${topic.id} room: Mistake Hunt has no mistake kind "${k}"`); return null; }
  const sentences = seededShuffle(topic.items.map(it => ({ s: it.right || it.text, it })), `room|${topic.id}`).slice(0, topic.band === '9-12' ? ROOM_SIZE_912 : ROOM_SIZE);
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
  if (def.room.words) {
    // a sound-alike room plants only the topic's own words (never another pair the passage happens to hold)
    const toks = P.tokenize(x), ok = new Set(def.room.words.map(norm));
    avoid = avoid.concat(P.allCandidates(x, kinds).filter(c => !ok.has(norm(toks.slice(c.a, c.b).map(w => w.s).join(' ')))));
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
  // (a part with a band is only in that band's copy of a unit two bands share)
  for (const b of plan.bands) for (const p of b.pathways) for (const part of (plan.pathways[p] || { parts: [] }).parts) if (!part.band || part.band === b.id) for (const id of part.topics) bandOf[id] = bandOf[id] || b.id;
  for (const [id, def] of Object.entries(plan.topics)) {
    const where = `${id} (${def.source.band} "${def.source.title}")`;
    const src = findTopic(sections, def.source.band, def.source.title, def.source.line || null);
    if (!src) { problems.push(`${where}: no full topic with that title in that band of the source`); continue; }
    const fmt = def.format === 'items' ? readItems : FORMATS[def.format];
    if (!fmt) { problems.push(`${where}: format "${def.format}" is not built yet`); continue; }
    const notes = (overrides.topics || {})[id] || {};
    const sectioned = src.cardLines.length && /^Section \d+,/.test(src.cardLines[0].text);
    const card = sectioned ? parseSections(src.cardLines, problems, where, notes) : parseCard(src.cardLines, problems, where, def.format === 'items' ? 'choice' : def.format, def.choices && def.choices.pair);
    const items = (def.format === 'items' ? readItems(src.quizLines, problems, where, def, notes)
      : src.quizLines.map(l => fmt({ ...l, text: (notes[l.text.split('.')[0]] || {}).text || l.text }, problems, where, { ...def, notes })).filter(Boolean))
      .map(it => { const { n, ...rest } = it; return { id: `${id}-${n}`, ...rest }; });
    const levels = Array.isArray(def.levels) && def.levels.length ? def.levels : [4, 4, 4];
    if (items.length < 12) problems.push(`${where}: ${items.length} quiz items, at least 12 needed`);
    for (const it of items) {
      lint(it.text, problems, `${it.id} sentence`); lint(it.hint, problems, `${it.id} hint`);
      for (const o of it.options || []) lint(o, problems, `${it.id} option`);
      for (const k of ['ask', 'prompt', 'right', 'label']) if (it[k]) lint(it[k], problems, `${it.id} ${k}`);
      for (const a of it.accept || []) lint(a, problems, `${it.id} accepted fix`);
    }
    for (const [k, v] of Object.entries({ definition: card.definition, how: card.how, ask: def.ask, title: def.title || src.title })) lint(v || '', problems, `${id} ${k}`);
    for (const sec of card.sections || []) lint([sec.title, sec.question, sec.body || '', sec.note, ...sec.passage.map(x => `${x.label || ''} ${x.text}`)].join(' '), problems, `${id} card section`);
    if (card.example) for (const u of [card.example, ...(card.example.more || [])]) lint(unitText(u), problems, `${id} worked example`);
    for (const t of card.tips || []) lint(unitText(t), problems, `${id} tip`);
    const topic = { id, title: def.title || src.title, band: bandOf[id] || def.source.band, format: def.format, ask: def.ask, levels, source: { line: src.line },
      ...(def.choices ? { choices: def.choices } : {}), ...(def.choices && def.choices.kind === 'title' ? { italic: true } : {}),
      ...(def.choices && def.choices.cycle ? { cycle: true } : {}), ...(def.fix ? { fix: def.fix } : {}), ...(def.read ? { read: def.read } : {}), card, items };
    problems.push(...(def.format === 'items' ? checkItems(topic) : checkOptions(topic)));
    topics[id] = topic;
    if (def.room) { const r = buildRoom(topic, def, problems); if (r) { rooms[id] = r; topic.room = true; } }
  }
  for (const b of plan.bands) for (const p of b.pathways) {
    if (!plan.pathways[p]) { problems.push(`band ${b.id}: no pathway "${p}"`); continue; }
    lint(plan.pathways[p].title, problems, `pathway ${p}`);
    for (const part of plan.pathways[p].parts) {
      if (part.title) lint(part.title, problems, `pathway ${p} part`);
      if (part.band && !plan.bands.some(x => x.id === part.band && x.pathways.includes(p))) problems.push(`pathway ${p}: a part for band "${part.band}", which does not use this unit`);
      for (const id of part.topics) if (!plan.topics[id]) problems.push(`pathway ${p}: no topic "${id}"`);
    }
    const here = plan.pathways[p].parts.filter(x => !x.band || x.band === b.id).flatMap(x => x.topics);
    if (new Set(here).size !== here.length) problems.push(`pathway ${p} in band ${b.id}: a topic is listed twice`);
    if (!here.length) problems.push(`pathway ${p} in band ${b.id}: no topics`);
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
