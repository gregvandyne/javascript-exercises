// Entities: things in the world with a sprite (or a rig of part sprites), a transform, juice and behaviours ("parts").
// Positions are in world units; size is the on-screen height in design units at zoom 1.
import { z as Z, motion, color } from './tokens.js';
import { mulberry32, seedOf } from './rand.js';
import { MOON_GRADE } from './atlas.js';

let NEXT_ID = 1;
export class Entity {
  constructor(stage, sprite, o = {}) {
    this.stage = stage; this.id = NEXT_ID++;
    this.sprite = sprite; this.kind = o.kind || sprite; this.tag = o.tag || ''; this.spec = o.spec || null;
    this.x = +o.x || 0; this.y = +o.y || 0; this.px = this.x; this.py = this.y; this.vx = 0; this.vy = 0;
    this.rot = +o.rot || 0; this.sx = 1; this.sy = 1; this.alpha = o.alpha == null ? 1 : +o.alpha;
    this.size = +o.size || 64; this.layer = o.layer != null ? o.layer : Z.actors; this.z = +o.z || 0; this.par = o.par == null ? 1 : +o.par;
    this.flip = !!o.flip; this.tint = null; this.flashK = 0; this.emissive = +o.emissive || 0; this.lit = o.lit === false ? 0 : 1; this.wind = +o.wind || 0;
    this.shadow = o.shadow == null ? this.layer === Z.actors : !!o.shadow;
    // How much of the night grade the sprite takes: scenery all of it; the cast and pickups about a quarter, so skin,
    // fur and colours stay warm and readable at night (a cool rim light does the rest on Glaze).
    this.grade = o.grade != null ? Math.max(0, Math.min(1, +o.grade)) : this.layer === Z.actors ? MOON_GRADE : 1;
    this.visible = true; this.dead = false; this.grounded = false; this.variant = o.variant || '';
    // juice (multipliers/offsets on top of the transform; never re-bake: buckets use the base size)
    this.jsx = 1; this.jsy = 1; this.jy = 0; this.jrot = 0; this.breathe = 0; this.csx = 1; this.csy = 1;
    this.lookX = 0; this.lookY = -1; this.lookAt = null; this.clip = 'idle'; this.moodName = 'happy';
    this.rng = mulberry32(seedOf(o.seed != null ? o.seed : this.id * 7919));
    this.blinkAt = 1 + this.rng() * 3; this.invuln = 0;
    this.rig = o.rig || null; this.slots = this.rig ? Array.from({ length: 16 }, () => ({ name: '', x: 0, y: 0, w: 0, h: 0, r: 0, v: '', c: { name: '', v: '', b: -1, id: -1 } })) : null;
    this.behaviours = []; this.fns = null;
    this._c = { name: '', v: '', b: -1, id: -1 }; this._sc = { name: '', v: '', b: -1, id: -1 };
  }
  // ---- events
  on(ev, fn) { (this.fns || (this.fns = {}))[ev] = (this.fns[ev] || []).concat(fn); return () => { this.fns[ev] = this.fns[ev].filter(f => f !== fn); }; }
  emit(ev, ...a) { const l = this.fns && this.fns[ev]; if (l) for (const f of l) { try { f(...a); } catch (e) { this.stage.kit.warn(e); } } }
  // ---- look and feel
  state(name) { this.clip = String(name); return this; }
  mood(m) { this.moodName = String(m); return this; }
  look(at) { this.lookAt = at || null; return this; }
  /** pop-in: backOut scale from 0 (reduced motion: a 200 ms fade). */
  pop() {
    const tw = this.stage.kit.loop.tw;
    if (this.stage.reduced) { this.alpha = 0; return tw.tween(this, { alpha: 1 }, { ms: 200, ease: 'linear' }); }
    this.jsx = this.jsy = 0.01;
    return Promise.all([tw.tween(this, { jsx: 1 }, { ms: motion.pop.ms, ease: 'backOut' }), tw.tween(this, { jsy: 1 }, { ms: motion.pop.ms, ease: 'backOut' })]);
  }
  /** squash(0.8): volume-preserving (sx = 1/sqrt(sy)), springs back. amt > 1 stretches. */
  squash(amt = 0.8, ms = 220) {
    const tw = this.stage.kit.loop.tw;
    this.jsy = amt; this.jsx = 1 / Math.sqrt(amt);
    tw.tween(this, { jsy: 1, jsx: 1 }, { ms, ease: 'elasticOut' });
  }
  /** A white hit flash: none with reduced motion, and at most 3 a second across the game (WCAG 2.3.1). */
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
  /** float('+1', 'reward', {avoid, to: 'score', onArrive}): world text that rises from this entity and fades (or flies
   *  into the score pill). */
  float(text, role = 'reward', o = {}) { return this.stage.floatText(String(text), this.x, this.y - this.size * (this._ay() - 0.5) - this.size * 0.3, role, o); }
  say(key, vars) { return this.stage.kit.say(key, { who: this, vars }); }
  /** add('patrol', {...}) attaches a behaviour; a function works too: add((e, dt) => ...). */
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
  /** collect(): the pickup pops up and away with a sparkle burst, then is removed. Resolves when gone. */
  collect(fx = 'sparkle') {
    if (this.dead || this.collecting) return Promise.resolve(false);
    // a world's pickup collected from game code counts like one the hero touched (points, got, combo, on.collect)
    if (this.world && this.roleName === 'collectible' && !this.taken) return this.world._collect(this) || Promise.resolve(true);
    this.collecting = true; const tw = this.stage.kit.loop.tw;
    this.stage.particles.burst(fx, this.x, this.y - this.size * (this._ay() - 0.5));
    if (this.stage.reduced) return tw.tween(this, { alpha: 0 }, { ms: 200, ease: 'linear' }).then(() => { this.remove(null); return true; });
    return Promise.all([tw.tween(this, { jsx: 1.35, jsy: 1.35 }, { ms: 110, ease: 'quadOut' }).then(() => tw.tween(this, { jsx: 0.01, jsy: 0.01, alpha: 0 }, { ms: 180, ease: 'backIn' })), tw.tween(this, { jy: -this.size * 0.5 }, { ms: 290, ease: 'cubicOut' })]).then(() => { this.remove(null); return true; });
  }
  /** break(): a crate/rock shatters into chips and dust. */
  break() {
    if (this.dead) return;
    const cy = this.y - this.size * (this._ay() - 0.5);
    this.stage.particles.burst('chips', this.x, cy, { n: 10 }); this.stage.particles.burst('dust', this.x, cy, { n: 6 });
    this.stage.camera.shake(0.18); this.remove(null);
  }
  get hitW() { const d = this.stage.atlas.defs.get(this.sprite); return this.size * (d ? d.w / d.h : 1) * 0.8; }
  get hitH() { return this.size * 0.8; }
  /** Overlap test with 80% hitboxes (anchor-aware). */
  touches(o) {
    const dx = Math.abs(this.x - o.x), dy = Math.abs((this.y - this.size * this._ay() + this.size / 2) - (o.y - o.size * o._ay() + o.size / 2));
    return dx < (this.hitW + o.hitW) / 2 && dy < (this.hitH + o.hitH) / 2;
  }
  _ay() { const d = this.stage.atlas.defs.get(this.sprite); return d && d.ay != null ? d.ay : 0.5; }
}
/** The atlas entry for a sprite at hPx device px, cached in `c` ({name, v, b, id}): no string keys or map lookups
 *  per frame unless the size bucket or the sprite changes (or its page was recycled). */
export function cachedSprite(A, c, name, v, hPx) {
  if (c.name === name && c.v === v && c.id >= 0 && Math.abs(c.b - hPx) < c.b * 0.13 && A.entries[c.id].alive) return c.id;
  c.name = name; c.v = v; c.id = A.sprite(name, hPx, v); c.b = A.lastExact ? hPx : -1e9;   // a stand-in size: ask again next frame
  return c.id;
}
export const ROLE_TEXT = r => color(r === 'hazard' || r === 'wrong' ? 'coral' : r === 'reward' ? 'spark' : r === 'player' ? 'mint' : r, 'base');
