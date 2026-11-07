// Number Quest Explorer decks B (seed-lessons/number-quest): Units 3-4 (6 decks, single Explorer band),
// in the Cyber Defenders deck idiom and mirroring number-quest-decks-a.test.js. Checked here: each deck
// matches units.json (title, topic, game module and locked standards), the deck schema (5-7 slides,
// exactly one worked example opening with a rough estimate, one words slide with four words, one flagged
// Stretch slide, the mission last), the quick check is the step's own three bank items whose cat is one
// of the step's LOCKED primary codes (standards.json explorerCodes), every distractor carries a
// misconception tag, kid-safe text (US spelling, no brands, links, codes or framework names in anything
// a child reads), the unit Jumble beats (3.3 races itself, 4.3 adds the bottoms too), and the media
// rule (Greg, 2026-11-05; docs/decisions.md): drawn diagrams teach, real pictures carry missions and
// story — the pictorial step on a TEACHING slide is a DRAWN diagram (slide.visual) with guided focus
// (slide.focus) over it; the MISSION slide carries a real screenshot of the assigned game in its
// assigned mode (slide.img, an nq/<game>/<state> key from public/img/nq/manifest.json, captured by
// scripts/nq-shots.js); a STORY slide may carry the story stage (slide.story). No other slide carries
// img or story, and neither ever displaces a drawn diagram or its focus. Unit 4 missions wire to
// Fraction Factory, which IS present in seed-games (built in parallel): the chapter names in units.json
// (First Cuts, Re-Slice, Recipe Math) must be real chapters in the game file.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const NQ = path.join(ROOT, 'seed-lessons/number-quest');
const ART = ['robot', 'grid', 'loop', 'branch', 'box', 'gears', 'bug', 'map', 'chart', 'table', 'magnifier', 'pencil', 'envelope', 'network', 'lock', 'shield', 'mask', 'key', 'cipher', 'chip', 'battery', 'screen', 'wrench', 'bits', 'pixel', 'people', 'globe', 'lightbulb', 'star', 'trophy', 'ruler', 'clock', 'coins', 'scale', 'cake', 'shapes', 'angle', 'dice', 'cat'];
const UK = /\b(colours?|coloured|colouring|favourites?|grey|labelled|licence|organis(e|ed|ing)|practis(e|ed|ing)|neighbours?|recognis(e|ed|ing)|maths|centre|metres?|behaviours?|honour|catalogue|analys(e|ed|ing)|defence|travelled|modelling|cancelled|jewellery|tyres?|whilst|learnt|spelt|programme)\b/i;
const BRAND = /\b(Bluetooth|Wi-?Fi|iPad|iPhone|Android|Chromebook|Windows|Google|YouTube|TikTok|Minecraft|Roblox|Fortnite|Lego|Nintendo|Xbox|PlayStation|Alexa|Siri|Duolingo)\b/i;
const BAD = [[/\d{7,}/, 'a 7+ digit run'], [/@/, 'an @'], [/\/\/\w[\w.-]*\.\w{2,}/, 'a //host.tld link'], [/https?:/i, 'a URL scheme'], [/\bwww\./i, 'a www. link'],
  [/Common Core|CCSS/i, 'a framework name'], [/\b[3-5]\.(OA|NBT|NF|MD|G)\.[A-D]\.\d\b/, 'a CCSS-M code'], [/\bMP[1-8]\b/, 'a practice code']];

