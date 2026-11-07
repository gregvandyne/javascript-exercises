// Cyber Defenders capture spec (scripts/cyber-shots-spec.json): every shot the parity pass took, checked
// against the games it claims to show. Packet Post entries must name a real chapter for their band and a
// level inside it (games.json is the chapter table); Would You Rather entries must name a real dilemma in
// the game's "online" bank (the runner plays through the round until that dilemma is on screen); Trick
// Inbox entries must name a real set that runs for their band (the game's own SETS table); Escape the
// Post Office entries name its single "escape" chapter. Every state must be registered in the shared
// manifest with the spec's alt, its WebP must exist, and at least one Cyber Defenders deck slide must
// use it — a capture nothing uses is drift.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'cyber-shots-spec.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'img', 'csq', 'manifest.json'), 'utf8'));
const manifestByKey = new Map(manifest.images.map(e => [e.key, e]));
const ppChapters = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons', 'cs-quest', 'games.json'), 'utf8')).games['packet-post'].chapters;
const wyrBank = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'data', 'would-you-rather', 'en.json'), 'utf8')).items;
const tiHtml = fs.readFileSync(path.join(ROOT, 'seed-games', 'trick-inbox.html'), 'utf8');
const tiCtx = vm.createContext({});
for (const m of tiHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(m[1], tiCtx);
const tiSets = tiCtx.TrickInbox.SETS;
const epCtx = vm.createContext({});
for (const m of fs.readFileSync(path.join(ROOT, 'seed-games', 'escape-the-post-office.html'), 'utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(m[1], epCtx);
// Compact captures record the game's real element boxes, which the slide highlights are measured from.
const rects = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'cyber-shots-rects.json'), 'utf8'));
const usedByDecks = new Set();
for (const band of ['1b', '2']) for (const f of fs.readdirSync(path.join(ROOT, 'seed-lessons', 'cyber-defenders', 'course', band))) {
  const deck = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons', 'cyber-defenders', 'course', band, f), 'utf8'));
  for (const s of deck.slides) if (s.img) usedByDecks.add(s.img);
}
// CS Quest's decks reuse a few Cyber captures (the wide Would You Rather credit card): those count as used too.
for (const band of ['1b', '2']) for (const f of fs.readdirSync(path.join(ROOT, 'seed-lessons', 'cs-quest', 'course', band))) {
  const deck = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons', 'cs-quest', 'course', band, f), 'utf8'));
  for (const s of [...(deck.slides || []), ...(deck.slides_first_time || [])]) if (s.img) usedByDecks.add(s.img);
}

test('the spec: unique states, real chapters and levels, real online dilemmas', () => {
  assert.ok(spec.length >= 40, `${spec.length} shots in the table`);
  const seen = new Set();
  for (const s of spec) {
    assert.ok(!seen.has(s.state), `${s.state} twice`); seen.add(s.state);
    assert.ok(['packet-post', 'would-you-rather', 'trick-inbox', 'escape-the-post-office'].includes(s.game), `${s.state}: a Cyber game`);
    assert.ok(typeof s.alt === 'string' && s.alt.length >= 1 && s.alt.length <= 160, `${s.state}: alt 1-160 chars`);
    assert.ok(typeof s.concept === 'string' && s.concept.length >= 3, `${s.state}: a concept line`);
    if (s.game === 'packet-post') {
      if (s.title) { assert.equal(s.chapter, 'title', 'the title-screen shot'); continue; }
      const ch = ppChapters.find(c => c.id === s.chapter && c.band === (s.band === '1b' ? '1B' : '2'));
      assert.ok(ch, `${s.state}: ${s.chapter} is a Packet Post chapter for band ${s.band}`);
      assert.ok(Number.isInteger(s.level) && s.level >= 1 && s.level <= ch.levels, `${s.state}: level ${s.level} inside ${s.chapter} (${ch.levels} levels)`);
      for (const a of s.actions) assert.ok(a.acts || a.solve || a.closeCards, `${s.state}: only acts/solve/closeCards actions drive Packet Post`);
    } else if (s.game === 'would-you-rather') {
      const item = wyrBank.find(x => x.id === s.dilemma);
      assert.ok(item, `${s.state}: ${s.dilemma} is a real Would You Rather dilemma`);
      assert.equal(item.cat, 'online', `${s.state}: ${s.dilemma} is in the online bank`);
      assert.equal(s.chapter, 'online', `${s.state}: the online chapter`);
    } else if (s.game === 'trick-inbox') {
      const set = tiSets.find(x => x.id === s.chapter);
      assert.ok(set, `${s.state}: ${s.chapter} is a Trick Inbox set`);
      assert.ok(set.bands.includes(s.band), `${s.state}: the ${s.chapter} set runs for band ${s.band}`);
      if (s.msg) assert.ok(tiCtx.TrickInbox.round(s.chapter, s.band, 7).some(m => m.id === s.msg), `${s.state}: ${s.msg} is a ${s.chapter} message for band ${s.band}`);
      if (s.phase) assert.ok(['hunt', 'decide', 'debrief'].includes(s.phase), `${s.state}: a real phase`);
    } else {
      assert.equal(s.game, 'escape-the-post-office');
      assert.ok(s.chapter === 'escape' || epCtx.EscapePostOffice.LOCKS.some(l => l.id === s.chapter), `${s.state}: the escape door or one of its locks`);
    }
  }
});

