// ======================================================================================================
// Jump juice shared by the sports: screen shake (never with reduced motion), squash-and-stretch, an afterimage trail
// and speed lines. Everything is allocated once; nothing here makes objects per frame.
//   JC.juice.shake(px, secs)   a short shake (the strongest one wins); sports call tick(dt) and apply ox / oy
//   JC.juice.squash(o, k)      fills o.sx / o.sy for k in -1 (squashed flat) .. 0 (normal) .. 1 (stretched tall)
//   JC.juice.trail(n)          a ring of the last n poses: push(tr, x, y, a, f), draw with each(tr, fn)
//   JC.juice.speedLines(...)   streaks behind a fast body
// ======================================================================================================
const JUICE = JC.juice = {
  t: 0, a: 0, ox: 0, oy: 0,
  shake(px, secs) {
    if (BRBX.reduced()) return;
    if (JUICE.t <= 0 || px >= JUICE.a) { JUICE.a = px; JUICE.t = secs; }
  },
  tick(dt) {
    if (JUICE.t > 0) {
      JUICE.t -= dt;
      const k = Math.max(0, JUICE.t) * 6, a = Math.min(JUICE.a, JUICE.a * k);
      JUICE.ox = Math.round((Math.random() * 2 - 1) * a); JUICE.oy = Math.round((Math.random() * 2 - 1) * a * 0.6);
    } else { JUICE.ox = 0; JUICE.oy = 0; }
  },
  reset() { JUICE.t = 0; JUICE.a = 0; JUICE.ox = 0; JUICE.oy = 0; },
  /** k < 0 squashes (wide and flat), k > 0 stretches (tall and thin); the area stays about the same. */
  squash(o, k) {
    const q = clamp(k, -1, 1) * 0.28;
    o.sy = 1 + q; o.sx = 1 / (1 + q);
    return o;
  },
  trail(n) { return { n, i: 0, c: 0, x: new Float32Array(n), y: new Float32Array(n), a: new Float32Array(n), f: new Uint8Array(n) }; },
  push(tr, x, y, a, f) { tr.x[tr.i] = x; tr.y[tr.i] = y; tr.a[tr.i] = a; tr.f[tr.i] = f | 0; tr.i = (tr.i + 1) % tr.n; tr.c = Math.min(tr.n, tr.c + 1); },
  clearTrail(tr) { tr.c = 0; tr.i = 0; },
  /** Calls fn(x, y, a, f, age) oldest first; age runs 1 (oldest) .. ~0 (newest). */
  each(tr, fn) {
    for (let k = tr.c; k >= 1; k--) { const j = (tr.i - k + tr.n * 2) % tr.n; fn(tr.x[j], tr.y[j], tr.a[j], tr.f[j], k / tr.c); }
  },
  /** n streaks behind a body at (x, y) moving along angle ang (radians), length len, in colour col. */
  speedLines(g, x, y, ang, len, n, col, seed, unit) {
    const u = unit || 1, cx = Math.cos(ang), cy = Math.sin(ang), nx = -cy, ny = cx;
    g.fillStyle = col;
    for (let i = 0; i < n; i++) {
      const off = ((JC.hash(i, seed | 0, 7) * 2 - 1) * 14) * u, l = len * (0.5 + JC.hash(i, seed | 0, 9) * 0.5);
      const bx = x - cx * (10 * u) + nx * off, by = y - cy * (10 * u) + ny * off;
      for (let s = 0; s < l; s += 2 * u) g.fillRect(Math.round(bx - cx * s), Math.round(by - cy * s), u, u);
    }
  },
};
