// CS Quest student course content (seed-lessons/cs-quest/course/<band>/<u.n>.json): the 38 kid-facing slide decks, one per
// course step (19 steps, lessons 1.1-6.3, in two grade bands). Each deck is read before its quick check and its game module.
// Checked here: the schema the course engine reads, 5-7 slides with exactly one worked example, one words slide and the
// mission last; the quick check is three exit items of the step's own lesson that exist in the unit bank; the game is the
// lesson file's game, chapter and params (6.1 and 6.3 have none and carry a talk prompt instead); lengths; kid-safe text
// (the real game scanner and the free-text filter over every string, no links, handles, long digit runs, brands, program
// name or standard codes); US spelling; and Robo Route's block names ("move", never the plan's "forward").
// The story pack adds two course-only steps (0.1 intro, 6.4 finale, defined in course/extras.json — no teacher
// lesson stands behind them) and one story transition beat before the mission of 1.5, 2.2, 3.3, 4.3, 5.3;
// those are checked in their own block at the end (story schema, scope, piece counts, extras items).
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CS = path.join(ROOT, 'seed-lessons/cs-quest');
const DIR = path.join(CS, 'course');
const { scanVersion } = await import('../../server/services/scanner.js');
const { cleanText } = await import('../../server/services/textfilter.js');

const ART = ['robot', 'grid', 'loop', 'branch', 'box', 'gears', 'bug', 'map', 'chart', 'table', 'magnifier', 'pencil', 'envelope', 'network', 'lock', 'shield', 'mask', 'key', 'cipher', 'chip', 'battery', 'screen', 'wrench', 'bits', 'pixel', 'people', 'globe', 'lightbulb', 'star', 'trophy', 'ruler', 'clock', 'coins', 'scale', 'cake', 'shapes', 'angle', 'dice', 'cat'];
const BANDS = ['1b', '2'];
const NO_GAME = ['6.1', '6.3'];
const GAME_TITLE = { 'robo-route': 'Robo Route', 'data-detective': 'Data Detective', 'packet-post': 'Packet Post', 'inside-the-machine': 'Inside the Machine' };
// the same rules as tests/unit/cs-quest-sets.test.js (kid-facing text)
const UK = /\b(colours?|coloured|colouring|favourites?|grey|labelled|licence|organis(e|ed|ing)|practis(e|ed|ing)|neighbours?|recognis(e|ed|ing)|maths|centre|metres?|behaviours?|honour|catalogue|analys(e|ed|ing)|defence|travelled|modelling|cancelled|jewellery|tyres?|whilst|learnt|spelt|programme)\b/i;
const BRAND = /\b(Bluetooth|Wi-?Fi|iPad|iPhone|Android|Chromebook|Windows|Google|YouTube|TikTok|Minecraft|Roblox|Fortnite|Lego|Nintendo|Xbox|PlayStation|Alexa|Siri)\b/i;
const BAD = [[/\d{7,}/, 'a 7+ digit run'], [/@/, 'an @'], [/\/\/\w[\w.-]*\.\w{2,}/, 'a //host.tld link'], [/https?:/i, 'a URL scheme'], [/\bwww\./i, 'a www. link'],
  [/\btype your password\b/i, '"type your password"'], [/\bgrown-?ups?\b/i, '"grown-up" (say "trusted adult")'], [/CS Quest/i, 'the program name'],
  [/\b(1B|2)-(AP|CS|DA|IC|NI)-\d\d\b/i, 'a standards code'], [/\bCSTA\b/, 'a standards body']];

