// Oomba Live starter question sets, so a teacher can run Quest Race or Question Battle with no setup
// (docs/decisions.md "Oomba Live"). Maths is made fresh each time from templates (live.starter.math.*) for three age
// bands; Science and Geography are 10 fixed questions each, translated in every language (live.starter.science.*,
// live.starter.geo.*: the first choice, c0, is the right one; choices are shuffled when a question opens).
import crypto from 'node:crypto';
import { tFor } from '../i18n/index.js';

export const STARTERS = ['math-8', 'math-10', 'math-12', 'science', 'geo'];
export const FIXED = { science: 10, geo: 10 };
const rnd = (lo, hi) => lo + crypto.randomInt(hi - lo + 1);

/** Three wrong answers near the right one (whole numbers, not negative, all different). */
export function nearMisses(answer, spread) {
  const out = new Set();
  for (let i = 0; out.size < 3 && i < 200; i++) {
    const d = rnd(1, Math.max(2, spread)) * (crypto.randomInt(2) ? 1 : -1);
    const v = answer + d;
    if (v >= 0 && v !== answer) out.add(v);
  }
  for (let v = answer + 1; out.size < 3; v++) out.add(v);
  return [...out];
}

function mathItem(t, band) {
  const kinds = band === 8 ? ['add', 'sub'] : ['add', 'sub', 'times'];
  const kind = kinds[crypto.randomInt(kinds.length)];
  let a, b, ans;
  if (kind === 'times') { const top = band === 10 ? 10 : 12; a = rnd(2, top); b = rnd(2, top); ans = a * b; }
  else {
    const top = band === 8 ? 20 : band === 10 ? 100 : 1000;
    a = rnd(1, top); b = rnd(1, top);
    if (kind === 'sub' && b > a) [a, b] = [b, a];
    ans = kind === 'add' ? a + b : a - b;
  }
  const spread = kind === 'times' ? Math.max(3, Math.round(ans / 8)) : band === 8 ? 3 : band === 10 ? 10 : 50;
  return { q: t(`live.starter.math.${kind}`, { a, b }), choices: [ans, ...nearMisses(ans, spread)].map(String), answer: 0, secs: band === 12 ? 20 : 30 };
}

/** The items of a starter set, in this language. Maths: 10 fresh questions; Science, Geography: the fixed ten. */
export function starterItems(id, lang = 'en') {
  const t = tFor(lang);
  const m = /^math-(8|10|12)$/.exec(id);
  if (m) return Array.from({ length: 10 }, () => mathItem(t, +m[1]));
  const n = FIXED[id] || 0;
  return Array.from({ length: n }, (_, i) => ({
    q: t(`live.starter.${id}.${i}.q`),
    choices: [0, 1, 2, 3].map(k => t(`live.starter.${id}.${i}.c${k}`)),
    answer: 0, secs: 20,
  }));
}
