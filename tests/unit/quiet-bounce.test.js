// Quiet Bounce (seed-games/quiet-bounce.html): the level maths (dBFS to the gauge, smoothing), the room calibration and
// the "too loud" line (the same as Remi's Quiet Meadow), the jar's moods step by step (rest, rattle, the big bounce,
// bouncy, settling, the goal), stars, the balls' physics (a resting pile, walls and lid), the game's words in all 13
// languages, the scan, and child safety in the file itself (it never asks for the microphone and never records: the
// play page measures and passes a number).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { scanVersion } from '../../server/services/scanner.js';

const html = fs.readFileSync('seed-games/quiet-bounce.html', 'utf8');
const remi = fs.readFileSync('seed-games/remis-quiet-meadow.html', 'utf8');
const LANGS = ['en', 'en-GB', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'ru', 'ja', 'zh-Hant', 'ar', 'he'];
const block = html.slice(html.indexOf('/* bounce-core:begin */'), html.indexOf('/* bounce-core:end */'));
const box = { window: {} }; vm.runInNewContext(block, box);
const C = box.window.BounceCore;
const artBlock = html.slice(html.indexOf('/* bounce-art:begin */'), html.indexOf('/* bounce-art:end */'));
const abox = { window: {} }; vm.runInNewContext(artBlock, abox);
const ART = abox.window.BounceArt;

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

test('the same level maths, smoothing and calibration as Remi\'s Quiet Meadow, so a room feels the same in both', () => {
  const R = (() => { const b = remi.slice(remi.indexOf('/* remi-core:begin */'), remi.indexOf('/* remi-core:end */')); const x = { window: {} }; vm.runInNewContext(b, x); return x.window.RemiCore; })();
  for (let db = -100; db <= 0; db += 3.7) assert.equal(C.levelOf(db), R.levelOf(db));
  for (const [p, x, dt] of [[0, 90, 0.05], [80, 10, 1 / 60], [40, 41, 0.2]]) assert.equal(C.smooth(p, x, dt), R.smooth(p, x, dt));
  for (const pr of ['whisper', 'quiet', 'group', 'x']) for (const f of [-30, -7, 0, 12, 40]) for (const b of [undefined, 0, 22, 70]) assert.equal(C.line(b, pr, f), R.line(b, pr, f));
  for (const s of [[], [20, 21], [22, 24, 90, 23, 25, 21, 24], [75, 80, 78, 77, 81]]) assert.deepEqual({ ...C.calibrate(s) }, { ...R.calibrate(s) });
  assert.deepEqual([...C.GOALS], [...R.GOALS]); assert.deepEqual({ ...C.PRESETS }, { ...R.PRESETS });
  assert.equal(C.T.jump, R.T.wake, 'the same 1.5 s over the line'); assert.equal(C.T.calm, R.T.calm, 'the same 4 s of calm');
});

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

test('the line: the room\'s quiet plus the preset plus the fine slider, kept on the gauge', () => {
  assert.equal(C.line(30, 'whisper', 0), 40); assert.equal(C.line(30, 'quiet', 0), 48); assert.equal(C.line(30, 'group', 0), 60);
  assert.equal(C.line(undefined, 'quiet', 0), 48, 'uncalibrated: the room counts as 30');
  assert.equal(C.line(30, 'quiet', 99), 73, 'fine is capped at +25'); assert.equal(C.line(30, 'quiet', -99), 23);
  assert.equal(C.line(0, 'whisper', -25), 15, 'never under 15'); assert.equal(C.line(70, 'group', 25), 95, 'never over 95');
});

test('calibration: the median of the room, too loud refused, no input refused', () => {
  const r = C.calibrate([22, 24, 90, 23, 25, 21, 24]);
  assert.deepEqual({ ok: r.ok, base: r.base }, { ok: true, base: 24 });
  assert.equal(C.calibrate([75, 80, 78, 77, 81]).why, 'tooLoud');
  assert.equal(C.calibrate([]).why, 'noInput'); assert.equal(C.calibrate([20, 21]).why, 'noInput');
});

