// ======================================================================================================
// JUNGLE CUP core: the shared namespace, words (t), numbers and small helpers.
// Everything the sports may use hangs off JC (see docs/jungle-cup-plan.md "Sport module interface").
// ======================================================================================================
const JC = { sports: {}, sportOrder: ['paddle', 'vine', 'seed', 'rapids', 'frog', 'kick', 'leaf'], version: 1 };
window.JC = JC;

/* ---------- words ---------- */
const LANG = (function () {
  let l = 'en'; try { l = String((window.BRB && BRB.user && BRB.user.lang) || 'en'); } catch (e) { /* older SDK */ }
  const own = k => Object.prototype.hasOwnProperty.call(I18N, k);
  return own(l) || own(l.split('-')[0]) ? l : 'en';
})();
const RTL = /^(he|ar)\b/.test(LANG);
const I18N_CHAIN = Array.from(new Set([LANG, LANG.split('-')[0], 'en'])).filter(c => Object.prototype.hasOwnProperty.call(I18N, c));
const NUM_LOCALE = LANG.split('-')[0] === 'ar' ? 'ar-u-nu-latn' : LANG;
const PLURAL = (function () { try { return new Intl.PluralRules(NUM_LOCALE); } catch (e) { return { select: n => (n === 1 ? 'one' : 'other') }; } })();
const NUMF = (function () { try { return new Intl.NumberFormat(NUM_LOCALE); } catch (e) { return { format: n => String(n) }; } })();
function tRaw(key) { for (let i = 0; i < I18N_CHAIN.length; i++) { const v = I18N[I18N_CHAIN[i]][key]; if (v !== undefined) return v; } return undefined; }
/** t('key', { n: 3 }): the player's language, {name} filled in, { one, other } plurals picked by vars.n. Missing -> the key. */
function t(key, vars) {
  let v = tRaw(key);
  if (v === undefined) return key;
  if (v && typeof v === 'object') { const n = vars && typeof vars.n === 'number' ? vars.n : 0; const c = PLURAL.select(n); v = v[c] !== undefined ? v[c] : v.other; }
  v = String(v);
  return vars ? v.replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined ? m : typeof vars[k] === 'number' ? NUMF.format(vars[k]) : String(vars[k]))) : v;
}
const fmt = n => NUMF.format(n);
JC.t = t; JC.fmt = fmt; JC.lang = LANG; JC.rtl = RTL;
// A tiny cache for labels with numbers that are drawn every frame (no new string per frame while the number is the same).
const LABELS = new Map();
function label(key, n) {
  let m = LABELS.get(key); if (!m) { m = { n: NaN, s: '' }; LABELS.set(key, m); }
  if (m.n !== n) { m.n = n; m.s = t(key, { n }); }
  return m.s;
}
JC.label = label;

/* ---------- maths ---------- */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, k) => a + (b - a) * k;
const easeOut = k => 1 - (1 - k) * (1 - k);
const easeOutBack = k => { const c = 1.70158; const x = k - 1; return 1 + (c + 1) * x * x * x + c * x * x; };
const sign = v => (v < 0 ? -1 : v > 0 ? 1 : 0);
/** A small seeded random generator (mulberry32): JC.rng(seed)() -> 0..1. */
function rng(seed) {
  let a = (seed >>> 0) || 1;
  return function () { a = (a + 0x6D2B79F5) | 0; let x = Math.imul(a ^ (a >>> 15), 1 | a); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
JC.math = { clamp, lerp, easeOut, easeOutBack, sign, rng };
JC.rng = rng;

/* ---------- platform (BRB) ---------- */
const BRBX = {
  ok: () => typeof window.BRB === 'object' && !!window.BRB,
  muted() { try { return !!(window.BRB && BRB.sfx && BRB.sfx.muted); } catch (e) { return false; } },
  mute(on) { try { return BRB.sfx.mute(on); } catch (e) { return on; } },
  get(k) { try { return window.BRB && BRB.storage ? BRB.storage.get(k) : null; } catch (e) { return null; } },
  set(k, v) { try { if (window.BRB && BRB.storage) { BRB.storage.set(k, v); return true; } } catch (e) { /* ignore */ } return false; },
  remove(k) { try { if (window.BRB && BRB.storage) BRB.storage.remove(k); } catch (e) { /* ignore */ } },
  gameOver(won, score) { try { if (window.BRB && BRB.gameOver) BRB.gameOver({ won: !!won, score: Math.max(0, Math.round(score)) }); } catch (e) { /* ignore */ } },
  reduced() { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } },
};
JC.brb = BRBX;
