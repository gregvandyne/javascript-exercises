// Story Library importer: the pure parts (no database, no files written), shared by scripts/import-stories.js and the
// unit tests (docs/story-library-sources.md, docs/decisions.md "Story Library").
//
// Two sources share the manifest: StoryWeaver / Pratham Books (from the global-asp pb-source and pb-imagebank
// repositories, scripts/import-stories.js) and Bloom Library (scripts/import-bloom.js, its own parser and license rule in
// bloom-lib.js; the grade rule here is shared). The manifest's `source` field tells them apart. Nothing here fetches
// anything.
import fs from 'node:fs';
import { sentences } from '../../public/js/library-text.js';

/** Licenses a book may carry to be included. Everything else (NC, ND, SA, "all rights reserved", missing, unreadable)
 *  is left out. Keys are what licenseOf() returns. */
export const ALLOWED = Object.freeze({
  'cc-by-4.0': { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
  'public-domain': { name: 'Public Domain', url: '' },
});

/**
 * One license text as found in a source ("[CC-BY]", "CC BY 4.0", "[CC-BY](https://creativecommons.org/licenses/by/4.0/)",
 * "Public Domain", "CC-BY-NC-SA 4.0" ...) -> 'cc-by-4.0' | 'public-domain' | a rejection code:
 * 'missing' | 'nc' | 'nd' | 'sa' | 'version' | 'unknown'. A link, when there is one, must agree with the words.
 */
export function licenseOf(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return 'missing';
  const link = /\((https?:\/\/[^)\s]+)\)/.exec(s);
  const words = s.replace(/\((https?:\/\/[^)\s]+)\)/g, ' ').replace(/[[\]*_.]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  if (/^public[ -]?domain$|^cc0( 1 0)?$/.test(words)) return link && !/publicdomain/.test(link[1]) ? 'unknown' : 'public-domain';
  const cc = /^(?:cc|creative commons)[ -]?(by(?:[ -](?:nc|nd|sa))*)(?:[ -]?(\d)(?: ?\d)?)?$/.exec(words.replace(/ 4 0$/, ' 4'));
  if (!cc) return 'unknown';
  const parts = cc[1].split(/[ -]/);
  if (parts.includes('nc')) return 'nc';
  if (parts.includes('nd')) return 'nd';
  if (parts.includes('sa')) return 'sa';
  // StoryWeaver writes "[CC-BY]" with no version; its link (and StoryWeaver's terms) is 4.0. A version that is not 4.0
  // is refused rather than guessed (an older version needs different attribution wording).
  if (cc[2] && cc[2] !== '4') return 'version';
  if (link) {
    const u = link[1].toLowerCase();
    if (!/creativecommons\.org\/licenses\/by\/4\.0\/?$/.test(u)) return /by-(nc|nd|sa)/.test(u) ? (/nc/.test(u) ? 'nc' : /nd/.test(u) ? 'nd' : 'sa') : 'version';
  }
  return 'cc-by-4.0';
}
export const isAllowed = code => Object.prototype.hasOwnProperty.call(ALLOWED, code);

/**
 * Oomba's corrections of mistakes in a book's own text (docs/decisions.md "Story Library: typos corrected"): a list of
 * { page, from, to } written by a person in seed-library/storyweaver.json (`fixes` on a pick), page 1..N a text page
 * and page 0 the title. Each `from` is replaced by `to` as an exact substring, in order, and must be found exactly once
 * on that page when it is applied: anything else throws, so a correction that no longer matches its source (or would
 * change the wrong place) stops the import instead of being skipped. -> { title, pages, count }
 */
