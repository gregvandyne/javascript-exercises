// Sound: the SDK's sound names go through BRB.sfx; the kit's own 12 voices are synthesised here (Web Audio, no files).
// Every play gets small pitch variation and stereo pan from its screen x. Two procedural music beds (a pentatonic
// step sequencer) duck under speech. say() = BRB.speak + caption + "talking" events, queued, never overlapping.
import { mulberry32 } from './rand.js';

export const SDK_SFX = ['jump', 'hit', 'coin', 'lose', 'click', 'powerup'];
export const KIT_SFX = ['pop', 'whoosh', 'correct', 'wrong', 'spark', 'step', 'land', 'select', 'levelup', 'count', 'hurt', 'win'];
const FALLBACK = { jump: 'whoosh', hit: 'hurt', coin: 'spark', lose: 'wrong', click: 'select', powerup: 'levelup' };
const PENTA = [0, 2, 4, 7, 9];
const hz = semi => 261.63 * Math.pow(2, semi / 12);

export class KitAudio {
  constructor({ brb = null, win = null, rng = mulberry32(7) } = {}) {
    this.brb = brb; this.win = win; this.rng = rng;
    this.ctx = null; this.out = null; this.sfxGain = null; this.musicGain = null;
    this.volume = { sfx: 0.9, music: 0.45 };
    this.bed = 'off'; this.nextNote = 0; this.stepI = 0;
    this.queue = Promise.resolve(); this.speaking = false;
    this.onCaption = null; this.onTalk = null; this.later = null;   // wired by the kit (captions, mouth flaps, real-time waits)
    this.noiseBuf = null; this._muted = false;
  }
  get muted() {
    const s = this.brb && this.brb.sfx;
    if (s && typeof s.muted === 'boolean') return s.muted;
    return this._muted;
  }
  setMuted(on) {
    const s = this.brb && this.brb.sfx;
    if (s && typeof s.mute === 'function') s.mute(!!on); else this._muted = !!on;
    if (this.musicGain && this.ctx) this.musicGain.gain.setTargetAtTime(on ? 0 : this.volume.music, this.ctx.currentTime, 0.05);
  }
  /** Create the AudioContext (call from a user gesture; the kit wires this to the first tap/key). */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return this.ctx; }
    const W = this.win; const AC = W && (W.AudioContext || W.webkitAudioContext); if (!AC) return null;
    try { this.ctx = new AC(); } catch (e) { return null; }
    const c = this.ctx;
    this.out = c.createDynamicsCompressor(); this.out.connect(c.destination);
    this.sfxGain = c.createGain(); this.sfxGain.gain.value = this.volume.sfx; this.sfxGain.connect(this.out);
    this.musicGain = c.createGain(); this.musicGain.gain.value = this.muted ? 0 : this.volume.music; this.musicGain.connect(this.out);
    const n = c.sampleRate * 0.5; this.noiseBuf = c.createBuffer(1, n, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0); const r = mulberry32(99); for (let i = 0; i < n; i++) d[i] = r() * 2 - 1;
    return c;
  }
  /** sfx(name, {pitchVar=.05, pan:-1..1, volume}) */
  sfx(name, opts = {}) {
    name = String(name);
    if (this.muted) return;
    if (SDK_SFX.includes(name) && this.brb && this.brb.sfx && typeof this.brb.sfx.play === 'function') { try { this.brb.sfx.play(name); } catch (e) { /* ignore */ } return; }
    const voice = VOICES[name] || VOICES[FALLBACK[name]] || VOICES.select;
    const c = this.ctx; if (!c || !this.sfxGain) return;
    const pv = opts.pitchVar == null ? 0.05 : +opts.pitchVar;
    const pitch = (opts.pitch || 1) * (1 + (this.rng() * 2 - 1) * pv);
    let dest = this.sfxGain;
    const g = c.createGain(); g.gain.value = opts.volume == null ? 1 : +opts.volume;
    if (c.createStereoPanner && opts.pan) { const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, +opts.pan || 0)) * 0.6; g.connect(p); p.connect(dest); } else g.connect(dest);
    try { voice(this, g, c.currentTime + 0.005, pitch); } catch (e) { /* ignore */ }
  }
  tone(dest, t, f0, f1, dur, type = 'triangle', vol = 0.2, attack = 0.005) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dest, t, dur, vol = 0.2, f = 1200, q = 0.8, type = 'bandpass', f1 = 0) {
    const c = this.ctx, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; fl.type = type; fl.frequency.setValueAtTime(f, t); if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + dur); fl.Q.value = q;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(dest); s.start(t); s.stop(t + dur + 0.02);
  }
  /** music('meadow' | 'calm' | 'off') */
  music(bed) {
    this.bed = BEDS[bed] ? bed : 'off';
    if (this.ctx) this.nextNote = this.ctx.currentTime + 0.05;
    this.stepI = 0;
  }
  /** Called every frame: schedules the next ~0.25 s of music on the audio clock. */
  tick() {
    const c = this.ctx; if (!c || this.bed === 'off' || this.muted) return;
    const bed = BEDS[this.bed]; const stepDur = 60 / bed.bpm / 2;
    if (this.nextNote < c.currentTime) this.nextNote = c.currentTime + 0.02;
    while (this.nextNote < c.currentTime + 0.25) {
      bed.play(this, this.musicGain, this.nextNote, this.stepI, stepDur);
      this.nextNote += stepDur; this.stepI++;
    }
  }
  /** Hidden page: stop the audio thread (battery); visible again: resume and restart the music clock. */
  suspend() { try { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); } catch (e) { /* ignore */ } }
  resume() { try { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); } catch (e) { /* ignore */ } if (this.ctx) this.nextNote = this.ctx.currentTime + 0.05; }
  duck(on) { if (this.ctx && this.musicGain) this.musicGain.gain.setTargetAtTime(this.muted ? 0 : this.volume.music * (on ? 0.4 : 1), this.ctx.currentTime, 0.08); }
  /** say(text, {lang, who}) -> Promise: queued speech + caption + talk events; resolves when done (or after a timer). */
  say(text, opts = {}) {
    const run = () => new Promise(resolve => {
      text = String(text || ''); if (!text) return resolve();
      this.speaking = true; this.duck(true);
      if (this.onCaption) this.onCaption(text, opts);
      if (this.onTalk) this.onTalk(true, opts.who);
      let done = false;
      const finish = () => { if (done) return; done = true; this.speaking = false; this.duck(false); if (this.onTalk) this.onTalk(false, opts.who); resolve(); };
      const minMs = 700 + text.length * 55;
      let started = false;
      if (opts.readAloud !== false && this.brb && typeof this.brb.speak === 'function' && !this.muted) {
        try { started = !!this.brb.speak(text, { lang: opts.lang, onend: finish }); } catch (e) { started = false; }
      }
      // Without speech (or if onend never fires), the caption still gets its reading time.
      if (this.later) this.later(started ? minMs * 3 + 4000 : minMs, finish); else finish();
    });
    const p = this.queue.then(run, run); this.queue = p; return p;
  }
}