const cat = JSON.parse(fs.readFileSync(path.join(NQ, 'units.json'), 'utf8'));
const reg = JSON.parse(fs.readFileSync(path.join(NQ, 'standards.json'), 'utf8'));
const locked = new Set(Object.keys(reg.explorerCodes.codes));
const STEPS = ['3.1', '3.2', '3.3', '4.1', '4.2', '4.3'].map(n => {
  const u = cat.units.find(x => x.steps.some(s => s.n === n));
  return { ...u.steps.find(s => s.n === n), unit: u.n };
});
const banks = new Map();
for (const f of fs.readdirSync(path.join(NQ, 'sets')).filter(f => /^u\d-explorer\.json$/.test(f))) {
  const b = JSON.parse(fs.readFileSync(path.join(NQ, 'sets', f), 'utf8'));
  banks.set(b.id, b);
}
const itemById = new Map([...banks.values()].flatMap(b => b.items.map(it => [it.id, { ...it, bankFile: b.id }])));
const decks = STEPS.map(step => {
  const file = path.join(NQ, 'course', 'explorer', `${step.n}.json`);
  return { step, file, deck: fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null };
});
const stringsOf = d => [d.title, d.topic, d.talk, ...d.slides.flatMap(sl => [sl.title, sl.text, ...(sl.steps || []), ...(sl.words || []).flatMap(w => [w.word, w.means]), sl.visual ? sl.visual.label : null, ...(sl.focus || []).map(f => f.cue)])].filter(s => s != null);
const sentences = t => t.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).filter(Boolean).length;

test('decks B: 6 deck files (units 3-4), one bank per unit, 18 check items in units 3-4', () => {
  for (const d of decks) assert.ok(d.deck, `${path.relative(ROOT, d.file)} exists`);
  for (const u of [3, 4]) assert.ok(banks.has(`nq-u${u}-explorer`), `sets/u${u}-explorer.json exists`);
  const bItems = [...itemById.values()].filter(it => ['3', '4'].includes(it.lesson[0]));
  assert.equal(bItems.length, 18, 'three check items per deck');
});

test('every deck matches the catalogue: key, title, topic, minutes, game', () => {
  for (const { step, deck: d } of decks) {
    const where = `explorer-${step.n}`;
    assert.equal(d.key, `explorer-${step.n}`); assert.equal(d.n, step.n); assert.equal(d.band, 'explorer');
    assert.equal(d.title, step.titles.explorer, `${where}: catalogue title`);
    assert.equal(d.topic, step.shorts.explorer, `${where}: catalogue topic`);
    assert.ok(Number.isInteger(d.minutes) && d.minutes >= 4 && d.minutes <= 10, `${where}: minutes 4..10`);
    const spec = step.game.explorer;
    assert.ok(spec, `${where}: a game in units.json`);
    assert.equal(d.game.slug, spec.slug, `${where}: game slug matches units.json`);
    assert.equal(d.game.chapter, spec.chapter, `${where}: game chapter matches units.json`);
    assert.ok(fs.existsSync(path.join(ROOT, 'seed-games', `${spec.slug}.html`)) || fs.existsSync(path.join(ROOT, 'seed-games', `${spec.slug}.json`)), `${where}: ${spec.slug} exists`);
    const mission = d.slides.at(-1).text;
    assert.ok(mission.includes(spec.chapterTitle), `${where}: the mission names the chapter as units.json shows it (${spec.chapterTitle})`);
  }
});

test('Fraction Factory chapters named in units.json are real chapters in the game file', () => {
  const ff = fs.readFileSync(path.join(ROOT, 'seed-games/fraction-factory.html'), 'utf8');
  for (const n of ['4.1', '4.2', '4.3']) {
    const spec = STEPS.find(s => s.n === n).game.explorer;
    assert.equal(spec.slug, 'fraction-factory');
    assert.ok(ff.includes(`title: '${spec.chapter}'`), `fraction-factory has a chapter titled ${spec.chapter}`);
  }
});

