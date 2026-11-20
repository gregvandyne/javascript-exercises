// Story Library importer (docs/story-library-sources.md). Reads open-licensed picture books from local copies of their
// sources, keeps only the ones whose text AND every picture are CC BY 4.0 or Public Domain, estimates each one's US grade level, joins Oomba's
// hand-picked books and questions (seed-library/storyweaver.json), converts the pictures to small WebP files and
// writes the manifest the site reads plus a report of every book included or left out (and why).
//
//   node scripts/import-stories.js --pb-source <path to global-asp/pb-source> --pb-imagebank <path to global-asp/pb-imagebank>
//        [--fetch] (git sparse-checkout add the image folders a picked book needs, in the imagebank clone)
//        [--no-images] (manifest and report only)
//
// Nothing is downloaded from anywhere else. The site's text scanners run on every picked story; a story they flag is
// left out unless seed-library/storyweaver.json "scanReviewed" says a person read it and why it is fine.
// Needs ffmpeg (with libwebp) and ffprobe for the pictures. The image bank's `large/` pictures (about 960 px) are used;
// its `medium/` copies (480 px) are too small for a tablet or a big screen.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as I from '../server/library/import-lib.js';
import { profanityMatch, personalInfo } from '../server/services/textfilter.js';
import { prefilter, mockClassify } from '../server/builder/screen.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PATHS = {
  curation: path.join(ROOT, 'seed-library/storyweaver.json'),
  manifest: path.join(ROOT, 'server/library/manifest.json'),
  images: path.join(ROOT, 'public/img/library'),
  report: path.join(ROOT, 'docs/story-library-sources.md'),
};
/** Pictures: at most this wide/high (CSS pixels on a big screen are about 640 wide in the reader), WebP quality. */
// Pages went from WebP quality 50 to 40 when the whole library passed its 80 MB budget (docs/decisions.md "Story
// Library: more Bloom books"); covers stay at 55.
export const IMAGE = { page: { max: 720, q: 40 }, cover: { max: 440, q: 55 } };
const SIZE = 'large';

/** The site's text scanners on one page of text -> the first rule it trips, or null. */
export function scanText(text) {
  return profanityMatch(text) ? 'profanity' : prefilter(text) || mockClassify(text) || (personalInfo(text) ? 'personal' : null);
}

/** A stable choice order for a question (the right answer is not always first). */
export function placeAnswer(bookId, i, right, wrong) {
  const k = crypto.createHash('sha1').update(`${bookId}:${i}`).digest()[0] % 3;
  const choices = [...wrong]; choices.splice(k, 0, right);
  return { choices, answer: k };
}

/**
 * Every StoryWeaver book in a pb-source language folder, checked. -> [{ sourceId, file, title, status: 'included' |
 * 'excluded', reason, grade, score, words, measures, ... , book (included only: the manifest entry without image sizes) }]
 */
