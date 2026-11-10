// The Oomba Live question bank on the server (docs/decisions.md "The live question bank"): subjects x levels for live
// sessions (the /live picker's "From the question bank") and, through the same data, the language packs the games load
// for solo practice (scripts/live-bank.js). Content: server/live/bank/<lang>/<subject>.json, hand-written and reviewed;
// maths is generated (engine.js). A language without its own files gets maths and the translated science and geography
// starters (live.starter.science.* / geo.*); English is the full bank (en-GB with British spellings).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { tFor, availableLocales } from '../../i18n/index.js';
import { cleanText } from '../../services/textfilter.js';
const CODES = () => availableLocales().map(l => l.code);
import { makeBank, SUBJECTS, LEVELS, COUNTS } from './engine.js';

export { SUBJECTS, LEVELS, COUNTS };
const DIR = path.dirname(fileURLToPath(import.meta.url));
const TEXT_SUBJECTS = SUBJECTS.filter(s => s !== 'math');
const MATH_KINDS = ['add', 'sub', 'times', 'missing', 'div', 'frac', 'pct', 'alg', 'sq'];
// en-GB: the few words the English bank spells the American way.
const GB = { color: 'colour', colors: 'colours', Color: 'Colour', armor: 'armour', Armor: 'Armour', airplane: 'aeroplane', center: 'centre', kilometer: 'kilometre', meters: 'metres', aluminum: 'aluminium', Aluminum: 'Aluminium', civilization: 'civilisation', modernization: 'modernisation', Mom: 'Mum', vapor: 'vapour', Pajamas: 'Pyjamas' };
const toGB = s => (s === 'Fall' ? 'Autumn' : s.replace(/\bin fall\b/g, 'in autumn').replace(/\bteam on the field\b/g, 'team on the pitch')
  .replace(/\b[A-Za-z]+\b/g, w => (Object.prototype.hasOwnProperty.call(GB, w) ? GB[w] : w)));

const cache = new Map();
/** The hand-written questions for a language: { subject: { level: rows } }. */
export function dataFor(lang = 'en') {
  const code = CODES().includes(lang) ? lang : 'en';
  if (cache.has(code)) return cache.get(code);
  const own = code === 'en-GB' ? 'en' : code, out = {};
  for (const s of TEXT_SUBJECTS) {
    const f = path.join(DIR, own, `${s}.json`);
    if (fs.existsSync(f)) out[s] = JSON.parse(fs.readFileSync(f, 'utf8'));
  }
  if (code === 'en-GB') for (const s of Object.keys(out)) for (const l of Object.keys(out[s])) out[s][l] = out[s][l].map(r => r.map(toGB));
  // No files yet in this language: the starter questions every language already has.
  if (!Object.keys(out).length) {
    const t = tFor(code), rows = id => Array.from({ length: 10 }, (_, i) => [t(`live.starter.${id}.${i}.q`), ...[0, 1, 2, 3].map(k => t(`live.starter.${id}.${i}.c${k}`))]);
    out.science = { a8: rows('science').slice(0, 5), a10: rows('science').slice(5) };
    out.geography = { a8: rows('geo').slice(0, 5), a10: rows('geo').slice(5) };
  }
  cache.set(code, out);
  return out;
}
/** The words the engine needs, in a language. */
export function stringsFor(lang = 'en') {
  const t = tFor(lang);
  const math = {};
  for (const k of MATH_KINDS) math[k] = ['add', 'sub', 'times'].includes(k) ? t(`live.starter.math.${k}`) : t(`live.bank.math.${k}`);
  return {
    subject: Object.fromEntries([...SUBJECTS, 'mixed'].map(s => [s, t(`live.bank.subject.${s}`)])),
    level: Object.fromEntries(LEVELS.map(l => [l, t(`live.bank.level.${l}`)])),
    math,
  };
}
const rand = () => crypto.randomInt(1 << 30) / (1 << 30);
// Generated maths can, by chance, spell something the text filter refuses once digits are read as letters (Japanese
// "2x + 5 = 23 のとき" reads as a rude word), and a refused question can't be saved or hosted (cleanItems). Such an item
// is drawn again; the hand-written subjects are reviewed and pass as they are. The games' solo packs keep the plain engine.
const passes = it => cleanText(it.q, 300).ok;
export function redraw(bank, items) {
  // The question drawn again is never one the set already has (the engine keeps a pick free of repeats).
  const used = new Set(items.map(it => it.q));
  return items.map(it => {
    if (passes(it) || !String(it.id).startsWith('math:')) return it;
    const level = String(it.id).split(':')[1];
    for (let i = 0; i < 80; i++) { const again = bank.mathItem(level); if (passes(again) && !used.has(again.q)) { used.add(again.q); return { ...again, cat: it.cat }; } }
    return it;
  });
}
export const bankFor = lang => {
  const bank = makeBank(dataFor(lang), stringsFor(lang), rand);
  return { ...bank, pick: o => redraw(bank, bank.pick(o)), board: o => redraw(bank, bank.board(o)) };
};

/** A bank starter id: 'bank:<subject|mixed>:<level>:<count>' or, for a board, 'bank:board:<level>:<subject>+<subject>…'. */
export function parseBankId(id) {
  const m = /^bank:([a-z]+):(a6|a8|a10|a12):([a-z+]+|\d{1,2})$/.exec(String(id || ''));
  if (!m) return null;
  if (m[1] === 'board') { const subs = m[3].split('+').filter(s => SUBJECTS.includes(s)); return { board: true, level: m[2], subjects: [...new Set(subs)].slice(0, 6) }; }
  if (m[1] !== 'mixed' && !SUBJECTS.includes(m[1])) return null;
  const count = +m[3];
  if (!COUNTS.includes(count) && !(count >= 1 && count <= 50)) return null;
  return { board: false, subject: m[1], level: m[2], count };
}
/** Items for a bank starter (null when the id is wrong), as the quiz engine wants them: { q, choices, answer, secs, cat }. */
export function bankItems(id, lang = 'en') {
  const p = parseBankId(id); if (!p) return null;
  const bank = bankFor(lang);
  const items = p.board ? bank.board({ subjects: p.subjects, level: p.level }) : bank.pick({ subject: p.subject, level: p.level, count: p.count });
  return items.map(({ q, choices, answer, secs, cat }) => ({ q, choices, answer, secs, cat }));
}
/** What the /live picker offers in a language: subjects with names, levels with names. */
export function pickerFor(lang = 'en') {
  const bank = bankFor(lang), s = stringsFor(lang);
  return { subjects: bank.subjects().map(id => ({ id, name: s.subject[id] })), mixed: s.subject.mixed, levels: LEVELS.map(id => ({ id, name: s.level[id] })), counts: COUNTS };
}
export const _clearCache = () => cache.clear();
