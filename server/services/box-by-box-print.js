// Arithmetic Lab's worksheet (BRB.print, docs/sdk.md "Printing"; the same pipeline as Crossword's, services/game-print.js):
// the game sends an activity's problems as plain data, as a question set's item ({ k, p, r?, dec?, m? }, checked by
// cleanBoxItems, so only numbers and fixed words), and this makes the printable page: each problem written the way it is
// on paper (long division in its bracket, the others in columns, decimals lined up as they are worked) with room to work,
// in the viewer's language. The answer key (a page of its own) is worked out here, from the numbers, exactly as the game
// works them (whole numbers of hundredths, never floating point; tested against the game's own sheets), and is for school
// staff only (the route checks who asks, as for Crossword).
import { cleanBoxItems, SET_ID } from './game-sets.js';
import { cleanPrintNote, PRINT_NOTE_MAX } from './print-note.js';

const KEYS = new Set(['k', 'p', 'r', 'dec', 'm', 'key', 'set', 'note']);
/** The teacher's own instructions for the top of the sheet: plain text, printed as typed (escaped), line breaks kept
 *  (services/print-note.js, shared with Crossword). */
export { PRINT_NOTE_MAX };
export const BOX_PRINT = { bytes: 20000 };

// ---------------------------------------------------------------- numbers, as the game's numbers.ts writes them
const placesOf = (x) => { const s = String(x); const i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; };
const scaled = (x, k) => { const [i, f = ''] = String(x).split('.'); return BigInt(i + f.padEnd(k, '0').slice(0, k)); };
/** A whole number of 10^-k written out: (5n, 2) -> "0.05". */
function asText(n, k) {
  const s = n.toString().padStart(k + 1, '0');
  return k ? `${s.slice(0, -k)}.${s.slice(-k)}` : s;
}
const trim = (s) => (s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s);
/** The number with its point moved k places right, as written on paper: (4.5, 1) -> "45", (4.56, 1) -> "45.6". */
function shiftPoint(x, k) {
  const [i, f = ''] = String(x).split('.');
  const int = (i + f.slice(0, k).padEnd(k, '0')).replace(/^0+(?=\d)/, '');
  const frac = f.slice(k);
  return frac ? `${int}.${frac}` : int;
}
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const DECIMAL_PLACES = 2;

/** A long division's answer as the game writes it (logic.ts divideSheet): { text, rounded?, simpler? }. form: 'R',
 *  'fraction' or 'decimal' (any decimal in the problem makes the answer a decimal). */
export function divideAnswer(dividend, divisor, form = 'R') {
  const s = placesOf(divisor);
  const B = scaled(divisor, s);
  const A = shiftPoint(dividend, s);
  const given = A.includes('.') ? A.length - A.indexOf('.') - 1 : 0;
  const N = BigInt(A.replace('.', ''));
  const dec = form === 'decimal' || placesOf(dividend) > 0 || s > 0;
  const places = Math.max(DECIMAL_PLACES, given);
  let extra = 0;
  let left = N % B;
  while (dec && left !== 0n && given + extra < places) { left = (left * 10n) % B; extra++; }
  const P = given + extra;
  const all = N * 10n ** BigInt(extra);
  const Q = all / B;
  const R = all % B;
  const q = asText(Q, P);
  if (dec) {
    if (!R) return { text: q };
    const next = (R * 10n) / B;
    return { text: `${q}…`, rounded: asText(Q + (next >= 5n ? 1n : 0n), places) };
  }
  if (form === 'fraction') {
    if (!R) return { text: q };
    const g = gcd(R, B);
    return { text: `${q} ${R}/${B}`, ...(g > 1n ? { simpler: `${q} ${R / g}/${B / g}` } : {}) };
  }
  return { text: R ? `${q} R ${R}` : q };
}
/** Multiplication, addition, subtraction: the answer as the game writes it (multiplication: every decimal place). */
export function columnAnswer(kind, a, b) {
  if (kind === 'multiply') {
    const P = placesOf(a) + placesOf(b);
    const full = asText(scaled(a, placesOf(a)) * scaled(b, placesOf(b)), P);
    return { text: full, ...(trim(full) !== full ? { simpler: trim(full) } : {}) };
  }
  const P = Math.max(placesOf(a), placesOf(b));
  const X = scaled(a, P);
  const Y = scaled(b, P);
  return { text: asText(kind === 'add' ? X + Y : X - Y, P) };
}

// ---------------------------------------------------------------- the request
/** The game's print request -> { ok: true, doc: { k, p, form, dec, m, key, set, answers } } or { ok: false, code: 'bad' }.
 *  Strict: unknown keys, or problems the game can't work, and it is turned down. */
