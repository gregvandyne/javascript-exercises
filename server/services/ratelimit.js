// In-memory fixed-window rate limiter. limit(key, max, windowMs) -> true if allowed.
const buckets = new Map();
export function allow(key, max, windowMs) {
  const t = Date.now(); let b = buckets.get(key);
  if (!b || b.reset < t) { b = { n: 0, reset: t + windowMs }; buckets.set(key, b); }
  b.n++; return b.n <= max;
}
/** Express middleware: limit per user (or IP) per route name. */
export function rateLimit(name, max, windowMs, msg = 'Whoa, slow down a little and try again in a minute.') {
  return (req, res, next) => {
    const who = req.user ? req.user.id : (req.ip || 'anon');
    if (allow(`${name}:${who}`, max, windowMs)) return next();
    res.status(429).json({ error: msg });
  };
}
setInterval(() => { const t = Date.now(); for (const [k, b] of buckets) if (b.reset < t) buckets.delete(k); }, 60e3).unref();
export const _reset = () => buckets.clear();
