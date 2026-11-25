// No leaderboards (docs/decisions.md "No leaderboards"): the game page shows a player only their own best, the old
// leaderboard API answers with nothing, scores are still stored for progress, and a live game never ranks students:
// no top list, no rank and no podium for anyone (the projector included), each player hears only their own result,
// and the results page lists students by name with no Place column.
import { reset, call, open, hostSocket, player, q, games, teacher, mia, leo, kid, publish, official } from './_live.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test.beforeEach(() => reset());

const ROOT = path.resolve(import.meta.dirname, '../..');
const playOnce = (gameId, userId) => q.run('INSERT INTO plays(id, game_id, user_id, started_at) VALUES (?,?,?,?)', `p-${gameId}-${userId}`, gameId, userId, Date.now());

test('the game page and the API: no leaderboard, only the player\'s own best; scores are still stored', async () => {
  const g = publish(official, '<!doctype html><title>t</title><p>hi</p>', { title: 'Score Game' });
  for (const [u, score] of [[kid, 40], [mia, 90]]) {
    playOnce(g.id, u.id);
    const r = await call(`/api/games/${g.id}/score`, { method: 'POST', body: { score, label: 'points' }, user: u });
    assert.equal(r.status, 200, r.text); assert.equal(r.json.best, score);
  }
  assert.equal(q.get('SELECT score FROM scores WHERE game_id=? AND user_id=?', g.id, mia.id).score, 90, 'stored for progress and the gradebook');
  assert.equal(typeof games.leaderboard, 'undefined');
  const api = await call(`/api/games/${g.id}/leaderboard`, { user: kid });
  assert.equal(api.status, 410); assert.deepEqual(api.json, { rows: [] });
  // The page: the player's own best, nobody else's score or name, and no Leaderboard heading.
  const page = await call(`/g/${g.slug}`, { user: kid });
  assert.equal(page.status, 200);
  assert.match(page.text, /id="mybest"/); assert.match(page.text, /Your best/); assert.match(page.text, />40</);
  assert.ok(!/Leaderboard|class="lb"|id="lb-h"/.test(page.text), 'no leaderboard panel');
  assert.ok(!page.text.includes('>90<'), "never another player's score");
  // Signed out, or with no score yet: no score panel at all.
  assert.ok(!/id="mybest"/.test((await call(`/g/${g.slug}`)).text));
  assert.ok(!/id="mybest"/.test((await call(`/g/${g.slug}`, { user: leo })).text));
});

test('a live quiz ranks nobody: empty top lists, rank 0, each player only their own result; results and CSV by name', async () => {
  const s = open(teacher, { mode: 'battle', items: [
    { q: 'Two plus two?', choices: ['4', '5', '3'], answer: 0, secs: 10 },
    { q: 'Ten minus one?', choices: ['8', '9'], answer: 1, secs: 10 },
  ], audience: 'open' });
  const h = await hostSocket(s, teacher);
  const a = await player(s), b = await player(s);
  h.send({ t: 'h', a: 'start' }); a.send({ t: 'rdy' }); b.send({ t: 'rdy' });
  let seen = 0;
  for (let i = 0; i < 2; i++) {
    const qa = await a.next('q', m => m.i === i);
    const right = qa.choices.indexOf(i ? '9' : '4');
    a.send({ t: 'an', i, c: right, e: 0 }); b.send({ t: 'an', i, c: (right + 1) % qa.choices.length, e: 0 });
    for (const c of [h, a, b]) assert.deepEqual((await c.next('rv', m => m.i === i)).top, [], 'no top players on any screen');
    assert.equal((await a.next('you', m => m.i === i)).rank, 0);
    const between = await h.next('ph', m => m.phase === 'between' && m.seq > seen);
    seen = between.seq;
    h.send({ t: 'h', a: 'next', at: between.seq });
  }
  const endH = await h.next('ph', m => m.phase === 'ended');
  assert.deepEqual(endH.top, [], 'no podium on the projector');
  const ya = await a.next('you', m => m.of !== undefined), yb = await b.next('you', m => m.of !== undefined);
  assert.deepEqual([ya.rank, ya.right, ya.total], [0, 2, 2]); assert.deepEqual([yb.rank, yb.right, yb.total], [0, 0, 2]);
  assert.ok(!('tied' in ya) && !('zero' in yb), 'nothing about anyone else');
  // Every message any client got: no lb or rv or ph carries a top player, no you carries a place.
  for (const c of [h, a, b]) for (const m of c.msgs) {
    if (Array.isArray(m.top)) assert.deepEqual(m.top, [], JSON.stringify(m));
    if (m.t === 'you') assert.equal(m.rank, 0);
    if (m.t === 'lb' && m.you) assert.equal(m.you[0], 0);
  }
  await a.next('bye');
  const res = await call(`/live/results/${s.id}`, { user: teacher });
  assert.equal(res.status, 200);
  assert.ok(!/<th scope="col">Place<\/th><th scope="col">Player/.test(res.text), 'no Place column for students');
  assert.match(res.text, /id="lv-class-total"/); assert.match(res.text, /50% of answers right/);
  const csv = await call(`/live/results/${s.id}.csv`, { user: teacher });
  assert.match(csv.text, /^student,team,score,bonus,correct,answered,q1,q2\r\n/);
  for (const c of [h, a, b]) c.ws.close();
});

test('the live settings have no leaderboard choice, and the live games and the builder never rank players', async () => {
  const landing = await call('/live', { user: teacher });
  assert.ok(!/name="board"/.test(landing.text) && !/Leaderboard on players/.test(landing.text));
  const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
  // the live games never put individual places on screen
  assert.ok(!/t\('rank', \{ rank: r\.rank \}\)/.test(read('seed-games/question-battle.html')));
  assert.ok(!/t\('rank', \{ rank: r\.rank \}\)/.test(read('seed-games/brain-board.html')));
  assert.ok(!/place1|place2|place3|dh-podium/.test(read('seed-games/doodle-hoot.html')));
  assert.ok(!/topFive|t\('podium'\)/.test(read('seed-games/atlas-quest-live.html')));
  assert.ok(/var ranks = solo;/.test(read('seed-games/quest-race.html')), 'Quest Race ranks only the practice race against bots');
  // the platform pages and the builder's rules
  assert.ok(!/D\.place\b|placeTied/.test(read('public/js/live-play.js')));
  const prompt = read('server/builder/prompt.js');
  assert.match(prompt, /Never make a leaderboard/);
  assert.ok(!/leaderboard \(best score only\)|top-N leaderboard/.test(prompt));
  assert.ok(!/top-N leaderboards/.test(read('server/builder/kit-rules.js')));
  for (const loc of fs.readdirSync(path.join(ROOT, 'server/i18n/locales'))) {
    const j = JSON.parse(read(`server/i18n/locales/${loc}`));
    assert.equal(j.game && j.game.leaderboard, undefined, loc);
    assert.equal(j.live && j.live.settings && j.live.settings.board, undefined, loc);
  }
});
