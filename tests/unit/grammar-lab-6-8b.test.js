// Grammar Lab, Phase 2, band 6-8 part 2 (scripts/grammar-lab-build.js "grades 6-8, part 2", services/grammar-lab.js):
// the band's last 26 units (114 topic slots, 93 topics: 67 new, 26 shared with part 1 and defined once), every source
// heading placed, the item-by-item reading of each new topic (the lines written as only their sentence, read by the
// topic's read.bare), the generated wrong options (never a second right answer, by an independent rule, and a bad one
// fails the check), the server's grading of what is new (capitalization "right as it is", two right pills for an
// indefinite antecedent, the possession and vague-pronoun fix boxes), shared mastery, and the 14 new Mistake Hunt rooms.
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
const BAND = PLAN.bands.find(b => b.id === '6-8');
const topicsOf = units => [...new Set(units.flatMap(p => PLAN.pathways[p].parts.flatMap(x => x.topics)))];
const PART1 = BAND.pathways.slice(0, 27), PART2 = BAND.pathways.slice(27);
const IDS = topicsOf(PART2), P1 = new Set(topicsOf(PART1));
const NEW = IDS.filter(id => !P1.has(id));
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
const newKid = () => auth.createUser({ username: `g68b${Date.now() % 1e6}x${++n}`, password: 'correct-horse-12', displayName: 'Kid' });
const master = (u, id) => q.run("INSERT OR REPLACE INTO course_progress(user_id, course, step, band, read_at, checked_at, check_score, played_at, completed_at) VALUES (?, 'grammar-lab', ?, '6-8', 1, 1, 0, NULL, 1)", u.id, id);
const T = id => GL.topic(id);
const units68 = id => GL.unitsWith(id).filter(p => p.band === '6-8').map(p => p.id);
const item = id => T(id.replace(/-\d+$/, '')).items.find(it => it.id === id);
const API = id => `/api/courses/grammar-lab/topic/${id}`;
const wordsAt = it => it.answer.map(i => tokenize(it.text)[i].t).join(' ');
const sorted = a => a.slice().sort();
function rightMark(it) {
  if (it.format === 'marks') return it.want.length === it.start.length && it.want.every(([g, m]) => it.start.some(([h, k]) => h === g && k === m)) ? GL.AS_IS : it.want;
  if (it.format === 'fix') return it.right === it.text ? GL.AS_IS : it.right;
  if (it.format === 'capfix' && !it.answer.length) return GL.AS_IS;
  // a choice with two right options ("his or her" and "their"): either one
  if (it.options) return [it.answer[0]];
  return it.answer;
}
function wrongMark(it, qn) {
  if (it.format === 'marks') { const g = [...Array(it.words.length - 1).keys()].find(x => ![...it.want, ...it.optional, ...it.start].some(([h]) => h === x)); return [...it.start, [g, ',']]; }
  if (it.format === 'fix') return it.text.replace(/\.$/, ' now.');
  if (qn.kind === 'choice') return [it.options.findIndex((_, i) => !it.answer.includes(i))];
  if (it.format === 'capfix' && it.answer.length) return GL.AS_IS;
  return [qn.words.findIndex((_, i) => !it.answer.includes(i) && !(it.optional || []).includes(i))];
}
async function playTopic(u, unit, topic) {
  let r = await post(`${API(topic)}/start`, u, { unit, band: '6-8' });
  assert.equal(r.status, 200, `${topic} opens`);
  let qn = r.json.question;
  const it0 = T(topic).items.find(x => x.id === qn.id);
  let last = (await post(`${API(topic)}/answer`, u, { unit, band: '6-8', id: qn.id, marked: wrongMark(it0, qn) })).json;
  assert.equal(last.kind, 'wrong', `${qn.id}: a wrong answer`);
  assert.ok(last.hint);
  if (it0.format === 'fix') { last = (await post(`${API(topic)}/answer`, u, { unit, band: '6-8', id: qn.id, marked: it0.answer })).json; assert.equal(last.kind, 'fixed'); }
  else last = (await post(`${API(topic)}/answer`, u, { unit, band: '6-8', id: qn.id, marked: rightMark(it0) })).json;
  qn = last.question;
  for (let i = 0; i < 40 && !last.mastered; i++) {
    last = (await post(`${API(topic)}/answer`, u, { unit, band: '6-8', id: qn.id, marked: rightMark(T(topic).items.find(x => x.id === qn.id)) })).json;
    qn = last.question;
  }
  assert.equal(last.mastered, true, `${topic} mastered`);
  return last;
}

