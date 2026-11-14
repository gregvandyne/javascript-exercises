// Tally's Sorting Game, rungs 6.0-8.0 (grades 6-8), rebuilt with the Pro lock of 2026-11-14.
// Before it, the 72 templates at these rungs were "deferred" with no cluster code yet already served; 15 were
// filed under grade and domain pairs CCSS-M does not have (6.NF, 7.MD, 8.RP...), most repeated earlier grades'
// work with bigger numbers, and nothing asked about slope, the Pythagorean theorem, transformations, surface
// area, dividing by a fraction, box plots or scatter plots. Pinned here:
//   - nothing below rung 6 changed: the 180 templates there and every item they deal are byte for byte what
//     main dealt (a hash), and so is every placement outcome for a learner who answers below rung 6;
//   - at rungs 6.0-8.0 every template is locked to a real grade 6-8 cluster that its rung's lock names, every
//     strand has at least four templates a rung, and the content the old bank lacked is there;
//   - every item these templates deal is SOLVED INDEPENDENTLY from its prompt (tests/support/nq-pro-solvers.js):
//     exactly one choice is correct, it is the key, and every wrong choice carries a misconception tag;
//   - a negative number is printed with the true minus sign, nothing is priced, and the spoken prompt says the
//     signs in words; an answer is typed only when it is a whole number from 0 to 99;
//   - the retired templates are never dealt again, and an item dealt from one before the change still grades.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const G = await import('../../seed-lessons/number-quest/placement/generator.js');
const { PRO_ARCHETYPE_NAMES } = await import('../../seed-lessons/number-quest/placement/generator-pro.js');
const P = await import('../../server/services/number-quest-placement.js');
const { sub6BankHash, sub6RunsHash } = await import('../support/nq-sub6-pin.js');
const { SOLVERS, numOf, evalExpr } = await import('../support/nq-pro-solvers.js');
const { TEMPLATES, RETIRED, BY_ID, ARCHETYPES, generateItem } = G;

const read = f => JSON.parse(fs.readFileSync(new URL(`../../seed-lessons/number-quest/${f}`, import.meta.url), 'utf8'));
const PLACE = read('placement.json'), REG = read('standards.json');
const PRO = TEMPLATES.filter(t => t.rung >= 6);
const STRANDS = ['number', 'algebra', 'shape-measure', 'data-chance'], RUNGS = [6, 6.5, 7, 7.5, 8];
const SEEDS = 150;
const dealt = t => Array.from({ length: SEEDS }, (_, i) => ({ seed: i + 1, item: generateItem(t, i + 1) }));

// The values main (9edb96e7, and 1d0f1763 after it) produced, from the same code in tests/support/nq-sub6-pin.js.
const PIN = Object.freeze({
  bank: { templates: 180, hash: '8f13ef598f37f09ebcb6d2494433b2933a6d2c03ffe32853042c53f726cc3ce7' },
  runs: { runs: 324, outcomes: '7e9f2df9a03027ce3f80d89277e0f55e6db2ea25d4500808219dd055c59ab122', belowRuns: 245, below: 'dc14a02e20d3710f897a5c8434395685ce09b68466e7b984cd1f777b113b405d' },
});

test('below rung 6 the bank is unchanged: the same 180 templates deal the same items, seed for seed', () => {
  assert.deepEqual(sub6BankHash(G), PIN.bank);
});

test('below rung 6 placement is unchanged: 324 simulated runs end where they ended, and a run that stays under rung 6 is the same game', () => {
  assert.deepEqual(sub6RunsHash(P, G), PIN.runs);
});