export function evaluate({ storiesDir, metadataDir, curation, hasImage = null }) {
  const out = [];
  const files = fs.readdirSync(storiesDir).filter(f => /^\d{4}_.*\.md$/.test(f)).sort();
  for (const file of files) {
    const sourceId = file.slice(0, 4);
    const s = I.parseStoryMarkdown(fs.readFileSync(path.join(storiesDir, file), 'utf8'));
    // Oomba's corrections of the book's own typos (a picked book's `fixes`), before anything is measured or scanned; a
    // correction that does not match its page exactly once throws, so the import stops.
    const fixes = (curation.picks[sourceId] || {}).fixes || [];
    if (fixes.length && !s.problems.length) Object.assign(s, I.applyFixes(s.title, s.pages, fixes, `sw-${sourceId}`));
    const metaPath = path.join(metadataDir, `${sourceId}.md`);
    const meta = fs.existsSync(metaPath) ? I.parseImageMetadata(fs.readFileSync(metaPath, 'utf8')) : { images: [], sourceUrl: '', problems: ['no metadata file'] };
    const m = I.measure(s.pages), g = I.gradeOf(m);
    const row = { sourceId, file, title: s.title, status: 'excluded', reason: '', grade: g.grade, score: g.score, words: m.words, measures: m };
    const fail = reason => { row.reason = reason; out.push(row); };
    if (s.problems.length) { fail(`source text: ${s.problems.join(', ')}`); continue; }
    if (!meta.images.length) { fail('image metadata missing'); continue; }
    const lic = I.checkLicenses(s.meta.license, meta.images);
    if (!lic.ok) { fail(lic.reason); continue; }
    let map = I.mapImages(s.pages.length, meta.images);
    const handMap = (curation.pictureMap || {})[sourceId];
    if (!map.ok && handMap) map = I.checkPictureMap(handMap, s.pages.length, meta.images);
    if (!map.ok) { const seen = (curation.pictureReview || {})[sourceId]; fail(`pictures do not line up with pages (${map.reason})${seen ? `; reviewed: ${seen}` : ''}`); continue; }
    const absent = hasImage ? [map.cover, ...map.pages].filter(f => !hasImage(sourceId, f)) : [];
    if (absent.length) { fail(`picture ${absent[0]} is in the metadata but not in the image bank`); continue; }
    if (!row.grade) { fail(g.why === 'no text' ? 'no text' : `${g.why.startsWith('too long') ? 'too long' : 'too hard'} for the library (${g.why})`); continue; }
    const pick = curation.picks[sourceId];
    if (!pick) { fail(curation.skipped[sourceId] ? `read and left out: ${curation.skipped[sourceId]}` : 'licensed, not read yet'); continue; }
    const qProblems = I.checkQuestions(pick.questions.map(x => ({ q: x.q, choices: [x.right, ...x.wrong], answer: 0, page: x.page })), s.pages.length);
    if (qProblems.length) { fail(`questions: ${qProblems.join('; ')}`); continue; }
    const flagged = [s.title, ...s.pages].map(scanText).find(Boolean);
    if (flagged && !curation.scanReviewed[sourceId]) { fail(`text scanner flagged it (${flagged}) and nobody has reviewed it`); continue; }
    const id = I.bookId('storyweaver', sourceId);
    const used = [map.cover, ...map.pages];
    const usedImages = meta.images.filter(im => used.includes(im.file));
    const illustrators = [...new Set(usedImages.flatMap(im => I.people(im.illustrator)))];
    const license = I.bookLicense(lic.textLicense, [...lic.imageLicenses]);
    const slug = file.slice(5, -3);
    row.status = 'included';
    if (fixes.length) row.fixes = fixes;
    row.book = {
      id, source: 'storyweaver', sourceId, slug, lang: 'en', title: s.title,
      grade: row.grade, gradeScore: g.score, words: row.words, pageCount: s.pages.length,
      measures: { perPage: m.perPage, perSentence: m.perSentence, syllablesPerWord: m.syllablesPerWord, fk: m.fk, notSight: m.notSight },
      cover: { src: `/img/library/${id}/cover.webp`, file: map.cover },
      pages: s.pages.map((text, i) => ({ text, words: I.wordCount(text), image: { src: `/img/library/${id}/${map.pages[i].replace(/\.\w+$/, '.webp')}`, file: map.pages[i], alt: (meta.images.find(im => im.file === map.pages[i]) || {}).description || '' } })),
      credits: {
        text: I.people(s.meta.text), illustration: illustrators.length ? illustrators : I.people(s.meta.illustration),
        translation: I.people(s.meta.translation), publisher: I.SOURCES.storyweaver.publisher, platform: I.SOURCES.storyweaver.platform,
        license, licenseName: I.ALLOWED[license].name, licenseUrl: I.ALLOWED[license].url, sourceUrl: meta.sourceUrl,
        textLicense: lic.textLicense, imageLicenses: [...lic.imageLicenses].sort(),
        ...(fixes.length ? { corrections: fixes.length } : {}),
      },
      glossary: Object.entries(pick.glossary || {}).map(([word, note]) => ({ word, note })),
      questions: pick.questions.map((x, i) => ({ q: x.q, ...placeAnswer(id, i, x.right, x.wrong), page: x.page, kind: x.kind === 'inference' ? 'inference' : 'literal' })),
      ...(flagged ? { scanNote: curation.scanReviewed[sourceId] } : {}),
      ...(map.why ? { pictureNote: map.why } : {}),
    };
    out.push(row);
  }
  return out;
}

