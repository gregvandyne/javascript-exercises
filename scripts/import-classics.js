// Story Library importer, third source: the Classics shelf (docs/story-library-classics.md, docs/decisions.md "Story
// Library: a Classics shelf"). Public-domain illustrated stories read from saved copies of their digitized HTML editions:
// each book in seed-library/classics.json is checked against the public-domain rule (published before 1931 and every
// maker dead before 1956), cut into pages that fit half a laptop screen with each picture on the page it illustrates,
// graded with the shared US grade rule, given Oomba's questions and glossary, and its pictures are converted to small
// WebP files. The Classics books in the shared manifest are replaced (the StoryWeaver and Bloom books are kept), and a
// report of every book in or out is written.
//
//   node scripts/import-classics.js --src <dir>   (a folder per source, named by its ebook number, holding the HTML
//        edition and its pictures, e.g. <dir>/32488/32488-h/32488-h.htm)
//        [--no-images] (manifest and report only)  [--review <dir>] (write each book's pages there, for a person)
//        [--draft] (books without their questions yet, with --review; never for the shipped manifest)
//
// Nothing is fetched: the copies are saved by hand outside the repository. Only the public-domain words and pictures are
// used; the digitizer's headers, footers, license and name are never copied (a test checks the manifest and the site).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as I from '../server/library/import-lib.js';
import * as C from '../server/library/classics-lib.js';
import { scanText, placeAnswer, IMAGE, GRADE_NAMES } from './import-stories.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PATHS = {
  curation: path.join(ROOT, 'seed-library/classics.json'),
  manifest: path.join(ROOT, 'server/library/manifest.json'),
  images: path.join(ROOT, 'public/img/library'),
  report: path.join(ROOT, 'docs/story-library-classics.md'),
};
/** Classics are longer than picture books (a Just So story is 1,100 to 3,500 words): the grade rule's length cap is
 *  raised for this source only. The bands are unchanged. */
export const CLASSICS_MAX_WORDS = 4000;

const gradeRank = g => I.GRADES.indexOf(g);

/** The blocks of one book: one section of an edition, or several (Aesop's fables, each with its title as a heading). */
export function bookBlocks(all, pick) {
  if (pick.fables) {
    return pick.fables.flatMap(title => [{ t: 'p', text: title }, ...C.sectionOf(all, title)]);
  }
  return pick.section ? C.sectionOf(all, pick.section, pick.sectionEnd || null) : all;
}

/**
 * One curated book -> { key, status, reason, ... book (included only: the manifest entry without picture sizes) }.
 * html: the edition's HTML (a string); source: the curation's source record.
 */
