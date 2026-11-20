// Story Library importer, second source: Bloom Library (docs/story-library-bloom.md, docs/decisions.md "Story Library:
// Bloom Library books"). For every Bloom book named in seed-library/bloom.json (`candidates`), it reads the book's own
// files from Bloom's public storage, keeps it only when the book is CC BY, CC BY-SA or CC0 with nothing restricting it AND
// every picture it uses is too (server/library/bloom-lib.js), estimates its US grade (the same rule as StoryWeaver),
// joins Oomba's picks, questions and glossary, converts the pictures to small WebP files, and writes the Bloom books into
// the shared manifest (the StoryWeaver books there are kept) plus a report of every candidate and why it is in or out.
//
//   NODE_USE_ENV_PROXY=1 node scripts/import-bloom.js --list <Bloom book list.json> --cache <dir outside the repo>
//        [--no-images] (manifest and report only)  [--fresh] (convert every picture again)  [--review <dir>] (also write each candidate's English text there,
//        for a person to read)  [--only id,id] (just these candidates, nothing written but --review)
//
// The book list is what Bloom's public API returns for English books (GET https://api.bloomlibrary.org/v1/books?lang=en),
// saved as JSON: [{ id, title, langs, tags, baseUrl, harvestState, inCirculation, draft, features }]. A book's baseUrl
// (on s3.amazonaws.com) is used only here, at import time, to read its files: it can contain the uploader's email, so it
// is never written to the repository, the manifest, the report or the cache's names. Only Bloom's book id is kept.
// Requests: about 4 a second, a User-Agent naming the importer, retries with backoff. Bloom's own file server sits behind
// a bot check and is not used.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as I from '../server/library/import-lib.js';
import * as B from '../server/library/bloom-lib.js';
import { scanText, placeAnswer, IMAGE, GRADE_NAMES } from './import-stories.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PATHS = {
  curation: path.join(ROOT, 'seed-library/bloom.json'),
  manifest: path.join(ROOT, 'server/library/manifest.json'),
  images: path.join(ROOT, 'public/img/library'),
  report: path.join(ROOT, 'docs/story-library-bloom.md'),
};
const UA = 'OombaStoryLibraryImporter/1.0';
const GAP_MS = 260;   // about 4 requests a second at most

