// Build time estimates: "Usually 1–2 minutes" in the Studio's live card, from real timed builds on this site.
// Buckets: provider (ai | blocks) × std | pro × new | change × 2d | 3d, all known before a build runs (keyOf).
// Stats: nearest-rank p25/p50/p75 of the newest SAMPLE timed builds of the bucket in WINDOW_DAYS (builder_turns rows with
// sample = 1, written by finish()); code defaults until there are MIN_SAMPLES. With defaults the page says "About …"
// instead of "Usually …" (src: 'default'), because "usually" claims something observed. The building blocks' defaults
// are computed from their fixed chunk delay, so they are exact (src: 'data').
// Only real events move the hint: the first saved version (tail) and a follow-up read (msg). Thresholds only ever move
// later, so "taking a bit longer than usual" always agrees with what was shown. Numbers only (whole minutes and ms):
// the page words them in the reader's language. Never a model name. The cache is per process (one instance, runner.js).
import { q, now as nowMs } from '../db.js';
import { log } from '../services/log.js';
import { isThreeGame } from '../services/vendor.js';
import { asksFor3d } from './prompt.js';
import { chunkDelay } from './mock.js';

export const ETA = {
  WINDOW_DAYS: 30, SAMPLE: 40, MIN_SAMPLES: 10, CACHE_MS: 5 * 60e3,
  MIN_MS: 1000,           // a timed build shorter than this is not a sample (tests lower it: the mock runs at delay 0)
  QUESTION_MAX_MS: 60e3,  // a question reply longer than this is not a sample
  SHOW_MIN_MS: 20e3,      // below this p75: no line (a quick build)
  UNDER_MAX_MS: 50e3,     // up to this p75: "less than a minute"
  TOL_MS: 10e3,           // the upper minute rounds up only past 10 s (70 s -> 1 minute, 71 s -> 2 minutes)
  SHOW_AT: { min: 6e3, max: 20e3, ai: 8e3 },   // when the line may show without an authoring step
  CAP_MIN: 15,            // never more than this many minutes (or the build time cap less a minute)
};
const M = 60e3;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const grace = ms => Math.max(15e3, Math.round(0.15 * ms));

/** What kind of build this is, before it runs. Pure: unlike prompt.wants3d it never writes state. */
export function predict({ provider, pro = false, cur = null, state = {}, text = '' }) {
  const p = provider === 'claude' ? 'ai' : 'blocks';
  return { p, pro: p === 'ai' && !!pro, k: cur ? 'change' : 'new', d3: asksFor3d(text) || !!(state && state.wants3d) || !!(cur && isThreeGame(cur.html)) };
}
export const keyOf = pred => `${pred.p}:${pred.pro ? 'pro' : 'std'}:${pred.k}:${pred.d3 ? '3d' : '2d'}`;
/** Nearest rank on a sorted list: 1..10 gives p25 3, p50 5, p75 8. */
export const quantile = (sorted, p) => sorted[clamp(Math.ceil(p * sorted.length) - 1, 0, sorted.length - 1)];

// First guesses that real builds replace (seconds). AI: from the standard 2D builds on record (40, 71 and 75 s, all
// inside "1–2 minutes") and reasoning; Pro takes about twice as long, 3D a little longer. [p25, p50, p75, tail p50, tail p75]
const AI = {
  'std:new:2d': [50, 75, 120, 30, 50], 'std:change:2d': [30, 45, 70, 25, 40], 'std:new:3d': [55, 80, 130, 60, 100], 'std:change:3d': [35, 55, 90, 30, 50],
  'pro:new:2d': [100, 150, 240, 60, 100], 'pro:change:2d': [60, 90, 150, 50, 80], 'pro:new:3d': [110, 160, 260, 120, 200], 'pro:change:3d': [70, 110, 180, 60, 100],
};
// The building blocks stream chunks at a fixed delay d: measured as chunks × d + a fixed overhead (ms).
// [[chunks, ms] for p25, p50, p75, tail p50, tail p75]
const BLOCKS = {
  'new:2d': [[17, 300], [21, 300], [22, 500], [5, 0], [6, 200]], 'change:2d': [[5, 100], [5, 200], [6, 400], [5, 0], [6, 400]],
  'new:3d': [[19, 400], [19, 500], [20, 700], [5, 0], [6, 0]], 'change:3d': [[5, 300], [5, 400], [6, 600], [5, 0], [6, 600]],
};
/** The defaults of a bucket, in ms. */
export function defaults(key) {
  const [p, pro, k, d3] = key.split(':');
  if (p === 'blocks') {
    const d = Math.max(0, chunkDelay()); const [a, b, c, t50, t75] = BLOCKS[`${k}:${d3}`].map(([n, ms]) => n * d + ms);
    return { p25: a, p50: b, p75: c, tail: { p50: t50, p75: t75 }, showAt: clamp(6 * d + 1000, ETA.SHOW_AT.min, ETA.SHOW_AT.max) };
  }
  const [a, b, c, t50, t75] = AI[`${pro}:${k}:${d3}`].map(s => s * 1000);
  return { p25: a, p50: b, p75: c, tail: { p50: t50, p75: t75 }, showAt: ETA.SHOW_AT.ai };
}

