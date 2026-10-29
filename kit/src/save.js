// A versioned, size-guarded save over BRB.storage (or memory when there is no SDK). Writes are batched: set() marks it
// dirty and flush() (called by the kit once per frame and on pagehide) writes at most once.
export const SAVE_KEY = '__ok_save', MAX_BYTES = 32 * 1024;

export class Save {
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
export function memoryStorage() { const m = new Map(); return { get: k => (m.has(k) ? JSON.parse(m.get(k)) : null), set: (k, v) => m.set(k, JSON.stringify(v)), remove: k => m.delete(k) }; }
const clone = o => JSON.parse(JSON.stringify(o || {}));