export function applyFixes(title, pages, fixes, label = 'book') {
  const out = [...pages];
  let t = title;
  for (const [i, f] of (fixes || []).entries()) {
    const where = `${label} fix ${i + 1}`;
    if (!f || !Number.isInteger(f.page) || f.page < 0 || f.page > out.length) throw new Error(`${where}: page must be 0 (the title) or 1..${out.length}`);
    if (typeof f.from !== 'string' || !f.from || typeof f.to !== 'string' || f.from === f.to) throw new Error(`${where}: needs a "from" and a different "to"`);
    const text = f.page ? out[f.page - 1] : t;
    const at = text.indexOf(f.from);
    if (at < 0) throw new Error(`${where}: "${f.from}" is not on page ${f.page}`);
    if (text.indexOf(f.from, at + 1) >= 0) throw new Error(`${where}: "${f.from}" is on page ${f.page} more than once`);
    const fixed = text.slice(0, at) + f.to + text.slice(at + f.from.length);
    if (f.page) out[f.page - 1] = fixed; else t = fixed;
  }
  return { title: t, pages: out, count: (fixes || []).length };
}

/** Whitespace and conversion leftovers only: the story's words are changed only by a person's listed fixes (applyFixes). */
export function tidyText(s) {
  return String(s || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\\([*_[\]()#])/g, '$1')            // Markdown escapes from the EPUB conversion ("\*")
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * A pb-source story file -> { title, pages: [text], meta: { license, text, illustration, translation, ... }, problems }.
 * Format: "# Title", pages separated by lines of "##", and a last block of "* Key: value" lines.
 */
export function parseStoryMarkdown(md) {
  const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
  const problems = [];
  let title = '';
  const blocks = [[]];
  for (const line of lines) {
    if (!title && /^# /.test(line)) { title = line.slice(2).trim(); continue; }
    if (/^##\s*$/.test(line)) { blocks.push([]); continue; }
    blocks[blocks.length - 1].push(line);
  }
  blocks.shift();   // anything before the first page break (blank lines after the title)
  // The credits block: the last block whose lines are "* Key: value".
  const meta = {};
  let last = blocks.length ? blocks[blocks.length - 1] : [];
  const metaLine = /^\* ([A-Za-z ]+):\s*(.*)$/;
  if (last.some(l => /^\* License:/.test(l))) {
    for (const l of last) { const m = metaLine.exec(l.trim()); if (m) meta[m[1].trim().toLowerCase()] = m[2].trim(); }
    blocks.pop();
  } else problems.push('no credits block');
  const pages = blocks.map(b => tidyText(b.join('\n')));
  if (!title) problems.push('no title');
  return { title: tidyText(title), pages, meta, problems };
}

/** A person list as written in the credits ("A, B") -> ["A", "B"]; a duo credited as one ("Angie & Upesh") stays one. */
export const people = s => String(s || '').split(/\s*,\s*/).map(x => x.trim()).filter(Boolean);

/**
 * pb-imagebank metadata/NNNN.md -> { sourceUrl, images: [{ file, description, illustrator, license }], problems }.
 * "Image | Description | Illustrator | License" table rows.
 */
export function parseImageMetadata(md) {
  const text = String(md || '');
  const problems = [];
  const src = /\]\((https:\/\/storyweaver\.org\.in\/stories\/[^)\s]+)\)/.exec(text);
  const images = [];
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split('|').map(c => c.trim());
    if (cells.length < 4 || !/^\d+\.(jpe?g|png)$/i.test(cells[0])) continue;
    images.push({ file: cells[0], description: cells[1] || '', illustrator: cells[2] || '', license: cells.slice(3).join('|').trim() });
  }
  if (!images.length) problems.push('no image rows');
  return { sourceUrl: src ? src[1] : '', images, problems };
}

/** Words in a page (letters or digits; "don't" is one word). */
export const wordCount = s => (String(s || '').match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu) || []).length;

// ---------------------------------------------------------------- US grade levels
// Oomba's estimate of the US school grade a book suits (docs/decisions.md "Story Library: US grade levels"), from
// public, documented measures of its text. Not a Lexile, Guided Reading or Fountas & Pinnell level (those are other
// people's systems); teachers are told it is an estimate.
const SIGHT_SRC = JSON.parse(fs.readFileSync(new URL('./sight-words.json', import.meta.url), 'utf8'));
/** The Dolch (220 service words and 95 nouns) and Fry 1,000 sight words, lowercase. */
export const SIGHT_WORDS = new Set([...Object.values(SIGHT_SRC.dolch).flat(), ...SIGHT_SRC.fry].map(w => w.toLowerCase()));
const undouble = s => (/([^aeiou])\1$/.test(s) ? s.slice(0, -1) : s);
/** A word (lowercase) is a sight word, or one with an ending added: -s, -es, -ies, -'s, -ed, -ied, -ing, -ly, -ily, -er, -est. */
export function isSightWord(w) {
  w = String(w || '').toLowerCase().replace(/’/g, "'");
  if (SIGHT_WORDS.has(w)) return true;
  const t = [];
  if (/'s$/.test(w)) t.push(w.slice(0, -2));
  if (/ies$/.test(w)) t.push(`${w.slice(0, -3)}y`);
  if (/es$/.test(w)) t.push(w.slice(0, -2));
  if (/s$/.test(w)) t.push(w.slice(0, -1));
  if (/ied$/.test(w)) t.push(`${w.slice(0, -3)}y`);
  if (/ed$/.test(w)) t.push(w.slice(0, -2), w.slice(0, -1), undouble(w.slice(0, -2)));
  if (/ing$/.test(w)) t.push(w.slice(0, -3), `${w.slice(0, -3)}e`, undouble(w.slice(0, -3)));
  if (/ly$/.test(w)) t.push(w.slice(0, -2));
  if (/ily$/.test(w)) t.push(`${w.slice(0, -3)}y`);
  if (/(er|est)$/.test(w)) { const b = w.replace(/(er|est)$/, ''); t.push(b, `${b}e`, undouble(b), b.replace(/i$/, 'y')); }
  return t.some(x => SIGHT_WORDS.has(x));
}
/** Syllables in an English word, by vowel groups (the usual readability-formula estimate: a silent final e, -es and -ed
 *  are not counted; at least one). */
export function syllables(word) {
  let w = String(word || '').toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|[^laeiouy]ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  return Math.max(1, (w.match(/[aeiouy]{1,2}/g) || []).length);
}
const WORD_RE = /[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu;
const r1 = x => Math.round(x * 10) / 10, r2 = x => Math.round(x * 100) / 100;
/**
 * The measures of a book's text (pages with text only). Sentences are cut as the reader cuts them (library-text.js: at
 * . ! ? and every line break). The sight-word share leaves out names (a capital letter inside a sentence) and numbers.
 * -> { words, pages, perPage, maxPage, sentences, perSentence, syllablesPerWord, fk (Flesch-Kincaid grade), notSight (% of
 *      words outside the Dolch and Fry lists) }
 */
export function measure(pages) {
  let words = 0, syl = 0, sents = 0, counted = 0, hard = 0;
  const per = [];
  for (const p of pages) {
    const n = wordCount(p); if (!n) continue;
    per.push(n); words += n;
    for (const s of sentences(p)) {
      const ws = s.text.match(WORD_RE) || []; if (!ws.length) continue;
      sents++;
      ws.forEach((w, i) => {
        syl += syllables(w);
        if (/^\d/.test(w) || (i > 0 && /^\p{Lu}/u.test(w) && !SIGHT_WORDS.has(w.toLowerCase()))) return;
        counted++; if (!isSightWord(w)) hard++;
      });
    }
  }
  if (!words) return { words: 0, pages: 0, perPage: 0, maxPage: 0, sentences: 0, perSentence: 0, syllablesPerWord: 0, fk: 0, notSight: 0 };
  const perSentence = words / Math.max(1, sents), spw = syl / words;
  return { words, pages: per.length, perPage: r1(words / per.length), maxPage: Math.max(...per), sentences: sents,
    perSentence: r1(perSentence), syllablesPerWord: r2(spw), fk: r1(0.39 * perSentence + 11.8 * spw - 15.59),
    notSight: r1(counted ? (100 * hard) / counted : 0) };
}

/**
 * The grade rule. Each measure is turned into a grade number (Pre-K/K = 0, Grade 1 = 1, ... Grades 4-5 = 4.5) by
 * straight lines between the anchor points below (words in all and words a page on a log scale), clamped to -0.5..5.5.
 * The book's score is their weighted mean. Flesch-Kincaid and the sight-word share mean little on a very short text, so
 * they count for less below 300 words (FK not at all at 100 words or fewer). The score picks the band; a book over
 * 2,500 words or scoring 5 or more (past Grade 5) is left out.
 */
export const GRADES = Object.freeze(['k', '1', '2', '3', '4-5']);
export const GRADE_RULE = Object.freeze({
  anchors: {
    words: [[0, 60], [1, 150], [2, 400], [3, 900], [4.5, 2000]],
    perPage: [[0, 6], [1, 12], [2, 25], [3, 50], [4.5, 100]],
    perSentence: [[0, 4.5], [1, 6], [2, 7.5], [3, 9.5], [4.5, 12]],
    notSight: [[0, 8], [1, 12], [2, 16], [3, 20], [4.5, 25]],
  },
  weights: { words: 0.25, perPage: 0.25, perSentence: 0.2, notSight: [0.05, 0.15], fk: [0, 0.15] },
  shortText: [100, 300],
  bands: [[0.5, 'k'], [1.5, '1'], [2.5, '2'], [3.5, '3'], [5, '4-5']],
  maxWords: 2500,
});
function onLine(x, anchors, log) {
  const f = v => (log ? Math.log(Math.max(v, 1e-6)) : v), X = f(x);
  let i = anchors.findIndex(([, v]) => X <= f(v));
  if (i === 0) i = 1; else if (i < 0) i = anchors.length - 1;
  const [g0, v0] = anchors[i - 1], [g1, v1] = anchors[i];
  return g0 + ((X - f(v0)) / (f(v1) - f(v0))) * (g1 - g0);
}
/** -> { grade: 'k' | '1' | '2' | '3' | '4-5' | null (too long, too hard or no text), score, votes, why? } */
export function gradeOf(m) {
  const R = GRADE_RULE;
  if (!m.words) return { grade: null, score: null, votes: {}, why: 'no text' };
  const clamp = v => Math.max(-0.5, Math.min(5.5, v));
  const votes = {
    words: onLine(m.words, R.anchors.words, true), perPage: onLine(m.perPage, R.anchors.perPage, true),
    perSentence: onLine(m.perSentence, R.anchors.perSentence), notSight: onLine(m.notSight, R.anchors.notSight), fk: m.fk,
  };
  const ramp = Math.min(1, Math.max(0, (m.words - R.shortText[0]) / (R.shortText[1] - R.shortText[0])));
  const w = Object.fromEntries(Object.entries(R.weights).map(([k, v]) => [k, Array.isArray(v) ? v[0] + (v[1] - v[0]) * ramp : v]));
  let sum = 0, tot = 0;
  for (const k of Object.keys(votes)) { votes[k] = r1(clamp(votes[k])); sum += w[k] * votes[k]; tot += w[k]; }
  const score = r2(sum / tot);
  if (m.words > R.maxWords) return { grade: null, score, votes, why: `too long (${m.words} words)` };
  const band = R.bands.find(([lim]) => score < lim);
  return band ? { grade: band[1], score, votes } : { grade: null, score, votes, why: `past Grade 5 (score ${score})` };
}

/**
 * Which picture goes with which text page. pb-imagebank numbers a book's images 01, 02, ...; 01 is the cover (the
 * same picture StoryWeaver puts on the front) and image N+1 belongs to text page N. That holds only when there is
 * exactly one more image than text pages; anything else is reported and the book is left out (never guessed).
 * -> { ok, cover, pages: [file], reason? }
 */
export function mapImages(pageCount, images) {
  const files = images.map(i => i.file).sort();
  const seq = files.every((f, i) => parseInt(f, 10) === i + 1);
  if (!seq) return { ok: false, reason: 'images not numbered 01..N' };
  if (files.length === pageCount + 1) return { ok: true, cover: files[0], pages: files.slice(1) };
  return { ok: false, reason: `${files.length} images for ${pageCount} pages` };
}

/**
 * A picture order written by a person (seed-library/storyweaver.json "pictureMap") for a book whose pictures do not
 * line up one-to-one: used only when the image metadata's descriptions make it unambiguous, and recorded with why. It
 * must name a cover and exactly one picture per page, each listed in the metadata, none twice. Pictures it leaves out
 * are not used. -> { ok, cover, pages, why } | { ok: false, reason }
 */
export function checkPictureMap(m, pageCount, images) {
  const files = new Set(images.map(i => i.file));
  if (!m || typeof m.why !== 'string' || !m.why.trim()) return { ok: false, reason: 'a hand-made picture order needs a reason' };
  if (!Array.isArray(m.pages) || m.pages.length !== pageCount) return { ok: false, reason: `the hand-made picture order has ${Array.isArray(m.pages) ? m.pages.length : 0} pictures for ${pageCount} pages` };
  const used = [m.cover, ...m.pages];
  const missing = used.find(f => !files.has(f));
  if (missing) return { ok: false, reason: `the hand-made picture order names ${missing}, which is not in the metadata` };
  if (new Set(used).size !== used.length) return { ok: false, reason: 'the hand-made picture order uses a picture twice' };
  return { ok: true, cover: m.cover, pages: [...m.pages], why: m.why.trim() };
}

/**
 * The license check for one book: the story text and every image it would use must be CC BY 4.0 or Public Domain.
 * -> { ok, textLicense, imageLicenses: Set, reason? }
 */
export function checkLicenses(textLicenseRaw, images) {
  const text = licenseOf(textLicenseRaw);
  if (!isAllowed(text)) return { ok: false, textLicense: text, reason: `text license: ${text === 'missing' ? 'missing' : text === 'unknown' ? `unreadable ("${String(textLicenseRaw).slice(0, 40)}")` : text.toUpperCase()}` };
  if (!images || !images.length) return { ok: false, textLicense: text, reason: 'image metadata missing' };
  const codes = new Set();
  for (const im of images) {
    const c = licenseOf(im.license);
    if (!isAllowed(c)) return { ok: false, textLicense: text, reason: `image ${im.file} license: ${c === 'missing' ? 'missing' : c === 'unknown' ? 'unreadable' : c.toUpperCase()}` };
    codes.add(c);
  }
  return { ok: true, textLicense: text, imageLicenses: codes };
}

/** The license a book is shown with: CC BY 4.0 when any part is CC BY (attribution is then required anyway). */
export const bookLicense = (textCode, imageCodes) => ([textCode, ...imageCodes].includes('cc-by-4.0') ? 'cc-by-4.0' : 'public-domain');

/** The questions a book must have: exactly 3, each with 3 different choices, one right answer (0-2) and the page
 *  (1-based) that answers it. -> [] when fine, else the problems. */
export function checkQuestions(qs, pageCount) {
  const out = [];
  if (!Array.isArray(qs) || qs.length !== 3) return ['needs exactly 3 questions'];
  qs.forEach((x, i) => {
    if (!x || typeof x.q !== 'string' || !x.q.trim()) out.push(`q${i + 1}: no question`);
    if (!Array.isArray(x.choices) || x.choices.length !== 3 || new Set(x.choices).size !== 3 || x.choices.some(c => typeof c !== 'string' || !c.trim())) out.push(`q${i + 1}: needs 3 different choices`);
    if (!Number.isInteger(x.answer) || x.answer < 0 || x.answer > 2) out.push(`q${i + 1}: answer must be 0, 1 or 2`);
    if (!Number.isInteger(x.page) || x.page < 1 || x.page > pageCount) out.push(`q${i + 1}: page must be 1..${pageCount}`);
  });
  return out;
}

/** A book's id in the manifest: source prefix + the source's own id ("sw-0001"). */
export const SOURCES = Object.freeze({
  storyweaver: { prefix: 'sw', publisher: 'Pratham Books', platform: 'StoryWeaver' },
  bloom: { prefix: 'bl', publisher: '', platform: 'Bloom Library' },   // the publisher is each book's own
});
export const bookId = (source, sourceId) => `${SOURCES[source].prefix}-${sourceId}`;
