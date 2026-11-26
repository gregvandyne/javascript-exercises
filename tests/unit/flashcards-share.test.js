// Flashcards: a student shares one of their own sets with their class (docs/decisions.md "Flashcards: students share
// with their class"; services/flash-share.js). Checked on the server, through the routes:
//   - the switch: a student in a class gets their classes (several: they pick), a child on a family account and a guest
//     get none; off by default; on and off any time; the cards through the text filter again, no pictures, no links;
//   - who sees it: the class's teachers (a co-teacher too) and its students; another class, a guest, signed out: 404,
//     no code, no link; classmates see the display name, teachers the roster name;
//   - unsharing, deleting the set, and leaving the class take it away at once; a teacher hides it from the class and
//     shows it again; the student sees that it was hidden; nobody else may hide it.
import './_live.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { call, publish, official, teacher, teacher2, mia, leo, zed, kid, boss, cls, cls2, auth, q, RL, S } from './_live.js';
import * as G from '../../server/services/game-sets.js';
import * as FS from '../../server/services/flash-share.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/flashcards.html'), 'utf8');
const GAME = publish(official, HTML, { source: 'seed', slug: 'flashcards', title: 'Flashcards' });
const base = `/api/games/${GAME.id}`;
const ITEMS = [{ t: 'Volcano words', c: [['magma', 'melted rock under the ground', '🌋'], ['lava', 'melted rock on the surface', '🔥'], ['crater', 'the bowl at the top', '🕳️']], a: 't' }];
const MIA_SHOWN = mia.display_name, MIA_REAL = 'Mia Pupil';
async function init(u, query = '') {
  const page = await call(`/play/flashcards${query}`, { user: u });
  const fr = await call(/data-src="(\/frame\/[^"]+?)"/.exec(page.text)[1].replace(/&amp;/g, '&'), { user: u });
  return JSON.parse(/window\.__BRB_INIT__=(\{.*?\});<\/script>/.exec(fr.text)[1]);
}
const mine = u => call(`${base}/flash-share/mine`, { user: u });
const list = u => call(`${base}/flash-share/list`, { user: u });
const share = (u, set, classId, on = true) => call(`${base}/flash-share/${set}`, { method: 'POST', user: u, body: { classId, on } });
const hide = (u, set, classId, hidden = true) => call(`${base}/flash-share/${set}/hide`, { method: 'POST', user: u, body: { classId, hidden } });
const ids = r => (r.json.sets || []).map(x => x.id);
const newSet = (u = mia, items = ITEMS) => G.save(GAME.id, u.id, items, null, 'flashcards', { max: G.FLASH.ownSets }).id;
test.beforeEach(() => { RL._reset(); q.run('DELETE FROM flash_shares'); });

test('the switch: a student in a class gets their classes; a child, a guest and a teacher get no switch; off by default', async () => {
  const fi = await init(mia);
  assert.deepEqual(fi.flashShare, { classes: [{ id: cls.id, name: cls.name }], list: 'class' });
  assert.equal((await init(kid)).flashShare, undefined, 'a child on a family account is in no class');
  assert.equal((await init(auth.createGuest())).flashShare, undefined, 'a guest');
  assert.deepEqual((await init(teacher)).flashShare, { classes: [], list: 'students' }, 'a teacher sees what students shared');
  const id = newSet();
  const m = await mine(mia);
  assert.equal(m.status, 200); assert.deepEqual(m.json.classes, [{ id: cls.id, name: cls.name }]); assert.deepEqual(m.json.sets, {}, 'off by default');
  assert.deepEqual(FS.stateFor(mia, id), [{ id: cls.id, name: cls.name, on: false, hidden: false }]);
  assert.equal((await mine(kid)).json.classes.length, 0);
  assert.equal((await share(kid, newSet(kid), cls.id)).status, 404, 'a child has no class to share with');
  assert.equal((await list(leo)).json.sets.length, 0);
});

