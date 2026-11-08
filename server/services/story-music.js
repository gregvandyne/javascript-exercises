// Story Builder: the background music, composed in code (docs/story-builder.md). No samples, no recordings: a seeded
// composer writes a little piece and a small synthesiser plays it through a room reverb. The piece is fitted to the
// video's length exactly (the tempo stretches a little so the last bar lands on the end), and it ducks under the
// narration. Same seed, same length, same mood -> the same samples.
// Moods (MOODS; the person picks one on the story form, story-options.js MUSIC):
//   lullaby    the original: a music-box waltz (3/4, 60-80 bpm; melody over a chord progression, phrase form
//              A A' B A'', a cadence home) on "tines" (inharmonic partials with fast-decaying highs, like a music box comb)
//   playful    a bouncy 4/4 at ~116 bpm: marimba tune on the major pentatonic with skips, plucked bass on 1 and 3,
//              chord stabs and a woodblock tick on 2 and 4
//   adventure  a driving 4/4 at ~100 bpm in a minor key: a horn melody in long notes and leaps, an eighth-note bass
//              ostinato, timpani on 1 and 3
//   magical    a slow, twinkly 3/4 in the Lydian mode: bell (celesta) arpeggios over a soft pad, random high sparkles,
//              a bigger reverb
//   piano      a gentle 4/4 at ~68 bpm: broken chords in the left hand, a stepwise tune in the right, a piano voice
//   none       silence
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
function composeLullaby({ seconds, seed = 1 }) {
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
  return { mood: 'lullaby', meter: 3, key: keyName, bpm: Math.round(bpm * 10) / 10, bars, barSec, notes };
}

/** Whole 4-bar phrases of `meter` beats near `targetBpm`, stretched to end exactly at `seconds`. */
function fit(seconds, meter, targetBpm) {
  let bars = Math.max(4, Math.round(seconds / (meter * 60 / targetBpm)));
  bars = Math.max(4, Math.round(bars / 4) * 4 || 4);
  const barSec = seconds / bars;
  return { bars, barSec, beatSec: barSec / meter, bpm: Math.round((meter * 60 / barSec) * 10) / 10 };
}
const scaleMidi = (tonic, scale, deg) => tonic + 12 * Math.floor(deg / scale.length) + scale[((deg % scale.length) + scale.length) % scale.length];
const nearest = (list, x) => list.reduce((b, d) => (Math.abs(d - x) < Math.abs(b - x) ? d : b), list[0]);
const AEOLIAN = [0, 2, 3, 5, 7, 8, 10];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
const PENTA = [0, 1, 2, 4, 5];   // the major pentatonic, as degrees of the major scale

/** playful: 4/4, a bouncy marimba tune on the major pentatonic, plucked bass on 1 and 3, stabs and a tick on 2 and 4. */
function composePlayful({ seconds, seed }) {
  const R = rng(seed ^ 0x51a7), pick = a => a[Math.floor(R() * a.length)];
  const keyName = pick(['C', 'D', 'F', 'G']), tonic = KEYS[keyName];
  const { bars, barSec, beatSec, bpm } = fit(seconds, 4, 116);
  const progs = [[0, 3, 4, 0], [0, 5, 3, 4], [0, 4, 5, 3]];
  const RH = [[0.5, 0.5, 1, 0.5, 0.5, 1], [1, 0.5, 0.5, 1, 1], [0.5, 0.5, 0.5, 0.5, 2], [1, 1, 0.5, 0.5, 1]];
  const notes = [];
  const progA = pick(progs), progB = pick(progs.filter(p => p !== progA));
  let deg = 7;
  for (let b = 0; b < bars; b++) {
    const prog = Math.floor(b / 4) % 4 === 2 ? progB : progA, ch = b === bars - 1 ? 0 : prog[b % 4];
    const t0 = b * barSec;
    // bass: the root on 1 and the fifth on 3, plucked; chord stabs and a woodblock tick on 2 and 4
    notes.push({ t: t0, midi: midiOf(tonic - 24, ch), vel: 0.7, voice: 'bass', inst: 'pluck', len: beatSec });
    notes.push({ t: t0 + 2 * beatSec, midi: midiOf(tonic - 24, ch + 4), vel: 0.6, voice: 'bass', inst: 'pluck', len: beatSec });
    for (const beat of [1, 3]) {
      for (const d of CHORD(ch)) notes.push({ t: t0 + beat * beatSec, midi: midiOf(tonic, d), vel: 0.3, voice: 'harmony', inst: 'marimba', len: beatSec / 2 });
      notes.push({ t: t0 + beat * beatSec, midi: 96, vel: 0.22, voice: 'perc', inst: 'block', len: 0.05 });
    }
    if (b === bars - 1) { notes.push({ t: t0, midi: midiOf(tonic + 12, 7), vel: 0.9, voice: 'melody', inst: 'marimba', len: barSec }); continue; }
    let beat = 0;
    pick(RH).forEach((len, i) => {
      if (i === 0) deg = nearest(CHORD(ch).flatMap(d => [d, d + 7]), deg);
      else {
        // skip around the pentatonic: up or down one to three of its notes
        const p = PENTA.indexOf(((deg % 7) + 7) % 7);
        const at = (p < 0 ? 0 : p) + Math.floor(deg / 7) * 5 + pick([-2, -1, 1, 1, 2, 3, -3]);
        deg = Math.max(2, Math.min(12, Math.floor(at / 5) * 7 + PENTA[((at % 5) + 5) % 5]));
      }
      notes.push({ t: t0 + beat * beatSec, midi: midiOf(tonic + 12, deg), vel: i === 0 ? 0.85 : 0.7, voice: 'melody', inst: 'marimba', len: len * beatSec });
      beat += len;
    });
  }
  notes.sort((a, b) => a.t - b.t || a.midi - b.midi);
  return { mood: 'playful', meter: 4, key: keyName, bpm, bars, barSec, notes };
}

