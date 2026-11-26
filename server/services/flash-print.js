// Flashcards' Print (BRB.print, docs/sdk.md "Printing"): as Crossword's and Word Hunt's, the game sends its set as plain
// data and the play page asks POST /api/games/:id/print, which checks it here and answers with the printable page. Never
// HTML from the game: the cards go through cleanFlashItems (the site's text filter on every term, definition and the
// title; an emoji is only ever emoji characters).
// Two ways to print (doc.as):
//   'cards' cut-out cards, 8 a sheet (2 across, 4 down): a page of fronts (the term and its emoji) then a page of backs
//           (the definitions), each row swapped left to right, so printed on both sides (flip on the long edge) every
//           back lands behind its own front; dashed lines to cut along.
//   'list'  a study sheet: the terms and definitions in a two-column table, with Name and Date.
// There is no answer key: the cards are the answers. note: the teacher's own instructions, printed on the study sheet.
import { cleanFlashItems, SET_ID } from './game-sets.js';
import { cleanPrintNote } from './print-note.js';
import { cleanText } from './textfilter.js';

export const PRINT = { bytes: 16000, perSheet: 8 };
const KEYS = new Set(['t', 'c', 'a', 'as', 'set', 'note', 'key']);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** The game's print request -> { ok: true, doc: { t, c, as, set, note } } or { ok: false, code: 'bad' }. */
export function cleanFlashPrintDoc(raw) {
  const no = { ok: false, code: 'bad' };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return no;
  let size; try { size = JSON.stringify(raw).length; } catch { return no; }
  if (size > PRINT.bytes || Object.keys(raw).some(k => !KEYS.has(k))) return no;
  if (raw.key !== undefined && raw.key !== false) return no;   // no answer key: the cards are the answers
  const as = raw.as === undefined ? 'cards' : raw.as;
  if (as !== 'cards' && as !== 'list') return no;
  if (raw.set !== undefined && raw.set !== '' && (typeof raw.set !== 'string' || !SET_ID.test(raw.set))) return no;
  const items = cleanFlashItems([{ t: raw.t === undefined ? '' : raw.t, c: raw.c, ...(raw.a ? { a: raw.a } : {}) }]);
  if (!items) return no;
  let note = cleanPrintNote(raw.note);
  if (note === null) return no;
  if (note) { const cn = cleanText(note, 400); if (!cn.ok) return no; note = cn.value; }
  return { ok: true, doc: { t: items[0].t, c: items[0].c, as, set: raw.set || '', note, key: false } };
}

const foot = (t, code, link) => `<footer class="cwp-foot"><span>${esc(t('play.print.made'))}</span>${code ? `<span>${esc(t('play.print.code', { code }))}</span>` : ''}${link ? `<span dir="ltr" class="cwp-link">${esc(link)}</span>` : ''}</footer>`;
const face = (text, pic, cls) => `<div class="fcp-card ${cls}">${pic ? `<span class="fcp-pic" aria-hidden="true">${esc(pic)}</span>` : ''}<span class="fcp-text" dir="auto">${esc(text)}</span></div>`;

export function flashPrintHtml(doc, { t, dir = 'ltr', lang = 'en', code = '', link = '' }) {
  const title = doc.t || t('play.printFlash.untitled');
  const head = `<header class="cwp-head"><h1 dir="auto">${esc(title)}</h1><p class="cwp-lines"><span class="cwp-line">${esc(t('play.print.name'))}<i class="cwp-blank cwp-blank-name"></i></span><span class="cwp-line">${esc(t('play.print.date'))}<i class="cwp-blank"></i></span></p></header>`;
  let body;
  if (doc.as === 'list') {
    body = `<section class="cwp-page fcp-sheet">${head}${doc.note ? `<p class="cwp-mine" dir="auto">${esc(doc.note)}</p>` : ''}
<table class="fcp-table"><thead><tr><th scope="col">${esc(t('play.printFlash.term'))}</th><th scope="col">${esc(t('play.printFlash.def'))}</th></tr></thead><tbody>${doc.c.map(([w, d, p]) => `<tr><td dir="auto">${p ? `<span aria-hidden="true">${esc(p)}</span> ` : ''}<b>${esc(w)}</b></td><td dir="auto">${esc(d)}</td></tr>`).join('')}</tbody></table>
${foot(t, code, link)}</section>`;
  } else {
    const pages = [];
    for (let i = 0; i < doc.c.length; i += PRINT.perSheet) {
      const chunk = doc.c.slice(i, i + PRINT.perSheet);
      while (chunk.length % 2) chunk.push(null);
      const fronts = chunk.map(x => (x ? face(x[0], x[2], 'fcp-front') : '<div class="fcp-card fcp-blank"></div>')).join('');
      // the backs: each row's two cards swapped, so a long-edge double-sided print puts every back behind its front
      const backs = [];
      for (let r = 0; r < chunk.length; r += 2) backs.push(chunk[r + 1], chunk[r]);
      pages.push(`<section class="cwp-page fcp-cards">${i ? '' : `<p class="fcp-how">${esc(t('play.printFlash.how'))}</p>`}<p class="fcp-side">${esc(t('play.printFlash.fronts', { title }))}</p><div class="fcp-grid">${fronts}</div>${foot(t, code, link)}</section>`);
      pages.push(`<section class="cwp-page fcp-cards"><p class="fcp-side">${esc(t('play.printFlash.backs', { title }))}</p><div class="fcp-grid" dir="ltr">${backs.map(x => (x ? face(x[1], '', 'fcp-back') : '<div class="fcp-card fcp-blank"></div>')).join('')}</div></section>`);
    }
    body = pages.join('');
  }
  return `<div class="cwp fcp" lang="${esc(lang)}" dir="${dir === 'rtl' ? 'rtl' : 'ltr'}">${body}</div>`;
}
