// The skill check of a Builder classroom activity's column sums (server/builder/skill.js; docs/decisions.md "Builder
// class games: audit 4 quality"): the owner's audit found a "regrouping" game with 40 + 37, 42 + 15 and 21 + 64 (no
// regrouping), and "make the numbers bigger" turning two-digit sums into three-digit ones up to 1910. The teacher's
// words (the setup's topic, their messages) and the activity's own "skill" block say what to practise; the check reads
// every problem the activity deals (fixed ones, three sets from its generator) with the kit the page pins, and the
// playtest report and the save both tell the model what to fix. The setup's typed topic tunes the ready generator.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { statedSkill, skillProblems, skillText, regroupOf } = await import('../../server/builder/skill.js');
const autotest = await import('../../server/builder/autotest.js');
const { topicFor, canvasActivity, normalisePlan } = await import('../../server/builder/plan.js');
const { canvasTag, withActivityData, selfTestHtml } = await import('../../server/services/canvaskit.js');
const AD = await import('../../server/builder/activity-data.js');

const starter = fs.readFileSync(path.join(ROOT, 'server/builder/templates/canvas.html'), 'utf8').replace('<!--CANVAS-->', canvasTag());
const page = (data, v) => { const h = withActivityData(starter, { config: { lang: 'en', support: 'guided', supports: ['guided'], count: 6, fresh: true }, task: { title: 'Farm Sums', say: 'Add the eggs.' }, problems: [], gen: null, steps: {}, hints: {}, ...data }); return v ? h.replace(canvasTag(), canvasTag(v)) : h; };
// the audit's "Farm Sums: Carry the Ten" set: three of six need no regrouping
const AUDIT = [[46, 38], [40, 37], [57, 26], [42, 15], [29, 35], [21, 64]].map(([a, b]) => ({ tool: 'digits.add', a, b }));

test('the teacher\'s words: regrouping (some, all, none), the digits, "bigger numbers"; the newest mention wins', () => {
  assert.equal(statedSkill(['regrouping addition, grade 4']).regroup, 'some');
  assert.equal(statedSkill(['2-digit addition with carrying']).regroup, 'some');
  assert.equal(statedSkill(['2-digit addition with carrying']).digits, 2);
  assert.equal(statedSkill(['adding with regrouping in both columns']).regroup, 'all');
  assert.equal(statedSkill(['addition without regrouping']).regroup, 'none');
  assert.equal(statedSkill(['three-digit subtraction with borrowing']).digits, 3);
  assert.equal(statedSkill(['three-digit subtraction with borrowing']).op, 'sub');
  assert.equal(statedSkill(['regrouping addition', 'now with no regrouping please']).regroup, 'none', 'the newest mention wins');
  assert.equal(statedSkill(['Farm game: carry the crates to the barn']).regroup, null, '"carry" in a story is not a maths word on its own');
  const big = statedSkill(['two-digit regrouping', 'make the numbers bigger']);
  assert.equal(big.digits, 2); assert.equal(big.bigger, true); assert.equal(big.moreDigits, false);
  assert.equal(statedSkill(['regrouping', 'make them three-digit numbers']).digits, 3, 'asking for more digits changes them');
  assert.equal(statedSkill([], { skill: { regroup: 'all', digits: 2 } }).regroup, 'all', 'the activity\'s own skill block, when their words say nothing');
  assert.equal(statedSkill(['no regrouping'], { skill: { regroup: 'all' } }).regroup, 'none', 'their words win over the block');
  assert.deepEqual([regroupOf('digits.add', 40, 37).n, regroupOf('digits.add', 46, 38).n, regroupOf('digits.add', 68, 57).all, regroupOf('digits.sub', 503, 128).all], [0, 1, true, true]);
});

