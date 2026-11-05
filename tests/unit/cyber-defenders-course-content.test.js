// Cyber Defenders student course content (seed-lessons/cyber-defenders): the intro and units 1-4, 13 steps in two
// grade bands (26 decks). Each deck is read before its quick check and its game module, in the same shape as CS
// Quest's decks. Checked here: the catalogue (units.json) and its standards registry (standards.json), the deck
// schema (5-7 slides, exactly one worked example, one words slide with the step's four words, the mission last);
// the quick check is three exit items of the step's own bank file whose cat is one of the step's CYBER.ORG codes;
// the game module is the one units.json names (a Packet Post chapter with canonical params, or Would You Rather's
// "online" topic), and the mission names the game and chapter as the game shows them; every slide but the words
// slides is pictured from the shared manifest — CS Quest shots reused where the state matches, plus Cyber's own
// captures (scripts/cyber-shots-spec.json) — always with the manifest's alt, and guided focus covers every
// pictured slide in units 1-6 with CS Quest's schema (the intro carries none yet); kid-safe text (the real game
// scanner and the free-text filter over every string, no links, handles, long digit runs, brands, framework names,
// standard codes or the program name); US spelling; the Magpie beat in the intro and in each unit's last step;
// teacher notes on the intro and units 1-4.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CD = path.join(ROOT, 'seed-lessons/cyber-defenders');
const CS = path.join(ROOT, 'seed-lessons/cs-quest');
const { scanVersion } = await import('../../server/services/scanner.js');
const { cleanText } = await import('../../server/services/textfilter.js');
const { cleanOptions } = await import('../../server/services/play-params.js');
const CSTA = await import('../../server/standards/csta.js');

const ART = ['robot', 'grid', 'loop', 'branch', 'box', 'gears', 'bug', 'map', 'chart', 'table', 'magnifier', 'pencil', 'envelope', 'network', 'lock', 'shield', 'mask', 'key', 'cipher', 'chip', 'battery', 'screen', 'wrench', 'bits', 'pixel', 'people', 'globe', 'lightbulb', 'star', 'trophy'];
const BANDS = ['1b', '2'];
const UK = /\b(colours?|coloured|colouring|favourites?|grey|labelled|licence|organis(e|ed|ing)|practis(e|ed|ing)|neighbours?|recognis(e|ed|ing)|maths|centre|metres?|behaviours?|honour|catalogue|analys(e|ed|ing)|defence|travelled|modelling|cancelled|jewellery|tyres?|whilst|learnt|spelt|programme)\b/i;
const BRAND = /\b(Bluetooth|Wi-?Fi|iPad|iPhone|Android|Chromebook|Windows|Google|YouTube|TikTok|Minecraft|Roblox|Fortnite|Lego|Nintendo|Xbox|PlayStation|Alexa|Siri)\b/i;
const BAD = [[/\d{7,}/, 'a 7+ digit run'], [/@/, 'an @'], [/\/\/\w[\w.-]*\.\w{2,}/, 'a //host.tld link'], [/https?:/i, 'a URL scheme'], [/\bwww\./i, 'a www. link'],
  [/\btype your password\b/i, '"type your password"'], [/\bgrown-?ups?\b/i, '"grown-up" (say "trusted adult")'], [/Cyber Defenders/, 'the program name (a child in the story is a Cyber Defender, singular)'],
  [/CYBER\.ORG|Common Sense|\bCSTA\b/i, 'a framework name'], [/\b(3-5|6-8)\.(CS|DC|SEC)\.[A-Z]+/, 'a CYBER.ORG code'], [/\b(SEC|DC|CS)\.[A-Z]{2,}\b/, 'a standard code fragment'],
  [/\b(1B|2)-(AP|CS|DA|IC|NI)-\d\d\b/i, 'a CSTA code']];

