// Grammar Lab, Phase 2, band 6-8 part 1 (scripts/grammar-lab-build.js "grades 6-8", services/grammar-lab.js): every unit
// and topic of the first 27 pathways (27 units, 113 topic slots, 86 topics, each defined once and referenced by every
// unit that uses it), the item-by-item reading of each topic (every source line placed), the generated wrong options
// (never a second right answer, by an independent rule, and a bad one fails the check), the new formats graded on the
// server (punctuation chips with optional commas, "It's right as it is", capitalization fixed both ways, a phrase with an
// optional article and a second mention, the error-fixing box), shared mastery, and the band's Mistake Hunt rooms.
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
// part 1 is the band's first 27 units (part 2 follows them: grammar-lab-6-8b.test.js)
const PART1 = BAND.pathways.slice(0, 27);
const IDS = [...new Set(PART1.flatMap(p => PLAN.pathways[p].parts.flatMap(x => x.topics)))];
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
const newKid = () => auth.createUser({ username: `g68kid${Date.now() % 1e6}x${++n}`, password: 'correct-horse-12', displayName: 'Kid' });
const master = (u, id) => q.run("INSERT OR REPLACE INTO course_progress(user_id, course, step, band, read_at, checked_at, check_score, played_at, completed_at) VALUES (?, 'grammar-lab', ?, '6-8', 1, 1, 0, NULL, 1)", u.id, id);
const T = id => GL.topic(id);
const item = id => T(id.replace(/-\d+$/, '')).items.find(it => it.id === id);
const API = id => `/api/courses/grammar-lab/topic/${id}`;
const wordsAt = it => it.answer.map(i => tokenize(it.text)[i].t).join(' ');
/** What the page sends for a right answer to an item. */
function rightMark(it) {
  if (it.format === 'marks') return it.want.length === it.start.length && it.want.every(([g, m]) => it.start.some(([h, k]) => h === g && k === m)) ? GL.AS_IS : it.want;
  if (it.format === 'fix') return it.right === it.text ? GL.AS_IS : it.right;
  return it.answer;
}
function wrongMark(it, qn) {
  if (it.format === 'marks') { const g = [...Array(it.words.length - 1).keys()].find(x => ![...it.want, ...it.optional, ...it.start].some(([h]) => h === x)); return [...it.start, [g, ',']]; }
  if (it.format === 'fix') return it.right === it.text ? `${it.text} oops` : it.text.replace(/\.$/, ' now.');
  if (qn.kind === 'choice') return [it.options.findIndex((_, i) => !it.answer.includes(i))];
  return [qn.words.findIndex((_, i) => !it.answer.includes(i) && !(it.optional || []).includes(i))];
}
async function playTopic(u, unit, topic, { wrongFirst = false } = {}) {
  let r = await post(`${API(topic)}/start`, u, { unit, band: '6-8' });
  assert.equal(r.status, 200, `${topic} opens`);
  let qn = r.json.question, last = null;
  if (wrongFirst) {
    const it = T(topic).items.find(x => x.id === qn.id);
    last = (await post(`${API(topic)}/answer`, u, { unit, band: '6-8', id: qn.id, marked: wrongMark(it, qn) })).json;
    assert.equal(last.kind, 'wrong', `${qn.id}: a wrong answer`);
    assert.ok(last.hint);
    if (it.format === 'fix') { assert.equal(last.question.options.length, it.options.length); last = (await post(`${API(topic)}/answer`, u, { unit, band: '6-8', id: qn.id, marked: it.answer })).json; assert.equal(last.kind, 'fixed'); }
    else last = (await post(`${API(topic)}/answer`, u, { unit, band: '6-8', id: qn.id, marked: rightMark(it) })).json;
    qn = last.question;
  }
  for (let i = 0; i < 40 && !(last && last.mastered); i++) {
    last = (await post(`${API(topic)}/answer`, u, { unit, band: '6-8', id: qn.id, marked: rightMark(T(topic).items.find(x => x.id === qn.id)) })).json;
    qn = last.question;
  }
  assert.equal(last.mastered, true, `${topic} mastered`);
  return last;
}