test('rungs 6.0-8.0: every template is locked to a real grade 6-8 cluster that its rung names; no wrong or deferred label is left', () => {
  assert.equal(PRO.length, 86);
  for (const t of PRO) {
    assert.equal(t.lockStatus, 'locked', t.id);
    assert.match(t.ccssClusterCode, /^[678]\.(RP|NS|EE|G|SP|F)\.[A-C]$/, `${t.id}: a grade 6-8 cluster code`);
    const [grade, domain] = t.ccssClusterCode.split('.');
    assert.equal(t.grade, grade, `${t.id}: grade`); assert.equal(t.ccssDomain, domain, `${t.id}: domain`); assert.equal(t.ccss, `${grade}.${domain}`, `${t.id}: grade.domain`);
    assert.equal(t.ccssCluster, REG.clusters[grade][t.ccssClusterCode], `${t.id}: the cluster heading is the registry's`);
    assert.ok(Math.abs(+grade - t.rung) <= 0.5 || (t.rung === 6 && grade === '6') || +grade === Math.floor(t.rung), `${t.id}: a grade ${grade} cluster at rung ${t.rungLabel}`);
    assert.ok(PLACE.strands[t.strandLabel].lockedRungs[t.rungLabel].clusters.includes(t.ccssClusterCode), `${t.id}: ${t.ccssClusterCode} is in the ${t.strandLabel} ${t.rungLabel} lock`);
    assert.equal(t.deferredHeading, undefined, t.id);
    assert.equal(t.audioFirst, false); assert.equal(t.launchpadSafe, false); assert.equal(t.readingLoad, 'standard');
    assert.ok(['pick', 'numeric'].includes(t.responseType), `${t.id}: buttons or a short number`);
    assert.ok(typeof t.misconception === 'string' && t.misconception.length >= 8, `${t.id}: names its main misconception`);
  }
  // No template anywhere names a grade and domain CCSS-M does not have, or is still "deferred".
  const REAL = { K: ['CC', 'OA', 'NBT', 'MD', 'G'], 1: ['OA', 'NBT', 'MD', 'G'], 2: ['OA', 'NBT', 'MD', 'G'], 3: ['OA', 'NBT', 'NF', 'MD', 'G'], 4: ['OA', 'NBT', 'NF', 'MD', 'G'], 5: ['OA', 'NBT', 'NF', 'MD', 'G'],
    6: ['RP', 'NS', 'EE', 'G', 'SP'], 7: ['RP', 'NS', 'EE', 'G', 'SP'], 8: ['NS', 'EE', 'F', 'G', 'SP'] };
  for (const t of TEMPLATES) {
    assert.notEqual(t.lockStatus, 'deferred-pro-phase', t.id);
    assert.ok(t.ccssClusterCode, `${t.id}: tagged with a cluster code`);
    const [g, d] = t.ccssClusterCode.split('.');
    assert.ok(REAL[g].includes(d), `${t.id}: ${g}.${d} exists in CCSS-M`);
    assert.ok(REG.clusters[g][t.ccssClusterCode], `${t.id}: ${t.ccssClusterCode} is in the registry`);
  }
  assert.doesNotMatch(JSON.stringify(TEMPLATES), /DEFERRED|deferred/);
  // Every cell: at least four templates, at least three different archetypes.
  for (const s of STRANDS) for (const r of RUNGS) {
    const cell = PRO.filter(t => t.strand === s && t.rung === r);
    assert.ok(cell.length >= 4, `${s} @ ${r}: ${cell.length} templates`);
    assert.ok(new Set(cell.map(t => t.archetype)).size >= 3, `${s} @ ${r}: varied`);
  }
});

