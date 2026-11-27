// Grammar Lab, Phase 2, band 3-5 (scripts/grammar-lab-build.js, services/grammar-lab.js, routes/grammar-lab.js,
// routes/games.js glroom): every 3-5 unit and topic from the reviewed course (17 units, 27 topic slots, 22 distinct
// topics: 13 new ones, and 9 shared with K-2 that are defined once there and referenced here), the parser and build for
// each new topic, the generated wrong options (never a second right answer, checked by an independent rule, and a bad
// one fails the check), the new formats graded on the server (judge-the-sentence in a passage, press-to-cycle, sentence
// or fragment pills, and the error-fixing box that turns into press-to-cycle after a wrong answer, a run-on taking any
// valid fix), shared mastery across bands, the review mark, and the band's Mistake Hunt rooms.
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
const games = await import('../../server/services/games.js');
if (!q.get("SELECT 1 FROM games WHERE slug='mistake-hunt'")) {
  const official = auth.getUserByName('OombaAcademy') || auth.createUser({ username: 'OombaAcademy', password: 'secret123' });
  const g = games.createGame(official.id, { title: 'Mistake Hunt', source: 'seed', slug: 'mistake-hunt' });
  const v = games.addVersion(g.id, '<!doctype html><title>t</title><p>mh</p>', { createdBy: official.id, safetyStatus: 'pass' });
  q.run("UPDATE games SET status='published', visibility='public', published_version_id=?, current_version_id=? WHERE id=?", v.id, v.id, g.id);
}

const ROOT = path.resolve(import.meta.dirname, '../..');
const MD = fs.readFileSync(path.join(ROOT, 'seed-lessons/grammar-lab/source/course.md'), 'utf8');
const PLAN = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons/grammar-lab/pathways.json'), 'utf8'));
const OVERRIDES = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons/grammar-lab/overrides.json'), 'utf8'));
const NEW = ['adverbs-how-when-where', 'compound-sentences', 'complex-sentences', 'coordinating-conjunctions', 'evidence-for-informing', 'evidence-for-opinions', 'quotation-marks-in-dialogue',
  'quotation-marks-around-quotes', 'recognizing-fragments', 'avoiding-run-ons', 'evidence-that-supports', 'showing-with-actions', 'progressive-verbs', 'tense-shifts'];
const SHARED = ['identifying-adjectives', 'capitalizing-names-and-dates', 'capitalizing-titles', 'commas-in-a-series', 'commas-after-starting-phrases', 'your-and-youre',
  'identifying-common-nouns', 'identifying-action-verbs', 'using-simple-tenses'];
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
const newKid = (name = 'g35kid') => auth.createUser({ username: `${name}${Date.now() % 1e6}x${++n}`, password: 'correct-horse-12', displayName: 'Kid' });
const master = (u, id) => q.run("INSERT OR REPLACE INTO course_progress(user_id, course, step, band, read_at, checked_at, check_score, played_at, completed_at) VALUES (?, 'grammar-lab', ?, '3-5', 1, 1, 0, NULL, 1)", u.id, id);
const T = id => GL.topic(id);
const itemOf = (topic, id) => T(topic).items.find(it => it.id === id);
const API = id => `/api/courses/grammar-lab/topic/${id}`;
const rightOf = it => it.options[it.answer[0]];
/** What the page sends for a right answer: a fix is typed (its right sentence), the rest by place. */
const rightMark = (tp, it) => (tp.format === 'fix' ? it.right : it.answer);
async function playTopic(u, unit, topic, { wrongFirst = false, band = '3-5' } = {}) {
  const tp = T(topic);
  let r = await post(`${API(topic)}/start`, u, { unit, band });
  assert.equal(r.status, 200, `${topic} opens`);
  let qn = r.json.question, last = null;
  if (wrongFirst) {
    const it = itemOf(topic, qn.id);
    const bad = tp.format === 'fix' ? `${it.text} oops` : qn.kind === 'choice' ? [it.options.findIndex((_, i) => !it.answer.includes(i))] : [qn.words.findIndex((_, i) => !it.answer.includes(i))];
    last = (await post(`${API(topic)}/answer`, u, { unit, band, id: qn.id, marked: bad })).json;
    assert.equal(last.kind, 'wrong');
    // a fix missed: now the versions to press through (a pick), never the typed fix again
    if (tp.format === 'fix') { assert.equal(last.question.options.length, it.options.length); last = (await post(`${API(topic)}/answer`, u, { unit, band, id: qn.id, marked: it.answer })).json; assert.equal(last.kind, 'fixed'); qn = last.question; }
  }
  for (let i = 0; i < 40 && !(last && last.mastered); i++) {
    last = (await post(`${API(topic)}/answer`, u, { unit, band, id: qn.id, marked: rightMark(tp, itemOf(topic, qn.id)) })).json;
    qn = last.question;
  }
  assert.equal(last.mastered, true, `${topic} mastered`);
  return last;
}