// ------------------------------------------------------------------------------------------------- the build
test('6-8 part 2 in full: 26 units, 114 topic slots, 93 topics (67 new, 26 from part 1), 12 items each, every source heading placed', () => {
  const { topics, problems } = B.buildTopics(MD, PLAN, OVERRIDES);
  assert.deepEqual(problems, []);
  assert.equal(PART2.length, 26);
  assert.equal(PART2[0], 'parts-of-speech-2');
  assert.equal(PART2.flatMap(p => PLAN.pathways[p].parts.flatMap(x => x.topics)).length, 114);
  assert.equal(IDS.length, 93);
  assert.equal(NEW.length, 67);
  for (const id of IDS) {
    const t = topics[id];
    assert.equal(t.band, '6-8', id);
    assert.equal(t.format, 'items', id);
    assert.equal(t.items.length, 12, `${id}: every one of its 12 source lines is an item`);
    for (const it of t.items) assert.ok(['tap', 'capfix', 'marks', 'choice', 'passage', 'fix'].includes(it.format), it.id);
  }
  // every heading of the part 2 source is one of these topics, in the source's units and order
  const sec = B.parseCourse(MD).find(s => s.heading === 'Grammar Lab: Grades 6-8, Part 2 Lessons');
  assert.equal(sec.pathways.length, 26);
  const placed = new Set(IDS.map(id => PLAN.topics[id].source.title));
  const alias = { 'Checkpoint: Distinguishing Common and Proper Nouns': 'Distinguishing Common and Proper Nouns (checkpoint)' };
  for (const p of sec.pathways) for (const t of p.topics) assert.ok(placed.has(alias[t.title] || t.title), `"${t.title}" is placed`);
  // each unit holds the topics its source heading counts ("## Pathway: Verbals (4 topics)"), in the source's order
  const heads = [...MD.split('# Grammar Lab: Grades 6-8, Part 2 Lessons')[1].split(/\n# /)[0].matchAll(/^## Pathway: (.+) \((\d+) topics?\)$/gm)];
  assert.equal(heads.length, 26);
  assert.deepEqual(PART2.map(p => PLAN.pathways[p].parts.flatMap(x => x.topics).length), heads.map(h => +h[2]));
  // a topic written twice in the source is one topic, read from the place chosen
  assert.equal(PLAN.topics['restrictive-clauses'].source.line, 3672, 'Punctuating Restrictive and Nonrestrictive Clauses: the Phrases and Dependent Clauses one');
  // (the 9-12 band uses these units too: here, the 6-8 band's own)
  assert.deepEqual(units68('restrictive-clauses'), ['phrases-and-clauses', 'restrictive-clauses']);
  assert.deepEqual(units68('identifying-modifiers'), ['modifiers', 'verbals']);
  assert.deepEqual(units68('singular-possessives'), ['plurals-and-possessives', 'singular-plural-possessives']);
  assert.deepEqual(units68('redundant-wordy'), ['introductions', 'thesis-statements', 'topic-sentences']);
  assert.deepEqual(units68('cap-family-titles'), ['capitalization-1', 'capitalization-2']);
  // Parts of Speech II is all part 1 topics
  assert.ok(topicsOf(['parts-of-speech-2']).every(id => P1.has(id)));
  // checkpoints follow the topic list
  assert.deepEqual(Object.assign({}, ...PART2.map(p => PLAN.pathways[p].marks || {})), { 'common-proper': 'checkpoint', 'fanboys-punctuate': 'checkpoint', 'verbal-functions': 'checkpoint' });
  const shipped = JSON.stringify(IDS.map(id => topics[id]));
  assert.doesNotMatch(shipped, /THAMO|SWABI/i);
  assert.doesNotMatch(shipped, /[–—]/);
  assert.equal(fs.readFileSync(B.OUT, 'utf8'), B.serialize(B.build()));
});

test('the readers: lines written as only their sentence, given pairs, tenses, participles, possessives and pronouns', () => {
  // taps: a word, a whole phrase, a noun with its article optional, the appositive in bold
  assert.equal(wordsAt(item('identifying-pronouns-7')), 'us');
  assert.equal(wordsAt(item('fragments-in-dialogue-1')), 'To the store');
  assert.equal(item('fragments-in-dialogue-1').text, '“Where did you go?” “To the store.”');
  assert.equal(wordsAt(item('identifying-modifiers-9')), 'excited about the trip');
  const ap = item('appositive-refers-2');
  assert.deepEqual([wordsAt(ap), ap.optional.map(i => tokenize(ap.text)[i].t), ap.focus.map(i => tokenize(ap.text)[i].t).join(' ')], ['Nile', ['The'], 'a long river in Africa']);
  // modifiers: what the sentence seems to say, what the modifier really describes, the subject a dangling one is given
  assert.equal(item('misplaced-meaning-1').ask, 'Tap the word the sentence seems to say the modifier describes.');
  assert.equal(wordsAt(item('misplaced-meaning-1')), 'bell');
  assert.equal(item('misplaced-meaning-2').ask, 'Tap the word the modifier really describes.');
  assert.equal(wordsAt(item('misplaced-meaning-2')), 'dog');
  const dg = item('dangling-meaning-3');
  assert.deepEqual([wordsAt(dg), dg.optional.map(i => tokenize(dg.text)[i].t)], ['work', ['hard']]);
  // subject and object pronouns: the line names one, or both (odd lines ask for the object)
  assert.deepEqual([item('subject-object-pronouns-1').ask, wordsAt(item('subject-object-pronouns-1'))], ['Tap the object pronoun.', 'him']);
  assert.deepEqual([item('subject-object-pronouns-2').ask, wordsAt(item('subject-object-pronouns-2'))], ['Tap the subject pronoun.', 'They']);
  assert.equal(wordsAt(item('subject-object-pronouns-7')), 'She I', 'not "and"');
  // pills and blanks
  assert.deepEqual([item('plural-or-possessive-2').label, item('plural-or-possessive-2').focus], ['Possessive', [1]]);
  assert.deepEqual(item('that-which-especially-2').options, ['Sentence', 'Fragment']);
  assert.equal(item('pronouns-in-compounds-5').text, '___ and Sam read the map.');
  assert.deepEqual(item('pronouns-in-compounds-5').options, ['She', 'Her']);
  assert.ok(item('reflexive-pronouns-1').cycle && item('collective-which-part-1').cycle, 'press-to-cycle where the topic asks for it');
  assert.equal(item('agree-simple-1').text, 'The dog ___ at the mail carrier.');
  assert.deepEqual(item('agree-simple-1').options, ['bark', 'barks']);
  assert.equal(item('others-apostrophes-1').text, 'The ___ books were left on the shelf.');
  // tenses by their helping verbs, in bold
  const pt = item('progressive-tenses-3');
  assert.deepEqual([pt.label, pt.options, pt.focus.map(i => tokenize(pt.text)[i].t).join(' ')], ['Future progressive', ['Past progressive', 'Present progressive', 'Future progressive'], 'will be visiting']);
  assert.equal(item('perfect-tenses-2').label, 'Past perfect');
  assert.deepEqual([item('verb-or-verbal-1').label, item('verb-or-verbal-4').label], ['Verbal', 'Verb']);
  assert.deepEqual([item('verbal-functions-6').label, item('verbal-functions-11').label], ['Adverb', 'Adjective']);
  // restrictive clauses: the commas taken out, put back with the chips (or right as it is)
  const rc = item('restrictive-clauses-2');
  assert.deepEqual([rc.text, rc.want, rc.asIs], ['Ana who won the race smiled.', [[0, ','], [4, ',']], true]);
  assert.deepEqual([item('restrictive-clauses-1').want, item('restrictive-clauses-1').start], [[], []]);
  // capitalization, both ways and right as it is
  const cs = item('cap-space-1');
  assert.deepEqual([wordsAt(cs), cs.fixed, cs.right], ['earth', ['Earth'], 'Earth orbits the sun.']);
  assert.deepEqual([item('cap-space-11').answer, item('cap-space-11').asIs], [[], true], 'the sun stays lowercase');
  assert.deepEqual(item('cap-seasons-1').fixed, ['spring']);
  assert.equal(item('cap-family-titles-5').right, 'Can Uncle Omar drive us to practice?');
  assert.deepEqual(item('cap-hyphenated-3').titleAt, [4, 5, 6], 'a book title in italics');
  // writing: judge the sentence in a passage, three-section cards with guiding questions
  assert.equal(item('thesis-fact-opinion-1').format, 'passage');
  assert.equal(item('thesis-fact-opinion-1').ask, 'Which sentence is the thesis?');
  for (const id of ['thesis-fact-opinion', 'hook-agreeing', 'redundant-wordy', 'vague-words']) {
    assert.equal(T(id).card.sections.length, 3, id);
    assert.ok(T(id).card.sections.every(s => s.question.endsWith('?') && s.passage.some(p => p.hl)), id);
  }
  assert.equal(T('hook-agreeing').card.sections[0].title, 'What is a hook?');
  // the fix boxes
  assert.deepEqual(item('fixing-shared-possession-12').accept, ["The twins' room is upstairs."]);
  const vp = item('fixing-vague-pronouns-1');
  assert.deepEqual([vp.ask, vp.text, vp.accept], ['Fix the sentence so it is clear that Sam was upset.', 'When Sam talked to Leo, he was upset.', ['When Sam talked to Leo, Sam was upset.']]);
  // the US singular for collective nouns
  assert.equal(item('collective-which-part-2').right, 'The team members argue among themselves.');
  assert.equal(item('agree-collective-12').right, 'The team practices after school.');
});

test('generated wrong options: made by rule, never a second right answer, and a bad one fails the independent check', () => {
  for (const id of IDS) assert.deepEqual(B.checkItems(T(id)), [], id);
  const opts = id => sorted(item(id).options);
  const eq = (id, want, msg) => assert.deepEqual(opts(id), sorted(want), msg || id);
  eq('regular-plurals-2', ["box's", 'boxes', 'boxs']);
  eq('regular-plurals-5', ["dog's", 'doges', 'dogs']);
  eq('present-participles-3', ['ran', 'running', 'runing']);
  eq('present-participles-2', ['made', 'makeing', 'making']);
  eq('past-participles-3', ['sang', 'singed', 'sung']);
  eq('past-participles-1', ['walked', 'walking', 'walks']);
  eq('plural-possessives-1', ["the student's books", "the students books", "the students' books", "the students's books"]);
  eq('singular-possessives-2', ["The girl's hat", "The girls hat", "The girls' hat"]);
  eq('gerund-pronouns-1', ['He', 'Him', 'His']);
  eq('reflexive-pronouns-2', ['himself', 'hisself', 'themselves']);
  eq('pronouns-agree-8', ["it's", 'its', 'their'], 'a team is one unit: "their" is the wrong number');
  eq('dependent-fragments-1', ['Because it rained, the game moved inside.', 'Because it rained. The game moved inside.', 'Because it rained.', 'It rained, the game moved inside.']);
  eq('fixing-misplaced-1', ['Running down the hall, the bell surprised the students.', 'The bell running down the hall surprised the students.', 'The bell surprised the students running down the hall.', 'The bell that was running down the hall surprised the students.']);
  eq('fixing-dangling-4', ['Before leaving the house, Sam lost the keys.', 'Before leaving the house, the keys were lost by Sam.', 'Before leaving the house, the keys were lost.']);
  eq('citation-end-marks-9', ['“Stop!” called the guard (Ortiz 26).', '“Stop!” called the guard. (Ortiz 26)', '“Stop” called the guard (Ortiz 26)!', '“Stop”! called the guard (Ortiz 26).']);
  assert.deepEqual(item('vague-antecedents-12').options, ['Leo', 'Sam', 'The park', 'Leo and Sam', 'It is unclear']);
  // singular "their" is right after a singular indefinite pronoun, with "his or her"
  const ind = item('indefinite-agreement-1');
  assert.deepEqual([ind.options, ind.answer], [['his or her', 'their', 'its'], [0, 1]]);
  assert.deepEqual(item('indefinite-agreement-2').answer, [1]);
  // the independent rules, each made to fail
  const wrongAt = id => item(id).options.findIndex((_, i) => !item(id).answer.includes(i));
  const bad = (id, o, k = wrongAt(id)) => { const t = structuredClone(T(id.replace(/-\d+$/, ''))); const it = t.items.find(x => x.id === id); it.options[k] = o; return B.checkItems(t); };
  assert.ok(bad('regular-plurals-2', 'boxes').length);
  assert.ok(bad('present-participles-3', 'running').length);
  assert.ok(bad('past-participles-3', 'sung').length);
  assert.ok(bad('plural-possessives-1', "the students' books").length);
  assert.ok(bad('gerund-pronouns-1', 'Their').length, 'a possessive is right before a gerund');
  assert.ok(bad('reflexive-pronouns-1', 'herself').length);
  assert.ok(bad('pronouns-agree-1', 'its').length);
  assert.ok(bad('pronouns-agree-3', 'their').length, 'singular "their" is right for a person');
  assert.ok(bad('pronouns-in-compounds-1', 'she').length);
  assert.ok(bad('dependent-fragments-1', 'When it rained, the game moved inside.').length);
  assert.ok(bad('fixing-misplaced-1', 'The bell surprised the students running down the hall.').length);
  assert.ok(bad('fixing-dangling-1', 'After reading the book, Ana found the movie boring.').length);
  assert.ok(bad('citation-end-marks-1', '“Did the explorers really cross the desert?” asks one writer (Marsh 42).').length);
  { const t = structuredClone(T('indefinite-agreement')); t.items[1].answer = [0, 1]; assert.ok(B.checkItems(t).length, '"his or her" is not right after a plural'); }
  { const t = structuredClone(T('fixing-shared-possession')); const it = t.items[0]; it.options[it.options.findIndex((_, i) => i !== it.answer[0])] = 'Sam and Mia\'s dog is brown.'; assert.ok(B.checkItems(t).length, 'a wrong version that follows the possession rule'); }
  { const t = structuredClone(T('restrictive-clauses')); t.items[0].want = [[1, ','], [5, ',']]; assert.ok(B.checkItems(t).length, 'a "who" clause after "the student" takes no commas'); }
  // pills against the topic's rule
  const flip = id => { const t = structuredClone(T(id.replace(/-\d+$/, ''))); const it = t.items.find(x => x.id === id); it.label = it.options.find(o => o !== it.label); return B.checkItems(t); };
  for (const id of ['that-which-especially-1', 'that-which-especially-2', 'plural-or-possessive-1', 'shared-unshared-1', 'shared-unshared-10', 'verb-or-verbal-1', 'verb-or-verbal-4',
    'verbal-functions-1', 'verbal-functions-3', 'verbal-functions-6', 'progressive-tenses-1', 'perfect-tenses-3', 'vague-antecedents-1', 'vague-antecedents-9'])
    assert.ok(flip(id).length, `${id}: a wrong label fails its rule`);
  // the helpers
  assert.equal(B.ingOf('swim'), 'swimming');
  assert.equal(B.ingOf('play'), 'playing');
  assert.equal(B.ppOf('choose'), 'chosen');
  assert.equal(B.possessiveOf('Mrs. Diaz'), "Mrs. Diaz's");
  assert.equal(B.tense3Of('The snow will have melted by spring.').name, 'future perfect');
  assert.equal(B.verbalRole('The book to read is on the shelf.', 'to read'), 'adjective');
  assert.equal(B.needsClauseCommas('Mrs. Alvarez who teaches math is kind.'), true);
  assert.equal(B.possessionOk("Mom's and Dad's cars are in the garage."), true);
  assert.equal(B.possessionOk("Mom's and Dad's car is in the garage."), false);
});

// ------------------------------------------------------------------------------------------------- grading on the server
test('the server grades what is new, and the page never gets an answer', () => {
  // capitalization: "It's right as it is" when there is nothing to fix; any word tapped then is wrong, not a near miss
  const asIs = item('cap-space-11'), fixMe = item('cap-space-1');
  assert.equal(GL.grade(asIs, GL.AS_IS, 'tap'), 'right');
  assert.equal(GL.grade(asIs, [0], 'tap'), 'wrong');
  assert.equal(GL.grade(fixMe, GL.AS_IS, 'tap'), 'wrong');
  assert.equal(GL.grade(fixMe, fixMe.answer, 'tap'), 'right');
  assert.equal(GL.grade(item('identifying-pronouns-1'), GL.AS_IS, 'tap'), null, 'only a topic that offers it');
  const s = it => ({ cur: { item: T(it.id.replace(/-\d+$/, '')).items.indexOf(it) }, presented: 1 });
  assert.equal(GL.questionFor(T('cap-space'), s(asIs)).asIs, true);
  assert.equal(GL.questionFor(T('cap-space'), s(fixMe)).asIs, true, 'offered on every question of the topic');
  // two right pills: "his or her" and "their"
  const ind = item('indefinite-agreement-1');
  assert.equal(GL.grade(ind, [0], 'choice'), 'right');
  assert.equal(GL.grade(ind, [1], 'choice'), 'right');
  assert.equal(GL.grade(ind, [2], 'choice'), 'wrong');
  assert.equal(GL.grade(item('indefinite-agreement-2'), [0], 'choice'), 'wrong');
  // fix boxes: typed, then the versions after a miss
  const sh = item('fixing-shared-possession-1');
  assert.equal(GL.grade(sh, "Ana and Leo's garden is behind the school.", 'fix'), 'right');
  assert.equal(GL.grade(sh, "Ana's and Leo garden is behind the school.", 'fix'), 'wrong');
  assert.equal(GL.grade(sh, sh.answer, 'fix'), null, 'no versions before a miss');
  assert.equal(GL.grade(sh, sh.answer, 'fix', { missed: true }), 'right');
  const vp = item('fixing-vague-pronouns-11');
  assert.equal(GL.grade(vp, 'Leo told Sam, "I forgot my lunch."', 'fix'), 'right', 'straight quotes typed');
  // restrictive clauses with chips
  const rc = item('restrictive-clauses-2');
  assert.equal(GL.grade(rc, [[0, ','], [4, ',']], 'marks'), 'right');
  assert.equal(GL.grade(rc, [[0, ',']], 'marks'), 'wrong');
  assert.equal(GL.grade(item('restrictive-clauses-1'), GL.AS_IS, 'marks'), 'right');
  // a dangling modifier's subject: the head word, the article and adjective optional
  const dg = item('dangling-meaning-3');
  assert.equal(GL.grade(dg, dg.answer, 'tap'), 'right');
  assert.equal(GL.grade(dg, [...dg.optional, ...dg.answer], 'tap'), 'right');
  // the page never gets an answer
  for (const id of NEW) for (const [i, it] of T(id).items.entries()) {
    const view = JSON.stringify(GL.questionFor(T(id), { cur: { item: i }, presented: 1 }));
    assert.doesNotMatch(view, /"(answer|accept|want|optional|right|label|alts|rule|multi)":/, it.id);
    if (it.format === 'fix' && it.right !== it.text) assert.ok(!view.includes(it.right), `${it.id}: the fix is not on the page`);
  }
});

test('playing part 2 topics over the API: one wrong answer each, mastery shared with part 1 and between units', async () => {
  const kid = newKid();
  for (const [unit, topic, before] of [['capitalization-1', 'cap-first-word', []], ['pronoun-agreement', 'indefinite-agreement', ['identifying-pronouns', 'pronouns-agree']],
    ['plurals-and-possessives', 'fixing-shared-possession', ['regular-plurals', 'plural-or-possessive', 'singular-possessives', 'others-apostrophes', 'shared-unshared']],
    ['phrases-and-clauses', 'restrictive-clauses', ['appositive-refers', 'participial-modifies', 'commas-introductory', 'dependent-fragments']],
    ['perfect-progressive', 'progressive-tenses', ['verb-tenses', 'present-participles']], ['modifiers', 'misplaced-meaning', ['identifying-modifiers']]]) {
    for (const id of before) master(kid, id);
    const last = await playTopic(kid, unit, topic);
    assert.equal(last.closing.answered, 13);
    assert.match(last.closing.next.href, /^\/courses\/grammar-lab\/6-8\//);
  }
  // restrictive-clauses is one topic in two units; identifying-modifiers in Modifiers and Verbals
  for (const unit of ['phrases-and-clauses', 'restrictive-clauses']) assert.ok(GL.unitStates(kid, GL.pathway(unit, '6-8')).find(s => s.topic.id === 'restrictive-clauses').mastered, unit);
  const verbals = GL.unitStates(kid, GL.pathway('verbals', '6-8'));
  assert.deepEqual(verbals.map(s => [s.topic.id, !!s.mastered]), [['verb-tenses', true], ['verb-or-verbal', false], ['identifying-modifiers', true], ['verbal-functions', false]]);
  assert.ok(verbals[1].open && verbals[3].open, 'a topic opens once the one before it is mastered, in whichever unit');
  const sva = GL.unitStates(kid, GL.pathway('agreement-2', '6-8'));
  assert.ok(sva[0].open && !sva[1].open, 'locks follow the order');
  // Parts of Speech II is all part 1 topics: mastering them in part 1 fills its ring
  for (const id of topicsOf(['parts-of-speech-2'])) master(kid, id);
  assert.deepEqual(GL.unitProgress(kid, GL.pathway('parts-of-speech-2', '6-8')), { done: 9, total: 9 });
  assert.deepEqual(GL.unitProgress(kid, GL.pathway('parts-of-speech-6-8', '6-8')), { done: 5, total: 5 });
  // the next topic is worked out live, never a mastered one
  const next = GL.nextTopic(kid, GL.pathway('parts-of-speech-3', '6-8'));
  assert.ok(next && !GL.masteredSet(kid).has(next.id));
  // pages render behind the flag, the checkpoint marked and the card's sections shown
  const page = await get('/courses/grammar-lab/6-8/verbals', kid);
  assert.equal(page.status, 200);
  assert.match(page.text, /Identifying the Function of Verbals/);
  assert.match(page.text, /gl-badge-checkpoint/);
  const card = await get('/courses/grammar-lab/6-8/thesis-statements/thesis-fact-opinion/card', kid);
  assert.equal((card.text.match(/class="gl-section"/g) || []).length, 3);
  assert.match(card.text, /Debatable theses/);
  assert.match(card.text, /<mark class="gl-hl">The school library holds 4,000 books\.<\/mark>/);
  config.grammarLab = false;
  assert.equal((await get('/courses/grammar-lab/6-8/verbals', kid)).status, 404);
  config.grammarLab = true;
});

// ------------------------------------------------------------------------------------------------- Mistake Hunt rooms
test('part 2\'s Mistake Hunt rooms: planted from the topic\'s own right sentences, only its kinds (and its words), checked on the server', () => {
  const rooms = NEW.filter(id => GL.room(id)).sort();
  assert.deepEqual(rooms, ['agree-here-there', 'cap-brands', 'cap-buildings', 'cap-days-months', 'cap-first-word', 'cap-holidays', 'cap-places', 'cap-political-groups', 'cap-seasons',
    'cap-social-titles', 'plural-possessives', 'pronouns-in-compounds', 'singular-possessives', 'subject-object-pronouns']);
  const P = proofCore();
  for (const id of rooms) {
    const r = GL.room(id), p = r.passages[0];
    assert.ok(p.m.length >= 3, id);
    assert.ok(p.m.every(m => r.kinds.includes(m.k)), `${id}: only its kinds`);
    assert.equal(r.need, Math.ceil(0.8 * p.m.length));
    const words = (PLAN.topics[id].room || {}).words;
    if (words) { const toks = P.tokenize(p.x); for (const m of p.m) assert.ok(words.includes(toks.slice(m.a, m.b).map(w => w.s).join(' ').toLowerCase()), `${id}: "${m.w}" is planted on one of its own words`); }
  }
  // the seasons room plants a stray capital on a season only
  assert.ok(GL.room('cap-seasons').passages[0].m.every(m => /^(Spring|Summer|Fall|Autumn|Winter)\.?$/.test(m.w)));
  // optional or judgment mistakes get no room
  for (const id of ['restrictive-clauses', 'thesis-fact-opinion', 'indefinite-agreement']) assert.equal(GL.room(id), null, id);
  // handing a room in with every fix passes it; it is its own mark, not mastery
  const kid = newKid(), p = GL.room('cap-holidays').passages[0];
  GL.roomOpen(kid, 'cap-holidays');
  const r = GL.roomSave(kid, 'cap-holidays', [P.key(p.x, p.m).map(x => ({ a: x.a, b: x.b, s: x.right }))], { handIn: true });
  assert.equal(r.passed, true);
  assert.ok(GL.roomPassedSet(kid).has('cap-holidays'));
  assert.ok(!GL.masteredSet(kid).has('cap-holidays'));
});
