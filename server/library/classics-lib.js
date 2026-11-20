// Story Library, third source: public-domain illustrated classics (docs/decisions.md "Story Library: a Classics shelf";
// docs/story-library-classics.md). The pure parts of scripts/import-classics.js, shared with the unit tests: the
// public-domain rule, reading an illustrated HTML edition into paragraphs and pictures, and cutting a story into pages
// that fit half a laptop screen, each picture on the page whose words it illustrates. Nothing here fetches anything.
import { decodeEntities } from './bloom-lib.js';
import { sentences } from '../../public/js/library-text.js';

// ---------------------------------------------------------------- the public-domain rule
/**
 * A classic may be used only when it is public domain in the US (published before 1931, the US cut-off on 1 January
 * 2026) AND everyone who made it (author, illustrator, translator) died before 1956, so it is out of copyright in
 * countries with "life plus 70 years" as well. A maker whose death year is unknown keeps the book out (never guessed),
 * unless the book does not name the person (a translator "not named in the book"): an anonymous work is protected for 70
 * years from publication in those countries, so one published before 1931 is free there too.
 */
export const PD_RULE = Object.freeze({ publishedBefore: 1931, diedBefore: 1956, anonymousBefore: 1931 });
/** -> { ok: true } | { ok: false, reason } */
export function checkPublicDomain({ published, makers } = {}, rule = PD_RULE) {
  if (!Number.isInteger(published)) return { ok: false, reason: 'no publication year' };
  if (published >= rule.publishedBefore) return { ok: false, reason: `published ${published}, not before ${rule.publishedBefore} (not public domain in the US)` };
  if (!Array.isArray(makers) || !makers.length) return { ok: false, reason: 'no author or illustrator recorded' };
  for (const m of makers) {
    const who = `${m.role || 'maker'} ${m.name || '(unnamed)'}`;
    if (m.anonymous) { if (published >= rule.anonymousBefore) return { ok: false, reason: `${who} is anonymous and the book is from ${published}` }; continue; }
    if (!Number.isInteger(m.died)) return { ok: false, reason: `${who}: death year unknown` };
    if (m.died >= rule.diedBefore) return { ok: false, reason: `${who} died in ${m.died}, not before ${rule.diedBefore} (still in copyright in life-plus-70 countries)` };
  }
  return { ok: true };
}

// ---------------------------------------------------------------- reading the HTML edition
/** Words the source must not bring into the site: the digitizer's name, headers, footers and license. */
export const SOURCE_NAME_RE = /project\s+gutenberg|gutenberg|\bpglaf\b|\bpgdp\b|distributed\s+proofread|transcriber/i;

/**
 * An illustrated HTML edition (or a part of it) -> blocks in reading order:
 *   { t: 'h', text } a heading; { t: 'p', text } a paragraph (a line break inside, as in a poem, is "\n");
 *   { t: 'img', src, alt, w, h, caption } a picture (its caption, when the edition prints one under it).
 * Page numbers of the printed book, the digitizer's corrections markup and all other tags are taken out; entities are
 * decoded; the source's own line wrapping becomes spaces.
 */
