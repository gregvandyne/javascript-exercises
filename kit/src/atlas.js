// Sprite atlases. Art is code: a sprite definition draws itself onto a canvas once per (name, size bucket), into
// shelf-packed pages (2048² on mid/high, 1024² on low). Each sprite may also paint a mask (red = emissive, green =
// unlit: ink line and sticker rim) that Glaze reads. Paper uses derived variants: 'night' (cool-tinted, glowing and
// unlit parts kept at full colour) and 'white' (hit flash). Variants are made by compositing only (multiply,
// destination-in with the mask page): nothing ever reads pixels back from a page. Full pages are recycled least
// recently used first. Baking is time-sliced (<= 4 ms a frame) once a nearby size exists to draw meanwhile; variants
// queue the same way and the base sprite is drawn until they are ready.
// Each page keeps the rectangle drawn since the GPU copy was last refreshed (dr, mdr), so Glaze uploads only that.

export const PAD = 2;
export const EMIT = '#FF0000', UNLIT = '#00FF00';
const RATIO = Math.log(1.15);
/** Size buckets: sprites re-bake only when on-screen size changes by more than ~15%. */
export const bucket = px => Math.max(4, Math.round(Math.exp(Math.round(Math.log(Math.max(4, px)) / RATIO) * RATIO)));
export const NIGHT_TINT = '#8EA3C8';
/** The cast's share of the night grade (entities on the actors layer): Paper bakes it as the 'moon' variant. */
export const MOON_GRADE = 0.28;
const VARIANTS = ['night', 'white', 'moon'];
const grow = (r, x0, y0, x1, y1) => (r ? [Math.min(r[0], x0), Math.min(r[1], y0), Math.max(r[2], x1), Math.max(r[3], y1)] : [x0, y0, x1, y1]);