// The kit's 12 voices: short, soft, friendly. Never a buzzer.
const VOICES = {
  pop: (a, d, t, p) => { a.tone(d, t, 520 * p, 880 * p, 0.09, 'sine', 0.35); a.tone(d, t + 0.02, 1100 * p, 0, 0.05, 'triangle', 0.08); },
  whoosh: (a, d, t, p) => a.noise(d, t, 0.22, 0.18, 500 * p, 1.2, 'bandpass', 2400 * p),
  correct: (a, d, t, p) => { a.tone(d, t, 660 * p, 0, 0.12, 'triangle', 0.25); a.tone(d, t + 0.1, 990 * p, 0, 0.22, 'triangle', 0.25); },
  wrong: (a, d, t, p) => { a.tone(d, t, 330 * p, 300 * p, 0.16, 'sine', 0.22); a.tone(d, t + 0.14, 262 * p, 250 * p, 0.24, 'sine', 0.2); },
  spark: (a, d, t, p) => { a.tone(d, t, 1320 * p, 0, 0.07, 'triangle', 0.18); a.tone(d, t + 0.05, 1760 * p, 0, 0.16, 'sine', 0.16); a.tone(d, t + 0.05, 2640 * p, 0, 0.1, 'sine', 0.05); },
  step: (a, d, t, p) => a.noise(d, t, 0.05, 0.08, 900 * p, 2, 'bandpass'),
  land: (a, d, t, p) => { a.noise(d, t, 0.12, 0.2, 300 * p, 0.7, 'lowpass', 120); a.tone(d, t, 140 * p, 70 * p, 0.1, 'sine', 0.2); },
  select: (a, d, t, p) => a.tone(d, t, 880 * p, 0, 0.06, 'triangle', 0.16),
  levelup: (a, d, t, p) => [523, 659, 784, 1047, 1319].forEach((f, i) => a.tone(d, t + i * 0.07, f * p, 0, 0.18, 'triangle', 0.16)),
  count: (a, d, t, p) => a.tone(d, t, 740 * p, 0, 0.12, 'sine', 0.22),
  hurt: (a, d, t, p) => { a.tone(d, t, 300 * p, 140 * p, 0.2, 'triangle', 0.25); a.noise(d, t, 0.1, 0.1, 800, 1, 'bandpass'); },
  win: (a, d, t, p) => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => a.tone(d, t + i * 0.11, f * p, 0, i === 5 ? 0.5 : 0.2, 'triangle', 0.18)),
};
// Music beds: a seeded pentatonic melody over a soft bass, 16-step bars.
const BEDS = {
  meadow: { bpm: 104, play(a, d, t, i, s) {
    const bar = Math.floor(i / 16) % 4, k = i % 16, root = [0, -3, 5, 2][bar];
    if (k % 4 === 0) a.tone(d, t, hz(root - 24), 0, s * 3.5, 'triangle', 0.16, 0.01);
    const h = Math.imul(i * 2654435761, 1) >>> 0;
    if ((h >>> 3) % 3 !== 0 && k % 2 === 0) a.tone(d, t, hz(root + PENTA[(h >>> 7) % 5] + 12 * (1 + ((h >>> 11) & 1))), 0, s * 1.6, 'triangle', 0.07, 0.01);
    if (k === 6 || k === 14) a.noise(d, t, 0.04, 0.025, 6000, 1, 'highpass');
  } },
  calm: { bpm: 72, play(a, d, t, i, s) {
    const bar = Math.floor(i / 16) % 2, k = i % 16, root = bar ? -5 : 0;
    if (k === 0) [0, 4, 7].forEach(n => a.tone(d, t, hz(root + n - 12), 0, s * 14, 'sine', 0.05, 0.4));
    const h = Math.imul(i * 2246822519, 1) >>> 0;
    if (k % 4 === 2 && (h & 3)) a.tone(d, t, hz(root + PENTA[(h >>> 5) % 5] + 12), 0, s * 3, 'sine', 0.06, 0.03);
  } },
};
