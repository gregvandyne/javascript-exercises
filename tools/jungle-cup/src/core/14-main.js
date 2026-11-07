// ======================================================================================================
// MAIN: scenes, the fade between them, and the loop (fixed 1/60 s steps, drawn once per frame).
// ======================================================================================================
const SCENES = { title: TITLE, world: OW, map: MAP, sport: RUN, finale: FIN, credits: CRED };
JC.scenes = SCENES;
JC.scene = null;
JC.audioWant = '';
const FADE = { t: 0, dir: 0, next: null, opts: null };
JC.fading = () => FADE.dir !== 0;
/** Go to a scene by name ('title', 'world', 'map', 'sport', 'finale', 'credits'), with a short fade. */
JC.go = function (name, opts, instant) {
  const sc = SCENES[name]; if (!sc) return;
  if (instant || !JC.scene) { swap(sc, opts); return; }
  FADE.next = sc; FADE.opts = opts; FADE.dir = 1; FADE.t = 0;
};
function swap(sc, opts) {
  if (JC.scene && JC.scene.leave) JC.scene.leave();
  if (TB.open && sc !== JC.scene) { TB.stop(); TB.open = false; }
  JC.scene = sc; UI.n = 0; UI.prevN = 0; UI.focus = 0;
  if (sc.enter) sc.enter(opts || {});
}
JC.onInput = function (e) {
  if (FADE.dir === 1) return;
  if (JC.scene && JC.scene.onInput) JC.scene.onInput(e);
};
const LOOP = { last: 0, acc: 0, speed: 1, frames: 0, fps: 60, fpsT: 0, fpsN: 0, manual: false, slowest: 0 };
JC.loop = LOOP;
function step(dt) {
  INPUT.poll();
  UI.update(dt);
  if (FADE.dir) {
    FADE.t += dt * 4;
    if (FADE.dir === 1 && FADE.t >= 1) { swap(FADE.next, FADE.opts); FADE.dir = -1; FADE.t = 1; }
    else if (FADE.dir === -1) { FADE.t -= dt * 8; if (FADE.t <= 0) { FADE.dir = 0; FADE.t = 0; } }
  }
  if (JC.scene && JC.scene.update) JC.scene.update(dt);
  SAVE.update(dt);
}
JC.step = step;
function render() {
  const g = G;
  g.setTransform(VIEW.S, 0, 0, VIEW.S, 0, 0);
  g.imageSmoothingEnabled = false;
  UI.beginFrame();
  if (JC.scene && JC.scene.draw) JC.scene.draw(g);
  UI.endFrame();
  if (FADE.dir) { g.fillStyle = '#10081c'; g.globalAlpha = clamp(FADE.t, 0, 1); g.fillRect(0, 0, VIEW.W, VIEW.H); g.globalAlpha = 1; }
}
JC.render = render;
function frame(now) {
  requestAnimationFrame(frame);
  if (LOOP.manual) return;
  const t0 = performance.now();
  let dt = LOOP.last ? (now - LOOP.last) / 1000 : 1 / 60; LOOP.last = now;
  if (dt > 0.25) dt = 0.25;
  LOOP.acc += dt * LOOP.speed;
  let n = 0;
  while (LOOP.acc >= 1 / 60 && n < 8 * LOOP.speed) { step(1 / 60); LOOP.acc -= 1 / 60; n++; }
  if (n >= 8 * LOOP.speed) LOOP.acc = 0;
  AUDIO.sync();
  if (JC.audioWant !== AUDIO.songId) AUDIO.music(JC.audioWant);
  render();
  LOOP.frames++;
  LOOP.fpsN++; LOOP.fpsT += dt; if (LOOP.fpsT >= 1) { LOOP.fps = LOOP.fpsN / LOOP.fpsT; LOOP.fpsN = 0; LOOP.fpsT = 0; }
  const spent = performance.now() - t0; if (spent > LOOP.slowest) LOOP.slowest = spent;
}
JC.start = function () {
  resize();
  window.addEventListener('resize', resize);
  try { if (window.visualViewport) window.visualViewport.addEventListener('resize', resize); } catch (e) { /* ignore */ }
  requestAnimationFrame(frame);
};
