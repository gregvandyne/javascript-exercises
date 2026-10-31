// The kit entry: builds window.Oomba (alias window.OK) once. Feature-detects the SDK (BRB) and never patches it.
import { color, motion, radius, space, z, outline, PALETTE, ROLES, SKIN, HAIR } from './tokens.js';
import { rand, seedOf } from './rand.js';
import { ease, EASE_NAMES } from './ease.js';
import { seq, all, stagger } from './tween.js';
import { Loop, runLoop } from './loop.js';
import { Input, touchControls } from './input.js';
import { I18n } from './i18n.js';
import { KitAudio } from './audio.js';
import { Save, memoryStorage } from './save.js';
import { Settings } from './settings.js';
import { Theme } from './theme.js';
import { validate, SPECIES, HAIR_STYLES, TOPS, WEAR, MOODS } from './validate.js';
import { Stage, RIGS } from './stage.js';
import { Atlas } from './atlas.js';
import { defineCoreArt } from './art.js';
import { UI, loadFonts } from './ui.js';
import { FlashLimiter, domPop, domShake } from './juice.js';
import { CORE_PARTS } from './parts.js';
import { makeDraw } from './helpers.js';
import { fitCanvas } from './fit.js';
import { installTestHooks } from './testhooks.js';
import { PRESET_NAMES } from './particles.js';
import { sparkPath, sticker, detail, ringEye, glowMask, lines, ellipsePath, rrectPath } from './grammar.js';
import { screens } from './screens.js';
import { icon, ICON_NAMES } from './icons.js';
import { charSpec, defineChar, CLIPS, FACES, STYLE } from './chars.js';
import { defineProps, PROP_GROUPS, PROP_VARIANTS } from './props.js';
import { defineGround, BIOME_NAMES, autotile } from './biomes.js';
import { makeGame, GAME_PARTS, groundFollow, CONTROLS, KIND_NAMES } from './game.js';
import { grid, generate, LEGEND } from './level.js';
import { installPacks, PACK_NAMES } from './packs.js';

export const VERSION = '1.1.0', API = 1;

function parseQuery(win) {
  const out = {};
  try {
    const s = new URLSearchParams(win.location.search || '');
    for (const k of ['okBackend', 'okTier', 'okDpr', 'okUltra', 'okGov', 'okDebug']) if (s.get(k)) out[k] = s.get(k);
  } catch (e) { /* opaque or odd location */ }
  const o = win.__OK_OPTS__; if (o && typeof o === 'object') for (const k in o) out[k] = String(o[k]);
  return out;
}
function brbStorage(brb, win) {
  if (brb && brb.storage && typeof brb.storage.get === 'function') return brb.storage;
  try { const ls = win.localStorage; return { get: k => { const v = ls.getItem(k); try { return v == null ? null : JSON.parse(v); } catch (e) { return v; } }, set: (k, v) => ls.setItem(k, JSON.stringify(v)), remove: k => ls.removeItem(k) }; } catch (e) { return memoryStorage(); }
}