const units = JSON.parse(fs.readFileSync(path.join(CS, 'units.json'), 'utf8')).units;
const STEPS = units.filter(u => u.n >= 1 && u.n <= 6).flatMap(u => u.lessons.map(l => ({ n: l.n, short: l.short, unit: u.n })));
const banks = fs.readdirSync(path.join(CS, 'sets')).filter(f => /^u\d-(1b|2)\.json$/.test(f)).map(f => JSON.parse(fs.readFileSync(path.join(CS, 'sets', f), 'utf8')));
const itemById = new Map(banks.flatMap(b => b.items.map(it => [it.id, { ...it, bank: b.id }])));
const lessonOf = (n, band) => JSON.parse(fs.readFileSync(path.join(CS, 'lessons', `${n}-${band}.json`), 'utf8'));
const decks = [];
for (const band of BANDS) for (const s of STEPS) {
  const file = path.join(DIR, band, `${s.n}.json`);
  decks.push({ band, step: s, file, deck: fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null });
}
const stringsOf = d => [d.title, d.topic, d.talk, ...d.slides.flatMap(sl => [sl.title, sl.text, sl.say, sl.alt, ...(sl.steps || []), ...(sl.focus || []).map(f => f.cue), ...(sl.words || []).flatMap(w => [w.word, w.means])])].filter(s => s != null);
// Slide pictures (the image plan): a slide may carry img (a csq/<game>/<state> manifest key) + alt. The manifest is
// the register of captured in-game shots; the file lives at public/img/<key>.webp.
const IMG_KEY = /^csq\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'img', 'csq', 'manifest.json'), 'utf8'));
const EXTRAS = JSON.parse(fs.readFileSync(path.join(DIR, 'extras.json'), 'utf8'));
const EXTRA_STEPS = EXTRAS.steps.filter(x => /^after-/.test(x.pos));
const manifestByKey = new Map((MANIFEST.images || []).map(e => [e.key, e]));
const sentences = t => t.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).filter(Boolean).length;

test('19 steps (lessons 1.1-6.3) in two bands: 38 files, plus the two story steps and extras.json', () => {
  assert.equal(STEPS.length, 19);
  for (const d of decks) assert.ok(d.deck, `${path.relative(ROOT, d.file)} exists`);
  for (const band of BANDS) {
    const files = fs.readdirSync(path.join(DIR, band)).sort();
    // Course-only practice steps (extras.json, pos "after-<n>") add a file in the bands they name: Pro 3.4 Fair Data.
    const extra = EXTRA_STEPS.filter(x => x.bands.includes(band)).map(x => `${x.n}.json`);
    assert.deepEqual(files, STEPS.map(s => `${s.n}.json`).concat(['0.1.json', '6.4.json'], extra).sort(), `course/${band} holds the 19 step files, the two story steps and its practice steps`);
  }
  assert.deepEqual(fs.readdirSync(DIR).sort(), BANDS.concat(['extras.json']).sort());
});

test('every deck matches the schema: key, n, band, title, topic, minutes, slides, check, game / talk', () => {
  for (const { band, step, deck: d } of decks) {
    const where = `${band}-${step.n}`;
    const keys = ['key', 'n', 'band', 'title', 'topic', 'minutes', 'slides', 'check', 'game'].concat(NO_GAME.includes(step.n) ? ['talk'] : []);
    assert.deepEqual(Object.keys(d), keys, `${where}: fields in order`);
    assert.equal(d.key, `${band}-${step.n}`); assert.equal(d.n, step.n); assert.equal(d.band, band);
    const lesson = lessonOf(step.n, band);
    assert.equal(d.title, lesson.name.replace(/\s*\(.*\)\s*$/, ''), `${where}: title is the lesson's name without the parenthesis`);
    assert.equal(d.topic, step.short, `${where}: topic is the catalogue's short name`);
    assert.ok(Number.isInteger(d.minutes) && d.minutes >= 4 && d.minutes <= 10, `${where}: minutes 4..10`);
    assert.ok(d.title.length <= 40 && d.topic.length <= 30);
  }
});

