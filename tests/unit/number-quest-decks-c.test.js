// Number Quest Explorer decks C (seed-lessons/number-quest): Units 5-7 plus the Vault of Measures finale
// (10 decks, single Explorer band), in the Cyber Defenders deck idiom and mirroring
// number-quest-decks-b.test.js. Checked here: each deck matches units.json (title, topic, game module and
// locked standards), the deck schema (5-7 slides, exactly one worked example opening with a rough
// estimate, one words slide with four words, one flagged Stretch slide, the mission last), the quick check
// is the step's own three bank items whose cat is one of the step's LOCKED primary codes (standards.json
// explorerCodes) — with two honest exceptions: step 7.3 cites NO code (chance language has no CCSS home
// before grade 6; its items are tagged 'enrichment', like the intro's 'framing'), and step 6.1 has no game
// yet (Builder's Yard is a later phase; the spec's fallback is a classroom shape-hunt TALK and completion
// on the check). Every distractor carries a misconception tag and every item a `why`, so a miss teaches.
// Kid-safe text (US spelling, no brands, links, codes or framework names in anything a child reads), the
// unit Jumble beats (5.3 misreads $2.05, 6.3 swaps a grid address, 7.3 calls a one-in-six chance
// impossible) and the arc's resolution in the finale, and the media rule (Greg, 2026-11-05;
// docs/decisions.md): drawn diagrams teach, real pictures carry missions and story — the pictorial
// step on a TEACHING slide is a DRAWN diagram (slide.visual) with guided focus (slide.focus) over
// it; the MISSION slide carries a real screenshot of the assigned game in its assigned mode
// (slide.img, an nq/<game>/<state> key from public/img/nq/manifest.json, captured by
// scripts/nq-shots.js); a STORY slide may carry the story stage (slide.story). No other slide
// carries img or story, and neither ever displaces a drawn diagram or its focus. The missions
// wire to real carriers: Brain Board and Quest Race step generators in the game files, Data Detective's
// real chapters, and Would You Rather's Numbers bank (built into the game by scripts/wyr-bank.js).
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
const STEPS = ['5.1', '5.2', '5.3', '6.1', '6.2', '6.3', '7.1', '7.2', '7.3', '7.4'].map(n => {
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

test('decks C: 10 deck files (units 5-7 + finale), one bank per unit, 30 check items in units 5-7', () => {
  for (const d of decks) assert.ok(d.deck, `${path.relative(ROOT, d.file)} exists`);
  for (const u of [5, 6, 7]) assert.ok(banks.has(`nq-u${u}-explorer`), `sets/u${u}-explorer.json exists`);
  const cItems = [...itemById.values()].filter(it => ['5', '6', '7'].includes(it.lesson[0]));
  assert.equal(cItems.length, 30, 'three check items per deck (unit 7 bank also carries the finale)');
});

test('every deck matches the catalogue: key, title, topic, minutes, game', () => {
  for (const { step, deck: d } of decks) {
    const where = `explorer-${step.n}`;
    assert.equal(d.key, `explorer-${step.n}`); assert.equal(d.n, step.n); assert.equal(d.band, 'explorer');
    assert.equal(d.title, step.titles.explorer, `${where}: catalogue title`);
    assert.equal(d.topic, step.shorts.explorer, `${where}: catalogue topic`);
    assert.ok(Number.isInteger(d.minutes) && d.minutes >= 4 && d.minutes <= 10, `${where}: minutes 4..10`);
    const spec = step.game.explorer;
    if (!spec) { assert.equal(d.game, null, `${where}: no game`); assert.ok(typeof d.talk === 'string' && /\?$/.test(d.talk), `${where}: a talk prompt`); }
    else {
      assert.equal(d.game.slug, spec.slug, `${where}: game slug matches units.json`);
      assert.equal(d.game.chapter, spec.chapter, `${where}: game chapter matches units.json`);
      assert.ok(fs.existsSync(path.join(ROOT, 'seed-games', `${spec.slug}.html`)) || fs.existsSync(path.join(ROOT, 'seed-games', `${spec.slug}.json`)), `${where}: ${spec.slug} exists`);
      const mission = d.slides.at(-1).text;
      assert.ok(mission.includes(spec.chapterTitle), `${where}: the mission names the chapter as units.json shows it (${spec.chapterTitle})`);
    }
  }
});

test('the mission carriers are real: game step generators, Data Detective chapters, the Numbers bank', () => {
  const bb = fs.readFileSync(path.join(ROOT, 'seed-games/brain-board.html'), 'utf8');
  for (const n of ['5.1', '5.3', '6.2', '6.3']) assert.ok(bb.includes(`NQ_STEP === 'explorer-${n}'`), `brain-board has a step generator for ${n}`);
  const qr = fs.readFileSync(path.join(ROOT, 'seed-games/quest-race.html'), 'utf8');
  for (const n of ['5.2', '7.4']) assert.ok(qr.includes(`NQ_STEP === 'explorer-${n}'`), `quest-race has a step generator for ${n}`);
  const dd = fs.readFileSync(path.join(ROOT, 'seed-games/data-detective.html'), 'utf8');
  for (const n of ['7.1', '7.2']) {
    const spec = STEPS.find(s => s.n === n).game.explorer;
    assert.ok(dd.includes(`title: '${spec.chapter}'`), `data-detective has a chapter titled ${spec.chapter}`);
  }
  const wyr = fs.readFileSync(path.join(ROOT, 'seed-games/would-you-rather.html'), 'utf8');
  assert.ok(wyr.includes('numbers-12'), 'the Numbers bank is built into Would You Rather');
  const bank = fs.readFileSync(path.join(ROOT, 'scripts/wyr-bank.js'), 'utf8');
  assert.ok(/'numbers'\]/.test(bank), 'wyr-bank CATS names the numbers topic');
  // Mission truth: the Data Detective missions state the chapters' true case counts (5 and 3,
  // counted from the game's own CHAPTERS table).
  assert.ok(decks.find(d => d.step.n === '7.1').deck.slides.at(-1).text.includes('all 5 cases'), '7.1 mission states 5 cases');
  assert.ok(decks.find(d => d.step.n === '7.2').deck.slides.at(-1).text.includes('all 3 survey cases'), '7.2 mission states 3 cases');
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

test('the quick check is the step own three items, tagged with a locked primary code, misconception-tagged distractors, a why on every item', () => {
  for (const { step, deck: d } of decks) {
    const where = `explorer-${step.n}`;
    assert.deepEqual(d.check, [1, 2, 3].map(i => `nq-explorer-${step.n}-e${i}`), `${where}: own item ids`);
    for (const id of d.check) {
      const it = itemById.get(id);
      assert.ok(it, `${where}: ${id} exists`);
      assert.equal(it.bankFile, `nq-u${step.unit}-explorer`, `${where}: ${id} in the unit bank`);
      assert.equal(it.lesson, step.n);
      if (step.n === '7.3') assert.equal(it.cat, 'enrichment', `${where}: the chance check is enrichment, never assessed coverage`);
      else assert.ok(step.standards.explorer.primary.includes(it.cat) && locked.has(it.cat), `${where}: ${id} cat ${it.cat} is a locked primary code of the step`);
      assert.equal(it.choices.length, 4); assert.equal(new Set(it.choices).size, 4);
      assert.ok(Number.isInteger(it.answer) && it.answer >= 0 && it.answer <= 3);
      assert.equal(it.misconceptions.length, 4, `${where}: ${id} tags every choice`);
      assert.equal(it.misconceptions[it.answer], 'correct', `${where}: ${id} the key is tagged correct`);
      for (const [i, m] of it.misconceptions.entries()) if (i !== it.answer) assert.ok(m.length >= 10, `${where}: ${id} distractor ${i + 1} names its misconception`);
      assert.ok(typeof it.why === 'string' && it.why.length >= 20, `${where}: ${id} carries a why so a miss teaches`);
    }
  }
  // 7.3's honesty is structural, not just per-item: the step cites no code anywhere.
  const s73 = STEPS.find(s => s.n === '7.3').standards.explorer;
  assert.equal(s73.flag, 'enrichment');
  assert.deepEqual([...s73.primary, ...s73.also, ...s73.buildsToward], [], '7.3 cites no code in any position');
});

test('hand-checked keys: the arithmetic in the checks is right', () => {
  const key = id => { const it = itemById.get(id); return it.choices[it.answer]; };
  assert.equal(key('nq-explorer-5.1-e1'), '2,000 grams'); assert.equal(key('nq-explorer-5.1-e2'), '300 centimeters'); assert.equal(key('nq-explorer-5.1-e3'), '2 meters');
  assert.equal(key('nq-explorer-5.2-e1'), '5:05'); assert.equal(key('nq-explorer-5.2-e2'), '1 hour 30 minutes'); assert.equal(key('nq-explorer-5.2-e3'), '10:00');
  assert.equal(key('nq-explorer-5.3-e1'), '35 cents'); assert.equal(key('nq-explorer-5.3-e2'), '75 cents'); assert.equal(key('nq-explorer-5.3-e3'), '235 cents');
  assert.equal(key('nq-explorer-6.1-e1'), 'Triangle'); assert.equal(key('nq-explorer-6.1-e2'), 'Triangle'); assert.equal(key('nq-explorer-6.1-e3'), 'It has 4 sides and 4 square corners, like every rectangle');
  assert.equal(key('nq-explorer-6.2-e1'), '24 square meters'); assert.equal(key('nq-explorer-6.2-e2'), '20 inches'); assert.equal(key('nq-explorer-6.2-e3'), 'Perimeter 22 feet, area 24 square feet');
  assert.equal(key('nq-explorer-6.3-e1'), 'Parallel lines'); assert.equal(key('nq-explorer-6.3-e2'), 'A'); assert.equal(key('nq-explorer-6.3-e3'), '4 steps right, then 2 steps up');
  assert.equal(key('nq-explorer-7.1-e1'), '8'); assert.equal(key('nq-explorer-7.1-e2'), '10'); assert.equal(key('nq-explorer-7.1-e3'), '1 1/2 yards');
  assert.equal(key('nq-explorer-7.2-e1'), 'What is your favorite fruit: apple, banana, grape or pear?'); assert.equal(key('nq-explorer-7.2-e2'), '3'); assert.equal(key('nq-explorer-7.2-e3'), 'How do you get to school: walk, bus, car or bike?');
  assert.equal(key('nq-explorer-7.3-e1'), 'Unlikely'); assert.equal(key('nq-explorer-7.3-e2'), 'Certain'); assert.equal(key('nq-explorer-7.3-e3'), 'An even chance');
  assert.equal(key('nq-explorer-7.4-e1'), '3,400 meters'); assert.equal(key('nq-explorer-7.4-e2'), '75 centimeters'); assert.equal(key('nq-explorer-7.4-e3'), '11:15');
  // And the worked examples in the decks: 2 kg counted twice to 2,000 g, change 5 + 30 = 35 cents,
  // area 3 x 7 = 21, the treasure at (3, 2), 20 - 12 = 8, ribbons to 1 1/2, the sack at 3,400 grams.
  const all = decks.map(d => JSON.stringify(d.deck)).join(' ');
  for (const frag of ['2 kilograms = 1,000 + 1,000 grams', 'Change = 5 + 30 = 35 cents', 'Area = 3 x 7 = 21 square units', 'The treasure sits at (3, 2)', '20 - 12 = 8', 'In all: 1 1/2 yards', 'The sack is 3,400 grams']) assert.ok(all.includes(frag), `worked example present: ${frag}`);
});

test('the unit Jumble beats land in the last step of each unit (5.3, 6.3, 7.3), and the arc resolves in the Vault', () => {
  for (const { step, deck: d } of decks) {
    const text = d.slides.map(s => `${s.title} ${s.text} ${(s.steps || []).join(' ')}`).join(' ');
    if (['5.3', '6.3', '7.3'].includes(step.n)) assert.match(text, /Jumble/, `explorer-${step.n}: a Jumble beat`);
  }
  const d53 = decks.find(d => d.step.n === '5.3').deck;
  assert.match(JSON.stringify(d53.slides), /\$2\.05 is 205 cents/, '5.3: the dropped-zero price is named and fixed');
  const d63 = decks.find(d => d.step.n === '6.3').deck;
  assert.match(JSON.stringify(d63.slides), /\(2, 4\) when the card said \(4, 2\)/, '6.3: the swapped address is named');
  const d73 = decks.find(d => d.step.n === '7.3').deck;
  assert.match(JSON.stringify(d73.slides), /called red impossible/, '7.3: the impossible claim is named');
  const d74 = decks.find(d => d.step.n === '7.4').deck;
  const finale = JSON.stringify(d74.slides);
  assert.match(finale, /find the Jumble/, '7.4: the Jumble is found inside the Vault');
  assert.match(finale, /hands it a pencil/, '7.4: Tally hires it as counter-in-training (a pencil, not a scolding)');
});

test('kid-safe text: no links, brands, framework names or codes in decks or items; US spelling', () => {
  const check = (strings, where) => {
    for (const s of strings) {
      for (const [re, why] of BAD) assert.ok(!re.test(s), `${where} has ${why}: ${s}`);
      assert.ok(!UK.test(s), `${where}: US spelling please: ${s}`);
      assert.ok(!BRAND.test(s), `${where}: no brand names: ${s}`);
    }
  };
  for (const { step, deck: d } of decks) check(stringsOf(d).map(s => s.split(step.game.explorer ? step.game.explorer.chapterTitle : 'CHAPTER').join('CHAPTER')), `explorer-${step.n}`);
  for (const n of ['5.1', '5.2', '5.3', '6.1', '6.2', '6.3', '7.1', '7.2', '7.3', '7.4']) {
    for (const id of [1, 2, 3].map(i => `nq-explorer-${n}-e${i}`)) { const it = itemById.get(id); check([it.q, ...it.choices, it.why], `item ${id}`); }
  }
});

test('visual strings respect the deck loader caps (server/services/courses.js cleanSlide truncates silently)', () => {
  for (const { step, deck: d } of decks) {
    const where = `explorer-${step.n}`;
    for (const s of d.slides) {
      const v = s.visual; if (!v) continue;
      assert.ok(v.label.length <= 160, `${where}: visual label <= 160`);
      if (v.type === 'numberline') {
        for (const m of v.marks || []) assert.ok(m.label.length <= 6, `${where}: mark label "${m.label}" <= 6 chars or the loader truncates it`);
        if (v.point) assert.ok(v.point.label.length <= 6, `${where}: point label "${v.point.label}" <= 6 chars`);
        for (const h of v.hops || []) assert.ok(h.label.length <= 8, `${where}: hop label "${h.label}" <= 8 chars`);
      }
      if (v.type === 'bars' || v.type === 'fraction') for (const r of v.rows) {
        assert.ok(r.label.length <= 60, `${where}: row label <= 60`);
        for (const p of r.parts || []) assert.ok((p.label || '').length <= 20, `${where}: part label "${p.label}" <= 20 chars`);
      }
      if (v.type === 'tiles') for (const x of v.values) assert.ok(String(x).length <= 10, `${where}: tile value "${x}" <= 10 chars`);
      for (const f of s.focus || []) assert.ok(f.cue.length <= 80, `${where}: focus cue <= 80 chars (the loader drops longer)`);
    }
  }
});

test('drawn diagrams (the CPA pictorial step): every deck draws its maths, with guided focus on the parts', () => {
  const TYPES = ['places', 'numberline', 'bars', 'fraction', 'array', 'tiles', 'shapes'];
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
  assert.ok(vis('5.1').includes('numberline') && vis('5.1').includes('bars'), '5.1 draws the meter stick AND the conversion bar');
  assert.ok(vis('5.2').filter(t => t === 'numberline').length === 2, '5.2 draws time on the line twice (concept and bus)');
  assert.ok(vis('5.3').filter(t => t === 'bars').length === 2, '5.3 draws the dollar bar AND the change bar');
  assert.ok(vis('6.1').filter(t => t === 'shapes').length === 2, '6.1 draws the shapes it sorts AND the square beside the rectangle (real drawn shapes, corners marked)');
  assert.ok(vis('6.2').includes('bars') && vis('6.2').includes('array'), '6.2 draws the fence bar AND the carpet array');
  assert.ok(vis('6.3').includes('bars') && vis('6.3').includes('array'), '6.3 draws the fold AND the grid');
  assert.ok(vis('7.1').includes('bars') && vis('7.1').includes('numberline'), '7.1 draws the bar graph AND the line plot');
  assert.ok(vis('7.2').includes('bars') && vis('7.2').includes('numberline'), '7.2 draws the survey chart AND the line plot');
  assert.ok(vis('7.3').includes('fraction') && vis('7.3').includes('tiles'), '7.3 draws the spinner bar AND the chance words');
  assert.ok(vis('7.4').includes('bars') && vis('7.4').includes('numberline'), '7.4 draws the Heavy Sack AND the tour line');
});
