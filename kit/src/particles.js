// Particles: one pooled struct-of-arrays, no allocation per frame. Presets name the feel; every burst is seeded.
// The cap follows the tier (120 / 300 / 600) and drops 80% with reduced motion.
import { hexToRgb } from './color.js';
import { PALETTE } from './tokens.js';

const C = h => hexToRgb(h).map(v => v / 255);
const CONFETTI = [PALETTE.mint[2], PALETTE.spark[2], PALETTE.coral[2], PALETTE.sky[2], PALETTE.grape[2], PALETTE.mint[1]].map(C);
// sprite: atlas sprite name; n: count; sp: speed range (units/s); g: gravity; drag; life (s); size (units); spin; add: additive
export const PRESETS = {
  sparkle: { sprite: 'twinkle', n: 14, sp: [80, 260], g: 60, drag: 2.2, life: [0.35, 0.7], size: [10, 22], spin: 4, add: 1, colors: [C(PALETTE.spark[1]), C('#FFFFFF'), C(PALETTE.spark[0])], shrink: 1 },
  dust: { sprite: 'puff', n: 7, sp: [30, 110], g: -20, drag: 3, life: [0.3, 0.55], size: [14, 26], spin: 1, add: 0, colors: [C(PALETTE.cream[0]), C(PALETTE.stone[0])], grow: 1, up: 0.25 },
  confetti: { sprite: 'confetti', n: 60, sp: [200, 520], g: 520, drag: 1.4, life: [1.6, 2.6], size: [9, 15], spin: 9, add: 0, colors: CONFETTI, flutter: 1, up: 1 },
  coins: { sprite: 'spark', n: 8, sp: [180, 340], g: 700, drag: 0.6, life: [0.7, 1], size: [16, 22], spin: 6, add: 0, colors: [[1, 1, 1]], up: 1 },
  splash: { sprite: 'dot', n: 12, sp: [90, 240], g: 600, drag: 1, life: [0.4, 0.7], size: [6, 12], spin: 0, add: 0, colors: [C(PALETTE.sky[1]), C(PALETTE.sky[0])], up: 1 },
  smoke: { sprite: 'puff', n: 6, sp: [20, 60], g: -60, drag: 1.5, life: [0.8, 1.4], size: [20, 40], spin: 1, add: 0, colors: [C(PALETTE.stone[1]), C(PALETTE.snow[2])], grow: 1 },
  hearts: { sprite: 'heart', n: 6, sp: [60, 160], g: -80, drag: 1.5, life: [0.8, 1.2], size: [14, 22], spin: 2, add: 0, colors: [[1, 1, 1]], up: 1 },
  // fireflies: small, green-yellow and slow (pickups are big, outlined and spark yellow, so the two never mix up)
  fireflies: { sprite: 'glow', n: 1, sp: [4, 14], g: 0, drag: 0, life: [6, 10], size: [7, 11], spin: 0, add: 1, colors: [C('#D4F57A'), C('#C2EE6E'), C('#E3F88F')], wander: 1, blink: 1 },
  chips: { sprite: 'chip', n: 10, sp: [120, 300], g: 900, drag: 0.8, life: [0.5, 0.8], size: [8, 14], spin: 10, add: 0, colors: [C(PALETTE.cocoa[1]), C(PALETTE.cocoa[2]), C(PALETTE.stone[1])], up: 1 },
  sparks: { sprite: 'twinkle', n: 10, sp: [160, 380], g: 300, drag: 1.2, life: [0.25, 0.5], size: [6, 12], spin: 8, add: 1, colors: [C(PALETTE.spark[2]), C(PALETTE.peach[1])], shrink: 1 },
};
export const PRESET_NAMES = Object.keys(PRESETS);
const MOVE = ['x', 'y', 'vx', 'vy', 'life', 'max', 'size', 'rot', 'vr', 'g', 'drag', 'r', 'gg', 'b', 'seed', 'sprite', 'add', 'flags', 'layer'];
const SPRITES = [...new Set(Object.values(PRESETS).map(p => p.sprite))];

