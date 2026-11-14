// Number Quest Pro decks (seed-lessons/number-quest/course/pro/*.json, grades 6 to 8, ages 11-14).
// Pro keeps every deck rule of the other two streets that makes sense and sets its own reading load: longer
// sentences and real vocabulary, not the two short sentences of a Launchpad slide. The Pro limits live here, and
// they are enforced for EVERY deck file in course/pro (and every bank sets/u<n>-pro.json), so the decks of Units
// 1-7, written later and side by side, are held to them from their first commit:
//   - a slide: title 3-60 chars, text 20-320 chars, at most 4 sentences of at most 28 words; a deck reads at
//     grade 9 or under by the Flesch-Kincaid estimate (PRO.grade);
//   - a deck: 5-7 slides, exactly one example slide (2-8 chips of at most 60 chars), exactly one words slide with
//     3-5 words (a meaning of 10-140 chars), the mission last; minutes 4-12; a step with no game carries a talk;
//   - a drawn diagram carries 1-4 focus steps with cues of 8-80 chars and at most 18 words;
//   - the quick check is the step's own three items from its unit bank: question at most 220 chars, four
//     distinct choices of at most 70 chars, a why of 30-240 chars, every distractor tagged;
//   - maths is printed with the real signs (a true minus sign, ², ³, √, ×, ÷, ≤, ≥, °), whatever the author typed,
//     and read-aloud says it in words: no bare sign reaches the voice;
//   - contexts are neutral (owner decision 3): nothing is priced or sold in any deck; a tax or discount item may
//     appear only in step 4.3's check, at most two of them; interest and commission appear nowhere;
//   - kid-safe text: no links, brands, framework names or codes; US spelling.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const C = await import('../../server/services/courses.js');
const T = await import('../../server/services/number-quest-tiers.js');
const { sayOf } = await import('../../server/views/courses.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const NQ = path.join(ROOT, 'seed-lessons/number-quest');
const TIER = 'pro';
/** The Pro deck limits (ages 11-14). The engine's own hard caps are wider (text 400, a chip 60, a meaning 160, a cue 80). */
export const PRO = Object.freeze({ title: [3, 60], text: [20, 320], sentences: 4, words: 28, grade: 9, slides: [5, 7], wordsOnSlide: [3, 5], chips: [2, 8], chip: 60,
  means: [10, 140], cue: [8, 80], cueWords: 18, q: 220, choice: 70, why: [30, 240], minutes: [4, 12] });
const LAUNCHPAD = Object.freeze({ text: 160, sentences: 2, words: 12 }); // tests/unit/number-quest-launchpad-decks.test.js
const ART = C.ART_IDS;
const UK = /\b(colours?|coloured|colouring|favourites?|grey|labelled|licence|organis(e|ed|ing)|practis(e|ed|ing)|neighbours?|recognis(e|ed|ing)|maths|centre|metres?|litres?|behaviours?|honour|catalogue|analys(e|ed|ing)|defence|travelled|modelling|cancelled|jewellery|tyres?|whilst|learnt|spelt|programme)\b/i;
const BRAND = /\b(Bluetooth|Wi-?Fi|iPad|iPhone|Android|Chromebook|Windows|Google|YouTube|TikTok|Minecraft|Roblox|Fortnite|Lego|Nintendo|Xbox|PlayStation|Alexa|Siri|Duolingo)\b/i;
const BAD = [[/\d{7,}/, 'a 7+ digit run'], [/@/, 'an @'], [/\/\/\w[\w.-]*\.\w{2,}/, 'a //host.tld link'], [/https?:/i, 'a URL scheme'], [/\bwww\./i, 'a www. link'],
  [/Common Core|CCSS/i, 'a framework name'], [/\b(K|[1-8])\.(CC|OA|NBT|NF|MD|G|RP|NS|EE|SP|F)\.[A-D]\.\d[a-z]?\b/, 'a CCSS-M code'], [/\bMP[1-8]\b/, 'a practice code']];
// Typed stand-ins a learner must never see, and the signs a voice must never be handed.
const TYPED = [[/(^|[\s(=<>×÷+,:])-(?=\d|\.\d)/, 'a hyphen for a minus sign'], [/\^/, 'a caret for a power'], [/\bsqrt\b/i, 'sqrt for a root'], [/\d \* \d|\d\*\d/, 'a star for times'], [/\d x \d/, 'an x for times'], [/<=|>=|!=/, 'a typed comparison']];
const RAW = /[−√∛²³⁰¹⁴-⁹°×÷≤≥≠≈π]|\d\/\d|_{2,}/;
const SOLD = /[$€£]\s?\d|\b(prices?|priced|costs?|buy(s|ing)?|bought|sell(s|ing)?|sold|pay(s|ing)?|paid|shop(s|ping)?|store sale|on sale|coupons?|wages?|salar(y|ies)|profits?|loans?|debts?|cents?|dollars?)\b/i;
const TAXISH = /\b(tax(es)?|sales tax|discount(s|ed)?|tips?|markups?|markdowns?)\b/i;
const NEVER = /\b(interest|commissions?|simple interest|compound interest)\b/i;

const cat = JSON.parse(fs.readFileSync(path.join(NQ, 'units.json'), 'utf8'));
const reg = JSON.parse(fs.readFileSync(path.join(NQ, 'standards.json'), 'utf8'));
const locked = new Set(Object.keys(reg.proCodes.codes));
const UNITS = cat.units.filter(u => u.tier === TIER);
const BUILT = UNITS.filter(u => !u.planned).flatMap(u => u.steps.map(s => ({ ...s, unit: u.n })));
const PLANNED = UNITS.filter(u => u.planned).flatMap(u => u.steps.map(s => ({ ...s, unit: u.n })));
const deckDir = path.join(NQ, 'course', TIER);
const files = fs.readdirSync(deckDir).filter(f => f.endsWith('.json')).sort();
const course = C.getCourse('number-quest');
// `raw` is the file as written; `shown` is what the learner gets (the loader prints typed maths with the real signs).
const decks = files.map(f => ({ n: f.replace('.json', ''), raw: JSON.parse(fs.readFileSync(path.join(deckDir, f), 'utf8')) }))
  .map(d => ({ ...d, step: BUILT.find(s => s.n === d.n) || null, shown: C.getStep(course, `${TIER}-${d.n}`), where: `${TIER}-${d.n}` }));
const banks = new Map();
for (const f of fs.readdirSync(path.join(NQ, 'sets')).filter(f => new RegExp(`^u\\d-${TIER}\\.json$`).test(f))) banks.set(f, JSON.parse(fs.readFileSync(path.join(NQ, 'sets', f), 'utf8')));
const rawItems = new Map([...banks.values()].flatMap(b => b.items.map(it => [it.id, { ...it, bankId: b.id }])));
const sentencesOf = t => String(t).split(/(?<=[.!?])\s+(?=[A-Z0-9"−(])/).filter(Boolean);
const wordsIn = s => s.trim().split(/\s+/).filter(Boolean).length;
const within = (v, [lo, hi]) => v >= lo && v <= hi;
/** Syllables in a word, by the usual vowel-group estimate (enough for a reading-level ceiling). */
const syllables = w => { const x = w.toLowerCase().replace(/[^a-z]/g, ''); if (!x) return 0; const n = (x.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g) || []).length; return Math.max(1, n); };
/** The Flesch-Kincaid grade of a text (words of letters only; numbers and signs are not words). */
export function fkGrade(text) {
  const ss = sentencesOf(text), ws = String(text).split(/\s+/).filter(w => /[a-z]/i.test(w));
  if (!ss.length || !ws.length) return 0;
  return 0.39 * (ws.length / ss.length) + 11.8 * (ws.reduce((n, w) => n + syllables(w), 0) / ws.length) - 15.59;
}
const stringsOf = d => [d.title, d.topic, d.talk, ...d.slides.flatMap(sl => [sl.title, sl.text, sl.say, ...(sl.steps || []), ...(sl.words || []).flatMap(w => [w.word, w.means]), sl.visual ? sl.visual.label : null, ...(sl.focus || []).map(f => f.cue)])].filter(s => typeof s === 'string' && s);

test('every built Pro step has its deck, a planned step has none, and the course loader finds no problem', () => {
  assert.ok(decks.length >= 1, 'the Pro tier has decks');
  assert.deepEqual(decks.map(d => d.n), BUILT.map(s => s.n).sort(), 'course/pro holds exactly the decks of the built Pro steps');
  assert.deepEqual(BUILT.map(s => `${TIER}-${s.n}`), T.stepsOf(TIER).map(s => s.key), 'the built steps are the engine\'s steps');
  for (const s of PLANNED) assert.ok(!files.includes(`${s.n}.json`), `pro ${s.n} is planned: a deck for it means its unit is being built, so "planned" must go in the same change`);
  assert.deepEqual(C.deckProblems(TIER, 'number-quest'), []);
  for (const s of C.steps(course, TIER)) assert.equal(s.deck, true, `${s.key}: a real deck, not the placeholder`);
  const builtUnits = new Set(BUILT.map(s => s.unit));
  for (const [f, b] of banks) {
    const unit = +f[1];
    assert.ok(builtUnits.has(unit), `sets/${f}: a bank belongs to a built unit`);
    assert.equal(b.id, `nq-u${unit}-${TIER}`, `sets/${f}: id`);
    assert.equal(b.program, 'number-quest'); assert.equal(b.kind, 'quiz'); assert.equal(b.unit, unit); assert.equal(b.band, 'Pro');
    for (const it of b.items) {
      assert.match(it.id, new RegExp(`^nq-${TIER}-${unit}\\.\\d-e[123]$`), `sets/${f}: item id ${it.id}`);
      assert.ok(decks.some(d => d.raw.check.includes(it.id)), `sets/${f}: ${it.id} is asked by its step's deck`);
    }
  }
});

test('every Pro deck matches the catalogue: key, band, title, topic, minutes, game or talk', () => {
  for (const { n, raw: d, step, where } of decks) {
    assert.ok(step, `${where}: units.json has the step, built`);
    assert.equal(d.key, `${TIER}-${n}`); assert.equal(d.n, n); assert.equal(d.band, TIER);
    assert.equal(d.title, step.titles[TIER], `${where}: catalogue title`);
    assert.equal(d.topic, step.shorts[TIER], `${where}: catalogue topic`);
    assert.ok(within(d.title.length, PRO.title), `${where}: deck title ${PRO.title.join('..')} chars`);
    assert.ok(Number.isInteger(d.minutes) && within(d.minutes, PRO.minutes), `${where}: minutes ${PRO.minutes.join('..')}`);
    const spec = step.game[TIER];
    if (!spec) {
      assert.equal(d.game, null, `${where}: no game`);
      assert.ok(typeof d.talk === 'string' && /\?$/.test(d.talk) && wordsIn(d.talk) <= PRO.words, `${where}: a talk question of at most ${PRO.words} words`);
    } else {
      assert.equal(d.game.slug, spec.slug, `${where}: game slug matches units.json`);
      assert.equal(d.game.chapter, spec.chapter, `${where}: game chapter matches units.json`);
      assert.equal(d.game.params, spec.params, `${where}: game params match units.json`);
      assert.ok(fs.existsSync(path.join(ROOT, 'seed-games', `${spec.slug}.html`)), `${where}: ${spec.slug} exists`);
      assert.ok(d.slides.at(-1).text.includes(spec.chapterTitle), `${where}: the mission names the chapter as units.json shows it (${spec.chapterTitle})`);
      assert.match(spec.params, /^chapter=[a-z]+&lock=1$/, `${where}: a Pro mission is a locked chapter of the unit's own game`);
    }
  }
});

test('Pro reading load: 5-7 slides; a slide is up to 4 sentences of up to 28 words; a deck reads at grade 9 or under', () => {
  for (const { raw: d, where } of decks) {
    assert.ok(within(d.slides.length, PRO.slides), `${where}: ${PRO.slides.join('-')} slides (${d.slides.length})`);
    const kinds = d.slides.map(s => s.kind || 'text');
    assert.equal(kinds.filter(k => k === 'example').length, 1, `${where}: one example`);
    assert.equal(kinds.filter(k => k === 'words').length, 1, `${where}: exactly one words slide`);
    assert.equal(kinds.filter(k => k === 'mission').length, 1, `${where}: one mission`);
    assert.equal(kinds.at(-1), 'mission', `${where}: the mission is last`);
    const titles = new Set();
    for (const [i, s] of d.slides.entries()) {
      const at = `${where} slide ${i + 1}`;
      assert.ok(typeof s.title === 'string' && within(s.title.length, PRO.title), `${at}: title ${PRO.title.join('..')} chars (${(s.title || '').length})`);
      assert.ok(!titles.has(s.title.toLowerCase()), `${at}: titles differ`); titles.add(s.title.toLowerCase());
      assert.ok(typeof s.text === 'string' && within(s.text.length, PRO.text), `${at}: text ${PRO.text.join('..')} chars (${(s.text || '').length})`);
      const ss = sentencesOf(s.text);
      assert.ok(ss.length <= PRO.sentences, `${at}: at most ${PRO.sentences} sentences (${ss.length})`);
      for (const x of ss) assert.ok(wordsIn(x) <= PRO.words, `${at}: a sentence of ${wordsIn(x)} words (at most ${PRO.words}): ${x}`);
      assert.ok(ART.includes(s.art), `${at}: art id ${s.art}`);
      if (s.kind === 'example') {
        assert.ok(Array.isArray(s.steps) && within(s.steps.length, PRO.chips), `${at}: ${PRO.chips.join('-')} chips`);
        for (const c of s.steps) assert.ok(typeof c === 'string' && c.length >= 1 && c.length <= PRO.chip, `${at}: a chip of at most ${PRO.chip} chars (${c})`);
      }
      if (s.kind === 'words') {
        assert.ok(within(s.words.length, PRO.wordsOnSlide), `${at}: ${PRO.wordsOnSlide.join('-')} words`);
        for (const w of s.words) {
          assert.deepEqual(Object.keys(w), ['word', 'means']);
          assert.ok(w.word.length >= 2 && wordsIn(w.word) <= 3, `${at}: ${w.word} is a term of one to three words`);
          assert.ok(within(w.means.length, PRO.means), `${at}: ${w.word} has a meaning of ${PRO.means.join('..')} chars (${w.means.length})`);
        }
      }
      // The media rules, as on the other streets.
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
        for (const f of s.focus) assert.ok(typeof f.cue === 'string' && within(f.cue.length, PRO.cue) && wordsIn(f.cue) <= PRO.cueWords, `${at}: a focus cue of ${PRO.cue.join('..')} chars and at most ${PRO.cueWords} words (${f.cue})`);
      }
    }
    const prose = d.slides.map(s => s.text).join(' ');
    assert.ok(fkGrade(prose) <= PRO.grade, `${where}: reads at grade ${fkGrade(prose).toFixed(1)} (at most ${PRO.grade})`);
  }
});

test('the Pro voice is older than Launchpad\'s: the limits are wider, and the welcome deck uses the room', () => {
  assert.ok(PRO.text[1] > LAUNCHPAD.text && PRO.sentences > LAUNCHPAD.sentences && PRO.words > LAUNCHPAD.words);
  const proseOf = (tier, n) => JSON.parse(fs.readFileSync(path.join(NQ, 'course', tier, `${n}.json`), 'utf8')).slides.map(s => s.text).join(' ');
  const mean = t => { const ss = sentencesOf(t); return ss.reduce((k, s) => k + wordsIn(s), 0) / ss.length; };
  const pro = proseOf('pro', '0.1'), lp = proseOf('launchpad', '0.1');
  assert.ok(mean(pro) >= 10 && mean(pro) > mean(lp) * 1.5, `Pro sentences average ${mean(pro).toFixed(1)} words, Launchpad's ${mean(lp).toFixed(1)}`);
  assert.ok(fkGrade(pro) > fkGrade(lp) && fkGrade(pro) <= PRO.grade, `Pro reads at grade ${fkGrade(pro).toFixed(1)}, Launchpad at ${fkGrade(lp).toFixed(1)}`);
  assert.ok(sentencesOf(pro).some(x => wordsIn(x) > LAUNCHPAD.words), 'some Pro sentences are longer than any a Launchpad slide may hold');
  // The estimate itself, on text whose level is plain.
  assert.ok(fkGrade('The cat sat. The dog ran. We count to ten.') < 2);
  assert.ok(fkGrade('Proportional relationships characterize quantities whose multiplicative comparison remains invariant throughout considerable variation.') > 16);
});

test('Pro maths is printed with the real signs and read aloud in words, on every slide', () => {
  let spoken = 0;
  for (const { raw: d, shown, where } of decks) {
    assert.equal(shown.slides.length, d.slides.length);
    for (const [i, s] of shown.slides.entries()) {
      const at = `${where} slide ${i + 1}`;
      const printed = [s.title, s.text, s.say, ...(s.steps || []), ...(s.words || []).map(w => w.means), ...(s.focus || []).map(f => f.cue)].filter(Boolean);
      for (const x of printed) for (const [re, what] of TYPED) assert.ok(!re.test(x), `${at}: ${what} would be shown to the learner: ${x}`);
      const said = sayOf(s, TIER);
      assert.doesNotMatch(said, RAW, `${at}: read-aloud says every sign in words: ${said}`);
      assert.ok(said.length >= 20, `${at}: something is said`);
      if (said !== sayOf(s)) spoken++;
    }
    for (const id of d.check) {
      const it = C.item(id);
      for (const x of [it.q, ...it.choices, it.why]) for (const [re, what] of TYPED) assert.ok(!re.test(x), `${where} ${id}: ${what} would be shown to the learner: ${x}`);
    }
  }
  assert.ok(spoken >= 2, 'the welcome deck really has maths the voice needs in words (the −5°C slide and the words slide)');
  const cold = decks.find(d => d.n === '0.1').shown.slides.find(s => /Cold Store/.test(s.text));
  assert.match(cold.text, /−5°C/, 'printed with the true minus sign and the degree sign');
  assert.match(sayOf(cold, TIER), /a sample at negative 5 degrees Celsius\. Warm it by 8 degrees and it climbs past zero to 3 degrees Celsius\./);
  // What an author types is printed properly: a slide written with a keyboard's signs loads with the real ones
  // (tests/unit/number-quest-math-text.test.js pins every conversion).
  const typed = C.cleanSlide(C.proText.slide({ title: 'Below zero', text: 'From -5 it warms by 8: -5 + 8 = 3, and 3^2 = 9.', art: 'ruler' }));
  assert.equal(typed.text, 'From \u22125 it warms by 8: \u22125 + 8 = 3, and 3² = 9.');
});

test('the Pro quick check: the step’s own three items, tagged, with a why that teaches', () => {
  for (const { n, raw: d, step, where } of decks) {
    assert.deepEqual(d.check, [1, 2, 3].map(i => `nq-${TIER}-${n}-e${i}`), `${where}: own item ids`);
    const st = step.standards[TIER];
    for (const id of d.check) {
      const it = rawItems.get(id);
      assert.ok(it, `${where}: ${id} exists in a Pro bank`);
      assert.equal(it.bankId, `nq-u${step.unit}-${TIER}`, `${where}: ${id} in the unit bank`);
      assert.equal(it.lesson, n); assert.equal(it.use, 'exit');
      if (st.flag === 'framing' || st.flag === 'enrichment') assert.equal(it.cat, st.flag, `${where}: ${id} is tagged ${st.flag}, never as coverage`);
      else assert.ok(st.primary.includes(it.cat) && locked.has(it.cat), `${where}: ${id} cat ${it.cat} is a primary code of the step, locked in proCodes`);
      assert.ok(typeof it.q === 'string' && it.q.length >= 12 && it.q.length <= PRO.q, `${where}: ${id} question at most ${PRO.q} chars (${it.q.length})`);
      assert.equal(it.choices.length, 4, `${where}: ${id} four choices`); assert.equal(new Set(it.choices).size, 4, `${where}: ${id} choices differ`);
      for (const c of it.choices) assert.ok(typeof c === 'string' && c.length >= 1 && c.length <= PRO.choice, `${where}: ${id} choice at most ${PRO.choice} chars (${c})`);
      assert.ok(Number.isInteger(it.answer) && it.answer >= 0 && it.answer <= 3);
      assert.equal(it.misconceptions.length, 4, `${where}: ${id} tags every choice`);
      assert.equal(it.misconceptions[it.answer], 'correct', `${where}: ${id} the key is tagged correct`);
      for (const [i, m] of it.misconceptions.entries()) if (i !== it.answer) assert.ok(m.length >= 15 && /^(?:[a-z]+ed|found|took|gave|kept|left|saw|thought|chose|drew|wrote|made|put|lost|ran|went|did|read)\b/.test(m), `${where}: ${id} distractor ${i + 1} names its misconception, starting with a past-tense verb (${m})`);
      assert.ok(typeof it.why === 'string' && within(it.why.length, PRO.why), `${where}: ${id} a why of ${PRO.why.join('..')} chars (${(it.why || '').length})`);
      assert.ok(!/[–—]/.test(it.why), `${where}: ${id} no long dashes in a why`);
    }
    // The three keys do not all sit in one position.
    assert.ok(new Set(d.check.map(id => rawItems.get(id).answer)).size >= 2, `${where}: the keys are not all in the same place`);
  }
});

test('kid-safe text and neutral contexts: nothing priced or sold; tax or discount only in step 4.3’s check; no interest or commission anywhere', () => {
  const check = (strings, where) => {
    for (const s of strings) {
      for (const [re, why] of BAD) assert.ok(!re.test(s), `${where} has ${why}: ${s}`);
      assert.ok(!UK.test(s), `${where}: US spelling please: ${s}`);
      assert.ok(!BRAND.test(s), `${where}: no brand names: ${s}`);
      assert.ok(!NEVER.test(s), `${where}: interest and commission appear nowhere in Pro: ${s}`);
    }
  };
  for (const { raw: d, where } of decks) {
    check(stringsOf(d), where);
    for (const s of stringsOf(d)) { assert.ok(!SOLD.test(s), `${where}: nothing is priced or sold in a deck: ${s}`); assert.ok(!TAXISH.test(s), `${where}: tax, tips and discounts stay out of the decks: ${s}`); }
  }
  let taxItems = 0;
  for (const [id, it] of rawItems) {
    const strings = [it.q, ...it.choices, it.why];
    check(strings, `item ${id}`);
    const priced = strings.some(s => SOLD.test(s) || TAXISH.test(s));
    if (priced) { assert.equal(it.lesson, '4.3', `item ${id}: a tax or discount context is allowed only in step 4.3's check`); taxItems++; }
  }
  assert.ok(taxItems <= 2, `at most two tax or discount items in the whole tier (${taxItems})`);
  // The rules bite: the words they are for are caught, and the neutral contexts the plan names are not.
  for (const s of ['A jacket costs $40.', 'The shop has a sale.', 'She paid 12 dollars.']) assert.ok(SOLD.test(s), s);
  for (const s of ['Find the sales tax.', 'A 20% discount.', 'Leave a tip.']) assert.ok(TAXISH.test(s), s);
  for (const s of ['Simple interest of 5%.', 'A commission of 3%.']) assert.ok(NEVER.test(s), s);
  for (const s of ['A recipe uses 2 cups of oats.', 'The map is 1 cm to 250 m.', 'She scored on 12 of 20 shots.', 'The tank dropped from 80 liters to 60.', 'A point on the line.', 'The store room is 3 m wide.']) assert.ok(!SOLD.test(s) && !TAXISH.test(s) && !NEVER.test(s), s);
});

test('the Pro welcome: Tally, the Towers, the gears and the Great Clock, with no game, a talk and two of the new diagrams', () => {
  const d = decks.find(x => x.n === '0.1').raw;
  assert.equal(d.title, 'Welcome to the Towers'); assert.equal(d.game, null); assert.ok(d.talk);
  const text = d.slides.map(s => `${s.title} ${s.text}`).join(' ');
  for (const re of [/Tally/, /towers/i, /Great Clock/, /seven gears/, /Jumble/, /Numberworks/]) assert.match(text, re);
  assert.ok(d.slides.filter(s => s.story).length >= 2, 'story slides with Tally');
  assert.deepEqual(d.slides.filter(s => s.visual).map(s => [s.visual.type, !!s.visual.upright]), [['double', false], ['numberline', true]], 'a double number line and an upright number line, from the Pro diagram pack');
  assert.deepEqual(d.check.map(id => rawItems.get(id).cat), ['framing', 'framing', 'framing']);
  assert.doesNotMatch(text, /\b(little|tiny|bunny|kitty|yay|wow|super fun|let's count)\b/i, 'not written for a five-year-old');
  // The picture's numbers are the words' numbers: 2 to 3, scaled; from −5 up 8 to 3.
  const dbl = d.slides.find(s => s.visual && s.visual.type === 'double').visual;
  for (const [a, b] of dbl.ticks) if (b !== '?') assert.equal(a * 3, b * 2, `${a} : ${b} is the same ratio as 2 : 3`);
  const line = d.slides.find(s => s.visual && s.visual.type === 'numberline').visual;
  assert.equal(line.hops[0].from + 8, line.hops[0].to); assert.equal(line.point.at, 3); assert.equal(line.hops[0].from, -5);
});
