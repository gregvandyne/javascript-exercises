// The book maker's shared rules (docs/storybook-builder.md): one pure module for the server (services/storybook.js), the
// book editor (public/js/storybook-edit.js), the reader and the print view. No DOM, no database.
//
// A book: { title, kind: 'linear' | 'cyoa', start: pageId, cast: [{ name, art }], pages: [page] }
//   page: { id, title, text, end (cyoa: an ending), choices: [{ text, to: pageId }] (cyoa only, at most 4),
//           pic: { world, mood, chars: [{ name, pos, flip }], props: [name] } | null (a drawn picture, from the art packs),
//           upload: pictureId | null (the teacher's own picture, which wins over pic), alt }
// A linear book is read from its first page to its last: it has no choices and its last page is the end.

export const KINDS = ['linear', 'cyoa'];
export const LIMITS = Object.freeze({ title: 80, pageTitle: 60, text: 700, choice: 90, choices: 4, pages: 30, cast: 8, castName: 24, chars: 3, props: 3, alt: 200, pagesMin: 1 });
export const POSITIONS = ['left', 'center', 'right'];
export const MOODS = ['bright', 'warm', 'dusk', 'night', 'gloomy', 'magic'];

const str = (v, n) => String(v ?? '').normalize('NFC').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‪-‮⁦-⁩]/g, '').replace(/[ \t]+/g, ' ').trim().slice(0, n);
/** Page text keeps its paragraphs (a blank line), nothing else. */
const para = (v, n) => str(String(v ?? '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n'), n).replace(/ ?\n ?/g, '\n');
const idOk = id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,24}$/.test(id);

/**
 * Any object -> a book of the right shape (never throws): strings trimmed and cut to their limits, unknown fields
 * dropped, ids made unique, at most LIMITS.pages pages. art: { worlds: Set|[], chars: Set|[], props(world) -> [] } to
 * keep only known art (unknown art is dropped, and noted in fixes). -> { book, fixes: [string] }
 */
export function shapeBook(raw, { kind = null, art = null } = {}) {
  const fixes = [];
  const d = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const k = KINDS.includes(kind) ? kind : KINDS.includes(d.kind) ? d.kind : 'linear';
  const has = (list, v) => !list || (list instanceof Set ? list.has(v) : list.includes(v));
  const cast = [];
  for (const c of Array.isArray(d.cast) ? d.cast : []) {
    if (!c || typeof c !== 'object' || cast.length >= LIMITS.cast) continue;
    const name = str(c.name, LIMITS.castName); if (!name || cast.some(x => x.name.toLowerCase() === name.toLowerCase())) continue;
    const a = str(c.art, 40);
    if (art && !has(art.chars, a)) { fixes.push(`cast "${name}": "${a}" is not a character in the catalog`); continue; }
    cast.push({ name, art: a });
  }
  const seen = new Set(), pages = [];
  for (const p of (Array.isArray(d.pages) ? d.pages : []).slice(0, LIMITS.pages * 2)) {
    if (!p || typeof p !== 'object') continue;
    if (pages.length >= LIMITS.pages) { fixes.push(`more than ${LIMITS.pages} pages`); break; }
    let id = idOk(p.id) ? p.id : '';
    if (!id || seen.has(id)) { let n = pages.length + 1; while (seen.has(`p${n}`)) n++; id = `p${n}`; }
    seen.add(id);
    const text = para(p.text, LIMITS.text + 1);
    if (text.length > LIMITS.text) fixes.push(`page ${id}: text longer than ${LIMITS.text} characters`);
    const out = { id, title: str(p.title, LIMITS.pageTitle), text: text.slice(0, LIMITS.text), end: k === 'cyoa' && p.end === true, choices: [], pic: null, upload: null, alt: str(p.alt, LIMITS.alt) };
    if (k === 'cyoa') {
      const ch = Array.isArray(p.choices) ? p.choices : [];
      if (ch.length > LIMITS.choices) fixes.push(`page ${id}: more than ${LIMITS.choices} choices`);
      for (const c of ch.slice(0, LIMITS.choices)) if (c && typeof c === 'object') out.choices.push({ text: str(c.text, LIMITS.choice), to: idOk(c.to) ? c.to : '' });
    }
    if (typeof p.upload === 'string' && /^[A-Za-z0-9_-]{6,40}$/.test(p.upload)) out.upload = p.upload;
    if (p.pic && typeof p.pic === 'object') {
      const w = str(p.pic.world, 40);
      if (!art || has(art.worlds, w)) {
        const chars = [];
        for (const c of Array.isArray(p.pic.chars) ? p.pic.chars : []) {
          if (!c || typeof c !== 'object' || chars.length >= LIMITS.chars) continue;
          const name = str(c.name, LIMITS.castName);
          const who = cast.find(x => x.name.toLowerCase() === name.toLowerCase());
          if (!who) { if (art) fixes.push(`page ${id}: "${name}" is in the picture but not in the cast`); continue; }
          if (chars.some(x => x.name === who.name)) continue;
          const pos = POSITIONS.includes(c.pos) ? c.pos : POSITIONS.find(x => !chars.some(y => y.pos === x)) || 'center';
          chars.push({ name: who.name, pos, flip: c.flip === true });
        }
        // two characters on one spot would stand inside each other: the later one moves to a free spot
        const used = new Set();
        for (const c of chars) { if (used.has(c.pos)) c.pos = POSITIONS.find(x => !used.has(x)) || c.pos; used.add(c.pos); }
        const okProps = art && art.props ? art.props(w) : null;
        const props = [...new Set((Array.isArray(p.pic.props) ? p.pic.props : []).map(x => str(x, 40)))].filter(x => !okProps || okProps.includes(x)).slice(0, LIMITS.props);
        out.pic = { world: w, mood: MOODS.includes(p.pic.mood) ? p.pic.mood : 'bright', chars, props };
      } else fixes.push(`page ${id}: "${w}" is not a world in the catalog`);
    }
    pages.push(out);
  }
  let start = idOk(d.start) && pages.some(p => p.id === d.start) ? d.start : pages[0] ? pages[0].id : '';
  if (k === 'linear') start = pages[0] ? pages[0].id : '';
  return { book: { title: str(d.title, LIMITS.title), kind: k, start, cast, pages }, fixes };
}

