// Number Quest Launchpad decks (seed-lessons/number-quest/course/launchpad/*.json, kindergarten to grade 2).
// Launchpad is for ages 5-7 and audio-first, so its decks keep every Explorer deck rule that makes sense and
// tighten the reading load. The Launchpad limits live here, and they are enforced for EVERY deck file in
// course/launchpad (and every bank sets/u<n>-launchpad.json), so a deck added later is held to them too:
//   - a slide: title 3-40 chars, text 8-160 chars, at most 2 sentences, at most 12 words a sentence;
//   - a deck: 5-7 slides, exactly one example slide (2-6 short chips), exactly one words slide with exactly
//     3 words, the mission last; a step with no game carries a talk question;
//   - story slides are Tally alone on the street scene and never sit on a diagram; a screenshot belongs on
//     the mission of a step that has a game; guided focus only ever sits on a drawn diagram;
//   - the quick check is the step's own three items (nq-launchpad-<n>-e1..3) from its unit bank
//     (nq-u<unit>-launchpad): a framing step's items are tagged "framing", any other step's with one of its
//     own primary codes locked in standards.json launchpadCodes; four distinct choices of at most 24 chars,
//     a question of at most 90 chars, a misconception tag on every distractor and a why of 20-160 chars;
//   - kid-safe text: no links, brands, framework names or codes; US spelling.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const C = await import('../../server/services/courses.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const NQ = path.join(ROOT, 'seed-lessons/number-quest');
const TIER = 'launchpad';
const LIMITS = Object.freeze({ title: [3, 40], text: [8, 160], sentences: 2, words: 12, slides: [5, 7], wordsOnSlide: 3, chips: [2, 6], chip: 40,
  means: [6, 80], q: 90, choice: 24, why: [20, 160], minutes: [3, 8] });
const ART = C.ART_IDS;
const UK = /\b(colours?|coloured|colouring|favourites?|grey|labelled|licence|organis(e|ed|ing)|practis(e|ed|ing)|neighbours?|recognis(e|ed|ing)|maths|centre|metres?|behaviours?|honour|catalogue|analys(e|ed|ing)|defence|travelled|modelling|cancelled|jewellery|tyres?|whilst|learnt|spelt|programme)\b/i;
const BRAND = /\b(Bluetooth|Wi-?Fi|iPad|iPhone|Android|Chromebook|Windows|Google|YouTube|TikTok|Minecraft|Roblox|Fortnite|Lego|Nintendo|Xbox|PlayStation|Alexa|Siri|Duolingo)\b/i;
const BAD = [[/\d{7,}/, 'a 7+ digit run'], [/@/, 'an @'], [/\/\/\w[\w.-]*\.\w{2,}/, 'a //host.tld link'], [/https?:/i, 'a URL scheme'], [/\bwww\./i, 'a www. link'],
  [/Common Core|CCSS/i, 'a framework name'], [/\b(K|[1-8])\.(CC|OA|NBT|NF|MD|G)\.[A-D]\.\d[a-z]?\b/, 'a CCSS-M code'], [/\bMP[1-8]\b/, 'a practice code']];

const cat = JSON.parse(fs.readFileSync(path.join(NQ, 'units.json'), 'utf8'));
const reg = JSON.parse(fs.readFileSync(path.join(NQ, 'standards.json'), 'utf8'));
const locked = new Set(Object.keys(reg.launchpadCodes.codes));
const STEPS = cat.units.filter(u => u.tier === TIER).flatMap(u => u.steps.map(s => ({ ...s, unit: u.n })));
const deckDir = path.join(NQ, 'course', TIER);
const files = fs.readdirSync(deckDir).filter(f => f.endsWith('.json')).sort();
const decks = files.map(f => ({ n: f.replace('.json', ''), deck: JSON.parse(fs.readFileSync(path.join(deckDir, f), 'utf8')) }))
  .map(d => ({ ...d, step: STEPS.find(s => s.n === d.n) || null, where: `${TIER}-${d.n}` }));