const cache = new Map();   // est_key -> { at, builds: [{ duration_ms, first_version_ms }], questions: [ms] } (≤ 12)
function rows(key, now) {
  const c = cache.get(key);
  if (c && Date.now() - c.at < ETA.CACHE_MS) return c;
  const since = now - ETA.WINDOW_DAYS * 86400e3;
  const builds = q.all('SELECT duration_ms, first_version_ms FROM builder_turns WHERE est_key=? AND sample=1 AND ended_at>=? ORDER BY ended_at DESC LIMIT ?', key, since, ETA.SAMPLE);
  const questions = q.all('SELECT duration_ms FROM builder_turns WHERE est_key=? AND sample=2 AND ended_at>=? ORDER BY ended_at DESC LIMIT ?', key, since, ETA.SAMPLE).map(r => r.duration_ms);
  const out = { at: Date.now(), builds, questions };
  cache.set(key, out);
  return out;
}
/** A bucket's numbers: real ones from 10 timed builds on, the defaults before (tail and showAt each need their own 10).
 *  -> { src: 'data' | 'default', n, p25, p50, p75, tail: { p50, p75 }, showAt } */
export function stats(key, now = nowMs()) {
  const dflt = defaults(key); const r = rows(key, now);
  const sorted = list => [...list].sort((a, b) => a - b);
  const out = { ...dflt, src: key.startsWith('blocks:') ? 'data' : 'default', n: 0 };
  if (r.builds.length >= ETA.MIN_SAMPLES) {
    const d = sorted(r.builds.map(x => x.duration_ms));
    Object.assign(out, { src: 'data', n: d.length, p25: quantile(d, 0.25), p50: quantile(d, 0.5), p75: quantile(d, 0.75) });
    const tails = sorted(r.builds.filter(x => x.first_version_ms > 0).map(x => Math.max(0, x.duration_ms - x.first_version_ms)));
    if (tails.length >= ETA.MIN_SAMPLES) out.tail = { p50: quantile(tails, 0.5), p75: quantile(tails, 0.75) };
  }
  if (r.questions.length >= ETA.MIN_SAMPLES) out.showAt = clamp(quantile(sorted(r.questions), 0.9), ETA.SHOW_AT.min, ETA.SHOW_AT.max);
  return out;
}

/** What to show for p25..p75, and when it counts as longer than usual (over) or a big job (big). Pure.
 *  -> { show: 'none' | 'under' | 'about' | 'range', lo?, hi?, hiMs, overAt, bigAt } (lo, hi: whole minutes). */
export function band({ p25, p75 }, capMs = 0) {
  const cap = capMs >= 2 * M ? capMs : Infinity;   // a test-sized cap clamps nothing
  const maxMin = Math.min(ETA.CAP_MIN, Number.isFinite(cap) ? Math.floor(cap / M) - 1 : ETA.CAP_MIN);
  let b;
  if (p75 < ETA.SHOW_MIN_MS) { const overAt = Math.max(p75, ETA.SHOW_MIN_MS) + 15e3; b = { show: 'none', hiMs: 0, overAt, bigAt: overAt + M }; }
  else {
    let lo = 0, hi = 1, show = 'under';
    if (p75 > ETA.UNDER_MAX_MS) {
      lo = clamp(Math.round(p25 / M), 1, maxMin); hi = clamp(Math.ceil((p75 - ETA.TOL_MS) / M), lo, maxMin);
      show = lo === hi ? 'about' : 'range';
    }
    const hiMs = hi * M, overAt = Math.max(p75, hiMs) + grace(hiMs);
    b = { show, ...(show === 'under' ? {} : { lo, hi }), hiMs, overAt, bigAt: Math.max(2 * hiMs, overAt + M) };
  }
  // The time cap ends a build anyway: "a big job" by then at the latest, and "longer than usual" before that.
  b.bigAt = Math.min(b.bigAt, cap); b.overAt = Math.min(b.overAt, b.bigAt - 30e3);
  return b;
}
/** What is left after the first saved version (its notes, checks and question). -> { show: 'none' | 'under' | 'about', n?, hiMs } */
export function tailBand({ p75 }) {
  if (p75 < 10e3) return { show: 'none', hiMs: 0 };
  if (p75 <= ETA.UNDER_MAX_MS) return { show: 'under', hiMs: M };
  const n = clamp(Math.ceil((p75 - ETA.TOL_MS) / M), 1, ETA.CAP_MIN);
  return { show: 'about', n, hiMs: n * M };
}

