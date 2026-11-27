// Grammar Lab, Phase 1 (services/grammar-lab*.js, routes/grammar-lab.js, scripts/grammar-lab-build.js): the flag and
// its list (off: a 404 for everyone, the admin included; on: the admin and the listed accounts, '*' for everyone, and
// through the COURSES gate), the parser on the K-2 Identifying Adjectives topic, the mastery rule (12 questions, a
// wrong answer adds one, a near miss counts nothing, the counter and the bar), grading on the server (no answer ever
// reaches the page), completion only by mastering, and a guest's pending win honored at sign-in.
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
const M = await import('../../server/services/grammar-lab-mastery.js');
const B = await import('../../scripts/grammar-lab-build.js');
const C = await import('../../server/services/courses.js');
const { tokenize } = await import('../../server/services/grammar-lab-text.js');
const { TTS_ALL_LOCALES } = await import('../../server/config.js');
const V = await import('../../server/services/tts-voices.js');

const ROOT = path.resolve(import.meta.dirname, '../..');
let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
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
const newKid = (name = 'kid') => auth.createUser({ username: `${name}${Date.now() % 1e6}x${++n}`, password: 'correct-horse-12', displayName: 'Kid' });
const admin = (() => { const u = newKid('boss'); q.run("UPDATE users SET role='admin' WHERE id=?", u.id); return auth.getUserByName ? auth.getUserByName(u.username) : { ...u, role: 'admin' }; })();
const TOPIC = 'identifying-adjectives', UNIT = 'adjectives-and-adverbs';
const PAGES = ['/courses/grammar-lab', `/courses/grammar-lab/k-2/${UNIT}`, `/courses/grammar-lab/k-2/${UNIT}/${TOPIC}`, `/courses/grammar-lab/k-2/${UNIT}/${TOPIC}/card`, `/courses/grammar-lab/k-2/${UNIT}/${TOPIC}/review`];
const API = `/api/courses/grammar-lab/topic/${TOPIC}`;
const flag = (on, users = []) => { config.grammarLab = on; config.grammarLabUsers = users.map(x => x.toLowerCase()); };
const tp = () => GL.topic(TOPIC);
/** The right word places for the question on screen (the test reads the data; the page never gets it). */
const rightFor = qn => tp().items.find(it => it.id === qn.id).answer;
const wrongFor = qn => { const a = rightFor(qn); return [qn.words.findIndex((_, i) => !a.includes(i))]; };
const tooMany = qn => { const a = rightFor(qn); return [...a, qn.words.findIndex((_, i) => !a.includes(i))].sort((x, y) => x - y); };

// ------------------------------------------------------------------------------------------------- the flag
test('flag off: every Grammar Lab page, API and read-aloud is a 404 for everyone, the admin included', async () => {
  flag(false, ['*']);
  const kid = newKid();
  for (const u of [null, kid, admin]) {
    for (const p of PAGES) assert.equal((await get(p, u)).status, 404, `${p} for ${u ? u.username : 'nobody'}`);
    const r = await post(`${API}/start`, u, { unit: UNIT });
    assert.equal(r.status, 404, 'start API'); assert.ok(r.json && r.json.error);
    assert.equal((await post(`${API}/answer`, u, { unit: UNIT, id: 'x', marked: [0] })).status, 404, 'answer API');
  }
  assert.equal((await post('/api/tts', admin, { ctx: 'grammar', topic: TOPIC, check: true })).status, 404, 'read-aloud');
  // Nothing on the site names it.
  for (const p of ['/', '/learn', '/sitemap.xml']) assert.doesNotMatch((await get(p, admin)).text, /grammar-lab|Grammar Lab/, p);
});

