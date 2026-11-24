// Word Hunt's Print (BRB.print, docs/sdk.md "Printing"): as Crossword's (services/crossword-print.js), the game sends
// its puzzle as plain data and the play page asks POST /api/games/:id/print, which checks it here and answers with the
// printable page. Never HTML or letters from the game: the words and options (as a question set's: cleanHuntItems, so
// every word and the title pass the site's text filter), and the server makes the grid itself with the game's own
// puzzle code (the `word-hunt-core` block of seed-games/word-hunt.html, run here with node:vm), so every letter printed
// is the server's, the filler letters pass the game's blocklist check, and the page matches what students see. The
// answer key (the words ringed on the grid, on a page of its own) is for teachers only (the route checks who asks).
// note: the teacher's own instructions, printed above the grid (never on the key).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { cleanHuntItems, SET_ID } from './game-sets.js';
import { cleanPrintNote } from './print-note.js';

export const PRINT = { bytes: 8000 };
const KEYS = new Set(['t', 'w', 's', 'd', 'r', 'b', 'key', 'set', 'note']);
const FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../seed-games/word-hunt.html');
let core = null, coreAt = 0;
/** The game's puzzle code (HuntCore), loaded once from the game's own file (again when the file changes). */
export function huntCore() {
  const at = fs.statSync(FILE).mtimeMs;
  if (core && coreAt === at) return core;
  const src = fs.readFileSync(FILE, 'utf8');
  const a = src.indexOf('/* word-hunt-core:begin */'), b = src.indexOf('/* word-hunt-core:end */');
  if (a < 0 || b < a) throw new Error('word-hunt-core not found');
  const box = { window: {} };
  vm.runInNewContext(src.slice(a, b), box, { timeout: 2000 });
  core = box.window.HuntCore; coreAt = at;
  return core;
}

/** The game's print request -> { ok: true, doc: { t, w, s, d, r, b, key, set, size, grid, words, unplaced, note? } } or
 *  { ok: false, code: 'bad' }. Strict: unknown keys or any word or title the filter refuses, and it is turned down. */
export function cleanHuntPrintDoc(raw) {
  const no = { ok: false, code: 'bad' };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return no;
  let size; try { size = JSON.stringify(raw).length; } catch { return no; }
  if (size > PRINT.bytes || Object.keys(raw).some(k => !KEYS.has(k))) return no;
  if (raw.key !== undefined && typeof raw.key !== 'boolean') return no;
  if (raw.b !== undefined && typeof raw.b !== 'boolean') return no;
  if (raw.set !== undefined && raw.set !== '' && !(typeof raw.set === 'string' && SET_ID.test(raw.set))) return no;
  if (raw.r !== undefined && !(Number.isInteger(raw.r) && raw.r >= 1 && raw.r <= 999999)) return no;
  const note = cleanPrintNote(raw.note);
  if (note === null) return no;
  const items = cleanHuntItems([{ t: raw.t || '', w: raw.w, s: raw.s, d: raw.d, r: raw.r, b: raw.b }]);
  if (!items) return no;
  const it = items[0], L = huntCore().layout(it.w, { s: it.s, d: it.d, r: it.r });
  return {
    ok: true,
    doc: {
      ...it, key: raw.key === true, set: raw.set || '', size: L.size, grid: L.grid.map(r => [...r]),
      words: L.words.map(w => ({ word: w.word, start: [...w.start], end: [...w.end] })), unplaced: [...L.unplaced],
      ...(note ? { note } : {}),
    },
  };
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const U = 10;   // one square, in the picture's own units

/** The grid as a picture (SVG scales to the page without blur), with the words ringed for the answer key. */
function gridSvg(doc, { ring, label }) {
  const n = doc.size, out = [`<rect class="whp-frame" x="1" y="1" width="${n * U}" height="${n * U}" rx="3"/>`];
  if (ring) for (const w of doc.words) {
    const x1 = 1 + (w.start[1] + 0.5) * U, y1 = 1 + (w.start[0] + 0.5) * U, x2 = 1 + (w.end[1] + 0.5) * U, y2 = 1 + (w.end[0] + 0.5) * U;
    out.push(`<line class="whp-ring" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`);
  }
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    out.push(`<text class="whp-l" x="${1 + (c + 0.5) * U}" y="${1 + (r + 0.5) * U + 0.3}" text-anchor="middle" dominant-baseline="central">${esc(doc.grid[r][c])}</text>`);
  }
  return `<svg class="whp-grid" viewBox="0 0 ${n * U + 2} ${n * U + 2}" role="img" aria-label="${esc(label)}" data-size="${n}" xmlns="http://www.w3.org/2000/svg">${out.join('')}</svg>`;
}

/** The printable page (a fragment for the play page's print area): the puzzle, and the answer key on a page of its own
 *  after it when asked. t: the viewer's language (req.t); dir: its direction; lang: its code; code / link: the saved
 *  set's class code and link (only for a set that is on Oomba). */
export function huntPrintHtml(doc, { t, dir = 'ltr', lang = 'en', code = '', link = '' }) {
  const title = doc.t || t('play.printHunt.untitled');
  const placed = doc.words.map(w => w.word).sort((a, b) => a.localeCompare(b));
  const list = `<section class="whp-words"><h2>${esc(t('play.printHunt.find'))}</h2><ul>${placed.map(w => `<li dir="auto"><i class="whp-box" aria-hidden="true"></i>${esc(w)}</li>`).join('')}</ul></section>`;
  const hidden = `<p class="whp-hidden">${esc(t('play.printHunt.hidden', { n: placed.length }))}</p>`;
  const foot = `<footer class="cwp-foot"><span>${esc(t('play.print.made'))}</span>${code ? `<span>${esc(t('play.print.code', { code }))}</span>` : ''}${link ? `<span dir="ltr" class="cwp-link">${esc(link)}</span>` : ''}</footer>`;
  const how = `<p class="whp-how">${esc(t(`play.printHunt.how.${doc.d}`))}</p>`;
  const puzzle = `<section class="cwp-page whp-puzzle">
<header class="cwp-head"><h1 dir="auto">${esc(title)}</h1><p class="cwp-lines"><span class="cwp-line">${esc(t('play.print.name'))}<i class="cwp-blank cwp-blank-name"></i></span><span class="cwp-line">${esc(t('play.print.date'))}<i class="cwp-blank"></i></span></p></header>
${doc.note ? `<p class="cwp-mine whp-mine" dir="auto">${esc(doc.note)}</p>` : ''}${how}<div class="cwp-gridbox whp-gridbox" dir="ltr">${gridSvg(doc, { ring: false, label: t('play.printHunt.grid') })}</div>
${doc.b ? list : hidden}
${foot}</section>`;
  const key = doc.key ? `<section class="cwp-page whp-key">
<header class="cwp-head"><h1 dir="auto">${esc(t('play.print.keyTitle', { title }))}</h1></header>
<div class="cwp-gridbox whp-gridbox" dir="ltr">${gridSvg(doc, { ring: true, label: t('play.print.key') })}</div>
${list}
${foot}</section>` : '';
  return `<div class="cwp whp" lang="${esc(lang)}" dir="${dir === 'rtl' ? 'rtl' : 'ltr'}">${puzzle}${key}</div>`;
}
