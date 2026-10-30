// Quality tiers, backend choice and the frame-time governor (spec §5.2-5.3). Pure: tests feed it synthetic
// frame-time series. Render scale may change any time; tier/backend changes wait for a scene transition, the pause
// screen or a context loss, so nothing visibly pops.

export const TIERS = ['low', 'mid', 'high'];
export const TIER_SPEC = {
  low: { backend: 'paper', dpr: 1.25, particles: 120, bands: 3, lights: 0, bloom: false, fireflies: 12, page: 1024 },
  mid: { backend: 'glaze', dpr: 1.5, particles: 300, bands: 3, lights: 2, bloom: false, fireflies: 16, page: 2048 },
  high: { backend: 'glaze', dpr: 2, particles: 600, bands: 4, lights: 4, bloom: true, fireflies: 20, page: 2048 },
};
export const SOFTWARE_GL = /SwiftShader|llvmpipe|softpipe|Software|Basic Render|Microsoft Basic/i;

/** Probe WebGL2. makeCanvas() -> a fresh canvas. -> {webgl2, software, renderer} */
export function probeGL(makeCanvas) {
  const out = { webgl2: false, software: false, renderer: '' };
  let gl = null;
  try { gl = makeCanvas().getContext('webgl2', { failIfMajorPerformanceCaveat: true, antialias: false, premultipliedAlpha: true, alpha: false }); } catch (e) { gl = null; }
  if (!gl) return out;
  out.webgl2 = true;
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    out.renderer = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || '');
  } catch (e) { out.renderer = ''; }
  out.software = SOFTWARE_GL.test(out.renderer);
  try { const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext(); } catch (e) { /* ignore */ }
  return out;
}
/** Which backend: an explicit override wins; otherwise Glaze only on real (hardware) WebGL2. */
export function pickBackend({ override = 'auto', probe = null, graphics = 'auto' } = {}) {
  if (override === 'paper' || override === 'glaze') return override;
  if (graphics === 'simple') return 'paper';
  return probe && probe.webgl2 && !probe.software ? 'glaze' : 'paper';
}
/** Starting tier for a backend. 'high' is only reached through the probe (promote()) or 'fancy'/override. */
export function pickTier({ backend, override = '', graphics = 'auto' } = {}) {
  if (TIERS.includes(override)) return backend === 'paper' ? 'low' : override === 'low' ? 'mid' : override;
  if (backend === 'paper') return 'low';
  return graphics === 'fancy' ? 'high' : 'mid';
}