/** ffmpeg: one picture -> lossy WebP no wider or taller than max (never enlarged), no metadata. -> { w, h, bytes } */
function convert(src, dest, { max, q }) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const fit = `scale='if(gt(iw,ih),min(${max},iw),-2)':'if(gt(iw,ih),-2,min(${max},ih))'`;
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', src, '-vf', fit, '-map_metadata', '-1', '-c:v', 'libwebp', '-quality', String(q), '-compression_level', '6', dest]);
  const [w, h] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', dest]).toString().trim().split(',').map(Number);
  return { w, h, bytes: fs.statSync(dest).size };
}

function writeImages(rows, { imagebank, fetch }) {
  let bytes = 0;
  const books = rows.filter(r => r.status === 'included').map(r => r.book);
  if (fetch) {
    const need = books.filter(b => [b.cover.file, ...b.pages.map(p => p.image.file)].some(f => !fs.existsSync(path.join(imagebank, SIZE, b.sourceId, f)))).map(b => `/${SIZE}/${b.sourceId}/`);
    if (need.length) execFileSync('git', ['-C', imagebank, 'sparse-checkout', 'add', ...need], { stdio: 'inherit' });
  }
  for (const b of books) {
    const dir = path.join(imagebank, SIZE, b.sourceId);
    const one = (file, name, opt) => {
      const src = path.join(dir, file);
      if (!fs.existsSync(src)) throw new Error(`${b.id}: missing picture ${src} (run with --fetch)`);
      const r = convert(src, path.join(PATHS.images, b.id, name), opt); bytes += r.bytes; return r;
    };
    const c = one(b.cover.file, 'cover.webp', IMAGE.cover); b.cover.w = c.w; b.cover.h = c.h;
    for (const p of b.pages) { const r = one(p.image.file, path.basename(p.image.src), IMAGE.page); p.image.w = r.w; p.image.h = r.h; }
  }
  // Folders of books no longer included are removed, so the set never keeps stale pictures (StoryWeaver's only: the
  // Bloom books' folders belong to scripts/import-bloom.js).
  if (fs.existsSync(PATHS.images)) for (const d of fs.readdirSync(PATHS.images)) if (d.startsWith('sw-') && !books.some(b => b.id === d)) fs.rmSync(path.join(PATHS.images, d), { recursive: true, force: true });
  return bytes;
}