export const pageOf = (book, id) => book.pages.find(p => p.id === id) || null;
/** The pages a reader can reach from the start (a linear book: all of them). -> Set of ids */
export function reachable(book) {
  if (book.kind !== 'cyoa') return new Set(book.pages.map(p => p.id));
  const out = new Set(), todo = book.start && pageOf(book, book.start) ? [book.start] : [];
  while (todo.length) {
    const id = todo.shift(); if (out.has(id)) continue; out.add(id);
    const p = pageOf(book, id);
    if (p && !p.end) for (const c of p.choices) if (c.to && pageOf(book, c.to) && !out.has(c.to)) todo.push(c.to);
  }
  return out;
}

/**
 * What a teacher should look at (never blocks saving or sharing). -> [{ code, page?, choice? }], in page order:
 * noPages, noStart, noEnding (cyoa: no ending the reader can reach), unreachable (a page the start never leads to),
 * deadEnd (cyoa: no choices and not an ending), choiceNoText, choiceNowhere (leads to no page, or to itself), noText,
 * noAlt (a picture with no words for screen readers).
 */
export function warningsOf(book) {
  const out = [];
  if (!book.pages.length) return [{ code: 'noPages' }];
  const cyoa = book.kind === 'cyoa';
  if (cyoa && !pageOf(book, book.start)) out.push({ code: 'noStart' });
  const reach = reachable(book);
  if (cyoa && ![...reach].some(id => pageOf(book, id).end)) out.push({ code: 'noEnding' });
  for (const p of book.pages) {
    if (cyoa && !reach.has(p.id)) out.push({ code: 'unreachable', page: p.id });
    if (!p.text) out.push({ code: 'noText', page: p.id });
    if (cyoa && !p.end && !p.choices.length) out.push({ code: 'deadEnd', page: p.id });
    if (cyoa && !p.end) p.choices.forEach((c, i) => {
      if (!c.text) out.push({ code: 'choiceNoText', page: p.id, choice: i });
      if (!c.to || !pageOf(book, c.to) || c.to === p.id) out.push({ code: 'choiceNowhere', page: p.id, choice: i });
    });
    if ((p.pic || p.upload) && !p.alt) out.push({ code: 'noAlt', page: p.id });
  }
  return out;
}

/**
 * The problems the AI must fix (its answer is sent back once with these listed). Stricter than warningsOf: a CYOA book
 * needs a start, an ending, every page reachable, every choice with words and a page to lead to, every non-ending page
 * with a choice; every page needs words and a picture with alt text. -> [string] (English, for the model)
 */
export function problemsOf(book) {
  const out = [];
  if (!book.title) out.push('title: missing');
  if (!book.pages.length) out.push('pages: the book has no pages');
  for (const w of warningsOf(book)) {
    const at = w.page ? `page ${w.page}` : 'book';
    out.push({
      noPages: 'pages: the book has no pages', noStart: '"start" must be the id of a page', noEnding: 'there must be at least one ending ("end": true) the reader can reach',
      unreachable: `${at}: no choice leads here from the start page (link it, or remove the page)`, noText: `${at}: the page has no words`,
      deadEnd: `${at}: a page that is not an ending needs 1 to ${LIMITS.choices} choices`, choiceNoText: `${at}: choice ${w.choice + 1} has no words`,
      choiceNowhere: `${at}: choice ${w.choice + 1} must lead ("to") to the id of another page`, noAlt: `${at}: the picture needs "alt" text`,
    }[w.code]);
  }
  for (const p of book.pages) if (!p.pic && !p.upload) out.push(`page ${p.id}: needs a "pic"`);
  return [...new Set(out)];
}

