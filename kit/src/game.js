// The game layer (spec §7.2, adoption level A): Oomba.game({...}) runs a whole kid-ready game from a spec: a level
// grid, a hero, control presets (platformer kid-easy / snappy / floaty, topdown, tap), gameplay parts (collectible,
// hazard, goal, checkpoint, spring, quiz gate, talk, door and key, moving platform, walker), automatic juice, the
// standard scenes (title -> intro -> how-to -> countdown -> play -> results / try again) wired to Oomba.ui, scores
// to BRB.score, sounds to BRB.sfx (through Oomba.sfx) and speech to BRB.speak (through Oomba.say). Everything steps on
// the fixed 60 Hz clock from a seeded RNG, so __brbTest.step(n) replays a round exactly.
import { grid, generate, TILE } from './level.js';
import { SPECIES } from './validate.js';
import { PROP_GROUPS } from './props.js';
import { Save } from './save.js';
import { rand, seedOf } from './rand.js';
import { z as Z } from './tokens.js';

// Control presets, in cells (so any cell size plays the same): run speed, ground accel/decel, air accel, gravity,
// jump speed, the early-release cut, max fall speed. All platformers: coyote 90 ms, jump buffer 110 ms, variable jump
// height, fall gravity x1.6, hit boxes 80% of the sprite, pickup magnet 0.6 x the hero's size.
const PRESETS = {
  'platformer:kid-easy': { run: 5.2, acc: 42, dec: 50, air: 30, g: 39, jump: 14.5, cut: 0.42, fall: 18 },
  'platformer:snappy': { run: 6, acc: 70, dec: 80, air: 50, g: 44, jump: 15.5, cut: 0.35, fall: 20 },
  'platformer:floaty': { run: 4.6, acc: 26, dec: 30, air: 20, g: 26, jump: 11.5, cut: 0.5, fall: 11 },
  topdown: { run: 4.2, acc: 40, dec: 50, top: true },
  tap: { run: 4.6, acc: 36, dec: 44, air: 26, g: 39, jump: 14.5, cut: 1, fall: 18, tap: true },
  none: { none: true },
};
export const CONTROLS = Object.keys(PRESETS);
const COYOTE = 0.09, BUFFER = 0.11, FALL_MUL = 1.6;
/** What each built-in kind spawns: sprite or character, size (cells), placement in its cell, parts (cell -> list). */
const KINDS = {
  goal: { sprite: 'flag', size: 2.75, place: 'floor', parts: () => ['goal'], world: 1, wind: 1, z: 1 },
  spark: { sprite: 'spark', size: 0.72, place: 'center', parts: c => ['collectible', { bob: { amp: c * 0.1 } }, { glow: { amount: 0.7 } }], z: 2 },
  coin: { sprite: 'coin', size: 0.62, place: 'center', parts: c => [{ collectible: { value: 5 } }, { bob: { amp: c * 0.08 } }], z: 2 },
  heart: { sprite: 'heart', size: 0.66, place: 'center', parts: c => [{ collectible: { heal: 1, value: 0, count: false } }, { bob: { amp: c * 0.08 } }], z: 2 },
  key: { sprite: 'key', size: 0.6, place: 'center', parts: c => [{ collectible: { key: 1, value: 0, count: false } }, { bob: { amp: c * 0.08 } }, { glow: { amount: 0.4 } }], z: 2 },
  gate: { sprite: 'gate', size: 2.6, place: 'floor', parts: () => ['quizGate'], world: 1, z: 4 },
  spikes: { sprite: 'spikes', size: 0.62, place: 'floor', parts: () => ['hazard'], world: 1, z: 2 },
  bee: { char: 'bee', size: 1.1, place: 'center', parts: c => ['hazard', { fly: { rangeX: c * 1.7, rangeY: c * 0.4, speed: 1.1 } }], shadow: false },
  spring: { sprite: 'spring', size: 0.9, place: 'floor', parts: () => ['spring'], world: 1, z: 2 },
  checkpoint: { sprite: 'checkpoint', size: 1.5, place: 'floor', parts: () => ['checkpoint'], world: 1, z: 1 },
  lantern: { sprite: 'lantern', size: 2.3, place: 'floor', parts: () => ['lantern'], world: 1, z: 1 },
  npc: { char: 'fox', size: 1.9, place: 'floor', parts: () => ['talk'] },
  door: { sprite: 'door', size: 1.95, place: 'floor', parts: () => ['door'], world: 1, z: 3 },
  mover: { sprite: 'platform', size: 0.55, place: 'top', parts: () => [{ platform: { dx: 3 } }], world: 1, z: 2 },
  roller: { sprite: 'spikeball', size: 0.8, place: 'floor', parts: () => ['hazard', 'walk'], z: 2, shadow: true },
  sign: { sprite: 'sign', size: 1.3, place: 'floor', parts: () => [], world: 1, z: 1, variant: '→' },   // talks when it has say
  crate: { sprite: 'crate', size: 1, place: 'floor', parts: () => ['solid'], world: 1, z: 2 },
};
export const KIND_NAMES = Object.keys(KINDS).concat('ground', 'ledge', 'water', 'player');
const CHAR_KEYS = ['skin', 'hair', 'outfit', 'wear', 'mood', 'colors', 'body'];
const SPAWN_KEYS = ['kind', 'c', 'r', 'ch', 'x', 'y', 'at', 'size', 'parts', 'place', 'ox', 'oy', 'z', 'layer', 'tag', 'variant', 'flip', 'seed', 'wind', 'shadow', 'as'];

// ---- gameplay parts: they register the entity with its world (the world does the interactions, in one place) ------
const role = name => (e, o) => { if (!e.world) { e.stage.kit.warn(`part "${name}" works in Oomba.game worlds (use w.spawn)`); return null; } e.world._role(name, e, o); return null; };
export const GAME_PARTS = {
  player: (e, o) => { if (e.world) e.world._player(e, o); return null; },
  collectible: role('collectible'), hazard: role('hazard'), goal: role('goal'), checkpoint: role('checkpoint'), spring: role('spring'),
  quizGate: role('gate'), talk: role('talk'), door: role('door'), solid: role('solid'), platform: role('platform'),
  key: (e, o) => GAME_PARTS.collectible(e, Object.assign({ key: 1, value: 0, count: false }, o)),
  /** walk: a ground walker that turns at walls and ledge edges (rolls if it is round). */
  walk: (e, o) => {
    const w = e.world; if (!w) return null;
    const L = w.level, cell = L.cell, sp = (o.speed || 1.6) * cell; let dir = o.dir || -1, vy = 0;
    return (e2, dt) => {
      if (w.scene !== 'play' && !o.always) return;
      const ahead = e.x + dir * (e.size * 0.45), r = L.row(e.y - 1);
      const wall = L.at(L.col(ahead), r) === TILE.solid, floor = L.at(L.col(ahead), L.row(e.y + 2)), edge = floor !== TILE.solid && floor !== TILE.ledge;
      if (wall || (edge && e.grounded)) dir = -dir;
      e.vx = sp * dir; e.x += e.vx * dt;
      vy = Math.min(18 * cell, vy + 39 * cell * dt); let ny = e.y + vy * dt; e.grounded = false;
      const top = L.row(ny) * cell, t = L.at(L.col(e.x), L.row(ny));
      if ((t === TILE.solid || t === TILE.ledge) && e.y <= top + 0.5) { ny = top; vy = 0; e.grounded = true; }
      e.y = ny; e.groundY = e.y; if (o.roll !== false) e.rot += e.vx * dt / (e.size * 0.45); else e.flip = dir < 0;
    };
  },
};
/** In a world, follow walks (hopping) on the ground after its target (default: the hero); elsewhere the core part. */
export function groundFollow(core) {
  return (e, o) => {
    const w = e.world; if (!w || o.fly) return core(e, o);
    let hop = 0;
    return (e2, dt) => {
      const t = o.target || w.hero; if (!t) return;
      const gap = (o.gap || 1.5) * w.cell, want = t.x - (t.flip ? -gap : gap), dx = want - e.x, moving = Math.abs(dx) > w.cell * 0.28;
      e.vx = moving ? Math.max(-6.5 * w.cell, Math.min(6.5 * w.cell, dx * 4)) : 0; e.x += e.vx * dt; if (moving) e.flip = dx < 0;
      hop = moving ? hop + dt * 11 : 0;
      const gy = w._surface(e.x, e.y - w.cell); const g = gy == null ? t.y : gy;
      e.y += (g - e.y) * Math.min(1, dt * 14); e.groundY = g;
      e.jy = moving ? -Math.abs(Math.sin(hop)) * (gy == null ? 1.1 : 0.3) * w.cell : 0;
    };
  };
}