test('every spec state is in the manifest with the same alt, its WebP exists, and a deck slide uses it', () => {
  for (const s of spec) {
    const key = `csq/${s.game}/${s.state}`;
    const entry = manifestByKey.get(key);
    assert.ok(entry, `${key} is registered in public/img/csq/manifest.json`);
    assert.equal(entry.alt, s.alt, `${key}: manifest alt matches the spec`);
    assert.equal(entry.band, s.band, `${key}: manifest band matches the spec`);
    assert.ok(fs.existsSync(path.join(ROOT, 'public', 'img', `${key}.webp`)), `${key}.webp exists`);
    // No spare captures: a capture no slide uses is deleted with its spec entry (2026-11-06 tidy-up).
    assert.ok(usedByDecks.has(key), `${key} is used by at least one course slide (Cyber Defenders, or CS Quest reusing it)`);
    if (s.compact) assert.ok(rects[key] && Object.keys(rects[key]).length >= 4, `${key}: its element boxes are recorded`);
  }
});

// Phone legibility (2026-11-06, zoom-to-cue): every capture's run records the game's body text size ('~bodyFont',
// px of the 1280-wide master) and its word boxes ('~words'); public/js/course-zoom.js zooms each tour step so the
// step's box fills the 390 px phone's picture frame (326 px wide). Checked here at that size, for every Cyber
// screenshot step with recorded words (Trick Inbox, Escape, Would You Rather, Cyber's Packet Post shots):
//   - neither the picture at rest (its crop) nor a zoom cuts a line of the game's text: every line shown is whole;
//   - every line the step's box touches is shown whole;
//   - the step's words read at 11 px or more, except where they cannot without reflowing the game: the box touches
//     a line wider than an 11 px frame holds (WIDE), or a whole line next to it caps the zoom (CAPPED). Those are
//     pinned below (no new ones). Trick Inbox, Escape, Would You Rather and Packet Post's panels are shot narrow
//     (phone-width layout, a 16:9 slice). The 11 holdouts are all Packet Post:
//       WIDE (4): the road maps (packets-1b-center, protocols-1b-key, routes-1b-journey, routes-2-sealed): the step is
//         the map, whose stop labels the game sets small at every width;
//       CAPPED (7): the cipher wheel (ciphers-1b-unknown, ciphers-1b-send: its ring letters are small at every
//         width), the scramble and the wheel's count tool (ciphers-2-crack), which sit apart with the wheel between
//         them, the bank letter's two badges (tricks-2-bank) and the router's sticker (locks-2-router), whose letter
//         or message and tiles together are taller than a phone-width slice.
const Z = await import('../../public/js/course-zoom.js');
const ZOOM_DATA = (await import('../../public/js/course-zoom-data.js')).default;
const FRAME_390 = 326;
// 2026-11-07: +1 each: the Sorting Gate captures now show the whole "Post Office" label (it was hidden under a road
// button), a longer line that the gate steps' boxes touch, and the padlock-road mission of 1b 1.2.
// r4: +1 capped: 2.3's cipher wheel is now a narrow capture (its letters read at 10 px, from 3), still a hair under 11.
// r5: +1 capped: the 1.2 mission is now the phone-width map protocols-1b-sealed-n3, whose labels read at 10 px when
// zoomed (the zoom cannot cut the map's other labels), up from about 5 px on the wide capture.
const SHORT = { WIDE: 5, CAPPED: 10 };
test('zoom-to-cue at 390: no cut line, every touched line whole, 11 px wherever the layout allows', () => {
  let n = 0;
  const short = { WIDE: 0, CAPPED: 0 }, problems = [];
  for (const band of ['1b', '2']) for (const f of fs.readdirSync(path.join(ROOT, 'seed-lessons', 'cyber-defenders', 'course', band))) {
    const deck = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons', 'cyber-defenders', 'course', band, f), 'utf8'));
    for (const key of ['slides', 'slides_first_time']) (deck[key] || []).forEach((s, i) => {
      const r = s.img && rects[s.img];
      if (!r || !s.focus || typeof r['~bodyFont'] !== 'number') return;
      assert.equal(ZOOM_DATA[s.img], r['~bodyFont'], `${s.img}: public/js/course-zoom-data.js is current (node scripts/cyber-zoom-data.mjs)`);
      const wf = path.join(ROOT, 'public', 'img', 'zoom', `${s.img}.json`);
      assert.deepEqual(JSON.parse(fs.readFileSync(wf, 'utf8')), r['~words'], `${s.img}: its word file is current`);
      const lines = Z.linesOf(r['~words']), view = s.view || [0, 0, 100, 100];
      // the picture at rest (its authored crop) cuts no line either
      const restCut = Z.cutLines(view, lines);
      assert.equal(restCut.length, 0, `${band}/${f} ${key}[${i}] (${s.img}): the crop [${view}] cuts a line of the game's text at [${restCut[0]}]`);
      s.focus.forEach((fo, fi) => {
        n++;
        const at = `${band}/${f} ${key}[${i}] step ${fi + 1} (${s.img})`;
        const z = Z.zoomFor(view, fo.box, r['~bodyFont'], r['~words'], FRAME_390);
        if (z && z.d) {
          assert.equal(z.cut.length, 0, `${at}: the zoom cuts ${z.cut.length} line(s) of the game's text`);
          const [x0, y0, w, h] = z.d, b = fo.box;
          for (const l of lines) {
            const touches = l[0] < b[0] + b[2] && l[0] + l[2] > b[0] && l[1] < b[1] + b[3] && l[1] + l[3] > b[1];
            if (touches) assert.ok(l[0] >= x0 - 0.05 && l[0] + l[2] <= x0 + w + 0.05 && l[1] >= y0 - 0.05 && l[1] + l[3] <= y0 + h + 0.05, `${at}: a line the box touches is not shown whole`);
          }
        }
        const px = z ? z.px : Z.textPx(r['~bodyFont'], view[2], FRAME_390);
        if (px >= Z.MIN_PX - 0.05) return;
        const maxW = r['~bodyFont'] * FRAME_390 / (Z.MIN_PX * 12.8);
        const b = fo.box, touch = lines.filter(l => l[0] < b[0] + b[2] && l[0] + l[2] > b[0] && l[1] < b[1] + b[3] && l[1] + l[3] > b[1]);
        const wide = Math.max(b[0] + b[2], ...touch.map(l => l[0] + l[2])) - Math.min(b[0], ...touch.map(l => l[0])) > maxW - 3.2;
        short[wide ? 'WIDE' : 'CAPPED']++;
        if (px < 5) problems.push(`${at}: ${px.toFixed(1)} px`);
      });
    });
  }
  assert.ok(n >= 250, `${n} toured steps checked`);
  assert.deepEqual(problems, [], 'no step reads under 5 px');
  assert.ok(short.WIDE <= SHORT.WIDE && short.CAPPED <= SHORT.CAPPED, `steps under 11 px: ${JSON.stringify(short)} (pinned ${JSON.stringify(SHORT)}): a new or wider box where a zoom cannot reach 11 px`);
});