/**
 * Make a book safe to show however the AI left it: choices to nowhere are dropped, a CYOA page with no choices becomes
 * an ending, pages nobody can reach are removed, and a book with no reachable ending gets its last reachable page as
 * one. -> { book, repaired: number of fixes }
 */
export function repairBook(book0) {
  const book = JSON.parse(JSON.stringify(book0));
  let repaired = 0;
  if (book.kind !== 'cyoa') return { book, repaired };
  if (!pageOf(book, book.start) && book.pages[0]) { book.start = book.pages[0].id; repaired++; }
  for (const p of book.pages) {
    const keep = p.end ? [] : p.choices.filter(c => c.text && c.to && c.to !== p.id && pageOf(book, c.to));
    if (keep.length !== p.choices.length) { repaired += p.choices.length - keep.length; p.choices = keep; }
    if (!p.end && !p.choices.length) { p.end = true; repaired++; }
  }
  const reach = reachable(book);
  const before = book.pages.length;
  book.pages = book.pages.filter(p => reach.has(p.id));
  repaired += before - book.pages.length;
  if (book.pages.length && !book.pages.some(p => p.end)) { book.pages[book.pages.length - 1].end = true; book.pages[book.pages.length - 1].choices = []; repaired++; }
  return { book, repaired };
}

/**
 * Page numbers for print and the story map: a CYOA book's start is page 1 and the rest follow in the order a reader
 * meets them (breadth first), pages nobody reaches last; a linear book keeps its order. -> Map(id -> number)
 */
export function numbering(book) {
  const order = [];
  if (book.kind === 'cyoa') {
    const seen = new Set(), todo = pageOf(book, book.start) ? [book.start] : [];
    while (todo.length) {
      const id = todo.shift(); if (seen.has(id)) continue; seen.add(id); order.push(id);
      const p = pageOf(book, id);
      if (p && !p.end) for (const c of p.choices) if (c.to && pageOf(book, c.to) && !seen.has(c.to)) todo.push(c.to);
    }
    for (const p of book.pages) if (!seen.has(p.id)) order.push(p.id);
  } else order.push(...book.pages.map(p => p.id));
  return new Map(order.map((id, i) => [id, i + 1]));
}

/**
 * The story map's layout: each page's column (its depth from the start; pages nobody reaches get a column of their
 * own at the end) and row, and the arrows (from, to). -> { nodes: [{ id, col, row, n, end, start, lost }], edges: [{ from, to }], cols, rows }
 */
export function mapLayout(book) {
  const num = numbering(book), depth = new Map();
  if (pageOf(book, book.start)) {
    const todo = [[book.start, 0]];
    while (todo.length) {
      const [id, d] = todo.shift(); if (depth.has(id)) continue; depth.set(id, d);
      const p = pageOf(book, id);
      if (p && !p.end) for (const c of p.choices) if (c.to && pageOf(book, c.to) && !depth.has(c.to)) todo.push([c.to, d + 1]);
    }
  }
  const maxD = Math.max(-1, ...depth.values());
  const byCol = new Map();
  const nodes = [...book.pages].sort((a, b) => num.get(a.id) - num.get(b.id)).map(p => {
    const lost = !depth.has(p.id), col = lost ? maxD + 1 : depth.get(p.id);
    const row = (byCol.get(col) || 0); byCol.set(col, row + 1);
    return { id: p.id, col, row, n: num.get(p.id), end: !!p.end, start: p.id === book.start, lost };
  });
  const edges = [];
  for (const p of book.pages) if (!p.end) for (const c of p.choices) if (c.to && pageOf(book, c.to) && c.to !== p.id) edges.push({ from: p.id, to: c.to });
  return { nodes, edges, cols: Math.max(1, ...nodes.map(x => x.col + 1)), rows: Math.max(1, ...byCol.values()) };
}

/** Every word a reader sees, for the word rules and the classifier: [[where, text]]. */
export function textsOf(book) {
  const out = [['title', book.title]];
  for (const c of book.cast) out.push([`cast ${c.name}`, c.name]);
  for (const p of book.pages) {
    out.push([`page ${p.id} title`, p.title], [`page ${p.id} text`, p.text], [`page ${p.id} alt`, p.alt]);
    p.choices.forEach((c, i) => out.push([`page ${p.id} choice ${i + 1}`, c.text]));
  }
  return out.filter(([, s]) => s);
}

/** A stable fingerprint of one page (for "still as Oomba left it"). */
export const pageHash = p => (p ? JSON.stringify([p.title, p.text, p.end, p.choices, p.pic, p.upload, p.alt]) : '');
