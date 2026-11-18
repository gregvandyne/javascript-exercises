// Crossword's Print (BRB.print, docs/sdk.md "Printing"): the game can't print (its frame is sandboxed with no
// allow-modals), so it sends the puzzle as plain data and the play page asks POST /api/games/:id/print, which checks it
// here and answers with the printable page the play page prints. Never HTML from the game: the words and clues (as a
// question set's: cleanCrossItems, so every word, clue and the title pass the site's text filter), the word bank
// option and the layout as numbers only ({ w, h, e: [[word index, 'a'|'d', row, col]] }). The letters of the grid are
// the words' own, put down here, so a layout that doesn't spell its words (two letters in one square) is refused; the
// clue numbers are counted here in reading order, as the game counts them. The answer key is for teachers only (the
// route checks who asks).
import { cleanCrossItems, crossLetters, SET_ID } from './game-sets.js';

export const PRINT = { side: 25, bytes: 20000 };
const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const KEYS = new Set(['t', 'w', 'b', 'g', 'key', 'set']);

/** The game's print request -> { ok: true, doc: { t, w, b, key, set, W, H, grid, nums, across, down, rtl } } or
 *  { ok: false, code: 'bad' }. Strict: unknown keys, a bad layout or any text the filter refuses, and it is turned down. */
export function cleanPrintDoc(raw) {
  const no = { ok: false, code: 'bad' };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return no;
  let size; try { size = JSON.stringify(raw).length; } catch { return no; }
  if (size > PRINT.bytes || Object.keys(raw).some(k => !KEYS.has(k))) return no;
  if (raw.t !== undefined && typeof raw.t !== 'string') return no;
  if (raw.b !== undefined && typeof raw.b !== 'boolean') return no;
  if (raw.key !== undefined && typeof raw.key !== 'boolean') return no;
  if (raw.set !== undefined && raw.set !== '' && !(typeof raw.set === 'string' && SET_ID.test(raw.set))) return no;
  const items = cleanCrossItems([{ t: raw.t || '', w: raw.w, r: 1, b: raw.b === true, h: true }]);
  if (!items) return no;
  const { t, w } = items[0];
  const g = raw.g;
  if (!g || typeof g !== 'object' || Array.isArray(g) || Object.keys(g).some(k => !['w', 'h', 'e'].includes(k))) return no;
  const W = g.w, H = g.h, side = n => Number.isInteger(n) && n >= 1 && n <= PRINT.side;
  if (!side(W) || !side(H) || !Array.isArray(g.e) || !g.e.length || g.e.length > w.length) return no;
  const grid = Array.from({ length: H }, () => Array(W).fill(null)), owner = {}, used = new Set(), entries = [];
  for (const e of g.e) {
    if (!Array.isArray(e) || e.length !== 4) return no;
    const [i, dir, r, c] = e;
    if (!Number.isInteger(i) || i < 0 || i >= w.length || used.has(i) || (dir !== 'a' && dir !== 'd')) return no;
    if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || c < 0 || r >= H || c >= W) return no;
    const L = [...crossLetters(w[i][0])];
    if ((dir === 'a' ? c : r) + L.length > (dir === 'a' ? W : H)) return no;
    for (let j = 0; j < L.length; j++) {
      const rr = dir === 'd' ? r + j : r, cc = dir === 'a' ? c + j : c, k = `${rr},${cc}`;
      if (grid[rr][cc] !== null && grid[rr][cc] !== L[j]) return no;
      const o = owner[k] || (owner[k] = {});
      if (o[dir]) return no;   // two words the same way in one square
      o[dir] = 1; grid[rr][cc] = L[j];
    }
    used.add(i); entries.push({ i, dir, r, c, len: L.length, num: 0 });
  }
  // Numbers in reading order: a square that starts a word (across or down) gets the next number.
  const starts = {}, nums = {};
  for (const e of entries) (starts[`${e.r},${e.c}`] ||= []).push(e);
  let n = 0;
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (starts[`${r},${c}`]) { n++; nums[`${r},${c}`] = n; for (const e of starts[`${r},${c}`]) e.num = n; }
  const list = dir => entries.filter(e => e.dir === dir).sort((a, b) => a.num - b.num).map(e => ({ n: e.num, clue: w[e.i][1], len: e.len }));
  let rtlN = 0, all = 0;
  for (const e of entries) for (const ch of crossLetters(w[e.i][0])) { all++; if (RTL.test(ch)) rtlN++; }
  return {
    ok: true,
    doc: {
      t, w, b: raw.b === true, key: raw.key === true, set: raw.set || '', W, H, grid, nums,
      across: list('a'), down: list('d'), bank: entries.map(e => w[e.i][0]).sort((a, b) => a.localeCompare(b)), rtl: all > 0 && rtlN * 2 > all,
    },
  };
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const U = 10;   // one square, in the picture's own units

