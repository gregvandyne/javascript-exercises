// Grammar Lab, Phase 2, band 9-12 (scripts/grammar-lab-build.js "grades 9-12", services/grammar-lab.js): the band's 36
// units (126 topic slots: 125 and the ungraded Possessives unit; 93 topics, 22 new, the rest the 6-8 topics, defined once
// and shared), every source heading placed, the 9-12 source read as written (headings with no "Topic:", cards with no
// quotes and their Labels), the item-by-item reading of each new topic, the generated wrong options (never a second
// right answer, by an independent rule, and a bad one fails the check), the server's grading of what is new (two right
// spellings, a comma taken with or without and "right as it is" then), mastery shared across bands, and the 9-12 rooms.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const { createApp } = await import('../../server/app.js');
const { q } = await import('../../server/db.js');
const { config } = await import('../../server/config.js');
const auth = await import('../../server/auth.js');
const GL = await import('../../server/services/grammar-lab.js');
const B = await import('../../scripts/grammar-lab-build.js');
const { proofCore } = await import('../../server/services/proof-core.js');
const { tokenize } = await import('../../server/services/grammar-lab-text.js');

const ROOT = path.resolve(import.meta.dirname, '../..');
const MD = fs.readFileSync(path.join(ROOT, 'seed-lessons/grammar-lab/source/course.md'), 'utf8');
const PLAN = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons/grammar-lab/pathways.json'), 'utf8'));
const OVERRIDES = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons/grammar-lab/overrides.json'), 'utf8'));
const BAND = PLAN.bands.find(b => b.id === '9-12');
const topicsOf = units => [...new Set(units.flatMap(p => PLAN.pathways[p].parts.flatMap(x => x.topics)))];
const IDS = topicsOf(BAND.pathways);
const NEW = IDS.filter(id => PLAN.topics[id].source.band === '9-12');
const B68 = PLAN.bands.find(b => b.id === '6-8');
let server, base;
test.before(async () => { config.grammarLab = true; config.grammarLabUsers = ['*']; server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => { server.close(); config.grammarLab = false; config.grammarLabUsers = []; });
const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const H = { accept: 'text/html', 'user-agent': 'Mozilla/5.0 Chrome/141.0' };
const get = async (p, u) => { const r = await fetch(base + p, { headers: { ...H, ...(u ? { cookie: cookieFor(u.id) } : {}) }, redirect: 'manual' }); return { status: r.status, text: await r.text() }; };
const post = async (p, u, body) => {
  const r = await fetch(base + p, { method: 'POST', headers: { ...H, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', ...(u ? { cookie: cookieFor(u.id) } : {}) }, body: JSON.stringify(body) });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, json, text };
};
let n = 0;
const newKid = () => auth.createUser({ username: `g912${Date.now() % 1e6}x${++n}`, password: 'correct-horse-12', displayName: 'Kid' });
const master = (u, id) => q.run("INSERT OR REPLACE INTO course_progress(user_id, course, step, band, read_at, checked_at, check_score, played_at, completed_at) VALUES (?, 'grammar-lab', ?, '9-12', 1, 1, 0, NULL, 1)", u.id, id);
const T = id => GL.topic(id);
const item = id => T(id.replace(/-\d+$/, '')).items.find(it => it.id === id);
const API = id => `/api/courses/grammar-lab/topic/${id}`;
const wordsAt = it => it.answer.map(i => tokenize(it.text)[i].t).join(' ');
const sorted = a => a.slice().sort();
const rightOpts = it => it.answer.map(i => it.options[i]);
function rightMark(it) {
  if (it.format === 'marks') return it.want.every(([g, m]) => it.start.some(([h, k]) => h === g && k === m)) && it.start.every(([g, m]) => [...it.want, ...it.optional].some(([h, k]) => h === g && k === m)) ? GL.AS_IS : it.want;
  if (it.options) return [it.answer[0]];
  return it.answer;
}
function wrongMark(it, qn) {
  if (it.format === 'marks') { const g = [...Array(it.words.length - 1).keys()].find(x => ![...it.want, ...it.optional, ...it.start].some(([h]) => h === x)); return [...it.start, [g, ',']]; }
  if (qn.kind === 'choice') return [it.options.findIndex((_, i) => !it.answer.includes(i))];
  return [qn.words.findIndex((_, i) => !it.answer.includes(i))];
}
async function playTopic(u, unit, topic) {
  let r = await post(`${API(topic)}/start`, u, { unit, band: '9-12' });
  assert.equal(r.status, 200, `${topic} opens`);
  let qn = r.json.question;
  const it0 = T(topic).items.find(x => x.id === qn.id);
  let last = (await post(`${API(topic)}/answer`, u, { unit, band: '9-12', id: qn.id, marked: wrongMark(it0, qn) })).json;
  assert.equal(last.kind, 'wrong', `${qn.id}: a wrong answer`);
  assert.ok(last.hint);
  last = (await post(`${API(topic)}/answer`, u, { unit, band: '9-12', id: qn.id, marked: rightMark(it0) })).json;
  qn = last.question;
  for (let i = 0; i < 40 && !last.mastered; i++) {
    last = (await post(`${API(topic)}/answer`, u, { unit, band: '9-12', id: qn.id, marked: rightMark(T(topic).items.find(x => x.id === qn.id)) })).json;
    qn = last.question;
  }
  assert.equal(last.mastered, true, `${topic} mastered`);
  return last;
}

// ------------------------------------------------------------------------------------------------- the build
test('9-12 in full: 36 units, 126 topic slots, 93 topics (22 new, 71 shared with 6-8), 12 items each, every source heading placed', () => {
  const { topics, problems } = B.buildTopics(MD, PLAN, OVERRIDES);
  assert.deepEqual(problems, []);
  assert.equal(BAND.pathways.length, 36);
  assert.equal(BAND.pathways.flatMap(p => PLAN.pathways[p].parts.flatMap(x => x.topics)).length, 126, '125 and the Possessives unit');
  assert.equal(IDS.length, 93);
  assert.equal(NEW.length, 22);
  // the units whose topic lists match the 6-8 ones are the same units, and their topics the 6-8 topics
  const shared = BAND.pathways.filter(p => B68.pathways.includes(p));
  assert.equal(shared.length, 26);
  for (const id of IDS.filter(x => !NEW.includes(x))) assert.equal(topics[id].band, '6-8', `${id} is the 6-8 topic, defined once`);
  for (const id of NEW) {
    const t = topics[id];
    assert.equal(t.band, '9-12', id);
    assert.equal(t.format, 'items', id);
    assert.equal(t.items.length, 12, `${id}: every one of its 12 source lines is an item`);
    for (const it of t.items) assert.ok(['tap', 'capfix', 'marks', 'choice', 'passage', 'fix'].includes(it.format), it.id);
    assert.ok(t.card.definition && t.card.example && t.card.how && t.card.tips.length >= 2, `${id}: the card's four parts`);
  }
  // every heading of the 9-12 source is one of these topics, in its source unit, and each unit holds its count
  const secs = B.parseCourse(MD).filter(s => s.band === '9-12');
  assert.equal(secs.length, 3);
  const titleOf = id => PLAN.topics[id].source.title;
  const alias = t => ({ 'Punctuating FANBOYS': 'Punctuating FANBOYS (checkpoint)', 'Forming Singular Possessives': 'Forming Singular Possessives 1' }[t] || t.replace(/^Part \d+, /, ''));
  const heads = secs.flatMap(s => s.pathways);
  assert.equal(heads.length, 36);
  const unitTitle = p => ({ 'Body Paragraphs: Claims, Evidence, and Reasoning': 'Claims, Evidence, and Reasoning', 'Components of a Sentence II': 'Parts of a Sentence II' }[p] || p);
  for (const h of heads) {
    const id = BAND.pathways.find(p => PLAN.pathways[p].title === unitTitle(h.title)) || BAND.pathways[heads.indexOf(h)];
    const list = PLAN.pathways[id].parts.flatMap(x => x.topics);
    assert.equal(list.length, h.topics.length, `${h.title}: ${h.topics.length} topics`);
    assert.deepEqual(sorted(list.map(titleOf)), sorted(h.topics.map(t => alias(t.title))), `${h.title}: the same topics`);
  }
  // the source's own counts ("## Pathway: Hyphens (6 topics)")
  const counts = [...MD.split('# Grammar Lab: Grades 9-12 Lessons')[1].matchAll(/^## Pathway: (.+) \((\d+) topics?\)$/gm)].map(m => +m[2]);
  assert.deepEqual(sorted(BAND.pathways.map(p => PLAN.pathways[p].parts.flatMap(x => x.topics).length)), sorted(counts));
  // the standard term, never the reference product's coinages
  assert.equal(PLAN.pathways['conjunctive-adverbs'].title, 'Punctuation with Conjunctions: Conjunctive Adverbs');
  assert.equal(PLAN.pathways['possessives'].title, 'Possessives');
  assert.deepEqual(PLAN.pathways['possessives'].parts.flatMap(x => x.topics), ['singular-possessives'], 'the existing Forming Singular Possessives topic');
  assert.equal(BAND.pathways[BAND.pathways.length - 1], 'possessives', 'the ungraded unit closes the 9-12 band');
  // checkpoints follow the topic list
  const marks = Object.assign({}, ...BAND.pathways.map(p => PLAN.pathways[p].marks || {}));
  assert.deepEqual(sorted(Object.keys(marks)), ['common-proper', 'conclusion-jobs', 'counterargument', 'fanboys-punctuate', 'using-transitions', 'verbal-functions'].filter(id => IDS.includes(id)));
  assert.equal(PLAN.pathways['conjunctions-all'].marks['fanboys-punctuate'], 'checkpoint');
  const shipped = JSON.stringify(NEW.map(id => topics[id]));
  assert.doesNotMatch(shipped, /THAMO|SWABI/i);
  assert.doesNotMatch(shipped, /[–—]/);
  assert.equal(fs.readFileSync(B.OUT, 'utf8'), B.serialize(B.build()));
});

test('the 9-12 source as written: headings with no "Topic:", cards with no quotes, and each new topic read item by item', () => {
  // a card with Labels: the example, its labeled words marked, the labels as its note; tips sentence by sentence
  const c = T('cite-sight-site').card;
  assert.equal(c.example.text, 'Ana had to cite her source in the essay, and she visited the site of the old mill where she caught sight of a heron.');
  assert.deepEqual(c.example.marks.map(m => tokenize(c.example.text)[m.i].t), ['cite', 'site', 'sight']);
  assert.match(c.example.note, /^Cite: verb meaning to quote a source\. Site: noun meaning a location\./);
  assert.equal(c.tips.length, 2);
  // "X becomes Y": the sentence before and after
  const pm = T('parallel-match').card.example;
  assert.deepEqual([pm.text, pm.then.text], ['Ana likes reading, writing, and to speak', 'Ana likes reading, writing, and speaking.']);
  // sound-alike sets: the set's words in the blank (press-to-cycle for set V)
  assert.deepEqual(sorted(item('cite-sight-site-1').options), ['cite', 'sight', 'site']);
  assert.equal(item('cite-sight-site-12').text, 'At first ___, the plan looked simple, but it needed more work.', 'no space before the comma');
  assert.deepEqual(sorted(item('altogether-all-together-3').options), ['All together', 'Altogether'], 'capitals at the start');
  assert.ok(item('later-latter-1').cycle && !item('scene-seen-1').cycle);
  // colons and semicolons: the blank taken out, the chips put the mark back
  const cs = item('colons-semicolons-1');
  assert.deepEqual([cs.text, cs.want, cs.chips], ['Leo had one plan for the morning to read the whole chapter before lunch.', [[6, ':']], [':', ';', ',']]);
  assert.deepEqual(item('colons-semicolons-2').want, [[3, ';']]);
  assert.deepEqual([item('colons-semicolons-3').start, item('colons-semicolons-3').optional], [[[5, ','], [8, ',']], [[8, ',']]], 'the list keeps its commas, the last one optional');
  const ca = item('conj-adverbs-clauses-1');
  assert.deepEqual([ca.text, ca.want], ['Leo trained all summer however he still felt nervous before the race.', [[3, ';'], [4, ',']]]);
  // compounds: tap the word
  assert.deepEqual([item('compound-words-1').ask, wordsAt(item('compound-words-1'))], ['Tap the compound noun.', 'firefighter']);
  assert.deepEqual([item('compound-words-12').ask, wordsAt(item('compound-words-12'))], ['Tap the compound adjective.', 'state-of-the-art']);
  // hyphens: the ways to write the words, in the blank
  assert.deepEqual([item('hyphen-compound-nouns-1').text, sorted(item('hyphen-compound-nouns-1').options)], ['My ___ visited us last weekend.', ['mother in law', 'mother-in law', 'mother-in-law']]);
  assert.deepEqual(rightOpts(item('hyphen-compound-nouns-2')), ['ice cream']);
  assert.deepEqual(sorted(item('hyphen-fractions-2').options), ['Two thirds', 'Two-thirds', 'Twothirds']);
  assert.deepEqual(rightOpts(item('hyphen-affixes-4')), ['pre-1900']);
  assert.deepEqual(rightOpts(item('hyphen-clarity-1')), ['re-cover']);
  // list cue words: commas around "for example", none with "such as", the one before "including" optional
  const lc = item('list-cue-words-1');
  assert.deepEqual([lc.want, lc.optional, lc.chips, lc.asIs], [[[3, ','], [5, ',']], [], [',', ':'], true]);
  assert.deepEqual([item('list-cue-words-2').want, item('list-cue-words-2').optional], [[], []]);
  assert.deepEqual([item('list-cue-words-3').want, item('list-cue-words-3').optional], [[], [[2, ',']]]);
  assert.deepEqual([item('list-cue-words-9').want, item('list-cue-words-9').optional], [[[5, ',']], [[3, ','], [6, ',']]], 'the Oxford comma optional too');
  // parallel structure: the two sentences; the revision as the odd item's forms in the blank
  assert.deepEqual(item('parallel-identify-1').options, ['Ana likes to read, to write, and to speak.', 'Ana likes reading, to write, and speaking.']);
  const mt = item('parallel-match-2');
  assert.deepEqual([mt.text, sorted(mt.options), rightOpts(mt)], ['Ana likes to read, ___, and to speak.', ['to write', 'write', 'writing'], ['to write']]);
  assert.equal(item('parallel-match-4').text, 'The class studied maps, charts, and ___.');
  assert.deepEqual(sorted(item('parallel-match-4').options), ['graphs', 'to read graphs']);
  // the helpers
  assert.equal(B.affixJoin('re', 'enter'), 'hyphen');
  assert.equal(B.affixJoin('pre', 'view'), 'closed');
  assert.equal(B.affixJoin('pro', 'American'), 'hyphen');
  assert.equal(B.isParallel('Sam is smart, kind, and honest.'), true);
  assert.equal(B.isParallel('Sam is smart, kind, and honesty.'), false);
  assert.equal(B.isParallel('Leo prefers reading to watch.'), false);
  // content defaults: lowercase sun, US singular for a collective noun
  assert.match(item('cite-sight-site-9').right, /the bright sun\./);
  assert.match(item('altogether-all-together-1').right, /^The team was altogether silent/);
});

test('generated wrong options: made by rule, never a second right answer, and a bad one fails the independent check', () => {
  for (const id of IDS) assert.deepEqual(B.checkItems(T(id)), [], id);
  // each answer-only item has 1 to 3 wrong options, all made by a rule
  for (const id of NEW) for (const it of T(id).items) if (it.options && it.rule !== 'parallel') assert.ok(it.options.length - it.answer.length >= 1 && it.options.length - it.answer.length <= 3, it.id);
  // two standard spellings are both right
  assert.deepEqual(sorted(rightOpts(item('hyphen-affixes-2'))), ['re-enter', 'reenter']);
  assert.deepEqual(sorted(rightOpts(item('hyphen-affixes-12'))), ['re-examine', 'reexamine']);
  assert.deepEqual(sorted(rightOpts(item('hyphen-compound-nouns-8'))), ['well-being', 'wellbeing']);
  assert.ok(item('hyphen-affixes-2').multi);
  assert.deepEqual(rightOpts(item('hyphen-affixes-6')), ['anti-inflammatory'], 'only re keeps both');
  // the independent rules, each made to fail
  const wrongAt = id => item(id).options.findIndex((_, i) => !item(id).answer.includes(i));
  const bad = (id, o, k = wrongAt(id)) => { const t = structuredClone(T(id.replace(/-\d+$/, ''))); const it = t.items.find(x => x.id === id); it.options[k] = o; return B.checkItems(t); };
  const swapRight = id => { const t = structuredClone(T(id.replace(/-\d+$/, ''))); const it = t.items.find(x => x.id === id); it.answer = [wrongAt(id)]; return B.checkItems(t); };
  for (const id of ['cite-sight-site-1', 'cite-sight-site-2', 'cite-sight-site-3', 'scene-seen-2', 'advice-advise-1', 'farther-further-1', 'farther-further-2', 'anyway-anyways-1',
    'altogether-all-together-2', 'already-all-ready-6', 'prejudice-prejudiced-2', 'later-latter-2', 'bias-biased-12', 'altar-alter-4',
    'hyphen-compound-nouns-2', 'hyphen-compound-adjectives-7', 'hyphen-fractions-1', 'hyphen-affixes-3', 'hyphen-clarity-8', 'parallel-identify-3', 'parallel-match-10'])
    assert.ok(swapRight(id).length, `${id}: a wrong option marked right fails its rule`);
  assert.ok(bad('hyphen-affixes-1', 'rewrite', wrongAt('hyphen-affixes-1')).length, 'two options read the same');
  assert.ok(bad('parallel-match-1', 'biking').length, 'a wrong form that matches the other items');
  // the chips: the rule's mark
  { const t = structuredClone(T('colons-semicolons')); t.items[0].want = [[6, ';']]; assert.ok(B.checkItems(t).length, 'a plan announced takes a colon'); }
  { const t = structuredClone(T('colons-semicolons')); t.items[1].want = [[3, ':']]; assert.ok(B.checkItems(t).length, 'two related clauses take a semicolon'); }
  { const t = structuredClone(T('conj-adverbs-clauses')); t.items[0].want = [[3, ','], [4, ',']]; assert.ok(B.checkItems(t).length, 'a comma alone before however is a splice'); }
  { const t = structuredClone(T('list-cue-words')); t.items[1].want = [[3, ',']]; assert.ok(B.checkItems(t).length, 'no comma before such as'); }
  { const t = structuredClone(T('list-cue-words')); t.items[2].want = [[2, ',']]; t.items[2].optional = []; assert.ok(B.checkItems(t).length, 'the comma before including stays optional'); }
  { const t = structuredClone(T('compound-words')); t.items[0].answer = [2]; assert.ok(B.checkItems(t).length, '"checked" is no compound noun'); }
  // the referenced Possessives topic never offers the bare-apostrophe form of a singular owner ending in s as wrong (James's, and James' accepted)
  {
    const t = structuredClone(T('singular-possessives'));
    Object.assign(t.items[0], { text: "James's report", owner: 'James', thing: 'report', right: "James's report", options: ["James's report", 'Jamess report', "Jamess' report"], answer: [0] });
    assert.deepEqual(B.checkItems(t), [], "James's is right, and the rule's other wrong forms are wrong");
    t.items[0].options[1] = "James' report";
    assert.ok(B.checkItems(t).length, "James' is accepted, so it is never a wrong option");
  }
});

// ------------------------------------------------------------------------------------------------- grading on the server
test('the server grades what is new, and the page never gets an answer', () => {
  // two right spellings: either one
  const re = item('hyphen-affixes-2');
  for (const k of re.answer) assert.equal(GL.grade(re, [k], 'choice'), 'right');
  assert.equal(GL.grade(re, [re.options.findIndex((_, i) => !re.answer.includes(i))], 'choice'), 'wrong');
  // a comma before a trailing "including": with it is right, and so is "It's right as it is"
  const inc = item('list-cue-words-3');
  assert.equal(GL.grade(inc, [[2, ',']], 'marks'), 'right');
  assert.equal(GL.grade(inc, GL.AS_IS, 'marks'), 'right');
  assert.equal(GL.grade(inc, [[2, ':']], 'marks'), 'wrong', 'never a colon');
  assert.equal(GL.grade(item('list-cue-words-2'), GL.AS_IS, 'marks'), 'right', 'such as: nothing to add');
  assert.equal(GL.grade(item('list-cue-words-1'), GL.AS_IS, 'marks'), 'wrong', 'for example needs its commas');
  assert.equal(GL.grade(item('list-cue-words-1'), [[3, ','], [5, ',']], 'marks'), 'right');
  const g9 = item('list-cue-words-9');
  assert.equal(GL.grade(g9, [[5, ',']], 'marks'), 'right', 'the optional commas left out');
  assert.equal(GL.grade(g9, [[3, ','], [5, ','], [6, ',']], 'marks'), 'right', 'and put in');
  // colons, semicolons and the conjunctive adverb's marks
  assert.equal(GL.grade(item('colons-semicolons-1'), [[6, ':']], 'marks'), 'right');
  assert.equal(GL.grade(item('colons-semicolons-1'), [[6, ';']], 'marks'), 'wrong');
  assert.equal(GL.grade(item('colons-semicolons-1'), [[6, ',']], 'marks'), 'wrong', 'a comma splice');
  assert.equal(GL.grade(item('conj-adverbs-clauses-1'), [[3, ';'], [4, ',']], 'marks'), 'right');
  assert.equal(GL.grade(item('conj-adverbs-clauses-1'), [[3, ','], [4, ',']], 'marks'), 'wrong');
  // the page never gets an answer, and nothing opens chosen
  for (const id of NEW) for (const [i, it] of T(id).items.entries()) {
    const view = JSON.stringify(GL.questionFor(T(id), { cur: { item: i }, presented: 1 }));
    assert.doesNotMatch(view, /"(answer|accept|want|optional|right|label|alts|rule|multi|check|parts)":/, it.id);
  }
  assert.equal(GL.questionFor(T('later-latter'), { cur: { item: 0 }, presented: 1 }).cycle, true);
});

test('playing 9-12 topics over the API: one wrong answer each, mastery shared with 6-8 and between units', async () => {
  const kid = newKid();
  for (const [unit, topic, before] of [['colons-and-semicolons', 'colons-semicolons', []], ['hyphens', 'hyphen-affixes', ['compound-words', 'hyphen-compound-nouns', 'hyphen-compound-adjectives', 'hyphen-fractions']],
    ['lists', 'list-cue-words', ['commas-series-6-8']], ['parallel-structure', 'parallel-match', ['parallel-identify']], ['confused-words-5', 'later-latter', ['prejudice-prejudiced']]]) {
    for (const id of before) master(kid, id);
    const last = await playTopic(kid, unit, topic);
    assert.equal(last.closing.answered, 13);
    if (last.closing.next) assert.match(last.closing.next.href, /^\/courses\/grammar-lab\/9-12\//, 'the next topic in this band');
  }
  // a topic mastered in 6-8 is mastered in the 9-12 units that use it, and the 9-12 unit's ring counts it
  const k2 = newKid();
  q.run("INSERT INTO course_progress(user_id, course, step, band, read_at, checked_at, check_score, played_at, completed_at) VALUES (?, 'grammar-lab', 'conj-adverbs-identify', '6-8', 1, 1, 0, NULL, 1)", k2.id);
  for (const unit of ['conjunctive-adverbs', 'conjunctions-all', 'compound-and-complex', 'parts-of-a-sentence-2']) {
    assert.ok(GL.unitStates(k2, GL.pathway(unit, '9-12')).find(s => s.topic.id === 'conj-adverbs-identify').mastered, unit);
  }
  const ca = GL.unitStates(k2, GL.pathway('conjunctive-adverbs', '9-12'));
  assert.deepEqual(ca.map(s => [s.topic.id, s.mastered, s.open]), [['conj-adverbs-identify', true, true], ['conj-adverbs-start', false, true], ['conj-adverbs-middle', false, false]], 'the next one opens, the one after stays locked');
  assert.deepEqual(GL.unitProgress(k2, GL.pathway('conjunctive-adverbs', '9-12')), { done: 1, total: 3, started: 0 });
  // and back: a 9-12 win shows in 6-8 (the Possessives unit's topic is the 6-8 one)
  const lp = await playTopic(k2, 'possessives', 'singular-possessives');
  assert.equal(lp.mastered, true);
  assert.ok(GL.unitStates(k2, GL.pathway('plurals-and-possessives', '6-8')).find(s => s.topic.id === 'singular-possessives').mastered);
  assert.ok(GL.unitStates(k2, GL.pathway('singular-plural-possessives', '6-8')).find(s => s.topic.id === 'singular-possessives').mastered);
  // the next topic is worked out live in the 9-12 band, never a mastered one
  const next = GL.nextTopic(k2, GL.pathway('possessives', '9-12'));
  assert.ok(next && next.unit.band === '9-12' && !GL.masteredSet(k2).has(next.topic.id));
  // the course page shows the 9-12 band with its cover; the unit pages render behind the flag
  const course = await get('/courses/grammar-lab', k2);
  assert.match(course.text, /id="gl-band-9-12"/);
  assert.match(course.text, /class="gl-bandsec gl-band-9-12"/);
  const page = await get('/courses/grammar-lab/9-12/conjunctions-all', k2);
  assert.equal(page.status, 200);
  assert.match(page.text, /Punctuation with Conjunctions: All/);
  assert.match(page.text, /gl-badge-checkpoint/);
  const card = await get('/courses/grammar-lab/9-12/hyphens/hyphen-clarity/card', k2);
  assert.equal(card.status, 200);
  assert.match(card.text, /re-cover/);
  config.grammarLab = false;
  assert.equal((await get('/courses/grammar-lab/9-12/hyphens', k2)).status, 404);
  config.grammarLab = true;
});

// ------------------------------------------------------------------------------------------------- Mistake Hunt rooms
test('9-12 rooms: the two sound-alike sets the planter knows, 12 sentences long, only their own words; none where the mistake is optional', () => {
  const rooms = NEW.filter(id => GL.room(id)).sort();
  assert.deepEqual(rooms, ['advice-advise', 'scene-seen']);
  const P = proofCore();
  for (const id of rooms) {
    const r = GL.room(id), p = r.passages[0];
    assert.equal(B.sentencesOf(p.x).length, 12, `${id}: a longer passage for 9-12`);
    assert.ok(p.m.length >= 3, id);
    assert.ok(p.m.every(m => r.kinds.includes(m.k)), `${id}: only its kinds`);
    assert.equal(r.need, Math.ceil(0.8 * p.m.length));
    const words = PLAN.topics[id].room.words, toks = P.tokenize(p.x);
    for (const m of p.m) assert.ok(words.includes(toks.slice(m.a, m.b).map(w => w.s).join(' ').toLowerCase()), `${id}: "${m.w}" is planted on one of its own words`);
  }
  for (const id of ['list-cue-words', 'colons-semicolons', 'hyphen-clarity', 'parallel-identify']) assert.equal(GL.room(id), null, id);
  // a 9-12 room opens from its unit with its band, and a full hand-in passes it without touching mastery
  assert.match(GL.roomHref('confused-words-4', 'scene-seen', '9-12'), /glroom=scene-seen&unit=confused-words-4$/);
  const kid = newKid(), p = GL.room('scene-seen').passages[0];
  GL.roomOpen(kid, 'scene-seen');
  const r = GL.roomSave(kid, 'scene-seen', [P.key(p.x, p.m).map(x => ({ a: x.a, b: x.b, s: x.right }))], { handIn: true });
  assert.equal(r.passed, true);
  assert.ok(GL.roomPassedSet(kid).has('scene-seen'));
  assert.ok(!GL.masteredSet(kid).has('scene-seen'));
});
