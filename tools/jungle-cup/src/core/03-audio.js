// ======================================================================================================
// AUDIO: chiptune made in code with WebAudio. One AudioContext, made on the first tap or key (browsers' autoplay
// rule), silenced whenever the platform is muted (BRB.sfx.muted, the same switch as Settings > Sound), suspended
// while the page is hidden. Nothing is ever recorded.
//   JC.audio.sfx('tick')               a sound effect (names in SFX below)
//   JC.audio.music('paddle')           start a song from JC.audio.songs (''/null stops)
//   JC.audio.songs.mySport = {...}     a sport can add its own song (format below)
//   JC.audio.songTime()                seconds since the current song's step 0 (for rhythm games), -1 when silent
// Song format: { bpm, steps (16ths in the loop), lead, harm, bass, drums, leadWave, harmWave, swing }
//   lead/harm/bass: space-separated tokens, one per 16th: a note (C4, F#5, Bb3), '.' (rest) or '-' (hold).
//   drums: one character per 16th: k kick, s snare, h hat, o open hat, t tom (low), u tom (high), c shaker, '.' rest.
// ======================================================================================================
const AUDIO = { ctx: null, master: null, musicBus: null, sfxBus: null, noise: null, song: null, songId: '', step: 0, nextT: 0, t0: 0,
  timer: 0, muted: false, unlocked: false, played: [], tokens: null, musicVol: 0.55 };
JC.audio = AUDIO;
const NOTE_IX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const FREQ = new Map();
function noteFreq(n) {
  let f = FREQ.get(n); if (f !== undefined) return f;
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(n); if (!m) { FREQ.set(n, 0); return 0; }
  const semis = NOTE_IX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (+m[3] + 1) * 12;
  f = 440 * Math.pow(2, (semis - 69) / 12); FREQ.set(n, f); return f;
}
AUDIO.noteFreq = noteFreq;
AUDIO.unlock = function () {
  if (!this.ctx) {
    try {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
      const ctx = new C({ latencyHint: 'interactive' });
      this.ctx = ctx;
      this.master = ctx.createGain(); this.master.gain.value = BRBX.muted() ? 0 : 0.9; this.muted = BRBX.muted();
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
      this.master.connect(comp); comp.connect(ctx.destination);
      this.musicBus = ctx.createGain(); this.musicBus.gain.value = this.musicVol; this.musicBus.connect(this.master);
      this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = 0.8; this.sfxBus.connect(this.master);
      const len = ctx.sampleRate | 0, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      let seed = 7; for (let i = 0; i < len; i++) { seed = (seed * 16807) % 2147483647; d[i] = (seed / 2147483647) * 2 - 1; }
      this.noise = buf;
    } catch (e) { this.ctx = null; return; }
  }
  if (this.ctx.state === 'suspended' && !document.hidden) { try { this.ctx.resume(); } catch (e) { /* ignore */ } }
  this.unlocked = true;
  if (this.songId && !this.timer) this.music(this.songId, true);
};
/** Follow the platform mute; called every frame (cheap). */
AUDIO.sync = function () {
  const m = BRBX.muted();
  if (m === this.muted) return;
  this.muted = m;
  if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.03);
};
document.addEventListener('visibilitychange', () => {
  if (!AUDIO.ctx) return;
  try { if (document.hidden) AUDIO.ctx.suspend(); else AUDIO.ctx.resume(); } catch (e) { /* ignore */ }
});

