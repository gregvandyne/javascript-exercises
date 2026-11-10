// Popcorn Hush (seed-games/popcorn-hush.html): the level maths (dBFS to the gauge, smoothing), the room calibration and
// the "too loud" line (the same numbers as Remi's Quiet Meadow), the popcorn step by step (calm, sizzling, a pop-out,
// louder pops faster, cooling down, popping again while it cools, the goal), stars, the game's words in all 13
// languages, the scan, and child safety in the file itself (it never asks for the microphone and never records: the
// play page measures and passes a number).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { scanVersion } from '../../server/services/scanner.js';

const html = fs.readFileSync('seed-games/popcorn-hush.html', 'utf8');
const LANGS = ['en', 'en-GB', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'ru', 'ja', 'zh-Hant', 'ar', 'he'];
const block = html.slice(html.indexOf('/* popcorn-core:begin */'), html.indexOf('/* popcorn-core:end */'));
const box = { window: {} }; vm.runInNewContext(block, box);
const C = box.window.PopcornCore;

/** Run the core for `sec` seconds of a level function (t -> 0..100), smoothed like the game, at 20 steps a second. */
function run(s, sec, levelAt, { line = 50, held = () => false, dt = 0.05, start = 0, lv = { v: 0 } } = {}) {
  const ev = [];
  for (let i = 0; i < Math.round(sec / dt); i++) {
    const t = start + i * dt;
    lv.v = C.smooth(lv.v, levelAt(t), dt);
    const r = C.step(s, { level: lv.v, line, held: held(t), dt, rnd: (i * 0.37) % 1 });
    for (const e of r.events) ev.push({ ...e, t: Math.round(t * 100) / 100, state: s.state });
  }
  return ev;
}
const types = ev => ev.map(e => e.type);
const count = (ev, type) => ev.filter(e => e.type === type).length;
/** A pot that has popped once and is still popping (2.2 s too loud, then more noise). */
function popping(extra = 3, level = 90) { const s = C.make(); run(s, 2.2, () => level); run(s, extra, () => level); return s; }

test('dB to the gauge: -70 dBFS is 0, -10 is 100, clamped, and louder is always higher', () => {
  assert.equal(C.levelOf(-70), 0); assert.equal(C.levelOf(-10), 100); assert.equal(C.levelOf(-40), 50);
  assert.equal(C.levelOf(-100), 0); assert.equal(C.levelOf(0), 100); assert.equal(C.levelOf(NaN), 0); assert.equal(C.levelOf('x'), 0);
  let prev = -1; for (let db = -100; db <= 0; db += 0.5) { const l = C.levelOf(db); assert.ok(l >= prev); prev = l; }
});

test('smoothing: up fast (attack 0.12 s), down slowly (release 0.5 s), the same at any frame rate', () => {
  const reach = (from, to, dt) => { let v = from, t = 0; while (Math.abs(v - from) < Math.abs(to - from) * 0.632) { v = C.smooth(v, to, dt); t += dt; } return t; };
  for (const dt of [1 / 60, 1 / 30, 0.05]) {
    assert.ok(Math.abs(reach(0, 100, dt) - C.ATTACK) < 0.05, `attack ${dt}`);
    assert.ok(Math.abs(reach(100, 0, dt) - C.RELEASE) < 0.06, `release ${dt}`);
  }
  assert.equal(C.smooth(10, 50, 0), 10, 'no time, no change');
});

