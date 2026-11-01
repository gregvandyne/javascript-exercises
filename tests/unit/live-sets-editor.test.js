// Question sets for live quizzes: teachers write any questions they like (up to 100, 2-4 answers, 5 s to 2 min), paste
// them from a spreadsheet or a document, draft them with AI (edited before saving) and copy a colleague's shared set.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';

const { parsePasted, SECS, MAX } = await import('../../public/js/live-paste.js');
const SETS = await import('../../server/services/classlive-sets.js');
const { createUser } = await import('../../server/auth.js');

test('the editor and the server agree on the limits', () => {
  assert.deepEqual(SECS, SETS.SECS);
  assert.equal(MAX.items, SETS.LIMITS.items); assert.equal(MAX.q, SETS.LIMITS.q); assert.equal(MAX.choice, SETS.LIMITS.choice);
});

test('paste from a spreadsheet: question, right answer, wrong answers, optional seconds; a header row is skipped', () => {
  const rows = ['Question\tRight\tWrong 1\tWrong 2', 'Capital of Peru?\tLima\tCusco\tQuito\tBogotá\t45', 'Is π about 3.14?\tTrue\tFalse', 'only one cell', ''].join('\n');
  assert.deepEqual(parsePasted(rows), [
    { q: 'Capital of Peru?', choices: ['Lima', 'Cusco', 'Quito', 'Bogotá'], answer: 0, secs: 45 },
    { q: 'Is π about 3.14?', choices: ['True', 'False'], answer: 0, secs: 20 },
  ]);
});

test('paste typed questions: blocks, a * marks the right answer, numbering dropped, numbers kept', () => {
  const text = '1. Which is a prime number?\na) 9\nb) 15\nc) 13 *\n\n2) What is 3.5 × 2?\n6.5\n* 7\n7.5\n\nno answers here';
  assert.deepEqual(parsePasted(text), [
    { q: 'Which is a prime number?', choices: ['9', '15', '13'], answer: 2, secs: 20 },
    { q: 'What is 3.5 × 2?', choices: ['6.5', '7', '7.5'], answer: 1, secs: 20 },
  ]);
});

test('sets take any subject at any level: long questions, 100 items, every time from 5 s to 2 min', () => {
  const t = createUser({ username: 'QuizTeacher1', password: 'a-long-password-1', accountType: 'grownup' });
  const long = 'In the passage, the author argues that industrialisation changed family life. '.repeat(3).slice(0, 300);
  const items = Array.from({ length: 100 }, (_, i) => ({ q: `${long.slice(0, 280)} ${i}`, choices: ['A much longer answer that a high-school class might need to read carefully', 'B', 'C', 'D'], answer: i % 4, secs: SECS[i % SECS.length] }));
  const r = SETS.createSet(t, { title: 'Year 11 history', items });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(SETS.itemsOf(r.set).length, 100);
  assert.equal(SETS.createSet(t, { title: 'Too many', items: [...items, items[0]] }).code, 'items');
  assert.equal(SETS.createSet(t, { title: 'Odd time', items: [{ q: 'x?', choices: ['a', 'b'], answer: 0, secs: 7 }] }).ok, true, 'an odd time becomes 20 s');
});

test('a copy of a set is the copier\'s own, not shared', () => {
  const a = createUser({ username: 'QuizTeacher2', password: 'a-long-password-1', accountType: 'grownup' });
  const b = createUser({ username: 'QuizTeacher3', password: 'a-long-password-1', accountType: 'grownup' });
  const set = SETS.createSet(a, { title: 'Mine', items: [{ q: 'Q?', choices: ['a', 'b'], answer: 1, secs: 10 }] }).set;
  const c = SETS.copySet(a, set.id);
  assert.equal(c.ok, true); assert.notEqual(c.set.id, set.id); assert.equal(c.set.owner_id, a.id); assert.equal(c.set.shared, 0);
  assert.deepEqual(SETS.itemsOf(c.set), SETS.itemsOf(set));
  assert.equal(SETS.copySet(b, set.id).code, 'notFound', 'not a set they may use');
});

test('AI drafts: questions at the asked level, the right answer placed and kept, true/false in order, sizes clipped', async () => {
  const http = await import('node:http');
  let asked = null;
  const reply = { title: 'Linear equations', items: [
    { q: 'Solve 3x + 5 = 20.', right: 'x = 5', wrong: ['x = 3', 'x = 15', 'x = 5'], secs: 40 },
    { q: 'A linear equation can have exactly one solution.', right: 'True', wrong: ['False'], secs: 12 },
    { q: '', right: 'x', wrong: ['y'], secs: 20 },
  ] };
  const fake = http.createServer((req, res) => {
    let b = ''; req.on('data', c => { b += c; }); req.on('end', () => {
      asked = JSON.parse(b);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ id: 'm1', type: 'message', role: 'assistant', model: 'fake', stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 10 }, content: [{ type: 'text', text: JSON.stringify(reply) }] }));
    });
  }).listen(0);
  await new Promise(r => fake.once('listening', r));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${fake.address().port}`;
  const { config } = await import('../../server/config.js');
  const { draftQuestions } = await import('../../server/services/set-ai.js');
  const saved = config.anthropicKey;
  try {
    config.anthropicKey = '';
    assert.equal((await draftQuestions({ topic: 'x' })).code, 'aiOff');
    config.anthropicKey = 'test-key';
    const r = await draftQuestions({ topic: 'solving linear equations', level: 'Grade 8 algebra', count: 3, kind: 'mixed' });
    assert.equal(r.ok, true);
    assert.match(asked.messages[0].content, /Grade 8 algebra/);
    assert.equal(r.items.length, 2, 'a question without words is dropped');
    const [a, b] = r.items;
    assert.equal(a.choices[a.answer], 'x = 5'); assert.deepEqual([...a.choices].sort(), ['x = 15', 'x = 3', 'x = 5']); assert.equal(a.secs, 45);
    assert.deepEqual(b.choices, ['True', 'False']); assert.equal(b.answer, 0); assert.equal(b.secs, 10);
    assert.equal(SETS.cleanItems(r.items).ok, true, 'a draft saves as it is');
  } finally { config.anthropicKey = saved; fake.close(); }
});
