// The Teacher view's "Show class-list names" (docs/decisions.md "Real scores in the gradebook"): the school's roster
// names beside the names shown in a class live game, asked for over its own staff-only API. They are never part of the
// session: the projector, the players and the socket never carry one. Everyone but a full-tier controller who manages
// the class gets 404.
import { reset, call, open, hostSocket, player, sleep, LS, auth, teacher, teacher2, cls, mia, leo, zed, kid, mum } from './_live.js';
import test from 'node:test';
import assert from 'node:assert/strict';

test.beforeEach(() => reset());
const items = n => Array.from({ length: n }, (_, i) => ({ q: `Q${i + 1}: pick yes`, choices: ['yes', 'no', 'maybe'], answer: 0, secs: 10 }));
const close = (...cs) => { for (const c of cs) c.ws.close(); };

test('roster names for the Teacher view: the class\'s teacher only, by seat; nothing on the projector, the players or the wire', async () => {
  const s = open(teacher, { mode: 'battle', items: items(2), audience: 'class', classId: cls.id });
  const h = await hostSocket(s, teacher);
  const a = await player(s, mia), b = await player(s, leo);
  await sleep(50);
  const api = `/api/live/host/${s.id}/roster-names`;
  const r = await call(api, { user: teacher });
  assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.deepEqual(Object.values(r.json.names).sort(), ['Leo Pupil', 'Mia Pupil']);
  const seatOf = u => [...s.seats.values()].find(x => x.userId === u.id).no;
  assert.equal(r.json.names[seatOf(mia)], 'Mia Pupil'); assert.equal(r.json.names[seatOf(leo)], 'Leo Pupil');
  // everyone else: a teacher of another class, the students in the game, a student of another class, a kid, a grown-up, a guest, nobody
  for (const u of [teacher2, mia, leo, zed, kid, mum]) {
    const x = await call(api, { user: u });
    assert.equal(x.status, 404, u.username); assert.doesNotMatch(x.text, /Pupil/);
  }
  // a guest has no account: refused before the route (the same answer as every other /live host API)
  const g0 = await call(api, { user: auth.createGuest() });
  assert.ok([401, 403, 404].includes(g0.status), `guest ${g0.status}`); assert.doesNotMatch(g0.text, /Pupil/);
  const out = await call(api);
  assert.ok([401, 302, 404].includes(out.status)); assert.doesNotMatch(out.text, /Pupil/);
  assert.equal((await call('/api/live/host/nope/roster-names', { user: teacher })).status, 404);
  // the Teacher view has the button (off: aria-pressed false, no name in the page); the projector page has neither
  const dash = await call(`/live/host/${s.id}/dash`, { user: teacher });
  assert.equal(dash.status, 200);
  assert.match(dash.text, /<button class="btn btn-sm" type="button" id="lv-dash-roster-toggle" aria-pressed="false" data-show="Show class-list names" data-hide="Hide class-list names"/);
  assert.doesNotMatch(dash.text, /Mia Pupil|Leo Pupil/, 'the names come only when the teacher asks');
  const host = await call(`/live/host/${s.id}`, { user: teacher });
  assert.equal(host.status, 200); assert.doesNotMatch(host.text, /lv-dash-roster-toggle|roster-names|Mia Pupil|Leo Pupil/);
  // nothing any socket got carries a roster name
  for (const c of [h, a, b]) assert.doesNotMatch(JSON.stringify(c.msgs), /Mia Pupil|Leo Pupil/);
  close(h, a, b);
});

test('an open room (guests) has no roster names: no button, and the API answers 404', async () => {
  const s = open(teacher, { mode: 'battle', items: items(2), audience: 'open' });
  const h = await hostSocket(s, teacher);
  const g = await player(s);
  assert.equal((await call(`/api/live/host/${s.id}/roster-names`, { user: teacher })).status, 404);
  assert.doesNotMatch((await call(`/live/host/${s.id}/dash`, { user: teacher })).text, /lv-dash-roster-toggle/);
  close(h, g);
});
