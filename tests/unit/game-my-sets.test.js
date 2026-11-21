// "My worksheets" in Crossword, The Big Divide and Algebra Builder (server/services/game-sets.js listMine, remove, rename,
// duplicate; routes/games.js GET /api/games/:id/sets, DELETE /api/games/:id/sets/:set, POST .../rename, POST
// .../duplicate; docs/decisions.md "My worksheets in Crossword, The Big Divide and Algebra Builder"): only the owner
// lists, renames, copies and deletes a set; anyone else's set is a 404, the same as one that isn't there; guests and
// signed-out visitors can't; a name passes the text filter; a copy counts toward the 200; the frame offers the list to
// school staff only; the SDK and the play page carry the calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reset, call, publish, official, kid, teacher, teacher2, mia, mum, boss, q, RL } from './_live.js';
import * as G from '../../server/services/game-sets.js';
import { createGuest } from '../../server/auth.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const AB = publish(official, '<!doctype html><title>t</title><p>ab</p>', { source: 'seed', slug: 'algebra-builder', title: 'Algebra Builder' });
const BB = publish(official, '<!doctype html><title>t</title><p>bb</p>', { source: 'seed', slug: 'box-by-box', title: 'The Big Divide' });
const CW = publish(official, '<!doctype html><title>t</title><p>cw</p>', { source: 'seed', slug: 'crossword', title: 'Crossword' });
const AB_ITEMS = [{ a: 'solve', p: '2x+3=7', s: 'all', l: true }, { a: 'factor', p: 'x^2+3x+2', s: 'none', l: true }];
const BB_ITEMS = [{ k: 'divide', p: [[84, 4], [96, 3], [125, 5]], l: 'guided' }];
const CW_ITEMS = [{ t: 'Habitats', w: [['habitat', 'where an animal lives'], ['predator', 'it hunts'], ['prey', 'it is hunted']], r: 4, b: true, h: true }];
const base = g => `/api/games/${g.id}/sets`;
const save = async (g, items, user = teacher, extra = {}) => {
  const r = await call(base(g), { method: 'POST', body: { items, ...extra }, user });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  return r.json.id;
};
const clear = () => q.run('DELETE FROM game_sets');
const frameInit = async (slug, user = null) => {
  const page = await call(`/play/${slug}`, { user });
  assert.equal(page.status, 200);
  const frame = await call(/data-src="(\/frame\/[^"]+?)"/.exec(page.text)[1].replace(/&amp;/g, '&'), { user });
  return JSON.parse(/window\.__BRB_INIT__=(\{.*?\});<\/script>/.exec(frame.text)[1]);
};

test('the list: the signed-in teacher\'s own sets in that game, newest first, with code, name, label, size and items', async () => {
  reset(); clear();
  const a = await save(AB, AB_ITEMS);
  q.run('UPDATE game_sets SET updated_at=updated_at-5000 WHERE id=?', a);
  const b = await save(AB, AB_ITEMS.slice(0, 1));
  await save(AB, AB_ITEMS, teacher2);
  await save(BB, BB_ITEMS);
  const r = await call(base(AB), { user: teacher });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.sets.map(s => s.id), [b, a], 'only mine, in this game, newest first');
  const s = r.json.sets[1];
  assert.equal(s.code, `${a.slice(2, 7).toUpperCase()} ${a.slice(7).toUpperCase()}`);
  assert.equal(s.title, ''); assert.equal(s.n, 2); assert.equal(s.label, '2 questions: Solve, Factor');
  assert.deepEqual(s.items, AB_ITEMS); assert.equal(typeof s.updated, 'number');
  assert.equal(r.json.max, G.MAX_PER_OWNER);
  const bb = (await call(base(BB), { user: teacher })).json.sets;
  assert.equal(bb.length, 1); assert.equal(bb[0].n, 3); assert.equal(bb[0].label, 'Long division, 3 problems, Guided');
  assert.deepEqual((await call(base(BB), { user: teacher2 })).json.sets, [], 'nobody else\'s');
  // a Crossword set is named after its puzzle
  await save(CW, CW_ITEMS);
  const cw = (await call(base(CW), { user: teacher })).json.sets[0];
  assert.equal(cw.title, 'Habitats'); assert.equal(cw.n, 3); assert.equal(cw.label, 'Habitats: crossword, 3 words');
});

