// Tweens, timers and springs, all driven by the kit clock (never by setTimeout or Date), so hit-stop, slow-mo,
// pause, BRB_TUNE.speed and __brbTest.step(n) move them exactly like the game.
import { easeFn } from './ease.js';

/** A tween/timer/spring set. tick(dtMs) advances everything; the loop owns two: game time and real (UI) time. */
export class Tweener {
  constructor() { this.items = []; this.springs = []; }
  /** tween(target, {x: 10, alpha: 0}, {ms, ease, delay, onUpdate}) -> Promise & {cancel()} */
  tween(target, props, opts = {}) {
    const ms = Math.max(0, +opts.ms || (opts.ms === 0 ? 0 : 300));
    const item = { target, props, from: null, ms, t: -(+opts.delay || 0), ease: easeFn(opts.ease), onUpdate: opts.onUpdate || null, done: false, resolve: null };
    const p = new Promise(res => { item.resolve = res; });
    p.cancel = () => this._finish(item, false);
    p.finish = () => { item.t = item.ms; this._apply(item, 1); this._finish(item, true); };
    this.items.push(item);
    if (ms === 0 && item.t >= 0) { this._start(item); this._apply(item, 1); this._finish(item, true); }
    return p;
  }
  /** wait(ms) -> Promise (a game-time delay). */
  wait(ms) { return this.tween(null, null, { ms }); }
  /** after(ms, fn) -> cancel. Fires inside tick() (synchronously), so step(n) runs timers exactly. */
  after(ms, fn) { const it = this._timer(ms, fn, false); return () => this._finish(it, false); }
  /** every(ms, fn) -> cancel */
  every(ms, fn) { const it = this._timer(Math.max(1, ms), fn, true); return () => this._finish(it, false); }
  _timer(ms, fn, repeat) {
    const it = { target: null, props: null, from: null, ms: Math.max(0, +ms || 0), t: 0, ease: easeFn('linear'), onUpdate: null, done: false, resolve: () => {}, fn, repeat };
    this.items.push(it); return it;
  }
  /** spring(target, prop, {k, zeta}) -> {to(v), set(v), value, velocity, stop()}. Mass 1; settles without overshoot when zeta >= 1. */
  spring(target, prop, opts = {}) {
    const s = { target, prop, k: +opts.k || 180, zeta: opts.zeta == null ? 0.55 : +opts.zeta, goal: +target[prop] || 0, v: 0, live: true };
    const api = {
      to: v => { s.goal = +v; if (!s.live) { s.live = true; this.springs.push(s); } },
      set: v => { target[prop] = +v; s.goal = +v; s.v = 0; },
      kick: v => { s.v += +v; if (!s.live) { s.live = true; this.springs.push(s); } },
      get value() { return target[prop]; }, get velocity() { return s.v; },
      get settled() { return !s.live; },
      stop: () => { s.live = false; },
    };
    this.springs.push(s);
    return api;
  }
  tick(dtMs) {
    if (!(dtMs > 0)) return;
    const list = this.items;
    for (let i = 0, n = list.length; i < n; i++) {
      const it = list[i];
      if (it.done) continue;
      const was = it.t; it.t += dtMs;
      if (it.t < 0) continue;
      if (was < 0 || it.from === null) this._start(it);
      if (it.fn) {   // timer
        while (!it.done && it.t >= it.ms) {
          try { it.fn(); } catch (e) { /* a timer bug never stops the clock */ }
          if (it.repeat && it.ms > 0) it.t -= it.ms; else this._finish(it, true);
        }
        continue;
      }
      const k = it.ms > 0 ? Math.min(1, it.t / it.ms) : 1;
      this._apply(it, it.ease(k));
      if (k >= 1) this._finish(it, true);
    }
    if (list.length && list.some(it => it.done)) this.items = list.filter(it => !it.done);
    // Springs: semi-implicit Euler in fixed 1/240 s sub-steps (stable for the k/zeta ranges the kit uses).
    let rest = Math.min(dtMs, 100) / 1000;
    while (rest > 1e-6) {
      const h = Math.min(rest, 1 / 240); rest -= h;
      for (const s of this.springs) {
        if (!s.live) continue;
        const x = +s.target[s.prop] || 0, c = 2 * s.zeta * Math.sqrt(s.k);
        s.v += (-s.k * (x - s.goal) - c * s.v) * h;
        s.target[s.prop] = x + s.v * h;
        if (Math.abs(s.v) < 1e-3 && Math.abs(x - s.goal) < 1e-3) { s.target[s.prop] = s.goal; s.v = 0; s.live = false; }
      }
    }
    if (this.springs.length && this.springs.some(s => !s.live)) this.springs = this.springs.filter(s => s.live);
  }
  clear() { for (const it of this.items) this._finish(it, false); this.items = []; this.springs = []; }
  get size() { return this.items.length + this.springs.length; }
  _start(it) {
    if (!it.target || !it.props || it.from) return;
    it.from = {};
    for (const k in it.props) it.from[k] = +it.target[k] || 0;
  }
  _apply(it, e) {
    if (!it.target || !it.props) return;
    if (!it.from) this._start(it);
    for (const k in it.props) it.target[k] = it.from[k] + (+it.props[k] - it.from[k]) * e;
    if (it.onUpdate) it.onUpdate(e);
  }
  _finish(it, ok) { if (it.done) return; it.done = true; it.resolve(ok); }
}
/** Promise helpers: seq runs step functions one after another; all waits for every promise; stagger starts fn per item gapMs apart. */
export const seq = async steps => { for (const s of steps) await s(); };
export const all = ps => Promise.all(ps);
export function stagger(tw, items, fn, gapMs) { return Promise.all(items.map((it, i) => tw.wait(i * gapMs).then(() => fn(it, i)))); }