export const GRADE_NAMES = { k: 'Pre-K/K', 1: 'Grade 1', 2: 'Grade 2', 3: 'Grade 3', '4-5': 'Grades 4-5' };
const gradeRank = g => I.GRADES.indexOf(g);
/** A correction as the report shows it: on one line, long passages shortened in the middle. */
const fixShown = s => { const t = s.replace(/\n/g, '⏎'); return t.length > 90 ? `${t.slice(0, 40)} … ${t.slice(-40)}` : t; };
export function reportMarkdown(rows, { totalBytes = null, generated = new Date().toISOString().slice(0, 10) } = {}) {
  const inc = rows.filter(r => r.status === 'included'), exc = rows.filter(r => r.status === 'excluded');
  const group = r => r.reason.replace(/^read and left out: .*/, 'read and left out (content)').replace(/; reviewed: .*/, '').replace(/\(.*\)/, '').replace(/\d+/g, 'N').replace(/image N\.jpg/, 'an image').trim();
  const counts = {}; for (const r of exc) counts[group(r)] = (counts[group(r)] || 0) + 1;
  const G = I.GRADE_RULE;
  const esc = s => String(s).replace(/\|/g, '\\|');
  return [
    '# Story Library: sources and the books',
    '',
    `Written by \`scripts/import-stories.js\` (${generated}). Do not edit by hand: change \`seed-library/storyweaver.json\` or the importer and run it again.`,
    '',
    '## Source',
    '',
    'StoryWeaver picture books by Pratham Books, from the community mirrors `global-asp/pb-source` (story text, `en/NNNN_slug.md`) and `global-asp/pb-imagebank` (`large/NNNN/NN.jpg` pictures and `metadata/NNNN.md`, one license per picture). Pratham Books does not endorse Oomba Academy.',
    '',
    '## License rule (checked in code: `server/library/import-lib.js`)',
    '',
    '- The story text must be CC BY 4.0 or Public Domain, and so must every picture the book uses, each read from its own row of the metadata table.',
    '- Anything else is left out: NC, ND, SA, a version other than 4.0, a missing license, or a row that cannot be read (for example a table row whose columns ran together).',
    '- Pictures are used when there is exactly one more picture than text pages (picture 01 is the cover, picture N+1 goes with page N). Otherwise a person may place them by hand from the metadata descriptions (`pictureMap` in `seed-library/storyweaver.json`), only when every page has one clear match; anything else is left out rather than guessed, with the reason below.',
    '- Every book page and every reader page credits the title, author, illustrator(s), translator(s), "Pratham Books, StoryWeaver", the license with a link to its deed, and says Oomba resized the pictures and shows one page at a time. The story words are not changed (whitespace and conversion leftovers only), except for the typos a person listed for a book (`fixes` in `seed-library/storyweaver.json`: spelling, punctuation, spacing, capitalization and small grammar slips, never the style or the meaning); those books also say "Oomba corrected spelling and punctuation.", and every correction is listed below.',
    '',
    '## Reading levels: US grades (Oomba\'s estimate)',
    '',
    'Each book gets the US school grade it suits best, estimated by Oomba from public, documented measures of its text. These are not Lexile, Guided Reading or Fountas & Pinnell levels. The rule is in `server/library/import-lib.js` (`measure`, `gradeOf`); docs/decisions.md "Story Library: US grade levels" explains it with worked examples.',
    '',
    '- Measures: words in all, words a page, words a sentence, syllables a word, the Flesch-Kincaid grade, and the share of words outside the Dolch and Fry sight-word lists (`server/library/sight-words.json`).',
    `- Each measure becomes a grade number between anchor points; the weighted mean is the score (Flesch-Kincaid and the sight-word share count for less under ${G.shortText[1]} words, as they are unreliable on very short texts).`,
    `- Bands: ${G.bands.map(([lim, g], i) => `${GRADE_NAMES[g]} below ${lim}${i ? '' : ''}`).join(', ')}. Over ${G.maxWords.toLocaleString('en-US')} words, or a score of ${G.bands[G.bands.length - 1][0]} or more, is left out.`,
    '',
    '| Measure | Pre-K/K | Grade 1 | Grade 2 | Grade 3 | Grades 4-5 | Weight |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...Object.entries(G.anchors).map(([k, a]) => `| ${({ words: 'Words in all', perPage: 'Words a page', perSentence: 'Words a sentence', notSight: '% not sight words' })[k]} | ${a.map(x => x[1]).join(' | ')} | ${Array.isArray(G.weights[k]) ? G.weights[k].join(' to ') : G.weights[k]} |`),
    `| Flesch-Kincaid grade | (its own value) | | | | | ${G.weights.fk.join(' to ')} |`,
    '',
    '## Choosing the books',
    '',
    'Every candidate below was read in full by a person and checked for ages 4 to 10: no violence beyond mild peril, nothing scary or gory, no romance, no religious instruction, no stereotypes, nothing likely to upset parents, and no text so full of mistakes that fixing it would mean rewriting it (smaller typos are corrected, listed below). The site\'s text scanners (`textfilter.profanityMatch`, `personalInfo`, the Builder\'s `prefilter` and `mockClassify`) run on every page; a flagged book is left out unless a person reviewed the flag (listed below). Each book has 3 questions written by Oomba (two about what the text says, one that needs a small inference), each pointing at the page that answers it, and an optional glossary for words US children may not know.',
    '',
    '## Totals',
    '',
    `- Books in the source: ${rows.length}`,
    `- Included: **${inc.length}** (${I.GRADES.map(g => `${GRADE_NAMES[g]}: ${inc.filter(r => r.grade === g).length}`).join(', ')})`,
    `- Left out: ${exc.length}`,
    ...Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => `  - ${k}: ${n}`),
    ...(totalBytes !== null ? [`- Pictures on the site: ${(totalBytes / 1048576).toFixed(1)} MB (WebP, pages at most ${IMAGE.page.max} px, covers ${IMAGE.cover.max} px)`] : []),
    '',
    '## Included',
    '',
    '| Id | Title | Grade | Score | Words | Pages | Text | Illustration | Translation | License |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...inc.sort((a, b) => gradeRank(a.grade) - gradeRank(b.grade) || a.title.localeCompare(b.title)).map(r => `| ${r.book.id} | ${esc(r.title)} | ${GRADE_NAMES[r.grade]} | ${r.score} | ${r.words} | ${r.book.pageCount} | ${esc(r.book.credits.text.join(', '))} | ${esc(r.book.credits.illustration.join(', '))} | ${esc(r.book.credits.translation.join(', ') || '–')} | ${r.book.credits.licenseName} |`),
    '',
    ...(inc.some(r => r.book.pictureNote) ? ['### Pictures placed by a person', '', 'These books have more pictures than pages. A person matched each page to a picture from the metadata descriptions, and only where the match is unambiguous; pictures left over are not used.', '', ...inc.filter(r => r.book.pictureNote).map(r => `- ${r.book.id} ${esc(r.title)}: ${esc(r.book.pictureNote)}`), ''] : []),
    ...(inc.some(r => r.fixes) ? ['### Text corrected by Oomba', '', `${inc.filter(r => r.fixes).length} books, ${inc.reduce((n, r) => n + (r.fixes ? r.fixes.length : 0), 0)} corrections. Page 0 is the title; a line break is shown as ⏎.`, '', ...inc.filter(r => r.fixes).sort((a, b) => a.sourceId.localeCompare(b.sourceId)).map(r => `- ${r.book.id} ${esc(r.title)}: ${r.fixes.map(f => `p${f.page} "${esc(fixShown(f.from))}" → "${esc(fixShown(f.to))}"`).join('; ')}`), ''] : []),
    ...(inc.some(r => r.book.scanNote) ? ['### Scanner flags reviewed by a person', '', ...inc.filter(r => r.book.scanNote).map(r => `- ${r.book.id} ${esc(r.title)}: ${r.book.scanNote}`), ''] : []),
    '## Left out',
    '',
    '| Id | Title | Reason |',
    '| --- | --- | --- |',
    ...exc.map(r => `| sw-${r.sourceId} | ${esc(r.title || r.file)} | ${esc(r.reason)} |`),
    '',
  ].join('\n');
}