test('flag on: the admin and the listed accounts get in, through the COURSES gate too; others and guests get the 404', async () => {
  const listed = newKid('listed'), other = newKid('other');
  flag(true, [listed.username]);
  for (const courses of [true, false]) {
    config.courses = courses;
    for (const u of [admin, listed]) for (const p of PAGES.slice(0, 4)) assert.equal((await get(p, u)).status, 200, `${p} for ${u.username}, COURSES ${courses}`);
    for (const u of [null, other]) for (const p of PAGES) assert.equal((await get(p, u)).status, 404, `${p} for ${u ? 'other' : 'nobody'}, COURSES ${courses}`);
    assert.equal((await post(`${API}/start`, other, { unit: UNIT })).status, 404);
    // The other courses stay behind COURSES as before.
    assert.equal((await get('/courses/cs-quest', listed)).status, courses ? 200 : 404);
  }
  config.courses = true;
  // '*' opens it to every visitor, a visitor with no session and a guest included.
  flag(true, ['*']);
  assert.equal((await get('/courses/grammar-lab', null)).status, 200);
  assert.equal((await get('/courses/grammar-lab', other)).status, 200);
  // Open to all, it is listed like a course (the owner, 27 Nov 2026; services/grammar-lab-listing.js): on Learn, in
  // search and in the sitemap, signed out too. Restricted to testers, never on those pages for a visitor without a session.
  for (const p of ['/learn', '/sitemap.xml', '/search?q=grammar']) assert.match((await get(p, null)).text, /courses\/grammar-lab/, p);
  flag(true, [listed.username]);
  for (const p of ['/learn', '/sitemap.xml', '/search?q=grammar']) assert.doesNotMatch((await get(p, null)).text, /courses\/grammar-lab/, p);
});

// ------------------------------------------------------------------------------------------------- the parser
test('the parser: the K-2 Identifying Adjectives topic from the reviewed course, its card and its 12 items', () => {
  const md = fs.readFileSync(path.join(ROOT, 'seed-lessons/grammar-lab/source/course.md'), 'utf8');
  const plan = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons/grammar-lab/pathways.json'), 'utf8'));
  const overrides = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons/grammar-lab/overrides.json'), 'utf8'));
  const { topics, problems } = B.buildTopics(md, plan, overrides);
  assert.deepEqual(problems, []);
  const t = topics[TOPIC];
  assert.equal(t.title, 'Identifying Adjectives'); assert.equal(t.band, 'k-2'); assert.equal(t.format, 'tap'); assert.deepEqual(t.levels, [4, 4, 4]);
  assert.match(t.card.definition, /^An adjective is a word that tells about a noun/);
  assert.equal(t.card.example.text, 'The fluffy kitten slept in the basket.');
  assert.deepEqual(t.card.example.marks, [{ i: 1, role: 'adjective' }, { i: 2, role: 'noun' }]);
  assert.equal(t.card.how, 'Fluffy tells what kind of kitten it is.');
  assert.deepEqual(t.card.tips.map(x => x.text), ['The yellow bus.', 'Five birds.']);
  assert.deepEqual(t.card.tips[1].marks, [{ i: 0, role: 'adjective' }, { i: 1, role: 'noun' }]);
  assert.equal(t.items.length, 12);
  // The reviewed content, not worked example A of the prompt.
  assert.equal(t.items[0].text, 'The round ball rolled down the hill.');
  assert.ok(!t.items.some(it => /tall tree/.test(it.text)));
  const answers = t.items.map(it => it.answer.map(i => tokenize(it.text)[i].t).join(' '));
  assert.deepEqual(answers, ['round', 'purple', 'sleepy', 'sweet', 'long', 'tiny', 'brave', 'muddy', 'Three', 'hot', 'gentle', 'spotted']);
  for (const it of t.items) assert.ok(!new RegExp(`\\b${tokenize(it.text)[it.answer[0]].t}\\b`, 'i').test(it.hint), `${it.id}: the hint does not name the answer`);
  // The committed topics.json is what the build makes now.
  assert.equal(fs.readFileSync(B.OUT, 'utf8'), B.serialize(B.build()));
});

