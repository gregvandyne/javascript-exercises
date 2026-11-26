// Flashcards: students and children make their own sets (docs/decisions.md "Flashcards: students make sets"). Checked
// on the server, through the routes:
//   - a student (a class account) and a child (a family account) make, save, reload, study, print and delete their own
//     sets; the sets are theirs alone: no class code or link works for anyone else, nothing lists them for others;
//   - no AI (draft cards, a lesson file), no Oomba painting and no picture upload (Storybook doesn't let them either);
//   - every word through the site's text filter on save; the limits: sets each, cards a set, characters a card;
//   - a guest saves nothing; a teacher's set stays read-only for a student (they may copy it into their own).
import './_live.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { call, publish, official, teacher, mia, leo, kid, auth, q, RL, config } from './_live.js';
import * as G from '../../server/services/game-sets.js';
import * as SB from '../../server/services/storybook.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/flashcards.html'), 'utf8');
const GAME = publish(official, HTML, { source: 'seed', slug: 'flashcards', title: 'Flashcards' });
const base = `/api/games/${GAME.id}`;
const ITEMS = [{ t: 'My spelling words', c: [['because', 'for the reason that', '🤔'], ['friend', 'someone you like', '🧑‍🤝‍🧑'], ['said', 'past of say', '💬']], a: 't' }];
async function init(u, query = '') {
  const page = await call(`/play/flashcards${query}`, { user: u });
  const fr = await call(/data-src="(\/frame\/[^"]+?)"/.exec(page.text)[1].replace(/&amp;/g, '&'), { user: u });
  return JSON.parse(/window\.__BRB_INIT__=(\{.*?\});<\/script>/.exec(fr.text)[1]);
}
const withKey = async (key, fn) => { const was = config.anthropicKey; config.anthropicKey = key; try { return await fn(); } finally { config.anthropicKey = was; } };
test.beforeEach(() => { RL._reset(); });

for (const [who, u] of [['a student', mia], ['a child', kid]]) {
  test(`${who} makes, saves, reloads, studies, prints and deletes their own set; nobody else can open it`, async () => withKey('test-key', async () => {
    q.run('DELETE FROM game_sets WHERE owner_id=?', u.id);
    const fi = await init(u);
    assert.equal(fi.make, true, 'Make'); assert.equal(fi.makePrivate, true, 'their own sets only');
    assert.equal(fi.clues, undefined, 'no AI, even with a model'); assert.equal(fi.flashPics, undefined, 'no pictures'); assert.equal(fi.canAssign, undefined); assert.equal(fi.mySets, undefined);
    assert.notEqual(fi.setSave, false, 'saving a set is offered');
    const r = await call(`${base}/sets`, { method: 'POST', user: u, body: { items: ITEMS } });
    assert.equal(r.status, 200, r.text);
    // reload: their list, and the set opens for them by its id
    const list = await call(`${base}/sets`, { user: u });
    assert.deepEqual(list.json.sets.map(x => x.id), [r.json.id]); assert.equal(list.json.sets[0].items[0].c.length, 3);
    const mine = await init(u, `?chapter=${r.json.id}&lock=1`);
    assert.equal(mine.set.id, r.json.id); assert.equal(mine.set.mine, true); assert.equal(mine.set.items[0].c[0][0], 'because');
    // a change saves; a teacher's or another student's account never opens it
    assert.equal((await call(`${base}/sets`, { method: 'POST', user: u, body: { id: r.json.id, items: [{ ...ITEMS[0], t: 'Week 2' }] } })).status, 200);
    assert.equal(G.get(GAME.id, r.json.id).items[0].t, 'Week 2');
    for (const other of [leo, teacher, null]) {
      assert.equal((await call(`${base}/sets/${r.json.id.slice(2)}`, { user: other })).status, 404, `the code does not open it for ${other ? other.username : 'signed out'}`);
      if (other) assert.equal((await init(other, `?chapter=${r.json.id}&lock=1`)).set.missing, true, 'nor the link');
      if (other) assert.equal((await call(`${base}/sets`, { user: other })).json.sets.some(x => x.id === r.json.id), false, 'never listed for anyone else');
    }
    assert.equal((await call(`${base}/sets`, { method: 'POST', user: leo, body: { id: r.json.id, items: ITEMS } })).status, 404, 'nor changed by anyone else');
    // print: the cards, with no class code or link on them
    const pr = await call(`${base}/print`, { method: 'POST', user: u, body: { doc: { t: 'Week 2', c: ITEMS[0].c, as: 'cards', set: r.json.id } } });
    assert.equal(pr.status, 200, pr.text); assert.match(pr.json.html, /because/);
    assert.doesNotMatch(pr.json.html, new RegExp(r.json.id.slice(2, 7), 'i'), 'no class code'); assert.doesNotMatch(pr.json.html, /chapter=/, 'no link');
    // delete
    assert.equal((await call(`${base}/sets/${r.json.id}`, { method: 'DELETE', user: u })).status, 200);
    assert.equal(G.get(GAME.id, r.json.id), null);
  }));
}

