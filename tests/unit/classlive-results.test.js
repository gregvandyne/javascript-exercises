// Oomba Live results (server/services/classlive-results.js), P4 for CS Quest: each question's category (a CSTA id on a
// lesson's set, a Brain Board column) and its time stay with the run, in the summary, in the saved live_runs.items and
// in "play the missed questions again", so a class run can say which standard every question practiced. Items without
// a category save exactly as before.
import { reset, open, hostSocket, player, teacher, mia, leo, cls, q } from './_live.js';
import test from 'node:test';
import assert from 'node:assert/strict';

const R = await import('../../server/services/classlive-results.js');

test.beforeEach(() => reset());

test('a saved class run keeps cat and secs per question; the summary and the missed-questions set carry them too', async () => {
  const items = [
    { q: 'Which block repeats what is inside it?', choices: ['forward', 'repeat', 'turn', 'stop'], answer: 1, secs: 15, cat: '1B-AP-10' },
    { q: 'A bug is…', choices: ['a mistake in a program', 'a slow computer', 'a loud fan', 'a long cable'], answer: 0, secs: 20, cat: '1B-AP-15' },
    { q: 'No category here', choices: ['yes', 'no'], answer: 0, secs: 10 },
  ];
  const s = open(teacher, { mode: 'battle', items, audience: 'class', classId: cls.id, lang: 'en' });
  assert.deepEqual(s.items.map(it => it.cat), ['1B-AP-10', '1B-AP-15', undefined], 'the categories reach the session');
  const h = await hostSocket(s, teacher);
  const a = await player(s, mia), b = await player(s, leo);
  h.send({ t: 'h', a: 'start' }); a.send({ t: 'rdy' }); b.send({ t: 'rdy' });
  for (let i = 0; i < items.length; i++) {
    const qq = await a.next('q', m => m.i === i);
    const right = qq.choices.indexOf(items[i].choices[items[i].answer]);
    a.send({ t: 'an', i, c: right, e: 0 }); b.send({ t: 'an', i, c: (right + 1) % qq.choices.length, e: 0 });
    const ph = await h.next('ph', m => m.phase === 'between');
    h.send({ t: 'h', a: 'next', at: ph.seq });
  }
  await a.next('bye');
  // in memory: the summary's items
  const sum = s.summary;
  assert.deepEqual(sum.items.map(it => it.cat), ['1B-AP-10', '1B-AP-15', undefined]);
  assert.deepEqual(sum.items.map(it => it.secs), [15, 20, 10]);
  // saved: live_runs.items
  const saved = JSON.parse(q.get('SELECT items FROM live_runs WHERE id=?', s.id).items);
  assert.equal(saved.length, 3);
  assert.deepEqual(Object.keys(saved[0]).sort(), ['answer', 'answered', 'cat', 'choices', 'counts', 'q', 'right', 'secs', 'top_wrong']);
  assert.equal(saved[0].cat, '1B-AP-10'); assert.equal(saved[0].secs, 15); assert.equal(saved[0].right, 1); assert.equal(saved[0].answered, 2);
  assert.equal(saved[1].cat, '1B-AP-15'); assert.equal(saved[1].secs, 20);
  assert.ok(!('cat' in saved[2]), 'an item without a category saves as before'); assert.equal(saved[2].secs, 10);
  // the saved run's page and CSV still work with the extra field
  assert.ok(R.persisted(teacher, s.id).items.every((it, i) => it.cat === items[i].cat));
  assert.match(R.csv({ players: [], items: saved }), /^question,right,answered,choice_a,choice_b,choice_c,choice_d\r\nWhich block repeats what is inside it\?,1,2,[01],[01],[01],[01]\r\n/m);
  // "play the missed questions again" keeps the category, so the next run's results carry it too
  const missed = R.missedOf(saved);
  assert.ok(missed.ok && missed.items.length === 3);
  assert.equal(missed.items.find(it => it.q === items[0].q).cat, '1B-AP-10');
  assert.ok(!('cat' in missed.items.find(it => it.q === items[2].q)));
  // (choices were shuffled once when the question opened: compare by the right answer's text, not its slot)
  const plain = R.asItem(saved[2]);
  assert.deepEqual(Object.keys(plain).sort(), ['answer', 'choices', 'q', 'secs']);
  assert.equal(plain.choices[plain.answer], 'yes'); assert.equal(plain.secs, 10);
  for (const c of [h, a, b]) c.ws.close();
});

test('itemRow: cat only when the item has one; nothing a player sent', () => {
  const base = { q: 'Q', right: 1, answered: 2, choices: ['a', 'b'], answer: 0, secs: 15, counts: [1, 1] };
  assert.deepEqual(R.itemRow({ ...base, cat: 'Loops', topWrong: 'b' }), { ...base, top_wrong: 'b', cat: 'Loops' });
  assert.deepEqual(R.itemRow({ ...base, cat: '' }), base);
  assert.deepEqual(R.itemRow({ i: 3, right: 0, answered: 0, nick: 'never saved' }), { i: 3, right: 0, answered: 0 });
});