test('how hard the balls are pushed: nearness inside the "getting loud" band, overness past the line', () => {
  assert.equal(C.nearness(30, 50), 0); assert.equal(C.nearness(40, 50), 0); assert.equal(C.nearness(45, 50), 0.5); assert.equal(C.nearness(50, 50), 1); assert.equal(C.nearness(80, 50), 1);
  assert.equal(C.overness(50, 50), 0); assert.equal(C.overness(75, 50), 0.5); assert.equal(C.overness(100, 50), 1); assert.equal(C.overness(20, 50), 0);
  assert.equal(C.overness(100, 100), 0, 'no division by zero');
});

test('silence: the balls rest and the quiet clock counts', () => {
  const s = C.make({ goal: 0 }); const ev = run(s, 30, () => 20);
  assert.equal(s.state, 'rest'); assert.equal(s.bounces, 0); assert.ok(Math.abs(s.quiet - 30) < 0.06); assert.deepEqual(ev, []);
});

test('a single clap only rattles them: no big bounce', () => {
  const s = C.make(); const ev = run(s, 6, t => (t >= 1 && t < 1.2 ? 95 : 20));
  assert.equal(s.bounces, 0); assert.ok(!ev.some(e => e.type === 'bounce'));
  assert.ok(ev.some(e => e.type === 'rattle'), 'they rattle'); assert.equal(s.state, 'rest', 'and lie still again');
});

test('getting close to the line: they rattle (a jiggle, a hop, a roll or a click) with gaps, and the clock still runs', () => {
  const s = C.make(); const ev = run(s, 10, () => 45);   // line 50, near band 40..50
  const r = ev.filter(e => e.type === 'rattle');
  assert.equal(s.state, 'rattle'); assert.equal(s.bounces, 0);
  assert.ok(r.length >= 3 && r.length <= 5, `a rattle every ~2.5 s (${r.length})`);
  for (const e of r) assert.ok(C.RATTLES.includes(e.act));
  assert.ok(new Set(r.map(e => e.act)).size >= 2, 'not always the same rattle');
  assert.ok(s.quiet > 9.9, 'rattling is still resting: the clock runs');
});

test('1.6 s over the line: one big bounce; they hit the lid, clatter down, then stay bouncy', () => {
  const s = C.make(); const ev = run(s, 5, t => (t < 2.2 ? 85 : 20));
  const types = ev.map(e => e.type);
  assert.equal(types.filter(x => x === 'bounce').length, 1); assert.equal(s.bounces, 1);
  const i = types.indexOf('bounce');
  assert.deepEqual(types.slice(i, i + 4), ['bounce', 'bonk', 'clatter', 'bouncy']);
  const b = ev[i]; assert.ok(b.t > 1.5 && b.t < 2.2, `after about 1.5 s over the line (${b.t})`); assert.equal(b.bounces, 1);
  const d = ev[types.indexOf('bouncy')].t - b.t; assert.ok(Math.abs(d - C.T.seq) < 0.11, `the big bounce lasts ${C.T.seq} s (${d})`);
  assert.equal(s.state, 'bouncy');
});

test('noise on 70% of the time still sets them off (the over-the-line count is leaky, not reset)', () => {
  const s = C.make(); run(s, 4, t => ((t % 1) < 0.7 ? 92 : 10));
  assert.equal(s.bounces, 1);
});

test('while held (the jar\'s own sound), the room is not listened to', () => {
  const s = C.make(); const ev = run(s, 5, () => 95, { held: () => true });
  assert.equal(s.bounces, 0); assert.equal(s.state, 'rest'); assert.deepEqual(ev, []);
  const g = C.make(); run(g, 2.2, () => 90); run(g, 3, () => 90); assert.equal(g.state, 'bouncy');
  run(g, 6, () => 10, { held: () => true }); assert.equal(g.state, 'bouncy', 'calm while held does not count either');
});

test('feed: the gauge follows the room, and holds still while the jar\'s own sound plays (its clatter can\'t set it off)', () => {
  assert.equal(C.feed(20, 90, 0.05, false), C.smooth(20, 90, 0.05));
  assert.equal(C.feed(20, 90, 0.05, true), 20, 'held: the level stays');
  const line = C.line(30, 'whisper', 0), s = C.make(); let level = 10;
  for (let t = 0; t < 4; t += 0.05) { const held = t < 2; level = C.feed(level, held ? 95 : 10, 0.05, held); C.step(s, { level, line, held, dt: 0.05 }); }
  assert.equal(s.bounces, 0); assert.equal(s.state, 'rest');
});