// ---------------------------------------------------------------- reading Bloom's storage (import time only)
const sleep = ms => new Promise(r => setTimeout(r, ms));
let nextAt = 0;
/** Waits for this request's turn: requests start at least GAP_MS apart, however many books are read at once. */
async function turn() { const at = Math.max(Date.now(), nextAt); nextAt = at + GAP_MS; if (at > Date.now()) await sleep(at - Date.now()); }
async function get(url, { binary = false } = {}) {
  for (let attempt = 0; ; attempt++) {
    await turn();
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (r.status === 404 || r.status === 403) return null;
      if (r.ok) return binary ? Buffer.from(await r.arrayBuffer()) : await r.text();
      if (r.status !== 429 && r.status < 500) throw Object.assign(new Error(`HTTP ${r.status}`), { fatal: true });
    } catch (e) { if (e.fatal || attempt >= 4) throw new Error(`could not read a Bloom file (${e.message})`); }
    await sleep(1000 * 2 ** attempt);
  }
}
/** The storage folder a book's baseUrl names -> { bucket, prefix }. */
function folderOf(baseUrl) {
  const u = new URL(baseUrl);
  const [, bucket, ...rest] = u.pathname.split('/');
  return { origin: u.origin, bucket, prefix: decodeURIComponent(rest.join('/').replace(/\+/g, ' ')) };
}
/** The file names directly in a book's folder (S3 lists them; nothing else is kept). */
async function listFiles(baseUrl) {
  const { origin, bucket, prefix } = folderOf(baseUrl);
  const names = [];
  let marker = '';
  for (;;) {
    const xml = await get(`${origin}/${bucket}?prefix=${encodeURIComponent(prefix)}${marker ? `&marker=${encodeURIComponent(marker)}` : ''}`);
    if (!xml) return null;
    const keys = [...xml.matchAll(/<Key>([^<]*)<\/Key>/g)].map(m => B.decodeEntities(m[1]));
    for (const k of keys) { const rel = k.slice(prefix.length); if (k.startsWith(prefix) && rel && !rel.includes('/')) names.push(rel); }
    if (!/<IsTruncated>true<\/IsTruncated>/.test(xml) || !keys.length) break;
    marker = keys[keys.length - 1];
  }
  return names;
}
const fileUrl = (baseUrl, name) => baseUrl + encodeURIComponent(name);
/** The book's HTML file among the folder's files: the one .htm at the top of the folder (Bloom names it after the folder). */
function htmlName(names, prefix) {
  const htm = names.filter(n => /\.html?$/i.test(n) && !/^index\.html?$/i.test(n));
  if (htm.length <= 1) return htm[0] || null;
  const folder = prefix.replace(/\/$/, '').split('/').pop();
  return htm.find(n => n.replace(/\.html?$/i, '') === folder) || null;
}
/** A cache folder per book id: meta.json, files.json (names only), book.htm, img/<picture>. */
async function fetchBook(entry, cache, { pictures = false, need = [] } = {}) {
  const dir = path.join(cache, entry.id);
  fs.mkdirSync(path.join(dir, 'img'), { recursive: true });
  const at = f => path.join(dir, f);
  if (!fs.existsSync(at('files.json'))) {
    const names = await listFiles(entry.baseUrl);
    fs.writeFileSync(at('files.json'), JSON.stringify(names || []));
  }
  const names = JSON.parse(fs.readFileSync(at('files.json'), 'utf8'));
  if (!fs.existsSync(at('meta.json'))) fs.writeFileSync(at('meta.json'), (await get(fileUrl(entry.baseUrl, 'meta.json'))) || '{}');
  if (!fs.existsSync(at('book.htm'))) {
    const name = htmlName(names, folderOf(entry.baseUrl).prefix);
    fs.writeFileSync(at('book.htm'), name ? (await get(fileUrl(entry.baseUrl, name))) || '' : '');
  }
  if (pictures) {
    for (const f of need) {
      const dest = at(path.join('img', safeName(f)));
      if (fs.existsSync(dest)) continue;
      const buf = names.includes(f) ? await get(fileUrl(entry.baseUrl, f), { binary: true }) : null;
      if (!buf) throw new Error(`${entry.id}: picture ${f} is not in the book's folder`);
      fs.writeFileSync(dest, buf);
    }
  }
  return { names, meta: JSON.parse(fs.readFileSync(at('meta.json'), 'utf8') || '{}'), html: fs.readFileSync(at('book.htm'), 'utf8'), dir };
}
const safeName = f => f.replace(/[^\w.-]+/g, '_');

// ---------------------------------------------------------------- checking one book (no network)
/**
 * One candidate, checked. entry: the Bloom list row; meta: its meta.json; html: its book HTML; names: the files in its
 * folder (null when unknown); curation: seed-library/bloom.json. -> { sourceId, title, status, reason, grade, ... , book }
 */
