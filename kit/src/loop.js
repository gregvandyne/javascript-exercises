// The game clock: fixed 60 Hz updates, interpolated rendering, at most 5 updates per frame, hit-stop, slow-mo,
// assist speed (time.scale) and named pause reasons. Time comes only from rAF timestamps (layer.js's BRB_TUNE.speed
// patches rAF, so tuning speeds the kit up too). The class is pure: tests drive frame(ts) / step(n) directly.
import { Tweener } from './tween.js';

export const STEP_MS = 1000 / 60;
const STATS_N = 120;

export class Loop {
  constructor({ update = null, render = null, maxSteps = 5 } = {}) {
    this.update = update; this.render = render; this.maxSteps = maxSteps;
    this.now = 0;          // real ms (rAF clock)
    this.game = 0;         // game ms (scaled, stops while paused / in hit-stop)
    this.scale = 1;        // assist speed (settings: .5 / .75 / 1)
    this.slow = 1; this.slowLeft = 0;
    this.stopLeft = 0;     // hit-stop ms (real time)
    this.acc = 0; this.last = -1; this.frames = 0; this.steps = 0;
    this.reasons = new Set();
    this.tw = new Tweener();      // game-time tweens (stop with the game)
    this.ui = new Tweener();      // real-time tweens (menus, UI, pause screen)
    this.stats = new Float32Array(STATS_N); this.statsI = 0; this.statsN = 0;
    this.alpha = 1;
  }
  get paused() { return this.reasons.size > 0; }
  pause(reason = 'game') { this.reasons.add(reason); }
  resume(reason = 'game') { this.reasons.delete(reason); if (!this.reasons.size) this.acc = 0; }
  hitstop(ms = 60) { this.stopLeft = Math.max(this.stopLeft, Math.max(0, Math.min(200, +ms || 0))); }
  slowmo(scale = 0.3, ms = 300) { this.slow = Math.max(0.05, Math.min(1, +scale || 1)); this.slowLeft = Math.max(0, +ms || 0); }
  /** One rAF tick at timestamp ts (ms). Returns the number of fixed updates run. */
  frame(ts) {
    let dt = this.last < 0 ? STEP_MS : ts - this.last;
    this.last = ts;
    if (!(dt >= 0)) dt = 0;
    if (dt > 100) dt = 100;        // a stalled tab or a breakpoint: never spiral
    this.now += dt; this.frames++;
    this.stats[this.statsI] = dt; this.statsI = (this.statsI + 1) % STATS_N; if (this.statsN < STATS_N) this.statsN++;
    this.ui.tick(dt);
    let n = 0;
    if (!this.paused) {
      let rest = dt;
      if (this.stopLeft > 0) { const use = Math.min(this.stopLeft, rest); this.stopLeft -= use; rest -= use; }   // hit-stop eats time first
      if (rest > 0) {
        const s = this.scale * this.slow;
        if (this.slowLeft > 0) { this.slowLeft -= rest; if (this.slowLeft <= 0) { this.slow = 1; this.slowLeft = 0; } }
        this.acc += rest * s;
        while (this.acc >= STEP_MS && n < this.maxSteps) { this._update(); this.acc -= STEP_MS; n++; }
        if (n === this.maxSteps && this.acc >= STEP_MS) this.acc = 0;   // drop time rather than fall behind
      }
    }
    this.alpha = this.paused ? 1 : Math.max(0, Math.min(1, this.acc / STEP_MS));
    if (this.render) this.render(this.alpha, dt);
    return n;
  }
  /** Advance n fixed updates with a frozen real clock (tests, __brbTest.step). Runs even while paused for 'test' only. */
  step(n = 1) {
    for (let i = 0; i < n; i++) this._update();
    this.alpha = 1;
    if (this.render) this.render(1, 0);
  }
  _update() {
    this.game += STEP_MS; this.steps++;
    this.tw.tick(STEP_MS);
    if (this.update) this.update(STEP_MS / 1000);
  }
  /** Frame-interval percentiles over the last 120 frames. */
  frameStats() {
    const n = this.statsN; if (!n) return { p50: 0, p90: 0, p95: 0, max: 0, n: 0 };
    const a = Array.from(this.stats.subarray(0, n)).sort((x, y) => x - y);
    const q = p => a[Math.min(n - 1, Math.floor(p * n))];
    return { p50: q(0.5), p90: q(0.9), p95: q(0.95), max: a[n - 1], n };
  }
}

/** Drive a Loop from requestAnimationFrame. Returns stop(). Pauses on a hidden page and while the frame has lost focus
 *  (a click on the page around the game): loop.onHide / onShow / onBlur / onFocus let the kit suspend audio and open
 *  the pause screen. */
export function runLoop(loop, win = typeof window !== 'undefined' ? window : null) {
  if (!win || !win.requestAnimationFrame) return () => {};
  let live = true, id = 0;
  const tick = ts => { if (!live) return; id = win.requestAnimationFrame(tick); try { loop.frame(ts); } catch (e) { if (win.console) win.console.error(e); } };
  id = win.requestAnimationFrame(tick);
  const call = fn => { if (typeof fn === 'function') { try { fn(); } catch (e) { /* ignore */ } } };
  const vis = () => {
    const d = win.document;
    if (d && d.visibilityState === 'hidden') { loop.pause('hidden'); call(loop.onHide); }
    else { loop.resume('hidden'); loop.last = -1; call(loop.onShow); }
  };
  const blur = () => { loop.pause('blur'); call(loop.onBlur); };
  const focus = () => { if (loop.reasons.has('blur')) { loop.resume('blur'); loop.last = -1; } call(loop.onFocus); };
  if (win.document) win.document.addEventListener('visibilitychange', vis);
  win.addEventListener('blur', blur); win.addEventListener('focus', focus);
  return () => { live = false; win.cancelAnimationFrame(id); if (win.document) win.document.removeEventListener('visibilitychange', vis); win.removeEventListener('blur', blur); win.removeEventListener('focus', focus); };
}