test('rattling while the jar\'s own soft clicks play: the bounce comes a little later, but it still comes', () => {
  // a rattle sound (0.3 s + 0.4 s) every 2.5 s holds the room ~28% of the time; a room that stays loud still sets them off
  const s = C.make(); let lv = 0, heldUntil = -1, at = null;
  for (let i = 0; i < 200 && at === null; i++) {
    const t = i * 0.05; lv = C.smooth(lv, 70, 0.05);
    const r = C.step(s, { level: lv, line: 50, held: t < heldUntil, dt: 0.05, rnd: 0.3 });
    for (const e of r.events) { if (e.type === 'rattle') heldUntil = t + 0.7; if (e.type === 'bounce') at = t; }
  }
  assert.ok(at !== null && at < 3.5, `a big bounce at ${at}`);
});

test('bouncy + 4 s of calm: they settle back into the pile; the clock never counts while they bounce', () => {
  const s = C.make(); run(s, 2.2, () => 90); run(s, 3, () => 90);
  assert.equal(s.state, 'bouncy'); const q = s.quiet;
  const ev = run(s, 3.9, () => 15); assert.equal(s.state, 'bouncy', 'not yet'); assert.equal(s.quiet, q);
  const ev2 = run(s, 3, () => 15);
  assert.deepEqual(ev2.map(e => e.type), ['settle', 'rest']); assert.equal(s.state, 'rest');
  assert.ok(s.quiet > q && s.quiet - q < 1.5, 'the clock runs again only once they rest');
  assert.deepEqual(ev, []);
});

test('noise while they settle makes them bouncy again, with no extra big bounce', () => {
  const s = C.make(); run(s, 2.2, () => 90); run(s, 3, () => 90); run(s, 4.5, () => 10);
  assert.equal(s.state, 'settling');
  const ev = run(s, 1.2, () => 92);
  assert.ok(ev.some(e => e.type === 'rebounce')); assert.equal(s.state, 'bouncy'); assert.equal(s.bounces, 1);
});

test('a second loud spell after resting again is a second big bounce', () => {
  const s = C.make(); run(s, 2.2, () => 90); run(s, 9, () => 10); assert.equal(s.state, 'rest');
  run(s, 2.5, () => 90); assert.equal(s.bounces, 2);
});

test('the goal: celebrate once, then nothing more; no goal never ends; the clock does not run while they bounce', () => {
  const s = C.make({ goal: 10 }); const ev = run(s, 15, () => 10);
  assert.deepEqual(ev.map(e => e.type), ['goal']); assert.equal(s.state, 'celebrate'); assert.equal(s.done, true); assert.equal(s.quiet, 10);
  const n = C.make({ goal: 0 }); run(n, 1900, () => 10, { dt: 0.25 }); assert.equal(n.state, 'rest'); assert.ok(n.quiet > 1800);
  const w = C.make({ goal: 3 }); run(w, 2.2, () => 90); run(w, 10, () => 90); assert.equal(w.state, 'bouncy');
});

test('stars: 3 for 0-1 big bounces, 2 for 2-3, 1 for more', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 9].map(C.stars), [3, 3, 2, 2, 1, 1]);
});

test('the same steps always give the same jar', () => {
  const a = C.make({ goal: 60 }), b = C.make({ goal: 60 }), f = t => 30 + 40 * Math.sin(t * 1.3) + 25 * Math.sin(t * 4.1);
  const ea = run(a, 50, f), eb = run(b, 50, f);
  assert.deepEqual(ea, eb); assert.deepEqual(a, b);
  assert.ok(ea.length > 3, 'something happened');
});

