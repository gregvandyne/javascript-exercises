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
/** Forget a bucket (e.g. a teacher reset a locked-out child's password). */
export const clear = key => { buckets.delete(key); };
/** The bucket of failed sign-ins for one username (routes/auth.js counts it; a password reset clears it). */
export const loginLockKey = username => `login-user:${String(username || '').trim().toLowerCase().slice(0, 64)}`;
/** New guest accounts per address per hour (a whole school of guests playing at once fits). */
export const GUESTS_PER_IP_HOUR = 500;
/**
 * The client address for limits. req.ip is the socket address when `trust proxy` is off (direct, unspoofable) or the
 * real client IP behind a configured proxy. Some proxies (e.g. Azure App Service) add a port ("1.2.3.4:5678"), which
 * would give every connection its own bucket, so the port is dropped.
 */
export function ipOf(req) {
  const ip = String(req.ip || req.socket?.remoteAddress || 'anon');
  const v4 = ip.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/); if (v4) return v4[1];
  const v6 = ip.match(/^\[([0-9a-f:.]+)\](?::\d+)?$/i); if (v6) return v6[1];
  return ip;
}
/**
 * Express middleware: limit per user (or IP) per route name. msgKey: an i18n key for the kid-friendly "slow down" message.
 * byIp: always key on the address, never the session (for sign-in and sign-up, where fresh guest cookies are free).
 */
export function rateLimit(name, max, windowMs, msgKey = 'errors.api.slowDown', { byIp = false } = {}) {
  return (req, res, next) => {
    const who = req.user && !byIp ? req.user.id : ipOf(req);
    if (allow(`${name}:${who}`, max, windowMs)) return next();
    res.status(429).json({ error: tReq(req)(msgKey) });
  };
}
setInterval(() => { const t = Date.now(); for (const [k, b] of buckets) if (b.reset < t) buckets.delete(k); }, 60e3).unref();
export const _reset = () => buckets.clear();