const banks = new Map();
for (const f of fs.readdirSync(path.join(NQ, 'sets')).filter(f => new RegExp(`^u\\d-${TIER}\\.json$`).test(f))) {
  banks.set(f, JSON.parse(fs.readFileSync(path.join(NQ, 'sets', f), 'utf8')));
}
const itemById = new Map([...banks.values()].flatMap(b => b.items.map(it => [it.id, { ...it, bankId: b.id }])));
/** A text's sentences (split after . ! ?) and the word count of each. */
const sentencesOf = t => String(t).split(/(?<=[.!?])\s+/).filter(Boolean);
const wordsIn = s => s.trim().split(/\s+/).filter(Boolean).length;
const within = (v, [lo, hi]) => v >= lo && v <= hi;
/** The reading-load rule every sentence a Launchpad child hears must meet. */
function shortSentences(text, at, max = LIMITS.sentences) {
  const ss = sentencesOf(text);
  assert.ok(ss.length <= max, `${at}: at most ${max} sentences (${ss.length}): ${text}`);
  for (const s of ss) assert.ok(wordsIn(s) <= LIMITS.words, `${at}: a sentence of ${wordsIn(s)} words (at most ${LIMITS.words}): ${s}`);
}
const stringsOf = d => [d.title, d.topic, d.talk, ...d.slides.flatMap(sl => [sl.title, sl.text, ...(sl.steps || []), ...(sl.words || []).flatMap(w => [w.word, w.means]), sl.visual ? sl.visual.label : null, ...(sl.focus || []).map(f => f.cue)])].filter(s => typeof s === 'string' && s);

test('every Launchpad step has its deck, every deck its step, and the course loader finds no problem', () => {
  assert.ok(decks.length >= 1, 'the Launchpad tier has decks');
  assert.deepEqual(decks.map(d => d.n), STEPS.map(s => s.n).sort(), 'course/launchpad holds exactly the catalogue’s Launchpad steps');
  assert.deepEqual(C.deckProblems(TIER, 'number-quest'), []);
  for (const s of C.steps(C.getCourse('number-quest'), TIER)) assert.equal(s.deck, true, `${s.key}: a real deck, not the placeholder`);
  for (const [f, b] of banks) {
    const unit = +f[1];
    assert.equal(b.id, `nq-u${unit}-${TIER}`, `sets/${f}: id`);
    assert.equal(b.program, 'number-quest'); assert.equal(b.kind, 'quiz'); assert.equal(b.unit, unit); assert.equal(b.band, 'Launchpad');
    for (const it of b.items) {
      assert.match(it.id, new RegExp(`^nq-${TIER}-${unit}\\.\\d-e[123]$`), `sets/${f}: item id ${it.id}`);
      assert.ok(decks.some(d => d.deck.check.includes(it.id)), `sets/${f}: ${it.id} is asked by its step’s deck`);
    }
  }
});

test('every deck matches the catalogue: key, band, title, topic, minutes, game or talk', () => {
  for (const { n, deck: d, step, where } of decks) {
    assert.ok(step, `${where}: units.json has the step`);
    assert.equal(d.key, `${TIER}-${n}`); assert.equal(d.n, n); assert.equal(d.band, TIER);
    assert.equal(d.title, step.titles[TIER], `${where}: catalogue title`);
    assert.equal(d.topic, step.shorts[TIER], `${where}: catalogue topic`);
    assert.ok(within(d.title.length, LIMITS.title), `${where}: deck title ${LIMITS.title.join('..')} chars`);
    assert.ok(Number.isInteger(d.minutes) && within(d.minutes, LIMITS.minutes), `${where}: minutes ${LIMITS.minutes.join('..')}`);
    const spec = step.game[TIER];
    if (!spec) {
      assert.equal(d.game, null, `${where}: no game`);
      assert.ok(typeof d.talk === 'string' && /\?$/.test(d.talk), `${where}: a talk question`);
      shortSentences(d.talk, `${where} talk`);
    } else {
      assert.equal(d.game.slug, spec.slug, `${where}: game slug matches units.json`);
      assert.equal(d.game.chapter, spec.chapter, `${where}: game chapter matches units.json`);
      assert.equal(d.game.params, spec.params, `${where}: game params match units.json`);
      assert.ok(fs.existsSync(path.join(ROOT, 'seed-games', `${spec.slug}.html`)) || fs.existsSync(path.join(ROOT, 'seed-games', `${spec.slug}.json`)), `${where}: ${spec.slug} exists`);
      assert.ok(d.slides.at(-1).text.includes(spec.chapterTitle), `${where}: the mission names the chapter as units.json shows it (${spec.chapterTitle})`);
      // A lesson mode names its tier: Launchpad's is nql-<unit>-<step> (nq- alone is the Explorer tier's).
      const mode = new URLSearchParams(spec.params || '').get('mode') || '';
      if (/^nq[lp]?-\d-\d$/.test(mode)) assert.equal(mode, `nql-${n.replace('.', '-')}`, `${where}: a Number Quest lesson mode is this step’s own, in the Launchpad encoding`);
    }
  }
});