test('no AI and no pictures for students and children: every AI and picture route answers 403', async () => withKey('test-key', async () => {
  const JPG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64').toString('base64');
  SB.hooks.screenImage = async () => 'allow';
  try {
    for (const u of [mia, kid]) {
      assert.equal(SB.canMake(u), false, 'Storybook lets them make no pictures either');
      for (const [url, body] of [['cards-ai', { topic: 'plants', count: 10 }], ['words-from-doc', { kind: 'docx', data: Buffer.from('x').toString('base64') }], ['flash-pics', { data: JPG }], ['flash-pics/paint', { asks: [{ subject: 'cat' }] }]]) {
        const r = await call(`${base}/${url}`, { method: 'POST', user: u, body });
        assert.equal(r.status, 403, `${u.username} ${url}: ${r.text}`); assert.equal(r.json.code, 'notAllowed');
      }
    }
  } finally { SB.hooks.screenImage = null; }
}));

test('their words through the site\'s text filter on save; the limits: sets each, cards a set, characters a card; pictures refused', async () => {
  q.run('DELETE FROM game_sets WHERE owner_id=?', mia.id);
  const save = (items, u = mia) => call(`${base}/sets`, { method: 'POST', user: u, body: { items } });
  const card = (w, d) => [{ t: '', c: [[w, d, ''], ['friend', 'someone you like', '']] }];
  for (const [w, d] of [['shit', 'a bad word'], ['because', 'call me on 555-123-4567'], ['link', 'go to www.example.com'], ['email', 'write to mia@example.com']]) {
    const r = await save(card(w, d)); assert.equal(r.status, 400, `${w} / ${d}`); assert.equal(r.json.code, 'bad');
  }
  assert.equal((await save(card('x'.repeat(G.FLASH.term + 1), 'too long'))).status, 400, 'a term at most FLASH.term characters');
  assert.equal((await save(card('long', 'y'.repeat(G.FLASH.def + 1)))).status, 400, 'a definition at most FLASH.def characters');
  assert.equal((await save([{ t: '', c: Array.from({ length: G.FLASH.max + 1 }, (_, i) => [`w${i}`, 'd', '']) }])).status, 400, 'at most FLASH.max cards');
  // a picture ref of someone else's never sticks (a student owns no pictures)
  const r = await save([{ t: '', c: [['cat', 'a pet', 'img:Abc123def456ghi7'], ['dog', 'a pet', '🐶']] }]);
  assert.equal(r.status, 200); assert.equal(G.get(GAME.id, r.json.id).items[0].c[0][2], '');
  // sets each: FLASH.ownSets for a student or a child (a teacher keeps MAX_PER_OWNER)
  q.run('DELETE FROM game_sets WHERE owner_id=?', mia.id);
  for (let i = 0; i < G.FLASH.ownSets; i++) assert.ok(G.save(GAME.id, mia.id, ITEMS, null, 'flashcards', { max: G.FLASH.ownSets }).id);
  const full = await save(ITEMS); assert.equal(full.status, 400); assert.equal(full.json.code, 'full');
  const one = q.get('SELECT id FROM game_sets WHERE owner_id=? LIMIT 1', mia.id).id;
  assert.equal((await call(`${base}/sets/${one}/duplicate`, { method: 'POST', user: mia, body: {} })).json.code, 'full', 'nor by copying');
  assert.equal((await save(ITEMS, teacher)).status, 200, 'a teacher is not held to it');
  q.run('DELETE FROM game_sets WHERE owner_id=?', mia.id);
});

test('a guest saves nothing and gets no Make; a teacher\'s set stays read-only for a student, who may copy it into their own', async () => {
  const guest = auth.createGuest();
  const gi = await init(guest);
  assert.equal(gi.make, undefined); assert.equal(gi.setSave, false);
  const r = await call(`${base}/sets`, { method: 'POST', user: guest, body: { items: ITEMS } });
  assert.equal(r.status, 403); assert.equal(r.json.code, 'guest');
  assert.equal((await call(`${base}/sets`, { method: 'POST', body: { items: ITEMS } })).status, 401);
  const tset = (await call(`${base}/sets`, { method: 'POST', user: teacher, body: { items: ITEMS } })).json.id;
  const si = await init(mia, `?chapter=${tset}&lock=1`);
  assert.equal(si.set.mine, false, 'the teacher\'s set is not the student\'s to edit');
  assert.equal((await call(`${base}/sets`, { method: 'POST', user: mia, body: { id: tset, items: [{ ...ITEMS[0], t: 'Mine now' }] } })).status, 404);
  assert.equal(G.get(GAME.id, tset).items[0].t, 'My spelling words');
  assert.equal((await call(`${base}/sets/${tset}`, { method: 'DELETE', user: mia })).status, 404);
  // a copy: a new set of their own (the page's "Copy and edit" saves it as new)
  const copy = await call(`${base}/sets`, { method: 'POST', user: mia, body: { items: si.set.items } });
  assert.equal(copy.status, 200); assert.notEqual(copy.json.id, tset); assert.equal(G.get(GAME.id, copy.json.id).ownerId, mia.id);
  // the teacher's set still opens for the class by its code
  assert.equal((await call(`${base}/sets/${tset.slice(2)}`, { user: leo })).status, 200);
});