export class Governor {
  constructor({ tier = 'mid', locked = false } = {}) {
    this.tier = tier; this.backend = TIER_SPEC[tier].backend;
    this.scale = 1; this.dprCap = TIER_SPEC[tier].dpr; this.particleK = 1; this.bloom = TIER_SPEC[tier].bloom; this.lights = TIER_SPEC[tier].lights;
    this.pending = null;            // tier change waiting for a transition
    this.win = new Float32Array(90); this.wi = 0; this.wn = 0; this.tmp = new Float32Array(90);
    this.over = -1; this.under = -1; this.upThisScene = false;
    this.losses = []; this.glLocked = locked; this.log = []; this.devDpr = 1;   // the stage keeps devDpr = devicePixelRatio
  }
  get spec() { return TIER_SPEC[this.tier]; }
  p90() {
    const n = this.wn; if (!n) return 0;
    const t = this.tmp; for (let i = 0; i < n; i++) t[i] = this.win[i];
    const a = t.subarray(0, n); a.sort();
    return a[Math.min(n - 1, Math.floor(0.9 * n))];
  }
  /** Feed one frame time (ms) at clock time now (ms). Returns 'down' | 'up' | null when a step was taken. */
  sample(ms, now) {
    this.win[this.wi] = ms; this.wi = (this.wi + 1) % 90; if (this.wn < 90) this.wn++;
    if (this.wn < 30) return null;
    const p = this.p90();
    if (p > 18) { this.under = -1; if (this.over < 0) this.over = now; else if (now - this.over >= 1500) { this.over = now; this.wn = 0; return this.stepDown() ? 'down' : null; } }
    else { this.over = -1; }
    if (p < 10) { if (this.under < 0) this.under = now; else if (now - this.under >= 5000 && !this.upThisScene) { this.under = now; return this.stepUp() ? 'up' : null; } }
    else this.under = -1;
    return null;
  }
  stepDown() {
    if (this.backend === 'glaze' && this.scale > 0.6 + 1e-6) { this.scale = Math.round((this.scale - 0.1) * 10) / 10; this.log.push('scale ' + this.scale); return true; }
    // Paper: lower the pixel ratio only where that changes anything (a 1x Chromebook skips straight to the next rung)
    if (this.backend === 'paper' && Math.min(this.devDpr, this.dprCap) > 1 + 1e-6) { this.dprCap = Math.max(1, Math.round((Math.min(this.devDpr, this.dprCap) - 0.25) * 100) / 100); this.log.push('dpr ' + this.dprCap); return true; }
    if (this.particleK > 0.5 || this.bloom) { this.particleK = 0.5; this.bloom = false; this.log.push('particles/bloom'); return true; }
    if (this.lights > 0) { this.lights = 0; this.log.push('lights off'); return true; }
    // Paper's render scale (a smaller backing store the browser scales up): the low tier's last resort on slow CPUs
    if (this.backend === 'paper' && this.scale > 0.7 + 1e-6) { this.scale = Math.round((this.scale - 0.15) * 100) / 100; this.log.push('paper scale ' + this.scale); return true; }
    const i = TIERS.indexOf(this.pending || this.tier);
    if (i > 0) { this.pending = TIERS[i - 1]; this.log.push('tier -> ' + this.pending + ' (at transition)'); return true; }
    return false;
  }
  stepUp() {
    this.upThisScene = true;
    if (this.pending && TIERS.indexOf(this.pending) < TIERS.indexOf(this.tier)) { this.pending = null; return true; }
    if (this.lights < this.spec.lights) { this.lights = this.spec.lights; return true; }
    if (this.particleK < 1 || this.bloom !== this.spec.bloom) { this.particleK = 1; this.bloom = this.spec.bloom; return true; }
    if (this.backend === 'glaze' && this.scale < 1) { this.scale = Math.round((this.scale + 0.1) * 10) / 10; return true; }
    if (this.backend === 'paper' && this.scale < 1) { this.scale = Math.min(1, Math.round((this.scale + 0.15) * 100) / 100); return true; }
    if (this.backend === 'paper' && this.dprCap < this.spec.dpr) { this.dprCap = Math.min(this.spec.dpr, this.dprCap + 0.25); return true; }
    return false;
  }
  /** Ask for a tier (settings, __brbTest.setTier). Applied at the next transition unless now = true. */
  request(tier, now = false) {
    if (!TIERS.includes(tier)) return;
    if (tier !== 'low' && this.glLocked) tier = 'low';
    this.pending = tier === this.tier ? null : tier;
    if (now) this.transition();
  }
  /** A scene transition / pause / context loss: apply any pending tier. -> true if tier or backend changed. */
  transition() {
    this.upThisScene = false;
    if (!this.pending) return false;
    const t = this.glLocked && this.pending !== 'low' ? 'low' : this.pending;
    this.pending = null;
    if (t === this.tier) return false;
    this.tier = t; this.backend = TIER_SPEC[t].backend;
    this.scale = 1; this.dprCap = TIER_SPEC[t].dpr; this.particleK = 1; this.bloom = TIER_SPEC[t].bloom; this.lights = TIER_SPEC[t].lights;
    this.wn = 0; this.over = this.under = -1;
    return true;
  }
  /** WebGL context lost at time now: drop to Paper at once. Two losses within 60 s lock Paper for the session. */
  contextLost(now) {
    this.losses.push(now); this.losses = this.losses.filter(t => now - t <= 60000);
    if (this.losses.length >= 2) this.glLocked = true;
    this.wasTier = this.tier === 'low' ? this.wasTier : this.tier;
    this.pending = 'low'; this.transition();
  }
  /** The context came back: return to Glaze at the next transition (unless locked). */
  contextRestored() { if (!this.glLocked && this.wasTier) this.pending = this.wasTier; }
}