test('Launchpad reading load: 5-7 slides, short titles, at most 2 sentences of at most 12 words a slide', () => {
  for (const { deck: d, where } of decks) {
    assert.ok(within(d.slides.length, LIMITS.slides), `${where}: ${LIMITS.slides.join('-')} slides (${d.slides.length})`);
    const kinds = d.slides.map(s => s.kind || 'text');
    assert.equal(kinds.filter(k => k === 'example').length, 1, `${where}: one example`);
    assert.equal(kinds.filter(k => k === 'words').length, 1, `${where}: exactly one words slide`);
    assert.equal(kinds.filter(k => k === 'mission').length, 1, `${where}: one mission`);
    assert.equal(kinds.at(-1), 'mission', `${where}: the mission is last`);
    const titles = new Set();
    for (const [i, s] of d.slides.entries()) {
      const at = `${where} slide ${i + 1}`;
      assert.ok(typeof s.title === 'string' && within(s.title.length, LIMITS.title), `${at}: title ${LIMITS.title.join('..')} chars (${(s.title || '').length})`);
      assert.ok(!titles.has(s.title.toLowerCase()), `${at}: titles differ`); titles.add(s.title.toLowerCase());
      assert.ok(typeof s.text === 'string' && within(s.text.length, LIMITS.text), `${at}: text ${LIMITS.text.join('..')} chars (${(s.text || '').length})`);
      shortSentences(s.text, at);
      assert.ok(ART.includes(s.art), `${at}: art id ${s.art}`);
      if ('say' in s) shortSentences(s.say, `${at} say`, 3);
      if (s.kind === 'example') {
        assert.ok(Array.isArray(s.steps) && within(s.steps.length, LIMITS.chips), `${at}: ${LIMITS.chips.join('-')} chips`);
        for (const c of s.steps) assert.ok(c.length >= 1 && c.length <= LIMITS.chip && wordsIn(c) <= LIMITS.words, `${at}: a short chip (${c})`);
      }
      if (s.kind === 'words') {
        assert.equal(s.words.length, LIMITS.wordsOnSlide, `${at}: exactly ${LIMITS.wordsOnSlide} words`);
        for (const w of s.words) {
          assert.deepEqual(Object.keys(w), ['word', 'means']);
          assert.ok(w.word.length >= 2 && wordsIn(w.word) <= 2, `${at}: ${w.word} is one word (or two)`);
          assert.ok(within(w.means.length, LIMITS.means) && wordsIn(w.means) <= LIMITS.words, `${at}: ${w.word} means something short (${w.means})`);
        }
      }
      // The media rules, as on the Explorer street.
      if ('img' in s) {
        assert.equal(s.kind, 'mission', `${at}: a screenshot belongs on the mission slide only`);
        assert.ok(d.game && s.img.startsWith(`nq/${d.game.slug}/`), `${at}: img ${s.img} is the assigned game's own key`);
        assert.ok(typeof s.alt === 'string' && s.alt.length >= 10 && s.alt.length <= 160, `${at}: a truthful alt of 10..160 chars`);
      }
      if ('story' in s) {
        assert.ok(!('visual' in s) && !('img' in s) && !('focus' in s), `${at}: story never displaces a drawn diagram, a screenshot or guided focus`);
        assert.equal(s.story.scene, 'street', `${at}: the street scene`);
        assert.deepEqual(s.story.chars, ['tally'], `${at}: Tally alone on the street`);
        assert.ok(Number.isInteger(s.story.lit) && s.story.lit >= 0 && s.story.lit <= 4, `${at}: street lit 0..4`);
      }
      assert.ok(!('focus' in s) || 'visual' in s, `${at}: guided focus only ever sits on a drawn diagram`);
      if ('visual' in s) {
        assert.ok(C.VISUAL_TYPES.includes(s.visual.type), `${at}: visual type ${s.visual.type}`);
        assert.ok(typeof s.visual.label === 'string' && s.visual.label.length >= 12, `${at}: the diagram has a real accessible label`);
        assert.ok(Array.isArray(s.focus) && s.focus.length >= 1 && s.focus.length <= 4, `${at}: a drawn diagram carries 1-4 guided focus steps`);
        for (const f of s.focus) assert.ok(typeof f.cue === 'string' && f.cue.length >= 4 && wordsIn(f.cue) <= LIMITS.words, `${at}: a short focus cue (${f.cue})`);
      }
    }
  }
});

