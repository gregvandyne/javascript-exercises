/*! Oomba Kit 1.0.0 (api 1) | (c) Oomba Academy | fonts: Bricolage Grotesque, SIL OFL 1.1 */
(function () {
'use strict';
const __m_color = (function () {
function hexToRgb(hex) {
let h = String(hex).trim().replace(/^#/, '');
if (h.length === 3 || h.length === 4) h = h.split('').map(c => c + c).join('');
const n = parseInt(h.slice(0, 6), 16);
if (!/^[0-9a-f]{6}/i.test(h) || !isFinite(n)) return [0, 0, 0];
return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const hx = v => { const s = Math.round(Math.max(0, Math.min(255, v))).toString(16); return s.length < 2 ? '0' + s : s; };
const rgbToHex = (r, g, b) => ('#' + hx(r) + hx(g) + hx(b)).toUpperCase();
const toLinear = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const fromLinear = c => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(0, c), 1 / 2.4) - 0.055);
function rgbToOklab(r, g, b) {
r = toLinear(r); g = toLinear(g); b = toLinear(b);
const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
function oklabToRgb(L, a, b) {
const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
const s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);
return [fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)];
}
const hexToOklab = hex => rgbToOklab(...hexToRgb(hex));
const oklabToHex = (L, a, b) => rgbToHex(...oklabToRgb(L, a, b));
function hexToOklch(hex) { const [L, a, b] = hexToOklab(hex); return [L, Math.hypot(a, b), Math.atan2(b, a)]; }
const oklchToHex = (L, C, h) => oklabToHex(L, C * Math.cos(h), C * Math.sin(h));
function mixHex(a, b, t) {
const A = hexToOklab(a), B = hexToOklab(b);
return oklabToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
function adjustHex(hex, dL = 0, chroma = 1) {
const [L, C, h] = hexToOklch(hex);
return oklchToHex(Math.max(0, Math.min(1, L + dL)), C * chroma, h);
}
const deltaE = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
function luminance(hex) { const [r, g, b] = hexToRgb(hex).map(toLinear); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
function rgba(hex, a) { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; }
function hexToVec(hex) { const [r, g, b] = hexToRgb(hex); return [r / 255, g / 255, b / 255]; }
return { adjustHex, contrast, deltaE, fromLinear, hexToOklab, hexToOklch, hexToRgb, hexToVec, luminance, mixHex, oklabToHex, oklabToRgb, oklchToHex, rgbToHex, rgbToOklab, rgba, toLinear };
})();
const __m_tokens = (function () {
const { adjustHex, hexToOklab, deltaE } = __m_color;
const STEPS = ['tint', 'light', 'base', 'shade'];
const PALETTE = {
mint: ['#DDF3E6', '#9BDDB7', '#66C792', '#1F9D63'],
spark: ['#FFF3C4', '#FFE27A', '#FFD23F', '#C99A00'],
coral: ['#FFE1DC', '#FF9C8F', '#FF6B5B', '#C8402F'],
sky: ['#DDEEFD', '#93CBF6', '#4FA8F0', '#2F6FC8'],
grape: ['#ECE2FB', '#C6A9F3', '#9B6BE8', '#6C44C0'],
peach: ['#FFEAD8', '#FFC89E', '#F5A26B', '#C9713A'],
cocoa: ['#EEDFD0', '#BF957A', '#8A5A3C', '#5C3A26'],
stone: ['#EEECE5', '#C6C2B5', '#8F8A7C', '#5E5A50'],
snow: ['#FFFFFF', '#F4F7FA', '#DDE6EE', '#B4C3D1'],
ink: ['#141414', '#141414', '#141414', '#141414'],
cream: ['#FFFDF2', '#FFFDF2', '#FFFDF2', '#F4F1E6'],
};
const HUES = Object.keys(PALETTE);
const INK = '#141414', CREAM = '#FFFDF2', PAPER = '#F4F1E6';
const ROLES = {
friend: 'mint', player: 'mint', correct: 'mint', go: 'mint',
reward: 'spark', hot: 'spark',
hazard: 'coral', wrong: 'coral',
interact: 'sky', neutral: 'sky', water: 'sky',
magic: 'grape', special: 'grape',
fur: 'peach', wood: 'cocoa', hair: 'cocoa', rock: 'stone', muted: 'stone', cloud: 'snow',
outline: 'ink', text: 'ink', rim: 'cream', card: 'cream', belly: 'cream',
};
const SKIN = ['#FCE1CB', '#F5CBA7', '#E8B48A', '#D29A6B', '#B97E4E', '#96603A', '#6E4529', '#4A2E1C'];
const SKIN_SHADE = SKIN.map(h => adjustHex(h, -0.10));
const HAIR = { cocoa: '#5C3A26', black: '#2B2220', blonde: '#E8C26A', copper: '#C8572F', stone: '#8F8A7C', grape: '#9B6BE8', sky: '#4FA8F0', mint: '#1F9D63' };
const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
function color(role, step = 'base', night = false) {
const hue = PALETTE[role] ? role : ROLES[role];
const ramp = PALETTE[hue];
if (!ramp) return HEX_RE.test(String(role)) ? nearestHue(role).hex : INK;
const i = typeof step === 'number' ? Math.max(0, Math.min(3, step | 0)) : Math.max(0, STEPS.indexOf(step));
const hex = ramp[i < 0 ? 2 : i];
return night && hue !== 'spark' && hue !== 'ink' ? adjustHex(hex, 0.05) : hex;
}
function nearestHue(hex) {
const p = hexToOklab(hex.startsWith('#') ? hex : '#' + hex);
let best = { hue: 'ink', step: 'base', hex: INK, d: Infinity };
for (const hue of HUES) PALETTE[hue].forEach((h, i) => { const d = deltaE(p, hexToOklab(h)); if (d < best.d) best = { hue, step: STEPS[i], hex: h, d }; });
return best;
}
const outline = hPx => Math.max(2, Math.min(6, 0.055 * hPx));
const rimWidth = w => Math.max(2, 0.45 * w);
const radius = { sm: 12, md: 20, lg: 32 };
const space = [4, 8, 12, 16, 24, 32];
const motion = {
tap: 80, ui: { ms: 200, ease: 'cubicOut' }, pop: { ms: 320, ease: 'backOut' }, scene: 500,
spring: { play: { k: 180, zeta: 0.55 }, ui: { k: 260, zeta: 0.8 }, follow: { k: 120, zeta: 0.5 } },
hitstop: 60, hitstopRange: [40, 80],
shake: { px: 18, deg: 3, decay: 1.6, freq: 25 },
squash: { jump: 1.15, land: 0.8 }, breathe: { amp: 0.02, hz: 0.4 }, blink: { min: 2000, max: 6000, ms: 120 },
flashPerSecond: 3,
};
const z = { sky: 0, far: 1, mid: 2, near: 3, shadow: 4, world: 5, actors: 6, fx: 7, front: 8, text: 9 };
const LAYERS = ['sky', 'far', 'mid', 'near', 'shadow', 'world', 'actors', 'fx', 'front', 'text'];
const NIGHT_SKY = ['#0E2A2E', '#163B3A'];
return { CREAM, HAIR, HUES, INK, LAYERS, NIGHT_SKY, PALETTE, PAPER, ROLES, SKIN, SKIN_SHADE, STEPS, color, motion, nearestHue, outline, radius, rimWidth, space, z };
})();
const __m_rand = (function () {
function seedOf(s) {
if (typeof s === 'number' && isFinite(s)) return s >>> 0;
let h = 2166136261; const str = String(s);
for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
return h >>> 0;
}
function mulberry32(a) {
return function () {
a = (a + 0x6D2B79F5) | 0;
let t = Math.imul(a ^ (a >>> 15), 1 | a);
t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
}
function rand(seed = 1) {
const f = mulberry32(seedOf(seed));
const r = {
float: f,
range: (a, b) => a + (b - a) * f(),
int: (a, b) => a + Math.floor(f() * (b - a + 1)),
pick: arr => arr[Math.floor(f() * arr.length)],
chance: p => f() < p,
sign: () => (f() < 0.5 ? -1 : 1),
shuffle: arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(f() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; },
};
return r;
}
function hash1(i) { let h = Math.imul((i | 0) ^ 0x27d4eb2d, 0x165667b1); h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; return ((h >>> 0) / 4294967296) * 2 - 1; }
function noise1(x) { const i = Math.floor(x), t = x - i, u = t * t * (3 - 2 * t); return hash1(i) * (1 - u) + hash1(i + 1) * u; }
return { hash1, mulberry32, noise1, rand, seedOf };
})();
const __m_ease = (function () {
const { sin, cos, PI, pow, sqrt } = Math;
const BACK = 1.70158, BACK2 = BACK * 1.525, EL = (2 * PI) / 3, EL2 = (2 * PI) / 4.5;
function bounceOut(t) {
const n = 7.5625, d = 2.75;
if (t < 1 / d) return n * t * t;
if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
return n * (t -= 2.625 / d) * t + 0.984375;
}
const ease = {
linear: t => t,
sineIn: t => 1 - cos((t * PI) / 2), sineOut: t => sin((t * PI) / 2), sineInOut: t => -(cos(PI * t) - 1) / 2,
quadIn: t => t * t, quadOut: t => 1 - (1 - t) * (1 - t), quadInOut: t => (t < 0.5 ? 2 * t * t : 1 - pow(-2 * t + 2, 2) / 2),
cubicIn: t => t * t * t, cubicOut: t => 1 - pow(1 - t, 3), cubicInOut: t => (t < 0.5 ? 4 * t * t * t : 1 - pow(-2 * t + 2, 3) / 2),
quartIn: t => t * t * t * t, quartOut: t => 1 - pow(1 - t, 4), quartInOut: t => (t < 0.5 ? 8 * t * t * t * t : 1 - pow(-2 * t + 2, 4) / 2),
quintIn: t => t * t * t * t * t, quintOut: t => 1 - pow(1 - t, 5), quintInOut: t => (t < 0.5 ? 16 * pow(t, 5) : 1 - pow(-2 * t + 2, 5) / 2),
expoIn: t => (t === 0 ? 0 : pow(2, 10 * t - 10)), expoOut: t => (t === 1 ? 1 : 1 - pow(2, -10 * t)),
expoInOut: t => (t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? pow(2, 20 * t - 10) / 2 : (2 - pow(2, -20 * t + 10)) / 2),
circIn: t => 1 - sqrt(1 - t * t), circOut: t => sqrt(1 - (t - 1) * (t - 1)),
circInOut: t => (t < 0.5 ? (1 - sqrt(1 - 4 * t * t)) / 2 : (sqrt(1 - pow(-2 * t + 2, 2)) + 1) / 2),
backIn: t => (BACK + 1) * t * t * t - BACK * t * t, backOut: t => 1 + (BACK + 1) * pow(t - 1, 3) + BACK * pow(t - 1, 2),
backInOut: t => (t < 0.5 ? (pow(2 * t, 2) * ((BACK2 + 1) * 2 * t - BACK2)) / 2 : (pow(2 * t - 2, 2) * ((BACK2 + 1) * (t * 2 - 2) + BACK2) + 2) / 2),
elasticIn: t => (t === 0 ? 0 : t === 1 ? 1 : -pow(2, 10 * t - 10) * sin((t * 10 - 10.75) * EL)),
elasticOut: t => (t === 0 ? 0 : t === 1 ? 1 : pow(2, -10 * t) * sin((t * 10 - 0.75) * EL) + 1),
elasticInOut: t => (t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? -(pow(2, 20 * t - 10) * sin((20 * t - 11.125) * EL2)) / 2 : (pow(2, -20 * t + 10) * sin((20 * t - 11.125) * EL2)) / 2 + 1),
bounceIn: t => 1 - bounceOut(1 - t), bounceOut, bounceInOut: t => (t < 0.5 ? (1 - bounceOut(1 - 2 * t)) / 2 : (1 + bounceOut(2 * t - 1)) / 2),
};
const EASE_NAMES = Object.keys(ease);
const easeFn = e => (typeof e === 'function' ? e : ease[e] || ease.cubicOut);
return { EASE_NAMES, ease, easeFn };
})();
const __m_tween = (function () {
const { easeFn } = __m_ease;
class Tweener {
constructor() { this.items = []; this.springs = []; }
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
wait(ms) { return this.tween(null, null, { ms }); }
after(ms, fn) { const it = this._timer(ms, fn, false); return () => this._finish(it, false); }
every(ms, fn) { const it = this._timer(Math.max(1, ms), fn, true); return () => this._finish(it, false); }
_timer(ms, fn, repeat) {
const it = { target: null, props: null, from: null, ms: Math.max(0, +ms || 0), t: 0, ease: easeFn('linear'), onUpdate: null, done: false, resolve: () => {}, fn, repeat };
this.items.push(it); return it;
}
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
if (it.fn) {
while (!it.done && it.t >= it.ms) {
try { it.fn(); } catch (e) {  }
if (it.repeat && it.ms > 0) it.t -= it.ms; else this._finish(it, true);
}
continue;
}
const k = it.ms > 0 ? Math.min(1, it.t / it.ms) : 1;
this._apply(it, it.ease(k));
if (k >= 1) this._finish(it, true);
}
if (list.length && list.some(it => it.done)) this.items = list.filter(it => !it.done);
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
const seq = async steps => { for (const s of steps) await s(); };
const all = ps => Promise.all(ps);
function stagger(tw, items, fn, gapMs) { return Promise.all(items.map((it, i) => tw.wait(i * gapMs).then(() => fn(it, i)))); }
return { Tweener, all, seq, stagger };
})();
const __m_loop = (function () {
const { Tweener } = __m_tween;
const STEP_MS = 1000 / 60;
const STATS_N = 120;
class Loop {
constructor({ update = null, render = null, maxSteps = 5 } = {}) {
this.update = update; this.render = render; this.maxSteps = maxSteps;
this.now = 0;
this.game = 0;
this.scale = 1;
this.slow = 1; this.slowLeft = 0;
this.stopLeft = 0;
this.acc = 0; this.last = -1; this.frames = 0; this.steps = 0;
this.reasons = new Set();
this.tw = new Tweener();
this.ui = new Tweener();
this.stats = new Float32Array(STATS_N); this.statsI = 0; this.statsN = 0;
this.alpha = 1;
}
get paused() { return this.reasons.size > 0; }
pause(reason = 'game') { this.reasons.add(reason); }
resume(reason = 'game') { this.reasons.delete(reason); if (!this.reasons.size) this.acc = 0; }
hitstop(ms = 60) { this.stopLeft = Math.max(this.stopLeft, Math.max(0, Math.min(200, +ms || 0))); }
slowmo(scale = 0.3, ms = 300) { this.slow = Math.max(0.05, Math.min(1, +scale || 1)); this.slowLeft = Math.max(0, +ms || 0); }
frame(ts) {
let dt = this.last < 0 ? STEP_MS : ts - this.last;
this.last = ts;
if (!(dt >= 0)) dt = 0;
if (dt > 100) dt = 100;
this.now += dt; this.frames++;
this.stats[this.statsI] = dt; this.statsI = (this.statsI + 1) % STATS_N; if (this.statsN < STATS_N) this.statsN++;
this.ui.tick(dt);
let n = 0;
if (!this.paused) {
let rest = dt;
if (this.stopLeft > 0) { const use = Math.min(this.stopLeft, rest); this.stopLeft -= use; rest -= use; }
if (rest > 0) {
const s = this.scale * this.slow;
if (this.slowLeft > 0) { this.slowLeft -= rest; if (this.slowLeft <= 0) { this.slow = 1; this.slowLeft = 0; } }
this.acc += rest * s;
while (this.acc >= STEP_MS && n < this.maxSteps) { this._update(); this.acc -= STEP_MS; n++; }
if (n === this.maxSteps && this.acc >= STEP_MS) this.acc = 0;
}
}
this.alpha = this.paused ? 1 : Math.max(0, Math.min(1, this.acc / STEP_MS));
if (this.render) this.render(this.alpha, dt);
return n;
}
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
frameStats() {
const n = this.statsN; if (!n) return { p50: 0, p90: 0, p95: 0, max: 0, n: 0 };
const a = Array.from(this.stats.subarray(0, n)).sort((x, y) => x - y);
const q = p => a[Math.min(n - 1, Math.floor(p * n))];
return { p50: q(0.5), p90: q(0.9), p95: q(0.95), max: a[n - 1], n };
}
}
function runLoop(loop, win = typeof window !== 'undefined' ? window : null) {
if (!win || !win.requestAnimationFrame) return () => {};
let live = true, id = 0;
const tick = ts => { if (!live) return; id = win.requestAnimationFrame(tick); try { loop.frame(ts); } catch (e) { if (win.console) win.console.error(e); } };
id = win.requestAnimationFrame(tick);
const call = fn => { if (typeof fn === 'function') { try { fn(); } catch (e) {  } } };
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
return { Loop, STEP_MS, runLoop };
})();
const __m_input = (function () {
const DEFAULT_BINDINGS = {
left: ['ArrowLeft', 'KeyA', 'pad:left', 'touch:left'],
right: ['ArrowRight', 'KeyD', 'pad:right', 'touch:right'],
up: ['ArrowUp', 'KeyW', 'pad:up', 'touch:up'],
down: ['ArrowDown', 'KeyS', 'pad:down', 'touch:down'],
jump: ['Space', 'KeyZ', 'KeyW', 'ArrowUp', 'pad:A', 'touch:A'],
action: ['KeyX', 'Enter', 'NumpadEnter', 'pad:X', 'touch:B'],
pause: ['KeyP', 'Escape', 'pad:Start'],
confirm: ['Enter', 'NumpadEnter', 'Space', 'pad:A'],
back: ['Escape', 'Backspace', 'pad:B'],
};
const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, Select: 8, Start: 9, up: 12, down: 13, left: 14, right: 15 };
const SCROLL_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const DEAD = 0.22;
class Input {
constructor(opts = {}) {
this.bindings = {}; this.map(DEFAULT_BINDINGS);
this.raw = new Set();
this.latch = new Set();
this.cur = new Set(); this.prev = new Set();
this.stick = { x: 0, y: 0 };
this.padAxis = { x: 0, y: 0 };
this.pointer = { x: 0, y: 0, down: false, id: -1, sx: 0, sy: 0, t0: 0, moved: false, long: false, lastX: 0, lastY: 0, lastT: 0, vx: 0, vy: 0 };
this.listeners = {}; this.enabled = true; this.usedPad = false; this.usedTouch = false;
this.clock = opts.clock || (() => 0);
this.toDesign = opts.toDesign || ((x, y) => ({ x, y }));
this._axis = { x: 0, y: 0 };
}
map(b) { for (const k in b) this.bindings[k] = [].concat(b[k]).map(String); }
on(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); return () => { const a = this.listeners[ev]; const i = a ? a.indexOf(fn) : -1; if (i >= 0) a.splice(i, 1); }; }
emit(ev, e) { const a = this.listeners[ev]; if (a) for (const fn of a.slice()) { try { fn(e); } catch (err) {  } } }
srcDown(src) { if (!this.raw.has(src)) { this.raw.add(src); this.latch.add(src); } }
srcUp(src) { this.raw.delete(src); }
update(pads) {
this.pollPads(pads);
const t = this.prev; this.prev = this.cur; this.cur = t; this.cur.clear();
if (this.enabled) {
for (const action in this.bindings) {
const srcs = this.bindings[action];
for (let i = 0; i < srcs.length; i++) if (this.raw.has(srcs[i]) || this.latch.has(srcs[i])) { this.cur.add(action); break; }
}
}
this.latch.clear();
if (this.pointer.down && !this.pointer.long && !this.pointer.moved && this.clock() - this.pointer.t0 > 500) {
this.pointer.long = true; this.emit('longpress', { x: this.pointer.x, y: this.pointer.y });
}
}
down(a) { return this.cur.has(a); }
pressed(a) { return this.cur.has(a) && !this.prev.has(a); }
released(a) { return !this.cur.has(a) && this.prev.has(a); }
axis() {
let x = (this.down('right') ? 1 : 0) - (this.down('left') ? 1 : 0) + this.padAxis.x + this.stick.x;
let y = (this.down('down') ? 1 : 0) - (this.down('up') ? 1 : 0) + this.padAxis.y + this.stick.y;
const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
this._axis.x = x; this._axis.y = y; return this._axis;
}
pollPads(pads) {
if (!pads) return;
let ax = 0, ay = 0;
for (let p = 0; p < pads.length; p++) {
const g = pads[p]; if (!g || !g.connected) continue;
for (const name in PAD) {
const b = g.buttons && g.buttons[PAD[name]]; const on = !!(b && (b.pressed || b.value > 0.5));
const src = 'pad:' + name;
if (on) { this.srcDown(src); this.usedPad = true; } else if (this.raw.has(src)) this.srcUp(src);
}
const x = (g.axes && g.axes[0]) || 0, y = (g.axes && g.axes[1]) || 0;
if (Math.hypot(x, y) > DEAD) { ax += x; ay += y; this.usedPad = true; }
}
this.padAxis.x = Math.max(-1, Math.min(1, ax)); this.padAxis.y = Math.max(-1, Math.min(1, ay));
}
attach(win, el) {
const isField = t => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
const kd = e => {
if (isField(e.target)) return;
if (e.target && e.target.closest && e.target.closest('.ok-modal') && (e.code === 'Space' || e.code === 'Enter')) return;
if (SCROLL_KEYS.has(e.code)) e.preventDefault();
if (!e.repeat) this.srcDown(e.code);
};
const ku = e => this.srcUp(e.code);
const blur = () => { this.raw.clear(); this.stick.x = this.stick.y = 0; this.emit('blur', {}); };
const pt = e => { const r = el.getBoundingClientRect(); return this.toDesign(e.clientX - r.left, e.clientY - r.top); };
const P = this.pointer;
const pd = e => {
if (e.target !== el && e.target && e.target.closest && e.target.closest('.ok-ui button, .ok-touch')) return;
if (e.pointerType === 'touch') this.usedTouch = true;
const p = pt(e); P.x = p.x; P.y = p.y; P.down = true; P.id = e.pointerId; P.sx = p.x; P.sy = p.y; P.t0 = this.clock(); P.moved = false; P.long = false;
P.lastX = p.x; P.lastY = p.y; P.lastT = P.t0; P.vx = P.vy = 0;
try { el.setPointerCapture(e.pointerId); } catch (err) {  }
this.emit('down', { x: p.x, y: p.y });
};
const pm = e => {
const p = pt(e); P.x = p.x; P.y = p.y;
if (!P.down || e.pointerId !== P.id) { this.emit('move', { x: p.x, y: p.y }); return; }
const t = this.clock(), dt = Math.max(1, t - P.lastT);
P.vx = (p.x - P.lastX) / dt; P.vy = (p.y - P.lastY) / dt; P.lastX = p.x; P.lastY = p.y; P.lastT = t;
if (!P.moved && Math.hypot(p.x - P.sx, p.y - P.sy) > 12) P.moved = true;
if (P.moved) this.emit('drag', { x: p.x, y: p.y, dx: p.x - P.sx, dy: p.y - P.sy });
};
const pu = e => {
if (!P.down || e.pointerId !== P.id) return;
P.down = false; const p = pt(e); const dt = this.clock() - P.t0, dx = p.x - P.sx, dy = p.y - P.sy, d = Math.hypot(dx, dy);
if (!P.moved && !P.long && dt < 300) this.emit('tap', { x: p.x, y: p.y });
else if (d > 40 && dt < 400) {
const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
this.emit('swipe', { dir, dx, dy }); this.srcDown('swipe:' + dir); this.srcUp('swipe:' + dir);
}
if (P.moved && Math.hypot(P.vx, P.vy) > 0.8) this.emit('flick', { vx: P.vx, vy: P.vy });
this.emit('up', { x: p.x, y: p.y });
};
const ts = () => { this.usedTouch = true; this.emit('firsttouch', {}); };
win.addEventListener('keydown', kd); win.addEventListener('keyup', ku); win.addEventListener('blur', blur);
el.addEventListener('pointerdown', pd); win.addEventListener('pointermove', pm); win.addEventListener('pointerup', pu); win.addEventListener('pointercancel', pu);
win.addEventListener('touchstart', ts, { passive: true, once: true });
el.style.touchAction = 'none';
return () => {
win.removeEventListener('keydown', kd); win.removeEventListener('keyup', ku); win.removeEventListener('blur', blur);
el.removeEventListener('pointerdown', pd); win.removeEventListener('pointermove', pm); win.removeEventListener('pointerup', pu); win.removeEventListener('pointercancel', pu);
win.removeEventListener('touchstart', ts);
};
}
}
function touchControls(doc, root, input, layout, opts = {}) {
const old = root.querySelector('.ok-touch'); if (old) old.remove();
if (!layout || layout === 'none') return null;
const wrap = doc.createElement('div');
wrap.className = 'ok-touch' + (opts.leftHanded ? ' ok-left' : '');
wrap.setAttribute('aria-hidden', 'true');
const hasStick = layout === 'stick+jump' || layout === 'stick';
if (hasStick) {
const pad = doc.createElement('div'); pad.className = 'ok-stick'; const knob = doc.createElement('div'); knob.className = 'ok-knob'; pad.appendChild(knob); wrap.appendChild(pad);
let id = -1, cx = 0, cy = 0;
const R = 48;
const set = (x, y) => { const l = Math.hypot(x, y), k = l > R ? R / l : 1; x *= k; y *= k; knob.style.transform = `translate(${x}px,${y}px)`; input.stick.x = x / R; input.stick.y = y / R; };
pad.addEventListener('pointerdown', e => { id = e.pointerId; const r = pad.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; try { pad.setPointerCapture(id); } catch (err) {  } set(e.clientX - cx, e.clientY - cy); pad.classList.add('on'); e.preventDefault(); });
pad.addEventListener('pointermove', e => { if (e.pointerId === id) set(e.clientX - cx, e.clientY - cy); });
const end = e => { if (e.pointerId !== id) return; id = -1; set(0, 0); pad.classList.remove('on'); };
pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
}
const btn = (cls, src, label) => {
const b = doc.createElement('div'); b.className = 'ok-tbtn ' + cls; b.dataset.src = src; if (label) b.innerHTML = label;
b.addEventListener('pointerdown', e => { input.srcDown(src); b.classList.add('on'); try { b.setPointerCapture(e.pointerId); } catch (err) {  } e.preventDefault(); });
const up = () => { input.srcUp(src); b.classList.remove('on'); };
b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
wrap.appendChild(b); return b;
};
if (layout === 'dpad') ['up', 'left', 'right', 'down'].forEach(d => btn('ok-d ok-d-' + d, 'touch:' + d, opts.icons && opts.icons['arrow-' + d]));
if (layout === 'stick+jump' || layout === 'buttons' || layout === 'dpad') btn('ok-jump', 'touch:A', opts.icons && opts.icons.jump);
if (layout === 'buttons') btn('ok-act', 'touch:B', opts.icons && opts.icons.tap);
root.appendChild(wrap);
return wrap;
}
return { DEFAULT_BINDINGS, Input, touchControls };
})();
const __m_strings = (function () {
const KEYS = ['play', 'pause', 'resume', 'restart', 'quit', 'settings', 'sound', 'music', 'best', 'newBest',
'soClose', 'tryAgain', 'playAgain', 'next', 'great', 'level', 'score', 'time', 'lives', 'howTo',
'go', 'loading', 'correct', 'wrong', 'answerIs', 'sparksOf', 'youWon', 'close', 'on', 'off',
'motion', 'motionAuto', 'motionReduce', 'motionFull', 'captions', 'readAloud', 'textSize', 'speed', 'assist', 'assistNone',
'assistHearts', 'assistNofail', 'contrast', 'colorCues', 'leftHanded', 'graphics', 'gfxAuto', 'gfxSimple', 'gfxFancy', 'hint',
'tryOnce', 'menu', 'sndDing', 'sndBoop', 'sndOuch', 'sndFanfare', 'sndWin', 'sndSparkle', 'sndSplash', 'sndGate'];
const ROWS = {
en: 'Play|Pause|Resume|Restart|Quit|Settings|Sound|Music|Best|New best!|So close!|Try again|Play again|Next|Great!|Level|Score|Time|Lives|How to play|Go!|Loading…|Yes, that’s right!|Not quite.|The answer is {a}|{n} of {total}|You did it!|Close|On|Off|Motion|Auto|Less motion|Full motion|Captions|Read aloud|Text size|Game speed|Help|None|Extra hearts|No fail|High contrast|Color cues|Left-handed|Graphics|Auto|Simple|Fancy|Hint|Not quite, try again!|Menu|[ding]|[soft boop]|[ouch]|[fanfare]|[victory tune]|[sparkle]|[splash]|[gate opens]',
'en-GB': 'Play|Pause|Resume|Restart|Quit|Settings|Sound|Music|Best|New best!|So close!|Try again|Play again|Next|Great!|Level|Score|Time|Lives|How to play|Go!|Loading…|Yes, that’s right!|Not quite.|The answer is {a}|{n} of {total}|You did it!|Close|On|Off|Motion|Auto|Less motion|Full motion|Captions|Read aloud|Text size|Game speed|Help|None|Extra hearts|No fail|High contrast|Colour cues|Left-handed|Graphics|Auto|Simple|Fancy|Hint|Not quite, try again!|Menu|[ding]|[soft boop]|[ouch]|[fanfare]|[victory tune]|[sparkle]|[splash]|[gate opens]',
es: 'Jugar|Pausa|Seguir|Reiniciar|Salir|Ajustes|Sonido|Música|Récord|¡Nuevo récord!|¡Casi!|Inténtalo otra vez|Jugar otra vez|Siguiente|¡Genial!|Nivel|Puntos|Tiempo|Vidas|Cómo se juega|¡Ya!|Cargando…|¡Sí, correcto!|Casi.|La respuesta es {a}|{n} de {total}|¡Lo lograste!|Cerrar|Sí|No|Movimiento|Automático|Menos movimiento|Todo el movimiento|Subtítulos|Leer en voz alta|Tamaño del texto|Velocidad|Ayuda|Ninguna|Más corazones|Sin perder|Alto contraste|Pistas de color|Zurdo|Gráficos|Automático|Sencillo|Elegante|Pista|¡Casi! Prueba otra vez.|Menú|[ding]|[bup suave]|[¡ay!]|[fanfarria]|[música de victoria]|[destello]|[chapoteo]|[se abre la puerta]',
fr: 'Jouer|Pause|Reprendre|Recommencer|Quitter|Réglages|Son|Musique|Record|Nouveau record !|Presque !|Réessayer|Rejouer|Suivant|Bravo !|Niveau|Score|Temps|Vies|Comment jouer|C’est parti !|Chargement…|Oui, c’est juste !|Pas tout à fait.|La réponse est {a}|{n} sur {total}|Tu as réussi !|Fermer|Oui|Non|Mouvement|Auto|Moins de mouvement|Tout le mouvement|Sous-titres|Lire à voix haute|Taille du texte|Vitesse du jeu|Aide|Aucune|Cœurs en plus|Sans échec|Contraste élevé|Repères de couleur|Gaucher|Graphismes|Auto|Simple|Joli|Indice|Presque ! Essaie encore.|Menu|[ding]|[petit bip]|[aïe]|[fanfare]|[air de victoire]|[scintillement]|[plouf]|[la porte s’ouvre]',
de: 'Spielen|Pause|Weiter|Neu starten|Beenden|Einstellungen|Ton|Musik|Bestwert|Neuer Bestwert!|Fast!|Nochmal versuchen|Nochmal spielen|Weiter|Super!|Level|Punkte|Zeit|Leben|So wird gespielt|Los!|Lädt…|Ja, richtig!|Nicht ganz.|Die Antwort ist {a}|{n} von {total}|Geschafft!|Schließen|An|Aus|Bewegung|Automatisch|Weniger Bewegung|Volle Bewegung|Untertitel|Vorlesen|Textgröße|Spieltempo|Hilfe|Keine|Mehr Herzen|Kein Verlieren|Hoher Kontrast|Farbhinweise|Linkshändig|Grafik|Automatisch|Einfach|Schick|Tipp|Fast! Versuch’s nochmal.|Menü|[Pling]|[leises Bup]|[Autsch]|[Fanfare]|[Siegesmelodie]|[Funkeln]|[Platsch]|[Tor geht auf]',
it: 'Gioca|Pausa|Riprendi|Ricomincia|Esci|Impostazioni|Suono|Musica|Record|Nuovo record!|Quasi!|Riprova|Gioca ancora|Avanti|Bravo!|Livello|Punti|Tempo|Vite|Come si gioca|Via!|Caricamento…|Sì, giusto!|Non proprio.|La risposta è {a}|{n} su {total}|Ce l’hai fatta!|Chiudi|Sì|No|Movimento|Automatico|Meno movimento|Tutto il movimento|Sottotitoli|Leggi ad alta voce|Dimensione testo|Velocità|Aiuto|Nessuno|Cuori in più|Senza perdere|Contrasto alto|Indizi di colore|Mancino|Grafica|Automatica|Semplice|Elegante|Suggerimento|Quasi! Riprova.|Menu|[din]|[bip leggero]|[ahi]|[fanfara]|[musica di vittoria]|[scintillio]|[splash]|[il cancello si apre]',
pt: 'Jogar|Pausa|Continuar|Recomeçar|Sair|Definições|Som|Música|Recorde|Novo recorde!|Quase!|Tenta outra vez|Jogar de novo|Seguinte|Boa!|Nível|Pontos|Tempo|Vidas|Como jogar|Já!|A carregar…|Sim, certo!|Quase.|A resposta é {a}|{n} de {total}|Conseguiste!|Fechar|Sim|Não|Movimento|Automático|Menos movimento|Todo o movimento|Legendas|Ler em voz alta|Tamanho do texto|Velocidade|Ajuda|Nenhuma|Mais corações|Sem perder|Alto contraste|Pistas de cor|Canhoto|Gráficos|Automático|Simples|Bonito|Dica|Quase! Tenta outra vez.|Menu|[dim]|[bip suave]|[ai]|[fanfarra]|[música de vitória]|[brilho]|[chape]|[o portão abre-se]',
nl: 'Spelen|Pauze|Verder|Opnieuw|Stoppen|Instellingen|Geluid|Muziek|Record|Nieuw record!|Bijna!|Probeer opnieuw|Nog eens spelen|Volgende|Top!|Level|Score|Tijd|Levens|Zo speel je|Start!|Laden…|Ja, goed zo!|Net niet.|Het antwoord is {a}|{n} van {total}|Gelukt!|Sluiten|Aan|Uit|Beweging|Automatisch|Minder beweging|Alle beweging|Ondertitels|Voorlezen|Tekstgrootte|Spelsnelheid|Hulp|Geen|Extra hartjes|Niet verliezen|Hoog contrast|Kleurhints|Linkshandig|Graphics|Automatisch|Eenvoudig|Mooi|Hint|Bijna! Probeer het nog eens.|Menu|[ping]|[zachte boep]|[au]|[fanfare]|[overwinningsmuziek]|[fonkeling]|[plons]|[het hek gaat open]',
ru: 'Играть|Пауза|Продолжить|Заново|Выйти|Настройки|Звук|Музыка|Рекорд|Новый рекорд!|Почти!|Попробуй ещё|Играть ещё|Дальше|Отлично!|Уровень|Очки|Время|Жизни|Как играть|Вперёд!|Загрузка…|Да, верно!|Не совсем.|Ответ: {a}|{n} из {total}|Получилось!|Закрыть|Вкл.|Выкл.|Движение|Авто|Меньше движения|Всё движение|Субтитры|Читать вслух|Размер текста|Скорость игры|Помощь|Нет|Больше сердец|Без проигрыша|Высокий контраст|Цветовые подсказки|Для левшей|Графика|Авто|Простая|Красивая|Подсказка|Почти! Попробуй ещё раз.|Меню|[дзинь]|[мягкий бип]|[ой]|[фанфары]|[победная музыка]|[блеск]|[плюх]|[ворота открываются]',
ja: 'あそぶ|ポーズ|つづける|やりなおす|やめる|せってい|おと|おんがく|ベスト|ベストこうしん！|おしい！|もういちど|もういちどあそぶ|つぎへ|すごい！|レベル|スコア|じかん|ライフ|あそびかた|スタート！|よみこみちゅう…|せいかい！|ざんねん。|こたえは {a}|{n} / {total}|クリア！|とじる|オン|オフ|うごき|じどう|うごきをへらす|すべてのうごき|じまく|よみあげ|もじのおおきさ|ゲームのはやさ|おたすけ|なし|ハートをふやす|まけない|ハイコントラスト|いろのヒント|ひだりきき|グラフィック|じどう|シンプル|きれい|ヒント|おしい！もういちど。|メニュー|[ピンポン]|[ブッ]|[いたっ]|[ファンファーレ]|[かちのメロディー]|[キラキラ]|[バシャッ]|[もんがひらく]',
'zh-Hant': '開始|暫停|繼續|重新開始|離開|設定|音效|音樂|最佳|新紀錄！|差一點！|再試一次|再玩一次|下一個|太棒了！|關卡|分數|時間|生命|怎麼玩|開始！|載入中…|答對了！|不太對。|答案是 {a}|{n} / {total}|你做到了！|關閉|開|關|動畫|自動|減少動畫|完整動畫|字幕|朗讀|文字大小|遊戲速度|協助|無|更多愛心|不會失敗|高對比|顏色提示|左手模式|畫面|自動|簡單|精美|提示|差一點！再試一次。|選單|[叮]|[輕輕的嘟]|[哎喲]|[號角聲]|[勝利音樂]|[閃閃發光]|[撲通]|[門打開了]',
he: 'לשחק|השהיה|להמשיך|להתחיל מחדש|לצאת|הגדרות|צלילים|מוזיקה|שיא|שיא חדש!|כמעט!|לנסות שוב|לשחק שוב|הבא|מעולה!|שלב|ניקוד|זמן|חיים|איך משחקים|יוצאים!|טוען…|כן, נכון!|לא בדיוק.|התשובה היא {a}|{n} מתוך {total}|הצלחת!|סגירה|פועל|כבוי|תנועה|אוטומטי|פחות תנועה|תנועה מלאה|כתוביות|הקראה|גודל טקסט|מהירות המשחק|עזרה|בלי|עוד לבבות|בלי לפסול|ניגודיות גבוהה|רמזי צבע|שמאלי|גרפיקה|אוטומטי|פשוטה|מהודרת|רמז|כמעט! נסו שוב.|תפריט|[דינג]|[בופ רך]|[אאוץ׳]|[תרועה]|[מנגינת ניצחון]|[נצנוץ]|[פלאש]|[השער נפתח]',
ar: 'العب|إيقاف مؤقت|تابع|ابدأ من جديد|خروج|الإعدادات|الصوت|الموسيقى|الأفضل|رقم قياسي جديد!|اقتربت!|حاول مرة أخرى|العب مرة أخرى|التالي|رائع!|المستوى|النقاط|الوقت|الأرواح|طريقة اللعب|انطلق!|جارٍ التحميل…|نعم، صحيح!|ليس تماماً.|الإجابة هي {a}|{n} من {total}|لقد نجحت!|إغلاق|تشغيل|إيقاف|الحركة|تلقائي|حركة أقل|حركة كاملة|الترجمة النصية|القراءة بصوت عالٍ|حجم النص|سرعة اللعبة|المساعدة|بدون|قلوب إضافية|بلا خسارة|تباين عالٍ|تلميحات لونية|لليد اليسرى|الرسومات|تلقائي|بسيطة|فاخرة|تلميح|اقتربت! حاول مرة أخرى.|القائمة|[رنين]|[صوت خفيف]|[آخ]|[نفير]|[لحن الفوز]|[بريق]|[طرطشة]|[البوابة تُفتح]',
};
const PLURALS = {
sparks: {
en: { one: '{n} spark', other: '{n} sparks' }, 'en-GB': { one: '{n} spark', other: '{n} sparks' },
es: { one: '{n} chispa', other: '{n} chispas' }, fr: { one: '{n} étincelle', other: '{n} étincelles' },
de: { one: '{n} Funke', other: '{n} Funken' }, it: { one: '{n} scintilla', other: '{n} scintille' },
pt: { one: '{n} faísca', other: '{n} faíscas' }, nl: { one: '{n} vonk', other: '{n} vonken' },
ru: { one: '{n} искра', few: '{n} искры', many: '{n} искр', other: '{n} искры' },
ja: { other: 'スパーク {n}こ' }, 'zh-Hant': { other: '{n} 顆星光' },
he: { one: 'ניצוץ אחד', two: 'שני ניצוצות', other: '{n} ניצוצות' },
ar: { zero: 'لا شرارات', one: 'شرارة واحدة', two: 'شرارتان', few: '{n} شرارات', many: '{n} شرارة', other: '{n} شرارة' },
},
};
const LANGS = Object.keys(ROWS);
function chromeStrings() {
const out = {};
for (const lang of LANGS) {
const row = ROWS[lang].split('|'); const o = out[lang] = {};
KEYS.forEach((k, i) => { o[k] = row[i]; });
for (const k in PLURALS) if (PLURALS[k][lang]) o[k] = PLURALS[k][lang];
}
return out;
}
return { KEYS, LANGS, chromeStrings };
})();
const __m_i18n = (function () {
const { chromeStrings, LANGS } = __m_strings;
const RTL = new Set(['ar', 'he', 'fa', 'ur']);
const dirOf = lang => (RTL.has(String(lang).split('-')[0]) ? 'rtl' : 'ltr');
function normLang(lang) {
const l = String(lang || 'en');
if (LANGS.includes(l)) return l;
const base = l.split('-')[0].toLowerCase();
if (base === 'zh') return 'zh-Hant';
return LANGS.includes(base) ? base : 'en';
}
class I18n {
constructor(lang = 'en') {
this.tables = chromeStrings();
this.setLang(lang);
}
setLang(lang) {
this.raw = String(lang || 'en'); this.lang = normLang(lang); this.dir = dirOf(this.lang);
try { this.plural = new Intl.PluralRules(this.lang); } catch (e) { this.plural = { select: n => (n === 1 ? 'one' : 'other') }; }
this._nf = {};
}
strings(table) {
for (const lang in table || {}) { const L = normLang(lang) === lang ? lang : normLang(lang); this.tables[L] = Object.assign(this.tables[L] || {}, table[lang]); }
}
has(key) { return !!((this.tables[this.lang] || {})[key] || (this.tables.en || {})[key]); }
t(key, vars) {
let s = (this.tables[this.lang] || {})[key];
if (s == null && this.lang === 'en-GB') s = (this.tables.en || {})[key];
if (s == null) s = (this.tables.en || {})[key];
if (s == null) return String(key);
if (typeof s === 'object') { const n = vars && +vars.n; const form = isFinite(n) ? this.plural.select(n) : 'other'; s = s[form] != null ? s[form] : s.other != null ? s.other : ''; }
return vars ? String(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] == null ? m : typeof vars[k] === 'number' ? this.num(vars[k]) : String(vars[k]))) : String(s);
}
num(n, opts) {
const key = opts ? JSON.stringify(opts) : '';
let f = this._nf[key];
if (!f) { try { f = new Intl.NumberFormat(this.lang, opts); } catch (e) { f = { format: x => String(x) }; } this._nf[key] = f; }
return f.format(n);
}
units(text) { return splitUnits(text, this.lang); }
}
function splitUnits(text, lang) {
const s = String(text);
const byWord = lang === 'ar' || lang === 'he';
if (typeof Intl !== 'undefined' && Intl.Segmenter) {
try {
const seg = new Intl.Segmenter(lang, { granularity: byWord ? 'word' : 'grapheme' });
const out = []; for (const x of seg.segment(s)) out.push(x.segment); return out;
} catch (e) {  }
}
return byWord ? s.split(/(\s+)/).filter(Boolean) : Array.from(s);
}
return { I18n, dirOf, normLang, splitUnits };
})();
const __m_audio = (function () {
const { mulberry32 } = __m_rand;
const SDK_SFX = ['jump', 'hit', 'coin', 'lose', 'click', 'powerup'];
const KIT_SFX = ['pop', 'whoosh', 'correct', 'wrong', 'spark', 'step', 'land', 'select', 'levelup', 'count', 'hurt', 'win'];
const FALLBACK = { jump: 'whoosh', hit: 'hurt', coin: 'spark', lose: 'wrong', click: 'select', powerup: 'levelup' };
const PENTA = [0, 2, 4, 7, 9];
const hz = semi => 261.63 * Math.pow(2, semi / 12);
class KitAudio {
constructor({ brb = null, win = null, rng = mulberry32(7) } = {}) {
this.brb = brb; this.win = win; this.rng = rng;
this.ctx = null; this.out = null; this.sfxGain = null; this.musicGain = null;
this.volume = { sfx: 0.9, music: 0.45 };
this.bed = 'off'; this.nextNote = 0; this.stepI = 0;
this.queue = Promise.resolve(); this.speaking = false;
this.onCaption = null; this.onTalk = null; this.later = null;
this.noiseBuf = null; this._muted = false;
}
get muted() {
const s = this.brb && this.brb.sfx;
if (s && typeof s.muted === 'boolean') return s.muted;
return this._muted;
}
setMuted(on) {
const s = this.brb && this.brb.sfx;
if (s && typeof s.mute === 'function') s.mute(!!on); else this._muted = !!on;
if (this.musicGain && this.ctx) this.musicGain.gain.setTargetAtTime(on ? 0 : this.volume.music, this.ctx.currentTime, 0.05);
}
unlock() {
if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return this.ctx; }
const W = this.win; const AC = W && (W.AudioContext || W.webkitAudioContext); if (!AC) return null;
try { this.ctx = new AC(); } catch (e) { return null; }
const c = this.ctx;
this.out = c.createDynamicsCompressor(); this.out.connect(c.destination);
this.sfxGain = c.createGain(); this.sfxGain.gain.value = this.volume.sfx; this.sfxGain.connect(this.out);
this.musicGain = c.createGain(); this.musicGain.gain.value = this.muted ? 0 : this.volume.music; this.musicGain.connect(this.out);
const n = c.sampleRate * 0.5; this.noiseBuf = c.createBuffer(1, n, c.sampleRate);
const d = this.noiseBuf.getChannelData(0); const r = mulberry32(99); for (let i = 0; i < n; i++) d[i] = r() * 2 - 1;
return c;
}
sfx(name, opts = {}) {
name = String(name);
if (this.muted) return;
if (SDK_SFX.includes(name) && this.brb && this.brb.sfx && typeof this.brb.sfx.play === 'function') { try { this.brb.sfx.play(name); } catch (e) {  } return; }
const voice = VOICES[name] || VOICES[FALLBACK[name]] || VOICES.select;
const c = this.ctx; if (!c || !this.sfxGain) return;
const pv = opts.pitchVar == null ? 0.05 : +opts.pitchVar;
const pitch = (opts.pitch || 1) * (1 + (this.rng() * 2 - 1) * pv);
let dest = this.sfxGain;
const g = c.createGain(); g.gain.value = opts.volume == null ? 1 : +opts.volume;
if (c.createStereoPanner && opts.pan) { const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, +opts.pan || 0)) * 0.6; g.connect(p); p.connect(dest); } else g.connect(dest);
try { voice(this, g, c.currentTime + 0.005, pitch); } catch (e) {  }
}
tone(dest, t, f0, f1, dur, type = 'triangle', vol = 0.2, attack = 0.005) {
const c = this.ctx, o = c.createOscillator(), g = c.createGain();
o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.02);
}
noise(dest, t, dur, vol = 0.2, f = 1200, q = 0.8, type = 'bandpass', f1 = 0) {
const c = this.ctx, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
s.buffer = this.noiseBuf; fl.type = type; fl.frequency.setValueAtTime(f, t); if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + dur); fl.Q.value = q;
g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
s.connect(fl); fl.connect(g); g.connect(dest); s.start(t); s.stop(t + dur + 0.02);
}
music(bed) {
this.bed = BEDS[bed] ? bed : 'off';
if (this.ctx) this.nextNote = this.ctx.currentTime + 0.05;
this.stepI = 0;
}
tick() {
const c = this.ctx; if (!c || this.bed === 'off' || this.muted) return;
const bed = BEDS[this.bed]; const stepDur = 60 / bed.bpm / 2;
if (this.nextNote < c.currentTime) this.nextNote = c.currentTime + 0.02;
while (this.nextNote < c.currentTime + 0.25) {
bed.play(this, this.musicGain, this.nextNote, this.stepI, stepDur);
this.nextNote += stepDur; this.stepI++;
}
}
suspend() { try { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); } catch (e) {  } }
resume() { try { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); } catch (e) {  } if (this.ctx) this.nextNote = this.ctx.currentTime + 0.05; }
duck(on) { if (this.ctx && this.musicGain) this.musicGain.gain.setTargetAtTime(this.muted ? 0 : this.volume.music * (on ? 0.4 : 1), this.ctx.currentTime, 0.08); }
say(text, opts = {}) {
const run = () => new Promise(resolve => {
text = String(text || ''); if (!text) return resolve();
this.speaking = true; this.duck(true);
if (this.onCaption) this.onCaption(text, opts);
if (this.onTalk) this.onTalk(true, opts.who);
let done = false;
const finish = () => { if (done) return; done = true; this.speaking = false; this.duck(false); if (this.onTalk) this.onTalk(false, opts.who); resolve(); };
const minMs = 700 + text.length * 55;
let started = false;
if (opts.readAloud !== false && this.brb && typeof this.brb.speak === 'function' && !this.muted) {
try { started = !!this.brb.speak(text, { lang: opts.lang, onend: finish }); } catch (e) { started = false; }
}
if (this.later) this.later(started ? minMs * 3 + 4000 : minMs, finish); else finish();
});
const p = this.queue.then(run, run); this.queue = p; return p;
}
}
const VOICES = {
pop: (a, d, t, p) => { a.tone(d, t, 520 * p, 880 * p, 0.09, 'sine', 0.35); a.tone(d, t + 0.02, 1100 * p, 0, 0.05, 'triangle', 0.08); },
whoosh: (a, d, t, p) => a.noise(d, t, 0.22, 0.18, 500 * p, 1.2, 'bandpass', 2400 * p),
correct: (a, d, t, p) => { a.tone(d, t, 660 * p, 0, 0.12, 'triangle', 0.25); a.tone(d, t + 0.1, 990 * p, 0, 0.22, 'triangle', 0.25); },
wrong: (a, d, t, p) => { a.tone(d, t, 330 * p, 300 * p, 0.16, 'sine', 0.22); a.tone(d, t + 0.14, 262 * p, 250 * p, 0.24, 'sine', 0.2); },
spark: (a, d, t, p) => { a.tone(d, t, 1320 * p, 0, 0.07, 'triangle', 0.18); a.tone(d, t + 0.05, 1760 * p, 0, 0.16, 'sine', 0.16); a.tone(d, t + 0.05, 2640 * p, 0, 0.1, 'sine', 0.05); },
step: (a, d, t, p) => a.noise(d, t, 0.05, 0.08, 900 * p, 2, 'bandpass'),
land: (a, d, t, p) => { a.noise(d, t, 0.12, 0.2, 300 * p, 0.7, 'lowpass', 120); a.tone(d, t, 140 * p, 70 * p, 0.1, 'sine', 0.2); },
select: (a, d, t, p) => a.tone(d, t, 880 * p, 0, 0.06, 'triangle', 0.16),
levelup: (a, d, t, p) => [523, 659, 784, 1047, 1319].forEach((f, i) => a.tone(d, t + i * 0.07, f * p, 0, 0.18, 'triangle', 0.16)),
count: (a, d, t, p) => a.tone(d, t, 740 * p, 0, 0.12, 'sine', 0.22),
hurt: (a, d, t, p) => { a.tone(d, t, 300 * p, 140 * p, 0.2, 'triangle', 0.25); a.noise(d, t, 0.1, 0.1, 800, 1, 'bandpass'); },
win: (a, d, t, p) => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => a.tone(d, t + i * 0.11, f * p, 0, i === 5 ? 0.5 : 0.2, 'triangle', 0.18)),
};
const BEDS = {
meadow: { bpm: 104, play(a, d, t, i, s) {
const bar = Math.floor(i / 16) % 4, k = i % 16, root = [0, -3, 5, 2][bar];
if (k % 4 === 0) a.tone(d, t, hz(root - 24), 0, s * 3.5, 'triangle', 0.16, 0.01);
const h = Math.imul(i * 2654435761, 1) >>> 0;
if ((h >>> 3) % 3 !== 0 && k % 2 === 0) a.tone(d, t, hz(root + PENTA[(h >>> 7) % 5] + 12 * (1 + ((h >>> 11) & 1))), 0, s * 1.6, 'triangle', 0.07, 0.01);
if (k === 6 || k === 14) a.noise(d, t, 0.04, 0.025, 6000, 1, 'highpass');
} },
calm: { bpm: 72, play(a, d, t, i, s) {
const bar = Math.floor(i / 16) % 2, k = i % 16, root = bar ? -5 : 0;
if (k === 0) [0, 4, 7].forEach(n => a.tone(d, t, hz(root + n - 12), 0, s * 14, 'sine', 0.05, 0.4));
const h = Math.imul(i * 2246822519, 1) >>> 0;
if (k % 4 === 2 && (h & 3)) a.tone(d, t, hz(root + PENTA[(h >>> 5) % 5] + 12), 0, s * 3, 'sine', 0.06, 0.03);
} },
};
return { KIT_SFX, KitAudio, SDK_SFX };
})();
const __m_save = (function () {
const SAVE_KEY = '__ok_save', MAX_BYTES = 32 * 1024;
class Save {
constructor(storage, key = SAVE_KEY) {
this.storage = storage || memoryStorage(); this.key = key;
this.v = 1; this.defaults = {}; this.data = {}; this.dirty = false; this.warn = null;
}
define({ v = 1, defaults = {}, migrate = null } = {}) {
this.v = v | 0 || 1; this.defaults = clone(defaults);
let stored = null; try { stored = this.storage.get(this.key); } catch (e) { stored = null; }
let data = stored && typeof stored === 'object' && stored.d && typeof stored.d === 'object' ? stored.d : null;
const from = stored && stored.v | 0;
if (data && from !== this.v) {
if (typeof migrate === 'function') { try { data = migrate(clone(data), from) || null; } catch (e) { data = null; } } else data = null;
}
this.data = Object.assign(clone(this.defaults), data || {});
return this.data;
}
get() { return this.data; }
set(patch) { if (patch && typeof patch === 'object') { Object.assign(this.data, patch); this.dirty = true; } return this.data; }
reset() { this.data = clone(this.defaults); this.dirty = true; }
flush() {
if (!this.dirty) return true; this.dirty = false;
const rec = { v: this.v, d: this.data };
const s = JSON.stringify(rec);
if (s.length > MAX_BYTES) { if (this.warn) this.warn(`save is ${s.length} bytes (limit ${MAX_BYTES}); not written`); return false; }
try { this.storage.set(this.key, rec); return true; } catch (e) { return false; }
}
}
function memoryStorage() { const m = new Map(); return { get: k => (m.has(k) ? JSON.parse(m.get(k)) : null), set: (k, v) => m.set(k, JSON.stringify(v)), remove: k => m.delete(k) }; }
const clone = o => JSON.parse(JSON.stringify(o || {}));
return { MAX_BYTES, SAVE_KEY, Save, memoryStorage };
})();
const __m_settings = (function () {
const SETTINGS_KEY = '__ok_settings';
const SETTING_DEFAULTS = { motion: 'auto', captions: false, readAloud: true, textSize: 1, speed: 1, assist: 'none', contrast: false, cvd: false, leftHanded: false, graphics: 'auto', music: true };
const ALLOWED = {
motion: ['auto', 'reduce', 'full'], textSize: [1, 1.25, 1.5], speed: [0.5, 0.75, 1], assist: ['none', 'hearts', 'nofail'], graphics: ['auto', 'simple', 'fancy'],
};
class Settings {
constructor({ storage = null, brb = null, win = null } = {}) {
this.storage = storage; this.brb = brb; this.win = win; this.fns = [];
this.values = Object.assign({}, SETTING_DEFAULTS);
try { const s = storage && storage.get(SETTINGS_KEY); if (s && typeof s === 'object') this.patch(s, true); } catch (e) {  }
this.mq = null;
try { this.mq = win && win.matchMedia ? win.matchMedia('(prefers-reduced-motion: reduce)') : null; } catch (e) { this.mq = null; }
if (this.mq && this.mq.addEventListener) this.mq.addEventListener('change', () => this.emit());
}
get(k) { return this.values[k]; }
patch(p, quiet = false) {
let changed = false;
for (const k in p) {
if (!(k in SETTING_DEFAULTS)) continue;
let v = p[k];
if (ALLOWED[k]) { if (!ALLOWED[k].includes(v)) continue; } else if (typeof SETTING_DEFAULTS[k] === 'boolean') v = !!v;
if (this.values[k] !== v) { this.values[k] = v; changed = true; }
}
if (changed && !quiet) { try { if (this.storage) this.storage.set(SETTINGS_KEY, this.values); } catch (e) {  } this.emit(); }
return changed;
}
get reduced() {
const m = this.values.motion;
if (m === 'reduce') return true; if (m === 'full') return false;
const b = this.brb && this.brb.motion;
if (b === 'reduce') return true; if (b === 'full') return false;
return !!(this.mq && this.mq.matches);
}
on(ev, fn) { this.fns.push(fn); return () => { const i = this.fns.indexOf(fn); if (i >= 0) this.fns.splice(i, 1); }; }
emit() { for (const fn of this.fns.slice()) { try { fn(this.values); } catch (e) {  } } }
}
return { SETTINGS_KEY, SETTING_DEFAULTS, Settings };
})();
const __m_theme = (function () {
class Theme {
constructor({ brb = null, win = null, pinned = 'auto' } = {}) {
this.brb = brb; this.win = win; this.fns = []; this.pinned = pinned; this.biome = 'meadow';
this.mq = null;
try { this.mq = win && win.matchMedia ? win.matchMedia('(prefers-color-scheme: dark)') : null; } catch (e) { this.mq = null; }
this.mode = this.resolve();
if (this.mq && this.mq.addEventListener) this.mq.addEventListener('change', () => this.refresh());
if (brb && typeof brb.on === 'function') { try { brb.on('theme', () => this.refresh()); } catch (e) {  } }
}
resolve() {
if (this.pinned === 'light' || this.pinned === 'dark') return this.pinned;
const b = this.brb && this.brb.theme;
if (b === 'light' || b === 'dark') return b;
return this.mq && this.mq.matches ? 'dark' : 'light';
}
refresh() { const m = this.resolve(); if (m !== this.mode) { this.mode = m; this.emit(); } }
set(mode) { this.pinned = mode === 'light' || mode === 'dark' ? mode : 'auto'; this.refresh(); }
get dark() { return this.mode === 'dark'; }
on(ev, fn) { this.fns.push(fn); return () => { const i = this.fns.indexOf(fn); if (i >= 0) this.fns.splice(i, 1); }; }
emit() { for (const fn of this.fns.slice()) { try { fn(this.mode); } catch (e) {  } } }
}
return { Theme };
})();
const __m_validate = (function () {
const { PALETTE, HUES, ROLES, nearestHue } = __m_tokens;
const SPECIES = ['oomba', 'kid', 'fox', 'bunny', 'frog', 'bee'];
const MOODS = ['happy', 'sad', 'surprised', 'determined', 'thinking', 'sleepy', 'wink'];
const BODIES = ['bean', 'ball', 'pear'];
const HAIR_STYLES = ['puffs', 'bob', 'curls', 'spiky', 'braids', 'buzz', 'long', 'cap'];
const TOPS = ['tee', 'hoodie', 'dress', 'overalls'];
const WEAR = ['scarf', 'glasses', 'crown', 'wizard-hat', 'backpack', 'headphones'];
const PARTS = ['move', 'player', 'patrol', 'follow', 'bob', 'fly', 'collectible', 'hazard', 'goal', 'checkpoint', 'spring', 'quizGate', 'talk', 'lantern', 'shadow', 'glow'];
function editDistance(a, b) {
a = String(a); b = String(b);
const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
let prev = new Array(n + 1), cur = new Array(n + 1);
for (let j = 0; j <= n; j++) prev[j] = j;
for (let i = 1; i <= m; i++) {
cur[0] = i;
for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
const t = prev; prev = cur; cur = t;
}
return prev[n];
}
function nearest(name, list, fallback, maxD = 2) {
const s = String(name || '').toLowerCase().trim();
if (list.includes(s)) return s;
let best = fallback, bd = Infinity;
for (const x of list) { const d = editDistance(s, x); if (d < bd) { bd = d; best = x; } }
return bd <= maxD ? best : fallback;
}
const clamp = (v, a, b, d) => { v = +v; return isFinite(v) ? Math.max(a, Math.min(b, v)) : d; };
function hueOf(c, warnings, fallback = 'mint') {
if (c == null) return fallback;
const s = String(c).trim();
if (PALETTE[s]) return s;
if (ROLES[s]) return ROLES[s];
if (/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s)) { const h = nearestHue(s.startsWith('#') ? s : '#' + s).hue; if (warnings) warnings.push(`colour ${s} snapped to "${h}"`); return h; }
const n = nearest(s, HUES, fallback, 2); if (warnings) warnings.push(`unknown colour "${s}" -> "${n}"`); return n;
}
function validate(kind, spec) {
const w = [];
const s = Object.assign({}, spec || {});
if (kind === 'char') {
const sp = nearest(s.species, SPECIES, 'oomba');
if (sp !== s.species) w.push(`species "${s.species}" -> "${sp}"`);
s.species = sp;
s.body = BODIES.includes(s.body) ? s.body : 'bean';
s.size = clamp(s.size, 0.6, 1.4, 1);
const c = s.colors || {};
s.colors = { base: hueOf(c.base, w, sp === 'fox' || sp === 'bee' ? 'peach' : 'mint'), belly: hueOf(c.belly, w, 'cream'), accent: hueOf(c.accent, w, 'spark') };
s.skin = clamp(s.skin | 0, 0, 7, 0) | 0;
if (s.hair) s.hair = { style: nearest(s.hair.style, HAIR_STYLES, 'bob'), color: s.hair.color || 'cocoa' };
if (s.outfit) s.outfit = { top: nearest(s.outfit.top, TOPS, 'tee'), color: hueOf(s.outfit.color, w, 'sky') };
s.mood = MOODS.includes(s.mood) ? s.mood : 'happy';
s.wear = [].concat(s.wear || []).map(x => { const n = nearest(x, WEAR, null); if (!n) w.push(`unknown wear "${x}"`); return n; }).filter(Boolean);
s.seed = isFinite(+s.seed) ? +s.seed | 0 : 1;
return { spec: Object.freeze(s), warnings: w };
}
if (kind === 'legend') {
const out = {};
for (const k in s) { if ([...k].length !== 1) { w.push(`legend key "${k}" must be one character`); continue; } out[k] = s[k]; }
return { spec: out, warnings: w };
}
if (kind === 'parts') {
const list = [].concat(spec || []).filter(p => { const name = typeof p === 'string' ? p : p && Object.keys(p)[0]; if (!PARTS.includes(name)) { w.push(`unknown part "${name}"`); return false; } return true; });
return { spec: list, warnings: w };
}
if (kind === 'game') {
s.api = 1;
s.size = Array.isArray(s.size) && s.size.length === 2 ? [clamp(s.size[0], 320, 3840, 960), clamp(s.size[1], 240, 2160, 540)] : [960, 540];
s.fit = s.fit === 'letterbox' ? 'letterbox' : 'expand';
s.theme = ['light', 'dark'].includes(s.theme) ? s.theme : 'auto';
s.backend = ['paper', 'glaze'].includes(s.backend) ? s.backend : 'auto';
if (s.howTo && s.howTo.length > 3) { w.push('howTo has more than 3 cards; extra cards dropped'); s.howTo = s.howTo.slice(0, 3); }
return { spec: s, warnings: w };
}
return { spec: s, warnings: w };
}
return { BODIES, HAIR_STYLES, MOODS, PARTS, SPECIES, TOPS, WEAR, editDistance, hueOf, nearest, validate };
})();
const __m_list = (function () {
const { LAYERS } = __m_tokens;
const FIELDS_F = ['x', 'y', 'w', 'h', 'ax', 'ay', 'rot', 'alpha', 'tr', 'tg', 'tb', 'flash', 'emis', 'lit', 'par', 'wind', 'grade'];
const BLEND_ALPHA = 0, BLEND_ADD = 1;
const NLAYERS = LAYERS.length;
class DisplayList {
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
push(e, x, y, w, h, layer = 5, par = 1) {
if (this.n >= this.cap) this._alloc(this.cap * 2);
const i = this.n++;
this.e[i] = e; this.x[i] = x; this.y[i] = y; this.w[i] = w; this.h[i] = h; this.layer[i] = layer; this.par[i] = par;
this.ax[i] = 0.5; this.ay[i] = 0.5; this.rot[i] = 0; this.alpha[i] = 1; this.tr[i] = 1; this.tg[i] = 1; this.tb[i] = 1;
this.flash[i] = 0; this.emis[i] = 0; this.lit[i] = 1; this.blend[i] = BLEND_ALPHA; this.wind[i] = 0; this.grade[i] = 1;
return i;
}
order() {
const c = this.counts; c.fill(0);
const n = this.n, L = this.layer, idx = this.idx;
for (let i = 0; i < n; i++) c[L[i] + 1]++;
for (let k = 1; k <= NLAYERS; k++) c[k] += c[k - 1];
for (let i = 0; i < n; i++) idx[c[L[i]]++] = i;
return idx;
}
}
class View {
constructor() {
this.scale = 1; this.offX = 0; this.offY = 0; this.vw = 960; this.vh = 540;
this.camX = 0; this.camY = 0; this.zoom = 1; this.shakeX = 0; this.shakeY = 0; this.shakeRot = 0;
this.pw = 1; this.ph = 1;
}
matrix(L, i, out) {
const par = L.par[i], s = this.scale;
let x, y, z = 1, rot = L.rot[i];
if (par === 0) { x = L.x[i]; y = L.y[i]; }
else {
z = 1 + (this.zoom - 1) * Math.min(1, par);
const k = Math.min(1, par);
const dx = (L.x[i] - this.camX * par) * z, dy = (L.y[i] - this.camY * par) * z;
const cr = Math.cos(this.shakeRot * k), sr = Math.sin(this.shakeRot * k);
x = this.vw / 2 + dx * cr - dy * sr + this.shakeX * k;
y = this.vh / 2 + dx * sr + dy * cr + this.shakeY * k;
rot += this.shakeRot * k;
}
const c = Math.cos(rot), sn = Math.sin(rot), m = s * z;
out[0] = c * m; out[1] = sn * m; out[2] = -sn * m; out[3] = c * m;
out[4] = this.offX + x * s; out[5] = this.offY + y * s;
return out;
}
}
return { BLEND_ADD, BLEND_ALPHA, DisplayList, NLAYERS, View };
})();
const __m_atlas = (function () {
const PAD = 2;
const EMIT = '#FF0000', UNLIT = '#00FF00';
const RATIO = Math.log(1.15);
const bucket = px => Math.max(4, Math.round(Math.exp(Math.round(Math.log(Math.max(4, px)) / RATIO) * RATIO)));
const NIGHT_TINT = '#8EA3C8';
const MOON_GRADE = 0.28;
const VARIANTS = ['night', 'white', 'moon'];
const grow = (r, x0, y0, x1, y1) => (r ? [Math.min(r[0], x0), Math.min(r[1], y0), Math.max(r[2], x1), Math.max(r[3], y1)] : [x0, y0, x1, y1]);
class Shelves {
constructor(size) { this.size = size; this.reset(); }
reset() { this.shelves = []; this.top = 0; this.used = 0; }
add(w, h) {
w += PAD * 2; h += PAD * 2;
if (w > this.size || h > this.size) return null;
let best = null;
for (const s of this.shelves) if (h <= s.h && s.x + w <= this.size && (!best || s.h < best.h)) best = s;
if (!best) {
if (this.top + h > this.size) return null;
best = { y: this.top, h, x: 0 }; this.shelves.push(best); this.top += h;
}
const r = { x: best.x + PAD, y: best.y + PAD }; best.x += w; this.used += w * h;
return r;
}
}
let UID = 1;
class Atlas {
constructor({ doc, pageSize = 2048, maxPages = 6, now = () => 0 } = {}) {
this.doc = doc; this.size = pageSize; this.maxPages = maxPages; this.now = now;
this.pages = []; this.entries = []; this.map = new Map(); this.defs = new Map();
this.queue = []; this.frame = 0; this.bakes = 0; this.scratch = null; this.scratch2 = null; this.freed = 0;
}
canvas(w, h) { const c = this.doc.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; }
get livePages() { let n = 0; for (const p of this.pages) if (!p.dead) n++; return n; }
_page(dedicated = null) {
const canvas = dedicated || this.canvas(this.size, this.size);
let id = this.pages.findIndex(p => p.dead); if (id < 0) id = this.pages.length;
const p = { canvas, ctx: canvas.getContext('2d'), mask: null, mctx: null, packer: dedicated ? null : new Shelves(this.size), lastUsed: this.frame, version: 1, maskVersion: 0,
dedicated: !!dedicated, id, uid: UID++, ids: [], dead: false, dr: null, mdr: null, full: true };
this.pages[id] = p; return p;
}
_alloc(w, h) {
for (const p of this.pages) if (p.packer && !p.dead) { const r = p.packer.add(w, h); if (r) return [p, r]; }
if (this.pages.filter(p => p.packer && !p.dead).length < this.maxPages) { const p = this._page(); return [p, p.packer.add(w, h)]; }
let lru = null; for (const p of this.pages) if (p.packer && !p.dead && p.lastUsed < this.frame && (!lru || p.lastUsed < lru.lastUsed)) lru = p;
if (!lru) return [null, null];
this.evictPage(lru);
return [lru, lru.packer.add(w, h)];
}
_dropEntry(id) {
const e = this.entries[id]; if (!e || !e.alive) return;
e.alive = false; if (this.map.get(e.key) === id) this.map.delete(e.key);
for (const k of VARIANTS) if (e[k] >= 0) { const v = this.entries[e[k]]; e[k] = -1; if (v && v.alive) { if (this.pages[v.page].dedicated) this.freePage(v.page); else this._dropEntry(v.id); } }
}
evictPage(p) {
for (const id of p.ids) this._dropEntry(id);
p.ids = []; p.packer.reset(); p.ctx.clearRect(0, 0, this.size, this.size);
if (p.mctx) p.mctx.clearRect(0, 0, this.size, this.size);
p.version++; p.maskVersion++; p.full = true; p.dr = p.mdr = null;
}
freePage(id) {
const p = this.pages[id]; if (!p || p.dead) return;
const ids = p.ids; p.ids = []; for (const i of ids) this._dropEntry(i);
p.dead = true; this.freed++;
try { p.canvas.width = p.canvas.height = 0; if (p.mask) p.mask.width = p.mask.height = 0; } catch (e) {  }
p.canvas = p.ctx = p.mask = p.mctx = null; p.packer = null;
}
_entry(key, p, r, w, h, ax, ay) {
const e = { id: this.entries.length, key, page: p.id, x: r.x, y: r.y, w, h, ax, ay, alive: true, mask: false, night: -1, white: -1, moon: -1 };
this.entries.push(e); this.map.set(key, e.id); p.ids.push(e.id); p.version++;
return e;
}
maskCtx(p) {
if (!p.mask) { p.mask = this.canvas(p.canvas.width, p.canvas.height); p.mctx = p.mask.getContext('2d'); p.mfull = true; }
p.maskVersion++; return p.mctx;
}
bake(key, w, h, draw, opts = {}) {
if (this.map.has(key)) return this.map.get(key);
w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
const [p, r] = this._alloc(w, h);
if (!p || !r) return -1;
const e = this._entry(key, p, r, w, h, opts.ax == null ? 0.5 : opts.ax, opts.ay == null ? 0.5 : opts.ay);
const ctx = p.ctx; ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, w, h); ctx.clip(); ctx.translate(r.x, r.y);
const box = [r.x - 1, r.y - 1, r.x + w + 1, r.y + h + 1];
if (p.mctx) { p.mctx.setTransform(1, 0, 0, 1, 0, 0); p.mctx.clearRect(r.x, r.y, w, h); p.maskVersion++; p.mdr = grow(p.mdr, ...box); }
const self = this;
const k = { w, h, mask() {
const m = self.maskCtx(p);
if (!e.mask) { e.mask = true; p.mdr = grow(p.mdr, ...box); m.save(); m.setTransform(1, 0, 0, 1, 0, 0); m.beginPath(); m.rect(r.x, r.y, w, h); m.clip(); }
m.setTransform(1, 0, 0, 1, r.x, r.y); m.globalCompositeOperation = 'lighter'; return m;
} };
try { draw(ctx, k); } catch (err) { if (typeof console !== 'undefined') console.warn('[oomba] bake failed', key, err); }
ctx.restore();
if (e.mask) { p.mctx.restore(); p.mctx.setTransform(1, 0, 0, 1, 0, 0); p.mctx.globalCompositeOperation = 'source-over'; }
p.dr = grow(p.dr, ...box);
this.bakes++;
return e.id;
}
dedicated(key, canvas, opts = {}) {
if (this.map.has(key)) return this.map.get(key);
const p = this._page(canvas);
return this._entry(key, p, { x: 0, y: 0 }, canvas.width, canvas.height, opts.ax == null ? 0 : opts.ax, opts.ay == null ? 0 : opts.ay).id;
}
replace(id, canvas, mask = null) {
const e = this.entries[id]; if (!e || !e.alive) return -1;
const p = this.pages[e.page]; if (!p.dedicated) return -1;
for (const k of VARIANTS) if (e[k] >= 0) { const v = this.entries[e[k]]; e[k] = -1; if (v && v.alive) this.freePage(v.page); }
if (p.canvas !== canvas) { try { p.canvas.width = p.canvas.height = 0; } catch (err) {  } }
if (p.mask && p.mask !== mask) { try { p.mask.width = p.mask.height = 0; } catch (err) {  } }
p.canvas = canvas; p.ctx = canvas.getContext('2d'); e.w = canvas.width; e.h = canvas.height;
p.mask = mask; p.mctx = mask ? mask.getContext('2d') : null; e.mask = !!mask;
p.version++; p.maskVersion++; p.full = true; p.mfull = true; p.dr = p.mdr = null;
return id;
}
setMask(id, maskCanvas) { const e = this.entries[id]; const p = this.pages[e.page]; p.mask = maskCanvas; p.mctx = maskCanvas.getContext('2d'); p.maskVersion++; p.mfull = true; e.mask = true; }
forgetText() { for (const e of this.entries) { if (!e.alive) continue; const d = this.defs.get(e.key.split('|')[0]); if (d && d.text) this._dropEntry(e.id); } }
touch(id) { const e = this.entries[id]; if (e) this.pages[e.page].lastUsed = this.frame; }
get(key) { const id = this.map.get(key); return id == null ? -1 : id; }
define(name, def) { this.defs.set(name, def); }
has(name) { return this.defs.has(name); }
sprite(name, hPx, v = '') {
const def = this.defs.get(name); if (!def) return -1;
const b = bucket(hPx);
const key = name + '|' + v + '|' + b;
const id = this.map.get(key);
this.lastExact = true;
if (id != null) return id;
let near = -1, nd = Infinity;
for (let d = 1; d < 6 && near < 0; d++) for (const s of [d, -d]) {
const nb = bucket(b * Math.pow(1.15, s)); const nid = this.map.get(name + '|' + v + '|' + nb);
if (nid != null && Math.abs(s) < nd) { near = nid; nd = Math.abs(s); }
}
if (near >= 0) { if (!this.queue.some(q => q.key === key)) this.queue.push({ key, name, v, b }); this.lastExact = false; return near; }
return this._bakeSprite(key, name, v, b);
}
_bakeSprite(key, name, v, b) {
const def = this.defs.get(name);
const k = b / def.h, w = Math.ceil(def.w * k) + 2, h = Math.ceil(def.h * k) + 2;
return this.bake(key, w, h, (ctx, kk) => { ctx.translate(1, 1); ctx.scale(k, k); def.draw(ctx, { s: k, px: def.lineH ? b * def.lineH / def.h : b, w: def.w, h: def.h, v, mask: () => { const m = kk.mask(); m.translate(1, 1); m.scale(k, k); return m; } }); }, { ax: def.ax, ay: def.ay });
}
pump(budgetMs = 4, clock = null) {
this.frame++;
if (!this.queue.length) return 0;
const t0 = clock ? clock() : 0; let n = 0;
while (this.queue.length) {
const q = this.queue.shift();
if (q.of != null) { const e = this.entries[q.of]; if (e && e.alive && !(e[q.kind] >= 0 && this.entries[e[q.kind]].alive)) { this._variant(q.of, q.kind); n++; } }
else if (!this.map.has(q.key)) { this._bakeSprite(q.key, q.name, q.v, q.b); n++; }
if (!clock || clock() - t0 > budgetMs) break;
}
return n;
}
prebake(list) { const ids = []; for (const [name, px, v] of list) { const id = this.sprite(name, px, v || ''); if (id >= 0) ids.push(id); } return ids; }
_scratch(w, h, two = false) {
const k = two ? 'scratch2' : 'scratch';
if (!this[k] || this[k].width < w || this[k].height < h) this[k] = this.canvas(Math.max(w, this[k] ? this[k].width : 0), Math.max(h, this[k] ? this[k].height : 0));
const c = this[k].getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.clearRect(0, 0, w, h);
return c;
}
variant(id, kind, now = false) {
const e = this.entries[id]; if (!e || !e.alive) return -1;
const v = e[kind]; if (v >= 0 && this.entries[v].alive) return v;
if (now) return this._variant(id, kind);
if (!this.queue.some(q => q.of === id && q.kind === kind)) this.queue.push({ of: id, kind });
return -1;
}
_variant(id, kind) {
const e = this.entries[id]; if (!e || !e.alive) return -1;
const src = this.pages[e.page]; src.lastUsed = this.frame;
let nightE = null;
if (kind === 'moon') { const n = this._variant(id, 'night'); nightE = n >= 0 ? this.entries[n] : null; if (!nightE) return -1; this.pages[nightE.page].lastUsed = this.frame; }
const paint = s => {
s.drawImage(src.canvas, e.x, e.y, e.w, e.h, 0, 0, e.w, e.h);
if (kind === 'moon') { s.globalAlpha = MOON_GRADE; s.drawImage(this.pages[nightE.page].canvas, nightE.x, nightE.y, nightE.w, nightE.h, 0, 0, e.w, e.h); s.globalAlpha = 1; }
else if (kind === 'white') { s.globalCompositeOperation = 'source-in'; s.fillStyle = '#FFFFFF'; s.fillRect(0, 0, e.w, e.h); }
else {
s.globalCompositeOperation = 'multiply'; s.fillStyle = NIGHT_TINT; s.fillRect(0, 0, e.w, e.h);
s.globalCompositeOperation = 'destination-in'; s.drawImage(src.canvas, e.x, e.y, e.w, e.h, 0, 0, e.w, e.h);
if (e.mask && src.mask) {
const keep = this._scratch(e.w, e.h, true);
keep.drawImage(src.canvas, e.x, e.y, e.w, e.h, 0, 0, e.w, e.h);
keep.globalCompositeOperation = 'destination-in'; keep.drawImage(src.mask, e.x, e.y, e.w, e.h, 0, 0, e.w, e.h);
s.globalCompositeOperation = 'source-over'; s.drawImage(this.scratch2, 0, 0, e.w, e.h, 0, 0, e.w, e.h);
}
}
s.globalCompositeOperation = 'source-over';
};
let nid;
if (src.dedicated) { const c = this.canvas(e.w, e.h); paint(c.getContext('2d')); nid = this.dedicated(e.key + '#' + kind, c, { ax: e.ax, ay: e.ay }); }
else nid = this.bake(e.key + '#' + kind, e.w, e.h, ctx => { const s = this._scratch(e.w, e.h); paint(s); ctx.drawImage(this.scratch, 0, 0, e.w, e.h, 0, 0, e.w, e.h); }, { ax: e.ax, ay: e.ay });
if (nid >= 0) e[kind] = nid;
return nid;
}
}
return { Atlas, EMIT, MOON_GRADE, NIGHT_TINT, PAD, Shelves, UNLIT, bucket };
})();
const __m_camera = (function () {
const { noise1 } = __m_rand;
const { motion } = __m_tokens;
class Camera {
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
return { Camera };
})();
const __m_particles = (function () {
const { hexToRgb } = __m_color;
const { PALETTE } = __m_tokens;
const C = h => hexToRgb(h).map(v => v / 255);
const CONFETTI = [PALETTE.mint[2], PALETTE.spark[2], PALETTE.coral[2], PALETTE.sky[2], PALETTE.grape[2], PALETTE.mint[1]].map(C);
const PRESETS = {
sparkle: { sprite: 'twinkle', n: 14, sp: [80, 260], g: 60, drag: 2.2, life: [0.35, 0.7], size: [10, 22], spin: 4, add: 1, colors: [C(PALETTE.spark[1]), C('#FFFFFF'), C(PALETTE.spark[0])], shrink: 1 },
dust: { sprite: 'puff', n: 7, sp: [30, 110], g: -20, drag: 3, life: [0.3, 0.55], size: [14, 26], spin: 1, add: 0, colors: [C(PALETTE.cream[0]), C(PALETTE.stone[0])], grow: 1, up: 0.25 },
confetti: { sprite: 'confetti', n: 60, sp: [200, 520], g: 520, drag: 1.4, life: [1.6, 2.6], size: [9, 15], spin: 9, add: 0, colors: CONFETTI, flutter: 1, up: 1 },
coins: { sprite: 'spark', n: 8, sp: [180, 340], g: 700, drag: 0.6, life: [0.7, 1], size: [16, 22], spin: 6, add: 0, colors: [[1, 1, 1]], up: 1 },
splash: { sprite: 'dot', n: 12, sp: [90, 240], g: 600, drag: 1, life: [0.4, 0.7], size: [6, 12], spin: 0, add: 0, colors: [C(PALETTE.sky[1]), C(PALETTE.sky[0])], up: 1 },
smoke: { sprite: 'puff', n: 6, sp: [20, 60], g: -60, drag: 1.5, life: [0.8, 1.4], size: [20, 40], spin: 1, add: 0, colors: [C(PALETTE.stone[1]), C(PALETTE.snow[2])], grow: 1 },
hearts: { sprite: 'heart', n: 6, sp: [60, 160], g: -80, drag: 1.5, life: [0.8, 1.2], size: [14, 22], spin: 2, add: 0, colors: [[1, 1, 1]], up: 1 },
fireflies: { sprite: 'glow', n: 1, sp: [4, 14], g: 0, drag: 0, life: [6, 10], size: [7, 11], spin: 0, add: 1, colors: [C('#D4F57A'), C('#C2EE6E'), C('#E3F88F')], wander: 1, blink: 1 },
chips: { sprite: 'chip', n: 10, sp: [120, 300], g: 900, drag: 0.8, life: [0.5, 0.8], size: [8, 14], spin: 10, add: 0, colors: [C(PALETTE.cocoa[1]), C(PALETTE.cocoa[2]), C(PALETTE.stone[1])], up: 1 },
sparks: { sprite: 'twinkle', n: 10, sp: [160, 380], g: 300, drag: 1.2, life: [0.25, 0.5], size: [6, 12], spin: 8, add: 1, colors: [C(PALETTE.spark[2]), C(PALETTE.peach[1])], shrink: 1 },
};
const PRESET_NAMES = Object.keys(PRESETS);
const MOVE = ['x', 'y', 'vx', 'vy', 'life', 'max', 'size', 'rot', 'vr', 'g', 'drag', 'r', 'gg', 'b', 'seed', 'sprite', 'add', 'flags', 'layer'];
const SPRITES = [...new Set(Object.values(PRESETS).map(p => p.sprite))];
class Particles {
constructor(cap = 1024, rng = Math.sin) {
this.cap = cap; this.limit = 300; this.n = 0; this.rng = rng; this.reduced = false; this.k = 1;
const F = () => new Float32Array(cap);
this.x = F(); this.y = F(); this.vx = F(); this.vy = F(); this.life = F(); this.max = F(); this.size = F(); this.rot = F(); this.vr = F();
this.g = F(); this.drag = F(); this.r = F(); this.gg = F(); this.b = F(); this.seed = F();
this.sprite = new Uint8Array(cap); this.add = new Uint8Array(cap); this.flags = new Uint8Array(cap); this.layer = new Uint8Array(cap);
this.spriteNames = SPRITES;
}
get count() { return this.n; }
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
if (f & 8) {
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
return { PRESETS, PRESET_NAMES, Particles };
})();
const __m_sky = (function () {
const { hexToOklab, oklabToHex } = __m_color;
const { PALETTE, NIGHT_SKY } = __m_tokens;
const SKY_KEYS = [
[0.0, PALETTE.sky[1], '#E4F5EC', [1, 1, 1]],
[0.22, '#86C4EE', '#FFF1D2', [1, 0.98, 0.93]],
[0.42, '#F6B27F', '#FFE9A6', [1.0, 0.93, 0.82]],
[0.68, '#7A55C9', '#FF9C8F', [0.66, 0.6, 0.78]],
[1.0, NIGHT_SKY[0], NIGHT_SKY[1], [0.5, 0.57, 0.76]],
];
const LAB = SKY_KEYS.map(k => [k[0], hexToOklab(k[1]), hexToOklab(k[2]), k[3]]);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function sky(tod, out = {}) {
tod = Math.max(0, Math.min(1, +tod || 0));
let i = 0; while (i < LAB.length - 2 && tod > LAB[i + 1][0]) i++;
const A = LAB[i], B = LAB[i + 1];
const t = smooth(0, 1, (tod - A[0]) / (B[0] - A[0]));
const top = out.top || (out.top = [0, 0, 0]), bottom = out.bottom || (out.bottom = [0, 0, 0]), amb = out.ambient || (out.ambient = [0, 0, 0]);
for (let k = 0; k < 3; k++) { top[k] = lerp(A[1][k], B[1][k], t); bottom[k] = lerp(A[2][k], B[2][k], t); amb[k] = lerp(A[3][k], B[3][k], t); }
const sun = out.sun || (out.sun = {}), moon = out.moon || (out.moon = {});
sun.x = 0.72 + tod * 0.12; sun.y = 0.16 + smooth(0.1, 0.8, tod) * 0.72; sun.a = 1 - smooth(0.62, 0.8, tod);
moon.x = 0.24; moon.y = 0.62 - smooth(0.6, 1, tod) * 0.46; moon.a = smooth(0.62, 0.95, tod);
out.stars = smooth(0.7, 1, tod); out.fireflies = smooth(0.72, 1, tod); out.night = tod; out.lanterns = smooth(0.55, 0.85, tod);
return out;
}
const skyHex = lab => oklabToHex(lab[0], lab[1], lab[2]);
function skyAt(s, v) {
const t = Math.pow(Math.max(0, Math.min(1, v)), 1.15);
return oklabToHex(lerp(s.top[0], s.bottom[0], t), lerp(s.top[1], s.bottom[1], t), lerp(s.top[2], s.bottom[2], t));
}
return { SKY_KEYS, sky, skyAt, skyHex };
})();
const __m_paper = (function () {
const { BLEND_ADD } = __m_list;
const { MOON_GRADE } = __m_atlas;
const { skyAt } = __m_sky;
const { INK } = __m_tokens;
class Paper {
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
const key = pw + 'x' + ph + '|' + (F.tod > 0.5 ? 2 : F.tod > 0.25 ? 1 : 0) + (F.vignette > 0 ? 1 : 0);
if (key === this.vigKey && this.vig) return this.vig;
const w = Math.max(16, pw >> 2), h = Math.max(16, ph >> 2);
if (!this.vig) this.vig = this.atlas.canvas(w, h); else { this.vig.width = w; this.vig.height = h; }
const c = this.vig.getContext('2d');
c.clearRect(0, 0, w, h);
c.fillStyle = F.tod > 0.5 ? 'rgba(14,42,46,0.08)' : F.tod > 0.25 ? 'rgba(255,190,120,0.1)' : 'rgba(255,214,140,0.06)'; c.fillRect(0, 0, w, h);
if (F.vignette > 0) {
const g = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.6);
g.addColorStop(0, 'rgba(20,20,20,0)'); g.addColorStop(1, `rgba(20,20,20,${0.28 * F.vignette})`);
c.fillStyle = g; c.fillRect(0, 0, w, h);
}
this.vigKey = key; return this.vig;
}
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
_iris(F, pw, ph) {
const ctx = this.ctx, cx = F.irisX * pw, cy = F.irisY * ph, R = Math.hypot(pw, ph) * 1.25 * F.iris;
ctx.beginPath(); ctx.rect(0, 0, pw, ph);
if (R > 0.5) { const q = R * 0.207; ctx.moveTo(cx, cy - R); ctx.quadraticCurveTo(cx - q, cy - q, cx - R, cy); ctx.quadraticCurveTo(cx - q, cy + q, cx, cy + R); ctx.quadraticCurveTo(cx + q, cy + q, cx + R, cy); ctx.quadraticCurveTo(cx + q, cy - q, cx, cy - R); ctx.closePath(); }
ctx.fillStyle = INK; ctx.fill('evenodd');
}
dispose() {}
}
return { Paper };
})();
const __m_glaze = (function () {
const { BLEND_ADD } = __m_list;
const { rgbToOklab, oklabToRgb } = __m_color;
const HEAD = '#version 300 es\nprecision highp float;\nprecision mediump sampler3D;\n';
const FULL_VS = '#version 300 es\nvoid main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.0-1.0,0.0,1.0);}';
const SPRITE_VS = `#version 300 es
layout(location=0) in vec2 aQ;
layout(location=1) in vec4 iM;
layout(location=2) in vec4 iT;
layout(location=3) in vec4 iR;
layout(location=4) in vec4 iUV;
layout(location=5) in vec4 iC;
layout(location=6) in vec4 iF;
uniform vec2 uRes; uniform float uTime;
out vec2 vUV; out vec4 vC; out vec4 vF; out vec2 vCen; out float vR;
void main(){
  vec2 l = iR.xy + aQ * iR.zw;
  if (iT.z != 0.0) l.x += sin(uTime * 1.7 + iT.w * 0.013) * iT.z * 0.08 * l.y;
  vec2 p = vec2(iM.x * l.x + iM.z * l.y + iT.x, iM.y * l.x + iM.w * l.y + iT.y);
  vec2 lc = iR.xy + 0.5 * iR.zw;
  vCen = vec2(iM.x * lc.x + iM.z * lc.y + iT.x, iM.y * lc.x + iM.w * lc.y + iT.y);
  vR = 0.5 * length(iM.xy) * max(abs(iR.z), abs(iR.w));
  vUV = mix(iUV.xy, iUV.zw, aQ); vC = iC; vF = iF;
  gl_Position = vec4(p.x / uRes.x * 2.0 - 1.0, 1.0 - p.y / uRes.y * 2.0, 0.0, 1.0);
}`;
const SPRITE_FS = HEAD + `
uniform sampler2D uTex; uniform sampler2D uMask;
uniform vec3 uAmb; uniform int uNL; uniform vec4 uL[4]; uniform vec3 uLC[4];
uniform float uEmOut; uniform vec2 uRes; uniform float uScale; uniform vec2 uRimOff; uniform vec3 uRim;
in vec2 vUV; in vec4 vC; in vec4 vF; in vec2 vCen; in float vR;
layout(location=0) out vec4 oC; layout(location=1) out vec4 oE;
void main(){
  vec4 a = texture(uTex, vUV);
  if (a.a < 0.003) discard;
  vec3 mk = texture(uMask, vUV).rgb;
  float unlit = max(mk.g, step(vF.z, 0.0));   // lit > 0: takes the ambient; lit scales how much point light it takes
  vec2 fp = vec2(gl_FragCoord.x, uRes.y * uScale - gl_FragCoord.y) / uScale;
  vec3 light = mix(vec3(1.0), uAmb, vF.w);    // grade: scenery takes the whole night ambient, the cast about a quarter
  for (int i = 0; i < 4; i++) {
    if (i >= uNL) break;
    vec2 d = uL[i].xy - fp;
    float att = clamp(1.0 - length(d) / uL[i].z, 0.0, 1.0); att *= att;
    vec2 toL = normalize(uL[i].xy - vCen + vec2(0.001));
    float side = clamp(0.75 + 0.6 * dot((fp - vCen) / max(vR, 1.0), toL), 0.35, 1.4);
    light += uLC[i] * uL[i].w * att * side * vF.z;
  }
  float e = clamp(mk.r + vF.y, 0.0, 1.0);
  vec3 rgb = a.rgb * mix(min(light, vec3(1.3)), vec3(1.0), max(unlit, e));
  // a soft cool moonlight rim on the cast (grade < 1) at night: the edge facing the moon, inside the ink line
  float rimK = (1.0 - vF.w) * (1.0 - unlit);
  if (uRim.b > 0.001) { float nb = texture(uTex, vUV + uRimOff).a; rgb += uRim * rimK * a.a * clamp(a.a - nb, 0.0, 1.0); }
  rgb = mix(rgb, vec3(a.a), vF.x);
  rgb *= vC.rgb;
  oC = vec4(rgb, a.a) * vC.a;
  oE = vec4(a.rgb * vC.rgb * e * uEmOut, a.a) * vC.a;
}`;
const SKY_FS = HEAD + `
uniform vec3 uTop; uniform vec3 uBot; uniform vec2 uRes; uniform float uScale; uniform float uTime; uniform float uWisp; uniform float uFlat;
layout(location=0) out vec4 oC; layout(location=1) out vec4 oE;
vec3 lab2srgb(vec3 c){
  float l = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z, m = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z, s = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
  l = l * l * l; m = m * m * m; s = s * s * s;
  vec3 lin = max(vec3(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s), 0.0);
  return mix(12.92 * lin, 1.055 * pow(lin, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, lin));
}
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
void main(){
  float v = 1.0 - gl_FragCoord.y / (uRes.y * uScale);
  float t = uFlat > 0.5 ? 0.5 : pow(clamp(v, 0.0, 1.0), 1.15);
  vec3 c = lab2srgb(mix(uTop, uBot, t));
  vec2 q = gl_FragCoord.xy / (uRes * uScale);
  float n = vn(vec2(q.x * 5.0 + uTime * 0.012, q.y * 22.0)) * 0.6 + vn(vec2(q.x * 11.0 - uTime * 0.02, q.y * 40.0)) * 0.4;
  c = mix(c, vec3(1.0), uWisp * smoothstep(0.62, 0.9, n) * (1.0 - v) * 0.22);
  c += (h21(gl_FragCoord.xy) - 0.5) / 255.0;
  oC = vec4(c, 1.0); oE = vec4(0.0);
}`;
const POST_FS = HEAD + `
uniform sampler2D uScene; uniform sampler2D uBloom; uniform sampler3D uLut;
uniform float uBloomK; uniform float uVig; uniform float uFlash; uniform vec3 uFlashC; uniform vec4 uIris; uniform vec2 uOut;
out vec4 o;
void main(){
  vec2 uv = gl_FragCoord.xy / uOut;
  // bloom is tone-mapped (b / (1 + b)) so a bright lantern glows instead of blowing out to white
  vec3 b = texture(uBloom, uv).rgb * uBloomK;
  vec3 c = texture(uScene, uv).rgb + b / (1.0 + b) * 0.85;
  c = texture(uLut, clamp(c, 0.0, 1.0) * (15.0 / 16.0) + 0.5 / 16.0).rgb;
  vec2 q = uv - 0.5; q.x *= uOut.x / uOut.y;
  c *= 1.0 - uVig * 0.28 * smoothstep(0.32, 0.95, length(q));
  c = mix(c, uFlashC, uFlash);
  if (uIris.w < 1.5) {
    vec2 p = vec2(gl_FragCoord.x, uOut.y - gl_FragCoord.y) - uIris.xy;
    float R = max(uIris.z, 0.001);
    float f = pow(abs(p.x) / R, 0.6667) + pow(abs(p.y) / R, 0.6667);
    float e = fwidth(f) * 1.5;
    float inside = uIris.z < 0.5 ? 0.0 : 1.0 - smoothstep(1.0 - e, 1.0 + e, f);
    c = mix(vec3(0.0784), c, inside);
  }
  o = vec4(c, 1.0);
}`;
const DOWN_FS = HEAD + `uniform sampler2D uSrc; uniform vec2 uHalf; uniform vec2 uDst; out vec4 o;
void main(){ vec2 uv = gl_FragCoord.xy / uDst;
  o = (texture(uSrc, uv) * 4.0 + texture(uSrc, uv - uHalf) + texture(uSrc, uv + uHalf) + texture(uSrc, uv + vec2(uHalf.x, -uHalf.y)) + texture(uSrc, uv - vec2(uHalf.x, -uHalf.y))) / 8.0; }`;
const UP_FS = HEAD + `uniform sampler2D uSrc; uniform vec2 uHalf; uniform vec2 uDst; out vec4 o;
void main(){ vec2 uv = gl_FragCoord.xy / uDst; vec2 h = uHalf;
  vec4 s = texture(uSrc, uv + vec2(-h.x * 2.0, 0.0)) + texture(uSrc, uv + vec2(-h.x, h.y)) * 2.0 + texture(uSrc, uv + vec2(0.0, h.y * 2.0)) + texture(uSrc, uv + vec2(h.x, h.y)) * 2.0
    + texture(uSrc, uv + vec2(h.x * 2.0, 0.0)) + texture(uSrc, uv + vec2(h.x, -h.y)) * 2.0 + texture(uSrc, uv + vec2(0.0, -h.y * 2.0)) + texture(uSrc, uv + vec2(-h.x, -h.y)) * 2.0;
  o = s / 12.0; }`;
const STRIDE = 24;
function makeLut(tod, size = 16) {
const out = new Uint8Array(size * size * size * 4);
let i = 0;
for (let b = 0; b < size; b++) for (let g = 0; g < size; g++) for (let r = 0; r < size; r++) {
const R = (r / (size - 1)) * 255, G = (g / (size - 1)) * 255, B = (b / (size - 1)) * 255;
let [L, A, Bb] = rgbToOklab(R, G, B);
const d = [0.6 + (L - 0.6) * 1.04, A * 1.06 + 0.003, Bb * 1.06 + 0.007];
const n = [L * 0.98, A * 0.86 - 0.012 * (1 - L), Bb * 0.86 - 0.008 * (1 - L)];
L = d[0] + (n[0] - d[0]) * tod; A = d[1] + (n[1] - d[1]) * tod; Bb = d[2] + (n[2] - d[2]) * tod;
const c = oklabToRgb(L, A, Bb);
out[i++] = Math.max(0, Math.min(255, Math.round(c[0]))); out[i++] = Math.max(0, Math.min(255, Math.round(c[1]))); out[i++] = Math.max(0, Math.min(255, Math.round(c[2]))); out[i++] = 255;
}
return out;
}
class Glaze {
constructor(canvas, atlas, { force = false } = {}) {
this.canvas = canvas; this.atlas = atlas; this.name = 'glaze';
const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: true, depth: false, stencil: false, preserveDrawingBuffer: false, failIfMajorPerformanceCaveat: !force });
if (!gl) throw new Error('no webgl2');
this.gl = gl;
this.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
this.pSprite = this._prog(SPRITE_VS, SPRITE_FS); this.pSky = this._prog(FULL_VS, SKY_FS); this.pPost = this._prog(FULL_VS, POST_FS);
this.pDown = this._prog(FULL_VS, DOWN_FS); this.pUp = this._prog(FULL_VS, UP_FS);
this.u = new Map();
this.quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
this.cap = 4096; this.data = new Float32Array(this.cap * STRIDE);
this.inst = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.inst); gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao);
gl.bindBuffer(gl.ARRAY_BUFFER, this.quad); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
gl.bindBuffer(gl.ARRAY_BUFFER, this.inst);
for (let k = 1; k <= 6; k++) { gl.enableVertexAttribArray(k); gl.vertexAttribDivisor(k, 1); }
this._pointers(0);
this.emptyVao = gl.createVertexArray();
gl.bindVertexArray(null);
this.zero = this._tex(1, 1, new Uint8Array(4));
this.texs = []; this.runs = new Int32Array(4 * 512); this.m = new Float32Array(6);
this.fb = null; this.fbW = 0; this.fbH = 0; this.mrt = false;
this.lut = gl.createTexture(); this.lutKey = -1;
this.bufs1 = [gl.COLOR_ATTACHMENT0]; this.bufs2 = [gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1];
this.draws = 0; this.lightU = new Float32Array(16); this.lightC = new Float32Array(12);
this.uploads = { full: 0, sub: 0, px: 0 }; this.freedSeen = -1; this.up = null;
}
_shader(type, src) {
const gl = this.gl, s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error('shader: ' + gl.getShaderInfoLog(s));
return s;
}
_prog(vs, fs) {
const gl = this.gl, p = gl.createProgram();
gl.attachShader(p, this._shader(gl.VERTEX_SHADER, vs)); gl.attachShader(p, this._shader(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error('link: ' + gl.getProgramInfoLog(p));
return p;
}
_loc(p, name) { let m = this.u.get(p); if (!m) { m = {}; this.u.set(p, m); } if (!(name in m)) m[name] = this.gl.getUniformLocation(p, name); return m[name]; }
_pointers(start) {
const gl = this.gl, B = STRIDE * 4, base = start * B;
for (let k = 0; k < 6; k++) gl.vertexAttribPointer(k + 1, 4, gl.FLOAT, false, B, base + k * 16);
}
_tex(w, h, data, filter) {
const gl = this.gl, t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter || gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter || gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data || null);
return t;
}
_upload(t, key, canvas, rect, full) {
const gl = this.gl, W = canvas.width, H = canvas.height;
if (!t[key] || t[key + 'W'] !== W || t[key + 'H'] !== H) {
if (t[key]) gl.deleteTexture(t[key]);
const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, Math.max(1, W), Math.max(1, H));
t[key] = tex; t[key + 'W'] = W; t[key + 'H'] = H; full = true;
} else gl.bindTexture(gl.TEXTURE_2D, t[key]);
if (!full && rect) {
const x0 = Math.max(0, Math.floor(rect[0])), y0 = Math.max(0, Math.floor(rect[1])), x1 = Math.min(W, Math.ceil(rect[2])), y1 = Math.min(H, Math.ceil(rect[3]));
const w = x1 - x0, h = y1 - y0; if (w <= 0 || h <= 0) return;
if (w * h < W * H * 0.4) {
let up = this.up; if (!up) up = this.up = this.canvas.ownerDocument.createElement('canvas');
if (up.width !== w || up.height !== h) { up.width = w; up.height = h; } else up.getContext('2d').clearRect(0, 0, w, h);
up.getContext('2d').drawImage(canvas, x0, y0, w, h, 0, 0, w, h);
gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, y0, gl.RGBA, gl.UNSIGNED_BYTE, up);
this.uploads.sub++; this.uploads.px += w * h; return;
}
}
gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
this.uploads.full++; this.uploads.px += W * H;
}
_sync(pageId) {
const gl = this.gl, p = this.atlas.pages[pageId];
let t = this.texs[pageId];
if (t && t.uid !== p.uid) { this._freeTex(t); t = null; }
if (!t) t = this.texs[pageId] = { uid: p.uid, ver: -1, mver: -1 };
gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
if (t.ver !== p.version) { this._upload(t, 'tex', p.canvas, p.dr, p.full || t.ver < 0); p.dr = null; p.full = false; t.ver = p.version; }
if (p.mask && t.mver !== p.maskVersion) { this._upload(t, 'mask', p.mask, p.mdr, p.mfull || t.mver < 0); p.mdr = null; p.mfull = false; t.mver = p.maskVersion; }
gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
return t;
}
_freeTex(t) { const gl = this.gl; if (t.tex) gl.deleteTexture(t.tex); if (t.mask) gl.deleteTexture(t.mask); t.tex = t.mask = null; }
_gc() {
if (this.freedSeen === this.atlas.freed) return;
this.freedSeen = this.atlas.freed;
this.texs.forEach((t, i) => { const p = this.atlas.pages[i]; if (t && (!p || p.dead || p.uid !== t.uid)) { this._freeTex(t); this.texs[i] = null; } });
}
resize(pw, ph) { if (this.canvas.width !== pw || this.canvas.height !== ph) { this.canvas.width = pw; this.canvas.height = ph; } }
_targets(w, h, bloom) {
const gl = this.gl;
if (this.fb && this.fbW === w && this.fbH === h && this.mrt === bloom) return;
this._freeTargets();
this.fbW = w; this.fbH = h; this.mrt = bloom;
this.sceneTex = this._tex(w, h); this.fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.sceneTex, 0);
if (bloom) {
this.emTex = this._tex(w, h); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this.emTex, 0);
const mk = (tw, th) => { const t = this._tex(Math.max(1, tw), Math.max(1, th)); const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); return { t, f, w: Math.max(1, tw), h: Math.max(1, th) }; };
this.half = mk(w >> 1, h >> 1); this.quarter = mk(w >> 2, h >> 2); this.halfUp = mk(w >> 1, h >> 1);
}
gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}
_freeTargets() {
const gl = this.gl;
for (const t of [this.sceneTex, this.emTex]) if (t) gl.deleteTexture(t);
if (this.fb) gl.deleteFramebuffer(this.fb);
for (const x of [this.half, this.quarter, this.halfUp]) if (x) { gl.deleteTexture(x.t); gl.deleteFramebuffer(x.f); }
this.fb = this.sceneTex = this.emTex = this.half = this.quarter = this.halfUp = null;
}
_lut(tod) {
const key = Math.round(tod * 15);
if (key === this.lutKey) return;
const gl = this.gl; gl.bindTexture(gl.TEXTURE_3D, this.lut);
gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
for (const w of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, w, gl.CLAMP_TO_EDGE);
gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, 16, 16, 16, 0, gl.RGBA, gl.UNSIGNED_BYTE, makeLut(key / 15));
this.lutKey = key;
}
_full(prog, w, h, fb) { const gl = this.gl; gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.viewport(0, 0, w, h); gl.useProgram(prog); gl.bindVertexArray(this.emptyVao); gl.drawArrays(gl.TRIANGLES, 0, 3); this.draws++; }
draw(L, F) {
const gl = this.gl; if (!gl || gl.isContextLost()) return;
const A = this.atlas, V = F.view, pw = this.canvas.width, ph = this.canvas.height, r = F.renderScale || 1;
const W = Math.max(1, Math.round(pw * r)), H = Math.max(1, Math.round(ph * r));
const bloom = !!F.bloom;
this._targets(W, H, bloom); this._gc();
this.draws = 0;
gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb); gl.viewport(0, 0, W, H);
gl.drawBuffers(bloom ? this.bufs2 : this.bufs1);
gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
const sp = this.pSky; gl.useProgram(sp);
gl.uniform3fv(this._loc(sp, 'uTop'), F.sky.top); gl.uniform3fv(this._loc(sp, 'uBot'), F.sky.bottom);
gl.uniform2f(this._loc(sp, 'uRes'), pw, ph); gl.uniform1f(this._loc(sp, 'uScale'), r); gl.uniform1f(this._loc(sp, 'uTime'), F.time);
gl.uniform1f(this._loc(sp, 'uWisp'), F.contrast ? 0 : 1 - F.tod * 0.7); gl.uniform1f(this._loc(sp, 'uFlat'), F.contrast ? 1 : 0);
gl.bindVertexArray(this.emptyVao); gl.drawArrays(gl.TRIANGLES, 0, 3); this.draws++;
const idx = L.order(), n = L.n, m = this.m;
if (n > this.cap) { while (this.cap < n) this.cap *= 2; this.data = new Float32Array(this.cap * STRIDE); gl.bindBuffer(gl.ARRAY_BUFFER, this.inst); gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW); }
const D = this.data; let c = 0, runs = 0, rp = -1, rb = -1;
for (let o = 0; o < n; o++) {
const i = idx[o]; const e = A.entries[L.e[i]];
if (!e || !e.alive || L.alpha[i] <= 0.003) continue;
V.matrix(L, i, m);
let w = L.w[i]; const h = L.h[i];
if (w < 0) { w = -w; m[0] = -m[0]; m[1] = -m[1]; }
const pg = A.pages[e.page], P = pg.canvas;
const b = L.blend[i];
if (e.page !== rp || b !== rb) {
if (runs * 4 + 4 > this.runs.length) { const nr = new Int32Array(this.runs.length * 2); nr.set(this.runs); this.runs = nr; }
this.runs[runs * 4] = c; this.runs[runs * 4 + 1] = 0; this.runs[runs * 4 + 2] = e.page; this.runs[runs * 4 + 3] = b; runs++; rp = e.page; rb = b;
}
this.runs[(runs - 1) * 4 + 1]++;
const k = c * STRIDE;
D[k] = m[0]; D[k + 1] = m[1]; D[k + 2] = m[2]; D[k + 3] = m[3];
D[k + 4] = m[4]; D[k + 5] = m[5]; D[k + 6] = L.wind[i]; D[k + 7] = L.x[i];
D[k + 8] = -L.ax[i] * w; D[k + 9] = -L.ay[i] * h; D[k + 10] = w; D[k + 11] = h;
D[k + 12] = e.x / P.width; D[k + 13] = e.y / P.height; D[k + 14] = (e.x + e.w) / P.width; D[k + 15] = (e.y + e.h) / P.height;
D[k + 16] = L.tr[i]; D[k + 17] = L.tg[i]; D[k + 18] = L.tb[i]; D[k + 19] = L.alpha[i];
D[k + 20] = L.flash[i]; D[k + 21] = L.emis[i]; D[k + 22] = L.lit[i]; D[k + 23] = L.grade[i];
c++;
}
gl.bindBuffer(gl.ARRAY_BUFFER, this.inst); gl.bufferSubData(gl.ARRAY_BUFFER, 0, D, 0, c * STRIDE);
const p = this.pSprite; gl.useProgram(p);
gl.uniform2f(this._loc(p, 'uRes'), pw, ph); gl.uniform1f(this._loc(p, 'uScale'), r); gl.uniform1f(this._loc(p, 'uTime'), F.time);
gl.uniform3fv(this._loc(p, 'uAmb'), F.ambient); gl.uniform1f(this._loc(p, 'uEmOut'), 0.35 + 0.65 * F.tod);
const rk = 0.42 * Math.max(0, Math.min(1, (F.tod - 0.55) / 0.35)); gl.uniform3f(this._loc(p, 'uRim'), 0.62 * rk, 0.78 * rk, 1.0 * rk);
let nl = 0;
for (const l of F.lights) {
if (nl >= F.maxLights || !l.on || l.intensity <= 0.01) continue;
const s = V.scale, z = V.zoom, lx = V.offX + (V.vw / 2 + (l.x - V.camX) * z + V.shakeX) * s, ly = V.offY + (V.vh / 2 + (l.y - V.camY) * z + V.shakeY) * s, lr = l.radius * s * z;
if (lx < -lr || ly < -lr || lx > pw + lr || ly > ph + lr) continue;
this.lightU[nl * 4] = lx; this.lightU[nl * 4 + 1] = ly; this.lightU[nl * 4 + 2] = lr; this.lightU[nl * 4 + 3] = l.intensity * F.lightK;
this.lightC[nl * 3] = l.r; this.lightC[nl * 3 + 1] = l.g; this.lightC[nl * 3 + 2] = l.b; nl++;
}
gl.uniform1i(this._loc(p, 'uNL'), nl); gl.uniform4fv(this._loc(p, 'uL'), this.lightU); gl.uniform3fv(this._loc(p, 'uLC'), this.lightC);
gl.uniform1i(this._loc(p, 'uTex'), 0); gl.uniform1i(this._loc(p, 'uMask'), 1);
gl.enable(gl.BLEND); gl.bindVertexArray(this.vao);
for (let ri = 0; ri < runs; ri++) {
const start = this.runs[ri * 4], count = this.runs[ri * 4 + 1], page = this.runs[ri * 4 + 2], blend = this.runs[ri * 4 + 3];
const t = this._sync(page);
const P = A.pages[page].canvas; gl.uniform2f(this._loc(p, 'uRimOff'), -9 / P.width, -9 / P.height);
gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t.tex);
gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, t.mask || this.zero);
gl.useProgram(p); gl.bindVertexArray(this.vao);
if (blend === BLEND_ADD) gl.blendFunc(gl.ONE, gl.ONE); else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
gl.bindBuffer(gl.ARRAY_BUFFER, this.inst); this._pointers(start);
gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count); this.draws++;
}
gl.activeTexture(gl.TEXTURE0);
gl.disable(gl.BLEND); gl.bindVertexArray(null);
if (bloom) {
const pass = (prog, src, sw, sh, dst) => {
gl.useProgram(prog); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src);
gl.uniform1i(this._loc(prog, 'uSrc'), 0); gl.uniform2f(this._loc(prog, 'uHalf'), 0.5 / sw, 0.5 / sh); gl.uniform2f(this._loc(prog, 'uDst'), dst.w, dst.h);
this._full(prog, dst.w, dst.h, dst.f);
};
pass(this.pDown, this.emTex, W, H, this.half); pass(this.pDown, this.half.t, this.half.w, this.half.h, this.quarter); pass(this.pUp, this.quarter.t, this.quarter.w, this.quarter.h, this.halfUp);
}
this._lut(F.tod);
const q = this.pPost; gl.useProgram(q);
gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.sceneTex); gl.uniform1i(this._loc(q, 'uScene'), 0);
gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, bloom ? this.halfUp.t : this.zero); gl.uniform1i(this._loc(q, 'uBloom'), 1);
gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_3D, this.lut); gl.uniform1i(this._loc(q, 'uLut'), 2);
gl.uniform1f(this._loc(q, 'uBloomK'), bloom ? 1.6 : 0); gl.uniform1f(this._loc(q, 'uVig'), F.vignette);
gl.uniform1f(this._loc(q, 'uFlash'), F.flash); const fc = F.flashRgb; gl.uniform3f(this._loc(q, 'uFlashC'), fc[0], fc[1], fc[2]);
gl.uniform4f(this._loc(q, 'uIris'), F.irisX * pw, F.irisY * ph, Math.hypot(pw, ph) * 1.25 * F.iris, F.iris);
gl.uniform2f(this._loc(q, 'uOut'), pw, ph);
this._full(q, pw, ph, null);
gl.activeTexture(gl.TEXTURE0);
}
dispose() {
const gl = this.gl; if (!gl) return;
if (!gl.isContextLost()) {
this._freeTargets();
for (const t of this.texs) if (t) this._freeTex(t);
for (const pr of [this.pSprite, this.pSky, this.pPost, this.pDown, this.pUp]) if (pr) gl.deleteProgram(pr);
for (const b of [this.quad, this.inst]) if (b) gl.deleteBuffer(b);
for (const v of [this.vao, this.emptyVao]) if (v) gl.deleteVertexArray(v);
for (const t of [this.zero, this.lut]) if (t) gl.deleteTexture(t);
}
this.texs = []; this.disposed = true;
try { const ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); } catch (e) {  }
this.gl = null;
try { this.canvas.width = this.canvas.height = 1; } catch (e) {  }
}
}
return { Glaze, makeLut };
})();
const __m_governor = (function () {
const TIERS = ['low', 'mid', 'high'];
const TIER_SPEC = {
low: { backend: 'paper', dpr: 1.25, particles: 120, bands: 2, lights: 0, bloom: false, fireflies: 12, page: 1024 },
mid: { backend: 'glaze', dpr: 1.5, particles: 300, bands: 3, lights: 2, bloom: false, fireflies: 16, page: 2048 },
high: { backend: 'glaze', dpr: 2, particles: 600, bands: 4, lights: 4, bloom: true, fireflies: 20, page: 2048 },
};
const SOFTWARE_GL = /SwiftShader|llvmpipe|softpipe|Software|Basic Render|Microsoft Basic/i;
function probeGL(makeCanvas) {
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
try { const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext(); } catch (e) {  }
return out;
}
function pickBackend({ override = 'auto', probe = null, graphics = 'auto' } = {}) {
if (override === 'paper' || override === 'glaze') return override;
if (graphics === 'simple') return 'paper';
return probe && probe.webgl2 && !probe.software ? 'glaze' : 'paper';
}
function pickTier({ backend, override = '', graphics = 'auto' } = {}) {
if (TIERS.includes(override)) return backend === 'paper' ? 'low' : override === 'low' ? 'mid' : override;
if (backend === 'paper') return 'low';
return graphics === 'fancy' ? 'high' : 'mid';
}
class Governor {
constructor({ tier = 'mid', locked = false } = {}) {
this.tier = tier; this.backend = TIER_SPEC[tier].backend;
this.scale = 1; this.dprCap = TIER_SPEC[tier].dpr; this.particleK = 1; this.bloom = TIER_SPEC[tier].bloom; this.lights = TIER_SPEC[tier].lights;
this.pending = null;
this.win = new Float32Array(90); this.wi = 0; this.wn = 0; this.tmp = new Float32Array(90);
this.over = -1; this.under = -1; this.upThisScene = false;
this.losses = []; this.glLocked = locked; this.log = []; this.devDpr = 1;
}
get spec() { return TIER_SPEC[this.tier]; }
p90() {
const n = this.wn; if (!n) return 0;
const t = this.tmp; for (let i = 0; i < n; i++) t[i] = this.win[i];
const a = t.subarray(0, n); a.sort();
return a[Math.min(n - 1, Math.floor(0.9 * n))];
}
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
if (this.backend === 'paper' && Math.min(this.devDpr, this.dprCap) > 1 + 1e-6) { this.dprCap = Math.max(1, Math.round((Math.min(this.devDpr, this.dprCap) - 0.25) * 100) / 100); this.log.push('dpr ' + this.dprCap); return true; }
if (this.particleK > 0.5 || this.bloom) { this.particleK = 0.5; this.bloom = false; this.log.push('particles/bloom'); return true; }
if (this.lights > 0) { this.lights = 0; this.log.push('lights off'); return true; }
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
request(tier, now = false) {
if (!TIERS.includes(tier)) return;
if (tier !== 'low' && this.glLocked) tier = 'low';
this.pending = tier === this.tier ? null : tier;
if (now) this.transition();
}
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
contextLost(now) {
this.losses.push(now); this.losses = this.losses.filter(t => now - t <= 60000);
if (this.losses.length >= 2) this.glLocked = true;
this.wasTier = this.tier === 'low' ? this.wasTier : this.tier;
this.pending = 'low'; this.transition();
}
contextRestored() { if (!this.glLocked && this.wasTier) this.pending = this.wasTier; }
}
return { Governor, SOFTWARE_GL, TIERS, TIER_SPEC, pickBackend, pickTier, probeGL };
})();
const __m_fit = (function () {
function computeFit(cw, ch, size, fit = 'expand', dpr = 1) {
cw = Math.max(1, cw); ch = Math.max(1, ch);
const W = size[0], H = size[1];
const k = Math.min(cw / W, ch / H);
let vw, vh, offX = 0, offY = 0;
if (fit === 'letterbox') { vw = W; vh = H; offX = (cw - W * k) / 2; offY = (ch - H * k) / 2; }
else { vw = cw / k; vh = ch / k; }
return { k, vw, vh, offX, offY, dpr, pw: Math.max(1, Math.round(cw * dpr)), ph: Math.max(1, Math.round(ch * dpr)) };
}
function fitCanvas(win, canvas, o = {}) {
const size = o.size || [960, 540], cap = o.dprCap || 2;
const res = { scale: 1, offsetX: 0, offsetY: 0, dpr: 1, vw: size[0], vh: size[1], off: null, onResize: o.onResize || null };
const apply = () => {
const parent = canvas.parentElement;
const cw = parent && parent !== win.document.body ? parent.clientWidth : win.innerWidth, ch = parent && parent !== win.document.body ? parent.clientHeight : win.innerHeight;
const dpr = Math.min(win.devicePixelRatio || 1, cap);
const f = computeFit(cw, ch, size, o.fit, dpr);
canvas.width = f.pw; canvas.height = f.ph; canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
res.scale = f.k * dpr; res.offsetX = f.offX * dpr; res.offsetY = f.offY * dpr; res.dpr = dpr; res.vw = f.vw; res.vh = f.vh;
if (res.onResize) res.onResize(res);
};
apply();
win.addEventListener('resize', apply);
res.off = () => win.removeEventListener('resize', apply);
return res;
}
return { computeFit, fitCanvas };
})();
const __m_grammar = (function () {
const { outline, rimWidth, INK, CREAM } = __m_tokens;
const { EMIT, UNLIT } = __m_atlas;
function lines(k) {
const w = outline(k.px) / k.s;
return { w, inner: w * 0.6, rim: rimWidth(outline(k.px)) / k.s };
}
function sparkPath(x, y, r, pinch = 0.18) {
const p = new Path2D(), q = r * pinch;
p.moveTo(x, y - r);
p.quadraticCurveTo(x + q, y - q, x + r, y);
p.quadraticCurveTo(x + q, y + q, x, y + r);
p.quadraticCurveTo(x - q, y + q, x - r, y);
p.quadraticCurveTo(x - q, y - q, x, y - r);
p.closePath();
return p;
}
function ellipsePath(x, y, rx, ry, rot = 0) { const p = new Path2D(); p.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); return p; }
function rrectPath(x, y, w, h, r) {
const p = new Path2D(); r = Math.min(r, w / 2, h / 2);
p.moveTo(x + r, y); p.arcTo(x + w, y, x + w, y + h, r); p.arcTo(x + w, y + h, x, y + h, r); p.arcTo(x, y + h, x, y, r); p.arcTo(x, y, x + w, y, r); p.closePath();
return p;
}
function sticker(ctx, k, path, o = {}) {
const L = lines(k), lw = o.line != null ? o.line * L.w : L.w;
ctx.lineJoin = 'round'; ctx.lineCap = 'round';
if (o.rim !== false) { ctx.strokeStyle = CREAM; ctx.lineWidth = lw + 2 * L.rim; ctx.stroke(path); }
ctx.fillStyle = o.shade || o.fill; ctx.fill(path);
if (o.shade) {
ctx.save(); ctx.clip(path);
const d = o.shadeOff != null ? o.shadeOff : 6;
ctx.translate(-d * 0.55, -d); ctx.fillStyle = o.fill; ctx.fill(path);
ctx.restore();
}
if (o.gloss) {
const g = o.gloss; ctx.save(); ctx.clip(path); ctx.fillStyle = 'rgba(255,255,255,0.55)';
ctx.beginPath(); ctx.ellipse(g[0], g[1], g[2], g[3], g[4] || -0.6, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}
if (o.ink !== false) { ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.stroke(path); }
if (k.mask) {
const m = k.mask();
if (o.emissive) { m.fillStyle = EMIT; m.fill(path); }
if (o.unlit) { m.fillStyle = UNLIT; m.fill(path); }
m.strokeStyle = UNLIT; m.lineWidth = (o.rim !== false ? lw + 2 * L.rim : lw); m.lineJoin = 'round'; m.stroke(path);
}
}
function detail(ctx, k, path, width = 1) {
const L = lines(k);
ctx.strokeStyle = INK; ctx.lineWidth = L.inner * width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(path);
if (k.mask) { const m = k.mask(); m.strokeStyle = UNLIT; m.lineWidth = L.inner * width; m.lineCap = 'round'; m.stroke(path); }
}
function ringEye(ctx, k, x, y, d, ring = 0.22) {
const sw = Math.max(d * ring, lines(k).inner * 1.4), r = d / 2 - sw / 2;
const p = new Path2D(); p.arc(x, y, r, 0, Math.PI * 2);
ctx.fillStyle = CREAM; ctx.fill(p);
ctx.strokeStyle = INK; ctx.lineWidth = sw; ctx.stroke(p);
if (k.mask) { const m = k.mask(); m.fillStyle = UNLIT; m.fill(p); m.strokeStyle = UNLIT; m.lineWidth = sw; m.stroke(p); }
}
function glowMask(k, path) { if (k.mask) { const m = k.mask(); m.fillStyle = EMIT; m.fill(path); } }
return { detail, ellipsePath, glowMask, lines, ringEye, rrectPath, sparkPath, sticker };
})();
const __m_art = (function () {
const { PALETTE, INK, CREAM } = __m_tokens;
const { sticker, detail, ringEye, sparkPath, ellipsePath, rrectPath, glowMask, lines } = __m_grammar;
const { EMIT, UNLIT } = __m_atlas;
const P = PALETTE;
const TAU = Math.PI * 2;
function defineCoreArt(atlas) {
const def = (name, w, h, draw, ax = 0.5, ay = 0.5) => atlas.define(name, { w, h, ax, ay, draw });
def('dot', 20, 20, ctx => { ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(10, 10, 9, 0, TAU); ctx.fill(); });
def('puff', 40, 40, ctx => {
ctx.fillStyle = '#FFFFFF';
for (const [x, y, r] of [[20, 22, 13], [11, 24, 8], [29, 24, 8], [16, 15, 8], [25, 15, 7]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
});
def('chip', 20, 20, ctx => { ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(4, 6); ctx.lineTo(15, 3); ctx.lineTo(17, 15); ctx.lineTo(7, 17); ctx.closePath(); ctx.fill(); ctx.stroke(); });
def('confetti', 20, 12, ctx => { ctx.fillStyle = '#FFFFFF'; ctx.fill(rrectPath(1, 1, 18, 10, 3)); });
def('twinkle', 40, 40, (ctx, k) => { const p = sparkPath(20, 20, 19, 0.12); ctx.fillStyle = '#FFFFFF'; ctx.fill(p); glowMask(k, p); });
def('glow', 64, 64, (ctx, k) => {
const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.55)'); g.addColorStop(0.6, 'rgba(255,255,255,0.14)'); g.addColorStop(1, 'rgba(255,255,255,0)');
ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
const m = k.mask(); m.fillStyle = EMIT; m.fillRect(0, 0, 64, 64);
});
def('shadow', 100, 26, ctx => { ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(50, 13, 49, 12, 0, 0, TAU); ctx.fill(); });
def('spark', 60, 60, (ctx, k) => {
const p = sparkPath(30, 30, 24, 0.2);
sticker(ctx, k, p, { fill: P.spark[2], shade: P.spark[3], shadeOff: 5, gloss: [24, 22, 4, 7, -0.7], unlit: true });
const core = sparkPath(30, 30, 9, 0.2); ctx.fillStyle = P.spark[0]; ctx.fill(core); glowMask(k, core);
});
def('heart', 60, 56, (ctx, k) => {
const p = new Path2D(); p.moveTo(30, 50); p.bezierCurveTo(6, 36, 4, 20, 12, 12); p.bezierCurveTo(20, 4, 28, 8, 30, 16); p.bezierCurveTo(32, 8, 40, 4, 48, 12); p.bezierCurveTo(56, 20, 54, 36, 30, 50); p.closePath();
sticker(ctx, k, p, { fill: P.coral[2], shade: P.coral[3], shadeOff: 5, gloss: [18, 18, 5, 4, -0.6] });
});
def('star', 16, 16, (ctx, k) => { const p = sparkPath(8, 8, 7, 0.16); ctx.fillStyle = '#FFF7D6'; ctx.fill(p); glowMask(k, p); });
def('sun', 100, 100, (ctx, k) => {
const g = ctx.createRadialGradient(50, 50, 18, 50, 50, 50);
g.addColorStop(0, 'rgba(255,240,170,0.9)'); g.addColorStop(1, 'rgba(255,226,122,0)');
ctx.fillStyle = g; ctx.fillRect(0, 0, 100, 100);
const d = ellipsePath(50, 50, 22, 22); ctx.fillStyle = '#FFF3C4'; ctx.fill(d); glowMask(k, d);
});
def('moon', 80, 80, (ctx, k) => {
const g = ctx.createRadialGradient(40, 40, 14, 40, 40, 40);
g.addColorStop(0, 'rgba(220,240,255,0.35)'); g.addColorStop(1, 'rgba(220,240,255,0)');
ctx.fillStyle = g; ctx.fillRect(0, 0, 80, 80);
const m = new Path2D(); m.arc(40, 40, 17, 0, TAU);
ctx.fillStyle = CREAM; ctx.fill(m);
ctx.save(); ctx.clip(m); ctx.fillStyle = '#E6E0C8'; ctx.beginPath(); ctx.arc(47, 35, 4, 0, TAU); ctx.arc(34, 47, 3, 0, TAU); ctx.fill(); ctx.restore();
glowMask(k, m);
});
def('cloud', 160, 70, (ctx, k) => {
const p = new Path2D();
p.moveTo(30, 58); p.arc(30, 44, 14, Math.PI / 2, Math.PI * 1.5); p.arc(58, 32, 22, Math.PI, Math.PI * 1.75); p.arc(96, 28, 24, Math.PI * 1.2, Math.PI * 1.95);
p.arc(130, 42, 16, Math.PI * 1.5, Math.PI / 2); p.closePath();
sticker(ctx, k, p, { fill: CREAM, shade: '#ECE8DF', shadeOff: 7, rim: false, line: 0.7, gloss: null });
});
def('lantern', 40, 120, (ctx, k) => {
const post = rrectPath(17, 40, 6, 78, 3); sticker(ctx, k, post, { fill: P.cocoa[2], shade: P.cocoa[3], shadeOff: 3, rim: true });
const arm = new Path2D(); arm.moveTo(20, 42); arm.quadraticCurveTo(20, 18, 32, 18); detail(ctx, k, arm, 1.4);
const glass = rrectPath(8, 18, 24, 26, 8); sticker(ctx, k, glass, { fill: '#FFE7A3', shade: P.spark[2], shadeOff: 3, gloss: [14, 25, 3, 5, -0.3] }); glowMask(k, glass);
const core = ellipsePath(20, 32, 5.5, 7); ctx.fillStyle = '#FFF4D2'; ctx.fill(core);
const cap = new Path2D(); cap.moveTo(5, 19); cap.quadraticCurveTo(20, 4, 35, 19); cap.closePath(); sticker(ctx, k, cap, { fill: P.cocoa[3], rim: false });
}, 0.5, 1);
def('missing', 60, 60, (ctx, k) => {
sticker(ctx, k, rrectPath(6, 6, 48, 48, 12), { fill: P.stone[0], shade: P.stone[1], shadeOff: 4 });
const q = new Path2D(); q.moveTo(22, 24); q.bezierCurveTo(22, 12, 40, 12, 39, 24); q.bezierCurveTo(38, 31, 30, 30, 30, 38); detail(ctx, k, q, 2.4);
const d = ellipsePath(30, 46, 2.6, 2.6); ctx.fillStyle = INK; ctx.fill(d);
});
def('flower', 30, 40, (ctx, k) => {
const stem = new Path2D(); stem.moveTo(15, 39); stem.quadraticCurveTo(13, 26, 15, 16); detail(ctx, k, stem, 1.2);
for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU - Math.PI / 2; const p = ellipsePath(15 + Math.cos(a) * 6, 13 + Math.sin(a) * 6, 5, 5); sticker(ctx, k, p, { fill: k.v === 'b' ? P.grape[1] : P.coral[1], rim: false, line: 0.6 }); }
const c = ellipsePath(15, 13, 4, 4); sticker(ctx, k, c, { fill: P.spark[2], rim: false, line: 0.6 });
}, 0.5, 1);
defineOomba(atlas);
}
const OOMBA = { w: 100, h: 124, eyes: [[37, 70], [63, 70]], eyeD: 26, pupilD: 8 };
function oombaBody() {
const p = new Path2D();
p.moveTo(50, 42); p.bezierCurveTo(79, 42, 90, 66, 89, 88); p.bezierCurveTo(88, 108, 72, 117, 50, 117); p.bezierCurveTo(28, 117, 12, 108, 11, 88); p.bezierCurveTo(10, 66, 21, 42, 50, 42); p.closePath();
return p;
}
function defineOomba(atlas) {
atlas.define('oomba', { w: OOMBA.w, h: OOMBA.h, ax: 0.5, ay: 1, draw(ctx, k) {
const L = lines(k);
for (const x of [35, 65]) sticker(ctx, k, ellipsePath(x, 117, 10, 6), { fill: P.mint[3], rim: true });
const stalk = new Path2D(); stalk.moveTo(50, 44); stalk.bezierCurveTo(50, 30, 56, 26, 58, 18);
ctx.lineCap = 'round'; ctx.strokeStyle = CREAM; ctx.lineWidth = L.w * 1.2 + 2 * L.rim; ctx.stroke(stalk);
const body = oombaBody();
sticker(ctx, k, body, { fill: P.mint[2], shade: P.mint[3], shadeOff: 9, gloss: [30, 56, 9, 6, -0.6] });
ctx.save(); ctx.clip(body); ctx.fillStyle = P.mint[0]; ctx.beginPath(); ctx.ellipse(50, 102, 21, 13, 0, 0, TAU); ctx.fill(); ctx.restore();
detail(ctx, k, stalk, 2);
const spark = sparkPath(58, 15, 12, 0.2);
sticker(ctx, k, spark, { fill: P.spark[2], shade: P.spark[3], shadeOff: 3, emissive: true, unlit: true });
for (const [x, y] of OOMBA.eyes) ringEye(ctx, k, x, y, OOMBA.eyeD);
ctx.fillStyle = 'rgba(255,156,143,0.75)'; for (const x of [25, 75]) { ctx.beginPath(); ctx.ellipse(x, 87, 6, 3.5, 0, 0, TAU); ctx.fill(); }
const mouth = new Path2D(); mouth.moveTo(44, 86); mouth.quadraticCurveTo(50, 92, 56, 86); detail(ctx, k, mouth, 1.3);
} });
atlas.define('pupil', { w: 12, h: 12, ax: 0.5, ay: 0.5, draw(ctx, k) {
const p = ellipsePath(6, 6, OOMBA.pupilD / 2, OOMBA.pupilD / 2); ctx.fillStyle = INK; ctx.fill(p);
const h = ellipsePath(4.6, 4.4, 1.3, 1.3); ctx.fillStyle = '#FFFFFF'; ctx.fill(h);
const m = k.mask(); m.fillStyle = UNLIT; m.fill(p); m.fillStyle = EMIT; m.fill(h);
} });
atlas.define('oomba-lids', { w: OOMBA.w, h: OOMBA.h, ax: 0.5, ay: 1, draw(ctx, k) {
const L = lines(k);
for (const [x, y] of OOMBA.eyes) {
const c = ellipsePath(x, y, OOMBA.eyeD / 2 + L.w * 0.3, OOMBA.eyeD / 2 + L.w * 0.3); ctx.fillStyle = P.mint[2]; ctx.fill(c);
const lid = new Path2D(); lid.moveTo(x - 9, y); lid.quadraticCurveTo(x, y + 7, x + 9, y); detail(ctx, k, lid, 1.6);
}
} });
}
return { OOMBA, defineCoreArt };
})();
const __m_chars = (function () {
const { PALETTE, INK, CREAM, SKIN, SKIN_SHADE, HAIR } = __m_tokens;
const { sticker, detail, ringEye, sparkPath, ellipsePath, rrectPath, glowMask, lines } = __m_grammar;
const { UNLIT } = __m_atlas;
const { adjustHex, contrast, hexToOklab } = __m_color;
const { validate } = __m_validate;
const P = PALETTE, TAU = Math.PI * 2, PI = Math.PI;
const CW = 120, CH = 150;
const CLIPS = ['idle', 'walk', 'run', 'jump', 'fall', 'land', 'hurt', 'cheer', 'think', 'sad', 'sleep', 'talk', 'wave'];
const FACES = ['happy', 'sad', 'surprised', 'determined', 'thinking', 'sleepy', 'wink', 'cheer', 'hurt', 'sleep', 'talk'];
const ORDER = ['wingL', 'wingR', 'hairB', 'pack', 'tail', 'ears', 'armB', 'legB', 'legF', 'armF', 'body', 'head', 'pupilL', 'pupilR', 'face'];
const ONE_SHOT = { land: 0.28, hurt: 0.5 };
function capsule(x1, y1, x2, y2, r) {
const p = new Path2D(), a = Math.atan2(y2 - y1, x2 - x1);
p.arc(x1, y1, r, a + PI / 2, a - PI / 2 + TAU); p.arc(x2, y2, r, a - PI / 2, a + PI / 2); p.closePath(); return p;
}
const circ = (x, y, r) => ellipsePath(x, y, r, r);
function rim(ctx, k, paths) {
const L = lines(k), w = L.w + 2 * L.rim;
ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = CREAM; ctx.lineWidth = w;
for (const p of paths) ctx.stroke(p);
if (k.mask) { const m = k.mask(); m.strokeStyle = UNLIT; m.lineWidth = w; m.lineJoin = 'round'; for (const p of paths) m.stroke(p); }
}
const flat = (ctx, k, p, fill, line = 1) => sticker(ctx, k, p, { fill, rim: false, line });
const shaded = (ctx, k, p, fill, shade, gloss, off = 6) => sticker(ctx, k, p, { fill, shade, shadeOff: off, gloss, rim: false });
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
function ramp(hue) { const r = P[hue] || P.mint; return hue === 'snow' || hue === 'cream' ? [r[0], r[0], r[1], r[3]] : r; }
function hairHex(c) { if (HAIR[c]) return HAIR[c]; if (P[c]) return P[c][2]; return HAIR.cocoa; }
function hairFor(hc, skin) {
if (contrast(hc, skin) >= 3) return hc;
const away = hexToOklab(hc)[0] < hexToOklab(skin)[0] ? -1 : 1;
let best = hc, bc = contrast(hc, skin);
for (const dir of [away, -away]) for (let d = 0.02; d <= 0.161; d += 0.02) {
const c = adjustHex(hc, dir * d, dir > 0 ? 0.95 : 1.05), k = contrast(c, skin);
if (k >= 3 && dir === away) return c;
if (k > bc + 0.05) { best = c; bc = k; }
}
return best;
}
function geom(sp) {
const G = {
kid: { head: [60, 50, 33, 31], neck: [60, 80], eyes: [[47, 54], [73, 54]], eyeD: 20, mouth: [60, 69], body: [76, 122, 44], hips: [[51, 116], [69, 116]], leg: [24, 7], sh: [[43, 89], [77, 89]], arm: [24, 6], armOut: 7, ring: 0.12 },
fox: { head: [60, 54, 34, 28], neck: [60, 80], eyes: [[47, 53], [73, 53]], eyeD: 19, mouth: [60, 71], body: [76, 124, 42], hips: [[51, 118], [69, 118]], leg: [22, 7], sh: [[44, 91], [76, 91]], arm: [21, 6], armOut: 7, tail: [74, 118], ring: 0.17 },
bunny: { head: [60, 62, 31, 28], neck: [60, 88], eyes: [[48, 61], [72, 61]], eyeD: 19, mouth: [60, 78], body: [84, 126, 40], hips: [[51, 120], [69, 120]], leg: [20, 7], sh: [[45, 97], [75, 97]], arm: [19, 6], armOut: 7, tail: [80, 120], ears: [60, 40], ring: 0.17 },
frog: { head: [60, 72, 40, 25], neck: [60, 94], eyes: [[43, 50], [77, 50]], eyeD: 23, mouth: [60, 80], body: [90, 130, 52], hips: [[44, 124], [76, 124]], leg: [16, 8], sh: [[40, 103], [80, 103]], arm: [17, 6], armOut: 7, ring: 0.17 },
bee: { head: [60, 94, 38, 38], neck: [60, 140], eyes: [[47, 88], [73, 88]], eyeD: 20, mouth: [60, 106], sh: [[24, 104], [96, 104]], arm: [11, 6], armOut: 5, wings: [[48, 60], [72, 60]], ears: [60, 60], one: true, ring: 0.17 },
oomba: { head: [60, 98, 41, 48], neck: [60, 146], eyes: [[46, 92], [74, 92]], eyeD: 26, mouth: [60, 112], hips: [[46, 140], [74, 140]], leg: [5, 7], sh: [[22, 104], [98, 104]], arm: [13, 7], armOut: 5, ears: [60, 56], one: true, ring: 0.22 },
};
return G[sp] || G.oomba;
}
function defineChar(atlas, spec) {
if (!spec || !spec.__ok) spec = charSpec(spec);
const id = spec.id;
if (atlas.has(id)) return atlas.charB.get(id);
const G = geom(spec.species), D = drawers(spec, G), parts = ORDER.filter(n => D[n] || n.startsWith('pupil'));
const def = (name, box, pivot, draw) => {
const [x0, y0, x1, y1] = box;
atlas.define(id + ':' + name, { w: x1 - x0, h: y1 - y0, ax: (pivot[0] - x0) / (x1 - x0), ay: (pivot[1] - y0) / (y1 - y0), lineH: CH,
draw(ctx, k) { ctx.translate(-x0, -y0); const kk = Object.assign({}, k, { mask: () => { const m = k.mask(); m.translate(-x0, -y0); return m; } }); draw(ctx, kk); } });
};
for (const n of parts) if (n !== 'pupilL' && n !== 'pupilR') { const d = D[n]; def(n, d.box, d.pivot, d.draw); }
const pr = pupilR(G);
atlas.define(id + ':pupil', { w: pr * 2 + 4, h: pr * 2 + 4, ax: 0.5, ay: 0.5, lineH: CH, draw(ctx, k) { pupilDraw(ctx, k, pr + 2, pr + 2, pr); } });
const all = (ctx, k) => {
for (const n of parts) {
if (n === 'pupilL' || n === 'pupilR') { const E = G.eyes[n === 'pupilL' ? 0 : 1]; if (!closedEyes(k.v || spec.mood, n)) { ctx.save(); pupilDraw(ctx, k, E[0], E[1] - 1, pr * (k.v === 'surprised' ? 0.7 : 1)); ctx.restore(); } continue; }
ctx.save(); const kk = n === 'face' ? Object.assign({}, k, { v: k.v || spec.mood }) : k; D[n].draw(ctx, kk); ctx.restore();
}
};
atlas.define(id, { w: CW, h: CH, ax: 0.5, ay: 1, draw: all });
atlas.define(id + ':portrait', { w: CW + 40, h: CH + 52, ax: 0.5, ay: (CH + 42) / (CH + 52), lineH: CH, draw(ctx, k) { ctx.translate(20, 42); all(ctx, Object.assign({}, k, { mask: () => { const m = k.mask(); m.translate(20, 42); return m; } })); } });
const b = { id, spec, G, parts, pupil: id + ':pupil', pr };
if (!atlas.charB) atlas.charB = new Map();
atlas.charB.set(id, b);
return b;
}
function charSpec(o) {
const s = Object.assign({}, validate('char', typeof o === 'string' ? { species: o } : o || {}).spec);
if (s.species === 'kid') { s.hair = s.hair || { style: 'bob', color: 'cocoa' }; s.outfit = s.outfit || { top: 'tee', color: 'sky' }; }
if (s.species !== 'kid' && !(o && o.colors && o.colors.base)) s.colors = Object.assign({}, s.colors, { base: { fox: 'peach', bunny: 'snow', frog: 'mint', bee: 'peach', oomba: 'mint' }[s.species] || s.colors.base });
if (s.colors.base === 'spark') s.colors = Object.assign({}, s.colors, { base: 'peach' });
s.id = 'ch' + hash(JSON.stringify([s.species, s.body, s.colors, s.skin, s.hair, s.outfit, s.wear]));
s.__ok = 1;
return Object.freeze(s);
}
const pupilR = G => G.eyeD * (0.5 - (G.ring || 0.22)) * 0.55;
function pupilDraw(ctx, k, x, y, r) {
const p = circ(x, y, r); ctx.fillStyle = INK; ctx.fill(p);
const h = circ(x - r * 0.34, y - r * 0.38, Math.max(1.1, r * 0.38)); ctx.fillStyle = '#FFFFFF'; ctx.fill(h);
if (k.mask) { const m = k.mask(); m.fillStyle = UNLIT; m.fill(p); m.fillStyle = '#FF0000'; m.fill(h); }
}
const CLOSED = { cheer: 2, hurt: 2, sleep: 2, blink: 2, wink: 1 };
function closedEyes(v, n) { const base = String(v || '').split('.')[0], c = String(v || '').endsWith('.b') ? 2 : CLOSED[base] || 0; return c === 2 || (c === 1 && n === 'pupilR'); }
function drawers(spec, G) {
const sp = spec.species, D = {};
const R = ramp(spec.colors.base), fill = R[2], shade = R[3], light = R[1], tint = R[0];
const belly = spec.colors.belly === 'cream' ? CREAM : ramp(spec.colors.belly)[1];
const [hx, hy, hrx, hry] = G.head;
const skin = SKIN[spec.skin], skinS = SKIN_SHADE[spec.skin];
const headFill = sp === 'kid' ? skin : fill;
const headShade = sp === 'kid' ? skinS : shade;
const wear = new Set(spec.wear);
const outfit = spec.outfit ? ramp(spec.outfit.color) : null;
const accent = spec.colors.accent === 'spark' ? 'coral' : spec.colors.accent;
const A = ramp(accent);
const limb = (px, py, len, r, out, col, colS, end, sleeve, sleeveLen) => (ctx, k) => {
const ex = px + out, ey = py + len;
const arm = capsule(px, py - 3, ex, ey, r), hand = circ(ex, ey, r * 1.12);
const sl = sleeve ? capsule(px, py - 3, px + out * sleeveLen, py + len * sleeveLen, r * 1.2) : null;
rim(ctx, k, sl ? [arm, hand, sl] : [arm, hand]);
shaded(ctx, k, arm, col, colS, null, 2.5);
if (sl) shaded(ctx, k, sl, sleeve[2], sleeve[3], null, 2.5);
shaded(ctx, k, hand, end || col, end ? adjustHex(end, -0.1) : colS, null, 2.5);
};
const legDraw = (hx0, hy0, len, r, col, colS, foot) => (ctx, k) => {
const leg = capsule(hx0, hy0, hx0, hy0 + len, r), f = ellipsePath(hx0 + 2, hy0 + len + 2, r * 1.45, r * 0.95);
rim(ctx, k, [leg, f]);
shaded(ctx, k, leg, col, colS, null, 2.5); shaded(ctx, k, f, foot, adjustHex(foot, -0.12), null, 2);
};
const box = (x, y, rx, ry) => [x - rx - 10, y - ry - 10, x + rx + 10, y + ry + 10];
if (G.sh) {
const [len, r] = G.arm;
const kidSleeve = sp === 'kid' ? (spec.outfit.top === 'overalls' ? [0, 0, CREAM, P.cream[3]] : outfit) : null;
const sleeveLen = sp === 'kid' ? (spec.outfit.top === 'hoodie' ? 0.85 : 0.45) : 0;
const col = sp === 'kid' ? skin : fill, colS = sp === 'kid' ? skinS : shade;
const paw = sp === 'fox' ? P.cocoa[3] : sp === 'kid' ? skin : sp === 'bee' ? INK : null;
[['armB', 0, -1], ['armF', 1, 1]].forEach(([n, i, s]) => {
const [x, y] = G.sh[i];
D[n] = { box: [x - 22, y - 16, x + 22, y + len + 14], pivot: [x, y], draw: limb(x, y, len, r, s * (G.armOut || 3), col, colS, paw, kidSleeve, sleeveLen) };
});
}
if (G.hips) {
const [len, r] = G.leg;
let col = fill, colS = shade, foot = shade;
if (sp === 'kid') {
const t = spec.outfit.top; foot = P.cocoa[3];
if (t === 'dress') { col = skin; colS = skinS; } else if (t === 'overalls') { col = outfit[2]; colS = outfit[3]; } else { const pants = spec.outfit.color === 'sky' ? ramp('cocoa') : ramp('sky'); col = pants[3]; colS = adjustHex(pants[3], -0.08); }
} else if (sp === 'fox') { col = P.cocoa[3]; colS = adjustHex(P.cocoa[3], -0.08); foot = P.cocoa[3]; }
else if (sp === 'oomba') { col = shade; foot = shade; }
else if (sp === 'frog') { foot = light; }
[['legB', 0], ['legF', 1]].forEach(([n, i]) => {
const [x, y] = G.hips[i];
D[n] = { box: [x - 18, y - 12, x + 20, y + len + 14], pivot: [x, y],
draw: sp === 'frog' ? (ctx, k) => {
const s = i ? 1 : -1, th = ellipsePath(x + s * 6, y + 4, 12, 9, s * 0.4), f = ellipsePath(x + s * 8, y + 14, 10, 4.5);
rim(ctx, k, [th, f]); shaded(ctx, k, th, fill, shade, null, 3);
for (const dx of [-6, 0, 6]) flat(ctx, k, circ(x + s * 8 + dx, y + 16, 3.4), light, 0.7);
shaded(ctx, k, f, light, fill, null, 2);
} : legDraw(x, y, len, r, col, colS, foot) };
});
}
if (!G.one) {
const [top, bot, w] = G.body, cx = 60, mid = (top + bot) / 2;
const torso = () => {
if (spec.body === 'ball') return ellipsePath(cx, mid, w / 2 + 3, (bot - top) / 2);
if (spec.body === 'pear') { const p = new Path2D(); p.moveTo(cx, top); p.bezierCurveTo(cx + w * 0.38, top, cx + w * 0.62, bot - 6, cx + w * 0.5, bot - 2); p.quadraticCurveTo(cx, bot + 4, cx - w * 0.5, bot - 2); p.bezierCurveTo(cx - w * 0.62, bot - 6, cx - w * 0.38, top, cx, top); p.closePath(); return p; }
return rrectPath(cx - w / 2, top, w, bot - top, w * 0.4);
};
D.body = { box: [cx - w / 2 - 22, top - 16, cx + w / 2 + 22, bot + 26], pivot: [cx, bot], draw(ctx, k) {
const t = torso(), list = [t];
let pack = null, skirt = null, hood = null;
if (sp === 'kid' && spec.outfit.top === 'dress') { skirt = new Path2D(); skirt.moveTo(cx - w * 0.42, mid); skirt.lineTo(cx + w * 0.42, mid); skirt.quadraticCurveTo(cx + w * 0.7, bot + 6, cx + w * 0.62, bot + 12); skirt.quadraticCurveTo(cx, bot + 18, cx - w * 0.62, bot + 12); skirt.quadraticCurveTo(cx - w * 0.7, bot + 6, cx - w * 0.42, mid); skirt.closePath(); list.push(skirt); }
if (sp === 'kid' && spec.outfit.top === 'hoodie') { hood = ellipsePath(cx, top + 3, w * 0.42, 9); list.unshift(hood); }
rim(ctx, k, list);
if (hood) flat(ctx, k, hood, outfit[3]);
if (sp === 'kid') {
const top0 = spec.outfit.top, shirt = top0 === 'overalls' ? CREAM : outfit[2], shirtS = top0 === 'overalls' ? P.cream[3] : outfit[3];
shaded(ctx, k, t, shirt, shirtS, [cx - w * 0.22, top + 10, 6, 4, -0.6], 5);
if (top0 === 'overalls') { const bib = rrectPath(cx - w * 0.3, mid - 6, w * 0.6, bot - mid + 6, 6); ctx.save(); ctx.clip(t); shaded(ctx, k, bib, outfit[2], outfit[3], null, 3); ctx.restore(); for (const s of [-1, 1]) { const st = new Path2D(); st.moveTo(cx + s * w * 0.26, mid - 4); st.lineTo(cx + s * w * 0.34, top + 2); detail(ctx, k, st, 2.2); flat(ctx, k, circ(cx + s * w * 0.18, mid, 2.4), CREAM, 0.6); } }
if (top0 === 'hoodie') { const pk = rrectPath(cx - w * 0.28, mid + 4, w * 0.56, 12, 5); detail(ctx, k, pk, 1); for (const s of [-1, 1]) { const st = new Path2D(); st.moveTo(cx + s * 5, top + 4); st.lineTo(cx + s * 6, top + 16); detail(ctx, k, st, 1); } }
if (skirt) shaded(ctx, k, skirt, outfit[2], outfit[3], null, 4);
const neck = new Path2D(); neck.moveTo(cx - 7, top + 1); neck.quadraticCurveTo(cx, top + 8, cx + 7, top + 1); detail(ctx, k, neck, 1);
} else {
shaded(ctx, k, t, fill, shade, [cx - w * 0.22, top + 10, 6, 4, -0.6], 5);
ctx.save(); ctx.clip(t); flat(ctx, k, ellipsePath(cx, mid + 6, w * 0.3, (bot - top) * 0.36), belly, 0.6); ctx.restore();
}
if (wear.has('backpack')) for (const s of [-1, 1]) { const st = capsule(cx + s * w * 0.3, top + 4, cx + s * w * 0.34, mid + 6, 2.6); flat(ctx, k, st, A[2], 0.7); }
if (wear.has('scarf')) { const sc = rrectPath(cx - w * 0.46, top - 4, w * 0.92, 11, 5.5), tail = rrectPath(cx + w * 0.12, top + 2, 9, 20, 4); rim(ctx, k, [sc, tail]); shaded(ctx, k, tail, A[2], A[3], null, 2); shaded(ctx, k, sc, A[2], A[3], null, 2); }
} };
}
if (!G.one && wear.has('backpack')) {
const [top, bot, w] = G.body, cx = 60;
D.pack = { box: [cx - w / 2 - 22, top - 6, cx + w / 2 + 22, bot + 10], pivot: [cx, bot], draw(ctx, k) {
const pk = rrectPath(cx - w / 2 - 7, top + 6, w + 14, bot - top - 12, 12); rim(ctx, k, [pk]); shaded(ctx, k, pk, A[2], A[3], [cx - w / 2 - 2, top + 12, 3, 5, -0.3], 3);
} };
}
if (sp === 'fox') D.tail = { box: [60, 60, 122, 130], pivot: G.tail, draw(ctx, k) {
const t = new Path2D(); t.moveTo(72, 120); t.bezierCurveTo(100, 122, 116, 100, 108, 72); t.bezierCurveTo(98, 84, 82, 96, 72, 110); t.closePath();
const tip = new Path2D(); tip.moveTo(108, 72); tip.bezierCurveTo(110, 84, 106, 92, 100, 96); tip.quadraticCurveTo(98, 84, 108, 72); tip.closePath();
rim(ctx, k, [t]); shaded(ctx, k, t, fill, shade, null, 4); ctx.save(); ctx.clip(t); flat(ctx, k, tip, CREAM, 0.6); ctx.restore();
} };
if (sp === 'bunny') {
D.tail = { box: [64, 104, 100, 136], pivot: G.tail, draw(ctx, k) { const p = circ(82, 118, 9); rim(ctx, k, [p]); shaded(ctx, k, p, CREAM, P.cream[3], null, 2); } };
D.ears = { box: [24, -12, 96, 52], pivot: G.ears, draw(ctx, k) {
const e1 = capsule(50, 44, 40, 6, 9.5), e2 = capsule(70, 44, 82, 8, 9.5);
rim(ctx, k, [e1, e2]);
for (const [e, a, b] of [[e1, [49, 38], [42, 12]], [e2, [71, 38], [80, 14]]]) { shaded(ctx, k, e, fill, shade, null, 3); flat(ctx, k, capsule(a[0], a[1], b[0], b[1], 4.2), P.coral[1], 0.6); }
} };
}
if (sp === 'oomba') D.ears = { box: [44, 2, 90, 64], pivot: G.ears, draw(ctx, k) {
const L = lines(k), stalk = new Path2D(); stalk.moveTo(60, 58); stalk.bezierCurveTo(60, 42, 68, 36, 70, 26);
ctx.lineCap = 'round'; ctx.strokeStyle = CREAM; ctx.lineWidth = L.w * 1.2 + 2 * L.rim; ctx.stroke(stalk);
detail(ctx, k, stalk, 2.2);
const s = sparkPath(71, 19, 13, 0.2);
sticker(ctx, k, s, { fill: P.spark[2], shade: P.spark[3], shadeOff: 3, emissive: true, unlit: true });
} };
if (sp === 'bee') {
D.ears = { box: [30, 26, 90, 72], pivot: G.ears, draw(ctx, k) {
for (const s of [-1, 1]) { const a = new Path2D(); a.moveTo(60 + s * 8, 64); a.quadraticCurveTo(60 + s * 12, 42, 60 + s * 20, 38); detail(ctx, k, a, 2); const b = circ(60 + s * 20, 38, 4.5); sticker(ctx, k, b, { fill: INK, rim: true, line: 0.6 }); }
} };
for (const [n, i, s] of [['wingL', 0, -1], ['wingR', 1, 1]]) {
const [x, y] = G.wings[i];
D[n] = { box: [x - 36, y - 40, x + 36, y + 14], pivot: [x, y], draw(ctx, k) {
const w = ellipsePath(x + s * 14, y - 16, 18, 12, s * -0.6);
sticker(ctx, k, w, { fill: P.sky[0], shade: P.sky[1], shadeOff: 3, gloss: [x + s * 10, y - 22, 5, 3, s * -0.6] });
const v = new Path2D(); v.moveTo(x + s * 2, y - 4); v.quadraticCurveTo(x + s * 12, y - 14, x + s * 24, y - 22); detail(ctx, k, v, 0.7);
} };
}
}
if (sp === 'kid') {
const H0 = hairShapes(spec.hair.style, G);
if (H0.low.length) {
const hc0 = hairFor(hairHex(spec.hair.color), skin);
D.hairB = { box: [hx - hrx - 16, hy - hry - 10, hx + hrx + 16, hy + hry + 56], pivot: G.neck, draw(ctx, k) { rim(ctx, k, H0.low); for (const p of H0.low) shaded(ctx, k, p, adjustHex(hc0, -0.04), adjustHex(hc0, -0.12), null, 4); } };
}
}
D.head = { box: [hx - hrx - 30, hy - hry - (sp === 'kid' ? 52 : 28), hx + hrx + 30, sp === 'bee' ? 156 : hy + hry + (sp === 'kid' ? 34 : 14)], pivot: G.neck, draw(ctx, k) {
const head = sp === 'oomba' ? oombaBean() : ellipsePath(hx, hy, hrx, hry);
const sil = [head], back = [], front = [];
const hc = sp === 'kid' ? hairFor(hairHex(spec.hair.color), skin) : null, hcS = hc ? adjustHex(hc, -0.08) : null, hcL = hc ? adjustHex(hc, 0.12, 0.9) : null;
let H = null;
if (sp === 'kid') { H = hairShapes(spec.hair.style, G); back.push(...H.back); front.push(...H.front); sil.push(...H.back, ...H.front); for (const s of [-1, 1]) sil.push(circ(hx + s * (hrx - 1), hy + 5, 6.5)); }
let ears = null, bumps = null, sting = null;
if (sp === 'fox') { ears = [-1, 1].map(s => { const p = new Path2D(); p.moveTo(hx + s * 30, hy - 4); p.quadraticCurveTo(hx + s * 34, hy - 36, hx + s * 26, hy - 42); p.quadraticCurveTo(hx + s * 14, hy - 34, hx + s * 8, hy - 22); p.closePath(); return p; }); sil.push(...ears); }
if (sp === 'frog') { bumps = G.eyes.map(([x, y]) => circ(x, y + 2, 15)); sil.push(...bumps); }
if (sp === 'bee') { sting = new Path2D(); sting.moveTo(52, 128); sting.quadraticCurveTo(60, 152, 60, 152); sting.quadraticCurveTo(60, 152, 68, 128); sting.closePath(); sil.unshift(sting); }
const hat = sp === 'kid' || sp === 'fox' || sp === 'bunny' ? wearHat(wear, hx, hy - hry, hrx) : [];
sil.push(...hat.map(h => h.p));
rim(ctx, k, sil);
if (sting) flat(ctx, k, sting, P.cocoa[3]);
for (const p of back) shaded(ctx, k, p, hc, hcS, null, 4);
if (H && H.ties) for (const t of H.ties) flat(ctx, k, t, A[2], 0.7);
if (ears) ears.forEach((p, i) => { shaded(ctx, k, p, fill, shade, null, 3); const s = i ? 1 : -1, inner = new Path2D(); inner.moveTo(hx + s * 26, hy - 10); inner.quadraticCurveTo(hx + s * 27, hy - 30, hx + s * 24, hy - 34); inner.quadraticCurveTo(hx + s * 16, hy - 28, hx + s * 13, hy - 20); inner.closePath(); flat(ctx, k, inner, P.cocoa[3], 0.5); });
if (sp === 'kid') for (const s of [-1, 1]) shaded(ctx, k, circ(hx + s * (hrx - 1), hy + 5, 6.5), skin, skinS, null, 2);
shaded(ctx, k, head, headFill, headShade, [hx - hrx * 0.42, hy - hry * 0.45, hrx * 0.2, hry * 0.13, -0.6], sp === 'oomba' ? 9 : 6);
if (bumps) for (const b of bumps) shaded(ctx, k, b, fill, shade, null, 4);
if (sp === 'oomba') { ctx.save(); ctx.clip(head); flat(ctx, k, ellipsePath(60, 132, 25, 14), P.mint[0], 0.6); ctx.restore(); }
if (sp === 'bee') { ctx.save(); ctx.clip(head); for (const y of [110, 126]) { const b = new Path2D(); b.moveTo(10, y); b.quadraticCurveTo(60, y + 10, 110, y); b.lineTo(110, y + 8); b.quadraticCurveTo(60, y + 18, 10, y + 8); b.closePath(); ctx.fillStyle = INK; ctx.fill(b); if (k.mask) { const m = k.mask(); m.fillStyle = UNLIT; m.fill(b); } } ctx.restore(); }
if (sp === 'fox') { ctx.save(); ctx.clip(head); const m = new Path2D(); m.moveTo(hx - hrx, hy + 6); m.quadraticCurveTo(hx - 12, hy + 6, hx, hy + 14); m.quadraticCurveTo(hx + 12, hy + 6, hx + hrx, hy + 6); m.lineTo(hx + hrx, hy + hry); m.lineTo(hx - hrx, hy + hry); m.closePath(); flat(ctx, k, m, CREAM, 0.6); ctx.restore(); flat(ctx, k, ellipsePath(hx, hy + 9, 4.6, 3.4), INK, 0.6); }
if (sp === 'bunny') { ctx.save(); ctx.clip(head); flat(ctx, k, ellipsePath(hx, hy + 18, 16, 11), CREAM, 0.6); ctx.restore(); const n = new Path2D(); n.moveTo(hx - 4, hy + 11); n.quadraticCurveTo(hx, hy + 9, hx + 4, hy + 11); n.quadraticCurveTo(hx, hy + 17, hx - 4, hy + 11); n.closePath(); flat(ctx, k, n, P.coral[2], 0.6); }
if (sp === 'frog') { ctx.save(); ctx.clip(head); flat(ctx, k, ellipsePath(hx, hy + 18, 24, 9), light, 0.6); ctx.restore(); }
ctx.fillStyle = 'rgba(255,156,143,0.7)';
const cy = G.mouth[1] - 3, cdx = (G.eyes[1][0] - G.eyes[0][0]) * 0.5 + G.eyeD * 0.45;
for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(hx + s * cdx, cy, 5.5, 3.2, 0, 0, TAU); ctx.fill(); }
if (sp === 'kid') { const n = new Path2D(); n.moveTo(hx - 2.5, G.mouth[1] - 7); n.quadraticCurveTo(hx, G.mouth[1] - 5, hx + 2.5, G.mouth[1] - 7); detail(ctx, k, n, 1); }
for (const [x, y] of G.eyes) ringEye(ctx, k, x, y, G.eyeD, G.ring);
for (const p of front) shaded(ctx, k, p, hc, hcS, [p === front[0] ? hx - 12 : hx, hy - hry + 4, 6, 2.5, -0.3], 3);
if (H && H.strands) for (const st of H.strands) { ctx.strokeStyle = hcL; ctx.lineWidth = lines(k).inner * 1.3; ctx.lineCap = 'round'; ctx.stroke(st); }
for (const h of hat) h.draw(ctx, k);
} };
D.face = { box: [hx - hrx - 6, Math.min(G.eyes[0][1] - G.eyeD - 14, hy - hry), hx + hrx + 6, G.mouth[1] + 16], pivot: G.neck, draw(ctx, k) {
const v = String(k.v || 'happy'), blink = v.endsWith('.b'), mood = v.split('.')[0];
const [mx, my] = G.mouth, d = G.eyeD;
const lid = (x, y, shape) => {
const c = circ(x, y, d / 2 + 0.6); ctx.fillStyle = headFill; ctx.fill(c);
const p = new Path2D();
if (shape === 'up') { p.moveTo(x - d * 0.36, y + 2); p.quadraticCurveTo(x, y - d * 0.4, x + d * 0.36, y + 2); }
else if (shape === 'x') { p.moveTo(x - d * 0.3, y - d * 0.25); p.lineTo(x + d * 0.12, y); p.lineTo(x - d * 0.3, y + d * 0.25); }
else if (shape === 'xr') { p.moveTo(x + d * 0.3, y - d * 0.25); p.lineTo(x - d * 0.12, y); p.lineTo(x + d * 0.3, y + d * 0.25); }
else { p.moveTo(x - d * 0.36, y); p.quadraticCurveTo(x, y + d * 0.3, x + d * 0.36, y); }
detail(ctx, k, p, 1.7);
};
const half = (x, y, tilt = 0) => { ctx.save(); const c = circ(x, y, d / 2 + 0.6); ctx.clip(c); ctx.fillStyle = headFill; ctx.fillRect(x - d, y - d, d * 2, d * 0.95 + tilt); ctx.restore(); const p = new Path2D(); p.moveTo(x - d * 0.42, y - d * 0.05 + tilt * 0.5); p.lineTo(x + d * 0.42, y - d * 0.05 - tilt * 0.5); detail(ctx, k, p, 1.5); };
const brow = (x, y, a, lift = 0) => { const p = new Path2D(); const by = y - d * 0.78 - lift; p.moveTo(x - d * 0.28, by + a * d * 0.18); p.quadraticCurveTo(x, by - d * 0.08, x + d * 0.28, by - a * d * 0.18); detail(ctx, k, p, 1.5); };
const [L, Rr] = G.eyes;
if (blink) { lid(L[0], L[1]); lid(Rr[0], Rr[1]); }
else if (mood === 'cheer') { lid(L[0], L[1], 'up'); lid(Rr[0], Rr[1], 'up'); }
else if (mood === 'hurt') { lid(L[0], L[1], 'x'); lid(Rr[0], Rr[1], 'xr'); }
else if (mood === 'sleep') { lid(L[0], L[1]); lid(Rr[0], Rr[1]); }
else if (mood === 'wink') lid(Rr[0], Rr[1], 'up');
else if (mood === 'sleepy') { half(L[0], L[1]); half(Rr[0], Rr[1]); }
else if (mood === 'sad') { half(L[0], L[1], -4); half(Rr[0], Rr[1], 4); }
const browed = sp === 'kid' || sp === 'fox' || sp === 'bunny' || sp === 'bee';
if (browed) {
if (mood === 'sad' || mood === 'hurt') { brow(L[0], L[1], -1); brow(Rr[0], Rr[1], 1); }
else if (mood === 'determined') { brow(L[0], L[1], 1, -2); brow(Rr[0], Rr[1], -1, -2); }
else if (mood === 'surprised') { brow(L[0], L[1], 0, 4); brow(Rr[0], Rr[1], 0, 4); }
else if (mood === 'thinking') { brow(L[0], L[1], 0, 3); brow(Rr[0], Rr[1], 0.6, -1); }
}
const w = sp === 'frog' ? 15 : sp === 'oomba' ? 7 : 6.5;
const m = new Path2D();
if (mood === 'cheer' || mood === 'talk' || mood === 'surprised' || mood === 'hurt') {
const o = new Path2D();
if (mood === 'cheer') { o.moveTo(mx - w * 1.2, my - 2); o.quadraticCurveTo(mx, my - 3, mx + w * 1.2, my - 2); o.quadraticCurveTo(mx + w, my + 11, mx, my + 11); o.quadraticCurveTo(mx - w, my + 11, mx - w * 1.2, my - 2); }
else if (mood === 'hurt') { o.moveTo(mx - w, my + 3); o.quadraticCurveTo(mx, my - 4, mx + w, my + 3); o.quadraticCurveTo(mx, my + 1, mx - w, my + 3); }
else o.ellipse(mx, my + 2, mood === 'talk' ? w * 0.8 : w * 0.55, mood === 'talk' ? 4.6 : 5.5, 0, 0, TAU);
o.closePath(); ctx.fillStyle = P.cocoa[3]; ctx.fill(o);
ctx.save(); ctx.clip(o); ctx.fillStyle = P.coral[1]; ctx.beginPath(); ctx.ellipse(mx, my + 10, w * 0.7, 5, 0, 0, TAU); ctx.fill(); ctx.restore();
detail(ctx, k, o, 1.2);
} else {
if (mood === 'sad') { m.moveTo(mx - w, my + 4); m.quadraticCurveTo(mx, my - 3, mx + w, my + 4); }
else if (mood === 'determined') { m.moveTo(mx - w, my + 1); m.quadraticCurveTo(mx, my + 4, mx + w, my); }
else if (mood === 'thinking') { m.moveTo(mx - w * 0.6, my + 2); m.quadraticCurveTo(mx, my, mx + w * 0.9, my + 3); }
else if (mood === 'sleepy' || mood === 'sleep') { m.moveTo(mx - w * 0.5, my + 2); m.quadraticCurveTo(mx, my + 4, mx + w * 0.5, my + 2); }
else if (sp === 'fox') { m.moveTo(mx - w, my - 1); m.quadraticCurveTo(mx - w / 2, my + 5, mx, my); m.quadraticCurveTo(mx + w / 2, my + 5, mx + w, my - 1); }
else { m.moveTo(mx - w, my); m.quadraticCurveTo(mx, my + w * 0.95, mx + w, my); }
detail(ctx, k, m, 1.4);
if (sp === 'bunny' && mood !== 'sad') { const t = rrectPath(mx - 3.5, my + 2.5, 7, 6, 1.5); sticker(ctx, k, t, { fill: CREAM, rim: false, line: 0.5 }); }
}
if (wear.has('glasses')) for (const [x, y] of G.eyes) { const g = circ(x, y, d * 0.62); ctx.strokeStyle = INK; ctx.lineWidth = lines(k).inner * 1.8; ctx.stroke(g); const b = new Path2D(); b.moveTo(L[0] + d * 0.62, L[1]); b.lineTo(Rr[0] - d * 0.62, Rr[1]); detail(ctx, k, b, 1.5); }
} };
return D;
}
function oombaBean() {
const p = new Path2D();
p.moveTo(60, 52); p.bezierCurveTo(95, 52, 102, 84, 101, 108); p.bezierCurveTo(100, 134, 84, 146, 60, 146); p.bezierCurveTo(36, 146, 20, 134, 19, 108); p.bezierCurveTo(18, 84, 25, 52, 60, 52); p.closePath();
return p;
}
function hairShapes(style, G) {
const [hx, hy, rx, ry] = G.head, top = hy - ry, back = [], front = [], low = [], ties = [], strands = [];
const cap = (drop = 12, ext = 2) => { const p = new Path2D(); p.ellipse(hx, hy, rx + ext, ry + ext, 0, PI + 0.32, TAU - 0.32); p.quadraticCurveTo(hx + rx * 0.5, top + drop + 4, hx, top + drop); p.quadraticCurveTo(hx - rx * 0.6, top + drop + 6, hx - (rx + ext) * Math.cos(0.32), hy - (ry + ext) * Math.sin(0.32)); p.closePath(); return p; };
const strand = (x0, y0, cx, cy, x1, y1) => { const p = new Path2D(); p.moveTo(x0, y0); p.quadraticCurveTo(cx, cy, x1, y1); strands.push(p); };
if (style === 'puffs') {
for (const sd of [-1, 1]) {
const bx = hx + sd * (rx + 9), by = hy - 7;
back.push(circ(bx, by, 12.5)); ties.push(ellipsePath(hx + sd * (rx - 1), by + 1, 3.4, 6, sd * -0.25));
for (const [dx, dy, a0] of [[-3, -3, 0.2], [3, 3, 2.2]]) { const c = new Path2D(); c.arc(bx + sd * dx, by + dy, 4.4, a0, a0 + PI * 1.1); strands.push(c); }
}
front.push(cap(14));
}
else if (style === 'bob') { back.push(rrectPath(hx - rx - 5, top - 4, (rx + 5) * 2, ry * 2 + 2, rx * 0.9)); const f = new Path2D(); f.ellipse(hx, hy, rx + 3, ry + 3, 0, PI + 0.05, TAU - 0.05); f.lineTo(hx + rx * 0.7, hy - 8); f.quadraticCurveTo(hx + rx * 0.3, top + 18, hx, hy - 10); f.quadraticCurveTo(hx - rx * 0.3, top + 18, hx - rx * 0.7, hy - 8); f.closePath(); front.push(f); strand(hx - 8, top + 3, hx - rx * 0.6, top + 6, hx - rx * 0.85, hy - 8); }
else if (style === 'curls') { for (let i = 0; i <= 8; i++) { const a = PI + 0.05 + (i / 8) * (PI - 0.1); back.push(circ(hx + Math.cos(a) * (rx + 1), hy + Math.sin(a) * (ry + 1) + 4, 10)); } front.push(cap(16, 4)); }
else if (style === 'spiky') { const p = new Path2D(); p.moveTo(hx - rx - 1, hy - 4); const n = 5; for (let i = 0; i <= n; i++) { const a = PI + 0.2 + (i / n) * (PI - 0.4), x = hx + Math.cos(a) * (rx + 12), y = hy + Math.sin(a) * (ry + 12); const b = PI + 0.2 + ((i + 0.5) / n) * (PI - 0.4); p.quadraticCurveTo(x, y, hx + Math.cos(b) * rx * 0.92, hy + Math.sin(b) * ry * 0.92); } p.quadraticCurveTo(hx, top + 18, hx - rx - 1, hy - 4); p.closePath(); front.push(p); }
else if (style === 'braids') { for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) back.push(ellipsePath(hx + sd * (rx + 2), hy + 8 + i * 11, 6.5, 7)); for (const sd of [-1, 1]) ties.push(ellipsePath(hx + sd * (rx + 2), hy + 39, 4.5, 2.6)); front.push(cap(12)); }
else if (style === 'buzz') front.push(cap(8, 1));
else if (style === 'long') {
back.push(ellipsePath(hx, hy - 2, rx + 6, ry + 5));
low.push(rrectPath(hx - rx - 6, hy - 4, (rx + 6) * 2, ry + 44, 16));
const f = new Path2D(); f.moveTo(hx, top + 3);
f.quadraticCurveTo(hx - rx * 0.55, top + 7, hx - rx * 0.9, hy + 2); f.lineTo(hx - rx - 4, hy + 16);
f.ellipse(hx, hy, rx + 4, ry + 4, 0, PI * 0.93, PI * 2.07);
f.lineTo(hx + rx + 4, hy + 16); f.lineTo(hx + rx * 0.9, hy + 2); f.quadraticCurveTo(hx + rx * 0.55, top + 7, hx, top + 3); f.closePath();
front.push(f);
strand(hx - 4, top + 4, hx - rx * 0.6, top + 9, hx - rx * 0.86, hy + 4); strand(hx + 4, top + 4, hx + rx * 0.6, top + 9, hx + rx * 0.86, hy + 4);
}
else if (style === 'cap') front.push(cap(6, 1));
return { back, front, low, ties, strands };
}
function wearHat(wear, hx, top, rx) {
const out = [];
if (wear.has('headphones')) {
const band = new Path2D(); band.ellipse(hx, top + 26, rx + 5, rx - 2, 0, PI + 0.25, TAU - 0.25);
const cups = [-1, 1].map(s => rrectPath(hx + s * (rx + 2) - 7, top + 26, 14, 22, 7));
out.push({ p: cups[0], draw: (ctx, k) => { ctx.strokeStyle = INK; ctx.lineWidth = lines(k).w * 1.6; ctx.lineCap = 'round'; ctx.stroke(band); ctx.strokeStyle = P.coral[2]; ctx.lineWidth = lines(k).w * 0.7; ctx.stroke(band); for (const c of cups) sticker(ctx, k, c, { fill: P.coral[2], shade: P.coral[3], shadeOff: 2, rim: false }); } }, { p: cups[1], draw: () => {} });
}
if (wear.has('crown')) {
const p = new Path2D(); p.moveTo(hx - 16, top + 6); p.lineTo(hx - 18, top - 12); p.lineTo(hx - 8, top - 3); p.lineTo(hx, top - 16); p.lineTo(hx + 8, top - 3); p.lineTo(hx + 18, top - 12); p.lineTo(hx + 16, top + 6); p.closePath();
out.push({ p, draw: (ctx, k) => { sticker(ctx, k, p, { fill: P.spark[2], shade: P.spark[3], shadeOff: 3, rim: false, unlit: true }); sticker(ctx, k, circ(hx, top - 1, 3), { fill: P.grape[2], rim: false, line: 0.6 }); } });
}
if (wear.has('wizard-hat')) {
const p = new Path2D(); p.moveTo(hx - rx - 6, top + 10); p.quadraticCurveTo(hx, top + 2, hx + rx + 6, top + 10); p.quadraticCurveTo(hx + 12, top - 2, hx + 8, top - 30); p.quadraticCurveTo(hx + 4, top - 40, hx + 16, top - 44); p.quadraticCurveTo(hx - 4, top - 44, hx - 12, top - 6); p.quadraticCurveTo(hx - 18, top + 2, hx - rx - 6, top + 10); p.closePath();
out.push({ p, draw: (ctx, k) => { sticker(ctx, k, p, { fill: P.grape[2], shade: P.grape[3], shadeOff: 4, rim: false }); for (const [x, y, r] of [[hx - 4, top - 14, 3.5], [hx + 6, top - 2, 2.6]]) { const s = sparkPath(x, y, r * 1.6, 0.2); ctx.fillStyle = P.snow[0]; ctx.fill(s); glowMask(k, s); } } });
}
return out;
}
const NCH = 14, BY = 0, HY = 1, HR = 2, AB = 3, AF = 4, LBX = 5, LBY = 6, LBR = 7, LFX = 8, LFY = 9, LFR = 10, TR = 11, ER = 12, SY = 13;
function clipPose(clip, t, T, o, speed = 1) {
o.fill(0); o[SY] = 1;
const br = Math.sin(T * TAU * 0.4);
const idle = () => { o[SY] = 1 + 0.02 * br; o[HY] = 0.6 * br; o[AB] = 0.12 + 0.04 * Math.sin(T * 2.5); o[AF] = 0.12 + 0.04 * Math.sin(T * 2.5 + 1); o[TR] = 0.15 * Math.sin(T * 2); };
switch (clip) {
case 'walk': case 'run': {
const run = clip === 'run', f = (run ? 3.3 : 2.1) * Math.max(0.6, Math.min(1.6, speed)), ph = t * f * TAU, s = Math.sin(ph), c = Math.cos(ph), a = run ? 1.6 : 1;
o[BY] = -Math.abs(c) * 3 * a; o[LBX] = s * 5 * a; o[LFX] = -s * 5 * a; o[LBY] = -Math.max(0, c) * 4 * a; o[LFY] = -Math.max(0, -c) * 4 * a;
o[LBR] = -s * 0.25 * a; o[LFR] = s * 0.25 * a; o[AB] = 0.15 - s * 0.55 * a; o[AF] = 0.15 + s * 0.55 * a; o[HR] = 0.03 * s + (run ? 0.08 : 0); o[TR] = 0.3 * s; o[SY] = 1 + 0.03 * Math.abs(c) * a;
break;
}
case 'jump': o[SY] = 1.12; o[AB] = o[AF] = 2.5; o[LBY] = o[LFY] = -5; o[LBR] = 0.3; o[LFR] = -0.3; o[HY] = -2; o[ER] = -0.3; break;
case 'fall': o[SY] = 1.04; o[AB] = 2 + 0.3 * Math.sin(t * 14); o[AF] = 2 + 0.3 * Math.sin(t * 14 + 1); o[LBY] = o[LFY] = -2; o[LBX] = -3; o[LFX] = 3; o[ER] = 0.5; break;
case 'land': { const q = 1 - Math.min(1, t / ONE_SHOT.land); o[SY] = 1 - 0.2 * q * q; o[AB] = o[AF] = 0.7 * q; o[BY] = 3 * q; break; }
case 'hurt': o[HR] = -0.15; o[AB] = o[AF] = 1.2; o[SY] = 0.94; o[BY] = Math.sin(t * 50) * 1.5; break;
case 'cheer': { const hop = Math.abs(Math.sin(t * PI * 2.4)); o[BY] = -hop * 14; o[SY] = 1 + (hop - 0.5) * 0.12; o[AB] = 2.6 + 0.35 * Math.sin(t * 12); o[AF] = 2.6 + 0.35 * Math.sin(t * 12 + PI); o[LBY] = o[LFY] = -hop * 3; o[TR] = 0.4 * Math.sin(t * 14); break; }
case 'think': idle(); o[HR] = 0.12; o[AF] = -2.3; o[AB] = 0.1; break;
case 'sad': o[HY] = 3; o[HR] = 0.08; o[AB] = o[AF] = -0.04; o[SY] = 0.97 + 0.01 * Math.sin(T * 1.5); o[TR] = -0.3; o[ER] = 0.35; break;
case 'sleep': o[HY] = 2; o[HR] = 0.18; o[SY] = 1 + 0.04 * Math.sin(T * 1.6); o[AB] = o[AF] = 0.05; o[ER] = 0.4; break;
case 'talk': idle(); o[HR] = 0.04 * Math.sin(T * 5); o[AF] = 0.5 + 0.3 * Math.sin(T * 3); break;
case 'wave': idle(); o[AF] = 2.5 + 0.45 * Math.sin(t * 10); o[HR] = -0.06; break;
default: idle();
}
return o;
}
function faceFor(clip, mood, T, seed) {
if (clip === 'cheer') return 'cheer'; if (clip === 'hurt') return 'hurt'; if (clip === 'sleep') return 'sleep';
if (clip === 'sad') return 'sad'; if (clip === 'think') return 'thinking';
if (clip === 'talk') return ((Math.floor(T / 0.11) * 2654435761 + seed) >>> 0) % 3 ? 'talk' : mood === 'talk' ? 'happy' : mood;
if (clip === 'fall' || clip === 'jump') return mood === 'happy' ? 'surprised' : mood;
return mood;
}
const slot = (o, name, x, y, w, h, r = 0, v = '') => { o.name = name; o.x = x; o.y = y; o.w = w; o.h = h; o.r = r; o.v = v; };
function charRig(e, t, out) {
const b = e.charB; if (!b) return 0;
const A = e.stage.atlas, G = b.G;
if (e._pose == null) { e._pose = new Float32Array(NCH); e._prev = new Float32Array(NCH); e._clipIn = e.clip; e._clipAt = t; e._from = 'idle'; e._lt = t; e._er = 0; e._erv = 0; }
if (e.clip !== e._clipIn) { e._from = e._clipIn; e._clipIn = e.clip; e._clipAt = t; }
const dt = Math.max(0, Math.min(0.05, t - e._lt)); e._lt = t;
let clip = e.clip; const ct = t - e._clipAt, spd = Math.abs(e.vx || 0);
if (ONE_SHOT[clip] && ct > ONE_SHOT[clip]) { e.state('idle'); clip = 'idle'; }
if (clip === 'idle' && e.autoClip !== false && spd > 20) clip = spd > 220 ? 'run' : 'walk';
const pose = clipPose(clip, ct, t, e._pose, spd / 120);
const bl = Math.min(1, ct / 0.12);
if (bl < 1) { const pp = clipPose(e._from, t - e._clipAt + 1, t, e._prev); for (let i = 0; i < NCH; i++) pose[i] = pp[i] + (pose[i] - pp[i]) * bl; }
const target = Math.max(-0.45, Math.min(0.45, -(e.vx || 0) / 500)) + pose[ER];
const acc = 120 * (target - e._er) - 2 * 0.5 * Math.sqrt(120) * e._erv; e._erv += acc * dt; e._er += e._erv * dt;
e.csy = pose[SY]; e.csx = 1 / Math.sqrt(pose[SY]);
e.breathe = 0;
if (t >= e.blinkAt + 0.12) e.blinkAt = t + 2 + e.rng() * 4;
const blinking = e.blinkAt <= t && t < e.blinkAt + 0.12;
let face = faceFor(clip, e.moodName || b.spec.mood, t, e.id);
if (blinking && !CLOSED[face] && face !== 'sleepy') face += '.b';
const nx = G.neck[0] - 60, ny = G.neck[1] - 150, hr = pose[HR], cr = Math.cos(hr), sr = Math.sin(hr), hdy = pose[BY] + pose[HY];
const rot = (px, py) => { const dx = px - G.neck[0], dy = py - G.neck[1]; return [nx + dx * cr - dy * sr, ny + dx * sr + dy * cr + hdy]; };
let n = 0;
const armFront = pose[AF] < -0.6 || pose[AF] > 1.9;
const parts = armFront && b.parts.includes('armF') ? b.parts.filter(p => p !== 'armF').concat('armF') : b.parts;
for (const name of parts) {
const id = b.id + ':' + name, d = A.defs.get(id), o = out[n];
if (name === 'pupilL' || name === 'pupilR') {
if (closedEyes(face, name)) continue;
const E = G.eyes[name === 'pupilL' ? 0 : 1], pd = A.defs.get(b.pupil), s = face === 'surprised' ? 0.7 : 1;
const max = Math.max(0, Math.min(G.eyeD * 0.13, G.eyeD * (0.48 - (G.ring || 0.22)) - b.pr * s)), lx = e.lookX, ly = (face === 'thinking' ? -0.8 : e.lookY);
const ll = Math.hypot(lx, ly) || 1, kx = Math.min(1, ll) * max / ll;
const [px, py] = rot(E[0] + lx * kx, E[1] + ly * kx);
slot(o, b.pupil, px, py, pd.w * s, pd.h * s); n++; continue;
}
if (!d) continue;
const pvx = d.ax * d.w, pvy = d.ay * d.h;
let x, y, r = 0, v = '';
const P0 = pivotOf(G, name);
switch (name) {
case 'body': case 'pack': x = 0; y = P0[1] - 150 + pose[BY]; break;
case 'head': case 'hairB': x = nx; y = ny + hdy; r = hr; break;
case 'face': x = nx; y = ny + hdy; r = hr; v = face; break;
case 'ears': [x, y] = rot(P0[0], P0[1]); r = hr + e._er; break;
case 'armB': x = P0[0] - 60; y = P0[1] - 150 + pose[BY]; r = pose[AB]; break;
case 'armF': x = P0[0] - 60; y = P0[1] - 150 + pose[BY]; r = -pose[AF]; break;
case 'legB': x = P0[0] - 60 + pose[LBX]; y = P0[1] - 150 + pose[LBY]; r = pose[LBR]; break;
case 'legF': x = P0[0] - 60 + pose[LFX]; y = P0[1] - 150 + pose[LFY]; r = pose[LFR]; break;
case 'tail': x = P0[0] - 60; y = P0[1] - 150 + pose[BY]; r = pose[TR] - e._er * 0.6; break;
case 'wingL': case 'wingR': { [x, y] = rot(P0[0], P0[1]); const fl = 0.35 + 0.35 * Math.sin(t * (e.stage.reduced ? 8 : 38) + (name === 'wingL' ? 0 : 0.4)); r = name === 'wingL' ? -fl : fl; break; }
default: x = pvx; y = pvy;
}
slot(o, id, x, y, d.w, d.h, r, v); n++;
}
return n;
}
function pivotOf(G, name) {
switch (name) {
case 'body': case 'pack': return [60, G.body ? G.body[1] : 150];
case 'ears': return G.ears; case 'tail': return G.tail;
case 'armB': return G.sh[0]; case 'armF': return G.sh[1];
case 'legB': return G.hips[0]; case 'legF': return G.hips[1];
case 'wingL': return G.wings[0]; case 'wingR': return G.wings[1];
default: return G.neck;
}
}
charRig.own = true;
return { CH, CLIPS, CW, FACES, capsule, charRig, charSpec, clipPose, defineChar, faceFor, hairFor };
})();
const __m_text = (function () {
const { INK, CREAM, outline } = __m_tokens;
const { bucket, UNLIT } = __m_atlas;
function fontStack(lang) {
const base = '"Bricolage Grotesque", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
const l = String(lang || 'en');
const kitFirst = more => base.replace('"Bricolage Grotesque", ', '"Bricolage Grotesque", ' + more + ', ');
if (l.startsWith('ar')) return kitFirst('"Noto Sans Arabic", Tahoma');
if (l.startsWith('he')) return kitFirst('Rubik, "Arial Hebrew", Arial');
if (l.startsWith('ja')) return kitFirst('"Hiragino Maru Gothic ProN", "Noto Sans JP"');
if (l.startsWith('zh')) return kitFirst('"PingFang TC", "Microsoft JhengHei", "Noto Sans TC"');
if (l.startsWith('ru')) return 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
return base;
}
function textSprite(atlas, str, o = {}) {
const px = bucket(o.px || 24), weight = o.weight || 800, color = o.color || INK, dir = o.dir || 'ltr';
const key = 'T|' + str + '|' + px + '|' + weight + '|' + color + '|' + dir + '|' + (o.rim === false ? 0 : 1) + '|' + (o.lang || '');
const have = atlas.get(key); if (have >= 0) return have;
const font = `${weight} ${px}px ${fontStack(o.lang)}`;
const m = atlas.doc.createElement('canvas').getContext('2d'); m.font = font;
let w = Math.ceil(m.measureText(str).width);
const maxW = o.max ? Math.ceil(o.max) : 0;
let scale = 1;
if (maxW && w > maxW) scale = Math.max(0.7, maxW / w);
if (maxW && w * scale > maxW && typeof console !== 'undefined') console.warn('[oomba] text overflows', str);
const lw = outline(px * 1.4), rim = o.rim === false ? 0 : Math.max(2, lw * 0.45);
const pad = Math.ceil(lw + rim + 2);
const W = Math.ceil(w * scale) + pad * 2, H = Math.ceil(px * 1.35) + pad * 2;
return atlas.bake(key, W, H, (ctx, k) => {
ctx.font = font; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
try { ctx.direction = dir; } catch (e) {  }
ctx.translate(W / 2, H / 2); ctx.scale(scale, 1);
ctx.lineJoin = 'round';
if (rim) { ctx.strokeStyle = CREAM; ctx.lineWidth = (lw + rim * 2) / scale; ctx.strokeText(str, 0, 0); }
ctx.strokeStyle = INK; ctx.lineWidth = lw / scale; ctx.strokeText(str, 0, 0);
ctx.fillStyle = color; ctx.fillText(str, 0, 0);
const mk = k.mask(); mk.font = font; mk.textBaseline = 'middle'; mk.textAlign = 'center'; mk.translate(W / 2, H / 2); mk.scale(scale, 1);
mk.strokeStyle = UNLIT; mk.lineWidth = (lw + rim * 2) / scale; mk.lineJoin = 'round'; mk.strokeText(str, 0, 0); mk.fillStyle = UNLIT; mk.fillText(str, 0, 0);
});
}
return { fontStack, textSprite };
})();
const __m_props = (function () {
const { PALETTE, INK, CREAM } = __m_tokens;
const { sticker, detail, sparkPath, ellipsePath, rrectPath, glowMask, lines } = __m_grammar;
const { capsule } = __m_chars;
const { fontStack } = __m_text;
const { adjustHex } = __m_color;
const P = PALETTE, TAU = Math.PI * 2;
const circ = (x, y, r) => ellipsePath(x, y, r, r);
const poly = (pts, close = true) => { const p = new Path2D(); pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); if (close) p.closePath(); return p; };
const rpoly = (pts, r) => { const p = new Path2D(), n = pts.length; const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; const s = mid(pts[n - 1], pts[0]); p.moveTo(s[0], s[1]); for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; p.arcTo(a[0], a[1], b[0], b[1], r); } p.closePath(); return p; };
const ngon = (cx, cy, R, n, rot = -Math.PI / 2) => Array.from({ length: n }, (_, i) => [cx + Math.cos(rot + i * TAU / n) * R, cy + Math.sin(rot + i * TAU / n) * R]);
const S = (ctx, k, p, fill, shade, o = {}) => sticker(ctx, k, p, Object.assign({ fill, shade, shadeOff: o.off || 4 }, o));
const F = (ctx, k, p, fill, line = 0.7) => sticker(ctx, k, p, { fill, rim: false, line });
const hue = (v, d) => { const h = String(v || '').split(':')[1]; return P[h] ? h : d; };
const head = v => String(v || '').split(':')[0];
function text(ctx, k, s, x, y, size, color = INK, weight = 800) {
ctx.font = `${weight} ${size}px ${fontStack('en')}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
const w = ctx.measureText(s).width, max = size * 1.6; if (w > max) { ctx.save(); ctx.translate(x, y); ctx.scale(max / w, 1); x = 0; y = 0; }
ctx.fillStyle = color; ctx.fillText(s, x, y + size * 0.04);
if (w > max) ctx.restore();
}
const PROP_GROUPS = {
treasure: ['spark', 'coin', 'gem', 'heart', 'key', 'chest', 'medal', 'trophy', 'gift'],
world: ['crate', 'platform', 'spring', 'flag', 'gate', 'sign', 'lantern', 'door', 'ladder', 'block'],
learning: ['tile', 'pie', 'clock', 'dice', 'shape', 'book', 'pencil', 'globe', 'bulb', 'magnifier'],
food: ['apple', 'banana', 'carrot', 'cookie', 'melon', 'cheese', 'cupcake', 'grapes'],
vehicles: ['car', 'bus', 'rocket', 'boat', 'plane'],
nature: ['tree', 'bush', 'flower', 'rock', 'mushroom', 'cloud', 'leaf', 'shell', 'cactus', 'snowman', 'log', 'grass'],
hazards: ['spikes', 'thorn', 'spikeball'],
};
const REWARD_PROPS = ['spark', 'coin', 'key', 'chest', 'medal', 'trophy', 'lantern', 'bulb'];
const SHAPES = { circle: 'sky', square: 'mint', triangle: 'grape', rectangle: 'peach', pentagon: 'coral', hexagon: 'sky', diamond: 'grape', oval: 'mint', star: 'peach', heart: 'coral' };
const PROP_VARIANTS = { tile: ['7', 'A', '3:grape', 'b:coral', '+:peach'], pie: ['1/2', '1/3', '3/4', '5/8'], clock: ['3:00', '9:30', '12:15'], dice: ['1', '2', '3', '4', '5', '6'], shape: Object.keys(SHAPES), chest: ['', 'open'], gate: ['', 'open'], book: ['', 'open'], rocket: ['', 'go'], tree: ['', 'pine', 'palm', 'snow'], flower: ['', 'b'], sign: ['', 'Go!', '→'] };
function defineProps(atlas) {
const def = (name, w, h, draw, ax = 0.5, ay = 0.5, o = {}) => atlas.define(name, Object.assign({ w, h, ax, ay, draw }, o));
def('coin', 60, 60, (ctx, k) => {
S(ctx, k, circ(30, 30, 24), P.spark[2], P.spark[3], { gloss: [21, 20, 6, 4, -0.7], unlit: true, off: 5 });
const r = circ(30, 30, 16); detail(ctx, k, r, 1); const s = sparkPath(30, 30, 10, 0.22); ctx.fillStyle = P.spark[0]; ctx.fill(s); glowMask(k, s);
});
def('gem', 60, 60, (ctx, k) => {
const g = rpoly([[16, 14], [44, 14], [54, 26], [30, 54], [6, 26]], 3); S(ctx, k, g, P.grape[1], P.grape[2], { gloss: [22, 20, 5, 3, -0.4] });
const f = poly([[6, 26], [54, 26]], false); detail(ctx, k, f, 1); const f2 = poly([[22, 14], [30, 26], [38, 14]], false); detail(ctx, k, f2, 1); const f3 = poly([[30, 26], [30, 52]], false); detail(ctx, k, f3, 0.8);
});
def('key', 70, 40, (ctx, k) => {
const ring = new Path2D(); ring.arc(18, 20, 13, 0, TAU); ring.moveTo(24, 20); ring.arc(18, 20, 6, 0, TAU, true);
const shaft = rrectPath(26, 16, 38, 8, 3), t1 = rrectPath(50, 20, 6, 12, 2), t2 = rrectPath(59, 20, 5, 9, 2);
for (const p of [t1, t2, shaft]) S(ctx, k, p, P.spark[2], P.spark[3], { off: 2, unlit: true });
S(ctx, k, ring, P.spark[2], P.spark[3], { off: 3, gloss: [11, 12, 3, 2, -0.6], unlit: true });
});
def('chest', 84, 70, (ctx, k) => {
const open = k.v === 'open';
const box = rrectPath(8, 30, 68, 36, 6);
if (open) { const inside = rrectPath(12, 22, 60, 16, 5); F(ctx, k, inside, P.cocoa[3]); const glow = sparkPath(42, 22, 16, 0.2); ctx.fillStyle = P.spark[1]; ctx.fill(glow); glowMask(k, glow); }
const lid = new Path2D(); if (open) { lid.moveTo(10, 24); lid.lineTo(74, 24); lid.lineTo(70, 6); lid.quadraticCurveTo(42, -2, 14, 6); lid.closePath(); } else { lid.moveTo(8, 34); lid.lineTo(76, 34); lid.lineTo(76, 22); lid.quadraticCurveTo(42, 2, 8, 22); lid.closePath(); }
S(ctx, k, box, P.cocoa[2], P.cocoa[3], { off: 5 }); S(ctx, k, lid, P.cocoa[1], P.cocoa[2], { gloss: [24, open ? 10 : 18, 8, 3, -0.2] });
for (const x of [20, 64]) F(ctx, k, rrectPath(x - 4, 30, 8, 36, 2), P.stone[1], 0.6);
if (!open) { const lock = rrectPath(36, 28, 12, 14, 3); S(ctx, k, lock, P.spark[2], P.spark[3], { off: 2, rim: false, unlit: true }); }
}, 0.5, 1);
def('medal', 60, 76, (ctx, k) => {
const rib1 = poly([[18, 2], [30, 2], [36, 34], [26, 38]]), rib2 = poly([[42, 2], [30, 2], [24, 34], [34, 38]]);
S(ctx, k, rib1, P.sky[2], P.sky[3], { off: 2 }); S(ctx, k, rib2, P.coral[2], P.coral[3], { off: 2 });
S(ctx, k, circ(30, 50, 20), P.spark[2], P.spark[3], { gloss: [23, 42, 5, 3, -0.6], unlit: true });
const s = sparkPath(30, 50, 10, 0.22); ctx.fillStyle = P.spark[0]; ctx.fill(s); glowMask(k, s);
});
def('trophy', 70, 80, (ctx, k) => {
const handles = new Path2D(); handles.arc(14, 24, 9, Math.PI * 0.5, Math.PI * 1.6); handles.moveTo(56, 15); handles.arc(56, 24, 9, -Math.PI * 0.6, Math.PI * 0.5);
ctx.strokeStyle = CREAM; ctx.lineWidth = lines(k).w * 3 + lines(k).rim * 2; ctx.lineCap = 'round'; ctx.stroke(handles);
ctx.strokeStyle = INK; ctx.lineWidth = lines(k).w * 3; ctx.stroke(handles); ctx.strokeStyle = P.spark[2]; ctx.lineWidth = lines(k).w * 1.4; ctx.stroke(handles);
const cup = new Path2D(); cup.moveTo(12, 8); cup.lineTo(58, 8); cup.bezierCurveTo(58, 34, 48, 46, 35, 46); cup.bezierCurveTo(22, 46, 12, 34, 12, 8); cup.closePath();
const stem = rrectPath(30, 44, 10, 14, 3), base = rrectPath(16, 58, 38, 14, 5);
S(ctx, k, base, P.stone[2], P.stone[3]); S(ctx, k, stem, P.spark[3], P.spark[3], { rim: false }); S(ctx, k, cup, P.spark[2], P.spark[3], { gloss: [24, 18, 5, 8, -0.2], unlit: true });
const s = sparkPath(35, 24, 9, 0.22); ctx.fillStyle = P.spark[0]; ctx.fill(s); glowMask(k, s);
}, 0.5, 1);
def('gift', 64, 64, (ctx, k) => {
const box = rrectPath(8, 24, 48, 36, 5), lid = rrectPath(4, 16, 56, 14, 5);
S(ctx, k, box, P.coral[2], P.coral[3]); S(ctx, k, lid, P.coral[1], P.coral[2], { gloss: [16, 20, 6, 2.5, 0] });
F(ctx, k, rrectPath(27, 16, 10, 44, 2), P.mint[2], 0.6);
for (const s of [-1, 1]) { const b = ellipsePath(32 + s * 10, 11, 10, 6, s * 0.5); S(ctx, k, b, P.mint[2], P.mint[3], { rim: false, off: 2 }); }
F(ctx, k, circ(32, 14, 5), P.mint[3], 0.6);
}, 0.5, 1);
def('crate', 64, 64, (ctx, k) => {
const b = rrectPath(4, 4, 56, 56, 7); S(ctx, k, b, P.cocoa[1], P.cocoa[2], { off: 5, gloss: [16, 14, 6, 3, -0.3] });
const inner = rrectPath(13, 13, 38, 38, 4); detail(ctx, k, inner, 1.2);
const x = poly([[15, 15], [49, 49]], false); detail(ctx, k, x, 1.6);
}, 0.5, 1);
def('platform', 160, 44, (ctx, k) => {
const body = new Path2D(); body.moveTo(8, 12); body.lineTo(152, 12); body.quadraticCurveTo(150, 34, 120, 38); body.quadraticCurveTo(80, 44, 40, 38); body.quadraticCurveTo(10, 34, 8, 12); body.closePath();
S(ctx, k, body, P.cocoa[2], P.cocoa[3], { off: 5 });
const grass = rrectPath(2, 4, 156, 16, 8); S(ctx, k, grass, P.mint[2], P.mint[3], { off: 3, gloss: [30, 9, 14, 2.5, 0] });
for (const x of [36, 74, 118]) F(ctx, k, circ(x, 30, 2.6), P.cocoa[1], 0.5);
}, 0.5, 0);
def('spring', 60, 64, (ctx, k) => {
const base = rrectPath(8, 52, 44, 10, 4); S(ctx, k, base, P.stone[2], P.stone[3], { off: 2 });
const coil = new Path2D(); coil.moveTo(16, 50); for (let i = 0; i < 4; i++) { coil.lineTo(44, 44 - i * 9); coil.lineTo(16, 40 - i * 9); }
ctx.strokeStyle = INK; ctx.lineWidth = lines(k).w * 2.2; ctx.lineJoin = 'round'; ctx.stroke(coil); ctx.strokeStyle = P.stone[1]; ctx.lineWidth = lines(k).w; ctx.stroke(coil);
const pad = rrectPath(6, 6, 48, 12, 6); S(ctx, k, pad, P.sky[2], P.sky[3], { off: 3, gloss: [18, 9, 8, 2, 0] });
}, 0.5, 1);
def('flag', 64, 124, (ctx, k) => {
const pole = rrectPath(10, 6, 7, 116, 3.5); S(ctx, k, pole, P.stone[1], P.stone[2], { off: 2 });
const f = new Path2D(); f.moveTo(17, 12); f.quadraticCurveTo(40, 4, 60, 16); f.quadraticCurveTo(48, 28, 60, 42); f.quadraticCurveTo(40, 32, 17, 44); f.closePath();
S(ctx, k, f, P.mint[2], P.mint[3], { gloss: [30, 16, 8, 3, -0.2] });
S(ctx, k, circ(13.5, 6, 5), P.cream[0], P.stone[1], { off: 2, rim: false });
}, 0.2, 1);
def('gate', 110, 116, (ctx, k) => {
const open = k.v === 'open';
const arch = new Path2D(); arch.moveTo(4, 114); arch.lineTo(4, 36); arch.quadraticCurveTo(55, -8, 106, 36); arch.lineTo(106, 114); arch.lineTo(88, 114); arch.lineTo(88, 42); arch.quadraticCurveTo(55, 10, 22, 42); arch.lineTo(22, 114); arch.closePath();
if (!open) for (let i = 0; i < 4; i++) { const x = 32 + i * 15.3; const bar = rrectPath(x - 3.5, 26 + Math.abs(i - 1.5) * 4, 7, 88 - Math.abs(i - 1.5) * 4, 3.5); S(ctx, k, bar, P.sky[2], P.sky[3], { off: 2, rim: false }); }
S(ctx, k, arch, P.stone[1], P.stone[2], { off: 5, gloss: [18, 34, 5, 8, 0.5] });
const lock = circ(55, 26, 8); S(ctx, k, lock, open ? P.mint[2] : P.grape[2], open ? P.mint[3] : P.grape[3], { off: 2, emissive: true });
}, 0.5, 1);
def('sign', 76, 84, (ctx, k) => {
const post = rrectPath(33, 36, 10, 46, 3); S(ctx, k, post, P.cocoa[2], P.cocoa[3], { off: 2 });
const t = head(k.v), arrow = t === '→' || t === '←';
const board = arrow ? poly([[4, 8], [58, 8], [72, 23], [58, 40], [4, 40]]) : rrectPath(4, 6, 68, 36, 8);
S(ctx, k, board, P.cocoa[1], P.cocoa[2], { off: 3, gloss: [16, 12, 7, 2.5, 0] });
if (t && !arrow) text(ctx, k, t, 38, 24, 18); else { const a = poly([[18, 24], [50, 24]], false); detail(ctx, k, a, 2.4); const h = poly([[42, 16], [52, 24], [42, 32]], false); detail(ctx, k, h, 2.4); }
}, 0.5, 1, { text: true });
def('door', 80, 120, (ctx, k) => {
const d = new Path2D(); d.moveTo(8, 118); d.lineTo(8, 40); d.quadraticCurveTo(8, 4, 40, 4); d.quadraticCurveTo(72, 4, 72, 40); d.lineTo(72, 118); d.closePath();
S(ctx, k, d, P.cocoa[2], P.cocoa[3], { off: 6, gloss: [22, 24, 6, 9, 0.3] });
for (const x of [28, 52]) { const l = poly([[x, 22], [x, 112]], false); detail(ctx, k, l, 0.9); }
S(ctx, k, circ(60, 70, 4.5), P.stone[1], P.stone[2], { off: 1.5, rim: false });
const win = circ(40, 32, 9); S(ctx, k, win, P.spark[1], P.peach[1], { off: 2, rim: false, emissive: true });
}, 0.5, 1);
def('ladder', 50, 124, (ctx, k) => {
for (let i = 0; i < 5; i++) { const r = rrectPath(8, 14 + i * 24, 34, 7, 3); S(ctx, k, r, P.cocoa[1], P.cocoa[2], { off: 2, rim: false }); }
for (const x of [6, 38]) { const s = rrectPath(x, 2, 8, 120, 4); S(ctx, k, s, P.cocoa[2], P.cocoa[3], { off: 2 }); }
}, 0.5, 1);
def('block', 64, 64, (ctx, k) => {
const c = hue(k.v, 'sky'), R = P[c];
const b = rrectPath(4, 4, 56, 56, 13); S(ctx, k, b, R[2], R[3], { off: 6, gloss: [17, 15, 7, 4, -0.5] });
const inner = rrectPath(14, 14, 36, 36, 9); detail(ctx, k, inner, 0.9);
}, 0.5, 1);
def('tile', 64, 64, (ctx, k) => {
const t = head(k.v) || '7', c = hue(k.v, 'sky'), R = P[c];
const b = rrectPath(4, 4, 56, 56, 13); S(ctx, k, b, R[2], R[3], { off: 6 });
const face = rrectPath(10, 8, 44, 44, 10); F(ctx, k, face, CREAM, 0.6);
text(ctx, k, t, 32, 31, 32, INK);
}, 0.5, 0.5, { text: true });
def('pie', 64, 64, (ctx, k) => {
const m = /^(\d+)\/(\d+)$/.exec(String(k.v || '1/2')) || [0, 1, 2];
const den = Math.max(1, Math.min(16, +m[2])), num = Math.max(0, Math.min(den, +m[1]));
const disc = circ(32, 32, 26); S(ctx, k, disc, CREAM, P.cream[3], { off: 4 });
for (let i = 0; i < num; i++) { const a0 = -Math.PI / 2 + i * TAU / den, a1 = a0 + TAU / den; const s = new Path2D(); s.moveTo(32, 32); s.arc(32, 32, 26, a0, a1); s.closePath(); ctx.save(); ctx.translate(-0.6, -1); ctx.fillStyle = P.peach[2]; ctx.fill(s); ctx.restore(); }
for (let i = 0; i < den; i++) { const a = -Math.PI / 2 + i * TAU / den; const l = poly([[32, 32], [32 + Math.cos(a) * 26, 32 + Math.sin(a) * 26]], false); detail(ctx, k, l, 1); }
ctx.strokeStyle = INK; ctx.lineWidth = lines(k).w; ctx.stroke(disc);
});
def('clock', 64, 64, (ctx, k) => {
const m = /^(\d{1,2}):(\d{2})$/.exec(String(k.v || '3:00')) || [0, 3, 0];
const hh = (+m[1]) % 12, mm = Math.min(59, +m[2]);
S(ctx, k, circ(32, 32, 28), P.sky[2], P.sky[3], { off: 4 });
F(ctx, k, circ(32, 32, 21), CREAM, 0.6);
for (let i = 0; i < 12; i++) { const a = i * TAU / 12, r0 = i % 3 ? 18 : 15.5; const l = poly([[32 + Math.sin(a) * r0, 32 - Math.cos(a) * r0], [32 + Math.sin(a) * 19.5, 32 - Math.cos(a) * 19.5]], false); detail(ctx, k, l, i % 3 ? 0.7 : 1.3); }
const ha = (hh + mm / 60) * TAU / 12, ma = mm * TAU / 60;
const hand = (a, len, w) => { const l = poly([[32, 32], [32 + Math.sin(a) * len, 32 - Math.cos(a) * len]], false); detail(ctx, k, l, w); };
hand(ha, 10, 2.4); hand(ma, 15, 1.6);
F(ctx, k, circ(32, 32, 2.6), P.coral[2], 0.5);
});
def('dice', 60, 60, (ctx, k) => {
const n = Math.max(1, Math.min(6, +k.v || 5));
const b = rrectPath(5, 5, 50, 50, 12); S(ctx, k, b, CREAM, P.cream[3], { off: 5, gloss: [16, 15, 6, 3, -0.4] });
const at = { 1: [[30, 30]], 2: [[19, 19], [41, 41]], 3: [[18, 18], [30, 30], [42, 42]], 4: [[19, 19], [41, 19], [19, 41], [41, 41]], 5: [[18, 18], [42, 18], [30, 30], [18, 42], [42, 42]], 6: [[19, 17], [41, 17], [19, 30], [41, 30], [19, 43], [41, 43]] }[n];
ctx.fillStyle = INK; for (const [x, y] of at) { ctx.beginPath(); ctx.arc(x, y, 4.6, 0, TAU); ctx.fill(); }
});
def('shape', 64, 64, (ctx, k) => {
const name = head(k.v) || 'circle', c = hue(k.v, SHAPES[name] || 'sky'), R = P[c];
let p;
switch (name) {
case 'square': p = rrectPath(9, 9, 46, 46, 6); break;
case 'rectangle': p = rrectPath(4, 16, 56, 32, 6); break;
case 'triangle': p = rpoly([[32, 6], [59, 54], [5, 54]], 5); break;
case 'pentagon': p = rpoly(ngon(32, 34, 27, 5), 5); break;
case 'hexagon': p = rpoly(ngon(32, 32, 27, 6, 0), 5); break;
case 'diamond': p = rpoly([[32, 4], [56, 32], [32, 60], [8, 32]], 5); break;
case 'oval': p = ellipsePath(32, 32, 28, 19); break;
case 'star': { const pts = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 12 : 28; pts.push([32 + Math.cos(a) * r, 34 + Math.sin(a) * r]); } p = rpoly(pts, 3); break; }
case 'heart': { p = new Path2D(); p.moveTo(32, 56); p.bezierCurveTo(6, 40, 4, 22, 14, 13); p.bezierCurveTo(22, 6, 30, 10, 32, 18); p.bezierCurveTo(34, 10, 42, 6, 50, 13); p.bezierCurveTo(60, 22, 58, 40, 32, 56); p.closePath(); break; }
default: p = circ(32, 32, 26);
}
S(ctx, k, p, R[2], R[3], { off: 5, gloss: [22, 20, 6, 4, -0.6] });
});
def('book', 72, 60, (ctx, k) => {
if (k.v === 'open') {
for (const s of [-1, 1]) { const pg = new Path2D(); pg.moveTo(36, 14); pg.quadraticCurveTo(36 + s * 16, 6, 36 + s * 33, 10); pg.lineTo(36 + s * 33, 50); pg.quadraticCurveTo(36 + s * 16, 46, 36, 54); pg.closePath(); S(ctx, k, pg, CREAM, P.cream[3], { off: 2 }); for (let i = 0; i < 3; i++) { const l = new Path2D(); l.moveTo(36 + s * 8, 22 + i * 9); l.quadraticCurveTo(36 + s * 16, 18 + i * 9, 36 + s * 27, 20 + i * 9); detail(ctx, k, l, 0.6); } }
return;
}
const pages = rrectPath(12, 12, 54, 42, 4); S(ctx, k, pages, CREAM, P.cream[3], { off: 2 });
for (let i = 0; i < 3; i++) { const l = poly([[50, 18 + i * 9], [64, 18 + i * 9]], false); detail(ctx, k, l, 0.5); }
const cover = rrectPath(6, 6, 50, 46, 6); S(ctx, k, cover, P.sky[2], P.sky[3], { gloss: [18, 14, 7, 3, -0.3] });
F(ctx, k, rrectPath(16, 18, 30, 10, 4), CREAM, 0.6);
const mark = poly([[40, 50], [40, 60], [44, 56], [48, 60], [48, 50]]); S(ctx, k, mark, P.coral[2], P.coral[3], { rim: false, off: 1 });
}, 0.5, 0.5);
def('pencil', 100, 28, (ctx, k) => {
const body = rrectPath(22, 5, 62, 18, 3); S(ctx, k, body, P.sky[2], P.sky[3], { off: 3, gloss: [40, 9, 14, 2, 0] });
const tip = poly([[22, 5], [4, 14], [22, 23]]); S(ctx, k, tip, P.peach[1], P.peach[2], { off: 2 });
const lead = poly([[10, 11], [4, 14], [10, 17]]); F(ctx, k, lead, INK, 0.5);
S(ctx, k, rrectPath(82, 4, 8, 20, 2), P.stone[1], P.stone[2], { off: 1, rim: false }); S(ctx, k, rrectPath(88, 4, 9, 20, 4), P.coral[1], P.coral[2], { off: 1 });
});
def('globe', 64, 76, (ctx, k) => {
const stand = new Path2D(); stand.arc(32, 32, 30, Math.PI * 0.15, Math.PI * 0.85); ctx.strokeStyle = INK; ctx.lineWidth = lines(k).w * 2.2; ctx.lineCap = 'round'; ctx.stroke(stand); ctx.strokeStyle = P.stone[1]; ctx.lineWidth = lines(k).w; ctx.stroke(stand);
S(ctx, k, rrectPath(16, 66, 32, 8, 4), P.cocoa[2], P.cocoa[3], { off: 2 }); S(ctx, k, rrectPath(29, 58, 6, 10, 2), P.cocoa[2], P.cocoa[3], { rim: false, off: 1 });
const ball = circ(32, 32, 24); S(ctx, k, ball, P.sky[2], P.sky[3], { off: 5 });
ctx.save(); ctx.clip(ball); for (const [x, y, rx, ry, r] of [[22, 22, 10, 7, 0.5], [40, 40, 9, 11, -0.3], [44, 18, 5, 4, 0]]) F(ctx, k, ellipsePath(x, y, rx, ry, r), P.mint[2], 0.6); ctx.restore();
ctx.save(); ctx.clip(ball); ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(22, 18, 6, 4, -0.6, 0, TAU); ctx.fill(); ctx.restore();
}, 0.5, 1);
def('bulb', 52, 76, (ctx, k) => {
const g = new Path2D(); g.moveTo(16, 50); g.bezierCurveTo(4, 40, 2, 26, 8, 16); g.bezierCurveTo(14, 4, 38, 4, 44, 16); g.bezierCurveTo(50, 26, 48, 40, 36, 50); g.closePath();
S(ctx, k, g, P.spark[1], P.peach[1], { off: 4, gloss: [16, 18, 5, 7, -0.4], emissive: true });
const fil = new Path2D(); fil.moveTo(20, 48); fil.lineTo(20, 32); fil.quadraticCurveTo(26, 24, 32, 32); fil.lineTo(32, 48); detail(ctx, k, fil, 1);
for (let i = 0; i < 3; i++) S(ctx, k, rrectPath(15, 50 + i * 7, 22, 7, 3), P.stone[1], P.stone[2], { off: 1.5, rim: i === 2 });
}, 0.5, 1);
def('magnifier', 70, 70, (ctx, k) => {
const h = capsule(42, 42, 62, 62, 6); S(ctx, k, h, P.cocoa[2], P.cocoa[3], { off: 2 });
const ring = new Path2D(); ring.arc(28, 28, 22, 0, TAU); ring.moveTo(45, 28); ring.arc(28, 28, 17, 0, TAU, true);
const lens = circ(28, 28, 17); F(ctx, k, lens, P.sky[0], 0.01); ctx.save(); ctx.clip(lens); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.ellipse(21, 20, 6, 3.5, -0.7, 0, TAU); ctx.fill(); ctx.restore();
S(ctx, k, ring, P.grape[2], P.grape[3], { off: 2 });
});
def('apple', 56, 60, (ctx, k) => {
const a = new Path2D(); a.moveTo(28, 16); a.bezierCurveTo(40, 8, 54, 16, 52, 34); a.bezierCurveTo(50, 52, 38, 58, 28, 54); a.bezierCurveTo(18, 58, 6, 52, 4, 34); a.bezierCurveTo(2, 16, 16, 8, 28, 16); a.closePath();
const stem = capsule(28, 16, 31, 5, 2.4), leaf = ellipsePath(39, 9, 8, 4, -0.4);
S(ctx, k, stem, P.cocoa[3], P.cocoa[3], { off: 1 }); S(ctx, k, leaf, P.mint[2], P.mint[3], { off: 2 });
S(ctx, k, a, P.coral[2], P.coral[3], { off: 5, gloss: [16, 24, 5, 7, 0.3] });
});
def('banana', 70, 50, (ctx, k) => {
const b = new Path2D(); b.moveTo(8, 12); b.quadraticCurveTo(14, 44, 46, 44); b.quadraticCurveTo(62, 44, 66, 36); b.quadraticCurveTo(46, 36, 30, 26); b.quadraticCurveTo(18, 18, 16, 8); b.closePath();
S(ctx, k, b, P.spark[1], P.peach[1], { off: 4 }); F(ctx, k, rrectPath(9, 4, 8, 9, 3), P.cocoa[3], 0.6);
});
def('carrot', 40, 76, (ctx, k) => {
for (const [x, r] of [[16, -0.4], [20, 0], [24, 0.4]]) { const l = ellipsePath(x + r * 10, 10, 4, 10, r); S(ctx, k, l, P.mint[2], P.mint[3], { off: 2 }); }
const c = new Path2D(); c.moveTo(8, 20); c.quadraticCurveTo(20, 14, 32, 20); c.quadraticCurveTo(28, 50, 20, 72); c.quadraticCurveTo(12, 50, 8, 20); c.closePath();
S(ctx, k, c, P.peach[2], P.peach[3], { off: 4, gloss: [14, 28, 3, 6, 0.2] });
for (const y of [32, 44, 54]) { const l = poly([[14 + (y - 32) * 0.12, y], [20, y + 1]], false); detail(ctx, k, l, 0.8); }
});
def('cookie', 56, 56, (ctx, k) => {
const c = new Path2D(); for (let i = 0; i <= 24; i++) { const a = i * TAU / 24, r = 23 + (i % 3 === 0 ? -1.5 : 0.6); i ? c.lineTo(28 + Math.cos(a) * r, 28 + Math.sin(a) * r) : c.moveTo(28 + r, 28); } c.closePath();
S(ctx, k, c, P.cocoa[1], P.cocoa[2], { off: 4, gloss: [19, 18, 5, 3, -0.6] });
for (const [x, y] of [[20, 22], [34, 18], [36, 34], [22, 38], [28, 28]]) F(ctx, k, ellipsePath(x, y, 3.6, 3, x * 0.1), P.cocoa[3], 0.5);
});
def('melon', 70, 48, (ctx, k) => {
const rind = new Path2D(); rind.moveTo(4, 8); rind.lineTo(66, 8); rind.arc(35, 8, 31, 0, Math.PI); rind.closePath();
S(ctx, k, rind, P.mint[2], P.mint[3], { off: 3 });
const flesh = new Path2D(); flesh.moveTo(9, 8); flesh.lineTo(61, 8); flesh.arc(35, 8, 26, 0, Math.PI); flesh.closePath(); F(ctx, k, flesh, P.coral[1], 0.6);
ctx.fillStyle = INK; for (const [x, y] of [[22, 16], [35, 22], [48, 16], [29, 28], [41, 28]]) { ctx.beginPath(); ctx.ellipse(x, y, 1.8, 3, 0.3, 0, TAU); ctx.fill(); }
});
def('cheese', 64, 50, (ctx, k) => {
const w = poly([[4, 46], [60, 46], [60, 22], [4, 30]]); S(ctx, k, w, P.spark[1], P.peach[1], { off: 3 });
const top = poly([[4, 30], [60, 22], [42, 6]]); S(ctx, k, top, P.spark[0], P.spark[1], { off: 2 });
for (const [x, y, r] of [[18, 38, 4], [40, 34, 5], [52, 40, 3]]) F(ctx, k, circ(x, y, r), P.peach[1], 0.6);
});
def('cupcake', 60, 72, (ctx, k) => {
const cup = poly([[12, 38], [48, 38], [43, 68], [17, 68]]); S(ctx, k, cup, P.sky[2], P.sky[3], { off: 3 });
for (const x of [22, 30, 38]) { const l = poly([[x, 40], [x - (x - 30) * 0.15, 66]], false); detail(ctx, k, l, 0.7); }
const fr = new Path2D(); fr.moveTo(8, 40); fr.quadraticCurveTo(4, 26, 18, 24); fr.quadraticCurveTo(22, 10, 32, 14); fr.quadraticCurveTo(46, 12, 46, 24); fr.quadraticCurveTo(58, 28, 52, 40); fr.closePath();
S(ctx, k, fr, CREAM, P.cream[3], { off: 3, gloss: [20, 22, 6, 3, -0.3] });
S(ctx, k, circ(32, 10, 6), P.coral[2], P.coral[3], { off: 2 });
for (const [x, y, c] of [[18, 32, P.mint[2]], [30, 26, P.grape[1]], [42, 32, P.sky[2]]]) F(ctx, k, rrectPath(x, y, 6, 2.6, 1.3), c, 0.4);
}, 0.5, 1);
def('grapes', 56, 70, (ctx, k) => {
const stem = capsule(28, 4, 30, 14, 2.2); S(ctx, k, stem, P.cocoa[3], P.cocoa[3], { off: 1 });
S(ctx, k, ellipsePath(38, 10, 8, 4, -0.3), P.mint[2], P.mint[3], { off: 2 });
for (const [x, y] of [[18, 22], [30, 20], [42, 22], [24, 34], [36, 34], [30, 46], [18, 44], [42, 44], [30, 58]]) S(ctx, k, circ(x, y, 7.5), P.grape[2], P.grape[3], { off: 2, gloss: [x - 2.5, y - 3, 1.8, 1.2, 0] });
}, 0.5, 0.5);
const wheel = (ctx, k, x, y, r) => { S(ctx, k, circ(x, y, r), INK, INK, { off: 0 }); F(ctx, k, circ(x, y, r * 0.45), P.stone[1], 0.5); };
def('car', 124, 76, (ctx, k) => {
const body = new Path2D(); body.moveTo(6, 56); body.lineTo(6, 40); body.quadraticCurveTo(8, 32, 22, 30); body.lineTo(34, 12); body.quadraticCurveTo(38, 6, 46, 6); body.lineTo(82, 6); body.quadraticCurveTo(90, 6, 94, 12); body.lineTo(106, 30); body.quadraticCurveTo(118, 32, 118, 44); body.lineTo(118, 56); body.closePath();
S(ctx, k, body, P.sky[2], P.sky[3], { off: 5, gloss: [30, 36, 10, 3, 0] });
for (const [x0, x1] of [[38, 62], [66, 92]]) { const w = poly([[x0, 14], [x1, 14], [x1 + (x1 > 80 ? 8 : 0), 30], [x0 - (x0 < 50 ? 8 : 0), 30]]); F(ctx, k, w, P.sky[0], 0.6); }
F(ctx, k, rrectPath(110, 38, 8, 6, 2), P.spark[1], 0.5); F(ctx, k, rrectPath(6, 40, 6, 6, 2), P.coral[2], 0.5);
wheel(ctx, k, 32, 60, 12); wheel(ctx, k, 92, 60, 12);
}, 0.5, 1);
def('bus', 164, 96, (ctx, k) => {
const body = rrectPath(6, 6, 152, 70, 16); S(ctx, k, body, P.mint[2], P.mint[3], { off: 6, gloss: [30, 14, 14, 3, 0] });
for (let i = 0; i < 5; i++) F(ctx, k, rrectPath(16 + i * 26, 16, 20, 22, 5), P.sky[0], 0.6);
F(ctx, k, rrectPath(138, 16, 14, 40, 5), P.sky[0], 0.6);
F(ctx, k, rrectPath(6, 48, 152, 8, 2), CREAM, 0.6);
F(ctx, k, rrectPath(150, 62, 8, 7, 2), P.spark[1], 0.5);
wheel(ctx, k, 40, 80, 13); wheel(ctx, k, 124, 80, 13);
}, 0.5, 1);
def('rocket', 76, 136, (ctx, k) => {
if (k.v === 'go') { const fl = new Path2D(); fl.moveTo(26, 104); fl.quadraticCurveTo(38, 150, 50, 104); fl.closePath(); S(ctx, k, fl, P.spark[1], P.peach[2], { off: 4, emissive: true, unlit: true }); const fl2 = new Path2D(); fl2.moveTo(32, 104); fl2.quadraticCurveTo(38, 126, 44, 104); fl2.closePath(); F(ctx, k, fl2, CREAM, 0.4); glowMask(k, fl2); }
for (const s of [-1, 1]) { const fin = rpoly([[38 + s * 14, 76], [38 + s * 30, 106], [38 + s * 12, 100]], 3); S(ctx, k, fin, P.coral[2], P.coral[3], { off: 2 }); }
const b = new Path2D(); b.moveTo(38, 4); b.bezierCurveTo(60, 20, 62, 70, 54, 104); b.lineTo(22, 104); b.bezierCurveTo(14, 70, 16, 20, 38, 4); b.closePath();
S(ctx, k, b, CREAM, P.cream[3], { off: 6, gloss: [28, 40, 4, 14, 0.1] });
const nose = new Path2D(); nose.moveTo(38, 4); nose.bezierCurveTo(48, 11, 53, 20, 55, 28); nose.quadraticCurveTo(38, 22, 21, 28); nose.bezierCurveTo(23, 20, 28, 11, 38, 4); nose.closePath(); S(ctx, k, nose, P.coral[2], P.coral[3], { off: 2, rim: false });
S(ctx, k, circ(38, 50, 11), P.sky[2], P.sky[3], { off: 2, rim: false }); F(ctx, k, circ(38, 50, 6.5), P.sky[0], 0.5);
}, 0.5, 0.77);
def('boat', 124, 96, (ctx, k) => {
const mast = rrectPath(58, 6, 6, 70, 3); S(ctx, k, mast, P.cocoa[2], P.cocoa[3], { off: 1 });
const sail = new Path2D(); sail.moveTo(66, 10); sail.quadraticCurveTo(100, 40, 104, 70); sail.lineTo(66, 70); sail.closePath(); S(ctx, k, sail, CREAM, P.cream[3], { off: 4 });
const s2 = new Path2D(); s2.moveTo(56, 22); s2.quadraticCurveTo(32, 46, 26, 70); s2.lineTo(56, 70); s2.closePath(); S(ctx, k, s2, P.sky[1], P.sky[2], { off: 3 });
const hull = new Path2D(); hull.moveTo(6, 72); hull.lineTo(118, 72); hull.quadraticCurveTo(108, 94, 90, 94); hull.lineTo(30, 94); hull.quadraticCurveTo(14, 94, 6, 72); hull.closePath();
S(ctx, k, hull, P.coral[2], P.coral[3], { off: 4, gloss: [30, 78, 12, 2.5, 0] });
F(ctx, k, rrectPath(16, 78, 92, 5, 2.5), CREAM, 0.5);
}, 0.5, 1);
def('plane', 136, 70, (ctx, k) => {
const tail = rpoly([[14, 34], [6, 8], [26, 10], [40, 34]], 4); S(ctx, k, tail, P.coral[2], P.coral[3], { off: 2 });
const body = new Path2D(); body.moveTo(10, 40); body.quadraticCurveTo(10, 28, 30, 28); body.lineTo(108, 28); body.quadraticCurveTo(132, 30, 132, 42); body.quadraticCurveTo(128, 52, 108, 52); body.lineTo(26, 52); body.quadraticCurveTo(10, 52, 10, 40); body.closePath();
S(ctx, k, body, CREAM, P.cream[3], { off: 4, gloss: [60, 32, 22, 2.5, 0] });
for (let i = 0; i < 4; i++) F(ctx, k, circ(54 + i * 14, 38, 3.8), P.sky[1], 0.5);
F(ctx, k, rrectPath(110, 32, 14, 9, 4), P.sky[1], 0.5);
const wing = rpoly([[58, 44], [86, 44], [64, 68], [50, 68]], 4); S(ctx, k, wing, P.sky[2], P.sky[3], { off: 2 });
});
atlas.define('tree', { w: 130, h: 180, ax: 0.5, ay: 1, draw(ctx, k) {
const v = k.v || '';
if (v === 'palm') {
const tr = new Path2D(); tr.moveTo(58, 178); tr.quadraticCurveTo(60, 110, 74, 50); tr.lineTo(84, 52); tr.quadraticCurveTo(72, 110, 74, 178); tr.closePath(); S(ctx, k, tr, P.cocoa[1], P.cocoa[2], { off: 3 });
for (let i = 0; i < 6; i++) { const y = 70 + i * 18; const l = poly([[62, y], [76, y - 3]], false); detail(ctx, k, l, 0.7); }
for (const [a, len] of [[-2.7, 56], [-2.2, 50], [-1.3, 46], [-0.5, 52], [-0.05, 56]]) { const lf = new Path2D(); const ex = 79 + Math.cos(a) * len, ey = 50 + Math.sin(a) * len + 18; lf.moveTo(79, 48); lf.quadraticCurveTo(79 + Math.cos(a) * len * 0.6, 50 + Math.sin(a) * len * 0.6 - 14, ex, ey); lf.quadraticCurveTo(79 + Math.cos(a) * len * 0.5, 50 + Math.sin(a) * len * 0.5, 79, 52); lf.closePath(); S(ctx, k, lf, P.mint[2], P.mint[3], { off: 3 }); }
for (const [x, y] of [[72, 56], [84, 58]]) S(ctx, k, circ(x, y, 6), P.cocoa[2], P.cocoa[3], { off: 1.5, rim: false });
return;
}
const trunk = new Path2D(); trunk.moveTo(54, 178); trunk.quadraticCurveTo(58, 130, 56, 100); trunk.lineTo(74, 100); trunk.quadraticCurveTo(72, 130, 76, 178); trunk.closePath();
S(ctx, k, trunk, P.cocoa[2], P.cocoa[3], { off: 3 });
if (v === 'pine' || v === 'snow') {
const layers = [[110, 58], [80, 48], [52, 36]];
layers.forEach(([y, w], i) => { const t = rpoly([[65, y - 50 + i * 2], [65 + w, y + 10], [65 - w, y + 10]], 9); S(ctx, k, t, i % 2 ? P.mint[2] : mixMint(i), P.mint[3], { off: 5, gloss: i === 2 ? [56, y - 24, 4, 7, 0.5] : null });
if (v === 'snow') { const cap = new Path2D(); cap.moveTo(65, y - 50 + i * 2 + 1); cap.lineTo(65 + w * 0.42, y - 18); cap.quadraticCurveTo(65 + w * 0.2, y - 12, 65, y - 18); cap.quadraticCurveTo(65 - w * 0.2, y - 12, 65 - w * 0.42, y - 18); cap.closePath(); F(ctx, k, cap, P.snow[0], 0.6); } });
return;
}
const blobs = [[38, 76, 30], [92, 74, 30], [65, 50, 40], [50, 92, 26], [82, 92, 26]], can = new Path2D();
for (const [x, y, r] of blobs) { can.moveTo(x + r, y); can.arc(x, y, r, 0, TAU); }
ctx.strokeStyle = CREAM; ctx.lineWidth = lines(k).w + lines(k).rim * 2; ctx.stroke(can);
ctx.strokeStyle = INK; ctx.lineWidth = lines(k).w; ctx.stroke(can);
ctx.fillStyle = P.mint[3]; ctx.fill(can, 'nonzero');
ctx.save(); ctx.clip(can); ctx.translate(-5, -8); ctx.fillStyle = P.mint[2]; ctx.fill(can); ctx.restore();
ctx.save(); ctx.clip(can); ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.ellipse(52, 34, 12, 7, -0.6, 0, TAU); ctx.fill(); ctx.restore();
if (k.mask) { const m = k.mask(); m.strokeStyle = '#00FF00'; m.lineWidth = lines(k).w + lines(k).rim * 2; m.stroke(can); m.globalCompositeOperation = 'destination-out'; m.fill(can); m.globalCompositeOperation = 'lighter'; }
for (const [x, y] of [[44, 70], [84, 62], [66, 92]]) F(ctx, k, circ(x, y, 5), P.coral[2], 0.5);
} });
const mixMint = i => (i === 0 ? adjustHex(P.mint[2], -0.04) : P.mint[2]);
def('bush', 100, 60, (ctx, k) => {
const b = new Path2D(); b.moveTo(6, 58); b.arc(24, 40, 18, Math.PI * 0.8, Math.PI * 1.6); b.arc(52, 28, 24, Math.PI * 1.15, Math.PI * 1.85); b.arc(78, 40, 18, Math.PI * 1.4, Math.PI * 2.2); b.lineTo(94, 58); b.closePath();
S(ctx, k, b, P.mint[2], P.mint[3], { off: 6, gloss: [38, 22, 9, 4, -0.4] });
}, 0.5, 1);
def('rock', 84, 54, (ctx, k) => {
const r = new Path2D(); r.moveTo(6, 52); r.quadraticCurveTo(2, 30, 18, 20); r.quadraticCurveTo(30, 4, 52, 8); r.quadraticCurveTo(76, 12, 80, 34); r.quadraticCurveTo(82, 46, 78, 52); r.closePath();
S(ctx, k, r, P.stone[1], P.stone[2], { off: 6, gloss: [30, 18, 9, 4, -0.3] });
const c = new Path2D(); c.moveTo(56, 20); c.quadraticCurveTo(62, 26, 60, 34); detail(ctx, k, c, 0.8);
}, 0.5, 1);
def('mushroom', 64, 64, (ctx, k) => {
const stem = rrectPath(22, 30, 20, 32, 8); S(ctx, k, stem, CREAM, P.cream[3], { off: 3 });
const cap = new Path2D(); cap.moveTo(4, 36); cap.bezierCurveTo(4, 6, 60, 6, 60, 36); cap.quadraticCurveTo(32, 42, 4, 36); cap.closePath();
S(ctx, k, cap, P.grape[2], P.grape[3], { off: 5 });
for (const [x, y, r] of [[20, 22, 5], [38, 16, 4], [48, 28, 3.5], [30, 30, 3]]) F(ctx, k, circ(x, y, r), CREAM, 0.5);
}, 0.5, 1);
def('leaf', 50, 50, (ctx, k) => {
const l = new Path2D(); l.moveTo(6, 44); l.bezierCurveTo(4, 18, 22, 4, 46, 4); l.bezierCurveTo(46, 30, 30, 46, 6, 44); l.closePath();
S(ctx, k, l, P.mint[2], P.mint[3], { off: 4 }); const v = new Path2D(); v.moveTo(8, 42); v.quadraticCurveTo(24, 26, 42, 8); detail(ctx, k, v, 0.9);
});
def('shell', 56, 50, (ctx, k) => {
const s = new Path2D(); s.moveTo(28, 46); s.lineTo(8, 34); s.quadraticCurveTo(4, 8, 28, 4); s.quadraticCurveTo(52, 8, 48, 34); s.closePath();
S(ctx, k, s, P.peach[1], P.peach[2], { off: 3 });
for (const a of [-0.6, -0.3, 0, 0.3, 0.6]) { const l = poly([[28, 44], [28 + Math.sin(a) * 30, 44 - Math.cos(a) * 34]], false); detail(ctx, k, l, 0.7); }
S(ctx, k, rrectPath(20, 42, 16, 7, 3), P.peach[2], P.peach[3], { off: 1, rim: false });
}, 0.5, 1);
def('cactus', 70, 110, (ctx, k) => {
const armL = capsule(18, 66, 18, 40, 8), armR = capsule(52, 54, 52, 32, 7);
const jl = capsule(18, 66, 30, 66, 8), jr = capsule(52, 54, 40, 54, 7);
for (const p of [armL, jl, armR, jr]) S(ctx, k, p, P.mint[2], P.mint[3], { off: 2 });
const body = capsule(35, 104, 35, 18, 13); S(ctx, k, body, P.mint[2], P.mint[3], { off: 4, gloss: [30, 30, 3, 9, 0] });
for (const x of [30, 40]) { const l = poly([[x, 26], [x, 98]], false); detail(ctx, k, l, 0.6); }
S(ctx, k, circ(35, 16, 5), P.coral[1], P.coral[2], { off: 1, rim: false });
}, 0.5, 1);
def('snowman', 80, 120, (ctx, k) => {
for (const [y, r] of [[92, 26], [52, 20]]) S(ctx, k, circ(40, y, r), P.snow[0], P.snow[2], { off: 4 });
const h = circ(40, 24, 15); S(ctx, k, h, P.snow[0], P.snow[2], { off: 3, gloss: [34, 18, 4, 3, -0.6] });
const hat = rrectPath(28, 0, 24, 14, 3), brim = rrectPath(22, 11, 36, 5, 2.5); S(ctx, k, hat, P.ink[0], P.ink[0], { off: 0 }); S(ctx, k, brim, P.ink[0], P.ink[0], { off: 0, rim: false });
ctx.fillStyle = INK; for (const x of [35, 45]) { ctx.beginPath(); ctx.arc(x, 22, 2.2, 0, TAU); ctx.fill(); }
const n = poly([[39, 27], [52, 29], [39, 31]]); F(ctx, k, n, P.peach[2], 0.5);
for (const y of [46, 58]) F(ctx, k, circ(40, y, 2.6), INK, 0.3);
const sc = rrectPath(24, 36, 32, 7, 3.5); S(ctx, k, sc, P.coral[2], P.coral[3], { off: 1, rim: false });
}, 0.5, 1);
def('log', 96, 44, (ctx, k) => {
const b = rrectPath(10, 6, 80, 34, 17); S(ctx, k, b, P.cocoa[2], P.cocoa[3], { off: 4, gloss: [34, 12, 12, 2.5, 0] });
const end = ellipsePath(18, 23, 11, 16); S(ctx, k, end, P.cocoa[1], P.cocoa[2], { off: 2, rim: false });
const ring = ellipsePath(18, 23, 5, 8); detail(ctx, k, ring, 0.7);
}, 0.5, 1);
def('grass', 50, 30, (ctx, k) => {
const g = new Path2D(); g.moveTo(6, 28); g.quadraticCurveTo(8, 12, 4, 4); g.quadraticCurveTo(14, 12, 18, 22); g.quadraticCurveTo(20, 8, 26, 2); g.quadraticCurveTo(28, 14, 30, 22); g.quadraticCurveTo(36, 10, 46, 8); g.quadraticCurveTo(40, 18, 44, 28); g.closePath();
S(ctx, k, g, P.mint[2], P.mint[3], { off: 3 });
}, 0.5, 1);
def('spikes', 84, 44, (ctx, k) => {
for (let i = 0; i < 4; i++) { const x = 12 + i * 20; const t = rpoly([[x, 6], [x + 10, 34], [x - 10, 34]], 2.5); S(ctx, k, t, P.coral[2], P.coral[3], { off: 2, gloss: [x - 2, 18, 1.5, 4, 0.3] }); }
S(ctx, k, rrectPath(2, 32, 80, 10, 4), P.stone[2], P.stone[3], { off: 2 });
}, 0.5, 1);
def('thorn', 80, 64, (ctx, k) => {
const vine = new Path2D(); vine.moveTo(6, 52); vine.bezierCurveTo(24, 20, 50, 58, 74, 18);
const L = lines(k), at = [[18, 37, -2.2], [32, 37, 1.3], [46, 42, -2.3], [58, 36, 1.0], [67, 26, -2.0]];
const th = at.map(([x, y, a]) => rpoly([[x + Math.cos(a) * 15, y + Math.sin(a) * 15], [x + Math.cos(a + 1.5) * 5.5, y + Math.sin(a + 1.5) * 5.5], [x + Math.cos(a - 1.5) * 5.5, y + Math.sin(a - 1.5) * 5.5]], 1.5));
ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = CREAM; ctx.lineWidth = L.w * 3.6 + L.rim * 2; ctx.stroke(vine); for (const t of th) ctx.stroke(t);
ctx.strokeStyle = INK; ctx.lineWidth = L.w * 3.6; ctx.stroke(vine); ctx.strokeStyle = P.cocoa[2]; ctx.lineWidth = L.w * 1.6; ctx.stroke(vine);
for (const t of th) S(ctx, k, t, P.coral[2], P.coral[3], { off: 1, rim: false });
if (k.mask) { const m = k.mask(); m.strokeStyle = '#00FF00'; m.lineWidth = L.w * 3.6 + L.rim * 2; m.lineCap = 'round'; m.stroke(vine); }
}, 0.5, 1);
def('spikeball', 70, 70, (ctx, k) => {
for (let i = 0; i < 8; i++) { const a = i * TAU / 8; const t = rpoly([[35 + Math.cos(a) * 33, 35 + Math.sin(a) * 33], [35 + Math.cos(a + 0.42) * 20, 35 + Math.sin(a + 0.42) * 20], [35 + Math.cos(a - 0.42) * 20, 35 + Math.sin(a - 0.42) * 20]], 2); S(ctx, k, t, P.coral[3], P.coral[3], { off: 0 }); }
S(ctx, k, circ(35, 35, 22), P.coral[2], P.coral[3], { off: 4, gloss: [27, 27, 5, 3.5, -0.6] });
for (const s of [-1, 1]) { const b = poly([[35 + s * 12, 28], [35 + s * 4, 32]], false); detail(ctx, k, b, 1.6); }
});
}
const PROP_NAMES = [].concat(...Object.values(PROP_GROUPS));
return { PROP_GROUPS, PROP_NAMES, PROP_VARIANTS, REWARD_PROPS, SHAPES, defineProps };
})();
const __m_biomes = (function () {
const { PALETTE, INK, CREAM } = __m_tokens;
const { mixHex, adjustHex } = __m_color;
const { mulberry32 } = __m_rand;
const { EMIT, UNLIT } = __m_atlas;
const { rrectPath, ellipsePath } = __m_grammar;
const P = PALETTE, TAU = Math.PI * 2;
const m = mixHex;
const BIOMES = {
meadow: { sky: null, bands: [
[m(P.mint[1], P.sky[1], 0.55), m(P.mint[1], P.sky[2], 0.45), 'hills', ''],
[m(P.mint[1], P.mint[0], 0.2), m(P.mint[2], P.sky[1], 0.3), 'hills', 'bush'],
[P.mint[2], m(P.mint[2], P.mint[3], 0.55), 'hills', 'flower'],
[m(P.mint[2], P.mint[3], 0.35), P.mint[3], 'hills', 'flower']],
ground: [P.mint[2], P.mint[3], P.cocoa[2], P.cocoa[1]] },
forest: { sky: ['#BFE3D2', '#E9F6EC', 0.5], bands: [
[m(P.mint[2], P.sky[2], 0.55), m(P.mint[3], P.sky[2], 0.5), 'hills', 'pines'],
[m(P.mint[2], P.sky[1], 0.25), m(P.mint[3], P.sky[2], 0.25), 'hills', 'pines'],
[m(P.mint[3], P.mint[2], 0.4), m(P.mint[3], INK, 0.12), 'hills', 'pines'],
[m(P.mint[3], P.cocoa[2], 0.2), m(P.mint[3], INK, 0.2), 'hills', 'mush']],
ground: [m(P.mint[3], P.mint[2], 0.4), m(P.mint[3], INK, 0.15), P.cocoa[3], P.cocoa[2]] },
beach: { sky: ['#7CC8F2', '#FFF1D6', 0.75], bands: [
[P.sky[1], P.sky[2], 'sea', ''],
[P.sky[2], m(P.sky[2], P.sky[3], 0.5), 'sea', 'wave'],
[P.peach[0], P.peach[1], 'dunes', 'palm'],
[m(P.peach[0], P.peach[1], 0.5), P.peach[1], 'dunes', 'shell']],
ground: [P.peach[0], P.peach[1], P.peach[1], P.peach[2]] },
snow: { sky: ['#B9DBF5', '#F4F7FA', 0.75], bands: [
[m(P.snow[2], P.sky[1], 0.4), m(P.snow[3], P.sky[2], 0.3), 'peaks', 'cap'],
[P.snow[1], P.snow[2], 'hills', 'snowpine'],
[P.snow[0], P.snow[2], 'hills', 'snowpine'],
[P.snow[0], m(P.snow[2], P.sky[1], 0.4), 'hills', '']],
ground: [P.snow[0], P.snow[2], P.stone[2], P.stone[1]] },
desert: { sky: ['#F4B27C', '#FFE9BF', 0.9], bands: [
[m(P.peach[1], P.coral[1], 0.35), m(P.peach[2], P.coral[1], 0.4), 'mesa', ''],
[P.peach[1], P.peach[2], 'mesa', ''],
[m(P.peach[0], P.peach[1], 0.6), P.peach[1], 'dunes', 'cactus'],
[P.peach[0], m(P.peach[0], P.peach[1], 0.7), 'dunes', 'rock']],
ground: [P.peach[1], P.peach[2], P.cocoa[1], P.peach[2]] },
candy: { sky: ['#F2A9CF', '#FFE8F3', 0.9], bands: [
[m(P.grape[0], P.coral[0], 0.4), m(P.grape[1], P.coral[1], 0.4), 'hills', ''],
[P.grape[1], m(P.grape[1], P.grape[2], 0.5), 'hills', 'lolly'],
[P.coral[0], P.coral[1], 'hills', 'lolly'],
[m(P.mint[0], P.mint[1], 0.5), P.mint[1], 'hills', 'drops']],
ground: [P.coral[1], P.coral[2], P.cocoa[1], CREAM] },
};
const BIOME_NAMES = Object.keys(BIOMES);
function biomeBands(doc, { biome = 'meadow', vw, vh, pxk, seed = 1, count = 3 }) {
const B = BIOMES[biome] || BIOMES.meadow, out = [];
const geo = [[0.15, 0.5, 0.07], [0.32, 0.6, 0.06], [0.55, 0.7, 0.05], [0.8, 0.8, 0.035]];
const pick = [0, 1, 2, 3].slice(4 - Math.max(2, Math.min(4, count)));
const W = Math.ceil(vw * 1.5);
for (const bi of pick) {
const [par, topF, amp] = geo[bi], [fill, shade, profile, deco] = B.bands[bi];
const R = mulberry32(seed * 977 + Math.round(par * 1000) + biome.length * 31);
const top = topF * vh, H = Math.ceil(vh - top + vh * 0.12);
const k = Math.min(pxk, 4096 / W);
const c = doc.createElement('canvas'); c.width = Math.ceil(W * k); c.height = Math.ceil(H * k);
const mk = doc.createElement('canvas'); mk.width = c.width; mk.height = c.height;
const ctx = c.getContext('2d'), mx = mk.getContext('2d');
ctx.scale(k, k); mx.scale(k, k);
const f = [2 + bi, 3 + bi * 1.5, 5 + bi * 2].map(Math.round), ph = f.map(() => R() * TAU), amps = f.map((x, i) => (R() * 0.5 + 0.5) / (i + 1));
const base = x => { let y = 0; f.forEach((q, i) => { y += Math.sin((x / W) * TAU * q + ph[i]) * amps[i]; }); return y; };
let yAt;
if (profile === 'sea') yAt = x => vh * amp + Math.sin((x / W) * TAU * 24 + ph[0]) * 1.4;
else if (profile === 'mesa') { yAt = x => { const b = base(x); const q = Math.max(-0.2, Math.min(0.45, b)); return vh * amp * 0.4 + (q > 0.2 ? -0.8 : q) * vh * amp * 1.4 + vh * amp; }; }
else if (profile === 'peaks') yAt = x => { let y = 0; f.forEach((q, i) => { y += Math.abs(Math.sin((x / W) * TAU * q * 0.8 + ph[i])) * amps[i]; }); return vh * amp * 2.2 - y * vh * amp * 1.3; };
else if (profile === 'dunes') yAt = x => vh * amp * 0.6 + Math.sin((x / W) * TAU * f[0] + ph[0]) * vh * amp * 0.45 + vh * amp;
else yAt = x => vh * amp * 0.4 + base(x) * vh * amp * 0.5 + vh * amp;
const STEP = 6, path = new Path2D(); path.moveTo(0, H + 2);
for (let x = 0; x <= W; x += STEP) path.lineTo(x, yAt(x)); path.lineTo(W, H + 2); path.closePath();
ctx.fillStyle = fill; ctx.fill(path);
ctx.save(); ctx.clip(path); ctx.translate(0, vh * 0.06); ctx.fillStyle = shade; ctx.globalAlpha = 0.55; ctx.fill(path); ctx.restore();
if (profile === 'sea') { ctx.save(); ctx.clip(path); ctx.strokeStyle = 'rgba(255,253,242,0.5)'; ctx.lineWidth = 2; for (let y = vh * amp + 14; y < H; y += 22) { ctx.beginPath(); for (let x = 0; x <= W; x += 12) ctx.lineTo(x, y + Math.sin(x * 0.05 + y) * 2); ctx.stroke(); } ctx.restore(); }
if (profile === 'peaks') { ctx.save(); ctx.clip(path); ctx.fillStyle = P.snow[0]; ctx.beginPath(); for (let x = 0; x <= W; x += STEP) ctx.lineTo(x, Math.min(yAt(x) + vh * 0.05, vh * amp * 1.5)); ctx.lineTo(W, 0); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill(); ctx.restore(); }
const lip = new Path2D(); for (let x = 0; x <= W; x += STEP) { const y = yAt(x); x === 0 ? lip.moveTo(x, y) : lip.lineTo(x, y); }
const lw = Math.max(2, Math.min(6, 0.055 * 60 * k)) / k * (0.6 + par * 0.5);
ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(lip);
mx.strokeStyle = UNLIT; mx.lineWidth = lw; mx.lineJoin = 'round'; mx.stroke(lip);
if (deco) {
let x = R() * 60; const sc = 0.55 + par * 0.6;
while (x < W - 40) {
const y = yAt(x);
decorate(ctx, mx, deco, x, y, sc, R, fill, shade, k);
x += (deco === 'pines' || deco === 'snowpine' ? 34 : 60) + R() * (deco === 'pines' ? 50 : 140) * (1.2 - par);
}
}
out.push({ canvas: c, mask: mk, par, top, h: H, w: W });
}
return out;
}
const lwOf = (r, k) => Math.max(1.5, 0.055 * 2 * r * k) / k;
function ink(ctx, mx, p, lw) { ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(p); mx.strokeStyle = UNLIT; mx.lineWidth = lw; mx.stroke(p); }
function blob(ctx, mx, p, fill, shade, k, r) { ctx.fillStyle = shade; ctx.fill(p); ctx.save(); ctx.clip(p); ctx.translate(-r * 0.12, -r * 0.2); ctx.fillStyle = fill; ctx.fill(p); ctx.restore(); ink(ctx, mx, p, lwOf(r, k)); }
function decorate(ctx, mx, kind, x, y, s, R, fill, shade, k) {
if (kind === 'bush') { const r = (14 + R() * 12) * s * 1.4; const p = new Path2D(); p.arc(x - r * 0.7, y + 4, r * 0.65, Math.PI, 0); p.arc(x, y + 4 - r * 0.25, r * 0.8, Math.PI, 0); p.arc(x + r * 0.75, y + 4, r * 0.6, Math.PI, 0); p.closePath(); blob(ctx, mx, p, mixHex(fill, '#FFFFFF', 0.08), shade, k, r); }
else if (kind === 'flower') flowerAt(ctx, mx, x, y, s, R() < 0.5 ? P.coral[1] : P.grape[1], k);
else if (kind === 'pines' || kind === 'snowpine') {
const h = (40 + R() * 40) * s, w = h * 0.36, p = new Path2D(); p.moveTo(x, y - h); p.lineTo(x + w, y + 4); p.lineTo(x - w, y + 4); p.closePath();
blob(ctx, mx, p, kind === 'snowpine' ? m(P.mint[3], P.sky[2], 0.3) : m(fill, P.mint[3], 0.5), m(shade, INK, 0.1), k, w);
if (kind === 'snowpine') { const c = new Path2D(); c.moveTo(x, y - h); c.lineTo(x + w * 0.45, y - h * 0.55); c.lineTo(x - w * 0.45, y - h * 0.55); c.closePath(); ctx.fillStyle = P.snow[0]; ctx.fill(c); ink(ctx, mx, c, lwOf(w, k) * 0.6); }
} else if (kind === 'palm') {
const h = 70 * s; ctx.strokeStyle = INK; ctx.lineWidth = 7 * s; ctx.lineCap = 'round'; const tr = new Path2D(); tr.moveTo(x, y + 2); tr.quadraticCurveTo(x + 6 * s, y - h * 0.5, x + 14 * s, y - h); ctx.stroke(tr); ctx.strokeStyle = P.cocoa[1]; ctx.lineWidth = 4 * s; ctx.stroke(tr);
for (const a of [-2.8, -2.2, -1.2, -0.4, 0.1]) { const l = new Path2D(); const tx = x + 14 * s, ty = y - h; l.moveTo(tx, ty); l.quadraticCurveTo(tx + Math.cos(a) * 22 * s, ty + Math.sin(a) * 22 * s - 8 * s, tx + Math.cos(a) * 34 * s, ty + Math.sin(a) * 30 * s + 10 * s); ctx.strokeStyle = INK; ctx.lineWidth = 8 * s; ctx.stroke(l); ctx.strokeStyle = P.mint[2]; ctx.lineWidth = 5 * s; ctx.stroke(l); }
} else if (kind === 'shell' || kind === 'rock' || kind === 'drops' || kind === 'mush') {
const r = (6 + R() * 6) * s * 1.4, col = kind === 'shell' ? P.peach[1] : kind === 'rock' ? P.stone[1] : kind === 'mush' ? P.grape[2] : [P.coral[1], P.sky[1], P.grape[1], P.spark[0]][(R() * 4) | 0];
const p = new Path2D(); if (kind === 'mush') { p.moveTo(x - r, y); p.quadraticCurveTo(x, y - r * 1.6, x + r, y); p.closePath(); } else p.ellipse(x, y - r * 0.4, r, r * 0.7, 0, 0, TAU);
if (kind === 'mush') { ctx.fillStyle = CREAM; ctx.fillRect(x - r * 0.3, y - 1, r * 0.6, r * 0.7); }
blob(ctx, mx, p, col, adjustHex(col, -0.12), k, r);
} else if (kind === 'cactus') {
const h = (30 + R() * 26) * s, w = 8 * s, p = new Path2D(); p.moveTo(x - w, y + 2); p.lineTo(x - w, y - h + w); p.arc(x, y - h + w, w, Math.PI, 0); p.lineTo(x + w, y + 2); p.closePath();
const a = new Path2D(); a.moveTo(x + w, y - h * 0.4); a.lineTo(x + w * 2.4, y - h * 0.4); a.lineTo(x + w * 2.4, y - h * 0.75);
ctx.strokeStyle = INK; ctx.lineWidth = w * 1.5 + lwOf(w, k) * 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(a); ctx.strokeStyle = P.mint[2]; ctx.lineWidth = w * 1.5; ctx.stroke(a);
blob(ctx, mx, p, P.mint[2], P.mint[3], k, w * 2);
} else if (kind === 'lolly') {
const h = (40 + R() * 30) * s, r = 12 * s; ctx.strokeStyle = INK; ctx.lineWidth = 5 * s; ctx.beginPath(); ctx.moveTo(x, y + 2); ctx.lineTo(x, y - h); ctx.stroke(); ctx.strokeStyle = CREAM; ctx.lineWidth = 2.5 * s; ctx.stroke();
const p = new Path2D(); p.arc(x, y - h, r, 0, TAU); const col = [P.coral[1], P.sky[1], P.mint[1], P.grape[1]][(R() * 4) | 0]; blob(ctx, mx, p, col, adjustHex(col, -0.1), k, r);
ctx.strokeStyle = CREAM; ctx.lineWidth = 2 * s; ctx.beginPath(); for (let a = 0; a < 9; a += 0.3) ctx.lineTo(x + Math.cos(a) * a * r / 9, y - h + Math.sin(a) * a * r / 9); ctx.stroke();
} else if (kind === 'wave') {  ctx.fillStyle = 'rgba(255,253,242,0.8)'; ctx.beginPath(); ctx.ellipse(x, y + 10 + R() * 30, 6 * s, 1.6 * s, 0, 0, TAU); ctx.fill(); }
else if (kind === 'cap') {  }
}
function flowerAt(ctx, mx, x, y, s, petal, k) {
const lw = Math.max(1.5, 2 / k);
ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x, y + 2); ctx.lineTo(x, y - 14 * s); ctx.stroke();
for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 4.5 * s, y - 16 * s + Math.sin(a) * 4.5 * s, 3.6 * s, 0, TAU); ctx.fillStyle = petal; ctx.fill(); ctx.lineWidth = lw * 0.7; ctx.stroke(); }
ctx.beginPath(); ctx.arc(x, y - 16 * s, 2.6 * s, 0, TAU); ctx.fillStyle = P.spark[1]; ctx.fill();
mx.fillStyle = EMIT; mx.globalAlpha = 0.35; mx.beginPath(); mx.arc(x, y - 16 * s, 2.6 * s, 0, TAU); mx.fill(); mx.globalAlpha = 1;
}
function autotile(rows, solid = c => c !== ' ' && c !== '.' && c != null) {
const g = rows.map(r => [...r]), H = g.length, out = [];
const at = (x, y) => y >= 0 && y < H && x >= 0 && x < g[y].length && solid(g[y][x]);
for (let y = 0; y < H; y++) for (let x = 0; x < g[y].length; x++) if (at(x, y)) {
let depth = 0; while (at(x, y - depth - 1)) depth++;
out.push({ x, y, depth, mask: (at(x, y - 1) ? 1 : 0) | (at(x + 1, y) ? 2 : 0) | (at(x, y + 1) ? 4 : 0) | (at(x - 1, y) ? 8 : 0) });
}
return out;
}
const groundVariant = (t, x = t.x, y = t.y) => t.mask + '.' + Math.min(3, t.depth || 0) + '.' + (((x * 7 + y * 13) % 3 + 3) % 3);
function defineGround(atlas) {
for (const name of BIOME_NAMES) {
const [top, lip, soil, dots] = BIOMES[name].ground;
const deep = mixHex(soil, INK, 0.38), strata = [0, 1, 2, 3, 4, 5, 6, 7].map(i => mixHex(soil, deep, Math.min(1, i / 7) * 0.85));
atlas.define('ground:' + name, { w: 64, h: 64, ax: 0.5, ay: 0.5, draw(ctx, k) {
const [ms, ds, ls] = String(k.v || '0').split('.'), mask = (+ms || 0) & 15, depth = Math.max(0, Math.min(3, +ds || 0)), look = (+ls || 0) % 3;
const up = mask & 1, rt = mask & 2, dn = mask & 4, lf = mask & 8;
const r = 16, o = 1.5, x0 = lf ? -o : 0, x1 = rt ? 64 + o : 64, y0 = up ? -o : 2, y1 = dn ? 64 + o : 62;
const tl = !up && !lf ? r : 0, tr = !up && !rt ? r : 0, br = !dn && !rt ? r : 0, bl = !dn && !lf ? r : 0;
const p = new Path2D(); p.moveTo(x0 + tl, y0); p.lineTo(x1 - tr, y0); tr ? p.arcTo(x1, y0, x1, y0 + tr, tr) : p.lineTo(x1, y0); p.lineTo(x1, y1 - br); br ? p.arcTo(x1, y1, x1 - br, y1, br) : p.lineTo(x1, y1); p.lineTo(x0 + bl, y1); bl ? p.arcTo(x0, y1, x0, y1 - bl, bl) : p.lineTo(x0, y1); p.lineTo(x0, y0 + tl); tl ? p.arcTo(x0, y0, x0 + tl, y0, tl) : p.lineTo(x0, y0); p.closePath();
ctx.save(); ctx.clip(p);
const s0 = strata[Math.min(7, depth * 2)], s1 = strata[Math.min(7, depth * 2 + 1)];
ctx.fillStyle = s0; ctx.fillRect(-2, -2, 68, 68);
const R = mulberry32(depth * 97 + look * 31 + mask * 7 + 3);
const seam = new Path2D(), sy = 30 + R() * 6; seam.moveTo(-2, sy); for (let x = 0; x <= 66; x += 11) seam.quadraticCurveTo(x + 5.5, sy + (R() - 0.5) * 7, x + 11, sy + (R() - 0.5) * 3); seam.lineTo(66, 66); seam.lineTo(-2, 66); seam.closePath();
ctx.fillStyle = s1; ctx.fill(seam);
const n = [4, 3, 2, 1][depth] + (look === 1 ? 1 : 0), pebble = mixHex(dots, strata[Math.min(7, depth * 2 + 1)], 0.25 + depth * 0.12), pebbleS = mixHex(pebble, INK, 0.25);
for (let i = 0; i < n; i++) {
const px = 7 + R() * 50, py = (up ? 8 : 26) + R() * (up ? 50 : 32), kind = (look + i) % 3, sc = 0.8 + R() * 0.5;
const pb = kind === 0 ? ellipsePath(px, py, 3.6 * sc, 2.6 * sc, R() - 0.5) : kind === 1 ? ellipsePath(px, py, 5.2 * sc, 2 * sc, (R() - 0.5) * 0.6) : null;
if (pb) { ctx.fillStyle = pebbleS; ctx.save(); ctx.translate(0.6, 1); ctx.fill(pb); ctx.restore(); ctx.fillStyle = pebble; ctx.fill(pb); }
else { ctx.fillStyle = pebble; for (const [dx, dy, rr] of [[0, 0, 2.4], [3.6, 1.2, 1.7], [1.2, 3.2, 1.4]]) { ctx.beginPath(); ctx.arc(px + dx * sc, py + dy * sc, rr * sc, 0, TAU); ctx.fill(); } }
}
if (!up) {
ctx.strokeStyle = mixHex(soil, INK, 0.3); ctx.lineWidth = 1.6; ctx.lineCap = 'round';
for (let i = 0; i < 3; i++) { const rx = 8 + i * 22 + R() * 8; ctx.beginPath(); ctx.moveTo(rx, 18); ctx.quadraticCurveTo(rx + (R() - 0.5) * 10, 25, rx + (R() - 0.5) * 8, 30 + R() * 5); ctx.stroke(); }
const g = new Path2D(); g.moveTo(-2, 0); g.lineTo(66, 0); g.lineTo(66, 16); for (let x = 64; x >= 0; x -= 8) g.quadraticCurveTo(x - 4, 24 + (look - 1) * 1.5, x - 8, 16); g.closePath(); ctx.fillStyle = lip; ctx.fill(g); ctx.save(); ctx.translate(-1.5, -3); ctx.fillStyle = top; ctx.fill(g); ctx.restore();
}
ctx.restore();
const lw = Math.max(2, Math.min(6, 0.055 * k.px)) / k.s;
const e = new Path2D(); let any = false;
if (!up) { e.moveTo(x0, tl ? y0 + tl : y0); if (tl) e.arcTo(x0, y0, x0 + tl, y0, tl); else e.lineTo(x0, y0); e.lineTo(x1 - tr, y0); if (tr) e.arcTo(x1, y0, x1, y0 + tr, tr); any = true; }
if (!lf) { e.moveTo(x0, up ? y0 : y0 + tl); e.lineTo(x0, dn ? y1 : y1 - bl); any = true; }
if (!rt) { e.moveTo(x1, up ? y0 : y0 + tr); e.lineTo(x1, dn ? y1 : y1 - br); any = true; }
if (any) { ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(e); if (k.mask) { const mm = k.mask(); mm.strokeStyle = UNLIT; mm.lineWidth = lw; mm.lineCap = 'round'; mm.stroke(e); } }
} });
}
atlas.define('panel', { w: 100, h: 60, ax: 0.5, ay: 0.5, draw(ctx, k) { const p = rrectPath(4, 4, 92, 52, 14); ctx.fillStyle = CREAM; ctx.fill(p); ctx.strokeStyle = INK; ctx.lineWidth = Math.max(2, 0.055 * k.px) / k.s; ctx.stroke(p); } });
}
return { BIOMES, BIOME_NAMES, autotile, biomeBands, defineGround, groundVariant };
})();
const __m_entity = (function () {
const { z: Z, motion, color } = __m_tokens;
const { mulberry32, seedOf } = __m_rand;
const { MOON_GRADE } = __m_atlas;
let NEXT_ID = 1;
class Entity {
constructor(stage, sprite, o = {}) {
this.stage = stage; this.id = NEXT_ID++;
this.sprite = sprite; this.kind = o.kind || sprite; this.tag = o.tag || ''; this.spec = o.spec || null;
this.x = +o.x || 0; this.y = +o.y || 0; this.px = this.x; this.py = this.y; this.vx = 0; this.vy = 0;
this.rot = +o.rot || 0; this.sx = 1; this.sy = 1; this.alpha = o.alpha == null ? 1 : +o.alpha;
this.size = +o.size || 64; this.layer = o.layer != null ? o.layer : Z.actors; this.z = +o.z || 0; this.par = o.par == null ? 1 : +o.par;
this.flip = !!o.flip; this.tint = null; this.flashK = 0; this.emissive = +o.emissive || 0; this.lit = o.lit === false ? 0 : 1; this.wind = +o.wind || 0;
this.shadow = o.shadow == null ? this.layer === Z.actors : !!o.shadow;
this.grade = o.grade != null ? Math.max(0, Math.min(1, +o.grade)) : this.layer === Z.actors ? MOON_GRADE : 1;
this.visible = true; this.dead = false; this.grounded = false; this.variant = o.variant || '';
this.jsx = 1; this.jsy = 1; this.jy = 0; this.jrot = 0; this.breathe = 0; this.csx = 1; this.csy = 1;
this.lookX = 0; this.lookY = -1; this.lookAt = null; this.clip = 'idle'; this.moodName = 'happy';
this.rng = mulberry32(seedOf(o.seed != null ? o.seed : this.id * 7919));
this.blinkAt = 1 + this.rng() * 3; this.invuln = 0;
this.rig = o.rig || null; this.slots = this.rig ? Array.from({ length: 16 }, () => ({ name: '', x: 0, y: 0, w: 0, h: 0, r: 0, v: '', c: { name: '', v: '', b: -1, id: -1 } })) : null;
this.behaviours = []; this.fns = null;
this._c = { name: '', v: '', b: -1, id: -1 }; this._sc = { name: '', v: '', b: -1, id: -1 };
}
on(ev, fn) { (this.fns || (this.fns = {}))[ev] = (this.fns[ev] || []).concat(fn); return () => { this.fns[ev] = this.fns[ev].filter(f => f !== fn); }; }
emit(ev, ...a) { const l = this.fns && this.fns[ev]; if (l) for (const f of l) { try { f(...a); } catch (e) { this.stage.kit.warn(e); } } }
state(name) { this.clip = String(name); return this; }
mood(m) { this.moodName = String(m); return this; }
look(at) { this.lookAt = at || null; return this; }
pop() {
const tw = this.stage.kit.loop.tw;
if (this.stage.reduced) { this.alpha = 0; return tw.tween(this, { alpha: 1 }, { ms: 200, ease: 'linear' }); }
this.jsx = this.jsy = 0.01;
return Promise.all([tw.tween(this, { jsx: 1 }, { ms: motion.pop.ms, ease: 'backOut' }), tw.tween(this, { jsy: 1 }, { ms: motion.pop.ms, ease: 'backOut' })]);
}
squash(amt = 0.8, ms = 220) {
const tw = this.stage.kit.loop.tw;
this.jsy = amt; this.jsx = 1 / Math.sqrt(amt);
tw.tween(this, { jsy: 1, jsx: 1 }, { ms, ease: 'elasticOut' });
}
flash() {
const kit = this.stage.kit;
if (this.stage.reduced || !kit.flashes.allow(kit.loop.now)) return false;
this.flashK = 1; kit.loop.tw.tween(this, { flashK: 0 }, { ms: 160, ease: 'quadOut' }); return true;
}
wobble() {
if (this.stage.reduced) return;
const tw = this.stage.kit.loop.tw; this.jrot = 0.22;
tw.tween(this, { jrot: 0 }, { ms: 420, ease: 'elasticOut' });
}
float(text, role = 'reward', o = {}) { return this.stage.floatText(String(text), this.x, this.y - this.size * (this._ay() - 0.5) - this.size * 0.3, role, o); }
say(key, vars) { return this.stage.kit.say(key, { who: this, vars }); }
add(part, opts = {}) {
const fn = typeof part === 'function' ? part : this.stage.kit.parts[part];
if (!fn) { this.stage.kit.warn(`unknown part "${part}"`); return this; }
this.behaviours.push(typeof part === 'function' ? part : fn(this, opts) || (() => {}));
return this;
}
remove(fx = 'puff') {
if (this.dead) return; this.dead = true;
if (fx === 'puff') this.stage.particles.burst('smoke', this.x, this.y - this.size * 0.4, { n: 6 });
if (fx === 'sparkle') this.stage.particles.burst('sparkle', this.x, this.y - this.size * 0.4);
this.emit('remove');
}
collect(fx = 'sparkle') {
if (this.dead || this.collecting) return Promise.resolve(false);
this.collecting = true; const tw = this.stage.kit.loop.tw;
this.stage.particles.burst(fx, this.x, this.y - this.size * (this._ay() - 0.5));
if (this.stage.reduced) return tw.tween(this, { alpha: 0 }, { ms: 200, ease: 'linear' }).then(() => { this.remove(null); return true; });
return Promise.all([tw.tween(this, { jsx: 1.35, jsy: 1.35 }, { ms: 110, ease: 'quadOut' }).then(() => tw.tween(this, { jsx: 0.01, jsy: 0.01, alpha: 0 }, { ms: 180, ease: 'backIn' })), tw.tween(this, { jy: -this.size * 0.5 }, { ms: 290, ease: 'cubicOut' })]).then(() => { this.remove(null); return true; });
}
break() {
if (this.dead) return;
const cy = this.y - this.size * (this._ay() - 0.5);
this.stage.particles.burst('chips', this.x, cy, { n: 10 }); this.stage.particles.burst('dust', this.x, cy, { n: 6 });
this.stage.camera.shake(0.18); this.remove(null);
}
get hitW() { const d = this.stage.atlas.defs.get(this.sprite); return this.size * (d ? d.w / d.h : 1) * 0.8; }
get hitH() { return this.size * 0.8; }
touches(o) {
const dx = Math.abs(this.x - o.x), dy = Math.abs((this.y - this.size * this._ay() + this.size / 2) - (o.y - o.size * o._ay() + o.size / 2));
return dx < (this.hitW + o.hitW) / 2 && dy < (this.hitH + o.hitH) / 2;
}
_ay() { const d = this.stage.atlas.defs.get(this.sprite); return d && d.ay != null ? d.ay : 0.5; }
}
function cachedSprite(A, c, name, v, hPx) {
if (c.name === name && c.v === v && c.id >= 0 && Math.abs(c.b - hPx) < c.b * 0.13 && A.entries[c.id].alive) return c.id;
c.name = name; c.v = v; c.id = A.sprite(name, hPx, v); c.b = A.lastExact ? hPx : -1e9;
return c.id;
}
const ROLE_TEXT = r => color(r === 'hazard' || r === 'wrong' ? 'coral' : r === 'reward' ? 'spark' : r === 'player' ? 'mint' : r, 'base');
return { Entity, ROLE_TEXT, cachedSprite };
})();
const __m_stage = (function () {
const { DisplayList, View, BLEND_ADD } = __m_list;
const { Atlas } = __m_atlas;
const { Camera } = __m_camera;
const { Particles } = __m_particles;
const { Paper } = __m_paper;
const { Glaze } = __m_glaze;
const { Governor, TIER_SPEC, probeGL, pickBackend, pickTier } = __m_governor;
const { sky } = __m_sky;
const { computeFit } = __m_fit;
const { defineCoreArt } = __m_art;
const { defineChar, charSpec, charRig, CH, FACES } = __m_chars;
const { defineProps } = __m_props;
const { BIOMES, biomeBands, defineGround, autotile, groundVariant } = __m_biomes;
const { SPECIES } = __m_validate;
const { textSprite } = __m_text;
const { Entity, cachedSprite, ROLE_TEXT } = __m_entity;
const { nearest } = __m_validate;
const { ease } = __m_ease;
const { z: Z, PALETTE } = __m_tokens;
const { mulberry32 } = __m_rand;
const { hexToRgb, hexToOklab, oklabToRgb } = __m_color;
const LAYER_OF = { sky: Z.sky, far: Z.far, mid: Z.mid, near: Z.near, world: Z.world, actors: Z.actors, fx: Z.fx, front: Z.front };
const rgb01 = hex => hexToRgb(hex).map(v => v / 255);
class Stage {
constructor(kit, canvas = null, o = {}) {
this.kit = kit; const doc = this.doc = kit.doc, win = this.win = kit.win;
this.size = Array.isArray(o.size) ? o.size : [960, 540]; this.fitMode = o.fit === 'letterbox' ? 'letterbox' : 'expand';
this.biome = o.biome === 'none' ? 'none' : BIOMES[o.biome] ? o.biome : 'meadow'; this.seed = o.seed != null ? o.seed : 1;
const q = kit.query, set = kit.settings;
this.backendOverride = o.backend && o.backend !== 'auto' ? o.backend : q.okBackend || 'auto';
const probe = this.backendOverride === 'auto' && set.get('graphics') !== 'simple' ? probeGL(() => doc.createElement('canvas')) : null;
this.probe = probe;
const backend = kit.glLocked ? 'paper' : pickBackend({ override: this.backendOverride, probe, graphics: set.get('graphics') });
const tier = pickTier({ backend, override: q.okTier || o.tier || '', graphics: set.get('graphics') });
this.gov = new Governor({ tier, locked: kit.glLocked });
if (q.okGov === 'off') this.gov.sample = () => null;
this.dprOverride = +q.okDpr || 0;
this.atlas = new Atlas({ doc, pageSize: TIER_SPEC[tier].page, now: kit.clock });
defineCoreArt(this.atlas); defineProps(this.atlas); defineGround(this.atlas);
for (const fn of kit.artPacks) fn(this.atlas);
this.el = doc.createElement('div'); this.el.className = 'ok-stage';
const parent = o.parent || doc.body; parent.insertBefore(this.el, kit.ui.mount());
this.userCanvas = canvas;
this.view = new View(); this.list = new DisplayList(); this.camera = new Camera();
this.particles = new Particles(1024, mulberry32(this.seed * 31 + 7));
this.entities = []; this.updaters = []; this.drawers = []; this.lights = []; this.floaters = [];
this.sortDirty = true; this.tod = kit.theme.dark ? 1 : 0; this.todLock = false; this.t = 0;
this.skyOut = {}; this.F = {
view: this.view, tod: 0, sky: this.skyOut, ambient: [1, 1, 1], lights: this.lights, renderScale: 1, bloom: false, maxLights: 0, lightK: 1,
flash: 0, flashColor: '#FFFFFF', flashRgb: [1, 1, 1], iris: 2, irisX: 0.5, irisY: 0.5, vignette: 1, time: 0, contrast: false,
};
this.bands = null; this.bandKey = ''; this.bandIds = []; this.bandWant = ''; this.bandWantAt = 0; this.bandView = null;
this.stars = []; const R = mulberry32(this.seed * 13 + 1);
for (let i = 0; i < 40; i++) this.stars.push({ x: R(), y: R(), s: 7 + R() * 8, p: R() * 6.28, c: { name: '', v: '', b: -1, id: -1 } });
this.clouds = []; for (let i = 0; i < 5; i++) this.clouds.push({ x: R(), y: 0.07 + R() * 0.26, s: 60 + R() * 60, v: 6 + R() * 10, c: { name: '', v: '', b: -1, id: -1 } });
this.bodyC = [{ name: '', v: '', b: -1, id: -1 }, { name: '', v: '', b: -1, id: -1 }];
this.glowC = { name: '', v: '', b: -1, id: -1 }; this.fireflies = 0;
this.backend = null; this.canvas = null; this.contextLost = 0;
this._makeBackend(this.gov.backend);
this.sizeDirty = true;
this._onResize = () => { this.sizeDirty = true; };
win.addEventListener('resize', this._onResize);
this._watchDpr();
this._offTheme = this.kit.theme.on('change', mode => this.toNight(mode === 'dark'));
this.applySettings();
this._offSettings = set.on('change', () => this.applySettings());
this.kit.input.toDesign = (x, y) => this.toDesign(x, y);
this.layers = { sky: Z.sky, far: Z.far, world: Z.world, fx: Z.fx, front: Z.front };
kit.attachStage(this);
}
get tier() { return this.gov.tier; }
get timeOfDay() { return this.tod; }
_watchDpr() {
const win = this.win; if (this._offDpr) this._offDpr();
try {
const mq = win.matchMedia && win.matchMedia(`(resolution: ${win.devicePixelRatio || 1}dppx)`); if (!mq || !mq.addEventListener) return;
const fn = () => { this.sizeDirty = true; this._watchDpr(); };
mq.addEventListener('change', fn, { once: true }); this._offDpr = () => mq.removeEventListener('change', fn);
} catch (e) {  }
}
get backendName() { return this.backend ? this.backend.name : 'none'; }
get reduced() { return this.kit.settings.reduced; }
applySettings() {
const s = this.kit.settings, r = s.reduced;
this.camera.reduced = r; this.particles.reduced = r;
this.kit.loop.scale = s.get('speed');
this.F.contrast = !!s.get('contrast'); this.F.vignette = this.F.contrast ? 0 : 1;
const g = s.get('graphics');
if (g === 'simple' && this.gov.tier !== 'low') this.gov.request('low');
if (g === 'fancy' && this.gov.tier !== 'high' && this.probe && this.probe.webgl2) this.gov.request('high');
}
_makeBackend(name) {
const old = this.canvas;
if (this.backend) { try { this.backend.dispose(); } catch (e) {  } }
let canvas = this.doc.createElement('canvas'), b = null;
if (name === 'glaze' && !this.kit.glLocked) {
try {
b = new Glaze(canvas, this.atlas, { force: this.backendOverride === 'glaze' });
const gz = b;
canvas.addEventListener('webglcontextlost', e => { if (gz.disposed) return; e.preventDefault(); this._lost(); });
canvas.addEventListener('webglcontextrestored', () => { if (!gz.disposed) this.gov.contextRestored(); });
} catch (e) { this.kit.warn('Glaze unavailable: ' + (e && e.message)); b = null; canvas = this.doc.createElement('canvas'); }
}
if (!b) { b = new Paper(canvas, this.atlas); if (this.gov.backend !== 'paper') { this.gov.request('low', true); } }
canvas.setAttribute('aria-hidden', 'true');
if (old && old.parentNode) old.parentNode.replaceChild(canvas, old); else this.el.appendChild(canvas);
this.canvas = canvas; this.backend = b; this.sizeDirty = true;
this.kit.backend = b.name; this.kit.tier = this.gov.tier;
}
_lost() {
this.contextLost++;
this.gov.contextLost(this.kit.loop.now);
if (this.gov.glLocked) this.kit.glLocked = true;
this._makeBackend('paper');
}
transition() {
const was = this.gov.backend;
if (this.gov.transition() || was !== this.gov.backend || this.gov.backend !== this.backend.name) this._makeBackend(this.gov.backend);
this.kit.tier = this.gov.tier;
}
setTier(t, now = true) { this.gov.request(t); if (now) this.transition(); }
setBackend(b) { this.backendOverride = b; this.setTier(b === 'paper' ? 'low' : this.gov.tier === 'low' ? 'mid' : this.gov.tier); }
toDesign(x, y) { const f = this.fit; return f ? { x: (x - f.offX) / f.k, y: (y - f.offY) / f.k } : { x, y }; }
toWorld(p) { return this.camera.toWorld(p); }
viewY(f) { return this.camera.y + (f - 0.5) * this.view.vh / this.camera.zoom; }
viewX(f) { return this.camera.x + (f - 0.5) * this.view.vw / this.camera.zoom; }
_resize() {
const cw = this.el.clientWidth || this.win.innerWidth, ch = this.el.clientHeight || this.win.innerHeight;
const dev = this.win.devicePixelRatio || 1; this.gov.devDpr = dev;
const dpr = (this.dprOverride || Math.min(dev, this.gov.dprCap)) * (this.backend.name === 'paper' ? this.gov.scale : 1);
const f = this.fit = computeFit(cw, ch, this.size, this.fitMode, dpr);
this.backend.resize(f.pw, f.ph);
const V = this.view; V.scale = f.k * dpr; V.offX = f.offX * dpr; V.offY = f.offY * dpr; V.vw = f.vw; V.vh = f.vh;
this.camera.vw = f.vw; this.camera.vh = f.vh; this.camera.clamp();
this.sizeDirty = false; this.dpr = dpr;
}
add(name, o = {}) {
if ((name && typeof name === 'object') || SPECIES.includes(name)) {
if (typeof name === 'object') return this.addChar(name, o);
const c = { species: name }; for (const k of CHAR_FIELDS) if (o[k] != null) c[k] = o[k];
return this.addChar(Object.assign(c, o.char), o);
}
if (!this.atlas.has(name) && !this.kit.rigs[name]) {
const known = [...this.atlas.defs.keys()].filter(n => !/^ch[0-9a-z]+(:|$)|^T\||#/.test(n)).concat(SPECIES);
const near = nearest(name, known, null, 3);
this.kit.warn(`stage.add("${name}"): there is no sprite or character called "${name}".` + (near ? ` Did you mean "${near}"?` : ' See Oomba.art.props and Oomba.art.species.') + ' A placeholder is shown.');
if (near && SPECIES.includes(near)) return this.add(near, o);
name = near || 'missing';
}
const rig = this.kit.rigs[name] || null;
const e = new Entity(this, name, Object.assign({}, o, { rig, layer: typeof o.layer === 'string' ? LAYER_OF[o.layer] : o.layer }));
if (o.parts) for (const p of o.parts) typeof p === 'string' ? e.add(p) : e.add(Object.keys(p)[0], p[Object.keys(p)[0]]);
this.entities.push(e); this.sortDirty = true;
return e;
}
addChar(spec, o = {}) {
const b = defineChar(this.atlas, spec && spec.__ok ? spec : charSpec(spec));
const e = new Entity(this, b.id, Object.assign({ size: 150 * b.spec.size }, o, { rig: charRig, spec: b.spec, kind: b.spec.species, layer: typeof o.layer === 'string' ? LAYER_OF[o.layer] : o.layer }));
e.charB = b; e.moodName = b.spec.mood; e.lookX = 0; e.lookY = 0;
if (o.parts) for (const p of o.parts) typeof p === 'string' ? e.add(p) : e.add(Object.keys(p)[0], p[Object.keys(p)[0]]);
this.entities.push(e); this.sortDirty = true;
return e;
}
ground(rows, o = {}) {
const cell = o.cell || 64, x0 = o.x != null ? o.x : -((rows[0] || '').length * cell) / 2, y0 = o.y != null ? o.y : 0, name = 'ground:' + (o.biome || (this.biome === 'none' ? 'meadow' : this.biome));
return autotile(rows).map(t => this.add(name, { x: x0 + t.x * cell + cell / 2, y: y0 + t.y * cell + cell / 2, size: cell + 1, variant: groundVariant(t), layer: 'world', shadow: false }));
}
setBiome(name) { this.biome = name === 'none' ? 'none' : BIOMES[name] ? name : 'meadow'; this.bandKey = ''; }
update(fn) { this.updaters.push(fn); return () => { this.updaters = this.updaters.filter(f => f !== fn); }; }
draw(fn) { this.drawers.push(fn); return () => { this.drawers = this.drawers.filter(f => f !== fn); }; }
light(o = {}) {
const c = rgb01(o.color || PALETTE.spark[1]);
const l = { x: +o.x || 0, y: +o.y || 0, follow: o.follow || null, dy: +o.dy || 0, radius: +o.radius || 220, intensity: o.intensity == null ? 1 : +o.intensity, r: c[0], g: c[1], b: c[2],
on: o.on !== false, night: o.night !== false, flicker: o.flicker !== false, base: o.intensity == null ? 1 : +o.intensity, halo: o.halo !== false, phase: this.lights.length * 1.7 };
this.lights.push(l); return l;
}
theme(mode) { this.kit.theme.set(mode); }
toNight(on = true, ms = 3000) { return this.setTimeOfDay(on ? 1 : 0, ms); }
setTimeOfDay(v, ms = 3000) {
if (this.reduced || !ms) { this.tod = v; return Promise.resolve(true); }
return this.kit.loop.ui.tween(this, { tod: v }, { ms, ease: 'sineInOut' });
}
wipe(dir = 'out', o = {}) {
const F = this.F; const ms = o.ms || 500;
if (o.at) { const p = this.camera.toScreen(o.at); F.irisX = p.x / this.view.vw; F.irisY = p.y / this.view.vh; } else { F.irisX = o.x != null ? o.x : 0.5; F.irisY = o.y != null ? o.y : 0.5; }
if (this.reduced) { F.iris = dir === 'out' ? 0 : 2; return Promise.resolve(true); }
if (dir === 'out') { F.iris = Math.min(F.iris, 1.2); return this.kit.loop.ui.tween(F, { iris: 0 }, { ms, ease: 'cubicIn' }); }
F.iris = Math.min(F.iris, 0); return this.kit.loop.ui.tween(F, { iris: 1.6 }, { ms, ease: 'cubicOut' }).then(() => { F.iris = 2; });
}
flash(color = '#FFFFFF') {
if (this.reduced || !this.kit.flashes.allow(this.kit.loop.now)) return false;
this.F.flashColor = color; const c = rgb01(color); this.F.flashRgb[0] = c[0]; this.F.flashRgb[1] = c[1]; this.F.flashRgb[2] = c[2];
this.F.flash = 0.55; this.kit.loop.ui.tween(this.F, { flash: 0 }, { ms: 180, ease: 'quadOut' });
return true;
}
floatText(text, x, y, role = 'reward', o = {}) {
const z = this.camera.effZoom, id = textSprite(this.atlas, text, { px: 30 * this.view.scale * z, color: ROLE_TEXT(role), dir: this.kit.i18n.dir, lang: this.kit.i18n.lang });
let f = this.floaters.find(f => !f.on);
if (!f) { f = {}; this.floaters.push(f); }
const e = this.atlas.entries[id];
const a = o.avoid;
if (a && a.size) {
const top = a.y - a.size * (a._ay ? a._ay() : 1), half = Math.max(30, (a.hitW || a.size * 0.6) / 2 + 16);
if (Math.abs(x - a.x) < half && y > top - 30) { y = top - 34; x = a.x + (x === a.x ? (this.kit.i18n.dir === 'rtl' ? 1 : -1) : Math.sign(x - a.x)) * half * 0.7; }
}
let to = null;
if (o.to === 'score' || o.to === 'hud') to = this._hudPoint('.ok-scorepill'); else if (o.to && o.to.x != null) to = { x: +o.to.x, y: +o.to.y };
f.on = true; f.id = id; f.x = x; f.y = y; f.t = 0; f.life = to ? 0.85 : 0.9; f.w = e ? e.w / this.view.scale / z : 40; f.h = e ? e.h / this.view.scale / z : 30;
f.to = to; f.onArrive = typeof o.onArrive === 'function' ? o.onArrive : null;
if (to) { const p = this.camera.toScreen({ x, y }); f.sx = p.x; f.sy = p.y; }
return f;
}
_hudPoint(sel) {
const root = this.kit.ui.root, el = root && root.querySelector(sel); if (!el || !this.fit) return null;
const r = el.getBoundingClientRect(); if (!r.width) return null;
const box = this.el.getBoundingClientRect();
return this.toDesign(r.left + r.width / 2 - box.left, r.top + r.height / 2 - box.top);
}
prebake(o = {}) {
const A = this.atlas, V = this.view, ids = [];
if (this.sizeDirty) this._resize();
const zooms = [this.camera.zoom].concat(o.zooms || []);
for (const z of zooms) {
const k = V.scale * z;
for (const e of this.entities) {
const def = A.defs.get(e.sprite); if (!def || e.dead) continue;
if (!(e.rig && e.rig.own)) ids.push(A.sprite(e.sprite, e.size * k, e.variant));
if (e.charB) {
const b = e.charB, sk = e.size / def.h * k;
for (const part of b.parts) { if (part.startsWith('pupil')) continue; const pd = A.defs.get(b.id + ':' + part); if (!pd) continue;
const faces = part === 'face' ? FACES.concat(FACES.map(f => f + '.b')) : [''];
for (const v of faces) ids.push(A.sprite(b.id + ':' + part, pd.h * sk, v)); }
const pd = A.defs.get(b.pupil); ids.push(A.sprite(b.pupil, pd.h * sk, ''), A.sprite(b.pupil, pd.h * sk * 0.7, ''));
} else if (e.rig) { const n = e.rig(e, this.t, e.slots); for (let s = 0; s < n; s++) { const S = e.slots[s]; ids.push(A.sprite(S.name, S.h * (e.size / def.h) * k, S.v || '')); } }
if (e.shadow) ids.push(A.sprite('shadow', Math.abs(e.size * (def.w / def.h)) * 0.7 * 0.26 * k, ''));
}
for (const [name, size, v] of o.sprites || []) ids.push(A.sprite(name, size * k, v || ''));
}
for (const t of o.text || []) textSprite(this.atlas, String(t[0] != null && typeof t !== 'string' ? t[0] : t), { px: 30 * V.scale * this.camera.effZoom, color: ROLE_TEXT(typeof t === 'string' ? 'reward' : t[1] || 'reward'), dir: this.kit.i18n.dir, lang: this.kit.i18n.lang });
for (let i = 0; A.queue.length && i < 4000; i++) A.pump(0, null);
if (o.night || this.kit.theme.dark || this.tod > 0.01) {
for (const id of ids) if (id >= 0) A.variant(id, 'night', true);
for (const id of ids) { const en = A.entries[id]; if (en && /^ch[0-9a-z]+:/.test(en.key)) A.variant(id, 'moon', true); }
}
return ids.filter(id => id >= 0).length;
}
burst(preset, x, y, o) { return this.particles.burst(preset, x, y, o); }
destroy() {
this.dead = true; this.win.removeEventListener('resize', this._onResize); if (this._offSettings) this._offSettings();
if (this._offTheme) this._offTheme(); if (this._offDpr) this._offDpr();
try { this.backend.dispose(); } catch (e) {  }
if (this.el.parentNode) this.el.parentNode.removeChild(this.el);
this.kit.detachStage(this);
}
step(dt) {
if (this.dead) return;
this.t += dt;
for (const e of this.entities) { e.px = e.x; e.py = e.y; }
for (const fn of this.updaters) fn(dt);
const P = this.kit.input.pointer;
for (let i = 0; i < this.entities.length; i++) {
const e = this.entities[i];
for (const b of e.behaviours) b(e, dt);
if (e.invuln > 0) e.invuln -= dt;
if (e.lookAt) {
const at = e.lookAt === 'pointer' ? this.camera.toWorld(P) : e.lookAt;
const dx = at.x - e.x, dy = at.y - (e.y - e.size * 0.6), l = Math.hypot(dx, dy) || 1;
e.lookX += (dx / l - e.lookX) * Math.min(1, dt * 10); e.lookY += (dy / l - e.lookY) * Math.min(1, dt * 10);
}
}
let j = 0; for (let i = 0; i < this.entities.length; i++) { const e = this.entities[i]; if (!e.dead) this.entities[j++] = e; } this.entities.length = j;
this.camera.update(dt);
this.particles.limit = Math.round(this.gov.spec.particles * this.gov.particleK);
this.particles.update(dt, this.t);
for (const f of this.floaters) if (f.on) {
f.t += dt; if (!f.to || f.t < 0.22) f.y -= 46 * dt;
if (f.t >= f.life) { f.on = false; if (f.onArrive) { const fn = f.onArrive; f.onArrive = null; try { fn(); } catch (e) { this.kit.warn(e); } } }
}
this._fireflies(dt);
}
_fireflies() {
const s = this.skyOut; if (!(s.fireflies > 0.01) || this.F.contrast) return;
let n = 0; const P = this.particles; for (let i = 0; i < P.n; i++) if (P.flags[i] & 8) n++;
const target = Math.round(this.gov.spec.fireflies * s.fireflies * (this.reduced ? 0.25 : 1) * this.gov.particleK);
if (n >= target || P.rng() > (n < target / 2 ? 0.35 : 0.1)) return;
const V = this.view, c = this.camera, z = c.effZoom, hw = V.vw / 2 / z, hh = V.vh / 2 / z;
const lit = this.lights.filter(l => l.on && Math.abs(l.x - c.x) < hw + 100);
let x, y;
if (lit.length && P.rng() < 0.6) { const l = lit[(P.rng() * lit.length) | 0]; x = l.x + (P.rng() - 0.5) * 320; y = l.y + 30 + P.rng() * 110; }
else { x = c.x + (P.rng() - 0.5) * hw * 2.1; y = c.y + hh * (0.15 + P.rng() * 0.55); }
P.burst('fireflies', x, y, { n: 1, layer: Z.shadow });
}
render(alpha) {
if (this.dead) return;
if (this.sizeDirty) this._resize();
const A = this.atlas, L = this.list, V = this.view, C = this.camera, F = this.F, now = this.kit.loop.now;
A.pump(4, this.kit.clock);
sky(this.tod, this.skyOut); this._tintSky();
F.tod = this.tod; F.time = now / 1000;
const amb = this.skyOut.ambient; F.ambient[0] = amb[0]; F.ambient[1] = amb[1]; F.ambient[2] = amb[2];
F.renderScale = this.gov.scale; F.bloom = this.gov.bloom && !F.contrast; F.maxLights = this.gov.lights; F.lightK = this.skyOut.lanterns;
V.camX = C.x; V.camY = C.y; V.zoom = C.effZoom; V.shakeX = C.sx; V.shakeY = C.sy; V.shakeRot = C.srot;
L.clear();
if (this.biome !== 'none') { this._emitSky(); this._emitBands(); }
this._emitEntities(alpha);
this._emitParticles();
this._emitFloaters();
this._emitHalos();
this.backend.draw(L, F);
if (this.drawers.length) this._overlay();
const step = this.gov.sample(this.kit.loop.stats[(this.kit.loop.statsI + 119) % 120], now);
if (step && (this.backend.name === 'paper')) this.sizeDirty = true;
this._probeHigh(now);
}
_tintSky() {
const B = BIOMES[this.biome], t = B && B.sky; if (!t) return;
if (!this._tint || this._tintFor !== this.biome) { this._tint = [hexToOklab(t[0]), hexToOklab(t[1])]; this._tintFor = this.biome; }
const k = t[2] * (1 - Math.min(1, this.tod * 1.4)), S = this.skyOut;
for (let i = 0; i < 3; i++) { S.top[i] += (this._tint[0][i] - S.top[i]) * k; S.bottom[i] += (this._tint[1][i] - S.bottom[i]) * k; }
}
_probeHigh(now) {
if (this.gov.tier !== 'mid' || this.probedHigh || this.kit.settings.get('graphics') === 'simple') return;
if (!this.probeStart) this.probeStart = now;
if (now - this.probeStart < 2000) return;
this.probedHigh = true;
const cores = (this.win.navigator && this.win.navigator.hardwareConcurrency) || 2;
if (cores >= 8 && this.gov.p90() < 9) this.gov.request('high');
}
_emitSky() {
const L = this.list, A = this.atlas, V = this.view, S = this.skyOut, k = V.scale, t = this.t;
if (this.F.contrast) return;
if (S.stars > 0.01) {
const top = this.bands && this.bands.length ? this.bands[0].top * (this.bandView ? V.vh / this.bandView.vh : 1) / V.vh : 0.45, maxY = Math.max(0.12, Math.min(0.34, top - 0.06));
for (const s of this.stars) {
const id = cachedSprite(A, s.c, 'star', '', s.s * k), y = 0.025 + s.y * s.y * (maxY - 0.025);
const i = L.push(id, s.x * V.vw, y * V.vh, s.s, s.s, Z.sky, 0);
L.alpha[i] = S.stars * (0.5 + 0.35 * Math.sin(t * 0.9 + s.p * 3)) * (1 - 0.6 * s.y); L.lit[i] = 0; L.emis[i] = 1;
}
}
for (let b = 0; b < 2; b++) {
const o = b ? S.moon : S.sun, name = b ? 'moon' : 'sun', size = b ? 120 : 150; if (o.a <= 0.01) continue;
const id = cachedSprite(A, this.bodyC[b], name, '', size * k);
const i = L.push(id, o.x * V.vw, o.y * V.vh, size, size, Z.sky, 0); L.alpha[i] = o.a; L.lit[i] = 0; L.emis[i] = 1;
}
const span = V.vw + 400;
for (const c of this.clouds) {
const id = cachedSprite(A, c.c, 'cloud', '', c.s * k);
let x = (c.x * span + t * c.v - V.camX * 0.05) % span; if (x < 0) x += span;
const i = L.push(id, x - 200, c.y * V.vh, c.s * 160 / 70, c.s, Z.sky, 0); L.lit[i] = 1; L.alpha[i] = 0.96;
const tt = Math.pow(Math.min(1, c.y + 0.12), 1.15), rgb = oklabToRgb(S.top[0] + (S.bottom[0] - S.top[0]) * tt, S.top[1] + (S.bottom[1] - S.top[1]) * tt, S.top[2] + (S.bottom[2] - S.top[2]) * tt);
L.tr[i] = 1 - (1 - Math.min(255, rgb[0]) / 255) * 0.2; L.tg[i] = 1 - (1 - Math.min(255, rgb[1]) / 255) * 0.2; L.tb[i] = 1 - (1 - Math.min(255, rgb[2]) / 255) * 0.2;
}
}
_emitBands() {
const V = this.view, L = this.list, A = this.atlas, now = this.kit.loop.now;
const count = TIER_SPEC[this.gov.tier].bands;
const shape = this.biome + '#' + count, size = Math.round(V.vw) + 'x' + Math.round(V.vh) + '@' + Math.round(V.scale * 10);
const want = shape + '|' + size;
if (want !== this.bandWant) { this.bandWant = want; this.bandWantAt = now; }
const shapeChanged = !this.bands || !this.bandKey.startsWith(shape + '|');
if (want !== this.bandKey && (shapeChanged || now - this.bandWantAt >= 150)) {
this.bandKey = want;
this.bands = biomeBands(this.doc, { biome: this.biome, vw: V.vw, vh: V.vh, pxk: V.scale, seed: this.seed, count });
this.bandView = { vw: V.vw, vh: V.vh };
const ids = [];
this.bands.forEach((b, i) => {
const old = this.bandIds[i], e = old != null ? A.entries[old] : null;
if (e && e.alive) ids.push(A.replace(old, b.canvas, b.mask));
else { const id = A.dedicated('band|' + i, b.canvas); A.setMask(id, b.mask); ids.push(id); }
});
for (let i = this.bands.length; i < this.bandIds.length; i++) { const e = A.entries[this.bandIds[i]]; if (e && e.alive) A.freePage(e.page); }
this.bandIds = ids;
}
const sx = V.vw / this.bandView.vw, sy = V.vh / this.bandView.vh;
const red = this.reduced, flat = this.F.contrast;
for (let bi = 0; bi < this.bands.length; bi++) {
const b = this.bands[bi], id = this.bandIds[bi];
const par = flat ? 0 : red ? Math.min(b.par, 0.2) : b.par;
const W = b.w * sx; let x0 = -((V.camX * par) % W); if (x0 > 0) x0 -= W;
const layer = bi < this.bands.length - 2 ? Z.far : bi === this.bands.length - 2 ? Z.mid : Z.near;
for (let x = x0; x < V.vw; x += W) {
const i = L.push(id, x, b.top * sy, W + 0.5, b.h * sy, layer, 0); L.ax[i] = 0; L.ay[i] = 0; L.lit[i] = layer === Z.near ? 0.4 : 0.15;
}
}
}
_emitEntities(alpha) {
if (this.sortDirty) { this.entities.sort((a, b) => a.layer - b.layer || a.z - b.z); this.sortDirty = false; }
const L = this.list, A = this.atlas, V = this.view, k = V.scale * this.camera.zoom, night = this.tod, t = this.t;
for (let n = 0; n < this.entities.length; n++) {
const e = this.entities[n];
if (!e.visible || e.dead) continue;
const def = A.defs.get(e.sprite); if (!def) continue;
const x = e.px + (e.x - e.px) * alpha, y = e.py + (e.y - e.py) * alpha + e.jy;
const hPx = e.size * k;
const own = e.rig && e.rig.own, cnt = own ? e.rig(e, t, e.slots) : 0;
const h = e.size * e.sy * e.jsy * e.csy * (1 + e.breathe), w = e.size * (def.w / def.h) * e.sx * e.jsx * e.csx * (e.flip ? -1 : 1);
if (e.par === 1) {
const z = this.camera.effZoom, r = (Math.max(Math.abs(w), h) + 60) * z;
if (Math.abs((x - V.camX) * z) > V.vw / 2 + r || Math.abs((y - V.camY) * z) > V.vh / 2 + r) continue;
}
if (e.shadow) {
const sw = Math.abs(e.size * (def.w / def.h)) * 0.7 * e.jsx, sh = sw * 0.26;
const sid = cachedSprite(A, e._sc, 'shadow', '', sh * k);
const gy = e.groundY != null ? e.groundY : y + (1 - (def.ay == null ? 0.5 : def.ay)) * e.size;
const air = Math.max(0, Math.min(1, (gy - (y + (1 - def.ay) * e.size)) / 200));
const i = L.push(sid, x, gy, sw * (1 - air * 0.5), sh * (1 - air * 0.5), Z.shadow, e.par);
L.alpha[i] = (0.18 + 0.12 * night) * e.alpha * (1 - air * 0.6); L.lit[i] = 0;
}
let a = e.alpha; if (e.invuln > 0) a *= this.reduced ? 0.6 : 0.725 + 0.275 * Math.cos(t * 15.708);
if (!own) {
const id = cachedSprite(A, e._c, e.sprite, e.variant, hPx);
const i = L.push(id, x, y, w, h, e.layer, e.par);
L.ax[i] = def.ax == null ? 0.5 : def.ax; L.ay[i] = def.ay == null ? 0.5 : def.ay;
L.rot[i] = e.rot + e.jrot; L.alpha[i] = a; L.flash[i] = e.flashK; L.emis[i] = e.emissive; L.lit[i] = e.lit; L.wind[i] = e.wind; L.grade[i] = e.grade;
if (e.tint) { L.tr[i] = e.tint[0]; L.tg[i] = e.tint[1]; L.tb[i] = e.tint[2]; }
}
if (e.rig) {
const cnt2 = own ? cnt : e.rig(e, t, e.slots), fl = e.flip ? -1 : 1;
const ux = w / def.w, uy = h / def.h, cr = Math.cos(e.rot + e.jrot), sr = Math.sin(e.rot + e.jrot);
for (let s = 0; s < cnt2; s++) {
const S = e.slots[s], pd = A.defs.get(S.name); if (!pd) continue;
const sid = cachedSprite(A, S.c, S.name, S.v || '', S.h * (e.size / def.h) * k);
const lx = S.x * ux, ly = S.y * uy;
const j = L.push(sid, x + lx * cr - ly * sr, y + lx * sr + ly * cr, S.w * ux, S.h * uy, e.layer, e.par);
L.ax[j] = pd.ax == null ? 0.5 : pd.ax; L.ay[j] = pd.ay == null ? 0.5 : pd.ay; L.rot[j] = e.rot + e.jrot + (S.r || 0) * fl; L.alpha[j] = a; L.flash[j] = e.flashK; L.lit[j] = e.lit; L.emis[j] = e.emissive; L.grade[j] = e.grade;
if (e.tint) { L.tr[j] = e.tint[0]; L.tg[j] = e.tint[1]; L.tb[j] = e.tint[2]; }
}
}
}
}
_emitParticles() {
const P = this.particles, L = this.list, A = this.atlas, k = this.view.scale * this.camera.zoom;
if (!this.pcache) { this.pcache = P.spriteNames.map(() => ({ name: '', v: '', b: -1, id: -1 })); this.confettiI = P.spriteNames.indexOf('confetti'); }
const look = this.plook || (this.plook = new Float32Array(2));
for (let i = 0; i < P.n; i++) {
P.look(i, this.t, look);
const s = P.size[i] * look[1]; const si = P.sprite[i];
const id = cachedSprite(A, this.pcache[si], P.spriteNames[si], '', 24 * k);
const j = L.push(id, P.x[i], P.y[i], s, s * (si === this.confettiI ? 0.6 : 1), P.layer[i], 1);
L.rot[j] = P.rot[i]; L.alpha[j] = look[0]; L.tr[j] = P.r[i]; L.tg[j] = P.gg[i]; L.tb[j] = P.b[i];
if (P.add[i]) { L.blend[j] = BLEND_ADD; L.emis[j] = 1; L.lit[j] = 0; }
}
}
_emitFloaters() {
const L = this.list;
for (const f of this.floaters) {
if (!f.on) continue;
const k = f.t / f.life, pop = f.t < 0.12 ? 0.6 + (f.t / 0.12) * 0.5 : 1.1 - Math.min(0.1, (f.t - 0.12));
if (f.to && f.t >= 0.22) {
const q = ease.cubicIn(Math.min(1, (f.t - 0.22) / (f.life - 0.22))), p = this.camera.toScreen({ x: f.x, y: f.y }), sc = (1 - 0.35 * q) * this.camera.effZoom;
const i = L.push(f.id, p.x + (f.to.x - p.x) * q, p.y + (f.to.y - p.y) * q, f.w * sc, f.h * sc, Z.text, 0); L.lit[i] = 0;
continue;
}
const i = L.push(f.id, f.x, f.y, f.w * pop, f.h * pop, Z.text, 1);
L.alpha[i] = f.to || k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4; L.lit[i] = 0;
}
}
_emitHalos() {
const L = this.list, A = this.atlas, k = this.view.scale, S = this.skyOut;
for (const l of this.lights) {
if (l.follow) { l.x = l.follow.x; l.y = l.follow.y + l.dy; }
const nk = l.night ? S.lanterns : 1;
l.intensity = l.base * (l.flicker && !this.reduced ? 0.92 + 0.08 * Math.sin(this.t * 7 + l.phase) * Math.sin(this.t * 3.1 + l.phase) : 1) * (l.on ? 1 : 0);
if (!l.halo || !l.on || nk <= 0.01) continue;
const r = l.radius * 0.5;
const id = cachedSprite(A, this.glowC, 'glow', '', r * 2 * k * 0.5);
const i = L.push(id, l.x, l.y, r * 2, r * 2, Z.shadow, 1);
L.blend[i] = BLEND_ADD; L.emis[i] = 0.12; L.lit[i] = 0; L.alpha[i] = Math.min(0.9, (this.backend.name === 'glaze' ? 0.22 : 0.42) * l.intensity * nk);
L.tr[i] = l.r; L.tg[i] = l.g; L.tb[i] = l.b;
}
this.F.lightK = S.lanterns;
}
_overlay() {
if (!this.overlay) { this.overlay = this.doc.createElement('canvas'); this.overlay.setAttribute('aria-hidden', 'true'); this.el.appendChild(this.overlay); }
const o = this.overlay, f = this.fit; if (o.width !== f.pw || o.height !== f.ph) { o.width = f.pw; o.height = f.ph; }
const ctx = o.getContext('2d'), V = this.view, z = V.zoom;
ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, o.width, o.height);
ctx.setTransform(V.scale * z, 0, 0, V.scale * z, V.offX + (V.vw / 2 - V.camX * z + V.shakeX) * V.scale, V.offY + (V.vh / 2 - V.camY * z + V.shakeY) * V.scale);
for (const fn of this.drawers) { ctx.save(); try { fn(ctx, this.kit.drawKit); } catch (e) { this.kit.warn(e); } ctx.restore(); }
}
frameStats() {
const s = this.kit.loop.frameStats();
let fireflies = 0; for (let i = 0; i < this.particles.n; i++) if (this.particles.flags[i] & 8) fireflies++;
const up = this.backend.uploads || { full: 0, sub: 0, px: 0 };
return { p50: s.p50, p90: s.p90, p95: s.p95, max: s.max, draws: this.backend.draws, pages: this.atlas.livePages, pageSlots: this.atlas.pages.length, bakes: this.atlas.bakes, uploads: { full: up.full, sub: up.sub, px: up.px },
textures: this.backend.texs ? this.backend.texs.filter(t => t && t.tex).length : 0, particles: this.particles.n, fireflies, entities: this.entities.length, tier: this.gov.tier, backend: this.backend.name, scale: this.gov.scale, dpr: this.dpr, govLog: this.gov.log.slice(-8), listGrows: this.list.grows };
}
}
const RIGS = {};
const CHAR_FIELDS = ['skin', 'hair', 'outfit', 'wear', 'mood', 'colors', 'body', 'seed'];
return { RIGS, Stage };
})();
const __m_icons = (function () {
const { PALETTE } = __m_tokens;
const C = (x, y, r) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
const SPARK = 'M12 2.5Q13.4 10.6 21.5 12Q13.4 13.4 12 21.5Q10.6 13.4 2.5 12Q10.6 10.6 12 2.5z';
const HEART = 'M12 20.6C5.2 16.8 3 12.6 3.6 9.2C4.2 5.6 8.6 4.4 12 8.2C15.4 4.4 19.8 5.6 20.4 9.2C21 12.6 18.8 16.8 12 20.6z';
const STAR = 'M12 3l2.6 5.5 6 .8-4.4 4.1 1.1 5.9L12 16.4 6.7 19.3l1.1-5.9-4.4-4.1 6-.8z';
const FLAG = 'M6.5 4.5h11l-2.6 4 2.6 4h-11z';
const SPEAKER = '*M3.5 9.5h3.6L12 5.2v13.6l-4.9-4.3H3.5z';
const ICON_ROLES = { reward: PALETTE.spark[2], danger: PALETTE.coral[2], success: PALETTE.mint[2], card: PALETTE.cream[0] };
const ICONS = {
play: ['*M8 4.8v14.4L19.5 12z'],
pause: ['M9 5.5v13', 'M15 5.5v13'],
sound: [SPEAKER, 'M15.5 9.2a4 4 0 0 1 0 5.6', 'M18.2 6.6a7.6 7.6 0 0 1 0 10.8'],
mute: [SPEAKER, 'M15.8 9.5l5 5', 'M20.8 9.5l-5 5'],
music: ['M9 17.5V6l10-2v11.5', '*' + C(6.5, 17.5, 2.6), '*' + C(16.5, 15.5, 2.6)],
settings: [C(12, 12, 3.4), 'M12 2.8v2.8M12 18.4v2.8M2.8 12h2.8M18.4 12h2.8M5.5 5.5l2 2M16.5 16.5l2 2M5.5 18.5l2-2M16.5 7.5l2-2'],
restart: ['M4.5 12a7.5 7.5 0 1 0 2.4-5.5', 'M4.5 3.5v4.5H9'],
home: ['card:M3.5 11.5L12 4.5l8.5 7v8.5h-17z', 'M10 20v-5h4v5'],
check: ['M5 12.5l4.5 4.5L19 7.5'],
cross: ['M6.5 6.5l11 11', 'M17.5 6.5l-11 11'],
hint: ['card:M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z', 'M9.5 18.5h5', 'M10.5 21h3'],
lock: ['card:M5.5 11h13v10h-13z', 'M8.5 11V8a3.5 3.5 0 0 1 7 0v3', 'M12 15v2'],
unlock: ['card:M5.5 11h13v10h-13z', 'M8.5 11V8a3.5 3.5 0 0 1 6.8-1.2', 'M12 15v2'],
left: ['M19 12H5', 'M11 6l-6 6 6 6'],
right: ['M5 12h14', 'M13 6l6 6-6 6'],
up: ['M12 19V5', 'M6 11l6-6 6 6'],
down: ['M12 5v14', 'M6 13l6 6 6-6'],
back: ['M15 5l-7 7 7 7'],
next: ['M9 5l7 7-7 7'],
heart: ['danger:' + HEART],
'heart-off': [HEART],
spark: ['reward:' + SPARK],
'spark-off': [SPARK],
star: ['reward:' + STAR],
'star-off': [STAR],
flag: ['M6.5 21V3.5', 'success:' + FLAG],
'flag-off': ['M6.5 21V3.5', FLAG],
coin: ['reward:' + C(12, 12, 8.5), 'M12 8v8', 'M9.8 10h3.4a1.4 1.4 0 0 1 0 2.8h-2.4a1.4 1.4 0 0 0 0 2.8h3.4'],
gem: ['reward:M6.5 4.5h11L21 9.5l-9 10.5L3 9.5z', 'M3 9.5h18', 'M9.5 4.5L12 9.5l2.5-5'],
trophy: ['reward:M7.5 4h9v5a4.5 4.5 0 0 1-9 0z', 'M7.5 6H4.5a3 3 0 0 0 3.2 4', 'M16.5 6h3a3 3 0 0 1-3.2 4', 'M12 13.5v3.5', 'M8 21h8', 'M9 17h6'],
key: ['reward:' + C(8, 12, 4.2), 'M12.2 12H21', 'M18 12v3', 'M21 12v2.5'],
timer: ['card:' + C(12, 13.5, 7.8), 'M12 9.5v4l2.5 2', 'M10 2.5h4'],
clock: ['card:' + C(12, 12, 9), 'M12 7v5l3.5 2'],
move: ['M12 3v18', 'M3 12h18', 'M9 6l3-3 3 3', 'M9 18l3 3 3-3', 'M6 9l-3 3 3 3', 'M18 9l3 3-3 3'],
jump: ['M12 16V4', 'M7 9l5-5 5 5', 'M5 20.5h14'],
tap: ['*' + C(12, 12, 3), C(12, 12, 7.5)],
drag: ['*' + C(6, 12, 2.6), 'M10.5 12h9', 'M16 8.5l3.5 3.5-3.5 3.5'],
info: ['card:' + C(12, 12, 9), 'M12 11v6', 'M12 7.5v.2'],
question: ['card:' + C(12, 12, 9), 'M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1 1-1.1 1.7v.6', 'M12 17v.2'],
menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
plus: ['M12 5v14', 'M5 12h14'],
minus: ['M5 12h14'],
speak: ['card:M4 5h16v11H10l-5 4v-4H4z', 'M8 10.5h8'],
captions: ['card:M3 6h18v12H3z', 'M6.5 12h4', 'M13 12h4.5', 'M6.5 15h7'],
contrast: [C(12, 12, 9), '*M12 3a9 9 0 0 1 0 18z'],
swap: ['M7 7.5h13', 'M16 3.5l4 4-4 4', 'M17 16.5H4', 'M8 12.5l-4 4 4 4'],
eye: ['card:M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z', '*' + C(12, 12, 3.2)],
book: ['card:M3.5 5h6a2.5 2.5 0 0 1 2.5 2.5V20a2 2 0 0 0-2-2H3.5z', 'card:M20.5 5h-6A2.5 2.5 0 0 0 12 7.5V20a2 2 0 0 1 2-2h6.5z'],
pencil: ['card:M4 20l1-5L16 4l4 4L9 19z', 'M13.5 6.5l4 4'],
gamepad: ['card:M7 8h10a4.5 4.5 0 0 1 0 9c-1.2 0-2-.6-2.6-1.5h-4.8C9 16.4 8.2 17 7 17a4.5 4.5 0 0 1 0-9z', 'M7.5 10.8v3.4', 'M5.8 12.5h3.4', 'M15.8 11.6v.1', 'M17.8 13.4v.1'],
fullscreen: ['M4 9V4h5', 'M20 9V4h-5', 'M4 15v5h5', 'M20 15v5h-5'],
user: ['card:' + C(12, 8, 4), 'M4.5 21a7.5 7.5 0 0 1 15 0'],
quit: ['M10 4H5v16h5', 'M14 8l4 4-4 4', 'M18 12H9'],
};
const ICON_NAMES = Object.keys(ICONS);
function icon(name, o = {}) {
const parts = ICONS[name] || ICONS.question;
const size = o.size || 24, sw = o.stroke || 2.5;
const body = parts.map(d => {
if (d[0] === '*') return `<path d="${d.slice(1)}" fill="currentColor"/>`;
const m = /^(reward|danger|success|card):/.exec(d);
if (m) return `<path class="ok-i-${m[1]}" d="${d.slice(m[0].length)}" fill="var(${m[1] === 'card' ? '--ok-icon-card' : '--ok-fill'},${ICON_ROLES[m[1]]})"/>`;
return `<path d="${d}"/>`;
}).join('');
const a11y = o.label ? ` role="img" aria-label="${String(o.label).replace(/[<>&"]/g, '')}"` : ' aria-hidden="true"';
return `<svg class="ok-i" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" focusable="false"${a11y}>${body}</svg>`;
}
return { ICONS, ICON_NAMES, ICON_ROLES, icon };
})();
const __m_screens = (function () {
const { PALETTE, INK, CREAM } = __m_tokens;
const { icon } = __m_icons;
const P = PALETTE;
const WORDMARK = `<svg viewBox="0 -24 616 184" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"><circle cx="60" cy="100" r="36"/><circle cx="172" cy="100" r="36"/><path d="M248 136V95a30 30 0 0 1 60 0v41M308 95a30 30 0 0 1 60 0v41"/><path d="M408 14v122"/><circle cx="444" cy="100" r="36"/><circle cx="556" cy="100" r="36"/><path d="M592 64v72"/></g><g fill="currentColor"><circle cx="67" cy="94" r="12"/><circle cx="179" cy="94" r="12"/></g><path d="M300-14q4 22 26 26q-22 4-26 26q-4-22-26-26q22-4 26-26z" fill="${P.spark[2]}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/></svg>`;
const SCREEN_CSS = `
.ok-modal{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:calc(16px + env(safe-area-inset-top)) calc(16px + env(safe-area-inset-right)) calc(16px + env(safe-area-inset-bottom)) calc(16px + env(safe-area-inset-left));z-index:20;animation:ok-fade 200ms ease-out}
.ok-scrim{background:var(--ok-scrim);-webkit-backdrop-filter:saturate(.75) blur(2px);backdrop-filter:saturate(.75) blur(2px)}
.ok-win.ok-scrim{background:radial-gradient(closest-side,var(--ok-scrim) 35%,transparent);-webkit-backdrop-filter:none;backdrop-filter:none}
.ok-ask.ok-side-start{justify-content:flex-start}.ok-ask.ok-side-end{justify-content:flex-end}
.ok-asker{display:flex;align-items:center;gap:10px;font-weight:700;margin:-10px 0 -6px}.ok-asker canvas{display:block}
.ok-scrimlayer{position:absolute;inset:0;z-index:-1;background:var(--ok-scrim);-webkit-backdrop-filter:saturate(.75) blur(2px);backdrop-filter:saturate(.75) blur(2px);pointer-events:none}
.ok-ask.ok-top{align-items:flex-start}
.ok-card{position:relative;background:var(--ok-card);color:var(--ok-text);border:3px solid ${INK};border-radius:32px;box-shadow:0 8px 0 ${INK};padding:28px 24px 24px;
  width:min(440px,100%);max-height:100%;overflow:auto;text-align:center;display:flex;flex-direction:column;align-items:center;gap:14px;animation:ok-pop 320ms cubic-bezier(.34,1.56,.64,1)}
.ok-night .ok-card{border-color:${CREAM}33;box-shadow:0 8px 0 #000}
.ok-h1{margin:0;font-weight:800;font-size:clamp(2rem,7vmin,3.6rem);line-height:1.02;font-variation-settings:"opsz" 72;color:var(--ok-text);
  -webkit-text-stroke:0;paint-order:stroke fill;text-wrap:balance}
.ok-h2{margin:0;font-weight:800;font-size:1.7em;line-height:1.1;font-variation-settings:"opsz" 48;text-wrap:balance}
.ok-p{margin:0;font-weight:600;font-size:1.05em;line-height:1.4;max-width:34ch;text-wrap:pretty}
.ok-row{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;align-items:center}
.ok-col{display:flex;flex-direction:column;gap:10px;align-items:stretch;width:100%;max-width:300px}
.ok-portrait{display:block;filter:none}
.ok-title-screen{flex-direction:column;justify-content:flex-start;padding-top:calc(max(18px,5vh) + env(safe-area-inset-top))}
/* the title block sits above the horizon (the cast stands on the ground below it, never behind the button); its soft
   cream glow falls off radially and never reaches the characters */
.ok-title-block{position:relative;display:flex;flex-direction:column;align-items:center;gap:clamp(8px,1.6vh,16px);max-height:min(64vh,calc(100% - 24vh));padding:4px 28px 10px}
.ok-title-block::before{content:"";position:absolute;inset:-6% -14%;z-index:-1;background:radial-gradient(closest-side,var(--ok-glow) 30%,transparent);pointer-events:none}
.ok-title-screen .ok-h1{font-size:clamp(2.5rem,min(10.5vmin,13vw),5.4rem);line-height:1.02;letter-spacing:.005em;color:${CREAM};margin:0 0 .16em;text-shadow:none;text-align:center}
/* each word is a sticker: Ink outline over its fill, a Cream rim around that, and an Ink drop below (two layers of the
   same word behind it), popping in with backOut */
.ok-title-screen .ok-title-word{position:relative;display:inline-block;isolation:isolate;-webkit-text-stroke:.1em ${INK};paint-order:stroke fill;animation:ok-sticker 640ms cubic-bezier(.34,1.56,.64,1) both}
.ok-title-screen .ok-title-word::before,.ok-title-screen .ok-title-word::after{content:attr(data-t);position:absolute;inset:0;z-index:-1;color:${CREAM};-webkit-text-stroke:.32em ${CREAM};paint-order:stroke fill;pointer-events:none}
.ok-title-screen .ok-title-word::after{z-index:-2;color:${INK};-webkit-text-stroke:.32em ${INK};transform:translateY(.1em)}
.ok-title-screen .ok-title-word:nth-child(4n+1){color:${P.mint[2]}}
.ok-title-screen [lang|=ar] .ok-title-word,.ok-ui[lang|=ar] .ok-title-screen .ok-h1,.ok-ui[lang|=he] .ok-title-screen .ok-h1{line-height:1.15}
.ok-hero-wrap{animation:ok-bob 2.4s ease-in-out infinite;margin-bottom:-10px}
.ok-brand{display:inline-flex;align-items:center;gap:6px;font-weight:800;font-size:.85em;color:var(--ok-text);opacity:.9}
.ok-brand svg{height:1.25em;width:auto}
.ok-title-screen .ok-p{text-align:center;background:var(--ok-card);border:2.5px solid ${INK};box-shadow:0 3px 0 ${INK};border-radius:18px;padding:8px 16px;max-width:min(40ch,calc(100vw - 48px));font-size:clamp(.95em,2.4vmin,1.1em)}
.ok-night .ok-title-screen .ok-p{border-color:${CREAM}55;box-shadow:0 3px 0 #000}
.ok-corner{position:fixed;top:calc(12px + env(safe-area-inset-top));inset-inline-end:calc(12px + env(safe-area-inset-right));display:flex;gap:8px}
.ok-sparks{display:flex;gap:6px;justify-content:center}
.ok-sparks .ok-slot{width:clamp(52px,14vmin,76px);height:clamp(52px,14vmin,76px);color:${INK};--ok-fill:${P.stone[0]}}
.ok-sparks .ok-slot svg{width:100%;height:100%;stroke-width:1.5}
.ok-night .ok-sparks .ok-slot{--ok-fill:#3A3933}
.ok-sparks .ok-slot:nth-child(2){transform:translateY(-10px) scale(1.12)}
.ok-sparks .ok-on{--ok-fill:${P.spark[2]};animation:ok-land 420ms cubic-bezier(.34,1.56,.64,1)}
.ok-score{font-weight:800;font-size:2.2em;font-variant-numeric:tabular-nums;line-height:1}
.ok-best{font-weight:600;color:var(--ok-text);opacity:.8}
.ok-badge{display:inline-flex;align-items:center;gap:6px;background:${P.spark[2]};color:${INK};border:2px solid ${INK};border-radius:999px;padding:4px 14px;font-weight:800;animation:ok-pop 320ms cubic-bezier(.34,1.56,.64,1);transform:rotate(-3deg)}
.ok-badge svg{width:1.1em;height:1.1em}
.ok-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;width:100%}
.ok-howcard{background:var(--ok-bg2);border:2px solid var(--ok-edge);border-radius:20px;padding:14px 10px;display:flex;flex-direction:column;align-items:center;gap:8px;font-weight:600;line-height:1.3;animation:ok-pop 320ms cubic-bezier(.34,1.56,.64,1) both}
.ok-howcard svg{width:44px;height:44px;color:var(--ok-text)}
.ok-count{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:25}
.ok-count b{font-weight:800;font-size:clamp(5rem,30vmin,14rem);color:${CREAM};-webkit-text-stroke:max(3px,1.4vmin) ${INK};paint-order:stroke fill;font-variant-numeric:tabular-nums;animation:ok-countpop 700ms cubic-bezier(.34,1.56,.64,1) both}
.ok-count b.ok-go{color:${P.mint[2]}}
.ok-set{width:min(520px,100%)}
.ok-set .ok-srow{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;padding:8px 0;border-bottom:2px dashed var(--ok-line);text-align:start;font-weight:700}
.ok-seg{display:inline-flex;border:2px solid ${INK};border-radius:999px;overflow:hidden;flex-shrink:0}
.ok-seg button{font:inherit;font-weight:700;min-height:44px;min-width:44px;padding:0 12px;border:0;background:${CREAM};color:${INK};cursor:pointer}
.ok-seg button+button{border-inline-start:2px solid ${INK}}
.ok-seg button[aria-pressed=true]{background:${P.mint[2]}}
.ok-switch{position:relative;width:64px;height:40px;border-radius:999px;border:2px solid ${INK};background:${P.stone[0]};cursor:pointer;flex-shrink:0;padding:0}
.ok-switch::after{content:"";position:absolute;top:4px;inset-inline-start:4px;width:28px;height:28px;border-radius:50%;background:${CREAM};border:2px solid ${INK};transition:inset-inline-start 160ms ease-out}
.ok-switch[aria-checked=true]{background:${P.mint[2]}}
.ok-switch[aria-checked=true]::after{inset-inline-start:24px}
.ok-ask .ok-card{width:min(560px,100%)}
.ok-q{font-weight:800;margin:0;font-size:clamp(1.6rem,6vmin,2.6rem);line-height:1.15;font-variant-numeric:tabular-nums;text-wrap:balance}
.ok-tiles{display:grid;grid-template-columns:1fr 1fr;gap:12px;width:100%}
.ok-tile{position:relative;font:inherit;font-weight:800;font-size:clamp(1.4rem,5vmin,2.1rem);min-height:72px;border-radius:22px;border:3px solid ${INK};background:${CREAM};color:${INK};
  box-shadow:0 5px 0 ${INK};cursor:pointer;transition:transform 80ms ease-out,box-shadow 80ms ease-out;font-variant-numeric:tabular-nums}
.ok-tile:active{transform:translateY(4px);box-shadow:0 1px 0 ${INK}}
.ok-tile .ok-key{position:absolute;top:6px;inset-inline-start:8px;font-size:.5em;font-weight:700;opacity:.55}
.ok-tile .ok-mark{position:absolute;top:-12px;inset-inline-end:-10px;width:34px;height:34px;border-radius:50%;border:2px solid ${INK};display:flex;align-items:center;justify-content:center;animation:ok-pop 320ms cubic-bezier(.34,1.56,.64,1)}
.ok-tile .ok-mark svg{width:22px;height:22px}
.ok-tile.ok-right{background:${P.mint[1]}}.ok-tile.ok-right .ok-mark{background:${P.mint[2]};border-radius:50%}
.ok-tile.ok-bad{background:${P.coral[0]};animation:ok-wobble 420ms ease-out}.ok-tile.ok-bad .ok-mark{background:${P.coral[2]};border-radius:6px;transform:rotate(45deg)}.ok-tile.ok-bad .ok-mark svg{transform:rotate(-45deg)}
.ok-hint{display:flex;align-items:center;gap:8px;font-weight:700;background:${P.sky[0]};color:${INK};border-radius:16px;padding:8px 14px;animation:ok-pop 320ms cubic-bezier(.34,1.56,.64,1)}
.ok-hint svg{width:1.3em;height:1.3em;flex-shrink:0}
.ok-banner{position:fixed;top:calc(76px + env(safe-area-inset-top));left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:10px;padding:10px 20px 10px 12px;border:3px solid ${INK};border-radius:999px;
  font-weight:800;font-size:1.15em;color:${INK};box-shadow:0 5px 0 ${INK};z-index:22;animation:ok-drop 420ms cubic-bezier(.34,1.56,.64,1);max-width:calc(100vw - 32px)}
.ok-banner .ok-mark{width:34px;height:34px;flex-shrink:0;display:flex;align-items:center;justify-content:center;border:2px solid ${INK};background:${CREAM}}
.ok-banner .ok-mark svg{width:22px;height:22px}
.ok-banner.ok-correct{background:${P.mint[2]}}.ok-banner.ok-correct .ok-mark{border-radius:50%}
.ok-banner.ok-wrong{background:${P.coral[1]}}.ok-banner.ok-wrong .ok-mark{border-radius:6px;transform:rotate(45deg)}.ok-banner.ok-wrong .ok-mark svg{transform:rotate(-45deg)}
.ok-bubble{position:fixed;max-width:min(86vw,calc(28ch + 72px));background:${CREAM};color:${INK};border:3px solid ${INK};border-radius:24px;padding:14px 18px;box-shadow:0 5px 0 ${INK};font-weight:650;font-size:20px;line-height:1.4;hyphens:none;-webkit-hyphens:none;overflow-wrap:normal;word-break:normal;
  z-index:18;animation:ok-pop 320ms cubic-bezier(.34,1.56,.64,1);transform-origin:var(--ok-tx,50%) 100%;display:flex;gap:12px;align-items:flex-start;cursor:pointer;text-align:start}
.ok-bubble::after{content:"";position:absolute;bottom:-17px;left:var(--ok-tx,50%);margin-left:-14px;width:28px;height:18px;background:${CREAM};clip-path:polygon(0 0,100% 0,30% 100%);
  filter:drop-shadow(0 3px 0 ${INK})}
.ok-bubble::before{content:"";position:absolute;bottom:-22px;left:var(--ok-tx,50%);margin-left:-17px;width:34px;height:23px;background:${INK};clip-path:polygon(0 0,100% 0,29% 100%)}
.ok-bubble .ok-more{position:absolute;bottom:6px;inset-inline-end:10px;width:18px;height:18px;opacity:.6;animation:ok-nudge 900ms ease-in-out infinite}
.ok-bubble .ok-txt{min-height:1.4em;padding-inline-end:12px;max-width:28ch;text-wrap:pretty}
@media (max-width:600px){.ok-bubble{font-size:18px;padding:12px 14px}}
.ok-hud{position:fixed;inset:0;pointer-events:none;padding:calc(10px + env(safe-area-inset-top)) calc(10px + env(safe-area-inset-right)) 0 calc(10px + env(safe-area-inset-left));display:flex;justify-content:space-between;align-items:flex-start;gap:8px;z-index:12}
.ok-hud>div{display:flex;gap:8px;align-items:center;flex-wrap:nowrap;pointer-events:auto;min-width:0}
.ok-pill{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 14px 0 8px;border-radius:999px;background:var(--ok-card);color:var(--ok-text);border:2.5px solid ${INK};box-shadow:0 3px 0 ${INK};font-weight:800;font-size:clamp(1.15rem,3.6vmin,1.5rem);font-variant-numeric:tabular-nums}
.ok-night .ok-pill{border-color:${CREAM}55;box-shadow:0 3px 0 #000}
.ok-pill svg{width:28px;height:28px;flex-shrink:0}
.ok-pill .ok-sp{display:flex}.ok-pill .ok-sp svg{stroke-width:2}
.ok-pill[hidden]{display:none}
.ok-hearts{gap:2px;padding:0 10px}
.ok-hearts svg{transition:transform 200ms;stroke-width:2.2}
.ok-hearts .ok-lost{opacity:.45}
.ok-hearts .ok-pop{animation:ok-heartpop 420ms ease-out}
.ok-timer .ok-clock{width:30px;height:30px;overflow:visible}
.ok-timer .ok-face{fill:${CREAM};stroke:${INK};stroke-width:2.2}.ok-timer .ok-pie{fill:${P.mint[1]}}.ok-timer .ok-hand,.ok-timer .ok-knob{stroke:${INK};stroke-width:2.2;stroke-linecap:round;fill:none}.ok-timer .ok-knob{fill:${INK}}
.ok-timer.ok-low .ok-pie{fill:${P.coral[1]}}.ok-timer.ok-low{animation:ok-pulse 1s ease-in-out infinite}
.ok-progress{width:clamp(120px,24vw,240px);padding:0 8px 0 12px;gap:6px}
.ok-bar{flex:1;height:14px;border-radius:999px;background:${P.stone[0]};border:2px solid ${INK};overflow:hidden;min-width:28px}
.ok-bar i{display:block;height:100%;width:0;background:${P.mint[2]};border-inline-end:2px solid ${INK};transition:width 300ms cubic-bezier(.34,1.56,.64,1)}
.ok-progress .ok-flag{width:22px;height:22px;flex-shrink:0;color:${P.mint[2]}}
.ok-scorepill{position:relative}
.ok-scorepill:has(.ok-combo:not([hidden])){padding-inline-end:24px}
.ok-combo{position:absolute;top:-11px;inset-inline-end:-10px;min-height:0;padding:1px 7px;border-radius:999px;border:2px solid ${INK};font-weight:800;font-size:.8em;background:${P.grape[1]};color:${INK};box-shadow:0 2px 0 ${INK}}
.ok-combo.ok-bump{animation:ok-pop 320ms cubic-bezier(.34,1.56,.64,1)}
.ok-hud .ok-btn.ok-icon{min-height:48px;width:48px}
/* phones: one compact row (counter, hearts, clock, flag meter, and one menu button: sound lives in the pause screen) */
@media (max-width:600px){
  .ok-hud{padding:calc(8px + env(safe-area-inset-top)) calc(8px + env(safe-area-inset-right)) 0 calc(8px + env(safe-area-inset-left));gap:6px}
  .ok-hud>div{gap:5px}
  .ok-pill{min-height:40px;padding:0 9px 0 6px;font-size:1.02rem;gap:4px;border-width:2px;box-shadow:0 2px 0 ${INK}}
  .ok-pill svg,.ok-timer .ok-clock{width:21px;height:21px}
  .ok-hearts{gap:0;padding:0 6px}
  .ok-progress{width:auto;padding:0 8px}.ok-progress .ok-bar{width:34px;flex:none;height:12px}.ok-progress .ok-flag{width:18px;height:18px}
  .ok-hud .ok-sound{display:none}
}
.ok-dialog .ok-card{width:min(480px,100%)}
.ok-pause .ok-srow{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;font-weight:700;padding:2px 4px}
@keyframes ok-fade{from{opacity:0}}
@keyframes ok-pop{0%{transform:scale(.6);opacity:0}70%{transform:scale(1.04);opacity:1}100%{transform:scale(1)}}
@keyframes ok-drop{0%{transform:translateY(-40px) scale(.8);opacity:0}100%{transform:none;opacity:1}}
.ok-banner{animation-name:ok-bannerdrop}
@keyframes ok-bannerdrop{0%{transform:translate(-50%,-40px) scale(.8);opacity:0}100%{transform:translate(-50%,0);opacity:1}}
@keyframes ok-sticker{0%{transform:translateY(-30px) scale(.4) rotate(-8deg);opacity:0}60%{transform:translateY(2px) scale(1.08) rotate(2deg);opacity:1}100%{transform:none}}
@keyframes ok-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
@keyframes ok-land{0%{transform:scale(2.2) rotate(-40deg);opacity:0}60%{transform:scale(.9) rotate(6deg);opacity:1}100%{transform:none}}
@keyframes ok-countpop{0%{transform:scale(2.4);opacity:0}30%{transform:scale(.92);opacity:1}45%{transform:scale(1.04)}80%{transform:scale(1);opacity:1}100%{transform:scale(.8);opacity:0}}
@keyframes ok-wobble{0%,100%{transform:none}20%{transform:translateX(-8px) rotate(-2deg)}40%{transform:translateX(7px) rotate(2deg)}60%{transform:translateX(-5px)}80%{transform:translateX(3px)}}
@keyframes ok-heartpop{0%{transform:scale(1)}40%{transform:scale(1.5)}100%{transform:scale(1)}}
@keyframes ok-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}
@keyframes ok-nudge{0%,100%{transform:translateY(0)}50%{transform:translateY(3px)}}
.ok-rm .ok-modal,.ok-rm .ok-card,.ok-rm .ok-hero-wrap,.ok-rm .ok-title-word,.ok-rm .ok-on,.ok-rm .ok-badge,.ok-rm .ok-howcard,.ok-rm .ok-tile,.ok-rm .ok-banner,.ok-rm .ok-bubble,.ok-rm .ok-hint,.ok-rm .ok-pop,.ok-rm .ok-low,.ok-rm .ok-bump,.ok-rm .ok-more{animation:ok-fade 200ms ease-out!important}
.ok-rm .ok-count b{animation:ok-countfade 700ms both!important}
@keyframes ok-countfade{0%,100%{opacity:0}20%,80%{opacity:1}}
@media (max-width:420px){.ok-card{padding:22px 16px 18px;border-radius:26px}.ok-tiles{gap:10px}}
`;
function textDir(s) {
const m = /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF\u0590-\u08FF\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/.exec(String(s));
return m && /[\u0590-\u08FF]/.test(m[0]) ? 'rtl' : 'ltr';
}
function distractors(answer, n = 4, seedText = '') {
const a = Number(answer); n = Math.max(2, Math.min(4, n | 0));
if (!isFinite(a)) return [String(answer)];
let h = 2166136261; for (const ch of seedText + '|' + a) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
const pool = [a + 1, a - 1, a + 2, a - 2, a + 10, a - 10, a + 5, a - 5, a * 2, Math.round(a / 2)].filter(x => x >= 0 && x !== a && Number.isInteger(x) === Number.isInteger(a));
const out = [a]; while (out.length < n && pool.length) { const x = pool.splice((rnd() * Math.min(pool.length, 6)) | 0, 1)[0]; if (!out.includes(x)) out.push(x); }
for (let i = out.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [out[i], out[j]] = [out[j], out[i]]; }
return out.map(String);
}
function screens(kit) {
const doc = kit.doc, T = (k, v) => kit.i18n.t(k, v), ui = kit.ui;
const el = (tag, cls, html) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const txt = (tag, cls, s) => { const e = el(tag, cls); e.textContent = String(s); return e; };
const gtxt = (tag, cls, s) => { const e = txt(tag, cls, s); e.dir = textDir(s); return e; };
const later = (ms, fn) => kit.loop.ui.after(ms, fn);
const reduced = () => kit.settings.reduced;
const stage = () => kit.stage;
const btn = (label, kind, onPress, o = {}) => { const b = ui.button(label, Object.assign({ kind, onPress }, o)); return b; };
let open = 0;
function modal(kind, o = {}) {
const root = el('div', 'ok-modal ok-' + kind + (o.scrim === false ? '' : ' ok-scrim'));
root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true');
const card = o.bare ? root : el('div', 'ok-card');
if (!o.bare) root.appendChild(card);
const prev = doc.activeElement; let resolve;
const done = new Promise(r => { resolve = r; });
const pause = o.pause !== false; if (pause) kit.loop.pause('ui:' + kind);
open++;
const keys = e => {
const top = [...doc.querySelectorAll('.ok-modal')].pop(); if (top !== root) return;
const bs = [...root.querySelectorAll('button:not([disabled])')]; if (!bs.length) return;
const i = bs.indexOf(doc.activeElement);
if (e.key === 'Tab') { e.preventDefault(); bs[(i + (e.shiftKey ? -1 : 1) + bs.length) % bs.length].focus(); }
else if (/^Arrow/.test(e.key)) {
const rtl = kit.i18n.dir === 'rtl', back = e.key === 'ArrowUp' || (e.key === 'ArrowLeft' && !rtl) || (e.key === 'ArrowRight' && rtl);
e.preventDefault(); bs[(Math.max(0, i) + (back ? -1 : 1) + bs.length) % bs.length].focus();
} else if (e.key === 'Escape' && o.onEscape) { e.preventDefault(); o.onEscape(); }
else if (o.onKey) o.onKey(e);
e.stopPropagation();
};
root.tabIndex = -1; doc.addEventListener('keydown', keys, true);
const close = v => {
if (!root.parentNode) return;
root.parentNode.removeChild(root); open--; doc.removeEventListener('keydown', keys, true);
if (pause) kit.loop.resume('ui:' + kind);
try { if (prev && prev.focus) prev.focus(); } catch (e) {  }
resolve(v);
};
ui.mount().appendChild(root);
later(0, () => { const f = root.querySelector('[data-ok-focus]') || root.querySelector('button'); if (f) f.focus({ preventScroll: true }); });
return { root, card, close, done };
}
const announce = s => ui.announce(s);
function portrait(spec, o = {}) {
const px = o.size || 160, dpr = Math.min(2, kit.win.devicePixelRatio || 1);
const c = kit.portraitCanvas(spec || kit.meSpec(), Math.round(px * dpr), o.mood);
c.className = 'ok-portrait'; c.style.height = px + 'px'; c.style.width = Math.round(px * c.width / c.height) + 'px';
c.setAttribute('aria-hidden', 'true');
return c;
}
const S = {
portrait,
title(o = {}) {
const m = modal('title-screen', { bare: true, scrim: false, pause: o.pause === true });
const block = el('div', 'ok-title-block'); m.root.appendChild(block);
if (o.brand !== false) { const b = el('div', 'ok-brand', WORDMARK); b.setAttribute('dir', 'ltr'); block.appendChild(b); }
if (o.hero !== false) { const w = el('div', 'ok-hero-wrap'); w.appendChild(portrait(o.hero, { size: o.heroSize || 120, mood: 'happy' })); block.appendChild(w); }
const h = el('h1', 'ok-h1'); h.id = 'ok-t-' + (++uid); h.dir = textDir(o.title || '');
String(o.title || '').split(/(\s+)/).forEach((w, i) => { if (/^\s+$/.test(w)) h.appendChild(doc.createTextNode(w)); else { const s = txt('span', 'ok-title-word', w); s.setAttribute('data-t', w); s.style.animationDelay = (120 + i * 70) + 'ms'; h.appendChild(s); } });
m.root.setAttribute('aria-labelledby', h.id); block.appendChild(h);
if (o.subtitle) block.appendChild(gtxt('p', 'ok-p', o.subtitle));
const play = btn(T('play'), 'hot', () => { kit.sfx('whoosh'); m.close(); if (o.play) o.play(); }, { big: true, icon: icon('play') });
play.setAttribute('data-ok-focus', '');
block.appendChild(play);
const corner = el('div', 'ok-corner'); corner.appendChild(btn(T('settings'), 'icon', () => S.settings(), { icon: icon('settings') })); m.root.appendChild(corner);
return m.done;
},
howTo(cards = []) {
const m = modal('howto'); m.card.appendChild(txt('h2', 'ok-h2', T('howTo')));
const g = el('div', 'ok-cards');
cards.slice(0, 3).forEach((c, i) => { const d = el('div', 'ok-howcard', icon(c.icon || 'tap')); d.appendChild(gtxt('span', '', c.text || '')); d.style.animationDelay = (i * 90) + 'ms'; g.appendChild(d); });
m.card.appendChild(g);
const go = btn(T('go'), 'hot', () => m.close(), { big: true }); go.setAttribute('data-ok-focus', ''); m.card.appendChild(go);
return m.done;
},
countdown(n = 3) {
const root = el('div', 'ok-count'); root.setAttribute('aria-live', 'assertive'); ui.mount().appendChild(root);
return new Promise(res => {
const tick = i => {
root.innerHTML = ''; const b = txt('b', i ? '' : 'ok-go', i ? kit.i18n.num(i) : T('go')); root.appendChild(b);
kit.sfx('count', { pitch: i ? 1 : 1.5 });
later(i ? 700 : 600, () => { if (i) tick(i - 1); else { root.remove(); res(); } });
};
tick(Math.max(0, n | 0));
});
},
pause() {
let m;
const pick = v => () => m.close(v);
m = modal('pause', { onEscape: pick('resume') });
m.card.appendChild(txt('h2', 'ok-h2', T('pause')));
const c = el('div', 'ok-col');
const r = btn(T('resume'), 'go', pick('resume'), { big: true, icon: icon('play') }); r.setAttribute('data-ok-focus', '');
c.append(r, btn(T('restart'), 'quiet', pick('restart'), { icon: icon('restart') }), btn(T('settings'), 'quiet', () => S.settings(), { icon: icon('settings') }), btn(T('quit'), 'quiet', pick('quit'), { icon: icon('quit') }));
m.card.appendChild(c);
const row = el('div', 'ok-srow'); row.appendChild(txt('span', '', T('sound')));
const sw = el('button', 'ok-switch'); sw.type = 'button'; sw.setAttribute('role', 'switch'); sw.setAttribute('aria-label', T('sound')); sw.setAttribute('aria-checked', String(!kit.audio.muted));
sw.addEventListener('click', () => { kit.audio.setMuted(!kit.audio.muted); sw.setAttribute('aria-checked', String(!kit.audio.muted)); kit.sfx('select'); kit.emit('sound', !kit.audio.muted); });
row.appendChild(sw); c.appendChild(row);
if (stage()) stage().transition();
return m.done;
},
win(o = {}) {
const stars = Math.max(0, Math.min(3, o.stars == null ? 3 : o.stars | 0)), score = +o.score || 0, best = o.best != null ? +o.best : null;
const m = modal('win', { pause: o.pause !== false });
if (o.hero !== false) m.card.appendChild(portrait(o.hero, { size: 120, mood: 'cheer' }));
m.card.appendChild(txt('h2', 'ok-h2', o.title || T('youWon')));
const row = el('div', 'ok-sparks'); row.setAttribute('role', 'img'); row.setAttribute('aria-label', T('sparks', { n: stars }));
const slots = [0, 1, 2].map(() => { const s = el('span', 'ok-slot', icon('spark')); row.appendChild(s); return s; });
m.card.appendChild(row);
const sc = txt('div', 'ok-score', kit.i18n.num(0)); m.card.appendChild(sc);
const newBest = best != null && score > best;
if (best != null) m.card.appendChild(txt('div', 'ok-best', T('best') + ' ' + kit.i18n.num(Math.max(best, score))));
const again = btn(T('playAgain'), 'quiet', () => m.close('again'), { icon: icon('restart') }), next = btn(T('next'), 'hot', () => m.close('next'), { big: true, icon: icon('next') });
next.setAttribute('data-ok-focus', '');
const r = el('div', 'ok-row'); r.append(again, next); m.card.appendChild(r);
const roll = { v: 0 }; kit.loop.ui.tween(roll, { v: score }, { ms: reduced() ? 1 : 900, ease: 'cubicOut', onUpdate: () => { sc.textContent = kit.i18n.num(Math.round(roll.v)); } }).then(() => { sc.textContent = kit.i18n.num(score); });
slots.forEach((s, i) => { if (i < stars) later(350 + i * 380, () => { s.classList.add('ok-on'); kit.sfx('spark', { pitch: 1 + i * 0.12 }); }); });
later(350 + stars * 380, () => {
if (newBest) { const b = el('div', 'ok-badge', icon('spark')); b.appendChild(doc.createTextNode(T('newBest'))); sc.after(b); kit.sfx('levelup'); }
const s = stage(); if (s && !reduced()) s.burst('confetti', s.camera.x, s.camera.y - s.view.vh * 0.45, { w: s.view.vw * 0.8 }); kit.sfx('win');
});
announce(T('youWon') + ' ' + T('sparks', { n: stars }));
return m.done;
},
tryAgain(o = {}) {
const m = modal('try', { pause: o.pause !== false });
let pic = null;
if (o.hero !== false) { pic = el('div', ''); pic.appendChild(portrait(o.hero, { size: 120, mood: 'sad' })); m.card.appendChild(pic); later(900, () => { pic.innerHTML = ''; pic.appendChild(portrait(o.hero, { size: 120, mood: 'cheer' })); }); }
m.card.appendChild(txt('h2', 'ok-h2', o.title || T('soClose')));
if (o.say) m.card.appendChild(gtxt('p', 'ok-p', o.say));
if (o.score != null) m.card.appendChild(txt('div', 'ok-score', kit.i18n.num(+o.score || 0)));
if (o.best != null) m.card.appendChild(txt('div', 'ok-best', T('best') + ' ' + kit.i18n.num(+o.best || 0)));
const b = btn(T('tryAgain'), 'hot', () => m.close('again'), { big: true, icon: icon('restart') }); b.setAttribute('data-ok-focus', ''); m.card.appendChild(b);
announce(o.title || T('soClose'));
return m.done;
},
settings() {
const m = modal('settings', { onEscape: () => m.close() });
m.card.classList.add('ok-set');
m.card.appendChild(txt('h2', 'ok-h2', T('settings')));
const set = kit.settings, pct = n => kit.i18n.num(n, { style: 'percent' });
const row = (label, ctl) => { const r = el('div', 'ok-srow'); r.appendChild(txt('span', '', label)); r.appendChild(ctl); m.card.appendChild(r); };
const seg = (key, opts) => { const s = el('div', 'ok-seg'); s.setAttribute('role', 'group'); opts.forEach(([v, l]) => { const b = el('button'); b.type = 'button'; b.textContent = l; b.setAttribute('aria-pressed', String(set.get(key) === v)); b.addEventListener('click', () => { set.patch({ [key]: v }); [...s.children].forEach((c, j) => c.setAttribute('aria-pressed', String(opts[j][0] === set.get(key)))); kit.sfx('select'); }); s.appendChild(b); }); return s; };
const sw = (key, label) => { const b = el('button', 'ok-switch'); b.type = 'button'; b.setAttribute('role', 'switch'); b.setAttribute('aria-label', label); b.setAttribute('aria-checked', String(!!set.get(key))); b.addEventListener('click', () => { set.patch({ [key]: !set.get(key) }); b.setAttribute('aria-checked', String(!!set.get(key))); kit.sfx('select'); }); return b; };
row(T('motion'), seg('motion', [['auto', T('motionAuto')], ['reduce', T('motionReduce')], ['full', T('motionFull')]]));
row(T('music'), sw('music', T('music')));
row(T('captions'), sw('captions', T('captions')));
row(T('readAloud'), sw('readAloud', T('readAloud')));
row(T('textSize'), seg('textSize', [[1, pct(1)], [1.25, pct(1.25)], [1.5, pct(1.5)]]));
row(T('speed'), seg('speed', [[0.5, pct(0.5)], [0.75, pct(0.75)], [1, pct(1)]]));
row(T('assist'), seg('assist', [['none', T('assistNone')], ['hearts', T('assistHearts')], ['nofail', T('assistNofail')]]));
row(T('contrast'), sw('contrast', T('contrast')));
row(T('colorCues'), sw('cvd', T('colorCues')));
row(T('leftHanded'), sw('leftHanded', T('leftHanded')));
row(T('graphics'), seg('graphics', [['auto', T('gfxAuto')], ['simple', T('gfxSimple')], ['fancy', T('gfxFancy')]]));
const c = btn(T('close'), 'go', () => m.close(), { big: true, icon: icon('check') }); c.setAttribute('data-ok-focus', ''); m.card.appendChild(c);
return m.done.then(() => { const s = stage(); if (s) s.transition(); });
},
ask(q = {}) {
const want = q.a != null ? q.a : q.answer;
let choices = q.choices;
if (typeof choices === 'number' || choices == null) choices = distractors(want, typeof choices === 'number' ? choices : 4, String(q.q || q.question || ''));
choices = [].concat(choices).slice(0, 4).map(String);
let ans = q.index != null ? q.index | 0 : choices.indexOf(String(want));
if (!(ans >= 0 && ans < choices.length)) {
const msg = `ui.ask: the answer ${JSON.stringify(want != null ? want : q.index)} is not one of the choices ${JSON.stringify(choices)} (give the right value as a: or answer:, or its tile as index:)`;
kit.warn(msg); return Promise.reject(new Error(msg));
}
const tries = Math.max(1, Math.min(choices.length - 1, q.tries == null ? 2 : q.tries | 0));
let done = false, misses = 0;
const m = modal('ask', { onKey: e => { const n = +e.key; if (n >= 1 && n <= tiles.length) tiles[n - 1].click(); } });
const who = q.who && q.who.stage ? q.who : null;
if (who) {
if (who.spec || who.charB) { const a = el('div', 'ok-asker'); a.appendChild(portrait(who.spec || who.charB.spec, { size: 92, mood: 'thinking' })); m.card.prepend(a); }
const s = stage();
if (s && s.fit) {
const p = s.camera.toScreen({ x: who.x, y: who.y - who.size * 0.55 }), x = s.fit.offX + p.x * s.fit.k, y = s.fit.offY + p.y * s.fit.k, r = Math.max(70, who.size * s.fit.k * s.camera.effZoom * 0.75);
const hole = `radial-gradient(circle at ${Math.round(x)}px ${Math.round(y)}px, transparent ${Math.round(r)}px, #000 ${Math.round(r * 1.5)}px)`;
const layer = el('div', 'ok-scrimlayer'); layer.style.webkitMaskImage = hole; layer.style.maskImage = hole;
m.root.classList.remove('ok-scrim'); m.root.prepend(layer);
if (kit.win.innerWidth >= 900) m.root.classList.add(x > kit.win.innerWidth / 2 ? 'ok-side-start' : 'ok-side-end');
else if (y > kit.win.innerHeight * 0.45) m.root.classList.add('ok-top');
}
}
const qe = gtxt('div', 'ok-q', q.q || q.question || ''); qe.id = 'ok-q-' + (++uid); m.root.setAttribute('aria-labelledby', qe.id); m.card.appendChild(qe);
const grid = el('div', 'ok-tiles'); m.card.appendChild(grid);
const mark = (t, ok) => { const s = el('span', 'ok-mark', icon(ok ? 'check' : 'cross', { stroke: 3.2 })); t.appendChild(s); };
let hintShown = false;
const showHint = () => { if (hintShown || !q.hint) return; hintShown = true; const h = el('div', 'ok-hint', icon('hint')); h.appendChild(gtxt('span', '', q.hint)); m.card.appendChild(h); };
const tiles = choices.map((c, i) => {
const t = el('button', 'ok-tile'); t.type = 'button'; t.setAttribute('aria-label', c);
t.appendChild(txt('span', 'ok-key', kit.i18n.num(i + 1))); t.appendChild(gtxt('span', '', c));
t.addEventListener('click', () => {
if (done || t.disabled) return; const right = i === ans;
if (right) {
done = true; tiles.forEach(x => x.setAttribute('aria-disabled', 'true'));
t.classList.add('ok-right'); mark(t, true); S.banner('correct'); kit.sfx('correct'); const s = stage(); if (s) s.burst('sparkle', s.camera.x, s.camera.y, { n: 18 });
later(900, () => m.close(true)); return;
}
misses++; t.classList.add('ok-bad'); mark(t, false); t.disabled = true; t.setAttribute('aria-disabled', 'true'); kit.sfx('wrong');
if (misses < tries) {
S.banner('wrong', null, T('tryOnce')); showHint();
const next = tiles.find(x => !x.disabled); if (next) next.focus({ preventScroll: true });
return;
}
done = true; tiles.forEach(x => x.setAttribute('aria-disabled', 'true'));
const good = tiles[ans]; if (good) { good.classList.add('ok-right'); mark(good, true); }
S.banner('wrong', T('answerIs', { a: choices[ans] })); showHint();
later(1900, () => m.close(false));
});
grid.appendChild(t); return t;
});
if (tiles[0]) tiles[0].setAttribute('data-ok-focus', '');
return m.done;
},
banner(kind, reason, text) {
const ok = kind !== 'wrong';
for (const old of ui.mount().querySelectorAll('.ok-banner')) old.remove();
const b = el('div', 'ok-banner ok-' + (ok ? 'correct' : 'wrong'));
b.setAttribute('role', 'status');
b.appendChild(el('span', 'ok-mark', icon(ok ? 'check' : 'cross', { stroke: 3.2 })));
b.appendChild(txt('span', '', text || (ok ? T('correct') : reason ? T('wrong') + ' ' + reason : T('wrong'))));
ui.mount().appendChild(b);
announce(b.textContent);
later(ok ? 1400 : 2200, () => b.remove());
return b;
},
bubble(at, textOrKey, o = {}) {
const text = (kit.i18n.has(textOrKey) ? kit.i18n.t(textOrKey, o.vars) : String(textOrKey)).replace(/(\p{L})-(?=\p{L})/gu, '$1\u2011');
const b = el('div', 'ok-bubble'); b.setAttribute('role', 'dialog'); b.tabIndex = 0;
if (o.portrait) b.appendChild(portrait(o.portrait, { size: 56, mood: 'happy' }));
const t = el('div', 'ok-txt'); t.dir = textDir(text); b.appendChild(t); b.appendChild(el('span', 'ok-more', icon('down')));
t.setAttribute('aria-label', text);
ui.mount().appendChild(b);
const place = () => {
const s = stage(); let x = innerW() / 2, y = innerH() * 0.4;
if (s && s.fit) { const w = at && at.x != null ? at : { x: 0, y: 0 }; const top = w.size ? { x: w.x, y: w.y - w.size * 1.05 } : w; const p = s.camera.toScreen(top); x = s.fit.offX + p.x * s.fit.k; y = s.fit.offY + p.y * s.fit.k; }
const bw = b.offsetWidth, bh = b.offsetHeight, left = Math.max(8, Math.min(innerW() - bw - 8, x - bw / 2));
b.style.left = left + 'px'; b.style.top = Math.max(8, y - bh - 22) + 'px';
b.style.setProperty('--ok-tx', Math.max(24, Math.min(bw - 24, x - left)) + 'px');
};
const innerW = () => kit.win.innerWidth, innerH = () => kit.win.innerHeight;
const units = kit.i18n.units(text); let i = 0, stop = null;
const full = () => { if (stop) stop(); stop = null; t.textContent = text; i = units.length; };
if (reduced()) full(); else { stop = kit.loop.ui.every(28, () => { i++; t.textContent = units.slice(0, i).join(''); place(); if (i >= units.length) full(); }); }
place(); const off = kit.loop.ui.every(100, place);
if (o.readAloud !== false) kit.say(text, { who: at && at.state ? at : null });
announce(text);
return new Promise(res => {
const go = () => { if (i < units.length) { full(); return; } off(); b.remove(); res(); };
b.addEventListener('click', go); b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
if (o.ms) later(o.ms, () => { full(); go(); });
});
},
dialog(o = {}) {
const m = modal('dialog', { onEscape: () => m.close(null) });
if (o.portrait) m.card.appendChild(portrait(o.portrait, { size: 110, mood: o.mood || 'happy' }));
if (o.title) m.card.appendChild(gtxt('h2', 'ok-h2', o.title));
if (o.text) m.card.appendChild(gtxt('p', 'ok-p', o.text));
const r = el('div', 'ok-row');
(o.buttons || [{ label: T('close'), kind: 'go', value: true }]).forEach((d, i, a) => { const b = btn(d.label, d.kind || (i === a.length - 1 ? 'hot' : 'quiet'), () => m.close(d.value !== undefined ? d.value : d.label), d.icon ? { icon: icon(d.icon) } : {}); if (i === a.length - 1) b.setAttribute('data-ok-focus', ''); r.appendChild(b); });
m.card.appendChild(r);
return m.done;
},
hud(widgets = ['score'], o = {}) {
const old = ui.mount().querySelector('.ok-hud'); if (old) old.remove();
const root = el('div', 'ok-hud'), start = el('div', 'ok-hud-start'), end = el('div', 'ok-hud-end');
root.append(start, end); ui.mount().appendChild(root);
const H = { root };
const roll = (node, from, to) => { const r = { v: from }; kit.loop.ui.tween(r, { v: to }, { ms: reduced() ? 1 : 380, ease: 'cubicOut', onUpdate: () => { node.textContent = kit.i18n.num(Math.round(r.v)); } }).then(() => { node.textContent = kit.i18n.num(to); }); };
const KNOWN = ['score', 'lives', 'timer', 'progress', 'combo', 'count'];
let startTimer = 0;
for (const spec of [].concat(widgets)) {
const [w, arg] = String(spec).split(':').map(x => x.trim());
if (!KNOWN.includes(w)) { kit.warn(`ui.hud: unknown widget "${spec}" (use ${KNOWN.join(', ')}; lives:3, timer:60, count:spark)`); continue; }
if (w === 'score') {
const p = el('div', 'ok-pill ok-scorepill', `<span class="ok-sp">${icon('spark')}</span>`); const n = txt('span', 'ok-num', kit.i18n.num(0)); p.appendChild(n); p.setAttribute('aria-label', T('score')); start.appendChild(p);
H.score = { value: 0, set(v) { const f = this.value; this.value = +v || 0; roll(n, f, this.value); }, add(d = 1) { this.set(this.value + d); p.classList.remove('ok-bump'); void p.offsetWidth; p.classList.add('ok-bump'); } };
} else if (w === 'lives') {
const p = el('div', 'ok-pill ok-hearts'); p.setAttribute('role', 'img'); start.appendChild(p);
const max = Math.max(1, Math.min(9, (arg ? +arg : o.lives) || 3));
const draw = () => { p.innerHTML = ''; for (let i = 0; i < Math.max(max, H.lives.value); i++) p.insertAdjacentHTML('beforeend', icon(i < H.lives.value ? 'heart' : 'heart-off')); [...p.children].forEach((s, i) => s.classList.toggle('ok-lost', i >= H.lives.value)); p.setAttribute('aria-label', T('lives') + ' ' + kit.i18n.num(H.lives.value)); };
H.lives = { value: max, max, lose() { if (this.value <= 0) return 0; this.value--; draw(); const h = p.children[this.value]; if (h) h.classList.add('ok-pop'); return this.value; }, gain() { this.value++; draw(); const h = p.children[this.value - 1]; if (h) h.classList.add('ok-pop'); return this.value; }, set(v) { this.value = Math.max(0, v | 0); draw(); } };
draw();
} else if (w === 'timer') {
const p = el('div', 'ok-pill ok-timer', '<svg class="ok-clock" viewBox="-16 -16 32 32" aria-hidden="true"><circle class="ok-face" r="13"/><path class="ok-pie"/><path class="ok-hand"/><path class="ok-knob" d="M-3-17.5h6"/></svg>');
const n = txt('span', 'ok-num', '0'); p.appendChild(n); p.setAttribute('aria-label', T('time')); start.appendChild(p);
const pie = p.querySelector('.ok-pie'), hand = p.querySelector('.ok-hand'); let stopT = null;
const face = f => { const a = Math.PI * 2 * Math.max(0, Math.min(1, f)), x = 11.6 * Math.sin(a), y = -11.6 * Math.cos(a);
pie.setAttribute('d', f >= 0.999 ? 'M0-11.6a11.6 11.6 0 1 1 0 23.2a11.6 11.6 0 1 1 0-23.2z' : f <= 0.001 ? '' : `M0 0V-11.6A11.6 11.6 0 ${a > Math.PI ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}z`);
hand.setAttribute('d', `M0 0L${(x * 0.72).toFixed(2)} ${(y * 0.72).toFixed(2)}`); };
H.timer = { left: 0, total: 0, start(s, onEnd) { this.stop(); this.total = this.left = Math.max(0, +s || 0); const show = () => { n.textContent = kit.i18n.num(Math.ceil(this.left)); face(this.left / (this.total || 1)); p.classList.toggle('ok-low', this.left <= 10 && this.left > 0); }; show();
stopT = kit.loop.tw.every(100, () => { this.left = Math.max(0, this.left - 0.1); show(); if (this.left <= 0) { this.stop(); if (onEnd) onEnd(); } }); },
stop() { if (stopT) stopT(); stopT = null; p.classList.remove('ok-low'); } };
face(1);
if (arg) startTimer = +arg || 0;
} else if (w === 'progress') {
const p = el('div', 'ok-pill ok-progress', `<span class="ok-bar"><i></i></span><span class="ok-flag">${icon('flag')}</span>`); p.setAttribute('role', 'progressbar'); p.setAttribute('aria-valuemin', '0'); p.setAttribute('aria-valuemax', '100'); p.setAttribute('aria-label', T('level')); start.appendChild(p);
const bar = p.querySelector('i'); H.progress = { value: 0, set(v) { this.value = Math.max(0, Math.min(1, +v || 0)); bar.style.width = (this.value * 100) + '%'; p.setAttribute('aria-valuenow', String(Math.round(this.value * 100))); } };
} else if (w === 'combo') {
const host = start.querySelector('.ok-scorepill') || start;
const p = el('div', 'ok-combo'); p.hidden = true; p.dir = 'ltr'; host.appendChild(p);
H.combo = { value: 0, bump() { this.value++; p.hidden = this.value < 2; p.textContent = '×' + kit.i18n.num(this.value); p.classList.remove('ok-bump'); void p.offsetWidth; p.classList.add('ok-bump'); return this.value; }, reset() { this.value = 0; p.hidden = true; } };
} else if (w === 'count') {
const p = el('div', 'ok-pill', icon(arg || o.countIcon || 'check')); const n = txt('span', 'ok-num', ''); p.appendChild(n); start.appendChild(p);
H.count = { value: 0, total: o.total || 0, add(d = 1) { this.value += d; this.show(); }, set(v, total) { this.value = v; if (total != null) this.total = total; this.show(); }, show() { n.textContent = this.total ? kit.i18n.t('sparksOf', { n: this.value, total: this.total }) : kit.i18n.num(this.value); } };
H.count.show();
}
}
const openPause = async () => {
if (!root.isConnected || open) return null;
const v = await S.pause(); kit.emit('pause', v); if (o.onPause) { try { o.onPause(v); } catch (e) { kit.warn(e); } }
return v;
};
if (o.pause !== false) { end.appendChild(btn(T('pause'), 'icon', openPause, { icon: icon('pause') })); kit.hudPause = openPause; H.pause = openPause; }
if (o.sound !== false) { const b = btn(T('sound'), 'icon', () => { kit.audio.setMuted(!kit.audio.muted); b.innerHTML = icon(kit.audio.muted ? 'mute' : 'sound'); }, { icon: icon(kit.audio.muted ? 'mute' : 'sound') }); b.classList.add('ok-sound'); end.appendChild(b); }
const stopWatch = kit.loop.ui.every(400, () => { if (root.isConnected) return; if (kit.hudPause === openPause) kit.hudPause = null; stopWatch(); });
if (startTimer && H.timer) H.timer.start(startTimer);
return H;
},
get open() { return open; },
};
let uid = 0;
return S;
}
return { SCREEN_CSS, WORDMARK, distractors, screens, textDir };
})();
const __m_ui = (function () {
const { PALETTE, INK, CREAM, PAPER } = __m_tokens;
const { fontStack } = __m_text;
const { SCREEN_CSS } = __m_screens;
const P = PALETTE;
const CSS = `
.ok-stage{position:fixed;inset:0;overflow:hidden;background:${PAPER};touch-action:none;-webkit-user-select:none;user-select:none}
.ok-stage canvas{position:absolute;left:0;top:0;width:100%;height:100%;display:block}
.ok-ui{position:fixed;inset:0;pointer-events:none;font-family:var(--ok-font);color:var(--ok-text);z-index:10;
  --ok-text:${INK};--ok-card:${CREAM};--ok-scrim:rgba(20,20,20,.42);--ok-glow:rgba(255,253,242,.62);--ok-focus:${INK};--ok-edge:${INK};--ok-bg2:${PAPER};--ok-line:#E2DDCB;--ok-icon-card:${CREAM};font-size:calc(16px * var(--ok-ts,1))}
.ok-ui.ok-night{--ok-text:${CREAM};--ok-card:#1E1E1B;--ok-scrim:rgba(10,12,12,.55);--ok-glow:rgba(14,20,20,.5);--ok-focus:${P.spark[2]};--ok-edge:${CREAM};--ok-bg2:#262622;--ok-line:#36352F;--ok-icon-card:#2E2D28}
.ok-ui>*{pointer-events:auto}
.ok-ui :focus-visible{outline:3px solid var(--ok-focus);outline-offset:3px}
.ok-sr{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.ok-btn{font:inherit;font-weight:700;font-size:1.1em;min-height:48px;padding:0 24px;border-radius:999px;border:2px solid ${INK};cursor:pointer;
  display:inline-flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 4px 0 var(--ok-press);transform:translateY(0);
  transition:transform 80ms ease-out,box-shadow 80ms ease-out;-webkit-tap-highlight-color:transparent;color:${INK};line-height:1.1}
.ok-btn:active,.ok-btn.ok-down{transform:translateY(3px);box-shadow:0 1px 0 var(--ok-press)}
.ok-btn svg{width:1.3em;height:1.3em}
.ok-hot{background:${P.spark[2]};--ok-press:${P.spark[3]}}
.ok-go{background:${P.mint[2]};--ok-press:${P.mint[3]}}
.ok-quiet{background:${CREAM};--ok-press:${INK}}
.ok-icon{width:48px;padding:0;background:${CREAM};--ok-press:${INK}}
.ok-big{min-height:64px;font-size:1.35em;padding:0 32px}
.ok-caption{position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom));transform:translateX(-50%);max-width:min(92vw,720px);
  background:rgba(20,20,20,.86);color:${CREAM};padding:8px 16px;border-radius:14px;font-weight:600;line-height:1.35;text-align:center;
  opacity:0;transition:opacity 200ms;pointer-events:none}
.ok-caption.on{opacity:1}
.ok-toast{position:fixed;left:50%;top:calc(16px + env(safe-area-inset-top));transform:translate(-50%,-140%);background:var(--ok-card);color:var(--ok-text);
  border:2px solid ${INK};border-radius:999px;padding:10px 20px;font-weight:700;box-shadow:0 4px 0 ${INK};transition:transform 320ms cubic-bezier(.34,1.56,.64,1),visibility 0s 320ms;visibility:hidden;pointer-events:none}
.ok-toast.on{transform:translate(-50%,0);visibility:visible;transition:transform 320ms cubic-bezier(.34,1.56,.64,1)}
.ok-touch{position:fixed;inset:0;pointer-events:none}
.ok-touch>*{pointer-events:auto;position:absolute;opacity:.85;transition:opacity 120ms,transform 80ms ease-out}
.ok-touch>.on{opacity:1}
/* touch controls are stickers: Cream discs with an Ink outline and a hard drop (clear on dirt, sky or night) */
.ok-stick{width:136px;height:136px;border-radius:50%;background:${CREAM};border:3px solid ${INK};box-shadow:0 4px 0 ${INK},inset 0 0 0 10px ${PAPER};
  left:calc(22px + env(safe-area-inset-left));bottom:calc(22px + env(safe-area-inset-bottom))}
.ok-stick::before{content:"";position:absolute;inset:22px;border-radius:50%;border:2px dashed ${INK}55}
.ok-knob{position:absolute;left:50%;top:50%;width:60px;height:60px;margin:-30px 0 0 -30px;border-radius:50%;background:${P.mint[2]};border:3px solid ${INK};box-shadow:0 3px 0 ${P.mint[3]}}
.ok-tbtn{width:80px;height:80px;border-radius:50%;background:${P.mint[2]};border:3px solid ${INK};box-shadow:0 5px 0 ${INK};display:flex;align-items:center;justify-content:center;color:#FFFFFF}
.ok-tbtn.on{transform:translateY(4px);box-shadow:0 1px 0 ${INK}}
.ok-tbtn svg{width:40px;height:40px;stroke:#FFFFFF;stroke-width:3.4;filter:drop-shadow(0 2px 0 ${P.mint[3]})}
.ok-jump{right:calc(24px + env(safe-area-inset-right));bottom:calc(34px + env(safe-area-inset-bottom))}
.ok-act{right:calc(118px + env(safe-area-inset-right));bottom:calc(24px + env(safe-area-inset-bottom));background:${P.sky[2]}}
.ok-d{width:60px;height:60px;background:${CREAM};color:${INK}}.ok-d svg{stroke:${INK};filter:none}
.ok-d-left{left:calc(16px + env(safe-area-inset-left));bottom:calc(76px + env(safe-area-inset-bottom))}
.ok-d-right{left:calc(136px + env(safe-area-inset-left));bottom:calc(76px + env(safe-area-inset-bottom))}
.ok-d-up{left:calc(76px + env(safe-area-inset-left));bottom:calc(136px + env(safe-area-inset-bottom))}
.ok-d-down{left:calc(76px + env(safe-area-inset-left));bottom:calc(16px + env(safe-area-inset-bottom))}
.ok-touch.ok-left .ok-stick,.ok-touch.ok-left .ok-d{left:auto;right:calc(24px + env(safe-area-inset-right))}
.ok-touch.ok-left .ok-jump{right:auto;left:calc(24px + env(safe-area-inset-left))}
[dir=rtl] .ok-touch:not(.ok-left) .ok-stick{left:auto;right:calc(24px + env(safe-area-inset-right))}
[dir=rtl] .ok-touch:not(.ok-left) .ok-jump{right:auto;left:calc(24px + env(safe-area-inset-left))}
.ok-ui[lang|=ar] *,.ok-ui[lang|=he] *{letter-spacing:0!important}
.ok-ui[lang|=ar]{line-height:1.6}
.ok-num{font-variant-numeric:tabular-nums}
@media (prefers-reduced-motion:reduce){.ok-btn,.ok-toast,.ok-caption{transition:none}}
`;
class UI {
constructor(kit) {
this.kit = kit; this.doc = kit.doc; this.root = null;
}
mount() {
if (this.root) return this.root;
const d = this.doc;
if (!d.getElementById('ok-css')) { const s = d.createElement('style'); s.id = 'ok-css'; s.textContent = CSS + SCREEN_CSS; (d.head || d.documentElement).appendChild(s); }
const r = this.root = d.createElement('div'); r.className = 'ok-ui';
this.live = d.createElement('div'); this.live.className = 'ok-sr'; this.live.setAttribute('aria-live', 'polite'); this.live.setAttribute('role', 'status'); r.appendChild(this.live);
this.cap = d.createElement('div'); this.cap.className = 'ok-caption'; this.cap.setAttribute('aria-hidden', 'true'); r.appendChild(this.cap);
this.toastEl = d.createElement('div'); this.toastEl.className = 'ok-toast'; this.toastEl.setAttribute('role', 'status'); r.appendChild(this.toastEl);
(d.body || d.documentElement).appendChild(r);
this.sync();
return r;
}
sync() {
const r = this.root; if (!r) return;
const k = this.kit;
r.setAttribute('lang', k.i18n.raw); r.setAttribute('dir', k.i18n.dir);
r.style.setProperty('--ok-font', fontStack(k.i18n.lang));
r.style.setProperty('--ok-ts', String(k.settings.get('textSize')));
r.classList.toggle('ok-night', k.theme.dark); r.classList.toggle('ok-rm', k.settings.reduced);
}
announce(text) { this.mount(); this.live.textContent = ''; this.live.textContent = String(text); }
caption(text, o = {}) {
this.mount();
if (!this.kit.settings.get('captions')) return;
this.cap.textContent = (o.icon ? o.icon + ' ' : '') + String(text); this.cap.classList.add('on');
if (this._capOff) this._capOff();
this._capOff = this.kit.loop.ui.after(o.ms || Math.max(1800, String(text).length * 70), () => this.cap.classList.remove('on'));
}
toast(text, o = {}) {
this.mount();
this.toastEl.textContent = String(text); this.toastEl.classList.add('on');
if (this._toastOff) this._toastOff();
this._toastOff = this.kit.loop.ui.after(o.ms || 1800, () => this.toastEl.classList.remove('on'));
}
button(label, o = {}) {
const b = this.doc.createElement('button'); b.type = 'button';
b.className = 'ok-btn ok-' + (o.kind || 'go') + (o.big ? ' ok-big' : '');
if (o.icon) b.innerHTML = o.icon;
if (o.kind === 'icon') b.setAttribute('aria-label', String(label)); else b.appendChild(this.doc.createTextNode(String(label)));
b.addEventListener('click', e => { this.kit.audio.unlock(); this.kit.sfx('select'); if (o.onPress) o.onPress(e); });
return b;
}
}
function loadFonts(win, base, waitFrames) {
const FF = win && win.FontFace; const fonts = win && win.document && win.document.fonts;
if (!FF || !fonts || !base) return Promise.resolve(false);
const faces = [
['bricolage-latin.woff2', 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'],
['bricolage-latin-ext.woff2', 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF'],
];
const loads = faces.map(([f, range]) => {
try { const face = new FF('Bricolage Grotesque', `url(${base}fonts/${f}) format('woff2')`, { weight: '200 800', unicodeRange: range, display: 'swap' }); fonts.add(face); return f === faces[0][0] ? face.load() : null; } catch (e) { return null; }
}).filter(Boolean);
return Promise.race([Promise.all(loads).then(() => true, () => false), waitFrames(90).then(() => false)]);
}
return { CSS, UI, loadFonts };
})();
const __m_juice = (function () {
const { motion } = __m_tokens;
class FlashLimiter {
constructor(perSecond = motion.flashPerSecond) { this.per = perSecond; this.times = []; }
allow(now) {
this.times = this.times.filter(t => now - t < 1000);
if (this.times.length >= this.per) return false;
this.times.push(now); return true;
}
}
function domPop(el, reduced) {
if (!el || !el.animate) return;
if (reduced) { el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'linear' }); return; }
el.animate([{ transform: 'scale(.4)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: motion.pop.ms, easing: 'cubic-bezier(.34,1.56,.64,1)' });
}
function domShake(el, trauma = 0.4, reduced) {
if (!el || !el.animate || reduced) return;
const a = 18 * trauma * trauma, k = [];
for (let i = 0; i <= 6; i++) { const s = i === 6 ? 0 : (i % 2 ? -1 : 1) * a * (1 - i / 6); k.push({ transform: `translate(${s}px,${s * 0.4}px)` }); }
el.animate(k, { duration: 360, easing: 'linear' });
}
return { FlashLimiter, domPop, domShake };
})();
const __m_parts = (function () {
const { PALETTE } = __m_tokens;
const CORE_PARTS = {
move: (e, o) => {
const g = +o.gravity || 0, drag = +o.drag || 0, bounce = +o.bounce || 0, floor = o.floor;
if (o.vx != null) e.vx = +o.vx; if (o.vy != null) e.vy = +o.vy;
return (e2, dt) => {
e.vy += g * dt; if (drag) { const k = Math.max(0, 1 - drag * dt); e.vx *= k; if (!g) e.vy *= k; }
e.x += e.vx * dt; e.y += e.vy * dt;
if (o.minX != null && e.x < o.minX) { e.x = o.minX; e.vx = Math.abs(e.vx) * bounce; }
if (o.maxX != null && e.x > o.maxX) { e.x = o.maxX; e.vx = -Math.abs(e.vx) * bounce; }
const fy = typeof floor === 'function' ? floor(e.x) : floor;
e.grounded = false;
if (fy != null && isFinite(fy) && e.y >= fy && e.vy >= 0) { e.y = fy; e.vy = bounce && e.vy > 60 ? -e.vy * bounce : 0; e.grounded = e.vy === 0; e.groundY = fy; }
};
},
bob: (e, o) => { const amp = o.amp || 6, hz = o.hz || 0.8, ph = e.rng() * 6.28; let t = 0; const y0 = () => e.baseY != null ? e.baseY : (e.baseY = e.y);
return (e2, dt) => { t += dt; e.y = y0() + Math.sin(t * hz * 6.283 + ph) * amp; }; },
patrol: (e, o) => { const range = o.range || 120, sp = o.speed || 60; const x0 = e.x; let dir = 1;
return (e2, dt) => { e.vx = sp * dir; e.x += e.vx * dt; if (e.x > x0 + range) { e.x = x0 + range; dir = -1; } else if (e.x < x0 - range) { e.x = x0 - range; dir = 1; } e.flip = dir < 0; }; },
follow: (e, o) => { const gap = o.gap || 70; return (e2, dt) => { const t = o.target; if (!t) return;
const tx = t.x - (t.flip ? -gap : gap), dx = tx - e.x; e.vx = dx * 4; e.x += e.vx * dt; e.y += ((t.y) - e.y) * Math.min(1, dt * 6); if (Math.abs(dx) > 4) e.flip = dx < 0; }; },
fly: (e, o) => { const ax = o.rangeX || 40, ay = o.rangeY || 18, sp = o.speed || 1; const x0 = e.x, y0 = e.y; let t = e.rng() * 6;
return (e2, dt) => { t += dt * sp; const nx = x0 + Math.sin(t) * ax; e.vx = (nx - e.x) / Math.max(dt, 1e-3); e.x = nx; e.y = y0 + Math.sin(t * 2) * ay; e.flip = Math.cos(t) < 0; }; },
lantern: (e, o) => { e.light = e.stage.light({ follow: e, dy: o.dy != null ? o.dy : -e.size * 0.78, radius: o.radius || 230, color: o.color || PALETTE.spark[1], intensity: o.intensity || 1.1 }); return () => {}; },
glow: (e, o) => { e.emissive = o.amount == null ? 1 : +o.amount; return () => {}; },
shadow: (e, o) => { e.shadow = o.on !== false; return () => {}; },
};
return { CORE_PARTS };
})();
const __m_helpers = (function () {
const { INK, CREAM, color, outline } = __m_tokens;
const { sky, skyAt } = __m_sky;
const { fontStack } = __m_text;
function makeDraw(kit) {
const D = {
rrect(ctx, x, y, w, h, r) { r = Math.max(0, Math.min(r, w / 2, h / 2)); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); return ctx; },
panel(ctx, x, y, w, h, o = {}) {
D.rrect(ctx, x, y + 4, w, h, o.radius || 20); ctx.fillStyle = INK; ctx.fill();
D.rrect(ctx, x, y, w, h, o.radius || 20); ctx.fillStyle = o.fill || CREAM; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
},
button(ctx, x, y, w, h, o = {}) {
const kind = o.kind || 'go', fill = kind === 'hot' ? color('spark') : kind === 'quiet' ? CREAM : color('mint'), press = kind === 'hot' ? color('spark', 'shade') : kind === 'quiet' ? INK : color('mint', 'shade');
const down = o.down ? 3 : 0;
D.rrect(ctx, x, y + 4, w, h, h / 2); ctx.fillStyle = press; ctx.fill();
D.rrect(ctx, x, y + down, w, h, h / 2); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
if (o.label) D.text(ctx, o.label, x + w / 2, y + down + h / 2, { size: Math.min(28, h * 0.42), weight: 700, rim: false });
},
ring(ctx, x, y, r, w = 4) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.lineWidth = w; ctx.strokeStyle = INK; ctx.stroke(); },
spark(ctx, x, y, r, o = {}) {
const q = r * 0.2; ctx.beginPath(); ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x + q, y - q, x + r, y); ctx.quadraticCurveTo(x + q, y + q, x, y + r); ctx.quadraticCurveTo(x - q, y + q, x - r, y); ctx.quadraticCurveTo(x - q, y - q, x, y - r); ctx.closePath();
ctx.fillStyle = o.fill || color('spark'); ctx.fill(); ctx.lineJoin = 'round'; ctx.lineWidth = outline(r * 2); ctx.strokeStyle = INK; ctx.stroke();
},
text(ctx, str, x, y, o = {}) {
const t = ctx.getTransform ? ctx.getTransform() : null, onScreen = t ? Math.hypot(t.a, t.b) / Math.max(1, kit.win.devicePixelRatio || 1) : 1;
const size = Math.max(o.size && o.size * onScreen < 12 ? 12 / onScreen : 1, o.size || 24), weight = o.weight || 800;
ctx.save(); ctx.font = `${weight} ${size}px ${fontStack(kit.i18n.lang)}`; ctx.textAlign = o.align || 'center'; ctx.textBaseline = 'middle';
try { ctx.direction = kit.i18n.dir; } catch (e) {  }
let w = ctx.measureText(str).width;
if (o.max && w > o.max) { const k = Math.max(0.7, o.max / w); ctx.translate(x, y); ctx.scale(k, 1); x = 0; y = 0; }
const fill = o.role ? color(o.role) : (o.color || INK);
const pill = o.pill != null ? o.pill : size * onScreen < 18 && o.rim !== true;
if (pill) {
const ph = size * 1.5, pw = w + size * 1.1, x0 = (ctx.textAlign === 'center' ? x - pw / 2 : ctx.textAlign === 'right' || ctx.textAlign === 'end' ? x - pw + size * 0.55 : x - size * 0.55);
D.rrect(ctx, x0, y - ph / 2, pw, ph, ph / 2); ctx.fillStyle = CREAM; ctx.fill(); ctx.lineWidth = Math.max(1.2, size * 0.09); ctx.strokeStyle = INK; ctx.stroke();
ctx.fillStyle = o.role || o.color ? fill : INK; ctx.fillText(str, x, y + size * 0.04); ctx.restore(); return;
}
if (o.rim !== false) { ctx.lineJoin = 'round'; ctx.strokeStyle = CREAM; ctx.lineWidth = Math.max(4, size * 0.22); ctx.strokeText(str, x, y); ctx.strokeStyle = INK; ctx.lineWidth = Math.max(2, size * 0.1); ctx.strokeText(str, x, y); }
ctx.fillStyle = fill; ctx.fillText(str, x, y); ctx.restore();
},
sprite(ctx, name, x, y, o = {}) {
const A = kit.helperAtlas(); const def = A.defs.get(name); if (!def) return;
const size = o.size || 64; const t = ctx.getTransform ? ctx.getTransform() : null; const s = t ? Math.hypot(t.a, t.b) : 1;
const id = A.sprite(name, size * s, o.state || ''); const e = A.entries[id]; if (!e) return;
const w = size * def.w / def.h, ax = def.ax == null ? 0.5 : def.ax, ay = def.ay == null ? 0.5 : def.ay;
ctx.save(); ctx.translate(x, y); if (o.flip) ctx.scale(-1, 1);
ctx.drawImage(A.pages[e.page].canvas, e.x, e.y, e.w, e.h, -ax * w, -ay * size, w, size); ctx.restore();
},
sky(ctx, w, h, o = {}) {
const s = sky(o.timeOfDay != null ? o.timeOfDay : o.mode === 'dark' ? 1 : 0); const g = ctx.createLinearGradient(0, 0, 0, h);
for (let i = 0; i <= 8; i++) g.addColorStop(i / 8, skyAt(s, i / 8));
ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
},
};
return D;
}
return { makeDraw };
})();
const __m_testhooks = (function () {
function installTestHooks(win, kit) {
const T = win.__brbTest && typeof win.__brbTest === 'object' ? win.__brbTest : {};
const add = (k, fn) => { if (!(k in T)) T[k] = fn; };
add('state', () => Object.assign({ game: !!kit.testState, scene: kit.scene, tier: kit.tier, backend: kit.backend, kit: kit.version, theme: kit.theme.mode, lang: kit.i18n.lang, dir: kit.i18n.dir, reduced: kit.settings.reduced }, kit.testState ? kit.testState() : {}));
add('step', n => { kit.loop.step(Math.max(1, Math.min(6000, n | 0 || 1))); });
add('seed', n => { kit.seed = n; });
add('frameStats', () => (kit.stage ? kit.stage.frameStats() : kit.loop.frameStats()));
add('setTier', t => { if (kit.stage) kit.stage.setTier(t); });
add('setBackend', b => { if (kit.stage) kit.stage.setBackend(b); });
add('setTheme', m => kit.theme.set(m));
add('setLang', l => kit.setLang(l));
const owned = new Set();
kit.installTestAction = k => { if (!(k in T) || owned.has(k)) { T[k] = (...a) => kit.testActions[k](...a); owned.add(k); } };
try { win.__brbTest = T; } catch (e) {  }
return T;
}
return { installTestHooks };
})();
const __m_index = (function () {
const { color, motion, radius, space, z, outline, PALETTE, ROLES, SKIN, HAIR } = __m_tokens;
const { rand, seedOf } = __m_rand;
const { ease, EASE_NAMES } = __m_ease;
const { seq, all, stagger } = __m_tween;
const { Loop, runLoop } = __m_loop;
const { Input, touchControls } = __m_input;
const { I18n } = __m_i18n;
const { KitAudio } = __m_audio;
const { Save, memoryStorage } = __m_save;
const { Settings } = __m_settings;
const { Theme } = __m_theme;
const { validate, SPECIES, HAIR_STYLES, TOPS, WEAR, MOODS } = __m_validate;
const { Stage, RIGS } = __m_stage;
const { Atlas } = __m_atlas;
const { defineCoreArt } = __m_art;
const { UI, loadFonts } = __m_ui;
const { FlashLimiter, domPop, domShake } = __m_juice;
const { CORE_PARTS } = __m_parts;
const { makeDraw } = __m_helpers;
const { fitCanvas } = __m_fit;
const { installTestHooks } = __m_testhooks;
const { PRESET_NAMES } = __m_particles;
const { sparkPath, sticker, detail, ringEye, glowMask, lines, ellipsePath, rrectPath } = __m_grammar;
const { screens } = __m_screens;
const { icon, ICON_NAMES } = __m_icons;
const { charSpec, defineChar, CLIPS, FACES } = __m_chars;
const { defineProps, PROP_GROUPS, PROP_VARIANTS } = __m_props;
const { defineGround, BIOME_NAMES, autotile } = __m_biomes;
const VERSION = '1.0.0', API = 1;
function parseQuery(win) {
const out = {};
try {
const s = new URLSearchParams(win.location.search || '');
for (const k of ['okBackend', 'okTier', 'okDpr', 'okUltra', 'okGov', 'okDebug']) if (s.get(k)) out[k] = s.get(k);
} catch (e) {  }
const o = win.__OK_OPTS__; if (o && typeof o === 'object') for (const k in o) out[k] = String(o[k]);
return out;
}
function brbStorage(brb, win) {
if (brb && brb.storage && typeof brb.storage.get === 'function') return brb.storage;
try { const ls = win.localStorage; return { get: k => { const v = ls.getItem(k); try { return v == null ? null : JSON.parse(v); } catch (e) { return v; } }, set: (k, v) => ls.setItem(k, JSON.stringify(v)), remove: k => ls.removeItem(k) }; } catch (e) { return memoryStorage(); }
}
function createKit(win) {
const doc = win.document;
const brb = win.BRB && typeof win.BRB === 'object' ? win.BRB : null;
const script = doc.currentScript && doc.currentScript.src ? doc.currentScript.src : '';
const kit = { win, doc, brb, version: VERSION, base: script ? script.replace(/[^/]*$/, '') : '', query: parseQuery(win) };
const loop = kit.loop = new Loop();
kit.clock = () => loop.now;
kit.warn = msg => { try { if (brb && typeof brb.debug === 'function') brb.debug(String(msg)); else if (win.console) win.console.warn('[oomba]', msg); } catch (e) {  } };
const warned = new Set();
kit.deprecate = (name, hint) => { if (warned.has(name)) return; warned.add(name); kit.warn(`${name} is deprecated${hint ? ': ' + hint : ''}. It still works in kit 1.x.`); };
const evs = {};
kit.on = (ev, fn) => { (evs[ev] = evs[ev] || []).push(fn); return () => { evs[ev] = (evs[ev] || []).filter(f => f !== fn); }; };
kit.emit = (ev, v) => { for (const fn of (evs[ev] || []).slice()) { try { fn(v); } catch (e) { kit.warn(e); } } };
const storage = brbStorage(brb, win);
kit.i18n = new I18n((brb && brb.user && brb.user.lang) || doc.documentElement.getAttribute('lang') || 'en');
kit.settings = new Settings({ storage, brb, win });
kit.theme = new Theme({ brb, win });
kit.audio = new KitAudio({ brb, win });
kit.audio.later = (ms, fn) => loop.ui.after(ms, fn);
kit.input = new Input({ clock: kit.clock });
kit.ui = new UI(kit);
kit.screens = screens(kit);
kit.save = new Save(storage); kit.save.warn = kit.warn;
kit.flashes = new FlashLimiter();
kit.parts = Object.assign({}, CORE_PARTS); kit.rigs = Object.assign({}, RIGS); kit.artPacks = [];
kit.stages = []; kit.stage = null; kit.scene = 'boot'; kit.tier = 'low'; kit.backend = 'none'; kit.glLocked = false;
kit.testActions = {}; kit.testState = null; kit.hudPause = null;
kit.audio.onCaption = text => kit.ui.caption(text);
kit.audio.onTalk = (on, who) => { if (who && who.state) who.state(on ? 'talk' : 'idle'); };
kit.setLang = l => { kit.i18n.setLang(l); kit.ui.sync(); };
kit.theme.on('change', () => kit.ui.sync());
kit.settings.on('change', () => kit.ui.sync());
const waitFrames = n => new Promise(res => { let k = 0; const f = () => (++k >= n ? res() : win.requestAnimationFrame(f)); if (win.requestAnimationFrame) win.requestAnimationFrame(f); else res(); });
kit.fontsReady = loadFonts(win, kit.base, waitFrames);
let stopLoop = null, detachInput = null;
kit.attachStage = s => {
kit.stages.push(s); kit.stage = s;
if (!detachInput) detachInput = kit.input.attach(win, s.el);
if (!stopLoop) {
loop.update = dt => {
let pads = null; try { pads = win.navigator.getGamepads ? win.navigator.getGamepads() : null; } catch (e) { pads = null; }
kit.input.update(pads);
if (kit.hudPause && !kit.screens.open && kit.input.pressed('pause')) kit.hudPause();
for (let i = 0; i < kit.stages.length; i++) kit.stages[i].step(dt);
};
loop.render = alpha => {
for (let i = 0; i < kit.stages.length; i++) kit.stages[i].render(alpha);
kit.audio.tick(); kit.save.flush();
};
loop.onHide = () => { kit.audio.suspend(); kit.emit('hide'); };
loop.onShow = () => { kit.audio.resume(); kit.emit('show'); };
loop.onBlur = () => { kit.emit('blur'); if (kit.hudPause && !kit.screens.open) kit.hudPause(); };
loop.onFocus = () => kit.emit('focus');
stopLoop = runLoop(loop, win);
}
};
kit.detachStage = s => { kit.stages = kit.stages.filter(x => x !== s); kit.stage = kit.stages[kit.stages.length - 1] || null; };
const unlock = () => { kit.audio.unlock(); };
win.addEventListener('pointerdown', unlock, { capture: true }); win.addEventListener('keydown', unlock, { capture: true });
win.addEventListener('pagehide', () => kit.save.flush());
let helper = null;
kit.helperAtlas = () => { if (!helper) { helper = new Atlas({ doc, pageSize: 2048, maxPages: 2 }); defineCoreArt(helper); defineProps(helper); defineGround(helper); for (const fn of kit.artPacks) fn(helper); } return helper; };
kit.drawKit = makeDraw(kit);
kit.portraitCanvas = (spec, px = 160, mood = '') => {
const A = kit.helperAtlas(), b = defineChar(A, spec && spec.__ok ? spec : charSpec(spec || 'oomba')), def = A.defs.get(b.id + ':portrait');
const c = doc.createElement('canvas'); c.height = Math.max(8, Math.round(px)); c.width = Math.ceil(c.height * def.w / def.h);
const id = A.sprite(b.id + ':portrait', c.height, mood || ''), e = A.entries[id];
if (e) c.getContext('2d').drawImage(A.pages[e.page].canvas, e.x, e.y, e.w, e.h, 0, 0, c.width, c.height);
return c;
};
kit.fontsReady.then(ok => { if (!ok) return; for (const s of kit.stages) s.atlas.forgetText(); if (helper) helper.forgetText(); });
const SFX_CAPTION = { correct: 'sndDing', wrong: 'sndBoop', hurt: 'sndOuch', levelup: 'sndFanfare', win: 'sndWin', spark: 'sndSparkle', splash: 'sndSplash', gate: 'sndGate' };
let lastCap = '', lastCapAt = -1e9;
kit.sfx = (name, o = {}) => {
const s = kit.stage; let pan = o.pan;
if (pan == null && o.at && s) { const p = s.camera.toScreen(o.at); pan = (p.x / s.view.vw) * 2 - 1; }
kit.audio.sfx(name === 'gate' ? 'levelup' : name === 'splash' ? 'whoosh' : name, { pitchVar: o.pitchVar, pitch: o.pitch, pan, volume: o.volume });
const cap = o.caption === false ? null : typeof o.caption === 'string' ? o.caption : SFX_CAPTION[name];
if (cap && kit.settings.get('captions')) {
const text = kit.i18n.has(cap) ? kit.i18n.t(cap) : cap, now = loop.now;
if (text !== lastCap || now - lastCapAt > 1500) { lastCap = text; lastCapAt = now; kit.ui.caption(text, { ms: 1400 }); }
}
};
kit.say = (textOrKey, o = {}) => {
const text = kit.i18n.has(textOrKey) ? kit.i18n.t(textOrKey, o.vars) : String(textOrKey);
return kit.audio.say(text, { lang: kit.i18n.raw, who: o.who, readAloud: kit.settings.get('readAloud') });
};
installTestHooks(win, kit);
return publicApi(kit);
}
function publicApi(kit) {
const { loop, i18n, settings, theme, ui } = kit;
const tween = (target, props, o) => loop.tw.tween(target, props, o);
tween.seq = seq; tween.all = all; tween.stagger = (items, fn, gap) => stagger(loop.tw, items, fn, gap);
tween.ui = (target, props, o) => loop.ui.tween(target, props, o);
const juiceStage = () => kit.stage;
const O = {
version: VERSION, api: API,
get tier() { return kit.tier; }, get backend() { return kit.backend; },
color, tokens: { radius, space, outline, motion, z, palette: PALETTE, roles: ROLES, skin: SKIN, hair: HAIR },
theme: { get mode() { return theme.mode; }, get biome() { return theme.biome; }, on: (ev, fn) => theme.on(ev, fn), set: m => theme.set(m) },
rand, seedOf, tween, ease, easings: EASE_NAMES,
spring: (target, prop, o) => loop.tw.spring(target, prop, o),
wait: ms => loop.tw.wait(ms), after: (ms, fn) => loop.tw.after(ms, fn), every: (ms, fn) => loop.tw.every(ms, fn),
time: {
get now() { return loop.now; }, get game() { return loop.game; },
get scale() { return loop.scale; }, set scale(v) { loop.scale = Math.max(0.1, Math.min(2, +v || 1)); },
hitstop: ms => loop.hitstop(ms), slowmo: (s, ms) => loop.slowmo(s, ms),
pause: r => loop.pause(r), resume: r => loop.resume(r), get paused() { return loop.paused; },
wait: ms => loop.tw.wait(ms), after: (ms, fn) => loop.tw.after(ms, fn), every: (ms, fn) => loop.tw.every(ms, fn),
real: { wait: ms => loop.ui.wait(ms), after: (ms, fn) => loop.ui.after(ms, fn), every: (ms, fn) => loop.ui.every(ms, fn) },
},
on: (ev, fn) => kit.on(ev, fn),
get scene() { return kit.scene; }, set scene(v) { kit.scene = String(v); },
test: (o = {}) => {
if (o.state && typeof o.state === 'function') kit.testState = o.state;
for (const k of ['start', 'win', 'skip']) if (typeof o[k] === 'function') { kit.testActions[k] = o[k]; kit.installTestAction(k); }
},
input: {
down: a => kit.input.down(a), pressed: a => kit.input.pressed(a), released: a => kit.input.released(a), axis: () => kit.input.axis(),
hold: (action, ms = 100) => { const src = 'sim:' + action; if (!kit.input.bindings[action]) { kit.warn(`input.hold: unknown action "${action}"`); return Promise.resolve(false); }
if (!kit.input.bindings[action].includes(src)) kit.input.bindings[action].push(src); kit.input.srcDown(src); return loop.ui.wait(ms).then(() => { kit.input.srcUp(src); return true; }); },
get pointer() { return kit.input.pointer; }, on: (ev, fn) => kit.input.on(ev, fn), map: b => kit.input.map(b),
touch: layout => {
const root = ui.mount(); const icons = { jump: icon('jump'), tap: icon('tap'), 'arrow-up': icon('up'), 'arrow-down': icon('down'), 'arrow-left': icon('left'), 'arrow-right': icon('right') };
const show = () => touchControls(kit.doc, root, kit.input, layout, { leftHanded: settings.get('leftHanded'), icons });
if (kit.input.usedTouch) show(); else { const off = kit.input.on('firsttouch', () => { off(); show(); }); }
},
},
t: (k, v) => i18n.t(k, v), strings: tbl => i18n.strings(tbl), num: (n, o) => i18n.num(n, o), units: s => i18n.units(s),
get lang() { return i18n.lang; }, get dir() { return i18n.dir; },
fonts: { get ready() { return kit.fontsReady; } },
sfx: (n, o) => kit.sfx(n, o), music: bed => kit.audio.music(bed), say: (k, o) => kit.say(k, o),
save: { define: o => kit.save.define(o), get: () => kit.save.get(), set: p => kit.save.set(p) },
settings: new Proxy({}, { get: (t, k) => (k === 'on' ? (ev, fn) => settings.on(ev, fn) : k === 'set' ? p => settings.patch(p) : k === 'reduced' ? settings.reduced : settings.get(k)), set: (t, k, v) => { settings.patch({ [k]: v }); return true; } }),
validate,
me: () => {
const u = kit.brb && kit.brb.user;
if (!u || u.isGuest) return charSpec({ species: 'oomba', seed: 1 });
const r = rand(String(u.avatar || '') + '|' + String(u.displayName || ''));
return charSpec({ species: 'kid', skin: r.int(0, 7), hair: { style: r.pick(['puffs', 'bob', 'curls', 'spiky', 'braids', 'buzz', 'long', 'cap']), color: r.pick(['cocoa', 'black', 'blonde', 'copper']) }, outfit: { top: r.pick(['tee', 'hoodie', 'dress', 'overalls']), color: r.pick(['sky', 'grape', 'coral', 'mint']) }, seed: r.int(1, 1e6) });
},
stage: (canvas, o) => {
if (canvas && !(canvas instanceof kit.win.HTMLCanvasElement)) { o = canvas; canvas = null; }
o = o || {}; if (o.api != null && o.api !== API) kit.warn(`Oomba.stage({api: ${JSON.stringify(o.api)}}): this kit speaks api ${API}.`);
return new Stage(kit, canvas, o);
},
fit: (canvas, o) => fitCanvas(kit.win, canvas, o),
draw: kit.drawKit,
juice: {
pop: x => (x && x.pop ? x.pop() : domPop(x, settings.reduced)),
shake: (trauma = 0.4, el) => (el ? domShake(el, trauma, settings.reduced) : juiceStage() && juiceStage().camera.shake(trauma)),
hitstop: (ms = motion.hitstop) => loop.hitstop(ms),
float: (text, x, y, role) => juiceStage() && juiceStage().floatText(String(text), x, y, role),
burst: (p, x, y, o) => juiceStage() && juiceStage().burst(p, x, y, o),
confetti: () => { const s = juiceStage(); if (s) s.burst('confetti', s.camera.x, s.camera.y - s.view.vh * 0.45, { w: s.view.vw * 0.8 }); },
flash: c => juiceStage() && juiceStage().flash(c),
presets: PRESET_NAMES,
},
ui: {
root: () => ui.mount(), button: (l, o) => ui.button(l, o), toast: (t, o) => ui.toast(t, o), announce: t => ui.announce(t), caption: (t, o) => ui.caption(t, o),
title: o => kit.screens.title(o), howTo: c => kit.screens.howTo(c), countdown: n => kit.screens.countdown(n), pause: () => kit.screens.pause(),
win: o => kit.screens.win(o), tryAgain: o => kit.screens.tryAgain(o), settings: () => kit.screens.settings(), hud: (w, o) => kit.screens.hud(w, o),
banner: (k, r) => kit.screens.banner(k, r), ask: q => kit.screens.ask(q), bubble: (at, t, o) => kit.screens.bubble(at, t, o), dialog: o => kit.screens.dialog(o),
portrait: (spec, o) => kit.screens.portrait(spec, o), get open() { return kit.screens.open; },
},
char: spec => charSpec(spec),
icon: (name, o) => icon(name, o), icons: ICON_NAMES,
art: {
define: (name, def) => { kit.artPacks.push(a => a.define(name, def)); if (kit.stage) kit.stage.atlas.define(name, def); },
pack: fn => { kit.artPacks.push(fn); if (kit.stage) fn(kit.stage.atlas); },
rig: (name, fn) => { kit.rigs[name] = fn; },
part: (name, fn) => { kit.parts[name] = fn; },
sparkPath, autotile,
ink: { sticker, detail, ringEye, glow: glowMask, lines, ellipse: ellipsePath, rrect: rrectPath, spark: sparkPath },
species: SPECIES, clips: CLIPS, faces: FACES, moods: MOODS, hair: HAIR_STYLES, tops: TOPS, wear: WEAR,
props: PROP_GROUPS, variants: PROP_VARIANTS, biomes: BIOME_NAMES,
toCanvas: (name, px = 128, v = '') => { if (typeof name === 'object' || SPECIES.includes(name)) return kit.portraitCanvas(name, px, v); const A = kit.helperAtlas(); const def = A.defs.get(name); const c = kit.doc.createElement('canvas'); if (!def) return c; c.height = px; c.width = Math.ceil(px * def.w / def.h); const ctx = c.getContext('2d'); kit.drawKit.sprite(ctx, name, c.width * (def.ax == null ? 0.5 : def.ax), px * (def.ay == null ? 0.5 : def.ay), { size: px, state: v }); return c; },
},
};
if (kit.query.okDebug === '1') Object.defineProperty(O, 'debug', { value: { kit }, enumerable: false });
kit.meSpec = () => O.me();
return O;
}
if (typeof window !== 'undefined' && typeof document !== 'undefined' && !window.Oomba) {
try { const O = createKit(window); window.Oomba = O; if (!window.OK) window.OK = O; } catch (e) { if (window.console) window.console.error('[oomba] kit failed to start', e); }
}
return { API, VERSION, createKit };
})();
})();