const reg = JSON.parse(fs.readFileSync(path.join(CD, 'units.json'), 'utf8'));
const registry = JSON.parse(fs.readFileSync(path.join(CD, 'standards.json'), 'utf8'));
const UNITS = reg.units;
const STEPS = UNITS.flatMap(u => u.steps.map(s => ({ ...s, unit: u.n, unitTitle: u.title })));
const GAME_TITLE = { 'packet-post': 'Packet Post', 'would-you-rather': 'Would You Rather', 'trick-inbox': 'Trick Inbox', 'escape-the-post-office': 'Escape the Post Office' };
const ppChapters = JSON.parse(fs.readFileSync(path.join(CS, 'games.json'), 'utf8')).games['packet-post'].chapters;
const wyrUi = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/data/would-you-rather/ui.json'), 'utf8')).en;
const banks = new Map();
for (const f of fs.readdirSync(path.join(CD, 'sets')).filter(f => /^u\d-(1b|2)\.json$/.test(f))) {
  const b = JSON.parse(fs.readFileSync(path.join(CD, 'sets', f), 'utf8'));
  banks.set(b.id, b);
}
const itemById = new Map([...banks.values()].flatMap(b => b.items.map(it => [it.id, { ...it, bankFile: b.id }])));
const decks = [];
for (const band of BANDS) for (const s of STEPS) {
  const file = path.join(CD, 'course', band, `${s.n}.json`);
  decks.push({ band, step: s, file, deck: fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null });
}
const stringsOf = d => [d.title, d.topic, d.talk, ...d.slides.flatMap(sl => [sl.title, sl.text, sl.say, sl.alt, ...(sl.steps || []), ...(sl.focus || []).map(f => f.cue), ...(sl.words || []).flatMap(w => [w.word, w.means])])].filter(s => s != null);
const IMG_KEY = /^csq\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'img', 'csq', 'manifest.json'), 'utf8'));
const manifestByKey = new Map((MANIFEST.images || []).map(e => [e.key, e]));
const sentences = t => t.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).filter(Boolean).length;