export function htmlBlocks(html) {
  const IMG = '\u0001', CAP = '\u0002', HEAD = '\u0003', BR = '\u0004', END = '\u0005';
  let s = String(html || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<span class=['"]pagenum['"][^>]*>[\s\S]*?<\/span>/gi, '')
    .replace(/<(?:script|style)[\s\S]*?<\/(?:script|style)>/gi, ' ');
  const attr = (tag, name) => { const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag); return m ? decodeEntities(m[1] ?? m[2] ?? m[3]) : ''; };
  // Captions: <div class="caption...">...</div> or <span class="caption">...</span> (no nested divs in these editions).
  s = s.replace(/<(div|span|p)\s[^>]*class=['"]?caption\d*['"]?[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, inner) => `\n\n${CAP}${inner}${END}\n\n`);
  s = s.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, __, inner) => `\n\n${HEAD}${inner}${END}\n\n`);
  s = s.replace(/<img\b[^>]*>/gi, tag => `\n\n${IMG}${[attr(tag, 'src'), attr(tag, 'alt'), attr(tag, 'width'), attr(tag, 'height')].join('\u0006')}${END}\n\n`);
  s = s.replace(/<br\s*\/?>/gi, BR);
  s = s.replace(/<\/?(?:p|div|table|tr|td|th|hr|blockquote|center|pre|ul|ol|li|dl|dt|dd|h[1-6])\b[^>]*>/gi, '\n\n');
  s = s.replace(/<[^>]+>/g, '');
  s = decodeEntities(s).replace(/ /g, ' ');
  const blocks = [];
  const clean = x => x.replace(/[ \t\r\n]+/g, ' ').split(BR).map(l => l.trim()).join('\n').replace(/^\n+|\n+$/g, '').replace(/\n{2,}/g, '\n').trim();
  for (const raw of s.split(/\n[ \t\r]*\n/)) {
    const part = raw.trim(); if (!part) continue;
    // A part can hold several markers (an image and its caption inside one table cell).
    const re = new RegExp(`([${IMG}${CAP}${HEAD}])([\\s\\S]*?)${END}|([^${IMG}${CAP}${HEAD}${END}]+)`, 'g');
    let m;
    while ((m = re.exec(part))) {
      if (m[3] !== undefined) { const text = clean(m[3]); if (text) blocks.push({ t: 'p', text }); continue; }
      const body = m[2];
      if (m[1] === IMG) { const [src, alt, w, h] = body.split('\u0006'); blocks.push({ t: 'img', src, alt: clean(alt), w: +w || 0, h: +h || 0, caption: '' }); }
      else if (m[1] === HEAD) { const text = clean(body); if (text) blocks.push({ t: 'h', text }); }
      else { const text = clean(body); const im = [...blocks].reverse().find(b => b.t === 'img'); if (text && im && !im.caption) im.caption = text; else if (text) blocks.push({ t: 'cap', text }); }
    }
  }
  return blocks;
}

/** The blocks of one story: from the heading whose text matches `from` (exactly, case and spaces ignored) up to the
 *  next heading of the same kind or the `to` heading. -> blocks (the heading itself not included). */
export function sectionOf(blocks, from, to = null) {
  const norm = x => String(x || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const i = blocks.findIndex(b => b.t === 'h' && norm(b.text) === norm(from));
  if (i < 0) throw new Error(`heading "${from}" not found`);
  let j = blocks.length;
  for (let k = i + 1; k < blocks.length; k++) if (blocks[k].t === 'h' && (to ? norm(blocks[k].text) === norm(to) : true)) { j = k; break; }
  return blocks.slice(i + 1, j);
}

/**
 * A story from its blocks, as a person curated it (seed-library/classics.json): drop caps joined to their word,
 * paragraphs from the start phrase to the end phrase, captions printed as text left out, the pictures used (each with
 * the sentence it illustrates), and corrections.
 *   opts: { start?: phrase the story starts at, end?: phrase its last paragraph contains,
 *           skip?: [phrase] paragraphs starting with one of these are not the story (a picture's caption printed as
 *                  a paragraph, a digitizer's note); each must match at least one paragraph,
 *           dropCaps?: { file: letters } a big first letter printed as a picture (a one-letter alt text is read alone),
 *           smallCaps?: true (a paragraph's first word printed in capitals, "ONCE upon a time", is set as normal text),
 *           headings?: [text] paragraphs that are a heading (a fable's title): a page never ends right after one,
 *           pictures: [{ file, at?: phrase, alt? }] the pictures used (others are left out),
 *           pictureSide: 'after' (a picture follows the words it shows, as in Kipling: the sentence before it) |
 *                        'before' (it comes first, as in Potter: the sentence after it; several in a row share out the
 *                        sentences up to the next picture) | 'auto' (before when it comes right after a heading),
 *           fixes: [{ from, to }], breakAt?: [phrase] (a new page starts at that paragraph, e.g. each fable) }
 * -> { paragraphs: [text], pictures: [{ file, alt, caption, w, h, para, sentence }], breaks: [i], keep: [i], fixes }
 */
export function storyOf(blocks, opts = {}) {
  const paragraphs = [];
  const anchors = [];       // { file, alt, caption, w, h, after: the paragraph before it (-1: none) }
  let pendingCap = '';
  let started = !opts.start, ended = false;
  const drop = opts.dropCaps || {};
  const want = new Map((opts.pictures || []).map(p => [p.file, p]));
  const skip = opts.skip || [], skipped = new Set();
  for (const b of blocks) {
    // After the last paragraph, only the pictures printed right after it (before any more words) still belong.
    if (ended && b.t !== 'img') break;
    if (b.t === 'img') {
      const file = b.src.split('/').pop();
      const letter = drop[file] || (/^[A-Z]$/.test(b.alt) && b.w && b.w < 260 ? b.alt : '');
      if (letter) { pendingCap = letter; continue; }
      // A picture printed just before the first words (a picture book's first page) is wanted too.
      if (want.has(file) && !anchors.some(a => a.file === file)) anchors.push({ file, alt: b.alt, caption: b.caption, w: b.w, h: b.h, after: paragraphs.length - 1 });
      continue;
    }
    if (b.t !== 'p') continue;
    let text = b.text;
    if (pendingCap) {
      // The printed book's big first letter is a picture; the rest of that word is set in capitals ("N the sea", "HERE
      // was once"): the letter goes back and the word is set as normal text ("In the sea", "There was once").
      text = text.replace(/^([A-Z’']*)/, w => pendingCap + w.toLowerCase());
      pendingCap = '';
    }
    if (!started) { if (text.includes(opts.start)) { started = true; text = text.slice(text.indexOf(opts.start)); } else continue; }
    const sk = skip.find(x => text.startsWith(x));
    if (sk) { skipped.add(sk); continue; }
    if (opts.smallCaps) text = smallCapsStart(text);
    paragraphs.push(text);
    if (opts.end && text.includes(opts.end)) ended = true;
  }
  if (opts.start && !started) throw new Error(`start "${opts.start}" not found`);
  if (opts.end && !ended) throw new Error(`end "${opts.end}" not found`);
  const unused = skip.filter(x => !skipped.has(x));
  if (unused.length) throw new Error(`skip "${unused[0]}" matches no paragraph`);
  // Corrections of clear typos (or OCR errors), each found exactly once in the whole story.
  const fixes = opts.fixes || [];
  let all = paragraphs.join('\n\n');
  for (const [i, f] of fixes.entries()) {
    if (!f.from || typeof f.to !== 'string' || f.from === f.to) throw new Error(`fix ${i + 1}: needs a "from" and a different "to"`);
    const at = all.indexOf(f.from);
    if (at < 0) throw new Error(`fix ${i + 1}: "${f.from}" is not in the story`);
    if (all.indexOf(f.from, at + 1) >= 0) throw new Error(`fix ${i + 1}: "${f.from}" is in the story more than once`);
    all = all.slice(0, at) + f.to + all.slice(at + f.from.length);
  }
  const paras = all.split('\n\n');
  if (paras.length !== paragraphs.length) throw new Error('a fix may not add or remove a paragraph break');
  const keep = [...new Set((opts.headings || []).flatMap(h => paras.map((t, i) => (t === h ? i : -1)).filter(i => i >= 0)))];
  const side = opts.pictureSide || 'after';
  const sideOf = a => (side !== 'auto' ? side : a.after < 0 || keep.includes(a.after) ? 'before' : 'after');
  const sentenceList = paras.map(t => cutSentences(t));
  // Each picture's sentence: the phrase a person gave (`at`), else by its side (see above).
  const placed = new Map();
  for (const a of anchors) {
    const spec = want.get(a.file);
    if (spec.at) {
      const hits = [];
      sentenceList.forEach((ss, pi) => ss.forEach((s, si) => { if (s.includes(spec.at)) hits.push([pi, si]); }));
      if (hits.length !== 1) throw new Error(`picture ${a.file}: "${spec.at}" is in ${hits.length} sentences, not exactly one`);
      placed.set(a.file, hits[0]);
    } else if (sideOf(a) === 'after') {
      const para = Math.max(0, a.after);
      placed.set(a.file, [para, sentenceList[para].length - 1]);
    }
  }
  // Pictures that come before their words: a run of them before the same paragraph shares out the sentences that follow,
  // up to the next picture's place, in order.
  const before = anchors.filter(a => !placed.has(a.file));
  const runs = new Map();
  for (const a of before) { const k = a.after; if (!runs.has(k)) runs.set(k, []); runs.get(k).push(a); }
  for (const [after, run] of runs) {
    const first = Math.min(paras.length - 1, after + 1);
    const nextAt = anchors.filter(x => x.after > after).map(x => x.after + (sideOf(x) === 'before' ? 1 : 0)).reduce((m, x) => Math.min(m, x), paras.length);
    const span = [];
    for (let pi = first; pi < Math.max(first + 1, nextAt); pi++) sentenceList[pi].forEach((_, si) => span.push([pi, si]));
    if (run.length > span.length) throw new Error(`pictures ${run.map(x => x.file).join(', ')} come before ${span.length} sentence(s): too many for one picture each`);
    run.forEach((a, k) => placed.set(a.file, span[Math.floor((k * span.length) / run.length)]));
  }
  const pictures = anchors.map(a => {
    const spec = want.get(a.file), [para, sentence] = placed.get(a.file);
    return { file: a.file, alt: spec.alt || a.alt || '', caption: a.caption || '', w: a.w, h: a.h, para, sentence };
  });
  const missing = [...want.keys()].filter(f => !anchors.some(a => a.file === f));
  if (missing.length) throw new Error(`picture ${missing[0]} is not in the story`);
  const breaks = (opts.breakAt || []).map(ph => { const i = paras.findIndex(t => t.startsWith(ph)); if (i < 0) throw new Error(`break "${ph}" not found at the start of a paragraph`); return i; });
  return { paragraphs: paras, pictures, breaks, keep, fixes };
}

/** "ONCE upon a time" -> "Once upon a time"; "TOM THUMB set to work" -> "Tom Thumb set to work"; "A MINUTE afterwards"
 *  -> "A minute afterwards": a run of capitals at the start of a paragraph (the printed book's small capitals) is set as
 *  normal text, keeping a capital where the same word is a name elsewhere (decided by the caller's names list). */
export function smallCapsStart(text, names = SMALLCAP_NAMES) {
  const m = /^((?:[A-Z][A-Z’'-]*\s+)*[A-Z][A-Z’'-]+)(?=[\s,.!?;:—]|$)/.exec(text);
  if (!m || !/[A-Z]{2}/.test(m[1])) return text;
  const words = m[1].split(/\s+/).map((w, i) => {
    const t = w[0] + w.slice(1).toLowerCase();
    return i === 0 || names.has(t) ? t : t.toLowerCase();
  });
  return words.join(' ') + text.slice(m[1].length);
}
export const SMALLCAP_NAMES = new Set(['Tom', 'Thumb', 'Hunca', 'Munca', 'Lucinda', 'Jane']);

// ---------------------------------------------------------------- pages that fit
/** Abbreviations a sentence never ends at ("Mr. McGregor"): the reader's cut (library-text.js) splits there, so the
 *  page cut joins them back and never breaks a page after one. */
const ABBR = /(?:^|\s)(?:Mr|Mrs|Dr|St|Mt|Messrs|Jr|Sr)\.$/;
/** A paragraph's sentences for cutting pages: library-text.js sentences(), joined after an abbreviation. Each piece
 *  keeps the space or line break after it, so the pieces joined are the paragraph again. -> [text] */
export function cutSentences(text) {
  const out = [];
  for (const s of sentences(text)) {
    const prev = out[out.length - 1];
    if (prev && ABBR.test(text.slice(prev.start, prev.end)) && lineOf(text, prev.start) === lineOf(text, s.start)) prev.end = s.end; else out.push({ start: s.start, end: s.end });
  }
  return out.map((s, i) => text.slice(i ? s.start : 0, i + 1 < out.length ? out[i + 1].start : text.length));
}
const lineOf = (text, at) => (text.slice(0, at).match(/\n/g) || []).length;

/**
 * The page budget: what fits on one half of a 1280 x 720 screen in the reader's Classics type (public/css/library.css
 * ".rd-stage.is-classic"), measured in the browser (tests/unit/library-classics-browser.test.js) and kept a little
 * under it. A paragraph line is its characters over `perLine`, rounded up; a gap between paragraphs counts `gap` lines.
 */
export const PAGE_FIT = Object.freeze({ perLine: 42, lines: 13, gap: 0.5, maxWords: 105, fill: 0.6 });
/** How many lines a page's text takes (the estimate the cut uses). */
export function linesOf(text, fit = PAGE_FIT) {
  const paras = String(text || '').split('\n\n').filter(p => p.trim());
  return paras.reduce((n, p) => n + p.split('\n').reduce((k, l) => k + Math.max(1, Math.ceil(l.length / fit.perLine)), 0), 0) + Math.max(0, paras.length - 1) * fit.gap;
}
const words = s => (String(s || '').match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu) || []).length;
export const fitsPage = (text, fit = PAGE_FIT) => linesOf(text, fit) <= fit.lines && words(text) <= fit.maxWords;

/**
 * A story -> pages: [{ text, picture: file | null }]. Pages break only between sentences (never inside one), at a
 * paragraph when the page is already well filled, before each forced break, and so that no page holds two pictures; a
 * picture goes on the page with the sentence it illustrates. With pictureStartsPage (picture books), every picture
 * starts a new page. A single sentence too long for a page gets a page of its own (reported by `overfull`).
 */
export function paginate(story, { fit = PAGE_FIT, pictureStartsPage = false } = {}) {
  const items = [];
  story.paragraphs.forEach((p, pi) => cutSentences(p).forEach((text, si, arr) => items.push({ text, pi, first: si === 0, last: si === arr.length - 1, pic: null, brk: si === 0 && (story.breaks || []).includes(pi) })));
  for (const pic of story.pictures) {
    const it = items.filter(x => x.pi === pic.para)[pic.sentence];
    if (!it) throw new Error(`picture ${pic.file}: no sentence ${pic.sentence} in paragraph ${pic.para}`);
    if (it.pic) throw new Error(`pictures ${it.pic} and ${pic.file} illustrate the same sentence`);
    it.pic = pic.file;
  }
  const pages = [];
  let cur = null;
  const textOf = list => { let s = ''; list.forEach((x, i) => { s += i === 0 ? x.text : x.first ? `${s.endsWith('\n') ? '' : '\n\n'}${x.text}` : x.text; s = x.last ? s.replace(/\s+$/, '') + '\n\n' : s; }); return s.trim(); };
  const open = () => { cur = { items: [], picture: null }; pages.push(cur); };
  // Splitting this paragraph here would leave a scrap (under two lines) on one side: better to start it on a new page.
  const awkwardSplit = (on, para) => {
    let k = 0; while (k < para.length && fitsPage(textOf([...on, ...para.slice(0, k + 1)]), fit)) k++;
    return k === 0 || linesOf(textOf(para.slice(0, k)), fit) < 2 || linesOf(textOf(para.slice(k)), fit) < 2;
  };
  // A page may end only after a whole sentence: never between the lines of a list or poem that is one sentence, never
  // right after a heading, and never before a small letter ("ker-pflop! with a splash" is one sentence).
  const breakable = (prev, it) => !/^\s*\p{Ll}/u.test(it.text) && (prev.last
    ? !(story.keep || []).includes(prev.pi) && /[.!?…:;—]["”’')\]]*\s*$/.test(prev.text)
    : /[.!?…]["”’')\]]*\s*$/.test(prev.text));
  items.forEach((it, i) => {
    if (!cur) open();
    else if (cur.items.length) {
      const fill = linesOf(textOf(cur.items), fit) / fit.lines;
      const para = it.first ? items.slice(i).filter(x => x.pi === it.pi) : [it];
      const prev = cur.items[cur.items.length - 1];
      const canBreak = breakable(prev, it);
      // Too long, and no sentence ends here: end the page at the last place before this where one does.
      if (!canBreak && !fitsPage(textOf([...cur.items, it]), fit)) {
        let j = cur.items.length - 1;
        while (j > 0 && !breakable(cur.items[j - 1], cur.items[j])) j--;
        const tail = j > 0 ? cur.items.slice(j) : [];
        if (tail.length && !(tail.some(x => x.pic) && cur.items.slice(0, j).some(x => x.pic))) {
          cur.items = cur.items.slice(0, j); cur.picture = (cur.items.find(x => x.pic) || {}).pic || null;
          open(); for (const x of tail) { cur.items.push(x); if (x.pic) cur.picture = x.pic; }
        }
      }
      const brk = canBreak && (it.brk
        || (it.pic && (cur.picture || pictureStartsPage))
        || !fitsPage(textOf([...cur.items, it]), fit)
        || (it.first && !fitsPage(textOf([...cur.items, ...para]), fit) && (fill >= fit.fill || (fill >= 0.35 && awkwardSplit(cur.items, para)))));
      if (brk) open();
      else if (it.pic && cur.picture) throw new Error(`pictures ${cur.picture} and ${it.pic} would share a page (no sentence ends between them)`);
    }
    cur.items.push(it);
    if (it.pic) cur.picture = it.pic;
  });
  // A scrap left alone on a page (a fable's moral, the last line of a paragraph): bring the sentences before it along
  // when they fit there, so no page holds only a line or two.
  for (let k = 1; k < pages.length; k++) {
    const A = pages[k - 1], B = pages[k];
    if (B.items[0].brk) continue;
    while (linesOf(textOf(B.items), fit) < 3) {
      let j = A.items.length - 1;
      while (j > 0 && !breakable(A.items[j - 1], A.items[j])) j--;
      if (j <= 0) break;
      const tail = A.items.slice(j);
      if (tail.some(x => x.pic) || tail.some(x => x.brk) || !fitsPage(textOf([...tail, ...B.items]), fit)) break;
      A.items = A.items.slice(0, j); B.items = [...tail, ...B.items];
    }
  }
  return pages.map(p => ({ text: textOf(p.items), picture: p.picture, overfull: !fitsPage(textOf(p.items), fit) }));
}

/** The checks every shipped classic must pass: no page breaks inside a sentence (each page's last sentence ends with
 *  . ! ? … or a closing quote after one, or a poem line / heading line), every page fits the budget, and the pages
 *  joined are the story. -> [] or the problems. */
export function checkPages(pages, story, fit = PAGE_FIT) {
  const out = [];
  pages.forEach((p, i) => {
    if (!fitsPage(p.text, fit)) out.push(`page ${i + 1} does not fit (${words(p.text)} words, ${linesOf(p.text, fit)} lines)`);
    if (i + 1 < pages.length && (!endsSentence(p.text) || /^\s*\p{Ll}/u.test(pages[i + 1].text))) out.push(`page ${i + 1} ends inside a sentence: "…${p.text.slice(-30)}"`);
  });
  const flat = s => s.replace(/\s+/g, ' ').trim();
  if (story && flat(pages.map(p => p.text).join(' ')) !== flat(story.paragraphs.join(' '))) out.push('the pages are not the whole story');
  return out;
}
/** A page ends a sentence: its text ends with . ! ? … (a colon, semicolon or dash only where a paragraph ends), with any
 *  closing quote after it, and not after an abbreviation such as "Mr.". */
export function endsSentence(text) {
  const t = String(text || '').replace(/\s+$/, '');
  return !ABBR.test(t) && /[.!?…:;—]["”’')\]]*$/.test(t);
}