export function evaluateBloom({ entry, meta, html, names = null, curation, maxUnlabeled = B.MAX_UNLABELED, allowMostUnlabeled = false }) {
  const sourceId = entry && entry.id;
  const row = { sourceId, title: (entry && entry.title) || '', status: 'excluded', reason: '' };
  const fail = reason => { row.reason = reason; return row; };
  const notBook = B.notABook(entry);
  if (notBook) return fail(notBook);
  if (!meta || !Object.keys(meta).length) return fail('meta.json missing');
  if (!html) return fail('book HTML missing');
  const bk = B.parseBloomHtml(html);
  row.title = bk.title || row.title;
  const code = B.bloomLicense(meta.license, bk.data.licenseUrl || '');
  row.license = code;
  if (!B.isBloomAllowed(code)) return fail(`book license: ${code === 'missing' ? 'missing' : code === 'version' ? `no clear version (${meta.license})` : code === 'mismatch' ? 'meta.json and the book disagree' : code === 'unknown' ? `unreadable (${String(meta.license).slice(0, 20)})` : code.toUpperCase()}`);
  const restr = B.restrictionIn(meta.licenseNotes, meta.copyright, meta.credits, bk.data.licenseNotes, bk.data.copyright, bk.data.originalCopyright, bk.data.originalAcknowledgments, bk.data.versionAcknowledgments);
  if (restr) return fail(`the book's notes say "${restr}"`);
  if (meta.internetLimits && Object.keys(meta.internetLimits).length) return fail('Bloom records internet limits for it');
  if (bk.problems.length) return fail(bk.problems[0]);
  // Pages at the end that are not part of the story (notes for grown-ups, a coloring page), named by a person with why
  // (seed-library/bloom.json picks.<id>.dropEnd), and then wordless pages at the end (Bloom books often end on one or
  // two pictures with no words in any language) are not used.
  const pick0 = (curation.picks || {})[sourceId];
  const dropEnd = pick0 && pick0.dropEnd;
  if (dropEnd) {
    if (!Number.isInteger(dropEnd.pages) || dropEnd.pages < 1 || dropEnd.pages >= bk.pages.length || !String(dropEnd.why || '').trim()) return fail('the pages left out at the end need a count and a reason');
    bk.pages.splice(bk.pages.length - dropEnd.pages);
  }
  const dropped = (dropEnd ? dropEnd.pages : 0) + B.trimWordlessEnd(bk);
  if (!bk.pages.length) return fail('no story pages');
  const missingEn = bk.pages.find(p => !p.text && !p.wordless);
  if (missingEn) return fail(`English missing on page ${missingEn.n}`);
  const pic = B.checkBloomPictures(bk, code, meta.copyright || bk.data.copyright || '', { maxUnlabeled, allowMostUnlabeled });
  row.pictureRules = pic.rules;
  if (!pic.ok) return fail(pic.reason);
  const usedFiles = [bk.cover.file, ...bk.pages.map(p => p.picture.file)];
  if (names) { const absent = usedFiles.find(f => !names.includes(f)); if (absent) return fail(`picture ${absent} is not in the book's folder`); }
  const bad = usedFiles.find(f => !/\.(jpe?g|png|webp|gif|bmp|tiff?)$/i.test(f));
  if (bad) return fail(`picture ${bad} is not a bitmap the importer converts`);
  // A person's corrections of real text mistakes (picks.<id>.fixes), applied before the grade is estimated.
  const pickF = (curation.picks || {})[sourceId];
  const fixed = B.applyFixes(pickF && pickF.title ? pickF.title : row.title, bk.pages.map(p => B.joinSoftBreaks(I.tidyText(p.text))), pickF && pickF.fixes);
  if (fixed.problems.length) return fail(`text corrections: ${fixed.problems[0]}`);
  const texts = fixed.texts;
  const m = I.measure(texts), g = I.gradeOf(m);
  Object.assign(row, { grade: g.grade, score: g.score, words: m.words, measures: m, otherLangs: B.otherLangsOf(bk), pictureRules: pic.rules, parsed: bk });
  if (!g.grade) return fail(g.why === 'no text' ? 'no text' : `${g.why.startsWith('too long') ? 'too long' : 'too hard'} for the library (${g.why})`);
  const pick = (curation.picks || {})[sourceId];
  if (!pick) return fail((curation.skipped || {})[sourceId] ? `read and left out: ${curation.skipped[sourceId]}` : 'licensed, not read yet');
  const qProblems = I.checkQuestions(pick.questions.map(x => ({ q: x.q, choices: [x.right, ...x.wrong], answer: 0, page: x.page })), texts.length);
  if (qProblems.length) return fail(`questions: ${qProblems.join('; ')}`);
  const flagged = [row.title, ...texts].map(scanText).find(Boolean);
  if (flagged && !(curation.scanReviewed || {})[sourceId]) return fail(`text scanner flagged it (${flagged}) and nobody has reviewed it`);
  // A title Bloom stores with a layout word after it ("... Landscape") is given as the book's cover shows it (a person
  // writes it in the pick, with nothing changed but that).
  if (pick.title) row.title = pick.title;
  const fixCount = (pick.fixes || []).length;
  if (fixCount) { row.title = fixed.title; row.fixes = pick.fixes; }
  const id = `bl-${sourceId}`;
  const lic = B.BLOOM_ALLOWED[code];
  const people = B.creditPeople(meta.credits, bk.data.originalAcknowledgments, bk.data.versionAcknowledgments, bk.data.smallCoverCredits, meta.author ? `Author: ${meta.author}` : '');
  const creators = B.creatorNames([bk.cover, ...bk.pages.map(p => p.picture)].map(p => p.creator || ''));
  const holder = B.copyrightHolder(meta.copyright || bk.data.copyright || '');
  const over = pick.credits || {};   // a person's reading of credits the parser cannot split (recorded with the pick)
  const original = over.original || B.copyrightHolder(bk.data.originalCopyright || '') || B.originalFrom(meta.credits, bk.data.originalAcknowledgments, bk.data.versionAcknowledgments);
  const pageName = (_, i) => `p${String(i + 1).padStart(2, '0')}.webp`;
  row.status = 'included';
  row.book = {
    id, source: 'bloom', sourceId, lang: 'en', title: row.title,
    grade: g.grade, gradeScore: g.score, words: m.words, pageCount: texts.length,
    measures: { perPage: m.perPage, perSentence: m.perSentence, syllablesPerWord: m.syllablesPerWord, fk: m.fk, notSight: m.notSight },
    cover: { src: `/img/library/${id}/cover.webp`, file: bk.cover.file },
    pages: texts.map((text, i) => ({ text, words: I.wordCount(text), image: { src: `/img/library/${id}/${pageName(null, i)}`, file: bk.pages[i].picture.file, alt: B.scrub(bk.pages[i].alt) } })),
    credits: {
      text: over.text || people.text, illustration: over.illustration || (people.illustration.length ? people.illustration : creators),
      translation: over.translation || people.translation,
      publisher: over.publisher || holder || 'Bloom Library', platform: 'Bloom Library',
      ...(original && original !== (over.publisher || holder) ? { original } : {}),
      license: code, licenseName: lic.name, licenseUrl: lic.url, shareAlike: lic.family === 'by-sa',
      sourceUrl: B.bloomBookUrl(sourceId), pictureRules: pic.rules,
      ...(fixCount ? { corrected: fixCount } : {}),
    },
    otherLangs: row.otherLangs,
    ...(dropped ? { endPagesLeftOut: dropped } : {}),
    ...(dropEnd ? { endNote: String(dropEnd.why).trim() } : {}),
    glossary: Object.entries(pick.glossary || {}).map(([word, note]) => ({ word, note })),
    questions: pick.questions.map((x, i) => ({ q: x.q, ...placeAnswer(id, i, x.right, x.wrong), page: x.page, kind: x.kind === 'inference' ? 'inference' : 'literal' })),
    ...(flagged ? { scanNote: curation.scanReviewed[sourceId] } : {}),
  };
  return row;
}