test('the line: the room\'s quiet plus the preset plus the fine slider, kept on the gauge (Remi\'s numbers)', () => {
  assert.equal(C.line(30, 'whisper', 0), 40); assert.equal(C.line(30, 'quiet', 0), 48); assert.equal(C.line(30, 'group', 0), 60);
  assert.equal(C.line(undefined, 'quiet', 0), 48, 'uncalibrated: the room counts as 30');
  assert.equal(C.line(30, 'quiet', 10), 58); assert.equal(C.line(30, 'quiet', -10), 38);
  assert.equal(C.line(30, 'quiet', 99), 73, 'fine is capped at +25'); assert.equal(C.line(30, 'quiet', -99), 23);
  assert.equal(C.line(0, 'whisper', -25), 15, 'never under 15'); assert.equal(C.line(70, 'group', 25), 95, 'never over 95');
  assert.equal(C.line(30, 'bogus', 0), 48, 'an unknown preset is Quiet work');
  assert.deepEqual([...C.GOALS], [120, 300, 600, 900, 1200, 1800, 0], 'goals: 2, 5, 10, 15, 20, 30 min or none');
});

test('calibration: the median of the room, too loud refused, no input refused', () => {
  const r = C.calibrate([22, 24, 90, 23, 25, 21, 24]);   // a cough does not move the median
  assert.deepEqual({ ok: r.ok, base: r.base }, { ok: true, base: 24 });
  assert.equal(C.line(r.base, 'quiet', 0), 42);
  assert.equal(C.calibrate([75, 80, 78, 77, 81]).why, 'tooLoud');
  assert.equal(C.calibrate([]).why, 'noInput'); assert.equal(C.calibrate([20, 21]).why, 'noInput', 'too few samples');
  assert.equal(C.median([3, 1, 2, 4]), 2.5); assert.equal(C.median([]), null);
});

test('the same maths as Remi\'s Quiet Meadow, number for number', () => {
  const r = fs.readFileSync('seed-games/remis-quiet-meadow.html', 'utf8');
  const rb = { window: {} }; vm.runInNewContext(r.slice(r.indexOf('/* remi-core:begin */'), r.indexOf('/* remi-core:end */')), rb);
  const R = rb.window.RemiCore;
  for (const db of [-90, -70, -55.5, -40, -22, -10, 0]) assert.equal(C.levelOf(db), R.levelOf(db));
  for (const [a, b, dt] of [[0, 90, 0.05], [90, 10, 0.05], [40, 41, 1 / 60]]) assert.equal(C.smooth(a, b, dt), R.smooth(a, b, dt));
  for (const p of ['whisper', 'quiet', 'group']) for (const f of [-25, 0, 13]) for (const b of [12, 30, 55]) assert.equal(C.line(b, p, f), R.line(b, p, f));
  assert.deepEqual({ ...C.calibrate([30, 31, 29, 33, 28, 30]) }, { ...R.calibrate([30, 31, 29, 33, 28, 30]) });
  assert.deepEqual([C.T.near, C.T.pop, C.T.leak, C.T.calm, C.T.calmBand, C.T.sizzleCool], [R.T.near, R.T.wake, R.T.leak, R.T.calm, R.T.calmBand, R.T.stirCool]);
});

test('silence: the popcorn rests and the quiet clock counts', () => {
  const s = C.make({ goal: 0 }); const ev = run(s, 30, () => 20);
  assert.equal(s.state, 'calm'); assert.equal(s.popouts, 0); assert.equal(s.popped, 0); assert.ok(Math.abs(s.quiet - 30) < 0.06); assert.deepEqual(ev, []);
});

test('a single clap makes the kernels sizzle at most: nothing pops', () => {
  const s = C.make(); const ev = run(s, 6, t => (t >= 1 && t < 1.2 ? 95 : 20));
  assert.equal(s.popouts, 0); assert.equal(s.popped, 0); assert.ok(!ev.some(e => e.type === 'popout' || e.type === 'pop'));
  assert.ok(ev.some(e => e.type === 'sizzle'), 'they sizzle'); assert.equal(s.state, 'calm', 'and rest again');
});