// ------------------------------------------------------------------------------------------------- the build
test('3-5 in full: 17 units, 28 topic slots, 23 topics (9 shared with K-2, defined once), 12 items each, every source slot placed', () => {
  const { topics, rooms, problems } = B.buildTopics(MD, PLAN, OVERRIDES);
  assert.deepEqual(problems, []);
  const band = PLAN.bands.find(b => b.id === '3-5');
  assert.equal(band.pathways.length, 17);
  // (a part with a band is only in that band's copy of the unit: Adjectives and Adverbs has its own adverb topic in each)
  const slots = band.pathways.flatMap(p => PLAN.pathways[p].parts.filter(x => !x.band || x.band === '3-5').flatMap(x => x.topics));
  assert.equal(slots.length, 28);
  assert.deepEqual([...new Set(slots)].sort(), [...NEW, ...SHARED].sort());
  // The shared ones are K-2's own definitions (one id, one card, one quiz), not the 3-5 section's copies.
  for (const id of SHARED) { assert.equal(topics[id].band, 'k-2', id); assert.equal(PLAN.topics[id].source.band, 'k-2'); }
  for (const id of NEW) { const t = topics[id]; assert.equal(t.band, '3-5', id); assert.equal(t.items.length, 12, id); assert.equal(PLAN.topics[id].source.band, '3-5'); }
  // Every 3-5 topic heading of the source (in full or "See ... above") is placed: a new topic, or a shared K-2 one.
  const srcTitles = B.parseCourse(MD).filter(s => s.band === '3-5').flatMap(s => s.pathways.flatMap(p => p.topics.map(t => t.title)));
  assert.equal(srcTitles.length, 28, 'the source has 28 topic slots in 3-5');
  const placed = new Set(Object.values(PLAN.topics).map(d => d.source.title));
  for (const title of srcTitles) assert.ok(placed.has(title), `"${title}" is placed`);
  // The shared slots are one id in every unit that uses them, in both bands.
  const units35 = id => GL.unitsWith(id).filter(p => p.band === '3-5').map(p => p.id);
  assert.deepEqual(units35('identifying-action-verbs'), ['fixing-sentences', 'kinds-of-words', 'verbs-and-time']);
  assert.deepEqual(units35('identifying-adjectives'), ['adjectives-and-adverbs', 'kinds-of-words']);
  assert.deepEqual(units35('capitalizing-titles'), ['capital-letters', 'titles']);
  assert.deepEqual(units35('coordinating-conjunctions'), ['joining-words', 'more-kinds-of-words']);
  // Units K-2 already has are the same definition, reused (same topic list in both bands), but for Adjectives and
  // Adverbs, whose second topic is each band's own adverb topic.
  for (const p of ['capital-letters', 'commas', 'sound-alike-words', 'kinds-of-words', 'verbs-and-time']) assert.deepEqual(GL.pathway(p, '3-5').topics, GL.pathway(p, 'k-2').topics, p);
  assert.deepEqual(GL.pathway('adjectives-and-adverbs', 'k-2').topics, ['identifying-adjectives', 'identifying-adverbs']);
  assert.deepEqual(GL.pathway('adjectives-and-adverbs', '3-5').topics, ['identifying-adjectives', 'adverbs-how-when-where']);
  assert.deepEqual(Object.fromEntries(NEW.map(id => [id, topics[id].format + (topics[id].choices ? `:${topics[id].choices.kind}` : topics[id].fix ? `:${topics[id].fix.kind}` : '')])), {
    'adverbs-how-when-where': 'tap', 'compound-sentences': 'choice:join', 'complex-sentences': 'choice:connect', 'coordinating-conjunctions': 'tap', 'evidence-for-informing': 'passage', 'evidence-for-opinions': 'passage',
    'quotation-marks-in-dialogue': 'fix:dialogue', 'quotation-marks-around-quotes': 'fix:quote', 'recognizing-fragments': 'choice:label', 'avoiding-run-ons': 'fix:runon',
    'evidence-that-supports': 'passage', 'showing-with-actions': 'choice:ab', 'progressive-verbs': 'choice:given', 'tense-shifts': 'choice:shift' });
  assert.deepEqual(Object.keys(rooms).filter(id => NEW.includes(id)).sort(), ['avoiding-run-ons', 'complex-sentences', 'compound-sentences', 'tense-shifts']);
  // The review topic is marked; its title drops the "Review:" the mark now says.
  assert.deepEqual(GL.pathway('more-verbs-and-time', '3-5').marks, { 'tense-shifts': 'review' });
  assert.equal(topics['tense-shifts'].title, 'Correcting Shifts in Verb Tense');
  assert.equal(fs.readFileSync(B.OUT, 'utf8'), B.serialize(B.build()));
});

