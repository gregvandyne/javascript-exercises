#!/usr/bin/env node
// Grammar Lab's data build: the course text (seed-lessons/grammar-lab/source/course.md, the reviewed course as written)
// plus Oomba's own grouping (pathways.json) and per-item notes (overrides.json) -> topics.json, the data the server
// reads (services/grammar-lab.js). topics.json is committed; tests/unit/grammar-lab-build.test.js checks it is what this
// script makes from the source, so a source edit without a rebuild fails the tests.
//   node scripts/grammar-lab-build.js           write topics.json
//   node scripts/grammar-lab-build.js --check   exit 1 when topics.json is out of date
//
// The source's shape: "# ..." band sections (K-2, Grades 3-5, ...), "## Pathway N: Title" units, "### Topic: Title"
// (or "### 8.5 Title") topics. A topic written in full has a "**Teaching Card**" (or "Teaching card:") list of
// Definition, Worked example, How it works and Tip box, then a "**Quiz**" of numbered items:
//   1. "The round ball rolled down the hill." Answer: round. Hint: Look for the word that tells what shape the ball is.
// A topic that only says "See X above" is a cross-reference to the full one. File header and summary lines are never
// shipped: only the topics pathways.json names are built.
//
// Only the formats a built topic uses are read; a topic of any other format fails the build loudly rather than being
// guessed. Phase 1 builds one format, 'tap' (tap the word in the sentence; the answer is stored as word places in the
// shared cut, services/grammar-lab-text.js). The build also fails on: an answer that is not in its sentence exactly
// once, a hint that names its answer, an em or en dash anywhere, and the reference product's names or coinages.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenize, findWords, hasWord } from '../server/services/grammar-lab-text.js';

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

/** "Fluffy is the adjective. Kitten is the noun it tells about." -> [{ word, role }]. */
function rolesIn(text) {
  const out = [];
  for (const m of String(text).matchAll(/(?:^|[.!?]\s+)([\p{L}'-]+) is the (adjective|noun|verb|adverb|pronoun|subject|article|conjunction|preposition)\b/gu)) out.push({ word: m[1], role: m[2] });
  return out;
}

/** The teaching card lines -> { definition, example: { text, marks: [{ i, role }], note }, how, tips: [{ text, note, marks }] }. */
export function parseCard(cardLines, problems, where) {
  const field = name => {
    const l = cardLines.find(x => x.text.toLowerCase().startsWith(name.toLowerCase() + ':'));
    return l ? l.text.slice(name.length + 1).trim() : '';
  };
  const definition = field('Definition'), worked = field('Worked example'), how = field('How it works'), tip = field('Tip box');
  for (const [k, v] of [['Definition', definition], ['Worked example', worked], ['How it works', how], ['Tip box', tip]]) if (!v) problems.push(`${where}: the teaching card has no ${k}`);
  const wm = /^"([^"]+)"\s*(.*)$/.exec(worked);
  let example = null;
  if (!wm) problems.push(`${where}: the worked example has no quoted sentence`);
  else {
    const tokens = tokenize(wm[1]);
    const marks = rolesIn(wm[2]).map(r => {
      const at = findWords(tokens, r.word);
      if (at.length !== 1) problems.push(`${where}: the worked example's ${r.role} "${r.word}" is in its sentence ${at.length} times`);
      return at.length ? { i: at[0][0], role: r.role } : null;
    }).filter(Boolean);
    if (!marks.length) problems.push(`${where}: the worked example names no word's job ("X is the adjective.")`);
    example = { text: wm[1], note: wm[2], marks };
  }
  // Tip box: "The yellow bus." Yellow tells about bus. "Five birds." Five tells how many birds.
  const roles = example ? example.marks.map(m => m.role) : [];
  const tips = [...tip.matchAll(/"([^"]+)"\s*([^"]*)/g)].map(m => {
    const tokens = tokenize(m[1]), note = m[2].trim();
    const inNote = tokenize(note).map(x => x.t).filter(w => findWords(tokens, w).length === 1);
    const marks = [];
    if (inNote.length) marks.push({ i: findWords(tokens, inNote[0])[0][0], role: roles[0] || 'key' });
    if (inNote.length > 1 && roles[1]) marks.push({ i: findWords(tokens, inNote[inNote.length - 1])[0][0], role: roles[1] });
    return { text: m[1], note, marks };
  });
  if (tip && !tips.length) problems.push(`${where}: the tip box has no quoted example`);
  return { definition, example, how, tips };
}