test('a regrouping game whose problems do not all regroup is flagged, problem by problem, with how to fix it', () => {
  const html = page({ problems: AUDIT });
  const list = skillProblems(html, { requests: ['regrouping addition, grade 4'] });
  assert.deepEqual(list.map(x => x.at), ['problem 2', 'problem 4', 'problem 6']);
  assert.match(list[0].why, /^40 \+ 37 needs no regrouping, but the skill asked for is regrouping \(every problem must carry or borrow at least once\)$/);
  const text = skillText(list);
  assert.match(text, /^The problems do not all practise the skill asked for: problem 2: 40 \+ 37 needs no regrouping/);
  assert.match(text, /set "regroup" \("some", "all" or "none"\)/); assert.match(text, /digits 2, lo 50, hi 99/);
  assert.doesNotMatch(text, /—/, 'no em dashes');
  // the same words, the fixed set: nothing to say
  const fixedSet = [[46, 38], [57, 26], [29, 35], [68, 27], [19, 45], [37, 48]].map(([a, b]) => ({ tool: 'digits.add', a, b }));
  assert.deepEqual(skillProblems(page({ problems: fixedSet }), { requests: ['regrouping addition, grade 4'] }), []);
  // "both columns": 46 + 38 regroups only in the ones
  assert.match(skillProblems(page({ problems: fixedSet }), { requests: ['carrying in both columns, 2-digit addition'] })[0].why, /46 \+ 38 regroups in only some columns/);
  // no words about the skill and no skill block: nothing to check
  assert.deepEqual(skillProblems(page({ problems: AUDIT }), { requests: ['a farm game'] }), []);
  // the activity's own skill block is read when the words say nothing
  assert.equal(skillProblems(page({ problems: AUDIT, skill: { regroup: 'some', digits: 2 } }), {}).length, 3);
  // not an activity, or no column sums: nothing
  assert.deepEqual(skillProblems('<p>arcade</p>', { requests: ['regrouping'] }), []);
  assert.deepEqual(skillProblems(page({ problems: [{ tool: 'fractions.shade', n: 1, d: 2 }] }), { requests: ['regrouping'] }), []);
});

test('a generator: regroup keeps every set on the skill; an older kit (no regroup) is flagged', () => {
  const ok = page({ gen: { tool: 'digits.add', digits: 2, regroup: 'some' }, skill: { regroup: 'some', digits: 2 } });
  assert.deepEqual(selfTestHtml(ok), { ok: true, problems: [] });
  assert.deepEqual(skillProblems(ok, { requests: ['regrouping addition, grade 4'] }), []);
  const plain = page({ gen: { tool: 'digits.add', digits: 2 } });
  const found = skillProblems(plain, { requests: ['regrouping addition, grade 4'] });
  assert.ok(found.length >= 1 && found.every(x => x.at === 'generator'), JSON.stringify(found));
  // Oomba Canvas 1.5.0 knows nothing of "regroup": its sets are what they are, and the check says so
  assert.ok(skillProblems(page({ gen: { tool: 'digits.add', digits: 2, regroup: 'some' } }, '1.5.0'), { requests: ['regrouping'] }).length >= 1);
});

test('"make the numbers bigger" keeps the number of digits: a jump to three-digit sums nobody asked for is flagged', () => {
  const before = page({ gen: { tool: 'digits.add', digits: 2, regroup: 'some' } });
  const jumped = page({ gen: { tool: 'digits.add', digits: 3, regroup: 'some' } });
  const asked = ['regrouping addition', 'make the numbers bigger'];
  const list = skillProblems(jumped, { requests: asked, before });
  assert.ok(list.length >= 1);
  assert.match(list[0].why, /uses three-digit numbers, but the activity had two-digit numbers and nobody asked for more digits \("bigger numbers" means larger numbers with the same number of digits\)$/);
  // bigger, the right way: larger two-digit numbers
  const larger = page({ gen: { tool: 'digits.add', digits: 2, lo: 50, hi: 99, regroup: 'some' } });
  assert.deepEqual(skillProblems(larger, { requests: asked, before }), []);
  // asked for: three-digit
  assert.deepEqual(skillProblems(jumped, { requests: ['regrouping addition', 'now make them three-digit'], before }), []);
  // the digits the teacher named in the first place
  assert.match(skillProblems(jumped, { requests: ['two-digit regrouping'] })[0].why, /the teacher asked for two-digit numbers/);
});

