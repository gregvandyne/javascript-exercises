// Mistake Hunt, Phase 2: the graded proofread step (services/proof-steps.js, routes/game-folders.js assign-proofread,
// routes/progress.js, routes/games.js; docs/decisions.md "Mistake Hunt, Phase 2"):
//   - Assign to class (Hand in for a grade): a lesson with one proofread step holding a snapshot of the set (passages,
//     mistakes, keys, why lines), with its dates and "Show answers after the due date" (off by default, needs a due
//     date); only the set's owner, only to a class they teach; later edits to the set never change the step;
//   - the student plays it in the game (the frame gets the words students see, never the key), saves, hands in once;
//     the server marks each mistake (found/missed), counts correct text changed (no cost), score = % found;
//   - the gradebook, the Score and the class Standards tab count it; the progress page shows counts per kind of mistake
//     and each student's result in roster order;
//   - the key and why lines never reach a student (JSON, the lesson page, the frame) before the teacher allows it, the
//     due date is over and that student handed in.
import './_live.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { call, publish, official, teacher, teacher2, cls, mia, leo, zed, kid, q, RL, L } from './_live.js';
import * as G from '../../server/services/game-sets.js';
import * as PS from '../../server/services/proof-steps.js';
import * as P from '../../server/services/progress.js';
import * as SC from '../../server/services/scores.js';
import * as CC from '../../server/services/standards-ccss.js';
import { proofCore } from '../../server/services/proof-core.js';