test('5-7 slides: one worked example with chips, one words slide with 2-4 words, the mission last; art ids and lengths', () => {
  for (const { band, step, deck: d } of decks) {
    const where = `${band}-${step.n}`;
    // A deck with a story transition beat carries one extra slide (the beat sits before the mission).
    const beats = d.slides.filter(s => s.story && s.story.scene === 'handoff').length;
    // or with one wide picture split across two slides in a row, each through its own crop
    const split = d.slides.filter((s, i) => i && s.img && s.img === d.slides[i - 1].img && s.view && d.slides[i - 1].view && String(s.view) !== String(d.slides[i - 1].view)).length;
    assert.ok(Array.isArray(d.slides) && d.slides.length >= 5 && (d.slides.length <= 7 || (d.slides.length === 8 && (beats === 1 || split === 1))), `${where}: 5-7 slides, 8 with a story beat or a split picture (${d.slides.length})`);
    const kinds = d.slides.map(s => s.kind || 'text');
    assert.equal(kinds.filter(k => k === 'example').length, 1, `${where}: one example slide`);
    assert.equal(kinds.filter(k => k === 'words').length, 1, `${where}: one words slide`);
    assert.equal(kinds.filter(k => k === 'mission').length, 1, `${where}: one mission slide`);
    assert.equal(kinds.at(-1), 'mission', `${where}: the mission is last`);
    assert.ok(kinds.every(k => ['text', 'example', 'words', 'mission'].includes(k)), `${where}: known kinds only`);
    let short = 0;
    const titles = new Set();
    for (const [i, s] of d.slides.entries()) {
      const at = `${where} slide ${i + 1}`;
      const allowed = { text: ['title', 'text', 'art', 'say', 'img', 'view', 'alt', 'focus', 'story'], example: ['kind', 'title', 'text', 'art', 'steps', 'say', 'img', 'view', 'alt', 'focus', 'story'], words: ['kind', 'title', 'text', 'art', 'words', 'say', 'img', 'view', 'alt', 'focus', 'story'], mission: ['kind', 'title', 'text', 'art', 'say', 'img', 'view', 'alt', 'focus', 'story'] }[s.kind || 'text'];
      if (s.view !== undefined) assert.ok(s.img && Array.isArray(s.view) && s.view.length === 4 && s.view.every(n => typeof n === 'number'), `${at}: view is [x, y, w, h] in % of its img`);
      for (const k of Object.keys(s)) assert.ok(allowed.includes(k), `${at}: unexpected field ${k}`);
      assert.ok(typeof s.title === 'string' && s.title.length >= 3 && s.title.length <= 48, `${at}: title 3..48 chars: ${s.title}`);
      assert.ok(!titles.has(s.title.toLowerCase()), `${at}: slide titles differ inside a deck`); titles.add(s.title.toLowerCase());
      assert.ok(typeof s.text === 'string' && s.text.length >= 8 && s.text.length <= 280, `${at}: text 8..280 chars (${s.text.length})`);
      assert.ok(ART.includes(s.art), `${at}: art id ${s.art} is one the engine draws`);
      if (s.img != null || s.alt != null) {
        assert.ok(typeof s.img === 'string' && IMG_KEY.test(s.img), `${at}: img ${JSON.stringify(s.img)} is a csq/<game>/<state> key`);
        assert.ok(typeof s.alt === 'string' && s.alt.trim() === s.alt && s.alt.length >= 1 && s.alt.length <= 160, `${at}: an img slide needs its alt, 1-160 chars`);
        const entry = manifestByKey.get(s.img);
        assert.ok(entry, `${at}: img ${s.img} is registered in public/img/csq/manifest.json`);
        assert.equal(entry.alt, s.alt, `${at}: the deck alt matches the manifest alt for ${s.img}`);
        assert.ok(fs.existsSync(path.join(ROOT, 'public', 'img', `${s.img}.webp`)), `${at}: public/img/${s.img}.webp exists`);
      }
      if (s.focus != null) {
        // Guided focus: animation steps over the slide's picture. Only on a pictured slide; the geometry is in
        // % of the 16:9 frame and must stay inside it, matching what cleanSlide() keeps.
        assert.ok(s.img, `${at}: focus needs the slide's img`);
        assert.ok(Array.isArray(s.focus) && s.focus.length >= 1 && s.focus.length <= 4, `${at}: 1-4 focus steps`);
        for (const [fi, f] of s.focus.entries()) {
          const fat = `${at} focus ${fi + 1}`;
          assert.deepEqual(Object.keys(f).sort(), f.path ? ['box', 'cue', 'path'] : ['box', 'cue'], `${fat}: cue, box, optional path only`);
          assert.ok(typeof f.cue === 'string' && f.cue.trim() === f.cue && f.cue.length >= 1 && f.cue.length <= 80, `${fat}: cue 1-80 chars, trimmed`);
          assert.ok(Array.isArray(f.box) && f.box.length === 4 && f.box.every(v => typeof v === 'number' && Number.isFinite(v)), `${fat}: box is 4 numbers`);
          const [x, y, w, h] = f.box;
          assert.ok(x >= 0 && y >= 0 && w >= 2 && h >= 2 && x + w <= 100 && y + h <= 100, `${fat}: box inside the frame, at least 2% wide/tall`);
          if (f.path != null) {
            assert.ok(Array.isArray(f.path) && f.path.length >= 2 && f.path.length <= 16, `${fat}: path of 2-16 points`);
            for (const p of f.path) assert.ok(Array.isArray(p) && p.length === 2 && p.every(v => typeof v === 'number' && v >= 0 && v <= 100), `${fat}: path points in % inside the frame`);
          }
        }
      }
      if (s.say != null) assert.ok(typeof s.say === 'string' && s.say.length >= 8 && s.say.length <= 400 && s.say !== s.text, `${at}: say differs from text, <= 400 chars`);
      const n = sentences(s.text);
      assert.ok(n <= 4, `${at}: at most 4 sentences (${n}): ${s.text}`);
      if (n <= 3) short++;
      for (const str of [s.title, s.text, s.say].filter(Boolean)) assert.equal(str, str.trim(), `${at}: no stray spaces`);
      if (s.kind === 'example') {
        assert.ok(Array.isArray(s.steps) && s.steps.length >= 2 && s.steps.length <= 8, `${at}: 2-8 chips`);
        for (const c of s.steps) assert.ok(typeof c === 'string' && c.trim() === c && c.length >= 1 && c.length <= 60, `${at}: chip 1..60 chars: ${c}`);
      }
      if (s.kind === 'words') {
        assert.ok(Array.isArray(s.words) && s.words.length >= 2 && s.words.length <= 4, `${at}: 2-4 words`);
        const seen = new Set();
        for (const w of s.words) {
          assert.deepEqual(Object.keys(w), ['word', 'means'], `${at}: word, means`);
          assert.ok(w.word.length >= 2 && w.word.length <= 30 && w.means.length >= 6 && w.means.length <= 120, `${at}: ${w.word}: lengths`);
          assert.ok(!seen.has(w.word.toLowerCase()), `${at}: ${w.word} twice`); seen.add(w.word.toLowerCase());
        }
      }
    }
    assert.ok(short >= d.slides.length - 1, `${where}: most slides are 1-3 sentences`);
  }
});

