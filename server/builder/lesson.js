// "Your lesson" (/build/new, a classroom activity's second step; docs/decisions.md "Your lesson: upload and describe"):
// the teacher's lesson plan or worksheet, read on the server, and the child-safety rules for everything they type or
// add there. Hard rules:
//   - The file is read here and never kept: not on disk, not in the database, not in a log. Only its text goes back to
//     the page (cut to LESSON.doc characters), which keeps it with the other setup choices until "Open the Builder".
//   - Before any of it can reach the model, scrub() takes out the names of the students in this teacher's classes (the
//     class roster's names, the students' display names and usernames, and the Google Classroom students still waiting
//     to join), matched case-insensitively on word boundaries, and puts "[student]" in their place; emails, phone
//     numbers and links go too. It runs on the upload, on the plan summary and again when the build starts (runner.js),
//     because the page sends the text back.
//   - The Builder's keyword pre-filter (screen.js prefilter: rude words, attempts to change the rules, chat, collecting
//     personal details) runs on all of it; text that fails is not used.
// Reading reuses Crossword's readers and limits (services/docx-text.js, services/pdf-text.js, crossword-doc.js capText's
// idea): no new library, no AI. A PDF whose text cannot be read here (a scan, a font without a map) is turned away: the
// file never goes to the model.
import fs from 'node:fs';
import { q } from '../db.js';
import * as S from '../services/schools.js';
import { docxText } from '../services/docx-text.js';
import { pdfInfo } from '../services/pdf-text.js';
import { LIMITS as CROSSWORD } from '../services/crossword-doc.js';
import { prefilter } from './screen.js';
import { LESSON, cleanBlock, isActivity } from './plan.js';

/** The upload's limits: Word, text and Markdown up to 5 MB; a PDF up to 5 MB and 10 pages (twice Crossword's 5: a lesson
 *  plan is longer than a word list); 20 files read a day per teacher (Crossword's 10 a day, doubled for the same reason:
 *  no AI is used here). The text kept is LESSON.doc characters. */
export const FILE_LIMITS = { bytes: 5 * 1024 * 1024, pages: CROSSWORD.pages * 2, perDay: CROSSWORD.perDay * 2, chars: LESSON.doc };
export const FILE_KINDS = ['pdf', 'docx', 'txt', 'md'];
/** What the file input offers (Google Docs: File, Download, .docx or .pdf). */
export const FILE_ACCEPT = '.pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown';

/** A file's kind from its name -> 'pdf' | 'docx' | 'txt' | 'md' | null (an old .doc, a picture, anything else). */
export const kindOf = name => { const m = /\.([a-z0-9]{1,8})$/i.exec(String(name || '').trim()); const e = m ? m[1].toLowerCase() : ''; return e === 'markdown' ? 'md' : FILE_KINDS.includes(e) ? e : null; };

/**
 * A lesson file -> { ok: true, text, pages, cut, words } or { ok: false, code }. Codes: docType (not one of the kinds, or
 * its bytes are not that kind), docBig (over 5 MB), docPages (a PDF over 10 pages), docScan (a PDF with no text, such as
 * a scanned page, or text this reader cannot read), docBad (damaged or locked), docEmpty (no text). pages: a PDF's
 * pages; for the others about how many pages of text it is (3,000 characters a page), at least 1.
 */
