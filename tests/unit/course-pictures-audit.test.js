// The picture audit that should have caught the owner's two phone findings (Number Quest 3.3's mission picture
// opened on an empty Cream strip; Fraction Factory had no cover, only its 🧁 emoji), kept as a test so neither
// class of problem comes back:
//   (a) every slide picture in all three courses (Number Quest, CS Quest, Cyber Defenders), cut to the region the
//       slide shows (its `view`, else the whole picture), has no large empty band at its top or bottom: a run of
//       rows that are one flat colour, over 7% of the shown height. A band like that is chrome or padding, not the
//       game (the old 40 px strip the Number Quest bands kept for the expand button was 9-10%);
//   (b) a `whole: true` slide (the view is the whole capture) never also shows an expand button, and every
//       Number Quest band shot is marked so;
//   (c) every official game (scripts/seed.js SEED_GAMES) and every game a course deck sends a student to has a real
//       cover (public/covers/<slug>.jpg, `npm run covers`) and a share picture (public/og/<slug>.jpg,
//       scripts/og-images.js), so no card, course rail, teacher page or share preview falls back to an emoji.
// The pixel check decodes the WebP pictures with ffmpeg (the tool the capture scripts use); without ffmpeg it is
// skipped, loudly.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SEED_GAMES } from '../../scripts/seed.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const COURSES = ['number-quest', 'cs-quest', 'cyber-defenders'];
const BAND_MAX = 0.07;
// Known, accepted: CS Quest phone captures shown whole (scripts/csq-shots-spec.json narrow/compact, so they carry no
// view by the CS Quest picture rule) whose last 9-12% is the game's own flat grass under its panel, not chrome. Listed
// so the check stays strict for everything else; the fix is a recapture with the slice ending at the panel
// (scripts/csq-shots.js), not a crop. Remove a line when its picture is recaptured.
const KNOWN_BANDS = new Set(['csq/robo-route/maker-1b-task1-n:bottom', 'csq/robo-route/maker-2-task1-n:bottom', 'csq/robo-route/maker-2-task2-n:bottom',
  'csq/inside-the-machine/design-1b-sol-n:bottom', 'csq/inside-the-machine/design-2-tao-n:bottom']);

/** Every deck of the three courses: { course, band, file, deck }. */
function decks() {
  const out = [];
  for (const course of COURSES) {
    const dir = path.join(ROOT, 'seed-lessons', course, 'course');
    for (const band of fs.readdirSync(dir).filter(b => fs.statSync(path.join(dir, b)).isDirectory())) {
      for (const file of fs.readdirSync(path.join(dir, band)).filter(f => /^\d+\.\d+\.json$/.test(f))) {
        out.push({ course, band, file, deck: JSON.parse(fs.readFileSync(path.join(dir, band, file), 'utf8')) });
      }
    }
  }
  return out;
}
const slidesOf = d => [...(d.slides || []), ...(d.slides_first_time || [])].filter(Boolean);

const hasFfmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

/** The shown region of a 1280x720 picture as rows of grey values, 160 px wide. */
function rowsOf(file, view) {
  const [x, y, w, h] = view || [0, 0, 100, 100];
  const cw = Math.round(1280 * w / 100), ch = Math.round(720 * h / 100), W = 160, H = Math.max(8, Math.round(ch * W / cw));
  const buf = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', file, '-vf', `scale=1280:720,crop=${cw}:${ch}:${Math.round(1280 * x / 100)}:${Math.round(720 * y / 100)},scale=${W}:${H},format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 24 });
  return Array.from({ length: H }, (_, r) => buf.subarray(r * W, (r + 1) * W));
}
/** Is the row one flat colour (every pixel within 6 of the row's median)? */
const flat = row => { const s = [...row].sort((a, b) => a - b), m = s[s.length >> 1]; return row.every(v => Math.abs(v - m) <= 6) ? m : null; };
/** The share of the rows, from one end, that form a single flat band. */
function bandShare(rows, fromTop) {
  const seq = fromTop ? rows : [...rows].reverse();
  const m0 = flat(seq[0]);
  if (m0 == null) return 0;
  let n = 0;
  while (n < seq.length && flat(seq[n]) != null && Math.abs(flat(seq[n]) - m0) <= 6) n++;
  return n / rows.length;
}

test('(a) no slide picture opens or ends on a large empty band (all three courses)', { skip: !hasFfmpeg && 'ffmpeg is not installed' }, () => {
  const problems = [];
  let n = 0;
  for (const { course, band, file, deck } of decks()) {
    slidesOf(deck).forEach((s, i) => {
      if (!s.img) return;
      const pic = path.join(ROOT, 'public', 'img', `${s.img}.webp`);
      if (!fs.existsSync(pic)) return problems.push(`${course} ${band}-${file} slide ${i + 1}: ${s.img}.webp is missing`);
      const rows = rowsOf(pic, s.view);
      n++;
      for (const [top, where] of [[true, 'top'], [false, 'bottom']]) {
        const share = bandShare(rows, top);
        if (share > BAND_MAX && !KNOWN_BANDS.has(`${s.img}:${where}`)) problems.push(`${course} ${band}-${file} slide ${i + 1} (${s.img}${s.view ? ` view ${s.view.join(',')}` : ''}): an empty band ${Math.round(share * 100)}% of its height at the ${where}`);
      }
    });
  }
  assert.ok(n > 60, `pictures checked: ${n}`);
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('(b) Number Quest band shots are whole-band views: no expand button over a picture with nothing more to show', () => {
  const nq = decks().filter(d => d.course === 'number-quest');
  for (const { file, deck } of nq) {
    for (const s of deck.slides) {
      if (s.img && s.view) assert.equal(s.whole, true, `${file}: ${s.img} is a band shot (it has a view), so it says whole: true`);
    }
  }
});

test('(c) every official game and every course game has a real cover and a share picture, never an emoji stand-in', () => {
  const courseGames = new Set();
  for (const { deck } of decks()) if (deck.game && deck.game.slug) courseGames.add(deck.game.slug);
  assert.ok(courseGames.has('fraction-factory') && courseGames.has('sum-racer'), 'course games found');
  const missing = [];
  for (const slug of new Set([...SEED_GAMES, ...courseGames])) {
    if (!SEED_GAMES.includes(slug)) { missing.push(`${slug}: a course sends students to it, but it is not an official (seeded) game`); continue; }
    for (const [dir, what] of [['covers', 'cover (npm run covers, scripts/covers/<slug>.recipe.js)'], ['og', 'share picture (node scripts/og-images.js)']]) {
      const f = path.join(ROOT, 'public', dir, `${slug}.jpg`);
      if (!fs.existsSync(f) || fs.statSync(f).size < 8000) missing.push(`${slug}: no ${what}`);
    }
  }
  assert.deepEqual(missing, [], missing.join('\n'));
});