test('the parser, topic by topic: cards (three sections for writing), answers, prompts, blanks, labels and fixes', () => {
  const wordsAt = it => it.answer.map(i => tokenize(it.text)[i].t).join(' ');
  // Coordinating conjunctions: tap, the card's conjunction marked ("But joins the two thoughts.").
  const cc = T('coordinating-conjunctions');
  assert.deepEqual(cc.items.map(wordsAt), ['and', 'or', 'so', 'but', 'yet', 'for', 'nor', 'and', 'or', 'so', 'but', 'and']);
  assert.deepEqual(cc.card.example.marks.map(m => [tokenize(cc.card.example.text)[m.i].t, m.role]), [['but', 'conjunction']]);
  assert.equal(cc.card.how, 'But shows that the second thought is different from the first.', '"Explanation:" is the card\'s how-it-works line');
  // Compound and complex: the two thoughts are the prompt; the options are whole sentences.
  const comp = T('compound-sentences');
  assert.equal(comp.items[0].prompt, 'The dog barked. The cat hid.');
  assert.deepEqual(comp.items.map(rightOf).slice(0, 4), ['The dog barked, and the cat hid.', 'It was cold, so we wore our coats.', 'Leo wanted to play outside, but it started to rain.', 'We can bake cookies, or we can make popcorn.']);
  assert.ok(comp.items.every(it => it.whole && it.options.length === (/, or /.test(it.right) ? 3 : 4)));
  const cx = T('complex-sentences');
  assert.equal(rightOf(cx.items[5]), 'Sam got better because he practiced every day.', 'the main thought first, as the answer has it');
  assert.ok(cx.items.every(it => it.options.length === (/ because /.test(it.right) ? 4 : 3)));
  // Writing cards: three sections, each a guiding question, a passage with its job sentence highlighted, a note.
  for (const id of ['evidence-for-informing', 'evidence-for-opinions', 'evidence-that-supports', 'showing-with-actions']) {
    const c = T(id).card;
    assert.equal(c.sections.length, 3, id);
    for (const s of c.sections) { assert.match(s.question, /\?$/); assert.ok(s.passage.some(x => x.hl), `${id}: a sentence highlighted`); assert.ok(s.note); }
  }
  const show = T('showing-with-actions').card.sections[0];
  assert.deepEqual(show.passage.map(x => [x.label, x.text, x.hl]), [['Telling', 'Ana was nervous.', false], ['Showing', 'Ana twisted her hair and bit her lip.', true]]);
  assert.deepEqual(T('evidence-for-informing').card.sections[1].passage.filter(x => x.hl).map(x => x.text), ['Bees help flowers grow by moving pollen.']);
  // Passages: the sentences are the choices, the question is the item's own.
  const info = T('evidence-for-informing').items[0];
  assert.equal(info.options.length, 3); assert.equal(rightOf(info), 'The moon takes about a month to go around Earth.');
  assert.match(info.ask, /^Which sentence is evidence about how long/);
  assert.deepEqual(T('evidence-for-opinions').items.map(it => it.answer[0]), [1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 2]);
  assert.deepEqual(T('evidence-that-supports').items.map(it => it.answer[0]), [1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1]);
  // Sentence or fragment: two pills in a fixed order, the sentence shown as it is.
  const frag = T('recognizing-fragments');
  assert.ok(frag.items.every(it => it.plain && it.options.join('|') === 'Complete sentence|Fragment'));
  assert.deepEqual(frag.items.map(it => it.answer[0]), [1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1]);
  // Showing vs. telling: the two given sentences, the item's own question.
  const sh = T('showing-with-actions');
  assert.deepEqual(sh.items[0].options, ['Ana was sad.', 'Ana wiped her eyes and sniffled.']); assert.equal(sh.items[0].ask, 'Which sentence shows how Ana feels?');
  // Progressive verbs and tense shifts: a blank, shown as press-to-cycle.
  const pv = T('progressive-verbs');
  assert.equal(pv.cycle, true); assert.equal(pv.items[0].text, 'Sam ___ a book right now.'); assert.deepEqual([...pv.items[0].options].sort(), ['is reading', 'reads']);
  const ts = T('tense-shifts');
  assert.equal(ts.cycle, true);
  assert.equal(ts.items[0].prompt, 'Sam walked to school and buys lunch.'); assert.equal(ts.items[0].text, 'Sam walked to school and ___ lunch.');
  assert.deepEqual([...ts.items[0].options].sort(), ['bought', 'buy', 'buys']);
  assert.deepEqual(ts.items.map(rightOf), ['bought', 'wrote', 'play', 'ate', 'scores', 'covered', 'chased', 'write', 'drinks', 'knocked', 'feed', 'dances']);
  // Fixes: the sentence to fix, the right one, what a typed fix may be (a run-on: any valid fix).
  const ro = T('avoiding-run-ons').items[0];
  assert.equal(ro.text, 'The dog barked the cat ran away.');
  assert.deepEqual(ro.accept, ['The dog barked, and the cat ran away.', 'The dog barked. The cat ran away.', 'The dog barked; the cat ran away.', 'The dog barked, so the cat ran away.']);
  assert.ok(T('avoiding-run-ons').items[3].accept.includes('The store was closed, so we went home.'), 'an override adds a valid fix');
  const dl = T('quotation-marks-in-dialogue').items[1];
  assert.deepEqual(dl.accept, ['Ana asked, "Can we go to the park?"']);
});

