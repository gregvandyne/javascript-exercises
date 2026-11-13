// Parity repair round 1 (the independent Duolingo-parity evaluation, average 6.2/10): the mission
// completability and honesty fixes. Every Explorer step's mission must be finishable the win-gated
// way: Brain Board and Quest Race report a finished solo practice round (BRB.gameOver), Sum Racer
// missions are locked to the taught skill (its new Rounding Run track, operation-locked tracks),
// Fraction Factory was already chapter-locked. The teacher page gains the placement explainer with
// the caveat, the override and the K-8 matrix; the Sorting Game serves hands-on items as counters
// with a sense of how far along the run is; Laps 2/3 stop being advertised as playable.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const C = await import('../../server/services/courses.js');
const P = await import('../../server/services/number-quest-placement.js');
const { placementSection, placementMatrix } = await import('../../server/views/number-quest-teacher.js');
const PP = await import('../../server/services/play-params.js');
const { generateItem, TEMPLATES } = await import('../../seed-lessons/number-quest/placement/generator.js');

const course = C.getCourse('number-quest');
const steps = C.steps(course, 'explorer');
const byN = n => steps.find(s => s.n === n);

test('every mission game reports completion: gameOver call sites in all eight mission games', () => {
  // Fraction Factory fires only at chapter completion (its own test pins the single call site).
  assert.equal((read('seed-games/fraction-factory.html').match(/BRB\.gameOver\(/g) || []).length, 1);
  // Sum Racer fires at race end with won = place 1.
  assert.match(read('seed-games/sum-racer.html'), /BRB\.gameOver\(\{ won: place === 1/);
  // Brain Board (Greg, 5 Nov 2026): a LESSON board reports the moment its points goal is reached —
  // the latched pass fires before any board-cleared branch — and a cleared non-lesson practice board
  // still reports a finished round. Exactly two report sites, no more.
  const bb = read('seed-games/brain-board.html');
  assert.equal((bb.match(/BRB\.gameOver\(/g) || []).length, 2, 'the lesson pass and the practice clear are the only reports');
  assert.match(bb, /BRB\.gameOver\(\{ won: true, score: p\.score \}\)/);
  assert.match(bb, /if \(!nqPassed && p\.score >= NQ_GOAL\) \{ nqPassed = true; justPassed = true; \}/, 'the lesson pass is latched at the goal');
  assert.ok(bb.indexOf('justPassed') < bb.indexOf('if (!b.left)'), 'the lesson reports at its goal, not at the clear');
  // Quest Race: the solo practice race reports at its end, guarded to solo (a live class race must not).
  const qr = read('seed-games/quest-race.html');
  assert.match(qr, /if \(solo\) \{ try \{[^}]*BRB\.gameOver\(\{ won: true/);
  // Garden Count (Launchpad Unit 1): one report, in finish(), which runs only when a chapter's sixth round is right
  // (tests/unit/garden-count.test.js plays every chapter and counts the message).
  const gc = read('seed-games/garden-count.html');
  assert.equal((gc.match(/BRB\.gameOver\(/g) || []).length, 1);
  assert.match(gc, /function finish\(\) \{[\s\S]{0,500}BRB\.gameOver\(\{ won: true \}\)/);
  assert.match(gc, /if \(S\.round >= GC\.ROUNDS\) return finish\(\);/, 'finish follows the last round only');
  assert.equal((gc.match(/\bfinish\(\)/g) || []).length, 2, 'finish is defined once and called from one place');
  // Lily Hop (Launchpad Unit 2): the same shape, one report in finish(), after the sixth right round only
  // (tests/unit/lily-hop.test.js plays every chapter and counts the message).
  const lh = read('seed-games/lily-hop.html');
  assert.equal((lh.match(/BRB\.gameOver\(/g) || []).length, 1);
  assert.match(lh, /function finish\(\) \{[\s\S]{0,500}BRB\.gameOver\(\{ won: true \}\)/);
  assert.match(lh, /if \(S\.round >= LH\.ROUNDS\) return finish\(\);/, 'finish follows the last round only');
  assert.equal((lh.match(/\bfinish\(\)/g) || []).length, 2, 'finish is defined once and called from one place');
  // Crate Stacker (Launchpad Unit 3): the same shape again (tests/unit/crate-stacker.test.js plays every chapter and
  // counts the message).
  const cs = read('seed-games/crate-stacker.html');
  assert.equal((cs.match(/BRB\.gameOver\(/g) || []).length, 1);
  assert.match(cs, /function finish\(\) \{[\s\S]{0,500}BRB\.gameOver\(\{ won: true \}\)/);
  assert.match(cs, /if \(S\.round >= CS\.ROUNDS\) return finish\(\);/, 'finish follows the last round only');
  assert.equal((cs.match(/\bfinish\(\)/g) || []).length, 2, 'finish is defined once and called from one place');
  // Balance Bridge (Launchpad Unit 4): the same shape once more (tests/unit/balance-bridge.test.js plays every chapter
  // and counts the message).
  const bal = read('seed-games/balance-bridge.html');
  assert.equal((bal.match(/BRB\.gameOver\(/g) || []).length, 1);
  assert.match(bal, /function finish\(\) \{[\s\S]{0,500}BRB\.gameOver\(\{ won: true \}\)/);
  assert.match(bal, /if \(S\.round >= BB\.ROUNDS\) return finish\(\);/, 'finish follows the last round only');
  assert.equal((bal.match(/\bfinish\(\)/g) || []).length, 2, 'finish is defined once and called from one place');
});

test('Sum Racer missions are locked to the taught skill in units.json and in every deck', () => {
  const want = {
    '1.2': 'level=9&lock=1',               // the Rounding Run: nothing but rounding questions
    '2.1': 'level=10&mode=add&lock=1',     // the Trading Post: big adds that need a trade
    '2.2': 'level=10&mode=sub&lock=1',     // the Trading Post: big take-aways that need a trade
    '3.1': 'level=5&lock=1',               // every times table to 12 x 12 (6 x 7, 7 x 8 are taught)
    '3.2': 'level=6&lock=1',               // sharing (division)
    '3.3': 'level=7&lock=1',               // the mixed Grand Prix
  };
  for (const [n, params] of Object.entries(want)) {
    const s = byN(n);
    assert.equal(s.game.slug, 'sum-racer', n);
    assert.equal(s.game.params, params, `${n} is locked to its track`);
    const deck = JSON.parse(read(`seed-lessons/number-quest/course/explorer/${n}.json`));
    assert.deepEqual({ slug: deck.game.slug, chapter: deck.game.chapter, params: deck.game.params },
      { slug: s.game.slug, chapter: s.game.chapter, params: s.game.params }, `${n} deck agrees with units.json`);
    const mission = deck.slides.at(-1);
    assert.equal(mission.kind, 'mission');
    assert.match(mission.text, /Win the race/, `${n} mission says the win is the finish`);
    assert.doesNotMatch(mission.text, /race one track/, `${n} no longer invites any track`);
  }
  // The practice-round missions say what finishing means, and name no bank the game does not have.
  for (const n of ['1.1', '2.3']) {
    const deck = JSON.parse(read(`seed-lessons/number-quest/course/explorer/${n}.json`));
    assert.match(deck.slides.at(-1).text, /Practice Board and score 3,000 points to finish/, n);
    assert.equal(deck.game.chapter, 'Practice Board', n);
  }
  const d13 = JSON.parse(read('seed-lessons/number-quest/course/explorer/1.3.json'));
  assert.match(d13.slides.at(-1).text, /finish one whole Practice Race/);
  assert.deepEqual(C.deckProblems('explorer', 'number-quest'), [], 'the whole course still validates');
});

test('the Rounding Run is real: track 9 generates only rounding questions, with school-rule answers', () => {
  const html = read('seed-games/sum-racer.html');
  const pure = html.slice(html.indexOf('const CONFIG'), html.indexOf('/* @@PURE-END */'));
  const ctx = vm.createContext({});
  // The pure block declares with const/function, which do not attach to the vm global: name them out.
  vm.runInContext(`${pure}\n;globalThis.__sr = { CONFIG, makeRng, genQuestion, makeDeck, roundQ };`, ctx);
  const { CONFIG, makeRng, genQuestion, makeDeck } = ctx.__sr;
  assert.equal(CONFIG.tracks.length, 10);
  assert.equal(CONFIG.tracks[8].id, 9);
  const rng = makeRng(42);
  for (let i = 0; i < 60; i++) {
    const q = genQuestion(9, rng, {});
    assert.equal(q.op, 'round');
    assert.ok(q.y === 10 || q.y === 100);
    assert.equal(q.answer, Math.round(q.x / q.y) * q.y, q.text);
  }
  // Hand-checked: 268 -> 270 (nearest ten), 1450 -> 1500 (nearest hundred), halves round up.
  assert.equal(ctx.__sr.roundQ(268, 10).answer, 270);
  assert.equal(ctx.__sr.roundQ(1450, 100).answer, 1500);
  assert.equal(ctx.__sr.roundQ(450, 100).answer, 500);
  // A whole deck for the track serves nothing else, and missed rounding facts come back as rounding.
  const deck = makeDeck(9, makeRng(7), {});
  const first = deck.next(0);
  assert.equal(first.op, 'round');
  deck.report(first, false);
  for (let i = 0; i < 8; i++) assert.equal(deck.next(0.5).op, 'round');
  // The operation lock: track 3 with op '+' serves addition only, with '-' subtraction only.
  const addDeck = makeDeck(3, makeRng(11), { op: '+' });
  for (let i = 0; i < 12; i++) assert.equal(addDeck.next(0.5).op, '+');
  const subDeck = makeDeck(3, makeRng(11), { op: '-' });
  for (let i = 0; i < 12; i++) assert.equal(subDeck.next(0.5).op, '-');
  // The lesson lock reads BRB.params in the game body (outside the pure block).
  assert.match(html, /const LESSON = /);
  assert.match(html, /p\.lock === 1/);
  assert.match(html, /tn9: "Rounding Run"/);
});

test('the teacher page placement section: how it works, the caveat verbatim, the absolute override, the K-8 matrix', () => {
  const html = String(placementSection());
  assert.match(html, /How placement works/);
  assert.match(html, /Sorting Game/);
  // The caveat in the service's own words (the apostrophe is HTML-escaped in the page, so match its
  // two sentences on either side of it).
  assert.ok(html.includes('A ten-minute routing game, not a grade. It samples; it does'), 'the caveat opens verbatim');
  assert.ok(html.includes('Units before the start point remain open for review and test-out.'), 'the caveat closes verbatim');
  assert.ok(html.includes('doesn&#39;t certify'), 'the caveat apostrophe is escaped exactly once');
  assert.ok(!html.includes('&amp;#39;'), 'and never double-escaped (a literal &#39; on the page)');
  assert.ok(P.CAVEAT.startsWith('A ten-minute routing game'), 'and it is the placement service\u2019s caveat');
  assert.match(html, /Your override is absolute/);
  assert.match(html, /never sees a score/);
  assert.match(html, /Stop and start playing/);
  const matrix = String(placementMatrix());
  for (const g of ['K', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8']) assert.ok(matrix.includes(g), g);
  assert.match(matrix, /Short form \(audio-first\)/, 'K-2 play the Launchpad form');
  assert.match(matrix, /Standard form/, 'grades 3-8 play the standard form');
  assert.match(matrix, /Algebra &amp; Patterns/, 'the folded strand is named where it is visited');
});

test('the Sorting Game serves hands-on items as counters, Tally progress, and no answer ever leaks', async () => {
  // A count template generates tappable counters whose count is the (hidden) answer — the objects
  // themselves are what the prompt already draws, so serving them leaks nothing new.
  const countTpl = TEMPLATES.find(t => t.responseType === 'count-out' && t.archetype === 'count');
  const item = generateItem(countTpl, 'seed-1');
  assert.equal(item.manip.kind, 'count-out');
  assert.equal(item.manip.count, item.answer);
  const buildTpl = TEMPLATES.find(t => t.responseType === 'build' && t.archetype === 'tensMore');
  const built = generateItem(buildTpl, 'seed-2');
  assert.deepEqual({ kind: built.manip.kind, tens: built.manip.tens }, { kind: 'build', tens: 1 });
  assert.equal(built.manip.tens * 10 + built.manip.extra, built.answer);
  // A live run's public items carry progress (served/total) and the manip payload, never a key.
  const auth = await import('../../server/auth.js');
  const u = auth.createUser({ username: `par${Date.now() % 1e6}`, password: 'correct-horse-12', displayName: 'Kid' });
  const out = P.startRun(u, { grade: 'K', kind: 'placement' });
  assert.ok(out.current.progress.total > 0);
  assert.ok(out.current.progress.served >= 1);
  assert.ok(!('answer' in out.current.item) && !('answerIndex' in out.current.item));
});

test('Laps 2 and 3 are no longer advertised as playable anywhere the course speaks', () => {
  const defs = fs.readFileSync(path.join(ROOT, 'server/services/number-quest-progress.js'), 'utf8');
  assert.match(defs, /Being built: the same steps with bigger numbers/);
  assert.match(defs, /Being built: a mixed circuit/);
  const en = JSON.parse(read('server/i18n/locales/en.json'));
  assert.match(en.teachers.nq.promise.li5, /still being built/);
  assert.doesNotMatch(en.teachers.nq.promise.li5, /can be walked again/);
  assert.match(en.teachers.nq.faq.a4, /still being built/);
});

// -------------------------------------------------------------------------------------------------
// Parity repair round 2 (the re-evaluation at 7.3/10): drawn diagrams + guided focus in every deck
// (covered in the decks suites), on-skill one-tap missions for 1.1/2.3/1.3, a shorter Sorting Game
// with a per-strand picture for the child, and a path whose lap ring and started state tell the truth.

test('lesson identity survives the frame: units.json mode params pass the play-params allow-list intact', () => {
  for (const [n, mode] of [['1.1', 'nq-1-1'], ['2.3', 'nq-2-3'], ['1.3', 'nq-1-3']]) {
    const s = byN(n);
    assert.ok(s.game.params.includes(`mode=${mode}`), `${n} carries its lesson mode`);
    const parsed = PP.parseParams(Object.fromEntries(new URLSearchParams(s.game.params)));
    assert.equal(parsed.mode, mode, `${n}: mode survives parseParams`);
    assert.equal(PP.unpackParams(PP.packParams(parsed)).mode, mode, `${n}: mode survives the signed token`);
    const href = C.playHref(course, C.getStep(course, `explorer-${n}`));
    assert.ok(href.includes(`mode=${mode}`), `${n}: the Play link carries the mode`);
  }
});

test('lesson identity survives the frame for Launchpad too: Garden Count’s, Lily Hop’s, Crate Stacker’s and Balance Bridge’s chapter and lock pass the allow-list intact', () => {
  const lp = C.steps(course, 'launchpad').filter(s => s.game);
  assert.deepEqual(lp.map(s => s.n), ['1.1', '1.2', '1.3', '2.1', '2.2', '2.3', '3.1', '3.2', '3.3', '4.1', '4.2', '4.3']);
  for (const s of lp) {
    const slug = { 1: 'garden-count', 2: 'lily-hop', 3: 'crate-stacker', 4: 'balance-bridge' }[s.unit];
    assert.equal(s.game.slug, slug, s.n);
    const want = { chapter: { '1.1': 'count', '1.2': 'compare', '1.3': 'teens', '2.1': 'join', '2.2': 'apart', '2.3': 'twenty', '3.1': 'build', '3.2': 'greater', '3.3': 'add', '4.1': 'equal', '4.2': 'story', '4.3': 'groups' }[s.n], lock: 1 };
    assert.deepEqual(PP.parseParams(Object.fromEntries(new URLSearchParams(s.game.params))), want, `${s.n}: params parse`);
    assert.deepEqual(PP.unpackParams(PP.packParams(want)), want, `${s.n}: chapter and lock survive the signed token`);
    assert.equal(C.playHref(course, C.getStep(course, `launchpad-${s.n}`)), `/play/${slug}?course=number-quest&cstep=launchpad-${s.n}&chapter=${want.chapter}&lock=1`, `${s.n}: the Play link carries the step and the chapter`);
    const deck = JSON.parse(read(`seed-lessons/number-quest/course/launchpad/${s.n}.json`));
    assert.deepEqual({ slug: deck.game.slug, chapter: deck.game.chapter, params: deck.game.params }, { slug: s.game.slug, chapter: s.game.chapter, params: s.game.params }, `${s.n}: deck agrees with units.json`);
  }
});

test('Brain Board lesson boards: a Number Quest step opens its own skill board, no picker first', () => {
  const bb = read('seed-games/brain-board.html');
  assert.match(bb, /BRB\.params\.mode/, 'the lesson is read from BRB.params.mode (the allow-listed key that reaches the frame)');
  assert.match(bb, /NQ_STEP === 'explorer-1\.1'/);
  assert.match(bb, /NQ_STEP === 'explorer-2\.3'/);
  assert.match(bb, /practice = nqRestore\(\) \|\| boardFrom\(nq\)/, 'the lesson board restores its saved progress first, else goes through the game\u2019s own board builder');
  const startBlock = bb.slice(bb.indexOf("L.on('start'"));
  assert.ok(startBlock.indexOf('boardFrom(nq)') > -1 && startBlock.indexOf('boardFrom(nq)') < startBlock.indexOf('SoloBank.choose'), 'the lesson board is tried before the picker is ever shown');
  // Run the real generator in a stub kit world and check its arithmetic the way a child meets it.
  const block = bb.slice(bb.indexOf('var NQ_STEP'), bb.indexOf('L.ready('));
  const run = step => {
    const mode = `nq-${step.replace('explorer-', '').replace('.', '-')}`; // the step as the frame actually receives it
    const ctx = vm.createContext({ BRB: { params: { mode, lock: 1 } }, window: { BRB: { params: { mode, lock: 1 } } },
      O: { rand: seed => { let s = seed >>> 0 || 1; const next = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x80000000; return { int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)) }; } },
      Date, Math, String, Number, Object, Array });
    vm.runInContext(`${block}\n;globalThis.__nq = { items: nqBoardItems(), step: NQ_STEP };`, ctx);
    return ctx.__nq.items;
  };
  for (const step of ['explorer-1.1', 'explorer-2.3']) {
    const items = run(step);
    assert.equal(items.length, 25, `${step}: five columns of five`);
    const cats = {};
    for (const it of items) {
      cats[it.cat] = (cats[it.cat] || 0) + 1;
      assert.equal(new Set(it.choices).size, it.choices.length, `${step}: choices are unique (${it.q})`);
      assert.ok(it.choices[it.answer] != null, `${step}: the key exists`);
    }
    assert.deepEqual(Object.values(cats), [5, 5, 5, 5, 5], `${step}: every column is full`);
  }
  const byCat = (items, cat) => items.filter(i => i.cat === cat);
  const i11 = run('explorer-1.1');
  for (const it of byCat(i11, 'Build it')) {
    const m = /Build it: (\d) thousands?, (\d) hundreds?, (\d) tens? and (\d) ones?\./.exec(it.q);
    assert.equal(Number(it.choices[it.answer].replace(/,/g, '')), +m[1] * 1000 + +m[2] * 100 + +m[3] * 10 + +m[4], it.q);
  }
  for (const it of byCat(i11, 'Digit value')) {
    const m = /In ([\d,]+), what is the value of the (\d)\?/.exec(it.q);
    const digits = m[1].replace(/,/g, ''), pos = digits.indexOf(m[2]);
    assert.equal(Number(it.choices[it.answer].replace(/,/g, '')), Number(m[2]) * 10 ** (digits.length - pos - 1), it.q);
  }
  const i23 = run('explorer-2.3');
  for (const it of byCat(i23, 'Draw the story')) {
    const m = /had (\d+) .* and .* (\d+)\./.exec(it.q);
    assert.equal(Number(it.choices[it.answer]), Number(m[1]) - Number(m[2]), it.q);
  }
  for (const it of byCat(i23, 'Gap stories')) {
    const m = /needs (\d+) points and has (\d+)/.exec(it.q);
    assert.equal(Number(it.choices[it.answer]), Number(m[1]) - Number(m[2]), it.q);
  }
  // No ambiguous questions, over several generated boards: a digit asked about must appear once,
  // and exactly one "Where it sits" choice may hold the named value.
  for (let t = 0; t < 6; t++) {
    const items = run('explorer-1.1');
    for (const it of byCat(items, 'Digit value')) {
      const m = /In ([\d,]+), what is the value of the (\d)\?/.exec(it.q);
      assert.equal(m[1].replace(/,/g, '').split('').filter(d => d === m[2]).length, 1, `${it.q}: the digit appears once`);
    }
    for (const it of byCat(items, 'Where it sits')) {
      const m = /Which number has a (\d) worth ([\d,]+)\?/.exec(it.q);
      const d = m[1], worth = Number(m[2].replace(/,/g, ''));
      const hits = it.choices.filter(ch => {
        const ds = ch.replace(/,/g, '');
        return [...ds].some((c, k) => c === d && Number(c) * 10 ** (ds.length - 1 - k) === worth);
      });
      assert.equal(hits.length, 1, `${it.q}: exactly one choice holds the value`);
      assert.equal(it.choices[it.answer], hits[0], `${it.q}: the key is that choice`);
    }
  }
  // And the mission copy says so, in the decks the child actually reads.
  for (const n of ['1.1', '2.3']) {
    const deck = JSON.parse(read(`seed-lessons/number-quest/course/explorer/${n}.json`));
    assert.match(deck.slides.at(-1).text, /opens straight on your/, `${n}: the mission promises the one-tap start`);
  }
});

test('Quest Race lesson race: step 1.3 opens straight on pattern questions', () => {
  const qr = read('seed-games/quest-race.html');
  assert.match(qr, /NQ_STEP === 'explorer-1\.3'/);
  assert.match(qr, /practiceGo\(nqPatternItems\(practice\.rnd\)\)/, 'the pattern race starts without the picker');
  const block = qr.slice(qr.indexOf('var NQ_STEP'), qr.indexOf('// Playing alone: choose the questions first'));
  const ctx = vm.createContext({ BRB: { params: { mode: 'nq-1-3', lock: 1 } }, window: { BRB: { params: { mode: 'nq-1-3', lock: 1 } } }, Math });
  vm.runInContext(`${block}\n;let __s = 42; const __rnd = { int: (lo, hi) => lo + Math.floor((((__s = (__s * 1103515245 + 12345) & 0x7fffffff) / 0x80000000)) * (hi - lo + 1)), shuffle: a => a };\n;globalThis.__p = nqPatternItems(__rnd);`, ctx);
  const items = ctx.__p;
  assert.equal(items.length, 8, 'eight pattern questions, the practice race\u2019s own length');
  for (const it of items) {
    assert.equal(new Set(it.choices).size, 4, it.q);
    assert.ok(it.answer >= 0 && it.answer <= 3, it.q);
    assert.match(it.q, /Pattern|rule|Trays|Jumble/i, 'every question is about a pattern');
  }
  const seq = items[0], m = /Pattern: ([\d, ]+), \.\.\./.exec(seq.q);
  const terms = m[1].split(',').map(x => Number(x)), diff = terms[1] - terms[0];
  assert.equal(Number(seq.choices[seq.answer]), terms[3] + diff, 'the next term follows the rule');
  const deck = JSON.parse(read('seed-lessons/number-quest/course/explorer/1.3.json'));
  assert.match(deck.slides.at(-1).text, /opens straight on pattern questions/);
});

test('the Sorting Game is shorter now, and its result carries the child\u2019s per-strand picture', () => {
  assert.equal(P.BUDGET.standard, 5, 'five per strand at most');
  const state = P.createRunState({ grade: 4, seed: 'round2' });
  assert.equal(Object.keys(state.strands).length * P.BUDGET.standard, 20, 'a full standard run is at most 20 items');
  for (const k of Object.keys(state.strands)) { P.recordAnswer(state, k, true); P.recordAnswer(state, k, false); }
  const fin = P.finishRun(state);
  assert.equal(fin.picture.length, 4, 'one card per strand');
  for (const card of fin.picture) {
    assert.deepEqual(Object.keys(card).sort(), ['icon', 'key', 'label', 'line', 'tried'], 'the picture holds no rung, score or judgement');
    assert.equal(card.tried, 2, 'a paw for every puzzle tried in the strand');
  }
  const view = read('server/views/number-quest-placement.js');
  assert.match(view, /Starting Point note/, 'the result signposts the grown-up note');
  assert.match(view, /family or school page/, 'and says where a grown-up opens it');
});

test('the path tells the truth: a full lap ring for Lap 1, and started is not merely unlocked', async () => {
  const { pathPage } = await import('../../server/views/number-quest-path.js');
  const NQP = await import('../../server/services/number-quest-progress.js');
  const auth = await import('../../server/auth.js');
  const kid = auth.createUser({ username: `par2${Date.now() % 1e6}`, password: 'correct-horse-12', displayName: 'Kid' });
  C.setBand(kid, course, 'explorer');
  const finish = key => {
    const step = C.getStep(course, key);
    C.markRead(kid, course, step); C.recordCheck(kid, course, step, { score: 3, passed: true });
    if (step.game) { C.markPlayed(kid, course, step); C.markCompleted(kid, course, step); }
  };
  ['explorer-0.1', 'explorer-1.1', 'explorer-1.2', 'explorer-1.3'].forEach(finish);
  NQP.completeLap(kid, course, 'explorer', 1, 1);
  C.markRead(kid, course, C.getStep(course, 'explorer-2.1')); // begun, not finished
  const ov = C.overview(kid, course, 'explorer');
  const html = String(pathPage({ course, ov, units: C.numberQuestCatalogue().units,
    marks: NQP.totalMarks(kid, course), daily: NQP.dailyStatus(kid, course),
    laps: Object.fromEntries(NQP.lapsForTier(kid, course, 'explorer').map(l => [l.unit, l])),
    placement: null, testedOut: [], canPick: true, bandSet: true, hasProgress: true }));
  assert.match(html, /--ring:100%/, 'Lap 1 done fills the ring: it is every lap there is to play');
  assert.match(html, /nqp-medal is-complete/, 'the finished workshop celebrates');
  assert.match(html, /class="nqp-started"/, 'the begun step carries the started marker');
  assert.match(html, />Started</, 'and says so in words, unlike a merely unlocked step');
  assert.match(html, /nqp-here-tally/, 'Tally stands at the learner\u2019s current step');
});

// ---------------------------------------------------------------------------------------------------
// Parity repair round 3 (evaluation attempt 3, 6.8/10): the Rounding Run froze on its countdown
// because its scene lookup had no track 9; placement could dead-end the strongest students at an
// unbuilt Unit 5 door behind locked Units 1-4; Brain Board's miss feedback named no answer.

test('repair 3: every Sum Racer track maps to a scene that exists (the Rounding Run freeze)', () => {
  const html = read('seed-games/sum-racer.html');
  // sceneOf is a self-contained arrow over the SCENES table: evaluate it on its own and check its
  // answers against the scene keys the file actually defines and the tracks CONFIG actually has.
  const line = html.split('\n').find(l => l.includes('const sceneOf'));
  assert.ok(line, 'sceneOf exists');
  const sceneOf = new Function(`${line.replace('const sceneOf', 'const sceneOf')}; return sceneOf;`)();
  const scenesBlock = html.slice(html.indexOf('const SCENES = {'), html.indexOf('const sceneOf'));
  const sceneKeys = new Set([...scenesBlock.matchAll(/^  (\d+): \{/gm)].map(m => Number(m[1])));
  assert.deepEqual([...sceneKeys].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7]);
  const pure = html.slice(html.indexOf('const CONFIG'), html.indexOf('/* @@PURE-END */'));
  const ctx = vm.createContext({});
  vm.runInContext(`${pure}\n;globalThis.__sr = { CONFIG };`, ctx);
  for (const t of ctx.__sr.CONFIG.tracks) {
    assert.ok(sceneKeys.has(sceneOf(t.id)), `track ${t.id} maps to a defined scene (got ${sceneOf(t.id)})`);
  }
  assert.equal(sceneOf(9), 1, 'the Rounding Run races the meadow scene, Number Lane');
  assert.equal(sceneOf(8), 2, 'the beach track keeps the beach scene');
  // The test hook can start every track too (its clamp used to stop at 8, hiding track 9 from tests).
  assert.match(html, /Math\.min\(CONFIG\.tracks\.length, opts\.track/);
});

test('repair 3: placement keeps the earlier workshops open, and the way forward starts at the placed start', async () => {
  const auth = await import('../../server/auth.js');
  const kid = auth.createUser({ username: `par3${Date.now() % 1e6}`, password: 'correct-horse-12', displayName: 'Kid' });
  C.setBand(kid, course, 'explorer');
  // No placement yet: purely sequential, only the first step is open.
  let list = C.states(kid, course, 'explorer');
  assert.equal(list[0].open, true);
  assert.equal(list[1].open, false);
  // Placed at Unit 4's door: everything up to and including the start is open, the next step is not.
  P.overrideStartNode(kid, 'explorer-4.1');
  list = C.states(kid, course, 'explorer');
  const idx = list.findIndex(s => s.step.key === 'explorer-4.1');
  assert.ok(idx > 4, 'the start sits well down the street');
  for (let i = 0; i <= idx; i++) assert.equal(list[i].open, true, `${list[i].step.key} is open`);
  assert.equal(list[idx + 1].open, false, 'the step after the start still waits for the start');
  // Finishing the start (and only the start) opens the next step: the way forward runs from there.
  const start = C.getStep(course, 'explorer-4.1');
  C.markRead(kid, course, start); C.recordCheck(kid, course, start, { score: 3, passed: true });
  if (start.game) { C.markPlayed(kid, course, start); C.markCompleted(kid, course, start); }
  list = C.states(kid, course, 'explorer');
  assert.equal(list[idx + 1].open, true, 'completing the placed start opens what follows it');
});

test('repair 3: Brain Board miss feedback names the correct answer, Quest Race style, in every locale', () => {
  const bb = read('seed-games/brain-board.html');
  assert.equal((bb.match(/rightWas:/g) || []).length, 12, 'rightWas lives in all twelve locale tables');
  assert.match(bb, /rightWas: 'Answer: \{answer\}'/, 'the English line mirrors Quest Race');
  assert.match(bb, /lastAnswer = Q\.choices\[rv\.answer\]/, 'the reveal captures the correct choice text');
  assert.match(bb, /missLine\(t\('wrong'\)\)/, 'a wrong pick speaks the answer');
  assert.match(bb, /missLine\(t\('timeUp'\)\)/, 'a time-up speaks the answer too');
  const qr = read('seed-games/quest-race.html');
  assert.match(qr, /rightWas: 'Answer: \{answer\}'/, 'Quest Race is the model being matched');
});
