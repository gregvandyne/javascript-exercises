// Oomba does it: the framework (docs/decisions.md "Oomba does it: one confirm card for any teacher action";
// services/companion-actions/index.js). One doAction tool listing every registered action; refusals say "Nothing was
// changed."; one action per answer; Not now does nothing; a used card does nothing; the registry checks each action.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const H = await import('./_companion-actions-harness.js');
const CO = await import('../../server/services/companion.js');
const AC = await import('../../server/services/companion-actions/index.js');
const S = await import('../../server/services/schools.js');
H.boot();

test('one doAction tool lists every registered action; its schema names them; howTo points to it', async () => {
  const tool = CO.TOOLS.find(t => t.name === 'doAction');
  assert.ok(tool && CO.TOOL_NAMES.includes('doAction'));
  assert.ok(AC.actionIds().length >= 4);
  for (const id of AC.actionIds()) assert.match(tool.description, new RegExp(`- ${id} \\(`));
  assert.deepEqual(tool.input_schema.properties.action.enum, AC.actionIds());
  const x = H.world();
  const calls = H.standIn((p, i) => (i === 0 ? H.toolUse('howTo', { task: 'due-dates' }) : 'I can do it.'));
  await H.say(x, 'How do I change a due date?', { type: 'dashboard', classId: x.A.id });
  assert.match(H.resultOf(calls).note, /doAction changeDue/);
});

test('the registry refuses an action with a repeated id, an unknown risk or a missing function', () => {
  const ok = { id: 'zzTest', area: 'test', risk: 'normal', undoable: false, label: '', params: {}, plan() {}, view() {}, run() {}, doneView() {} };
  assert.throws(() => AC.register([{ ...ok, id: 'renameClass' }]), /repeated/);
  assert.throws(() => AC.register([{ ...ok, risk: 'scary' }]), /risk/);
  assert.throws(() => AC.register([{ ...ok, run: undefined }]), /run\(\) is missing/);
  assert.throws(() => AC.register([{ ...ok, undoable: true }]), /undoable without undo/);
});

test('refusals: not their class, an unknown action, nothing to change; several classes: the app asks which', async () => {
  const x = H.world();
  await H.refused(x, 'renameClass', { classRef: 'Room 20 Bears', name: 'Mine now' }, /not one of the teacher's classes/, { type: 'teach' });
  await H.refused(x, 'renameClass', { classRef: x.O.id, name: 'Mine now' }, /not one of the teacher's classes/, { type: 'teach' });
  assert.equal(S.getClass(x.O.id).name, 'Room 20 Bears');
  await H.refused(x, 'blowUp', {}, /no such action/);
  await H.refused(x, 'renameClass', {}, /Say what to change/);
  const w = await H.ask(x, 'renameClass', { name: 'New name' }, { type: 'teach' });
  assert.equal(w.r.askedWhich, true);
  assert.deepEqual(w.bot.note.ask.options.map(o => o.label).sort(), ['Room 12 Owls', 'Room 14 Foxes']);
});

test('one action per answer; Not now changes nothing; a used card does nothing', async () => {
  const x = H.world();
  const calls = H.standIn((p, i) => (i === 0 ? { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'a1', name: 'doAction', input: { action: 'renameClass', params: { name: 'Owls One' } } }, { type: 'tool_use', id: 'a2', name: 'doAction', input: { action: 'renameClass', params: { name: 'Owls Two' } } }] } : 'Tap Do it.'));
  await H.say(x, 'Rename my class twice', { type: 'dashboard', classId: x.A.id });
  const res = calls[1].messages.at(-1).content;
  assert.equal(JSON.parse(res[0].content).waitingForTeacher, true);
  assert.match(JSON.parse(res[1].content).error, /One action per answer/);
  const bot = await H.lastBot(x);
  assert.equal(bot.note.action.state, 'open');
  assert.equal(S.getClass(x.A.id).name, 'Room 12 Owls', 'nothing before the tap');
  assert.equal((await H.act(x, bot.id, 'actionNo')).status, 200);
  assert.equal((await H.lastBot(x)).note.action.state, 'declined');
  assert.equal(S.getClass(x.A.id).name, 'Room 12 Owls');
  assert.equal((await H.act(x, bot.id, 'actionDo')).status, 404);
});
