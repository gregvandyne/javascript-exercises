// Deterministic frame-by-frame capture: a virtual clock in every frame of a page (performance.now, Date.now, rAF,
// timers, CSS/Web animations), stepped exactly 1/30 s per output frame by the controller, then a screenshot.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const FPS = 30, DT = 1000 / FPS;

/** The init script: installs window.__vc in every document (top and frames). Time stands still until stepped. */
export const VCLOCK = () => {
  if (window.__vc) return;
  const realPerf = performance.now.bind(performance), realDate = Date.now, RealDate = Date;
  const t0p = realPerf(), t0d = realDate();
  let vt = 0;  // virtual ms since this document started
  let nextId = 1; const timers = new Map(); let rafs = new Map(); let rafId = 1;
  performance.now = () => t0p + vt;
  const vnow = () => t0d + vt;
  Date.now = vnow;
  // new Date() with no args -> virtual now
  const VDate = function (...a) { if (!(this instanceof VDate)) return new RealDate(vnow()).toString(); return a.length ? new RealDate(...a) : new RealDate(vnow()); };
  VDate.prototype = RealDate.prototype; VDate.now = vnow; VDate.parse = RealDate.parse; VDate.UTC = RealDate.UTC;
  try { window.Date = VDate; } catch { /* locked */ }
  window.setTimeout = (fn, ms = 0, ...a) => { const id = nextId++; timers.set(id, { fn, at: vt + Math.max(0, +ms || 0), a, every: 0 }); return id; };
  window.setInterval = (fn, ms = 0, ...a) => { const id = nextId++; const every = Math.max(4, +ms || 0); timers.set(id, { fn, at: vt + every, a, every }); return id; };
  window.clearTimeout = window.clearInterval = id => { timers.delete(id); };
  window.requestAnimationFrame = fn => { const id = rafId++; rafs.set(id, fn); return id; };
  window.cancelAnimationFrame = id => { rafs.delete(id); };
  window.requestIdleCallback = fn => window.setTimeout(() => fn({ didTimeout: false, timeRemaining: () => 8 }), 1);
  window.cancelIdleCallback = id => window.clearTimeout(id);
  const seen = new WeakSet();
  const grab = () => { try { for (const an of document.getAnimations()) if (!seen.has(an)) { seen.add(an); an.__vcStart = an.currentTime || 0; an.pause(); } } catch { /* none */ } };
  // pause animations as soon as they start
  for (const ev of ['animationstart', 'transitionrun', 'transitionstart']) document.addEventListener(ev, grab, true);
  const rawAnimate = Element.prototype.animate;
  Element.prototype.animate = function (...a) { const an = rawAnimate.apply(this, a); try { seen.add(an); an.pause(); } catch {} return an; };
  const run = (fn, a) => { try { typeof fn === 'function' ? fn(...a) : (0, eval)(String(fn)); } catch (e) { console.error(e); } };
  window.__vc = {
    get t() { return vt; },
    step(dt) {
      const end = vt + dt;
      // timers due within this step, in time order (new ones scheduled while running are picked up too)
      for (let guard = 0; guard < 5000; guard++) {
        let best = null, bid = 0; for (const [id, t] of timers) if (t.at <= end && (!best || t.at < best.at)) { best = t; bid = id; }
        if (!best) break;
        vt = Math.max(vt, best.at);
        if (best.every) best.at += best.every; else timers.delete(bid);
        run(best.fn, best.a);
      }
      vt = end;
      grab();
      try { for (const an of document.getAnimations()) { if (!seen.has(an)) { seen.add(an); an.pause(); } if (an.playState !== 'finished' || an.currentTime == null) an.currentTime = (an.currentTime || 0) + dt; } } catch { /* none */ }
      const list = rafs; rafs = new Map();
      for (const fn of list.values()) run(fn, [t0p + vt]);
      return vt;
    },
  };
};