// ------------------------------------------------------------------------------------------------- the build
test('6-8 part 1 in full: 27 units, 113 topic slots, 86 topics with 12 items each, every source slot and line placed', () => {
  const { topics, rooms, problems } = B.buildTopics(MD, PLAN, OVERRIDES);
  assert.deepEqual(problems, []);
  assert.equal(PART1.length, 27);
  assert.equal(PART1[26], 'parts-of-speech-6-8');
  const slots = PART1.flatMap(p => PLAN.pathways[p].parts.flatMap(x => x.topics));
  assert.equal(slots.length, 113);
  assert.equal(IDS.length, 86);
  for (const id of IDS) {
    const t = topics[id];
    assert.equal(t.band, '6-8', id);
    assert.equal(t.format, 'items', id);
    assert.equal(t.items.length, 12, `${id}: every one of its 12 source lines is an item`);
    assert.deepEqual(t.items.map(it => it.id), Array.from({ length: 12 }, (_, i) => `${id}-${i + 1}`));
    for (const it of t.items) assert.ok(['tap', 'capfix', 'marks', 'choice', 'passage', 'fix'].includes(it.format), it.id);
  }
  // every 6-8 part 1 heading of the source (in full or "See ... above") is one of these topics
  const sec = B.parseCourse(MD).find(s => s.heading === 'Grammar Lab, Grades 6-8, Part 1');
  const titles = sec.pathways.flatMap(p => p.topics.map(t => t.title));
  assert.equal(titles.length, 113);
  const placed = new Set(IDS.map(id => PLAN.topics[id].source.title));
  for (const title of titles) assert.ok(placed.has(title), `"${title}" is placed`);
  assert.equal(sec.pathways.length, 27);
  // the units in the source's order, one for each source pathway
  assert.deepEqual(PART1.map(p => PLAN.pathways[p].parts.flatMap(x => x.topics).length), sec.pathways.map(p => p.topics.length));
  // a topic used by several units is one id: mastering it counts in each
  assert.deepEqual(GL.unitsWith('fanboys-identify').map(p => p.id).slice(0, 3), ['compound-and-complex', 'choosing-conjunctions', 'parts-of-a-sentence-2'], 'and the units of part 2 after them');
  assert.deepEqual(GL.unitsWith('sentence-verb').map(p => p.id).slice(0, 3), ['parts-of-a-sentence-1', 'parts-of-a-sentence-2', 'parts-of-speech-6-8']);
  assert.deepEqual(GL.unitsWith('a-and-an').filter(p => p.band === '6-8').map(p => p.id), ['articles', 'confused-words-1']);
  // checkpoints follow the topic list
  const marks = Object.assign({}, ...PART1.map(p => PLAN.pathways[p].marks || {}));
  assert.deepEqual(marks, { 'using-transitions': 'checkpoint', 'fanboys-punctuate': 'checkpoint', 'conclusion-jobs': 'checkpoint', counterargument: 'checkpoint', 'common-proper': 'checkpoint' });
  // the reference product's coinages never appear (conjunctive adverbs and subordinating conjunctions by their names)
  const shipped = JSON.stringify(IDS.map(id => topics[id]));
  assert.doesNotMatch(shipped, /THAMO|SWABI/i);
  assert.doesNotMatch(shipped, /[–—]/);
  assert.equal(Object.keys(rooms).filter(id => IDS.includes(id)).length, 19);
  assert.equal(fs.readFileSync(B.OUT, 'utf8'), B.serialize(B.build()));
});

