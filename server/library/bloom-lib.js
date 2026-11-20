// Story Library, second source: Bloom Library (bloomlibrary.org, SIL Global). The pure parts of scripts/import-bloom.js:
// reading a Bloom book's HTML and meta.json, the license rule (the book AND every picture it uses), the credits, and
// the checks that keep out shells, templates, restricted or unclear books. Nothing here fetches anything; nothing here
// ever sees or keeps where a book is stored (the storage path can hold the uploader's email address).
//
// docs/decisions.md "Story Library: Bloom Library books"; docs/story-library-bloom.md (the importer's report).

// ---------------------------------------------------------------- a small HTML reader
// Bloom writes well-formed XHTML-like HTML. This is enough of an HTML parser for it: elements, attributes, text,
// void elements, comments, <script>/<style> skipped. Never used on anything a visitor sends.
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', hellip: '\u2026', mdash: '\u2014', ndash: '\u2013', rsquo: '\u2019', lsquo: '\u2018', rdquo: '\u201d', ldquo: '\u201c', copy: '\u00a9', zwj: '\u200d', zwnj: '\u200c', shy: '' };
export function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return String.fromCodePoint(n); } catch { return m; } }
    return Object.prototype.hasOwnProperty.call(ENT, e.toLowerCase()) ? ENT[e.toLowerCase()] : m;
  });
}
/** html -> a tree of { tag, attrs, children: [node | string], parent }. */
export function parseHtml(html) {
  const root = { tag: '#root', attrs: {}, children: [], parent: null };
  let cur = root;
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\?[\s\S]*?\?>|<\/\s*([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>|([^<]+|<)/g;
  const attrRe = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[5] !== undefined) { cur.children.push(decodeEntities(m[5])); continue; }
    if (m[1]) {
      const tag = m[1].toLowerCase();
      let n = cur; while (n && n.tag !== tag) n = n.parent;
      if (n && n.parent) cur = n.parent;
      continue;
    }
    if (!m[2]) continue;   // comment, doctype, processing instruction
    const tag = m[2].toLowerCase(), attrs = {};
    let a; attrRe.lastIndex = 0;
    while ((a = attrRe.exec(m[3] || ''))) attrs[a[1].toLowerCase()] = decodeEntities(a[2] ?? a[3] ?? a[4] ?? '');
    const node = { tag, attrs, children: [], parent: cur };
    cur.children.push(node);
    if (tag === 'script' || tag === 'style') {   // raw text: skip to the closing tag
      const end = html.toLowerCase().indexOf(`</${tag}`, re.lastIndex);
      re.lastIndex = end < 0 ? html.length : html.indexOf('>', end) + 1 || html.length;
      continue;
    }
    if (!m[4] && !VOID.has(tag)) cur = node;
  }
  return root;
}
const isEl = n => n && typeof n === 'object';
export const classes = n => String((n && n.attrs && n.attrs.class) || '').split(/\s+/).filter(Boolean);
export const hasClass = (n, c) => classes(n).includes(c);
/** Every element under n (depth first) that passes test. */
export function findAll(n, test, out = []) {
  for (const c of n.children || []) if (isEl(c)) { if (test(c)) out.push(c); findAll(c, test, out); }
  return out;
}
const closest = (n, test) => { for (let p = n.parent; p; p = p.parent) if (test(p)) return p; return null; };
/** The text of an element as a reader sees it: <p>, <div> and <br> become line breaks. */
export function textOf(n) {
  let s = '';
  const walk = x => {
    for (const c of x.children || []) {
      if (typeof c === 'string') { s += c.replace(/\s+/g, ' '); continue; }
      if (c.tag === 'br') { s += '\n'; continue; }
      if (c.tag === 'label' && hasClass(c, 'bubble')) continue;   // Bloom's hint bubbles ("Type the title here")
      const block = /^(p|div|li|h[1-6])$/.test(c.tag);
      if (block) s += '\n';
      walk(c);
      if (block) s += '\n';
    }
  };
  walk(n);
  return s.replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n').trim();
}