export function readLessonFile({ kind, buf }) {
  if (!FILE_KINDS.includes(kind) || !Buffer.isBuffer(buf) || !buf.length) return { ok: false, code: 'docType' };
  if (buf.length > FILE_LIMITS.bytes) return { ok: false, code: 'docBig' };
  let text = '', pages = 0;
  if (kind === 'docx') {
    if (buf.readUInt32LE(0) !== 0x04034b50) return { ok: false, code: 'docType' };
    const t = docxText(buf);
    if (t === null) return { ok: false, code: 'docBad' };
    text = t;
  } else if (kind === 'pdf') {
    if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') return { ok: false, code: 'docType' };
    const info = pdfInfo(buf, { max: FILE_LIMITS.bytes });
    if (!info || info.encrypted) return { ok: false, code: 'docBad' };
    if (info.pages > FILE_LIMITS.pages) return { ok: false, code: 'docPages' };
    if (!info.fonts || !info.text) return { ok: false, code: info.text === '' && info.fonts ? 'docEmpty' : 'docScan' };
    text = info.text; pages = info.pages;
  } else {
    // text or Markdown: UTF-8 (a NUL byte or broken UTF-8 means it is not a text file)
    if (buf.includes(0)) return { ok: false, code: 'docType' };
    text = new TextDecoder('utf-8', { fatal: false }).decode(buf).replace(/^\ufeff/, '');
    if ((text.match(/\ufffd/g) || []).length > Math.max(3, text.length / 200)) return { ok: false, code: 'docType' };
  }
  const all = cleanBlock(text, Infinity);
  if (all.replace(/\s+/g, '').length < 3) return { ok: false, code: 'docEmpty' };
  // cut at a line's end when one is near (as Crossword's capText does)
  let out = all, cut = false;
  if (all.length > FILE_LIMITS.chars) {
    const head = all.slice(0, FILE_LIMITS.chars), nl = head.lastIndexOf('\n');
    out = (nl > FILE_LIMITS.chars * 0.8 ? head.slice(0, nl) : head).trim(); cut = true;
  }
  return { ok: true, text: out, pages: pages || Math.max(1, Math.ceil(all.length / 3000)), cut, words: (out.match(/\S+/g) || []).length };
}

// ---------------------------------------------------------------- the scrubber
// Name parts that are also everyday words (and parts of one or two letters) are taken out only when they are written
// with a capital letter, as a name is ("Will", "May"), so "will" and "may" in a sentence stay. Full names, display
// names and usernames are matched in any case.
const COMMON = new Set(['will', 'may', 'mark', 'grace', 'hope', 'joy', 'rose', 'june', 'april', 'august', 'summer', 'faith', 'max', 'bill', 'art', 'sky', 'river', 'ruby', 'pearl', 'amber', 'jack', 'sage', 'dawn', 'eve', 'ray', 'rich', 'frank', 'gay', 'guy', 'king', 'young', 'long', 'brown', 'green', 'white', 'black', 'gray', 'grey', 'page', 'chase', 'case', 'hunter', 'miles', 'lane', 'love', 'star', 'honey', 'sunny', 'bear', 'fox', 'wolf', 'drew', 'rob', 'pat', 'sue', 'don', 'dean', 'reed', 'cliff', 'glen', 'heath', 'holly', 'iris', 'ivy', 'lily', 'poppy', 'daisy', 'robin', 'jay', 'wren', 'kit', 'sonny', 'gene', 'lou', 'van', 'del', 'ben', 'tom', 'sam', 'dot', 'nick', 'pete', 'ted', 'tim', 'val', 'norm', 'carol', 'harmony', 'melody', 'destiny', 'precious', 'justice', 'unique', 'liberty', 'serenity', 'trinity', 'neve', 'even', 'add', 'odd', 'one', 'two', 'ten', 'the', 'and', 'student', 'students', 'class', 'teacher']);
// Common English words (chat audit 4, owner-approved rule): a SURNAME on its own that is one of these ("Test", "Brown",
// "Rose", "King", "Young") is not taken out, so "rename 4b math to 4b math test" and an activity called "Test 881 Assign"
// stay as typed. The full name ("Jamie Test") and the first name ("Jamie") are always taken out, and so is a surname
// that is not a common word ("Okafor"). The list is the site's own sight-word list (library/sight-words.json: Fry's
// 1,000 Instant Words and the Dolch words), the most common words of written English.
export const COMMON_WORDS = (() => {
  try {
    const w = JSON.parse(fs.readFileSync(new URL('../library/sight-words.json', import.meta.url), 'utf8'));
    return new Set([...(w.fry || []), ...Object.values(w.dolch || {}).flat()].map(x => String(x).toLocaleLowerCase()));
  } catch { return new Set(); }
})();
const LETTER = '[\\p{L}\\p{M}\\p{N}_]';
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const fold = s => String(s || '').normalize('NFC').replace(/\s+/g, ' ').trim();

/** The names this teacher's students go by: [{ name, strict }] (strict: only with a capital letter). Every class they
 *  teach (and, for a school's admin, every class of that school): the roster name, the display name and the username
 *  of each student, and the roster name of each Google Classroom student still waiting to join. */
