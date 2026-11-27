// Grammar Lab, Phase 2, band K-2 (scripts/grammar-lab-build.js, services/grammar-lab.js, routes/grammar-lab.js,
// routes/games.js glroom): every K-2 unit and topic from the reviewed course (6 units, 11 topic slots, 9 topics, each
// shared topic defined once), the parser and build for each, the generated wrong options (never a second right answer,
// checked by an independent rule, and a bad one fails the build), the new formats graded on the server (click-to-fix
// capitals, comma gaps with the list's last comma optional, choices), shared mastery shown everywhere at once, locks,
// rings and the live next topic, and the Mistake Hunt rooms (planted at build time, checked on the server at 80%).
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
const V = await import('../../server/views/grammar-lab.js');
const { proofCore } = await import('../../server/services/proof-core.js');
const { tokenize } = await import('../../server/services/grammar-lab-text.js');
const { tFor } = await import('../../server/i18n/index.js');
const games = await import('../../server/services/games.js');
// The official Mistake Hunt game (the rooms open in it), as the seed makes it.
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
// The K-2 topics (the band that defines them; grades 3-5 reference some of them and add their own).
const K2_IDS = Object.keys(PLAN.topics).filter(id => PLAN.topics[id].source.band === 'k-2');
let server, base;
test.before(async () => { config.grammarLab = true; config.grammarLabUsers = ['*']; server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => { server.close(); config.grammarLab = false; config.grammarLabUsers = []; });
const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const H = { accept: 'text/html', 'user-agent': 'Mozilla/5.0 Chrome/141.0' };
const get = async (p, u) => { const r = await fetch(base + p, { headers: { ...H, ...(u ? { cookie: cookieFor(u.id) } : {}) }, redirect: 'manual' }); return { status: r.status, text: await r.text(), location: r.headers.get('location') }; };
const post = async (p, u, body) => {
  const r = await fetch(base + p, { method: 'POST', headers: { ...H, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', ...(u ? { cookie: cookieFor(u.id) } : {}) }, body: JSON.stringify(body) });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, json, text };
};
let n = 0;
const newKid = (name = 'k2kid') => auth.createUser({ username: `${name}${Date.now() % 1e6}x${++n}`, password: 'correct-horse-12', displayName: 'Kid' });
const master = (u, id) => q.run("INSERT OR REPLACE INTO course_progress(user_id, course, step, band, read_at, checked_at, check_score, played_at, completed_at) VALUES (?, 'grammar-lab', ?, 'k-2', 1, 1, 0, NULL, 1)", u.id, id);
const itemOf = (topic, id) => GL.topic(topic).items.find(it => it.id === id);
const API = id => `/api/courses/grammar-lab/topic/${id}`;
/** Play a topic to mastery through the API with right answers (a wrong one first when asked). -> the last answer. */
async function playTopic(u, unit, topic, { wrongFirst = false } = {}) {
  let r = await post(`${API(topic)}/start`, u, { unit });
  assert.equal(r.status, 200, `${topic} opens`);
  let qn = r.json.question, last = null;
  if (wrongFirst) {
    const it = itemOf(topic, qn.id);
    const bad = qn.kind === 'choice' ? [it.options.findIndex((_, i) => !it.answer.includes(i))] : [qn.words.findIndex((_, i) => !it.answer.includes(i) && !(it.optional || []).includes(i))];
    last = (await post(`${API(topic)}/answer`, u, { unit, id: qn.id, marked: bad })).json;
    assert.equal(last.kind, 'wrong');
  }
  for (let i = 0; i < 40 && !(last && last.mastered); i++) {
    last = (await post(`${API(topic)}/answer`, u, { unit, id: qn.id, marked: itemOf(topic, qn.id).answer })).json;
    qn = last.question;
  }
  assert.equal(last.mastered, true, `${topic} mastered`);
  return last;
}

// ------------------------------------------------------------------------------------------------- the build
test('K-2 in full: 6 units, 11 topic slots, 9 topics (shared ones defined once), 12 items each, every source slot placed', () => {
  const { topics: all, rooms: allRooms, problems } = B.buildTopics(MD, PLAN, OVERRIDES);
  assert.deepEqual(problems, []);
  const topics = Object.fromEntries(K2_IDS.map(id => [id, all[id]]));
  const rooms = Object.fromEntries(Object.entries(allRooms).filter(([id]) => K2_IDS.includes(id)));
  const band = PLAN.bands.find(b => b.id === 'k-2');
  assert.equal(band.pathways.length, 6);
  const slots = band.pathways.flatMap(p => PLAN.pathways[p].parts.flatMap(x => x.topics));
  assert.equal(slots.length, 11);
  assert.equal(new Set(slots).size, 9);
  assert.equal(Object.keys(topics).length, 9);
  for (const t of Object.values(topics)) { assert.equal(t.items.length, 12, t.id); assert.equal(t.band, 'k-2'); assert.ok(t.card.definition && t.card.example && t.card.how && t.card.tips.length, `${t.id} card`); }
  // Every K-2 topic heading of the source, written in full or as "See ... above", is a topic in pathways.json.
  const sections = B.parseCourse(MD).filter(s => s.band === 'k-2');
  const srcTitles = sections.flatMap(s => s.pathways.flatMap(p => p.topics.map(t => t.title)));
  assert.equal(srcTitles.length, 11, 'the source has 11 K-2 topic slots');
  const byTitle = Object.fromEntries(K2_IDS.map(id => [PLAN.topics[id].source.title, PLAN.topics[id]]));
  for (const title of srcTitles) assert.ok(byTitle[title], `"${title}" is placed`);
  // The two shared topics are cross-references in the source and one id in every unit that uses them.
  assert.deepEqual(B.slotsOf(B.parseCourse(MD), 'k-2', 'Identifying Action Verbs').map(s => s.full), [true, false]);
  const k2Units = id => GL.unitsWith(id).filter(p => p.band === 'k-2').map(p => p.id);
  assert.deepEqual(k2Units('identifying-action-verbs'), ['kinds-of-words', 'verbs-and-time']);
  assert.deepEqual(k2Units('identifying-adjectives'), ['adjectives-and-adverbs', 'kinds-of-words']);
  assert.deepEqual(Object.fromEntries(Object.values(topics).map(t => [t.id, t.format])), {
    'identifying-adjectives': 'tap', 'capitalizing-names-and-dates': 'capfix', 'capitalizing-titles': 'choice', 'commas-in-a-series': 'gaps',
    'commas-after-starting-phrases': 'choice', 'your-and-youre': 'choice', 'identifying-common-nouns': 'tap', 'identifying-action-verbs': 'tap', 'using-simple-tenses': 'choice' });
  assert.deepEqual(Object.keys(rooms).sort(), ['capitalizing-names-and-dates', 'capitalizing-titles', 'commas-in-a-series', 'your-and-youre']);
  // The committed topics.json is what the build makes now.
  assert.equal(fs.readFileSync(B.OUT, 'utf8'), B.serialize(B.build()));
});

test('the parser, topic by topic: answers placed in their sentences, cards read, titles in italics, blanks with a base verb made choices', () => {
  const T = id => GL.topic(id);
  const wordsAt = it => it.answer.map(i => tokenize(it.text)[i].t).join(' ');
  assert.deepEqual(T('identifying-common-nouns').items.map(wordsAt), ['dog', 'baby', 'sun', 'teacher', 'frog', 'library', 'bird', 'cook', 'rain', 'school', 'horse', 'singer']);
  assert.deepEqual(T('identifying-action-verbs').items.map(wordsAt), ['runs', 'kicks', 'swims', 'climbs', 'buzzes', 'reads', 'gallops', 'draws', 'hops', 'builds', 'sings', 'eats']);
  assert.deepEqual(T('identifying-common-nouns').card.example.marks, [{ i: 1, role: 'noun' }, { i: 5, role: 'noun' }]);
  // Click-to-fix: the word written with a small letter, and its fix.
  const names = T('capitalizing-names-and-dates');
  assert.deepEqual(names.items.map(wordsAt), ['ana', 'monday', 'june', 'leo', 'friday', 'max', 'september', 'sam', 'tuesday', 'october', 'ana', 'may']);
  assert.deepEqual(names.items[0].fixed, ['Ana']); assert.equal(names.items[0].right, 'My friend Ana likes to draw.');
  assert.deepEqual(names.card.example.then.marks.map(m => tokenize(names.card.example.then.text)[m.i].t), ['Sam', 'July']);
  assert.deepEqual(names.card.tips[0].marks, [{ i: 2, role: 'capital' }]);
  // Titles: a blank in the sentence (no quotes), the title shown in italics, the right capitals by the title rules.
  const titles = T('capitalizing-titles');
  assert.equal(titles.italic, true);
  assert.equal(titles.items[0].text, 'My favorite book is ___.'); assert.equal(titles.items[7].text, 'The book ___ is funny.');
  assert.ok(titles.items.every(it => !/['"]/.test(it.text)), 'no quotes around titles');
  assert.deepEqual(titles.items.map(it => it.options[it.answer[0]]), ['The Brave Little Fox', 'My Yellow Kite', 'A Day at the Farm', 'The Lost Puppy', 'Rain on My Roof', 'The Big Green Frog', 'My Trip to the Zoo', 'Bears in the Snow', 'The Magic Pond', 'The Happy Farmer', 'The Sleepy Owl', 'Dogs and Ducks at Play']);
  assert.equal(titles.card.example.lead, 'We read the book'); assert.equal(titles.card.example.then.text, 'The Brave Little Fox.');
  // Commas in a list: the gaps, the last one (before "and") optional.
  const series = T('commas-in-a-series');
  assert.deepEqual([series.items[0].answer, series.items[0].optional], [[4], [6]]);
  assert.equal(series.items[0].right, 'My bag has a book, a pencil, and a snack.');
  assert.deepEqual(series.card.example.then.marks, [{ i: 3, role: 'comma' }, { i: 5, role: 'comma' }]);
  // Starting phrases: whole sentences.
  const intro = T('commas-after-starting-phrases');
  assert.ok(intro.items.every(it => it.whole && it.options.length === 3));
  assert.equal(intro.items[0].options[intro.items[0].answer[0]], 'In the garden, the bees buzz all day.');
  // Your / you're: a pill pair in its own order, capitalized at the start of a sentence.
  const your = T('your-and-youre');
  assert.deepEqual(your.items[0].options, ['your', "you're"]); assert.deepEqual(your.items[1].options, ['Your', "You're"]);
  assert.deepEqual(your.items.map(it => it.options[it.answer[0]]), ['your', "You're", "You're", 'your', 'Your', "You're", 'your', "You're", "You're", 'your', 'your', "You're"]);
  // Tenses: "___ (draw)" became a choice of three forms of the same verb; the base verb is not shown.
  const tense = T('using-simple-tenses');
  assert.equal(tense.items[1].text, 'Yesterday, Ana ___ a picture.');
  assert.deepEqual([...tense.items[1].options].sort(), ['draw', 'draws', 'drew']);
  assert.deepEqual(tense.items.map(it => it.options[it.answer[0]]), ['plays', 'drew', 'fly', 'eats', 'climbed', 'play', 'sings', 'walked', 'bake', 'rides', 'jumped', 'visit']);
  assert.deepEqual(tense.card.example.marks.map(m => tokenize(tense.card.example.text)[m.i].t), ['walks', 'walked', 'will', 'walk']);
  // Read aloud: the K-2 cards, as one text.
  assert.match(GL.cardSpoken(titles), /We read the book the brave little fox\. The title is The Brave Little Fox\./);
  for (const id of K2_IDS) assert.equal(GL.readsAloud(GL.topic(id)), true, `${id} is read aloud`);
});

test('generated wrong options: 1 for a word pair, 2 otherwise, never a second right answer (checked by an independent rule)', () => {
  let count = 0;
  for (const id of ['capitalizing-titles', 'commas-after-starting-phrases', 'your-and-youre', 'using-simple-tenses']) {
    const t = GL.topic(id);
    assert.deepEqual(B.checkOptions(t), [], id);
    for (const it of t.items) {
      assert.equal(it.answer.length, 1);
      const right = it.options[it.answer[0]], wrong = it.options.filter((_, i) => i !== it.answer[0]);
      assert.equal(wrong.length, id === 'your-and-youre' ? 1 : 2, it.id);
      assert.equal(new Set(it.options).size, it.options.length, `${it.id}: options differ`);
      count += wrong.length;
      if (id === 'capitalizing-titles') for (const w of wrong) { assert.notEqual(B.titleCase(w), w, `${it.id}: "${w}" breaks the title rules`); assert.equal(w.toLowerCase(), right.toLowerCase(), 'only capitals differ'); }
      if (id === 'commas-after-starting-phrases') {
        const plain = it.text;
        for (const w of wrong) { assert.equal(w.replace(/,/g, ''), plain, 'only the comma moves'); assert.notEqual(w, plain, 'the no-comma sentence (accepted) is never a wrong option'); assert.notEqual(w.indexOf(','), right.indexOf(',')); }
      }
      if (id === 'your-and-youre') assert.notEqual(wrong[0].toLowerCase(), right.toLowerCase());
      if (id === 'using-simple-tenses') {
        // The forms by time: today -> -s (a he, she, it or name subject), yesterday -> past, will -> base.
        const before = it.text.split('___')[0];
        const ok = /will $/.test(before) ? (w => !/s$|ed$/.test(w) && !['drew', 'flew', 'ate', 'sang', 'rode'].includes(w)) : /^Yesterday/.test(before) ? (w => /ed$/.test(w) || ['drew', 'flew', 'ate', 'sang', 'rode'].includes(w)) : (w => /s$/.test(w));
        assert.ok(ok(right), `${it.id}: "${right}" is right for its time`);
        for (const w of wrong) assert.ok(!ok(w), `${it.id}: "${w}" is wrong for its time`);
      }
    }
  }
  assert.equal(count, 12 + 24 + 24 + 24);
  // A bad wrong option fails: the sentence with no comma (accepted), a title that follows the rules, a right tense form.
  const intro = structuredClone(GL.topic('commas-after-starting-phrases'));
  intro.items[0].options[intro.items[0].options.findIndex((_, i) => i !== intro.items[0].answer[0])] = intro.items[0].text;
  assert.ok(B.checkOptions(intro).some(p => /no comma is accepted/.test(p)));
  const titles = structuredClone(GL.topic('capitalizing-titles'));
  titles.items[0].options[titles.items[0].options.findIndex((_, i) => i !== titles.items[0].answer[0])] = 'The Brave Little Fox';
  assert.ok(B.checkOptions(titles).length >= 1);
  // The build refuses a made-up past ("drawed") and an answer the tense rules do not make.
  const plan = { bands: [{ id: 'k-2', pathways: ['p'] }], pathways: { p: { title: 'P', parts: [{ topics: ['x'] }] } }, topics: { x: { source: { band: 'k-2', title: 'X' }, format: 'choice', choices: { kind: 'tense' }, ask: 'Choose.' } } };
  const card = '**Teaching Card**\n- Definition: Verbs.\n- Worked example: "Today Sam walks." Walks is now.\n- How it works: Time words.\n- Tip box: "Today Ana sings."\n\n**Quiz**\n';
  const items = Array.from({ length: 12 }, (_, i) => `${i + 1}. "Yesterday, Ana ___ (walk) home." Answer: walked. Hint: Yesterday means past.`);
  const md = lines => `# Grammar Lab, K-2 Lessons\n\n## Pathway 1: P (1 topic)\n\n### Topic: X\n\n${card}${lines.join('\n')}\n`;
  assert.deepEqual(B.buildTopics(md(items), plan).problems, []);
  const bad = [...items]; bad[0] = '1. "Yesterday, Ana ___ (hold) a cup." Answer: holded. Hint: Yesterday means past.';
  bad[1] = '2. "Yesterday, Ana ___ (walk) home." Answer: walks. Hint: Yesterday means past.';
  bad[2] = '3. "Yesterday, Ana ___ (walk) home." Answer: walked. Hint: Use walked.';
  const { problems } = B.buildTopics(md(bad), plan);
  assert.ok(problems.some(p => /item 1: the rules make "held"/.test(p)), problems.join('\n'));
  assert.ok(problems.some(p => /item 2: the rules make "walked" for past, not the answer "walks"/.test(p)));
  assert.ok(problems.some(p => /item 3: the hint names the answer/.test(p)));
});

// ------------------------------------------------------------------------------------------------- grading the new formats
test('server grading: click-to-fix capitals, comma gaps (the last list comma optional, too many a near miss), choices; no answer reaches the page', async () => {
  const kid = newKid();
  // Click-to-fix: tap the word that needs a capital.
  let r = await post(`${API('capitalizing-names-and-dates')}/start`, kid, { unit: 'capital-letters' });
  assert.equal(r.json.question.kind, 'tap'); assert.equal(r.json.question.ask, 'Tap the word that needs a capital letter.');
  assert.doesNotMatch(JSON.stringify(r.json), /"answer"|"fixed"|"right"/);
  let it = itemOf('capitalizing-names-and-dates', r.json.question.id);
  assert.equal(GL.grade(it, it.answer, 'tap'), 'right');
  assert.equal(GL.grade(it, [0], 'tap'), it.answer.includes(0) ? 'right' : 'wrong');
  // Gaps.
  const series = GL.topic('commas-in-a-series').items[0];   // My bag has a book a pencil and a snack.
  assert.equal(GL.grade(series, [4, 6], 'gaps'), 'right', 'with the last comma');
  assert.equal(GL.grade(series, [4], 'gaps'), 'right', 'without it: also a valid fix');
  assert.equal(GL.grade(series, [6], 'gaps'), 'wrong', 'the needed comma missing');
  assert.equal(GL.grade(series, [3, 4], 'gaps'), 'wrong', 'a comma in a wrong place');
  assert.equal(GL.grade(series, [2, 4, 6], 'gaps'), 'near', 'too many commas');
  for (const bad of [[], [9], [-1], [1.5], [4, 4], 'x']) assert.equal(GL.grade(series, bad, 'gaps'), null, JSON.stringify(bad));
  r = await post(`${API('commas-in-a-series')}/start`, kid, { unit: 'commas' });
  assert.equal(r.json.question.kind, 'gaps');
  assert.doesNotMatch(JSON.stringify(r.json), /"answer"|"optional"|"right"/);
  // Choices: the options in a fixed order, which is right never said.
  r = await post(`${API('your-and-youre')}/start`, kid, { unit: 'sound-alike-words' });
  const qn = r.json.question;
  assert.equal(qn.kind, 'choice'); assert.equal(qn.options.length, 2); assert.ok('before' in qn && 'after' in qn);
  assert.deepEqual(Object.keys(qn).sort(), ['after', 'ask', 'before', 'id', 'italic', 'kind', 'n', 'options', 'whole']);
  it = itemOf('your-and-youre', qn.id);
  for (const bad of [[], [2], [0, 1], ['0']]) assert.equal((await post(`${API('your-and-youre')}/answer`, kid, { unit: 'sound-alike-words', id: qn.id, marked: bad })).status, 400, JSON.stringify(bad));
  r = await post(`${API('your-and-youre')}/answer`, kid, { unit: 'sound-alike-words', id: qn.id, marked: [1 - it.answer[0]] });
  assert.equal(r.json.kind, 'wrong'); assert.equal(r.json.summary.total, 13); assert.equal(r.json.hint, it.hint);
  r = await post(`${API('your-and-youre')}/answer`, kid, { unit: 'sound-alike-words', id: qn.id, marked: it.answer });
  assert.equal(r.json.kind, 'fixed');
  // The whole-sentence choice and the title choice (italic); each opens once the topic before it is mastered.
  assert.equal((await post(`${API('commas-after-starting-phrases')}/start`, kid, { unit: 'commas' })).status, 403);
  master(kid, 'commas-in-a-series');
  r = await post(`${API('commas-after-starting-phrases')}/start`, kid, { unit: 'commas' });
  assert.equal(r.json.question.whole, true); assert.equal(r.json.question.options.length, 3);
  const titleKid = newKid(); master(titleKid, 'capitalizing-names-and-dates');
  r = await post(`${API('capitalizing-titles')}/start`, titleKid, { unit: 'capital-letters' });
  assert.equal(r.json.question.italic, true);
  // Each new format plays to mastery on the server, one wrong answer on the way.
  for (const [unit, topic] of [['capital-letters', 'capitalizing-titles'], ['commas', 'commas-in-a-series'], ['verbs-and-time', 'using-simple-tenses']]) {
    const u = newKid(); master(u, 'capitalizing-names-and-dates'); master(u, 'identifying-action-verbs');
    const last = await playTopic(u, unit, topic, { wrongFirst: true });
    assert.equal(last.closing.answered, 13);
    assert.ok(GL.masteredSet(u).has(topic));
    // Look back lists the right sentences.
    const back = await get(`/courses/grammar-lab/k-2/${unit}/${topic}/review`, u);
    assert.equal((back.text.match(/<li class="gl-(ok|fixed)">/g) || []).length, 13, topic);
  }
});

// ------------------------------------------------------------------------------------------------- sharing, locks, rings, next
test('a shared topic mastered once shows mastered in every unit at once, opens what follows, and fills both rings', async () => {
  const kid = newKid();
  let page = await get('/courses/grammar-lab/k-2/verbs-and-time', kid);
  assert.match(page.text, /class="gl-tile gl-locked" id="gl-topic-using-simple-tenses"/, 'locked until Action Verbs is mastered');
  assert.equal((await post(`${API('using-simple-tenses')}/start`, kid, { unit: 'verbs-and-time' })).status, 403);
  assert.equal((await get('/courses/grammar-lab/k-2/verbs-and-time/using-simple-tenses', kid)).status, 302);
  // Mastered through Kinds of Words...
  master(kid, 'identifying-common-nouns');
  await playTopic(kid, 'kinds-of-words', 'identifying-action-verbs');
  // ...it is mastered in Verbs and Time too, and the next topic there is open.
  page = await get('/courses/grammar-lab/k-2/verbs-and-time', kid);
  assert.match(page.text, /class="gl-tile gl-mastered" id="gl-topic-identifying-action-verbs"/);
  assert.match(page.text, /class="gl-tile gl-new" id="gl-topic-using-simple-tenses"/);
  assert.match(page.text, /aria-label="1 of 2 topics mastered"/);
  assert.match(page.text, /<h2 class="gl-part-h" lang="en" dir="ltr">Past, Present, and Future<\/h2>/);
  assert.equal((await post(`${API('using-simple-tenses')}/start`, kid, { unit: 'verbs-and-time' })).status, 200);
  const course = await get('/courses/grammar-lab', kid);
  assert.match(course.text, /id="gl-unit-kinds-of-words">\s*<span class="gl-ring" role="img" aria-label="2 of 3 topics mastered"/);
  assert.match(course.text, /id="gl-unit-verbs-and-time">\s*<span class="gl-ring" role="img" aria-label="1 of 2 topics mastered"/);
  // Adjectives, shared by Adjectives and Adverbs and Kinds of Words: open in Kinds of Words now, mastered in both at once.
  master(kid, 'identifying-adjectives');
  for (const p of ['adjectives-and-adverbs', 'kinds-of-words']) assert.equal(GL.unitStates(kid, GL.pathway(p)).find(s => s.topic.id === 'identifying-adjectives').mastered, true, p);
  assert.deepEqual(GL.unitProgress(kid, GL.pathway('kinds-of-words')), { done: 3, total: 3 });
  assert.deepEqual(GL.unitProgress(kid, GL.pathway('adjectives-and-adverbs')), { done: 1, total: 1 });
});

test('locks within a unit; rings from live states; the next topic is worked out live and is never a mastered one', async () => {
  const kid = newKid();
  const cap = GL.pathway('capital-letters');
  assert.deepEqual(GL.unitStates(kid, cap).map(s => [s.topic.id, s.open, s.part]), [['capitalizing-names-and-dates', true, 'Names and Dates'], ['capitalizing-titles', false, 'Titles']]);
  assert.deepEqual(GL.unitProgress(kid, cap), { done: 0, total: 2 });
  // The next topic: the first open one in this unit, else the band's next unit.
  assert.equal(GL.nextTopic(kid, cap).topic.id, 'capitalizing-names-and-dates');
  assert.equal(GL.nextTopic(kid, cap, 'capitalizing-names-and-dates').topic.id, 'identifying-adjectives', 'Titles is locked: the band\'s first open topic');
  master(kid, 'capitalizing-names-and-dates');
  assert.equal(GL.unitStates(kid, cap)[1].open, true);
  assert.deepEqual(GL.unitProgress(kid, cap), { done: 1, total: 2 });
  assert.equal(GL.nextTopic(kid, cap).topic.id, 'capitalizing-titles');
  // Mastering the last of the unit: the suggestion moves to another unit, never back to a mastered topic.
  const last = await playTopic(kid, 'capital-letters', 'capitalizing-titles');
  assert.equal(last.closing.next.href, '/courses/grammar-lab/k-2/adjectives-and-adverbs/identifying-adjectives');
  master(kid, 'identifying-adjectives');
  const nxt = GL.nextTopic(kid, cap);
  assert.equal(nxt.topic.id, 'commas-in-a-series'); assert.equal(nxt.unit.id, 'commas');
  // Every K-2 topic mastered: there is no next topic, and no suggestion on the mastery screen.
  for (const id of Object.keys(PLAN.topics)) master(kid, id);
  assert.equal(GL.nextTopic(kid, cap), null);
  for (const p of GL.pathwaysOf('k-2')) assert.deepEqual(GL.unitProgress(kid, p), { done: p.topics.length, total: p.topics.length }, p.id);
  // The platform admin may open a locked topic (and still has to earn it).
  const boss = newKid('k2boss'); q.run("UPDATE users SET role='admin' WHERE id=?", boss.id);
  assert.equal(GL.unitStates({ ...boss, role: 'admin' }, cap)[1].open, true);
  assert.equal(GL.masteredSet(boss).size, 0);
});

test('checkpoint and review marks show on their tiles where a unit has them (K-2 has none)', () => {
  const t = tFor('en');
  const p = { ...GL.pathway('capital-letters'), marks: { 'capitalizing-titles': 'review' } };
  const states = GL.unitStates(null, p);
  assert.equal(states[1].mark, 'review');
  const out = String(V.unitPage({ t, p, states, guest: false }));
  assert.match(out, /id="gl-topic-capitalizing-titles">[\s\S]*?<span class="gl-badge gl-badge-review">Review<\/span>/);
  assert.doesNotMatch(String(V.unitPage({ t, p: GL.pathway('capital-letters'), states: GL.unitStates(null, GL.pathway('capital-letters')), guest: false })), /gl-badge-(review|checkpoint)/);
  assert.ok(GL.pathwaysOf('k-2').every(x => !Object.keys(x.marks).length));
});

// ------------------------------------------------------------------------------------------------- Mistake Hunt rooms
test('rooms: planted at build time by Mistake Hunt\'s planter with only the topic\'s kinds and a fixed seed', () => {
  const P = proofCore();
  for (const [id, kinds] of [['capitalizing-names-and-dates', ['pc-proper']], ['capitalizing-titles', ['pc-proper']], ['commas-in-a-series', ['pc-series']], ['your-and-youre', ['us-your']]]) {
    const r = GL.room(id);
    assert.ok(r, id); assert.deepEqual(r.kinds, kinds);
    const p = r.passages[0];
    assert.ok(p.m.length >= 3 && p.m.length <= 5, `${id}: ${p.m.length} mistakes`);
    assert.ok(p.m.every(m => kinds.includes(m.k)), `${id}: only its kinds`);
    assert.equal(r.need, Math.ceil(0.8 * p.m.length));
    // the passage is the topic's own right sentences
    const rights = new Set(GL.topic(id).items.map(it => it.right || it.text));
    const sents = p.x.match(/[^.!?]+[.!?]/g).map(s => s.trim());
    assert.ok(sents.every(s => [...rights].some(x => x.includes(s))), `${id}: its own sentences`);
    // the same text, kinds and seed plant the same mistakes
    const again = []; assert.deepEqual(JSON.parse(JSON.stringify(B.buildRoom(GL.topic(id), PLAN.topics[id], again).passages[0].m)), p.m); assert.deepEqual(again, []);
  }
  // Titles: a capital is planted only inside a title, never on a person's name.
  const t = GL.room('capitalizing-titles').passages[0];
  const toks = P.tokenize(t.x);
  assert.ok(t.m.every(m => !['Ana', 'Leo', 'Sam'].includes(toks[m.a].s)));
  // No room where the content review's defaults would make a planted mistake a valid choice (a comma after a short
  // starting phrase is accepted with or without), nor for the identify topics.
  for (const id of ['commas-after-starting-phrases', 'identifying-adjectives', 'identifying-common-nouns', 'identifying-action-verbs', 'using-simple-tenses']) assert.equal(GL.room(id), null, id);
});

test('a room counts only through the server check (about 80% found), never the game\'s own "won"; opened from the game with ?glroom=', async () => {
  const P = proofCore();
  const kid = newKid();
  const id = 'your-and-youre', unit = 'sound-alike-words';
  const r = GL.room(id), p = r.passages[0];
  // The unit's menu links the room; the play page opens Mistake Hunt in its hand-in mode for Grammar Lab.
  const unitPage = await get(`/courses/grammar-lab/k-2/${unit}`, kid);
  assert.match(unitPage.text, /href="\/play\/mistake-hunt\?glroom=your-and-youre&amp;unit=sound-alike-words">Proofread room</);
  const play = await get(`/play/mistake-hunt?glroom=${id}&unit=${unit}`, kid);
  assert.equal(play.status, 200);
  assert.match(play.text, /"glRoom":\{"topic":"your-and-youre","unit":"sound-alike-words"\}/);
  assert.match(play.text, /"backHref":"\/courses\/grammar-lab\/k-2\/sound-alike-words#gl-topic-your-and-youre"/);
  // The frame gets the room in the game's hand-in mode (BRB.proofStep): the words students see, never the key.
  const frame = await get(/data-src="(\/frame\/[^"]+?)"/.exec(play.text)[1].replace(/&amp;/g, '&'), kid);
  const init = JSON.parse(/window\.__BRB_INIT__=(\{.*?\});<\/script>/.exec(frame.text)[1]);
  assert.equal(init.proofStep.passages.length, 1); assert.equal(init.proofStep.hints, true); assert.equal(init.proofStep.key, undefined);
  assert.equal(init.proofStep.passages[0].w.map(x => x[0] + x[1]).join(''), P.wrongText(p.x, p.m), 'the passage with its mistakes in it');
  // A topic still locked, a topic of another unit, or the flag off: the game as usual, no room.
  const locked = await get('/play/mistake-hunt?glroom=capitalizing-titles&unit=capital-letters', kid);
  assert.doesNotMatch(locked.text, /"glRoom"/);
  assert.doesNotMatch((await get(`/play/mistake-hunt?glroom=${id}&unit=commas`, kid)).text, /"glRoom"/);
  config.grammarLab = false;
  try { assert.doesNotMatch((await get(`/play/mistake-hunt?glroom=${id}&unit=${unit}`, kid)).text, /"glRoom"/); } finally { config.grammarLab = true; }
  // What the game gets: the words students see, never the key before handing in.
  const v = GL.roomOpen(kid, id);
  assert.equal(v.passages.length, 1); assert.equal(v.total, p.m.length); assert.ok(!v.key); assert.equal(v.glRoom.need, r.need);
  assert.doesNotMatch(JSON.stringify(v), new RegExp(p.x.slice(0, 30).replace(/[.?*+^$()[\]{}|\\]/g, '\\$&')));
  // Fix all but two, hand in: under the need, not passed (whatever the game's own end screen says).
  const W = P.wrongTokens(p.x, p.m), toks = P.tokenize(p.x);
  const fixes = p.m.map((m, j) => { const a = W.findIndex(w => w.m === j); return { a, b: a + m.w.split(' ').length, s: toks.slice(m.a, m.b).map(x => x.s).join(' ') }; });
  let res = await post(`${API(id)}/room`, kid, { unit, edits: [fixes.slice(0, p.m.length - 2)] });
  assert.equal(res.status, 200); assert.equal(res.json.view.handedIn, false);
  res = await post(`${API(id)}/room`, kid, { unit, edits: [fixes.slice(0, p.m.length - 2)], hint: 0 });
  assert.ok(res.json.hint && res.json.hint.k === 'us-your', 'a hint names the kind, never the fix');
  res = await post(`${API(id)}/room`, kid, { unit, edits: [fixes.slice(0, p.m.length - 2)], handIn: true });
  assert.equal(res.json.passed, false); assert.equal(res.json.view.found, p.m.length - 2); assert.ok(res.json.view.key, 'the key opens once handed in');
  assert.equal(GL.roomPassedSet(kid).has(id), false);
  assert.equal((await post(`${API(id)}/room`, kid, { unit, edits: [fixes], handIn: true })).status, 409, 'a try handed in is final');
  // Opening the room again starts a new try; finding at least the need passes it.
  GL.roomOpen(kid, id);
  res = await post(`${API(id)}/room`, kid, { unit, edits: [fixes.slice(0, r.need)], handIn: true });
  assert.equal(res.json.passed, true);
  assert.ok(GL.roomPassedSet(kid).has(id));
  // The room is its own mark: it does not master the topic or move the ring.
  assert.equal(GL.masteredSet(kid).has(id), false);
  const after = await get(`/courses/grammar-lab/k-2/${unit}`, kid);
  assert.match(after.text, /gl-badge gl-badge-room">Proofread room done</);
  assert.match(after.text, /aria-label="0 of 1 topics mastered"/);
  // Bad fixes change nothing.
  assert.equal((await post(`${API(id)}/room`, kid, { unit, edits: 'x' })).status, 409);
  GL.roomOpen(kid, id);
  assert.equal((await post(`${API(id)}/room`, kid, { unit, edits: [[{ a: 0, b: 99, s: 'x' }]] })).status, 400);
  assert.equal((await post(`${API('identifying-adjectives')}/room`, kid, { unit: 'adjectives-and-adverbs', edits: [[]] })).status, 404, 'no room for that topic');
});