// ---- the world: one round of a level -------------------------------------------------------------------------------
class World {
  constructor(game, level) {
    const kit = this.kit = game.kit;
    this.game = game; this.stage = game.stage; this.level = level; this.cell = level.cell; this.spec = game.spec;
    this.levelNo = game.li + 1; this.levelCount = game.levels.length;   // which level of how many (1-based): harder numbers, "Level 2 of 3"
    this.ents = []; this.roles = { collectible: [], hazard: [], goal: [], checkpoint: [], spring: [], gate: [], talk: [], door: [], solid: [], platform: [] };
    this.hero = null; this.body = null; this.P = PRESETS[game.controls]; this.points = 0; this.got = 0; this.total = 0; this.keys = 0;
    this.combo = 0; this.comboT = 0; this.busyN = 0; this.ended = false; this.t = 0; this.respawn = null; this.safe = null; this._lives = 3;
    this.rand = rand(game.roundSeed); this.listeners = {}; this.cancels = [];
    this.fx = kit.publicJuice;
    this.theme = { get mode() { return kit.theme.mode; }, get timeOfDay() { return game.stage.timeOfDay; }, set timeOfDay(v) { game.stage.setTimeOfDay(Math.max(0, Math.min(1, +v || 0)), 0); } };
  }
  get cam() { return this.stage.camera; }
  get scene() { return this.game.state; }
  get busy() { return this.busyN > 0; }
  /** The HUD's live widgets (score, lives, timer, progress, combo, count) while a round plays, else null. */
  get hud() { return this.game.hud; }
  get lives() { const h = this.game.hud; return h && h.lives ? h.lives.value : this._lives; }
  set lives(v) { this._lives = Math.max(0, v | 0); const h = this.game.hud; if (h && h.lives) h.lives.set(this._lives); }
  // ---- building
  build() {
    const L = this.level, cell = this.cell, S = this.stage;
    this.ents.push(...S.ground(L.groundRows(), { cell, x: 0, y: 0 }));
    // ledges: slab tiles along each run of '=' cells; water: a tile per cell, with a wavy top on the surface
    for (let r = 0; r < L.nrows; r++) for (let c = 0; c < L.cols; c++) {
      const t = L.at(c, r);
      if (t === TILE.ledge && L.at(c - 1, r) !== TILE.ledge) {
        let n = 1; while (c + n < L.cols && L.at(c + n, r) === TILE.ledge) n++;
        // one slab tile per cell (constant thickness, rounded ends), slightly overlapping so the seams never show
        for (let i = 0; i < n; i++) this.ents.push(S.add('ledge', { x: (c + i + 0.5) * cell, y: r * cell - cell * 0.08, size: cell * 0.47 * 1.03, layer: 'world', z: 2, shadow: false, variant: n === 1 ? '' : i === 0 ? 'l' : i === n - 1 ? 'r' : 'm' }));
      }
      if (t === TILE.water) this.ents.push(S.add('water', { x: (c + 0.5) * cell, y: (r + 0.5) * cell, size: cell + 1, variant: L.at(c, r - 1) === TILE.water ? '' : 'top', layer: 'world', z: 3, shadow: false }));
    }
    for (const it of L.items) if (!it.tile && (typeof it.spec === 'string' ? it.spec : it.spec.kind) !== 'player') this.spawn(it.spec, { c: it.c, r: it.r, ch: it.ch });
    for (const it of L.items) if (it.tile && it.spec.splash) this.splash = true;
    const s = L.start, heroSpec = this.game.heroSpec();
    this.spawn(heroSpec, { c: s.c, r: s.r, as: 'player', size: this.spec.heroSize || 1.75, seed: 2, z: 3 });
    this.total = this.roles.collectible.filter(e => e.ro.count !== false).length;
    this.safe = { x: this.hero.x, y: this.hero.y }; this.respawn = { x: this.hero.x, y: this.hero.y };
    const g = this.roles.goal[0]; this.goalX = g ? g.x : L.w - cell;
    const sc = this.kit.spaceCast; if (sc) sc(this);   // the dress pack keeps the cast apart and off the level's edges
    if (this.spec.setup) this._call(this.spec.setup);
    if (sc) sc(this);
  }
  destroy() { this.ended = true; for (const e of this.ents) e.remove(null); this.ents = []; this.stage.lights.length = 0; for (const c of this.cancels) c(); this.cancels = []; }
  /** spawn(kind | species | prop | charSpec | {kind, ...}, {c, r} | {x, y} | {at: 'K' | {x, y}}, plus in the same object:
   *  size (cells), parts, tag, variant, place, ox / oy (cells), flip, say). Only two arguments. */
  spawn(kind, o = {}, ...extra) {
    if (extra.length) this.kit.warn(`w.spawn takes two arguments: put size, parts, tag and variant in the second object (spawn('${typeof kind === 'string' ? kind : 'thing'}', {c, r, tag, size}))`);
    if (kind && typeof kind === 'object' && !kind.__ok && kind.kind) { o = Object.assign({}, kind, o); kind = kind.kind; }
    const cell = this.cell, S = this.stage, A = S.atlas;
    let R = typeof kind === 'string' ? KINDS[kind] : null, name = R ? R.char || R.sprite : kind;
    if (kind === 'npc') name = o.species || 'fox';
    let parts = o.parts ? [].concat(o.parts) : R ? R.parts(cell, o) : null;
    if (!R && typeof name === 'string' && !SPECIES.includes(name)) {   // props: treasure is collectible, hazards hurt
      if (PROP_GROUPS.treasure.includes(name) && name !== 'chest') { R = { size: 0.66, place: 'center', z: 2 }; parts = parts || ['collectible', { bob: { amp: cell * 0.08 } }]; }
      else if (PROP_GROUPS.hazards.includes(name)) { R = { size: 0.7, place: 'floor', world: 1, z: 2 }; parts = parts || ['hazard']; }
    }
    const isChar = (name && typeof name === 'object') || SPECIES.includes(name);
    const def = A.defs.get(isChar ? null : name);
    const size = (o.size != null ? +o.size : R ? R.size : isChar ? 1.6 : def ? Math.max(0.5, Math.min(4, def.h / 50)) : 1) * cell;
    let x, y;
    const at = typeof o.at === 'string' ? this.level.items.find(i => i.ch === o.at) : o.at;
    if (o.x != null || (at && at.x != null)) { x = o.x != null ? +o.x : +at.x; y = o.y != null ? +o.y : +at.y; }
    else {
      const c = at ? at.c : +o.c || 0, r = at ? at.r : +o.r || 0, ay = isChar ? 1 : def && def.ay != null ? def.ay : 0.5, place = o.place || (R && R.place) || (isChar ? 'floor' : 'floor');
      x = (c + 0.5 + (o.ox || 0)) * cell;
      y = place === 'center' ? (r + 0.5) * cell + size * (ay - 0.5) : place === 'top' ? r * cell + size * ay : (r + 1) * cell - size * (1 - ay);
      y += (o.oy || 0) * cell;
    }
    const add = { x, y, size, z: o.z != null ? o.z : R && R.z, tag: o.tag || (typeof kind === 'string' ? kind : ''), variant: o.variant != null ? o.variant : R && R.variant, flip: o.flip, seed: o.seed, wind: o.wind != null ? o.wind : R && R.wind,
      layer: o.layer || (R && R.world ? 'world' : undefined), shadow: o.shadow != null ? o.shadow : R && R.shadow != null ? R.shadow : R && R.world ? false : undefined };
    if (typeof name === 'string' && SPECIES.includes(name)) for (const k of CHAR_KEYS) if (o[k] != null) add[k] = o[k];
    const e = S.add(name, add);
    e.world = this; e.kindName = typeof kind === 'string' ? kind : e.kind; e.opts = o; e.cast = !!isChar;
    if (e.layer === Z.actors && e.shadow) { const gy = this._surface(e.x, e.y - 2); e.groundY = gy == null ? e.y : gy; }   // pickups and the cast cast a shadow on the floor below
    if (o.as === 'player') parts = ['player'].concat(parts || []);
    if ((o.as === 'npc' || o.say) && !(parts || []).some(p => p === 'talk' || (p && p.talk))) parts = (parts || []).concat({ talk: { say: o.say } });
    for (const p of parts || []) typeof p === 'string' ? e.add(p, o[p] || {}) : e.add(Object.keys(p)[0], p[Object.keys(p)[0]]);
    if (e.ro) for (const k in o) if (!SPAWN_KEYS.includes(k)) e.ro[k] = o[k];
    this.ents.push(e);
    return e;
  }
  find(tag) { return this.ents.find(e => !e.dead && !e.taken && (e.tag === tag || e.kindName === tag || e.kind === tag)) || null; }
  all(tag) { return this.ents.filter(e => !e.dead && !e.taken && (e.tag === tag || e.kindName === tag || e.kind === tag)); }
  _role(name, e, o) { e.ro = Object.assign(e.ro || {}, o); e.roleName = name; this.roles[name].push(e); if (name === 'gate' || name === 'door' || name === 'solid') { e.solidOn = true; e.open = () => { if (e.solidOn) this._open(e); }; } if (name === 'platform') { e.px0 = e.x; e.py0 = e.y; e.pt = 0; } }
  _player(e, o) {
    this.hero = e; e.autoClip = true;
    this.body = { hw: e.size * 0.2, h: e.size * 0.82, vx: 0, vy: 0, grounded: true, coyote: 0, buffer: 0, knock: 0, stepT: 0, plat: null, water: false };
    e.look(null);
  }
  /** setHero(spec): swap the hero's look (a new character in the same place: hero pickers). */
  setHero(spec) {
    const old = this.hero; if (!old) return null;
    const e = this.stage.add(spec, { x: old.x, y: old.y, size: old.size, seed: 2, z: old.z }); e.world = this; e.flip = old.flip; e.groundY = old.groundY;
    old.remove(null); this.ents.splice(this.ents.indexOf(old), 1, e); this.hero = e; e.autoClip = true; e.look(null);
    // the results and try-again cards show this hero too (and the next round keeps it)
    this.game.spec = Object.assign({}, this.game.spec, { hero: spec }); this.spec = this.game.spec;
    for (const x of this.ents) if (x.lookAt === old) x.look(e);
    return e;
  }
  // ---- events
  on(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); return () => { this.listeners[ev] = this.listeners[ev].filter(f => f !== fn); }; }
  emit(ev, ...a) { let r; const fn = this.spec.on && this.spec.on[ev]; if (typeof fn === 'function') r = this._call(fn, ...a); for (const f of (this.listeners[ev] || []).slice()) this._call(f, ...a); return r; }
  _call(fn, ...a) { try { return fn(this, ...a); } catch (err) { this.kit.warn(err); return undefined; } }
  after(ms, fn) { const c = this.kit.loop.tw.after(ms, fn); this.cancels.push(c); return c; }
  every(ms, fn) { const c = this.kit.loop.tw.every(ms, fn); this.cancels.push(c); return c; }
  // ---- score, lives, results
  score(n) { n = +n || 0; this.points += n; const h = this.game.hud; if (h && h.score) h.score.add(n); return this.points; }
  heal() { const h = this.game.hud; if (h && h.lives) h.lives.gain(); else this._lives++; this.kit.sfx('levelup', { pitch: 1.3, caption: false }); }
  hurt(o = {}) {
    const e = this.hero, b = this.body; if (!e || e.invuln > 0 || this.ended || this.busy) return false;
    const kit = this.kit, cell = this.cell;
    kit.loop.hitstop(60); this.cam.shake(0.4); e.flash(); e.state('hurt'); e.invuln = 1.2; kit.sfx('hurt', { at: e });
    const dir = o.dir != null ? o.dir : e.flip ? 1 : -1;
    if (b) { b.vx = dir * 6.5 * cell; b.vy = -(o.up || 8.7) * cell; b.grounded = false; b.knock = 0.3; }
    this.stage.burst('sparks', e.x, e.y - e.size * 0.5, { n: 10 });
    const say = o.say || this.spec.hurtSay; if (say) this.stage.floatText(kit.i18n.has(say) ? kit.i18n.t(say) : String(say), e.x, e.y - e.size * 1.15, 'hazard');
    this.emit('hit', o.by || null);
    if (kit.settings.get('assist') === 'nofail') return true;
    const h = this.game.hud; const left = h && h.lives ? h.lives.lose() : (this._lives = Math.max(0, this._lives - 1));
    if (left <= 0) this.lose();
    return true;
  }
  stars() { if (this.spec.stars) return Math.max(0, Math.min(3, this._call(this.spec.stars) | 0)); const f = this.total ? this.got / this.total : 1; return f >= 0.9 ? 3 : f >= 0.55 ? 2 : 1; }
  win(o = {}) { return this.game._win(o); }
  lose(o = {}) { return this.game._lose(o); }
  // ---- talk and questions
  /** ask({q, a, choices, hint, ...}): the quiz card. q, hint and string choices may be string keys (translated, like
   *  w.say and the gate's own question); numbers and maths stay as they are. */
  ask(q = {}) {
    const k = this.kit, tr = v => (typeof v === 'string' ? T(k, v) : v);
    const o = Object.assign({}, q);
    if (o.q != null) o.q = tr(o.q); if (o.question != null) o.question = tr(o.question); if (o.hint != null) o.hint = tr(o.hint);
    if (Array.isArray(o.choices)) {
      const was = o.choices, wantStr = o.a != null ? String(o.a) : o.answer != null ? String(o.answer) : null;
      o.choices = was.map(tr);
      if (wantStr != null && o.index == null) { const i = was.map(String).indexOf(wantStr); if (i >= 0) o.index = i; }
    }
    return k.screens.ask(o);
  }
  say(who, key, vars) {
    const kit = this.kit, text = kit.i18n.has(key) ? kit.i18n.t(key, vars) : String(key);
    if (who && who.state) { who.state('talk'); }
    return kit.screens.bubble(who || this.hero, text, { ms: Math.max(1800, 900 + text.length * 55) }).then(() => { if (who && who.clip === 'talk') who.state('idle'); });
  }
  /** story(async fn): a story beat. The hero stops, triggers wait, the level timer pauses; the world keeps animating. */
  async story(fn) {
    this.busyN++; this.game._scene('talk');
    const h = this.game.hud, timer = h && h.timer && this.game.timerOn ? h.timer.left : 0;
    if (timer) h.timer.stop();
    if (this.body) this.body.vx = 0; if (this.hero && this.hero.clip !== 'hurt') this.hero.state('idle');
    let r; try { r = await fn(); } catch (err) { this.kit.warn(err); }
    this.busyN--;
    if (!this.busyN && !this.ended && this.game.world === this) { this.game._scene('play'); if (timer) this.game._startTimer(timer); }
    return r;
  }
  // ---- physics -----------------------------------------------------------------------------------------------------
  /** The walkable surface at or below y in x's column (tiles, ledges, platforms, solids). */
  _surface(x, y) {
    const L = this.level; let best = null;
    const c = L.col(x); for (let r = Math.max(0, L.row(y)); r < L.nrows; r++) { const t = L.at(c, r); if (t) { best = r * L.cell; break; } }
    for (const p of this.roles.platform) if (!p.dead && Math.abs(p.x - x) < this._pw(p) / 2 && this._ptop(p) >= y - 1 && (best == null || this._ptop(p) < best)) best = this._ptop(p);
    return best;
  }
  _pw(p) { const d = this.stage.atlas.defs.get(p.sprite); return p.size * (d ? d.w / d.h : 1) * Math.abs(p.sx || 1) * (p.ro.width || 0.9); }
  _ptop(p) { return p.ro.surface != null ? p.y + p.ro.surface * this.cell : p.y - p.size * (this.stage.atlas.defs.get(p.sprite) || { ay: 0.5 }).ay + p.size * 0.12; }
  _srect(s) {
    const d = this.stage.atlas.defs.get(s.sprite), w = s.ro.w != null ? s.ro.w * this.cell : s.size * (d ? d.w / d.h : 1) * (s.roleName === 'gate' ? 0.35 : s.roleName === 'door' ? 0.6 : 0.9);
    const h = s.ro.h != null ? s.ro.h * this.cell : s.size * 0.95, ay = d && d.ay != null ? d.ay : 0.5, bot = s.y + s.size * (1 - ay);
    return { x0: s.x - w / 2, x1: s.x + w / 2, y0: bot - h, y1: bot };
  }
  _platforms(dt) {
    for (const p of this.roles.platform) {
      if (p.dead) continue; const o = p.ro, cell = this.cell;
      p.top0 = this._ptop(p); p.dxs = 0;
      if (!o.dx && !o.dy) continue;
      const span = Math.hypot(o.dx || 0, o.dy || 0) * cell, period = Math.max(0.5, 2 * span / ((o.speed || 1.4) * cell));
      p.pt += dt; const k = (1 - Math.cos(p.pt / period * Math.PI * 2)) / 2;
      const nx = p.px0 + (o.dx || 0) * cell * k, ny = p.py0 + (o.dy || 0) * cell * k;
      p.dxs = nx - p.x; p.x = nx; p.y = ny;
    }
  }
  _step(dt) {
    this.t += dt;
    const e = this.hero, b = this.body; if (!e || !b) return;
    this._platforms(dt);
    // controls 'none': no hero input or physics (the game moves the hero from code: e.x / e.y, or w.moveHero), but
    // the world still works: pickups, the goal, hazards, gates, talk
    if (this.P.none) { b.knock -= dt; b.vy = 0; b.grounded = true; e.vx = (e.x - (b.lx != null ? b.lx : e.x)) / Math.max(dt, 1e-6); b.lx = e.x; const gy = this._surface(e.x, e.y - 2); e.groundY = gy == null ? e.y : gy; }
    else if (this.P.top) this._topdown(e, b, dt); else this._platformer(e, b, dt);
    if (this.game.state === 'play' && !this.busy && !this.ended) this._interact(e, b, dt);
  }
  _input() {
    const I = this.kit.input, live = this.game.state === 'play' && !this.busy && !this.ended && this.body.knock <= 0;
    if (!live) return { x: 0, y: 0, jump: false, held: false };
    const a = I.axis(); let x = a.x, jump = I.pressed('jump'), held = I.down('jump');
    if (this.P.tap) {
      const p = I.pointer; if (p.down) { const wp = this.cam.toWorld(p), dx = wp.x - this.hero.x; x = Math.abs(dx) > this.cell * 0.3 ? Math.sign(dx) : 0; }
      if (this._tapJump) { jump = true; held = true; this._tapJump = false; }
    }
    return { x, y: a.y, jump, held };
  }
  _platformer(e, b, dt) {
    const L = this.level, cell = L.cell, P = this.P, inp = this._input();
    b.knock -= dt;
    const water = L.at(L.col(e.x), L.row(e.y - b.h * 0.5)) === TILE.water;
    if (water !== b.water) { b.water = water; if (water && !this.splash) { this.stage.burst('splash', e.x, e.y - b.h * 0.4, { n: 10 }); this.kit.sfx('splash', { pitch: 0.8, at: e }); } }
    const swim = water && !this.splash;
    // run: snappy on the ground, softer in the air (and in water)
    const target = inp.x * P.run * cell * (swim ? 0.6 : 1), rate = (!b.grounded ? P.air : Math.abs(target) > Math.abs(b.vx) || Math.sign(target) !== Math.sign(b.vx) ? P.acc : P.dec) * cell;
    if (b.knock <= 0) b.vx += Math.max(-rate * dt, Math.min(rate * dt, target - b.vx));
    if (Math.abs(inp.x) > 0.1 && b.knock <= 0) e.flip = inp.x < 0;
    // jump: buffered, with coyote time and a variable height
    if (inp.jump) b.buffer = BUFFER;
    b.buffer -= dt; b.coyote -= dt;
    if (b.buffer > 0 && (b.grounded || b.coyote > 0 || swim)) {
      b.vy = -P.jump * cell * (swim ? 0.62 : 1); b.grounded = false; b.coyote = 0; b.buffer = 0; b.plat = null;
      e.squash(0.86, 90); this.kit.loop.tw.after(70, () => e.squash(1.15, 260));
      e.state('jump'); this.stage.burst('dust', e.x, e.y, { n: 4 }); this.kit.sfx('whoosh', { pitch: 1.35, volume: 0.6, at: e });
    }
    if (b.vy >= 0) b.launch = false;   // springs and stomps launch past the early-release cut
    if (!inp.held && !b.launch && b.vy < -P.jump * cell * P.cut) b.vy = -P.jump * cell * P.cut;
    const g = P.g * cell * (b.vy > 0 ? FALL_MUL : 1) * (swim ? 0.25 : 1);
    b.vy = Math.min((swim ? 3 : P.fall) * cell, b.vy + g * dt);
    // carried by a moving platform
    if (b.plat && b.grounded) e.x += b.plat.dxs;
    // x, then y, against tiles and solids
    const hw = b.hw, h = b.h;
    let nx = e.x + b.vx * dt;
    const r0 = L.row(e.y - h + 1), r1 = L.row(e.y - 1);
    if (b.vx > 0) { const c = L.col(nx + hw); for (let r = r0; r <= r1; r++) if (L.at(c, r) === TILE.solid) { nx = c * cell - hw - 0.01; b.vx = 0; break; } }
    if (b.vx < 0) { const c = L.col(nx - hw); for (let r = r0; r <= r1; r++) if (L.at(c, r) === TILE.solid) { nx = (c + 1) * cell + hw + 0.01; b.vx = 0; break; } }
    for (const s of this.roles.solid.concat(this.roles.gate, this.roles.door)) {
      if (!s.solidOn || s.dead) continue; const q = this._srect(s);
      if (e.y - h < q.y1 && e.y > q.y0 + 1) {
        if (nx + hw > q.x0 && e.x <= q.x0 + 0.5 + hw) { nx = q.x0 - hw - 0.01; b.vx = Math.min(0, b.vx); }
        else if (nx - hw < q.x1 && e.x >= q.x1 - 0.5 - hw) { nx = q.x1 + hw + 0.01; b.vx = Math.max(0, b.vx); }
      }
    }
    e.x = nx; e.vx = b.vx;
    const py = e.y, was = b.grounded; let ny = py + b.vy * dt; b.grounded = false;
    const c0 = L.col(e.x - hw), c1 = L.col(e.x + hw);
    if (b.vy >= 0) {
      let land = null, plat = null; const r = L.row(ny);
      for (let c = c0; c <= c1; c++) { const t = L.at(c, r); if ((t === TILE.solid || t === TILE.ledge) && py <= r * cell + 0.5) land = r * cell; }
      for (const p of this.roles.platform) { if (p.dead) continue; const top = this._ptop(p), half = this._pw(p) / 2; if (Math.abs(p.x - e.x) < half + hw * 0.5 && py <= (p.top0 != null ? p.top0 : top) + 0.5 && ny >= top && (land == null || top <= land)) { land = top; plat = p; } }
      for (const s of this.roles.solid.concat(this.roles.door)) { if (!s.solidOn || s.dead) continue; const q = this._srect(s); if (e.x + hw > q.x0 && e.x - hw < q.x1 && py <= q.y0 + 0.5 && ny >= q.y0 && (land == null || q.y0 < land)) { land = q.y0; plat = null; } }
      if (land != null) {
        e.y = land; b.plat = plat;
        if (!was) this._land(e, b);
        b.vy = 0; b.grounded = true; b.coyote = COYOTE;
      } else e.y = ny;
    } else {
      const r = L.row(ny - h); let hit = false;
      for (let c = c0; c <= c1; c++) if (L.at(c, r) === TILE.solid) hit = true;
      if (hit) { e.y = (r + 1) * cell + h; b.vy = cell * 0.6; e.squash(0.9, 180); this.kit.sfx('step', { pitch: 0.7 }); } else e.y = ny;
    }
    if (b.grounded && !b.plat) {   // safe ground: solid a half cell either side, no hazard close by
      const r = L.row(e.y + 1), firm = x => L.at(L.col(x), r) === TILE.solid || L.at(L.col(x), r) === TILE.ledge;
      if (firm(e.x - cell * 0.6) && firm(e.x + cell * 0.6) && !this.roles.hazard.some(z => !z.dead && Math.abs(z.x - e.x) < cell * 1.5)) this.safe = { x: e.x, y: e.y };
    }
    // clips and footsteps
    if (!this.ended && !b.grounded && b.vy > cell && (e.clip === 'jump' || (e.clip !== 'hurt' && e.clip !== 'fall' && !was))) e.state('fall');
    if (b.grounded && Math.abs(b.vx) > P.run * cell * 0.7) { b.stepT -= dt; if (b.stepT <= 0) { b.stepT = 0.26; this.stage.burst('dust', e.x - Math.sign(b.vx) * hw * 0.6, e.y, { n: 1 }); this.kit.sfx('step', { volume: 0.25, pitchVar: 0.15 }); } }
    const gy = this._surface(e.x, e.y - 2); e.groundY = gy == null ? e.y + 8 * cell : gy;
    // water (splash mode: back to the bank), a pit, the level's sides
    if (this.splash && water && e.y > L.row(e.y - b.h * 0.5) * cell + cell * 0.4) this._backToSafe('splash');
    if (e.y > L.h + cell * 2) this._backToSafe('fall');
  }
  _topdown(e, b, dt) {
    const L = this.level, cell = L.cell, inp = this._input(), sp = this.P.run * cell;
    b.knock -= dt;
    const tx = inp.x * sp, ty = inp.y * sp, k = Math.min(1, this.P.acc * dt / this.P.run);
    if (b.knock <= 0) { b.vx += (tx - b.vx) * k; b.vy += (ty - b.vy) * k; } else { b.vx *= 0.9; b.vy *= 0.9; }
    if (Math.abs(inp.x) > 0.1) e.flip = inp.x < 0;
    const hw = b.hw, fh = cell * 0.4;
    const blocked = (x, y) => { for (const [px, py] of [[x - hw, y - fh], [x + hw, y - fh], [x - hw, y - 1], [x + hw, y - 1]]) { const t = L.at(L.col(px), L.row(py)); if (t === TILE.solid || t === TILE.water) return true; }
      for (const s of this.roles.solid.concat(this.roles.gate, this.roles.door)) { if (!s.solidOn || s.dead) continue; const q = this._srect(s); if (x + hw > q.x0 && x - hw < q.x1 && y > q.y1 - fh * 2 && y - fh < q.y1) return true; } return false; };
    const nx = e.x + b.vx * dt; if (!blocked(nx, e.y)) e.x = nx; else b.vx = 0;
    const ny = e.y + b.vy * dt; if (!blocked(e.x, ny)) e.y = ny; else b.vy = 0;
    e.vx = Math.hypot(b.vx, b.vy) * (b.vx < 0 ? -1 : 1); b.grounded = true; e.groundY = e.y;
    this.safe = { x: e.x, y: e.y };
  }
  _land(e, b) {
    const k = Math.min(1, b.vy / (18 * this.cell));
    e.squash(0.86 - k * 0.12, 240); this.stage.burst('dust', e.x, e.y, { n: 3 + Math.round(k * 6) }); this.kit.sfx('land', { volume: 0.4 + k * 0.6, at: e });
    if (!this.ended && (e.clip === 'jump' || e.clip === 'fall')) e.state(k > 0.35 ? 'land' : 'idle');
    this.emit('land');
  }
  _backToSafe(why) {
    const e = this.hero, b = this.body, s = this.safe || this.respawn;
    if (why === 'splash') { this.stage.burst('splash', e.x, e.y - this.cell * 0.3, { n: 16 }); this.kit.sfx('splash', { pitch: 0.6 }); }
    e.x = s.x; e.y = s.y; b.vx = 0; b.vy = 0; b.grounded = true; e.invuln = 0;
    this.hurt({ dir: 0, up: 4.7, say: why === 'splash' ? this.spec.splashSay : this.spec.fallSay });
    b.vx = 0;
  }
  // ---- interactions (play only) ------------------------------------------------------------------------------------
  _interact(e, b, dt) {
    const cell = this.cell, R = this.roles, hx = e.x, hy = e.y - e.size * 0.5;
    // pickups: a magnet pulls them in (0.6 x the hero's size), then they pop into the score
    for (const s of R.collectible) {
      if (s.dead || s.taken || s.collecting) continue;
      const dx = hx - s.x, dy = hy - s.y, d = Math.hypot(dx, dy);
      if (!s.magnet && d < e.size * 0.6 + s.size * 0.5) { s.magnet = true; s.behaviours.length = 0; s.mv = 2 * cell; }
      if (s.magnet) { s.mv = Math.min(25 * cell, s.mv + 53 * cell * dt); const k = Math.min(1, s.mv * dt / Math.max(1, d)); s.x += dx * k; s.y += dy * k; s.rot += dt * 12; }
      if (d < e.size * 0.36) this._collect(s);
    }
    this.comboT -= dt; if (this.comboT <= 0 && this.combo) { this.combo = 0; const h = this.game.hud; if (h && h.combo) h.combo.reset(); }
    if (e.invuln <= 0) for (const z of R.hazard) {
      if (z.dead || !e.touches(z)) continue;
      if (z.ro.stomp && b.vy > 0 && e.y - b.vy / 60 <= z.y - z.size * 0.5) { b.vy = -this.P.jump * cell * 0.7; b.launch = true; z.break(); this.score(z.ro.value || 20); this.kit.sfx('pop', { pitch: 0.8, at: z }); this.emit('stomp', z); continue; }
      this.hurt({ dir: e.x < z.x ? -1 : 1, by: z, up: z.kindName === 'spikes' ? 11.9 : 8.7 }); break;
    }
    for (const g of R.goal) if (!g.dead && Math.abs(g.x - e.x) < cell * 0.6 + b.hw && e.y > g.y - g.size) { if (this.emit('goal', g) !== false) this.win(); return; }
    for (const k of R.checkpoint) if (!k.dead && !k.reached && Math.abs(k.x - e.x) < cell * 0.7 && Math.abs(k.y - e.y) < cell * 1.5) {
      k.reached = true; k.variant = 'on'; k.squash(1.25, 360); this.respawn = { x: k.x, y: k.y };
      this.stage.burst('sparkle', k.x, k.y - k.size * 0.7, { n: 14 }); this.kit.sfx('levelup', { pitch: 1.2, caption: false }); this.kit.ui.toast(this.kit.i18n.t('checkpoint'), { ms: 1600 });
      this.emit('checkpoint', k);
    }
    for (const s of R.spring) if (!s.dead && b.vy >= 0 && Math.abs(s.x - e.x) < s.size * 0.4 + b.hw && e.y >= s.y - s.size * 0.75 - 4 && e.y <= s.y + 2) {   // walk or drop onto it
      b.vy = -this.P.jump * cell * 1.45; b.launch = true; b.grounded = false; b.buffer = 0; e.y = s.y - s.size * 0.75; e.state('jump'); e.squash(1.25, 300);
      s.squash(0.55, 420); this.kit.sfx('pop', { pitch: 0.7, at: s }); this.stage.burst('dust', s.x, s.y, { n: 5 }); this.emit('spring', s);
    }
    for (const d of R.door) if (!d.dead && d.solidOn) {
      const q = this._srect(d), near = e.x + b.hw > q.x0 - cell * 0.15 && e.x - b.hw < q.x1 + cell * 0.15 && e.y > q.y0;
      if (!near) { d.told = false; continue; }
      if (this.keys > 0) { this.keys--; this._open(d); this.emit('door', d); }
      else if (!d.told) { d.told = true; d.wobble(); this.kit.ui.toast(this.kit.i18n.t('needKey'), { ms: 1800 }); this.kit.sfx('wrong', { volume: 0.5 }); }
    }
    for (const g of R.gate) if (!g.dead && g.solidOn && !g.asking && Math.abs(g.x - e.x) < cell * 1.4 + b.hw) this._gate(g);
    for (const n of R.talk) {   // walk-up talk needs a hero the player walks (controls 'none': the game calls w.say)
      if (n.dead || this.P.none) continue; const near = Math.abs(n.x - e.x) < (n.ro.range || 1.6) * cell && Math.abs(n.y - e.y) < cell * 2;
      if (!near) { if (n.ro.repeat || n.kindName === 'sign') n.talked = false; continue; }
      if (!n.talked) { n.talked = true; this._talk(n); break; }
    }
  }
  _collect(s) {
    const o = s.ro, kit = this.kit, h = this.game.hud;
    let done = null; s.taken = true;   // its own flag: Entity.collect() below runs the pop-away and removes it
    if (o.count !== false) this.got++;
    if (o.key) { this.keys += o.key; kit.sfx('levelup', { pitch: 1.5, caption: false }); }
    if (o.heal) this.heal();
    const v = o.value == null ? 10 : +o.value;
    if (v > 0) {
      this.combo = this.comboT > 0 ? this.combo + 1 : 1; this.comboT = 1.4;
      const pts = Math.round(v + Math.min(10, this.combo - 1) * v * 0.2); this.points += pts;
      done = s.collect(); this.stage.floatText('+' + kit.i18n.num(pts), s.x, s.y - s.size * 0.3, 'reward', { avoid: this.hero, to: h && h.score ? 'score' : null, onArrive: () => { if (h && this.game.hud === h && h.score) h.score.add(pts); } });
      kit.sfx('spark', { pitch: 1 + Math.min(this.combo, 10) * 0.055, at: s });
      if (h && h.combo && this.combo > 1) h.combo.bump();
    } else { done = s.collect(o.heal ? 'hearts' : 'sparkle'); kit.sfx('pop', { pitch: 1.2, at: s }); }
    if (h && h.count && o.count !== false) h.count.add(1);
    this.hero.squash(1.08, 160);
    if (o.count !== false && this.got === this.total && this.total > 1) { kit.ui.toast(kit.i18n.t('sparksOf', { n: this.got, total: this.total })); this.stage.burst('coins', this.hero.x, this.hero.y - this.hero.size * 0.8); }
    this.emit('collect', s);
    return done;
  }
  _open(g) {
    g.solidOn = false; const kit = this.kit;
    if (g.roleName === 'door') { g.squash(1.2, 300); this.stage.burst('sparkle', g.x, g.y - g.size * 0.5, { n: 20 }); kit.loop.tw.tween(g, { alpha: 0 }, { ms: 400 }).then(() => g.remove('puff')); }
    else { g.variant = 'open'; g.jsy = 0.82; g.jsx = 1.15; kit.loop.tw.spring(g, 'jsy', { k: 260, zeta: 0.3 }).to(1); kit.loop.tw.spring(g, 'jsx', { k: 260, zeta: 0.3 }).to(1); this.stage.burst('sparkle', g.x, g.y - g.size * 0.7, { n: 26 }); this.stage.burst('coins', g.x, g.y - g.size * 0.6); }
    kit.sfx('gate'); this.cam.shake(0.25);
  }
  /** A quiz gate: on.gate(w, gate) runs first (it may speak, ask, or call gate.open()). It returns true to open the
   *  gate, false to keep it shut and skip the built-in quiz, or nothing: then the gate's own {q, a, choices, hint} (or
   *  questions: [...]) is asked until the answer is right (a miss shows the hint; the next question comes after a
   *  second miss). A gate with no question and no handler that opens it opens with a warning (never a dead end). */
  _gate(g) {
    g.asking = true;
    this.story(async () => {
      let r = this.emit('gate', g);
      if (r && typeof r.then === 'function') r = await r;
      if (r === true) g.open();
      else if (r !== false && g.solidOn) {
        const qs = [].concat(g.ro.questions || (g.ro.q != null ? [g.ro] : []));
        if (!qs.length) { this.kit.warn('quiz gate: no question (give it q, a, choices or handle on.gate)'); g.open(); }
        for (let i = 0; g.solidOn && qs.length && !this.ended; i++) { const q = qs[i % qs.length]; if (await this.ask(Object.assign({ tries: 2, who: g }, q, { q: q.q || '' }))) g.open(); }
      }
    }).then(() => { g.asking = false; if (g.solidOn && this.body) { this.hero.x += (this.hero.x < g.x ? -1 : 1) * this.cell * 0.8; } });
  }
  _talk(n) {
    const hero = this.hero; n.look(hero); if (hero) { hero.flip = n.x < hero.x; }
    return this.story(async () => {
      if (n.state) n.state('wave');
      let r = this.emit('talk', n); if (r && typeof r.then === 'function') r = await r;
      if (r !== false) for (const line of [].concat(n.ro.say || [])) await this.say(n, line);
      if (n.clip === 'wave' || n.clip === 'talk') n.state('idle');
    });
  }
}