test('the quick check is three exit items of the step own lesson, in the unit bank of the band', () => {
  for (const { band, step, deck: d } of decks) {
    const where = `${band}-${step.n}`;
    assert.ok(Array.isArray(d.check) && d.check.length === 3 && new Set(d.check).size === 3, `${where}: three different ids`);
    const lesson = lessonOf(step.n, band);
    assert.deepEqual(d.check, lesson.exit.items, `${where}: the lesson's exit items`);
    for (const id of d.check) {
      const it = itemById.get(id);
      assert.ok(it, `${where}: ${id} exists in a bank`);
      assert.equal(it.bank, `csq-u${step.unit}-${band}`, `${where}: ${id} is in the unit bank of the band`);
      assert.equal(it.lesson, step.n, `${where}: ${id} belongs to lesson ${step.n}`);
    }
  }
});

test('the game module is the lesson file game, chapter and params; 6.1 and 6.3 have none and a talk prompt', () => {
  for (const { band, step, deck: d } of decks) {
    const where = `${band}-${step.n}`;
    const lesson = lessonOf(step.n, band);
    if (NO_GAME.includes(step.n)) {
      assert.equal(d.game, null, `${where}: no game`);
      assert.notEqual(lesson.play.type, 'game');
      assert.ok(typeof d.talk === 'string' && d.talk.length >= 20 && d.talk.length <= 280 && /\?$/.test(d.talk), `${where}: a talk prompt that asks something`);
      continue;
    }
    assert.equal(lesson.play.type, 'game');
    assert.deepEqual(d.game, { slug: lesson.play.game, chapter: lesson.play.chapter, params: lesson.params }, `${where}: game matches the lesson`);
    assert.match(d.game.params, new RegExp(`(^|&)chapter=${d.game.chapter}(&|$)`), `${where}: params name the chapter`);
    assert.match(d.game.params, new RegExp(`(^|&)band=${band}(&|$)`), `${where}: params name the band`);
    assert.match(d.game.params, /(^|&)lock=1(&|$)/, `${where}: params lock the chapter`);
    assert.ok(fs.existsSync(path.join(ROOT, 'seed-games', `${d.game.slug}.html`)), `${where}: ${d.game.slug} exists`);
    // the mission names the game and its chapter as the game shows them
    const mission = d.slides.at(-1).text;
    assert.ok(mission.includes(GAME_TITLE[d.game.slug]), `${where}: the mission names ${GAME_TITLE[d.game.slug]}`);
    assert.ok(mission.includes(lesson.play.chapterTitle), `${where}: the mission names the chapter ${lesson.play.chapterTitle}`);
    const strings = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/data/cs-quest', d.game.slug, 'en.json'), 'utf8')).strings;
    assert.ok(strings.includes(lesson.play.chapterTitle), `${where}: ${lesson.play.chapterTitle} is the game's own chapter name`);
  }
});

