// Loudness for one official classroom game (Remi's Quiet Meadow; server/services/mic-games.js decides which game, and
// only that game's play page loads this file). docs/safety.md "Loudness".
//
// What it does: after a real tap, it opens the microphone with the browser's own prompt, measures how loud the room is
// (the RMS of the newest samples, in dBFS) 20 times a second and hands the game frame ONE NUMBER each time. That is all.
//   - Audio is never recorded: no MediaRecorder, no buffers kept, nothing stored, nothing sent over the network.
//   - The analyser is connected to nothing: the microphone never reaches the speakers.
//   - The microphone stops (every track) on Stop, pause, a hidden page, leaving, a frame reload, or when the game goes
//     quiet (no keep-alive for 6 s). The page shows its own "Listening · Stop" pill the whole time it is on.
// The game frame itself can never open the microphone (it is opaque-origin and its header says microphone=()).
// No imports: node --test loads the pure parts (rmsDb, bytesToFloat, stateOf, loudDecision, createListener) directly.

/** RMS level of samples (floats in -1…1) in dBFS: the mean is removed first (a DC offset is not sound), rounded to 0.1,
 *  clamped to -100…0. Silence is -100. */
export function rmsDb(buf) {
  const n = buf && buf.length ? buf.length : 0;
  if (!n) return -100;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += buf[i];
  mean /= n;
  let sq = 0;
  for (let i = 0; i < n; i++) { const x = buf[i] - mean; sq += x * x; }
  const db = 20 * Math.log10(Math.sqrt(sq / n) + 1e-9);
  return Math.round(Math.max(-100, Math.min(0, db)) * 10) / 10;
}
/** getByteTimeDomainData (0…255, 128 = silence) as floats, for browsers without getFloatTimeDomainData. */
export function bytesToFloat(u8, out = new Float32Array(u8.length)) {
  for (let i = 0; i < u8.length; i++) out[i] = (u8[i] - 128) / 128;
  return out;
}
/** A getUserMedia failure as a state the game explains to the teacher. */
export function stateOf(err) {
  const name = err && err.name;
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return 'denied';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') return 'nodevice';
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return 'busy';
  return 'unavailable';
}
/** The page's answer to a frame's brb:loud op. mic: this page may listen (page-data.mic); tapped: the player tapped
 *  just now (navigator.userActivation). -> 'off' (never, on any other game) | 'ready' | 'start' | 'needsTap' | 'keep'
 *  | 'stop'. */
export function loudDecision(mic, op, tapped) {
  if (!mic) return 'off';
  if (op === 'hello') return 'ready';
  if (op === 'start') return tapped ? 'start' : 'needsTap';
  if (op === 'keep') return 'keep';
  if (op === 'stop') return 'stop';
  return 'off';
}

/**
 * The microphone listener. onLevel(db) every 50 ms while on; onState(state) for 'on' and every failure.
 * deps (tests): { mediaDevices, AudioContext, setInterval, clearInterval, setTimeout }.
 * -> { start(): Promise<state>, stop(), active(), resume() }
 */
export function createListener({ onLevel = () => {}, onState = () => {} } = {}, deps = {}) {
  const g = globalThis;
  const md = 'mediaDevices' in deps ? deps.mediaDevices : (g.navigator && g.navigator.mediaDevices);
  const AC = 'AudioContext' in deps ? deps.AudioContext : (g.AudioContext || g.webkitAudioContext);
  const every = deps.setInterval || g.setInterval.bind(g), clear = deps.clearInterval || g.clearInterval.bind(g), later = deps.setTimeout || g.setTimeout.bind(g);
  let stream = null, ctx = null, src = null, an = null, timer = null, buf = null, bytes = null, gen = 0;
  function stop() {
    gen++;
    if (timer) { clear(timer); timer = null; }
    if (stream) { for (const tr of stream.getTracks()) { try { tr.stop(); } catch { /* gone */ } } }
    try { if (src) src.disconnect(); } catch { /* gone */ }
    try { if (ctx && ctx.state !== 'closed') ctx.close(); } catch { /* gone */ }
    stream = ctx = src = an = buf = bytes = null;
  }
  async function start() {
    stop();
    const my = gen;
    if (!md || typeof md.getUserMedia !== 'function' || !AC) { onState('unavailable'); return 'unavailable'; }
    let s;
    try {
      // No echo cancelling, noise suppression or automatic gain: those would hide exactly the noise we measure.
      s = await md.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
    } catch (err) { const st = stateOf(err); onState(st); return st; }
    if (my !== gen) { for (const tr of s.getTracks()) tr.stop(); return 'stopped'; }   // stopped while the prompt was up
    try {
      stream = s; ctx = new AC();
      src = ctx.createMediaStreamSource(s);
      an = ctx.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = 0;
      src.connect(an);   // and nothing else: never ctx.destination
      buf = new Float32Array(an.fftSize);
      if (typeof an.getFloatTimeDomainData !== 'function') bytes = new Uint8Array(an.fftSize);
    } catch { stop(); onState('unavailable'); return 'unavailable'; }
    timer = every(() => {
      if (!an) return;
      if (bytes) { an.getByteTimeDomainData(bytes); bytesToFloat(bytes, buf); } else an.getFloatTimeDomainData(buf);
      onLevel(rmsDb(buf));
    }, 50);
    if (ctx.state !== 'running' && typeof ctx.resume === 'function') ctx.resume().catch(() => {});
    // A browser that did not pass the tap on (an iPad) keeps the context suspended: the page then asks for its own tap.
    later(() => { if (my === gen && ctx && ctx.state !== 'running') onState('needsTap'); }, 600);
    onState('on');
    return 'on';
  }
  return {
    start, stop,
    active: () => !!stream,
    resume() { if (ctx && ctx.state !== 'running') return ctx.resume().then(() => { onState('on'); }, () => {}); return Promise.resolve(); },
  };
}