test('the parser fails loudly: an answer not in its sentence, a hint naming its answer, a dash, a coinage, a format not built', () => {
  const plan = { bands: [{ id: 'k-2', pathways: ['p'] }], pathways: { p: { title: 'P', parts: [{ topics: ['x'] }] } }, topics: { x: { source: { band: 'k-2', title: 'X' }, format: 'tap', ask: 'Tap it.' } } };
  const card = '**Teaching Card**\n- Definition: A word.\n- Worked example: "The red hat." Red is the adjective. Hat is the noun it tells about.\n- How it works: Red tells the color.\n- Tip box: "A big dog." Big tells about dog.\n\n**Quiz**\n';
  const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(i => `${i}. "The red hat ${i}." Answer: red. Hint: Look for the color word.`);
  const md = lines => `# Grammar Lab, K-2 Lessons\n\n## Pathway 1: P (1 topic)\n\n### Topic: X\n\n${card}${lines.join('\n')}\n`;
  assert.deepEqual(B.buildTopics(md(items), plan).problems, []);
  const bad = [...items]; bad[0] = '1. "The blue hat." Answer: red. Hint: Look for the color word.';
  bad[1] = '2. "The red hat." Answer: red. Hint: Red is the color word.';
  bad[2] = '3. "The red hat \u2014 big." Answer: red. Hint: Look.';
  bad[3] = '4. "The red hat." Answer: red. Hint: Like THAMOs.';
  const { problems } = B.buildTopics(md(bad), plan);
  assert.ok(problems.some(p => /item 1: the answer "red" is in its sentence 0 times/.test(p)), problems.join('\n'));
  assert.ok(problems.some(p => /item 2: the hint names the answer/.test(p)));
  assert.ok(problems.some(p => /em or en dash/.test(p)));
  assert.ok(problems.some(p => /reference product/.test(p)));
  assert.ok(B.buildTopics(md(items.slice(0, 11)), plan).problems.some(p => /11 quiz items/.test(p)));
  assert.ok(B.buildTopics(md(items), { ...plan, topics: { x: { ...plan.topics.x, format: 'drag' } } }).problems.some(p => /format "drag" is not built yet/.test(p)));
});

test('the parser: a fix example is a before and an after; every mark on the after, a title\'s small words "stays small"', () => {
  const card = (worked, tip, format = 'choice') => {
    const problems = [];
    const lines = [`Definition: A rule.`, `Worked example: ${worked}`, `How it works: The rule.`, `Tip box: ${tip}`].map((text, line) => ({ text, line }));
    return { c: B.parseCard(lines, problems, 'x', format), problems };
  };
  const at = u => u.then.marks.map(m => `${tokenize(u.then.text)[m.i].t}:${m.role}`);
  // the note says so: the title, the correct sentence, with commas, fix it, fixed, the fix is
  let { c, problems } = card('We watched "the bear and the bees." The title is "The Bear and the Bees."', '"Sam walked and buys lunch." Walked is past. Fix it: "Sam walked and bought lunch."');
  assert.deepEqual(problems, []);
  assert.ok(c.example.fix); assert.deepEqual(c.example.marks, []);
  assert.deepEqual(at(c.example), ['The:capital', 'Bear:capital', 'and:small', 'the:small', 'Bees:capital']);
  assert.ok(c.tips[0].fix);
  // a sentence that differs by capitals only: a fix, and a word that loses its capital is "small letter"
  ({ c } = card('"we swim every Summer." It becomes "We swim every summer."', '"Winter is here." stays as it is.'));
  assert.deepEqual(at(c.example), ['We:capital', 'summer:lower']);
  // "becomes" alone is a fix only on a card whose worked example is one
  ({ c } = card('Passive: "The cake was baked by Sam." Active: "Sam baked the cake."', '"The fence was painted by Ana." becomes "Ana painted the fence."'));
  assert.ok(!c.example.fix && !c.tips[0].fix);
  ({ c } = card('"The bell rang, we left." The fix is "The bell rang, so we left."', '"Ana gave Maya her book." becomes "Ana gave Maya Ana\'s book."'));
  assert.ok(c.example.fix && c.tips[0].fix);
  // two sentences side by side are not a fix: their marks stay where they are
  ({ c } = card('Passive: "The cake was baked by Sam." Active: "Sam baked the cake."', '"After lunch we read." The phrase is "After lunch."'));
  assert.ok(!c.example.fix && !c.tips[0].fix);
  // a title the rules would write another way fails the build
  ({ problems } = card('We read "the big dog." The title is "The big Dog."', '"a cat." The title is "A Cat."'));
  assert.ok(problems.some(p => /is not capitalized by the title rules/.test(p)), problems.join('\n'));
});

