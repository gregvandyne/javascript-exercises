// Oomba's assignment actions (services/companion-actions/assignments.js): changeDue and unassign, with Undo.
// Harness: tests/unit/_companion-actions-harness.js.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const H = await import('./_companion-actions-harness.js');
const L = await import('../../server/services/lessons.js');
const GF = await import('../../server/services/game-folders.js');
const G = await import('../../server/services/games.js');
H.boot();
const wordHunt = x => { const a = GF.assignGame(x.teacher, x.A.id, G.getGameBySlug('word-hunt').id, {}); assert.ok(a.ok, JSON.stringify(a)); return a.classLesson.id; };
const day = ms => (ms === null ? null : new Date(ms).toISOString().slice(0, 10));

test('changeDue: the due day changes only on Do it (L.updateAssignment), read back; Undo puts the old one back', async () => {
  const x = H.world();
  const clId = wordHunt(x);
  const { r, bot, card } = await H.ask(x, 'changeDue', { assignment: 'word hunt', due: '2026-12-04' });
  assert.equal(r.waitingForTeacher, true, JSON.stringify(r));
  assert.match(card.title, /Word Hunt/); assert.match(card.title, /Room 12 Owls/);
  assert.equal(L.getClassLesson(clId).due_at, null, 'nothing before the tap');
  const done = await H.doIt(x, bot);
  assert.equal(day(L.getClassLesson(clId).due_at), '2026-12-04');
  assert.ok(done.change.lines.some(l => /Due/.test(l)));
  await H.undo(x, done.id);
  assert.equal(L.getClassLesson(clId).due_at, null);
  // The open day.
  const two = await H.ask(x, 'changeDue', { assignment: 'Word Hunt', opens: '2026-12-01' });
  await H.doIt(x, two.bot);
  assert.equal(day(L.getClassLesson(clId).opens_at), '2026-12-01');
  await H.refused(x, 'changeDue', { assignment: 'nothing like it', due: '2026-12-04' }, /No assignment/);
  await H.refused(x, 'changeDue', { assignment: 'word hunt', due: 'Friday' }, /YYYY-MM-DD/);
  await H.refused(x, 'changeDue', { assignment: 'word hunt' }, /Say the new due day/);
});

test('unassign: taken off on Do it, students\' work kept; Undo brings it back', async () => {
  const x = H.world();
  const clId = wordHunt(x);
  const { bot, card } = await H.ask(x, 'unassign', { assignment: 'Word Hunt' });
  assert.match(card.warn, /Students' work is kept/);
  assert.ok(L.getClassLesson(clId), 'still there before the tap');
  const done = await H.doIt(x, bot);
  assert.equal(L.getClassLesson(clId), null);
  await H.undo(x, done.id);
  assert.ok(L.getClassLesson(clId), 'back with Undo (the same assignment)');
  await H.refused(x, 'unassign', { assignment: 'Word Hunt', classRef: 'Room 14 Foxes' }, /nothing assigned/, { type: 'teach' });
});
