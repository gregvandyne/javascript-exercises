// The camera: follow with look-ahead and a dead zone, smoothing, level bounds, trauma shake (spec §2.6), zoom punch and
// pans. (x, y) is the world point at the centre of the view. Reduced motion: no shake, no punch.
import { noise1 } from './rand.js';
import { motion } from './tokens.js';

export class Camera {
  constructor() {
    this.x = 0; this.y = 0; this.zoom = 1; this.vw = 960; this.vh = 540;
    this.target = null; this.lookAhead = 0.25; this.dead = [0.2, 0.3]; this.smooth = 0.12; this.look = 0;
    this.rect = null; this.trauma = 0; this.t = 0; this.punchZ = 0;
    this.sx = 0; this.sy = 0; this.srot = 0; this.reduced = false; this.panning = false;
  }
  follow(e, o = {}) {
    this.target = e;
    if (o.lookAhead != null) this.lookAhead = +o.lookAhead;
    if (o.deadzone) this.dead = o.deadzone;
    if (o.smooth != null) this.smooth = +o.smooth;
    if (e && o.snap !== false) { this.x = e.x; this.y = e.y; this.clamp(); }
    return this;
  }
  bounds(r) { this.rect = r ? { x: +r.x || 0, y: +r.y || 0, w: +r.w || 0, h: +r.h || 0 } : null; this.clamp(); return this; }
  shake(t = 0.4) { if (!this.reduced) this.trauma = Math.min(1, this.trauma + t); }
  punch(z = 1.06) { if (!this.reduced) this.punchZ = Math.max(this.punchZ, z - 1); }
  /** Fit a group of entities in view (centre on them; zoom out down to 0.6 if needed). */
  frame(ents) {
    if (!ents || !ents.length) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const e of ents) { x0 = Math.min(x0, e.x); y0 = Math.min(y0, e.y); x1 = Math.max(x1, e.x); y1 = Math.max(y1, e.y); }
    this.x = (x0 + x1) / 2; this.y = (y0 + y1) / 2;
    this.zoom = Math.max(0.6, Math.min(1, Math.min(this.vw / (x1 - x0 + 200), this.vh / (y1 - y0 + 200))));
    this.clamp();
  }
  clamp() {
    const r = this.rect; if (!r) return;
    const hw = this.vw / 2 / this.zoom, hh = this.vh / 2 / this.zoom;
    this.x = r.w <= hw * 2 ? r.x + r.w / 2 : Math.max(r.x + hw, Math.min(r.x + r.w - hw, this.x));
    this.y = r.h <= hh * 2 ? r.y + r.h / 2 : Math.max(r.y + hh, Math.min(r.y + r.h - hh, this.y));
  }
  /** dt in seconds (fixed step). */
  update(dt) {
    this.t += dt;
    const e = this.target;
    if (e && !this.panning) {
      const vx = e.vx || 0;
      this.look += ((Math.abs(vx) > 20 ? Math.sign(vx) : this.look > 0 ? 1 : this.look < 0 ? -1 : 0) * this.lookAhead * this.vw - this.look) * Math.min(1, dt * 2.5);
      const tx = e.x + this.look * 0.5, ty = e.y;
      const dzx = this.dead[0] * this.vw / 2, dzy = this.dead[1] * this.vh / 2;
      let gx = this.x, gy = this.y;
      if (tx > this.x + dzx) gx = tx - dzx; else if (tx < this.x - dzx) gx = tx + dzx;
      if (ty > this.y + dzy) gy = ty - dzy; else if (ty < this.y - dzy) gy = ty + dzy;
      const k = 1 - Math.pow(1 - Math.min(0.99, this.smooth), dt * 60);
      this.x += (gx - this.x) * k; this.y += (gy - this.y) * k;
    }
    this.clamp();
    // shake: offset = 18px * trauma² * noise(t*25), rotation ±3° * trauma²; trauma decays 1.6/s
    const S = motion.shake, tr = this.reduced ? 0 : this.trauma * this.trauma;
    this.sx = S.px * tr * noise1(this.t * S.freq) || 0; this.sy = S.px * tr * noise1(this.t * S.freq + 100) || 0;
    this.srot = (S.deg * Math.PI / 180) * tr * noise1(this.t * S.freq + 200);
    this.trauma = Math.max(0, this.trauma - S.decay * dt);
    this.punchZ = Math.max(0, this.punchZ - dt * 0.35);
  }
  get effZoom() { return this.zoom * (1 + this.punchZ); }
  toScreen(p) { const z = this.effZoom; return { x: this.vw / 2 + (p.x - this.x) * z, y: this.vh / 2 + (p.y - this.y) * z }; }
  toWorld(p) { const z = this.effZoom; return { x: this.x + (p.x - this.vw / 2) / z, y: this.y + (p.y - this.vh / 2) / z }; }
}