// ------------------------------------------------------------------------------------------------- mastery math
const play = (s, results) => results.map(r => M.answer(s, r));
test('mastery: 3 levels of 4 is 12 questions when every answer is right; levels need two in a row', () => {
  const s = M.newRun({ levels: [4, 4, 4], items: 12, seed: 'a' });
  assert.deepEqual([M.summary(s).counter, M.summary(s).total, M.summary(s).level], [1, 12, 1]);
  const out = play(s, Array(12).fill('right'));
  assert.deepEqual(out.map(o => o.levelDone), [null, null, null, 0, null, null, null, 1, null, null, null, 2]);
  assert.equal(out[11].mastered, true); assert.equal(s.mastered, true);
  const sm = M.summary(s);
  assert.deepEqual([sm.counter, sm.total, sm.levelsDone], [12, 12, 3]);
  assert.deepEqual(sm.bar, Array(12).fill('right'));
  // Every item once in a 12-question run.
  assert.equal(new Set(s.history.map(h => h.item)).size, 12);
});

test('mastery: a wrong answer adds one question (once per question), empties the streak; the fix is not counted', () => {
  const s = M.newRun({ levels: [4, 4, 4], items: 12, seed: 'b' });
  M.answer(s, 'right');
  assert.equal(M.summary(s).streak, 1);
  assert.equal(M.answer(s, 'wrong').kind, 'wrong');
  let sm = M.summary(s);
  assert.deepEqual([sm.counter, sm.total, sm.streak, sm.missed], [2, 13, 0, true], 'one more question, streak empty, the question stays');
  assert.equal(M.answer(s, 'wrong').kind, 'again', 'a second miss on the same question');
  sm = M.summary(s);
  assert.deepEqual([sm.counter, sm.total], [2, 13], 'retries never count twice');
  const item = s.cur.item;
  assert.equal(M.answer(s, 'right').kind, 'fixed');
  sm = M.summary(s);
  assert.deepEqual([sm.counter, sm.total, sm.streak], [3, 13, 0], 'the fix moves on, counts nothing toward the streak');
  assert.notEqual(s.cur.item, item);
  assert.deepEqual(sm.bar.slice(0, 3), ['right', 'missed', 'empty'], 'the bar fills on right answers only');
  // Level 1 is now 5 questions: three more right answers finish it (two in a row at the end).
  const out = play(s, ['right', 'right', 'right']);
  assert.equal(out[2].levelDone, 0);
  play(s, Array(8).fill('right'));
  sm = M.summary(s);
  assert.equal(s.mastered, true);
  assert.deepEqual([sm.counter, sm.total], [13, 13]);
  assert.equal(sm.bar.filter(b => b === 'right').length, 12); assert.equal(sm.bar.filter(b => b === 'missed').length, 1);
});

test('mastery: a near miss changes nothing; a level whose last answers are not two in a row gets one more question', () => {
  const s = M.newRun({ levels: [4, 4, 4], items: 12, seed: 'c' });
  const before = JSON.stringify(s);
  assert.equal(M.answer(s, 'near').kind, 'near');
  assert.equal(JSON.stringify(s), before, 'a near miss is not counted');
  // right, right, right, wrong on the level's last question (fixed): one question added, so 5 in the level.
  play(s, ['right', 'right', 'right', 'wrong', 'right']);
  let sm = M.summary(s);
  assert.deepEqual([sm.level, sm.counter, sm.total, sm.streak], [1, 5, 13, 0]);
  assert.equal(M.answer(s, 'right').levelDone, null, 'one right after the miss is not two in a row: one more question');
  sm = M.summary(s);
  assert.deepEqual([sm.level, sm.counter, sm.total, sm.streak], [1, 6, 14, 1]);
  assert.equal(M.answer(s, 'right').levelDone, 0);
  assert.equal(M.summary(s).level, 2); assert.equal(M.summary(s).streak, 0, 'a new level starts with an empty streak');
});