/* ---------- voices ---------- */
function env(gn, t, a, peak, dec, sus, len) {
  const p = gn.gain; p.cancelScheduledValues(t); p.setValueAtTime(0.0001, t); p.linearRampToValueAtTime(peak, t + a);
  p.setTargetAtTime(peak * sus, t + a, dec); p.setTargetAtTime(0.0001, t + len, 0.03);
}
function tone(bus, type, f, t, len, vol, slideTo, a, dec, sus) {
  const ctx = AUDIO.ctx; if (!ctx || !f) return;
  const o = ctx.createOscillator(), gn = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + len);
  env(gn, t, a || 0.005, vol, dec || 0.08, sus === undefined ? 0.5 : sus, len);
  o.connect(gn); gn.connect(bus); o.start(t); o.stop(t + len + 0.2);
}
function noise(bus, t, len, vol, fType, fFreq, q, fTo) {
  const ctx = AUDIO.ctx; if (!ctx) return;
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), gn = ctx.createGain();
  s.buffer = AUDIO.noise; f.type = fType || 'highpass'; f.frequency.setValueAtTime(fFreq || 2000, t); if (fTo) f.frequency.exponentialRampToValueAtTime(fTo, t + len); f.Q.value = q || 0.7;
  gn.gain.setValueAtTime(vol, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + len);
  s.connect(f); f.connect(gn); gn.connect(bus); s.start(t, Math.random() * 0.5); s.stop(t + len + 0.05);
}
function drum(bus, k, t, vol) {
  vol = vol || 1;
  if (k === 'k') { tone(bus, 'sine', 150, t, 0.16, 0.9 * vol, 42, 0.002, 0.05, 0.2); noise(bus, t, 0.02, 0.15 * vol, 'lowpass', 900); }
  else if (k === 's') { noise(bus, t, 0.14, 0.45 * vol, 'bandpass', 1800, 0.8); tone(bus, 'triangle', 220, t, 0.07, 0.25 * vol, 140); }
  else if (k === 'h') noise(bus, t, 0.035, 0.18 * vol, 'highpass', 7000);
  else if (k === 'o') noise(bus, t, 0.16, 0.16 * vol, 'highpass', 6000);
  else if (k === 'c') noise(bus, t, 0.05, 0.12 * vol, 'bandpass', 5000, 2);
  else if (k === 't') tone(bus, 'sine', 120, t, 0.2, 0.6 * vol, 70, 0.002, 0.08, 0.3);
  else if (k === 'u') tone(bus, 'sine', 200, t, 0.16, 0.5 * vol, 120, 0.002, 0.06, 0.3);
}
AUDIO.tone = (type, f, len, vol, slideTo, delay) => { if (AUDIO.ctx) tone(AUDIO.sfxBus, type, f, AUDIO.ctx.currentTime + (delay || 0), len, vol, slideTo); };
AUDIO.drum = (k, vol, delay) => { if (AUDIO.ctx) drum(AUDIO.sfxBus, k, AUDIO.ctx.currentTime + (delay || 0), vol); };

/* ---------- sound effects ---------- */
const SFX = {
  tick(t, b) { tone(b, 'square', 1250, t, 0.04, 0.22, 900, 0.001, 0.02, 0.2); noise(b, t, 0.03, 0.2, 'highpass', 4000); },
  tock(t, b) { tone(b, 'square', 760, t, 0.05, 0.2, 600, 0.001, 0.02, 0.2); },
  grab(t, b) { tone(b, 'square', 330, t, 0.06, 0.2, 520); noise(b, t, 0.05, 0.12, 'bandpass', 1500, 1); },
  twang(t, b) { tone(b, 'sawtooth', 180, t, 0.25, 0.18, 90, 0.002, 0.08, 0.4); tone(b, 'square', 360, t, 0.12, 0.08, 200); },
  splash(t, b) { noise(b, t, 0.35, 0.35, 'lowpass', 3500, 0.6, 400); tone(b, 'sine', 400, t, 0.1, 0.15, 120); },
  drumLow(t, b) { tone(b, 'sine', 110, t, 0.35, 0.9, 60, 0.002, 0.12, 0.3); noise(b, t, 0.04, 0.2, 'lowpass', 600); },
  drumMid(t, b) { tone(b, 'sine', 196, t, 0.28, 0.8, 120, 0.002, 0.1, 0.3); noise(b, t, 0.04, 0.2, 'bandpass', 1200); },
  drumHigh(t, b) { tone(b, 'triangle', 392, t, 0.2, 0.7, 260, 0.002, 0.08, 0.3); noise(b, t, 0.03, 0.2, 'highpass', 3000); },
  kick(t, b) { tone(b, 'sine', 180, t, 0.12, 0.8, 60); noise(b, t, 0.08, 0.3, 'lowpass', 1200); },
  whoosh(t, b) { noise(b, t, 0.3, 0.3, 'bandpass', 600, 1.5, 3000); },
  bonk(t, b) { tone(b, 'square', 160, t, 0.12, 0.25, 90); noise(b, t, 0.06, 0.2, 'lowpass', 800); },
  beep(t, b) { tone(b, 'square', 660, t, 0.12, 0.22, 0, 0.002, 0.05, 0.7); },
  go(t, b) { tone(b, 'square', 990, t, 0.3, 0.25, 0, 0.002, 0.1, 0.7); tone(b, 'square', 1320, t + 0.06, 0.25, 0.15); },
  step(t, b) { noise(b, t, 0.03, 0.06, 'lowpass', 900); },
  blip(t, b) { tone(b, 'square', 880 + Math.random() * 120, t, 0.025, 0.06); },
  select(t, b) { tone(b, 'square', 660, t, 0.05, 0.18); tone(b, 'square', 990, t + 0.05, 0.07, 0.18); },
  back(t, b) { tone(b, 'square', 520, t, 0.05, 0.16); tone(b, 'square', 390, t + 0.05, 0.07, 0.16); },
  pickup(t, b) { [784, 988, 1175, 1568].forEach((f, i) => tone(b, 'square', f, t + i * 0.05, 0.08, 0.16)); },
  miss(t, b) { tone(b, 'triangle', 300, t, 0.25, 0.25, 150); },
  pounce(t, b) { noise(b, t, 0.4, 0.3, 'bandpass', 500, 1.2, 4000); tone(b, 'sawtooth', 220, t, 0.3, 0.2, 880); },
  star(t, b) { tone(b, 'square', 1046, t, 0.08, 0.18); tone(b, 'square', 1568, t + 0.07, 0.15, 0.18); },
  cheer(t, b) { for (let i = 0; i < 6; i++) noise(b, t + i * 0.05, 0.25, 0.12, 'bandpass', 1500 + i * 300, 3); },
  win(t, b) { [523, 659, 784, 1046].forEach((f, i) => tone(b, 'square', f, t + i * 0.1, 0.16, 0.2)); },
  lose(t, b) { [392, 349, 330, 262].forEach((f, i) => tone(b, 'triangle', f, t + i * 0.14, 0.2, 0.25)); },
  fanfare(t, b) {
    const n = [['C5', 0, 0.12], ['E5', 0.12, 0.12], ['G5', 0.24, 0.12], ['C6', 0.36, 0.5], ['A5', 0.9, 0.12], ['C6', 1.02, 0.7]];
    for (const [nn, at, len] of n) { tone(b, 'square', noteFreq(nn), t + at, len, 0.18); tone(b, 'triangle', noteFreq(nn) / 2, t + at, len, 0.25); }
    drum(b, 'k', t + 0.36); drum(b, 'o', t + 0.36); drum(b, 'k', t + 1.02); drum(b, 'o', t + 1.02);
  },
};
AUDIO.sfxNames = Object.keys(SFX);
/** Play a sound effect by name (see SFX); unknown names are ignored. The last 30 names are kept for tests. */
AUDIO.sfx = function (name, delay) {
  this.played.push(name); if (this.played.length > 30) this.played.shift();
  if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
  const f = SFX[name]; if (!f) return;
  try { f(this.ctx.currentTime + (delay || 0) + 0.005, this.sfxBus); } catch (e) { /* ignore */ }
};
AUDIO.addSfx = function (name, fn) { SFX[name] = fn; this.sfxNames = Object.keys(SFX); };
AUDIO.prims = { tone, noise, drum };