/** adventure: 4/4 in a minor key, a horn melody in long notes and leaps, an eighth-note bass ostinato, timpani. */
function composeAdventure({ seconds, seed }) {
  const R = rng(seed ^ 0xad7e), pick = a => a[Math.floor(R() * a.length)];
  const keyName = pick(['D', 'C', 'Eb']), tonic = KEYS[keyName];
  const { bars, barSec, beatSec, bpm } = fit(seconds, 4, 100);
  const progs = [[0, 5, 6, 0], [0, 3, 5, 6], [0, 6, 5, 4]];   // i-VI-VII-i, i-iv-VI-VII, i-VII-VI-v
  const RH = [[2, 1, 1], [1.5, 0.5, 2], [3, 1], [1, 1, 2], [4]];
  const notes = [];
  const progA = pick(progs), progB = pick(progs.filter(p => p !== progA));
  let deg = 7;
  for (let b = 0; b < bars; b++) {
    const prog = Math.floor(b / 4) % 4 === 2 ? progB : progA, ch = b === bars - 1 ? 0 : prog[b % 4];
    const t0 = b * barSec, root = scaleMidi(tonic - 24, AEOLIAN, ch), fifth = scaleMidi(tonic - 24, AEOLIAN, ch + 4);
    // the ostinato in eighths: root, root, octave, fifth
    for (let e = 0; e < 8; e++) notes.push({ t: t0 + e * beatSec / 2, midi: [root, root, root + 12, fifth][e % 4], vel: e % 2 ? 0.42 : 0.58, voice: 'bass', inst: 'pluck', len: beatSec / 2 });
    notes.push({ t: t0, midi: root - 12, vel: 0.9, voice: 'perc', inst: 'timpani', len: beatSec });
    notes.push({ t: t0 + 2 * beatSec, midi: scaleMidi(tonic - 36, AEOLIAN, 4), vel: 0.6, voice: 'perc', inst: 'timpani', len: beatSec });
    // a held low-brass chord under the tune
    for (const d of [ch, ch + 2, ch + 4]) notes.push({ t: t0, midi: scaleMidi(tonic - 12, AEOLIAN, d), vel: 0.22, voice: 'harmony', inst: 'horn', len: barSec * 0.95 });
    if (b === bars - 1) { notes.push({ t: t0, midi: scaleMidi(tonic, AEOLIAN, 7), vel: 0.85, voice: 'melody', inst: 'horn', len: barSec }); continue; }
    let beat = 0;
    pick(RH).forEach((len, i) => {
      const tones = [ch, ch + 2, ch + 4].flatMap(d => [d, d + 7]);
      deg = i === 0 ? nearest(tones, deg + pick([-3, 3, 4, -2, 2])) : Math.max(4, Math.min(12, deg + pick([-4, -1, 1, 2, 3, 4])));
      notes.push({ t: t0 + beat * beatSec, midi: scaleMidi(tonic, AEOLIAN, deg), vel: i === 0 ? 0.8 : 0.68, voice: 'melody', inst: 'horn', len: len * beatSec * 0.97 });
      beat += len;
    });
  }
  notes.sort((a, b) => a.t - b.t || a.midi - b.midi);
  return { mood: 'adventure', meter: 4, key: `${keyName}m`, bpm, bars, barSec, notes };
}

