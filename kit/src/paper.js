// Paper: the Canvas 2D backend and the reference look (a finished sticker-book style, not a fallback mode).
// Stateless: it reads the display list, the atlas and the frame params. Night on Paper crossfades each sprite toward its
// baked 'night' variant (cool-tinted, glowing and unlit parts kept bright) by timeOfDay x the sprite's grade (scenery 1,
// the cast and pickups about a quarter, so they stay warm), and lights glow with baked radial sprites drawn with
// 'lighter' (the stage puts light halos in the display list). No shadowBlur and no ctx.filter, ever; gradients only at bake time.
import { BLEND_ADD } from './list.js';
import { MOON_GRADE } from './atlas.js';
import { skyAt } from './sky.js';
import { INK } from './tokens.js';

export class Paper {
  constructor(canvas, atlas) {
    this.canvas = canvas; this.atlas = atlas; this.name = 'paper';
    this.ctx = canvas.getContext('2d', { alpha: false });
    if (!this.ctx) throw new Error('no 2d context');
    this.m = new Float32Array(6); this.skyC = null; this.skyKey = -1; this.vig = null; this.vigKey = '';
    this.tints = new Map(); this.draws = 0;
  }
  resize(pw, ph) { if (this.canvas.width !== pw || this.canvas.height !== ph) { this.canvas.width = pw; this.canvas.height = ph; } this.vigKey = ''; }
  _sky(F) {
    const key = Math.round(F.tod * 63) + (F.contrast ? 1000 : 0) + Math.round((F.sky.top[1] + 1) * 500) * 2000 + Math.round((F.sky.bottom[2] + 1) * 500) * 2e6;
    if (key !== this.skyKey || !this.skyC) {
      if (!this.skyC) { this.skyC = this.atlas.canvas(4, 128); }
      const c = this.skyC.getContext('2d');
      for (let y = 0; y < 128; y++) { c.fillStyle = F.contrast ? skyAt(F.sky, 0.5) : skyAt(F.sky, y / 127); c.fillRect(0, y, 4, 1); }
      this.skyKey = key;
    }
    return this.skyC;
  }
  _vignette(pw, ph, F) {
    const key = pw + 'x' + ph + '|' + (F.tod > 0.5 ? 2 : F.tod > 0.25 ? 1 : 0) + Math.round(F.vignette * 8);
    if (key === this.vigKey && this.vig) return this.vig;
    const w = Math.max(16, pw >> 2), h = Math.max(16, ph >> 2);
    if (!this.vig) this.vig = this.atlas.canvas(w, h); else { this.vig.width = w; this.vig.height = h; }
    const c = this.vig.getContext('2d');
    c.clearRect(0, 0, w, h);
    // The per-biome grade (LUT) on Paper: an 8% tint, baked here with the vignette so it costs no extra pass.
    c.fillStyle = F.tod > 0.5 ? 'rgba(14,42,46,0.08)' : F.tod > 0.25 ? 'rgba(255,190,120,0.1)' : 'rgba(255,214,140,0.06)'; c.fillRect(0, 0, w, h);
    if (F.vignette > 0) {
      const g = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.6);
      g.addColorStop(0, 'rgba(20,20,20,0)'); g.addColorStop(1, `rgba(20,20,20,${0.28 * F.vignette})`);
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    }
    this.vigKey = key; return this.vig;
  }
  /** A tinted copy of entry id (particles, confetti): cached per (entry, colour quantised to 4 bits a channel). */
  _tint(id, r, g, b) {
    const q = ((r * 15 + 0.5) | 0) << 8 | ((g * 15 + 0.5) | 0) << 4 | ((b * 15 + 0.5) | 0);
    if (q === 0xFFF) return id;
    const k = id * 4096 + q;
    let v = this.tints.get(k);
    if (v != null && this.atlas.entries[v] && this.atlas.entries[v].alive) return v;
    const e = this.atlas.entries[id], src = this.atlas.pages[e.page]; src.lastUsed = this.atlas.frame;
    const hex = '#' + [r, g, b].map(x => { const s = Math.round(x * 255).toString(16); return s.length < 2 ? '0' + s : s; }).join('');
    v = this.atlas.bake(e.key + '#t' + q, e.w, e.h, ctx => {
      const s = this.atlas._scratch(e.w, e.h);
      s.drawImage(src.canvas, e.x, e.y, e.w, e.h, 0, 0, e.w, e.h);
      s.globalCompositeOperation = 'multiply'; s.fillStyle = hex; s.fillRect(0, 0, e.w, e.h);
      s.globalCompositeOperation = 'destination-in'; s.drawImage(src.canvas, e.x, e.y, e.w, e.h, 0, 0, e.w, e.h);
      ctx.drawImage(this.atlas.scratch, 0, 0, e.w, e.h, 0, 0, e.w, e.h);
    }, { ax: e.ax, ay: e.ay });
    if (v < 0) v = id;
    this.tints.set(k, v); return v;
  }
  draw(L, F) {
    const ctx = this.ctx, A = this.atlas, V = F.view, pw = this.canvas.width, ph = this.canvas.height, m = this.m;
    this.draws = 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this._sky(F), 0, 0, 4, 128, 0, 0, pw, ph); this.draws++;
    // how dark the scene is (from the ambient light, not the clock): golden hour stays warm, only dusk and night cool down
    const amb = F.ambient, night = Math.max(0, Math.min(1, (1 - (amb[0] + amb[1] + amb[2]) / 3) / 0.39));
    const idx = L.order(), n = L.n;
    let blend = 0;
    for (let o = 0; o < n; o++) {
      const i = idx[o];
      let id = L.e[i]; const e0 = A.entries[id];
      if (!e0 || !e0.alive) continue;
      const a = L.alpha[i]; if (a <= 0.003) continue;
      V.matrix(L, i, m);
      let w = L.w[i], h = L.h[i];
      if (w < 0) { w = -w; m[0] = -m[0]; m[1] = -m[1]; }
      const wind = L.wind[i];
      if (wind) { const sh = Math.sin(F.time * 1.7 + L.x[i] * 0.013) * wind * 0.08; m[2] += m[0] * sh; m[3] += m[1] * sh; }
      ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
      const b = L.blend[i];
      if (b !== blend) { ctx.globalCompositeOperation = b === BLEND_ADD ? 'lighter' : 'source-over'; blend = b; }
      if (L.tr[i] !== 1 || L.tg[i] !== 1 || L.tb[i] !== 1) id = this._tint(id, L.tr[i], L.tg[i], L.tb[i]);
      const x0 = -L.ax[i] * w, y0 = -L.ay[i] * h;
      // night: scenery crossfades to its night variant (only the variant once it is fully night); the cast (grade
      // MOON_GRADE) to its baked 'moon' variant, so at night every sprite is still a single draw
      const g = L.grade[i], nk = L.lit[i] > 0 && b !== BLEND_ADD ? Math.min(1, night * g) : 0;
      const moon = g < 0.99 && Math.abs(g - MOON_GRADE) < 0.01;
      const nid = nk > 0.01 ? A.variant(id, moon ? 'moon' : 'night') : -1, k = moon ? night : nk;
      if (nid < 0 || k < 0.99) this._img(id, x0, y0, w, h, a);
      if (nid >= 0) this._img(nid, x0, y0, w, h, a * Math.min(1, k));
      const fl = L.flash[i];
      if (fl > 0.01) { const wid = A.variant(L.e[i], 'white'); if (wid >= 0) this._img(wid, x0, y0, w, h, a * fl); }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
    ctx.drawImage(this._vignette(pw, ph, F), 0, 0, pw, ph); this.draws++;
    if (F.flash > 0.003) { ctx.globalAlpha = F.flash; ctx.fillStyle = F.flashColor; ctx.fillRect(0, 0, pw, ph); ctx.globalAlpha = 1; }
    if (F.iris < 1.5) this._iris(F, pw, ph);
  }
  _img(id, x, y, w, h, a) {
    const e = this.atlas.entries[id]; if (!e) return;
    const p = this.atlas.pages[e.page];
    this.ctx.globalAlpha = a;
    this.ctx.drawImage(p.canvas, e.x, e.y, e.w, e.h, x, y, w, h); this.draws++;
  }
  /** The spark iris wipe: everything outside a growing/shrinking spark is Ink. F.iris: 0 = closed, >= 1.5 = open. */
  _iris(F, pw, ph) {
    const ctx = this.ctx, cx = F.irisX * pw, cy = F.irisY * ph, R = Math.hypot(pw, ph) * 1.25 * F.iris;
    ctx.beginPath(); ctx.rect(0, 0, pw, ph);
    if (R > 0.5) { const q = R * 0.207; ctx.moveTo(cx, cy - R); ctx.quadraticCurveTo(cx - q, cy - q, cx - R, cy); ctx.quadraticCurveTo(cx - q, cy + q, cx, cy + R); ctx.quadraticCurveTo(cx + q, cy + q, cx + R, cy); ctx.quadraticCurveTo(cx + q, cy - q, cx, cy - R); ctx.closePath(); }
    ctx.fillStyle = INK; ctx.fill('evenodd');
  }
  dispose() {}
}
