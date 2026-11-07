// ======================================================================================================
// TEST HOOKS: window.__brbTest (the platform's autotest reads state()) and window.__brbTest.jc for our own tests.
// Harmless in production: they only do what a player could do, faster.
// ======================================================================================================
const PLACES = { dock: [36, 61, 'up'], village: [36, 40, 'up'], totem: [36, 39, 'up'], kapok: [36, 17, 'up'], lift: [36, 17, 'up'], lagoon: [16, 47, 'left'], islet: [60, 40, 'up'] };
function sceneName() { return JC.scene ? JC.scene.name : 'loading'; }
function jcState() {
  const d = SAVE.data;
  return {
    screen: sceneName(), ready: WORLD.ready, fading: JC.fading(), tab: MAP.tab,
    pos: { x: P.x, y: P.y, dir: P.dir, moving: P.moving }, prompt: OW.prompt || '', text: TB.open ? { who: TB.lines[TB.i].who, key: TB.lines[TB.i].key } : null,
    sport: JC.scene === RUN ? { id: RUN.id, phase: RUN.phase, result: RUN.result, newFeather: RUN.newFeather, state: RUN.sport && RUN.sport.testState ? RUN.sport.testState(RUN.ctx) : null } : null,
    feathers: SAVE.featherCount(), feathersBy: Object.assign({}, d.feathers), best: Object.assign({}, d.best), stars: Object.assign({}, d.stars),
    quests: Object.assign({}, d.quests), cos: JSON.parse(JSON.stringify(d.cos)), settings: Object.assign({}, d.settings), cup: d.cup,
    saved: SAVE.exists(), sports: Object.keys(JC.sports), view: { W: VIEW.W, H: VIEW.H, S: VIEW.S, tap: VIEW.tap, dpr: VIEW.dpr },
    sounds: AUDIO.played.slice(), song: AUDIO.songId, lang: LANG, font: TEXT.clear ? 'clear' : 'pixel', device: INPUT.device,
  };
}
function runSteps(ms) { const n = Math.max(1, Math.round(ms / (1000 / 60))); for (let i = 0; i < n; i++) step(1 / 60); render(); }
function finishSport(id, won) {
  if (!JC.sports[id]) return null;
  if (JC.scene !== RUN || RUN.id !== id) JC.go('sport', { id, phase: 'count' }, true);
  if (RUN.phase === 'count' || RUN.phase === 'intro') { if (RUN.phase === 'intro') RUN.begin(); RUN.phase = 'play'; }
  const sp = RUN.sport;
  const res = sp.cheat ? sp.cheat(won, RUN.ctx) : { score: won ? 1000 : 100, stars: won ? 3 : 0, won };
  RUN.result = res; RUN.phase = 'outro'; RUN.outroT = 0;
  finishRound();
  return jcState();
}
const JCT = {
  state: jcState,
  /** go('title' | 'world' | 'map' | 'settings' | 'controls' | 'style' | 'finale' | 'credits' | a place | a sport id (its arch)) */
  go(where) {
    if (where === 'title') JC.go('title', {}, true);
    else if (where === 'map' || where === 'settings' || where === 'controls' || where === 'style') JC.go('map', { tab: where }, true);
    else if (where === 'finale' || where === 'credits') JC.go(where, {}, true);
    else if (ARCHES[where]) { const a = ARCHES[where]; JC.go('world', { at: [a.x, a.y, 'up'] }, true); }
    else if (PLACES[where]) JC.go('world', { at: PLACES[where] }, true);
    else if (Array.isArray(where)) JC.go('world', { at: where }, true);
    else JC.go('world', {}, true);
    return jcState();
  },
  /** play(id): straight to the countdown; play(id, { intro: true }) shows the intro card first. */
  play(id, o) { if (!JC.sports[id]) return null; JC.go('sport', { id, phase: o && o.intro ? 'intro' : 'count' }, true); return jcState(); },
  win(id) { return finishSport(id || RUN.id, true); },
  lose(id) { return finishSport(id || RUN.id, false); },
  setSave(obj) { SAVE.set(Object.assign({ started: true }, obj || {})); JC.refreshCappy(); return jcState(); },
  save() { return JSON.parse(JSON.stringify(SAVE.data)); },
  newGame() { newGame(); return jcState(); },
  continue() { continueGame(); return jcState(); },
  /** Run the game for ms of game time at once (deterministic; draws one frame at the end). */
  step(ms) { runSteps(ms || 16); return jcState(); },
  /** manual(true): the loop stops by itself; only step() moves time. */
  manual(on) { LOOP.manual = !!on; return LOOP.manual; },
  speed(n) { LOOP.speed = clamp(+n || 1, 0.1, 16); return LOOP.speed; },
  press(key) { INPUT.keys[key] = true; refreshHeld(); emit({ type: 'press', key, device: 'keys' }); },
  release(key) { INPUT.keys[key] = false; refreshHeld(); emit({ type: 'release', key, device: 'keys' }); },
  tapKey(key) { JCT.press(key); JCT.release(key); },
  /** A tap at virtual pixels (or a button id). */
  tap(x, y) {
    if (typeof x === 'string') { for (let i = 0; i < UI.prevN; i++) if (UI.prev[i].id === x) { const h = UI.prev[i]; x = h.x + h.w / 2; y = h.y + h.h / 2; break; } if (typeof x === 'string') return false; }
    emit({ type: 'down', id: 99, x, y, sx: x, sy: y, dx: 0, dy: 0, device: 'touch' }); emit({ type: 'up', id: 99, x, y, sx: x, sy: y, dx: 0, dy: 0, device: 'touch' }); emit({ type: 'tap', x, y });
    return true;
  },
  swipe(dir) { const v = DIRS[dir]; emit({ type: 'swipe', dir, x: VIEW.W / 2, y: VIEW.H / 2, sx: VIEW.W / 2 - v[0] * 30, sy: VIEW.H / 2 - v[1] * 30, dx: v[0] * 30, dy: v[1] * 30, speed: 1 }); },
  /** Walk n steps (each a full step) in a direction. */
  walk(dir, n) { for (let i = 0; i < (n || 1); i++) { if (!tryStep(dir)) break; runSteps(170); } return jcState(); },
  talk() { act(); return jcState(); },
  skipText() { TB.skipAll(); return jcState(); },
  /** The buttons drawn last frame, in CSS pixels: [{ id, x, y, w, h }]. */
  buttons() { const k = VIEW.S / VIEW.dpr, out = []; for (let i = 0; i < UI.prevN; i++) { const h = UI.prev[i]; out.push({ id: h.id, x: h.x * k, y: h.y * k, w: h.w * k, h: h.h * k }); } return out; },
  /** The current sport's own hooks (sport.test), e.g. jc.sport('auto', true). */
  sport(name, ...a) { const sp = RUN.sport; if (!sp) return null; if (!name) return sp.testState ? sp.testState(RUN.ctx) : null; return sp.test && sp.test[name] ? sp.test[name](RUN.ctx, ...a) : null; },
  perf() { return { fps: Math.round(LOOP.fps), slowest: Math.round(LOOP.slowest * 10) / 10, frames: LOOP.frames }; },
  world() { return { arches: ARCHES, npcs: WORLD.npcs.map(n => ({ id: n.id, x: n.x, y: n.y })), items: WORLD.items.map(i => ({ quest: i.quest, x: i.x, y: i.y })), solid: (x, y) => WORLD.isSolid(x, y) }; },
  solidAt(x, y) { return WORLD.isSolid(x, y); },
  /** Show every sprite on a sheet (for screenshots). */
  sheet(on) { JC.sheet = !!on; render(); return Object.keys(SPRITES).length; },
};
window.__brbTest = Object.assign(window.__brbTest || {}, {
  state() { const s = jcState(); return { screen: s.screen, ready: s.ready, score: SAVE.cupPoints(), feathers: s.feathers, phase: s.sport ? s.sport.phase : '' }; },
  start() { if (sceneName() === 'title') { if (SAVE.exists()) continueGame(); else newGame(); } return window.__brbTest.state(); },
  jc: JCT,
});