/** magical: a slow, twinkly 3/4 in the Lydian mode: bell arpeggios over a soft pad, with high sparkles. */
function composeMagical({ seconds, seed }) {
  const R = rng(seed ^ 0x3a61), pick = a => a[Math.floor(R() * a.length)];
  const keyName = pick(['D', 'F', 'Eb']), tonic = KEYS[keyName] + 12;
  const { bars, barSec, beatSec, bpm } = fit(seconds, 3, 66);
  const prog = pick([[0, 1, 0, 4], [0, 1, 5, 4], [0, 4, 1, 0]]);   // I-II-I-V: the raised fourth makes it shimmer
  const notes = [];
  for (let b = 0; b < bars; b++) {
    const ch = b === bars - 1 ? 0 : prog[b % 4], t0 = b * barSec;
    for (const d of [ch, ch + 2, ch + 4]) notes.push({ t: t0, midi: scaleMidi(tonic - 24, LYDIAN, d), vel: 0.3, voice: 'harmony', inst: 'pad', len: barSec });
    // an arpeggio in eighths across two octaves, up in one bar and down in the next
    const tones = [ch, ch + 2, ch + 4, ch + 7, ch + 9, ch + 7];
    for (let e = 0; e < 6; e++) {
      const d = b % 2 === 0 ? tones[e] : tones[5 - e];
      notes.push({ t: t0 + e * beatSec / 2, midi: scaleMidi(tonic - 12, LYDIAN, d), vel: e === 0 ? 0.6 : 0.42, voice: 'melody', inst: 'bell', len: beatSec / 2 });
    }
    // sparkles: one or two very high notes somewhere in the bar
    const k = 1 + Math.floor(R() * 2);
    for (let i = 0; i < k; i++) notes.push({ t: t0 + R() * barSec * 0.9, midi: scaleMidi(tonic + 12, LYDIAN, pick([0, 2, 4, 6, 7])), vel: 0.25 + R() * 0.15, voice: 'sparkle', inst: 'bell', len: beatSec });
  }
  notes.sort((a, b) => a.t - b.t || a.midi - b.midi);
  return { mood: 'magical', meter: 3, key: `${keyName} lydian`, bpm, bars, barSec, notes };
}

/** piano: a gentle 4/4: broken chords in the left hand, a stepwise tune in the right. */
function composePiano({ seconds, seed }) {
  const R = rng(seed ^ 0x9a40), pick = a => a[Math.floor(R() * a.length)];
  const keyName = pick(['C', 'F', 'G', 'Eb']), tonic = KEYS[keyName];
  const { bars, barSec, beatSec, bpm } = fit(seconds, 4, 68);
  const progs = [[0, 4, 5, 3], [0, 5, 3, 4], [0, 3, 0, 4]];
  const RH = [[2, 2], [1, 1, 2], [3, 1], [2, 1, 1], [4]];
  const notes = [];
  const progA = pick(progs), progB = pick(progs.filter(p => p !== progA));
  let deg = 9;
  for (let b = 0; b < bars; b++) {
    const prog = Math.floor(b / 4) % 4 === 2 ? progB : progA, ch = b === bars - 1 ? 0 : prog[b % 4];
    const t0 = b * barSec;
    // left hand in eighths: root, fifth, tenth, fifth
    const lh = [midiOf(tonic - 12, ch), midiOf(tonic - 12, ch + 4), midiOf(tonic - 12, ch + 9), midiOf(tonic - 12, ch + 4)];
    for (let e = 0; e < 8; e++) notes.push({ t: t0 + e * beatSec / 2, midi: lh[e % 4], vel: e % 4 === 0 ? 0.5 : 0.34, voice: 'harmony', inst: 'piano', len: beatSec / 2 });
    if (b === bars - 1) { for (const d of [7, 9, 11]) notes.push({ t: t0 + (d - 7) * 0.03, midi: midiOf(tonic, d), vel: 0.6, voice: 'melody', inst: 'piano', len: barSec }); continue; }
    let beat = 0;
    pick(RH).forEach((len, i) => {
      deg = i === 0 ? nearest(CHORD(ch).flatMap(d => [d + 7, d + 14]), deg) : Math.max(5, Math.min(14, deg + pick([-1, -1, 1, 1, 2, -2])));
      notes.push({ t: t0 + beat * beatSec, midi: midiOf(tonic, deg), vel: i === 0 ? 0.72 : 0.6, voice: 'melody', inst: 'piano', len: len * beatSec });
      beat += len;
    });
  }
  notes.sort((a, b) => a.t - b.t || a.midi - b.midi);
  return { mood: 'piano', meter: 4, key: keyName, bpm, bars, barSec, notes };
}

