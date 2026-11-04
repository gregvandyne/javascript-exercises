// CS Quest student course content (seed-lessons/cs-quest/course/<band>/<u.n>.json): the 38 kid-facing slide decks, one per
// course step (19 steps, lessons 1.1-6.3, in two grade bands). Each deck is read before its quick check and its game module.
// Checked here: the schema the course engine reads, 5-7 slides with exactly one worked example, one words slide and the
// mission last; the quick check is three exit items of the step's own lesson that exist in the unit bank; the game is the
// lesson file's game, chapter and params (6.1 and 6.3 have none and carry a talk prompt instead); lengths; kid-safe text
// (the real game scanner and the free-text filter over every string, no links, handles, long digit runs, brands, program
// name or standard codes); US spelling; and Robo Route's block names ("move", never the plan's "forward").
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

const ART = ['robot', 'grid', 'loop', 'branch', 'box', 'gears', 'bug', 'map', 'chart', 'table', 'magnifier', 'pencil', 'envelope', 'network', 'lock', 'shield', 'mask', 'key', 'cipher', 'chip', 'battery', 'screen', 'wrench', 'bits', 'pixel', 'people', 'globe', 'lightbulb', 'star', 'trophy'];
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
const stringsOf = d => [d.title, d.topic, d.talk, ...d.slides.flatMap(sl => [sl.title, sl.text, sl.say, ...(sl.steps || []), ...(sl.words || []).flatMap(w => [w.word, w.means])])].filter(s => s != null);
const sentences = t => t.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).filter(Boolean).length;

test('19 steps (lessons 1.1-6.3) in two bands: 38 files, nothing else in the course folder', () => {
  assert.equal(STEPS.length, 19);
  for (const d of decks) assert.ok(d.deck, `${path.relative(ROOT, d.file)} exists`);
  for (const band of BANDS) {
    const files = fs.readdirSync(path.join(DIR, band)).sort();
    assert.deepEqual(files, STEPS.map(s => `${s.n}.json`).sort(), `course/${band} holds exactly the 19 step files`);
  }
  assert.deepEqual(fs.readdirSync(DIR).sort(), BANDS);
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
    assert.ok(Array.isArray(d.slides) && d.slides.length >= 5 && d.slides.length <= 7, `${where}: 5-7 slides (${d.slides.length})`);
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
      const allowed = { text: ['title', 'text', 'art', 'say'], example: ['kind', 'title', 'text', 'art', 'steps', 'say'], words: ['kind', 'title', 'text', 'art', 'words', 'say'], mission: ['kind', 'title', 'text', 'art', 'say'] }[s.kind || 'text'];
      for (const k of Object.keys(s)) assert.ok(allowed.includes(k), `${at}: unexpected field ${k}`);
      assert.ok(typeof s.title === 'string' && s.title.length >= 3 && s.title.length <= 48, `${at}: title 3..48 chars: ${s.title}`);
      assert.ok(!titles.has(s.title.toLowerCase()), `${at}: slide titles differ inside a deck`); titles.add(s.title.toLowerCase());
      assert.ok(typeof s.text === 'string' && s.text.length >= 8 && s.text.length <= 280, `${at}: text 8..280 chars (${s.text.length})`);
      assert.ok(ART.includes(s.art), `${at}: art id ${s.art} is one the engine draws`);
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