test('share and unshare: classmates and the class\'s teachers open, study and copy it; another class, a guest and signed out get 404', async () => {
  const id = newSet();
  const on = await share(mia, id, cls.id);
  assert.equal(on.status, 200, on.text); assert.deepEqual(on.json.classes, [{ id: cls.id, name: cls.name, on: true, hidden: false }]);
  // a classmate: the list, with the display name (as classmates see each other) and never the roster name
  const l = await list(leo);
  assert.deepEqual(ids(l), [id]); assert.equal(l.json.sets[0].by, MIA_SHOWN); assert.doesNotMatch(l.text, new RegExp(MIA_REAL));
  assert.equal(l.json.sets[0].className, cls.name); assert.equal(l.json.sets[0].items[0].c[0][0], 'magma');
  assert.deepEqual(ids(await list(mia)), [], 'not in the sharer\'s own "Shared by my class"');
  // the link opens it for a classmate (no code)
  const li = await init(leo, `?chapter=${id}&lock=1`);
  assert.equal(li.set.mine, false); assert.equal(li.set.shared.by, MIA_SHOWN); assert.equal(li.set.items[0].c.length, 3);
  assert.equal((await call(`${base}/sets/${id.slice(2)}`, { user: leo })).status, 404, 'the class code never opens it');
  // the class's teacher, and a co-teacher: the roster name
  const tl = await list(teacher);
  assert.deepEqual(ids(tl), [id]); assert.equal(tl.json.sets[0].by, MIA_REAL); assert.equal(tl.json.sets[0].canHide, true); assert.equal(tl.json.sets[0].hidden, false);
  assert.equal((await init(teacher, `?chapter=${id}&lock=1`)).set.shared.by, MIA_REAL);
  S.addToClass(boss, cls.id, teacher2.id, 'teacher');
  try { assert.deepEqual(ids(await list(teacher2)), [id], 'a co-teacher'); } finally { S.removeFromClass(boss, cls.id, teacher2.id); }
  // the teacher prints it: no class code or link on it
  const pr = await call(`${base}/print`, { method: 'POST', user: teacher, body: { doc: { t: 'Volcano words', c: ITEMS[0].c, as: 'cards', set: id } } });
  assert.equal(pr.status, 200); assert.doesNotMatch(pr.json.html, /chapter=/);
  // a classmate copies it into their own sets
  const copy = await call(`${base}/sets`, { method: 'POST', user: leo, body: { items: li.set.items } });
  assert.equal(copy.status, 200); assert.equal(G.get(GAME.id, copy.json.id).ownerId, leo.id);
  // nobody else: another class's student and teacher, a guest, signed out
  const guest = auth.createGuest();
  assert.deepEqual(ids(await list(zed)), []); assert.deepEqual(ids(await list(teacher2)), []);
  assert.equal((await init(zed, `?chapter=${id}&lock=1`)).set.missing, true);
  assert.equal((await init(teacher2, `?chapter=${id}&lock=1`)).set.missing, true);
  assert.equal((await init(guest, `?chapter=${id}&lock=1`)).set.missing, true);
  assert.equal((await init(null, `?chapter=${id}&lock=1`)).set.missing, true);
  assert.equal((await list(guest)).status, 404); assert.equal((await mine(guest)).status, 404);
  assert.equal((await list(null)).status, 401);
  assert.equal((await share(leo, id, cls.id)).status, 404, 'only the owner shares it');
  assert.equal((await share(zed, id, cls.id)).status, 404);
  // unshare: gone at once
  const off = await share(mia, id, cls.id, false);
  assert.equal(off.status, 200); assert.equal(off.json.classes[0].on, false);
  assert.deepEqual(ids(await list(leo)), []); assert.deepEqual(ids(await list(teacher)), []);
  assert.equal((await init(leo, `?chapter=${id}&lock=1`)).set.missing, true);
  // a teacher's own set is not shared this way (it has its class code and link)
  const tset = G.save(GAME.id, teacher.id, ITEMS, null, 'flashcards').id;
  assert.equal((await share(teacher, tset, cls.id)).status, 404);
});

