// Figures: the number line's own controls and the editor's forgiving number boxes (public/js/figures-editor.js;
// docs/decisions.md "Figures: a friendlier number line"). Pure helpers, no page access, so tests import them directly:
//   parseNum   what a teacher typed in a number box: a number, a fraction "3/4" ([3, 4]), a multiple of π "2π" or "π/2"
//              ({ pi: k }) where the figure takes one, "still typing" ("-", "1/", "") or not a number
//   numShown   a value from the data written back into a box (fractions and π as typed, never 0.30000000000000004)
//   nlValue    a number line value (a number, [n, d] or { pi }) as a plain number
//   nlWiden    the line widened (on its own tick grid) so every interval end and point is on it, or the data unchanged
//   nlFit      the line's own range kept: what does not fit on it is left out (the note's "Keep 2 to 5")
//   nlWhere    an Oomba Figures problem about the number line, placed: a field ('from', 'to', 'step', 'every'), a row
//              ('interval 1', 'point 2') or nowhere (the page's cannot-draw panel), with the words to show there
// Oomba Figures itself (figures/src/ported/numberline.js) is frozen in every shipped version: nothing here changes how a
// line is drawn, only what the editor hands it.

const MINUS = /[−–‐]/g;
const DEC = /^-?(\d+([.,]\d*)?|[.,]\d+)$/;
const FRAC = /^(-?\d+)\s*\/\s*(\d+)$/;
const r10 = x => +(+x).toFixed(10);

/** One typed value -> { value } | { empty: true } | { partial: true } | { bad: true }. pi: π is allowed. */
export function parseNum(text, { pi = false } = {}) {
  const s = String(text == null ? '' : text).replace(MINUS, '-').replace(/\s+/g, ' ').trim();
  if (s === '') return { empty: true };
  if (DEC.test(s)) { const v = Number(s.replace(',', '.')); return Number.isFinite(v) ? { value: v } : { bad: true }; }
  const f = FRAC.exec(s);
  if (f) { const n = +f[1], d = +f[2]; if (d === 0) return { bad: true }; return { value: n % d === 0 ? n / d : [n, d] }; }
  if (pi) {
    const m = /^(-?)\s*(\d*)\s*(?:π|pi)\s*(?:\/\s*(\d+))?$/i.exec(s);
    if (m) {
      const n = (m[1] ? -1 : 1) * (m[2] === '' ? 1 : +m[2]), d = m[3] === undefined ? 1 : +m[3];
      if (d === 0) return { bad: true };
      return { value: n === 0 ? 0 : { pi: d === 1 ? n : [n, d] } };
    }
    const k = /^(-?\d+(?:[.,]\d+)?)\s*(?:π|pi)$/i.exec(s);
    if (k) return { value: { pi: Number(k[1].replace(',', '.')) } };
    if (/^-?\d*\s*(?:π|pi|p)\s*\/?\s*$/i.test(s)) return { partial: true };
  }
  if (/^-?[.,]?$|^-?\d+[.,]$|^-?\d+\s*\/\s*$/.test(s)) return { partial: true };
  return { bad: true };
}

/** A value from the data as a box shows it: '' when it is not a number the box can hold. */
export function numShown(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? String(r10(v)) : '';
  if (Array.isArray(v) && v.length === 2 && Number.isInteger(v[0]) && Number.isInteger(v[1])) return `${v[0]}/${v[1]}`;
  if (v && typeof v === 'object' && 'pi' in v) {
    const k = v.pi;
    if (Array.isArray(k)) return `${k[0] === 1 ? '' : k[0] === -1 ? '-' : k[0]}π/${k[1]}`;
    if (typeof k === 'number') return `${k === 1 ? '' : k === -1 ? '-' : r10(k)}π`;
  }
  return '';
}

/** A number line value as a plain number (NaN when it is none). */
export function nlValue(x) {
  if (typeof x === 'number') return x;
  if (Array.isArray(x) && x.length === 2 && x[1]) return x[0] / x[1];
  if (x && typeof x === 'object' && 'pi' in x) return nlValue(x.pi) * Math.PI;
  return NaN;
}
const isPi = x => !!(x && typeof x === 'object' && !Array.isArray(x) && 'pi' in x);
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
/** A value v on a line whose own values are written as fractions: [n, den] when it is not whole (den the line's). */
function asForm(v, den) {
  if (Math.abs(v - Math.round(v)) < 1e-9) return Math.round(v);
  if (den > 1 && Math.abs(v * den - Math.round(v * den)) < 1e-9) { const n = Math.round(v * den), g = gcd(n, den); return [n / g, den / g]; }
  return r10(v);
}

const MAX_TICKS = 100;
/** Every value that has to be on the line: interval ends (a missing end runs off the line) and points. */
function needed(d) {
  const out = [];
  for (const [i, it] of (Array.isArray(d.intervals) ? d.intervals : []).entries()) for (const k of ['from', 'to']) if (it && it[k] != null && Number.isFinite(nlValue(it[k]))) out.push({ v: nlValue(it[k]), what: `interval ${i + 1}` });
  for (const [i, p] of (Array.isArray(d.points) ? d.points : []).entries()) if (p && Number.isFinite(nlValue(p.at))) out.push({ v: nlValue(p.at), what: `point ${i + 1}` });
  return out;
}

