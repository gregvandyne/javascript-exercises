// Oomba's live-game and class-dashboard actions (services/companion-actions/live.js, dashboard.js): hostLive (the same
// quick room as POST /api/live/quick; hidden games never offered; Undo while nobody started it), endLive, the dashboard's
// timer, Eyes up, quick checks, the random picker (the name on the teacher's card only, never to the AI) and pushes to
// students' screens (official games that are not hidden, approved links). Harness: tests/unit/_companion-actions-harness.js.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const H = await import('./_companion-actions-harness.js');
const { config } = await import('../../server/config.js');
const { q } = await import('../../server/db.js');
const LS = await import('../../server/services/classlive-sessions.js');
const D = await import('../../server/services/dash.js');
const games = await import('../../server/services/games.js');
const { isOfficial } = await import('../../server/services/classlive-access.js');
const { gameHidden } = await import('../../server/services/game-focus.js');
H.boot();
// The live rooms these tests open live in memory, with their timers: gone at the end, so the process can exit.
test.after(() => LS._reset());

const NAMES = ['Maya Brook', 'Leo Stone'];
const noNames = (x, ...calls) => {
  const sent = H.sentToAi(calls), kept = H.storedTurns(x);
  for (const n of NAMES) { assert.ok(!sent.includes(n), `${n} went to the AI`); assert.ok(!kept.includes(n), `${n} kept in the chat`); }
};
const room = x => { const s = LS.hostSession(x.teacher.id); return s && s.phase !== 'ended' ? s : null; };

// ---------------------------------------------------------------- live games
test('hostLive: a card first, no room before the tap; Do it opens the quick room for the class; Undo closes it while nobody started it', async () => {
  const x = H.world();
  const c = await H.ask(x, 'hostLive', { topic: 'science' }, undefined, 'Start a live game with my class');
  assert.equal(c.r.waitingForTeacher, true, JSON.stringify(c.r));
  assert.match(c.r.what, /Room 12 Owls/); assert.match(c.r.what, /science/);
  assert.equal(c.card.state, 'open'); assert.equal(c.card.undoable, true);
  assert.match(c.card.title, /Start a live game for Room 12 Owls/);
  assert.match(c.card.warn, /Students will see this/);
  assert.ok(c.card.lines.some(l => /Science/.test(l)), JSON.stringify(c.card.lines));
  assert.equal(room(x), null, 'no room before the tap');
  const done = await H.doIt(x, c.bot);
  const s = room(x);
  assert.ok(s, 'the room is open'); assert.equal(s.classId, x.A.id); assert.equal(s.audience, 'class');
  assert.ok(done.change.links.some(l => l.href === `/live/host/${s.id}` && l.primary));
  assert.match(done.change.lines[0], /students join from their class page/);
  // A second one while it is open: refused before any card.
  await H.refused(x, 'hostLive', {}, /live game open already/);
  await H.undo(x, done.id);
  assert.equal(LS.get(s.id).phase, 'ended');
  assert.equal(room(x), null);
  noNames(x, c.calls);
});

test('hostLive: Undo refuses once the game has started; endLive ends it (a card first, no Undo)', async () => {
  const x = H.world();
  const c = await H.ask(x, 'hostLive', {});
  const done = await H.doIt(x, c.bot);
  const s = room(x);
  s.startedAt = Date.now();   // the host pressed Start
  const r = await H.post('/api/companion/chat/undo', { turnId: done.id }, x.tc);
  assert.equal(r.status, 400);
  assert.ok(room(x), 'a game being played is not ended by Undo');
  const e = await H.ask(x, 'endLive', {}, { type: 'teach' }, 'End the live game');
  assert.equal(e.r.waitingForTeacher, true, JSON.stringify(e.r));
  assert.match(e.card.warn, /ends on every screen/); assert.equal(e.card.undoable, false);
  assert.match(e.card.lines[0], /Nobody has joined yet/);
  assert.ok(room(x), 'nothing before the tap');
  const ended = await H.doIt(x, e.bot);
  assert.equal(room(x), null); assert.equal(LS.get(s.id).phase, 'ended');
  assert.equal(ended.change.canUndo, false);
  assert.ok(ended.change.links.some(l => l.href === `/live/results/${s.id}`));
  await H.refused(x, 'endLive', {}, /no live game open/, { type: 'teach' });
});

