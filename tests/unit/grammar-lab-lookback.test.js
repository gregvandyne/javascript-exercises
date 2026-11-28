// Grammar Lab: a question about a faulty sentence (a fragment it labels, a modifier it reads in the wrong place, a
// pronoun it reads as unclear, the wordy or weak sentence it picks) never shows that sentence again on its own once it is
// answered. The build gives every such question its sentence fixed (overrides.json { after }, checked by the sentence
// rules) and fails without it; the answer to a right try carries the fix (the green confirmation shows it), and never a
// question before it is answered; "look back" shows the faulty sentence struck through as a before and the fix as the
// after.
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

const ROOT = path.resolve(import.meta.dirname, '../..');
const read = f => fs.readFileSync(path.join(ROOT, 'seed-lessons/grammar-lab', f), 'utf8');
let server, base;
test.before(async () => { config.grammarLab = true; config.grammarLabUsers = ['*']; server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => { server.close(); config.grammarLab = false; config.grammarLabUsers = []; });
const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const H = { accept: 'text/html', 'user-agent': 'Mozilla/5.0 Chrome/141.0' };
const get = async (p, u) => { const r = await fetch(base + p, { headers: { ...H, cookie: cookieFor(u.id) }, redirect: 'manual' }); return { status: r.status, text: await r.text() }; };
const post = async (p, u, body) => {
  const r = await fetch(base + p, { method: 'POST', headers: { ...H, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', cookie: cookieFor(u.id) }, body: JSON.stringify(body) });
  const text = await r.text(); return { status: r.status, text, json: JSON.parse(text) };
};
let n = 0;
const newKid = () => auth.createUser({ username: `lbkid${Date.now() % 1e6}x${++n}`, password: 'correct-horse-12', displayName: 'Kid' });
const master = (u, id, band) => q.run("INSERT OR REPLACE INTO course_progress(user_id, course, step, band, read_at, checked_at, check_score, played_at, completed_at) VALUES (?, 'grammar-lab', ?, ?, 1, 1, 0, NULL, 1)", u.id, id, band);
const API = id => `/api/courses/grammar-lab/topic/${id}`;
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

test('the build: every question that shows a faulty sentence again has its fix, a right sentence; without it the build fails', () => {
  const md = read('source/course.md'), plan = JSON.parse(read('pathways.json')), ov = JSON.parse(read('overrides.json'));
  const { topics, problems } = B.buildTopics(md, plan, ov);
  assert.deepEqual(problems, []);
  const faulty = Object.values(topics).flatMap(t => t.items.filter(it => B.replaysFault(t, it)).map(it => ({ t, it })));
  assert.ok(faulty.length >= 80, `${faulty.length} questions`);
  for (const { t, it } of faulty) {
    assert.ok(it.after, it.id);
    assert.notEqual(it.after, B.replayOf(t, it), it.id);
    assert.deepEqual(B.sentenceFaults(it.after), [], it.id);
  }
  // the modifier, fragment and pronoun questions are all covered
  for (const id of ['misplaced-meaning-1', 'dangling-meaning-1', 'recognizing-fragments-1', 'complete-or-incomplete-2', 'that-which-especially-2', 'vague-antecedents-1', 'redundant-wordy-1'])
    assert.ok(faulty.some(x => x.it.id === id), id);
  // a sentence question about a right sentence has none
  assert.ok(!topics['recognizing-fragments'].items[1].after && !topics['vague-antecedents'].items[8].after);
  // take one fix away, or put a faulty one in: the build says so
  const less = structuredClone(ov); delete less.topics['misplaced-meaning']['1'];
  assert.ok(B.buildTopics(md, plan, less).problems.some(p => /misplaced-meaning-1: shows the faulty sentence .* again once answered/.test(p)));
  const bad = structuredClone(ov); bad.topics['dangling-meaning']['2'].after = 'while Leo walked to school the rain began';
  assert.ok(B.buildTopics(md, plan, bad).problems.some(p => /dangling-meaning-2: the fixed sentence .* small letter/.test(p)));
});

/** Play a topic to mastery through the API, one wrong answer first: -> the answers' responses. Every question as the
 *  page gets it is checked to carry no fix. */
async function play(kid, band, unit, topic) {
  const p = GL.pathwaysOf(band).find(x => x.id === unit), before = p.topics.slice(0, p.topics.indexOf(topic));
  for (const id of before) master(kid, id, band);
  let r = await post(`${API(topic)}/start`, kid, { unit, band });
  assert.equal(r.status, 200, r.text);
  const seen = [], all = GL.topic(topic).items;
  let qn = r.json.question, missed = false;
  for (let i = 0; i < 60 && qn; i++) {
    // the page never gets a fix before the question is answered
    for (const it of all) if (it.after) assert.ok(!JSON.stringify(qn).includes(it.after), `${qn.id}: the question carries the fix of ${it.id}`);
    const it = all.find(x => x.id === qn.id);
    const right = qn.kind === 'choice' ? [it.answer[0]] : it.answer;
    const wrong = qn.kind === 'choice' ? [it.options.findIndex((_, k) => !it.answer.includes(k))] : [qn.words.findIndex((_, k) => !it.answer.includes(k))];
    r = await post(`${API(topic)}/answer`, kid, { unit, band, id: qn.id, marked: !missed && it.after ? wrong : right });
    assert.equal(r.status, 200, r.text);
    seen.push({ it, json: r.json, wrong: !missed && !!it.after });
    if (!missed && it.after) { missed = true; assert.equal(r.json.after, undefined, 'a wrong try shows no fix'); continue; }
    if (r.json.mastered) break;
    qn = r.json.question;
  }
  assert.ok(seen.at(-1).json.mastered, `${topic} mastered`);
  return seen;
}

for (const [band, unit, topic, kind] of [['6-8', 'modifiers', 'misplaced-meaning', 'modifier'], ['6-8', 'modifiers', 'dangling-meaning', 'modifier'], ['3-5', 'fixing-sentences', 'recognizing-fragments', 'fragment']]) {
  test(`a ${kind} question (${topic}): the right answer brings the fix; "look back" strikes the faulty sentence and shows the fix`, async () => {
    const kid = newKid();
    const seen = await play(kid, band, unit, topic);
    const rights = seen.filter(x => !x.wrong);
    assert.ok(rights.some(x => x.it.after), 'a question with a fix was asked');
    for (const { it, json } of rights) assert.equal(json.after, it.after || undefined, `${it.id}: the fix comes with the right answer, and only then`);
    const page = await get(`/courses/grammar-lab/${band}/${unit}/${topic}/review`, kid);
    assert.equal(page.status, 200);
    for (const { it } of rights.filter(x => x.it.after)) {
      const faulty = esc(it.text);
      assert.match(page.text, new RegExp(`<span class="gl-ba gl-ba-before">.*?<span class="gl-ba-text">${faulty.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</span>`), `${it.id}: the faulty sentence is the before`);
      assert.ok(page.text.includes(`<span class="gl-ex-text">${esc(it.after)}</span>`), `${it.id}: the fix is the after`);
      // never the faulty sentence alone as a right one
      assert.ok(!page.text.includes(`<p class="gl-ex-text" lang="en" dir="ltr">${faulty}`), `${it.id}: shown alone`);
    }
    if (topic === 'recognizing-fragments') assert.match(page.text, /gl-ba-text">Ran to the store\.<\/span><\/span> <span class="gl-badge">Fragment<\/span>/);
  });
}

test('the page script: the green confirmation shows the fix it is given, in the after style', () => {
  const js = fs.readFileSync(path.join(ROOT, 'public/js/grammar-lab.js'), 'utf8');
  assert.match(js, /await flash\(r\.kind === 'fixed', r\.after \|\| ''\)/);
  assert.match(js, /fix\.hidden = !after; \$\('#gl-correct-after-t'\)\.textContent = after \|\| ''/);
});