test('the balls: a resting pile inside the jar, they stay inside when kicked, and they come back to rest', () => {
  const J = ART.Jar(30);
  assert.equal(J.balls.length, 30);
  const inside = () => J.balls.every(b => b.x >= b.r - 2 && b.x <= J.JW - b.r + 2 && b.y <= J.JH - b.r + 2 && b.y >= J.lid.y + b.r - 2);
  assert.ok(inside(), 'all in the jar');
  // at rest: over a second, no ball moves more than a hair from one frame to the next
  const still = () => { let mx = 0; for (let i = 0; i < 60; i++) { const p = J.balls.map(b => [b.x, b.y]); J.step(1 / 60, { damp: 2.2 }); J.balls.forEach((b, k) => { mx = Math.max(mx, Math.hypot(b.x - p[k][0], b.y - p[k][1])); }); } return mx; };
  assert.ok(still() < 0.5, `the pile is at rest (${still()})`);
  const restTop = ART.topOf(J);
  assert.ok(restTop > J.JH * 0.35 && restTop < J.JH * 0.75, `a pile about half full (${restTop})`);
  // overlaps stay small
  let worst = 0; for (let i = 0; i < 30; i++) for (let j = i + 1; j < 30; j++) { const p = J.balls[i], q = J.balls[j]; worst = Math.max(worst, p.r + q.r - Math.hypot(p.x - q.x, p.y - q.y)); }
  assert.ok(worst < 6, `balls do not sink into each other (${worst})`);
  // a big bounce: they fly up, some hit the lid, and nobody leaves the jar
  J.balls.forEach((b, i) => { b.vy = -2000 - (i % 5) * 60; b.vx = (i % 2 ? 1 : -1) * 300; });
  let high = J.JH;
  for (let i = 0; i < 30; i++) { J.step(1 / 60); high = Math.min(high, ART.topOf(J)); assert.ok(inside(), 'still in the jar'); }
  assert.ok(high < 20, `they reach the top (${high})`); assert.ok(J.lid.y >= -20, 'the lid only lifts a little'); assert.ok(J.lidHits > 0, 'some bump the lid');
  for (let i = 0; i < 300; i++) J.step(1 / 60, { damp: 2.5 });
  assert.ok(still() < 0.5, 'and settle again'); assert.ok(Math.abs(ART.topOf(J) - restTop) < 60, 'back into a pile');
  // the same jar every time
  assert.deepEqual(ART.Jar(30).balls.map(b => [b.x, b.y]), ART.Jar(30).balls.map(b => [b.x, b.y]));
});