test('signed out: 401; a guest: 403; a family grown-up: refused by the fence; a game without sets: 404', async () => {
  reset(); clear();
  const id = await save(AB, AB_ITEMS);
  assert.equal((await call(base(AB))).status, 401);
  assert.equal((await call(`${base(AB)}/${id}`, { method: 'DELETE' })).status, 401);
  const guest = createGuest();
  for (const [m, p, body] of [['GET', base(AB)], ['DELETE', `${base(AB)}/${id}`], ['POST', `${base(AB)}/${id}/rename`, { title: 'x' }], ['POST', `${base(AB)}/${id}/duplicate`, {}]]) {
    const r = await call(p, { method: m, body, user: guest });
    assert.equal(r.status, 403, `${m} ${p}`); assert.equal(r.json.code, 'guest');
  }
  assert.equal((await call(base(AB), { user: mum })).status, 404, 'the grown-up fence keeps family accounts to playing');
  const other = publish(official, '<!doctype html><title>t</title><p>x</p>', { source: 'seed', slug: 'not-a-set-game-2', title: 'X' });
  assert.equal((await call(base(other), { user: teacher })).status, 404);
  assert.ok(G.get(AB.id, id), 'nothing changed');
});

test('delete: the owner\'s set goes (its code stops working); someone else\'s, a wrong game\'s or a bad id is a 404', async () => {
  reset(); clear();
  const id = await save(AB, AB_ITEMS);
  for (const [user, p] of [[teacher2, `${base(AB)}/${id}`], [kid, `${base(AB)}/${id}`], [mia, `${base(AB)}/${id}`], [teacher, `${base(BB)}/${id}`], [teacher, `${base(AB)}/s-zzzzzzzzzz`], [teacher, `${base(AB)}/nope`]]) {
    const r = await call(p, { method: 'DELETE', user });
    assert.equal(r.status, 404, `${user.username} ${p}`); assert.equal(r.json.code, 'noSet');
  }
  assert.ok(G.get(AB.id, id), 'still there');
  const r = await call(`${base(AB)}/${id}`, { method: 'DELETE', user: teacher });
  assert.equal(r.status, 200); assert.deepEqual(r.json, { ok: true });
  assert.equal(G.get(AB.id, id), null);
  assert.equal((await call(`${base(AB)}/${id.slice(2)}`, { user: kid })).status, 404, 'the class code finds nothing now');
  assert.equal((await call(`${base(AB)}/${id}`, { method: 'DELETE', user: teacher })).status, 404, 'twice: gone');
});

