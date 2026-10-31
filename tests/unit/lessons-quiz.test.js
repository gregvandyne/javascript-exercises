// Homework from a question set (LIVE_HOMEWORK; services/classlive-sets.homework, lessons.addQuizStep,
// progress.quizAnswer): a lesson with one quiz step (a snapshot of the set), assigned to the class; the student gets the
// questions without answers, each answer is checked by the server once, marks are kept, and the step is done with
// score = % right in the gradebook. Off by default: every route answers 404.
import { reset, call, config, q, L, teacher, teacher2, cls, mia, zed } from './_live.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const SETS = await import('../../server/services/classlive-sets.js');

test.beforeEach(() => reset());
const set = () => SETS.createSet(teacher, { title: 'Capitals', items: [
  { q: 'Capital of France?', choices: ['Paris', 'Rome'], answer: 0, secs: 20 },
  { q: 'Capital of Italy?', choices: ['Paris', 'Rome'], answer: 1, secs: 20 },
], lang: 'en' }).set;

test('homework: off by default; on: assign a set, the student answers each question once, done with a score', async () => {
  const st = set();
  const off = await call(`/api/live/sets/${st.id}/homework`, { method: 'POST', body: { classId: cls.id }, user: teacher });
  assert.equal(off.status, 404); assert.equal(off.json.code, 'homeworkOff');
  config.liveHomework = true;
  try {
    assert.equal((await call(`/api/live/sets/${st.id}/homework`, { method: 'POST', body: { classId: cls.id }, user: teacher2 })).status, 404, 'not their set');
    assert.equal((await call(`/api/live/sets/${st.id}/homework`, { method: 'POST', body: { classId: 'nope' }, user: teacher })).json.code, 'noClass');
    const r = await call(`/api/live/sets/${st.id}/homework`, { method: 'POST', body: { classId: cls.id }, user: teacher });
    assert.equal(r.status, 200, r.text);
    const step = q.get("SELECT * FROM lesson_steps WHERE lesson_id=? AND kind='quiz'", r.json.lessonId);
    assert.equal(step.set_id, st.id);
    // A later edit of the set does not change the homework.
    SETS.updateSet(teacher, st.id, { items: [{ q: 'Changed?', choices: ['a', 'b'], answer: 0, secs: 20 }] });
    const url = `/api/lessons/${r.json.classLessonId}/steps/${step.id}/quiz`;
    const got = await call(url, { user: mia });
    assert.equal(got.status, 200);
    assert.deepEqual(got.json, { items: [{ q: 'Capital of France?', choices: ['Paris', 'Rome'] }, { q: 'Capital of Italy?', choices: ['Paris', 'Rome'] }], marks: '--' });
    assert.ok(!got.text.includes('"answer"'), 'never the answers up front');
    assert.equal((await call(url, { user: zed })).status, 404, 'not in the class');
    const a1 = await call(url, { method: 'POST', body: { i: 0, c: 0 }, user: mia });
    assert.deepEqual(a1.json, { ok: true, answer: 0, next: 1, score: null });
    assert.equal((await call(url, { method: 'POST', body: { i: 0, c: 1 }, user: mia })).json.code, 'answered', 'once per question');
    assert.equal((await call(url, { method: 'POST', body: { i: 5, c: 0 }, user: mia })).status, 400);
    const a2 = await call(url, { method: 'POST', body: { i: 1, c: 0 }, user: mia });
    assert.deepEqual(a2.json, { ok: false, answer: 1, next: -1, score: 50 });
    const row = q.get('SELECT status, score, label, marks FROM step_progress WHERE step_id=? AND user_id=?', step.id, mia.id);
    assert.deepEqual(row, { status: 'done', score: 50, label: 'quiz', marks: '10' });
    // The step can't be turned into a quiz by hand (only from a set), but its title can be edited.
    assert.equal(L.addStep(teacher, r.json.lessonId, { kind: 'quiz', body: 'x' }).code, 'stepKind');
    assert.ok(L.updateStep(teacher, step.id, { title: 'Capitals homework' }).ok);
  } finally { config.liveHomework = false; }
});
