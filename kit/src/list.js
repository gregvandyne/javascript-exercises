// The display list: one pooled struct-of-arrays that both backends read. Nothing is allocated per frame; the arrays
// grow (doubling) only if a scene needs more than it ever has before, so the steady state never allocates.
// order() counting-sorts by layer and keeps submit order inside a layer (painter's order is never broken).
import { LAYERS } from './tokens.js';

const FIELDS_F = ['x', 'y', 'w', 'h', 'ax', 'ay', 'rot', 'alpha', 'tr', 'tg', 'tb', 'flash', 'emis', 'lit', 'par', 'wind', 'grade'];
export const BLEND_ALPHA = 0, BLEND_ADD = 1;
export const NLAYERS = LAYERS.length;

export class DisplayList {
  constructor(cap = 4096) { this.n = 0; this.grows = 0; this._alloc(cap); }
  _alloc(cap) {
    const old = this.cap ? this : null;
    this.cap = cap;
    const nf = {}; for (const f of FIELDS_F) nf[f] = new Float32Array(cap);
    const e = new Int32Array(cap), layer = new Uint8Array(cap), blend = new Uint8Array(cap);
    if (old) { for (const f of FIELDS_F) nf[f].set(this[f]); e.set(this.e); layer.set(this.layer); blend.set(this.blend); this.grows++; }
    Object.assign(this, nf); this.e = e; this.layer = layer; this.blend = blend;
    this.idx = new Uint32Array(cap); this.counts = new Uint32Array(NLAYERS + 1);
  }
  clear() { this.n = 0; }
  /** push(entryId, x, y, w, h, layer, par) -> index; other fields reset to defaults (tint 1, alpha 1, anchor .5). */
  push(e, x, y, w, h, layer = 5, par = 1) {
    if (this.n >= this.cap) this._alloc(this.cap * 2);
    const i = this.n++;
    this.e[i] = e; this.x[i] = x; this.y[i] = y; this.w[i] = w; this.h[i] = h; this.layer[i] = layer; this.par[i] = par;
    this.ax[i] = 0.5; this.ay[i] = 0.5; this.rot[i] = 0; this.alpha[i] = 1; this.tr[i] = 1; this.tg[i] = 1; this.tb[i] = 1;
    this.flash[i] = 0; this.emis[i] = 0; this.lit[i] = 1; this.blend[i] = BLEND_ALPHA; this.wind[i] = 0; this.grade[i] = 1;
    return i;
  }
  /** Fill this.idx[0..n) with indices sorted by layer, stable. */
  order() {
    const c = this.counts; c.fill(0);
    const n = this.n, L = this.layer, idx = this.idx;
    for (let i = 0; i < n; i++) c[L[i] + 1]++;
    for (let k = 1; k <= NLAYERS; k++) c[k] += c[k - 1];
    for (let i = 0; i < n; i++) idx[c[L[i]]++] = i;
    return idx;
  }
}

/** The view a frame is drawn with (shared by both backends, so Paper and Glaze place every sprite identically).
 *  Design units -> device px: px = off + design * scale. World -> design: centre + (pos - cam * par) * zoom^par. */
export class View {
  constructor() {
    this.scale = 1; this.offX = 0; this.offY = 0; this.vw = 960; this.vh = 540;
    this.camX = 0; this.camY = 0; this.zoom = 1; this.shakeX = 0; this.shakeY = 0; this.shakeRot = 0;
    this.pw = 1; this.ph = 1;
  }
  /** Writes the 2x3 matrix (a,b,c,d,e,f) mapping item i's local px (origin at its anchor) to device px into out. */
  matrix(L, i, out) {
    const par = L.par[i], s = this.scale;
    let x, y, z = 1, rot = L.rot[i];
    if (par === 0) { x = L.x[i]; y = L.y[i]; }
    else {
      z = 1 + (this.zoom - 1) * Math.min(1, par);
      const k = Math.min(1, par);
      const dx = (L.x[i] - this.camX * par) * z, dy = (L.y[i] - this.camY * par) * z;
      // camera shake: offset + rotation around the screen centre, scaled by depth
      const cr = Math.cos(this.shakeRot * k), sr = Math.sin(this.shakeRot * k);
      x = this.vw / 2 + dx * cr - dy * sr + this.shakeX * k;
      y = this.vh / 2 + dx * sr + dy * cr + this.shakeY * k;
      rot += this.shakeRot * k;
    }
    const c = Math.cos(rot), sn = Math.sin(rot), m = s * z;
    // local units are design units of the sprite box (w x h), so scale by m
    out[0] = c * m; out[1] = sn * m; out[2] = -sn * m; out[3] = c * m;
    out[4] = this.offX + x * s; out[5] = this.offY + y * s;
    return out;
  }
}