test('rename: a name through the text filter (60 characters), kept when the set is saved again; Crossword\'s puzzle title too', async () => {
  reset(); clear();
  const id = await save(BB, BB_ITEMS);
  const r = await call(`${base(BB)}/${id}/rename`, { method: 'POST', body: { title: '  Week 3   long   division  ' }, user: teacher });
  assert.equal(r.status, 200); assert.deepEqual(r.json, { ok: true, title: 'Week 3 long division' });
  assert.equal((await call(base(BB), { user: teacher })).json.sets[0].title, 'Week 3 long division');
  for (const bad of ['you are a bitch', 'call me on 07700 900123', 'see https://example.com']) {
    const b = await call(`${base(BB)}/${id}/rename`, { method: 'POST', body: { title: bad }, user: teacher });
    assert.equal(b.status, 400, bad); assert.equal(b.json.code, 'title');
  }
  assert.equal((await call(`${base(BB)}/${id}/rename`, { method: 'POST', body: {}, user: teacher })).status, 400, 'no title');
  assert.equal((await call(`${base(BB)}/${id}/rename`, { method: 'POST', body: { title: 'Mine now' }, user: teacher2 })).status, 404);
  assert.equal((await call(`${base(BB)}/${id}/rename`, { method: 'POST', body: { title: 'x'.repeat(80) }, user: teacher })).json.title.length, 60);
  // saved again from the game: the name stays; a name sent with a save is kept (one the filter refuses is left out)
  await call(`${base(BB)}/${id}/rename`, { method: 'POST', body: { title: 'Week 3' }, user: teacher });
  await save(BB, [{ ...BB_ITEMS[0], l: 'onMyOwn' }], teacher, { id });
  assert.equal(G.get(BB.id, id).title, 'Week 3');
  await save(BB, BB_ITEMS, teacher, { id, title: 'Week 4' });
  assert.equal(G.get(BB.id, id).title, 'Week 4');
  await save(BB, BB_ITEMS, teacher, { id, title: 'you are a bitch' });
  assert.equal(G.get(BB.id, id).title, 'Week 4', 'a refused name is left out; the set still saves');
  const named = await save(BB, BB_ITEMS, teacher, { title: 'Fresh one' });
  assert.equal(G.get(BB.id, named).title, 'Fresh one');
  // '' takes the name away
  assert.equal((await call(`${base(BB)}/${id}/rename`, { method: 'POST', body: { title: '' }, user: teacher })).json.title, '');
  // Crossword: the name is the puzzle's title, so students see the new one
  const cw = await save(CW, CW_ITEMS);
  await call(`${base(CW)}/${cw}/rename`, { method: 'POST', body: { title: 'Animal homes' }, user: teacher });
  assert.equal(G.get(CW.id, cw).items[0].t, 'Animal homes'); assert.equal(G.get(CW.id, cw).title, 'Animal homes');
  await save(CW, [{ ...CW_ITEMS[0], t: 'From the game' }], teacher, { id: cw });
  assert.equal(G.get(CW.id, cw).title, 'From the game', 'saving the crossword names it after its puzzle');
});

test('duplicate: a copy under a new code, "Copy of" in the teacher\'s language, newest first; the 200 limit counts it', async () => {
  reset(); clear();
  const id = await save(AB, AB_ITEMS);
  await call(`${base(AB)}/${id}/rename`, { method: 'POST', body: { title: 'Unit 2' }, user: teacher });
  const r = await call(`${base(AB)}/${id}/duplicate`, { method: 'POST', body: {}, user: teacher });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.match(r.json.id, G.SET_ID); assert.notEqual(r.json.id, id);
  assert.equal(r.json.set.title, 'Copy of Unit 2'); assert.deepEqual(r.json.set.items, AB_ITEMS);
  assert.deepEqual((await call(base(AB), { user: teacher })).json.sets.map(s => s.id)[0], r.json.id);
  assert.equal((await call(`${base(AB)}/${id}/duplicate`, { method: 'POST', body: {}, user: teacher2 })).status, 404);
  // no name: the copy is named after the set's label; Crossword's puzzle title follows
  const bb = await save(BB, BB_ITEMS);
  assert.equal((await call(`${base(BB)}/${bb}/duplicate`, { method: 'POST', body: {}, user: teacher })).json.set.title, 'Copy of Long division, 3 problems, Guided');
  const cw = await save(CW, CW_ITEMS);
  const c = await call(`${base(CW)}/${cw}/duplicate`, { method: 'POST', body: {}, user: teacher });
  assert.equal(c.json.set.items[0].t, 'Copy of Habitats');
  // in the teacher's language (the site's)
  const es = await call(`${base(AB)}/${id}/duplicate`, { method: 'POST', body: {}, user: teacher, headers: { 'accept-language': 'es', cookie: '' } });
  assert.equal(es.status, 200);
  assert.match(es.json.set.title, /^(Copia de|Copy of) Unit 2$/);
  // the limit
  const now = Date.now();
  for (let i = q.get('SELECT COUNT(*) n FROM game_sets WHERE game_id=? AND owner_id=?', AB.id, teacher.id).n; i < G.MAX_PER_OWNER; i++) {
    q.run('INSERT INTO game_sets(id, game_id, owner_id, items, created_at, updated_at) VALUES (?,?,?,?,?,?)', `s-f${String(i).padStart(9, '0')}`, AB.id, teacher.id, JSON.stringify(AB_ITEMS), now, now);
  }
  const full = await call(`${base(AB)}/${id}/duplicate`, { method: 'POST', body: {}, user: teacher });
  assert.equal(full.status, 400); assert.equal(full.json.code, 'full');
  assert.equal((await call(base(AB), { user: teacher })).json.sets.length, G.MAX_PER_OWNER, 'the list holds all 200');
});

