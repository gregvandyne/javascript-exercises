// The stage (adoption level B): fit, layers, camera, entities, particles, lights, sky and biome, time of day, backend
// pick/demote and the governor. Every frame it fills one display list and hands it to Paper or Glaze.
import { DisplayList, View, BLEND_ADD } from './list.js';
import { Atlas } from './atlas.js';
import { Camera } from './camera.js';
import { Particles } from './particles.js';
import { Paper } from './paper.js';
import { Glaze } from './glaze.js';
import { Governor, TIER_SPEC, probeGL, pickBackend, pickTier } from './governor.js';
import { sky } from './sky.js';
import { computeFit } from './fit.js';
import { defineCoreArt } from './art.js';
import { defineChar, charSpec, charRig, CH, FACES } from './chars.js';
import { defineProps } from './props.js';
import { BIOMES, RECIPES, biomeBands, defineGround, autotile, groundVariant } from './biomes.js';
import { SPECIES } from './validate.js';
import { textSprite } from './text.js';
import { Entity, cachedSprite, ROLE_TEXT } from './entity.js';
import { nearest } from './validate.js';
import { ease } from './ease.js';
import { z as Z, PALETTE } from './tokens.js';
import { mulberry32 } from './rand.js';
import { hexToRgb, hexToOklab, oklabToRgb } from './color.js';

const LAYER_OF = { sky: Z.sky, far: Z.far, mid: Z.mid, near: Z.near, world: Z.world, actors: Z.actors, fx: Z.fx, front: Z.front };
const rgb01 = hex => hexToRgb(hex).map(v => v / 255);