/** The grid as a picture (SVG scales to the page without blur): squares with their clue numbers, and with the letters
 *  for the answer key. A right-to-left puzzle (Hebrew, Arabic words) runs right to left, as it does in the game. */
function gridSvg(doc, { letters, label }) {
  const { W, H, grid, nums, rtl } = doc, out = [];
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (!grid[r][c]) continue;
    const x = (rtl ? W - 1 - c : c) * U + 1, y = r * U + 1, num = nums[`${r},${c}`];
    out.push(`<rect x="${x}" y="${y}" width="${U}" height="${U}"/>`);
    if (num) out.push(`<text class="cwp-n" x="${rtl ? x + U - 0.8 : x + 0.8}" y="${y + 3.3}"${rtl ? ' text-anchor="end"' : ''}>${num}</text>`);
    if (letters) out.push(`<text class="cwp-l" x="${x + U / 2}" y="${y + U / 2 + 0.4}" text-anchor="middle" dominant-baseline="central">${esc(grid[r][c])}</text>`);
  }
  return `<svg class="cwp-grid" viewBox="0 0 ${W * U + 2} ${H * U + 2}" role="img" aria-label="${esc(label)}" data-cols="${W}" data-rows="${H}" xmlns="http://www.w3.org/2000/svg">${out.join('')}</svg>`;
}

/** The printable page (a fragment for the play page's print area): the puzzle on its own page(s), and the answer key
 *  on a page of its own after it when asked. t: the viewer's language (req.t); dir: its direction; lang: its code;
 *  code / link: the saved set's class code and link (only for a set that is on Oomba). */
export function printHtml(doc, { t, dir = 'ltr', lang = 'en', code = '', link = '' }) {
  const title = doc.t || t('play.print.untitled');
  const clues = (dir2, items) => items.length ? `<section class="cwp-list"><h2>${esc(t(dir2 === 'a' ? 'play.print.across' : 'play.print.down'))}</h2><ol>${items.map(x => `<li><b class="cwp-num">${x.n}</b><span dir="auto">${esc(x.clue)} (${x.len})</span></li>`).join('')}</ol></section>` : '';
  const foot = `<footer class="cwp-foot"><span>${esc(t('play.print.made'))}</span>${code ? `<span>${esc(t('play.print.code', { code }))}</span>` : ''}${link ? `<span dir="ltr" class="cwp-link">${esc(link)}</span>` : ''}</footer>`;
  const gridDir = doc.rtl ? 'rtl' : 'ltr';
  const puzzle = `<section class="cwp-page cwp-puzzle">
<header class="cwp-head"><h1 dir="auto">${esc(title)}</h1><p class="cwp-lines"><span class="cwp-line">${esc(t('play.print.name'))}<i class="cwp-blank cwp-blank-name"></i></span><span class="cwp-line">${esc(t('play.print.date'))}<i class="cwp-blank"></i></span></p></header>
<div class="cwp-gridbox" dir="${gridDir}">${gridSvg(doc, { letters: false, label: t('play.print.grid') })}</div>
<div class="cwp-clues">${clues('a', doc.across)}${clues('d', doc.down)}</div>
${doc.b ? `<section class="cwp-bank"><h2>${esc(t('play.print.bank'))}</h2><ul>${doc.bank.map(x => `<li dir="auto">${esc(x)}</li>`).join('')}</ul></section>` : ''}
${foot}</section>`;
  const key = doc.key ? `<section class="cwp-page cwp-key">
<header class="cwp-head"><h1 dir="auto">${esc(t('play.print.keyTitle', { title }))}</h1></header>
<div class="cwp-gridbox" dir="${gridDir}">${gridSvg(doc, { letters: true, label: t('play.print.key') })}</div>
${foot}</section>` : '';
  return `<div class="cwp" lang="${esc(lang)}" dir="${dir === 'rtl' ? 'rtl' : 'ltr'}">${puzzle}${key}</div>`;
}
