// Light/dark. Kit games follow the site theme (BRB.theme, else prefers-color-scheme) unless the game pins one.
// Dark is "night", never an inversion: the stage reads mode and timeOfDay (0 = noon, 1 = night) and lights the scene.
export class Theme {
  constructor({ brb = null, win = null, pinned = 'auto' } = {}) {
    this.brb = brb; this.win = win; this.fns = []; this.pinned = pinned; this.biome = 'meadow';
    this.mq = null;
    try { this.mq = win && win.matchMedia ? win.matchMedia('(prefers-color-scheme: dark)') : null; } catch (e) { this.mq = null; }
    this.mode = this.resolve();
    if (this.mq && this.mq.addEventListener) this.mq.addEventListener('change', () => this.refresh());
    if (brb && typeof brb.on === 'function') { try { brb.on('theme', () => this.refresh()); } catch (e) { /* older SDK */ } }
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
  emit() { for (const fn of this.fns.slice()) { try { fn(this.mode); } catch (e) { /* ignore */ } } }
}
