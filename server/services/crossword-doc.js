// Crossword's "Upload a word list (PDF or Word)": a teacher's file -> words and short clues for the puzzle editor's
// list, which the teacher checks before saving (docs/decisions.md "Crossword: word lists from a PDF or Word file, with
// limits"). Kept cheap and small:
//   - at most 2 MB, a PDF of at most 5 pages; the text read is capped at about 5 pages (15,000 characters) and what
//     comes after is cut off (the teacher is told);
//   - the text is read here (services/docx-text.js, services/pdf-text.js). When it is already a plain "word - definition"
//     list it is used as it is, with no AI at all. Otherwise one small model call (set-ai.js draftWordsFromDoc, the
//     question-set editors' own) takes out the vocabulary; a PDF whose text can't be read here goes to it as the file;
//   - a PDF with no text at all (a scanned picture) is turned away before any AI;
//   - at most 30 words, each one the crossword takes (cleanCrossItems' rules), every word and clue through the site's
//     text filter (no rude words, personal details or links: a clue that fails is left empty, a word that fails is left
//     out), and never a clue that gives its word away.
// The file is never stored or logged; only the words go back to the editor.
import { docxText } from './docx-text.js';
import { pdfInfo } from './pdf-text.js';
import { draftWordsFromDoc } from './set-ai.js';
import { CROSS, crossLetters } from './game-sets.js';
import { cleanText } from './textfilter.js';

export const LIMITS = { bytes: 2 * 1024 * 1024, pages: 5, chars: 15000, words: CROSS.max, perDay: 10 };
/** Tests put a stand-in for the model here (undefined: the real one, through builder/anthropic.js). */
export const hooks = { client: undefined };

const CROSS_WORD = /^[\p{L}\p{M}][\p{L}\p{M} '’-]*$/u;
const key = w => String(w || '').toLocaleLowerCase().replace(/[^\p{L}\p{M}]/gu, '');
/** May this be a crossword word (cleanCrossItems' rules)? */
export const okWord = w => !!w && w.length <= CROSS.word && CROSS_WORD.test(w) && [...crossLetters(w)].length >= 2;

/** Words and clues from anywhere -> the ones the crossword takes: [[word, clue]], at most 30, no word twice, through
 *  the text filter (a word that fails is left out, a clue that fails or gives its word away is left empty). */
export function cleanWords(pairs) {
  const out = [], seen = new Set();
  for (const p of Array.isArray(pairs) ? pairs : []) {
    if (!Array.isArray(p)) continue;
    const w = String(p[0] || '').normalize('NFC').replace(/\s+/g, ' ').trim();
    if (!okWord(w) || seen.has(crossLetters(w))) continue;
    const cw = cleanText(w, CROSS.word);
    if (!cw.ok || cw.value !== w) continue;
    let c = String(p[1] || '').replace(/\s+/g, ' ').trim().slice(0, CROSS.clue);
    const cc = cleanText(c, CROSS.clue);
    c = cc.ok ? cc.value : '';
    if (key(w).length >= 3 && key(c).includes(key(w))) c = '';
    seen.add(crossLetters(w)); out.push([w, c]);
    if (out.length >= LIMITS.words) break;
  }
  return out;
}

const HEAD = /^(words?|terms?|vocab(ulary)?( words?)?|answers?)\s*[,;:\t|–—-]?\s*(definitions?|clues?|meanings?|hints?)?\s*$/i;
/**
 * The no-AI path: text that is already a plain list, a word and its definition a line (after a tab, " - ", " – ",
 * " — ", ":", "=" or "|"; bullets and numbers in front dropped; a header row skipped; a definition that runs on to the
 * next line joined to it). -> { title, words: [[word, clue]] } when nearly every line is one, else null (the AI reads it).
 */
export function listFromText(text) {
  const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).map(l => l.replace(/[ \u00a0]+/g, ' ').replace(/ *\t[\t ]*/g, '\t').trim()).filter(Boolean).slice(0, 400);
  const pairs = [], before = [];
  let other = 0;
  for (const [i, line] of lines.entries()) {
    const s = line.replace(/^(?:[-*•·▪◦]\s+|\(?\d{1,3}[.)]\s+|[a-z][.)]\s+)/i, '').trim();
    if (!s || (i < 4 && HEAD.test(s))) continue;
    const m = /^(.{1,40}?)(?:\t|\s+[-–—]\s+|\s*[:=|：]\s*)(.+)$/.exec(s), w = m ? m[1].replace(/^["“]|["”]$/g, '').trim() : '';
    if (m && okWord(w) && w.split(' ').length <= 3) { pairs.push([w, m[2].trim()]); continue; }
    const prev = pairs[pairs.length - 1];
    // A definition that wraps on to the next line (a PDF breaks long lines): joined while it stays short. A line that
    // looks like a pair whose word the crossword can't take ("CO2 - a gas") is not a continuation.
    if (prev && !m && !/[.!?]$/.test(prev[1]) && (prev[1] + ' ' + s).length <= CROSS.clue) { prev[1] += ' ' + s; continue; }
    if (!pairs.length && before.length < 3) { before.push(s); continue; }
    other++;
  }
  if (pairs.length < 3 || other > Math.max(2, Math.floor(pairs.length * 0.2))) return null;
  const words = cleanWords(pairs.map(([w, c]) => [w, c.replace(/[;,]$/, '')]));
  if (words.length < 3) return null;
  const t = before.find(b => b.length <= 60 && !HEAD.test(b));
  const ct = t ? cleanText(t, 60) : null;
  return { title: ct && ct.ok ? ct.value : '', words };
}