test('Robo Route steps name the blocks as the shelf shows them: "move", never "forward"', () => {
  const strings = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/data/cs-quest/robo-route/en.json'), 'utf8')).strings;
  for (const block of ['move', 'turn left', 'turn right', 'pick up', 'repeat', 'repeat until goal', 'if', 'else', 'when', 'set', 'change by', 'My Block', 'call', 'path ahead']) assert.ok(strings.includes(block), `Robo Route shows the block "${block}"`);
  for (const { band, step, deck: d } of decks) {
    if (!d.game || d.game.slug !== 'robo-route') continue;
    for (const s of stringsOf(d)) assert.ok(!/\bforward\b/i.test(s), `${band}-${step.n}: say "move", not "forward": ${s}`);
  }
});

test('kid-safe text: no links, handles, digit runs, brands, program name or codes; US spelling; textfilter and the real scanner accept every string', () => {
  const all = [];
  for (const { band, step, deck: d } of decks) {
    for (const s of stringsOf(d)) {
      const where = `${band}-${step.n}`;
      assert.equal(typeof s, 'string');
      all.push(s);
      for (const [re, why] of BAD) assert.ok(!re.test(s), `${where} has ${why}: ${s}`);
      assert.ok(!UK.test(s), `${where}: US spelling please: ${s}`);
      assert.ok(!BRAND.test(s), `${where}: no brand names: ${s}`);
      const c = cleanText(s, 1000);
      assert.ok(c.ok, `${where}: the text filter refuses (${c.error}): ${s}`);
      assert.equal(c.value, s, `${where}: survives the filter unchanged`);
    }
  }
  const r = scanVersion(`<title>T</title><canvas></canvas><script>const S=${JSON.stringify(all)};</script>`);
  assert.equal(r.status, 'pass', JSON.stringify(r.issues || r, null, 1));
});

test('Explorer decks read at a grade 3-5 level: short sentences', () => {
  for (const { band, step, deck: d } of decks) {
    if (band !== '1b') continue;
    for (const s of d.slides) {
      const parts = s.text.split(/(?<=[.!?])\s+/);
      for (const p of parts) assert.ok(p.split(/\s+/).length <= 26, `1b-${step.n} "${s.title}": a sentence of ${p.split(/\s+/).length} words: ${p}`);
    }
  }
});

test('the csq picture manifest is well formed: complete entries, files on disk, near the weight budget', () => {
  const seen = new Set();
  for (const e of MANIFEST.images || []) {
    assert.ok(e && IMG_KEY.test(e.key || ''), `manifest: key ${JSON.stringify(e && e.key)} is csq/<game>/<state>`);
    assert.ok(!seen.has(e.key), `manifest: ${e.key} twice`); seen.add(e.key);
    for (const f of ['game', 'chapter', 'band', 'state', 'concept']) assert.ok(typeof e[f] === 'string' && e[f], `manifest ${e.key}: ${f} present`);
    assert.ok(typeof e.alt === 'string' && e.alt.length >= 1 && e.alt.length <= 160, `manifest ${e.key}: alt 1-160 chars`);
    const file = path.join(ROOT, 'public', 'img', `${e.key}.webp`);
    assert.ok(fs.existsSync(file), `manifest ${e.key}: public/img/${e.key}.webp exists`);
    assert.ok(fs.statSync(file).size <= 200 * 1024, `manifest ${e.key}: WebP under the 200 KB hard limit`);
  }
});