/** Pure shelf packer (unit-tested): add(w,h) -> {x,y} or null when full. */
export class Shelves {
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
export class Atlas {
  constructor({ doc, pageSize = 2048, maxPages = 6, now = () => 0 } = {}) {
    this.doc = doc; this.size = pageSize; this.maxPages = maxPages; this.now = now;
    this.pages = []; this.entries = []; this.map = new Map(); this.defs = new Map();
    this.queue = []; this.frame = 0; this.bakes = 0; this.scratch = null; this.scratch2 = null; this.freed = 0;
  }
  canvas(w, h) { const c = this.doc.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; }
  /** Live pages (freed slots are reused, so the array never grows past what is alive at once). */
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
    // Recycle the least recently used shared page (not one used this frame).
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
  /** Free a page for good: its entries (and their variants) go, the canvas memory is released, the slot is reused.
   *  Glaze deletes the matching textures on its next frame (it watches `freed`). */
  freePage(id) {
    const p = this.pages[id]; if (!p || p.dead) return;
    const ids = p.ids; p.ids = []; for (const i of ids) this._dropEntry(i);
    p.dead = true; this.freed++;
    try { p.canvas.width = p.canvas.height = 0; if (p.mask) p.mask.width = p.mask.height = 0; } catch (e) { /* detached */ }
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
  /** bake(key, wPx, hPx, draw(ctx, k), {ax, ay}) -> entry id. ctx is translated to the sprite's corner;
   *  k.mask() returns the mask context (same transform) for emissive/unlit paint. */
  bake(key, w, h, draw, opts = {}) {
    if (this.map.has(key)) return this.map.get(key);
    w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
    const [p, r] = this._alloc(w, h);
    if (!p || !r) return -1;
    const e = this._entry(key, p, r, w, h, opts.ax == null ? 0.5 : opts.ax, opts.ay == null ? 0.5 : opts.ay);
    const ctx = p.ctx; ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, w, h); ctx.clip(); ctx.translate(r.x, r.y);
    const box = [r.x - 1, r.y - 1, r.x + w + 1, r.y + h + 1];
    if (p.mctx) { p.mctx.setTransform(1, 0, 0, 1, 0, 0); p.mctx.clearRect(r.x, r.y, w, h); p.maskVersion++; p.mdr = grow(p.mdr, ...box); }   // a recycled slot must not keep an old sprite's glow/unlit mask
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
  /** A whole canvas as its own page (parallax bands): -> entry id. */
  dedicated(key, canvas, opts = {}) {
    if (this.map.has(key)) return this.map.get(key);
    const p = this._page(canvas);
    return this._entry(key, p, { x: 0, y: 0 }, canvas.width, canvas.height, opts.ax == null ? 0 : opts.ax, opts.ay == null ? 0 : opts.ay).id;
  }
  /** Re-bake a dedicated page in place (a band at a new view size): same entry, same page slot, new pixels.
   *  Its variants are freed and made again on demand. */
  replace(id, canvas, mask = null) {
    const e = this.entries[id]; if (!e || !e.alive) return -1;
    const p = this.pages[e.page]; if (!p.dedicated) return -1;
    for (const k of VARIANTS) if (e[k] >= 0) { const v = this.entries[e[k]]; e[k] = -1; if (v && v.alive) this.freePage(v.page); }
    if (p.canvas !== canvas) { try { p.canvas.width = p.canvas.height = 0; } catch (err) { /* ignore */ } }
    if (p.mask && p.mask !== mask) { try { p.mask.width = p.mask.height = 0; } catch (err) { /* ignore */ } }
    p.canvas = canvas; p.ctx = canvas.getContext('2d'); e.w = canvas.width; e.h = canvas.height;
    p.mask = mask; p.mctx = mask ? mask.getContext('2d') : null; e.mask = !!mask;
    p.version++; p.maskVersion++; p.full = true; p.mfull = true; p.dr = p.mdr = null;
    return id;
  }
  setMask(id, maskCanvas) { const e = this.entries[id]; const p = this.pages[e.page]; p.mask = maskCanvas; p.mctx = maskCanvas.getContext('2d'); p.maskVersion++; p.mfull = true; e.mask = true; }
  /** Drop baked text sprites (defs with text: true) so they re-bake, e.g. once the kit font has loaded. */
  forgetText() { for (const e of this.entries) { if (!e.alive) continue; const d = this.defs.get(e.key.split('|')[0]); if (d && d.text) this._dropEntry(e.id); } }
  touch(id) { const e = this.entries[id]; if (e) this.pages[e.page].lastUsed = this.frame; }
  get(key) { const id = this.map.get(key); return id == null ? -1 : id; }

  // ---- sprite definitions -------------------------------------------------------------------------------------------
  /** define(name, {w, h, ax?, ay?, draw(ctx, k)}): w/h are the sprite's box in art units (the 100-unit grammar box). */
  define(name, def) { this.defs.set(name, def); }
  has(name) { return this.defs.has(name); }
  /** The entry for sprite `name` drawn hPx device pixels tall, in variant v ('' or a state like 'blink').
   *  Missing exact bucket: bake now if no size exists yet, else queue it and return the nearest baked size. */
  sprite(name, hPx, v = '') {
    const def = this.defs.get(name); if (!def) return -1;
    const b = bucket(hPx);
    const key = name + '|' + v + '|' + b;
    const id = this.map.get(key);
    this.lastExact = true;
    if (id != null) return id;
    // nearest existing bucket?
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
  /** Bake queued sizes and variants for up to budgetMs (call once a frame). */
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
  /** Bake every listed sprite size now (call behind a title screen). [[name, px, v], ...] */
  prebake(list) { const ids = []; for (const [name, px, v] of list) { const id = this.sprite(name, px, v || ''); if (id >= 0) ids.push(id); } return ids; }

  // ---- derived variants (Paper) -------------------------------------------------------------------------------------
  _scratch(w, h, two = false) {
    const k = two ? 'scratch2' : 'scratch';
    if (!this[k] || this[k].width < w || this[k].height < h) this[k] = this.canvas(Math.max(w, this[k] ? this[k].width : 0), Math.max(h, this[k] ? this[k].height : 0));
    const c = this[k].getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.clearRect(0, 0, w, h);
    return c;
  }
  /** variant(id, 'night' | 'white' | 'moon', now?) -> the variant's entry id, or -1 while it is queued (draw the base
   *  meanwhile). 'moon' is the base with MOON_GRADE of the night variant over it: one draw for the cast at night.
   *  now = true makes it at once (behind a title screen). */
  variant(id, kind, now = false) {
    const e = this.entries[id]; if (!e || !e.alive) return -1;
    const v = e[kind]; if (v >= 0 && this.entries[v].alive) return v;
    if (now) return this._variant(id, kind);
    if (!this.queue.some(q => q.of === id && q.kind === kind)) this.queue.push({ of: id, kind });
    return -1;
  }
  /** Make a variant by compositing only: copy, tint (multiply), clip to the sprite (destination-in), then put the
   *  unlit and emissive pixels back at full colour (the source clipped by the mask page's alpha). No readback. */
  _variant(id, kind) {
    const e = this.entries[id]; if (!e || !e.alive) return -1;
    const src = this.pages[e.page]; src.lastUsed = this.frame;   // never recycle the page being read
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