test('getting close to the line: the kernels sizzle (a wiggle, a hiss, a hop, steam) with gaps; the clock still runs', () => {
  const s = C.make(); const ev = run(s, 10, () => 45);   // line 50, near band 40..50
  const sz = ev.filter(e => e.type === 'sizzle');
  assert.equal(s.state, 'sizzle'); assert.equal(s.popouts, 0); assert.equal(s.popped, 0);
  assert.ok(sz.length >= 3 && sz.length <= 5, `a sizzle every ~2.5 s (${sz.length})`);
  for (const e of sz) assert.ok(C.SIZZLES.includes(e.act));
  assert.deepEqual([...new Set(sz.map(e => e.act))].length > 1, true, 'not always the same sizzle');
  assert.ok(s.quiet > 9.9, 'sizzling is still calm: the clock runs');
});

test('1.6 s over the line: one pop-out, then popcorn pops (the first burst cannot be cut short)', () => {
  const s = C.make(); const ev = run(s, 4, t => (t < 2.2 ? 85 : 20));
  assert.equal(count(ev, 'popout'), 1); assert.equal(s.popouts, 1);
  const p = ev.find(e => e.type === 'popout'); assert.ok(p.t > 1.5 && p.t < 2.2, `pops after about 1.5 s over the line (${p.t})`);
  const pops = ev.filter(e => e.type === 'pop');
  assert.ok(pops.length >= 6, `a burst of popcorn (${pops.length})`);
  assert.ok(pops.every(e => e.t >= p.t), 'nothing pops before the pop-out');
  assert.deepEqual(pops.map(e => e.n), pops.map((e, i) => i + 1), 'the popcorn count goes up one by one');
  assert.equal(s.popped, pops.length); assert.equal(s.state, 'popping');
  const inBurst = pops.filter(e => e.t < p.t + C.T.burst).length;
  assert.ok(inBurst >= 6, `the room went quiet at 2.2 s, the burst still popped (${inBurst})`);
});

test('noise on 70% of the time still pops it (the over-the-line count is leaky, not reset)', () => {
  const s = C.make(); run(s, 4, t => ((t % 1) < 0.7 ? 92 : 10));
  assert.equal(s.popouts, 1);
});

test('the louder, the faster it pops; the heat and the rate', () => {
  assert.equal(C.rate(0), 0); assert.equal(C.rate(C.T.minHeat - 0.01), 0);
  assert.ok(Math.abs(C.rate(0.45) - 5.95) < 1e-9); assert.equal(C.rate(1), C.T.maxRate);
  assert.equal(C.heatFor(20, 50), 0, 'far under the line: no heat'); assert.equal(C.heatFor(45, 50), 0.2, 'just under it: a little');
  assert.ok(Math.abs(C.heatFor(51, 50) - 0.475) < 1e-9); assert.equal(C.heatFor(90, 50), 1, 'full heat');
  const pops = level => { const s = C.make(); run(s, 2.2, () => 95); const n0 = s.popped; run(s, 3, () => level); return s.popped - n0; };
  const just = pops(56), loud = pops(75), louder = pops(95);
  assert.ok(just < loud && loud <= louder, `${just} < ${loud} <= ${louder}`);
  assert.ok(louder >= 30 && louder <= 37, `about 12 a second at full heat (${louder})`);
  assert.ok(just >= 12 && just <= 25, `about 6 a second just over the line (${just})`);
});

test('pops do not depend on the frame rate', () => {
  const a = C.make(), b = C.make();
  run(a, 8, t => (t < 5 ? 80 : 10), { dt: 0.05 }); run(b, 8, t => (t < 5 ? 80 : 10), { dt: 1 / 60 });
  assert.equal(a.popouts, b.popouts); assert.ok(Math.abs(a.popped - b.popped) <= 2, `${a.popped} ~ ${b.popped}`);
});

