// Oomba Live teams (services/classlive-teams.js; docs/decisions.md "Oomba Live, part 3"): the presets (colour-blind-safe
// colours with readable ink, a shape for each), balancing with the fewest moves, shuffling, players choosing (lobby only,
// a cap, lock), placement (own team on rejoin -> the plan -> the smallest team, empty teams first), banking (a move
// mid-question counts from the next question; average vs total; a phone that drops mid-question), bonus points, empty
// teams unranked, the messages, and a class's saved teams (active students only, deleted with the class membership).
import { reset, q, S, auth, school, teacher, cls, mia, leo } from './_live.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const T = await import('../../server/services/classlive-teams.js');
const R = await import('../../server/services/classlive-results.js');

test.beforeEach(() => reset());

/** A fake session with n seats (all present), in the lobby. */
function fake(n = 0, extra = {}) {
  const s = { id: 'x', phase: 'lobby', seats: new Map(), teams: T.initial(), audience: 'open', classId: null, host: { userId: teacher.id }, gone: [], ...extra };
  for (let i = 1; i <= n; i++) add(s, i);
  return s;
}
const add = (s, no, userId = null) => { const seat = { no, userId, conn: { readyState: 1 }, everConnected: true, team: 0, score: 0 }; s.seats.set(no, seat); return seat; };
const sizes = s => s.teams.list.map(t => T.size(s, t.k));
let seed = 1;
const rnd = n => { seed = (seed * 16807) % 2147483647; return seed % n; };

