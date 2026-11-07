// CS Quest's phone-width captures (scripts/csq-shots-spec.json, shot by `node scripts/cyber-shots.js --course csq`): the
// Data Detective, Packet Post, Inside the Machine, Level Maker and Would You Rather pictures of units 2.2 to 6. Every
// state is registered in the shared manifest with the spec's alt, its WebP exists, a CS Quest slide uses it, and its
// capture recorded its words (scripts/csq-shots-rects.json), so the course engine's zoom-to-cue can read it on a phone.
// The decks: every pictured CS Quest slide carries a guided tour (the intro promises highlighted parts on every step),
// and on a 390 px phone no picture at rest and no zoom cuts a line of the game's text, and the toured words read at
// 11 px or more wherever the layout allows (the holdouts are pinned below).
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'csq-shots-spec.json'), 'utf8'));
const rects = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'csq-shots-rects.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'img', 'csq', 'manifest.json'), 'utf8'));
const byKey = new Map(manifest.images.map(e => [e.key, e]));
const decks = [];
for (const band of ['1b', '2']) for (const f of fs.readdirSync(path.join(ROOT, 'seed-lessons', 'cs-quest', 'course', band)).sort()) {
  decks.push({ band, f, d: JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons', 'cs-quest', 'course', band, f), 'utf8')) });
}
const used = new Set(decks.flatMap(({ d }) => d.slides.map(s => s.img).filter(Boolean)));

test('the spec: unique states, CS Quest games, registered, on disk and used by a slide', () => {
  assert.ok(spec.length >= 80, `${spec.length} shots`);
  const seen = new Set();
  for (const s of spec) {
    assert.ok(!seen.has(s.game + s.state), `${s.game}/${s.state} twice`); seen.add(s.game + s.state);
    assert.ok(['robo-route', 'data-detective', 'packet-post', 'inside-the-machine', 'would-you-rather'].includes(s.game), `${s.state}: a CS Quest game`);
    const key = `csq/${s.game}/${s.state}`, e = byKey.get(key);
    assert.ok(e, `${key} is in the manifest`);
    assert.equal(e.alt, s.alt, `${key}: manifest alt matches the spec`);
    assert.ok(fs.existsSync(path.join(ROOT, 'public', 'img', `${key}.webp`)), `${key}.webp exists`);
    assert.ok(used.has(key), `${key} is used by a CS Quest slide`);
    assert.ok(rects[key] && Array.isArray(rects[key]['~words']) && (typeof rects[key]['~bodyFont'] === 'number' || !rects[key]['~words'].length), `${key}: its words are recorded`);
    if (s.game === 'would-you-rather') assert.ok(s.dilemma && s.topic, `${key}: names its dilemma`);
  }
});

test('every pictured CS Quest slide carries a guided tour', () => {
  let n = 0;
  for (const { band, f, d } of decks) d.slides.forEach((s, i) => {
    if (!s.img && !s.visual) return;
    n++;
    assert.ok(Array.isArray(s.focus) && s.focus.length >= 1 && s.focus.length <= 4, `${band}/${f} slide ${i + 1} (${s.title}): a tour of 1-4 steps`);
  });
  assert.ok(n >= 200, `${n} pictured slides`);
});

// Zoom-to-cue at a 390 px phone (the picture frame is 326 px wide): the same check tests/unit/cyber-shots.test.js
// runs on Cyber Defenders, over every CS Quest slide whose picture recorded its words.
const Z = await import('../../public/js/course-zoom.js');
const ZOOM_DATA = (await import('../../public/js/course-zoom-data.js')).default;
const FRAME_390 = 326;
// Toured steps that cannot reach 11 px without reflowing the game: Packet Post's road maps (4.1 Many Roads, Pro 4.2
// the padlock roads, Pro 4.3 the pixel grid), whose stop labels and pixel numbers the game sets small at every width
// (Cyber Defenders pins the same maps as WIDE), and Pro 2.2's tester card, whose long yellow "Change one thing" pill
// sits between rows of the dimmed maker panel that a zoom may not cut.
const SHORT = 6;
test('zoom-to-cue at 390: no cut line, every touched line whole, 11 px wherever the layout allows', () => {
  let n = 0;
  const short = [];
  for (const { band, f, d } of decks) d.slides.forEach((s, i) => {
    const r = s.img && rects[s.img];
    if (!r || !s.focus) return;
    assert.equal(ZOOM_DATA[s.img], r['~bodyFont'], `${s.img}: public/js/course-zoom-data.js is current (node scripts/cyber-zoom-data.mjs)`);
    const lines = Z.linesOf(r['~words']), view = s.view || [0, 0, 100, 100];
    const restCut = Z.cutLines(view, lines);
    assert.equal(restCut.length, 0, `${band}/${f} slide ${i + 1} (${s.img}): the crop [${view}] cuts a line at [${restCut[0]}]`);
    s.focus.forEach((fo, fi) => {
      n++;
      const at = `${band}/${f} slide ${i + 1} step ${fi + 1} (${s.img})`;
      const z = Z.zoomFor(view, fo.box, r['~bodyFont'], r['~words'], FRAME_390);
      if (z && z.d) {
        assert.equal(z.cut.length, 0, `${at}: the zoom cuts ${z.cut.length} line(s)`);
        const [x0, y0, w, h] = z.d, b = fo.box;
        for (const l of lines) {
          const touches = l[0] < b[0] + b[2] && l[0] + l[2] > b[0] && l[1] < b[1] + b[3] && l[1] + l[3] > b[1];
          if (touches) assert.ok(l[0] >= x0 - 0.05 && l[0] + l[2] <= x0 + w + 0.05 && l[1] >= y0 - 0.05 && l[1] + l[3] <= y0 + h + 0.05, `${at}: a line the box touches is not shown whole`);
        }
      }
      const px = z ? z.px : Z.textPx(r['~bodyFont'], view[2], FRAME_390);
      if (px < Z.MIN_PX - 0.05) short.push(`${at}: ${px.toFixed(1)} px`);
    });
  });
  assert.ok(n >= 150, `${n} toured steps checked`);
  assert.ok(short.length <= SHORT, `steps under 11 px:\n${short.join('\n')}`);
});

// A narrow shot is a 16:9 slice of a phone-width page: its top and bottom edges fall between lines of text.
test('narrow shots: the slice edges cut no line of text', () => {
  const E = 0.15, cut = [];
  for (const s of spec) {
    if (!s.narrow) continue;
    const key = `csq/${s.game}/${s.state}`;
    for (const w of rects[key]['~words']) if (w[1] <= E || w[1] + w[3] >= 100 - E) cut.push(`${key}: a word at the ${w[1] <= E ? 'top' : 'bottom'} edge`);
  }
  assert.deepEqual([...new Set(cut)], [], 'move the slice (narrow.at) so its edges fall between lines');
});
