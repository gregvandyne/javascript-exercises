// Demo recording only: Oomba Live's server clock runs at LIVE_CLOCK x real time, roughly the speed of the
// frame-by-frame capture, so question timers don't run out while frames are being shot.
// With LIVE_CLOCK_PORT, the recorder drives the clock instead: GET /now answers the server's time, GET /set?t=MS sets it
// (rec-live.mjs moves it with the pages' shared clock every frame, so the server, the host and the phones agree on
// every timer). While it is driven, Oomba Live's own server timers (the 3-2-1 countdowns, a question's end) run on that
// clock too, so the server doesn't start a question while the pages still count down. The port listens on 127.0.0.1.
import http from 'node:http';
import { hooks } from '../../server/services/classlive-sessions.js';
const k = +process.env.LIVE_CLOCK || 1, r = Date.now();
let set = null;
hooks.now = () => (set != null ? set : Math.round(r + (Date.now() - r) * k));
console.log('live clock x', k);
const port = +process.env.LIVE_CLOCK_PORT;
if (port) {
  // timers set by the live session code (services/classlive-*.js) while the clock is driven wait for the driven clock
  const realSet = globalThis.setTimeout, realClear = globalThis.clearTimeout, virt = new Set();
  globalThis.setTimeout = function (fn, ms, ...a) {
    if (set == null || typeof fn !== 'function' || !/classlive-/.test(new Error().stack || '')) return realSet(fn, ms, ...a);
    const t = { due: set + Math.max(0, +ms || 0), fn, a, unref() { return t; }, ref() { return t; }, hasRef: () => false, refresh() { return t; } };
    virt.add(t); return t;
  };
  globalThis.clearTimeout = t => { if (virt.has(t)) virt.delete(t); else realClear(t); };
  const runDue = () => {
    for (let guard = 0; guard < 1000; guard++) {
      let next = null; for (const t of virt) if (t.due <= set && (!next || t.due < next.due)) next = t;
      if (!next) return;
      virt.delete(next);
      try { next.fn(...next.a); } catch (e) { console.error('live clock timer', e); }
    }
  };
  http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/set' && Number.isFinite(+u.searchParams.get('t'))) { set = Math.round(+u.searchParams.get('t')); runDue(); }
    res.end(String(hooks.now()));
  }).listen(port, '127.0.0.1', () => console.log('live clock driven on port', port));
}