/**
 * The line widened on its own grid of ticks so every interval end and point is on it. -> { data, widened: null | {
 * from, to (what the teacher gave, as numbers; fromData, toData as written), newFrom, newTo, what: ['interval 1', ...] } }. Left alone (widened null) when the
 * range itself is not a line yet (to not after from, no step), when it is in multiples of π, or when the wider line
 * would need more than 100 ticks (then Oomba Figures' own problem says so, next to the interval or point).
 */
export function nlWiden(d) {
  const none = { data: d, widened: null };
  if (!d || typeof d !== 'object') return none;
  const F = nlValue(d.from), T = nlValue(d.to), S = nlValue(d.step === undefined ? 1 : d.step);
  if (![F, T, S].every(Number.isFinite) || !(S > 0) || !(T > F) || [d.from, d.to, d.step].some(isPi)) return none;
  const eps = 1e-9 * Math.max(1, Math.abs(F), Math.abs(T));
  const out = needed(d).filter(n => n.v < F - eps || n.v > T + eps);
  if (!out.length) return none;
  const lo = Math.min(F, ...out.map(n => n.v)), hi = Math.max(T, ...out.map(n => n.v));
  const nF = lo < F ? F - Math.ceil((F - lo) / S - 1e-9) * S : F, nT = hi > T ? T + Math.ceil((hi - T) / S - 1e-9) * S : T;
  if (Math.round((nT - nF) / S) > MAX_TICKS) return none;
  const den = [d.from, d.to, d.step].reduce((m, x) => (Array.isArray(x) ? (m * x[1]) / gcd(m, x[1]) : m), 1);
  const data = { ...d, from: lo < F ? asForm(nF, den) : d.from, to: hi > T ? asForm(nT, den) : d.to };
  return { data, widened: { from: F, to: T, fromData: d.from, toData: d.to, newFrom: r10(nF), newTo: r10(nT), what: [...new Set(out.map(n => n.what))] } };
}

/** The line kept at from..to: intervals and points that do not fit on it are left out. -> { data, removed: n }. */
export function nlFit(d, from, to) {
  const lo = Math.min(from, to), hi = Math.max(from, to), eps = 1e-9 * Math.max(1, Math.abs(lo), Math.abs(hi));
  const on = x => x == null || (Number.isFinite(nlValue(x)) && nlValue(x) >= lo - eps && nlValue(x) <= hi + eps);
  const data = { ...d, from, to };
  let removed = 0;
  if (Array.isArray(d.intervals)) { data.intervals = d.intervals.filter(it => !it || (on(it.from) && on(it.to)) || !++removed); if (!data.intervals.length) delete data.intervals; }
  if (Array.isArray(d.points)) { data.points = d.points.filter(p => !p || on(p.at) || !++removed); if (!data.points.length) delete data.points; }
  return { data, removed };
}

/**
 * Where an Oomba Figures problem about the number line belongs, and which words say it (keys under
 * js.figures-editor.nl.why; vars for their placeholders). -> { at: 'from' | 'to' | 'step' | 'every' | 'interval 1' |
 * 'point 2' | null, key, vars }. The problems are Oomba Figures' own English (numberline.js nlRead); a problem this does
 * not know goes to the page's panel (at null), as before.
 */
export function nlWhere(p) {
  const s = String(p);
  const row = /^(interval|point) (\d+)(?::| needs| must)/.exec(s);
  if (row) {
    const at = `${row[1]} ${row[2]}`;
    const past = /([-−\d.,/π]+) is past the end of the line/.exec(s);
    if (past) return { at, key: 'past', vars: { value: past[1].replace(MINUS, '-') } };
    if (/"to" must be bigger than "from"/.test(s)) return { at, key: 'ivOrder', vars: {} };
    if (/needs "at"|must be numbers/.test(s)) return { at, key: 'needNumber', vars: {} };
    return { at, key: null, vars: {} };
  }
  if (/end after it starts/.test(s)) return { at: 'to', key: 'order', vars: {} };
  if (/"step"/.test(s) && /above 0/.test(s)) return { at: 'step', key: 'stepPositive', vars: {} };
  if (/whole number, so the line ends on a tick/.test(s)) return { at: 'step', key: 'stepFit', vars: {} };
  const many = /that makes (\d+) gaps/.exec(s);
  if (many) return { at: 'step', key: 'tooMany', vars: { count: +many[1] } };
  if (/^"every"/.test(s)) return { at: 'every', key: 'every', vars: {} };
  if (/^"from" and "to" must be numbers/.test(s)) return { at: 'from', key: 'needNumber', vars: {} };
  return { at: null, key: null, vars: {} };
}
