// Brain Board (the built-in mode 'board', server/services/classlive-board.js): the board laid out from a question set
// (categories, or numbered columns easy to hard), Lucky Stars, who may pick a tile and when, the points (value + speed,
// doubled on a star, never minus), turns for the fastest right answer, the end of a cleared board; categories in sets,
// the editor's paste formats and the AI's board drafts; and Hero of Sunvale kept out of class rooms.
import assert from 'node:assert/strict';
import test from 'node:test';
import { reset, open, hostSocket, player, publish, liveHtml, official, teacher, mum, cls, LS, sleep, call } from './_live.js';
const B = await import('../../server/services/classlive-board.js');
const A = await import('../../server/services/classlive-access.js');
const SETS = await import('../../server/services/classlive-sets.js');
const { parsePasted } = await import('../../public/js/live-paste.js');
const { starterItems } = await import('../../server/live/starters.js');

publish(official, liveHtml("live.on('question', () => {});", { quiz: true }), { source: 'seed', slug: 'brain-board', title: 'Brain Board' });
const sunvale = publish(official, liveHtml(''), { source: 'seed', slug: 'hero-of-sunvale', title: 'Hero of Sunvale' });
const item = (q, cat) => ({ q, choices: ['right', 'wrong'], answer: 0, secs: 20, ...(cat ? { cat } : {}) });

test('the board: categories in the order they appear, 5 a column, values by row; numbered columns for the rest', () => {
  const items = [item('a1', 'Animals'), item('p1', 'Planets'), item('a2', 'animals'), item('p2', 'Planets'), item('a3', 'Animals')];
  const { cols } = B.layout(items);
  assert.deepEqual(cols.map(c => c.cat), ['Animals', 'Planets']);
  assert.deepEqual(cols[0].tiles.map(x => [x.i, x.v]), [[0, 100], [2, 200], [4, 300]]);
  // no categories: 20 questions -> 4 columns of 5, filled row by row (later questions are lower and worth more)
  const plain = B.layout(Array.from({ length: 20 }, (_, i) => item(`q${i}`))).cols;
  assert.equal(plain.length, 4); assert.ok(plain.every(c => c.cat === '' && c.tiles.length === 5));
  assert.deepEqual(plain[0].tiles.map(x => x.i), [0, 4, 8, 12, 16]); assert.equal(plain[3].tiles[4].v, 500);
  // never more than 6 columns of 5
  const big = B.layout(Array.from({ length: 100 }, (_, i) => item(`q${i}`))).cols;
  assert.equal(big.length, 6); assert.equal(big.reduce((n, c) => n + c.tiles.length, 0), 30);
  // a few questions still make a board
  assert.ok(B.layout([item('x'), item('y'), item('z')]).cols.length >= 1);
});

test('Lucky Stars: one on a small board, two on a big one, never in the top row or twice in a column', () => {
  const small = B.layout(Array.from({ length: 15 }, (_, i) => item(`q${i}`))).cols;
  const big = B.layout(Array.from({ length: 30 }, (_, i) => item(`q${i}`))).cols;
  for (let k = 0; k < 50; k++) {
    assert.equal(B.stars(small).size, 1);
    const st = [...B.stars(big)].map(x => x.split(':').map(Number));
    assert.equal(st.length, 2); assert.ok(st.every(([, r]) => r > 0)); assert.notEqual(st[0][0], st[1][0]);
  }
});

test('points: the tile\'s value plus up to 20% for speed, doubled on a Lucky Star; accuracy-only is the value', () => {
  const s = { board: { cur: { k: '0:2', v: 300 }, stars: new Set() } };
  assert.equal(B.points(s, 0, 20), 360); assert.equal(B.points(s, 20000, 20), 300); assert.equal(B.points(s, 0, 20, { accuracy: true }), 300);
  s.board.stars.add('0:2');
  assert.equal(B.points(s, 0, 20), 720);
});