test('the readers, topic by topic: taps, phrases, pills, chips, fixes, writing passages and three-section cards', () => {
  assert.deepEqual(T('active-voice-verbs').items.map(wordsAt).slice(0, 4), ['kicked', 'watered', 'read', 'pushed']);
  // the word the question names is bold; the answer is another word
  const ad = item('adjective-describes-1');
  assert.equal(wordsAt(ad), 'firefighter'); assert.deepEqual(ad.focus.map(i => tokenize(ad.text)[i].t), ['brave']);
  // a list and a phrase: "The, a, and the" (both "the"), "Maya and Leo", a whole dependent clause
  assert.equal(wordsAt(item('identifying-articles-10')), 'The a the');
  assert.equal(wordsAt(item('sentence-subject-2')), 'Maya and Leo');
  assert.equal(wordsAt(item('dependent-clauses-6')), 'when the bus arrives');
  assert.equal(wordsAt(item('adjectives-before-after-11')), 'deep still clear');
  // the speaker: the person's words, the article optional, a second mention right too
  const sp = item('literary-context-1');
  assert.equal(wordsAt(sp), 'young sailor');
  assert.deepEqual(sp.optional.map(i => tokenize(sp.text)[i].t), ['the']);
  assert.deepEqual(sp.alts.map(a => tokenize(sp.text)[a.answer[0]].t), ['sailor']);
  // pills, in the order the question names them
  assert.deepEqual(item('active-or-passive-2').options, ['Active', 'Passive']);
  assert.equal(item('active-or-passive-2').label, 'Passive');
  assert.deepEqual(item('splices-fused-5').options, ['Comma splice', 'Fused sentence', 'Correct']);
  assert.deepEqual(item('adverbs-time-place-manner-1').options, ['Adverb of time', 'Adverb of place', 'Adverb of manner']);
  // punctuation chips: the marks as written and as they must be; quotes made real quotation marks
  const mid = item('conj-adverbs-middle-1');
  assert.deepEqual([mid.start, mid.want, mid.chips], [[], [[1, ';'], [2, ',']], [',', ';']]);
  const sub = item('subordinating-middle-1');
  assert.deepEqual([sub.start, sub.want], [[[2, ',']], []]);
  const colon = item('dialogue-colon-quotes-1');
  assert.equal(colon.text, 'The sign gave one warning “Stay on the path.”');
  assert.deepEqual(colon.want, [[4, ':']]);
  // optional commas: after a short opening phrase, and before the "and" that ends a list
  assert.deepEqual([item('commas-introductory-2').want, item('commas-introductory-2').optional], [[], [[2, ',']]]);
  assert.deepEqual([item('commas-introductory-1').want, item('commas-introductory-1').optional], [[[3, ',']], []], 'an opening clause takes its comma');
  assert.deepEqual([item('commas-series-6-8-1').want, item('commas-series-6-8-1').optional], [[[2, ',']], [[3, ',']]]);
  // a sentence with nothing to fix: the same marks, and "It's right as it is" offered on every question of its topic
  const none = item('commas-dates-4');
  assert.deepEqual([none.start, none.want, none.asIs], [[], [], true]);
  assert.ok(T('commas-dates').items.every(it => it.asIs));
  assert.ok(!T('commas-introductory').items.some(it => it.asIs));
  // capitalization both ways
  const cap = item('capitalizing-quotes-2');
  assert.deepEqual([wordsAt(cap), cap.fixed], ['The', ['the']]);
  // fixes
  const fs1 = item('splices-fused-1');
  assert.deepEqual(fs1.accept, ['The bell rang, so the students left.', 'The bell rang, and the students left.']);
  assert.deepEqual(item('splices-fused-2').accept, ['The dog barked. The cat ran.'], 'with a period, as the item asks');
  assert.deepEqual(item('fanboys-errors-2').accept, ['It rained, but we played outside.', 'It rained, yet we played outside.']);
  assert.equal(item('possessive-pronouns-5').right, 'Is this yours?');
  // a writing topic: judge the sentence in a short passage, and its card in three sections with guiding questions
  const cer = T('claims-evidence-reasoning');
  assert.ok(cer.items.every(it => it.format === 'passage'));
  assert.equal(item('claims-evidence-reasoning-2').options.length, 3);
  assert.equal(cer.card.sections.length, 3);
  assert.ok(cer.card.sections.every(s => s.question.endsWith('?') && s.passage.some(p => p.hl)));
  const counter = item('counterargument-2');
  assert.equal(counter.format, 'passage');
  assert.equal(counter.right, 'Sports can end a little later, and studies show that rested students learn more, so the trade is worth it.');
  // a card's worked passage: "Dr. Patel" stays one sentence; prose between quotes goes to the note
  const nf = T('nonfiction-context').card.sections;
  assert.equal(nf[0].passage.length, 1);
  assert.match(nf[1].note, /“The report notes that the river is polluted.”/);
  // a book title in a sentence is shown in italics
  assert.deepEqual(item('common-proper-6').titleAt, [2, 3]);
});