// ---------------------------------------------------------------- pictures
function convert(src, dest, { max, q }) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const fit = `scale='if(gt(iw,ih),min(${max},iw),-2)':'if(gt(iw,ih),-2,min(${max},ih))'`;
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', src, '-vf', fit, '-frames:v', '1', '-map_metadata', '-1', '-c:v', 'libwebp', '-quality', String(q), '-compression_level', '6', dest]);
  const [w, h] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', dest]).toString().trim().split(',').map(Number);
  return { w, h, bytes: fs.statSync(dest).size };
}
const probe = dest => { const [w, h] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', dest]).toString().trim().split(',').map(Number); return { w, h, bytes: fs.statSync(dest).size }; };
/** The book's pictures as WebP. A book whose pictures are already converted (and listed in .sources, the original file
 *  names) is not downloaded again unless --fresh is given. */
async function writeImages(rows, { list, cache, keepCache, fresh }) {
  let bytes = 0;
  for (const r of rows.filter(x => x.status === 'included')) {
    const b = r.book;
    const outDir = path.join(PATHS.images, b.id);
    const want = [b.cover.file, ...b.pages.map(p => p.image.file)].join('\n');
    const stamp = path.join(cache, b.sourceId, 'converted.txt');   // what was converted, kept in the cache (outside the repo)
    const done = !fresh && fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') === want && fs.existsSync(path.join(outDir, 'cover.webp')) && b.pages.every(p => fs.existsSync(path.join(ROOT, 'public', p.image.src)));
    if (done) {
      const c = probe(path.join(outDir, 'cover.webp')); b.cover.w = c.w; b.cover.h = c.h; bytes += c.bytes;
      for (const p of b.pages) { const x = probe(path.join(ROOT, 'public', p.image.src)); p.image.w = x.w; p.image.h = x.h; bytes += x.bytes; }
      continue;
    }
    fs.rmSync(outDir, { recursive: true, force: true });
    const need = [...new Set([b.cover.file, ...b.pages.map(p => p.image.file)])];
    const { dir } = await fetchBook(list.get(b.sourceId), cache, { pictures: true, need });
    const src = f => path.join(dir, 'img', safeName(f));
    const c = convert(src(b.cover.file), path.join(outDir, 'cover.webp'), IMAGE.cover); b.cover.w = c.w; b.cover.h = c.h; bytes += c.bytes;
    for (const p of b.pages) { const x = convert(src(p.image.file), path.join(ROOT, 'public', p.image.src), IMAGE.page); p.image.w = x.w; p.image.h = x.h; bytes += x.bytes; }
    fs.writeFileSync(stamp, want);
    if (!keepCache) fs.rmSync(path.join(dir, 'img'), { recursive: true, force: true });   // disk: originals are not kept
  }
  // Bloom folders of books no longer included are removed (StoryWeaver's are the other importer's).
  const ids = new Set(rows.filter(x => x.status === 'included').map(x => x.book.id));
  if (fs.existsSync(PATHS.images)) for (const d of fs.readdirSync(PATHS.images)) if (d.startsWith('bl-') && !ids.has(d)) fs.rmSync(path.join(PATHS.images, d), { recursive: true, force: true });
  return bytes;
}
const dirBytes = d => (fs.existsSync(d) ? fs.readdirSync(d).reduce((s, f) => s + fs.statSync(path.join(d, f)).size, 0) : 0);

// ---------------------------------------------------------------- the manifest and the report
/** The reasons checkBloomPictures gives for too many pictures with no license or copyright. */
export const UNLABELED_FAIL = /pictures have no license or copyright/;
const gradeRank = g => I.GRADES.indexOf(g);
/** The shared manifest with this source's books replaced (the other sources' books are kept as they are). */
export function mergeManifest(old, bloomBooks, { generated = new Date().toISOString().slice(0, 10) } = {}) {
  const keep = ((old && old.books) || []).filter(b => b.source !== 'bloom');
  const books = [...keep, ...bloomBooks].sort((a, b) => gradeRank(a.grade) - gradeRank(b.grade) || a.title.localeCompare(b.title));
  return { ...(old || {}), version: 2, generated, gradeRule: I.GRADE_RULE, books };
}

export function reportMarkdown(rows, { totalBytes = null, pool = null, generated = new Date().toISOString().slice(0, 10) } = {}) {
  const inc = rows.filter(r => r.status === 'included'), exc = rows.filter(r => r.status === 'excluded');
  const group = r => r.reason.replace(/^read and left out: .*/, 'read and left out (content, quality or a duplicate)').replace(/^tagged .*/, 'tagged as a shell, template or problem').replace(/^page \d+ has \d+ pictures/, 'a page has several pictures').replace(/^(?:cover|page \d+) picture (?:is |has |license|says).*/, 'a picture\'s license is missing, unclear or stricter').replace(/\(.*\)/, '').replace(/"[^"]*"/, '').replace(/\d+/g, 'N').trim();
  const counts = {}; for (const r of exc) counts[group(r)] = (counts[group(r)] || 0) + 1;
  const esc = s => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ').replace(/\u2014/g, '-');
  const byLic = {}; for (const r of inc) byLic[r.book.credits.licenseName] = (byLic[r.book.credits.licenseName] || 0) + 1;
  const inherited = inc.filter(r => r.book.credits.pictureRules.inherited);
  const unlabeled = inc.filter(r => r.book.credits.pictureRules.unlabeled);
  const corrected = inc.filter(r => r.book.credits.corrected);
  const survey = exc.filter(r => r.unlabeledSurvey);
  const atLimit = n => survey.filter(r => r.unlabeledSurvey.passesAny && r.unlabeledSurvey.unlabeled <= n).length;
  const pics = r => { const p = r.book.credits.pictureRules; return `${p.own}/${p.inherited}/${p.unlabeled || 0}`; };
  return [
    '# Story Library: Bloom Library books',
    '',
    `Written by \`scripts/import-bloom.js\` (${generated}). Do not edit by hand: change \`seed-library/bloom.json\` or the importer and run it again.`,
    '',
    '## Source',
    '',
    'Picture books from [Bloom Library](https://bloomlibrary.org) (SIL Global), read at import time from the files Bloom publishes for each book (its `meta.json` and book HTML, and the pictures). Only Bloom\'s book id is kept; each book links to its page on bloomlibrary.org. Neither Bloom Library nor SIL Global nor the books\' publishers endorse Oomba Academy.',
    '',
    '## License rule (checked in code: `server/library/bloom-lib.js`)',
    '',
    '- The book must be CC BY, CC BY-SA or CC0 (version from the book\'s own license link; a ported or unclear version is left out), Bloom must be done processing it and have it in circulation, and it must not be tagged as a shell, template, draft, test, incoming or problem book or have activity, quiz or video pages.',
    '- Its license notes, copyright, credits and acknowledgments must not restrict it ("not for distribution", "all rights reserved", "permission", "do not copy" and the like).',
    '- Every picture it uses (the cover and one per page) must carry its own CC BY, CC BY-SA or CC0 license, no stricter than the book\'s (no BY-SA picture in a CC BY book). A picture with no license of its own is used when its copyright holder is the book\'s own; it then inherits the book\'s license (counted as "inherited" below). A picture with no license and no copyright at all ("unlabeled") also takes the book\'s license, but only when the book has at most ' + B.MAX_UNLABELED + ' of them, they are not most of its pictures, and nothing about the picture names a stock or clip-art source (the owner\'s rule: "if there is a book with just a couple of missing licenses, then just add it"). A picture with a stricter license of its own (NC, ND, all rights reserved, custom) or credited to a stock or clip-art source (Microsoft, Pixabay, Google and the like) leaves the whole book out, as does any other picture that fails.',
    '- Every story page must have English text (a page with a picture and no words in any language is kept as a wordless page) and exactly one picture. The reader shows the English only; the book\'s other languages are recorded for later (`otherLangs`).',
    '- Every book page and reader page credits the author, illustrator(s), translator(s), the publisher or copyright holder, "Bloom Library", the license linked to its deed, and what Oomba changed; for CC BY-SA books, that Oomba\'s adapted pages are shared under the same license. The story words are changed only to correct real mistakes (spelling, punctuation, spacing, capitalization, obvious grammar slips), each one written down in `seed-library/bloom.json` (`fixes`) and listed below; those books also say "Oomba corrected spelling and punctuation."',
    '',
    '## Choosing the books',
    '',
    'Every candidate that passed the rule was read in full by a person for ages 4 to 10, with the same rules as the StoryWeaver books, applied strictly because Bloom books are uploaded by anyone: no violence beyond mild peril, nothing scary, no romance, no religious instruction, Bible stories, prayers or religion-centered plots, no labels on bodies, age or disability, no stereotypes, no unsafe behavior shown as fine, no medical advice beyond basic hygiene, nothing political, and no mistakes in the source text. Copies and translations of the same story were compared and the best English version kept; books already in the library from StoryWeaver were left out. The site\'s text scanners run on every page. Grades use the same rule as the StoryWeaver books (`docs/story-library-sources.md`).',
    '',
    '## Totals',
    '',
    ...(pool ? [`- English books on Bloom: ${pool.english}; with an allowed license in meta.json: ${pool.allowed}`] : []),
    `- Candidates checked: ${rows.length}`,
    `- Included: **${inc.length}** (${I.GRADES.map(g => `${GRADE_NAMES[g]}: ${inc.filter(r => r.grade === g).length}`).join(', ')})`,
    `- By license: ${Object.entries(byLic).sort().map(([k, n]) => `${k}: ${n}`).join(', ') || 'none'}`,
    `- Pictures: ${inc.reduce((s, r) => s + r.book.credits.pictureRules.own, 0)} with their own license, ${inc.reduce((s, r) => s + r.book.credits.pictureRules.inherited, 0)} inherited from the book (same copyright holder; ${inherited.length} books), ${inc.reduce((s, r) => s + (r.book.credits.pictureRules.unlabeled || 0), 0)} with no license or copyright that take the book's license (at most ${B.MAX_UNLABELED} a book; ${unlabeled.length} books)`,
    `- Text corrected by Oomba: ${corrected.length} books, ${corrected.reduce((s, r) => s + r.book.credits.corrected, 0)} corrections (listed below)`,
    `- Left out: ${exc.length}`,
    ...Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => `  - ${k}: ${n}`),
    ...(totalBytes !== null ? [`- Bloom pictures on the site: ${(totalBytes / 1048576).toFixed(1)} MB (WebP, pages at most ${IMAGE.page.max} px, covers ${IMAGE.cover.max} px)`] : []),
    '',
    '## Included',
    '',
    'Pictures: own license / inherited from the book\'s copyright holder / no license or copyright (takes the book\'s license). Fixes: text corrections.',
    '',
    '| Id | Title | Grade | Score | Words | Pages | Text | Illustration | Translation | Publisher | License | Pictures | Fixes | Other languages |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...inc.sort((a, b) => gradeRank(a.grade) - gradeRank(b.grade) || a.title.localeCompare(b.title)).map(r => { const c = r.book.credits; return `| ${r.book.id} | ${esc(r.title)} | ${GRADE_NAMES[r.grade]} | ${r.score} | ${r.words} | ${r.book.pageCount} | ${esc(c.text.join(', ') || '–')} | ${esc(c.illustration.join(', ') || '–')} | ${esc(c.translation.join(', ') || '–')} | ${esc(c.publisher)} | ${c.licenseName} | ${pics(r)} | ${c.corrected || '–'} | ${r.book.otherLangs.join(', ') || '–'} |`; }),
    '',
    ...(inc.some(r => r.book.endNote) ? ['### Pages left out at the end', '', 'Pages after the story that are not part of it, named by a person; the story pages are all kept.', '', ...inc.filter(r => r.book.endNote).map(r => `- ${r.book.id} ${esc(r.title)}: ${r.book.endPagesLeftOut} page(s): ${esc(r.book.endNote)}`), ''] : []),
    ...(corrected.length ? ['### Text corrections', '', 'Each correction as `seed-library/bloom.json` records it (page: from → to; page 0 is the title). The importer stops if a correction no longer matches the book exactly once.', '', ...corrected.map(r => `- ${r.book.id} ${esc(r.title)}: ${(r.fixes || []).map(f => `p${f.page} "${esc(f.from)}" → "${esc(f.to)}"`).join('; ')}`), ''] : []),
    ...(survey.length ? ['### Pictures with no license or copyright: other limits', '', `Books left out only because more than ${B.MAX_UNLABELED} of their pictures carry no license and no copyright, that would pass every other automatic check (not yet read for content) at a higher limit: at most 3: ${atLimit(3)}; at most 5: ${atLimit(5)}; any number (still not most of the pictures): ${atLimit(Infinity)}; any number, even when most or all pictures are unlabeled: ${survey.filter(r => r.unlabeledSurvey.passesMost).length}.`, ''] : []),
    ...(inc.some(r => r.book.scanNote) ? ['### Scanner flags reviewed by a person', '', ...inc.filter(r => r.book.scanNote).map(r => `- ${r.book.id} ${esc(r.title)}: ${r.book.scanNote}`), ''] : []),
    '## Left out',
    '',
    '| Id | Title | Reason |',
    '| --- | --- | --- |',
    ...exc.sort((a, b) => a.reason.localeCompare(b.reason) || a.title.localeCompare(b.title)).map(r => `| bl-${r.sourceId} | ${esc(r.title)} | ${esc(r.reason)} |`),
    '',
  ].join('\n');
}