test('generated wrong options: 2 or 3 per answer-only item, never a second right answer (checked by an independent rule)', () => {
  let count = 0;
  for (const id of ['compound-sentences', 'complex-sentences', 'tense-shifts', 'avoiding-run-ons', 'quotation-marks-in-dialogue', 'quotation-marks-around-quotes']) {
    const t = T(id);
    assert.deepEqual(B.checkOptions(t), [], id);
    for (const it of t.items) {
      const wrong = it.options.filter((_, i) => i !== it.answer[0]);
      assert.ok(wrong.length >= 2 && wrong.length <= 3, `${it.id}: ${wrong.length} wrong`);
      assert.equal(new Set(it.options).size, it.options.length);
      if (it.accept) for (const w of wrong) assert.ok(!it.accept.includes(w), `${it.id}: "${w}" is never an accepted fix`);
      count += wrong.length;
    }
  }
  // compound: 3 each, 2 for an "or" item; complex: 3 for "because" (its opposite), 2 for the time words
  assert.equal(count, (10 * 3 + 2 * 2) + (5 * 3 + 7 * 2) + 24 + 36 + 36 + 36);
  // The given-option topics check out too (their wrong options come from the source).
  for (const id of ['recognizing-fragments', 'showing-with-actions', 'progressive-verbs', 'evidence-for-informing']) assert.deepEqual(B.checkOptions(T(id)), [], id);
  // A bad option fails the independent check: a fitting joining word, a run-on fix that splits right, a quote that
  // follows every rule, a fragment labeled a sentence, a telling sentence marked right, a form that keeps the time.
  const bad = (id, edit) => { const t = structuredClone(T(id)); edit(t.items[0], t); return B.checkOptions(t); };
  const other = it => it.options.findIndex((_, i) => i !== it.answer[0]);
  assert.ok(bad('compound-sentences', it => { it.options[other(it)] = 'The dog barked, so the cat hid.'; }).some(p => /fitting word/.test(p)));
  assert.ok(bad('avoiding-run-ons', it => { it.options[other(it)] = 'The dog barked. The cat ran away.'; }).some(p => /splits the thoughts right|accepted fix/.test(p)));
  assert.ok(bad('quotation-marks-in-dialogue', it => { it.options[other(it)] = it.right; it.options[it.answer[0]] = it.right.replace(',', ''); }).length > 0);
  assert.ok(bad('recognizing-fragments', it => { it.answer = [0]; }).some(p => /does not look like/.test(p)));
  assert.ok(bad('showing-with-actions', it => { it.answer = [1 - it.answer[0]]; }).length > 0);
  assert.ok(bad('tense-shifts', it => { it.options[other(it)] = 'walked'; }).some(p => /keeps the past time too/.test(p)));
  // Hints point, never give the answer: no fix, joining word or passage sentence named.
  for (const id of NEW) for (const it of T(id).items) {
    if (it.right) assert.ok(!it.hint.includes(it.right.replace(/[.!?"]+$/, '')), `${it.id}: the hint does not hold the answer`);
    if (T(id).format === 'passage') assert.doesNotMatch(it.hint, /\b(first|second|third)\b/i, it.id);
  }
});

// ------------------------------------------------------------------------------------------------- grading the new formats
test('server grading: a passage, press-to-cycle, label pills, and the fix box (any valid run-on fix; a pick only after a miss); no answer reaches the page', async () => {
  const kid = newKid();
  // A passage: the sentences in order, the item's own question, no answer.
  let r = await post(`${API('evidence-for-informing')}/start`, kid, { unit: 'evidence-that-informs', band: '3-5' });
  assert.equal(r.status, 200);
  let qn = r.json.question;
  assert.equal(qn.passage, true); assert.equal(qn.kind, 'choice'); assert.match(qn.ask, /^Which sentence/);
  assert.doesNotMatch(JSON.stringify(r.json), /"answer"|"right"|"accept"/);
  let it = itemOf('evidence-for-informing', qn.id);
  assert.equal(GL.grade(it, it.answer, 'choice'), 'right'); assert.equal(GL.grade(it, [(it.answer[0] + 1) % 3], 'choice'), 'wrong');
  // Press-to-cycle: the blank and its options, cycle on, nothing chosen.
  master(kid, 'progressive-verbs');
  r = await post(`${API('tense-shifts')}/start`, kid, { unit: 'more-verbs-and-time', band: '3-5' });
  qn = r.json.question;
  assert.equal(qn.cycle, true); assert.ok(qn.prompt && qn.before && qn.after); assert.equal(qn.options.length, 3);
  // Labels: the sentence itself and two pills.
  master(kid, 'identifying-action-verbs');
  r = await post(`${API('recognizing-fragments')}/start`, kid, { unit: 'fixing-sentences', band: '3-5' });
  qn = r.json.question;
  assert.equal(qn.plain, true); assert.deepEqual(qn.options, ['Complete sentence', 'Fragment']); assert.equal(qn.before, itemOf('recognizing-fragments', qn.id).text);
  // The fix box: the sentence to fix, no versions until a miss.
  master(kid, 'recognizing-fragments');
  r = await post(`${API('avoiding-run-ons')}/start`, kid, { unit: 'fixing-sentences', band: '3-5' });
  qn = r.json.question;
  assert.equal(qn.kind, 'fix'); assert.equal(qn.options, undefined);
  assert.deepEqual(Object.keys(qn).sort(), ['ask', 'id', 'kind', 'n', 'text']);
  // Any valid fix of a run-on: a period, a semicolon, a comma and a fitting joining word; curly quotes and spaces aside.
  const ro = T('avoiding-run-ons').items[0];   // The dog barked the cat ran away.
  for (const ok of ['The dog barked. The cat ran away.', 'The dog barked; the cat ran away.', 'The dog barked, and the cat ran away.', '  The dog barked,  so the cat ran away. ']) assert.equal(GL.grade(ro, ok, 'fix'), 'right', ok);
  for (const no of ['The dog barked, the cat ran away.', 'The dog barked. the cat ran away.', 'The dog barked, or the cat ran away.', 'The dog barked and the cat ran away']) assert.equal(GL.grade(ro, no, 'fix'), 'wrong', no);
  assert.equal(GL.grade(ro, ro.text, 'fix'), null, 'unchanged is nothing sent'); assert.equal(GL.grade(ro, '   ', 'fix'), null);
  assert.equal(GL.grade(ro, ro.answer, 'fix'), null, 'no pick before a miss');
  assert.equal(GL.grade(ro, ro.answer, 'fix', { missed: true }), 'right');
  const dl = T('quotation-marks-in-dialogue').items[0];   // Sam said I found a turtle.
  assert.equal(GL.grade(dl, 'Sam said, “I found a turtle.”', 'fix'), 'right', 'curly quotes count');
  assert.equal(GL.grade(dl, 'Sam said, "I found a turtle".', 'fix'), 'wrong', 'the end mark goes inside');
  // Through the API: a wrong typed fix, then the versions arrive, then a pick fixes it.
  it = itemOf('avoiding-run-ons', qn.id);
  r = await post(`${API('avoiding-run-ons')}/answer`, kid, { unit: 'fixing-sentences', band: '3-5', id: qn.id, marked: `${it.text.slice(0, -1)} today.` });
  assert.equal(r.json.kind, 'wrong'); assert.equal(r.json.question.options.length, it.options.length); assert.equal(r.json.hint, it.hint);
  assert.doesNotMatch(JSON.stringify(r.json), /"answer"|"accept"|"right"/);
  r = await post(`${API('avoiding-run-ons')}/answer`, kid, { unit: 'fixing-sentences', band: '3-5', id: qn.id, marked: [it.options.findIndex((_, i) => i !== it.answer[0])] });
  assert.equal(r.json.kind, 'again');
  r = await post(`${API('avoiding-run-ons')}/answer`, kid, { unit: 'fixing-sentences', band: '3-5', id: qn.id, marked: it.answer });
  assert.equal(r.json.kind, 'fixed'); assert.equal(r.json.question.options, undefined, 'the next question is a fix box again');
  // Each new format plays to mastery on the server, one wrong answer on the way; look back lists the right sentences.
  for (const [unit, topic] of [['fixing-sentences', 'avoiding-run-ons'], ['quotes-and-dialogue', 'quotation-marks-in-dialogue'], ['evidence-basics', 'evidence-that-supports'],
    ['showing-not-telling', 'showing-with-actions'], ['building-sentences', 'compound-sentences'], ['more-verbs-and-time', 'progressive-verbs']]) {
    const u = newKid(); master(u, 'identifying-action-verbs'); master(u, 'recognizing-fragments');
    const last = await playTopic(u, unit, topic, { wrongFirst: true });
    assert.equal(last.closing.answered, 13, topic);
    const back = await get(`/courses/grammar-lab/3-5/${unit}/${topic}/review`, u);
    assert.equal((back.text.match(/<li class="gl-(ok|fixed)">/g) || []).length, 13, topic);
  }
});

// ------------------------------------------------------------------------------------------------- sharing across bands
test('a topic mastered in K-2 is mastered in 3-5 at once (and back): tiles, locks, rings and the next topic in the band played', async () => {
  const kid = newKid();
  let page = await get('/courses/grammar-lab/3-5/fixing-sentences', kid);
  assert.match(page.text, /class="gl-tile gl-new" id="gl-topic-identifying-action-verbs"/);
  assert.match(page.text, /class="gl-tile gl-locked" id="gl-topic-recognizing-fragments"/);
  assert.equal((await post(`${API('recognizing-fragments')}/start`, kid, { unit: 'fixing-sentences', band: '3-5' })).status, 403);
  // Mastered in a K-2 unit...
  master(kid, 'identifying-common-nouns');
  await playTopic(kid, 'kinds-of-words', 'identifying-action-verbs', { band: 'k-2' });
  // ...mastered in the 3-5 units at once, and what follows it there is open.
  page = await get('/courses/grammar-lab/3-5/fixing-sentences', kid);
  assert.match(page.text, /class="gl-tile gl-mastered" id="gl-topic-identifying-action-verbs"/);
  assert.match(page.text, /class="gl-tile gl-new" id="gl-topic-recognizing-fragments"/);
  assert.match(page.text, /aria-label="1 of 3 topics mastered"/);
  const course = await get('/courses/grammar-lab', kid);
  assert.match(course.text, /id="gl-band-3-5">Grades 3-5</);
  assert.match(course.text, /<section class="gl-bandsec gl-band-3-5"[\s\S]*?id="gl-unit-fixing-sentences">\s*<span class="gl-ring" role="img" aria-label="1 of 3 topics mastered"/);
  assert.match(course.text, /<section class="gl-bandsec gl-band-3-5"[\s\S]*?id="gl-unit-verbs-and-time">\s*<span class="gl-ring" role="img" aria-label="1 of 2 topics mastered"/);
  // A 3-5 topic mastered in a 3-5 unit counts in the other 3-5 unit that has it.
  await playTopic(kid, 'joining-words', 'coordinating-conjunctions');
  assert.deepEqual(GL.unitProgress(kid, GL.pathway('more-kinds-of-words', '3-5')), { done: 1, total: 1, started: 0 });
  // Mastered in 3-5, it is mastered in K-2 too (Titles has K-2's capitalizing-titles).
  const k2 = newKid(); master(k2, 'capitalizing-names-and-dates');
  await playTopic(k2, 'titles', 'capitalizing-titles');
  assert.equal(GL.unitStates(k2, GL.pathway('capital-letters', 'k-2'))[1].mastered, true);
  // The next topic is worked out live in the band being played, never a mastered one.
  const last = await playTopic(kid, 'fixing-sentences', 'recognizing-fragments');
  assert.equal(last.closing.next.href, '/courses/grammar-lab/3-5/fixing-sentences/avoiding-run-ons');
  master(kid, 'avoiding-run-ons');
  const nxt = GL.nextTopic(kid, GL.pathway('fixing-sentences', '3-5'));
  assert.equal(nxt.unit.band, '3-5'); assert.equal(nxt.topic.id, 'identifying-adjectives');
  // A shared unit opened in 3-5 suggests within 3-5: its links keep the band.
  const shared = await get('/courses/grammar-lab/3-5/kinds-of-words', kid);
  assert.match(shared.text, /href="\/courses\/grammar-lab\/3-5\/kinds-of-words\/identifying-common-nouns"/);
  // The review mark, and a K-2 card in a 3-5 unit is not read aloud there.
  const verbs = await get('/courses/grammar-lab/3-5/more-verbs-and-time', kid);
  assert.match(verbs.text, /id="gl-topic-tense-shifts">[\s\S]*?Correcting Shifts in Verb Tense[\s\S]*?<span class="gl-badge gl-badge-review">Review<\/span>/);
  assert.equal(GL.readsAloud(T('identifying-adjectives'), GL.pathway('kinds-of-words', '3-5')), false);
  assert.equal(GL.readsAloud(T('identifying-adjectives'), GL.pathway('kinds-of-words', 'k-2')), true);
  assert.equal(GL.readsAloud(T('compound-sentences')), false);
  // The writing card's three sections, with its highlighted sentences.
  master(kid, 'evidence-for-informing');
  const card = await get('/courses/grammar-lab/3-5/evidence-that-informs/evidence-for-informing/card', kid);
  assert.equal((card.text.match(/<section class="gl-section"/g) || []).length, 3);
  assert.match(card.text, /<mark class="gl-hl">Bees help flowers grow by moving pollen\.<\/mark>/);
  assert.match(card.text, /Ask yourself/);
});

// ------------------------------------------------------------------------------------------------- Mistake Hunt rooms
test('3-5 rooms: planted at build time with only the topic\'s kinds and a fixed seed; none where no planter kind fits', () => {
  for (const [id, kinds] of [['compound-sentences', ['pc-compound']], ['complex-sentences', ['sx-fragment']], ['avoiding-run-ons', ['sx-runon', 'sx-splice']], ['tense-shifts', ['gr-tense']]]) {
    const r = GL.room(id);
    assert.ok(r, id); assert.deepEqual(r.kinds, kinds);
    const p = r.passages[0];
    assert.ok(p.m.length >= 3 && p.m.length <= 5, `${id}: ${p.m.length}`);
    assert.ok(p.m.every(m => kinds.includes(m.k)), `${id}: only its kinds`);
    assert.equal(r.need, Math.ceil(0.8 * p.m.length));
    const again = []; assert.deepEqual(JSON.parse(JSON.stringify(B.buildRoom(T(id), PLAN.topics[id], again).passages[0].m)), p.m); assert.deepEqual(again, []);
    // the passage is the topic's own right sentences
    const rights = T(id).items.map(it => it.right);
    assert.ok(rights.filter(x => p.x.includes(x)).length >= 4, `${id}: its own sentences`);
  }
  for (const id of ['coordinating-conjunctions', 'evidence-for-informing', 'evidence-for-opinions', 'evidence-that-supports', 'showing-with-actions', 'recognizing-fragments',
    'progressive-verbs', 'quotation-marks-in-dialogue', 'quotation-marks-around-quotes']) assert.equal(GL.room(id), null, id);
});

test('a 3-5 room opens from a 3-5 unit (its band kept), is checked on the server at 80%, and is its own mark', async () => {
  const P = proofCore();
  const kid = newKid();
  const id = 'compound-sentences', unit = 'building-sentences';
  const unitPage = await get(`/courses/grammar-lab/3-5/${unit}`, kid);
  assert.match(unitPage.text, /href="\/play\/mistake-hunt\?glroom=compound-sentences&amp;unit=building-sentences">Proofread room</);
  // A K-2 topic's room opened from a 3-5 unit it shares keeps the band, so "back" returns to 3-5.
  master(kid, 'commas-in-a-series');
  const k2room = await get('/courses/grammar-lab/3-5/commas', kid);
  assert.match(k2room.text, /href="\/play\/mistake-hunt\?glroom=commas-in-a-series&amp;unit=commas&amp;band=3-5"/);
  const play = await get('/play/mistake-hunt?glroom=commas-in-a-series&unit=commas&band=3-5', kid);
  assert.match(play.text, /"backHref":"\/courses\/grammar-lab\/3-5\/commas#gl-topic-commas-in-a-series"/);
  const own = await get(`/play/mistake-hunt?glroom=${id}&unit=${unit}`, kid);
  assert.match(own.text, /"glRoom":\{"topic":"compound-sentences","unit":"building-sentences"\}/);
  assert.match(own.text, /"backHref":"\/courses\/grammar-lab\/3-5\/building-sentences#gl-topic-compound-sentences"/);
  // Locked: complex sentences opens only after compound sentences.
  assert.doesNotMatch((await get(`/play/mistake-hunt?glroom=complex-sentences&unit=${unit}`, kid)).text, /"glRoom"/);
  const r = GL.room(id), p = r.passages[0];
  const v = GL.roomOpen(kid, id);
  assert.ok(!v.key); assert.equal(v.glRoom.need, r.need);
  const W = P.wrongTokens(p.x, p.m), toks = P.tokenize(p.x);
  const fixes = p.m.map((m, j) => { const a = W.findIndex(w => w.m === j); return { a, b: a + m.w.split(' ').length, s: toks.slice(m.a, m.b).map(x => x.s).join(' ') }; });
  let res = await post(`${API(id)}/room`, kid, { unit, edits: [fixes.slice(0, r.need - 1)], handIn: true });
  assert.equal(res.json.passed, false);
  GL.roomOpen(kid, id);
  res = await post(`${API(id)}/room`, kid, { unit, edits: [fixes.slice(0, r.need)], handIn: true });
  assert.equal(res.json.passed, true);
  assert.ok(GL.roomPassedSet(kid).has(id)); assert.equal(GL.masteredSet(kid).has(id), false);
  const after = await get(`/courses/grammar-lab/3-5/${unit}`, kid);
  assert.match(after.text, /gl-badge gl-badge-room">Proofread room done</);
  assert.match(after.text, /aria-label="0 of 2 topics mastered"/);
});