test('generated wrong options: made by rule, never a second right answer, and a bad one fails the independent check', () => {
  for (const id of IDS) assert.deepEqual(B.checkItems(T(id)), [], id);
  const opts = id => item(id).options;
  assert.deepEqual(opts('comparative-adjectives-4').slice().sort(), ['biger', 'bigger', 'biggest', 'more big']);
  assert.deepEqual(opts('superlative-adjectives-5').slice().sort(), ['happier', 'happiest', 'happyest'], 'no "most happy": some writers use it');
  assert.deepEqual(opts('creating-active-sentences-11').slice().sort(), ['Ben draws the map.', 'Ben drew the map.', 'The map drew Ben.', 'The map was drawn.']);
  assert.deepEqual(opts('ordering-adjectives-1').slice().sort(), ['big red ball', 'big, red ball', 'red big ball']);
  assert.deepEqual(opts('in-text-citations-5').slice().sort(), ['The first school opened in 1910 (Rivera 33).', 'The first school opened in 1910 (Rivera p. 33).', 'The first school opened in 1910 (Rivera, 33).', 'The first school opened in 1910. (Rivera 33)']);
  assert.ok(!opts('fanboys-function-7').includes('It shows a contrast.'), 'but and yet both contrast, so neither is the other\'s wrong option');
  assert.deepEqual(opts('verb-tenses-10').slice().sort(), ['Past perfect', 'Present perfect', 'Simple past']);
  // the independent rules, each made to fail
  const bad = (id, k, o) => { const t = structuredClone(T(id.replace(/-\d+$/, ''))); const it = t.items.find(x => x.id === id); it.options[k] = o; return B.checkItems(t); };
  const wrongAt = id => item(id).options.findIndex((_, i) => i !== item(id).answer[0]);
  assert.ok(bad('comparative-adjectives-1', wrongAt('comparative-adjectives-1'), 'taller').length);
  assert.ok(bad('capitalizing-formatting-titles-1', wrongAt('capitalizing-formatting-titles-1'), 'The Prince and the Pauper').length);
  assert.ok(bad('in-text-citations-9', wrongAt('in-text-citations-9'), 'The library holds 20,000 books (Lopez 8).').length, 'a citation written the right way');
  assert.ok(bad('ordering-adjectives-1', wrongAt('ordering-adjectives-1'), 'big red ball').length);
  assert.ok(bad('correlative-conjunctions-1', wrongAt('correlative-conjunctions-1'), 'and').length);
  assert.ok(bad('fanboys-function-7', wrongAt('fanboys-function-7'), 'It shows a contrast.').length);
  assert.ok(bad('creating-active-sentences-1', wrongAt('creating-active-sentences-1'), 'Ana washed the window.').length);
  assert.ok(bad('paraphrase-plagiarism-1', wrongAt('paraphrase-plagiarism-1'), 'Bees move pollen from bloom to bloom to make seeds.').length);
  // pills are checked against the topic's rule
  const flip = id => { const t = structuredClone(T(id.replace(/-\d+$/, ''))); const it = t.items.find(x => x.id === id); it.label = it.options.find(o => o !== it.label); return B.checkItems(t); };
  for (const id of ['active-or-passive-1', 'adverb-or-adjective-1', 'adverbs-time-place-manner-1', 'long-short-works-1', 'complete-or-incomplete-1', 'contractions-possessives-1', 'common-proper-3', 'splices-fused-5', 'using-transitions-1'])
    assert.ok(flip(id).length, `${id}: a wrong label fails its rule`);
  // a fix whose wrong version is accepted fails
  const t = structuredClone(T('splices-fused')); const it = t.items[0]; it.options[it.options.findIndex((_, i) => i !== it.answer[0])] = it.accept[1];
  assert.ok(B.checkItems(t).length);
  // the helpers
  assert.equal(B.degreeOf('early', 'comparative'), 'earlier');
  assert.equal(B.degreeOf('slowly', 'superlative'), 'most slowly');
  assert.equal(B.degreeOf('careful', 'comparative'), 'more careful');
  assert.equal(B.tenseOf('will sing'), 'simple future');
  assert.equal(B.doubleQuotes("Ana said, 'it's late.'"), 'Ana said, “it\'s late.”');
  assert.equal(B.doubleQuotes("the twins' bikes"), "the twins' bikes");
});