// ---- the game: scenes around the world -----------------------------------------------------------------------------
export class Game {
  constructor(kit, spec, stage) {
    this.kit = kit; this.spec = spec; this.stage = stage; this.state = 'boot'; this.flow = 0; this.world = null; this.hud = null; this.timerOn = false;
    this.controls = PRESETS[spec.controls] ? spec.controls : 'platformer:kid-easy';
    this.seed = spec.seed != null ? spec.seed : 1;   // the level layout (generate) and the scenery
    this.builds = 0;
    this.levels = [].concat(spec.level || generate({ seed: this.seed })).map(l => (l && l.__level ? l : Array.isArray(l) ? grid(l, spec.legend) : generate(Object.assign({ seed: this.seed }, l))));
    this.li = 0; this.prebaked = false; this.titlePan = 0;
    for (const L of this.levels) for (const w of L.warnings) kit.warn(w);
    this.best = new Save(kit.storage, '__ok_game'); this.best.define({ v: 1, defaults: { best: {} } });
    const T = this.hudSpec = [].concat(spec.hud || ['score', 'lives:3']), tm = T.find(x => /^timer/.test(x));
    this.timerSecs = tm ? +(tm.split(':')[1] || 60) || 60 : 0;
    stage.update(dt => this._update(dt));
    const me = this;
    this.api = {
      run: () => me.run(), pause: () => (me.hud && me.hud.pause ? me.hud.pause() : kit.loop.pause('game')), resume: () => kit.loop.resume('game'),
      restart: to => me.restart(to || 'play'), start: () => me.start(), next: () => me.next(),
      get state() { return me.state; }, get world() { return me.world; }, get stage() { return me.stage; }, get level() { return me.levels[me.li]; },
      /** hero(spec): change the hero (it re-spawns in place; the next round keeps it). */
      hero: s => { me.spec = Object.assign({}, me.spec, { hero: s }); return me.world ? me.world.setHero(me.heroSpec()) : null; },
    };
  }
  heroSpec() { const h = this.spec.hero; return h === 'me' || h == null ? this.kit.meSpec() : h; }
  _scene(s) { this.state = s; this.kit.scene = s; }
  /** Each round's w.rand seed: __brbTest.seed(n) pins it (tests, the playtest); else spec.seed for the first round and
   *  spec.seed + the round number after it; with no spec.seed, a fresh one each round, so "Play again" deals new cards,
   *  questions and dice. */
  get roundSeed() {
    const k = this.kit, n = this.builds - 1;
    if (k.seed != null) return k.seed;
    if (this.spec.seed != null) return n > 0 ? seedOf(String(this.spec.seed) + '#' + n) : this.spec.seed;
    const w = k.win, c = w && w.crypto;   // a fresh seed (the kit's own randomness stays seeded: this only picks the seed)
    try { if (c && c.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0]; } catch (e) { /* no crypto */ }
    const pf = w && w.performance; return seedOf(String(pf ? pf.timeOrigin + pf.now() : 0) + '#' + k.loop.now + '#' + n);
  }
  _build() {
    if (this.world) this.world.destroy();
    this.builds++;
    this.world = new World(this, this.levels[this.li]); this.world.build();
    this.stage.camera.target = null;
  }
  _update(dt) {
    const w = this.world; if (!w) return;
    this._frame(dt);
    w._step(dt);
    if (this.spec.update) w._call(this.spec.update, dt);
    if (this.kit.layoutCheck) this.kit.layoutCheck(this, dt);   // the dress pack's layout warnings
    // the flag meter follows the hero to the goal (also in controls 'none' games, until the game sets it itself)
    const pg = this.hud && this.hud.progress;
    if (this.state === 'play' && pg && w.hero && w.goalX != null && !pg.own) { const s = w.respawn0 || (w.respawn0 = { x: w.hero.x }); pg.auto((w.hero.x - s.x) / Math.max(1, w.goalX - s.x)); }
  }
  /** The camera: about 7.2 rows high in landscape and 10.5 x 5.5 cells in portrait (a big cast); the level's floor near
   *  the bottom with at most ~0.6 cell of soil showing (the dressed hills, not a brown slab); a pan behind the title. */
  _frame(dt) {
    const S = this.stage, V = S.view, C = S.camera, L = this.levels[this.li], cell = L.cell, cam = this.spec.camera; if (!V.vw) return;
    if (cam === 'fixed') { C.zoom = Math.min(V.vw / L.w, V.vh / L.h); C.bounds({ x: 0, y: 0, w: L.w, h: L.h }); C.x = L.w / 2; C.y = L.h / 2; return; }
    const portrait = V.vh > V.vw * 1.1, top = PRESETS[this.controls].top;
    let z = top ? Math.max(0.5, Math.min(V.vw / (12 * cell), V.vh / (8 * cell))) : portrait ? Math.max(0.5, Math.min(V.vw / (5.5 * cell), V.vh / (10.5 * cell))) : Math.max(1, Math.min(V.vw / (7.5 * cell), V.vh / (7.2 * cell)));
    // phones in portrait: the hero is never tiny (at least 21% of the view's height), keeping 3.6 cells across
    const he = this.world && this.world.hero, hs = he ? he.size : (this.spec.heroSize || 1.75) * cell;
    let zz = z; if (portrait && !top) zz = Math.max(z, Math.min(0.21 * V.vh / hs, V.vw / (3.6 * cell)));
    C.zoom = zz; z = zz;
    const VH = V.vh / z, last = L.rows[L.nrows - 1] || '', floor = !top && [...last].filter(c => c === '#').length > last.length / 2;
    let soil = 0; if (floor) while (soil < L.nrows && [...(L.rows[L.nrows - 1 - soil] || '')].filter(c => c === '#').length > last.length / 2) soil++;
    const bot = L.h - (floor ? cell * Math.max(0.35, soil - 0.95) : 0), y0 = Math.min(0, bot - VH);
    C.bounds({ x: 0, y: y0, w: L.w, h: bot - y0 });
    if (this.state === 'title' || (this.state === 'boot' && this.world)) { this.titlePan += dt; C.target = null; C.x = L.w * 0.12 + (1 - Math.cos(this.titlePan * 0.21)) * 0.5 * L.w * 0.76; }
  }
  run() { if (this.ran) return; this.ran = true; this._build(); this._title(++this.flow); }
  /** start(): straight into play (tests, the screenshot worker, the playtest). */
  start() { this.kit.screens.closeAll(); if (this.world) this.world.emit('skip'); return this.restart('play', { countdown: false }); }
  next() { if (this.li < this.levels.length - 1) { this.li++; return this.restart('play'); } this.li = 0; return this.restart('title'); }
  restart(to = 'play', o = {}) {
    const id = ++this.flow; this.kit.screens.closeAll(); this._hideHud(); this.ran = true;
    this._build();
    return to === 'title' ? this._title(id) : this._play(id, o);
  }
  _hideHud() { if (this.hud) { this.hud.timer && this.hud.timer.stop(); this.hud.root.remove(); this.hud = null; } this.timerOn = false; }
  async _title(id) {
    const kit = this.kit, sp = this.spec, S = this.stage, w = this.world;
    this._scene('title'); this.titlePan = 0; this._frame(0); w.emit('title');
    if (!this.prebaked) { this.prebaked = true; S.prebake({ night: kit.theme.dark || sp.night, zooms: [1.1], text: ['+10', '+12', '+14', '+16', '+18', '+20', '+22', '+24', '+26', '+28', '+30', '+5', '+6'].concat([].concat(sp.prebakeText || []).map(t => [T(kit, t), 'hazard'])) }); }
    if (sp.title !== false) await kit.screens.title({ title: sp.title || '', subtitle: sp.subtitle ? T(kit, sp.subtitle) : '', hero: sp.camera === 'fixed' && !sp.titleHeroSize ? false : sp.titleHero || this.heroSpec(), heroSize: sp.titleHeroSize, titleHue: sp.titleHue, badge: sp.titleBadge });   // a fixed set already shows its cast big
    if (id !== this.flow) return;
    if (sp.intro) { this._scene('intro'); try { await sp.intro(this.world); } catch (err) { kit.warn(err); } if (id !== this.flow) return; }
    if (sp.howTo && sp.howTo.length) {
      this._scene('howto');
      const cards = sp.howTo.slice(0, 3).map(c => ({ icon: c.icon, text: T(kit, c.text) }));
      kit.say(cards.map(c => c.text).join(' '));
      await kit.screens.howTo(cards);
      if (id !== this.flow) return;
    }
    return this._play(id, {});
  }
  async _play(id, o = {}) {
    const kit = this.kit, sp = this.spec, w = this.world, S = this.stage;
    this._scene('countdown');
    if (sp.camera !== 'fixed') S.camera.follow(w.hero, Object.assign({ lookAhead: 0.16, deadzone: PRESETS[this.controls].top ? [0.1, 0.1] : [0.08, 0.9], smooth: 0.1 }, typeof sp.camera === 'object' ? sp.camera : {}));
    const lives = this.hudSpec.find(x => /^lives/.test(x)), n = lives ? +(lives.split(':')[1] || 3) || 3 : 3;
    const extra = kit.settings.get('assist') === 'hearts' ? 2 : 0;
    this.hud = kit.screens.hud(this.hudSpec.map(x => (/^timer/.test(x) ? 'timer' : /^lives/.test(x) ? 'lives:' + (n + extra) : x)), { total: w.total, onPause: v => { if (v === 'restart') this.restart('play'); if (v === 'quit') this.restart('title'); } });
    { const pg = this.hud.progress; if (pg) { pg.auto = pg.set; pg.set = v => { pg.own = true; pg.auto(v); }; } }
    w._lives = n + extra;
    if (this.hud.count) this.hud.count.set(0, w.total);
    kit.publicInput.touch(PRESETS[this.controls].top ? 'stick' : this.controls === 'tap' || this.controls === 'none' ? 'none' : 'stick+jump');
    if (this.controls === 'tap' && !this.offTap) this.offTap = kit.input.on('tap', p => { const ww = this.world; if (!ww || !ww.hero) return; const q = S.camera.toWorld(p); if (q.y < ww.hero.y - ww.hero.size * 0.8) ww._tapJump = true; });
    if (o.countdown !== false && sp.countdown !== 0) await kit.screens.countdown(sp.countdown || 3);
    if (id !== this.flow) return;
    this._scene('play');
    if (this.timerSecs) this._startTimer(this.timerSecs);
    w.emit('start');
  }
  _startTimer(s) { const h = this.hud; if (!h || !h.timer) return; this.timerOn = true; h.timer.start(s, () => { this.timerOn = false; const w = this.world; if (w && !w.ended && w.emit('timeup') !== false) w.lose(); }); }
  /** w.win({score, stars, title, who, say, submit}): title replaces "You did it!" (a string key works: a winner's
   *  name in a 2-player game), who is the character spec on the card and cheering (default the hero), submit: false
   *  keeps the score off the leaderboard and the best (hot-seat games). With no score: the points, plus 2 a second
   *  left on a timer, plus 25 a heart when the HUD shows lives. */
  async _win(o = {}) {
    const w = this.world, kit = this.kit, S = this.stage; if (!w || w.ended) return; w.ended = true;
    const id = this.flow, e = w.hero, h = this.hud;
    this._scene('goal'); if (h && h.timer) h.timer.stop(); this.timerOn = false;
    if (w.body) w.body.vx = 0;
    const whoE = o.who && o.who.stage ? o.who : null, whoSpec = whoE ? (whoE.spec || (whoE.charB && whoE.charB.spec)) : o.who && typeof o.who === 'object' ? o.who : o.who && typeof o.who === 'string' ? o.who : null;
    const star = whoE || e;
    kit.loop.slowmo(0.3, 900); S.camera.punch(1.1); if (star.state) star.state('cheer');
    const g = w.roles.goal[0]; if (g) { g.wobble(); g.squash(1.15, 400); S.burst('confetti', g.x, g.y - g.size * 1.2, { w: g.size * 1.3 }); }
    S.burst('sparkle', star.x, star.y - star.size * 0.7, { n: 24 }); kit.sfx('levelup');
    const left = h && h.timer ? Math.round(h.timer.left) : 0, lives = h && h.lives ? w.lives : 0, submit = o.submit !== false;
    const total = o.score != null ? +o.score : w.points + left * 2 + lives * 25, stars = o.stars != null ? o.stars : w.stars();
    if (submit) this._report(true, total);
    w.emit('win');
    await kit.loop.ui.wait(1400); if (id !== this.flow) return;
    await S.wipe('out', { at: { x: e.x, y: e.y - e.size * 0.5 }, ms: 650 }); if (id !== this.flow) return;
    if (h) h.root.style.display = 'none';
    const r = w.emit('results'); if (r && r.then) await r;
    await S.wipe('in', { at: { x: e.x, y: e.y - e.size * 0.5 }, ms: 650 }); if (id !== this.flow) return;
    this._scene('win');
    const best = submit ? this._bestOf(total) : null;
    if (o.say) kit.say(o.say);
    const more = this.li < this.levels.length - 1;
    const shown = kit.screens.win({ stars, score: total, best, hero: whoSpec || this.heroSpec(), title: o.title ? T(kit, o.title) : '', next: more, pause: false });
    if (this._onResults) { const f = this._onResults; this._onResults = null; f(true); }
    const v = await shown;
    if (id !== this.flow) return;
    if (v === 'next' && more) return this.next();
    return this.restart('play');
  }
  async _lose(o = {}) {
    const w = this.world, kit = this.kit; if (!w || w.ended) return; w.ended = true;
    const id = this.flow, h = this.hud; this._scene('lose'); if (h && h.timer) h.timer.stop(); this.timerOn = false;
    if (w.body) w.body.vx = 0; w.hero.state('sad'); kit.loop.hitstop(120);
    this._report(false, w.points);
    w.emit('lose');
    await kit.loop.ui.wait(900); if (id !== this.flow) return;
    const say = o.say || this.spec.trySay;
    await kit.screens.tryAgain({ score: w.points, best: this._bestOf(w.points, true), hero: this.heroSpec(), say: say ? T(kit, say) : '' });
    if (id !== this.flow) return;
    return this.restart('play');
  }
  _bestOf(score, peek) { const k = (this.spec.title || 'game') + '#' + this.li, B = this.best.get().best, old = B[k] || 0; if (!peek && score > old) { B[k] = score; this.best.set({ best: B }); this.best.flush(); } return old; }
  _report(won, score) { const brb = this.kit.brb; try { if (brb && typeof brb.gameOver === 'function') brb.gameOver({ won, score: Math.max(0, Math.round(score)) }); } catch (err) { this.kit.warn(err); } }
  testState() {
    const w = this.world, e = w && w.hero, h = this.hud, S = this.stage, f = S && S.fit, C = S && S.camera, V = S && S.view;
    // for the playtest: where the hero is on screen (CSS px: is the game's own DOM covering it?) and how many things
    // besides the ground are in view (an empty frame makes a poor cover)
    let heroBox = null, inView = 0;
    if (e && f && C && V && V.vw) {
      const p = C.toScreen({ x: e.x, y: e.y - e.size * 0.5 }), hh = e.size * C.effZoom * f.k;
      heroBox = { x: Math.round(f.offX + p.x * f.k), y: Math.round(f.offY + p.y * f.k), h: Math.round(hh) };
      for (const x of w.ents) { if (x.dead || x === e || /^(ground|water|ledge)/.test(String(x.sprite || ''))) continue; const q = C.toScreen(x); if (q.x > 0 && q.x < V.vw && q.y > 0 && q.y < V.vh) inView++; }
    }
    const extra = this.spec.testState ? w && w._call(this.spec.testState) : null;
    return Object.assign({ scene: this.state, score: w ? w.points : 0, lives: w ? w.lives : 0, timeLeft: h && h.timer ? Math.round(h.timer.left * 10) / 10 : null, hero: e ? { x: Math.round(e.x), y: Math.round(e.y), state: e.clip } : null, got: w ? w.got : 0, total: w ? w.total : 0, keys: w ? w.keys : 0, level: this.li, heroBox, inView, cell: w ? w.cell : 0, controls: this.controls }, extra && typeof extra === 'object' ? extra : {});
  }
}
const T = (kit, s) => (kit.i18n.has(s) ? kit.i18n.t(s) : String(s));

