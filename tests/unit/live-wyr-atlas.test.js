// Would You Rather Live and Atlas Quest Live (built-in modes 'wyr' and 'atlas', docs/decisions.md "Would You Rather and
// Atlas Quest go live"): the questions the platform makes, a vote with no right answer and no points that counts once
// in the game's all-time poll, a map answer scored by the server (right, near, far), the landing's options, and full
// classes: 30 players per session with bounded messages.
import test from 'node:test';
import assert from 'node:assert/strict';
import { reset, open, hostSocket, player, publish, official, liveHtml, teacher, kid, mum, q, call, sleep, LS } from './_live.js';

const WYR = await import('../../server/live/wyr.js');
const ATL = await import('../../server/live/atlas.js');
const POLLS = await import('../../server/services/polls.js');
const R = await import('../../server/services/classlive-results.js');

const quizGame = liveHtml("live.on('question', () => {});", { quiz: true });
publish(official, quizGame, { source: 'seed', slug: 'would-you-rather-live', title: 'Would You Rather Live' });
publish(official, quizGame, { source: 'seed', slug: 'atlas-quest-live', title: 'Atlas Quest Live' });
const pollGame = publish(official, '<!doctype html><title>w</title>', { source: 'seed', slug: 'would-you-rather', title: 'Would You Rather?' });

/** Start a session with these players and wait for the first question everywhere. */
async function started(s, h, ps) {
  h.send({ t: 'h', a: 'start' });
  await Promise.all(ps.map(p => p.next('ph', m => m.phase === 'loading')));
  for (const p of ps) p.send({ t: 'rdy', view: '2d' });
  return Promise.all(ps.map(p => p.next('q')));
}

test('Would You Rather questions: the official bank, by topic, in every language; never a right answer', () => {
  assert.equal(WYR.parseId('wyr:mix:10:15').count, 10);
  assert.deepEqual(WYR.parseId('wyr:food+space:5:20').topics, ['food', 'space']);
  for (const bad of ['wyr:mix:11:15', 'wyr:mix:10:16', 'wyr:pizza:5:15', 'wyr:mix:5', 'bank:mix:a8:10']) assert.equal(WYR.parseId(bad), null, bad);
  assert.equal(WYR.makeId({ topics: WYR.TOPICS, count: 8, secs: 20 }), 'wyr:mix:8:20', 'every topic ticked is a mix');
  const items = WYR.wyrItems('wyr:food:8:15', 'fr');
  assert.equal(items.length, 8);
  for (const it of items) {
    assert.equal(it.answer, -1); assert.equal(it.choices.length, 2); assert.match(it.wyr, /^food-\d+$/); assert.equal(it.q, 'Tu préfères ?');
    assert.ok(it.choices.every(c => c && c.length < 140));
  }
  for (const lang of ['en', 'en-GB', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'ru', 'ja', 'zh-Hant', 'ar', 'he']) {
    assert.equal(WYR.wyrItems('wyr:mix:20:15', lang).length, 20, lang);
    assert.equal(WYR.topicsFor(lang).length, WYR.TOPICS.length);
  }
});

test('Atlas questions: the region, the level and the kinds; choices are every country in one order', () => {
  const codes = ATL.codes();
  assert.equal(codes.length, 195); assert.equal(new Set(codes).size, 195);
  assert.equal(ATL.parseId('atlas:world:easy:find:10:20').kinds[0], 'find');
  for (const bad of ['atlas:mars:easy:find:10:20', 'atlas:eu:expert:find:10:20', 'atlas:eu:easy:sing:10:20', 'atlas:eu:easy:find:9:20']) assert.equal(ATL.parseId(bad), null, bad);
  const items = ATL.atlasItems('atlas:eu:medium:find+capital+flag+famous:10:20', 'fr');
  assert.equal(items.length, 10);
  const seen = new Set();
  for (const it of items) {
    assert.equal(it.choices.length, 195); assert.equal(it.choices[it.answer], codes[it.answer]);
    assert.ok(!seen.has(it.answer), 'a country once'); seen.add(it.answer);
    assert.equal(ATL.data().C[it.answer][9], 'eu', 'from Europe');
    if (it.atlas.k === 'flag') { assert.equal(it.atlas.fl, codes[it.answer]); assert.ok(!it.q.includes(ATL.countryName(it.atlas.fl, 'fr')), 'a flag question never names the country'); }
    if (it.atlas.k === 'find') assert.ok(it.q.includes(ATL.countryName(codes[it.answer], 'fr')));
  }
  assert.ok(new Set(items.map(it => it.atlas.k)).size === 4, 'the kinds take turns');
  // a small region at an easy level still has enough countries
  assert.equal(ATL.atlasItems('atlas:oc:easy:find:20:20', 'en').length, 14);
  // near misses: a neighbour at least 150, close more, far nothing; never for the right one
  const i = cc => codes.indexOf(cc);
  assert.ok(ATL.closePoints(i('BE'), i('FR')) >= 150);
  assert.ok(ATL.closePoints(i('ES'), i('FR')) >= 150 && ATL.closePoints(i('ES'), i('FR')) <= 300);
  assert.equal(ATL.closePoints(i('JP'), i('FR')), 0);
  assert.equal(ATL.closePoints(i('FR'), i('FR')), 0);
});