export function studentNames(user) {
  if (!user || user.is_guest) return [];
  const ids = new Set(S.classesOf(user.id, 'teacher').map(c => c.id));
  for (const s of S.schoolsOf(user.id)) if (s.role === 'admin') for (const c of S.classesOfSchool(s.id)) ids.add(c.id);
  const raw = new Set();
  for (const id of [...ids].slice(0, 200)) {
    for (const r of S.roster(id)) if (r.role === 'student') for (const v of [r.roster_name, r.display_name, r.username]) if (v) raw.add(fold(v));
    for (const r of q.all("SELECT roster_name FROM gc_pending WHERE class_id=? AND roster_name!=''", id)) raw.add(fold(r.roster_name));
  }
  return namesFrom([...raw]);
}
/** Names -> the patterns to take out: each whole name, and each part of a name of two or more words. */
export function namesFrom(list) {
  const out = new Map();
  // part: a piece of a longer name (a first name, a surname, a username's word), never a whole name; a name that is both
  // stays whole (and loose wins over strict, as before).
  const put = (name, strict, part = false) => {
    const k = name.toLocaleLowerCase(), was = out.get(k);
    if (!was) { out.set(k, { name, strict, ...(part ? { part: true } : {}) }); return; }
    out.set(k, { name: was.strict && !strict ? name : was.name, strict: was.strict && strict, ...(was.part && part ? { part: true } : {}) });
  };
  const weak = p => [...p].length <= 2 || COMMON.has(p.toLocaleLowerCase());
  for (const n of list.map(fold).filter(Boolean)) {
    if ([...n].length < 2) continue;
    const words = n.split(/[\s-]+/u).filter(p => /\p{L}/u.test(p));
    // a one-word name that is also an everyday word ("Will") only with its capital; any other whole name in any case
    put(n, words.length <= 1 && !/[_.\d]/.test(n) && weak(n));
    // the surname of a name of two or more words (its last word): left out on its own when it is a common English word
    // (never when the same word is also one of the name's other parts, a first name)
    const sp = n.split(/\s+/u), last = sp.length > 1 && !/[_.\d]/.test(n) ? sp[sp.length - 1].split('-') : [];
    const plainWord = p => last.includes(p) && COMMON_WORDS.has(p.toLocaleLowerCase()) && !sp.slice(0, -1).some(w => w.split('-').includes(p));
    // the parts of a name of two or more words ("Ana-Maria O'Neil": Ana, Maria, O'Neil)
    if (words.length > 1) for (const p of words) if ([...p].length >= 2 && !plainWord(p)) put(p, weak(p), true);
    // a username's parts ("bright_otter42"): often everyday words, so only with a capital letter
    if (/[_.]/.test(n)) for (const p of n.split(/[_.\s-]+/u)) if ([...p].length >= 3 && /\p{L}/u.test(p)) put(p.replace(/\d+$/, '') || p, true, true);
  }
  return [...out.values()].sort((a, b) => b.name.length - a.name.length).slice(0, 20000);
}
const EMAIL = /[\p{L}\p{N}._%+-]{1,64}(?:@|\s?(?:\(at\)|\[at\])\s?)[\p{L}\p{N}-]{1,63}(?:(?:\.|\s?(?:\(dot\)|\[dot\])\s?)[\p{L}\p{N}-]{1,63})+/giu;
const LINK = /\b(?:https?:\/\/|www\.)[^\s<>"')\]]+/giu;
// Phone numbers: an international one (+ and 8 to 15 digits), a North American one ((555) 123-4567, 555-123-4567,
// 555.123.4567), a UK one (07700 900123, 020 7946 0958) or 10 to 13 digits in a row starting with 0. A number in a
// maths lesson (1000000, 12 + 34, 3 4 5 6) is not one.
const PHONE = [
  /(?<![\p{N}])\+\s?\d(?:[\s.-]?\(?\d\)?){7,14}(?![\p{N}])/gu,
  /(?<![\p{N}])\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?![\p{N}])/gu,
  /(?<![\p{N}])\(\d{3}\)\s?\d{3}[\s.-]?\d{4}(?![\p{N}])/gu,
  /(?<![\p{N}])0\d{2,4}[\s-]\d{3,4}[\s-]?\d{3,4}(?![\p{N}])/gu,
  /(?<![\p{N}])0\d{9,12}(?![\p{N}])/gu,
];
/**
 * Text -> the same text with these names, emails, phone numbers and links taken out -> { text, removed: { names,
 * emails, phones, links } }. names: from studentNames (or namesFrom for a test). contacts: false takes out only the
 * names (a typed Builder message: its emails, phone numbers and links are refused by the Builder's screening instead).
 * token: (the matched name, without a trailing "'s") -> the placeholder put there instead of "[student]" (Oomba, the
 * teaching companion: "[student 1]", services/companion.js tokenize). Every other caller leaves it out: "[student]".
 */