// --------------------------------------------------------------------------------------------------- story pack
// The story layer: `story` fields are valid everywhere they appear, appear ONLY where the pack puts them
// (the intro, the finale, and one handoff beat in each of 1.5 / 2.2 / 3.3 / 4.3 / 5.3 — teaching slides keep
// guided focus only), and the two course-only steps match extras.json.
const CHAR_IDS = ['bolt', 'dot', 'pim', 'gizmo'];
const SCENES = ['dim', 'drain', 'team', 'map', 'handoff', 'relight', 'celebrate', 'finale'];
// Bolt's piece lights when Robo Route is done (2.2, after the Bug Hunters and the Level Maker), not at 1.5: one world, one
// piece. The Spark itself comes back once, in the finale (6.4), after Gizmo's piece is the fourth one lit at 5.3.
const BEAT_LIT = { '1.5': 0, '2.2': 1, '3.3': 2, '4.3': 3, '5.3': 4 };
function checkStory(st, at) {
  assert.ok(st && typeof st === 'object' && !Array.isArray(st), `${at}: a story object`);
  for (const k of Object.keys(st)) assert.ok(['scene', 'lit', 'chars', 'out', 'in', 'fly'].includes(k), `${at}: unexpected story field ${k}`);
  assert.ok(SCENES.includes(st.scene), `${at}: scene ${st.scene} is known`);
  assert.ok(Number.isInteger(st.lit) && st.lit >= 0 && st.lit <= 4, `${at}: lit 0-4`);
  assert.ok(Array.isArray(st.chars) && st.chars.length <= 4 && st.chars.every(c => CHAR_IDS.includes(c)) && new Set(st.chars).size === st.chars.length, `${at}: chars are known, unique, at most 4`);
  for (const k of ['out', 'in', 'fly']) if (st[k] != null) assert.ok(CHAR_IDS.includes(st[k]), `${at}: ${k} names a character`);
  if (st.fly != null) assert.equal(CHAR_IDS[st.lit - 1], st.fly, `${at}: the flown piece is the one this scene lights`);
}
test('story scope: beats only in the five unit decks, before the mission, with the pack\'s piece counts', () => {
  // A practice step that follows a beat step (Pro 3.4 after 3.3) takes over its beat: the handoff closes the unit.
  const all = decks.map(d => ({ band: d.band, step: d.step, deck: d.deck }));
  for (const x of EXTRA_STEPS) for (const band of x.bands) all.push({ band, step: { n: x.n }, deck: JSON.parse(fs.readFileSync(path.join(DIR, band, `${x.n}.json`), 'utf8')), after: x.pos.slice(6) });
  const movedFrom = new Set(all.filter(a => a.after && a.after in BEAT_LIT).map(a => `${a.band}-${a.after}`));
  for (const { band, step, deck: d, after } of all) {
    const where = `${band}-${step.n}`;
    const withStory = d.slides.map((s, i) => [s, i]).filter(([s]) => s.story != null);
    const beatN = after && after in BEAT_LIT ? after : step.n;
    if (!(beatN in BEAT_LIT) || movedFrom.has(where)) { assert.equal(withStory.length, 0, `${where}: no story slides outside the story steps and beats`); continue; }
    assert.equal(withStory.length, 1, `${where}: exactly one beat slide`);
    const [beat, i] = withStory[0];
    assert.equal(i, d.slides.length - 2, `${where}: the beat sits right before the mission`);
    checkStory(beat.story, `${where} beat`);
    assert.equal(beat.story.scene, 'handoff', `${where}: the beat is a handoff`);
    assert.ok(beat.story.out, `${where}: the beat names the outgoing character`);
    assert.equal(beat.story.lit, BEAT_LIT[beatN], `${where}: ${BEAT_LIT[beatN]} piece(s) lit after this beat`);
  }
});