/**
 * The play page's side of BRB.loudness (public/js/play.js loads this only when page-data.mic is set).
 * frame: the game iframe; toFrame(msg): post to it; stage: #stage (the pill goes inside it, so fullscreen shows it);
 * t: the page's i18n; tapped(): navigator.userActivation. -> { message(m, tap), stop(why) }
 */
export function bridge({ toFrame, stage, t, tapped }) {
  let lease = 0, leaseTimer = null, pill = null, tapBtn = null, on = false;
  const tell = state => toFrame({ type: 'brb:loudState', state });
  const listener = createListener({
    onLevel: db => { if (on) toFrame({ type: 'brb:level', db }); },
    onState: state => {
      if (state === 'on') { on = true; hideTap(); showPill(); }
      else if (state === 'needsTap') { showTap(); }
      else { on = false; hidePill(); hideTap(); }
      document.documentElement.dataset.mic = on ? 'on' : 'off';
      tell(state);
    },
  });
  document.documentElement.dataset.mic = 'off';
  function renew() { lease = Date.now(); }
  function stop(why = 'stopped') {
    const was = listener.active() || on;
    listener.stop(); on = false; hidePill(); hideTap();
    if (leaseTimer) { clearInterval(leaseTimer); leaseTimer = null; }
    document.documentElement.dataset.mic = 'off';
    if (was && why) tell(why);
  }
  function showPill() {
    if (pill) return;
    pill = document.createElement('div'); pill.className = 'micpill'; pill.setAttribute('role', 'status'); pill.dir = document.documentElement.dir || 'ltr';
    const label = document.createElement('span'); label.className = 'micpill-l'; label.textContent = '🎤 ' + t('js.loudness.listening');
    const b = document.createElement('button'); b.type = 'button'; b.className = 'micpill-stop'; b.textContent = t('js.loudness.stop');
    b.addEventListener('click', () => { stop('stopped'); });
    pill.append(label, b); stage.appendChild(pill);
  }
  function hidePill() { if (pill) { pill.remove(); pill = null; } }
  function showTap() {
    if (tapBtn) return;
    tapBtn = document.createElement('button'); tapBtn.type = 'button'; tapBtn.className = 'mictap btn btn-primary btn-big'; tapBtn.textContent = '🎤 ' + t('js.loudness.tap');
    tapBtn.addEventListener('click', () => { listener.resume(); hideTap(); });
    stage.appendChild(tapBtn); tapBtn.focus();
  }
  function hideTap() { if (tapBtn) { tapBtn.remove(); tapBtn = null; } }
  /** m: a validated brb:loud message; tap: whether the player tapped just now (checked by the caller as the message
   *  arrived; the frame's own fields are never trusted for it). */
  async function message(m, tap = tapped()) {
    const what = loudDecision(true, m.op, tap === true);
    if (what === 'ready') { tell(on ? 'on' : 'ready'); return; }
    if (what === 'needsTap') { tell('needsTap'); return; }
    if (what === 'keep') { if (on) renew(); return; }
    if (what === 'stop') { stop(null); tell('idle'); return; }
    if (what === 'start') {
      renew();
      if (!leaseTimer) leaseTimer = setInterval(() => { if (listener.active() && Date.now() - lease > 6000) stop('stopped'); }, 1000);
      await listener.start();
    }
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop('stopped'); });
  addEventListener('pagehide', () => stop(null));
  return { message, stop };
}