/* ---------- music ---------- */
AUDIO.songs = {};
function parseSong(s) {
  const tok = x => (x ? x.trim().split(/\s+/) : null);
  return { lead: tok(s.lead), harm: tok(s.harm), bass: tok(s.bass), drums: s.drums ? s.drums.replace(/\s+/g, '') : '' };
}
AUDIO.music = function (id, force) {
  if (!force && id === this.songId) return;
  this.songId = id || '';
  this.song = id ? this.songs[id] || null : null;
  if (this.song && !this.song._p) this.song._p = parseSong(this.song);
  if (!this.ctx) return;
  if (this.musicBus) { const tt = this.ctx.currentTime; this.musicBus.gain.cancelScheduledValues(tt); this.musicBus.gain.setValueAtTime(0.0001, tt); this.musicBus.gain.linearRampToValueAtTime(this.musicVol, tt + 0.15); }
  this.step = 0; this.nextT = this.ctx.currentTime + 0.08; this.t0 = this.nextT;
  if (!this.timer && this.song) this.tick();
};
AUDIO.songTime = function () { return this.ctx && this.song ? this.ctx.currentTime - this.t0 : -1; };
AUDIO.stepLen = function () { return this.song ? 60 / this.song.bpm / 4 : 0.125; };
AUDIO.tick = function () {
  AUDIO.timer = 0;
  const ctx = AUDIO.ctx, s = AUDIO.song; if (!ctx || !s) return;
  const sp = 60 / s.bpm / 4, p = s._p, steps = s.steps || 64;
  if (ctx.state === 'running') {
    if (AUDIO.nextT < ctx.currentTime - 0.5) { AUDIO.nextT = ctx.currentTime + 0.05; }
    while (AUDIO.nextT < ctx.currentTime + 0.15) {
      const i = AUDIO.step % steps, t = AUDIO.nextT + (s.swing && (i & 1) ? sp * s.swing : 0);
      const bus = AUDIO.musicBus;
      const play = (arr, wave, vol, oct) => {
        if (!arr) return; const n = arr[i % arr.length]; if (!n || n === '.' || n === '-') return;
        let len = 1; while (arr[(i + len) % arr.length] === '-' && len < 16) len++;
        tone(bus, wave, noteFreq(n) * (oct || 1), t, sp * len * 0.92, vol, 0, 0.004, 0.09, 0.55);
      };
      play(p.lead, s.leadWave || 'square', 0.13); play(p.harm, s.harmWave || 'square', 0.06); play(p.bass, 'triangle', 0.32);
      if (p.drums) { const d = p.drums[i % p.drums.length]; if (d !== '.') drum(bus, d, t, 0.55); }
      AUDIO.nextT += sp; AUDIO.step++;
    }
  }
  AUDIO.timer = setTimeout(AUDIO.tick, 30);
};

