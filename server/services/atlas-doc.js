// Atlas Quest's "Upload a geography lesson" (docs/decisions.md "Atlas Quest in Crossword's look"): a teacher's PDF,
// Word (.docx) or text file -> quiz questions the AI drafts from it, for the quiz maker's list, which the teacher checks
// before saving. The same readers and limits as Crossword's word lists (services/crossword-doc.js): at most 2 MB, a PDF
// of at most 5 pages, about 5 pages of text read (the rest cut off and the teacher told), a scanned PDF turned away
// before any AI, 10 files a day (the route's counter). One small model call (set-ai.js draftGeoQuiz). Every question's
// country is an ISO code from the game's own list; the teacher's words (a question, its answer, the title) go through
// the site's text filter here (a question that fails is left out), and again when the quiz is saved. The file is never
// stored or logged; only the questions go back to the editor.
import { docxText } from './docx-text.js';
import { pdfInfo } from './pdf-text.js';
import { draftGeoQuiz, GEO } from './set-ai.js';
import { capText, LIMITS } from './crossword-doc.js';
import { cleanText } from './textfilter.js';
import { codes, NO_CAP_Q } from '../live/atlas.js';

/** Tests put a stand-in for the model here (undefined: the real one, through builder/anthropic.js). */
export const hooks = { client: undefined };

/**
 * The teacher's lesson -> { ok: true, title, words: [[question, answer] | ['@kind', code]], cut, ai: true } or
 * { ok: false, code } (crossword-doc.js wordsFromFile's codes). `words` is the shape BRB.wordsFromDoc already carries:
 * a question of the teacher's kind is [question, answer]; a country question the game asks itself is ['@map', 'FR'].
 */
export async function quizFromFile({ kind, buf, level = '', locale = 'en' }) {
  if (!['pdf', 'docx', 'txt'].includes(kind) || !Buffer.isBuffer(buf) || !buf.length) return { ok: false, code: 'docType' };
  if (buf.length > LIMITS.bytes) return { ok: false, code: 'docBig' };
  let text = null, pdf = null;
  if (kind === 'docx') {
    if (buf.readUInt32LE(0) !== 0x04034b50) return { ok: false, code: 'docType' };
    text = docxText(buf);
    if (text === null) return { ok: false, code: 'docBad' };
  } else if (kind === 'txt') {
    text = buf.toString('utf8').replace(/^﻿/, '');
    if (text.includes('\u0000')) return { ok: false, code: 'docType' };
  } else {
    if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') return { ok: false, code: 'docType' };
    const info = pdfInfo(buf);
    if (!info || info.encrypted) return { ok: false, code: 'docBad' };
    if (info.pages > LIMITS.pages) return { ok: false, code: 'docPages' };
    if (!info.fonts || info.text === '') return { ok: false, code: 'docScan' };
    if (info.text === null) pdf = buf; else text = info.text;
  }
  if (text !== null && text.trim().length < 3) return { ok: false, code: 'docEmpty' };
  let cut = false;
  if (text !== null) ({ text, cut } = capText(text));
  let r;
  try { r = await draftGeoQuiz({ text: text || '', pdf, level, locale, known: new Set(codes()), client: hooks.client }); } catch { r = { ok: false, code: 'aiFailed' }; }
  if (!r.ok) return r;
  const words = [];
  for (const it of r.items) {
    if (it[0] !== 'own') { if (!((it[0] === 'cap' || it[0] === 'capc') && NO_CAP_Q.has(it[1]))) words.push(['@' + it[0], it[1]]); continue; }
    const q = cleanText(it[1], GEO.q), a = cleanText(it[2], GEO.a);
    if (q.ok && a.ok && q.value && a.value) words.push([q.value, a.value]);
  }
  if (!words.length) return { ok: false, code: 'docNone' };
  const ct = cleanText(r.title || '', 60);
  return { ok: true, title: ct.ok ? ct.value : '', words, cut, ai: true, asked: Math.max(r.asked || 0, words.length) };
}