test('rungs 6.0-8.0 ask grade 6-8 questions: the content the old bank lacked is there, and only sound older archetypes stay', () => {
  const used = new Set(PRO.map(t => t.archetype));
  for (const a of ['slopeTwoPoints', 'twoStepNeg', 'pythagHyp', 'pythagLeg', 'reflectPoint', 'translatePoint', 'dilatePoint', 'surfaceAreaBox', 'fracDivide', 'farthestFromZero', 'constantK', 'percentChange', 'iqrBox', 'scatterAssociation', 'scatterOutlier']) {
    assert.ok(used.has(a), `the bank asks ${a}`);
  }
  for (const a of PRO_ARCHETYPE_NAMES) assert.ok(used.has(a), `${a} is used by a template`);
  // Archetypes shared with the rungs below 6: only these, each real grade 6-8 work at the rung it sits on.
  const below = new Set(TEMPLATES.filter(t => t.rung < 6).map(t => t.archetype));
  const KEPT = { ratioScale: '6.RP.A', percentOf: '6.RP.A', exprEval: '6.EE.A', equation: ['6.EE.B', '7.EE.B'], propSolve: '7.RP.A', angle: '7.G.B', medianCalc: ['6.SP.A', '6.SP.B'] };
  for (const t of PRO.filter(x => !PRO_ARCHETYPE_NAMES.includes(x.archetype))) {
    assert.ok(KEPT[t.archetype], `${t.id}: ${t.archetype} is one of the kept archetypes`);
    assert.ok([].concat(KEPT[t.archetype]).includes(t.ccssClusterCode), `${t.id}: ${t.archetype} sits under ${t.ccssClusterCode}`);
  }
  for (const a of PRO_ARCHETYPE_NAMES) assert.ok(!below.has(a), `${a} is not used below rung 6`);
  assert.ok(PRO.filter(t => PRO_ARCHETYPE_NAMES.includes(t.archetype)).length >= 75, 'most of the rung 6-8 bank is new work');
});

test('every item at rungs 6.0-8.0, solved independently from its prompt: exactly one choice is right and it is the key', () => {
  let items = 0, buttons = 0, typed = 0;
  for (const t of PRO) {
    const solve = SOLVERS[t.archetype];
    assert.equal(typeof solve, 'function', `${t.id}: a solver exists for ${t.archetype}`);
    const prompts = new Set();
    for (const { seed, item } of dealt(t)) {
      const at = `${t.id} seed ${seed} ("${item.prompt}")`;
      items++; prompts.add(`${item.prompt} => ${item.answer}`); // what the game's own no-repeat rule compares
      const isRight = solve(item.prompt);
      assert.equal(isRight(item.answer), true, `${at}: the key ${item.answer} is what the prompt works out to`);
      if (item.choices) {
        buttons++;
        assert.equal(item.choices.length, 4, `${at}: four buttons`);
        const right = item.choices.filter(c => isRight(c.value));
        assert.equal(right.length, 1, `${at}: exactly one correct choice among ${item.choices.map(c => c.value).join(' | ')}`);
        assert.equal(item.choices[item.answerIndex].value, item.answer, `${at}: answerIndex points at the key`);
        assert.equal(right[0].value, item.answer, `${at}: the correct choice is the key`);
        assert.equal(new Set(item.choices.map(c => String(c.value))).size, 4, `${at}: four different buttons`);
        for (const c of item.choices) {
          if (c.value === item.answer) { assert.equal(c.misconception, null, `${at}: the key carries no tag`); continue; }
          assert.match(c.misconception, /^[a-z]+(-[a-z0-9]+){1,9}$/, `${at}: ${c.value} names the mistake behind it`);
          assert.notEqual(c.misconception, 'near-miss', `${at}: no filler distractor`);
        }
      } else {
        typed++;
        assert.ok(Number.isInteger(item.answer) && item.answer >= 0 && item.answer < 100, `${at}: only a whole number from 0 to 99 is typed`);
        assert.equal(item.distractorMisconceptions.length, 3, `${at}: three named mistakes`);
        assert.notEqual(t.responseType, 'pick');
      }
    }
    assert.ok(prompts.size >= 5, `${t.id}: at least five different items in ${SEEDS} deals (${prompts.size})`);
  }
  assert.equal(items, PRO.length * SEEDS);
  assert.ok(buttons > 4000 && typed > 2000, `both answer forms are exercised (${buttons} with buttons, ${typed} typed)`);
});