/** The moods: how each is composed, its reverb and its level (a held horn is louder at the same peak than a tine). */
export const MOODS = {
  lullaby: { compose: composeLullaby, reverb: 0.28, level: 1 },
  playful: { compose: composePlayful, reverb: 0.18, level: 0.85 },
  adventure: { compose: composeAdventure, reverb: 0.24, level: 0.72 },
  magical: { compose: composeMagical, reverb: 0.45, level: 0.85 },
  piano: { compose: composePiano, reverb: 0.26, level: 0.9 },
  none: null,
};
export const MOOD_NAMES = Object.keys(MOODS);

/**
 * Compose: { seconds, seed, mood } -> { mood, meter, key, bpm, bars, barSec, notes: [{ t, midi, vel, voice, inst, len }] }.
 * Whole 4-bar phrases; the piece ends home on its last bar. mood 'none' -> no notes; an unknown mood -> the lullaby.
 */
export function compose({ seconds, seed = 1, mood = 'lullaby' }) {
  if (mood === 'none') { const f = fit(seconds, 4, 60); return { mood: 'none', meter: 4, key: '', bpm: f.bpm, bars: f.bars, barSec: f.barSec, notes: [] }; }
  return (MOODS[mood] || MOODS.lullaby).compose({ seconds, seed });
}

// Instruments: partials as [ratio, amplitude, decay seconds at C5] (higher notes ring shorter, except held ones).
// sustain: the note holds until its length is up, then releases (horn, pad); damped: it rings but is damped at its
// end (a piano key let go); otherwise it rings and decays (tine, marimba, bell). glide: the pitch drops at the start
// (a timpani); vibrato: a slow wobble (a horn); noise: a soft mallet thump.
const PARTIALS = [[1, 1, 2.2], [2.0, 0.22, 1.1], [3.0, 0.08, 0.6], [5.4, 0.16, 0.28], [8.93, 0.05, 0.12]];
const PIANO = Array.from({ length: 7 }, (_, i) => { const n = i + 1; return [n * Math.sqrt(1 + 0.0003 * n * n), 1 / n ** 1.3, 2.6 / n ** 0.6]; });
const HORN = Array.from({ length: 6 }, (_, i) => { const n = i + 1; return [n, 1 / n ** 1.5, 30]; });
export const INSTRUMENTS = {
  tine: { partials: PARTIALS, attack: 0.0015, gain: { bass: 0.55, harmony: 0.5, melody: 0.6 }, bassRing: 1.3 },
  marimba: { partials: [[1, 1, 0.45], [3.93, 0.32, 0.12], [9.2, 0.07, 0.04]], attack: 0.002, gain: { harmony: 0.5, melody: 0.65 } },
  pluck: { partials: [[1, 1, 0.5], [2, 0.45, 0.25], [3, 0.2, 0.14], [4, 0.08, 0.08]], attack: 0.003, gain: { bass: 0.7 } },
  block: { partials: [[1, 1, 0.035], [2.31, 0.6, 0.02], [3.9, 0.3, 0.012]], attack: 0.0005, gain: { perc: 0.5 } },
  horn: { partials: HORN, attack: 0.07, sustain: true, release: 0.22, gain: { melody: 0.42, harmony: 0.32 }, vibrato: 4.8 },
  pad: { partials: [[1, 1, 30], [2, 0.25, 30], [3, 0.08, 30]], attack: 0.6, sustain: true, release: 1.2, gain: { harmony: 0.22 } },
  bell: { partials: [[1, 1, 1.9], [2.76, 0.32, 0.7], [5.4, 0.14, 0.32], [8.93, 0.06, 0.14]], attack: 0.001, gain: { melody: 0.55, sparkle: 0.5 } },
  piano: { partials: PIANO, attack: 0.004, damped: true, release: 0.35, gain: { melody: 0.6, harmony: 0.42 } },
  timpani: { partials: [[1, 1, 0.55], [1.5, 0.4, 0.35], [1.98, 0.2, 0.25]], attack: 0.002, glide: 0.35, noise: 0.25, gain: { perc: 0.9 } },
};