export function cleanBoxPrintDoc(raw) {
  const no = { ok: false, code: 'bad' };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return no;
  let size; try { size = JSON.stringify(raw).length; } catch { return no; }
  if (size > BOX_PRINT.bytes || Object.keys(raw).some((k) => !KEYS.has(k))) return no;
  if (raw.key !== undefined && typeof raw.key !== 'boolean') return no;
  if (raw.set !== undefined && raw.set !== '' && !(typeof raw.set === 'string' && SET_ID.test(raw.set))) return no;
  const note = cleanPrintNote(raw.note);
  if (note === null) return no;
  const item = { k: raw.k, p: raw.p, l: 'guided' };
  for (const x of ['r', 'dec', 'm']) if (raw[x] !== undefined) item[x] = raw[x];
  const c = cleanBoxItems([item]);
  if (!c || !c[0].p.length) return no;
  const it = c[0];
  const form = it.dec ? 'decimal' : it.r === 'fraction' ? 'fraction' : it.r === 'decimal' && !it.m ? 'decimal' : 'R';
  const answers = it.p.map(([a, b]) => (it.k === 'divide' ? divideAnswer(a, b, form) : columnAnswer(it.k, a, b)));
  return { ok: true, doc: { k: it.k, p: it.p, form, dec: it.dec === 1, m: it.m || 'standard', key: raw.key === true, set: raw.set || '', answers, ...(note ? { note } : {}) } };
}