// A narrow shot is a 16:9 slice of a phone-width page: its top and bottom edges fall between lines of text, never
// through one. Checked from the capture's own records: no word, and no text-bearing element's ink (a box that holds
// other boxes, like a card or a board, may run past the edge; a paragraph may too, when the edge falls between its
// lines: its words say so), touches the slice's top or bottom edge.
const SLICE_PARAGRAPHS = new Set(['cardp', 'say', 'body', 'li', 'dline']);
const SLICE_CONTAINERS = new Set(['card', 'pptiles', 'ppitem', 'ppletter', 'ppevents', 'wyropt', 'debrief', 'bar', 'tiles', 'seq', 'grid', 'epcard', 'clues', 'actions', 'row', 'board', 'table', 'shield', 'practice', 'ppletter', 'lock', 'tile', 'trow']);
test('narrow shots: the slice edges cut no line of text', () => {
  const E = 0.15, cut = [];
  let n = 0;
  for (const s of spec) {
    if (!s.narrow || s.narrow.top == null) continue;
    const key = `csq/${s.game}/${s.state}`, r = rects[key];
    assert.ok(r && Array.isArray(r['~words']), `${key}: the narrow capture recorded its words`);
    n++;
    const edge = (y, h) => (y <= E ? 'top' : y + h >= 100 - E ? 'bottom' : null);
    for (const w of r['~words']) { const e = edge(w[1], w[3]); if (e) cut.push(`${key}: a word cut at the ${e} (top ${s.narrow.top})`); }
    for (const [k, v] of Object.entries(r)) {
      if (!k.endsWith('~ink') || !Array.isArray(v)) continue;
      const stem = k.slice(0, -4).replace(/\d+$/, ''), e = edge(v[1], v[3]);
      if (e && !SLICE_CONTAINERS.has(stem) && !SLICE_PARAGRAPHS.has(stem)) cut.push(`${key}: ${k.slice(0, -4)}'s text cut at the ${e} (top ${s.narrow.top})`);
    }
  }
  assert.ok(n >= 90, `${n} narrow shots checked`);
  assert.deepEqual([...new Set(cut)], [], 'move the slice (narrow.top in scripts/cyber-shots-spec.json) so its edges fall between lines');
});