test('Would You Rather Live with 30 players: everyone votes, the split, no points, the poll counts each account once', async () => {
  reset();
  const s = open(teacher, { mode: 'wyr', starter: 'wyr:mix:5:30', audience: 'open', lang: 'en' });
  assert.equal(s.items.length, 5); assert.ok(s.items.every(it => it.answer === -1));
  const h = await hostSocket(s, teacher);
  const signed = [await player(s, kid), await player(s, mum)];
  const guests = [];
  for (let k = 0; k < 28; k++) guests.push(await player(s));
  const ps = [...signed, ...guests];
  const qs = await started(s, h, ps);
  const qm = qs[0];
  assert.equal(qm.choices.length, 2);
  // the answers are never shuffled: the poll's A and B are the dilemma's
  assert.deepEqual(qm.choices, s.items[0].choices);
  // a vote can only be one of the two
  guests[0].send({ t: 'an', i: qm.i, c: 2, e: 100 });
  await sleep(60); assert.equal(s.qz.answers.size, 0);
  ps.forEach((p, k) => p.send({ t: 'an', i: qm.i, c: k % 3 === 0 ? 1 : 0, e: 200 }));
  const rv = await h.next('rv');
  assert.equal(rv.answer, -1);
  assert.deepEqual(rv.counts, [20, 10]);
  for (const p of ps) { const y = await p.next('you'); assert.equal(y.points, 0); assert.equal(y.ok, false); }
  // everyone on Oomba: the two signed-in votes counted (guests have no account); fewer than 5 votes shows no split
  const st = await h.next('st', m => m.d && m.d.wyr);
  assert.equal(st.d.wyr.i, qm.i); assert.equal(st.d.wyr.n, 2); assert.equal(st.d.wyr.a, undefined);
  const id = s.items[0].wyr;
  // kid (seat order 0) voted B, mum A
  assert.deepEqual(POLLS.totals(pollGame.id, id), { a: 1, b: 1, total: 2 });
  // nobody needs help in a vote, nobody scored, nothing is "right"
  for (const seat of s.seats.values()) { assert.equal(seat.score, 0); assert.equal(seat.correct, 0); assert.equal(seat.wrongRun || 0, 0); }
  const sum = R.summary(s);
  assert.ok(sum.players.every(p => !p.help));
  assert.equal(sum.items[0].answer, -1); assert.deepEqual(sum.items[0].counts, [20, 10]);
  // play again with the same dilemmas: the same accounts don't count twice
  s.qz.cur = null;
  const again = open(teacher, { mode: 'wyr', trusted: s.allItems, audience: 'open', lang: 'en', replace: true });
  assert.equal(again.items[0].wyr, id);
  const h2 = await hostSocket(again, teacher), k2 = await player(again, kid), m2 = await player(again, mum);
  const [q2] = await started(again, h2, [k2, m2]);
  k2.send({ t: 'an', i: q2.i, c: 0, e: 100 }); m2.send({ t: 'an', i: q2.i, c: 0, e: 100 });
  await h2.next('rv');
  await sleep(30);
  assert.deepEqual(POLLS.totals(pollGame.id, id), { a: 1, b: 1, total: 2 }, 'once per account and dilemma');
  for (const c of [h, h2, k2, m2, ...ps]) c.ws.close();
});