/** Oomba.game(spec) -> the Game handle. Validates the spec (warnings, never a throw), builds the stage, registers the
 *  test hooks, and runs (title first) once the kit font is ready unless spec.autorun is false. */
export function makeGame(kit, spec, makeStage) {
  if (spec && spec.api != null && spec.api !== 1) kit.warn(`Oomba.game({api: ${JSON.stringify(spec.api)}}): this kit speaks api 1.`);
  const v = kit.validateGame(spec || {}); for (const m of v.warnings) kit.warn('Oomba.game: ' + m);
  const sp = v.spec;
  if (sp.controls && !PRESETS[sp.controls]) kit.warn(`Oomba.game: unknown controls "${sp.controls}" (use ${CONTROLS.join(', ')})`);
  if (sp.strings) kit.i18n.strings(sp.strings);
  if (sp.theme === 'light' || sp.theme === 'dark') kit.theme.set(sp.theme);
  if (sp.style) kit.setStyle(sp.style);
  const stage = makeStage({ api: 1, size: sp.size, fit: sp.fit, backend: sp.backend, biome: sp.biome, seed: sp.seed, dress: sp.dress });
  const g = new Game(kit, sp, stage);
  kit.game = g;
  // win() resolves once the results card shows (never waits for a button press: automation calls it)
  kit.publicTest({ state: () => g.testState(), start: () => g.start(), skip: () => kit.screens.closeAll(),
    win: o => new Promise(res => { const w = g.world; if (!w || w.ended) return res(false); g._onResults = res; w.win(o); }) });
  if (sp.autorun !== false) kit.fontsReady.then(() => g.run());
  return g.api;
}
