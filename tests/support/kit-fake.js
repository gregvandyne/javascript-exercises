// A minimal fake browser for running the Oomba Kit (and whole Oomba.game rounds) in Node: DOM elements that record
// children and attributes, canvases with a no-op 2D context, Path2D, and a window whose rAF never fires (tests drive
// time with __brbTest.step(n), which is deterministic). Not a test file (no *.test.js): tests import it.
class FakePath { constructor() { this.ops = []; } addPath() {} }
for (const m of ['moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'arc', 'arcTo', 'ellipse', 'rect', 'closePath']) FakePath.prototype[m] = function (...a) { this.ops.push(m); };
globalThis.Path2D = globalThis.Path2D || FakePath;

const ctxFor = c => new Proxy({ canvas: c, getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), measureText: s => ({ width: String(s).length * 10 }), createRadialGradient: () => ({ addColorStop() {} }), createLinearGradient: () => ({ addColorStop() {} }), createPattern: () => ({}) },
  { get(t, k) { if (k in t) return t[k]; return () => {}; }, set(t, k, v) { t[k] = v; return true; } });

export function fakeWin({ search = '?okDebug=1&okBackend=paper', brb = null } = {}) {
  const all = [];
  const el = tag => {
    const e = {
      tag, children: [], style: { setProperty() {} }, dataset: {}, attrs: {}, textContent: '', innerHTML: '', clientWidth: 1280, clientHeight: 720, hidden: false,
      classList: { _s: new Set(), add(...c) { c.forEach(x => this._s.add(x)); }, remove(...c) { c.forEach(x => this._s.delete(x)); }, toggle(c, on) { if (on === undefined ? !this._s.has(c) : on) this._s.add(c); else this._s.delete(c); }, contains(c) { return this._s.has(c); } },
      setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] ?? null; }, removeAttribute(k) { delete this.attrs[k]; },
      appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); this.children.push(c); c.parentNode = this; return c; }, append(...cs) { for (const c of cs) this.appendChild(c); }, prepend(c) { this.appendChild(c); },
      removeChild(c) { this.children = this.children.filter(x => x !== c); c.parentNode = null; }, remove() { if (this.parentNode) this.parentNode.removeChild(this); }, insertBefore(c) { return this.appendChild(c); },
      insertAdjacentHTML() {}, after() {}, addEventListener() {}, removeEventListener() {}, focus() {}, click() {}, animate() { return {}; },
      querySelector() { return null; }, querySelectorAll() { return []; }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }), get isConnected() { return true; },
    };
    if (tag === 'canvas') { e.width = 1; e.height = 1; const ctx = ctxFor(e); e.getContext = () => ctx; }
    all.push(e); return e;
  };
  const doc = { currentScript: null, documentElement: el('html'), head: el('head'), body: el('body'), createElement: el, createTextNode: t => ({ t }), getElementById: () => null,
    addEventListener() {}, removeEventListener() {}, querySelectorAll: () => [], visibilityState: 'visible', activeElement: null };
  const warns = [];
  const win = { document: doc, location: { search }, addEventListener() {}, removeEventListener() {}, console: { warn: (...a) => warns.push(a.join(' ')), error() {}, log() {} },
    navigator: {}, devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720, requestAnimationFrame: () => 1, cancelAnimationFrame() {}, HTMLCanvasElement: function () {}, getComputedStyle: () => ({}), __warns: warns, __els: all };
  if (brb) win.BRB = brb;
  return win;
}