/** At most LIMITS.chars of text, cut at a line's end when one is near. -> { text, cut } */
export function capText(text) {
  const s = String(text || '');
  if (s.length <= LIMITS.chars) return { text: s, cut: false };
  const head = s.slice(0, LIMITS.chars), nl = head.lastIndexOf('\n');
  return { text: nl > LIMITS.chars * 0.8 ? head.slice(0, nl) : head, cut: true };
}

/**
 * The teacher's file -> { ok: true, title, words: [[word, clue]], cut, ai } or { ok: false, code }.
 * kind 'pdf' | 'docx'; buf the file's bytes. Codes: docType (not that kind of file), docBig (over 2 MB), docPages (a
 * PDF over 5 pages), docScan (a PDF with no text, such as a scanned page), docBad (damaged or locked), docEmpty (no
 * text), docNone (no vocabulary in it), aiOff / aiFailed (the AI was needed and isn't there or failed).
 * focus: the teacher's own line for the AI ("Science words only"), already through the text filter (the route); only
 * the AI reads it (a plain list is used as it is).
 * onAi: called just before the model is asked (the route counts it).
 */
export async function wordsFromFile({ kind, buf, level = '', focus = '', locale = 'en', onAi = () => {} }) {
  if (!['pdf', 'docx'].includes(kind) || !Buffer.isBuffer(buf) || !buf.length) return { ok: false, code: 'docType' };
  if (buf.length > LIMITS.bytes) return { ok: false, code: 'docBig' };
  let text = null, pdf = null;
  if (kind === 'docx') {
    if (buf.readUInt32LE(0) !== 0x04034b50) return { ok: false, code: 'docType' };
    text = docxText(buf);
    if (text === null) return { ok: false, code: 'docBad' };
    if (text.trim().length < 3) return { ok: false, code: 'docEmpty' };
  } else {
    if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') return { ok: false, code: 'docType' };
    const info = pdfInfo(buf);
    if (!info || info.encrypted) return { ok: false, code: 'docBad' };
    if (info.pages > LIMITS.pages) return { ok: false, code: 'docPages' };
    if (!info.fonts || info.text === '') return { ok: false, code: 'docScan' };
    if (info.text === null) pdf = buf; else text = info.text;
  }
  let cut = false;
  if (text !== null) ({ text, cut } = capText(text));
  const list = text !== null ? listFromText(text) : null;
  if (list) return { ok: true, title: list.title, words: list.words, cut, ai: false };
  onAi();
  let r;
  try { r = await draftWordsFromDoc({ text: text || '', pdf, level, focus, locale, client: hooks.client }); } catch { r = { ok: false, code: 'aiFailed' }; }
  if (!r.ok) return r;
  const words = cleanWords(r.words);
  if (!words.length) return { ok: false, code: 'docNone' };
  const ct = cleanText(r.title || '', CROSS.title);
  return { ok: true, title: ct.ok ? ct.value : '', words, cut, ai: true };
}

/**
 * Mistake Hunt's "Upload a passage" (docs/decisions.md "Mistake Hunt"): the text of a teacher's PDF or Word file, read
 * here with the same readers and limits as Crossword's word lists (2 MB, a PDF of at most 5 pages, about 5 pages of
 * text), and no AI at all: the teacher reads it in the builder before planting. A PDF whose text can't be read here
 * (a scanned page, a font with no map) is turned away. -> { ok: true, text, cut } or { ok: false, code } (as wordsFromFile).
 * The file is never stored or logged.
 */
export function textFromFile({ kind, buf }) {
  if (!['pdf', 'docx'].includes(kind) || !Buffer.isBuffer(buf) || !buf.length) return { ok: false, code: 'docType' };
  if (buf.length > LIMITS.bytes) return { ok: false, code: 'docBig' };
  let text;
  if (kind === 'docx') {
    if (buf.readUInt32LE(0) !== 0x04034b50) return { ok: false, code: 'docType' };
    text = docxText(buf);
    if (text === null) return { ok: false, code: 'docBad' };
  } else {
    if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') return { ok: false, code: 'docType' };
    const info = pdfInfo(buf);
    if (!info || info.encrypted) return { ok: false, code: 'docBad' };
    if (info.pages > LIMITS.pages) return { ok: false, code: 'docPages' };
    if (!info.fonts || !info.text) return { ok: false, code: 'docScan' };
    text = info.text;
  }
  if (String(text).trim().length < 3) return { ok: false, code: 'docEmpty' };
  return { ok: true, ...capText(text) };
}