test('the quick check: the step’s own three items, short and picture-free, tagged, with a why', () => {
  for (const { n, deck: d, step, where } of decks) {
    assert.deepEqual(d.check, [1, 2, 3].map(i => `nq-${TIER}-${n}-e${i}`), `${where}: own item ids`);
    const st = step.standards[TIER];
    for (const id of d.check) {
      const it = itemById.get(id);
      assert.ok(it, `${where}: ${id} exists in a Launchpad bank`);
      assert.equal(it.bankId, `nq-u${step.unit}-${TIER}`, `${where}: ${id} in the unit bank`);
      assert.equal(it.lesson, n); assert.equal(it.use, 'exit');
      if (st.flag === 'framing' || st.flag === 'enrichment') assert.equal(it.cat, st.flag, `${where}: ${id} is tagged ${st.flag}, never as coverage`);
      else assert.ok(st.primary.includes(it.cat) && locked.has(it.cat), `${where}: ${id} cat ${it.cat} is a primary code of the step, locked in launchpadCodes`);
      assert.ok(typeof it.q === 'string' && it.q.length >= 8 && it.q.length <= LIMITS.q, `${where}: ${id} question at most ${LIMITS.q} chars (${it.q.length})`);
      assert.equal(it.choices.length, 4, `${where}: ${id} four choices`); assert.equal(new Set(it.choices).size, 4, `${where}: ${id} choices differ`);
      for (const c of it.choices) assert.ok(typeof c === 'string' && c.length >= 1 && c.length <= LIMITS.choice, `${where}: ${id} choice at most ${LIMITS.choice} chars (${c})`);
      assert.ok(Number.isInteger(it.answer) && it.answer >= 0 && it.answer <= 3);
      assert.equal(it.misconceptions.length, 4, `${where}: ${id} tags every choice`);
      assert.equal(it.misconceptions[it.answer], 'correct', `${where}: ${id} the key is tagged correct`);
      for (const [i, m] of it.misconceptions.entries()) if (i !== it.answer) assert.ok(m.length >= 10, `${where}: ${id} distractor ${i + 1} names its misconception`);
      assert.ok(typeof it.why === 'string' && within(it.why.length, LIMITS.why), `${where}: ${id} a why of ${LIMITS.why.join('..')} chars (${(it.why || '').length})`);
      assert.ok(!/[–—]/.test(it.why), `${where}: ${id} no long dashes in a why`);
    }
  }
});

test('kid-safe text: no links, brands, framework names or codes in decks or items; US spelling', () => {
  const check = (strings, where) => {
    for (const s of strings) {
      for (const [re, why] of BAD) assert.ok(!re.test(s), `${where} has ${why}: ${s}`);
      assert.ok(!UK.test(s), `${where}: US spelling please: ${s}`);
      assert.ok(!BRAND.test(s), `${where}: no brand names: ${s}`);
    }
  };
  for (const { deck: d, where } of decks) check(stringsOf(d), where);
  for (const [id, it] of itemById) check([it.q, ...it.choices, it.why], `item ${id}`);
});

test('the Launchpad welcome: Tally, the Gardens and the Jumble, with no game and a talk', () => {
  const d = decks.find(x => x.n === '0.1').deck;
  assert.equal(d.title, 'Meet Tally in the Gardens'); assert.equal(d.game, null);
  const text = d.slides.map(s => `${s.title} ${s.text}`).join(' ');
  assert.match(text, /Tally/); assert.match(text, /Gardens/); assert.match(text, /Jumble/);
  assert.ok(d.slides.filter(s => s.story).length >= 2, 'story slides with Tally');
  assert.ok(d.slides.every(s => !s.visual && !s.focus && !s.img), 'no diagram, so no focus boxes are needed');
  assert.deepEqual(d.check.map(id => itemById.get(id).cat), ['framing', 'framing', 'framing']);
});
