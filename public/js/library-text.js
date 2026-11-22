// Story Library: how a page's text is cut into sentences and words, shared by the reader (public/js/library.js) and
// the server (server/routes/tts.js ctx 'story', which reads sentence s of page p by its numbers). Both sides must cut
// the same way, so this file is the only place that does it.

/** A page's sentences: [{ text, start, end }] (offsets into the page text). A sentence ends at . ! ? or … (with any
 *  closing quote after it) followed by a space, and at every line break. */
export function sentences(text) {
  const s = String(text || '');
  const out = [];
  const re = /[^\n]+/g;
  let m;
  while ((m = re.exec(s))) {
    const line = m[0], base = m.index;
    const cut = /[.!?…]+["”’')]*(?=\s+\S)/g;
    let from = 0, c;
    while ((c = cut.exec(line))) {
      const end = c.index + c[0].length;
      push(out, line, base, from, end);
      from = end;
    }
    push(out, line, base, from, line.length);
  }
  return out;
}
function push(out, line, base, from, to) {
  const part = line.slice(from, to);
  const lead = part.length - part.trimStart().length;
  const text = part.trim();
  if (/[\p{L}\p{N}]/u.test(text)) out.push({ text, start: base + from + lead, end: base + from + lead + text.length });
}

/** A page's words and the spaces between them: [{ text, start, word: bool }], to draw the page as spans. */
export function tokens(text) {
  const s = String(text || '');
  return Array.from(s.matchAll(/\s+|[^\s]+/g), m => ({ text: m[0], start: m.index, word: !/^\s/.test(m[0]) }));
}

/**
 * The reader's page dots for a long book (owner's choice, 20 Nov 2026): a book of more than `limit` pages shows a
 * window of `size` dots that slides with the reader, "…" on a side with more pages, so the dots stay on one line (the
 * 50-page Velveteen Rabbit wrapped onto two). Shorter books show every dot. `last` is the furthest page on screen
 * (the right-hand page of a spread). Returns the dots to show, from (inclusive) to (exclusive), 0-based.
 */
export const DOTS = Object.freeze({ limit: 24, size: 13 });
export function dotWindow(n, last, { limit = DOTS.limit, size = DOTS.size } = {}) {
  if (n <= limit) return { from: 0, to: n, sliding: false };
  const from = Math.max(0, Math.min(n - size, Math.min(last, n) - 1 - Math.floor(size / 2)));
  return { from, to: from + size, sliding: true };
}