/* The core songs (sports add their own the same way). */
AUDIO.songs.title = { bpm: 92, steps: 64, leadWave: 'triangle', harmWave: 'square',
  lead: 'E5 - - . G5 - . . A5 - - - G5 - E5 - D5 - - . E5 - . . C5 - - - - - . . E5 - - . G5 - . . A5 - - - C6 - B5 - A5 - - . G5 - . . E5 - - - - - . .',
  harm: '. . C5 . . . E5 . . . F5 . . . E5 . . . B4 . . . C5 . . . A4 . . . G4 . . . C5 . . . E5 . . . F5 . . . A5 . . . F5 . . . E5 . . . D5 . . . C5 .',
  bass: 'C3 - - - - - - . A2 - - - - - - . F2 - - - - - - . G2 - - - - - - . C3 - - - - - - . A2 - - - - - - . F2 - - - - - - . G2 - - - G2 - . .',
  drums: 'k...c...k.c.c...k...c...k.c.c...k...c...k.c.c...k...c...k.c.u.t.' };
AUDIO.songs.island = { bpm: 118, steps: 64, leadWave: 'square', harmWave: 'triangle', swing: 0.12,
  lead: 'C5 . E5 . G5 - E5 . A5 . G5 . E5 - . . D5 . F5 . A5 - F5 . G5 - - . . . . . C5 . E5 . G5 - E5 . A5 . C6 . A5 - G5 . F5 . E5 . D5 - E5 . C5 - - - . . . .',
  harm: 'E4 . . . E4 . . . F4 . . . F4 . . . F4 . . . F4 . . . D4 . . . D4 . . . E4 . . . E4 . . . F4 . . . F4 . . . D4 . . . D4 . . . E4 . . . E4 . . .',
  bass: 'C3 . . C3 G2 . . . F2 . . F2 C3 . . . D3 . . D3 A2 . . . G2 . . G2 B2 . . . C3 . . C3 G2 . . . F2 . . F2 C3 . . . G2 . . G2 D3 . . . C3 . . G2 C3 . . .',
  drums: 'k.h.s.h.k.hks.h.k.h.s.h.k.hks.hck.h.s.h.k.hks.h.k.h.s.h.k.uts.c.' };
AUDIO.songs.paddle = { bpm: 136, steps: 32, leadWave: 'square', harmWave: 'square',
  lead: 'G5 . G5 . A5 . G5 . E5 - . . D5 . E5 . G5 . G5 . A5 . C6 . A5 - G5 . E5 . D5 .',
  harm: '. . B4 . . . B4 . . . C5 . . . C5 . . . B4 . . . B4 . . . C5 . . . A4 .',
  bass: 'E3 . E3 E3 . . E3 . C3 . C3 C3 . . C3 . D3 . D3 D3 . . D3 . G2 . G2 . A2 . B2 .',
  drums: 'k.h.s.hkk.h.s.h.k.h.s.hkk.hss.s.' };
AUDIO.songs.win = { bpm: 140, steps: 32, leadWave: 'square',
  lead: 'C5 E5 G5 C6 - - G5 C6 E6 - - - . . . . D6 - C6 - B5 - C6 - - - - - . . . .',
  bass: 'C3 - - - - - - - A2 - - - - - - - F2 - - - G2 - - - C3 - - - - - - -', drums: 'k...s...k.k.s...k...s...k.sss.s.' };
AUDIO.songs.finale = { bpm: 104, steps: 64, leadWave: 'square', harmWave: 'triangle',
  lead: 'G5 - - . C6 - - . B5 - A5 - G5 - E5 - F5 - - . A5 - - . G5 - - - - - . . E5 - - . G5 - - . C6 - D6 - E6 - - - D6 - C6 - A5 - B5 - C6 - - - - - - - . .',
  harm: 'E5 . . . E5 . . . D5 . . . C5 . . . C5 . . . F5 . . . D5 . . . B4 . . . C5 . . . E5 . . . A5 . . . G5 . . . F5 . . . F5 . . . E5 . . . E5 . . .',
  bass: 'C3 - - . C3 - - . G2 - - . A2 - - . F2 - - . F2 - - . G2 - - . G2 - - . A2 - - . A2 - - . E2 - - . E2 - - . F2 - - . G2 - - . C3 - - . C3 - - .',
  drums: 'k...s...k.k.s...k...s...k.k.s.u.k...s...k.k.s...k...s...ksssuutt' };
