// Grammar Lab: the owner's review fixes (desktop and phone playthroughs, 2026-11-27) and the two adverb topics, on the
// server. The intro says the real rule and the counts on every topic; the K-2 card's "Yellow tells about the bus."; no
// item is ever shown twice except a missed one coming back labeled "Try this one again" (many seeded runs), spread out
// and never right after its miss; the first-try line; partial progress (a topic's level, a unit's and a band's counts);
// locks in order in every unit of every band, and "Also counts in" on a shared topic; a failed try re-syncs (a stale
// page, a run finished on another device, a topic whose items changed, a sign-in that ended); the K-2 and 3-5 adverb
// topics (parsed, their own topic in each band's Adjectives and Adverbs, mastered separately, locked in order).
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
const { createApp } = await import('../../server/app.js');
const { q } = await import('../../server/db.js');
const { config } = await import('../../server/config.js');
const auth = await import('../../server/auth.js');
const GL = await import('../../server/services/grammar-lab.js');
const M = await import('../../server/services/grammar-lab-mastery.js');
const B = await import('../../scripts/grammar-lab-build.js');
const { tokenize } = await import('../../server/services/grammar-lab-text.js');

const ROOT = path.resolve(import.meta.dirname, '../..');
const MD = fs.readFileSync(path.join(ROOT, 'seed-lessons/grammar-lab/source/course.md'), 'utf8');
const PLAN = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons/grammar-lab/pathways.json'), 'utf8'));
const OVERRIDES = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons/grammar-lab/overrides.json'), 'utf8'));
let server, base;
test.before(async () => { config.grammarLab = true; config.grammarLabUsers = ['*']; server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => { server.close(); config.grammarLab = false; config.grammarLabUsers = []; });
const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const H = { accept: 'text/html', 'user-agent': 'Mozilla/5.0 Chrome/141.0' };
const get = async (p, u, { cookie = null, headers = {} } = {}) => { const r = await fetch(base + p, { headers: { ...H, ...headers, ...(cookie || u ? { cookie: cookie || cookieFor(u.id) } : {}) }, redirect: 'manual' }); return { status: r.status, text: await r.text(), location: r.headers.get('location') }; };
const post = async (p, u, body, { cookie = null } = {}) => {
  const r = await fetch(base + p, { method: 'POST', headers: { ...H, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', ...(cookie || u ? { cookie: cookie || cookieFor(u.id) } : {}) }, body: JSON.stringify(body) });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, json, text };
};
let n = 0;
const newKid = (name = 'rvkid') => auth.createUser({ username: `${name}${Date.now() % 1e6}x${++n}`, password: 'correct-horse-12', displayName: 'Kid' });
const master = (u, id) => q.run("INSERT OR REPLACE INTO course_progress(user_id, course, step, band, read_at, checked_at, check_score, played_at, completed_at) VALUES (?, 'grammar-lab', ?, 'k-2', 1, 1, 0, NULL, 1)", u.id, id);
const API = id => `/api/courses/grammar-lab/topic/${id}`;
const itemOf = (topic, id) => GL.topic(topic).items.find(it => it.id === id);
/** A wrong pick for the question on screen. */
const wrongOf = (topic, qn) => {
  const it = itemOf(topic, qn.id);
  return qn.kind === 'choice' ? [it.options.findIndex((_, i) => !it.answer.includes(i))] : [qn.words.findIndex((_, i) => !it.answer.includes(i) && !(it.optional || []).includes(i))];
};
const wordsAt = it => it.answer.map(i => tokenize(it.text)[i].t).join(' ');

// ------------------------------------------------------------------------------------------------- copy and counts
test('copy and counts: every topic\'s intro says the real rule and its counts; the header and mastery screen say them the same way', async () => {
  const kid = newKid();
  for (const b of GL.bands()) for (const p of GL.pathwaysOf(b.id)) {
    // every topic: the rule with its per-level count, and the total with "plus one for each miss"
    for (const id of p.topics) {
      if (p.topics.indexOf(id) > 0) master(kid, p.topics[p.topics.indexOf(id) - 1]);
      const tp = GL.topic(id), per = tp.levels[0], total = tp.levels.reduce((a, x) => a + x, 0);
      const page = await get(`/courses/grammar-lab/${b.id}/${p.id}/${id}`, kid);
      assert.equal(page.status, 200, `${b.id}/${p.id}/${id}`);
      assert.match(page.text, new RegExp(`id="gl-rule">Each level has ${per} questions\\. Finish it with two right in a row\\. Only first-try answers count toward the streak\\.<`), id);
      assert.match(page.text, new RegExp(`id="gl-count">${total} questions, plus one for each miss\\.<`), id);
    }
    break;   // one unit per band covers the markup; the loop below covers every topic's levels
  }
  // every topic in the course has 3 levels of 4, so the intro's numbers hold for all of them (Identifying Action Verbs too)
  for (const [id, t] of Object.entries(PLAN.topics)) assert.deepEqual(t.levels, [4, 4, 4], id);
  const verbs = await get('/courses/grammar-lab/k-2/kinds-of-words/identifying-action-verbs', (() => { const k = newKid(); master(k, 'identifying-common-nouns'); return k; })());
  assert.match(verbs.text, /id="gl-rule">Each level has 4 questions\./); assert.match(verbs.text, /id="gl-count">12 questions, plus one for each miss\.</);
  // the header: what misses added, as a number the page shows next to the count
  const s = M.newRun({ items: 12, seed: 'copy' });
  assert.deepEqual([M.summary(s).base, M.summary(s).added], [12, 0]);
  M.answer(s, 'wrong');
  assert.deepEqual([M.summary(s).total, M.summary(s).base, M.summary(s).added], [13, 12, 1]);
  assert.equal(M.summary(s).bar[12], 'added', 'the added segment is marked as such');
  // the K-2 adjective card: "Yellow tells about the bus."
  assert.equal(GL.topic('identifying-adjectives').card.tips[0].note, 'Yellow tells about the bus.');
  const card = await get('/courses/grammar-lab/k-2/adjectives-and-adverbs/identifying-adjectives/card', kid);
  assert.match(card.text, /Yellow tells about the bus\./);
});

// ------------------------------------------------------------------------------------------------- repeats
test('no unlabeled repeats over many seeded runs: a missed item comes back labeled, spread out, never back to back', () => {
  let retries = 0, seen = 0;
  for (const rate of [0.05, 0.15, 0.3, 0.6]) for (let r = 0; r < 1500; r++) {
    const s = M.newRun({ items: 12, seed: `rep|${rate}|${r}` });
    let x = r * 7919 + 13; const rand = () => (x = (x * 48271) % 2147483647) / 2147483647;
    const shown = [], missed = new Map(), wrongAt = new Map();
    let at = 0;
    for (let k = 0; k < 400 && !s.mastered; k++) {
      if (s.presented !== at) {
        at = s.presented;
        const c = s.cur, prev = shown[shown.length - 1];
        const where = `rate ${rate} run ${r} question ${at}`;
        assert.ok(!prev || prev.item !== c.item, `${where}: never the same item twice in a row`);
        if (shown.some(y => y.item === c.item)) assert.ok(c.retry || c.seen, `${where}: a repeat is always labeled`);
        if (c.retry) {
          retries++;
          assert.ok(missed.has(c.item), `${where}: only a missed item comes back as "Try this one again"`);
          // its turn comes at least two questions after its miss while fresh items remain
          if (s.queue.length) assert.ok(at - wrongAt.get(c.item) >= M.RETRY_GAP + 1, `${where}: spread from its miss`);
          if (prev && prev.retry) assert.equal(s.queue.length, 0, `${where}: two retries back to back only with no fresh item left`);
        }
        if (c.seen) {
          seen++;
          // only when nothing else could go: every item shown and no missed item but the one just shown
          assert.equal(s.queue.length, 0, `${where}: seen only with no fresh item left`);
          assert.ok([...missed.keys()].every(i => i === prev.item), `${where}: seen only when no other missed item could come back`);
        }
        shown.push({ item: c.item, retry: !!c.retry });
      }
      const res = !s.cur.missed && rand() < rate ? 'wrong' : 'right';
      if (res === 'wrong') { missed.set(s.cur.item, true); wrongAt.set(s.cur.item, s.presented); }
      M.answer(s, res);
    }
    assert.ok(s.mastered, `rate ${rate} run ${r} reaches mastery`);
    // a run with no misses shows each of the 12 items once
    if (!missed.size) assert.equal(new Set(shown.map(y => y.item)).size, 12);
  }
  assert.ok(retries > 1000, 'retries came up');
  assert.ok(seen < retries / 10, `"seen before" is rare (${seen} of ${retries})`);
});

test('the reported repeats: the counter and the question change together (the page shows them after the confirmation)', () => {
  // The desktop review saw "muddy ball" as Q8 and Q9: the header moved on at a level's end while the old sentence stayed
  // under the level overlay. The run itself never repeats it: Q8 and Q9 are different items in every seeded run.
  for (let r = 0; r < 500; r++) {
    const s = M.newRun({ items: 12, seed: `q8|${r}` });
    const items = [];
    for (let k = 0; k < 12; k++) { items.push(s.cur.item); M.answer(s, 'right'); }
    assert.equal(new Set(items).size, 12, `run ${r}: 12 different items`);
  }
  const js = fs.readFileSync(path.join(ROOT, 'public/js/grammar-lab.js'), 'utf8');
  assert.match(js, /await flash\(r\.kind === 'fixed'\);\s*question = r\.question;/, 'the new question is taken after the confirmation');
  assert.match(js, /if \(r\.levelDone !== null && r\.levelDone !== undefined\) \{ renderQuestion\(\); return levelDone\(r\.levelDone\); \}/, 'the next question is under the level overlay');
});

// ------------------------------------------------------------------------------------------------- accuracy, progress
test('the first-try line and partial progress: a topic\'s level, a unit\'s and a band\'s in-progress counts', async () => {
  const kid = newKid(), U = 'capital-letters', T = 'capitalizing-names-and-dates';
  let r = await post(`${API(T)}/start`, kid, { unit: U, band: 'k-2' });
  // a topic in progress: its level on its tile, and the unit and band count it
  let unit = await get(`/courses/grammar-lab/k-2/${U}`, kid);
  assert.match(unit.text, /id="gl-topic-capitalizing-names-and-dates">[\s\S]*?<span class="gl-tile-state">Level 1 of 3<\/span>/);
  assert.match(unit.text, /id="gl-unitprog">0 of 2 mastered\u00a0· 1 in progress</);
  let course = await get('/courses/grammar-lab?band=k-2', kid);
  assert.match(course.text, /id="gl-bandprog-k-2">0 mastered\u00a0· 1 in progress</);
  assert.match(course.text, /id="gl-unit-capital-letters">[\s\S]*?<span class="gl-unit-going">1 in progress<\/span>/);
  // to level 2: the tile says so
  let qn = r.json.question;
  for (let i = 0; i < 4; i++) { r = await post(`${API(T)}/answer`, kid, { unit: U, id: qn.id, marked: itemOf(T, qn.id).answer }); qn = r.json.question; }
  assert.equal(r.json.levelDone, 0);
  unit = await get(`/courses/grammar-lab/k-2/${U}`, kid);
  assert.match(unit.text, /<span class="gl-tile-state">Level 2 of 3<\/span>/);
  // one miss, then mastery: 12 of 13 right on the first try, never a ranking (the student's own counts)
  r = await post(`${API(T)}/answer`, kid, { unit: U, id: qn.id, marked: wrongOf(T, qn) });
  assert.equal(r.json.kind, 'wrong');
  for (let i = 0; i < 40 && !r.json.mastered; i++) { r = await post(`${API(T)}/answer`, kid, { unit: U, id: qn.id, marked: itemOf(T, qn.id).answer }); qn = r.json.question; }
  assert.equal(r.json.mastered, true);
  const c = r.json.closing;
  assert.equal(c.of, c.answered); assert.equal(c.firstTry, c.of - 1); assert.equal(c.base, 12); assert.ok(c.added >= 1);
  assert.ok(!/rank|place|best/i.test(JSON.stringify(c)), 'nothing about others');
  unit = await get(`/courses/grammar-lab/k-2/${U}`, kid);
  assert.match(unit.text, /id="gl-unitprog">1 of 2 mastered\u00a0· 0 in progress</);
  course = await get('/courses/grammar-lab?band=k-2', kid);
  assert.match(course.text, /id="gl-bandprog-k-2">1 mastered\u00a0· 0 in progress</);
  // the band folded under "Other grades" says its counts in its summary too
  course = await get('/courses/grammar-lab?band=3-5', kid);
  assert.match(course.text, /id="gl-sec-k-2"><summary>[\s\S]*?1 mastered\u00a0· 0 in progress<\/span><\/summary>/);
});

// ------------------------------------------------------------------------------------------------- locks
test('locks are consistent: every unit of every band opens its topics in order; a shared topic says where else it counts', async () => {
  for (const b of GL.bands()) for (const p of GL.pathwaysOf(b.id)) {
    const kid = newKid('lock');
    const states = () => GL.unitStates(kid, p);
    // a fresh student: the first topic open, every other one locked ("Master the one before first")
    assert.deepEqual(states().map(s => s.open), p.topics.map((_, i) => i === 0), `${b.id}/${p.id} fresh`);
    // mastering in order opens exactly the next one
    for (let i = 0; i < p.topics.length - 1; i++) {
      master(kid, p.topics[i]);
      assert.deepEqual(states().map(s => s.open), p.topics.map((_, k) => k <= i + 1), `${b.id}/${p.id} after ${i + 1}`);
    }
  }
  // the 3-5 Sound-alike Words unit: one topic, open; nothing else in it
  assert.deepEqual(GL.pathway('sound-alike-words', '3-5').topics, ['your-and-youre']);
  // the locked tile says why, and the API refuses a locked topic
  const kid = newKid();
  const unit = await get('/courses/grammar-lab/3-5/fixing-sentences', kid);
  assert.match(unit.text, /class="gl-tile gl-locked" id="gl-topic-recognizing-fragments">[\s\S]*?Master the one before first/);
  assert.equal((await post(`${API('recognizing-fragments')}/start`, kid, { unit: 'fixing-sentences', band: '3-5' })).status, 403);
  // a topic shared with other units: "Also counts in" on its tile (the other units, by name) and on the mastery screen
  assert.match(unit.text, /id="gl-topic-identifying-action-verbs">[\s\S]*?<span class="gl-tile-also"><span>Also counts in: <span lang="en" dir="ltr">Kinds of Words, Verbs and Time<\/span><\/span><\/span>/);
  assert.doesNotMatch(unit.text.slice(unit.text.indexOf('id="gl-topic-recognizing-fragments"')), /gl-tile-also/, 'a topic in one unit only has no note');
  const page = await get('/courses/grammar-lab/3-5/fixing-sentences/identifying-action-verbs', kid);
  assert.match(page.text, /id="gl-done-also"><span>Also counts in: <span lang="en" dir="ltr">Kinds of Words, Verbs and Time<\/span><\/span></);
  assert.deepEqual(GL.alsoIn('identifying-adjectives', GL.pathway('adjectives-and-adverbs', 'k-2')).map(x => x.title), ['Kinds of Words']);
});

// ------------------------------------------------------------------------------------------------- resync
test('a failed try re-syncs: a stale page, a run finished on another device, a topic whose items changed, a sign-in that ended', async () => {
  const kid = newKid(), U = 'adjectives-and-adverbs', T = 'identifying-adjectives';
  let r = await post(`${API(T)}/start`, kid, { unit: U });
  const first = r.json.question;
  // the state endpoint: the run in progress, its question and summary
  let st = await post(`${API(T)}/state`, kid, { unit: U });
  assert.equal(st.status, 200); assert.equal(st.json.question.id, first.id); assert.equal(st.json.summary.counter, 1);
  // a stale page (another tab answered): 409 with the question on screen now, never an answer
  r = await post(`${API(T)}/answer`, kid, { unit: U, id: first.id, marked: itemOf(T, first.id).answer });
  const now = r.json.question;
  r = await post(`${API(T)}/answer`, kid, { unit: U, id: first.id, marked: [0] });
  assert.equal(r.status, 409); assert.equal(r.json.question.id, now.id); assert.equal(r.json.summary.counter, 2);
  assert.doesNotMatch(JSON.stringify(r.json), /"answer"/);
  // finished on another device, then the old page's last question: 409 with the mastery screen, the progress kept
  let qn = now;
  for (let i = 0; i < 40 && !r.json.mastered; i++) { r = await post(`${API(T)}/answer`, kid, { unit: U, id: qn.id, marked: itemOf(T, qn.id).answer }); qn = r.json.question; }
  assert.equal(r.json.mastered, true);
  r = await post(`${API(T)}/answer`, kid, { unit: U, id: now.id, marked: [0] });
  assert.equal(r.status, 409); assert.equal(r.json.mastered, true);
  assert.equal(r.json.closing.answered, 12); assert.equal(r.json.closing.next.title, 'Identifying Adverbs');
  assert.ok(GL.masteredSet(kid).has(T));
  st = await post(`${API(T)}/state`, kid, { unit: U });
  assert.equal(st.json.mastered, true);
  // a run kept across a change to its topic's items: an item place the topic no longer has is swapped, progress stays
  const k2 = newKid();
  r = await post(`${API(T)}/start`, k2, { unit: U });
  qn = r.json.question;
  for (let i = 0; i < 5; i++) { r = await post(`${API(T)}/answer`, k2, { unit: U, id: qn.id, marked: itemOf(T, qn.id).answer }); qn = r.json.question; }
  const row = q.get('SELECT state FROM grammar_lab_quiz WHERE user_id=? AND topic=?', k2.id, T), s = JSON.parse(row.state);
  Object.assign(s, { items: 14 }); s.cur.item = 13; s.queue.push(12, 13);
  q.run('UPDATE grammar_lab_quiz SET state=? WHERE user_id=? AND topic=?', JSON.stringify(s), k2.id, T);
  st = await post(`${API(T)}/state`, k2, { unit: U });
  assert.equal(st.status, 200, 'never a server error');
  assert.ok(GL.topic(T).items.some(it => it.id === st.json.question.id), 'a question the topic has');
  assert.deepEqual([st.json.summary.counter, st.json.summary.level], [6, 2], 'the level and the count are kept');
  r = await post(`${API(T)}/answer`, k2, { unit: U, id: st.json.question.id, marked: itemOf(T, st.json.question.id).answer });
  assert.equal(r.status, 200); assert.equal(r.json.kind, 'right');
  // the topic page of that run opens on its question (no 500)
  assert.equal((await get(`/courses/grammar-lab/k-2/${U}/${T}`, k2)).status, 200);
  // a sign-in that ended (idle too long, or ended on another device): the API says so (401, signedOut) and the page
  // sends the player to sign in again, never on as a new guest (which looked like the lesson starting over at level 1)
  const k3 = newKid();
  const cookie = cookieFor(k3.id);
  await post(`${API(T)}/start`, k3, { unit: U }, { cookie });
  const sid = q.get('SELECT id FROM sessions WHERE user_id=? ORDER BY created_at DESC', k3.id).id;
  q.run('UPDATE sessions SET expires_at=1 WHERE id=?', sid);
  const res = await fetch(`${base}${API(T)}/answer`, { method: 'POST', headers: { ...H, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', cookie }, body: JSON.stringify({ unit: U, id: 'x', marked: [0] }) });
  assert.equal(res.status, 401); assert.equal((await res.json()).signedOut, true);
  const ended = (res.headers.get('set-cookie') || '').match(/brb_ended=[^;]+/);
  assert.ok(ended, 'the device remembers a sign-in ended here');
  // (a browser's navigation: fetch may not send Sec- headers, so this one goes through node:http)
  const pg = await new Promise((ok, no) => http.get(`${base}/courses/grammar-lab/k-2/${U}/${T}`, { headers: { ...H, cookie: ended[0], 'sec-fetch-mode': 'navigate' } }, r2 => { r2.resume(); ok({ status: r2.statusCode, location: r2.headers.location }); }).on('error', no));
  assert.equal(pg.status, 302); assert.match(pg.location, /^\/login\?next=%2Fcourses%2Fgrammar-lab%2Fk-2%2Fadjectives-and-adverbs%2Fidentifying-adjectives&signedout=1$/);
  const api2 = await post(`${API(T)}/state`, null, { unit: U }, { cookie: ended[0] });
  assert.equal(api2.status, 401); assert.equal(api2.json.signedOut, true);
  // the run waits on the account
  assert.equal(GL.currentRun(k3, T).presented, 1);
  // with the flag off it is still a 404 for everyone
  config.grammarLab = false;
  assert.equal((await post(`${API(T)}/state`, null, { unit: U }, { cookie: ended[0] })).status, 404);
  config.grammarLab = true;
});

// ------------------------------------------------------------------------------------------------- adverbs
test('the adverb topics: both parse; each band\'s Adjectives and Adverbs has 2 topics, its own adverb one; mastered separately; locked in order', async () => {
  const { topics, problems } = B.buildTopics(MD, PLAN, OVERRIDES);
  assert.deepEqual(problems, [], 'the build passes its lints: one answer in each sentence, no hint naming its answer');
  const k2 = topics['identifying-adverbs'], g35 = topics['adverbs-how-when-where'];
  assert.equal(k2.title, 'Identifying Adverbs'); assert.equal(k2.band, 'k-2'); assert.equal(k2.format, 'tap'); assert.equal(k2.ask, 'Tap the adverb.');
  assert.equal(g35.title, 'Adverbs That Tell How, When, and Where'); assert.equal(g35.band, '3-5'); assert.equal(g35.format, 'tap'); assert.equal(g35.ask, 'Tap the adverb.');
  assert.deepEqual(k2.items.map(wordsAt), ['slowly', 'loudly', 'Softly', 'happily', 'carefully', 'fast', 'gently', 'well', 'neatly', 'Quickly', 'quietly', 'kindly']);
  assert.deepEqual(g35.items.map(wordsAt), ['quietly', 'Yesterday', 'outside', 'everywhere', 'carefully', 'soon', 'today', 'here', 'proudly', 'early', 'Cheerfully', 'upstairs']);
  for (const t of [k2, g35]) {
    assert.equal(t.items.length, 12); assert.deepEqual(t.levels, [4, 4, 4]);
    for (const it of t.items) {
      assert.equal(it.answer.length, 1, `${it.id}: one word`);
      assert.equal(tokenize(it.text).filter(w => w.t.toLowerCase() === wordsAt(it).toLowerCase()).length, 1, `${it.id}: the answer is in the sentence once`);
      assert.doesNotMatch(it.hint, new RegExp(`\\b${wordsAt(it)}\\b`, 'i'), `${it.id}: the hint does not name its answer`);
    }
  }
  // the cards: the adverb (and the K-2 verb) marked in the worked example
  assert.deepEqual(k2.card.example.marks.map(m => [tokenize(k2.card.example.text)[m.i].t, m.role]), [['quickly', 'adverb'], ['ate', 'verb']]);
  assert.deepEqual(g35.card.example.marks.map(m => [tokenize(g35.card.example.text)[m.i].t, m.role]), [['softly', 'adverb']]);
  assert.equal(g35.card.how, 'Ask how, when, or where about the verb. The word that answers is the adverb.');
  // each band's unit: 2 topics, adjectives then its own adverb topic; the parts-of-speech units are as they were
  assert.deepEqual(GL.pathway('adjectives-and-adverbs', 'k-2').topics, ['identifying-adjectives', 'identifying-adverbs']);
  assert.deepEqual(GL.pathway('adjectives-and-adverbs', '3-5').topics, ['identifying-adjectives', 'adverbs-how-when-where']);
  assert.deepEqual(GL.pathway('kinds-of-words', '3-5').topics, ['identifying-common-nouns', 'identifying-action-verbs', 'identifying-adjectives']);
  assert.deepEqual(GL.pathway('more-kinds-of-words', '3-5').topics, ['coordinating-conjunctions']);
  assert.deepEqual(GL.unitsWith('identifying-adverbs').map(p => `${p.band}/${p.id}`), ['k-2/adjectives-and-adverbs']);
  assert.deepEqual(GL.unitsWith('adverbs-how-when-where').map(p => `${p.band}/${p.id}`), ['3-5/adjectives-and-adverbs']);
  // the course page counts 2 topics in each band's unit
  const kid = newKid();
  for (const b of ['k-2', '3-5']) {
    const course = await get(`/courses/grammar-lab?band=${b}`, kid);
    assert.match(course.text, new RegExp(`<section class="gl-bandsec gl-band-${b}"[\\s\\S]*?id="gl-unit-adjectives-and-adverbs">\\s*<span class="gl-ring" role="img" aria-label="0 of 2 topics mastered"`), b);
  }
  // locked in order: each adverb topic waits for Identifying Adjectives (a fresh student: 403, a redirect to the unit)
  assert.equal((await post(`${API('identifying-adverbs')}/start`, kid, { unit: 'adjectives-and-adverbs', band: 'k-2' })).status, 403);
  assert.equal((await post(`${API('adverbs-how-when-where')}/start`, kid, { unit: 'adjectives-and-adverbs', band: '3-5' })).status, 403);
  assert.equal((await get('/courses/grammar-lab/3-5/adjectives-and-adverbs/adverbs-how-when-where', kid)).status, 302);
  // a topic of the other band's unit is not in this band's unit
  assert.equal((await get('/courses/grammar-lab/k-2/adjectives-and-adverbs/adverbs-how-when-where', kid)).status, 404);
  assert.equal((await post(`${API('identifying-adverbs')}/start`, kid, { unit: 'adjectives-and-adverbs', band: '3-5' })).status, 404);
  master(kid, 'identifying-adjectives');
  for (const b of ['k-2', '3-5']) assert.deepEqual(GL.unitStates(kid, GL.pathway('adjectives-and-adverbs', b)).map(s => [s.mastered, s.open]), [[true, true], [false, true]], b);
  // mastering the K-2 adverbs does not master the 3-5 one: they are different topics
  let r = await post(`${API('identifying-adverbs')}/start`, kid, { unit: 'adjectives-and-adverbs', band: 'k-2' });
  let qn = r.json.question;
  assert.equal(qn.ask, 'Tap the adverb.'); assert.equal(qn.need, 1);
  for (let i = 0; i < 40 && !(r.json && r.json.mastered); i++) { r = await post(`${API('identifying-adverbs')}/answer`, kid, { unit: 'adjectives-and-adverbs', band: 'k-2', id: qn.id, marked: itemOf('identifying-adverbs', qn.id).answer }); qn = r.json.question; }
  assert.equal(r.json.mastered, true);
  assert.ok(GL.masteredSet(kid).has('identifying-adverbs'));
  assert.ok(!GL.masteredSet(kid).has('adverbs-how-when-where'));
  assert.deepEqual(GL.unitProgress(kid, GL.pathway('adjectives-and-adverbs', 'k-2')), { done: 2, total: 2, started: 0 });
  assert.deepEqual(GL.unitProgress(kid, GL.pathway('adjectives-and-adverbs', '3-5')), { done: 1, total: 2, started: 0 });
  // both are read aloud (K-2 and 3-5)
  assert.equal(GL.readsAloud(GL.topic('identifying-adverbs'), GL.pathway('adjectives-and-adverbs', 'k-2')), true);
  assert.equal(GL.readsAloud(GL.topic('adverbs-how-when-where'), GL.pathway('adjectives-and-adverbs', '3-5')), true);
  // a part may only name a band that uses its unit (the build says so)
  const bad = JSON.parse(JSON.stringify(PLAN));
  bad.pathways['capital-letters'].parts.push({ band: '9-12', topics: ['identifying-adverbs'] });
  assert.ok(B.buildTopics(MD, bad, OVERRIDES).problems.some(x => /a part for band "9-12", which does not use this unit/.test(x)));
});