/** A candidate's text as a person reads it before choosing (--review). */
function reviewText(r, meta) {
  const bk = r.parsed;
  return [
    `# ${r.title}  [${r.sourceId}]  ${r.status === 'included' ? 'INCLUDED' : r.reason}`,
    `grade ${r.grade} score ${r.score} words ${r.words} pages ${bk.pages.length} license ${r.license} langs ${r.otherLangs.join(',') || '-'} pics own ${r.pictureRules.own} inh ${r.pictureRules.inherited}`,
    `copyright: ${B.scrub(meta.copyright || bk.data.copyright || '')} | credits: ${B.scrub(meta.credits || '').replace(/\n/g, ' / ')} | ack: ${B.scrub(bk.data.originalAcknowledgments || '').replace(/\n/g, ' / ')} | cover: ${B.scrub(bk.data.smallCoverCredits || '').replace(/\n/g, ' / ')} | orig: ${B.scrub(bk.data.originalCopyright || '')}`,
    ...bk.pages.map((p, i) => { const tx = B.joinSoftBreaks(I.tidyText(p.text)); return `--- ${i + 1}${scanText(tx) ? ` [SCAN ${scanText(tx)}]` : ''}\n${tx}`; }),
    '',
  ].join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const listPath = opt('--list'), cache = opt('--cache');
  if (!listPath || !cache) { console.error('Usage: node scripts/import-bloom.js --list <list.json> --cache <dir> [--no-images] [--review <dir>] [--only id,id]'); process.exit(1); }
  if (path.resolve(cache).startsWith(ROOT)) { console.error('The cache must be outside the repository.'); process.exit(1); }
  const listRows = JSON.parse(fs.readFileSync(listPath, 'utf8'));
  const list = new Map(listRows.map(b => [b.id, b]));
  const curation = JSON.parse(fs.readFileSync(PATHS.curation, 'utf8'));
  const only = opt('--only') ? opt('--only').split(',') : null;
  const ids = only || [...new Set([...(curation.candidates || []), ...Object.keys(curation.picks || {}), ...Object.keys(curation.skipped || {})])];
  const review = opt('--review');
  if (review) fs.mkdirSync(review, { recursive: true });
  const rows = new Array(ids.length);
  let n = 0, next = 0;
  // A few books are read at once (S3 answers slowly); turn() keeps the requests to about 4 a second in all.
  const worker = async () => { for (let k = next++; k < ids.length; k = next++) rows[k] = await one(ids[k]); };
  const one = async id => {
    const entry = list.get(id);
    let r;
    try {
      if (!entry) r = { sourceId: id, title: '', status: 'excluded', reason: 'not in the Bloom list' };
      else {
        const pre = B.notABook(entry);
        const f = pre ? { meta: {}, html: '', names: null } : await fetchBook(entry, cache);
        r = evaluateBloom({ entry, meta: f.meta, html: f.html, names: f.names, curation });
        // Left out only for pictures with no license or copyright: would another limit let it through the automatic
        // checks? (The report counts these for the owner; nobody has read them for content.)
        if (UNLABELED_FAIL.test(r.reason)) {
          const passes = x => x.status === 'included' || /^licensed, not read yet|^read and left out/.test(x.reason);
          const any = evaluateBloom({ entry, meta: f.meta, html: f.html, names: f.names, curation, maxUnlabeled: Infinity });
          const most = evaluateBloom({ entry, meta: f.meta, html: f.html, names: f.names, curation, maxUnlabeled: Infinity, allowMostUnlabeled: true });
          r.unlabeledSurvey = { unlabeled: r.pictureRules.unlabeled, passesAny: passes(any), passesMost: passes(most) };
        }
        if (review && r.parsed && r.grade) fs.writeFileSync(path.join(review, `${id}.txt`), reviewText(r, f.meta));
      }
    } catch (e) { r = { sourceId: id, title: entry ? entry.title : '', status: 'excluded', reason: `could not read it (${e.message})` }; }
    delete r.parsed;
    if (++n % 25 === 0) console.log(`${n} / ${ids.length}`);
    return r;
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  for (const id of Object.keys(curation.picks || {})) { const r = rows.find(x => x.sourceId === id); if (r && r.status !== 'included') console.warn(`picked ${id} is left out: ${r.reason}`); }
  if (only) { console.log(rows.map(r => `${r.sourceId} ${r.status} ${r.grade || ''} ${r.reason}`).join('\n')); process.exit(0); }
  const bytes = args.includes('--no-images') ? null : await writeImages(rows, { list, cache, keepCache: args.includes('--keep-cache'), fresh: args.includes('--fresh') });
  const old = fs.existsSync(PATHS.manifest) ? JSON.parse(fs.readFileSync(PATHS.manifest, 'utf8')) : null;
  const included = rows.filter(r => r.status === 'included').map(r => r.book);
  const m = mergeManifest(old, included);
  fs.writeFileSync(PATHS.manifest, JSON.stringify(m) + '\n');
  const total = bytes !== null ? bytes : included.reduce((s, b) => s + dirBytes(path.join(PATHS.images, b.id)), 0);
  const english = listRows.length;
  fs.writeFileSync(PATHS.report, reportMarkdown(rows, { totalBytes: total, pool: curation.pool ? { english, allowed: curation.pool.allowed } : null }));
  console.log(`${included.length} Bloom books included of ${rows.length} candidates; Bloom pictures ${(total / 1048576).toFixed(1)} MB; manifest ${m.books.length} books`);
}
