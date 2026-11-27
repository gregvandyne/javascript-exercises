// Grammar Lab's sentence words: one cut, shared by the build (scripts/grammar-lab-build.js, which stores each answer as
// word places in this cut), the server's grading (services/grammar-lab.js) and the page (the server sends the cut, so
// the page never cuts a sentence itself). Pure code, no imports.

/** A sentence -> its tokens [{ t, pre, post }]: t the word as written (letters, digits, inner apostrophes and hyphens),
 *  pre and post the marks stuck to it ("Hello," -> t Hello, post ","). Every token is a tappable word. */
export function tokenize(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).map(chunk => {
    const m = /^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u.exec(chunk);
    return m && m[2] ? { t: m[2], pre: m[1], post: m[3] } : { t: chunk, pre: '', post: '' };
  });
}
/** A word as compared: lower case, curly apostrophes made straight. */
export const norm = w => String(w || '').toLowerCase().replace(/[‘’]/g, "'");
/** Every place a word (or a run of words, "a lot") sits in a sentence's tokens: [[i, j, ...], ...]. */
export function findWords(tokens, phrase) {
  const want = String(phrase || '').trim().split(/\s+/).map(w => norm(w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))).filter(Boolean);
  const out = [];
  if (!want.length) return out;
  for (let i = 0; i + want.length <= tokens.length; i++) {
    if (want.every((w, k) => norm(tokens[i + k].t) === w)) out.push(want.map((_, k) => i + k));
  }
  return out;
}
/** Does a text use this word (whole word, any case)? */
export const hasWord = (text, word) => findWords(tokenize(text), word).length > 0;
/** A typed sentence as compared (a fix typed by the student, and every accepted fix): curly quotes and apostrophes made
 *  straight, spaces run together, nothing at the ends. Capitals and marks count: they are what a fix is about. */
export const normTyped = s => String(s || '').replace(/[“”„‟″]/g, '"').replace(/[‘’‛′]/g, "'").replace(/\s+/g, ' ').trim();