test('the playtest report lists a skill mismatch as a problem to fix (and only for activities)', () => {
  const raw = { mode: 'autoplay', started: 'hook', startedAt: 1500, inputs: 40, playMs: 18000, errors: [], kitWarnings: [], s0: { hook: true, state: { screen: 'work' }, nums: '0' }, s1: { hook: true, state: { screen: 'work', controls: 'none' }, nums: '1' }, readings: [{ hook: true, state: { screen: 'work' }, nums: '2' }], s2: { hook: true, state: { screen: 'work' }, nums: '3' }, events: [{ type: 'brb:ready', t: 300 }], fps: 55, layout: [], shots: [{ at: 'title', moved: null, same: 0.2 }, { at: 'start', moved: 0.4, same: 0.2 }, { at: 'idle', moved: 0.0, same: 0.2 }, { at: 'play', moved: 0.2, same: 0.2 }] };
  const html = page({ problems: AUDIT });
  const rep = autotest.buildReport(raw, { html, version: 3, skill: { requests: ['regrouping addition, grade 4'] } });
  const sk = rep.issues.find(i => i.key === 'skill');
  assert.ok(sk && !sk.soft, 'a hard problem: it starts a fix round');
  assert.match(sk.text, /problem 2: 40 \+ 37 needs no regrouping/);
  assert.match(rep.forModel, /Problems found:[\s\S]*The problems do not all practise the skill asked for/);
  assert.equal(autotest.buildReport(raw, { html, version: 3, skill: { requests: ['a farm game'] } }).issues.some(i => i.key === 'skill'), false);
  assert.equal(autotest.canvasSkillText('<p>arcade</p>', { requests: ['regrouping'] }), '');
});

test('the setup\'s typed topic tunes the ready generator: regrouping, the digits it names', () => {
  assert.deepEqual(topicFor('regrouping addition', '3').gen, { tool: 'digits.add', digits: 2, regroup: 'some' });
  assert.deepEqual(topicFor('2-digit addition with regrouping in both columns', '4').gen, { tool: 'digits.add', digits: 2, regroup: 'all' }, 'grade 4 keeps the two digits they named');
  assert.deepEqual(topicFor('regrouping addition', '4').gen, { tool: 'digits.add', digits: 4, regroup: 'some' }, 'grade 4 with no digits named: the bigger sums, still regrouping');
  assert.deepEqual(topicFor('subtraction without borrowing', '3').gen, { tool: 'digits.sub', digits: 3, regroup: 'none' });
  assert.deepEqual(topicFor('adding in columns', '2').gen, { tool: 'digits.add', digits: 2 }, 'no skill words: the chip as it was');
  const plan = normalisePlan({ kind: 'activity', topic: { text: 'regrouping addition' }, grade: '3', help: ['guided'], played: 'solo' });
  const data = canvasActivity(plan);
  assert.equal(data.gen.regroup, 'some', 'the stand-in build (mock Builder, the plan fallback) follows it too');
  assert.deepEqual(selfTestHtml(page(data)), { ok: true, problems: [] });
  assert.deepEqual(skillProblems(page(data), { topic: 'regrouping addition' }), []);
});

test('the Activity panel keeps the generator\'s regroup and story, the skill block and the theme', () => {
  const base = { config: { lang: 'en', support: 'guided', supports: ['guided'], count: 5, fresh: true }, task: { title: 'Farm', say: 'Add.', theme: { icon: '🐔', cheers: ['Egg-cellent!'] } }, problems: [], gen: { tool: 'digits.add', digits: 2 }, steps: {}, hints: {}, skill: { regroup: 'some', digits: 2 } };
  const c = AD.cleanPanel(base, { config: { count: 6 }, problems: [{ tool: 'digits.add', a: 46, b: 38, story: 'The farm packs {a} eggs, then {b} more.' }], gen: { tool: 'digits.add', digits: 2, regroup: 'some', lo: 40, hi: 99, story: 'A crate of {a} eggs and {b} more.' } });
  assert.ok(c.data, JSON.stringify(c));
  assert.deepEqual(c.data.gen, { tool: 'digits.add', lo: 40, hi: 99, digits: 2, regroup: 'some', story: 'A crate of {a} eggs and {b} more.' });
  assert.equal(c.data.problems[0].story, 'The farm packs {a} eggs, then {b} more.');
  assert.deepEqual(c.data.skill, base.skill); assert.deepEqual(c.data.task.theme, base.task.theme);
  assert.deepEqual(AD.newTexts(base, c.data).sort(), ['A crate of {a} eggs and {b} more.', 'The farm packs {a} eggs, then {b} more.'], 'a story the teacher typed is screened like any text');
});