const C = proofCore();
const MH = q.get("SELECT * FROM games WHERE slug='mistake-hunt'") || publish(official, '<!doctype html><title>t</title><p>mh</p>', { source: 'seed', slug: 'mistake-hunt', title: 'Mistake Hunt' });
const X1 = "A volcano is an opening in Earth's crust. Hot melted rock, called magma, rises from deep underground. When magma reaches the surface, it is called lava. Some volcanoes erupt with a loud boom, while others ooze lava slowly.";
const X2 = 'On Monday, our class went to the library. Your library card is important, so don\'t lose it. The children found books about wolves, geese, and mice.';
const WHY = 'Secret why line for the class.';
const plant = (x, n, seed) => C.plant(x, { types: C.preset(5), n, seed }).map((m, i) => (i === 0 ? { ...m, y: WHY, ai: 1 } : m));
const ITEMS = [{ t: 'Inside a volcano', x: X1, g: 4, m: plant(X1, 4, 3), o: { h: true, s: true, n: 'total' } }, { t: 'Library day', x: X2, g: 4, m: plant(X2, 3, 8) }];
const DAY = 864e5, isoDay = ms => new Date(ms).toISOString().slice(0, 10);
const saveSet = async (user = teacher, items = ITEMS) => { const r = await call(`/api/games/${MH.id}/sets`, { method: 'POST', body: { items, title: 'Volcanoes: find the mistakes' }, user }); assert.equal(r.status, 200, r.text); return r.json.id; };
const assign = (user, body) => call('/api/teach/assign-proofread', { method: 'POST', body, user });
async function assigned(body = {}) {
  const setId = await saveSet();
  const r = await assign(teacher, { setId, classId: cls.id, ...body });
  assert.equal(r.status, 200, r.text);
  const clId = /progress\/([^/?#]+)/.exec(r.json.redirect)[1];
  const cl = L.getClassLesson(clId), step = L.steps(cl.lesson_id)[0];
  return { setId, cl, step };
}
/** Every fix a passage needs, over the words students see. */
const allFixes = (it) => C.key(it.x, it.m).map(k => ({ a: k.a, b: k.b, s: k.right }));
/** Strings that must never reach a student before answers are allowed. */
const secrets = () => [X1, X2, WHY, '"key"'];
const noSecrets = (text, what) => { for (const s of secrets()) assert.ok(!text.includes(s) && !text.includes(s.replace(/'/g, '&#39;')), `${what}: leaked ${s.slice(0, 30)}`); };
test.beforeEach(() => RL._reset());

test('assign: a lesson with one proofread step, a snapshot of the set; only the owner, only a class they teach; dates and the answers switch', async () => {
  const setId = await saveSet();
  assert.equal((await assign(kid, { setId, classId: cls.id })).status, 404, 'a kid');
  assert.equal((await assign(mia, { setId, classId: cls.id })).status, 404, 'a student');
  assert.equal((await assign(teacher2, { setId, classId: cls.id })).status, 404, 'not their set');
  const other = await saveSet(teacher2);
  assert.equal((await assign(teacher2, { setId: other, classId: cls.id })).json.code, 'noClass', 'not a class they teach');
  assert.equal((await assign(teacher, { setId, classId: cls.id, dueAt: 'soon' })).json.code, 'badDate');
  assert.equal((await assign(teacher, { setId, classId: cls.id, opensAt: '2026-12-10', dueAt: '2026-12-01' })).json.code, 'dueBeforeOpen');
  assert.equal((await assign(teacher, { setId, classId: cls.id, showAnswers: '1' })).json.code, 'needsDue');
  const { cl, step } = await assigned({ dueAt: isoDay(Date.now() + 7 * DAY) });
  assert.equal(step.kind, 'proofread'); assert.equal(step.show_answers, 0, 'off by default');
  assert.equal(L.getLesson(cl.lesson_id).kind, 'proofread'); assert.equal(L.getLesson(cl.lesson_id).title, 'Volcanoes: find the mistakes');
  const snap = PS.snapOf(step);
  assert.equal(snap.passages.length, 2); assert.equal(snap.passages[0].x, X1); assert.equal(snap.passages[0].m[0].y, WHY);
  // editing the set later changes nothing a class was given
  const setNow = G.get(MH.id, (await call(`/api/games/${MH.id}/sets`, { user: teacher })).json.sets[0].id);
  await call(`/api/games/${MH.id}/sets`, { method: 'POST', body: { id: setNow.id, items: [ITEMS[1]] }, user: teacher });
  assert.equal(PS.snapOf(L.getStep(step.id)).passages.length, 2);
  // the step editor shows it without an edit form for its passages; its kind stays
  assert.equal(L.updateStep(teacher, step.id, { kind: 'text', body: 'x' }).code, 'stepKind');
  assert.ok(L.updateStep(teacher, step.id, { kind: 'proofread', title: 'Volcano homework' }).ok);
  const ed = await call(`/teach/lessons/${cl.lesson_id}`, { user: teacher });
  assert.equal(ed.status, 200); assert.match(ed.text, /2 passages · 7 mistakes/);
  // the Assign page offers "Hand in for a grade" for the teacher's own set
  const page = await call(`/teach/assign?game=mistake-hunt&opts=${encodeURIComponent(`chapter=${setId}&lock=1`)}`, { user: teacher });
  assert.equal(page.status, 200);
  assert.match(page.text, /Hand in for a grade/); assert.match(page.text, /data-api="\/api\/teach\/assign-proofread"/); assert.match(page.text, /data-api="\/api\/teach\/assign-game"/);
  assert.doesNotMatch((await call(`/teach/assign?game=mistake-hunt&opts=${encodeURIComponent(`chapter=${other}&lock=1`)}`, { user: teacher })).text, /assign-proofread/, 'not for another teacher\'s set');
});

test('play, save, hand in: the frame gets the words students see and never the key; marking, the score and no second hand-in', async () => {
  const { cl, step } = await assigned({ dueAt: isoDay(Date.now() + 7 * DAY) });
  const api = `/api/progress/${cl.id}/${step.id}/proofread`;
  // The frame for the student: proofStep with the wrong words only.
  const play = await call(`/play/mistake-hunt?lesson=${cl.id}&step=${step.id}`, { user: mia });
  assert.equal(play.status, 200);
  assert.match(play.text, /"proof":true/);
  const frame = await call(/data-src="(\/frame\/[^"]+?)"/.exec(play.text)[1].replace(/&amp;/g, '&'), { user: mia });
  const init = JSON.parse(/window\.__BRB_INIT__=(\{.*?\});<\/script>/.exec(frame.text)[1]);
  assert.ok(init.proofStep); assert.equal(init.proofStep.passages.length, 2); assert.equal(init.proofStep.revealed, false);
  assert.equal(init.proofStep.passages[0].n, 4);
  assert.ok(init.proofStep.passages[0].w.every(x => Array.isArray(x) && x.length === 2), 'words and spaces only, no mistake marks');
  assert.equal(init.proofStep.passages[0].w.map(x => x[0] + x[1]).join(''), C.wrongText(X1, ITEMS[0].m), 'the passage with its mistakes in it');
  noSecrets(JSON.stringify(init.proofStep), 'frame');
  assert.equal(init.proofAi, undefined, 'no AI tools for a student');
  // a frame for someone else's step: nothing
  const zp = await call(`/play/mistake-hunt?lesson=${cl.id}&step=${step.id}`, { user: zed });
  const zf = await call(/data-src="(\/frame\/[^"]+?)"/.exec(zp.text)[1].replace(/&amp;/g, '&'), { user: zed });
  assert.doesNotMatch(/window\.__BRB_INIT__=(\{.*?\});<\/script>/.exec(zf.text)[1], /proofStep/);
  assert.equal((await call(api, { user: zed })).status, 404);
  assert.equal((await call(api, { user: teacher })).status, 404, 'the student API is for the class\'s students');
  // Save: passage 1 fully fixed, passage 2 one fix plus a right word changed
  const s1 = await call(api, { method: 'POST', body: { edits: [allFixes(ITEMS[0])] }, user: mia });
  assert.equal(s1.status, 200, s1.text); assert.equal(s1.json.handedIn, false);
  noSecrets(s1.text, 'save');
  const k2 = C.key(X2, ITEMS[1].m), W2 = C.wrongTokens(X2, ITEMS[1].m);
  const free = W2.findIndex((w, j) => w.m < 0 && j > 2 && /^[a-z]+$/.test(w.s));
  const e2 = [{ a: k2[0].a, b: k2[0].b, s: k2[0].right }, { a: free, b: free + 1, s: 'banana' }];
  const r0 = await call(api, { user: mia });
  assert.equal(JSON.stringify(r0.json.edits[0]), JSON.stringify(allFixes(ITEMS[0]).sort((a, b) => a.a - b.a)), 'the saved fixes come back');
  // a rude fix is refused; a fix outside the passage too
  assert.equal((await call(api, { method: 'POST', body: { edits: [[{ a: 0, b: 1, s: 'shit' }]] }, user: mia })).json.code, 'words');
  assert.equal((await call(api, { method: 'POST', body: { edits: [[{ a: 0, b: 999, s: 'x' }]] }, user: mia })).status, 400);
  // Hand in
  const h = await call(api, { method: 'POST', body: { edits: [allFixes(ITEMS[0]), e2], handIn: true }, user: mia });
  assert.equal(h.status, 200, h.text);
  assert.equal(h.json.handedIn, true); assert.equal(h.json.score, Math.round(100 * 5 / 7));
  assert.equal(h.json.view.found, 5); assert.equal(h.json.view.total, 7);
  assert.deepEqual(h.json.view.results.map(x => [x.found, x.total]), [[4, 4], [1, 3]]);
  assert.equal(h.json.view.results[1].oops.length, 1, 'the right word changed is shown, not counted');
  noSecrets(h.text, 'after handing in, before the due date');
  const row = P.get(cl.id, step.id, mia.id);
  assert.equal(row.status, 'done'); assert.equal(row.label, 'proofread'); assert.equal(row.marks.length, 7);
  const ms = PS.mistakesOf(PS.snapOf(step));
  // marks are in reading order, passage by passage
  assert.equal(row.marks.slice(0, 4), '1111');
  assert.equal([...row.marks.slice(4)].filter(c => c === '1').length, 1);
  assert.equal(ms.length, 7);
  // nothing changes after
  assert.equal((await call(api, { method: 'POST', body: { edits: [[]], handIn: true }, user: mia })).json.code, 'handedIn');
  assert.equal((await call(api, { method: 'POST', body: { edits: [[]] }, user: mia })).json.code, 'handedIn');
  assert.equal(P.markDone(mia, cl.id, step.id).code, 'notFound', 'done only by handing in');
  // the lesson page for the student: the score, no key
  const lp = await call(`/class/${cl.class_id}/lessons/${cl.id}`, { user: mia });
  assert.equal(lp.status, 200); assert.match(lp.text, /You found 5 of 7 mistakes \(71%\)/); noSecrets(lp.text, 'lesson page');
  const lp2 = await call(`/class/${cl.class_id}/lessons/${cl.id}`, { user: leo });
  assert.match(lp2.text, new RegExp(`href="/play/mistake-hunt\\?lesson=${cl.id}&amp;step=${step.id}"`)); noSecrets(lp2.text, 'lesson page, not handed in');
});

test('gradebook, Score, Standards and the progress page: counts per kind of mistake, each student in roster order, no ranking', async () => {
  const { cl, step } = await assigned({ dueAt: isoDay(Date.now() + 7 * DAY) });
  const api = `/api/progress/${cl.id}/${step.id}/proofread`;
  await call(api, { method: 'POST', body: { edits: [allFixes(ITEMS[0]), allFixes(ITEMS[1])], handIn: true }, user: mia });
  await call(api, { method: 'POST', body: { edits: [[], []], handIn: true }, user: leo });
  const gb = P.classProgress(cls.id), col = gb.lessons.findIndex(x => x.id === cl.id);
  assert.ok(gb.lessons[col].hasQuiz);
  const miaRow = gb.students.find(p => p.id === mia.id);
  assert.equal(miaRow.cells[col].done, 1);
  const its = SC.classItems(cls.id).get(`${mia.id}:${cl.id}`);
  assert.deepEqual(its.map(x => [x.kind, x.earned, x.possible]), [['quiz', 7, 7]]);
  assert.deepEqual(SC.classItems(cls.id).get(`${leo.id}:${cl.id}`).map(x => [x.earned, x.possible]), [[0, 7]]);
  // Standards: each mistake's Common Core code, right or not per student
  const view = CC.classView(cls.id, 'ccss-ela');
  const code = PS.mistakesOf(PS.snapOf(step))[0].cc;
  const r = view.rows.find(x => x.id === code);
  assert.ok(r, `${code} is in the class view`);
  assert.ok(r.by.get(mia.id).answered >= 1 && r.by.get(mia.id).right === r.by.get(mia.id).answered);
  assert.equal(r.by.get(leo.id).right, 0);
  // the progress page
  const pg = await call(`/class/${cls.id}/progress/${cl.id}`, { user: teacher });
  assert.equal(pg.status, 200);
  assert.match(pg.text, /By kind of mistake/);
  assert.match(pg.text, /2 of 2 handed in/);
  assert.match(pg.text, /50%<\/b> of mistakes found/);
  const totals = PS.typeTotals(step, [P.get(cl.id, step.id, mia.id), P.get(cl.id, step.id, leo.id)]);
  assert.equal(totals.kinds.reduce((n, x) => n + x.found, 0), 7); assert.equal(totals.kinds.reduce((n, x) => n + x.missed, 0), 7);
  for (const x of totals.kinds) assert.match(pg.text, new RegExp(`${x.found} found · ${x.missed} missed`));
  assert.ok(pg.text.indexOf('Mia Pupil') < pg.text.lastIndexOf('Leo Pupil') || pg.text.includes('Leo Pupil'), 'roster names on the page');
  assert.match(pg.text, /7\/7/); assert.match(pg.text, /0\/7/);
  // another class's teacher: no page
  assert.equal((await call(`/class/${cls.id}/progress/${cl.id}`, { user: teacher2 })).status, 404);
});

test('answers: only with the switch on, the due date over, and handed in; the teacher turns it on or off', async () => {
  const { cl, step } = await assigned({ dueAt: isoDay(Date.now() + 7 * DAY), showAnswers: '1' });
  assert.equal(step.show_answers, 1);
  const api = `/api/progress/${cl.id}/${step.id}/proofread`;
  await call(api, { method: 'POST', body: { edits: [allFixes(ITEMS[0]), []], handIn: true }, user: mia });
  let r = await call(api, { user: mia });
  assert.equal(r.json.revealed, false); assert.equal(r.json.later, true); noSecrets(r.text, 'before the due date');
  // the due date is over
  q.run('UPDATE class_lessons SET due_at=? WHERE id=?', Date.now() - 2 * DAY, cl.id);
  r = await call(api, { user: mia });
  assert.equal(r.json.revealed, true);
  assert.equal(r.json.key[0].x, X1); assert.equal(r.json.key[0].m[0].y, WHY); assert.deepEqual(r.json.key[0].found, [0, 1, 2, 3]);
  // the frame gets the key too, for the same student
  const play = await call(`/play/mistake-hunt?lesson=${cl.id}&step=${step.id}`, { user: mia });
  const frame = await call(/data-src="(\/frame\/[^"]+?)"/.exec(play.text)[1].replace(/&amp;/g, '&'), { user: mia });
  assert.ok(frame.text.includes(WHY));
  // leo has not handed in: nothing, and the lesson page says to hand in first
  r = await call(api, { user: leo }); assert.equal(r.json.revealed, false); noSecrets(r.text, 'not handed in');
  const lp = await call(`/class/${cls.id}/lessons/${cl.id}`, { user: leo });
  noSecrets(lp.text, 'lesson page, not handed in'); assert.match(lp.text, /The answers are ready\. Hand in your work to see them\./);
  const lf = await call(`/play/mistake-hunt?lesson=${cl.id}&step=${step.id}`, { user: leo });
  const lframe = await call(/data-src="(\/frame\/[^"]+?)"/.exec(lf.text)[1].replace(/&amp;/g, '&'), { user: leo });
  noSecrets(/window\.__BRB_INIT__=(\{.*?\});<\/script>/.exec(lframe.text)[1], 'frame, not handed in');
  // the switch: students can't, another teacher can't, the class's teacher can
  const sw = `/api/progress/${cl.id}/${step.id}/show-answers`;
  assert.equal((await call(sw, { method: 'POST', body: { on: false }, user: mia })).status, 404);
  assert.equal((await call(sw, { method: 'POST', body: { on: false }, user: teacher2 })).status, 404);
  assert.equal((await call(sw, { method: 'POST', body: { on: false }, user: teacher })).json.on, false);
  r = await call(api, { user: mia }); assert.equal(r.json.revealed, false); noSecrets(r.text, 'switched off');
  // the teacher's own preview always has the key
  const tp = await call(`/class/${cls.id}/lessons/${cl.id}`, { user: teacher });
  assert.match(tp.text, /Students fix these passages in Mistake Hunt/);
});

test('the Assign page: the teacher must choose "Hand in for a grade" or "Practice"; nothing is picked, and neither form shows before a choice', async () => {
  const setId = await saveSet();
  const page = await call(`/teach/assign?game=mistake-hunt&opts=${encodeURIComponent(`chapter=${setId}&lock=1`)}`, { user: teacher });
  assert.equal(page.status, 200);
  const h = page.text;
  assert.match(h, /How will students do it\?/);
  const radios = h.match(/<input type="radio" name="pf-mode"[^>]*>/g) || [];
  assert.deepEqual(radios.map(r => /value="(\w+)"/.exec(r)[1]), ['grade', 'practice'], 'two choices');
  assert.ok(radios.every(r => !/checked/.test(r)), 'nothing preselected');
  assert.match(h, /Students do it once in the lesson\. It is marked and goes to the gradebook\./);
  assert.match(h, /Students play the set as often as they like\. Nothing is graded\./);
  // the radios belong to no form, so neither form can be sent without a choice; each form sits in its own pane
  for (const f of h.match(/<form[\s\S]*?<\/form>/g) || []) assert.doesNotMatch(f, /pf-mode/, 'a choice radio inside a form');
  const grade = /<div class="pf-pane" id="pf-pane-grade">[\s\S]*?<\/form><\/div>/.exec(h), practice = /<div class="pf-pane" id="pf-pane-practice">[\s\S]*?<\/form><\/div>/.exec(h);
  assert.ok(grade && /assign-proofread/.test(grade[0]) && /name="allowHints"/.test(grade[0]) && /name="showAnswers"/.test(grade[0]) && /name="opensAt"/.test(grade[0]) && /name="dueAt"/.test(grade[0]));
  assert.doesNotMatch(grade[0], /name="allowHints"[^>]*checked/, 'Allow hints is off by default');
  assert.ok(practice && /assign-game/.test(practice[0]) && /name="dueAt"/.test(practice[0]) && !/assign-proofread/.test(practice[0]));
  assert.doesNotMatch(h, /pf-practice|Practice in the game instead/, 'no folded practice form any more');
  // the panes are hidden until their radio is checked (CSS :has(); both show where :has() is unknown)
  const fs = await import('node:fs');
  const css = fs.readFileSync(new URL('../../public/css/schools.css', import.meta.url), 'utf8');
  assert.match(css, /@supports selector\(:has\(\*\)\)\{\s*\.pf-pane\{display:none\}/);
  assert.match(css, /\.assign-game:has\(#pf-mode-grade:checked\) #pf-pane-grade,\.assign-game:has\(#pf-mode-practice:checked\) #pf-pane-practice\{display:block\}/);
});

test('hints: off by default; allowed on the Assign page, answered and counted by the server, shown to the teacher as a plain count', async () => {
  // off by default: the snapshot, the frame and the API all say no
  const off = await assigned({ dueAt: isoDay(Date.now() + 7 * DAY) });
  assert.equal(PS.snapOf(off.step).hints, false);
  const offApi = `/api/progress/${off.cl.id}/${off.step.id}/proofread`;
  assert.equal((await call(offApi, { user: mia })).json.hints, false);
  const no = await call(offApi, { method: 'POST', body: { edits: [[]], hint: 0 }, user: mia });
  assert.equal(no.status, 400); assert.equal(no.json.code, 'noHints');
  const offPage = await call(`/class/${cls.id}/progress/${off.cl.id}`, { user: teacher });
  assert.match(offPage.text, /Hints: off/); assert.doesNotMatch(offPage.text, /<th scope="col">Hints<\/th>/);
  // allowed: the snapshot keeps it (no migration: it is in the step's JSON), a round trip through assign
  const { cl, step } = await assigned({ dueAt: isoDay(Date.now() + 7 * DAY), allowHints: '1' });
  assert.equal(PS.snapOf(step).hints, true); assert.equal(PS.hintsOn(step), true);
  assert.equal(JSON.parse(step.items).hints, true);
  const api = `/api/progress/${cl.id}/${step.id}/proofread`;
  const play = await call(`/play/mistake-hunt?lesson=${cl.id}&step=${step.id}`, { user: mia });
  const frame = await call(/data-src="(\/frame\/[^"]+?)"/.exec(play.text)[1].replace(/&amp;/g, '&'), { user: mia });
  const init = JSON.parse(/window\.__BRB_INIT__=(\{.*?\});<\/script>/.exec(frame.text)[1]);
  assert.equal(init.proofStep.hints, true); assert.equal(init.proofStep.hintsUsed, 0);
  // a hint: the sentence of the first mistake not fixed yet, and its kind; the fixes are saved; counted once
  const k0 = C.key(X1, ITEMS[0].m)[0];
  const h1 = await call(api, { method: 'POST', body: { edits: [[], []], hint: 0 }, user: mia });
  assert.equal(h1.status, 200, h1.text);
  assert.equal(h1.json.hint.i, 0); assert.equal(h1.json.hint.k, k0.k);
  const sen = C.sentenceOf(X1, ITEMS[0].m, k0.i);
  assert.deepEqual([h1.json.hint.a, h1.json.hint.b], [sen.a, sen.b]);
  assert.ok(h1.json.hint.a <= k0.a && k0.b <= h1.json.hint.b, 'the sentence holds the mistake');
  assert.equal(h1.json.view.hintsUsed, 1);
  noSecrets(h1.text, 'a hint');
  assert.doesNotMatch(h1.text, /"right"|"y":/, 'never the right words or a why line');
  // with that mistake fixed, the next hint moves on; the count goes up each time
  const h2 = await call(api, { method: 'POST', body: { edits: [[{ a: k0.a, b: k0.b, s: k0.right }], []], hint: 0 }, user: mia });
  const k1 = C.key(X1, ITEMS[0].m)[1];
  assert.equal(h2.json.hint.k, k1.k, 'the next mistake in reading order');
  assert.equal(h2.json.view.hintsUsed, 2);
  assert.equal(JSON.stringify(P.get(cl.id, step.id, mia.id).answer).includes(k0.right.replace(/"/g, '')), true, 'the fixes were saved');
  // a passage with every mistake fixed: nothing to hint, not counted
  const h3 = await call(api, { method: 'POST', body: { edits: [allFixes(ITEMS[0]), []], hint: 0 }, user: mia });
  assert.equal(h3.status, 200); assert.equal(h3.json.hint, null); assert.equal(h3.json.view.hintsUsed, 2);
  // validation: a passage that isn't there, not a whole number, a count sent by the page (ignored)
  for (const hint of [2, -1, 1.5, '0', 100]) assert.equal((await call(api, { method: 'POST', body: { edits: [[], []], hint }, user: mia })).status, 400, `hint ${hint}`);
  await call(api, { method: 'POST', body: { edits: [allFixes(ITEMS[0]), []], hints: 0, hintsUsed: 0 }, user: mia });
  assert.equal(P.get(cl.id, step.id, mia.id).hints, 2, 'the page cannot set the count');
  // a small integer: never above PS.HINTS_MAX, whatever the row holds
  await call(api, { method: 'POST', body: { edits: [[{ a: 0, b: 1, s: 'A' }], []] }, user: leo });
  q.run('UPDATE step_progress SET hints=? WHERE class_lesson_id=? AND step_id=? AND user_id=?', PS.HINTS_MAX, cl.id, step.id, leo.id);
  await call(api, { method: 'POST', body: { edits: [[], []], hint: 1 }, user: leo });
  assert.equal(P.get(cl.id, step.id, leo.id).hints, PS.HINTS_MAX);
  assert.equal(PS.hintsOf({ hints: 5000 }), PS.HINTS_MAX); assert.equal(PS.hintsOf({ hints: -3 }), 0); assert.equal(PS.hintsOf(null), 0);
  // someone else's step: 404; after handing in: no more hints
  assert.equal((await call(api, { method: 'POST', body: { edits: [[], []], hint: 0 }, user: zed })).status, 404);
  const h = await call(api, { method: 'POST', body: { edits: [allFixes(ITEMS[0]), []], handIn: true }, user: mia });
  assert.equal(h.json.view.hintsUsed, 2, 'saved with the work');
  assert.equal((await call(api, { method: 'POST', body: { edits: [[], []], hint: 1 }, user: mia })).json.code, 'handedIn');
  // the teacher: "Hints: allowed" on the progress page and the lesson editor, each student's plain count
  const pp = await call(`/class/${cls.id}/progress/${cl.id}`, { user: teacher });
  assert.match(pp.text, /Hints: allowed/); assert.match(pp.text, /<th scope="col">Hints<\/th>/);
  assert.match(pp.text, /<td class="pf-hintsn">2 hints<\/td>/);
  assert.equal(PS.resultOf(L.getStep(step.id), P.get(cl.id, step.id, mia.id)).hints, 2);
  const ed = await call(`/teach/lessons/${cl.lesson_id}`, { user: teacher });
  assert.match(ed.text, /Hints: allowed/);
  const tp = await call(`/class/${cls.id}/lessons/${cl.id}`, { user: teacher });
  assert.match(tp.text, /Hints: allowed/);
});
