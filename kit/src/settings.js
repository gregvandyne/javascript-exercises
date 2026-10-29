// Player settings (spec §11), saved under __ok_settings. Reduced motion = the setting, else BRB.motion, else the
// prefers-reduced-motion media query. Graphics: auto / simple (Paper, low) / fancy (best tier the device allows).
export const SETTINGS_KEY = '__ok_settings';
export const SETTING_DEFAULTS = { motion: 'auto', captions: false, readAloud: true, textSize: 1, speed: 1, assist: 'none', contrast: false, cvd: false, leftHanded: false, graphics: 'auto', music: true };
const ALLOWED = {
  motion: ['auto', 'reduce', 'full'], textSize: [1, 1.25, 1.5], speed: [0.5, 0.75, 1], assist: ['none', 'hearts', 'nofail'], graphics: ['auto', 'simple', 'fancy'],
};

export class Settings {
  constructor({ storage = null, brb = null, win = null } = {}) {
    this.storage = storage; this.brb = brb; this.win = win; this.fns = [];
    this.values = Object.assign({}, SETTING_DEFAULTS);
    try { const s = storage && storage.get(SETTINGS_KEY); if (s && typeof s === 'object') this.patch(s, true); } catch (e) { /* ignore */ }
    this.mq = null;
    try { this.mq = win && win.matchMedia ? win.matchMedia('(prefers-reduced-motion: reduce)') : null; } catch (e) { this.mq = null; }
    if (this.mq && this.mq.addEventListener) this.mq.addEventListener('change', () => this.emit());
  }
  get(k) { return this.values[k]; }
  /** patch({captions:true}) validates every value (unknown keys and bad values are ignored). */
  patch(p, quiet = false) {
    let changed = false;
    for (const k in p) {
      if (!(k in SETTING_DEFAULTS)) continue;
      let v = p[k];
      if (ALLOWED[k]) { if (!ALLOWED[k].includes(v)) continue; } else if (typeof SETTING_DEFAULTS[k] === 'boolean') v = !!v;
      if (this.values[k] !== v) { this.values[k] = v; changed = true; }
    }
    if (changed && !quiet) { try { if (this.storage) this.storage.set(SETTINGS_KEY, this.values); } catch (e) { /* ignore */ } this.emit(); }
    return changed;
  }
  /** Is motion reduced right now? */
  get reduced() {
    const m = this.values.motion;
    if (m === 'reduce') return true; if (m === 'full') return false;
    const b = this.brb && this.brb.motion;
    if (b === 'reduce') return true; if (b === 'full') return false;
    return !!(this.mq && this.mq.matches);
  }
  on(ev, fn) { this.fns.push(fn); return () => { const i = this.fns.indexOf(fn); if (i >= 0) this.fns.splice(i, 1); }; }
  emit() { for (const fn of this.fns.slice()) { try { fn(this.values); } catch (e) { /* ignore */ } } }
}