test('several classes: the student picks; each class sees only what was shared with it', async () => {
  S.addToClass(boss, cls2.id, mia.id);
  try {
    assert.deepEqual((await init(mia)).flashShare.classes.map(c => c.id).sort(), [cls.id, cls2.id].sort());
    const id = newSet();
    assert.equal((await share(mia, id, cls2.id)).status, 200);
    assert.deepEqual(ids(await list(zed)), [id], 'the other class sees it');
    assert.deepEqual(ids(await list(teacher2)), [id]);
    assert.deepEqual(ids(await list(leo)), [], 'not shared with this class');
    assert.deepEqual(ids(await list(teacher)), []);
    assert.deepEqual((await mine(mia)).json.sets[id], [{ id: cls2.id, on: true, hidden: false }]);
    assert.equal((await share(mia, id, cls.id)).status, 200);
    assert.deepEqual(ids(await list(leo)), [id]);
    assert.deepEqual(FS.stateFor(mia, id).map(x => x.on), [true, true]);
    assert.equal((await share(mia, id, 'nOtAcLaSs1')).status, 404, 'a class they are not in');
  } finally { S.removeFromClass(boss, cls2.id, mia.id); }
});

test('leaving the class takes the share away for that class; coming back does not bring it back', async () => {
  const id = newSet();
  assert.equal((await share(mia, id, cls.id)).status, 200);
  assert.deepEqual(ids(await list(leo)), [id]);
  S.removeFromClass(teacher, cls.id, mia.id);
  try {
    assert.equal(q.get('SELECT COUNT(*) n FROM flash_shares WHERE owner_id=?', mia.id).n, 0);
    assert.deepEqual(ids(await list(leo)), []); assert.deepEqual(ids(await list(teacher)), []);
    assert.equal((await init(leo, `?chapter=${id}&lock=1`)).set.missing, true);
    assert.equal((await init(mia)).flashShare, undefined, 'no class, no switch');
    assert.equal((await share(mia, id, cls.id)).status, 404);
  } finally { S.addToClass(teacher, cls.id, mia.id); }
  assert.deepEqual(ids(await list(leo)), [], 'back in the class: still not shared');
  // the read path checks membership too (a row left behind by anything else is never shown)
  q.run('INSERT INTO flash_shares(set_id, class_id, owner_id, shared_at) VALUES (?,?,?,?)', id, cls.id, zed.id, Date.now());
  assert.deepEqual(ids(await list(leo)), [], 'a row whose owner is not the set\'s owner and not in the class');
});

test('deleting the set takes the share away at once', async () => {
  const id = newSet();
  assert.equal((await share(mia, id, cls.id)).status, 200);
  assert.equal((await call(`${base}/sets/${id}`, { method: 'DELETE', user: mia })).status, 200);
  assert.deepEqual(ids(await list(leo)), []);
  assert.equal(q.get('SELECT COUNT(*) n FROM flash_shares WHERE set_id=?', id).n, 0);
});