/**
 * The estimate for a build about to run. -> est (kept by the build: its thresholds move with tail() and onFollowUp()),
 * with est.start the eta 'start' payload (the caller adds el), or null (never throws).
 */
export function estimate(pred, { capMs = 0, now = nowMs() } = {}) {
  try {
    const key = keyOf(pred), s = stats(key, now), b = band(s, capMs);
    const start = { v: 1, phase: 'start', p: pred.p, src: s.src, n: s.n, show: b.show, ...(b.lo ? { lo: b.lo, hi: b.hi } : {}), overAt: b.overAt, bigAt: b.bigAt, showAt: s.showAt };
    return { key, pred, capMs, show: b.show, hiMs: b.hiMs, overAt: b.overAt, bigAt: b.bigAt, tail: s.tail, start };
  } catch (e) { log('warn', 'builder estimate failed', { error: e.message }); return null; }
}
/** The first version was saved firstV ms into the build: the eta 'tail' payload ("Saved! Finishing up usually takes…"),
 *  or null when there is nothing to say (no line shown, or the rest is quick). */
export function tail(est, firstV) {
  if (!est || est.show === 'none') return null;
  const tb = tailBand(est.tail || { p75: 0 }); if (tb.show === 'none') return null;
  est.overAt = Math.max(est.overAt, firstV + tb.hiMs + grace(tb.hiMs)); est.bigAt = Math.max(est.bigAt, est.overAt + M);
  return { v: 1, phase: 'tail', el: firstV, show: tb.show, ...(tb.n ? { n: tb.n } : {}), overAt: est.overAt, bigAt: est.bigAt };
}
/** A follow-up was handed over el ms into the build: making a change takes about as long as a change build, so the
 *  thresholds move that far later (no new number is shown). -> the eta 'msg' payload, or null. */
export function onFollowUp(est, el) {
  if (!est) return null;
  try {
    const ch = band(stats(keyOf({ ...est.pred, k: 'change' })), est.capMs);
    const hi = ch.hiMs || M;
    est.overAt = Math.max(est.overAt, el + hi + grace(hi)); est.bigAt = Math.max(est.bigAt, est.overAt + M);
    return { v: 1, phase: 'msg', el, overAt: est.overAt, bigAt: est.bigAt };
  } catch (e) { log('warn', 'builder estimate failed', { error: e.message }); return null; }
}

/** Is this finished build a sample? 1 = a timed build, 2 = a timed question reply, 0 = not used. Only first attempts of
 *  builds started by a message, that ended well with no follow-ups read, inside sensible times. */
export function sampleOf({ kind, end, followups = 0, attempt = 1, chain = 0, durationMs = 0, capMs = Infinity }) {
  if (end !== 'ok' || followups > 0 || attempt !== 1 || chain !== 0 || durationMs < ETA.MIN_MS) return 0;
  if (kind === 'question') return durationMs <= ETA.QUESTION_MAX_MS ? 2 : 0;
  return durationMs <= capMs ? 1 : 0;
}
/** The build ended: write what it was and whether it is a sample (duration_ms is written by turns.finish). Clears the
 *  bucket's cache, so the next build reads the new numbers. Never throws. */
export function finish({ id, est, versions = 0, base = null, firstVersionMs = 0, followups = 0, end, attempt = 1, chain = 0, durationMs = 0, capMs = Infinity }) {
  try {
    const kind = versions > 0 ? (base != null ? 'change' : 'new') : 'question';
    const sample = est ? sampleOf({ kind, end, followups, attempt, chain, durationMs, capMs }) : 0;
    q.run('UPDATE builder_turns SET est_key=?, eta_hi_ms=?, eta_over_ms=?, kind=?, first_version_ms=?, followups=?, sample=? WHERE id=?',
      est ? est.key : '', est ? est.hiMs : 0, est ? est.overAt : 0, kind, Math.max(0, Math.round(firstVersionMs) || 0), followups, sample, id);
    if (est) cache.delete(est.key);
    return { kind, sample };
  } catch (e) { log('warn', 'builder estimate stats not saved', { turn: id, error: e.message }); return null; }
}
/** Tests: forget the cache. */
export const _reset = () => cache.clear();