// ---------------------------------------------------------------- licenses
/** The licenses a Bloom book or picture may carry to be used. Keys are what bloomLicense() returns. */
export const BLOOM_ALLOWED = Object.freeze({
  'cc-by-4.0': { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/', family: 'by' },
  'cc-by-3.0': { name: 'CC BY 3.0', url: 'https://creativecommons.org/licenses/by/3.0/', family: 'by' },
  'cc-by-2.5': { name: 'CC BY 2.5', url: 'https://creativecommons.org/licenses/by/2.5/', family: 'by' },
  'cc-by-2.0': { name: 'CC BY 2.0', url: 'https://creativecommons.org/licenses/by/2.0/', family: 'by' },
  'cc-by-sa-4.0': { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/', family: 'by-sa' },
  'cc-by-sa-3.0': { name: 'CC BY-SA 3.0', url: 'https://creativecommons.org/licenses/by-sa/3.0/', family: 'by-sa' },
  'cc-by-sa-2.5': { name: 'CC BY-SA 2.5', url: 'https://creativecommons.org/licenses/by-sa/2.5/', family: 'by-sa' },
  'cc-by-sa-2.0': { name: 'CC BY-SA 2.0', url: 'https://creativecommons.org/licenses/by-sa/2.0/', family: 'by-sa' },
  cc0: { name: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/', family: 'cc0' },
  'public-domain': { name: 'Public Domain', url: '', family: 'cc0' },
});
/** How free a license family is: a picture may be as free as its book or freer, never stricter (so the book's license
 *  shown in the credits is true of every part). */
const FREEDOM = { cc0: 2, by: 1, 'by-sa': 0 };

/**
 * A book's license from Bloom: meta.json's `license` ("cc-by", "cc-by-sa", "cc0", "cc-by-nc", "custom", "ask", ...) and
 * the book's licenseUrl (the version: "http://creativecommons.org/licenses/by/4.0/"). Both must agree.
 * -> a BLOOM_ALLOWED key, or a rejection: 'missing' | 'nc' | 'nd' | 'custom' | 'version' | 'mismatch' | 'unknown'.
 */
export function bloomLicense(token, url = '') {
  const t = String(token || '').trim().toLowerCase();
  if (!t) return 'missing';
  if (/nc/.test(t)) return 'nc';
  if (/nd/.test(t)) return 'nd';
  if (t === 'custom' || t === 'ask' || t === 'contact') return 'custom';
  const u = String(url || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/?$/, '/');
  if (t === 'cc0' || t === 'cc-0' || t === 'public domain' || t === 'publicdomain') {
    if (!url || /^creativecommons\.org\/publicdomain\/zero\/1\.0\/$/.test(u)) return 'cc0';
    return 'mismatch';
  }
  const fam = t === 'cc-by' ? 'by' : t === 'cc-by-sa' ? 'by-sa' : null;
  if (!fam) return 'unknown';
  if (!url) return 'version';
  const m = /^creativecommons\.org\/licenses\/(by(?:-[a-z]+)*)\/(\d\.\d)\/(?:legalcode\/?)?$/.exec(u);
  if (!m) return /\/(by(?:-[a-z]+)*)\/\d\.\d\/[a-z]{2}/.test(u) ? 'version' : 'unknown';   // a ported (country) version: not taken
  if (m[1] !== fam) return /nc/.test(m[1]) ? 'nc' : /nd/.test(m[1]) ? 'nd' : 'mismatch';
  const key = `cc-${fam}-${m[2]}`;
  return Object.prototype.hasOwnProperty.call(BLOOM_ALLOWED, key) ? key : 'version';
}
export const isBloomAllowed = code => Object.prototype.hasOwnProperty.call(BLOOM_ALLOWED, code);

/** A picture's own license (Bloom's data-license: "cc-by", "cc-by-sa", "cc0", "cc-by-nc-sa", "" ...) -> family
 *  'by' | 'by-sa' | 'cc0' | null (none given) | a rejection 'nc' | 'nd' | 'custom' | 'unknown'. */
export function imageLicenseFamily(raw) {
  const t = String(raw || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/^creative-commons-/, 'cc-');
  if (!t) return null;
  if (/(^|-)nc(-|$)/.test(t)) return 'nc';
  if (/(^|-)nd(-|$)/.test(t)) return 'nd';
  if (/^cc-?0$|^public-?domain$/.test(t)) return 'cc0';
  if (/^cc-by(-\d\.\d)?$/.test(t)) return 'by';
  if (/^cc-by-sa(-\d\.\d)?$/.test(t)) return 'by-sa';
  if (/custom|ask|contact|all-rights|copyright/.test(t)) return 'custom';
  return 'unknown';
}

/** Words that say a book is not free to share, whatever its license token says. Checked in its license notes,
 *  copyright, credits and the book's own credits pages. */
export const RESTRICTION_RE = /not\s+for\s+(?:re-?)?(?:distribution|sale|resale|commercial)|all\s+rights\s+reserved|\bpermission\b|do\s+not\s+(?:copy|distribute|share|reproduce|sell|upload|modify|translate|adapt|print)|may\s+not\s+be\s+(?:copied|distributed|reproduced|sold|modified|used)|no\s+part\s+of\s+this|non-?commercial|noncommercial|\bby-nc\b|\bnc-(?:sa|nd)\b|no\s+derivatives|restricted|confidential|draft\s+only|for\s+(?:internal|review|testing)\s+(?:use\s+)?only|\btest\s+book\b/i;
/** Picture sources whose terms are not an open license whatever a book says (stock and clip-art libraries): a picture
 *  credited to one of them is treated as unclear and keeps the book out. */
export const NOT_OPEN_SOURCE_RE = /microsoft|clip\s*-?art|getty|shutterstock|istock|dreamstime|123rf|adobe\s*stock|freepik|pixabay|unsplash|pexels|pinterest|google|disney|canva|openai|midjourney|dall-?e/i;
export function restrictionIn(...texts) {
  for (const t of texts) { const m = RESTRICTION_RE.exec(String(t || '')); if (m) return m[0]; }
  return null;
}

/** Tags and features that mark a book that is not a finished reading book (or that Bloom flagged): shells, templates,
 *  drafts, tests, incoming or problem books, and interactive or video pages the reader cannot show. */
export function notABook(entry) {
  if (!entry) return 'not in the Bloom list';
  if (entry.draft) return 'a draft';
  if (entry.inCirculation === false) return 'not in circulation';
  if (entry.harvestState && entry.harvestState !== 'Done') return `not harvested (${entry.harvestState})`;
  const tag = (entry.tags || []).find(t => /shell|template|\btests?\b|draft|^system:(?:incoming|problem)/i.test(t));
  if (tag) return `tagged ${tag.replace(/^list:|^bookshelf:/, '')}`;
  const feat = (entry.features || []).find(f => /^(?:activity|quiz|widget|video|signLanguage|simple-dom-choice|drag-game|game)/i.test(f));
  if (feat) return `has ${feat.split(':')[0]} pages`;
  return null;
}

// ---------------------------------------------------------------- credits
/** Contact details never kept: email addresses, web links to people, phone numbers. */
export function scrub(s) {
  return String(s || '').replace(/\r\n?/g, '\n')
    .replace(/[\w.+-]+\s*(?:@|\(at\)|\[at\])\s*[\w-]+(?:\s*(?:\.|\(dot\)|\[dot\])\s*[\w-]+)+/gi, '')
    .replace(/(?:\+|\b00)?\d[\d ()./-]{7,}\d/g, '')
    .replace(/\(\s*[,;]?\s*\)|\[\s*\]/g, '')
    .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
}
const ROLE = [
  ['text', /^(?:authors?|written|writers?|text|story|words|original\s+(?:story|text)|retold|adapted|story\s+adapted)$/i],
  ['illustration', /^(?:illustrators?|illustrations?|illustrated|pictures|images?|art|artists?|artwork|drawings?|drawn|photos?|photographs?|photography|cover\s+(?:art|illustration))$/i],
  ['translation', /^(?:translators?|translations?|translated(?:\s+into\s+english)?|english\s+translation)$/i],
  ['skip', /^(?:designed|design|designer|edited|editor|editors|layout|typeset|narrator|narrated|recorded|reformatted|formatted|book\s+design(?:\s+and\s+\w+)?|series\s+editor|published|publisher|funded|supported|language|level|source|based\s+on)$/i],
];
const ROLE_WORD = /(?:^|\s|\/|\.|;)((?:English\s+)?(?:Authors?|Written|Writers?|Text|Story|Words|Original\s+(?:story|text)|Retold|Adapted|Illustrators?|Illustrations?|Illustrated|Pictures|Images?|Artwork|Art|Artists?|Drawings?|Photos?|Photographs?|Translators?|Translations?|Translated(?:\s+into\s+English)?|Designed|Design|Edited|Editors?|Layout|Narrator|Narrated|Reformatted(?:\s+for\s+Bloom)?|Published|Funded|Supported|Language)(?:\s+[Bb]y\s*:?|\s*:))\s/g;
/**
 * People named in a Bloom credits text ("Writer: A\nIllustration: B and C\nTranslated By: D", "Illustrated by A / Written
 * by B / Designed by C with the help of ...", or the cover's "Author: A") -> { text: [], illustration: [], translation: [] }.
 * Only names after a known role are taken; anything else (thanks, designers, editors, notes) is not guessed at.
 */
export function creditPeople(...texts) {
  const out = { text: [], illustration: [], translation: [] };
  for (const raw of texts) {
    const t = scrub(raw).replace(/\s*\bwith the help of\b[^\n]*/gi, '\n').replace(ROLE_WORD, (m, w) => `${m.slice(0, m.length - w.length - 1)}\n${w} `);
    for (const line of t.split(/\n|\s\/\s|\s\|\s/)) {
      const m = /^\s*((?:English\s+)?[A-Za-z][A-Za-z ]{1,40}?)(?:\s+[Bb]y\s*:?|\s*:)\s*(.+)$/.exec(line.trim());
      if (!m) continue;
      const role = ROLE.find(([, re]) => re.test(m[1].trim().replace(/^English\s+/i, m[1].trim().toLowerCase() === 'english translation' ? 'English ' : '')));
      if (!role || role[0] === 'skip') continue;
      for (let name of m[2].split(/\s*(?:,(?!\s*(?:Inc|Ltd|LLC)\b)|;|\band\b|&)\s*/)) {
        name = name.replace(/^(?:by|by:)\s+/i, '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/[.\s]+$/, '').trim();
        if (!name || name.length > 60 || /https?:|www\.|©|copyright|\d{4}|\bstory\s*book\b|initiative|book\s*dash|participants/i.test(name)) continue;
        if (!out[role[0]].includes(name)) out[role[0]].push(name);
      }
    }
  }
  return out;
}
/** Picture creators named on the pictures themselves ("Ann Artist", "A and B", "World Education, Inc."). */
export function creatorNames(list) {
  const out = [];
  for (const c of list) for (let n of scrub(c).split(/\s*(?:,(?!\s*(?:Inc|Ltd|LLC)\b)|;|\band\b|&)\s*/)) {
    n = n.replace(/\s+adapted\s+by\b.*$/i, '').trim();
    if (n && n.length <= 60 && !/https?:|www\.|©|copyright/i.test(n) && !out.includes(n)) out.push(n);
  }
  return out;
}
/** "Copyright © 2015, African Storybook Initiative" -> "African Storybook Initiative" (holders, no year, no contact). */
export function copyrightHolder(s) {
  return scrub(String(s || '').replace(/\r?\n/g, ' '))
    .replace(/^\s*(?:copyright\s*)?(?:©|\(c\))?\s*(?:copyright\s*)?(?:©|\(c\))?\s*/i, '')
    .replace(/^\d{4}(?:\s*[-–,]\s*\d{4})*\s*[,.\-–]?\s*/, '')
    .replace(/\s*(?:\(©.*|\b(?:CC[ -]BY|This work is licensed|Licensed under|Some rights reserved|Released under|under a CC|under a Creative|Read, create)\b.*)$/i, '')
    .replace(/[\s,.]+$/, '').replace(/[\s,]+\d{4}$/, '')
    .replace(/[\s,.]+$/, '').trim();
}
/** Who made the book this one was adapted from, as its credits say ("Adapted from original: © 2021 - BookDash CC-BY 4.0",
 *  "This book is an adaptation of the original, Title, Copyright © 2019, Book Dash. Licensed under CC BY 4.0.",
 *  "Adapted from original: © Asia Foundation CC-BY 4.0; © Bilum Books CC-BY 4.0") -> "Book Dash" | "Asia Foundation, Bilum
 *  Books" | ''. */
export function originalFrom(...texts) {
  const out = [];
  for (const raw of texts) {
    const t = scrub(raw).replace(/\n/g, ' ');
    const m = /(?:adapted from (?:the )?original|adaptation of the original|adapted from)\b(.*)$/i.exec(t);
    if (!m) continue;
    for (const part of m[1].split(/©/).slice(1)) {
      const h = copyrightHolder(part.replace(/\s*(?:CC[ -]?BY.*|Licensed.*|https?:.*|www\..*)$/i, '')).replace(/[\s,.;:-]+$/, '').trim();
      if (h && h.length <= 80 && !out.includes(h)) out.push(h);
    }
  }
  return out.join(', ');
}
const normHolder = s => copyrightHolder(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// ---------------------------------------------------------------- the book
const XMATTER = new Set(['bloom-frontMatter', 'bloom-backMatter']);
const isPlaceholder = src => /(^|\/)placeHolder\.png$/i.test(src) || !src;
/** The data-book fields of the book's data div (lang "*" or "en", English first). */
function dataBook(root) {
  const div = findAll(root, n => n.attrs.id === 'bloomDataDiv')[0];
  const out = {};
  if (!div) return out;
  for (const n of findAll(div, x => x.attrs['data-book'])) {
    const k = n.attrs['data-book'], lang = n.attrs.lang || '*';
    if (lang !== 'en' && lang !== '*') continue;
    if (out[k] && lang !== 'en') continue;
    out[k] = n.attrs.src && !textOf(n).trim() ? n.attrs.src : textOf(n);
    if (n.attrs['data-license'] !== undefined) out[`${k}@`] = { license: n.attrs['data-license'], copyright: n.attrs['data-copyright'] || '', creator: n.attrs['data-creator'] || '', src: n.attrs.src || textOf(n) };
  }
  return out;
}
/** The pictures inside an element: <img> and Bloom's background-image containers, placeholders left out. */
function picturesIn(n) {
  const pics = [];
  for (const el of findAll(n, x => (x.tag === 'img' && !hasClass(x, 'branding') && !hasClass(x, 'licenseImage') && !hasClass(x, 'bloom-qrcode')) || (hasClass(x, 'bloom-imageContainer') && /background-image/i.test(x.attrs.style || '')))) {
    let src = el.tag === 'img' ? el.attrs.src : ((/background-image\s*:\s*url\(\s*['"]?([^'")]+)/i.exec(el.attrs.style || '') || [])[1] || '');
    src = decodeEntities(String(src || '').trim());
    try { src = decodeURIComponent(src); } catch { /* keep */ }
    if (isPlaceholder(src)) continue;
    pics.push({ file: src, license: el.attrs['data-license'] ?? '', copyright: el.attrs['data-copyright'] ?? '', creator: el.attrs['data-creator'] ?? '', alt: el.attrs.alt || '' });
  }
  return pics;
}
/** Text blocks in one language under an element, image descriptions left out. */
function langTexts(n, lang) {
  return findAll(n, x => hasClass(x, 'bloom-editable') && (x.attrs.lang || '') === lang && !closest(x, p => hasClass(p, 'bloom-imageDescription')) && !hasClass(x.parent, 'bloom-imageDescription'))
    .map(textOf).filter(Boolean);
}
const REAL_LANG = l => l && l !== 'z' && l !== '*' && !/^x-/.test(l);

/**
 * A Bloom book's HTML -> { title, pages: [{ text, picture, alt, otherLangs, wordless }], cover, data, problems,
 * otherLangs }. Story pages are the bloom-page divs that are not front or back matter. On each: the English text
 * (every .bloom-editable[lang=en] in a translation group, image descriptions apart), the one picture, and which other
 * languages have text. `problems` lists what keeps the book out (English missing on a page, several pictures, an
 * interactive page...).
 */
export function parseBloomHtml(html) {
  const root = parseHtml(String(html || ''));
  const problems = [];
  const data = dataBook(root);
  const allPages = findAll(root, n => hasClass(n, 'bloom-page'));
  const story = allPages.filter(p => !classes(p).some(c => XMATTER.has(c)));
  const langsAll = new Set();
  const pages = [];
  story.forEach((p, i) => {
    const cls = classes(p);
    if (cls.some(c => /bloom-interactive-page|simple-comprehension-quiz|bloom-widget|bloom-videoPage|bloom-video/.test(c)) || p.attrs['data-activity'] || findAll(p, x => x.tag === 'video' || hasClass(x, 'bloom-videoContainer') || hasClass(x, 'bloom-widgetContainer')).length) {
      problems.push(`page ${i + 1} is an activity, quiz or video page`);
      return;
    }
    const groups = findAll(p, x => hasClass(x, 'bloom-translationGroup') && !hasClass(x, 'bloom-imageDescription') && !closest(x, q => hasClass(q, 'bloom-imageDescription')));
    const en = [];
    const langs = new Set();
    for (const g of groups) {
      for (const ed of findAll(g, x => hasClass(x, 'bloom-editable'))) {
        const l = ed.attrs.lang || '';
        const tx = textOf(ed);
        if (!tx || !REAL_LANG(l)) continue;
        if (l === 'en') en.push(tx); else langs.add(l);
      }
    }
    const desc = findAll(p, x => hasClass(x, 'bloom-imageDescription')).flatMap(d => findAll(d, x => hasClass(x, 'bloom-editable') && x.attrs.lang === 'en').map(textOf)).filter(Boolean);
    const pics = picturesIn(p);
    langs.forEach(l => langsAll.add(l));
    const text = en.join('\n');
    pages.push({ n: i + 1, text, pictures: pics, picture: pics[0] || null, alt: (desc[0] || (pics[0] && pics[0].alt) || '').trim(), otherLangs: [...langs].sort(), wordless: !text && !langs.size });
  });
  // The cover: the data div's coverImage (with its own license attributes), else the front cover's picture.
  const front = allPages.find(p => hasClass(p, 'outsideFrontCover') || hasClass(p, 'frontCover'));
  const coverPics = front ? picturesIn(front) : [];
  const cd = data['coverImage@'];
  // Both places can carry the picture's license attributes; every one found is checked (checkBloomPictures).
  let cover = cd && !isPlaceholder(cd.src) ? { file: decodeURIComponent(cd.src), license: cd.license, copyright: cd.copyright, creator: cd.creator } : null;
  if (!cover && coverPics[0]) cover = coverPics[0];
  else if (cover && coverPics[0] && coverPics[0].file === cover.file) cover = { ...cover, also: coverPics[0] };
  const title = data.bookTitle || findAll(root, x => x.attrs['data-book'] === 'bookTitle' && x.attrs.lang === 'en').map(textOf).find(Boolean) || '';
  // Credits pages: what the book itself says (front and back matter English text).
  const xmatterText = allPages.filter(p => classes(p).some(c => XMATTER.has(c))).flatMap(p => [...langTexts(p, 'en'), ...langTexts(p, '*')]).join('\n');
  return { title: title.replace(/\s*\n\s*/g, ' ').trim(), pages, cover, data, problems, otherLangs: [...langsAll].sort(), xmatterText };
}

/** How many pictures in one book may carry no license and no copyright at all and still be used under the book's own
 *  license (the owner's rule, docs/decisions.md "Story Library: more Bloom books"): "a couple". A book with more, or
 *  where most pictures are unlabeled, stays out. */
export const MAX_UNLABELED = 2;

/**
 * Which picture goes with which page, and is each one free to use? Every story page needs exactly one picture (a page
 * with only a picture and no words in any language is kept as a wordless page); every picture used must carry an
 * allowed license of its own that is no stricter than the book's, or (no license on the picture) the same copyright
 * holder as the book, in which case it inherits the book's license ("inherited"). A picture with no license AND no
 * copyright at all ("unlabeled") inherits the book's license only when the book has at most maxUnlabeled of them, they
 * are not most of its pictures, and nothing about the picture (its creator or file name) names a stock or clip-art
 * source. Anything else leaves the book out.
 * -> { ok, rules: { own: n, inherited: n, unlabeled: n }, reason? } (on a failure for too many unlabeled pictures,
 *    rules.unlabeled is the full count; maxUnlabeled and allowMostUnlabeled let the report tell how many books another
 *    limit would let in, for the owner to decide)
 */
export function checkBloomPictures(book, bookCode, bookCopyright, { maxUnlabeled = MAX_UNLABELED, allowMostUnlabeled = false } = {}) {
  const fam = BLOOM_ALLOWED[bookCode].family;
  const holder = normHolder(bookCopyright);
  const rules = { own: 0, inherited: 0, unlabeled: 0 };
  const used = [];
  if (!book.cover) return { ok: false, rules, reason: 'no cover picture' };
  used.push(['cover', book.cover]);
  for (const p of book.pages) {
    if (!p.text && !p.wordless) return { ok: false, rules, reason: `page ${p.n} has no English text` };
    if (!p.pictures.length) return { ok: false, rules, reason: `page ${p.n} has no picture` };
    if (p.pictures.length > 1) return { ok: false, rules, reason: `page ${p.n} has ${p.pictures.length} pictures` };
    used.push([`page ${p.n}`, p.picture]);
  }
  for (const [where, picture] of used) {
    let rule = 'own', labeled = false;
    for (const pic of [picture, ...(picture.also ? [picture.also] : [])]) {
      const f = imageLicenseFamily(pic.license);
      if (f !== null) labeled = true;
      if (f === null) {
        const h = normHolder(pic.copyright);
        const restr = restrictionIn(pic.copyright, pic.creator);
        if (restr) return { ok: false, rules, reason: `${where} picture says "${restr}"` };
        const src = NOT_OPEN_SOURCE_RE.exec(`${pic.copyright} ${pic.creator} ${pic.file}`);
        if (src) return { ok: false, rules, reason: `${where} picture is credited to ${src[0]}, whose terms are not an open license` };
        if (holder && h && h === holder) { if (rule !== 'unlabeled') rule = 'inherited'; continue; }
        if (!String(pic.copyright || '').trim()) { rule = 'unlabeled'; continue; }
        return { ok: false, rules, reason: `${where} picture has no license and another copyright holder` };
      }
      if (!(f in FREEDOM)) return { ok: false, rules, reason: `${where} picture license: ${f === 'unknown' ? `unreadable ("${String(pic.license).slice(0, 30)}")` : f.toUpperCase()}` };
      if (FREEDOM[f] < FREEDOM[fam]) return { ok: false, rules, reason: `${where} picture is ${f.toUpperCase()}, stricter than the book's ${BLOOM_ALLOWED[bookCode].name}` };
      const restr = restrictionIn(pic.copyright, pic.creator);
      if (restr) return { ok: false, rules, reason: `${where} picture says "${restr}"` };
      const src = NOT_OPEN_SOURCE_RE.exec(`${pic.copyright} ${pic.creator}`);
      if (src) return { ok: false, rules, reason: `${where} picture is credited to ${src[0]}, whose terms are not an open license` };
    }
    if (rule === 'unlabeled' && labeled) rule = 'own';   // the same picture carries its license in the other place
    rules[rule]++; picture.rule = rule;
  }
  if (rules.unlabeled > maxUnlabeled) return { ok: false, rules, reason: `${rules.unlabeled} pictures have no license or copyright (at most ${maxUnlabeled} may take the book's license)` };
  if (!allowMostUnlabeled && rules.unlabeled && rules.unlabeled * 2 > used.length) return { ok: false, rules, reason: `most pictures have no license or copyright (${rules.unlabeled} of ${used.length})` };
  return { ok: true, rules };
}

/** Line breaks Bloom books place only for the printed layout, inside a sentence ("His\nclothes are all wrong."), become
 *  spaces: a line that ends without a closing mark followed by one that starts with a small letter. Whitespace only; the
 *  words are never changed. */
export const joinSoftBreaks = s => String(s || '').replace(/([\p{L}\p{N},])\n(?=\p{Ll})/gu, '$1 ');

/** Leaves out the wordless pages at the end of a book (no words in any language). -> how many were left out. */
export function trimWordlessEnd(book) {
  let n = 0;
  while (book.pages.length && book.pages[book.pages.length - 1].wordless) { book.pages.pop(); n++; }
  return n;
}

/** The other languages a book has on its story pages ("es", "pt", ...), for a later Spanish or Portuguese library. */
export const otherLangsOf = book => [...new Set(book.pages.flatMap(p => p.otherLangs))].sort();

/** A Bloom id as a manifest id and back ("DebbCmK8ZW" <-> "bl-DebbCmK8ZW"). Bloom ids are 10 letters and digits. */
export const BLOOM_ID_RE = /^[A-Za-z0-9]{10}$/;
export const bloomBookUrl = id => `https://bloomlibrary.org/book/${id}`;

/**
 * A person's corrections of real text mistakes in a book (seed-library/bloom.json picks.<id>.fixes: [{ page, from, to }],
 * page = the story page as the reader numbers it, 1 first, or 0 for the title): each `from` must be found exactly once
 * on its page and is replaced by `to`. Only spelling, punctuation, spacing, capitalization and obvious grammar slips are
 * corrected (the owner's rule, docs/decisions.md "Story Library: more Bloom books"); the book's own consistent spelling
 * is kept. -> { title, texts, problems: [] } (any problem keeps the book out, so a fix that no longer matches is noticed)
 */
export function applyFixes(title, texts, fixes) {
  const out = [String(title || ''), ...texts], problems = [];
  for (const [i, f] of (fixes || []).entries()) {
    const n = f && f.page;
    if (!f || !Number.isInteger(n) || n < 0 || n >= out.length || typeof f.from !== 'string' || !f.from || typeof f.to !== 'string' || f.from === f.to) { problems.push(`fix ${i + 1} is not { page, from, to }`); continue; }
    const t = out[n];
    const at = t.indexOf(f.from);
    const where = n ? `page ${n}` : 'the title';
    if (at < 0) { problems.push(`fix ${i + 1}: "${f.from}" is not on ${where}`); continue; }
    if (t.indexOf(f.from, at + 1) >= 0) { problems.push(`fix ${i + 1}: "${f.from}" is on ${where} more than once`); continue; }
    out[n] = t.slice(0, at) + f.to + t.slice(at + f.from.length);
  }
  return { title: out[0], texts: out.slice(1), problems };
}