test('Atlas Quest Live with 30 players: taps scored by the server (right, near, far), the class map, small messages', async () => {
  reset();
  const s = open(teacher, { mode: 'atlas', starter: 'atlas:eu:easy:flag:5:30', audience: 'open', lang: 'en' });
  const h = await hostSocket(s, teacher);
  const ps = [];
  for (let k = 0; k < 30; k++) ps.push(await player(s));
  const qs = await started(s, h, ps);
  const qm = qs[0];
  const before = ps.map(p => p.msgs.findIndex(m => m.t === 'q'));
  assert.equal(qm.choices.length, 195);
  // the flag to show and the region to open on, as shared state (never in the question)
  const atl = s.state.atl;
  assert.equal(atl.i, qm.i); assert.equal(atl.k, 'flag'); assert.equal(atl.reg, 'eu'); assert.equal(ATL.codes().indexOf(atl.fl), s.qz.cur.answer);
  assert.ok(!qm.q.includes(ATL.countryName(atl.fl, 'en')));
  const answer = s.qz.cur.answer, codes = ATL.codes();
  const near = codes.indexOf((ATL.data().C[answer][11] || '').split(',').filter(Boolean)[0] || 'ZZ');
  const far = codes.indexOf(codes[answer] === 'JP' ? 'BR' : 'JP');
  ps.forEach((p, k) => p.send({ t: 'an', i: qm.i, c: k < 15 ? answer : k < 25 && near >= 0 ? near : far, e: 300 + k * 10 }));
  const rv = await h.next('rv');
  assert.equal(rv.answer, answer);
  assert.equal(rv.counts.length, 195); assert.equal(rv.counts[answer], 15); assert.equal(rv.counts.reduce((a, b) => a + b, 0), 30);
  assert.ok(JSON.stringify(rv).length < 2000, `the reveal stays small: ${JSON.stringify(rv).length} bytes`);
  const ys = await Promise.all(ps.map(p => p.next('you')));
  ys.forEach((y, k) => {
    if (k < 15) { assert.equal(y.ok, true); assert.ok(y.points >= 500 && y.points <= 1000, String(y.points)); }
    else if (k < 25 && near >= 0) { assert.equal(y.ok, false); assert.ok(y.points >= 150 && y.points <= 300, `near ${y.points}`); }
    else { assert.equal(y.ok, false); assert.equal(y.points, 0); }
  });
  // what a player received for the question, from asking to their result: a handful of messages, none big
  for (const [k, p] of ps.entries()) {
    const got = p.msgs.slice(before[k]);
    assert.ok(got.length <= 12, `player ${k} got ${got.length} messages: ${got.map(m => m.t).join(',')}`);
    assert.ok(got.every(m => JSON.stringify(m).length < 4000), 'no big message');
  }
  // the results keep a short version: the right country and the most tapped wrong ones, by name
  const sum = R.summary(s);
  assert.equal(sum.items[0].choices[0], ATL.countryName(codes[answer], 'en')); assert.equal(sum.items[0].answer, 0);
  assert.ok(sum.items[0].choices.length <= 4);
  for (const c of [h, ...ps]) c.ws.close();
});

test('the landing offers both, with their own options; a form makes the right questions', async () => {
  reset();
  const page = await call('/live', { user: teacher });
  assert.equal(page.status, 200);
  for (const re of [/value="mode:wyr"/, /value="mode:atlas"/, /id="lv-wyr-opts"/, /id="lv-atlas-opts"/, /name="wyrTopic" value="space"/, /name="atlasKind" value="flag"/]) assert.match(page.text, re);
  const r = await call('/api/live/sessions', { method: 'POST', user: teacher, body: { pick: 'mode:atlas', atlasRegion: 'af', atlasLevel: 'hard', atlasKind: ['capital', 'famous'], atlasCount: '8', atlasSecs: '30', audience: 'open', set: 'bank' } });
  assert.equal(r.status, 200, r.text);
  const s = LS.get(r.json.sid);
  assert.equal(s.mode, 'atlas'); assert.equal(s.items.length, 8); assert.equal(s.setId, null);
  assert.ok(s.items.every(it => it.secs === 30 && ['capital', 'famous'].includes(it.atlas.k) && ATL.data().C[it.answer][9] === 'af'));
  const w = await call('/api/live/sessions', { method: 'POST', user: teacher, body: { pick: 'mode:wyr', wyrTopic: 'animals', wyrCount: '5', wyrSecs: '10', audience: 'open', replace: true } });
  assert.equal(w.status, 200, w.text);
  const sw = LS.get(w.json.sid);
  assert.equal(sw.items.length, 5); assert.ok(sw.items.every(it => it.wyr.startsWith('animals-') && it.secs === 10));
  // "Play the missed questions" makes no sense for a vote or a map
  q.run('SELECT 1');
});