export function evaluateClassic(key, pick, source, html, { draft = false } = {}) {
  const row = { key, sourceId: source.ebook, title: pick.title, status: 'excluded', reason: '' };
  const fail = reason => { row.reason = reason; return row; };
  const pd = C.checkPublicDomain({ published: source.published, makers: source.makers });
  if (!pd.ok) return fail(`not public domain everywhere: ${pd.reason}`);
  let story, pages;
  try {
    const blocks = bookBlocks(C.htmlBlocks(html), pick);
    const auto = pick.fables ? autoPictures(blocks, pick) : null;
    story = C.storyOf(blocks, {
      start: pick.start, end: pick.end, skip: pick.skip, dropCaps: pick.dropCaps, smallCaps: pick.smallCaps,
      headings: pick.fables || [], breakAt: pick.fables || [], fixes: pick.fixes,
      pictures: auto || (pick.pictures || []).map(p => (typeof p === 'string' ? { file: p } : p)),
      pictureSide: pick.pictureSide || (pick.fables ? 'auto' : 'after'),
    });
    pages = C.paginate(story, { pictureStartsPage: !!pick.pictureBook });
  } catch (e) { return fail(`could not be read: ${e.message}`); }
  const problems = C.checkPages(pages, story);
  if (problems.length) return fail(`pages: ${problems[0]}`);
  const texts = pages.map(p => p.text);
  const m = I.measure(texts), g = I.gradeOf(m, { maxWords: CLASSICS_MAX_WORDS });
  Object.assign(row, { grade: g.grade, score: g.score, words: m.words, measures: m, pages: pages.length, pictures: story.pictures.length });
  if (!g.grade) return fail(`${g.why}`);
  if (C.SOURCE_NAME_RE.test([pick.title, ...texts].join('\n'))) return fail('the text names the digitizer');
  // Questions point at a phrase in the book; the page it is on is worked out here (pages change when the cut changes).
  const qs = [];
  for (const [i, x] of (pick.questions || []).entries()) {
    const at = texts.map((t, k) => (t.includes(x.at) ? k + 1 : 0)).filter(Boolean);
    if (at.length !== 1) return fail(`question ${i + 1}: "${x.at}" is on ${at.length} pages, not exactly one`);
    qs.push({ q: x.q, right: x.right, wrong: x.wrong, page: at[0], kind: x.kind });
  }
  const qProblems = I.checkQuestions(qs.map(x => ({ q: x.q, choices: [x.right, ...x.wrong], answer: 0, page: x.page })), pages.length);
  if (!draft && qProblems.length) return fail(`questions: ${qProblems.join('; ')}`);
  if (!draft && qs.filter(x => x.kind === 'inference').length !== 1) return fail('questions: needs exactly one inference question');
  const flagged = [pick.title, ...texts].map(scanText).find(Boolean);
  if (flagged && !pick.scanReviewed) return fail(`text scanner flagged it (${flagged}) and nobody has reviewed it`);
  const id = `cl-${key}`;
  const picFile = new Map(story.pictures.map(p => [p.file, p]));
  const specOf = new Map((pick.pictures || []).map(p => (typeof p === 'string' ? [p, { file: p }] : [p.file, p])));
  // A picture's description for screen readers: the pick's, else the edition's caption or alt text when it says what is
  // in the picture; a one- or two-word label ("Jeremy", "Duck") says nothing the page's words do not, so it is left empty.
  const altOf = f => { const a = String(picFile.get(f).alt || '').trim(); return a.split(/\s+/).length >= 3 ? a : ''; };
  const htmlDir = path.posix.dirname(source.html);
  row.status = 'included';
  row.fixes = pick.fixes || [];
  row.book = {
    id, source: 'classics', sourceId: `${source.ebook}:${key}`, lang: 'en', title: pick.title,
    grade: g.grade, gradeScore: g.score, words: m.words, pageCount: pages.length,
    measures: { perPage: m.perPage, perSentence: m.perSentence, syllablesPerWord: m.syllablesPerWord, fk: m.fk, notSight: m.notSight },
    cover: { src: `/img/library/${id}/cover.webp`, file: pick.cover, from: srcPath(htmlDir, pick.coverSrc || pick.cover, html) },
    pages: pages.map((p, i) => ({
      text: p.text, words: I.wordCount(p.text),
      image: p.picture ? { src: `/img/library/${id}/p${String(i + 1).padStart(2, '0')}.webp`, file: p.picture, alt: altOf(p.picture), from: srcPath(htmlDir, (specOf.get(p.picture) || {}).src || p.picture, html) } : null,
    })),
    credits: {
      text: source.makers.filter(x => x.role === 'author').map(x => x.name),
      illustration: source.makers.filter(x => x.role === 'illustrator').map(x => x.name),
      translation: source.makers.filter(x => x.role === 'translator' && !x.anonymous).map(x => x.name),
      publisher: '', platform: 'Classics', published: source.published, edition: source.edition,
      license: 'public-domain', licenseName: 'Public domain', licenseUrl: '',
      ...(row.fixes.length ? { corrections: row.fixes.length } : {}),
    },
    glossary: Object.entries(pick.glossary || {}).map(([word, note]) => ({ word, note })),
    questions: qs.map((x, i) => ({ q: x.q, ...placeAnswer(id, i, x.right, x.wrong), page: x.page, kind: x.kind === 'inference' ? 'inference' : 'literal' })),
    ...(flagged ? { scanNote: pick.scanReviewed } : {}),
  };
  return row;
}