export class Particles {
  constructor(cap = 1024, rng = Math.sin) {
    this.cap = cap; this.limit = 300; this.n = 0; this.rng = rng; this.reduced = false; this.k = 1;
    const F = () => new Float32Array(cap);
    this.x = F(); this.y = F(); this.vx = F(); this.vy = F(); this.life = F(); this.max = F(); this.size = F(); this.rot = F(); this.vr = F();
    this.g = F(); this.drag = F(); this.r = F(); this.gg = F(); this.b = F(); this.seed = F();
    this.sprite = new Uint8Array(cap); this.add = new Uint8Array(cap); this.flags = new Uint8Array(cap); this.layer = new Uint8Array(cap);
    this.spriteNames = SPRITES;
  }
  get count() { return this.n; }
  /** burst(preset, x, y, {n, color, dir (radians, cone up/out), spread, layer}) */
  burst(name, x, y, o = {}) {
    const P = PRESETS[name]; if (!P) return 0;
    let n = o.n != null ? o.n | 0 : P.n;
    if (this.reduced) n = Math.ceil(n * 0.2);
    n = Math.ceil(n * this.k);
    const R = this.rng, col = o.color ? C(o.color) : null;
    let made = 0;
    for (let k = 0; k < n; k++) {
      if (this.n >= Math.min(this.cap, this.limit)) break;
      const i = this.n++; made++;
      const sp = P.sp[0] + (P.sp[1] - P.sp[0]) * R();
      let a = o.dir != null ? o.dir + (R() - 0.5) * (o.spread != null ? o.spread : 1.2) : R() * Math.PI * 2;
      if (P.up && o.dir == null) a = -Math.PI / 2 + (R() - 0.5) * Math.PI * P.up;
      this.x[i] = x + (o.w ? (R() - 0.5) * o.w : 0); this.y[i] = y + (o.h ? (R() - 0.5) * o.h : 0);
      this.vx[i] = Math.cos(a) * sp; this.vy[i] = Math.sin(a) * sp;
      this.max[i] = this.life[i] = P.life[0] + (P.life[1] - P.life[0]) * R();
      this.size[i] = P.size[0] + (P.size[1] - P.size[0]) * R();
      this.rot[i] = R() * 6.283; this.vr[i] = (R() - 0.5) * 2 * P.spin;
      this.g[i] = P.g; this.drag[i] = P.drag; this.seed[i] = R() * 100;
      const c = col || P.colors[(R() * P.colors.length) | 0];
      this.r[i] = c[0]; this.gg[i] = c[1]; this.b[i] = c[2];
      this.sprite[i] = SPRITES.indexOf(P.sprite); this.add[i] = P.add;
      this.flags[i] = (P.shrink ? 1 : 0) | (P.grow ? 2 : 0) | (P.flutter ? 4 : 0) | (P.wander ? 8 : 0) | (P.blink ? 16 : 0);
      this.layer[i] = o.layer != null ? o.layer : 7;
    }
    return made;
  }
  update(dt, t) {
    let j = 0;
    for (let i = 0; i < this.n; i++) {
      const life = this.life[i] - dt;
      if (life <= 0) continue;
      if (j !== i) this._move(i, j);
      this.life[j] = life;
      const f = this.flags[j];
      if (f & 8) { // wander (fireflies): smooth noise steering
        const s = this.seed[j];
        this.vx[j] += Math.sin(t * 0.9 + s) * 18 * dt; this.vy[j] += Math.cos(t * 1.3 + s * 1.7) * 14 * dt;
        this.vx[j] *= 0.99; this.vy[j] *= 0.99;
      }
      const d = Math.max(0, 1 - this.drag[j] * dt);
      this.vx[j] *= d; this.vy[j] = this.vy[j] * d + this.g[j] * dt;
      if (f & 4) this.vx[j] += Math.sin(t * 6 + this.seed[j]) * 60 * dt;
      this.x[j] += this.vx[j] * dt; this.y[j] += this.vy[j] * dt; this.rot[j] += this.vr[j] * dt;
      j++;
    }
    this.n = j;
  }
  _move(i, j) { for (let k = 0; k < MOVE.length; k++) { const a = this[MOVE[k]]; a[j] = a[i]; } }
  /** Alpha/scale of particle i at time t (fade in/out, shrink, grow, blink). */
  look(i, t, out) {
    const k = this.life[i] / this.max[i], f = this.flags[i];
    let a = Math.min(1, k * 4) * Math.min(1, (1 - k) * 10 + 0.2), s = 1;
    if (f & 1) s = 0.3 + 0.7 * k;
    if (f & 2) { s = 0.6 + (1 - k) * 0.8; a *= k; }
    if (f & 16) a *= 0.2 + 0.8 * Math.max(0, Math.sin(t * 1.1 + this.seed[i] * 3));
    out[0] = a; out[1] = s; return out;
  }
  clear() { this.n = 0; }
}