test('5-7 slides: one example, one words slide with four words, one Stretch slide, the mission last; diagrams teach, missions and story carry the real pictures', () => {
  for (const { step, deck: d } of decks) {
    const where = `explorer-${step.n}`;
    assert.ok(d.slides.length >= 5 && d.slides.length <= 7, `${where}: 5-7 slides`);
    const kinds = d.slides.map(s => s.kind || 'text');
    assert.equal(kinds.filter(k => k === 'example').length, 1, `${where}: one example`);
    assert.equal(kinds.filter(k => k === 'words').length, 1, `${where}: one words slide`);
    assert.equal(kinds.filter(k => k === 'mission').length, 1, `${where}: one mission`);
    assert.equal(kinds.at(-1), 'mission', `${where}: mission last`);
    assert.equal(d.slides.filter(s => /^Stretch:/.test(s.title)).length, 1, `${where}: one flagged Stretch slide (never in the check)`);
    const titles = new Set();
    for (const [i, s] of d.slides.entries()) {
      const at = `${where} slide ${i + 1}`;
      // The media rule itself (Greg, 2026-11-05; docs/decisions.md): an img belongs on the mission
      // slide only, and the mission of a deck with a game must carry one — the assigned game's own
      // screenshot, an nq/<that game>/<state> key, with a truthful alt. A story layer belongs on story
      // beats only and never displaces a drawn diagram (the teaching visual) or its guided focus; in
      // these decks a story is Tally alone on the Numberworks street.
      if ('img' in s) {
        assert.equal(s.kind, 'mission', `${at}: a screenshot belongs on the mission slide only`);
        assert.ok(d.game && s.img.startsWith(`nq/${d.game.slug}/`), `${at}: img ${s.img} is the assigned game's own key`);
        assert.ok(typeof s.alt === 'string' && s.alt.length >= 10 && s.alt.length <= 160, `${at}: a truthful alt of 10..160 chars`);
      }
      if (s.kind === 'mission') assert.equal('img' in s, !!d.game, `${at}: the mission carries its game's screenshot (and a game-less mission carries none)`);
      if ('story' in s) {
        assert.ok(!('visual' in s) && !('img' in s) && !('focus' in s), `${at}: story never displaces a drawn diagram, a screenshot or guided focus`);
        assert.equal(s.story.scene, 'street', `${at}: the Numberworks street scene`);
        assert.deepEqual(s.story.chars, ['tally'], `${at}: Tally alone on the street`);
        assert.ok(Number.isInteger(s.story.lit) && s.story.lit >= 0 && s.story.lit <= 4, `${at}: street lit 0..4`);
      }
      assert.ok(!('focus' in s) || 'visual' in s, `${at}: guided focus only ever sits on a drawn diagram in these decks`);
      assert.ok(typeof s.title === 'string' && s.title.length >= 3 && s.title.length <= 48, `${at}: title 3..48`);
      assert.ok(!titles.has(s.title.toLowerCase()), `${at}: titles differ`); titles.add(s.title.toLowerCase());
      assert.ok(typeof s.text === 'string' && s.text.length >= 8 && s.text.length <= 280, `${at}: text 8..280 (${s.text.length})`);
      assert.ok(ART.includes(s.art), `${at}: art id ${s.art}`);
      assert.ok(sentences(s.text) <= 4, `${at}: at most 4 sentences`);
      for (const p of s.text.split(/(?<=[.!?])\s+/)) assert.ok(p.split(/\s+/).length <= 26, `${at}: a sentence of ${p.split(/\s+/).length} words`);
      if (s.kind === 'example') {
        assert.ok(Array.isArray(s.steps) && s.steps.length >= 2 && s.steps.length <= 8, `${at}: 2-8 chips`);
        for (const c of s.steps) assert.ok(c.length >= 1 && c.length <= 60, `${at}: chip 1..60`);
        assert.match(s.text, /Rough first/, `${at}: worked examples open with an estimate (the course's Rough first habit)`);
      }
      if (s.kind === 'words') {
        assert.equal(s.words.length, 4, `${at}: four words`);
        for (const w of s.words) { assert.deepEqual(Object.keys(w), ['word', 'means']); assert.ok(w.word.length >= 2 && w.means.length >= 6 && w.means.length <= 120, `${at}: ${w.word}`); }
      }
    }
  }
});