// ------------------------------------------------------------------------------------------------- grading on the server
test('the new formats are graded on the server, and the page never gets an answer', () => {
  // punctuation chips
  const mid = item('conj-adverbs-middle-1');
  assert.equal(GL.grade(mid, [[1, ';'], [2, ',']], 'marks'), 'right');
  assert.equal(GL.grade(mid, [[1, ','], [2, ',']], 'marks'), 'wrong', 'a comma where the semicolon goes');
  assert.equal(GL.grade(mid, [[1, ';']], 'marks'), 'wrong');
  assert.equal(GL.grade(mid, [], 'marks'), null, 'the sentence as written: nothing sent');
  assert.equal(GL.grade(mid, [[1, '!']], 'marks'), null, 'a mark not in the chip bank');
  assert.equal(GL.grade(mid, [[99, ',']], 'marks'), null);
  const intro = item('commas-introductory-2');
  assert.equal(GL.grade(intro, [[2, ',']], 'marks'), 'right', 'the optional comma, with');
  assert.equal(GL.grade(intro, [[1, ',']], 'marks'), 'wrong');
  const series = item('commas-series-6-8-1');
  assert.equal(GL.grade(series, [[2, ',']], 'marks'), 'right', 'without the comma before "and"');
  assert.equal(GL.grade(series, [[2, ','], [3, ',']], 'marks'), 'right', 'with it');
  const sub = item('subordinating-middle-1');
  assert.equal(GL.grade(sub, [], 'marks'), 'right', 'the stray comma taken out');
  // "It's right as it is"
  assert.equal(GL.grade(item('commas-dates-4'), GL.AS_IS, 'marks'), 'right');
  assert.equal(GL.grade(item('commas-dates-1'), GL.AS_IS, 'marks'), 'wrong');
  assert.equal(GL.grade(item('possessive-pronouns-5'), GL.AS_IS, 'fix'), 'right');
  assert.equal(GL.grade(item('possessive-pronouns-1'), GL.AS_IS, 'fix'), 'wrong');
  assert.equal(GL.grade(item('possessive-pronouns-5'), GL.AS_IS, 'fix', { missed: true }), null, 'once missed, the versions are the answer');
  assert.equal(GL.grade(item('active-voice-verbs-1'), GL.AS_IS, 'tap'), null);
  // the error-fixing box: any accepted fix
  assert.equal(GL.grade(item('splices-fused-1'), 'The bell rang, and the students left.', 'fix'), 'right');
  assert.equal(GL.grade(item('splices-fused-1'), 'The bell rang. The students left.', 'fix'), 'wrong', 'the item asks for a comma and a joining word');
  assert.equal(GL.grade(item('fanboys-errors-2'), 'It rained, yet we played outside.', 'fix'), 'right');
  // a phrase: the article optional, a second mention right, too many words a near miss
  const sp = item('literary-context-1'), toks = tokenize(sp.text), at = w => toks.findIndex(x => x.t === w);
  assert.equal(GL.grade(sp, sp.answer, 'tap'), 'right');
  assert.equal(GL.grade(sp, [...sp.answer, ...sp.optional], 'tap'), 'right');
  assert.equal(GL.grade(sp, sp.alts[0].answer, 'tap'), 'right');
  assert.equal(GL.grade(sp, [at('captain')], 'tap'), 'wrong');
  assert.equal(GL.grade(sp, [...sp.answer, ...sp.optional, at('captain'), at('chapter')], 'tap'), 'near');
  // capitalization both ways is word places
  assert.equal(GL.grade(item('capitalizing-quotes-2'), item('capitalizing-quotes-2').answer, 'tap'), 'right');
  // what the page gets: words, marks as written and chips; never want, optional, answer, accept or right
  const s = { cur: { item: T('conj-adverbs-middle').items.indexOf(mid) }, presented: 1 };
  const qn = GL.questionFor(T('conj-adverbs-middle'), s);
  assert.equal(qn.kind, 'marks');
  assert.deepEqual(qn.chips, [',', ';']);
  for (const k of ['want', 'optional', 'answer', 'accept', 'right']) assert.ok(!(k in qn), k);
  for (const id of IDS) for (const [i, it] of T(id).items.entries()) {
    const view = JSON.stringify(GL.questionFor(T(id), { cur: { item: i }, presented: 1 }));
    assert.doesNotMatch(view, /"(answer|accept|want|optional|right|label|alts)":/, it.id);
    if (it.format === 'fix' && it.right !== it.text) assert.ok(!view.includes(it.right), `${it.id}: the fix is not on the page`);
  }
});