test('the words: every key in all 13 languages, the same placeholders, no Remi', () => {
  const blk = html.slice(html.indexOf('// ==== I18N START ===='), html.indexOf('// ==== I18N END ===='));
  const b = {}; vm.runInNewContext(blk + '\nthis.I18N = I18N;', b);
  const I = b.I18N, keys = Object.keys(I.en);
  assert.ok(keys.length > 50);
  const ph = s => (String(s).match(/\{\w+\}/g) || []).sort().join();
  const titles = new Set();
  for (const l of LANGS) {
    assert.ok(I[l], l);
    for (const k of keys) { assert.ok(typeof I[l][k] === 'string' && I[l][k].length, `${l}.${k}`); assert.equal(ph(I[l][k]), ph(I.en[k]), `${l}.${k} placeholders`); }
    assert.ok(!Object.values(I[l]).some(v => /Remi|ريمي|רמי|レミ|Реми|雷米/.test(v)), `${l}: no Remi words left`);
    if (l !== 'en-GB') { assert.ok(!titles.has(I[l].title), `${l}: its own title`); titles.add(I[l].title); }
    if (!['en', 'en-GB'].includes(l)) assert.ok(I[l].noMic_off_p.includes(I[l].title), `${l}: the no-mic card names the game as it is called there`);
  }
  // the scripts: Arabic and Hebrew are written in their own letters, CJK in theirs
  assert.match(I.ar.title, /[؀-ۿ]/); assert.match(I.he.title, /[֐-׿]/); assert.match(I.ja.title, /[぀-ヿ]/); assert.match(I.ru.title, /[Ѐ-ӿ]/);
  // every key the game uses exists in English
  const game = html.slice(html.indexOf('// ==== I18N END ===='));
  const used = [...new Set([...game.matchAll(/\bt\('([A-Za-z_]+)'/g)].map(m => m[1]).filter(k => !k.endsWith('_')))];
  assert.ok(used.length > 30);
  for (const k of used) assert.ok(k in I.en, `t('${k}') is in the block`);
  for (const st of ['denied', 'nodevice', 'busy', 'unavailable', 'off', 'tap']) { assert.ok(I.en['noMic_' + st] && I.en['noMic_' + st + '_p'], st); }
  assert.ok(!/\{n\} دقيقة/.test(I.ar.min + I.ar.quietMin), 'ar minutes');
  // one form of address per language: French vous, German ihr, Italian voi
  assert.ok(!/\b(Appuie|Touche|choisis|Branche|Ferme-le|Essaie|Ouvre|Tu peux|Réessaie|Laisse)\b/.test(Object.values(I.fr).join(' ')), 'fr: vous');
  assert.ok(!/\b(Tippe|wähle|drücke|Schließe|Probiere|Öffne|Drücken,|lass)\b/.test(Object.values(I.de).join(' ')), 'de: ihr');
  assert.ok(!/\b(Premilo|Tocca|scegli|premi|Collega|Chiudila|Prova|Apri|Puoi|lascia)\b/.test(Object.values(I.it).join(' ')), 'it: voi');
});

test('the scan passes, the kit is pinned, and the json describes the game in every language', () => {
  assert.equal(scanVersion(html).status, 'pass', JSON.stringify(scanVersion(html).issues));
  assert.ok(html.includes('<script src="/vendor/oomba-kit/1.1.5/oomba-kit.js" integrity="sha384-'), 'kit 1.1.5, pinned');
  const kitTag = s => s.match(/<script src="\/vendor\/oomba-kit\/[^"]+" integrity="[^"]+"/)[0];
  assert.equal(kitTag(html), kitTag(remi), 'the same kit as Remi');
  assert.ok(!/packs\//.test(html), 'no packs');
  const j = JSON.parse(fs.readFileSync('seed-games/quiet-bounce.json', 'utf8'));
  assert.equal(j.slug, 'quiet-bounce'); assert.equal(j.title, 'Quiet Bounce'); assert.equal(j.category, 'learning'); assert.equal(j.shelf, 'play'); assert.equal(j.featured, false);
  assert.equal(j.players_max, 1); assert.equal(j.age_rating, 'everyone'); assert.equal(j.orientation, 'any'); assert.match(j.description, /nothing is recorded/i);
  assert.match(j.tags, /noise meter/); assert.match(j.tags, /bouncy balls/); assert.ok(j.icon && j.cover && j.notes.length > 800);
  const blk = html.slice(html.indexOf('// ==== I18N START ===='), html.indexOf('// ==== I18N END ===='));
  const b = {}; vm.runInNewContext(blk + '\nthis.I18N = I18N;', b);
  for (const l of LANGS.filter(x => x !== 'en' && x !== 'en-GB')) {
    assert.ok(j.l10n[l] && j.l10n[l].description && j.l10n[l].tags, `l10n ${l}`);
    assert.equal(j.l10n[l].title, b.I18N[l].title, `${l}: the same title as in the game`);
  }
});

test('child safety in the file: it never asks for the microphone, never records, never sends', () => {
  for (const bad of ['getUserMedia', 'mediaDevices', 'MediaRecorder', 'createMediaStreamSource', 'fetch(', 'XMLHttpRequest', 'WebSocket', 'sendBeacon']) assert.ok(!html.includes(bad), bad);
  assert.ok(html.includes('BRB.loudness'), 'it only reads the number the page passes');
  assert.ok(/storage\.set\(KEY, \{ preset: CFG\.preset, fine: CFG\.fine, goal: CFG\.goal \}\)/.test(html), 'only the teacher\'s settings are saved');
  assert.ok(!/storage\.set\([^)]*base/.test(html) && /base: CORE\.BASE, calibrated: false/.test(html), 'the measured room level is never saved or read back');
  assert.ok(html.includes("BRB.gameOver({ won: true, score: null })"), 'no score is submitted');
  assert.ok(html.includes("var KEY = 'quiet-bounce-v1'"));
  // the jar's own sounds hold the meter (the feedback guard), and only the story's events make a sound, never each bump
  assert.ok(/S\.heldUntil = Math\.max\(S\.heldUntil, now\(\) \+ \(LEN\[name\]/.test(html));
  const art = html.slice(html.indexOf('/* bounce-art:begin */'), html.indexOf('/* bounce-art:end */'));
  assert.ok(!/snd\(|AudioContext/.test(art), 'the physics makes no sound by itself');
});

test('the art is our own: drawn in the file, no pictures embedded', () => {
  assert.ok(!/<img\b|data:image|\.png|\.jpe?g|\.webp/i.test(html), 'no image files');
  assert.ok(html.includes('window.BounceArt'));
});