test('the quick check is the step own three items, tagged with a locked primary code, misconception-tagged distractors', () => {
  for (const { step, deck: d } of decks) {
    const where = `explorer-${step.n}`;
    assert.deepEqual(d.check, [1, 2, 3].map(i => `nq-explorer-${step.n}-e${i}`), `${where}: own item ids`);
    for (const id of d.check) {
      const it = itemById.get(id);
      assert.ok(it, `${where}: ${id} exists`);
      assert.equal(it.bankFile, `nq-u${step.unit}-explorer`, `${where}: ${id} in the unit bank`);
      assert.equal(it.lesson, step.n);
      assert.ok(step.standards.explorer.primary.includes(it.cat) && locked.has(it.cat), `${where}: ${id} cat ${it.cat} is a locked primary code of the step`);
      assert.equal(it.choices.length, 4); assert.equal(new Set(it.choices).size, 4);
      assert.ok(Number.isInteger(it.answer) && it.answer >= 0 && it.answer <= 3);
      assert.equal(it.misconceptions.length, 4, `${where}: ${id} tags every choice`);
      assert.equal(it.misconceptions[it.answer], 'correct', `${where}: ${id} the key is tagged correct`);
      for (const [i, m] of it.misconceptions.entries()) if (i !== it.answer) assert.ok(m.length >= 10, `${where}: ${id} distractor ${i + 1} names its misconception`);
    }
  }
});

test('hand-checked keys: the arithmetic in the checks is right', () => {
  const key = id => { const it = itemById.get(id); return it.choices[it.answer]; };
  assert.equal(key('nq-explorer-3.1-e1'), '24'); assert.equal(key('nq-explorer-3.1-e2'), '56'); assert.equal(key('nq-explorer-3.1-e3'), '72');
  assert.equal(key('nq-explorer-3.2-e1'), '4'); assert.equal(key('nq-explorer-3.2-e2'), '23 remainder 3'); assert.equal(key('nq-explorer-3.2-e3'), '5 vans');
  assert.equal(key('nq-explorer-3.3-e1'), '56'); assert.equal(key('nq-explorer-3.3-e2'), '6 × 8'); assert.equal(key('nq-explorer-3.3-e3'), '6');
  assert.equal(key('nq-explorer-4.1-e1'), '5/6'); assert.equal(key('nq-explorer-4.1-e2'), 'At the second mark'); assert.equal(key('nq-explorer-4.1-e3'), 'The whole was cut into 6 equal parts');
  assert.equal(key('nq-explorer-4.2-e1'), '2/6'); assert.equal(key('nq-explorer-4.2-e2'), '1/2'); assert.equal(key('nq-explorer-4.2-e3'), '2/3 of a cake');
  assert.equal(key('nq-explorer-4.3-e1'), '5/6'); assert.equal(key('nq-explorer-4.3-e2'), '5/8'); assert.equal(key('nq-explorer-4.3-e3'), '1/2');
  // And the worked examples in the decks: 6 x 7 = 42, 29 shared by 4 is 7 remainder 1, 9 x 7 = 63,
  // the third mark is 3/4, 3/4 greater than 5/8, 2/4 + 1/4 = 3/4, and the Jumble's wrong 2/6 named as wrong.
  const all = decks.map(d => JSON.stringify(d.deck)).join(' ');
  for (const frag of ['6 × 7 = 42 rolls in all', '29 shared by 4 is 7 remainder 1', 'so 9 × 7 = 63', 'the third mark is 3/4', 'so 3/4 is greater than 5/8', '2/4 + 1/4 = 3/4', 'wrote 2/6']) assert.ok(all.includes(frag), `worked example present: ${frag}`);
});