test('mastery: a missed item comes back later as a retry (two questions between), never right after it was missed', () => {
  const s = M.newRun({ levels: [4, 4, 4], items: 12, seed: 'd' });
  const missed = s.cur.item;
  play(s, ['wrong', 'right']);
  assert.notEqual(s.cur.item, missed, 'the next question is a fresh one');
  play(s, ['right', 'right']);
  assert.equal(s.cur.item, missed, 'the 4th question is the missed item again');
  assert.equal(s.cur.retry, true, 'labeled as a retry');
  assert.equal(GL.questionFor({ ...GL.topic(TOPIC) }, { ...s, cur: { ...s.cur, item: 0 } }).again, true, 'the page is told: "Try this one again"');
  play(s, Array(10).fill('right'));
  assert.equal(s.mastered, true);
  // every item once, and the missed one twice: 13 questions
  assert.equal(s.seq.length, 13); assert.equal(new Set(s.seq).size, 12);
});

// ------------------------------------------------------------------------------------------------- server grading
test('grading on the server: the page gets words and the ask, never an answer; right, wrong and near misses; completion only by mastering', async () => {
  flag(true, ['*']);
  const kid = newKid();
  const page = await get(`/courses/grammar-lab/k-2/${UNIT}/${TOPIC}`, kid);
  assert.equal(page.status, 200);
  assert.doesNotMatch(page.text, /"answer"/, 'no answer in the page');
  assert.doesNotMatch(page.text, /Look for the word that tells what shape/, 'no hint before a wrong answer');
  // Opening the topic, its card and its menu completes nothing.
  await get(`/courses/grammar-lab/k-2/${UNIT}/${TOPIC}/card`, kid);
  let r = await post(`${API}/start`, kid, { unit: UNIT });
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.json.question).sort(), ['ask', 'id', 'kind', 'n', 'need', 'words']);
  assert.equal(r.json.question.kind, 'tap');
  assert.equal(r.json.question.ask, 'Tap the adjective.');
  assert.deepEqual([r.json.summary.counter, r.json.summary.total], [1, 12]);
  assert.equal(GL.masteredSet(kid).size, 0);
  let qn = r.json.question;
  // Bad tries change nothing.
  for (const marked of [[], [99], ['1'], [0, 0], 'x']) assert.equal((await post(`${API}/answer`, kid, { unit: UNIT, id: qn.id, marked })).status, 400, JSON.stringify(marked));
  assert.equal((await post(`${API}/answer`, kid, { unit: UNIT, id: 'identifying-adjectives-99', marked: [0] })).status, 409, 'not the question on screen');
  // A near miss: too many words.
  r = await post(`${API}/answer`, kid, { unit: UNIT, id: qn.id, marked: tooMany(qn) });
  assert.equal(r.json.kind, 'near'); assert.equal(r.json.hint, null); assert.equal(r.json.summary.total, 12); assert.equal(r.json.summary.counter, 1);
  assert.doesNotMatch(JSON.stringify(r.json), /"answer"/);
  // A wrong answer: the hint (which never names the answer), one more question, the question stays.
  r = await post(`${API}/answer`, kid, { unit: UNIT, id: qn.id, marked: wrongFor(qn) });
  assert.equal(r.json.kind, 'wrong'); assert.equal(r.json.result, 'wrong');
  assert.equal(r.json.hint, tp().items.find(it => it.id === qn.id).hint);
  assert.equal(r.json.summary.total, 13); assert.equal(r.json.question.id, qn.id);
  assert.doesNotMatch(JSON.stringify(r.json), /"answer"/);
  r = await post(`${API}/answer`, kid, { unit: UNIT, id: qn.id, marked: rightFor(qn) });
  assert.equal(r.json.kind, 'fixed');
  // On to mastery.
  qn = r.json.question;
  let last = null;
  for (let i = 0; i < 40 && !(last && last.mastered); i++) { last = (await post(`${API}/answer`, kid, { unit: UNIT, id: qn.id, marked: rightFor(qn) })).json; qn = last.question; }
  assert.equal(last.mastered, true);
  // The next topic is the unit's next one (K-2 adverbs), worked out now; the counts say 12 plus 1 for the miss, and 12 of
  // the 13 were right on the first try; the topic also counts in Kinds of Words.
  assert.deepEqual(last.closing, { answered: 13, firstTry: 12, of: 13, base: 12, added: 1, also: ['Kinds of Words'],
    next: { title: 'Identifying Adverbs', href: '/courses/grammar-lab/k-2/adjectives-and-adverbs/identifying-adverbs' }, win: 'mastered' });
  assert.ok(GL.masteredSet(kid).has(TOPIC));
  assert.ok(q.get("SELECT completed_at FROM course_progress WHERE user_id=? AND course='grammar-lab' AND step=?", kid.id, TOPIC).completed_at);
  // The unit shows the green check; the menu's three choices are open; look back lists the questions.
  const unit = await get(`/courses/grammar-lab/k-2/${UNIT}`, kid);
  assert.match(unit.text, /class="gl-tile gl-mastered" id="gl-topic-identifying-adjectives"/);
  assert.match(unit.text, /aria-label="1 of 2 topics mastered"/);
  assert.doesNotMatch(unit.text.slice(unit.text.indexOf('id="gl-topic-identifying-adjectives"'), unit.text.indexOf('id="gl-topic-identifying-adverbs"')), /aria-disabled="true">Practice again/);
  const back = await get(`/courses/grammar-lab/k-2/${UNIT}/${TOPIC}/review`, kid);
  assert.equal((back.text.match(/<li class="gl-(ok|fixed)">/g) || []).length, 13);
  // Practicing again starts a fresh run; mastery stays.
  r = await post(`${API}/start`, kid, { unit: UNIT, again: true });
  assert.equal(r.json.summary.counter, 1); assert.ok(GL.masteredSet(kid).has(TOPIC));
});

