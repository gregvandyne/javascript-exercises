// Story Library importer: the pure parts (no database, no files written), shared by scripts/import-stories.js and the
// unit tests (docs/story-library-sources.md, docs/decisions.md "Story Library").
//
// A source is anything that can list books as { sourceId, title, pages: [text], textLicense, credits, images: [{ file,
// license, illustrator, description }] }. Today there is one (StoryWeaver / Pratham Books, from the global-asp
// pb-source and pb-imagebank repositories); a second one (Bloom Library) only needs its own parser that returns the
// same shape, and the manifest's `source` field tells them apart. Nothing here fetches anything.

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

/** Whitespace and conversion leftovers only: the story's words are never changed. */
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

/**
 * The leveling rule (docs/story-library-sources.md "Reading levels"), from words per text page and words in all:
 *   Level 1 (Just starting)       at most 12 words a page on average, at most 20 on any page, and 150 words in all
 *   Level 2 (Learning to read)    at most 30 words a page on average, and 450 words in all
 *   Level 3 (Reading on my own)   anything longer, up to 1,200 words (longer books are left out of the launch set)
 * -> { level: 1 | 2 | 3 | 0 (too long), words, pages, perPage, maxPage }
 */
export const LEVEL_RULE = Object.freeze({ l1: { avg: 12, max: 20, total: 150 }, l2: { avg: 30, total: 450 }, l3: { total: 1200 } });
export function levelOf(pages) {
  const counts = pages.map(wordCount).filter(n => n > 0);
  const words = counts.reduce((a, n) => a + n, 0);
  const perPage = counts.length ? words / counts.length : 0;
  const maxPage = counts.length ? Math.max(...counts) : 0;
  const R = LEVEL_RULE;
  const level = !words ? 0
    : perPage <= R.l1.avg && maxPage <= R.l1.max && words <= R.l1.total ? 1
    : perPage <= R.l2.avg && words <= R.l2.total ? 2
    : words <= R.l3.total ? 3 : 0;
  return { level, words, pages: counts.length, perPage: Math.round(perPage * 10) / 10, maxPage };
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
  // bloom: { prefix: 'bl', publisher: '', platform: 'Bloom Library' }  (not imported yet: needs an API key)
});
export const bookId = (source, sourceId) => `${SOURCES[source].prefix}-${sourceId}`;