export function createKit(win) {
  const doc = win.document;
  const brb = win.BRB && typeof win.BRB === 'object' ? win.BRB : null;
  const script = doc.currentScript && doc.currentScript.src ? doc.currentScript.src : '';
  const kit = { win, doc, brb, version: VERSION, base: script ? script.replace(/[^/]*$/, '') : '', query: parseQuery(win) };
  const loop = kit.loop = new Loop();
  kit.clock = () => loop.now;
  kit.warn = msg => { try { if (brb && typeof brb.debug === 'function') brb.debug(String(msg)); else if (win.console) win.console.warn('[oomba]', msg); } catch (e) { /* ignore */ } };
  // deprecate(name, hint): the 1.x promise's mechanism. An old call keeps working and warns once per page.
  const warned = new Set();
  kit.deprecate = (name, hint) => { if (warned.has(name)) return; warned.add(name); kit.warn(`${name} is deprecated${hint ? ': ' + hint : ''}. It still works in kit 1.x.`); };
  // A tiny event bus for the public Oomba.on(): 'pause' (the pause screen's result), 'blur', 'focus', 'hide', 'show'.
  const evs = {};
  kit.on = (ev, fn) => { (evs[ev] = evs[ev] || []).push(fn); return () => { evs[ev] = (evs[ev] || []).filter(f => f !== fn); }; };
  kit.emit = (ev, v) => { for (const fn of (evs[ev] || []).slice()) { try { fn(v); } catch (e) { kit.warn(e); } } };
  const storage = kit.storage = brbStorage(brb, win);
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
  kit.parts = Object.assign({}, CORE_PARTS, GAME_PARTS, { follow: groundFollow(CORE_PARTS.follow) }); kit.rigs = Object.assign({}, RIGS); kit.artPacks = [];
  kit.stages = []; kit.stage = null; kit.scene = 'boot'; kit.tier = 'low'; kit.backend = 'none'; kit.glLocked = false;
  kit.testActions = {}; kit.testState = null; kit.hudPause = null;
  kit.audio.onCaption = text => kit.ui.caption(text);
  kit.audio.onTalk = (on, who) => { if (who && who.state) who.state(on ? 'talk' : 'idle'); };
  kit.setLang = l => { kit.i18n.setLang(l); kit.ui.sync(); };
  kit.theme.on('change', () => kit.ui.sync());
  kit.settings.on('change', () => kit.ui.sync());
  // Frames: resolve after n rAF ticks (fonts timeout, waits) without timers.
  const waitFrames = n => new Promise(res => { let k = 0; const f = () => (++k >= n ? res() : win.requestAnimationFrame(f)); if (win.requestAnimationFrame) win.requestAnimationFrame(f); else res(); });
  kit.fontsReady = loadFonts(win, kit.base, waitFrames);
  let stopLoop = null, detachInput = null;
  kit.attachStage = s => {
    kit.stages.push(s); kit.stage = s;
    if (detachInput && kit.inputBare) { detachInput(); detachInput = null; kit.inputBare = false; }
    if (!detachInput) detachInput = kit.input.attach(win, s.el);
    kit.startLoop();
  };
  /** The game clock without a 2D stage (a three.js game with the kit's UI): Oomba.time.start(). */
  kit.startLoop = () => {
    if (!detachInput) { detachInput = kit.input.attach(win, doc.createElement('div')); kit.inputBare = true; }   // keys (pause) with no stage
    if (!stopLoop) {
      loop.update = dt => {
        let pads = null; try { pads = win.navigator.getGamepads ? win.navigator.getGamepads() : null; } catch (e) { pads = null; }
        kit.input.update(pads);
        // P / Esc / Start opens the pause screen whenever a HUD with a pause button is up (spec §8)
        if (kit.hudPause && !kit.screens.open && kit.input.pressed('pause')) kit.hudPause();
        for (let i = 0; i < kit.stages.length; i++) kit.stages[i].step(dt);
      };
      loop.render = alpha => {
        for (let i = 0; i < kit.stages.length; i++) kit.stages[i].render(alpha);
        kit.audio.tick(); kit.save.flush();
      };
      // A hidden page stops the audio thread too; a lost focus (a click on the page around the game) pauses the game
      // and opens the pause screen when one is wired (the HUD's), so time and hazards never run on without the player.
      loop.onHide = () => { kit.audio.suspend(); kit.emit('hide'); };
      loop.onShow = () => { kit.audio.resume(); kit.emit('show'); };
      loop.onBlur = () => { kit.emit('blur'); if (kit.hudPause && !kit.screens.open) kit.hudPause(); };
      loop.onFocus = () => kit.emit('focus');
      stopLoop = runLoop(loop, win);
    }
  };
  kit.detachStage = s => { kit.stages = kit.stages.filter(x => x !== s); kit.stage = kit.stages[kit.stages.length - 1] || null; };
  // Audio needs a gesture; so does speech on iOS. The first tap/key unlocks both.
  const unlock = () => { kit.audio.unlock(); };
  win.addEventListener('pointerdown', unlock, { capture: true }); win.addEventListener('keydown', unlock, { capture: true });
  win.addEventListener('pagehide', () => kit.save.flush());
  let helper = null;
  kit.helperAtlas = () => { if (!helper) { helper = kit.helper = new Atlas({ doc, pageSize: 2048, maxPages: 2 }); defineCoreArt(helper); defineProps(helper); defineGround(helper); for (const fn of kit.artPacks) fn(helper); } return helper; };
  installPacks(kit);
  kit.validateGame = spec => validate('game', spec);
  /** The art style: 'bold' (12-14: taller cast, cool faces, sharper UI from the style-bold pack) or 'playful'. */
  kit.setStyle = n => { STYLE.name = n === 'bold' ? 'bold' : 'playful'; kit.ui.mount().classList.toggle('ok-bold', STYLE.name === 'bold'); if (STYLE.name === 'bold' && !kit.packs['style-bold']) kit.warn("style 'bold': load the style-bold pack (its pinned tag right after the kit tag)"); return STYLE.name; };
  kit.drawKit = makeDraw(kit);
  /** A character portrait canvas px tall (mood = face variant), drawn once through the helper atlas. */
  kit.portraitCanvas = (spec, px = 160, mood = '') => {
    const A = kit.helperAtlas(), b = defineChar(A, spec && spec.__ok ? spec : charSpec(spec || 'oomba')), def = A.defs.get(b.id + ':portrait');
    const c = doc.createElement('canvas'); c.height = Math.max(8, Math.round(px)); c.width = Math.ceil(c.height * def.w / def.h);
    const id = A.sprite(b.id + ':portrait', c.height, mood || ''), e = A.entries[id];
    if (e) c.getContext('2d').drawImage(A.pages[e.page].canvas, e.x, e.y, e.w, e.h, 0, 0, c.width, c.height);
    return c;
  };
  // Text sprites baked before the kit font arrived are re-baked with it.
  kit.fontsReady.then(ok => { if (!ok) return; for (const s of kit.stages) s.atlas.forgetText(); if (helper) helper.forgetText(); });
  // Key sounds carry a caption (shown in the caption strip when captions are on), throttled so a run of pickups
  // never spams it. o.caption: a string key or text for any sound, or false for none.
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
    theme: { get mode() { return theme.mode; }, get biome() { return theme.biome; }, get look() { return theme.look || null; }, get names() { return theme.names || []; }, on: (ev, fn) => theme.on(ev, fn), set: m => theme.set(m) },
    rand, seedOf, tween, ease, easings: EASE_NAMES,
    spring: (target, prop, o) => loop.tw.spring(target, prop, o),
    // Which clock: Oomba.wait/after/every and Oomba.time.wait/after/every run on the GAME clock (they stop while the
    // game is paused, in hit-stop and slow-mo: spawns, cooldowns, level timers). Oomba.time.real.* runs on real time
    // (menus, cutscenes, results screens) and keeps going through the pause screen.
    wait: ms => loop.tw.wait(ms), after: (ms, fn) => loop.tw.after(ms, fn), every: (ms, fn) => loop.tw.every(ms, fn),
    time: {
      get now() { return loop.now; }, get game() { return loop.game; },
      get scale() { return loop.scale; }, set scale(v) { loop.scale = Math.max(0.1, Math.min(2, +v || 1)); },
      hitstop: ms => loop.hitstop(ms), slowmo: (s, ms) => loop.slowmo(s, ms),
      /** start(): run the game clock (and the HUD's pause key) in a game with no Oomba.stage, e.g. three.js. */
      start: () => kit.startLoop(),
      pause: r => loop.pause(r), resume: r => loop.resume(r), get paused() { return loop.paused; },
      wait: ms => loop.tw.wait(ms), after: (ms, fn) => loop.tw.after(ms, fn), every: (ms, fn) => loop.tw.every(ms, fn),
      real: { wait: ms => loop.ui.wait(ms), after: (ms, fn) => loop.ui.after(ms, fn), every: (ms, fn) => loop.ui.every(ms, fn) },
    },
    /** on('pause' | 'blur' | 'focus' | 'hide' | 'show', fn) -> off. 'pause' gets the pause screen's result. */
    on: (ev, fn) => kit.on(ev, fn),
    /** The current scene name (shows in __brbTest.state() and the playtest). */
    get scene() { return kit.scene; }, set scene(v) { kit.scene = String(v); },
    /** test({state, start, win, skip}): register the game's test hooks (window.__brbTest; the screenshot worker and
     *  the Builder's playtest call start() to begin a round). Without this, state() reports game: false. */
    test: (o = {}) => {
      if (o.state && typeof o.state === 'function') kit.testState = o.state;
      for (const k of ['start', 'win', 'skip']) if (typeof o[k] === 'function') { kit.testActions[k] = o[k]; kit.installTestAction(k); }
    },
    input: {
      down: a => kit.input.down(a), pressed: a => kit.input.pressed(a), released: a => kit.input.released(a), axis: () => kit.input.axis(),
      /** hold(action, ms) -> Promise: press an action as if a key were held (demos, tutorials, tests). */
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
    /** avatar() -> the character the player designed on their Me page (BRB.user.character: a parts spec, never a
     *  picture; its bold.wear and bold.mood apply in the Bold style), else a look from their account; a guest gets the
     *  mascot. me() is the same. */
    avatar: () => O.me(),
    me: () => {
      const u = kit.brb && kit.brb.user, c = u && !u.isGuest && u.character;
      if (c && typeof c === 'object') { const bo = STYLE.name === 'bold', b = bo && c.bold || {}; return charSpec(Object.assign({}, c, { wear: [].concat(c.wear || [], b.wear || []), mood: bo ? b.mood : c.mood, bold: 0, seed: 7 })); }
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
    /** game({...}) -> the declarative game (level A): see docs/kit-api.md. */
    game: spec => makeGame(kit, spec || {}, o => O.stage(o)),
    level: { grid: (rows, legend, o) => grid(rows, legend, o), generate: o => generate(o), legend: LEGEND, kinds: KIND_NAMES, controls: CONTROLS },
    /** pack(name) -> what a loaded art pack added ({name, species, props, biomes}), or null (with a warning naming the tag to add). */
    pack: name => kit.packs[name] || (kit.warn(PACK_NAMES.includes(name) ? `Oomba.pack('${name}'): the pack is not loaded. Add its pinned tag right after the kit tag.` : `Oomba.pack('${name}'): there is no such pack (packs: ${PACK_NAMES.join(', ')}).`), null),
    get packs() { return Object.keys(kit.packs); },
    /** style() -> 'playful' | 'bold'; style('bold') switches it (before the stage is made). */
    style: n => (n == null ? STYLE.name : kit.setStyle(n)),
    /** char(spec) -> a validated, frozen character spec (stage.add(spec) spawns it). */
    char: spec => charSpec(spec),
    icon: (name, o) => icon(name, o), icons: ICON_NAMES,
    art: {
      define: (name, def) => { kit.artPacks.push(a => a.define(name, def)); if (kit.stage) kit.stage.atlas.define(name, def); if (kit.helper && (!kit.stage || kit.helper !== kit.stage.atlas)) kit.helper.define(name, def); },
      pack: fn => { kit.artPacks.push(fn); if (kit.stage) fn(kit.stage.atlas); },
      rig: (name, fn) => { kit.rigs[name] = fn; },
      part: (name, fn) => { kit.parts[name] = fn; },
      sparkPath, autotile,
      /** The "Oomba Ink" drawing grammar for art packs: sticker(ctx, k, path, {fill, shade, gloss, rim, unlit, emissive}),
       *  detail (inner lines), ringEye, glow (emissive mask), lines(k) (outline widths), ellipse and rrect paths. */
      ink: { sticker, detail, ringEye, glow: glowMask, lines, ellipse: ellipsePath, rrect: rrectPath, spark: sparkPath },
      species: SPECIES, clips: CLIPS, faces: FACES, moods: MOODS, hair: HAIR_STYLES, tops: TOPS, wear: WEAR,
      props: PROP_GROUPS, variants: PROP_VARIANTS, biomes: BIOME_NAMES,
      /** toCanvas(name | charSpec, px, variant) -> a canvas with the sprite (DOM portraits, previews). */
      toCanvas: (name, px = 128, v = '') => { if (typeof name === 'object' || SPECIES.includes(name)) return kit.portraitCanvas(name, px, v); const A = kit.helperAtlas(); const def = A.defs.get(name); const c = kit.doc.createElement('canvas'); if (!def) return c; c.height = px; c.width = Math.ceil(px * def.w / def.h); const ctx = c.getContext('2d'); kit.drawKit.sprite(ctx, name, c.width * (def.ax == null ? 0.5 : def.ax), px * (def.ay == null ? 0.5 : def.ay), { size: px, state: v }); return c; },
    },
  };
  // Internals for the kit's own tests and the /kit preview only (?okDebug=1): unsupported, not enumerable, and the
  // scanner warns when a game names it.
  if (kit.query.okDebug === '1') Object.defineProperty(O, 'debug', { value: { kit }, enumerable: false });
  // The hook pack files call (not for games: the scanner flags it).
  Object.defineProperty(O, '__pk', { value: (meta, define) => kit.definePack(meta, define), enumerable: false });
  kit.publicTest = O.test; kit.publicInput = O.input; kit.publicJuice = O.juice;
  kit.meSpec = () => O.me();
  return O;
}

// Classic-script bootstrap: one copy per page, never re-initialised.
if (typeof window !== 'undefined' && typeof document !== 'undefined' && !window.Oomba) {
  try { const O = createKit(window); window.Oomba = O; if (!window.OK) window.OK = O; } catch (e) { if (window.console) window.console.error('[oomba] kit failed to start', e); }
}