test('playing 6-8 topics over the API: one wrong answer in each format, mastery shared by every unit that uses a topic', async () => {
  const kid = newKid();
  for (const [unit, topic] of [['commas-for-formatting', 'commas-dates'], ['embedding-quotations', 'capitalizing-quotes'], ['compound-and-complex', 'splices-fused'],
    ['active-and-passive-voice', 'active-or-passive'], ['claims-evidence-reasoning', 'claims-evidence-reasoning'], ['compound-and-complex', 'fanboys-identify']]) {
    if (topic === 'splices-fused') for (const id of ['fanboys-identify', 'fanboys-function', 'fanboys-punctuate']) master(kid, id);
    if (topic === 'active-or-passive') master(kid, 'active-voice-verbs');
    if (topic === 'claims-evidence-reasoning') master(kid, 'strong-claims');
    const last = await playTopic(kid, unit, topic, { wrongFirst: true });
    assert.equal(last.closing.answered, 13);
    assert.match(last.closing.next.href, /^\/courses\/grammar-lab\/6-8\//);
  }
  // fanboys-identify is one topic: mastered once, it is mastered (and the next one open) in all three of its units
  for (const unit of ['compound-and-complex', 'choosing-conjunctions', 'parts-of-a-sentence-2']) {
    const st = GL.unitStates(kid, GL.pathway(unit, '6-8'));
    const at = st.findIndex(s => s.topic.id === 'fanboys-identify');
    assert.ok(st[at].mastered, unit);
    assert.ok(st[at + 1].open, `${unit}: the next topic opens`);
  }
  // the ring is the live count
  assert.deepEqual(GL.unitProgress(kid, GL.pathway('commas-for-formatting', '6-8')), { done: 1, total: 2, started: 0 });
  // a 6-8 topic with a K-2 or 3-5 title is its own topic (written for this band): mastering it leaves the other alone
  master(kid, 'common-nouns-6-8');
  assert.ok(!GL.masteredSet(kid).has('identifying-common-nouns'));
  // a locked topic stays locked
  const r = await post(`${API('dependent-clauses')}/start`, kid, { unit: 'parts-of-a-sentence-2', band: '6-8' });
  assert.equal(r.status, 403);
  // pages render, behind the flag
  const page = await get('/courses/grammar-lab/6-8/compound-and-complex', kid);
  assert.equal(page.status, 200);
  assert.match(page.text, /Punctuating Conjunctive Adverbs/);
  assert.match(page.text, /gl-badge-checkpoint/);
  const card = await get('/courses/grammar-lab/6-8/claims-evidence-reasoning/claims-evidence-reasoning/card', kid);
  assert.match(card.text, /gl-section-body/);
  config.grammarLab = false;
  assert.equal((await get('/courses/grammar-lab/6-8/compound-and-complex', kid)).status, 404);
  config.grammarLab = true;
});

// ------------------------------------------------------------------------------------------------- Mistake Hunt rooms
test('the band\'s Mistake Hunt rooms: planted from the topic\'s own right sentences, only its kinds (and its own words), checked on the server', () => {
  const rooms = IDS.filter(id => GL.room(id)).sort();
  assert.deepEqual(rooms, ['accept-except', 'affect-effect', 'conj-adverbs-start', 'dependent-clauses', 'desert-dessert', 'its-and-its', 'know-no', 'knot-not', 'passed-past',
    'principal-principle', 'quiet-quite', 'right-write', 'splices-fused', 'subordinating-start', 'their-there-theyre', 'to-too-two', 'using-adverbs-adjectives', 'whos-whose', 'commas-series-6-8'].sort());
  // optional commas get no room
  for (const id of ['commas-introductory', 'fanboys-punctuate']) assert.equal(GL.room(id), null, id);
  const P = proofCore();
  for (const id of rooms) {
    const r = GL.room(id), p = r.passages[0];
    assert.ok(p.m.length >= 3, id);
    assert.ok(p.m.every(m => r.kinds.includes(m.k)), `${id}: only its kinds`);
    assert.equal(r.need, Math.ceil(0.8 * p.m.length));
    const words = (PLAN.topics[id].room || {}).words;
    if (words) {
      const toks = P.tokenize(p.x);
      for (const m of p.m) assert.ok(words.includes(toks.slice(m.a, m.b).map(w => w.s).join(' ').toLowerCase()), `${id}: "${m.w}" is planted on one of its own words`);
    }
  }
  // handing a room in with every fix passes it; it is its own mark, not mastery
  const kid = newKid();
  const p = GL.room('whos-whose').passages[0];
  GL.roomOpen(kid, 'whos-whose');
  const edits = [P.key(p.x, p.m).map(x => ({ a: x.a, b: x.b, s: x.right }))];
  const r = GL.roomSave(kid, 'whos-whose', edits, { handIn: true });
  assert.equal(r.ok, true);
  assert.equal(r.passed, true);
  assert.ok(GL.roomPassedSet(kid).has('whos-whose'));
  assert.ok(!GL.masteredSet(kid).has('whos-whose'));
});
