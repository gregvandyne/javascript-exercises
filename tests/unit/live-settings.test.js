// Oomba Live game settings and the teacher dashboard's needs-help rules (services/classlive-settings.js,
// classlive-dash.js; docs/decisions.md "Oomba Live, part 3"): defaults per room, cleaning (unknown keys, bad values,
// lobby-only keys after start, real names only in a teacher's own class room), late join stored as the existing
// autoLock, remembered defaults, and each needs-help rule.
import { reset, teacher } from './_live.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const ST = await import('../../server/services/classlive-settings.js');
const D = await import('../../server/services/classlive-dash.js');

test.beforeEach(() => reset());

test('defaults per room', () => {
  assert.deepEqual(ST.DEFAULTS('class', 'accounts'), { secs: 0, count: 0, shuffleQ: false, shuffleA: true, points: 'speed', board: 'all', late: true, names: 'names', sound: true, emotes: true });
  const open = ST.DEFAULTS('open');
  assert.equal(open.board, 'top5'); assert.equal(open.late, false); assert.equal(open.names, 'nicknames');
  assert.equal(ST.DEFAULTS('family').late, true);
});

test('clean: unknown keys and bad values dropped; lobby-only keys after start; names only for account rooms; form values', () => {
  assert.deepEqual(ST.clean({ secs: 20, count: 7, board: 'off', evil: 1, points: 'fast', sound: false }), { secs: 20, board: 'off', sound: false });
  assert.deepEqual(ST.clean({ secs: 20, count: 5, points: 'accuracy', board: 'top5', late: false }, { lobby: false }), { board: 'top5', late: false });
  assert.deepEqual(ST.clean({ names: 'names' }), {}, 'real names only where the room shows account names');
  assert.deepEqual(ST.clean({ names: 'names' }, { nameMode: 'accounts' }), { names: 'names' });
  assert.deepEqual(ST.clean({ secs: '30', shuffleQ: ['0', '1'], shuffleA: '0', emotes: 'on' }), { secs: 30, shuffleQ: true, shuffleA: false, emotes: true });
  assert.deepEqual(ST.clean(null), {}); assert.deepEqual(ST.clean([1]), {});
});

test('late join is the existing autoLock: before start it decides the lock at start; after start it locks or unlocks now', () => {
  const s = { phase: 'lobby', settings: ST.initial({ maxPlayers: 30, locked: false, autoLock: true }, 'open', 'nicknames') };
  assert.equal(s.settings.autoLock, true); assert.equal(s.settings.maxPlayers, 30);
  assert.deepEqual(ST.apply(s, { late: true }), { changed: ['late'], lock: null });
  assert.equal(s.settings.autoLock, false); assert.equal(s.settings.locked, false);
  s.phase = 'playing';
  assert.deepEqual(ST.apply(s, { late: false }), { changed: ['late'], lock: true });
  assert.equal(s.settings.locked, true);
  assert.deepEqual(ST.apply(s, { late: false }), { changed: [], lock: null }, 'no change, nothing sent');
  assert.equal(ST.view(s.settings).late, false);
  assert.deepEqual(ST.publicPart(s.settings), { board: 'top5', emotes: true, names: 'nicknames' });
  const chosen = ST.initial({ maxPlayers: 30, locked: false, autoLock: false }, 'class', 'accounts', { late: false, board: 'off', bogus: 1 });
  assert.equal(chosen.autoLock, true); assert.equal(chosen.board, 'off'); assert.equal(chosen.bogus, undefined);
});

test('remembered defaults: saved, loaded (cleaned), reset', () => {
  assert.equal(ST.loadPrefs(teacher.id), null);
  ST.savePrefs(teacher.id, { settings: { secs: 20, board: 'off', evil: 'x' }, teams: { on: true, n: 4, scoring: 'sum' } });
  assert.deepEqual(ST.loadPrefs(teacher.id), { settings: { secs: 20, board: 'off' }, teams: { on: true, n: 4, scoring: 'sum' } });
  assert.ok(ST.resetPrefs(teacher.id));
  assert.equal(ST.loadPrefs(teacher.id), null);
});

test('needs help: each rule; offline is a status, not a flag; game modes only by accuracy', () => {
  const seat = (o = {}) => ({ answered: 0, correct: 0, wrongRun: 0, missRun: 0, conn: {}, ...o });
  assert.equal(D.needsHelp(seat({ answered: 2, correct: 0 })), '', 'fewer than 3 answered');
  assert.equal(D.needsHelp(seat({ answered: 4, correct: 1 })), 'lowScore');
  assert.equal(D.needsHelp(seat({ answered: 4, correct: 2 })), '');
  assert.equal(D.needsHelp(seat({ answered: 2, correct: 1, wrongRun: 2 })), 'wrongRun');
  assert.equal(D.needsHelp(seat({ missRun: 2 })), 'missRun');
  assert.equal(D.needsHelp(seat({ missRun: 2, conn: null })), '', 'missed while offline: not flagged');
  assert.equal(D.needsHelp(seat({ wrongRun: 3 }), { quiz: false }), '');
  assert.equal(D.needsHelp(seat({ answered: 3, correct: 1 }), { quiz: false }), 'lowScore');
});