/** WCAG contrast of two #RRGGBB colours. */
function contrast(a, b) {
  const lum = hex => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

test('presets: 8, all different (id, colour, shape, icon), ink readable on its colour (at least 4.5:1)', () => {
  assert.equal(T.PRESETS.length, 8);
  for (const k of ['id', 'color', 'shape', 'icon']) assert.equal(new Set(T.PRESETS.map(p => p[k])).size, 8, k);
  for (const p of T.PRESETS) assert.ok(contrast(p.color, p.ink) >= 4.5, `${p.id} ${contrast(p.color, p.ink).toFixed(2)}`);
  assert.deepEqual(T.DEFAULT_ORDER, [0, 1, 2, 3, 4, 5]);
  const named = T.presetsFor(k => `x:${k}`);
  assert.equal(named[3].name, 'x:live.team.preset.3'); assert.equal(named[3].shapeName, 'x:live.team.shape.heart');
});

test('on: 2 teams up to 12 seats, else 4; everyone balanced at once; off resets everything', () => {
  const small = fake(7); T.setup(small, null, rnd);
  assert.equal(small.teams.n, 2); assert.deepEqual(sizes(small).sort(), [3, 4]);
  const big = fake(13); T.setup(big, null, rnd);
  assert.equal(big.teams.n, 4); assert.deepEqual(sizes(big).sort(), [3, 3, 3, 4]);
  assert.ok([...big.seats.values()].every(x => x.team >= 1 && x.team <= 4));
  T.off(big);
  assert.equal(big.teams.on, false); assert.ok([...big.seats.values()].every(x => x.team === 0)); assert.equal(big.teams.byUser.size, 0);
});

test('balance: unassigned seats first, then the fewest moves (most recently joined first) until sizes differ by at most one', () => {
  const s = fake(6); T.setup(s, 2, rnd);
  for (const seat of s.seats.values()) seat.team = 1;          // 6 / 0
  assert.equal(T.balance(s, rnd), 3);
  assert.deepEqual(sizes(s), [3, 3]);
  assert.deepEqual(T.members(s, 2).map(x => x.no).sort(), [4, 5, 6], 'the latest to join moved');
  add(s, 7); add(s, 8);                                       // two with no team
  assert.equal(T.balance(s, rnd), 2);
  assert.deepEqual(sizes(s), [4, 4]);
  assert.equal(T.balance(s, rnd), 0, 'already balanced: nobody moves');
});

test('shuffle: random equal sizes; count changes re-home seats; presets swap when taken', () => {
  const s = fake(10); T.setup(s, 3, rnd);
  T.shuffle(s, rnd);
  assert.deepEqual(sizes(s).sort(), [3, 3, 4]);
  T.setCount(s, 2, rnd);
  assert.equal(s.teams.n, 2); assert.deepEqual(sizes(s), [5, 5]);
  assert.ok([...s.seats.values()].every(x => x.team === 1 || x.team === 2));
  T.setCount(s, 4, rnd);
  assert.deepEqual(s.teams.presets, [0, 1, 2, 3]); assert.deepEqual(sizes(s).sort(), [2, 2, 3, 3]);
  assert.ok(T.setPreset(s, 1, 2));
  assert.deepEqual(s.teams.presets, [2, 1, 0, 3], 'team 3 had preset 2: it takes team 1\'s old one');
  assert.ok(T.setPreset(s, 4, 7));
  assert.deepEqual(s.teams.presets, [2, 1, 0, 7]);
  assert.equal(T.setPreset(s, 5, 1), false, 'no team 5');
});

test('players choose: lobby only, when allowed, not locked, under the cap', () => {
  const s = fake(6); T.setup(s, 2, rnd);
  const one = [...s.seats.values()].find(x => x.team === 1);
  assert.equal(T.choose(s, one, 2), false, 'not allowed yet');
  s.teams.choose = true;
  assert.equal(T.chooseCap(s), 4);
  assert.ok(T.choose(s, one, 2));
  assert.deepEqual(sizes(s), [2, 4]);
  const another = T.members(s, 1)[0];
  assert.equal(T.choose(s, another, 2), false, 'team 2 is at the cap (ceil(6/2)+1 = 4)');
  s.teams.locked = true;
  assert.equal(T.choose(s, T.members(s, 2)[0], 1), false, 'locked');
  s.teams.locked = false; s.phase = 'playing';
  assert.equal(T.choose(s, T.members(s, 2)[0], 1), false, 'lobby only');
});

test('placement: own team on a rejoin, then the plan, then the smallest team (empty first; ties: the lower score)', () => {
  const s = fake(0); T.setup(s, 3, rnd);
  const a = add(s, 1, 'user-a'); T.place(s, a, rnd);
  const b = add(s, 2); T.place(s, b, rnd);
  const c = add(s, 3); T.place(s, c, rnd);
  assert.deepEqual(sizes(s), [1, 1, 1], 'each new seat to an empty team first');
  // A signed-in seat that comes back after its seat was freed goes back to its own team.
  const aTeam = a.team;
  s.seats.delete(1);
  const a2 = add(s, 4, 'user-a'); T.place(s, a2, rnd);
  assert.equal(a2.team, aTeam);
  // The plan: a saved class team.
  s.teams.plan = new Map([['user-p', 3]]);
  const p = add(s, 5, 'user-p'); T.place(s, p, rnd);
  assert.equal(p.team, 3);
  // Smallest by present members; a tie goes to the lower banked score.
  s.teams.list[0].avg = 500;  // team 1 leads
  const sizesNow = sizes(s);
  const d = add(s, 6); T.place(s, d, rnd);
  const min = Math.min(...sizesNow);
  const smallTeams = sizesNow.map((n, i) => (n === min ? i + 1 : 0)).filter(Boolean);
  assert.ok(smallTeams.includes(d.team));
  if (smallTeams.length > 1) assert.notEqual(d.team, 1, 'not the leading team on a tie');
  // A disconnected member does not count as present.
  const s2 = fake(0); T.setup(s2, 2, rnd);
  const x = add(s2, 1); T.assign(s2, x, 1); x.conn = null;
  const y = add(s2, 2); T.assign(s2, y, 2);
  const z = add(s2, 3); T.place(s2, z, rnd);
  assert.equal(z.team, 1, 'team 1 has nobody present');
});

test('banking: a move mid-question counts from the next question; average vs total; a phone that drops mid-question', () => {
  const s = fake(5); T.setup(s, 2, rnd);
  // Team 1: seats 1, 2, 3; team 2: seats 4, 5.
  [1, 2, 3].forEach(n => T.assign(s, s.seats.get(n), 1)); [4, 5].forEach(n => T.assign(s, s.seats.get(n), 2));
  const at = T.snapshot(s);
  T.move(s, s.seats.get(3), 2);    // moved while the question is open
  T.bankQuiz(s, at, new Map([[1, 1000], [2, 1000], [3, 1000], [4, 1000], [5, 1000]]), new Set([1, 2, 3, 4, 5]));
  const [t1, t2] = s.teams.list;
  assert.equal(t1.sum, 3000, 'seat 3\'s points went to the team it had when the question opened');
  assert.equal(t2.sum, 2000);
  assert.equal(t1.avg, 1000); assert.equal(t2.avg, 1000, 'all right: the same average, whatever the size');
  assert.equal(T.ranked(s).find(r => r.k === 1).rank, 1); assert.equal(T.ranked(s).find(r => r.k === 2).rank, 1, 'a tie shares the rank');
  s.teams.scoring = 'sum';
  assert.equal(T.ranked(s)[0].k, 1);
  // Next question: seat 3 counts for team 2 now. Seat 5's phone drops and it never answers: not a participant.
  const at2 = T.snapshot(s);
  s.seats.get(5).conn = null;
  T.bankQuiz(s, at2, new Map([[1, 0], [2, 0], [3, 600], [4, 600]]), new Set([1, 2, 3, 4]));
  assert.equal(t2.sum, 3200); assert.equal(t2.avg, 1000 + 1200 / 2, '2 participants (seat 5 offline, no answer)');
  // Seat 4 answered and then dropped: still a participant.
  const at3 = T.snapshot(s);
  s.seats.get(4).conn = null;
  T.bankQuiz(s, at3, new Map([[3, 300], [4, 300]]), new Set([3, 4]));
  assert.equal(t2.avg, 1600 + 600 / 2);
  // Moves and leaving keep banked points with the old team.
  T.move(s, s.seats.get(1), 2);
  assert.equal(t1.sum, 3000);
});

test('game modes: a rise goes to the seat\'s team now, avg over connected members; bonuses', () => {
  const s = fake(3); T.setup(s, 2, rnd);
  T.assign(s, s.seats.get(1), 1); T.assign(s, s.seats.get(2), 1); T.assign(s, s.seats.get(3), 2);
  T.bankRise(s, s.seats.get(1), 100);
  assert.equal(s.teams.list[0].sum, 100); assert.equal(s.teams.list[0].avg, 50);
  T.bonusSeat(s, s.seats.get(3));
  assert.equal(s.seats.get(3).bonus, 100); assert.equal(s.teams.list[1].sum, 100); assert.equal(s.teams.list[1].avg, 100);
  assert.equal(s.seats.get(3).score, 0, 'a bonus is not the seat\'s score');
  assert.ok(T.bonusTeam(s, 1));
  assert.deepEqual([s.teams.list[0].bonus, s.teams.list[0].sum, s.teams.list[0].avg], [100, 200, 150]);
  assert.equal(T.bonusTeam(s, 3), false, 'no team 3');
});

test('game scores that drop and climb again are never counted twice: team totals follow the seats\' scores', () => {
  const s = fake(2); T.setup(s, 2, rnd);
  T.assign(s, s.seats.get(1), 1); T.assign(s, s.seats.get(2), 1);
  const t1 = s.teams.list[0], a = s.seats.get(1), b = s.seats.get(2);
  const to = (seat, n) => { seat.score = n; T.bankScore(s, seat); };
  to(a, 300); to(b, 100);
  assert.deepEqual([t1.sum, t1.avg], [400, 200]);
  to(a, 0);     // a new game resets the game's points
  assert.deepEqual([t1.sum, t1.avg], [100, 50]);
  to(a, 300);   // ...and climbs back: the same 300 is counted once
  assert.deepEqual([t1.sum, t1.avg], [400, 200], 'sum = the members\' scores');
  // Points banked to a team the seat has left stay there; climbing back on the new team counts only new points.
  T.move(s, a, 2);
  const t2 = s.teams.list[1];
  to(a, 0); assert.equal(t1.sum, 400, 'the old team keeps them'); assert.equal(t2.sum, 0);
  to(a, 350); assert.equal(t2.sum, 50, 'only the points above what is still counted');
  assert.equal(t1.sum + t2.sum, a.score + b.score);
});

test('the lobby ranks nobody (every rank 0, shown as –) until points exist or the game starts', () => {
  const s = fake(4); T.setup(s, 2, rnd);
  assert.deepEqual(T.ranked(s).map(r => r.rank), [0, 0]);
  assert.deepEqual(T.tsMsg(s).s.map(r => r[2]), [0, 0]);
  s.phase = 'between';
  assert.deepEqual(T.ranked(s).map(r => r.rank), [1, 1], 'a tie once the game is on');
  s.phase = 'lobby'; T.bonusTeam(s, 2);
  assert.deepEqual(T.ranked(s).map(r => [r.k, r.rank]), [[2, 1], [1, 2]], 'a lobby bonus ranks');
});

test('empty teams are unranked and marked never-had-a-member; messages', () => {
  const s = fake(2); T.setup(s, 3, rnd);
  const r = T.ranked(s);
  const empty = r.find(x => x.size === 0);
  assert.equal(empty.rank, 0); assert.equal(empty.ever, false);
  assert.deepEqual(Object.keys(T.tmsMsg(s)).sort(), ['choose', 'locked', 'm', 'n', 'on', 'scoring', 't', 'teams']);
  const tms = T.tmsMsg(s);
  assert.equal(tms.t, 'tms'); assert.equal(tms.teams.length, 3); assert.equal(tms.m.length, 2);
  assert.ok(tms.teams.every(([k, p, n]) => Number.isInteger(k) && Number.isInteger(p) && Number.isInteger(n)));
  const ts = T.tsMsg(s);
  assert.equal(ts.t, 'ts'); assert.equal(ts.s.length, 3); assert.ok(ts.s.every(row => row.length === 5));
  assert.ok(T.tsMsg(s, { ranks: false }).s.every(row => row[2] === 0), 'leaderboard off: no ranks');
  assert.equal(T.tsMsg(s, { fin: true }).fin, 1);
  assert.deepEqual(T.tmsMsg(fake(1)).teams, [], 'teams off');
});

test('usePlan: everyone re-placed by the plan, others to the smallest team, not evened out (the host sees uneven)', () => {
  const s = fake(0); T.setup(s, 2, rnd);
  for (let i = 1; i <= 5; i++) add(s, i, `u${i}`);
  add(s, 6);
  T.usePlan(s, { n: 3, presets: [4, 1], scoring: 'sum' }, new Map([['u1', 1], ['u2', 1], ['u3', 1], ['u4', 1], ['u5', 2]]), rnd);
  assert.equal(s.teams.n, 3); assert.deepEqual(s.teams.presets, [4, 1, 0]); assert.equal(s.teams.scoring, 'sum');
  assert.deepEqual([1, 2, 3, 4].map(i => s.seats.get(i).team), [1, 1, 1, 1]);
  assert.equal(s.seats.get(6).team, 3, 'the guest to the empty team');
  assert.deepEqual(T.uneven(s), [4, 1, 1]);
  T.balance(s, rnd);
  assert.equal(T.uneven(s), null);
});

test('the end of a class run merges into the saved teams: a small-group run never wipes the rest of the class', () => {
  T.saveClassPlan(cls.id, { n: 2, presets: [0, 1], scoring: 'avg' }, new Map([[mia.id, 1], [leo.id, 2]]), teacher.id);
  // a 1-student run (same team count): mia ends on team 2, leo keeps his saved team
  let s = fake(0, { audience: 'class', classId: cls.id }); T.setup(s, 2, rnd);
  T.assign(s, add(s, 1, mia.id), 2);
  assert.ok(T.saveClassTeams(s));
  let saved = T.loadClassTeams(cls.id);
  assert.equal(saved.plan.get(mia.id), 2); assert.equal(saved.plan.get(leo.id), 2, 'leo did not play: his saved team stays');
  // a smaller run with a different team count leaves the saved teams alone
  s = fake(0, { audience: 'class', classId: cls.id }); T.setup(s, 4, rnd);
  T.assign(s, add(s, 1, mia.id), 4);
  assert.equal(T.saveClassTeams(s), false);
  saved = T.loadClassTeams(cls.id);
  assert.equal(saved.cfg.n, 2); assert.equal(saved.plan.size, 2);
  // a run with as many students and a new team count replaces them
  s = fake(0, { audience: 'class', classId: cls.id }); T.setup(s, 3, rnd);
  T.assign(s, add(s, 1, mia.id), 3); T.assign(s, add(s, 2, leo.id), 1);
  assert.ok(T.saveClassTeams(s));
  saved = T.loadClassTeams(cls.id);
  assert.equal(saved.cfg.n, 3); assert.deepEqual([saved.plan.get(mia.id), saved.plan.get(leo.id)], [3, 1]);
  T.forgetClassTeams(cls.id);
});

test('merging a school account into the student\'s own account moves its saved team, support and live scores; nothing stays on the switched-off account', () => {
  const tmp = S.createSchoolAccount(teacher, school.id, { rosterName: 'Tmp Pupil' }).user; S.addToClass(teacher, cls.id, tmp.id);
  const own = auth.createUser({ username: `OwnPupil${Date.now() % 1e6}`, password: 'secret123' });
  T.saveClassPlan(cls.id, { n: 2, presets: [0, 1] }, new Map([[tmp.id, 2]]), teacher.id);
  R.saveSupport(cls.id, tmp.id, { time: 200, read: true }, teacher.id);
  q.run("INSERT INTO live_runs(id, host_id, class_id, audience, mode, started_at, ended_at) VALUES ('mrg-run', ?, ?, 'class', 'battle', 1, 2)", teacher.id, cls.id);
  q.run("INSERT INTO live_run_scores(run_id, user_id, score) VALUES ('mrg-run', ?, 500)", tmp.id);
  const r = S.mergeSchoolAccount(teacher, school.id, tmp.id, own.id);
  assert.ok(r.ok, JSON.stringify(r));
  for (const t of ['live_class_teams', 'live_support', 'live_run_scores']) assert.equal(q.get(`SELECT COUNT(*) n FROM ${t} WHERE user_id=?`, tmp.id).n, 0, `${t}: nothing left on the merged account`);
  assert.equal(T.loadClassTeams(cls.id).plan.get(own.id), 2);
  assert.equal(R.supportRow(cls.id, own.id).extra_time, 200);
  assert.equal(q.get("SELECT score FROM live_run_scores WHERE run_id='mrg-run' AND user_id=?", own.id).score, 500);
  // and leaving the class still deletes them
  S.removeFromClass(teacher, cls.id, own.id);
  assert.equal(q.get('SELECT COUNT(*) n FROM live_support WHERE user_id=?', own.id).n, 0);
  T.forgetClassTeams(cls.id);
});

test('saved class teams: active students only; replaced on save; gone with the membership or on demand', () => {
  T.saveClassPlan(cls.id, { n: 2, presets: [3, 3, 1], scoring: 'avg' }, new Map([[mia.id, 1], [leo.id, 2], [teacher.id, 1], ['nobody', 2]]), teacher.id);
  let saved = T.loadClassTeams(cls.id);
  assert.deepEqual(saved.cfg, { n: 2, presets: [3, 1], scoring: 'avg' });
  assert.deepEqual([...saved.plan].sort(), [[leo.id, 2], [mia.id, 1]].sort(), 'students of the class only');
  // A class run with teams on saves its final teams.
  const s = fake(0, { audience: 'class', classId: cls.id }); T.setup(s, 2, rnd);
  const m = add(s, 1, mia.id), l = add(s, 2, leo.id);
  T.assign(s, m, 2); T.assign(s, l, 2);
  assert.ok(T.saveClassTeams(s));
  saved = T.loadClassTeams(cls.id);
  assert.equal(saved.plan.get(mia.id), 2);
  // Leaving the class deletes that student's saved team (the schools.js hook), and support rows too.
  R.saveSupport(cls.id, leo.id, { time: 150 }, teacher.id);
  S.removeFromClass(teacher, cls.id, leo.id);
  assert.equal(q.get('SELECT COUNT(*) n FROM live_class_teams WHERE user_id=?', leo.id).n, 0);
  assert.equal(q.get('SELECT COUNT(*) n FROM live_support WHERE user_id=?', leo.id).n, 0);
  S.addToClass(teacher, cls.id, leo.id);
  T.forgetClassTeams(cls.id);
  assert.equal(T.loadClassTeams(cls.id), null);
});