test('the solvers are honest: they reject wrong answers and tell equal forms apart from different ones', () => {
  assert.equal(numOf('−7'), -7); assert.equal(numOf('3/4'), 0.75); assert.equal(numOf('−1/2'), -0.5); assert.equal(numOf('9 1/2'), 9.5); assert.equal(numOf('−8°C'), -8); assert.ok(Number.isNaN(numOf('Team A')));
  assert.equal(evalExpr('3(x + 4)', { x: 2 }), 18); assert.equal(evalExpr('y = −x + 7', { x: 2 }), 5); assert.equal(evalExpr('5 − 3n', { n: 2 }), -1); assert.equal(evalExpr('2x²', { x: 3 }), 18);
  const d = SOLVERS.distribute('Which expression is equal to 3(x + 4)?');
  assert.equal(d('3x + 12'), true); assert.equal(d('12 + 3x'), true, 'an equal expression written another way counts as right'); assert.equal(d('3x + 4'), false); assert.equal(d('3x + 7'), false);
  const s = SOLVERS.slopeTwoPoints('A line passes through (1, 2) and (4, 8). What is its slope?');
  assert.equal(s(2), true); assert.equal(s('4/2'), true); assert.equal(s('1/2'), false); assert.equal(s('−2'), false);
  assert.equal(SOLVERS.pythagHyp('A right triangle has legs of 6 cm and 8 cm. How long is its longest side, in cm?')(10), true);
  assert.equal(SOLVERS.pythagHyp('A right triangle has legs of 6 cm and 8 cm. How long is its longest side, in cm?')(14), false);
  assert.equal(SOLVERS.signedSub('What is 4 − (−7)?')(11), true); assert.equal(SOLVERS.signedSub('What is 4 − (−7)?')('−3'), false);
  assert.equal(SOLVERS.scatterOutlier('A scatter plot has the points (1, 3), (2, 5), (3, 7), (4, 20) and (5, 11). Which point is an outlier?')('(4, 20)'), true);
  assert.throws(() => SOLVERS.sqrtPerfect('What is √80?'), /not a perfect square/);
  assert.throws(() => SOLVERS.fracDivide('nonsense'), /could not read/);
});