test('the story steps (0.1, 6.4): extras.json defines them, the decks match it, the items are sound and kid-safe', () => {
  const extras = JSON.parse(fs.readFileSync(path.join(DIR, 'extras.json'), 'utf8'));
  assert.deepEqual(extras.steps.filter(x => !/^after-/.test(x.pos)).map(x => [x.n, x.pos, x.unit]), [['0.1', 'first', 1], ['6.4', 'last', 6]], 'the intro opens the course, the finale closes it');
  const kidSafe = (s, at) => {
    for (const [re, why] of BAD) assert.ok(!re.test(s), `${at} has ${why}: ${s}`);
    assert.ok(!UK.test(s), `${at}: US spelling please: ${s}`);
    assert.ok(!BRAND.test(s), `${at}: no brand names: ${s}`);
    const c = cleanText(s, 1000); assert.ok(c.ok && c.value === s, `${at}: the text filter refuses: ${s}`);
  };
  for (const x of extras.steps.filter(x => !/^after-/.test(x.pos))) {
    for (const band of BANDS) {
      const where = `${band}-${x.n}`;
      const items = x.items[band];
      assert.ok(Array.isArray(items) && items.length === 3, `${where}: three check items in extras.json`);
      assert.deepEqual(items.map(it => it.id), [1, 2, 3].map(k => `${band}-${x.n}-e${k}`), `${where}: item ids`);
      for (const it of items) {
        assert.ok(typeof it.q === 'string' && it.q.length >= 8 && it.q.length <= 200, `${where} ${it.id}: a real question`);
        assert.ok(Array.isArray(it.choices) && it.choices.length === 4 && new Set(it.choices).size === 4, `${where} ${it.id}: four different choices`);
        assert.ok(Number.isInteger(it.answer) && it.answer >= 0 && it.answer <= 3, `${where} ${it.id}: the answer is one of the choices`);
        kidSafe(it.q, `${where} ${it.id}`); for (const ch of it.choices) kidSafe(ch, `${where} ${it.id}`);
      }
      const d = JSON.parse(fs.readFileSync(path.join(DIR, band, `${x.n}.json`), 'utf8'));
      assert.deepEqual(Object.keys(d), ['key', 'n', 'band', 'title', 'topic', 'minutes', 'slides', 'check', 'game', 'talk'], `${where}: fields in order`);
      assert.equal(d.key, where); assert.equal(d.n, x.n); assert.equal(d.band, band);
      assert.equal(d.title, x.title, `${where}: title from extras.json`); assert.equal(d.topic, x.topic, `${where}: topic from extras.json`);
      assert.ok(Number.isInteger(d.minutes) && d.minutes >= 4 && d.minutes <= 10, `${where}: minutes 4..10`);
      assert.equal(d.game, null, `${where}: no game module`);
      assert.ok(typeof d.talk === 'string' && d.talk.length >= 20 && d.talk.length <= 280 && /\?$/.test(d.talk), `${where}: a talk prompt that asks something`);
      assert.deepEqual(d.check, items.map(it => it.id), `${where}: the check is the extras items`);
      const kinds = d.slides.map(s => s.kind || 'text');
      assert.ok(d.slides.length >= 5 && d.slides.length <= 7, `${where}: 5-7 slides`);
      assert.equal(kinds.filter(k => k === 'example').length, 1, `${where}: one example`);
      assert.equal(kinds.filter(k => k === 'words').length, 1, `${where}: one words slide`);
      assert.equal(kinds.at(-1), 'mission', `${where}: the mission is last`);
      const titles = new Set();
      for (const [i, s] of d.slides.entries()) {
        const at = `${where} slide ${i + 1}`;
        assert.ok(typeof s.title === 'string' && s.title.length >= 3 && s.title.length <= 48 && !titles.has(s.title.toLowerCase()), `${at}: title 3..48, unique`); titles.add(s.title.toLowerCase());
        assert.ok(typeof s.text === 'string' && s.text.length >= 8 && s.text.length <= 280, `${at}: text 8..280 chars`);
        assert.ok(sentences(s.text) <= 4, `${at}: at most 4 sentences`);
        assert.ok(ART.includes(s.art), `${at}: art id known`);
        if (s.story != null) checkStory(s.story, at);
        if (s.img != null) {
          const entry = manifestByKey.get(s.img);
          assert.ok(entry && entry.alt === s.alt, `${at}: img registered, alt matches the manifest`);
          assert.ok(fs.existsSync(path.join(ROOT, 'public', 'img', `${s.img}.webp`)), `${at}: the picture exists`);
        }
        if (s.kind === 'example') assert.ok(Array.isArray(s.steps) && s.steps.length >= 2 && s.steps.length <= 8, `${at}: 2-8 chips`);
        if (s.kind === 'words') assert.ok(Array.isArray(s.words) && s.words.length >= 2 && s.words.length <= 4, `${at}: 2-4 words`);
      }
      for (const s of stringsOf(d)) kidSafe(s, where);
      // The pack's scene arc, per step.
      const scenes = d.slides.filter(s => s.story).map(s => s.story.scene);
      if (x.n === '0.1') assert.deepEqual(scenes, ['dim', 'drain', 'team', 'map'], `${where}: the intro arc`);
      if (x.n === '6.4') assert.deepEqual(scenes, ['relight', 'celebrate', 'finale'], `${where}: the finale arc`);
    }
  }
});