const FORMATS = {
  /** Tap the word: 1. "Sentence." Answer: word. Hint: ... -> { text, answer: [word places], hint }. */
  tap(line, problems, where) {
    const m = /^(\d+)\.\s+"(.+?)"\s+Answer:\s+(.+?)\.\s+Hint:\s+(.+)$/.exec(line.text);
    if (!m) { problems.push(`${where} line ${line.line}: not a tap item ("N. "Sentence." Answer: word. Hint: ...")`); return null; }
    const [, n, text, answer, hint] = m;
    const at = findWords(tokenize(text), unquote(answer));
    if (at.length !== 1) problems.push(`${where} item ${n}: the answer "${answer}" is in its sentence ${at.length} times, not once`);
    if (hasWord(hint, unquote(answer))) problems.push(`${where} item ${n}: the hint names the answer "${answer}"`);
    return { n: +n, text, answer: at[0] || [], hint: hint.trim() };
  },
};

/** Check one text field for the content rules. */
function lint(text, problems, where) {
  if (DASHES.test(text)) problems.push(`${where}: an em or en dash`);
  if (BANNED.test(text)) problems.push(`${where}: names the reference product or one of its coinages`);
}

/** Build every topic pathways.json names. -> { topics, problems }. */
export function buildTopics(md, plan, overrides = { topics: {} }) {
  const sections = parseCourse(md);
  const problems = [];
  const topics = {};
  const bandOf = {};
  for (const b of plan.bands) for (const p of b.pathways) for (const part of plan.pathways[p].parts) for (const id of part.topics) bandOf[id] = bandOf[id] || b.id;
  for (const [id, def] of Object.entries(plan.topics)) {
    const where = `${id} (${def.source.band} "${def.source.title}")`;
    const src = findTopic(sections, def.source.band, def.source.title);
    if (!src) { problems.push(`${where}: no full topic with that title in that band of the source`); continue; }
    const fmt = FORMATS[def.format];
    if (!fmt) { problems.push(`${where}: format "${def.format}" is not built yet`); continue; }
    const card = parseCard(src.cardLines, problems, where);
    const notes = (overrides.topics || {})[id] || {};
    const items = src.quizLines.map(l => fmt({ ...l, text: (notes[l.text.split('.')[0]] || {}).text || l.text }, problems, where)).filter(Boolean)
      .map(it => ({ id: `${id}-${it.n}`, text: it.text, answer: it.answer, hint: it.hint }));
    const levels = Array.isArray(def.levels) && def.levels.length ? def.levels : [4, 4, 4];
    if (items.length < 12) problems.push(`${where}: ${items.length} quiz items, at least 12 needed`);
    for (const it of items) { lint(it.text, problems, `${it.id} sentence`); lint(it.hint, problems, `${it.id} hint`); }
    for (const [k, v] of Object.entries({ definition: card.definition, how: card.how, ask: def.ask, title: src.title })) lint(v || '', problems, `${id} ${k}`);
    if (card.example) lint(card.example.text + ' ' + card.example.note, problems, `${id} worked example`);
    for (const t of card.tips) lint(t.text + ' ' + t.note, problems, `${id} tip`);
    topics[id] = { id, title: src.title, band: bandOf[id] || def.source.band, format: def.format, ask: def.ask, levels, source: { line: src.line }, card, items };
  }
  for (const b of plan.bands) for (const p of b.pathways) {
    if (!plan.pathways[p]) { problems.push(`band ${b.id}: no pathway "${p}"`); continue; }
    lint(plan.pathways[p].title, problems, `pathway ${p}`);
    for (const part of plan.pathways[p].parts) for (const id of part.topics) if (!plan.topics[id]) problems.push(`pathway ${p}: no topic "${id}"`);
  }
  return { topics, problems };
}

/** The whole topics.json, from the files on disk. Throws on any problem. */
export function build() {
  const md = fs.readFileSync(path.join(DIR, 'source/course.md'), 'utf8');
  const plan = readJson(path.join(DIR, 'pathways.json'));
  const overrides = readJson(path.join(DIR, 'overrides.json'));
  const { topics, problems } = buildTopics(md, plan, overrides);
  if (problems.length) throw new Error(`grammar-lab-build: ${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  return { _about: 'Generated by scripts/grammar-lab-build.js from source/course.md, pathways.json and overrides.json. Do not edit by hand.', bands: plan.bands, pathways: plan.pathways, topics };
}
export const serialize = data => JSON.stringify(data, null, 1) + '\n';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let text;
  try { text = serialize(build()); } catch (e) { process.stderr.write(e.message + '\n'); process.exit(1); }
  if (process.argv.includes('--check')) {
    const now = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (now !== text) { process.stderr.write('topics.json is out of date: run node scripts/grammar-lab-build.js\n'); process.exit(1); }
    process.stdout.write('topics.json is up to date.\n');
  } else {
    fs.writeFileSync(OUT, text);
    process.stdout.write(`Wrote ${path.relative(ROOT, OUT)}: ${Object.keys(JSON.parse(text).topics).length} topic(s).\n`);
  }
}