test('rungs 6.0-8.0 read properly: a true minus sign, no prices, and a spoken prompt in words', () => {
  const SOLD = /\$|\bcosts?\b|\bprices?\b|\bbuy|\bbought\b|\bsell|\bsold\b|\bpay|\bpaid\b|\btax|\bdiscount|\binterest\b|\bcommission|\btips?\b|\bmarkup|\bcents?\b|\bdollars?\b/i;
  const RAW = /[−√²³⁰¹⁴-⁹°×÷<>=%]|\d\/\d|_{2,}/; // what a voice drops or garbles
  let negatives = 0;
  for (const t of PRO) for (const { seed, item } of dealt(t).slice(0, 60)) {
    const at = `${t.id} seed ${seed}`;
    const shown = [item.prompt, ...(item.choices || []).map(c => String(c.value))];
    for (const s of shown) {
      if (PRO_ARCHETYPE_NAMES.includes(t.archetype)) assert.doesNotMatch(s, /(^|[\s(=×÷+,:])-\d/, `${at}: a hyphen stands for a minus sign in "${s}"`);
      assert.doesNotMatch(s, /undefined|NaN|Infinity|\{|\}|\.\d{4,}/, `${at}: "${s}" is clean`);
      if (/−\d/.test(s)) negatives++;
    }
    assert.doesNotMatch(shown.join(' '), SOLD, `${at}: nothing is bought, sold or priced: ${shown.join(' | ')}`);
    assert.doesNotMatch(item.prompt, /(\d+) rows of (\d+)/, `${at}: no promised arrangement without counters`);
    assert.ok(item.prompt.length <= 300, `${at}: a prompt of at most 300 characters (${item.prompt.length})`);
    assert.equal(typeof item.spokenPrompt, 'string');
    assert.doesNotMatch(item.spokenPrompt, RAW, `${at}: the spoken prompt says every sign in words: "${item.spokenPrompt}"`);
  }
  assert.ok(negatives > 300, 'negative numbers are really in the bank');
  // A few, word for word.
  const say = (archetype, re) => { const t = PRO.find(x => x.archetype === archetype); for (let s = 1; s < 80; s++) { const it = generateItem(t, s); if (re.test(it.prompt)) return it; } throw new Error(`no ${archetype} prompt like ${re}`); };
  assert.match(say('signedSub', /^What is −\d+ − \(−\d+\)\?$/).spokenPrompt, /^What is negative \d+ minus \(negative \d+\)\?$/);
  assert.match(say('sqrtPerfect', /√/).spokenPrompt, /^What is the square root of \d+\?$/);
  assert.match(say('fracDivide', /3\/4 of a liter/).spokenPrompt, /^Each jar holds 3 fourths of a liter\./);
  assert.match(say('expLaw', /×/).spokenPrompt, /^Which is equal to \d+ (squared|cubed|to the power \d+) times \d+ (squared|cubed|to the power \d+)\?$/);
  assert.match(say('inequalityTruth', />/).spokenPrompt, /^Which value of x makes x plus \d+ greater than \d+ true\?$/);
  // Below rung 6 the spoken prompt is built exactly as before (the bank hash above holds the proof): blanks only.
  const low = TEMPLATES.find(t => t.archetype === 'missingAdd');
  assert.match(generateItem(low, 1).spokenPrompt, /\+ blank = \d+/);
});

test('retired templates: never dealt again, still graded and read aloud for an item already on a screen', () => {
  assert.equal(RETIRED.length, 63);
  assert.equal(BY_ID.size, TEMPLATES.length + RETIRED.length); assert.equal(TEMPLATES.length, 266);
  const live = new Set(TEMPLATES.map(t => t.id));
  for (const r of RETIRED) {
    assert.ok(r.rung >= 6, `${r.id}: only rung 6.0-8.0 templates were retired`);
    assert.ok(!live.has(r.id), `${r.id}: not in the served bank`);
    assert.deepEqual(Object.keys(r), ['id', 'strand', 'rung', 'rungLabel', 'responseType', 'archetype', 'context', 'gen'], `${r.id}: carries no standards label at all`);
    assert.ok(ARCHETYPES[r.archetype] && !PRO_ARCHETYPE_NAMES.includes(r.archetype), `${r.id}: its old archetype still exists`);
    const item = generateItem(r, 'in-flight');
    // An item dealt before the change grades by its own key.
    const answer = item.responseType === 'pick' ? { choice: item.answerIndex } : { value: String(item.answer) };
    assert.equal(P.gradeServed(r.id, 'in-flight', answer).correct, true, `${r.id}: its key still grades right`);
    assert.equal(P.gradeServed(r.id, 'in-flight', item.responseType === 'pick' ? { choice: (item.answerIndex + 1) % item.choices.length } : { value: '999999' }).correct, false);
  }
  assert.equal(P.gradeServed('nq-place-nowhere-9_9-9', 'x', { choice: 0 }), null, 'an id that never existed is still nothing');
  // No retired id is reused by a new template, and no run is ever dealt one: every strand, every rung, many seeds.
  const dealtIds = new Set();
  for (const grade of [5, 6, 7, 8]) for (let s = 0; s < 40; s++) {
    const state = P.createRunState({ grade, seed: `retired-${grade}-${s}` });
    for (let g = 0; g < 40 && !P.runFinished(state); g++) { const it = P.serveNext(state); if (!it) break; dealtIds.add(it.templateId); P.recordAnswer(state, it.strand, (s + g) % 3 !== 0); }
  }
  for (const id of dealtIds) assert.ok(live.has(id), `${id} is a served template`);
  assert.ok([...dealtIds].filter(id => BY_ID.get(id).rung >= 6).length >= 60, 'the runs really reached the rung 6-8 bank');
  for (const u of [1, 2, 3, 4, 5, 6, 7]) for (const it of P.testOutItems(u, 'retired')) assert.ok(live.has(it.templateId));
});
