// In-memory fixed-window rate limiter. limit(key, max, windowMs) -> true if allowed.
import { tReq } from '../i18n/index.js';
const buckets = new Map();
export function allow(key, max, windowMs) {
  const t = Date.now(); let b = buckets.get(key);
  if (!b || b.reset < t) { b = { n: 0, reset: t + windowMs }; buckets.set(key, b); }
  b.n++; return b.n <= max;
}
/** Current count in a window without incrementing it (for "check, then only penalise failures" flows like login). */
export function count(key) { const b = buckets.get(key); return b && b.reset > Date.now() ? b.n : 0; }
/** Express middleware: limit per user (or IP) per route name. msgKey: an i18n key for the kid-friendly "slow down" message. */
export function rateLimit(name, max, windowMs, msgKey = 'errors.api.slowDown') {
  return (req, res, next) => {
    // req.ip: the socket address when `trust proxy` is off (direct, unspoofable) or the real client IP behind a
    // configured proxy. Keeping trust proxy correct (default off) is what stops X-Forwarded-For spoofing.
    const who = req.user ? req.user.id : (req.ip || 'anon');
    if (allow(`${name}:${who}`, max, windowMs)) return next();
    res.status(429).json({ error: tReq(req)(msgKey) });
  };
}
setInterval(() => { const t = Date.now(); for (const [k, b] of buckets) if (b.reset < t) buckets.delete(k); }, 60e3).unref();
export const _reset = () => buckets.clear();