test("the unit Jumble beats land in 3.3 (races itself) and 4.3 (adds the bottoms), the spec's flagship fraction mistake", () => {
  for (const { step, deck: d } of decks) {
    const text = d.slides.map(s => `${s.title} ${s.text} ${(s.steps || []).join(' ')}`).join(' ');
    if (['3.3', '4.3'].includes(step.n)) assert.match(text, /Jumble/, `explorer-${step.n}: a Jumble beat`);
  }
  const d43 = decks.find(d => d.step.n === '4.3').deck;
  const jumble = d43.slides.map(s => `${s.title} ${s.text}`).join(' ');
  assert.match(jumble, /adds the bottoms|added the bottoms|bottom number names the piece size/, '4.3: the mistake is named and fixed');
});

test('kid-safe text: no links, brands, framework names or codes in decks or items; US spelling', () => {
  const check = (strings, where) => {
    for (const s of strings) {
      for (const [re, why] of BAD) assert.ok(!re.test(s), `${where} has ${why}: ${s}`);
      assert.ok(!UK.test(s), `${where}: US spelling please: ${s}`);
      assert.ok(!BRAND.test(s), `${where}: no brand names: ${s}`);
    }
  };
  // One exemption, documented: 'Recipe Math' is the LOCKED chapter title in units.json and in
  // Fraction Factory itself - a proper name the mission must quote verbatim, not prose spelling.
  for (const { step, deck: d } of decks) check(stringsOf(d).map(s => s.split(step.game.explorer.chapterTitle).join('CHAPTER')), `explorer-${step.n}`);
  for (const n of ['3.1', '3.2', '3.3', '4.1', '4.2', '4.3']) {
    for (const id of [1, 2, 3].map(i => `nq-explorer-${n}-e${i}`)) { const it = itemById.get(id); check([it.q, ...it.choices], `item ${id}`); }
  }
});

test('drawn diagrams (the CPA pictorial step): every deck draws its maths, with guided focus on the parts', () => {
  const TYPES = ['places', 'numberline', 'bars', 'fraction', 'array', 'tiles', 'shapes', 'grid', 'squares', 'lines', 'chart', 'table'];
  for (const { step, deck: d } of decks) {
    const where = `explorer-${step.n}`;
    const drawn = d.slides.filter(s => s.visual);
    assert.ok(drawn.length >= 2, `${where}: at least two drawn diagrams (the concept and the worked example), got ${drawn.length}`);
    for (const s of drawn) {
      assert.ok(TYPES.includes(s.visual.type), `${where}: visual type ${s.visual.type}`);
      assert.ok(typeof s.visual.label === 'string' && s.visual.label.length >= 12, `${where}: the diagram has a real accessible label`);
      assert.ok(Array.isArray(s.focus) && s.focus.length >= 2 && s.focus.length <= 3, `${where}: 2-3 guided focus steps on the diagram`);
      for (const f of s.focus) {
        assert.ok(typeof f.cue === 'string' && f.cue.length >= 8, `${where}: a focus cue that teaches`);
        assert.ok(Array.isArray(f.box) && f.box.length === 4 && f.box.every(n => typeof n === 'number'), `${where}: a focus box`);
        assert.ok(f.box[0] >= 0 && f.box[1] >= 0 && f.box[0] + f.box[2] <= 100.5 && f.box[1] + f.box[3] <= 100.5, `${where}: the box stays inside the frame`);
      }
    }
  }
  const vis = n => decks.find(d => d.step.n === n).deck.slides.filter(s => s.visual).map(s => s.visual.type);
  assert.ok(vis('3.1').includes('array'), '3.1 draws groups as an array');
  assert.ok(vis('4.1').includes('fraction') && vis('4.1').includes('numberline'), '4.1 draws the fraction bar AND the number line (both halves of the locked definition)');
  assert.ok(vis('4.2').includes('fraction'), '4.2 draws re-slicing as fraction bars');
  assert.ok(vis('4.3').includes('fraction'), '4.3 draws adding slices as fraction bars');
});
