// Story Builder: a music-box lullaby composed in code (docs/story-builder.md). No samples, no recordings: a seeded
// composer writes a little waltz (melody over a chord progression, phrase form A A' B A'', a cadence home at the end)
// and a synthesiser plays it on "tines" (a few inharmonic partials with fast-decaying highs, like a music box comb),
// through a small room reverb. The piece is fitted to the video's length exactly (the tempo stretches a little so the
// last bar lands on the end), and it ducks under the narration. Same seed, same length -> the same samples.
import fs from 'node:fs';
import { duckGain } from './story-captions.js';

export const SR = 32000;

/** mulberry32: small, fast, deterministic. */
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** A number from a string (a story id) for the seed. */
export const seedOf = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const KEYS = { C: 60, D: 62, F: 65, G: 67, Eb: 63 };
// Chords as scale degrees (0-based): I, ii, iii, IV, V, vi
const CHORD = d => [d, d + 2, d + 4];
const PROGRESSIONS = [[0, 5, 3, 4], [0, 3, 0, 4], [5, 3, 0, 4], [0, 3, 5, 4], [0, 1, 4, 0]];
const RHYTHMS = [[1.5, 0.5, 1], [2, 1], [1, 1, 1], [3], [1, 0.5, 0.5, 1], [0.5, 0.5, 1, 1]];

/** Scale degree -> MIDI note in a key (degrees may go below 0 or above 6). */
export const midiOf = (tonic, deg) => tonic + 12 * Math.floor(deg / 7) + MAJOR[((deg % 7) + 7) % 7];
const hz = m => 440 * 2 ** ((m - 69) / 12);

/**
 * Compose: { seconds, seed } -> { key, bpm, bars, barSec, notes: [{ t, midi, vel, voice }] }. 3/4 time; phrases of 4 bars.
 * The melody moves mostly by step, lands on chord tones on the downbeat, and its phrase A comes back (varied), so it
 * sounds like a tune rather than random notes. The last bar is the tonic, held.
 */
export function compose({ seconds, seed = 1 }) {
  const R = rng(seed);
  const pick = a => a[Math.floor(R() * a.length)];
  const keyName = pick(Object.keys(KEYS));
  const tonic = KEYS[keyName] + 12; // the melody sits around C6: music boxes are high
  // bars of 3 beats at 60-80 bpm, rounded so the music ends with the video
  let bars = Math.max(4, Math.round(seconds / (3 * 60 / 70)));
  bars = Math.max(4, Math.round(bars / 4) * 4 || 4);
  const barSec = seconds / bars, bpm = 180 / barSec;
  const phrasesN = bars / 4;
  const progA = pick(PROGRESSIONS), progB = pick(PROGRESSIONS.filter(p => p !== progA));
  const makePhrase = (prog, start, cadence) => {
    const out = [];
    let deg = start;
    prog.forEach((ch, b) => {
      const rhythm = b === 3 && cadence ? [3] : pick(RHYTHMS);
      let beat = 0;
      rhythm.forEach((len, i) => {
        const tones = CHORD(ch).flatMap(d => [d, d + 7]);
        if (i === 0) {
          // downbeat: the chord tone nearest the last note
          deg = tones.reduce((best, d) => (Math.abs(d - deg) < Math.abs(best - deg) ? d : best), tones[0]);
        } else {
          const step = pick([-2, -1, -1, 1, 1, 2]);
          deg = Math.max(0, Math.min(10, deg + step));
        }
        if (b === 3 && cadence && i === 0) deg = cadence === 'home' ? 7 : tones.includes(4) ? 4 : tones[0];
        out.push({ bar: b, beat, len, deg });
        beat += len;
      });
    });
    return out;
  };
  const A = makePhrase(progA, 7, 'half');
  const forms = [];
  for (let p = 0; p < phrasesN; p++) {
    const last = p === phrasesN - 1;
    if (last) forms.push({ prog: progA, mel: makePhrase(progA.slice(0, 3).concat([0]), 7, 'home') });
    else if (p % 4 === 2) forms.push({ prog: progB, mel: makePhrase(progB, 9, 'half') });
    else if (p % 4 === 1) { const v = A.map(n => ({ ...n })); v.slice(-2).forEach(n => { n.deg = Math.max(0, n.deg - 1); }); forms.push({ prog: progA, mel: v }); }
    else forms.push({ prog: progA, mel: A });
  }
  const beatSec = barSec / 3;
  const notes = [];
  forms.forEach((ph, p) => {
    const bar0 = p * 4;
    for (const n of ph.mel) notes.push({ t: (bar0 + n.bar) * barSec + n.beat * beatSec, midi: midiOf(tonic, n.deg), vel: n.beat === 0 ? 0.9 : 0.72, voice: 'melody', len: n.len * beatSec });
    ph.prog.forEach((ch, b) => {
      const root = midiOf(tonic - 24, ch);
      const third = midiOf(tonic - 12, ch + 2), fifth = midiOf(tonic - 12, ch + 4);
      const t0 = (bar0 + b) * barSec;
      notes.push({ t: t0, midi: root, vel: 0.55, voice: 'bass', len: barSec });
      notes.push({ t: t0 + beatSec, midi: fifth, vel: 0.38, voice: 'harmony', len: beatSec });
      notes.push({ t: t0 + 2 * beatSec, midi: third, vel: 0.36, voice: 'harmony', len: beatSec });
    });
  });
  // the final chord, rolled
  const end = bars * barSec - barSec;
  [midiOf(tonic - 12, 0), midiOf(tonic - 12, 2), midiOf(tonic - 12, 4)].forEach((m, i) => notes.push({ t: end + 0.06 * i, midi: m, vel: 0.4, voice: 'harmony', len: barSec }));
  notes.sort((a, b) => a.t - b.t || a.midi - b.midi);
  return { key: keyName, bpm: Math.round(bpm * 10) / 10, bars, barSec, notes };
}