export function scrub(text, names = [], { contacts = true, token = null } = {}) {
  let s = String(text || '');
  const removed = { names: 0, emails: 0, phones: 0, links: 0 };
  if (contacts) {
    s = s.replace(EMAIL, () => { removed.emails++; return '[email]'; });
    s = s.replace(LINK, () => { removed.links++; return '[link]'; });
    for (const re of PHONE) s = s.replace(re, () => { removed.phones++; return '[phone]'; });
  }
  const loose = names.filter(n => !n.strict), strict = names.filter(n => n.strict);
  const run = (list, flags, cap) => {
    for (let i = 0; i < list.length; i += 400) {
      const alt = list.slice(i, i + 400).map(n => (cap ? `${esc(n.name[0].toLocaleUpperCase())}${esc(n.name.slice(1))}` : esc(n.name).replace(/ /g, '\\s+'))).join('|');
      const re = new RegExp(`(?<!${LETTER})(?:${alt})(?:['’]s)?(?!${LETTER})`, flags);
      s = s.replace(re, m => {
        removed.names++;
        if (!token) return '[student]';
        const own = /['’]s$/u.exec(m);
        return `${token(own ? m.slice(0, -2) : m)}${own ? own[0] : ''}`;
      });
    }
  };
  run(loose, 'giu', false);
  run(strict, 'gu', true);
  return { text: s, removed };
}

/** The lesson's typed and read text, every part. */
const lessonTexts = l => [l.goal, l.mistakes, l.vocabulary, l.avoid, l.details, l.doc && l.doc.text].filter(Boolean);
/**
 * A plan as the model may see it: the scrubber on every word the builder typed or added (the topic, their note and the
 * whole lesson), then the Builder's pre-filter on the lesson. -> { plan, removed, blocked } where blocked is the
 * pre-filter's category when the lesson fails it (the plan then has no lesson: it is never used). Only for a classroom
 * activity's plan; any other plan comes back as it is.
 */
export function scrubPlan(plan, user, { names = null } = {}) {
  const removed = { names: 0, emails: 0, phones: 0, links: 0 };
  if (!isActivity(plan)) return { plan, removed, blocked: null };
  const list = names || studentNames(user);
  const one = s => { const r = scrub(s, list); for (const k of Object.keys(removed)) removed[k] += r.removed[k]; return r.text; };
  const out = { ...plan };
  if (out.topic && out.topic.text) out.topic = { text: one(out.topic.text) };
  if (out.notes) out.notes = one(out.notes);
  let blocked = null;
  if (out.lesson) {
    const l = { ...out.lesson };
    for (const k of ['goal', 'mistakes', 'vocabulary', 'avoid', 'details']) if (l[k]) l[k] = one(l[k]);
    if (l.doc) l.doc = { ...l.doc, name: one(l.doc.name), text: one(l.doc.text) };
    blocked = screenLesson(lessonTexts(l).join('\n'));
    if (blocked) delete out.lesson; else out.lesson = l;
  }
  return { plan: out, removed, blocked };
}
/** The Builder's keyword pre-filter on lesson text (rude words, attempts to change the rules, chat, collecting personal
 *  details), a part at a time. Personal details themselves were already taken out by scrub (so a number in a maths
 *  lesson is not read as a phone number). -> the category, or null when it is fine. */
export function screenLesson(text) {
  const s = String(text || '');
  for (let i = 0; i < s.length; i += 4000) { const c = prefilter(s.slice(Math.max(0, i - 200), i + 4000), { personal: false }); if (c) return c; }
  return null;
}
/** A name list without the pieces of longer names (namesFrom's part): a student's whole name (and a one-word name or a
 *  username) only. For titles of the teacher's own things the app hands the AI (chat audit 4). */
export const wholeNames = names => (names || []).filter(n => !n.part);
