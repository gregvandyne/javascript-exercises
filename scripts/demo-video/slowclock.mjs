// Demo recording only: Oomba Live's server clock runs at LIVE_CLOCK x real time, roughly the speed of the
// frame-by-frame capture, so question timers don't run out while frames are being shot.
import { hooks } from '../../server/services/classlive-sessions.js';
const k = +process.env.LIVE_CLOCK || 1, r = Date.now();
hooks.now = () => Math.round(r + (Date.now() - r) * k);
for (const key of ['countdownMs']) hooks[key] = Math.round(hooks[key] * k / k);
console.log('live clock x', k);