test('rate limited like saving: 60 a minute per account', async () => {
  reset(); clear();
  for (let i = 0; i < 60; i++) assert.equal((await call(base(AB), { user: teacher })).status, 200);
  assert.equal((await call(base(AB), { user: teacher })).status, 429);
  assert.equal((await call(base(AB), { user: teacher2 })).status, 200, 'another account has its own');
  RL._reset();
});

test('the frame offers My worksheets to school staff and the platform admin only', async () => {
  reset();
  assert.equal((await frameInit('crossword', teacher)).mySets, true);
  assert.equal((await frameInit('box-by-box', boss)).mySets, true);
  assert.equal((await frameInit('algebra-builder', teacher)).mySets, true);
  for (const u of [kid, mia, mum, null, createGuest()]) assert.equal((await frameInit('crossword', u)).mySets, undefined, u ? u.username : 'signed out');
  const other = publish(official, '<!doctype html><title>t</title><p>x</p>', { source: 'seed', slug: 'not-a-set-game-3', title: 'X' });
  assert.equal((await frameInit(other.slug, teacher)).mySets, undefined);
});

test('the SDK asks the page, and the page takes only its own messages for them', () => {
  const sdk = fs.readFileSync(path.join(ROOT, 'public/sdk/brb-sdk.js'), 'utf8');
  for (const k of ['canListSets: INIT.mySets === true', "mySets: function () { return setsAsk('list'); }", "deleteQuestionSet: function (id) { return setsAsk('delete', id); }",
    "renameQuestionSet: function (id, title) { return setsAsk('rename', id, title); }", "duplicateQuestionSet: function (id) { return setsAsk('duplicate', id); }"]) assert.ok(sdk.includes(k), k);
  assert.match(sdk, /send\('brb:sets', msg\)/);
  const src = fs.readFileSync(path.join(ROOT, 'public/js/play.js'), 'utf8');
  assert.match(src, /case 'brb:sets': mySetsForGame\(m\)/);
  const start = src.indexOf('const TYPES = {'), end = src.indexOf('let saveTimer');
  const validMessage = new Function(src.slice(start, end).replace('export function', 'function') + '\nreturn validMessage;')();
  const frame = {};
  const ev = data => ({ source: frame, origin: 'null', data: { brb: 1, ...data } });
  assert.ok(validMessage(ev({ type: 'brb:sets', id: 1, op: 'list' }), frame));
  assert.ok(validMessage(ev({ type: 'brb:sets', id: 2, op: 'delete', set: 's-abcdefghjk' }), frame));
  assert.ok(validMessage(ev({ type: 'brb:sets', id: 3, op: 'rename', set: 's-abcdefghjk', title: 'Unit 3' }), frame));
  assert.ok(validMessage(ev({ type: 'brb:sets', id: 4, op: 'duplicate', set: 's-abcdefghjk' }), frame));
  for (const bad of [{ op: 'list', id: 0 }, { op: 'drop', id: 1 }, { op: 'delete', id: 1, set: '../x' }, { op: 'delete', id: 1 }, { op: 'rename', id: 1, set: 's-abcdefghjk' }, { op: 'rename', id: 1, set: 's-abcdefghjk', title: 'x'.repeat(201) }]) {
    assert.equal(validMessage(ev({ type: 'brb:sets', ...bad }), frame), null, JSON.stringify(bad));
  }
});