test('a live board: only between questions, only an unopened tile, the host (or the player whose turn it is) picks', async () => {
  reset();
  const items = [item('Q1', 'Cats'), item('Q2', 'Cats'), item('Q3', 'Dogs'), item('Q4', 'Dogs')];
  const s = open(teacher, { mode: 'board', items, audience: 'open' });
  const h = await hostSocket(s, teacher);
  const a = await player(s), b = await player(s);
  h.send({ t: 'h', a: 'start' });
  await a.next('ph', m => m.phase === 'loading');
  a.send({ t: 'rdy', view: '2d' }); b.send({ t: 'rdy', view: '2d' });
  await a.next('ph', m => m.phase === 'between');
  const bb = s.state.bb;
  assert.deepEqual(bb.cats, ['Cats', 'Dogs']); assert.deepEqual(bb.t[0].map(x => x[0]), [100, 200]); assert.equal(bb.left, 4);
  // a player can't pick while the host picks
  a.send({ t: 'ev', k: 'pick', d: { c: 0, r: 0 }, to: 'host' });
  await sleep(80); assert.equal(s.board.cur, null);
  // nonsense picks do nothing
  for (const d of [{ c: 9, r: 0 }, { c: 0, r: 7 }, { c: 'x', r: 0 }]) assert.equal(LS.boardPick(s, d.c, d.r), false);
  // the host picks Dogs 200: everyone sees it open, then its question
  h.send({ t: 'ev', k: 'pick', d: { c: 1, r: 1 } });
  const st = await a.next('st', m => m.d.bb && m.d.bb.cur);
  assert.deepEqual(st.d.bb.cur.slice(0, 2), [1, 1]);
  assert.equal(LS.boardPick(s, 0, 0), false, 'not while a tile is open');
  const qm = await a.next('q');
  assert.equal(qm.q, 'Q4');
  // one right, one wrong
  const right = qm.choices.indexOf('right');
  a.send({ t: 'an', i: qm.i, c: right, e: 100 }); b.send({ t: 'an', i: qm.i, c: 1 - right, e: 100 });
  const ya = await a.next('you'), yb = await b.next('you');
  assert.equal(ya.ok, true); assert.ok(ya.points >= 200 && ya.points <= (s.board.stars.has('1:1') ? 480 : 240), String(ya.points));
  assert.equal(yb.ok, false); assert.equal(yb.points, 0, 'never minus points');
  await a.next('st', m => m.d.bb && !m.d.bb.cur);
  assert.equal(s.state.bb.t[1][1][1] >= 2, true, 'the tile is done');
  assert.equal(LS.boardPick(s, 1, 1), false, 'a done tile can\'t be picked again');
  // turns on: the fastest right answer (a) picks next, from their phone; b can't
  h.send({ t: 'ev', k: 'turns', d: { on: 1 } });
  await a.next('st', m => m.d.bb && m.d.bb.turns === 1);
  assert.equal(s.board.turn, a.join.seat, 'the fastest right answer picks next');
  b.send({ t: 'ev', k: 'pick', d: { c: 0, r: 0 }, to: 'host' });
  await sleep(80); assert.equal(s.board.cur, null, 'not b\'s turn');
  a.send({ t: 'ev', k: 'pick', d: { c: 0, r: 0 }, to: 'host' });
  await a.next('q');
  for (const c of [h, a, b]) c.ws.close();
});

test('a cleared board ends by itself; Next between tiles does nothing until then', async () => {
  reset();
  const saved = B.END_MS;
  const s = open(teacher, { mode: 'board', items: [item('Only one')], audience: 'open' });
  const h = await hostSocket(s, teacher);
  const a = await player(s);
  h.send({ t: 'h', a: 'start' });
  await a.next('ph', m => m.phase === 'loading'); a.send({ t: 'rdy', view: '2d' });
  await a.next('ph', m => m.phase === 'between');
  assert.equal(LS.hostAction(s, 'next', { at: s.seq }), false);
  assert.equal(LS.boardPick(s, 0, 0), true);
  const qm = await a.next('q');
  a.send({ t: 'an', i: qm.i, c: 0, e: 50 });
  await a.next('st', m => m.d.bb && m.d.bb.left === 0);
  assert.equal(LS.hostAction(s, 'next', { at: s.seq }), true, 'Next ends a cleared board');
  assert.equal(s.phase, 'ended');
  assert.equal(saved, B.END_MS);
  for (const c of [h, a]) c.ws.close();
});

test('categories in question sets: optional, checked, at most 40 characters; the starter board has four', () => {
  const ok = SETS.cleanItems([{ ...item('Q?'), cat: '  Planets ' }]);
  assert.equal(ok.ok, true); assert.equal(ok.items[0].cat, 'Planets');
  assert.equal(SETS.cleanItems([item('Q?')]).items[0].cat, undefined);
  assert.equal(SETS.cleanItems([{ ...item('Q?'), cat: 'call 555 123 4567 now' }]).code, 'cat');
  const st = starterItems('board');
  assert.equal(st.length, 20); assert.equal(new Set(st.map(x => x.cat)).size, 4); assert.ok(st.every(x => SETS.complete(x)));
});

test('paste: a Category column (by its header) and "# Category" lines in typed questions', () => {
  const rows = parsePasted('Category\tQuestion\tRight\tWrong\nPlanets\tBiggest?\tJupiter\tMars\t30\nAnimals\tFastest?\tCheetah\tSnail');
  assert.deepEqual(rows.map(r => [r.cat, r.q, r.secs]), [['Planets', 'Biggest?', 30], ['Animals', 'Fastest?', 20]]);
  const typed = parsePasted('# Planets\nBiggest?\n* Jupiter\nMars\n\nSmallest?\nMercury *\nEarth\n\n# Animals\nFastest?\n*Cheetah\nSnail');
  assert.deepEqual(typed.map(r => r.cat), ['Planets', 'Planets', 'Animals']);
});

test('Hero of Sunvale is for fun, not for class: never hosted to a class room, left out of a teacher\'s picker', async () => {
  reset();
  assert.ok(A.NOT_FOR_CLASS.has('hero-of-sunvale'));
  assert.equal(A.hostable(teacher, sunvale, 'class', { classId: cls.id }).code, 'notForClass');
  assert.equal(A.hostable(mum, sunvale, 'open').ok, true, 'a parent may still host it for an open room');
  const r = LS.createSession(teacher, { mode: 'game', gameId: sunvale.id, audience: 'class', classId: cls.id });
  assert.equal(r.ok, false); assert.equal(r.code, 'notForClass');
  const page = await call('/live', { user: teacher });
  assert.equal(page.status, 200);
  assert.doesNotMatch(page.text, /Hero of Sunvale/);
  assert.match(page.text, /value="mode:board"/, 'Brain Board is offered');
  assert.doesNotMatch(page.text, /No live-ready games here yet/);
});