// ---------------------------------------------------------------- the page
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const U = 10; // one square, in the picture's own units
const cell = (ch, col, row, cls = '') => (ch === ' ' ? '' : `<text${cls ? ` class="${cls}"` : ''} x="${(col * U + U / 2).toFixed(1)}" y="${(row * U + U * 0.72).toFixed(1)}" text-anchor="middle">${esc(ch)}</text>`);
const chars = (text, col, row, cls) => [...text].map((ch, i) => cell(ch, col + i, row, cls)).join('');
/** A decimal point takes a narrow square of its own on paper; here every character has a square, so columns line up. */
function svg(w, h, body, label) {
  return `<svg class="bbp-svg" viewBox="0 0 ${w * U} ${h * U}" role="img" aria-label="${esc(label)}" style="--w:${w}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}
/** Long division in its bracket: the divisor, the bracket over the dividend, room for the quotient above and the work
 *  below (the key: the quotient written in, its ones above the dividend's ones; R, a fraction or "…" after it). */
function divisionSvg(a, b, ans, { key, label }) {
  const D = String(b);
  const N = String(a);
  const int = (s) => (s.includes('.') ? s.indexOf('.') : s.length);
  const shifted = placesOf(b) > 0;
  const q = key ? ans.text.split(' ')[0].replace('…', '') : '';
  const after = key ? ans.text.slice(ans.text.split(' ')[0].replace('…', '').length) : '';
  const left = D.length + 0.7; // the bracket in the gap just after the divisor
  // the quotient's ones over the dividend's ones (a decimal divisor: over its end, as the shifted problem is written)
  const qStart = key ? (shifted ? left + N.length - q.length : left + int(N) - int(q)) : left;
  const right = Math.ceil(Math.max(left + N.length, key ? qStart + q.length + after.length : 0)) + 1;
  const room = Math.max(4, N.replace('.', '').length * 2 + 1);
  const H = 2 + room;
  const body = [
    chars(D, 0, 1),
    `<path class="bbp-line" d="M${((left - 0.2) * U).toFixed(1)} ${1 * U} q${U * 0.5} ${U * 0.5} 0 ${U * 1.05} M${((left - 0.2) * U).toFixed(1)} ${1 * U} H${((left + Math.max(N.length, key ? qStart - left + q.length : 0) + 0.2) * U).toFixed(1)}"/>`,
    chars(N, left, 1),
    key ? chars(q, Math.max(0, qStart), 0, 'bbp-ans') + (after ? `<text class="bbp-ans" x="${((qStart + q.length) * U + 2).toFixed(1)}" y="${(U * 0.72).toFixed(1)}">${esc(after.trim() ? after : '')}</text>` : '') : ''
  ].join('');
  return svg(Math.max(right, Math.ceil(left + N.length) + 2), key ? 2 : H, body, label);
}
/** A problem in columns: the numbers lined up (addition and subtraction on their points, multiplication on the right, as
 *  it is worked), the sign, the line, room for carries above and the work below (the key: the answer under the line). */
function columnsSvg(kind, a, b, ans, { key, label }) {
  const align = kind !== 'multiply';
  const P = align ? Math.max(placesOf(a), placesOf(b), placesOf(ans.text)) : 0;
  const pad = (x) => (align && P ? (placesOf(x) ? String(x) + ' '.repeat(P - placesOf(x)) : `${x}${' '.repeat(P + 1)}`) : String(x));
  const rows = [pad(a), pad(b)];
  const answer = key ? pad(ans.text) : '';
  const W = Math.max(...rows.map((r) => r.length), answer.length) + 1;
  const sign = kind === 'add' ? '+' : kind === 'subtract' ? '−' : '×';
  const top = 1; // a row above for carries and regrouping
  const workRows = kind === 'multiply' ? String(b).replace('.', '').length + 2 : 2;
  const H = key ? top + 3 : top + 2 + workRows;
  const body = [
    chars(rows[0], W - rows[0].length, top),
    cell(sign, 0, top + 1),
    chars(rows[1], W - rows[1].length, top + 1),
    `<path class="bbp-line" d="M0 ${(top + 2) * U} H${W * U}"/>`,
    key ? chars(answer, W - answer.length, top + 2, 'bbp-ans') : ''
  ].join('');
  return svg(W, H, body, label);
}

const TITLE = { divide: 'divide', multiply: 'multiply', add: 'add', subtract: 'subtract' };
/** The worksheet's instructions, from the activity: the kind, how remainders are written, decimals, the method. */
function howTo(doc, t) {
  const out = [];
  if (doc.k === 'divide') {
    out.push(t(doc.form === 'fraction' ? 'play.printBox.howFraction' : doc.form === 'decimal' ? 'play.printBox.howDecimal' : 'play.printBox.howR'));
    if (doc.p.some(([, b]) => placesOf(b) > 0)) out.push(t('play.printBox.howShift'));
  } else out.push(t(`play.printBox.how.${doc.k}${doc.dec ? 'Dec' : ''}`));
  if (doc.m !== 'standard') out.push(t(`play.printBox.method.${doc.m}`));
  return out.join(' ');
}

/** The printable page (a fragment for the play page's print area): the worksheet on its own page(s), and the answer key
 *  on a page of its own after it when asked. t: the viewer's language (req.t); dir, lang: its direction and code. */
export function boxPrintHtml(doc, { t, dir = 'ltr', lang = 'en', code = '', link = '' }) {
  const title = t(`play.printBox.${TITLE[doc.k]}`);
  const foot = `<footer class="cwp-foot"><span>${esc(t('play.print.made'))}</span>${code ? `<span>${esc(t('play.print.code', { code }))}</span>` : ''}${link ? `<span dir="ltr" class="cwp-link">${esc(link)}</span>` : ''}</footer>`;
  const layout = (key) =>
    doc.p
      .map(([a, b], i) => {
        const label = t('play.printBox.problem', { n: i + 1 });
        const pic = doc.k === 'divide' ? divisionSvg(a, b, doc.answers[i], { key, label }) : columnsSvg(doc.k, a, b, doc.answers[i], { key, label });
        const extra = key && (doc.answers[i].rounded || doc.answers[i].simpler)
          ? `<span class="bbp-note">${esc(doc.answers[i].rounded ? t('play.printBox.rounds', { x: doc.answers[i].rounded }) : t('play.printBox.simpler', { x: doc.answers[i].simpler }))}</span>`
          : '';
        return `<div class="bbp-item"><b class="bbp-num">${i + 1}.</b><div class="bbp-pic" dir="ltr">${pic}${extra}</div></div>`;
      })
      .join('');
  const cols = doc.k === 'divide' ? 'bbp-two' : 'bbp-three';
  const sheet = `<section class="cwp-page bbp-sheet">
<header class="cwp-head"><h1>${esc(title)}</h1><p class="cwp-lines"><span class="cwp-line">${esc(t('play.print.name'))}<i class="cwp-blank cwp-blank-name"></i></span><span class="cwp-line">${esc(t('play.print.date'))}<i class="cwp-blank"></i></span></p></header>
${doc.note ? `<p class="bbp-mine" dir="auto">${esc(doc.note)}</p>` : ''}<p class="bbp-how">${esc(howTo(doc, t))}</p>
<div class="bbp-grid ${cols}">${layout(false)}</div>
${foot}</section>`;
  const key = doc.key ? `<section class="cwp-page cwp-key bbp-key">
<header class="cwp-head"><h1>${esc(t('play.print.keyTitle', { title }))}</h1></header>
<div class="bbp-grid bbp-four">${layout(true)}</div>
${foot}</section>` : '';
  return `<div class="cwp bbp" lang="${esc(lang)}" dir="${dir === 'rtl' ? 'rtl' : 'ltr'}">${sheet}${key}</div>`;
}