test('the catalogue: intro + units 1-6, 20 steps per band in order, stamps and teacher notes', () => {
  assert.deepEqual(UNITS.map(u => u.n), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(STEPS.map(s => s.n), ['0.1', '1.1', '1.2', '1.3', '2.1', '2.2', '2.3', '3.1', '3.2', '3.3', '4.1', '4.2', '4.3', '5.1', '5.2', '5.3', '6.1', '6.2', '6.3', '6.4']);
  assert.deepEqual(STEPS.map(s => s.order), [...Array(20).keys()].map(i => i + 1));
  assert.deepEqual(UNITS.slice(1).map(u => u.stamp), ['Roadwise', 'Keykeeper', 'Private', 'Trickspotter', 'Kind Screen', 'Shield']);
  for (const u of UNITS) {
    assert.ok(Array.isArray(u.teacherNotes) && u.teacherNotes.length >= 1, `unit ${u.n} carries teacher notes`);
    for (const note of u.teacherNotes) assert.ok(typeof note === 'string' && note.length >= 40, `unit ${u.n}: a real teacher note`);
  }
});

test('the standards map: CYBER.ORG codes from the registry, a real Common Sense topic, valid inherited CSTA', () => {
  const topics = registry.frameworks.commonSense.topics;
  assert.equal(topics.length, 6);
  for (const band of BANDS) {
    const allowed = new Set(registry.cyberorgCodes[band]);
    assert.ok(allowed.size >= 10, `${band}: the registry holds the band's code set`);
    for (const code of allowed) assert.match(code, /^(3-5|6-8)\.(CS|DC|SEC)\.[A-Z]+(\.\d)?$/, `${band}: ${code} is a well-formed v1.0 code`);
    for (const s of STEPS) {
      const st = s.standards[band];
      const where = `${band}-${s.n}`;
      assert.ok(Array.isArray(st.cyberorg) && st.cyberorg.length >= 1, `${where}: at least one CYBER.ORG code`);
      for (const code of st.cyberorg) assert.ok(allowed.has(code), `${where}: ${code} is in the registry`);
      assert.ok(topics.includes(st.commonSense), `${where}: "${st.commonSense}" is one of the six topics`);
      for (const code of st.csta || []) {
        assert.ok(CSTA.isId(code), `${where}: ${code} is a real CSTA 2017 id`);
        assert.ok(code.startsWith(band === '1b' ? '1B-' : '2-'), `${where}: ${code} is of the band's level`);
      }
    }
  }
});

test('20 steps in two bands: 40 deck files, nothing else in the course folder; one bank file per unit and band', () => {
  for (const d of decks) assert.ok(d.deck, `${path.relative(ROOT, d.file)} exists`);
  for (const band of BANDS) {
    assert.deepEqual(fs.readdirSync(path.join(CD, 'course', band)).sort(), STEPS.map(s => `${s.n}.json`).sort(), `course/${band} holds exactly the 20 step files`);
  }
  assert.deepEqual(fs.readdirSync(path.join(CD, 'course')).sort(), BANDS);
  for (const u of UNITS) for (const band of BANDS) assert.ok(banks.has(`cd-u${u.n}-${band}`), `sets/u${u.n}-${band}.json exists`);
  assert.equal(itemById.size, 40 * 3, 'three check items per deck');
});

test('every deck matches the schema: key, n, band, title, topic, minutes, slides, check, game / talk', () => {
  for (const { band, step, deck: d } of decks) {
    const where = `${band}-${step.n}`;
    const keys = ['key', 'n', 'band', 'title', 'topic', 'minutes', 'slides', 'check', 'game'].concat(!step.game[band] ? ['talk'] : []);
    assert.deepEqual(Object.keys(d), keys, `${where}: fields in order`);
    assert.equal(d.key, `${band}-${step.n}`); assert.equal(d.n, step.n); assert.equal(d.band, band);
    assert.equal(d.title, step.titles[band], `${where}: the catalogue's title for the band`);
    assert.equal(d.topic, step.shorts[band], `${where}: the catalogue's topic for the band`);
    assert.ok(Number.isInteger(d.minutes) && d.minutes >= 4 && d.minutes <= 10, `${where}: minutes 4..10`);
    assert.ok(d.title.length <= 40 && d.topic.length <= 30);
    if (!step.game[band]) assert.ok(typeof d.talk === 'string' && d.talk.length >= 20 && d.talk.length <= 280 && /\?$/.test(d.talk), `${where}: a talk prompt that asks something`);
  }
});

test('5-8 slides: one worked example with chips, one words slide with four words, the mission last; art and lengths', () => {
  for (const { band, step, deck: d } of decks) {
    const where = `${band}-${step.n}`;
    assert.ok(Array.isArray(d.slides) && d.slides.length >= 5 && d.slides.length <= 8, `${where}: 5-8 slides (${d.slides.length})`);
    const kinds = d.slides.map(s => s.kind || 'text');
    assert.equal(kinds.filter(k => k === 'example').length, 1, `${where}: one example slide`);
    assert.equal(kinds.filter(k => k === 'words').length, 1, `${where}: one words slide`);
    assert.equal(kinds.filter(k => k === 'mission').length, 1, `${where}: one mission slide`);
    assert.equal(kinds.at(-1), 'mission', `${where}: the mission is last`);
    let short = 0;
    const titles = new Set();
    for (const [i, s] of d.slides.entries()) {
      const at = `${where} slide ${i + 1}`;
      const allowed = { text: ['title', 'text', 'art', 'say', 'img', 'alt', 'focus'], example: ['kind', 'title', 'text', 'art', 'steps', 'say', 'img', 'alt', 'focus'], words: ['kind', 'title', 'text', 'art', 'words', 'say', 'img', 'alt', 'focus'], mission: ['kind', 'title', 'text', 'art', 'say', 'img', 'alt', 'focus'] }[s.kind || 'text'];
      for (const k of Object.keys(s)) assert.ok(allowed.includes(k), `${at}: unexpected field ${k}`);
      assert.ok(typeof s.title === 'string' && s.title.length >= 3 && s.title.length <= 48, `${at}: title 3..48 chars: ${s.title}`);
      assert.ok(!titles.has(s.title.toLowerCase()), `${at}: slide titles differ inside a deck`); titles.add(s.title.toLowerCase());
      assert.ok(typeof s.text === 'string' && s.text.length >= 8 && s.text.length <= 280, `${at}: text 8..280 chars (${s.text.length})`);
      assert.ok(ART.includes(s.art), `${at}: art id ${s.art} is one the engine draws`);
      if (s.img != null || s.alt != null) {
        assert.ok(typeof s.img === 'string' && IMG_KEY.test(s.img), `${at}: img ${JSON.stringify(s.img)} is a csq/<game>/<state> key`);
        const entry = manifestByKey.get(s.img);
        assert.ok(entry, `${at}: img ${s.img} is registered in public/img/csq/manifest.json`);
        assert.equal(s.alt, entry.alt, `${at}: a reused shot keeps the manifest's alt, verbatim`);
        assert.ok(fs.existsSync(path.join(ROOT, 'public', 'img', `${s.img}.webp`)), `${at}: public/img/${s.img}.webp exists`);
      }
      if (s.focus != null) {
        // Guided focus: animation steps over the slide's picture, same schema as CS Quest's (cleanSlide's rules).
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
            assert.ok(Array.isArray(f.path) && f.path.length >= 2 && f.path.length <= 8, `${fat}: path of 2-8 points`);
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
        assert.ok(Array.isArray(s.words) && s.words.length === 4, `${at}: the step's four words`);
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

test('parity: every slide is pictured except the words slides, and guided focus covers every pictured slide like CS Quest', () => {
  for (const { band, step, deck: d } of decks) {
    const where = `${band}-${step.n}`;
    for (const [i, s] of d.slides.entries()) {
      const at = `${where} slide ${i + 1}`;
      if (s.kind === 'words') assert.equal(s.img, undefined, `${at}: words slides stay typographic, as in CS Quest`);
      else assert.ok(s.img && s.alt, `${at}: a pictured slide (the Phase 1.5 captures landed)`);
      if (step.n === '0.1') {
        assert.equal(s.focus, undefined, `${at}: the intro carries no guided focus yet`);
      } else {
        assert.ok(s.img ? Array.isArray(s.focus) : true, `${at}: pictured slides carry guided focus`);
        if (s.kind === 'mission') assert.equal((s.focus || []).length, 1, `${at}: a mission slide gets exactly one focus step`);
      }
    }
  }
});

test('the quick check is the step own three bank items, each tagged with one of the step standards', () => {
  for (const { band, step, deck: d } of decks) {
    const where = `${band}-${step.n}`;
    assert.deepEqual(d.check, [1, 2, 3].map(i => `cd-${band}-${step.n}-e${i}`), `${where}: the step's own item ids`);
    for (const id of d.check) {
      const it = itemById.get(id);
      assert.ok(it, `${where}: ${id} exists in a bank`);
      assert.equal(it.bankFile, `cd-u${step.unit}-${band}`, `${where}: ${id} is in the step's unit bank for the band`);
      assert.equal(it.lesson, step.n, `${where}: ${id} belongs to step ${step.n}`);
      assert.ok(step.standards[band].cyberorg.includes(it.cat), `${where}: ${id} cat ${it.cat} is one of the step's CYBER.ORG codes`);
      assert.equal(it.choices.length, 4, `${where}: ${id} four choices`);
      assert.equal(new Set(it.choices).size, 4, `${where}: ${id} choices differ`);
      assert.ok(Number.isInteger(it.answer) && it.answer >= 0 && it.answer <= 3, `${where}: ${id} answer is a choice index`);
      assert.ok(it.q.trim().length >= 10, `${where}: ${id} asks something`);
    }
  }
});

test('the game module is the catalogue game: a real Packet Post chapter with canonical params, or the WYR online topic', () => {
  for (const { band, step, deck: d } of decks) {
    const where = `${band}-${step.n}`;
    const spec = step.game[band];
    if (!spec) { assert.equal(d.game, null, `${where}: no game`); continue; }
    assert.deepEqual(d.game, { slug: spec.slug, chapter: spec.chapter, params: spec.params }, `${where}: game matches units.json`);
    assert.ok(fs.existsSync(path.join(ROOT, 'seed-games', `${spec.slug}.html`)), `${where}: ${spec.slug} exists`);
    const mission = d.slides.at(-1).text;
    assert.ok(mission.includes(GAME_TITLE[spec.slug]), `${where}: the mission names ${GAME_TITLE[spec.slug]}`);
    assert.ok(mission.includes(spec.chapterTitle), `${where}: the mission names the chapter ${spec.chapterTitle}`);
    if (spec.slug === 'packet-post') {
      assert.equal(cleanOptions(spec.params), spec.params, `${where}: params are canonical`);
      const ch = ppChapters.find(c => c.id === spec.chapter && c.band === (band === '1b' ? '1B' : '2'));
      assert.ok(ch, `${where}: ${spec.chapter} is a Packet Post chapter for the band`);
      assert.equal(ch.title, spec.chapterTitle, `${where}: ${spec.chapterTitle} is the game's own chapter name`);
    } else if (spec.slug === 'would-you-rather') {
      assert.equal(spec.params, '', `${where}: the solo game takes no lesson params`);
      assert.equal(wyrUi['cat.online'], spec.chapterTitle, `${where}: the chapter is the game's own online topic name`);
    }
  }
});

test('the Magpie is met in the intro and returns in the last step of every unit', () => {
  for (const { band, step, deck: d } of decks) {
    const text = d.slides.map(s => `${s.title} ${s.text} ${(s.steps || []).join(' ')}`).join(' ');
    if (step.n === '0.1' || ['1.3', '2.3', '3.3', '4.3'].includes(step.n)) assert.match(text, /Magpie/, `${band}-${step.n}: a Magpie beat`);
  }
});

test('kid-safe text: no links, handles, digit runs, brands, framework names, codes or program name; US spelling; the filters accept every string', () => {
  const all = [];
  const checkStrings = (strings, where) => {
    for (const s of strings) {
      assert.equal(typeof s, 'string');
      all.push(s);
      for (const [re, why] of BAD) assert.ok(!re.test(s), `${where} has ${why}: ${s}`);
      assert.ok(!UK.test(s), `${where}: US spelling please: ${s}`);
      assert.ok(!BRAND.test(s), `${where}: no brand names: ${s}`);
      const c = cleanText(s, 1000);
      assert.ok(c.ok, `${where}: the text filter refuses (${c.error}): ${s}`);
      assert.equal(c.value, s, `${where}: survives the filter unchanged`);
    }
  };
  for (const { band, step, deck: d } of decks) checkStrings(stringsOf(d), `${band}-${step.n}`);
  for (const [id, it] of itemById) checkStrings([it.q, ...it.choices], `item ${id}`);
  const r = scanVersion(`<title>T</title><canvas></canvas><script>const S=${JSON.stringify(all)};</script>`);
  assert.equal(r.status, 'pass', JSON.stringify(r.issues || r, null, 1));
});

test('Explorer decks read at a grade 3-5 level: short sentences', () => {
  for (const { band, step, deck: d } of decks) {
    if (band !== '1b') continue;
    for (const s of d.slides) {
      for (const p of s.text.split(/(?<=[.!?])\s+/)) assert.ok(p.split(/\s+/).length <= 26, `1b-${step.n} "${s.title}": a sentence of ${p.split(/\s+/).length} words: ${p}`);
    }
  }
});

test('guided focus geometry: the reported slide and the shared road maps cover the elements their cues name', () => {
  // Regression for the 2026-11-04 live report: on 1b-1.1 slide 1 ("Pim sorts the post", packets-1b-key) the tour's
  // second ring framed blank panel instead of the route to Grandma's House. The extents below were measured on the
  // shipped 1280x720 captures with a drawn coordinate grid (see scripts/focus-sheet.js, which renders every focus
  // box onto its picture for eyeball verification): the L1 route incl. labels spans x 10-52, y 46-69; the packet
  // icon + number badge at Pim's Post spans x 10.5-16, y 58-69. Boxes must COVER their element, not just sit near it.
  const covers = (box, [x0, y0, x1, y1]) => box[0] <= x0 && box[1] <= y0 && box[0] + box[2] >= x1 && box[1] + box[3] >= y1;
  const deck = (band, n) => decks.find(d => d.band === band && d.step.n === n).deck;
  const gregs = deck('1b', '1.1').slides[0];
  assert.equal(gregs.img, 'csq/packet-post/packets-1b-key');
  assert.ok(covers(gregs.focus[0].box, [10.5, 58, 16, 69]), `the packet at Pim's Post sits inside step 1's box: ${gregs.focus[0].box}`);
  assert.ok(covers(gregs.focus[1].box, [10, 46, 52, 69]), `the whole route sits inside step 2's box: ${gregs.focus[1].box}`);
  for (const [px, py] of gregs.focus[1].path || []) assert.ok(px >= 9 && px <= 53 && py >= 43 && py <= 70, `step 2's path stays on the route: ${px},${py}`);
  // The Rules of the Road road (protocols-*-key / protocols-2-rules captures) spans x 10-41, y 46-70 incl. labels;
  // every step that sends the eye to that road must cover it (the parity pass shipped boxes floating above it).
  const roadAt = [[ '1b', '1.2', 0, 0 ], [ '1b', '1.2', 6, 0 ], [ '2', '1.1', 6, 0 ], [ '2', '1.2', 6, 0 ]];
  for (const [band, n, si, fi] of roadAt) {
    const s = deck(band, n).slides[si];
    assert.ok(covers(s.focus[fi].box, [10, 46, 41, 70]), `${band}-${n} slide ${si + 1}: the road sits inside the box: ${s.focus[fi].box}`);
  }
});
