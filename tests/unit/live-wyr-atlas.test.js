// Would You Rather Live and Atlas Quest Live (built-in modes 'wyr' and 'atlas', docs/decisions.md "Would You Rather and
// Atlas Quest go live"): the questions the platform makes, a vote with no right answer and no points that counts once
// in the game's all-time poll, a map answer scored by the server (right, near, far), the landing's options, and full
// classes: 30 players per session with bounded messages.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reset, open, hostSocket, player, publish, official, liveHtml, teacher, kid, mum, q, call, sleep, LS } from './_live.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WYR_DIR = path.join(ROOT, 'scripts/data/would-you-rather');
const LANGS = ['en', 'en-GB', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'ru', 'ja', 'zh-Hant', 'ar', 'he'];
// the bank builder's tag and topic lists (importing it builds nothing: the build runs only when it is the started script)
const { TAGS: WYR_TAGS, CATS: WYR_CATS } = await import('../../scripts/wyr-bank.js');
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
  for (const lang of LANGS) {
    assert.equal(WYR.wyrItems('wyr:mix:20:15', lang).length, 20, lang);
    assert.equal(WYR.topicsFor(lang).length, WYR.TOPICS.length);
  }
});

test('course topics: tech (20), online (10) and numbers (12) in the bank, named in every language, hosted by the lesson starters', () => {
  assert.equal(WYR.TOPICS.length, 14); assert.deepEqual(WYR.TOPICS.slice(-3), ['tech', 'online', 'numbers']);
  assert.deepEqual(WYR.TOPICS, WYR_CATS, 'the live topics are the bank builder\'s categories, in the same order');
  const en = WYR.topicsFor('en');
  assert.equal(en.find(x => x.id === 'tech').n, 20); assert.equal(en.find(x => x.id === 'online').n, 10);
  assert.equal(en.find(x => x.id === 'tech').name, 'Tech choices'); assert.equal(en.find(x => x.id === 'online').name, 'Online: share or keep');
  assert.equal(en.find(x => x.id === 'numbers').n, 12, 'the Number Quest Unit 7 bank');
  assert.equal(en.find(x => x.id === 'numbers').name, 'Numbers');
  assert.equal(WYR.itemsFor('en').length, 456, 'the bank');
  // cat.tech / cat.online in ui.json: a real name in each of the 13 languages (en-GB reads the English one)
  for (const lang of LANGS) {
    const ts = WYR.topicsFor(lang), tech = ts.find(x => x.id === 'tech'), online = ts.find(x => x.id === 'online');
    assert.ok(tech.name && tech.name !== 'tech' && online.name && online.name !== 'online' && tech.name !== online.name, lang);
    if (!['en', 'en-GB'].includes(lang)) assert.notEqual(tech.name, 'Tech choices', `${lang} names the topic in its own language`);
    assert.equal(tech.n, 20, lang); assert.equal(online.n, 10, lang);
  }
  // the lesson starters: 6.1 wyr:tech:8:20 (CA-9), 6.3 wyr:online:8:20; both topics together for a block day
  assert.deepEqual(WYR.parseId('wyr:tech:8:20'), { topics: ['tech'], count: 8, secs: 20 });
  assert.deepEqual(WYR.parseId('wyr:online:8:20'), { topics: ['online'], count: 8, secs: 20 });
  assert.deepEqual(WYR.parseId('wyr:tech+online:10:20').topics, ['tech', 'online']);
  assert.equal(WYR.makeId({ topics: ['tech'], count: 8, secs: 20 }), 'wyr:tech:8:20');
  assert.equal(WYR.makeId({ topics: ['online'], count: 8, secs: 20 }), 'wyr:online:8:20');
  const tech = WYR.wyrItems('wyr:tech:8:20', 'en');
  assert.equal(tech.length, 8); assert.ok(tech.every(it => /^tech-\d+$/.test(it.wyr) && it.secs === 20 && it.answer === -1 && it.choices.length === 2));
  assert.equal(new Set(tech.map(it => it.wyr)).size, 8, 'no dilemma twice');
  const online = WYR.wyrItems('wyr:online:10:20', 'ja');
  assert.equal(online.length, 10); assert.ok(online.every(it => it.wyr.startsWith('online-')));
  const enOnline = new Map(WYR.itemsFor('en').filter(it => it.cat === 'online').map(it => [it.id, it]));
  assert.ok(online.every(it => it.choices[0] !== enOnline.get(it.wyr).a && it.choices[1] !== enOnline.get(it.wyr).b), 'translated, not the English fallback');
  assert.equal(WYR.wyrItems('wyr:tech:20:20', 'en').length, 20, 'all twenty on a block day');
  // the data rules (plan §7, CA-10): ids tech-1..20 / online-1..10 in order, a/b <= 60 characters, no run of 2+ digits,
  // no handles or links, tags from the bank's list; every one of the 11 translation files translates every one of them
  const src = JSON.parse(fs.readFileSync(path.join(WYR_DIR, 'en.json'), 'utf8')).items.filter(it => ['tech', 'online'].includes(it.cat));
  assert.deepEqual(src.map(it => it.id), [...Array.from({ length: 20 }, (_, i) => `tech-${i + 1}`), ...Array.from({ length: 10 }, (_, i) => `online-${i + 1}`)]);
  for (const it of src) for (const o of [it.a, it.b]) {
    assert.ok(o.text.length >= 3 && o.text.length <= 60, `${it.id}: ${o.text}`);
    assert.doesNotMatch(o.text, /\d{2,}|@|https?:|www\.|\/\//, it.id);
    assert.ok(o.tags.length >= 1 && o.tags.every(tg => WYR_TAGS.includes(tg)), `${it.id}: tags ${o.tags}`);
  }
  const files = fs.readdirSync(WYR_DIR).filter(f => /^[a-z]{2}(-[A-Za-z]+)?\.json$/.test(f) && f !== 'en.json' && f !== 'ui.json');
  assert.equal(files.length, 11, files.join(' '));
  for (const f of files) {
    const byId = new Map(JSON.parse(fs.readFileSync(path.join(WYR_DIR, f), 'utf8')).items.map(it => [it.id, it]));
    for (const it of src) { const x = byId.get(it.id); assert.ok(x && x.a.text && x.b.text && x.a.text !== it.a.text, `${f} translates ${it.id}`); }
  }
  // the game and its live twin carry the rebuilt packs (scripts/wyr-bank.js): the same pinned version, tech/online in the game
  const game = fs.readFileSync(path.join(ROOT, 'seed-games/would-you-rather.html'), 'utf8');
  const live = fs.readFileSync(path.join(ROOT, 'seed-games/would-you-rather-live.html'), 'utf8');
  const ver = /WYR_PACK_VER = "([^"]+)"/.exec(game)[1];
  assert.equal(/WYR_PACK_VER = "([^"]+)"/.exec(live)[1], ver, 'both games pin the same pack version');
  assert.ok(fs.existsSync(path.join(ROOT, 'public/vendor/data/would-you-rather', ver, 'fr.js')), `packs on disk for ${ver}`);
  assert.match(game, /cats: \[[^\]]*'tech', 'online', 'numbers'\]/); assert.match(game, /"cat\.online":"Online: share or keep"/); assert.match(game, /\["tech-1","tech",/);
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
  assert.equal(atl.i, qm.i); assert.equal(atl.k, 'flag'); assert.equal(atl.reg, 'eu');
  // the flag's country code goes to the projector only: never in the shared state, a phone's messages or its welcome
  assert.equal(atl.fl, undefined);
  assert.equal(s.projState.atlf.i, qm.i); assert.equal(ATL.codes().indexOf(s.projState.atlf.fl), s.qz.cur.answer);
  const flagCode = s.projState.atlf.fl;
  assert.ok(ps.every(p => !p.msgs.some(m => m.t === 'st' && m.d && m.d.atlf)), 'no atlf to phones');
  await sleep(50); assert.ok(h.msgs.some(m => m.t === 'st' && m.d && m.d.atlf && m.d.atlf.fl === flagCode), 'the projector gets it: ' + JSON.stringify(h.msgs.filter(m => m.t === 'st')).slice(0, 300));
  assert.ok(!qm.q.includes(ATL.countryName(flagCode, 'en')));
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
  for (const re of [/value="mode:wyr"/, /value="mode:atlas"/, /id="lv-wyr-opts"/, /id="lv-atlas-opts"/, /name="wyrTopic" value="space" checked/, /name="wyrTopic" value="tech" checked> Tech choices/, /name="wyrTopic" value="online" checked> Online: share or keep/, /name="atlasKind" value="flag"/]) assert.match(page.text, re);
  assert.doesNotMatch(page.text, /id="lv-preset"/, 'no preset note without ?starter=');
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
