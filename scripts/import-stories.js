// Story Library importer (docs/story-library-sources.md). Reads open-licensed picture books from local copies of their
// sources, keeps only the ones whose text AND every picture are CC BY 4.0 or Public Domain, levels them, joins Oomba's
// hand-picked launch set and questions (seed-library/storyweaver.json), converts the pictures to small WebP files and
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
export const IMAGE = { page: { max: 720, q: 50 }, cover: { max: 440, q: 55 } };
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
 * 'excluded', reason, level, words, ... , book (included only: the manifest entry without image sizes) }]
 */
export function evaluate({ storiesDir, metadataDir, curation, hasImage = null }) {
  const out = [];
  const files = fs.readdirSync(storiesDir).filter(f => /^\d{4}_.*\.md$/.test(f)).sort();
  for (const file of files) {
    const sourceId = file.slice(0, 4);
    const s = I.parseStoryMarkdown(fs.readFileSync(path.join(storiesDir, file), 'utf8'));
    const metaPath = path.join(metadataDir, `${sourceId}.md`);
    const meta = fs.existsSync(metaPath) ? I.parseImageMetadata(fs.readFileSync(metaPath, 'utf8')) : { images: [], sourceUrl: '', problems: ['no metadata file'] };
    const row = { sourceId, file, title: s.title, status: 'excluded', reason: '', ...I.levelOf(s.pages) };
    const fail = reason => { row.reason = reason; out.push(row); };
    if (s.problems.length) { fail(`source text: ${s.problems.join(', ')}`); continue; }
    if (!meta.images.length) { fail('image metadata missing'); continue; }
    const lic = I.checkLicenses(s.meta.license, meta.images);
    if (!lic.ok) { fail(lic.reason); continue; }
    const map = I.mapImages(s.pages.length, meta.images);
    if (!map.ok) { fail(`pictures do not line up with pages (${map.reason})`); continue; }
    const absent = hasImage ? [map.cover, ...map.pages].filter(f => !hasImage(sourceId, f)) : [];
    if (absent.length) { fail(`picture ${absent[0]} is in the metadata but not in the image bank`); continue; }
    if (!row.level) { fail(row.words ? `too long for the launch set (${row.words} words)` : 'no text'); continue; }
    const pick = curation.picks[sourceId];
    if (!pick) { fail(curation.skipped[sourceId] ? `read and left out: ${curation.skipped[sourceId]}` : 'licensed, not picked for the launch set (not read yet)'); continue; }
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
    row.book = {
      id, source: 'storyweaver', sourceId, slug, lang: 'en', title: s.title,
      level: row.level, words: row.words, pageCount: s.pages.length,
      cover: { src: `/img/library/${id}/cover.webp`, file: map.cover },
      pages: s.pages.map((text, i) => ({ text, words: I.wordCount(text), image: { src: `/img/library/${id}/${map.pages[i].replace(/\.\w+$/, '.webp')}`, file: map.pages[i], alt: (meta.images.find(im => im.file === map.pages[i]) || {}).description || '' } })),
      credits: {
        text: I.people(s.meta.text), illustration: illustrators.length ? illustrators : I.people(s.meta.illustration),
        translation: I.people(s.meta.translation), publisher: I.SOURCES.storyweaver.publisher, platform: I.SOURCES.storyweaver.platform,
        license, licenseName: I.ALLOWED[license].name, licenseUrl: I.ALLOWED[license].url, sourceUrl: meta.sourceUrl,
        textLicense: lic.textLicense, imageLicenses: [...lic.imageLicenses].sort(),
      },
      glossary: Object.entries(pick.glossary || {}).map(([word, note]) => ({ word, note })),
      questions: pick.questions.map((x, i) => ({ q: x.q, ...placeAnswer(id, i, x.right, x.wrong), page: x.page, kind: x.kind === 'inference' ? 'inference' : 'literal' })),
      ...(flagged ? { scanNote: curation.scanReviewed[sourceId] } : {}),
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
  // Folders of books no longer included are removed, so the set never keeps stale pictures.
  if (fs.existsSync(PATHS.images)) for (const d of fs.readdirSync(PATHS.images)) if (!books.some(b => b.id === d)) fs.rmSync(path.join(PATHS.images, d), { recursive: true, force: true });
  return bytes;
}

const LEVEL_NAMES = { 1: 'Level 1 (Just starting)', 2: 'Level 2 (Learning to read)', 3: 'Level 3 (Reading on my own)' };
export function reportMarkdown(rows, { totalBytes = null, generated = new Date().toISOString().slice(0, 10) } = {}) {
  const inc = rows.filter(r => r.status === 'included'), exc = rows.filter(r => r.status === 'excluded');
  const group = r => r.reason.replace(/^read and left out: .*/, 'read and left out (content)').replace(/\(.*\)/, '').replace(/\d+/g, 'N').replace(/image N\.jpg/, 'an image').trim();
  const counts = {}; for (const r of exc) counts[group(r)] = (counts[group(r)] || 0) + 1;
  const R = I.LEVEL_RULE;
  const esc = s => String(s).replace(/\|/g, '\\|');
  return [
    '# Story Library: sources and the launch set',
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
    '- Pictures are used only when there is exactly one more picture than text pages (picture 01 is the cover, picture N+1 goes with page N). Anything else is left out rather than guessed.',
    '- Every book page and every reader page credits the title, author, illustrator(s), translator(s), "Pratham Books, StoryWeaver", the license with a link to its deed, and says Oomba resized the pictures and shows one page at a time. The story words are not changed (whitespace and conversion leftovers only).',
    '',
    '## Reading levels',
    '',
    'From the words on each page that has text, and the words in the whole book:',
    '',
    `- **${LEVEL_NAMES[1]}**: at most ${R.l1.avg} words a page on average, no page over ${R.l1.max}, at most ${R.l1.total} words in all.`,
    `- **${LEVEL_NAMES[2]}**: at most ${R.l2.avg} words a page on average and ${R.l2.total} words in all.`,
    `- **${LEVEL_NAMES[3]}**: longer, up to ${R.l3.total} words. Longer books are left out of the launch set.`,
    '',
    '## Choosing the launch set',
    '',
    'Every candidate below was read in full by a person and checked for ages 4 to 10: no violence beyond mild peril, nothing scary or gory, no romance, no religious instruction, no stereotypes, nothing likely to upset parents, and no mistakes in the source text (we may not correct a story\'s words). The site\'s text scanners (`textfilter.profanityMatch`, `personalInfo`, the Builder\'s `prefilter` and `mockClassify`) run on every page; a flagged book is left out unless a person reviewed the flag (listed below). Each book has 3 questions written by Oomba (two about what the text says, one that needs a small inference), each pointing at the page that answers it, and an optional glossary for words US children may not know.',
    '',
    '## Totals',
    '',
    `- Books in the source: ${rows.length}`,
    `- Included: **${inc.length}** (${[1, 2, 3].map(l => `level ${l}: ${inc.filter(r => r.level === l).length}`).join(', ')})`,
    `- Left out: ${exc.length}`,
    ...Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => `  - ${k}: ${n}`),
    ...(totalBytes !== null ? [`- Pictures on the site: ${(totalBytes / 1048576).toFixed(1)} MB (WebP, pages at most ${IMAGE.page.max} px, covers ${IMAGE.cover.max} px)`] : []),
    '',
    '## Included',
    '',
    '| Id | Title | Level | Words | Pages | Text | Illustration | Translation | License |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...inc.sort((a, b) => a.level - b.level || a.title.localeCompare(b.title)).map(r => `| ${r.book.id} | ${esc(r.title)} | ${r.level} | ${r.words} | ${r.book.pageCount} | ${esc(r.book.credits.text.join(', '))} | ${esc(r.book.credits.illustration.join(', '))} | ${esc(r.book.credits.translation.join(', ') || '–')} | ${r.book.credits.licenseName} |`),
    '',
    ...(inc.some(r => r.book.scanNote) ? ['### Scanner flags reviewed by a person', '', ...inc.filter(r => r.book.scanNote).map(r => `- ${r.book.id} ${esc(r.title)}: ${r.book.scanNote}`), ''] : []),
    '## Left out',
    '',
    '| Id | Title | Reason |',
    '| --- | --- | --- |',
    ...exc.map(r => `| sw-${r.sourceId} | ${esc(r.title || r.file)} | ${esc(r.reason)} |`),
    '',
  ].join('\n');
}

export function manifestOf(rows, { generated = new Date().toISOString().slice(0, 10) } = {}) {
  const books = rows.filter(r => r.status === 'included').map(r => r.book).sort((a, b) => a.level - b.level || a.title.localeCompare(b.title));
  return { version: 1, generated, levelRule: I.LEVEL_RULE, books };
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
  const m = manifestOf(rows);
  fs.mkdirSync(path.dirname(PATHS.manifest), { recursive: true });
  fs.writeFileSync(PATHS.manifest, JSON.stringify(m) + '\n');
  fs.writeFileSync(PATHS.report, reportMarkdown(rows, { totalBytes: bytes }));
  console.log(`${m.books.length} books included of ${rows.length}${bytes !== null ? `; pictures ${(bytes / 1048576).toFixed(1)} MB` : ''}`);
}