test('while held (the pot\'s own sound), the room is not listened to', () => {
  const s = C.make(); const ev = run(s, 5, () => 95, { held: () => true });
  assert.equal(s.popouts, 0); assert.equal(s.state, 'calm'); assert.deepEqual(ev, []);
  const g = popping(); assert.equal(g.state, 'popping');
  const h0 = g.heat; run(g, 6, () => 10, { held: () => true });
  assert.equal(g.state, 'popping', 'calm while held does not count either'); assert.equal(g.heat, h0, 'and the heat stays where it was');
});

test('feed: the gauge follows the room, and holds still while the pot\'s own sound plays (its pops can\'t pop it)', () => {
  assert.equal(C.feed(20, 90, 0.05, false), C.smooth(20, 90, 0.05));
  assert.equal(C.feed(20, 90, 0.05, true), 20, 'held: the level stays');
  let lv = 22; const line = C.line(30, 'whisper', 0);
  for (let i = 0; i < 40; i++) lv = C.feed(lv, 95, 0.05, true);
  assert.ok(lv < line, String(lv));
  const s = C.make(); let level = 10;
  for (let t = 0; t < 4; t += 0.05) { const held = t < 2; level = C.feed(level, held ? 95 : 10, 0.05, held); C.step(s, { level, line, held, dt: 0.05 }); }
  assert.equal(s.popouts, 0); assert.equal(s.state, 'calm');
});

test('popping + 4 s of calm: it cools down and is calm again; the clock never counts while it pops or cools', () => {
  const s = popping(); const q = s.quiet;
  const ev = run(s, 3.9, () => 15);
  assert.equal(s.state, 'popping', 'not yet'); assert.equal(s.quiet, q);
  const last = ev.filter(e => e.type === 'pop').pop();
  assert.ok(!last || last.t < 2.5, 'the last kernels pop soon after it goes quiet');
  const ev2 = run(s, 3, () => 15);
  assert.deepEqual(types(ev2), ['cooldown', 'calm']); assert.equal(s.state, 'calm'); assert.equal(s.heat, 0);
  assert.ok(s.quiet > q && s.quiet - q < 1.5, 'the clock runs again only once it has cooled');
  assert.equal(s.popouts, 1);
});

test('while the room stays loud the popping goes on (and nothing cools)', () => {
  const s = popping(20, 70);
  assert.equal(s.state, 'popping'); assert.equal(s.popouts, 1); assert.ok(s.quiet < 2, 'the clock stopped at the pop-out');
  assert.ok(s.popped > 150, String(s.popped));
});

test('noise while it cools makes it pop again, with no extra pop-out and no second burst', () => {
  const s = popping(); run(s, 4.5, () => 10);
  assert.equal(s.state, 'cooling');
  const ev = run(s, 2, () => 92);
  assert.equal(ev[0].type, 'reheat'); assert.equal(s.state, 'popping'); assert.equal(s.popouts, 1);
  assert.ok(count(ev, 'pop') > 5, 'and it pops');
  assert.ok(!ev.some(e => e.type === 'popout'));
});

test('a room that calms during the burst still sees the whole burst, then cools', () => {
  const s = C.make(); const ev = run(s, 12, t => (t < 1.8 ? 90 : 5));
  assert.equal(s.popouts, 1); assert.equal(s.state, 'calm');
  assert.deepEqual(types(ev).filter(x => x !== 'pop' && x !== 'sizzle'), ['popout', 'cooldown', 'calm']);
});

test('the goal: celebrate once, then nothing more; no goal never ends; no goal while it pops', () => {
  const s = C.make({ goal: 10 }); const ev = run(s, 15, () => 10);
  assert.deepEqual(types(ev), ['goal']); assert.equal(s.state, 'celebrate'); assert.equal(s.done, true); assert.equal(s.quiet, 10);
  const n = C.make({ goal: 0 }); run(n, 1900, () => 10, { dt: 0.25 }); assert.equal(n.state, 'calm'); assert.ok(n.quiet > 1800);
  const w = C.make({ goal: 3 }); run(w, 2.2, () => 90); run(w, 10, () => 90); assert.equal(w.state, 'popping', 'the clock does not run while it pops, so no goal');
});

