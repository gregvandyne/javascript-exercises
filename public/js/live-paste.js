// Question-set limits and the "Paste questions" reader for the editor (public/js/live-sets.js). No imports, so the
// unit tests can load it (tests/unit/live-sets-editor.test.js).
// Limits match server/services/classlive-sets.js (LIMITS, SECS); the server checks everything again.
export const SECS = [5, 10, 15, 20, 30, 45, 60, 90, 120];
export const MAX = { items: 100, q: 300, choice: 120, cat: 40 };
const NUMBERING = /^\s*(?:(?:q(?:uestion)?\s*)?\d+\s*[.):-]|[-•])\s+/i;
const ANSWER_MARK = /^\s*(?:[a-d][.)]|\d+[.)]|[-•])\s+/i;
/**
 * Questions pasted from a spreadsheet or a document -> [{ q, choices, answer, secs, cat? }].
 * Spreadsheet rows (tab-separated): question, right answer, wrong answers (1-3), then seconds (optional). When the
 * header row starts with a "Category" column, each row starts with its category (Brain Board's column headings).
 * Text: one block per question, separated by an empty line: the question, then 2-4 answers, one per line; the right
 * answer starts or ends with * (else the first answer is right). Numbering like "1." or "a)" is dropped. A line
 * starting with # names the category for the questions after it ("# Planets").
 */
export function parsePasted(text, { header = 'question', catHeader = 'category' } = {}) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const clip = (v, n) => String(v || '').trim().slice(0, n);
  const out = [];
  if (lines.some(l => l.includes('\t'))) {
    let withCat = false, first = true;
    for (const line of lines) {
      const cells = line.split('\t').map(c => c.trim());
      while (cells.length && !cells[cells.length - 1]) cells.pop();
      if (cells.length < 3) continue;
      if (first && !out.length) {   // a header row
        first = false;
        const h = cells[0].toLowerCase();
        if ([catHeader.toLowerCase(), 'category', 'cat'].includes(h)) { withCat = true; continue; }
        if ([header.toLowerCase(), 'question', 'q'].includes(h)) continue;
      }
      const cat = withCat ? clip(cells.shift(), MAX.cat) : '';
      if (cells.length < 3) continue;
      let secs = 20;
      const last = cells[cells.length - 1];
      if (cells.length >= 4 && /^\d+$/.test(last) && SECS.includes(+last)) { secs = +last; cells.pop(); }
      const [q, right, ...wrong] = cells;
      const choices = [right, ...wrong.filter(Boolean)].slice(0, 4).map(c => clip(c, MAX.choice));
      if (q && choices.length >= 2) out.push({ q: clip(q, MAX.q), choices, answer: 0, secs, ...(cat ? { cat } : {}) });
    }
  } else {
    let cat = '';
    for (const block of lines.join('\n').split(/\n\s*\n/)) {
      const rows = block.split('\n').map(r => r.trim()).filter(Boolean);
      while (rows.length && /^#/.test(rows[0])) cat = clip(rows.shift().replace(/^#+\s*/, ''), MAX.cat);
      if (rows.length < 3) continue;
      const q = clip(rows[0].replace(NUMBERING, ''), MAX.q);
      let answer = 0;
      const choices = rows.slice(1, 5).map((r, i) => {
        let v = r.replace(ANSWER_MARK, '');
        if (/^\*|\*$/.test(v)) { answer = i; v = v.replace(/^\*\s*|\s*\*$/g, ''); }
        return clip(v.replace(ANSWER_MARK, ''), MAX.choice);
      });
      if (q && choices.filter(Boolean).length >= 2) out.push({ q, choices, answer, secs: 20, ...(cat ? { cat } : {}) });
    }
  }
  return out.slice(0, MAX.items);
}