export class Stage {
  constructor(kit, canvas = null, o = {}) {
    this.kit = kit; const doc = this.doc = kit.doc, win = this.win = kit.win;
    this.size = Array.isArray(o.size) ? o.size : [960, 540]; this.fitMode = o.fit === 'letterbox' ? 'letterbox' : 'expand';
    this.biome = o.biome === 'none' ? 'none' : BIOMES[o.biome] ? o.biome : 'meadow'; this.seed = o.seed != null ? o.seed : 1; this.dress = o.dress == null ? 'auto' : o.dress;
    // backend + tier (spec §5.2): override -> probe -> software check
    const q = kit.query, set = kit.settings;
    this.backendOverride = o.backend && o.backend !== 'auto' ? o.backend : q.okBackend || 'auto';
    const probe = this.backendOverride === 'auto' && set.get('graphics') !== 'simple' ? probeGL(() => doc.createElement('canvas')) : null;
    this.probe = probe;
    const backend = kit.glLocked ? 'paper' : pickBackend({ override: this.backendOverride, probe, graphics: set.get('graphics') });
    const tier = pickTier({ backend, override: q.okTier || o.tier || '', graphics: set.get('graphics') });
    this.gov = new Governor({ tier, locked: kit.glLocked });
    if (q.okGov === 'off') this.gov.sample = () => null;   // screenshots and timing tests on slow (software) GPUs: keep the tier as asked
    this.dprOverride = +q.okDpr || 0;
    this.atlas = new Atlas({ doc, pageSize: TIER_SPEC[tier].page, now: kit.clock });
    defineCoreArt(this.atlas); defineProps(this.atlas); defineGround(this.atlas);
    for (const fn of kit.artPacks) fn(this.atlas);
    // DOM
    this.el = doc.createElement('div'); this.el.className = 'ok-stage';
    // the kit tag may run in <head> (before <body> exists): the stage then joins the page once the body is parsed
    const put = () => { const parent = o.parent || doc.body, r = kit.ui.mount(); if (r.parentNode === parent) parent.insertBefore(this.el, r); else parent.appendChild(this.el); };
    if (o.parent || doc.body) put(); else doc.addEventListener('DOMContentLoaded', put, { once: true });
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
    this.clouds = []; for (let i = 0; i < 7; i++) { const far = i < 3; this.clouds.push({ x: (i + R() * 0.7) / 7, y: (far ? 0.05 : 0.1) + R() * 0.2, s: (48 + R() * 46) * (far ? 0.62 : 1), v: (far ? 3 : 7) + R() * 8, far, c: { name: '', v: '', b: -1, id: -1 } }); }   // two depths: far ones smaller, slower, fainter
    const R2 = mulberry32(this.seed * 17 + 3);   // a denser starfield for space biomes (biome stars: n)
    for (let i = 0; i < 40; i++) this.stars.push({ x: R2(), y: R2(), s: 5 + R2() * 7, p: R2() * 6.28, c: { name: '', v: '', b: -1, id: -1 }, extra: true });
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
  /** 0 = noon .. 1 = night (tween it with setTimeOfDay / toNight). */
  get timeOfDay() { return this.tod; }
  /** Moving the window to a screen with another pixel ratio fires no resize everywhere: watch the ratio itself. */
  _watchDpr() {
    const win = this.win; if (this._offDpr) this._offDpr();
    try {
      const mq = win.matchMedia && win.matchMedia(`(resolution: ${win.devicePixelRatio || 1}dppx)`); if (!mq || !mq.addEventListener) return;
      const fn = () => { this.sizeDirty = true; this._watchDpr(); };
      mq.addEventListener('change', fn, { once: true }); this._offDpr = () => mq.removeEventListener('change', fn);
    } catch (e) { /* old engines: resize events only */ }
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
  // ---- backends -----------------------------------------------------------------------------------------------------
  _makeBackend(name) {
    const old = this.canvas;
    if (this.backend) { try { this.backend.dispose(); } catch (e) { /* ignore */ } }
    let canvas = this.doc.createElement('canvas'), b = null;
    if (name === 'glaze' && !this.kit.glLocked) {
      try {
        b = new Glaze(canvas, this.atlas, { force: this.backendOverride === 'glaze' });
        const gz = b;   // our own dispose() also loses the context on purpose: that is not a crash
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
  /** A scene transition / pause: apply any pending tier or backend change (never mid-play). */
  transition() {
    const was = this.gov.backend;
    if (this.gov.transition() || was !== this.gov.backend || this.gov.backend !== this.backend.name) this._makeBackend(this.gov.backend);
    this.kit.tier = this.gov.tier;
  }
  setTier(t, now = true) { this.gov.request(t); if (now) this.transition(); }
  setBackend(b) { this.backendOverride = b; this.setTier(b === 'paper' ? 'low' : this.gov.tier === 'low' ? 'mid' : this.gov.tier); }
  // ---- coordinates --------------------------------------------------------------------------------------------------
  toDesign(x, y) { const f = this.fit; return f ? { x: (x - f.offX) / f.k, y: (y - f.offY) / f.k } : { x, y }; }
  toWorld(p) { return this.camera.toWorld(p); }
  /** The world y at a fraction f of the view height (0 = top, 1 = bottom): stand things on the biome's ground bands. */
  viewY(f) { return this.camera.y + (f - 0.5) * this.view.vh / this.camera.zoom; }
  viewX(f) { return this.camera.x + (f - 0.5) * this.view.vw / this.camera.zoom; }
  _resize() {
    const cw = this.el.clientWidth || this.win.innerWidth, ch = this.el.clientHeight || this.win.innerHeight;
    const dev = this.win.devicePixelRatio || 1; this.gov.devDpr = dev;
    // Paper's render scale: a smaller backing store the browser scales up (the governor's last rung on slow CPUs).
    const dpr = (this.dprOverride || Math.min(dev, this.gov.dprCap)) * (this.backend.name === 'paper' ? this.gov.scale : 1);
    const f = this.fit = computeFit(cw, ch, this.size, this.fitMode, dpr);
    this.backend.resize(f.pw, f.ph);
    const V = this.view; V.scale = f.k * dpr; V.offX = f.offX * dpr; V.offY = f.offY * dpr; V.vw = f.vw; V.vh = f.vh;
    this.camera.vw = f.vw; this.camera.vh = f.vh; this.camera.clamp();
    this.sizeDirty = false; this.dpr = dpr;
  }
  // ---- content ------------------------------------------------------------------------------------------------------
  /** add('oomba' | spriteName, {x, y, size, layer, z, tag, parts, ...}) -> Entity */
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
  /** addChar(spec, {x, y, size, ...}) -> a rigged character Entity (state(clip), mood(m), look(at) drive it). */
  addChar(spec, o = {}) {
    const b = defineChar(this.atlas, spec && spec.__ok ? spec : charSpec(spec));
    const e = new Entity(this, b.id, Object.assign({ size: 150 * b.spec.size }, o, { rig: charRig, spec: b.spec, kind: b.spec.species, layer: typeof o.layer === 'string' ? LAYER_OF[o.layer] : o.layer }));
    e.charB = b; e.moodName = b.spec.mood; e.lookX = 0; e.lookY = 0;   // pupils start centred (never googly in stills)
    if (o.parts) for (const p of o.parts) typeof p === 'string' ? e.add(p) : e.add(Object.keys(p)[0], p[Object.keys(p)[0]]);
    this.entities.push(e); this.sortDirty = true;
    return e;
  }
  /** ground(['....##', '######'], {cell, x, y}): auto-tiled ground for the stage's biome -> the tile entities. */
  ground(rows, o = {}) {
    const cell = o.cell || 64, x0 = o.x != null ? o.x : -((rows[0] || '').length * cell) / 2, y0 = o.y != null ? o.y : 0, name = 'ground:' + (o.biome || (this.biome === 'none' ? 'meadow' : this.biome));
    return autotile(rows).map(t => this.add(name, { x: x0 + t.x * cell + cell / 2, y: y0 + t.y * cell + cell / 2, size: cell + 1, variant: groundVariant(t), layer: 'world', shadow: false }));
  }
  /** Switch the background biome (bands re-bake at the next frame). */
  setBiome(name) { this.biome = name === 'none' ? 'none' : BIOMES[name] ? name : 'meadow'; this.bandKey = ''; }
  /** Scene dressing: 'auto' (props, foreground framing, ambient life), 'off' (sparse bands only) or a density (0.2-2). */
  setDress(v) { this.dress = v == null ? 'auto' : v; this.bandKey = ''; }
  update(fn) { this.updaters.push(fn); return () => { this.updaters = this.updaters.filter(f => f !== fn); }; }
  draw(fn) { this.drawers.push(fn); return () => { this.drawers = this.drawers.filter(f => f !== fn); }; }
  /** light({x, y, follow, radius, color, intensity, night:true}) -> Light (only shines at dusk/night when night is true). */
  light(o = {}) {
    const c = rgb01(o.color || PALETTE.spark[1]);
    const l = { x: +o.x || 0, y: +o.y || 0, follow: o.follow || null, dy: +o.dy || 0, radius: +o.radius || 220, intensity: o.intensity == null ? 1 : +o.intensity, r: c[0], g: c[1], b: c[2],
      on: o.on !== false, night: o.night !== false, flicker: o.flicker !== false, base: o.intensity == null ? 1 : +o.intensity, halo: o.halo !== false, phase: this.lights.length * 1.7 };
    this.lights.push(l); return l;
  }
  theme(mode) { this.kit.theme.set(mode); }
  /** Tween time of day (0 day .. 1 night). Reduced motion: instant. */
  toNight(on = true, ms = 3000) { return this.setTimeOfDay(on ? 1 : 0, ms); }
  setTimeOfDay(v, ms = 3000) {
    if (this.reduced || !ms) { this.tod = v; return Promise.resolve(true); }
    return this.kit.loop.ui.tween(this, { tod: v }, { ms, ease: 'sineInOut' });
  }
  /** The spark iris wipe: 'out' closes on (x, y) (0..1 of the screen), 'in' opens. Resolves when done. */
  wipe(dir = 'out', o = {}) {
    const F = this.F; const ms = o.ms || 500;
    if (o.at) { const p = this.camera.toScreen(o.at); F.irisX = p.x / this.view.vw; F.irisY = p.y / this.view.vh; } else { F.irisX = o.x != null ? o.x : 0.5; F.irisY = o.y != null ? o.y : 0.5; }
    if (this.reduced) { F.iris = dir === 'out' ? 0 : 2; return Promise.resolve(true); }
    if (dir === 'out') { F.iris = Math.min(F.iris, 1.2); return this.kit.loop.ui.tween(F, { iris: 0 }, { ms, ease: 'cubicIn' }); }
    F.iris = Math.min(F.iris, 0); return this.kit.loop.ui.tween(F, { iris: 1.6 }, { ms, ease: 'cubicOut' }).then(() => { F.iris = 2; });
  }
  /** Screen flash (at most 3/s, none with reduced motion). */
  flash(color = '#FFFFFF') {
    if (this.reduced || !this.kit.flashes.allow(this.kit.loop.now)) return false;
    this.F.flashColor = color; const c = rgb01(color); this.F.flashRgb[0] = c[0]; this.F.flashRgb[1] = c[1]; this.F.flashRgb[2] = c[2];
    this.F.flash = 0.55; this.kit.loop.ui.tween(this.F, { flash: 0 }, { ms: 180, ease: 'quadOut' });
    return true;
  }
  /** floatText('+10', x, y, role, {avoid: entity, to: 'score' | {x, y} (screen design units), onArrive})
   *  World text that pops and rises; with avoid it never covers that entity (it starts above its head), and with
   *  to it flies into a HUD counter (the score pill) and calls onArrive there. */
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
  /** The centre of a HUD element in screen design units (null when there is none). */
  _hudPoint(sel) {
    const root = this.kit.ui.root, el = root && root.querySelector(sel); if (!el || !this.fit) return null;
    const r = el.getBoundingClientRect(); if (!r.width) return null;
    const box = this.el.getBoundingClientRect();
    return this.toDesign(r.left + r.width / 2 - box.left, r.top + r.height / 2 - box.top);
  }
  /** Bake what the scene will draw now, behind a title screen: every entity (and rig part and face) at the current
   *  zoom and the listed extra zooms, extra sprites and world texts, and (night: true, or a dark theme) the night
   *  variants Paper crossfades to. Steady-state play then bakes nothing. */
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
      for (const n of this.particles.spriteNames) ids.push(A.sprite(n, 24 * k, ''));   // every particle preset's sprite
    }
    for (const t of o.text || []) textSprite(this.atlas, String(t[0] != null && typeof t !== 'string' ? t[0] : t), { px: 30 * V.scale * this.camera.effZoom, color: ROLE_TEXT(typeof t === 'string' ? 'reward' : t[1] || 'reward'), dir: this.kit.i18n.dir, lang: this.kit.i18n.lang });
    for (let i = 0; A.queue.length && i < 4000; i++) A.pump(0, null);
    if (o.night || this.kit.theme.dark || this.tod > 0.01) {
      for (const id of ids) if (id >= 0) A.variant(id, 'night', true);
      // the cast's parts get their single-draw 'moon' variant too
      for (const id of ids) { const en = A.entries[id]; if (en && /^ch[0-9a-z]+:/.test(en.key)) A.variant(id, 'moon', true); }
    }
    return ids.filter(id => id >= 0).length;
  }
  burst(preset, x, y, o) { return this.particles.burst(preset, x, y, o); }
  destroy() {
    this.dead = true; this.win.removeEventListener('resize', this._onResize); if (this._offSettings) this._offSettings();
    if (this._offTheme) this._offTheme(); if (this._offDpr) this._offDpr();
    try { this.backend.dispose(); } catch (e) { /* ignore */ }
    if (this.el.parentNode) this.el.parentNode.removeChild(this.el);
    this.kit.detachStage(this);
  }
  // ---- the frame ----------------------------------------------------------------------------------------------------
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
  /** Fireflies at night: 12-20 on screen, low in the ground band and near lit lanterns, behind the play layer, small,
   *  green-yellow and slow to blink (never mistaken for a pickup). */
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
    F.tod = this.tod; F.time = now / 1000; F.vignette = F.contrast ? 0 : 0.35 + 0.65 * Math.min(1, this.tod * 1.5);   // light by day (it reads as dirt on a bright sky), full at night
    const amb = this.skyOut.ambient; F.ambient[0] = amb[0]; F.ambient[1] = amb[1]; F.ambient[2] = amb[2];
    F.renderScale = this.gov.scale; F.bloom = this.gov.bloom && !F.contrast; F.maxLights = this.gov.lights; F.lightK = this.skyOut.lanterns;
    V.camX = C.x; V.camY = C.y; V.zoom = C.effZoom; V.shakeX = C.sx; V.shakeY = C.sy; V.shakeRot = C.srot;
    L.clear();
    if (this.biome !== 'none') { this._emitSky(); this._emitBands(); if (this.dress !== 'off' && !F.contrast) this._emitLife(); }
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
    const k = t[2] * (B.skyHold ? 1 : 1 - Math.min(1, this.tod * 1.4)), S = this.skyOut;   // skyHold: the tint stays at night (space, under the sea)
    for (let i = 0; i < 3; i++) { S.top[i] += (this._tint[0][i] - S.top[i]) * k; S.bottom[i] += (this._tint[1][i] - S.bottom[i]) * k; }
  }
  _probeHigh(now) {
    // Glaze+ needs >= 8 cores and a 2 s probe with p90 < 9 ms; it is applied at the next transition.
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
    // a biome may change the sky: stars by day too (stars: 0..1, filling more of the sky), rising bubbles instead of
    // stars, no clouds, and a sprite in place of the sun and moon (sun: false | 'planet')
    const B = BIOMES[this.biome] || {};
    if (B.bubbles) {
      for (const s of this.stars) {
        if (s.extra) continue;
        const id = cachedSprite(A, s.c, 'bubble', '', s.s * 2.2 * k), y = 1 - ((s.y + t * 0.02 * (0.6 + s.p / 6)) % 1) * 0.9;
        const i = L.push(id, (s.x + Math.sin(t * 0.8 + s.p) * 0.01) * V.vw, y * V.vh, s.s * 2.2, s.s * 2.2, Z.sky, 0); L.alpha[i] = 0.85; L.lit[i] = 1;
      }
    }
    const starA = B.bubbles ? 0 : Math.max(S.stars, B.stars || 0);
    if (starA > 0.01) {
      // stars stay in the sky band: above the farthest hills, thinning toward them
      const top = this.bands && this.bands.length ? this.bands[0].top * (this.bandView ? V.vh / this.bandView.vh : 1) / V.vh : 0.45, maxY = Math.max(0.12, Math.min(B.stars ? 0.46 : 0.34, top - 0.06));
      for (const s of this.stars) {
        if (s.extra && !B.stars) continue;
        const id = cachedSprite(A, s.c, 'star', '', s.s * k), y = 0.025 + s.y * s.y * (maxY - 0.025);
        const i = L.push(id, s.x * V.vw, y * V.vh, s.s, s.s, Z.sky, 0);
        L.alpha[i] = starA * (0.5 + 0.35 * Math.sin(t * 0.9 + s.p * 3)) * (1 - 0.6 * s.y); L.lit[i] = 0; L.emis[i] = 1;
      }
    }
    if (typeof B.sun === 'string') {   // a planet hangs in the sky all day and night
      const id = cachedSprite(A, this.bodyC[0], B.sun, '', 190 * k), i = L.push(id, 0.72 * V.vw, 0.16 * V.vh, 228, 190, Z.sky, 0); L.alpha[i] = 1; L.lit[i] = 1;
    }
    for (let b = 0; b < 2 && B.sun == null; b++) {
      const o = b ? S.moon : S.sun, name = b ? 'moon' : 'sun', size = b ? 250 : 150; if (o.a <= 0.01) continue;   // a big glowing moon sells a night scene
      const id = cachedSprite(A, this.bodyC[b], name, '', size * k);
      // on a tall phone the moon hangs at the top end corner, clear of the title and the HUD's first pills
      const port = b && V.vh > V.vw * 1.1, mx = port ? 0.84 : o.x, my = port ? Math.max(0.15, Math.min(o.y, 0.3)) : o.y;
      const i = L.push(id, mx * V.vw, my * V.vh, size, size, Z.sky, 0); L.alpha[i] = o.a; L.lit[i] = 0; L.emis[i] = 1;
    }
    const span = V.vw + 400;
    for (const c of (B.clouds === false ? [] : this.clouds)) {
      const id = cachedSprite(A, c.c, 'cloud', '', c.s * k);
      let x = (c.x * span + t * c.v - V.camX * 0.05) % span; if (x < 0) x += span;
      const i = L.push(id, x - 200, c.y * V.vh, c.s * 160 / 70, c.s, Z.sky, 0); L.lit[i] = 1; L.alpha[i] = c.far ? 0.85 : 0.98;
      // tinted by the sky behind it: a little of the way from white to the sky colour (blue by day, warm at sunset)
      const tt = Math.pow(Math.min(1, c.y + 0.12), 1.15), rgb = oklabToRgb(S.top[0] + (S.bottom[0] - S.top[0]) * tt, S.top[1] + (S.bottom[1] - S.top[1]) * tt, S.top[2] + (S.bottom[2] - S.top[2]) * tt);
      const q = 0.08 + 0.3 * Math.min(1, this.tod * 2); L.tr[i] = 1 - (1 - Math.min(255, rgb[0]) / 255) * q; L.tg[i] = 1 - (1 - Math.min(255, rgb[1]) / 255) * q; L.tb[i] = 1 - (1 - Math.min(255, rgb[2]) / 255) * q;
    }
  }
  /** Parallax bands: one dedicated atlas page per band slot, re-baked in place when the biome, the tier's band count or
   *  the view size changes (never a new page per size: resizing, rotation and zoom cannot leak). During a live resize
   *  the old bands are drawn stretched until 150 ms pass with no change. */
  _emitBands() {
    const V = this.view, L = this.list, A = this.atlas, now = this.kit.loop.now;
    const count = TIER_SPEC[this.gov.tier].bands;
    const shape = this.biome + '#' + count + '#' + this.dress, size = Math.round(V.vw) + 'x' + Math.round(V.vh) + '@' + Math.round(V.scale * 10);
    const want = shape + '|' + size;
    if (want !== this.bandWant) { this.bandWant = want; this.bandWantAt = now; }
    const shapeChanged = !this.bands || !this.bandKey.startsWith(shape + '|');
    if (want !== this.bandKey && (shapeChanged || now - this.bandWantAt >= 150)) {
      this.bandKey = want;
      this.bands = biomeBands(this.doc, { biome: this.biome, vw: V.vw, vh: V.vh, pxk: V.scale, seed: this.seed, count, dress: this.dress });
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
        const i = L.push(id, x, b.top * sy, W + 0.5, b.h * sy, layer, 0); L.ax[i] = 0; L.ay[i] = 0; L.lit[i] = layer === Z.near ? 0.4 : 0.15;   // far scenery: night ambient, little lantern light
      }
    }
  }
  /** Ambient life and foreground framing (auto-dressing): birds / gulls in flocks, butterflies, drifting leaves, snow,
   *  fish under the sea; big leaves framing the bottom corners. Analytic paths on the clock: nothing is allocated per
   *  frame. Counts follow the tier; reduced motion keeps the framing and drops the movers. */
  _emitLife() {
    const L = this.list, A = this.atlas, V = this.view, k = V.scale, t = this.t, B = RECIPES[this.biome] || {}, tier = this.gov.tier;
    if (!A.defs.get('critter')) return;   // the dress pack draws them
    const C = this.lifeC || (this.lifeC = Array.from({ length: 48 }, () => ({ name: '', v: '', b: -1, id: -1 })));
    const sK = Math.max(1, Math.min(2.4, V.vh / V.vw * 1.25)), many = tier === 'low' ? 0.5 : 1;
    let c = 0;
    if (B.fg) {
      const h = Math.min(V.vh * 0.2, V.vw * 0.17), w = h * 1.1, id = cachedSprite(A, C[c++], 'fg', this.biome, h * k), sw = this.reduced ? 0 : 0.02;
      for (const side of [0, 1]) { const i = L.push(id, side ? V.vw + 4 : -4, V.vh + 6, side ? -w : w, h, Z.front, 0); L.ax[i] = 0; L.ay[i] = 1; L.rot[i] = sw * Math.sin(t * 1.4 + side * 2) * (side ? -1 : 1); L.lit[i] = 0.6; }
      c = 2;
    }
    if (this.reduced) return;
    const day = 1 - Math.min(1, this.skyOut.stars * 1.4), life = String(B.life || '').split(',');
    const put = (v, x, y, w, h, layer, a, rot) => { if (c >= C.length || a <= 0.02) return; const id = cachedSprite(A, C[c++], 'critter', v, Math.abs(h) * k * 1.6), i = L.push(id, x, y, w, h, layer, 0); L.alpha[i] = a; L.rot[i] = rot || 0; L.lit[i] = 0.5; };
    const fr = x => x - Math.floor(x);
    for (const kind of life) {
      if (kind === 'bird' || kind === 'gull') {
        for (let f = 0; f < (many < 1 ? 1 : 2); f++) {
          const P = 13 + f * 5, u = fr(t / P + f * 0.41), dir = f % 2 ? -1 : 1, x0 = dir > 0 ? -120 + u * (V.vw + 240) : V.vw + 120 - u * (V.vw + 240), y0 = (0.1 + f * 0.09) * V.vh + Math.sin(t * 0.6 + f) * 12;
          for (let j = 0; j < 3; j++) { const s = (kind === 'gull' ? 34 : 24) * sK * (j ? 0.8 : 1), fl = 0.3 + 0.7 * Math.abs(Math.sin(t * 8 + j * 1.7 + f)); put(kind, x0 - dir * j * 30 * sK, y0 + (j === 0 ? 0 : j === 1 ? -14 : 14) * sK, s * 40 / 30 * dir, s * fl, Z.near, day); }
        }
      } else if (kind === 'butterfly') {
        for (let j = 0; j < 3 * many; j++) {
          const x = V.vw * (0.08 + 0.84 * fr(t * 0.025 + j * 0.37)) + Math.sin(t * 1.3 + j * 2) * 40, y = V.vh * (0.6 + 0.07 * Math.sin(t * 0.8 + j * 2.1)) + Math.sin(t * 3.1 + j) * 10, s = 30 * sK;
          put(j % 2 ? 'fly2' : 'fly', x, y, s * 1.33 * (0.25 + 0.75 * Math.abs(Math.sin(t * 13 + j))), s, Z.near, day, Math.sin(t * 2 + j) * 0.2);
        }
      } else if (kind === 'leaf') {
        for (let j = 0; j < 5 * many; j++) { const s = 16 * sK, y = (fr(t * 0.045 + j * 0.21) * 1.15 - 0.08) * V.vh, x = fr(j * 0.29 + t * 0.01) * V.vw + Math.sin(t * 1.2 + j) * 36; put('leaf' + j % 3, x, y, s * 1.33, s, Z.near, 0.95, t * 1.3 + j); }
      } else if (kind === 'fish') {
        for (let j = 0; j < 4 * many; j++) { const dir = j % 2 ? -1 : 1, u = fr(t / (16 + j * 3) + j * 0.3), s = (20 + j * 4) * sK; put('fish', dir > 0 ? -60 + u * (V.vw + 120) : V.vw + 60 - u * (V.vw + 120), V.vh * (0.2 + j * 0.11) + Math.sin(t * 1.4 + j) * 8, -s * 1.33 * dir, s, Z.near, 1); }
      } else if (kind === 'snow') {
        const D = this.snowC || (this.snowC = { name: '', v: '', b: -1, id: -1 }), id = cachedSprite(A, D, 'dot', '', 10 * k);
        for (let j = 0; j < 30 * many; j++) { const r = (j * 0.618) % 1, s = (4 + r * 6) * sK, y = (fr(t * (0.03 + r * 0.03) + j * 0.137) * 1.1 - 0.05) * V.vh, x = fr(j * 0.377 + Math.sin(t * 0.4 + j) * 0.01) * V.vw; const i = L.push(id, x, y, s, s, r > 0.6 ? Z.fx : Z.near, 0); L.alpha[i] = 0.85; L.lit[i] = 0.3; }
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
      if (e.par === 1) {   // cull what is well outside the view (long levels: hundreds of tiles, a few dozen on screen)
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
      // invulnerable: a smooth 2.5 Hz pulse (never a strobe; steady with reduced motion)
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
      if (f.to && f.t >= 0.22) {   // fly into the HUD counter (screen space), shrinking a little on the way
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
      // behind the props (the lantern glass stays crisp in front of its own glow); it hazes the hills, never the cast
      const i = L.push(id, l.x, l.y, r * 2, r * 2, Z.shadow, 1);
      L.blend[i] = BLEND_ADD; L.emis[i] = 0.12; L.lit[i] = 0; L.alpha[i] = Math.min(0.9, (this.backend.name === 'glaze' ? 0.22 : 0.42) * l.intensity * nk);   // the light itself lights sprites; the halo only hazes (a full-emissive halo blooms into glare)
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
export const RIGS = {};
/** Character fields stage.add('kid', {...}) takes at the top level (or under char:). */
const CHAR_FIELDS = ['skin', 'hair', 'outfit', 'wear', 'mood', 'colors', 'body', 'seed'];