test('before mastery, only the teaching card is usable in the topic menu', async () => {
  flag(true, ['*']);
  const kid = newKid();
  const unit = await get(`/courses/grammar-lab/k-2/${UNIT}`, kid);
  assert.match(unit.text, /<a class="gl-mi" role="menuitem" href="\/courses\/grammar-lab\/k-2\/adjectives-and-adverbs\/identifying-adjectives\/card">Teaching card<\/a>/);
  assert.match(unit.text, /aria-disabled="true">Practice again/);
  assert.match(unit.text, /aria-disabled="true">Look back at questions/);
  assert.match(unit.text, /aria-label="0 of 2 topics mastered"/);
});

// ------------------------------------------------------------------------------------------------- guests
test('a guest plays to mastery: nothing is stored as progress, a sign-in prompt, and the win is honored at sign-in', async () => {
  flag(true, ['*']);
  // A guest (one tap on Play; a browser opening the topic with no session becomes one too: the browser test covers it).
  const guest = auth.createGuest(), guestId = guest.id, cookie = cookieFor(guest.id);
  assert.equal((await fetch(`${base}/courses/grammar-lab/k-2/${UNIT}/${TOPIC}`, { headers: { ...H, cookie } })).status, 200);
  const gp = async (p, body) => (await fetch(base + p, { method: 'POST', headers: { ...H, cookie, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
  let r = await gp(`${API}/start`, { unit: UNIT });
  let qn = r.question, last = null;
  for (let i = 0; i < 20 && !(last && last.mastered); i++) { last = await gp(`${API}/answer`, { unit: UNIT, id: qn.id, marked: rightFor(qn) }); qn = last.question; }
  assert.equal(last.mastered, true); assert.equal(last.closing.win, 'pending'); assert.equal(last.closing.answered, 12);
  assert.equal(q.get("SELECT COUNT(*) n FROM course_progress WHERE user_id=? AND course='grammar-lab'", guestId).n, 0, 'no progress for a guest');
  assert.ok(q.get("SELECT 1 FROM course_pending_wins WHERE user_id=? AND course='grammar-lab' AND step=? AND kind='win'", guestId, TOPIC));
  const unit = await (await fetch(`${base}/courses/grammar-lab/k-2/${UNIT}`, { headers: { ...H, cookie } })).text();
  assert.match(unit, /class="gl-guest"/); assert.match(unit, /href="\/signup\?next=/); assert.match(unit, /gl-tile gl-pending/);
  assert.doesNotMatch(unit, /gl-tile gl-mastered/);
  // Signing in to an existing account hands the win over (routes/auth.js transferPendingWins), and the next Grammar Lab
  // page honors it (services/courses.js applyPendingWins, through Grammar Lab's handler).
  const kid = newKid('signin');
  C.transferPendingWins(guestId, kid.id);
  assert.equal(GL.masteredSet(kid).size, 0);
  const after = await get(`/courses/grammar-lab/k-2/${UNIT}`, kid);
  assert.match(after.text, /gl-tile gl-mastered/);
  assert.ok(GL.masteredSet(kid).has(TOPIC));
  assert.equal(q.get("SELECT COUNT(*) n FROM course_pending_wins WHERE user_id=?", kid.id).n, 0);
  // A guest who signs up keeps the same row: their win is honored the same way.
  const g2 = auth.createGuest();
  C.stashPendingFact(g2, { slug: 'grammar-lab' }, { key: TOPIC }, 'win');
  q.run('UPDATE users SET is_guest=0 WHERE id=?', g2.id);
  assert.deepEqual(C.applyPendingWins({ ...g2, is_guest: 0 }), [{ course: 'grammar-lab', step: TOPIC, via: 'win' }]);
  assert.ok(GL.masteredSet({ ...g2, is_guest: 0 }).has(TOPIC));
});

test('read-aloud: the K-2 card through the shared speak path, by topic id only; the grade store runs to 12', async () => {
  flag(true, ['*']);
  const text = GL.cardSpoken(tp());
  assert.match(text, /^An adjective is a word that tells about a noun\..+The fluffy kitten slept in the basket\..+Five tells how many birds\.$/);
  assert.equal(GL.readsAloud(tp()), true);
  // The voice stays silent unless voices are on (they are off in unit tests).
  assert.equal((await post('/api/tts', admin, { ctx: 'grammar', topic: TOPIC, check: true })).status, 404);
  // With the English voice switched on at /admin/voices (the test-only provider): the card would be read.
  config.ttsEnabled = true; config.ttsProvider = 'mock'; config.ttsApiKey = ''; config.ttsLocales = [...TTS_ALL_LOCALES];
  V.save(null, { locales: Object.fromEntries(TTS_ALL_LOCALES.map(l => [l, { on: l === 'en' }])) });
  try {
    assert.equal((await post('/api/tts', admin, { ctx: 'grammar', topic: TOPIC, check: true })).status, 200);
    assert.equal((await post('/api/tts', admin, { ctx: 'grammar', topic: 'nope', check: true })).status, 404);
    flag(false, ['*']);
    assert.equal((await post('/api/tts', admin, { ctx: 'grammar', topic: TOPIC, check: true })).status, 404, 'the kill switch silences it');
    flag(true, ['*']);
    V.save(null, { locales: Object.fromEntries(TTS_ALL_LOCALES.map(l => [l, { on: false }])) });
    assert.equal((await post('/api/tts', admin, { ctx: 'grammar', topic: TOPIC, check: true })).status, 404, 'silent with the English switch off');
  } finally { config.ttsEnabled = false; config.ttsProvider = 'openai'; }
  assert.equal(GL.deriveGrade(11, Date.UTC(2025, 5, 1), Date.UTC(2026, 9, 1)), 12);
  assert.equal(GL.deriveGrade(12, Date.UTC(2024, 5, 1), Date.UTC(2026, 9, 1)), 12, 'capped at 12');
  assert.equal(GL.deriveGrade('K', Date.UTC(2025, 5, 1), Date.UTC(2026, 9, 1)), 2);
});