/** A capture session over one or more pages, all stepped together. */
export class Capture {
  constructor(pages, dir, extras = []) { this.pages = pages; this.extras = extras; this.dir = dir; this.n = 0; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true }); for (const p of pages) fs.mkdirSync(path.join(dir, p.__name || 'p'), { recursive: true }); }
  static async install(ctx) { await ctx.addInitScript(VCLOCK); }
  /** Advance every frame of every page by ms without capturing (setup, loading). */
  async advance(ms, chunk = DT) { for (let t = 0; t < ms; t += chunk) await this.stepAll(Math.min(chunk, ms - t)); }
  async stepAll(dt) {
    await Promise.all([...this.pages, ...this.extras].map(p => Promise.all(p.frames().map(f => f.evaluate(dt => window.__vc ? window.__vc.step(dt) : 0, dt).catch(() => 0)))));
  }
  /** Step one output frame and screenshot every page. onFrame(i) runs input before the step. */
  async frame() {
    await this.stepAll(DT);
    await Promise.all(this.pages.map(async p => { const file = path.join(this.dir, p.__name || 'p', `f${String(this.n).padStart(5, '0')}.jpg`); await p.screenshot({ path: file, type: 'jpeg', quality: 93 }); }));
    this.n++;
  }
  async frames(n, onFrame) { for (let i = 0; i < n; i++) { if (onFrame) await onFrame(i, n); await this.frame(); } }
  async seconds(s, onFrame) { await this.frames(Math.round(s * FPS), onFrame); }
  /** Encode each page's frames to an MP4 at 30 fps. -> { name: file } */
  encode(name, sizes) {
    const out = {};
    for (const p of this.pages) {
      const nm = p.__name || 'p', [w, h] = sizes[nm];
      const file = path.join(path.dirname(this.dir), `${name}${this.pages.length > 1 ? '-' + nm : ''}.mp4`);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(this.dir, nm, 'f%05d.jpg'), '-vf', `scale=${w}:${h}:flags=lanczos,setsar=1`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '15', '-pix_fmt', 'yuv420p', '-r', String(FPS), file]);
      out[nm] = file;
    }
    fs.rmSync(this.dir, { recursive: true, force: true });
    return out;
  }
}

/** Smooth cursor/ring overlay, positioned by the controller each frame (no page timers). */
export async function cursorInit(page) {
  await page.evaluate(() => {
    if (document.getElementById('demo-cursor')) return;
    const c = document.createElement('div'); c.id = 'demo-cursor';
    c.innerHTML = '<svg width="34" height="40" viewBox="0 0 34 40"><path d="M3 2 L3 32 L11 25 L17 38 L23 35 L17 23 L28 23 Z" fill="#141414" stroke="#FFFDF2" stroke-width="2.5" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: 'fixed', left: '0', top: '0', zIndex: 2147483647, pointerEvents: 'none', transform: 'translate(-200px,-200px)', filter: 'drop-shadow(0 3px 4px rgba(0,0,0,.25))' });
    document.documentElement.appendChild(c);
    const ring = document.createElement('div'); ring.id = 'demo-ring';
    Object.assign(ring.style, { position: 'fixed', left: '0', top: '0', width: '44px', height: '44px', margin: '-22px 0 0 -22px', borderRadius: '50%', border: '4px solid #FFD23F', zIndex: 2147483646, pointerEvents: 'none', opacity: '0' });
    document.documentElement.appendChild(ring);
    window.__cur = { x: innerWidth * 0.62, y: innerHeight * 0.72 };
  });
}
export const setCursor = (page, x, y, ring = -1) => page.evaluate(({ x, y, ring }) => {
  const c = document.getElementById('demo-cursor'); if (c) c.style.transform = `translate(${x}px,${y}px)`; window.__cur = { x, y };
  const r = document.getElementById('demo-ring'); if (r) { if (ring >= 0) { r.style.left = x + 'px'; r.style.top = y + 'px'; r.style.opacity = String(Math.max(0, 1 - ring)); r.style.transform = `scale(${0.4 + ring})`; } else r.style.opacity = '0'; }
}, { x, y, ring });
const ease = k => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
/** Glide the cursor to a locator over `sec` seconds of video (captured), then optionally click with a ring. */
export async function glide(cap, page, loc, { sec = 0.6, click = true, dx = 0.5, dy = 0.5 } = {}) {
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  const b = await loc.boundingBox(); if (!b) throw new Error('no box');
  const x = b.x + b.width * dx, y = b.y + b.height * dy;
  const s = await page.evaluate(() => window.__cur || { x: innerWidth * 0.6, y: innerHeight * 0.7 });
  const n = Math.max(1, Math.round(sec * 30));
  await cap.frames(n, i => { const k = ease((i + 1) / n); return setCursor(page, s.x + (x - s.x) * k, s.y + (y - s.y) * k); });
  if (click) { await loc.click({ noWaitAfter: true }).catch(e => console.log('click', e.message)); await cap.frames(9, i => setCursor(page, x, y, i / 9)); await setCursor(page, x, y); }
  return { x, y };
}