/** Aesop: each fable's main picture (the largest; the small head- and tail-pieces are left out) unless the pick names
 *  them. -> [{ file }] */
function autoPictures(blocks, pick) {
  if (pick.pictures) return pick.pictures.map(p => (typeof p === 'string' ? { file: p } : p));
  const out = [];
  let cur = null;
  for (const b of blocks) {
    if (b.t === 'p' && pick.fables.includes(b.text)) { cur = { best: null }; out.push(cur); continue; }
    if (b.t === 'img' && cur) { const area = (b.w || 0) * (b.h || 0); if (area >= 60000 && (!cur.best || area > cur.best.area)) cur.best = { file: b.src.split('/').pop(), area }; }
  }
  const skip = new Set(pick.skipPictures || []);
  return out.filter(x => x.best && !skip.has(x.best.file)).map(x => ({ file: x.best.file }));
}
/** A picture's path in the edition's folder (as the HTML links it). */
function srcPath(htmlDir, file, html) {
  const m = new RegExp(`(?:src|href)=["']([^"']*/)?${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i').exec(html);
  return path.posix.join(htmlDir, (m && m[1]) || 'images/', file);
}

// ---------------------------------------------------------------- pictures
function convert(src, dest, { max, q }) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const fit = `scale='if(gt(iw,ih),min(${max},iw),-2)':'if(gt(iw,ih),-2,min(${max},ih))'`;
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', src, '-vf', fit, '-frames:v', '1', '-map_metadata', '-1', '-c:v', 'libwebp', '-quality', String(q), '-compression_level', '6', dest]);
  const [w, h] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', dest]).toString().trim().split(',').map(Number);
  return { w, h, bytes: fs.statSync(dest).size };
}
function writeImages(rows, srcDir) {
  let bytes = 0;
  for (const r of rows.filter(x => x.status === 'included')) {
    const b = r.book, outDir = path.join(PATHS.images, b.id);
    fs.rmSync(outDir, { recursive: true, force: true });
    const from = f => { const p = path.join(srcDir, String(b.sourceId).split(':')[0], f); if (!fs.existsSync(p)) throw new Error(`${b.id}: missing picture ${p}`); return p; };
    const c = convert(from(b.cover.from), path.join(outDir, 'cover.webp'), IMAGE.cover); Object.assign(b.cover, { w: c.w, h: c.h }); bytes += c.bytes;
    for (const p of b.pages) if (p.image) { const x = convert(from(p.image.from), path.join(ROOT, 'public', p.image.src), IMAGE.page); Object.assign(p.image, { w: x.w, h: x.h }); bytes += x.bytes; }
  }
  const ids = new Set(rows.filter(x => x.status === 'included').map(x => x.book.id));
  if (fs.existsSync(PATHS.images)) for (const d of fs.readdirSync(PATHS.images)) if (d.startsWith('cl-') && !ids.has(d)) fs.rmSync(path.join(PATHS.images, d), { recursive: true, force: true });
  return bytes;
}
/** The import-time paths are not kept in the manifest. */
const forManifest = b => ({ ...b, cover: { src: b.cover.src, file: b.cover.file, w: b.cover.w, h: b.cover.h }, pages: b.pages.map(p => ({ ...p, image: p.image ? { src: p.image.src, file: p.image.file, alt: p.image.alt, w: p.image.w, h: p.image.h } : null })) });

/** The shared manifest with the Classics replaced (the other sources' books are kept as they are). */
export function mergeManifest(old, books, { generated = new Date().toISOString().slice(0, 10) } = {}) {
  const keep = ((old && old.books) || []).filter(b => b.source !== 'classics');
  return { ...(old || {}), version: 2, generated, gradeRule: I.GRADE_RULE, books: [...keep, ...books].sort((a, b) => gradeRank(a.grade) - gradeRank(b.grade) || a.title.localeCompare(b.title)) };
}

// ---------------------------------------------------------------- the report
export function reportMarkdown(rows, curation, { totalBytes = null, generated = new Date().toISOString().slice(0, 10) } = {}) {
  const inc = rows.filter(r => r.status === 'included'), exc = rows.filter(r => r.status === 'excluded');
  const esc = s => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const src = curation.sources;
  const makers = s => s.makers.map(m => `${m.name} (${m.role}, ${m.anonymous ? 'not named' : `died ${m.died}`})`).join('; ');
  return [
    '# Story Library: the Classics shelf',
    '',
    `Written by \`scripts/import-classics.js\` (${generated}). Do not edit by hand: change \`seed-library/classics.json\` or the importer and run it again.`,
    '',
    '## Sources',
    '',
    'Illustrated editions that are in the public domain, read from Project Gutenberg\'s HTML transcriptions (saved from the GITenberg mirror on GitHub). Only the public-domain words and pictures are used: Project Gutenberg\'s headers, footers, license text and name are not copied, and the site does not name Project Gutenberg (no endorsement is implied). The ebook numbers are kept here and in `seed-library/classics.json` only.',
    '',
    `**The rule** (\`checkPublicDomain\` in \`server/library/classics-lib.js\`): published before ${C.PD_RULE.publishedBefore} (public domain in the US), and the author, illustrator and translator all died before ${C.PD_RULE.diedBefore}, so the book is out of copyright in "life plus 70 years" countries too. A translator not named in the book counts as anonymous: the book is old enough (published before ${C.PD_RULE.publishedBefore}) for an anonymous work to be free everywhere.`,
    '',
    '| Ebook | Edition | Published | Makers | Used |',
    '| --- | --- | --- | --- | --- |',
    ...Object.entries(src).map(([k, s]) => `| ${s.ebook} | ${esc(s.title)}, ${esc(s.edition)} | ${s.published} | ${esc(makers(s))} | ${C.checkPublicDomain(s).ok ? 'yes' : `no: ${esc(C.checkPublicDomain(s).reason)}`} |`),
    '',
    '## Pages',
    '',
    `Each story is cut into pages that fit half of a 1280 x 720 screen in the reader's Classics type (\`paginate\`, \`PAGE_FIT\`: at most ${C.PAGE_FIT.lines} lines of about ${C.PAGE_FIT.perLine} characters and ${C.PAGE_FIT.maxWords} words). A page ends only where a sentence ends (never inside one, nor between the lines of a poem or list that is one sentence, nor after "Mr."), preferably where a paragraph ends, and never right after a fable's title. Each picture goes on the page with the sentence it illustrates: for Kipling the sentence just before it (or one a person names from its caption), for Beatrix Potter the words after it (a run of pictures shares them out), for Aesop each fable's main picture with that fable. Pictures printed as decoration (head- and tail-pieces, big first letters) are not used; captions printed as paragraphs are left out (\`skip\`). The words are the author's own: only clear typos are corrected (listed below), the big first letter printed as a picture is put back, and a first word printed in small capitals is set in normal type.`,
    '',
    '## Totals',
    '',
    `- Books: **${inc.length}** (${I.GRADES.map(g => `${GRADE_NAMES[g]}: ${inc.filter(r => r.grade === g).length}`).join(', ')}); left out: ${exc.length + Object.keys(curation.skipped || {}).length}`,
    ...(totalBytes !== null ? [`- Pictures: ${(totalBytes / 1048576).toFixed(1)} MB (WebP; pages at most ${IMAGE.page.max} px, quality ${IMAGE.page.q}; covers ${IMAGE.cover.max} px, quality ${IMAGE.cover.q})`] : []),
    `- The grade rule is the library's (\`gradeOf\`), with the length cap raised to ${CLASSICS_MAX_WORDS.toLocaleString('en-US')} words for this source.`,
    '',
    '## Included',
    '',
    '| Id | Title | Grade | Score | Words | Pages | With a picture | Ebook | Author | Pictures |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...inc.sort((a, b) => gradeRank(a.grade) - gradeRank(b.grade) || a.title.localeCompare(b.title)).map(r => `| ${r.book.id} | ${esc(r.title)} | ${GRADE_NAMES[r.grade]} | ${r.score} | ${r.words} | ${r.pages} | ${r.book.pages.filter(p => p.image).length} | ${r.sourceId} | ${esc(r.book.credits.text.join(', '))} | ${esc(r.book.credits.illustration.join(', '))} (${r.book.credits.published}) |`),
    '',
    ...(inc.some(r => r.fixes.length) ? ['### Text corrected by Oomba', '', ...inc.filter(r => r.fixes.length).map(r => `- ${r.book.id} ${esc(r.title)}: ${r.fixes.map(f => `"${esc(f.from)}" → "${esc(f.to)}"${f.why ? ` (${esc(f.why)})` : ''}`).join('; ')}`), ''] : []),
    ...(inc.some(r => r.book.scanNote) ? ['### Scanner flags reviewed by a person', '', ...inc.filter(r => r.book.scanNote).map(r => `- ${r.book.id} ${esc(r.title)}: ${esc(r.book.scanNote)}`), ''] : []),
    '## Left out',
    '',
    '| Ebook | Story | Reason |',
    '| --- | --- | --- |',
    ...exc.map(r => `| ${r.sourceId} | ${esc(r.title)} | ${esc(r.reason)} |`),
    ...Object.entries(curation.skipped || {}).map(([k, why]) => { const [eb, ...t] = k.split(':'); return `| ${eb} | ${esc(t.join(':'))} | read and left out: ${esc(why)} |`; }),
    '',
  ].join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const srcDir = opt('--src');
  if (!srcDir) { console.error('Usage: node scripts/import-classics.js --src <dir> [--no-images] [--review <dir>]'); process.exit(1); }
  const curation = JSON.parse(fs.readFileSync(PATHS.curation, 'utf8'));
  const htmlOf = new Map();
  const rows = Object.entries(curation.books).map(([key, pick]) => {
    const source = curation.sources[pick.source];
    if (!source) return { key, title: pick.title, status: 'excluded', reason: `unknown source ${pick.source}` };
    const file = path.join(srcDir, source.ebook, source.html);
    if (!htmlOf.has(file)) htmlOf.set(file, fs.readFileSync(file, 'utf8'));
    return evaluateClassic(key, pick, source, htmlOf.get(file), { draft: args.includes('--draft') });
  });
  for (const r of rows) if (r.status !== 'included') console.warn(`${r.key} left out: ${r.reason}`);
  const review = opt('--review');
  if (review) {
    fs.mkdirSync(review, { recursive: true });
    for (const r of rows.filter(x => x.book)) fs.writeFileSync(path.join(review, `${r.key}.txt`), [`# ${r.title} [${r.book.id}] grade ${r.grade} score ${r.score} words ${r.words}`, ...r.book.pages.map((p, i) => `--- page ${i + 1}${p.image ? ` [${p.image.file}]` : ''} (${p.words} words, ${C.linesOf(p.text)} lines)\n${p.text}`)].join('\n') + '\n');
  }
  if (args.includes('--draft')) { console.log(`draft: ${rows.filter(r => r.book).length} books written to the review folder; nothing else written`); process.exit(0); }
  const bytes = args.includes('--no-images') ? null : writeImages(rows, srcDir);
  const old = fs.existsSync(PATHS.manifest) ? JSON.parse(fs.readFileSync(PATHS.manifest, 'utf8')) : null;
  const books = rows.filter(r => r.status === 'included').map(r => forManifest(r.book));
  if (bytes === null) for (const b of books) { const o = ((old && old.books) || []).find(x => x.id === b.id); if (o) { b.cover = { ...b.cover, w: o.cover.w, h: o.cover.h }; } }
  const m = mergeManifest(old, books);
  fs.writeFileSync(PATHS.manifest, JSON.stringify(m) + '\n');
  fs.writeFileSync(PATHS.report, reportMarkdown(rows, curation, { totalBytes: bytes }));
  console.log(`${books.length} Classics books of ${rows.length}${bytes !== null ? `; pictures ${(bytes / 1048576).toFixed(1)} MB` : ''}; manifest ${m.books.length} books`);
}