// Tine partials (ratio, amplitude, decay seconds at C5): a music box comb's bright, inharmonic ring.
const PARTIALS = [[1, 1, 2.2], [2.0, 0.22, 1.1], [3.0, 0.08, 0.6], [5.4, 0.16, 0.28], [8.93, 0.05, 0.12]];

/** Render notes to mono samples (Float32Array, SR) of exactly `seconds`. */
export function synth(notes, seconds) {
  const n = Math.round(seconds * SR);
  const out = new Float32Array(n);
  for (const note of notes) {
    const f0 = hz(note.midi);
    if (f0 * 8.93 > SR / 2 * 0.95 && f0 * 2 > SR / 2) continue;
    const start = Math.round(note.t * SR);
    const pitchK = Math.pow(523 / f0, 0.5); // higher notes ring shorter
    const amp = note.vel * (note.voice === 'bass' ? 0.55 : note.voice === 'harmony' ? 0.5 : 0.6);
    const maxDecay = PARTIALS[0][2] * pitchK * (note.voice === 'bass' ? 1.3 : 1);
    const len = Math.min(n - start, Math.round(maxDecay * 5 * SR));
    for (const [ratio, a, decay] of PARTIALS) {
      const f = f0 * ratio;
      if (f >= SR / 2 * 0.95) continue;
      const w = 2 * Math.PI * f / SR, d = decay * pitchK;
      const k = Math.exp(-1 / (d * SR));
      let env = a * amp, s = 0, c = 1;
      const cw = Math.cos(w), sw = Math.sin(w);
      for (let i = 0; i < len; i++) {
        const atk = i < 48 ? i / 48 : 1;
        out[start + i] += s * env * atk;
        // rotate (s, c) by w: a sine without calling Math.sin per sample
        const ns = s * cw + c * sw; c = c * cw - s * sw; s = ns;
        env *= k;
        if (env < 1e-5) break;
      }
    }
  }
  return out;
}

/** A small room: four combs and two allpasses (Schroeder), different lengths per side for width. -> [L, R] */
export function reverb(dry, { mix = 0.28 } = {}) {
  const side = (combs, aps) => {
    const n = dry.length, wet = new Float32Array(n);
    for (const [len, fb] of combs) {
      const buf = new Float32Array(len); let i = 0, lp = 0;
      for (let t = 0; t < n; t++) { const y = buf[i]; lp = y * 0.7 + lp * 0.3; buf[i] = dry[t] + lp * fb; wet[t] += y * 0.25; i = (i + 1) % len; }
    }
    for (const len of aps) {
      const buf = new Float32Array(len); let i = 0;
      for (let t = 0; t < n; t++) { const b = buf[i]; const y = -wet[t] + b; buf[i] = wet[t] + b * 0.5; wet[t] = y; i = (i + 1) % len; }
    }
    const out = new Float32Array(n);
    for (let t = 0; t < n; t++) out[t] = dry[t] * (1 - mix) + wet[t] * mix;
    return out;
  };
  const s = SR / 44100;
  return [side([[1116, 0.84], [1188, 0.83], [1277, 0.82], [1356, 0.81]].map(([l, f]) => [Math.round(l * s), f]), [556, 441].map(l => Math.round(l * s))),
    side([[1139, 0.84], [1211, 0.83], [1300, 0.82], [1379, 0.81]].map(([l, f]) => [Math.round(l * s), f]), [579, 464].map(l => Math.round(l * s)))];
}

/**
 * The finished bed: { seconds, seed, duck: [[start, end]], volume } -> { left, right, info }. Normalised to `volume` peak,
 * a 1.2 s fade in, a 2.5 s fade out, and ducked under every narration span.
 */
export function lullaby({ seconds, seed = 1, duck = [], volume = 0.5 }) {
  const piece = compose({ seconds, seed });
  const [L, R] = reverb(synth(piece.notes, seconds));
  let peak = 1e-9;
  for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const g0 = volume / peak, n = L.length, fin = 1.2 * SR, fout = 2.5 * SR;
  for (let i = 0; i < n; i++) {
    let g = g0;
    if (i < fin) g *= i / fin;
    if (i > n - fout) g *= Math.max(0, (n - i) / fout);
    const d = duck.length ? duckGain(duck, i / SR) : 1;
    L[i] *= g * d; R[i] *= g * d;
  }
  return { left: L, right: R, info: { key: piece.key, bpm: piece.bpm, bars: piece.bars, notes: piece.notes.length } };
}

/** 16-bit PCM WAV bytes from float channels. */
export function wavBytes(channels, sr = SR) {
  const n = channels[0].length, ch = channels.length;
  const buf = Buffer.alloc(44 + n * ch * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * ch * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(ch, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * ch * 2, 28); buf.writeUInt16LE(ch * 2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * ch * 2, 40);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const v = Math.max(-1, Math.min(1, channels[c][i])); buf.writeInt16LE(Math.round(v * 32767), o); o += 2; }
  return buf;
}
export const writeWav = (file, channels, sr = SR) => fs.writeFileSync(file, wavBytes(channels, sr));
