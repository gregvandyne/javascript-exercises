// Brain Board (built-in mode 'board') and Question Battle ('battle') in the classroom dashboard's look (as Crossword:
// cream widget cards with a group color on the top edge and the icon chip, the dark "Now" bar, a dotted mint board,
// light and dark from BRB.theme). The first tests pin the look and the plumbing in the files; the Chromium tests then run
// each game as a real live frame (tests/unit/_live-frame-harness.js: the production wrapper with a stand-in for the live
// page) and play the protocol's own messages into it: the projector draws its lobby, board or boss, question, answer
// counts and podium, and a phone's tap on an answer sends exactly one `an` for the open question. Skipped without Chromium.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, skip, openLive, closeBrowser, P } from './_live-frame-harness.js';

const BB = fs.readFileSync(path.join(ROOT, 'seed-games/brain-board.html'), 'utf8');
const QB = fs.readFileSync(path.join(ROOT, 'seed-games/question-battle.html'), 'utf8');
test.after(closeBrowser);

test('both games: the dashboard look, light and dark from BRB.theme, and the live pack kept for the plumbing', () => {
  for (const [name, html] of [['brain-board', BB], ['question-battle', QB]]) {
    assert.match(html, /--paper: #E1F1E1; --dots: #66C792; --card: #FFFDF2;/, `${name}: the dashboard's tokens`);
    assert.match(html, /:root\[data-theme="dark"\] \{/, `${name}: a dark theme`);
    assert.match(html, /radial-gradient\(var\(--dots\) 1\.5px, transparent 1\.6px\); background-size: 22px 22px;/, `${name}: the dotted mint board`);
    assert.match(html, /Bricolage\+Grotesque/, `${name}: Bricolage Grotesque`);
    assert.match(html, /BRB\.theme === 'light' \|\| BRB\.theme === 'dark' \? BRB\.theme : \(darkMq && darkMq\.matches \? 'dark' : 'light'\)/, `${name}: the site's theme, else the device's`);
    assert.match(html, /background: var\(--current\); color: var\(--on-current\)/, `${name}: the dark Now bar`);
    assert.match(html, /prefers-reduced-motion: reduce/, `${name}: reduced motion`);
    assert.match(html, /<script src="\/vendor\/oomba-kit\/1\.1\.6\/packs\/live\.js" integrity="sha384-/, `${name}: the pinned live pack`);
    assert.doesNotMatch(html, /Jeopardy/i, `${name}: never another product's name`);
    assert.doesNotMatch(html, /\b(confirm|alert)\(/, `${name}: no browser dialogs`);
  }
  assert.match(BB, /L\.ready\(\{ lobby: true, quiz: true, hostView: true, teams: true, words: \['pick'\] \}\)/, 'Brain Board: the same ready()');
  assert.match(BB, /L\.send\('pick', \{ c: ci, r: r \}, \{ toHost: true \}\)/, 'Brain Board: a player picks to the host');
  assert.match(BB, /L\.send\('turns', \{ on: b\.turns \? 0 : 1 \}\)/, 'Brain Board: the host toggles players picking');
  assert.match(QB, /L\.ready\(\{ lobby: true, quiz: true, hostView: true, teams: true \}\)/, 'Question Battle: the same ready()');
  assert.match(QB, /L\.setState\(\{ boss: boss\.kind \}\)/, 'Question Battle: the host shares the boss');
  assert.match(QB, /drawCloud, drawRobot, drawDragon/, 'Question Battle: all three bosses');
});

const CATS = ['Animals', 'Space', 'Centimeters', 'Plants', 'Maps'];
const board = (cur = null, done = {}) => ({ cats: CATS, t: CATS.map((c, ci) => [100, 200, 300, 400, 500].map((v, r) => [v, done[ci + ':' + r] || 0])), cur, turn: 0, turns: 0, left: 25 - Object.keys(done).length });
const PLAYERS = [1, 2, 3, 4, 5, 6].map(n => P(n));
const look = frame => frame.evaluate(() => {
  const cs = getComputedStyle(document.body);
  return { theme: document.documentElement.dataset.theme, bg: cs.backgroundColor, dots: cs.backgroundImage.includes('radial-gradient') };
});
/** Tap an element as a finger would: a real pointer event at its centre, through the frame. */
async function tap(L, sel) { const bx = await (await L.frame.$(sel)).boundingBox(); await L.page.mouse.click(bx.x + bx.width / 2, bx.y + bx.height / 2); }

test('Brain Board on the projector: the lobby cards, the board as a grid of cards, the question, the counts and the podium', { skip, timeout: 120_000 }, async () => {
  for (const theme of ['light', 'dark']) {
    const L = await openLive('brain-board.html', { role: 'host', mode: 'board', theme });
    try {
      await L.send({ t: 'wel', role: 'host', seat: 0, phase: 'lobby', seq: 1, round: 0, at: 0, players: PLAYERS, state: {}, mode: 'board' });
      const lk = await look(L.frame);
      assert.equal(lk.theme, theme); assert.equal(lk.dots, true, 'the dotted board');
      assert.equal(lk.bg, theme === 'dark' ? 'rgb(20, 20, 20)' : 'rgb(225, 241, 225)');
      assert.equal(await L.frame.evaluate(() => document.getElementById('lobby').hidden), false, 'the lobby widget shows');
      assert.equal(await L.frame.evaluate(() => document.querySelectorAll('#crowd .bb-p').length), 6, 'a card for everyone who joined');
      await L.send({ t: 'pj', p: P(7) });
      assert.equal(await L.frame.evaluate(() => document.querySelectorAll('#crowd .bb-p').length), 7, 'a late joiner gets a card');
      // the board: 5 headers and 25 tiles, each a card with its column's color; the host may pick
      await L.send({ t: 'st', d: { bb: board(null, { '0:0': 2, '2:1': 3 }) } }, { t: 'ph', phase: 'between', round: 1, seq: 2, at: await L.now() });
      const b = await L.frame.evaluate(() => ({ lobby: document.getElementById('lobby').hidden, heads: document.querySelectorAll('#grid .bb-cat').length, tiles: document.querySelectorAll('#grid .bb-tile').length,
        can: document.querySelectorAll('#grid .bb-tile.can').length, done: document.querySelectorAll('#grid .bb-tile.done').length, star: document.querySelector('#grid .bb-tile.done.star .f').textContent,
        topEdge: /0px 5px 0px 0px inset/.test(getComputedStyle(document.querySelector('#grid .bb-tile.can .f')).boxShadow), status: document.getElementById('status').textContent }));
      assert.deepEqual([b.lobby, b.heads, b.tiles, b.can, b.done, b.star], [true, 5, 25, 23, 2, '★']);
      assert.ok(b.topEdge, 'the tile card has its color on the top edge');
      assert.equal(b.status, 'Pick a tile!');
      await tap(L, '#grid .bb-tile.can');
      await L.page.waitForTimeout(100);
      assert.deepEqual((await L.sent()).filter(m => m.t === 'ev'), [{ k: 'pick', d: { c: 0, r: 1 }, t: 'ev' }], 'a tap on a tile picks it');
      await tap(L, '#turns');
      await L.page.waitForTimeout(100);
      assert.deepEqual((await L.sent()).filter(m => m.t === 'ev').at(-1), { k: 'turns', d: { on: 1 }, t: 'ev' });
      // the tile opens (a Lucky Star), its question, the answers counted, the reveal
      const now = await L.now();
      await L.send({ t: 'st', d: { bb: board([2, 3, 1]) } }, { t: 'ph', phase: 'playing', seq: 4, at: now }, { t: 'q', i: 13, n: 25, q: 'How many centimeters are in 3 meters?', choices: ['30', '300', '3,000', '3'], secs: 20, at: now }, { t: 'ac', i: 13, n: 4 });
      let c = await L.frame.evaluate(() => ({ card: !document.getElementById('card').hidden, q: document.getElementById('qtext').textContent, lucky: !document.getElementById('clucky').hidden, val: document.getElementById('cval').textContent,
        answers: [...document.querySelectorAll('#pad .bb-a')].map(x => [x.disabled, getComputedStyle(x).opacity]), note: document.getElementById('note').textContent, bar: getComputedStyle(document.querySelector('.bb-qbar')).backgroundColor }));
      assert.equal(c.card, true); assert.equal(c.q, 'How many centimeters are in 3 meters?'); assert.equal(c.lucky, true); assert.equal(c.val, '400 points');
      assert.deepEqual(c.answers, [[true, '1'], [true, '1'], [true, '1'], [true, '1']], 'the projector shows the answers at full strength and cannot answer');
      assert.equal(c.note, '4 answered');
      assert.equal(c.bar, theme === 'dark' ? 'rgb(102, 199, 146)' : 'rgb(20, 20, 20)', 'the question in the Now bar');
      await L.send({ t: 'ph', phase: 'between', seq: 5, at: now }, { t: 'rv', i: 13, answer: 1, counts: [1, 4, 1, 0], top: [[3, 1200], [1, 800]] });
      c = await L.frame.evaluate(() => ({ right: [...document.querySelectorAll('#pad .bb-a')].map(x => x.classList.contains('right')), n: [...document.querySelectorAll('#pad .bb-a .n')].map(x => x.textContent), rows: document.querySelectorAll('#rows li').length }));
      assert.deepEqual(c.right, [false, true, false, false]); assert.deepEqual(c.n, ['1', '4', '1', '0']); assert.equal(c.rows, 2, 'the score widget');
      await L.send({ t: 'ph', phase: 'ended', seq: 9, at: now, top: [[3, 4200], [1, 3900], [2, 3100], [4, 900]] });
      c = await L.frame.evaluate(() => ({ end: !document.getElementById('end').hidden, steps: document.querySelectorAll('#podium .bb-step').length, rest: [...document.querySelectorAll('#end-list li')].map(x => x.textContent) }));
      assert.deepEqual(c, { end: true, steps: 3, rest: ['Clever Owl · 900'] });
      assert.deepEqual(L.errors, []);
    } finally { await L.ctx.close(); }
  }
});

test('Brain Board on a phone: your pick, and a tap on an answer sends one answer', { skip, timeout: 120_000 }, async () => {
  const L = await openLive('brain-board.html', { role: 'player', mode: 'board', viewport: { width: 390, height: 844 }, touch: true });
  try {
    await L.send({ t: 'wel', role: 'player', seat: 2, phase: 'lobby', seq: 1, round: 0, at: 0, players: PLAYERS, state: {}, mode: 'board', me: { seat: 2, name: 1, avatar: null, team: 0, score: 0 } });
    assert.equal(await L.frame.evaluate(() => document.querySelector('#crowd .bb-p.me span').textContent), 'Quick Fox', 'your own card stands out');
    await L.send({ t: 'st', d: { bb: { ...board(), turns: 1, turn: 2 } } }, { t: 'ph', phase: 'between', round: 1, seq: 2, at: await L.now() });
    assert.equal(await L.frame.evaluate(() => document.getElementById('status').className), 'bb-status mine', 'your pick, in the spark color');
    await tap(L, '#grid .bb-tile.can');
    await L.page.waitForTimeout(100);
    assert.deepEqual((await L.sent()).filter(m => m.t === 'ev'), [{ k: 'pick', d: { c: 0, r: 0 }, to: 'host', t: 'ev' }]);
    const now = await L.now();
    await L.send({ t: 'st', d: { bb: board([0, 0, 0]) } }, { t: 'ph', phase: 'playing', seq: 4, at: now }, { t: 'q', i: 0, n: 25, q: '2 + 2 = ?', choices: ['3', '4', '5', '6'], secs: 20, at: now });
    const h = await L.frame.evaluate(() => [...document.querySelectorAll('#pad .bb-a')].map(x => x.getBoundingClientRect().height));
    assert.ok(h.every(x => x >= 48), `answer buttons are finger-sized: ${h}`);
    await tap(L, '#pad .bb-a.c1');
    await tap(L, '#pad .bb-a.c2');
    await L.page.waitForTimeout(100);
    const an = (await L.sent()).filter(m => m.t === 'an');
    assert.equal(an.length, 1, 'one answer only'); assert.equal(an[0].i, 0); assert.equal(an[0].c, 1);
    assert.equal(await L.frame.evaluate(() => document.getElementById('note').textContent), 'Answer locked in!');
    await L.send({ t: 'ack', i: 0 }, { t: 'ph', phase: 'between', seq: 5, at: now }, { t: 'rv', i: 0, answer: 1, counts: [], top: [] }, { t: 'you', i: 0, ok: true, points: 110, rank: 1, score: 110 });
    const r = await L.frame.evaluate(() => ({ note: document.getElementById('note').textContent, cls: document.getElementById('note').className, score: document.getElementById('score').textContent }));
    assert.deepEqual(r, { note: 'Right! +110 · You are number 1', cls: 'bb-note good', score: '110 points' });
    assert.deepEqual(L.errors, []);
  } finally { await L.ctx.close(); }
});

test('Question Battle on the projector: the boss arena, the class in team widgets, answer bars and the podium', { skip, timeout: 120_000 }, async () => {
  for (const theme of ['light', 'dark']) {
    const L = await openLive('question-battle.html', { role: 'host', mode: 'battle', theme });
    try {
      await L.send({ t: 'wel', role: 'host', seat: 0, phase: 'lobby', seq: 1, round: 0, at: 0, players: PLAYERS.map(p => [...p.slice(0, 3), (p[0] % 2) + 1, ...p.slice(4)]), state: { boss: 2 }, mode: 'battle' },
        { t: 'tms', on: 1, n: 2, teams: [[1, 0, 3], [2, 1, 3]], m: PLAYERS.map(p => [p[0], (p[0] % 2) + 1]), scoring: 'avg', choose: 0, locked: 0 });
      let s = await L.frame.evaluate(() => ({ st: window.__brbTest.state().boss, name: document.getElementById('bossname').textContent, icon: document.getElementById('bossicon').textContent, theme: document.documentElement.dataset.theme,
        groups: [...document.querySelectorAll('#crowd .qb-grp')].map(g => [g.querySelector('h2').textContent, g.querySelectorAll('.qb-p').length]), banner: document.getElementById('banner').textContent }));
      assert.deepEqual(s.st, { kind: 2, hp: 100, mood: 'calm' }); assert.equal(s.name, 'Snooze the Sleepy Dragon'); assert.equal(s.icon, '🐉'); assert.equal(s.theme, theme);
      assert.deepEqual(s.groups, [['🔴 Red Rockets', 3], ['🔷 Blue Whales', 3]], 'one widget per team');
      assert.equal(s.banner, 'Snooze the Sleepy Dragon wants to stop the class! Answer together to win.');
      // the arena card is painted on the canvas behind the boss's name bar
      const px = await L.frame.evaluate(() => { const r = document.getElementById('bossbar').getBoundingClientRect(), c = document.getElementById('lobby'), k = c.width / c.clientWidth;
        return [...c.getContext('2d').getImageData(Math.round((r.left + 6) * k), Math.round((r.top + r.height / 2) * k), 1, 1).data].slice(0, 3); });
      assert.deepEqual(px, theme === 'dark' ? [30, 30, 27] : [255, 253, 242], 'the arena is a card');
      for (let i = 0; i < 5; i++) {
        const now = await L.now();
        await L.send({ t: 'ph', phase: 'playing', seq: 3 + i * 2, at: now }, { t: 'q', i, n: 5, q: `Question ${i + 1}?`, choices: ['A', 'B', 'C', 'D'], secs: 20, at: now });
        if (i === 4) {
          s = await L.frame.evaluate(() => ({ crowd: document.getElementById('crowd').hidden, card: !document.getElementById('card').hidden, q: document.getElementById('qtext').textContent }));
          assert.deepEqual(s, { crowd: true, card: true, q: 'Question 5?' });
        }
        await L.send({ t: 'ph', phase: 'between', seq: 4 + i * 2, at: now }, { t: 'rv', i, answer: 2, counts: [1, 0, 4, 1], top: [[3, 900 * (i + 1)], [1, 700 * (i + 1)]] });
      }
      await L.page.waitForTimeout(1200);
      s = await L.frame.evaluate(() => ({ boss: window.__brbTest.state().boss, fills: [...document.querySelectorAll('#pad .qb-a .fill')].map(f => f.style.transform), n: [...document.querySelectorAll('#pad .qb-a .n')].map(x => x.textContent), right: document.querySelector('#pad .qb-a.right .tx').textContent }));
      assert.equal(s.boss.hp, 0, 'the last question finishes the boss'); assert.equal(s.boss.mood, 'beaten');
      assert.deepEqual(s.fills, ['scaleX(0.25)', 'scaleX(0)', 'scaleX(1)', 'scaleX(0.25)'], 'the answer bars');
      assert.deepEqual(s.n, ['1', '0', '4', '1']); assert.equal(s.right, 'C');
      await L.send({ t: 'ts', s: [[1, 1900, 1, 5700, 1900], [2, 1700, 2, 5100, 1700]], fin: 1 }, { t: 'ph', phase: 'ended', seq: 20, at: await L.now(), top: [[3, 4500], [1, 3500], [2, 1000]] });
      await L.page.waitForTimeout(2600);
      s = await L.frame.evaluate(() => ({ board: !document.getElementById('board').hidden, steps: document.querySelectorAll('#podium .qb-step').length, tboard: !document.getElementById('tboard').hidden, tsteps: document.querySelectorAll('#tpodium .qb-step').length }));
      assert.deepEqual(s, { board: true, steps: 3, tboard: true, tsteps: 2 });
      assert.deepEqual(L.errors, []);
    } finally { await L.ctx.close(); }
  }
});

test('Question Battle on a phone: a tap answers once, your streak and your attack', { skip, timeout: 120_000 }, async () => {
  const L = await openLive('question-battle.html', { role: 'player', mode: 'battle', viewport: { width: 390, height: 844 }, touch: true });
  try {
    await L.send({ t: 'wel', role: 'player', seat: 2, phase: 'lobby', seq: 1, round: 0, at: 0, players: PLAYERS, state: { boss: 1 }, mode: 'battle', me: { seat: 2, name: 1, avatar: null, team: 0, score: 0 } });
    assert.equal(await L.frame.evaluate(() => document.getElementById('banner').textContent), 'Waiting for the host to start…');
    for (const i of [0, 1]) {
      const now = await L.now();
      await L.send({ t: 'ph', phase: 'playing', seq: 3 + i * 2, at: now }, { t: 'q', i, n: 3, q: `Question ${i + 1}?`, choices: ['A', 'B', 'C', 'D'], secs: 20, at: now });
      const h = await L.frame.evaluate(() => [...document.querySelectorAll('#pad .qb-a')].map(x => x.getBoundingClientRect().height));
      assert.ok(h.every(x => x >= 48), `answer buttons are finger-sized: ${h}`);
      await tap(L, '#pad .qb-a.c3');
      await tap(L, '#pad .qb-a.c0');
      await L.send({ t: 'ack', i }, { t: 'ph', phase: 'between', seq: 4 + i * 2, at: now }, { t: 'rv', i, answer: 3, counts: [0, 0, 0, 3], top: [] }, { t: 'you', i, ok: true, points: 950, rank: 1, score: 950 * (i + 1) });
    }
    const an = (await L.sent()).filter(m => m.t === 'an');
    assert.deepEqual(an.map(m => [m.i, m.c]), [[0, 3], [1, 3]], 'one answer a question');
    const s = await L.frame.evaluate(() => ({ st: window.__brbTest.state(), streak: document.getElementById('streak').textContent, note: document.getElementById('note').className }));
    assert.equal(s.st.streak, 2); assert.equal(s.streak, '🔥 Streak ×2'); assert.equal(s.note, 'qb-note ok');
    assert.equal(s.st.boss.kind, 1); assert.ok(s.st.boss.hp < 100 && s.st.boss.hp > 0, 'the boss took its share');
    assert.deepEqual(L.errors, []);
  } finally { await L.ctx.close(); }
});