/** Render notes to mono samples (Float32Array, SR) of exactly `seconds`. A note without `inst` is a music-box tine. */
export function synth(notes, seconds) {
  const n = Math.round(seconds * SR);
  const out = new Float32Array(n);
  for (const note of notes) {
    const inst = INSTRUMENTS[note.inst] || INSTRUMENTS.tine;
    const f0 = hz(note.midi);
    if (f0 * 2 > SR / 2) continue;
    const start = Math.round(note.t * SR);
    if (start >= n) continue;
    const pitchK = Math.pow(523 / f0, 0.5);
    const ringK = note.voice === 'bass' && inst.bassRing ? inst.bassRing : 1;
    const amp = note.vel * ((inst.gain && inst.gain[note.voice]) || 0.5);
    const atk = Math.max(1, Math.round(inst.attack * SR));
    const held = inst.sustain || inst.damped;
    const noteLen = Math.round((note.len || 0.3) * SR);
    // how long it can sound: a held note to its end plus its release; a ringing note five times its longest decay
    const ring = held ? noteLen + Math.round(inst.release * 6 * SR) : Math.round(inst.partials[0][2] * (inst.glide ? 1 : pitchK) * ringK * 5 * SR);
    const len = Math.min(n - start, ring);
    const relK = held ? Math.exp(-1 / (inst.release * SR)) : 1;
    for (const [ratio, a, decay] of inst.partials) {
      const f = f0 * ratio;
      if (f >= SR / 2 * 0.95) continue;
      const d = decay * (inst.sustain || inst.glide ? 1 : pitchK);
      const k = Math.exp(-1 / (d * SR));
      let env = a * amp, rel = 1, s = 0, c = 1;
      let w = 2 * Math.PI * f / SR, cw = Math.cos(w), sw = Math.sin(w);
      const moving = inst.glide || inst.vibrato;
      for (let i = 0; i < len; i++) {
        // a pitch that moves (a timpani's drop, a horn's slow vibrato): the step is updated every 16 samples
        if (moving && (i & 15) === 0) {
          const tt = i / SR;
          w = 2 * Math.PI * f * (inst.glide ? 1 + inst.glide * Math.exp(-tt / 0.04) : 1 + 0.004 * Math.sin(2 * Math.PI * inst.vibrato * tt) * Math.min(1, tt / 0.3)) / SR;
          cw = Math.cos(w); sw = Math.sin(w);
        }
        if (held && i > noteLen) rel *= relK;
        out[start + i] += s * env * rel * (i < atk ? i / atk : 1);
        // rotate (s, c) by w: a sine without calling Math.sin per sample
        const ns = s * cw + c * sw; c = c * cw - s * sw; s = ns;
        env *= k;
        if (env * rel < 1e-5) break;
      }
    }
    if (inst.noise) {
      // a soft felt-mallet thump: a short burst of low-passed noise
      const R = rng(start + 17);
      let lp = 0;
      for (let i = 0, nl = Math.min(len, Math.round(0.08 * SR)); i < nl; i++) { lp = lp * 0.8 + (R() * 2 - 1) * 0.2; out[start + i] += lp * amp * inst.noise * Math.exp(-i / (0.02 * SR)); }
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
 * The finished bed: { seconds, seed, duck: [[start, end]], volume, mood } -> { left, right, info }. Normalised to
 * `volume` peak (times the mood's level), a 1.2 s fade in, a 2.5 s fade out, and ducked under every narration span.
 * mood 'none' -> silence of the right length (the assembly still mixes it in, so nothing else changes).
 */
export function bed({ seconds, seed = 1, duck = [], volume = 0.5, mood = 'lullaby' }) {
  const m = Object.hasOwn(MOODS, mood) ? mood : 'lullaby';
  if (m === 'none') { const n = Math.round(seconds * SR); return { left: new Float32Array(n), right: new Float32Array(n), info: { mood: 'none', notes: 0 } }; }
  const piece = compose({ seconds, seed, mood: m });
  const [L, R] = reverb(synth(piece.notes, seconds), { mix: MOODS[m].reverb });
  let peak = 1e-9;
  for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const g0 = (volume * MOODS[m].level) / peak, n = L.length, fin = 1.2 * SR, fout = 2.5 * SR;
  for (let i = 0; i < n; i++) {
    let g = g0;
    if (i < fin) g *= i / fin;
    if (i > n - fout) g *= Math.max(0, (n - i) / fout);
    const d = duck.length ? duckGain(duck, i / SR) : 1;
    L[i] *= g * d; R[i] *= g * d;
  }
  return { left: L, right: R, info: { mood: m, key: piece.key, bpm: piece.bpm, bars: piece.bars, notes: piece.notes.length } };
}
/** The music-box lullaby (the original mood). */
export const lullaby = o => bed({ ...o, mood: 'lullaby' });

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
