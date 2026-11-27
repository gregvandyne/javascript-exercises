// Oomba's class actions (services/companion-actions/classes.js): addStudents (names typed on the card, never to the AI;
// one-time login cards) and renameClass (with Undo). Harness: tests/unit/_companion-actions-harness.js.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const H = await import('./_companion-actions-harness.js');
const S = await import('../../server/services/schools.js');
H.boot();

test('addStudents: a card with a box for names; nothing made before Do it; names never to the AI or the chat; login cards', async () => {
  const x = H.world();
  const before = S.roster(x.A.id).length;
  const first = await H.ask(x, 'addStudents', {}, { type: 'dashboard', classId: x.A.id }, 'Add three new kids to my class');
  assert.equal(first.r.waitingForTeacher, true);
  assert.match(first.r.note, /Nothing is done yet/);
  assert.equal(first.card.state, 'open'); assert.equal(first.card.input, 'list'); assert.equal(first.card.undoable, false);
  assert.match(first.card.warn, /accounts for children/); assert.match(first.card.title, /Room 12 Owls/);
  assert.equal(S.roster(x.A.id).length, before, 'the dry run made nothing');
  // No names: asked for them, nothing made, the card stays open.
  assert.equal((await H.act(x, first.bot.id, 'actionDo', '  ')).status, 400);
  // A name the school already has: the card says so (without the name), nothing made.
  assert.equal((await H.act(x, first.bot.id, 'actionDo', 'Maya Brook\nZara Quinn')).status, 200);
  const failed = (await H.chatOf(x)).turns.find(t => t.id === first.bot.id).note.action;
  assert.equal(failed.state, 'failed'); assert.match(failed.why, /1 name already has an account/);
  assert.equal(S.roster(x.A.id).length, before);
  // Too many at once.
  const many = await H.ask(x, 'addStudents', {});
  await H.act(x, many.bot.id, 'actionDo', Array.from({ length: 41 }, (_, k) => `Kid Number ${k}`).join('\n'));
  assert.match((await H.chatOf(x)).turns.find(t => t.id === many.bot.id).note.action.why, /At most 40/);
  // The real names.
  const again = await H.ask(x, 'addStudents', {});
  const done = await H.doIt(x, again.bot, 'Ava Reed\nBen Fox');
  const names = S.roster(x.A.id).filter(p => p.role === 'student').map(p => p.roster_name);
  assert.ok(names.includes('Ava Reed') && names.includes('Ben Fox'));
  assert.match(done.change.lines[0], /Added 2 students to Room 12 Owls/);
  assert.equal(done.change.canUndo, false);
  const cards = done.change.links.find(l => l.href.startsWith('/cards/'));
  assert.ok(cards, 'a link to the new login cards');
  const page = await H.get(cards.href, x.tc);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /Ava Reed/); assert.match(html, /Ben Fox/);
  // Another teacher cannot open those cards.
  assert.notEqual((await H.get(cards.href, H.cookieFor(x.other.id))).status, 200);
  const sent = H.sentToAi([first.calls, many.calls, again.calls]), kept = H.storedTurns(x);
  for (const nm of ['Ava Reed', 'Ben Fox', 'Zara Quinn', 'Kid Number']) { assert.ok(!sent.includes(nm), `${nm} went to the AI`); assert.ok(!kept.includes(nm), `${nm} kept in the chat`); }
});

test('renameClass: name and grade change on Do it (the class page\'s own service); Undo puts them back', async () => {
  const x = H.world();
  const c = await H.ask(x, 'renameClass', { name: 'Room 12 Eagles', grade: '4' });
  assert.equal(c.card.warn, undefined, 'a normal action has no warning');
  assert.ok(c.card.lines.some(l => /Room 12 Eagles/.test(l)));
  assert.equal(S.getClass(x.A.id).name, 'Room 12 Owls');
  const done = await H.doIt(x, c.bot);
  assert.equal(S.getClass(x.A.id).name, 'Room 12 Eagles'); assert.equal(S.getClass(x.A.id).grade, '4');
  assert.match(done.change.lines[0], /Room 12 Eagles/);
  await H.undo(x, done.id);
  assert.equal(S.getClass(x.A.id).name, 'Room 12 Owls'); assert.equal(S.getClass(x.A.id).grade, '3');
  // A student's name is never a class name.
  await H.refused(x, 'renameClass', { name: 'Maya Brook' }, /student's name/);
});