test('stars: 3 for 0-1 pop-outs, 2 for 2-3, 1 for more', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 9].map(C.stars), [3, 3, 2, 2, 1, 1]);
});

test('the same steps always give the same pot and the same popcorn', () => {
  const a = C.make({ goal: 60 }), b = C.make({ goal: 60 }), f = t => 30 + 40 * Math.sin(t * 1.3) + 25 * Math.sin(t * 4.1);
  const ea = run(a, 50, f), eb = run(b, 50, f);
  assert.deepEqual(ea, eb); assert.deepEqual(a, b);
  assert.ok(ea.length > 3 && a.popped > 0, 'something happened');
});

// The game's title in each language (the json's l10n titles say the same)
test('the words: every key in all 13 languages, the same placeholders, one form of address', () => {
  const blk = html.slice(html.indexOf('// ==== I18N START ===='), html.indexOf('// ==== I18N END ===='));
  const b = {}; vm.runInNewContext(blk + '\nthis.I18N = I18N;', b);
  const I = b.I18N, keys = Object.keys(I.en);
  assert.ok(keys.length > 50);
  const ph = s => (String(s).match(/\{\w+\}/g) || []).sort().join();
  const j = JSON.parse(fs.readFileSync('seed-games/popcorn-hush.json', 'utf8'));
  for (const l of LANGS) {
    assert.ok(I[l], l);
    for (const k of keys) { assert.ok(typeof I[l][k] === 'string' && I[l][k].length, `${l}.${k}`); assert.equal(ph(I[l][k]), ph(I.en[k]), `${l}.${k} placeholders`); }
    assert.ok(!Object.values(I[l]).some(v => /Remi|ريمي|רמי|レミ|Реми|雷米/.test(v)), `${l}: no word left over from Remi`);
    if (j.l10n[l]) assert.equal(I[l].title, j.l10n[l].title, `${l}: the same title as the json`);
    if (!['en', 'en-GB'].includes(l)) assert.notEqual(I[l].potPop, I.en.potPop, `${l}: translated`);
  }
  assert.equal(I.en.title, j.title);
  // every key the game uses exists in English
  const game = html.slice(html.indexOf('// ==== I18N END ===='));
  const used = [...new Set([...game.matchAll(/\bt\('([A-Za-z_]+)'/g)].map(m => m[1]).filter(k => !k.endsWith('_')))];
  assert.ok(used.length > 40);
  for (const k of used) assert.ok(k in I.en, `t('${k}') is in the block`);
  for (const st of ['denied', 'nodevice', 'busy', 'unavailable', 'off', 'tap']) { assert.ok(I.en['noMic_' + st] && I.en['noMic_' + st + '_p'], st); }
  assert.ok(!/\{n\} دقيقة/.test(I.ar.min + I.ar.quietMin), 'ar minutes');
  assert.ok(!/\b(Appuie|Touche|choisis|Branche|Ferme-le|Essaie|Ouvre|Tu peux|Réessaie)\b/.test(Object.values(I.fr).join(' ')), 'fr: vous');
  assert.ok(!/\b(Tippe|wähle|drücke|Schließe|Probiere|Öffne|Drücken,)\b/.test(Object.values(I.de).join(' ')), 'de: ihr');
  assert.ok(!/\b(Premilo|Tocca|scegli|premi|Collega|Chiudila|Prova|Apri|Puoi)\b/.test(Object.values(I.it).join(' ')), 'it: voi');
  assert.match(I.en.privacy, /Nothing is recorded or saved/);
});

test('AI voices: only the calm lines can be spoken (the title, the setup card, the privacy note, the end), never while it listens', async () => {
  const L = await import('../../server/services/tts-lines.js');
  // until the site registers the game (server/services/tts-lines.js GAMES), check the entry it should get
  if (!L.GAMES['popcorn-hush']) L.GAMES['popcorn-hush'] = { title: 'Popcorn Hush', role: 'friendly', spoken: /^(?:title|tag|setupH|privacy|calibHint|end)/ };
  for (const l of ['en', 'es', 'he', 'ja']) {
    const ls = L.gameLines('popcorn-hush', l);
    assert.ok(ls.length >= 5 && ls.length < 12, `${l}: a few lines (${ls.length})`);
    assert.ok(ls.every(x => /^(title|tag|setupH|privacy|calibHint|end)/.test(x.key)), `${l}: only the calm lines`);
  }
  assert.ok(L.gameLines('popcorn-hush', 'en').some(x => /Nothing is recorded/.test(x.text)), 'the privacy note can be read aloud');
});

test('the scan passes, the kit is pinned, and the json describes the game in every language', () => {
  assert.equal(scanVersion(html).status, 'pass');
  assert.ok(html.includes('<script src="/vendor/oomba-kit/1.1.5/oomba-kit.js" integrity="sha384-'), 'kit 1.1.5, pinned (as Remi)');
  assert.ok(!/packs\//.test(html), 'no packs');
  const j = JSON.parse(fs.readFileSync('seed-games/popcorn-hush.json', 'utf8'));
  assert.equal(j.slug, 'popcorn-hush'); assert.equal(j.title, 'Popcorn Hush'); assert.equal(j.icon, '🍿'); assert.equal(j.category, 'learning'); assert.equal(j.shelf, 'play');
  assert.equal(j.featured, false); assert.equal(j.players_max, 1); assert.equal(j.age_rating, 'everyone'); assert.equal(j.orientation, 'any');
  assert.ok(['sunset', 'ocean', 'forest', 'candy', 'night', 'lava', 'mint', 'gold'].includes(j.cover), 'a cover the site knows');
  assert.match(j.description, /nothing is recorded/i); assert.match(j.tags, /popcorn/); assert.match(j.tags, /noise meter/);
  assert.ok(j.notes.length > 1500 && /popcorn-hush-v1/.test(j.notes) && /BRB\.loudness/.test(j.notes));
  for (const l of LANGS.filter(x => x !== 'en' && x !== 'en-GB')) assert.ok(j.l10n[l] && j.l10n[l].title && j.l10n[l].description && j.l10n[l].tags, `l10n ${l}`);
});

test('child safety in the file: it never asks for the microphone, never records, never sends', () => {
  for (const bad of ['getUserMedia', 'mediaDevices', 'MediaRecorder', 'createMediaStreamSource', 'fetch(', 'XMLHttpRequest', 'WebSocket', 'sendBeacon']) assert.ok(!html.includes(bad), bad);
  assert.ok(html.includes('BRB.loudness'), 'it only reads the number the page passes');
  assert.ok(/storage\.set\(KEY, \{ preset: CFG\.preset, fine: CFG\.fine, goal: CFG\.goal \}\)/.test(html), 'only the teacher\'s settings are saved');
  assert.ok(!/storage\.set\([^)]*base/.test(html) && /base: CORE\.BASE, calibrated: false/.test(html), 'the measured room level is never saved or read back');
  assert.ok(html.includes("BRB.gameOver({ won: true, score: null })"), 'no score is submitted');
  assert.ok(/var AC = null, HELD_PAD = 400;/.test(html), 'the feedback guard: the pot\'s own sounds and 0.4 s after them are not listened to');
  assert.ok(/if \(n > PC\.end && n < PC\.quiet\) return;/.test(html), 'pops sound in clusters with a listening gap');
});

test('the art is our own: drawn in the file, no pictures embedded', () => {
  assert.ok(!/<img\b|data:image|\.png|\.jpe?g|\.webp/i.test(html), 'no image files');
  assert.ok(html.includes('/* popcorn-art:begin */') && html.includes('window.PopcornArt'));
});