/** The manifest: these StoryWeaver books, plus the other sources' books already in `old` (kept as they are). */
export function manifestOf(rows, { generated = new Date().toISOString().slice(0, 10), old = null } = {}) {
  const others = ((old && old.books) || []).filter(b => b.source !== 'storyweaver');
  const books = [...rows.filter(r => r.status === 'included').map(r => r.book), ...others].sort((a, b) => gradeRank(a.grade) - gradeRank(b.grade) || a.title.localeCompare(b.title));
  return { version: 2, generated, gradeRule: I.GRADE_RULE, books };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const src = opt('--pb-source'), bank = opt('--pb-imagebank');
  if (!src || !bank) { console.error('Usage: node scripts/import-stories.js --pb-source <dir> --pb-imagebank <dir> [--fetch] [--no-images]'); process.exit(1); }
  const curation = JSON.parse(fs.readFileSync(PATHS.curation, 'utf8'));
  // The pictures the image bank really has (its git tree, whatever the sparse checkout holds), or the files on disk.
  let have;
  try { have = new Set(execFileSync('git', ['-C', bank, 'ls-tree', '-r', '--name-only', 'HEAD', `${SIZE}/`], { maxBuffer: 64 << 20 }).toString().split('\n')); } catch { have = null; }
  const hasImage = (id, f) => (have ? have.has(`${SIZE}/${id}/${f}`) : fs.existsSync(path.join(bank, SIZE, id, f)));
  const rows = evaluate({ storiesDir: path.join(src, 'en'), metadataDir: path.join(bank, 'metadata'), curation, hasImage });
  for (const id of Object.keys(curation.picks)) { const r = rows.find(x => x.sourceId === id); if (!r || r.status !== 'included') console.warn(`picked ${id} is left out: ${r ? r.reason : 'not in the source'}`); }
  const bytes = args.includes('--no-images') ? null : writeImages(rows, { imagebank: bank, fetch: args.includes('--fetch') });
  const m = manifestOf(rows, { old: fs.existsSync(PATHS.manifest) ? JSON.parse(fs.readFileSync(PATHS.manifest, 'utf8')) : null });
  fs.mkdirSync(path.dirname(PATHS.manifest), { recursive: true });
  fs.writeFileSync(PATHS.manifest, JSON.stringify(m) + '\n');
  fs.writeFileSync(PATHS.report, reportMarkdown(rows, { totalBytes: bytes }));
  console.log(`${m.books.filter(b => b.source === 'storyweaver').length} StoryWeaver books included of ${rows.length}${bytes !== null ? `; pictures ${(bytes / 1048576).toFixed(1)} MB` : ''}`);
}