test('a teacher hides a shared set from the class: it stays the student\'s; the student sees it was hidden; shown again', async () => {
  const id = newSet();
  assert.equal((await share(mia, id, cls.id)).status, 200);
  assert.equal((await hide(leo, id, cls.id)).status, 404, 'a classmate cannot');
  assert.equal((await hide(teacher2, id, cls.id)).status, 404, 'another class\'s teacher cannot');
  assert.equal((await hide(auth.createGuest(), id, cls.id)).status, 404);
  const h = await hide(teacher, id, cls.id);
  assert.equal(h.status, 200, h.text); assert.equal(h.json.hidden, true);
  assert.deepEqual(ids(await list(leo)), [], 'off the class\'s list');
  assert.equal((await init(leo, `?chapter=${id}&lock=1`)).set.missing, true);
  const tl = await list(teacher);
  assert.deepEqual(ids(tl), [id]); assert.equal(tl.json.sets[0].hidden, true, 'the teacher still sees it, marked hidden');
  assert.equal(G.get(GAME.id, id).ownerId, mia.id, 'still the student\'s');
  assert.deepEqual((await mine(mia)).json.sets[id], [{ id: cls.id, on: false, hidden: true }], 'the student sees it was hidden');
  const again = await share(mia, id, cls.id);
  assert.equal(again.status, 409); assert.equal(again.json.code, 'hidden', 'turning it on again does not undo the teacher\'s choice');
  assert.equal((await init(mia, `?chapter=${id}&lock=1`)).set.mine, true, 'the student still opens their own set');
  assert.equal((await hide(teacher, id, cls.id, false)).json.hidden, false);
  assert.deepEqual(ids(await list(leo)), [id], 'shown again');
});

test('safety: sharing runs the text filter again, leaves pictures and links off, and nothing names the student to the AI', async () => {
  // a set saved before a filter change (written straight into the table): sharing checks it again
  const bad = newSet();
  q.run('UPDATE game_sets SET items=? WHERE id=?', JSON.stringify([{ t: 'Mine', c: [['shit', 'a bad word', ''], ['ok', 'fine', '']], a: 't' }]), bad);
  const r = await share(mia, bad, cls.id);
  assert.equal(r.status, 400); assert.equal(r.json.code, 'bad');
  const link = newSet();
  q.run('UPDATE game_sets SET items=? WHERE id=?', JSON.stringify([{ t: 'Mine', c: [['site', 'go to www.example.com', ''], ['ok', 'fine', '']], a: 't' }]), link);
  assert.equal((await share(mia, link, cls.id)).status, 400, 'no links');
  // pictures: a student has none; even a ref in the table is left off what others see
  const pic = newSet();
  q.run('UPDATE game_sets SET items=? WHERE id=?', JSON.stringify([{ t: 'Pets', c: [['cat', 'a pet', 'img:Abc123def456ghi7'], ['dog', 'a pet', '🐶', 'img:Abc123def456ghi8']], a: 't' }]), pic);
  assert.equal((await share(mia, pic, cls.id)).status, 200);
  const seen = (await list(leo)).json.sets.find(x => x.id === pic);
  assert.deepEqual(seen.items[0].c, [['cat', 'a pet', ''], ['dog', 'a pet', '🐶']]);
  assert.doesNotMatch(JSON.stringify((await init(leo, `?chapter=${pic}&lock=1`)).set), /img:/);
  // a set that stops passing the filter later is not shown
  q.run('UPDATE game_sets SET items=? WHERE id=?', JSON.stringify([{ t: 'Pets', c: [['shit', 'a pet', ''], ['dog', 'a pet', '']], a: 't' }]), pic);
  assert.deepEqual(ids(await list(leo)), []);
  // the copy a classmate saves carries no name: the title is the set's own
  assert.equal(FS.sharedItems(ITEMS)[0].t, 'Volcano words');
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'server/services/flash-share.js'), 'utf8'), /set-ai|ai-call|anthropic/i, 'no AI in sharing');
});

test('the teacher\'s page for one student lists the flashcards they shared with the class', async () => {
  const id = newSet();
  assert.equal((await share(mia, id, cls.id)).status, 200);
  const p = await call(`/class/${cls.id}/student/${mia.id}`, { user: teacher });
  assert.equal(p.status, 200); assert.match(p.text, /id="sp-flash"/); assert.match(p.text, /Volcano words/); assert.match(p.text, new RegExp(`chapter=${id}`));
  const other = await call(`/class/${cls.id}/student/${leo.id}`, { user: teacher });
  assert.doesNotMatch(other.text, /id="sp-flash"/, 'nothing for a student who shared nothing');
});