test('hostLive: hidden games are never offered (Brain Board while Quest Race and Question Battle are hidden)', async () => {
  const was = { arcade: config.arcade, removed: config.removedGames };
  config.arcade = false; config.removedGames = ['tug-of-math', 'question-battle'];
  try {
    const x = H.world();
    await H.refused(x, 'hostLive', { game: 'battle' }, /not on offer/);
    await H.refused(x, 'hostLive', { game: 'quest-race' }, /not on offer/);
    const c = await H.ask(x, 'hostLive', {});
    assert.match(c.r.what, /: board,/);
    await H.doIt(x, c.bot);
    assert.equal(room(x).mode, 'board');
    LS.endSession(room(x).id, 'ended');
  } finally { config.arcade = was.arcade; config.removedGames = was.removed; }
});

test('hostLive and endLive refusals end "Nothing was changed."', async () => {
  const x = H.world();
  await H.refused(x, 'hostLive', { topic: 'astrology' }, /no such subject/);
  await H.refused(x, 'hostLive', { level: 'a99' }, /no such level/);
  await H.refused(x, 'hostLive', { classRef: 'Room 20 Bears' }, /not one of the teacher's classes/, { type: 'teach' });
  await H.refused(x, 'endLive', {}, /no live game open/);
  config.liveClassroom = false;
  try { await H.refused(x, 'hostLive', {}, /not available/); } finally { config.liveClassroom = true; }
  assert.equal(room(x), null);
});

// ---------------------------------------------------------------- the class dashboard
const timerLayout = (x, c = x.A, widgets = [{ id: 'tm1', type: 'timer', x: 0, y: 0, w: 4, h: 4, s: { minutes: 5 } }]) => {
  const r = D.createLayout(x.teacher, c, { name: 'Lesson', widgets }); assert.ok(!r.error, JSON.stringify(r));
};
const timerOf = (c, wid = 'tm1') => (JSON.parse(D.classState(c.id).timers || '{}') || {})[wid] || null;

test('startTimer, pauseTimer, resetTimer: the dashboard timer changes only on Do it', async () => {
  const x = H.world();
  timerLayout(x);
  let c = await H.ask(x, 'startTimer', { minutes: 10 });
  assert.equal(c.r.waitingForTeacher, true, JSON.stringify(c.r));
  assert.equal(c.card.warn, undefined); assert.match(c.card.title, /Start the timer on the Room 12 Owls dashboard/);
  assert.ok(c.card.lines.some(l => /10 minutes/.test(l)));
  assert.equal(timerOf(x.A), null, 'nothing before the tap');
  let done = await H.doIt(x, c.bot);
  assert.equal(timerOf(x.A).on, true); assert.equal(timerOf(x.A).dur, 600000);
  assert.match(done.change.lines[0], /is running/);
  assert.ok(done.change.links.some(l => l.href === `/class/${x.A.id}/dashboard`));
  c = await H.ask(x, 'pauseTimer', {});
  assert.equal(timerOf(x.A).on, true);
  await H.doIt(x, c.bot);
  assert.equal(timerOf(x.A).on, false);
  c = await H.ask(x, 'resetTimer', {});
  done = await H.doIt(x, c.bot);
  assert.equal(timerOf(x.A).base, 0); assert.equal(timerOf(x.A).on, false);
  assert.equal(done.change.canUndo, false);
  // No timer on the dashboard; several timers: which one.
  await H.refused(x, 'startTimer', {}, /no timer/, { type: 'dashboard', classId: x.B.id });
  timerLayout(x, x.B, [{ id: 'ta', type: 'timer', x: 0, y: 0, w: 4, h: 4, s: { minutes: 5 } }, { id: 'tb', type: 'timer', x: 4, y: 0, w: 4, h: 4, s: { mode: 'stopwatch' } }]);
  await H.refused(x, 'startTimer', {}, /timer 1 \(5-minute timer\), timer 2 \(stopwatch\)/, { type: 'dashboard', classId: x.B.id });
  await H.refused(x, 'startTimer', { timer: 2, minutes: 3 }, /stopwatch has no minutes/, { type: 'dashboard', classId: x.B.id });
  c = await H.ask(x, 'startTimer', { timer: 2 }, { type: 'dashboard', classId: x.B.id });
  await H.doIt(x, c.bot);
  assert.equal(timerOf(x.B, 'tb').on, true); assert.equal(timerOf(x.B, 'ta'), null);
});

test('eyesUp: on and off on Do it (students\' screens); Undo puts it back', async () => {
  const x = H.world();
  let c = await H.ask(x, 'eyesUp', {});
  assert.match(c.card.warn, /on their screens/); assert.match(c.card.title, /Turn on Eyes up for Room 12 Owls/);
  assert.equal(D.eyesOf(x.A.id), null);
  let done = await H.doIt(x, c.bot);
  assert.ok(D.eyesOf(x.A.id));
  await H.undo(x, done.id);
  assert.equal(D.eyesOf(x.A.id), null);
  await H.refused(x, 'eyesUp', { on: 'off' }, /not on/);
  done = await H.doIt(x, (await H.ask(x, 'eyesUp', { on: 'on' })).bot);
  c = await H.ask(x, 'eyesUp', { on: 'off' });
  assert.match(c.card.title, /Turn off Eyes up/);
  assert.ok(D.eyesOf(x.A.id));
  done = await H.doIt(x, c.bot);
  assert.equal(D.eyesOf(x.A.id), null);
  assert.match(done.change.lines[0], /Eyes up is off for Room 12 Owls/);
  // Not their class's dashboard.
  await H.refused(x, 'eyesUp', { classRef: x.O.id }, /not one of the teacher's classes|None of the teacher's classes/, { type: 'teach' });
  assert.equal(D.eyesOf(x.O.id), null);
});

test('quickCheck and endCheck: sent on Do it, Undo ends it; a choice needs options; no student names', async () => {
  const x = H.world();
  const open = () => q.get('SELECT COUNT(*) n FROM dash_checks WHERE class_id=? AND ended_at IS NULL', x.A.id).n;
  let c = await H.ask(x, 'quickCheck', { checkKind: 'thumbs', question: 'Did that make sense?' });
  assert.match(c.card.warn, /on their screens/);
  assert.ok(c.card.lines.includes('Did that make sense?')); assert.ok(c.card.lines.some(l => /Thumbs up/.test(l)));
  assert.equal(open(), 0, 'nothing before the tap');
  let done = await H.doIt(x, c.bot);
  assert.equal(open(), 1);
  assert.ok(D.todaysPushes(x.A).some(p => p.kind === 'check'), 'on the students\' tray');
  await H.undo(x, done.id);
  assert.equal(open(), 0);
  await H.refused(x, 'quickCheck', { checkKind: 'choice', question: 'Which?', options: ['Only one'] }, /2 to 6 options/);
  await H.refused(x, 'endCheck', {}, /no quick check open/);
  // A student's name in the teacher's words is a placeholder, and a check never carries one.
  const named = await H.ask(x, 'quickCheck', { question: 'Is [student 1] ready?' }, undefined, 'Ask the class if Maya Brook is ready');
  assert.match(named.r.error, /student's name.*Nothing was changed\.$/);
  c = await H.ask(x, 'quickCheck', { checkKind: 'choice', question: 'Best snack?', options: ['Apple', 'Pear'] });
  assert.ok(c.card.lines.some(l => /Choices: Apple, Pear/.test(l)));
  await H.doIt(x, c.bot);
  c = await H.ask(x, 'endCheck', {});
  assert.match(c.card.warn, /goes from the students' screens/); assert.ok(c.card.lines.includes('Best snack?'));
  assert.equal(open(), 1);
  done = await H.doIt(x, c.bot);
  assert.equal(open(), 0); assert.equal(done.change.canUndo, false);
  noNames(x, named.calls);
});

test('pickName: the name is on the teacher\'s card only; the AI and the stored chat never get it', async () => {
  const x = H.world();
  const c = await H.ask(x, 'pickName', {}, undefined, 'Pick someone to answer');
  assert.equal(c.r.waitingForTeacher, true);
  assert.match(c.r.what, /never who/);
  assert.equal(c.card.warn, undefined); assert.match(c.card.title, /Pick a student at random in Room 12 Owls/);
  assert.equal(JSON.parse(D.classState(x.A.id).picker || '{}').last || null, null, 'nothing before the tap');
  const done = await H.doIt(x, c.bot);
  assert.match(done.change.lines[0], /^Picked: (Maya Brook|Leo Stone)$/);
  const last = JSON.parse(D.classState(x.A.id).picker).last;
  assert.ok([x.maya.id, x.leo.id].includes(last));
  assert.equal(done.change.canUndo, false);
  // After the tap, the next turn's history to the AI has no name either.
  const calls = H.standIn(() => 'Okay.');
  await H.say(x, 'Thanks', { type: 'dashboard', classId: x.A.id });
  noNames(x, c.calls, calls);
  await H.refused(x, 'pickName', {}, /no students to pick/, { type: 'dashboard', classId: x.B.id });
});

test('pushToScreens and endPush: an official game that is not hidden, or an approved link; Undo takes it off', async () => {
  const x = H.world();
  const g = games.listVisible(x.teacher, { official: true, limit: 60 }).find(y => isOfficial(y) && !gameHidden(y) && D.pushableGame(x.A, y));
  assert.ok(g, 'an official game the class can open');
  const on = () => q.get('SELECT COUNT(*) n FROM dash_pushes WHERE class_id=? AND ended_at IS NULL', x.A.id).n;
  let c = await H.ask(x, 'pushToScreens', { send: 'game', title: g.title });
  assert.equal(c.r.waitingForTeacher, true, JSON.stringify(c.r));
  assert.match(c.card.warn, /on their screens/); assert.ok(c.card.title.includes(g.title));
  assert.equal(on(), 0, 'nothing before the tap');
  let done = await H.doIt(x, c.bot);
  assert.equal(on(), 1);
  assert.ok(D.todaysPushes(x.A).some(p => p.title === g.title));
  await H.undo(x, done.id);
  assert.equal(on(), 0);
  // A link of the class.
  await H.refused(x, 'pushToScreens', { send: 'link', title: 'Fraction wall' }, /no approved links/);
  assert.ok(!D.addLink(x.teacher, x.A, { url: 'https://example.org/fractions', title: 'Fraction wall' }).error);
  c = await H.ask(x, 'pushToScreens', { send: 'link', title: 'fraction' });
  await H.doIt(x, c.bot);
  assert.ok(D.todaysPushes(x.A).some(p => p.title === 'Fraction wall'));
  c = await H.ask(x, 'endPush', {});
  assert.match(c.card.title, /Take “Fraction wall” off the screens of Room 12 Owls/);
  assert.match(c.card.warn, /goes from the students' screens/);
  done = await H.doIt(x, c.bot);
  assert.equal(on(), 0); assert.equal(done.change.canUndo, false);
  await H.refused(x, 'endPush', {}, /Nothing sent today/);
  await H.refused(x, 'pushToScreens', { send: 'game', title: 'No Such Game Anywhere' }, /No official game|No game has that title/);
  // A hidden game (ARCADE off) is never sent.
  const was = config.arcade;
  config.arcade = false;
  try {
    const hid = games.getGameBySlug('shark-plank');
    assert.ok(hid && gameHidden(hid));
    await H.refused(x, 'pushToScreens', { send: 'game', title: hid.title }, /No official game|No game has that title/);
    assert.equal(on(), 0);
  } finally { config.arcade = was; }
});
